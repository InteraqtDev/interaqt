import { AttributeQueryData, RecordQueryData } from "../storage/index.js";
import { DataDep, Computation, DataBasedComputation, RecordsDataDep, EventBasedComputation, EventDep } from "./computations/Computation.js";
import { PropertyDataContext } from "./computations/Computation.js";
import { Controller } from "./Controller.js";
import { InteractionEventEntity  } from "./activity/ActivityManager.js";
import { DICTIONARY_RECORD, RecordMutationEvent } from "./System.js";
import { Scheduler } from "./Scheduler.js";

// SourceMap 类型定义
export type EntityCreateEventsSourceMap = {
    dataDep: DataDep,
    type: 'create',
    // 当前事件所属的 entity 的 name，当前的 entity 不一定就是 dataDep 的 source 实体。可能是 dataDep source 的关联实体。
    recordName: string,
    // 当前实体是否是 relation 类型
    isRelation?: boolean,
    // dataDep 的 source 实体
    sourceRecordName: string,
    // 监听变化的属性相对于 dataDep 实体对象的路径。路径是从当前实体出发的。
    targetPath?: string[],
    // 当前要记录的事件是不是为了 record 初始化时就进行计算而用的。
    isInitial?: boolean
    computation: Computation,
}

export type EntityDeleteEventsSourceMap = {
    dataDep: DataDep,
    type: 'delete',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
}

export type EntityUpdateEventsSourceMap = {
    dataDep: DataDep,
    type: 'update',
    recordName: string,
    attributes: string[],
    sourceRecordName: string,
    targetPath?: string[],
    computation: Computation,
    isRelation?: boolean
}

export type DataBasedEntityEventsSourceMap = EntityCreateEventsSourceMap 
    | EntityDeleteEventsSourceMap 
    | EntityUpdateEventsSourceMap

export type EventBasedEntityEventsSourceMap = EventDep & {
    computation: Computation,
}

export type EntityEventSourceMap = DataBasedEntityEventsSourceMap | EventBasedEntityEventsSourceMap

export type EtityMutationEvent = RecordMutationEvent & {
    dataDep?: DataDep,
    attributes?: string[],
    relatedAttribute?: string[],
    relatedMutationEvent?: RecordMutationEvent,
    isRelation?: boolean
}

// SourceMapTree 类型
export type DataSourceMapTree = {
    [key: string]: {
        [key: string]: EntityEventSourceMap[]
    }
}

export const PHASE_BEFORE_ALL = 0
export const PHASE_NORMAL = 1
export const PHASE_AFTER_ALL = 2
export type ComputationPhase = typeof PHASE_BEFORE_ALL|typeof PHASE_NORMAL|typeof PHASE_AFTER_ALL

// SourceMap 管理类 - 持有数据并提供查询接口
export class ComputationSourceMapManager {
    private sourceMaps: EntityEventSourceMap[] = []
    private sourceMapTree: DataSourceMapTree = {}

    constructor(public controller: Controller, public scheduler: Scheduler) {
        
    }

