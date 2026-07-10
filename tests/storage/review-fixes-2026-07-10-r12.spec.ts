/**
 * 第十二轮深度 review 修复的回归测试（storage/drivers 部分）。
 * 对应报告：agentspace/output/deep-review-2026-07-10-r12.md
 */
import { afterEach, describe, expect, test } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import {
    clearAllInstances,
    Controller,
    Entity,
    KlassByName,
    MatchExp,
    MonoSystem,
    Property,
    Relation,
} from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';

afterEach(() => {
    clearAllInstances(Entity, Relation, Property);
});

describe('r12 F-2: isReferenceValue across relation paths joins automatically', () => {
    test('salary < leader.salary matches without pre-declared join', async () => {
        const UserE = Entity.create({
            name: 'R12RefUser',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'salary', type: 'number' }),
            ],
        });
        const LeaderRel = Relation.create({
            source: UserE, sourceProperty: 'leader',
            target: UserE, targetProperty: 'subordinates',
            type: 'n:1',
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [UserE], relations: [LeaderRel] });
        await controller.setup(true);

        const boss = await system.storage.create('R12RefUser', { name: 'boss', salary: 100 });
        await system.storage.create('R12RefUser', { name: 'low', salary: 50, leader: { id: boss.id } });
        await system.storage.create('R12RefUser', { name: 'high', salary: 200, leader: { id: boss.id } });

        // 修复前：missing FROM-clause entry for table "R12RefUser_leader"
        const result = await system.storage.find('R12RefUser',
            MatchExp.atom({ key: 'salary', value: ['<', 'leader.salary'], isReferenceValue: true }),
            undefined, ['name', 'salary']);
        expect(result.map((r: any) => r.name)).toEqual(['low']);

        await system.destroy();
    });
});

describe('r12 R-3: json canonical form — cross-driver equality parity', () => {
    test('object equality is key-order insensitive on SQLite (text fallback) and PGLite (jsonb)', async () => {
        for (const makeDb of [() => new SQLiteDB(':memory:'), () => new PGLiteDB()]) {
            const E = Entity.create({
                name: 'R12JsonDoc',
                properties: [Property.create({ name: 'meta', type: 'object' })],
            });
            const system = new MonoSystem(makeDb() as any);
            system.conceptClass = KlassByName;
            const controller = new Controller({ system, entities: [E], relations: [] });
            await controller.setup(true);
            await system.storage.create('R12JsonDoc', { meta: { a: 1, b: 2 } });

            const reordered = await system.storage.find('R12JsonDoc',
                MatchExp.atom({ key: 'meta', value: ['=', { b: 2, a: 1 }] }), undefined, ['id']);
            expect(reordered.length).toBe(1);

            const reorderedIn = await system.storage.find('R12JsonDoc',
                MatchExp.atom({ key: 'meta', value: ['in', [{ b: 2, a: 1 }, { c: 3 }]] }), undefined, ['id']);
            expect(reorderedIn.length).toBe(1);

            await system.destroy();
            clearAllInstances(Entity, Relation, Property);
        }
    });

    test('update path serializes json like create: string values survive read-back, reordered keys still match', async () => {
        for (const makeDb of [() => new SQLiteDB(':memory:'), () => new PGLiteDB()]) {
            const E = Entity.create({
                name: 'R12JsonUp',
                properties: [Property.create({ name: 'meta', type: 'object' })],
            });
            const system = new MonoSystem(makeDb() as any);
            system.conceptClass = KlassByName;
            const controller = new Controller({ system, entities: [E], relations: [] });
            await controller.setup(true);

            const rec = await system.storage.create('R12JsonUp', { meta: { a: 1 } });
            // 修复前（SQLite）：update 存原始文本 'plain-string'，读回 JSON.parse 直接抛错
            await system.storage.update('R12JsonUp', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), { meta: 'plain-string' });
            const r1 = await system.storage.findOne('R12JsonUp', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['*']);
            expect(r1.meta).toBe('plain-string');

            await system.storage.update('R12JsonUp', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), { meta: { b: 2, a: 1 } });
            const hits = await system.storage.find('R12JsonUp',
                MatchExp.atom({ key: 'meta', value: ['=', { a: 1, b: 2 }] }), undefined, ['id']);
            expect(hits.length).toBe(1);

            await system.destroy();
            clearAllInstances(Entity, Relation, Property);
        }
    });

    test('json string values created on parsed-JSON drivers read back as the string itself', async () => {
        const E = Entity.create({
            name: 'R12JsonStr',
            properties: [Property.create({ name: 'meta', type: 'object' })],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [E], relations: [] });
        await controller.setup(true);
        const rec = await system.storage.create('R12JsonStr', { meta: 'just-a-string' });
        // 修复前：PGlite 返回已解析的 'just-a-string'，读路径再 JSON.parse 一次直接抛错
        const r = await system.storage.findOne('R12JsonStr', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['*']);
        expect(r.meta).toBe('just-a-string');
        await system.destroy();
    });
});

describe('r12 R-4: SQLite open(forceDrop) rebuilds file-based databases', () => {
    test('setup(true) twice on the same file works', async () => {
        const file = path.join(os.tmpdir(), `r12-sqlite-forcedrop-${process.pid}-${Date.now()}.db`);
        try {
            const E1 = Entity.create({
                name: 'R12FileDoc',
                properties: [Property.create({ name: 'title', type: 'string' })],
            });
            const system1 = new MonoSystem(new SQLiteDB(file));
            system1.conceptClass = KlassByName;
            const controller1 = new Controller({ system: system1, entities: [E1], relations: [] });
            await controller1.setup(true);
            await system1.storage.create('R12FileDoc', { title: 'one' });
            await system1.destroy();

            clearAllInstances(Entity, Relation, Property);

            const E2 = Entity.create({
                name: 'R12FileDoc',
                properties: [Property.create({ name: 'title', type: 'string' })],
            });
            const system2 = new MonoSystem(new SQLiteDB(file));
            system2.conceptClass = KlassByName;
            const controller2 = new Controller({ system: system2, entities: [E2], relations: [] });
            // 修复前：CREATE TABLE 抛 "table already exists"
            await controller2.setup(true);
            const rows = await system2.storage.find('R12FileDoc', undefined, undefined, ['*']);
            expect(rows.length).toBe(0);
            await system2.destroy();
        } finally {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }
    });
});
