/**
 * r26 遗留项收口回归（多轮记录项的一次性清理）：
 * L-1 迁移 operationKey 去下标（内容键 + legacy 双读）
 * L-2 canonicalizeArgsForSignature 的 Date/Set/Map/RegExp codec（generator 4→5）
 * L-3 readMigrationManifest 损坏 JSON 受控报错
 * L-4 createClass 统一声明期校验（required/options/constraints 接线）
 * L-5 StateMachine.clone(deep) 真深拷贝
 * L-6 Transform 唯一索引名换 sha1 + legacy 索引清理
 * L-7 timestamp 跨驱动归一化（写 Date|ms|ISO，读恒 epoch 毫秒；match/atomic 同契约）
 */
import { describe, expect, test } from 'vitest'
import {
  Entity, Property, Relation, Controller, MonoSystem, KlassByName, MatchExp,
  Count, Summation, Transform, Custom, StateMachine, StateNode, StateTransfer,
  EventSource, Activity, ActivityGroup, Dictionary,
} from 'interaqt'
import { PGLiteDB, SQLiteDB, PostgreSQLDB, MysqlDB } from '@drivers'
import { createMigrationManifest } from '../../src/runtime/migration.js'

const PG = process.env.INTERAQT_POSTGRES_DATABASE
const MY = process.env.INTERAQT_MYSQL_DATABASE

// ============ L-1 operationKey 内容键 ============

