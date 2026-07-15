/**
 * 驱动差分 fuzz（r29，quality-plan §1.3 第 1 步：r24/r25 驱动分裂家族的机器化收口）。
 *
 * 动机：r24 的 getAutoId id 型别分裂、r25 的 timestamp 形态分裂都属于「同一逻辑操作在
 * 不同驱动下产生不同可观察结果」——单库预言机结构上抓不到（每一侧各自自洽）。
 * 收口方式是把「跨驱动等价」本身升格为预言机：同一种子、同一操作意图流，
 * 在 SQLite（主）与 PGLite（副）上逐操作对账。
 *
 * 机制：
 * - 决策流共享：schema 与操作意图由共享生成器产出（helpers/fuzzSchema / helpers/fuzzOps），
 *   意图以主库的具体 id 表达，经 **id 双射**翻译后在副库重放。
 * - id 双射：两侧同一操作的 create 事件按 (type, recordName) 分组、组内按位置配对登记
 *   `recordName:主id ↔ 副id`。组尺寸失配 = 事件流结构分裂；组内位置配对若配错
 *   （仅当两条新记录值面完全同构时才可能），后续快照值面对账会当场戳穿——
 *   即预言机对「记录同构性」以内的配对选择不敏感（isomorphism up to field values）。
 * - 逐操作对账面：
 *   1. 错误语义：一侧抛、另一侧不抛 = 驱动分裂；两侧都抛按同一白名单分类
 *      （错误消息不要求逐字相同——SQL 层措辞属驱动方言）；
 *   2. 事件流：(type, recordName) 组多重集一致；delete/update 的身份多重集（经双射）一致；
 *      update 的 keys 集合按身份配对一致；relation 事件端点存在性一致。
 *      CAUTION 组内**顺序**刻意不比较：一个操作内的兄弟 unlink/级联按内部查询返回序
 *      处理，行序是驱动方言（无 ORDER BY 承诺）——「事件多重集一致、顺序不承诺」
 *      是本预言机固化下来的跨驱动契约决策（差分 fuzz 首跑种子 35 暴露的决策点）。
 *   3. 逻辑状态快照：全部实体/关系的 id 集合（经双射）与全部值字段严格相等。
 * - id 的 JS 形态（number vs string）**刻意不比较**：形态契约是记录中的开放决策
 *   （r27 F-3 数据面已收口到 sameRecordId）；本预言机比较 String 归一后的**身份**。
 *
 * 再现：FUZZ_DIFF_SEED_START / FUZZ_DIFF_SEED_COUNT / FUZZ_DIFF_OPS 扩池；
 * 失败信息带种子与操作日志（FUZZ_VERBOSE=1 全量）。
 */
import { describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, EntityQueryHandle } from "@storage";
import { SQLiteDB, PGLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";
import { snapshotLogicalState, type EventCompletenessSchema, type LogicalSnapshot } from "./helpers/eventCompleteness.js";
import { mulberry32, genSchema, isExpectedRejection, type FuzzSchema } from "./helpers/fuzzSchema.js";
import { decideNextOp, executeOpIntent, type FuzzOpIntent, type IdPools } from "./helpers/fuzzOps.js";

// ---------- id 双射 ----------
class IdBijection {
    private primToSec = new Map<string, unknown>()
    private secToPrim = new Map<string, unknown>()
    private key(recordName: string, id: unknown) { return `${recordName}:${String(id)}` }
    register(recordName: string, primId: unknown, secId: unknown, context: string) {
        const primKey = this.key(recordName, primId), secKey = this.key(recordName, secId)
        const existingSec = this.primToSec.get(primKey), existingPrim = this.secToPrim.get(secKey)
        if (existingSec !== undefined && String(existingSec) !== String(secId)) {
            throw new Error(`id bijection conflict at ${context}: ${primKey} already maps to ${String(existingSec)}, now ${String(secId)}`)
        }
        if (existingPrim !== undefined && String(existingPrim) !== String(primId)) {
            throw new Error(`id bijection conflict at ${context}: secondary ${secKey} already maps to ${String(existingPrim)}, now ${String(primId)}`)
        }
        this.primToSec.set(primKey, secId)
        this.secToPrim.set(secKey, primId)
    }
    toSecondary(recordName: string, primId: unknown): unknown {
        const mapped = this.primToSec.get(this.key(recordName, primId))
        if (mapped === undefined) throw new Error(`no secondary id mapped for ${this.key(recordName, primId)}`)
        // 保留意图的 id 形态轴：字符串形态映射后仍是字符串形态
        return typeof primId === 'string' ? String(mapped) : mapped
    }
    toPrimary(recordName: string, secId: unknown): unknown | undefined {
        return this.secToPrim.get(this.key(recordName, secId))
    }
}

// ---------- 意图翻译（主库 id → 副库 id） ----------
type AttrRelatedMap = Map<string, Map<string, string>>

function buildAttrRelatedMap(schema: FuzzSchema): AttrRelatedMap {
    const result: AttrRelatedMap = new Map(schema.entityNames.map(n => [n, new Map()]))
    for (const choice of schema.relationChoices) {
        result.get(choice.source)!.set(choice.sourceProperty, choice.target)
        if (!choice.symmetric) result.get(choice.target)!.set(choice.targetProperty, choice.source)
    }
    return result
}

function translatePayload(payload: Record<string, unknown>, entityName: string, attrRelated: AttrRelatedMap, bijection: IdBijection): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
        const relatedName = attrRelated.get(entityName)?.get(key)
        if (!relatedName || value === null || typeof value !== 'object') {
            result[key] = value
            continue
        }
        const translateItem = (item: unknown): unknown => {
            if (item === null || typeof item !== 'object') return item
            const obj = item as Record<string, unknown>
            const translated = 'id' in obj && obj.id !== undefined && obj.id !== null
                ? { ...translatePayload(obj, relatedName, attrRelated, bijection), id: bijection.toSecondary(relatedName, obj.id) }
                : translatePayload(obj, relatedName, attrRelated, bijection)
            if (obj['&']) translated['&'] = obj['&']
            return translated
        }
        result[key] = Array.isArray(value) ? value.map(translateItem) : translateItem(value)
    }
    return result
}

function translateIntent(intent: Exclude<FuzzOpIntent, null>, schema: FuzzSchema, attrRelated: AttrRelatedMap, bijection: IdBijection): Exclude<FuzzOpIntent, null> {
    if (intent.op === 'create') {
        return { ...intent, payload: translatePayload(intent.payload, intent.entityName, attrRelated, bijection) }
    } else if (intent.op === 'update') {
        return {
            ...intent,
            id: bijection.toSecondary(intent.entityName, intent.id),
            payload: translatePayload(intent.payload, intent.entityName, attrRelated, bijection),
        }
    } else if (intent.op === 'delete') {
        return { ...intent, id: bijection.toSecondary(intent.entityName, intent.id) }
    } else if (intent.op === 'addRelation') {
        const choice = schema.relationChoices.find(c => c.relation.name === intent.relationName)!
        return {
            ...intent,
            sourceId: bijection.toSecondary(choice.source, intent.sourceId),
            targetId: bijection.toSecondary(choice.target, intent.targetId),
        }
    } else {
        return { ...intent, linkId: String(bijection.toSecondary(intent.relationName, intent.linkId)) }
    }
}

// ---------- 事件流锁步对账 + 双射登记 ----------
function eventIdOf(event: RecordMutationEvent): unknown {
    return event.record?.id ?? event.oldRecord?.id
}

function endpointPresence(event: RecordMutationEvent): string {
    return (['source', 'target'] as const).map(endpoint => {
        const value = (event.record?.[endpoint] as { id?: unknown } | undefined)?.id
            ?? (event.oldRecord?.[endpoint] as { id?: unknown } | undefined)?.id
        return value === undefined || value === null ? '0' : '1'
    }).join('')
}

