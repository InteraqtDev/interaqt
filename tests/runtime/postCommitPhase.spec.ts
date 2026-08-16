/**
 * FR-SE-01 / FR-SE-02 / FR-SE-03: first-class stage P completion, create/postCommit
 * rerun primitives, and official composition on admit-dedup / idempotent replay.
 *
 * Contract: postCommitPhase is collected during the P loops (not inferred from the
 * last-write-wins sideEffects map); result.error remains stage A only; default
 * idempotent replay skips P and is notRun. Recoverable obligations (create mutation
 * side effects and postCommit) converge via rerun APIs; update/delete failures are
 * a remaining gap — create-rerun complete is not first-P complete.
 */
import { describe, expect, test } from 'vitest'
import {
    Action,
    Activity,
    ActivityManager,
    Condition,
    Controller,
    Entity,
    EntityInstance,
    EventSource,
    EventSourceInstance,
    Interaction,
    isPostCommitPhaseComplete,
    KlassByName,
    MatchExp,
    MonoSystem,
    PostCommitRerunError,
    Property,
    RecordMutationSideEffect,
    Relation,
    RelationInstance,
    SideEffectError,
    Transfer,
} from 'interaqt'
import { PGLiteDB } from '@drivers'

function eventEntity(name: string) {
    return Entity.create({
        name,
        properties: [Property.create({ name: 'kind', type: 'string' })],
    })
}

function ticketEntity(name: string) {
    return Entity.create({
        name,
        properties: [Property.create({ name: 'title', type: 'string' })],
    })
}

async function setupController(options: {
    entities?: EntityInstance[]
    relations?: RelationInstance[]
    eventSources: EventSourceInstance<any, any>[]
    recordMutationSideEffects?: RecordMutationSideEffect<unknown>[]
}) {
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: options.entities ?? [],
        relations: options.relations ?? [],
        eventSources: options.eventSources,
        recordMutationSideEffects: options.recordMutationSideEffects,
    })
    await controller.setup(true)
    return { system, controller }
}

