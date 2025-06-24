import { Controller } from "./Controller.js";
import { DataContext, ComputedDataHandle, PropertyDataContext, EntityDataContext, RelationDataContext } from "./computedDataHandles/ComputedDataHandle.js";

import { Entity, Klass, KlassInstance, Property, Relation } from "@shared";
import { assert } from "./util.js";
import { Computation, ComputationClass, ComputationResult, ComputationResultAsync, ComputationResultFullRecompute, ComputationResultResolved, ComputationResultSkip, DataBasedComputation, EventBasedComputation, GlobalBoundState, RecordBoundState, RecordsDataDep, RelationBoundState } from "./computedDataHandles/Computation.js";
import { DICTIONARY_RECORD, RecordMutationEvent, SYSTEM_RECORD } from "./System.js";
import { AttributeQueryData, MatchExp } from "@storage";
import {
    EntityEventSourceMap,
    type EtityMutationEvent,
    DataSourceMapTree,
    ComputationSourceMapManager,
    EntityCreateEventsSourceMap
} from "./ComputationSourceMap.js";

export const ASYNC_TASK_RECORD = '_ASYNC_TASK_'

export class Scheduler {
    computations = new Set<Computation>()
    private sourceMapManager: ComputationSourceMapManager = new ComputationSourceMapManager(this.controller)
    
