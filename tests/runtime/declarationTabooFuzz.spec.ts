/**
 * 声明面 taboo 形态守卫一致性套件（quality-plan 支柱 II「让半支持不可表达」的声明面
 * 机器化；r31 操作性规则 4：「声明空间的冲突形态进生成域——声明期 fail-fast 的存在性
 * 只有 taboo 形状能验证」；r30 规则 4：未进生成域的层靠 fail-fast 兜底）。
 *
 * 机制：每个 taboo 格在**随机环绕 schema**（共享 genSchema，独立种子宇宙）之上叠加
 * 一个冲突/退化声明，断言它在登记的阶段以登记的错误族被拒绝——守卫必须对环绕上下文
 * 不敏感（同一守卫在任意 schema 里都响）。合法双胞胎格（同型同名 merged 属性、合法
 * keys、合法活动图）断言完整可用（setup + 冒烟写读）——防守卫过度收紧。
 *
 * 每格 × 3 个环绕种子。新增声明期守卫时在 TABOO_CELLS 登记新格（守卫清单即测试）。
 *
 * 契约笔记（本套件钉住的现状）：
 * - filtered matchExpression 引用未声明属性：setup 期接受，首次 base 写入 fail-loud
 *   （`attribute ... not found`）。声明期拒绝是理想态（登记为改进项），本格防止其
 *   退化为静默空集。
 * - 同 current 同 trigger 不同 next 的歧义 SM transfers：声明期接受，触发写入时
 *   fail-loud（`transition is ambiguous`）——钉住「绝不静默取首条」。
 */
import { describe, expect, test } from "vitest";
import {
    Action, Activity, ActivityGroup, ActivityManager, Controller, Dictionary, Entity,
    Interaction, KlassByName, MonoSystem, Property, StateMachine,
    StateNode, StateTransfer, Transfer, Transform,
} from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import { mulberry32, genSchema, type Rng } from "../storage/helpers/fuzzSchema.js";

type SurroundingSchema = ReturnType<typeof genSchema>

type TabooCell = {
    name: string
    /**
     * 返回被拒绝阶段的动作：
     * - declare：动作本身（Klass create）应抛出；
     * - construct：new Controller / new ActivityManager 应抛出；
     * - setup：controller.setup(true) 应 reject；
     * - firstUse：声明期全部通过，返回的 use() 动作应抛出（deferred fail-loud 契约钉住）。
     */
    run: (surrounding: SurroundingSchema, rng: Rng, tag: string) => Promise<{
        phase: 'declare' | 'construct' | 'setup' | 'firstUse'
        action: () => Promise<unknown> | unknown
        cleanup?: () => Promise<void>
    }>
    expectedError: RegExp
}

const mkEntity = (name: string, extraProps: unknown[] = []) => Entity.create({
    name,
    properties: [
        Property.create({ name: 'label', type: 'string' }),
        Property.create({ name: 'score', type: 'number' }),
        ...(extraProps as any[]),
    ],
})

async function constructController(surrounding: SurroundingSchema, extra: {
    entities?: unknown[], relations?: unknown[], dict?: unknown[], eventSources?: unknown[],
}) {
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: [...surrounding.entities, ...(extra.entities ?? [])] as any,
        relations: [...surrounding.relations, ...(extra.relations ?? [])] as any,
        dict: (extra.dict ?? []) as any,
        eventSources: (extra.eventSources ?? []) as any,
    })
    return { system, controller }
}

