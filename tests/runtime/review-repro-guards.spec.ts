/**
 * Reproduction tests for review findings F1 / F6 / F7
 * (agentspace/output/core-runtime-builtins-review.md).
 *
 * Every test asserts the CORRECT behavior and is marked `test.fails`:
 * it passes today because the bug makes the assertion fail. When a bug is
 * fixed, the corresponding test will turn red - remove `.fails` then.
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

describe('F1: checkPayload early return', () => {
    // BUG: `if (payloadItem === undefined) return;` in checkPayload should be
    // `continue`. A missing OPTIONAL field defined before a REQUIRED field
    // aborts the whole loop, skipping the required check (and every other
    // check for the remaining fields).
    test.fails('missing optional field before a required field must not bypass the required check', async () => {
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
        await system.destroy();
    });
});

describe('F6: guard chain fail-open', () => {
    // BUG: checkConcept returns true for any Attributive base without ever
    // calling its content - payload-level attributive checks are a no-op.
    test.fails('F6-1: payload item with an Attributive base executes the attributive', async () => {
        const RejectEverything = Attributive.create({
            name: 'RejectEverything',
            content: function () { return false; },
        });
        const interaction = Interaction.create({
            name: 'f6AttributiveBase',
            action: Action.create({ name: 'f6AttributiveBase' }),
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

    // BUG: isRef payloads are only shape-checked ({id}); the referenced record
    // is never verified to exist (or to belong to the declared entity).
    test.fails('F6-3: isRef payload referencing a nonexistent record is rejected', async () => {
        const Doc = Entity.create({ name: 'F6Doc', properties: [Property.create({ name: 'title', type: 'string' })] });
        const interaction = Interaction.create({
            name: 'f6IsRef',
            action: Action.create({ name: 'f6IsRef' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'doc', type: 'Entity', base: Doc, isRef: true }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction, [Doc]);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: { id: 'no-such-id-999' } } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });

    // BUG: `if (result === undefined) return true` - an attributive callback
    // that forgets to return grants access (fail-open). Thrown exceptions are
    // fail-closed, undefined is not; the two should be consistent.
    test.fails('F6-4: attributive callback returning undefined is fail-closed', async () => {
        const ForgotReturn = Attributive.create({
            name: 'ForgotReturn',
            content: function (this: any, user: any) {
                // developer forgot `return`; intent was to reject non-admins
                user.roles?.includes('admin');
            },
        });
        const interaction = Interaction.create({
            name: 'f6Undefined',
            action: Action.create({ name: 'f6Undefined' }),
            userAttributives: ForgotReturn,
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1', roles: [] } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });
});

describe('F7: isRef attributive on a standalone interaction', () => {
    // isRef semantics = "must be the specific user bound in the activity refs".
    // BUG: standalone checkUser has no isRef branch, so the attributive runs
    // as a plain role check (`user.roles.includes('Approver')`). Outside an
    // activity there are no refs, so an isRef attributive should be rejected
    // (fail-closed) instead of silently changing meaning.
    test.fails('isRef userAttributive outside an activity must not degrade to a role check', async () => {
        const boundApprover = createUserRoleAttributive({ name: 'Approver', isRef: true });
        const interaction = Interaction.create({
            name: 'f7IsRefStandalone',
            action: Action.create({ name: 'f7IsRefStandalone' }),
            userAttributives: boundApprover,
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'intruder', roles: ['Approver'] } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });
});
