import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { assert } from "../utils.js";
import { MatchAtom, MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";

import { DeletionMembershipSnapshot, FilteredEntityManager, MembershipCheck } from "./FilteredEntityManager.js";
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
    unlinkOldOwnersOfExclusiveTargets(newEntityData: NewRecordData, events?: RecordMutationEvent[], currentRecord?: Record): Promise<void>
    preprocessSameRowData(newEntityData: NewRecordData, isUpdate?: boolean, events?: RecordMutationEvent[], oldRecord?: Record): Promise<NewRecordData>
    flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason?: string, excludeAttributes?: Set<string>, newOwnerId?: string): Promise<{ [k: string]: RawEntityData }>
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

    // 委托给 CreationExecutor（create/update 共用：1:1 排他目标的旧 owner 解除）
    async unlinkOldOwnersOfExclusiveTargets(newEntityData: NewRecordData, events?: RecordMutationEvent[], currentRecord?: Record): Promise<void> {
        return this.creationExecutor.unlinkOldOwnersOfExclusiveTargets(newEntityData, events, currentRecord)
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
     *
     * CAUTION 事件语义（tests/storage/combinedRecordEvents.spec.ts 固化）：
     *  内部的 deleteRecordSameRowData 是**物理行搬迁**——被抢夺实体的逻辑身份（id）全程不变，
     *  所以刻意不产生实体级 delete/create 事件（否则下游聚合会被虚假地减/加一次）。
     *  事件流只反映关系层面的事实：旧 link delete + 新 link create（见下方 events?.push）。
     */
    async flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason = '', excludeAttributes?: Set<string>, newOwnerId?: string): Promise<{ [k: string]: RawEntityData }> {
        const result: { [k: string]: RawEntityData } = {}
        // CAUTION update 时引用的 combined record 若与当前行上已有的是同一个（同 id 原地更新），
        //  不存在"抢夺"：数据已在本行。此时绝不能走 flashOut——它会把本行旧数据读出再 merge 回
        //  newEntityData（merge 方向是 flashOut 数据在后），用户的新值被旧值静默覆盖（r17 F-2 家族）。
        const combinedRecordIdRefsToFlash = excludeAttributes?.size
            ? newEntityData.combinedRecordIdRefs.filter(r => !excludeAttributes.has(r.info!.attributeName))
            : newEntityData.combinedRecordIdRefs
        // CAUTION 没有需要抢夺的三表合一记录时必须直接返回。
        //  否则下面的 match 为 undefined，会生成 WHERE 1=1 的全表查询，导致每次 create/update 都全表扫描。
        if (!combinedRecordIdRefsToFlash.length) return result
        // CAUTION 这里是从 newEntityData 里读，不是从 newEntityDataWithIds，那里面是刚分配id 的，还没数据。
        let match: MatchExpressionData | undefined
        // 这里的目的是抢夺 combined record 上的所有数据，那么一定穷尽 combined record 的同表数据才行。
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(newEntityData.recordName, this.map, true, true, false, true)
        for (let combinedRecordIdRef of combinedRecordIdRefsToFlash) {
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
        const newRecordIsLink = this.map.getRecordInfo(newEntityData.recordName).isRelation && !!this.map.data.links[newEntityData.recordName]
        // CAUTION 被抢夺的旧 owner 会失去 combined 关联端点（deleteRecordSameRowData 物理清列），
        //  其 filtered entity 成员资格必须重算——否则「查询面已退出、事件面无 delete」，下游对该
        //  filtered 视图的响应式计算永久陈旧（combined × filtered 交叉格，r18 复盘已标注为空白）。
        //  merged 拓扑经 unlinkOldOwnersOfExclusiveTargets → unlink → deleteRecord 已走成员资格机制，
        //  combined 的 flashOut 是平行漏网。before 快照必须在物理清列之前采集，settle 在之后统一结算。
        const oldOwnerMembershipChecks: MembershipCheck[] = []
        for (let recordWithCombined of recordsWithCombined) {
            // CAUTION 正在创建的是 combined link record（如三表合一的 1:1 关系经 addLink 建立），
            //  且被抢夺端点所在的行本身就是一条旧业务 link 行（行上有 link id）时：
            //  端点数据被 flashOut 后旧业务 link 即告消失（列由 deleteRecordSameRowData 一并清除），
            //  必须补发业务 link 的 delete 事件。下面 ref 循环里的既有事件块只覆盖
            //  「创建实体时抢夺 combined 关联」的形态（linkName 是业务 link）；本形态下
            //  ref 是 link 的 source/target，其 linkName 是虚拟 link，业务事件会漏发
            //  （写路径拓扑矩阵的事件完备性预言机发现，r17 追加）。
            if (newRecordIsLink && recordWithCombined.id) {
                const oldBusinessLinkRecord = {
                    ...Object.fromEntries(Object.entries(recordWithCombined).filter(([, v]) => v === null || typeof v !== 'object')),
                    id: recordWithCombined.id,
                    source: { id: recordWithCombined.source?.id },
                    target: { id: recordWithCombined.target?.id },
                }
                // 旧业务 link 消失 ⇒ 两端实体在依赖该关系的 filtered entity 中的成员资格必须重算
                // （与 deleteRecord 对 link 删除的处理同构，r21 F-2）：此前 addLink 抢夺形态下
                //  旧 owner 只在 create/update 抢夺（业务属性 ref）分支被覆盖，link 形态的抢夺
                //  （combinedRecordIdRefs 是虚拟端点 ref）绕过了下方 L191 的守卫——旧 owner 退出
                //  视图零 delete 事件，下游计算永久陈旧。快照必须在物理清列之前采集；
                //  被抢夺端点此刻处于行迁移中，settle 时查不到行会安全跳过（由 createRecord 级
                //  的 collectCreationLinkChecks 在写入完成后覆盖）。
                oldOwnerMembershipChecks.push(...await this.filteredEntityManager.collectLinkMembershipChecks(
                    newEntityData.recordName,
                    { sourceIds: [recordWithCombined.source?.id], targetIds: [recordWithCombined.target?.id] },
                    events
                ))
                // 视图（filtered relation）成员资格必须在物理清列之前求值（谓词只由 SQL 求值）。
                const oldBusinessLinkViewSnapshot = await this.filteredEntityManager.collectInlineDeletionSnapshot(newEntityData.recordName, [oldBusinessLinkRecord], events)
                events?.push({
                    type: 'delete',
                    recordName: newEntityData.recordName,
                    record: oldBusinessLinkRecord
                })
                if (events && oldBusinessLinkViewSnapshot) {
                    this.filteredEntityManager.settleDeletionMemberships(oldBusinessLinkViewSnapshot, newEntityData.recordName, [oldBusinessLinkRecord], events, events)
                }
            }
            for (let combinedRecordIdRef of combinedRecordIdRefsToFlash) {
                // CAUTION 行是按多个 ref 的 OR 匹配出来的，必须校验「本行该属性的值确实是当前 ref」：
                //  例如三表合一的 link 抢夺（addLink(u2, p)，p 在 u1 行内）会同时匹配 u2 的行
                //  （source.id=u2）与 u1 的行（target.id=p）——处理 u1 的行时 source 属性上是 u1
                //  而不是 u2，若只判真值就会把无关的 u1 一并 flashOut，并在 result 上产生
                //  同名属性冲突（"should not have same combined record" 内部断言崩溃，r17 拓扑矩阵首跑发现）。
                if (recordWithCombined[combinedRecordIdRef.info?.attributeName!]?.id === combinedRecordIdRef.getRef().id) {

                    // 抢夺既有 owner（recordWithCombined.id 存在）且被抢的是业务关系端点（非虚拟 link 的
                    // source/target）时，先快照该 owner 在依赖此关系属性的 filtered entity 上的成员资格。
                    if (recordWithCombined.id && !combinedRecordIdRef.info!.isLinkSourceRelation()) {
                        oldOwnerMembershipChecks.push(...await this.filteredEntityManager.collectMembershipChecks(
                            newEntityData.recordName,
                            [recordWithCombined.id],
                            [combinedRecordIdRef.info!.attributeName!],
                            events
                        ))
                    }

                    // 即将随物理清列消失的旧 link（旧 combined link + 被替换的旧 merged link）的
                    // filtered relation 视图成员资格：谓词只由 SQL 求值，必须在清列之前快照。
                    const oldCombinedLinkRecord = recordWithCombined.id
                        ? recordWithCombined[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL]
                        : undefined
                    const oldCombinedLinkViewSnapshot = oldCombinedLinkRecord?.id
                        ? await this.filteredEntityManager.collectInlineDeletionSnapshot(combinedRecordIdRef.info!.linkName!, [oldCombinedLinkRecord], events)
                        : undefined
                    const oldMergedLinkViewSnapshots = new Map<string, DeletionMembershipSnapshot>()
                    if (newRecordIsLink) {
                        const stolenDataBeforeClear = recordWithCombined[combinedRecordIdRef.info?.attributeName!]
                        const stolenRecordInfoBeforeClear = this.map.getRecordInfo(combinedRecordIdRef.recordName)
                        for (const mergedAttrInfo of stolenRecordInfoBeforeClear.mergedRecordAttributes) {
                            if (mergedAttrInfo.linkName !== newEntityData.recordName) continue
                            const oldRelatedBeforeClear = stolenDataBeforeClear[mergedAttrInfo.attributeName]
                            const oldLink = oldRelatedBeforeClear?.[LINK_SYMBOL]
                            if (!oldLink?.id) continue
                            const snapshot = await this.filteredEntityManager.collectInlineDeletionSnapshot(mergedAttrInfo.linkName, [oldLink], events)
                            if (snapshot) oldMergedLinkViewSnapshots.set(mergedAttrInfo.attributeName, snapshot)
                            // 被替换的旧 merged link 消失 ⇒ 两端实体的成员资格快照（同 r21 F-2，
                            //  与上方旧业务 link 的处理同构；须在物理清列之前采集）。
                            const stolenIsSourceBeforeClear = !this.map.getLinkInfoByName(newEntityData.recordName)
                                .isRelationSource(combinedRecordIdRef.recordName, mergedAttrInfo.attributeName)
                            oldOwnerMembershipChecks.push(...await this.filteredEntityManager.collectLinkMembershipChecks(
                                mergedAttrInfo.linkName,
                                stolenIsSourceBeforeClear
                                    ? { sourceIds: [stolenDataBeforeClear.id], targetIds: [oldRelatedBeforeClear.id] }
                                    : { sourceIds: [oldRelatedBeforeClear.id], targetIds: [stolenDataBeforeClear.id] },
                                events
                            ))
                        }
                    }

                    // TODO 如果没有冲突的话，可以不用删除原来的数据。外面直接更新这一行就行了
                    //1. 删掉 combined 原来的所有同行数据
                    await this.deleteRecordSameRowData(combinedRecordIdRef.recordName, [{id: recordWithCombined[combinedRecordIdRef.info?.attributeName!].id}])

                    //2. 如果是抢夺，要记录一下事件。
                    // CAUTION 只对业务关系端点（非虚拟 link 的 source/target）发 delete 事件：
                    //  正在创建的是 link record 时，ref 的 linkName 是虚拟 link（`<relation>_source/_target`）——
                    //  storage 从不以虚拟 link 名发事件（r18 死监听不变量的对偶面），旧业务 link 的
                    //  delete 事件已由上方 newRecordIsLink 分支按业务名发出。
                    if (recordWithCombined.id && !combinedRecordIdRef.info!.isLinkSourceRelation()) {
                        events?.push({
                            type: 'delete',
                            recordName: combinedRecordIdRef.info!.linkName!,
                            record: recordWithCombined[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL],
                        })
                        if (events && oldCombinedLinkViewSnapshot) {
                            this.filteredEntityManager.settleDeletionMemberships(oldCombinedLinkViewSnapshot, combinedRecordIdRef.info!.linkName!, [oldCombinedLinkRecord!], events, events)
                        }
                    }

                    //3. merge 数据并建立新的关系。
                    assert(!result[combinedRecordIdRef.info?.attributeName!], `should not have same combined record, conflict attribute: ${combinedRecordIdRef.info?.attributeName!}`)
                    result[combinedRecordIdRef.info?.attributeName!] = {
                        ...recordWithCombined[combinedRecordIdRef.info?.attributeName!]
                    }

                    // CAUTION 当正在创建的是 merged link record（如 1:n 关系合并进 n 端的行）而被抢夺的
                    //  端点记录上已有【同一业务关系】的旧 link 时，旧 link 的列不能随行迁移：
                    //  新 link 自己会写这些列（同名列重复导致 INSERT 崩溃），语义上旧 link 也已被替换。
                    //  这里剔除旧 link 数据并补发业务 link 的 delete 事件（所有权转移的另一半事实）。
                    const newRecordInfo = this.map.getRecordInfo(newEntityData.recordName)
                    if (newRecordInfo.isRelation && this.map.data.links[newEntityData.recordName]) {
                        const stolenData = result[combinedRecordIdRef.info?.attributeName!]
                        const stolenRecordInfo = this.map.getRecordInfo(combinedRecordIdRef.recordName)
                        for (const mergedAttrInfo of stolenRecordInfo.mergedRecordAttributes) {
                            if (mergedAttrInfo.linkName !== newEntityData.recordName) continue
                            const oldRelated = stolenData[mergedAttrInfo.attributeName]
                            if (oldRelated?.id === undefined) continue
                            const oldLink = oldRelated[LINK_SYMBOL]
                            const stolenIsSource = !this.map.getLinkInfoByName(newEntityData.recordName)
                                .isRelationSource(combinedRecordIdRef.recordName, mergedAttrInfo.attributeName)
                            const oldMergedLinkRecord = {
                                ...(oldLink || {}),
                                source: stolenIsSource ? { id: stolenData.id } : { id: oldRelated.id },
                                target: stolenIsSource ? { id: oldRelated.id } : { id: stolenData.id },
                            }
                            events?.push({
                                type: 'delete',
                                recordName: newEntityData.recordName,
                                record: oldMergedLinkRecord
                            })
                            const oldMergedLinkViewSnapshot = oldMergedLinkViewSnapshots.get(mergedAttrInfo.attributeName)
                            if (events && oldMergedLinkViewSnapshot) {
                                this.filteredEntityManager.settleDeletionMemberships(oldMergedLinkViewSnapshot, newEntityData.recordName, [oldMergedLinkRecord], events, events)
                            }
                            delete stolenData[mergedAttrInfo.attributeName]
                        }
                    }
                    // 相当于新建了关系。如果不是虚拟link 就要记录。
                    // TODO 要给出一个明确的 虚拟 link  record 的差异
                    if (!combinedRecordIdRef.info!.isLinkSourceRelation()) {
                        // CAUTION 用户在 ref 上携带的 `&` 关系属性必须落到新 link 上：
                        //  flashOut 的返回值会整体覆盖 rawData 里的该属性（浅 merge），此前只放 id，
                        //  用户的 `&` 数据在 combined 拓扑的 replace-by-ref 路径被静默丢弃
                        //  （拓扑矩阵 step-3 强化断言发现，r17 追加）。被抢夺行的旧 link 属性
                        //  刻意不带过来——replace 语义下新 link 的属性只来自本次声明。
                        // CAUTION 事件 payload 必须携带 source/target 端点（与 preprocessSameRowData
                        //  的 link create 事件同一契约）：按端点模式匹配的下游（StateMachine trigger、
                        //  Transform eventDeps）此前对 flashOut 产生的 link create "查询可见、事件不可见"。
                        const stolenRelatedRef = { id: combinedRecordIdRef.getRef().id }
                        const newOwnerRef = { id: newOwnerId ?? newEntityData.getData().id }
                        result[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL] = {
                            ...(combinedRecordIdRef.linkRecordData?.getData() || {}),
                            id: await this.database.getAutoId(combinedRecordIdRef.info!.linkName!),
                        }
                        // CAUTION base link create 事件必须补齐 default-only 字段
                        //  （r25 F-1，与 preprocessSameRowData 的行内产生点同一契约）：
                        //  按 default-only link 属性做匹配的下游（records match / trigger）
                        //  此前对 flashOut 产生的 link create 失明。
                        const newLinkRecord = NewRecordData.completeEventPayloadWithDefaults(this.map, combinedRecordIdRef.info!.linkName!, {
                            ...result[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL],
                            [combinedRecordIdRef.info!.isRecordSource() ? 'source' : 'target']: newOwnerRef,
                            [combinedRecordIdRef.info!.isRecordSource() ? 'target' : 'source']: stolenRelatedRef,
                        })
                        events?.push({
                            type: 'create',
                            recordName: combinedRecordIdRef.info!.linkName,
                            record: newLinkRecord
                        })
                        // 新 link 的 filtered relation 视图成员资格在物理写入完成后求值（settlePostWriteChecks）。
                        this.filteredEntityManager.enqueuePostWriteCreationCheck(
                            events,
                            combinedRecordIdRef.info!.linkName!,
                            newLinkRecord.id,
                            newLinkRecord
                        )
                    }
                }
            }
        }

        // 物理清列完成后统一结算旧 owner 的成员资格：退出 filtered 视图的 owner 产生 delete 事件。
        await this.filteredEntityManager.settleMembershipChecks(oldOwnerMembershipChecks, events)

        return result
    }

    /**
     * 重定位合并记录数据用于链接
     * 用于 unlink 场景中处理合并记录的数据迁移
     *
     * CAUTION 事件语义（tests/storage/combinedRecordEvents.spec.ts 固化）：
     *  「删旧行 + 插新行」是**物理行搬迁**——被搬迁实体的逻辑身份（id）全程不变，
     *  所以刻意不产生实体级 delete/create 事件；事件流只反映 link delete 这一业务事实。
     *  注意该路径只对非 reliance 的 combined link 可达（reliance unlink 是业务级 fail-fast），
     *  即目前只有 DBSetup 的 mergeLinks 配置能触达。
     */
    async relocateCombinedRecordDataForLink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, events?: RecordMutationEvent[]): Promise<Record[]> {
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(linkName, this.map, true, true, true, true)
        const moveAttribute = moveSource ? 'source' : 'target'

        const records = await this.queryExecutor.findRecords(RecordQuery.create(linkName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: attributeQuery
        }), `finding combined records for relocate ${linkName}.${moveAttribute}`, undefined)

        // 关系（combined link）即将解除：先采集两端实体的成员资格快照（无状态 membership diff）。
        const linkChecks = await this.filteredEntityManager.collectLinkMembershipChecks(linkName, {
            sourceIds: records.map(r => r.source?.id),
            targetIds: records.map(r => r.target?.id)
        }, events)
        // link 自身的 filtered relation 视图成员资格也要在行还活着时快照（下面先物理搬迁再 push 事件）。
        const linkViewSnapshot = await this.filteredEntityManager.collectInlineDeletionSnapshot(linkName, records, events)

        const toMoveRecordInfo = this.map.getLinkInfoByName(linkName)[moveSource ? 'sourceRecordInfo' : 'targetRecordInfo']

        // 1. 把这些数据删除，在下面重新插入到新行
        await this.deleteRecordSameRowData(toMoveRecordInfo.name, records.map(r => r[moveAttribute]))

        // 2. 重新插入到新行
        for (let record of records) {
            const toMoveRecordData = new NewRecordData(this.map, toMoveRecordInfo.name, record[moveAttribute])
            await this.creationExecutor.insertSameRowData(toMoveRecordData, undefined)

            // 3. 增加 delete 关系的事件（base link 之后紧跟其 filtered relation 视图的 delete）
            events?.push({
                type: 'delete',
                recordName: linkName,
                record: record
            })
            if (events && linkViewSnapshot) {
                this.filteredEntityManager.settleDeletionMemberships(linkViewSnapshot, linkName, [record], events, events)
            }
        }

        // 4. 关系解除后的成员资格结算
        await this.filteredEntityManager.settleMembershipChecks(linkChecks, events)

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


    // 委托给 DeletionExecutor。
    // CAUTION 关系解除对成员资格的影响统一在 link record 的删除路径内处理
    //  （DeletionExecutor.deleteRecord 与 relocateCombinedRecordDataForLink 的 before 快照 + settle diff），
    //  这样显式 unlink、删除关联实体引发的关系删除等所有路径共用同一套钩子。
    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?: RecordMutationEvent[]): Promise<Record[]> {
        return this.deletionExecutor.unlink(linkName, matchExpressionData, moveSource, reason, events)
    }

    /**
     * 查找树形结构的两个数据间的 path - 委托给 QueryExecutor
     */
    async findPath(recordName: string, attributePathStr: string, startRecordId: string, endRecordId: string): Promise<Record[] | undefined> {
        return this.queryExecutor.findPath(recordName, attributePathStr, startRecordId, endRecordId)
    }

}
