import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
    AttributeQuery,
    DBSetup,
    EntityQueryHandle,
    EntityToTableMap,
    MatchExp,
    NewRecordData,
    RecordQuery,
    RecordQueryAgent
} from "@storage";
import { BoolExp, Entity, Property, Relation } from '@core';
import { RecordMutationEvent } from "@runtime";
import { PGLiteDB } from '@drivers';

/**
 * 回归测试：覆盖 agentspace/output/storage-package-deep-analysis.md
 * 章节《三、其他显著值得改进的地方》中的全部修复。
 */

// 遍历 BoolExp 树，统计 key 出现的原子个数
function countAtomsWithKey(expression: any, key: string): number {
    if (!expression) return 0
    const boolExp = expression instanceof BoolExp ? expression : BoolExp.fromValue(expression)
    if (boolExp.isAtom()) {
        return (boolExp.data as { key: string }).key === key ? 1 : 0
    }
    let count = 0
    if (boolExp.left) count += countAtomsWithKey(boolExp.left, key)
    if (boolExp.right) count += countAtomsWithKey(boolExp.right, key)
    return count
}

// 给 db.query 打补丁，记录所有执行的 (sql, name)
function recordQueries(db: PGLiteDB): { sql: string, name: string }[] {
    const recorded: { sql: string, name: string }[] = []
    const originalQuery = db.query.bind(db);
    (db as any).query = async (sql: string, params: unknown[] = [], name = '') => {
        recorded.push({ sql, name })
        return originalQuery(sql, params, name)
    }
    return recorded
}

describe('3.1.1 dead code removal: Setup.resolveBaseSourceEntityAndFilter', () => {
    test('method no longer exists on DBSetup', () => {
        expect((DBSetup.prototype as any).resolveBaseSourceEntityAndFilter).toBeUndefined()
    })
})

