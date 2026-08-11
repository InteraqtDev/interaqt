/**
 * M-05 — FR-RET-01: declarative Entity retention + maintainEntityRetention.
 *
 * Acceptance (design §3.3 / M-05):
 * 1. mode:'cap' + orderBy: after maintain, each partition ≤ N and keeps latest N.
 * 2. mode:'ttl' (no orderBy): with injected now, expired deleted / fresh kept.
 * 3. cap+ttl: expire first, then cap.
 * 4. omitted / forever: never deleted by this mechanism; no hand-written prune loop.
 * 5. Boundary with cleanupAsyncTasks documented by coexistence (different targets).
 * 6. filtered / merged / hard-deletion host ⇒ declaration-time fail-fast.
 * 7. Auto-hook default off; when enabled, still calls the same maintainEntityRetention.
 * 8. Deletes go through storage.delete (mutation events observable via storage.listen).
 * 9. BT path: auto-hook runs only after owned COMMIT + deferred postCommit, not inside attempt.
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  Condition,
  Controller,
  Entity,
  HardDeletionProperty,
  Interaction,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  clearAllInstances,
  createMigrationManifest,
} from 'interaqt'
import { PGLiteDB } from '@drivers'

function user(id = 'u1') {
  return { id, name: 'tester' }
}

async function setupController(
  entities: any[],
  options: {
    entityRetention?: { runAfterSuccessfulDispatch?: boolean }
    eventSources?: any[]
  } = {},
) {
  const system = new MonoSystem(new PGLiteDB())
  system.conceptClass = KlassByName
  const controller = new Controller({
    system,
    entities,
    relations: [],
    eventSources: options.eventSources,
    entityRetention: options.entityRetention,
  })
  await controller.setup(true)
  return { system, controller }
}

describe('entity retention — declaration guards', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('filtered entity cannot declare retention', () => {
    const Base = Entity.create({
      name: 'RetBaseFiltered',
      properties: [Property.create({ name: 'active', type: 'boolean' })],
    })
    expect(() =>
      Entity.create({
        name: 'RetFiltered',
        baseEntity: Base,
        matchExpression: MatchExp.atom({ key: 'active', value: ['=', true] }),
        retention: {
          mode: 'cap',
          retainLatest: 1,
          orderBy: ['active'],
        },
      }),
    ).toThrow(/Filtered entity .* cannot declare retention/)
  })

  test('merged entity cannot declare retention', () => {
    const A = Entity.create({
      name: 'RetMergeA',
      properties: [Property.create({ name: 'label', type: 'string' })],
    })
    const B = Entity.create({
      name: 'RetMergeB',
      properties: [Property.create({ name: 'label', type: 'string' })],
    })
    expect(() =>
      Entity.create({
        name: 'RetMerged',
        inputEntities: [A, B],
        retention: { mode: 'forever' },
      }),
    ).toThrow(/Merged entity .* cannot declare retention/)
  })

  test('hard-deletion property host cannot declare retention', () => {
    expect(() =>
      Entity.create({
        name: 'RetHardDel',
        properties: [
          Property.create({ name: 'body', type: 'string' }),
          HardDeletionProperty.create(),
        ],
        retention: {
          mode: 'cap',
          retainLatest: 2,
          orderBy: ['body'],
        },
      }),
    ).toThrow(/hard-deletion property "_isDeleted_"/)
  })

  test('cap requires positive retainLatest and non-empty orderBy', () => {
    expect(() =>
      Entity.create({
        name: 'RetCapBadN',
        properties: [Property.create({ name: 'seq', type: 'number' })],
        retention: { mode: 'cap', retainLatest: 0, orderBy: ['seq'] },
      }),
    ).toThrow(/retainLatest/)

    expect(() =>
      Entity.create({
        name: 'RetCapBadOrder',
        properties: [Property.create({ name: 'seq', type: 'number' })],
        retention: { mode: 'cap', retainLatest: 2, orderBy: [] },
      }),
    ).toThrow(/orderBy/)
  })

  test('ttl rejects retainLatest/orderBy; requires number|timestamp property', () => {
    expect(() =>
      Entity.create({
        name: 'RetTtlExtra',
        properties: [Property.create({ name: 'at', type: 'number' })],
        retention: {
          mode: 'ttl',
          ttl: { timestampProperty: 'at', maxAgeMs: 1000 },
          orderBy: ['at'],
        } as any,
      }),
    ).toThrow(/must not declare retainLatest or orderBy/)

    expect(() =>
      Entity.create({
        name: 'RetTtlBadType',
        properties: [Property.create({ name: 'label', type: 'string' })],
        retention: {
          mode: 'ttl',
          ttl: { timestampProperty: 'label', maxAgeMs: 1000 },
        },
      }),
    ).toThrow(/number" or "timestamp"/)
  })

  test('forever and omitted are legal; stringify carries retention', () => {
    const Forever = Entity.create({
      name: 'RetForeverOk',
      properties: [Property.create({ name: 'x', type: 'number' })],
      retention: { mode: 'forever' },
    })
    expect(Forever.retention).toEqual({ mode: 'forever' })
    const json = Entity.stringify(Forever)
    expect(json).toContain('"mode":"forever"')

    const Plain = Entity.create({
      name: 'RetPlainOk',
      properties: [Property.create({ name: 'x', type: 'number' })],
    })
    expect(Plain.retention).toBeUndefined()
  })
})

describe('entity retention — maintainEntityRetention contracts', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('mode cap: keeps latest N per partition by orderBy DESC', async () => {
    const Log = Entity.create({
      name: 'RetCapLog',
      properties: [
        Property.create({ name: 'tenant', type: 'string' }),
        Property.create({ name: 'seq', type: 'number' }),
        Property.create({ name: 'body', type: 'string' }),
      ],
      retention: {
        mode: 'cap',
        partitionBy: ['tenant'],
        retainLatest: 2,
        orderBy: ['seq'],
      },
    })
    const { system, controller } = await setupController([Log])

    for (const row of [
      { tenant: 'a', seq: 1, body: 'a1' },
      { tenant: 'a', seq: 2, body: 'a2' },
      { tenant: 'a', seq: 3, body: 'a3' },
      { tenant: 'b', seq: 10, body: 'b10' },
      { tenant: 'b', seq: 11, body: 'b11' },
      { tenant: 'b', seq: 12, body: 'b12' },
      { tenant: 'b', seq: 13, body: 'b13' },
    ]) {
      await system.storage.create('RetCapLog', row)
    }

    const report = await controller.maintainEntityRetention()
    expect(report.removed).toBe(3) // a drops 1, b drops 2
    const entry = report.entities.find(e => e.entityName === 'RetCapLog')
    expect(entry?.removed).toBe(3)

    const remaining = (await system.storage.find(
      'RetCapLog',
      undefined,
      { orderBy: { tenant: 'ASC', seq: 'ASC' } },
      ['tenant', 'seq', 'body'],
    )) as unknown as Array<{ tenant: string; seq: number; body: string }>

    expect(remaining.map(r => ({ tenant: r.tenant, seq: r.seq, body: r.body }))).toEqual([
      { tenant: 'a', seq: 2, body: 'a2' },
      { tenant: 'a', seq: 3, body: 'a3' },
      { tenant: 'b', seq: 12, body: 'b12' },
      { tenant: 'b', seq: 13, body: 'b13' },
    ])

    // Second pass is a no-op.
    const again = await controller.maintainEntityRetention()
    expect(again.removed).toBe(0)

    await system.destroy()
  })

  test('mode ttl: deletes expired rows with injected now; keeps fresh', async () => {
    const Receipt = Entity.create({
      name: 'RetTtlReceipt',
      properties: [
        Property.create({ name: 'createdAt', type: 'number' }),
        Property.create({ name: 'label', type: 'string' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
    })
    const { system, controller } = await setupController([Receipt])

    const now = 1_700_000_000_000
    await system.storage.create('RetTtlReceipt', { createdAt: now - 5000, label: 'old' })
    await system.storage.create('RetTtlReceipt', { createdAt: now - 500, label: 'fresh' })
    await system.storage.create('RetTtlReceipt', { createdAt: now, label: 'newest' })

    const report = await controller.maintainEntityRetention({ now })
    expect(report.removed).toBe(1)

    const remaining = (await system.storage.find(
      'RetTtlReceipt',
      undefined,
      { orderBy: { createdAt: 'ASC' } },
      ['label', 'createdAt'],
    )) as unknown as Array<{ label: string }>
    expect(remaining.map(r => r.label).sort()).toEqual(['fresh', 'newest'])

    await system.destroy()
  })

  test('cap + ttl: expires first, then applies cap', async () => {
    const Audit = Entity.create({
      name: 'RetCapTtlAudit',
      properties: [
        Property.create({ name: 'scope', type: 'string' }),
        Property.create({ name: 'seq', type: 'number' }),
        Property.create({ name: 'at', type: 'number' }),
      ],
      retention: {
        mode: 'cap',
        partitionBy: ['scope'],
        retainLatest: 2,
        orderBy: ['seq'],
        ttl: { timestampProperty: 'at', maxAgeMs: 10_000 },
      },
    })
    const { system, controller } = await setupController([Audit])
    const now = 1_800_000_000_000

    // scope s1: one expired + three fresh → after ttl 3 remain → cap keeps 2 newest by seq
    await system.storage.create('RetCapTtlAudit', { scope: 's1', seq: 1, at: now - 50_000 })
    await system.storage.create('RetCapTtlAudit', { scope: 's1', seq: 2, at: now - 100 })
    await system.storage.create('RetCapTtlAudit', { scope: 's1', seq: 3, at: now - 50 })
    await system.storage.create('RetCapTtlAudit', { scope: 's1', seq: 4, at: now })

    const report = await controller.maintainEntityRetention({ now })
    // expired 1 + cap drops 1 from the 3 survivors = 2 removed
    expect(report.removed).toBe(2)

    const remaining = (await system.storage.find(
      'RetCapTtlAudit',
      undefined,
      { orderBy: { seq: 'ASC' } },
      ['scope', 'seq'],
    )) as unknown as Array<{ scope: string; seq: number }>
    expect(remaining).toEqual([
      expect.objectContaining({ scope: 's1', seq: 3 }),
      expect.objectContaining({ scope: 's1', seq: 4 }),
    ])

    await system.destroy()
  })

  test('omitted and forever entities are never pruned; entityNames filters targets', async () => {
    const KeptPlain = Entity.create({
      name: 'RetKeptPlain',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
    })
    const KeptForever = Entity.create({
      name: 'RetKeptForever',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: { mode: 'forever' },
    })
    const Pruned = Entity.create({
      name: 'RetPrunedOnly',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: {
        mode: 'cap',
        retainLatest: 1,
        orderBy: ['seq'],
      },
    })
    const { system, controller } = await setupController([KeptPlain, KeptForever, Pruned])

    for (let seq = 1; seq <= 3; seq++) {
      await system.storage.create('RetKeptPlain', { seq })
      await system.storage.create('RetKeptForever', { seq })
      await system.storage.create('RetPrunedOnly', { seq })
    }

    const full = await controller.maintainEntityRetention()
    expect(full.entities.map(e => e.entityName).sort()).toEqual(['RetPrunedOnly'])
    expect(full.removed).toBe(2)

    expect(
      (await system.storage.find('RetKeptPlain', undefined, undefined, ['seq'])).length,
    ).toBe(3)
    expect(
      (await system.storage.find('RetKeptForever', undefined, undefined, ['seq'])).length,
    ).toBe(3)
    expect(
      (await system.storage.find('RetPrunedOnly', undefined, undefined, ['seq'])).length,
    ).toBe(1)

    // entityNames can target a forever entity and still remove nothing.
    const filtered = await controller.maintainEntityRetention({
      entityNames: ['RetKeptForever'],
    })
    expect(filtered.removed).toBe(0)
    expect(filtered.entities).toEqual([])

    await system.destroy()
  })

  test('auto-hook default off; when enabled still uses maintainEntityRetention', async () => {
    const Log = Entity.create({
      name: 'RetAutoLog',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: {
        mode: 'cap',
        retainLatest: 1,
        orderBy: ['seq'],
      },
    })

    // Default off: successful dispatch does not prune.
    {
      const Ping = Interaction.create({
        name: 'RetAutoPingOff',
        action: Action.create({ name: 'retAutoPingOff' }),
      })
      const { system, controller } = await setupController([Log], {
        eventSources: [Ping],
      })
      expect(controller.entityRetentionOptions.runAfterSuccessfulDispatch).toBe(false)
      await system.storage.create('RetAutoLog', { seq: 1 })
      await system.storage.create('RetAutoLog', { seq: 2 })
      const res = await controller.dispatch(Ping, { user: user() })
      expect(res.error).toBeUndefined()
      expect(
        (await system.storage.find('RetAutoLog', undefined, undefined, ['id'])).length,
      ).toBe(2)
      await system.destroy()
      clearAllInstances()
    }

    // Enabled: prune after successful applied dispatch via the same API path.
    {
      const LogOn = Entity.create({
        name: 'RetAutoLogOn',
        properties: [
          Property.create({ name: 'seq', type: 'number' }),
        ],
        retention: {
          mode: 'cap',
          retainLatest: 1,
          orderBy: ['seq'],
        },
      })
      const PingOn = Interaction.create({
        name: 'RetAutoPingOn',
        action: Action.create({ name: 'retAutoPingOn' }),
      })
      const { system, controller } = await setupController([LogOn], {
        eventSources: [PingOn],
        entityRetention: { runAfterSuccessfulDispatch: true },
      })
      expect(controller.entityRetentionOptions.runAfterSuccessfulDispatch).toBe(true)
      await system.storage.create('RetAutoLogOn', { seq: 1 })
      await system.storage.create('RetAutoLogOn', { seq: 2 })
      await system.storage.create('RetAutoLogOn', { seq: 3 })
      const res = await controller.dispatch(PingOn, { user: user() })
      expect(res.error).toBeUndefined()
      const remaining = (await system.storage.find(
        'RetAutoLogOn',
        undefined,
        { orderBy: { seq: 'ASC' } },
        ['seq'],
      )) as unknown as Array<{ seq: number }>
      expect(remaining).toEqual([expect.objectContaining({ seq: 3 })])
      await system.destroy()
    }
  })

  test('maintainEntityRetention deletes emit normal mutation events', async () => {
    const Log = Entity.create({
      name: 'RetMutEvLog',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: {
        mode: 'cap',
        retainLatest: 1,
        orderBy: ['seq'],
      },
    })
    const { system, controller } = await setupController([Log])
    const seen: Array<{ type?: string; recordName?: string }> = []
    system.storage.listen(async (events) => {
      seen.push(...(events as Array<{ type?: string; recordName?: string }>))
    })
    await system.storage.create('RetMutEvLog', { seq: 1 })
    await system.storage.create('RetMutEvLog', { seq: 2 })
    seen.length = 0

    const report = await controller.maintainEntityRetention()
    expect(report.removed).toBe(1)
    const deletes = seen.filter(
      (e) => e.type === 'delete' && e.recordName === 'RetMutEvLog',
    )
    expect(deletes.length).toBeGreaterThanOrEqual(1)

    await system.destroy()
  })

  test('auto-hook skips failed dispatch; BT path prunes only after owned COMMIT', async () => {
    // Failed non-BT dispatch must not prune.
    {
      const Log = Entity.create({
        name: 'RetFailHookLog',
        properties: [Property.create({ name: 'seq', type: 'number' })],
        retention: {
          mode: 'cap',
          retainLatest: 1,
          orderBy: ['seq'],
        },
      })
      const Deny = Interaction.create({
        name: 'RetFailHookDeny',
        action: Action.create({ name: 'retFailHookDeny' }),
        conditions: Condition.create({
          name: 'never',
          content: async () => false,
        }),
      })
      const { system, controller } = await setupController([Log], {
        eventSources: [Deny],
        entityRetention: { runAfterSuccessfulDispatch: true },
      })
      await system.storage.create('RetFailHookLog', { seq: 1 })
      await system.storage.create('RetFailHookLog', { seq: 2 })
      const res = await controller.dispatch(Deny, { user: user() })
      expect(res.error).toBeTruthy()
      expect(
        (await system.storage.find('RetFailHookLog', undefined, undefined, ['id'])).length,
      ).toBe(2)
      await system.destroy()
      clearAllInstances()
    }

    // BT success: prune after outer COMMIT (same maintainEntityRetention entry).
    {
      const Log = Entity.create({
        name: 'RetBtHookLog',
        properties: [Property.create({ name: 'seq', type: 'number' })],
        retention: {
          mode: 'cap',
          retainLatest: 1,
          orderBy: ['seq'],
        },
      })
      const Ping = Interaction.create({
        name: 'RetBtHookPing',
        action: Action.create({ name: 'retBtHookPing' }),
      })
      const { system, controller } = await setupController([Log], {
        eventSources: [Ping],
        entityRetention: { runAfterSuccessfulDispatch: true },
      })
      await system.storage.create('RetBtHookLog', { seq: 1 })
      await system.storage.create('RetBtHookLog', { seq: 2 })
      await system.storage.create('RetBtHookLog', { seq: 3 })

      await controller.runInBusinessTransaction({ name: 'ret-bt-hook' }, async () => {
        const res = await controller.dispatch(Ping, { user: user() })
        expect(res.error).toBeUndefined()
        // Still inside BT-owned transaction: retention must not have run yet.
        expect(
          (await system.storage.find('RetBtHookLog', undefined, undefined, ['id'])).length,
        ).toBe(3)
      })

      const remaining = (await system.storage.find(
        'RetBtHookLog',
        undefined,
        { orderBy: { seq: 'ASC' } },
        ['seq'],
      )) as unknown as Array<{ seq: number }>
      expect(remaining).toEqual([expect.objectContaining({ seq: 3 })])
      await system.destroy()
    }
  })

  test('coexists with cleanupAsyncTasks boundary (does not touch internal task tables)', async () => {
    // Retention only scans user entities with retention; cleanupAsyncTasks only
    // removes terminal async-task rows. A controller with only retention entities
    // reports empty cleanupAsyncTasks and still prunes the declared entity.
    const Note = Entity.create({
      name: 'RetBoundaryNote',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: {
        mode: 'cap',
        retainLatest: 1,
        orderBy: ['seq'],
      },
    })
    const { system, controller } = await setupController([Note])
    await system.storage.create('RetBoundaryNote', { seq: 1 })
    await system.storage.create('RetBoundaryNote', { seq: 2 })

    const taskSummary = await controller.cleanupAsyncTasks()
    expect(taskSummary.every(s => s.removed === 0 || typeof s.removed === 'number')).toBe(true)

    const retention = await controller.maintainEntityRetention()
    expect(retention.removed).toBe(1)
    expect(
      (await system.storage.find('RetBoundaryNote', undefined, undefined, ['id'])).length,
    ).toBe(1)

    await system.destroy()
  })

  test('migration manifest includes retention in entity record (modelHash reader)', async () => {
    const WithCap = Entity.create({
      name: 'RetManifestCap',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: {
        mode: 'cap',
        retainLatest: 5,
        orderBy: ['seq'],
      },
    })
    const { system, controller } = await setupController([WithCap])
    const manifest = createMigrationManifest(controller)
    const record = manifest.records.find(r => r.name === 'RetManifestCap')
    expect(record?.retention).toEqual({
      mode: 'cap',
      retainLatest: 5,
      orderBy: ['seq'],
    })

    // Changing retention changes modelHash (same physical schema shape).
    clearAllInstances()
    const WithTtl = Entity.create({
      name: 'RetManifestCap',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'seq', maxAgeMs: 1000 },
      },
    })
    // seq is number — valid ttl timestampProperty type.
    const system2 = new MonoSystem(new PGLiteDB())
    system2.conceptClass = KlassByName
    const controller2 = new Controller({
      system: system2,
      entities: [WithTtl],
      relations: [],
    })
    await controller2.setup(true)
    const manifest2 = createMigrationManifest(controller2)
    expect(manifest2.modelHash).not.toBe(manifest.modelHash)

    await system.destroy()
    await system2.destroy()
  })
})
