import { AttributeQueryData, RecordQueryData } from "../storage/index.js";
import { DataDep, Computation, DataBasedComputation } from "./computedDataHandles/Computation.js";
import { PropertyDataContext } from "./computedDataHandles/ComputedDataHandle.js";
import { Controller } from "./Controller.js";
import { InteractionEventEntity  } from "./ActivityManager.js";
import { RecordMutationEvent } from "./System.js";

// SourceMap 类型定义
export type EntityCreateEventsSourceMap = {
    dataDep: DataDep,
    type: 'create',
    recordName: string,
    sourceRecordName: string,
    targetPath?: string[],
    isRelation?: boolean,
    computation: Computation
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

export type EntityEventSourceMap = EntityCreateEventsSourceMap | EntityDeleteEventsSourceMap | EntityUpdateEventsSourceMap

export type EtityMutationEvent = RecordMutationEvent & {
    dataDep: DataDep,
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

// SourceMap 管理类 - 持有数据并提供查询接口
export class ComputationSourceMapManager {
    private sourceMaps: EntityEventSourceMap[] = []
    private sourceMapTree: DataSourceMapTree = {}

    constructor(public controller: Controller) {
        
    }

    /**
     * 初始化或重新初始化 SourceMap 数据
     * @param sourceMaps EntityEventSourceMap 数组
     */
    initialize(computations: Set<Computation>): void {
        const ERMutationEventSources: EntityEventSourceMap[]= []

        for(const computation of computations) {
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
                // - Interaction 的 create 事件
                // - TODO Action 的 create 事件
                // - TODO Activity 的 create 事件
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


        this.sourceMaps = [...ERMutationEventSources]
        this.sourceMapTree = this.buildDataSourceMapTree(this.sourceMaps)
    }
    isDataBasedComputation(computation: Computation) {
        return (computation as DataBasedComputation).compute !== undefined
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
     * 检查 update 类型的 SourceMap 是否需要触发计算
     * @param source EntityEventSourceMap
     * @param mutationEvent RecordMutationEvent
     * @returns 是否需要触发计算
     */
    shouldTriggerUpdateComputation(source: EntityEventSourceMap, mutationEvent: RecordMutationEvent): boolean {
        if (source.type !== 'update') {
            return true
        }
        
        const propAttrs = source.attributes!.filter(attr => attr !== 'id')
        return !propAttrs.every(attr => 
            !mutationEvent.record!.hasOwnProperty(attr) || 
            (mutationEvent.record![attr] === mutationEvent.oldRecord![attr])
        )
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

    /**
     * 获取所有 SourceMap
     * @returns 所有的 EntityEventSourceMap 数组
     */
    getAllSourceMaps(): EntityEventSourceMap[] {
        return [...this.sourceMaps]
    }

    /**
     * 根据 recordName 获取相关的 SourceMap
     * @param recordName 记录名称
     * @returns 相关的 EntityEventSourceMap 数组
     */
    getSourceMapsByRecordName(recordName: string): EntityEventSourceMap[] {
        return this.sourceMaps.filter(sourceMap => 
            sourceMap.recordName === recordName || sourceMap.sourceRecordName === recordName
        )
    }


    /**
     * 清空所有 SourceMap 数据
     */
    clear(): void {
        this.sourceMaps = []
        this.sourceMapTree = {}
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