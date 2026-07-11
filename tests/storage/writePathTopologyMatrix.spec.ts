/**
 * 写路径 × 物理拓扑矩阵（r17 复盘落地项，盲区 1 + 盲区 2）。
 *
 * 背景：同一个逻辑关系声明会被 Setup 编译成不同物理拓扑（combined 三表合一 /
 * merged FK 列并入端点行 / isolated 独立关系表），走三条不同的写路径代码。
 * 历史致命 bug（r5-F-3、r6 家族、r17 F-1/F-2）反复落在「测试 fixture 把拓扑
 * 焊死在单一取值」的空白格上。本矩阵把同一组写操作在全部可达拓扑上各跑一遍，
 * 每个格子同时断言四个面：
 *   1. 语义面：操作的预期结果（owner 归属、字段值）；
 *   2. 事件面：事件完备性预言机（数据 diff ⟺ 事件流，r17 F-2 类的结构性防线）；
 *   3. 不变量面：INV-3 x:1 排他侧唯一（r17 F-1 类）；
 *   4. 一致性面：正反方向查询同一事实。
 *
 * 拓扑可达性说明：非 reliance 1:1 默认 merged-to-source；显式 mergeLinks 得 combined；
 * n:1/1:n 默认 merged 到「1」端行；n:n 恒 isolated。isolated x:1 当前 Setup 不可产出
 * （addLink 中对应分支为防御性代码）。
 */
import { expect, test, describe, afterEach } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';
import {
    withEventCompleteness,
    assertExclusiveSideUnique,
    assertBidirectionalConsistency,
    EventCompletenessSchema
} from "./helpers/eventCompleteness.js";

