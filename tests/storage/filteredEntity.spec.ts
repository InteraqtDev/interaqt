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
        const activeUsers = await entityQueryHandle.findForFilteredEntity('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(2);
        expect(activeUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);

        // 测试 YoungUsers filtered entity
        const youngUsers = await entityQueryHandle.findForFilteredEntity('YoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(youngUsers).toHaveLength(2);
        expect(youngUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);

        // 测试 TechYoungUsers filtered entity (复杂条件)
        const techYoungUsers = await entityQueryHandle.findForFilteredEntity('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
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
        let activeUsers = await entityQueryHandle.findForFilteredEntity('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(1);
        expect(activeUsers[0].name).toBe('Alice');

        // 更新 Bob 为 active
        await entityQueryHandle.update('User', 
            MatchExp.atom({ key: 'name', value: ['=', 'Bob'] }),
            { isActive: true }
        );

        // 现在应该有两个 active users
        activeUsers = await entityQueryHandle.findForFilteredEntity('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(activeUsers).toHaveLength(2);
        expect(activeUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob']);

        // 更新 Alice 为 inactive
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
            { isActive: false }
        );

        // 现在应该只有 Bob
        activeUsers = await entityQueryHandle.findForFilteredEntity('ActiveUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
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
        let youngUsers = await entityQueryHandle.findForFilteredEntity('YoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(youngUsers).toHaveLength(1); // 只有 Alice (age < 25)
        expect(youngUsers[0].name).toBe('Alice');

        let techYoungUsers = await entityQueryHandle.findForFilteredEntity('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(techYoungUsers).toHaveLength(2); // Alice 和 Bob 都在 Tech 且 age < 30

        // 删除 Alice
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'name', value: ['=', 'Alice'] })
        );

        // YoungUsers 应该为空
        youngUsers = await entityQueryHandle.findForFilteredEntity('YoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
        expect(youngUsers).toHaveLength(0);

        // TechYoungUsers 应该只有 Bob
        techYoungUsers = await entityQueryHandle.findForFilteredEntity('TechYoungUsers', undefined, undefined, ['name', 'age', 'isActive', 'department']);
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
        const techActiveUsers = await entityQueryHandle.findForFilteredEntity(
            'ActiveUsers',
            MatchExp.atom({ key: 'department', value: ['=', 'Tech'] }),
            undefined,
            ['name', 'age', 'isActive', 'department']
        );

        expect(techActiveUsers).toHaveLength(2);
        expect(techActiveUsers.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);

        // 在 YoungUsers 中查找 age > 21 的用户
        const olderYoungUsers = await entityQueryHandle.findForFilteredEntity(
            'YoungUsers',
            MatchExp.atom({ key: 'age', value: ['>', 21] }),
            undefined,
            ['name', 'age', 'isActive', 'department']
        );

        expect(olderYoungUsers).toHaveLength(2);
        expect(olderYoungUsers.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie']);
    });
}); 