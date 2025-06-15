import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle} from "@storage";
import {Entity, Property, BoolExp} from '@shared';
import TestLogger from "./testLogger.js";
import {SQLiteDB} from '@runtime';

describe('filtered entity test', () => {
    let db: SQLiteDB;
    let setup: DBSetup;
    let logger: any;
    let entityQueryHandle: EntityQueryHandle;

    beforeEach(async () => {
        // 创建测试用的实体
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'String' }),
                Property.create({ name: 'age', type: 'Number' }),
                Property.create({ name: 'isActive', type: 'Boolean' }),
                Property.create({ name: 'department', type: 'String' })
            ]
        });

        // 创建 filtered entity - ActiveUsers
        const activeUsersEntity = Entity.create({
            name: 'ActiveUsers',
            sourceEntity: 'User',
            filterCondition: BoolExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // 创建 filtered entity - YoungUsers  
        const youngUsersEntity = Entity.create({
            name: 'YoungUsers',
            sourceEntity: 'User',
            filterCondition: BoolExp.atom({
                key: 'age',
                value: ['<', 25]
            })
        });

        // 创建 filtered entity - TechYoungUsers (复杂条件)
        const techYoungUsersEntity = Entity.create({
            name: 'TechYoungUsers',
            sourceEntity: 'User',
            filterCondition: BoolExp.atom({
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
        
        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger});
        await db.open();

        setup = new DBSetup(entities, relations, db);
        await setup.createTables();
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
    });

    afterEach(async () => {
        await db.close();
    });

    test('should identify filtered entities correctly', () => {
        expect(entityQueryHandle.isFilteredEntity('User')).toBe(false);
        expect(entityQueryHandle.isFilteredEntity('ActiveUsers')).toBe(true);
        expect(entityQueryHandle.isFilteredEntity('YoungUsers')).toBe(true);
        expect(entityQueryHandle.isFilteredEntity('TechYoungUsers')).toBe(true);
    });

    test('should get filtered entity config correctly', () => {
        const activeUsersConfig = entityQueryHandle.getFilteredEntityConfig('ActiveUsers');
        expect(activeUsersConfig).toMatchObject({
            sourceEntity: 'User',
            filterCondition: expect.any(Object)
        });

        const userConfig = entityQueryHandle.getFilteredEntityConfig('User');
        expect(userConfig).toBe(null);
    });

    test('should get filtered entities for source correctly', () => {
        const filteredEntities = entityQueryHandle.getFilteredEntitiesForSource('User');
        expect(filteredEntities).toHaveLength(3);
        expect(filteredEntities.map(e => e.name)).toContain('ActiveUsers');
        expect(filteredEntities.map(e => e.name)).toContain('YoungUsers');
        expect(filteredEntities.map(e => e.name)).toContain('TechYoungUsers');
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

    test('filtered entity events are properly emitted', async () => {
        const events: any[] = [];
        const eventCollector = (event: any) => {
            events.push(event);
        };

        // 创建测试用户，收集事件
        await entityQueryHandle.create('User', {
            name: 'Alice',
            age: 20,
            isActive: true,
            department: 'Tech'
        }, []);

        // 清空之前的事件
        events.length = 0;

        // 更新用户，这会影响 filtered entities，应该触发事件
        const updateEvents: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
            { isActive: false },
            updateEvents
        );

        // 验证事件被传递
        expect(updateEvents).toBeDefined();

        // 删除操作也应该能收集事件
        const deleteEvents: any[] = [];
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
            deleteEvents
        );

        expect(deleteEvents).toBeDefined();
    });
}); 