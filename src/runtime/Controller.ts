import { BoolExp, EntityInstance, EntityRetention, RelationInstance, DictionaryInstance, Property, EventSourceInstance } from "@core";
import { MatchExp, type AttributeQueryData, type MapData } from "@storage";
import { ComputationState, RecordMutationEvent, Storage, System, SystemLogger } from "./System.js";
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
import { ComputationError, IdempotencyError, PostCommitRerunError, SchedulerError, SideEffectError } from "./errors/index.js";
import { assert } from "./util.js";
import { asyncEffectsContext } from "./asyncEffectsContext.js";
import { asyncInteractionContext } from "./asyncInteractionContext.js";
import {
    BusinessTransactionBoundaryError,
    isBusinessTransactionSavepointRetryable,
    NestedDispatchError,
    RequireSerializableRetry,
    runWithTransactionRetry,
    TransactionCapabilityError,
    TransactionIsolation,
} from "./transaction.js";
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
    getCascadeAwareDeletionScope,
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

export type SideEffectResult = {
    result?: unknown,
    error?: unknown
}

export type DispatchOutcome = 'applied' | 'replayed'

export type PostCommitPhaseStatus = 'complete' | 'failed' | 'notRun'

export type PostCommitPhaseFailure = {
    name: string
    error: unknown
}

export type PostCommitPhase = {
    status: PostCommitPhaseStatus
    failures: PostCommitPhaseFailure[]
}

export type DispatchResponse = {
    error?: unknown
    data?: unknown
    effects?: RecordMutationEvent[]
    sideEffects?: { [k: string]: SideEffectResult }
    context?: { [k: string]: unknown }
    /**
     * Present only when the EventSource participates in idempotency and the attempt
     * succeeds. Must be absent for non-participating successes and for failures.
     */
    outcome?: DispatchOutcome
    /**
     * Completion of stage P (EventSource.postCommit + RecordMutationSideEffect).
     * Orthogonal to `outcome`: `outcome` is first-apply vs replay of facts;
     * this field is whether this response's stage P ran and succeeded.
     */
    postCommitPhase?: PostCommitPhase
}

/**
 * Official predicate: this result object's stage P ran to completion with no failures.
 * It is not a historical claim that every obligation is recoverably converged.
 */
export function isPostCommitPhaseComplete(
    result: { postCommitPhase?: PostCommitPhase }
): boolean {
    return result.postCommitPhase?.status === 'complete'
}

export type RerunCreateMutationSideEffectsInput = {
    recordName: string
    id: string
}

export type PostCommitRerunResult = {
    effects: RecordMutationEvent[]
    sideEffects: { [k: string]: SideEffectResult }
    postCommitPhase: PostCommitPhase
}

const RELATION_CREATE_ATTRIBUTE_QUERY: AttributeQueryData = [
    '*',
    ['source', { attributeQuery: ['id'] }],
    ['target', { attributeQuery: ['id'] }],
]

type CreateMutationRerunClass =
    | { kind: 'unknown' }
    | { kind: 'relation'; attributeQuery: AttributeQueryData }
    | { kind: 'entity'; attributeQuery: AttributeQueryData }

type CreateMutationRerunRecordFlags = {
    isRelation?: boolean
    isFilteredRelation?: boolean
    isMergedAbstract?: boolean
}

/**
 * Classify a compiled record name for create-mutation reconstruction.
 * Reads only `map.data.records[name]` flags. Must not call `getRecordInfo`
 * (unknown names throw TypeError there instead of UNKNOWN_RECORD_NAME).
 */
function classifyCreateMutationRerun(
    records: Record<string, CreateMutationRerunRecordFlags | undefined>,
    recordName: string,
): CreateMutationRerunClass {
    const rec = records[recordName]
    if (rec === undefined) return { kind: 'unknown' }
    if (rec.isRelation === true || rec.isFilteredRelation === true) {
        return { kind: 'relation', attributeQuery: RELATION_CREATE_ATTRIBUTE_QUERY }
    }
    return { kind: 'entity', attributeQuery: ['*'] }
}

function compiledRecordsFromStorage(storage: Storage): Record<string, CreateMutationRerunRecordFlags | undefined> {
    const asMapData = storage.map as MapData | undefined
    if (asMapData?.records && typeof asMapData.records === 'object') {
        return asMapData.records
    }
    const fromHandle = (
        storage as { queryHandle?: { map?: { data?: MapData } } }
    ).queryHandle?.map?.data?.records
    if (fromHandle) {
        return fromHandle
    }
    throw new Error(
        'Controller storage has no compiled record map; call setup() before rerun APIs',
    )
}

const POST_COMMIT_HOOK_FAILURE_NAME = '__postCommit'

const postCommitPhaseFailures = new WeakMap<DispatchResponse, PostCommitPhaseFailure[]>()

function notRunPostCommitPhase(): PostCommitPhase {
    return { status: 'notRun', failures: [] }
}

function recordPostCommitPhaseFailure(result: DispatchResponse, name: string, error: unknown): void {
    let failures = postCommitPhaseFailures.get(result)
    if (!failures) {
        failures = []
        postCommitPhaseFailures.set(result, failures)
    }
    failures.push({ name, error })
}

function finalizePostCommitPhase(result: DispatchResponse): void {
    const recorded = postCommitPhaseFailures.get(result) ?? []
    postCommitPhaseFailures.delete(result)
    result.postCommitPhase = {
        status: recorded.length === 0 ? 'complete' : 'failed',
        failures: recorded.slice(),
    }
}

