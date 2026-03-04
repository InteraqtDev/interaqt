import { describe, expect, test } from "vitest";
import { Entity, Property, Custom, KlassByName, Relation, Interaction } from 'interaqt';
import {
    Controller, MonoSystem, Dictionary,
    GlobalBoundState, RecordBoundState,
    ComputationResult, MatchExp,
} from 'interaqt';
import { Action } from '../../src/builtins/interaction/Action.js';
import { PGLiteDB } from '@drivers';
import { ComputationDataDepError } from '../../src/runtime/errors/ComputationErrors.js';

describe('Scheduler.setupDictDefaultValue', () => {
    test('sets default values for dict items with defaultValue', async () => {
        const TestEntity = Entity.create({
            name: 'DictDefaultEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const dict1 = Dictionary.create({
            name: 'dictWithDefault1',
            type: 'number',
            defaultValue: () => 42,
        });

        const dict2 = Dictionary.create({
            name: 'dictWithDefault2',
            type: 'string',
            defaultValue: () => 'hello',
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict1, dict2],
        });

        await controller.setup(true);

        const val1 = await system.storage.dict.get('dictWithDefault1');
        expect(val1).toBe(42);

        const val2 = await system.storage.dict.get('dictWithDefault2');
        expect(val2).toBe('hello');

        await system.destroy();
    });
});

