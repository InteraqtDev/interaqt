/**
 * Probe P1 (design phase, docs/application-key-occupancy Task 1).
 *
 * Question: on current HEAD, when an application registers an application key
 * (namespace + token) through the official declarative path
 * (event-track Transform + UniqueConstraint) and a second dispatch collides,
 * what exactly does the second caller observe?
 *
 * Also: is the internal dispatch-idempotency ledger visible as a normal record?
 */
import { describe, expect, test } from 'vitest'
import {
    Action,
    Controller,
    Entity,
    Interaction,
    InteractionEventEntity,
    KlassByName,
    MonoSystem,
    Payload,
    PayloadItem,
    Property,
    Transform,
    UniqueConstraint,
    findConstraintViolationError,
} from 'interaqt'
import { PGLiteDB } from '@drivers'

function createFixture(prefix: string) {
    const Ticket = Entity.create({
        name: `${prefix}Ticket`,
        properties: [
            Property.create({ name: 'ns', type: 'string' }),
            Property.create({ name: 'token', type: 'string' }),
            Property.create({ name: 'payload', type: 'string' }),
            Property.create({ name: 'heldBy', type: 'string' }),
            Property.create({ name: 'expiresAt', type: 'number' }),
        ],
        constraints: [
            UniqueConstraint.create({
                name: `${prefix}Ticket_key_unique`,
                properties: ['ns', 'token'],
                violationCode: 'KEY_TAKEN',
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
                PayloadItem.create({ name: 'nonce', type: 'string' }),
                PayloadItem.create({ name: 'expiresAt', type: 'number' }),
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
                    heldBy: event.payload.nonce,
                    expiresAt: event.payload.expiresAt,
                }
            }
            return null
        },
    })

    return { Ticket, Register }
}

describe('P1: unique-conflict result shape through dispatch on HEAD', () => {
    test('second registration of the same application key is a typed error with full rollback', async () => {
        const { Ticket, Register } = createFixture('P1')
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Ticket],
            relations: [],
            eventSources: [Register],
        })
        await controller.setup(true)

        const first = await controller.dispatch(Register, {
            user: { id: 'u1' },
            payload: { ns: 'campaign', token: 'T-1', data: 'secret-1', nonce: 'n1', expiresAt: Date.now() + 3_600_000 },
        })
        expect(first.error).toBeUndefined()
        const firstCreates = (first.effects ?? []).filter(e => e.recordName === Ticket.name && e.type === 'create')
        expect(firstCreates).toHaveLength(1)
        expect(firstCreates[0].record?.heldBy).toBe('n1')

        // Same key, different caller.
        const second = await controller.dispatch(Register, {
            user: { id: 'u2' },
            payload: { ns: 'campaign', token: 'T-1', data: 'secret-2', nonce: 'n2', expiresAt: Date.now() + 3_600_000 },
        })

        // (1) Result arrives on the error channel, not as a business result.
        expect(second.error).toBeTruthy()
        const violation = findConstraintViolationError(second.error)
        expect(violation?.constraintName).toBe('P1Ticket_key_unique')
        expect(violation?.context).toMatchObject({ code: 'KEY_TAKEN', kind: 'unique' })
        // (2) No effects; nothing observable about the existing row (no payload, no holder).
        expect(second.effects ?? []).toHaveLength(0)

        // (3) The loser's entire dispatch rolled back, including its interaction event:
        // the attempt itself left no trace in the data model.
        const events = await system.storage.find(
            InteractionEventEntity.name, undefined, undefined, ['interactionName'])
        expect(events.filter(e => e.interactionName === 'P1Register')).toHaveLength(1)

        // (4) The stored row is untouched (first writer's payload).
        const tickets = await system.storage.find(Ticket.name, undefined, undefined, ['*'])
        expect(tickets).toHaveLength(1)
        expect(tickets[0].heldBy).toBe('n1')
        expect(tickets[0].payload).toBe('secret-1')

        await system.destroy()
    })

    test('the dispatch idempotency ledger is not a queryable record', async () => {
        const { Ticket, Register } = createFixture('P1B')
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Ticket],
            relations: [],
            eventSources: [Register],
        })
        await controller.setup(true)

        await expect(
            system.storage.find('_DispatchIdempotency_', undefined, undefined, ['*'])
        ).rejects.toThrow()

        await system.destroy()
    })
})
