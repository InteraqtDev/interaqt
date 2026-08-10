/**
 * M-03 / FR-02(b): typed Condition rejection codes + read-only admission context.
 * Acceptance matrix from design §3.4.5.
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  BoolExp,
  Condition,
  Conditions,
  Controller,
  Entity,
  Interaction,
  InteractionEventEntity,
  InteractionGuardError,
  KlassByName,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  StateMachine,
  StateNode,
  StateTransfer,
} from 'interaqt'
import { SQLiteDB } from '@drivers'

describe('condition admission context and typed rejection (FR-02(b))', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new SQLiteDB())
    system.conceptClass = KlassByName
  })

  function userEntity() {
    return Entity.create({
      name: 'User',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
  }

  async function createController(entities: any[], eventSources: any[]) {
    controller = new Controller({
      system,
      entities,
      relations: [],
      eventSources,
    })
    await controller.setup(true)
    return controller
  }

  test('1: structured { allowed:false, code, details } surfaces result.error.code', async () => {
    const User = userEntity()
    const cond = Condition.create({
      name: 'needCredits',
      content: async () => ({
        allowed: false as const,
        code: 'NO_CREDITS',
        message: 'balance too low',
        details: { balance: 0, need: 10 },
      }),
    })
    const Ix = Interaction.create({
      name: 'Spend',
      action: Action.create({ name: 'spend' }),
      conditions: cond,
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect(result.error).toBeDefined()
    const err = result.error as InteractionGuardError
    expect(err).toBeInstanceOf(InteractionGuardError)
    expect(err.type).toBe('condition check failed')
    expect(err.checkType).toBe('condition')
    expect(err.code).toBe('NO_CREDITS')
    expect(err.details).toEqual({ balance: 0, need: 10 })
    expect(err.conditionName).toBe('needCredits')
    expect((err.error as any)?.data?.name).toBe('needCredits')
  })

  test('2: bare false → CONDITION_REJECTED', async () => {
    const User = userEntity()
    const cond = Condition.create({
      name: 'alwaysFalse',
      content: async () => false,
    })
    const Ix = Interaction.create({
      name: 'NoopFalse',
      action: Action.create({ name: 'noop' }),
      conditions: cond,
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect((result.error as InteractionGuardError).code).toBe('CONDITION_REJECTED')
  })

  test('3: throw with string code preserves code', async () => {
    const User = userEntity()
    const cond = Condition.create({
      name: 'throwCoded',
      content: async () => {
        const e = new Error('no credits') as Error & { code: string; details: unknown }
        e.code = 'NO_CREDITS'
        e.details = { reason: 'throw-path' }
        throw e
      },
    })
    const Ix = Interaction.create({
      name: 'ThrowSpend',
      action: Action.create({ name: 'spend' }),
      conditions: cond,
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    const err = result.error as InteractionGuardError
    expect(err.code).toBe('NO_CREDITS')
    expect(err.details).toEqual({ reason: 'throw-path' })
    expect((err.error as any)?.error).toContain('threw exception')
  })

  test('4: illegal return / { ok:false } → CONDITION_INVALID_RESULT', async () => {
    const User = userEntity()
    const illegal = Condition.create({
      name: 'illegalOk',
      content: async () => ({ ok: false, code: 'SHOULD_NOT' }) as any,
    })
    const IxIllegal = Interaction.create({
      name: 'IllegalOk',
      action: Action.create({ name: 'x' }),
      conditions: illegal,
    })
    const missingAllowed = Condition.create({
      name: 'missingAllowed',
      content: async () => ({ code: 'X' }) as any,
    })
    const IxMissing = Interaction.create({
      name: 'MissingAllowed',
      action: Action.create({ name: 'y' }),
      conditions: missingAllowed,
    })
    await createController([User], [IxIllegal, IxMissing])
    const user = await system.storage.create('User', { name: 'u' })

    const r1 = await controller.dispatch(IxIllegal, { user })
    expect((r1.error as InteractionGuardError).code).toBe('CONDITION_INVALID_RESULT')

    const r2 = await controller.dispatch(IxMissing, { user })
    expect((r2.error as InteractionGuardError).code).toBe('CONDITION_INVALID_RESULT')
  })

  test('5: reject.and(pass) → left code', async () => {
    const User = userEntity()
    const reject = Condition.create({
      name: 'leftReject',
      content: async () => ({ allowed: false as const, code: 'LEFT_CODE' }),
    })
    const pass = Condition.create({
      name: 'rightPass',
      content: async () => true,
    })
    const Ix = Interaction.create({
      name: 'AndLeft',
      action: Action.create({ name: 'a' }),
      conditions: Conditions.create({
        content: BoolExp.atom(reject).and(BoolExp.atom(pass)),
      }),
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect((result.error as InteractionGuardError).code).toBe('LEFT_CODE')
    expect((result.error as any).error.data.name).toBe('leftReject')
  })

  test('6: pass.and(reject) → right code', async () => {
    const User = userEntity()
    const pass = Condition.create({
      name: 'leftPass',
      content: async () => true,
    })
    const reject = Condition.create({
      name: 'rightReject',
      content: async () => ({ allowed: false as const, code: 'RIGHT_CODE', details: { n: 1 } }),
    })
    const Ix = Interaction.create({
      name: 'AndRight',
      action: Action.create({ name: 'a' }),
      conditions: Conditions.create({
        content: BoolExp.atom(pass).and(BoolExp.atom(reject)),
      }),
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    const err = result.error as InteractionGuardError
    expect(err.code).toBe('RIGHT_CODE')
    expect(err.details).toEqual({ n: 1 })
    expect((err.error as any).data.name).toBe('rightReject')
  })

  test('7: rejectA.or(rejectB) → B code (right EvaluateError)', async () => {
    const User = userEntity()
    const a = Condition.create({
      name: 'rejectA',
      content: async () => ({ allowed: false as const, code: 'CODE_A' }),
    })
    const b = Condition.create({
      name: 'rejectB',
      content: async () => ({ allowed: false as const, code: 'CODE_B' }),
    })
    const Ix = Interaction.create({
      name: 'OrBoth',
      action: Action.create({ name: 'a' }),
      conditions: Conditions.create({
        content: BoolExp.atom(a).or(BoolExp.atom(b)),
      }),
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect((result.error as InteractionGuardError).code).toBe('CODE_B')
    expect((result.error as any).error.data.name).toBe('rejectB')
  })

  test('8: not(structuredReject) still rejects with structured code (no flip)', async () => {
    const User = userEntity()
    const structured = Condition.create({
      name: 'structReject',
      content: async () => ({ allowed: false as const, code: 'HARD_DENY' }),
    })
    const Ix = Interaction.create({
      name: 'NotStruct',
      action: Action.create({ name: 'a' }),
      conditions: Conditions.create({
        content: BoolExp.atom(structured).not(),
      }),
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect(result.error).toBeDefined()
    expect((result.error as InteractionGuardError).code).toBe('HARD_DENY')
  })

  test('9: not(false) passes (boolean polarity)', async () => {
    const User = userEntity()
    const falsy = Condition.create({
      name: 'boolFalse',
      content: async () => false,
    })
    const Ix = Interaction.create({
      name: 'NotFalse',
      action: Action.create({ name: 'a' }),
      conditions: Conditions.create({
        content: BoolExp.atom(falsy).not(),
      }),
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect(result.error).toBeUndefined()
  })

  test('10: { allowed:true, context } → computation sees context.admission; payload unpolluted', async () => {
    const User = userEntity()

    let sawAdmissionFrozen: boolean | undefined
    let sawAdmissionAfterMutation: unknown

    const pending = StateNode.create({ name: 'pending' })
    const armed = StateNode.create({
      name: 'armed',
      computeValue: (_last: unknown, mutationEvent: any) => {
        // Official channel: event.record.context.admission (not payload mutation).
        const admission = mutationEvent?.record?.context?.admission
        // In-memory dispatch contract (§3.4.4): admission is frozen for computations.
        // Storage JSON round-trip does not preserve Object.isFrozen — assert here.
        sawAdmissionFrozen = Object.isFrozen(admission)
        if (admission && typeof admission === 'object') {
          try {
            ;(admission as { accountId?: string }).accountId = 'hacked-by-computation'
          } catch {
            // strict-mode freeze throws; either way value must remain original
          }
          sawAdmissionAfterMutation = (admission as { accountId?: string }).accountId
        }
        return admission?.accountId ?? 'missing'
      },
    })

    const Activate = Interaction.create({
      name: 'ActivateNote',
      action: Action.create({ name: 'activate' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'noteId', type: 'number', required: true }),
          PayloadItem.create({ name: 'marker', type: 'string', required: false }),
        ],
      }),
      conditions: Condition.create({
        name: 'resolveAccount',
        content: async (event: any) => {
          // Must not require mutating payload for downstream visibility.
          expect(event.payload.accountId).toBeUndefined()
          // cloneDispatchArgs must give Condition a distinct context object from the caller.
          if (event.context && typeof event.context === 'object') {
            event.context.mutatedByCondition = true
            event.context.requestId = 'rewritten-by-condition'
          }
          return {
            allowed: true as const,
            context: { accountId: 'acct-from-condition', tier: 'gold' },
          }
        },
      }),
    })

    const resolvedAccountId = Property.create({
      name: 'resolvedAccountId',
      type: 'string',
      computation: StateMachine.create({
        states: [pending, armed],
        initialState: pending,
        transfers: [
          StateTransfer.create({
            current: pending,
            next: armed,
            trigger: {
              recordName: InteractionEventEntity.name,
              type: 'create',
              record: { interactionName: Activate.name },
            },
            computeTarget: (event: any) => ({ id: event.record.payload.noteId }),
          }),
        ],
      }),
    })

    const Note = Entity.create({
      name: 'AdmNote',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        resolvedAccountId,
      ],
    })

    await createController([User, Note], [Activate])
    const user = await system.storage.create('User', { name: 'u' })
    const note = await system.storage.create('AdmNote', { title: 'n1' })

    const callerContext = { requestId: 'req-1', mutableBag: { x: 1 } }
    const result = await controller.dispatch(Activate, {
      user,
      payload: { noteId: note.id, marker: 'keep' },
      context: callerContext,
    })
    expect(result.error).toBeUndefined()

    // Caller context object must not be mutated in place (cloneDispatchArgs shallow-clones context).
    expect(callerContext).toEqual({ requestId: 'req-1', mutableBag: { x: 1 } })
    expect((callerContext as any).admission).toBeUndefined()
    expect((callerContext as any).mutatedByCondition).toBeUndefined()

    const stored = await system.storage.findOne(
      InteractionEventEntity.name,
      undefined,
      undefined,
      ['*']
    )
    expect(stored.payload).toEqual({ noteId: note.id, marker: 'keep' })
    expect(stored.payload.accountId).toBeUndefined()
    // Attempt context is the shallow clone (Condition may rewrite keys on the clone);
    // admission is merged under the reserved sub-key.
    expect(stored.context.admission).toEqual({ accountId: 'acct-from-condition', tier: 'gold' })
    // Freeze is an in-memory dispatch contract; assert via computation observation, not storage.
    expect(sawAdmissionFrozen).toBe(true)
    expect(sawAdmissionAfterMutation).toBe('acct-from-condition')

    const updated = await system.storage.findOne(
      'AdmNote',
      undefined,
      undefined,
      ['id', 'resolvedAccountId']
    )
    expect(updated.resolvedAccountId).toBe('acct-from-condition')
  })

  test('not(true) rejects with CONDITION_REJECTED', async () => {
    const User = userEntity()
    const always = Condition.create({
      name: 'alwaysTrue',
      content: async () => true,
    })
    const Ix = Interaction.create({
      name: 'NotTrue',
      action: Action.create({ name: 'a' }),
      conditions: Conditions.create({
        content: BoolExp.atom(always).not(),
      }),
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect((result.error as InteractionGuardError).code).toBe('CONDITION_REJECTED')
  })

  test('throw without code → CONDITION_THROWN', async () => {
    const User = userEntity()
    const cond = Condition.create({
      name: 'plainThrow',
      content: async () => {
        throw new Error('boom')
      },
    })
    const Ix = Interaction.create({
      name: 'PlainThrow',
      action: Action.create({ name: 'a' }),
      conditions: cond,
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect((result.error as InteractionGuardError).code).toBe('CONDITION_THROWN')
  })

  test('allowed:false without code → CONDITION_INVALID_RESULT', async () => {
    const User = userEntity()
    const cond = Condition.create({
      name: 'noCode',
      content: async () => ({ allowed: false }) as any,
    })
    const Ix = Interaction.create({
      name: 'NoCode',
      action: Action.create({ name: 'a' }),
      conditions: cond,
    })
    await createController([User], [Ix])
    const user = await system.storage.create('User', { name: 'u' })
    const result = await controller.dispatch(Ix, { user })
    expect((result.error as InteractionGuardError).code).toBe('CONDITION_INVALID_RESULT')
  })
})
