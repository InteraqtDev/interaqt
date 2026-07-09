import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Count, Every, Any, WeightedSummation, Dictionary, KlassByName } from 'interaqt';
import { Controller, MonoSystem } from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';

/**
 * r8 F-2 回归：Global Count/Every/Any/WeightedSummation 的 create 增量分支
 * 此前直接把 mutation 事件里的局部 record（defaultValues + payload）喂给 callback，
 * callback 依赖 attributeQuery 声明的关联数据 / 计算列时增量结果与全量重算漂移。
 * 修复后 create 与 update 路径一致：先按 attributeQuery 拉取全量 new record。
 */
describe('r8 F-2: create incremental path fetches full record before callback', () => {
    test('Count over relation with callback reading target fields is correct on create', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'vip', type: 'boolean' })
            ]
        })
        const Post = Entity.create({
            name: 'Post',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const AuthorRelation = Relation.create({
            source: Post,
            sourceProperty: 'author',
            target: User,
            targetProperty: 'posts',
            type: 'n:1'
        })
        const dict = Dictionary.create({
            name: 'vipAuthoredPostCount',
            type: 'number',
            collection: false,
            computation: Count.create({
                record: AuthorRelation,
                attributeQuery: [['target', { attributeQuery: ['vip'] }]],
                callback: (rel: any) => rel.target?.vip === true
            })
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [User, Post],
            relations: [AuthorRelation],
            eventSources: [],
            dict: [dict]
        })
        await controller.setup(true)

        const vipUser = await system.storage.create('User', { name: 'v', vip: true })
        const normalUser = await system.storage.create('User', { name: 'n', vip: false })
        // 关系记录的 create 事件只带 source/target 的 id，callback 读 target.vip
        await system.storage.create('Post', { title: 'p1', author: { id: vipUser.id } })
        await system.storage.create('Post', { title: 'p2', author: { id: normalUser.id } })

        expect(await system.storage.dict.get('vipAuthoredPostCount')).toBe(1)

        // 后续 update 与 delete 路径保持一致
        await system.storage.update('User', MatchExp.atom({ key: 'id', value: ['=', normalUser.id] }), { vip: true })
        expect(await system.storage.dict.get('vipAuthoredPostCount')).toBe(2)
    })

    test('WeightedSummation with callback reading related data is correct on create', async () => {
        const Customer = Entity.create({
            name: 'Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'discount', type: 'number' })
            ]
        })
        const Order = Entity.create({
            name: 'Order',
            properties: [Property.create({ name: 'amount', type: 'number' })]
        })
        const OrderCustomer = Relation.create({
            source: Order,
            sourceProperty: 'customer',
            target: Customer,
            targetProperty: 'orders',
            type: 'n:1'
        })
        const dict = Dictionary.create({
            name: 'discountedTotal',
            type: 'number',
            collection: false,
            computation: WeightedSummation.create({
                record: Order,
                attributeQuery: ['amount', ['customer', { attributeQuery: ['discount'] }]],
                callback: (order: any) => ({
                    weight: order.customer?.discount ?? 1,
                    value: order.amount ?? 0
                })
            })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Customer, Order],
            relations: [OrderCustomer],
            eventSources: [],
            dict: [dict]
        })
        await controller.setup(true)

        const c = await system.storage.create('Customer', { name: 'c', discount: 0.5 })
        // Order 的 create 事件带 amount 与 customer 的 id ref，callback 还要读 customer.discount
        await system.storage.create('Order', { amount: 100, customer: { id: c.id } })

        expect(await system.storage.dict.get('discountedTotal')).toBe(50)
    })

    test('Every/Any with callback reading computed property is correct on create', async () => {
        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
                // computed 列不在 create payload 里，事件 record 上没有
                Property.create({
                    name: 'passed',
                    type: 'boolean',
                    computed: (task: any) => (task.score ?? 0) >= 60
                })
            ]
        })
        const everyDict = Dictionary.create({
            name: 'allPassed',
            type: 'boolean',
            collection: false,
            computation: Every.create({
                record: Task,
                attributeQuery: ['passed'],
                callback: (task: any) => task.passed === true,
                notEmpty: true
            })
        })
        const anyDict = Dictionary.create({
            name: 'anyPassed',
            type: 'boolean',
            collection: false,
            computation: Any.create({
                record: Task,
                attributeQuery: ['passed'],
                callback: (task: any) => task.passed === true
            })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Task],
            relations: [],
            eventSources: [],
            dict: [everyDict, anyDict]
        })
        await controller.setup(true)

        await system.storage.create('Task', { score: 90 })
        expect(await system.storage.dict.get('allPassed')).toBe(true)
        expect(await system.storage.dict.get('anyPassed')).toBe(true)

        await system.storage.create('Task', { score: 30 })
        expect(await system.storage.dict.get('allPassed')).toBe(false)
        expect(await system.storage.dict.get('anyPassed')).toBe(true)
    })
})

