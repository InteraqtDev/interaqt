import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Entity, Property, Relation, MatchExp, KlassByName } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';

/**
 * r36 记录项收口轮的缺陷回归：
 *
 * 1. 深嵌 EXISTS 的子查询前缀链超过 PostgreSQL 63 字节标识符上限（r35 报告 §六登记的
 *    诚实边界，本轮探针定谳为真实缺陷）：前缀链 = 外层前缀 + 路径别名逐层串联，长实体名
 *    三层嵌套即可越限。PG 对超长标识符**静默截断**——内层 FROM 别名的截断形恰好等于
 *    外层别名时（前缀链的前缀性质使这必然发生），内层作用域遮蔽外层，关联引用解析到
 *    错误的表（"column ... does not exist"）。收口：AliasManager.registerSubqueryPrefix
 *    把子查询前缀一律 token 化（Q<n>），registerTablePath 为前缀让出长度预算。
 *
 * 2. global 目标的 json compareAndSet 走单语句 `COALESCE("jsonValue",?)=?`（r25 修了
 *    record 目标的同族缺陷，global 是漏掉的兄弟格）：PG 系直接抛 "operator does not
 *    exist: json = unknown"；SQLite 按存储文本比较，而写路径是非规范 JSON.stringify——
 *    键序不同的语义相等对象恒不相等（静默 false，与并发竞争失败不可区分）。收口：
 *    json 列走「锁定读 → 规范形比较 → 条件写」事务路径（与 record 目标同一实现形态）。
 */

describe('r36: deeply nested EXISTS with long identifiers stays under the 63-byte limit', () => {
    test.each([['pglite'], ['sqlite']] as const)('3-level nested exist over long entity names (%s)', async (dbKind) => {
        const suffix = dbKind === 'pglite' ? 'Pg' : 'Sq'
        const Organization = Entity.create({ name: `OrganizationLongName${suffix}`, properties: [Property.create({ name: 'organizationTitle', type: 'string' })] })
        const DepartmentGroup = Entity.create({ name: `DepartmentGroupLongName${suffix}`, properties: [Property.create({ name: 'departmentLabel', type: 'string' })] })
        const WorkingTeam = Entity.create({ name: `WorkingTeamLongName${suffix}`, properties: [Property.create({ name: 'teamLabel', type: 'string' })] })
        const TeamMember = Entity.create({ name: `TeamMemberLongName${suffix}`, properties: [Property.create({ name: 'memberRole', type: 'string' })] })
        Relation.create({ source: Organization, sourceProperty: 'departmentGroups', target: DepartmentGroup, targetProperty: 'organization', type: '1:n' })
        Relation.create({ source: DepartmentGroup, sourceProperty: 'workingTeams', target: WorkingTeam, targetProperty: 'departmentGroup', type: '1:n' })
        Relation.create({ source: WorkingTeam, sourceProperty: 'teamMembers', target: TeamMember, targetProperty: 'workingTeam', type: '1:n' })

        const db = dbKind === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
        const statements: string[] = []
        const originalQuery = db.query.bind(db);
        (db as unknown as { query: typeof db.query }).query = (async (sql: string, params: unknown[] = [], name = '') => {
            statements.push(sql)
            return originalQuery(sql, params, name)
        }) as typeof db.query

        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({
            system, entities: [Organization, DepartmentGroup, WorkingTeam, TeamMember],
            relations: Relation.instances.filter(r => (r.source as { name?: string }).name?.endsWith(`LongName${suffix}`)),
            eventSources: []
        })
        await controller.setup(true)
        await system.storage.create(`OrganizationLongName${suffix}`, {
            organizationTitle: 'orgA',
            departmentGroups: [{
                departmentLabel: 'D1',
                workingTeams: [{ teamLabel: 'T1', teamMembers: [{ memberRole: 'admin' }] }]
            }]
        })
        await system.storage.create(`OrganizationLongName${suffix}`, {
            organizationTitle: 'orgB',
            departmentGroups: [{
                departmentLabel: 'D2',
                workingTeams: [{ teamLabel: 'T2', teamMembers: [{ memberRole: 'user' }] }]
            }]
        })

        statements.length = 0
        const nested = MatchExp.atom({
            key: 'departmentGroups',
            value: ['exist', MatchExp.atom({
                key: 'workingTeams',
                value: ['exist', MatchExp.atom({
                    key: 'teamMembers',
                    value: ['exist', { key: 'memberRole', value: ['=', 'admin'] }]
                })]
            })]
        })
        // 修复前：level-2 子查询 FROM 别名 98 字节，PG 截断到 63 后恰好等于 level-1 别名
        //  （前缀链的前缀性质），内层作用域遮蔽外层 → "column ... does not exist"。
        const positive = await system.storage.find(`OrganizationLongName${suffix}`, nested, undefined, ['organizationTitle'])
        expect([...new Set(positive.map(o => o.organizationTitle))].sort()).toEqual(['orgA'])
        const negated = await system.storage.find(`OrganizationLongName${suffix}`,
            MatchExp.atom({
                key: 'departmentGroups',
                value: ['exist', MatchExp.atom({
                    key: 'workingTeams',
                    value: ['exist', MatchExp.atom({
                        key: 'teamMembers',
                        value: ['exist', { key: 'memberRole', value: ['=', 'admin'] }]
                    })]
                })]
            }).not(),
            undefined, ['organizationTitle'])
        expect([...new Set(negated.map(o => o.organizationTitle))].sort()).toEqual(['orgB'])

        // 结构不变量：整条 SQL 的每个标识符都在 63 字节以内（两驱动同一编译产物）
        for (const sql of statements.filter(s => s.includes('EXISTS'))) {
            const overLimit = [...sql.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(ident => ident.length > 63)
            expect(overLimit, `identifiers over 63 bytes in:\n${sql.slice(0, 400)}`).toEqual([])
        }
        await system.destroy()
    })
})

describe('r36: global json compareAndSet uses canonical-form comparison (sibling of the r25 record-target fix)', () => {
    test.each([['pglite'], ['sqlite']] as const)('CAS on a global json target (%s)', async (dbKind) => {
        const db = dbKind === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
        const system = new MonoSystem(db as never)
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [], relations: [], eventSources: [] })
        await controller.setup(true)
        const target = { key: `r36GlobalJsonCas`, valueType: 'json' as const, defaultValue: { a: 0, b: 0 } }

        await system.storage.atomic.replace(target, { a: 1, b: 2 })
        // 键序颠倒的语义相等对象必须命中（修复前：PG 系抛 "operator does not exist"，
        //  SQLite 文本比较静默 false）
        expect(await system.storage.atomic.compareAndSet(target, { b: 2, a: 1 }, { a: 9, b: 9 })).toBe(true)
        // 不相等的 expected 正确拒绝
        expect(await system.storage.atomic.compareAndSet(target, { a: 777 }, { a: 0, b: 0 })).toBe(false)
        expect(await system.storage.atomic.get(target)).toEqual({ a: 9, b: 9 })
        // 行缺席 + expected === defaultValue：视为默认态命中（与非 json 列的 insert 分支同语义）
        const fresh = { key: `r36GlobalJsonCasFresh`, valueType: 'json' as const, defaultValue: { n: 0 } }
        expect(await system.storage.atomic.compareAndSet(fresh, { n: 0 }, { n: 5 })).toBe(true)
        expect(await system.storage.atomic.get(fresh)).toEqual({ n: 5 })
        await system.destroy()
    })
})
