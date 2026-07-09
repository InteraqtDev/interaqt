import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Interaction, GetAction, DataPolicy, EventSource } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
  Controller, KlassByName,
  MonoSystem, Count, WeightedSummation,
  MatchExp, Custom, createMigrationManifest,
} from 'interaqt';
import { recomputeFilteredMemberships, getNewFilteredDataContexts, getFilteredRecordChanges } from '@runtime';

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

describe('r4 R-4: PropertyCount / PropertyWeightedSummation guard drift', () => {
  async function setupPropertyAggregates() {
    const Task = Entity.create({
      name: 'TaskR4',
      properties: [
        Property.create({ name: 'done', type: 'boolean' }),
        Property.create({ name: 'points', type: 'number' }),
      ],
    });
    const Project = Entity.create({
      name: 'ProjectR4',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({
          name: 'taskCount', type: 'number',
          computation: Count.create({
            property: 'tasks',
            attributeQuery: ['done'],
            callback: (task: any) => !!task.done,
          }),
        }),
        Property.create({
          name: 'totalPoints', type: 'number',
          computation: WeightedSummation.create({
            property: 'tasks',
            attributeQuery: ['points'],
            callback: (task: any) => ({ weight: 1, value: task.points || 0 }),
          }),
        }),
      ],
    });
    const ProjectTask = Relation.create({
      source: Project, sourceProperty: 'tasks', target: Task, targetProperty: 'project', type: '1:n',
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Project, Task], relations: [ProjectTask] });
    await controller.setup(true);
    const project = await system.storage.create('ProjectR4', { name: 'p' });
    await system.storage.create('TaskR4', { done: true, points: 3, project: { id: project.id } });
    const handles = Array.from((controller.scheduler as any).computationsHandles.values()) as any[];
    const countHandle = handles.find(h => h.dataContext?.type === 'property' && h.dataContext?.id?.name === 'taskCount');
    const weightedHandle = handles.find(h => h.dataContext?.type === 'property' && h.dataContext?.id?.name === 'totalPoints');
    expect(countHandle).toBeTruthy();
    expect(weightedHandle).toBeTruthy();
    return { system, project, countHandle, weightedHandle };
  }

  test('missing relatedMutationEvent falls back to fullRecompute instead of crashing', async () => {
    const { system, project, countHandle, weightedHandle } = await setupPropertyAggregates();
    const syntheticEvent = {
      recordName: 'ProjectR4',
      type: 'update',
      relatedAttribute: ['tasks'],
      record: { id: project.id },
      oldRecord: { id: project.id },
      // no relatedMutationEvent
    };
    for (const handle of [countHandle, weightedHandle]) {
      const result = await system.storage.runInTransaction({ name: 'r4-guard-test' }, async () =>
        handle.incrementalCompute(1, syntheticEvent, { id: project.id }, {})
      );
      expect(result?.type ?? result?.constructor?.name).toMatch(/fullRecompute|ComputationResultFullRecompute/i);
    }
  });

  test('update events from unrelated record names fall back to fullRecompute (aligned with Every/Any)', async () => {
    const { system, project, countHandle, weightedHandle } = await setupPropertyAggregates();
    const syntheticEvent = {
      recordName: 'ProjectR4',
      type: 'update',
      relatedAttribute: ['tasks'],
      record: { id: project.id },
      oldRecord: { id: project.id },
      relatedMutationEvent: {
        recordName: 'SomeUnrelatedRecord',
        type: 'update',
        record: { id: 'x' },
        oldRecord: { id: 'x' },
      },
    };
    for (const handle of [countHandle, weightedHandle]) {
      const result = await system.storage.runInTransaction({ name: 'r4-guard-test-2' }, async () =>
        handle.incrementalCompute(1, syntheticEvent, { id: project.id }, {})
      );
      expect(result?.type ?? result?.constructor?.name).toMatch(/fullRecompute|ComputationResultFullRecompute/i);
    }
  });
});

