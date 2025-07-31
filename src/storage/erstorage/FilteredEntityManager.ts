import { MatchExpressionData, MatchAtom, MatchExp } from "./MatchExp.js"
import { BoolExp } from "@shared"
import { EntityToTableMap } from "./EntityToTableMap.js"
import { RecordQueryAgent } from "./RecordQueryAgent.js"
import { RecordQuery } from "./RecordQuery.js"
import { RecordMutationEvent } from "@runtime"

export interface FilteredEntityDependency {
    filteredEntityName: string
    sourceEntityName: string
    matchExpression: MatchExpressionData
    dependencies: {
        entityName: string
        path: string[]  // 从 source entity 到依赖 entity 的路径
        attributes: string[]  // 依赖的属性列表
    }[]
}

/**
 * 管理 filtered entity 的所有功能，包括依赖分析、跨实体查询和级联事件处理
 */
export class FilteredEntityManager {
    private dependencies: Map<string, FilteredEntityDependency[]> = new Map()
    
    constructor(private map: EntityToTableMap, private queryAgent: RecordQueryAgent) {}
    
    // ============ 依赖管理功能 ============
    
    /**
     * 分析 filtered entity 的过滤条件，提取所有依赖的实体和路径
     */
    analyzeDependencies(filteredEntityName: string, sourceEntityName: string, matchExpression: MatchExpressionData): FilteredEntityDependency {
        const dependencies: FilteredEntityDependency['dependencies'] = []
        this.extractDependenciesFromExpression(sourceEntityName, matchExpression, dependencies)
        
        const dependency: FilteredEntityDependency = {
            filteredEntityName,
            sourceEntityName,
            matchExpression,
            dependencies
        }
        
        // 注册依赖关系
        for (const dep of dependencies) {
            if (!this.dependencies.has(dep.entityName)) {
                this.dependencies.set(dep.entityName, [])
            }
            this.dependencies.get(dep.entityName)!.push(dependency)
        }
        
        // 也注册源实体自身
        if (!this.dependencies.has(sourceEntityName)) {
            this.dependencies.set(sourceEntityName, [])
        }
        this.dependencies.get(sourceEntityName)!.push(dependency)
        
        return dependency
    }
    
    /**
     * 从匹配表达式中提取依赖关系
     */
    private extractDependenciesFromExpression(
        entityName: string, 
        expression: MatchExpressionData,
        dependencies: FilteredEntityDependency['dependencies']
    ) {
        // MatchExpressionData 是 BoolExp<MatchAtom> 的别名
        // 使用 BoolExp.fromValue 来获取正确的实例
        const boolExp = BoolExp.fromValue(expression as any)
        
        if (boolExp.isExpression()) {
            if (boolExp.left) {
                this.extractDependenciesFromExpression(entityName, boolExp.left.raw as MatchExpressionData, dependencies)
            }
            if (boolExp.right) {
                this.extractDependenciesFromExpression(entityName, boolExp.right.raw as MatchExpressionData, dependencies)
            }
        } else if (boolExp.isAtom()) {
            const matchAtom = boolExp.data as MatchAtom
            const key = matchAtom.key
            const pathParts = key.split('.')
            
            // 如果路径只有一个部分，说明是源实体自身的属性
            if (pathParts.length === 1) {
                const existing = dependencies.find(d => d.entityName === entityName && d.path.length === 0)
                if (existing) {
                    if (!existing.attributes.includes(pathParts[0])) {
                        existing.attributes.push(pathParts[0])
                    }
                } else {
                    dependencies.push({
                        entityName,
                        path: [],
                        attributes: [pathParts[0]]
                    })
                }
            } else {
                // 路径包含多个部分，需要解析关联实体
                const fullPath = [entityName].concat(pathParts)
                
                // 获取路径中每个节点的信息
                for (let i = 1; i < fullPath.length - 1; i++) {
                    const currentPath = fullPath.slice(0, i + 1)
                    const info = this.map.getInfoByPath(currentPath)
                    
                    if (info && info.isRecord) {
                        const depEntityName = info.recordName
                        const depPath = pathParts.slice(0, i)
                        const attribute = pathParts[pathParts.length - 1]
                        
                        const existing = dependencies.find(d => 
                            d.entityName === depEntityName && 
                            JSON.stringify(d.path) === JSON.stringify(depPath)
                        )
                        
                        if (existing) {
                            if (!existing.attributes.includes(attribute)) {
                                existing.attributes.push(attribute)
                            }
                        } else {
                            dependencies.push({
                                entityName: depEntityName,
                                path: depPath,
                                attributes: [attribute]
                            })
                        }
                    }
                }
            }
        }
    }
    
