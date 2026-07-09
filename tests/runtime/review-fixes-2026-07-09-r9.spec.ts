import { describe, expect, test } from "vitest";
import {
    Entity, Property, Dictionary, Custom, KlassByName,
    Controller, MonoSystem,
    Interaction, Action, Activity, Transfer, ActivityManager,
} from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';

/**
 * r9 review 回归（runtime/builtins 侧）。
 *
 * R-1: activityId 是 API 边界输入，此前 getActivity 不校验记录归属——把 Activity A 的
 *      activityId 传给 Activity B 的交互时，B 的图去解释 A 的 state/refs，在深处抛
 *      "Cannot read properties of undefined (reading 'content')" 的裸 TypeError；
 *      两个 Activity 共用同一 Interaction 实例（节点 uuid 相同）时更会把状态推进/
 *      isRef 授权判定错绑到别的流程上。现在 fail-fast 给出指明两个流程名的业务级错误。
 *
 * K-1: 知识库 Custom 增量示例此前直接从 mutationEvent.record 读字段——update 事件的
 *      record 只带本次写入的字段（+id），未变更字段读出 undefined，聚合静默漂移。
 *      本用例固化正确写法（{...oldRecord, ...record} 重建全量新状态）的行为。
 */
describe('r9 R-1: activityId is validated against the activity definition', () => {
    function makeInteraction(name: string) {
        return Interaction.create({ name, action: Action.create({ name }) })
    }

    test('dispatching activity B interactions with activity A activityId gives a clear error', async () => {
        const a1 = makeInteraction('a1')
        const a2 = makeInteraction('a2')
        const b1 = makeInteraction('b1')
        const b2 = makeInteraction('b2')
        const activityA = Activity.create({
            name: 'A',
            interactions: [a1, a2],
            transfers: [Transfer.create({ name: 'ta', source: a1, target: a2 })]
        })
        const activityB = Activity.create({
            name: 'B',
            interactions: [b1, b2],
            transfers: [Transfer.create({ name: 'tb', source: b1, target: b2 })]
        })
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const activityManager = new ActivityManager([activityA, activityB])
        const out = activityManager.getOutput()
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [User, ...out.entities],
            relations: [...out.relations],
            eventSources: [...out.eventSources],
        })
        await controller.setup(true)
        const user = await system.storage.create('User', { name: 'u' })

        const esA1 = out.eventSources.find((es: any) => es.name === 'A:a1')!
        const resA = await controller.dispatch(esA1, { user })
        expect(resA.error).toBeUndefined()
        const activityIdOfA = (resA as any).context?.activityId
        expect(activityIdOfA).toBeTruthy()

        // 跨流程使用 activityId：必须是指明两个流程名的业务级错误，而不是裸 TypeError
        const esB2 = out.eventSources.find((es: any) => es.name === 'B:b2')!
        const resB2 = await controller.dispatch(esB2, { user, activityId: activityIdOfA })
        expect(String(resB2.error)).toMatch(/belongs to activity "A", not "B"/)

        const esB1 = out.eventSources.find((es: any) => es.name === 'B:b1')!
        const resB1 = await controller.dispatch(esB1, { user, activityId: activityIdOfA })
        expect(String(resB1.error)).toMatch(/belongs to activity "A", not "B"/)

        // 本流程内继续推进不受影响
        const esA2 = out.eventSources.find((es: any) => es.name === 'A:a2')!
        const resA2 = await controller.dispatch(esA2, { user, activityId: activityIdOfA })
        expect(resA2.error).toBeUndefined()
    })
})

describe('r9 K-1: Custom incremental pattern over partial update-event records', () => {
    test('overlaying changed fields on oldRecord keeps the aggregate consistent', async () => {
        const Counter = Entity.create({
            name: 'Counter',
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                Property.create({ name: 'value', type: 'number' }),
                Property.create({ name: 'active', type: 'boolean' })
            ]
        })
        const totalDict = Dictionary.create({
            name: 'activeCounterTotal',
            type: 'number',
            collection: false,
            computation: Custom.create({
                name: 'ActiveCounterTotal',
                useLastValue: true,
                dataDeps: {
                    counters: { type: 'records', source: Counter, attributeQuery: ['value', 'active'] }
                },
                incrementalDataDeps: [],
                compute: async function (dataDeps: any) {
                    return dataDeps.counters
                        .filter((c: any) => c.active)
                        .reduce((s: number, c: any) => s + (c.value || 0), 0)
                },
                // 知识库固化的正确模式（事件快照形状因类型而异）：
                // create: record=写入字段, oldRecord=undefined
                // update: record=仅变更字段(+id), oldRecord=完整旧快照 → 用 {...old, ...record} 重建全量新状态
                // delete: record=完整被删快照, oldRecord=undefined
                incrementalCompute: async function (lastValue: any, mutationEvent: any) {
                    const contribution = (r: any) => (r?.active ? (r?.value || 0) : 0)
                    const newRecord = mutationEvent.type === 'delete'
                        ? undefined
                        : { ...(mutationEvent.oldRecord || {}), ...(mutationEvent.record || {}) }
                    const previousRecord = mutationEvent.type === 'delete'
                        ? mutationEvent.record
                        : mutationEvent.oldRecord
                    const delta = contribution(newRecord) - contribution(previousRecord)
                    return (lastValue || 0) + delta
                },
                getInitialValue: () => 0
            })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Counter],
            relations: [],
            eventSources: [],
            dict: [totalDict]
        })
        await controller.setup(true)

        const c = await system.storage.create('Counter', { label: 'x', value: 10, active: false })
        expect(await system.storage.dict.get('activeCounterTotal')).toBe(0)

        // 只更新 active 一个字段：update 事件的 record 里没有 value。
        // 旧文档模式（直接读 mutationEvent.record.value）在这里会得到 0 而不是 10。
        await system.storage.update('Counter', MatchExp.atom({ key: 'id', value: ['=', c.id] }), { active: true })
        expect(await system.storage.dict.get('activeCounterTotal')).toBe(10)

        await system.storage.update('Counter', MatchExp.atom({ key: 'id', value: ['=', c.id] }), { label: 'renamed', value: 25 })
        expect(await system.storage.dict.get('activeCounterTotal')).toBe(25)

        await system.storage.delete('Counter', MatchExp.atom({ key: 'id', value: ['=', c.id] }))
        expect(await system.storage.dict.get('activeCounterTotal')).toBe(0)
    })
})
