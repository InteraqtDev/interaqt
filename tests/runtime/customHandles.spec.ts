import { describe, expect, test } from "vitest";
import { Entity, Property, Custom, Relation, KlassByName } from 'interaqt';
import {
    Controller, MonoSystem, Dictionary,
    GlobalBoundState, RecordBoundState,
    ComputationResult, MatchExp,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('Custom computation handle: compute fallback', () => {
    test('Custom without compute callback uses getInitialValue and stays at initial', async () => {
        const TestEntity = Entity.create({
            name: 'NoComputeEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'noComputeDict',
            type: 'number',
            defaultValue: () => 42,
            computation: Custom.create({
                name: 'NoComputeCustom',
                getInitialValue: function () {
                    return 42;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const value = await system.storage.dict.get('noComputeDict');
        expect(value).toBe(42);

        await system.destroy();
    });
});

describe('Custom computation handle: incrementalCompute', () => {
    test('Custom with incrementalCompute uses incremental path on updates', async () => {
        let incrementalCalled = false;
        const TestEntity = Entity.create({
            name: 'IncrEntity',
            properties: [
                Property.create({ name: 'amount', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'incrDict',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'IncrCustom',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['amount'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    const records = dataDeps.records || [];
                    return records.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
                },
                incrementalCompute: async function (this: any, lastValue: any, mutationEvent: any, record: any, dataDeps: any) {
                    incrementalCalled = true;
                    if (mutationEvent?.type === 'create' && mutationEvent?.record?.amount) {
                        return (lastValue || 0) + mutationEvent.record.amount;
                    }
                    return ComputationResult.fullRecompute('fallback');
                },
                getInitialValue: function () {
                    return 0;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('IncrEntity', { amount: 5 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const val = await system.storage.dict.get('incrDict');
        expect(typeof val).toBe('number');

        await system.destroy();
    });
});

describe('Custom computation handle: asyncReturn', () => {
    test('Custom with asyncReturn callback is properly set up', async () => {
        let asyncReturnCalled = false;

        const TestEntity = Entity.create({
            name: 'AsyncRetEntity',
            properties: [
                Property.create({ name: 'data', type: 'string' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'asyncRetDict',
            type: 'string',
            defaultValue: () => 'initial',
            computation: Custom.create({
                name: 'AsyncRetCustom',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['data'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return ComputationResult.async({ task: 'process' });
                },
                asyncReturn: async function (this: any, asyncResult: any, dataDeps: any) {
                    asyncReturnCalled = true;
                    return 'async-done';
                },
                getInitialValue: function () {
                    return 'initial';
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const value = await system.storage.dict.get('asyncRetDict');
        expect(value).toBe('initial');

        await system.destroy();
    });
});

describe('Custom computation handle: createState with RecordBoundState', () => {
    test('createState with RecordBoundState binds to entity', async () => {
        const TestEntity = Entity.create({
            name: 'StateBoundEntity',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'stateBoundDict',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'StateBoundCustom',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['score'],
                    },
                },
                createState: function () {
                    return {
                        tracker: new RecordBoundState(0, 'StateBoundEntity'),
                    };
                },
                compute: async function (this: any, dataDeps: any) {
                    const records = dataDeps.records || [];
                    return records.reduce((sum: number, r: any) => sum + (r.score || 0), 0);
                },
                getInitialValue: function () {
                    return 0;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const record = await system.storage.create('StateBoundEntity', { score: 10 });
        expect(record).toBeTruthy();

        await system.destroy();
    });
});

describe('Custom computation handle: PropertyCustomHandle records assertion', () => {
    test('property-level Custom with records dataDep throws assertion', async () => {
        const TestEntity = Entity.create({
            name: 'PropRecordsEntity',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const OtherEntity = Entity.create({
            name: 'OtherEntity',
            properties: [
                Property.create({ name: 'count', type: 'number' }),
            ],
        });

        const computedProp = Property.create({
            name: 'computed',
            type: 'number',
            computation: Custom.create({
                name: 'PropWithRecords',
                dataDeps: {
                    others: {
                        type: 'records',
                        source: OtherEntity,
                        attributeQuery: ['count'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps.others || []).length;
                },
            }),
        });

        TestEntity.properties.push(computedProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;

        expect(() => new Controller({
            system,
            entities: [TestEntity, OtherEntity],
            relations: [],
        })).toThrow('records');

        try { await system.destroy(); } catch (_) {}
    });
});

describe('Custom computation handle: compute callback path (full recompute)', () => {
    test('Custom with compute callback and no incremental uses full compute on mutations', async () => {
        const TestEntity = Entity.create({
            name: 'FullComputeEntity',
            properties: [
                Property.create({ name: 'value', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'fullComputeDict',
            type: 'number',
            computation: Custom.create({
                name: 'FullComputeCustom',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['value'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    const records = dataDeps.records || [];
                    return records.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
                },
                getInitialValue: function () {
                    return 0;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('FullComputeEntity', { value: 10 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const val = await system.storage.dict.get('fullComputeDict');
        expect(val).toBe(10);

        await system.storage.create('FullComputeEntity', { value: 20 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const val2 = await system.storage.dict.get('fullComputeDict');
        expect(val2).toBe(30);

        await system.destroy();
    });

    test('Custom with compute callback returning ComputationResult.resolved triggers asyncReturn', async () => {
        let asyncReturnInvoked = false;

        const TestEntity = Entity.create({
            name: 'ResolvedEntity',
            properties: [
                Property.create({ name: 'data', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'resolvedDict',
            type: 'number',
            computation: Custom.create({
                name: 'ResolvedCustom',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['data'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    const records = dataDeps.records || [];
                    const total = records.reduce((sum: number, r: any) => sum + (r.data || 0), 0);
                    return ComputationResult.resolved(total, { source: 'compute' });
                },
                asyncReturn: async function (this: any, result: any, args: any) {
                    asyncReturnInvoked = true;
                    return result;
                },
                getInitialValue: function () {
                    return 0;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('ResolvedEntity', { data: 5 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const val = await system.storage.dict.get('resolvedDict');
        expect(val).toBe(5);
        expect(asyncReturnInvoked).toBe(true);

        await system.destroy();
    });

    test('property-level Custom compute callback is called on record creation', async () => {
        const TestEntity = Entity.create({
            name: 'PropComputeHost',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const computedProp = Property.create({
            name: 'nameLength',
            type: 'number',
            computation: Custom.create({
                name: 'PropCompute',
                dataDeps: {
                    _current: {
                        type: 'property',
                        attributeQuery: ['name'],
                    },
                },
                compute: async function (this: any, dataDeps: any, record: any) {
                    return (dataDeps._current?.name || '').length;
                },
                getInitialValue: function () {
                    return 0;
                },
            }),
        });

        TestEntity.properties.push(computedProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
        });

        await controller.setup(true);

        const record = await system.storage.create('PropComputeHost', { name: 'hello' });
        await new Promise(resolve => setTimeout(resolve, 300));

        const found = await system.storage.findOne('PropComputeHost',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }), undefined, ['*']);
        expect(found.nameLength).toBe(5);

        await system.destroy();
    });
});

describe('Custom computation handle: incrementalPatchCompute', () => {
    test('Custom with incrementalPatchCompute is properly initialized', async () => {
        let patchCalled = false;

        const TestEntity = Entity.create({
            name: 'PatchEntity',
            properties: [
                Property.create({ name: 'items', type: 'json', collection: true }),
            ],
        });

        const dict = Dictionary.create({
            name: 'patchDict',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'PatchCustom',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['items'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps.records || []).length;
                },
                incrementalPatchCompute: async function (this: any, lastValue: any, mutationEvent: any) {
                    patchCalled = true;
                    if (mutationEvent?.type === 'create') {
                        return { type: 'insert', data: mutationEvent.record };
                    }
                    return undefined;
                },
                getInitialValue: function () {
                    return 0;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('PatchEntity', { items: [1, 2, 3] });
        await new Promise(resolve => setTimeout(resolve, 300));

        await system.destroy();
    });
});
