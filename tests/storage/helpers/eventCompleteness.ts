/**
 * 事件完备性预言机（r17 复盘落地项，盲区 2）。
 *
 * 契约：storage 写操作的「逻辑数据面 diff」必须与「事件面」互相解释——
 *  1. 每个新出现的记录必须有对应的 create 事件（缺失 = 下游计算漏加）；
 *  2. 每个消失的记录必须有对应的 delete 事件（缺失 = 下游计算漏减）；
 *  3. 每个值字段变化的记录必须有 update 事件、且变化字段被事件 keys 覆盖
 *     （缺失 = r17 F-2 类「数据面写了、事件面沉默」的静默陈旧）；
 *  4. 反向：create/delete 事件必须对应真实出现/消失的记录（幻影事件 = 下游虚加/虚减）。
 *     update 事件允许幂等（重写同值也发事件是既定语义），只要求 id 真实存在。
 *
 * 快照取自 ER 查询层（实体按 ['*']，关系带 source/target id），即用户可见的逻辑面——
 * flash-out/relocate 的物理行搬迁（刻意不发实体事件，见 combinedRecordEvents.spec.ts）
 * 在逻辑面上无 diff，天然不会误报。事件流中不属于声明面（虚拟 link、内部记录）的
 * 事件名不参与对账。
 */
import { expect } from "vitest";
import { EntityQueryHandle, MatchExp } from "@storage";
import type { RecordMutationEvent } from '@runtime';

type LogicalRow = { [k: string]: unknown }
export type LogicalSnapshot = Map<string, Map<string, LogicalRow>>

export type EventCompletenessSchema = {
    entities: string[]
    relations: string[]
}

function normalizeRow(row: LogicalRow): LogicalRow {
    const result: LogicalRow = {}
    for (const [key, value] of Object.entries(row)) {
        if (key === 'id') continue
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

export async function snapshotLogicalState(handle: EntityQueryHandle, schema: EventCompletenessSchema): Promise<LogicalSnapshot> {
    const snapshot: LogicalSnapshot = new Map()
    for (const entityName of schema.entities) {
        const rows = await handle.find(entityName, undefined, undefined, ['*'])
        snapshot.set(entityName, new Map(rows.map(row => [String(row.id), normalizeRow(row)])))
    }
    for (const relationName of schema.relations) {
        const rows = await handle.findRelationByName(relationName, undefined, undefined,
            ['*', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
        snapshot.set(relationName, new Map(rows.map(row => [String(row.id), normalizeRow(row)])))
    }
    return snapshot
}

export function expectEventsToExplainDiff(
    before: LogicalSnapshot,
    after: LogicalSnapshot,
    events: RecordMutationEvent[],
    label = ''
) {
    const trackedNames = new Set(before.keys())
    const relevantEvents = events.filter(e => trackedNames.has(e.recordName))

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
        const deleteEventIds = new Set(relevantEvents.filter(e => e.recordName === recordName && e.type === 'delete').map(e => String(e.record?.id ?? e.oldRecord?.id)))
        const updateEvents = relevantEvents.filter(e => e.recordName === recordName && e.type === 'update')

        // 1/2. 出现/消失的记录必须有事件
        for (const id of createdIds) {
            expect(createEventIds.has(id),
                `${label} [event-completeness] ${recordName}#${id} appeared in storage but has NO create event`).toBe(true)
        }
        for (const id of deletedIds) {
            expect(deleteEventIds.has(id),
                `${label} [event-completeness] ${recordName}#${id} disappeared from storage but has NO delete event`).toBe(true)
        }
        // 3. 字段变化必须被 update 事件 keys 覆盖
        for (const { id, changedFields } of changed) {
            const coveredKeys = new Set(updateEvents
                .filter(e => String(e.record?.id) === id)
                .flatMap(e => (e.keys as string[] | undefined) ?? []))
            for (const field of changedFields) {
                expect(coveredKeys.has(field),
                    `${label} [event-completeness] ${recordName}#${id} field "${field}" changed in storage (` +
                    `${JSON.stringify(beforeRows.get(id)![field] ?? null)} -> ${JSON.stringify(afterRows.get(id)![field] ?? null)}` +
                    `) but no update event covers it (covered keys: ${JSON.stringify([...coveredKeys])})`).toBe(true)
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
    expectEventsToExplainDiff(before, after, events, label)
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
