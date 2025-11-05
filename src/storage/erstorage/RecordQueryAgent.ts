import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { BoolExp } from "@shared";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { assert, setByPath } from "../utils.js";
import { FieldMatchAtom, MatchAtom, MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData, AttributeQueryDataRecordItem } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery, RecordQueryTree } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { Modifier } from "./Modifier.js";

import { FilteredEntityManager } from "./FilteredEntityManager.js";
import { SQLBuilder, JoinTables, PlaceholderGen } from "./SQLBuilder.js";
import { FieldAliasMap } from "./util/FieldAliasMap.js";
import { RecursiveContext, ROOT_LABEL } from "./util/RecursiveContext.js";
import { QueryExecutor, RecordQueryRef } from "./QueryExecutor.js";
import { CreationExecutor } from "./CreationExecutor.js";


export type Record = EntityIdRef & {
    [k: string]: any
}

export class RecordQueryAgent {
    getPlaceholder: () => PlaceholderGen
    private filteredEntityManager: FilteredEntityManager
    private sqlBuilder: SQLBuilder
    private queryExecutor: QueryExecutor
    private creationExecutor: CreationExecutor
    
    constructor(public map: EntityToTableMap, public database: Database) {
        this.getPlaceholder = database.getPlaceholder || (() => (name?:string) => `?`)
        this.filteredEntityManager = new FilteredEntityManager(map, this)
        this.sqlBuilder = new SQLBuilder(map, database)
        this.queryExecutor = new QueryExecutor(map, database, this.sqlBuilder)
        this.creationExecutor = new CreationExecutor(map, database, this.queryExecutor, this.filteredEntityManager, this.sqlBuilder, {
            updateRecord: this.updateRecord.bind(this),
            unlink: this.unlink.bind(this),
            deleteRecordSameRowData: this.deleteRecordSameRowData.bind(this)
        })
        this.initializeFilteredEntityDependencies()
    }
    
    /**
     * 初始化所有 filtered entity 的依赖关系
     */
    private initializeFilteredEntityDependencies() {
        const records = this.map.data.records
        
        for (const [recordName, recordData] of Object.entries(records)) {
            if (recordData.baseRecordName && recordData.matchExpression) {
                // 使用预计算的值
                const rootEntityName = recordData.resolvedBaseRecordName || recordData.baseRecordName;
                const combinedExpression = recordData.resolvedMatchExpression || recordData.matchExpression;
                
                this.filteredEntityManager.analyzeDependencies(
                    recordName,
                    rootEntityName,
                    combinedExpression
                )
            }
        }
    }

    // DEPRECATED: 已迁移到 QueryExecutor，保留此方法仅为向后兼容
    structureRawReturns(rawReturns: { [k: string]: any }[], JSONFields: string[], fieldAliasMap: FieldAliasMap) {
        return rawReturns.map(rawReturn => {
            const obj = {}
            Object.entries(rawReturn).forEach(([key, value]) => {
                // CAUTION 注意这里去掉了最开始的 entityName
                const attributePath = fieldAliasMap.getPath(key)!.slice(1, Infinity)
                if (attributePath.length === 1 && JSONFields.includes(attributePath[0]) && typeof value === 'string') {
                    value = JSON.parse(value)
                }
                if (value !== null) {
                    setByPath(obj, attributePath, value)
                }
            })
            return obj
        })
    }

    // 查 entity 和 查 relation 都是一样的。具体在 entityQuery 里面区别。
    // TODO 为了性能，也可以把信息丢到客户端，然客户端去结构化？？？

    /**
     * 查找记录（主查询方法）- 委托给 QueryExecutor
     * CAUTION findRelatedRecords 中的递归调用会使得 includeRelationData 变为 true
     */
    async findRecords(entityQuery: RecordQuery, queryName = '', recordQueryRef?: RecordQueryRef, context: RecursiveContext = new RecursiveContext(ROOT_LABEL)): Promise<Record[]> {
        return this.queryExecutor.findRecords(entityQuery, queryName, recordQueryRef, context)
    }



    // 委托给 CreationExecutor
    async createRecordDependency(newRecordData: NewRecordData, events?: RecordMutationEvent[]): Promise<NewRecordData> {
        return this.creationExecutor.createRecordDependency(newRecordData, events)
    }