describe('3.1 fixes that need a live database', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    const createSchema = () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' }),
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
        const profileEntity = Entity.create({
            name: 'Profile',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        })
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        })
        const userProfileRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'profile',
            target: profileEntity,
            targetProperty: 'owner',
            type: '1:1',
            isTargetReliance: true
        })
        // 谓词同时包含 base 自身属性和跨实体属性
        const activeTechUserEntity = Entity.create({
            name: 'ActiveTechUser',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            }).and({
                key: 'team.type',
                value: ['=', 'tech']
            })
        })
        return {
            entities: [userEntity, teamEntity, profileEntity, activeTechUserEntity],
            relations: [userTeamRelation, userProfileRelation]
        }
    }

    beforeEach(async () => {
        const { entities, relations } = createSchema()
        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('3.1.2 dependency is registered exactly once under the base entity name', () => {
        const filteredEntityManager = (handle.agent as any).filteredEntityManager
        const userDependencies = filteredEntityManager.getAffectedFilteredEntities('User')
            .filter((dep: any) => dep.filteredEntityName === 'ActiveTechUser')
        // 修复前：谓词包含 base 自身属性时，同一个 dependency 会在 'User' 名下注册两次，
        // 导致每次 update 做双倍的 membership 查询。
        expect(userDependencies.length).toBe(1)

        // 跨实体依赖（Team）也只注册一次
        const teamDependencies = filteredEntityManager.getAffectedFilteredEntities('Team')
            .filter((dep: any) => dep.filteredEntityName === 'ActiveTechUser')
        expect(teamDependencies.length).toBe(1)
    })

    test('3.1.2 duplicate registration removal does not duplicate membership events', async () => {
        const team = await handle.create('Team', { name: 'Engineering', type: 'tech' })
        const user = await handle.create('User', { name: 'Alice', age: 30, isActive: false, team })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { isActive: true }, events)

        const filteredCreateEvents = events.filter(e => e.type === 'create' && e.recordName === 'ActiveTechUser')
        expect(filteredCreateEvents.length).toBe(1)
    })

    test('3.1.3 merged preprocessSameRowData: update path still produces correct update event', async () => {
        const user = await handle.create('User', { name: 'Bob', age: 20, isActive: true })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { age: 21 }, events)

        const updateEvents = events.filter(e => e.type === 'update' && e.recordName === 'User')
        expect(updateEvents.length).toBe(1)
        expect(updateEvents[0].record!.age).toBe(21)
        expect(updateEvents[0].record!.id).toBe(user.id)
        // oldRecord 携带更新前的值属性
        expect(updateEvents[0].oldRecord!.age).toBe(20)
        expect(updateEvents[0].oldRecord!.name).toBe('Bob')
    })

    test('3.1.3 merged preprocessSameRowData: agent delegation handles update branch (id assignment + update event)', async () => {
        const user = await handle.create('User', { name: 'Carl', age: 40, isActive: true })
        const oldRecord = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), {}, ['*'])

        const events: RecordMutationEvent[] = []
        // 直接调用 agent 上的方法（历史上这里是第二份复制的实现）
        const newData = new NewRecordData(handle.map, 'User', { age: 41 })
        const processed = await handle.agent.preprocessSameRowData(newData, true, events, oldRecord)

        // update 分支必须从 oldRecord 补上 id
        expect(processed.getData().id).toBe(user.id)
        const updateEvents = events.filter(e => e.type === 'update' && e.recordName === 'User')
        expect(updateEvents.length).toBe(1)
        expect(updateEvents[0].record!.id).toBe(user.id)
        expect(updateEvents[0].oldRecord!.age).toBe(40)
    })

    test('3.1.4 deletion events are grouped structurally: record delete events always come last', async () => {
        const team = await handle.create('Team', { name: 'T1', type: 'tech' })
        await handle.create('User', { name: 'D1', age: 1, isActive: true, team, profile: { title: 'p1' } })
        await handle.create('User', { name: 'D2', age: 2, isActive: true, team, profile: { title: 'p2' } })

        const events: RecordMutationEvent[] = []
        await handle.delete('User', MatchExp.atom({ key: 'age', value: ['<', 10] }), events)

        const userDeleteIndexes = events
            .map((e, i) => (e.type === 'delete' && e.recordName === 'User') ? i : -1)
            .filter(i => i >= 0)
        expect(userDeleteIndexes.length).toBe(2)

        // 所有非 User 的事件（link 删除、reliance 级联删除、filtered entity 删除）都在 User 删除事件之前
        const firstUserDeleteIndex = Math.min(...userDeleteIndexes)
        const nonUserEventsAfter = events
            .slice(firstUserDeleteIndex)
            .filter(e => e.recordName !== 'User')
        expect(nonUserEventsAfter.length).toBe(0)

        // reliance（Profile）的级联删除事件在 User 删除事件之前
        const profileDeleteIndexes = events
            .map((e, i) => (e.type === 'delete' && e.recordName === 'Profile') ? i : -1)
            .filter(i => i >= 0)
        expect(profileDeleteIndexes.length).toBe(2)
        expect(Math.max(...profileDeleteIndexes)).toBeLessThan(firstUserDeleteIndex)

        // 关系删除事件也在 User 删除事件之前
        const linkDeleteEvents = events.filter(e => e.type === 'delete' && e.recordName.includes('_team_'))
        expect(linkDeleteEvents.length).toBe(2)
        events.forEach((e, i) => {
            if (e.type === 'delete' && e.recordName.includes('_team_')) {
                expect(i).toBeLessThan(firstUserDeleteIndex)
            }
        })
    })

    test('3.1.6 in with empty array is always false instead of invalid SQL', async () => {
        await handle.create('User', { name: 'E1', age: 1, isActive: true })
        await handle.create('User', { name: 'E2', age: 2, isActive: true })

        // 空数组 ⇒ 恒 false，不产生 `IN ()` 非法 SQL
        const noneMatched = await handle.find('User', MatchExp.atom({ key: 'name', value: ['in', []] }), {}, ['name'])
        expect(noneMatched.length).toBe(0)

        // 外层 NOT 下语义正确：NOT(恒 false) = 恒 true
        const allMatched = await handle.find('User', MatchExp.atom({ key: 'name', value: ['in', []] }).not(), {}, ['name'])
        expect(allMatched.length).toBe(2)

        // 非空数组行为不变
        const oneMatched = await handle.find('User', MatchExp.atom({ key: 'name', value: ['in', ['E1']] }), {}, ['name'])
        expect(oneMatched.length).toBe(1)
        expect(oneMatched[0].name).toBe('E1')
    })

    test('3.1.6 in with non-array value throws a clear error', async () => {
        await expect(
            handle.find('User', MatchExp.atom({ key: 'name', value: ['in', 'notAnArray'] }), {}, ['name'])
        ).rejects.toThrow(/'in' requires an array value/)
    })

    test("3.1.6 'not' with non-null value throws instead of generating invalid SQL", async () => {
        await handle.create('User', { name: 'N1', age: 1, isActive: true })
        await expect(
            handle.find('User', MatchExp.atom({ key: 'name', value: ['not', 'N1'] }), {}, ['name'])
        ).rejects.toThrow(/'not' only supports null/)

        // ['not', null]（IS NOT NULL）行为不变
        const found = await handle.find('User', MatchExp.atom({ key: 'name', value: ['not', null] }), {}, ['name'])
        expect(found.length).toBe(1)
    })

    test('3.1.7 NULL __filtered_entities does not crash flag update', async () => {
        const team = await handle.create('Team', { name: 'T2', type: 'tech' })
        const user = await handle.create('User', { name: 'F1', age: 5, isActive: false, team })

        // 模拟存量数据/手工迁移：把 __filtered_entities 置为 NULL
        const flagsField = (setup.map.records['User'].attributes['__filtered_entities'] as any).field
        const table = setup.map.records['User'].table
        await db.query(`UPDATE "${table}" SET "${flagsField}" = NULL`, [])

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { isActive: true }, events)

        const filteredCreateEvents = events.filter(e => e.type === 'create' && e.recordName === 'ActiveTechUser')
        expect(filteredCreateEvents.length).toBe(1)

        // 标记被正确重建
        const updated = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), {}, ['*'])
        expect(updated.__filtered_entities['ActiveTechUser']).toBe(true)
    })
})

