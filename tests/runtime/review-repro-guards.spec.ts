/**
 * Regression tests for review findings F1 / F5 / F6
 * (agentspace/output/core-runtime-builtins-review.md).
 *
 * Originally committed as failing-by-design (`test.fails`) reproductions;
 * the bugs are fixed, so these now assert the correct guard-chain behavior:
 * - F1: a missing optional payload field must not skip later field checks
 * - F5: the guard chain is fail-closed (attributive base executes, unknown
 *   concept types are rejected, isRef payloads must reference existing
 *   records, undefined callback results are rejected, derived-concept
 *   attributives execute)
 * - F6: isRef user attributives are rejected outside an activity instead of
 *   silently degrading to a role check
 */
import { describe, expect, test } from 'vitest';
import {
    Entity, Property, KlassByName,
    Controller, MonoSystem,
    Interaction, Action, Payload, PayloadItem,
    Attributive, createUserRoleAttributive,
} from 'interaqt';
import { SQLiteDB } from '@drivers';

async function buildController(interaction: any, entities: any[] = []) {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system,
        entities: [User, ...entities],
        relations: [],
        eventSources: [interaction],
    });
    await controller.setup(true);
    return { controller, system };
}

describe('F1: checkPayload must not stop at a missing optional field', () => {
    test('missing optional field before a required field must not bypass the required check', async () => {
        const interaction = Interaction.create({
            name: 'f1CreateItem',
            action: Action.create({ name: 'f1CreateItem' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'note', type: 'string', required: false }),
                    PayloadItem.create({ name: 'title', type: 'string', required: true }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: {} });
        expect(res.error).toBeTruthy();

        // providing the required field (still omitting the optional one) passes
        const ok = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { title: 'hello' } });
        expect(ok.error).toBeUndefined();
        await system.destroy();
    });
});

describe('F5: guard chain is fail-closed', () => {
    test('F5-1: payload item with an Attributive base executes the attributive', async () => {
        const RejectEverything = Attributive.create({
            name: 'RejectEverything',
            content: function () { return false; },
        });
        const interaction = Interaction.create({
            name: 'f5AttributiveBase',
            action: Action.create({ name: 'f5AttributiveBase' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'thing', type: 'Entity', base: RejectEverything as any }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { thing: { foo: 1 } } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });

    test('F5-1b: payload item with an accepting Attributive base passes', async () => {
        const AcceptEverything = Attributive.create({
            name: 'AcceptEverything',
            content: function () { return true; },
        });
        const interaction = Interaction.create({
            name: 'f5AttributiveBaseOk',
            action: Action.create({ name: 'f5AttributiveBaseOk' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'thing', type: 'Entity', base: AcceptEverything as any }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { thing: { foo: 1 } } });
        expect(res.error).toBeUndefined();
        await system.destroy();
    });

    test('F5-2: unknown concept type as payload base is rejected instead of silently passing', async () => {
        const interaction = Interaction.create({
            name: 'f5UnknownConcept',
            action: Action.create({ name: 'f5UnknownConcept' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'thing', type: 'Entity', base: { name: 'NotAConcept' } as any }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { thing: { foo: 1 } } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });

    test('F5-3: isRef payload referencing a nonexistent record is rejected', async () => {
        const Doc = Entity.create({ name: 'F5Doc', properties: [Property.create({ name: 'title', type: 'string' })] });
        const interaction = Interaction.create({
            name: 'f5IsRef',
            action: Action.create({ name: 'f5IsRef' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'doc', type: 'Entity', base: Doc, isRef: true }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction, [Doc]);

        const bad = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: { id: 'no-such-id-999' } } });
        expect(bad.error).toBeTruthy();

        // an existing record passes
        const doc = await system.storage.create('F5Doc', { title: 't' });
        const ok = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: { id: doc.id } } });
        expect(ok.error).toBeUndefined();
        await system.destroy();
    });

    test('F5-4: attributive callback returning undefined is fail-closed', async () => {
        const ForgotReturn = Attributive.create({
            name: 'ForgotReturn',
            content: function (this: any, user: any) {
                // developer forgot `return`; intent was to reject non-admins
                user.roles?.includes('admin');
            },
        });
        const interaction = Interaction.create({
            name: 'f5Undefined',
            action: Action.create({ name: 'f5Undefined' }),
            userAttributives: ForgotReturn,
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1', roles: [] } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });

    test('F5-5: DerivedConcept attributive is executed, not skipped', async () => {
        const Doc = Entity.create({ name: 'F5DerivedDoc', properties: [Property.create({ name: 'title', type: 'string' })] });
        const RejectEverything = Attributive.create({
            name: 'F5DerivedReject',
            content: function () { return false; },
        });
        const derivedConcept = { name: 'RejectedDoc', base: Doc, attributive: RejectEverything };
        const interaction = Interaction.create({
            name: 'f5Derived',
            action: Action.create({ name: 'f5Derived' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'doc', type: 'Entity', base: derivedConcept as any }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction, [Doc]);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: { title: 't' } } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });
});

describe('F6: isRef attributive on a standalone interaction', () => {
    // isRef semantics = "must be the specific user bound in the activity refs".
    // A standalone interaction has no refs context, so an isRef attributive must be
    // rejected (fail-closed) instead of silently degrading into a role check.
    test('isRef userAttributive outside an activity must not degrade to a role check', async () => {
        const boundApprover = createUserRoleAttributive({ name: 'Approver', isRef: true });
        const interaction = Interaction.create({
            name: 'f6IsRefStandalone',
            action: Action.create({ name: 'f6IsRefStandalone' }),
            userAttributives: boundApprover,
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'intruder', roles: ['Approver'] } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });
});