    /**
     * 获取某个实体变更时影响的所有 filtered entity
     */
    getAffectedFilteredEntities(entityName: string): FilteredEntityDependency[] {
        return this.dependencies.get(entityName) || []
    }
    
    /**
     * 清除所有依赖关系
     */
    clear() {
        this.dependencies.clear()
    }
    
    // ============ 跨实体查询功能 ============
    
    /**
     * 根据依赖关系和变更的记录，查找所有受影响的源记录
     */
    async findAffectedSourceRecords(
        dependency: FilteredEntityDependency,
        changedEntityName: string,
        changedRecordId: string,
        changedAttributes: string[]
    ): Promise<{ id: string }[]> {
        // 找到这个实体在依赖中的定义
        const depInfo = dependency.dependencies.find(d => d.entityName === changedEntityName)
        if (!depInfo) {
            return []
        }
        
        // 检查变更的属性是否在依赖的属性列表中
        const relevantAttributes = changedAttributes.filter(attr => depInfo.attributes.includes(attr))
        if (relevantAttributes.length === 0) {
            return []
        }
        
        if (depInfo.path.length === 0) {
            // 如果路径为空，说明变更的就是源实体本身
            return [{ id: changedRecordId }]
        }
        
        // 构建反向查询，从变更的实体查找到源实体
        // path 已经是从源实体到目标实体的关系路径
        // 例如：对于 User 依赖 Team.type，path = ['team']
        // 我们需要查找所有 team.id = targetRecordId 的 User
        
        // 构建查询条件：path.id = targetRecordId
        const matchKey = depInfo.path.concat('id').join('.')
        const matchCondition = MatchExp.atom({
            key: matchKey,
            value: ['=', changedRecordId]
        })
        
        // 执行查询
        const query = RecordQuery.create(dependency.sourceEntityName, this.map, {
            matchExpression: matchCondition,
            attributeQuery: ['id']
        })
        
        return this.queryAgent.findRecords(query, `find affected source records for ${dependency.sourceEntityName}`)
    }
    