describe('3.1.5 name format enforcement', () => {
    test('Entity.create rejects invalid names', () => {
        expect(() => Entity.create({ name: 'Bad Name', properties: [] })).toThrow(/invalid/)
        expect(() => Entity.create({ name: 'Bad"; DROP TABLE users;--', properties: [] })).toThrow(/invalid/)
        expect(() => Entity.create({ name: 'Bad-Name', properties: [] })).toThrow(/invalid/)
        expect(() => Entity.create({ name: '', properties: [] })).toThrow(/invalid/)
        // 合法名字不受影响
        expect(() => Entity.create({ name: 'Good_Name_1', properties: [] })).not.toThrow()
    })

    test('Relation.create rejects invalid explicit names and property names', () => {
        const a = Entity.create({ name: 'RelNameCheckA', properties: [] })
        const b = Entity.create({ name: 'RelNameCheckB', properties: [] })
        expect(() => Relation.create({
            name: 'bad relation name',
            source: a, sourceProperty: 'b', target: b, targetProperty: 'a', type: 'n:1'
        })).toThrow(/invalid/)
        expect(() => Relation.create({
            source: a, sourceProperty: 'bad prop', target: b, targetProperty: 'a', type: 'n:1'
        })).toThrow(/invalid/)
        expect(() => Relation.create({
            source: a, sourceProperty: 'b', target: b, targetProperty: 'bad prop', type: 'n:1'
        })).toThrow(/invalid/)
        expect(() => Relation.create({
            source: a, sourceProperty: 'b', target: b, targetProperty: 'a', type: 'n:1'
        })).not.toThrow()
    })

    test('DBSetup boundary rejects invalid names even when Klass factory is bypassed', () => {
        // 绕过 Entity.create 直接构造实例
        const bad = new (Entity as any)({ name: 'Bad Name', properties: [] })
        expect(() => new DBSetup([bad], [])).toThrow(/invalid/)
    })
})

