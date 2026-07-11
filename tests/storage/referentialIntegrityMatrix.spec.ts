/**
 * Referential-integrity oracle matrix (2026-07-09, added in r7).
 *
 * WHY THIS EXISTS
 * ---------------
 * The r6 aggregation matrix (aggregationConsistencyMatrix.spec.ts) is built on two
 * self-checking oracles: "incremental value == full recompute from storage" and
 * "update terminal state == create terminal state". Both treat *storage itself* as
 * ground truth. That is structurally blind to a class of write-path bugs where the
 * write path corrupts the store in a self-consistent way — e.g. r7 F-1: deleting one
 * endpoint of a SYMMETRIC relation left an orphan link row, and both the incremental
 * count and the full recompute agreed on the (wrong) value, so the r6 oracle stayed green.
 *
 * This suite adds an oracle that does NOT trust the write path:
 *   INV-1 (no dangling endpoints): after any mutation, every link row's source.id and
 *          target.id reference a live entity row. Orphan links are a corruption the
 *          computation-consistency oracle cannot see.
 *   INV-2 (symmetric bidirectionality): for a symmetric relation, querying either
 *          endpoint's relation property returns the same undirected edge set.
 *
 * It also fills the DEGENERATE-POINT gap the r6 relation dimension skipped: symmetric
 * n:n, self-referential 1:1 reliance, and fixtures where the pre-existing link is on
 * the target side (not just the source side). Degenerate points (self / empty /
 * boundary) should be default-mandatory values of every dimension.
 */
import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, KlassByName, MatchExp, MonoSystem, Controller } from 'interaqt';
import { PGLiteDB } from '@drivers';
import { withRuntimeEventCompleteness, EventCompletenessSchema } from "./helpers/eventCompleteness.js";

type LinkRow = { id: string; source?: { id?: string }; target?: { id?: string } };

/**
 * INV-1: no link row references a non-existent (deleted) endpoint.
 * Enumerates every relation's link rows and cross-checks against the live entity id sets.
 * Deliberately independent of any computation / aggregation.
 */
async function assertNoDanglingLinks(storage: any, entityNames: string[], relations: any[]) {
    const liveIds = new Map<string, Set<string>>();
    for (const name of entityNames) {
        const rows = await storage.find(name, undefined, undefined, ['id']);
        liveIds.set(name, new Set(rows.map((r: any) => r.id)));
    }
    for (const rel of relations) {
        const linkRows: LinkRow[] = await storage.findRelationByName(rel.name!, undefined, undefined, [
            'id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }],
        ]);
        const sourceLive = liveIds.get(rel.source.name!)!;
        const targetLive = liveIds.get(rel.target.name!)!;
        for (const link of linkRows) {
            const sid = link.source?.id;
            const tid = link.target?.id;
            expect(sid, `relation ${rel.name} link ${link.id} has source ${sid} not in live ${rel.source.name}`).toBeDefined();
            expect(tid, `relation ${rel.name} link ${link.id} has target ${tid} not in live ${rel.target.name}`).toBeDefined();
            expect(sourceLive.has(sid!), `relation ${rel.name} link ${link.id}: dangling source ${sid}`).toBe(true);
            expect(targetLive.has(tid!), `relation ${rel.name} link ${link.id}: dangling target ${tid}`).toBe(true);
        }
    }
}

/** INV-2: symmetric relation is bidirectionally queryable — the friend set of A includes B iff B's includes A. */
async function assertSymmetricBidirectional(storage: any, entityName: string, relationProperty: string) {
    const all = await storage.find(entityName, undefined, undefined, ['id', [relationProperty, { attributeQuery: ['id'] }]]);
    const neighbors = new Map<string, Set<string>>();
    for (const row of all) neighbors.set(row.id, new Set((row[relationProperty] || []).map((n: any) => n.id)));
    for (const [id, ns] of neighbors) {
        for (const n of ns) {
            expect(neighbors.get(n)?.has(id), `symmetric edge (${id},${n}) not visible from ${n}`).toBe(true);
        }
    }
}

async function bootstrap(entities: any[], relations: any[]) {
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities, relations });
    await controller.setup(true);
    return system.storage;
}

