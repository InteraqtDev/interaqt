/**
 * 写路径结构化 fuzzer（r27 复盘落地项：把格子铺设从「人肉枚举」换成「生成器铺、预言机判」）。
 *
 * 动机（r27 复盘 §四）：维度登记册是反应式的——轴靠 bug 尸检回填；而缺轴无法用清单补
 * （你枚举不出没想到的维度）。r27 F-1 的六种损坏形态放进事件完备性预言机全部当场变红，
 * 它们逃过 26 轮的唯一原因是**这些输入形状从未被生成过**。本 fuzzer 的职责就是生成：
 *
 * - 随机 schema + 随机操作序列：生成器与操作决策器抽取为共享实现
 *   （helpers/fuzzSchema.ts / helpers/fuzzOps.ts，与驱动差分 fuzzer 共用决策流）。
 * - r29 扩展模式（FUZZ_FILTERED=1 或 filtered 描述组）：filtered entity/relation 进入
 *   生成域；操作有概率经 filtered 名写入（概念寄生位置轴的写入面）。
 *
 * 判定（全部复用/扩展既有预言机，见 helpers/eventCompleteness.ts）：
 * 1. 事件完备性（数据 diff ⟺ 事件流，含 payload/端点契约 7 条规则）——非抛错操作逐一对账；
 *    filtered 名按 membership-only 对账（字段 update 事件按契约只在 base 名下发出）；
 * 2. 双向一致性（正反查询同一事实）——每步之后全关系断言；
 * 3. 排他侧唯一（INV-3）——每步之后全 x:1 关系断言；
 * 4. 逻辑 id 唯一（r27 F-1 ⑤⑥ 的损坏面：同一逻辑 id 物理两行）——每步之后全记录名断言；
 * 5. 无身份记录（r27 F-1 ④ 的损坏面：嵌套可见但无 id）——每步之后断言一切查询返回的
 *    嵌套对象凡携带非空值字段必有 id；
 * 6. 配对读取一致性（r28 复盘落地，预言机第 8 条）：实体嵌套读取面与 findRelationByName
 *    面必须给出同一配对集合——「同住 ≠ 配对」家族（幻影读取）的机器化收口；
 * 7. filtered 谓词一致性（r29）：find(filteredName) 的 id 集合必须等于按声明谓词的
 *    **独立 JS 真值**过滤 base 全集的结果（预言机不依赖被测的 SQL 编译）。
 *
 * 错误语义：已知 fail-fast（EXPECTED_REJECTIONS 白名单）是合法拒绝——操作跳过，但内部
 * 一致性仍必须成立（守卫必须在破坏性写入之前抛出）；未知异常 = 发现，带种子报告。
 *
 * 再现：失败信息携带 seed 与操作日志；FUZZ_SEED_START/FUZZ_SEED_COUNT/FUZZ_OPS 环境变量
 * 可扩大探索（CI 跑固定小种子集保证确定性与时长）。
 */