describe('3.2.1 update pre-query trimming', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' })
            ]
        })
        const profileEntity = Entity.create({
            name: 'Profile',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        })
        const itemEntity = Entity.create({
            name: 'Item',
            properties: [
                Property.create({ name: 'itemName', type: 'string' })
            ]
        })
        // profile：普通 1:1（可以在 update 中替换）；item：1:1 reliance（三表合一，字段在同一行）
        const userProfileRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'profile',
            target: profileEntity,
            targetProperty: 'owner',
            type: '1:1'
        })
        const userItemRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'item',
            target: itemEntity,
            targetProperty: 'owner',
            type: '1:1',
            isTargetReliance: true
        })

        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup([userEntity, profileEntity, itemEntity], [userProfileRelation, userItemRelation], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    const getProfileLinkField = () => {
        const linkName = handle.getRelationName('User', 'profile')
        return (setup.map.records[linkName].attributes['target'] as any).field as string
    }

    test('updating only value attributes does not fetch unrelated relation/reliance data', async () => {
        const user = await handle.create('User', {
            name: 'U1', age: 10,
            profile: { title: 'p' },
            item: { itemName: 'i' }
        })

        const recorded = recordQueries(db)
        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { age: 11 }, events)

        const preQuery = recorded.find(q => q.name.includes('find record for updating User'))
        expect(preQuery).toBeDefined()

        // 未涉及的 reliance（Item，三表合一）字段不应出现在前置查询中
        const itemNameField = (setup.map.records['Item'].attributes['itemName'] as any).field
        expect(preQuery!.sql).not.toContain(itemNameField)
        // 未涉及的合并关系（profile）的 link 字段也不应出现
        expect(preQuery!.sql).not.toContain(getProfileLinkField())

        // 值属性仍然全部保留（update 事件的 oldRecord 需要）
        const userNameField = (setup.map.records['User'].attributes['name'] as any).field
        expect(preQuery!.sql).toContain(userNameField)
        const updateEvent = events.find(e => e.type === 'update' && e.recordName === 'User')!
        expect(updateEvent.oldRecord!.name).toBe('U1')
        expect(updateEvent.oldRecord!.age).toBe(10)
    })

    test('updating a relation attribute still fetches that relation and replaces it correctly', async () => {
        const user = await handle.create('User', {
            name: 'U2', age: 20,
            profile: { title: 'old' },
            item: { itemName: 'keep' }
        })
        const newProfile = await handle.create('Profile', { title: 'new' })

        const recorded = recordQueries(db)
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), {
            profile: { id: newProfile.id }
        })

        const preQuery = recorded.find(q => q.name.includes('find record for updating User'))!
        // 涉及的 profile 关系字段必须在前置查询中（unlink 判断需要）
        expect(preQuery.sql).toContain(getProfileLinkField())
        // 未涉及的 item 字段不在
        const itemNameField = (setup.map.records['Item'].attributes['itemName'] as any).field
        expect(preQuery.sql).not.toContain(itemNameField)

        const updated = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            {},
            ['name', ['profile', { attributeQuery: ['title'] }], ['item', { attributeQuery: ['itemName'] }]]
        )
        expect(updated.profile.title).toBe('new')
        // 未涉及的关系不受影响
        expect(updated.item.itemName).toBe('keep')
    })
})

