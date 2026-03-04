import { describe, expect, test, beforeEach } from "vitest";
import { Entity, Property, Relation, BoolExp, clearAllInstances, KlassByName } from 'interaqt';
import { Controller, MonoSystem, Interaction } from 'interaqt';
import { PGLiteDB } from '@drivers';
import { Action, GetAction } from '../../src/builtins/interaction/Action.js';
import { Payload } from '../../src/builtins/interaction/Payload.js';
import { PayloadItem } from '../../src/builtins/interaction/PayloadItem.js';
import { Attributive } from '../../src/builtins/interaction/Attributive.js';
import {
    checkPayload,
    checkCondition,
    InteractionGuardError,
} from '../../src/builtins/interaction/Interaction.js';
import { Conditions } from '../../src/builtins/interaction/Conditions.js';

describe('checkPayload with concept validation', () => {
    test('checkPayload passes when payload has base Entity and valid object data', async () => {
        const UserEntity = Entity.create({ name: 'PayloadUser' });
        const payloadItem = PayloadItem.create({
            name: 'user',
            type: 'object',
            base: UserEntity,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testConceptCheck',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { user: { name: 'Alice' } },
            })
        ).resolves.toBeUndefined();
    });

    test('checkPayload fails when payload has base Entity and non-object data', async () => {
        const UserEntity = Entity.create({ name: 'PayloadUser2' });
        const payloadItem = PayloadItem.create({
            name: 'userData',
            type: 'object',
            base: UserEntity,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testConceptFail',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { userData: null },
            })
        ).rejects.toThrow(InteractionGuardError);
    });

    test('checkPayload with isCollection and base Entity validates each item', async () => {
        const ItemEntity = Entity.create({ name: 'CollItem' });
        const payloadItem = PayloadItem.create({
            name: 'items',
            type: 'object',
            base: ItemEntity,
            isCollection: true,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testCollectionConcept',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { items: [{ name: 'a' }, { name: 'b' }] },
            })
        ).resolves.toBeUndefined();
    });

    test('checkPayload rejects unknown payload keys', async () => {
        const payloadItem = PayloadItem.create({
            name: 'known',
            type: 'string',
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testUnknownKey',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { unknown: 'value' },
            })
        ).rejects.toThrow('not defined');
    });

    test('checkPayload rejects missing required payload field', async () => {
        const payloadItem = PayloadItem.create({
            name: 'required',
            type: 'string',
            required: true,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testMissingRequired',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: {},
            })
        ).rejects.toThrow('missing');
    });

    test('checkPayload rejects non-array for isCollection field', async () => {
        const payloadItem = PayloadItem.create({
            name: 'items',
            type: 'object',
            isCollection: true,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testNonArray',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { items: 'not-an-array' },
            })
        ).rejects.toThrow('not array');
    });

    test('checkPayload rejects non-ref item in isRef collection', async () => {
        const payloadItem = PayloadItem.create({
            name: 'refs',
            type: 'object',
            isRef: true,
            isCollection: true,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testRefCollection',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { refs: [{ name: 'no-id' }] },
            })
        ).rejects.toThrow('not every is ref');
    });

    test('checkPayload rejects non-ref single item when isRef', async () => {
        const payloadItem = PayloadItem.create({
            name: 'ref',
            type: 'object',
            isRef: true,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testRefSingle',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { ref: { name: 'no-id' } },
            })
        ).rejects.toThrow('not a ref');
    });
});

describe('checkCondition edge paths', () => {
    test('checkCondition with Conditions wrapper evaluates BoolExp', async () => {
        const conditionContent = async function (this: any, eventArgs: any) {
            return true;
        };

        const condition = { _type: 'Condition', uuid: 'cond-1', name: 'alwaysTrue', content: conditionContent };
        const conditions = Conditions.create({ content: BoolExp.atom(condition) });

        const interaction = Interaction.create({
            name: 'condTest',
            action: Action.create({ name: 'create' }),
            conditions,
        });

        const mockController = { system: { storage: {} }, ignoreGuard: false };

        await expect(
            checkCondition(mockController, interaction, { user: { id: 'u1' } })
        ).resolves.toBeUndefined();
    });

    test('checkCondition with failing condition throws InteractionGuardError', async () => {
        const conditionContent = async function (this: any, eventArgs: any) {
            return false;
        };

        const condition = { _type: 'Condition', uuid: 'cond-fail', name: 'alwaysFalse', content: conditionContent };

        const interaction = Interaction.create({
            name: 'condFailTest',
            action: Action.create({ name: 'create' }),
            conditions: condition as any,
        });

        const mockController = { system: { storage: {} }, ignoreGuard: false };

        await expect(
            checkCondition(mockController, interaction, { user: { id: 'u1' } })
        ).rejects.toThrow(InteractionGuardError);
    });

    test('checkCondition with throwing condition captures error message', async () => {
        const conditionContent = async function () {
            throw new Error('db connection failed');
        };

        const condition = { _type: 'Condition', uuid: 'cond-throw', name: 'throwingCond', content: conditionContent };

        const interaction = Interaction.create({
            name: 'condThrowTest',
            action: Action.create({ name: 'create' }),
            conditions: condition as any,
        });

        const mockController = { system: { storage: {} }, ignoreGuard: false };

        try {
            await checkCondition(mockController, interaction, { user: { id: 'u1' } });
        } catch (e: any) {
            expect(e).toBeInstanceOf(InteractionGuardError);
        }
    });
});