function reconcileEventStreams(
    primEvents: RecordMutationEvent[],
    secEvents: RecordMutationEvent[],
    bijection: IdBijection,
    fail: (message: string) => never,
    context: string,
) {
    // 按 (type, recordName) 分组（组内保持流序）。组多重集必须一致；组内顺序不承诺（见头注）。
    const groupBy = (events: RecordMutationEvent[]) => {
        const groups = new Map<string, RecordMutationEvent[]>()
        for (const event of events) {
            const key = `${event.type}|${event.recordName}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(event)
        }
        return groups
    }
    const primGroups = groupBy(primEvents), secGroups = groupBy(secEvents)
    const allKeys = new Set([...primGroups.keys(), ...secGroups.keys()])
    for (const key of allKeys) {
        const prims = primGroups.get(key) ?? [], secs = secGroups.get(key) ?? []
        if (prims.length !== secs.length) {
            fail(`${context}: event group "${key}" size diverges (SQLite ${prims.length} vs PGLite ${secs.length})\n` +
                `SQLite: ${JSON.stringify(primEvents.map(e => `${e.type} ${e.recordName}#${String(eventIdOf(e))}`))}\n` +
                `PGLite: ${JSON.stringify(secEvents.map(e => `${e.type} ${e.recordName}#${String(eventIdOf(e))}`))}`)
        }
        const [type, recordName] = key.split('|')
        if (type === 'create') {
            // 嵌套兄弟 create 按载荷序产生（非查询序）：位置配对登记双射。
            // 若两条新记录值面完全同构导致配错，随后的快照值面对账会当场戳穿。
            for (let i = 0; i < prims.length; i++) {
                const primId = eventIdOf(prims[i]), secId = eventIdOf(secs[i])
                if ((primId === undefined) !== (secId === undefined)) {
                    fail(`${context}: create ${recordName} event #${i} id presence diverges`)
                }
                if (primId !== undefined) bijection.register(recordName, primId, secs[i].record!.id, `${context} ${key}#${i}`)
                if (endpointPresence(prims[i]) !== endpointPresence(secs[i])) {
                    fail(`${context}: create ${recordName} event #${i} endpoint presence diverges ` +
                        `(SQLite ${endpointPresence(prims[i])} vs PGLite ${endpointPresence(secs[i])})`)
                }
            }
        } else {
            // delete/update 兄弟事件来自内部查询（行序是驱动方言）：按身份多重集配对。
            const secByIdentity = new Map<string, RecordMutationEvent[]>()
            for (const sec of secs) {
                const mapped = bijection.toPrimary(recordName, eventIdOf(sec))
                const identity = String(mapped)
                if (!secByIdentity.has(identity)) secByIdentity.set(identity, [])
                secByIdentity.get(identity)!.push(sec)
            }
            for (const prim of prims) {
                const identity = String(eventIdOf(prim))
                const candidates = secByIdentity.get(identity)
                if (!candidates?.length) {
                    fail(`${context}: ${type} ${recordName}#${identity} present on SQLite but PGLite stream has no counterpart ` +
                        `(PGLite identities: ${JSON.stringify(secs.map(e => String(bijection.toPrimary(recordName, eventIdOf(e)))))})`)
                }
                const sec = candidates.shift()!
                if (type === 'update') {
                    const primKeys = [...(prim.keys ?? [])].sort(), secKeys = [...(sec.keys ?? [])].sort()
                    if (JSON.stringify(primKeys) !== JSON.stringify(secKeys)) {
                        fail(`${context}: update ${recordName}#${identity} keys diverge (SQLite ${JSON.stringify(primKeys)} vs PGLite ${JSON.stringify(secKeys)})`)
                    }
                }
                if (endpointPresence(prim) !== endpointPresence(sec)) {
                    fail(`${context}: ${type} ${recordName}#${identity} endpoint presence diverges ` +
                        `(SQLite ${endpointPresence(prim)} vs PGLite ${endpointPresence(sec)})`)
                }
            }
        }
    }
}

// ---------- 快照对账（副库快照经双射归一到主库 id 空间） ----------
function normalizeSecondarySnapshot(snapshot: LogicalSnapshot, bijection: IdBijection, fail: (message: string) => never, context: string): LogicalSnapshot {
    const result: LogicalSnapshot = new Map()
    for (const [recordName, rows] of snapshot) {
        const mappedRows = new Map<string, { [k: string]: unknown }>()
        for (const [secId, row] of rows) {
            const primId = bijection.toPrimary(recordName, secId)
            if (primId === undefined) {
                fail(`${context}: PGLite has ${recordName}#${secId} with no SQLite counterpart (never seen in a create event)`)
            }
            const mappedRow: { [k: string]: unknown } = { ...row }
            for (const endpoint of ['source', 'target'] as const) {
                if (mappedRow[endpoint] !== undefined && mappedRow[endpoint] !== null) {
                    // 端点 id 的记录名未知（可能是任一实体）——快照面端点按 String 保留，
                    // 由对面（主库）同字段的 String 比较承担一致性判定。
                    mappedRow[endpoint] = String(mappedRow[endpoint])
                }
            }
            mappedRows.set(String(primId), mappedRow)
        }
        result.set(recordName, mappedRows)
    }
    return result
}

