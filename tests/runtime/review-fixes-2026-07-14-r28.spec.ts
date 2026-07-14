/**
 * r28 深度 review 修复回归（runtime 面）。
 *
 * - F（Transform）：重叠 eventDeps 对单一事件只执行一次（此前每个命中的 eventDep 各插入
 *   一份派生记录——callback 收到完全相同的事件对象、无 dep 身份可区分，用户层不可去重）。
 *   r27 F-2 的「单事件 × 多监听扇出」轴在事件驱动轨的兄弟格。
 * - F（Custom）：同一 source 的多个 records dep + 默认增量计划（无 planIncremental）声明期
 *   fail-fast（此前单个 create/delete 事件让 incrementalCompute N 倍执行，useLastValue 增量
 *   被 N 倍叠加）；planIncremental + context.depKey 的显式分流面保留。
 * - clone(deep) 家族收口：BoolExpressionData / Conditions / Activity（含嵌套子活动与
 *   transfers 重指）的 deep 参数从被忽略改为图级深拷贝，隔离契约与 StateMachine.clone(deep) 一致。
 */
import { describe, expect, test } from "vitest";
import {
    Entity, Property, Transform, Custom, Dictionary, KlassByName,
    BoolExpressionData, BoolAtomData,
} from '@core';
import { Controller, MonoSystem } from '@runtime';
import { PGLiteDB } from '@drivers';
import {
    Activity, ActivityGroup, Transfer, Interaction, Action, Condition, Conditions,
} from '../../src/builtins/index.js';

describe('r28 — event-based computation fanout dedupe (Transform overlapping eventDeps)', () => {
    test('one create matching two eventDeps derives exactly one record; non-overlapping events still derive', async () => {
        const Order = Entity.create({
            name: 'Order',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'amount', type: 'number' }),
            ],
        })
        const AuditLog = Entity.create({
            name: 'AuditLog',
            properties: [Property.create({ name: 'note', type: 'string' })],
            computation: Transform.create({
                eventDeps: {
                    anyOrder: { recordName: 'Order', type: 'create' },
                    paidOrder: { recordName: 'Order', type: 'create', record: { status: 'paid' } },
                },
                callback: (event: any) => ({ note: `order:${event.record.id}` }),
            }),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Order, AuditLog], relations: [], eventSources: [], dict: [] })
        await controller.setup(true)

        // 重叠命中（两个 eventDep 都匹配）→ 恰好一条派生记录
        await system.storage.create('Order', { status: 'paid', amount: 100 })
        expect(await system.storage.find('AuditLog', undefined, undefined, ['*'])).toHaveLength(1)

        // 只命中宽 eventDep → 仍然派生（去重不误伤单命中）
        await system.storage.create('Order', { status: 'unpaid', amount: 1 })
        expect(await system.storage.find('AuditLog', undefined, undefined, ['*'])).toHaveLength(2)
        await system.destroy()
    })
})

