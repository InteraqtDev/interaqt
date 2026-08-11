/**
 * M-03 — Property Match operator extension.
 *
 * - Registered operators compile and execute on Property columns (mock SQLite).
 * - Unregistered operators (including default `=`) fail at match compile time.
 * - Builtin json/timestamp match paths remain covered by driverDialectConsistency.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  Entity,
  EntityQueryHandle,
  EntityToTableMap,
  MatchExp,
  Property,
  definePropertyType,
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

/**
 * Mock vector on SQLite TEXT:
 * - wire form `v:1,2,3` (same as M-02 codec)
 * - match `~=` means "equal after toDB encoding" (explicit; `=` is NOT free)
 * - match `<#>` means "element count equals N" via LIKE on encoded prefix length (demo custom op)
 */
function registerPteVectorWithMatch(options: { withEquals?: boolean } = {}) {
  const { withEquals = true } = options
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
            throw new Error(`pte_vector expects number[]; got ${typeof value}`)
          }
          const dims = (ctx.args as { dimensions: number }).dimensions
          if (value.length !== dims) {
            throw new Error(
              `pte_vector dimensions mismatch: expected ${dims}, got ${value.length}`,
            )
          }
          return `v:${value.join(',')}`
        },
        fromDB(value) {
          if (value === null || value === undefined) return value
          if (typeof value !== 'string' || !value.startsWith('v:')) {
            throw new Error(`pte_vector fromDB expected "v:..." string; got ${typeof value}`)
          }
          return value
            .slice(2)
            .split(',')
            .filter((s) => s.length > 0)
            .map((s) => Number(s))
        },
        match: {
          ...(withEquals
            ? {
                // Explicit equality on the encoded wire form — not inherited automatically.
                '=': ({ value, p, resolveCtx }) => {
                  const raw = value[1]
                  let encoded: unknown = raw
                  if (Array.isArray(raw)) {
                    const dims = (resolveCtx.args as { dimensions: number } | undefined)?.dimensions
                    if (dims !== undefined && raw.length !== dims) {
                      throw new Error(
                        `pte_vector match "=" dimensions mismatch: expected ${dims}, got ${raw.length}`,
                      )
                    }
                    encoded = `v:${raw.join(',')}`
                  }
                  return { fieldValue: `= ${p()}`, fieldParams: [encoded] }
                },
              }
            : {}),
          // Custom operator: RHS is a number N; matches rows whose encoded vector has N elements.
          // Encoded form is "v:" + (n-1) commas for n numbers — use a simple length proxy via LIKE.
          // For the mock we encode equality of dimension count as LIKE 'v:%' with N-1 commas pattern
          // by binding the exact wire of a zero-filled vector of length N when N === declared dims,
          // otherwise a never-match sentinel. (Keeps SQL injection-safe via p().)
          '<#>': ({ value, p, resolveCtx }) => {
            const n = value[1]
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
              throw new Error(`pte_vector match "<#>" requires a non-negative integer RHS`)
            }
            const dims = (resolveCtx.args as { dimensions: number }).dimensions
            if (n !== dims) {
              // No row of this column can have a different element count under our toDB contract.
              return { fieldValue: `IS NOT NULL AND 1=0`, fieldParams: [] }
            }
            // Match any non-null encoded vector of the declared dimension (all stored rows).
            return { fieldValue: `IS NOT NULL AND ${p()} = ${p()}`, fieldParams: [1, 1] }
          },
        },
      },
    },
  })
}