describe('3.2.2 batched x:n related record queries', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })
        const postEntity = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'seq', type: 'number' })
            ]
        })
        const tagEntity = Entity.create({
            name: 'Tag',
            properties: [
                Property.create({ name: 'tagName', type: 'string' })
            ]
        })
        const userPostRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'posts',
            target: postEntity,
            targetProperty: 'author',
            type: '1:n',
            properties: [
                Property.create({ name: 'pinned', type: 'boolean' })
            ]
        })
        const userTagRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'tags',
            target: tagEntity,
            targetProperty: 'users',
            type: 'n:n'
        })

        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup([userEntity, postEntity, tagEntity], [userPostRelation, userTagRelation], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('1:n related records are fetched with one query per batch and correctly grouped', async () => {
        const u1 = await handle.create('User', { name: 'A' })
        const u2 = await handle.create('User', { name: 'B' })
        const u3 = await handle.create('User', { name: 'C' })
        await handle.create('Post', { title: 'a1', seq: 1, author: u1 })
        await handle.create('Post', { title: 'a2', seq: 2, author: u1 })
        await handle.create('Post', { title: 'b1', seq: 3, author: u2 })
        // u3 没有 post

        const recorded = recordQueries(db)
        const users = await handle.find('User', undefined, { orderBy: { name: 'ASC' } }, [
            'name',
            ['posts', { attributeQuery: ['title', 'seq'], modifier: { orderBy: { seq: 'ASC' } } }]
        ])

        // 1 次根查询 + 1 次批量子查询（修复前是 1 + 每个父记录 1 次 = 4 次）
        expect(recorded.length).toBe(2)

        expect(users.length).toBe(3)
        expect(users[0].posts.map((p: any) => p.title)).toEqual(['a1', 'a2'])
        expect(users[1].posts.map((p: any) => p.title)).toEqual(['b1'])
        // 没有子记录的父记录必须得到空数组
        expect(users[2].posts).toEqual([])
    })

    test('batched 1:n query keeps relation (&) data semantics', async () => {
        const u1 = await handle.create('User', { name: 'A' })
        const u2 = await handle.create('User', { name: 'B' })
        await handle.create('Post', { title: 'a1', seq: 1, author: u1 })
        await handle.addRelationById('User', 'posts', u2.id, (await handle.create('Post', { title: 'b1', seq: 2 })).id, { pinned: true })

        const users = await handle.find('User', undefined, { orderBy: { name: 'ASC' } }, [
            'name',
            ['posts', { attributeQuery: ['title', ['&', { attributeQuery: ['pinned'] }]] }]
        ])

        expect(users[0].posts.length).toBe(1)
        expect(users[0].posts[0]['&']).toBeDefined()
        expect(users[1].posts.length).toBe(1)
        expect(users[1].posts[0]['&'].pinned).toBe(true)
        // 临时用于分组的反向属性不应泄漏到结果里
        expect(users[0].posts[0].author).toBeUndefined()
        expect(users[1].posts[0].author).toBeUndefined()
    })

    test('per-parent limit falls back to per-record queries with correct semantics', async () => {
        const u1 = await handle.create('User', { name: 'A' })
        const u2 = await handle.create('User', { name: 'B' })
        await handle.create('Post', { title: 'a1', seq: 1, author: u1 })
        await handle.create('Post', { title: 'a2', seq: 2, author: u1 })
        await handle.create('Post', { title: 'b1', seq: 3, author: u2 })
        await handle.create('Post', { title: 'b2', seq: 4, author: u2 })

        const users = await handle.find('User', undefined, { orderBy: { name: 'ASC' } }, [
            'name',
            ['posts', { attributeQuery: ['title'], modifier: { limit: 1, orderBy: { seq: 'ASC' } } }]
        ])

        // limit 是 per-parent 语义，每个父记录都限制 1 条
        expect(users[0].posts.map((p: any) => p.title)).toEqual(['a1'])
        expect(users[1].posts.map((p: any) => p.title)).toEqual(['b1'])
    })

    test('n:n related records keep per-record query path and stay correct', async () => {
        const u1 = await handle.create('User', { name: 'A' })
        const u2 = await handle.create('User', { name: 'B' })
        const t1 = await handle.create('Tag', { tagName: 't1' })
        const t2 = await handle.create('Tag', { tagName: 't2' })
        await handle.addRelationById('User', 'tags', u1.id, t1.id)
        await handle.addRelationById('User', 'tags', u1.id, t2.id)
        await handle.addRelationById('User', 'tags', u2.id, t2.id)

        const users = await handle.find('User', undefined, { orderBy: { name: 'ASC' } }, [
            'name',
            ['tags', { attributeQuery: ['tagName'] }]
        ])

        expect(users[0].tags.map((t: any) => t.tagName).sort()).toEqual(['t1', 't2'])
        expect(users[1].tags.map((t: any) => t.tagName)).toEqual(['t2'])
    })

    test('user-requested reverse attribute in subquery is preserved when batching', async () => {
        const u1 = await handle.create('User', { name: 'A' })
        const u2 = await handle.create('User', { name: 'B' })
        await handle.create('Post', { title: 'a1', seq: 1, author: u1 })
        await handle.create('Post', { title: 'b1', seq: 2, author: u2 })

        const users = await handle.find('User', undefined, { orderBy: { name: 'ASC' } }, [
            'name',
            ['posts', { attributeQuery: ['title', ['author', { attributeQuery: ['name'] }]] }]
        ])

        expect(users[0].posts[0].author.name).toBe('A')
        expect(users[1].posts[0].author.name).toBe('B')
    })
})