function phaseAErrorResponse(error: unknown): DispatchResponse {
    return {
        error,
        data: undefined,
        effects: [],
        sideEffects: {},
        context: undefined,
        postCommitPhase: notRunPostCommitPhase(),
    }
}

export type EntityRetentionControllerOptions = {
    /**
     * When true, call `maintainEntityRetention()` after a successful dispatch commit
     * (and after postCommit / mutation side effects). Default false — explicit control.
     * Still uses the same single prune path; does not invent a second deletion semantics.
     */
    runAfterSuccessfulDispatch?: boolean
}

export type RetentionEntityReport = {
    entityName: string
    removed: number
}

export type RetentionReport = {
    entities: RetentionEntityReport[]
    removed: number
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
    /**
     * Optional automatic entity retention hook. Default is off.
     * Distinct from `cleanupAsyncTasks` (internal async-task terminal rows only).
     */
    entityRetention?: EntityRetentionControllerOptions
}

export const HARD_DELETION_PROPERTY_NAME = '_isDeleted_'

/** Internal batch size for retention deletes (keeps mutation events bounded). */
const ENTITY_RETENTION_DELETE_BATCH = 500

function stablePartitionKeyPart(value: unknown): string {
    if (value === null || value === undefined) return `\u0000${String(value)}`
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${typeof value}:${String(value)}`
    }
    try {
        return `json:${JSON.stringify(value)}`
    } catch {
        return `raw:${String(value)}`
    }
}

/**
 * DESC comparator for retention orderBy keys: higher / later values rank first.
 * Nullish sorts last (oldest for retention purposes).
 */
function compareRetentionOrder(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    orderBy: string[],
): number {
    for (const key of orderBy) {
        const av = a[key]
        const bv = b[key]
        if (av === bv) continue
        if (av === null || av === undefined) return 1
        if (bv === null || bv === undefined) return -1
        if (typeof av === 'number' && typeof bv === 'number') {
            if (av > bv) return -1
            if (av < bv) return 1
            continue
        }
        if (typeof av === 'string' && typeof bv === 'string') {
            if (av > bv) return -1
            if (av < bv) return 1
            continue
        }
        const as = String(av)
        const bs = String(bv)
        if (as > bs) return -1
        if (as < bs) return 1
    }
    // Stable tie-break on id DESC so equal orderBy keys still have a total order.
    const aid = String(a.id ?? '')
    const bid = String(b.id ?? '')
    if (aid > bid) return -1
    if (aid < bid) return 1
    return 0
}

type DispatchExecutionContext = {
    eventSourceName?: string
}

const dispatchExecutionContext = new AsyncLocalStorage<DispatchExecutionContext>()

export type BusinessTransactionOnDispatchError = 'abort' | 'continue'

export type BusinessTransactionOptions = {
    name?: string
    isolation?: TransactionIsolation
    /**
     * How dispatch failures surface inside the business transaction callback.
     * - `abort` (default): dispatch throws; runInBusinessTransaction rejects; outer ROLLBACK.
     * - `continue`: dispatch returns a soft DispatchResponse with error; caller owns atomicity.
     */
    onDispatchError?: BusinessTransactionOnDispatchError
}

type DeferredPostCommitPhase = {
    kind: 'postCommitPhase'
    eventSource: EventSourceInstance<any, any>
    args: unknown
    result: DispatchResponse
}

type BusinessTransactionContext = {
    active: boolean
    name?: string
    isolation: TransactionIsolation
    onDispatchError: BusinessTransactionOnDispatchError
    deferred: Array<DeferredPostCommitPhase>
    aborted: boolean
    savepointSeq: number
}

const businessTransactionContext = new AsyncLocalStorage<BusinessTransactionContext>()

export function getActiveBusinessTransaction(): BusinessTransactionContext | undefined {
    return businessTransactionContext.getStore()
}

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
    public entityRetentionOptions: EntityRetentionControllerOptions

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
            entityRetention,
        } = options
        
        this.system = system
        this.ignoreGuard = ignoreGuard
        this.forceThrowDispatchError = forceThrowDispatchError
        this.entityRetentionOptions = {
            runAfterSuccessfulDispatch: entityRetention?.runAfterSuccessfulDispatch === true,
        }
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

        // CAUTION fail fast（r28 记录的报错质量项，r32 收口）：同名 Dictionary 此前要到
        //  createMigrationManifest 的身份唯一性审计才被拒绝，错误信息
        //  （"Migration identity is ambiguous for dictionary:x"）与用户的实际操作
        //  （两个同名 Dictionary.create）距离太远。在声明入口用用户语言直接指出。
        const dictNames = new Set<string>()
        for (const dictionary of this.dict) {
            if (dictNames.has(dictionary.name)) {
                throw new Error(
                    `Duplicate Dictionary name "${dictionary.name}". Dictionary names must be unique within a Controller — ` +
                    `both declarations would read and write the same global value. Rename one of the Dictionary.create({ name: '${dictionary.name}' }) declarations.`
                )
            }
            dictNames.add(dictionary.name)
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

    /**
     * async 计算 task 表的保留清理（C1：task 表只增不减，r2-I-6）。
     *
     * task 行的终态（applied / skipped）是审计痕迹，框架从不自动清理（显式控制原则）；
     * 长期运行的部署应周期性调用本方法回收。协议态（pending / success）是投递机制的
     * 活跃状态，**不可清理**——pending 的 worker 尚未回填，success 等待 daemon 投递，
     * 删除它们会破坏「最后产出胜出」不变量。
     *
     * 陈旧复活防护：同一 freshnessKey 分区内 id 更小的 pending/success 行，其"陈旧"
     * 判定（isLatestAsyncTask 取分区内最大 id）依赖后来的终态行存在。分区里还有未投递
     * 行时整个分区跳过清理，投递语义不受影响。
     *
     * @returns 每张 task 表的清理计数（recordName = 内部 task 表名）。
     */
    async cleanupAsyncTasks(options?: { statuses?: Array<'applied' | 'skipped'> }): Promise<Array<{ taskRecordName: string, removed: number }>> {
        const statuses = options?.statuses ?? ['applied', 'skipped']
        const illegal = statuses.filter(status => status !== 'applied' && status !== 'skipped')
        if (illegal.length) {
            throw new Error(
                `cleanupAsyncTasks can only remove terminal task rows ('applied' | 'skipped'); got: ${JSON.stringify(illegal)}. ` +
                `'pending' and 'success' rows are live delivery-protocol state — removing them would break the latest-output-wins invariant.`
            )
        }
        const results: Array<{ taskRecordName: string, removed: number }> = []
        for (const computation of this.scheduler.computationsHandles.values()) {
            if (!this.scheduler.isAsyncComputation(computation)) continue
            const taskRecordName = this.scheduler.getAsyncTaskRecordKey(computation)
            const removed = await this.system.storage.runInTransaction(
                { name: `cleanupAsyncTasks:${taskRecordName}` },
                async () => {
                    // 快照未投递行占用的 freshnessKey 分区（通常极少：pending/success 是瞬态）。
                    const unappliedRows = await this.system.storage.find(
                        taskRecordName,
                        BoolExp.atom({ key: 'status', value: ['in', ['pending', 'success']] }),
                        undefined,
                        ['freshnessKey']
                    ) as Array<{ freshnessKey?: unknown }>
                    const liveKeys = [...new Set(unappliedRows.map(row => row.freshnessKey).filter(key => key !== undefined && key !== null))]
                    let terminalMatch = BoolExp.atom({ key: 'status', value: ['in', statuses] })
                    if (liveKeys.length) {
                        terminalMatch = terminalMatch.and({ key: 'freshnessKey', value: ['not in', liveKeys] })
                    }
                    const deleted = await this.system.storage.delete(taskRecordName, terminalMatch) as unknown as unknown[]
                    return Array.isArray(deleted) ? deleted.length : 0
                }
            ) as number
            results.push({ taskRecordName, removed })
        }
        return results
    }

    /**
     * Single entry point for declarative entity row retention (FR-RET-01).
     *
     * Scans only entities that declare a non-forever `retention`. Runs in independent
     * storage transaction(s) outside any business attempt. Does not clean internal
     * async-task tables — use `cleanupAsyncTasks` for those.
     *
     * Combination order for `mode:'cap'` with optional `ttl`: expire by TTL first, then
     * apply per-partition latest-N by explicit `orderBy` (each key DESC).
     */
    async maintainEntityRetention(options?: {
        entityNames?: string[]
        now?: number
    }): Promise<RetentionReport> {
        const now = options?.now ?? Date.now()
        if (typeof now !== 'number' || !Number.isFinite(now)) {
            throw new Error(`maintainEntityRetention options.now must be a finite number (epoch milliseconds); got ${JSON.stringify(options?.now)}`)
        }

        const nameFilter = options?.entityNames
        if (nameFilter !== undefined) {
            if (!Array.isArray(nameFilter) || nameFilter.some(n => typeof n !== 'string' || n.length === 0)) {
                throw new Error('maintainEntityRetention options.entityNames must be an array of non-empty entity names when provided')
            }
        }
        const nameSet = nameFilter ? new Set(nameFilter) : null

        const targets = this.entities.filter(entity => {
            if (nameSet && !nameSet.has(entity.name)) return false
            const retention = entity.retention
            if (!retention || retention.mode === 'forever') return false
            // Filtered / merged should already fail at Entity.create; skip defensively.
            if (entity.baseEntity || entity.inputEntities) return false
            return true
        })

        if (nameSet) {
            for (const name of nameSet) {
                const entity = this.entities.find(e => e.name === name)
                if (!entity) {
                    throw new Error(
                        `maintainEntityRetention: unknown entity name "${name}". ` +
                        `Pass names of entities registered on this Controller.`,
                    )
                }
            }
        }

        const entities: RetentionEntityReport[] = []
        let removedTotal = 0
        for (const entity of targets) {
            const retention = entity.retention
            if (!retention || retention.mode === 'forever') continue
            const activeRetention = retention
            const removed = await this.system.storage.runInTransaction(
                { name: `maintainEntityRetention:${entity.name}` },
                async () => this.applyEntityRetention(entity.name, activeRetention, now),
            ) as number
            entities.push({ entityName: entity.name, removed })
            removedTotal += removed
        }
        return { entities, removed: removedTotal }
    }

    private async applyEntityRetention(
        entityName: string,
        retention: Exclude<EntityRetention, { mode: 'forever' }>,
        now: number,
    ): Promise<number> {
        let removed = 0
        if (retention.mode === 'ttl') {
            removed += await this.deleteExpiredByTtl(entityName, retention.ttl, now)
            return removed
        }
        // mode: 'cap' — optional ttl first, then latest-N
        if (retention.ttl) {
            removed += await this.deleteExpiredByTtl(entityName, retention.ttl, now)
        }
        removed += await this.deleteBeyondCap(entityName, retention)
        return removed
    }

    private async deleteExpiredByTtl(
        entityName: string,
        ttl: { timestampProperty: string; maxAgeMs: number },
        now: number,
    ): Promise<number> {
        const cutoff = now - ttl.maxAgeMs
        let removed = 0
        // Batch by id so large tables do not build one giant mutation event list.
        for (;;) {
            const expired = await this.system.storage.find(
                entityName,
                MatchExp.atom({ key: ttl.timestampProperty, value: ['<', cutoff] }),
                { limit: ENTITY_RETENTION_DELETE_BATCH, orderBy: { id: 'ASC' } },
                ['id'],
            ) as Array<{ id: string }>
            if (!expired.length) break
            const ids = expired.map(row => row.id)
            const deleted = await this.system.storage.delete(
                entityName,
                MatchExp.atom({ key: 'id', value: ['in', ids] }),
            ) as unknown as unknown[]
            const count = Array.isArray(deleted) ? deleted.length : ids.length
            removed += count
            if (expired.length < ENTITY_RETENTION_DELETE_BATCH) break
        }
        return removed
    }

    private async deleteBeyondCap(
        entityName: string,
        retention: Extract<EntityRetention, { mode: 'cap' }>,
    ): Promise<number> {
        const partitionBy = retention.partitionBy ?? []
        const attributeQuery = ['id', ...new Set([...partitionBy, ...retention.orderBy])]
        // Full scan of surviving rows after any TTL pass; partition in memory.
        // Suitable for bounded logs; large tables should schedule maintenance off peak.
        const rows = await this.system.storage.find(
            entityName,
            undefined,
            undefined,
            attributeQuery,
        ) as Array<Record<string, unknown> & { id: string }>

        if (!rows.length) return 0

        const groups = new Map<string, Array<Record<string, unknown> & { id: string }>>()
        for (const row of rows) {
            const key = partitionBy.length
                ? partitionBy.map(name => stablePartitionKeyPart(row[name])).join('\u0001')
                : ''
            let group = groups.get(key)
            if (!group) {
                group = []
                groups.set(key, group)
            }
            group.push(row)
        }

        const toDelete: string[] = []
        for (const group of groups.values()) {
            if (group.length <= retention.retainLatest) continue
            group.sort((a, b) => compareRetentionOrder(a, b, retention.orderBy))
            // After sort: index 0 is newest (DESC). Keep [0, retainLatest).
            for (let i = retention.retainLatest; i < group.length; i++) {
                toDelete.push(String(group[i].id))
            }
        }

        let removed = 0
        for (let offset = 0; offset < toDelete.length; offset += ENTITY_RETENTION_DELETE_BATCH) {
            const batch = toDelete.slice(offset, offset + ENTITY_RETENTION_DELETE_BATCH)
            const deleted = await this.system.storage.delete(
                entityName,
                MatchExp.atom({ key: 'id', value: ['in', batch] }),
            ) as unknown as unknown[]
            removed += Array.isArray(deleted) ? deleted.length : batch.length
        }
        return removed
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
        // r30-E：级联感知——优先以「回滚事务内真实执行 rebuildPlan」收集精确删除集
        //  （含链式依赖计算对上游收缩的级联删除），审批面从此可以一轮给出精确 ids。
        //  模拟不可行（MySQL / 缺 handler 等）时回退分析性一阶 scope。
        const destructiveScopes = options.includeDestructiveScope === true
            ? (await getCascadeAwareDeletionScope(this, provisionalRebuildPlan, previousManifest, readHandle, {
                schemaPlan,
                previousManifest,
                nextManifest,
            })).entries
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
        // r30-E：入口断言用级联感知 scope（模拟成功 ⇒ ids 双向精确对账，dryRun 即可发现差异；
        //  模拟不可行 ⇒ 只查存在性，ids 精确性由重算事务内的执行期对账兜底——一阶分析对
        //  链式依赖计算的 ids 必然失真，不能作为精确断言的依据）。
        const { entries: deletionScope, exact: deletionScopeExact } = await getCascadeAwareDeletionScope(this, rebuildPlan, previousManifest, readHandle, {
            schemaPlan,
            previousManifest,
            nextManifest,
            options: migrationOptions,
        })
        assertDestructiveScopeAllowed(migrationOptions, deletionScope, { idExactness: deletionScopeExact })
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
    // storageEvents（可选）：调用方需要读取本次写入实际产生的 storage 事件（含派生事件，
    //  如 filtered entity 成员资格 create/delete）时传入。live 轨不传——事件经 mutation
    //  callbacks 派发；迁移轨（监听已 teardown）必须捕获并入合成事件流，否则依赖计算
    //  对成员资格退出等派生事实失明。
    async applyResult(dataContext: DataContext, result: unknown, record?: Record<string, unknown>, storageEvents?: RecordMutationEvent[]) {
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
            await this.system.storage.delete(entityContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}), storageEvents)
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(entityContext.id.name!, item, storageEvents)
            }
        } else if (dataContext.type === 'relation') {
            if (result === null) return
            if (this.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry('relation replace result')
            }
            const relationContext = dataContext as RelationDataContext
            await this.system.storage.delete(relationContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}), storageEvents)
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(relationContext.id.name!, item, storageEvents)
            }
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (propertyDataContext.id.name === HARD_DELETION_PROPERTY_NAME && result) {
                await this.system.storage.delete(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), storageEvents)
            } else {
                await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: result}, storageEvents)
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
    // storageEvents（可选）语义同 applyResult：迁移轨捕获派生事件用。
    async applyResultPatch(dataContext: DataContext, patch: ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined, record?: Record<string, unknown>, storageEvents?: RecordMutationEvent[]) {
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
                    await this.system.storage.create(erDataContext.id.name!, patch.data, storageEvents)
                } else if (patch.type === 'update') {
                    // Identity is located only by affectedId. Strip top-level id from patch data so
                    // computation callbacks (e.g. Transform spread) cannot rewrite logical identity
                    // even if a caller bypasses the storage update gate.
                    const updateData = (patch.data && typeof patch.data === 'object' && !Array.isArray(patch.data))
                        ? (() => {
                            const { id: _ignoredId, ...rest } = patch.data as Record<string, unknown>
                            return rest
                        })()
                        : patch.data
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.update(erDataContext.id.name!, match, updateData, storageEvents)
                } else if (patch.type === 'delete') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.delete(erDataContext.id.name!, match, storageEvents)
                }
            } else {
                const propertyDataContext = dataContext as PropertyDataContext

                if (propertyDataContext.id.name === HARD_DELETION_PROPERTY_NAME && patch.data) {
                    assert(patch.type !== 'delete', 'Hard deletion property cannot be deleted')
                    await this.system.storage.delete(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), storageEvents)
                } else {
                    if (patch.type === 'insert') {
                        await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: patch.data}, storageEvents)
                    } else if (patch.type === 'update') {
                        await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: patch.data}, storageEvents)
                    } else if (patch.type === 'delete') {
                        await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), {[propertyDataContext.id.name]: null}, storageEvents)
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
        // FR-02(b): shallow-clone context so Condition content cannot share a mutable
        // reference with the caller's object. Official admission channel is return-value merge.
        if (cloned.context && typeof cloned.context === 'object' && !Array.isArray(cloned.context)) {
            cloned.context = { ...(cloned.context as Record<string, unknown>) }
        }
        return cloned as TArgs
    }

    /**
     * Official multi-step atomic boundary for storage writes + sequential dispatch.
     *
     * Owns the outermost storage BEGIN/COMMIT. Each dispatch attempt inside the callback
     * uses a dedicated SAVEPOINT (does not change global nestedStrategy). postCommit and
     * RecordMutationSideEffect run only after the owned COMMIT succeeds.
     */
    async runInBusinessTransaction<T>(
        options: BusinessTransactionOptions,
        fn: () => Promise<T>
    ): Promise<T> {
        const name = options.name || 'businessTransaction'
        const isolation = options.isolation ?? 'READ COMMITTED'
        const onDispatchError = options.onDispatchError ?? 'abort'
        const storage = this.system.storage
        const capability = storage.getTransactionCapability()

        // A2-1
        if (!capability.transactions) {
            throw new TransactionCapabilityError({
                transactionName: name,
                requestedIsolation: isolation,
                capability,
                reason: 'driver does not support transactions',
            })
        }
        // A2-2
        if (!storage.supportsSavepoint()) {
            throw new BusinessTransactionBoundaryError({
                code: 'SAVEPOINT_UNSUPPORTED',
                businessTransactionName: name,
            })
        }
        // A2-4 before A2-3 so re-entry is distinguishable when already inside BT
        // (BT always implies an active storage transaction).
        if (getActiveBusinessTransaction()?.active) {
            throw new BusinessTransactionBoundaryError({
                code: 'REENTRANT',
                businessTransactionName: name,
            })
        }
        // A2-3
        if (storage.isInTransaction()) {
            throw new BusinessTransactionBoundaryError({
                code: 'NESTED_STORAGE_TRANSACTION',
                businessTransactionName: name,
            })
        }

        const bt: BusinessTransactionContext = {
            active: true,
            name,
            isolation,
            onDispatchError,
            deferred: [],
            aborted: false,
            savepointSeq: 0,
        }

        let fnResult: T
        try {
            fnResult = await businessTransactionContext.run(bt, async () => {
                return storage.runInTransaction({ name, isolation }, async () => {
                    return fn()
                })
            })
        } catch (error) {
            // Outer ROLLBACK already happened inside runInTransaction; discard defer.
            bt.deferred.length = 0
            bt.active = false
            throw error
        }

        // COMMIT succeeded (runInTransaction returned). Flush deferred stage P once per result.
        const deferred = bt.deferred.splice(0, bt.deferred.length)
        bt.active = false
        let anySuccessfulApplied = false
        for (const item of deferred) {
            if (!item.result.error && item.result.outcome !== 'replayed') {
                anySuccessfulApplied = true
            }
            await this.runPostCommitPhase(item.eventSource, item.args, item.result)
        }
        // Same optional hook as non-BT dispatch: after owned COMMIT + deferred postCommit.
        if (anySuccessfulApplied && this.entityRetentionOptions.runAfterSuccessfulDispatch) {
            await this.maintainEntityRetention()
        }
        return fnResult
    }

    /**
     * Unified dispatch API for all event source types.
     * First parameter is an object reference to the event source, second is the event args.
     *
     * A dispatch is the framework's synchronous fact transaction boundary:
     * guard, mapEventData, event record creation, resolve, synchronous computations,
     * and afterDispatch all run inside one retryable storage transaction attempt.
     * If any of those steps fails, the attempt is rolled back and postCommit plus
     * record mutation side effects are skipped. After a successful commit (or after the
     * owning business transaction commits), postCommit and record mutation side effects
     * run outside the transaction; their failures are reported in sideEffects without
     * rolling back committed facts.
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

        const bt = getActiveBusinessTransaction()
        // Path uniqueness: non-BT active storage transactions must not host dispatch.
        // Keep this throw outside the soft-error try so callers observe a hard boundary error.
        if (this.system.storage.isInTransaction() && bt?.active !== true) {
            throw new BusinessTransactionBoundaryError({
                code: 'DISPATCH_IN_NON_BT_TRANSACTION',
                businessTransactionName: bt?.name,
            })
        }
        if (bt?.aborted) {
            throw new BusinessTransactionBoundaryError({
                code: 'ABORTED',
                businessTransactionName: bt.name,
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
        // postCommit 必须拿到**已提交尝试**的 args（guard 会就地补全 activityId 等派生输入；
        //  外层 args 每次尝试前克隆、从不回写）。此前传原始 args：activity 头交互创建的
        //  activityId 对 postCommit 不可见（r35）。
        let committedAttemptArgs: TArgs = args
        try {
            result = await asyncInteractionContext.run(interactionContext, () => {
                if (bt?.active) {
                    return this.runDispatchAttemptsInBusinessTransaction(bt, eventSource, args, (attemptArgs) => {
                        committedAttemptArgs = attemptArgs
                    })
                }
                return runWithTransactionRetry(eventSource.name || 'dispatch', async (isolation) => {
                    const attemptArgs = this.cloneDispatchArgs(args)
                    committedAttemptArgs = attemptArgs
                    return this.runDispatchAttemptBody(eventSource, attemptArgs, isolation)
                })
            })
        } catch (e) {
            if (bt?.active) {
                // BT failure propagation: abort throws; continue returns soft error.
                // forceThrowDispatchError is ignored inside BT (only onDispatchError decides).
                if (bt.onDispatchError === 'abort') {
                    bt.aborted = true
                    throw e
                }
                result = phaseAErrorResponse(e)
            } else {
                if (this.forceThrowDispatchError) throw e
                // data/context 显式为 undefined，便于直接序列化。阶段 A 错误路径没有
                // outcome 键（与成功路径不同）；两条路径各自带上 postCommitPhase。
                result = phaseAErrorResponse(e)
            }
        }

        if (!result.error) {
            // P (postCommit + mutation side effects): never on idempotent replay.
            if (result.outcome === 'replayed') {
                result.postCommitPhase = notRunPostCommitPhase()
                return result
            }
            if (bt?.active) {
                // Defer until the business transaction's owned COMMIT succeeds.
                result.postCommitPhase = notRunPostCommitPhase()
                bt.deferred.push(
                    { kind: 'postCommitPhase', eventSource, args: committedAttemptArgs, result },
                )
            } else {
                await this.runPostCommitPhase(eventSource, committedAttemptArgs, result)
                // Optional retention maintenance after successful commit + postCommit.
                // Independent storage transaction(s); never inside the attempt body.
                if (this.entityRetentionOptions.runAfterSuccessfulDispatch) {
                    await this.maintainEntityRetention()
                }
            }
        }

        return result
    }

    private async runDispatchAttemptsInBusinessTransaction<TArgs, TResult>(
        bt: BusinessTransactionContext,
        eventSource: EventSourceInstance<TArgs, TResult>,
        args: TArgs,
        onAttemptArgs: (attemptArgs: TArgs) => void,
    ): Promise<DispatchResponse> {
        // BT-aware retry: fail-fast on RequireSerializableRetry; only W-family SAVEPOINT retries.
        // Outer isolation is fixed (initialIsolation); never upgrade mid-BT.
        return runWithTransactionRetry(
            eventSource.name || 'dispatch',
            async (_isolation, attempt) => {
                const attemptArgs = this.cloneDispatchArgs(args)
                onAttemptArgs(attemptArgs)
                const savepointName = `iqt_dispatch_${++bt.savepointSeq}`
                await this.system.storage.createSavepoint(savepointName)
                try {
                    const body = await this.runDispatchAttemptBody(eventSource, attemptArgs, bt.isolation)
                    await this.system.storage.releaseSavepoint(savepointName)
                    return body
                } catch (error) {
                    try {
                        await this.system.storage.rollbackToSavepoint(savepointName)
                    } catch {
                        // Connection may already be unusable (C-family); still propagate original error.
                    }
                    throw error
                }
            },
            {
                initialIsolation: bt.isolation,
                onRequireSerializableRetry: 'fail-fast',
                retryablePredicate: isBusinessTransactionSavepointRetryable,
            }
        )
    }

    private resolveIdempotencyParticipation<TArgs, TResult>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        attemptArgs: TArgs,
    ): { participating: false } | { participating: true; namespace: string; key: string } {
        const config = eventSource.idempotency
        if (!config) return { participating: false }
        const keyRaw = config.key(attemptArgs)
        if (typeof keyRaw !== 'string' || keyRaw.length === 0) {
            return { participating: false }
        }
        const scope = config.scope ?? 'eventSource'
        let namespace: string
        if (scope === 'eventSource') {
            namespace = eventSource.name
        } else if (scope === 'interaction') {
            const interactionKey = eventSource.idempotencyInteractionKey
            if (typeof interactionKey !== 'string' || interactionKey.length === 0) {
                throw new Error(
                    `EventSource "${eventSource.name}" uses idempotency.scope "interaction" but has no idempotencyInteractionKey. ` +
                    `Interaction.create installs this automatically; Activity wrappers forward the interaction uuid.`
                )
            }
            namespace = `interaction:${interactionKey}`
        } else if (scope && typeof scope === 'object' && typeof scope.custom === 'function') {
            const customNs = scope.custom(attemptArgs)
            if (typeof customNs !== 'string' || customNs.length === 0) {
                throw new Error(
                    `EventSource "${eventSource.name}" idempotency.scope.custom must return a non-empty string`
                )
            }
            namespace = customNs
        } else {
            throw new Error(
                `EventSource "${eventSource.name}" has an invalid idempotency.scope`
            )
        }
        return { participating: true, namespace, key: keyRaw }
    }

    private jsonSafeSubset(value: unknown): unknown {
        if (value === undefined) return undefined
        try {
            return JSON.parse(JSON.stringify(value))
        } catch {
            return undefined
        }
    }

    private async runDispatchAttemptBody<TArgs, TResult>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        attemptArgs: TArgs,
        isolation: TransactionIsolation,
    ): Promise<DispatchResponse> {
        const effectsContext = { effects: [] as RecordMutationEvent[] }
        return asyncEffectsContext.run(effectsContext, async () => {
            // Outside BT this opens BEGIN/COMMIT (or nested reuse).
            // Inside BT the outer runInBusinessTransaction already owns the transaction;
            // nested runInTransaction only increments depth (reuse) — attempt rollback is SAVEPOINT.
            return this.system.storage.runInTransaction({ name: eventSource.name, isolation }, async () => {
                return dispatchExecutionContext.run({ eventSourceName: eventSource.name }, async () => {
                    const participation = this.resolveIdempotencyParticipation(eventSource, attemptArgs)
                    let branch: 'unscoped' | 'applied' | 'replayed' = 'unscoped'
                    let stored: Awaited<ReturnType<Storage['dispatchIdempotency']['load']>> = null

                    if (participation.participating) {
                        stored = await this.system.storage.dispatchIdempotency.load(
                            participation.namespace,
                            participation.key,
                        )
                        if (stored?.state === 'succeeded') {
                            branch = 'replayed'
                        } else if (stored?.state === 'in_flight') {
                            throw new IdempotencyError({
                                code: 'IDEMPOTENCY_IN_FLIGHT',
                                namespace: participation.namespace,
                                idempotencyKey: participation.key,
                                eventSourceName: eventSource.name,
                            })
                        } else {
                            branch = 'applied'
                        }
                    }

                    // --- A admit: applied / replayed / unscoped (unless ignoreGuard) ---
                    if (!this.ignoreGuard) {
                        if (typeof eventSource.admit !== 'function') {
                            throw new Error(
                                `EventSource "${eventSource.name}" is missing admit. ` +
                                `Dispatch only runs the admit/open pipeline; install admit (conditions) and optional open (bookkeeping).`
                            )
                        }
                        await eventSource.admit.call(this, attemptArgs)
                    }

                    if (branch === 'replayed') {
                        const replayData = eventSource.idempotency?.replayData
                            ? eventSource.idempotency.replayData(attemptArgs, { data: stored?.data })
                            : stored?.data
                        return {
                            outcome: 'replayed' as const,
                            data: replayData,
                            effects: [],
                            sideEffects: {},
                            context: stored?.context,
                        }
                        // Does not run: open, map, create, resolve, afterDispatch, I-*, P
                    }

                    // --- applied / unscoped ---
                    if (branch === 'applied' && participation.participating) {
                        try {
                            await this.system.storage.dispatchIdempotency.claim(
                                participation.namespace,
                                participation.key,
                            )
                        } catch (error) {
                            if (error instanceof IdempotencyError && error.code === 'IDEMPOTENCY_CONFLICT') {
                                // Concurrent first attempt finished between load and claim.
                                // Admit already ran; return the archived success as replayed.
                                const again = await this.system.storage.dispatchIdempotency.load(
                                    participation.namespace,
                                    participation.key,
                                )
                                if (again?.state === 'succeeded') {
                                    const replayData = eventSource.idempotency?.replayData
                                        ? eventSource.idempotency.replayData(attemptArgs, { data: again.data })
                                        : again.data
                                    return {
                                        outcome: 'replayed' as const,
                                        data: replayData,
                                        effects: [],
                                        sideEffects: {},
                                        context: again.context,
                                    }
                                }
                            }
                            throw error
                        }
                    }

                    if (typeof eventSource.open === 'function') {
                        await eventSource.open.call(this, attemptArgs)
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

                    if (branch === 'applied' && participation.participating) {
                        await this.system.storage.dispatchIdempotency.finish(
                            participation.namespace,
                            participation.key,
                            {
                                data: this.jsonSafeSubset(data),
                                context: this.jsonSafeSubset(context) as Record<string, unknown> | undefined,
                                createdAt: Date.now(),
                            },
                        )
                    }

                    return {
                        outcome: participation.participating ? 'applied' as const : undefined,
                        data,
                        effects: effectsContext.effects,
                        sideEffects: {},
                        context,
                    }
                })
            })
        })
    }

    /**
     * Convergence point for stage P: postCommit, then mutation side effects, then one finalize.
     * Failures are appended during the loops; status is not inferred from the last-write-wins map.
     */
    private async runPostCommitPhase<TArgs = unknown, TResult = unknown>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        args: TArgs,
        result: DispatchResponse,
    ) {
        postCommitPhaseFailures.delete(result)
        if (!result.sideEffects) {
            result.sideEffects = {}
        }
        await this.runPostCommitHook(eventSource, args, result, this.system.logger)
        await this.runRecordChangeSideEffects(result, this.system.logger)
        finalizePostCommitPhase(result)
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
            if (!result.sideEffects) {
                result.sideEffects = {}
            }
            result.sideEffects.__postCommit = {
                error: sideEffectError,
            }
            recordPostCommitPhaseFailure(result, POST_COMMIT_HOOK_FAILURE_NAME, sideEffectError)
        }
    }

    async runRecordChangeSideEffects(result: DispatchResponse, logger: SystemLogger) {
        const mutationEvents = result.effects as RecordMutationEvent[]
        if (!result.sideEffects) {
            result.sideEffects = {}
        }
        for(let event of mutationEvents || []) {
            const sideEffects = this.recordNameToSideEffects.get(event.recordName)
            if (sideEffects) {
                for(let sideEffect of sideEffects) {
                    try {
                        result.sideEffects[sideEffect.name] = {
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
                        result.sideEffects[sideEffect.name] = {
                            error: sideEffectError
                        }
                        recordPostCommitPhaseFailure(result, sideEffect.name, sideEffectError)
                    }
                }
            }
        }
    }

    /**
     * Reconstruct a create mutation event from the current stored row and rerun every
     * RecordMutationSideEffect registered for that record name. Does not run postCommit.
     * Does not require the original DispatchResponse.effects.
     */
    async rerunCreateMutationSideEffects(
        input: RerunCreateMutationSideEffectsInput,
    ): Promise<PostCommitRerunResult> {
        this.assertRerunNotInBusinessTransaction()
        const recordName = input?.recordName
        const id = input?.id
        if (typeof recordName !== 'string' || recordName.length === 0 || id === undefined || id === null || id === '') {
            throw new PostCommitRerunError({
                code: 'INVALID_INPUT',
                recordName,
                id,
            })
        }

        const classified = classifyCreateMutationRerun(
            compiledRecordsFromStorage(this.system.storage),
            recordName,
        )
        if (classified.kind === 'unknown') {
            throw new PostCommitRerunError({
                code: 'UNKNOWN_RECORD_NAME',
                recordName,
                id,
            })
        }

        const loaded = await this.system.storage.findOne(
            recordName,
            MatchExp.atom({ key: 'id', value: ['=', id] }),
            undefined,
            classified.attributeQuery,
        )
        if (!loaded) {
            throw new PostCommitRerunError({
                code: 'RECORD_NOT_FOUND',
                recordName,
                id,
            })
        }

        const reconstructed: RecordMutationEvent = {
            type: 'create',
            recordName,
            record: loaded,
        }
        const result: DispatchResponse = {
            effects: [reconstructed],
            sideEffects: {},
        }
        postCommitPhaseFailures.delete(result)
        await this.runRecordChangeSideEffects(result, this.system.logger)
        return this.toPostCommitRerunResult(result)
    }

    /**
     * Rerun EventSource.postCommit with caller-supplied resolve/afterDispatch values (S3).
     * Must not substitute a loaded storage row for prior.data unless that EventSource's
     * resolve originally returned that row.
     */
    async rerunPostCommit<TArgs = unknown, TResult = unknown>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        args: TArgs,
        prior: Pick<DispatchResponse, 'data' | 'context'> = {},
    ): Promise<PostCommitRerunResult> {
        this.assertRerunNotInBusinessTransaction()
        assert(!!eventSource, 'eventSource is required for rerunPostCommit')
        const result: DispatchResponse = {
            effects: [],
            sideEffects: {},
            data: prior.data,
            context: prior.context,
        }
        postCommitPhaseFailures.delete(result)
        await this.runPostCommitHook(eventSource, args, result, this.system.logger)
        return this.toPostCommitRerunResult(result)
    }

    private assertRerunNotInBusinessTransaction(): void {
        const bt = getActiveBusinessTransaction()
        if (bt?.active) {
            throw new PostCommitRerunError({
                code: 'IN_BUSINESS_TRANSACTION',
                businessTransactionName: bt.name,
            })
        }
    }

    private toPostCommitRerunResult(result: DispatchResponse): PostCommitRerunResult {
        finalizePostCommitPhase(result)
        return {
            effects: result.effects ?? [],
            sideEffects: result.sideEffects ?? {},
            postCommitPhase: result.postCommitPhase ?? { status: 'complete', failures: [] },
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findEventSourceByName(name: string): EventSourceInstance<any, any> | undefined {
        return this.eventSourcesByName.get(name)
    }
}