const TABOO_CELLS: TabooCell[] = [
    {
        // r31-C1：merged 同名异型属性 —— 同名 ⇒ 同物理列 ⇒ 必须同型
        name: 'merged inputs with same-name DIFFERENT-type property',
        expectedError: /conflicts with the already-merged declaration/,
        run: async (surrounding, rng, tag) => {
            const X = mkEntity(`Tb${tag}X`, [Property.create({ name: 'shade', type: 'number' })])
            const Y = mkEntity(`Tb${tag}Y`, [Property.create({ name: 'shade', type: 'string' })])
            const M = Entity.create({ name: `Tb${tag}M`, inputEntities: [X, Y] })
            return {
                phase: 'setup',
                action: async () => {
                    const { system, controller } = await constructController(surrounding, { entities: [X, Y, M] })
                    try { await controller.setup(true) } finally { await system.destroy().catch(() => {}) }
                },
            }
        },
    },
    {
        // r32：重复 Dictionary 名 —— 两个声明读写同一全局值
        name: 'duplicate Dictionary names',
        expectedError: /Duplicate Dictionary name/,
        run: async (surrounding, rng, tag) => ({
            phase: 'construct',
            action: async () => constructController(surrounding, {
                dict: [
                    Dictionary.create({ name: `tb${tag}dup`, type: 'string', collection: false }),
                    Dictionary.create({ name: `tb${tag}dup`, type: 'number', collection: false }),
                ],
            }),
        }),
    },
    {
        // r31-H7：trigger 模式外层字段 typo —— deepPartialMatch 永不命中（静默死转移）
        name: 'StateMachine trigger with a typo pattern field',
        expectedError: /unknown pattern field "recrod"/,
        run: async (surrounding, rng, tag) => {
            const s0 = StateNode.create({ name: 's0' })
            const s1 = StateNode.create({ name: 's1' })
            const host = mkEntity(`Tb${tag}H`, [Property.create({
                name: 'flag', type: 'string',
                computation: StateMachine.create({
                    states: [s0, s1], initialState: s0,
                    transfers: [StateTransfer.create({
                        current: s0, next: s1,
                        trigger: { recordName: `Tb${tag}H`, type: 'update', recrod: { label: 'x' } } as any,
                        computeTarget: (e: any) => ({ id: e.record.id }),
                    })],
                }),
            })])
            return { phase: 'construct', action: async () => constructController(surrounding, { entities: [host] }) }
        },
    },
    {
        // r31：keys 只在 update 事件上存在 —— create 模式上的 keys 永不命中
        name: 'StateMachine trigger keys on a create pattern',
        expectedError: /keys can only be declared on 'update' patterns/,
        run: async (surrounding, rng, tag) => {
            const s0 = StateNode.create({ name: 's0' })
            const s1 = StateNode.create({ name: 's1' })
            const host = mkEntity(`Tb${tag}KC`, [Property.create({
                name: 'flag', type: 'string',
                computation: StateMachine.create({
                    states: [s0, s1], initialState: s0,
                    transfers: [StateTransfer.create({
                        current: s0, next: s1,
                        trigger: { recordName: `Tb${tag}KC`, type: 'create', keys: ['label'] } as any,
                        computeTarget: (e: any) => ({ id: e.record.id }),
                    })],
                }),
            })])
            return { phase: 'construct', action: async () => constructController(surrounding, { entities: [host] }) }
        },
    },
    {
        // r31：eventDep keys 引用未声明属性 —— 永不命中的死声明
        name: 'Transform eventDep keys with an undeclared property name',
        expectedError: /does not match any declared property/,
        run: async (surrounding, rng, tag) => {
            const host = mkEntity(`Tb${tag}KY`)
            const derived = Entity.create({
                name: `Tb${tag}KYd`,
                properties: [Property.create({ name: 'note', type: 'string' })],
                computation: Transform.create({
                    eventDeps: { dep: { recordName: `Tb${tag}KY`, type: 'update', keys: ['labell'] } },
                    callback: () => null,
                } as any),
            })
            return { phase: 'construct', action: async () => constructController(surrounding, { entities: [host, derived] }) }
        },
    },
    {
        // r31：record 模式必须是普通对象 —— 原始值与对象事件永不相等
        name: 'Transform eventDep with a non-object record pattern',
        expectedError: /"record" must be a plain object/,
        run: async (surrounding, rng, tag) => {
            const host = mkEntity(`Tb${tag}NR`)
            const derived = Entity.create({
                name: `Tb${tag}NRd`,
                properties: [Property.create({ name: 'note', type: 'string' })],
                computation: Transform.create({
                    eventDeps: { dep: { recordName: `Tb${tag}NR`, type: 'update', record: 'published' } },
                    callback: () => null,
                } as any),
            })
            return { phase: 'construct', action: async () => constructController(surrounding, { entities: [host, derived] }) }
        },
    },
    {
        // r31-H6：非函数 defaultValue —— 写路径静默忽略字面量
        name: 'Property with a non-function defaultValue literal',
        expectedError: /defaultValue must be a function/,
        run: async () => ({
            phase: 'declare',
            action: () => Property.create({ name: 'bad', type: 'string', defaultValue: 'user' as any }),
        }),
    },
    {
        // 活动层：空 group 永远无法完成（静默死锁）
        name: 'Activity with an empty group',
        expectedError: /has no child activities/,
        run: async (surrounding, rng, tag) => {
            const mk = (n: string) => Interaction.create({ name: n, action: Action.create({ name: n }) })
            const head = mk(`tb${tag}head`)
            const group = ActivityGroup.create({ type: 'every', activities: [] })
            const activity = Activity.create({
                name: `tb${tag}empty`, interactions: [head], groups: [group],
                transfers: [Transfer.create({ name: 't', source: head, target: group })],
            })
            return { phase: 'construct', action: () => new ActivityManager([activity]) }
        },
    },
    {
        // r30-D2：transfer 穿透 group 内嵌节点 —— 跨分支改写 next 指针
        name: 'Activity transfer reaching into a nested group node',
        expectedError: /not one of this activity's own interactions or groups/,
        run: async (surrounding, rng, tag) => {
            const mk = (n: string) => Interaction.create({ name: n, action: Action.create({ name: n }) })
            const head = mk(`tb${tag}chead`)
            const a1 = mk(`tb${tag}ca1`)
            const b1 = mk(`tb${tag}cb1`)
            const group = ActivityGroup.create({
                type: 'any',
                activities: [
                    Activity.create({ name: `tb${tag}cbrA`, interactions: [a1] }),
                    Activity.create({ name: `tb${tag}cbrB`, interactions: [b1] }),
                ],
            })
            const activity = Activity.create({
                name: `tb${tag}cross`, interactions: [head], groups: [group],
                transfers: [
                    Transfer.create({ name: 't1', source: head, target: group }),
                    Transfer.create({ name: 't2', source: a1, target: b1 }),
                ],
            })
            return { phase: 'construct', action: () => new ActivityManager([activity]) }
        },
    },
    {
        // 活动层：同一 interaction 实例复用 —— 图节点静默覆盖
        name: 'Activity reusing one Interaction instance twice',
        expectedError: /appears more than once/,
        run: async (surrounding, rng, tag) => {
            const mk = (n: string) => Interaction.create({ name: n, action: Action.create({ name: n }) })
            const one = mk(`tb${tag}dup1`)
            const other = mk(`tb${tag}dup2`)
            const activity = Activity.create({
                name: `tb${tag}dupact`, interactions: [one, other, one] as any,
                transfers: [Transfer.create({ name: 't', source: one, target: other })],
            })
            return { phase: 'construct', action: () => new ActivityManager([activity]) }
        },
    },
    {
        // 活动层：同源多 transfer —— 单 next 指针被静默覆盖
        name: 'Activity with two transfers from one source',
        expectedError: /multiple transfers from the same source|start node must one|end node must be one/,
        run: async (surrounding, rng, tag) => {
            const mk = (n: string) => Interaction.create({ name: n, action: Action.create({ name: n }) })
            const a = mk(`tb${tag}m1`), b = mk(`tb${tag}m2`), c = mk(`tb${tag}m3`)
            const activity = Activity.create({
                name: `tb${tag}multi`, interactions: [a, b, c],
                transfers: [
                    Transfer.create({ name: 't1', source: a, target: b }),
                    Transfer.create({ name: 't2', source: a, target: c }),
                ],
            })
            return { phase: 'construct', action: () => new ActivityManager([activity]) }
        },
    },
    {
        // 契约钉住（现状 = deferred fail-loud）：filtered matchExpression 引用未声明属性。
        // setup 接受、首次 base 写入抛「attribute ... not found」——本格防止该形态
        // 退化为静默空集/静默全集；声明期拒绝是登记的改进项。
        name: 'filtered entity predicate on an undeclared property (deferred fail-loud pinned)',
        expectedError: /attribute .* not found|not found in/,
        run: async (surrounding, rng, tag) => {
            const base = mkEntity(`Tb${tag}FB`)
            const filtered = Entity.create({
                name: `Tb${tag}FF`, baseEntity: base,
                matchExpression: MatchExp.atom({ key: 'nonexistent', value: ['=', 'hot'] }),
            })
            const { system, controller } = await constructController(surrounding, { entities: [base, filtered] })
            await controller.setup(true)
            return {
                phase: 'firstUse',
                action: () => system.storage.create(`Tb${tag}FB`, { label: 'hot' }),
                cleanup: () => system.destroy(),
            }
        },
    },
    {
        // 契约钉住（现状 = use-time fail-loud）：同 current 同 trigger 不同 next 的歧义
        // transfers——触发写入必须抛 ambiguous（绝不静默取首条）。
        name: 'ambiguous StateMachine transfers (same current+trigger, different next) fail loud at the triggering write',
        expectedError: /transition is ambiguous/,
        run: async (surrounding, rng, tag) => {
            const s0 = StateNode.create({ name: 's0' })
            const s1 = StateNode.create({ name: 's1' })
            const s2 = StateNode.create({ name: 's2' })
            const host = mkEntity(`Tb${tag}AM`, [Property.create({
                name: 'flag', type: 'string',
                computation: StateMachine.create({
                    states: [s0, s1, s2], initialState: s0,
                    transfers: [
                        StateTransfer.create({ current: s0, next: s1, trigger: { recordName: `Tb${tag}AM`, type: 'update', keys: ['label'] }, computeTarget: (e: any) => ({ id: e.record.id }) }),
                        StateTransfer.create({ current: s0, next: s2, trigger: { recordName: `Tb${tag}AM`, type: 'update', keys: ['label'] }, computeTarget: (e: any) => ({ id: e.record.id }) }),
                    ],
                }),
            })])
            const { system, controller } = await constructController(surrounding, { entities: [host] })
            await controller.setup(true)
            const row = await system.storage.create(`Tb${tag}AM`, { label: 'a' }) as { id: unknown }
            return {
                phase: 'firstUse',
                action: () => system.storage.update(`Tb${tag}AM`, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { label: 'b' }),
                cleanup: () => system.destroy(),
            }
        },
    },
]

