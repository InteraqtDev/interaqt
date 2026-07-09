import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp, RecursiveContext } from "@storage";
import { PGLiteDB } from '@drivers';

/**
 * r9 review 回归（storage 侧）。
 *
 * F-1: filtered entity/relation 声明自己的新 property 此前被 setup 静默丢弃——
 *      列不建、写入被悄悄忽略、挂在其上的 computation 只维护 bound state 而可见值
 *      永远不落库（静默数据丢失）。现在 setup 期 fail-fast，指引声明到 base 上。
 * F-2: 同一 base record 家族里多个 relation 声明同名属性此前静默互相覆盖
 *      （后注册者赢得属性名，先注册的 relation 从此不可达）。现在无论声明方是否
 *      filtered 一律 setup 期 fail-fast（r8 只拦截了含 filtered declarer 的情况）。
 * F-3: label/goto 递归查询的环检测只比较"栈首 == 栈尾"，数据图中不经过起点的环
 *      （A→B→C→D→C）会无限递归（栈溢出/挂起）。现在检测递归路径上任意位置的重复记录。
 * F-4: merged entity/relation 的 __type 判别列可被 create/update 载荷显式覆写，
 *      记录被静默错标到其他 input 视图（跨视图可见性错乱 + 特有列交叉污染）。
 *      现在公共写入口 fail-fast（含嵌套关联载荷与 & link 数据）。
 */
describe('r9 F-1: filtered item declaring its own new property fails fast at setup', () => {
    test('filtered entity with a new value property is rejected', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
            properties: [Property.create({ name: 'nickname', type: 'string' })]
        })
        const db = new PGLiteDB()
        await db.open()
        expect(() => new DBSetup([User, ActiveUser], [], db))
            .toThrowError(/Filtered entity 'ActiveUser' cannot declare its own property 'nickname'/)
        await db.close()
    })

    test('filtered relation with a new property is rejected', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Team = Entity.create({ name: 'Team', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Membership = Relation.create({
            source: User, sourceProperty: 'teams', target: Team, targetProperty: 'members', type: 'n:n',
            properties: [Property.create({ name: 'role', type: 'string' })]
        })
        const LeadMembership = Relation.create({
            name: 'LeadMembership',
            baseRelation: Membership,
            sourceProperty: 'leadTeams',
            targetProperty: 'leads',
            matchExpression: MatchExp.atom({ key: 'role', value: ['=', 'lead'] }),
            properties: [Property.create({ name: 'extra', type: 'string' })]
        })
        const db = new PGLiteDB()
        await db.open()
        expect(() => new DBSetup([User, Team], [Membership, LeadMembership], db))
            .toThrowError(/Filtered relation 'LeadMembership' cannot declare its own property 'extra'/)
        await db.close()
    })

    test('re-declaring a base property name on a filtered entity is still allowed (resolves to base column)', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
            // merged item 编译管线会产生这种"与 base 同名"的属性声明，必须保持合法
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([User, ActiveUser], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
        const u = await handle.create('ActiveUser', { name: 'u', isActive: true })
        const read = await handle.findOne('ActiveUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), undefined, ['*'])
        expect(read.name).toBe('u')
        await db.close()
    })
})

describe('r9 F-2: duplicate relation property names within one base family fail fast', () => {
    test('two base relations sharing the same sourceProperty are rejected', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Post = Entity.create({ name: 'Post', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Task = Entity.create({ name: 'Task', properties: [Property.create({ name: 'title', type: 'string' })] })
        const R1 = Relation.create({ source: User, sourceProperty: 'items', target: Post, targetProperty: 'owner', type: '1:n' })
        const R2 = Relation.create({ source: User, sourceProperty: 'items', target: Task, targetProperty: 'owner', type: '1:n' })
        const db = new PGLiteDB()
        await db.open()
        expect(() => new DBSetup([User, Post, Task], [R1, R2], db))
            .toThrowError(/Relation property name conflict: property 'items'/)
        await db.close()
    })

    test('symmetric self-relation (same property on both sides of ONE relation) is still legal', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Friendship = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends', type: 'n:n'
        })
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([User], [Friendship], db)
        await setup.createTables()
        await db.close()
    })
})

