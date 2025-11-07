import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@shared';
import TestLogger from "./testLogger.js";
import { PGLiteDB } from '@dbclients';

describe('filtered entity with cross-entity queries', () => {
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
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'role', type: 'string' })
            ]
        });

        const teamEntity = Entity.create({
            name: 'Team',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'type', type: 'string' })
            ]
        });

        const projectEntity = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'status', type: 'string' })
            ]
        });

        // 新增更多 x:1 关系的实体
        const departmentEntity = Entity.create({
            name: 'Department',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'budget', type: 'number' }),
                Property.create({ name: 'region', type: 'string' })
            ]
        });

        const divisionEntity = Entity.create({
            name: 'Division',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'headcount', type: 'number' })
            ]
        });

        const companyEntity = Entity.create({
            name: 'Company',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'industry', type: 'string' }),
                Property.create({ name: 'isPublic', type: 'boolean' })
            ]
        });

        // 创建关系
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        });

        const teamProjectRelation = Relation.create({
            source: teamEntity,
            sourceProperty: 'projects',
            target: projectEntity,
            targetProperty: 'team',
            type: '1:n'
        });

        // 新增 x:1 关系
        const teamDepartmentRelation = Relation.create({
            source: teamEntity,
            sourceProperty: 'department',
            target: departmentEntity,
            targetProperty: 'teams',
            type: 'n:1'
        });

        const departmentDivisionRelation = Relation.create({
            source: departmentEntity,
            sourceProperty: 'division',
            target: divisionEntity,
            targetProperty: 'departments',
            type: 'n:1'
        });

        const divisionCompanyRelation = Relation.create({
            source: divisionEntity,
            sourceProperty: 'company',
            target: companyEntity,
            targetProperty: 'divisions',
            type: 'n:1'
        });

        // 创建 filtered entity - 基于关联实体的属性
        const activeUsersEntity = Entity.create({
            name: 'ActiveUsersInTechTeam',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            }).and({
                key: 'team.type',
                value: ['=', 'tech']
            })
        });

        // This entity is removed because it uses x:n relation in path
        // const usersInActiveProjectsEntity = Entity.create({
        //     name: 'UsersInActiveProjects',
        //     baseEntity: userEntity,
        //     matchExpression: MatchExp.atom({
        //         key: 'team.projects.status',
        //         value: ['=', 'active']
        //     })
        // });

        const adminUsersInTechTeamEntity = Entity.create({
            name: 'AdminUsersInTechTeam',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['=', 'admin']
            }).and({
                key: 'team.type',
                value: ['=', 'tech']
            })
        });

        // 新增多层 x:1 的 filtered entities
        const usersInHighBudgetDepartmentsEntity = Entity.create({
            name: 'UsersInHighBudgetDepartments',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'team.department.budget',
                value: ['>', 1000000]
            })
        });

        const usersInAsianRegionEntity = Entity.create({
            name: 'UsersInAsianRegion',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'team.department.region',
                value: ['=', 'Asia']
            })
        });

        const usersInLargeDivisionsEntity = Entity.create({
            name: 'UsersInLargeDivisions',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'team.department.division.headcount',
                value: ['>', 500]
            })
        });

        const usersInTechCompaniesEntity = Entity.create({
            name: 'UsersInTechCompanies',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'team.department.division.company.industry',
                value: ['=', 'Technology']
            })
        });

        const activeUsersInPublicCompaniesEntity = Entity.create({
            name: 'ActiveUsersInPublicCompanies',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            }).and({
                key: 'team.department.division.company.isPublic',
                value: ['=', true]
            })
        });

        const entities = [
            userEntity, teamEntity, projectEntity, departmentEntity, divisionEntity, companyEntity,
            activeUsersEntity, adminUsersInTechTeamEntity,
            usersInHighBudgetDepartmentsEntity, usersInAsianRegionEntity,
            usersInLargeDivisionsEntity, usersInTechCompaniesEntity,
            activeUsersInPublicCompaniesEntity
        ];
        const relations = [
            userTeamRelation, teamProjectRelation,
            teamDepartmentRelation, departmentDivisionRelation, divisionCompanyRelation
        ];

        logger = new TestLogger('', true);
        
        // 使用 PGLite
        db = new PGLiteDB(undefined, {logger});
        await db.open();

        setup = new DBSetup(entities, relations, db);
        await setup.createTables();
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });

    afterEach(async () => {
        await db.close();
    });

    test('should filter entities based on related entity properties', async () => {
        // 创建团队
        const techTeam = await entityQueryHandle.create('Team', {
            name: 'Engineering',
            type: 'tech'
        });

        const salesTeam = await entityQueryHandle.create('Team', {
            name: 'Sales',
            type: 'sales'
        });

        // 创建用户
        const user1 = await entityQueryHandle.create('User', {
            name: 'Alice',
            isActive: true,
            role: 'admin',
            team: techTeam
        });

        const user2 = await entityQueryHandle.create('User', {
            name: 'Bob',
            isActive: true,
            role: 'user',
            team: salesTeam
        });

        const user3 = await entityQueryHandle.create('User', {
            name: 'Charlie',
            isActive: false,
            role: 'admin',
            team: techTeam
        });

        // 查询 ActiveUsersInTechTeam
        const activeUsersInTech = await entityQueryHandle.find('ActiveUsersInTechTeam', undefined, undefined, ['name', 'isActive', 'role']);
        expect(activeUsersInTech).toHaveLength(1);
        expect(activeUsersInTech[0].name).toBe('Alice');

        // 测试 source entity update - 将 Alice 设为 inactive
        const events: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            { isActive: false },
            events
        );

        // 验证 Alice 不再在 ActiveUsersInTechTeam 中
        const afterUpdate = await entityQueryHandle.find('ActiveUsersInTechTeam', undefined, undefined, ['name']);
        expect(afterUpdate).toHaveLength(0);

        // 验证删除事件
        const deleteEvents = events.filter(e => e.type === 'delete' && e.recordName === 'ActiveUsersInTechTeam');
        expect(deleteEvents).toHaveLength(1);

        // 测试 source entity delete - 删除 Charlie
        events.length = 0;
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', user3.id] }),
            events
        );

        // 查询 AdminUsersInTechTeam，确认 Charlie 被删除
        const adminUsers = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name']);
        const charlieInAdmins = adminUsers.find(u => u.name === 'Charlie');
        expect(charlieInAdmins).toBeUndefined();
    });

    test('should update filtered entity when related entity changes', async () => {
        const events: any[] = [];

        // 创建团队
        const team = await entityQueryHandle.create('Team', {
            name: 'Development',
            type: 'sales'  // 初始不是 tech
        });

        // 创建活跃用户
        const user = await entityQueryHandle.create('User', {
            name: 'David',
            isActive: true,
            role: 'admin',
            team: team
        }, events);

        // 初始时不应该在 ActiveUsersInTechTeam 中
        let activeUsersInTech = await entityQueryHandle.find('ActiveUsersInTechTeam', undefined, undefined, ['name']);
        expect(activeUsersInTech).toHaveLength(0);

        // 清空事件
        events.length = 0;

        // 更新团队类型为 tech
        await entityQueryHandle.update('Team', 
            MatchExp.atom({ key: 'id', value: ['=', team.id] }),
            { type: 'tech' },
            events
        );

        // 现在用户应该在 ActiveUsersInTechTeam 中
        activeUsersInTech = await entityQueryHandle.find('ActiveUsersInTechTeam', undefined, undefined, ['name']);
        expect(activeUsersInTech).toHaveLength(1);
        expect(activeUsersInTech[0].name).toBe('David');

        // 检查生成的事件
        const createEvents = events.filter(e => e.type === 'create' && e.recordName === 'ActiveUsersInTechTeam');
        expect(createEvents).toHaveLength(1);
    });

    test('should handle multi-level relationship filtering', async () => {
        // Create a valid filtered entity that doesn't use x:n relations
        const techTeam = await entityQueryHandle.create('Team', {
            name: 'Tech Team',
            type: 'tech'
        });

        const salesTeam = await entityQueryHandle.create('Team', {
            name: 'Sales Team',
            type: 'sales'
        });

        // Create users
        const alice = await entityQueryHandle.create('User', {
            name: 'Alice',
            isActive: true,
            role: 'admin',
            team: techTeam
        });

        const bob = await entityQueryHandle.create('User', {
            name: 'Bob',
            isActive: true,
            role: 'user',
            team: techTeam
        });

        const charlie = await entityQueryHandle.create('User', {
            name: 'Charlie',
            isActive: false,
            role: 'admin',
            team: salesTeam
        });

        // Query AdminUsersInTechTeam
        const adminUsersInTech = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name', 'role']);
        expect(adminUsersInTech).toHaveLength(1);
        expect(adminUsersInTech[0].name).toBe('Alice');

        // Query ActiveUsersInTechTeam
        const activeUsersInTech = await entityQueryHandle.find('ActiveUsersInTechTeam', undefined, undefined, ['name']);
        expect(activeUsersInTech).toHaveLength(2);
        expect(activeUsersInTech.map(u => u.name).sort()).toEqual(['Alice', 'Bob']);

        // 测试 source entity update - 将 Bob 的角色改为 admin
        const events: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', bob.id] }),
            { role: 'admin' },
            events
        );

        // 现在 AdminUsersInTechTeam 应该有两个用户
        const updatedAdminUsers = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name']);
        expect(updatedAdminUsers).toHaveLength(2);
        expect(updatedAdminUsers.map(u => u.name).sort()).toEqual(['Alice', 'Bob']);

        // 测试 source entity delete - 删除 Alice
        events.length = 0;
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', alice.id] }),
            events
        );

        // 验证 filtered entities 都被更新
        const afterDelete = await entityQueryHandle.find('ActiveUsersInTechTeam', undefined, undefined, ['name']);
        expect(afterDelete).toHaveLength(1);
        expect(afterDelete[0].name).toBe('Bob');

        const adminAfterDelete = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name']);
        expect(adminAfterDelete).toHaveLength(1);
        expect(adminAfterDelete[0].name).toBe('Bob');
    });

    test('should handle complex filter conditions with multiple cross-entity checks', async () => {
        const events: any[] = [];

        // 创建团队
        const techTeam = await entityQueryHandle.create('Team', {
            name: 'Tech Team',
            type: 'tech'
        });

        const salesTeam = await entityQueryHandle.create('Team', {
            name: 'Sales Team',
            type: 'sales'
        });

        // 创建用户
        const adminInTech = await entityQueryHandle.create('User', {
            name: 'Grace',
            isActive: true,
            role: 'admin',
            team: techTeam
        }, events);

        const userInTech = await entityQueryHandle.create('User', {
            name: 'Henry',
            isActive: true,
            role: 'user',
            team: techTeam
        }, events);

        const adminInSales = await entityQueryHandle.create('User', {
            name: 'Iris',
            isActive: true,
            role: 'admin',
            team: salesTeam
        }, events);

        // 查询 AdminUsersInTechTeam
        const adminUsersInTech = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name', 'role']);
        expect(adminUsersInTech).toHaveLength(1);
        expect(adminUsersInTech[0].name).toBe('Grace');

        // 清空事件
        events.length = 0;

        // 更新 Henry 的角色为 admin
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', userInTech.id] }),
            { role: 'admin' },
            events
        );

        // 现在应该有两个 admin users in tech team
        const updatedAdminUsersInTech = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name']);
        expect(updatedAdminUsersInTech).toHaveLength(2);
        expect(updatedAdminUsersInTech.map(u => u.name).sort()).toEqual(['Grace', 'Henry']);

        // 检查事件
        const createEvents = events.filter(e => e.type === 'create' && e.recordName === 'AdminUsersInTechTeam');
        expect(createEvents).toHaveLength(1);
    });

    test('should remove from filtered entity when related entity no longer matches', async () => {
        const events: any[] = [];

        // 创建 tech 团队
        const techTeam = await entityQueryHandle.create('Team', {
            name: 'Tech Team',
            type: 'tech'
        });

        // 创建活跃的管理员用户
        const user = await entityQueryHandle.create('User', {
            name: 'Jack',
            isActive: true,
            role: 'admin',
            team: techTeam
        }, events);

        // 验证用户在 filtered entity 中
        let result = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name']);
        expect(result).toHaveLength(1);

        // 清空事件
        events.length = 0;

        // 更改团队类型
        await entityQueryHandle.update('Team',
            MatchExp.atom({ key: 'id', value: ['=', techTeam.id] }),
            { type: 'sales' },
            events
        );

        // 用户不应该再在 filtered entity 中
        result = await entityQueryHandle.find('AdminUsersInTechTeam', undefined, undefined, ['name']);
        expect(result).toHaveLength(0);

        // 检查删除事件
        const deleteEvents = events.filter(e => e.type === 'delete' && e.recordName === 'AdminUsersInTechTeam');
        expect(deleteEvents).toHaveLength(1);
    });

    test('should filter entities based on two-level x:1 relationships', async () => {
        // 创建部门
        const engineeringDept = await entityQueryHandle.create('Department', {
            name: 'Engineering Department',
            budget: 2000000,
            region: 'Asia'
        });

        const salesDept = await entityQueryHandle.create('Department', {
            name: 'Sales Department',
            budget: 500000,
            region: 'Europe'
        });

        // 创建团队
        const devTeam = await entityQueryHandle.create('Team', {
            name: 'Development Team',
            type: 'tech',
            department: engineeringDept
        });

        const salesTeam = await entityQueryHandle.create('Team', {
            name: 'Sales Team',
            type: 'sales',
            department: salesDept
        });

        // 创建用户
        const alice = await entityQueryHandle.create('User', {
            name: 'Alice',
            isActive: true,
            role: 'developer',
            team: devTeam
        });

        const bob = await entityQueryHandle.create('User', {
            name: 'Bob',
            isActive: true,
            role: 'developer',
            team: salesTeam
        });

        // 查询在高预算部门的用户
        const usersInHighBudget = await entityQueryHandle.find('UsersInHighBudgetDepartments', undefined, undefined, ['name', 'role']);
        expect(usersInHighBudget).toHaveLength(1);
        expect(usersInHighBudget[0].name).toBe('Alice');

        // 查询在亚洲区域的用户
        const usersInAsia = await entityQueryHandle.find('UsersInAsianRegion', undefined, undefined, ['name']);
        expect(usersInAsia).toHaveLength(1);
        expect(usersInAsia[0].name).toBe('Alice');

        // 测试 source entity update - 将 Bob 转到 dev team
        const events: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', bob.id] }),
            { team: devTeam },
            events
        );

        // 现在两个用户都应该在高预算部门和亚洲区域
        const updatedHighBudget = await entityQueryHandle.find('UsersInHighBudgetDepartments', undefined, undefined, ['name']);
        expect(updatedHighBudget).toHaveLength(2);
        expect(updatedHighBudget.map(u => u.name).sort()).toEqual(['Alice', 'Bob']);

        const updatedAsia = await entityQueryHandle.find('UsersInAsianRegion', undefined, undefined, ['name']);
        expect(updatedAsia).toHaveLength(2);
        expect(updatedAsia.map(u => u.name).sort()).toEqual(['Alice', 'Bob']);

        // 测试相关实体 update - 降低工程部门预算
        events.length = 0;
        await entityQueryHandle.update('Department',
            MatchExp.atom({ key: 'id', value: ['=', engineeringDept.id] }),
            { budget: 800000 },
            events
        );

        // 现在没有用户在高预算部门
        const afterBudgetCut = await entityQueryHandle.find('UsersInHighBudgetDepartments', undefined, undefined, ['name']);
        expect(afterBudgetCut).toHaveLength(0);

        // 测试 source entity delete - 删除 Alice
        events.length = 0;
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', alice.id] }),
            events
        );

        // 验证 Alice 从所有 filtered entities 中移除
        const afterDelete = await entityQueryHandle.find('UsersInAsianRegion', undefined, undefined, ['name']);
        expect(afterDelete).toHaveLength(1);
        expect(afterDelete[0].name).toBe('Bob');
    });

    test('should filter entities based on three-level x:1 relationships', async () => {
        // 创建部门
        const techDivision = await entityQueryHandle.create('Division', {
            name: 'Technology Division',
            headcount: 1000
        });

        const adminDivision = await entityQueryHandle.create('Division', {
            name: 'Admin Division',
            headcount: 200
        });

        // 创建部门
        const engineeringDept = await entityQueryHandle.create('Department', {
            name: 'Engineering',
            budget: 3000000,
            region: 'Asia',
            division: techDivision
        });

        const hrDept = await entityQueryHandle.create('Department', {
            name: 'HR',
            budget: 800000,
            region: 'Global',
            division: adminDivision
        });

        // 创建团队
        const devTeam = await entityQueryHandle.create('Team', {
            name: 'Dev Team',
            type: 'tech',
            department: engineeringDept
        });

        const hrTeam = await entityQueryHandle.create('Team', {
            name: 'HR Team',
            type: 'admin',
            department: hrDept
        });

        // 创建用户
        const alice = await entityQueryHandle.create('User', {
            name: 'Alice',
            isActive: true,
            role: 'developer',
            team: devTeam
        });

        const bob = await entityQueryHandle.create('User', {
            name: 'Bob',
            isActive: true,
            role: 'hr',
            team: hrTeam
        });

        // 查询在大型部门的用户
        const usersInLargeDivisions = await entityQueryHandle.find('UsersInLargeDivisions', undefined, undefined, ['name']);
        expect(usersInLargeDivisions).toHaveLength(1);
        expect(usersInLargeDivisions[0].name).toBe('Alice');

        // 测试 source entity update - 将 Bob 转到 dev team
        const events: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', bob.id] }),
            { team: devTeam },
            events
        );

        // 现在两个用户都在大型部门
        const updated = await entityQueryHandle.find('UsersInLargeDivisions', undefined, undefined, ['name']);
        expect(updated).toHaveLength(2);
        expect(updated.map(u => u.name).sort()).toEqual(['Alice', 'Bob']);

        // 测试相关实体 update - 减少 tech division 的人数
        events.length = 0;
        await entityQueryHandle.update('Division',
            MatchExp.atom({ key: 'id', value: ['=', techDivision.id] }),
            { headcount: 400 },
            events
        );

        // 现在没有用户在大型部门
        const afterReduction = await entityQueryHandle.find('UsersInLargeDivisions', undefined, undefined, ['name']);
        expect(afterReduction).toHaveLength(0);

        // 测试 source entity delete - 删除所有用户
        events.length = 0;
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', alice.id] }),
            events
        );
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', bob.id] }),
            events
        );

        // 验证没有用户在 filtered entity 中
        const afterDelete = await entityQueryHandle.find('UsersInLargeDivisions', undefined, undefined, ['name']);
        expect(afterDelete).toHaveLength(0);
    });

    test('should filter entities based on four-level x:1 relationships', async () => {
        // 创建公司
        const techCompany = await entityQueryHandle.create('Company', {
            name: 'TechCorp',
            industry: 'Technology',
            isPublic: true
        });

        const financeCompany = await entityQueryHandle.create('Company', {
            name: 'FinanceCorp',
            industry: 'Finance',
            isPublic: false
        });

        // 创建部门
        const techDivision = await entityQueryHandle.create('Division', {
            name: 'Tech Division',
            headcount: 1500,
            company: techCompany
        });

        const financeDivision = await entityQueryHandle.create('Division', {
            name: 'Finance Division',
            headcount: 300,
            company: financeCompany
        });

        // 创建部门
        const engineeringDept = await entityQueryHandle.create('Department', {
            name: 'Engineering',
            budget: 5000000,
            region: 'Global',
            division: techDivision
        });

        const accountingDept = await entityQueryHandle.create('Department', {
            name: 'Accounting',
            budget: 1000000,
            region: 'Local',
            division: financeDivision
        });

        // 创建团队
        const devTeam = await entityQueryHandle.create('Team', {
            name: 'Dev Team',
            type: 'tech',
            department: engineeringDept
        });

        const accountingTeam = await entityQueryHandle.create('Team', {
            name: 'Accounting Team',
            type: 'finance',
            department: accountingDept
        });

        // 创建用户
        const alice = await entityQueryHandle.create('User', {
            name: 'Alice',
            isActive: true,
            role: 'developer',
            team: devTeam
        });

        const bob = await entityQueryHandle.create('User', {
            name: 'Bob',
            isActive: false,
            role: 'accountant',
            team: accountingTeam
        });

        const charlie = await entityQueryHandle.create('User', {
            name: 'Charlie',
            isActive: true,
            role: 'developer',
            team: accountingTeam
        });

        // 查询在科技公司的用户
        const usersInTech = await entityQueryHandle.find('UsersInTechCompanies', undefined, undefined, ['name']);
        expect(usersInTech).toHaveLength(1);
        expect(usersInTech[0].name).toBe('Alice');

        // 查询在上市公司的活跃用户
        const activeUsersInPublic = await entityQueryHandle.find('ActiveUsersInPublicCompanies', undefined, undefined, ['name', 'isActive']);
        expect(activeUsersInPublic).toHaveLength(1);
        expect(activeUsersInPublic[0].name).toBe('Alice');
        expect(activeUsersInPublic[0].isActive).toBe(true);

        // 测试 source entity update - 激活 Bob
        const events: any[] = [];
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', bob.id] }),
            { isActive: true },
            events
        );

        // Bob 仍然不在上市公司中（因为 FinanceCorp 不是上市公司）
        const afterBobActive = await entityQueryHandle.find('ActiveUsersInPublicCompanies', undefined, undefined, ['name']);
        expect(afterBobActive).toHaveLength(1);
        expect(afterBobActive[0].name).toBe('Alice');

        // 测试相关实体 update - 将 FinanceCorp 改为科技行业
        events.length = 0;
        await entityQueryHandle.update('Company',
            MatchExp.atom({ key: 'id', value: ['=', financeCompany.id] }),
            { industry: 'Technology' },
            events
        );

        // 现在 Bob 和 Charlie 也在科技公司用户中
        const techAfterUpdate = await entityQueryHandle.find('UsersInTechCompanies', undefined, undefined, ['name']);
        expect(techAfterUpdate).toHaveLength(3);
        expect(techAfterUpdate.map(u => u.name).sort()).toEqual(['Alice', 'Bob', 'Charlie']);

        // 测试 source entity delete - 删除 Alice
        events.length = 0;
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', alice.id] }),
            events
        );

        // 验证 Alice 从所有 filtered entities 中移除
        const techAfterDelete = await entityQueryHandle.find('UsersInTechCompanies', undefined, undefined, ['name']);
        expect(techAfterDelete).toHaveLength(2);
        expect(techAfterDelete.map(u => u.name).sort()).toEqual(['Bob', 'Charlie']);

        const publicAfterDelete = await entityQueryHandle.find('ActiveUsersInPublicCompanies', undefined, undefined, ['name']);
        expect(publicAfterDelete).toHaveLength(0);

        // 测试多个 source entity delete
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', bob.id] })
        );
        await entityQueryHandle.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', charlie.id] })
        );

        // 验证所有 filtered entities 都为空
        const finalTech = await entityQueryHandle.find('UsersInTechCompanies', undefined, undefined, ['name']);
        expect(finalTech).toHaveLength(0);
    });

    test('should update filtered entities when multi-level related entities change', async () => {
        const events: any[] = [];

        // 创建公司和部门结构
        const company = await entityQueryHandle.create('Company', {
            name: 'GlobalCorp',
            industry: 'Retail',
            isPublic: false
        });

        const division = await entityQueryHandle.create('Division', {
            name: 'Operations',
            headcount: 800,
            company: company
        });

        const department = await entityQueryHandle.create('Department', {
            name: 'Operations Dept',
            budget: 2500000,
            region: 'Europe',
            division: division
        });

        const team = await entityQueryHandle.create('Team', {
            name: 'Ops Team',
            type: 'operations',
            department: department
        });

        const user = await entityQueryHandle.create('User', {
            name: 'David',
            isActive: true,
            role: 'operator',
            team: team
        }, events);

        // 初始时用户不在科技公司
        let usersInTech = await entityQueryHandle.find('UsersInTechCompanies', undefined, undefined, ['name']);
        expect(usersInTech).toHaveLength(0);

        // 初始时用户不在上市公司
        let activeUsersInPublic = await entityQueryHandle.find('ActiveUsersInPublicCompanies', undefined, undefined, ['name']);
        expect(activeUsersInPublic).toHaveLength(0);

        // 清空事件
        events.length = 0;

        // 更新公司为科技行业
        await entityQueryHandle.update('Company',
            MatchExp.atom({ key: 'id', value: ['=', company.id] }),
            { industry: 'Technology' },
            events
        );

        // 现在用户应该在科技公司中
        usersInTech = await entityQueryHandle.find('UsersInTechCompanies', undefined, undefined, ['name']);
        expect(usersInTech).toHaveLength(1);
        expect(usersInTech[0].name).toBe('David');

        // 清空事件
        events.length = 0;

        // 更新公司为上市公司
        await entityQueryHandle.update('Company',
            MatchExp.atom({ key: 'id', value: ['=', company.id] }),
            { isPublic: true },
            events
        );

        // 现在用户应该在上市公司中
        activeUsersInPublic = await entityQueryHandle.find('ActiveUsersInPublicCompanies', undefined, undefined, ['name']);
        expect(activeUsersInPublic).toHaveLength(1);
        expect(activeUsersInPublic[0].name).toBe('David');
    });
}); 