describe('r28 — Custom same-source records deps with default incremental plan fail fast', () => {
    const Item = () => Entity.create({
        name: 'Item',
        properties: [
            Property.create({ name: 'score', type: 'number' }),
            Property.create({ name: 'weight', type: 'number' }),
        ],
    })

    test('two records deps on the same source + incrementalDataDeps (no planIncremental) is rejected at declaration (was: one create ran incrementalCompute twice → counter +2)', async () => {
        const item = Item()
        const Counter = Dictionary.create({
            name: 'EventCounter', type: 'number', collection: false,
            computation: Custom.create({
                name: 'DualRecordsDepCounter',
                dataDeps: {
                    scoreDep: { type: 'records', source: item, attributeQuery: ['score'] },
                    weightDep: { type: 'records', source: item, attributeQuery: ['weight'] },
                },
                incrementalDataDeps: [],
                useLastValue: true,
                getDefaultValue: () => 0,
                incrementalCompute: async function (lastValue: number) { return (lastValue ?? 0) + 1 },
            } as any),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        expect(() => new Controller({ system, entities: [item], relations: [], eventSources: [], dict: [Counter] }))
            .toThrowError(/multiple records dataDeps on the same source .* planIncremental/s)
    })

    test('same-source deps WITH planIncremental stay legal and depKey-based skipping yields exactly-once increments', async () => {
        const item = Item()
        let incrementalCalls = 0
        const Counter = Dictionary.create({
            name: 'EventCounter2', type: 'number', collection: false,
            computation: Custom.create({
                name: 'PlannedDualDepCounter',
                dataDeps: {
                    scoreDep: { type: 'records', source: item, attributeQuery: ['score'] },
                    weightDep: { type: 'records', source: item, attributeQuery: ['weight'] },
                },
                useLastValue: true,
                getDefaultValue: () => 0,
                planIncremental: (event: any, record: any, context: any) => {
                    if (context.skip) return { type: 'skip', reason: 'membership' }
                    // 显式分流：只对 scoreDep 的事件增量（重复命中经 depKey 显式丢弃）
                    if (context.depKey !== 'scoreDep') return { type: 'skip', reason: 'depKey routed' }
                    return { type: 'incremental', dataDepKeys: [], needsLastValue: { mode: 'normal' } }
                },
                incrementalCompute: async function (lastValue: number) { incrementalCalls++; return (lastValue ?? 0) + 1 },
            } as any),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [item], relations: [], eventSources: [], dict: [Counter] })
        await controller.setup(true)
        await system.storage.create('Item', { score: 1, weight: 2 })
        expect(incrementalCalls).toBe(1)
        expect(await system.storage.dict.get('EventCounter2')).toBe(1)
        await system.destroy()
    })
})

describe('r28 — clone(deep) family alignment (BoolExpressionData / Conditions / Activity)', () => {
    test('BoolExpressionData.clone(deep) isolates the tree; shallow keeps sharing', () => {
        const condA = Condition.create({ name: 'a', content: async () => true })
        const condB = Condition.create({ name: 'b', content: async () => false })
        const tree = BoolExpressionData.create({
            operator: 'and',
            left: BoolAtomData.create({ data: condA as any }),
            right: BoolAtomData.create({ data: condB as any }),
        })
        const deepCloned = BoolExpressionData.clone(tree, true)
        expect(deepCloned.left).not.toBe(tree.left)
        expect(deepCloned.right).not.toBe(tree.right)
        // 叶子行为实例按惯例共享
        expect((deepCloned.left as any).data).toBe(condA)

        const shallowCloned = BoolExpressionData.clone(tree, false)
        expect(shallowCloned.left).toBe(tree.left)
    })

    test('Conditions.clone(deep) deep-clones the guard tree', () => {
        const cond = Condition.create({ name: 'c', content: async () => true })
        const conditions = Conditions.create({
            content: BoolExpressionData.create({ operator: 'and', left: BoolAtomData.create({ data: cond as any }) }),
        })
        const deepCloned = Conditions.clone(conditions, true)
        expect(deepCloned.content).not.toBe(conditions.content)
        expect((deepCloned.content as any).left).not.toBe((conditions.content as any).left)
        const shallowCloned = Conditions.clone(conditions, false)
        expect(shallowCloned.content).toBe(conditions.content)
    })

    test('Activity.clone(deep) clones the whole graph and re-points transfers to the cloned nodes', () => {
        const step1 = Interaction.create({ name: 'R28Step1', action: Action.create({ name: 's1' }) })
        const step2 = Interaction.create({ name: 'R28Step2', action: Action.create({ name: 's2' }) })
        const sub = Activity.create({ name: 'R28Sub', interactions: [step2], transfers: [] })
        const group = ActivityGroup.create({ type: 'every', activities: [sub] })
        const flow = Activity.create({
            name: 'R28Flow',
            interactions: [step1],
            groups: [group],
            transfers: [Transfer.create({ name: 't1', source: step1, target: group })],
        })
        const deepCloned = Activity.clone(flow, true)
        // 节点整图克隆
        expect(deepCloned.interactions[0]).not.toBe(step1)
        expect(deepCloned.groups[0]).not.toBe(group)
        expect(deepCloned.groups[0].activities![0]).not.toBe(sub)
        expect(deepCloned.groups[0].activities![0].interactions[0]).not.toBe(step2)
        // transfers 重指到克隆节点（不与原图失联）
        expect(deepCloned.transfers[0].source).toBe(deepCloned.interactions[0])
        expect(deepCloned.transfers[0].target).toBe(deepCloned.groups[0])
        // 浅 clone 语义不变
        const shallowCloned = Activity.clone(flow, false)
        expect(shallowCloned.interactions[0]).toBe(step1)
        expect(shallowCloned.transfers[0]).toBe(flow.transfers[0])
    })
})