    /**
     * 初始化或重新初始化 SourceMap 数据
     * @param sourceMaps EntityEventSourceMap 数组
     */
    initialize(computations: Set<Computation>): void {
        const sortedERMutationEventSources: EntityEventSourceMap[][] = [[], [], []]

        

        for(const computation of computations) {
            // 1. 根据 data deps 计算出 mutation events
            if( this.scheduler.isDataBasedComputation(computation)) {

                Object.entries(computation.dataDeps).forEach(([dataDepName, dataDep]) => {
                    const sources = this.convertDataDepToERMutationEventsSourceMap(dataDepName, dataDep, computation)
                    sortedERMutationEventSources[dataDep.phase || PHASE_NORMAL].push(...sources)
                })

                // ERMutationEventSources.push(
                //     ...Object.entries(computation.dataDeps).map(([dataDepName, dataDep]) => this.convertDataDepToERMutationEventsSourceMap(dataDepName, dataDep, computation)).flat()
                // )

                // 2. 监听自身 record 的 create 事件，可能一开始创建就要执行一遍 computation. 如果依赖了已有的 global dict。
                if (computation.dataContext.type === 'property' && Object.values(computation.dataDeps).some(dataDep => dataDep.type === 'global')) {
                    const selfDataDep: RecordsDataDep = {
                        type: 'records',
                        source: computation.dataContext.host,
                    }
                    sortedERMutationEventSources[PHASE_NORMAL].push(...this.convertDataDepToERMutationEventsSourceMap('_self', selfDataDep, computation, 'create'))
                    // ERMutationEventSources.push(...this.convertDataDepToERMutationEventsSourceMap('_self', selfDataDep, computation, 'create'))
                }
            } else {
                // const recordDataDep: RecordsDataDep = {
                //     type: 'records',
                //     source: InteractionEventEntity,
                //     attributeQuery: ['*']
                // }
                // ERMutationEventSources.push(...this.convertDataDepToERMutationEventsSourceMap('record', recordDataDep, computation, 'create'))
                const {eventDeps} = computation as EventBasedComputation
                for(const eventDep of Object.values(eventDeps!)) {

                    sortedERMutationEventSources[eventDep.phase||PHASE_NORMAL].push({
                        type: eventDep.type,
                        recordName: eventDep.recordName,
                        computation
                    } as EventBasedEntityEventsSourceMap)

                    // ERMutationEventSources.push({
                    //     type: eventDep.type,
                    //     recordName: eventDep.recordName,
                    //     computation
                    // } as EventBasedEntityEventsSourceMap)
                }
            }
        }

        // const ERMutationEventSources: EntityEventSourceMap[]= sortedERMutationEventSources.flat()

        this.sourceMaps =  sortedERMutationEventSources.flat()
        this.sourceMapTree = this.buildDataSourceMapTree(this.sourceMaps)
    }
    /**
     * 添加新的 SourceMap
     * @param sourceMap 要添加的 EntityEventSourceMap
     */
    addSourceMap(sourceMap: EntityEventSourceMap): void {
        this.sourceMaps.push(sourceMap)
        this.addToTree(sourceMap)
    }

    /**
     * 批量添加 SourceMap
     * @param sourceMaps 要添加的 EntityEventSourceMap 数组
     */
    addSourceMaps(sourceMaps: EntityEventSourceMap[]): void {
        this.sourceMaps.push(...sourceMaps)
        sourceMaps.forEach(sourceMap => this.addToTree(sourceMap))
    }

    /**
     * 根据 mutation event 查找对应的 SourceMap
     * @param mutationEvent RecordMutationEvent
     * @returns 匹配的 EntityEventSourceMap 数组
     */
    findSourceMapsForMutation(mutationEvent: RecordMutationEvent): EntityEventSourceMap[] {
        return this.sourceMapTree[mutationEvent.recordName]?.[mutationEvent.type] || []
    }

    /**
     * 检查 update 类型的更新对 DataBasedComputation 是否需要触发计算
     * @param source EntityEventSourceMap
     * @param mutationEvent RecordMutationEvent
     * @returns 是否需要触发计算
     */
    shouldTriggerUpdateComputation(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent): boolean {
        if (source.type !== 'update' || !('dataDep' in source)) {
            return true
        }
        // 特殊处理 Global 类型的数据依赖
        if (source.dataDep.type === 'global' && mutationEvent.recordName === DICTIONARY_RECORD) {
            // 检查是否是 state 类型的记录，并且 key 匹配
            return mutationEvent.record?.key === source.dataDep.source.name
        } else {
            // 如果是更新，检查是否是依赖的属性有变化。
            const propAttrs = source.attributes!.filter(attr => attr !== 'id')
            return !propAttrs.every(attr => 
                !mutationEvent.record!.hasOwnProperty(attr) || 
                (mutationEvent.record![attr] === mutationEvent.oldRecord![attr])
            )
        }
        
    }

