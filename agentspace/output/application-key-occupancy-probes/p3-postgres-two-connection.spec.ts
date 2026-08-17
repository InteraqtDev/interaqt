/**
 * Probe P3 (design phase, docs/application-key-occupancy Task 1).
 *
 * Real-PostgreSQL evidence for the two mandated concurrency topologies:
 *   (a) two independent connections, two independent Controllers (cross-replica);
 *   (b) one Controller, concurrent dispatch over the connection pool.
 *
 * P3.1/P3.2 — first-writer registration through the current official path
 *             (event-track Transform + UniqueConstraint): what does the loser get?
 * P3.3     — one-time consumption via property StateMachine with app-key lookup
 *            in computeTarget: is the transition exactly-once across connections?
 */
import { describe, expect, test } from 'vitest'
import {
    Action,
    BoolExp,
    Controller,
    Entity,
    Interaction,
    InteractionEventEntity,
    KlassByName,
    MonoSystem,
    Payload,
    PayloadItem,
    Property,
    StateMachine,
    StateNode,
    StateTransfer,
    Transform,
    UniqueConstraint,
    findConstraintViolationError,
} from 'interaqt'
import { PostgreSQLDB } from '@drivers'

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const database = process.env.INTERAQT_POSTGRES_DATABASE ? `${process.env.INTERAQT_POSTGRES_DATABASE}_akop` : ''
const dbOptions = {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
}

// Single module-level fixture: both controllers must share identical declarations
// (setup(false) validates the model manifest against what setup(true) installed).
const Ticket = Entity.create({
    name: 'P3Ticket',
    properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
        Property.create({ name: 'heldBy', type: 'string' }),
        Property.create({ name: 'expiresAt', type: 'number' }),
    ],
    constraints: [
        UniqueConstraint.create({
            name: 'P3Ticket_key_unique',
            properties: ['ns', 'token'],
            violationCode: 'KEY_TAKEN',
        }),
    ],
})

const Register = Interaction.create({
    name: 'P3Register',
    action: Action.create({ name: 'p3register' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'ns', type: 'string' }),
            PayloadItem.create({ name: 'token', type: 'string' }),
            PayloadItem.create({ name: 'data', type: 'string' }),
            PayloadItem.create({ name: 'nonce', type: 'string' }),
            PayloadItem.create({ name: 'expiresAt', type: 'number' }),
        ],
    }),
})

const Consume = Interaction.create({
    name: 'P3Consume',
    action: Action.create({ name: 'p3consume' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'ns', type: 'string' }),
            PayloadItem.create({ name: 'token', type: 'string' }),
        ],
    }),
})

Ticket.computation = Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: function (event: any) {
        if (event.interactionName === 'P3Register') {
            return {
                ns: event.payload.ns,
                token: event.payload.token,
                payload: event.payload.data,
                heldBy: event.payload.nonce,
                expiresAt: event.payload.expiresAt,
            }
        }
        return null
    },
})

const unused = StateNode.create({ name: 'unused' })
const used = StateNode.create({ name: 'used' })
Ticket.properties.push(Property.create({
    name: 'status',
    type: 'string',
    computation: StateMachine.create({
        states: [unused, used],
        initialState: unused,
        transfers: [
            StateTransfer.create({
                trigger: {
                    recordName: InteractionEventEntity.name,
                    type: 'create',
                    record: { interactionName: 'P3Consume' },
                },
                current: unused,
                next: used,
                computeTarget: async function (this: Controller, event: any) {
                    const row = await this.system.storage.findOne(
                        'P3Ticket',
                        BoolExp.atom({ key: 'ns', value: ['=', event.record.payload.ns] })
                            .and({ key: 'token', value: ['=', event.record.payload.token] }),
                        undefined,
                        ['id', 'expiresAt'],
                    )
                    if (!row) return undefined
                    if (!(row.expiresAt > Date.now())) return undefined
                    return { id: row.id }
                },
            }),
        ],
    }),
}))

const entities = [Ticket]
const eventSources = [Register, Consume]

function createReplica() {
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities, relations: [], eventSources })
    return { system, controller }
}

function createEventsFor(effects: any[] | undefined, recordName: string) {
    return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'create')
}

function updateEventsFor(effects: any[] | undefined, recordName: string) {
    return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'update')
}