describe('3.2.3 batched filtered entity flag maintenance', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })
        const teamEntity = Entity.create({
            name: 'Team',
            properties: [
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
            matchExpression: MatchExp.atom({
                key: 'team.type',
                value: ['=', 'tech']
            })
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

    test('one flags query + one membership query per dependency when many records are affected', async () => {
        const team = await handle.create('Team', { type: 'sales' })
        const users = []
        for (let i = 0; i < 3; i++) {
            users.push(await handle.create('User', { name: `U${i}`, team }))
        }

        const recorded = recordQueries(db)
        const events: RecordMutationEvent[] = []
        await handle.update('Team', MatchExp.atom({ key: 'id', value: ['=', team.id] }), { type: 'tech' }, events)

        // 所有受影响的 user 都产生 filtered entity create 事件
        const filteredCreateEvents = events.filter(e => e.type === 'create' && e.recordName === 'TechTeamUser')
        expect(filteredCreateEvents.length).toBe(3)
        expect(new Set(filteredCreateEvents.map(e => e.record!.id))).toEqual(new Set(users.map(u => u.id)))

        // 批量化：取当前标记 1 次查询（修复前是每条受影响记录 1 次）
        const flagQueries = recorded.filter(q => q.name.includes('get current filtered entity flags'))
        expect(flagQueries.length).toBe(1)
        // membership 检查 1 次查询（修复前是每条受影响记录 1 次）
        const membershipQueries = recorded.filter(q => q.name.includes('match filter condition'))
        expect(membershipQueries.length).toBe(1)

        // 标记全部正确持久化
        const techUsers = await handle.find('TechTeamUser', undefined, {}, ['name'])
        expect(techUsers.length).toBe(3)
    })

    test('membership leave events are generated for all affected records', async () => {
        const team = await handle.create('Team', { type: 'tech' })
        for (let i = 0; i < 3; i++) {
            await handle.create('User', { name: `U${i}`, team })
        }

        const events: RecordMutationEvent[] = []
        await handle.update('Team', MatchExp.atom({ key: 'id', value: ['=', team.id] }), { type: 'sales' }, events)

        const filteredDeleteEvents = events.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUser')
        expect(filteredDeleteEvents.length).toBe(3)

        const techUsers = await handle.find('TechTeamUser', undefined, {}, ['name'])
        expect(techUsers.length).toBe(0)
    })
})

describe('3.2.4 runtime table alias fallback beyond pregenerated depth', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle
    let map: EntityToTableMap
    // 两个仅在超过 63 字节截断点之后才不同的长属性名（PG 截断后会碰撞）
    const longAttrA = 'branch_' + 'x'.repeat(56) + '_a'
    const longAttrB = 'branch_' + 'x'.repeat(56) + '_b'

    beforeEach(async () => {
        // 链：C0 -l1-> C1 -l2-> C2 -l3-> C3 -l4-> C4 -l5-> C5，然后 C5 上有两个长名分支
        const entities = []
        for (let i = 0; i <= 5; i++) {
            entities.push(Entity.create({
                name: `Chain${i}`,
                properties: [Property.create({ name: 'name', type: 'string' })]
            }))
        }
        const branchA = Entity.create({ name: 'BranchA', properties: [Property.create({ name: 'name', type: 'string' })] })
        const branchB = Entity.create({ name: 'BranchB', properties: [Property.create({ name: 'name', type: 'string' })] })

        const relations = []
        for (let i = 0; i < 5; i++) {
            relations.push(Relation.create({
                source: entities[i],
                sourceProperty: `l${i + 1}`,
                target: entities[i + 1],
                targetProperty: `r${i + 1}`,
                type: 'n:1'
            }))
        }
        relations.push(Relation.create({
            source: entities[5],
            sourceProperty: longAttrA,
            target: branchA,
            targetProperty: 'back',
            type: 'n:1'
        }))
        relations.push(Relation.create({
            source: entities[5],
            sourceProperty: longAttrB,
            target: branchB,
            targetProperty: 'back',
            type: 'n:1'
        }))

        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup([...entities, branchA, branchB], relations, db)
        await setup.createTables()
        map = new EntityToTableMap(setup.map, setup.aliasManager)
        handle = new EntityQueryHandle(map, db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('deep paths beyond depth 5 get runtime-registered aliases within the 63-char limit', () => {
        const deepPathA = ['Chain0', 'l1', 'l2', 'l3', 'l4', 'l5', longAttrA]
        const deepPathB = ['Chain0', 'l1', 'l2', 'l3', 'l4', 'l5', longAttrB]

        const aliasA = map.getTableAndAliasStack(deepPathA).at(-1)!.alias
        const aliasB = map.getTableAndAliasStack(deepPathB).at(-1)!.alias

        // 别名必须在 PG 的 63 字节限制内（修复前落回原始长名，PG 会静默截断）
        expect(aliasA.length).toBeLessThanOrEqual(63)
        expect(aliasB.length).toBeLessThanOrEqual(63)
        // 两条长路径截断后不能碰撞
        expect(aliasA).not.toBe(aliasB)
        // 别名可以解析回原始路径
        if (aliasA.startsWith('T')) {
            expect(setup.aliasManager.getTablePath(aliasA)).toBeDefined()
        }
    })

    test('deep query across both long branches executes correctly end to end', async () => {
        const bA = await handle.create('BranchA', { name: 'goalA' })
        const bB = await handle.create('BranchB', { name: 'goalB' })
        const c5 = await handle.create('Chain5', { name: 'c5', [longAttrA]: bA, [longAttrB]: bB })
        const c4 = await handle.create('Chain4', { name: 'c4', l5: c5 })
        const c3 = await handle.create('Chain3', { name: 'c3', l4: c4 })
        const c2 = await handle.create('Chain2', { name: 'c2', l3: c3 })
        const c1 = await handle.create('Chain1', { name: 'c1', l2: c2 })
        await handle.create('Chain0', { name: 'c0', l1: c1 })
        // 干扰数据
        await handle.create('Chain0', { name: 'other' })

        // 同一查询里同时通过两条深度为 6 的长名路径做 match（修复前两个超长别名截断后同名，PG 会报错或产生错误 JOIN）
        const found = await handle.find(
            'Chain0',
            MatchExp.atom({ key: ['l1', 'l2', 'l3', 'l4', 'l5', longAttrA, 'name'].join('.'), value: ['=', 'goalA'] })
                .and({ key: ['l1', 'l2', 'l3', 'l4', 'l5', longAttrB, 'name'].join('.'), value: ['=', 'goalB'] }),
            {},
            ['name']
        )
        expect(found.length).toBe(1)
        expect(found[0].name).toBe('c0')
    })
})

describe('3.2.5 / 3.3.1 metadata and dependency analysis caching', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let map: EntityToTableMap

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
            properties: [Property.create({ name: 'type', type: 'string' })]
        })
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        })
        const activeUserEntity = Entity.create({
            name: 'ActiveUser',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })

        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup(
            [userEntity, teamEntity, activeUserEntity],
            [userTeamRelation],
            db
        )
        await setup.createTables()
        map = new EntityToTableMap(setup.map, setup.aliasManager)
    })

    afterEach(async () => {
        await db.close()
    })

    test('3.2.5 getRecordInfo and getInfoByPath return cached objects on immutable map', () => {
        expect(map.getRecordInfo('User')).toBe(map.getRecordInfo('User'))
        expect(map.getInfoByPath(['User', 'team'])).toBe(map.getInfoByPath(['User', 'team']))
        expect(map.getInfoByPath(['User', 'team', 'type'])).toBe(map.getInfoByPath(['User', 'team', 'type']))
        // 不同路径仍然是不同对象
        expect(map.getInfoByPath(['User', 'name'])).not.toBe(map.getInfoByPath(['User', 'team']))
        // 缓存不改变行为
        expect(map.getInfoByPath(['User', 'team'])!.isRecord).toBe(true)
        expect(map.getInfoByPath(['User', 'name'])!.isValue).toBe(true)
    })

    test('3.3.1 filtered entity dependency analysis is shared across agents on the same map data', () => {
        const agent1 = new RecordQueryAgent(map, db)
        const agent2 = new RecordQueryAgent(map, db)
        // 同一 MapData 的依赖分析结果是共享的（WeakMap 缓存），不会重复计算
        const deps1 = (agent1 as any).filteredEntityManager.getAffectedFilteredEntities('User')
        const deps2 = (agent2 as any).filteredEntityManager.getAffectedFilteredEntities('User')
        expect(deps1.length).toBeGreaterThan(0)
        expect(deps1).toBe(deps2)

        // 相同 map data 的另一个 EntityToTableMap 实例也共享（缓存 key 是 MapData）
        const map2 = new EntityToTableMap(setup.map, setup.aliasManager)
        const agent3 = new RecordQueryAgent(map2, db)
        const deps3 = (agent3 as any).filteredEntityManager.getAffectedFilteredEntities('User')
        expect(deps3).toBe(deps1)

        // 依然没有重复注册
        expect(deps1.filter((d: any) => d.filteredEntityName === 'ActiveUser').length).toBe(1)
    })
})