describe('postCommitPhase (FR-SE-01 / M-01)', () => {
    test('empty stage P is complete and distinguishable from notRun', async () => {
        const source = EventSource.create({
            name: 'pcpEmptySource',
            entity: eventEntity('_PcpEmptyEvent_'),
            mapEventData: () => ({ kind: 'empty' }),
        })
        const { system, controller } = await setupController({ eventSources: [source] })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        expect(result.postCommitPhase).toEqual({ status: 'complete', failures: [] })
        expect(isPostCommitPhaseComplete(result)).toBe(true)
        expect(Object.keys(result).sort()).toEqual([
            'context',
            'data',
            'effects',
            'outcome',
            'postCommitPhase',
            'sideEffects',
        ])
        expect(result.outcome).toBeUndefined()

        await system.destroy()
    })

    test('postCommit failure is failed with __postCommit, does not set error, facts stay', async () => {
        const Ticket = ticketEntity('PcpPostCommitTicket')
        const source = EventSource.create({
            name: 'pcpPostCommitFail',
            entity: eventEntity('_PcpPostCommitFailEvent_'),
            mapEventData: () => ({ kind: 'pc' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpPostCommitTicket', { title: 'kept' })
            },
            postCommit: async () => {
                throw new Error('external postCommit failed')
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        expect(isPostCommitPhaseComplete(result)).toBe(false)
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures).toHaveLength(1)
        expect(result.postCommitPhase?.failures[0]?.name).toBe('__postCommit')
        expect(result.postCommitPhase?.failures[0]?.error).toBeInstanceOf(SideEffectError)
        expect((result.postCommitPhase?.failures[0]?.error as SideEffectError).sideEffectName).toBe(
            'pcpPostCommitFail',
        )
        expect(result.sideEffects?.__postCommit?.error).toBeInstanceOf(SideEffectError)
        expect(await system.storage.find('PcpPostCommitTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('mutation side-effect failure is failed, does not set error, facts stay', async () => {
        const Ticket = ticketEntity('PcpMutationTicket')
        const source = EventSource.create({
            name: 'pcpMutationFail',
            entity: eventEntity('_PcpMutationFailEvent_'),
            mapEventData: () => ({ kind: 'mut' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpMutationTicket', { title: 'kept' })
            },
        })
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpMirror',
            record: Ticket,
            content: async () => {
                throw new Error('mirror failed')
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures.map((f) => f.name)).toEqual(['pcpMirror'])
        expect(result.postCommitPhase?.failures[0]?.error).toBeInstanceOf(SideEffectError)
        expect(result.sideEffects?.pcpMirror?.error).toBeInstanceOf(SideEffectError)
        expect(await system.storage.find('PcpMutationTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('postCommit and mutation failures are both collected on one dispatch', async () => {
        const Ticket = ticketEntity('PcpBothTicket')
        const source = EventSource.create({
            name: 'pcpBothFail',
            entity: eventEntity('_PcpBothFailEvent_'),
            mapEventData: () => ({ kind: 'both' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpBothTicket', { title: 'kept' })
            },
            postCommit: async () => {
                throw new Error('postCommit failed')
            },
        })
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpBothMirror',
            record: Ticket,
            content: async () => {
                throw new Error('mirror failed')
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures.map((f) => f.name)).toEqual([
            '__postCommit',
            'pcpBothMirror',
        ])
        expect(isPostCommitPhaseComplete(result)).toBe(false)
        expect(await system.storage.find('PcpBothTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('same-name create failure then update success: map last-write-wins, failures keep create', async () => {
        const Ticket = ticketEntity('PcpOverwriteTicket')
        const source = EventSource.create({
            name: 'pcpOverwrite',
            entity: eventEntity('_PcpOverwriteEvent_'),
            mapEventData: () => ({ kind: 'overwrite' }),
            resolve: async function (this: Controller) {
                const row = await this.system.storage.create('PcpOverwriteTicket', { title: 'a' })
                await this.system.storage.update(
                    'PcpOverwriteTicket',
                    MatchExp.atom({ key: 'id', value: ['=', row.id] }),
                    { title: 'b' },
                )
                return row
            },
        })
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpSameName',
            record: Ticket,
            content: async (event) => {
                if (event.type === 'create') {
                    throw new Error('create failed')
                }
                return 'ok'
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        expect(result.sideEffects?.pcpSameName).toEqual({ result: 'ok' })
        expect(result.sideEffects?.pcpSameName?.error).toBeUndefined()
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures).toHaveLength(1)
        expect(result.postCommitPhase?.failures[0]?.name).toBe('pcpSameName')
        expect(result.postCommitPhase?.failures[0]?.error).toBeInstanceOf(SideEffectError)
        expect(isPostCommitPhaseComplete(result)).toBe(false)

        await system.destroy()
    })

    test('same-name create and update failures are both kept in failures', async () => {
        const Ticket = ticketEntity('PcpBothFailOverwriteTicket')
        const source = EventSource.create({
            name: 'pcpBothFailOverwrite',
            entity: eventEntity('_PcpBothFailOverwriteEvent_'),
            mapEventData: () => ({ kind: 'overwrite-both' }),
            resolve: async function (this: Controller) {
                const row = await this.system.storage.create('PcpBothFailOverwriteTicket', { title: 'a' })
                await this.system.storage.update(
                    'PcpBothFailOverwriteTicket',
                    MatchExp.atom({ key: 'id', value: ['=', row.id] }),
                    { title: 'b' },
                )
                return row
            },
        })
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpBothFailName',
            record: Ticket,
            content: async (event) => {
                throw new Error(`${event.type} failed`)
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        expect(result.sideEffects?.pcpBothFailName?.error).toBeInstanceOf(SideEffectError)
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures.map((f) => f.name)).toEqual([
            'pcpBothFailName',
            'pcpBothFailName',
        ])
        expect((result.postCommitPhase?.failures[0]?.error as SideEffectError).mutationType).toBe(
            'create',
        )
        expect((result.postCommitPhase?.failures[1]?.error as SideEffectError).mutationType).toBe(
            'update',
        )
        expect(isPostCommitPhaseComplete(result)).toBe(false)

        await system.destroy()
    })

    test('idempotent applied with P failure is failed, outcome stays applied, error stays absent', async () => {
        const Ticket = ticketEntity('PcpAppliedFailTicket')
        const source = EventSource.create({
            name: 'pcpAppliedFail',
            entity: eventEntity('_PcpAppliedFailEvent_'),
            mapEventData: () => ({ kind: 'applied-fail' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpAppliedFailTicket', { title: 'kept' })
            },
            postCommit: async () => {
                throw new Error('applied postCommit failed')
            },
            idempotency: {
                key: (args: { key?: string }) => args.key || null,
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, { key: 'k-applied-fail' })
        expect(result.error).toBeUndefined()
        expect(result.outcome).toBe('applied')
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures.map((f) => f.name)).toEqual(['__postCommit'])
        expect(isPostCommitPhaseComplete(result)).toBe(false)
        expect(await system.storage.find('PcpAppliedFailTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('idempotent replay is notRun and is not complete', async () => {
        let postCommitCount = 0
        const source = EventSource.create({
            name: 'pcpReplaySource',
            entity: eventEntity('_PcpReplayEvent_'),
            mapEventData: () => ({ kind: 'replay' }),
            postCommit: async () => {
                postCommitCount += 1
            },
            idempotency: {
                key: (args: { key?: string }) => args.key || null,
            },
        })
        const { system, controller } = await setupController({ eventSources: [source] })

        const first = await controller.dispatch(source, { key: 'k1' })
        expect(first.error).toBeUndefined()
        expect(first.outcome).toBe('applied')
        expect(first.postCommitPhase?.status).toBe('complete')
        expect(isPostCommitPhaseComplete(first)).toBe(true)
        expect(postCommitCount).toBe(1)

        const second = await controller.dispatch(source, { key: 'k1' })
        expect(second.error).toBeUndefined()
        expect(second.outcome).toBe('replayed')
        expect(second.postCommitPhase).toEqual({ status: 'notRun', failures: [] })
        expect(isPostCommitPhaseComplete(second)).toBe(false)
        expect(postCommitCount).toBe(1)

        await system.destroy()
    })

    test('stage A error is notRun, keeps error, and does not invent outcome', async () => {
        const denied = Interaction.create({
            name: 'pcpDenied',
            action: Action.create({ name: 'pcpDenied' }),
            conditions: Condition.create({ name: 'pcpDeny', content: async () => false }),
        })
        const User = Entity.create({
            name: 'PcpDeniedUser',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [User],
            relations: [],
            eventSources: [denied],
        })
        await controller.setup(true)
        const user = await system.storage.create('PcpDeniedUser', { name: 'u' })

        const result = await controller.dispatch(denied, { user })
        expect(result.error).toBeTruthy()
        expect(result.postCommitPhase).toEqual({ status: 'notRun', failures: [] })
        expect(isPostCommitPhaseComplete(result)).toBe(false)
        expect(Object.keys(result).sort()).toEqual([
            'context',
            'data',
            'effects',
            'error',
            'postCommitPhase',
            'sideEffects',
        ])
        expect('outcome' in result).toBe(false)

        await system.destroy()
    })

    test('business transaction: callback snapshot is notRun; same object is finalized after COMMIT', async () => {
        const Ticket = ticketEntity('PcpBtTicket')
        const source = EventSource.create({
            name: 'pcpBtSource',
            entity: eventEntity('_PcpBtEvent_'),
            mapEventData: () => ({ kind: 'bt' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpBtTicket', { title: 'bt' })
            },
            postCommit: async () => ({ fromPostCommit: true }),
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        let callbackSnapshot: { status?: string } | undefined
        const returned = await controller.runInBusinessTransaction({ name: 'pcp-bt' }, async () => {
            const r = await controller.dispatch(source, {})
            callbackSnapshot = {
                status: r.postCommitPhase?.status,
            }
            expect(r.sideEffects?.__postCommit).toBeUndefined()
            return r
        })

        expect(callbackSnapshot?.status).toBe('notRun')
        expect(returned.postCommitPhase?.status).toBe('complete')
        expect(isPostCommitPhaseComplete(returned)).toBe(true)
        expect(returned.context).toMatchObject({ fromPostCommit: true })
        expect(await system.storage.find('PcpBtTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('business transaction: P failure finalizes to failed after COMMIT and does not set error', async () => {
        const Ticket = ticketEntity('PcpBtFailTicket')
        const source = EventSource.create({
            name: 'pcpBtFailSource',
            entity: eventEntity('_PcpBtFailEvent_'),
            mapEventData: () => ({ kind: 'bt-fail' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpBtFailTicket', { title: 'bt' })
            },
            postCommit: async () => {
                throw new Error('bt postCommit failed')
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        let callbackStatus: string | undefined
        const returned = await controller.runInBusinessTransaction({ name: 'pcp-bt-fail' }, async () => {
            const r = await controller.dispatch(source, {})
            callbackStatus = r.postCommitPhase?.status
            return r
        })

        expect(callbackStatus).toBe('notRun')
        expect(returned.error).toBeUndefined()
        expect(returned.postCommitPhase?.status).toBe('failed')
        expect(returned.postCommitPhase?.failures.map((f) => f.name)).toEqual(['__postCommit'])
        expect(await system.storage.find('PcpBtFailTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('Activity-wrapped head postCommit failure is failed on DispatchResponse', async () => {
        const head = Interaction.create({
            name: 'pcpActHead',
            action: Action.create({ name: 'pcpActHead' }),
        })
        head.postCommit = async () => {
            throw new Error('activity postCommit failed')
        }
        const step2 = Interaction.create({
            name: 'pcpActStep2',
            action: Action.create({ name: 'pcpActStep2' }),
        })
        const activity = Activity.create({
            name: 'PcpAct',
            interactions: [head, step2],
            transfers: [Transfer.create({ name: 't', source: head, target: step2 })],
        })
        const User = Entity.create({
            name: 'PcpActUser',
            properties: [Property.create({ name: 'name', type: 'string' })],
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
        const user = await system.storage.create('PcpActUser', { name: 'u' })
        const headES = controller.findEventSourceByName('PcpAct:pcpActHead')!

        const result = await controller.dispatch(headES, { user })
        expect(result.error).toBeUndefined()
        expect(result.postCommitPhase?.status).toBe('failed')
        expect(result.postCommitPhase?.failures.map((f) => f.name)).toEqual(['__postCommit'])
        expect(isPostCommitPhaseComplete(result)).toBe(false)

        await system.destroy()
    })

    test('isPostCommitPhaseComplete is false for missing, notRun, and failed', () => {
        expect(isPostCommitPhaseComplete({})).toBe(false)
        expect(isPostCommitPhaseComplete({ postCommitPhase: { status: 'notRun', failures: [] } })).toBe(false)
        expect(
            isPostCommitPhaseComplete({
                postCommitPhase: { status: 'failed', failures: [{ name: '__postCommit', error: new Error('x') }] },
            }),
        ).toBe(false)
        expect(isPostCommitPhaseComplete({ postCommitPhase: { status: 'complete', failures: [] } })).toBe(true)
    })

    test('SideEffectError is a public interaqt export', async () => {
        const mod = await import('interaqt')
        expect('SideEffectError' in mod).toBe(true)
        expect(mod.SideEffectError).toBe(SideEffectError)
    })
})

const RELATION_ENDPOINT_QUERY = [
    '*',
    ['source', { attributeQuery: ['id'] }],
    ['target', { attributeQuery: ['id'] }],
] as const

async function assertRelationCreateRerunHasEndpoints(
    system: { storage: { findOne: (...args: any[]) => Promise<any> } },
    controller: Controller,
    recordName: string,
    id: string,
) {
    const starRow = await system.storage.findOne(
        recordName,
        MatchExp.atom({ key: 'id', value: ['=', id] }),
        undefined,
        ['*'],
    )
    expect(starRow).toBeTruthy()
    expect(starRow.source).toBeUndefined()
    expect(starRow.target).toBeUndefined()

    const endpointRow = await system.storage.findOne(
        recordName,
        MatchExp.atom({ key: 'id', value: ['=', id] }),
        undefined,
        RELATION_ENDPOINT_QUERY as unknown as string[],
    )
    expect(endpointRow.source?.id).toBeTruthy()
    expect(endpointRow.target?.id).toBeTruthy()

    const rerun = await controller.rerunCreateMutationSideEffects({ recordName, id })
    const reconstructed = rerun.effects[0]?.record as { source?: { id?: string }; target?: { id?: string } }
    expect(reconstructed?.source?.id).toBe(endpointRow.source.id)
    expect(reconstructed?.target?.id).toBe(endpointRow.target.id)
    return rerun
}

describe('postCommitPhase rerun (FR-SE-02 / M-02)', () => {
    test('entity reconstruct keys match findOne([*]) without first effects', async () => {
        const Ticket = ticketEntity('PcpRerunTicket')
        const source = EventSource.create({
            name: 'pcpRerunEntity',
            entity: eventEntity('_PcpRerunEntityEvent_'),
            mapEventData: () => ({ kind: 'entity' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunTicket', { title: 'keep' })
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string; title: string }
        const stored = await system.storage.findOne(
            'PcpRerunTicket',
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            ['*'],
        )
        const rerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunTicket',
            id: created.id,
        })
        expect(isPostCommitPhaseComplete(rerun)).toBe(true)
        expect(rerun.postCommitPhase.status).toBe('complete')
        expect('error' in rerun).toBe(false)
        expect('outcome' in rerun).toBe(false)
        const reconstructed = rerun.effects[0]?.record as Record<string, unknown>
        expect(Object.keys(reconstructed).sort()).toEqual(Object.keys(stored).sort())
        expect(reconstructed.title).toBe('keep')
        expect(await system.storage.find('PcpRerunTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('n:n base relation reconstructs endpoints; star query does not', async () => {
        const Src = Entity.create({
            name: 'PcpRerunNnSrc',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const Tgt = Entity.create({
            name: 'PcpRerunNnTgt',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const Rel = Relation.create({
            name: 'PcpRerunNnRel',
            source: Src,
            sourceProperty: 'targets',
            target: Tgt,
            targetProperty: 'sources',
            type: 'n:n',
        })
        const source = EventSource.create({
            name: 'pcpRerunNn',
            entity: eventEntity('_PcpRerunNnEvent_'),
            mapEventData: () => ({ kind: 'nn' }),
            resolve: async function (this: Controller) {
                const src = await this.system.storage.create('PcpRerunNnSrc', { name: 's' })
                const tgt = await this.system.storage.create('PcpRerunNnTgt', { name: 't' })
                return this.system.storage.create('PcpRerunNnRel', {
                    source: { id: src.id },
                    target: { id: tgt.id },
                })
            },
        })
        const { system, controller } = await setupController({
            entities: [Src, Tgt],
            relations: [Rel],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string }
        await assertRelationCreateRerunHasEndpoints(system, controller, 'PcpRerunNnRel', created.id)

        await system.destroy()
    })

    test('filtered relation reconstructs endpoints; star query does not', async () => {
        const Src = Entity.create({
            name: 'PcpRerunFrSrc',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const Tgt = Entity.create({
            name: 'PcpRerunFrTgt',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const BaseRel = Relation.create({
            name: 'PcpRerunFrBase',
            source: Src,
            sourceProperty: 'targets',
            target: Tgt,
            targetProperty: 'sources',
            type: 'n:n',
            properties: [Property.create({ name: 'relStatus', type: 'string' })],
        })
        const FilteredRel = Relation.create({
            name: 'PcpRerunFrActive',
            baseRelation: BaseRel,
            sourceProperty: 'activeTargets',
            targetProperty: 'activeSources',
            matchExpression: MatchExp.atom({ key: 'relStatus', value: ['=', 'active'] }),
        })
        const source = EventSource.create({
            name: 'pcpRerunFr',
            entity: eventEntity('_PcpRerunFrEvent_'),
            mapEventData: () => ({ kind: 'fr' }),
            resolve: async function (this: Controller) {
                const src = await this.system.storage.create('PcpRerunFrSrc', { name: 's' })
                const tgt = await this.system.storage.create('PcpRerunFrTgt', { name: 't' })
                return this.system.storage.create('PcpRerunFrBase', {
                    source: { id: src.id },
                    target: { id: tgt.id },
                    relStatus: 'active',
                })
            },
        })
        const { system, controller } = await setupController({
            entities: [Src, Tgt],
            relations: [BaseRel, FilteredRel],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string }
        const filteredRow = await system.storage.findOne(
            'PcpRerunFrActive',
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            RELATION_ENDPOINT_QUERY as unknown as string[],
        )
        expect(filteredRow).toBeTruthy()
        await assertRelationCreateRerunHasEndpoints(system, controller, 'PcpRerunFrActive', created.id)

        await system.destroy()
    })

    test('filtered entity reconstructs as star query, not relation endpoints', async () => {
        const Base = Entity.create({
            name: 'PcpRerunFeBase',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'active', type: 'boolean' }),
            ],
        })
        const Filtered = Entity.create({
            name: 'PcpRerunFeActive',
            baseEntity: Base,
            matchExpression: MatchExp.atom({ key: 'active', value: ['=', true] }),
        })
        const seen: string[] = []
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpRerunFeMirror',
            record: Filtered,
            content: async (event) => {
                if (event.type === 'create') {
                    seen.push(event.recordName)
                }
            },
        })
        const source = EventSource.create({
            name: 'pcpRerunFe',
            entity: eventEntity('_PcpRerunFeEvent_'),
            mapEventData: () => ({ kind: 'fe' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunFeBase', {
                    title: 'keep',
                    active: true,
                })
            },
        })
        const { system, controller } = await setupController({
            entities: [Base, Filtered],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string }
        const stored = await system.storage.findOne(
            'PcpRerunFeActive',
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            ['*'],
        )
        expect(stored).toBeTruthy()
        expect(stored.title).toBe('keep')
        expect(stored.source).toBeUndefined()
        expect(stored.target).toBeUndefined()

        seen.length = 0
        const rerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunFeActive',
            id: created.id,
        })
        expect(isPostCommitPhaseComplete(rerun)).toBe(true)
        const reconstructed = rerun.effects[0]?.record as Record<string, unknown>
        expect(Object.keys(reconstructed).sort()).toEqual(Object.keys(stored).sort())
        expect(reconstructed.title).toBe('keep')
        expect(reconstructed.source).toBeUndefined()
        expect(reconstructed.target).toBeUndefined()
        expect(seen).toEqual(['PcpRerunFeActive'])

        await system.destroy()
    })

    test('n:1 relation reconstructs endpoints; star query does not', async () => {
        const Src = Entity.create({
            name: 'PcpRerunN1Src',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const Tgt = Entity.create({
            name: 'PcpRerunN1Tgt',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const Rel = Relation.create({
            name: 'PcpRerunN1Rel',
            source: Src,
            sourceProperty: 'target',
            target: Tgt,
            targetProperty: 'sources',
            type: 'n:1',
        })
        const source = EventSource.create({
            name: 'pcpRerunN1',
            entity: eventEntity('_PcpRerunN1Event_'),
            mapEventData: () => ({ kind: 'n1' }),
            resolve: async function (this: Controller) {
                const tgt = await this.system.storage.create('PcpRerunN1Tgt', { name: 't' })
                const src = await this.system.storage.create('PcpRerunN1Src', {
                    name: 's',
                    target: { id: tgt.id },
                })
                return this.system.storage.findOne(
                    'PcpRerunN1Rel',
                    MatchExp.atom({ key: 'source.id', value: ['=', src.id] }),
                    undefined,
                    ['id'],
                )
            },
        })
        const { system, controller } = await setupController({
            entities: [Src, Tgt],
            relations: [Rel],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string }
        expect(created?.id).toBeTruthy()
        await assertRelationCreateRerunHasEndpoints(system, controller, 'PcpRerunN1Rel', created.id)

        await system.destroy()
    })

    test('merged abstract entity name loads the row and is not UNKNOWN_RECORD_NAME', async () => {
        const Dog = Entity.create({
            name: 'PcpRerunDog',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const Cat = Entity.create({
            name: 'PcpRerunCat',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const Pet = Entity.create({
            name: 'PcpRerunPet',
            inputEntities: [Dog, Cat],
        })
        let seenNames: string[] = []
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpRerunPetMirror',
            record: Pet,
            content: async (event) => {
                if (event.type === 'create') {
                    seenNames.push(event.recordName)
                }
            },
        })
        const source = EventSource.create({
            name: 'pcpRerunMerged',
            entity: eventEntity('_PcpRerunMergedEvent_'),
            mapEventData: () => ({ kind: 'merged' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunDog', { title: 'fido' })
            },
        })
        const { system, controller } = await setupController({
            entities: [Dog, Cat, Pet],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string }
        const abstractRow = await system.storage.findOne(
            'PcpRerunPet',
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            ['*'],
        )
        expect(abstractRow).toBeTruthy()
        expect(abstractRow.title).toBe('fido')

        seenNames = []
        const rerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunPet',
            id: created.id,
        })
        expect(rerun.postCommitPhase.status).toBe('complete')
        expect(seenNames).toEqual(['PcpRerunPet'])

        await system.destroy()
    })

    test('merged abstract relation name reconstructs endpoints and is not UNKNOWN_RECORD_NAME', async () => {
        const User = Entity.create({
            name: 'PcpRerunMrUser',
            properties: [Property.create({ name: 'name', type: 'string' })],
        })
        const Post = Entity.create({
            name: 'PcpRerunMrPost',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const Like = Relation.create({
            name: 'PcpRerunMrLike',
            source: User,
            sourceProperty: 'liked',
            target: Post,
            targetProperty: 'likedBy',
            type: 'n:n',
        })
        const Bookmark = Relation.create({
            name: 'PcpRerunMrBookmark',
            source: User,
            sourceProperty: 'bookmarked',
            target: Post,
            targetProperty: 'bookmarkedBy',
            type: 'n:n',
        })
        const Interact = Relation.create({
            name: 'PcpRerunMrInteract',
            sourceProperty: 'interacted',
            targetProperty: 'interactedBy',
            inputRelations: [Like, Bookmark],
        })
        const source = EventSource.create({
            name: 'pcpRerunMergedRel',
            entity: eventEntity('_PcpRerunMergedRelEvent_'),
            mapEventData: () => ({ kind: 'merged-rel' }),
            resolve: async function (this: Controller) {
                const user = await this.system.storage.create('PcpRerunMrUser', { name: 'u' })
                const post = await this.system.storage.create('PcpRerunMrPost', { title: 'p' })
                return this.system.storage.create('PcpRerunMrLike', {
                    source: { id: user.id },
                    target: { id: post.id },
                })
            },
        })
        const { system, controller } = await setupController({
            entities: [User, Post],
            relations: [Like, Bookmark, Interact],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        expect(result.error).toBeUndefined()
        const created = result.data as { id: string }
        const abstractRow = await system.storage.findOne(
            'PcpRerunMrInteract',
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            RELATION_ENDPOINT_QUERY as unknown as string[],
        )
        expect(abstractRow).toBeTruthy()
        await assertRelationCreateRerunHasEndpoints(system, controller, 'PcpRerunMrInteract', created.id)

        await system.destroy()
    })

    test('unknown record name is UNKNOWN_RECORD_NAME; declared name with no side effects is empty complete', async () => {
        const Ticket = ticketEntity('PcpRerunEmptyTicket')
        const source = EventSource.create({
            name: 'pcpRerunEmpty',
            entity: eventEntity('_PcpRerunEmptyEvent_'),
            mapEventData: () => ({ kind: 'empty' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunEmptyTicket', { title: 'row' })
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const result = await controller.dispatch(source, {})
        const created = result.data as { id: string }

        await expect(
            controller.rerunCreateMutationSideEffects({
                recordName: 'PcpRerunDoesNotExist',
                id: created.id,
            }),
        ).rejects.toMatchObject({ code: 'UNKNOWN_RECORD_NAME' })

        const empty = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunEmptyTicket',
            id: created.id,
        })
        expect(empty.postCommitPhase).toEqual({ status: 'complete', failures: [] })
        expect(isPostCommitPhaseComplete(empty)).toBe(true)

        await expect(
            controller.rerunCreateMutationSideEffects({
                recordName: 'PcpRerunEmptyTicket',
                id: '00000000-0000-7000-8000-000000000001',
            }),
        ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' })

        await expect(
            controller.rerunCreateMutationSideEffects({ recordName: '', id: created.id }),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' })

        await expect(
            controller.rerunCreateMutationSideEffects({
                recordName: 'PcpRerunEmptyTicket',
                id: '',
            }),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' })

        await system.destroy()
    })

    test('partial success then rerun: idempotent mirror absorbs; failed hook retries until complete', async () => {
        const Ticket = ticketEntity('PcpRerunPartialTicket')
        const Mirror = Entity.create({
            name: 'PcpRerunPartialMirror',
            properties: [Property.create({ name: 'ticketId', type: 'string' })],
        })
        let failOnce = true
        const mirrorEffect = RecordMutationSideEffect.create({
            name: 'pcpPartialMirror',
            record: Ticket,
            content: async function (this: Controller, event) {
                if (event.type !== 'create') return
                const existing = await this.system.storage.findOne(
                    'PcpRerunPartialMirror',
                    MatchExp.atom({ key: 'ticketId', value: ['=', event.record?.id] }),
                    undefined,
                    ['*'],
                )
                if (!existing) {
                    await this.system.storage.create('PcpRerunPartialMirror', {
                        ticketId: event.record?.id,
                    })
                }
            },
        })
        const flakyEffect = RecordMutationSideEffect.create({
            name: 'pcpPartialFlaky',
            record: Ticket,
            content: async (event) => {
                if (event.type !== 'create') return
                if (failOnce) {
                    failOnce = false
                    throw new Error('flaky io')
                }
                return 'ok'
            },
        })
        const source = EventSource.create({
            name: 'pcpRerunPartial',
            entity: eventEntity('_PcpRerunPartialEvent_'),
            mapEventData: () => ({ kind: 'partial' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunPartialTicket', { title: 'keep' })
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket, Mirror],
            eventSources: [source],
            recordMutationSideEffects: [mirrorEffect, flakyEffect],
        })

        const first = await controller.dispatch(source, {})
        expect(first.error).toBeUndefined()
        expect(first.postCommitPhase?.status).toBe('failed')
        expect(first.postCommitPhase?.failures.map((f) => f.name)).toEqual(['pcpPartialFlaky'])
        expect(await system.storage.find('PcpRerunPartialMirror', undefined, undefined, ['*'])).toHaveLength(1)
        const created = first.data as { id: string }

        const rerun1 = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunPartialTicket',
            id: created.id,
        })
        expect(isPostCommitPhaseComplete(rerun1)).toBe(true)
        expect(rerun1.sideEffects.pcpPartialFlaky).toEqual({ result: 'ok' })
        expect(await system.storage.find('PcpRerunPartialMirror', undefined, undefined, ['*'])).toHaveLength(1)

        const rerun2 = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunPartialTicket',
            id: created.id,
        })
        expect(isPostCommitPhaseComplete(rerun2)).toBe(true)
        expect(await system.storage.find('PcpRerunPartialMirror', undefined, undefined, ['*'])).toHaveLength(1)
        expect(await system.storage.find('PcpRerunPartialTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('create mutation rerun failure is failed, does not throw, facts stay', async () => {
        const Ticket = ticketEntity('PcpRerunMutFailTicket')
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpRerunMutFail',
            record: Ticket,
            content: async (event) => {
                if (event.type === 'create') {
                    throw new Error('mutation io still failing')
                }
            },
        })
        const source = EventSource.create({
            name: 'pcpRerunMutFailSource',
            entity: eventEntity('_PcpRerunMutFailEvent_'),
            mapEventData: () => ({ kind: 'mut-fail' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunMutFailTicket', { title: 'keep' })
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const first = await controller.dispatch(source, {})
        expect(first.error).toBeUndefined()
        expect(first.postCommitPhase?.status).toBe('failed')
        const created = first.data as { id: string }

        const rerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpRerunMutFailTicket',
            id: created.id,
        })
        expect(rerun.postCommitPhase.status).toBe('failed')
        expect(rerun.postCommitPhase.failures[0]?.name).toBe('pcpRerunMutFail')
        expect(rerun.postCommitPhase.failures[0]?.error).toBeInstanceOf(SideEffectError)
        expect(rerun.sideEffects.pcpRerunMutFail?.error).toBeInstanceOf(SideEffectError)
        expect(isPostCommitPhaseComplete(rerun)).toBe(false)
        expect('error' in rerun).toBe(false)
        expect(await system.storage.find('PcpRerunMutFailTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('rerunPostCommit uses S3 prior, not the stored row; failure shape matches dispatch', async () => {
        const Ticket = ticketEntity('PcpRerunPcTicket')
        const seen: unknown[] = []
        const source = EventSource.create({
            name: 'pcpRerunPostCommit',
            entity: eventEntity('_PcpRerunPcEvent_'),
            mapEventData: () => ({ kind: 'pc' }),
            resolve: async function (this: Controller) {
                const row = await this.system.storage.create('PcpRerunPcTicket', { title: 'keep' })
                return { wrapper: true, recordId: row.id }
            },
            postCommit: async (_args, { data }) => {
                seen.push(data)
                if (seen.length === 1) {
                    throw new Error('postCommit io failed')
                }
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const first = await controller.dispatch(source, {})
        expect(first.error).toBeUndefined()
        expect(first.postCommitPhase?.status).toBe('failed')
        expect(first.postCommitPhase?.failures[0]?.name).toBe('__postCommit')
        expect(seen[0]).toEqual({ wrapper: true, recordId: (first.data as { recordId: string }).recordId })

        const stored = await system.storage.findOne(
            'PcpRerunPcTicket',
            MatchExp.atom({ key: 'id', value: ['=', (first.data as { recordId: string }).recordId] }),
            undefined,
            ['*'],
        )
        expect(seen[0]).not.toEqual(stored)

        const rerun = await controller.rerunPostCommit(source, {}, {
            data: first.data,
            context: first.context,
        })
        expect(isPostCommitPhaseComplete(rerun)).toBe(true)
        expect(seen[1]).toEqual(seen[0])
        expect(seen[1]).not.toEqual(stored)
        expect(await system.storage.find('PcpRerunPcTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('rerunPostCommit failure is failed with __postCommit, does not throw, facts stay', async () => {
        const Ticket = ticketEntity('PcpRerunPcFailTicket')
        const source = EventSource.create({
            name: 'pcpRerunPcAlwaysFail',
            entity: eventEntity('_PcpRerunPcFailEvent_'),
            mapEventData: () => ({ kind: 'pc-fail' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunPcFailTicket', { title: 'keep' })
            },
            postCommit: async () => {
                throw new Error('still failing')
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const first = await controller.dispatch(source, {})
        const rerun = await controller.rerunPostCommit(source, {}, {
            data: first.data,
            context: first.context,
        })
        expect(rerun.postCommitPhase.status).toBe('failed')
        expect(rerun.postCommitPhase.failures[0]?.name).toBe('__postCommit')
        expect(rerun.postCommitPhase.failures[0]?.error).toBeInstanceOf(SideEffectError)
        expect(rerun.sideEffects.__postCommit?.error).toBeInstanceOf(SideEffectError)
        expect(isPostCommitPhaseComplete(rerun)).toBe(false)
        expect(await system.storage.find('PcpRerunPcFailTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('rerun APIs fail fast inside an active business transaction', async () => {
        const Ticket = ticketEntity('PcpRerunBtTicket')
        const source = EventSource.create({
            name: 'pcpRerunBt',
            entity: eventEntity('_PcpRerunBtEvent_'),
            mapEventData: () => ({ kind: 'bt' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpRerunBtTicket', { title: 'bt' })
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        await expect(
            controller.runInBusinessTransaction({ name: 'pcp-rerun-bt' }, async () => {
                const r = await controller.dispatch(source, {})
                await controller.rerunCreateMutationSideEffects({
                    recordName: 'PcpRerunBtTicket',
                    id: (r.data as { id: string }).id,
                })
            }),
        ).rejects.toMatchObject({ code: 'IN_BUSINESS_TRANSACTION' })

        await expect(
            controller.runInBusinessTransaction({ name: 'pcp-rerun-bt-pc' }, async () => {
                await controller.dispatch(source, {})
                await controller.rerunPostCommit(source, {}, {})
            }),
        ).rejects.toMatchObject({ code: 'IN_BUSINESS_TRANSACTION' })

        await system.destroy()
    })

    test('PostCommitRerunError is a public interaqt export', async () => {
        const mod = await import('interaqt')
        expect('PostCommitRerunError' in mod).toBe(true)
        expect(mod.PostCommitRerunError).toBe(PostCommitRerunError)
    })
})

describe('postCommitPhase composition (FR-SE-03 / M-03)', () => {
    test('idempotent replay skips P; official composition uses this-response S3 and create ids until those hooks complete', async () => {
        const Ticket = Entity.create({
            name: 'PcpReplayConvTicket',
            properties: [
                Property.create({ name: 'bizKey', type: 'string' }),
                Property.create({ name: 'title', type: 'string' }),
            ],
        })
        const Mirror = Entity.create({
            name: 'PcpReplayConvMirror',
            properties: [Property.create({ name: 'ticketId', type: 'string' })],
        })
        let postCommitCount = 0
        let mutationCount = 0
        let postCommitShouldFail = true
        let mutationShouldFail = true
        const source = EventSource.create({
            name: 'pcpReplayConv',
            entity: eventEntity('_PcpReplayConvEvent_'),
            mapEventData: () => ({ kind: 'replay-conv' }),
            resolve: async function (this: Controller, args: { key: string }) {
                const row = await this.system.storage.create('PcpReplayConvTicket', {
                    bizKey: args.key,
                    title: 'keep',
                })
                return { wrapper: true, recordId: row.id }
            },
            postCommit: async (_args, { data }) => {
                postCommitCount += 1
                if (postCommitShouldFail) {
                    throw new Error('replay-conv postCommit failed')
                }
                return { seen: data }
            },
            idempotency: {
                key: (args: { key?: string }) => args.key || null,
            },
        })
        const mirrorEffect = RecordMutationSideEffect.create({
            name: 'pcpReplayConvMirror',
            record: Ticket,
            content: async function (this: Controller, event) {
                if (event.type !== 'create') return
                mutationCount += 1
                if (mutationShouldFail) {
                    throw new Error('replay-conv mutation failed')
                }
                const existing = await this.system.storage.findOne(
                    'PcpReplayConvMirror',
                    MatchExp.atom({ key: 'ticketId', value: ['=', event.record?.id] }),
                    undefined,
                    ['*'],
                )
                if (!existing) {
                    await this.system.storage.create('PcpReplayConvMirror', {
                        ticketId: event.record?.id,
                    })
                }
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket, Mirror],
            eventSources: [source],
            recordMutationSideEffects: [mirrorEffect],
        })

        const args = { key: 'k-replay-conv' }
        const first = await controller.dispatch(source, args)
        expect(first.error).toBeUndefined()
        expect(first.outcome).toBe('applied')
        expect(first.postCommitPhase?.status).toBe('failed')
        expect(isPostCommitPhaseComplete(first)).toBe(false)
        expect(postCommitCount).toBe(1)
        expect(mutationCount).toBe(1)

        const second = await controller.dispatch(source, args)
        expect(second.error).toBeUndefined()
        expect(second.outcome).toBe('replayed')
        expect(second.postCommitPhase).toEqual({ status: 'notRun', failures: [] })
        expect(isPostCommitPhaseComplete(second)).toBe(false)
        expect(postCommitCount).toBe(1)
        expect(mutationCount).toBe(1)
        expect(second.data).toEqual(first.data)

        postCommitShouldFail = false
        mutationShouldFail = false
        const pcRerun = await controller.rerunPostCommit(source, args, {
            data: second.data,
            context: second.context,
        })
        expect(isPostCommitPhaseComplete(pcRerun)).toBe(true)
        expect(postCommitCount).toBe(2)

        const createdId = (second.data as { recordId: string }).recordId
        const mutRerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpReplayConvTicket',
            id: createdId,
        })
        expect(isPostCommitPhaseComplete(mutRerun)).toBe(true)
        expect(mutationCount).toBe(2)
        expect(await system.storage.find('PcpReplayConvMirror', undefined, undefined, ['*'])).toHaveLength(1)
        expect(await system.storage.find('PcpReplayConvTicket', undefined, undefined, ['*'])).toHaveLength(1)
        expect(isPostCommitPhaseComplete(first)).toBe(false)
        expect(first.postCommitPhase?.status).toBe('failed')

        await system.destroy()
    })

    test('admit duplicate is stage A error; lookup + create rerun converges; loaded row is not postCommit data', async () => {
        const Ticket = Entity.create({
            name: 'PcpAdmitConvTicket',
            properties: [
                Property.create({ name: 'bizKey', type: 'string' }),
                Property.create({ name: 'title', type: 'string' }),
            ],
        })
        const Mirror = Entity.create({
            name: 'PcpAdmitConvMirror',
            properties: [Property.create({ name: 'ticketId', type: 'string' })],
        })
        const seenPostCommitData: unknown[] = []
        let postCommitShouldFail = true
        let mutationShouldFail = true
        const source = EventSource.create({
            name: 'pcpAdmitConv',
            entity: eventEntity('_PcpAdmitConvEvent_'),
            mapEventData: () => ({ kind: 'admit-conv' }),
            admit: async function (this: Controller, args: { bizKey: string }) {
                const existing = await this.system.storage.findOne(
                    'PcpAdmitConvTicket',
                    MatchExp.atom({ key: 'bizKey', value: ['=', args.bizKey] }),
                    undefined,
                    ['*'],
                )
                if (existing) {
                    throw new Error(`DuplicateOrder:${args.bizKey}`)
                }
            },
            resolve: async function (this: Controller, args: { bizKey: string }) {
                const row = await this.system.storage.create('PcpAdmitConvTicket', {
                    bizKey: args.bizKey,
                    title: 'keep',
                })
                return { wrapper: true, recordId: row.id }
            },
            postCommit: async (_args, { data }) => {
                seenPostCommitData.push(data)
                if (postCommitShouldFail) {
                    throw new Error('admit-conv postCommit failed')
                }
            },
        })
        const mirrorEffect = RecordMutationSideEffect.create({
            name: 'pcpAdmitConvMirror',
            record: Ticket,
            content: async function (this: Controller, event) {
                if (event.type !== 'create') return
                if (mutationShouldFail) {
                    throw new Error('admit-conv mutation failed')
                }
                const existing = await this.system.storage.findOne(
                    'PcpAdmitConvMirror',
                    MatchExp.atom({ key: 'ticketId', value: ['=', event.record?.id] }),
                    undefined,
                    ['*'],
                )
                if (!existing) {
                    await this.system.storage.create('PcpAdmitConvMirror', {
                        ticketId: event.record?.id,
                    })
                }
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket, Mirror],
            eventSources: [source],
            recordMutationSideEffects: [mirrorEffect],
        })

        const args = { bizKey: 'order-1' }
        const first = await controller.dispatch(source, args)
        expect(first.error).toBeUndefined()
        expect(first.postCommitPhase?.status).toBe('failed')
        expect(isPostCommitPhaseComplete(first)).toBe(false)
        expect(seenPostCommitData[0]).toEqual({
            wrapper: true,
            recordId: (first.data as { recordId: string }).recordId,
        })

        const second = await controller.dispatch(source, args)
        expect(second.error).toBeDefined()
        expect(String(second.error)).toMatch(/DuplicateOrder:order-1/)
        expect(second.postCommitPhase?.status).toBe('notRun')
        expect(isPostCommitPhaseComplete(second)).toBe(false)
        expect(second.effects).toEqual([])
        expect(seenPostCommitData).toHaveLength(1)

        const found = await system.storage.findOne(
            'PcpAdmitConvTicket',
            MatchExp.atom({ key: 'bizKey', value: ['=', args.bizKey] }),
            undefined,
            ['*'],
        )
        expect(found).toBeTruthy()
        expect(found).not.toEqual(first.data)
        expect(found).not.toEqual(seenPostCommitData[0])

        postCommitShouldFail = false
        mutationShouldFail = false
        const mutRerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpAdmitConvTicket',
            id: found!.id,
        })
        expect(isPostCommitPhaseComplete(mutRerun)).toBe(true)
        expect(await system.storage.find('PcpAdmitConvMirror', undefined, undefined, ['*'])).toHaveLength(1)

        const pcRerun = await controller.rerunPostCommit(source, args, {
            data: first.data,
            context: first.context,
        })
        expect(isPostCommitPhaseComplete(pcRerun)).toBe(true)
        expect(seenPostCommitData[1]).toEqual(seenPostCommitData[0])
        expect(seenPostCommitData[1]).not.toEqual(found)
        expect(await system.storage.find('PcpAdmitConvTicket', undefined, undefined, ['*'])).toHaveLength(1)

        await system.destroy()
    })

    test('admit duplicate: args-reentrant postCommit may rerun with empty prior', async () => {
        const Ticket = Entity.create({
            name: 'PcpAdmitArgsTicket',
            properties: [
                Property.create({ name: 'bizKey', type: 'string' }),
                Property.create({ name: 'title', type: 'string' }),
            ],
        })
        const seenKeys: string[] = []
        let postCommitShouldFail = true
        const source = EventSource.create({
            name: 'pcpAdmitArgs',
            entity: eventEntity('_PcpAdmitArgsEvent_'),
            mapEventData: () => ({ kind: 'admit-args' }),
            admit: async function (this: Controller, args: { bizKey: string }) {
                const existing = await this.system.storage.findOne(
                    'PcpAdmitArgsTicket',
                    MatchExp.atom({ key: 'bizKey', value: ['=', args.bizKey] }),
                    undefined,
                    ['*'],
                )
                if (existing) {
                    throw new Error(`DuplicateOrder:${args.bizKey}`)
                }
            },
            resolve: async function (this: Controller, args: { bizKey: string }) {
                return this.system.storage.create('PcpAdmitArgsTicket', {
                    bizKey: args.bizKey,
                    title: 'keep',
                })
            },
            postCommit: async (args: { bizKey: string }) => {
                seenKeys.push(args.bizKey)
                if (postCommitShouldFail) {
                    throw new Error('admit-args postCommit failed')
                }
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        const args = { bizKey: 'order-args' }
        const first = await controller.dispatch(source, args)
        expect(first.postCommitPhase?.status).toBe('failed')

        const second = await controller.dispatch(source, args)
        expect(String(second.error)).toMatch(/DuplicateOrder:order-args/)
        expect(isPostCommitPhaseComplete(second)).toBe(false)

        postCommitShouldFail = false
        const pcRerun = await controller.rerunPostCommit(source, args, {})
        expect(isPostCommitPhaseComplete(pcRerun)).toBe(true)
        expect(seenKeys).toEqual(['order-args', 'order-args'])

        await system.destroy()
    })

    test('create rerun complete does not mean first P with update failure has converged', async () => {
        const Ticket = ticketEntity('PcpUpdateGapTicket')
        const source = EventSource.create({
            name: 'pcpUpdateGap',
            entity: eventEntity('_PcpUpdateGapEvent_'),
            mapEventData: () => ({ kind: 'update-gap' }),
            resolve: async function (this: Controller) {
                const row = await this.system.storage.create('PcpUpdateGapTicket', { title: 'a' })
                await this.system.storage.update(
                    'PcpUpdateGapTicket',
                    MatchExp.atom({ key: 'id', value: ['=', row.id] }),
                    { title: 'b' },
                )
                return row
            },
        })
        const sideEffect = RecordMutationSideEffect.create({
            name: 'pcpUpdateGapSe',
            record: Ticket,
            content: async (event) => {
                if (event.type === 'update') {
                    throw new Error('update side effect has no rerun primitive')
                }
                return 'create-ok'
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
            recordMutationSideEffects: [sideEffect],
        })

        const first = await controller.dispatch(source, {})
        expect(first.error).toBeUndefined()
        expect(first.postCommitPhase?.status).toBe('failed')
        expect(first.postCommitPhase?.failures.map((f) => f.name)).toEqual(['pcpUpdateGapSe'])
        expect((first.postCommitPhase?.failures[0]?.error as SideEffectError).mutationType).toBe(
            'update',
        )
        expect(isPostCommitPhaseComplete(first)).toBe(false)

        const created = first.data as { id: string }
        const createRerun = await controller.rerunCreateMutationSideEffects({
            recordName: 'PcpUpdateGapTicket',
            id: created.id,
        })
        expect(isPostCommitPhaseComplete(createRerun)).toBe(true)
        expect(createRerun.sideEffects.pcpUpdateGapSe).toEqual({ result: 'create-ok' })
        expect(first.postCommitPhase?.status).toBe('failed')
        expect(isPostCommitPhaseComplete(first)).toBe(false)

        await system.destroy()
    })

    test('business transaction: composition rerun runs after owner COMMIT, not inside the callback', async () => {
        const Ticket = ticketEntity('PcpBtComposeTicket')
        let postCommitShouldFail = true
        let postCommitCount = 0
        const source = EventSource.create({
            name: 'pcpBtCompose',
            entity: eventEntity('_PcpBtComposeEvent_'),
            mapEventData: () => ({ kind: 'bt-compose' }),
            resolve: async function (this: Controller) {
                return this.system.storage.create('PcpBtComposeTicket', { title: 'bt' })
            },
            postCommit: async () => {
                postCommitCount += 1
                if (postCommitShouldFail) {
                    throw new Error('bt-compose postCommit failed')
                }
            },
        })
        const { system, controller } = await setupController({
            entities: [Ticket],
            eventSources: [source],
        })

        let callbackStatus: string | undefined
        const returned = await controller.runInBusinessTransaction(
            { name: 'pcp-bt-compose' },
            async () => {
                const r = await controller.dispatch(source, {})
                callbackStatus = r.postCommitPhase?.status
                expect(postCommitCount).toBe(0)
                return r
            },
        )

        expect(callbackStatus).toBe('notRun')
        expect(returned.error).toBeUndefined()
        expect(returned.postCommitPhase?.status).toBe('failed')
        expect(postCommitCount).toBe(1)
        expect(isPostCommitPhaseComplete(returned)).toBe(false)

        postCommitShouldFail = false
        const pcRerun = await controller.rerunPostCommit(source, {}, {
            data: returned.data,
            context: returned.context,
        })
        expect(isPostCommitPhaseComplete(pcRerun)).toBe(true)
        expect(postCommitCount).toBe(2)
        expect(returned.postCommitPhase?.status).toBe('failed')

        await system.destroy()
    })
})

