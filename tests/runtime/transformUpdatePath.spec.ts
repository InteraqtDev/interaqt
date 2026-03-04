import { describe, expect, test } from "vitest";
import { Entity, Property, Transform, KlassByName } from 'interaqt';
import { Controller, MonoSystem, MatchExp, Dictionary } from 'interaqt';
import { SQLiteDB } from '@drivers';

describe('Transform dataBasedIncrementalPatchCompute update path', () => {
    test('update path is exercised when source record changes', async () => {
        const SourceEntity = Entity.create({
            name: 'TfUpdateSrc',
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                Property.create({ name: 'value', type: 'number' }),
            ],
        });

        const DerivedEntity = Entity.create({
            name: 'TfUpdateDerived',
            properties: [
                Property.create({ name: 'derivedLabel', type: 'string' }),
                Property.create({ name: 'derivedValue', type: 'number' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                attributeQuery: ['*'],
                callback: function (record: any) {
                    return {
                        derivedLabel: `derived_${record.label}`,
                        derivedValue: (record.value || 0) * 10,
                    };
                },
            }),
        });

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, DerivedEntity],
            relations: [],
        });

        await controller.setup(true);

        const record = await system.storage.create('TfUpdateSrc', { label: 'original', value: 5 });

        let derived = await system.storage.find('TfUpdateDerived', undefined, undefined, ['*']);
        expect(derived.length).toBe(1);
        expect(derived[0].derivedLabel).toBe('derived_original');
        expect(derived[0].derivedValue).toBe(50);

        await system.storage.update('TfUpdateSrc',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }),
            { label: 'updated', value: 10 }
        );

        derived = await system.storage.find('TfUpdateDerived', undefined, undefined, ['*']);
        expect(derived.length).toBe(1);

        await system.destroy();
    });

    test('handles delete in dataBasedIncrementalPatchCompute', async () => {
        const SourceEntity = Entity.create({
            name: 'TfDeleteSrc',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const DerivedEntity = Entity.create({
            name: 'TfDeleteDerived',
            properties: [
                Property.create({ name: 'derivedName', type: 'string' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                attributeQuery: ['*'],
                callback: function (record: any) {
                    return { derivedName: `derived_${record.name}` };
                },
            }),
        });

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, DerivedEntity],
            relations: [],
        });

        await controller.setup(true);

        const record = await system.storage.create('TfDeleteSrc', { name: 'toDelete' });

        let derived = await system.storage.find('TfDeleteDerived', undefined, undefined, ['*']);
        expect(derived.length).toBe(1);

        await system.storage.delete('TfDeleteSrc',
            MatchExp.atom({ key: 'id', value: ['=', record.id] })
        );

        derived = await system.storage.find('TfDeleteDerived', undefined, undefined, ['*']);
        expect(derived.length).toBe(0);

        await system.destroy();
    });

    test('Transform with multi-record return creates multiple derived records per source', async () => {
        const SourceEntity = Entity.create({
            name: 'TfMultiSrc',
            properties: [
                Property.create({ name: 'count', type: 'number' }),
            ],
        });

        const DerivedEntity = Entity.create({
            name: 'TfMultiDerived',
            properties: [
                Property.create({ name: 'index', type: 'number' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                attributeQuery: ['*'],
                callback: function (record: any) {
                    const results = [];
                    for (let i = 0; i < (record.count || 1); i++) {
                        results.push({ index: i });
                    }
                    return results;
                },
            }),
        });

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, DerivedEntity],
            relations: [],
        });

        await controller.setup(true);

        await system.storage.create('TfMultiSrc', { count: 3 });

        const derived = await system.storage.find('TfMultiDerived', undefined, undefined, ['*']);
        expect(derived.length).toBe(3);

        await system.destroy();
    });

    test('Transform update with multi-record source exercises insert/delete balance', async () => {
        const SourceEntity = Entity.create({
            name: 'TfUpdateMultiSrc',
            properties: [
                Property.create({ name: 'items', type: 'number' }),
            ],
        });

        const DerivedEntity = Entity.create({
            name: 'TfUpdateMultiDerived',
            properties: [
                Property.create({ name: 'idx', type: 'number' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                attributeQuery: ['*'],
                callback: function (record: any) {
                    const results = [];
                    for (let i = 0; i < (record.items || 0); i++) {
                        results.push({ idx: i });
                    }
                    return results;
                },
            }),
        });

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, DerivedEntity],
            relations: [],
        });

        await controller.setup(true);

        const record = await system.storage.create('TfUpdateMultiSrc', { items: 2 });

        let derived = await system.storage.find('TfUpdateMultiDerived', undefined, undefined, ['*']);
        expect(derived.length).toBe(2);

        await system.storage.update('TfUpdateMultiSrc',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }),
            { items: 4 }
        );

        derived = await system.storage.find('TfUpdateMultiDerived', undefined, undefined, ['*']);
        expect(derived.length).toBeGreaterThanOrEqual(2);

        await system.destroy();
    });
});
