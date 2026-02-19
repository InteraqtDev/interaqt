import { describe, it, expect } from 'vitest';
import { Entity, Relation, Property } from '@core';
import { DBSetup } from '@storage';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';

describe('Filtered Entity Relation Property Name Conflict', () => {
    it('should throw error when filtered entity uses same sourceProperty as base entity', () => {
        const db = new PGLiteDB();

        // 定义 base entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        });

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        // User 上定义了 own 属性
        const UserProjectRelation = Relation.create({
            source: User,
            sourceProperty: 'own',  // 在 User 上定义了 'own' 属性
            target: Project,
            targetProperty: 'owner',
            type: 'n:1'
        });

        // 创建 filtered entity
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // 尝试在 filtered entity 上定义同名属性 'own'
        const ActiveUserProjectRelation = Relation.create({
            source: ActiveUser,
            sourceProperty: 'own',  // 冲突！base entity 已经有这个属性了
            target: Project,
            targetProperty: 'activeOwner',
            type: 'n:1'
        });

        const entities = [User, Project, ActiveUser];
        const relations = [UserProjectRelation, ActiveUserProjectRelation];

        // 应该抛出错误
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/Relation property name conflict.*ActiveUser.*sourceProperty.*own/);
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/already defined on base entity.*User/);
    });

    it('should throw error when filtered entity uses same targetProperty as base entity', () => {
        const db = new PGLiteDB();

        // 定义 base entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        });

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        // User 上定义了 projects 作为 targetProperty
        const ProjectUserRelation = Relation.create({
            source: Project,
            sourceProperty: 'owner',
            target: User,
            targetProperty: 'projects',  // 在 User 上定义了 'projects' 属性
            type: '1:n'
        });

        // 创建 filtered entity
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // 尝试在 filtered entity 上定义同名属性 'projects'
        const ProjectActiveUserRelation = Relation.create({
            source: Project,
            sourceProperty: 'activeOwner',
            target: ActiveUser,
            targetProperty: 'projects',  // 冲突！base entity 已经有这个属性了
            type: '1:n'
        });

        const entities = [User, Project, ActiveUser];
        const relations = [ProjectUserRelation, ProjectActiveUserRelation];

        // 应该抛出错误
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/Relation property name conflict.*ActiveUser.*targetProperty.*projects/);
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/already defined on base entity.*User/);
    });

    it('should throw error when multi-level filtered entity conflicts with any base entity', () => {
        const db = new PGLiteDB();

        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'age', type: 'number' })
            ]
        });

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        // User 上定义了 own
        const UserProjectRelation = Relation.create({
            source: User,
            sourceProperty: 'own',
            target: Project,
            targetProperty: 'owner',
            type: 'n:1'
        });

        // 第一层 filtered entity
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // 第二层 filtered entity（基于 ActiveUser）
        const YoungActiveUser = Entity.create({
            name: 'YoungActiveUser',
            baseEntity: ActiveUser,
            matchExpression: MatchExp.atom({
                key: 'age',
                value: ['<', 30]
            })
        });

        // 在第二层 filtered entity 上定义同名属性
        const YoungActiveUserProjectRelation = Relation.create({
            source: YoungActiveUser,
            sourceProperty: 'own',  // 冲突！最顶层 base entity (User) 已经有这个属性了
            target: Project,
            targetProperty: 'youngOwner',
            type: 'n:1'
        });

        const entities = [User, Project, ActiveUser, YoungActiveUser];
        const relations = [UserProjectRelation, YoungActiveUserProjectRelation];

        // 应该抛出错误
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/Relation property name conflict.*YoungActiveUser.*sourceProperty.*own/);
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/already defined on base entity/);
    });

    it('should allow filtered entity to use different property name than base entity', async () => {
        const db = new PGLiteDB();
        await db.open();

        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        });

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        // User 上定义了 own
        const UserProjectRelation = Relation.create({
            source: User,
            sourceProperty: 'own',
            target: Project,
            targetProperty: 'owner',
            type: 'n:1'
        });

        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'description', type: 'string' })
            ]
        });

        // 在 filtered entity 上定义不同的属性名 - 应该没问题
        const ActiveUserTaskRelation = Relation.create({
            source: ActiveUser,
            sourceProperty: 'tasks',  // 不同的属性名，没有冲突
            target: Task,
            targetProperty: 'assignee',
            type: 'n:1'
        });

        const entities = [User, Project, ActiveUser, Task];
        const relations = [UserProjectRelation, ActiveUserTaskRelation];

        // 应该正常工作
        const setup = new DBSetup(entities, relations, db);
        await setup.createTables();

        await db.close();
    });

    it('should throw error even when filtered entity uses same property name but relates to different entity', async () => {
        const db = new PGLiteDB();
        await db.open();

        // 这个测试验证：即使 target entity 不同，属性名冲突仍然不被允许
        // 因为 filtered entity 会继承 base entity 的所有关系属性

        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        });

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        const Task = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'description', type: 'string' })
            ]
        });

        // User 有一个 'items' 关系指向 Project
        const UserProjectRelation = Relation.create({
            source: User,
            sourceProperty: 'items',
            target: Project,
            targetProperty: 'userOwner',
            type: 'n:1'
        });

        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        // ActiveUser 也有一个 'items' 关系，但指向不同的 entity (Task)
        // 即使指向不同的 entity，由于属性名冲突，这也应该报错
        const ActiveUserTaskRelation = Relation.create({
            source: ActiveUser,
            sourceProperty: 'items',  // 冲突！即使指向不同的 entity
            target: Task,
            targetProperty: 'activeOwner',
            type: 'n:1'
        });

        const entities = [User, Project, Task, ActiveUser];
        const relations = [UserProjectRelation, ActiveUserTaskRelation];

        // 应该报错，因为属性名冲突
        expect(() => {
            new DBSetup(entities, relations, db);
        }).toThrow(/Relation property name conflict.*ActiveUser.*sourceProperty.*items/);

        await db.close();
    });
});

