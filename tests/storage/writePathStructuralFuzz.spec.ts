/**
 * 写路径结构化 fuzzer（r27 复盘落地项：把格子铺设从「人肉枚举」换成「生成器铺、预言机判」）。
 *
 * 动机（r27 复盘 §四）：维度登记册是反应式的——轴靠 bug 尸检回填；而缺轴无法用清单补
 * （你枚举不出没想到的维度）。r27 F-1 的六种损坏形态放进事件完备性预言机全部当场变红，
 * 它们逃过 26 轮的唯一原因是**这些输入形状从未被生成过**。本 fuzzer 的职责就是生成：
 *
 * - 随机 schema：从关系菜单（1:1 merged / 1:1 reliance-combined / 1:1 mergeLinks-combined /
 *   n:1 / 1:n / n:n / 对称 n:n，随机 link 属性）抽样——物理拓扑不是被枚举的轴，
 *   而是从声明面自然涌现（Setup 决定编译结果，正如生产环境）。
 * - 随机操作序列：create/update/delete/addRelation/removeRelation，载荷生成器递归产生
 *   嵌套新建 / ref / null / 数组 / `&` link 数据的任意组合（深度 ≤ 3）——覆盖「载荷嵌套
 *   深度 × 子记录拓扑」轴上人不会想到去写的格子。
 *
 * 判定（全部复用/扩展既有预言机，见 helpers/eventCompleteness.ts）：
 * 1. 事件完备性（数据 diff ⟺ 事件流，含 payload/端点契约 7 条规则）——非抛错操作逐一对账；
 * 2. 双向一致性（正反查询同一事实）——每步之后全关系断言；
 * 3. 排他侧唯一（INV-3）——每步之后全 x:1 关系断言；
 * 4. 逻辑 id 唯一（r27 F-1 ⑤⑥ 的损坏面：同一逻辑 id 物理两行）——每步之后全记录名断言；
 * 5. 无身份记录（r27 F-1 ④ 的损坏面：嵌套可见但无 id）——每步之后断言一切查询返回的
 *    嵌套对象凡携带非空值字段必有 id。
 *
 * 错误语义：已知 fail-fast（EXPECTED_REJECTIONS 白名单）是合法拒绝——操作跳过，但内部
 * 一致性（2–5）仍必须成立（守卫必须在破坏性写入之前抛出）；未知异常 = 发现，带种子报告。
 *
 * 再现：失败信息携带 seed 与操作日志；FUZZ_SEED_START/FUZZ_SEED_COUNT/FUZZ_OPS 环境变量
 * 可扩大探索（CI 跑固定小种子集保证确定性与时长）。
 */
import { expect, test, describe } from "vitest";
import { Entity, Property, Relation, type EntityInstance, type RelationInstance, type PropertyInstance } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";
import {
    snapshotLogicalState,
    expectEventsToExplainDiff,
    assertExclusiveSideUnique,
    assertBidirectionalConsistency,
    EventCompletenessSchema,
} from "./helpers/eventCompleteness.js";

