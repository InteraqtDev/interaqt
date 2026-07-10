/**
 * Regression tests for review findings F1 / F5
 * (agentspace/output/core-runtime-builtins-review.md), updated after the
 * Attributive concept was removed (Condition is the only guard concept):
 * - F1: a missing optional payload field must not skip later field checks
 * - F5: the guard chain is fail-closed (invalid payload base declarations are
 *   rejected at declaration time, isRef payloads must reference existing
 *   records, non-boolean condition results are rejected)
 * - Legacy Attributive-era declarations (userAttributives/userRef/attributives/
 *   itemRef) fail fast at declaration time instead of being silently dropped.
 */
import { describe, expect, test } from 'vitest';
import {
    Entity, Property, KlassByName, BoolExp,
    Controller, MonoSystem,
    Interaction, Action, Payload, PayloadItem,
    Condition, Conditions,
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
    test('F5-1: payload base that is not an Entity/Relation is rejected at declaration time', async () => {
        expect(() => PayloadItem.create({
            name: 'thing', type: 'Entity', base: { name: 'NotAConcept' } as any
        })).toThrow(/expected an Entity or Relation instance/);
    });

    test('F5-2: payload content checks are expressed as Conditions', async () => {
        const Doc = Entity.create({ name: 'F5CondDoc', properties: [Property.create({ name: 'title', type: 'string' })] });
        const titleRequired = Condition.create({
            name: 'titleRequired',
            content: async function (event: any) {
                return typeof event.payload?.doc?.title === 'string' && event.payload.doc.title.length > 0;
            }
        });
        const interaction = Interaction.create({
            name: 'f5CondPayload',
            action: Action.create({ name: 'f5CondPayload' }),
            conditions: titleRequired,
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'doc', type: 'Entity', base: Doc }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction, [Doc]);

        const bad = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: { title: '' } } });
        expect(bad.error).toBeTruthy();
        const ok = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: { title: 't' } } });
        expect(ok.error).toBeUndefined();
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

    test('F5-4: condition callback returning undefined is fail-closed', async () => {
        const ForgotReturn = Condition.create({
            name: 'ForgotReturn',
            content: async function (event: any) {
                // developer forgot `return`; intent was to reject non-admins
                event.user.roles?.includes('admin');
            } as any,
        });
        const interaction = Interaction.create({
            name: 'f5Undefined',
            action: Action.create({ name: 'f5Undefined' }),
            conditions: ForgotReturn,
        });
        const { controller, system } = await buildController(interaction);

        const res = await controller.dispatch(interaction, { user: { id: 'u1', roles: [] } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });

    test('F5-5: non-entity payload value for an entity base is rejected', async () => {
        const Doc = Entity.create({ name: 'F5StructDoc', properties: [Property.create({ name: 'title', type: 'string' })] });
        const interaction = Interaction.create({
            name: 'f5Struct',
            action: Action.create({ name: 'f5Struct' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'doc', type: 'Entity', base: Doc }),
                ],
            }),
        });
        const { controller, system } = await buildController(interaction, [Doc]);

        const res = await controller.dispatch(interaction, { user: { id: 'u1' }, payload: { doc: 'not-an-object' } });
        expect(res.error).toBeTruthy();
        await system.destroy();
    });
});

describe('Legacy Attributive-era declarations fail fast', () => {
    test('userAttributives on Interaction is rejected at declaration time', () => {
        expect(() => Interaction.create({
            name: 'legacyUserAttributives',
            action: Action.create({ name: 'legacyUserAttributives' }),
            userAttributives: { some: 'thing' },
        } as any)).toThrow(/Attributive concept has been removed/);
    });

    test('userRef on Interaction is rejected at declaration time', () => {
        expect(() => Interaction.create({
            name: 'legacyUserRef',
            action: Action.create({ name: 'legacyUserRef' }),
            userRef: { some: 'thing' },
        } as any)).toThrow(/Attributive concept has been removed/);
    });

    test('attributives / itemRef on PayloadItem are rejected at declaration time', () => {
        expect(() => PayloadItem.create({
            name: 'legacyAttr', type: 'string', attributives: { some: 'thing' },
        } as any)).toThrow(/Attributive concept has been removed/);
        expect(() => PayloadItem.create({
            name: 'legacyItemRef', type: 'string', itemRef: { some: 'thing' },
        } as any)).toThrow(/Attributive concept has been removed/);
    });
});