    // 委托给 CreationExecutor
    async createRecord(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.creationExecutor.createRecord(newEntityData, queryName, events)
    }

    // preprocessSameRowData 由于被 update 和 create 共同使用，保留在 RecordQueryAgent
    // 但在创建场景下会通过 insertSameRowData 间接调用 CreationExecutor 的版本
    async preprocessSameRowData(newEntityData: NewRecordData, isUpdate = false, events?: RecordMutationEvent[], oldRecord?: Record): Promise<NewRecordData> {
        if (!isUpdate) {
            // 创建场景：委托给 CreationExecutor
            return this.creationExecutor.preprocessSameRowData(newEntityData, isUpdate, events, oldRecord)
        }
        
        // 更新场景：保留原逻辑
        const newRawDataWithNewIds = newEntityData.getData()
        if(isUpdate && !newRawDataWithNewIds.id) {
            newRawDataWithNewIds.id = oldRecord!.id
        }

        // 可能只是更新关系，所以这里一定要有自身的 value 才算是 update 自己
        if (newEntityData.valueAttributes.length) {
            events?.push({
                type: 'update',
                recordName: newEntityData.recordName,
                record: {...newEntityData.getData()!, id: oldRecord!.id},
                oldRecord: oldRecord
            })
        }

        // 1. 先为三表合一的新数据分配 id
        for (let record of newEntityData.combinedNewRecords) {
            newRawDataWithNewIds[record.info!.attributeName] = {
                ...newRawDataWithNewIds[record.info!.attributeName],
                id: await this.database.getAutoId(record.info!.recordName!),
            }
            events?.push({
                type: 'create',
                recordName: record.recordName,
                record: newRawDataWithNewIds[record.info!.attributeName]
            })
        }

        // 2. 为我要新建 三表合一、或者我 mergedLink 的 的 关系 record 分配 id.
        for (let record of newEntityData.mergedLinkTargetNewRecords.concat(newEntityData.mergedLinkTargetRecordIdRefs, newEntityData.combinedNewRecords)) {
            if (newRawDataWithNewIds[record.info!.attributeName].id !== oldRecord?.[record.info!.attributeName]?.id) {
                newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL] = {
                    ...(newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL] || {}),
                    id: await this.database.getAutoId(record.info!.linkName!),
                }

                const linkRecord = {...newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL]}
                linkRecord[record.info!.isRecordSource() ? 'target' : 'source'] = record.getData()
                linkRecord[record.info!.isRecordSource() ? 'source' : 'target'] = {...newRawDataWithNewIds}
                delete linkRecord.target[LINK_SYMBOL]
                delete linkRecord.source[LINK_SYMBOL]