describe('L-1 — migration operationKey is content-addressed', () => {
  test('completed op is skipped after plan reorder; legacy index-keyed row still honored', async () => {
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const E = Entity.create({ name: 'L1E', properties: [Property.create({ name: 'v', type: 'string' })] })
    const controller = new Controller({ system, entities: [E], relations: [], eventSources: [] })
    await controller.setup(true)

    const storage = (system as any).storage
    const migrationId = 'l1-resume-test'
    await (system as any).ensureMigrationManifestTable?.() ?? null
    // 通过 system 侧 API 确保 operation-log 表存在
    await system.markMigrationOperationComplete(migrationId, 'bootstrap:noop')

    const opA = { kind: 'add-column', tableName: 'L1E', columnName: 'colA', sql: 'ALTER TABLE "L1E" ADD COLUMN "colA" TEXT', description: 'add colA', logicalPath: 'L1E.colA' }
    const opB = { kind: 'add-column', tableName: 'L1E', columnName: 'colB', sql: 'ALTER TABLE "L1E" ADD COLUMN "colB" TEXT', description: 'add colB', logicalPath: 'L1E.colB' }

    // 场景 1：opB 以内容键标记完成（原计划里它在 index 1）——重排后 opB 在 index 0，仍须被跳过。
    const contentKeyB = `schema:${opB.kind}:${opB.tableName}:${opB.columnName}:${opB.logicalPath}:${opB.sql}#0`
    await system.markMigrationOperationComplete(migrationId, contentKeyB)
    // 先物理加上 colB：若 resume 未跳过 opB，会因重复列而抛错。
    await (storage as any).db.scheme(opB.sql, 'pre-apply colB')

    await (storage as any).applyMigrationOperations('schema', [opB, opA], migrationId)
    const cols = await (storage as any).db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'L1E'`, [], 'cols')
    const names = cols.map((c: any) => c.column_name)
    expect(names).toContain('colA')
    expect(names).toContain('colB')

    // 场景 2：legacy（含下标）键标记的操作在新代码下仍被识别（跨版本 resume 兼容）。
    const opC = { kind: 'add-column', tableName: 'L1E', columnName: 'colC', sql: 'ALTER TABLE "L1E" ADD COLUMN "colC" TEXT', description: 'add colC', logicalPath: 'L1E.colC' }
    const legacyKeyC = `schema:0:${opC.kind}:${opC.tableName}:${opC.columnName}:${opC.logicalPath}:${opC.sql}`
    await system.markMigrationOperationComplete(migrationId, legacyKeyC)
    await (storage as any).db.scheme(opC.sql, 'pre-apply colC')
    await (storage as any).applyMigrationOperations('schema', [opC], migrationId)

    await system.destroy()
  })
})

// ============ L-2 签名 codec ============

describe('L-2 — argsSignature codecs for Date/Set/Map/RegExp', () => {
  function buildController(triggerRecord: Record<string, unknown>) {
    const idle = StateNode.create({ name: `idle` })
    const done = StateNode.create({ name: `done` })
    const E = Entity.create({
      name: 'L2E',
      properties: [
        Property.create({ name: 'v', type: 'string' }),
        Property.create({
          name: 'l2state',
          type: 'string',
          computation: StateMachine.create({
            states: [idle, done],
            initialState: idle,
            transfers: [StateTransfer.create({
              current: idle, next: done,
              trigger: { recordName: 'L2Other', type: 'create', record: triggerRecord },
              computeTarget: () => undefined,
            })],
          }),
        }),
      ],
    })
    const Other = Entity.create({ name: 'L2Other', properties: [Property.create({ name: 'x', type: 'string' })] })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    return new Controller({ system, entities: [E, Other], relations: [], eventSources: [] })
  }
  function sigOf(controller: Controller) {
    return createMigrationManifest(controller).computations.find(c => c.id.includes('l2state'))?.argsSignature
  }

  test('Date value participates in signature; equal Dates sign equally', () => {
    const a = sigOf(buildController({ createdAt: new Date('2020-01-01T00:00:00Z') }))
    const b = sigOf(buildController({ createdAt: new Date('2021-06-15T00:00:00Z') }))
    const a2 = sigOf(buildController({ createdAt: new Date('2020-01-01T00:00:00Z') }))
    expect(a).toBeDefined()
    expect(a).not.toBe(b)
    expect(a).toBe(a2)
    // 与空对象（旧 codec 的坍缩形态）可区分
    const empty = sigOf(buildController({ createdAt: {} }))
    expect(a).not.toBe(empty)
  })

  test('Set is order-insensitive but content-sensitive; Map and RegExp are distinguishable', () => {
    const s1 = sigOf(buildController({ tags: new Set(['a', 'b']) }))
    const s2 = sigOf(buildController({ tags: new Set(['b', 'a']) }))
    const s3 = sigOf(buildController({ tags: new Set(['a', 'c']) }))
    expect(s1).toBe(s2)
    expect(s1).not.toBe(s3)

    const m1 = sigOf(buildController({ meta: new Map([['k', 1]]) }))
    const m2 = sigOf(buildController({ meta: new Map([['k', 2]]) }))
    expect(m1).not.toBe(m2)

    const r1 = sigOf(buildController({ pattern: /abc/ }))
    const r2 = sigOf(buildController({ pattern: /abc/i }))
    expect(r1).not.toBe(r2)
  })
})

// ============ L-3 manifest 损坏 ============

describe('L-3 — corrupted migration manifest gets a guided error', () => {
  test('invalid JSON in manifest row throws with recovery guidance', { timeout: 30000 }, async () => {
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const E = Entity.create({ name: 'L3E', properties: [Property.create({ name: 'v', type: 'string' })] })
    const controller = new Controller({ system, entities: [E], relations: [], eventSources: [] })
    await controller.setup(true)

    await (system as any).db.query(`UPDATE "__interaqt_migration_manifest" SET "value" = '{corrupted' WHERE "key" = 'current'`, [], 'corrupt manifest')
    await expect(system.readMigrationManifest()).rejects.toThrow(/corrupted.*createMigrationBaseline/s)
    await system.destroy()
  })
})

// ============ L-4 createClass 统一校验 ============

describe('L-4 — declaration-time validation wired via static.public', () => {
  test('aggregations require record or property', () => {
    expect(() => Count.create({} as any)).toThrow(/record.*property|property.*record/i)
    expect(() => Summation.create({ attributeQuery: ['x'] } as any)).toThrow(/record.*property|property.*record/i)
    // property-level 与 record-level 均放行
    expect(() => Count.create({ property: 'items' })).not.toThrow()
  })

  test('Transform requires callback and exactly one of record/eventDeps', () => {
    expect(() => Transform.create({ callback: () => [] } as any)).toThrow(/record.*eventDeps/i)
    const E = Entity.create({ name: 'L4TE', properties: [Property.create({ name: 'v', type: 'string' })] })
    expect(() => Transform.create({ record: E, eventDeps: { e: { recordName: 'X', type: 'create' } } as any, callback: () => [] })).toThrow(/not both/i)
    expect(() => Transform.create({ record: E } as any)).toThrow(/callback/i)
  })

  test('Custom requires name; EventSource requires entity', () => {
    expect(() => Custom.create({} as any)).toThrow(/name/i)
    expect(() => EventSource.create({ name: 'l4es' } as any)).toThrow(/entity/i)
  })

  test('Activity requires name; ActivityGroup type is whitelisted', () => {
    expect(() => Activity.create({} as any)).toThrow(/name/i)
    expect(() => ActivityGroup.create({ type: 'sequential' } as any)).toThrow(/invalid "type".*any.*every.*race/s)
  })
})

// ============ L-5 StateMachine deep clone ============

describe('L-5 — StateMachine.clone(deep) isolates the graph', () => {
  test('mutating cloned nodes/transfers does not affect the original', () => {
    const a = StateNode.create({ name: 'a' })
    const b = StateNode.create({ name: 'b' })
    const sm = StateMachine.create({
      states: [a, b], initialState: a,
      transfers: [StateTransfer.create({ current: a, next: b, trigger: { recordName: 'X', type: 'create', record: { flag: true } } })],
    })
    const cloned = StateMachine.clone(sm, true)

    expect(cloned.states[0]).not.toBe(sm.states[0])
    expect(cloned.transfers[0]).not.toBe(sm.transfers[0])
    expect(cloned.transfers[0].trigger).not.toBe(sm.transfers[0].trigger)
    // 图同构：clone 的 transfer 端点指向 clone 的节点
    expect(cloned.transfers[0].current).toBe(cloned.states[0])
    expect(cloned.transfers[0].next).toBe(cloned.states[1])
    expect(cloned.initialState).toBe(cloned.states[0])

    ;(cloned.states[0] as any).name = 'mutated'
    ;(cloned.transfers[0].trigger.record as any).flag = false
    expect(sm.states[0].name).toBe('a')
    expect((sm.transfers[0].trigger.record as any).flag).toBe(true)

    // 浅 clone 保持共享语义（既有行为）
    const shallow = StateMachine.clone(sm, false)
    expect(shallow.states[0]).toBe(sm.states[0])
  })
})

// ============ L-6 Transform 索引名 ============

describe('L-6 — transform unique index uses sha1 name and drops legacy', () => {
  test('new-name index created; legacy weak-hash index dropped on setup', async () => {
    function legacyHash(input: string) {
      let hash = 0
      for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
      return Math.abs(hash).toString(36)
    }
    const Source = Entity.create({ name: 'L6Src', properties: [Property.create({ name: 'n', type: 'number' })] })
    const Derived = Entity.create({
      name: 'L6Derived',
      properties: [Property.create({ name: 'n2', type: 'number' })],
      computation: Transform.create({
        record: Source,
        attributeQuery: ['n'],
        callback: (s: any) => ({ n2: s.n * 2 }),
      }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Source, Derived], relations: [], eventSources: [] })
    await controller.setup(true)

    const indexes = await (system as any).db.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'L6Derived'`, [], 'list indexes')
    const transformIdx = indexes.filter((r: any) => r.indexname.startsWith('idx_transform_'))
    expect(transformIdx.length).toBe(1)
    // sha1 名：20 hex
    expect(transformIdx[0].indexname).toMatch(/^idx_transform_[0-9a-f]{20}$/)

    // 从真实索引定义反推 identifierInput，计算 legacy 名并植入同定义索引；
    // 重跑 setup(false) 应清理 legacy 名（drop 逻辑按同一 identifierInput 推导）。
    const colMatch = (transformIdx[0].indexdef as string).match(/\(([^)]+)\)/)!
    const [srcField, idxField] = colMatch[1].split(',').map(s => s.trim().replace(/"/g, ''))
    const legacyName = `idx_transform_${legacyHash(`L6Derived_${srcField}_${idxField}`)}`
    await (system as any).db.scheme(
      `CREATE UNIQUE INDEX "${legacyName}" ON "L6Derived" ("${srcField}", "${idxField}")`, 'plant legacy index')

    const controller2 = new Controller({ system, entities: [Source, Derived], relations: [], eventSources: [] })
    await controller2.setup(false)
    const indexes2 = await (system as any).db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'L6Derived'`, [], 'list indexes 2')
    const names2 = indexes2.map((r: any) => r.indexname)
    expect(names2).not.toContain(legacyName)
    expect(names2.filter((n: string) => /^idx_transform_[0-9a-f]{20}$/.test(n)).length).toBe(1)

    await system.destroy()
  })
})

// ============ L-7 timestamp 归一化 ============

async function timestampRoundTrip(db: any, options?: { skipUpdatePath?: boolean }) {
  const E = Entity.create({
    name: 'TsE',
    properties: [
      Property.create({ name: 'label', type: 'string' }),
      Property.create({ name: 'at', type: 'timestamp' }),
    ],
  })
  const system = new MonoSystem(db)
  system.conceptClass = KlassByName
  const controller = new Controller({ system, entities: [E], relations: [], eventSources: [] })
  await controller.setup(true)

  const ms = Date.UTC(2024, 4, 15, 12, 30, 45)
  const r1 = await system.storage.create('TsE', { label: 'date', at: new Date(ms) })
  const r2 = await system.storage.create('TsE', { label: 'num', at: ms })
  const r3 = await system.storage.create('TsE', { label: 'iso', at: new Date(ms).toISOString() })

  const rows = await system.storage.find('TsE', undefined, undefined, ['label', 'at'])
  for (const row of rows) {
    expect(typeof row.at, `${row.label} read type`).toBe('number')
    expect(row.at, `${row.label} read value`).toBe(ms)
  }

  // match：number / Date / ISO 三形态
  const byNum = await system.storage.find('TsE', MatchExp.atom({ key: 'at', value: ['=', ms] }), undefined, ['label'])
  expect(byNum.length).toBe(3)
  const byDate = await system.storage.find('TsE', MatchExp.atom({ key: 'at', value: ['=', new Date(ms)] }), undefined, ['label'])
  expect(byDate.length).toBe(3)
  const byBetween = await system.storage.find('TsE',
    MatchExp.atom({ key: 'at', value: ['between', [ms - 1000, ms + 1000]] }), undefined, ['label'])
  expect(byBetween.length).toBe(3)
  const byGt = await system.storage.find('TsE', MatchExp.atom({ key: 'at', value: ['>', ms + 1] }), undefined, ['label'])
  expect(byGt.length).toBe(0)

  // update 路径（MySQL 驱动 transactions:false，storage.update 需要事务——按驱动限制跳过）
  if (!options?.skipUpdatePath) {
    await system.storage.update('TsE', MatchExp.atom({ key: 'id', value: ['=', r1.id] }), { at: new Date(ms + 5000) })
    const updated = await system.storage.findOne('TsE', MatchExp.atom({ key: 'id', value: ['=', r1.id] }), undefined, ['at'])
    expect(updated.at).toBe(ms + 5000)
  }

  await system.destroy()
}

describe('L-7 — timestamp normalization (epoch-ms contract)', () => {
  test('PGLite: write Date|ms|ISO, read ms; match by ms/Date/between', async () => {
    await timestampRoundTrip(new PGLiteDB())
  })
  test('SQLite: write Date|ms|ISO, read ms; match by ms/Date/between', async () => {
    await timestampRoundTrip(new SQLiteDB())
  })
  test.skipIf(!PG)('real PostgreSQL: same contract', async () => {
    await timestampRoundTrip(new PostgreSQLDB(`${PG}_ts_norm`, {
      host: process.env.PGHOST, user: process.env.PGUSER, password: process.env.PGPASSWORD,
    }))
  })
  test.skipIf(!MY)('real MySQL: same contract (EntityQueryHandle layer; driver declares transactions:false)', async () => {
    // MySQL 驱动 transactions:false——MonoStorage.create/update 走事务包装会 fail-fast，
    //  这是既有驱动限制（transactionCapability.spec 固化）。timestamp 契约在存储层验证。
    const db = new MysqlDB(`${MY}_ts_norm`, {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      user: process.env.MYSQL_USER || 'interaqt',
      password: process.env.MYSQL_PASSWORD || 'interaqt',
    })
    await db.open(true)
    const E = Entity.create({
      name: 'TsMy',
      properties: [
        Property.create({ name: 'label', type: 'string' }),
        Property.create({ name: 'at', type: 'timestamp' }),
      ],
    })
    const { DBSetup, EntityQueryHandle, EntityToTableMap } = await import('@storage')
    const setup = new DBSetup([E], [], db as any)
    await setup.createTables()
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db as any)

    const ms = Date.UTC(2024, 4, 15, 12, 30, 45)
    await handle.create('TsMy', { label: 'date', at: new Date(ms) })
    await handle.create('TsMy', { label: 'num', at: ms })
    await handle.create('TsMy', { label: 'iso', at: new Date(ms).toISOString() })

    const rows = await handle.find('TsMy', undefined, undefined, ['label', 'at'])
    for (const row of rows) {
      expect(typeof row.at, `${row.label} read type`).toBe('number')
      expect(row.at, `${row.label} read value`).toBe(ms)
    }
    const byDate = await handle.find('TsMy', MatchExp.atom({ key: 'at', value: ['=', new Date(ms)] }), undefined, ['label'])
    expect(byDate.length).toBe(3)
    const byBetween = await handle.find('TsMy',
      MatchExp.atom({ key: 'at', value: ['between', [ms - 1000, ms + 1000]] }), undefined, ['label'])
    expect(byBetween.length).toBe(3)
    await db.close()
  })

  test('atomic get/replace on timestamp field follows the same contract (PGLite + SQLite)', async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB()] as any[]) {
      const E = Entity.create({
        name: 'TsAtomic',
        properties: [
          Property.create({ name: 'label', type: 'string' }),
          Property.create({ name: 'at', type: 'timestamp' }),
        ],
      })
      const system = new MonoSystem(db)
      system.conceptClass = KlassByName
      const controller = new Controller({ system, entities: [E], relations: [], eventSources: [] })
      await controller.setup(true)

      const ms = Date.UTC(2023, 0, 2, 3, 4, 5)
      const row = await system.storage.create('TsAtomic', { label: 'x', at: ms })
      const got = await system.storage.atomic.get({ recordName: 'TsAtomic', id: row.id, field: 'at' })
      expect(got).toBe(ms)

      const replaced = await system.storage.atomic.replace(
        { recordName: 'TsAtomic', id: row.id, field: 'at' }, new Date(ms + 1000))
      expect(replaced.oldValue).toBe(ms)
      expect(replaced.newValue).toBe(ms + 1000)

      const after = await system.storage.findOne('TsAtomic', MatchExp.atom({ key: 'id', value: ['=', row.id] }), undefined, ['at'])
      expect(after.at).toBe(ms + 1000)
      await system.destroy()
    }
  })
})
