import { RecordMutationEvent } from "@runtime"
import { EntityToTableMap } from "./EntityToTableMap.js"
import { RecordQueryAgent } from "./RecordQueryAgent.js"
import { CrossEntityQueryBuilder } from "./CrossEntityQueryBuilder.js"
import { FilteredEntityDependency, FilteredEntityDependencyManager } from "./FilteredEntityDependencyManager.js"
import { MatchExp } from "./MatchExp.js"
import { RecordQuery } from "./RecordQuery.js"

/**
 * 管理跨实体的级联事件，处理 filtered entity 在关联实体变更时的更新
 */
export class CascadeEventManager {
    private crossEntityQueryBuilder: CrossEntityQueryBuilder
    
    constructor(
        private map: EntityToTableMap,
        private queryAgent: RecordQueryAgent,
        private dependencyManager: FilteredEntityDependencyManager
    ) {
        this.crossEntityQueryBuilder = new CrossEntityQueryBuilder(map, queryAgent)
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
        const dependencies = this.dependencyManager.getAffectedFilteredEntities(entityName)
        
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
        const affectedSourceRecords = await this.crossEntityQueryBuilder.findAffectedSourceRecords(
            dependency,
            changedEntityName,
            changedRecordId,
            changedAttributes
        )
        
        // 更新每个受影响的源记录的 filtered entity 标记
        for (const sourceRecord of affectedSourceRecords) {
            await this.updateFilteredEntityFlags(
                dependency,
                sourceRecord.id,
                events
            )
        }
    }
    
    /**
     * 更新单个记录的 filtered entity 标记
     */
    private async updateFilteredEntityFlags(
        dependency: FilteredEntityDependency,
        recordId: string,
        events: RecordMutationEvent[]
    ): Promise<void> {
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
        const matchesFilter = await this.crossEntityQueryBuilder.checkRecordMatchesFilter(
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