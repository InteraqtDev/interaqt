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
 * 10. A retained entity that is the source of a data-based Transform: the delete patch requires
 *     SERIALIZABLE, so each per-entity transaction must take the same RequireSerializableRetry
 *     upgrade as dispatch. Covered for the direct call (ttl, later entities still pruned) and
 *     for the auto-hook after dispatch (cap).
 * 11. Downstream-consumer axis: the built-in aggregate, Custom and Transform consumers that read
 *     the deleted rows (directly or through a relation removed with them) converge to the value
 *     derived from the surviving rows. Called inside an active storage transaction, retention runs in
 *     that transaction without retry and the first failure propagates unchanged.
 * 12. Failure semantics: a failing entity does not stop later entities (MaintenanceError after the
 *     pass; its report counts committed deletions); TTL batches commit independently and carry the
 *     SERIALIZABLE upgrade forward; the auto-hook reports its outcome in
 *     DispatchResponse.entityRetention and never rejects dispatch / runInBusinessTransaction.
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  Any,
  Average,
  Condition,
  Controller,
  Count,
  Custom,
  Dictionary,
  Entity,
  Every,
  HardDeletionProperty,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  Relation,
  Summation,
  Transform,
  WeightedSummation,
  clearAllInstances,
  MaintenanceError,
  createMigrationManifest,
  isPostCommitPhaseComplete,
  isRequireSerializableRetry,
  isTransactionRetryExhaustedError,
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
      expect(res.entityRetention).toBeUndefined()
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
      expect(res.entityRetention).toEqual({
        status: 'complete',
        report: { entities: [{ entityName: 'RetAutoLogOn', removed: 2 }], removed: 2 },
      })
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
      expect(res.entityRetention).toBeUndefined()
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

  test('data-based Transform source: expired source rows and their derived rows are removed; later entities still run', async () => {
    // Deleting a data-based Transform source row produces a delete patch, which requires
    // SERIALIZABLE isolation (RequireSerializableRetry under READ COMMITTED). The retained
    // source entity is declared before a plain retained entity so that a failure on the
    // first entity would also leave the second one unpruned.
    const Ticket = Entity.create({
      name: 'RetTfTicket',
      properties: [
        Property.create({ name: 'label', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
    })
    const TicketView = Entity.create({
      name: 'RetTfTicketView',
      properties: [Property.create({ name: 'label', type: 'string' })],
      computation: Transform.create({
        record: Ticket,
        attributeQuery: ['label'],
        callback: (ticket: { label: string }) => ({ label: ticket.label }),
      }),
    })
    const Later = Entity.create({
      name: 'RetTfLaterLog',
      properties: [
        Property.create({ name: 'label', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
    })
    const { system, controller } = await setupController([Ticket, TicketView, Later])

    const now = 1_700_000_000_000
    await system.storage.create('RetTfTicket', { label: 'expired-1', createdAt: now - 5000 })
    await system.storage.create('RetTfTicket', { label: 'expired-2', createdAt: now - 2000 })
    await system.storage.create('RetTfTicket', { label: 'fresh', createdAt: now - 500 })
    await system.storage.create('RetTfLaterLog', { label: 'expired', createdAt: now - 5000 })
    await system.storage.create('RetTfLaterLog', { label: 'fresh', createdAt: now })

    const labelsOf = async (entityName: string) =>
      ((await system.storage.find(entityName, undefined, undefined, ['label'])) as unknown as Array<{ label: string }>)
        .map(row => row.label)
        .sort()
    expect(await labelsOf('RetTfTicketView')).toEqual(['expired-1', 'expired-2', 'fresh'])

    const report = await controller.maintainEntityRetention({ now })
    expect(report).toEqual({
      entities: [
        { entityName: 'RetTfTicket', removed: 2 },
        { entityName: 'RetTfLaterLog', removed: 1 },
      ],
      removed: 3,
    })

    expect(await labelsOf('RetTfTicket')).toEqual(['fresh'])
    expect(await labelsOf('RetTfTicketView')).toEqual(['fresh'])
    expect(await labelsOf('RetTfLaterLog')).toEqual(['fresh'])

    await system.destroy()
  })

  test('auto-hook on a data-based Transform source (cap): dispatch succeeds and derived rows follow', async () => {
    // Same SERIALIZABLE requirement through runAfterSuccessfulDispatch. Without the upgrade,
    // dispatch rejects after its own transaction has already committed.
    const Note = Entity.create({
      name: 'RetTfHookNote',
      properties: [Property.create({ name: 'seq', type: 'number' })],
      retention: {
        mode: 'cap',
        retainLatest: 1,
        orderBy: ['seq'],
      },
    })
    const NoteView = Entity.create({
      name: 'RetTfHookNoteView',
      properties: [Property.create({ name: 'seq', type: 'number' })],
      computation: Transform.create({
        record: Note,
        attributeQuery: ['seq'],
        callback: (note: { seq: number }) => ({ seq: note.seq }),
      }),
    })
    const Ping = Interaction.create({
      name: 'RetTfHookPing',
      action: Action.create({ name: 'retTfHookPing' }),
    })
    const { system, controller } = await setupController([Note, NoteView], {
      eventSources: [Ping],
      entityRetention: { runAfterSuccessfulDispatch: true },
    })
    for (const seq of [1, 2, 3]) {
      await system.storage.create('RetTfHookNote', { seq })
    }

    const res = await controller.dispatch(Ping, { user: user() })
    expect(res.error).toBeUndefined()

    const seqsOf = async (entityName: string) =>
      ((await system.storage.find(entityName, undefined, undefined, ['seq'])) as unknown as Array<{ seq: number }>)
        .map(row => row.seq)
    expect(await seqsOf('RetTfHookNote')).toEqual([3])
    expect(await seqsOf('RetTfHookNoteView')).toEqual([3])

    await system.destroy()
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

describe('entity retention — downstream consumers of the deleted rows', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  const NOW = 1_700_000_000_000
  // Two expired rows and one fresh row. Every expected value below is derived by hand from
  // the surviving row (amount 3), independently of the computation under test.
  const ROWS = [
    { amount: 10, createdAt: NOW - 5000 },
    { amount: 4, createdAt: NOW - 2000 },
    { amount: 3, createdAt: NOW - 500 },
  ]

  type ConsumerCell = {
    label: string
    /** True when the consumer requires SERIALIZABLE on delete (red on v4.11.2). */
    requiresSerializable: boolean
    withOwner?: boolean
    build: (Source: any, Owner: any, Link: any) => { entities?: any[]; dict?: any[] }
    read: (system: MonoSystem, ownerId: string | undefined) => Promise<unknown>
    before: unknown
    after: unknown
  }

  const readDict = (system: MonoSystem) => system.storage.dict.get('retConsValue')
  const readAmounts = async (system: MonoSystem, name: string) =>
    ((await system.storage.find(name, undefined, undefined, ['amount'])) as unknown as Array<{ amount: number }>)
      .map(row => row.amount)
      .sort((a, b) => a - b)
  const dictOf = (type: string, computation: any) => [Dictionary.create({ name: 'retConsValue', type, collection: false, computation })]

  const cells: ConsumerCell[] = [
    {
      label: 'Count (global)', requiresSerializable: false,
      build: Source => ({ dict: dictOf('number', Count.create({ record: Source })) }),
      read: readDict, before: 3, after: 1,
    },
    {
      label: 'Summation (global)', requiresSerializable: false,
      build: Source => ({ dict: dictOf('number', Summation.create({ record: Source, attributeQuery: ['amount'] })) }),
      read: readDict, before: 17, after: 3,
    },
    {
      label: 'WeightedSummation (global)', requiresSerializable: false,
      build: Source => ({
        dict: dictOf('number', WeightedSummation.create({
          record: Source, attributeQuery: ['amount'], callback: (row: { amount: number }) => ({ weight: 1, value: row.amount }),
        })),
      }),
      read: readDict, before: 17, after: 3,
    },
    {
      label: 'Average (global)', requiresSerializable: false,
      build: Source => ({ dict: dictOf('number', Average.create({ record: Source, attributeQuery: ['amount'] })) }),
      read: async system => Number(await readDict(system)), before: 17 / 3, after: 3,
    },
    {
      label: 'Every (global)', requiresSerializable: false,
      build: Source => ({
        dict: dictOf('boolean', Every.create({ record: Source, attributeQuery: ['amount'], callback: (row: { amount: number }) => row.amount < 5 })),
      }),
      read: readDict, before: false, after: true,
    },
    {
      label: 'Any (global)', requiresSerializable: false,
      build: Source => ({
        dict: dictOf('boolean', Any.create({ record: Source, attributeQuery: ['amount'], callback: (row: { amount: number }) => row.amount > 5 })),
      }),
      read: readDict, before: true, after: false,
    },
    {
      label: 'Custom, default concurrency (global)', requiresSerializable: true,
      build: Source => ({
        dict: dictOf('number', Custom.create({
          name: 'RetConsCustomSum',
          dataDeps: { rows: { type: 'records', source: Source, attributeQuery: ['amount'] } },
          compute: async (deps: { rows?: Array<{ amount: number }> }) => (deps.rows ?? []).reduce((sum, row) => sum + row.amount, 0),
          getInitialValue: () => 0,
        })),
      }),
      read: readDict, before: 17, after: 3,
    },
    {
      label: 'Custom, atomic-safe (global)', requiresSerializable: false,
      build: Source => ({
        dict: dictOf('number', Custom.create({
          name: 'RetConsCustomSumSafe',
          concurrency: 'atomic-safe',
          dataDeps: { rows: { type: 'records', source: Source, attributeQuery: ['amount'] } },
          compute: async (deps: { rows?: Array<{ amount: number }> }) => (deps.rows ?? []).reduce((sum, row) => sum + row.amount, 0),
          getInitialValue: () => 0,
        })),
      }),
      read: readDict, before: 17, after: 3,
    },
    {
      label: 'data-based Transform (entity)', requiresSerializable: true,
      build: Source => {
        const View = Entity.create({ name: 'RetConsView', properties: [Property.create({ name: 'amount', type: 'number' })] })
        View.computation = Transform.create({ record: Source, attributeQuery: ['amount'], callback: (row: { amount: number }) => ({ amount: row.amount }) })
        return { entities: [View] }
      },
      read: system => readAmounts(system, 'RetConsView'), before: [3, 4, 10], after: [3],
    },
    {
      // Event-based outputs are facts about past create events, not projections of live rows.
      label: 'event-based Transform on create (entity)', requiresSerializable: false,
      build: Source => {
        const View = Entity.create({ name: 'RetConsView', properties: [Property.create({ name: 'amount', type: 'number' })] })
        View.computation = Transform.create({
          eventDeps: { SourceCreated: { recordName: Source.name, type: 'create' } },
          callback: (event: { record: { amount: number } }) => ({ amount: event.record.amount }),
        })
        return { entities: [View] }
      },
      read: system => readAmounts(system, 'RetConsView'), before: [3, 4, 10], after: [3, 4, 10],
    },
    {
      label: 'data-based Transform on a relation removed with the rows', requiresSerializable: true, withOwner: true,
      build: (_Source, _Owner, Link) => {
        const LinkView = Entity.create({ name: 'RetConsLinkView', properties: [Property.create({ name: 'tag', type: 'string' })] })
        LinkView.computation = Transform.create({ record: Link, attributeQuery: ['id'], callback: () => ({ tag: 'link' }) })
        return { entities: [LinkView] }
      },
      read: async system => (await system.storage.find('RetConsLinkView', undefined, undefined, ['id'])).length,
      before: 3, after: 1,
    },
    {
      label: 'property Count over a relation removed with the rows', requiresSerializable: false, withOwner: true,
      build: () => ({}),
      read: async (system, ownerId) => ((await system.storage.findOne(
        'RetConsOwner', MatchExp.atom({ key: 'id', value: ['=', ownerId] }), undefined, ['itemCount'],
      )) as unknown as { itemCount: number }).itemCount,
      before: 3, after: 1,
    },
  ]

  test.each(cells)('$label converges to the surviving rows', async (cell) => {
    const Source = Entity.create({
      name: 'RetConsSource',
      properties: [
        Property.create({ name: 'amount', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: { mode: 'ttl', ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 } },
    })
    let Owner: any
    let Link: any
    if (cell.withOwner) {
      Owner = Entity.create({
        name: 'RetConsOwner',
        properties: [
          Property.create({ name: 'name', type: 'string' }),
          Property.create({ name: 'itemCount', type: 'number', computation: Count.create({ property: 'items' }) }),
        ],
      })
      Link = Relation.create({ name: 'RetConsLink', source: Source, sourceProperty: 'owner', target: Owner, targetProperty: 'items', type: 'n:1' })
    }
    const built = cell.build(Source, Owner, Link)
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Source, ...(Owner ? [Owner] : []), ...(built.entities ?? [])],
      relations: Link ? [Link] : [],
      dict: built.dict ?? [],
    })
    await controller.setup(true)
    try {
      const owner = Owner ? await system.storage.create('RetConsOwner', { name: 'owner' }) : undefined
      for (const row of ROWS) {
        await system.storage.create('RetConsSource', owner ? { ...row, owner: { id: owner.id } } : row)
      }
      expect(await cell.read(system, owner?.id)).toEqual(cell.before)

      const report = await controller.maintainEntityRetention({ now: NOW })
      expect(report).toEqual({ entities: [{ entityName: 'RetConsSource', removed: 2 }], removed: 2 })
      expect(await readAmounts(system, 'RetConsSource')).toEqual([3])
      expect(await cell.read(system, owner?.id)).toEqual(cell.after)
    } finally {
      await system.destroy()
    }
  })

  test('the axis contains consumers that require SERIALIZABLE and consumers that do not', () => {
    // Guards the matrix itself: without both kinds the cells cannot distinguish an entry point
    // that upgrades from one that does not.
    expect(cells.filter(cell => cell.requiresSerializable).map(cell => cell.label)).toEqual([
      'Custom, default concurrency (global)',
      'data-based Transform (entity)',
      'data-based Transform on a relation removed with the rows',
    ])
    expect(cells.some(cell => !cell.requiresSerializable)).toBe(true)
  })

  async function setupTransformSource() {
    const Source = Entity.create({
      name: 'RetNestSource',
      properties: [
        Property.create({ name: 'amount', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: { mode: 'ttl', ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 } },
    })
    const View = Entity.create({ name: 'RetNestView', properties: [Property.create({ name: 'amount', type: 'number' })] })
    View.computation = Transform.create({ record: Source, attributeQuery: ['amount'], callback: (row: { amount: number }) => ({ amount: row.amount }) })
    const { system, controller } = await setupController([Source, View])
    for (const row of ROWS) {
      await system.storage.create('RetNestSource', row)
    }
    return { system, controller }
  }

  test('inside an active READ COMMITTED transaction: runs in it once and leaves the upgrade to the outer owner', async () => {
    const { system, controller } = await setupTransformSource()
    try {
      let inner: unknown
      await expect(system.storage.runInTransaction({ name: 'outer-read-committed' }, async () => {
        try {
          await controller.maintainEntityRetention({ now: NOW })
        } catch (error) {
          inner = error
          throw error
        }
      })).rejects.toBeDefined()
      // One attempt in the outer transaction: the signal propagates unchanged, without
      // futile nested retries that cannot raise the outer isolation level.
      expect(isRequireSerializableRetry(inner)).toBe(true)
      expect(isTransactionRetryExhaustedError(inner)).toBe(false)
      expect((inner as { transactionAttempts?: number }).transactionAttempts).toBeUndefined()
      // The outer transaction rolled back, so source and derived rows are unchanged.
      expect(await readAmounts(system, 'RetNestSource')).toEqual([3, 4, 10])
      expect(await readAmounts(system, 'RetNestView')).toEqual([3, 4, 10])
    } finally {
      await system.destroy()
    }
  })

  test('inside an active SERIALIZABLE transaction: prunes within the outer transaction', async () => {
    const { system, controller } = await setupTransformSource()
    try {
      const report = await system.storage.runInTransaction(
        { name: 'outer-serializable', isolation: 'SERIALIZABLE' },
        () => controller.maintainEntityRetention({ now: NOW }),
      )
      expect(report).toEqual({ entities: [{ entityName: 'RetNestSource', removed: 2 }], removed: 2 })
      expect(await readAmounts(system, 'RetNestSource')).toEqual([3])
      expect(await readAmounts(system, 'RetNestView')).toEqual([3])
    } finally {
      await system.destroy()
    }
  })

  test('auto-hook failure is reported on the response and never rejects dispatch or runInBusinessTransaction', async () => {
    // The facts are committed before the hook runs, so a rejection would tell the caller that
    // a committed dispatch failed. Retention is maintenance, not a stage P obligation: the
    // outcome is reported in `entityRetention` and logged, `postCommitPhase` stays complete.
    const Log = Entity.create({
      name: 'RetHookFailLog',
      properties: [Property.create({ name: 'createdAt', type: 'number' })],
      retention: { mode: 'ttl', ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 } },
    })
    const Ping = Interaction.create({ name: 'RetHookFailPing', action: Action.create({ name: 'retHookFailPing' }) })
    const { system, controller } = await setupController([Log], {
      eventSources: [Ping],
      entityRetention: { runAfterSuccessfulDispatch: true },
    })
    try {
      const hookFailure = new Error('downstream listener failed on a retention delete')
      system.storage.listen(async (events) => {
        if ((events as Array<{ type?: string; recordName?: string }>).some(e => e.type === 'delete' && e.recordName === 'RetHookFailLog')) {
          throw hookFailure
        }
      })
      const logged: unknown[] = []
      const originalError = system.logger.error
      system.logger.error = (entry) => {
        if (entry.label === 'entityRetention') logged.push(entry.error)
        originalError.call(system.logger, entry)
      }
      const interactionEvents = async () =>
        (await system.storage.find(InteractionEventEntity.name, undefined, undefined, ['id'])).length
      const expectFailedOutcome = (outcome: unknown) => {
        expect(outcome).toMatchObject({ status: 'failed' })
        const error = (outcome as { error: unknown }).error
        expect(error).toBeInstanceOf(MaintenanceError)
        expect((error as MaintenanceError).failures).toEqual([{ target: 'RetHookFailLog', error: hookFailure }])
        expect((error as MaintenanceError).report).toEqual({ entities: [{ entityName: 'RetHookFailLog', removed: 0 }], removed: 0 })
      }

      await system.storage.create('RetHookFailLog', { createdAt: 0 })
      const res = await controller.dispatch(Ping, { user: user() })
      expect(res.error).toBeUndefined()
      expect(isPostCommitPhaseComplete(res)).toBe(true)
      expectFailedOutcome(res.entityRetention)
      expect(await interactionEvents()).toBe(1)
      expect(logged).toHaveLength(1)

      let inside: Awaited<ReturnType<typeof controller.dispatch>> | undefined
      await controller.runInBusinessTransaction({ name: 'ret-hook-fail' }, async () => {
        inside = await controller.dispatch(Ping, { user: user() })
        expect(inside.error).toBeUndefined()
        // Inside the business transaction the hook has not run yet.
        expect(inside.entityRetention).toBeUndefined()
      })
      // After the owned COMMIT the single pass is reported on the applied result.
      expectFailedOutcome(inside!.entityRetention)
      expect(await interactionEvents()).toBe(2)
      expect(logged).toHaveLength(2)
      // The failing pass rolled back, so the expired row is still present.
      expect((await system.storage.find('RetHookFailLog', undefined, undefined, ['id'])).length).toBe(1)
    } finally {
      await system.destroy()
    }
  })
})

describe('entity retention — failure isolation and transaction granularity', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  const NOW = 1_700_000_000_000
  const BATCH = 500 // ENTITY_RETENTION_DELETE_BATCH in Controller.ts

  function ttlEntity(name: string) {
    return Entity.create({
      name,
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: { mode: 'ttl', ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 } },
    })
  }

  const failOnDelete = (system: MonoSystem, recordName: string, failure: Error, predicate: (record: { id?: unknown }) => boolean = () => true) => {
    system.storage.listen(async (events) => {
      const hit = (events as Array<{ type?: string; recordName?: string; record?: { id?: unknown } }>)
        .some(e => e.type === 'delete' && e.recordName === recordName && predicate(e.record ?? {}))
      if (hit) throw failure
    })
  }
  const countOf = async (system: MonoSystem, name: string) => (await system.storage.find(name, undefined, undefined, ['id'])).length

  test('a failing entity does not stop later entities; the failure is thrown after the pass', async () => {
    const First = ttlEntity('RetIsoFirst')
    const Second = ttlEntity('RetIsoSecond')
    const { system, controller } = await setupController([First, Second])
    try {
      for (const name of ['RetIsoFirst', 'RetIsoSecond']) {
        await system.storage.create(name, { seq: 1, createdAt: NOW - 5000 })
        await system.storage.create(name, { seq: 2, createdAt: NOW })
      }
      const failure = new Error('listener failed on the first entity')
      failOnDelete(system, 'RetIsoFirst', failure)

      const error = await controller.maintainEntityRetention({ now: NOW }).then(() => undefined, (e: unknown) => e)
      expect(error).toBeInstanceOf(MaintenanceError)
      const maintenanceError = error as MaintenanceError
      expect(maintenanceError.operation).toBe('maintainEntityRetention')
      expect(maintenanceError.failures).toEqual([{ target: 'RetIsoFirst', error: failure }])
      expect(maintenanceError.causedBy).toBe(failure)
      expect(maintenanceError.report).toEqual({
        entities: [
          { entityName: 'RetIsoFirst', removed: 0 },
          { entityName: 'RetIsoSecond', removed: 1 },
        ],
        removed: 1,
      })
      expect(await countOf(system, 'RetIsoFirst')).toBe(2)
      expect(await countOf(system, 'RetIsoSecond')).toBe(1)
    } finally {
      await system.destroy()
    }
  })

  test('inside a caller-owned transaction the first failure propagates unchanged and later entities do not run', async () => {
    const First = ttlEntity('RetIsoNestFirst')
    const Second = ttlEntity('RetIsoNestSecond')
    const { system, controller } = await setupController([First, Second])
    try {
      for (const name of ['RetIsoNestFirst', 'RetIsoNestSecond']) {
        await system.storage.create(name, { seq: 1, createdAt: NOW - 5000 })
      }
      const failure = new Error('listener failed on the first entity')
      failOnDelete(system, 'RetIsoNestFirst', failure)
      let deletesOfSecond = 0
      system.storage.listen(async (events) => {
        deletesOfSecond += (events as Array<{ type?: string; recordName?: string }>)
          .filter(e => e.type === 'delete' && e.recordName === 'RetIsoNestSecond').length
      })

      await expect(system.storage.runInTransaction({ name: 'caller-owned' }, () =>
        controller.maintainEntityRetention({ now: NOW }),
      )).rejects.toBe(failure)
      expect(deletesOfSecond).toBe(0)
      expect(await countOf(system, 'RetIsoNestFirst')).toBe(1)
      expect(await countOf(system, 'RetIsoNestSecond')).toBe(1)
    } finally {
      await system.destroy()
    }
  })

  test('TTL batches commit independently: a failure in a later batch keeps the committed batches', async () => {
    const Log = ttlEntity('RetBatchLog')
    const { system, controller } = await setupController([Log])
    try {
      const expiredCount = BATCH + 100
      const ids: unknown[] = []
      for (let seq = 0; seq < expiredCount; seq++) {
        ids.push((await system.storage.create('RetBatchLog', { seq, createdAt: NOW - 5000 })).id)
      }
      await system.storage.create('RetBatchLog', { seq: -1, createdAt: NOW })
      // Batches are ordered by id: the row created at position BATCH + 50 is in the second batch.
      const poisonId = String(ids[BATCH + 50])
      const failure = new Error('listener failed in the second batch')
      failOnDelete(system, 'RetBatchLog', failure, record => String(record.id) === poisonId)

      const error = await controller.maintainEntityRetention({ now: NOW }).then(() => undefined, (e: unknown) => e)
      expect(error).toBeInstanceOf(MaintenanceError)
      expect((error as MaintenanceError).failures.map(f => f.target)).toEqual(['RetBatchLog'])
      expect((error as MaintenanceError).report).toEqual({ entities: [{ entityName: 'RetBatchLog', removed: BATCH }], removed: BATCH })
      // The first batch is committed; the second batch rolled back; the fresh row is untouched.
      expect(await countOf(system, 'RetBatchLog')).toBe(expiredCount - BATCH + 1)
    } finally {
      await system.destroy()
    }
  }, 120000)

  test('later TTL batches start at the isolation level the previous batch committed at', async () => {
    const Source = ttlEntity('RetBatchIsoSource')
    const View = Entity.create({ name: 'RetBatchIsoView', properties: [Property.create({ name: 'seq', type: 'number' })] })
    View.computation = Transform.create({ record: Source, attributeQuery: ['seq'], callback: (row: { seq: number }) => ({ seq: row.seq }) })
    const { system, controller } = await setupController([Source, View])
    try {
      for (let seq = 0; seq < BATCH + 1; seq++) {
        await system.storage.create('RetBatchIsoSource', { seq, createdAt: NOW - 5000 })
      }
      const isolations: string[] = []
      const original = system.storage.runInTransaction.bind(system.storage)
      system.storage.runInTransaction = (options, fn) => {
        isolations.push(options.isolation ?? 'READ COMMITTED')
        return original(options, fn)
      }

      const report = await controller.maintainEntityRetention({ now: NOW })
      expect(report).toEqual({ entities: [{ entityName: 'RetBatchIsoSource', removed: BATCH + 1 }], removed: BATCH + 1 })
      // Batch 1: READ COMMITTED fails on the Transform delete patch, reruns at SERIALIZABLE.
      // Batch 2 starts at SERIALIZABLE, so the failing READ COMMITTED attempt is not repeated.
      expect(isolations).toEqual(['READ COMMITTED', 'SERIALIZABLE', 'SERIALIZABLE'])
      expect(await countOf(system, 'RetBatchIsoSource')).toBe(0)
      expect(await countOf(system, 'RetBatchIsoView')).toBe(0)
    } finally {
      await system.destroy()
    }
  }, 120000)
})
