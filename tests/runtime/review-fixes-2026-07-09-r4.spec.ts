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

describe('r4 F-2: dataPolicy.attributeQuery is enforced', () => {
  async function setupGetInteraction() {
    const UserD = Entity.create({
      name: 'UserD',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'secret', type: 'string' }),
      ]
    });
    const Profile = Entity.create({
      name: 'ProfileD',
      properties: [
        Property.create({ name: 'bio', type: 'string' }),
        Property.create({ name: 'privateNote', type: 'string' }),
      ]
    });
    const profileRel = Relation.create({ source: UserD, sourceProperty: 'profile', target: Profile, targetProperty: 'owner', type: '1:1' });
    const GetUsers = Interaction.create({
      name: 'GetUsersD',
      action: GetAction,
      data: UserD,
      dataPolicy: DataPolicy.create({
        attributeQuery: ['id', 'name', ['profile', { attributeQuery: ['id', 'bio'] }]],
      })
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [UserD, Profile], relations: [profileRel], eventSources: [GetUsers] });
    await controller.setup(true);
    const u = await system.storage.create('UserD', { name: 'n1', secret: 's3cret', profile: { bio: 'hello', privateNote: 'hidden' } });
    return { controller, system, GetUsers, u };
  }

  test('query.attributeQuery ["*"] is rejected when the policy declares a whitelist', async () => {
    const { controller, GetUsers, u } = await setupGetInteraction();
    const res: any = await controller.dispatch(GetUsers, { user: { id: u.id }, query: { attributeQuery: ['*'] } });
    expect(res.error).toBeDefined();
    expect(String((res.error as Error).message)).toContain('dataPolicy');
  });

  test('explicit field beyond the whitelist is rejected', async () => {
    const { controller, GetUsers, u } = await setupGetInteraction();
    const res: any = await controller.dispatch(GetUsers, { user: { id: u.id }, query: { attributeQuery: ['id', 'secret'] } });
    expect(res.error).toBeDefined();
    expect(String((res.error as Error).message)).toContain('secret');
  });

  test('nested relation field beyond the nested whitelist is rejected', async () => {
    const { controller, GetUsers, u } = await setupGetInteraction();
    const res: any = await controller.dispatch(GetUsers, {
      user: { id: u.id },
      query: { attributeQuery: ['id', ['profile', { attributeQuery: ['privateNote'] }]] as any }
    });
    expect(res.error).toBeDefined();
    expect(String((res.error as Error).message)).toContain('privateNote');
  });

  test('narrowing within the whitelist works, and omitting attributeQuery uses the policy projection', async () => {
    const { controller, GetUsers, u } = await setupGetInteraction();

    const narrowed: any = await controller.dispatch(GetUsers, {
      user: { id: u.id },
      query: { attributeQuery: ['id', 'name', ['profile', { attributeQuery: ['bio'] }]] as any }
    });
    expect(narrowed.error).toBeUndefined();
    expect(narrowed.data[0].name).toBe('n1');
    expect(narrowed.data[0].secret).toBeUndefined();
    expect(narrowed.data[0].profile.bio).toBe('hello');
    expect(narrowed.data[0].profile.privateNote).toBeUndefined();

    const defaulted: any = await controller.dispatch(GetUsers, { user: { id: u.id } });
    expect(defaulted.error).toBeUndefined();
    expect(defaulted.data[0].name).toBe('n1');
    expect(defaulted.data[0].secret).toBeUndefined();
  });

  test('without a dataPolicy.attributeQuery the caller keeps full projection control', async () => {
    const Doc = Entity.create({
      name: 'DocF2',
      properties: [Property.create({ name: 'title', type: 'string' })]
    });
    const GetDocs = Interaction.create({ name: 'GetDocsF2', action: GetAction, data: Doc });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Doc], relations: [], eventSources: [GetDocs] });
    await controller.setup(true);
    const d = await system.storage.create('DocF2', { title: 't1' });
    const res: any = await controller.dispatch(GetDocs, { user: { id: d.id }, query: { attributeQuery: ['*'] } });
    expect(res.error).toBeUndefined();
    expect(res.data[0].title).toBe('t1');
  });
});

