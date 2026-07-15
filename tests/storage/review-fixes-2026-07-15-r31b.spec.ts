/**
 * r31b（storage 面）——嵌套 x:1 谓词强制执行（r30 记录的预存缺口收口）。
 *
 * x:1 子查询被编译进父查询的 LEFT JOIN，其 matchExpression（用户声明 / filtered relation
 * 注入的谓词）此前从不生效：filtered x:1 属性返回未过滤的 base 配对、普通 x:1 的
 * matchExpression 被静默忽略（r30 复现 A3）。收敛修复：QueryExecutor.enforceXToOnePredicates
 * ——对携带谓词的 x:1 节点逐父探针（谓词 + 反向 id，与 x:n 独立查询的谓词机制同构），
 * 不命中则关联置 null（父记录保留）。四个拓扑格：filtered × isolated n:1 / filtered ×
 * combined 1:1 / 普通 x:1 用户谓词 / x:1 主干下的深层 filtered x:1。
 * fuzzer 预言机 7b/7b-deep 同步升级为相等断言（缺失=挂载缺口，多余=谓词泄漏）；
 * 敏感性实验：回退修复后 extended seed 3/4/10/12/13/14 当场红（predicate leak）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from '@storage';
import { SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core';

describe('r31b — nested x:1 predicate enforcement', () => {
    let db: SQLiteDB
    beforeEach(async () => { db = new SQLiteDB(); await db.open() })
    afterEach(async () => { await db.close() })

    test('filtered x:1 over isolated n:1: predicate must apply on nested read', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Dept = Entity.create({ name: 'Dept', properties: [Property.create({ name: 'title', type: 'string' })] })
        const UserDept = Relation.create({
            source: User, sourceProperty: 'dept', target: Dept, targetProperty: 'users', type: 'n:1',
            properties: [Property.create({ name: 'isMain', type: 'boolean', defaultValue: () => false })]
        })
        const MainDept = Relation.create({
            name: 'MainDept', baseRelation: UserDept,
            sourceProperty: 'mainDept', targetProperty: 'mainUsers',
            matchExpression: MatchExp.atom({ key: 'isMain', value: ['=', true] })
        })
        const setup = new DBSetup([User, Dept], [UserDept, MainDept], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const u1 = await handle.create('User', { name: 'u1', dept: { title: 'd-main', '&': { isMain: true } } })
        const u2 = await handle.create('User', { name: 'u2', dept: { title: 'd-side', '&': { isMain: false } } })

        const r1 = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined,
            ['id', ['mainDept', { attributeQuery: ['id', 'title'] }]])
        expect(r1.mainDept?.title).toBe('d-main')

        const r2 = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), undefined,
            ['id', ['mainDept', { attributeQuery: ['id', 'title'] }]])
        console.log('u2 mainDept (must be null/undefined):', JSON.stringify(r2.mainDept))
        expect(r2.mainDept == null).toBe(true)

        // base attribute unaffected
        const r2base = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }), undefined,
            ['id', ['dept', { attributeQuery: ['id', 'title'] }]])
        expect(r2base.dept?.title).toBe('d-side')
    })

    test('filtered x:1 over combined 1:1: predicate must apply on nested read', async () => {
        const Owner = Entity.create({ name: 'Owner', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Profile = Entity.create({ name: 'Profile', properties: [Property.create({ name: 'title', type: 'string' })] })
        const OwnerProfile = Relation.create({
            source: Owner, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1', isTargetReliance: true,
            properties: [Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => false })]
        })
        const PrimaryProfile = Relation.create({
            name: 'PrimaryProfile', baseRelation: OwnerProfile,
            sourceProperty: 'primaryProfile', targetProperty: 'primaryOwner',
            matchExpression: MatchExp.atom({ key: 'isPrimary', value: ['=', true] })
        })
        const setup = new DBSetup([Owner, Profile], [OwnerProfile, PrimaryProfile], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        expect(setup.map.links[OwnerProfile.name!].mergedTo).toBe('combined')

        const o1 = await handle.create('Owner', { name: 'o1', profile: { title: 'p1', '&': { isPrimary: true } } })
        const o2 = await handle.create('Owner', { name: 'o2', profile: { title: 'p2', '&': { isPrimary: false } } })

        const r1 = await handle.findOne('Owner', MatchExp.atom({ key: 'id', value: ['=', o1.id] }), undefined,
            ['id', ['primaryProfile', { attributeQuery: ['id', 'title'] }]])
        expect(r1.primaryProfile?.title).toBe('p1')

        const r2 = await handle.findOne('Owner', MatchExp.atom({ key: 'id', value: ['=', o2.id] }), undefined,
            ['id', ['primaryProfile', { attributeQuery: ['id', 'title'] }]])
        console.log('o2 primaryProfile (must be null/undefined):', JSON.stringify(r2.primaryProfile))
        expect(r2.primaryProfile == null).toBe(true)
    })

    test('plain x:1 with user matchExpression in nested attributeQuery (r30 repro A3)', async () => {
        const Emp = Entity.create({ name: 'Emp', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Team = Entity.create({
            name: 'Team',
            properties: [Property.create({ name: 'kind', type: 'string' }), Property.create({ name: 'title', type: 'string' })]
        })
        const EmpTeam = Relation.create({ source: Emp, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1' })
        const setup = new DBSetup([Emp, Team], [EmpTeam], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const e1 = await handle.create('Emp', { name: 'e1', team: { kind: 'eng', title: 'T1' } })
        const e2 = await handle.create('Emp', { name: 'e2', team: { kind: 'sales', title: 'T2' } })

        const q = (id: unknown) => handle.findOne('Emp', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined,
            ['id', ['team', { attributeQuery: ['id', 'title'], matchExpression: MatchExp.atom({ key: 'kind', value: ['=', 'eng'] }) }]])
        expect((await q(e1.id)).team?.title).toBe('T1')
        const r2 = await q(e2.id)
        console.log('e2 team (must be null/undefined):', JSON.stringify(r2.team))
        expect(r2.team == null).toBe(true)
    })

    test('combined x:1 orderBy: unpaired co-tenant sorts as NULL, not by ghost columns (r28 phantom-pairing family, Modifier face)', async () => {
        const P2 = (name: string, type: string) => Property.create({ name, type })
        const B = Entity.create({ name: 'R31oB', properties: [P2('label', 'string')] })
        const C = Entity.create({ name: 'R31oC', properties: [P2('label', 'string')] })
        const D = Entity.create({ name: 'R31oD', properties: [P2('label', 'string')] })
        const out3 = Relation.create({ source: C, sourceProperty: 'out3', target: D, targetProperty: 'in3', type: '1:1', isTargetReliance: true })
        const out4 = Relation.create({ source: B, sourceProperty: 'out4', target: D, targetProperty: 'in4', type: '1:1', isTargetReliance: true })
        const setup = new DBSetup([B, C, D], [out3, out4], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // R28o 装配：B1 与 C1—D('zzz-ghost') 配对孤儿同住（B1—D 从未 link；out4 槽位被幽灵占据）
        const c1 = await handle.create('R31oC', { label: 'c1', out3: { label: 'd1' } })
        const d1 = (await handle.find('R31oD', undefined, undefined, ['id']))[0]
        await handle.update('R31oD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }), { in4: { label: 'b1' } } as any)
        await handle.delete('R31oD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }))
        await handle.update('R31oC', MatchExp.atom({ key: 'id', value: ['=', c1.id] }), { out3: { label: 'zzz-ghost' } } as any)
        await handle.create('R31oB', { label: 'b9', out4: { label: 'aaa' } })

        // 读取面对照（r28 prune）
        const b1 = (await handle.find('R31oB', MatchExp.atom({ key: 'label', value: ['=', 'b1'] }), undefined,
            ['id', 'label', ['out4', { attributeQuery: ['id', 'label'] }]]))[0]
        expect(b1.out4 ?? null).toBe(null)
        // 排序面：DESC 下 b1 的排序键必须按 NULL 处理（此前按幽灵 'zzz-ghost' 排在 'aaa' 前）
        const sorted = await handle.find('R31oB', undefined, { orderBy: { 'out4.label': 'DESC' } }, ['id', 'label'])
        expect(sorted.map((r: any) => r.label)).toEqual(['b9', 'b1'])
        // ASC（SQLite NULLs first）：b1 在前——两个方向都不受幽灵值影响
        const sortedAsc = await handle.find('R31oB', undefined, { orderBy: { 'out4.label': 'ASC' } }, ['id', 'label'])
        expect(sortedAsc.map((r: any) => r.label)).toEqual(['b1', 'b9'])
    })

    test('filtered-relation attribute paths in orderBy / reference values fail fast with a pointer to the base path', async () => {
        const User = Entity.create({ name: 'FUser', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Dept = Entity.create({ name: 'FDept', properties: [Property.create({ name: 'title', type: 'string' })] })
        const UserDept = Relation.create({
            source: User, sourceProperty: 'dept', target: Dept, targetProperty: 'users', type: 'n:1',
            properties: [Property.create({ name: 'isMain', type: 'boolean', defaultValue: () => false })]
        })
        const MainDept = Relation.create({
            name: 'FMainDept', baseRelation: UserDept,
            sourceProperty: 'mainDept', targetProperty: 'mainUsers',
            matchExpression: MatchExp.atom({ key: 'isMain', value: ['=', true] })
        })
        const setup = new DBSetup([User, Dept], [UserDept, MainDept], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        await handle.create('FUser', { name: 'u1', dept: { title: 'T', '&': { isMain: true } } })

        // orderBy 经 filtered 属性：此前生成 "no such column: REL_….undefined" 的裸 SQL 错误
        await expect(handle.find('FUser', undefined, { orderBy: { 'mainDept.title': 'ASC' } }, ['id']))
            .rejects.toThrow(/filtered relation.*Order by the base attribute path.*dept\.title/s)
        // isReferenceValue 经 filtered 属性：同族
        await expect(handle.find('FUser',
            MatchExp.atom({ key: 'name', value: ['=', 'mainDept.title'], isReferenceValue: true }), undefined, ['id']))
            .rejects.toThrow(/filtered relation attributes are not supported in reference paths.*dept\.title/s)
        // base 路径正常工作（对照）
        expect(await handle.find('FUser', undefined, { orderBy: { 'dept.title': 'ASC' } }, ['id'])).toHaveLength(1)
    })

    test('deep: filtered x:1 nested under another x:1', async () => {
        const A = Entity.create({ name: 'A', properties: [Property.create({ name: 'name', type: 'string' })] })
        const B = Entity.create({ name: 'B', properties: [Property.create({ name: 'name', type: 'string' })] })
        const C = Entity.create({ name: 'C', properties: [Property.create({ name: 'name', type: 'string' })] })
        const AB = Relation.create({ source: A, sourceProperty: 'b', target: B, targetProperty: 'as', type: 'n:1' })
        const BC = Relation.create({
            source: B, sourceProperty: 'c', target: C, targetProperty: 'bs', type: 'n:1',
            properties: [Property.create({ name: 'active', type: 'boolean', defaultValue: () => false })]
        })
        const ActiveC = Relation.create({
            name: 'ActiveC', baseRelation: BC,
            sourceProperty: 'activeC', targetProperty: 'activeBs',
            matchExpression: MatchExp.atom({ key: 'active', value: ['=', true] })
        })
        const setup = new DBSetup([A, B, C], [AB, BC, ActiveC], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const a1 = await handle.create('A', { name: 'a1', b: { name: 'b1', c: { name: 'c1', '&': { active: true } } } })
        const a2 = await handle.create('A', { name: 'a2', b: { name: 'b2', c: { name: 'c2', '&': { active: false } } } })

        const q = (id: unknown) => handle.findOne('A', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined,
            ['id', ['b', { attributeQuery: ['id', 'name', ['activeC', { attributeQuery: ['id', 'name'] }]] }]])
        expect((await q(a1.id)).b?.activeC?.name).toBe('c1')
        const r2 = await q(a2.id)
        console.log('a2 b.activeC (must be null/undefined):', JSON.stringify(r2.b?.activeC))
        expect(r2.b?.activeC == null).toBe(true)
        expect(r2.b?.name).toBe('b2')
    })
})
