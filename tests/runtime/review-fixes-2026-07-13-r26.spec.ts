/**
 * r26 regressions:
 * F-1 — flashOut combined-steal link delete missing source/target endpoints
 * I-1 — Activity checkActivityState before fullGuard leaked currentState to unauthorized callers
 * I-2 — UniqueConstraint.create ignored nonEmpty / eachNameUnique
 * I-3 — BoolExpressionData.create ignored operator whitelist
 * I-4 — driver close() not idempotent (open-idempotency family sibling)
 */
import { describe, expect, test } from 'vitest'
import {
  Entity, Property, Relation, Controller, MonoSystem, KlassByName, MatchExp,
  StateMachine, StateNode, StateTransfer,
  Interaction, Action, Activity, Transfer, ActivityManager, ActivityStateError,
  Condition, UniqueConstraint, BoolExpressionData, BoolAtomData, Conditions,
} from 'interaqt'
import { DBSetup, EntityQueryHandle, EntityToTableMap } from '@storage'
import { PGLiteDB, SQLiteDB } from '@drivers'
import type { RecordMutationEvent } from '@runtime'

describe('r26 F-1 — flashOut combined-steal link delete endpoints', () => {
  test('create-steal link delete event carries source and target ids', async () => {
    const db = new PGLiteDB()
    await db.open()
    const User = Entity.create({
      name: 'User',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Profile = Entity.create({
      name: 'Profile',
      properties: [Property.create({ name: 'nickname', type: 'string' })],
    })
    const OwnProfile = Relation.create({
      source: User,
      sourceProperty: 'profile',
      target: Profile,
      targetProperty: 'owner',
      type: '1:1',
      isTargetReliance: true,
    })
    const setup = new DBSetup([User, Profile], [OwnProfile], db)
    await setup.createTables()
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

    const a = await handle.create('User', { name: 'A', profile: { nickname: 'p1' } })
    const aWithProfile = await handle.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', a.id] }),
      undefined,
      ['id', ['profile', { attributeQuery: ['id', 'nickname'] }]],
    )
    const profileId = aWithProfile.profile.id

    const events: RecordMutationEvent[] = []
    await handle.create('User', { name: 'B', profile: { id: profileId } }, events)

    const linkDeletes = events.filter((e) => e.type === 'delete' && e.recordName === OwnProfile.name)
    expect(linkDeletes.length).toBe(1)
    const del = linkDeletes[0]!
    expect(del.record!.source?.id).toBeDefined()
    expect(del.record!.target?.id).toBeDefined()
    const endpointIds = [del.record!.source!.id, del.record!.target!.id]
    expect(endpointIds).toContain(a.id)
    expect(endpointIds).toContain(profileId)

    await db.close()
  })

  test('create-steal link delete triggers StateMachine via computeTarget(source.id)', async () => {
    const idle = StateNode.create({ name: 'idle' })
    const gone = StateNode.create({ name: 'gone' })

    const User = Entity.create({
      name: 'User',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Profile = Entity.create({
      name: 'Profile',
      properties: [Property.create({ name: 'nickname', type: 'string' })],
    })
    const OwnProfile = Relation.create({
      source: User,
      sourceProperty: 'profile',
      target: Profile,
      targetProperty: 'owner',
      type: '1:1',
      isTargetReliance: true,
    })
    User.properties!.push(
      Property.create({
        name: 'linkStatus',
        type: 'string',
        computation: StateMachine.create({
          states: [idle, gone],
          initialState: idle,
          transfers: [
            StateTransfer.create({
              current: idle,
              next: gone,
              trigger: { recordName: OwnProfile.name!, type: 'delete' },
              computeTarget: (event: any) => {
                const userId = event.record?.source?.id
                if (userId === undefined) return undefined
                return { id: userId }
              },
            }),
          ],
        }),
      }),
    )

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [User, Profile],
      relations: [OwnProfile],
      eventSources: [],
    })
    await controller.setup(true)

    const a = await system.storage.create('User', { name: 'A', profile: { nickname: 'p1' } })
    const aRow = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', a.id] }),
      undefined,
      ['id', 'linkStatus', ['profile', { attributeQuery: ['id'] }]],
    )
    expect(aRow.linkStatus).toBe('idle')

    await system.storage.create('User', { name: 'B', profile: { id: aRow.profile.id } })

    const aAfter = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', a.id] }),
      undefined,
      ['id', 'linkStatus'],
    )
    expect(aAfter.linkStatus).toBe('gone')

    await system.destroy()
  })
})