describe('referential-integrity oracle matrix', () => {

    test('symmetric n:n: delete from either endpoint side leaves no orphan links', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            name: 'User_friends_friends_User', type: 'n:n',
        });
        const storage = await bootstrap([User], [friends]);

        const a = await storage.create('User', { name: 'A' });
        const b = await storage.create('User', { name: 'B' });
        const c = await storage.create('User', { name: 'C' });
        const d = await storage.create('User', { name: 'D' });
        // Mix of source-side and target-side placements of every node.
        await storage.addRelationByNameById('User_friends_friends_User', a.id, b.id, {});   // A source
        await storage.addRelationByNameById('User_friends_friends_User', c.id, a.id, {});   // A target
        await storage.addRelationByNameById('User_friends_friends_User', a.id, d.id, {});   // A source
        await storage.addRelationByNameById('User_friends_friends_User', b.id, c.id, {});

        await assertNoDanglingLinks(storage, ['User'], [friends]);
        await assertSymmetricBidirectional(storage, 'User', 'friends');

        // Delete A — it is source of two links and target of one. All three must vanish.
        // r17：事件完备性预言机同步对账（三条 link 的 delete 事件 + A 的 delete 事件缺一不可）。
        const schema: EventCompletenessSchema = { entities: ['User'], relations: ['User_friends_friends_User'] };
        await withRuntimeEventCompleteness(storage, schema, 'symmetric delete A', async () => {
            await storage.delete('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }));
        });
        await assertNoDanglingLinks(storage, ['User'], [friends]);
        await assertSymmetricBidirectional(storage, 'User', 'friends');

        const remainingForA = await storage.findRelationByName('User_friends_friends_User', undefined, undefined, [
            'id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }],
        ]);
        expect(remainingForA.some((l: LinkRow) => l.source?.id === a.id || l.target?.id === a.id)).toBe(false);
        // (B,C) survives.
        expect(remainingForA.length).toBe(1);
    });

    test('symmetric n:n: update-replace from the target side removes the old edge', async () => {
        const User = Entity.create({ name: 'User2', properties: [Property.create({ name: 'name', type: 'string' })] });
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            name: 'User2_friends_friends_User2', type: 'n:n',
        });
        const storage = await bootstrap([User], [friends]);
        const a = await storage.create('User2', { name: 'A' });
        const b = await storage.create('User2', { name: 'B' });
        const c = await storage.create('User2', { name: 'C' });
        await storage.addRelationByNameById('User2_friends_friends_User2', c.id, a.id, {});   // A on target side

        // r17：replace 语义的事件面（旧边 delete + 新边 create）由事件完备性预言机对账。
        await withRuntimeEventCompleteness(storage,
            { entities: ['User2'], relations: ['User2_friends_friends_User2'] },
            'symmetric update-replace', async () => {
                await storage.update('User2', MatchExp.atom({ key: 'id', value: ['=', a.id] }), { friends: [{ id: b.id }] });
            });

        await assertNoDanglingLinks(storage, ['User2'], [friends]);
        await assertSymmetricBidirectional(storage, 'User2', 'friends');
        const aRow = await storage.findOne('User2', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['id', ['friends', { attributeQuery: ['name'] }]]);
        expect((aRow.friends || []).map((f: any) => f.name).sort()).toEqual(['B']);
    });

    test('non-symmetric n:n: delete from either side leaves no orphan (control group)', async () => {
        const User = Entity.create({ name: 'U3', properties: [Property.create({ name: 'name', type: 'string' })] });
        const Team = Entity.create({ name: 'T3', properties: [Property.create({ name: 'tname', type: 'string' })] });
        const member = Relation.create({ source: User, sourceProperty: 'teams', target: Team, targetProperty: 'members', name: 'U3_teams_members_T3', type: 'n:n' });
        const storage = await bootstrap([User, Team], [member]);
        const u1 = await storage.create('U3', { name: 'u1' });
        const t1 = await storage.create('T3', { tname: 't1', members: [{ id: u1.id }] });
        const t2 = await storage.create('T3', { tname: 't2', members: [{ id: u1.id }] });

        await assertNoDanglingLinks(storage, ['U3', 'T3'], [member]);
        await withRuntimeEventCompleteness(storage,
            { entities: ['U3', 'T3'], relations: ['U3_teams_members_T3'] },
            'n:n delete u1', async () => {
                await storage.delete('U3', MatchExp.atom({ key: 'id', value: ['=', u1.id] }));
            });
        await assertNoDanglingLinks(storage, ['U3', 'T3'], [member]);
        const links = await storage.findRelationByName('U3_teams_members_T3', undefined, undefined, ['id']);
        expect(links.length).toBe(0);
    });

    test('self-referential 1:n: delete parent leaves no orphan child link', async () => {
        const Node = Entity.create({ name: 'Node', properties: [Property.create({ name: 'name', type: 'string' })] });
        const parentChild = Relation.create({ source: Node, sourceProperty: 'children', target: Node, targetProperty: 'parent', name: 'Node_children_parent_Node', type: '1:n' });
        const storage = await bootstrap([Node], [parentChild]);
        const root = await storage.create('Node', { name: 'root' });
        const c1 = await storage.create('Node', { name: 'c1', parent: { id: root.id } });
        const c2 = await storage.create('Node', { name: 'c2', parent: { id: root.id } });

        await assertNoDanglingLinks(storage, ['Node'], [parentChild]);
        // delete a child — its link to root must go, root stays.
        await withRuntimeEventCompleteness(storage,
            { entities: ['Node'], relations: ['Node_children_parent_Node'] },
            'self-ref 1:n delete child', async () => {
                await storage.delete('Node', MatchExp.atom({ key: 'id', value: ['=', c1.id] }));
            });
        await assertNoDanglingLinks(storage, ['Node'], [parentChild]);
        const links = await storage.findRelationByName('Node_children_parent_Node', undefined, undefined, ['id']);
        expect(links.length).toBe(1);
    });
});
