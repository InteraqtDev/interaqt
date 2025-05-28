import { Controller } from "./Controller.js";
import { DataContext, ComputedDataHandle, PropertyDataContext, EntityDataContext } from "./computedDataHandles/ComputedDataHandle.js";

import { Entity, Klass, KlassInstance, Property, Relation } from "@shared";
import { assert } from "./util.js";
import { Computation, ComputationClass, DataBasedComputation, DataDep, EventBasedComputation, GlobalBoundState, RecordBoundState, RecordsDataDep, RelationBoundState } from "./computedDataHandles/Computation.js";
import { InteractionEventEntity, RecordMutationEvent } from "./System.js";
import { AttributeQueryData, MatchExp, RecordQueryData } from "@storage";

type EntityCreateEventsSourceMap = {
    dataDep: DataDep,
    type: 'create',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
}

type EntityDeleteEventsSourceMap = {
    dataDep: DataDep,
    type: 'delete',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
}

type EntityUpdateEventsSourceMap = {
    dataDep: DataDep,
    type: 'update',
    recordName: string,
    attributes: string[],
    sourceRecordName: string,
    targetPath?: string[],
    computation: Computation,
    isRelation?: boolean
}

type EntityEventSourceMap = EntityCreateEventsSourceMap | EntityDeleteEventsSourceMap | EntityUpdateEventsSourceMap



export type EtityMutationEvent = RecordMutationEvent & {
    dataDep:DataDep,
    attributes?: string[],
    relatedAttribute?: string[],
    relatedMutationEvent?: RecordMutationEvent,
    isRelation?: boolean
}


export const ASYNC_TASK_RECORD = '_ASYNC_TASK_'

export class Scheduler {
    computations = new Set<Computation>()
    constructor(public controller: Controller, entities: KlassInstance<typeof Entity>[], relations: KlassInstance<typeof Relation>[], dict: KlassInstance<typeof Property>[]) {
        const computationInputs: {dataContext: DataContext, args: KlassInstance<any>}[] = []
        entities.forEach(entity => {
            if (entity.computedData) {
                computationInputs.push({dataContext: {type: 'entity',id: entity},args: entity.computedData})
            }

            // property 的
            entity.properties?.forEach(property => {
                if (property.computedData) {
                    computationInputs.push({dataContext: {type: 'property',host: entity,id: property.name},args: property.computedData})
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
                        computationInputs.push({dataContext: {type: 'property',host: relation,id: property.name},args: property.computedData})
                    }
                })
            }
        })

        dict.forEach(dictItem => {
            if (dictItem.computedData) {
                computationInputs.push({dataContext: {type: 'global',id: dictItem.name},args: dictItem.computedData})
            }
        })


