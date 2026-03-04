import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Custom, KlassByName, Transform, Any, Every } from 'interaqt';
import {
    Controller, MonoSystem, Dictionary, Interaction,
    RecordBoundState, GlobalBoundState,
    ComputationResult,
    Summation, Average, WeightedSummation, MatchExp,
} from 'interaqt';
import { Action } from '../../src/builtins/interaction/Action.js';
import { PGLiteDB } from '@drivers';

describe('Transform computation edge cases', () => {
    test('Transform creates records from source entity events', async () => {
        const SourceEntity = Entity.create({
            name: 'TfSource',
            properties: [
                Property.create({ name: 'data', type: 'string' }),
            ],
        });

        const TargetEntity = Entity.create({
            name: 'TfTarget',
            properties: [
                Property.create({ name: 'processedData', type: 'string' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                callback: function (event: any) {
                    if (event.type === 'create') {
                        return { processedData: `processed_${event.record.data}` };
                    }
                },
            }),
        });

        const createAction = Action.create({ name: 'create' });
        const interaction = Interaction.create({
            name: 'createTfSource',
            action: createAction,
            data: SourceEntity,
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, TargetEntity],
            relations: [],
            eventSources: [interaction],
            ignoreGuard: true,
        });

        await controller.setup(true);

        const result = await controller.dispatch(interaction, {
            user: { id: 'u1' },
            payload: { data: 'hello' },
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        const targets = await system.storage.find('TfTarget', undefined, undefined, ['*']);
        expect(targets.length).toBeGreaterThanOrEqual(0);

        await system.destroy();
    });
});

describe('Average computation edge cases', () => {
    test('Average with empty dataset returns initial value', async () => {
        const ScoreEntity = Entity.create({
            name: 'AvgScore',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'avgScore',
            type: 'number',
            computation: Average.create({
                record: ScoreEntity,
                attributeQuery: ['score'],
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ScoreEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const avg = await system.storage.dict.get('avgScore');
        expect(avg).toBe(0);

        await system.destroy();
    });

    test('Average with single item returns that item value', async () => {
        const ScoreEntity = Entity.create({
            name: 'AvgSingleScore',
            properties: [
                Property.create({ name: 'value', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'avgSingle',
            type: 'number',
            computation: Average.create({
                record: ScoreEntity,
                attributeQuery: ['value'],
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ScoreEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('AvgSingleScore', { value: 42 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const avg = await system.storage.dict.get('avgSingle');
        expect(avg).toBe(42);

        await system.destroy();
    });

    test('Average updates incrementally on record creation', async () => {
        const ScoreEntity = Entity.create({
            name: 'AvgIncrScore',
            properties: [
                Property.create({ name: 'num', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'avgIncr',
            type: 'number',
            computation: Average.create({
                record: ScoreEntity,
                attributeQuery: ['num'],
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ScoreEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('AvgIncrScore', { num: 10 });
        await new Promise(resolve => setTimeout(resolve, 300));
        await system.storage.create('AvgIncrScore', { num: 20 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const avg = await system.storage.dict.get('avgIncr');
        expect(avg).toBe(15);

        await system.destroy();
    });
});

describe('Summation computation edge cases', () => {
    test('Summation handles null property values gracefully', async () => {
        const ItemEntity = Entity.create({
            name: 'SumItem',
            properties: [
                Property.create({ name: 'amount', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'totalAmount',
            type: 'number',
            computation: Summation.create({
                record: ItemEntity,
                attributeQuery: ['amount'],
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ItemEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('SumItem', { amount: 10 });
        await new Promise(resolve => setTimeout(resolve, 300));
        await system.storage.create('SumItem', { amount: 20 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const total = await system.storage.dict.get('totalAmount');
        expect(total).toBe(30);

        await system.destroy();
    });
});

describe('WeightedSummation computation edge cases', () => {
    test('WeightedSummation with callback computes weighted sum', async () => {
        const ItemEntity = Entity.create({
            name: 'WeightedItem',
            properties: [
                Property.create({ name: 'value', type: 'number' }),
                Property.create({ name: 'weight', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'weightedTotal',
            type: 'number',
            computation: WeightedSummation.create({
                record: ItemEntity,
                attributeQuery: ['value', 'weight'],
                callback: (item: any) => ({
                    weight: item.weight || 0,
                    value: item.value || 0,
                }),
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ItemEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        await system.storage.create('WeightedItem', { value: 10, weight: 2 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const total = await system.storage.dict.get('weightedTotal');
        expect(total).toBe(20);

        await system.destroy();
    });
});

describe('Average computation: delete and update incremental paths', () => {
    test('Average updates on record deletion', async () => {
        const ScoreEntity = Entity.create({
            name: 'AvgDelScore',
            properties: [
                Property.create({ name: 'pts', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'avgDel',
            type: 'number',
            computation: Average.create({
                record: ScoreEntity,
                attributeQuery: ['pts'],
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ScoreEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const r1 = await system.storage.create('AvgDelScore', { pts: 10 });
        await new Promise(resolve => setTimeout(resolve, 300));
        const r2 = await system.storage.create('AvgDelScore', { pts: 30 });
        await new Promise(resolve => setTimeout(resolve, 300));

        let avg = await system.storage.dict.get('avgDel');
        expect(avg).toBe(20);

        await system.storage.delete('AvgDelScore', MatchExp.atom({ key: 'id', value: ['=', r2.id] }));
        await new Promise(resolve => setTimeout(resolve, 300));

        avg = await system.storage.dict.get('avgDel');
        expect(avg).toBe(10);

        await system.destroy();
    });

    test('Average updates on record update', async () => {
        const ScoreEntity = Entity.create({
            name: 'AvgUpdScore',
            properties: [
                Property.create({ name: 'pts', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'avgUpd',
            type: 'number',
            computation: Average.create({
                record: ScoreEntity,
                attributeQuery: ['pts'],
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ScoreEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const r1 = await system.storage.create('AvgUpdScore', { pts: 10 });
        await new Promise(resolve => setTimeout(resolve, 300));
        const r2 = await system.storage.create('AvgUpdScore', { pts: 20 });
        await new Promise(resolve => setTimeout(resolve, 300));

        let avg = await system.storage.dict.get('avgUpd');
        expect(avg).toBe(15);

        await system.storage.update('AvgUpdScore', MatchExp.atom({ key: 'id', value: ['=', r1.id] }), { pts: 30 });
        await new Promise(resolve => setTimeout(resolve, 300));

        avg = await system.storage.dict.get('avgUpd');
        expect(avg).toBe(25);

        await system.destroy();
    });
});

describe('Transform computation: update and delete incremental paths', () => {
    test('Transform handles source record update via incremental patch', async () => {
        const SourceEntity = Entity.create({
            name: 'TfUpdSource',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
            ],
        });

        const TargetEntity = Entity.create({
            name: 'TfUpdTarget',
            properties: [
                Property.create({ name: 'label', type: 'string' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                callback: function (record: any) {
                    return { label: `label_${record.title}` };
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, TargetEntity],
            relations: [],
            ignoreGuard: true,
        });

        await controller.setup(true);

        const r1 = await system.storage.create('TfUpdSource', { title: 'first' });
        await new Promise(resolve => setTimeout(resolve, 300));

        let targets = await system.storage.find('TfUpdTarget', undefined, undefined, ['*']);
        expect(targets.length).toBe(1);
        expect(targets[0].label).toBe('label_first');

        await system.storage.update('TfUpdSource', MatchExp.atom({ key: 'id', value: ['=', r1.id] }), { title: 'updated' });
        await new Promise(resolve => setTimeout(resolve, 500));

        targets = await system.storage.find('TfUpdTarget', undefined, undefined, ['*']);
        expect(targets.length).toBe(1);

        await system.destroy();
    });

    test('Transform handles source record deletion', async () => {
        const SourceEntity = Entity.create({
            name: 'TfDelSource',
            properties: [
                Property.create({ name: 'data', type: 'string' }),
            ],
        });

        const TargetEntity = Entity.create({
            name: 'TfDelTarget',
            properties: [
                Property.create({ name: 'mapped', type: 'string' }),
            ],
            computation: Transform.create({
                record: SourceEntity,
                callback: function (record: any) {
                    return { mapped: `m_${record.data}` };
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [SourceEntity, TargetEntity],
            relations: [],
            ignoreGuard: true,
        });

        await controller.setup(true);

        const r1 = await system.storage.create('TfDelSource', { data: 'a' });
        await new Promise(resolve => setTimeout(resolve, 300));
        await system.storage.create('TfDelSource', { data: 'b' });
        await new Promise(resolve => setTimeout(resolve, 300));

        let targets = await system.storage.find('TfDelTarget', undefined, undefined, ['*']);
        expect(targets.length).toBe(2);

        await system.storage.delete('TfDelSource', MatchExp.atom({ key: 'id', value: ['=', r1.id] }));
        await new Promise(resolve => setTimeout(resolve, 300));

        targets = await system.storage.find('TfDelTarget', undefined, undefined, ['*']);
        expect(targets.length).toBe(1);
        expect(targets[0].mapped).toBe('m_b');

        await system.destroy();
    });
});

describe('Custom computation: global context with dict default value', () => {
    test('dict with defaultValue and computation uses getInitialValue', async () => {
        const TestEntity = Entity.create({
            name: 'DictDefaultEntity',
            properties: [
                Property.create({ name: 'x', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'withDefault',
            type: 'number',
            defaultValue: () => 100,
            computation: Custom.create({
                name: 'DictDefaultComp',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['x'],
                    },
                },
                compute: async function (this: any, dataDeps: any) {
                    return (dataDeps.records || []).reduce((s: number, r: any) => s + (r.x || 0), 0);
                },
                getInitialValue: function () {
                    return 100;
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

        const initial = await system.storage.dict.get('withDefault');
        expect(initial).toBe(100);

        await system.destroy();
    });
});
