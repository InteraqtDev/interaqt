import { describe, expect, test } from "vitest";
import {
    Entity, Property,
    Interaction, Action, GetAction,
    clearAllInstances, createInstances,
} from 'interaqt';

/**
 * r11 F-3（序列化侧）：GetAction 是模块级单例（uuid 每个进程随机生成）。
 * graph 反序列化（createInstances）会重建 uuid 相同但对象不同的 Action 实例，
 * 引用同一性判定（args.action === GetAction）必然失败——round-trip 后的查询交互
 * 静默丢失 resolve，dispatch 永远返回 data: undefined。
 * 现在按 action name（'get'）识别，round-trip 后 resolve 正常重建。
 *
 * CAUTION 本测试会 clearAllInstances(Interaction/Action/Entity/Property)，
 *  必须独占一个 spec 文件，避免影响同文件其他测试的实例注册表。
 */
describe('r11 F-3: GetAction interaction survives graph round-trip', () => {
    test('deserialized get-interaction keeps its resolve binding', () => {
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

        clearAllInstances(Interaction as any, Action as any, Entity as any, Property as any)

        const instances = createInstances(JSON.parse(blob))
        const restored = Array.from(instances.values()).find((i: any) => i._type === 'Interaction') as any
        // 反序列化重建的 Action 与单例对象不同但 uuid 相同
        expect(restored.action).not.toBe(GetAction)
        expect(restored.action.uuid).toBe(GetAction.uuid)
        // 修复点：resolve 按 action name 重建
        expect(restored.resolve).toBeDefined()
    })
})