describe('r4 R-1: reserved property names are rejected at setup', () => {
  test('user property named "id" fails fast with a clear error', async () => {
    const Doc = Entity.create({
      name: 'DocR1',
      properties: [
        Property.create({ name: 'id', type: 'string' }),
        Property.create({ name: 'title', type: 'string' }),
      ]
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Doc], relations: [] });
    await expect(controller.setup(true)).rejects.toThrow(/Property name "id" is reserved on "DocR1"/);
  });
});

describe('r4 R-2: relation type whitelist', () => {
  test('invalid relation type is rejected at Relation.create', () => {
    const A = Entity.create({ name: 'AR2', properties: [Property.create({ name: 'x', type: 'string' })] });
    const B = Entity.create({ name: 'BR2', properties: [Property.create({ name: 'y', type: 'string' })] });
    expect(() => Relation.create({
      source: A, sourceProperty: 'bs', target: B, targetProperty: 'as', type: '2:3' as any
    })).toThrow(/Relation type "2:3" is invalid/);
  });

  test('all four legal relation types are accepted', () => {
    const A = Entity.create({ name: 'AR2b', properties: [Property.create({ name: 'x', type: 'string' })] });
    const B = Entity.create({ name: 'BR2b', properties: [Property.create({ name: 'y', type: 'string' })] });
    for (const [i, type] of (['1:1', '1:n', 'n:1', 'n:n'] as const).entries()) {
      expect(() => Relation.create({
        source: A, sourceProperty: `p${i}`, target: B, targetProperty: `q${i}`, type
      })).not.toThrow();
    }
  });
});

describe('r4 R-3: filtered entity predicates with unknown simple keys fail at setup', () => {
  test('misspelled single-segment key is rejected with a pointed error', async () => {
    const Base = Entity.create({
      name: 'BaseR3',
      properties: [Property.create({ name: 'status', type: 'string' })]
    });
    const Filtered = Entity.create({
      name: 'FilteredR3',
      baseEntity: Base,
      matchExpression: MatchExp.atom({ key: 'statsu', value: ['=', 'active'] }) // typo
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Base, Filtered], relations: [] });
    await expect(controller.setup(true)).rejects.toThrow(/FilteredR3.*unknown attribute 'statsu' on base 'BaseR3'/);
  });

  test('valid single keys (own property, id) still pass', async () => {
    const Base = Entity.create({
      name: 'BaseR3b',
      properties: [Property.create({ name: 'status', type: 'string' })]
    });
    const Filtered = Entity.create({
      name: 'FilteredR3b',
      baseEntity: Base,
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Base, Filtered], relations: [] });
    await controller.setup(true);
    await system.storage.create('BaseR3b', { status: 'active' });
    await system.storage.create('BaseR3b', { status: 'archived' });
    const rows = await system.storage.find('FilteredR3b', undefined, undefined, ['*']);
    expect(rows.length).toBe(1);
  });
});

