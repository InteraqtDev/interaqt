import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property } from '@shared';
import TestLogger from "./testLogger.js";
import { PGLiteDB } from '@dbclients';

describe('filtered entity test', () => {
    let db: PGLiteDB;
    let setup: DBSetup;
    let logger: any;
    let entityQueryHandle: EntityQueryHandle;

    beforeEach(async () => {
        // 创建测试用的实体
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'department', type: 'string' })
            ]
        });

        // 创建 filtered entity - ActiveUsers
        const activeUsersEntity = Entity.create({
            name: 'ActiveUsers',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // 创建 filtered entity - YoungUsers  
        const youngUsersEntity = Entity.create({
            name: 'YoungUsers',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'age',
                value: ['<', 25]
            })
        });

        // 创建 filtered entity - TechYoungUsers (复杂条件)
        const techYoungUsersEntity = Entity.create({
            name: 'TechYoungUsers',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'age',
                value: ['<', 30]
            }).and({
                key: 'department',
                value: ['=', 'Tech']
            })
        });

        const entities = [userEntity, activeUsersEntity, youngUsersEntity, techYoungUsersEntity];
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
   
    test('basic filtered entity functionality', async () => {
        // 创建测试用户
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        const user2 = await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 30,
            isActive: false,
            department: 'Sales'
        });

        const user3 = await entityQueryHandle.create('User', {
            name: 'Charlie',
            age: 22,
            isActive: true,
            department: 'Tech'
        });

        // 测试 ActiveUsers filtered entity
        const activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(2);
        expect(activeUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);

        // 测试 YoungUsers filtered entity
        const youngUsers = await entityQueryHandle.find('YoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(youngUsers).toHaveLength(2);
        expect(youngUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);

        // 测试 TechYoungUsers filtered entity (复杂条件)
        const techYoungUsers = await entityQueryHandle.find('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(techYoungUsers).toHaveLength(2);
        expect(techYoungUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);
    });

    test('filtered entity with update operations', async () => {
        // 创建测试用户
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        const user2 = await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 30,
            isActive: false,
            department: 'Sales'
        });

        // 初始状态检查
        let activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(1);
        expect(activeUsers[0].name).toBe('Alice');

        // 更新 Bob 为 active
        await entityQueryHandle.update('User', 
            MatchExp.atom({ key: 'name', value: ['=', 'Bob'] }),
            { isActive: true }
        );

        // 现在应该有两个 active users
        activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(2);
        expect(activeUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob']);

        // 更新 Alice 为 inactive
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
            { isActive: false }
        );

        // 现在应该只有 Bob
        activeUsers = await entityQueryHandle.find('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(1);
        expect(activeUsers[0].name).toBe('Bob');
    });

    test('filtered entity with delete operations', async () => {
        // 创建测试用户
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        const user2 = await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 25,
            isActive: true,
            department: 'Tech'
        });

        // 初始状态检查
        let youngUsers = await entityQueryHandle.find('YoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(youngUsers).toHaveLength(1); // 只有 Alice (age < 25)
        expect(youngUsers[0].name).toBe('Alice');

        let techYoungUsers = await entityQueryHandle.find('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(techYoungUsers).toHaveLength(2); // Alice 和 Bob 都在 Tech 且 age < 30

        // 删除 Alice
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] })
        );

        // YoungUsers 应该为空
        youngUsers = await entityQueryHandle.find('YoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(youngUsers).toHaveLength(0);

        // TechYoungUsers 应该只有 Bob
        techYoungUsers = await entityQueryHandle.find('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(techYoungUsers).toHaveLength(1);
        expect(techYoungUsers[0].name).toBe('Bob');
    });

    test('filtered entity queries with additional conditions', async () => {
        // 创建测试用户
        await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 22,
            isActive: true,
            department: 'Sales'
        });

        await entityQueryHandle.create('User', {
            name: 'Charlie',
            age: 24,
            isActive: true,
            department: 'Tech'
        });

        // 在 ActiveUsers 中查找 department = 'Tech' 的用户
        const techActiveUsers = await entityQueryHandle.find(
            'ActiveUsers',
            MatchExp.atom({ key: 'department', value: ['=', 'Tech'] }),
            undefined,
            ['name', 'age', 'isActive', 'department']
        );

        expect(techActiveUsers).toHaveLength(2);
        expect(techActiveUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);

        // 在 YoungUsers 中查找 age > 21 的用户
        const olderYoungUsers = await entityQueryHandle.find(
            'YoungUsers',
            MatchExp.atom({ key: 'age', value: ['>', 21] }),
            undefined,
            ['name', 'age', 'isActive', 'department']
        );

        expect(olderYoungUsers).toHaveLength(2);
        expect(olderYoungUsers.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie']);
    });

    test('update operations directly on filtered entities', async () => {
        // 创建测试用户
        await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 22,
            isActive: true,
            department: 'Tech'
        });

        await entityQueryHandle.create('User', {
            name: 'Charlie',
            age: 35,
            isActive: true,
            department: 'Tech'  
        });

        // 直接在 TechYoungUsers 上更新 (age < 30 && department = 'Tech')
        // 这应该只影响 Alice 和 Bob，不影响 Charlie (他不满足 age < 30)
        await entityQueryHandle.update(
            'TechYoungUsers',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
            { department: 'Sales' }
        );

        // 验证 Alice 的 department 已更新
        const allUsers = await entityQueryHandle.find('User', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        const alice = allUsers.find((u: any) => u.name === 'Alice');
        expect(alice).toBeDefined();
        expect(alice!.department).toBe('Sales');

        // 验证 TechYoungUsers 现在只有 Bob
        const techYoungUsers = await entityQueryHandle.find('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(techYoungUsers).toHaveLength(1);
        expect(techYoungUsers[0].name).toBe('Bob');
    });

    test('delete operations directly on filtered entities', async () => {
        // 创建测试用户
        await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 22,
            isActive: true,
            department: 'Tech'
        });

        await entityQueryHandle.create('User', {
            name: 'Charlie',
            age: 35,
            isActive: true,
            department: 'Tech'  
        });

        // 直接在 TechYoungUsers 上删除 Alice
        // 这应该只能删除满足过滤条件的记录
        await entityQueryHandle.delete(
            'TechYoungUsers',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] })
        );

        // 验证 Alice 已被删除
        const allUsers = await entityQueryHandle.find('User', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(allUsers.map((u: any) => u.name)).not.toContain('Alice');
        expect(allUsers).toHaveLength(2); // Bob 和 Charlie

        // 验证 TechYoungUsers 现在只有 Bob
        const techYoungUsers = await entityQueryHandle.find('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(techYoungUsers).toHaveLength(1);
        expect(techYoungUsers[0].name).toBe('Bob');

        // Charlie 依然存在，因为他不满足 TechYoungUsers 的过滤条件
        const charlie = allUsers.find((u: any) => u.name === 'Charlie');
        expect(charlie).toBeDefined();
    });

    test('filtered entity events are properly emitted on create', async () => {
        const events: any[] = [];

        // 创建一个满足多个 filtered entity 条件的用户
        const user = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        }, events);

        // 验证事件
        expect(events).toHaveLength(4); // 1个 User create + 3个 filtered entity create
        
        // User create 事件
        expect(events[0]).toMatchObject({
            type: 'create',
            recordName: 'User',
            record: expect.objectContaining({
                name: 'Alice',
                age: 20,
                isActive: true,
                department: 'Tech'
            })
        });

        // Filtered entity create 事件
        const filteredEntityEvents = events.slice(1);
        const eventRecordNames = filteredEntityEvents.map(e => e.recordName).sort();
        expect(eventRecordNames).toEqual(['ActiveUsers', 'TechYoungUsers', 'YoungUsers']);
        
        filteredEntityEvents.forEach(event => {
            expect(event.type).toBe('create');
            expect(event.record).toMatchObject({
                id: user.id,
                name: 'Alice',
                age: 20,
                isActive: true,
                department: 'Tech'
            });
        });

        // 检查 __filtered_entities 字段
        const userAfterCreate = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['id', 'name', 'age', 'isActive', 'department', '__filtered_entities']
        );
        expect(userAfterCreate[0].__filtered_entities).toBeDefined();
    });

    test('filtered entity events are properly emitted on update', async () => {
        // 先创建用户
        const user = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: false,
            department: 'Tech'
        });

        // 清空之前的事件，准备记录更新事件
        const updateEvents: any[] = [];

        // 更新用户，使其满足 ActiveUsers 条件
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            { isActive: true },
            updateEvents
        );

        // 验证更新事件
        // 由于 __filtered_entities 在创建时已经初始化，所以只会生成状态变化的事件
        expect(updateEvents).toHaveLength(2); // 1个 User update + 1个 ActiveUsers create
        
        // User update 事件
        expect(updateEvents[0]).toMatchObject({
            type: 'update',
            recordName: 'User',
            record: expect.objectContaining({
                isActive: true
            })
        });

        // ActiveUsers create 事件（因为从 false 变为 true）
        expect(updateEvents[1]).toMatchObject({
            type: 'create',
            recordName: 'ActiveUsers',
            record: expect.objectContaining({
                id: user.id
            })
        });

        // 再次更新，使其不再满足 ActiveUsers 条件
        const updateEvents2: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            { isActive: false },
            updateEvents2
        );

        // 验证事件
        // 应该有一个 update 事件和一个 ActiveUsers delete 事件
        expect(updateEvents2).toHaveLength(2); // 1个 User update + 1个 ActiveUsers delete
        
        expect(updateEvents2[0]).toMatchObject({
            type: 'update',
            recordName: 'User',
            record: expect.objectContaining({
                isActive: false
            })
        });

        // 检查 ActiveUsers delete 事件
        expect(updateEvents2[1]).toMatchObject({
            type: 'delete',
            recordName: 'ActiveUsers',
            record: expect.objectContaining({
                id: user.id
            })
        });
    });

    test('filtered entity events are properly emitted on delete', async () => {
        // 先创建满足多个 filtered entity 条件的用户
        const user = await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        // 清空之前的事件
        const deleteEvents: any[] = [];

        // 删除用户
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            deleteEvents
        );

        // 验证删除事件
        // 由于 __filtered_entities 在创建时已经初始化，删除时会有相应的 filtered entity delete 事件
        expect(deleteEvents).toHaveLength(4); // 3个 filtered entity delete + 1个 User delete
        
        // Filtered entity delete 事件应该在 User delete 之前
        const filteredEntityDeleteEvents = deleteEvents.slice(0, 3);
        const eventRecordNames = filteredEntityDeleteEvents.map(e => e.recordName).sort();
        expect(eventRecordNames).toEqual(['ActiveUsers', 'TechYoungUsers', 'YoungUsers']);
        
        filteredEntityDeleteEvents.forEach(event => {
            expect(event.type).toBe('delete');
            expect(event.record).toMatchObject({
                id: user.id
            });
        });

        // User delete 事件应该在最后
        expect(deleteEvents[3]).toMatchObject({
            type: 'delete',
            recordName: 'User',
            record: expect.objectContaining({
                id: user.id,
                name: 'Alice'
            })
        });
    });

    test('complex filtered entity event scenarios', async () => {
        // 创建一个只满足部分条件的用户
        const user = await entityQueryHandle.create('User', {
            name: 'Bob',
            age: 28,
            isActive: true,
            department: 'Sales'
        });

        // Bob 应该只属于 ActiveUsers（因为 isActive = true）
        // 不属于 YoungUsers（age >= 25）
        // 不属于 TechYoungUsers（department != 'Tech'）

        const updateEvents: any[] = [];
        
        // 更新 department 为 Tech，这样就满足 TechYoungUsers 的所有条件
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            { department: 'Tech' },
            updateEvents
        );

        // 查询用户的当前状态，看看第一次更新后的 __filtered_entities 字段
        const userAfterFirstUpdate = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['id', 'name', 'age', 'department', '__filtered_entities']
        );
        console.log('User after first update:', userAfterFirstUpdate[0]);

        // 由于 __filtered_entities 在创建时已经初始化，第一次更新只会生成状态变化的事件
        // 1个 User update + 1个 TechYoungUsers create（新满足条件）
        console.log('First update events:', updateEvents.map(e => ({ type: e.type, recordName: e.recordName })));
        expect(updateEvents).toHaveLength(2);
        expect(updateEvents[0].type).toBe('update');
        expect(updateEvents[0].recordName).toBe('User');
        
        // 检查 TechYoungUsers create 事件
        expect(updateEvents[1]).toMatchObject({
            type: 'create',
            recordName: 'TechYoungUsers',
            record: expect.objectContaining({
                id: user.id
            })
        });

        // 再更新 age 为 35，这样就不再满足 TechYoungUsers 条件
        const updateEvents2: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            { age: 35 },
            updateEvents2
        );

        // 第二次更新时，应该有一个 update 事件和一个 TechYoungUsers delete 事件
        console.log('Second update events:', updateEvents2.map(e => ({ type: e.type, recordName: e.recordName })));
        
        // 查询用户的当前状态，看看 __filtered_entities 字段
        const currentUser = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['id', 'name', 'age', 'department', '__filtered_entities']
        );
        console.log('Current user after second update:', currentUser[0]);
        
        expect(updateEvents2).toHaveLength(2);
        expect(updateEvents2[0].type).toBe('update');
        expect(updateEvents2[0].recordName).toBe('User');
        
        // 第二个事件应该是 TechYoungUsers 的 delete 事件
        expect(updateEvents2[1]).toMatchObject({
            type: 'delete',
            recordName: 'TechYoungUsers',
            record: expect.objectContaining({
                id: user.id
            })
        });
    });

    test('debug filtered entity initialization', async () => {
        // 创建一个满足所有 filtered entity 条件的用户
        const user = await entityQueryHandle.create('User', {
            name: 'Test',
            age: 20,
            isActive: true,
            department: 'Tech'
        });

        // 查询用户，检查 __filtered_entities 字段
        const users1 = await entityQueryHandle.find('User', 
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['id', 'name', '__filtered_entities']
        );
        console.log('After create, __filtered_entities:', users1[0].__filtered_entities);

        // 执行一次更新
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            { name: 'Test Updated' }
        );

        // 再次查询用户，检查 __filtered_entities 字段
        const users2 = await entityQueryHandle.find('User', 
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['id', 'name', '__filtered_entities']
        );
        console.log('After update, __filtered_entities:', users2[0].__filtered_entities);

        // 验证 __filtered_entities 字段已被初始化
        expect(users2[0].__filtered_entities).toBeDefined();
        // 字段可能已经被解析为对象，所以直接使用
        const flags = typeof users2[0].__filtered_entities === 'string' 
            ? JSON.parse(users2[0].__filtered_entities) 
            : users2[0].__filtered_entities;
        expect(flags.ActiveUsers).toBe(true);
        expect(flags.YoungUsers).toBe(true);
        expect(flags.TechYoungUsers).toBe(true);
    });
}); 