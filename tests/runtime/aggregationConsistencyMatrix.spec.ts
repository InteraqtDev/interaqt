/**
 * Combinatorial aggregation-consistency matrix (review round 6, 2026-07-09).
 *
 * Oracle-based exploration of the (source shape × aggregation kind × mutation kind)
 * space: after EVERY mutation, each incrementally-maintained aggregation value must
 * equal a full recompute from a fresh storage query (ground truth computed in JS).
 * Mismatches are collected instead of thrown per-cell, so a single run reveals the
 * state of the whole matrix.
 *
 * The final assertion compares the set of broken cells against KNOWN_BROKEN_CELLS —
 * the currently-known defect inventory (see agentspace/output/deep-review-2026-07-09-r6-matrix.md):
 *  - a NEW cell appearing        => regression, fix it;
 *  - a KNOWN cell disappearing   => you fixed it, remove it from the allowlist so the
 *    matrix permanently guards the fix.
 */
import { describe, expect, test } from "vitest";
import {
  Any, Average, Controller, Count, Dictionary, Entity, Every, KlassByName, MatchExp, MonoSystem,
  Property, Relation, Summation, WeightedSummation,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

type Mismatch = { cell: string; step: string; expected: unknown; actual: unknown };
const allMismatches: Mismatch[] = [];

const near = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
};

// ---------------------------------------------------------------------------
// Aggregation kinds: definition factory + JS ground-truth over queried rows
// ---------------------------------------------------------------------------
type AggKind = {
  name: string;
  dictType: string;
  create: (record: any, field: string) => any;
  truth: (rows: any[], field: string, emptyConvention: unknown) => unknown;
};

const aggKinds: AggKind[] = [
  {
    name: 'count', dictType: 'number',
    create: (record) => Count.create({ record, callback: () => true }),
    truth: (rows) => rows.length,
  },
  {
    name: 'countCb', dictType: 'number',
    create: (record, field) => Count.create({ record, attributeQuery: [field], callback: (r: any) => (r[field] ?? 0) > 10 }),
    truth: (rows, field) => rows.filter(r => (r[field] ?? 0) > 10).length,
  },
  {
    name: 'sum', dictType: 'number',
    create: (record, field) => Summation.create({ record, attributeQuery: [field] }),
    truth: (rows, field) => rows.reduce((a, r) => a + (r[field] ?? 0), 0),
  },
  {
    name: 'avg', dictType: 'number',
    create: (record, field) => Average.create({ record, attributeQuery: [field] }),
    truth: (rows, field, empty) => {
      const nums = rows.map(r => r[field]).filter((v: any) => typeof v === 'number');
      return nums.length ? nums.reduce((a: number, b: number) => a + b, 0) / nums.length : empty;
    },
  },
  {
    name: 'weighted', dictType: 'number',
    create: (record, field) => WeightedSummation.create({
      record, attributeQuery: [field],
      callback: (r: any) => ({ weight: 2, value: r[field] ?? 0 }),
    }),
    truth: (rows, field) => rows.reduce((a, r) => a + 2 * (r[field] ?? 0), 0),
  },
  {
    name: 'every', dictType: 'boolean',
    create: (record, field) => Every.create({ record, attributeQuery: [field], callback: (r: any) => (r[field] ?? 0) > 0, notEmpty: false }),
    truth: (rows, field, empty) => rows.length === 0 ? empty : rows.every(r => (r[field] ?? 0) > 0),
  },
  {
    name: 'any', dictType: 'boolean',
    create: (record, field) => Any.create({ record, attributeQuery: [field], callback: (r: any) => (r[field] ?? 0) > 100 }),
    truth: (rows, field, empty) => rows.length === 0 ? empty : rows.some(r => (r[field] ?? 0) > 100),
  },
];

