import {EntityToTableMap} from "./EntityToTableMap.js";
import {MatchExp, MatchExpressionData} from "./MatchExp.js";
import {ModifierData} from "./Modifier.js";
import {AttributeQueryData} from "./AttributeQuery.js";
import {assert} from "../utils.js";
import {RecordQuery} from "./RecordQuery.js";
import {NewRecordData, RawEntityData} from "./NewRecordData.js";
import {RecordQueryAgent} from "./RecordQueryAgent.js";
import {EntityIdRef, Database, RecordMutationEvent} from "@runtime";
import {Entity} from "@shared";
import {Record} from "./RecordQueryAgent.js";

export class EntityQueryHandle {
    agent: RecordQueryAgent

    constructor(public map: EntityToTableMap, public database: Database) {
        this.agent = new RecordQueryAgent(map, database)
    }

    async findOne(entityName: string, matchExpression?: MatchExpressionData, modifier: ModifierData = {}, attributeQuery?: AttributeQueryData) {
        const limitedModifier = {
            ...modifier,
            limit: 1
        }

        return (await this.find(entityName, matchExpression, limitedModifier, attributeQuery))[0]
    }

    async find(entityName: string, matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []): Promise<Record[]> {
        // 检查是否是 filtered entity
        if (this.isFilteredEntity(entityName)) {
            const config = this.getFilteredEntityConfig(entityName);
            if (!config) {
                throw new Error(`${entityName} is not a filtered entity`);
            }

            // 构造查询条件：过滤条件 + 额外的匹配条件（如果有）
            let combinedMatch = config.filterCondition;
            
            if (matchExpressionData) {
                combinedMatch = new MatchExp(config.sourceRecordName, this.map, combinedMatch)
                    .and(new MatchExp(config.sourceRecordName, this.map, matchExpressionData))
                    .data;
            }

            // 直接在源实体上查询，使用过滤条件
            return this.find(config.sourceRecordName, combinedMatch, modifierData, attributeQueryData);
        }

        assert(this.map.getRecord(entityName), `cannot find entity ${entityName}`)
        const entityQuery = RecordQuery.create(
            entityName,
            this.map,
            {
                matchExpression: matchExpressionData,
                attributeQuery: attributeQueryData,
                modifier: modifierData
            },
        )

        return this.agent.findRecords(entityQuery, `finding ${entityName} from handle`)
    }

    async create(entityName: string, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        const newEntityData = new NewRecordData(this.map, entityName, rawData)
        return this.agent.createRecord(newEntityData, `create record ${entityName} from handle`, events)
    }

