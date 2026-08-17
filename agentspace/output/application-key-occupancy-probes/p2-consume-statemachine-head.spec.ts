/**
 * Probe P2 (design phase, docs/application-key-occupancy Task 1).
 *
 * Question: on current HEAD, can one-time consumption of an application key be
 * expressed with existing concepts only — a property-level StateMachine whose
 * computeTarget locates the row by application key via a storage lookup and
 * filters expiry itself (expiresAt is immutable, so the unlocked read is
 * race-free) — and what does each caller observe for:
 *   consumed (transition fired) / already-used / expired / no such key?
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
} from 'interaqt'
import { PGLiteDB } from '@drivers'

function createFixture(prefix: string) {
    const Ticket = Entity.create({
        name: `${prefix}Ticket`,
        properties: [
            Property.create({ name: 'ns', type: 'string' }),
            Property.create({ name: 'token', type: 'string' }),
            Property.create({ name: 'payload', type: 'string' }),
            Property.create({ name: 'expiresAt', type: 'number' }),
        ],
        constraints: [
            UniqueConstraint.create({
                name: `${prefix}Ticket_key_unique`,
                properties: ['ns', 'token'],
            }),
        ],
    })

    const Register = Interaction.create({
        name: `${prefix}Register`,
        action: Action.create({ name: `${prefix}register` }),
        payload: Payload.create({
            items: [
                PayloadItem.create({ name: 'ns', type: 'string' }),
                PayloadItem.create({ name: 'token', type: 'string' }),
                PayloadItem.create({ name: 'data', type: 'string' }),
                PayloadItem.create({ name: 'expiresAt', type: 'number' }),
            ],
        }),
    })

    const Consume = Interaction.create({
        name: `${prefix}Consume`,
        action: Action.create({ name: `${prefix}consume` }),
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
            if (event.interactionName === `${prefix}Register`) {
                return {
                    ns: event.payload.ns,
                    token: event.payload.token,
                    payload: event.payload.data,
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
                        record: { interactionName: `${prefix}Consume` },
                    },
                    current: unused,
                    next: used,
                    // Application-key location on HEAD: computeTarget does its own
                    // storage lookup (it is awaited and called with the controller
                    // as `this`), and filters expiry from the immutable expiresAt.
                    computeTarget: async function (this: Controller, event: any) {
                        const row = await this.system.storage.findOne(
                            `${prefix}Ticket`,
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

    return { Ticket, Register, Consume }
}

function updateEventsFor(effects: any[] | undefined, recordName: string) {
    return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'update')
}

describe('P2: one-time consumption expressed with HEAD concepts only', () => {
    test('consume/already-used/expired/no-key all resolve to stable observations', async () => {
        const { Ticket, Register, Consume } = createFixture('P2')
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Ticket],
            relations: [],
            eventSources: [Register, Consume],
        })
        await controller.setup(true)

        // (0) Consume before any registration: dispatch succeeds, no update event, no row.
        const early = await controller.dispatch(Consume, {
            user: { id: 'c0' }, payload: { ns: 'ns1', token: 'T-none' },
        })
        expect(early.error).toBeUndefined()
        expect(updateEventsFor(early.effects, Ticket.name)).toHaveLength(0)

        // (1) Register a live key, then consume it: transition fires, update event present.
        await controller.dispatch(Register, {
            user: { id: 'r1' },
            payload: { ns: 'ns1', token: 'T-live', data: 'secret-live', expiresAt: Date.now() + 3_600_000 },
        })
        const consume1 = await controller.dispatch(Consume, {
            user: { id: 'c1' }, payload: { ns: 'ns1', token: 'T-live' },
        })
        expect(consume1.error).toBeUndefined()
        const consume1Updates = updateEventsFor(consume1.effects, Ticket.name)
        expect(consume1Updates).toHaveLength(1)
        expect(consume1Updates[0].record?.status).toBe('used')

        const rowAfterConsume = await system.storage.findOne(
            Ticket.name,
            BoolExp.atom({ key: 'token', value: ['=', 'T-live'] }),
            undefined, ['*'])
        expect(rowAfterConsume.status).toBe('used')
        expect(rowAfterConsume.payload).toBe('secret-live')

        // (2) Second consume of the same key: dispatch succeeds, but silently no-ops.
        // The only distinguishing channels are absence of the update event plus the
        // (monotonic) stored state read back by a query.
        const consume2 = await controller.dispatch(Consume, {
            user: { id: 'c2' }, payload: { ns: 'ns1', token: 'T-live' },
        })
        expect(consume2.error).toBeUndefined()
        expect(updateEventsFor(consume2.effects, Ticket.name)).toHaveLength(0)
        const rowAfterSecond = await system.storage.findOne(
            Ticket.name,
            BoolExp.atom({ key: 'token', value: ['=', 'T-live'] }),
            undefined, ['status'])
        expect(rowAfterSecond.status).toBe('used')

        // (3) Expired key: transition never fires; row stays unused with expiresAt in
        // the past — the "expired" judgment is a stored-data comparison at query time.
        await controller.dispatch(Register, {
            user: { id: 'r2' },
            payload: { ns: 'ns1', token: 'T-old', data: 'secret-old', expiresAt: Date.now() - 1000 },
        })
        const consumeExpired = await controller.dispatch(Consume, {
            user: { id: 'c3' }, payload: { ns: 'ns1', token: 'T-old' },
        })
        expect(consumeExpired.error).toBeUndefined()
        expect(updateEventsFor(consumeExpired.effects, Ticket.name)).toHaveLength(0)
        const expiredRow = await system.storage.findOne(
            Ticket.name,
            BoolExp.atom({ key: 'token', value: ['=', 'T-old'] }),
            undefined, ['status', 'expiresAt'])
        expect(expiredRow.status).toBe('unused')
        expect(expiredRow.expiresAt).toBeLessThanOrEqual(Date.now())

        await system.destroy()
    })
})
