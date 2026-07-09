/**
 * r5 F-4 regression: `computed` properties must only read same-row value fields.
 *
 * Relation data is never loaded for computed recomputation on update, so a computed
 * function reading a relation property would look "working" on nested create and then
 * silently flip (and persist) the wrong value on any unrelated update. The framework
 * now enforces the contract at first use: accessing a relation property inside a
 * computed function throws a clear error instead of corrupting data.
 */
import { describe, expect, test } from "vitest";
import { Controller, Entity, KlassByName, MatchExp, MonoSystem, Property, Relation } from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('computed property relation access guard', () => {
    test('computed reading a relation property fails fast instead of silently corrupting', async () => {
        const Team = Entity.create({ name: 'CgTeam', properties: [Property.create({ name: 'type', type: 'string' })] });
        const User = Entity.create({
            name: 'CgUser',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'inTech', type: 'boolean', computed: (r: any) => r.team?.type === 'tech' }),
            ],
        });
        const UserTeam = Relation.create({ source: User, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1' });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Team, User], relations: [UserTeam] });
        await controller.setup(true);

        // nested create used to look "working" (payload happened to carry team.type),
        // then an unrelated update silently flipped inTech to false. Now: fail fast.
        await expect(
            system.storage.create('CgUser', { name: 'A', team: { type: 'tech' } })
        ).rejects.toThrow(/computed property "inTech" on "CgUser" accessed relation property "team"/);
    });

    test('computed over same-row fields keeps working across create and update', async () => {
        const Task = Entity.create({
            name: 'CgTask',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', computed: (r: any) => r.status === 'active' }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Task], relations: [] });
        await controller.setup(true);

        const t = await system.storage.create('CgTask', { status: 'active', title: 'x' });
        let row = await system.storage.findOne('CgTask', MatchExp.atom({ key: 'id', value: ['=', t.id] }), undefined, ['*']);
        expect(row.isActive).toBe(true);

        // unrelated update must not disturb the computed value
        await system.storage.update('CgTask', MatchExp.atom({ key: 'id', value: ['=', t.id] }), { title: 'y' });
        row = await system.storage.findOne('CgTask', MatchExp.atom({ key: 'id', value: ['=', t.id] }), undefined, ['*']);
        expect(row.isActive).toBe(true);

        await system.storage.update('CgTask', MatchExp.atom({ key: 'id', value: ['=', t.id] }), { status: 'inactive' });
        row = await system.storage.findOne('CgTask', MatchExp.atom({ key: 'id', value: ['=', t.id] }), undefined, ['*']);
        expect(row.isActive).toBe(false);
    });
});