describe('r4 R-5: transaction retry re-runs with pristine dispatch args', () => {
  test('in-place payload mutation from resolve does not leak into the retry attempt', async () => {
    const EventRecord = Entity.create({
      name: 'RetryArgsEvent',
      properties: [Property.create({ name: 'kind', type: 'string' })]
    });
    const Result = Entity.create({
      name: 'RetryArgsResult',
      properties: [Property.create({ name: 'tags', type: 'string', collection: true })]
    });

    let attempts = 0;
    const source = EventSource.create({
      name: 'retryArgsSource',
      entity: EventRecord,
      mapEventData: () => ({ kind: 'retry-args' }),
      resolve: async function(this: Controller, args: any) {
        attempts++;
        // legal-looking in-place normalization of the payload
        args.payload.tags.push('normalized');
        if (attempts === 1) {
          const error = new Error('deadlock');
          Object.assign(error, { code: '40P01' }); // retryable SQLSTATE
          throw error;
        }
        await this.system.storage.create('RetryArgsResult', { tags: [...args.payload.tags] });
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Result], relations: [], eventSources: [source] });
    await controller.setup(true);

    const originalPayload = { tags: ['user-supplied'] };
    const res = await controller.dispatch(source, { user: { id: 'u1' }, payload: originalPayload });
    expect(res.error).toBeUndefined();
    expect(attempts).toBe(2);

    // the retry attempt must have seen the pristine payload: exactly one 'normalized'
    const rows = await system.storage.find('RetryArgsResult', undefined, undefined, ['*']);
    expect(rows).toHaveLength(1);
    expect(rows[0].tags).toEqual(['user-supplied', 'normalized']);

    // the caller's original args object is never mutated
    expect(originalPayload.tags).toEqual(['user-supplied']);
  });
});

describe('r4 R-6: non-isRef entity payloads must not carry an id', () => {
  async function setupPayloadInteraction() {
    const Post = Entity.create({
      name: 'PostR6',
      properties: [Property.create({ name: 'title', type: 'string' })]
    });
    const { Action, Payload, PayloadItem } = await import('interaqt');
    const CreatePost = Interaction.create({
      name: 'CreatePostR6',
      action: Action.create({ name: 'createPostR6' }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: 'post', type: 'object', base: Post })]
      })
    });
    const RefPost = Interaction.create({
      name: 'RefPostR6',
      action: Action.create({ name: 'refPostR6' }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: 'post', type: 'object', base: Post, isRef: true })]
      })
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Post], relations: [], eventSources: [CreatePost, RefPost] });
    await controller.setup(true);
    return { controller, system, CreatePost, RefPost };
  }

  test('embedded creation data with a spoofed id is rejected at guard', async () => {
    const { controller, system, CreatePost } = await setupPayloadInteraction();
    const real = await system.storage.create('PostR6', { title: 'real' });
    const res: any = await controller.dispatch(CreatePost, {
      user: { id: 'u1' },
      payload: { post: { id: real.id, title: 'spoofed' } }
    });
    expect(res.error).toBeDefined();
    expect(String((res.error as Error).message)).toContain("must not carry an 'id'");
  });

  test('embedded creation data without id passes; isRef references keep working', async () => {
    const { controller, system, CreatePost, RefPost } = await setupPayloadInteraction();
    const ok: any = await controller.dispatch(CreatePost, {
      user: { id: 'u1' },
      payload: { post: { title: 'fresh' } }
    });
    expect(ok.error).toBeUndefined();

    const real = await system.storage.create('PostR6', { title: 'real' });
    const refOk: any = await controller.dispatch(RefPost, {
      user: { id: 'u1' },
      payload: { post: { id: real.id } }
    });
    expect(refOk.error).toBeUndefined();
  });
});

