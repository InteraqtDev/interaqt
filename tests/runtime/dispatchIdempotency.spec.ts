/**
 * M-04 — FR-IDEM-01: admit/open pipeline, declaration-time idempotency, outcome.
 *
 * Acceptance (design §3.2.12 / M-04):
 * 1. Standalone Interaction: applied → replayed; event rows do not grow; do not read effects to decide.
 * 2. postCommit: first 1, replay 0; BT replay does not push deferred.
 * 3. admit reject ⇒ no successful replayed.
 * 4. Real Activity head ★1 (second call may omit activityId).
 * 5. Real Activity ★4 (step completed → replayed, no ActivityStateError).
 * 6. Wrapper missing admit/open ⇒ fail-fast (I7) — wrappers always install both.
 * 7. Non-participating success has no outcome; failure then re-applied (I5).
 * 8. Same-key in_flight ⇒ IDEMPOTENCY_IN_FLIGHT (I10).
 * Plus I1–I3 table lifecycle (always install; migration path).
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  Activity,
  ActivityManager,
  Condition,
  Controller,
  Entity,
  EventSource,
  IdempotencyError,
  Interaction,
  InteractionEventEntity,
  InteractionGuardError,
  KlassByName,
  MonoSystem,
  Property,
  Transfer,
  clearAllInstances,
} from 'interaqt'
import { PGLiteDB } from '@drivers'

async function tableExists(system: MonoSystem, tableName: string): Promise<boolean> {
  const rows = await (system.storage as any).db.query(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [tableName],
  )
  return rows.length > 0
}

function user(id = 'u1') {
  return { id, name: 'tester' }
}

describe('dispatch idempotency — I1 install always creates _DispatchIdempotency_', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('setup(true) creates ledger without any idempotency declaration', async () => {
    const Note = Entity.create({
      name: 'IdemInstallNote',
      properties: [Property.create({ name: 'body', type: 'string' })],
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Note], relations: [] })
    await controller.setup(true)
    expect(await tableExists(system, '_DispatchIdempotency_')).toBe(true)
    await system.destroy()
  })
})

describe('dispatch idempotency — I2/I3 migration lifecycle', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('prepareMigration plans create-table when missing; apply restores ledger', async () => {
    const Note = Entity.create({
      name: 'IdemLifecycleNote',
      properties: [Property.create({ name: 'body', type: 'string' })],
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Note], relations: [] })
    await controller.setup(true)
    expect(await tableExists(system, '_DispatchIdempotency_')).toBe(true)

    await (system.storage as any).db.scheme(
      `DROP TABLE IF EXISTS "_DispatchIdempotency_"`,
      'drop dispatch idempotency for lifecycle test',
    )
    expect(await tableExists(system, '_DispatchIdempotency_')).toBe(false)

    const states = (controller as any).scheduler.createStates()
    const plan = await (system as any).prepareMigrationSchema(
      controller.entities,
      controller.relations,
      states,
      { internalRequirements: [] },
    )
    const createOps = (plan.preRecomputeDDL || []).filter(
      (op: any) => op.kind === 'create-table' && op.tableName === '_DispatchIdempotency_',
    )
    expect(createOps.length).toBeGreaterThanOrEqual(1)

    await (system as any).applyMigrationSchema(plan)
    expect(await tableExists(system, '_DispatchIdempotency_')).toBe(true)
    await system.destroy()
  })
})

describe('dispatch idempotency — standalone Interaction', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('applied → replayed; event rows stable; outcome required only when participating', async () => {
    const createOrder = Interaction.create({
      name: 'IdemCreateOrder',
      action: Action.create({ name: 'idemCreateOrder' }),
      idempotency: {
        // Use context (not undeclared payload fields) so payload checks stay empty.
        key: (args) => (args.context?.clientRequestId as string) || null,
      },
    })

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [],
      relations: [],
      eventSources: [createOrder],
    })
    await controller.setup(true)

    const args = { user: user(), context: { clientRequestId: 'req-1' } }
    const first = await controller.dispatch(createOrder, args)
    expect(first.error).toBeUndefined()
    expect(first.outcome).toBe('applied')

    const second = await controller.dispatch(createOrder, args)
    expect(second.error).toBeUndefined()
    expect(second.outcome).toBe('replayed')
    // Discriminate via outcome only — do not scan effects.
    expect(second.effects).toEqual([])

    const events = await system.storage.find(
      InteractionEventEntity.name!,
      undefined,
      undefined,
      ['*'],
    )
    expect(events.length).toBe(1)

    // Non-participating (empty key): no outcome.
    const third = await controller.dispatch(createOrder, {
      user: user(),
      context: { clientRequestId: '' },
    })
    expect(third.error).toBeUndefined()
    expect(third.outcome).toBeUndefined()

    const eventsAfter = await system.storage.find(
      InteractionEventEntity.name!,
      undefined,
      undefined,
      ['*'],
    )
    expect(eventsAfter.length).toBe(2)

    await system.destroy()
  })

  test('postCommit runs once on applied and zero on replayed', async () => {
    let postCommitCount = 0
    const entity = InteractionEventEntity
    const source = EventSource.create({
      name: 'IdemPostCommitSource',
      entity,
      admit: async () => {},
      mapEventData: () => ({ interactionName: 'IdemPostCommitSource', payload: {} }),
      postCommit: async () => {
        postCommitCount += 1
        return { posted: true }
      },
      idempotency: {
        key: (args: { key?: string }) => args.key || null,
      },
    })

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [],
      eventSources: [source],
    })
    await controller.setup(true)

    const first = await controller.dispatch(source, { key: 'pc-1' })
    expect(first.error).toBeUndefined()
    expect(first.outcome).toBe('applied')
    expect(postCommitCount).toBe(1)

    const second = await controller.dispatch(source, { key: 'pc-1' })
    expect(second.error).toBeUndefined()
    expect(second.outcome).toBe('replayed')
    expect(postCommitCount).toBe(1)

    await system.destroy()
  })

  test('BT deferred postCommit is not pushed on replayed', async () => {
    let postCommitCount = 0
    const source = EventSource.create({
      name: 'IdemBtPostCommit',
      entity: InteractionEventEntity,
      admit: async () => {},
      mapEventData: () => ({ interactionName: 'IdemBtPostCommit' }),
      postCommit: async () => {
        postCommitCount += 1
      },
      idempotency: {
        key: (args: { key?: string }) => args.key || null,
      },
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, eventSources: [source] })
    await controller.setup(true)

    await controller.runInBusinessTransaction({ name: 'bt-first' }, async () => {
      const r = await controller.dispatch(source, { key: 'bt-1' })
      expect(r.outcome).toBe('applied')
    })
    expect(postCommitCount).toBe(1)

    await controller.runInBusinessTransaction({ name: 'bt-replay' }, async () => {
      const r = await controller.dispatch(source, { key: 'bt-1' })
      expect(r.outcome).toBe('replayed')
    })
    expect(postCommitCount).toBe(1)

    await system.destroy()
  })

  test('admit rejection prevents successful replayed (I4)', async () => {
    let allow = true
    const create = Interaction.create({
      name: 'IdemAdmitGate',
      action: Action.create({ name: 'idemAdmitGate' }),
      conditions: Condition.create({
        name: 'allowFlag',
        content: async () => {
          if (allow) return true
          return { allowed: false, code: 'DENIED' }
        },
      }),
      idempotency: {
        key: () => 'fixed-key',
      },
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, eventSources: [create] })
    await controller.setup(true)

    const ok = await controller.dispatch(create, { user: user() })
    expect(ok.error).toBeUndefined()
    expect(ok.outcome).toBe('applied')

    allow = false
    const denied = await controller.dispatch(create, { user: user() })
    expect(denied.error).toBeDefined()
    expect(denied.outcome).toBeUndefined()
    expect(denied.error).toBeInstanceOf(InteractionGuardError)

    await system.destroy()
  })

  test('first failure then re-applied (I5)', async () => {
    let shouldFail = true
    const source = EventSource.create({
      name: 'IdemFailThenApply',
      entity: InteractionEventEntity,
      admit: async () => {},
      mapEventData: () => ({ interactionName: 'IdemFailThenApply' }),
      resolve: async () => {
        if (shouldFail) throw new Error('boom')
        return { ok: true }
      },
      idempotency: {
        key: () => 'fail-then',
      },
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, eventSources: [source] })
    await controller.setup(true)

    const failed = await controller.dispatch(source, {})
    expect(failed.error).toBeDefined()
    expect(failed.outcome).toBeUndefined()

    shouldFail = false
    const applied = await controller.dispatch(source, {})
    expect(applied.error).toBeUndefined()
    expect(applied.outcome).toBe('applied')
    expect(applied.data).toEqual({ ok: true })

    const replayed = await controller.dispatch(source, {})
    expect(replayed.outcome).toBe('replayed')
    expect(replayed.data).toEqual({ ok: true })

    await system.destroy()
  })

  test('in_flight conflict surfaces IDEMPOTENCY_IN_FLIGHT (I10)', async () => {
    const source = EventSource.create({
      name: 'IdemInFlight',
      entity: InteractionEventEntity,
      admit: async () => {},
      mapEventData: () => ({ interactionName: 'IdemInFlight' }),
      idempotency: {
        key: () => 'inflight-key',
      },
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, eventSources: [source] })
    await controller.setup(true)

    // Seed an in_flight row as if a concurrent holder claimed the key.
    await system.storage.runInTransaction({ name: 'seed-inflight' }, async () => {
      await system.storage.dispatchIdempotency.claim(source.name, 'inflight-key')
    })

    const result = await controller.dispatch(source, {})
    expect(result.error).toBeInstanceOf(IdempotencyError)
    expect((result.error as IdempotencyError).code).toBe('IDEMPOTENCY_IN_FLIGHT')
    expect(result.outcome).toBeUndefined()

    await system.destroy()
  })
})

describe('dispatch idempotency — real Activity ★1 / ★4 / I7', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('Activity wrappers install admit+open and forward idempotency (I7 / ★7)', () => {
    const start = Interaction.create({
      name: 'IdemActStart',
      action: Action.create({ name: 'idemActStart' }),
      idempotency: {
        key: (args) => (args.context?.clientRequestId as string) || null,
      },
    })
    const next = Interaction.create({
      name: 'IdemActNext',
      action: Action.create({ name: 'idemActNext' }),
      idempotency: {
        key: (args) => (args.context?.clientRequestId as string) || null,
      },
    })
    const activity = Activity.create({
      name: 'IdemActivity',
      interactions: [start, next],
      transfers: [Transfer.create({ name: 't1', source: start, target: next })],
    })
    const manager = new ActivityManager([activity])
    const output = manager.getOutput()
    for (const es of output.eventSources) {
      expect(typeof es.admit).toBe('function')
      expect(typeof es.open).toBe('function')
      expect(es.guard).toBe(es.admit)
      expect(es.idempotency).toBeDefined()
      expect(es.idempotencyInteractionKey).toBeTruthy()
    }
  })

  test('★1 head success then K+A0+auth → replayed without activityId; Activity rows stable', async () => {
    const start = Interaction.create({
      name: 'IdemHeadStart',
      action: Action.create({ name: 'idemHeadStart' }),
      idempotency: {
        key: (args) => (args.context?.clientRequestId as string) || null,
      },
    })
    const finish = Interaction.create({
      name: 'IdemHeadFinish',
      action: Action.create({ name: 'idemHeadFinish' }),
    })
    const activity = Activity.create({
      name: 'IdemHeadActivity',
      interactions: [start, finish],
      transfers: [Transfer.create({ name: 'toFinish', source: start, target: finish })],
    })

    const manager = new ActivityManager([activity])
    const output = manager.getOutput()
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [...output.entities],
      relations: [...output.relations],
      eventSources: [...output.eventSources],
    })
    await controller.setup(true)

    const headES = controller.findEventSourceByName('IdemHeadActivity:IdemHeadStart')!
    const context = { clientRequestId: 'act-req-1' }

    const first = await controller.dispatch(headES, { user: user(), context })
    expect(first.error).toBeUndefined()
    expect(first.outcome).toBe('applied')
    const activityId = first.context!.activityId as string
    expect(activityId).toBeTruthy()

    // ★1: second call with same key and NO activityId.
    const second = await controller.dispatch(headES, { user: user(), context })
    expect(second.error).toBeUndefined()
    expect(second.outcome).toBe('replayed')
    expect(second.context?.activityId).toBe(activityId)
    expect(second.effects).toEqual([])

    const activityRows = await system.storage.find('_Activity_', undefined, undefined, ['*'])
    expect(activityRows.length).toBe(1)

    const headEvents = await system.storage.find(
      InteractionEventEntity.name!,
      undefined,
      undefined,
      ['*'],
    )
    expect(headEvents.filter((e: any) => e.interactionName === 'IdemHeadStart').length).toBe(1)

    await system.destroy()
  })

  test('★4 completed step replayed without ActivityStateError or second complete', async () => {
    const start = Interaction.create({
      name: 'IdemStepStart',
      action: Action.create({ name: 'idemStepStart' }),
    })
    const step = Interaction.create({
      name: 'IdemStepDo',
      action: Action.create({ name: 'idemStepDo' }),
      idempotency: {
        key: (args) => (args.context?.clientRequestId as string) || null,
      },
    })
    const activity = Activity.create({
      name: 'IdemStepActivity',
      interactions: [start, step],
      transfers: [Transfer.create({ name: 'toStep', source: start, target: step })],
    })

    const manager = new ActivityManager([activity])
    const output = manager.getOutput()
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [...output.entities],
      relations: [...output.relations],
      eventSources: [...output.eventSources],
    })
    await controller.setup(true)

    const startES = controller.findEventSourceByName('IdemStepActivity:IdemStepStart')!
    const stepES = controller.findEventSourceByName('IdemStepActivity:IdemStepDo')!

    const head = await controller.dispatch(startES, { user: user() })
    expect(head.error).toBeUndefined()
    const activityId = head.context!.activityId as string

    const context = { clientRequestId: 'step-req-1' }
    const firstStep = await controller.dispatch(stepES, { user: user(), activityId, context })
    expect(firstStep.error).toBeUndefined()
    expect(firstStep.outcome).toBe('applied')

    // ★4: same key + activityId after step completed — must replay, not ActivityStateError.
    const secondStep = await controller.dispatch(stepES, { user: user(), activityId, context })
    expect(secondStep.error).toBeUndefined()
    expect(secondStep.outcome).toBe('replayed')

    const stepEvents = (await system.storage.find(
      InteractionEventEntity.name!,
      undefined,
      undefined,
      ['*'],
    )).filter((e: any) => e.interactionName === 'IdemStepDo')
    expect(stepEvents.length).toBe(1)

    await system.destroy()
  })
})

describe('dispatch pipeline — admit required; no guard dual-track', () => {
  beforeEach(() => {
    clearAllInstances()
  })

  test('EventSource.create rejects legacy guard-only CreateArgs', () => {
    const Log = Entity.create({
      name: 'LegacyGuardEntity',
      properties: [Property.create({ name: 'm', type: 'string' })],
    })
    expect(() =>
      EventSource.create({
        name: 'legacyGuard',
        entity: Log,
        guard: async () => {},
      } as any),
    ).toThrow(/admit/)
  })

  test('dispatch without admit fails fast when ignoreGuard is false', async () => {
    const Log = Entity.create({
      name: 'NoAdmitEntity',
      properties: [Property.create({ name: 'm', type: 'string' })],
    })
    const source = EventSource.create({
      name: 'noAdmitSource',
      entity: Log,
    })
    // Strip the default empty admit to simulate a hand-built broken source.
    ;(source as any).admit = undefined
    ;(source as any).guard = undefined

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Log], eventSources: [source] })
    await controller.setup(true)

    const result = await controller.dispatch(source, {})
    expect(result.error).toBeDefined()
    expect(String((result.error as Error).message)).toMatch(/admit/)

    await system.destroy()
  })
})
