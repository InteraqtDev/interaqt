import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@core';
import { RecordMutationEvent } from "@runtime";
import { PGLiteDB } from '@drivers';

/**
 * storage 深度分析报告《二、merge / filter 的实现分析与更优方案》重构的回归测试。
 *
 * 覆盖：
 * (a) filtered entity 无状态化：删除持久化标记（__filtered_entities），
 *     成员资格事件由变更前后谓词求值的 diff 得出（唯一真相源 = SQL 谓词求值）。
 * (b) merged entity/relation 判别列模型：单个 __type 字符串列（等值匹配）取代
 *     __X_input_entity JSON 数组 + contains，成员条件完全声明式；
 *     以 merged（抽象联合）名义直接创建记录显式报错。
 * (c) filtered relation 事件与 filtered entity 共用同一套 membership diff 机制。
 */

function recordQueries(db: PGLiteDB) {
    const recorded: { sql: string, name: string }[] = []
    const originalQuery = db.query.bind(db)
    db.query = (async (sql: string, params?: unknown[], name?: string) => {
        recorded.push({ sql, name: name || '' })
        return originalQuery(sql, params as any[], name)
    }) as typeof db.query
    return recorded
}

describe('stateless filtered entity membership (2.2a)', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const teamEntity = Entity.create({
            name: 'Team',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'type', type: 'string' })
            ]
        })
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        })
        const techTeamUserEntity = Entity.create({
            name: 'TechTeamUser',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({ key: 'team.type', value: ['=', 'tech'] })
        })

        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup([userEntity, teamEntity, techTeamUserEntity], [userTeamRelation], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('no persisted membership flag column exists', async () => {
        // base entity 上不再有 __filtered_entities 内部属性/物理列
        expect(setup.map.records['User'].attributes['__filtered_entities']).toBeUndefined()
        const userTable = setup.map.records['User'].table
        expect(Object.keys(setup.tables[userTable].columns).some(column => column.includes('filtered'))).toBe(false)
    })

    test('deleting a related entity emits membership delete events for dependent filtered entities', async () => {
        // CAUTION 这是无状态化带来的正确性修复：旧实现中删除关联实体（Team）不会走
        //  propagateLinkChange，导致 filtered entity 事件缺失且持久化标记永久脏掉。
        const team = await handle.create('Team', { name: 'T1', type: 'tech' })
        const user = await handle.create('User', { name: 'U1', isActive: true, team })

        expect(await handle.find('TechTeamUser', undefined, undefined, ['name'])).toHaveLength(1)

        const events: RecordMutationEvent[] = []
        await handle.delete('Team', MatchExp.atom({ key: 'id', value: ['=', team.id] }), events)

        const membershipDeletes = events.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUser')
        expect(membershipDeletes).toHaveLength(1)
        expect(membershipDeletes[0].record!.id).toBe(user.id)
        // user 本身没有被删除，只是不再满足谓词
        expect(events.filter(e => e.type === 'delete' && e.recordName === 'User')).toHaveLength(0)
        expect(await handle.find('TechTeamUser', undefined, undefined, ['name'])).toHaveLength(0)
        expect(await handle.find('User', undefined, undefined, ['name'])).toHaveLength(1)
    })

    test('creating a record linked to an existing record emits membership create exactly once', async () => {
        const team = await handle.create('Team', { name: 'T1', type: 'tech' })

        const events: RecordMutationEvent[] = []
        await handle.create('User', { name: 'U1', isActive: true, team: { id: team.id } }, events)

        const membershipCreates = events.filter(e => e.type === 'create' && e.recordName === 'TechTeamUser')
        // 嵌套的 link 钩子与创建钩子覆盖同一段变更，账本保证只产生一次事件
        expect(membershipCreates).toHaveLength(1)
        expect(membershipCreates[0].record).toMatchObject({ name: 'U1' })
    })

    test('switching relation emits exactly one membership delete (no duplicates from nested hooks)', async () => {
        const techTeam = await handle.create('Team', { name: 'T1', type: 'tech' })
        const salesTeam = await handle.create('Team', { name: 'T2', type: 'sales' })
        const user = await handle.create('User', { name: 'U1', isActive: true, team: { id: techTeam.id } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { team: { id: salesTeam.id } }, events)

        // 更新内部包含 unlink（钩子一次）+ 行内写入新关系（外层 update 钩子一次），
        // 两个钩子包裹了同一段变更，账本保证 delete 事件只出现一次。
        const membershipDeletes = events.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUser')
        expect(membershipDeletes).toHaveLength(1)
        const membershipCreates = events.filter(e => e.type === 'create' && e.recordName === 'TechTeamUser')
        expect(membershipCreates).toHaveLength(0)
    })

    test('switching relation into the filter emits exactly one membership create', async () => {
        const salesTeam = await handle.create('Team', { name: 'T1', type: 'sales' })
        const techTeam = await handle.create('Team', { name: 'T2', type: 'tech' })
        const user = await handle.create('User', { name: 'U1', isActive: true, team: { id: salesTeam.id } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { team: { id: techTeam.id } }, events)

        expect(events.filter(e => e.type === 'create' && e.recordName === 'TechTeamUser')).toHaveLength(1)
        expect(events.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUser')).toHaveLength(0)
    })

    test('mutations without an events array skip membership evaluation entirely', async () => {
        const team = await handle.create('Team', { name: 'T1', type: 'tech' })
        const user = await handle.create('User', { name: 'U1', isActive: true, team })

        const recorded = recordQueries(db)
        // 不传 events：成员资格只服务于事件，无状态设计下完全不需要求值
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { name: 'U1x' })

        expect(recorded.filter(q => q.name.includes('match filter condition'))).toHaveLength(0)
        expect(recorded.filter(q => q.name.includes('membership settle'))).toHaveLength(0)
        // 查询侧照常正确（谓词重写实时求值，无任何标记可脱同步）
        expect(await handle.find('TechTeamUser', undefined, undefined, ['name'])).toHaveLength(1)
    })

    test('membership delete events are emitted before the base record delete event', async () => {
        const team = await handle.create('Team', { name: 'T1', type: 'tech' })
        const user = await handle.create('User', { name: 'U1', isActive: true, team })

        const events: RecordMutationEvent[] = []
        await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), events)

        const membershipDeleteIndex = events.findIndex(e => e.type === 'delete' && e.recordName === 'TechTeamUser')
        const userDeleteIndex = events.findIndex(e => e.type === 'delete' && e.recordName === 'User')
        expect(membershipDeleteIndex).toBeGreaterThanOrEqual(0)
        expect(userDeleteIndex).toBeGreaterThanOrEqual(0)
        expect(membershipDeleteIndex).toBeLessThan(userDeleteIndex)
    })
})

