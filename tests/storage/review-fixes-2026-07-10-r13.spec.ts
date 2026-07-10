/**
 * 第十三轮深度 review 修复回归（2026-07-10）— storage 层
 *
 * R-3 orderBy / isReferenceValue 引用路径的叶子属性校验：
 *     拼写错误与关系属性名不再产出裸 TypeError / `"表"."undefined"` 非法 SQL
 * R-4 match 操作符 'NOT' 大小写归一（与 r11 的 LIKE/in/between 归一同族）
 */
import { describe, expect, test } from "vitest";
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from "@storage";
import { SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core';
import TestLogger from "./testLogger.js";

async function setupHandle() {
    const User = Entity.create({
        name: 'User',
        properties: [
            Property.create({ name: 'name', type: 'string' }),
            Property.create({ name: 'age', type: 'number' }),
        ]
    });
    const Team = Entity.create({
        name: 'Team',
        properties: [Property.create({ name: 'title', type: 'string' })]
    });
    const UserTeam = Relation.create({
        source: User,
        sourceProperty: 'team',
        target: Team,
        targetProperty: 'members',
        type: 'n:1'
    });
    const logger = new TestLogger('', true);
    const db = new SQLiteDB(':memory:', { logger });
    await db.open();
    const setup = new DBSetup([User, Team], [UserTeam], db);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
    return { handle, db };
}

describe('r13 storage review fixes', () => {
    test('R-3: orderBy leaf typo gives a controlled attribute-not-found error', async () => {
        const { handle, db } = await setupHandle();
        await handle.create('User', { name: 'a', age: 1 });
        await expect(
            handle.find('User', undefined, { orderBy: { nmae: 'ASC' } } as any, ['name'])
        ).rejects.toThrow(/attribute "nmae" not found on "User"/);
        await db.close();
    });

    test('R-3: orderBy on a relation attribute name explains the value-path requirement', async () => {
        const { handle, db } = await setupHandle();
        await handle.create('User', { name: 'a', age: 1, team: { title: 't1' } });
        await expect(
            handle.find('User', undefined, { orderBy: { team: 'ASC' } } as any, ['name'])
        ).rejects.toThrow(/is a relation, not a value field/);
        // 合法的关系值路径照常工作
        const ordered = await handle.find('User', undefined, { orderBy: { 'team.title': 'ASC' } } as any, ['name']);
        expect(ordered.length).toBe(1);
        await db.close();
    });

    test('R-3: isReferenceValue leaf typo gives a controlled error', async () => {
        const { handle, db } = await setupHandle();
        await handle.create('User', { name: 'a', age: 1 });
        await expect(
            handle.find('User', MatchExp.atom({ key: 'age', value: ['=', 'nmae'], isReferenceValue: true } as any), undefined, ['name'])
        ).rejects.toThrow(/attribute "nmae" not found on "User"/);
        await db.close();
    });

    test('R-4: uppercase NOT operator behaves like lowercase not', async () => {
        const { handle, db } = await setupHandle();
        await handle.create('User', { name: 'a', age: 1 });
        const lower = await handle.find('User', MatchExp.atom({ key: 'name', value: ['not', null] }), undefined, ['name']);
        const upper = await handle.find('User', MatchExp.atom({ key: 'name', value: ['NOT', null] }), undefined, ['name']);
        expect(upper.length).toBe(lower.length);
        expect(lower.length).toBe(1);
        // 非 null 操作数仍然给出受控错误（大小写一致）
        await expect(
            handle.find('User', MatchExp.atom({ key: 'name', value: ['NOT', 'x'] }), undefined, ['name'])
        ).rejects.toThrow(/only supports null/);
        await db.close();
    });
});