    constructor(public controller: Controller, entities: KlassInstance<typeof Entity>[], relations: KlassInstance<typeof Relation>[], dict: KlassInstance<typeof Property>[]) {
        const computationInputs: {dataContext: DataContext, args: KlassInstance<any>}[] = []
        entities.forEach(entity => {
            if (entity.computedData) {
                computationInputs.push({dataContext: {type: 'entity',id: entity},args: entity.computedData})
            }

            // property 的
            entity.properties?.forEach(property => {
                if (property.computedData) {
                    computationInputs.push({dataContext: {type: 'property',host: entity,id: property},args: property.computedData})
                }
            })
        })

        // relation 的
        relations.forEach(relation => {
            const relationAny = relation as any;
            if(relationAny.computedData) {
                computationInputs.push({dataContext: {type: 'relation',id: relation},args: relationAny.computedData})
            }

            if (relationAny.properties) {
                relationAny.properties.forEach((property: any) => {
                    if (property.computedData) {
                        computationInputs.push({dataContext: {type: 'property',host: relation,id: property},args: property.computedData})
                    }
                })
            }
        })

        dict.forEach(dictItem => {
            if (dictItem.computedData) {
                computationInputs.push({dataContext: {type: 'global',id: dictItem.name},args: dictItem.computedData})
            }
        })


        for(const computationInput of computationInputs) {
            const dataContext = computationInput.dataContext
            const args = computationInput.args
            const handles = ComputedDataHandle.Handles
            const ComputationCtor = handles.get(args.constructor as Klass<any>)![dataContext.type]! as ComputationClass
            assert(!!ComputationCtor, `cannot find Computation handle for ${(args.constructor as any).displayName || (args.constructor as any).name}`)
            const computation = new ComputationCtor(this.controller, args, dataContext)
            this.computations.add(computation)


            // 为每一个 async computation 建立自己所需要的 task 任务表。应该每一个 asyncComputation 都有一张独立的表。global state 总共一张。
            if(this.isAsyncComputation(computation)) {
                if (computation.dataContext.type === 'property') {
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computation),
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
                        name: `${AsyncTaskEntity.name}_${computation.dataContext.host.name}_${computation.dataContext.id.name}`,
                        source: AsyncTaskEntity,
                        target: computation.dataContext.host,
                        sourceProperty: 'record',
                        targetProperty: `_${computation.dataContext.id.name}_task`,
                        type: '1:1'
                    })
                    entities.push(AsyncTaskEntity)
                    relations.push(AsyncTaskRelation)
                } else if (computation.dataContext.type === 'global') {
                    // Global 类型的异步任务表
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computation),
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
                } else if (computation.dataContext.type === 'entity') {
                    // Entity 类型的异步任务表
                    const entityContext = computation.dataContext as EntityDataContext
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computation),
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
                } else if (computation.dataContext.type === 'relation') {
                    // Relation 类型的异步任务表
                    const relationContext = computation.dataContext as RelationDataContext
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(computation),
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
    }
    getBoundStateName(dataContext: DataContext, stateName: string, stateItem: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>) {

        const stateDataContextKey = dataContext.type === 'property' ? 
            `${dataContext.host.name}_${dataContext.id.name}` : 
            (dataContext.type === 'entity' || dataContext.type === 'relation') ? dataContext.id.name : dataContext.id

        return `_${stateDataContextKey}_bound_${stateName}`
    }
    createStates() {
        const states: {dataContext: DataContext, state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}}[] = []
        for(const computation of this.computations) {
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
                                throw new Error(`global data context ${computation.dataContext.id} must specify record name for RecordBoundState`)
                            }
                        }
                    }
                }
            }   
        }
        return states
    }

    async setupDefaultValues() {
        for(const computation of this.computations) {
            // 0. 创建 defaultValue
            // property 的默认值在 setup 的时候已经创建了。
            if(computation.getDefaultValue) {
                if (computation.dataContext.type!=='property') {
                    const defaultValue = await computation.getDefaultValue()
                    await this.controller.applyResult(computation.dataContext, defaultValue)
                } else {
                    // property computation 也能提供 defaultValue 的能力？
                    const property = computation.dataContext.id
                    if (!property.defaultValue) {
                        property.defaultValue = await computation.getDefaultValue()
                    }
                }
            }
        }
    }
    async setupStateDefaultValues() {
        for(const computation of this.computations) {
            const computationHandle = computation as Computation
            // TODO 这里 createState 要放到 setup 前面，因为可能会修改 entity、relation ???
            // 1. 创建计算所需要的 state
            if (computationHandle.state) {
                for(const state of Object.values(computationHandle.state)) {
                    if (state instanceof GlobalBoundState) {
                        state.controller = this.controller
                        await this.controller.system.storage.set(DICTIONARY_RECORD, state.key , state.defaultValue ?? null)
                    } 
                }
            }
        }
    }
    erMutationEventSources: EntityEventSourceMap[] = []
    dataSourceMapTree: DataSourceMapTree = {}
    async setupMutationListeners() {
        this.sourceMapManager.initialize(this.computations)
        this.dataSourceMapTree = this.sourceMapManager.getSourceMapTree()

        this.controller.system.storage.listen(async (mutationEvents) => {
            for(let mutationEvent of mutationEvents){
                const sources = this.sourceMapManager.findSourceMapsForMutation(mutationEvent)
                if (sources.length > 0) {
                    for(const source of sources) {
                        if(!this.sourceMapManager.shouldTriggerUpdateComputation(source, mutationEvent)) {
                            continue
                        }
                        await this.runDirtyRecordsComputation(source, mutationEvent)
                    }
                }
            }
        })

        // TODO dataContext 为 property 的还要监听自身 record 的创建事件，创建的时候就要跑一边 computation 来设置初始值啊。
        // TODO 未来也许要监听 MutationEvent，让开发者能观测系统的变化。
    }
    async computeDirtyDataDepRecords(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent): Promise<any[]> {
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
    computeOldRecord(newRecord: any, sourceMap: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        // FIXME 理论上我们现在不需要 computeOldRecord 了。
        if(!sourceMap.targetPath?.length) {
            return mutationEvent.oldRecord
        }
        return {...newRecord}
    }
    async computeDataBasedDirtyRecordsAndEvents(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        let dirtyRecordsAndEvents: [any, EtityMutationEvent][] = []

        // 特殊处理 Global 类型的数据依赖
        if (source.dataDep.type === 'global' && mutationEvent.recordName === SYSTEM_RECORD) {
            // 对于 Global 类型，需要找到所有依赖这个 global 值的记录
            // 如果是 property 级别的 dataContext，需要找到所有实体记录，就是记录都受影响了
            if (source.computation.dataContext.type === 'property') {
                const propertyContext = source.computation.dataContext as PropertyDataContext
                const allRecords = await this.controller.system.storage.find(propertyContext.host.name, MatchExp.atom({key:'id', value:['not', null]}), {}, ['*'])
                dirtyRecordsAndEvents = allRecords.map(record => [record, {
                    dataDep: source.dataDep,
                    type: 'update',
                    recordName: propertyContext.host.name,
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
    async computeEventBasedDirtyRecordsAndEvents(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        const eventBasedComputation = source.computation as EventBasedComputation
        if (eventBasedComputation.computeDirtyRecords) {
            let dirtyRecords = (await eventBasedComputation.computeDirtyRecords!(mutationEvent)) || []
            dirtyRecords = Array.isArray(dirtyRecords) ? dirtyRecords : [dirtyRecords]
            return dirtyRecords.map(record => [record, {
                dataDep: source.dataDep,
                ...mutationEvent
            }]) as [any, EtityMutationEvent][]
        } else {
            return [[null, {
                dataDep: source.dataDep,
                ...mutationEvent
            }]] as [any, EtityMutationEvent][]
        }
    }
    isDataBasedComputation(computation: Computation) {
        return (computation as DataBasedComputation).compute !== undefined
    }
    async runDirtyRecordsComputation(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        if ((source as EntityCreateEventsSourceMap).isInitial) {
            await this.runComputation(source.computation, mutationEvent, mutationEvent.record, true)
        } else {
            let dirtyRecordsAndEvents: [any, EtityMutationEvent][] = []
            if (this.isDataBasedComputation(source.computation)) {
                dirtyRecordsAndEvents = await this.computeDataBasedDirtyRecordsAndEvents(source, mutationEvent)
            } else {
                dirtyRecordsAndEvents = await this.computeEventBasedDirtyRecordsAndEvents(source, mutationEvent)
            }
    
            for(const [record, erRecordMutationEvent] of dirtyRecordsAndEvents) {
                await this.runComputation(source.computation, erRecordMutationEvent, record)
            }
        }
    }
    getAsyncTaskRecordKey(computation: Computation) {
        if (computation.dataContext.type === 'property') {
            const propertyContext = computation.dataContext as PropertyDataContext
            return `${ASYNC_TASK_RECORD}_${propertyContext.host.name}_${propertyContext.id.name}`
        } else if (computation.dataContext.type === 'global') {
            return `${ASYNC_TASK_RECORD}_${computation.dataContext.id}`
        } else {
            // entity 或其他类型
            return `${ASYNC_TASK_RECORD}_${computation.dataContext.type}_${(computation.dataContext as any).id?.name || computation.dataContext.id}`
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
        let computationResult: ComputationResult|any

        const dataDeps = (computation as DataBasedComputation).dataDeps ? await this.resolveDataDeps(computation as DataBasedComputation, record) : {}

        if (forceFullCompute || (!computation.incrementalCompute && !computation.incrementalPatchCompute)) {
            // 全量计算。forceFullCompute 用在了初始化时，或者要修正数据时。
            const databasedComputation = computation as DataBasedComputation
            computationResult = await databasedComputation.compute(dataDeps, record)
        } else {
            if (computation.incrementalCompute) {
                // 1.增量计算，返回全量结果
                let lastValue = undefined
                if (computation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(computation.dataContext, record)
                }
                
                computationResult = await computation.incrementalCompute(lastValue, erRecordMutationEvent, record, dataDeps)
                
            } else if(computation.incrementalPatchCompute){
                // 2.增量计算，返回增量结果
                let lastValue = undefined
                if (computation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(computation.dataContext, record)
                }
    
                computationResult = await computation.incrementalPatchCompute(lastValue, erRecordMutationEvent, record, dataDeps)
            } else {
                throw new Error(`Unknown computation type: ${computation.constructor.name}`)
            }

            if (computationResult instanceof ComputationResultFullRecompute) {
                // 如果计算结果为 false ，说明不能增量计算，要全量计算。
                const databasedComputation = computation as DataBasedComputation
                assert(databasedComputation.compute !== undefined, 'compute must be defined for computation incrementalCompute returns false')
                computationResult = await databasedComputation.compute(dataDeps, record)
            }   
        }

        if (computationResult instanceof ComputationResultSkip) {
            return
        }
        if (computationResult instanceof ComputationResultAsync) {
            return await this.createAsyncTask(computation, computationResult.args, record)
        } 

        // 剩下的都是要直接处理结果的
        const result = computationResult instanceof ComputationResultResolved ? await computation.asyncReturn!(computationResult.result, computationResult.args) : computationResult
        
        if (computation.incrementalPatchCompute) {
            await this.controller.applyResultPatch(computation.dataContext, result, record)
        } else {
            await this.controller.applyResult(computation.dataContext, result, record)
        }
    }
    async resolveDataDeps(computation: DataBasedComputation, record?: any) {
        if (computation.dataDeps) {

            const values: any[] = await Promise.all(Object.values(computation.dataDeps).map(async dataDep => {
                if (dataDep.type === 'records') {
                    return await this.controller.system.storage.find(dataDep.source.name, undefined, {}, dataDep.attributeQuery)
                } else if (dataDep.type === 'property') {
                    return this.controller.system.storage.findOne((computation.dataContext as PropertyDataContext).host.name, MatchExp.atom({key: 'id', value: ['=', record.id]}), {}, dataDep.attributeQuery)
                } else if (dataDep.type === 'global') {
                    return await this.controller.system.storage.get(DICTIONARY_RECORD, dataDep.source.name)
                }
            }))
            return Object.fromEntries(Object.entries(computation.dataDeps).map(([dataDepName, dataDep], index) => [dataDepName, values[index]]))
        } else {
            return {}
        }
    }
    async setupGlobalDict() {
        const globalDict = this.controller.dict.filter(dict => dict.defaultValue !== undefined)
        for (const dict of globalDict) {
            await this.controller.system.storage.set(DICTIONARY_RECORD, dict.name, dict.defaultValue!())
        }
    }
    
    async setup() {
        // entity/relation/dict 是 computation 时的 defaultValue.
        await this.setupDefaultValues()
        // entity/relation/dict 中的 computation 内部的 state 的 default value.
        await this.setupStateDefaultValues()
        // 设置 computation 对 mutation 事件 的监听
        await this.setupMutationListeners()
        // 可能需要的 computation 初始化行为。
        // 为什么放在这里，因为 global dict 的赋值行为可能触发初始化的其他 computation.
        await this.setupGlobalDict()
    }
}

export { EtityMutationEvent };

