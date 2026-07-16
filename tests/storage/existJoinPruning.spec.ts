import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@core';
import { PGLiteDB } from '@drivers';
import { beforeEach, describe, expect, test, afterEach } from "vitest";

/**
 * B1（performance-debt-plan §五 2.1 / r12-I-5 → r20#3 → r21/r22 建议，三轮复确）：
 * EXIST 原子的终段 x:n 路径不进外层 JOIN 树。
 *
 * 机制：EXIST 谓词由相关子查询完整表达（相关条件只引用父路径别名），终段 x:n 的
 * 外层 LEFT JOIN 只贡献 fan-out 行，并让 queryTreeHasXToManyPath 保守判定触发
 * post-pagination（LIMIT/OFFSET 从 SQL 剥离 → 全量拉取 + 内存切片，r12-I-4 的放大器）。
 *
 * 判据（SQL 形状 + 语义）：
 *  1. 纯 EXIST match + limit → LIMIT 下推回 SQL（此前被剥离）；
 *  2. 纯 EXIST match 的原始行数 = 根记录数（无 fan-out 重复行）；
 *  3. 语义回归：EXIST 结果集不变（含组合条件、嵌套 EXIST、x:1 前缀路径、对照组）。
 */

// 记录 db.query 语句（perfProbe.recordDatabaseStatements 的 storage 层就地版，
// 该 helper 在 tests/runtime 下，storage spec 避免跨层依赖）
function recordQueries(db: PGLiteDB): { sql: string, params: unknown[], name: string }[] {
    const recorded: { sql: string, params: unknown[], name: string }[] = []
    const originalQuery = db.query.bind(db);
    (db as unknown as { query: typeof db.query }).query = (async (sql: string, params: unknown[] = [], name = '') => {
        recorded.push({ sql, params, name })
        return originalQuery(sql, params, name)
    }) as typeof db.query
    return recorded
}

