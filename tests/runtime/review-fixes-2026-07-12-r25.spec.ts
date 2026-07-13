import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Dictionary, Custom, StateMachine, StateNode, StateTransfer, MatchExp, Controller, MonoSystem, KlassByName } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';

const waitForListeners = () => new Promise(resolve => setTimeout(resolve, 50));

// r25 F-1（runtime 消费方）：行内 link create 事件缺 default-only 字段时，
// records dataDep 的 match 本地求值把缺席的普通值属性按 NULL 解读（快照完备性契约，r21 F-1）
// → 静默 skip → 增量少计；StateMachine trigger / Transform eventDeps 的深度匹配同样失明。
describe("r25 F-1 — downstream consumers see default-only fields on in-row link create events", () => {
  test("records dataDep match on default-only relation property counts in-row create (was: silent skip)", async () => {
    const User = Entity.create({ name: 'R25User', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Team = Entity.create({ name: 'R25Team', properties: [Property.create({ name: 'name', type: 'string' })] });
    const userTeam = Relation.create({
      name: 'R25UserTeam',
      source: User, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1',
      properties: [
        Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => true }),
        Property.create({ name: 'weight', type: 'number', defaultValue: () => 5 }),
      ],
    });
    const total = Dictionary.create({
      name: 'r25PrimaryWeightTotal',
      type: 'number',
      computation: Custom.create({
        name: 'R25PrimaryWeightTotal',
        dataDeps: {
          items: {
            type: 'records',
            source: userTeam,
            match: MatchExp.atom({ key: 'isPrimary', value: ['=', true] }),
            attributeQuery: ['isPrimary', 'weight'],
          },
        },
        compute(dataDeps: any) {
          return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.weight || 0), 0);
        },
        incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
          return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.weight || 0), 0);
        },
        incrementalDataDeps: ['items'],
        getInitialValue: () => 0,
      }),
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [User, Team], relations: [userTeam], dict: [total] });
    await controller.setup(true);

    const team = await system.storage.create('R25Team', { name: 'T1' });
    // 行内建立关系：link 属性全部来自 defaultValue（不带 '&'）
    await system.storage.create('R25User', { name: 'u1', team: { id: team.id } });
    await waitForListeners();

    // SQL 面与增量面必须同答案
    const matched = await system.storage.find('R25UserTeam', MatchExp.atom({ key: 'isPrimary', value: ['=', true] }), undefined, ['weight']);
    expect(matched).toHaveLength(1);
    expect(await system.storage.dict.get('r25PrimaryWeightTotal')).toBe(5);
    await system.destroy();
  });

  test("StateMachine trigger record pattern on default-only link property fires (was: never fires)", async () => {
    const User = Entity.create({ name: 'R25bUser', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Team = Entity.create({ name: 'R25bTeam', properties: [Property.create({ name: 'name', type: 'string' })] });
    const userTeam = Relation.create({
      name: 'R25bUserTeam',
      source: User, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1',
      properties: [Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => true })],
    });
    const idle = StateNode.create({ name: 'idle' });
    const linked = StateNode.create({ name: 'linked' });
    User.properties.push(Property.create({
      name: 'linkStatus',
      type: 'string',
      computation: StateMachine.create({
        states: [idle, linked],
        initialState: idle,
        transfers: [
          StateTransfer.create({
            current: idle,
            next: linked,
            trigger: { recordName: 'R25bUserTeam', type: 'create', record: { isPrimary: true } },
            computeTarget: (event: any) => ({ id: event.record?.source?.id }),
          }),
        ],
      }),
    }));
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [User, Team], relations: [userTeam], dict: [] });
    await controller.setup(true);

    const team = await system.storage.create('R25bTeam', { name: 'T1' });
    const u = await system.storage.create('R25bUser', { name: 'u1', team: { id: team.id } });
    await waitForListeners();

    const user = await system.storage.findOne('R25bUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), undefined, ['*']);
    expect(user.linkStatus).toBe('linked');
    await system.destroy();
  });
});

