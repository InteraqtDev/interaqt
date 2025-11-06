import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { assert } from "../utils.js";
import { MatchAtom, MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";

import { FilteredEntityManager } from "./FilteredEntityManager.js";
import { SQLBuilder, PlaceholderGen } from "./SQLBuilder.js";
import { RecursiveContext, ROOT_LABEL } from "./util/RecursiveContext.js";
import { QueryExecutor, RecordQueryRef } from "./QueryExecutor.js";
import { CreationExecutor } from "./CreationExecutor.js";
import { DeletionExecutor } from "./DeletionExecutor.js";
import { UpdateExecutor } from "./UpdateExecutor.js";


export type Record = EntityIdRef & {
    [k: string]: any
}

export class RecordQueryAgent {
    getPlaceholder: () => PlaceholderGen
    private filteredEntityManager: FilteredEntityManager
    private sqlBuilder: SQLBuilder
    private queryExecutor: QueryExecutor
    private creationExecutor: CreationExecutor
    private deletionExecutor: DeletionExecutor
    private updateExecutor: UpdateExecutor
    
    constructor(public map: EntityToTableMap, public database: Database) {
        this.getPlaceholder = database.getPlaceholder || (() => (name?:string) => `?`)
        this.filteredEntityManager = new FilteredEntityManager(map, this)
        this.sqlBuilder = new SQLBuilder(map, database)
        this.queryExecutor = new QueryExecutor(map, database, this.sqlBuilder)
        this.creationExecutor = new CreationExecutor(map, database, this.queryExecutor, this.filteredEntityManager, this.sqlBuilder, this)
        this.deletionExecutor = new DeletionExecutor(map, database, this.queryExecutor, this.filteredEntityManager, this.sqlBuilder, this)
        this.updateExecutor = new UpdateExecutor(map, database, this.filteredEntityManager, this.sqlBuilder, this)
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

    /**
     * 处理合并记录和关系的闪出
     * 用于创建和更新场景中处理合并记录的数据迁移
     */
    async flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason = ''): Promise<{ [k: string]: RawEntityData }> {
        const result: { [k: string]: RawEntityData } = {}
        // CAUTION 这里是从 newEntityData 里读，不是从 newEntityDataWithIds，那里面是刚分配id 的，还没数据。
        let match: MatchExpressionData | undefined
        // 这里的目的是抢夺 combined record 上的所有数据，那么一定穷尽 combined record 的同表数据才行。
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(newEntityData.recordName, this.map, true, true, false, true)
        for (let combinedRecordIdRef of newEntityData.combinedRecordIdRefs) {
            const attributeIdMatchAtom: MatchAtom = {
                key: `${combinedRecordIdRef.info!.attributeName!}.id`,
                value: ['=', combinedRecordIdRef.getRef().id]
            }
            if (!match) {
                match = MatchExp.atom(attributeIdMatchAtom)
            } else {
                match = match.or(attributeIdMatchAtom)
            }
        }

        const recordQuery = RecordQuery.create(newEntityData.recordName, this.map, {
            matchExpression: match,
            attributeQuery: attributeQuery,
        }, undefined, undefined, undefined, false, true)

        const recordsWithCombined = await this.queryExecutor.findRecords(recordQuery, reason, undefined)


        // const hasNoConflict = recordsWithCombined.length === 1 && !recordsWithCombined[0].id
        // 开始 merge 数据，并记录 unLink 事件
        for (let recordWithCombined of recordsWithCombined) {
            for (let combinedRecordIdRef of newEntityData.combinedRecordIdRefs) {
                if (recordWithCombined[combinedRecordIdRef.info?.attributeName!]) {

                    // TODO 如果没有冲突的话，可以不用删除原来的数据。外面直接更新这一行就行了
                    //1. 删掉 combined 原来的所有同行数据
                    await this.deleteRecordSameRowData(combinedRecordIdRef.recordName, [{id: recordWithCombined[combinedRecordIdRef.info?.attributeName!].id}])

                    //2. 如果是抢夺，要记录一下事件。
                    if (recordWithCombined.id) {
                        events?.push({
                            type: 'delete',
                            recordName: combinedRecordIdRef.info!.linkName!,
                            record: recordWithCombined[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL],
                        })
                    }

                    //3. merge 数据并建立新的关系。
                    assert(!result[combinedRecordIdRef.info?.attributeName!], `should not have same combined record, conflict attribute: ${combinedRecordIdRef.info?.attributeName!}`)
                    result[combinedRecordIdRef.info?.attributeName!] = {
                        ...recordWithCombined[combinedRecordIdRef.info?.attributeName!]
                    }
                    // 相当于新建了关系。如果不是虚拟link 就要记录。
                    // TODO 要给出一个明确的 虚拟 link  record 的差异
                    if (!combinedRecordIdRef.info!.isLinkSourceRelation()) {
                        result[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL] = {
                            id: await this.database.getAutoId(combinedRecordIdRef.info!.linkName!),
                        }
                        events?.push({
                            type: 'create',
                            recordName: combinedRecordIdRef.info!.linkName,
                            record: result[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL]
                        })
                    }
                }
            }
        }

        return result
    }

    /**
     * 重定位合并记录数据用于链接
     * 用于 unlink 场景中处理合并记录的数据迁移
     */
    async relocateCombinedRecordDataForLink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, events?: RecordMutationEvent[]): Promise<Record[]> {
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(linkName, this.map, true, true, true, true)
        const moveAttribute = moveSource ? 'source' : 'target'

        const records = await this.queryExecutor.findRecords(RecordQuery.create(linkName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: attributeQuery
        }), `finding combined records for relocate ${linkName}.${moveAttribute}`, undefined)

        const toMoveRecordInfo = this.map.getLinkInfoByName(linkName)[moveSource ? 'sourceRecordInfo' : 'targetRecordInfo']

        // 1. 把这些数据删除，在下面重新插入到新行
        await this.deleteRecordSameRowData(toMoveRecordInfo.name, records.map(r => r[moveAttribute]))

        // 2. 重新插入到新行
        for (let record of records) {
            const toMoveRecordData = new NewRecordData(this.map, toMoveRecordInfo.name, record[moveAttribute])
            await this.creationExecutor.insertSameRowData(toMoveRecordData, undefined)

            // 3. 增加 delete 关系的事件
            events?.push({
                type: 'delete',
                recordName: linkName,
                record: record
            })
        }

        return records
    }

    // 委托给 UpdateExecutor
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<Record[]> {
        return this.updateExecutor.updateRecord(entityName, matchExpressionData, newEntityData, events)
    }

    // 委托给 UpdateExecutor
    async updateRecordDataById(entityName: string, idRef: EntityIdRef, columnAndValue: {
        field: string,
        value: string
    }[]): Promise<EntityIdRef> {
        return this.updateExecutor.updateRecordDataById(entityName, idRef, columnAndValue)
    }

    // 委托给 DeletionExecutor
    async deleteRecord(recordName: string, matchExp: MatchExpressionData, events?: RecordMutationEvent[], inSameRowDataOp = false): Promise<Record[]> {
        return this.deletionExecutor.deleteRecord(recordName, matchExp, events, inSameRowDataOp)
    }

    // 委托给 DeletionExecutor
    async deleteRecordSameRowData(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp = false): Promise<Record[]> {
        return this.deletionExecutor.deleteRecordSameRowData(recordName, records, events, inSameRowDataOp)
    }


    // 委托给 CreationExecutor
    addLinkFromRecord(entity: string, attribute: string, entityId: string, relatedEntityId: string, attributes: RawEntityData = {}, events?: RecordMutationEvent[]) {
        return this.creationExecutor.addLinkFromRecord(entity, attribute, entityId, relatedEntityId, attributes, events)
    }

    // 委托给 CreationExecutor
    async addLink(linkName: string, sourceId: string, targetId: string, attributes: RawEntityData = {}, moveSource = false, events?: RecordMutationEvent[]) {
        return this.creationExecutor.addLink(linkName, sourceId, targetId, attributes, moveSource, events)
    }


    // 委托给 DeletionExecutor
    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?: RecordMutationEvent[]): Promise<Record[]> {
        return this.deletionExecutor.unlink(linkName, matchExpressionData, moveSource, reason, events)
    }

    /**
     * 查找树形结构的两个数据间的 path - 委托给 QueryExecutor
     */
    async findPath(recordName: string, attributePathStr: string, startRecordId: string, endRecordId: string, limitLength?: number): Promise<Record[] | undefined> {
        return this.queryExecutor.findPath(recordName, attributePathStr, startRecordId, endRecordId, limitLength)
    }

}
