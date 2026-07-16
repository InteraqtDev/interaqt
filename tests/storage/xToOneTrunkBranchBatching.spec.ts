import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@core';
import { PGLiteDB } from '@drivers';
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * B5（performance-debt-plan §五 2.3 / full-codebase-review I-9 残余）：
 * x:1 主干上的 x:n 枝干补全（completeXToOneLeftoverRecords 第 2 步）按父 id 集合批量。
 *
 * 判据：SQL 语句数——N 个根记录经 1:1 主干读 x:n 枝干时，枝干查询次数为 O(1)（批量）
 * 而非 O(N)（逐父）；值与逐条语义完全一致（含 & 关系数据、alias 挂载）。
 * 边界（保持逐条，登记）：n:1 共享目标（对象别名泄漏风险）、label/goto 递归、
 * per-parent limit/offset、n:n/对称反向。
 */

function recordQueries(db: PGLiteDB): { sql: string, name: string }[] {
    const recorded: { sql: string, name: string }[] = []
    const originalQuery = db.query.bind(db);
    (db as unknown as { query: typeof db.query }).query = (async (sql: string, params: unknown[] = [], name = '') => {
        recorded.push({ sql, name })
        return originalQuery(sql, params, name)
    }) as typeof db.query
    return recorded
}

describe('x:1 trunk branch batching (B5)', () => {
    let db: PGLiteDB
    let handle: EntityQueryHandle
    let statements: { sql: string, name: string }[]

    beforeEach(async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'bio', type: 'string' })]
        })
        const Badge = Entity.create({
            name: 'Badge',
            properties: [Property.create({ name: 'label', type: 'string' })]
        })
        const Department = Entity.create({
            name: 'Department',
            properties: [Property.create({ name: 'deptName', type: 'string' })]
        })
        const Team = Entity.create({
            name: 'Team',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        // 1:1 主干（每个 user 独占 profile）
        Relation.create({
            source: User, sourceProperty: 'profile',
            target: Profile, targetProperty: 'owner',
            type: '1:1'
        })
        // 主干目标上的 1:n 枝干（带 link 属性，覆盖 & 数据挂载）
        Relation.create({
            source: Profile, sourceProperty: 'badges',
            target: Badge, targetProperty: 'profile',
            type: '1:n',
            properties: [Property.create({ name: 'pinned', type: 'string' })]
        })
        // n:1 主干（多个 user 共享 department——批量的对象别名边界，保持逐条）
        Relation.create({
            source: User, sourceProperty: 'department',
            target: Department, targetProperty: 'staff',
            type: 'n:1'
        })
        Relation.create({
            source: Department, sourceProperty: 'teams',
            target: Team, targetProperty: 'dept',
            type: '1:n'
        })

        db = new PGLiteDB()
        statements = recordQueries(db)
        await db.open()
        const entities = [User, Profile, Badge, Department, Team]
        const relations = Relation.instances.filter(r =>
            entities.includes(r.source as never) && entities.includes(r.target as never))
        const setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
        Entity.instances.length = 0
        Relation.instances.length = 0
        Property.instances.length = 0
    })

    test('1:1 trunk: badge branches load in O(1) queries with identical values and & data', async () => {
        const USERS = 5
        for (let i = 0; i < USERS; i++) {
            await handle.create('User', {
                name: `u${i}`,
                profile: {
                    bio: `bio-${i}`,
                    badges: [
                        { label: `b${i}-1`, '&': { pinned: 'yes' } },
                        { label: `b${i}-2`, '&': { pinned: 'no' } }
                    ]
                }
            })
        }
        statements.length = 0

        const result = await handle.find('User', undefined, undefined,
            ['name', ['profile', {
                attributeQuery: ['bio', ['badges', { attributeQuery: ['label', ['&', { attributeQuery: ['pinned'] }]] }]]
            }]])

        // 值语义与逐条路径一致
        expect(result).toHaveLength(USERS)
        for (const user of result) {
            const index = (user.name as string).slice(1)
            const profile = user.profile as { bio: string, badges: { label: string, ['&']?: { pinned?: string } }[] }
            expect(profile.bio).toBe(`bio-${index}`)
            expect(profile.badges.map(b => b.label).sort()).toEqual([`b${index}-1`, `b${index}-2`])
            const pinnedOf = Object.fromEntries(profile.badges.map(b => [b.label, b['&']?.pinned]))
            expect(pinnedOf[`b${index}-1`]).toBe('yes')
            expect(pinnedOf[`b${index}-2`]).toBe('no')
        }

        // SQL 形状：badges 枝干为批量查询（IN 分组），不随根记录数线性增长
        const badgeQueries = statements.filter(statement => statement.sql.includes('"Badge"'))
        expect(badgeQueries.length, `expected O(1) batched badge queries, got:\n${badgeQueries.map(s => s.name).join('\n')}`).toBe(1)
        expect(badgeQueries[0].name).toContain('batch')
    })

    test('n:1 shared trunk target keeps per-record loading (object aliasing boundary) with correct values', async () => {
        const dept = await handle.create('Department', {
            deptName: 'D1',
            teams: [{ title: 'T1' }, { title: 'T2' }]
        })
        await handle.create('User', { name: 's1', department: { id: dept.id } })
        await handle.create('User', { name: 's2', department: { id: dept.id } })
        statements.length = 0

        const result = await handle.find('User',
            MatchExp.atom({ key: 'name', value: ['in', ['s1', 's2']] }),
            undefined,
            ['name', ['department', { attributeQuery: ['deptName', ['teams', { attributeQuery: ['title'] }]] }]])

        expect(result).toHaveLength(2)
        for (const user of result) {
            const department = user.department as { deptName: string, teams: { title: string }[] }
            expect(department.deptName).toBe('D1')
            expect(department.teams.map(t => t.title).sort()).toEqual(['T1', 'T2'])
        }
        // 共享目标：每个根记录的 department 是独立对象（无别名泄漏）
        expect(result[0].department).not.toBe(result[1].department)
        ;(result[0].department as { deptName: string }).deptName = 'MUTATED'
        expect((result[1].department as { deptName: string }).deptName).toBe('D1')
    })

    test('single root record keeps the per-record path (no batching overhead)', async () => {
        await handle.create('User', {
            name: 'solo',
            profile: { bio: 'solo-bio', badges: [{ label: 'only' }] }
        })
        const result = await handle.find('User',
            MatchExp.atom({ key: 'name', value: ['=', 'solo'] }),
            undefined,
            ['name', ['profile', { attributeQuery: ['bio', ['badges', { attributeQuery: ['label'] }]] }]])
        expect(result).toHaveLength(1)
        const profile = result[0].profile as { badges: { label: string }[] }
        expect(profile.badges.map(b => b.label)).toEqual(['only'])
    })

    test('roots with null trunk are skipped and others still batch', async () => {
        await handle.create('User', { name: 'p1', profile: { bio: 'x', badges: [{ label: 'p1-b' }] } })
        await handle.create('User', { name: 'p2', profile: { bio: 'y', badges: [{ label: 'p2-b' }] } })
        await handle.create('User', { name: 'noprofile' })

        const result = await handle.find('User', undefined, undefined,
            ['name', ['profile', { attributeQuery: ['bio', ['badges', { attributeQuery: ['label'] }]] }]])
        const byName = Object.fromEntries(result.map(u => [u.name as string, u]))
        expect((byName['p1'].profile as { badges: { label: string }[] }).badges.map(b => b.label)).toEqual(['p1-b'])
        expect((byName['p2'].profile as { badges: { label: string }[] }).badges.map(b => b.label)).toEqual(['p2-b'])
        expect(byName['noprofile'].profile ?? null).toBeNull()
    })
})
