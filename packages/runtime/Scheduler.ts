import { Controller } from "./Controller.js";
import { DataContext, ComputedDataHandle, PropertyDataContext, EntityDataContext } from "./computedDataHandles/ComputedDataHandle.js";

import { Entity, Klass, KlassInstance, Property, Relation } from "@interaqt/shared";
import { assert } from "./util.js";
import { Computation, ComputationClass, DataBasedComputation, DateDep, GlobalBoundState, RecordBoundState } from "./computedDataHandles/Computation.js";
import { RecordMutationEvent } from "./System.js";

type ERMutationEventsSourceMap = {
    type: 'create' | 'delete' | 'update',
    recordName: string,
    attributes?: string[],
    targetPath?: string[],
    computation: Computation
}

export type ERRecordMutationEvent = {
    type: 'create' | 'delete' | 'update',
    recordName: string,
    oldRecord?: any,
    record?: any,
    attributes?: string[],
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

            this.computations.add(new ComputationCtor(this, args, dataContext))
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
            if (computationHandle.getDefaultValue) {
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
                        // TODO 需要附加到 ER 上面去。
                        const propertyDataContext = computationHandle.dataContext as PropertyDataContext
                        state.controller = this.controller
                        state.record = propertyDataContext.host.name!
                        state.key = `${propertyDataContext.id}_${stateName}`
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

        // TODO 根据 sourcemap 来执行真正的监听
        const sourceMapTree = this.buildSourceMapTree(ERMutationEventsSource)
        this.controller.system.storage.listen(async (mutationEvents) => {
            for(let mutationEvent of mutationEvents){
                const sources = sourceMapTree[mutationEvent.recordName]?.[mutationEvent.type]
                if (sources) {
                    for(const source of sources) {
                        if(mutationEvent.type === 'update') {
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
    async runComputation(source: ERMutationEventsSourceMap, mutationEvent: RecordMutationEvent) {

        const dataBasedComputation = source.computation as DataBasedComputation
        // TODO Event 里面如果有 targetPath 的，全部都是 update 事件
        const erRecordMutationEvent: ERRecordMutationEvent = (mutationEvent.type === 'update' && source.targetPath) ? {
            type: 'update',
            recordName: source.recordName,
            attributes: source.attributes?.map(attr => `${source.targetPath!.join('.')}.${attr}`) ?? [],
        } : mutationEvent

        if (dataBasedComputation.incrementalCompute) {
            let lastValue = undefined
            if (dataBasedComputation.useLastValue) {
                lastValue = await this.controller.retrieveLastValue(dataBasedComputation.dataContext)
            }
            const result = await dataBasedComputation.incrementalCompute(lastValue, erRecordMutationEvent)
            // TODO 应用 result
            await this.controller.applyResult(dataBasedComputation.dataContext, result)


        } else if(dataBasedComputation.incrementalPatchCompute){
            const patch = await dataBasedComputation.incrementalPatchCompute(erRecordMutationEvent)
            // TODO 应用 patch
            await this.controller.applyResultPatch(dataBasedComputation.dataContext, patch)


        } else {
            // TODO 需要注入 dataDeps
            const result = await dataBasedComputation.compute()
            // TODO 应用 result
            await this.controller.applyResult(dataBasedComputation.dataContext, result)
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
    convertDataDepsToERMutationEventsSourceMap(dataDeps: {[key: string]: DateDep}, computation: Computation) {
        const ERMutationEventsSource: ERMutationEventsSourceMap[]= []
        const dataContext = computation.dataContext as EntityDataContext
        Object.entries(dataDeps).forEach(([depName, dep]: [string, DateDep]) => {
            if (dep.type === 'records') {
                ERMutationEventsSource.push({
                    type: 'create',
                    recordName: dep.name,
                    computation
                }, {
                    type: 'delete',
                    recordName: dep.name,
                    computation
                })

                if (dep.attributes) {
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dep.name, dep.attributes, [], computation))
                }
            } else if (dep.type==='$record') {
                if (dep.attributes) {
                    // 注意这里的 recordName 应该是当前数据 entity 的 name，因为依赖的是 property 所在的自身 entity
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataContext.id.name, dep.attributes, [], computation))
                }
            } else if (dep.type ==='global') {
                // TODO global 怎么监听啊
            }
        })

        return ERMutationEventsSource
    }
    convertAttrsToERMutationEventsSourceMap(baseRecordName: string, attributes: string[], context: string[], computation: Computation) {
        const dataContext = computation.dataContext as EntityDataContext

        const ERMutationEventsSource: ERMutationEventsSourceMap[] = []
        const primitiveAttr: string[] = []
        const relationAttr: [string, string|any[]][] = []
        

        attributes.forEach(attr => {
            if (typeof attr === 'string' && attr !== '*') {
                primitiveAttr.push(attr)
            } else if (attr ==='*') {
                // TODO 要读定义
            } else if (Array.isArray(attr)) {
                relationAttr.push(attr)
            } else {
                throw new Error(`unknown attribute type: ${attr}`)
            }
        })
        debugger

        if (primitiveAttr.length > 0) {
            const recordName = context.length > 0 ? this.controller.system.storage.getEntityName(baseRecordName, context.join('.')) : baseRecordName
            ERMutationEventsSource.push({
                type: 'update',
                recordName,
                attributes: primitiveAttr,
                computation
            })
        }

        relationAttr.forEach(([attrName, subAttrs]) => {
            ERMutationEventsSource.push(...this.convertRelationAttrToERMutationEventsSourceMap(baseRecordName, subAttrs as any[], context.concat(attrName), computation))
        })
        return ERMutationEventsSource
    }

    convertRelationAttrToERMutationEventsSourceMap(baseRecordName: string, subAttrs: any[], context: string[], computation: Computation) {
        const ERMutationEventsSource: ERMutationEventsSourceMap[] = []
        // TODO 转化成对关联实体的监听
        // 1. 先监听关联实体"关系"的增删
        const relatedRecordName = this.controller.system.storage.getRelationName(baseRecordName, context.join('.'))
        ERMutationEventsSource.push({
            type: 'create',
            recordName: relatedRecordName,
            targetPath: context,
            computation
        }, {
            type: 'delete',
            recordName: relatedRecordName,
            targetPath: context,
            computation
        })

        // 2. 监听关联实体的属性变化
        if (subAttrs.length > 0) {
            ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(baseRecordName, subAttrs, context, computation))
        }
        
        return ERMutationEventsSource
    }
    async setup() {
        await this.setupDefaultValues()
        await this.setupStateDefaultValues()
        await this.setupMutationListeners()
    }

}
