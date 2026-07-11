/**
 * r17 deep-review reproductions — storage layer
 * (agentspace/output/deep-review-2026-07-11-r17.md)
 *
 * Committed as failing-by-design (`test.fails`) reproductions, following the
 * repo convention (see review-repro-computations.spec.ts). Each test asserts
 * the CORRECT behavior and currently fails because of the bug it documents.
 * When a bug is fixed, flip its test from `test.fails` to `test` so it becomes
 * a permanent regression guard.
 *
 * - F-1: x:1 relation whose link is merged into the host row (default merge
 *   strategy for 1:1 / n:1) does not clear the previous owner's FK column when
 *   an already-owned target is assigned by ref. Both create and update leave
 *   TWO rows pointing at the same target — the 1:1 invariant is silently
 *   violated (candidate-1a / candidate-1b).
 * - F-2: updating with the SAME related id but changed '&' link attributes
 *   writes the link columns but emits ZERO mutation events, so reactive
 *   computations depending on link properties go permanently stale
 *   (candidate-2; runtime-level consequence in tests/runtime/review-repro-r17.spec.ts).
 * - F-3(storage face): a match path containing TWO symmetric n:n segments
 *   (friends.friends.&.id) only expands the first segment into source/target
 *   variants; hosts reachable through the second segment's other side are
 *   silently missing from the result (candidate storage-iso).
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

    test.fails('CREATE with an already-owned 1:1 target must steal it (single-owner invariant)', async () => {
        const p = await handle.create('Profile', { title: 'P' })
        await handle.create('User', { name: 'u1', profile: { id: p.id } })
        const u2 = await handle.create('User', { name: 'u2', profile: { id: p.id } })

        // 不变量：一个 Profile 只能有一个 owner。
        // 现状：u1 行的 FK 列未被清除，两行同时指向 p（owners.length === 2）。
        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p.id] }), undefined, ['name'])
        expect(owners.length).toBe(1)
        expect(owners[0].id).toBe(u2.id)

        const pRow = await handle.findOne('Profile', MatchExp.atom({ key: 'id', value: ['=', p.id] }), undefined, ['title', ['owner', { attributeQuery: ['name'] }]])
        expect(pRow.owner?.id).toBe(u2.id)
    })

    test.fails('UPDATE with an already-owned 1:1 target must steal it (single-owner invariant)', async () => {
        const p = await handle.create('Profile', { title: 'P' })
        await handle.create('User', { name: 'u1', profile: { id: p.id } })
        const u2 = await handle.create('User', { name: 'u2' })

        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), { profile: { id: p.id } })

        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', p.id] }), undefined, ['name'])
        expect(owners.length).toBe(1)
        expect(owners[0].id).toBe(u2.id)
    })

    test.fails('F-2: same related id + changed & data must emit a link mutation event', async () => {
        const p = await handle.create('Profile', { title: 'P' })
        const u1 = await handle.create('User', { name: 'u1', profile: { id: p.id, '&': { viewed: 1 } } })

        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), { profile: { id: p.id, '&': { viewed: 99 } } }, events)

        // 数据已写入（link 列 viewed=99）……
        const relRows = await handle.findRelationByName('User_profile_owner_Profile', undefined, undefined, ['viewed'])
        expect(relRows[0]?.viewed).toBe(99)

        // ……但 events 为空：依赖 link 属性的下游计算收不到任何触发（永久陈旧）。
        const linkEvents = events.filter(e => e.recordName === 'User_profile_owner_Profile')
        expect(linkEvents.length).toBeGreaterThan(0)
    })
})

describe('r17 F-3 (storage face): two symmetric segments in one match path', () => {
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

    test.fails('match on friends.friends.&.id must reach hosts through both sides of BOTH hops', async () => {
        const a = await handle.create('User', { name: 'A' })
        const b = await handle.create('User', { name: 'B' })
        const link = await handle.addRelationByNameById(relationName, a.id, b.id, {})

        // 1 跳：spawnManyToManySymmetricPath 展开第一段对称，两端都命中（健康）。
        const oneHop = await handle.find('User', MatchExp.atom({ key: 'friends.&.id', value: ['=', link.id] }), undefined, ['name'])
        expect(oneHop.map(r => r.name).sort()).toEqual(['A', 'B'])

        // 2 跳：A→B→link 与 B→A→link 都应命中；
        // 现状：findManyToManySymmetricPath 在第一段对称处 break，第二段不展开 → 只返回 ['A']。
        // Scheduler.computeDirtyDataDepRecords 的 create 分支正是用这个查询定位脏宿主，
        // 与 delete 分支（slice(0,-1) + IN [source,target]）的宿主集不对称 → 增量计数负数崩溃
        // （见 tests/runtime/review-repro-r17.spec.ts F-3 runtime face）。
        const twoHop = await handle.find('User', MatchExp.atom({ key: 'friends.friends.&.id', value: ['=', link.id] }), undefined, ['name'])
        expect(twoHop.map(r => r.name).sort()).toEqual(['A', 'B'])
    })
})
