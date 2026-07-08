import { BoolExp, EntityInstance, RelationInstance, DictionaryInstance, Property, EventSourceInstance } from "@core";
import { MatchExp } from "@storage";
import { ComputationState, RecordMutationEvent, System, SystemCallback, SystemLogger } from "./System.js";
import './computations/index.js';
import { Computation, ComputationResult, ComputationResultSkip, ComputationResultPatch, DataContext, EntityDataContext, PropertyDataContext, RelationDataContext } from "./computations/Computation.js";
import { Scheduler } from "./Scheduler.js";
import { CountHandles } from "./computations/Count.js";
import { TransformHandles } from "./computations/Transform.js";
import { AnyHandles } from "./computations/Any.js";
import { EveryHandles } from "./computations/Every.js";
import { WeightedSummationHandles } from "./computations/WeightedSummation.js";
import { SummationHandles } from "./computations/Summation.js";
import { AverageHandles } from "./computations/Average.js";
import { RealTimeHandles } from "./computations/RealTime.js";
import { StateMachineHandles } from "./computations/StateMachine.js";
import { CustomHandles } from "./computations/Custom.js";
import { ScopedSequenceHandles } from "./computations/ScopedSequence.js";
import { SideEffectError } from "./errors/index.js";
import { assert } from "./util.js";
import { asyncEffectsContext } from "./asyncEffectsContext.js";
import { NestedDispatchError, RequireSerializableRetry, runWithTransactionRetry } from "./transaction.js";
import { AsyncLocalStorage } from "node:async_hooks";
import {
    addComputationTakeoverReview,
    addEmptyFactRecordRemovalReview,
    assertApprovedEmptyFactRecordRemovalsStillEmpty,
    addMissingRebuildHandlerRequirements,
    addScopedSequenceNoSeedReview,
    assertComputationTakeoverAllowed,
    assertDestructiveScopeAllowed,
    assertScopedSequenceNoSeedDecisions,
    buildAffectedRebuildPlan,
    buildMigrationDiff,
    createEmptyFactRecordRemovalOperations,
    createPlanBlockingMessages,
    createMigrationReadHandle,
    createMigrationManifest,
    getApprovedEmptyFactRecordRemovals,
    getChangedComputationsFromApprovedDiff,
    backfillNewFactPropertyDefaults,
    getDestructiveDeletionScope,
    getNewFactPropertyBackfills,
    getNewFilteredDataContexts,
    getRecomputeBlockingChanges,
    getScopedSequenceNoSeedOperations,
    getScopedSequenceSeedOperations,
    getStorageBlockingChanges,
    GenerateMigrationDiffOptions,
    hashMigrationDiff,
    MIGRATION_MANIFEST_CURRENT_KEY,
    MIGRATION_MANIFEST_CONCEPT,
    MigrationBaselineError,
    MigrationDiffFile,
    MigrationOptions,
    MigrationPhase,
    MigrationRunState,
    MigrationPlan,
    MigrationSchemaPlan,
    assertManifestGeneratorCurrent,
    readMigrationManifest,
    recomputeChangedComputations,
    recomputeFilteredMemberships,
    seedScopedSequenceInitializers,
    SetupOptions,
    validateApprovedDiff,
    writeMigrationManifest,
} from "./migration.js";

export const USER_ENTITY = 'User'

export interface IRecordMutationSideEffect<T> {
    name: string;
    record: { name: string };
    content: (this: Controller, event: RecordMutationEvent) => Promise<T>;
}

export class RecordMutationSideEffect<T> implements IRecordMutationSideEffect<T> {
    name: string;
    record: { name: string };
    content: (this: Controller, event: RecordMutationEvent) => Promise<T>;

    constructor(data: IRecordMutationSideEffect<T>) {
        this.name = data.name;
        this.record = data.record;
        this.content = data.content;
    }

    static create<T>(data: IRecordMutationSideEffect<T>): RecordMutationSideEffect<T> {
        return new RecordMutationSideEffect<T>(data);
    }
}

export type InteractionContext = {
    logContext?: unknown
    [k: string]: unknown
}

export type ComputationType = 'global' | 'entity' | 'relation' | 'property'

