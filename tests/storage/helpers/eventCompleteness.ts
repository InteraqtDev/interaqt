/**
 * 事件完备性预言机（r17 复盘落地项，盲区 2；r25 扩展 payload 完备性；r26 扩展 delete 端点完备性）。
 *
 * 契约：storage 写操作的「逻辑数据面 diff」必须与「事件面」互相解释——
 *  1. 每个新出现的记录必须有对应的 create 事件（缺失 = 下游计算漏加）；
 *  2. 每个消失的记录必须有对应的 delete 事件（缺失 = 下游计算漏减）；
 *  3. 每个值字段变化的记录必须有 update 事件、且变化字段被事件 keys 覆盖
 *     （缺失 = r17 F-2 类「数据面写了、事件面沉默」的静默陈旧）；
 *  4. 反向：create/delete 事件必须对应真实出现/消失的记录（幻影事件 = 下游虚加/虚减）。
 *     update 事件允许幂等（重写同值也发事件是既定语义），只要求 id 真实存在。
 *  5. create 事件 payload 完备性（r25 F-1 落地）：快照完备性契约要求「缺席的普通值
 *     属性 ⟺ 库里 NULL」（r21 F-1 的本地 match 求值、trigger/eventDep 深度匹配都建立
 *     在这条契约上）。行内产生点手工拼 payload 时 default-only 字段曾整族缺席——
 *     所以 create 事件 payload 必须覆盖行上全部非 NULL 的普通值字段且值一致。
 *     computed / computation 属性是契约的显式例外（create 事件不保证携带），
 *     经 schema.createPayloadExemptField 声明。
 *  6. relation delete 事件端点完备性（r26 F-1 落地）：DeletionExecutor 规范形要求
 *     link delete 的 `record` 携带 `source.id` / `target.id`（旧态快照）。按端点定位的
 *     下游（StateMachine computeTarget、Transform eventDeps、Scheduler 脏集查询）把缺席
 *     端点读成 undefined → transfer/增量永不触发。存在性规则（#2）拦不住「有 delete
 *     但缺端点」——flashOut create-steal 曾在同函数兄弟分支已正确补端点的情况下漏网。
 *  7. relation update 事件端点完备性（r26 对称面扫描落地）：merged 事件视图契约
 *     （mergedMutationEventView = {...oldRecord, ...record}，r20 F-5）下，update 的端点
 *     必须可从 record 或 oldRecord 读出且与变更前快照一致。canonical 路径靠
 *     matchedEntity（含 managedRecordAttributes）带出端点；行内 `&` 原地更新路径
 *     手工拼 oldRecord（LINK_SYMBOL 数据无端点），是 create(#5)/delete(#6) 的
 *     update 同构兄弟格。
 */
import { expect } from "vitest";
import { EntityQueryHandle, MatchExp } from "@storage";
import type { RecordMutationEvent } from '@runtime';

type LogicalRow = { [k: string]: unknown }
export type LogicalSnapshot = Map<string, Map<string, LogicalRow>>

export type EventCompletenessSchema = {
    entities: string[]
    relations: string[]
    /**
     * 额外忽略的字段判定（runtime 层需要：计算的绑定状态列如 `_Host_prop_bound_total`
     * 由 atomic 原语直写、刻意不产生事件；计算结果属性本身有 update 事件，不在此列）。
     */
    ignoreField?: (fieldName: string) => boolean
    /**
     * create 事件 payload 完备性检查（第 5 条）的豁免字段：computed / computation 属性
     * 由写路径联动求值，create 事件不保证携带（r21 F-1 对它们走保守 full recompute）。
     * 按 (recordName, fieldName) 判定；未提供时不豁免任何字段。
     */
    createPayloadExemptField?: (recordName: string, fieldName: string) => boolean
}

/** runtime（带 Controller/计算）场景的默认忽略规则：绑定状态列 + 内部行号列。 */
export function isComputationInternalField(fieldName: string): boolean {
    return /^_.*_bound_/.test(fieldName) || fieldName === '_rowId'
}

