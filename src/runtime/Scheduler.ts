import { AttributeQueryData, MatchExp, type MatchExpressionData } from "@storage";
import { Entity, Property, Relation, EntityInstance, RelationInstance, PropertyInstance, IInstance, DictionaryInstance } from "@core";
import { DataBasedEntityEventsSourceMap, EventBasedEntityEventsSourceMap, type EtityMutationEvent } from "./ComputationSourceMap.js";
import { Controller } from "./Controller.js";
import { DataContext, PropertyDataContext, EntityDataContext, RelationDataContext } from "./computations/Computation.js";
import { assert } from "./util.js";
import {
    SchedulerError,
    ComputationError, ComputationStateError,
    ComputationDataDepError,
    ComputationProtocolError
} from "./errors/index.js";
import { Computation, ComputationClass, ComputationExecutionResult, ComputationResult, ComputationResultAsync, ComputationResultFullRecompute, ComputationResultPatch, ComputationResultResolved, ComputationResultSkip, DataBasedComputation, DataDep, DataDepEventContext, EventBasedComputation, GlobalBoundState, IncrementalPlan, LastValuePolicy, RecordBoundState, RecordsDataDep } from "./computations/Computation.js";
import { DICTIONARY_RECORD, type InternalSchemaRequirement, RecordMutationCallback, RecordMutationEvent, SYSTEM_RECORD } from "./System.js";
import { RequireSerializableRetry, runWithTransactionRetry } from "./transaction.js";
import {
    EntityEventSourceMap,
    EntityUpdateEventsSourceMap,
    DataSourceMapTree,
    ComputationSourceMapManager,
    EntityCreateEventsSourceMap
} from "./ComputationSourceMap.js";
import { createScopedSequenceSignatures, scopedSequenceComputationId } from "./scopedSequenceManifest.js";
import { AsyncLocalStorage } from "node:async_hooks";

export { EtityMutationEvent };

export const ASYNC_TASK_RECORD = '_ASYNC_TASK_'

type ComputationContextType = 'global' | 'entity' | 'relation' | 'property'

export class Scheduler {
    computationsHandles = new Map<IInstance, Computation>()
    private sourceMapManager: ComputationSourceMapManager
    private computationHandleMap: Map<any, { [key in ComputationContextType]?: { new(...args: any[]): Computation } }> = new Map()
    
    constructor(
        public controller: Controller, 
        entities: EntityInstance[], 
        relations: RelationInstance[], 
        dict: DictionaryInstance[],
        computationHandles: Array<{ new(...args: any[]): Computation }>
    ) {
        this.sourceMapManager = new ComputationSourceMapManager(this.controller, this)
        this.buildComputationHandleMap(computationHandles)
        const computationInputs: {dataContext: DataContext, args: IInstance}[] = []
        
        // 这里收集 computation 的顺序有意义。
        // 因为目前没有设计 before/after 等机制，所以以最常见的需求来排列。
        dict.forEach(dictItem => {
            if (dictItem.computation) {
                computationInputs.push({dataContext: {type: 'global',id: dictItem},args: dictItem.computation})
            }
        })

        // 把 entity/relation 的 computation 拆到最后，是因为有可能删除了，property 的变化就不需要了。
        entities.forEach(entity => {
            if (entity.computation) {
                computationInputs.push({dataContext: {type: 'entity',id: entity},args: entity.computation})
            }
        })

        // relation 
        relations.forEach(relation => {
            const relationWithComputation = relation as RelationInstance & { computation?: unknown; properties?: PropertyInstance[] };
            if(relationWithComputation.computation) {
                computationInputs.push({dataContext: {type: 'relation',id: relation},args: relationWithComputation.computation})
            }
        })

        // entity 的 property
        entities.forEach(entity => {
            entity.properties?.forEach(property => {
                if(property.computation) {
                    computationInputs.push({dataContext: {type: 'property',host: entity,id: property},args: property.computation})
                }
            })
        })

        // relation 的 property
        relations.forEach(relation => {
            const relationWithComputation = relation as RelationInstance & { computation?: unknown; properties?: PropertyInstance[] };
            relationWithComputation.properties?.forEach((property: PropertyInstance) => {
                if (property.computation) {
                    computationInputs.push({dataContext: {type: 'property',host: relation,id: property},args: property.computation})
                }
            })
        })


        for(const computationInput of computationInputs) {
            const dataContext = computationInput.dataContext
            const args = computationInput.args as { constructor: { displayName?: string; name?: string } }
            const contextMap = this.computationHandleMap.get(args.constructor)
            assert(!!contextMap, `cannot find Computation handle map for ${args.constructor.displayName || args.constructor.name}`)
            const ComputationCtor = contextMap![dataContext.type] as ComputationClass
            assert(!!ComputationCtor, `cannot find Computation handle for ${args.constructor.displayName || args.constructor.name} with context type ${dataContext.type}`)
            const computationHandle = new ComputationCtor(this.controller, args, dataContext)
            this.computationsHandles.set(dataContext.id, computationHandle)

            // 为每一个 async computation 建立自己所需要的 task 任务表。应该每一个 asyncComputation 都有一张独立的表。global state 总共一张。
            if(this.isAsyncComputation(computationHandle)) {
                const asyncTaskRecordKey = this.getAsyncTaskRecordKey(computationHandle)
                if (computationHandle.dataContext.type === 'property') {
                    const AsyncTaskEntity = new Entity({
                        name: asyncTaskRecordKey,
                        properties: [
                        new Property({
                            name: 'status',
                            type: 'string',
                        }, { uuid: `${asyncTaskRecordKey}_status` }),
                        new Property({
                            name: 'args',
                            type: 'json',
                        }, { uuid: `${asyncTaskRecordKey}_args` }),
                        new Property({
                            name: 'result',
                            type: 'json',
                        }, { uuid: `${asyncTaskRecordKey}_result` }),
                        new Property({
                            name: 'freshnessKey',
                            type: 'string',
                        }, { uuid: `${asyncTaskRecordKey}_freshnessKey` })
                    ]}, { uuid: asyncTaskRecordKey })
                    const AsyncTaskRelation = new Relation({
                        name: `${AsyncTaskEntity.name}_${computationHandle.dataContext.host.name}_${computationHandle.dataContext.id.name}`,
                        source: AsyncTaskEntity,
                        target: computationHandle.dataContext.host,
                        sourceProperty: 'record',
                        targetProperty: `_${computationHandle.dataContext.id.name}_task`,
                        type: '1:1'
                    }, { uuid: `${asyncTaskRecordKey}_record_relation` })
                    entities.push(AsyncTaskEntity)
                    relations.push(AsyncTaskRelation)
                } else if (computationHandle.dataContext.type === 'global') {
                    // Global 类型的异步任务表
                    const AsyncTaskEntity = new Entity({
                        name: asyncTaskRecordKey,
                        properties: [
                            new Property({
                                name: 'status',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_status` }),
                            new Property({
                                name: 'args',
                                type: 'json',
                            }, { uuid: `${asyncTaskRecordKey}_args` }),
                            new Property({
                                name: 'result',
                                type: 'json',
                            }, { uuid: `${asyncTaskRecordKey}_result` }),
                            new Property({
                                name: 'freshnessKey',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_freshnessKey` }),
                            new Property({
                                name: 'globalKey',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_globalKey` })
                        ]
                    }, { uuid: asyncTaskRecordKey })
                    entities.push(AsyncTaskEntity)
                } else if (computationHandle.dataContext.type === 'entity') {
                    // Entity 类型的异步任务表
                    const entityContext = computationHandle.dataContext as EntityDataContext
                    const AsyncTaskEntity = new Entity({
                        name: asyncTaskRecordKey,
                        properties: [
                            new Property({
                                name: 'status',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_status` }),
                            new Property({
                                name: 'args',
                                type: 'json',
                            }, { uuid: `${asyncTaskRecordKey}_args` }),
                            new Property({
                                name: 'result',
                                type: 'json',
                            }, { uuid: `${asyncTaskRecordKey}_result` }),
                            new Property({
                                name: 'freshnessKey',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_freshnessKey` }),
                            new Property({
                                name: 'entityName',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_entityName` })
                        ]
                    }, { uuid: asyncTaskRecordKey })
                    entities.push(AsyncTaskEntity)
                } else if (computationHandle.dataContext.type === 'relation') {
                    // Relation 类型的异步任务表
                    const relationContext = computationHandle.dataContext as RelationDataContext
                    const AsyncTaskEntity = new Entity({
                        name: asyncTaskRecordKey,
                        properties: [
                            new Property({
                                name: 'status',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_status` }),
                            new Property({
                                name: 'args',
                                type: 'json',
                            }, { uuid: `${asyncTaskRecordKey}_args` }),
                            new Property({
                                name: 'result',
                                type: 'json',
                            }, { uuid: `${asyncTaskRecordKey}_result` }),
                            new Property({
                                name: 'freshnessKey',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_freshnessKey` }),
                            new Property({
                                name: 'relationName',
                                type: 'string',
                            }, { uuid: `${asyncTaskRecordKey}_relationName` })
                        ]
                    }, { uuid: asyncTaskRecordKey })
                    entities.push(AsyncTaskEntity)
                }
            }
        }

        // this.addMutationListeners()
    }
    
