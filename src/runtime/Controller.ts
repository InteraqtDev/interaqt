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
import { SideEffectError } from "./errors/index.js";
import { assert } from "./util.js";
import { asyncEffectsContext } from "./asyncEffectsContext.js";
import { NestedDispatchError, RequireSerializableRetry, runWithTransactionRetry } from "./transaction.js";
import { AsyncLocalStorage } from "node:async_hooks";
import {
    buildAffectedRebuildPlan,
    createPlanBlockingMessages,
    createMigrationManifest,
    getChangedComputations,
    getDestructiveDeletionScope,
    getNewFilteredDataContexts,
    getRecomputeBlockingChanges,
    getStorageBlockingChanges,
    MIGRATION_MANIFEST_CURRENT_KEY,
    MIGRATION_MANIFEST_CONCEPT,
    MigrationBaselineError,
    MigrationOptions,
    MigrationPhase,
    MigrationRunState,
    MigrationPlan,
    MigrationSchemaPlan,
    readMigrationManifest,
    recomputeChangedComputations,
    recomputeFilteredMemberships,
    SetupOptions,
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
            await this.migrate(migrateOptions === true ? {} : migrateOptions)
            return
        }

        const states = this.scheduler.createStates()
        if (!install) {
            const migrationSystem = this.system as System & {
                prepareMigrationSchema?: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[]) => Promise<MigrationSchemaPlan>
            }
            const prepareMigrationSchema = migrationSystem.prepareMigrationSchema
            if (typeof prepareMigrationSchema !== 'function') {
                throw new Error('Current system does not support migration manifest validation')
            }
            const schemaPlan = await prepareMigrationSchema.call(migrationSystem, this.entities, this.relations, states)
            const nextManifest = createMigrationManifest(this, schemaPlan.schema)
            const previousManifest = await readMigrationManifest(this)
            if (previousManifest && previousManifest.modelHash !== nextManifest.modelHash) {
                throw new Error(`Model manifest mismatch. Call controller.migrate() before normal setup. Manifest key: ${MIGRATION_MANIFEST_CONCEPT}/${MIGRATION_MANIFEST_CURRENT_KEY}`)
            }
            if (!previousManifest && await this.system.hasExistingData?.()) {
                throw new MigrationBaselineError('Existing database has no migration manifest. Call controller.createMigrationBaseline() before normal setup or migration.')
            }
            await this.system.setup(this.entities, this.relations, states, install)
            await this.scheduler.setup(install)
            return
        }
        await this.system.setup(this.entities, this.relations, states, install)
        const nextManifest = createMigrationManifest(this)
        await this.scheduler.setup(install)
        if (install) {
            await writeMigrationManifest(this, nextManifest)
        }
    }

    async createMigrationBaseline() {
        const states = this.scheduler.createStates()
        const migrationSystem = this.system as System & {
            prepareMigrationSchema: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[]) => Promise<MigrationSchemaPlan>
        }
        assert(typeof migrationSystem.prepareMigrationSchema === 'function', 'Current system does not support migration baseline')
        const schemaPlan = await migrationSystem.prepareMigrationSchema(this.entities, this.relations, states)
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

    async migrate(options: MigrationOptions = {}): Promise<MigrationPlan> {
        const migrationOptions: MigrationOptions = { mode: 'compute', ...options }
        const states = this.scheduler.createStates()
        const migrationSystem = this.system as System & {
            prepareMigrationSchema: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[]) => Promise<MigrationSchemaPlan>
            applyMigrationSchema: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
            verifyMigrationSchema?: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
            applyMigrationPostSchema?: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
            beginMigration?: (modelHash: string) => Promise<MigrationRunState>
            updateMigrationPhase?: (migrationId: string, phase: Exclude<MigrationPhase, 'pending' | 'succeeded' | 'failed'>) => Promise<void>
            finishMigration?: (migrationId: string, status: 'succeeded' | 'failed', error?: unknown) => Promise<void>
            isMigrationOperationComplete?: (migrationId: string | undefined, operationKey: string) => Promise<boolean>
            markMigrationOperationComplete?: (migrationId: string | undefined, operationKey: string) => Promise<void>
        }
        assert(typeof migrationSystem.prepareMigrationSchema === 'function', 'Current system does not support schema migration planning')
        assert(typeof migrationSystem.applyMigrationSchema === 'function', 'Current system does not support schema migration application')
        const schemaPlan = await migrationSystem.prepareMigrationSchema(this.entities, this.relations, states)

        const previousManifest = await readMigrationManifest(this)
        if (!previousManifest) {
            throw new MigrationBaselineError('Migration baseline manifest not found. Run setup(true) with the current framework first or createMigrationBaseline().')
        }
        const nextManifest = createMigrationManifest(this, schemaPlan.schema)
        const changedComputations = getChangedComputations(previousManifest, nextManifest)
        const changedDataContexts = getNewFilteredDataContexts(previousManifest, nextManifest)
        const rebuildPlan = buildAffectedRebuildPlan(previousManifest, nextManifest, changedComputations, changedDataContexts)
        const storageBlockingChanges = getStorageBlockingChanges(previousManifest, nextManifest)
        const recomputeBlockingChanges = getRecomputeBlockingChanges(
            this,
            rebuildPlan,
            migrationOptions,
            previousManifest,
        )
        const allBlockingChanges = [
            ...schemaPlan.blockingChanges,
            ...storageBlockingChanges,
            ...recomputeBlockingChanges,
        ]
        const blockingChanges = createPlanBlockingMessages(allBlockingChanges)
        const deletionScope = await getDestructiveDeletionScope(this, rebuildPlan)
        const plan: MigrationPlan = {
            mode: 'compute',
            dryRun: migrationOptions.dryRun === true,
            changedComputations,
            rebuildPlan,
            schemaPlan: {
                schema: schemaPlan.schema,
                preRecomputeDDL: schemaPlan.preRecomputeDDL,
                postRecomputeDDL: schemaPlan.postRecomputeDDL,
                verificationDDL: schemaPlan.verificationDDL,
                blockingChanges: allBlockingChanges,
            },
            blockingChanges,
            deletionScope,
            hints: migrationOptions.hints,
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
            migrationRun = await migrationSystem.beginMigration?.(nextManifest.modelHash)
            const phase = migrationRun?.phase || 'pending'
            if (!reached(phase, 'schema-applied')) {
                await migrationSystem.applyMigrationSchema(schemaPlan, migrationRun?.id)
                if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'schema-applied')
            }
            if (!reached(phase, 'manifest-written')) {
                await this.system.storage.runInTransaction({ name: 'migration recompute', isolation: 'SERIALIZABLE' }, async () => {
                    if (!reached(phase, 'computation-applied')) {
                        const filteredEvents = await recomputeFilteredMemberships(this, previousManifest, nextManifest)
                        await recomputeChangedComputations(this, rebuildPlan, migrationOptions, filteredEvents)
                        if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'computation-applied')
                    }
                    if (!reached(phase, 'constraints-applied')) {
                        await migrationSystem.verifyMigrationSchema?.(schemaPlan, migrationRun?.id)
                        await migrationSystem.applyMigrationPostSchema?.(schemaPlan, migrationRun?.id)
                        if (migrationRun) await migrationSystem.updateMigrationPhase?.(migrationRun.id, 'constraints-applied')
                    }
                    const manifestOperationKey = `manifest:current:${nextManifest.modelHash}`
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
