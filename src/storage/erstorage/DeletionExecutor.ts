import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData, AttributeQueryDataItem } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { assert } from "../utils.js";
import { SQLBuilder } from "./SQLBuilder.js";
import { DeletionMembershipSnapshot, FilteredEntityManager, shareMembershipLedger } from "./FilteredEntityManager.js";
import type { Record, RecordOperationAgent } from "./RecordQueryAgent.js";
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
        // CAUTION executor 之间的互相回调通过 RecordOperationAgent 显式契约进行（见 RecordQueryAgent）。
        private agent: RecordOperationAgent
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
        const records = await this.agent.findRecords(deleteQuery, `find record for deleting ${recordName}`)

        // 注意下面使用的都是 deleteQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        // CAUTION 我们应该先删除关系，再删除关联实体。按照下面的顺序就能保证事件顺序的正确。
        if (records.length) {
            // 成员资格快照必须在任何物理删除之前采集（谓词求值需要行与关系仍然存在）：
            // 1) 待删除记录（含同表 reliance 树）当前所属的 filtered entity —— 生成 filtered delete 事件；
            // 2) 如果删除的是 link record，两端实体在依赖该关系的 filtered entity 中的成员资格 —— 删除后 diff。
            const deletionSnapshot = await this.filteredEntityManager.collectDeletionMemberships(deleteQuery.recordName, records, events)
            const linkChecks = this.map.data.links[deleteQuery.recordName] && events ?
                await this.filteredEntityManager.collectLinkMembershipChecks(deleteQuery.recordName, {
                    sourceIds: records.map(r => r.source?.id),
                    targetIds: records.map(r => r.target?.id)
                }, events) : []

            // 删除关系数据（独立表或者关系在另一边的关系数据）
            await this.deleteNotReliantSeparateLinkRecords(deleteQuery.recordName, records, events)
            // 删除依赖我的实体（其他表中的）。注意, reliance 只可能是 1:x，不可能多个 n 个 record 被1个 reliace 依赖。
            //  为什么这里要单独计算 events, 是因为 1:1 并且刚好关系数据分配到了当前 record 上 时，关系事件顺序会不正确了。
            const relianceEvents: RecordMutationEvent[] = []
            shareMembershipLedger(relianceEvents, events)
            await this.deleteDifferentTableReliance(deleteQuery.recordName, records, relianceEvents)
            // 删除自身、有生命周期依赖的合表 record、合表到当前 record 的关系数据。
            // CAUTION 这里按结构分组收集事件（关系/级联事件 与 当前 record 删除事件分开），
            //  而不是依赖"事件数组的最后 N 条一定是 record 删除事件"这种脆弱的位置约定。
            const { linkAndCascadeEvents, recordDeleteEvents } = await this.deleteRecordSameRowDataGrouped(deleteQuery.recordName, records, inSameRowDataOp, deletionSnapshot, events)

            // 事件顺序：先关系删除事件，再 reliance 删除事件，最后是 record 本身的删除事件。
            events?.push(...linkAndCascadeEvents, ...relianceEvents, ...recordDeleteEvents)

            // link record 删除后两端实体的成员资格结算（例如删除关联实体导致的关系删除，
            // 或显式 unlink——它们都会经过本方法）。
            await this.filteredEntityManager.settleMembershipChecks(linkChecks, events)
        }

        return records
    }

    /**
     * 物理行搬迁的列清除（flashOut 抢夺 / relocate 解除 combined link）。
     *
     * CAUTION 与 deleteRecordSameRowData 的本质区别：搬迁中**没有任何记录逻辑死亡**——
     *  被移记录（连同其同行 reliance 子树）的 id 不变，数据随后整体重插到新行；
     *  引用这些 id 的**异表结构**（isolated/异表 link 行、异表 reliance 记录）保持有效，
     *  绝不能删。此前搬迁复用 deleteRecordSameRowData（逻辑删除语义）：grouped 的
     *  sameTableReliance 循环把子树成员按「死亡」处理——handleDeletedRecordReliance
     *  级联删除它们的独立表 link 行与异表 reliance 记录，且 events 为 undefined ⇒
     *  **零事件物理销毁**（r28，fuzzer seed 270：搬迁宿主携带 reliance 依赖 C 时，
     *  C 的 isolated n:n link 行被连坐删除）。
     *
     *  这里只做物理面：占用判定（行上还有别的记录 ⇒ 清列；否则删行）+ 与删除同一
     *  清除足迹（自身 sameRowFields + combined link 字段）。事件/成员资格由搬迁调用方
     *  按「link 层事实」自行处理。
     */
    async clearRowDataForMigration(recordName: string, records: EntityIdRef[]): Promise<void> {
        const recordInfo = this.map.getRecordInfo(recordName)
        for (const record of records) {
            await this.clearOrDeletePhysicalRow(recordInfo, record)
        }
    }

    /**
     * 死亡记录 combined 配对的核验 + 补载（只服务删除的级联/事件面，见调用点 CAUTION）。
     *
     * 1. **幻影剪枝**（r28，fuzzer seed 369）：combined x:1 的嵌套读取按「同物理行」编译，
     *    不校验 link id 列——历史操作留下的**偶然同住**（另一配对把同型记录放进本行、
     *    宿主亡故后余留的 co-tenant）会被读成「已配对」。删除按幻影配对级联会
     *    **物理销毁从未依赖过本记录的记录**并推送幻影 link delete 事件。
     *    这里以 link id 列为真相源逐一核验，幻影从 record 数据上剪除。
     * 2. **配对补载**：深查询不加载 reliance 子树成员的 notRelianceCombined（迁移消费方共用
     *    同一查询签名，加载会把配对列错误写进新行）；这些配对随成员死亡必须发 delete 事件，
     *    按需查询补齐。
     */
    private async verifyAndEnrichDyingRecordPairings(recordInfo: ReturnType<EntityToTableMap['getRecordInfo']>, record: Record): Promise<void> {
        // 1. 幻影剪枝：本记录数据上携带 id 的 combined 配对，核验 link id 列非空。
        const combinedAttrs = recordInfo.combinedRecords
            .filter(info => !(recordInfo.isRelation && (info.attributeName === 'source' || info.attributeName === 'target')))
        const carriedAttrs = combinedAttrs.filter(info => {
            const related = record[info.attributeName] as Record | undefined
            return related?.id !== undefined && related?.id !== null && !related[LINK_SYMBOL]?.id
        })
        if (carriedAttrs.length) {
            const linkIdFieldByAttr = new Map(carriedAttrs.map(info => [info.attributeName, info.getLinkInfo().recordInfo.idField!]))
            const p = this.database.getPlaceholder ? this.database.getPlaceholder() : () => '?'
            const rows = await this.database.query(
                `SELECT ${[...new Set(linkIdFieldByAttr.values())].map(field => `"${field}"`).join(', ')} FROM "${recordInfo.table}" WHERE "${recordInfo.idField}" = ${p()}`,
                [record.id],
                `verify combined pairings of dying ${recordInfo.name}`
            ) as { [k: string]: unknown }[]
            for (const info of carriedAttrs) {
                const linkIdValue = rows[0]?.[linkIdFieldByAttr.get(info.attributeName)!]
                if (linkIdValue === null || linkIdValue === undefined) {
                    // 幻影同住：并无 link，级联/事件一律不可发生。
                    delete record[info.attributeName]
                } else {
                    const related = record[info.attributeName] as Record
                    related[LINK_SYMBOL] = { ...(related[LINK_SYMBOL] || {}), id: linkIdValue }
                }
            }
        }
        // 2. 存活的 reliance 子树成员：补载其他 combined 配对 + 递归核验。
        for (const relianceInfo of recordInfo.sameTableReliance) {
            const member = record[relianceInfo.attributeName] as Record | undefined
            if (!member?.id) continue
            const memberInfo = relianceInfo.getRecordInfo()
            // 抵达本成员的 reliance link 自身的 delete 事件由宿主层的 sameTableReliance 循环发出，
            // 这里只补载**其他** combined 配对（多 owner / mergeLinks 同住）。
            const pairingAttrs = memberInfo.notRelianceCombined.filter(info =>
                info.linkName !== relianceInfo.linkName
                && !(memberInfo.isRelation && (info.attributeName === 'source' || info.attributeName === 'target'))
                && member[info.attributeName] === undefined)
            if (pairingAttrs.length) {
                const pairingAttributeQuery: AttributeQueryData = ['id', ...pairingAttrs.map(info => [info.attributeName, {
                    attributeQuery: ['id', [LINK_SYMBOL, { attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(info.linkName!, this.map) }]]
                }] as AttributeQueryDataItem)]
                const loaded = (await this.agent.findRecords(RecordQuery.create(memberInfo.name, this.map, {
                    matchExpression: MatchExp.atom({ key: 'id', value: ['=', member.id] }),
                    attributeQuery: pairingAttributeQuery,
                    modifier: { limit: 1 }
                }), `load combined pairings of dying reliance member ${memberInfo.name}`))[0]
                for (const info of pairingAttrs) {
                    if (loaded?.[info.attributeName]?.id !== undefined && loaded?.[info.attributeName]?.id !== null) {
                        member[info.attributeName] = loaded[info.attributeName]
                    }
                }
            }
            await this.verifyAndEnrichDyingRecordPairings(memberInfo, member)
        }
    }

    /**
     * 单条记录的物理行清除/删除（逻辑删除与物理搬迁共用的唯一足迹实现）。
     *
     * CAUTION 足迹与占用判定都以**物理行的真实列值**为真相源（r28，fuzzer seed 187/369）：
     *  1. 清除足迹必须实例感知——静态类型足迹会把「偶然同住」的同型记录连坐清除：
     *     combined x:1 的嵌套读取按同行编译，历史操作（宿主亡故、多配对装配）留下的
     *     orphan co-tenant 并非本记录的依赖。reliance 子树只在**抵达该成员的 link id 列
     *     非空**（配对真实存在）时才纳入足迹；配对 link 的列随配对死亡一并清除。
     *  2. 行删除判定：足迹之外行上还有任何记录身份（id 列非空）⇒ 只能清列，不能删行
     *     （「星形」共享行在 hub 迁出后留下的 orphan co-tenancy 也必须保全）。
     */
    private async clearOrDeletePhysicalRow(recordInfo: ReturnType<EntityToTableMap['getRecordInfo']>, record: EntityIdRef): Promise<void> {
        const recordName = recordInfo.name
        const p = this.database.getPlaceholder ? this.database.getPlaceholder() : () => '?'
        const rows = await this.database.query(
            `SELECT * FROM "${recordInfo.table}" WHERE "${recordInfo.idField}" = ${p()}`,
            [record.id],
            `read physical row before deleting ${recordName}`
        ) as { [k: string]: unknown }[]
        const row = rows[0]
        if (!row) return

        // 1. 实例感知的清除足迹：自身字段 + 真实存在的 combined 配对的 link 字段 +
        //    真实存在的 reliance 依赖的递归足迹。
        const fieldsToClear: string[] = []
        const visitedTypes = new Set<string>()
        const collectFootprint = (info: ReturnType<EntityToTableMap['getRecordInfo']>) => {
            if (visitedTypes.has(info.name)) return
            visitedTypes.add(info.name)
            // 自身 value 字段 + 合并进本行的 link（FK/merged link）字段 + link record 的端点字段
            fieldsToClear.push(...info.valueAttributes.map(attr => attr.field!).filter(Boolean))
            fieldsToClear.push(...info.mergedRecordAttributes.flatMap(attrInfo => attrInfo.getLinkInfo().recordInfo.sameRowFields))
            fieldsToClear.push(...info.managedRecordAttributes.map(attrInfo => attrInfo.linkField!).filter(Boolean))
            for (const combinedInfo of info.combinedRecords) {
                if (info.isRelation && (combinedInfo.attributeName === 'source' || combinedInfo.attributeName === 'target')) continue
                const linkRecordInfo = combinedInfo.getLinkInfo().recordInfo
                const linkIdValue = row[linkRecordInfo.idField!]
                if (linkIdValue === null || linkIdValue === undefined) continue
                // 配对真实存在：link 的行内列随本记录死亡清除；reliance 依赖整棵随行死亡。
                fieldsToClear.push(...linkRecordInfo.sameRowFields)
                if (combinedInfo.isReliance) {
                    collectFootprint(combinedInfo.getRecordInfo())
                }
            }
        }
        collectFootprint(recordInfo)
        const clearedFieldSet = new Set(fieldsToClear)

        // 2. 行占用判定：足迹之外的记录身份列仍有值 ⇒ 清列；否则删行。
        // CAUTION 不排除 filtered/merged-abstract 记录（r29，extended fuzzer seed 1 首跑抓获）：
        //  merged (union) 编译后，物理身份列属于 merged-abstract 记录（input 是视图、其 id 字段
        //  解析到 merged base 的列）——把它们排除会让「link 行 = 宿主行」的 merged link 删除
        //  误判行无人占用而 DELETE ROW，宿主实体被物理销毁（零事件）。视图与 base 共享同一
        //  id 字段，按字段判定天然去重，无需按记录种类排除。
        const hasSameRowData = Object.entries(this.map.data.records).some(([name, recordData]) => {
            if (name === recordName || recordData.table !== recordInfo.table) return false
            const idField = (recordData.attributes.id as { field?: string } | undefined)?.field
            if (!idField || clearedFieldSet.has(idField)) return false
            return row[idField] !== null && row[idField] !== undefined
        })
        if (hasSameRowData) {
            const [sql, params] = this.sqlBuilder.buildUpdateFieldsToNullSQL(
                recordInfo.name,
                [...clearedFieldSet],
                record
            )
            await this.database.update(sql, params, recordInfo.idField, `use update to delete ${recordName} because of sameRowData`)
        } else {
            // 不存在同行数据 record ，可以 delete row
            const [sql, params] = this.sqlBuilder.buildDeleteSQL(recordInfo.name, recordInfo.idField!, record.id)
            await this.database.delete(sql, params, `delete record ${recordInfo.name} as row`)
        }
    }

    /**
     * 删除记录的同行数据
     * 这里会把同表的 reliance，以及 reliance 的 reliance 都删除掉
     */
    async deleteRecordSameRowData(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp = false, deletionSnapshot?: DeletionMembershipSnapshot): Promise<Record[]> {
        // 调用方没有提供快照且行还存在（!inSameRowDataOp）时补采集；
        // 没有 events 时（flash-out / relocate 等内部行迁移）不产生成员资格事件，跳过。
        const snapshot = deletionSnapshot ?? (!inSameRowDataOp ? await this.filteredEntityManager.collectDeletionMemberships(recordName, records as Record[], events) : undefined)
        const { linkAndCascadeEvents, recordDeleteEvents } = await this.deleteRecordSameRowDataGrouped(recordName, records, inSameRowDataOp, snapshot, events)
        events?.push(...linkAndCascadeEvents, ...recordDeleteEvents)
        return records as Record[]
    }

    /**
     * 删除记录同行数据的实际实现。
     * 事件按结构分组返回：
     * - linkAndCascadeEvents：关系（link）删除事件、同表 reliance 级联删除事件、filtered entity 删除事件。
     * - recordDeleteEvents：当前批次 record 本身的删除事件（与传入 records 一一对应）。
     * @param deletionSnapshot 删除前采集的成员资格快照（删除后无法再求值谓词）。
     * @param ledgerEvents 整个操作共享的 events 数组（用于成员资格事件的账本判重）。
     */
    private async deleteRecordSameRowDataGrouped(recordName: string, records: EntityIdRef[], inSameRowDataOp = false, deletionSnapshot?: DeletionMembershipSnapshot, ledgerEvents?: RecordMutationEvent[]): Promise<{ linkAndCascadeEvents: RecordMutationEvent[], recordDeleteEvents: RecordMutationEvent[] }> {
        const linkAndCascadeEvents: RecordMutationEvent[] = []
        // 局部事件数组与操作级 events 共享成员资格账本，避免嵌套钩子重复发出事件。
        shareMembershipLedger(linkAndCascadeEvents, ledgerEvents)
        const recordInfo = this.map.getRecordInfo(recordName)

        for (let record of records) {
            if (!inSameRowDataOp) {
                // CAUTION 必须在物理清行**之前**补载死亡 reliance 子树成员的 combined 配对
                //  （r28，fuzzer seed 369）：删除的深查询不加载子树成员的 notRelianceCombined
                //  （迁移消费方共用同一查询签名，加载会把配对列错误写进新行）——但这些配对
                //  （多 reliance owner、mergeLinks 同住）随成员死亡，必须发 link delete 事件。
                //  数据面清列由删除足迹处理，这里按需查询补齐事件面数据；同时以 link id 列
                //  为真相源核验数据上携带的 combined 配对，剪除幻影同住（防幻影级联/幻影事件）。
                await this.verifyAndEnrichDyingRecordPairings(recordInfo, record as Record)
                await this.clearOrDeletePhysicalRow(recordInfo, record)
            }
            
            // 行内 link 的 base delete 事件 push 之后，立刻结算其 filtered relation 视图的
            // delete 事件（快照在 collectDeletionMemberships 里于行还活着时采集）。
            const settleInRowLinkViews = (linkName: string, linkRecord: Record) => {
                this.filteredEntityManager.settleDeletionMemberships(deletionSnapshot, linkName, [linkRecord], linkAndCascadeEvents, ledgerEvents)
            }

            // 1. 一定先删除递归处理同表的 reliance tree
            for (let relianceInfo of recordInfo.sameTableReliance) {
                // 只要真正存在这个数据才要删除
                if (record[relianceInfo.attributeName]?.id) {
                    // 和 reliance 的 link record 的事件
                    const relianceLinkRecord = {
                        ...record[relianceInfo.attributeName][LINK_SYMBOL],
                        [relianceInfo.isRecordSource() ? 'source' : 'target']: {
                            id: record.id
                        },
                        [relianceInfo.isRecordSource() ? 'target' : 'source']: {
                            id: record[relianceInfo.attributeName].id
                        }
                    }
                    linkAndCascadeEvents.push({
                        type: 'delete',
                        recordName: relianceInfo.linkName,
                        record: relianceLinkRecord,
                    })
                    settleInRowLinkViews(relianceInfo.linkName, relianceLinkRecord)

                    // 同表 reliance 的行数据已随本行删除，成员资格快照来自删除前的递归采集。
                    const childSnapshot = deletionSnapshot?.children.find(child => child.recordName === relianceInfo.recordName)
                    await this.handleDeletedRecordReliance(relianceInfo.recordName, record[relianceInfo.attributeName]!, linkAndCascadeEvents, childSnapshot, ledgerEvents)
                }
            }

            // 2. 接着先记录关系删除事件，再记录 record 删除事件。
            recordInfo.mergedRecordAttributes.forEach(attributeInfo => {
                if (record[attributeInfo.attributeName]?.id) {
                    // 记录和自己合并的 link 事件
                    // CAUTION 注意这里一定要增加 link 上对于原始 record 的引用。外部计算的时候可能需要，那时可能 record 也删了查询不到了。
                    const linkRecord = {
                        ...record[attributeInfo.attributeName][LINK_SYMBOL],
                        [attributeInfo.isRecordSource() ? 'source' : 'target']: {
                            id: record.id
                        },
                        [attributeInfo.isRecordSource() ? 'target' : 'source']: {
                            id: record[attributeInfo.attributeName].id
                        }
                    }
                    linkAndCascadeEvents.push({
                        type: 'delete',
                        recordName: attributeInfo.linkName,
                        record: linkRecord,
                    })
                    settleInRowLinkViews(attributeInfo.linkName, linkRecord)
                }
            })

            recordInfo.notRelianceCombined.forEach(attributeInfo => {
                if (recordInfo.isRelation && (attributeInfo.attributeName === 'target' || attributeInfo.attributeName === 'source')) return
                if (record[attributeInfo.attributeName]?.id === undefined) return
                // 记录和自己合并的 link 事件
                // CAUTION 注意这里一定要增加 link 上对于原始 record 的引用。外部计算的时候可能需要，那时可能 record 也删了查询不到了。
                const linkRecord = {
                    ...record[attributeInfo.attributeName][LINK_SYMBOL],
                    [attributeInfo.isRecordSource() ? 'source' : 'target']: {
                        id: record.id
                    },
                    [attributeInfo.isRecordSource() ? 'target' : 'source']: {
                        id: record[attributeInfo.attributeName].id
                    }
                }
                linkAndCascadeEvents.push({
                    type: 'delete',
                    recordName: attributeInfo.linkName,
                    record: linkRecord,
                })
                settleInRowLinkViews(attributeInfo.linkName, linkRecord)
            })
        }
        
        // filtered entity 的删除事件：按删除前采集的成员资格快照生成（谓词实时求值，无持久化标记）。
        // 事件位置保持在 record 本身的 delete 事件之前。
        this.filteredEntityManager.settleDeletionMemberships(deletionSnapshot, recordName, records as Record[], linkAndCascadeEvents, ledgerEvents)

        // CAUTION record 本身的 delete 事件必须以**物理名**发出（r29，extended fuzzer seed 37）：
        //  级联轨（sameTableReliance / handleDeletedRecordReliance）以声明面名字（attr.recordName）
        //  递归到这里——对 merged input / filtered 端点，声明名是视图：视图名下按契约只有
        //  成员资格事件（由上方 settle 负责），record 级 delete 归物理 base 名。此前级联轨
        //  按视图名发 record delete：物理名事件整体缺失（监听物理名的计算对删除失明），
        //  视图名事件与成员资格 settle 重复（双 delete）。canonical 轨（deleteRecord）的
        //  recordName 经 RecordQuery.create 已解析，此处归一让两条轨同一契约。
        const physicalRecordName = this.map.getRecordInfo(recordName).resolvedBaseRecordName ?? recordName
        const recordDeleteEvents = records.map(record => ({
            type: 'delete',
            recordName: physicalRecordName,
            record,
        }) as RecordMutationEvent)
        return { linkAndCascadeEvents, recordDeleteEvents }
    }

    /**
     * 处理被删除记录的依赖关系
     */
    async handleDeletedRecordReliance(recordName: string, record: EntityIdRef, events?: RecordMutationEvent[], deletionSnapshot?: DeletionMembershipSnapshot, ledgerEvents?: RecordMutationEvent[]) {
        // 删除独立表或者关系在另一边的关系数据
        await this.deleteNotReliantSeparateLinkRecords(recordName, [record], events)
        // 删除依赖我的实体
        await this.deleteDifferentTableReliance(recordName, [record], events)
        // 删除自身以及有生命周期依赖的合表 record
        await this.deleteRecordSameRowData(recordName, [record], events, true, deletionSnapshot)
        return record
    }

    /**
     * 删除非依赖的独立链接记录
     */
    async deleteNotReliantSeparateLinkRecords(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        for (let info of recordInfo.differentTableRecordAttributes) {
            if (!info.isReliance) {
                const ids = records.map(r => r.id)
                // CAUTION 对称 n:n 关系（source===target 且 sourceProperty===targetProperty）里，同一个
                //  实体可能存在于某些 link 行的 source 侧、另一些 link 行的 target 侧。只按 isRecordSource()
                //  取单侧（恒为 source）会漏删该实体在 target 侧的 link 行，留下孤儿关系并让对称 Count 偏高。
                //  因此对称关系必须同时匹配 source.id 与 target.id。
                const newMatch = info.isLinkManyToManySymmetric()
                    ? MatchExp.atom({ key: 'source.id', value: ['in', ids] })
                        .or({ key: 'target.id', value: ['in', ids] })
                    : MatchExp.atom({
                        key: info.isRecordSource() ? 'source.id' : 'target.id',
                        value: ['in', ids]
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
            // 删除关系时，要增加上当前 record 的引用。
            // 只需要回填本次 deleteRecord 追加的事件（记录起点），避免每层 reliance 都全量扫描
            // 共享事件数组（深级联 + 事件多的场景会退化成 O(n×m)）。
            const eventsLengthBeforeDelete = events?.length ?? 0
            await this.deleteRecord(info.recordName, matchInIds, events)
            if (events) {
                for (let i = eventsLengthBeforeDelete; i < events.length; i++) {
                    const event = events[i]
                    if (event.recordName === info.linkName) {
                        const record = recordsById!.get(event.record![info.isRecordSource() ? 'source' : 'target'].id)
                        if (record) {
                            event.record![info.isRecordSource() ? 'source' : 'target'] = record
                        }
                    }
                }
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
            return this.agent.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
        }

        return this.deleteRecord(linkName, matchExpressionData, events)
    }
}

