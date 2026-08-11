/**
 * M-01 — logical property-type registry and create gates.
 *
 * Property: builtins ∪ definePropertyType extensions (+ args / validateArgs).
 * Dictionary: builtins only; extended names rejected with Decision A wording.
 * Drivers: mapToDBFieldType unknown → throw; json strings pinned to production values.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  ALLOWED_PROPERTY_TYPES,
  Dictionary,
  Property,
  definePropertyType,
  resetPropertyTypeRegistryForTests,
} from 'interaqt'
import { MysqlDB, PGLiteDB, PostgreSQLDB, SQLiteDB } from '@drivers'

beforeEach(() => {
  resetPropertyTypeRegistryForTests()
})

afterEach(() => {
  resetPropertyTypeRegistryForTests()
})

describe('property type extension — Property.create', () => {
  test('rejects unregistered type and points at definePropertyType', () => {
    expect(() => Property.create({ name: 'embedding', type: 'vector' })).toThrow(
      /unsupported type "vector"[\s\S]*definePropertyType/
    )
  })

  test('accepts extended type after definePropertyType', () => {
    definePropertyType({
      name: 'pte_vector',
      validateArgs(args) {
        const d = (args as { dimensions?: unknown } | undefined)?.dimensions
        if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
          throw new Error(`type "pte_vector" requires args.dimensions as a positive integer`)
        }
      },
    })
    const prop = Property.create({
      name: 'embedding',
      type: 'pte_vector',
      args: { dimensions: 8 },
    })
    expect(prop.type).toBe('pte_vector')
    expect(prop.args).toEqual({ dimensions: 8 })
  })

  test('validateArgs rejects bad args at Property.create', () => {
    definePropertyType({
      name: 'pte_vector',
      validateArgs(args) {
        const d = (args as { dimensions?: unknown } | undefined)?.dimensions
        if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
          throw new Error(`type "pte_vector" requires args.dimensions as a positive integer`)
        }
      },
    })
    expect(() =>
      Property.create({ name: 'embedding', type: 'pte_vector', args: { dimensions: 0 } })
    ).toThrow(/positive integer/)
    expect(() =>
      Property.create({ name: 'embedding', type: 'pte_vector' })
    ).toThrow(/positive integer/)
  })

  test('builtin type rejects args', () => {
    expect(() =>
      Property.create({ name: 'title', type: 'string', args: { weird: true } })
    ).toThrow(/builtin type "string" with args/)
  })

  test('duplicate definePropertyType is rejected', () => {
    definePropertyType({ name: 'pte_once' })
    expect(() => definePropertyType({ name: 'pte_once' })).toThrow(/already registered/)
  })

  test('cannot register builtin or pk', () => {
    expect(() => definePropertyType({ name: 'string' })).toThrow(/collides with a builtin/)
    expect(() => definePropertyType({ name: 'pk' })).toThrow(/reserved/)
  })

  test('Property.clone preserves args', () => {
    definePropertyType({ name: 'pte_tag' })
    const prop = Property.create({ name: 'tag', type: 'pte_tag', args: { n: 1 } })
    const cloned = Property.clone(prop, false)
    expect(cloned.args).toEqual({ n: 1 })
    expect(cloned.type).toBe('pte_tag')
  })
})

describe('property type extension — Dictionary.create (Decision A)', () => {
  test('rejects extended type even after definePropertyType', () => {
    definePropertyType({
      name: 'pte_vector',
      storage: {
        postgres: { fieldType: 'vector(3)' },
      },
    })
    expect(() =>
      Dictionary.create({ name: 'embedding', type: 'pte_vector', args: { dimensions: 3 } })
    ).toThrow(
      /cannot use extended property type "pte_vector"[\s\S]*only to Entity\/Relation Property[\s\S]*_Dictionary_/
    )
  })

  test('rejects unknown non-extended type with builtin list only', () => {
    expect(() => Dictionary.create({ name: 'x', type: 'not_a_type' })).toThrow(
      /unsupported type "not_a_type"[\s\S]*Allowed Dictionary types/
    )
    expect(() => Dictionary.create({ name: 'x', type: 'not_a_type' })).not.toThrow(
      /definePropertyType/
    )
  })

  test('builtin Dictionary still works; args on builtin rejected', () => {
    const d = Dictionary.create({ name: 'flag', type: 'boolean' })
    expect(d.type).toBe('boolean')
    expect(() =>
      Dictionary.create({ name: 'flag2', type: 'string', args: { a: 1 } })
    ).toThrow(/builtin type "string" with args/)
  })

  test('builtins list unchanged for allowed Dictionary types', () => {
    for (const t of ALLOWED_PROPERTY_TYPES) {
      expect(() => Dictionary.create({ name: `d_${t}`, type: t })).not.toThrow()
    }
  })
})

describe('property type extension — driver mapToDBFieldType fallback removed', () => {
  const drivers = [
    ['SQLite', new SQLiteDB()],
    ['PGLite', new PGLiteDB()],
    ['PostgreSQL', new PostgreSQLDB('unused_pte_fallback')],
    ['MySQL', new MysqlDB('unused_pte_fallback')],
  ] as const

  test.each(drivers)('%s throws on unknown type (no pass-through)', (_name, db) => {
    expect(() => db.mapToDBFieldType('vector')).toThrow(/unknown type "vector"[\s\S]*definePropertyType/)
    expect(() => db.mapToDBFieldType('pte_vector')).toThrow(/unknown type/)
  })

  test('json fieldType strings stay at production values', () => {
    expect(new SQLiteDB().mapToDBFieldType('json')).toBe('JSON')
    expect(new SQLiteDB().mapToDBFieldType('object')).toBe('JSON')
    expect(new PGLiteDB().mapToDBFieldType('json')).toBe('json')
    expect(new PGLiteDB().mapToDBFieldType('object')).toBe('JSON')
    expect(new PostgreSQLDB('unused_pte_json').mapToDBFieldType('json')).toBe('json')
    expect(new PostgreSQLDB('unused_pte_json').mapToDBFieldType('object')).toBe('JSON')
    expect(new MysqlDB('unused_pte_json').mapToDBFieldType('json')).toBe('json')
    expect(new MysqlDB('unused_pte_json').mapToDBFieldType('object')).toBe('JSON')
  })
})