describe('3.3.3 / 3.3.5 AttributeQuery and MatchExp cleanups', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let map: EntityToTableMap
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const activeUserEntity = Entity.create({
            name: 'ActiveUser',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })

        db = new PGLiteDB()
        await db.open()
        setup = new DBSetup([userEntity, activeUserEntity], [], db)
        await setup.createTables()
        map = new EntityToTableMap(setup.map, setup.aliasManager)
        handle = new EntityQueryHandle(map, db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('3.3.3 AttributeQuery no longer carries a random debug id', () => {
        const attributeQuery = new AttributeQuery('User', map, ['name'])
        expect((attributeQuery as any).id).toBeUndefined()
    })

    test('3.3.5 filtered entity match merging happens exactly once', () => {
        // 通过 RecordQuery.create 构造：filter 条件只出现一次（由 MatchExp 构造器统一合并）
        const query = RecordQuery.create('ActiveUser', map, {
            matchExpression: MatchExp.atom({ key: 'name', value: ['=', 'x'] }),
            attributeQuery: ['name']
        })
        expect(countAtomsWithKey(query.matchExpression.data, 'isActive')).toBe(1)
        expect(countAtomsWithKey(query.matchExpression.data, 'name')).toBe(1)

        // 直接构造 MatchExp 也一样
        const matchExp = new MatchExp('ActiveUser', map, MatchExp.atom({ key: 'name', value: ['=', 'x'] }))
        expect(countAtomsWithKey(matchExp.data, 'isActive')).toBe(1)
    })

    test('3.3.5 filtered entity queries stay correct end to end', async () => {
        await handle.create('User', { name: 'a', isActive: true })
        await handle.create('User', { name: 'a', isActive: false })
        await handle.create('User', { name: 'b', isActive: true })

        const activeA = await handle.find('ActiveUser', MatchExp.atom({ key: 'name', value: ['=', 'a'] }), {}, ['name', 'isActive'])
        expect(activeA.length).toBe(1)
        expect(activeA[0].isActive).toBe(true)

        const allActive = await handle.find('ActiveUser', undefined, {}, ['name'])
        expect(allActive.length).toBe(2)
    })
})

