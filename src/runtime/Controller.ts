import { BoolExp, EntityInstance, RelationInstance, DictionaryInstance, Property, EventSourceInstance } from "@core";
import { MatchExp } from "@storage";
import { ComputationState, RecordMutationEvent, System, SystemLogger } from "./System.js";
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
import { ComputationError, SchedulerError, SideEffectError } from "./errors/index.js";
import { assert } from "./util.js";
import { asyncEffectsContext } from "./asyncEffectsContext.js";
import { asyncInteractionContext } from "./asyncInteractionContext.js";
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
                // CAUTION fail fast：同名 eventSource 静默后写覆盖先写——findEventSourceByName
                //  只会命中最后注册者，先注册者的 guard/权限链从此不可达（按名 dispatch 的调用方
                //  可能走到完全不同的授权路径）。Activity 内的 interaction 以 "activity:interaction"
                //  作用域名注册，不受影响。
                const existing = this.eventSourcesByName.get(es.name)
                if (existing && existing !== es) {
                    throw new Error(`Duplicate eventSource name "${es.name}". Event source names must be unique within a Controller; findEventSourceByName would silently resolve to only one of them.`)
                }
                this.eventSourcesByName.set(es.name, es)
            }
            this.eventSourcesByUUID.set(es.uuid, es)
        }

        const entitiesByName = new Map(this.entities.map(e => [e.name, e]))
        for (const es of this.eventSources) {
            if (!es.entity || !es.entity.name) continue
            const existing = entitiesByName.get(es.entity.name)
            // CAUTION fail fast：用户实体与 eventSource 的事件实体同名时，此前静默跳过注入——
            //  事件仍按系统字段（interactionName/payload/...）写入，但 schema 是用户声明的列集，
            //  未声明字段被写路径静默丢弃。监听该记录的 StateMachine trigger / Transform eventDeps
            //  按 record.interactionName 匹配永不命中，整个响应式管线对交互失明且零告警。
            if (existing && existing !== es.entity) {
                throw new Error(
                    `Entity name "${es.entity.name}" conflicts with the event entity of eventSource "${es.name || es.uuid}". ` +
                    `Event records are written with the event source's own schema; shadowing it with a user entity silently drops event fields. ` +
                    `Rename the user entity (names starting with "_" are reserved for system records).`
                )
            }
            if (!existing) {
                this.entities.push(es.entity)
                entitiesByName.set(es.entity.name, es.entity)
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
        try {
            await this.scheduler.setup(install)
        } catch (error) {
            // CAUTION install 半途失败恢复路径：此时表已创建、manifest 尚未写入，
            //  直接重试 setup(false) 会撞上误导性的 MigrationBaselineError（有数据无 manifest）。
            //  用明确的错误告诉调用方正确的恢复动作是修复后重跑 setup(true)（install 会重建表）。
            throw new SchedulerError(
                'Initial install failed after database tables were created but before the migration manifest was written. ' +
                'Fix the underlying error and re-run setup(true) (install recreates tables from scratch); do NOT call setup(false) — it will fail with a misleading MigrationBaselineError.',
                {
                    schedulingPhase: 'install-scheduler-setup',
                    causedBy: error instanceof Error ? error : new Error(String(error))
                }
            )
        }
        if (install) {
            await writeMigrationManifest(this, nextManifest)
        }
    }

    /**
     * Detach this controller from the system: unregister all reactive computation
     * listeners registered by its scheduler. After teardown the controller no longer
     * reacts to storage mutations; the system (and its database connection) stays
     * usable and can host a new controller.
     *
     * Call this before discarding a controller in long-lived processes (hot reload,
     * multi-tenant single process); otherwise the old controller's computation
     * closures stay registered on the storage callback set and keep firing.
     */
    teardown() {
        this.scheduler.teardown()
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
        // CAUTION 迁移重算期间不允许本 controller 的反应式监听在场：重算顺序由 rebuildPlan
        //  显式管理，监听器对重算写入的即时反应会与之互相干扰（双重计算、阶段乱序）。
        //  fresh controller 上这是 no-op；对已 setup 过的 controller 是必要的防御。
        //  同一 system 上其他 controller 的监听器无法从这里注销——共享 system 的进程必须
        //  在 migrate 前对旧 controller 调用 teardown()。迁移成功后 scheduler.setup(false)
        //  会重新注册监听。
        // CAUTION 应用层 `storage.listen` 回调同理无法从这里注销（r31 记录项）：迁移期的
        //  真实写入（默认值回填、重算落库）仍会派发给它们，而链式 rebuild 用的是各步骤
        //  **返回**的合成事件流（两条轨刻意分离）。迁移必须在没有业务监听者在场的进程/
        //  时机执行——这是运维契约：不要在处理业务流量的进程上原地 migrate。
        this.scheduler.teardown()
        // 迁移重算读取 global dataDeps 时走 dict.get，声明了 defaultValue 的新字典此时还没有
        //  存储行（setup 尚未运行）——先注册声明驱动的读回退，保证重算与迁移后运行时读到同一批默认值。
        this.scheduler.registerDictDefaults()
        try {
            migrationRun = await migrationSystem.beginMigration?.(
                nextManifest.modelHash,
                approvedDiffHash,
                approvedDiff.summary,
                approvedDiff.decisions.length,
            )
            const phase = migrationRun?.phase || 'pending'
            // CAUTION applyMigrationSchema 必须无条件执行：它除了 DDL（经 operation log 幂等，
            //  已完成的操作会被跳过）之外还初始化本进程的 storage queryHandle/map/schema。
            //  此前按 phase 跳过它时，跨进程 resume（DDL 已应用、phase 已记 schema-applied、
            //  进程崩溃后在全新进程上重试）会带着未初始化的 queryHandle 进入重算事务，
            //  在第一次 storage 读写处抛出与迁移无关的 "Cannot read properties of undefined"，
            //  迁移永久卡死在不可恢复的 resume 循环里。
            await migrationSystem.applyMigrationSchema(executionSchemaPlan, migrationRun?.id)
            if (!reached(phase, 'schema-applied')) {
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
            // CAUTION 成功状态必须在 manifest 事务提交后立刻落账：此后数据库已经是迁移完成状态，
            //  再把后续步骤（scheduler.setup）的失败记成 migration failed 会让日志与实际状态矛盾，
            //  干扰 resume 判断。scheduler.setup 的失败单独向上抛出。
            if (migrationRun) await migrationSystem.finishMigration?.(migrationRun.id, 'succeeded')
        } catch (error) {
            if (migrationRun) await migrationSystem.finishMigration?.(migrationRun.id, 'failed', error)
            throw error
        }
        try {
            await this.scheduler.setup(false)
        } catch (error) {
            // CAUTION 数据库已完成迁移（manifest 已提交、migration log 已记 succeeded），
            //  失败的只是本进程的计算监听层。必须用明确的错误告诉调用方恢复路径，
            //  否则调用方会误判为「迁移失败」而重跑迁移或回滚，与实际数据库状态矛盾。
            throw new SchedulerError(
                'Migration completed successfully (database schema, data and manifest are all migrated), but scheduler setup failed afterwards: ' +
                'the reactive computation layer is NOT active in this process. Fix the underlying error and call controller.setup() (without install) to register computation listeners; do NOT retry the migration.',
                {
                    schedulingPhase: 'post-migration-scheduler-setup',
                    causedBy: error instanceof Error ? error : new Error(String(error))
                }
            )
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
            // CAUTION 按"键是否存在"判断，不能按真值：0/false/'' 是合法的计算值，
            //  真值判断会把它们误判为缺失而绕去查库——多数时候只是浪费一次查询，
            //  但当 record 快照比库里更新时会拿到错误的 lastValue。
            if (record![propertyDataContext.id.name] !== undefined) return record![propertyDataContext.id.name]

            const item = await this.system.storage.findOne(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), undefined, ['*'])
            return item[propertyDataContext.id.name]
        }
    }
    async applyResult(dataContext: DataContext, result: unknown, record?: Record<string, unknown>) {
        if (result instanceof ComputationResultSkip) return
        // CAUTION undefined 统一视为"无值可写"（与 entity/relation 分支及 incrementalPatchCompute
        //  的 undefined 语义一致）。此前 global/property 分支会把 undefined 写穿——compute/
        //  incrementalCompute 漏写 return 时，dict 值与 property 列被静默抹掉（数据损坏且零告警）。
        //  null 是合法值域（可显式清空 global/property），继续写入。
        if (result === undefined) return
        // fail fast：能到达这里的 ComputationResult 只剩协议误用形态——fullRecompute 只能由
        //  增量路径返回（compute() 本身就是全量重算）、async/resolved 应已被 Scheduler 拆解。
        //  此前 compute()/asyncReturn() 返回这些信封对象时会被当作普通值原样写进 dict/property
        //  （如 dict 值变成 {"reason":"..."}），污染所有下游读取方且零告警。
        this.assertNotComputationEnvelope(dataContext, result)

        if (dataContext.type === 'global') {
            return this.system.storage.dict.set(dataContext.id.name, result)
        } else if (dataContext.type === 'entity') {
            if (result === null) return
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
            if (result === null) return
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
    private assertNotComputationEnvelope(dataContext: DataContext, result: unknown) {
        if (result instanceof ComputationResult) {
            const contextName = dataContext.type === 'property'
                ? `${(dataContext as PropertyDataContext).host.name}.${dataContext.id.name}`
                : `${dataContext.type}:${(dataContext.id as { name?: string })?.name ?? String(dataContext.id)}`
            throw new ComputationError(
                `Computation for ${contextName} returned a ${result.constructor.name} envelope where a plain value is expected. ` +
                `ComputationResult.fullRecompute() is only meaningful as an incrementalCompute return value (compute() IS the full recomputation); ` +
                `ComputationResult.async()/resolved() must be resolved before the result is applied. Return the computed value itself (or ComputationResult.skip()).`,
                { computationPhase: 'result-application' }
            )
        }
    }
    async applyInitialValue(dataContext: PropertyDataContext, result: unknown, record: Record<string, unknown>) {
        if (result instanceof ComputationResultSkip) return
        this.assertNotComputationEnvelope(dataContext, result)

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
            // fail fast：patch 必须是 {type: 'insert'|'update'|'delete', ...} 信封。
            //  未知形态静默跳过（或对 global 直接写入信封对象）都是零告警的数据损坏。
            if (!patch || (patch.type !== 'insert' && patch.type !== 'update' && patch.type !== 'delete')) {
                throw new ComputationError(
                    `incrementalPatchCompute must return ComputationResultPatch envelope(s) ({type: 'insert'|'update'|'delete', data?, affectedId?}), got: ${JSON.stringify(patch)?.slice(0, 200)}. To return a plain value, use incrementalCompute instead.`,
                    { computationPhase: 'apply-result-patch' }
                )
            }
            if (patch.type === 'insert' || patch.type === 'update') {
                // fail fast：insert/update 信封显式声明了"要写入 data"，data 缺失只能是回调实现
                //  遗漏（如漏赋值）。若放行，global/property 分支会把 undefined 写穿（已有值被静默
                //  抹成 null），entity/relation 分支则以 undefined 调 storage 在远处抛无关错误——
                //  与 applyResult 对 undefined 的 skip 语义不同，信封形态下缺 data 是矛盾声明。
                if (patch.data === undefined) {
                    throw new ComputationError(
                        `ComputationResultPatch of type '${patch.type}' has no "data". An insert/update patch must carry the value to write (use null to clear, or return ComputationResult.skip() / undefined to leave the value unchanged).`,
                        { computationPhase: 'apply-result-patch' }
                    )
                }
                // fail fast：patch.data 里嵌 ComputationResult 信封与 applyResult 路径同罪——
                //  r15 R-1 收口了 applyResult 直写信封，patch.data 是同族的漏网通道。
                this.assertNotComputationEnvelope(dataContext, patch.data)
            }
                if (dataContext.type === 'global') {
                    // CAUTION global dict 只有一个值，patch 的语义是"新值在 patch.data 里"。
                    //  直接把 patch 信封对象（{type, data, affectedId}）写进 dict 会污染所有
                    //  下游读取方（依赖该 dict 的计算读到的是信封而不是值）。
                    //  insert/update 写入 patch.data，delete 写入 null（与 property 路径一致）。
                    await this.system.storage.dict.set(dataContext.id.name, patch.type === 'delete' ? null : patch.data)
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
    private cloneDispatchArgs<TArgs>(args: TArgs): TArgs {
        if (!args || typeof args !== 'object') return args
        const cloned = { ...(args as Record<string, unknown>) }
        // CAUTION 克隆不得改变形状：数组展开成 `{...arr}` 会变成普通对象（{0:…,1:…}），
        //  守卫（checkPayload 的非对象拒绝）就再也看不到"payload 是数组"这个非法形态，
        //  错误信息退化成 "0 in payload is not defined"。数组按数组克隆，交给守卫按原形拒绝。
        if (cloned.payload && typeof cloned.payload === 'object') {
            cloned.payload = Array.isArray(cloned.payload) ? [...cloned.payload] : { ...(cloned.payload as Record<string, unknown>) }
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
        // 建立 dispatch 级别的 interaction context：driver 的每条 SQL 日志都会读取 logContext，
        // 使一次 dispatch 内的所有数据库操作可以按调用来源（args.context）关联排查。
        const argsContext = (args as { context?: unknown } | undefined)?.context
        const interactionContext: InteractionContext = {
            logContext: {
                eventSourceName: eventSource.name,
                ...(argsContext && typeof argsContext === 'object' ? argsContext as Record<string, unknown> : {}),
            }
        }
        let result: DispatchResponse
        try {
            result = await asyncInteractionContext.run(interactionContext, () => runWithTransactionRetry(eventSource.name || 'dispatch', async (isolation) => {
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
            }))
        } catch (e) {
            if (this.forceThrowDispatchError) throw e
            // 与成功路径同形态（data/context 显式为 undefined）：直接序列化 DispatchResponse
            //  的调用方（HTTP 层等）拿到的 JSON 键集合在成功/失败两条路径上保持一致。
            result = {
                error: e,
                data: undefined,
                effects: [],
                sideEffects: {},
                context: undefined
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findEventSourceByName(name: string): EventSourceInstance<any, any> | undefined {
        return this.eventSourcesByName.get(name)
    }
}
