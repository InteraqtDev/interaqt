import { describe, expect, test } from "vitest";
import { Entity, Property, Controller, MonoSystem, KlassByName, MatchExp } from 'interaqt';
import { PostgreSQLDB } from '@drivers';

/**
 * r25 I-1：Property type:'json' 的匹配必须在真实 PostgreSQL 上可用。
 *
 * r23 把 'json' 纳入 Property.type 白名单，但 PG/MySQL 驱动的 parseMatchExpression 以
 * `fieldType === 'JSON'`（大小写敏感）做方言入口判定，而 mapToDBFieldType 对 type:'json'
 * 产出小写 'json'（object/collection 产出大写 'JSON'）——方言不识别自己产出的 fieldType，
 * 回退文本比较后 PG 直接抛 "operator does not exist: json = unknown"。
 * PGLite（toLowerCase 判定）不受影响——同一声明在两个 PostgreSQL 语义驱动上答案分裂。
 *
 * 需要 INTERAQT_POSTGRES_DATABASE（同 postgresqlConcurrency 等套件），未设置时跳过。
 */
const PG_ENABLED = !!process.env.INTERAQT_POSTGRES_DATABASE;

function pgConfig() {
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  };
}

describe.skipIf(!PG_ENABLED)('PostgreSQL type:json match (r25 I-1)', () => {
  test("json = / != / in match works on a type:'json' property", async () => {
    const Doc = Entity.create({
      name: 'JmDoc',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'meta', type: 'json' }),
      ],
    });
    const db = new PostgreSQLDB(`${process.env.INTERAQT_POSTGRES_DATABASE}_jsonmatch`, pgConfig());
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Doc], relations: [], dict: [] });
    await controller.setup(true);

    await system.storage.create('JmDoc', { title: 'a', meta: { k: 1, j: 2 } });
    await system.storage.create('JmDoc', { title: 'b', meta: { k: 9 } });

    // = 语义相等（键序不敏感，::jsonb 比较）
    const eq = await system.storage.find('JmDoc', MatchExp.atom({ key: 'meta', value: ['=', { j: 2, k: 1 }] }), undefined, ['title']);
    expect(eq.map((d: any) => d.title)).toEqual(['a']);

    // != 排除匹配行（NULL 行不参与）
    const neq = await system.storage.find('JmDoc', MatchExp.atom({ key: 'meta', value: ['!=', { j: 2, k: 1 }] }), undefined, ['title']);
    expect(neq.map((d: any) => d.title)).toEqual(['b']);

    // in 逐元素语义比较
    const inList = await system.storage.find('JmDoc', MatchExp.atom({ key: 'meta', value: ['in', [{ k: 9 }, { nope: 1 }]] }), undefined, ['title']);
    expect(inList.map((d: any) => d.title)).toEqual(['b']);

    await system.destroy();
  });

  test("contains still works on collection properties (uppercase 'JSON' fieldType control)", async () => {
    const Doc = Entity.create({
      name: 'JmDoc2',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'tags', type: 'string', collection: true }),
      ],
    });
    const db = new PostgreSQLDB(`${process.env.INTERAQT_POSTGRES_DATABASE}_jsonmatch2`, pgConfig());
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Doc], relations: [], dict: [] });
    await controller.setup(true);

    await system.storage.create('JmDoc2', { title: 'a', tags: ['x', 'y'] });
    await system.storage.create('JmDoc2', { title: 'b', tags: ['z'] });

    const found = await system.storage.find('JmDoc2', MatchExp.atom({ key: 'tags', value: ['contains', 'x'] }), undefined, ['title']);
    expect(found.map((d: any) => d.title)).toEqual(['a']);
    await system.destroy();
  });
});