describe('checkPayload with DerivedConcept and ConceptAlias', () => {
    test('checkPayload with DerivedConcept base validates via base entity', async () => {
        const BaseEntity = Entity.create({ name: 'DerivedBase' });
        const derivedConcept = {
            base: BaseEntity,
            attributive: Attributive.create({ content: () => true, name: 'isValid' }),
        };

        const payloadItem = PayloadItem.create({
            name: 'item',
            type: 'object',
            base: derivedConcept as any,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testDerived',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { item: { name: 'valid-data' } },
            })
        ).resolves.toBeUndefined();
    });

    test('checkPayload with ConceptAlias tries multiple concepts', async () => {
        const Entity1 = Entity.create({ name: 'Alt1' });
        const Entity2 = Entity.create({ name: 'Alt2' });

        const conceptAlias = {
            name: 'MultiType',
            for: [Entity1, Entity2],
        };

        const payloadItem = PayloadItem.create({
            name: 'multi',
            type: 'object',
            base: conceptAlias as any,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testAlias',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { multi: { data: 'some-value' } },
            })
        ).resolves.toBeUndefined();
    });

    test('checkPayload with ConceptAlias rejects when no concept matches', async () => {
        const Entity1 = Entity.create({ name: 'NoMatch1' });

        const conceptAlias = {
            name: 'NoMatch',
            for: [Entity1],
        };

        const payloadItem = PayloadItem.create({
            name: 'noMatch',
            type: 'object',
            base: conceptAlias as any,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testNoMatch',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { noMatch: 42 },
            })
        ).rejects.toThrow(InteractionGuardError);
    });

    test('checkPayload with Attributive base passes validation', async () => {
        const attr = Attributive.create({ content: () => true, name: 'check' });

        const payloadItem = PayloadItem.create({
            name: 'attrItem',
            type: 'object',
            base: attr as any,
        });
        const payload = Payload.create({ items: [payloadItem] });

        const interaction = Interaction.create({
            name: 'testAttrBase',
            action: Action.create({ name: 'create' }),
            payload,
        });

        await expect(
            checkPayload(null, interaction, {
                user: { id: 'u1' },
                payload: { attrItem: { data: 'x' } },
            })
        ).resolves.toBeUndefined();
    });
});

describe('Interaction with GetAction (retrieveData path)', () => {
    test('GetAction interaction resolves data from storage', async () => {
        const DataEntity = Entity.create({
            name: 'QueryItem',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
            ],
        });

        const interaction = Interaction.create({
            name: 'getItems',
            action: GetAction,
            data: DataEntity,
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [DataEntity],
            relations: [],
            eventSources: [interaction],
            ignoreGuard: true,
        });

        await controller.setup(true);

        await system.storage.create('QueryItem', { title: 'first' });
        await system.storage.create('QueryItem', { title: 'second' });

        const result = await controller.dispatch(interaction, {
            user: { id: 'u1' },
            query: { attributeQuery: ['title'] },
        });

        expect(result.data).toBeInstanceOf(Array);
        expect((result.data as any[]).length).toBe(2);

        await system.destroy();
    });

    test('GetAction with function-based dataPolicy.match', async () => {
        const DataEntity = Entity.create({
            name: 'FilterItem',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
            ],
        });

        const interaction = Interaction.create({
            name: 'getFilteredItems',
            action: GetAction,
            data: DataEntity,
            dataPolicy: {
                _type: 'DataPolicy',
                uuid: 'dp-1',
                match: async function (this: any, eventArgs: any) {
                    return BoolExp.atom({ key: 'status', value: ['=', 'active'] });
                },
            } as any,
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [DataEntity],
            relations: [],
            eventSources: [interaction],
            ignoreGuard: true,
        });

        await controller.setup(true);

        await system.storage.create('FilterItem', { status: 'active' });
        await system.storage.create('FilterItem', { status: 'inactive' });

        const result = await controller.dispatch(interaction, {
            user: { id: 'u1' },
            query: { attributeQuery: ['status'] },
        });

        expect(result.data).toBeInstanceOf(Array);
        expect((result.data as any[]).length).toBe(1);
        expect((result.data as any[])[0].status).toBe('active');

        await system.destroy();
    });
});
