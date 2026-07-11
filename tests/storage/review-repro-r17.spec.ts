/**
 * r17 deep-review regressions — storage layer
 * (agentspace/output/deep-review-2026-07-11-r17.md)
 *
 * Originally committed as failing-by-design (`test.fails`) reproductions;
 * the bugs are fixed, so these now assert the correct behavior:
 *
 * - F-1: x:1 relation whose link is merged into the host row (default merge
 *   strategy for 1:1) now clears the previous owner's FK column when an
 *   already-owned target is assigned by ref (create and update both unlink
 *   the old owner and emit its link delete event — single-owner invariant).
 * - F-2: updating with the SAME related id but changed '&' link attributes
 *   now emits a link update event (keys + oldRecord), so reactive
 *   computations over link properties stay consistent
 *   (runtime face in tests/runtime/review-repro-r17.spec.ts).
 * - F-4 (storage face): a match path containing TWO symmetric n:n segments
 *   (friends.friends.&.id) now expands ALL symmetric segments as a cartesian
 *   product of source/target variants — hosts reachable through either side
 *   of BOTH hops are found.
 */
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { RecordMutationEvent } from '@runtime';
import { SQLiteDB } from '@drivers';

describe('r17 F-1: merged-link x:1 steal leaves two owners', () => {
    let db: SQLiteDB
    let handle: EntityQueryHandle

    beforeEach(async () => {
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
        db = new SQLiteDB(':memory:')
        await db.open()
        // 默认合并策略：User_profile_owner_Profile mergedTo=source（FK 列在 User 行上）
        const setup = new DBSetup([User, Profile], [own], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => { await db.close() })

    test('CREATE with an already-owned 1:1 target must steal it (single-owner invariant)', async () => {
        const p = await handle.create('Profile', { title: 'P' })
        await handle.create('User', { name: 'u1', profile: { id: p.id } })
        const u2 = await handle.create('User', { name: 'u2', profile: { id: p.id } })

        // 不变量：一个 Profile 只能有一个 owner（u1 的旧 link 被显式解除）。
        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p.id] }), undefined, ['name'])
        expect(owners.length).toBe(1)
        expect(owners[0].id).toBe(u2.id)

        const pRow = await handle.findOne('Profile', MatchExp.atom({ key: 'id', value: ['=', p.id] }), undefined, ['title', ['owner', { attributeQuery: ['name'] }]])
        expect(pRow.owner?.id).toBe(u2.id)
    })

    test('UPDATE with an already-owned 1:1 target must steal it (single-owner invariant)', async () => {
        const p = await handle.create('Profile', { title: 'P' })
        await handle.create('User', { name: 'u1', profile: { id: p.id } })
        const u2 = await handle.create('User', { name: 'u2' })

        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), { profile: { id: p.id } })

        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p.id] }), undefined, ['name'])
        expect(owners.length).toBe(1)
        expect(owners[0].id).toBe(u2.id)
    })

    test('F-2: same related id + changed & data must emit a link mutation event', async () => {
        const p = await handle.create('Profile', { title: 'P' })
        const u1 = await handle.create('User', { name: 'u1', profile: { id: p.id, '&': { viewed: 1 } } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), { profile: { id: p.id, '&': { viewed: 99 } } }, events)

        // 数据面：link 列 viewed=99
        const relRows = await handle.findRelationByName('User_profile_owner_Profile', undefined, undefined, ['viewed'])
        expect(relRows[0]?.viewed).toBe(99)

        // 事件面：同 id 原地更新必须补发 link update 事件（keys + oldRecord），
        // 否则依赖 link 属性的下游计算收不到任何触发（永久陈旧）。
        const linkEvents = events.filter(e => e.recordName === 'User_profile_owner_Profile')
        expect(linkEvents.length).toBeGreaterThan(0)
        expect(linkEvents[0].type).toBe('update')
        expect(linkEvents[0].keys).toContain('viewed')
        expect(linkEvents[0].oldRecord?.viewed).toBe(1)
    })
})

/**
 * 兄弟格扫描（r17 反思结论：修一个格子必须扫描同维度的相邻格）。
 * F-1/F-2 的修复点覆盖 merged 拓扑；这里固化 combined（三表合一）与 isolated 拓扑、
 * replace 对照组、幂等对照组的行为，防止「修一个拓扑、漏其余拓扑」的历史模式复发。
 */
