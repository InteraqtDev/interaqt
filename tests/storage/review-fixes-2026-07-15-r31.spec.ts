/**
 * r31 深度 review 修复回归（storage 面）。
 *
 * A｜filtered x:n relation 嵌套在 x:1 主干之下时，补全枝干按 **base 属性名**挂载结果
 *   （r30 只修了「读取父级 x:1」的 alias 面，「挂载 x:n 结果」仍在 base 名上）：
 *   - filtered 名下的结果整体缺失（undefined）；
 *   - 过滤后的子集泄漏到 base 名下——若同时请求 base 属性，两者互相覆盖（静默错误读结果）。
 *   收敛修复：QueryExecutor 全部子查询结果挂载点统一 `alias || attributeName`
 *   （completeXToOneLeftoverRecords 两处、findXToManyRelatedRecords[Batched] 的 link x:n、
 *   findRecords 步骤 2 的 link x:n）。alias 对非 filtered 关系恒等于 attributeName。
 *
 * B｜merged (union) entity/relation 的同名 property 类型冲突静默 last-wins：
 *   同名属性共享同一物理列，后处理 input 的类型改写先处理 input 的列类型
 *   （number 列变 TEXT，数据以错误类型读回——零告警 schema 损坏）。
 *   修复：mergeProperties 的全部合并点对类型/collection 冲突 fail-fast
 *   （commonProperties 的 name+type 一致性约束推广到所有同名合并点）。
 *
 * C｜normalizeDatabaseError 把通用 SQLITE_CONSTRAINT 判为 unique violation：
 *   NOT NULL / CHECK / FK 失败也可能携带该通用码，误判让调用方按"重复键"处理。
 *
 * D｜PG/PGLite 驱动 insert/update 对 Date 参数 JSON.stringify（产出带引号字符串），
 *   能否入库完全依赖 PG datetime 解析器对双引号的历史容忍。与 MySQL（r26）同一契约：
 *   Date 原样交给驱动绑定。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from '@storage';
import { PGLiteDB, SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core';
import { normalizeDatabaseError } from '../../src/runtime/errors/DatabaseErrors.js';

describe('r31 storage review fixes', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => { db = new SQLiteDB(); await db.open() })
    afterEach(async () => { await db.close() })

    const setupDeptGraph = async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Dept = Entity.create({ name: 'Dept', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Employee = Entity.create({ name: 'Employee', properties: [Property.create({ name: 'name', type: 'string' })] })
        const UserDept = Relation.create({
            source: User, sourceProperty: 'dept', target: Dept, targetProperty: 'users', type: 'n:1'
        })
        const DeptEmployee = Relation.create({
            source: Dept, sourceProperty: 'employees', target: Employee, targetProperty: 'dept', type: '1:n',
            properties: [Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })]
        })
        const ActiveDeptEmployee = Relation.create({
            name: 'ActiveDeptEmployee', baseRelation: DeptEmployee,
            sourceProperty: 'activeEmployees', targetProperty: 'activeDept',
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })
        setup = new DBSetup([User, Dept, Employee], [UserDept, DeptEmployee, ActiveDeptEmployee], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        return handle.create('User', {
            name: 'u1',
            dept: {
                title: 'd1',
                employees: [
                    { name: 'A', '&': { isActive: true } },
                    { name: 'B', '&': { isActive: false } },
                ]
            }
        })
    }

    test('A: filtered x:n nested under x:1 mounts under the filtered alias (was: base name, filtered key missing)', async () => {
        const user = await setupDeptGraph()

        const r = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined, [
            'id', ['dept', { attributeQuery: ['id', 'title', ['activeEmployees', { attributeQuery: ['id', 'name'] }]] }]
        ])
        expect(r.dept.activeEmployees).toBeDefined()
        expect(r.dept.activeEmployees).toHaveLength(1)
        expect(r.dept.activeEmployees[0].name).toBe('A')
        // 过滤后的子集不得泄漏到 base 名下
        expect(r.dept.employees).toBeUndefined()
    })

    test('A2: base and filtered x:n requested together under the same x:1 must not overwrite each other', async () => {
        const user = await setupDeptGraph()

        const r = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined, [
            'id', ['dept', {
                attributeQuery: ['id',
                    ['employees', { attributeQuery: ['id', 'name'] }],
                    ['activeEmployees', { attributeQuery: ['id', 'name'] }],
                ]
            }]
        ])
        expect((r.dept.employees ?? []).map((e: any) => e.name).sort()).toEqual(['A', 'B'])
        expect((r.dept.activeEmployees ?? []).map((e: any) => e.name)).toEqual(['A'])
    })

    test('A-guard: non-filtered x:n under x:1 unchanged (alias === attributeName)', async () => {
        const user = await setupDeptGraph()

        const r = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined, [
            'id', ['dept', { attributeQuery: ['id', ['employees', { attributeQuery: ['id', 'name'] }]] }]
        ])
        expect((r.dept.employees ?? []).map((e: any) => e.name).sort()).toEqual(['A', 'B'])
    })

    test('B: merged entity same-name property with conflicting type is rejected at setup', async () => {
        const A = Entity.create({ name: 'MA', properties: [Property.create({ name: 'score', type: 'number' })] })
        const B = Entity.create({ name: 'MB', properties: [Property.create({ name: 'score', type: 'string' })] })
        const M = Entity.create({ name: 'MM', inputEntities: [A, B] })
        expect(() => new DBSetup([A, B, M], [], db)).toThrow(/property "score".*conflicts/s)
    })

    test('B-guard: merged entity same-name property with the SAME type still works', async () => {
        const A = Entity.create({ name: 'SA', properties: [Property.create({ name: 'score', type: 'number' })] })
        const B = Entity.create({ name: 'SB', properties: [Property.create({ name: 'score', type: 'number' })] })
        const M = Entity.create({ name: 'SM', inputEntities: [A, B] })
        const okSetup = new DBSetup([A, B, M], [], db)
        await okSetup.createTables()
        const okHandle = new EntityQueryHandle(new EntityToTableMap(okSetup.map, okSetup.aliasManager), db)
        const a = await okHandle.create('SA', { score: 7 })
        expect((await okHandle.findOne('SM', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['*'])).score).toBe(7)
    })

    test('C: generic SQLITE_CONSTRAINT is not classified as a unique violation', () => {
        const generic = Object.assign(new Error('NOT NULL constraint failed: User.name'), { code: 'SQLITE_CONSTRAINT' })
        expect(normalizeDatabaseError(generic).isUniqueViolation).toBe(false)
        const uniqueExtended = Object.assign(new Error('UNIQUE constraint failed: User.email'), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
        expect(normalizeDatabaseError(uniqueExtended).isUniqueViolation).toBe(true)
        // 通用码但消息是 unique 失败——仍按消息识别
        const genericUniqueMessage = Object.assign(new Error('UNIQUE constraint failed: User.email'), { code: 'SQLITE_CONSTRAINT' })
        expect(normalizeDatabaseError(genericUniqueMessage).isUniqueViolation).toBe(true)
    })

    test('D: timestamp Date param round-trips through PGLite insert/update as a native binding', async () => {
        const EventRec = Entity.create({
            name: 'EventRec',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'happenedAt', type: 'timestamp' }),
            ]
        })
        const pgDb = new PGLiteDB()
        await pgDb.open()
        const pgSetup = new DBSetup([EventRec], [], pgDb)
        await pgSetup.createTables()
        const pgHandle = new EntityQueryHandle(new EntityToTableMap(pgSetup.map, pgSetup.aliasManager), pgDb)
        const ms = Date.UTC(2026, 0, 2, 3, 4, 5)
        const created = await pgHandle.create('EventRec', { name: 'e1', happenedAt: new Date(ms) })
        expect((await pgHandle.findOne('EventRec', MatchExp.atom({ key: 'id', value: ['=', created.id] }), undefined, ['*'])).happenedAt).toBe(ms)
        // update 路径同一契约
        const ms2 = Date.UTC(2026, 5, 6, 7, 8, 9)
        await pgHandle.update('EventRec', MatchExp.atom({ key: 'id', value: ['=', created.id] }), { happenedAt: new Date(ms2) })
        expect((await pgHandle.findOne('EventRec', MatchExp.atom({ key: 'id', value: ['=', created.id] }), undefined, ['*'])).happenedAt).toBe(ms2)
        await pgDb.close()
    })
})
