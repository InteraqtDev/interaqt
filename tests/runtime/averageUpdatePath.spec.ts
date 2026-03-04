import { describe, expect, test } from "vitest";
import { Entity, Property, Average, KlassByName, Relation, Summation, BoolExp } from 'interaqt';
import { Controller, MonoSystem, MatchExp, Dictionary } from 'interaqt';
import { SQLiteDB } from '@drivers';

describe('GlobalAverage incremental update path', () => {
    test('incrementally handles create, update and delete', async () => {
        const ScoreEntity = Entity.create({
            name: 'AvgUpdateScore',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'avgUpdateScore',
            type: 'number',
            computation: Average.create({
                record: ScoreEntity,
                attributeQuery: ['score'],
            }),
        });

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ScoreEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        let avg = await system.storage.dict.get('avgUpdateScore');
        expect(avg).toBe(0);

        const r1 = await system.storage.create('AvgUpdateScore', { score: 10 });

        avg = await system.storage.dict.get('avgUpdateScore');
        expect(avg).toBe(10);

        const r2 = await system.storage.create('AvgUpdateScore', { score: 20 });

        avg = await system.storage.dict.get('avgUpdateScore');
        expect(avg).toBe(15);

        await system.storage.update('AvgUpdateScore',
            MatchExp.atom({ key: 'id', value: ['=', r1.id] }),
            { score: 30 }
        );

        avg = await system.storage.dict.get('avgUpdateScore');
        expect(avg).toBe(25);

        await system.storage.delete('AvgUpdateScore',
            MatchExp.atom({ key: 'id', value: ['=', r2.id] })
        );

        avg = await system.storage.dict.get('avgUpdateScore');
        expect(avg).toBe(30);

        await system.destroy();
    });
});

describe('PropertyAverage incremental update path', () => {
    test('property-level average updates when relations are added and updated', async () => {
        const Teacher = Entity.create({
            name: 'AvgTeacher',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
            ],
        });

        const Student = Entity.create({
            name: 'AvgStudent',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
            ],
        });

        const rel = Relation.create({
            source: Teacher,
            sourceProperty: 'students',
            target: Student,
            targetProperty: 'teacher',
            type: '1:n',
        });

        const avgProp = Property.create({
            name: 'avgScore',
            type: 'number',
            computation: Average.create({
                property: 'students',
                attributeQuery: ['score'],
            }),
        });

        Teacher.properties.push(avgProp);

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [Teacher, Student],
            relations: [rel],
        });

        await controller.setup(true);

        const teacher = await system.storage.create('AvgTeacher', { name: 'T1' });
        const s1 = await system.storage.create('AvgStudent', { score: 80 });
        const s2 = await system.storage.create('AvgStudent', { score: 60 });

        await system.storage.addRelationByNameById(rel.name!, teacher.id, s1.id);

        let found = await system.storage.findOne('AvgTeacher',
            MatchExp.atom({ key: 'id', value: ['=', teacher.id] }), undefined, ['*']);
        expect(found.avgScore).toBe(80);

        await system.storage.addRelationByNameById(rel.name!, teacher.id, s2.id);

        found = await system.storage.findOne('AvgTeacher',
            MatchExp.atom({ key: 'id', value: ['=', teacher.id] }), undefined, ['*']);
        expect(found.avgScore).toBe(70);

        await system.storage.update('AvgStudent',
            MatchExp.atom({ key: 'id', value: ['=', s1.id] }),
            { score: 100 }
        );

        found = await system.storage.findOne('AvgTeacher',
            MatchExp.atom({ key: 'id', value: ['=', teacher.id] }), undefined, ['*']);
        expect(found.avgScore).toBe(80);

        await system.storage.removeRelationByName(rel.name!,
            MatchExp.atom({ key: 'source.id', value: ['=', teacher.id] })
                .and({ key: 'target.id', value: ['=', s2.id] })
        );

        found = await system.storage.findOne('AvgTeacher',
            MatchExp.atom({ key: 'id', value: ['=', teacher.id] }), undefined, ['*']);
        expect(found.avgScore).toBe(100);

        await system.destroy();
    });
});

describe('GlobalSummation incremental update path', () => {
    test('incrementally handles create, update and delete', async () => {
        const ItemEntity = Entity.create({
            name: 'SumUpdateItem',
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

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ItemEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        let total = await system.storage.dict.get('totalAmount');
        expect(total).toBe(0);

        const r1 = await system.storage.create('SumUpdateItem', { amount: 100 });

        total = await system.storage.dict.get('totalAmount');
        expect(total).toBe(100);

        await system.storage.update('SumUpdateItem',
            MatchExp.atom({ key: 'id', value: ['=', r1.id] }),
            { amount: 200 }
        );

        total = await system.storage.dict.get('totalAmount');
        expect(total).toBe(200);

        await system.storage.delete('SumUpdateItem',
            MatchExp.atom({ key: 'id', value: ['=', r1.id] })
        );

        total = await system.storage.dict.get('totalAmount');
        expect(total).toBe(0);

        await system.destroy();
    });

    test('handles multiple items with update correctly', async () => {
        const ItemEntity = Entity.create({
            name: 'SumMultiItem',
            properties: [
                Property.create({ name: 'value', type: 'number' }),
            ],
        });

        const dict = Dictionary.create({
            name: 'totalValue',
            type: 'number',
            computation: Summation.create({
                record: ItemEntity,
                attributeQuery: ['value'],
            }),
        });

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ItemEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const r1 = await system.storage.create('SumMultiItem', { value: 10 });
        const r2 = await system.storage.create('SumMultiItem', { value: 20 });
        const r3 = await system.storage.create('SumMultiItem', { value: 30 });

        let total = await system.storage.dict.get('totalValue');
        expect(total).toBe(60);

        await system.storage.update('SumMultiItem',
            MatchExp.atom({ key: 'id', value: ['=', r2.id] }),
            { value: 50 }
        );

        total = await system.storage.dict.get('totalValue');
        expect(total).toBe(90);

        await system.destroy();
    });
});
