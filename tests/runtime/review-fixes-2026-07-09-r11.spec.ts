import { describe, expect, test } from "vitest";
import {
    Entity, Property, KlassByName,
    Controller, MonoSystem,
    Interaction, Action, GetAction, GET_ACTION_UUID, DataPolicy,
    Transform, Custom, Dictionary, RealTime,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

/**
 * r11 review 回归（runtime/builtins 侧）。
 *
 * F-1: 计算传播（computation 写回重入 mutation listener）此前没有任何环路/深度守卫。
 *      互相派生的 Transform、互相依赖的 global dict 计算是「声明合法、运行期死循环」的
 *      形态：dispatch/setup 无任何报错地挂起（实测挂满测试超时）或无限创建记录。
 *      现在：
 *        - 直接自引用（dict 计算把自己的输出声明为 global dataDep）在 setup 期 fail-fast；
 *        - 其余环路由传播深度守卫（AsyncLocalStorage 计数，上限 100）在运行期抛出
 *          带传播轨迹的受控错误。
 *
 * F-3: GetAction 查询语义此前按引用同一性（args.action === GetAction）绑定 resolve，
 *      而 GetAction 的 uuid 每进程随机——序列化 round-trip 重建的 Action 对象必然
 *      `!==` 单例，resolve 静默丢失、dispatch 返回 data: undefined。
 *      现在 GetAction 拥有固定 uuid（导出常量 GET_ACTION_UUID），查询语义按这个
 *      跨序列化稳定的显式身份识别：普通 Action.create({name:'get'}) 不再特殊
 *      （'get' 是常用词，同名不应隐式获得查询语义），带 data/dataPolicy 的非
 *      GetAction 声明（合法声明、永不生效的死配置）在声明期 fail-fast 并指引
 *      使用导出常量。反序列化按固定 uuid 重建 GetAction 时幂等返回单例。
 *
 * R-1: Controller 中同名 eventSource 静默后写覆盖先写（findEventSourceByName 只命中
 *      最后注册者，先注册者的 guard/权限链不可达）。现在构造期 fail-fast。
 *
 * R-2: 时间驱动的重算调度器尚未实现（nextRecomputeTime 无消费方）。零 dataDeps 的
 *      RealTime 计算注册不出任何监听——callback 一次都不会执行，property 形态还会被
 *      getInitialValue 持久化成 0（静默错误值）。现在在 setup 期 fail-fast。
 */

describe('r11 F-1: computation propagation cycle guard', () => {
    test('mutual entity Transforms fail with a propagation depth error instead of looping forever', async () => {
        const A = Entity.create({
            name: 'R11F1A',
            properties: [Property.create({ name: 'label', type: 'string' })],
        })
        const B = Entity.create({
            name: 'R11F1B',
            properties: [Property.create({ name: 'label', type: 'string' })],
            computation: Transform.create({
                record: A,
                attributeQuery: ['label'],
                callback: () => ({ label: 'from-a' })
            })
        })
        ;(A as any).computation = Transform.create({
            record: B,
            attributeQuery: ['label'],
            callback: () => ({ label: 'from-b' })
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [A, B], relations: [] })
        await controller.setup(true)
        await expect(system.storage.create('R11F1A', { label: 'seed' }))
            .rejects.toThrow(/propagation exceeded the maximum depth/)
        await system.destroy()
    }, 60000)

    test('a dict computation depending on its own output fails fast at setup', async () => {
        const total: any = Dictionary.create({
            name: 'r11f1SelfTotal',
            type: 'number',
            collection: false,
        })
        total.computation = Custom.create({
            name: 'R11F1Self',
            dataDeps: { prev: { type: 'global', source: total } },
            getInitialValue: () => 0,
            compute: async (deps: any) => (deps.prev ?? 0) + 1,
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [], relations: [], dict: [total] })
        await expect(controller.setup(true)).rejects.toThrow(/references the computation's own output/)
        await system.destroy()
    })

    test('an indirect dict cycle (X -> Y -> X) hits the runtime propagation guard', async () => {
        const x: any = Dictionary.create({ name: 'r11f1X', type: 'number', collection: false })
        const y: any = Dictionary.create({ name: 'r11f1Y', type: 'number', collection: false })
        x.computation = Custom.create({
            name: 'R11F1X',
            dataDeps: { other: { type: 'global', source: y } },
            getInitialValue: () => 0,
            compute: async (deps: any) => (deps.other ?? 0) + 1,
        })
        y.computation = Custom.create({
            name: 'R11F1Y',
            dataDeps: { other: { type: 'global', source: x } },
            getInitialValue: () => 0,
            compute: async (deps: any) => (deps.other ?? 0) + 1,
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [], relations: [], dict: [x, y] })
        await expect(controller.setup(true)).rejects.toThrow(/propagation exceeded the maximum depth/)
        await system.destroy()
    }, 60000)

    test('legitimate computation chains still work (no false positive)', async () => {
        // A -> Transform -> B, and a dict counting B: a two-hop legitimate chain.
        const A = Entity.create({
            name: 'R11F1ChainA',
            properties: [Property.create({ name: 'label', type: 'string' })],
        })
        const B = Entity.create({
            name: 'R11F1ChainB',
            properties: [Property.create({ name: 'label', type: 'string' })],
            computation: Transform.create({
                record: A,
                attributeQuery: ['label'],
                callback: (a: any) => ({ label: `derived-${a.label}` })
            })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [A, B], relations: [] })
        await controller.setup(true)
        await system.storage.create('R11F1ChainA', { label: 'x' })
        const derived = await system.storage.find('R11F1ChainB', undefined, undefined, ['label'])
        expect(derived.map((d: any) => d.label)).toEqual(['derived-x'])
        await system.destroy()
    })
})

describe('r11 F-3: query semantics bound to the exported GetAction identity (fixed uuid)', () => {
    test('the exported GetAction constant resolves data', async () => {
        const Post = Entity.create({
            name: 'R11F3Post',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const ListPosts = Interaction.create({
            name: 'R11F3ListPosts',
            action: GetAction,
            data: Post,
            dataPolicy: DataPolicy.create({ attributeQuery: ['id', 'title'] }),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Post], relations: [], eventSources: [ListPosts] })
        await controller.setup(true)
        await system.storage.create('R11F3Post', { title: 'hello' })
        const result = await controller.dispatch(ListPosts, { user: { id: 'u1' } })
        expect(result.error).toBeUndefined()
        expect((result.data as any[]).map(p => p.title)).toEqual(['hello'])
        await system.destroy()
    })

    test('an Action merely named "get" gains no query semantics; with data it fails fast with a GetAction hint', () => {
        const Post = Entity.create({
            name: 'R11F3Post2',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        // 普通同名 action 完全合法，只是没有查询语义（不挂 resolve）
        const plain = Interaction.create({
            name: 'R11F3PlainGet',
            action: Action.create({ name: 'get' }),
        })
        expect((plain as any).resolve).toBeUndefined()
        // 带 data 时声明期报错，并明确指引使用导出的 GetAction 常量
        expect(() => Interaction.create({
            name: 'R11F3NamedGet',
            action: Action.create({ name: 'get' }),
            data: Post,
        })).toThrow(/An Action merely named "get" is not the query action.*GetAction/)
    })

    test('data/dataPolicy on a non-get action fails fast at declaration time', () => {
        const Post = Entity.create({
            name: 'R11F3Post3',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        expect(() => Interaction.create({
            name: 'R11F3CreatePost',
            action: Action.create({ name: 'create' }),
            data: Post,
        })).toThrow(/is not the built-in query action.*GetAction/)
    })

    test('re-creating the GetAction identity is idempotent; hijacking its uuid with another name is rejected', () => {
        // 反序列化路径会带固定 uuid 重新 create：应返回同一个单例而不是抛 duplicate uuid
        const recreated = Action.create({ name: 'get' }, { uuid: GET_ACTION_UUID })
        expect(recreated).toBe(GetAction)
        // 固定 uuid 配其他名字属于损毁数据
        expect(() => Action.create({ name: 'hijack' }, { uuid: GET_ACTION_UUID }))
            .toThrow(/must be named "get"/)
    })
})

describe('r11 R-1: duplicate eventSource names are rejected', () => {
    test('two event sources with the same name throw at Controller construction', () => {
        const A = Interaction.create({ name: 'R11R1Submit', action: Action.create({ name: 'r11r1a' }) })
        const B = Interaction.create({ name: 'R11R1Submit', action: Action.create({ name: 'r11r1b' }) })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        expect(() => new Controller({ system, entities: [], relations: [], eventSources: [A, B] }))
            .toThrow(/Duplicate eventSource name "R11R1Submit"/)
    })

    test('registering the same instance under one name stays legal', () => {
        const A = Interaction.create({ name: 'R11R1Single', action: Action.create({ name: 'r11r1c' }) })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [], relations: [], eventSources: [A, A] })
        expect(controller.findEventSourceByName('R11R1Single')).toBe(A)
    })
})

describe('r11 R-2: RealTime without any trigger fails fast', () => {
    test('property RealTime with neither attributeQuery nor dataDeps is rejected', () => {
        const U = Entity.create({
            name: 'R11R2User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({
                    name: 'liveSeconds',
                    type: 'number',
                    computation: RealTime.create({
                        nextRecomputeTime: () => 1000,
                        callback: (async (now: any) => now.divide(1000)) as any,
                    }),
                }),
            ],
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        expect(() => new Controller({ system, entities: [U], relations: [] }))
            .toThrow(/neither attributeQuery nor dataDeps/)
    })

    test('global RealTime without dataDeps stays legal (migration rebuild is a valid trigger path)', () => {
        const clock = Dictionary.create({
            name: 'r11r2Clock',
            type: 'number',
            collection: false,
            computation: RealTime.create({
                nextRecomputeTime: () => 1000,
                callback: (async (now: any) => now.divide(1000)) as any,
            }),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        expect(() => new Controller({ system, entities: [], relations: [], dict: [clock] })).not.toThrow()
    })
})
