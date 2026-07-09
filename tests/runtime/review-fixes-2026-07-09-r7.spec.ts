/**
 * Regression tests for the 2026-07-09 r7 deep review fixes.
 * See agentspace/output/deep-review-2026-07-09-r7.md
 *
 * - F-1: symmetric n:n entity deletion also removes links where the entity is on
 *        the target side (no orphan link, symmetric Count stays correct).
 * - F-2: symmetric n:n update-replace unlinks old links regardless of source/target side.
 * - F-3: dataPolicy.modifier limit cannot be bypassed by caller-supplied offset/orderBy.
 * - F-5: 'program' ActivityGroup (no completion semantics) is rejected at build time
 *        instead of silently dead-locking the activity.
 *
 * Note: `dataPolicy.match` returning null/undefined is by-design "no additional filter"
 * (see queryDataInteraction.spec.ts "should handle function returning null/undefined"),
 * so it is intentionally NOT treated as a bug here.
 */
import { describe, expect, test } from "vitest";
import {
    Entity, Property, Relation, Controller, MonoSystem, MatchExp, Count,
    Interaction, Action, GetAction, DataPolicy, Activity, ActivityGroup, Transfer, ActivityManager,
} from 'interaqt';
import { PGLiteDB } from '@drivers';
import type { RecordMutationEvent } from 'interaqt';

describe('review fixes 2026-07-09 r7', () => {

    // ============ F-1: symmetric n:n entity deletion (target side) ============
    test('F-1: deleting an entity removes symmetric links where it is on the target side', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'username', type: 'string' })] });
        const friendRelation = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            name: 'User_friends_friends_User', type: 'n:n'
        });
        User.properties.push(Property.create({ name: 'friendCount', type: 'number', computation: Count.create({ record: friendRelation }) }));
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [User], relations: [friendRelation] });
        await controller.setup(true);
        const storage = system.storage;

        const a = await storage.create('User', { username: 'A' });
        const b = await storage.create('User', { username: 'B' });
        const c = await storage.create('User', { username: 'C' });
        await storage.addRelationByNameById('User_friends_friends_User', a.id, b.id, {});   // A source
        await storage.addRelationByNameById('User_friends_friends_User', c.id, a.id, {});   // A target

        const events: RecordMutationEvent[] = [];
        await storage.delete('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), events);

        const remaining = await storage.findRelationByName('User_friends_friends_User', undefined, undefined, ['*']);
        expect(remaining.length).toBe(0);
        // both link rows produced delete events
        expect(events.filter(e => e.recordName === 'User_friends_friends_User' && e.type === 'delete').length).toBe(2);

        const cAfter = await storage.findOne('User', MatchExp.atom({ key: 'id', value: ['=', c.id] }), undefined, ['*']);
        expect(cAfter.friendCount).toBe(0);
    });

    // ============ F-2: symmetric n:n update replace (target side) ============
    test('F-2: symmetric update replace unlinks old links regardless of endpoint side', async () => {
        const User = Entity.create({ name: 'User2', properties: [Property.create({ name: 'username', type: 'string' })] });
        const friendRelation = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            name: 'User2_friends_friends_User2', type: 'n:n'
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [User], relations: [friendRelation] });
        await controller.setup(true);
        const storage = system.storage;
        const a = await storage.create('User2', { username: 'A' });
        const b = await storage.create('User2', { username: 'B' });
        const c = await storage.create('User2', { username: 'C' });
        await storage.addRelationByNameById('User2_friends_friends_User2', c.id, a.id, {});   // A on target side

        await storage.update('User2', MatchExp.atom({ key: 'id', value: ['=', a.id] }), { friends: [{ id: b.id }] });

        const aAfter = await storage.findOne('User2', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['id', ['friends', { attributeQuery: ['username'] }]]);
        expect((aAfter.friends || []).map((f: any) => f.username).sort()).toEqual(['B']);
    });

    // ============ F-3: dataPolicy.modifier offset bypass ============
    test('F-3: caller cannot paginate around a dataPolicy.modifier limit via offset', async () => {
        const Secret = Entity.create({ name: 'Secret', properties: [Property.create({ name: 'title', type: 'string' })] });
        const GetSecrets = Interaction.create({
            name: 'GetSecrets', action: GetAction, data: Secret,
            dataPolicy: DataPolicy.create({ modifier: { limit: 3 } })
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Secret], relations: [], eventSources: [GetSecrets] });
        await controller.setup(true);
        for (let i = 0; i < 10; i++) await system.storage.create('Secret', { title: `s${i}` });

        const seen = new Set<string>();
        let lastError: any = null;
        for (let page = 0; page < 4; page++) {
            const res = await controller.dispatch(GetSecrets, { user: { id: 'u1' } as any, query: { attributeQuery: ['id', 'title'], modifier: { offset: page * 3 } } } as any);
            if (res.error) { lastError = res.error; break; }
            for (const r of (res.data as any[]) || []) seen.add(r.id);
        }
        // caller adding offset (not declared by policy) is rejected
        expect(lastError).toBeDefined();
        expect(String((lastError as any).message ?? lastError)).toContain('modifier');
        expect(seen.size).toBeLessThanOrEqual(3);
    });

    // ============ F-5: 'program' ActivityGroup rejected at build time ============
    test("F-5: 'program' ActivityGroup is rejected with a clear error instead of dead-locking", () => {
        const head = Interaction.create({ name: 'ProgHead', action: Action.create({ name: 'progHead' }) });
        const stepA = Interaction.create({ name: 'ProgStepA', action: Action.create({ name: 'progStepA' }) });
        const after = Interaction.create({ name: 'ProgAfter', action: Action.create({ name: 'progAfter' }) });
        const group = ActivityGroup.create({
            type: 'program',
            activities: [Activity.create({ name: 'progSeqA', interactions: [stepA] })]
        });
        const act = Activity.create({
            name: 'ProgFlow', interactions: [head, after], groups: [group],
            transfers: [
                Transfer.create({ name: 'pt1', source: head, target: group }),
                Transfer.create({ name: 'pt2', source: group, target: after }),
            ]
        });
        expect(() => new ActivityManager([act])).toThrow(/program.*not supported|not supported.*program/);
    });
});