// ---------- 合法双胞胎（守卫不得过度收紧） ----------
type LegalTwinCell = {
    name: string
    run: (surrounding: SurroundingSchema, rng: Rng, tag: string) => Promise<void>
}

const LEGAL_TWIN_CELLS: LegalTwinCell[] = [
    {
        name: 'merged inputs with same-name SAME-type property fully work (write via inputs, read via merged)',
        run: async (surrounding, rng, tag) => {
            const X = mkEntity(`Lg${tag}X`, [Property.create({ name: 'shade', type: 'string' })])
            const Y = mkEntity(`Lg${tag}Y`, [Property.create({ name: 'shade', type: 'string' })])
            const M = Entity.create({ name: `Lg${tag}M`, inputEntities: [X, Y] })
            const { system, controller } = await constructController(surrounding, { entities: [X, Y, M] })
            await controller.setup(true)
            await system.storage.create(`Lg${tag}X`, { label: 'x', shade: 'dark' })
            await system.storage.create(`Lg${tag}Y`, { label: 'y', shade: 'light' })
            const merged = await system.storage.find(`Lg${tag}M`, undefined, undefined, ['id', 'shade'])
            expect(merged.map((r: any) => r.shade).sort()).toEqual(['dark', 'light'])
            await system.destroy()
        },
    },
    {
        name: 'StateMachine update trigger with legal keys fires end-to-end',
        run: async (surrounding, rng, tag) => {
            const s0 = StateNode.create({ name: 's0' })
            const s1 = StateNode.create({ name: 's1' })
            const host = mkEntity(`Lg${tag}H`, [Property.create({
                name: 'flag', type: 'string',
                computation: StateMachine.create({
                    states: [s0, s1], initialState: s0,
                    transfers: [StateTransfer.create({
                        current: s0, next: s1,
                        trigger: { recordName: `Lg${tag}H`, type: 'update', keys: ['label'] },
                        computeTarget: (e: any) => ({ id: e.record.id }),
                    })],
                }),
            })])
            const { system, controller } = await constructController(surrounding, { entities: [host] })
            await controller.setup(true)
            const row = await system.storage.create(`Lg${tag}H`, { label: 'a' }) as { id: unknown }
            await system.storage.update(`Lg${tag}H`, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { label: 'b' })
            const after = await system.storage.findOne(`Lg${tag}H`, MatchExp.atom({ key: 'id', value: ['=', row.id] }), undefined, ['flag'])
            expect(after.flag).toBe('s1')
            await system.destroy()
        },
    },
    {
        name: 'well-formed activity with a group builds and dispatches end-to-end',
        run: async (surrounding, rng, tag) => {
            const mk = (n: string) => Interaction.create({ name: n, action: Action.create({ name: n }) })
            const head = mk(`lg${tag}head`)
            const a1 = mk(`lg${tag}a1`)
            const b1 = mk(`lg${tag}b1`)
            const group = ActivityGroup.create({
                type: 'any',
                activities: [
                    Activity.create({ name: `lg${tag}brA`, interactions: [a1] }),
                    Activity.create({ name: `lg${tag}brB`, interactions: [b1] }),
                ],
            })
            const activityName = `lg${tag}act`
            const activity = Activity.create({
                name: activityName, interactions: [head], groups: [group],
                transfers: [Transfer.create({ name: 't', source: head, target: group })],
            })
            const manager = new ActivityManager([activity])
            const output = manager.getOutput()
            const system = new MonoSystem(new PGLiteDB())
            system.conceptClass = KlassByName
            const controller = new Controller({
                system,
                entities: [...surrounding.entities, ...output.entities] as any,
                relations: [...surrounding.relations, ...output.relations] as any,
                eventSources: output.eventSources as any,
            })
            await controller.setup(true)
            const user = { id: 'lg-user' }
            const headResult = await controller.dispatch(controller.findEventSourceByName(`${activityName}:${head.name}`)! as any, { user })
            expect(headResult.error).toBeUndefined()
            const activityId = headResult.context!.activityId as string
            const branchResult = await controller.dispatch(controller.findEventSourceByName(`${activityName}:${a1.name}`)! as any, { user, activityId })
            expect(branchResult.error).toBeUndefined()
            const state = await manager.getActivityCallByName(activityName)!.getState(controller, activityId)
            expect(state.current).toBeUndefined() // 单步 any 分支完成 ⇒ 整活动完成
            await system.destroy()
        },
    },
]

