import { describe, expect, test } from "vitest";
import {
    Entity, Property, Relation, KlassByName,
    Controller, MonoSystem,
    Interaction, Action, Activity, Transfer, ActivityManager, ActivityGroup,
    Conditions, Condition, Attributives, Attributive,
    StateMachine, StateNode, StateTransfer,
} from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';

/**
 * r10 review 回归（runtime/builtins 侧）。
 *
 * F-1: activities 为空的 ActivityGroup 永远无法完成（group 状态只靠子分支的
 *      onChange 推进，空 group 没有分支），后续 transfer 目标永不可达——activity
 *      静默死锁。现在 buildGraph 声明期 fail-fast。
 *
 * R-1: relation 宿主 property StateMachine 的 computeTarget 返回端点形态
 *      （{source, target}）但端点缺 id 时，此前静默 continue——转移无声失效。
 *      现在按「无法识别形态一律 fail-fast」的既有契约抛 ComputationProtocolError。
 *
 * R-2: content 为空的 Conditions/Attributives 挂上守卫链后，每次 dispatch 都在
 *      BoolExp 构造器深处抛 "BoolExp raw data cannot be undefined" 的内部错误。
 *      现在 Interaction.create 声明期给出业务级错误。
 *
 * R-5: 同一 source 的多条 Transfer 此前后写覆盖先写（每个节点只有一个 next 指针），
 *      构建出的图与声明不一致。现在 buildGraph 声明期 fail-fast。
 */

function makeInteraction(name: string) {
    return Interaction.create({ name, action: Action.create({ name }) })
}

describe('r10 F-1: empty ActivityGroup is rejected at declaration time', () => {
    test('group with no child activities throws instead of deadlocking', () => {
        const start = makeInteraction('r10S')
        const end = makeInteraction('r10E')
        const empty = ActivityGroup.create({ type: 'every', activities: [] })
        const act = Activity.create({
            name: 'R10Deadlock', interactions: [start, end], groups: [empty],
            transfers: [
                Transfer.create({ name: 't1', source: start, target: empty }),
                Transfer.create({ name: 't2', source: empty, target: end }),
            ],
        })
        expect(() => new ActivityManager([act])).toThrow(/has no child activities.*deadlock/)
    })
})

describe('r10 R-5: duplicate transfers from the same source are rejected', () => {
    test('second outgoing transfer from one node throws', () => {
        const a = makeInteraction('r10a')
        const b = makeInteraction('r10b')
        const c = makeInteraction('r10c')
        const d = makeInteraction('r10d')
        const act = Activity.create({
            name: 'R10Fork', interactions: [a, b, c, d],
            transfers: [
                Transfer.create({ name: 't1', source: a, target: b }),
                Transfer.create({ name: 't2', source: a, target: c }),
                Transfer.create({ name: 't3', source: b, target: d }),
                Transfer.create({ name: 't4', source: c, target: d }),
            ],
        })
        expect(() => new ActivityManager([act])).toThrow(/multiple transfers from the same source "r10a"/)
    })
})

describe('r10 R-2: content-less guard containers are rejected at declaration time', () => {
    test('Conditions without content', () => {
        expect(() => Interaction.create({
            name: 'R10BadCond',
            action: Action.create({ name: 'r10badCond' }),
            conditions: Conditions.create({}),
        })).toThrow(/Conditions instance that has no content/)
    })

    test('Attributives without content', () => {
        expect(() => Interaction.create({
            name: 'R10BadAttr',
            action: Action.create({ name: 'r10badAttr' }),
            userAttributives: Attributives.create({}),
        })).toThrow(/Attributives instance that has no content/)
    })

    test('well-formed Conditions still dispatch normally', async () => {
        const User = Entity.create({ name: 'UserR10I', properties: [Property.create({ name: 'name', type: 'string' })] })
        const ok = Interaction.create({
            name: 'R10GoodCond',
            action: Action.create({ name: 'r10goodCond' }),
            conditions: Condition.create({ name: 'always', content: async () => true }),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [User], relations: [], eventSources: [ok] })
        await controller.setup(true)
        const user = await system.storage.create('UserR10I', { name: 'u' })
        const res = await controller.dispatch(ok, { user })
        expect(res.error).toBeUndefined()
        await system.destroy()
    })
})

describe('r10 R-1: StateMachine computeTarget endpoint without id fails fast', () => {
    test('endpoint form missing source.id surfaces a protocol error instead of silent skip', async () => {
        const U = Entity.create({ name: 'UR10J', properties: [Property.create({ name: 'name', type: 'string' })] })
        const P = Entity.create({ name: 'PR10J', properties: [Property.create({ name: 'title', type: 'string' })] })
        const idle = StateNode.create({ name: 'idle' })
        const hot = StateNode.create({ name: 'hot' })
        const Rel = Relation.create({
            source: U, sourceProperty: 'posts', target: P, targetProperty: 'owner', type: '1:n',
            properties: [Property.create({
                name: 'flag', type: 'string',
                computation: StateMachine.create({
                    states: [idle, hot],
                    initialState: idle,
                    transfers: [StateTransfer.create({
                        current: idle, next: hot,
                        trigger: { recordName: 'PR10J', type: 'update' },
                        computeTarget: (event: any) => ({ source: {}, target: { id: event.record.id } })
                    })]
                })
            })]
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [U, P], relations: [Rel], eventSources: [] })
        await controller.setup(true)
        const u = await system.storage.create('UR10J', { name: 'u' })
        const p = await system.storage.create('PR10J', { title: 't', owner: { id: u.id } })
        await expect(
            system.storage.update('PR10J', MatchExp.atom({ key: 'id', value: ['=', p.id] }), { title: 't2' })
        ).rejects.toThrow(/endpoint form whose source has no id/)
        await system.destroy()
    })

    test('well-formed endpoint form still transitions', async () => {
        const U = Entity.create({ name: 'UR10K', properties: [Property.create({ name: 'name', type: 'string' })] })
        const P = Entity.create({ name: 'PR10K', properties: [Property.create({ name: 'title', type: 'string' })] })
        const idle = StateNode.create({ name: 'idle' })
        const hot = StateNode.create({ name: 'hot' })
        const Rel = Relation.create({
            source: U, sourceProperty: 'posts', target: P, targetProperty: 'owner', type: '1:n',
            properties: [Property.create({
                name: 'flag', type: 'string',
                computation: StateMachine.create({
                    states: [idle, hot],
                    initialState: idle,
                    transfers: [StateTransfer.create({
                        current: idle, next: hot,
                        trigger: { recordName: 'PR10K', type: 'update' },
                        computeTarget: async function (this: Controller, event: any) {
                            const post = await this.system.storage.findOne('PR10K',
                                MatchExp.atom({ key: 'id', value: ['=', event.record.id] }), undefined,
                                ['id', ['owner', { attributeQuery: ['id'] }]])
                            return { source: { id: post.owner.id }, target: { id: post.id } }
                        }
                    })]
                })
            })]
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [U, P], relations: [Rel], eventSources: [] })
        await controller.setup(true)
        const u = await system.storage.create('UR10K', { name: 'u' })
        const p = await system.storage.create('PR10K', { title: 't', owner: { id: u.id } })
        await system.storage.update('PR10K', MatchExp.atom({ key: 'id', value: ['=', p.id] }), { title: 't2' })
        const rel = await system.storage.findOne(Rel.name!, undefined, undefined, ['flag'])
        expect(rel.flag).toBe('hot')
        await system.destroy()
    })
})
