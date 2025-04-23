import { Controller } from "./Controller.js";
import { DataContext, ComputedDataHandle, PropertyDataContext, EntityDataContext } from "./computedDataHandles/ComputedDataHandle.js";

import { Entity, Interaction, Klass, KlassInstance, Property, Relation } from "@interaqt/shared";
import { assert } from "./util.js";
import { Computation, ComputationClass, DataBasedComputation, DataDep, DataMutationEventDep, EventBasedComputation, EventDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./computedDataHandles/Computation.js";
import { EVENT_RECORD, eventEntity, RecordMutationEvent } from "./System.js";
import { AttributeQueryData, MatchExp, RecordQueryData } from "@interaqt/storage";

type ERCreateMutationEventsSourceMap = {
    dataDep: DataDep,
    type: 'create',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
}

type ERDeleteMutationEventsSourceMap = {
    dataDep: DataDep,
    type: 'delete',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
}

type ERUpdateMutationEventsSourceMap = {
    dataDep: DataDep,
    type: 'update',
    recordName: string,
    attributes: string[],
    sourceRecordName: string,
    targetPath?: string[],
    computation: Computation,
    isRelation?: boolean
}

type ERMutationEventSourceMap = ERCreateMutationEventsSourceMap | ERDeleteMutationEventsSourceMap | ERUpdateMutationEventsSourceMap

type InteractionEventSourceMap = {
    eventDep: EventDep
    intraction: KlassInstance<typeof Interaction>
    computation: EventBasedComputation,
}


export type ERRecordMutationEvent = {
    dataDep:DataDep,
    type: 'create' | 'delete' | 'update',
    recordName: string,
    oldRecord?: any,
    record?: any,
    attributes?: string[],
    relatedAttribute?: string[],
    relatedMutationEvent?: RecordMutationEvent,
    isRelation?: boolean
}


export const SKIP_RESULT = Symbol('skip_result')

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
            assert(!!ComputationCtor, `cannot find Computation handle for ${args.constructor.name}`)

            this.computations.add(new ComputationCtor(this.controller, args, dataContext))
        }
    }
    createStates() {
        const states: {dataContext: DataContext, state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}}[] = []
        for(const computation of this.computations) {
            const computationHandle = computation as Computation
            if (computationHandle.createState) {
                const state = computationHandle.createState()
                states.push({dataContext: computationHandle.dataContext, state})
                computationHandle.state = state
            }   
        }
        return states
    }

    async setupDefaultValues() {
        for(const computation of this.computations) {
            const computationHandle = computation as Computation
            // 0. 创建 defaultValue
            // property 的默认值在 setup 的时候已经创建了。
            if (computationHandle.dataContext.type!=='property' && computationHandle.getDefaultValue) {
                const defaultValue = computationHandle.getDefaultValue()
                await this.controller.applyResult(computationHandle.dataContext, defaultValue)
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

                    } else if (state instanceof RecordBoundState) {
                        // TODO 这里的初始化在 monosystem 里面做了。理论上上面的 GlobalBoundState 也应该丢到里面去。
                        state.controller = this.controller
                        if (computationHandle.dataContext.type === 'property') {
                            state.record = (computationHandle.dataContext as PropertyDataContext)!.host.name!
                        } else {
                            state.record = (computationHandle.dataContext as EntityDataContext)!.id.name!
                        }
                    }
                }
            }
        }
    }
    erMutationEventSources: ERMutationEventSourceMap[] = []
    dataSourceMapTree: {[key: string]: {[key: string]: ERMutationEventSourceMap[]}} = {}
    interactionEventSources: InteractionEventSourceMap[] = []
    eventSourceMapTree: {[intreactionName: string]: InteractionEventSourceMap[]} = {}
    async setupMutationListeners() {

        const ERMutationEventSources: ERMutationEventSourceMap[]= []

        for(const computation of this.computations) {
            // 1. 根据 data deps 计算出 mutation events
            if( (computation as DataBasedComputation).compute) {
                const dataBasedComputation = computation as DataBasedComputation
                if (dataBasedComputation.dataDeps) {
                    ERMutationEventSources.push(
                        ...Object.entries(dataBasedComputation.dataDeps).map(([dataDepName, dataDep]) => this.convertDataDepToERMutationEventsSourceMap(dataDepName, dataDep, computation)).flat()
                    )
                }
            } else {
                // 2. EventBasedComputation
                const eventBasedComputation = computation as EventBasedComputation
                if (eventBasedComputation.eventDeps) {
                    Object.entries(eventBasedComputation.eventDeps!).forEach(([eventDepName, eventDep]) => {
                        if (eventDep.type === 'interaction') {
                            const interaction = eventDep.interaction
                            this.interactionEventSources.push({
                                eventDep,
                                intraction: interaction,
                                computation: eventBasedComputation
                            })

                        } else if (eventDep.type === 'data') {
                            // 复用 dataDep 的能力
                            const dataDep = eventDep.dataDep
                            ERMutationEventSources.push(
                                ...this.convertDataDepToERMutationEventsSourceMap(eventDepName, dataDep, computation, eventDep.eventType)
                            )
                        }
                    })
                }
            }
        }

        this.eventSourceMapTree = this.buildEventSourceMapTree(this.interactionEventSources)
        // 根据 sourcemap 来执行真正的监听
        this.erMutationEventSources = ERMutationEventSources
        this.dataSourceMapTree = this.buildDataSourceMapTree(this.erMutationEventSources)


        this.controller.system.storage.listen(async (mutationEvents) => {
            for(let mutationEvent of mutationEvents){
                if(mutationEvent.recordName === EVENT_RECORD) {
                    // TODO 未来考虑是不是不应该从 storage 来触发？但似乎从 stroge 出发也合理。
                    //  storage 代表的是系统的全部状态，不是传统意义上的只管存储
                    const event = mutationEvent.record!
                    const interactionEventSources = this.eventSourceMapTree[mutationEvent.record![event.interactionName]]
                    if (interactionEventSources) {
                        for(const interactionEventSource of interactionEventSources) {
                            await this.runEventBasedComputation(interactionEventSource, mutationEvent)
                        }
                    }

                } else {
                    const sources = this.dataSourceMapTree[mutationEvent.recordName]?.[mutationEvent.type]
                    if (sources) {
                        for(const source of sources) {
                            if(source.type === 'update') {
                                if(source.attributes!.every(attr => mutationEvent.record![attr]===mutationEvent.oldRecord![attr])) {
                                    continue
                                }   
                            }
                            await this.runDataBasedComputation(source, mutationEvent)
                        }
                    }
                }

                
            }
        })
        
    }
    
    async computeERRecordMutationEvents(source: ERMutationEventSourceMap, mutationEvent: RecordMutationEvent): Promise<ERRecordMutationEvent[]> {
        // 1. 直接就是当前 dataDep的增删改，复用信息就够了
        if(!source.targetPath?.length) {
            return [{
                dataDep: source.dataDep,
                ...mutationEvent
            }]
        }

        // 2. 剩下的是 dataDep 的"关联关系的create/delete" 或者 "关联实体的update"。都应该计算成当前依赖的"update"事件，但是事件里面应该要有详细的记录。
        //   写在 property 字段上 computation 可能会要用到这些更详细的信息。

        // 2.1. 关联实体的 update 事件，计算出关联实体的变化最终影响了哪些当前 dataDep
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
            // TODO  FIXME 没考虑 bidirectional 的情况!!!???
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

        // 2.2. 转化成所有 dataDepRecords 的 update 事件
        return dataDepRecords.map(record => ({
            dataDep: source.dataDep,
            type: 'update',
            recordName: record.name,
            record: record,
            relatedAttribute: source.targetPath,
            relatedMutationEvent: mutationEvent
        }))
        
    }
    async runEventBasedComputation(source: InteractionEventSourceMap, mutationEvent: RecordMutationEvent) {
        // TODO 
        const eventBasedComputation = source.computation as EventBasedComputation
        if(eventBasedComputation.dataContext.type === 'property') {
            let dirtyRecords:any[]|undefined = undefined
            if (eventBasedComputation.computeDirtyRecords) {
                dirtyRecords = await eventBasedComputation.computeDirtyRecords()
            } else {
                dirtyRecords = await this.controller.system.storage.find(eventBasedComputation.dataContext.host.name, undefined, undefined, ['*'])
            }
            if (dirtyRecords) {
                for(const record of dirtyRecords) {
                    if (eventBasedComputation.incrementalCompute) {
                        let lastValue = undefined
                        if (eventBasedComputation.useLastValue) {
                            lastValue = await this.controller.retrieveLastValue(eventBasedComputation.dataContext, record)
                        }
                        const result = await eventBasedComputation.incrementalCompute(lastValue, mutationEvent, record)
                        await this.controller.applyResult(eventBasedComputation.dataContext, result, record)
                    } else if(eventBasedComputation.incrementalPatchCompute){
                        let lastValue = undefined
                        if (eventBasedComputation.useLastValue) {
                            lastValue = await this.controller.retrieveLastValue(eventBasedComputation.dataContext, record)
                        }
                        const patch = await eventBasedComputation.incrementalPatchCompute(lastValue, mutationEvent, record)
                        if (patch) {
                            await this.controller.applyResultPatch(eventBasedComputation.dataContext, patch, record)
                        }
                    }
                }
            }
            
        } else {
            if (eventBasedComputation.incrementalCompute) {
                let lastValue = undefined
                if (eventBasedComputation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(eventBasedComputation.dataContext)
                }
                const result = await eventBasedComputation.incrementalCompute(lastValue, eventBasedComputation)
                await this.controller.applyResult(eventBasedComputation.dataContext, result)
            } else if(eventBasedComputation.incrementalPatchCompute){
                let lastValue = undefined
                if (eventBasedComputation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(eventBasedComputation.dataContext)
                }
                const patch = await eventBasedComputation.incrementalPatchCompute(lastValue)
                if (patch) {
                    await this.controller.applyResultPatch(eventBasedComputation.dataContext, patch)
                }
            }
        }
        
    }
    async runDataBasedComputation(source: ERMutationEventSourceMap, mutationEvent: RecordMutationEvent) {
        // 根据 recordMutationEvent 计算出来哪些数据需要重新计算
        //  1. 如果是 global/entity/relation，那么全都是要全部重算的。
        //  2. 如果是 property，只要反向匹配出来哪些 records 收到了影响，重算就行了。
        const erRecordMutationEvents = await this.computeERRecordMutationEvents(source, mutationEvent)
        const dataBasedComputation = source.computation as DataBasedComputation

        for(const erRecordMutationEvent of erRecordMutationEvents) {
            if (dataBasedComputation.incrementalCompute) {
                let lastValue = undefined
                if (dataBasedComputation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(dataBasedComputation.dataContext, erRecordMutationEvent.record)
                }
                const result = await dataBasedComputation.incrementalCompute(lastValue, erRecordMutationEvent)
                // TODO 应用 result
                await this.controller.applyResult(dataBasedComputation.dataContext, result, erRecordMutationEvent.record)
    
    
            } else if(dataBasedComputation.incrementalPatchCompute){
                let lastValue = undefined
                if (dataBasedComputation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(dataBasedComputation.dataContext, erRecordMutationEvent.record)
                }
                const patch = await dataBasedComputation.incrementalPatchCompute(lastValue, erRecordMutationEvent)
                if (patch) {
                    await this.controller.applyResultPatch(dataBasedComputation.dataContext, patch, erRecordMutationEvent.record)
                }
    
    
            } else {
                // TODO 需要注入 dataDeps
                const result = await dataBasedComputation.compute()
                // TODO 应用 result
                await this.controller.applyResult(dataBasedComputation.dataContext, result, erRecordMutationEvent.record)
            }
        }

        
    }
    buildEventSourceMapTree(sourceMaps: InteractionEventSourceMap[]) {
        const sourceMapTree: {[interactionName:string]: InteractionEventSourceMap[]} = {}
        sourceMaps.forEach(sourceMap => {
            if (!sourceMapTree[sourceMap.intraction.name]) {
                sourceMapTree[sourceMap.intraction.name] = []
            }
            sourceMapTree[sourceMap.intraction.name].push(sourceMap)
        })
        return sourceMapTree
    }
    buildDataSourceMapTree(sourceMaps: ERMutationEventSourceMap[]) {
        // 两层结构，第一层是 recordName，第二层是 type
        const sourceMapTree: {[key: string]: {[key: string]: ERMutationEventSourceMap[]}   } = {}
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
    convertDataDepToERMutationEventsSourceMap(dataDepName:string, dataDep: DataDep, computation: Computation, eventType?: 'create'|'delete'|'update'): ERMutationEventSourceMap[] {
        const ERMutationEventsSource: ERMutationEventSourceMap[]= []
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
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataDep.source.name, dataDep.attributeQuery, [], computation))
                }
            }
            
        } else if (dataDep.type==='property') {
            // 只能监听 update eventType。
            const dataContext = computation.dataContext as PropertyDataContext

            if (dataDep.attributeQuery) {
                // 注意这里的 recordName 应该是当前数据 entity 的 name，因为依赖的是 property 所在的自身 entity
                ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataContext.host.name, dataDep.attributeQuery, [], computation))
            }
        } else if (dataDep.type ==='global') {
            // TODO global 怎么监听啊
            // 只能监听 update eventType
        }

        return ERMutationEventsSource
    }
    
    convertAttrsToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, attributes: AttributeQueryData, context: string[], computation: Computation) {
        const ERMutationEventsSource: ERMutationEventSourceMap[] = []
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
            const recordName = context.length > 0 ? this.controller.system.storage.getEntityName(baseRecordName, context.join('.')) : baseRecordName
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
        const ERMutationEventsSource: ERMutationEventSourceMap[] = []
        // TODO 转化成对关联实体的监听
        // 1. 先监听"关联实体关系"的 create/delete
        const relatedRecordName = this.controller.system.storage.getRelationName(baseRecordName, context.join('.'))
        ERMutationEventsSource.push({
            dataDep,
            type: 'create',
            recordName: relatedRecordName,
            sourceRecordName: baseRecordName,
            isRelation: true,
            targetPath: context,
            computation
        }, {
            dataDep,
            type: 'delete',
            recordName: relatedRecordName,
            sourceRecordName: baseRecordName,
            isRelation: true,
            targetPath: context,
            computation
        })

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
