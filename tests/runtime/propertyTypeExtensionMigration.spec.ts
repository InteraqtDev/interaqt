/**
 * M-04 — Migration signatures for extended Property types (and Dictionary logical args).
 *
 * Contracts (design §3.8 / M-04):
 * - property manifest logical signature includes type + args (args only when present)
 * - property args or fieldType changes are detected (not silent drift)
 * - dictionary logical type (and args when present) changes are detected;
 *   Dictionary does NOT gain plugin fieldType
 * - same name + same contract → no spurious property/dictionary changed
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  Controller,
  Dictionary,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
  clearAllInstances,
  createMigrationManifest,
  definePropertyType,
  readMigrationManifest,
  resetPropertyTypeRegistryForTests,
} from 'interaqt'
import { PGLiteDB, SQLiteDB } from '@drivers'

beforeEach(() => {
  resetPropertyTypeRegistryForTests()
  clearAllInstances(Entity, Property, Dictionary, Relation)
})

afterEach(() => {
  resetPropertyTypeRegistryForTests()
  clearAllInstances(Entity, Property, Dictionary, Relation)
})

function registerPteVector(dialects: Array<'sqlite' | 'postgres'> = ['sqlite', 'postgres']) {
  const storage: Record<string, { fieldType: (ctx: { args?: object }) => string }> = {}
  for (const d of dialects) {
    storage[d] = {
      fieldType: ({ args }) => {
        const dims = (args as { dimensions: number }).dimensions
        return `TEXT /* pte_vector(${dims}) */`
      },
    }
  }
  definePropertyType({
    name: 'pte_vector',
    validateArgs(args) {
      const d = (args as { dimensions?: unknown } | undefined)?.dimensions
      if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
        throw new Error(`type "pte_vector" requires args.dimensions as a positive integer`)
      }
    },
    storage: storage as any,
  })
}

async function setupController(opts: {
  entities: Entity[]
  dict?: Dictionary[]
  db?: 'sqlite' | 'pglite'
}) {
  const db = opts.db === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
  const system = new MonoSystem(db)
  system.conceptClass = KlassByName
  const controller = new Controller({
    system,
    entities: opts.entities,
    relations: [],
    dict: opts.dict ?? [],
  })
  await controller.setup(true)
  return { controller, db, system }
}

describe('property type extension — migration signatures (M-04)', () => {
  test('property manifest includes type + args; same contract is hash-stable and change-free', async () => {
    registerPteVector()
    const DocV1 = Entity.create({
      name: 'PteMigDoc',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({
          name: 'embedding',
          type: 'pte_vector',
          args: { dimensions: 4 },
        }),
      ],
    })
    const { controller, db } = await setupController({ entities: [DocV1] })
    const m1 = createMigrationManifest(controller)

    const emb = m1.records
      .find(r => r.name === 'PteMigDoc')!
      .properties.find(p => p.name === 'embedding')!
    expect(emb.type).toBe('pte_vector')
    expect(emb.args).toEqual({ dimensions: 4 })
    // builtins omit args key
    const title = m1.records
      .find(r => r.name === 'PteMigDoc')!
      .properties.find(p => p.name === 'title')!
    expect(title).not.toHaveProperty('args')

    // storage physical side carries resolved fieldType for the column
    const storageAttr = m1.storage.records
      .find(r => r.recordName === 'PteMigDoc')!
      .attributeDetails!.find(a => a.name === 'embedding')
    expect(storageAttr?.type).toBe('pte_vector')
    expect(storageAttr?.fieldType).toContain('pte_vector(4)')

    // Rebuild an identical declaration (fresh Klass instances, fixed uuids for identity)
    clearAllInstances(Entity, Property, Dictionary)
    const DocV1Again = new Entity({
      name: 'PteMigDoc',
      properties: [
        new Property({ name: 'title', type: 'string' }, { uuid: title.identity.uuid }),
        new Property(
          { name: 'embedding', type: 'pte_vector', args: { dimensions: 4 } },
          { uuid: emb.identity.uuid },
        ),
      ],
    }, { uuid: m1.records.find(r => r.name === 'PteMigDoc')!.identity.uuid })

    const system2 = new MonoSystem(new SQLiteDB(':memory:'))
    system2.conceptClass = KlassByName
    const controller2 = new Controller({
      system: system2,
      entities: [DocV1Again],
      relations: [],
    })
    // Manifest without installing tables — pass previous storage schema so physical side matches
    const m2 = createMigrationManifest(controller2, m1.storage)
    expect(m2.modelHash).toBe(m1.modelHash)
    expect(m2.records.find(r => r.name === 'PteMigDoc')!.properties.find(p => p.name === 'embedding')!.args)
      .toEqual({ dimensions: 4 })

    await db.close()
  })

  test('property args change is detected as property changed (even when fieldType also changes)', async () => {
    registerPteVector()
    const DocV1 = new Entity({
      name: 'PteMigArgsDoc',
      properties: [
        new Property({ name: 'title', type: 'string' }, { uuid: 'pte-mig-args-title' }),
        new Property(
          { name: 'embedding', type: 'pte_vector', args: { dimensions: 4 } },
          { uuid: 'pte-mig-args-embedding' },
        ),
      ],
    }, { uuid: 'pte-mig-args-doc' })

    const { controller: c1, db } = await setupController({ entities: [DocV1] })
    const baseline = await readMigrationManifest(c1)
    expect(baseline?.modelHash).toBeTruthy()

    clearAllInstances(Entity, Property, Dictionary)
    // Keep registry (do not resetPropertyTypeRegistry) — only clear Klass instances
    const DocV2 = new Entity({
      name: 'PteMigArgsDoc',
      properties: [
        new Property({ name: 'title', type: 'string' }, { uuid: 'pte-mig-args-title' }),
        new Property(
          { name: 'embedding', type: 'pte_vector', args: { dimensions: 8 } },
          { uuid: 'pte-mig-args-embedding' },
        ),
      ],
    }, { uuid: 'pte-mig-args-doc' })

    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const c2 = new Controller({ system: system2, entities: [DocV2], relations: [] })
    const diff = await c2.generateMigrationDiff()

    const propChange = diff.changes.find(
      ch => ch.kind === 'property' && ch.dataContext === 'property:PteMigArgsDoc.embedding' && ch.changeType === 'changed',
    )
    expect(propChange).toBeTruthy()
    expect(propChange!.reason).toMatch(/args/)

    // Physical fieldType change must also surface as storage blocking (not silent DDL drift)
    const blocking = diff.safety.blockingChanges
      .map(b => `${b.kind}:${b.logicalPath}:${b.reason}`)
      .join('\n')
    expect(blocking).toMatch(/PteMigArgsDoc\.embedding/)
    expect(blocking).toMatch(/field type|type, field type/i)

    await db.close()
  })

  test('property args change is detected even if fieldType string stays identical', async () => {
    // Storage that ignores args for DDL — still must report logical property changed.
    definePropertyType({
      name: 'pte_opaque_token',
      validateArgs(args) {
        if (!(args as { version?: unknown } | undefined)?.version) {
          throw new Error('pte_opaque_token requires args.version')
        }
      },
      storage: {
        sqlite: { fieldType: 'TEXT' },
        postgres: { fieldType: 'TEXT' },
      },
    })

    const TokV1 = new Entity({
      name: 'PteMigTok',
      properties: [
        new Property(
          { name: 'token', type: 'pte_opaque_token', args: { version: 1 } },
          { uuid: 'pte-mig-tok-token' },
        ),
      ],
    }, { uuid: 'pte-mig-tok' })

    const { controller: c1, db } = await setupController({ entities: [TokV1] })
    const m1 = createMigrationManifest(c1)
    const attr1 = m1.storage.records.find(r => r.recordName === 'PteMigTok')!
      .attributeDetails!.find(a => a.name === 'token')!
    expect(attr1.fieldType).toBe('TEXT')

    clearAllInstances(Entity, Property, Dictionary)
    const TokV2 = new Entity({
      name: 'PteMigTok',
      properties: [
        new Property(
          { name: 'token', type: 'pte_opaque_token', args: { version: 2 } },
          { uuid: 'pte-mig-tok-token' },
        ),
      ],
    }, { uuid: 'pte-mig-tok' })

    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const c2 = new Controller({ system: system2, entities: [TokV2], relations: [] })
    // Before setup, storage.schema is empty — pin physical schema to v1 so only logical
    // args differ in modelHash (fieldType string intentionally identical across args).
    const m2 = createMigrationManifest(c2, m1.storage)
    expect(m2.storage.records.find(r => r.recordName === 'PteMigTok')!
      .attributeDetails!.find(a => a.name === 'token')!.fieldType).toBe('TEXT')
    expect(m2.modelHash).not.toBe(m1.modelHash)

    const diff = await c2.generateMigrationDiff()
    const propChange = diff.changes.find(
      ch => ch.kind === 'property' && ch.dataContext === 'property:PteMigTok.token' && ch.changeType === 'changed',
    )
    expect(propChange).toBeTruthy()
    expect(propChange!.reason).toMatch(/args/)

    // fieldType identical → no type/fieldType blocking for that reason alone
    const typeBlocking = diff.safety.blockingChanges.filter(
      b => b.logicalPath === 'PteMigTok.token' && /field type|type, field type/i.test(b.reason),
    )
    expect(typeBlocking).toHaveLength(0)

    await db.close()
  })

  test('dictionary type change is detected; dictionary has no plugin fieldType', async () => {
    const Doc = new Entity({
      name: 'PteMigDictHost',
      properties: [new Property({ name: 'n', type: 'number' }, { uuid: 'pte-mig-dict-host-n' })],
    }, { uuid: 'pte-mig-dict-host' })
    const DictV1 = new Dictionary({
      name: 'pteMigSetting',
      type: 'number',
      collection: false,
    }, { uuid: 'pte-mig-dict-setting' })

    const { controller: c1, db } = await setupController({ entities: [Doc], dict: [DictV1] })
    const m1 = createMigrationManifest(c1)
    const d1 = m1.dictionaries.find(d => d.name === 'pteMigSetting')!
    expect(d1.type).toBe('number')
    expect(d1).not.toHaveProperty('args')
    // No dictionary plugin column in storage records
    expect(m1.storage.records.some(r => r.recordName === 'pteMigSetting')).toBe(false)

    clearAllInstances(Entity, Property, Dictionary)
    const Doc2 = new Entity({
      name: 'PteMigDictHost',
      properties: [new Property({ name: 'n', type: 'number' }, { uuid: 'pte-mig-dict-host-n' })],
    }, { uuid: 'pte-mig-dict-host' })
    const DictV2 = new Dictionary({
      name: 'pteMigSetting',
      type: 'string',
      collection: false,
    }, { uuid: 'pte-mig-dict-setting' })

    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const c2 = new Controller({ system: system2, entities: [Doc2], relations: [], dict: [DictV2] })
    const diff = await c2.generateMigrationDiff()

    const dictChange = diff.changes.find(
      ch => ch.kind === 'dictionary' && ch.dataContext === 'global:pteMigSetting' && ch.changeType === 'changed',
    )
    expect(dictChange).toBeTruthy()
    expect(dictChange!.reason).toMatch(/type/)

    await db.close()
  })

  test('dictionary args change is detected on logical signature (constructor path)', async () => {
    // Dictionary.create rejects builtin+args; constructor still carries historical args field.
    // Manifest must record args when present so declaration drift is visible.
    const Doc = new Entity({
      name: 'PteMigDictArgsHost',
      properties: [new Property({ name: 'n', type: 'number' }, { uuid: 'pte-mig-dict-args-host-n' })],
    }, { uuid: 'pte-mig-dict-args-host' })
    const DictV1 = new Dictionary({
      name: 'pteMigArgsSetting',
      type: 'object',
      collection: false,
      args: { schemaVersion: 1 },
    }, { uuid: 'pte-mig-dict-args-setting' })

    const { controller: c1, db } = await setupController({ entities: [Doc], dict: [DictV1] })
    const m1 = createMigrationManifest(c1)
    expect(m1.dictionaries.find(d => d.name === 'pteMigArgsSetting')!.args).toEqual({ schemaVersion: 1 })

    clearAllInstances(Entity, Property, Dictionary)
    const Doc2 = new Entity({
      name: 'PteMigDictArgsHost',
      properties: [new Property({ name: 'n', type: 'number' }, { uuid: 'pte-mig-dict-args-host-n' })],
    }, { uuid: 'pte-mig-dict-args-host' })
    const DictV2 = new Dictionary({
      name: 'pteMigArgsSetting',
      type: 'object',
      collection: false,
      args: { schemaVersion: 2 },
    }, { uuid: 'pte-mig-dict-args-setting' })

    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const c2 = new Controller({ system: system2, entities: [Doc2], relations: [], dict: [DictV2] })
    const m2 = createMigrationManifest(c2)
    expect(m2.modelHash).not.toBe(m1.modelHash)

    const diff = await c2.generateMigrationDiff()
    const dictChange = diff.changes.find(
      ch => ch.kind === 'dictionary' && ch.dataContext === 'global:pteMigArgsSetting' && ch.changeType === 'changed',
    )
    expect(dictChange).toBeTruthy()
    expect(dictChange!.reason).toMatch(/args/)

    await db.close()
  })

  test('same extended property contract yields no property-changed in generateMigrationDiff', async () => {
    registerPteVector()
    const DocV1 = new Entity({
      name: 'PteMigStable',
      properties: [
        new Property({ name: 'title', type: 'string' }, { uuid: 'pte-mig-stable-title' }),
        new Property(
          { name: 'embedding', type: 'pte_vector', args: { dimensions: 3 } },
          { uuid: 'pte-mig-stable-embedding' },
        ),
      ],
    }, { uuid: 'pte-mig-stable' })

    const { controller: c1, db } = await setupController({ entities: [DocV1] })

    clearAllInstances(Entity, Property, Dictionary)
    const DocV2 = new Entity({
      name: 'PteMigStable',
      properties: [
        new Property({ name: 'title', type: 'string' }, { uuid: 'pte-mig-stable-title' }),
        new Property(
          { name: 'embedding', type: 'pte_vector', args: { dimensions: 3 } },
          { uuid: 'pte-mig-stable-embedding' },
        ),
      ],
    }, { uuid: 'pte-mig-stable' })

    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const c2 = new Controller({ system: system2, entities: [DocV2], relations: [] })
    const diff = await c2.generateMigrationDiff()

    const propChanges = diff.changes.filter(ch => ch.kind === 'property')
    expect(propChanges).toEqual([])
    expect(diff.fromModelHash).toBe(diff.toModelHash)

    await db.close()
  })

  test('relation property args participate in manifest and property-changed detection', async () => {
    // Entity path is covered above; createMigrationManifest also maps relation.properties —
    // pin the sibling reader so entity-only args wiring cannot close M-04 silently.
    registerPteVector()
    const User = new Entity({
      name: 'PteMigRelUser',
      properties: [new Property({ name: 'n', type: 'string' }, { uuid: 'pte-mig-rel-user-n' })],
    }, { uuid: 'pte-mig-rel-user' })
    const Link = new Relation({
      name: 'PteMigRelLink',
      source: User,
      sourceProperty: 'out',
      target: User,
      targetProperty: 'in',
      type: 'n:n',
      properties: [
        new Property(
          { name: 'weightVec', type: 'pte_vector', args: { dimensions: 2 } },
          { uuid: 'pte-mig-rel-link-w' },
        ),
      ],
    }, { uuid: 'pte-mig-rel-link' })

    const db = new SQLiteDB(':memory:')
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [User],
      relations: [Link],
      dict: [],
    })
    await controller.setup(true)
    const m1 = createMigrationManifest(controller)
    const relProp = m1.records
      .find(r => r.name === 'PteMigRelLink')!
      .properties.find(p => p.name === 'weightVec')!
    expect(relProp.type).toBe('pte_vector')
    expect(relProp.args).toEqual({ dimensions: 2 })

    clearAllInstances(Entity, Property, Dictionary, Relation)
    const User2 = new Entity({
      name: 'PteMigRelUser',
      properties: [new Property({ name: 'n', type: 'string' }, { uuid: 'pte-mig-rel-user-n' })],
    }, { uuid: 'pte-mig-rel-user' })
    const Link2 = new Relation({
      name: 'PteMigRelLink',
      source: User2,
      sourceProperty: 'out',
      target: User2,
      targetProperty: 'in',
      type: 'n:n',
      properties: [
        new Property(
          { name: 'weightVec', type: 'pte_vector', args: { dimensions: 7 } },
          { uuid: 'pte-mig-rel-link-w' },
        ),
      ],
    }, { uuid: 'pte-mig-rel-link' })

    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const c2 = new Controller({ system: system2, entities: [User2], relations: [Link2], dict: [] })
    const diff = await c2.generateMigrationDiff()
    const propChange = diff.changes.find(
      ch => ch.kind === 'property'
        && ch.dataContext === 'property:PteMigRelLink.weightVec'
        && ch.changeType === 'changed',
    )
    expect(propChange).toBeTruthy()
    expect(propChange!.reason).toMatch(/args/)

    await db.close()
  })

})
