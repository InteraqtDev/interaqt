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

/**
 * executor 之间互相回调所依赖的聚合操作契约。
 *
 * CAUTION CreationExecutor/UpdateExecutor/DeletionExecutor 与 RecordQueryAgent 本质上是同一个聚合，
 *  按文件拆分只是物理组织。这里用显式接口取代原先手工拼装的函数字典（那种写法依赖
 *  "恰好方法名匹配"的隐式约定），使循环回调成为受类型约束的显式契约。
 */
export interface RecordOperationAgent {
    findRecords(entityQuery: RecordQuery, queryName?: string): Promise<Record[]>
    createRecord(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef>
    createRecordDependency(newRecordData: NewRecordData, events?: RecordMutationEvent[]): Promise<NewRecordData>
    updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<Record[]>
    unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource?: boolean, reason?: string, events?: RecordMutationEvent[]): Promise<Record[]>
    deleteRecordSameRowData(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp?: boolean): Promise<Record[]>
    addLinkFromRecord(entity: string, attribute: string, entityId: string, relatedEntityId: string, attributes?: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef>
    preprocessSameRowData(newEntityData: NewRecordData, isUpdate?: boolean, events?: RecordMutationEvent[], oldRecord?: Record): Promise<NewRecordData>
    flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason?: string): Promise<{ [k: string]: RawEntityData }>
    relocateCombinedRecordDataForLink(linkName: string, matchExpressionData: MatchExpressionData, moveSource?: boolean, events?: RecordMutationEvent[]): Promise<Record[]>
}

export class RecordQueryAgent implements RecordOperationAgent {
    getPlaceholder: () => PlaceholderGen
    private filteredEntityManager: FilteredEntityManager
    private sqlBuilder: SQLBuilder
    private queryExecutor: QueryExecutor
    private creationExecutor: CreationExecutor
    private deletionExecutor: DeletionExecutor
    private updateExecutor: UpdateExecutor
    
    constructor(public map: EntityToTableMap, public database: Database) {
        this.getPlaceholder = database.getPlaceholder || (() => (name?:string) => `?`)
        // CAUTION filtered entity 依赖分析由 FilteredEntityManager 按 MapData 缓存，重复 new 不会重算。
        this.filteredEntityManager = new FilteredEntityManager(map, this)
        this.sqlBuilder = new SQLBuilder(map, database)
        this.queryExecutor = new QueryExecutor(map, database, this.sqlBuilder)
        this.creationExecutor = new CreationExecutor(map, database, this.queryExecutor, this.filteredEntityManager, this.sqlBuilder, this)
        this.deletionExecutor = new DeletionExecutor(map, database, this.queryExecutor, this.filteredEntityManager, this.sqlBuilder, this)
        this.updateExecutor = new UpdateExecutor(map, database, this.filteredEntityManager, this.sqlBuilder, this)
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

    async lockRecords(entityQuery: RecordQuery, queryName = ''): Promise<Record[]> {
        return this.queryExecutor.findRecords(entityQuery, queryName, undefined, new RecursiveContext(ROOT_LABEL), true)
    }



    // 委托给 CreationExecutor
    async createRecordDependency(newRecordData: NewRecordData, events?: RecordMutationEvent[]): Promise<NewRecordData> {
        return this.creationExecutor.createRecordDependency(newRecordData, events)
    }

    // 委托给 CreationExecutor
    async createRecord(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.creationExecutor.createRecord(newEntityData, queryName, events)
    }

    // 委托给 CreationExecutor。
    // CAUTION 创建/更新两个分支共用同一份实现（CreationExecutor.preprocessSameRowData），
    //  不要在这里再复制一份，两份实现必然随时间分叉。
    async preprocessSameRowData(newEntityData: NewRecordData, isUpdate = false, events?: RecordMutationEvent[], oldRecord?: Record): Promise<NewRecordData> {
        return this.creationExecutor.preprocessSameRowData(newEntityData, isUpdate, events, oldRecord)
    }

    /**
     * 处理合并记录和关系的闪出
     * 用于创建和更新场景中处理合并记录的数据迁移
     */
    async flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason = ''): Promise<{ [k: string]: RawEntityData }> {
        const result: { [k: string]: RawEntityData } = {}
        // CAUTION 没有需要抢夺的三表合一记录时必须直接返回。
        //  否则下面的 match 为 undefined，会生成 WHERE 1=1 的全表查询，导致每次 create/update 都全表扫描。
        if (!newEntityData.combinedRecordIdRefs.length) return result
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

    // 委托给 CreationExecutor（传播在 CreationExecutor.addLink 内统一处理，覆盖 addLinkFromRecord 等所有入口）
    async addLink(linkName: string, sourceId: string, targetId: string, attributes: RawEntityData = {}, moveSource = false, events?: RecordMutationEvent[]) {
        return this.creationExecutor.addLink(linkName, sourceId, targetId, attributes, moveSource, events)
    }


    // 委托给 DeletionExecutor
    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?: RecordMutationEvent[]): Promise<Record[]> {
        const removedLinks = await this.deletionExecutor.unlink(linkName, matchExpressionData, moveSource, reason, events)
        // CAUTION 关系解除同样会改变依赖该关系的 filtered entity 的成员资格，逐条传播受影响的两端实体。
        for (const link of removedLinks) {
            await this.filteredEntityManager.propagateLinkChange(
                linkName,
                link.source?.id,
                link.target?.id,
                events
            )
        }
        return removedLinks
    }

    /**
     * 查找树形结构的两个数据间的 path - 委托给 QueryExecutor
     */
    async findPath(recordName: string, attributePathStr: string, startRecordId: string, endRecordId: string, limitLength?: number): Promise<Record[] | undefined> {
        return this.queryExecutor.findPath(recordName, attributePathStr, startRecordId, endRecordId, limitLength)
    }

}