// r25 I-3：record-target atomic 写路径的 json 归一化（r24 读路径归一化的对称面）。
// replace 此前把 JS 对象裸传给 db.query（better-sqlite3 无法绑定对象直接崩溃）；
// compareAndSet 的单语句 COALESCE 比较在 PG 系 json 类型上没有等值操作符。
describe("r25 I-3 — record-target atomic write path handles json fields", () => {
  async function setupFixture(dbFactory: () => any) {
    const Item = Entity.create({
      name: 'R25Item',
      properties: [
        Property.create({ name: 'meta', type: 'json' }),
        Property.create({ name: 'flag', type: 'boolean' }),
      ],
    });
    const system = new MonoSystem(dbFactory());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Item], relations: [], dict: [] });
    await controller.setup(true);
    const item = await system.storage.create('R25Item', { meta: { a: 1 }, flag: false });
    return { system, item };
  }

  for (const [name, factory] of [['SQLite', () => new SQLiteDB()], ['PGLite', () => new PGLiteDB()]] as const) {
    test(`${name}: replace json writes canonical text and round-trips as object`, async () => {
      const { system, item } = await setupFixture(factory);
      const result = await system.storage.atomic.replace({ recordName: 'R25Item', id: item.id, field: 'meta' }, { b: 2 });
      expect(result.oldValue).toEqual({ a: 1 });
      expect(result.newValue).toEqual({ b: 2 });
      const after = await system.storage.findOne('R25Item', MatchExp.atom({ key: 'id', value: ['=', item.id] }), undefined, ['meta']);
      expect(after?.meta).toEqual({ b: 2 });
      await system.destroy();
    });

    test(`${name}: compareAndSet json compares canonically (key order insensitive)`, async () => {
      const { system, item } = await setupFixture(factory);
      // 期望值以不同键序书写（canonical 比较对键序不敏感）
      await system.storage.update('R25Item', MatchExp.atom({ key: 'id', value: ['=', item.id] }), { meta: { x: 1, y: 2 } });
      const ok = await system.storage.atomic.compareAndSet({ recordName: 'R25Item', id: item.id, field: 'meta' }, { y: 2, x: 1 }, { z: 3 });
      expect(ok).toBe(true);
      const miss = await system.storage.atomic.compareAndSet({ recordName: 'R25Item', id: item.id, field: 'meta' }, { nope: true }, { w: 4 });
      expect(miss).toBe(false);
      const after = await system.storage.findOne('R25Item', MatchExp.atom({ key: 'id', value: ['=', item.id] }), undefined, ['meta']);
      expect(after?.meta).toEqual({ z: 3 });
      await system.destroy();
    });

    test(`${name}: compareAndSet boolean keeps single-statement semantics`, async () => {
      const { system, item } = await setupFixture(factory);
      expect(await system.storage.atomic.compareAndSet({ recordName: 'R25Item', id: item.id, field: 'flag' }, false, true)).toBe(true);
      expect(await system.storage.atomic.compareAndSet({ recordName: 'R25Item', id: item.id, field: 'flag' }, false, true)).toBe(false);
      await system.destroy();
    });
  }
});

