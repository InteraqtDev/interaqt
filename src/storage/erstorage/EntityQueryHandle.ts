import { EntityToTableMap, RecordMapItem, RecordAttribute } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";
import { ModifierData } from "./Modifier.js";
import { AttributeQueryData } from "./AttributeQuery.js";
import { assert } from "../utils.js";
import { RecordQuery, LINK_SYMBOL } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { RecordQueryAgent } from "./RecordQueryAgent.js";
import { EntityIdRef, Database, RecordMutationEvent, ID_ATTR, ROW_ID_ATTR } from "@runtime";
import { Record } from "./RecordQueryAgent.js";
import { RecordInfo } from "./RecordInfo.js";
import { MERGED_TYPE_ATTR } from "./MergedItemProcessor.js";

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

    async lock(entityName: string, matchExpressionData?: MatchExpressionData, attributeQueryData: AttributeQueryData = []): Promise<Record[]> {
        assert(this.map.getRecord(entityName), `cannot find entity ${entityName}`)
        const entityQuery = RecordQuery.create(
            entityName,
            this.map,
            {
                matchExpression: matchExpressionData,
                attributeQuery: attributeQueryData
            },
        )

        return this.agent.lockRecords(entityQuery, `locking ${entityName} from handle`)
    }

    /**
     * 公共写入口的载荷校验（递归覆盖嵌套关联记录载荷与 `&` link 数据）：
     * 1. merged entity/relation 的 `__type` 判别列由框架管理（创建时按使用的名字写入），
     *    显式覆写会把记录静默错标到其他 input 视图（跨视图可见性错乱 + 特有列交叉污染）。
     * 2. 未声明的属性名（拼写错误等）此前被 groupAttributes 静默丢弃——零告警数据丢失。
     * 3. merged input 视图共享物理 base 的属性命名空间：以 input A 的名义写 input B 的
     *    特有属性此前会静默落库（跨视图列污染）。
     *
     * 嵌套的 ref 载荷（携带 id 的既有记录引用）豁免 2/3：ref 的语义是「按 id 建立关系」，
     * 其携带的其他字段是快照残留、被写路径显式忽略（把完整记录对象直接用作关系端点是合法形态，
     * 例如把 event.user 作为 source）。判别列检查（1）对 ref 同样生效。
     */
    private validateWritePayload(recordName: string, rawData?: RawEntityData | RawEntityData[] | null, isNested = false) {
        if (!rawData || typeof rawData !== 'object') return
        if (Array.isArray(rawData)) {
            rawData.forEach(item => this.validateWritePayload(recordName, item, isNested))
            return
        }
        const record = this.map.getRecord(recordName)
        if (!record) return
        if (Object.prototype.hasOwnProperty.call(rawData, MERGED_TYPE_ATTR)) {
            const resolvedName = record.resolvedBaseRecordName || recordName
            if (this.map.getRecord(resolvedName)?.hasMergedDiscriminator) {
                throw new Error(
                    `'${MERGED_TYPE_ATTR}' is the discriminator column of merged record '${resolvedName}' and is managed by the framework — ` +
                    `it is written once at creation based on the name the record is created as, and cannot be set or changed through create/update. ` +
                    `To move a record between input views, change the data its membership conditions depend on instead.`
                )
            }
        }
        const isRefPayload = isNested && rawData[ID_ATTR] !== undefined
        for (const [rawKey, value] of Object.entries(rawData)) {
            // ROW_ID_ATTR 出现在框架返回的记录上，round-trip 回写是合法形态（写路径会忽略它）。
            if (rawKey === ID_ATTR || rawKey === ROW_ID_ATTR || rawKey === LINK_SYMBOL) continue
            const [key] = this.map.getAttributeAndSymmetricDirection(rawKey)
            const attribute = record.attributes[key] as RecordAttribute | undefined
            if (!attribute) {
                if (isRefPayload) continue
                throw new Error(
                    `unknown attribute "${rawKey}" in write payload for "${recordName}". ` +
                    `Unknown keys were previously dropped silently (zero-warning data loss). ` +
                    `Declared attributes: ${Object.keys(record.attributes).join(', ')}.`
                )
            }
            if (attribute.isRecord) {
                if (!value || typeof value !== 'object') continue
                this.validateWritePayload(attribute.recordName, value as RawEntityData | RawEntityData[], true)
                const linkData = (value as RawEntityData)[LINK_SYMBOL]
                if (linkData && attribute.linkName) {
                    this.validateWritePayload(attribute.linkName, linkData as RawEntityData, true)
                }
            } else if (!isRefPayload && record.writablePropertyNames && !record.writablePropertyNames.includes(key)) {
                // merged input 视图：attributes 表是整个家族的共享命名空间，必须按声明面裁剪。
                throw new Error(
                    `property "${key}" is not declared on "${recordName}" — it belongs to another input of merged record "${record.resolvedBaseRecordName || recordName}". ` +
                    `Writing it through "${recordName}" would silently pollute a column owned by a sibling input view. ` +
                    `Properties writable through "${recordName}": ${record.writablePropertyNames.join(', ')}.`
                )
            }
        }
    }

    async create(entityName: string, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        // 支持使用外部 id。
        // assert(rawData[ID_ATTR] === null || rawData[ID_ATTR] === undefined, `${ID_ATTR} should be null or undefined when creating new record`)
        this.validateWritePayload(entityName, rawData)
        const newEntityData = new NewRecordData(this.map, entityName, rawData)
        return this.agent.createRecord(newEntityData, `create record ${entityName} from handle`, events)
    }

    // CAUTION 不能递归更新 relate entity 的 value，如果传入了 related entity 的值，说明是建立新的联系。
    async update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]) {
        this.validateWritePayload(entity, rawData)
        const newEntityData = new NewRecordData(this.map, entity, rawData)
        return this.agent.updateRecord(entity, matchExpressionData, newEntityData, events)
    }

    async delete(entityName: string, matchExpressionData: MatchExpressionData,events?: RecordMutationEvent[]) {
        return this.agent.deleteRecord(entityName, matchExpressionData, events)
    }

    async addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {}, events?: RecordMutationEvent[]) {
        assert(!!relationName && !!sourceEntityId && targetEntityId!!, `relationName: ${relationName} sourceEntityId:${sourceEntityId} targetEntityId:${targetEntityId} all cannot be empty`)
        this.validateWritePayload(relationName, rawData)
        return this.agent.addLink(relationName, sourceEntityId, targetEntityId, rawData, false, events)
    }

    async addRelationById(entity: string, attribute: string, entityId: string, attributeEntityId: string, relationData?: RawEntityData, events?: RecordMutationEvent[]) {
        this.validateWritePayload(this.map.getInfo(entity, attribute).linkName, relationData)
        return this.agent.addLinkFromRecord(entity, attribute, entityId, attributeEntityId, relationData, events)
    }

    async updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]) {
        assert(!rawData.source && !rawData.target, 'Relation can only update attributes. Use addRelation/removeRelation to update source/target.')
        this.validateWritePayload(relationName, rawData)
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
}