// ---------------------------------------------------------------------------
// Harness: build dicts for every (source × agg), capture empty conventions,
// then after each mutation compare dict values vs ground truth.
// ---------------------------------------------------------------------------
function buildGlobalDicts(sources: { key: string; entity: any; field: string }[]) {
  const dicts: any[] = [];
  const cells: { cell: string; dictName: string; sourceName: string; field: string; agg: AggKind }[] = [];
  for (const src of sources) {
    for (const agg of aggKinds) {
      const dictName = `mx_${src.key}_${agg.name}`;
      let computation: any;
      try {
        computation = agg.create(src.entity, src.field);
      } catch (e: any) {
        allMismatches.push({ cell: `${src.key}/${agg.name}`, step: 'declare', expected: 'accepted', actual: `throw: ${e.message}` });
        continue;
      }
      dicts.push(Dictionary.create({ name: dictName, type: agg.dictType, collection: false, computation }));
      cells.push({ cell: `${src.key}/${agg.name}`, dictName, sourceName: src.entity.name!, field: src.field, agg });
    }
  }
  return { dicts, cells };
}

async function makeChecker(system: any, cells: { cell: string; dictName: string; sourceName: string; field: string; agg: AggKind }[]) {
  const emptyConventions: Record<string, unknown> = {};
  for (const c of cells) {
    emptyConventions[c.cell] = await system.storage.dict.get(c.dictName);
  }
  return async (step: string) => {
    for (const c of cells) {
      let actual: unknown, rows: any[];
      try {
        actual = await system.storage.dict.get(c.dictName);
        rows = await system.storage.find(c.sourceName, undefined, undefined, ['*']);
      } catch (e: any) {
        allMismatches.push({ cell: c.cell, step, expected: 'no throw', actual: `throw: ${e.message}` });
        continue;
      }
      const expected = c.agg.truth(rows, c.field, emptyConventions[c.cell]);
      if (!near(actual, expected)) {
        allMismatches.push({ cell: c.cell, step, expected, actual });
      }
    }
  };
}

