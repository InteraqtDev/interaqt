import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Interaction, GetAction, DataPolicy } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
  Controller, KlassByName,
  MonoSystem, Count,
  MatchExp, Custom,
} from 'interaqt';

// Regression tests for the fourth-round deep code review findings
// (agentspace/output/deep-review-2026-07-09-r4.md).

describe('r4 F-1: symmetric n:n cascade delete cleans up both directions', () => {
  test('deleting an entity removes links where it is source AND where it is target', async () => {
    const User = Entity.create({
      name: 'User',
      properties: [Property.create({ name: 'username', type: 'string' })]
    });
    const friendRelation = Relation.create({
      source: User, sourceProperty: 'friends',
      target: User, targetProperty: 'friends',
      type: 'n:n'
    });
    User.properties.push(Property.create({
      name: 'friendCount', type: 'number',
      computation: Count.create({ record: friendRelation })
    }));

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [User], relations: [friendRelation] });
    await controller.setup(true);

    const alice = await system.storage.create('User', { username: 'alice' });
    const bob = await system.storage.create('User', { username: 'bob' });
    const charlie = await system.storage.create('User', { username: 'charlie' });

    // alice is source of link1 and TARGET of link2
    await system.storage.addRelationByNameById(friendRelation.name!, alice.id, bob.id, {});
    await system.storage.addRelationByNameById(friendRelation.name!, charlie.id, alice.id, {});

    const charlieBefore = await system.storage.findOne('User', MatchExp.atom({ key: 'id', value: ['=', charlie.id] }), undefined, ['*']);
    expect(charlieBefore.friendCount).toBe(1);

    const events: any[] = [];
    await system.storage.delete('User', MatchExp.atom({ key: 'id', value: ['=', alice.id] }), events);

    // both link rows must be gone
    const remainingLinks = await system.storage.find(friendRelation.name!, undefined, undefined, ['*']);
    expect(remainingLinks.length).toBe(0);

    // both link delete events must be emitted
    const linkDeleteEvents = events.filter(e => e.type === 'delete' && e.recordName === friendRelation.name);
    expect(linkDeleteEvents.length).toBe(2);

    // downstream Count must settle to 0 for both survivors
    const bobAfter = await system.storage.findOne('User', MatchExp.atom({ key: 'id', value: ['=', bob.id] }), undefined, ['*']);
    const charlieAfter = await system.storage.findOne('User', MatchExp.atom({ key: 'id', value: ['=', charlie.id] }), undefined, ['*']);
    expect(bobAfter.friendCount).toBe(0);
    expect(charlieAfter.friendCount).toBe(0);

  });

  test('asymmetric n:n cascade delete is unaffected (single-direction match preserved)', async () => {
    const Author = Entity.create({ name: 'Author', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Book = Entity.create({ name: 'Book', properties: [Property.create({ name: 'title', type: 'string' })] });
    const rel = Relation.create({ source: Author, sourceProperty: 'books', target: Book, targetProperty: 'authors', type: 'n:n' });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Author, Book], relations: [rel] });
    await controller.setup(true);

    const a1 = await system.storage.create('Author', { name: 'a1' });
    const a2 = await system.storage.create('Author', { name: 'a2' });
    const b1 = await system.storage.create('Book', { title: 'b1' });
    await system.storage.addRelationByNameById(rel.name!, a1.id, b1.id, {});
    await system.storage.addRelationByNameById(rel.name!, a2.id, b1.id, {});

    const events: any[] = [];
    await system.storage.delete('Author', MatchExp.atom({ key: 'id', value: ['=', a1.id] }), events);

    const remaining = await system.storage.find(rel.name!, undefined, undefined, ['*', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]);
    expect(remaining.length).toBe(1);
    expect(remaining[0].source.id).toBe(a2.id);

  });
});
