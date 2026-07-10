/**
 * 第十四轮改进项回归（2026-07-10）— storage 层：
 *
 * I-7 物理表名超过方言标识符上限时 Setup fail-fast（此前 PG 静默截断 / MySQL 裸报错）
 * I-8 orderBy 走 x:n 关系路径时声明期拒绝（此前按 JOIN 扇出行序排序——语义未定义）
 */
import { describe, expect, test } from "vitest";
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from "@storage";
import { SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core';
import TestLogger from "./testLogger.js";

async function setupHandle() {
    const User = Entity.create({
        name: 'R14User',
        properties: [
            Property.create({ name: 'name', type: 'string' }),
            Property.create({ name: 'age', type: 'number' }),
        ]
    });
    const Team = Entity.create({
        name: 'R14Team',
        properties: [Property.create({ name: 'title', type: 'string' })]
    });
    const Post = Entity.create({
        name: 'R14Post',
        properties: [Property.create({ name: 'title', type: 'string' })]
    });
    const UserTeam = Relation.create({
        source: User, sourceProperty: 'team',
        target: Team, targetProperty: 'members',
        type: 'n:1'
    });
    const UserPosts = Relation.create({
        source: User, sourceProperty: 'posts',
        target: Post, targetProperty: 'author',
        type: '1:n'
    });
    const logger = new TestLogger('', true);
    const db = new SQLiteDB(':memory:', { logger });
    await db.open();
    const setup = new DBSetup([User, Team, Post], [UserTeam, UserPosts], db);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
    return { handle, db };
}

describe('r14 storage improvement fixes', () => {
    test('I-8: orderBy through an x:n path is rejected with a clear error', async () => {
        const { handle, db } = await setupHandle();
        await handle.create('R14User', { name: 'a', age: 1, posts: [{ title: 'p1' }, { title: 'p2' }] });
        await expect(
            handle.find('R14User', undefined, { orderBy: { 'posts.title': 'ASC' } } as any, ['name'])
        ).rejects.toThrow(/traverses the x:n relation "posts"/);
        await db.close();
    });

    test('I-8: orderBy through an x:1 path keeps working', async () => {
        const { handle, db } = await setupHandle();
        await handle.create('R14User', { name: 'b', age: 2, team: { title: 'zebra' } });
        await handle.create('R14User', { name: 'a', age: 1, team: { title: 'alpha' } });
        const ordered = await handle.find('R14User', undefined, { orderBy: { 'team.title': 'ASC' } } as any, ['name']);
        expect(ordered.map((u: any) => u.name)).toEqual(['a', 'b']);
        await db.close();
    });

    test('I-7: a physical table name exceeding the enforced identifier limit fails fast at setup (PG dialect)', async () => {
        const longName = 'R14' + 'VeryLongEntityName'.repeat(4); // 75 chars > 63
        expect(longName.length).toBeGreaterThan(63);
        const LongEntity = Entity.create({
            name: longName,
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const logger = new TestLogger('', true);
        const db = new SQLiteDB(':memory:', { logger });
        await db.open();
        // PG 静默截断 63 字节标识符 → 方言声明 enforceMaxIdentifierLength: true 时 fail-fast
        ;(db as any).schemaDialect = { ...(db as any).schemaDialect, name: 'postgres', enforceMaxIdentifierLength: true };
        expect(() => new DBSetup([LongEntity], [], db))
            .toThrow(/exceeding the postgres identifier limit/);
        await db.close();
    });

    test('I-7: SQLite (no real identifier limit) does not enforce the length check', async () => {
        const longName = 'R14Sqlite' + 'VeryLongEntityName'.repeat(4);
        expect(longName.length).toBeGreaterThan(63);
        const LongEntity = Entity.create({
            name: longName,
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const logger = new TestLogger('', true);
        const db = new SQLiteDB(':memory:', { logger });
        await db.open();
        const setup = new DBSetup([LongEntity], [], db);
        await setup.createTables();
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
        const created = await handle.create(longName, { title: 't' });
        expect(created.id).toBeTruthy();
        await db.close();
    });
});
