import { MatchExpressionData, MatchAtom, MatchExp } from "./MatchExp.js"
import { BoolExp } from "@core"
import { EntityToTableMap, MapData } from "./EntityToTableMap.js"
import { RecordQueryAgent, Record } from "./RecordQueryAgent.js"
import { LINK_SYMBOL, RecordQuery } from "./RecordQuery.js"
import { RecordMutationEvent } from "@runtime"

export interface FilteredEntityDependency {
    filteredEntityName: string
    baseEntityName: string
    matchExpression: MatchExpressionData
    dependencies: {
        entityName: string
        path: string[]  // 从 base entity 到依赖 entity 的路径
        attributes: string[]  // 依赖的属性列表
    }[]
}

/**
 * 一次变更操作的"前置成员资格快照"。
 * 在真正执行变更之前采集（beforeMutation 阶段），变更之后与新的求值结果做 diff（settle 阶段）。
 */
export type MembershipCheck = {
    dependency: FilteredEntityDependency
    // 受影响的 base record id 集合（before 阶段确定，之后不再变化）
    recordIds: string[]
    // 变更前满足谓词的 id 集合
    beforeMemberIds: Set<string>
}

/**
 * 删除操作的前置成员资格快照：recordName（base）下每条待删除记录当前所属的 filtered entity 集合。
 */
export type DeletionMembershipSnapshot = {
    recordName: string
    // filteredEntityName -> 属于该 filtered entity 的记录 id 集合
    membersByFilteredEntity: Map<string, Set<string>>
    // 记录 id -> 完整记录（用于事件 payload）
    recordsById: Map<string, Record>
    // 同表 reliance 的递归快照
    children: DeletionMembershipSnapshot[]
}

// CAUTION 依赖分析结果只由不可变的 MapData 决定，按 MapData 缓存。
//  否则每次 new RecordQueryAgent / EntityQueryHandle（例如 migration 中的临时 handle）都会全量重算。
const dependenciesByMapData = new WeakMap<MapData, Map<string, FilteredEntityDependency[]>>()

// CAUTION 成员资格事件的"操作内账本"（in-memory ledger），按 events 数组实例区分作用域。
//  filtered entity 的成员资格没有持久化状态（单一真相源 = 谓词的实时求值），
//  但一次变更操作内部可能有多个钩子对同一条记录求值（例如 update 里嵌套的 unlink/addLink
//  与外层 update 钩子包裹了同一段变更）。账本记录"本 events 批次内最后一次已知/已发出的成员状态"，
//  保证同一批 events 里不会出现重复或矛盾的成员资格事件（消费方按批增量计算，重复事件会导致重复计数）。
//  没有 events 数组的调用不产生成员资格事件，也就完全不需要求值——天然跳过所有 membership 查询。
const membershipLedgers = new WeakMap<RecordMutationEvent[], Map<string, boolean>>()

/**
 * 行内（in-row）写路径的"待结算视图成员资格任务"。
 *
 * CAUTION merged link / combined 记录的变更事件是 preprocessSameRowData / flashOut 手工 push 的，
 *  不经过 createRecord/updateRecord 的记录级钩子（handleRecordCreation / collectMembershipChecks）——
 *  数据落在宿主行上，但以这些 link/combined 记录为 base 的 filtered 视图（filtered relation、
 *  combined 记录上的 filtered entity）此前完全收不到成员资格事件：查询面正确、事件面缺失，
 *  下游对视图的响应式计算永久陈旧（r19 F-3 修了宿主侧 filtered entity，link/combined 记录自身
 *  的视图是同一家族的平行漏网，r20 收口）。
 *
 *  谓词只能由 SQL 求值（架构原则：不在内存中模拟第二套判定引擎），而 preprocess 阶段行还没写入：
 *  - create 形态：物理写入完成后按 handleRecordCreation 契约求值（before 恒为非成员）；
 *  - update 形态：enqueue 时行还活着，立即采集 before 快照，物理写入后 settle diff。
 *  任务挂在 events 数组上（与 ledger 同一作用域），由 insertSameRowData / updateSameRowData
 *  的写入完成点统一 drain（settlePostWriteChecks）。
 */
type PostWriteViewCheck =
    | { kind: 'creation', recordName: string, recordId: string, fullRecord: Record }
    | { kind: 'update', checks: MembershipCheck[] }

const postWriteChecksByEvents = new WeakMap<RecordMutationEvent[], PostWriteViewCheck[]>()

