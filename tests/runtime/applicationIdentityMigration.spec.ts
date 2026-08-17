/**
 * M-04 — Entity.identity migration visibility, blocked shapes, retention
 * recycle + re-register, and official doctrine.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  Controller,
  Entity,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  Transform,
  UniqueConstraint,
  clearAllInstances,
  createMigrationManifest,
  readMigrationManifest,
} from 'interaqt'
import { DBSetup } from '@storage'
import { PGLiteDB } from '@drivers'
import { approveGeneratedMigrationDiff, dryRunWithApproval, migrateWithApproval } from './helpers/migrationApproval.js'

const TOKEN = 'MigrationIdentityToken'
const NS = 'migration-identity-token-ns'
const TOKEN_PROP = 'migration-identity-token-token'
const HOLDER = 'migration-identity-token-holder'
const PAYLOAD = 'migration-identity-token-payload'
const ENTITY = 'migration-identity-token'

beforeEach(() => {
  clearAllInstances(
    Entity, Property, UniqueConstraint, Transform,
    Interaction, Action, Payload, PayloadItem,
  )
})

function tokenProperties() {
  return [
    Property.create({ name: 'ns', type: 'string' }, { uuid: NS }),
    Property.create({ name: 'token', type: 'string' }, { uuid: TOKEN_PROP }),
    Property.create({ name: 'holder', type: 'string' }, { uuid: HOLDER }),
    Property.create({ name: 'payload', type: 'string' }, { uuid: PAYLOAD }),
  ]
}

function tokenEntity(options: { identity?: boolean } = {}) {
  return Entity.create({
    name: TOKEN,
    ...(options.identity ? { identity: { name: 'byKey', properties: ['ns', 'token'] } } : {}),
    properties: tokenProperties(),
  }, { uuid: ENTITY })
}

async function setupV1(db: PGLiteDB, entity = tokenEntity()) {
  const system = new MonoSystem(db)
  system.conceptClass = KlassByName
  const controller = new Controller({ system, entities: [entity], relations: [] })
  await controller.setup(true)
  return { system, controller }
}

async function identityIndexNames(db: PGLiteDB) {
  return db.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'interaqt_ident_%'`,
    [],
  )
}

describe('application identity — migration signature', () => {
  test('applicationIdentity participates in modelHash; changing it mismatches setup(false)', async () => {
    const db = new PGLiteDB()
    const { system, controller } = await setupV1(db, tokenEntity({ identity: true }))
    const manifest = createMigrationManifest(controller)
    const record = manifest.records.find(item => item.name === TOKEN)
    expect(record?.applicationIdentity).toEqual({ name: 'byKey', properties: ['ns', 'token'] })
    expect(record?.identity).toMatchObject({ kind: 'entity', namePath: `entity:${TOKEN}` })
    expect((record?.identity as { namePath?: string })?.namePath).not.toBeUndefined()

    clearAllInstances(Entity, Property)
    const withoutIdentity = tokenEntity()
    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const controller2 = new Controller({ system: system2, entities: [withoutIdentity], relations: [] })
    expect(createMigrationManifest(controller2).modelHash).not.toBe(manifest.modelHash)
    await expect(controller2.setup(false)).rejects.toThrow(/Model manifest mismatch/)

    await db.close()
    await system.destroy()
  })

  test('changing identity.name or identity.properties invalidates modelHash', async () => {
    const db = new PGLiteDB()
    const { system, controller } = await setupV1(db, tokenEntity({ identity: true }))
    const baseline = createMigrationManifest(controller).modelHash

    clearAllInstances(Entity, Property)
    const renamed = Entity.create({
      name: TOKEN,
      identity: { name: 'naturalKey', properties: ['ns', 'token'] },
      properties: tokenProperties(),
    }, { uuid: ENTITY })
    const system2 = new MonoSystem(new PGLiteDB())
    system2.conceptClass = KlassByName
    const controller2 = new Controller({ system: system2, entities: [renamed], relations: [] })
    await controller2.setup(true)
    expect(createMigrationManifest(controller2).modelHash).not.toBe(baseline)

    clearAllInstances(Entity, Property)
    const retargeted = Entity.create({
      name: TOKEN,
      identity: { name: 'byKey', properties: ['token'] },
      properties: tokenProperties(),
    }, { uuid: ENTITY })
    const system3 = new MonoSystem(new PGLiteDB())
    system3.conceptClass = KlassByName
    const controller3 = new Controller({ system: system3, entities: [retargeted], relations: [] })
    await controller3.setup(true)
    expect(createMigrationManifest(controller3).modelHash).not.toBe(baseline)
    expect(createMigrationManifest(controller3).modelHash).not.toBe(createMigrationManifest(controller2).modelHash)

    await db.close()
    await system.destroy()
    await system2.destroy()
    await system3.destroy()
  })
})

describe('application identity — migrate onto existing table', () => {
  test('clean data: additive unique index, then set-semantic create', async () => {
    const db = new PGLiteDB()
    const { system } = await setupV1(db)
    await system.storage.create(TOKEN, { ns: 'a', token: 't1', holder: 'alice', payload: 'first' })

    clearAllInstances(Entity, Property)
    const withIdentity = tokenEntity({ identity: true })
    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const controller2 = new Controller({ system: system2, entities: [withIdentity], relations: [] })

    const diff = await controller2.generateMigrationDiff()
    expect(diff.changes.some(change =>
      change.kind === 'record'
      && change.dataContext === `entity:${TOKEN}`
      && change.reason === 'entity application identity changed',
    )).toBe(true)

    const plan = await dryRunWithApproval(controller2)
    expect(plan.schemaPlan?.verificationDDL.some(operation =>
      operation.logicalPath === `${TOKEN}.identity.ns.token.notNull`,
    )).toBe(true)
    expect(plan.schemaPlan?.verificationDDL.some(operation =>
      operation.logicalPath === `${TOKEN}.identity.ns.token`,
    )).toBe(true)
    expect(plan.schemaPlan?.postRecomputeDDL.some(operation =>
      operation.description.includes('application identity unique index'),
    )).toBe(true)

    await migrateWithApproval(controller2)
    expect((await readMigrationManifest(controller2))!.modelHash).toBe(createMigrationManifest(controller2).modelHash)

    const existing = await system2.storage.findOne(
      TOKEN,
      MatchExp.atom({ key: 'ns', value: ['=', 'a'] }).and({ key: 'token', value: ['=', 't1'] }),
      undefined,
      ['id', 'holder', 'payload'],
    )
    const observed = await system2.storage.create(TOKEN, { ns: 'a', token: 't1', holder: 'bob', payload: 'ignored' })
    expect(observed.id).toBe(existing.id)
    expect(observed.holder).toBe('alice')
    expect(observed.payload).toBe('first')

    const indexes = await identityIndexNames(db)
    expect(indexes.length).toBeGreaterThan(0)

    await db.close()
  })

  test('adding identity to a Transform occupancy entity does not rebuild output', async () => {
    const TRANSFORM = 'migration-identity-token-transform'
    const occupancyCallback = (event: any) => event.interactionName === 'MigIdRegister' ? {
      ns: event.payload.ns,
      token: event.payload.token,
      payload: event.payload.data,
      holder: event.payload.nonce,
    } : null
    const Register = Interaction.create({
      name: 'MigIdRegister',
      action: Action.create({ name: 'migIdRegister' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'ns', type: 'string' }),
          PayloadItem.create({ name: 'token', type: 'string' }),
          PayloadItem.create({ name: 'data', type: 'string' }),
          PayloadItem.create({ name: 'nonce', type: 'string' }),
        ],
      }),
    })
    const db = new PGLiteDB()
    const v1 = Entity.create({
      name: TOKEN,
      properties: tokenProperties(),
      computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['interactionName', 'payload'],
        callback: occupancyCallback,
      }, { uuid: TRANSFORM }),
    }, { uuid: ENTITY })
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [v1],
      relations: [],
      eventSources: [Register],
    })
    await controller.setup(true)
    const registered = await controller.dispatch(Register, {
      user: { id: 'u1', name: 'tester' },
      payload: { ns: 'a', token: 't1', data: 'first', nonce: 'alice' },
    })
    expect(registered.error).toBeUndefined()
    const original = await system.storage.findOne(
      TOKEN,
      MatchExp.atom({ key: 'ns', value: ['=', 'a'] }).and({ key: 'token', value: ['=', 't1'] }),
      undefined,
      ['id', 'holder', 'payload'],
    )
    expect(original.holder).toBe('alice')

    clearAllInstances(Entity, Property, Transform)
    const v2 = Entity.create({
      name: TOKEN,
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      properties: tokenProperties(),
      computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['interactionName', 'payload'],
        callback: occupancyCallback,
      }, { uuid: TRANSFORM }),
    }, { uuid: ENTITY })
    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const controller2 = new Controller({
      system: system2,
      entities: [v2],
      relations: [],
      eventSources: [Register],
    })

    const diff = await controller2.generateMigrationDiff()
    expect(diff.changes.some(change =>
      change.kind === 'record'
      && change.dataContext === `entity:${TOKEN}`
      && change.reason === 'entity application identity changed',
    )).toBe(true)
    expect(diff.requiredDecisions.some(item =>
      item.kind === 'computation'
      && item.dataContext === `entity:${TOKEN}`
      && item.recommendedDecision === 'changed',
    )).toBe(false)

    await migrateWithApproval(controller2)
    const kept = await system2.storage.find(TOKEN, undefined, undefined, ['id', 'holder', 'payload'])
    expect(kept).toEqual([
      expect.objectContaining({ id: original.id, holder: 'alice', payload: 'first' }),
    ])
    const observed = await system2.storage.create(TOKEN, {
      ns: 'a', token: 't1', holder: 'bob', payload: 'ignored',
    })
    expect(observed.id).toBe(original.id)
    expect(observed.holder).toBe('alice')

    const second = await controller2.dispatch(Register, {
      user: { id: 'u1', name: 'tester' },
      payload: { ns: 'a', token: 't1', data: 'ignored', nonce: 'bob' },
    })
    expect(second.error).toBeUndefined()
    expect(second.effects?.some(effect => effect.recordName === TOKEN && effect.type === 'create')).toBe(false)

    await db.close()
  })

  test('duplicate identity keys fail verification before the unique index is created', async () => {
    const db = new PGLiteDB()
    const { system } = await setupV1(db)
    await system.storage.create(TOKEN, { ns: 'a', token: 'dup', holder: 'one', payload: 'x' })
    await system.storage.create(TOKEN, { ns: 'a', token: 'dup', holder: 'two', payload: 'y' })

    clearAllInstances(Entity, Property)
    const withIdentity = tokenEntity({ identity: true })
    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const controller2 = new Controller({ system: system2, entities: [withIdentity], relations: [] })

    const approvedDiff = await approveGeneratedMigrationDiff(controller2)
    const plan = await controller2.migrate({ approvedDiff, dryRun: true })
    expect(plan.schemaPlan?.verificationDDL.some(operation =>
      operation.logicalPath === `${TOKEN}.identity.ns.token`,
    )).toBe(true)
    await expect(migrateWithApproval(controller2)).rejects.toThrow(/Migration verification failed for MigrationIdentityToken\.identity\.ns\.token/)
    expect(await identityIndexNames(db)).toEqual([])
    expect(await system.storage.find(TOKEN, undefined, undefined, ['holder'])).toHaveLength(2)
    await system.storage.create(TOKEN, { ns: 'a', token: 'dup', holder: 'three', payload: 'z' })
    expect(await system.storage.find(TOKEN, undefined, undefined, ['id'])).toHaveLength(3)

    await db.close()
  })

  test('NULL identity columns fail verification', async () => {
    const db = new PGLiteDB()
    const { system } = await setupV1(db)
    await system.storage.create(TOKEN, { ns: 'a', holder: 'ghost', payload: 'missing-token' })

    clearAllInstances(Entity, Property)
    const withIdentity = tokenEntity({ identity: true })
    const system2 = new MonoSystem(db)
    system2.conceptClass = KlassByName
    const controller2 = new Controller({ system: system2, entities: [withIdentity], relations: [] })

    await expect(migrateWithApproval(controller2)).rejects.toThrow(/Migration verification failed for MigrationIdentityToken\.identity\.ns\.token\.notNull/)
    expect(await identityIndexNames(db)).toEqual([])
    const leftover = await system.storage.find(TOKEN, undefined, undefined, ['ns', 'token', 'holder'])
    expect(leftover).toEqual([expect.objectContaining({ ns: 'a', holder: 'ghost' })])
    expect(leftover[0].token == null).toBe(true)

    await db.close()
  })
})

describe('application identity — retention recycle and re-register', () => {
  test('ttl recycle deletes occupancy rows, leaves other entities, and frees the key', async () => {
    const now = 1_900_000_000_000
    const Register = Interaction.create({
      name: 'IdRetRegister',
      action: Action.create({ name: 'idRetRegister' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'ns', type: 'string' }),
          PayloadItem.create({ name: 'token', type: 'string' }),
          PayloadItem.create({ name: 'data', type: 'string' }),
          PayloadItem.create({ name: 'nonce', type: 'string' }),
          PayloadItem.create({ name: 'createdAt', type: 'number' }),
        ],
      }),
    })
    const Token = Entity.create({
      name: 'IdRetTok',
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
      properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
        Property.create({ name: 'holder', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['interactionName', 'payload'],
        callback: (event: any) => event.interactionName === 'IdRetRegister' ? {
          ns: event.payload.ns,
          token: event.payload.token,
          payload: event.payload.data,
          holder: event.payload.nonce,
          createdAt: event.payload.createdAt,
        } : null,
      }),
    })
    const Note = Entity.create({
      name: 'IdRetNote',
      properties: [Property.create({ name: 'body', type: 'string' })],
    })

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Token, Note],
      relations: [],
      eventSources: [Register],
    })
    await controller.setup(true)

    const user = { id: 'u1', name: 'tester' }
    const expired = await controller.dispatch(Register, {
      user,
      payload: { ns: 'hs', token: 'one', data: 'secret', nonce: 'alice', createdAt: now - 5000 },
    })
    expect(expired.error).toBeUndefined()
    expect(expired.effects?.some(effect => effect.recordName === 'IdRetTok' && effect.type === 'create')).toBe(true)

    const kept = await controller.dispatch(Register, {
      user,
      payload: { ns: 'hs', token: 'two', data: 'other', nonce: 'bob', createdAt: now - 100 },
    })
    expect(kept.error).toBeUndefined()
    await system.storage.create('IdRetNote', { body: 'untouched' })

    const report = await controller.maintainEntityRetention({ now })
    expect(report.removed).toBe(1)
    expect(report.entities.find(entry => entry.entityName === 'IdRetTok')?.removed).toBe(1)
    expect(report.entities.find(entry => entry.entityName === 'IdRetNote')).toBeUndefined()

    const tokens = await system.storage.find('IdRetTok', undefined, undefined, ['token', 'holder'])
    expect(tokens.map((row: any) => row.token).sort()).toEqual(['two'])
    expect(await system.storage.find('IdRetNote', undefined, undefined, ['body'])).toEqual([
      expect.objectContaining({ body: 'untouched' }),
    ])

    const reregister = await controller.dispatch(Register, {
      user,
      payload: { ns: 'hs', token: 'one', data: 'new-secret', nonce: 'carol', createdAt: now },
    })
    expect(reregister.error).toBeUndefined()
    expect(reregister.effects?.some(effect =>
      effect.recordName === 'IdRetTok'
      && effect.type === 'create'
      && (effect.record as { holder?: string }).holder === 'carol',
    )).toBe(true)
    const restored = await system.storage.findOne(
      'IdRetTok',
      MatchExp.atom({ key: 'ns', value: ['=', 'hs'] }).and({ key: 'token', value: ['=', 'one'] }),
      undefined,
      ['holder', 'payload'],
    )
    expect(restored.holder).toBe('carol')
    expect(restored.payload).toBe('new-secret')

    await system.destroy()
  })
})

describe('application identity — doctrine', () => {
  test('S2 mysql-like dialect still fail-fasts (no MySQL server)', () => {
    const Token = Entity.create({
      name: 'IdMigMysqlTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const mysqlLikeDatabase = {
      schemaDialect: {
        name: 'mysql' as const,
        maxIdentifierLength: 64,
        supportsCreateIndexIfNotExists: false,
        enforceMaxIdentifierLength: true,
        encodeLiteral: (value: unknown) => JSON.stringify(value),
        constraints: { unique: false, filteredUnique: false, nonNull: false },
      },
      mapToDBFieldType: (type: string) => type === 'pk' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'TEXT',
    }
    expect(() => new DBSetup([Token], [], mysqlLikeDatabase as any)).toThrow(/not supported on the mysql dialect/)
  })

  test('official usage and generator docs do not recommend application CREATE TABLE occupancy', () => {
    const knowledgeRoot = resolve(process.cwd(), 'agent/agentspace/knowledge')
    const antiPattern = readFileSync(join(knowledgeRoot, 'usage/19-common-anti-patterns.md'), 'utf8')
    expect(antiPattern).toMatch(/Entity\.identity/)
    expect(antiPattern).toMatch(/CREATE TABLE/)
    expect(antiPattern).toMatch(/occupancy|handshake|one-time ticket|natural key/i)

    const usageIdentity = readFileSync(join(knowledgeRoot, 'usage/02-define-entities-properties.md'), 'utf8')
    expect(usageIdentity).toMatch(/identity:\s*\{\s*name:/)

    const occupancyRecipe = readFileSync(join(knowledgeRoot, 'usage/15-entity-crud-patterns.md'), 'utf8')
    expect(occupancyRecipe).toMatch(/identity:\s*\{\s*name:\s*'byKey'/)
    expect(occupancyRecipe).toMatch(/Two clocks/)
    expect(occupancyRecipe).toMatch(/Full Transform rebuild/)
    expect(occupancyRecipe).toMatch(/expiresAt/)
    expect(occupancyRecipe).toMatch(/Entity\.retention/)

    const generatorApi = readFileSync(join(knowledgeRoot, 'generator/api-reference.md'), 'utf8')
    expect(generatorApi).toMatch(/Entity\.identity occupancy/)
    expect(generatorApi).toMatch(/rebuild's insert order/)
    expect(generatorApi).toMatch(/judged at consume\/query time/)

    const computationGuide = readFileSync(join(knowledgeRoot, 'generator/computation-implementation.md'), 'utf8')
    expect(computationGuide).toMatch(/prefer migration `unchanged`/)

    const changelog = readFileSync(resolve(process.cwd(), 'CHANGELOG.md'), 'utf8')
    expect(changelog).toMatch(/Entity\.identity/)
    expect(changelog).toMatch(/expiresAt/)
    expect(changelog).toMatch(/retention clocks/)
    expect(changelog).toMatch(/CREATE TABLE/)
    expect(changelog).toMatch(/full-rebuild|full rebuild/i)

    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return walk(path)
      return entry.name.endsWith('.md') ? [path] : []
    })
    const antiPatternPath = join(knowledgeRoot, 'usage/19-common-anti-patterns.md')
    for (const path of walk(knowledgeRoot)) {
      const text = readFileSync(path, 'utf8')
      if (path === antiPatternPath) {
        expect(text).not.toMatch(/CREATE TABLE IF NOT EXISTS[\s\S]{0,120}as the (official|supported) (occupancy|claim) backend/i)
        continue
      }
      expect(text, path).not.toMatch(/CREATE TABLE IF NOT EXISTS/)
    }
  })
})
