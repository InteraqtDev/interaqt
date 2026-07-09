import { describe, expect, test } from "vitest";
import {
    Controller, MonoSystem, Property, Entity, Relation, Every, Any, Count, Summation, WeightedSummation,
    Transform, Dictionary, MatchExp, KlassByName, RealTime, InteractionEventEntity,
} from 'interaqt';
import { Interaction, Action, PayloadItem } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import { GlobalRealTimeComputation } from '../../src/runtime/computations/RealTime.js';
import { Expression } from '../../src/runtime/computations/MathResolver.js';

// 2026-07 全库 review 修复的回归测试（agentspace/output/full-codebase-review-2026-07.md）。

describe('F-1: Every empty-set semantics', () => {
    test('notEmpty: true stays false on full recompute over an empty set', async () => {
        const requestEntity = Entity.create({
            name: 'Request',
            properties: [Property.create({ name: 'handled', type: 'boolean' })]
        })
        const threshold = Dictionary.create({
            name: 'threshold', type: 'number', collection: false,
            defaultValue: () => 1
        })
        const dictionary = [
            threshold,
            Dictionary.create({
                name: 'everyRequestHandled', type: 'boolean', collection: false,
                computation: Every.create({
                    record: requestEntity,
                    attributeQuery: ['handled'],
                    dataDeps: { threshold: { type: 'global', source: threshold } },
                    callback: function (request: any) { return request.handled },
                    notEmpty: true
                }),
            })
        ]
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [requestEntity], relations: [], dict: dictionary })
        await controller.setup(true)

        // 空集合 + notEmpty:true → false（修复前 compute() 空真返回 true）
        expect(await system.storage.dict.get('everyRequestHandled')).toBe(false)

        // 非主依赖变化触发 full recompute，空集合下仍必须为 false
        await system.storage.dict.set('threshold', 2)
        expect(await system.storage.dict.get('everyRequestHandled')).toBe(false)

        // 有记录后语义正常
        await system.storage.create('Request', { handled: true })
        expect(await system.storage.dict.get('everyRequestHandled')).toBe(true)
        await system.storage.create('Request', { handled: false })
        expect(await system.storage.dict.get('everyRequestHandled')).toBe(false)

        await system.storage.destroy()
    });
});

describe('F-3: WeightedSummation finite-number guard', () => {
    test('undefined/NaN weighted values count as 0 instead of poisoning the total', async () => {
        const itemEntity = Entity.create({
            name: 'WItem',
            properties: [Property.create({ name: 'price', type: 'number' })]
        })
        const dict = [
            Dictionary.create({
                name: 'total', type: 'number', collection: false,
                computation: WeightedSummation.create({
                    record: itemEntity,
                    attributeQuery: ['price'],
                    callback: (item: any) => ({ weight: 1, value: item.price })
                })
            })
        ]
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [itemEntity], relations: [], dict })
        await controller.setup(true)

        await system.storage.create('WItem', { price: 10 })
        // price 缺失 → value undefined → 修复前 1 * undefined = NaN 永久污染总和
        await system.storage.create('WItem', {})
        await system.storage.create('WItem', { price: 5 })

        expect(await system.storage.dict.get('total')).toBe(15)
        await system.storage.destroy()
    });
});

describe('F-5: scheduler.setup is idempotent', () => {
    test('repeated setup does not stack mutation listeners (Transform stays single-shot)', async () => {
        const orderEntity = Entity.create({
            name: 'Order',
            properties: [Property.create({ name: 'amount', type: 'number' })]
        })
        const receiptEntity = Entity.create({
            name: 'Receipt',
            properties: [Property.create({ name: 'amount', type: 'number' })],
            computation: Transform.create({
                record: orderEntity,
                attributeQuery: ['amount'],
                callback: (order: any) => ({ amount: order.amount })
            })
        })
        const itemCount = Dictionary.create({
            name: 'orderCount', type: 'number', collection: false,
            computation: Count.create({ record: orderEntity })
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [orderEntity, receiptEntity], relations: [], dict: [itemCount] })
        await controller.setup(true)
        // 修复前：第二次 setup 叠加监听器，后续任何 Order 创建都会因 Transform 重复派生撞唯一索引而失败
        await controller.setup(false)

        await system.storage.create('Order', { amount: 42 })
        const receipts = await system.storage.find('Receipt', undefined, undefined, ['*'])
        expect(receipts.length).toBe(1)
        expect(await system.storage.dict.get('orderCount')).toBe(1)
        await system.storage.destroy()
    });
});

describe('R-1: RealTime guards', () => {
    test('Expression result without nextRecomputeTime throws a clear ComputationError', async () => {
        const realTimeArgs = RealTime.create({
            callback: (async (now: Expression) => now.add(1)) as any,
            // 故意不声明 nextRecomputeTime
            // r11: 零 dataDeps 的 RealTime 现在在构造期 fail-fast，这里给一个占位依赖
            dataDeps: { trigger: { type: 'global', source: { name: 'r1RealTimeTrigger' } } } as any,
        })
        const handle = new GlobalRealTimeComputation(
            {} as any,
            realTimeArgs as any,
            { type: 'global', id: { name: 'testRealTime' } } as any
        )
        await expect(handle.compute({})).rejects.toThrow(/nextRecomputeTime/)
    });
});