function normalizeRow(row: LogicalRow, ignoreField?: (fieldName: string) => boolean): LogicalRow {
    const result: LogicalRow = {}
    for (const [key, value] of Object.entries(row)) {
        if (key === 'id') continue
        if (ignoreField?.(key)) continue
        if (key === 'source' || key === 'target') {
            result[key] = (value as { id?: unknown })?.id
        } else if (value !== null && typeof value === 'object') {
            // 嵌套关联数据不属于本记录的值字段面（关系变化由 link 记录自己的 diff 承担）
            continue
        } else {
            result[key] = value
        }
    }
    return result
}

/** 最小查询契约：EntityQueryHandle 与 MonoSystem storage 都满足。 */
export type LogicalQuerySource = {
    find(entityName: string, match?: unknown, modifier?: unknown, attributeQuery?: unknown): Promise<Record<string, unknown>[]>
    findRelationByName(relationName: string, match?: unknown, modifier?: unknown, attributeQuery?: unknown): Promise<Record<string, unknown>[]>
}

export async function snapshotLogicalState(handle: LogicalQuerySource, schema: EventCompletenessSchema): Promise<LogicalSnapshot> {
    const snapshot: LogicalSnapshot = new Map()
    for (const entityName of schema.entities) {
        const rows = await handle.find(entityName, undefined, undefined, ['*'])
        snapshot.set(entityName, new Map(rows.map(row => [String(row.id), normalizeRow(row, schema.ignoreField)])))
    }
    for (const relationName of schema.relations) {
        const rows = await handle.findRelationByName(relationName, undefined, undefined,
            ['*', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
        snapshot.set(relationName, new Map(rows.map(row => [String(row.id), normalizeRow(row, schema.ignoreField)])))
    }
    return snapshot
}

export function expectEventsToExplainDiff(
    before: LogicalSnapshot,
    after: LogicalSnapshot,
    events: RecordMutationEvent[],
    label = '',
    options?: {
        ignoreField?: (fieldName: string) => boolean
        createPayloadExemptField?: (recordName: string, fieldName: string) => boolean
        /** relation 名集合：用于第 6 条 delete 端点完备性 */
        relations?: string[]
    }
) {
    const trackedNames = new Set(before.keys())
    const relevantEvents = events.filter(e => trackedNames.has(e.recordName))
    const ignoreField = options?.ignoreField
    const createPayloadExemptField = options?.createPayloadExemptField
    const relationNames = new Set(options?.relations ?? [])

    for (const recordName of trackedNames) {
        const beforeRows = before.get(recordName)!
        const afterRows = after.get(recordName)!

        const createdIds = [...afterRows.keys()].filter(id => !beforeRows.has(id))
        const deletedIds = [...beforeRows.keys()].filter(id => !afterRows.has(id))
        const changed = [...afterRows.keys()]
            .filter(id => beforeRows.has(id))
            .map(id => {
                const beforeRow = beforeRows.get(id)!
                const afterRow = afterRows.get(id)!
                const changedFields = [...new Set([...Object.keys(beforeRow), ...Object.keys(afterRow)])]
                    .filter(field => JSON.stringify(beforeRow[field] ?? null) !== JSON.stringify(afterRow[field] ?? null))
                return { id, changedFields }
            })
            .filter(item => item.changedFields.length > 0)

        const createEventIds = new Set(relevantEvents.filter(e => e.recordName === recordName && e.type === 'create').map(e => String(e.record?.id)))
        const deleteEvents = relevantEvents.filter(e => e.recordName === recordName && e.type === 'delete')
        const deleteEventIds = new Set(deleteEvents.map(e => String(e.record?.id ?? e.oldRecord?.id)))
        const updateEvents = relevantEvents.filter(e => e.recordName === recordName && e.type === 'update')

        // 1/2. 出现/消失的记录必须有事件
        for (const id of createdIds) {
            expect(createEventIds.has(id),
                `${label} [event-completeness] ${recordName}#${id} appeared in storage but has NO create event`).toBe(true)
        }
        // 5. create 事件 payload 完备性：行上全部非 NULL 普通值字段必须出现在 payload 且值一致
        //    （快照完备性契约——r21 F-1 的本地求值把缺席键解读为 NULL；r25 F-1 的逃逸面）。
        const createEventsById = new Map(relevantEvents
            .filter(e => e.recordName === recordName && e.type === 'create')
            .map(e => [String(e.record?.id), e]))
        for (const id of createdIds) {
            const createEvent = createEventsById.get(id)
            if (!createEvent?.record) continue
            const row = afterRows.get(id)!
            for (const [field, value] of Object.entries(row)) {
                if (value === null || value === undefined) continue
                if (ignoreField?.(field)) continue
                if (createPayloadExemptField?.(recordName, field)) continue
                const isEndpoint = field === 'source' || field === 'target'
                const payloadValue = isEndpoint
                    ? (createEvent.record[field] as { id?: unknown } | undefined)?.id
                    : createEvent.record[field]
                // 端点字段按记录**身份**比较（String 归一）：公开 API 面把 id 声明为 string，
                //  调用方传字符串形态合法；「事件 payload 的 id JS 形态必须与读回侧严格同型」
                //  是记录中的开放契约决策（r27 F-3 数据面已由 sameRecordId 修复；形态面
                //  与 r25→r26 的 timestamp 归一化同一处理节奏——先记录决策再全面收口）。
                const matches = isEndpoint
                    ? String(payloadValue) === String(value)
                    : JSON.stringify(payloadValue ?? null) === JSON.stringify(value)
                expect(matches,
                    `${label} [event-completeness] ${recordName}#${id} create event payload misses/diverges on field "${field}" ` +
                    `(row: ${JSON.stringify(value)}, payload: ${JSON.stringify(payloadValue ?? null)}) — ` +
                    `create event contract is defaults + payload; absent plain value keys are read as NULL by downstream local evaluation`).toBe(true)
            }
        }
        for (const id of deletedIds) {
            expect(deleteEventIds.has(id),
                `${label} [event-completeness] ${recordName}#${id} disappeared from storage but has NO delete event`).toBe(true)
        }
        // 6. relation delete 事件端点完备性（r26 F-1）：payload 必须带 source.id / target.id，
        //    且与消失前快照一致。存在性规则（#2）拦不住「有 delete 缺端点」。
        const isRelation = relationNames.has(recordName)
            || [...beforeRows.values(), ...afterRows.values()].some(row => 'source' in row || 'target' in row)
        if (isRelation) {
            for (const event of deleteEvents) {
                const id = String(event.record?.id ?? event.oldRecord?.id)
                const sourceId = (event.record?.source as { id?: unknown } | undefined)?.id
                    ?? (event.oldRecord?.source as { id?: unknown } | undefined)?.id
                const targetId = (event.record?.target as { id?: unknown } | undefined)?.id
                    ?? (event.oldRecord?.target as { id?: unknown } | undefined)?.id
                expect(sourceId !== undefined && sourceId !== null,
                    `${label} [event-completeness] ${recordName}#${id} delete event missing source.id — ` +
                    `relation delete contract requires endpoint snapshot (DeletionExecutor canonical form); ` +
                    `computeTarget(event.record.source.id) stays blind without it`).toBe(true)
                expect(targetId !== undefined && targetId !== null,
                    `${label} [event-completeness] ${recordName}#${id} delete event missing target.id — ` +
                    `relation delete contract requires endpoint snapshot (DeletionExecutor canonical form); ` +
                    `computeTarget(event.record.target.id) stays blind without it`).toBe(true)
                const beforeRow = beforeRows.get(id)
                if (beforeRow && ('source' in beforeRow || 'target' in beforeRow)) {
                    if (beforeRow.source !== undefined && beforeRow.source !== null) {
                        expect(JSON.stringify(sourceId) === JSON.stringify(beforeRow.source),
                            `${label} [event-completeness] ${recordName}#${id} delete event source.id diverges from pre-delete snapshot ` +
                            `(snapshot: ${JSON.stringify(beforeRow.source)}, payload: ${JSON.stringify(sourceId)})`).toBe(true)
                    }
                    if (beforeRow.target !== undefined && beforeRow.target !== null) {
                        expect(JSON.stringify(targetId) === JSON.stringify(beforeRow.target),
                            `${label} [event-completeness] ${recordName}#${id} delete event target.id diverges from pre-delete snapshot ` +
                            `(snapshot: ${JSON.stringify(beforeRow.target)}, payload: ${JSON.stringify(targetId)})`).toBe(true)
                    }
                }
            }
        }
        // 3. 字段变化必须被 update 事件 keys 覆盖
        for (const { id, changedFields } of changed) {
            const coveredKeys = new Set(updateEvents
                .filter(e => String(e.record?.id) === id)
                .flatMap(e => (e.keys as string[] | undefined) ?? []))
            for (const field of changedFields) {
                if (ignoreField?.(field)) continue
                expect(coveredKeys.has(field),
                    `${label} [event-completeness] ${recordName}#${id} field "${field}" changed in storage (` +
                    `${JSON.stringify(beforeRows.get(id)![field] ?? null)} -> ${JSON.stringify(afterRows.get(id)![field] ?? null)}` +
                    `) but no update event covers it (covered keys: ${JSON.stringify([...coveredKeys])})`).toBe(true)
            }
        }
        // 7. relation update 事件端点完备性：merged 视图（{...oldRecord, ...record}）必须能读出
        //    source.id / target.id，且与变更前快照一致（update 不改端点——改端点是 delete+create）。
        if (isRelation) {
            for (const event of updateEvents) {
                const id = String(event.record?.id)
                const beforeRow = beforeRows.get(id)
                if (!beforeRow) continue
                const mergedSourceId = (event.record?.source as { id?: unknown } | undefined)?.id
                    ?? (event.oldRecord?.source as { id?: unknown } | undefined)?.id
                const mergedTargetId = (event.record?.target as { id?: unknown } | undefined)?.id
                    ?? (event.oldRecord?.target as { id?: unknown } | undefined)?.id
                expect(mergedSourceId !== undefined && mergedSourceId !== null,
                    `${label} [event-completeness] ${recordName}#${id} update event exposes no source.id via record/oldRecord — ` +
                    `merged mutation view contract; computeTarget/pattern-match on relation updates stays blind without it`).toBe(true)
                expect(mergedTargetId !== undefined && mergedTargetId !== null,
                    `${label} [event-completeness] ${recordName}#${id} update event exposes no target.id via record/oldRecord`).toBe(true)
                if (beforeRow.source !== undefined && beforeRow.source !== null) {
                    expect(JSON.stringify(mergedSourceId) === JSON.stringify(beforeRow.source),
                        `${label} [event-completeness] ${recordName}#${id} update event source.id diverges from pre-update snapshot ` +
                        `(snapshot: ${JSON.stringify(beforeRow.source)}, merged view: ${JSON.stringify(mergedSourceId)})`).toBe(true)
                }
                if (beforeRow.target !== undefined && beforeRow.target !== null) {
                    expect(JSON.stringify(mergedTargetId) === JSON.stringify(beforeRow.target),
                        `${label} [event-completeness] ${recordName}#${id} update event target.id diverges from pre-update snapshot ` +
                        `(snapshot: ${JSON.stringify(beforeRow.target)}, merged view: ${JSON.stringify(mergedTargetId)})`).toBe(true)
                }
            }
        }
        // 4. 反向：无幻影 create/delete；update 的 id 必须真实
        for (const id of createEventIds) {
            expect(afterRows.has(id) || deleteEventIds.has(id),
                `${label} [event-completeness] phantom create event: ${recordName}#${id} never appeared in storage`).toBe(true)
        }
        for (const id of deleteEventIds) {
            expect(beforeRows.has(id) || createEventIds.has(id),
                `${label} [event-completeness] phantom delete event: ${recordName}#${id} never existed in storage`).toBe(true)
        }
        for (const event of updateEvents) {
            const id = String(event.record?.id)
            expect(beforeRows.has(id) || afterRows.has(id) || createEventIds.has(id),
                `${label} [event-completeness] phantom update event: ${recordName}#${id} not present in storage`).toBe(true)
        }
    }
}

/**
 * 包裹一次写操作：自动前后快照 + 事件对账。返回操作产生的事件（供额外断言）。
 */
export async function withEventCompleteness(
    handle: EntityQueryHandle,
    schema: EventCompletenessSchema,
    label: string,
    op: (events: RecordMutationEvent[]) => Promise<unknown>
): Promise<RecordMutationEvent[]> {
    const before = await snapshotLogicalState(handle, schema)
    const events: RecordMutationEvent[] = []
    await op(events)
    const after = await snapshotLogicalState(handle, schema)
    expectEventsToExplainDiff(before, after, events, label, {
        ignoreField: schema.ignoreField,
        createPayloadExemptField: schema.createPayloadExemptField,
        relations: schema.relations,
    })
    return events
}

/**
 * runtime（MonoSystem storage，带 Controller/计算）版本：事件经 storage.listen 采集，
 * 绑定状态列（atomic 直写、无事件语义）默认忽略。计算结果属性有 update 事件，正常对账——
 * 这使预言机同时守住「用户写入的事件面」与「计算传播的事件面」。
 */
export async function withRuntimeEventCompleteness(
    storage: LogicalQuerySource & {
        listen(callback: (events: RecordMutationEvent[]) => unknown): void
        unlisten?(callback: (events: RecordMutationEvent[]) => unknown): void
    },
    schema: EventCompletenessSchema,
    label: string,
    op: () => Promise<unknown>
): Promise<RecordMutationEvent[]> {
    const effectiveSchema: EventCompletenessSchema = {
        ...schema,
        ignoreField: schema.ignoreField ?? isComputationInternalField
    }
    const before = await snapshotLogicalState(storage, effectiveSchema)
    const events: RecordMutationEvent[] = []
    const collector = (batch: RecordMutationEvent[]) => { events.push(...batch) }
    storage.listen(collector)
    try {
        await op()
    } finally {
        storage.unlisten?.(collector)
    }
    const after = await snapshotLogicalState(storage, effectiveSchema)
    expectEventsToExplainDiff(before, after, events, label, {
        ignoreField: effectiveSchema.ignoreField,
        createPayloadExemptField: effectiveSchema.createPayloadExemptField,
        relations: effectiveSchema.relations,
    })
    return events
}

/**
 * INV-3（r17 复盘落地项）：x:1 关系排他侧唯一。
 * - 1:1：每个 source 至多 1 条 link，且每个 target 至多 1 条 link；
 * - n:1：每个 source 至多 1 条 link；
 * - 1:n：每个 target 至多 1 条 link。
 */
export async function assertExclusiveSideUnique(
    handle: EntityQueryHandle,
    relationName: string,
    relType: '1:1' | 'n:1' | '1:n',
    label = ''
) {
    const links = await handle.findRelationByName(relationName, undefined, undefined,
        ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
    const bySource = new Map<string, number>()
    const byTarget = new Map<string, number>()
    for (const link of links) {
        const sid = String((link.source as { id?: unknown })?.id)
        const tid = String((link.target as { id?: unknown })?.id)
        bySource.set(sid, (bySource.get(sid) ?? 0) + 1)
        byTarget.set(tid, (byTarget.get(tid) ?? 0) + 1)
    }
    if (relType === '1:1' || relType === 'n:1') {
        for (const [sid, count] of bySource) {
            expect(count, `${label} [INV-3] ${relationName}: source ${sid} owns ${count} links (exclusive side must be unique)`).toBe(1)
        }
    }
    if (relType === '1:1' || relType === '1:n') {
        for (const [tid, count] of byTarget) {
            expect(count, `${label} [INV-3] ${relationName}: target ${tid} owned by ${count} links (exclusive side must be unique)`).toBe(1)
        }
    }
}

/**
 * 正反两个方向的查询必须给出同一事实（r17 F-1 的「正反自相矛盾」面）。
 */
export async function assertBidirectionalConsistency(
    handle: EntityQueryHandle,
    config: {
        sourceEntity: string, sourceProperty: string,
        targetEntity: string, targetProperty: string,
    },
    label = ''
) {
    const sources = await handle.find(config.sourceEntity, undefined, undefined,
        ['id', [config.sourceProperty, { attributeQuery: ['id'] }]])
    const targets = await handle.find(config.targetEntity, undefined, undefined,
        ['id', [config.targetProperty, { attributeQuery: ['id'] }]])

    const forwardEdges = new Set<string>()
    for (const source of sources) {
        const related = source[config.sourceProperty]
        const items = Array.isArray(related) ? related : (related ? [related] : [])
        for (const item of items) forwardEdges.add(`${source.id}->${(item as { id: unknown }).id}`)
    }
    const backwardEdges = new Set<string>()
    for (const target of targets) {
        const related = target[config.targetProperty]
        const items = Array.isArray(related) ? related : (related ? [related] : [])
        for (const item of items) backwardEdges.add(`${(item as { id: unknown }).id}->${target.id}`)
    }
    expect([...forwardEdges].sort(), `${label} [bidirectional] forward/backward edge sets diverge`).toEqual([...backwardEdges].sort())
}