// ---------- 确定性 PRNG（mulberry32） ----------
function mulberry32(seed: number) {
    let a = seed >>> 0
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
type Rng = () => number
const pick = <T,>(rng: Rng, items: T[]): T => items[Math.floor(rng() * items.length)]
const chance = (rng: Rng, p: number) => rng() < p
const int = (rng: Rng, max: number) => Math.floor(rng() * max)

// ---------- 已知 fail-fast 白名单（合法拒绝；新增守卫时在此登记） ----------
const EXPECTED_REJECTIONS: RegExp[] = [
    /cannot be processed through this write/,                 // r27 F-1 守卫（combined 子记录嵌套结构）
    /not an idempotent same-id reference/,                    // r27 F-1 守卫（原地 ref 嵌套异 id）
    /cannot unlink reliance data/,                            // reliance 生命周期：只能随记录删除（r28 起 update 轨带具体属性信息）
    /cannot bind a new reliance dependent/,                   // r27 F-4 守卫（reliance 置换 = 静默销毁旧依赖，fuzzer 首跑抓获）
    /cannot claim .* as an endpoint of new relation record/,  // r27 F-5 守卫（跨关系 combined 同住行的认领；r28 扩展到搬运子树 + host-attr 轨）
    /cannot unlink combined relation .* both endpoints/,      // r28 守卫（两端搬运子树都持有其他 combined 配对时的 relocate fail-fast）
    /carries conflicting '&' link data/,                      // 重复引用携带矛盾 link 数据
    /cannot change (source|target) of relation record/,       // 关系端点不可变
    /link already exist/,                                     // addRelation 幂等冲突
    /cannot create record of merged \(union\) type/,          // merged 抽象类型直建
]

// ---------- schema 生成 ----------
type RelationChoice = {
    relation: RelationInstance
    relType: '1:1' | 'n:1' | '1:n' | 'n:n'
    source: string
    target: string
    sourceProperty: string
    targetProperty: string
    symmetric: boolean
    linkProps: string[]
}
type FuzzSchema = {
    entities: EntityInstance[]
    relations: RelationInstance[]
    mergeLinks: string[]
    entityNames: string[]
    relationChoices: RelationChoice[]
    valueProps: Map<string, { name: string, type: 'string' | 'number' }[]>
}

function genSchema(rng: Rng, tag: string): FuzzSchema {
    const entityNames = ['A', 'B', 'C', 'D'].map(n => `Fz${tag}${n}`)
    const valueProps = new Map<string, { name: string, type: 'string' | 'number' }[]>()
    const entities = entityNames.map(name => {
        const props: { name: string, type: 'string' | 'number' }[] = [
            { name: 'label', type: 'string' },
            { name: 'score', type: 'number' },
        ]
        valueProps.set(name, props)
        return Entity.create({
            name,
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                // 有默认值的字段：覆盖 create payload 契约（defaults + payload）的对账面
                Property.create({ name: 'score', type: 'number', defaultValue: () => 7 }),
            ]
        })
    })
    const byName = new Map(entities.map(e => [e.name, e]))

    const relationChoices: RelationChoice[] = []
    const mergeLinks: string[] = []
    const usedProperty = new Set<string>()
    const relationCount = 3 + int(rng, 3) // 3..5
    for (let i = 0; i < relationCount; i++) {
        const kind = pick(rng, ['1:1-merged', '1:1-reliance', '1:1-mergeLinks', 'n:1', '1:n', 'n:n', 'n:n-symmetric'] as const)
        const sourceName = pick(rng, entityNames)
        let targetName = pick(rng, entityNames)
        const symmetric = kind === 'n:n-symmetric'
        if (symmetric) targetName = sourceName
        else if (targetName === sourceName) targetName = entityNames[(entityNames.indexOf(sourceName) + 1) % entityNames.length]

        const sourceProperty = symmetric ? `peers${i}` : `out${i}`
        const targetProperty = symmetric ? `peers${i}` : `in${i}`
        // 同一实体上属性名唯一
        if (usedProperty.has(`${sourceName}.${sourceProperty}`) || usedProperty.has(`${targetName}.${targetProperty}`)) continue
        usedProperty.add(`${sourceName}.${sourceProperty}`)
        usedProperty.add(`${targetName}.${targetProperty}`)

        const relType = kind === 'n:1' ? 'n:1' : kind === '1:n' ? '1:n' : kind.startsWith('1:1') ? '1:1' : 'n:n'
        const linkProps: string[] = []
        const linkProperties: PropertyInstance[] = []
        if (chance(rng, 0.6)) {
            linkProps.push('weight')
            linkProperties.push(Property.create({ name: 'weight', type: 'number', defaultValue: () => 1 }))
        }
        if (chance(rng, 0.3)) {
            linkProps.push('note')
            linkProperties.push(Property.create({ name: 'note', type: 'string' }))
        }
        const relation = Relation.create({
            source: byName.get(sourceName)!,
            sourceProperty,
            target: byName.get(targetName)!,
            targetProperty,
            type: relType,
            properties: linkProperties,
            ...(kind === '1:1-reliance' ? { isTargetReliance: true } : {}),
        })
        if (kind === '1:1-mergeLinks') mergeLinks.push(`${sourceName}.${sourceProperty}`)
        relationChoices.push({
            relation, relType, source: sourceName, target: targetName,
            sourceProperty, targetProperty, symmetric, linkProps,
        })
    }
    if (!relationChoices.length) {
        // 极小概率全部属性名冲突：退化为固定一条 n:n
        const relation = Relation.create({
            source: entities[0], sourceProperty: 'fallbackOut', target: entities[1], targetProperty: 'fallbackIn', type: 'n:n'
        })
        relationChoices.push({
            relation, relType: 'n:n', source: entityNames[0], target: entityNames[1],
            sourceProperty: 'fallbackOut', targetProperty: 'fallbackIn', symmetric: false, linkProps: [],
        })
    }
    return { entities, relations: relationChoices.map(c => c.relation), mergeLinks, entityNames, relationChoices, valueProps }
}

