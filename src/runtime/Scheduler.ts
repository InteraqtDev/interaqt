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
import { DICTIONARY_RECORD, type InternalSchemaRequirement, RecordMutationEvent, SYSTEM_RECORD } from "./System.js";
import { RequireSerializableRetry, runWithTransactionRetry } from "./transaction.js";
import {
    EntityEventSourceMap,
    DataSourceMapTree,
    ComputationSourceMapManager,
    EntityCreateEventsSourceMap
} from "./ComputationSourceMap.js";
import { createScopedSequenceSignatures, scopedSequenceComputationId } from "./scopedSequenceManifest.js";

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
    addMutationPropertyComputationDefaultValueListeners() {
        for(const computation of this.computationsHandles.values()) {
            if(computation.getInitialValue) {
                if (computation.dataContext.type==='property') {
                    // property 的默认值需要在 scheduler 监听 property 的 record 创建事件，来设置默认值。
                    // 监听 record 的创建事件，来设置默认值。
                    const propertyDataContext = computation.dataContext as PropertyDataContext

                    // assertion: 有 computation 的 property 就不能有原本的 defaultValue 了，因为会被 computation 的 getInitialValue 覆盖。
                    assert(!propertyDataContext.id.defaultValue, `${propertyDataContext.host.name}.${propertyDataContext.id.name} property shuold not has a defaultValue, because it will be overridden by computation`)

                    // TODO 未来合成一个 listener ?
                    this.controller.system.storage.listen(async (mutationEvents) => {
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
    addMutationComputationListeners() {
        this.sourceMapManager.initialize(new Set(this.computationsHandles.values()))
        this.dataSourceMapTree = this.sourceMapManager.getSourceMapTree()

        this.controller.system.storage.listen(async (mutationEvents) => {
            for(let mutationEvent of mutationEvents){
                const sources = this.sourceMapManager.findSourceMapsForMutation(mutationEvent)
                if (sources.length > 0) {
                    for(const source of sources) {
                        if(!this.sourceMapManager.shouldTriggerUpdateComputation(source, mutationEvent)) {
                            continue
                        }
                        // 对于 EventBasedComputation，进行深度匹配检查
                        if (!('dataDep' in source) && !this.sourceMapManager.shouldTriggerEventBasedComputation(source as EventBasedEntityEventsSourceMap, mutationEvent)) {
                            continue
                        }
                        await this.runDirtyRecordsComputation(source, mutationEvent)
                    }
                }
            }
        })
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
    computeOldRecord(newRecord: any, sourceMap: DataBasedEntityEventsSourceMap, mutationEvent: RecordMutationEvent) {
        // FIXME 理论上我们现在不需要 computeOldRecord 了。
        if(!sourceMap.targetPath?.length) {
            return mutationEvent.oldRecord
        }
        return {...newRecord}
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
                    oldRecord: record,
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
                oldRecord: this.computeOldRecord(record, source, mutationEvent),
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
                        // Log the error but continue with other records to avoid blocking the entire batch
                        const error = new ComputationError('Failed to run computation for dirty record', {
                            handleName: source.computation.constructor.name,
                            computationName: source.computation.args.constructor.displayName,
                            dataContext: source.computation.dataContext,
                            computationPhase: 'batch-computation',
                            context: { recordId: record?.id },
                            causedBy: e instanceof Error ? e : new Error(String(e))
                        })
                        // For now, re-throw to maintain existing behavior, but in production you might want to log and continue
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
    private readMatchPath(record: Record<string, unknown> | undefined, path: string) {
        if (!record) return undefined
        let current: any = record
        for (const part of path.split('.')) {
            if (current === null || current === undefined || typeof current !== 'object') return undefined
            current = current[part]
        }
        return current
    }
    private compareMatchValue(value: unknown, operator: string, operand: unknown): boolean | undefined {
        switch (operator.toLowerCase()) {
            case '=':
            case '==':
                return value === operand
            case '!=':
            case '<>':
                return value !== operand
            case '>':
                return typeof value === 'number' && typeof operand === 'number' ? value > operand : undefined
            case '>=':
                return typeof value === 'number' && typeof operand === 'number' ? value >= operand : undefined
            case '<':
                return typeof value === 'number' && typeof operand === 'number' ? value < operand : undefined
            case '<=':
                return typeof value === 'number' && typeof operand === 'number' ? value <= operand : undefined
            case 'in':
                return Array.isArray(operand) ? operand.includes(value) : undefined
            case 'not in':
                return Array.isArray(operand) ? !operand.includes(value) : undefined
            case 'not':
                return value !== operand
            case 'like':
                if (typeof value !== 'string' || typeof operand !== 'string') return undefined
                return new RegExp(`^${operand.split('%').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(value)
            default:
                return undefined
        }
    }
    private evaluateRecordsMatch(match: MatchExpressionData | undefined, record: Record<string, unknown> | undefined): boolean | undefined {
        if (!match) return true
        if (!record) return undefined
        const node = match as any
        const raw = node.raw || node
        if (raw.type === 'atom') {
            const atom = raw.data
            if (!atom || typeof atom.key !== 'string' || !Array.isArray(atom.value)) return undefined
            return this.compareMatchValue(this.readMatchPath(record, atom.key), atom.value[0], atom.value[1])
        }
        if (raw.type === 'expression') {
            const left = this.evaluateRecordsMatch(raw.left, record)
            const right = raw.right ? this.evaluateRecordsMatch(raw.right, record) : undefined
            if (raw.operator === 'and') return left === undefined || right === undefined ? undefined : left && right
            if (raw.operator === 'or') return left === undefined || right === undefined ? undefined : left || right
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

        const oldRecord = event.oldRecord as Record<string, unknown> | undefined
        const currentRecord = event.type === 'update'
            ? { ...(event.oldRecord || {}), ...(event.record || {}) } as Record<string, unknown>
            : event.record as Record<string, unknown> | undefined
        const oldMatches = event.type === 'create' ? false : this.evaluateRecordsMatch(dataDep.match, oldRecord)
        const newMatches = event.type === 'delete' ? false : this.evaluateRecordsMatch(dataDep.match, currentRecord)
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
                throw new ComputationError('compute must be defined for planned full recompute', {
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
                const taskRecords = await this.controller.system.storage.atomic.lockRows(
                    taskRecordName,
                    MatchExp.atom({key: 'id', value: ['=', taskRecordIdRef.id]}),
                    attributeQuery
                )
                const taskRecord = taskRecords[0]
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
            this.addMutationPropertyComputationDefaultValueListeners()
            this.addMutationComputationListeners()
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