describe('merged item discriminator column model (2.2b)', () => {
    const buildMergedEntities = () => {
        const customerBase = Entity.create({
            name: 'CustomerBase',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const activeCustomer = Entity.create({
            name: 'ActiveCustomer',
            baseEntity: customerBase,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })
        const supplier = Entity.create({
            name: 'Supplier',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const contact = Entity.create({ name: 'Contact', inputEntities: [activeCustomer, supplier] })
        return { customerBase, activeCustomer, supplier, contact }
    }

    test('a single scalar __type column replaces per-merge JSON tag columns', async () => {
        const { customerBase, activeCustomer, supplier, contact } = buildMergedEntities()
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([customerBase, activeCustomer, supplier, contact], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // 物理 base 上只有一个 __type 字符串判别列，没有任何 __X_input_entity JSON 列
        const baseRecord = setup.map.records['Contact_base']
        expect(baseRecord).toBeDefined()
        expect((baseRecord.attributes['__type'] as any).type).toBe('string')
        for (const record of Object.values(setup.map.records)) {
            expect(Object.keys(record.attributes).some(name => name.includes('_input_'))).toBe(false)
        }

        // 判别值：普通 input 是自身名，filtered input 是其 root base 名
        await handle.create('ActiveCustomer', { name: 'a1', isActive: true })
        await handle.create('Supplier', { name: 's1', isActive: false })
        await handle.create('CustomerBase', { name: 'b1', isActive: false })

        const all = await handle.find('Contact_base', undefined, undefined, ['name', '__type'])
        const typeByName = Object.fromEntries(all.map(r => [r.name, r.__type]))
        expect(typeByName).toEqual({ a1: 'CustomerBase', s1: 'Supplier', b1: 'CustomerBase' })

        await db.close()
    })

    test('membership of filtered inputs is fully declarative and event-consistent', async () => {
        const { customerBase, activeCustomer, supplier, contact } = buildMergedEntities()
        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([customerBase, activeCustomer, supplier, contact], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const createEvents: RecordMutationEvent[] = []
        const created = await handle.create('ActiveCustomer', { name: 'a1', isActive: true }, createEvents)
        // 物理 base 的 create 事件 + 每个满足谓词的视图（ActiveCustomer / Contact / CustomerBase 自身也是视图）的 create 事件
        expect(createEvents.filter(e => e.type === 'create').map(e => e.recordName).sort()).toEqual(
            ['ActiveCustomer', 'Contact', 'Contact_base', 'CustomerBase']
        )

        // 谓词不再满足时自然退出（旧 tag 模型下 tag 不迁移的问题随判别列模型消失）
        const updateEvents: RecordMutationEvent[] = []
        await handle.update('CustomerBase', MatchExp.atom({ key: 'id', value: ['=', created.id] }), { isActive: false }, updateEvents)
        const membershipDeletes = updateEvents.filter(e => e.type === 'delete')
        expect(membershipDeletes.map(e => e.recordName).sort()).toEqual(['ActiveCustomer', 'Contact'])
        // 仍然属于 CustomerBase（判别值不变）
        expect(await handle.find('CustomerBase', undefined, undefined, ['name'])).toHaveLength(1)
        expect(await handle.find('ActiveCustomer', undefined, undefined, ['name'])).toHaveLength(0)
        expect(await handle.find('Contact', undefined, undefined, ['name'])).toHaveLength(0)

        await db.close()
    })

    test('creating via a nested merged name or a filtered view over a merged entity throws explicitly', async () => {
        const employee = Entity.create({
            name: 'Employee',
            properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'level', type: 'number' })]
        })
        const manager = Entity.create({
            name: 'Manager',
            properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'level', type: 'number' })]
        })
        const internalStaff = Entity.create({ name: 'InternalStaff', inputEntities: [employee, manager] })
        const partner = Entity.create({
            name: 'Partner',
            properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'level', type: 'number' })]
        })
        const allContacts = Entity.create({ name: 'AllContacts', inputEntities: [internalStaff, partner] })
        // 以 merged entity 为 base 的 filtered entity：无法确定具体 __type，同样不可创建
        const seniorStaff = Entity.create({
            name: 'SeniorStaff',
            baseEntity: internalStaff,
            matchExpression: MatchExp.atom({ key: 'level', value: ['>', 5] })
        })

        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([employee, manager, internalStaff, partner, allContacts, seniorStaff], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        await expect(handle.create('AllContacts', { name: 'x' })).rejects.toThrow(/merged \(union\) type "AllContacts"/)
        await expect(handle.create('InternalStaff', { name: 'x' })).rejects.toThrow(/merged \(union\) type "InternalStaff"/)
        await expect(handle.create('SeniorStaff', { name: 'x', level: 9 })).rejects.toThrow(/merged \(union\) type "SeniorStaff"/)

        // 具体类型照常可创建；filtered view（SeniorStaff）照常可查询
        await handle.create('Employee', { name: 'e1', level: 9 })
        await handle.create('Manager', { name: 'm1', level: 3 })
        expect((await handle.find('SeniorStaff', undefined, undefined, ['name'])).map(r => r.name)).toEqual(['e1'])
        expect(await handle.find('AllContacts', undefined, undefined, ['name'])).toHaveLength(2)

        await db.close()
    })

    test('merged relation with filtered inputs: records are visible through the merged relation', async () => {
        // CAUTION 旧实现中 filtered input relation 不会被 rebase 到 merged 的物理 base link 上，
        //  通过它创建的记录永远不会出现在 merged relation 的查询结果中（半残废特性）。
        //  重构后 relation 与 entity 的处理完全对称。
        const user = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const product = Entity.create({
            name: 'Product',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const userProduct = Relation.create({
            name: 'UserProductRelation',
            source: user,
            sourceProperty: 'products',
            target: product,
            targetProperty: 'users',
            type: 'n:n',
            properties: [Property.create({ name: 'actionType', type: 'string' })]
        })
        const purchases = Relation.create({
            name: 'UserPurchasesProduct',
            baseRelation: userProduct,
            sourceProperty: 'purchasedProducts',
            targetProperty: 'purchasedBy',
            matchExpression: MatchExp.atom({ key: 'actionType', value: ['=', 'purchase'] })
        })
        const views = Relation.create({
            name: 'UserViewsProduct',
            baseRelation: userProduct,
            sourceProperty: 'viewedProducts',
            targetProperty: 'viewedBy',
            matchExpression: MatchExp.atom({ key: 'actionType', value: ['=', 'view'] })
        })
        const engages = Relation.create({
            name: 'UserEngagesProduct',
            sourceProperty: 'engagedProducts',
            targetProperty: 'engagedBy',
            inputRelations: [purchases, views]
        })

        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([user, product], [userProduct, purchases, views, engages], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const u1 = await handle.create('User', { name: 'u1' })
        const p1 = await handle.create('Product', { name: 'p1' })
        const p2 = await handle.create('Product', { name: 'p2' })

        await handle.create('UserPurchasesProduct', { source: { id: u1.id }, target: { id: p1.id }, actionType: 'purchase' })
        await handle.create('UserViewsProduct', { source: { id: u1.id }, target: { id: p2.id }, actionType: 'view' })
        // root base relation 保持可查询性（IS-A）：以 base 名义创建、谓词满足时同样属于 filtered input
        await handle.create('UserProductRelation', { source: { id: u1.id }, target: { id: p2.id }, actionType: 'purchase' })

        expect(await handle.find('UserPurchasesProduct', undefined, undefined, ['actionType'])).toHaveLength(2)
        expect(await handle.find('UserViewsProduct', undefined, undefined, ['actionType'])).toHaveLength(1)
        expect(await handle.find('UserProductRelation', undefined, undefined, ['actionType'])).toHaveLength(3)
        // merged relation 能看到所有 input 的记录
        const engaged = await handle.find('UserEngagesProduct', undefined, undefined, ['actionType'])
        expect(engaged.map(r => r.actionType).sort()).toEqual(['purchase', 'purchase', 'view'])

        // 谓词声明式：actionType 变化自然进出各视图
        const events: RecordMutationEvent[] = []
        await handle.updateRelationByName('UserProductRelation',
            MatchExp.atom({ key: 'target.id', value: ['=', p2.id] }).and({ key: 'actionType', value: ['=', 'view'] }),
            { actionType: 'purchase' },
            events
        )
        expect(events.filter(e => e.type === 'delete' && e.recordName === 'UserViewsProduct')).toHaveLength(1)
        expect(events.filter(e => e.type === 'create' && e.recordName === 'UserPurchasesProduct')).toHaveLength(1)
        expect(await handle.find('UserPurchasesProduct', undefined, undefined, ['actionType'])).toHaveLength(3)

        await db.close()
    })

    test('merged input membership events fire for filtered relation views on link deletion', async () => {
        // (2.2c) filtered relation 与 filtered entity 共用同一套 membership diff：
        // 删除关系记录时，所属视图（含 merged input 视图）产生 delete 事件，且先于关系本身的 delete 事件。
        const user = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const task = Entity.create({ name: 'Task', properties: [Property.create({ name: 'name', type: 'string' })] })
        const userTask = Relation.create({
            name: 'UserTaskRelation',
            source: user,
            sourceProperty: 'tasks',
            target: task,
            targetProperty: 'assignees',
            type: 'n:n',
            properties: [Property.create({ name: 'isActive', type: 'boolean' })]
        })
        const activeUserTask = Relation.create({
            name: 'ActiveUserTaskRelation',
            baseRelation: userTask,
            sourceProperty: 'activeTasks',
            targetProperty: 'activeAssignees',
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })

        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([user, task], [userTask, activeUserTask], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const u1 = await handle.create('User', { name: 'u1' })
        const t1 = await handle.create('Task', { name: 't1' })
        await handle.addRelationByNameById('UserTaskRelation', u1.id, t1.id, { isActive: true })

        const events: RecordMutationEvent[] = []
        await handle.removeRelationByName('UserTaskRelation',
            MatchExp.atom({ key: 'source.id', value: ['=', u1.id] }),
            events
        )

        const filteredDeleteIndex = events.findIndex(e => e.type === 'delete' && e.recordName === 'ActiveUserTaskRelation')
        const baseDeleteIndex = events.findIndex(e => e.type === 'delete' && e.recordName === 'UserTaskRelation')
        expect(filteredDeleteIndex).toBeGreaterThanOrEqual(0)
        expect(baseDeleteIndex).toBeGreaterThanOrEqual(0)
        expect(filteredDeleteIndex).toBeLessThan(baseDeleteIndex)

        await db.close()
    })
})