                events?.push({
                    type: 'create',
                    recordName: record.info!.linkName,
                    record: linkRecord
                })
            }
        }

        const newEntityDataWithIds = newEntityData.merge(newRawDataWithNewIds)

        // 2. 处理需要 flashOut 的数据
        const flashOutRecordRasData: { [k: string]: RawEntityData } = await this.flashOutCombinedRecordsAndMergedLinks(
            newEntityData,
            events,
            `finding combined records for ${newEntityData.recordName} to flash out, for ${isUpdate ? 'updating' : 'creation'} with data ${JSON.stringify(newEntityDataWithIds.getData())}`
        )

        return newEntityDataWithIds.merge(flashOutRecordRasData)
    }

    // 委托给 CreationExecutor
    async flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason = ''): Promise<{ [k: string]: RawEntityData }> {
        return this.creationExecutor.flashOutCombinedRecordsAndMergedLinks(newEntityData, events, reason)
    }

    // 委托给 CreationExecutor
    async relocateCombinedRecordDataForLink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, events?: RecordMutationEvent[]) {
        return this.creationExecutor.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
    }



    // CAUTION 除了 1:1 并且合表的关系，不能递归更新 relatedEntity，如果是传入了，说明是建立新的关系。
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

            await this.unlink(
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
        const newEntityDataWithIdsWithFlashOutRecords = await this.preprocessSameRowData(newEntityDataWithDep, true, events, matchedEntity)
        const allSameRowData = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue(matchedEntity)
        const columnAndValue = allSameRowData.map(({field, value}: { field: string, value: string }) => (
            {
                field,
                /// TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5
                // value: JSON.stringify(value)
                value: value
            }
        ))

        // 3. 真实处理数据，这里面没有记录事件，事件是上面处理的。、
        await this.updateRecordDataById(entityName, matchedEntity, columnAndValue)
        return newEntityDataWithIdsWithFlashOutRecords
    }

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
            await this.unlink(
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
                finalRelatedEntityRef = await this.createRecord(newRelatedEntityData, `create new related record for update ${newEntityData.recordName}.${newRelatedEntityData.info?.attributeName}`, events)
            }

            // FIXME 这里没有在更新的时候一次性写入，而是又通过 addLinkFromRecord 建立的关系。需要优化
            const linkRecord = await this.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, matchedEntity.id, finalRelatedEntityRef.id, undefined, events)

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

    // 修改TODO注释以反映已实现的功能
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<Record[]> {
        // 现在支持在 update 字段的同时，使用 null 来删除关系
        // FIXME update 的 attributeQuery 应该按需查询，现在查询的记录太多

        const updateRecordQuery = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(entityName, this.map, true, true, true, true)
        })
        
        const matchedEntities = await this.findRecords(updateRecordQuery, `find record for updating ${entityName}`, undefined)
        // 注意下面使用的都是 updateRecordQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        const result: Record[] = []
        for (let matchedEntity of matchedEntities) {
            // 1. 创建我依赖的
            const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)
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

    async deleteRecord(recordName: string, matchExp: MatchExpressionData, events?: RecordMutationEvent[], inSameRowDataOp = false): Promise<Record[]> {
        const deleteQuery = RecordQuery.create(recordName, this.map, {
            matchExpression: matchExp,
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(
                recordName,
                this.map,
                true,
                true,
                true,
                true
            )
        })
        const records = await this.findRecords(deleteQuery, `find record for deleting ${recordName}`, undefined)

        // 注意下面使用的都是 deleteQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        // CAUTION 我们应该先删除关系，再删除关联实体。按照下面的顺序就能保证事件顺序的正确。
        if (records.length) {
            // 删除关系数据（独立表或者关系在另一边的关系数据）
            await this.deleteNotReliantSeparateLinkRecords(deleteQuery.recordName, records, events)
            // 删除依赖我的实体（其他表中的）。注意, reliance 只可能是 1:x，不可能多个 n 个 record 被1个 reliace 依赖。
            //  为什么这里要单独计算 events, 是因为 1:1 并且刚好关系数据分配到了当前 record 上 时，关系事件顺序会不正确了。
            const relianceEvents: RecordMutationEvent[] = []
            await this.deleteDifferentTableReliance(deleteQuery.recordName, records, relianceEvents)
            // 删除自身、有生命周期依赖的合表 record、合表到当前 record 的关系数据。
            const sameRowRecordEvents: RecordMutationEvent[] = []
            await this.deleteRecordSameRowData(deleteQuery.recordName, records, sameRowRecordEvents, inSameRowDataOp)

            // 1. recordEvents 除了最后一个外全都是关系删除事件。
            // 2. relianceEvents 中都是 reliance 删除事件，可能包含关系删除事件。
            // 3. 最后 recordEvents 是 record 删除事件。
            const relationEvents = sameRowRecordEvents.slice(0, sameRowRecordEvents.length - records.length)
            const recordEvents = sameRowRecordEvents.slice(sameRowRecordEvents.length - records.length)
            events?.push(...relationEvents, ...relianceEvents, ...recordEvents)
        }

        return records
    }

    // 这里会把通表的 reliance，以及 reliance 的 reliance 都删除掉。
    // this method will delete all the reliance of the record, and the reliance of the reliance.
    async deleteRecordSameRowData(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp = false): Promise<Record[]> {
        const recordInfo = this.map.getRecordInfo(recordName)

        for (let record of records) {
            if (!inSameRowDataOp) {
                const recordWithSameRowDataQuery = RecordQuery.create(
                    recordName,
                    this.map,
                    {
                        matchExpression: MatchExp.atom({
                            key: `id`,
                            value: ['=', record.id]
                        }),
                        attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(recordName, this.map, true, true, true, true),
                        modifier: {limit: 1}
                    }
                )
                const recordWithSameRowData = await this.findRecords(recordWithSameRowDataQuery, `find record with same row data for delete ${recordName}`, undefined)
                const hasSameRowData = recordInfo.notRelianceCombined.some(info => {
                    return !!recordWithSameRowData[0]?.[info.attributeName]?.id
                })
                // 存在合表的1:1关系，且不是 reliance。当前 record 删了，其他数据仍然要留下。
                if (hasSameRowData) {
                    // 存在同行 record，只能用 update
                    const [sql, params] = this.sqlBuilder.buildUpdateFieldsToNullSQL(
                        recordInfo.name,
                        recordInfo.sameRowFields,
                        record
                    )
                    await this.database.update(sql, params, recordInfo.idField, `use update to delete ${recordName} because of sameRowData`)

                } else {
                    // 不存在同行数据 record ，可以 delete row
                    const [sql, params] = this.sqlBuilder.buildDeleteSQL(recordInfo.name, recordInfo.idField!, record.id)
                    await this.database.delete(sql, params, `delete record ${recordInfo.name} as row`)
                }
            }
            
            // 1. 一定先删除递归处理同表的 reliance tree
            for (let relianceInfo of recordInfo.sameTableReliance) {
                // 只要真正存在这个数据才要删除
                if (record[relianceInfo.attributeName]?.id) {
                    // 和 reliance 的 link record 的事件
                    events?.push({
                        type: 'delete',
                        recordName: relianceInfo.linkName,
                        record: {
                            ...record[relianceInfo.attributeName][LINK_SYMBOL],
                            [relianceInfo.isRecordSource() ? 'source' : 'target']: {
                                id: record.id
                            },
                            [relianceInfo.isRecordSource() ? 'target' : 'source']: {
                                id: record[relianceInfo.attributeName].id
                            }
                        },
                    })

                    await this.handleDeletedRecordReliance(relianceInfo.recordName, record[relianceInfo.attributeName]!, events)
                }
            }

            // 2. 接着先记录关系删除事件，再记录 record 删除事件。
            recordInfo.mergedRecordAttributes.forEach(attributeInfo => {
                if (record[attributeInfo.attributeName]?.id) {
                    // 记录和自己合并的 link 事件
                    events?.push({
                        type: 'delete',
                        recordName: attributeInfo.linkName,
                        // CAUTION 注意这里一定要增加 link 上对于原始 record 的引用。外部计算的时候可能需要，那时可能 record 也删了查询不到了。
                        record: {
                            ...record[attributeInfo.attributeName][LINK_SYMBOL],
                            [attributeInfo.isRecordSource() ? 'source' : 'target']: {
                                id: record.id
                            },
                            [attributeInfo.isRecordSource() ? 'target' : 'source']: {
                                id: record[attributeInfo.attributeName].id
                            }
                        },
                    })
                }
            })

            recordInfo.notRelianceCombined.forEach(attributeInfo => {
                if (recordInfo.isRelation && (attributeInfo.attributeName === 'target' || attributeInfo.attributeName === 'source')) return
                if (record[attributeInfo.attributeName]?.id === undefined) return
                // 记录和自己合并的 link 事件
                events?.push({
                    type: 'delete',
                    recordName: attributeInfo.linkName,
                    // CAUTION 注意这里一定要增加 link 上对于原始 record 的引用。外部计算的时候可能需要，那时可能 record 也删了查询不到了。
                    record: {
                        ...record[attributeInfo.attributeName][LINK_SYMBOL],
                        [attributeInfo.isRecordSource() ? 'source' : 'target']: {
                            id: record.id
                        },
                        [attributeInfo.isRecordSource() ? 'target' : 'source']: {
                            id: record[attributeInfo.attributeName].id
                        }
                    },
                })
            })
        }
        
        // 处理 filtered entity 的删除事件
        for (let record of records) {
            const filteredEntities = this.filteredEntityManager.getFilteredEntitiesForBase(recordName);
            if (filteredEntities.length > 0 && record.__filtered_entities) {
                // __filtered_entities 可能已经被解析为对象
                const currentFlags = typeof record.__filtered_entities === 'string' 
                    ? JSON.parse(record.__filtered_entities) 
                    : record.__filtered_entities;
                for (const filteredEntity of filteredEntities) {
                    if (currentFlags[filteredEntity.name] === true) {
                        // 记录属于这个 filtered entity，生成删除事件
                        events?.push({
                            type: 'delete',
                            recordName: filteredEntity.name,
                            record: { ...record }
                        });
                    }
                }
            }
        }
        
        events?.push(...records.map(record => ({
            type: 'delete',
            recordName: recordName,
            record,
        }) as RecordMutationEvent))
        return records
    }

    async handleDeletedRecordReliance(recordName: string, record: EntityIdRef, events?: RecordMutationEvent[]) {

        // 删除独立表或者关系在另一边的关系数据
        await this.deleteNotReliantSeparateLinkRecords(recordName, [record], events)
        // 删除依赖我的实体
        await this.deleteDifferentTableReliance(recordName, [record], events)
        // 删除自身以及有生命周期依赖的合表 record
        await this.deleteRecordSameRowData(recordName, [record], events, true)
        return record
    }

    async deleteNotReliantSeparateLinkRecords(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        for (let info of recordInfo.differentTableRecordAttributes) {
            if (!info.isReliance) {
                const key = info.isRecordSource() ? 'source.id' : 'target.id'
                const newMatch = MatchExp.atom({
                    key,
                    value: ['in', records.map(r => r.id)]
                })
                // 关系事件上全部都要增加原始 record 的引用。注意不能给所有 events 都去加，因为删除 link 时也可能有关联实体被删除事件。
                //  只有最后哪些 events 是删除 link 的事件。
                await this.deleteRecord(info.linkName, newMatch, events)
            }
        }
    }

    async deleteDifferentTableReliance(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        const recordsById = events ? new Map(records.map(r => [r.id, r])) : undefined

        for (let info of recordInfo.differentTableReliance) {
            const matchInIds = MatchExp.atom({
                key: `${info.getReverseInfo()?.attributeName!}.id`,
                value: ['in', records.map(r => r.id)]
            })
            await this.deleteRecord(info.recordName, matchInIds, events)
            if (events) {
                // 删除关系时，要增加上当前 record 的引用。
                // TODO 这里需要更加高效的方法
                events.forEach(event => {
                    if (event.recordName === info.linkName) {
                        const record = recordsById!.get(event.record![info.isRecordSource() ? 'source' : 'target'].id)
                        if (record) {
                            event.record![info.isRecordSource() ? 'source' : 'target'] = record
                        }
                    }
                })
            }
        }
    }


    // 委托给 CreationExecutor
    addLinkFromRecord(entity: string, attribute: string, entityId: string, relatedEntityId: string, attributes: RawEntityData = {}, events?: RecordMutationEvent[]) {
        return this.creationExecutor.addLinkFromRecord(entity, attribute, entityId, relatedEntityId, attributes, events)
    }

    // 委托给 CreationExecutor
    async addLink(linkName: string, sourceId: string, targetId: string, attributes: RawEntityData = {}, moveSource = false, events?: RecordMutationEvent[]) {
        return this.creationExecutor.addLink(linkName, sourceId, targetId, attributes, moveSource, events)
    }


    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?: RecordMutationEvent[]): Promise<Record[]> {
        const linkInfo = this.map.getLinkInfoByName(linkName)
        assert(!linkInfo.isTargetReliance, `cannot unlink reliance data, you can only delete record, ${linkName}`)

        if (linkInfo.isCombined()) {
            return this.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
        }

        return this.deleteRecord(linkName, matchExpressionData, events)
    }

    /**
     * 查找树形结构的两个数据间的 path - 委托给 QueryExecutor
     */
    async findPath(recordName: string, attributePathStr: string, startRecordId: string, endRecordId: string, limitLength?: number): Promise<Record[] | undefined> {
        return this.queryExecutor.findPath(recordName, attributePathStr, startRecordId, endRecordId, limitLength)
    }

}