function reconcileSnapshots(
    primSnapshot: LogicalSnapshot,
    secSnapshot: LogicalSnapshot,
    schema: FuzzSchema,
    bijection: IdBijection,
    fail: (message: string) => never,
    context: string,
) {
    const endpointRecordNames = new Map<string, { source: string, target: string }>()
    for (const choice of schema.relationChoices) {
        endpointRecordNames.set(choice.relation.name!, { source: choice.source, target: choice.target })
    }
    const mappedSec = normalizeSecondarySnapshot(secSnapshot, bijection, fail, context)
    for (const [recordName, primRows] of primSnapshot) {
        const secRows = mappedSec.get(recordName) ?? new Map()
        const primIds = [...primRows.keys()].sort(), secIds = [...secRows.keys()].sort()
        if (JSON.stringify(primIds) !== JSON.stringify(secIds)) {
            fail(`${context}: ${recordName} id sets diverge\nSQLite: ${JSON.stringify(primIds)}\nPGLite(mapped): ${JSON.stringify(secIds)}`)
        }
        const endpoints = endpointRecordNames.get(recordName)
        for (const [id, primRow] of primRows) {
            const secRow = secRows.get(id)!
            const fields = new Set([...Object.keys(primRow), ...Object.keys(secRow)])
            for (const field of fields) {
                let primValue = primRow[field] ?? null, secValue = secRow[field] ?? null
                if ((field === 'source' || field === 'target') && endpoints) {
                    // 端点比较经双射：主库端点 id vs 副库端点 id 映射回主库
                    const endpointRecord = field === 'source' ? endpoints.source : endpoints.target
                    const mappedBack = secValue === null ? null : bijection.toPrimary(endpointRecord, secValue)
                    if (String(primValue) !== String(mappedBack)) {
                        fail(`${context}: ${recordName}#${id} ${field} endpoint diverges (SQLite ${String(primValue)}, PGLite maps to ${String(mappedBack)})`)
                    }
                    continue
                }
                if (JSON.stringify(primValue) !== JSON.stringify(secValue)) {
                    fail(`${context}: ${recordName}#${id} field "${field}" diverges (SQLite ${JSON.stringify(primValue)} vs PGLite ${JSON.stringify(secValue)})`)
                }
            }
        }
    }
}

// ---------- runner ----------
type OpLog = { step: number, op: string, detail: unknown, outcome: string }

