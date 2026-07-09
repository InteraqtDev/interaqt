/**
 * Regression tests for the 2026-07-09 r7 fixes to previously-deferred crash cases
 * (r5 R-1 big IN, r5 R-2 duplicate ref, r5 R-3 contains-on-non-array).
 * See agentspace/output/deep-review-2026-07-09-r7.md.
 */
import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, KlassByName, MatchExp } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import { MonoSystem, Controller } from 'interaqt';

async function setup(entities: any[], relations: any[], db: any) {
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities, relations });
    await controller.setup(true);
    return system.storage;
}

describe('r7 leftover fixes', () => {
    test('big IN list → controlled error (SQLite)', async () => {
        const Item = Entity.create({ name: 'ItemE', properties: [Property.create({ name: 'n', type: 'number' })] });
        const storage = await setup([Item], [], new SQLiteDB(':memory:'));
        await storage.create('ItemE', { n: 1 });
        let err: any = null;
        try { await storage.find('ItemE', MatchExp.atom({ key: 'n', value: ['in', Array.from({ length: 40000 }, (_, i) => i)] }), undefined, ['id']); }
        catch (e: any) { err = e; }
        console.log('IN err:', err?.message?.slice(0, 160));
        expect(err?.message ?? '').toContain('bind-parameter limit');
    });

    test('IN list within limit still works', async () => {
        const Item = Entity.create({ name: 'ItemF', properties: [Property.create({ name: 'n', type: 'number' })] });
        const storage = await setup([Item], [], new SQLiteDB(':memory:'));
        await storage.create('ItemF', { n: 5 });
        const found = await storage.find('ItemF', MatchExp.atom({ key: 'n', value: ['in', [1, 2, 5, 9]] }), undefined, ['id', 'n']);
        expect(found.length).toBe(1);
    });

    test('duplicate refs in n:n update are idempotent', async () => {
        const Team = Entity.create({ name: 'Team', properties: [Property.create({ name: 'tname', type: 'string' })] });
        const UserE = Entity.create({ name: 'UserE', properties: [Property.create({ name: 'name', type: 'string' })] });
        const rel = Relation.create({ source: UserE, sourceProperty: 'teams', target: Team, targetProperty: 'members', type: 'n:n' });
        const storage = await setup([UserE, Team], [rel], new PGLiteDB());
        const t1 = await storage.create('Team', { tname: 't1' });
        const u = await storage.create('UserE', { name: 'u' });
        await storage.update('UserE', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { teams: [{ id: t1.id }, { id: t1.id }] });
        const after = await storage.findOne('UserE', MatchExp.atom({ key: 'id', value: ['=', u.id] }), undefined, ['id', ['teams', { attributeQuery: ['tname'] }]]);
        expect((after.teams || []).length).toBe(1);
    });

    test('conflicting & on duplicate refs → fail fast', async () => {
        const Team = Entity.create({ name: 'Team2', properties: [Property.create({ name: 'tname', type: 'string' })] });
        const UserE = Entity.create({ name: 'UserE2', properties: [Property.create({ name: 'name', type: 'string' })] });
        const rel = Relation.create({ source: UserE, sourceProperty: 'teams', target: Team, targetProperty: 'members', type: 'n:n', properties: [Property.create({ name: 'role', type: 'string' })] });
        const storage = await setup([UserE, Team], [rel], new PGLiteDB());
        const t1 = await storage.create('Team2', { tname: 't1' });
        const u = await storage.create('UserE2', { name: 'u' });
        let err: any = null;
        try {
            await storage.update('UserE2', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { teams: [{ id: t1.id, '&': { role: 'a' } }, { id: t1.id, '&': { role: 'b' } }] });
        } catch (e: any) { err = e; }
        console.log('conflict err:', err?.message?.slice(0, 160));
        expect(err?.message ?? '').toContain('conflicting');
    });

    test('contains on non-collection object → controlled error', async () => {
        const Doc = Entity.create({ name: 'DocE', properties: [Property.create({ name: 'meta', type: 'object' })] });
        const storage = await setup([Doc], [], new PGLiteDB());
        await storage.create('DocE', { meta: { key: 1 } });
        let err: any = null;
        try { await storage.find('DocE', MatchExp.atom({ key: 'meta', value: ['contains', 'key'] }), undefined, ['id']); }
        catch (e: any) { err = e; }
        console.log('contains err:', err?.message?.slice(0, 160));
        expect(err?.message ?? '').toContain('requires a collection property');
    });

    test('contains on collection property still works', async () => {
        const Doc = Entity.create({ name: 'DocF', properties: [Property.create({ name: 'roles', type: 'string', collection: true })] });
        const storage = await setup([Doc], [], new PGLiteDB());
        await storage.create('DocF', { roles: ['admin', 'user'] });
        const found = await storage.find('DocF', MatchExp.atom({ key: 'roles', value: ['contains', 'admin'] }), undefined, ['id']);
        expect(found.length).toBe(1);
    });
});
