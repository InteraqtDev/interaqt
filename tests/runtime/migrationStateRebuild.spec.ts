import { describe, expect, it } from 'vitest'
import { Action, Controller, DBConsoleLogger, Dictionary, Entity, Interaction, InteractionEventEntity, MatchExp, MonoSystem, Payload, PayloadItem, Property, StateMachine, StateNode, StateTransfer } from 'interaqt'
import { PGLiteDB } from '@drivers'

// Framework-level, sequential migration reproduction. No production database,
// SDK, mocked state machine, or claim about distributed concurrency.
function model(stateName: string, defaultMode: string, scope: 'property' | 'global' = 'property') {
  const interaction = Interaction.create({
    name: 'SetMode', action: Action.create({ name: 'setMode' }),
    payload: Payload.create({ items: [PayloadItem.create({ name: 'mode', type: 'string', required: true })] }),
  })
  const state = StateNode.create({ name: stateName,
    computeValue: defaultMode === 'pro'
      ? function(lastValue: unknown, event: any) { return event?.record?.payload?.mode ?? lastValue ?? 'pro' }
      : function(lastValue: unknown, event: any) { return event?.record?.payload?.mode ?? lastValue ?? 'auto_balanced' },
  })
  const computation = StateMachine.create({ states: [state], initialState: state, transfers: [StateTransfer.create({
      current: state, next: state,
      trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: 'SetMode' } },
      computeTarget: (event: any) => ({ id: event.record.user.id }),
    })] })
  const user = Entity.create({ name: 'User', properties: scope === 'property'
    ? [Property.create({ name: 'mode', type: 'string', computation })] : [] })
  const dict = scope === 'global' ? [Dictionary.create({ name: 'mode', type: 'string', collection: false, computation })] : []
  return { user, interaction, dict }
}

function controller(db: PGLiteDB, definition: ReturnType<typeof model>) {
  return new Controller({ system: new MonoSystem(db), entities: [definition.user], relations: [],
    eventSources: [definition.interaction], dict: definition.dict, forceThrowDispatchError: true })
}

async function readState(c: Controller, id: string, scope: 'property' | 'global' = 'property') {
  if (scope === 'global') {
    const handle = [...c.scheduler.computationsHandles.values()].find((h: any) => h.dataContext?.type === 'global' && h.dataContext?.id?.name === 'mode') as any
    return { mode: await c.system.storage.dict.get('mode'), state: await handle.state.currentState.get() }
  }
  const row = await c.system.storage.findOne('User', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, ['*'])
  const handle = [...c.scheduler.computationsHandles.values()].find((h: any) => h.dataContext?.host?.name === 'User' && h.dataContext?.id?.name === 'mode') as any
  return { mode: row.mode, state: row[handle.state.currentState.key] }
}

describe('state-machine migration followed by a new user interaction', () => {
  it('fresh new-schema user can switch to quality', async () => {
    const db = new PGLiteDB(undefined, { logger: new DBConsoleLogger(0) })
    const definition = model('auto_mode', 'auto_balanced')
    const c = controller(db, definition)
    try {
      await c.setup(true)
      const user = await c.system.storage.create('User', {})
      await c.dispatch(definition.interaction, { user: { id: user.id }, payload: { mode: 'auto_quality' } })
      expect(await readState(c, user.id)).toEqual({ mode: 'auto_quality', state: 'auto_mode' })
    } finally { c.teardown(); await db.close() }
  })

  it.each((['property', 'global'] as const).flatMap(scope => [false, true].map(renamed => ({ scope, renamed }))))('migration preserves switching: $scope renamed=$renamed', async ({ scope, renamed }) => {
    const db = new PGLiteDB(undefined, { logger: new DBConsoleLogger(0) })
    const old = controller(db, model('legacy_mode', 'pro', scope))
    let next: Controller | undefined
    try {
      await old.setup(true)
      const user = await old.system.storage.create('User', {})
      expect(await readState(old, user.id, scope)).toEqual({ mode: 'pro', state: 'legacy_mode' })
      old.teardown()
      const definition = model(renamed ? 'auto_mode' : 'legacy_mode', 'auto_balanced', scope)
      next = controller(db, definition)
      const diff: any = await next.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true })
      diff.decisions = diff.requiredDecisions.map((r: any) => {
        if (r.kind === 'computation') return { ...r, decision: 'changed' }
        if (r.kind === 'event-rebuild-handler') return { ...r, decision: 'changed', handlerRef: 'convertMode' }
        throw new Error(`UNEXPECTED_DECISION:${r.kind}`)
      })
      diff.status = 'approved' // In-memory fixture only; not a deployment ticket.
      const plan = await next.migrate({ approvedDiff: diff, handlers: { eventRebuild: {
        convertMode: async ({ controller: c, record }: any) => {
          const previous = scope === 'global' ? await c.system.storage.dict.get('mode') : record.mode
          return previous === 'pro' ? 'auto_balanced' : previous
        },
      } } })
      await next.setup()
      const afterMigration = await readState(next, user.id, scope)
      expect(afterMigration.mode).toBe('auto_balanced')
      const response = await next.dispatch(definition.interaction, { user: { id: user.id }, payload: { mode: 'auto_quality' } })
      const afterSwitch = await readState(next, user.id, scope)
      expect(plan.rebuildPlan).toEqual(expect.arrayContaining([expect.objectContaining({ rebuildState: renamed, rebuildOutput: true })]))
      expect(response.error).toBeUndefined()
      expect(afterSwitch).toEqual({ mode: 'auto_quality', state: renamed ? 'auto_mode' : 'legacy_mode' })
    } finally { (next ?? old).teardown(); await db.close() }
  })
})