// r25 I-4：merged 声明面的声明期守卫——static.public 的 mergedEntityNoProperties /
// mergedRelationNoProperties 约束此前从未接线到 create；commonProperties 绕过名称守卫。
describe("r25 I-4 — merged declaration guards", () => {
  test("merged entity cannot declare properties", () => {
    const A = Entity.create({ name: 'R25GA', properties: [Property.create({ name: 'x', type: 'string' })] });
    const B = Entity.create({ name: 'R25GB', properties: [Property.create({ name: 'x', type: 'string' })] });
    expect(() => Entity.create({
      name: 'R25GUnion',
      inputEntities: [A, B],
      properties: [Property.create({ name: 'orphan', type: 'string' })],
    })).toThrowError(/cannot declare properties/);
    // 空数组照常放行
    expect(() => Entity.create({ name: 'R25GUnionOk', inputEntities: [A, B], properties: [] })).not.toThrow();
  });

  test("merged relation cannot declare properties", () => {
    const S = Entity.create({ name: 'R25GS' });
    const T = Entity.create({ name: 'R25GT' });
    const r1 = Relation.create({ source: S, sourceProperty: 'a1', target: T, targetProperty: 'b1', type: 'n:1' });
    const r2 = Relation.create({ source: S, sourceProperty: 'a2', target: T, targetProperty: 'b2', type: 'n:1' });
    expect(() => Relation.create({
      name: 'R25GMergedRel',
      inputRelations: [r1, r2],
      sourceProperty: 'merged', targetProperty: 'mergedRev',
      properties: [Property.create({ name: 'orphan', type: 'string' })],
    })).toThrowError(/cannot declare properties/);
  });

  test("commonProperties without inputEntities/inputRelations is rejected", () => {
    expect(() => Entity.create({
      name: 'R25GNoInput',
      commonProperties: [Property.create({ name: 'x', type: 'string' })],
    })).toThrowError(/commonProperties without inputEntities/);
    const S = Entity.create({ name: 'R25GS2' });
    const T = Entity.create({ name: 'R25GT2' });
    expect(() => Relation.create({
      source: S, sourceProperty: 'a', target: T, targetProperty: 'b', type: 'n:1',
      commonProperties: [Property.create({ name: 'x', type: 'string' })],
    })).toThrowError(/commonProperties without inputRelations/);
  });

  test("commonProperties go through reserved-name and duplicate-name guards", () => {
    const A = Entity.create({ name: 'R25GA2', properties: [Property.create({ name: 'x', type: 'string' })] });
    const B = Entity.create({ name: 'R25GB2', properties: [Property.create({ name: 'x', type: 'string' })] });
    expect(() => Entity.create({
      name: 'R25GUnion2',
      inputEntities: [A, B],
      commonProperties: [Property.create({ name: 'id', type: 'string' })],
    })).toThrowError(/reserved/);
    expect(() => Entity.create({
      name: 'R25GUnion3',
      inputEntities: [A, B],
      commonProperties: [Property.create({ name: 'x', type: 'string' }), Property.create({ name: 'x', type: 'string' })],
    })).toThrowError(/Duplicate property name/);
    // 合法 commonProperties 照常放行
    expect(() => Entity.create({
      name: 'R25GUnion4',
      inputEntities: [A, B],
      commonProperties: [Property.create({ name: 'x', type: 'string' })],
    })).not.toThrow();
  });
});

// r25 I-1（PGLite/SQLite 面）：Property type:'json' 的 =/!= 匹配跨驱动一致。
// 真实 PostgreSQL 的红-绿验证在 tests/runtime/postgresqlJsonMatch.spec.ts（env-gated）。
describe("r25 I-1 — type:'json' equality match is consistent on embedded drivers", () => {
  for (const [name, factory] of [['SQLite', () => new SQLiteDB()], ['PGLite', () => new PGLiteDB()]] as const) {
    test(`${name}: json = / != match (key-order insensitive)`, async () => {
      const Doc = Entity.create({
        name: 'R25Doc',
        properties: [
          Property.create({ name: 'title', type: 'string' }),
          Property.create({ name: 'meta', type: 'json' }),
        ],
      });
      const system = new MonoSystem(factory());
      system.conceptClass = KlassByName;
      const controller = new Controller({ system, entities: [Doc], relations: [], dict: [] });
      await controller.setup(true);
      await system.storage.create('R25Doc', { title: 'a', meta: { k: 1, j: 2 } });
      const found = await system.storage.find('R25Doc', MatchExp.atom({ key: 'meta', value: ['=', { j: 2, k: 1 }] }), undefined, ['title']);
      expect(found).toHaveLength(1);
      const notFound = await system.storage.find('R25Doc', MatchExp.atom({ key: 'meta', value: ['=', { j: 99 }] }), undefined, ['title']);
      expect(notFound).toHaveLength(0);
      await system.destroy();
    });
  }
});