describeIfPostgres('P3: real-PostgreSQL concurrency on the current official path', () => {
    test('cross-replica and pooled concurrent registration + exactly-once consumption', async () => {
        const a = createReplica()
        await a.controller.setup(true)
        const b = createReplica()
        await b.controller.setup(false)

        try {
            // ---- P3.1 topology (a): two connections, two Controllers, same key ----
            const [ra, rb] = await Promise.all([
                a.controller.dispatch(Register, {
                    user: { id: 'ua' },
                    payload: { ns: 'camp', token: 'K-1', data: 'payload-A', nonce: 'nA', expiresAt: Date.now() + 3_600_000 },
                }),
                b.controller.dispatch(Register, {
                    user: { id: 'ub' },
                    payload: { ns: 'camp', token: 'K-1', data: 'payload-B', nonce: 'nB', expiresAt: Date.now() + 3_600_000 },
                }),
            ])

            const results = [ra, rb]
            const winners = results.filter(r => !r.error)
            const losers = results.filter(r => r.error)
            expect(winners).toHaveLength(1)
            expect(losers).toHaveLength(1)

            // Exactly one row, holding the winner's payload.
            const rows = await a.system.storage.find(
                Ticket.name,
                BoolExp.atom({ key: 'token', value: ['=', 'K-1'] }),
                undefined, ['*'])
            expect(rows).toHaveLength(1)
            const winnerCreate = createEventsFor(winners[0].effects, Ticket.name)
            expect(winnerCreate).toHaveLength(1)
            expect(rows[0].heldBy).toBe(winnerCreate[0].record?.heldBy)

            // Document the loser's observable shape.
            const loserViolation = findConstraintViolationError(losers[0].error)
            console.log('[P3.1] loser error name:', (losers[0].error as any)?.constructor?.name,
                '| mapped ConstraintViolationError:', loserViolation?.constraintName,
                '| context:', JSON.stringify(loserViolation?.context ?? null),
                '| message:', String((losers[0].error as any)?.message ?? losers[0].error).slice(0, 200))
            expect(losers[0].effects ?? []).toHaveLength(0)

            // The losing attempt left no trace: only the winner's interaction event exists.
            const regEvents = await a.system.storage.find(
                InteractionEventEntity.name, undefined, undefined, ['interactionName'])
            expect(regEvents.filter(e => e.interactionName === 'P3Register')).toHaveLength(1)

            // ---- P3.2 topology (b): one Controller, pooled concurrent dispatch ----
            const [pa, pb] = await Promise.all([
                a.controller.dispatch(Register, {
                    user: { id: 'u1' },
                    payload: { ns: 'camp', token: 'K-2', data: 'payload-1', nonce: 'n1', expiresAt: Date.now() + 3_600_000 },
                }),
                a.controller.dispatch(Register, {
                    user: { id: 'u2' },
                    payload: { ns: 'camp', token: 'K-2', data: 'payload-2', nonce: 'n2', expiresAt: Date.now() + 3_600_000 },
                }),
            ])
            const poolResults = [pa, pb]
            const poolWinners = poolResults.filter(r => !r.error)
            const poolLosers = poolResults.filter(r => r.error)
            expect(poolWinners).toHaveLength(1)
            expect(poolLosers).toHaveLength(1)
            const poolRows = await a.system.storage.find(
                Ticket.name,
                BoolExp.atom({ key: 'token', value: ['=', 'K-2'] }),
                undefined, ['*'])
            expect(poolRows).toHaveLength(1)
            const poolLoserViolation = findConstraintViolationError(poolLosers[0].error)
            console.log('[P3.2] loser error name:', (poolLosers[0].error as any)?.constructor?.name,
                '| mapped ConstraintViolationError:', poolLoserViolation?.constraintName,
                '| message:', String((poolLosers[0].error as any)?.message ?? poolLosers[0].error).slice(0, 200))

            // ---- P3.3 exactly-once consumption across connections ----
            const reg = await a.controller.dispatch(Register, {
                user: { id: 'u3' },
                payload: { ns: 'camp', token: 'K-3', data: 'payload-3', nonce: 'n3', expiresAt: Date.now() + 3_600_000 },
            })
            expect(reg.error).toBeUndefined()

            const [ca, cb] = await Promise.all([
                a.controller.dispatch(Consume, { user: { id: 'ca' }, payload: { ns: 'camp', token: 'K-3' } }),
                b.controller.dispatch(Consume, { user: { id: 'cb' }, payload: { ns: 'camp', token: 'K-3' } }),
            ])
            expect(ca.error).toBeUndefined()
            expect(cb.error).toBeUndefined()
            const updatesA = updateEventsFor(ca.effects, Ticket.name)
            const updatesB = updateEventsFor(cb.effects, Ticket.name)
            console.log('[P3.3] consume update events: A =', updatesA.length, ', B =', updatesB.length)
            expect(updatesA.length + updatesB.length).toBe(1)

            const consumed = await a.system.storage.findOne(
                Ticket.name,
                BoolExp.atom({ key: 'token', value: ['=', 'K-3'] }),
                undefined, ['status'])
            expect(consumed.status).toBe('used')
        } finally {
            await b.system.destroy().catch(() => {})
            await a.system.destroy().catch(() => {})
        }
    }, 120000)
})
