/**
 * GAP-1 M-01 — pin the code shapes taught by usage guide 21 (system event sources).
 *
 * Forms pinned here (design §3.1):
 * (a) Anonymous EventSource → Transform (eventDeps) → Entity.identity target:
 *     a same-key second dispatch observes the stored row (set-semantic create) —
 *     no error, no target create event, first-write payload retained. Insert vs
 *     observe is discriminated by DispatchResponse.effects plus a post-commit
 *     query on the natural key (the two-step method of usage guide 15).
 * (b) An Interaction without conditions dispatches successfully although args
 *     contain no `user` at all — Controller.dispatch has no framework-level user
 *     gate; `user` is only the TypeScript contract of InteractionEventArgs.
 * (c) Negative control: the only gate against anonymous dispatch is a
 *     user-declared Condition. A Condition reading event.user rejects the
 *     anonymous call with a typed InteractionGuardError and the transaction
 *     rolls back; the same interaction dispatched with a user succeeds.
 *
 * Companion shapes already pinned by existing suites (referenced, not repeated):
 * custom EventSource + mapEventData + Transform (eventSource.spec.ts), admit
 * rejection with rollback (eventSource.spec.ts), resolve (eventSource.spec.ts),
 * legacy `guard:` CreateArgs rejection (dispatchIdempotency.spec.ts).
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  Condition,
  Controller,
  Entity,
  EventSource,
  Interaction,
  InteractionEventEntity,
  InteractionGuardError,
  KlassByName,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  Transform,
  clearAllInstances,
} from 'interaqt'
import { MatchExp } from '@storage'
import { PGLiteDB } from '@drivers'

beforeEach(() => {
  clearAllInstances(
    Entity, Property, Transform, Interaction, Action, Condition,
    Payload, PayloadItem, EventSource,
  )
})

describe('system event source recipe — anonymous EventSource + Entity.identity', () => {
  test('(a) same-key provisioning observes the stored row; effects + key query discriminate insert vs observe', async () => {
    // Partner provisioning has no authenticated subject: the request arrives from
    // a partner portal callback, so the event source is anonymous by design and
    // all validation lives in admit.
    const ProvisionRequested = Entity.create({
      name: '_ProvisionRequested_',
      properties: [
        Property.create({ name: 'code', type: 'string' }),
        Property.create({ name: 'displayName', type: 'string' }),
        Property.create({ name: 'requestedBy', type: 'string' }),
      ],
    })

    type ProvisionPartnerArgs = {
      code: string
      displayName: string
      requestedBy: string
    }

    const provisionPartner = EventSource.create<ProvisionPartnerArgs>({
      name: 'provisionPartner',
      entity: ProvisionRequested,
      admit: async function(args) {
        if (typeof args.code !== 'string' || args.code.length === 0) {
          throw new Error('provisionPartner requires a non-empty code')
        }
      },
      mapEventData: (args) => ({
        code: args.code,
        displayName: args.displayName,
        requestedBy: args.requestedBy,
      }),
    })

    // Partner is keyed by its natural key `code`: a repeated provisioning request
    // for the same code converges onto the stored row instead of creating a
    // duplicate (set-semantic logical create).
    const Partner = Entity.create({
      name: 'RecipePartner',
      identity: { name: 'byCode', properties: ['code'] },
      properties: [
        Property.create({ name: 'code', type: 'string' }),
        Property.create({ name: 'displayName', type: 'string' }),
        Property.create({ name: 'requestedBy', type: 'string' }),
      ],
      computation: Transform.create({
        eventDeps: {
          Provision: { recordName: '_ProvisionRequested_', type: 'create' },
        },
        callback: function(mutationEvent: any) {
          if (mutationEvent.recordName !== '_ProvisionRequested_') return null
          return {
            code: mutationEvent.record.code,
            displayName: mutationEvent.record.displayName,
            requestedBy: mutationEvent.record.requestedBy,
          }
        },
      }),
    })

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Partner],
      relations: [],
      eventSources: [provisionPartner],
    })
    await controller.setup(true)

    // admit is the only gate: a request without a code is rejected and nothing is written.
    const rejected = await controller.dispatch(provisionPartner, {
      code: '',
      displayName: 'Invalid',
      requestedBy: 'alpha-channel',
    })
    expect(rejected.error).toBeDefined()
    expect((rejected.error as Error).message).toBe('provisionPartner requires a non-empty code')
    expect(await system.storage.find(Partner.name, undefined, undefined, ['*'])).toHaveLength(0)
    expect(await system.storage.find('_ProvisionRequested_', undefined, undefined, ['*'])).toHaveLength(0)

    // First dispatch for `acme`: insert — a RecipePartner create event is present.
    const first = await controller.dispatch(provisionPartner, {
      code: 'acme',
      displayName: 'Acme Inc',
      requestedBy: 'alpha-channel',
    })
    expect(first.error).toBeUndefined()
    expect(
      first.effects?.some((e: any) => e.recordName === Partner.name && e.type === 'create'),
    ).toBe(true)

    // Second dispatch for the same key: observe — no error, no create event for the
    // identity entity, and the stored row keeps the first write.
    const second = await controller.dispatch(provisionPartner, {
      code: 'acme',
      displayName: 'Acme Re-requested',
      requestedBy: 'beta-channel',
    })
    expect(second.error).toBeUndefined()
    expect(
      second.effects?.some((e: any) => e.recordName === Partner.name && e.type === 'create'),
    ).toBe(false)

    // A different key still inserts: convergence is per natural key.
    const third = await controller.dispatch(provisionPartner, {
      code: 'globex',
      displayName: 'Globex',
      requestedBy: 'gamma-channel',
    })
    expect(third.error).toBeUndefined()
    expect(
      third.effects?.some((e: any) => e.recordName === Partner.name && e.type === 'create'),
    ).toBe(true)

    // Step two of the discrimination: query by natural key after commit.
    const rows = await system.storage.find(Partner.name, undefined, undefined, ['*'])
    expect(rows).toHaveLength(2)

    const acme = await system.storage.findOne(
      Partner.name,
      MatchExp.atom({ key: 'code', value: ['=', 'acme'] }),
      undefined,
      ['*'],
    )
    expect(acme).toBeDefined()
    expect(acme!.displayName).toBe('Acme Inc')
    expect(acme!.requestedBy).toBe('alpha-channel')

    // The second dispatcher can tell it observed rather than inserted: the row for
    // its key exists but does not carry its own request attribution.
    expect(acme!.requestedBy).not.toBe('beta-channel')

    const globex = await system.storage.findOne(
      Partner.name,
      MatchExp.atom({ key: 'code', value: ['=', 'globex'] }),
      undefined,
      ['*'],
    )
    expect(globex).toBeDefined()
    expect(globex!.displayName).toBe('Globex')

    // Every accepted dispatch still records its own event row — observing the
    // partner row does not swallow the event itself.
    expect(await system.storage.find('_ProvisionRequested_', undefined, undefined, ['*'])).toHaveLength(3)

    await system.destroy()
  })
})

describe('system event source recipe — no framework-level user gate', () => {
  test('(b) Interaction without conditions dispatches with no user in args and still drives a Transform', async () => {
    // Signup is the canonical no-subject entry: nobody is authenticated yet.
    // `user` is required by the InteractionEventArgs TypeScript contract, but the
    // dispatch entry point performs no user validation — casting the args is the
    // honest way to state that in code.
    const RecordSignup = Interaction.create({
      name: 'RecordSignup',
      action: Action.create({ name: 'recordSignup' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'email', type: 'string', required: true }),
        ],
      }),
    })

    const SignupLog = Entity.create({
      name: 'RecipeSignupLog',
      properties: [
        Property.create({ name: 'email', type: 'string' }),
      ],
      computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['interactionName', 'payload'],
        callback: (event: any) => event.interactionName === RecordSignup.name ? {
          email: event.payload.email,
        } : null,
      }),
    })

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [SignupLog],
      relations: [],
      eventSources: [RecordSignup],
    })
    await controller.setup(true)

    const result = await controller.dispatch(RecordSignup, {
      payload: { email: 'alice@example.com' },
      // Intentionally no `user` key at all.
    } as any)
    expect(result.error).toBeUndefined()

    const logs = await system.storage.find(SignupLog.name, undefined, undefined, ['*'])
    expect(logs).toHaveLength(1)
    expect(logs[0].email).toBe('alice@example.com')

    // The interaction event row itself is committed with no user — nothing at the
    // framework layer rejected or filled in a subject.
    const events = await system.storage.find(
      InteractionEventEntity.name!,
      MatchExp.atom({ key: 'interactionName', value: ['=', RecordSignup.name] }),
      undefined,
      ['id', 'user'],
    )
    expect(events).toHaveLength(1)
    expect(events[0].user).toBeUndefined()

    await system.destroy()
  })

  test('(c) a Condition reading event.user is the only gate: anonymous dispatch is rejected, dispatch with user succeeds', async () => {
    const UpdateProfile = Interaction.create({
      name: 'UpdateProfile',
      action: Action.create({ name: 'updateProfile' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'nickname', type: 'string', required: true }),
        ],
      }),
      conditions: Condition.create({
        name: 'requireSignedIn',
        content: async function(event: any) {
          if (event.user?.id) return true
          return {
            allowed: false,
            code: 'AUTH_REQUIRED',
            message: 'UpdateProfile requires a signed-in user',
          }
        },
      }),
    })

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [],
      relations: [],
      eventSources: [UpdateProfile],
    })
    await controller.setup(true)

    // Anonymous call: rejected by the user-declared Condition with a typed error.
    const anonymous = await controller.dispatch(UpdateProfile, {
      payload: { nickname: 'Alice' },
      // Intentionally no `user` key at all.
    } as any)
    expect(anonymous.error).toBeInstanceOf(InteractionGuardError)
    expect((anonymous.error as InteractionGuardError).code).toBe('AUTH_REQUIRED')
    expect((anonymous.error as InteractionGuardError).conditionName).toBe('requireSignedIn')

    // The rejection rolled the transaction back: no interaction event was committed.
    const eventsAfterReject = await system.storage.find(
      InteractionEventEntity.name!,
      MatchExp.atom({ key: 'interactionName', value: ['=', UpdateProfile.name] }),
      undefined,
      ['id'],
    )
    expect(eventsAfterReject).toHaveLength(0)

    // Same interaction, now with a user: the Condition passes and the dispatch commits.
    const signedIn = await controller.dispatch(UpdateProfile, {
      user: { id: 'user-1' },
      payload: { nickname: 'Alice' },
    })
    expect(signedIn.error).toBeUndefined()

    const eventsAfterSuccess = await system.storage.find(
      InteractionEventEntity.name!,
      MatchExp.atom({ key: 'interactionName', value: ['=', UpdateProfile.name] }),
      undefined,
      ['id', 'user'],
    )
    expect(eventsAfterSuccess).toHaveLength(1)

    await system.destroy()
  })
})
