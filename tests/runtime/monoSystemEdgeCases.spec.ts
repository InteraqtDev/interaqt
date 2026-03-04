import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Custom, KlassByName } from 'interaqt';
import {
    Controller, MonoSystem, MatchExp,
    RecordBoundState, GlobalBoundState,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('MonoSystem setup: filtered entity base traversal', () => {
    test('RecordBoundState on filtered entity resolves to root base entity', async () => {
        const BaseEntity = Entity.create({
            name: 'FilterBase',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
            ],
        });

        const FilteredEntity = Entity.create({
            name: 'FilteredActive',
            baseEntity: BaseEntity,
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
        });

        const computedProp = Property.create({
            name: 'filterStatus',
            type: 'string',
            computation: Custom.create({
                name: 'FilteredCustom',
                createState: function (this: any) {
                    return {
                        tracker: new RecordBoundState<string>('none', 'FilteredActive'),
                    };
                },
                compute: async function () { return 'computed'; },
                getInitialValue: function () { return 'init'; },
            }),
        });

        BaseEntity.properties.push(computedProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [BaseEntity, FilteredEntity],
            relations: [],
        });

        await controller.setup(true);
        const record = await system.storage.create('FilterBase', { status: 'active' });
        expect(record).toBeTruthy();

        await system.destroy();
    });
});