type SideEffectResult = {
    result?: unknown,
    error?: unknown
}

export type DispatchResponse = {
    error?: unknown
    data?: unknown
    effects?: RecordMutationEvent[]
    sideEffects?: { [k: string]: SideEffectResult }
    context?: { [k: string]: unknown }
}

export interface ControllerOptions {
    system: System
    entities?: EntityInstance[]
    relations?: RelationInstance[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous collection of different event source types
    eventSources?: EventSourceInstance<any, any>[]
    dict?: DictionaryInstance[]
    recordMutationSideEffects?: RecordMutationSideEffect<unknown>[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    computations?: (new (...args: any[]) => Computation)[]
    ignoreGuard?: boolean
    forceThrowDispatchError?: boolean
}

export const HARD_DELETION_PROPERTY_NAME = '_isDeleted_'

type DispatchExecutionContext = {
    eventSourceName?: string
}

const dispatchExecutionContext = new AsyncLocalStorage<DispatchExecutionContext>()

export const HardDeletionProperty = {
    create() {
        return Property.create({
            name: HARD_DELETION_PROPERTY_NAME,
            type: 'boolean',
        })
    }
}

export class Controller {
    public recordNameToSideEffects = new Map<string, Set<RecordMutationSideEffect<unknown>>>()
    public globals = {
        BoolExp,
        MatchExp
    }
    public scheduler: Scheduler
    public system: System
    public entities: EntityInstance[]
    public relations: RelationInstance[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous collection
    public eventSources: EventSourceInstance<any, any>[]
    public dict: DictionaryInstance[] = []
    public recordMutationSideEffects: RecordMutationSideEffect<unknown>[] = []
    public ignoreGuard: boolean
    public forceThrowDispatchError: boolean

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private eventSourcesByName = new Map<string, EventSourceInstance<any, any>>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private eventSourcesByUUID = new Map<string, EventSourceInstance<any, any>>()

    constructor(options: ControllerOptions) {
        const {
            system,
            entities = [],
            relations = [],
            eventSources = [],
            dict = [],
            recordMutationSideEffects = [],
            computations = [],
            ignoreGuard = false,
            forceThrowDispatchError = false,
        } = options
        
        this.system = system
        this.ignoreGuard = ignoreGuard
        this.forceThrowDispatchError = forceThrowDispatchError
        this.entities = [...entities]
        this.relations = [...relations]
        this.dict = [...dict]
        this.recordMutationSideEffects = [...recordMutationSideEffects]

        this.eventSources = [...eventSources]

        for (const es of this.eventSources) {
            if (es.name) {
                this.eventSourcesByName.set(es.name, es)
            }
            this.eventSourcesByUUID.set(es.uuid, es)
        }

        const registeredRecordNames = new Set(this.entities.map(e => e.name))
        for (const es of this.eventSources) {
            if (es.entity && es.entity.name && !registeredRecordNames.has(es.entity.name)) {
                this.entities.push(es.entity)
                registeredRecordNames.add(es.entity.name)
            }
        }

        const allComputationHandles = [
            ...CountHandles,
            ...TransformHandles,
            ...AnyHandles,
            ...EveryHandles,
            ...WeightedSummationHandles,
            ...SummationHandles,
            ...AverageHandles,
            ...RealTimeHandles,
            ...StateMachineHandles,
            ...CustomHandles,
            ...ScopedSequenceHandles,
            ...computations
        ]
        
        this.scheduler = new Scheduler(this, this.entities, this.relations, this.dict, allComputationHandles)

        recordMutationSideEffects.forEach(sideEffect => {
          let sideEffects = this.recordNameToSideEffects.get(sideEffect.record.name)
          if (!sideEffects) {
              this.recordNameToSideEffects.set(sideEffect.record.name, sideEffects = new Set())
          }
          sideEffects.add(sideEffect)
        })

    }
    
    async setup(options?: boolean | SetupOptions) {
        const install = typeof options === 'boolean' ? options : options?.install === true
        const migrateOptions = typeof options === 'object' ? options.migrate : undefined
        if (migrateOptions) {
            if (migrateOptions === true) {
                throw new Error('setup({ migrate: true }) is no longer supported. Generate and approve a migration diff, then call setup({ migrate: { approvedDiff } }).')
            }
            await this.migrate(migrateOptions)
            return
        }

        const states = this.scheduler.createStates()
        const internalRequirements = this.scheduler.createInternalSchemaRequirements()
        if (!install) {
            const migrationSystem = this.system as System & {
                prepareMigrationSchema?: System['prepareMigrationSchema']
            }
            const prepareMigrationSchema = migrationSystem.prepareMigrationSchema
            if (typeof prepareMigrationSchema !== 'function') {
                throw new Error('Current system does not support migration manifest validation')
            }
            const schemaPlan = await prepareMigrationSchema.call(migrationSystem, this.entities, this.relations, states, { internalRequirements })
            const nextManifest = createMigrationManifest(this, schemaPlan.schema)
            const previousManifest = await readMigrationManifest(this)
            if (previousManifest) {
                assertManifestGeneratorCurrent(previousManifest)
            }
            if (previousManifest && previousManifest.modelHash !== nextManifest.modelHash) {
                throw new Error(`Model manifest mismatch. Call controller.generateMigrationDiff(), review it, then call controller.migrate({ approvedDiff }). Manifest key: ${MIGRATION_MANIFEST_CONCEPT}/${MIGRATION_MANIFEST_CURRENT_KEY}`)
            }
            if (!previousManifest && await this.system.hasExistingData?.()) {
                throw new MigrationBaselineError('Existing database has no migration manifest. Call controller.createMigrationBaseline() before normal setup or migration.')
            }
            await this.system.setup(this.entities, this.relations, states, { install, internalRequirements })
            await this.scheduler.setup(install)
            return
        }
        await this.system.setup(this.entities, this.relations, states, { install, internalRequirements })
        const nextManifest = createMigrationManifest(this)
        await this.scheduler.setup(install)
        if (install) {
            await writeMigrationManifest(this, nextManifest)
        }
    }

    // Recovery path for a migration process that died without releasing the
    // bookkeeping lock. Only call after confirming no migration is running.
    async forceReleaseMigrationLock() {
        const migrationSystem = this.system as System & {
            releaseMigrationLock?: () => Promise<void>
        }
        assert(typeof migrationSystem.releaseMigrationLock === 'function', 'Current system does not support migration lock release')
        await migrationSystem.releaseMigrationLock!()
    }

    async createMigrationBaseline() {
        const states = this.scheduler.createStates()
        const internalRequirements = this.scheduler.createInternalSchemaRequirements()
        const migrationSystem = this.system as System & {
            prepareMigrationSchema: NonNullable<System['prepareMigrationSchema']>
        }
        assert(typeof migrationSystem.prepareMigrationSchema === 'function', 'Current system does not support migration baseline')
        const schemaPlan = await migrationSystem.prepareMigrationSchema(this.entities, this.relations, states, { internalRequirements })
        if (schemaPlan.preRecomputeDDL.length > 0 || schemaPlan.blockingChanges.length > 0) {
            throw new MigrationBaselineError('Cannot create migration baseline because current definitions do not match the existing schema', {
                missingDDL: schemaPlan.preRecomputeDDL,
                blockingChanges: schemaPlan.blockingChanges,
            })
        }
        const manifest = createMigrationManifest(this, schemaPlan.schema)
        await writeMigrationManifest(this, manifest)
        return manifest
    }

    private async prepareMigrationContext(options: { includeFunctionText?: boolean } = {}) {
        const states = this.scheduler.createStates()
        const internalRequirements = this.scheduler.createInternalSchemaRequirements()
        const migrationSystem = this.system as System & {
            prepareMigrationSchema: NonNullable<System['prepareMigrationSchema']>
        }
        assert(typeof migrationSystem.prepareMigrationSchema === 'function', 'Current system does not support schema migration planning')
        const schemaPlan = await migrationSystem.prepareMigrationSchema(this.entities, this.relations, states, { internalRequirements })
        const previousManifest = await readMigrationManifest(this)
        if (!previousManifest) {
            throw new MigrationBaselineError('Migration baseline manifest not found. Run setup(true) with the current framework first or createMigrationBaseline().')
        }
        assertManifestGeneratorCurrent(previousManifest)
        const nextManifest = createMigrationManifest(this, schemaPlan.schema, { includeFunctionText: options.includeFunctionText === true })
        return { states, migrationSystem, schemaPlan, previousManifest, nextManifest }
    }

    private async buildCurrentMigrationDiff(
        schemaPlan: MigrationSchemaPlan,
        previousManifest: ReturnType<typeof createMigrationManifest>,
        nextManifest: ReturnType<typeof createMigrationManifest>,
        options: GenerateMigrationDiffOptions = {},
    ): Promise<MigrationDiffFile> {
        const provisionalChangedComputations = nextManifest.computations.filter(next =>
            !previousManifest.computations.some(previous => previous.id === next.id && previous.signature === next.signature)
        )
        const changedDataContexts = getNewFilteredDataContexts(previousManifest, nextManifest)
        const provisionalRebuildPlan = buildAffectedRebuildPlan(
            previousManifest,
            nextManifest,
            provisionalChangedComputations,
            changedDataContexts,
            { outputChangedIds: new Set(provisionalChangedComputations.map(item => item.id)) },
        )
        const storageBlockingChanges = getStorageBlockingChanges(previousManifest, nextManifest)
        const readHandle = createMigrationReadHandle(this, schemaPlan)
        const destructiveScopes = options.includeDestructiveScope === true
            ? await getDestructiveDeletionScope(this, provisionalRebuildPlan, previousManifest, readHandle)
            : []
        const safety = {
            blockingChanges: [
                ...schemaPlan.blockingChanges,
                ...storageBlockingChanges,
            ],
            destructiveScopes,
        }
        const takeoverDiff = await addComputationTakeoverReview(this, buildMigrationDiff(previousManifest, nextManifest, schemaPlan, safety), previousManifest, nextManifest, readHandle)
        const cleanupDiff = await addEmptyFactRecordRemovalReview(this, takeoverDiff, previousManifest, nextManifest)
        const scopedSequenceDiff = await addScopedSequenceNoSeedReview(this, cleanupDiff, previousManifest, nextManifest, readHandle)
        return addMissingRebuildHandlerRequirements(scopedSequenceDiff, this, provisionalRebuildPlan)
    }

    async generateMigrationDiff(options: GenerateMigrationDiffOptions = {}): Promise<MigrationDiffFile> {
        const { schemaPlan, previousManifest, nextManifest } = await this.prepareMigrationContext({
            includeFunctionText: options.includeFunctionText === true,
        })
        return this.buildCurrentMigrationDiff(schemaPlan, previousManifest, nextManifest, options)
    }

    async migrate(options: MigrationOptions = {}): Promise<MigrationPlan> {
        const migrationOptions: MigrationOptions = { ...options }
        const context = await this.prepareMigrationContext()
        const migrationSystem = context.migrationSystem as System & {
            applyMigrationSchema: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
            verifyMigrationSchema?: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
            applyMigrationPostSchema?: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
            beginMigration?: (modelHash: string, approvedDiffHash?: string, approvedDiffSummary?: unknown, decisionCount?: number) => Promise<MigrationRunState>
            updateMigrationPhase?: (migrationId: string, phase: Exclude<MigrationPhase, 'pending' | 'succeeded' | 'failed'>) => Promise<void>
            finishMigration?: (migrationId: string, status: 'succeeded' | 'failed', error?: unknown) => Promise<void>
            isMigrationOperationComplete?: (migrationId: string | undefined, operationKey: string) => Promise<boolean>
            markMigrationOperationComplete?: (migrationId: string | undefined, operationKey: string) => Promise<void>
        }
        assert(typeof migrationSystem.applyMigrationSchema === 'function', 'Current system does not support schema migration application')
        const { schemaPlan, previousManifest, nextManifest } = context
        const expectedDiff = await this.buildCurrentMigrationDiff(schemaPlan, previousManifest, nextManifest, { includeDestructiveScope: false })
        validateApprovedDiff(migrationOptions.approvedDiff, previousManifest, nextManifest, migrationOptions.handlers, expectedDiff)
        const approvedDiff = migrationOptions.approvedDiff!
        const approvedDiffHash = hashMigrationDiff(approvedDiff)
        const scopedSequenceSeedOperations = getScopedSequenceSeedOperations(approvedDiff)
        const scopedSequenceNoSeedOperations = getScopedSequenceNoSeedOperations(approvedDiff)
        const approvedPlanning = getChangedComputationsFromApprovedDiff(previousManifest, nextManifest, approvedDiff)
        const changedComputations = approvedPlanning.changedComputations
        const changedDataContexts = getNewFilteredDataContexts(previousManifest, nextManifest)
        const rebuildPlan = buildAffectedRebuildPlan(previousManifest, nextManifest, changedComputations, changedDataContexts, {
            outputChangedIds: approvedPlanning.outputChangedIds,
            stateOnlyIds: approvedPlanning.stateOnlyIds,
        })
        const approvedEmptyFactRecordRemovals = await getApprovedEmptyFactRecordRemovals(this, migrationOptions.approvedDiff, previousManifest)
        const emptyFactRecordRemovalOperations = createEmptyFactRecordRemovalOperations(previousManifest, approvedEmptyFactRecordRemovals)
        const executionSchemaPlan = {
            ...schemaPlan,
            postRecomputeDDL: [
                ...schemaPlan.postRecomputeDDL,
                ...emptyFactRecordRemovalOperations,
            ],
        }
        const storageBlockingChanges = getStorageBlockingChanges(previousManifest, nextManifest)
            .filter(change => !(change.kind === 'unsupported-destructive-schema-change' && approvedEmptyFactRecordRemovals.has(change.logicalPath)))
        const recomputeBlockingChanges = getRecomputeBlockingChanges(
            this,
            rebuildPlan,
            migrationOptions,
            previousManifest,
        )
        const allBlockingChanges = [
            ...schemaPlan.blockingChanges,
            ...storageBlockingChanges,
            ...approvedPlanning.blocking,
            ...recomputeBlockingChanges,
        ]
        const blockingChanges = createPlanBlockingMessages(allBlockingChanges)
        const readHandle = createMigrationReadHandle(this, schemaPlan)
        const deletionScope = await getDestructiveDeletionScope(this, rebuildPlan, previousManifest, readHandle)
        assertDestructiveScopeAllowed(migrationOptions, deletionScope)
        await assertComputationTakeoverAllowed(this, migrationOptions, previousManifest, readHandle)
        await assertScopedSequenceNoSeedDecisions(this, migrationOptions.approvedDiff, previousManifest, readHandle)
        const factPropertyBackfills = getNewFactPropertyBackfills(this, previousManifest, nextManifest)
        const plan: MigrationPlan = {
            mode: 'compute',
            dryRun: migrationOptions.dryRun === true,
            changedComputations,
            rebuildPlan,
            scopedSequenceSeedOperations,
            scopedSequenceNoSeedOperations,
            factPropertyBackfills,
            schemaPlan: {
                schema: executionSchemaPlan.schema,
                preRecomputeDDL: executionSchemaPlan.preRecomputeDDL,
                postRecomputeDDL: executionSchemaPlan.postRecomputeDDL,
                verificationDDL: executionSchemaPlan.verificationDDL,
                blockingChanges: allBlockingChanges,
            },
            blockingChanges,
            deletionScope,
            approvedDiffHash,
        }

        if (plan.dryRun) return plan
        if (blockingChanges.length) {
            throw new Error(`Migration plan has blocking changes:\n${blockingChanges.join('\n')}`)
        }

        let migrationRun: MigrationRunState | undefined
        const reached = (phase: MigrationPhase, target: MigrationPhase) => {
            const order: MigrationPhase[] = ['pending', 'schema-applied', 'computation-applied', 'constraints-applied', 'manifest-written', 'succeeded']
            return order.indexOf(phase) >= order.indexOf(target)
        }
        try {
            migrationRun = await migrationSystem.beginMigration?.(
                nextManifest.modelHash,
                approvedDiffHash,
                approvedDiff.summary,
                approvedDiff.decisions.length,
            )
            const phase = migrationRun?.phase || 'pending'
            if (!reached(phase, 'schema-applied')) {
                await migrationSystem.applyMigrationSchema(executionSchemaPlan, migrationRun?.id)
                if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'schema-applied')
            }
            if (!reached(phase, 'manifest-written')) {
                await this.system.storage.runInTransaction({ name: 'migration recompute', isolation: 'SERIALIZABLE' }, async () => {
                    if (!reached(phase, 'computation-applied')) {
                        await backfillNewFactPropertyDefaults(this, factPropertyBackfills)
                        const filteredEvents = await recomputeFilteredMemberships(this, previousManifest, nextManifest)
                        await assertComputationTakeoverAllowed(this, migrationOptions, previousManifest)
                        await recomputeChangedComputations(this, rebuildPlan, migrationOptions, filteredEvents, previousManifest)
                        await seedScopedSequenceInitializers(this, approvedDiff, previousManifest)
                        if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'computation-applied')
                    }
                    if (!reached(phase, 'constraints-applied')) {
                        await assertApprovedEmptyFactRecordRemovalsStillEmpty(this, migrationOptions.approvedDiff, previousManifest)
                        await migrationSystem.verifyMigrationSchema?.(executionSchemaPlan, migrationRun?.id)
                        await migrationSystem.applyMigrationPostSchema?.(executionSchemaPlan, migrationRun?.id)
                        if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'constraints-applied')
                    }
                    const manifestOperationKey = `manifest:current:${nextManifest.modelHash}:${approvedDiffHash}`
                    const manifestAlreadyWritten = await migrationSystem.isMigrationOperationComplete?.(migrationRun?.id, manifestOperationKey)
                    if (!manifestAlreadyWritten) {
                        await writeMigrationManifest(this, nextManifest)
                        await migrationSystem.markMigrationOperationComplete?.(migrationRun?.id, manifestOperationKey)
                    }
                    if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'manifest-written')
                })
            }
            await this.scheduler.setup(false)
            if (migrationRun) await migrationSystem.finishMigration?.(migrationRun.id, 'succeeded')
        } catch (error) {
            if (migrationRun) await migrationSystem.finishMigration?.(migrationRun.id, 'failed', error)
            throw error
        }
        return plan
    }
    
    async retrieveLastValue(dataContext: DataContext, record?: Record<string, unknown>) {
        if (dataContext.type === 'global') {
            return this.system.storage.dict.get(dataContext.id.name)
        } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
            return this.system.storage.find(dataContext.id.name!, undefined, undefined, ['*'])
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (record![propertyDataContext.id.name]) return record![propertyDataContext.id.name]

            const item = await this.system.storage.findOne(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), undefined, ['*'])
            return item[propertyDataContext.id.name]
        }
    }
    async applyResult(dataContext: DataContext, result: unknown, record?: Record<string, unknown>) {
        if (result instanceof ComputationResultSkip) return

        if (dataContext.type === 'global') {
            return this.system.storage.dict.set(dataContext.id.name, result)
        } else if (dataContext.type === 'entity') {
            if (result === undefined || result === null) return
            if (this.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry('entity replace result')
            }
            const entityContext = dataContext as EntityDataContext
            await this.system.storage.delete(entityContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}))
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(entityContext.id.name!, item)
            }
        } else if (dataContext.type === 'relation') {
            if (result === undefined || result === null) return
            if (this.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry('relation replace result')
            }
            const relationContext = dataContext as RelationDataContext
            await this.system.storage.delete(relationContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}))
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(relationContext.id.name!, item)
            }
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (propertyDataContext.id.name === HARD_DELETION_PROPERTY_NAME && result) {
                await this.system.storage.delete(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}))
            } else {
                await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: result})
            }
        }   
    }
    /**
     * Apply a property computation's initial value to a freshly created record.
     *
     * The initial value is part of the record's creation semantics, not a business update:
     * the write goes through the internal write path (the host record's own update event is
     * neither dispatched to mutation listeners nor added to effects), so computations that
     * listen to the host record's update events (e.g. StateMachine transfers) are not
     * spuriously triggered by it. The written field values — including any recomputed
     * `computed` properties — are folded back into `record` (the create mutation event's
     * record), so downstream consumers observe the initial value as part of the create event.
     * Derived events (e.g. filtered-entity membership changes) are still dispatched normally.
     */
    async applyInitialValue(dataContext: PropertyDataContext, result: unknown, record: Record<string, unknown>) {
        if (result instanceof ComputationResultSkip) return

        if (dataContext.id.name === HARD_DELETION_PROPERTY_NAME && result) {
            await this.system.storage.delete(dataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}))
            return
        }
        const events: RecordMutationEvent[] = []
        await this.system.storage.updateInternal(dataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[dataContext.id.name]: result}, events)
        for (const event of events) {
            if (event.type === 'update' && event.recordName === dataContext.host.name && event.record?.id === record.id) {
                Object.assign(record, event.record)
            }
        }
    }
    async applyResultPatch(dataContext: DataContext, patch: ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined, record?: Record<string, unknown>) {
        if (patch instanceof ComputationResultSkip||patch === undefined) return

        const patches = Array.isArray(patch) ? patch : [patch]
        for(const patch of patches) {
                if (dataContext.type === 'global') {
                    await this.system.storage.dict.set(dataContext.id.name, patch)
            } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
                const erDataContext = dataContext as EntityDataContext|RelationDataContext
                if (patch.type === 'insert') {  
                    await this.system.storage.create(erDataContext.id.name!, patch.data)
                } else if (patch.type === 'update') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.update(erDataContext.id.name!, match, patch.data)
                } else if (patch.type === 'delete') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.delete(erDataContext.id.name!, match)
                }
            } else {
                const propertyDataContext = dataContext as PropertyDataContext

                if (propertyDataContext.id.name === HARD_DELETION_PROPERTY_NAME && patch.data) {
                    assert(patch.type !== 'delete', 'Hard deletion property cannot be deleted')
                    await this.system.storage.delete(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}))
                } else {
                    if (patch.type === 'insert') {
                        await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: patch.data})
                    } else if (patch.type === 'update') {
                        await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: patch.data})
                    } else if (patch.type === 'delete') {
                        await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: null})
                    }
                }

                
            }
        }
    }
    callbacks: Map<string, Set<SystemCallback>> = new Map()

    private cloneDispatchArgs<TArgs>(args: TArgs): TArgs {
        if (!args || typeof args !== 'object') return args
        const cloned = { ...(args as Record<string, unknown>) }
        if (cloned.payload && typeof cloned.payload === 'object') {
            cloned.payload = { ...(cloned.payload as Record<string, unknown>) }
        }
        if (cloned.user && typeof cloned.user === 'object') {
            cloned.user = { ...(cloned.user as Record<string, unknown>) }
        }
        return cloned as TArgs
    }

    /**
     * Unified dispatch API for all event source types.
     * First parameter is an object reference to the event source, second is the event args.
     *
     * A dispatch is the framework's synchronous fact transaction boundary:
     * guard, mapEventData, event record creation, resolve, synchronous computations,
     * and afterDispatch all run inside one retryable storage transaction attempt.
     * If any of those steps fails, the attempt is rolled back and postCommit plus
     * record mutation side effects are skipped. After a successful commit,
     * postCommit and record mutation side effects run outside the transaction;
     * their failures are reported in sideEffects without rolling back committed facts.
     */
    async dispatch<TArgs = unknown, TResult = unknown>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        args: TArgs
    ): Promise<DispatchResponse> {
        assert(!!eventSource, 'eventSource is required for dispatch')
        const activeDispatch = dispatchExecutionContext.getStore()
        if (activeDispatch) {
            throw new NestedDispatchError({
                outerEventSourceName: activeDispatch.eventSourceName,
                nestedEventSourceName: eventSource.name,
            })
        }
        let result: DispatchResponse
        try {
            result = await runWithTransactionRetry(eventSource.name || 'dispatch', async (isolation) => {
                const attemptArgs = this.cloneDispatchArgs(args)
                const effectsContext = { effects: [] as RecordMutationEvent[] }
                return asyncEffectsContext.run(effectsContext, async () => {
                    return this.system.storage.runInTransaction({ name: eventSource.name, isolation }, async () => {
                        return dispatchExecutionContext.run({ eventSourceName: eventSource.name }, async () => {
                            if (!this.ignoreGuard && eventSource.guard) {
                                await eventSource.guard.call(this, attemptArgs)
                            }
                            
                            const eventData = eventSource.mapEventData
                                ? await eventSource.mapEventData(attemptArgs)
                                : {}
                                
                            await this.system.storage.create(eventSource.entity.name!, eventData)
                            
                            let data: unknown = undefined
                            if (eventSource.resolve) {
                                data = await eventSource.resolve.call(this, attemptArgs)
                            }
                            
                            let context: Record<string, unknown> | undefined = undefined
                            if (eventSource.afterDispatch) {
                                const afterResult = await (eventSource.afterDispatch as Function).call(this, attemptArgs, { data })
                                if (afterResult) {
                                    context = afterResult
                                }
                            }
                            
                            return { data, effects: effectsContext.effects, sideEffects: {}, context }
                        })
                    })
                })
            })
        } catch (e) {
            if (this.forceThrowDispatchError) throw e
            result = {
                error: e,
                effects: [],
                sideEffects: {}
            }
        }

        if (!result.error) {
            await this.runPostCommitHook(eventSource, args, result, this.system.logger)
            await this.runRecordChangeSideEffects(result, this.system.logger)
        }

        return result
    }

    async runPostCommitHook<TArgs = unknown, TResult = unknown>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        args: TArgs,
        result: DispatchResponse,
        logger: SystemLogger
    ) {
        if (!eventSource.postCommit) return
        try {
            const postCommitContext = await eventSource.postCommit.call(this, args, {
                data: result.data as TResult,
                context: result.context,
            })
            if (postCommitContext) {
                result.context = {
                    ...(result.context || {}),
                    ...postCommitContext,
                }
            }
        } catch (e) {
            const sideEffectError = new SideEffectError(
                `Post-commit hook '${eventSource.name}' failed`,
                {
                    sideEffectName: eventSource.name,
                    recordName: eventSource.entity.name,
                    context: {
                        eventSourceName: eventSource.name,
                    },
                    causedBy: e instanceof Error ? e : new Error(String(e))
                }
            )
            logger.error({label: "postCommit", message: eventSource.name, error: sideEffectError})
            result.sideEffects!.__postCommit = {
                error: sideEffectError,
            }
        }
    }

    async runRecordChangeSideEffects(result: DispatchResponse, logger: SystemLogger) {
        const mutationEvents = result.effects as RecordMutationEvent[]
        for(let event of mutationEvents || []) {
            const sideEffects = this.recordNameToSideEffects.get(event.recordName)
            if (sideEffects) {
                for(let sideEffect of sideEffects) {
                    try {
                        result.sideEffects![sideEffect.name] = {
                            result: await sideEffect.content.call(this, event),
                        }
                      
                    } catch (e){
                        
                        const sideEffectError = new SideEffectError(
                            `Side effect '${sideEffect.name}' failed for ${event.type} on ${event.recordName}`,
                            {
                                sideEffectName: sideEffect.name,
                                recordName: event.recordName,
                                mutationType: event.type,
                                recordId: event.record?.id,
                                context: {
                                    record: event.record,
                                    oldRecord: event.oldRecord,
                                    keys: event.keys
                                },
                                causedBy: e instanceof Error ? e : new Error(String(e))
                            }
                        )
                        
                        logger.error({label: "recordMutationSideEffect", message: sideEffect.name, error: sideEffectError})
                        result.sideEffects![sideEffect.name] = {
                            error: sideEffectError
                        }
                    }
                }
            }
        }
    }
    addEventListener(eventName: string, callback: SystemCallback) {
        if (!this.callbacks.has(eventName)) {
            this.callbacks.set(eventName, new Set());
        }
        this.callbacks.get(eventName)!.add(callback);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findEventSourceByName(name: string): EventSourceInstance<any, any> | undefined {
        return this.eventSourcesByName.get(name)
    }
}
