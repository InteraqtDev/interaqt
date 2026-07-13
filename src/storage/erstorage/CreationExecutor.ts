import { EntityIdRef, Database, RecordMutationEvent, ROW_ID_ATTR } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData, MatchAtom } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { assert } from "../utils.js";
import { SQLBuilder } from "./SQLBuilder.js";
import { FilteredEntityManager, MembershipCheck } from "./FilteredEntityManager.js";
import type { Record, RecordOperationAgent } from "./RecordQueryAgent.js";
import type { QueryExecutor } from "./QueryExecutor.js";

/**
 * CreationExecutor - 创建操作执行器
 * 
 * 职责：
 * 1. 记录创建（entity/relation）
 * 2. 依赖处理（dependency resolution）
 * 3. 关系建立（link creation）
 * 4. 同行数据管理（same-row data handling）
 * 5. 合并记录处理（combined records）
 * 6. 创建事件生成（creation events）
 */
export class CreationExecutor {
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
     * 创建记录依赖
     * 处理往自身合并的需要新建的关系和 record
     */
    async createRecordDependency(newRecordData: NewRecordData, events?: RecordMutationEvent[]): Promise<NewRecordData> {
        const newRecordDataWithDeps: { [k: string]: EntityIdRef } = {}
        // 处理往自身合并的需要新建的关系和 record
        for (let mergedLinkTargetRecord of newRecordData.mergedLinkTargetNewRecords.concat(newRecordData.mergedLinkTargetRecordIdRefs)) {
            let newDepIdRef
            if (!mergedLinkTargetRecord.isRef()) {
                newDepIdRef = await this.createRecord(mergedLinkTargetRecord, `create merged link dep record ${newRecordData.recordName}.${mergedLinkTargetRecord.info?.attributeName}`, events)
            } else {
                newDepIdRef = mergedLinkTargetRecord.getRef()
            }
            newRecordDataWithDeps[mergedLinkTargetRecord.info!.attributeName] = newDepIdRef

            if (mergedLinkTargetRecord.linkRecordData) {
                // 为 link 也要把 dependency 准备好。
                // CAUTION link 的端点必须是全新的 {id} 对象，不能复用 newDepIdRef：
                //  下面 deps[attr][LINK_SYMBOL] 会把 link 数据挂回 newDepIdRef 自身，
                //  复用会形成 deps[attr]['&'].target === deps[attr] 的环引用——
                //  任何对 rawData 的 JSON.stringify（日志、事件序列化）都会当场崩溃。
                const newLinkRecordData = mergedLinkTargetRecord.linkRecordData.merge({
                    [mergedLinkTargetRecord.info!.isRecordSource() ? 'target' : 'source']: { id: newDepIdRef.id }
                })
                // 所有 Link dep 也准备好了。
                // CAUTION events 必须透传：link 数据（`&`）自身携带的嵌套新记录会在这条递归里
                //  createRecord，漏传 events 会让这些记录的 create 事件与 filtered 成员资格钩子
                //  静默缺失（combined 路径一直透传，此处是漏项）。
                const newLinkRecordDataWithDep = await this.createRecordDependency(newLinkRecordData, events)

                newRecordDataWithDeps[mergedLinkTargetRecord.info!.attributeName][LINK_SYMBOL] = newLinkRecordDataWithDep.getData()
            }
        }

        // 处理和我三表合一的 link record 的 dependency
        for (let combinedRecord of newRecordData.combinedNewRecords.concat(newRecordData.combinedRecordIdRefs)) {
            if (combinedRecord.linkRecordData) {
                const newLinkRecordDataWithDep = await this.createRecordDependency(combinedRecord.linkRecordData, events)
                newRecordDataWithDeps[combinedRecord.info!.attributeName!] = {
                    // 注意这里原本的数据不能丢，因为下面的 merge 不是深度 merge。
                    ...combinedRecord.getData() as EntityIdRef,
                    [LINK_SYMBOL]: newLinkRecordDataWithDep.getData()
                }
            }
        }

        // 返回准备好 link 数据和准备好 record 数据的新 newRecordData
        return newRecordData.merge(newRecordDataWithDeps)
    }