describe('MonoSystem setup: filtered relation base traversal', () => {
    test('RecordBoundState on filtered relation resolves to root base relation', async () => {
        const Source = Entity.create({
            name: 'RelSource',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const Target = Entity.create({
            name: 'RelTarget',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const baseRel = Relation.create({
            source: Source,
            sourceProperty: 'targets',
            target: Target,
            targetProperty: 'source',
            type: '1:n',
            properties: [
                Property.create({ name: 'relStatus', type: 'string' }),
            ],
        });

        const filteredRel = Relation.create({
            baseRelation: baseRel,
            sourceProperty: 'activeTargets',
            targetProperty: 'activeSource',
            matchExpression: MatchExp.atom({ key: 'relStatus', value: ['=', 'active'] }),
        });

        const trackerProp = Property.create({
            name: 'isTracked',
            type: 'string',
            computation: Custom.create({
                name: 'RelFilteredCustom',
                createState: function (this: any) {
                    return {
                        tracker: new RecordBoundState<string>('none', filteredRel.name!),
                    };
                },
                compute: async function () { return 'tracked'; },
                getInitialValue: function () { return 'init'; },
            }),
        });

        baseRel.properties.push(trackerProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [Source, Target],
            relations: [baseRel, filteredRel],
        });

        await controller.setup(true);

        const sourceRecord = await system.storage.create('RelSource', { name: 'src' });
        const targetRecord = await system.storage.create('RelTarget', { name: 'tgt' });
        expect(sourceRecord).toBeTruthy();
        expect(targetRecord).toBeTruthy();

        await system.destroy();
    });
});

describe('MonoSystem setup: RecordBoundState with Property defaultValue', () => {
    test('RecordBoundState with Property instance as defaultValue uses it directly', async () => {
        const TestEntity = Entity.create({
            name: 'PropDefaultEntity',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const propDefault = Property.create({
            name: '_placeholder_',
            type: 'number',
            defaultValue: () => 0,
        });

        const computedProp = Property.create({
            name: 'counter',
            type: 'number',
            computation: Custom.create({
                name: 'PropDefaultCustom',
                createState: function (this: any) {
                    return {
                        stateWithPropDefault: new RecordBoundState(propDefault, 'PropDefaultEntity'),
                    };
                },
                compute: async function () { return 0; },
                getInitialValue: function () { return 0; },
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

        const record = await system.storage.create('PropDefaultEntity', { name: 'test' });
        expect(record).toBeTruthy();

        await system.destroy();
    });
});

describe('MonoSystem setup: entity/relation not found error', () => {
    test('throws error when RecordBoundState references unknown record name via Custom computation', async () => {
        const TestEntity = Entity.create({
            name: 'CustomStateHost',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const customComputation = Custom.create({
            name: 'badState',
            createState: function (this: any) {
                return {
                    tracker: new RecordBoundState<number>(0, 'NonExistentEntity'),
                };
            },
            compute: async function () { return 0; },
        });

        const computedProp = Property.create({
            name: 'computed',
            type: 'number',
            computation: customComputation,
        });

        TestEntity.properties.push(computedProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
        });

        await expect(controller.setup(true)).rejects.toThrow('Entity or Relation not found: NonExistentEntity');
        try { await system.destroy(); } catch (_) {}
    });
});

describe('MonoSystem setup: multi-level filtered entity base traversal', () => {
    test('RecordBoundState on doubly-filtered entity resolves to root base entity (2-level while loop)', async () => {
        const RootEntity = Entity.create({
            name: 'MultiLevelRoot',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'priority', type: 'number' }),
            ],
        });

        const FilteredLevel1 = Entity.create({
            name: 'FilteredLevel1',
            baseEntity: RootEntity,
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
        });

        const FilteredLevel2 = Entity.create({
            name: 'FilteredLevel2',
            baseEntity: FilteredLevel1,
            matchExpression: MatchExp.atom({ key: 'priority', value: ['>', 5] }),
        });

        const computedProp = Property.create({
            name: 'multiLevelTracker',
            type: 'string',
            computation: Custom.create({
                name: 'MultiLevelCustom',
                createState: function (this: any) {
                    return {
                        tracker: new RecordBoundState<string>('none', 'FilteredLevel2'),
                    };
                },
                compute: async function () { return 'computed'; },
                getInitialValue: function () { return 'init'; },
            }),
        });

        RootEntity.properties.push(computedProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [RootEntity, FilteredLevel1, FilteredLevel2],
            relations: [],
        });

        await controller.setup(true);
        const record = await system.storage.create('MultiLevelRoot', { status: 'active', priority: 10 });
        expect(record).toBeTruthy();

        await system.destroy();
    });

    test('RecordBoundState on multi-level filtered relation traverses to root', async () => {
        const SrcEntity = Entity.create({
            name: 'MultiRelSrc',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const TgtEntity = Entity.create({
            name: 'MultiRelTgt',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });

        const baseRel = Relation.create({
            source: SrcEntity,
            sourceProperty: 'items',
            target: TgtEntity,
            targetProperty: 'owner',
            type: '1:n',
            properties: [
                Property.create({ name: 'grade', type: 'string' }),
                Property.create({ name: 'score', type: 'number' }),
            ],
        });

        const filteredRel1 = Relation.create({
            baseRelation: baseRel,
            sourceProperty: 'goodItems',
            targetProperty: 'goodOwner',
            matchExpression: MatchExp.atom({ key: 'grade', value: ['=', 'A'] }),
        });

        const filteredRel2 = Relation.create({
            baseRelation: filteredRel1,
            sourceProperty: 'topItems',
            targetProperty: 'topOwner',
            matchExpression: MatchExp.atom({ key: 'score', value: ['>', 90] }),
        });

        const trackerProp = Property.create({
            name: 'multiRelTracker',
            type: 'string',
            computation: Custom.create({
                name: 'MultiRelFilteredCustom',
                createState: function (this: any) {
                    return {
                        tracker: new RecordBoundState<string>('none', filteredRel2.name!),
                    };
                },
                compute: async function () { return 'tracked'; },
                getInitialValue: function () { return 'init'; },
            }),
        });

        baseRel.properties.push(trackerProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SrcEntity, TgtEntity],
            relations: [baseRel, filteredRel1, filteredRel2],
        });

        await controller.setup(true);
        const src = await system.storage.create('MultiRelSrc', { name: 'src' });
        expect(src).toBeTruthy();

        await system.destroy();
    });
});

describe('MonoSystem setup: RecordBoundState without record defaults', () => {
    test('global context RecordBoundState must specify record name', async () => {
        const TestEntity = Entity.create({
            name: 'GlobalRBS',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const dict = {
            name: 'globalRBS',
            type: 'number',
            computation: Custom.create({
                name: 'GlobalRBSCustom',
                createState: function (this: any) {
                    return {
                        noRecord: new RecordBoundState<number>(0),
                    };
                },
                compute: async function () { return 0; },
                getInitialValue: function () { return 0; },
            }),
        };

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;

        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict as any],
        });

        await expect(controller.setup(true)).rejects.toThrow('must specify record name');
        try { await system.destroy(); } catch (_) {}
    });

    test('property context RecordBoundState defaults to host entity name', async () => {
        const TestEntity = Entity.create({
            name: 'PropRBS',
            properties: [
                Property.create({ name: 'val', type: 'number' }),
            ],
        });

        const computedProp = Property.create({
            name: 'autoRecord',
            type: 'number',
            computation: Custom.create({
                name: 'AutoRecordCustom',
                createState: function (this: any) {
                    return {
                        autoState: new RecordBoundState<number>(0),
                    };
                },
                compute: async function () { return 0; },
                getInitialValue: function () { return 0; },
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
        const record = await system.storage.create('PropRBS', { val: 5 });
        expect(record).toBeTruthy();

        await system.destroy();
    });
});
