import {EntityToTableMap} from "./EntityToTableMap";
import {MatchExp, MatchExpressionData} from "./MatchExp";
import {ModifierData} from "./Modifier";
import {AttributeQueryData} from "./AttributeQuery";
import {assert} from "../util";
import {RecordQuery} from "./RecordQuery";
import {NewRecordData, RawEntityData} from "./NewRecordData";
import {MutationEvent, RecordQueryAgent} from "./RecordQueryAgent";

export const ROW_ID_ATTR = '_rowId'
export const ID_ATTR = 'id'

export type EntityIdRef = {
    id: string,
    [ROW_ID_ATTR]? : string,
    [k:string]: any
}
export type Database = {
    scheme: (sql:string, name?:string) => Promise<any>
    query: <T extends any>(sql: string, name?:string) => Promise<T[]>
    delete: <T extends any>(sql: string, name?:string) => Promise<T[]>
    insert: (sql: string, name?:string) => Promise<EntityIdRef>
    update: (sql: string, idField?: string, name?:string) => Promise<EntityIdRef[]>
    getAutoId: (recordName: string) => Promise<string>
}

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

    async find(entityName: string, matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []) {
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

        return this.agent.findRecords(entityQuery)
    }

    async create(entityName: string, rawData: RawEntityData, events?: MutationEvent[]): Promise<EntityIdRef> {
        const newEntityData = new NewRecordData(this.map, entityName, rawData)
        return this.agent.createRecord(newEntityData, events)
    }

    // CAUTION 不能递归更新 relate entity 的 value，如果传入了 related entity 的值，说明是建立新的联系。
    async update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: MutationEvent[]) {
        const newEntityData = new NewRecordData(this.map, entity, rawData)
        if (entity === 'Request' && rawData.approved)  debugger
        return this.agent.updateRecord(entity, matchExpressionData, newEntityData, events)
    }

    async delete(entityName: string, matchExpressionData: MatchExpressionData,events?: MutationEvent[]) {
        return this.agent.deleteRecord(entityName, matchExpressionData, events)
    }

    async addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {}, events?: MutationEvent[]) {
        assert(!!relationName && !!sourceEntityId && targetEntityId!!, `${relationName} ${sourceEntityId} ${targetEntityId} cannot be empty`)
        return this.agent.addLink(relationName, sourceEntityId, targetEntityId, rawData, false, events)
    }

    async addRelationById(entity: string, attribute: string, entityId: string, attributeEntityId: string, relationData?: RawEntityData, events?: MutationEvent[]) {
        return this.agent.addLinkFromRecord(entity, attribute, entityId, attributeEntityId, relationData, events)
    }

    async updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: MutationEvent[]) {
        assert(!rawData.source && !rawData.target, 'Relation can only update attributes. Use addRelation/removeRelation to update source/target.')
        return this.agent.updateRecord(relationName, matchExpressionData, new NewRecordData(this.map, relationName, rawData), events)
    }

    async removeRelationByName(relationName: string, matchExpressionData: MatchExpressionData, events?: MutationEvent[]) {
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
}