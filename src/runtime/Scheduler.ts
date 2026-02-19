import { MatchExp } from "@storage";
import { Entity, Property, Relation, EntityInstance, RelationInstance, PropertyInstance, IInstance, DictionaryInstance } from "@core";
import { DataBasedEntityEventsSourceMap, EventBasedEntityEventsSourceMap, type EtityMutationEvent } from "./ComputationSourceMap.js";
import { Controller } from "./Controller.js";
import { DataContext, PropertyDataContext, EntityDataContext, RelationDataContext } from "./computations/Computation.js";
import { assert } from "./util.js";
import {
    SchedulerError,
    ComputationError, ComputationStateError,
    ComputationDataDepError
} from "./errors/index.js";
import { Computation, ComputationClass, ComputationResult, ComputationResultAsync, ComputationResultFullRecompute, ComputationResultResolved, ComputationResultSkip, DataBasedComputation, EventBasedComputation, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./computations/Computation.js";
import { DICTIONARY_RECORD, RecordMutationEvent, SYSTEM_RECORD } from "./System.js";
import {
    EntityEventSourceMap,
    DataSourceMapTree,
    ComputationSourceMapManager,
    EntityCreateEventsSourceMap
} from "./ComputationSourceMap.js";

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
                if (computationHandle.dataContext.type === 'property') {
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computationHandle),
                        properties: [
                        Property.create({
                            name: 'status',
                            type: 'string',
                        }),
                        Property.create({
                            name: 'args',
                            type: 'json',
                        }),
                        Property.create({
                            name: 'result',
                            type: 'json',
                        })
                    ]})
                    const AsyncTaskRelation = Relation.create({
                        name: `${AsyncTaskEntity.name}_${computationHandle.dataContext.host.name}_${computationHandle.dataContext.id.name}`,
                        source: AsyncTaskEntity,
                        target: computationHandle.dataContext.host,
                        sourceProperty: 'record',
                        targetProperty: `_${computationHandle.dataContext.id.name}_task`,
                        type: '1:1'
                    })
                    entities.push(AsyncTaskEntity)
                    relations.push(AsyncTaskRelation)
                } else if (computationHandle.dataContext.type === 'global') {
                    // Global 类型的异步任务表
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computationHandle),
                        properties: [
                            Property.create({
                                name: 'status',
                                type: 'string',
                            }),
                            Property.create({
                                name: 'args',
                                type: 'json',
                            }),
                            Property.create({
                                name: 'result',
                                type: 'json',
                            }),
                            Property.create({
                                name: 'globalKey',
                                type: 'string',
                            })
                        ]
                    })
                    entities.push(AsyncTaskEntity)
                } else if (computationHandle.dataContext.type === 'entity') {
                    // Entity 类型的异步任务表
                    const entityContext = computationHandle.dataContext as EntityDataContext
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computationHandle),
                        properties: [
                            Property.create({
                                name: 'status',
                                type: 'string',
                            }),
                            Property.create({
                                name: 'args',
                                type: 'json',
                            }),
                            Property.create({
                                name: 'result',
                                type: 'json',
                            }),
                            Property.create({
                                name: 'entityName',
                                type: 'string',
                            })
                        ]
                    })
                    entities.push(AsyncTaskEntity)
                } else if (computationHandle.dataContext.type === 'relation') {
                    // Relation 类型的异步任务表
                    const relationContext = computationHandle.dataContext as RelationDataContext
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computationHandle),
                        properties: [
                            Property.create({
                                name: 'status',
                                type: 'string',
                            }),
                            Property.create({
                                name: 'args',
                                type: 'json',
                            }),
                            Property.create({
                                name: 'result',
                                type: 'json',
                            }),
                            Property.create({
                                name: 'relationName',
                                type: 'string',
                            })
                        ]
                    })
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
                                    await this.controller.applyResult(propertyDataContext, defaultValue, mutationEvent.record)
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
                        await this.controller.system.storage.dict.set(state.key , state.defaultValue ?? null)
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
    async createAsyncTask(computation: Computation, args: any, record?: any, result?: any) {
        // 根据不同 dataContext 来创建不同的 task
        if (computation.dataContext.type === 'property') {
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                record,
                result
            })
        } else if (computation.dataContext.type === 'global') {
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                globalKey: computation.dataContext.id,
                result
            })
        } else if (computation.dataContext.type === 'entity') {
            const entityContext = computation.dataContext as EntityDataContext
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                entityName: entityContext.id.name,
                result
            })
        } else if (computation.dataContext.type === 'relation') {
            const relationContext = computation.dataContext as RelationDataContext
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                status: result === undefined ? 'pending' : 'success',
                args,
                relationName: relationContext.id.name,
                result
            })
        } else {
            throw new Error(`Async computation for ${(computation.dataContext as any).type} is not implemented yet`)
        }
    }

    async handleAsyncReturn(computation: DataBasedComputation, taskRecordIdRef: {id: string}) {
        const attributeQuery = computation.dataContext.type === 'property' ? ['*', ['record', {attributeQuery: ['id']}]] : ['*']
        const taskRecord = await this.controller.system.storage.findOne(this.getAsyncTaskRecordKey(computation), MatchExp.atom({key: 'id', value: ['=', taskRecordIdRef.id]}), {}, attributeQuery)
        
        // 检查 task 是否仍然是 dataContext 当前最新的，如果不是，说明 task 已经过期，返回值不用管了。
        if (taskRecord.status === 'success') {
            const resultOrPatch = await computation.asyncReturn!(taskRecord.result, taskRecord.args)
            
            if (computation.dataContext.type === 'global') {
                // Global 类型不需要 record 参数
                if (computation.incrementalPatchCompute) {
                    await this.controller.applyResultPatch(computation.dataContext, resultOrPatch)
                } else {
                    await this.controller.applyResult(computation.dataContext, resultOrPatch)
                }
            } else if (computation.dataContext.type === 'property') {
                // Property 和其他类型需要 record 参数
                if (computation.incrementalPatchCompute) {
                    await this.controller.applyResultPatch(computation.dataContext, resultOrPatch, taskRecord.record)
                } else {
                    await this.controller.applyResult(computation.dataContext, resultOrPatch, taskRecord.record)
                }
            } else if (computation.dataContext.type === 'entity' || computation.dataContext.type === 'relation') {
                // Entity 和 Relation 类型不需要 record 参数
                if (computation.incrementalPatchCompute) {
                    await this.controller.applyResultPatch(computation.dataContext, resultOrPatch)
                } else {
                    await this.controller.applyResult(computation.dataContext, resultOrPatch)
                }
            }
        } else {
            // TODO error 处理
        }
    }

    isAsyncComputation(computation: Computation) {
        return (computation as DataBasedComputation).asyncReturn !== undefined
    }


    async runComputation(computation: Computation, erRecordMutationEvent: RecordMutationEvent, record?: any, forceFullCompute: boolean = false) {
        try {
            let computationResult: ComputationResult|any

            // 1. 依赖解析阶段的错误处理
            let dataDeps: any = {}
            try {
                dataDeps = (computation as DataBasedComputation).dataDeps ? await this.resolveDataDeps(computation as DataBasedComputation, record) : {}
            } catch (e) {
                const error = new ComputationDataDepError('Failed to resolve computation data dependencies', {
                    handleName: computation.constructor.name,
                    computationName: computation.args.constructor.displayName,
                    dataContext: computation.dataContext,
                    causedBy: e instanceof Error ? e : new Error(String(e))
                })
                throw error
            }

            // 2. 计算执行阶段的错误处理
            try {
                if (forceFullCompute || (!computation.incrementalCompute && !computation.incrementalPatchCompute)) {
                    // 全量计算。forceFullCompute 用在了初始化时，或者要修正数据时。
                    const databasedComputation = computation as DataBasedComputation
                    computationResult = await databasedComputation.compute(dataDeps, record)
                } else {
                    if (computation.incrementalCompute) {
                        // 1.增量计算，返回全量结果
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
                        
                        computationResult = await computation.incrementalCompute(lastValue, erRecordMutationEvent, record, dataDeps)
                        
                    } else if(computation.incrementalPatchCompute){
                        // 2.增量计算，返回增量结果
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
            
                        computationResult = await computation.incrementalPatchCompute(lastValue, erRecordMutationEvent, record, dataDeps)
                    } else {
                        const error = new ComputationError(`Unknown computation type: ${computation.constructor.name}`, {
                            handleName: computation.constructor.name,
                            computationName: computation.args.constructor.displayName,
                            dataContext: computation.dataContext,
                            computationPhase: 'type-validation'
                        })
                        throw error
                    }

                    if (computationResult instanceof ComputationResultFullRecompute) {
                        // 如果计算结果为 false ，说明不能增量计算，要全量计算。
                        const databasedComputation = computation as DataBasedComputation
                        if (!databasedComputation.compute) {
                            const error = new ComputationError('compute must be defined for computation when incrementalCompute returns ComputationResultFullRecompute', {
                                handleName: computation.constructor.name,
                                computationName: computation.args.constructor.displayName,
                                dataContext: computation.dataContext,
                                computationPhase: 'fallback-compute'
                            })
                            throw error
                        }
                        computationResult = await databasedComputation.compute(dataDeps, record)
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
                
                if (computation.incrementalPatchCompute) {
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
    async resolveDataDeps(computation: DataBasedComputation, record?: any) {
        if (computation.dataDeps) {
            try {
                const values: any[] = await Promise.all(Object.entries(computation.dataDeps).map(async ([dataDepName, dataDep]) => {
                    try {
                        if (dataDep.type === 'records') {
                            return await this.controller.system.storage.find(dataDep.source.name!, undefined, {}, dataDep.attributeQuery)
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
                return Object.fromEntries(Object.entries(computation.dataDeps).map(([dataDepName], index) => [dataDepName, values[index]]))
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