describe('EXIST atoms skip the outer JOIN tree (B1)', () => {
    let db: PGLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle
    let statements: { sql: string, params: unknown[], name: string }[]

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
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'size', type: 'number' })
            ]
        })
        const Department = Entity.create({
            name: 'Department',
            properties: [Property.create({ name: 'deptName', type: 'string' })]
        })
        // n:n：user.teams 独立 link 表
        Relation.create({
            source: User,
            sourceProperty: 'teams',
            target: Team,
            targetProperty: 'members',
            type: 'n:n'
        })
        // n:1：user.department（x:1 前缀路径用）
        Relation.create({
            source: User,
            sourceProperty: 'department',
            target: Department,
            targetProperty: 'staff',
            type: 'n:1'
        })
        // 1:n：department.teams
        Relation.create({
            source: Department,
            sourceProperty: 'ownedTeams',
            target: Team,
            targetProperty: 'owner',
            type: '1:n'
        })

        db = new PGLiteDB()
        statements = recordQueries(db)
        await db.open()
        setup = new DBSetup([User, Team, Department], Relation.instances.filter(r =>
            [User, Team, Department].includes(r.source as never) || [User, Team, Department].includes(r.target as never)
        ), db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    })

    afterEach(async () => {
        await db.close()
        // Klass 注册表跨用例隔离
        Entity.instances.length = 0
        Relation.instances.length = 0
        Property.instances.length = 0
    })

    async function seed() {
        // 3 个 user：u1 有 3 个匹配 team（fan-out ×3），u2 有 1 个，u3 无匹配
        const u1 = await handle.create('User', { name: 'u1', age: 30, teams: [{ title: 'A-1', size: 10 }, { title: 'A-2', size: 20 }, { title: 'A-3', size: 30 }] })
        const u2 = await handle.create('User', { name: 'u2', age: 40, teams: [{ title: 'A-4', size: 15 }, { title: 'B-1', size: 5 }] })
        const u3 = await handle.create('User', { name: 'u3', age: 50, teams: [{ title: 'B-2', size: 8 }] })
        return { u1, u2, u3 }
    }

    test('pure EXIST match + limit: LIMIT pushed down, no fan-out rows, correct paging', async () => {
        await seed()
        statements.length = 0

        const page = await handle.find('User',
            MatchExp.atom({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'title', value: ['like', 'A-%'] })] }),
            { limit: 2, orderBy: { name: 'ASC' } },
            ['name']
        )
        expect(page.map(u => u.name)).toEqual(['u1', 'u2'])

        const rootSelect = statements.find(statement => statement.sql.includes('EXISTS'))
        expect(rootSelect, 'root query must use an EXISTS subquery').toBeTruthy()
        // LIMIT 下推：post-pagination 此前会把 LIMIT 从 SQL 剥离
        expect(rootSelect!.sql, `LIMIT must be pushed down to SQL:\n${rootSelect!.sql}`).toMatch(/LIMIT\s+2/i)
        // 终段 x:n 不在外层 JOIN 树：外层没有 teams 关系/实体表的 LEFT JOIN
        const outerSQL = rootSelect!.sql.slice(0, rootSelect!.sql.indexOf('EXISTS'))
        expect(outerSQL, `outer FROM/JOIN must not join the x:n path:\n${outerSQL}`).not.toMatch(/JOIN/i)
    })

    test('pure EXIST match without limit: raw row count equals root count (no fan-out)', async () => {
        await seed()
        statements.length = 0

        const result = await handle.find('User',
            MatchExp.atom({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'title', value: ['like', 'A-%'] })] }),
            undefined,
            ['name', 'age']
        )
        expect(result.map(u => u.name).sort()).toEqual(['u1', 'u2'])

        // 语义等价性的结构证据：u1 有 3 个匹配 team，旧实现外层 JOIN 会产生 3 条原始行。
        // 这里直接跑同一条 SQL 验证原始行数 = 根记录数。
        const rootSelect = statements.find(statement => statement.sql.includes('EXISTS'))!
        const rawRows = await db.query(rootSelect.sql, rootSelect.params, 'raw recheck')
        expect(rawRows.length, 'raw rows must equal root records (no fan-out)').toBe(2)
    })

    test('EXIST combined with plain field condition on the root', async () => {
        await seed()
        const result = await handle.find('User',
            MatchExp.atom({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'title', value: ['like', 'A-%'] })] })
                .and({ key: 'age', value: ['>', 35] }),
            undefined,
            ['name']
        )
        expect(result.map(u => u.name)).toEqual(['u2'])
    })

    test('EXIST behind an x:1 prefix keeps the prefix join (department.ownedTeams exist)', async () => {
        const d1 = await handle.create('Department', { deptName: 'D1', ownedTeams: [{ title: 'A-9', size: 3 }] })
        const d2 = await handle.create('Department', { deptName: 'D2', ownedTeams: [{ title: 'B-9', size: 4 }] })
        await handle.create('User', { name: 'du1', age: 20, department: { id: d1.id } })
        await handle.create('User', { name: 'du2', age: 21, department: { id: d2.id } })
        statements.length = 0

        const result = await handle.find('User',
            MatchExp.atom({ key: 'department.ownedTeams', value: ['exist', MatchExp.atom({ key: 'title', value: ['like', 'A-%'] })] }),
            undefined,
            ['name']
        )
        expect(result.map(u => u.name)).toEqual(['du1'])
        // x:1 前缀（department）必须仍在外层 JOIN 树（EXISTS 相关条件引用它的别名）
        const rootSelect = statements.find(statement => statement.sql.includes('EXISTS'))!
        const outerSQL = rootSelect.sql.slice(0, rootSelect.sql.indexOf('EXISTS'))
        expect(outerSQL).toMatch(/JOIN/i)
        expect(outerSQL).toContain('Department')
    })

    test('nested EXIST via x:1 field path inside the payload stays correct', async () => {
        const d1 = await handle.create('Department', { deptName: 'HQ' })
        await handle.create('User', {
            name: 'n1', age: 30,
            teams: [{ title: 'T-1', size: 10, owner: { id: d1.id } }]
        })
        await handle.create('User', {
            name: 'n2', age: 30,
            teams: [{ title: 'T-2', size: 10 }]
        })

        // EXIST 载荷内经 x:1 路径下钻（owner.deptName）——载荷内部的 JOIN 树构建路径
        const result = await handle.find('User',
            MatchExp.atom({
                key: 'teams',
                value: ['exist', MatchExp.atom({ key: 'owner.deptName', value: ['=', 'HQ'] })]
            }),
            undefined,
            ['name']
        )
        expect(result.map(u => u.name)).toEqual(['n1'])

        // 嵌套 EXIST（x:n 内再 x:n/x:1 的 exist）在基线实现上就不工作（记录为既有缺口，
        // 与本收口无关）：见 r25#7 深嵌 EXIST 家族的记录项。此处不断言。
    })

    test('control: direct x:n path match still uses join + post-pagination semantics', async () => {
        await seed()
        statements.length = 0

        // 直接 x:n 路径 match（非 EXIST）——外层 JOIN + LIMIT 剥离（post-pagination）语义保留
        const page = await handle.find('User',
            MatchExp.atom({ key: 'teams.title', value: ['like', 'A-%'] }),
            { limit: 2, orderBy: { name: 'ASC' } },
            ['name']
        )
        expect(page.map(u => u.name)).toEqual(['u1', 'u2'])
        const rootSelect = statements.find(statement => statement.sql.trimStart().startsWith('SELECT') && statement.sql.includes('JOIN'))!
        expect(rootSelect.sql, 'direct x:n match keeps join fan-out and strips LIMIT for post-pagination').not.toMatch(/LIMIT/i)
    })

    test('offset-only EXIST paging works and pushes OFFSET down', async () => {
        await seed()
        statements.length = 0
        const rest = await handle.find('User',
            MatchExp.atom({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'title', value: ['like', 'A-%'] })] }),
            { offset: 1, orderBy: { name: 'ASC' } },
            ['name']
        )
        expect(rest.map(u => u.name)).toEqual(['u2'])
        const rootSelect = statements.find(statement => statement.sql.includes('EXISTS'))!
        expect(rootSelect.sql).toMatch(/OFFSET/i)
    })
})
