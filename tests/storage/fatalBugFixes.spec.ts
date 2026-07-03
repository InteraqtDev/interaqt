import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@core';
import TestLogger from "./testLogger.js";
import { PGLiteDB, SQLiteDB } from '@drivers';

/**
 * 针对 storage 层致命错误修复的回归测试。
 * 每个 describe 对应分析报告中的一个致命问题（F1~F8）。
 */

describe('F1: EXIST subquery placeholder ordering on numbered-placeholder DB (PGLite/PG)', () => {
    let db: PGLiteDB;
    let handle: EntityQueryHandle;

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'age', type: 'number' })
            ]
        });
        const teamEntity = Entity.create({
            name: 'Team',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        Relation.create({ source: userEntity, sourceProperty: 'teams', target: teamEntity, targetProperty: 'members', type: 'n:n' });
        const relations = Relation.instances.filter(r => r.source === userEntity || r.target === userEntity);
        db = new PGLiteDB(undefined, { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([userEntity, teamEntity], relations, db);
        await setup.createTables();
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });
    afterEach(async () => { await db.close(); });

    test('value conditions before AND after an EXIST bind to the correct params', async () => {
        const alpha = await handle.create('Team', { name: 'Alpha' });
        await handle.create('User', { name: 'Bob', age: 30, teams: [alpha] });
        await handle.create('User', { name: 'Eve', age: 50 });

        const match = MatchExp.atom({ key: 'age', value: ['>', 20] })
            .and({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'name', value: ['=', 'Alpha'] })] })
            .and({ key: 'name', value: ['=', 'Bob'] });

        const found = await handle.find('User', match, undefined, ['name', 'age']);
        expect(found).toHaveLength(1);
        expect(found[0].name).toBe('Bob');
    });

    test('two EXIST conditions with surrounding value conditions', async () => {
        const alpha = await handle.create('Team', { name: 'Alpha' });
        const beta = await handle.create('Team', { name: 'Beta' });
        await handle.create('User', { name: 'Bob', age: 30, teams: [alpha, beta] });
        await handle.create('User', { name: 'Carol', age: 30, teams: [alpha] });

        const match = MatchExp.atom({ key: 'age', value: ['=', 30] })
            .and({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'name', value: ['=', 'Alpha'] })] })
            .and({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'name', value: ['=', 'Beta'] })] })
            .and({ key: 'name', value: ['=', 'Bob'] });

        const found = await handle.find('User', match, undefined, ['name']);
        expect(found.map(u => u.name)).toEqual(['Bob']);
    });
});

describe('F4: create/update must not run an unfiltered full-table scan', () => {
    test('creating an independent record issues no WHERE 1=1 select', async () => {
        const userEntity = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const queries: { sql: string }[] = [];
        const logger: any = {
            info: (arg: any) => { if (arg?.sql) queries.push({ sql: arg.sql }); },
            error: () => {},
            child() { return this; }
        };
        const db = new SQLiteDB(':memory:', { logger });
        await db.open();
        const setup = new DBSetup([userEntity], [], db);
        await setup.createTables();
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

        await handle.create('User', { name: 'a' });
        queries.length = 0;
        await handle.create('User', { name: 'b' });

        const fullScans = queries.filter(q => /WHERE\s*\n?\s*1=/.test(q.sql));
        expect(fullScans).toHaveLength(0);
        await db.close();
    });
});