    convertDataDepToERMutationEventsSourceMap(dataDepName:string, dataDep: DataDep, computation: Computation, eventType?: 'create'|'delete'|'update', isInitial: boolean = false): EntityEventSourceMap[] {
        const ERMutationEventsSource: EntityEventSourceMap[]= []
        if (dataDep.type === 'records') {
            // 监听的是某个 records 集合。例如全局的 Count 就需要。
            // 没有指定 eventType 就说明全都要监听
            if (!eventType || eventType === 'create') {
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'create',
                    recordName: dataDep.source.name!,
                    sourceRecordName: dataDep.source.name!,
                    computation,
                    isInitial,
                })
            }
            if (!eventType || eventType === 'delete') {
                ERMutationEventsSource.push({    
                    dataDep: dataDep,
                    type: 'delete',
                    recordName: dataDep.source.name!,
                    sourceRecordName: dataDep.source.name!,
                    computation
                })
            }
            
            if (!eventType || eventType === 'update') {
                // 监听 update
                if (dataDep.attributeQuery) {
                    ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataDep.source.name!, dataDep.attributeQuery, [], computation, false))
                }
            }
            
        } else if (dataDep.type==='property') {
            // 依赖的是单个记录的某个 property 属性，或者关联实体、关联关系。例如自定义的计算中就常见。
            // 只能监听 update eventType。
            const dataContext = computation.dataContext as PropertyDataContext

            if (dataDep.attributeQuery) {
                // 注意这里的 recordName 应该是当前数据 entity 的 name，因为依赖的是 property 所在的自身 entity
                ERMutationEventsSource.push(...this.convertAttrsToERMutationEventsSourceMap(dataDep, dataContext.host.name!, dataDep.attributeQuery, [], computation, true))
            }
        } else if (dataDep.type ==='global') {
            // 依赖的是全局的一个 Dict 值。注意这里理论上只有 create 和 update，初始化的时候会得到创建的事件。全局的值是不会删除的。
            // Global 数据存储在 _System_ 表中，监听 state 类型的记录更新
            if (!eventType || eventType === 'update') {
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'update',
                    recordName: DICTIONARY_RECORD,
                    sourceRecordName: DICTIONARY_RECORD,
                    attributes: ['value'],
                    computation
                })
            }

            // create 也需要监听，因为可能依赖了已有的 global dict。
            if (!eventType || eventType === 'create'){
                ERMutationEventsSource.push({
                    dataDep: dataDep,
                    type: 'create',
                    recordName: DICTIONARY_RECORD,
                    sourceRecordName: DICTIONARY_RECORD,
                    computation
                })
            }
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

    /**
     * 获取 SourceMapTree 的只读副本
     * @returns DataSourceMapTree 的副本
     */
    getSourceMapTree(): DataSourceMapTree {
        // 使用浅拷贝避免循环引用问题
        const result: DataSourceMapTree = {}
        for (const [recordName, typeMap] of Object.entries(this.sourceMapTree)) {
            result[recordName] = {}
            for (const [type, sourceMaps] of Object.entries(typeMap)) {
                result[recordName][type] = [...sourceMaps]
            }
        }
        return result
    }

    /**
     * 私有方法：构建 SourceMap 树结构
     * @param sourceMaps EntityEventSourceMap 数组
     * @returns 两层结构的树，第一层是 recordName，第二层是 type
     */
    private buildDataSourceMapTree(sourceMaps: EntityEventSourceMap[]): DataSourceMapTree {
        const sourceMapTree: DataSourceMapTree = {}
        sourceMaps.forEach(source => {
            this.addToTree(source, sourceMapTree)
        })
        return sourceMapTree
    }

    /**
     * 私有方法：将单个 SourceMap 添加到树结构中
     * @param source EntityEventSourceMap
     * @param tree 可选的目标树，默认使用实例的 sourceMapTree
     */
    private addToTree(source: EntityEventSourceMap, tree?: DataSourceMapTree): void {
        const targetTree = tree || this.sourceMapTree
        if (!targetTree[source.recordName]) {
            targetTree[source.recordName] = {}
        }
        if (!targetTree[source.recordName][source.type]) {
            targetTree[source.recordName][source.type] = []
        }
        targetTree[source.recordName][source.type].push(source)
    }
} 