import { expect, test, describe } from "vitest";
import { DBSetup, EntityToTableMap, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";
import {
    snapshotLogicalState,
    expectEventsToExplainDiff,
    assertExclusiveSideUnique,
    assertBidirectionalConsistency,
    EventCompletenessSchema,
} from "./helpers/eventCompleteness.js";
import { mulberry32, genSchema, isExpectedRejection, type FuzzSchema } from "./helpers/fuzzSchema.js";
import { decideNextOp, executeOpIntent, type IdPools } from "./helpers/fuzzOps.js";

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
    // 2/3/5/6. 双向一致 + 排他唯一 + 无身份记录 + 配对读取一致
    for (const choice of schema.relationChoices) {
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
        // 6. 配对读取一致性（预言机第 8 条，r28 幻影配对家族的机器化收口）：
        //    实体嵌套读取面（source→related 对集合）与 link 记录面（findRelationByName 端点对集合）
        //    必须给出同一配对事实。对称关系的嵌套读取是无向扇出，暂由双向一致性覆盖。
        if (!choice.symmetric) {
            const entityPairs = new Set<string>()
            for (const row of rows) {
                const related = row[choice.sourceProperty]
                const items = Array.isArray(related) ? related : (related ? [related] : [])
                for (const item of items as Record<string, unknown>[]) {
                    if (item.id !== null && item.id !== undefined) entityPairs.add(`${row.id}->${item.id}`)
                }
            }
            const links = await handle.findRelationByName(choice.relation.name!, undefined, undefined,
                ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
            const linkPairs = new Set(links.map(link =>
                `${(link.source as { id?: unknown })?.id}->${(link.target as { id?: unknown })?.id}`))
            expect([...entityPairs].sort(), `${label} [pairing-read] ${choice.relation.name}: entity nested-read pairs diverge from link-record pairs`)
                .toEqual([...linkPairs].sort())
        }
    }
    // 7. filtered 谓词一致性（r29）：查询面结果 = 声明谓词的独立 JS 真值 ∘ base 全集
    for (const filtered of schema.filteredEntities) {
        const baseRows = await handle.find(filtered.baseName, undefined, undefined, ['*'])
        const expectedIds = baseRows.filter(row => filtered.predicate(row)).map(row => String(row.id)).sort()
        const filteredRows = await handle.find(filtered.name, undefined, undefined, ['id'])
        const actualIds = filteredRows.map(row => String(row.id)).sort()
        expect(actualIds, `${label} [filtered-predicate] ${filtered.name} membership diverges from declared predicate over ${filtered.baseName}`)
            .toEqual(expectedIds)
    }
    for (const filteredRelation of schema.filteredRelations) {
        const baseLinks = await handle.findRelationByName(filteredRelation.baseChoice.relation.name!, undefined, undefined, ['*'])
        const expectedIds = baseLinks.filter(link => filteredRelation.predicate(link)).map(link => String(link.id)).sort()
        const filteredLinks = await handle.findRelationByName(filteredRelation.name, undefined, undefined, ['id'])
        const actualIds = filteredLinks.map(link => String(link.id)).sort()
        expect(actualIds, `${label} [filtered-predicate] ${filteredRelation.name} membership diverges from declared predicate over ${filteredRelation.baseChoice.relation.name}`)
            .toEqual(expectedIds)
    }
    // 7b. filtered relation 嵌套读取面完备性（r30-A 收口：面 × 名字形态矩阵的缺格）。
    //    r30-A 的教训：filtered-over-combined 的**形状**自 r29 起就在生成域里，此前全绿是因为
    //    没有任何预言机读过「经 filtered 属性名的实体嵌套读取面」——第 6 条（配对读取一致）只读
    //    base 属性面，第 7 条（谓词一致）只读 relation-name 面。生成域 × 预言机读取面才是真覆盖。
    //    断言（r31 起为**相等**）：经 filtered 属性名的嵌套读取配对集合 = link 面
    //    （findRelationByName(filteredName)）配对集合。缺失面 = r30-A 的 prune 误删；
    //    多余面 = 谓词不下推泄漏（r30 记录的 x:1 谓词缺口，r31 enforceXToOnePredicates 收口）。
    for (const filteredRelation of schema.filteredRelations) {
        const { baseChoice, name } = filteredRelation
        const frSourceProperty = `fr_${baseChoice.sourceProperty}`
        const rows = await handle.find(baseChoice.source, undefined, undefined,
            ['id', [frSourceProperty, { attributeQuery: ['id'] }]])
        const nestedPairs = new Set<string>()
        for (const row of rows) {
            const related = row[frSourceProperty]
            const items = Array.isArray(related) ? related : (related ? [related] : [])
            for (const item of items as Record<string, unknown>[]) {
                if (item.id !== null && item.id !== undefined) nestedPairs.add(`${row.id}->${item.id}`)
            }
        }
        const filteredLinkRows = await handle.findRelationByName(name, undefined, undefined,
            ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
        const linkPairs = new Set<string>()
        for (const link of filteredLinkRows) {
            const pair = `${(link.source as { id?: unknown })?.id}->${(link.target as { id?: unknown })?.id}`
            linkPairs.add(pair)
            expect(nestedPairs.has(pair),
                `${label} [filtered-nested-read] ${name}: pairing ${pair} visible on the link face but MISSING from the ${baseChoice.source}.${frSourceProperty} nested read`).toBe(true)
        }
        for (const pair of nestedPairs) {
            expect(linkPairs.has(pair),
                `${label} [filtered-nested-read] ${name}: pairing ${pair} returned by the ${baseChoice.source}.${frSourceProperty} nested read but ABSENT from the link face (predicate leak)`).toBe(true)
        }
        // 7b-deep（r31-S1 收口：挂载深度是读取面的子维度）。同一 filtered 属性在
        //    **x:1 主干之下**（completeXToOneLeftoverRecords 补全枝干）与在顶层（上方 7b）
        //    是两个独立的实现点：r31-S1 中前者把结果挂到 base 属性名下（filtered 名整体缺失、
        //    子集泄漏到 base 名），顶层面全绿。断言（r31 起为**相等**，与 7b 同步升级）：
        //    经「parent --x:1--> host」进入的嵌套读取，host 的 filtered 属性给出与 link 面
        //    完全一致的配对（对可达 host 而言）——缺失 = 挂载缺口，多余 = 谓词泄漏。
        //    纯读取侧断言、零 rng 调用——决策流契约不受影响，既有种子池全部有效。
        const parentEntries: Array<{ parent: string, parentAttr: string }> = []
        for (const choice of schema.relationChoices) {
            if (choice.symmetric) continue
            if (choice.target === baseChoice.source && (choice.relType === 'n:1' || choice.relType === '1:1')) {
                parentEntries.push({ parent: choice.source, parentAttr: choice.sourceProperty })
            }
            if (choice.source === baseChoice.source && (choice.relType === '1:n' || choice.relType === '1:1')) {
                parentEntries.push({ parent: choice.target, parentAttr: choice.targetProperty })
            }
        }
        for (const { parent, parentAttr } of parentEntries) {
            const parentRows = await handle.find(parent, undefined, undefined,
                ['id', [parentAttr, { attributeQuery: ['id', [frSourceProperty, { attributeQuery: ['id'] }]] }]])
            const reachableHostIds = new Set<string>()
            const deepPairs = new Set<string>()
            for (const parentRow of parentRows) {
                const host = parentRow[parentAttr] as Record<string, unknown> | undefined
                if (!host || host.id === null || host.id === undefined) continue
                reachableHostIds.add(String(host.id))
                const related = host[frSourceProperty]
                const items = Array.isArray(related) ? related : (related ? [related] : [])
                for (const item of items as Record<string, unknown>[]) {
                    if (item.id !== null && item.id !== undefined) deepPairs.add(`${host.id}->${item.id}`)
                }
            }
            const reachableLinkPairs = new Set<string>()
            for (const link of filteredLinkRows) {
                const hostId = (link.source as { id?: unknown })?.id
                if (hostId === null || hostId === undefined || !reachableHostIds.has(String(hostId))) continue
                const pair = `${hostId}->${(link.target as { id?: unknown })?.id}`
                reachableLinkPairs.add(pair)
                expect(deepPairs.has(pair),
                    `${label} [filtered-nested-read-deep] ${name}: pairing ${pair} visible on the link face but MISSING from the ${parent}.${parentAttr}.${frSourceProperty} nested read (x:1-trunk mount face)`).toBe(true)
            }
            for (const pair of deepPairs) {
                expect(reachableLinkPairs.has(pair),
                    `${label} [filtered-nested-read-deep] ${name}: pairing ${pair} returned by the ${parent}.${parentAttr}.${frSourceProperty} nested read but ABSENT from the link face (predicate leak on the x:1-trunk face)`).toBe(true)
            }
        }
    }
    // 8. merged (union) 一致性（r29）：find(merged) 的 id 集合 = 各 input id 集合的不相交并
    for (const merged of schema.mergedEntities) {
        const inputIdSets: string[][] = []
        for (const inputName of merged.inputNames) {
            const rows = await handle.find(inputName, undefined, undefined, ['id'])
            inputIdSets.push(rows.map(row => String(row.id)))
        }
        const unionIds = inputIdSets.flat().sort()
        expect(new Set(unionIds).size, `${label} [merged-union] ${merged.name}: input id sets overlap (union base must give disjoint ids)`)
            .toBe(unionIds.length)
        const mergedRows = await handle.find(merged.name, undefined, undefined, ['id'])
        const mergedIds = mergedRows.map(row => String(row.id)).sort()
        expect(mergedIds, `${label} [merged-union] ${merged.name} id set diverges from the union of its inputs (${merged.inputNames.join(' ∪ ')})`)
            .toEqual(unionIds)
    }
}

// ---------- 操作执行 ----------
type OpLog = { step: number, op: string, detail: unknown, outcome: 'ok' | 'rejected', error?: string }

async function refreshPools(handle: EntityQueryHandle, schema: FuzzSchema, pools: IdPools) {
    for (const entityName of schema.entityNames) {
        pools.set(entityName, await collectIds(handle, entityName, false))
    }
}

async function runFuzzCase(seed: number, opsCount: number, mode: 'base' | 'filtered' | 'extended') {
    const includeFiltered = mode !== 'base'
    const includeMerged = mode === 'extended'
    const rng = mulberry32(seed)
    const schema = genSchema(rng, `S${seed}_`, { includeFiltered, includeMerged })
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

    // merged (union) 编译后：merged 名承载 base 事件契约（全量对账），input 名只有成员资格事件
    const mergedInputNames = new Set(schema.mergedEntities.flatMap(m => m.inputNames))
    const eventSchema: EventCompletenessSchema = {
        entities: [
            ...schema.entityNames,
            ...schema.filteredEntities.map(f => f.name),
            ...schema.mergedEntities.map(m => m.name),
        ],
        relations: [...schema.relationChoices.map(c => c.relation.name!), ...schema.filteredRelations.map(f => f.name)],
    }
    // filtered 名与 merged input 名下只有成员资格 create/delete 事件
    // （字段 update 恒以物理 base 名发出）——membership-only 对账
    const membershipOnlyRecords = new Set([
        ...schema.filteredEntities.map(f => f.name),
        ...schema.filteredRelations.map(f => f.name),
        ...mergedInputNames,
    ])
    // filtered 模式下操作有概率经 filtered 名写入（写经 filtered 名解析到 base）
    const targetableEntityNames = [
        ...schema.entityNames.map(name => ({ name, poolName: name })),
        ...schema.filteredEntities.map(f => ({ name: f.name, poolName: f.baseName })),
    ]
    const pools: IdPools = new Map(schema.entityNames.map(n => [n, []]))
    const opLog: OpLog[] = []
    let executed = 0, rejected = 0

    const modeTag = mode === 'base' ? '' : ` ${mode}`
    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-5)
        const schemaDump = process.env.FUZZ_VERBOSE
            ? `\nschema: ${JSON.stringify(schema.relationChoices.map(c => ({ name: c.relation.name, relType: c.relType, source: c.source, target: c.target, sourceProperty: c.sourceProperty, targetProperty: c.targetProperty, reliance: (c.relation as { isTargetReliance?: boolean }).isTargetReliance ?? false, linkProps: c.linkProps, mergeLinks: schema.mergeLinks })), null, 2)}`
                + `\nfiltered: ${JSON.stringify(schema.filteredEntities.map(f => ({ name: f.name, base: f.baseName })))}`
                + `\nmerged: ${JSON.stringify(schema.mergedEntities)}`
            : ''
        throw new Error(`[fuzz seed=${seed}${modeTag}] ${message}${schemaDump}\nop log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    for (let step = 0; step < opsCount; step++) {
        await refreshPools(handle, schema, pools)
        const intent = await decideNextOp(rng, schema, pools,
            (relationName) => collectIds(handle, relationName, true),
            includeFiltered ? targetableEntityNames : undefined)
        if (!intent) continue
        const before = await snapshotLogicalState(handle, eventSchema)
        const events: RecordMutationEvent[] = []
        const detail: unknown = intent
        let threw: Error | null = null
        try {
            await executeOpIntent(handle, intent, events)
        } catch (error) {
            threw = error instanceof Error ? error : new Error(String(error))
        }

        if (threw) {
            opLog.push({ step, op: intent.op, detail, outcome: 'rejected', error: threw.message.slice(0, 160) })
            if (!isExpectedRejection(threw)) {
                failWith(`step ${step} ${intent.op} threw an UNEXPECTED error: ${threw.message}\ndetail: ${JSON.stringify(detail)}`)
            }
            rejected++
        } else {
            opLog.push({ step, op: intent.op, detail, outcome: 'ok' })
            executed++
            // 1. 事件完备性（仅非抛错操作：无事务语义下错误路径允许部分写）
            const after = await snapshotLogicalState(handle, eventSchema)
            try {
                expectEventsToExplainDiff(before, after, events, `[fuzz seed=${seed}${modeTag} step=${step} ${intent.op}]`, {
                    relations: eventSchema.relations,
                    membershipOnlyRecords,
                })
            } catch (error) {
                failWith(`event oracle failed at step ${step} ${intent.op}: ${error instanceof Error ? error.message : String(error)}\ndetail: ${JSON.stringify(detail)}`)
            }
        }

        // 2–7. 结构不变量：每步之后（含合法拒绝之后——守卫必须先于破坏性写入）
        try {
            await assertStructuralInvariants(handle, schema, `[fuzz seed=${seed}${modeTag} step=${step} ${intent.op}(${threw ? 'rejected' : 'ok'})]`)
        } catch (error) {
            failWith(`structural invariant failed after step ${step} ${intent.op} (${threw ? 'rejected op' : 'ok op'}): ${error instanceof Error ? error.message : String(error)}\ndetail: ${JSON.stringify(detail)}`)
        }
    }

    await db.close()
    return { seed, executed, rejected, declarationRejected: false }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_SEED_COUNT ?? 8)
const OPS = Number(process.env.FUZZ_OPS ?? 30)
// filtered 模式的种子宇宙独立（决策流包含 filtered 生成与 filtered 名写入）
const FILTERED_SEED_START = Number(process.env.FUZZ_FILTERED_SEED_START ?? 1)
const FILTERED_SEED_COUNT = Number(process.env.FUZZ_FILTERED_SEED_COUNT ?? 8)

describe('write-path structural fuzz (generator + oracles)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: random schema × random op sequence upholds all oracles', async (seed) => {
        const result = await runFuzzCase(seed, OPS, 'base')
        // 覆盖度自检：非声明期拒绝的种子必须真正执行了操作（防退化为全拒绝的空跑）
        if (!result.declarationRejected) {
            expect(result.executed, `seed ${seed} executed no ops (over-rejection? pools never filled?)`).toBeGreaterThan(0)
        }
    }, 120000)
})

const filteredSeeds = Array.from({ length: FILTERED_SEED_COUNT }, (_, i) => FILTERED_SEED_START + i)
;(filteredSeeds.length ? describe : describe.skip)('write-path structural fuzz — extended mode (filtered/merged entities in the generation domain, r29)', () => {
    // extended = filtered entity/relation + merged (union) entity 同时进入生成域；
    // 声明期拒绝率抽样监控（防生成域塌缩为全拒绝的假绿）。
    const declarationRejections: number[] = []
    test.each((filteredSeeds.length ? filteredSeeds : [0]).map(s => [s]))('extended seed %i: membership/union/predicate consistency uphold all oracles', async (seed) => {
        const result = await runFuzzCase(seed, OPS, 'extended')
        if (result.declarationRejected) {
            declarationRejections.push(seed)
            expect(declarationRejections.length, `extended mode declaration-rejection rate too high (rejected seeds: ${declarationRejections.join(',')}) — generation domain collapsed`)
                .toBeLessThanOrEqual(Math.max(2, Math.floor(filteredSeeds.length * 0.3)))
        } else {
            expect(result.executed, `extended seed ${seed} executed no ops (over-rejection? pools never filled?)`).toBeGreaterThan(0)
        }
    }, 120000)
})
