import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle, QueryExecutor } from "@storage";
import { Entity, Property, Relation } from '@core';
import { PGLiteDB, SQLiteDB } from '@drivers';
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * B2/B4（performance-debt-plan §五 2.2 / r12-I-4、full-codebase-review F-4 终局方向）：
 * fan-out match × 分页的两段式根查询。
 *
 * 第一段：SELECT DISTINCT 根 id + 排序键（orderBy 已被限制为 x:1 路径 → 排序键对每根恒定，
 * 每根恰好一个 DISTINCT 行），LIMIT/OFFSET 在数据库端作用于根记录粒度；
 * 第二段：主查询 match 替换为 id IN (页 id 集合)——fan-out JOIN 树整个消失。
 *
 * 覆盖矩阵：页窗口滑动 × 排序（根字段 / x:1 路径字段 / 无排序）× 驱动（PGLite/SQLite）
 * × 回退面（offset-only 无 limit、超阈值 limit）× findOne 热路径 × LIMIT 0 退化格。
 */

const DRIVERS = [
    { name: 'PGLiteDB', create: () => new PGLiteDB() },
    { name: 'SQLiteDB', create: () => new SQLiteDB() },
] as const

describe.each(DRIVERS)('two-phase pagination over fan-out matches ($name)', ({ create }) => {
    let db: PGLiteDB | SQLiteDB
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' })
            ]
        })
        const Team = Entity.create({
            name: 'Team',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const Leader = Entity.create({
            name: 'Leader',
            properties: [Property.create({ name: 'rank', type: 'number' })]
        })
        Relation.create({
            source: User, sourceProperty: 'teams',
            target: Team, targetProperty: 'members',
            type: 'n:n'
        })
        Relation.create({
            source: User, sourceProperty: 'leader',
            target: Leader, targetProperty: 'staff',
            type: 'n:1'
        })

        db = create()
        await db.open()
        const localEntities = [User, Team, Leader]
        const localRelations = Relation.instances.filter(r =>
            localEntities.includes(r.source as never) && localEntities.includes(r.target as never)
        )
        const setup = new DBSetup(localEntities, localRelations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
        Entity.instances.length = 0
        Relation.instances.length = 0
        Property.instances.length = 0
    })

    /** 5 个 user 全部命中 match（每人 2~3 个 A-前缀 team，fan-out 不均匀），2 个不命中 */
    async function seedPaging() {
        const leaders = [
            await handle.create('Leader', { rank: 3 }),
            await handle.create('Leader', { rank: 1 }),
        ]
        const mk = (i: number, teams: string[], leaderIndex: number) =>
            handle.create('User', {
                name: `u${i}`, age: 20 + i,
                teams: teams.map(title => ({ title })),
                leader: { id: leaders[leaderIndex].id }
            })
        await mk(1, ['A-1', 'A-2', 'A-3'], 0)
        await mk(2, ['A-4', 'A-5'], 1)
        await mk(3, ['A-6', 'A-7', 'A-8'], 0)
        await mk(4, ['A-9', 'A-10'], 1)
        await mk(5, ['A-11', 'A-12', 'A-13'], 0)
        await mk(6, ['B-1'], 0)
        await mk(7, ['B-2'], 1)
    }

    const fanOutMatch = () => MatchExp.atom({ key: 'teams.title', value: ['like', 'A-%'] })

    test('sliding limit/offset windows return exact root pages (root-field ordering)', async () => {
        await seedPaging()
        const window1 = await handle.find('User', fanOutMatch(), { limit: 2, orderBy: { name: 'ASC' } }, ['name'])
        expect(window1.map(u => u.name)).toEqual(['u1', 'u2'])

        const window2 = await handle.find('User', fanOutMatch(), { limit: 2, offset: 2, orderBy: { name: 'ASC' } }, ['name'])
        expect(window2.map(u => u.name)).toEqual(['u3', 'u4'])

        const window3 = await handle.find('User', fanOutMatch(), { limit: 2, offset: 4, orderBy: { name: 'ASC' } }, ['name'])
        expect(window3.map(u => u.name)).toEqual(['u5'])

        const beyond = await handle.find('User', fanOutMatch(), { limit: 2, offset: 5, orderBy: { name: 'ASC' } }, ['name'])
        expect(beyond).toHaveLength(0)
    })

    test('ordering by an x:1 path field pages correctly (order key constant per root)', async () => {
        await seedPaging()
        // leader.rank：u1/u3/u5 → 3，u2/u4 → 1；次序键相同的组内以 name 二级排序保证确定性
        const page = await handle.find('User', fanOutMatch(),
            { limit: 3, orderBy: { 'leader.rank': 'ASC', name: 'ASC' } }, ['name'])
        expect(page.map(u => u.name)).toEqual(['u2', 'u4', 'u1'])

        const rest = await handle.find('User', fanOutMatch(),
            { limit: 3, offset: 3, orderBy: { 'leader.rank': 'ASC', name: 'ASC' } }, ['name'])
        expect(rest.map(u => u.name)).toEqual(['u3', 'u5'])
    })

    test('DESC ordering and full-page equivalence with the unpaginated result', async () => {
        await seedPaging()
        const all = await handle.find('User', fanOutMatch(), { orderBy: { name: 'DESC' } }, ['name'])
        const paged: string[] = []
        for (let offset = 0; offset < 5; offset += 2) {
            const window = await handle.find('User', fanOutMatch(), { limit: 2, offset, orderBy: { name: 'DESC' } }, ['name'])
            paged.push(...window.map(u => u.name))
        }
        expect(paged).toEqual(all.map(u => u.name))
    })

    test('limit without orderBy returns the right number of distinct roots', async () => {
        await seedPaging()
        const page = await handle.find('User', fanOutMatch(), { limit: 4 }, ['name'])
        expect(page).toHaveLength(4)
        // 无排序时页成员任意，但必须是命中 match 的不同根记录
        const names = new Set(page.map(u => u.name))
        expect(names.size).toBe(4)
        for (const name of names) expect(['u1', 'u2', 'u3', 'u4', 'u5']).toContain(name)
    })

    test('LIMIT 0 returns empty set', async () => {
        await seedPaging()
        const page = await handle.find('User', fanOutMatch(), { limit: 0, orderBy: { name: 'ASC' } }, ['name'])
        expect(page).toHaveLength(0)
    })

    test('offset-only (unbounded page) falls back to post-pagination and stays correct', async () => {
        await seedPaging()
        const rest = await handle.find('User', fanOutMatch(), { offset: 2, orderBy: { name: 'ASC' } }, ['name'])
        expect(rest.map(u => u.name)).toEqual(['u3', 'u4', 'u5'])
    })

    test('limit above PAGED_ROOT_ID_MAX_LIMIT falls back to post-pagination and stays correct', async () => {
        await seedPaging()
        const saved = QueryExecutor.PAGED_ROOT_ID_MAX_LIMIT
        QueryExecutor.PAGED_ROOT_ID_MAX_LIMIT = 1
        try {
            const window = await handle.find('User', fanOutMatch(), { limit: 2, offset: 2, orderBy: { name: 'ASC' } }, ['name'])
            expect(window.map(u => u.name)).toEqual(['u3', 'u4'])
        } finally {
            QueryExecutor.PAGED_ROOT_ID_MAX_LIMIT = saved
        }
    })

    test('findOne over a fan-out match keeps the single-SQL hot path and picks the first root', async () => {
        await seedPaging()
        const first = await handle.findOne('User', fanOutMatch(), { orderBy: { name: 'ASC' } }, ['name'])
        expect(first.name).toBe('u1')
    })

    test('paged reads still load x:n attribute data for exactly the page', async () => {
        await seedPaging()
        const page = await handle.find('User', fanOutMatch(),
            { limit: 2, orderBy: { name: 'ASC' } },
            ['name', ['teams', { attributeQuery: ['title'] }]])
        expect(page.map(u => u.name)).toEqual(['u1', 'u2'])
        expect((page[0].teams as { title: string }[]).map(t => t.title).sort()).toEqual(['A-1', 'A-2', 'A-3'])
        expect((page[1].teams as { title: string }[]).map(t => t.title).sort()).toEqual(['A-4', 'A-5'])
    })

    test('pagination without fan-out still pushes LIMIT down directly (no two-phase)', async () => {
        await seedPaging()
        const page = await handle.find('User',
            MatchExp.atom({ key: 'age', value: ['>', 20] }),
            { limit: 3, orderBy: { name: 'ASC' } }, ['name'])
        expect(page.map(u => u.name)).toEqual(['u1', 'u2', 'u3'])
    })
})