describe('r4 R-7: removed filtered records produce membership exit events during migration', () => {
  test('delete events are synthesized for old members; removed context stays out of rebuild seeds', async () => {
    const UserV1 = new (Entity as any)({
      name: 'R7User',
      properties: [new (Property as any)({ name: 'active', type: 'boolean' }, { uuid: 'r7-user-active' })],
    }, { uuid: 'r7-user' });
    const ActiveV1 = new (Entity as any)({
      name: 'R7ActiveUser',
      baseEntity: UserV1,
      matchExpression: MatchExp.atom({ key: 'active', value: ['=', true] }),
    }, { uuid: 'r7-active' });

    const db = new PGLiteDB();
    const systemV1 = new MonoSystem(db);
    systemV1.conceptClass = KlassByName;
    const controllerV1 = new Controller({ system: systemV1, entities: [UserV1, ActiveV1], relations: [] });
    await controllerV1.setup(true);
    const u1 = await systemV1.storage.create('R7User', { active: true });
    await systemV1.storage.create('R7User', { active: false });
    const oldManifest = createMigrationManifest(controllerV1);

    // v2: the filtered entity is removed, the base entity stays
    const UserV2 = new (Entity as any)({
      name: 'R7User',
      properties: [new (Property as any)({ name: 'active', type: 'boolean' }, { uuid: 'r7-user-active' })],
    }, { uuid: 'r7-user' });
    const systemV2 = new MonoSystem(db);
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [UserV2], relations: [] });
    const statesV2 = controllerV2.scheduler.createStates();
    const internalRequirementsV2 = controllerV2.scheduler.createInternalSchemaRequirements();
    const schemaPlanV2 = await (systemV2 as any).prepareMigrationSchema(
      controllerV2.entities, controllerV2.relations, statesV2, { internalRequirements: internalRequirementsV2 });
    const newManifest = createMigrationManifest(controllerV2, schemaPlanV2.schema);

    const changes = getFilteredRecordChanges(oldManifest, newManifest);
    expect(changes).toEqual([expect.objectContaining({ recordName: 'R7ActiveUser', changeType: 'removed' })]);

    // removed contexts must not seed the rebuild graph (they no longer resolve)
    expect(getNewFilteredDataContexts(oldManifest, newManifest)).toEqual([]);

    const events = await recomputeFilteredMemberships(controllerV1, oldManifest, newManifest);
    const deletes = events.filter(e => e.type === 'delete' && e.recordName === 'R7ActiveUser');
    expect(deletes.map(e => String(e.record!.id))).toEqual([String(u1.id)]);
    await db.close();
  });

  test('removed filtered record whose base is also removed is skipped without errors', async () => {
    const UserV1 = new (Entity as any)({
      name: 'R7bUser',
      properties: [new (Property as any)({ name: 'active', type: 'boolean' }, { uuid: 'r7b-user-active' })],
    }, { uuid: 'r7b-user' });
    const ActiveV1 = new (Entity as any)({
      name: 'R7bActiveUser',
      baseEntity: UserV1,
      matchExpression: MatchExp.atom({ key: 'active', value: ['=', true] }),
    }, { uuid: 'r7b-active' });
    const OtherV1 = new (Entity as any)({
      name: 'R7bOther',
      properties: [new (Property as any)({ name: 'x', type: 'string' }, { uuid: 'r7b-other-x' })],
    }, { uuid: 'r7b-other' });

    const db = new PGLiteDB();
    const systemV1 = new MonoSystem(db);
    systemV1.conceptClass = KlassByName;
    const controllerV1 = new Controller({ system: systemV1, entities: [UserV1, ActiveV1, OtherV1], relations: [] });
    await controllerV1.setup(true);
    await systemV1.storage.create('R7bUser', { active: true });
    const oldManifest = createMigrationManifest(controllerV1);

    // v2: both the filtered entity and its base are gone
    const OtherV2 = new (Entity as any)({
      name: 'R7bOther',
      properties: [new (Property as any)({ name: 'x', type: 'string' }, { uuid: 'r7b-other-x' })],
    }, { uuid: 'r7b-other' });
    const systemV2 = new MonoSystem(db);
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [OtherV2], relations: [] });
    const statesV2 = controllerV2.scheduler.createStates();
    const internalRequirementsV2 = controllerV2.scheduler.createInternalSchemaRequirements();
    const schemaPlanV2 = await (systemV2 as any).prepareMigrationSchema(
      controllerV2.entities, controllerV2.relations, statesV2, { internalRequirements: internalRequirementsV2 });
    const newManifest = createMigrationManifest(controllerV2, schemaPlanV2.schema);

    const events = await recomputeFilteredMemberships(controllerV1, oldManifest, newManifest);
    expect(events.filter(e => e.recordName === 'R7bActiveUser')).toEqual([]);
    await db.close();
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
            getInitialValue: () => 0,
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
            getInitialValue: () => 0,
          })
        }),
        Property.create({
          name: 'b', type: 'number',
          computation: Custom.create({
            name: 'bCalcF3b',
            dataDeps: { _current: { type: 'property', attributeQuery: ['a'] } },
            compute: async function(deps: any) { calls++; return (deps._current?.a ?? 0) + 1; },
            getInitialValue: () => 0,
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
            getInitialValue: () => 0,
          })
        }),
        Property.create({
          name: 'quadruple', type: 'number',
          computation: Custom.create({
            name: 'quadCalcF3c',
            dataDeps: { _current: { type: 'property', attributeQuery: ['double'] } },
            compute: async function(deps: any) { return (deps._current?.double ?? 0) * 2; },
            getInitialValue: () => 0,
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