describe('r26 I-1 — Activity guard before state (no currentState leak)', () => {
  test('unauthorized caller gets Condition error without currentState when step unavailable', async () => {
    const head = Interaction.create({ name: 'r26Head', action: Action.create({ name: 'r26Head' }) })
    const step2 = Interaction.create({
      name: 'r26Step2',
      action: Action.create({ name: 'r26Step2' }),
      conditions: Condition.create({
        name: 'adminOnly',
        content: async (event: any) => event.user?.role === 'admin',
      }),
    })
    const step3 = Interaction.create({
      name: 'r26Step3',
      action: Action.create({ name: 'r26Step3' }),
      conditions: Condition.create({
        name: 'adminOnly3',
        content: async (event: any) => event.user?.role === 'admin',
      }),
    })
    const activity = Activity.create({
      name: 'R26LeakActivity',
      interactions: [head, step2, step3],
      transfers: [
        Transfer.create({ name: 't1', source: head, target: step2 }),
        Transfer.create({ name: 't2', source: step2, target: step3 }),
      ],
    })

    const User = Entity.create({
      name: 'R26User',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'role', type: 'string' }),
      ],
    })
    const manager = new ActivityManager([activity])
    const out = manager.getOutput()
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [User, ...out.entities],
      relations: [...out.relations],
      eventSources: [...out.eventSources],
    })
    await controller.setup(true)

    const admin = await system.storage.create('R26User', { name: 'admin', role: 'admin' })
    const attacker = await system.storage.create('R26User', { name: 'attacker', role: 'user' })

    const headES = controller.findEventSourceByName('R26LeakActivity:r26Head')!
    const started = await controller.dispatch(headES, { user: admin })
    expect(started.error).toBeUndefined()
    const activityId = started.context!.activityId as string

    // Attacker probes step3 (not yet available) — before fix: ActivityStateError with currentState
    const step3ES = controller.findEventSourceByName('R26LeakActivity:r26Step3')!
    const probe = await controller.dispatch(step3ES, { user: attacker, activityId })
    expect(probe.error).toBeTruthy()
    expect(probe.error).not.toBeInstanceOf(ActivityStateError)
    expect((probe.error as any)?.currentState).toBeUndefined()

    // Authorized admin probing unavailable step3 still gets ActivityStateError with currentState (observability)
    const adminProbe = await controller.dispatch(step3ES, { user: admin, activityId })
    expect(adminProbe.error).toBeInstanceOf(ActivityStateError)
    expect((adminProbe.error as ActivityStateError).currentState).toBeDefined()

    await system.destroy()
  })
})

describe('r26 I-2 — UniqueConstraint declaration guards', () => {
  test('rejects empty properties at create()', () => {
    expect(() => UniqueConstraint.create({ name: 'empty', properties: [] })).toThrow(/properties/i)
  })

  test('rejects duplicate property names at create()', () => {
    expect(() => UniqueConstraint.create({ name: 'dup', properties: ['email', 'email'] })).toThrow(/unique|duplicate|properties/i)
  })
})

describe('r26 I-3 — BoolExpressionData operator whitelist', () => {
  test('rejects unknown operator at create()', () => {
    const left = BoolAtomData.create({ data: { key: 'a' } })
    const right = BoolAtomData.create({ data: { key: 'b' } })
    expect(() =>
      BoolExpressionData.create({ operator: 'xor' as any, left, right }),
    ).toThrow(/operator/i)
  })
})

describe('r26 F-1 siblings — endpoint completeness across event types and view track', () => {
  test('filtered relation view delete on create-steal carries endpoints', async () => {
    const db = new PGLiteDB()
    await db.open()
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
    const Profile = Entity.create({ name: 'Profile', properties: [Property.create({ name: 'nickname', type: 'string' })] })
    const OwnProfile = Relation.create({
      source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
      type: '1:1', isTargetReliance: true,
      properties: [Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })],
    })
    const ActiveOwn = Relation.create({
      name: 'ActiveOwnProfile',
      baseRelation: OwnProfile,
      sourceProperty: 'activeProfile',
      targetProperty: 'activeOwner',
      matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
    })
    const setup = new DBSetup([User, Profile], [OwnProfile, ActiveOwn], db)
    await setup.createTables()
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

    const a = await handle.create('User', { name: 'A', profile: { nickname: 'p1' } })
    const aRow = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined,
      ['id', ['profile', { attributeQuery: ['id'] }]])
    const events: RecordMutationEvent[] = []
    await handle.create('User', { name: 'B', profile: { id: aRow.profile.id } }, events)

    const viewDeletes = events.filter(e => e.type === 'delete' && e.recordName === 'ActiveOwnProfile')
    expect(viewDeletes.length).toBe(1)
    expect(viewDeletes[0]!.record!.source?.id).toBe(a.id)
    expect(viewDeletes[0]!.record!.target?.id).toBe(aRow.profile.id)
    // base delete alongside, also with endpoints (rule 6 canonical)
    const baseDeletes = events.filter(e => e.type === 'delete' && e.recordName === OwnProfile.name)
    expect(baseDeletes[0]!.record!.source?.id).toBe(a.id)
    await db.close()
  })

  test('in-place & link update event exposes endpoints (rule 7)', async () => {
    const db = new PGLiteDB()
    await db.open()
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
    const Team = Entity.create({ name: 'Team', properties: [Property.create({ name: 'title', type: 'string' })] })
    const Membership = Relation.create({
      source: User, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1',
      properties: [Property.create({ name: 'role', type: 'string' })],
    })
    const setup = new DBSetup([User, Team], [Membership], db)
    await setup.createTables()
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

    const team = await handle.create('Team', { title: 't1' })
    const user = await handle.create('User', { name: 'u1', team: { id: team.id, '&': { role: 'member' } } })

    const events: RecordMutationEvent[] = []
    // same-id in-place '&' update — the in-row branch that previously emitted endpoint-less oldRecord
    await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      { team: { id: team.id, '&': { role: 'admin' } } }, events)

    const linkUpdates = events.filter(e => e.type === 'update' && e.recordName === Membership.name)
    expect(linkUpdates.length).toBe(1)
    const merged = { ...linkUpdates[0]!.oldRecord, ...linkUpdates[0]!.record }
    expect((merged.source as any)?.id).toBe(user.id)
    expect((merged.target as any)?.id).toBe(team.id)
    expect(linkUpdates[0]!.keys).toContain('role')
    await db.close()
  })
})

describe('r26 I-4 — driver close() idempotency', () => {
  test('SQLite/PGLite close() can be called twice', async () => {
    const sqlite = new SQLiteDB()
    await sqlite.open()
    await sqlite.close()
    await expect(sqlite.close()).resolves.toBeUndefined()

    const pglite = new PGLiteDB()
    await pglite.open()
    await pglite.close()
    await expect(pglite.close()).resolves.toBeUndefined()
  })
})
