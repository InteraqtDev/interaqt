/**
 * r22 深度审查回归(storage 面)。
 *
 * F-1 —— filtered entity 端点 relation 的成员资格事件整族缺失:
 *   Setup 把 link.sourceRecord/targetRecord 存成声明名(可以是 filtered entity 名),
 *   而 FilteredEntityManager 的依赖表按物理 base 名注册(initializeDependencies 用
 *   resolvedBaseRecordName)。collectLinkMembershipChecks 直接以端点声明名查依赖表
 *   → 空集 → 该关系的建立/解除对依赖它的 filtered entity 零成员资格事件——
 *   查询面正确、事件面缺失,下游响应式计算永久陈旧。
 *   修复(名字空间收口):FilteredEntityManager.resolveBaseRecordName 统一归一化所有
 *   「实体名 → 依赖/视图」入口(getAffectedFilteredEntities / collectMembershipChecks /
 *   getFilteredEntitiesForBase / analyzeDependencies 的注册键与 dep.entityName)。
 *
 * I-4 —— flashOut 抢夺产生的新 link 的视图 create 事件缺 default-only 字段:
 *   视图 create 事件 payload 契约是 defaults + payload(r16 R-1)。行内 link 的三个
 *   产生点(preprocess 两处、flashOut 一处)只有用户显式给 `&` 数据才带 defaults。
 *   修复(汇合点):enqueuePostWriteCreationCheck 统一用 NewRecordData 的 defaults
 *   规则补齐缺失键。
 */
import { describe, expect, test } from "vitest";
import { Entity, Relation, Property } from '@core';
import { DBSetup, EntityToTableMap, EntityQueryHandle, MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import type { RecordMutationEvent } from '@runtime';

describe('r22 F-1 — filtered-entity endpoint relation membership events', () => {
    test('addRelation/removeRelation via relation with filtered source emits membership events for dependent filtered entity', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
            ]
        });
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        });
        const Post = Entity.create({
            name: 'Post',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        // 端点为 filtered entity 的 relation(r8 起为一等公开形态)
        const ActiveUserPost = Relation.create({
            source: ActiveUser,
            sourceProperty: 'primaryPost',
            target: Post,
            targetProperty: 'owners',
            type: 'n:1'
        });
        // 谓词依赖该关系属性的 filtered entity
        const UserWithPost = Entity.create({
            name: 'UserWithPost',
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: 'primaryPost.id', value: ['not', null] })
        });

        const db = new PGLiteDB();
        await db.open();
        const setup = new DBSetup([User, ActiveUser, Post, UserWithPost], [ActiveUserPost], db);
        await setup.createTables();
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

        const u = await handle.create('User', { name: 'u1', isActive: true });
        const p = await handle.create('Post', { title: 'p1' });

        // addRelation:进入视图 → create 事件
        const events: RecordMutationEvent[] = [];
        await handle.addRelationByNameById(ActiveUserPost.name!, u.id, p.id, {}, events);
        const members = await handle.find('UserWithPost', undefined, undefined, ['id', 'name']);
        expect(members.map((m: any) => m.name)).toEqual(['u1']);
        expect(events.filter(e => e.recordName === 'UserWithPost' && e.type === 'create')).toHaveLength(1);

        // removeRelation:退出视图 → delete 事件
        const events2: RecordMutationEvent[] = [];
        await handle.removeRelationByName(ActiveUserPost.name!, MatchExp.atom({ key: 'source.id', value: ['=', u.id] }), events2);
        expect(await handle.find('UserWithPost', undefined, undefined, ['id'])).toHaveLength(0);
        expect(events2.filter(e => e.recordName === 'UserWithPost' && e.type === 'delete')).toHaveLength(1);
        await db.close();
    });

    test('control: base-entity endpoint relation emits membership events (unchanged semantics)', async () => {
        const User2 = Entity.create({
            name: 'User2',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
            ]
        });
        const Post2 = Entity.create({ name: 'Post2', properties: [Property.create({ name: 'title', type: 'string' })] });
        const UserPost2 = Relation.create({
            source: User2, sourceProperty: 'primaryPost', target: Post2, targetProperty: 'owners', type: 'n:1'
        });
        const User2WithPost = Entity.create({
            name: 'User2WithPost',
            baseEntity: User2,
            matchExpression: MatchExp.atom({ key: 'primaryPost.id', value: ['not', null] })
        });
        const db2 = new PGLiteDB();
        await db2.open();
        const setup2 = new DBSetup([User2, Post2, User2WithPost], [UserPost2], db2);
        await setup2.createTables();
        const handle2 = new EntityQueryHandle(new EntityToTableMap(setup2.map), db2);
        const u2 = await handle2.create('User2', { name: 'u2', isActive: true });
        const p2 = await handle2.create('Post2', { title: 'p2' });
        const events3: RecordMutationEvent[] = [];
        await handle2.addRelationByNameById(UserPost2.name!, u2.id, p2.id, {}, events3);
        expect(events3.filter(e => e.recordName === 'User2WithPost' && e.type === 'create')).toHaveLength(1);
        await db2.close();
    });
});

describe('r22 I-4 — flashOut new-link view create event payload defaults', () => {
    test('combined steal: filtered relation create event carries default-only link property', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        // 1:1 → combined(三表合一)
        const UserProfile = Relation.create({
            source: User,
            sourceProperty: 'profile',
            target: Profile,
            targetProperty: 'owner',
            type: '1:1',
            properties: [
                Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => true }),
            ]
        });
        const PrimaryUserProfile = Relation.create({
            name: 'PrimaryUserProfile',
            baseRelation: UserProfile,
            sourceProperty: 'primaryProfile',
            targetProperty: 'primaryOwner',
            matchExpression: MatchExp.atom({ key: 'isPrimary', value: ['=', true] })
        });

        const db = new PGLiteDB();
        await db.open();
        const setup = new DBSetup([User, Profile], [UserProfile, PrimaryUserProfile], db);
        await setup.createTables();
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

        const p = await handle.create('Profile', { title: 'P' });
        await handle.create('User', { name: 'u1', profile: { id: p.id } });
        // u2 抢夺 p → flashOut 路径产生新 link(isPrimary 仅有默认值)
        const events: RecordMutationEvent[] = [];
        await handle.create('User', { name: 'u2', profile: { id: p.id } }, events);

        const viewCreate = events.find(e => e.recordName === 'PrimaryUserProfile' && e.type === 'create');
        expect(viewCreate).toBeTruthy();
        // 事件 payload 契约:defaults + payload(按 default-only 字段做模式匹配的下游依赖它)
        expect((viewCreate?.record as any)?.isPrimary).toBe(true);
        await db.close();
    });
});