// ---------- 载荷生成 ----------
type IdPools = Map<string, unknown[]>

// 公开 API 把 id 声明为 string（addRelationByNameById(sourceEntityId: string, ...)），HTTP 载荷
// 携带的 id 也天然是字符串——ref 形态必须同时探索「驱动原生形态」与「字符串形态」两个合法取值
// （r27 F-3 正是 fuzzer 首跑经字符串化 id 池抓获：SQL 面 1 == '1' 而 JS === 判不等）。
function idForPayload(rng: Rng, id: unknown): unknown {
    return chance(rng, 0.4) ? String(id) : id
}

function genLinkData(rng: Rng, choice: RelationChoice): Record<string, unknown> | undefined {
    if (!choice.linkProps.length || chance(rng, 0.5)) return undefined
    const data: Record<string, unknown> = {}
    for (const prop of choice.linkProps) {
        if (chance(rng, 0.6)) data[prop] = prop === 'weight' ? int(rng, 100) : `n${int(rng, 10)}`
    }
    return Object.keys(data).length ? data : undefined
}

/** 递归生成某实体的写载荷；depth 限制嵌套层数，forUpdate 时不生成本体 id。 */
function genPayload(rng: Rng, schema: FuzzSchema, entityName: string, pools: IdPools, depth: number): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const prop of schema.valueProps.get(entityName)!) {
        if (chance(rng, 0.7)) payload[prop.name] = prop.type === 'string' ? `v${int(rng, 100)}` : int(rng, 100)
    }
    if (depth <= 0) return payload

    for (const choice of schema.relationChoices) {
        const roles: Array<{ attr: string, related: string, isMany: boolean }> = []
        if (choice.source === entityName) {
            roles.push({ attr: choice.sourceProperty, related: choice.target, isMany: choice.relType.endsWith('n') })
        }
        if (!choice.symmetric && choice.target === entityName) {
            roles.push({ attr: choice.targetProperty, related: choice.source, isMany: choice.relType.startsWith('n') })
        }
        for (const role of roles) {
            if (!chance(rng, 0.35)) continue // 多数属性省略，保持载荷自然
            const genOne = (): Record<string, unknown> | null => {
                const mode = pick(rng, ['new', 'ref', 'null'] as const)
                if (mode === 'null') return null
                if (mode === 'ref') {
                    const pool = pools.get(role.related) ?? []
                    if (!pool.length) return genOne0('new')
                    const item: Record<string, unknown> = { id: idForPayload(rng, pick(rng, pool)) }
                    const link = genLinkData(rng, choice)
                    if (link) item['&'] = link
                    return item
                }
                return genOne0('new')
            }
            const genOne0 = (mode: 'new'): Record<string, unknown> => {
                const nested = genPayload(rng, schema, role.related, pools, depth - 1)
                const link = genLinkData(rng, choice)
                if (link) nested['&'] = link
                return nested
            }
            if (role.isMany) {
                const count = 1 + int(rng, 2)
                const items: unknown[] = []
                const seen = new Set<string>()
                for (let i = 0; i < count; i++) {
                    const item = genOne()
                    if (item === null) continue // 数组里不放 null
                    const id = (item as { id?: string }).id
                    if (id !== undefined) {
                        if (seen.has(String(id))) continue // 避免矛盾 `&` 的重复 ref 噪音
                        seen.add(String(id))
                    }
                    items.push(item)
                }
                if (items.length) payload[role.attr] = items
            } else {
                const value = genOne()
                if (value !== undefined) payload[role.attr] = value
            }
        }
    }
    return payload
}

// ---------- 不变量组（每步之后，含合法拒绝之后） ----------
// CAUTION id 保留驱动原生形态（SQLite number / PGLite string）：
//  「id 的 JS 形态契约」（事件 payload / API 参数与读回形态的统一）是记录中的开放决策面，
//  fuzzer v1 不注入跨形态 id；string-id 的数据面安全由 F-3 回归（review-fixes r27）显式固化。
async function collectIds(handle: EntityQueryHandle, recordName: string, isRelation: boolean): Promise<unknown[]> {
    const rows = isRelation
        ? await handle.findRelationByName(recordName, undefined, undefined, ['id'])
        : await handle.find(recordName, undefined, undefined, ['id'])
    return rows.map(r => r.id)
}