describe('r17 sibling sweep: same-id in-place update & steal across topologies', () => {
    let db: SQLiteDB
    afterEach(async () => { await db.close() })

    function createSchema() {
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
        return { entities: [User, Profile], relations: [own] }
    }

    async function bootstrapHandle(mergeLinks?: string[]) {
        const { entities, relations } = createSchema()
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup(entities, relations, db, mergeLinks)
        await setup.createTables()
        return new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    }

    test('combined topology: same-id nested value + & update writes data and emits update events', async () => {
        const handle = await bootstrapHandle(['User.profile'])
        const u = await handle.create('User', { name: 'u1', profile: { title: 'old', '&': { viewed: 1 } } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u.id] }),
            { profile: { id: u.profile.id, title: 'new', '&': { viewed: 99 } } }, events)

        // 数据面：嵌套值与 & 数据都要写入（此前 flashOut 把旧值 merge 回来，新值被静默覆盖）。
        const after = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u.id] }), undefined,
            ['name', ['profile', { attributeQuery: ['title'] }]])
        expect(after.profile?.title).toBe('new')
        const linkRows = await handle.findRelationByName('User_profile_owner_Profile', undefined, undefined, ['viewed'])
        expect(linkRows[0]?.viewed).toBe(99)

        // 事件面：combined 记录的嵌套值更新 + link 的 & 更新都要有事件。
        const profileEvents = events.filter(e => e.recordName === 'Profile' && e.type === 'update')
        expect(profileEvents.length).toBe(1)
        expect(profileEvents[0].keys).toContain('title')
        const linkEvents = events.filter(e => e.recordName === 'User_profile_owner_Profile' && e.type === 'update')
        expect(linkEvents.length).toBe(1)
        expect(linkEvents[0].keys).toContain('viewed')
    })

    test('combined topology: different-id steal still relocates with events (control)', async () => {
        const handle = await bootstrapHandle(['User.profile'])
        const u1 = await handle.create('User', { name: 'u1', profile: { title: 'p1' } })
        const u2 = await handle.create('User', { name: 'u2', profile: { title: 'p2' } })
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), { profile: { id: u1.profile.id } })
        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', u1.profile.id] }), undefined, ['name'])
        expect(owners.length).toBe(1)
        expect(owners[0].name).toBe('u2')
    })

    test('merged topology: steal from the attribute side (update Profile.owner) when target already owned', async () => {
        const handle = await bootstrapHandle()
        const p = await handle.create('Profile', { title: 'P' })
        await handle.create('User', { name: 'u1', profile: { id: p.id } })
        const u2 = await handle.create('User', { name: 'u2' })

        // 从 Profile（attribute 方向）把 owner 改成 u2 —— addLinkFromRecord → addLink 路径。
        await handle.update('Profile', MatchExp.atom({ key: 'id', value: ['=', p.id] }), { owner: { id: u2.id } })

        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p.id] }), undefined, ['name'])
        expect(owners.length).toBe(1)
        expect(owners[0].id).toBe(u2.id)
    })

    test('merged topology: replace (different id) still works with delete+create events (control)', async () => {
        const handle = await bootstrapHandle()
        const p1 = await handle.create('Profile', { title: 'p1' })
        const p2 = await handle.create('Profile', { title: 'p2' })
        const u1 = await handle.create('User', { name: 'u1', profile: { id: p1.id, '&': { viewed: 1 } } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), { profile: { id: p2.id, '&': { viewed: 5 } } }, events)

        const u1After = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined, ['name', ['profile', { attributeQuery: ['title'] }]])
        expect(u1After.profile?.id).toBe(p2.id)
        // replace 语义是 delete+create，不应出现 update 事件。
        const updateEvents = events.filter(e => e.recordName === 'User_profile_owner_Profile' && e.type === 'update')
        expect(updateEvents.length).toBe(0)
        const deleteEvents = events.filter(e => e.recordName === 'User_profile_owner_Profile' && e.type === 'delete')
        expect(deleteEvents.length).toBe(1)
        // & 属性要写入新 link（r5-F-3 已修，此处防回归）。
        const linkRows = await handle.findRelationByName('User_profile_owner_Profile', undefined, undefined, ['viewed'])
        expect(linkRows[0]?.viewed).toBe(5)
    })

    test('merged topology: idempotent same-id rewrite WITHOUT & data emits nothing and keeps link data', async () => {
        const handle = await bootstrapHandle()
        const p = await handle.create('Profile', { title: 'P' })
        const u1 = await handle.create('User', { name: 'u1', profile: { id: p.id, '&': { viewed: 1 } } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), { profile: { id: p.id } }, events)
        expect(events.length).toBe(0)
        const relRows = await handle.findRelationByName('User_profile_owner_Profile', undefined, undefined, ['viewed'])
        expect(relRows[0]?.viewed).toBe(1)
    })

    test('n:1 default topology: assigning a target owned by another source must NOT unlink it (many sources per target)', async () => {
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

        const t = await handle.create('Team', { tname: 'T' })
        await handle.create('User', { name: 'u1', team: { id: t.id } })
        await handle.create('User', { name: 'u2', team: { id: t.id } })

        // n:1 的 target 侧不是排他的：两个 User 同队完全合法。
        const members = await handle.find('User', MatchExp.atom({ key: 'team.id', value: ['=', t.id] }), undefined, ['name'])
        expect(members.map(m => m.name).sort()).toEqual(['u1', 'u2'])
    })
})

describe('r17 F-4 (storage face): two symmetric segments in one match path', () => {
    let db: SQLiteDB
    let handle: EntityQueryHandle
    let relationName: string

    beforeEach(async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            type: 'n:n',
        })
        relationName = friends.name!
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([User], [friends], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => { await db.close() })

    test('match on friends.friends.&.id must reach hosts through both sides of BOTH hops', async () => {
        const a = await handle.create('User', { name: 'A' })
        const b = await handle.create('User', { name: 'B' })
        const link = await handle.addRelationByNameById(relationName, a.id, b.id, {})

        // 1 跳：第一段对称展开，两端都命中。
        const oneHop = await handle.find('User', MatchExp.atom({ key: 'friends.&.id', value: ['=', link.id] }), undefined, ['name'])
        expect(oneHop.map(r => r.name).sort()).toEqual(['A', 'B'])

        // 2 跳：A→B→link 与 B→A→link 都必须命中——spawnManyToManySymmetricPath 展开
        // 全部对称段的笛卡尔积（2 段 → 4 条变体）。Scheduler.computeDirtyDataDepRecords 的
        // create 分支用同一查询定位脏宿主，与 delete 分支（slice(0,-1) + IN [source,target]）
        // 的宿主集必须对称。
        const twoHop = await handle.find('User', MatchExp.atom({ key: 'friends.friends.&.id', value: ['=', link.id] }), undefined, ['name'])
        expect(twoHop.map(r => r.name).sort()).toEqual(['A', 'B'])
    })
})