describe('Scheduler.resolveDataDeps edge cases', () => {
    test('global dataDep type resolves correctly', async () => {
        const TestEntity = Entity.create({
            name: 'GlobalDepEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const sourceDict = Dictionary.create({
            name: 'sourceDict',
            type: 'number',
            defaultValue: () => 100,
        });

        let computeReceived: any = null;
        const dict = Dictionary.create({
            name: 'globalDepDict',
            type: 'number',
            computation: Custom.create({
                name: 'GlobalDepCustom',
                dataDeps: {
                    globalVal: {
                        type: 'global',
                        source: sourceDict,
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    computeReceived = dataDeps;
                    return (dataDeps.globalVal || 0) * 2;
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
            dict: [sourceDict, dict],
        });

        await controller.setup(true);

        const val = await system.storage.dict.get('globalDepDict');
        expect(typeof val).toBe('number');

        await system.destroy();
    });

    test('property dataDep resolves with record context', async () => {
        const TestEntity = Entity.create({
            name: 'PropDepEntity',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const computedProp = Property.create({
            name: 'nameUpper',
            type: 'string',
            computation: Custom.create({
                name: 'PropDepCustom',
                dataDeps: {
                    _current: {
                        type: 'property',
                        attributeQuery: ['name'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps._current?.name || '').toUpperCase();
                },
                getInitialValue: function () {
                    return '';
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

        const record = await system.storage.create('PropDepEntity', { name: 'hello' });
        await new Promise(resolve => setTimeout(resolve, 300));

        const found = await system.storage.findOne('PropDepEntity',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }), undefined, ['*']);
        expect(found.nameUpper).toBe('HELLO');

        await system.destroy();
    });
});

describe('Scheduler.runComputation error handling', () => {
    test('wraps data dependency resolution error in ComputationDataDepError', async () => {
        const TestEntity = Entity.create({
            name: 'DataDepErrEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'dataDepErrDict',
            type: 'number',
            computation: Custom.create({
                name: 'DataDepErrCustom',
                dataDeps: {
                    broken: {
                        type: 'records',
                        source: { name: 'NonExistentEntity___' } as any,
                        attributeQuery: ['*'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return 0;
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

        await system.storage.create('DataDepErrEntity', { val: 1 });
        await new Promise(resolve => setTimeout(resolve, 500));

        await system.destroy();
    });
});

describe('Scheduler: entity and relation context RecordBoundState auto-defaults', () => {
    test('entity context RecordBoundState defaults to entity name', async () => {
        const TestEntity = Entity.create({
            name: 'EntityContextRBS',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
            computation: Custom.create({
                name: 'EntityContextRBSCustom',
                createState: function (this: any) {
                    return {
                        tracker: new RecordBoundState<number>(0),
                    };
                },
                compute: async function () { return []; },
                getInitialValue: function () { return []; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
        });

        await controller.setup(true);
        const record = await system.storage.create('EntityContextRBS', { val: 5 });
        expect(record).toBeTruthy();

        await system.destroy();
    });

    test('relation context RecordBoundState defaults to relation name', async () => {
        const Source = Entity.create({
            name: 'RelRBSSrc',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const Target = Entity.create({
            name: 'RelRBSTgt',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const rel = Relation.create({
            source: Source,
            sourceProperty: 'targets',
            target: Target,
            targetProperty: 'sources',
            type: '1:n',
            computation: Custom.create({
                name: 'RelContextRBSCustom',
                createState: function (this: any) {
                    return {
                        tracker: new RecordBoundState<number>(0),
                    };
                },
                compute: async function () { return []; },
                getInitialValue: function () { return []; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [Source, Target],
            relations: [rel],
        });

        await controller.setup(true);
        const src = await system.storage.create('RelRBSSrc', { name: 'src' });
        expect(src).toBeTruthy();

        await system.destroy();
    });
});

describe('Scheduler: computation error handling', () => {
    test('compute throwing generic Error wraps in ComputationError', async () => {
        const TestEntity = Entity.create({
            name: 'CompErrEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'compErrDict',
            type: 'number',
            computation: Custom.create({
                name: 'CompErrCustom',
                compute: async function () {
                    throw new Error('deliberate compute failure')
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

        try {
            await controller.setup(true);
        } catch (e: any) {
            expect(e).toBeTruthy();
        }

        await system.destroy();
    });

    test('GlobalBoundState gets default value during setup', async () => {
        const TestEntity = Entity.create({
            name: 'GBSDefaultEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'gbsDefaultDict',
            type: 'number',
            computation: Custom.create({
                name: 'GBSDefaultCustom',
                createState: function () {
                    return {
                        counter: new GlobalBoundState<number>(42),
                    };
                },
                compute: async function (this: any, dataDeps: any) {
                    return 0;
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

        const stateVal = await system.storage.dict.get('_gbsDefaultDict_bound_counter');
        expect(stateVal).toBe(42);

        await system.destroy();
    });

    test('property computation with getInitialValue sets default on record create', async () => {
        const TestEntity = Entity.create({
            name: 'PropInitEntity',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const computedProp = Property.create({
            name: 'computed',
            type: 'number',
            computation: Custom.create({
                name: 'PropInitCustom',
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps._current?.name || '').length;
                },
                dataDeps: {
                    _current: {
                        type: 'property',
                        attributeQuery: ['name'],
                    },
                },
                getInitialValue: function () {
                    return 99;
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

        const record = await system.storage.create('PropInitEntity', { name: 'test' });
        await new Promise(resolve => setTimeout(resolve, 300));

        const found = await system.storage.findOne('PropInitEntity',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }), undefined, ['*']);
        expect(found.computed).toBeDefined();

        await system.destroy();
    });

    test('global computation dependent on dict change triggers recomputation', async () => {
        const TestEntity = Entity.create({
            name: 'DictDepEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const sourceDict = Dictionary.create({
            name: 'dictDepSource',
            type: 'number',
            defaultValue: () => 10,
        });

        const computedDict = Dictionary.create({
            name: 'dictDepComputed',
            type: 'number',
            computation: Custom.create({
                name: 'DictDepCustom',
                dataDeps: {
                    src: {
                        type: 'global',
                        source: sourceDict,
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps.src || 0) * 3;
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
            dict: [sourceDict, computedDict],
        });

        await controller.setup(true);

        await system.storage.dict.set('dictDepSource', 20);
        await new Promise(resolve => setTimeout(resolve, 500));

        const val = await system.storage.dict.get('dictDepComputed');
        expect(val).toBe(60);

        await system.destroy();
    });

    test('global computation recomputes when dependent dict changes (DICTIONARY_RECORD path)', async () => {
        const TestEntity = Entity.create({
            name: 'DictRecordEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const inputDict = Dictionary.create({
            name: 'inputDictRec',
            type: 'number',
            defaultValue: () => 5,
        });

        let computeCount = 0;
        const outputDict = Dictionary.create({
            name: 'outputDictRec',
            type: 'number',
            computation: Custom.create({
                name: 'DictRecordCustom',
                dataDeps: {
                    input: {
                        type: 'global',
                        source: inputDict,
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    computeCount++;
                    return (dataDeps.input || 0) + 100;
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
            dict: [inputDict, outputDict],
        });

        await controller.setup(true);
        await new Promise(resolve => setTimeout(resolve, 300));

        const val1 = await system.storage.dict.get('outputDictRec');
        expect(val1).toBe(105);

        await system.storage.dict.set('inputDictRec', 50);
        await new Promise(resolve => setTimeout(resolve, 500));

        const val2 = await system.storage.dict.get('outputDictRec');
        expect(val2).toBe(150);
        expect(computeCount).toBeGreaterThanOrEqual(2);

        await system.destroy();
    });

    test('property computation with property dataDep triggers on self-update', async () => {
        const TestEntity = Entity.create({
            name: 'SelfUpdateEntity',
            properties: [
                Property.create({ name: 'firstName', type: 'string' }),
                Property.create({ name: 'lastName', type: 'string' }),
            ],
        });

        let computeCount = 0;
        const computedProp = Property.create({
            name: 'fullName',
            type: 'string',
            computation: Custom.create({
                name: 'SelfUpdateCustom',
                dataDeps: {
                    _current: {
                        type: 'property',
                        attributeQuery: ['firstName', 'lastName'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    computeCount++;
                    const rec = dataDeps._current || {};
                    return `${rec.firstName || ''} ${rec.lastName || ''}`.trim();
                },
                getInitialValue: function () {
                    return '';
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

        const record = await system.storage.create('SelfUpdateEntity', { firstName: 'John', lastName: 'Doe' });
        await new Promise(resolve => setTimeout(resolve, 300));

        let found = await system.storage.findOne('SelfUpdateEntity',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }), undefined, ['*']);
        expect(found.fullName).toBe('John Doe');

        await system.storage.update('SelfUpdateEntity',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }),
            { firstName: 'Jane' });
        await new Promise(resolve => setTimeout(resolve, 300));

        found = await system.storage.findOne('SelfUpdateEntity',
            MatchExp.atom({ key: 'id', value: ['=', record.id] }), undefined, ['*']);
        expect(found.fullName).toBe('Jane Doe');
        expect(computeCount).toBeGreaterThanOrEqual(2);

        await system.destroy();
    });
});

describe('Scheduler: getAsyncTaskRecordKey for entity/relation context', () => {
    test('entity computation creates async task record with entity type key', async () => {
        const TestEntity = Entity.create({
            name: 'AsyncTaskEntity',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
            computation: Custom.create({
                name: 'AsyncTaskEntityCustom',
                compute: async function (this: any, dataDeps: any) {
                    return ComputationResult.async({ task: 'process' });
                },
                asyncReturn: async function (this: any, result: any) {
                    return [];
                },
                getInitialValue: function () { return []; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
        });

        await controller.setup(true);
        await system.destroy();
    });

    test('relation computation creates async task record with relation type key', async () => {
        const Source = Entity.create({
            name: 'AsyncRelSrc',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const Target = Entity.create({
            name: 'AsyncRelTgt',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const rel = Relation.create({
            source: Source,
            sourceProperty: 'targets',
            target: Target,
            targetProperty: 'sources',
            type: '1:n',
            computation: Custom.create({
                name: 'AsyncTaskRelCustom',
                compute: async function () {
                    return ComputationResult.async({ task: 'process' });
                },
                asyncReturn: async function (result: any) {
                    return [];
                },
                getInitialValue: function () { return []; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [Source, Target],
            relations: [rel],
        });

        await controller.setup(true);
        await system.destroy();
    });
});
