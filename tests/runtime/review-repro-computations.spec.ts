/**
 * Reproduction tests for review findings F2 (partial-record callbacks) and
 * F3 (PropertyAverage relation match key)
 * (agentspace/output/core-runtime-builtins-review.md).
 *
 * Every test asserts the CORRECT behavior and is marked `test.fails`:
 * it passes today because the bug makes the assertion fail. When a bug is
 * fixed, the corresponding test will turn red - remove `.fails` then.
 */
import { describe, expect, test } from 'vitest';
import {
    Entity, Property, Relation, Count, Every, Average, Dictionary, KlassByName,
    Controller, MonoSystem,
} from 'interaqt';
import { SQLiteDB } from '@drivers';
import { MatchExp } from '@storage';

describe('F2: GlobalCount/GlobalEvery incremental update uses the partial update record', () => {
    // BUG: storage update events carry only the changed fields in `record`.
    // GlobalCount's update branch passes that partial record straight to the
    // user callback; any field not part of this update reads as undefined.
    // (GlobalAny/GlobalSummation already re-fetch the full record - see Any.ts.)
    test.fails('GlobalCount callback sees the full record on update', async () => {
        const Task = Entity.create({
            name: 'F2CountTask',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'score', type: 'number' }),
            ],
        });
        const dict = Dictionary.create({
            name: 'f2ActiveHighScoreCount',
            type: 'number',
            collection: false,
            computation: Count.create({
                record: Task,
                attributeQuery: ['status', 'score'],
                callback: (t: any) => t.status === 'active' && t.score > 50,
            }),
        });
        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Task], relations: [], dict: [dict] });
        await controller.setup(true);

        const t1 = await system.storage.create('F2CountTask', { status: 'inactive', score: 80 });
        expect(await system.storage.dict.get('f2ActiveHighScoreCount')).toBe(0);

        // update only `status`; callback also needs `score`, which is not in the event payload
        await system.storage.update('F2CountTask', MatchExp.atom({ key: 'id', value: ['=', t1.id] }), { status: 'active' });
        expect(await system.storage.dict.get('f2ActiveHighScoreCount')).toBe(1);
        await system.destroy();
    });

    test.fails('GlobalEvery callback sees the full record on update', async () => {
        const Task = Entity.create({
            name: 'F2EveryTask',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'score', type: 'number' }),
            ],
        });
        const dict = Dictionary.create({
            name: 'f2AllGood',
            type: 'boolean',
            collection: false,
            computation: Every.create({
                record: Task,
                attributeQuery: ['status', 'score'],
                callback: (t: any) => t.status === 'active' && t.score > 50,
                notEmpty: true,
            }),
        });
        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Task], relations: [], dict: [dict] });
        await controller.setup(true);

        const t1 = await system.storage.create('F2EveryTask', { status: 'inactive', score: 80 });
        expect(await system.storage.dict.get('f2AllGood')).toBe(false);

        await system.storage.update('F2EveryTask', MatchExp.atom({ key: 'id', value: ['=', t1.id] }), { status: 'active' });
        expect(await system.storage.dict.get('f2AllGood')).toBe(true);
        await system.destroy();
    });
});

describe('F3: PropertyAverage update path builds a wrong relation match key', () => {
    // BUG: the update branch always uses `relatedAttribute.slice(2)` for the
    // match key. For a related-entity field update relatedAttribute is
    // ['students'], so the key becomes plain 'id' - matching the RELATION's id
    // against the STUDENT's id. Whenever those ids diverge (here: extra
    // students created before the relation), findOne returns undefined and the
    // computation throws `Cannot read properties of undefined (reading 'target')`,
    // aborting the whole dispatch/update transaction.
    // (Summation/Count build the key correctly with a three-way branch.)
    test.fails('updating a related entity field recomputes the average when relation ids diverge from entity ids', async () => {
        const Teacher = Entity.create({ name: 'F3Teacher', properties: [Property.create({ name: 'name', type: 'string' })] });
        const Student = Entity.create({ name: 'F3Student', properties: [Property.create({ name: 'score', type: 'number' })] });
        const rel = Relation.create({
            source: Teacher,
            sourceProperty: 'students',
            target: Student,
            targetProperty: 'teacher',
            type: '1:n',
        });
        Teacher.properties.push(Property.create({
            name: 'avgScore',
            type: 'number',
            computation: Average.create({ property: 'students', attributeQuery: ['score'] }),
        }));

        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Teacher, Student], relations: [rel] });
        await controller.setup(true);

        const teacher = await system.storage.create('F3Teacher', { name: 'T1' });
        // create extra students first so entity ids diverge from relation ids
        await system.storage.create('F3Student', { score: 1 });
        await system.storage.create('F3Student', { score: 2 });
        const s1 = await system.storage.create('F3Student', { score: 80 });

        await system.storage.addRelationByNameById(rel.name!, teacher.id, s1.id);

        let found = await system.storage.findOne('F3Teacher',
            MatchExp.atom({ key: 'id', value: ['=', teacher.id] }), undefined, ['*']);
        expect(found.avgScore).toBe(80);

        await system.storage.update('F3Student',
            MatchExp.atom({ key: 'id', value: ['=', s1.id] }),
            { score: 100 }
        );

        found = await system.storage.findOne('F3Teacher',
            MatchExp.atom({ key: 'id', value: ['=', teacher.id] }), undefined, ['*']);
        expect(found.avgScore).toBe(100);
        await system.destroy();
    });
});
