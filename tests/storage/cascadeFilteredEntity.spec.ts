import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property } from '@shared';
import TestLogger from "./testLogger.js";
import { PGLiteDB } from '@dbclients';

describe('cascade filtered entity test', () => {
    let db: PGLiteDB;
    let setup: DBSetup;
    let logger: any;
    let entityQueryHandle: EntityQueryHandle;

    beforeEach(async () => {
        // 创建基础实体
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'department', type: 'string' }),
                Property.create({ name: 'role', type: 'string' })
            ]
        });

        // 第一层 filtered entity - ActiveUsers
        const activeUsersEntity = Entity.create({
            name: 'ActiveUsers',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // 第二层 filtered entity - 基于 ActiveUsers 的 TechActiveUsers
        const techActiveUsersEntity = Entity.create({
            name: 'TechActiveUsers',
            baseEntity: activeUsersEntity,  // 注意：这里使用 ActiveUsers 作为 sourceEntity
            matchExpression: MatchExp.atom({
                key: 'department',
                value: ['=', 'Tech']
            })
        });

        // 第三层 filtered entity - 基于 TechActiveUsers 的 SeniorTechActiveUsers
        const seniorTechActiveUsersEntity = Entity.create({
            name: 'SeniorTechActiveUsers',
            baseEntity: techActiveUsersEntity,  // 基于 TechActiveUsers
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['=', 'senior']
            })
        });

        // 另一个分支：基于 ActiveUsers 的 YoungActiveUsers
        const youngActiveUsersEntity = Entity.create({
            name: 'YoungActiveUsers',
            baseEntity: activeUsersEntity,
            matchExpression: MatchExp.atom({
                key: 'age',
                value: ['<', 30]
            })
        });

        const entities = [
            userEntity,
            activeUsersEntity,
            techActiveUsersEntity,
            seniorTechActiveUsersEntity,
            youngActiveUsersEntity
        ];
        const relations: any[] = [];

        logger = new TestLogger('', true);
        
        // 使用 PGLite
        db = new PGLiteDB(undefined, {logger});
        await db.open();

        setup = new DBSetup(entities, relations, db);
        await setup.createTables();
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
    });

    afterEach(async () => {
        await db.close();
    });

    test('basic cascade filtered entity query functionality', async () => {
        // 创建测试用户
        const alice = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 25,
            isActive: true,
            department: 'Tech',
            role: 'junior'
        });

        const bob = await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 35,
            isActive: true,
            department: 'Tech',
            role: 'senior'
        });

        const charlie = await entityQueryHandle.create('User', {
            name: 'Charlie',
            age: 28,
            isActive: false,  // 不活跃
            department: 'Tech',
            role: 'senior'
        });

        const david = await entityQueryHandle.create('User', {
            name: 'David',
            age: 40,
            isActive: true,
            department: 'Sales',  // 不在 Tech 部门
            role: 'senior'
        });

        const eve = await entityQueryHandle.create('User', {
            name: 'Eve',
            age: 22,
            isActive: true,
            department: 'Tech',
            role: 'intern'
        });

        // 测试第一层 filtered entity - ActiveUsers
        const activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, 
            ['name', 'age', 'isActive', 'department', 'role']);
        expect(activeUsers).toHaveLength(4); // Alice, Bob, David, Eve
        expect(activeUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob', 'David', 'Eve']);

        // 测试第二层 filtered entity - TechActiveUsers
        const techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined,
            ['name', 'age', 'isActive', 'department', 'role']);
        expect(techActiveUsers).toHaveLength(3); // Alice, Bob, Eve (必须既活跃又在Tech部门)
        expect(techActiveUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob', 'Eve']);

        // 测试第三层 filtered entity - SeniorTechActiveUsers
        const seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined,
            ['name', 'age', 'isActive', 'department', 'role']);
        expect(seniorTechActiveUsers).toHaveLength(1); // 只有 Bob
        expect(seniorTechActiveUsers[0].name).toBe('Bob');

        // 测试另一个分支 - YoungActiveUsers
        const youngActiveUsers = await entityQueryHandle.find('YoungActiveUsers', undefined, undefined,
            ['name', 'age', 'isActive', 'department', 'role']);
        expect(youngActiveUsers).toHaveLength(2); // Alice, Eve
        expect(youngActiveUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Eve']);
    });

    test('cascade filtered entity with update operations', async () => {
        // 创建测试用户
        const user = await entityQueryHandle.create('User', {
            name: 'TestUser',
            age: 25,
            isActive: false,  // 初始不活跃
            department: 'Sales',  // 初始不在Tech
            role: 'junior'  // 初始不是senior
        });

        // 初始检查 - 应该不在任何filtered entity中
        let activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name']);
        expect(activeUsers).toHaveLength(0);

        let techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(0);

        let seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined, ['name']);
        expect(seniorTechActiveUsers).toHaveLength(0);

        // 更新为活跃状态
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'TestUser'] }),
            { isActive: true }
        );

        // 现在应该在 ActiveUsers 中
        activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name']);
        expect(activeUsers).toHaveLength(1);
        expect(activeUsers[0].name).toBe('TestUser');

        // 但不在 TechActiveUsers 中（因为不在Tech部门）
        techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(0);

        // 更新部门为 Tech
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'TestUser'] }),
            { department: 'Tech' }
        );

        // 现在应该在 TechActiveUsers 中
        techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(1);
        expect(techActiveUsers[0].name).toBe('TestUser');

        // 但不在 SeniorTechActiveUsers 中（因为不是senior）
        seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined, ['name']);
        expect(seniorTechActiveUsers).toHaveLength(0);

        // 更新角色为 senior
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'TestUser'] }),
            { role: 'senior' }
        );

        // 现在应该在所有三层 filtered entity 中
        activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name']);
        expect(activeUsers).toHaveLength(1);

        techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(1);

        seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined, ['name']);
        expect(seniorTechActiveUsers).toHaveLength(1);
        expect(seniorTechActiveUsers[0].name).toBe('TestUser');

        // 更新为不活跃，应该从所有 filtered entity 中移除
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'TestUser'] }),
            { isActive: false }
        );

        activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name']);
        expect(activeUsers).toHaveLength(0);

        techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(0);

        seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined, ['name']);
        expect(seniorTechActiveUsers).toHaveLength(0);
    });

    test('cascade filtered entity with delete operations', async () => {
        // 创建一个满足所有条件的用户
        const user = await entityQueryHandle.create('User', {
            name: 'ToBeDeleted',
            age: 35,
            isActive: true,
            department: 'Tech',
            role: 'senior'
        });

        // 验证存在于所有层级
        let users = await entityQueryHandle.find('User', undefined, undefined, ['name']);
        expect(users).toHaveLength(1);

        let activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name']);
        expect(activeUsers).toHaveLength(1);

        let techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(1);

        let seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined, ['name']);
        expect(seniorTechActiveUsers).toHaveLength(1);

        // 删除用户
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'name', value: ['=', 'ToBeDeleted'] })
        );

        // 验证从所有层级删除
        users = await entityQueryHandle.find('User', undefined, undefined, ['name']);
        expect(users).toHaveLength(0);

        activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name']);
        expect(activeUsers).toHaveLength(0);

        techActiveUsers = await entityQueryHandle.find('TechActiveUsers', undefined, undefined, ['name']);
        expect(techActiveUsers).toHaveLength(0);

        seniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers', undefined, undefined, ['name']);
        expect(seniorTechActiveUsers).toHaveLength(0);
    });

    test('cascade filtered entity with additional conditions in query', async () => {
        // 创建多个用户
        await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 25,
            isActive: true,
            department: 'Tech',
            role: 'senior'
        });

        await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 45,
            isActive: true,
            department: 'Tech',
            role: 'senior'
        });

        // 在 SeniorTechActiveUsers 基础上添加额外的查询条件
        const youngSeniorTechActiveUsers = await entityQueryHandle.find('SeniorTechActiveUsers',
            MatchExp.atom({ key: 'age', value: ['<', 30] }),
            undefined,
            ['name', 'age']
        );

        expect(youngSeniorTechActiveUsers).toHaveLength(1);
        expect(youngSeniorTechActiveUsers[0].name).toBe('Alice');
    });

    test('cascade filtered entity events are properly emitted on create', async () => {
        const events: any[] = [];

        // 创建一个满足所有级联条件的用户
        await entityQueryHandle.create('User', {
            name: 'EventTest',
            age: 35,
            isActive: true,
            department: 'Tech',
            role: 'senior'
        }, events);

        // 应该有 1 个 User create 事件 + 3 个 filtered entity create 事件
        // User -> ActiveUsers -> TechActiveUsers -> SeniorTechActiveUsers
        // User -> ActiveUsers -> YoungActiveUsers (不满足年龄条件，所以不生成)
        expect(events).toHaveLength(4);

        // 第一个是 User create 事件
        expect(events[0]).toMatchObject({
            type: 'create',
            recordName: 'User',
            record: expect.objectContaining({
                name: 'EventTest'
            })
        });

        // 后续是 filtered entity create 事件
        const filteredEntityEvents = events.slice(1);
        const eventRecordNames = filteredEntityEvents.map(e => e.recordName).sort();
        expect(eventRecordNames).toEqual(['ActiveUsers', 'SeniorTechActiveUsers', 'TechActiveUsers']);

        // 验证每个 filtered entity 事件的内容
        filteredEntityEvents.forEach(event => {
            expect(event).toMatchObject({
                type: 'create',
                record: expect.objectContaining({
                    name: 'EventTest',
                    age: 35,
                    isActive: true,
                    department: 'Tech',
                    role: 'senior'
                })
            });
        });
    });

    test('cascade filtered entity events are properly emitted on update', async () => {
        // 创建初始用户
        const user = await entityQueryHandle.create('User', {
            name: 'UpdateEventTest',
            age: 25,
            isActive: false,
            department: 'Sales',
            role: 'junior'
        });

        // 更新使其满足 ActiveUsers 条件
        const updateEvents1: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'UpdateEventTest'] }),
            { isActive: true },
            updateEvents1
        );

        // 应该有 1 个 User update + 1 个 ActiveUsers create + 1 个 YoungActiveUsers create（因为年龄是25）
        expect(updateEvents1).toHaveLength(3);
        expect(updateEvents1[0].type).toBe('update');
        expect(updateEvents1[0].recordName).toBe('User');
        
        const createEvents1 = updateEvents1.slice(1);
        const createEventNames1 = createEvents1.map(e => e.recordName).sort();
        expect(createEventNames1).toEqual(['ActiveUsers', 'YoungActiveUsers']);

        // 更新使其满足 TechActiveUsers 条件
        const updateEvents2: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'UpdateEventTest'] }),
            { department: 'Tech' },
            updateEvents2
        );

        // 应该有 1 个 User update + 1 个 TechActiveUsers create
        expect(updateEvents2).toHaveLength(2);
        expect(updateEvents2[0].type).toBe('update');
        expect(updateEvents2[0].recordName).toBe('User');
        expect(updateEvents2[1].type).toBe('create');
        expect(updateEvents2[1].recordName).toBe('TechActiveUsers');

        // 更新使其满足 SeniorTechActiveUsers 条件
        const updateEvents3: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'UpdateEventTest'] }),
            { role: 'senior' },
            updateEvents3
        );

        // 应该有 1 个 User update + 1 个 SeniorTechActiveUsers create
        expect(updateEvents3).toHaveLength(2);
        expect(updateEvents3[0].type).toBe('update');
        expect(updateEvents3[0].recordName).toBe('User');
        expect(updateEvents3[1].type).toBe('create');
        expect(updateEvents3[1].recordName).toBe('SeniorTechActiveUsers');

        // 更新使其不再满足基础条件
        const updateEvents4: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'UpdateEventTest'] }),
            { isActive: false },
            updateEvents4
        );

        // 应该有 1 个 User update + 4 个 filtered entity delete（所有级联的都要删除）
        expect(updateEvents4).toHaveLength(5);
        expect(updateEvents4[0].type).toBe('update');
        expect(updateEvents4[0].recordName).toBe('User');

        const deleteEvents = updateEvents4.slice(1);
        expect(deleteEvents.every(e => e.type === 'delete')).toBe(true);
        const deleteEventNames = deleteEvents.map(e => e.recordName).sort();
        expect(deleteEventNames).toEqual(['ActiveUsers', 'SeniorTechActiveUsers', 'TechActiveUsers', 'YoungActiveUsers']);
    });

    test('cascade filtered entity events are properly emitted on delete', async () => {
        // 创建一个满足所有条件的用户
        const user = await entityQueryHandle.create('User', {
            name: 'DeleteEventTest',
            age: 25,
            isActive: true,
            department: 'Tech',
            role: 'senior'
        });

        const deleteEvents: any[] = [];
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'name', value: ['=', 'DeleteEventTest'] }),
            deleteEvents
        );

        // 应该有 4 个 filtered entity delete + 1 个 User delete
        // 顺序：先删除派生的 filtered entities，最后删除 User
        expect(deleteEvents).toHaveLength(5);

        const filteredEntityDeleteEvents = deleteEvents.slice(0, 4);
        expect(filteredEntityDeleteEvents.every(e => e.type === 'delete')).toBe(true);
        const deleteEventNames = filteredEntityDeleteEvents.map(e => e.recordName).sort();
        expect(deleteEventNames).toEqual(['ActiveUsers', 'SeniorTechActiveUsers', 'TechActiveUsers', 'YoungActiveUsers']);

        // 最后一个是 User delete
        expect(deleteEvents[4]).toMatchObject({
            type: 'delete',
            recordName: 'User',
            record: expect.objectContaining({
                name: 'DeleteEventTest'
            })
        });
    });
}); 