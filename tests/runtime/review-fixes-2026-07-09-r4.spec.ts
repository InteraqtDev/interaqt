/**
 * Regression tests for the 2026-07-09 r4 deep review fixes.
 * See agentspace/output/deep-review-2026-07-09-r4.md
 *
 * - F-1: group-head activity no longer stack-overflows; full flow works
 * - R-1: non-existent activityId yields a clear business error, not a TypeError
 * - R-2: computeTarget {source, target} endpoint form works on relation-hosted
 *        properties and fails fast on entity-hosted properties
 * - R-3: property computation with global + property dataDeps runs exactly once per host create
 */
import { describe, expect, test } from "vitest";
import {
    Controller, MonoSystem, Entity, Property, Relation, Dictionary,
    StateMachine, StateNode, StateTransfer, Interaction, InteractionEventEntity,
    Action, Payload, PayloadItem, Custom, Activity, ActivityGroup, Transfer, ActivityManager,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('review fixes 2026-07-09 r4', () => {

    // ============ F-1: activity graph with a group as its head ============
    test('F-1: activity with group head sets up and completes both branches', async () => {
        const a = Interaction.create({ name: 'r4fBranchA', action: Action.create({ name: 'r4fBranchA' }) })
        const b = Interaction.create({ name: 'r4fBranchB', action: Action.create({ name: 'r4fBranchB' }) })
        const group = ActivityGroup.create({
            type: 'every', activities: [
                Activity.create({ name: 'r4fSeqA', interactions: [a] }),
                Activity.create({ name: 'r4fSeqB', interactions: [b] }),
            ]
        })
        const act = Activity.create({ name: 'R4FParallel', interactions: [], groups: [group], transfers: [] })
        const system = new MonoSystem(new PGLiteDB())
        const User = Entity.create({ name: 'R4fUser', properties: [Property.create({ name: 'name', type: 'string' })] })

        // 修复前：new ActivityManager 在 isActivityHead 中无限递归（RangeError: Maximum call stack size exceeded）
        const activityManager = new ActivityManager([act])
        const out = activityManager.getOutput()
        const controller = new Controller({ system, entities: [User, ...out.entities], relations: out.relations, eventSources: out.eventSources })
        await controller.setup(true)
        const user = await system.storage.create('R4fUser', { name: 'u' })

        const esA = controller.findEventSourceByName('R4FParallel:r4fBranchA')!
        const esB = controller.findEventSourceByName('R4FParallel:r4fBranchB')!
        expect(esA).toBeDefined()
        expect(esB).toBeDefined()

        // 分支 A 作为 head、无 activityId：隐式创建 activity
        const r1 = await controller.dispatch(esA, { user, payload: {} } as any)
        expect(r1.error).toBeUndefined()
        const activityId = (r1 as any).context?.activityId as string
        expect(activityId).toBeDefined()

        // 分支 B 带同一个 activityId：在同一 activity 内完成，不再新建
        const r2 = await controller.dispatch(esB, { user, payload: {}, activityId } as any)
        expect(r2.error).toBeUndefined()

        const activities = await system.storage.find('_Activity_', undefined, undefined, ['*'])
        expect(activities).toHaveLength(1)

        // every group：两个分支都完成后整个 activity 完成（state.current 为空）
        const activityCall = activityManager.getActivityCallByName('R4FParallel')!
        const state = await activityCall.getState(controller, activityId)
        expect(state.current).toBeUndefined()
    })

    // ============ R-1: non-existent activityId ============
    test('R-1: dispatching with a non-existent activityId returns a clear error', async () => {
        const i1 = Interaction.create({ name: 'r4gStep1', action: Action.create({ name: 'r4gStep1' }) })
        const i2 = Interaction.create({ name: 'r4gStep2', action: Action.create({ name: 'r4gStep2' }) })
        const act = Activity.create({
            name: 'R4GFlow',
            interactions: [i1, i2],
            transfers: [Transfer.create({ name: 't1', source: i1, target: i2 })]
        })
        const system = new MonoSystem(new PGLiteDB())
        const User = Entity.create({ name: 'R4gUser2', properties: [Property.create({ name: 'name', type: 'string' })] })
        const activityManager = new ActivityManager([act])
        const out = activityManager.getOutput()
        const controller = new Controller({ system, entities: [User, ...out.entities], relations: out.relations, eventSources: out.eventSources })
        await controller.setup(true)
        const user = await system.storage.create('R4gUser2', { name: 'u' })

        const es = controller.findEventSourceByName('R4GFlow:r4gStep2')!
        // 合法 uuid 格式但不存在的 activityId：修复前抛裸 TypeError（reading 'current'）
        const res = await controller.dispatch(es, { user, payload: {}, activityId: '01890a5d-ac96-774b-bcce-b302099a8057' } as any)
        expect(res.error).toBeDefined()
        expect(String((res.error as any).message ?? res.error)).toContain('not found')
    })

    // ============ R-2: computeTarget endpoint forms ============
    test('R-2: computeTarget {source, target} transitions a relation-hosted property', async () => {
        const User = Entity.create({ name: 'R4hUser', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Item = Entity.create({ name: 'R4hItem', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Own = Relation.create({ source: User, sourceProperty: 'items', target: Item, targetProperty: 'owner', type: '1:n', properties: [] })
        const markIx = Interaction.create({
            name: 'r4hMark',
            action: Action.create({ name: 'r4hMark' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'userId', type: 'string' }),
                    PayloadItem.create({ name: 'itemId', type: 'string' }),
                ]
            })
        })

        const normal = StateNode.create({ name: 'normal' })
        const marked = StateNode.create({ name: 'marked' })
        Own.properties!.push(Property.create({
            name: 'flag', type: 'string',
            computation: StateMachine.create({
                states: [normal, marked],
                initialState: normal,
                transfers: [StateTransfer.create({
                    current: normal, next: marked,
                    trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: 'r4hMark' } },
                    // 端点形态：由 {source, target} 定位要转移的 relation 记录
                    computeTarget: (event: any) => ({
                        source: { id: event.record.payload.userId },
                        target: { id: event.record.payload.itemId },
                    })
                })]
            })
        }))

        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [User, Item], relations: [Own], eventSources: [markIx] })
        await controller.setup(true)
        const u = await system.storage.create('R4hUser', { name: 'u' })
        const i1 = await system.storage.create('R4hItem', { title: 'i1', owner: { id: u.id } })
        const i2 = await system.storage.create('R4hItem', { title: 'i2', owner: { id: u.id } })

        const res = await controller.dispatch(markIx, { user: { id: u.id }, payload: { userId: u.id, itemId: i1.id } } as any)
        expect(res.error).toBeUndefined()

        const relations = await system.storage.find(Own.name!, undefined, undefined, ['*', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
        const rel1 = relations.find((r: any) => r.target.id === i1.id)!
        const rel2 = relations.find((r: any) => r.target.id === i2.id)!
        expect(rel1.flag).toBe('marked')   // 修复前：{source,target} 对象整体保留、lock 失败、静默 skip
        expect(rel2.flag).toBe('normal')
    })

    test('R-2: computeTarget {source, target} on an entity-hosted property fails fast', async () => {
        const User = Entity.create({ name: 'R4iUser', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Follow = Relation.create({ source: User, sourceProperty: 'following', target: User, targetProperty: 'followers', type: 'n:n', properties: [] })
        const pending = StateNode.create({ name: 'pending' })
        const linked = StateNode.create({ name: 'linked' })
        User.properties.push(Property.create({
            name: 'status', type: 'string',
            computation: StateMachine.create({
                states: [pending, linked],
                initialState: pending,
                transfers: [StateTransfer.create({
                    current: pending, next: linked,
                    trigger: { recordName: Follow.name!, type: 'create' },
                    computeTarget: (event: any) => ({ source: { id: event.record.source.id }, target: { id: event.record.target.id } })
                })]
            })
        }))
        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [User], relations: [Follow], eventSources: [] })
        await controller.setup(true)
        const u1 = await system.storage.create('R4iUser', { name: 'a' })
        const u2 = await system.storage.create('R4iUser', { name: 'b' })
        // 宿主是 entity，端点形态无意义：必须 fail-fast 而不是静默 skip
        await expect(
            system.storage.create(Follow.name!, { source: { id: u1.id }, target: { id: u2.id } })
        ).rejects.toThrowError(/computeTarget returned a \{source, target\} endpoint form/)
    })

    // ============ R-3: no double trigger with global + property dataDeps ============
    test('R-3: host create triggers the computation exactly once', async () => {
        const threshold = Dictionary.create({ name: 'r4jThreshold', type: 'number', collection: false, defaultValue: () => 5 })
        let computeCalls = 0
        const Item = Entity.create({
            name: 'R4jItem', properties: [
                Property.create({ name: 'value', type: 'number' }),
            ]
        })
        Item.properties.push(Property.create({
            name: 'aboveThreshold', type: 'boolean',
            computation: Custom.create({
                name: 'r4jAbove',
                dataDeps: {
                    _current: { type: 'property', attributeQuery: ['value'] },
                    threshold: { type: 'global', source: threshold },
                },
                compute: async function (this: any, deps: any) {
                    computeCalls++
                    return (deps._current?.value ?? 0) > (deps.threshold ?? 0)
                },
                getInitialValue: () => false,
            })
        }))
        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [Item], relations: [], eventSources: [], dict: [threshold] })
        await controller.setup(true)
        computeCalls = 0
        await system.storage.create('R4jItem', { value: 10 })
        expect(computeCalls).toBe(1)   // 修复前：_self 与 property dataDep 的宿主 create 监听叠加 → 2

        const items = await system.storage.find('R4jItem', undefined, undefined, ['*'])
        expect(items[0].aboveThreshold).toBe(true)

        // global dict 更新仍然触发重算（去重不能误伤 global 监听）
        computeCalls = 0
        await system.storage.dict.set('r4jThreshold', 100)
        expect(computeCalls).toBe(1)
        const items2 = await system.storage.find('R4jItem', undefined, undefined, ['*'])
        expect(items2[0].aboveThreshold).toBe(false)
    })
})