describe('F5: matching over x:n path must not return duplicate rows', () => {
    let db: PGLiteDB;
    let handle: EntityQueryHandle;
    beforeEach(async () => {
        const userEntity = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const teamEntity = Entity.create({ name: 'Team', properties: [Property.create({ name: 'name', type: 'string' })] });
        Relation.create({ source: userEntity, sourceProperty: 'teams', target: teamEntity, targetProperty: 'members', type: 'n:n' });
        const relations = Relation.instances.filter(r => r.source === userEntity || r.target === userEntity);
        db = new PGLiteDB(undefined, { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([userEntity, teamEntity], relations, db);
        await setup.createTables();
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });
    afterEach(async () => { await db.close(); });

    test('user in multiple matching teams appears once', async () => {
        const t1 = await handle.create('Team', { name: 'Alpha X' });
        const t2 = await handle.create('Team', { name: 'Alpha Y' });
        await handle.create('User', { name: 'Bob', teams: [t1, t2] });
        await handle.create('User', { name: 'Eve', teams: [t1] });

        const found = await handle.find('User', MatchExp.atom({ key: 'teams.name', value: ['like', 'Alpha%'] }), undefined, ['name']);
        expect(found.map(u => u.name).sort()).toEqual(['Bob', 'Eve']);
    });
});

describe('F6: lock (FOR UPDATE) works with x:1 related attributeQuery', () => {
    let db: PGLiteDB;
    let handle: EntityQueryHandle;
    beforeEach(async () => {
        const teamEntity = Entity.create({ name: 'Team', properties: [Property.create({ name: 'name', type: 'string' })] });
        const userEntity = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        Relation.create({ source: userEntity, sourceProperty: 'team', target: teamEntity, targetProperty: 'members', type: 'n:1' });
        const relations = Relation.instances.filter(r => r.source === userEntity || r.target === userEntity);
        db = new PGLiteDB(undefined, { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([userEntity, teamEntity], relations, db);
        await setup.createTables();
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });
    afterEach(async () => { await db.close(); });

    test('lock with joined x:1 relation does not error on outer join', async () => {
        const team = await handle.create('Team', { name: 'T' });
        await handle.create('User', { name: 'Dan', team });
        const locked = await handle.lock('User', undefined, ['name', ['team', { attributeQuery: ['name'] }]]);
        expect(locked).toHaveLength(1);
        expect(locked[0].team.name).toBe('T');
    });
});

describe('F7: JSON fields of related records are deserialized (SQLite)', () => {
    let db: SQLiteDB;
    let handle: EntityQueryHandle;
    beforeEach(async () => {
        const profileEntity = Entity.create({ name: 'Profile', properties: [Property.create({ name: 'tags', type: 'string', collection: true })] });
        const userEntity = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        Relation.create({ source: userEntity, sourceProperty: 'profile', target: profileEntity, targetProperty: 'owner', type: '1:1' });
        const relations = Relation.instances.filter(r => r.source === userEntity || r.target === userEntity);
        db = new SQLiteDB(':memory:', { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([userEntity, profileEntity], relations, db);
        await setup.createTables();
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });
    afterEach(async () => { await db.close(); });

    test('related record JSON collection is parsed to an array', async () => {
        await handle.create('User', { name: 'Carl', profile: { tags: ['a', 'b'] } });
        const found = await handle.findOne('User', undefined, undefined, ['name', ['profile', { attributeQuery: ['tags'] }]]);
        expect(Array.isArray(found.profile.tags)).toBe(true);
        expect(found.profile.tags).toEqual(['a', 'b']);
    });
});

describe('F8: modifier validation & injection safety', () => {
    let db: SQLiteDB;
    let handle: EntityQueryHandle;
    beforeEach(async () => {
        const userEntity = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        db = new SQLiteDB(':memory:', { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([userEntity], [], db);
        await setup.createTables();
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });
    afterEach(async () => { await db.close(); });

    test('non-integer limit is rejected', async () => {
        await handle.create('User', { name: 'a' });
        await expect(handle.find('User', undefined, { limit: '1; DROP TABLE User' as any }, ['name'])).rejects.toThrow(/limit/);
    });
    test('negative offset is rejected', async () => {
        await expect(handle.find('User', undefined, { offset: -5 }, ['name'])).rejects.toThrow(/offset/);
    });
    test('invalid orderBy direction is rejected', async () => {
        await expect(handle.find('User', undefined, { orderBy: { name: 'DROP' as any } }, ['name'])).rejects.toThrow(/ASC|DESC/);
    });
    test('lowercase order direction still works', async () => {
        await handle.create('User', { name: 'a' });
        await handle.create('User', { name: 'b' });
        const r = await handle.find('User', undefined, { orderBy: { name: 'desc' as any } }, ['name']);
        expect(r.map(x => x.name)).toEqual(['b', 'a']);
    });
});

describe('F2: filtered entity membership updates on relation change', () => {
    let db: PGLiteDB;
    let handle: EntityQueryHandle;
    beforeEach(async () => {
        const userEntity = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const teamEntity = Entity.create({ name: 'Team', properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'type', type: 'string' })] });
        Relation.create({ source: userEntity, sourceProperty: 'team', target: teamEntity, targetProperty: 'members', type: 'n:1' });
        const techUsers = Entity.create({ name: 'TechTeamUsers', baseEntity: userEntity, matchExpression: MatchExp.atom({ key: 'team.type', value: ['=', 'tech'] }) });
        const relations = Relation.instances.filter(r => [userEntity, teamEntity].includes(r.source as any) || [userEntity, teamEntity].includes(r.target as any));
        db = new PGLiteDB(undefined, { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([userEntity, teamEntity, techUsers], relations, db);
        await setup.createTables();
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    });
    afterEach(async () => { await db.close(); });

    test('changing the related record (team.type) updates membership + events', async () => {
        const team = await handle.create('Team', { name: 'T', type: 'sales' });
        const user = await handle.create('User', { name: 'David', team });
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(0);

        const events: any[] = [];
        await handle.update('Team', MatchExp.atom({ key: 'id', value: ['=', team.id] }), { type: 'tech' }, events);
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(1);
        expect(events.filter(e => e.type === 'create' && e.recordName === 'TechTeamUsers')).toHaveLength(1);
    });

    test('moving a record out of the matching relation emits delete + clears stale flag', async () => {
        const techTeam = await handle.create('Team', { name: 'T1', type: 'tech' });
        const salesTeam = await handle.create('Team', { name: 'T2', type: 'sales' });
        const user = await handle.create('User', { name: 'Alice', team: techTeam });
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(1);

        const events: any[] = [];
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), { team: salesTeam }, events);
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(0);
        expect(events.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUsers')).toHaveLength(1);

        // no stale flag -> deleting the (now non-member) user emits no filtered-entity delete
        const events2: any[] = [];
        await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), events2);
        expect(events2.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUsers')).toHaveLength(0);
    });

    test('addRelation / removeRelation propagate membership', async () => {
        const techTeam = await handle.create('Team', { name: 'T1', type: 'tech' });
        const user = await handle.create('User', { name: 'Bob' });
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(0);

        const addEvents: any[] = [];
        await handle.addRelationById('User', 'team', user.id, techTeam.id, undefined, addEvents);
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(1);
        expect(addEvents.filter(e => e.type === 'create' && e.recordName === 'TechTeamUsers')).toHaveLength(1);

        const relName = handle.getRelationName('User', 'team');
        const rmEvents: any[] = [];
        await handle.removeRelationByName(relName, MatchExp.atom({ key: 'source.id', value: ['=', user.id] }), rmEvents);
        expect(await handle.find('TechTeamUsers', undefined, undefined, ['name'])).toHaveLength(0);
        expect(rmEvents.filter(e => e.type === 'delete' && e.recordName === 'TechTeamUsers')).toHaveLength(1);
    });
});

describe('F3: merged entity with filtered input preserves base identity & predicate', () => {
    async function build() {
        const base = Entity.create({ name: 'CustomerBase', properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'isActive', type: 'boolean' })] });
        const active = Entity.create({ name: 'ActiveCustomer', baseEntity: base, matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }) });
        const other = Entity.create({ name: 'Other', properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'isActive', type: 'boolean' })] });
        const merged = Entity.create({ name: 'Contact', inputEntities: [active, other] });
        const db = new SQLiteDB(':memory:', { logger: new TestLogger('', true) });
        await db.open();
        const setup = new DBSetup([base, active, other, merged], [], db);
        await setup.createTables();
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
        return { db, handle };
    }

    test('records created via base name remain queryable via base (no black hole)', async () => {
        const { db, handle } = await build();
        await handle.create('CustomerBase', { name: 'honest', isActive: true });
        const base = await handle.find('CustomerBase', undefined, undefined, ['name']);
        expect(base.map(r => r.name)).toContain('honest');
        await db.close();
    });

    test('filtered input keeps its own predicate', async () => {
        const { db, handle } = await build();
        await handle.create('ActiveCustomer', { name: 'a1', isActive: true });
        await handle.create('Other', { name: 'o1', isActive: false });
        expect((await handle.find('ActiveCustomer', undefined, undefined, ['name'])).map(r => r.name)).toEqual(['a1']);
        expect((await handle.find('Contact', undefined, undefined, ['name'])).map(r => r.name).sort()).toEqual(['a1', 'o1']);
        await db.close();
    });

    test('filtered input membership is declarative: base records enter/leave by predicate', async () => {
        // CAUTION 语义已按判别列 + 声明式谓词模型修正（storage 深度分析报告 2.2(b)/2.3）：
        //  ActiveCustomer 的定义是 "CustomerBase 中 isActive = true 的子集"，
        //  成员资格由谓词实时求值决定，与记录以哪个名字创建无关（旧 tag 模型是创建时写死的）。
        //  因此以 CustomerBase 名义创建且 isActive = true 的记录同样属于 ActiveCustomer，进而属于 Contact。
        const { db, handle } = await build();
        await handle.create('CustomerBase', { name: 'baseActive', isActive: true });
        await handle.create('CustomerBase', { name: 'baseInactive', isActive: false });
        await handle.create('ActiveCustomer', { name: 'activeRec', isActive: true });

        // 满足谓词的 base 记录属于 ActiveCustomer / Contact；不满足的只属于 CustomerBase
        expect((await handle.find('ActiveCustomer', undefined, undefined, ['name'])).map(r => r.name).sort()).toEqual(['activeRec', 'baseActive']);
        expect((await handle.find('Contact', undefined, undefined, ['name'])).map(r => r.name).sort()).toEqual(['activeRec', 'baseActive']);
        expect((await handle.find('CustomerBase', undefined, undefined, ['name'])).map(r => r.name).sort()).toEqual(['activeRec', 'baseActive', 'baseInactive']);

        // 属性变化时自然进出（tag 模型下 tag 不迁移的问题随判别列模型消失）
        const events: any[] = [];
        await handle.update('CustomerBase', MatchExp.atom({ key: 'name', value: ['=', 'baseInactive'] }), { isActive: true }, events);
        expect((await handle.find('Contact', undefined, undefined, ['name'])).map(r => r.name).sort()).toEqual(['activeRec', 'baseActive', 'baseInactive']);
        expect(events.filter(e => e.type === 'create' && e.recordName === 'ActiveCustomer')).toHaveLength(1);
        await db.close();
    });
});