    /**
     * 创建记录（主入口）
     */
    async createRecord(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        // CAUTION merged entity/relation 是抽象联合类型：以它（或以它为 base 的 filtered item）的
        //  名义创建记录无法确定具体的 __type 判别值，必须显式报错（explicit control）。
        //  只拦截 createRecord 入口：flash-out/relocate 等对既有记录的行迁移走 insertSameRowData，不受影响。
        const originalRecordInfo = this.map.getRecordInfo(newEntityData.originalRecordName)
        if (originalRecordInfo.isMergedAbstract) {
            throw new Error(
                `cannot create record of merged (union) type "${newEntityData.originalRecordName}" directly. ` +
                `A merged entity/relation is an abstract union type; create the record through one of its input types instead.`
            )
        }

        const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)

        // CAUTION 1:1 关系两侧都是排他的。merged link（FK 列在宿主行上）引用一个已被其他宿主
        //  占用的既有记录时，旧宿主行的 FK 不会被本次 INSERT 触碰——必须先显式解除旧 owner 的
        //  link（清 FK 列 + delete 事件），否则两行同指一个目标，正反查询自相矛盾（r17 F-1）。
        //  对照：combined（三表合一）的抢夺由 flashOut 处理；isolated x:1 在 handleCreationReliance
        //  与 addLink 中处理。新建的关联记录不可能有旧 owner，只有 id ref 需要。
        await this.unlinkOldOwnersOfExclusiveTargets(newEntityDataWithDep, events)

        // CAUTION 成员资格快照必须在物理变更之前采集（见 FilteredEntityManager 的无状态设计）。
        //  1) link record 的创建会改变两端实体在依赖该关系的 filtered entity 中的成员资格；
        //  2) 合并进本行的既有关联记录（merged link / combined 的 id ref）等价于对既有记录追加关系，
        //     同样会改变"另一端"记录的成员资格。
        const linkChecks = await this.collectCreationLinkChecks(newEntityDataWithDep, events)

        const newRecordIdRef = await this.insertSameRowData(newEntityDataWithDep, queryName, events)

        const relianceResult = await this.handleCreationReliance(newEntityDataWithDep.merge(newRecordIdRef), events)

        // 合并所有数据以获得完整的记录
        const fullRecord = Object.assign({}, newEntityData.getData(), newRecordIdRef, relianceResult);

        // 关系两端既有记录的成员资格结算（diff 产生 create/delete 事件）
        await this.filteredEntityManager.settleMembershipChecks(linkChecks, events)
        // 新记录自身的成员资格：满足谓词即产生 filtered entity 的 create 事件。
        // CAUTION 事件 payload 必须与 base create 事件同一契约（defaults + payload，见
        //  preprocessSameRowData）：漏掉 defaultValues 会让 filtered/merged 视图的 create 事件
        //  缺 __type 判别列与仅有默认值的字段——按这些字段做模式匹配的下游（StateMachine trigger、
        //  Transform eventDeps）对同一条记录"查询可见、事件不可见"。insert 返回值里的内部
        //  ROW_ID_ATTR 不属于 API 面，一并剔除。
        const membershipEventPayload = Object.assign({}, newEntityDataWithDep.defaultValues, fullRecord)
        delete membershipEventPayload[ROW_ID_ATTR]
        await this.filteredEntityManager.handleRecordCreation(newEntityData.recordName, newRecordIdRef.id, membershipEventPayload, events)

