/**
 * M-01 — Setup binding: definePropertyType → Property column fieldType / fail-fast.
 *
 * Positive: sqlite storage with TEXT fieldType builds schema and preserves args on ValueAttribute.
 * Negative: postgres-only storage on SQLite setup fails with type, location, dialect, action hints.
 * Dictionary topology unchanged (no column resolve for Dictionary declarations).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  Controller,
  Dictionary,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  definePropertyType,
  getPropertyTypeStorageMap,
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

function registerPteVectorSqlite() {
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
        fieldType: ({ args }) => `TEXT /* pte_vector(${(args as { dimensions: number }).dimensions}) */`,
      },
    },
  })
}

describe('property type extension — Setup bind (Property columns)', () => {
  test('resolves fieldType and copies args onto ValueAttribute (DBSetup map)', async () => {
    registerPteVectorSqlite()
    const Doc = Entity.create({
      name: 'PteDoc',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 4 },
        }),
      ],
    })

    const db = new SQLiteDB(':memory:')
    await db.open()
    const setup = new DBSetup([Doc], [], db)
    const emb = setup.map.records.PteDoc.attributes.embedding as {
      type: string
      fieldType?: string
      args?: object
      field?: string
    }
    expect(emb.type).toBe('pte_vector')
    expect(emb.args).toEqual({ dimensions: 4 })
    expect(emb.fieldType).toContain('pte_vector(4)')
    expect(emb.field).toBeDefined()

    // createTables must succeed with the resolved DDL fragment
    await setup.createTables()
    await db.close()
  })

  test('controller.setup succeeds with extended Property on SQLite', async () => {
    registerPteVectorSqlite()
    const Doc = Entity.create({
      name: 'PteDoc2',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 3 },
        }),
      ],
    })
    const system = new MonoSystem(new SQLiteDB(':memory:'))
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Doc],
      relations: [],
    })
    await controller.setup(true)
    const attr = (system.storage as { map: { records: Record<string, { attributes: Record<string, unknown> }> } })
      .map.records.PteDoc2.attributes.embedding as {
      type: string
      fieldType?: string
      args?: object
    }
    expect(attr.type).toBe('pte_vector')
    expect(attr.args).toEqual({ dimensions: 3 })
    expect(attr.fieldType).toContain('pte_vector(3)')
  })

  test('P-neg-storage: missing dialect storage fails with actionable error', async () => {
    definePropertyType({
      name: 'pte_vector',
      validateArgs(args) {
        const d = (args as { dimensions?: unknown } | undefined)?.dimensions
        if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
          throw new Error(`bad dims`)
        }
      },
      storage: {
        // only postgres — SQLite setup must fail
        postgres: {
          fieldType: ({ args }) => `vector(${(args as { dimensions: number }).dimensions})`,
        },
      },
    })
    const Doc = Entity.create({
      name: 'PteDocNeg',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 8 },
        }),
      ],
    })

    expect(() => new DBSetup([Doc], [], new SQLiteDB(':memory:'))).toThrow(
      /pte_vector[\s\S]*PteDocNeg\.embedding[\s\S]*dialect "sqlite"[\s\S]*Register storage\.sqlite|switch to a driver/
    )
  })

  test('half-wired toDB/fromDB rejected at definePropertyType', () => {
    expect(() =>
      definePropertyType({
        name: 'pte_half',
        storage: {
          sqlite: {
            fieldType: 'TEXT',
            toDB: (v) => v,
            // missing fromDB
          },
        },
      })
    ).toThrow(/only one of toDB\/fromDB/)
  })

  test('D1: failed define leaves no logical/physical residue; same name retries', async () => {
    // Half-wired codec — must throw and leave registries empty.
    expect(() =>
      definePropertyType({
        name: 'pte_half_atom',
        storage: {
          sqlite: {
            fieldType: 'TEXT',
            toDB: (v) => v,
            // missing fromDB
          },
        },
      })
    ).toThrow(/only one of toDB\/fromDB/)
    expect(isExtendedPropertyType('pte_half_atom')).toBe(false)
    expect(getPropertyTypeStorageMap('pte_half_atom')).toBeUndefined()
    expect(() => Property.create({ name: 'x', type: 'pte_half_atom' })).toThrow(
      /unsupported type "pte_half_atom"/
    )

    // Empty fieldType — same all-or-nothing contract.
    expect(() =>
      definePropertyType({
        name: 'pte_empty_ft',
        storage: {
          sqlite: {
            fieldType: '',
          },
        },
      })
    ).toThrow(/non-empty fieldType/)
    expect(isExtendedPropertyType('pte_empty_ft')).toBe(false)
    expect(getPropertyTypeStorageMap('pte_empty_ft')).toBeUndefined()

    // Immediate retry with a complete definition must succeed (no "already registered").
    definePropertyType({
      name: 'pte_half_atom',
      storage: {
        sqlite: { fieldType: 'TEXT' },
      },
    })
    expect(isExtendedPropertyType('pte_half_atom')).toBe(true)
    expect(getPropertyTypeStorageMap('pte_half_atom')?.sqlite?.fieldType).toBe('TEXT')

    const prop = Property.create({ name: 'payload', type: 'pte_half_atom' })
    expect(prop.type).toBe('pte_half_atom')

    const Doc = Entity.create({
      name: 'PteAtomDoc',
      properties: [Property.create({ name: 'payload', type: 'pte_half_atom' })],
    })
    const db = new SQLiteDB(':memory:')
    await db.open()
    const setup = new DBSetup([Doc], [], db)
    const attr = setup.map.records.PteAtomDoc.attributes.payload as {
      type: string
      fieldType?: string
    }
    expect(attr.type).toBe('pte_half_atom')
    expect(attr.fieldType).toBe('TEXT')
    await setup.createTables()
    await db.close()
  })
})

describe('property type extension — Dictionary path unchanged', () => {
  test('Dictionary declarations do not require or use extension storage', async () => {
    // Extended type registered with sqlite storage — still cannot be a Dictionary type.
    registerPteVectorSqlite()
    expect(() =>
      Dictionary.create({ name: 'cfg', type: 'pte_vector', args: { dimensions: 2 } })
    ).toThrow(/only to Entity\/Relation Property/)

    // Builtin Dictionary + extended Property entity setup still works; _Dictionary_ is framework-managed.
    const Item = Entity.create({
      name: 'PteItem',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
      ],
    })
    const Flag = Dictionary.create({ name: 'pteFlag', type: 'boolean', defaultValue: () => false })
    const system = new MonoSystem(new SQLiteDB(':memory:'))
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      dict: [Flag],
    })
    await controller.setup(true)
    await system.storage.dict.set('pteFlag', true)
    expect(await system.storage.dict.get('pteFlag')).toBe(true)
  })
})