function getLedger(events: RecordMutationEvent[]): Map<string, boolean> {
    let ledger = membershipLedgers.get(events)
    if (!ledger) {
        ledger = new Map()
        membershipLedgers.set(events, ledger)
    }
    return ledger
}

function ledgerKey(filteredEntityName: string, recordId: string) {
    return `${filteredEntityName}:${recordId}`
}

/**
 * 让子 events 数组共享父 events 数组的账本。
 * CAUTION 删除流程为了控制事件顺序会先把事件收集到局部数组（如 linkAndCascadeEvents），
 *  再拼接进操作级 events。若不共享账本，嵌套钩子与外层结算会因为账本割裂而重复发出成员资格事件。
 */
export function shareMembershipLedger(childEvents: RecordMutationEvent[] | undefined, parentEvents: RecordMutationEvent[] | undefined) {
    if (!childEvents || !parentEvents || childEvents === parentEvents) return
    membershipLedgers.set(childEvents, getLedger(parentEvents))
}

/**
 * 管理 filtered entity 的所有功能：依赖分析、成员资格求值与成员资格事件（membership diff）。
 *
 * 架构原则（无状态设计）：
 * - 查询侧：谓词重写（resolvedMatchExpression，由 MatchExp 构造器统一合并），实时正确。
 * - 事件侧：变更时的成员资格 diff——变更前采集受影响记录及其成员资格（beforeMutation），
 *   变更后重新求值并对比（settle），差异即事件。谓词永远只由 SQL 求值（与查询侧同一真相源），
 *   不在内存中模拟谓词语义（避免出现第二套判定引擎）。
 * - 没有任何持久化的成员标记，因此不存在"标记与数据脱同步"的脏状态，也没有并发下的
 *   读-改-写丢失更新问题。
 */
export class FilteredEntityManager {
    private dependencies: Map<string, FilteredEntityDependency[]>

    constructor(private map: EntityToTableMap, private queryAgent: RecordQueryAgent) {
        const cached = dependenciesByMapData.get(map.data)
        if (cached) {
            this.dependencies = cached
        } else {
            this.dependencies = new Map()
            dependenciesByMapData.set(map.data, this.dependencies)
            this.initializeDependencies()
        }
    }

    /**
     * 初始化所有 filtered entity 的依赖关系（每个 MapData 只计算一次）
     */
    private initializeDependencies() {
        for (const [recordName, recordData] of Object.entries(this.map.data.records)) {
            // 统一判断：如果有 matchExpression 且 resolvedBaseRecordName 不指向自己，说明是 filtered entity
            // 普通 entity 没有 matchExpression 或 resolvedBaseRecordName 指向自己
            if (recordData.matchExpression && recordData.resolvedBaseRecordName && recordData.resolvedBaseRecordName !== recordName) {
                this.analyzeDependencies(
                    recordName,
                    recordData.resolvedBaseRecordName,
                    recordData.resolvedMatchExpression || recordData.matchExpression
                )
            }
        }
    }
    
    // ============ 依赖管理功能 ============
    
    /**
     * 分析 filtered entity 的过滤条件，提取所有依赖的实体和路径
     */
    analyzeDependencies(filteredEntityName: string, baseEntityName: string, matchExpression: MatchExpressionData): FilteredEntityDependency {
        const dependencies: FilteredEntityDependency['dependencies'] = []
        this.extractDependenciesFromExpression(baseEntityName, matchExpression, dependencies)
        
        const dependency: FilteredEntityDependency = {
            filteredEntityName,
            baseEntityName,
            matchExpression,
            dependencies
        }
        
        // 注册依赖关系。
        // CAUTION 同一个 dependency 在同一个实体名下只能注册一次。
        //  谓词包含 base 自身属性时 dependencies 里也会出现 baseEntityName，
        //  如果这里再无条件注册一次，update 时会对同一条记录做双倍的 membership 查询（结果幂等但白做）。
        const entityNamesToRegister = new Set<string>(dependencies.map(dep => dep.entityName))
        // 源实体自身也要注册（即使谓词没有直接引用它的属性）
        entityNamesToRegister.add(baseEntityName)
        for (const entityName of entityNamesToRegister) {
            if (!this.dependencies.has(entityName)) {
                this.dependencies.set(entityName, [])
            }
            const registered = this.dependencies.get(entityName)!
            if (!registered.includes(dependency)) {
                registered.push(dependency)
            }
        }

        return dependency
    }
    
