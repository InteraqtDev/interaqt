import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { SQLBuilder } from "./SQLBuilder.js";
import { sameRecordId } from "../utils.js";
import { FilteredEntityManager, MembershipCheck } from "./FilteredEntityManager.js";
import type { Record, RecordOperationAgent } from "./RecordQueryAgent.js";

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
        // CAUTION executor 之间的互相回调通过 RecordOperationAgent 显式契约进行（见 RecordQueryAgent）。
        private agent: RecordOperationAgent
    ) {
        this.sqlBuilder = sqlBuilder
        this.filteredEntityManager = filteredEntityManager
    }

    /**
     * 更新记录（主入口）
     */
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<Record[]> {
        // 现在支持在 update 字段的同时，使用 null 来删除关系
        // CAUTION 前置查询按需裁剪：
        //  - 值属性全部保留：update 事件的 oldRecord、computed 属性重算、增量计算都依赖旧值。
        //  - 关系记录（reliance/合表/合并 link）只保留本次 update 实际涉及的 attribute：
        //    unlink 判断和 flash-out 只会用到 newEntityData 里出现的关系，其余的递归 JOIN 纯属浪费。
        //  - link record 自身的 source/target（managedRecordAttributes）始终保留，它们是同行字段，代价极小。
        // 深度契约（见 getAttributeQueryDataForRecord 头注）：update 前态快照 = 最大深度
        //  （事件 oldRecord 完备性 + flashOut 同 id 判定都从这份快照读）。
        const fullAttributeQuery = AttributeQuery.getAttributeQueryDataForRecord(entityName, this.map,
            /* includeSameTableReliance */ true, /* includeMergedRecordAttribute */ true,
            /* includeManagedRecordAttributes */ true, /* includeNotRelianceCombined */ true)
        const recordInfo = this.map.getRecordInfo(this.map.getRecordInfo(entityName).resolvedBaseRecordName!)
        const involvedRecordAttributes = new Set(Object.keys(newEntityData.getData() || {}))
        recordInfo.managedRecordAttributes.forEach(info => involvedRecordAttributes.add(info.attributeName))
        const trimmedAttributeQuery = fullAttributeQuery.filter(item =>
            typeof item === 'string' || involvedRecordAttributes.has(item[0])
        )

        const updateRecordQuery = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: trimmedAttributeQuery
        })
        
        const matchedEntities = await this.agent.findRecords(updateRecordQuery, `find record for updating ${entityName}`)
        // 注意下面使用的都是 updateRecordQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        const payloadFields = Object.keys(newEntityData.getData())
        const isLinkRecord = !!this.map.data.links[newEntityData.recordName]
        const result: Record[] = []
        for (let matchedEntity of matchedEntities) {
            // CAUTION 关系记录的 source/target 端点不允许经 update 重指（updateRelationByName 的
            //  既有契约）。generic update 路径此前不设防：端点列被静默重写且**零事件**（旧 link 无
            //  delete、新 link 无 create、连 update 事件都没有）——下游响应式计算与 ScopedSequence
            //  的 scope 守卫全部失明。同一契约的所有入口必须同构。
            //  同 id 的幂等端点引用放行：Transform 派生 relation 的 update patch 会原样携带端点。
            if (isLinkRecord) {
                for (const endpoint of ['source', 'target'] as const) {
                    if (!Object.prototype.hasOwnProperty.call(newEntityData.rawData || {}, endpoint)) continue
                    const newRef = newEntityData.rawData[endpoint] as { id?: string } | null
                    if (!newRef?.id || !sameRecordId(matchedEntity[endpoint]?.id, newRef.id)) {
                        throw new Error(
                            `cannot change ${endpoint} of relation record "${entityName}" through update ` +
                            `(current ${endpoint}.id: ${JSON.stringify(matchedEntity[endpoint]?.id)}, new: ${JSON.stringify(newRef?.id ?? newRef)}). ` +
                            `Relation endpoints are immutable — remove the old relation and add a new one instead.`
                        )
                    }
                }
            }
            // CAUTION changedFields 必须是"实际写入集合"而不是 payload 键：
            //  computed 属性会随输入字段联动重算并落库（getSameRowFieldAndValue，与 update 事件的 keys 同源）。
            //  filtered entity 的谓词可能建立在 computed 列上——若这里只用 payload 键做依赖过滤，
            //  computed 列的变更将跳过成员资格快照，查询侧正确而事件/下游增量计算永久脏数据（静默错误）。
            const changedFields = Array.from(new Set([
                ...payloadFields,
                ...newEntityData.getSameRowFieldAndValue(matchedEntity).map(field => field.name)
            ]))
            // 0. 成员资格快照：必须在任何物理变更之前采集（无状态 membership diff，见 FilteredEntityManager）。
            //  - membershipChecks：本记录（以及经反向路径受影响的记录）在依赖 changedFields 的 filtered entity 中的成员资格；
            //  - linkChecks：通过行内字段（merged link / combined）新建关系时另一端既有记录的成员资格。
            //    嵌套的 unlink/addLink 有各自的钩子，账本（ledger）保证同一批 events 中不产生重复事件。
            const membershipChecks = await this.filteredEntityManager.collectMembershipChecks(updateRecordQuery.recordName, [matchedEntity.id], changedFields, events)
            const linkChecks = events ? await this.collectUpdateLinkChecks(newEntityData, events) : []

            // 1. 创建我依赖的
            const newEntityDataWithDep = await this.agent.createRecordDependency(newEntityData, events)
            // 2. 把同表的实体移出去，为新同表 Record 建立 id；可能有要删除的 reliance
            const newEntityDataWithIdsWithFlashOutRecords = await this.updateSameRowData(updateRecordQuery.recordName, matchedEntity, newEntityDataWithDep, events)
            // 3. 更新依赖我的和关系表独立的
            const relianceUpdatedResult = await this.handleUpdateReliance(updateRecordQuery.recordName, matchedEntity, newEntityData, events)

            // 4. 成员资格结算：重新求值并与快照 diff，产生 filtered entity 的 create/delete 事件。
            await this.filteredEntityManager.settleMembershipChecks(membershipChecks.concat(linkChecks), events)

            result.push({...newEntityData.getData(), ...newEntityDataWithIdsWithFlashOutRecords.getData(), ...relianceUpdatedResult})
        }

        return result
    }

    /**
     * 采集本次 update 通过行内字段建立新关系时"另一端既有记录"的成员资格快照。
     * （行内写入不经过 addLink，另一端记录的成员资格变化需要在这里显式覆盖。）
     */
    private async collectUpdateLinkChecks(newEntityData: NewRecordData, events: RecordMutationEvent[]): Promise<MembershipCheck[]> {
        const checks: MembershipCheck[] = []
        for (const relatedRecord of newEntityData.mergedLinkTargetRecordIdRefs.concat(newEntityData.combinedRecordIdRefs)) {
            const relatedId = relatedRecord.getRef().id
            const linkName = relatedRecord.info!.linkName
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
            if ((newRelatedEntityData.isRef() && sameRecordId(matchedEntity[newRelatedEntityData.info?.attributeName!]?.id, newRelatedEntityData.getData().id))) {
                // 放过原来就是同样 related entity 的场景。可能是编程中为了方便没做检查，把原本的写了进来。
                continue
            }

            // CAUTION reliance link 不走 unlink（unlink 对 reliance 一律 fail-fast）：
            //  - 槽位已占用（换绑/清空既有依赖配对）⇒ 语义级 fail-fast——owner 侧换绑/置 null 会把
            //    旧依赖留成无主（displacement），依赖侧换绑经 update 轨暂不支持（addRelation /
            //    create-ref 轨支持 re-parent，r28 拓扑等价矩阵）；
            //  - 槽位空闲 ⇒ 没有旧关系可解，直接放行（此前对「给空闲 owner 经 update 赋依赖」
            //    也抛 "cannot unlink"，属于把无操作误判为违规，r28 修正）。
            if (linkInfo.isTargetReliance) {
                const attributeName = newRelatedEntityData.info!.attributeName
                const oldRelatedId = matchedEntity[attributeName]?.id
                if (oldRelatedId !== undefined && oldRelatedId !== null) {
                    throw new Error(
                        `cannot unlink reliance data by updating "${entityName}.${attributeName}" (current related id: ${oldRelatedId}). ` +
                        `Reliance data lives and dies with its owner — re-pointing or clearing the pairing through update would leave the current ` +
                        `dependent orphaned. Delete the dependent record instead (deleting the owner cascades it), or use addRelation to re-parent ` +
                        `a dependent onto a new owner.`
                    )
                }
                continue
            }

            await this.agent.unlink(
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

        // 1.5 1:1 排他目标的旧 owner 解除（r17 F-1）：上面的 unlink 只清除"我自己"的旧关系；
        //  引用的目标若已被其他宿主占用（merged link 的 FK 在对方行上），必须显式解除，
        //  否则两行 FK 同指一个目标——1:1 不变量被静默破坏。同 id 原地引用由 matchedEntity 判定跳过。
        await this.agent.unlinkOldOwnersOfExclusiveTargets(newEntityDataWithDep, events, matchedEntity)

        // 2. 分配 id,处理需要 flash out 的数据等，事件也是这里面记录的。这里面会有抢夺关系，所以也可能会有删除事件。
        const newEntityDataWithIdsWithFlashOutRecords = await this.agent.preprocessSameRowData(newEntityDataWithDep, true, events, matchedEntity)
        const allSameRowData = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue(matchedEntity)
        const columnAndValue = allSameRowData.map(({field, value, fieldType, valueType}: { field: string, value: string, fieldType?: string, valueType?: string }) => (
            {
                field,
                /// TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5
                value: value,
                // fieldType/valueType 让 buildUpdateSQL 走 prepareFieldValue（json 规范序列化、
                // timestamp 方言形态），与 create 路径一致。
                fieldType,
                valueType
            }
        ))

        // 3. 真实处理数据，这里面没有记录事件，事件是上面处理的。
        await this.updateRecordDataById(entityName, matchedEntity, columnAndValue)

        // 物理写入完成：结算 preprocess/flashOut 登记的行内视图成员资格任务
        // （merged link / combined 记录的 filtered 视图 create/update 事件）。
        await this.filteredEntityManager.settlePostWriteChecks(events)
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

        // CAUTION reliance link 的 update-replace 不走 unlink（对 reliance 一律 fail-fast）。
        //  update 的 replace 语义 = 「终态集合 = 声明集合」；对 reliance，任何**从终态里消失的
        //  既有依赖**都会被留成无主 ⇒ 语义级 fail-fast。声明集合 ⊇ 既有集合（纯新增 / 幂等
        //  快照回写）不孤儿化任何依赖 ⇒ 放行：已 link 的 ref 幂等跳过，新增项经 addLink →
        //  createRecord 入口的 reliance 槽位守卫处理（含 re-parent 他人依赖，r28 拓扑等价矩阵）。
        const relianceLinkedRefIds = new Map<string, Set<string>>()
        {
            const relianceAttrs = new Map<string, NewRecordData[]>()
            for (const relatedEntityData of otherTableEntitiesData) {
                if (!relatedEntityData.info!.getLinkInfo().isTargetReliance) continue
                const attributeName = relatedEntityData.info!.attributeName!
                if (!relianceAttrs.has(attributeName)) relianceAttrs.set(attributeName, [])
                relianceAttrs.get(attributeName)!.push(relatedEntityData)
            }
            for (const [attributeName, items] of relianceAttrs) {
                const linkInfo = items[0].info!.getLinkInfo()
                const hostSide = linkInfo.isRelationSource(entityName, attributeName) ? 'source' : 'target'
                const otherSide = hostSide === 'source' ? 'target' : 'source'
                const currentLinks = await this.agent.findRecords(RecordQuery.create(linkInfo.name, this.map, {
                    matchExpression: MatchExp.atom({ key: `${hostSide}.id`, value: ['=', matchedEntity.id] }),
                    attributeQuery: ['id', [otherSide, { attributeQuery: ['id'] }]]
                }), `check reliance pairings before update ${entityName}.${attributeName}`)
                const currentIds = currentLinks.map(link => link[otherSide]?.id).filter(id => id !== undefined && id !== null)
                const declaredRefIds = new Set(items.filter(item => item.isRef()).map(item => String(item.getRef().id)))
                const orphaned = currentIds.filter(id => !declaredRefIds.has(String(id)))
                if (orphaned.length) {
                    throw new Error(
                        `cannot unlink reliance data by updating "${entityName}.${attributeName}": the declared value drops currently paired ` +
                        `dependent/owner id(s) ${JSON.stringify(orphaned)}. Reliance data lives and dies with its owner — dropping a pairing through ` +
                        `update would leave the dependent orphaned. Delete the dependent record instead (deleting the owner cascades it), ` +
                        `or use addRelation to re-parent a dependent onto a new owner.`
                    )
                }
                relianceLinkedRefIds.set(attributeName, new Set(currentIds.map(String)))
            }
        }

        // CAUTION 由于 xToMany 的数组情况会平铺处理，所以这里可能出现两次，所以这里记录一下排重
        const removedLinkName = new Set()
        for (let relatedEntityData of otherTableEntitiesData) {
            const linkInfo = relatedEntityData.info!.getLinkInfo()
            if (removedLinkName.has(linkInfo.name)) {
                continue
            }

            // reliance：无 unlink（上方守卫已保证不会孤儿化），已 link 的 ref 在下方建立环节幂等跳过。
            if (linkInfo.isTargetReliance) {
                removedLinkName.add(linkInfo.name)
                continue
            }

            removedLinkName.add(linkInfo.name)
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName) ? 'source' : 'target'
            // CAUTION 对称 n:n 关系里，被替换实体的旧 link 行可能把它记录在 source 侧或 target 侧。
            //  update 是 replace 语义，若只按单侧（updatedEntityLinkAttr）unlink，会漏删该实体在另一侧的旧关系，
            //  导致新旧关系并存、查询出现脏数据。因此对称关系必须同时匹配 source.id 与 target.id。
            const unlinkMatch = (relatedEntityData.info!.isManyToMany && linkInfo.isSymmetric())
                ? MatchExp.atom({ key: 'source.id', value: ['=', matchedEntity.id] })
                    .or({ key: 'target.id', value: ['=', matchedEntity.id] })
                : MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                })
            await this.agent.unlink(
                linkInfo.name,
                unlinkMatch,
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

            // reliance 幂等快照回写：已 link 的 ref 不重复建立（否则 addLink 的
            // 「link already exist」内部断言会把合法的快照回写打崩）。
            if (newRelatedEntityData.isRef()
                && relianceLinkedRefIds.get(newRelatedEntityData.info!.attributeName!)?.has(String(newRelatedEntityData.getRef().id))) {
                const idempotentRef = newRelatedEntityData.getRef() as Record
                if (newRelatedEntityData.info!.isXToMany) {
                    if (!result[newRelatedEntityData.info!.attributeName!]) result[newRelatedEntityData.info!.attributeName!] = []
                    result[newRelatedEntityData.info!.attributeName!].push(idempotentRef)
                } else {
                    result[newRelatedEntityData.info!.attributeName!] = idempotentRef
                }
                continue;
            }
            
            // 这里只处理没有三表合并的场景。因为三表合并的数据在 sameTableFieldAndValues 已经有了
            // 这里只需要处理 1）关系表独立 或者 2）关系表往另一个方向合了的情况。因为往本方向和的情况已经在前面 updateEntityData 里面处理了
            let finalRelatedEntityRef: Record

            if (newRelatedEntityData.isRef()) {
                finalRelatedEntityRef = newRelatedEntityData.getRef()
            } else {
                finalRelatedEntityRef = await this.agent.createRecord(newRelatedEntityData, `create new related record for update ${newEntityData.recordName}.${newRelatedEntityData.info?.attributeName}`, events)
            }

            // FIXME 这里没有在更新的时候一次性写入，而是又通过 addLinkFromRecord 建立的关系。需要优化
            // CAUTION `&` 关系属性必须透传给 addLinkFromRecord。create 路径（handleCreationReliance）
            //  使用 linkRecordData 写入 link 属性，update 路径若传 undefined 会把关系属性静默丢弃——
            //  替换关系后 link 行存在但属性全部为空（r5 F-3）。
            const linkRecord = await this.agent.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, matchedEntity.id, finalRelatedEntityRef.id, newRelatedEntityData.linkRecordData?.getData(), events)

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

