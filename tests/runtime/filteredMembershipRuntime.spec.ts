import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
    Controller,
    MonoSystem,
    Count,
    Summation,
    Average,
    Every,
    Any,
    WeightedSummation,
    Dictionary,
    MatchExp
} from 'interaqt';

/**
 * 端到端验证 storage 无状态 membership diff 重构（深度分析报告 2.2）对 runtime 增量计算的影响：
 *
 * 1. 跨实体谓词的 filtered entity：关联实体被删除时产生成员资格 delete 事件，
 *    依赖它的 Count 正确递减（旧实现中该路径没有事件，计数会永久虚高）。
 * 2. merged entity 的 input 视图：通过 input 名创建/删除记录时，
 *    绑定在 merged entity 与 input entity 上的 Count 均正确增减。
 */
describe('filtered/merged membership events drive runtime computations', () => {
    test('Count on cross-entity filtered entity decrements when the related entity is deleted', async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const teamEntity = Entity.create({
            name: 'Team',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'type', type: 'string' })
            ]
        });
        const userTeamRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'team',
            target: teamEntity,
            targetProperty: 'members',
            type: 'n:1'
        });
        const techTeamUserEntity = Entity.create({
            name: 'TechTeamUser',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({ key: 'team.type', value: ['=', 'tech'] })
        });

        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system,
            entities: [userEntity, teamEntity, techTeamUserEntity],
            relations: [userTeamRelation],
            eventSources: [],
            dict: [
                Dictionary.create({
                    name: 'techTeamUserCount',
                    type: 'number',
                    collection: false,
                    computation: Count.create({
                        record: techTeamUserEntity
                        })
                })
            ]
        });
        await controller.setup(true);

        const techTeam = await system.storage.create('Team', { name: 'T1', type: 'tech' });
        await system.storage.create('User', { name: 'U1', team: { id: techTeam.id } });
        await system.storage.create('User', { name: 'U2', team: { id: techTeam.id } });
        expect(await system.storage.dict.get('techTeamUserCount')).toBe(2);

        // 关联实体属性变化：成员退出
        await system.storage.update('Team', MatchExp.atom({ key: 'id', value: ['=', techTeam.id] }), { type: 'sales' });
        expect(await system.storage.dict.get('techTeamUserCount')).toBe(0);
        await system.storage.update('Team', MatchExp.atom({ key: 'id', value: ['=', techTeam.id] }), { type: 'tech' });
        expect(await system.storage.dict.get('techTeamUserCount')).toBe(2);

        // 关联实体被删除：users 仍存在但不再满足谓词，Count 必须递减。
        // CAUTION 旧实现中删除关联实体不产生 filtered entity 事件（脏标记），计数会停留在 2。
        await system.storage.delete('Team', MatchExp.atom({ key: 'id', value: ['=', techTeam.id] }));
        expect(await system.storage.dict.get('techTeamUserCount')).toBe(0);

        await system.storage.destroy();
    });

    test('aggregates stay correct when records leave and re-enter a filtered entity', async () => {
        // CAUTION 回归测试：成员资格的 delete 事件不是物理删除，记录再次进入（create 事件）时
        //  各聚合计算的 record-bound 状态必须已复位，否则增量为 0（计数/求和永久偏低）。
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'salary', type: 'number' })
            ]
        });
        const activeUserEntity = Entity.create({
            name: 'ActiveUser',
            baseEntity: userEntity,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        });

        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system,
            entities: [userEntity, activeUserEntity],
            relations: [],
            eventSources: [],
            dict: [
                Dictionary.create({
                    name: 'activeCount', type: 'number', collection: false,
                    computation: Count.create({ record: activeUserEntity })
                }),
                Dictionary.create({
                    name: 'activeSalarySum', type: 'number', collection: false,
                    computation: Summation.create({ record: activeUserEntity, attributeQuery: ['salary'] })
                }),
                Dictionary.create({
                    name: 'activeSalaryAvg', type: 'number', collection: false,
                    computation: Average.create({ record: activeUserEntity, attributeQuery: ['salary'] })
                }),
                Dictionary.create({
                    name: 'everyActiveRich', type: 'boolean', collection: false,
                    computation: Every.create({
                        record: activeUserEntity,
                        attributeQuery: ['salary'],
                        callback: (user: any) => user.salary >= 100,
                        notEmpty: true
                    })
                }),
                Dictionary.create({
                    name: 'anyActiveRich', type: 'boolean', collection: false,
                    computation: Any.create({
                        record: activeUserEntity,
                        attributeQuery: ['salary'],
                        callback: (user: any) => user.salary >= 100
                    })
                }),
                Dictionary.create({
                    name: 'weightedActiveSalary', type: 'number', collection: false,
                    computation: WeightedSummation.create({
                        record: activeUserEntity,
                        attributeQuery: ['salary'],
                        callback: (user: any) => ({ weight: 2, value: user.salary })
                    })
                })
            ]
        });
        await controller.setup(true);

        const user = await system.storage.create('User', { name: 'U1', isActive: true, salary: 100 });
        expect(await system.storage.dict.get('activeCount')).toBe(1);
        expect(await system.storage.dict.get('activeSalarySum')).toBe(100);
        expect(await system.storage.dict.get('activeSalaryAvg')).toBe(100);
        expect(await system.storage.dict.get('everyActiveRich')).toBe(true);
        expect(await system.storage.dict.get('anyActiveRich')).toBe(true);
        expect(await system.storage.dict.get('weightedActiveSalary')).toBe(200);

        // 离开 filtered entity（membership delete 事件，行仍存在）
        await system.storage.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { isActive: false });
        expect(await system.storage.dict.get('activeCount')).toBe(0);
        expect(await system.storage.dict.get('activeSalarySum')).toBe(0);
        expect(await system.storage.dict.get('anyActiveRich')).toBe(false);
        expect(await system.storage.dict.get('weightedActiveSalary')).toBe(0);

        // 重新进入（membership create 事件）：绑定状态已复位，增量必须完整生效
        await system.storage.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { isActive: true });
        expect(await system.storage.dict.get('activeCount')).toBe(1);
        expect(await system.storage.dict.get('activeSalarySum')).toBe(100);
        expect(await system.storage.dict.get('activeSalaryAvg')).toBe(100);
        expect(await system.storage.dict.get('everyActiveRich')).toBe(true);
        expect(await system.storage.dict.get('anyActiveRich')).toBe(true);
        expect(await system.storage.dict.get('weightedActiveSalary')).toBe(200);

        await system.storage.destroy();
    });

    test('Count on merged entity and its inputs stays consistent through input-name CRUD', async () => {
        const customerEntity = Entity.create({
            name: 'Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        });
        const vendorEntity = Entity.create({
            name: 'Vendor',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        });
        const contactEntity = Entity.create({
            name: 'Contact',
            inputEntities: [customerEntity, vendorEntity]
        });

        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system,
            entities: [customerEntity, vendorEntity, contactEntity],
            relations: [],
            eventSources: [],
            dict: [
                Dictionary.create({
                    name: 'contactCount',
                    type: 'number',
                    collection: false,
                    computation: Count.create({ record: contactEntity })
                }),
                Dictionary.create({
                    name: 'customerCount',
                    type: 'number',
                    collection: false,
                    computation: Count.create({ record: customerEntity })
                })
            ]
        });
        await controller.setup(true);

        const c1 = await system.storage.create('Customer', { name: 'c1' });
        await system.storage.create('Customer', { name: 'c2' });
        await system.storage.create('Vendor', { name: 'v1' });

        expect(await system.storage.dict.get('contactCount')).toBe(3);
        expect(await system.storage.dict.get('customerCount')).toBe(2);

        await system.storage.delete('Customer', MatchExp.atom({ key: 'id', value: ['=', c1.id] }));
        expect(await system.storage.dict.get('contactCount')).toBe(2);
        expect(await system.storage.dict.get('customerCount')).toBe(1);

        await system.storage.destroy();
    });
});