    private buildComputationHandleMap(computationHandles: Array<{ new(...args: any[]): Computation }>) {
        for (const handle of computationHandles) {
            const handleClass = handle as any
            if (handleClass.computationType && handleClass.contextType) {
                if (!this.computationHandleMap.has(handleClass.computationType)) {
                    this.computationHandleMap.set(handleClass.computationType, {})
                }
                const contextMap = this.computationHandleMap.get(handleClass.computationType)!
                
                if (Array.isArray(handleClass.contextType)) {
                    for (const contextType of handleClass.contextType) {
                        assert(!contextMap[contextType as ComputationContextType], `${contextType} for ${handleClass.computationType.name} is already registered.`)
                        contextMap[contextType as ComputationContextType] = handle
                    }
                } else {
                    contextMap[handleClass.contextType as ComputationContextType] = handle
                }
            }
        }
    }
    
    getBoundStateName(dataContext: DataContext, stateName: string, stateItem: RecordBoundState<any>|GlobalBoundState<any>) {

        const stateDataContextKey = dataContext.type === 'property' ? 
            `${dataContext.host.name}_${dataContext.id.name}` : 
            dataContext.id.name

        return `_${stateDataContextKey}_bound_${stateName}`
    }
    createStates() {
        const states: {dataContext: DataContext, state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}}[] = []
        for(const computation of this.computationsHandles.values()) {
            if (computation.createState) {
                const state = computation.createState()
                states.push({dataContext: computation.dataContext, state})
                computation.state = state


                for(let [stateName, stateItem] of Object.entries(state)) {
                    stateItem.controller = this.controller
                    stateItem.key = this.getBoundStateName(computation.dataContext, stateName, stateItem)
                    if (stateItem instanceof RecordBoundState) {
                        if (!stateItem.record) {
                            if (computation.dataContext.type === 'property') {
                                stateItem.record = (computation.dataContext as PropertyDataContext)!.host.name!
                            } else if (computation.dataContext.type === 'entity') {
                                stateItem.record = (computation.dataContext as EntityDataContext)!.id.name!
                            } else if (computation.dataContext.type === 'relation') {
                                stateItem.record = (computation.dataContext as RelationDataContext)!.id.name!
                            } else {
                                throw new Error(`global data context ${(computation.dataContext as any).id.name} must specify record name for RecordBoundState`)
                            }
                        }
                    }
                }
            }   
        }
        return states
    }

    createInternalSchemaRequirements(): InternalSchemaRequirement[] {
        const declarations = Array.from(this.computationsHandles.values())
            .filter(computation => (computation.args as { _type?: string })._type === 'ScopedSequence')
            .map(computation => {
                const args = computation.args as Record<string, unknown> & { name?: string }
                const hostRecord = computation.dataContext.type === 'property'
                    ? computation.dataContext.host.name!
                    : computation.dataContext.id.name!
                const property = computation.dataContext.type === 'property' ? computation.dataContext.id.name! : ''
                const signatures = createScopedSequenceSignatures(args)
                return {
                    computationId: scopedSequenceComputationId(hostRecord, property),
                    hostRecord,
                    property,
                    sequenceName: String(args.name),
                    scopeSignature: signatures.scopeSignature,
                    allocationSignature: signatures.allocationSignature,
                }
            })
        return declarations.length ? [{ kind: 'scoped-sequence-table', declarations }] : []
    }

    async createStateData(instance: IInstance, ...args: any[]) {
        const computationHandle = this.computationsHandles.get(instance)
        assert(!!computationHandle, `cannot find computation handle`)
        return computationHandle!.createStateData?.(...args) ?? {}
    }
    // CAUTION setup() 可能在同一 controller 生命周期内被调用多次（重复 setup、migrate 之后的重建）。
    //  mutation listener 的注册必须幂等：这里跟踪本 scheduler 注册过的所有 listener，
    //  重新 setup 时先注销旧的，否则同一 mutation 会触发多次计算（Transform 直接撞唯一索引，
    //  非幂等的增量计算会静默产生错误结果）。
    private registeredMutationListeners: RecordMutationCallback[] = []
    private registerMutationListener(callback: RecordMutationCallback) {
        this.controller.system.storage.listen(callback)
        this.registeredMutationListeners.push(callback)
    }
    private removeRegisteredMutationListeners() {
        for (const callback of this.registeredMutationListeners) {
            this.controller.system.storage.unlisten?.(callback)
        }
        this.registeredMutationListeners = []
    }
    /**
     * 注销本 scheduler 注册的全部 mutation listener。
     * 长生命周期进程（热重载、多租户单进程）反复 new Controller + setup 时，
     * 不 teardown 会让旧 controller 的计算闭包永驻 storage 的回调集合——内存泄漏，
     * 且旧计算仍会被新写入触发。
     * dict 读回退一并清除：teardown 后 storage 若继续被使用（如另一个 controller
     * setup 之前的窗口期），不应再返回本 controller 声明的默认值。
     */
    teardown() {
        this.removeRegisteredMutationListeners()
        this.controller.system.storage.dict.registerDefaults?.(new Map())
    }
    /**
     * 把声明的 Dictionary.defaultValue 注册为 dict 读回退（无存储行时生效）。
     * CAUTION 工厂在这里**求值一次**、注册求出的值——与 install 路径（setupDictDefaultValue
     * 求值一次并持久化）语义对齐。若把工厂原样下放到每次读 miss 时求值，非幂等工厂
     * （`() => Date.now()`、`() => ({...})`）会让同一事务内的两次读拿到不同的"事实"。
     */
    registerDictDefaults() {
        const dictDefaults = new Map<string, unknown>()
        for (const dict of this.controller.dict) {
            if (dict.defaultValue !== undefined) {
                dictDefaults.set(dict.name, dict.defaultValue())
            }
        }
        this.controller.system.storage.dict.registerDefaults?.(dictDefaults)
    }
    private buildPropertyDefaultValueListeners(): RecordMutationCallback[] {
        const listeners: RecordMutationCallback[] = []
        for(const computation of this.computationsHandles.values()) {
            if(computation.getInitialValue) {
                if (computation.dataContext.type==='property') {
                    // property 的默认值需要在 scheduler 监听 property 的 record 创建事件，来设置默认值。
                    // 监听 record 的创建事件，来设置默认值。
                    const propertyDataContext = computation.dataContext as PropertyDataContext

                    // assertion: 有 computation 的 property 就不能有原本的 defaultValue 了，因为会被 computation 的 getInitialValue 覆盖。
                    assert(!propertyDataContext.id.defaultValue, `${propertyDataContext.host.name}.${propertyDataContext.id.name} property should not have a defaultValue, because it will be overridden by computation`)

                    // TODO 未来合成一个 listener ?
                    listeners.push(async (mutationEvents) => {
                        for(let mutationEvent of mutationEvents){
                            if (mutationEvent.type === 'create' && mutationEvent.recordName === propertyDataContext.host.name) {
                                const defaultValue = await computation.getInitialValue?.(mutationEvent.record)
                                if (defaultValue !== undefined) {
                                    // 初始值回写属于创建语义，走内部写路径并把结果并入 create 事件的 record，
                                    // 不产生可被计算消费的业务 update 事件（否则会误触发监听宿主 update 的 StateMachine 等计算）。
                                    await this.controller.applyInitialValue(propertyDataContext, defaultValue, mutationEvent.record!)
                                }
                            }
                        }
                    })
                }
            }
        }
        return listeners
    }
    async setupGlobalComputationDefaultValue() {
        for(const computation of this.computationsHandles.values()) {
            // CAUTION 非 property 的 computation 的 defaultValue 直接 applyResult 即可。
            if(computation.getInitialValue) {
                if (computation.dataContext.type==='global' ) {
                // if (computation.dataContext.type==='global' || computation.dataContext.type==='entity' || computation.dataContext.type==='relation') {
                    const defaultValue = await computation.getInitialValue()
                    await this.controller.applyResult(computation.dataContext, defaultValue)
                }
            }
        }
    }
    async setupGlobalBoundStateDefaultValues() {
        for(const computation of this.computationsHandles.values()) {
            const computationHandle = computation as Computation
            // 1. 创建计算所需要的 state
            if (computationHandle.state) {
                for(const state of Object.values(computationHandle.state)) {
                    if (state instanceof GlobalBoundState) {
                        state.controller = this.controller
                        await state.setInternal(state.defaultValue ?? null)
                    } 
                }
            }
        }
    }
    erMutationEventSources: EntityEventSourceMap[] = []
    dataSourceMapTree: DataSourceMapTree = {}
    // ScopedSequence 的 scope 输入不可变守卫（见 buildScopedSequenceScopeGuards）。
    private scopedSequenceScopeGuards: Array<{
        hostName: string,
        propertyName: string,
        sequenceName: string,
        valueFields: string[],
        // 关系属性名 -> 该关系的 record name（link delete 事件按此路由）
        refRelations: Map<string, { relationName: string, hostIsSource: boolean }>
    }> = []
    /**
     * ScopedSequence 的序号在创建时按 scope 一次性分配（getInitialValue），scope 是号码的
     * 身份组成部分。事后修改 scope 输入字段（值字段更新 / scope 关系解除或替换）不会重新编号，
     * 会静默产出「同一 scope 内重复号码」；配合文档推荐的 UniqueConstraint 时，目标 scope 的
     * 后续 create 会永久撞唯一约束（计数器随事务回滚，无法自愈）。
     * 声明式语义下 scope 输入是 create-time stable 字段——这里在 mutation 监听层 fail-fast，
     * 把静默数据损坏转为受控错误。未编号记录（match 未命中，序号列为 null）不受限制。
     */
    private buildScopedSequenceScopeGuards() {
        this.scopedSequenceScopeGuards = []
        for (const computation of this.computationsHandles.values()) {
            const args = computation.args as { scope?: Array<{ name: string, type: string, path: string }>, name?: string } & IInstance
            if ((args as { _type?: string })._type !== 'ScopedSequence') continue
            if (computation.dataContext.type !== 'property') continue
            const dataContext = computation.dataContext as PropertyDataContext
            const hostName = dataContext.host.name!
            const valueFields: string[] = []
            const refRelations = new Map<string, { relationName: string, hostIsSource: boolean }>()
            for (const item of (args.scope || [])) {
                const topField = item.path.split('.')[0]
                if (item.type === 'ref') {
                    const relation = this.controller.relations.find(r =>
                        (r.source?.name === hostName && r.sourceProperty === topField) ||
                        (r.target?.name === hostName && r.targetProperty === topField)
                    )
                    if (relation) {
                        refRelations.set(topField, {
                            relationName: relation.name!,
                            hostIsSource: relation.source?.name === hostName && relation.sourceProperty === topField
                        })
                    } else {
                        // ref scope 也可能以行内 id 值字段实现（如 type:'id' 的普通属性），按值字段守卫。
                        valueFields.push(topField)
                    }
                } else {
                    valueFields.push(topField)
                }
            }
            this.scopedSequenceScopeGuards.push({
                hostName,
                propertyName: dataContext.id.name,
                sequenceName: args.name!,
                valueFields,
                refRelations
            })
        }
    }
    private async assertScopedSequenceScopeUnchanged(mutationEvent: RecordMutationEvent) {
        for (const guard of this.scopedSequenceScopeGuards) {
            // 1. 值字段：宿主 update 事件中 scope 字段实际变化，且记录已编号 → 拒绝。
            if (mutationEvent.type === 'update' && mutationEvent.recordName === guard.hostName) {
                const changed = guard.valueFields.filter(field =>
                    mutationEvent.record?.hasOwnProperty(field) &&
                    mutationEvent.record[field] !== mutationEvent.oldRecord?.[field]
                )
                if (changed.length && mutationEvent.oldRecord?.[guard.propertyName] != null) {
                    throw new ComputationProtocolError(
                        `ScopedSequence "${guard.sequenceName}": scope field${changed.length > 1 ? 's' : ''} ${changed.map(f => `"${f}"`).join(', ')} of ${guard.hostName}.${guard.propertyName} cannot change after a sequence number is assigned. ` +
                        `Sequence numbers are allocated once at creation per scope; moving a numbered record to another scope silently duplicates numbers there (and permanently violates a unique constraint over scope+number, if declared). ` +
                        `Delete and recreate the record in the new scope, or model the mutable dimension outside the sequence scope.`,
                        { handleName: 'ScopedSequence', computationPhase: 'scope-immutability-guard' }
                    )
                }
            }
            // 2. ref 字段：scope 关系的 delete 事件（解除或替换），宿主仍存在且已编号 → 拒绝。
            //    宿主整体删除的级联 unlink 不受影响（届时宿主行已不存在）。
            if (mutationEvent.type === 'delete') {
                for (const [field, refInfo] of guard.refRelations) {
                    if (mutationEvent.recordName !== refInfo.relationName) continue
                    const hostId = (mutationEvent.record as { source?: { id?: unknown }, target?: { id?: unknown } } | undefined)?.[refInfo.hostIsSource ? 'source' : 'target']?.id
                    if (hostId === undefined) continue
                    const host = await this.controller.system.storage.findOne(
                        guard.hostName,
                        MatchExp.atom({ key: 'id', value: ['=', hostId] }),
                        undefined,
                        ['id', guard.propertyName]
                    )
                    if (host && host[guard.propertyName] != null) {
                        throw new ComputationProtocolError(
                            `ScopedSequence "${guard.sequenceName}": scope relation "${field}" of ${guard.hostName}.${guard.propertyName} cannot be removed or replaced after a sequence number is assigned. ` +
                            `Sequence numbers are allocated once at creation per scope; re-scoping a numbered record silently duplicates numbers in the target scope (and permanently violates a unique constraint over scope+number, if declared). ` +
                            `Delete and recreate the record in the new scope, or model the mutable dimension outside the sequence scope.`,
                            { handleName: 'ScopedSequence', computationPhase: 'scope-immutability-guard' }
                        )
                    }
                }
            }
        }
    }
    // CAUTION 计算传播的重入守卫。计算的写回（applyResult/applyResultPatch）会在同一事务内
    //  立即重入 mutation listener，触发下游计算——这是反应式语义的主干。但循环依赖的声明
    //  （互相派生的 Transform、dataDeps 引用自身输出的 dict 等）会让这条链永不收敛：
    //  Transform 环每一跳都创建新记录（无限增长），dict 环每一跳都改写值（无限重算），
    //  表现为 dispatch/setup 无任何报错地挂起或栈溢出。这里用 AsyncLocalStorage 记录
    //  传播深度（并发事务互不串扰），超限时抛出带传播轨迹的受控错误。
    //  上限对合法的深计算链（实践中通常 < 10 跳）留了充足余量。
    static MAX_COMPUTATION_PROPAGATION_DEPTH = 100
    private propagationContext = new AsyncLocalStorage<{ depth: number, trail: string[] }>()
    private buildComputationMutationListener(): RecordMutationCallback {
        this.sourceMapManager.initialize(new Set(this.computationsHandles.values()))
        this.dataSourceMapTree = this.sourceMapManager.getSourceMapTree()
        this.buildScopedSequenceScopeGuards()

        return (async (mutationEvents) => {
            const parent = this.propagationContext.getStore()
            const depth = (parent?.depth ?? 0) + 1
            if (depth > Scheduler.MAX_COMPUTATION_PROPAGATION_DEPTH) {
                const trailTail = (parent?.trail ?? []).slice(-10).join(' -> ')
                throw new SchedulerError(
                    `Computation propagation exceeded the maximum depth of ${Scheduler.MAX_COMPUTATION_PROPAGATION_DEPTH}. ` +
                    `This almost always means circular computation dependencies (e.g. two Transforms deriving records from each other, ` +
                    `or a computation whose dataDeps include its own output). Recent propagation trail: ${trailTail}`,
                    { schedulingPhase: 'computation-propagation-depth-guard' }
                )
            }
            const trail = parent?.trail ?? []
            await this.propagationContext.run({ depth, trail }, async () => {
                for(let mutationEvent of mutationEvents){
                    await this.assertScopedSequenceScopeUnchanged(mutationEvent)
                    const sources = this.sourceMapManager.findSourceMapsForMutation(mutationEvent)
                    if (sources.length > 0) {
                        // CAUTION 同一计算声明多个 property dataDeps 时，每个 dep 都注册了自己的监听——
                        //  一次 update 同时命中 N 个 dep 会得到 N 个 source，逐个执行会让同一计算对
                        //  **同一个事件**跑 N 次（useLastValue 的增量被双重叠加、create 的初始计算双跑）。
                        //  两次调用收到的是同一个事件对象，用户层无从区分去重（event.recordName/keys 全同），
                        //  必须由框架合并：property dep（自身或同一 targetPath 的关联路径）对同一事件
                        //  语义上就是「宿主的一次变更」，按 (computation, targetPath) 去重。
                        //  records 型 dep 不去重——不同 dep 携带不同 match，membership 判定
                        //  （entered/left/skip）按 dep 独立求值是增量语义的一部分。
                        // CAUTION 事件驱动计算（Transform eventDeps / StateMachine trigger）同理按
                        //  (computation, event) 去重（r28）：多个 eventDep 是订阅模式的**并集**不是
                        //  执行倍增器——重叠模式（宽窄两个 eventDep 同时命中一个 create）此前让
                        //  eventBasedIncrementalPatchCompute 对同一事件插入两份派生记录（静默重复行）。
                        //  两次调用收到完全相同的事件对象、callback 无 dep 身份可区分，只能由框架合并
                        //  （StateMachine 注册期已按 (recordName,type) 折叠 + 脏记录去重，天然单跑；
                        //  本守卫把同一契约提升到全部事件驱动计算）。
                        const ranPropertyDepPaths = new Map<Computation, Set<string>>()
                        const ranEventBasedComputations = new Set<Computation>()
                        for(const source of sources) {
                            if(!this.sourceMapManager.shouldTriggerUpdateComputation(source, mutationEvent)) {
                                continue
                            }
                            // 对于 EventBasedComputation，进行深度匹配检查
                            if (!('dataDep' in source)) {
                                if (!this.sourceMapManager.shouldTriggerEventBasedComputation(source as EventBasedEntityEventsSourceMap, mutationEvent)) {
                                    continue
                                }
                                if (ranEventBasedComputations.has(source.computation)) {
                                    continue
                                }
                                ranEventBasedComputations.add(source.computation)
                            }
                            if ('dataDep' in source && (source as DataBasedEntityEventsSourceMap).dataDep.type === 'property') {
                                const pathKey = ((source as DataBasedEntityEventsSourceMap).targetPath || []).join('.')
                                let ranPaths = ranPropertyDepPaths.get(source.computation)
                                if (!ranPaths) {
                                    ranPaths = new Set<string>()
                                    ranPropertyDepPaths.set(source.computation, ranPaths)
                                }
                                if (ranPaths.has(pathKey)) {
                                    continue
                                }
                                ranPaths.add(pathKey)
                            }
                            // filtered 源的 update 监听挂在物理 base 名上（见 ComputationSourceMap），
                            // 路由前做成员资格守卫并把事件名改写回 filtered 名。
                            const routedEvent = await this.resolveFilteredUpdateEvent(source, mutationEvent, mutationEvents)
                            if (!routedEvent) {
                                continue
                            }
                            trail.push(this.getComputationName(source.computation))
                            if (trail.length > 32) trail.splice(0, trail.length - 32)
                            await this.runDirtyRecordsComputation(source, routedEvent)
                        }
                    }
                }
            })
        })
    }
    /**
     * filtered entity/relation 源上的 update 事件路由守卫。
     *
     * 背景：storage 的字段 update 事件只以物理 base 记录名发出；filtered 名下只有
     * 成员资格 create/delete 事件。为了让「成员留在集合内的字段更新」也能触发计算，
     * source map 把 filtered 源的 update 监听注册到物理名上（携带 filteredRecordName）——
     * 数据驱动（dataDep）与事件驱动（StateMachine trigger / Transform eventDep）两条轨道
     * 都经过这一守卫。这里补上语义守卫，保证与成员资格事件不重复计算：
     *  1. 同一事件批次里已有该记录在该 filtered 源上的成员资格 create/delete
     *     （enter/exit 场景）→ 跳过，由成员资格事件驱动计算；
     *  2. 否则查询当前成员资格：仍是成员 → 以 filtered 名改写事件后放行（stay-in 更新）；
     *     不是成员 → 跳过（无关记录的字段更新）。
     * 事件驱动计算收到的是改写后（filtered 名）的事件，与 trigger/eventDep 声明的
     * recordName 一致，TransitionFinder / callback 的模式匹配才能命中。
     *
     * 带 targetPath 的（property/关联路径）监听不需要此守卫：computeDirtyDataDepRecords
     * 与各 handle 的增量分支都通过 filtered 路径查询定位记录，成员资格由查询本身保证。
     *
     * CAUTION 非 private：MigrationScheduler（migration.ts）的增量重算路径必须复用同一守卫，
     *  否则迁移期的链式 rebuild 对 filtered 源会出现「成员资格事件 + 字段 update」双计或错误路由。
     */
    async resolveFilteredUpdateEvent(
        source: EntityEventSourceMap,
        mutationEvent: RecordMutationEvent,
        batchEvents: RecordMutationEvent[]
    ): Promise<RecordMutationEvent | null> {
        if (source.type !== 'update') return mutationEvent
        const filteredRecordName = (source as { filteredRecordName?: string }).filteredRecordName
        if (!filteredRecordName) return mutationEvent
        if ('dataDep' in source && (source as EntityUpdateEventsSourceMap).targetPath?.length) return mutationEvent

        const recordId = mutationEvent.record?.id ?? mutationEvent.oldRecord?.id
        if (recordId === undefined) return null

        // 1. enter/exit 由同批次的成员资格事件驱动，避免双计。
        const hasMembershipEventInBatch = batchEvents.some(event =>
            event !== mutationEvent &&
            event.recordName === filteredRecordName &&
            (event.type === 'create' || event.type === 'delete') &&
            (event.record?.id ?? event.oldRecord?.id) === recordId
        )
        if (hasMembershipEventInBatch) return null

        // 2. stay-in / stay-out 判定：按 filtered 名查询当前成员资格。
        const member = await this.controller.system.storage.findOne(
            filteredRecordName,
            MatchExp.atom({ key: 'id', value: ['=', recordId] }),
            undefined,
            ['id']
        )
        if (!member) return null

        return { ...mutationEvent, recordName: filteredRecordName }
    }
    async computeDirtyDataDepRecords(source: DataBasedEntityEventsSourceMap, mutationEvent: RecordMutationEvent): Promise<any[]> {
        // 1. 就是自身的变化
        if(!source.targetPath?.length) {
            return [mutationEvent.oldRecord ?? mutationEvent.record]
        }

        // 2. 关联关系、关联实体的变化
        let dirtyDataDepRecords: any[] = []
        if (!source.isRelation) { 
            // 2.1. 关联实体的 update 事件，create/delete 不用管，因为那些会先有关系的 create/delete 事件。
            assert(source.type === 'update', 'only support update event for entity')
            dirtyDataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                key: source.targetPath!.concat('id').join('.'),
                value: ['=', mutationEvent.oldRecord!.id]
            }), undefined)
        } else {
            // 2.2. 关联关系的 create/delete 事件(不一定是直接的关联关系)，计算出关联关系的增删改最终影响了哪些当前 dataDep
            assert(source.type === 'create' || source.type === 'delete', 'only support create/delete event for relation')
            
            const dataDep = source.dataDep as RecordsDataDep
            if (source.type === 'create') {
                dirtyDataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                    key: source.targetPath!.concat(['&','id']).join('.'),
                    value: ['=', mutationEvent.record!.id]
                }), undefined)
            } else {
                // 关系的删除
                // TODO 需要确定一下，是不是没考虑 targetPath 中间 semmetric relation 的情况
                const relation = this.controller.relations.find(relation => relation.name === source.recordName)!
                const isSemmetricRelation = relation.sourceProperty === relation.targetProperty && relation.source === relation.target

                if (isSemmetricRelation) {
                    dirtyDataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                        // 因为关系已经删掉了，所以必须用倒数第二个节点的信息来判断影响了谁。
                        key: source.targetPath!.slice(0, -1).concat('id').join('.'),
                        value: ['in', [mutationEvent.record!.source.id, mutationEvent.record!.target.id]]
                    }), undefined)
                } else {
                    const isSource = relation?.sourceProperty === source.targetPath!.at(-1)
                    dirtyDataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                        // 因为关系已经删掉了，所以必须用倒数第二个节点的信息来判断影响了谁。
                        key: source.targetPath!.slice(0, -1).concat('id').join('.'),
                        value: ['=', mutationEvent.record![isSource ? 'source' : 'target']!.id]
                    }), undefined)
                }
                
            }
        }

        return dirtyDataDepRecords
    }
    async computeDataBasedDirtyRecordsAndEvents(source: DataBasedEntityEventsSourceMap, mutationEvent: RecordMutationEvent) {
        let dirtyRecordsAndEvents: [any, EtityMutationEvent][] = []

        // 特殊处理 Global 类型的数据依赖
        if (source.dataDep.type === 'global' && mutationEvent.recordName === DICTIONARY_RECORD) {
            // 对于 Global 类型，需要找到所有依赖这个 global 值的记录
            // 如果是 property 级别的 dataContext，需要找到所有实体记录，就是记录都受影响了
            if (source.computation.dataContext.type === 'property') {
                const propertyContext = source.computation.dataContext as PropertyDataContext
                const allRecords = await this.controller.system.storage.find(propertyContext.host.name!, MatchExp.atom({key:'id', value:['not', null]}), {}, ['*'])
                dirtyRecordsAndEvents = allRecords.map(record => [record, {
                    dataDep: source.dataDep,
                    type: 'update',
                    recordName: propertyContext.host.name!,
                    record: record,
                    // 变化发生在 global dict 上，宿主记录自身没有变：old/new 快照内容相同是语义事实，
                    // 但必须是独立副本，避免消费方原地修改 record 时污染 oldRecord。
                    oldRecord: {...record},
                    relatedMutationEvent: mutationEvent
                }])
            } else if (source.computation.dataContext.type === 'global') {
                // 对于 global 级别的计算，不需要具体的记录
                dirtyRecordsAndEvents = [[null, {
                    dataDep: source.dataDep,
                    ...mutationEvent
                }]]
            }
        } else if(!source.targetPath?.length) {
            // 就是本身变化了。
            dirtyRecordsAndEvents = [[mutationEvent.record, {
                dataDep: source.dataDep,
                ...mutationEvent
            }]]
        } else {
            // 是关联关系或者关联实体变化了
            const dataDepRecords = await this.computeDirtyDataDepRecords(source, mutationEvent)
            dirtyRecordsAndEvents = dataDepRecords.map(record => [record, {
                dataDep: source.dataDep,
                type: 'update',
                recordName: source.sourceRecordName,
                record: record,
                // CAUTION 关联路径的合成宿主 update 事件拿不到宿主的"变更前"快照（变化发生在关联记录上，
                //  宿主行自身没有旧值）。这里如实置 undefined，而不是像旧实现那样用当前记录副本冒充
                //  oldRecord——假的 oldRecord 会让依赖 old/new diff 的自定义增量计算把成员资格变化误判
                //  为 none。真正的变更前后快照在 relatedMutationEvent 上；框架内消费方
                //  （buildMatchEventContext）对带 relatedAttribute 的事件一律走 full recompute。
                oldRecord: undefined,
                relatedAttribute: source.targetPath,
                relatedMutationEvent: mutationEvent
            }])
        }
        return dirtyRecordsAndEvents
    }
    async computeEventBasedDirtyRecordsAndEvents(source: EventBasedEntityEventsSourceMap, mutationEvent: RecordMutationEvent) {
        const eventBasedComputation = source.computation as EventBasedComputation
        if (eventBasedComputation.computeDirtyRecords) {
            let dirtyRecords = (await eventBasedComputation.computeDirtyRecords!(mutationEvent)) || []
            dirtyRecords = Array.isArray(dirtyRecords) ? dirtyRecords : [dirtyRecords]
            return dirtyRecords.filter(Boolean).map(record => [record, mutationEvent]) as [any, EtityMutationEvent][]
        } else {
            return [[null, mutationEvent]] as [any, EtityMutationEvent][]
        }
    }
    isDataBasedComputation(computation: Computation): computation is DataBasedComputation {
        // return (computation as DataBasedComputation).compute !== undefined
        return !(computation as EventBasedComputation).eventDeps
    }
    async runDirtyRecordsComputation(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        try {
            if ((source as EntityCreateEventsSourceMap).isInitial) {
                await this.runComputation(source.computation, mutationEvent, mutationEvent.record, true)
            } else {
                let dirtyRecordsAndEvents: [any, EtityMutationEvent][] = []
                
                try {
                    if (this.isDataBasedComputation(source.computation)) {
                        dirtyRecordsAndEvents = await this.computeDataBasedDirtyRecordsAndEvents(source as DataBasedEntityEventsSourceMap, mutationEvent)
                    } else {
                        dirtyRecordsAndEvents = await this.computeEventBasedDirtyRecordsAndEvents(source, mutationEvent)
                    }
                } catch (e) {
                    const error = new ComputationError('Failed to compute dirty records and events', {
                        handleName: source.computation.constructor.name,
                        computationName: source.computation.args.constructor.displayName,
                        dataContext: source.computation.dataContext,
                        computationPhase: 'dirty-records-computation',
                        causedBy: e instanceof Error ? e : new Error(String(e))
                    })
                    throw error
                }
        
                for(const [record, erRecordMutationEvent] of dirtyRecordsAndEvents) {
                    try {
                        await this.runComputation(source.computation, erRecordMutationEvent, record)
                    } catch (e) {
                        // CAUTION 单条记录的计算失败会中断整批并使事务回滚（fail-fast）。
                        //  绝不能"跳过失败的记录继续"——那会留下部分计算结果的静默不一致。
                        const error = new ComputationError('Failed to run computation for dirty record', {
                            handleName: source.computation.constructor.name,
                            computationName: source.computation.args.constructor.displayName,
                            dataContext: source.computation.dataContext,
                            computationPhase: 'batch-computation',
                            context: { recordId: record?.id },
                            causedBy: e instanceof Error ? e : new Error(String(e))
                        })
                        throw error
                    }
                }
            }
        } catch (e) {
            if (e instanceof ComputationError) {
                throw e
            }
            const error = new SchedulerError('Unexpected error in dirty records computation', {
                schedulingPhase: 'dirty-records-processing',
                failedComputations: [source.computation.args.constructor.displayName],
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
    }
    getAsyncTaskRecordKey(computation: Computation) {
        if (computation.dataContext.type === 'property') {
            const propertyContext = computation.dataContext as PropertyDataContext
            return `${ASYNC_TASK_RECORD}_${propertyContext.host.name}_${propertyContext.id.name}`
        } else if (computation.dataContext.type === 'global') {
            return `${ASYNC_TASK_RECORD}_${computation.dataContext.id.name}`
        } else {
            // entity 或其他类型
            return `${ASYNC_TASK_RECORD}_${computation.dataContext.type}_${(computation.dataContext as any).id?.name}`
        }
    }
    private getComputationName(computation: Computation) {
        return (computation.args as any).name || computation.args.constructor.displayName
    }
    private isCustomSerializable(computation: Computation) {
        return (computation.args as any)?._type === 'Custom' && (computation.args as any).concurrency !== 'atomic-safe'
    }
    private requireSerializableForCustomCallback(computation: Computation, phase: string) {
        if (this.isCustomSerializable(computation) && this.controller.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
            throw new RequireSerializableRetry(`${phase} custom computation ${this.getComputationName(computation)}`)
        }
    }
    private requiresSerializablePatchApply(computation: Computation) {
        return (
            (computation.dataContext.type === 'entity' || computation.dataContext.type === 'relation') &&
            this.isCustomSerializable(computation)
        )
    }
    private hasUnsafeRecordsModifier(dataDep?: DataDep) {
        if (!dataDep || dataDep.type !== 'records' || !dataDep.modifier) return false
        const modifier = dataDep.modifier as Record<string, unknown>
        return modifier.limit !== undefined || modifier.offset !== undefined || modifier.orderBy !== undefined
    }
    /**
     * 从 match key 路径读取事件快照上的值。
     * CAUTION 「键缺席」与「值为 null」必须区分（r21 F-1）：事件快照只携带写入时的字段——
     *  computed 列、未涉及的关系属性都可能缺席但在库里有值。把缺席当 undefined 参与比较
     *  会让本地判定与 SQL 判定分裂（`=` 误判 false → 错误 skip → 计算静默陈旧；
     *  `!=` 误判 true → 幻影 entered → 计算多计）。
     *  中段值为 null（快照如实携带的空关系）按 LEFT JOIN 语义解析为终端 NULL——
     *  与 SQL 的三值逻辑照常比较。
     */
    private readMatchPath(record: Record<string, unknown>, path: string): { resolved: true, value: unknown } | { resolved: false } {
        let current: unknown = record
        for (const part of path.split('.')) {
            if (current === null) return { resolved: true, value: null }
            if (current === undefined || typeof current !== 'object' || Array.isArray(current)) return { resolved: false }
            if (!Object.prototype.hasOwnProperty.call(current, part)) return { resolved: false }
            current = (current as Record<string, unknown>)[part]
        }
        return { resolved: true, value: current === undefined ? null : current }
    }
    /**
     * 本地比较必须与 SQL 谓词求值（MatchExp 编译结果 + 三值逻辑）语义一致，
     * 不可判定时返回 undefined（上层走保守的 full recompute）。
     * - `=`/`!=` 对 null 操作数按 IS NULL / IS NOT NULL（与 MatchExp 编译一致）；
     *   NULL 行对非 null 操作数的任何比较都是 UNKNOWN（不匹配）。
     * - in/not in 按 r20 编译期 null 拆分后的语义（in 含 null → IS NULL OR IN(非空集)；
     *   not in 无论列表是否含 null，NULL 行都不匹配）。
     * - like 的大小写敏感性因驱动而异（PG 敏感 / SQLite ASCII 不敏感）且 `_` 通配未实现——不可判定。
     * - 对象/数组值（json 列、ref 对象、Date）无法在本地忠实模拟 SQL 比较——不可判定。
     */
    private compareMatchValue(value: unknown, operator: unknown, operand: unknown): boolean | undefined {
        const op = typeof operator === 'string' ? operator.toLowerCase() : operator
        const isComparableScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        switch (op) {
            case '=':
            case '==':
                if (operand === null) return value === null
                if (value === null) return false
                if (!isComparableScalar(value) || !isComparableScalar(operand)) return undefined
                return value === operand
            case '!=':
            case '<>':
                if (operand === null) return value !== null
                if (value === null) return false
                if (!isComparableScalar(value) || !isComparableScalar(operand)) return undefined
                return value !== operand
            case 'not':
                // MatchExp 的 'not' 只支持 null（IS NOT NULL），其余形态编译期报错——本地不可判定。
                return operand === null ? value !== null : undefined
            case 'is null':
                return value === null
            case 'is not null':
                return value !== null
            case '>':
                if (value === null || operand === null) return false
                return typeof value === 'number' && typeof operand === 'number' ? value > operand : undefined
            case '>=':
                if (value === null || operand === null) return false
                return typeof value === 'number' && typeof operand === 'number' ? value >= operand : undefined
            case '<':
                if (value === null || operand === null) return false
                return typeof value === 'number' && typeof operand === 'number' ? value < operand : undefined
            case '<=':
                if (value === null || operand === null) return false
                return typeof value === 'number' && typeof operand === 'number' ? value <= operand : undefined
            case 'in':
                if (!Array.isArray(operand)) return undefined
                if (value === null) return operand.includes(null)
                if (!isComparableScalar(value)) return undefined
                return operand.includes(value)
            case 'not in':
                if (!Array.isArray(operand)) return undefined
                if (value === null) return false
                if (!isComparableScalar(value)) return undefined
                return !operand.includes(value)
            default:
                return undefined
        }
    }
    // 「records match 的本地求值可把缺席键判定为 NULL」的字段集合缓存：
    //  事件快照对声明的普通值属性是完整的（create = defaults+payload；update 的 oldRecord 保留全部值属性），
    //  所以这些字段缺席 ⟺ 库里为 NULL。computed / computation 属性由写路径联动求值，
    //  事件快照不保证携带，缺席时必须视为不可判定。
    private plainValuePropertyNamesBySource = new WeakMap<object, Set<string>>()
    private getPlainValuePropertyNames(source: object): Set<string> {
        const cached = this.plainValuePropertyNamesBySource.get(source)
        if (cached) return cached
        const names = new Set<string>()
        const visited = new Set<object>()
        const visit = (node: unknown) => {
            if (!node || typeof node !== 'object' || visited.has(node)) return
            visited.add(node)
            const record = node as { properties?: Array<{ name?: string, computed?: unknown, computation?: unknown }>, baseEntity?: unknown, baseRelation?: unknown, inputEntities?: unknown[], inputRelations?: unknown[] }
            for (const prop of record.properties || []) {
                if (!prop?.name || prop.computed || prop.computation) continue
                names.add(prop.name)
            }
            visit(record.baseEntity)
            visit(record.baseRelation)
            for (const input of record.inputEntities || []) visit(input)
            for (const input of record.inputRelations || []) visit(input)
        }
        visit(source)
        this.plainValuePropertyNamesBySource.set(source, names)
        return names
    }
    private evaluateRecordsMatch(match: MatchExpressionData | undefined, record: Record<string, unknown> | undefined, plainNullableKeys: Set<string>): boolean | undefined {
        if (!match) return true
        if (!record) return undefined
        const node = match as any
        const raw = node.raw || node
        if (raw.type === 'atom') {
            const atom = raw.data
            if (!atom || typeof atom.key !== 'string' || !Array.isArray(atom.value)) return undefined
            // isReferenceValue 的操作数是另一列的引用，本地快照无从取值。
            if (atom.isReferenceValue) return undefined
            const read = this.readMatchPath(record, atom.key)
            let value: unknown
            if (read.resolved) {
                value = read.value
            } else if (!atom.key.includes('.') && plainNullableKeys.has(atom.key)) {
                value = null
            } else {
                return undefined
            }
            return this.compareMatchValue(value, atom.value[0], atom.value[1])
        }
        if (raw.type === 'expression') {
            // Kleene 三值逻辑：单侧确定即可短路（false AND unknown = false、true OR unknown = true）。
            const left = this.evaluateRecordsMatch(raw.left, record, plainNullableKeys)
            const right = raw.right ? this.evaluateRecordsMatch(raw.right, record, plainNullableKeys) : undefined
            if (raw.operator === 'and') {
                if (left === false || right === false) return false
                if (left === undefined || right === undefined) return undefined
                return true
            }
            if (raw.operator === 'or') {
                if (left === true || right === true) return true
                if (left === undefined || right === undefined) return undefined
                return false
            }
            if (raw.operator === 'not') return left === undefined ? undefined : !left
            return undefined
        }
        return undefined
    }
    private buildMatchEventContext(dataDep: DataDep | undefined, event: EtityMutationEvent): Partial<DataDepEventContext> {
        if (!dataDep || dataDep.type !== 'records' || !dataDep.match) return {}
        if (event.relatedAttribute?.length) {
            return {
                membershipChange: 'unknown',
                requiresFullRecompute: true,
                reason: 'records match over related path requires full recompute'
            }
        }

        const plainNullableKeys = this.getPlainValuePropertyNames(dataDep.source as unknown as object)
        // CAUTION 旧态快照的字段来源按事件类型分裂（r22 I-3）：delete 事件没有 oldRecord，
        //  删除前的完整快照就在 event.record 上（DeletionExecutor 的前置查询结果）。
        //  用 oldRecord（undefined）求旧态会让**每一个** delete 事件都判为不可判定 →
        //  强制 full recompute + SERIALIZABLE 升级重试——不匹配的 delete 本应 skip，
        //  只声明增量路径（无 compute()）的计算则直接 fail-loud。
        const oldSnapshot = (event.type === 'delete' ? event.record : event.oldRecord) as Record<string, unknown> | undefined
        const currentRecord = event.type === 'update'
            ? { ...(event.oldRecord || {}), ...(event.record || {}) } as Record<string, unknown>
            : event.record as Record<string, unknown> | undefined
        const oldMatches = event.type === 'create' ? false : this.evaluateRecordsMatch(dataDep.match, oldSnapshot, plainNullableKeys)
        const newMatches = event.type === 'delete' ? false : this.evaluateRecordsMatch(dataDep.match, currentRecord, plainNullableKeys)
        if (oldMatches === undefined || newMatches === undefined) {
            return {
                membershipChange: 'unknown',
                requiresFullRecompute: true,
                reason: 'records match membership could not be evaluated locally'
            }
        }
        if (!oldMatches && !newMatches) {
            return {
                membershipChange: 'none',
                requiresFullRecompute: false,
                skip: true,
                reason: 'records match excludes mutation event'
            }
        }
        if (!oldMatches && newMatches) {
            return {
                membershipChange: 'entered',
                requiresFullRecompute: event.type === 'update',
                reason: event.type === 'update' ? 'records match membership entered on update' : undefined
            }
        }
        if (oldMatches && !newMatches) {
            return {
                membershipChange: 'left',
                requiresFullRecompute: event.type === 'update',
                reason: event.type === 'update' ? 'records match membership left on update' : undefined
            }
        }
        return {
            membershipChange: 'none',
            requiresFullRecompute: false
        }
    }
    buildDataDepEventContext(computation: DataBasedComputation, event: EtityMutationEvent): DataDepEventContext {
        const depEntry = Object.entries(computation.dataDeps || {}).find(([, dep]) => dep === event.dataDep)
        const depKey = depEntry?.[0]
        const dep = depEntry?.[1]
        const primaryKeys = new Set(computation.primaryDataDepKeys || [])
        const depRole: DataDepEventContext['depRole'] = depKey === undefined ? 'unknown' : depKey === '_self' ? 'self' : primaryKeys.has(depKey) ? 'primary' : 'external'
        const modifierRequiresFullRecompute = this.hasUnsafeRecordsModifier(dep)
        const matchContext = this.buildMatchEventContext(dep, event)
        const requiresFullRecompute = Boolean(modifierRequiresFullRecompute || matchContext.requiresFullRecompute)
        return {
            depKey,
            dep,
            depRole,
            membershipChange: modifierRequiresFullRecompute ? 'maybe' : matchContext.membershipChange || 'none',
            requiresFullRecompute,
            skip: matchContext.skip,
            reason: modifierRequiresFullRecompute ? `records data dependency ${depKey} has modifier membership risk` : matchContext.reason
        }
    }
    private normalizeLastValuePolicy(needsLastValue: boolean | LastValuePolicy | undefined): LastValuePolicy {
        if (!needsLastValue) return { mode: 'none' }
        if (needsLastValue === true) return { mode: 'normal' }
        return needsLastValue
    }
    private async resolvePlannedLastValue(computation: DataBasedComputation, record: unknown, plan: IncrementalPlan, context: DataDepEventContext) {
        if (plan.type !== 'incremental') return undefined
        const policy = this.normalizeLastValuePolicy(plan.needsLastValue)
        if (policy.mode === 'none') return undefined
        if ((computation.dataContext.type === 'entity' || computation.dataContext.type === 'relation') && policy.mode !== 'fullOutput') {
            throw new ComputationProtocolError('Entity/relation incremental last value requires explicit fullOutput policy', {
                handleName: computation.constructor.name,
                computationName: computation.args.constructor.displayName,
                dataContext: computation.dataContext,
                computationPhase: 'incremental-plan',
                context: { depKey: context.depKey }
            })
        }
        try {
            return await this.controller.retrieveLastValue(computation.dataContext, record as Record<string, unknown> | undefined)
        } catch (e) {
            throw new ComputationStateError('Failed to retrieve planned last value for incremental computation', {
                handleName: computation.constructor.name,
                computationName: computation.args.constructor.displayName,
                dataContext: computation.dataContext,
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
        }
    }
    private normalizePlanDataDepKeys(computation: DataBasedComputation, keys: string[]) {
        const uniqueKeys = [...new Set(keys)]
        for (const key of uniqueKeys) {
            if (!Object.prototype.hasOwnProperty.call(computation.dataDeps || {}, key)) {
                throw new ComputationDataDepError(`Unknown incremental data dependency key '${key}'`, {
                    depName: key,
                    invalidData: true,
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext
                })
            }
        }
        return uniqueKeys
    }
    async executeDataBasedComputation(
        computation: DataBasedComputation,
        erRecordMutationEvent: EtityMutationEvent,
        record?: any,
        forceFullCompute: boolean = false
    ): Promise<ComputationExecutionResult> {
        const shouldFullCompute = forceFullCompute || (!computation.incrementalCompute && !computation.incrementalPatchCompute)
        if (shouldFullCompute) {
            const dataDeps = computation.dataDeps ? await this.resolveAllDataDeps(computation, record) : {}
            if (!computation.compute) {
                throw new ComputationError('compute must be defined for full computation', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    computationPhase: 'full-compute'
                })
            }
            return { mode: 'full', result: await computation.compute(dataDeps, record) }
        }

        const context = this.buildDataDepEventContext(computation, erRecordMutationEvent)
        // CAUTION context.skip 由框架集中执行，不依赖 planIncremental 自觉遵守：
        //  skip 只在「事件记录对该 records 依赖的 match 确定性地新旧都不匹配」时为 true
        //  （本地无法确定时走 requiresFullRecompute，不走 skip），即该事件不可能影响计算结果。
        //  自定义 planIncremental 忽略 context.skip 返回 incremental 时，增量计算会拿着
        //  无关事件产出错误值且零告警——这里先于 planIncremental 收口。
        if (context.skip) {
            return { mode: 'skip' }
        }
        const plan = computation.planIncremental?.(erRecordMutationEvent, record, context)
        if (!plan) {
            throw new ComputationProtocolError('Incremental data-based computation must implement planIncremental()', {
                handleName: computation.constructor.name,
                computationName: computation.args.constructor.displayName,
                dataContext: computation.dataContext,
                computationPhase: 'incremental-plan'
            })
        }
        if (plan.type === 'skip') {
            return { mode: 'skip' }
        }
        if (context.requiresFullRecompute || plan.type === 'fullRecompute') {
            if (this.controller.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry(`full recompute ${(computation.args as any).name || computation.args.constructor.displayName}`)
            }
            const fullDeps = computation.dataDeps ? await this.resolveAllDataDeps(computation, record) : {}
            if (!computation.compute) {
                throw new ComputationError('This computation only defines incrementalCompute/incrementalPatchCompute, but the current event requires a full recompute (e.g. an external dependency changed or the incremental path cannot handle this event shape). Define compute() as a full-recompute fallback, or make planIncremental()/incremental paths cover this event.', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    computationPhase: 'planned-full-compute'
                })
            }
            return { mode: 'full', result: await computation.compute(fullDeps, record) }
        }

        const dataDepKeys = this.normalizePlanDataDepKeys(computation, plan.dataDepKeys)
        const dataDeps = await this.resolveSelectedDataDeps(computation, record, dataDepKeys)
        const lastValue = await this.resolvePlannedLastValue(computation, record, plan, context)
        const result = computation.incrementalCompute
            ? await computation.incrementalCompute(lastValue, erRecordMutationEvent, record, dataDeps)
            : await computation.incrementalPatchCompute!(lastValue, erRecordMutationEvent, record, dataDeps)

        if (result instanceof ComputationResultFullRecompute) {
            if (this.controller.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry(`full recompute ${(computation.args as any).name || computation.args.constructor.displayName}`)
            }
            if (!computation.compute) {
                throw new ComputationError('compute must be defined for computation when incremental returns ComputationResultFullRecompute', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    computationPhase: 'fallback-compute'
                })
            }
            const fullDeps = computation.dataDeps ? await this.resolveAllDataDeps(computation, record) : {}
            return { mode: 'full', result: await computation.compute(fullDeps, record) }
        }
        return {
            mode: computation.incrementalCompute ? 'incremental' : 'patch',
            result
        }
    }
    private getAsyncTaskFreshnessKey(computation: Computation, args: any, record?: any) {
        if (args?.freshnessKey !== undefined) return String(args.freshnessKey)
        if (computation.dataContext.type === 'property') return String(record?.id)
        if (computation.dataContext.type === 'global') return String(computation.dataContext.id.name)
        if (computation.dataContext.type === 'entity' || computation.dataContext.type === 'relation') return String((computation.dataContext as EntityDataContext | RelationDataContext).id.name)
        return 'default'
    }
    async createAsyncTask(computation: Computation, args: any, record?: any, result?: any) {
        const freshnessKey = this.getAsyncTaskFreshnessKey(computation, args, record)
        // 根据不同 dataContext 来创建不同的 task
        if (computation.dataContext.type === 'property') {
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                record,
                result,
                freshnessKey
            })
        } else if (computation.dataContext.type === 'global') {
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                globalKey: computation.dataContext.id.name,
                result,
                freshnessKey
            })
        } else if (computation.dataContext.type === 'entity') {
            const entityContext = computation.dataContext as EntityDataContext
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                entityName: entityContext.id.name,
                result,
                freshnessKey
            })
        } else if (computation.dataContext.type === 'relation') {
            const relationContext = computation.dataContext as RelationDataContext
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                relationName: relationContext.id.name,
                result,
                freshnessKey
            })
        } else {
            throw new Error(`Async computation for ${(computation.dataContext as any).type} is not implemented yet`)
        }
    }

    async handleAsyncReturn(computation: DataBasedComputation, taskRecordIdRef: {id: string}) {
        return runWithTransactionRetry(`asyncReturn:${this.getAsyncTaskRecordKey(computation)}`, async (isolation) => {
            return this.controller.system.storage.runInTransaction({ name: `asyncReturn:${this.getAsyncTaskRecordKey(computation)}`, isolation }, async () => {
                const taskRecordName = this.getAsyncTaskRecordKey(computation)
                const attributeQuery: AttributeQueryData = computation.dataContext.type === 'property' ? ['*', ['record', {attributeQuery: ['id']}]] : ['*']
                // 先无锁读出 freshnessKey，再对同一 freshnessKey 的全部 task 行取行锁（按 id 有序，避免死锁）。
                // CAUTION 必须先锁定整个 freshness 维度再做"是否最新"的判定和 apply：
                //  否则 check 与 apply 之间另一个连接可以创建并应用更新的 task，随后本事务把陈旧结果覆盖回去（TOCTOU）。
                //  锁住全组行后，并发 handler 会在这里阻塞到本事务提交，届时它的 isLatest 判定基于已提交的最新状态。
                const preRead = await this.controller.system.storage.findOne(
                    taskRecordName,
                    MatchExp.atom({key: 'id', value: ['=', taskRecordIdRef.id]}),
                    undefined,
                    ['id', 'freshnessKey']
                )
                if (!preRead) return { skipped: true, reason: 'missing-task' }
                await this.controller.system.storage.atomic.lockRows(
                    taskRecordName,
                    MatchExp.atom({key: 'freshnessKey', value: ['=', preRead.freshnessKey]}),
                    ['id']
                )
                // 拿到锁之后重读本 task：等待锁期间它可能已被并发 handler 标记为 applied/skipped。
                const taskRecord = await this.controller.system.storage.findOne(
                    taskRecordName,
                    MatchExp.atom({key: 'id', value: ['=', taskRecordIdRef.id]}),
                    undefined,
                    attributeQuery
                )
                if (!taskRecord) return { skipped: true, reason: 'missing-task' }
                if (taskRecord.status === 'applied' || taskRecord.status === 'skipped') {
                    return { skipped: true, reason: 'already-handled' }
                }
                
                if (!(await this.isLatestAsyncTask(computation, taskRecord))) {
                    await this.markAsyncTaskStatus(taskRecordName, String(taskRecord.id), 'skipped')
                    return { skipped: true, reason: 'stale-task' }
                }

                if (taskRecord.status === 'success') {
                    this.requireSerializableForCustomCallback(computation, 'async return')
                    const resultOrPatch = await computation.asyncReturn!(taskRecord.result, taskRecord.args) as ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined
                    if (computation.incrementalPatchCompute && this.requiresSerializablePatchApply(computation) && this.controller.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                        throw new RequireSerializableRetry(`entity/relation async patch from custom computation ${this.getComputationName(computation)}`)
                    }
                    
                    if (computation.dataContext.type === 'global') {
                        if (computation.incrementalPatchCompute) {
                            await this.controller.applyResultPatch(computation.dataContext, resultOrPatch)
                        } else {
                            await this.controller.applyResult(computation.dataContext, resultOrPatch)
                        }
                    } else if (computation.dataContext.type === 'property') {
                        if (computation.incrementalPatchCompute) {
                            await this.controller.applyResultPatch(computation.dataContext, resultOrPatch, taskRecord.record as Record<string, unknown>)
                        } else {
                            await this.controller.applyResult(computation.dataContext, resultOrPatch, taskRecord.record as Record<string, unknown>)
                        }
                    } else if (computation.dataContext.type === 'entity' || computation.dataContext.type === 'relation') {
                        if (computation.incrementalPatchCompute) {
                            await this.controller.applyResultPatch(computation.dataContext, resultOrPatch)
                        } else {
                            await this.controller.applyResult(computation.dataContext, resultOrPatch)
                        }
                    }
                    await this.markAsyncTaskStatus(taskRecordName, String(taskRecord.id), 'applied')
                    return { skipped: false }
                }
                return { skipped: true, reason: 'task-not-success' }
            })
        })
    }

    private async markAsyncTaskStatus(taskRecordName: string, taskId: string, status: 'applied' | 'skipped') {
        await this.controller.system.storage.update(
            taskRecordName,
            MatchExp.atom({key: 'id', value: ['=', taskId]}),
            { status }
        )
    }

    private async isLatestAsyncTask(computation: DataBasedComputation, taskRecord: any) {
        const taskRecordName = this.getAsyncTaskRecordKey(computation)
        const match = MatchExp.atom({key: 'freshnessKey', value: ['=', taskRecord.freshnessKey]})
        const latest = await this.controller.system.storage.findOne(taskRecordName, match, { orderBy: { id: 'DESC' } }, ['id'])
        return String(latest?.id) === String(taskRecord.id)
    }

    isAsyncComputation(computation: Computation) {
        return (computation as DataBasedComputation).asyncReturn !== undefined
    }


    async runComputation(computation: Computation, erRecordMutationEvent: RecordMutationEvent, record?: any, forceFullCompute: boolean = false) {
        try {
            let computationResult: ComputationResult|any
            let computationResultMode: ComputationExecutionResult['mode'] | undefined
            const currentIsolation = this.controller.system.storage.getTransactionIsolation()
            this.requireSerializableForCustomCallback(computation, 'run')
            if (forceFullCompute && currentIsolation !== 'SERIALIZABLE') {
                throw new RequireSerializableRetry(`force full compute ${this.getComputationName(computation)}`)
            }

            // 1. 计算执行阶段的错误处理
            try {
                if (this.isDataBasedComputation(computation)) {
                    const executionResult = await this.executeDataBasedComputation(computation, erRecordMutationEvent, record, forceFullCompute)
                    if (executionResult.mode === 'skip') {
                        return
                    }
                    computationResult = executionResult.result
                    computationResultMode = executionResult.mode
                } else if (forceFullCompute || (!computation.incrementalCompute && !computation.incrementalPatchCompute)) {
                    const databasedComputation = computation as unknown as DataBasedComputation
                    const dataDeps = databasedComputation.dataDeps ? await this.resolveAllDataDeps(databasedComputation, record) : {}
                    if (!databasedComputation.compute) {
                        throw new ComputationError('compute must be defined for full computation', {
                            handleName: computation.constructor.name,
                            computationName: computation.args.constructor.displayName,
                            dataContext: computation.dataContext,
                            computationPhase: 'full-compute'
                        })
                    }
                    computationResult = await databasedComputation.compute(dataDeps, record)
                    computationResultMode = 'full'
                } else {
                    if (computation.incrementalCompute) {
                        let lastValue = undefined
                        if (computation.useLastValue) {
                            try {
                                lastValue = await this.controller.retrieveLastValue(computation.dataContext, record)
                            } catch (e) {
                                const error = new ComputationStateError('Failed to retrieve last value for incremental computation', {
                                    handleName: computation.constructor.name,
                                    computationName: computation.args.constructor.displayName,
                                    dataContext: computation.dataContext,
                                    causedBy: e instanceof Error ? e : new Error(String(e))
                                })
                                throw error
                            }
                        }
                        
                        computationResult = await computation.incrementalCompute(lastValue, erRecordMutationEvent, record, {})
                        computationResultMode = 'incremental'
                        
                    } else if(computation.incrementalPatchCompute){
                        let lastValue = undefined
                        if (computation.useLastValue) {
                            try {
                                lastValue = await this.controller.retrieveLastValue(computation.dataContext, record)
                            } catch (e) {
                                const error = new ComputationStateError('Failed to retrieve last value for incremental patch computation', {
                                    handleName: computation.constructor.name,
                                    computationName: computation.args.constructor.displayName,
                                    dataContext: computation.dataContext,
                                    causedBy: e instanceof Error ? e : new Error(String(e))
                                })
                                throw error
                            }
                        }
            
                        computationResult = await computation.incrementalPatchCompute(lastValue, erRecordMutationEvent, record, {})
                        computationResultMode = 'patch'
                    } else {
                        const error = new ComputationError(`Unknown computation type: ${computation.constructor.name}`, {
                            handleName: computation.constructor.name,
                            computationName: computation.args.constructor.displayName,
                            dataContext: computation.dataContext,
                            computationPhase: 'type-validation'
                        })
                        throw error
                    }
                }
            } catch (e) {
                if (e instanceof ComputationError) {
                    throw e // Re-throw our custom errors
                }
                const error = new ComputationError('Computation execution failed', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    computationPhase: 'execution',
                    causedBy: e instanceof Error ? e : new Error(String(e))
                })
                throw error
            }

            if (computationResult instanceof ComputationResultSkip) {
                return
            }
            if (computationResult instanceof ComputationResultAsync) {
                try {
                    return await this.createAsyncTask(computation, computationResult.args, record)
                } catch (e) {
                    const error = new ComputationError('Failed to create async task', {
                        handleName: computation.constructor.name,
                        computationName: computation.args.constructor.displayName,
                        dataContext: computation.dataContext,
                        computationPhase: 'async-task-creation',
                        causedBy: e instanceof Error ? e : new Error(String(e))
                    })
                    throw error
                }
            } 

            // 3. 结果处理阶段的错误处理
            try {
                const result = computationResult instanceof ComputationResultResolved ? await computation.asyncReturn!(computationResult.result, computationResult.args) : computationResult
                
                if (computationResultMode === 'patch') {
                    if (this.requiresSerializablePatchApply(computation) && this.controller.system.storage.getTransactionIsolation() !== 'SERIALIZABLE') {
                        throw new RequireSerializableRetry(`entity/relation patch from custom computation ${this.getComputationName(computation)}`)
                    }
                    await this.controller.applyResultPatch(computation.dataContext, result, record)
                } else {
                    await this.controller.applyResult(computation.dataContext, result, record)
                }
            } catch (e) {
                const error = new ComputationError('Failed to apply computation result', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    computationPhase: 'result-application',
                    causedBy: e instanceof Error ? e : new Error(String(e))
                })
                throw error
            }
        } catch (e) {
            if (e instanceof ComputationError) {
                throw e // Re-throw our custom errors
            }
            // Top-level unexpected error handling
            const error = new ComputationError('Unexpected error during computation execution', {
                handleName: computation.constructor.name,
                computationName: computation.args.constructor.displayName,
                dataContext: computation.dataContext,
                computationPhase: 'top-level',
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
    }
    async resolveAllDataDeps(computation: DataBasedComputation, record?: any) {
        return this.resolveSelectedDataDeps(computation, record, Object.keys(computation.dataDeps || {}))
    }
    async resolveDataDeps(computation: DataBasedComputation, record?: any) {
        return this.resolveAllDataDeps(computation, record)
    }
    async resolveSelectedDataDeps(computation: DataBasedComputation, record?: any, depKeys: string[] = []) {
        const selectedKeys = [...new Set(depKeys)]
        if (selectedKeys.length === 0) return {}
        if (computation.dataDeps) {
            try {
                const values: any[] = await Promise.all(selectedKeys.map(async (dataDepName) => {
                    const dataDep = computation.dataDeps[dataDepName]
                    if (!dataDep) {
                        throw new ComputationDataDepError(`Unknown data dependency '${dataDepName}'`, {
                            depName: dataDepName,
                            invalidData: true,
                            handleName: computation.constructor.name,
                            computationName: computation.args.constructor.displayName,
                            dataContext: computation.dataContext
                        })
                    }
                    try {
                        if (dataDep.type === 'records') {
                            return await this.controller.system.storage.find(dataDep.source.name!, dataDep.match, dataDep.modifier ?? {}, dataDep.attributeQuery)
                        } else if (dataDep.type === 'property') {
                            if (!record?.id) {
                                const error = new ComputationDataDepError('Record ID is required for property data dependency', {
                                    depName: dataDepName,
                                    depType: dataDep.type,
                                    missingData: true,
                                    handleName: computation.constructor.name,
                                    computationName: computation.args.constructor.displayName,
                                    dataContext: computation.dataContext
                                })
                                throw error
                            }
                            return this.controller.system.storage.findOne((computation.dataContext as PropertyDataContext).host.name!, MatchExp.atom({key: 'id', value: ['=', record.id]}), {}, dataDep.attributeQuery)
                        } else if (dataDep.type === 'global') {
                            return await this.controller.system.storage.dict.get(dataDep.source.name!)
                        } else {
                            const error = new ComputationDataDepError(`Unknown data dependency type: ${(dataDep as any).type}`, {
                                depName: dataDepName,
                                depType: (dataDep as any).type,
                                invalidData: true,
                                handleName: computation.constructor.name,
                                computationName: computation.args.constructor.displayName,
                                dataContext: computation.dataContext
                            })
                            throw error
                        }
                    } catch (e) {
                        if (e instanceof ComputationDataDepError) {
                            throw e
                        }
                        const error = new ComputationDataDepError(`Failed to resolve data dependency '${dataDepName}'`, {
                            depName: dataDepName,
                            depType: dataDep.type,
                            handleName: computation.constructor.name,
                            computationName: computation.args.constructor.displayName,
                            dataContext: computation.dataContext,
                            causedBy: e instanceof Error ? e : new Error(String(e))
                        })
                        throw error
                    }
                }))
                return Object.fromEntries(selectedKeys.map((dataDepName, index) => [dataDepName, values[index]]))
            } catch (e) {
                if (e instanceof ComputationDataDepError) {
                    throw e
                }
                const error = new ComputationDataDepError('Failed to resolve computation data dependencies', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    causedBy: e instanceof Error ? e : new Error(String(e))
                })
                throw error
            }
        } else {
            return {}
        }
    }
    async setupDictDefaultValue() {
        const globalDict = this.controller.dict.filter(dict => dict.defaultValue !== undefined)
        for (const dict of globalDict) {
            await this.controller.system.storage.dict.set(dict.name, dict.defaultValue!())
        }
    }
    
    async setup(createDefaultDictValue: boolean = false) {
        try {
            // CAUTION 原子切换：先完整构建新 listener（含 sourceMapManager.initialize 等可抛出的路径），
            //  全部构建成功后才注销旧的、注册新的。如果先注销再构建，构建中途抛出会留下一个
            //  「零监听」的静默系统——事实写入照常、所有增量计算冻结、无任何后续报错。
            const listeners = [
                ...this.buildPropertyDefaultValueListeners(),
                this.buildComputationMutationListener()
            ]
            // 幂等：重复 setup（或 migrate 后的重建）注销上一次注册的 listener，否则同一 mutation 会触发多次计算。
            this.removeRegisteredMutationListeners()
            for (const listener of listeners) {
                this.registerMutationListener(listener)
            }
            // 把声明的 dict defaultValue 注册为读回退（无存储行时返回声明的默认值）。
            this.registerDictDefaults()
            if (createDefaultDictValue) {   
                // 一定要先把 bound state default value 设置后，因为后面开始设置 dict default value 时，可能触发 computation。可能要读 state。
                await this.setupGlobalBoundStateDefaultValues()
                await this.setupGlobalComputationDefaultValue()
                await this.setupDictDefaultValue()
            }
        } catch (e) {
            if (e instanceof SchedulerError) {
                throw e
            }
            const error = new SchedulerError('Unexpected error during scheduler setup', {
                schedulingPhase: 'top-level-setup',
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
    }
}