/**
 * r8 F-3 回归：声明了 callback 却没有 attributeQuery 时，full compute 取数是 id-only、
 * 字段 update 不注册任何监听——聚合静默错误/永久冻结。现在 setup 期 fail-fast
 * （与 Custom 的 records dataDep 校验对齐）；显式 attributeQuery: [] 仍然合法。
 */
describe('r8 F-3: callback without attributeQuery fails fast at setup', () => {
    function buildController(computation: any) {
        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'done', type: 'boolean' })
            ]
        })
        const dict = Dictionary.create({
            name: 'someValue',
            type: 'number',
            collection: false,
            computation: computation(Task)
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        return () => new Controller({
            system,
            entities: [Task],
            relations: [],
            eventSources: [],
            dict: [dict]
        })
    }

    test('Count with callback but no attributeQuery throws ComputationProtocolError', () => {
        expect(buildController((Task: any) => Count.create({
            record: Task,
            callback: (t: any) => t.done === true
        }))).toThrow(/Count computation .* declares a callback but no attributeQuery/)
    })

    test('Every/Any/WeightedSummation with callback but no attributeQuery throw', () => {
        expect(buildController((Task: any) => Every.create({
            record: Task,
            callback: (t: any) => t.done === true
        }))).toThrow(/Every computation .* declares a callback but no attributeQuery/)

        expect(buildController((Task: any) => Any.create({
            record: Task,
            callback: (t: any) => t.done === true
        }))).toThrow(/Any computation .* declares a callback but no attributeQuery/)

        expect(buildController((Task: any) => WeightedSummation.create({
            record: Task,
            callback: () => ({ weight: 1, value: 1 })
        }))).toThrow(/WeightedSummation computation .* declares a callback but no attributeQuery/)
    })

    test('explicit attributeQuery: [] remains legal (membership-only callback)', async () => {
        const Task = Entity.create({
            name: 'Task',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const dict = Dictionary.create({
            name: 'taskCount',
            type: 'number',
            collection: false,
            computation: Count.create({
                record: Task,
                attributeQuery: [],
                callback: () => true
            })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Task],
            relations: [],
            eventSources: [],
            dict: [dict]
        })
        await controller.setup(true)
        await system.storage.create('Task', { title: 't1' })
        expect(await system.storage.dict.get('taskCount')).toBe(1)
    })

    test('Count without callback still requires no attributeQuery', async () => {
        const Task = Entity.create({
            name: 'Task',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const dict = Dictionary.create({
            name: 'plainCount',
            type: 'number',
            collection: false,
            computation: Count.create({ record: Task })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Task],
            relations: [],
            eventSources: [],
            dict: [dict]
        })
        await controller.setup(true)
        await system.storage.create('Task', { title: 't1' })
        expect(await system.storage.dict.get('plainCount')).toBe(1)
    })
})
