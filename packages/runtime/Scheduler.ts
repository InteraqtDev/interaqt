import { Controller } from "./Controller.js";
import { DataContext, ComputedDataHandle, PropertyDataContext, EntityDataContext } from "./computedDataHandles/ComputedDataHandle.js";

import { Entity, Klass, KlassInstance, Property, Relation } from "@interaqt/shared";
import { assert } from "./util.js";
import { Computation, ComputationClass, DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./computedDataHandles/Computation.js";
import { RecordMutationEvent } from "./System.js";
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

type ERMutationEventsSourceMap = ERCreateMutationEventsSourceMap | ERDeleteMutationEventsSourceMap | ERUpdateMutationEventsSourceMap

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
                        state.record = (computationHandle.dataContext as PropertyDataContext)!.host.name!
                    }
                }
            }
        }
    }
    async setupMutationListeners() {

        const ERMutationEventsSource: ERMutationEventsSourceMap[]= []

        for(const computation of this.computations) {
            const computationHandle = computation as Computation
            // TODO 这里 createState 要放到 setup 前面，因为可能会修改 entity、relation ???
            // 2. 根据 data deps 计算出 mutation events
            if( (computationHandle as DataBasedComputation).compute) {
                const dataBasedComputation = computationHandle as DataBasedComputation
                if (dataBasedComputation.dataDeps) {
                    ERMutationEventsSource.push(
                        ...this.convertDataDepsToERMutationEventsSourceMap(dataBasedComputation.dataDeps, computationHandle)
                    )
                }
            }
        }

        // 根据 sourcemap 来执行真正的监听
        const sourceMapTree = this.buildSourceMapTree(ERMutationEventsSource)
        this.controller.system.storage.listen(async (mutationEvents) => {
            for(let mutationEvent of mutationEvents){
                const sources = sourceMapTree[mutationEvent.recordName]?.[mutationEvent.type]
                if (sources) {
                    for(const source of sources) {
                        if(source.type === 'update') {
                            if(source.attributes!.every(attr => mutationEvent.record![attr]===mutationEvent.oldRecord![attr])) {
                                continue
                            }   
                        }
                        await this.runComputation(source, mutationEvent)
                    }
                }
            }
        })
        this.ERMutationEventsSource = ERMutationEventsSource
        this.sourceMapTree = sourceMapTree
    }
    ERMutationEventsSource: ERMutationEventsSourceMap[] = []
    sourceMapTree: {[key: string]: {[key: string]: ERMutationEventsSourceMap[]}} = {}
    async computeERRecordMutationEvents(source: ERMutationEventsSourceMap, mutationEvent: RecordMutationEvent): Promise<ERRecordMutationEvent[]> {
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
    async runComputation(source: ERMutationEventsSourceMap, mutationEvent: RecordMutationEvent) {
        const erRecordMutationEvents = await this.computeERRecordMutationEvents(source, mutationEvent)
        const dataBasedComputation = source.computation as DataBasedComputation

        for(const erRecordMutationEvent of erRecordMutationEvents) {
            if (dataBasedComputation.incrementalCompute) {
                let lastValue = undefined
                if (dataBasedComputation.useLastValue) {
                    lastValue = await this.controller.retrieveLastValue(dataBasedComputation.dataContext)
                }
                const result = await dataBasedComputation.incrementalCompute(lastValue, erRecordMutationEvent)
                // TODO 应用 result
                await this.controller.applyResult(dataBasedComputation.dataContext, result, erRecordMutationEvent.record)
    
    
            } else if(dataBasedComputation.incrementalPatchCompute){
                const patch = await dataBasedComputation.incrementalPatchCompute(erRecordMutationEvent)
                // TODO 应用 patch
                await this.controller.applyResultPatch(dataBasedComputation.dataContext, patch, erRecordMutationEvent.record)
    
    
            } else {
                // TODO 需要注入 dataDeps
                const result = await dataBasedComputation.compute()
                // TODO 应用 result
                await this.controller.applyResult(dataBasedComputation.dataContext, result, erRecordMutationEvent.record)
            }
        }

        
    }
    buildSourceMapTree(sourceMap: ERMutationEventsSourceMap[]) {
        // 两层结构，第一层是 recordName，第二层是 type
        const sourceMapTree: {[key: string]: {[key: string]: ERMutationEventsSourceMap[]}   } = {}
        sourceMap.forEach(source => {
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
    convertDataDepsToERMutationEventsSourceMap(dataDeps: {[key: string]: DataDep}, computation: Computation) {
        const ERMutationEventsSource: ERMutationEventsSourceMap[]= []
        Object.entries(dataDeps).forEach(([depName, dep]: [string, DataDep]) => {
            if (dep.type === 'records') {
                ERMutationEventsSource.push({
                    dataDep: dep,
                    type: 'create',
                    recordName: dep.source.name,
                    sourceRecordName: dep.source.name,
                    computation
                }, {    
                    dataDep: dep,
                    type: 'delete',
                    recordName: dep.source.name,
                    sourceRecordName: dep.source.name,
                    computation
                })

                if (dep.attributeQuery) {
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dep, dep.source.name, dep.attributeQuery, [], computation))
                }
            } else if (dep.type==='property') {
                const dataContext = computation.dataContext as PropertyDataContext

                if (dep.attributeQuery) {
                    // 注意这里的 recordName 应该是当前数据 entity 的 name，因为依赖的是 property 所在的自身 entity
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dep, dataContext.host.name, dep.attributeQuery, [], computation))
                }
            } else if (dep.type ==='global') {
                // TODO global 怎么监听啊
            }
        })

        return ERMutationEventsSource
    }
    convertAttrsToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, attributes: AttributeQueryData, context: string[], computation: Computation) {
        const dataContext = computation.dataContext as EntityDataContext

        const ERMutationEventsSource: ERMutationEventsSourceMap[] = []
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

        relationQueryAttr.forEach(([attrName, subQuery]) => {
            ERMutationEventsSource.push(...this.convertRelationAttrToERMutationEventsSourceMap(dataDep, baseRecordName, subQuery.attributeQuery!, context.concat(attrName), computation))
        })
        return ERMutationEventsSource
    }

    convertRelationAttrToERMutationEventsSourceMap(dataDep: DataDep, baseRecordName: string, subAttrs: AttributeQueryData, context: string[], computation: Computation) {
        const ERMutationEventsSource: ERMutationEventsSourceMap[] = []
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
