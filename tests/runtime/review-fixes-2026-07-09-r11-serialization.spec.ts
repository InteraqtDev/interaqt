import { describe, expect, test } from "vitest";
import {
    Entity, Property,
    Interaction, Action, GetAction, GET_ACTION_UUID,
    clearAllInstances, createInstances,
} from 'interaqt';

/**
 * r11 F-3（序列化侧）：GetAction 此前是 uuid 每进程随机的模块级单例。
 * graph 反序列化（createInstances）重建的 Action 对象与单例 `!==`，
 * 引用同一性判定（args.action === GetAction）必然失败——round-trip 后的查询交互
 * 静默丢失 resolve，dispatch 永远返回 data: undefined。
 * 现在 GetAction 拥有固定 uuid（GET_ACTION_UUID），查询语义按这个跨序列化稳定的
 * 显式身份识别；Action.create 对该 uuid 幂等（注册表里已有单例时直接返回），
 * round-trip 后 resolve 正常重建、action 引用回到同一个单例。
 *
 * CAUTION 本测试会 clearAllInstances(Interaction/Action/Entity/Property)，
 *  必须独占一个 spec 文件，避免影响同文件其他测试的实例注册表。
 */
describe('r11 F-3: GetAction interaction survives graph round-trip', () => {
    test('deserialized get-interaction keeps its resolve binding (registry intact: singleton reused)', () => {
        const Post = Entity.create({
            name: 'R11SerPost',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const ListPosts = Interaction.create({
            name: 'R11SerListPosts',
            action: GetAction,
            data: Post,
        })
        expect((ListPosts as any).resolve).toBeDefined()

        const blob = `[${[
            Interaction.stringify(ListPosts),
            Action.stringify(GetAction),
            Entity.stringify(Post),
            ...Post.properties.map((p: any) => (p.constructor as any).stringify(p)),
        ].join(',')}]`

        // Action 注册表保持原样（GetAction 单例仍注册）：反序列化按固定 uuid
        // 重建 GetAction 时幂等返回单例。其余类型清空以避免 uuid 重复拒绝。
        clearAllInstances(Interaction as any, Entity as any, Property as any)
        const instances = createInstances(JSON.parse(blob))
        const restored = Array.from(instances.values()).find((i: any) => i._type === 'Interaction') as any
        expect(restored.action).toBe(GetAction)
        expect(restored.resolve).toBeDefined()
    })

    test('deserialized get-interaction keeps its resolve binding (cold registry, e.g. another process)', () => {
        const Post = Entity.create({
            name: 'R11SerPost2',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const ListPosts = Interaction.create({
            name: 'R11SerListPosts2',
            action: GetAction,
            data: Post,
        })
        const blob = `[${[
            Interaction.stringify(ListPosts),
            Action.stringify(GetAction),
            Entity.stringify(Post),
            ...Post.properties.map((p: any) => (p.constructor as any).stringify(p)),
        ].join(',')}]`

        // 模拟冷进程：全部注册表清空后重建
        clearAllInstances(Interaction as any, Action as any, Entity as any, Property as any)
        const instances = createInstances(JSON.parse(blob))
        const restored = Array.from(instances.values()).find((i: any) => i._type === 'Interaction') as any
        // 冷注册表下重建的 Action 是新对象，但携带固定 uuid，查询语义识别不受影响
        expect(restored.action.uuid).toBe(GET_ACTION_UUID)
        expect(restored.resolve).toBeDefined()
    })
})