// ---------- 入口 ----------
const SEEDS_PER_CELL = Number(process.env.FUZZ_TABOO_SEEDS ?? 3)

describe('declaration-surface taboo conformance (guards must fire in ANY surrounding schema; legal twins must fully work)', () => {
    for (const cell of TABOO_CELLS) {
        const seeds = Array.from({ length: SEEDS_PER_CELL }, (_, i) => i + 1)
        test.each(seeds.map(s => [s]))(`taboo: ${cell.name} (surrounding seed %i)`, async (seed) => {
            const rng = mulberry32(seed * 7919)
            const surrounding = genSchema(rng, `Tbs${seed}_${TABOO_CELLS.indexOf(cell)}_`, {})
            const { action, cleanup } = await cell.run(surrounding, rng, `${seed}c${TABOO_CELLS.indexOf(cell)}`)
            try {
                await expect(async () => { await action() }).rejects.toThrow(cell.expectedError)
            } finally {
                await cleanup?.()
            }
        }, 60000)
    }
    for (const cell of LEGAL_TWIN_CELLS) {
        const seeds = Array.from({ length: SEEDS_PER_CELL }, (_, i) => i + 1)
        test.each(seeds.map(s => [s]))(`legal twin: ${cell.name} (surrounding seed %i)`, async (seed) => {
            const rng = mulberry32(seed * 104729)
            const surrounding = genSchema(rng, `Lgs${seed}_${LEGAL_TWIN_CELLS.indexOf(cell)}_`, {})
            await cell.run(surrounding, rng, `${seed}c${LEGAL_TWIN_CELLS.indexOf(cell)}`)
        }, 60000)
    }
})