async function runDifferentialCase(seed: number, opsCount: number) {
    // 同一种子生成两份结构同构、实例独立的 schema（决策流逐位一致）
    const rngPrimary = mulberry32(seed)
    const rngSecondary = mulberry32(seed)
    const schema = genSchema(rngPrimary, `Dp${seed}_`, {})
    const schemaSecondary = genSchema(rngSecondary, `Dp${seed}_`, {})

    const primaryDb = new SQLiteDB(':memory:')
    const secondaryDb = new PGLiteDB()
    await primaryDb.open()
    await secondaryDb.open()
    let primary: EntityQueryHandle, secondary: EntityQueryHandle
    try {
        const primarySetup = new DBSetup(schema.entities, schema.relations, primaryDb, schema.mergeLinks.length ? schema.mergeLinks : undefined)
        await primarySetup.createTables()
        primary = new EntityQueryHandle(new EntityToTableMap(primarySetup.map, primarySetup.aliasManager), primaryDb)
        const secondarySetup = new DBSetup(schemaSecondary.entities, schemaSecondary.relations, secondaryDb, schemaSecondary.mergeLinks.length ? schemaSecondary.mergeLinks : undefined)
        await secondarySetup.createTables()
        secondary = new EntityQueryHandle(new EntityToTableMap(secondarySetup.map, secondarySetup.aliasManager), secondaryDb)
    } catch (error) {
        await primaryDb.close()
        await secondaryDb.close()
        return { seed, executed: 0, declarationRejected: true }
    }

    const eventSchema: EventCompletenessSchema = {
        entities: schema.entityNames,
        relations: schema.relationChoices.map(c => c.relation.name!),
    }
    const attrRelated = buildAttrRelatedMap(schema)
    const bijection = new IdBijection()
    const pools: IdPools = new Map(schema.entityNames.map(n => [n, []]))
    const opLog: OpLog[] = []
    let executed = 0

    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-5)
        throw new Error(`[diff-fuzz seed=${seed}] ${message}\nop log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    for (let step = 0; step < opsCount; step++) {
        // 池与意图都来自主库（副库是跟随者）；池顺序 = 查询序（两侧一致性由快照对账保证）
        for (const entityName of schema.entityNames) {
            const rows = await primary.find(entityName, undefined, undefined, ['id'])
            pools.set(entityName, rows.map(r => r.id))
        }
        const intent = await decideNextOp(rngPrimary, schema, pools,
            async (relationName) => (await primary.findRelationByName(relationName, undefined, undefined, ['id'])).map(r => r.id))
        if (!intent) continue

        const context = `step ${step} ${intent.op}`
        let secondaryIntent: Exclude<FuzzOpIntent, null>
        try {
            secondaryIntent = translateIntent(intent, schema, attrRelated, bijection)
        } catch (error) {
            failWith(`${context}: intent translation failed: ${error instanceof Error ? error.message : String(error)}\ndetail: ${JSON.stringify(intent)}`)
        }

        const primEvents: RecordMutationEvent[] = []
        const secEvents: RecordMutationEvent[] = []
        let primError: Error | null = null, secError: Error | null = null
        try {
            await executeOpIntent(primary, intent, primEvents)
        } catch (error) {
            primError = error instanceof Error ? error : new Error(String(error))
        }
        try {
            await executeOpIntent(secondary, secondaryIntent!, secEvents)
        } catch (error) {
            secError = error instanceof Error ? error : new Error(String(error))
        }

        // 1. 错误语义对账
        if ((primError === null) !== (secError === null)) {
            failWith(`${context}: error semantics diverge — SQLite ${primError ? `threw: ${primError.message.slice(0, 140)}` : 'succeeded'}, ` +
                `PGLite ${secError ? `threw: ${secError.message.slice(0, 140)}` : 'succeeded'}\ndetail: ${JSON.stringify(intent)}`)
        }
        if (primError && secError) {
            const primExpected = isExpectedRejection(primError), secExpected = isExpectedRejection(secError)
            if (primExpected !== secExpected) {
                failWith(`${context}: rejection classification diverges — SQLite ${primExpected ? 'expected' : `UNEXPECTED: ${primError.message.slice(0, 140)}`}, ` +
                    `PGLite ${secExpected ? 'expected' : `UNEXPECTED: ${secError.message.slice(0, 140)}`}`)
            }
            if (!primExpected) {
                failWith(`${context}: both drivers threw an UNEXPECTED error: ${primError.message.slice(0, 200)}\ndetail: ${JSON.stringify(intent)}`)
            }
            opLog.push({ step, op: intent.op, detail: intent, outcome: 'rejected-both' })
        } else {
            opLog.push({ step, op: intent.op, detail: intent, outcome: 'ok' })
            executed++
        }

        // 2. 事件流锁步对账（含 create 双射登记；错误路径的部分事件同样必须一致）
        try {
            reconcileEventStreams(primEvents, secEvents, bijection, failWith, context)
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('[diff-fuzz')) throw error
            failWith(`${context}: ${error instanceof Error ? error.message : String(error)}`)
        }

        // 3. 逻辑状态快照对账
        const primSnapshot = await snapshotLogicalState(primary, eventSchema)
        const secSnapshot = await snapshotLogicalState(secondary, eventSchema)
        reconcileSnapshots(primSnapshot, secSnapshot, schema, bijection, failWith, context)
    }

    await primaryDb.close()
    await secondaryDb.close()
    return { seed, executed, declarationRejected: false }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_DIFF_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_DIFF_SEED_COUNT ?? 6)
const OPS = Number(process.env.FUZZ_DIFF_OPS ?? 25)

describe('driver differential fuzz (SQLite vs PGLite, same seed, per-op reconciliation)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: same intent stream yields identical events + logical state on both drivers', async (seed) => {
        const result = await runDifferentialCase(seed, OPS)
        if (!result.declarationRejected) {
            expect(result.executed, `diff seed ${seed} executed no ops`).toBeGreaterThan(0)
        }
    }, 180000)
})