    /**
     * 检查记录是否满足 filtered entity 的条件
     */
    async checkRecordMatchesFilter(
        recordId: string,
        entityName: string,
        matchExpression: MatchExpressionData
    ): Promise<boolean> {
        if (!this.queryAgent) {
            throw new Error('QueryAgent not set in FilteredEntityManager')
        }
        
        
        const query = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpression.and({
                key: 'id',
                value: ['=', recordId]
            }),
            modifier: { limit: 1 }
        })
        
        const results = await this.queryAgent.findRecords(
            query,
            `check if record ${recordId} matches filter condition`
        )
        
        return results.length > 0
    }
    
    // ============ 级联事件处理功能 ============
    
    /**
     * 获取基于指定源实体的所有 filtered entities
     */
    getFilteredEntitiesForSource(sourceEntityName: string): Array<{ name: string, matchExpression: any }> {
        return this.map.getRecordInfo(sourceEntityName).filteredBy?.map(recordInfo => ({
            name: recordInfo.name,
            matchExpression: recordInfo.matchExpression
        })) || []
    }
    
    /**
     * 更新记录的 filtered entity 标记（主入口方法）
     */
    async updateFilteredEntityFlags(
        entityName: string, 
        recordId: string, 
        events: RecordMutationEvent[] = [], 
        originalRecord?: any, 
        isCreation?: boolean, 
        changedFields?: string[]
    ): Promise<void> {
        // 获取所有依赖于这个实体的 filtered entity
        const dependencies = this.getAffectedFilteredEntities(entityName)
        
        if (dependencies.length === 0) {
            return
        }
        const changedAttributes = changedFields || (isCreation && originalRecord ? Object.keys(originalRecord) : []);
        
        // 处理每个受影响的 filtered entity
        for (const dependency of dependencies) {
            // 找到所有受影响的源记录
            const affectedSourceRecords = await this.findAffectedSourceRecords(
                dependency,
                entityName,
                recordId,
                changedAttributes
            )
            
            // 更新每个受影响的源记录的 filtered entity 标记
            for (const sourceRecord of affectedSourceRecords) {
                await this.updateSingleFilteredEntityFlag(
                    dependency,
                    sourceRecord.id,
                    events
                )
            }
        }
    }
    isFlagEqual(flag1: { [key: string]: boolean }, flag2: { [key: string]: boolean }): boolean {
        // 只检验 key 为 true 的是否完全相同。为 false 或者 undefined 的 key 不参与比较
        const keys1 = Object.keys(flag1).filter(key => flag1[key] === true);
        const keys2 = Object.keys(flag2).filter(key => flag2[key] === true);
        return keys1.length === keys2.length && keys1.every(key => flag2[key] === true);
    }
    
    /**
     * 更新单个依赖关系的 filtered entity 标记
     */
    private async updateSingleFilteredEntityFlag(
        dependency: FilteredEntityDependency,
        recordId: string,
        events: RecordMutationEvent[]
    ): Promise<void> {
        // 获取记录当前的 __filtered_entities 状态
        const currentRecord = await this.queryAgent.findRecords(
            RecordQuery.create(dependency.sourceEntityName, this.map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['=', recordId] }),
                attributeQuery: ['*']
            }),
            `get current filtered entity flags for ${dependency.sourceEntityName}:${recordId}`
        )
        
        if (currentRecord.length === 0) {
            return
        }
        
        const record = currentRecord[0]
        const currentFlags: { [key: string]: boolean } = record.__filtered_entities;
        
        // 检查记录是否满足 filtered entity 的条件
        const matchesFilter = await this.checkRecordMatchesFilter(
            recordId,
            dependency.sourceEntityName,
            dependency.matchExpression
        )
        
        const previouslyBelonged = currentFlags[dependency.filteredEntityName] === true
        
        // 如果状态发生变化，生成相应的事件
        if (matchesFilter && !previouslyBelonged) {
            // 记录现在属于这个 filtered entity
            events.push({
                type: 'create',
                recordName: dependency.filteredEntityName,
                record: { ...record }
            })
            
            // 更新标记
            currentFlags[dependency.filteredEntityName] = true
        } else if (!matchesFilter && previouslyBelonged) {
            // 记录不再属于这个 filtered entity
            events.push({
                type: 'delete',
                recordName: dependency.filteredEntityName,
                record: { ...record }
            })
            
            // 更新标记
            currentFlags[dependency.filteredEntityName] = false
        }
        
        // 更新 __filtered_entities 字段
        if (previouslyBelonged !== matchesFilter) {
            // 获取 __filtered_entities 字段的实际数据库字段名
            const recordInfo = this.map.getRecordInfo(dependency.sourceEntityName);
            const filteredEntitiesAttribute = recordInfo.data.attributes['__filtered_entities'];
            
            if (filteredEntitiesAttribute && (filteredEntitiesAttribute as any).field) {
                const fieldName = (filteredEntitiesAttribute as any).field;
                
                await this.queryAgent.updateRecordDataById(
                    dependency.sourceEntityName,
                    { id: recordId },
                    [{
                        field: fieldName,
                        value: JSON.stringify(currentFlags)
                    }]
                )
            }
        }
    }
} 