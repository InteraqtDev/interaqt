import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { SQLBuilder } from "./SQLBuilder.js";
import { FilteredEntityManager } from "./FilteredEntityManager.js";
import type { Record } from "./RecordQueryAgent.js";

/**
 * UpdateExecutor - 更新操作执行器
 * 
 * 职责：
 * 1. 记录更新（entity/relation）
 * 2. 同行数据更新（same-row data update）
 * 3. 关系更新（reliance update）
 * 4. 更新事件生成（update events）
 */
export class UpdateExecutor {
    private sqlBuilder: SQLBuilder
    private filteredEntityManager: FilteredEntityManager

    constructor(
        private map: EntityToTableMap,
        private database: Database,
        filteredEntityManager: FilteredEntityManager,
        sqlBuilder: SQLBuilder,
        private helper: {
            findRecords: (entityQuery: RecordQuery, queryName: string) => Promise<Record[]>,
            createRecordDependency: (newRecordData: NewRecordData, events?: RecordMutationEvent[]) => Promise<NewRecordData>,
            createRecord: (newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]) => Promise<EntityIdRef>,
            addLinkFromRecord: (entity: string, attribute: string, entityId: string, relatedEntityId: string, attributes?: RawEntityData, events?: RecordMutationEvent[]) => Promise<EntityIdRef>,
            unlink: (linkName: string, matchExpression: MatchExpressionData, moveSource: boolean, reason: string, events?: RecordMutationEvent[]) => Promise<Record[]>,
            deleteRecordSameRowData: (recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp?: boolean) => Promise<Record[]>,
            preprocessSameRowData: (newEntityData: NewRecordData, isUpdate: boolean, events?: RecordMutationEvent[], oldRecord?: Record) => Promise<NewRecordData>
        }
    ) {
        this.sqlBuilder = sqlBuilder
        this.filteredEntityManager = filteredEntityManager
    }

    /**
     * 更新记录（主入口）
     */
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<Record[]> {
        // 现在支持在 update 字段的同时，使用 null 来删除关系
        // FIXME update 的 attributeQuery 应该按需查询，现在查询的记录太多

        const updateRecordQuery = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(entityName, this.map, true, true, true, true)
        })
        
        const matchedEntities = await this.helper.findRecords(updateRecordQuery, `find record for updating ${entityName}`)
        // 注意下面使用的都是 updateRecordQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        const result: Record[] = []
        for (let matchedEntity of matchedEntities) {
            // 1. 创建我依赖的
            const newEntityDataWithDep = await this.helper.createRecordDependency(newEntityData, events)
            // 2. 把同表的实体移出去，为新同表 Record 建立 id；可能有要删除的 reliance
            const newEntityDataWithIdsWithFlashOutRecords = await this.updateSameRowData(updateRecordQuery.recordName, matchedEntity, newEntityDataWithDep, events)
            // 3. 更新依赖我的和关系表独立的
            const relianceUpdatedResult = await this.handleUpdateReliance(updateRecordQuery.recordName, matchedEntity, newEntityData, events)

            // 处理 filtered entity - 检查更新后的记录是否属于任何 filtered entity
            // 传递原始的 matchedEntity，它包含更新前的 __filtered_entities 状态
            // 以及实际更改的字段
            const changedFields = Object.keys(newEntityData.getData())
            await this.filteredEntityManager.updateFilteredEntityFlags(updateRecordQuery.recordName, matchedEntity.id, events, matchedEntity, false, changedFields)

            result.push({...newEntityData.getData(), ...newEntityDataWithIdsWithFlashOutRecords.getData(), ...relianceUpdatedResult})
        }

        return result
    }

    /**
     * 更新同行数据
     */
    async updateSameRowData(entityName: string, matchedEntity: Record, newEntityDataWithDep: NewRecordData, events?: RecordMutationEvent[]) {
        // 跟自己合表实体的必须先断开关联，也就是移走。不然下面 updateRecordData 的时候就会把数据删除。
        const sameRowEntityNullOrRefOrNewData = newEntityDataWithDep.combinedRecordIdRefs.concat(
            newEntityDataWithDep.combinedNewRecords, 
            newEntityDataWithDep.combinedNullRecords, 
            newEntityDataWithDep.mergedLinkTargetNullRecords,
            newEntityDataWithDep.mergedLinkTargetRecordIdRefs,
        )
        // 1. 删除旧的关系。出现null 或者新的管理数据，说明是建立新的关系，也要先删除关系。
        for (let newRelatedEntityData of sameRowEntityNullOrRefOrNewData) {
            const linkInfo = newRelatedEntityData.info!.getLinkInfo()
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, newRelatedEntityData.info!.attributeName) ? 'source' : 'target'
            if ((newRelatedEntityData.isRef() && matchedEntity[newRelatedEntityData.info?.attributeName!]?.id === newRelatedEntityData.getData().id)) {
                // 放过原来就是同样 related entity 的场景。可能是编程中为了方便没做检查，把原本的写了进来。
                continue
            }

            await this.helper.unlink(
                linkInfo.name,
                MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                }),
                !linkInfo.isRelationSource(entityName, newRelatedEntityData.info!.attributeName),
                `unlink ${newRelatedEntityData.info?.parentEntityName} ${newRelatedEntityData.info?.attributeName} for update ${entityName}`,
                events
            )
        }

        // 2. 分配 id,处理需要 flash out 的数据等，事件也是这里面记录的。这里面会有抢夺关系，所以也可能会有删除事件。
        const newEntityDataWithIdsWithFlashOutRecords = await this.helper.preprocessSameRowData(newEntityDataWithDep, true, events, matchedEntity)
        const allSameRowData = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue(matchedEntity)
        const columnAndValue = allSameRowData.map(({field, value}: { field: string, value: string }) => (
            {
                field,
                /// TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5
                // value: JSON.stringify(value)
                value: value
            }
        ))

        // 3. 真实处理数据，这里面没有记录事件，事件是上面处理的。
        await this.updateRecordDataById(entityName, matchedEntity, columnAndValue)
        return newEntityDataWithIdsWithFlashOutRecords
    }

    /**
     * 处理更新时的关联关系
     */
    async handleUpdateReliance(entityName: string, matchedEntity: EntityIdRef, newEntityData: NewRecordData, events?: RecordMutationEvent[]) {
        // CAUTION update 里面的表达关联实体的语义统统认为是 replace。如果用户想要表达 xToMany 的情况下新增关系，应该自己拆成两步进行。既先更新数据，再用 addLink 去增加关系。
        // 1. 断开自己和原来关联实体的关系。这里只要处理依赖我的，或者关系独立的，因为我依赖的在应该在 updateSameRowData 里面处理了。
        const otherTableEntitiesData = newEntityData.differentTableMergedLinkRecordIdRefs.concat(
            newEntityData.differentTableMergedLinkNewRecords,
            newEntityData.differentTableMergedLinkNullRecords,
            newEntityData.isolatedRecordIdRefs,
            newEntityData.isolatedNewRecords,
            newEntityData.isolatedNullRecords
        )

        // CAUTION 由于 xToMany 的数组情况会平铺处理，所以这里可能出现两次，所以这里记录一下排重
        const removedLinkName = new Set()
        for (let relatedEntityData of otherTableEntitiesData) {
            const linkInfo = relatedEntityData.info!.getLinkInfo()
            if (removedLinkName.has(linkInfo.name)) {
                continue
            }

            removedLinkName.add(linkInfo.name)
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName) ? 'source' : 'target'
            await this.helper.unlink(
                linkInfo.name,
                MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                }),
                !linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName),
                'unlink old reliance for update',
                events,
            )
        }

        const result: Record = {id: matchedEntity.id}
        // 2. 建立新关系
        // 处理和其他实体更新关系的情况。
        for (let newRelatedEntityData of otherTableEntitiesData) {
            // 跳过已显式设置为 null 的关系属性
            if (newEntityData.rawData[newRelatedEntityData.info?.attributeName!] === null) {
                continue;
            }
            
            // 这里只处理没有三表合并的场景。因为三表合并的数据在 sameTableFieldAndValues 已经有了
            // 这里只需要处理 1）关系表独立 或者 2）关系表往另一个方向合了的情况。因为往本方向和的情况已经在前面 updateEntityData 里面处理了
            let finalRelatedEntityRef: Record

            if (newRelatedEntityData.isRef()) {
                finalRelatedEntityRef = newRelatedEntityData.getRef()
            } else {
                finalRelatedEntityRef = await this.helper.createRecord(newRelatedEntityData, `create new related record for update ${newEntityData.recordName}.${newRelatedEntityData.info?.attributeName}`, events)
            }

            // FIXME 这里没有在更新的时候一次性写入，而是又通过 addLinkFromRecord 建立的关系。需要优化
            const linkRecord = await this.helper.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, matchedEntity.id, finalRelatedEntityRef.id, undefined, events)

            if (newRelatedEntityData.info!.isXToMany) {
                if (!result[newRelatedEntityData.info!.attributeName!]) {
                    result[newRelatedEntityData.info!.attributeName!] = []
                }
                result[newRelatedEntityData.info!.attributeName!].push({
                    ...finalRelatedEntityRef,
                    [LINK_SYMBOL]: linkRecord,
                })
            } else {
                result[newRelatedEntityData.info!.attributeName!] = {
                    ...finalRelatedEntityRef,
                    [LINK_SYMBOL]: linkRecord,
                }
            }

        }

        return result
    }

    /**
     * 按 ID 更新记录数据
     */
    async updateRecordDataById(entityName: string, idRef: EntityIdRef, columnAndValue: {
        field: string,
        value: string
    }[]): Promise<EntityIdRef> {
        if (!columnAndValue.length) {
            return idRef
        }
        const [sql, params] = this.sqlBuilder.buildUpdateSQL(entityName, idRef, columnAndValue)
        const entityInfo = this.map.getRecordInfo(entityName);
        await this.database.update(sql, params, entityInfo.idField, `update record ${entityName} by id`)
        // 注意这里，使用要返回匹配的类，虽然可能没有更新数据。这样才能保证外部的逻辑比较一致。
        return idRef
    }
}

