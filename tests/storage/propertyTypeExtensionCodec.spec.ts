/**
 * M-02 — Property read/write codec and opaque contract.
 *
 * - toDB/fromDB round-trip on create/update/find
 * - opaque (no codec) pass-through
 * - extended path does not trigger builtin json/timestamp transforms
 * - half-wired codec still rejected at define (registration atomicity)
 * - Dictionary JSON KV unchanged while extension storage is registered
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  Controller,
  Dictionary,
  Entity,
  EntityQueryHandle,
  EntityToTableMap,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  Relation,
  definePropertyType,
  isExtendedPropertyType,
  resetPropertyTypeRegistryForTests,
} from 'interaqt'
import { SQLiteDB } from '@drivers'
import { DBSetup } from '@storage'

beforeEach(() => {
  resetPropertyTypeRegistryForTests()
})

afterEach(() => {
  resetPropertyTypeRegistryForTests()
})

/** Canonical mock vector: number[] ↔ "v:1,2,3" string on SQLite TEXT. */
function registerPteVectorWithCodec() {
  definePropertyType({
    name: 'pte_vector',
    validateArgs(args) {
      const d = (args as { dimensions?: unknown } | undefined)?.dimensions
      if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
        throw new Error(`type "pte_vector" requires args.dimensions as a positive integer`)
      }
    },
    storage: {
      sqlite: {
        fieldType: ({ args }) =>
          `TEXT /* pte_vector(${(args as { dimensions: number }).dimensions}) */`,
        toDB(value, ctx) {
          if (value === null || value === undefined) return value
          if (!Array.isArray(value) || !value.every((n) => typeof n === 'number')) {
            throw new Error(
              `pte_vector expects number[]; got ${typeof value}` +
                (ctx.recordName && ctx.propertyName
                  ? ` on ${ctx.recordName}.${ctx.propertyName}`
                  : ''),
            )
          }
          const dims = (ctx.args as { dimensions: number }).dimensions
          if (value.length !== dims) {
            throw new Error(
              `pte_vector dimensions mismatch: expected ${dims}, got ${value.length}`,
            )
          }
          return `v:${value.join(',')}`
        },
        fromDB(value, ctx) {
          if (value === null || value === undefined) return value
          if (typeof value !== 'string' || !value.startsWith('v:')) {
            throw new Error(
              `pte_vector fromDB expected "v:..." string; got ${typeof value}` +
                (ctx.recordName && ctx.propertyName
                  ? ` on ${ctx.recordName}.${ctx.propertyName}`
                  : ''),
            )
          }
          const parts = value.slice(2).split(',').filter((s) => s.length > 0)
          const nums = parts.map((s) => Number(s))
          if (nums.some((n) => Number.isNaN(n))) {
            throw new Error(`pte_vector fromDB non-numeric payload: ${value}`)
          }
          return nums
        },
      },
    },
  })
}

function registerOpaqueToken() {
  definePropertyType({
    name: 'pte_opaque_token',
    storage: {
      sqlite: {
        // No toDB/fromDB — opaque pass-through contract.
        fieldType: 'TEXT',
      },
    },
  })
}

/**
 * fieldType string contains "json" so a fieldType-only heuristic would mis-classify
 * the column; logical extended type must win and never auto-JSON.parse / stringify.
 */
function registerLooksLikeJsonWithCodec() {
  definePropertyType({
    name: 'pte_looks_json',
    storage: {
      sqlite: {
        fieldType: 'TEXT /* not-really-json */',
        toDB(value) {
          if (value === null || value === undefined) return value
          // Deliberately non-JSON wire form so mistaken JSON.parse would fail or corrupt.
          return `WRAP:${String(value)}`
        },
        fromDB(value) {
          if (value === null || value === undefined) return value
          if (typeof value !== 'string' || !value.startsWith('WRAP:')) {
            throw new Error(`pte_looks_json fromDB bad payload: ${String(value)}`)
          }
          return value.slice('WRAP:'.length)
        },
      },
    },
  })
}