describe('r9 F-3: goto recursion terminates on cycles that do not pass through the start record', () => {
    test('A→B→C→D→C cycle terminates instead of recursing forever', { timeout: 15000 }, async () => {
        const Node = Entity.create({
            name: 'Node',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const Edge = Relation.create({
            source: Node, sourceProperty: 'next', target: Node, targetProperty: 'prev', type: 'n:n'
        })
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([Node], [Edge], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

        const a = await handle.create('Node', { name: 'A' })
        const b = await handle.create('Node', { name: 'B' })
        const c = await handle.create('Node', { name: 'C' })
        const d = await handle.create('Node', { name: 'D' })
        await handle.addRelationById('Node', 'next', a.id, b.id)
        await handle.addRelationById('Node', 'next', b.id, c.id)
        await handle.addRelationById('Node', 'next', c.id, d.id)
        await handle.addRelationById('Node', 'next', d.id, c.id)

        // 保险丝：环检测失效时通过 exit 停住递归让断言失败，而不是让测试进程挂死
        let exitCalls = 0
        const exit = async (_context: RecursiveContext) => (++exitCalls) > 50

        const found = await handle.find('Node',
            MatchExp.atom({ key: 'name', value: ['=', 'A'] }),
            undefined,
            ['*', ['next', { label: 'walk', attributeQuery: ['*', ['next', { goto: 'walk', exit }]] }]]
        )
        expect(exitCalls).toBeLessThan(50)
        expect(found[0].next[0].name).toBe('B')
        await db.close()
    })

    test('cycle back to the start record still terminates (original behavior preserved)', async () => {
        const Node = Entity.create({
            name: 'Node2',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const Edge = Relation.create({
            source: Node, sourceProperty: 'next', target: Node, targetProperty: 'prev', type: 'n:n'
        })
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([Node], [Edge], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
        const a = await handle.create('Node2', { name: 'A' })
        const b = await handle.create('Node2', { name: 'B' })
        await handle.addRelationById('Node2', 'next', a.id, b.id)
        await handle.addRelationById('Node2', 'next', b.id, a.id)
        const exit = async (_context: RecursiveContext) => false
        const found = await handle.find('Node2',
            MatchExp.atom({ key: 'name', value: ['=', 'A'] }),
            undefined,
            ['*', ['next', { label: 'walk2', attributeQuery: ['*', ['next', { goto: 'walk2', exit }]] }]]
        )
        expect(found[0].next[0].name).toBe('B')
        await db.close()
    })
})

describe('r9 F-4: merged discriminator column __type cannot be written through the public API', () => {
    function createMergedModel() {
        const Customer = Entity.create({
            name: 'Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'level', type: 'string' })
            ]
        })
        const Vendor = Entity.create({
            name: 'Vendor',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'rating', type: 'number' })
            ]
        })
        const Contact = Entity.create({ name: 'Contact', inputEntities: [Customer, Vendor] })
        return { Customer, Vendor, Contact }
    }

    test('create/update with explicit __type is rejected; normal creation keeps working', async () => {
        const { Customer, Vendor, Contact } = createMergedModel()
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([Customer, Vendor, Contact], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

        await expect(handle.create('Customer', { name: 'x', level: 'gold', __type: 'Vendor' }))
            .rejects.toThrowError(/'__type' is the discriminator column of merged record 'Contact'/)

        const c = await handle.create('Customer', { name: 'y', level: 'silver' })
        await expect(handle.update('Customer', MatchExp.atom({ key: 'id', value: ['=', c.id] }), { __type: 'Vendor' }))
            .rejects.toThrowError(/'__type' is the discriminator column/)

        // 正常创建路径不受影响，判别列由框架按创建名写入
        const customers = await handle.find('Customer', undefined, undefined, ['*'])
        expect(customers).toHaveLength(1)
        expect(customers[0].__type).toBe('Customer')
        const vendors = await handle.find('Vendor', undefined, undefined, ['*'])
        expect(vendors).toHaveLength(0)
        await db.close()
    })

    test('nested related payload carrying __type is also rejected', async () => {
        const { Customer, Vendor, Contact } = createMergedModel()
        const Order = Entity.create({
            name: 'Order',
            properties: [Property.create({ name: 'no', type: 'string' })]
        })
        const OrderContact = Relation.create({
            source: Order, sourceProperty: 'contact', target: Contact, targetProperty: 'orders', type: 'n:1'
        })
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([Customer, Vendor, Contact, Order], [OrderContact], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

        const customer = await handle.create('Customer', { name: 'c', level: 'gold' })
        await expect(handle.create('Order', { no: '1', contact: { id: customer.id, __type: 'Vendor' } }))
            .rejects.toThrowError(/'__type' is the discriminator column/)
        await db.close()
    })

    test('a plain entity property named __type on a non-merged entity is unaffected', async () => {
        // 非 merged 家族没有判别列，用户自定义 __type 属性（不推荐但合法）不受写保护影响
        const Legacy = Entity.create({
            name: 'Legacy',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: '__type', type: 'string' })
            ]
        })
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([Legacy], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
        const r = await handle.create('Legacy', { name: 'l', __type: 'custom' })
        const read = await handle.findOne('Legacy', MatchExp.atom({ key: 'id', value: ['=', r.id] }), undefined, ['*'])
        expect(read.__type).toBe('custom')
        await db.close()
    })
})