describe('R-2: property aggregates reset bound state on filtered relation exit', () => {
    test('relation leaving and re-entering a filtered relation keeps property aggregates correct', async () => {
        const departmentEntity = Entity.create({
            name: 'Department',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const employeeEntity = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'salary', type: 'number' })
            ]
        })
        const deptEmployeeRelation = Relation.create({
            source: departmentEntity,
            sourceProperty: 'employees',
            target: employeeEntity,
            targetProperty: 'department',
            type: '1:n',
            properties: [Property.create({ name: 'isActive', type: 'boolean' })]
        })
        const activeEmployeeRelation = Relation.create({
            name: 'ActiveEmployeeRelation',
            baseRelation: deptEmployeeRelation,
            sourceProperty: 'activeEmployees',
            targetProperty: 'activeDepartment',
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })
        departmentEntity.properties.push(
            Property.create({
                name: 'activeCount', type: 'number',
                computation: Count.create({
                    property: 'activeEmployees',
                    attributeQuery: ['salary'],
                    callback: () => true
                })
            }),
            Property.create({
                name: 'activeSalarySum', type: 'number',
                computation: Summation.create({
                    property: 'activeEmployees',
                    attributeQuery: ['salary']
                })
            }),
            Property.create({
                name: 'anyActiveRich', type: 'boolean',
                computation: Any.create({
                    property: 'activeEmployees',
                    attributeQuery: ['salary'],
                    callback: (e: any) => e.salary >= 100
                })
            })
        )

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [departmentEntity, employeeEntity],
            relations: [deptEmployeeRelation, activeEmployeeRelation],
        })
        await controller.setup(true)

        const dept = await system.storage.create('Department', { name: 'D1' })
        const employee = await system.storage.create('Employee', { name: 'E1', salary: 100 })
        await system.storage.addRelationByNameById(deptEmployeeRelation.name!, dept.id, employee.id, { isActive: true })

        const deptMatch = MatchExp.atom({ key: 'id', value: ['=', dept.id] })
        let deptRecord = await system.storage.findOne('Department', deptMatch, undefined, ['*'])
        expect(deptRecord.activeCount).toBe(1)
        expect(deptRecord.activeSalarySum).toBe(100)
        expect(deptRecord.anyActiveRich).toBe(true)

        // 离开 filtered relation（membership delete，物理行仍存在）
        await system.storage.update(
            deptEmployeeRelation.name!,
            MatchExp.atom({ key: 'source.id', value: ['=', dept.id] }),
            { isActive: false }
        )
        deptRecord = await system.storage.findOne('Department', deptMatch, undefined, ['*'])
        expect(deptRecord.activeCount).toBe(0)
        expect(deptRecord.activeSalarySum).toBe(0)
        expect(deptRecord.anyActiveRich).toBe(false)

        // 重新进入（membership create）：修复前 record-bound 状态未复位，增量为 0，聚合永久偏低
        await system.storage.update(
            deptEmployeeRelation.name!,
            MatchExp.atom({ key: 'source.id', value: ['=', dept.id] }),
            { isActive: true }
        )
        deptRecord = await system.storage.findOne('Department', deptMatch, undefined, ['*'])
        expect(deptRecord.activeCount).toBe(1)
        expect(deptRecord.activeSalarySum).toBe(100)
        expect(deptRecord.anyActiveRich).toBe(true)

        await system.storage.destroy()
    });
});

describe('R-3: PayloadItem isRef requires base', () => {
    test('PayloadItem.create throws when isRef has no base', () => {
        expect(() => PayloadItem.create({
            name: 'ref',
            type: 'object',
            isRef: true,
        })).toThrow(/isRef.*base/)
    });
});

describe('concurrent dispatch on single-connection drivers', () => {
    test('parallel dispatches on PGLite are serialized and all commit correctly', async () => {
        const eventCount = Dictionary.create({
            name: 'eventCount', type: 'number', collection: false,
            computation: Count.create({ record: InteractionEventEntity })
        })
        const ping = Interaction.create({
            name: 'Ping',
            action: Action.create({ name: 'ping' }),
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system, entities: [], relations: [], eventSources: [ping], dict: [eventCount]
        })
        await controller.setup(true)

        const results = await Promise.all(
            Array.from({ length: 8 }, () => controller.dispatch(ping, { user: { id: 'u1' } }))
        )
        for (const result of results) {
            expect(result.error).toBeUndefined()
        }
        expect(await system.storage.dict.get('eventCount')).toBe(8)
        await system.storage.destroy()
    });
});