async function openHandle(entities: ReturnType<typeof Entity.create>[]) {
  const db = new SQLiteDB(':memory:')
  await db.open()
  const setup = new DBSetup(entities, [], db)
  await setup.createTables()
  const handle = new EntityQueryHandle(
    new EntityToTableMap(setup.map, setup.aliasManager),
    db,
  )
  return { db, handle, setup }
}

/** Physical column name for a value attribute (may differ from logical property name). */
function physicalField(
  setup: DBSetup,
  recordName: string,
  propertyName: string,
): string {
  const attr = setup.map.records[recordName].attributes[propertyName] as {
    field?: string
  }
  if (!attr?.field) {
    throw new Error(`no physical field for ${recordName}.${propertyName}`)
  }
  return attr.field
}

describe('property type extension — codec round-trip (P-mock)', () => {
  test('create/find round-trips number[] through toDB/fromDB', async () => {
    registerPteVectorWithCodec()
    const Doc = Entity.create({
      name: 'PteCodecDoc',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 4 },
        }),
      ],
    })
    const { db, handle, setup } = await openHandle([Doc])
    try {
      const created = await handle.create('PteCodecDoc', {
        title: 'a',
        embedding: [0.1, 0.2, 0.3, 0.4],
      })
      const found = await handle.findOne(
        'PteCodecDoc',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        ['*'],
      )
      expect(found.title).toBe('a')
      expect(found.embedding).toEqual([0.1, 0.2, 0.3, 0.4])

      // Physical wire form is the codec string, not a JSON array blob.
      const col = physicalField(setup, 'PteCodecDoc', 'embedding')
      const idCol = physicalField(setup, 'PteCodecDoc', 'id')
      const raw = await db.query(
        `SELECT "${col}" AS e FROM "PteCodecDoc" WHERE "${idCol}" = ?`,
        [created.id],
      ) as Array<{ e: unknown }>
      expect(raw[0].e).toBe('v:0.1,0.2,0.3,0.4')
    } finally {
      await db.close()
    }
  })

  test('update path also applies toDB; find applies fromDB', async () => {
    registerPteVectorWithCodec()
    const Doc = Entity.create({
      name: 'PteCodecUp',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 3 },
        }),
      ],
    })
    const { db, handle, setup } = await openHandle([Doc])
    try {
      const created = await handle.create('PteCodecUp', {
        embedding: [1, 2, 3],
      })
      await handle.update(
        'PteCodecUp',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        { embedding: [4, 5, 6] },
      )
      const found = await handle.findOne(
        'PteCodecUp',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        ['*'],
      )
      expect(found.embedding).toEqual([4, 5, 6])
      const col = physicalField(setup, 'PteCodecUp', 'embedding')
      const idCol = physicalField(setup, 'PteCodecUp', 'id')
      const raw = await db.query(
        `SELECT "${col}" AS e FROM "PteCodecUp" WHERE "${idCol}" = ?`,
        [created.id],
      ) as Array<{ e: unknown }>
      expect(raw[0].e).toBe('v:4,5,6')
    } finally {
      await db.close()
    }
  })

  test('toDB receives args (dimensions) and rejects wrong length', async () => {
    registerPteVectorWithCodec()
    const Doc = Entity.create({
      name: 'PteCodecArgs',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await expect(
        handle.create('PteCodecArgs', { embedding: [1, 2, 3] }),
      ).rejects.toThrow(/dimensions mismatch: expected 2, got 3/)
    } finally {
      await db.close()
    }
  })

  /**
   * Same-row merged relation property: 1:1 link merged onto the source entity table.
   * Nested create writes the relation value column through the parent INSERT, so
   * prepareFieldValue is invoked with the *entity* recordName while the logical
   * attribute lives on the relation record. args must still reach toDB.
   */
  test('merged 1:1 relation property create passes args into toDB', async () => {
    registerPteVectorWithCodec()
    const Left = Entity.create({
      name: 'PteMergeLeft',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Right = Entity.create({
      name: 'PteMergeRight',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Link = Relation.create({
      name: 'PteMergeLink',
      source: Left,
      sourceProperty: 'right',
      target: Right,
      targetProperty: 'left',
      type: '1:1',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
      ],
    })
    const db = new SQLiteDB(':memory:')
    await db.open()
    try {
      const setup = new DBSetup([Left, Right], [Link], db)
      await setup.createTables()
      const handle = new EntityQueryHandle(
        new EntityToTableMap(setup.map, setup.aliasManager),
        db,
      )
      const created = await handle.create('PteMergeLeft', {
        title: 'L',
        right: {
          title: 'R',
          '&': { embedding: [1, 2] },
        },
      })
      const found = await handle.findOne(
        'PteMergeLeft',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        [
          '*',
          [
            'right',
            {
              attributeQuery: [
                '*',
                ['&', { attributeQuery: ['*'] }],
              ],
            },
          ],
        ],
      )
      expect(found.right['&'].embedding).toEqual([1, 2])
      const relAttr = setup.map.records.PteMergeLink.attributes.embedding as {
        field: string
        args?: object
      }
      expect(relAttr.args).toEqual({ dimensions: 2 })
      const raw = await db.query(
        `SELECT "${relAttr.field}" AS e FROM "${setup.map.records.PteMergeLeft.table}"`,
      ) as Array<{ e: unknown }>
      expect(raw.some((row) => row.e === 'v:1,2')).toBe(true)
    } finally {
      await db.close()
    }
  })

  /**
   * Same merged topology on update: relation value columns still ride the parent entity
   * UPDATE SQL, so FieldAndValue.args must reach prepareFieldValue there too.
   */
  test('merged 1:1 relation property update passes args into toDB', async () => {
    registerPteVectorWithCodec()
    const Left = Entity.create({
      name: 'PteMergeUpLeft',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Right = Entity.create({
      name: 'PteMergeUpRight',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Link = Relation.create({
      name: 'PteMergeUpLink',
      source: Left,
      sourceProperty: 'right',
      target: Right,
      targetProperty: 'left',
      type: '1:1',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
      ],
    })
    const db = new SQLiteDB(':memory:')
    await db.open()
    try {
      const setup = new DBSetup([Left, Right], [Link], db)
      await setup.createTables()
      const handle = new EntityQueryHandle(
        new EntityToTableMap(setup.map, setup.aliasManager),
        db,
      )
      const created = await handle.create('PteMergeUpLeft', {
        title: 'L',
        right: {
          title: 'R',
          '&': { embedding: [1, 2] },
        },
      })
      await handle.update(
        'PteMergeUpLeft',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        {
          right: {
            id: created.right.id,
            '&': { embedding: [9, 8] },
          },
        },
      )
      const found = await handle.findOne(
        'PteMergeUpLeft',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        [
          '*',
          [
            'right',
            {
              attributeQuery: [
                '*',
                ['&', { attributeQuery: ['*'] }],
              ],
            },
          ],
        ],
      )
      expect(found.right['&'].embedding).toEqual([9, 8])
      const relAttr = setup.map.records.PteMergeUpLink.attributes.embedding as {
        field: string
      }
      const idField = (
        setup.map.records.PteMergeUpLeft.attributes.id as { field: string }
      ).field
      const raw = await db.query(
        `SELECT "${relAttr.field}" AS e FROM "${setup.map.records.PteMergeUpLeft.table}" WHERE "${idField}" = ?`,
        [created.id],
      ) as Array<{ e: unknown }>
      expect(raw[0]?.e).toBe('v:9,8')
    } finally {
      await db.close()
    }
  })
})

describe('property type extension — opaque (no codec)', () => {
  test('string values round-trip without transformation', async () => {
    registerOpaqueToken()
    const Item = Entity.create({
      name: 'PteOpaque',
      properties: [
        Property.create({ name: 'token', type: 'pte_opaque_token' }),
      ],
    })
    const { db, handle, setup } = await openHandle([Item])
    try {
      const created = await handle.create('PteOpaque', { token: 'raw-token-42' })
      const found = await handle.findOne(
        'PteOpaque',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        ['*'],
      )
      expect(found.token).toBe('raw-token-42')
      const col = physicalField(setup, 'PteOpaque', 'token')
      const idCol = physicalField(setup, 'PteOpaque', 'id')
      const raw = await db.query(
        `SELECT "${col}" AS t FROM "PteOpaque" WHERE "${idCol}" = ?`,
        [created.id],
      ) as Array<{ t: unknown }>
      expect(raw[0].t).toBe('raw-token-42')
    } finally {
      await db.close()
    }
  })
})

describe('property type extension — no builtin json/timestamp hijack', () => {
  test('extended column whose fieldType mentions json still uses codec, not JSON.parse', async () => {
    registerLooksLikeJsonWithCodec()
    const Row = Entity.create({
      name: 'PteLooksJson',
      properties: [
        Property.create({ name: 'payload', type: 'pte_looks_json' }),
      ],
    })
    const { db, handle, setup } = await openHandle([Row])
    try {
      const created = await handle.create('PteLooksJson', { payload: 'plain' })
      const found = await handle.findOne(
        'PteLooksJson',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        ['*'],
      )
      // fromDB strips WRAP: — must not JSON.parse the wire form.
      expect(found.payload).toBe('plain')
      const col = physicalField(setup, 'PteLooksJson', 'payload')
      const idCol = physicalField(setup, 'PteLooksJson', 'id')
      const raw = await db.query(
        `SELECT "${col}" AS p FROM "PteLooksJson" WHERE "${idCol}" = ?`,
        [created.id],
      ) as Array<{ p: unknown }>
      expect(raw[0].p).toBe('WRAP:plain')
    } finally {
      await db.close()
    }
  })

  test('neighbor builtin object/json still round-trips via JSON on same entity', async () => {
    registerPteVectorWithCodec()
    const Doc = Entity.create({
      name: 'PteMixed',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
        Property.create({ name: 'meta', type: 'object' }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      const created = await handle.create('PteMixed', {
        embedding: [9, 8],
        meta: { a: 1, b: 'two' },
      })
      const found = await handle.findOne(
        'PteMixed',
        MatchExp.atom({ key: 'id', value: ['=', created.id] }),
        undefined,
        ['*'],
      )
      expect(found.embedding).toEqual([9, 8])
      expect(found.meta).toEqual({ a: 1, b: 'two' })
    } finally {
      await db.close()
    }
  })
})

describe('property type extension — half-wired codec still rejected', () => {
  test('toDB-only define fails and leaves no logical name', () => {
    expect(() =>
      definePropertyType({
        name: 'pte_half_codec',
        storage: {
          sqlite: {
            fieldType: 'TEXT',
            toDB: (v) => v,
          },
        },
      }),
    ).toThrow(/only one of toDB\/fromDB/)
    expect(isExtendedPropertyType('pte_half_codec')).toBe(false)
  })

  test('fromDB-only define fails and leaves no logical name', () => {
    expect(() =>
      definePropertyType({
        name: 'pte_half_from',
        storage: {
          sqlite: {
            fieldType: 'TEXT',
            fromDB: (v) => v,
          },
        },
      }),
    ).toThrow(/only one of toDB\/fromDB/)
    expect(isExtendedPropertyType('pte_half_from')).toBe(false)
  })
})

describe('property type extension — Dictionary path ignores extension codecs', () => {
  test('dict set/get remains JSON KV while Property codec is registered', async () => {
    registerPteVectorWithCodec()
    const Doc = Entity.create({
      name: 'PteDictNeighbor',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
      ],
    })
    const Flag = Dictionary.create({
      name: 'pteCodecFlag',
      type: 'object',
      defaultValue: () => ({ n: 0 }),
    })
    const system = new MonoSystem(new SQLiteDB(':memory:'))
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Doc],
      relations: [],
      dict: [Flag],
    })
    await controller.setup(true)

    await system.storage.dict.set('pteCodecFlag', { n: 7, tag: 'x' })
    expect(await system.storage.dict.get('pteCodecFlag')).toEqual({ n: 7, tag: 'x' })

    const created = await system.storage.create('PteDictNeighbor', {
      embedding: [1.5, 2.5],
    })
    const found = await system.storage.findOne(
      'PteDictNeighbor',
      MatchExp.atom({ key: 'id', value: ['=', created.id] }),
      undefined,
      ['*'],
    )
    expect(found.embedding).toEqual([1.5, 2.5])
  })
})
