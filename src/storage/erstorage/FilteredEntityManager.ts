import { MatchExpressionData, MatchAtom, MatchExp } from "./MatchExp.js"
import { BoolExp } from "@shared"
import { EntityToTableMap } from "./EntityToTableMap.js"
import { RecordQueryAgent } from "./RecordQueryAgent.js"
import { RecordQuery } from "./RecordQuery.js"
import { RecordMutationEvent } from "@runtime"

export interface FilteredEntityDependency {
    filteredEntityName: string
    sourceEntityName: string
    filterCondition: MatchExpressionData
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
    analyzeDependencies(filteredEntityName: string, sourceEntityName: string, filterCondition: MatchExpressionData): FilteredEntityDependency {
        const dependencies: FilteredEntityDependency['dependencies'] = []
        this.extractDependenciesFromExpression(sourceEntityName, filterCondition, dependencies)
        
        const dependency: FilteredEntityDependency = {
            filteredEntityName,
            sourceEntityName,
            filterCondition,
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
        const boolExp = expression instanceof BoolExp ? expression : BoolExp.fromValue(expression)
        
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
        if (!this.queryAgent) {
            throw new Error('QueryAgent not set in FilteredEntityManager')
        }
        
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
        // 例如：如果依赖路径是 ['teams']，那么需要查找所有 teams 包含这个记录的源实体
        return this.buildReverseQuery(
            dependency.sourceEntityName,
            changedEntityName,
            changedRecordId,
            depInfo.path
        )
    }
    
    /**
     * 构建反向查询，从目标实体找回源实体
     */
    private async buildReverseQuery(
        sourceEntityName: string,
        targetEntityName: string,
        targetRecordId: string,
        path: string[]
    ): Promise<{ id: string }[]> {
        if (!this.queryAgent) {
            throw new Error('QueryAgent not set in FilteredEntityManager')
        }
        
        // 如果路径为空，说明是直接匹配
        if (path.length === 0) {
            const query = RecordQuery.create(sourceEntityName, this.map, {
                matchExpression: MatchExp.atom({
                    key: 'id',
                    value: ['=', targetRecordId]
                }),
                attributeQuery: ['id']
            })
            return this.queryAgent.findRecords(query, `find affected source records for ${sourceEntityName}`)
        }
        
        // path 已经是从源实体到目标实体的关系路径
        // 例如：对于 User 依赖 Team.type，path = ['team']
        // 我们需要查找所有 team.id = targetRecordId 的 User
        
        // 构建查询条件：path.id = targetRecordId
        const matchKey = path.concat('id').join('.')
        const matchCondition = MatchExp.atom({
            key: matchKey,
            value: ['=', targetRecordId]
        })
        
        // 执行查询
        const query = RecordQuery.create(sourceEntityName, this.map, {
            matchExpression: matchCondition,
            attributeQuery: ['id']
        })
        
        return this.queryAgent.findRecords(query, `find affected source records for ${sourceEntityName}`)
    }
    
    /**
     * 检查记录是否满足 filtered entity 的条件
     */
    async checkRecordMatchesFilter(
        recordId: string,
        entityName: string,
        filterCondition: MatchExpressionData
    ): Promise<boolean> {
        if (!this.queryAgent) {
            throw new Error('QueryAgent not set in FilteredEntityManager')
        }
        
        const query = RecordQuery.create(entityName, this.map, {
            matchExpression: filterCondition.and({
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
    getFilteredEntitiesForSource(sourceEntityName: string): Array<{ name: string, filterCondition: any }> {
        return this.map.getRecordInfo(sourceEntityName).filteredBy?.map(recordInfo => ({
            name: recordInfo.name,
            filterCondition: recordInfo.filterCondition
        })) || []
    }
    
    /**
     * 更新记录的 filtered entity 标记（主入口方法）
     */
    async updateFilteredEntityFlags(
        entityName: string, 
        recordId: string, 
        events?: RecordMutationEvent[], 
        originalRecord?: any, 
        isCreation?: boolean, 
        changedFields?: string[]
    ): Promise<void> {
        // 处理直接的 filtered entity（基于源实体自身的过滤条件）
        const filteredEntities = this.getFilteredEntitiesForSource(entityName);
        
        if (filteredEntities.length === 0) {
            // 即使没有直接的 filtered entity，也需要处理级联事件
            const changedAttributes = changedFields || (isCreation && originalRecord ? Object.keys(originalRecord) : []);
            await this.processCascadeEvents(
                entityName,
                recordId,
                changedAttributes,
                originalRecord,
                events || []
            );
            return;
        }

        // 获取原始记录的 __filtered_entities 状态
        // Parse JSON string to object if needed
        let originalFlags: { [key: string]: boolean } = {};
        if (originalRecord?.__filtered_entities) {
            originalFlags = typeof originalRecord.__filtered_entities === 'string'
                ? JSON.parse(originalRecord.__filtered_entities)
                : originalRecord.__filtered_entities;
        }

        // 获取更新后的记录以检查当前过滤条件
        const idMatch = MatchExp.atom({ key: 'id', value: ['=', recordId] });
        const updatedRecords = await this.queryAgent.findRecords(
            RecordQuery.create(entityName, this.map, { matchExpression: idMatch, attributeQuery: ['*'] }),
            `find updated record for filtered entity check ${entityName}:${recordId}`
        );
        
        if (updatedRecords.length === 0) return;
        const updatedRecord = updatedRecords[0];

        // 检查每个 filtered entity 条件
        const isNewRecord = !originalRecord || Object.keys(originalFlags).length === 0;
        const newFlags = { ...originalFlags };
        
        for (const filteredEntity of filteredEntities) {
            // 检查记录是否满足过滤条件 - 直接使用过滤条件查询
            const matchingRecords = await this.queryAgent.findRecords(
                RecordQuery.create(entityName, this.map, { 
                    matchExpression: filteredEntity.filterCondition.and({
                        key: 'id',
                        value: ['=', recordId]
                    }),
                    modifier: {
                        limit: 1
                    }
                }),
                `check filtered entity condition ${filteredEntity.name} for ${entityName}`
            );
            
            // 检查当前记录是否在匹配的记录中
            const belongsToFilteredEntity = matchingRecords.length > 0;
            const previouslyBelonged = originalFlags[filteredEntity.name] === true;
            
            newFlags[filteredEntity.name] = belongsToFilteredEntity;
            
            // 生成相应的事件
            // 对于新创建的记录，如果满足条件就生成 create 事件
            // 对于已存在的记录，只在状态变化时生成事件
            if (belongsToFilteredEntity && (isNewRecord || !previouslyBelonged)) {
                // 记录现在属于这个 filtered entity
                events?.push({
                    type: 'create',
                    recordName: filteredEntity.name,
                    record: { ...updatedRecord }
                });
            } else if (!belongsToFilteredEntity && previouslyBelonged && !isNewRecord) {
                // 记录不再属于这个 filtered entity
                events?.push({
                    type: 'delete',
                    recordName: filteredEntity.name,
                    record: { ...updatedRecord }
                });
            }
        }

        // 更新 __filtered_entities 字段（这是内部操作，不生成事件）
        if (JSON.stringify(originalFlags) !== JSON.stringify(newFlags)) {
            // 获取 __filtered_entities 字段的实际数据库字段名
            const recordInfo = this.map.getRecordInfo(entityName);
            const filteredEntitiesAttribute = recordInfo.data.attributes['__filtered_entities'];
            
            if (filteredEntitiesAttribute && (filteredEntitiesAttribute as any).field) {
                const fieldName = (filteredEntitiesAttribute as any).field;
                const fieldType = (filteredEntitiesAttribute as any).fieldType;
                
                await this.queryAgent.updateRecordDataById(entityName, { id: recordId }, [
                    { 
                        field: fieldName, 
                        value: this.queryAgent.prepareFieldValue(newFlags, fieldType) 
                    }
                ]);
            }
        }
        
        // 处理跨实体的级联事件
        // 如果有传入 changedFields，使用它；否则在创建时使用所有字段
        const changedAttributes = changedFields || (isCreation && originalRecord ? Object.keys(originalRecord) : []);
        await this.processCascadeEvents(
            entityName,
            recordId,
            changedAttributes,
            originalRecord,
            events || []
        );
    }
    
    /**
     * 处理实体变更时的级联事件
     */
    async processCascadeEvents(
        entityName: string,
        recordId: string,
        changedAttributes: string[],
        originalRecord: any,
        events: RecordMutationEvent[]
    ): Promise<void> {
        // 获取所有依赖于这个实体的 filtered entity
        const dependencies = this.getAffectedFilteredEntities(entityName)
        
        if (dependencies.length === 0) {
            return
        }
        
        // 处理每个受影响的 filtered entity
        for (const dependency of dependencies) {
            await this.processDependency(
                dependency,
                entityName,
                recordId,
                changedAttributes,
                originalRecord,
                events
            )
        }
    }
    
    /**
     * 处理单个依赖关系
     */
    private async processDependency(
        dependency: FilteredEntityDependency,
        changedEntityName: string,
        changedRecordId: string,
        changedAttributes: string[],
        originalRecord: any,
        events: RecordMutationEvent[]
    ): Promise<void> {
        // 找到所有受影响的源记录
        const affectedSourceRecords = await this.findAffectedSourceRecords(
            dependency,
            changedEntityName,
            changedRecordId,
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
    
    /**
     * 更新单个依赖关系的 filtered entity 标记
     */
    private async updateSingleFilteredEntityFlag(
        dependency: FilteredEntityDependency,
        recordId: string,
        events: RecordMutationEvent[]
    ): Promise<void> {
        if (!this.queryAgent) {
            throw new Error('QueryAgent not set in FilteredEntityManager')
        }
        
        // 获取记录当前的 __filtered_entities 状态
        const currentRecord = await this.queryAgent.findRecords(
            RecordQuery.create(dependency.sourceEntityName, this.map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['=', recordId] }),
                attributeQuery: ['id', '__filtered_entities']
            }),
            `get current filtered entity flags for ${dependency.sourceEntityName}:${recordId}`
        )
        
        if (currentRecord.length === 0) {
            return
        }
        
        const record = currentRecord[0]
        // Parse JSON string to object, or use empty object if not present
        let currentFlags: { [key: string]: boolean } = {};
        if (record.__filtered_entities) {
            currentFlags = typeof record.__filtered_entities === 'string'
                ? JSON.parse(record.__filtered_entities)
                : record.__filtered_entities;
        }
        
        // 检查记录是否满足 filtered entity 的条件
        const matchesFilter = await this.checkRecordMatchesFilter(
            recordId,
            dependency.sourceEntityName,
            dependency.filterCondition
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