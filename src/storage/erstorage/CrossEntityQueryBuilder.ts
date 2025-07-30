import { EntityToTableMap } from "./EntityToTableMap.js"
import { RecordQueryAgent } from "./RecordQueryAgent.js"
import { MatchExp, MatchExpressionData, MatchAtom } from "./MatchExp.js"
import { RecordQuery } from "./RecordQuery.js"
import { FilteredEntityDependency } from "./FilteredEntityDependencyManager.js"
import { RecordMutationEvent } from "@runtime"
import { BoolExp } from "@shared"

/**
 * 构建跨实体查询，用于查找受关联实体变更影响的记录
 */
export class CrossEntityQueryBuilder {
    constructor(
        private map: EntityToTableMap,
        private queryAgent: RecordQueryAgent
    ) {}
    
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
} 