    // CAUTION 不能递归更新 relate entity 的 value，如果传入了 related entity 的值，说明是建立新的联系。
    async update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]) {
        // 检查是否是 filtered entity
        if (this.isFilteredEntity(entity)) {
            const config = this.getFilteredEntityConfig(entity);
            if (!config) {
                throw new Error(`${entity} is not a filtered entity`);
            }

            // 构造查询条件：过滤条件 + 原有的匹配条件
            let combinedMatch = config.filterCondition;
            if (matchExpressionData) {
                combinedMatch = new MatchExp(config.sourceRecordName, this.map, config.filterCondition)
                    .and(new MatchExp(config.sourceRecordName, this.map, matchExpressionData))
                    .data;
            }

            // 在源实体上执行更新操作
            const newEntityData = new NewRecordData(this.map, config.sourceRecordName, rawData)
            return this.agent.updateRecord(config.sourceRecordName, combinedMatch, newEntityData, events)
        }

        const newEntityData = new NewRecordData(this.map, entity, rawData)
        return this.agent.updateRecord(entity, matchExpressionData, newEntityData, events)
    }

    async delete(entityName: string, matchExpressionData: MatchExpressionData,events?: RecordMutationEvent[]) {
        // 检查是否是 filtered entity
        if (this.isFilteredEntity(entityName)) {
            const config = this.getFilteredEntityConfig(entityName);
            if (!config) {
                throw new Error(`${entityName} is not a filtered entity`);
            }

            // 构造查询条件：过滤条件 + 原有的匹配条件
            const combinedMatchExp = new MatchExp(config.sourceRecordName, this.map, config.filterCondition)
                .and(new MatchExp(config.sourceRecordName, this.map, matchExpressionData));
            
            // 确保 combinedMatch 有值
            if (!combinedMatchExp.data) {
                throw new Error('Failed to construct combined match expression');
            }

            // 在源实体上执行删除操作
            return this.agent.deleteRecord(config.sourceRecordName, combinedMatchExp.data, events)
        }

        return this.agent.deleteRecord(entityName, matchExpressionData, events)
    }

    async addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {}, events?: RecordMutationEvent[]) {
        assert(!!relationName && !!sourceEntityId && targetEntityId!!, `relationName: ${relationName} sourceEntityId:${sourceEntityId} targetEntityId:${targetEntityId} all cannot be empty`)
        return this.agent.addLink(relationName, sourceEntityId, targetEntityId, rawData, false, events)
    }

    async addRelationById(entity: string, attribute: string, entityId: string, attributeEntityId: string, relationData?: RawEntityData, events?: RecordMutationEvent[]) {
        return this.agent.addLinkFromRecord(entity, attribute, entityId, attributeEntityId, relationData, events)
    }

    async updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]) {
        assert(!rawData.source && !rawData.target, 'Relation can only update attributes. Use addRelation/removeRelation to update source/target.')
        return this.agent.updateRecord(relationName, matchExpressionData, new NewRecordData(this.map, relationName, rawData), events)
    }

    async removeRelationByName(relationName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]) {
        return this.agent.unlink(relationName, matchExpressionData, false, `remove relation ${relationName}`, events)
    }

    async findRelationByName(relationName: string, matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []) {
        return this.find(relationName, matchExpressionData, modifierData, attributeQueryData)
    }

    async findOneRelationByName(relationName: string, matchExpressionData: MatchExpressionData, modifierData: ModifierData = {}, attributeQueryData: AttributeQueryData = []) {
        const limitedModifier = {
            ...modifierData,
            limit: 1
        }

        return (await this.findRelationByName(relationName, matchExpressionData, limitedModifier, attributeQueryData))[0]
    }

    async findPath(entity: string, attribute: string, entityId: string, ancestorId: string) {
        return this.agent.findPath(entity, attribute, entityId, ancestorId)
    }

    createMatchFromAtom(...arg: Parameters<(typeof MatchExp)["atom"]>) {
        return MatchExp.atom(...arg)
    }
    getRelationName(entity: string, attribute: string): string {
        return this.map.getInfo(entity, attribute).linkName
    }
    getEntityName(entity: string, attribute: string): string {
        const info = this.map.getInfo(entity, attribute)
        return info.recordName
    }

    // === Filtered Entity 相关方法 ===

    /**
     * 检查给定的 entity 是否是 filtered entity
     */
    isFilteredEntity(entityName: string): boolean {
        const recordInfo = this.map.getRecordInfo(entityName)
        return !!recordInfo.sourceRecordName
    }

    /**
     * 获取 filtered entity 的配置
     */
    getFilteredEntityConfig(entityName: string): { sourceRecordName: string, filterCondition: any } | null {
        const recordInfo = this.map.getRecordInfo(entityName)
        if (recordInfo.sourceRecordName) {
            return {
                sourceRecordName: recordInfo.sourceRecordName!,
                filterCondition: recordInfo.filterCondition!
            };
        }
        return null;
    }

    /**
     * 获取基于指定源实体的所有 filtered entities
     */
    getFilteredEntitiesForSource(sourceEntityName: string): Array<{ name: string, filterCondition: any }> {
        return this.map.getRecordInfo(sourceEntityName).filteredBy?.map(recordInfo => ({
            name: recordInfo.name,
            filterCondition: recordInfo.filterCondition
        })) || []
    }


}