        for(const computation of computationInputs) {
            const dataContext = computation.dataContext
            const args = computation.args
            const handles = ComputedDataHandle.Handles
            const ComputationCtor = handles.get(args.constructor as Klass<any>)![dataContext.type]! as ComputationClass
            assert(!!ComputationCtor, `cannot find Computation handle for ${(args.constructor as any).displayName || (args.constructor as any).name}`)
            const newComputation = new ComputationCtor(this.controller, args, dataContext)
            this.computations.add(newComputation)


            // TODO 建立自己所需要的 task 任务表。应该每一个 asyncComputation 都有一张独立的表。global state 总共一张。
            if(this.isAsyncComputation(newComputation)) {
                if (newComputation.dataContext.type === 'property') {
                    const AsyncTaskEntity = Entity.create({
                        name: this.getAsyncTaskRecordKey(newComputation),
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
                        name: `${AsyncTaskEntity.name}_${(newComputation.dataContext as PropertyDataContext).host?.name}_${(newComputation.dataContext as PropertyDataContext).id}`,
                        source: AsyncTaskEntity,
                        target: (newComputation.dataContext as PropertyDataContext).host,
                        sourceProperty: 'record',
                        targetProperty: `_${newComputation.dataContext.id}_task`,
                        type: '1:1'
                    })
                    entities.push(AsyncTaskEntity)
                    relations.push(AsyncTaskRelation)
                }
                // TODO global 的情况
            }
        }


        

    }
    createStates() {
        const states: {dataContext: DataContext, state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}}[] = []
        for(const computation of this.computations) {
            if (computation.createState) {
                const state = computation.createState()
                states.push({dataContext: computation.dataContext, state})
                computation.state = state


                for(let stateItem of Object.values(state)) {
                    stateItem.controller = this.controller
                    stateItem.controller = this.controller
                    if (stateItem instanceof RecordBoundState) {
                        if (computation.dataContext.type === 'property') {
                            stateItem.record = (computation.dataContext as PropertyDataContext)!.host.name!
                        } else {
                            stateItem.record = (computation.dataContext as EntityDataContext)!.id.name!
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
                    const property = computation.dataContext.host.properties?.find(property => property.name === computation.dataContext.id)!
                    if (!property.defaultValue) {
                        // FIXME 这里没有支持 getDefaultValue 的 async 模式。会不会有问题？？？
                        property.defaultValue = computation.getDefaultValue()
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
                for(const [stateName, state] of Object.entries(computationHandle.state)) {
                    if (state instanceof GlobalBoundState) {
                        state.controller = this.controller

                        state.key = `${computationHandle.dataContext!.id!}_${stateName}`

                        if (typeof state.defaultValue !== undefined) {
                            await this.controller.system.storage.set('state', state.key , state.defaultValue)
                        }

                    } 
                }
            }
        }
    }
    erMutationEventSources: EntityEventSourceMap[] = []
    dataSourceMapTree: {[key: string]: {[key: string]: EntityEventSourceMap[]}} = {}
    async setupMutationListeners() {

        const ERMutationEventSources: EntityEventSourceMap[]= []

        for(const computation of this.computations) {
            // 1. 根据 data deps 计算出 mutation events
            if( this.isDataBasedComputation(computation)) {
                const dataBasedComputation = computation as DataBasedComputation
                if (dataBasedComputation.dataDeps) {
                    ERMutationEventSources.push(
                        ...Object.entries(dataBasedComputation.dataDeps).map(([dataDepName, dataDep]) => this.convertDataDepToERMutationEventsSourceMap(dataDepName, dataDep, computation)).flat()
                    )
                }
            } else {
                // 2. EventBasedComputation 等同于监听 
                // - EventEntity 的 create 事件
                // - erMutationEvent 的 create 事件
                // - Action 的 create 事件
                // - Activity 的 create 事件
                // FIXME 增加 ERMutationEvents 的 create 事件
                ERMutationEventSources.push({
                    dataDep: {
                        type: 'records',
                        source: InteractionEventEntity,
                        attributeQuery: ['*']
                    },
                    type: 'create',
                    recordName: InteractionEventEntity.name,
                    sourceRecordName: InteractionEventEntity.name,
                    computation
                })
            }
        }

        // 根据 sourcemap 来执行真正的监听
        this.erMutationEventSources = ERMutationEventSources
        this.dataSourceMapTree = this.buildDataSourceMapTree(this.erMutationEventSources)

        const root = this
        this.controller.system.storage.listen(async (mutationEvents) => {
            for(let mutationEvent of mutationEvents){
                const sources = this.dataSourceMapTree[mutationEvent.recordName]?.[mutationEvent.type]
                if (sources) {
                    for(const source of sources) {
                        if(source.type === 'update') {
                            const propAttrs = source.attributes!.filter(attr => attr!=='id')
                            if(propAttrs.every(attr => !mutationEvent.record!.hasOwnProperty(attr) || (mutationEvent.record![attr]===mutationEvent.oldRecord![attr])) ){
                                continue
                            }   
                        }
                        await this.runDirtyRecordsComputation(source, mutationEvent)
                    }
                }
            }
        })
    }
    async computeDirtyRecords(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        if(!source.targetPath?.length) {
            return [mutationEvent.oldRecord ?? mutationEvent.record]
        }

        let dataDepRecords: any[] = []
        if (!source.isRelation) { 
            assert(source.type === 'update', 'only support update event for entity')
            dataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                key: source.targetPath!.concat('id').join('.'),
                value: ['=', mutationEvent.oldRecord?.id??mutationEvent.record?.id]
            }))
        } else {
            // 2.3. 关联关系的 create/delete 事件，计算出关联关系的增删改最终影响了哪些当前 dataDep
            assert(source.type === 'create' || source.type === 'delete', 'only support create/delete event for relation')
            const relation = this.controller.relations.find(relation => relation.name === source.recordName)
            // FIXME 没考虑 bidirectional 的情况，双向关系死循环了
            const isSource = relation?.sourceProperty === source.targetPath!.at(-1)
            const dataDep = source.dataDep as RecordsDataDep
            if (source.type === 'create') {
                dataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                    key: source.targetPath!.concat('id').join('.'),
                    value: ['=', mutationEvent.record![isSource ? 'target' : 'source']!.id]
                }), undefined, dataDep.attributeQuery)
            } else {
                dataDepRecords = await this.controller.system.storage.find(source.sourceRecordName, MatchExp.atom({
                    key: source.targetPath!.slice(0, -1).concat('id').join('.'),
                    value: ['=', mutationEvent.record![isSource ? 'source' : 'target']!.id]
                }), undefined, dataDep.attributeQuery)
            }
        }

        return dataDepRecords
    }
    computeOldRecord(newRecord: any, sourceMap: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        if (!sourceMap.targetPath?.length) {
            return mutationEvent.oldRecord
        }
        const result = {...newRecord}
        const path = [...sourceMap.targetPath]
        const lastAttr = path.pop()!
        let pointer = result
        // 一路浅拷贝
        for(const attr of path) {
            // fIXME Computation 不能跨越 x:n 的集合，所以路径上应该都是对象。
            pointer[attr] = {...pointer[attr]}
            pointer = pointer[attr]
        }
        if(Array.isArray(pointer[lastAttr])) {
            // 集合
            if (mutationEvent.type === 'delete') {
                pointer[lastAttr] = pointer[lastAttr].concat(mutationEvent.record)
            } else if (mutationEvent.type === 'create') {
                pointer[lastAttr] = pointer[lastAttr].filter(item => item.id !== mutationEvent.record!.id)
            } else if (mutationEvent.type === 'update') {
                pointer[lastAttr] = pointer[lastAttr].map(item => item.id === mutationEvent.oldRecord!.id ? {...item, ...mutationEvent.oldRecord} : item)
            }
        } else {
            if (mutationEvent.type === 'delete') {
                pointer[lastAttr] = mutationEvent.record
            } else if (mutationEvent.type === 'create') {
                pointer[lastAttr] = undefined
            } else if (mutationEvent.type === 'update') {
                pointer[lastAttr] = {...pointer[lastAttr], ...mutationEvent.oldRecord}
            }
        }
        
        return result
    }
    async computeDataBasedDirtyRecordsAndEvents(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent) {
        let dirtyRecordsAndEvents: [any, EtityMutationEvent][] = []

        if(!source.targetPath?.length) {
            dirtyRecordsAndEvents = [[mutationEvent.record, {
                dataDep: source.dataDep,
                ...mutationEvent
            }]]
        } else {
            const dataDepRecords = await this.computeDirtyRecords(source, mutationEvent)
            dirtyRecordsAndEvents = dataDepRecords.map(record => [record, {
                dataDep: source.dataDep,
                type: 'update',
                recordName: record.name,
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
    getAsyncTaskRecordKey(computation: Computation) {
        return `${ASYNC_TASK_RECORD}_${(computation.dataContext as PropertyDataContext).host?.name ?  `${(computation.dataContext as PropertyDataContext).host?.name}_` : ''}${(computation.dataContext as PropertyDataContext).id}`
    }
    async createAsyncTask(computation: Computation, args: any, record?: any) {
        // TODO 创建异步任务
        // TODO 要根据不同 dataContext 来创建不同的 task。
        if (computation.dataContext.type === 'property') {
            return this.controller.system.storage.create(this.getAsyncTaskRecordKey(computation), {
                args,
                record
            })
        } else {
            // global/entity 的情况
        }
    }

    async handleAsyncReturn(computation: DataBasedComputation, taskRecordIdRef: {id: string}) {
        const taskRecord = await this.controller.system.storage.findOne(this.getAsyncTaskRecordKey(computation), MatchExp.atom({key: 'id', value: ['=', taskRecordIdRef.id]}), {}, ['*', ['record', {attributeQuery: ['id']}]])
        // 1. 检查 task 是否仍然是 dataContext 当前最新的，如果不是，说明 task 已经过期，返回值不用管了。
        if (taskRecord.status === 'success') {

            const resultOrPatch = await computation.asyncReturn!(taskRecord.result, taskRecord.args)
            if (computation.incrementalPatchCompute) {
                await this.controller.applyResultPatch(computation.dataContext, resultOrPatch, taskRecord.record)
            } else {
                await this.controller.applyResult(computation.dataContext, resultOrPatch, taskRecord.record)
            }
        }
    }

    isAsyncComputation(computation: Computation) {
        return (computation as DataBasedComputation).asyncReturn !== undefined
    }

    async runComputation(computation: Computation, erRecordMutationEvent: RecordMutationEvent, record?: any) {
        if (computation.incrementalCompute) {
            // 1.增量计算，返回全量结果
            let lastValue = undefined
            if (computation.useLastValue) {
                lastValue = await this.controller.retrieveLastValue(computation.dataContext, record)
            }
            
            const argsOrResult = await computation.incrementalCompute(lastValue, erRecordMutationEvent, record)
            if (this.isAsyncComputation(computation)) {
                await this.createAsyncTask(computation, argsOrResult, record)
            } else {
                await this.controller.applyResult(computation.dataContext, argsOrResult, record)
            }
        } else if(computation.incrementalPatchCompute){
            // 2.增量计算，返回增量结果
            let lastValue = undefined
            if (computation.useLastValue) {
                lastValue = await this.controller.retrieveLastValue(computation.dataContext, record)
            }

            const argsOrPatch = await computation.incrementalPatchCompute(lastValue, erRecordMutationEvent, record)
            if (this.isAsyncComputation(computation)) {
                await this.createAsyncTask(computation, argsOrPatch, record)
            } else {
                await this.controller.applyResultPatch(computation.dataContext, argsOrPatch, record)
            }

        } else {
            // 3. 全量计算
            const databasedComputation = computation as DataBasedComputation
            // FIXME 需要注入 dataDeps
            const argsOrResult = await databasedComputation.compute()
            if (this.isAsyncComputation(computation)) {
                // 应用 result
                await this.createAsyncTask(computation, argsOrResult, record)
            } else {
                // 应用 resultPatch
                await this.controller.applyResultPatch(databasedComputation.dataContext, argsOrResult, record)
            }
        }
    }
    buildDataSourceMapTree(sourceMaps: EntityEventSourceMap[]) {
        // 两层结构，第一层是 recordName，第二层是 type
        const sourceMapTree: {[key: string]: {[key: string]: EntityEventSourceMap[]}   } = {}
        sourceMaps.forEach(source => {
            if (!sourceMapTree[source.recordName]) {
                sourceMapTree[source.recordName] = {}
            }
            if (!sourceMapTree[source.recordName][source.type]) {
                sourceMapTree[source.recordName][source.type] = []
            }
            sourceMapTree[source.recordName][source.type].push(source)
        })
        return sourceMapTree
    }
    convertDataDepToERMutationEventsSourceMap(dataDepName:string, dataDep: DataDep, computation: Computation, eventType?: 'create'|'delete'|'update'): EntityEventSourceMap[] {
        const ERMutationEventsSource: EntityEventSourceMap[]= []
        if (dataDep.type === 'records') {
            if (!eventType || eventType === 'create') {
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'create',
                    recordName: dataDep.source.name,
                    sourceRecordName: dataDep.source.name,
                    computation
                })
            }
            if (!eventType || eventType === 'delete') {
                ERMutationEventsSource.push({    
                    dataDep: dataDep,
                    type: 'delete',
                    recordName: dataDep.source.name,
                    sourceRecordName: dataDep.source.name,
                    computation
                })
            }
            
            if (!eventType || eventType === 'update') {
                // 监听 update
                if (dataDep.attributeQuery) {
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataDep.source.name, dataDep.attributeQuery, [], computation, false))
                }
            }
            
        } else if (dataDep.type==='property') {
            // 只能监听 update eventType。
            const dataContext = computation.dataContext as PropertyDataContext

            if (dataDep.attributeQuery) {
                // 注意这里的 recordName 应该是当前数据 entity 的 name，因为依赖的是 property 所在的自身 entity
                ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataContext.host.name, dataDep.attributeQuery, [], computation, true))
            }
        } else if (dataDep.type ==='global') {
            // TODO global 怎么监听啊
            // 只能监听 update eventType
        }

        return ERMutationEventsSource
    }
    
    convertAttrsToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, attributes: AttributeQueryData, context: string[], computation: Computation, includeCreate: boolean = false) {
        const ERMutationEventsSource: EntityEventSourceMap[] = []
        const primitiveAttr: string[] = []
        const relationQueryAttr: [string, RecordQueryData][] = []
        

        attributes.forEach(attr => {
            if (typeof attr === 'string' && attr !== '*') {
                primitiveAttr.push(attr)
            } else if (attr ==='*') {
                // TODO 要读定义
            } else if (Array.isArray(attr)) {
                relationQueryAttr.push(attr as [string, RecordQueryData])
            } else {
                throw new Error(`unknown attribute type: ${attr}`)
            }
        })
        // 自身的 attribute update
        if (primitiveAttr.length > 0) {
            let recordName = baseRecordName
            if (context.length>0) {
                if (context.at(-1) === '&') {
                    recordName = this.controller.system.storage.getRelationName(baseRecordName, context.slice(0, -1).join('.'))
                } else {
                    recordName = this.controller.system.storage.getEntityName(baseRecordName, context.join('.'))
                }
            }
            // 当依赖是 property 的时候，record 的创建也要监听，相当于初次就要执行 computation
            if (includeCreate) {
                ERMutationEventsSource.push({
                    dataDep,
                    type: 'create',
                    recordName,
                    sourceRecordName: baseRecordName,
                    targetPath: context,
                    computation
                })
            }
            ERMutationEventsSource.push({
                dataDep,
                type: 'update',
                recordName,
                sourceRecordName: baseRecordName,
                targetPath: context,
                attributes: primitiveAttr,
                computation
            })
        }

        // 关联 record 字段的更新
        relationQueryAttr.forEach(([attrName, subQuery]) => {
            ERMutationEventsSource.push(...this.convertRelationAttrToERMutationEventsSourceMap(dataDep, baseRecordName, subQuery.attributeQuery!, context.concat(attrName), computation))
        })
        return ERMutationEventsSource
    }

    convertRelationAttrToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, subAttrs: AttributeQueryData, context: string[], computation: Computation) {
        const ERMutationEventsSource: EntityEventSourceMap[] = []

        if (context.at(-1) !== '&') {
            // 1. 先监听"关联实体关系"的 create/delete
            const realtionRecordName = this.controller.system.storage.getRelationName(baseRecordName, context.join('.'))
            ERMutationEventsSource.push({
                dataDep,
                type: 'create',
                recordName: realtionRecordName,
                sourceRecordName: baseRecordName,
                isRelation: true,
                targetPath: context,
                computation
            }, {
                dataDep,
                type: 'delete',
                recordName: realtionRecordName,
                sourceRecordName: baseRecordName,
                isRelation: true,
                targetPath: context,
                computation
            })
        }
        // 2. 监听关联实体的属性 update
        if (subAttrs.length > 0) {
            ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, baseRecordName, subAttrs, context, computation))
        }
            
        return ERMutationEventsSource

        
    }
    async setup() {
        await this.setupDefaultValues()
        await this.setupStateDefaultValues()
        await this.setupMutationListeners()
    }

}