describe('3.3.2 explicit RecordOperationAgent contract between executors', () => {
    let db: PGLiteDB
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const profileEntity = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const groupEntity = Entity.create({
            name: 'Group',
            properties: [Property.create({ name: 'groupName', type: 'string' })]
        })
        const relations = [
            Relation.create({
                source: userEntity,
                sourceProperty: 'profile',
                target: profileEntity,
                targetProperty: 'owner',
                type: '1:1',
                isTargetReliance: true
            }),
            Relation.create({
                source: userEntity,
                sourceProperty: 'group',
                target: groupEntity,
                targetProperty: 'members',
                type: 'n:1'
            })
        ]

        db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([userEntity, profileEntity, groupEntity], relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
    })

    test('cross-executor callbacks (create→update→unlink→delete) work through the typed contract', async () => {
        // create：CreationExecutor 回调 agent.updateRecord / agent.flashOutCombinedRecordsAndMergedLinks
        const g1 = await handle.create('Group', { groupName: 'g1' })
        const g2 = await handle.create('Group', { groupName: 'g2' })
        const user = await handle.create('User', { name: 'u', profile: { title: 't' }, group: g1 })

        // update 替换关系：UpdateExecutor 回调 agent.unlink / agent.addLinkFromRecord / agent.preprocessSameRowData
        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { group: g2 }, events)
        const updated = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), {},
            ['name', ['group', { attributeQuery: ['groupName'] }]])
        expect(updated.group.groupName).toBe('g2')

        // delete：DeletionExecutor 回调 agent.findRecords，级联删除 reliance
        const deleteEvents: RecordMutationEvent[] = []
        await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), deleteEvents)
        expect(deleteEvents.some(e => e.type === 'delete' && e.recordName === 'User')).toBe(true)
        expect(deleteEvents.some(e => e.type === 'delete' && e.recordName === 'Profile')).toBe(true)
        const remainingProfiles = await handle.find('Profile', undefined, {}, ['title'])
        expect(remainingProfiles.length).toBe(0)
    })
})