// Add a new test suite for validation
describe('filtered entity validation', () => {
    let db: PGLiteDB;

    beforeEach(async () => {
        db = new PGLiteDB(undefined, {logger: new TestLogger('', true)});
        await db.open();
    });

    afterEach(async () => {
        await db.close();
    });

    test('should throw error when creating filtered entity with x:n relation in path', async () => {
        // Create test entities
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const teamEntity = Entity.create({
            name: 'Team', 
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const projectEntity = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'status', type: 'string' })
            ]
        });

        // Create relations
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        });

        const teamProjectRelation = Relation.create({
            source: teamEntity,
            sourceProperty: 'projects',
            target: projectEntity,
            targetProperty: 'team',
            type: '1:n'  // This is x:n relation
        });

        // Try to create filtered entity with x:n relation in path
        const invalidFilteredEntity = Entity.create({
            name: 'InvalidFilteredEntity',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'team.projects.status',  // This path contains 1:n relation
                value: ['=', 'active']
            })
        });

        const entities = [userEntity, teamEntity, projectEntity, invalidFilteredEntity];
        const relations = [userTeamRelation, teamProjectRelation];

        // Attempt to create DBSetup should throw error
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/Filtered entity 'InvalidFilteredEntity' contains an invalid path.*The relation 'Team.projects' is a 1:n relation/);
    });

    test('should allow filtered entity with only x:1 relations in path', async () => {
        // Create test entities
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const teamEntity = Entity.create({
            name: 'Team',
            properties: [
                Property.create({ name: 'type', type: 'string' })
            ]
        });

        const departmentEntity = Entity.create({
            name: 'Department',
            properties: [
                Property.create({ name: 'budget', type: 'number' })
            ]
        });

        // Create relations - all n:1
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        });

        const teamDepartmentRelation = Relation.create({
            source: teamEntity,
            sourceProperty: 'department',
            target: departmentEntity,
            targetProperty: 'teams',
            type: 'n:1'
        });

        // Create filtered entity with valid path (only x:1 relations)
        const validFilteredEntity = Entity.create({
            name: 'UsersInHighBudgetDepartments',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({
                key: 'team.department.budget',
                value: ['>', 100000]
            })
        });

        const entities = [userEntity, teamEntity, departmentEntity, validFilteredEntity];
        const relations = [userTeamRelation, teamDepartmentRelation];

        // This should not throw error
        expect(() => {
            new DBSetup(entities, relations, db);
        }).not.toThrow();
    });
}); 