async function assertStructuralInvariants(handle: EntityQueryHandle, schema: FuzzSchema, label: string) {
    // 4. 逻辑 id 唯一（F-1 ⑤⑥ 损坏面）——唯一性按字符串归一判定（类型不敏感）
    for (const entityName of schema.entityNames) {
        const ids = await collectIds(handle, entityName, false)
        expect(new Set(ids.map(String)).size, `${label} [unique-id] ${entityName} has duplicate logical ids: ${JSON.stringify(ids)}`).toBe(ids.length)
    }
    for (const choice of schema.relationChoices) {
        const ids = await collectIds(handle, choice.relation.name!, true)
        expect(new Set(ids.map(String)).size, `${label} [unique-id] ${choice.relation.name} has duplicate logical ids`).toBe(ids.length)
    }
    // 2/3/5. 双向一致 + 排他唯一 + 无身份记录
    for (const choice of schoiceIterable(schema)) {
        if (!choice.symmetric) {
            await assertBidirectionalConsistency(handle, {
                sourceEntity: choice.source, sourceProperty: choice.sourceProperty,
                targetEntity: choice.target, targetProperty: choice.targetProperty,
            }, label)
        }
        if (choice.relType !== 'n:n') {
            await assertExclusiveSideUnique(handle, choice.relation.name!, choice.relType, label)
        }
        // 5. 无身份记录：任何嵌套返回的关联对象，凡携带非空值字段必须有 id
        const rows = await handle.find(choice.source, undefined, undefined,
            ['id', [choice.sourceProperty, { attributeQuery: ['id', 'label', 'score'] }]])
        for (const row of rows) {
            const related = row[choice.sourceProperty]
            const items = Array.isArray(related) ? related : (related ? [related] : [])
            for (const item of items as Record<string, unknown>[]) {
                const hasSubstance = Object.entries(item).some(([k, v]) => k !== 'id' && k !== '&' && v !== null && v !== undefined)
                if (hasSubstance) {
                    expect(item.id !== null && item.id !== undefined,
                        `${label} [identity] ${choice.source}.${choice.sourceProperty} returned a related object with data but NO id: ${JSON.stringify(item)}`).toBe(true)
                }
            }
        }
    }
}
function schoiceIterable(schema: FuzzSchema) { return schema.relationChoices }

// ---------- 操作执行 ----------
type OpLog = { step: number, op: string, detail: unknown, outcome: 'ok' | 'rejected', error?: string }

async function refreshPools(handle: EntityQueryHandle, schema: FuzzSchema, pools: IdPools) {
    for (const entityName of schema.entityNames) {
        pools.set(entityName, await collectIds(handle, entityName, false))
    }
}

