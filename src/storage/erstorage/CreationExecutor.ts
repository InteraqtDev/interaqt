import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { MatchExp, MatchExpressionData, MatchAtom } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { assert } from "../utils.js";
import { SQLBuilder } from "./SQLBuilder.js";
import { FilteredEntityManager } from "./FilteredEntityManager.js";
import type { Record } from "./RecordQueryAgent.js";
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
        private helper: {
            updateRecord: (entity: string, matchExpression: MatchExpressionData, newRecordData: NewRecordData, events?: RecordMutationEvent[]) => Promise<Record[]>,
            unlink: (linkName: string, matchExpression: MatchExpressionData, moveSource: boolean, reason: string, events?: RecordMutationEvent[]) => Promise<Record[]>,
            deleteRecordSameRowData: (recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp?: boolean) =>Promise<Record[]>,
            flashOutCombinedRecordsAndMergedLinks: (newEntityData: NewRecordData, events?: RecordMutationEvent[], reason?: string) => Promise<{ [k: string]: RawEntityData }>,
            relocateCombinedRecordDataForLink: (linkName: string, matchExpression: MatchExpressionData, moveSource: boolean, events?: RecordMutationEvent[]) => Promise<Record[]>
        }
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
                const newLinkRecordData = mergedLinkTargetRecord.linkRecordData.merge({
                    [mergedLinkTargetRecord.info!.isRecordSource() ? 'target' : 'source']: newDepIdRef
                })
                // 所有 Link dep 也准备好了
                const newLinkRecordDataWithDep = await this.createRecordDependency(newLinkRecordData)

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
        const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)
        const newRecordIdRef = await this.insertSameRowData(newEntityDataWithDep, queryName, events)

        const relianceResult = await this.handleCreationReliance(newEntityDataWithDep.merge(newRecordIdRef), events)

        // 合并所有数据以获得完整的记录
        const fullRecord = Object.assign({}, newEntityData.getData(), newRecordIdRef, relianceResult);

        // 处理 filtered entity - 检查新创建的记录是否属于任何 filtered entity
        // 传递 isCreation = true 表示这是创建操作，只生成事件但不持久化 __filtered_entities
        await this.filteredEntityManager.updateFilteredEntityFlags(newEntityData.recordName, newRecordIdRef.id, events, fullRecord, true)

        // 更新 relianceResult 的信息
        return Object.assign(newRecordIdRef, relianceResult)
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
                const updatedFieldValues = newEntityData.getSameRowFieldAndValue(oldRecord)
                const recordInfo = this.map.getRecordInfo(newEntityData.recordName)
                const valueAttributeNames = new Set(recordInfo.valueAttributes.map(attr => attr.attributeName))
                const updateRecord = { ...newEntityData.getData() } as Record
                updatedFieldValues.forEach(field => {
                    if (valueAttributeNames.has(field.name)) {
                        updateRecord[field.name] = field.value
                    }
                })
                events?.push({
                    type: 'update',
                    recordName: newEntityData.recordName,
                    record: { ...updateRecord, id: oldRecord!.id },
                    oldRecord: oldRecord
                })
            }
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

        // FIXME 如果不同，才需要 merge。现在不知道为什么 relation 和 source 记录上出现了个 & 关系数据。
        const newEntityDataWithIds = newEntityData.merge(newRawDataWithNewIds)

        // 2. 处理需要 flashOut 的数据
        // TODO create 的情况下，有没可能不需要 flashout 已有的数据，直接更新到已有的 combined record 的行就行了。
        const flashOutRecordRasData: { [k: string]: RawEntityData } = await this.helper.flashOutCombinedRecordsAndMergedLinks(
            newEntityData,
            events,
            `finding combined records for ${newEntityData.recordName} to flash out, for ${isUpdate ? 'updating' : 'creation'} with data ${JSON.stringify(newEntityDataWithIds.getData())}`
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
            const newData = {
                [reverseInfo!.attributeName]: currentIdRef,
                [LINK_SYMBOL]: record.getData()[LINK_SYMBOL]
            }
            const [updatedRecord] = await this.helper.updateRecord(reverseInfo.parentEntityName, idMatch, new NewRecordData(this.map, reverseInfo.parentEntityName, newData), events)
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
                await this.helper.unlink(record.info!.linkName, match, false, 'unlink xToOne old link', events)
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
        if (!linkInfo.isCombined() && !linkInfo.isMerged() && (linkInfo.isManyToOne || linkInfo.isOneToMany)) {
            // n 方向要 unlink ?
            const unlinkAttr = linkInfo.isManyToOne ? 'source.id' : 'target.id'
            const unlinkId = linkInfo.isManyToOne ? sourceId : targetId
            const match = MatchExp.atom({
                key: unlinkAttr,
                value: ['=', unlinkId]
            })
            // 这里需要调用 RecordQueryAgent 的 unlink 方法
            await this.helper.unlink(linkName, match, false, 'unlink combined record for add new link', events)
        }

        const newLinkData = new NewRecordData(this.map, linkInfo.name, {
            source: {id: sourceId},
            target: {id: targetId},
            ...attributes
        })

        return this.createRecord(newLinkData, `create link record ${linkInfo.name}`, events)
    }

    /**
     * 删除记录的同行数据（用于 flashOut）
     * 这是一个辅助方法，实际的删除逻辑在 RecordQueryAgent 中
     */
}

