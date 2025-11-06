import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { assert } from "../utils.js";
import { SQLBuilder } from "./SQLBuilder.js";
import { FilteredEntityManager } from "./FilteredEntityManager.js";
import type { Record } from "./RecordQueryAgent.js";
import type { QueryExecutor } from "./QueryExecutor.js";

/**
 * DeletionExecutor - 删除操作执行器
 * 
 * 职责：
 * 1. 记录删除（entity/relation）
 * 2. 关系解除（unlink）
 * 3. 依赖删除（reliance deletion）
 * 4. 同行数据删除（same-row data deletion）
 * 5. 级联删除（cascading deletion）
 * 6. 删除事件生成（deletion events）
 */
export class DeletionExecutor {
    private sqlBuilder: SQLBuilder
    private filteredEntityManager: FilteredEntityManager

    constructor(
        private map: EntityToTableMap,
        private database: Database,
        private queryExecutor: QueryExecutor,
        filteredEntityManager: FilteredEntityManager,
        sqlBuilder: SQLBuilder,
        private helper: {
            findRecords: (entityQuery: RecordQuery, queryName: string) => Promise<Record[]>,
            relocateCombinedRecordDataForLink: (linkName: string, matchExpression: MatchExpressionData, moveSource: boolean, events?: RecordMutationEvent[]) => Promise<Record[]>
        }
    ) {
        this.sqlBuilder = sqlBuilder
        this.filteredEntityManager = filteredEntityManager
    }

    /**
     * 删除记录（主入口）
     */
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
        const records = await this.helper.findRecords(deleteQuery, `find record for deleting ${recordName}`)

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

    /**
     * 删除记录的同行数据
     * 这里会把同表的 reliance，以及 reliance 的 reliance 都删除掉
     */
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
                const recordWithSameRowData = await this.helper.findRecords(recordWithSameRowDataQuery, `find record with same row data for delete ${recordName}`)
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

    /**
     * 处理被删除记录的依赖关系
     */
    async handleDeletedRecordReliance(recordName: string, record: EntityIdRef, events?: RecordMutationEvent[]) {
        // 删除独立表或者关系在另一边的关系数据
        await this.deleteNotReliantSeparateLinkRecords(recordName, [record], events)
        // 删除依赖我的实体
        await this.deleteDifferentTableReliance(recordName, [record], events)
        // 删除自身以及有生命周期依赖的合表 record
        await this.deleteRecordSameRowData(recordName, [record], events, true)
        return record
    }

    /**
     * 删除非依赖的独立链接记录
     */
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

    /**
     * 删除不同表中的依赖实体
     */
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

    /**
     * 解除链接
     */
    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?: RecordMutationEvent[]): Promise<Record[]> {
        const linkInfo = this.map.getLinkInfoByName(linkName)
        assert(!linkInfo.isTargetReliance, `cannot unlink reliance data, you can only delete record, ${linkName}`)

        if (linkInfo.isCombined()) {
            return this.helper.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
        }

        return this.deleteRecord(linkName, matchExpressionData, events)
    }
}