function registerOpaqueNoMatch() {
  definePropertyType({
    name: 'pte_opaque_token',
    storage: {
      sqlite: {
        fieldType: 'TEXT',
        // no match table at all
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

describe('property type extension — Match operators (M-03)', () => {
  test('registered "=" compiles and finds by encoded vector equality', async () => {
    registerPteVectorWithMatch({ withEquals: true })
    const Doc = Entity.create({
      name: 'PteMatchDoc',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 3 },
        }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      const a = await handle.create('PteMatchDoc', {
        title: 'a',
        embedding: [1, 2, 3],
      })
      await handle.create('PteMatchDoc', {
        title: 'b',
        embedding: [4, 5, 6],
      })

      const found = await handle.find(
        'PteMatchDoc',
        MatchExp.atom({ key: 'embedding', value: ['=', [1, 2, 3]] }),
        undefined,
        ['title', 'embedding'],
      )
      expect(found).toHaveLength(1)
      expect(found[0].id).toBe(a.id)
      expect(found[0].title).toBe('a')
      expect(found[0].embedding).toEqual([1, 2, 3])
    } finally {
      await db.close()
    }
  })

  test('registered custom operator "<#>" executes via placeholder API', async () => {
    registerPteVectorWithMatch({ withEquals: true })
    const Doc = Entity.create({
      name: 'PteMatchDim',
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
      await handle.create('PteMatchDim', { embedding: [9, 8] })
      const hit = await handle.find(
        'PteMatchDim',
        MatchExp.atom({ key: 'embedding', value: ['<#>', 2] }),
        undefined,
        ['embedding'],
      )
      expect(hit).toHaveLength(1)
      expect(hit[0].embedding).toEqual([9, 8])

      const miss = await handle.find(
        'PteMatchDim',
        MatchExp.atom({ key: 'embedding', value: ['<#>', 3] }),
        undefined,
        ['embedding'],
      )
      expect(miss).toHaveLength(0)
    } finally {
      await db.close()
    }
  })

  test('unregistered default "=" fails at match compile time (not free)', async () => {
    registerPteVectorWithMatch({ withEquals: false })
    const Doc = Entity.create({
      name: 'PteMatchNoEq',
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
      await handle.create('PteMatchNoEq', { embedding: [1, 2] })
      await expect(
        handle.find(
          'PteMatchNoEq',
          MatchExp.atom({ key: 'embedding', value: ['=', [1, 2]] }),
          undefined,
          ['embedding'],
        ),
      ).rejects.toThrow(/does not support match operator "="/)
      // Error must name the type, location, and point at definePropertyType match registration.
      try {
        await handle.find(
          'PteMatchNoEq',
          MatchExp.atom({ key: 'embedding', value: ['=', [1, 2]] }),
          undefined,
          ['embedding'],
        )
        expect.unreachable('should have thrown')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        expect(msg).toMatch(/pte_vector/)
        expect(msg).toMatch(/PteMatchNoEq\.embedding/)
        expect(msg).toMatch(/definePropertyType/)
        expect(msg).toMatch(/having a column does not imply Match support/i)
        expect(msg).toMatch(/Registered operators/)
        expect(msg).toMatch(/<#>/)
      }
    } finally {
      await db.close()
    }
  })

  test('unregistered "in" fails at compile time on extended column', async () => {
    registerPteVectorWithMatch({ withEquals: true })
    const Doc = Entity.create({
      name: 'PteMatchNoIn',
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
      await handle.create('PteMatchNoIn', { embedding: [1, 2] })
      await expect(
        handle.find(
          'PteMatchNoIn',
          MatchExp.atom({ key: 'embedding', value: ['in', [[1, 2]]] }),
          undefined,
          ['embedding'],
        ),
      ).rejects.toThrow(/does not support match operator "in"/i)
    } finally {
      await db.close()
    }
  })

  test('opaque extended type with no match table rejects every operator', async () => {
    registerOpaqueNoMatch()
    const Doc = Entity.create({
      name: 'PteMatchOpaque',
      properties: [
        Property.create({ name: 'token', type: 'pte_opaque_token' }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await handle.create('PteMatchOpaque', { token: 'abc' })
      await expect(
        handle.find(
          'PteMatchOpaque',
          MatchExp.atom({ key: 'token', value: ['=', 'abc'] }),
          undefined,
          ['token'],
        ),
      ).rejects.toThrow(/pte_opaque_token/)
      await expect(
        handle.find(
          'PteMatchOpaque',
          MatchExp.atom({ key: 'token', value: ['=', 'abc'] }),
          undefined,
          ['token'],
        ),
      ).rejects.toThrow(/No match operators were registered/)
    } finally {
      await db.close()
    }
  })

  test('neighbor builtin string "=" still works beside extended columns', async () => {
    registerPteVectorWithMatch({ withEquals: true })
    const Doc = Entity.create({
      name: 'PteMatchNeighbor',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 2 },
        }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await handle.create('PteMatchNeighbor', {
        title: 'keep',
        embedding: [1, 1],
      })
      await handle.create('PteMatchNeighbor', {
        title: 'drop',
        embedding: [2, 2],
      })
      const found = await handle.find(
        'PteMatchNeighbor',
        MatchExp.atom({ key: 'title', value: ['=', 'keep'] }),
        undefined,
        ['title', 'embedding'],
      )
      expect(found).toHaveLength(1)
      expect(found[0].title).toBe('keep')
      expect(found[0].embedding).toEqual([1, 1])
    } finally {
      await db.close()
    }
  })


  test('D3: match compiler receives resolveCtx.collection for collection:true columns', async () => {
    let seenCollection: boolean | undefined
    definePropertyType({
      name: 'pte_coll_tok',
      storage: {
        sqlite: {
          // Explicit function fieldType: string fieldType + collection:true is rejected at setup.
          fieldType: ({ collection }) => {
            if (!collection) {
              throw new Error('pte_coll_tok expects collection:true')
            }
            return 'TEXT'
          },
          toDB: (v, ctx) => {
            if (ctx.collection !== true) {
              throw new Error('pte_coll_tok toDB expected collection:true')
            }
            if (v === null || v === undefined) return v
            if (!Array.isArray(v)) {
              throw new Error(`pte_coll_tok expects string[]; got ${typeof v}`)
            }
            return `c:${(v as string[]).join('|')}`
          },
          fromDB: (v) => {
            if (v === null || v === undefined) return v
            if (typeof v !== 'string' || !v.startsWith('c:')) return v
            const body = v.slice(2)
            return body.length === 0 ? [] : body.split('|')
          },
          match: {
            '=': ({ value, p, resolveCtx }) => {
              seenCollection = resolveCtx.collection
              if (resolveCtx.collection !== true) {
                throw new Error(
                  `pte_coll_tok match "=" expected resolveCtx.collection === true; got ${String(resolveCtx.collection)}`,
                )
              }
              const raw = value[1]
              const encoded = Array.isArray(raw)
                ? `c:${(raw as string[]).join('|')}`
                : raw
              return { fieldValue: `= ${p()}`, fieldParams: [encoded] }
            },
          },
        },
      },
    })
    const Doc = Entity.create({
      name: 'PteMatchColl',
      properties: [
        Property.create({
          name: 'tags',
          type: 'pte_coll_tok',
          collection: true,
        }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await handle.create('PteMatchColl', { tags: ['a', 'b'] })
      await handle.create('PteMatchColl', { tags: ['x'] })
      const found = await handle.find(
        'PteMatchColl',
        MatchExp.atom({ key: 'tags', value: ['=', ['a', 'b']] }),
        undefined,
        ['tags'],
      )
      expect(seenCollection).toBe(true)
      expect(found).toHaveLength(1)
      expect(found[0].tags).toEqual(['a', 'b'])
    } finally {
      await db.close()
    }
  })

  test('match compiler receives resolveCtx.args (dimensions)', async () => {
    let seenDims: number | undefined
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
          fieldType: 'TEXT',
          toDB: (v) => (Array.isArray(v) ? `v:${v.join(',')}` : v),
          fromDB: (v) => {
            if (typeof v !== 'string' || !v.startsWith('v:')) return v
            return v.slice(2).split(',').map(Number)
          },
          match: {
            '=': ({ value, p, resolveCtx }) => {
              seenDims = (resolveCtx.args as { dimensions?: number } | undefined)?.dimensions
              const raw = value[1]
              const encoded = Array.isArray(raw) ? `v:${raw.join(',')}` : raw
              return { fieldValue: `= ${p()}`, fieldParams: [encoded] }
            },
          },
        },
      },
    })
    const Doc = Entity.create({
      name: 'PteMatchArgs',
      properties: [
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 4 },
        }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await handle.create('PteMatchArgs', { embedding: [1, 2, 3, 4] })
      await handle.find(
        'PteMatchArgs',
        MatchExp.atom({ key: 'embedding', value: ['=', [1, 2, 3, 4]] }),
        undefined,
        ['embedding'],
      )
      expect(seenDims).toBe(4)
    } finally {
      await db.close()
    }
  })

  test('D4: registered contains on non-collection extended type reaches match compiler', async () => {
    let hit = false
    definePropertyType({
      name: 'pte_substr',
      storage: {
        sqlite: {
          fieldType: 'TEXT',
          toDB: (v) => (v === null || v === undefined ? v : String(v)),
          fromDB: (v) => v,
          match: {
            // Extension-owned operator name "contains" (substring). Must not be blocked by the
            // builtin JSON-collection gate that only applies to non-extended types.
            contains: ({ value, p, resolveCtx }) => {
              hit = true
              expect(resolveCtx.collection).toBeUndefined()
              return { fieldValue: `LIKE ${p()}`, fieldParams: [`%${value[1]}%`] }
            },
          },
        },
      },
    })
    const Doc = Entity.create({
      name: 'PteMatchSubstr',
      properties: [
        Property.create({ name: 'tok', type: 'pte_substr' }),
      ],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await handle.create('PteMatchSubstr', { tok: 'hello-world' })
      const found = await handle.find(
        'PteMatchSubstr',
        MatchExp.atom({ key: 'tok', value: ['contains', 'world'] }),
        undefined,
        ['tok'],
      )
      expect(hit).toBe(true)
      expect(found).toHaveLength(1)
      expect(found[0].tok).toBe('hello-world')
    } finally {
      await db.close()
    }
  })

  test('D4b: unregistered contains on non-collection extended uses extension error, not collection gate', async () => {
    // Completion condition from D4: when contains is NOT registered, the failure must come from
    // applyExtendedPropertyTypeMatch (definePropertyType / registered operators), not the builtin
    // "requires a collection property" precheck. Registered path alone is not enough to pin this.
    definePropertyType({
      name: 'pte_no_contains',
      storage: {
        sqlite: {
          fieldType: 'TEXT',
          match: {
            '=': ({ value, p }) => ({ fieldValue: `= ${p()}`, fieldParams: [value[1]] }),
          },
        },
      },
    })
    const Doc = Entity.create({
      name: 'PteMatchNoContains',
      properties: [Property.create({ name: 'tok', type: 'pte_no_contains' })],
    })
    const { db, handle } = await openHandle([Doc])
    try {
      await handle.create('PteMatchNoContains', { tok: 'hello' })
      try {
        await handle.find(
          'PteMatchNoContains',
          MatchExp.atom({ key: 'tok', value: ['contains', 'he'] }),
          undefined,
          ['tok'],
        )
        expect.unreachable('should have thrown')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        expect(msg).not.toMatch(/requires a collection property/i)
        expect(msg).toMatch(/does not support match operator "contains"/i)
        expect(msg).toMatch(/pte_no_contains/)
        expect(msg).toMatch(/PteMatchNoContains\.tok/)
        expect(msg).toMatch(/definePropertyType/)
      }
    } finally {
      await db.close()
    }
  })

})