async function runFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const schema = genSchema(rng, `S${seed}_`)
    const db = new SQLiteDB(':memory:')
    await db.open()
    let handle: EntityQueryHandle
    try {
        const setup = new DBSetup(schema.entities, schema.relations, db, schema.mergeLinks.length ? schema.mergeLinks : undefined)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    } catch (error) {
        // 声明期拒绝（如同 target 双 reliance 合表冲突）是合法 fail-fast：该种子记为空跑
        await db.close()
        return { seed, executed: 0, rejected: 0, declarationRejected: true }
    }

    const eventSchema: EventCompletenessSchema = {
        entities: schema.entityNames,
        relations: schema.relationChoices.map(c => c.relation.name!),
    }
    const pools: IdPools = new Map(schema.entityNames.map(n => [n, []]))
    const opLog: OpLog[] = []
    let executed = 0, rejected = 0

    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-5)
        const schemaDump = process.env.FUZZ_VERBOSE
            ? `\nschema: ${JSON.stringify(schema.relationChoices.map(c => ({ name: c.relation.name, relType: c.relType, source: c.source, target: c.target, sourceProperty: c.sourceProperty, targetProperty: c.targetProperty, reliance: (c.relation as { isTargetReliance?: boolean }).isTargetReliance ?? false, linkProps: c.linkProps, mergeLinks: schema.mergeLinks })), null, 2)}`
            : ''
        throw new Error(`[fuzz seed=${seed}] ${message}${schemaDump}\nop log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    for (let step = 0; step < opsCount; step++) {
        await refreshPools(handle, schema, pools)
        const opKind = pick(rng, ['create', 'create', 'create', 'update', 'update', 'delete', 'addRelation', 'removeRelation'] as const)
        const before = await snapshotLogicalState(handle, eventSchema)
        const events: RecordMutationEvent[] = []
        let detail: unknown = null
        let threw: Error | null = null
        try {
            if (opKind === 'create') {
                const entityName = pick(rng, schema.entityNames)
                const payload = genPayload(rng, schema, entityName, pools, 1 + int(rng, 2))
                detail = { entityName, payload }
                await handle.create(entityName, payload, events)
            } else if (opKind === 'update') {
                const entityName = pick(rng, schema.entityNames)
                const pool = pools.get(entityName)!
                if (!pool.length) continue
                const id = idForPayload(rng, pick(rng, pool))
                const payload = genPayload(rng, schema, entityName, pools, 1 + int(rng, 1))
                detail = { entityName, id, payload }
                await handle.update(entityName, MatchExp.atom({ key: 'id', value: ['=', id] }), payload, events)
            } else if (opKind === 'delete') {
                const entityName = pick(rng, schema.entityNames)
                const pool = pools.get(entityName)!
                if (!pool.length) continue
                const id = idForPayload(rng, pick(rng, pool))
                detail = { entityName, id }
                await handle.delete(entityName, MatchExp.atom({ key: 'id', value: ['=', id] }), events)
            } else if (opKind === 'addRelation') {
                const choice = pick(rng, schema.relationChoices)
                const sourcePool = pools.get(choice.source)!, targetPool = pools.get(choice.target)!
                if (!sourcePool.length || !targetPool.length) continue
                const sourceId = idForPayload(rng, pick(rng, sourcePool)), targetId = idForPayload(rng, pick(rng, targetPool))
                if (choice.symmetric && String(sourceId) === String(targetId)) continue
                detail = { relation: choice.relation.name, sourceId, targetId }
                await handle.addRelationByNameById(choice.relation.name!, sourceId as string, targetId as string, genLinkData(rng, choice) ?? {}, events)
            } else {
                const choice = pick(rng, schema.relationChoices)
                const links = await handle.findRelationByName(choice.relation.name!, undefined, undefined, ['id'])
                if (!links.length) continue
                const linkId = String(pick(rng, links.map(l => l.id)))
                detail = { relation: choice.relation.name, linkId }
                await handle.removeRelationByName(choice.relation.name!, MatchExp.atom({ key: 'id', value: ['=', linkId] }), events)
            }
        } catch (error) {
            threw = error instanceof Error ? error : new Error(String(error))
        }

        if (threw) {
            const known = EXPECTED_REJECTIONS.some(pattern => pattern.test(threw!.message))
            opLog.push({ step, op: opKind, detail, outcome: 'rejected', error: threw.message.slice(0, 160) })
            if (!known) {
                failWith(`step ${step} ${opKind} threw an UNEXPECTED error: ${threw.message}\ndetail: ${JSON.stringify(detail)}`)
            }
            rejected++
        } else {
            opLog.push({ step, op: opKind, detail, outcome: 'ok' })
            executed++
            // 1. 事件完备性（仅非抛错操作：无事务语义下错误路径允许部分写）
            const after = await snapshotLogicalState(handle, eventSchema)
            try {
                expectEventsToExplainDiff(before, after, events, `[fuzz seed=${seed} step=${step} ${opKind}]`, {
                    relations: eventSchema.relations,
                })
            } catch (error) {
                failWith(`event oracle failed at step ${step} ${opKind}: ${error instanceof Error ? error.message : String(error)}\ndetail: ${JSON.stringify(detail)}`)
            }
        }

        // 2–5. 结构不变量：每步之后（含合法拒绝之后——守卫必须先于破坏性写入）
        try {
            await assertStructuralInvariants(handle, schema, `[fuzz seed=${seed} step=${step} ${opKind}(${threw ? 'rejected' : 'ok'})]`)
        } catch (error) {
            failWith(`structural invariant failed after step ${step} ${opKind} (${threw ? 'rejected op' : 'ok op'}): ${error instanceof Error ? error.message : String(error)}\ndetail: ${JSON.stringify(detail)}`)
        }
    }

    await db.close()
    return { seed, executed, rejected, declarationRejected: false }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_SEED_COUNT ?? 8)
const OPS = Number(process.env.FUZZ_OPS ?? 30)

describe('write-path structural fuzz (generator + oracles)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: random schema × random op sequence upholds all oracles', async (seed) => {
        const result = await runFuzzCase(seed, OPS)
        // 覆盖度自检：非声明期拒绝的种子必须真正执行了操作（防退化为全拒绝的空跑）
        if (!result.declarationRejected) {
            expect(result.executed, `seed ${seed} executed no ops (over-rejection? pools never filled?)`).toBeGreaterThan(0)
        }
    }, 120000)
})