describe('combinatorial matrix exploration', () => {
  // =========================================================================
  // PART 1: GLOBAL host × entity-family sources × 7 aggregations
  // =========================================================================
  test('P1 global × {entity, filtered, filtered-computed, nested-filtered}', async () => {
    const Task = Entity.create({
      name: 'MxeTask',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean' }),
        Property.create({ name: 'priority', type: 'string' }),
        Property.create({ name: 'score', type: 'number' }),
        Property.create({ name: 'isActiveC', type: 'boolean', computed: (r: any) => r.status === 'active' }),
      ],
    });
    const Active = Entity.create({ name: 'MxeActive', baseEntity: Task, matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }) });
    const ActiveC = Entity.create({ name: 'MxeActiveC', baseEntity: Task, matchExpression: MatchExp.atom({ key: 'isActiveC', value: ['=', true] }) });
    const HighActive = Entity.create({ name: 'MxeHighActive', baseEntity: Active, matchExpression: MatchExp.atom({ key: 'priority', value: ['=', 'high'] }) });

    const sources = [
      { key: 'entity', entity: Task, field: 'score' },
      { key: 'filtered', entity: Active, field: 'score' },
      { key: 'filteredComputed', entity: ActiveC, field: 'score' },
      { key: 'nestedFiltered', entity: HighActive, field: 'score' },
    ];
    const { dicts, cells } = buildGlobalDicts(sources);
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Task, Active, ActiveC, HighActive], relations: [], dict: dicts });
    await controller.setup(true);
    const check = await makeChecker(system, cells);

    const A = await system.storage.create('MxeTask', { title: 'A', status: 'active', isActive: true, priority: 'high', score: 5 });
    await check('s1 create member A(score5)');
    const B = await system.storage.create('MxeTask', { title: 'B', status: 'active', isActive: true, priority: 'low', score: 20 });
    await check('s2 create member B(score20)');
    const C = await system.storage.create('MxeTask', { title: 'C', status: 'inactive', isActive: false, priority: 'high', score: 50 });
    await check('s3 create non-member C(score50)');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', A.id] }), { score: 15 });
    await check('s4 member field update A.score->15');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', A.id] }), { title: 'A2' });
    await check('s5 member irrelevant update A.title');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', C.id] }), { status: 'active', isActive: true });
    await check('s6 enter C');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', B.id] }), { status: 'inactive', isActive: false });
    await check('s7 exit B');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', C.id] }), { score: 200 });
    await check('s8 member field update C.score->200');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', A.id] }), { score: 7, isActive: false });
    await check('s9 simultaneous field-change + exit A');
    await system.storage.delete('MxeTask', MatchExp.atom({ key: 'id', value: ['=', C.id] }));
    await check('s10 delete member C');
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', B.id] }), { score: 1 });
    await check('s11 non-member field update B.score->1');
    const D = await system.storage.create('MxeTask', { title: 'D', status: 'active', isActive: true, priority: 'high', score: 0 });
    await check('s12 create member D(score0 boundary)');
    await system.storage.delete('MxeTask', MatchExp.atom({ key: 'id', value: ['=', B.id] }));
    await check('s13 delete non-member B');
    // flip `every` purely via a member field update (no membership event)
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', D.id] }), { score: -5 });
    await check('s14 member field update D.score->-5 (every should flip)');
    // flip `any` purely via a member field update
    await system.storage.update('MxeTask', MatchExp.atom({ key: 'id', value: ['=', D.id] }), { score: 500 });
    await check('s15 member field update D.score->500 (any should flip)');

    console.log(`P1 mismatches so far: ${allMismatches.length}`);
  }, 120000);

  // =========================================================================
  // PART 2: GLOBAL host × {relation, filtered relation} × 7 aggregations
  // =========================================================================
  test('P2 global × relation-family sources', async () => {
    const Worker = Entity.create({ name: 'MxrWorker', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Job = Entity.create({ name: 'MxrJob', properties: [Property.create({ name: 'title', type: 'string' })] });
    const Assign = Relation.create({
      source: Worker, sourceProperty: 'jobs', target: Job, targetProperty: 'workers', type: 'n:n',
      properties: [
        Property.create({ name: 'flag', type: 'boolean' }),
        Property.create({ name: 'rscore', type: 'number' }),
      ],
    });
    const Flagged = Relation.create({
      name: 'MxrFlagged', baseRelation: Assign, sourceProperty: 'flaggedJobs', targetProperty: 'flaggedWorkers',
      matchExpression: MatchExp.atom({ key: 'flag', value: ['=', true] }),
    });
    const sources = [
      { key: 'relation', entity: Assign, field: 'rscore' },
      { key: 'filteredRelation', entity: Flagged, field: 'rscore' },
    ];
    const { dicts, cells } = buildGlobalDicts(sources);
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Worker, Job], relations: [Assign, Flagged], dict: dicts });
    await controller.setup(true);
    const check = await makeChecker(system, cells);
    const relName = Assign.name!;

    const w = await system.storage.create('MxrWorker', { name: 'w' });
    const j1 = await system.storage.create('MxrJob', { title: 'j1' });
    const j2 = await system.storage.create('MxrJob', { title: 'j2' });
    const l1 = await system.storage.create(relName, { source: { id: w.id }, target: { id: j1.id }, flag: true, rscore: 10 });
    await check('s1 link create member l1(rscore10)');
    const l2 = await system.storage.create(relName, { source: { id: w.id }, target: { id: j2.id }, flag: false, rscore: 120 });
    await check('s2 link create non-member l2(rscore120)');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l1.id] }), { rscore: 25 });
    await check('s3 member link field update l1.rscore->25');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l2.id] }), { flag: true });
    await check('s4 enter l2');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l1.id] }), { flag: false });
    await check('s5 exit l1');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l1.id] }), { rscore: 7 });
    await check('s6 non-member link field update');
    await system.storage.delete(relName, MatchExp.atom({ key: 'id', value: ['=', l2.id] }));
    await check('s7 delete member link l2');
    // cascade: delete an endpoint entity -> link cascades
    const j3 = await system.storage.create('MxrJob', { title: 'j3' });
    const l3 = await system.storage.create(relName, { source: { id: w.id }, target: { id: j3.id }, flag: true, rscore: 30 });
    await check('s8 link create member l3');
    await system.storage.delete('MxrJob', MatchExp.atom({ key: 'id', value: ['=', j3.id] }));
    await check('s9 cascade delete endpoint j3');
    // isolate every/any: flip them purely via member link field updates
    const j4 = await system.storage.create('MxrJob', { title: 'j4' });
    const l4 = await system.storage.create(relName, { source: { id: w.id }, target: { id: j4.id }, flag: true, rscore: 30 });
    await check('s10 link create member l4(rscore30)');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l4.id] }), { rscore: -5 });
    await check('s11 member link field update l4.rscore->-5 (every should flip)');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l4.id] }), { rscore: 500 });
    await check('s12 member link field update l4.rscore->500 (any should flip)');

    console.log(`P2 total mismatches so far: ${allMismatches.length}`);
  }, 120000);

  // =========================================================================
  // PART 3: PROPERTY host × {relation, filtered relation} × aggregations
  //   (per-host-record values, ground truth from per-record relation queries)
  // =========================================================================
  test('P3 property host over relation & filtered relation', async () => {
    const Job = Entity.create({ name: 'MxpJob', properties: [
      Property.create({ name: 'title', type: 'string' }),
      Property.create({ name: 'tscore', type: 'number' }),
    ] });
    const Worker = Entity.create({ name: 'MxpWorker', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Assign = Relation.create({
      source: Worker, sourceProperty: 'jobs', target: Job, targetProperty: 'workers', type: 'n:n',
      properties: [
        Property.create({ name: 'flag', type: 'boolean' }),
        Property.create({ name: 'rscore', type: 'number' }),
      ],
    });
    const Flagged = Relation.create({
      name: 'MxpFlagged', baseRelation: Assign, sourceProperty: 'flaggedJobs', targetProperty: 'flaggedWorkers',
      matchExpression: MatchExp.atom({ key: 'flag', value: ['=', true] }),
    });
    // property computations on Worker
    const propCells: { cell: string; propName: string; truth: (links: { rscore: number, flag: boolean, tscore: number }[], empty: unknown) => unknown; useFlagged: boolean }[] = [];
    const addProp = (propName: string, type: string, computation: any, truth: (links: any[], empty: unknown) => unknown, useFlagged: boolean) => {
      Worker.properties!.push(Property.create({ name: propName, type, computation }));
      propCells.push({ cell: `prop/${propName}`, propName, truth, useFlagged });
    };
    addProp('cnt', 'number', Count.create({ property: 'jobs', callback: () => true }), ls => ls.length, false);
    addProp('cntF', 'number', Count.create({ property: 'flaggedJobs', callback: () => true }), ls => ls.length, true);
    addProp('sumLink', 'number', Summation.create({ property: 'jobs', attributeQuery: [['&', { attributeQuery: ['rscore'] }]] }),
      ls => ls.reduce((a, l) => a + (l.rscore ?? 0), 0), false);
    addProp('sumLinkF', 'number', Summation.create({ property: 'flaggedJobs', attributeQuery: [['&', { attributeQuery: ['rscore'] }]] }),
      ls => ls.reduce((a, l) => a + (l.rscore ?? 0), 0), true);
    addProp('sumTarget', 'number', Summation.create({ property: 'jobs', attributeQuery: ['tscore'] }),
      ls => ls.reduce((a, l) => a + (l.tscore ?? 0), 0), false);
    addProp('sumTargetF', 'number', Summation.create({ property: 'flaggedJobs', attributeQuery: ['tscore'] }),
      ls => ls.reduce((a, l) => a + (l.tscore ?? 0), 0), true);
    addProp('everyBig', 'boolean', Every.create({ property: 'jobs', attributeQuery: [['&', { attributeQuery: ['rscore'] }]], callback: (j: any) => (j['&']?.rscore ?? 0) > 5, notEmpty: false }),
      (ls, empty) => ls.length === 0 ? empty : ls.every(l => (l.rscore ?? 0) > 5), false);
    addProp('anyBig', 'boolean', Any.create({ property: 'jobs', attributeQuery: [['&', { attributeQuery: ['rscore'] }]], callback: (j: any) => (j['&']?.rscore ?? 0) > 100 }),
      (ls, empty) => ls.length === 0 ? empty : ls.some(l => (l.rscore ?? 0) > 100), false);

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Worker, Job], relations: [Assign, Flagged] });
    await controller.setup(true);
    const relName = Assign.name!;

    const w = await system.storage.create('MxpWorker', { name: 'w' });
    const emptyConv: Record<string, unknown> = {};
    {
      const row = await system.storage.findOne('MxpWorker', MatchExp.atom({ key: 'id', value: ['=', w.id] }), undefined, ['*']);
      for (const c of propCells) emptyConv[c.cell] = row[c.propName];
    }
    const check = async (step: string) => {
      const row = await system.storage.findOne('MxpWorker', MatchExp.atom({ key: 'id', value: ['=', w.id] }), undefined, ['*']);
      // ground truth: all links of w with link props + target props
      const links = await system.storage.find(relName,
        MatchExp.atom({ key: 'source.id', value: ['=', w.id] }), undefined,
        ['*', ['target', { attributeQuery: ['tscore'] }]]);
      const shaped = links.map((l: any) => ({ rscore: l.rscore, flag: l.flag, tscore: l.target?.tscore }));
      for (const c of propCells) {
        const subset = c.useFlagged ? shaped.filter(l => l.flag === true) : shaped;
        const expected = c.truth(subset, emptyConv[c.cell]);
        const actual = row[c.propName];
        if (!near(actual, expected)) allMismatches.push({ cell: c.cell, step, expected, actual });
      }
    };

    const j1 = await system.storage.create('MxpJob', { title: 'j1', tscore: 3 });
    const j2 = await system.storage.create('MxpJob', { title: 'j2', tscore: 4 });
    const l1 = await system.storage.create(relName, { source: { id: w.id }, target: { id: j1.id }, flag: true, rscore: 10 });
    await check('s1 link create flagged l1');
    const l2 = await system.storage.create(relName, { source: { id: w.id }, target: { id: j2.id }, flag: false, rscore: 120 });
    await check('s2 link create unflagged l2');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l1.id] }), { rscore: 25 });
    await check('s3 link field update l1.rscore->25');
    await system.storage.update('MxpJob', MatchExp.atom({ key: 'id', value: ['=', j1.id] }), { tscore: 9 });
    await check('s4 target field update j1.tscore->9');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l2.id] }), { flag: true });
    await check('s5 enter l2 (flagged)');
    await system.storage.update(relName, MatchExp.atom({ key: 'id', value: ['=', l1.id] }), { flag: false });
    await check('s6 exit l1');
    await system.storage.delete(relName, MatchExp.atom({ key: 'id', value: ['=', l2.id] }));
    await check('s7 delete link l2');

    console.log(`P3 total mismatches so far: ${allMismatches.length}`);
  }, 120000);

  // =========================================================================
  // PART 4: create/update parity for relation payload forms
  //   invariant: state reached via update == state declared via create
  // =========================================================================
  test('P4 create/update parity of relation payload forms', async () => {
    const parityIssues: Mismatch[] = [];
    const Team = Entity.create({ name: 'MxfTeam', properties: [Property.create({ name: 'name', type: 'string' })] });
    const UserE = Entity.create({ name: 'MxfUser', properties: [Property.create({ name: 'uname', type: 'string' })] });
    const Membership = Relation.create({
      source: UserE, sourceProperty: 'teams', target: Team, targetProperty: 'members', type: 'n:n',
      properties: [Property.create({ name: 'role', type: 'string' })],
    });
    const Profile = Entity.create({ name: 'MxfProfile', properties: [Property.create({ name: 'bio', type: 'string' })] });
    const UserProfile = Relation.create({
      source: UserE, sourceProperty: 'profile', target: Profile, targetProperty: 'owner', type: '1:1',
      properties: [Property.create({ name: 'since', type: 'string' })],
    });
    const Order = Entity.create({ name: 'MxfOrder', properties: [Property.create({ name: 'title', type: 'string' })] });
    const UserOrder = Relation.create({
      source: UserE, sourceProperty: 'orders', target: Order, targetProperty: 'buyer', type: '1:n',
      properties: [Property.create({ name: 'note', type: 'string' })],
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Team, UserE, Profile, Order], relations: [Membership, UserProfile, UserOrder] });
    await controller.setup(true);

    const linkState = async (userId: string) => {
      const links = await system.storage.find(Membership.name!,
        MatchExp.atom({ key: 'source.id', value: ['=', userId] }), undefined,
        ['*', ['target', { attributeQuery: ['name'] }]]);
      return links.map((l: any) => ({ team: l.target?.name, role: l.role ?? null })).sort((a: any, b: any) => (a.team || '').localeCompare(b.team || ''));
    };
    const profileState = async (userId: string) => {
      const links = await system.storage.find(UserProfile.name!,
        MatchExp.atom({ key: 'source.id', value: ['=', userId] }), undefined,
        ['*', ['target', { attributeQuery: ['bio'] }]]);
      return links.map((l: any) => ({ bio: l.target?.bio, since: l.since ?? null }));
    };

    const t1 = await system.storage.create('MxfTeam', { name: 'alpha' });

    // n:n forms
    const forms: { name: string; payload: (tid: string) => any }[] = [
      { name: 'ref', payload: (tid) => [{ id: tid }] },
      { name: 'ref+&', payload: (tid) => [{ id: tid, '&': { role: 'lead' } }] },
      { name: 'nested+&', payload: () => [{ name: 'beta', '&': { role: 'member' } }] },
    ];
    for (const form of forms) {
      try {
        const uC = await system.storage.create('MxfUser', { uname: `c-${form.name}`, teams: form.payload(t1.id) });
        const uU = await system.storage.create('MxfUser', { uname: `u-${form.name}` });
        await system.storage.update('MxfUser', MatchExp.atom({ key: 'id', value: ['=', uU.id] }), { teams: form.payload(t1.id) });
        const sC = await linkState(uC.id); const sU = await linkState(uU.id);
        if (JSON.stringify(sC) !== JSON.stringify(sU)) {
          parityIssues.push({ cell: `parity/n:n/${form.name}`, step: 'create-vs-update', expected: sC, actual: sU });
        }
      } catch (e: any) {
        parityIssues.push({ cell: `parity/n:n/${form.name}`, step: 'CRASH', expected: 'no throw', actual: e.message });
      }
    }
    // 1:1 forms
    const p1 = await system.storage.create('MxfProfile', { bio: 'b1' });
    const p2 = await system.storage.create('MxfProfile', { bio: 'b2' });
    const oneForms: { name: string; payloadC: any; payloadU: any }[] = [
      { name: 'ref', payloadC: { id: p1.id }, payloadU: { id: p2.id } },
      { name: 'ref+&', payloadC: { id: p1.id, '&': { since: '2020' } }, payloadU: { id: p2.id, '&': { since: '2020' } } },
      { name: 'nested', payloadC: { bio: 'nestedC' }, payloadU: { bio: 'nestedU' } },
      { name: 'nested+&', payloadC: { bio: 'nestedC2', '&': { since: '2021' } }, payloadU: { bio: 'nestedU2', '&': { since: '2021' } } },
    ];
    for (const form of oneForms) {
      let uC: any, uU: any, sC: any = 'CREATE-CRASH', sU: any = 'UPDATE-CRASH';
      try {
        uC = await system.storage.create('MxfUser', { uname: `c1-${form.name}`, profile: form.payloadC });
        sC = (await profileState(uC.id)).map(s => ({ since: s.since, hasBio: !!s.bio }));
      } catch (e: any) {
        parityIssues.push({ cell: `parity/1:1/${form.name}/create`, step: 'CRASH', expected: 'no throw', actual: e.message });
      }
      try {
        uU = await system.storage.create('MxfUser', { uname: `u1-${form.name}` });
        await system.storage.update('MxfUser', MatchExp.atom({ key: 'id', value: ['=', uU.id] }), { profile: form.payloadU });
        sU = (await profileState(uU.id)).map(s => ({ since: s.since, hasBio: !!s.bio }));
      } catch (e: any) {
        parityIssues.push({ cell: `parity/1:1/${form.name}/update`, step: 'CRASH', expected: 'no throw', actual: e.message });
      }
      if (typeof sC !== 'string' && typeof sU !== 'string' && JSON.stringify(sC) !== JSON.stringify(sU)) {
        parityIssues.push({ cell: `parity/1:1/${form.name}`, step: 'create-vs-update', expected: sC, actual: sU });
      }
    }
    // 1:n forms (source side, xToMany array payload)
    const orderState = async (userId: string) => {
      const links = await system.storage.find(UserOrder.name!,
        MatchExp.atom({ key: 'source.id', value: ['=', userId] }), undefined,
        ['*', ['target', { attributeQuery: ['title'] }]]);
      return links.map((l: any) => ({ order: l.target?.title, note: l.note ?? null })).sort((a: any, b: any) => (a.order || '').localeCompare(b.order || ''));
    };
    const o1 = await system.storage.create('MxfOrder', { title: 'ord1' });
    const oForms: { name: string; payload: (oid: string) => any }[] = [
      { name: 'ref', payload: (oid) => [{ id: oid }] },
      { name: 'ref+&', payload: (oid) => [{ id: oid, '&': { note: 'n1' } }] },
      { name: 'nested+&', payload: () => [{ title: 'ord-new', '&': { note: 'n2' } }] },
    ];
    for (const form of oForms) {
      let sC: any = 'CREATE-CRASH', sU: any = 'UPDATE-CRASH';
      try {
        const uC = await system.storage.create('MxfUser', { uname: `co-${form.name}`, orders: form.payload(o1.id) });
        sC = await orderState(uC.id);
      } catch (e: any) {
        parityIssues.push({ cell: `parity/1:n/${form.name}/create`, step: 'CRASH', expected: 'no throw', actual: e.message.split('\n')[0] });
      }
      try {
        const uU = await system.storage.create('MxfUser', { uname: `uo-${form.name}` });
        await system.storage.update('MxfUser', MatchExp.atom({ key: 'id', value: ['=', uU.id] }), { orders: form.payload(o1.id) });
        sU = await orderState(uU.id);
      } catch (e: any) {
        parityIssues.push({ cell: `parity/1:n/${form.name}/update`, step: 'CRASH', expected: 'no throw', actual: e.message.split('\n')[0] });
      }
      if (typeof sC !== 'string' && typeof sU !== 'string' && JSON.stringify(sC.map((s: any) => s.note)) !== JSON.stringify(sU.map((s: any) => s.note))) {
        parityIssues.push({ cell: `parity/1:n/${form.name}`, step: 'create-vs-update', expected: sC, actual: sU });
      }
    }
    allMismatches.push(...parityIssues);
    console.log(`P4 total mismatches so far: ${allMismatches.length}`);
  }, 120000);

  // =========================================================================
  // FINAL: compare the whole matrix against the known defect inventory
  // =========================================================================
  test('ZZ matrix result matches known defect inventory', () => {
    // Known broken cells inventory. Every entry must be a real, reproduced defect
    // documented in agentspace/output/ review reports.
    // DO NOT add entries to hide regressions; REMOVE entries when the defect is fixed.
    //
    // History: the r6 exploration (deep-review-2026-07-09-r6-matrix.md) found 35 broken
    // cells (filtered-source aggregation blindness ×25, '&' link-data loss/crashes ×10).
    // All were fixed in the same branch — the inventory is now empty and this suite
    // acts as a pure regression guard over the whole combination space.
    const KNOWN_BROKEN_CELLS: string[] = [].sort();

    const byCell = new Map<string, Mismatch[]>();
    for (const m of allMismatches) {
      if (!byCell.has(m.cell)) byCell.set(m.cell, []);
      byCell.get(m.cell)!.push(m);
    }
    console.log('==================== MATRIX RESULT ====================');
    console.log(`broken cells: ${byCell.size}; total mismatch events: ${allMismatches.length}`);
    for (const [cell, ms] of byCell) {
      console.log(`\n[CELL] ${cell} (${ms.length} mismatches)`);
      for (const m of ms.slice(0, 4)) {
        console.log(`   step="${m.step}" expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`);
      }
      if (ms.length > 4) console.log(`   ... ${ms.length - 4} more`);
    }
    console.log('========================================================');

    const actualCells = Array.from(byCell.keys()).sort();
    const newRegressions = actualCells.filter(c => !KNOWN_BROKEN_CELLS.includes(c));
    const fixedCells = KNOWN_BROKEN_CELLS.filter(c => !actualCells.includes(c));
    expect(newRegressions, 'NEW broken cells (regressions) — investigate and fix').toEqual([]);
    expect(fixedCells, 'cells now passing — remove them from KNOWN_BROKEN_CELLS to lock in the fix').toEqual([]);
  });
});