describe('F-2: NULL matching and not in', () => {
    test("['=', null] matches SQL NULL and ['!=', null] matches non-null", async () => {
        const userEntity = Entity.create({
            name: 'NUser',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'deletedAt', type: 'string' })
            ]
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [userEntity], relations: [] })
        await controller.setup(true)

        await system.storage.create('NUser', { name: 'alive' })
        await system.storage.create('NUser', { name: 'gone', deletedAt: '2026-01-01' })

        const nullRows = await system.storage.find('NUser', MatchExp.atom({ key: 'deletedAt', value: ['=', null] }), undefined, ['*'])
        expect(nullRows.length).toBe(1)
        expect(nullRows[0].name).toBe('alive')

        const notNullRows = await system.storage.find('NUser', MatchExp.atom({ key: 'deletedAt', value: ['!=', null] }), undefined, ['*'])
        expect(notNullRows.length).toBe(1)
        expect(notNullRows[0].name).toBe('gone')

        const isNullRows = await system.storage.find('NUser', MatchExp.atom({ key: 'deletedAt', value: ['is null', null] }), undefined, ['*'])
        expect(isNullRows.length).toBe(1)
        const isNotNullRows = await system.storage.find('NUser', MatchExp.atom({ key: 'deletedAt', value: ['is not null', null] }), undefined, ['*'])
        expect(isNotNullRows.length).toBe(1)

        await system.storage.destroy()
    });

    test("'not in' excludes listed values; empty 'not in' matches everything", async () => {
        const itemEntity = Entity.create({
            name: 'NItem',
            properties: [Property.create({ name: 'status', type: 'string' })]
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [itemEntity], relations: [] })
        await controller.setup(true)

        await system.storage.create('NItem', { status: 'a' })
        await system.storage.create('NItem', { status: 'b' })
        await system.storage.create('NItem', { status: 'c' })

        const excluded = await system.storage.find('NItem', MatchExp.atom({ key: 'status', value: ['not in', ['a', 'b']] }), undefined, ['*'])
        expect(excluded.length).toBe(1)
        expect(excluded[0].status).toBe('c')

        const all = await system.storage.find('NItem', MatchExp.atom({ key: 'status', value: ['not in', []] }), undefined, ['*'])
        expect(all.length).toBe(3)

        // 空 not in 与其他条件组合时括号必须正确（OR 不能泄漏）
        const combined = await system.storage.find('NItem',
            MatchExp.atom({ key: 'status', value: ['not in', []] }).and({ key: 'status', value: ['=', 'a'] }),
            undefined, ['*'])
        expect(combined.length).toBe(1)

        await system.storage.destroy()
    });
});

describe('F-4: LIMIT/OFFSET with x:n match fan-out', () => {
    async function setupUsersAndTeams() {
        const userEntity = Entity.create({
            name: 'PUser',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const teamEntity = Entity.create({
            name: 'PTeam',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const rel = Relation.create({
            source: userEntity,
            sourceProperty: 'teams',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:n'
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [userEntity, teamEntity], relations: [rel] })
        await controller.setup(true)

        for (let u = 0; u < 3; u++) {
            const teams = []
            for (let t = 0; t < 3; t++) {
                teams.push(await system.storage.create('PTeam', { name: `A-team-${u}-${t}` }))
            }
            await system.storage.create('PUser', { name: `user-${u}`, teams })
        }
        return system
    }

    test('limit returns the requested number of root records despite join fan-out', async () => {
        const system = await setupUsersAndTeams()
        const users = await system.storage.find('PUser',
            MatchExp.atom({ key: 'teams.name', value: ['like', 'A-%'] }),
            { limit: 2, orderBy: { name: 'ASC' } },
            ['id', 'name'])
        expect(users.length).toBe(2)
        expect(users.map((u: any) => u.name)).toEqual(['user-0', 'user-1'])
        await system.storage.destroy()
    });

    test('offset pages over root records, not raw joined rows', async () => {
        const system = await setupUsersAndTeams()
        const page2 = await system.storage.find('PUser',
            MatchExp.atom({ key: 'teams.name', value: ['like', 'A-%'] }),
            { limit: 2, offset: 2, orderBy: { name: 'ASC' } },
            ['id', 'name'])
        expect(page2.length).toBe(1)
        expect(page2[0].name).toBe('user-2')
        await system.storage.destroy()
    });

    test('findOne (limit 1) still works with fan-out', async () => {
        const system = await setupUsersAndTeams()
        const user = await system.storage.findOne('PUser',
            MatchExp.atom({ key: 'teams.name', value: ['like', 'A-%'] }),
            { orderBy: { name: 'ASC' } },
            ['id', 'name'])
        expect(user.name).toBe('user-0')
        await system.storage.destroy()
    });
});

describe('R-6: boolean read normalization across drivers', () => {
    test('SQLite returns booleans (not 0/1) for boolean properties', async () => {
        const userEntity = Entity.create({
            name: 'BUser',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const system = new MonoSystem(new SQLiteDB(':memory:'))
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [userEntity], relations: [] })
        await controller.setup(true)

        await system.storage.create('BUser', { name: 'on', isActive: true })
        await system.storage.create('BUser', { name: 'off', isActive: false })

        const rows = await system.storage.find('BUser', undefined, undefined, ['*'])
        const on = rows.find((r: any) => r.name === 'on')!
        const off = rows.find((r: any) => r.name === 'off')!
        expect(on.isActive).toBe(true)
        expect(off.isActive).toBe(false)
        await system.storage.destroy()
    });
});