        // 更新 relianceResult 的信息
        return Object.assign(newRecordIdRef, relianceResult)
    }

    /**
     * 采集本次创建涉及的"既有记录端"成员资格快照：
     * - 自身是 link record：source/target 两端；
     * - 关系合并进本行（merged link）或三表合一（combined）的既有关联记录：另一端就是这些既有记录。
     * 新建的关联记录不需要采集——它们各自的 createRecord 调用会处理自己的成员资格。
     */
    private async collectCreationLinkChecks(newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<MembershipCheck[]> {
        if (!events) return []
        const checks: MembershipCheck[] = []

        const recordInfo = this.map.getRecordInfo(newEntityData.recordName)
        if (recordInfo.isRelation && this.map.data.links[newEntityData.recordName]) {
            const rawData = newEntityData.getData()
            checks.push(...await this.filteredEntityManager.collectLinkMembershipChecks(
                newEntityData.recordName,
                { sourceIds: [rawData.source?.id], targetIds: [rawData.target?.id] },
                events
            ))
        }

        for (const relatedRecord of newEntityData.mergedLinkTargetRecordIdRefs.concat(newEntityData.combinedRecordIdRefs)) {
            const relatedId = relatedRecord.getRef().id
            const linkName = relatedRecord.info!.linkName
            // 关联既有记录位于关系的哪一端：parent 是 source 时它是 target，反之亦然。
            const relatedIsTarget = relatedRecord.info!.isRecordSource()
            checks.push(...await this.filteredEntityManager.collectLinkMembershipChecks(
                linkName,
                relatedIsTarget ? { targetIds: [relatedId] } : { sourceIds: [relatedId] },
                events
            ))
        }
        return checks
    }

    /**
     * 解除「排他侧被占用」的旧 link：1:1 关系两侧都是排他的。
     * merged link（FK 列在宿主行上）通过 id ref 引用一个已被其他宿主占用的记录时，
     * 旧宿主行的 FK 不在本次写入的行上，必须显式 unlink（清列 + delete 事件）。
     * @param currentRecord update 场景传入当前宿主——同 id 原地引用（目标本来就是我的）绝不能解除。
     */
    async unlinkOldOwnersOfExclusiveTargets(newEntityData: NewRecordData, events?: RecordMutationEvent[], currentRecord?: Record) {
        for (const record of newEntityData.mergedLinkTargetRecordIdRefs) {
            const linkInfo = record.info!.getLinkInfo()
            if (!linkInfo.isOneToOne) continue
            // reliance 是生命周期依赖，unlink 是业务级 fail-fast（只能随 record 删除）；
            // "抢夺" 语义不适用，保持既有行为。
            if (linkInfo.isTargetReliance) continue
            const attributeName = record.info!.attributeName
            const refId = record.getRef().id
            if (currentRecord && currentRecord[attributeName]?.id === refId) continue
            // FK 侧（宿主自己的旧值）由写入自身替换/上层 unlink 处理；这里解除的是"目标记录的旧 owner"。
            const otherSideAttr = record.info!.isRecordSource() ? 'target' : 'source'
            await this.agent.unlink(
                linkInfo.name,
                MatchExp.atom({ key: `${otherSideAttr}.id`, value: ['=', refId] }),
                false,
                `unlink old owner of exclusive 1:1 target ${newEntityData.recordName}.${attributeName}`,
                events
            )
        }
    }

    /**
     * 构造同行数据的 update 事件（宿主记录 / combined 嵌套记录 / link 记录共用同一契约）：
     * keys = 本次实际写入的属性名（含被联动重算的 computed 属性），record 带 id，oldRecord 为变更前快照。
     */
    private buildSameRowUpdateEvent(newData: NewRecordData, recordName: string, oldRecord: Record): RecordMutationEvent | null {
        const updatedFieldValues = newData.getSameRowFieldAndValue(oldRecord)
        const recordInfo = this.map.getRecordInfo(recordName)
        const valueAttributeNames = new Set(recordInfo.valueAttributes.map(attr => attr.attributeName))
        const updateRecord = { ...newData.getData() } as Record
        const updatedKeys: string[] = []
        updatedFieldValues.forEach(field => {
            // id 是身份不是值变更：同 id ref（{id} 裸引用）不构成 update 事件（幂等重写必须静默）。
            if (field.name !== 'id' && valueAttributeNames.has(field.name)) {
                updateRecord[field.name] = field.value
                updatedKeys.push(field.name)
            }
        })
        if (!updatedKeys.length) return null
        return {
            type: 'update',
            recordName,
            // keys 是本次实际写入的属性名（含被联动重算的 computed 属性）。
            //  StateTransfer.trigger.keys 等字段级匹配依赖它。
            keys: updatedKeys,
            record: { ...updateRecord, id: oldRecord.id },
            oldRecord
        }
    }

    /**
     * 预处理同行数据
     * CAUTION 因为这里分配了 id，并且所有的判断逻辑都在，所以事件也放在这里处理，而不是真实插入或者更新数据的时候。
     */
    async preprocessSameRowData(newEntityData: NewRecordData, isUpdate = false, events?: RecordMutationEvent[], oldRecord?: Record): Promise<NewRecordData> {
        const newRawDataWithNewIds = newEntityData.getData()
        // CAUTION 特别注意，我们是支持数据使用 外部  id，例如使用外部用户系统的时候，它的  id 就是外部分配的。
        //  还有一种情况是 relocate record 的时候也用了这个函数，这个时候也是不要重新分配 id 的！
        //  也正是因为如此，所以我们通过一个参数 isUpdate 显式声明到底是不是 update，不能用有没有 id 来判断！
        if (!isUpdate && !newRawDataWithNewIds.id) {
            // 为自己分配 id，一定要在最前面，因为后面记录link 事件的地方一定要有 target/source 的 id
            newRawDataWithNewIds.id = await this.database.getAutoId(newEntityData.recordName)
        } else if(isUpdate && !newRawDataWithNewIds.id) {
            // 因为用户传进来的 update 字段里面可能没有 id 字段，所以这里要加上。
            // newRawDataWithNewIds 用在了后面的 event 里面，保证有 id 才正确。外部可能会从 event 里面读。
            newRawDataWithNewIds.id = oldRecord!.id
        }

        if (!isUpdate) {
            events?.push({
                type: 'create',
                recordName: newEntityData.recordName,
                record: {
                    ...newEntityData.defaultValues,
                    ...newRawDataWithNewIds
                }
            })
        } else {
            // 可能只是更新关系，所以这里一定要有自身的 value 才算是 update 自己
            if (newEntityData.valueAttributes.length) {
                const updateEvent = this.buildSameRowUpdateEvent(newEntityData, newEntityData.recordName, oldRecord!)
                if (updateEvent) events?.push(updateEvent)
            }
            // CAUTION 同 id 原地更新（related id 未变）时，下方的 link-id 分配循环按「id 是否变化」
            //  判断，不会生成任何事件；但 getSameRowFieldAndValue 会把 `&` 关系属性与 combined 记录的
            //  嵌套值无条件写入同行列——「数据面已写、事件面沉默」会让依赖这些属性的响应式计算
            //  永久陈旧（r17 F-2）。这里对同 id 且携带新值的引用补发 update 事件，
            //  契约与宿主 update 事件一致（keys = 实际写入的属性名，含 oldRecord）。
            //  以这些 link/combined 记录为 base 的 filtered 视图成员资格随之变化：before 快照
            //  此刻采集（行还活着），diff 在物理写入完成后统一结算（settlePostWriteChecks）。
            for (const record of newEntityData.mergedLinkTargetRecordIdRefs.concat(newEntityData.combinedRecordIdRefs)) {
                const attributeName = record.info!.attributeName
                const oldRelated = oldRecord?.[attributeName]
                if (!oldRelated?.id || newRawDataWithNewIds[attributeName]?.id !== oldRelated.id) continue

                // combined（三表合一）记录自身的嵌套值更新
                if (record.info!.isMergedWithParent() && record.valueAttributes.length) {
                    const nestedEvent = this.buildSameRowUpdateEvent(record, record.recordName, oldRelated)
                    if (nestedEvent) {
                        events?.push(nestedEvent)
                        await this.filteredEntityManager.enqueuePostWriteUpdateCheck(events, record.recordName, oldRelated.id, nestedEvent.keys!)
                    }
                }
                // `&` 关系属性的原地更新（merged link 与 combined 的 link 数据都写在同行）
                if (record.linkRecordData?.valueAttributes.length && oldRelated[LINK_SYMBOL]?.id) {
                    const linkEvent = this.buildSameRowUpdateEvent(record.linkRecordData, record.info!.linkName, oldRelated[LINK_SYMBOL])
                    if (linkEvent) {
                        events?.push(linkEvent)
                        await this.filteredEntityManager.enqueuePostWriteUpdateCheck(events, record.info!.linkName, oldRelated[LINK_SYMBOL].id, linkEvent.keys!)
                    }
                }
            }
        }

        // 1. 先为三表合一的新数据分配 id
        for (let record of newEntityData.combinedNewRecords) {
            newRawDataWithNewIds[record.info!.attributeName] = {
                ...newRawDataWithNewIds[record.info!.attributeName],
                id: await this.database.getAutoId(record.info!.recordName!),
            }
            // CAUTION create 事件 payload 契约 = defaults + payload（r16 R-1）——base 名事件与
            //  filtered 视图事件是同一契约的两个消费方，统一走 completeEventPayloadWithDefaults
            //  补齐 default-only 字段。此前 base 事件裸用 payload：records match 的本地求值把
            //  缺席的普通值属性按 NULL 解读（快照完备性契约，r21 F-1）、StateMachine trigger /
            //  Transform eventDeps 深度匹配失明——「谓词/匹配字段仅有默认值」形态下游静默
            //  少计/不触发（r25 F-1）。
            const combinedCreatePayload = NewRecordData.completeEventPayloadWithDefaults(
                this.map, record.recordName, newRawDataWithNewIds[record.info!.attributeName]
            )
            events?.push({
                type: 'create',
                recordName: record.recordName,
                record: combinedCreatePayload
            })
            // combined 记录不经过 createRecord（数据落在宿主行），其 filtered entity 视图的
            // create 事件在物理写入完成后求值（payload 契约与 base 事件一致）。
            this.filteredEntityManager.enqueuePostWriteCreationCheck(
                events,
                record.recordName,
                newRawDataWithNewIds[record.info!.attributeName].id,
                combinedCreatePayload
            )
        }

        // 2. 为我要新建 三表合一、或者我 mergedLink 的 的 关系 record 分配 id.
        for (let record of newEntityData.mergedLinkTargetNewRecords.concat(newEntityData.mergedLinkTargetRecordIdRefs, newEntityData.combinedNewRecords)) {
            if (newRawDataWithNewIds[record.info!.attributeName].id !== oldRecord?.[record.info!.attributeName]?.id) {
                newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL] = {
                    ...(newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL] || {}),
                    id: await this.database.getAutoId(record.info!.linkName!),
                }

                const linkRecord = {...newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL]}
                // CAUTION 端点必须取 newRawDataWithNewIds 上的容器对象（r25 F-1 端点子格）：
                //  combined 嵌套新建的 id 在步骤 1 分配给了**替换后的容器**，record.getData()
                //  返回的是替换前的原始 rawData——端点缺 id，按端点定位的下游
                //  （computeTarget(event.record.target.id) 等）拿到 undefined。
                linkRecord[record.info!.isRecordSource() ? 'target' : 'source'] = {...newRawDataWithNewIds[record.info!.attributeName]}
                linkRecord[record.info!.isRecordSource() ? 'source' : 'target'] = {...newRawDataWithNewIds}
                delete linkRecord.target[LINK_SYMBOL]
                delete linkRecord.source[LINK_SYMBOL]

                // CAUTION base link create 事件必须补齐 default-only 字段（r25 F-1，契约同上方
                //  combined 记录）：用户不给 `&` 时 linkRecordData 不存在，此前 payload 只有端点
                //  与显式 link 数据——按 default-only link 属性做匹配的下游全部失明。
                const linkCreatePayload = NewRecordData.completeEventPayloadWithDefaults(
                    this.map, record.info!.linkName, linkRecord
                )
                events?.push({
                    type: 'create',
                    recordName: record.info!.linkName,
                    record: linkCreatePayload
                })
                // 行内（merged/combined）link 不经过 createRecord，其 filtered relation 视图的
                // create 事件在物理写入完成后求值（settlePostWriteChecks）。
                this.filteredEntityManager.enqueuePostWriteCreationCheck(
                    events,
                    record.info!.linkName,
                    linkRecord.id,
                    linkCreatePayload
                )
            }
        }

        // FIXME 如果不同，才需要 merge。现在不知道为什么 relation 和 source 记录上出现了个 & 关系数据。
        const newEntityDataWithIds = newEntityData.merge(newRawDataWithNewIds)

        // 2. 处理需要 flashOut 的数据
        // TODO create 的情况下，有没可能不需要 flashout 已有的数据，直接更新到已有的 combined record 的行就行了。
        // CAUTION update 中同 id 的 combined 引用是「原地更新」不是「抢夺」：数据已在本行，
        //  绝不能 flashOut——flashOut 数据在 merge 时会覆盖用户的新值（旧值静默写回，r17 F-2 家族）。
        const sameRowInPlaceAttributes = new Set<string>()
        if (isUpdate && oldRecord) {
            for (const record of newEntityData.combinedRecordIdRefs) {
                const attributeName = record.info!.attributeName
                if (oldRecord[attributeName]?.id !== undefined && oldRecord[attributeName].id === record.getRef().id) {
                    sameRowInPlaceAttributes.add(attributeName)
                }
            }
        }
        const flashOutRecordRasData: { [k: string]: RawEntityData } = await this.agent.flashOutCombinedRecordsAndMergedLinks(
            newEntityData,
            events,
            `finding combined records for ${newEntityData.recordName} to flash out, for ${isUpdate ? 'updating' : 'creation'} with data ${JSON.stringify(newEntityDataWithIds.getData())}`,
            sameRowInPlaceAttributes,
            newRawDataWithNewIds.id
        )

        return newEntityDataWithIds.merge(flashOutRecordRasData)
    }

    /**
     * 插入同行数据
     */
    async insertSameRowData(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        // 由于我们可以抢夺别人的关联实体，所以会产生一个 unlink 事件，所以 events 要传进去。
        const newEntityDataWithIdsWithFlashOutRecords = await this.preprocessSameRowData(newEntityData, false, events)
        // 3. 插入新行。
        const sameRowNewFieldAndValue = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue()
        const [sql, params] = this.sqlBuilder.buildInsertSQL(newEntityData.recordName, sameRowNewFieldAndValue)
        const result = await this.database.insert(sql, params, queryName) as EntityIdRef

        // 物理写入完成：结算 preprocess/flashOut 登记的行内视图成员资格任务
        // （merged link / combined 记录的 filtered 视图 create/update 事件）。
        await this.filteredEntityManager.settlePostWriteChecks(events)

        return Object.assign(result, newEntityDataWithIdsWithFlashOutRecords.getData())
    }

    /**
     * 处理创建时的关联关系
     */
    async handleCreationReliance(newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<object> {
        const currentIdRef = newEntityData.getRef()
        const newIdRefs: { [k: string]: EntityIdRef | EntityIdRef[] } = {}
        // 1. 处理关系往 attribute 方向合并的新数据
        for (let record of newEntityData.differentTableMergedLinkNewRecords) {
            const reverseAttribute = record.info?.getReverseInfo()?.attributeName!
            const newRecordDataWithMyId = record.merge({
                [reverseAttribute]: currentIdRef
            })
            const newRecordIdRef = await this.createRecord(newRecordDataWithMyId, `create record ${newEntityData.recordName}.${record.info?.attributeName}`, events)
            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newRecordIdRef[reverseAttribute][LINK_SYMBOL]
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newRecordIdRef[reverseAttribute][LINK_SYMBOL]
                }
            }
        }

        // 2. 处理关系往 attribute 方向合并的老数据
        for (let record of newEntityData.differentTableMergedLinkRecordIdRefs) {
            const reverseInfo = record.info!.getReverseInfo()!
            const idMatch = MatchExp.atom({
                key: 'id',
                value: ['=', record.getRef().id]
            })
            // CAUTION `&` 关系属性必须挂在反向 attribute 的值上（NewRecordData 会把它解析成
            //  该 attribute 的 linkRecordData 并写入合并进关联记录行的 link 列）。
            //  挂在实体记录的顶层会让 NewRecordData 试图以 info?.linkName === undefined
            //  解析 link 数据，直接崩溃（"entity undefined not found"）。
            const linkData = record.getData()[LINK_SYMBOL]
            const newData = {
                [reverseInfo!.attributeName]: linkData === undefined
                    ? currentIdRef
                    : { ...currentIdRef, [LINK_SYMBOL]: linkData }
            }
            const [updatedRecord] = await this.agent.updateRecord(reverseInfo.parentEntityName, idMatch, new NewRecordData(this.map, reverseInfo.parentEntityName, newData), events)
            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...updatedRecord,
                    [LINK_SYMBOL]: updatedRecord[reverseInfo!.attributeName][LINK_SYMBOL]
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...updatedRecord,
                    [LINK_SYMBOL]: updatedRecord[reverseInfo!.attributeName][LINK_SYMBOL]
                }
            }
        }

        // 3. 处理完全独立的新数据和关系
        for (let record of newEntityData.isolatedNewRecords) {
            const newRecordIdRef = await this.createRecord(record, `create isolated related record ${newEntityData.recordName}.${record.info?.attributeName}`, events)


            const linkRawData: RawEntityData = record.linkRecordData?.getData() || {}
            Object.assign(linkRawData, {
                source: record.info!.isRecordSource() ? currentIdRef : newRecordIdRef,
                target: record.info!.isRecordSource() ? newRecordIdRef : currentIdRef
            })
            const newLinkData = new NewRecordData(this.map, record.info!.linkName, linkRawData)
            const newLinkRecord = await this.createRecord(newLinkData, `create isolated related link record ${newEntityData.recordName}.${record.info?.attributeName}`, events)

            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newLinkRecord
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newLinkRecord
                }
            }
        }

        // 4. 处理完全独立的老数据和的关系。
        for (let key in newEntityData.isolatedRecordIdRefs) {
            const record = newEntityData.isolatedRecordIdRefs[key]
            // 针对 x:1 关系要先删除原来的关系
            if (record.info!.isXToOne) {
                const match = MatchExp.atom({
                    key: record.info?.isRecordSource() ? 'target.id' : 'source.id',
                    value: ['=', record.getRef().id]
                })
                // 这里需要调用 RecordQueryAgent 的 unlink 方法
                await this.agent.unlink(record.info!.linkName, match, false, 'unlink xToOne old link', events)
            }
            const linkRawData: RawEntityData = record.linkRecordData?.getData() || {}
            Object.assign(linkRawData, {
                source: record.info!.isRecordSource() ? currentIdRef : record.getRef(),
                target: record.info!.isRecordSource() ? record.getRef() : currentIdRef
            })
            const newLinkData = new NewRecordData(this.map, record.info!.linkName, linkRawData)
            const newLinkRecord = await this.createRecord(newLinkData, `create isolated related link record of old related ${newEntityData.recordName}.${record.info?.attributeName}`, events)

            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                (newIdRefs[record.info!.attributeName] as Record[])![key] = {
                    ...record.getData(),
                    [LINK_SYMBOL]: newLinkRecord
                }
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...record.getData(),
                    [LINK_SYMBOL]: newLinkRecord
                }
            }
        }

        return newIdRefs
    }

    /**
     * 从记录添加链接
     */
    addLinkFromRecord(entity: string, attribute: string, entityId: string, relatedEntityId: string, attributes: RawEntityData = {}, events?: RecordMutationEvent[]) {
        const linkInfo = this.map.getLinkInfo(entity, attribute)
        const isEntitySource = linkInfo.isRelationSource(entity, attribute)

        const sourceId = isEntitySource ? entityId : relatedEntityId
        const targetId = isEntitySource ? relatedEntityId : entityId

        return this.addLink(linkInfo.name, sourceId, targetId, attributes, !linkInfo.isRelationSource(entity, attribute), events)
    }

    /**
     * 添加链接
     */
    async addLink(linkName: string, sourceId: string, targetId: string, attributes: RawEntityData = {}, moveSource = false, events?: RecordMutationEvent[]) {
        const existRecord = (await this.queryExecutor.findRecords(RecordQuery.create(linkName, this.map, {
            matchExpression: MatchExp.atom({key: 'source.id', value: ['=', sourceId]}).and({
                key: 'target.id',
                value: ['=', targetId]
            }),
            modifier: {
                limit: 1
            }
        }), `check if link exist for add link ${linkName}`, undefined))[0]

        assert(!existRecord, `cannot create ${linkName} for ${sourceId} ${targetId}, link already exist`)

        const linkInfo = this.map.getLinkInfoByName(linkName)
        // CAUTION x:1 关系的排他侧在建立新 link 前必须解除旧 link（r17 F-1）：
        //  - isolated：n:1 源侧、1:n 目标侧、1:1 双侧排他，全部显式 unlink；
        //  - merged（FK 列在某端行上）：FK 侧的替换由 flashOut 处理（含旧 link delete 事件），
        //    但 1:1 的非 FK 侧（旧 owner 是另一行）flashOut 看不见，必须显式 unlink；
        //  - combined：整行抢夺由 flashOut 处理。
        // reliance（生命周期依赖）的 unlink 是业务级 fail-fast，抢夺语义不适用。
        if (!linkInfo.isCombined() && !linkInfo.isTargetReliance) {
            if (!linkInfo.isMerged()) {
                if (linkInfo.isManyToOne || linkInfo.isOneToOne) {
                    await this.agent.unlink(linkName, MatchExp.atom({ key: 'source.id', value: ['=', sourceId] }), false, 'unlink old link of exclusive source for add new link', events)
                }
                if (linkInfo.isOneToMany || linkInfo.isOneToOne) {
                    await this.agent.unlink(linkName, MatchExp.atom({ key: 'target.id', value: ['=', targetId] }), false, 'unlink old link of exclusive target for add new link', events)
                }
            } else if (linkInfo.isOneToOne) {
                const nonFkSide = linkInfo.isMergedToSource() ? 'target' : 'source'
                const nonFkSideId = nonFkSide === 'target' ? targetId : sourceId
                await this.agent.unlink(linkName, MatchExp.atom({ key: `${nonFkSide}.id`, value: ['=', nonFkSideId] }), false, 'unlink old owner of exclusive 1:1 target for add new link', events)
            }
        }

        const newLinkData = new NewRecordData(this.map, linkInfo.name, {
            source: {id: sourceId},
            target: {id: targetId},
            ...attributes
        })

        // CAUTION 关系建立对成员资格的影响统一由 createRecord 内的 link 钩子处理（before 快照 + settle diff），
        //  这样 addLink、addLinkFromRecord、以及创建/更新流程中内部生成的 link record 都走同一条路径。
        return this.createRecord(newLinkData, `create link record ${linkInfo.name}`, events)
    }

    /**
     * 删除记录的同行数据（用于 flashOut）
     * 这是一个辅助方法，实际的删除逻辑在 RecordQueryAgent 中
     */
}