describe('r4 F-3: computation dependency cycles fail fast instead of recursing unboundedly', () => {
  test('property dataDep including its own output property is rejected at setup', async () => {
    const Item = Entity.create({
      name: 'ItemF3a',
      properties: [
        Property.create({ name: 'price', type: 'number' }),
        Property.create({
          name: 'score', type: 'number',
          computation: Custom.create({
            name: 'scoreCalcF3a',
            dataDeps: { _current: { type: 'property', attributeQuery: ['price', 'score'] } },
            compute: async function(deps: any) { return (deps._current?.score ?? 0) + 1; },
            getDefaultValue: () => 0,
          })
        }),
      ]
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Item], relations: [] });
    await expect(controller.setup(true)).rejects.toThrow(/must not include the computation's own output property "score"/);
  });

  test('cross-property computation cycle is stopped by the cascade depth circuit breaker', async () => {
    let calls = 0;
    const Item = Entity.create({
      name: 'ItemF3b',
      properties: [
        Property.create({ name: 'seed', type: 'number' }),
        Property.create({
          name: 'a', type: 'number',
          computation: Custom.create({
            name: 'aCalcF3b',
            dataDeps: { _current: { type: 'property', attributeQuery: ['b'] } },
            compute: async function(deps: any) { calls++; return (deps._current?.b ?? 0) + 1; },
            getDefaultValue: () => 0,
          })
        }),
        Property.create({
          name: 'b', type: 'number',
          computation: Custom.create({
            name: 'bCalcF3b',
            dataDeps: { _current: { type: 'property', attributeQuery: ['a'] } },
            compute: async function(deps: any) { calls++; return (deps._current?.a ?? 0) + 1; },
            getDefaultValue: () => 0,
          })
        }),
      ]
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Item], relations: [] });
    await controller.setup(true);

    let error: any;
    try {
      await system.storage.create('ItemF3b', { seed: 1 });
    } catch (e) { error = e; }
    expect(error).toBeDefined();
    expect(String(error.message)).toContain('Mutation cascade exceeded the maximum depth');
    // bounded: the breaker fired instead of unbounded recursion
    expect(calls).toBeLessThan(300);
  }, 30000);

  test('legal converging property computation chains still work', async () => {
    const Item = Entity.create({
      name: 'ItemF3c',
      properties: [
        Property.create({ name: 'price', type: 'number' }),
        Property.create({
          name: 'double', type: 'number',
          computation: Custom.create({
            name: 'doubleCalcF3c',
            dataDeps: { _current: { type: 'property', attributeQuery: ['price'] } },
            compute: async function(deps: any) { return (deps._current?.price ?? 0) * 2; },
            getDefaultValue: () => 0,
          })
        }),
        Property.create({
          name: 'quadruple', type: 'number',
          computation: Custom.create({
            name: 'quadCalcF3c',
            dataDeps: { _current: { type: 'property', attributeQuery: ['double'] } },
            compute: async function(deps: any) { return (deps._current?.double ?? 0) * 2; },
            getDefaultValue: () => 0,
          })
        }),
      ]
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Item], relations: [] });
    await controller.setup(true);
    const r = await system.storage.create('ItemF3c', { price: 10 });
    const row = await system.storage.findOne('ItemF3c', MatchExp.atom({ key: 'id', value: ['=', r.id] }), undefined, ['*']);
    expect(row.double).toBe(20);
    expect(row.quadruple).toBe(40);

    await system.storage.update('ItemF3c', MatchExp.atom({ key: 'id', value: ['=', r.id] }), { price: 5 });
    const updated = await system.storage.findOne('ItemF3c', MatchExp.atom({ key: 'id', value: ['=', r.id] }), undefined, ['*']);
    expect(updated.double).toBe(10);
    expect(updated.quadruple).toBe(20);
  });
});

describe('r4 F-4: circular baseEntity chains are rejected at setup', () => {
  test('two filtered entities forming a base cycle fail fast with a clear error', async () => {
    const Base = Entity.create({
      name: 'BaseF4',
      properties: [Property.create({ name: 'status', type: 'string' })]
    });
    const FA: any = Entity.create({
      name: 'FAF4',
      baseEntity: Base,
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'a'] })
    });
    const FB: any = Entity.create({
      name: 'FBF4',
      baseEntity: FA,
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'b'] })
    });
    FA.baseEntity = FB; // create the cycle

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Base, FA, FB], relations: [] });
    await expect(controller.setup(true)).rejects.toThrow(/Circular baseEntity\/baseRelation chain detected: FAF4 -> FBF4 -> FAF4/);
  });

  test('self-referencing baseEntity fails fast', async () => {
    const SA: any = Entity.create({
      name: 'SelfF4',
      properties: [Property.create({ name: 'status', type: 'string' })],
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'a'] })
    });
    SA.baseEntity = SA;

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [SA], relations: [] });
    await expect(controller.setup(true)).rejects.toThrow(/Circular baseEntity\/baseRelation chain detected/);
  });

  test('legal nested filtered entity chains still work', async () => {
    const Base = Entity.create({
      name: 'BaseF4b',
      properties: [
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'priority', type: 'number' }),
      ]
    });
    const Active = Entity.create({
      name: 'ActiveF4b',
      baseEntity: Base,
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
    });
    const ActiveHigh = Entity.create({
      name: 'ActiveHighF4b',
      baseEntity: Active,
      matchExpression: MatchExp.atom({ key: 'priority', value: ['>', 5] })
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Base, Active, ActiveHigh], relations: [] });
    await controller.setup(true);
    await system.storage.create('BaseF4b', { status: 'active', priority: 9 });
    await system.storage.create('BaseF4b', { status: 'active', priority: 1 });
    const rows = await system.storage.find('ActiveHighF4b', undefined, undefined, ['*']);
    expect(rows.length).toBe(1);
  });
});