describe('write-path topology matrix', () => {
    let db: SQLiteDB
    afterEach(async () => { await db.close() })

    // ---------- 1:1 家族（combined 与 merged 两种拓扑跑同一组断言） ----------

    function createOneToOneSchema() {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const own = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1',
            properties: [Property.create({ name: 'viewed', type: 'number' })]
        })
        return { entities: [User, Profile], relations: [own], linkName: own.name! }
    }

    async function bootstrapOneToOne(mergeLinks?: string[]) {
        const { entities, relations, linkName } = createOneToOneSchema()
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup(entities, relations, db, mergeLinks)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        const schema: EventCompletenessSchema = { entities: ['User', 'Profile'], relations: [linkName] }
        return { handle, linkName, schema }
    }

    async function assertOneToOneInvariants(handle: EntityQueryHandle, linkName: string, label: string) {
        await assertExclusiveSideUnique(handle, linkName, '1:1', label)
        await assertBidirectionalConsistency(handle, {
            sourceEntity: 'User', sourceProperty: 'profile',
            targetEntity: 'Profile', targetProperty: 'owner'
        }, label)
    }

    // 同一组逻辑断言，在两种拓扑下各执行一遍。
    const oneToOneTopologies: Array<[string, string[] | undefined]> = [
        ['merged (default)', undefined],
        ['combined (explicit mergeLinks)', ['User.profile']],
    ]

    for (const [topology, mergeLinks] of oneToOneTopologies) {
        describe(`1:1 ${topology}`, () => {
            test('create with owned ref steals; update steals; same-id keeps; & updates emit events; null clears; delete cascades', async () => {
                const { handle, linkName, schema } = await bootstrapOneToOne(mergeLinks)

                // 1. 基础 create（嵌套 + ref），事件完备
                let p1: any, p2: any, u1: any, u2: any
                await withEventCompleteness(handle, schema, `[${topology}] create nested`, async (events) => {
                    u1 = await handle.create('User', { name: 'u1', profile: { title: 'p1', '&': { viewed: 1 } } }, events)
                })
                p1 = u1.profile
                await withEventCompleteness(handle, schema, `[${topology}] create standalone target`, async (events) => {
                    p2 = await handle.create('Profile', { title: 'p2' }, events)
                })
                await withEventCompleteness(handle, schema, `[${topology}] create with free ref`, async (events) => {
                    u2 = await handle.create('User', { name: 'u2', profile: { id: p2.id, '&': { viewed: 2 } } }, events)
                })
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after setup`)

                // 2. CREATE 抢夺：u3 引用已被 u1 拥有的 p1
                await withEventCompleteness(handle, schema, `[${topology}] create steal`, async (events) => {
                    await handle.create('User', { name: 'u3', profile: { id: p1.id } }, events)
                })
                const p1Owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p1.id] }), undefined, ['name'])
                expect(p1Owners.map(o => o.name), `[${topology}] create-steal single owner`).toEqual(['u3'])
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after create steal`)

                // 3. UPDATE 抢夺：u1 抢回 p1
                await withEventCompleteness(handle, schema, `[${topology}] update steal`, async (events) => {
                    await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), { profile: { id: p1.id } }, events)
                })
                const p1Owners2 = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p1.id] }), undefined, ['name'])
                expect(p1Owners2.map(o => o.name), `[${topology}] update-steal single owner`).toEqual(['u1'])
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after update steal`)

                // 4. 同 id 幂等重写：零事件、link 数据保留
                const idempotentEvents = await withEventCompleteness(handle, schema, `[${topology}] same-id idempotent`, async (events) => {
                    await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), { profile: { id: p2.id } }, events)
                })
                expect(idempotentEvents.length, `[${topology}] idempotent rewrite must be silent`).toBe(0)

                // 5. 同 id + & 原地更新：数据面 + 事件面（预言机自动对账 keys 覆盖）
                await withEventCompleteness(handle, schema, `[${topology}] same-id & update`, async (events) => {
                    await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), { profile: { id: p2.id, '&': { viewed: 99 } } }, events)
                })
                const link2 = await handle.findRelationByName(linkName, MatchExp.atom({ key: 'target.id', value: ['=', p2.id] }), undefined, ['viewed'])
                expect(link2[0]?.viewed, `[${topology}] & data persisted`).toBe(99)

                // 6. 从 attribute 侧（Profile.owner）抢夺
                await withEventCompleteness(handle, schema, `[${topology}] steal from attribute side`, async (events) => {
                    await handle.update('Profile', MatchExp.atom({ key: 'id', value: ['=', p2.id] }), { owner: { id: u1.id } }, events)
                })
                const u1Row = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined, ['name', ['profile', { attributeQuery: ['title'] }]])
                expect(u1Row.profile?.id, `[${topology}] attribute-side steal target`).toBe(p2.id)
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after attribute-side steal`)

                // 7. null 清除关系
                await withEventCompleteness(handle, schema, `[${topology}] null clears`, async (events) => {
                    await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), { profile: null }, events)
                })
                const u1RowAfterNull = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined, ['name', ['profile', { attributeQuery: ['title'] }]])
                expect(u1RowAfterNull.profile === undefined || u1RowAfterNull.profile === null, `[${topology}] relation cleared`).toBe(true)
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after null`)

                // 8. 删除带关系的实体：link 必须随之消失且有事件
                await withEventCompleteness(handle, schema, `[${topology}] delete entity with link`, async (events) => {
                    await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), events)
                })
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after delete`)
            })

            test('link-level addRelation steal keeps single owner', async () => {
                const { handle, linkName, schema } = await bootstrapOneToOne(mergeLinks)
                const p = await handle.create('Profile', { title: 'P' })
                const u1 = await handle.create('User', { name: 'u1', profile: { id: p.id } })
                const u2 = await handle.create('User', { name: 'u2' })

                await withEventCompleteness(handle, schema, `[${topology}] addRelation steal`, async (events) => {
                    await handle.addRelationByNameById(linkName, u2.id, p.id, {}, events)
                })
                const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p.id] }), undefined, ['name'])
                expect(owners.map(o => o.name), `[${topology}] addRelation steal single owner`).toEqual(['u2'])
                await assertOneToOneInvariants(handle, linkName, `[${topology}] after addRelation steal`)
                // u1 的旧 link 必须已解除
                const u1Row = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined, ['name', ['profile', { attributeQuery: ['id'] }]])
                expect(u1Row.profile === undefined || u1Row.profile === null).toBe(true)
            })
        })
    }

    // ---------- 1:n（merged-to-target：FK 在 target 行上，target 侧排他） ----------

    describe('1:n merged-to-target (default)', () => {
        async function bootstrapOneToMany() {
            const User = Entity.create({
                name: 'User',
                properties: [Property.create({ name: 'name', type: 'string' })]
            })
            const Item = Entity.create({
                name: 'Item',
                properties: [Property.create({ name: 'label', type: 'string' })]
            })
            const owns = Relation.create({
                source: User, sourceProperty: 'items', target: Item, targetProperty: 'holder',
                type: '1:n',
                properties: [Property.create({ name: 'since', type: 'number' })]
            })
            db = new SQLiteDB(':memory:')
            await db.open()
            const setup = new DBSetup([User, Item], [owns], db)
            await setup.createTables()
            const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
            const schema: EventCompletenessSchema = { entities: ['User', 'Item'], relations: [owns.name!] }
            return { handle, linkName: owns.name!, schema }
        }

        test('ownership transfer via source-side collection, attribute side, and link API all keep single holder', async () => {
            const { handle, linkName, schema } = await bootstrapOneToMany()
            const u1 = await handle.create('User', { name: 'u1', items: [{ label: 'i1' }, { label: 'i2' }] })
            const u2 = await handle.create('User', { name: 'u2' })
            const [i1] = await handle.find('Item', MatchExp.atom({ key: 'label', value: ['=', 'i1'] }), undefined, ['label'])

            // 1. 从 target（attribute）侧转移：i1.holder = u2
            await withEventCompleteness(handle, schema, '[1:n] transfer via target side', async (events) => {
                await handle.update('Item', MatchExp.atom({ key: 'id', value: ['=', i1.id] }), { holder: { id: u2.id } }, events)
            })
            await assertExclusiveSideUnique(handle, linkName, '1:n', '[1:n] after target-side transfer')
            const u2Items = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), undefined, ['name', ['items', { attributeQuery: ['label'] }]])
            expect((u2Items.items || []).map((i: any) => i.label)).toEqual(['i1'])

            // 2. link API 转移回 u1（i1 已被 u2 持有 → 抢夺）
            await withEventCompleteness(handle, schema, '[1:n] transfer via addRelation', async (events) => {
                await handle.addRelationByNameById(linkName, u1.id, i1.id, { since: 5 }, events)
            })
            await assertExclusiveSideUnique(handle, linkName, '1:n', '[1:n] after addRelation transfer')
            const holders = await handle.find('User', MatchExp.atom({ key: 'items.id', value: ['=', i1.id] }), undefined, ['name'])
            expect(holders.map(h => h.name)).toEqual(['u1'])

            // 3. 删除 holder：全部 item 的 link 消失且有事件
            await withEventCompleteness(handle, schema, '[1:n] delete holder', async (events) => {
                await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), events)
            })
            await assertExclusiveSideUnique(handle, linkName, '1:n', '[1:n] after delete')
        })
    })

    // ---------- n:1（merged-to-source：FK 在 source 行上，source 侧排他、target 侧共享） ----------

    describe('n:1 merged-to-source (default)', () => {
        test('many sources may share one target; source-side replacement unlinks only own link', async () => {
            const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
            const Team = Entity.create({ name: 'Team', properties: [Property.create({ name: 'tname', type: 'string' })] })
            const membership = Relation.create({
                source: User, sourceProperty: 'team', target: Team, targetProperty: 'members',
                type: 'n:1'
            })
            db = new SQLiteDB(':memory:')
            await db.open()
            const setup = new DBSetup([User, Team], [membership], db)
            await setup.createTables()
            const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
            const schema: EventCompletenessSchema = { entities: ['User', 'Team'], relations: [membership.name!] }

            const t1 = await handle.create('Team', { tname: 't1' })
            const t2 = await handle.create('Team', { tname: 't2' })

            // 多个 source 指向同一 target 是合法的（不许误删他人）
            await withEventCompleteness(handle, schema, '[n:1] two members join', async (events) => {
                await handle.create('User', { name: 'u1', team: { id: t1.id } }, events)
                await handle.create('User', { name: 'u2', team: { id: t1.id } }, events)
            })
            const members = await handle.find('User', MatchExp.atom({ key: 'team.id', value: ['=', t1.id] }), undefined, ['name'])
            expect(members.map(m => m.name).sort()).toEqual(['u1', 'u2'])
            await assertExclusiveSideUnique(handle, membership.name!, 'n:1', '[n:1] after joins')

            // source 侧替换只解除自己的旧 link
            await withEventCompleteness(handle, schema, '[n:1] u2 switches team', async (events) => {
                await handle.update('User', MatchExp.atom({ key: 'name', value: ['=', 'u2'] }), { team: { id: t2.id } }, events)
            })
            const t1Members = await handle.find('User', MatchExp.atom({ key: 'team.id', value: ['=', t1.id] }), undefined, ['name'])
            expect(t1Members.map(m => m.name)).toEqual(['u1'])
            await assertExclusiveSideUnique(handle, membership.name!, 'n:1', '[n:1] after switch')
        })
    })

    // ---------- n:n isolated（无排他性；对称与非对称各一，事件完备回归） ----------

    describe('n:n isolated', () => {
        test('asymmetric n:n: add/remove/delete keep events complete', async () => {
            const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
            const Tag = Entity.create({ name: 'Tag', properties: [Property.create({ name: 'label', type: 'string' })] })
            const tagged = Relation.create({
                source: User, sourceProperty: 'tags', target: Tag, targetProperty: 'users',
                type: 'n:n',
                properties: [Property.create({ name: 'level', type: 'number' })]
            })
            db = new SQLiteDB(':memory:')
            await db.open()
            const setup = new DBSetup([User, Tag], [tagged], db)
            await setup.createTables()
            const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
            const schema: EventCompletenessSchema = { entities: ['User', 'Tag'], relations: [tagged.name!] }

            const u = await handle.create('User', { name: 'u' })
            const t1 = await handle.create('Tag', { label: 't1' })
            const t2 = await handle.create('Tag', { label: 't2' })

            await withEventCompleteness(handle, schema, '[n:n] add two links', async (events) => {
                await handle.addRelationByNameById(tagged.name!, u.id, t1.id, { level: 1 }, events)
                await handle.addRelationByNameById(tagged.name!, u.id, t2.id, { level: 2 }, events)
            })
            // 同 id + & 原地更新（数组形态是 replace 语义：只保留 t1 并改 level）
            await withEventCompleteness(handle, schema, '[n:n] replace set with same-id & change', async (events) => {
                await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { tags: [{ id: t1.id, '&': { level: 9 } }] }, events)
            })
            const links = await handle.findRelationByName(tagged.name!, undefined, undefined, ['level', ['target', { attributeQuery: ['label'] }]])
            expect(links.length).toBe(1)
            expect(links[0].level).toBe(9)

            await withEventCompleteness(handle, schema, '[n:n] delete entity cascades links', async (events) => {
                await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', u.id] }), events)
            })
        })

        test('symmetric n:n: add/remove from either side keep events complete and edges bidirectional', async () => {
            const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
            const friends = Relation.create({
                source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
                type: 'n:n',
            })
            db = new SQLiteDB(':memory:')
            await db.open()
            const setup = new DBSetup([User], [friends], db)
            await setup.createTables()
            const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
            const schema: EventCompletenessSchema = { entities: ['User'], relations: [friends.name!] }

            const a = await handle.create('User', { name: 'A' })
            const b = await handle.create('User', { name: 'B' })
            const c = await handle.create('User', { name: 'C' })

            await withEventCompleteness(handle, schema, '[symmetric] add edges', async (events) => {
                await handle.addRelationByNameById(friends.name!, a.id, b.id, {}, events)
                await handle.addRelationByNameById(friends.name!, c.id, a.id, {}, events)   // A 在 target 侧
            })
            await assertBidirectionalConsistency(handle, {
                sourceEntity: 'User', sourceProperty: 'friends',
                targetEntity: 'User', targetProperty: 'friends'
            }, '[symmetric] after adds')

            // 删除实体：source 侧与 target 侧的 link 都要消失且有事件（r7 家族的事件面回归）
            await withEventCompleteness(handle, schema, '[symmetric] delete entity with edges on both sides', async (events) => {
                await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), events)
            })
            const remaining = await handle.findRelationByName(friends.name!, undefined, undefined,
                ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
            expect(remaining.length).toBe(0)
        })
    })
})