    /**
     * 从匹配表达式中提取依赖关系
     */
    private extractDependenciesFromExpression(
        entityName: string, 
        expression: MatchExpressionData,
        dependencies: FilteredEntityDependency['dependencies']
    ) {
        // MatchExpressionData 是 BoolExp<MatchAtom> 的别名
        // 使用 BoolExp.fromValue 来获取正确的实例
        const boolExp = BoolExp.fromValue(expression as any)
        
        if (boolExp.isExpression()) {
            if (boolExp.left) {
                this.extractDependenciesFromExpression(entityName, boolExp.left.raw as MatchExpressionData, dependencies)
            }
            if (boolExp.right) {
                this.extractDependenciesFromExpression(entityName, boolExp.right.raw as MatchExpressionData, dependencies)
            }
        } else if (boolExp.isAtom()) {
            const matchAtom = boolExp.data as MatchAtom
            const key = matchAtom.key
            const pathParts = key.split('.')

            const addDependency = (depEntityName: string, depPath: string[], attribute: string) => {
                const existing = dependencies.find(d =>
                    d.entityName === depEntityName &&
                    JSON.stringify(d.path) === JSON.stringify(depPath)
                )
                if (existing) {
                    if (!existing.attributes.includes(attribute)) {
                        existing.attributes.push(attribute)
                    }
                } else {
                    dependencies.push({
                        entityName: depEntityName,
                        path: depPath,
                        attributes: [attribute]
                    })
                }
            }

            // 如果路径只有一个部分，说明是源实体自身的属性
            if (pathParts.length === 1) {
                addDependency(entityName, [], pathParts[0])
            } else {
                // 路径包含多个部分（跨实体过滤）。这里要登记两类依赖：
                // 1. 末端值属性所在实体的该属性（例如 team.department.budget -> Department.budget）
                // 2. 路径上"每一段关系"本身。因为关系（link）的建立/解除同样会改变成员资格。
                const fullPath = [entityName].concat(pathParts)

                // 逐段登记关系依赖：owner 实体的关系属性变化会影响成员资格。
                // i 对应关系段在 pathParts 中的下标；owner 是该关系所属实体，ownerPath 是从 base 到 owner 的路径。
                let ownerEntity = entityName
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const relationAttr = pathParts[i]
                    const ownerPath = pathParts.slice(0, i) // 从 base 到 owner 的关系路径
                    const info = this.map.getInfoByPath(fullPath.slice(0, i + 2))
                    // 关系段本身作为依赖：owner.relationAttr 变化 -> 需要反查回 base 重新求值
                    addDependency(ownerEntity, ownerPath, relationAttr)
                    if (info && info.isRecord) {
                        ownerEntity = info.recordName
                    }
                }

                // 末端值属性：所在实体是路径倒数第二段指向的实体（即上面循环结束时的 ownerEntity）
                const valueAttribute = pathParts[pathParts.length - 1]
                const valuePath = pathParts.slice(0, pathParts.length - 1)
                addDependency(ownerEntity, valuePath, valueAttribute)
            }
        }
    }
    
    /**
     * 获取某个实体变更时影响的所有 filtered entity
     */
    getAffectedFilteredEntities(entityName: string): FilteredEntityDependency[] {
        return this.dependencies.get(entityName) || []
    }
    
    /**
     * 清除所有依赖关系（同时失效按 MapData 共享的缓存）
     */
    clear() {
        this.dependencies.clear()
        dependenciesByMapData.delete(this.map.data)
    }
    
    // ============ 成员资格求值（唯一真相源：SQL 谓词求值） ============

    /**
     * 根据依赖路径反向查询受影响的源记录 id（批量）。
     * path 为空时受影响的就是变更记录本身。
     */
    private async findAffectedSourceRecordIds(
        dependency: FilteredEntityDependency,
        depPath: string[],
        changedRecordIds: string[]
    ): Promise<string[]> {
        if (depPath.length === 0) {
            return changedRecordIds
        }
        // 构建反向查询，从变更的实体查找到源实体。
        // 例如：对于 User 依赖 Team.type，path = ['team']，查找所有 team.id in changedRecordIds 的 User。
        const matchKey = depPath.concat('id').join('.')
        const matchCondition = MatchExp.atom({
            key: matchKey,
            value: ['in', changedRecordIds]
        })

        const query = RecordQuery.create(dependency.baseEntityName, this.map, {
            matchExpression: matchCondition,
            attributeQuery: ['id']
        })

        const records = await this.queryAgent.findRecords(query, `find affected source records for ${dependency.baseEntityName}`)
        return records.map(r => r.id)
    }

    /**
     * 批量检查记录是否满足 filtered entity 的条件，返回满足条件的 id 集合。
     * CAUTION 一次 membership 查询覆盖所有记录，避免每条记录一次查询的 N+1。
     */
    async checkRecordsMatchFilter(
        recordIds: string[],
        entityName: string,
        matchExpression: MatchExpressionData
    ): Promise<Set<string>> {
        if (!recordIds.length) return new Set()

        const query = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpression.and({
                key: 'id',
                value: ['in', recordIds]
            }),
            attributeQuery: ['id']
        })

        const results = await this.queryAgent.findRecords(
            query,
            `check if records [${recordIds.join(',')}] match filter condition`
        )

        return new Set(results.map(r => r.id))
    }

    /**
     * 检查单条记录是否满足 filtered entity 的条件
     */
    async checkRecordMatchesFilter(
        recordId: string,
        entityName: string,
        matchExpression: MatchExpressionData
    ): Promise<boolean> {
        const matchedIds = await this.checkRecordsMatchFilter([recordId], entityName, matchExpression)
        return matchedIds.has(recordId)
    }

    /**
     * 获取基于指定源实体的所有 filtered entities（包括级联的）
     */
    getFilteredEntitiesForBase(baseEntityName: string): Array<{ name: string, matchExpression: MatchExpressionData }> {
        const result: Array<{ name: string, matchExpression: MatchExpressionData }> = [];
        const resultSet = new Set<string>();
        const visited = new Set<string>();
        
        const collectFiltered = (entityName: string) => {
            if (visited.has(entityName)) return;
            visited.add(entityName);
            
            const recordInfo = this.map.getRecordInfo(entityName);
            const directFiltered = recordInfo.filteredBy || [];
            
            for (const filtered of directFiltered) {
                // 避免重复添加
                if (!resultSet.has(filtered.name)) {
                    resultSet.add(filtered.name);
                    
                    // 使用预计算的值
                    const filteredRecordInfo = this.map.getRecordInfo(filtered.name);
                    const combinedExpression = filteredRecordInfo.data.resolvedMatchExpression!;
                    
                    result.push({
                        name: filtered.name,
                        matchExpression: combinedExpression
                    });
                }
                // 递归收集基于这个 filtered entity 的其他 filtered entities
                collectFiltered(filtered.name);
            }
        };
        
        collectFiltered(baseEntityName);
        return result;
    }

    // ============ 变更钩子：before（快照）/ settle（diff + 事件） ============

    /**
     * 变更前采集：找出 changedFields 影响到的所有依赖，确定受影响的 base 记录集合，
     * 并记录它们变更前的成员资格。必须在真正执行变更之前调用。
     *
     * CAUTION 受影响记录集合只在 before 阶段确定一次。对深层路径依赖（reverse path 查询），
     *  该查询走的是"未被本次变更修改的关系段"，因此变更前后集合一致；对变更记录自身（path 为空）
     *  集合就是入参。settle 阶段不重复反查。
     */
    async collectMembershipChecks(
        entityName: string,
        recordIds: string[],
        changedFields: string[] | undefined,
        events?: RecordMutationEvent[]
    ): Promise<MembershipCheck[]> {
        // 没有 events 数组就不需要成员资格事件，跳过全部求值。
        if (!events || !recordIds.length) return []

        const dependencies = this.getAffectedFilteredEntities(entityName)
        if (!dependencies.length) return []

        const checks: MembershipCheck[] = []
        for (const dependency of dependencies) {
            // 同一实体可能以多条路径出现在同一个依赖中，逐条处理。
            const depInfos = dependency.dependencies.filter(d => d.entityName === entityName)
            const affectedIdSet = new Set<string>()
            for (const depInfo of depInfos) {
                if (changedFields) {
                    const relevant = changedFields.filter(attr => depInfo.attributes.includes(attr))
                    if (!relevant.length) continue
                }
                const ids = await this.findAffectedSourceRecordIds(dependency, depInfo.path, recordIds)
                ids.forEach(id => affectedIdSet.add(id))
            }
            if (!affectedIdSet.size) continue

            const affectedIds = Array.from(affectedIdSet)
            const beforeMemberIds = await this.checkRecordsMatchFilter(affectedIds, dependency.baseEntityName, dependency.matchExpression)
            checks.push({ dependency, recordIds: affectedIds, beforeMemberIds })
        }
        return checks
    }

    /**
     * 关系（link）变更前采集：关系的建立/解除会改变两端实体的成员资格。
     * endpoints 直接给出两端记录 id（不需要反查变更的关系段本身）。
     */
    async collectLinkMembershipChecks(
        linkName: string,
        endpoints: { sourceIds?: (string | undefined)[], targetIds?: (string | undefined)[] },
        events?: RecordMutationEvent[]
    ): Promise<MembershipCheck[]> {
        if (!events) return []
        const link = this.map.data.links[linkName]
        // 虚拟 link（relation 与 entity 之间的）不承载真实关系语义，跳过。
        if (!link || link.isSourceRelation) return []

        const checks: MembershipCheck[] = []
        const sourceIds = (endpoints.sourceIds || []).filter((id): id is string => id !== undefined && id !== null)
        const targetIds = (endpoints.targetIds || []).filter((id): id is string => id !== undefined && id !== null)

        // source 端：owner 实体是 sourceRecord，关系属性是 sourceProperty
        if (sourceIds.length && link.sourceRecord && link.sourceProperty) {
            checks.push(...await this.collectMembershipChecks(link.sourceRecord, Array.from(new Set(sourceIds)), [link.sourceProperty], events))
        }
        // target 端：owner 实体是 targetRecord，关系属性是 targetProperty（可能不存在）
        if (targetIds.length && link.targetRecord && link.targetProperty) {
            checks.push(...await this.collectMembershipChecks(link.targetRecord, Array.from(new Set(targetIds)), [link.targetProperty], events))
        }
        return checks
    }

    /**
     * 变更后结算：重新求值成员资格，与 before 快照（或账本中的最新已知状态）对比，
     * 差异生成 create/delete 事件。
     */
    async settleMembershipChecks(checks: MembershipCheck[], events?: RecordMutationEvent[]): Promise<void> {
        if (!events || !checks.length) return
        const ledger = getLedger(events)

        for (const check of checks) {
            const { dependency, recordIds, beforeMemberIds } = check
            if (!recordIds.length) continue

            const recordInfo = this.map.getRecordInfo(dependency.baseEntityName)
            // 取回当前记录（事件 payload 需要完整字段）。变更期间被删除的记录这里查不到，
            // 它们的成员资格 delete 事件由删除路径负责。
            const currentRecords = await this.queryAgent.findRecords(
                RecordQuery.create(dependency.baseEntityName, this.map, {
                    matchExpression: MatchExp.atom({ key: 'id', value: ['in', recordIds] }),
                    attributeQuery: recordInfo.isRelation ?
                        ['*', ['target', {attributeQuery: ['*']}], ['source', {attributeQuery: ['*']}]] :
                        ['*']
                }),
                `get current records for membership settle of ${dependency.filteredEntityName}`
            )

            if (!currentRecords.length) continue

            const matchedIds = await this.checkRecordsMatchFilter(
                currentRecords.map(record => record.id),
                dependency.baseEntityName,
                dependency.matchExpression
            )

            for (const record of currentRecords) {
                const key = ledgerKey(dependency.filteredEntityName, record.id)
                const isMember = matchedIds.has(record.id)
                const wasMember = ledger.has(key) ? ledger.get(key)! : beforeMemberIds.has(record.id)
                if (isMember !== wasMember) {
                    events.push({
                        type: isMember ? 'create' : 'delete',
                        recordName: dependency.filteredEntityName,
                        record: { ...record }
                    })
                }
                ledger.set(key, isMember)
            }
        }
    }

    /**
     * 创建钩子：新记录的成员资格（before 恒为非成员），满足条件即产生 create 事件。
     * 在记录（含其嵌套关联与关系）全部创建完成后调用。
     */
    async handleRecordCreation(
        recordName: string,
        recordId: string,
        fullRecord: Record,
        events?: RecordMutationEvent[]
    ): Promise<void> {
        if (!events) return
        const filteredEntities = this.getFilteredEntitiesForBase(recordName)
        if (!filteredEntities.length) return

        const ledger = getLedger(events)
        for (const filteredEntity of filteredEntities) {
            const key = ledgerKey(filteredEntity.name, recordId)
            const isMember = await this.checkRecordMatchesFilter(recordId, recordName, filteredEntity.matchExpression)
            // 创建场景 before 恒为非成员；嵌套的 link 钩子可能已经先行发出过 create（账本已记录）。
            const wasMember = ledger.has(key) ? ledger.get(key)! : false
            if (isMember && !wasMember) {
                events.push({
                    type: 'create',
                    recordName: filteredEntity.name,
                    record: { ...fullRecord, id: recordId }
                })
            }
            ledger.set(key, isMember)
        }
    }

    // ============ 行内写路径（merged link / combined 记录）的视图成员资格 ============

    /**
     * 登记一个"物理写入完成后需要求值"的行内记录创建（merged link / combined 记录）。
     * 写入完成点（insertSameRowData / updateSameRowData）调用 settlePostWriteChecks 统一结算。
     */
    enqueuePostWriteCreationCheck(events: RecordMutationEvent[] | undefined, recordName: string, recordId: string, fullRecord: Record): void {
        if (!events || !this.getFilteredEntitiesForBase(recordName).length) return
        let queue = postWriteChecksByEvents.get(events)
        if (!queue) {
            queue = []
            postWriteChecksByEvents.set(events, queue)
        }
        queue.push({ kind: 'creation', recordName, recordId, fullRecord })
    }

    /**
     * 登记一个行内记录的原地更新（同 id `&` 关系属性 / combined 嵌套值）。
     * before 快照立即采集（此刻行还活着且未被写入），diff 在写入完成点结算。
     */
    async enqueuePostWriteUpdateCheck(events: RecordMutationEvent[] | undefined, recordName: string, recordId: string, changedFields: string[]): Promise<void> {
        if (!events) return
        const checks = await this.collectMembershipChecks(recordName, [recordId], changedFields, events)
        if (!checks.length) return
        let queue = postWriteChecksByEvents.get(events)
        if (!queue) {
            queue = []
            postWriteChecksByEvents.set(events, queue)
        }
        queue.push({ kind: 'update', checks })
    }

    /**
     * 写入完成点：结算全部挂起的行内视图成员资格任务（顺序与登记顺序一致）。
     */
    async settlePostWriteChecks(events: RecordMutationEvent[] | undefined): Promise<void> {
        if (!events) return
        const queue = postWriteChecksByEvents.get(events)
        if (!queue?.length) return
        postWriteChecksByEvents.delete(events)
        for (const task of queue) {
            if (task.kind === 'creation') {
                await this.handleRecordCreation(task.recordName, task.recordId, task.fullRecord, events)
            } else {
                await this.settleMembershipChecks(task.checks, events)
            }
        }
    }

    /**
     * 行内 link/combined 记录即将被物理清列时的视图成员资格快照（非递归的轻量版
     * collectDeletionMemberships）：行还活着时求值，之后由 settleDeletionMemberships
     * 在 base 事件 push 之后生成视图 delete 事件。
     * 无视图时返回 undefined（零开销）。
     */
    async collectInlineDeletionSnapshot(recordName: string, records: Record[], events?: RecordMutationEvent[]): Promise<DeletionMembershipSnapshot | undefined> {
        if (!events || !records.length) return undefined
        const filteredEntities = this.getFilteredEntitiesForBase(recordName)
        if (!filteredEntities.length) return undefined
        const snapshot: DeletionMembershipSnapshot = {
            recordName,
            membersByFilteredEntity: new Map(),
            recordsById: new Map(records.map(record => [record.id, record])),
            children: []
        }
        const ids = records.map(record => record.id)
        for (const filteredEntity of filteredEntities) {
            const memberIds = await this.checkRecordsMatchFilter(ids, recordName, filteredEntity.matchExpression)
            if (memberIds.size) {
                snapshot.membersByFilteredEntity.set(filteredEntity.name, memberIds)
            }
        }
        return snapshot.membersByFilteredEntity.size ? snapshot : undefined
    }

    /**
     * 删除前采集：待删除记录（含同表 reliance 树）当前所属的 filtered entity 集合。
     * 必须在任何物理删除发生之前调用（谓词求值需要行与关系仍然存在）。
     */
    async collectDeletionMemberships(
        recordName: string,
        records: Record[],
        events?: RecordMutationEvent[]
    ): Promise<DeletionMembershipSnapshot | undefined> {
        if (!events || !records.length) return undefined

        const recordInfo = this.map.getRecordInfo(recordName)
        const filteredEntities = this.getFilteredEntitiesForBase(recordName)

        const snapshot: DeletionMembershipSnapshot = {
            recordName,
            membersByFilteredEntity: new Map(),
            recordsById: new Map(records.map(record => [record.id, record])),
            children: []
        }

        if (filteredEntities.length) {
            const ids = records.map(record => record.id)
            for (const filteredEntity of filteredEntities) {
                const memberIds = await this.checkRecordsMatchFilter(ids, recordName, filteredEntity.matchExpression)
                if (memberIds.size) {
                    snapshot.membersByFilteredEntity.set(filteredEntity.name, memberIds)
                }
            }
        }

        // 同表 reliance 会随本记录一起删除（行内数据），也要在行还存在时采集。
        for (const relianceInfo of recordInfo.sameTableReliance) {
            const relianceRecords = records
                .map(record => record[relianceInfo.attributeName])
                .filter((rec): rec is Record => !!rec?.id)
            if (relianceRecords.length) {
                const child = await this.collectDeletionMemberships(relianceInfo.recordName, relianceRecords, events)
                if (child) snapshot.children.push(child)
            }
        }

        // CAUTION 行内 link（merged 进本行的 link、combined 三表合一的 link、同表 reliance 的 link）
        //  会随本行的删除/清列一起消失。它们的 delete 事件由 DeletionExecutor 在物理删除之后手工
        //  push（deleteRecordSameRowDataGrouped 的事件段），而以这些 link 为 base 的 filtered
        //  relation 视图的成员资格只能在行还活着时求值——这里一并快照，事件段 push 完 base link
        //  delete 后用 settleDeletionMemberships 生成视图 delete 事件。
        const inRowLinkAttrInfos = [
            ...recordInfo.mergedRecordAttributes,
            ...recordInfo.notRelianceCombined.filter(info => !(recordInfo.isRelation && (info.attributeName === 'source' || info.attributeName === 'target'))),
            ...recordInfo.sameTableReliance,
        ]
        const linkRecordsByLinkName = new Map<string, Record[]>()
        for (const record of records) {
            for (const info of inRowLinkAttrInfos) {
                const related = record[info.attributeName]
                const linkData = related?.id !== undefined ? related[LINK_SYMBOL] : undefined
                if (!linkData?.id) continue
                // payload 与事件段 push 的 base link delete 事件同一契约（link 数据 + 两端 id 引用）。
                const linkRecord: Record = {
                    ...linkData,
                    [info.isRecordSource() ? 'source' : 'target']: { id: record.id },
                    [info.isRecordSource() ? 'target' : 'source']: { id: related.id },
                }
                let list = linkRecordsByLinkName.get(info.linkName)
                if (!list) {
                    list = []
                    linkRecordsByLinkName.set(info.linkName, list)
                }
                list.push(linkRecord)
            }
        }
        for (const [linkName, linkRecords] of linkRecordsByLinkName) {
            const child = await this.collectInlineDeletionSnapshot(linkName, linkRecords, events)
            if (child) snapshot.children.push(child)
        }

        return snapshot
    }

    /**
     * 删除结算：按删除前快照为每条记录的每个所属 filtered entity 产生 delete 事件。
     * 事件 push 到 targetEvents（调用方控制排序位置：filtered delete 事件先于记录本身的 delete 事件），
     * 账本仍然按 ledgerEvents（整个操作共享的 events 数组）判重。
     */
    settleDeletionMemberships(
        snapshot: DeletionMembershipSnapshot | undefined,
        recordName: string,
        records: Record[],
        targetEvents: RecordMutationEvent[],
        ledgerEvents?: RecordMutationEvent[]
    ): void {
        if (!snapshot || !ledgerEvents) return
        const source = snapshot.recordName === recordName ? snapshot : snapshot.children.find(child => child.recordName === recordName)
        if (!source) return

        const ledger = getLedger(ledgerEvents)
        for (const record of records) {
            for (const [filteredEntityName, memberIds] of source.membersByFilteredEntity) {
                const key = ledgerKey(filteredEntityName, record.id)
                const wasMember = ledger.has(key) ? ledger.get(key)! : memberIds.has(record.id)
                if (wasMember) {
                    const payload = source.recordsById.get(record.id) || record
                    targetEvents.push({
                        type: 'delete',
                        recordName: filteredEntityName,
                        record: { ...payload }
                    })
                }
                ledger.set(key, false)
            }
        }
    }
}
