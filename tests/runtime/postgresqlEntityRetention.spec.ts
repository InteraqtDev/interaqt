/**
 * Entity retention on real PostgreSQL.
 *
 * entityRetention.spec.ts covers the retention contracts on PGLite. This suite pins the
 * production driver for the cell where a retained entity is the source of a data-based
 * Transform: deleting the source rows produces a delete patch that requires SERIALIZABLE,
 * so maintainEntityRetention must upgrade each per-entity transaction on the pool client,
 * as dispatch does.
 *
 * Requires INTERAQT_POSTGRES_DATABASE. Uses an exclusive DB suffix because setup(true)
 * drops and recreates the database with FORCE.
 */
import { describe, expect, test } from 'vitest'
import {
  Controller,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Transform,
} from 'interaqt'
import { PostgreSQLDB } from '@drivers'

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const database = process.env.INTERAQT_POSTGRES_DATABASE
  ? `${process.env.INTERAQT_POSTGRES_DATABASE}_retention`
  : ''
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
}

describeIfPostgres('entity retention (PostgreSQL)', () => {
  test('ttl retention on a data-based Transform source removes expired source and derived rows', async () => {
    const Ticket = Entity.create({
      name: 'PgRetTfTicket',
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
      name: 'PgRetTfTicketView',
      properties: [Property.create({ name: 'label', type: 'string' })],
      computation: Transform.create({
        record: Ticket,
        attributeQuery: ['label'],
        callback: (ticket: { label: string }) => ({ label: ticket.label }),
      }),
    })
    const Later = Entity.create({
      name: 'PgRetTfLaterLog',
      properties: [
        Property.create({ name: 'label', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
    })

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Ticket, TicketView, Later],
      relations: [],
    })
    await controller.setup(true)

    try {
      const now = 1_700_000_000_000
      await system.storage.create('PgRetTfTicket', { label: 'expired-1', createdAt: now - 5000 })
      await system.storage.create('PgRetTfTicket', { label: 'expired-2', createdAt: now - 2000 })
      await system.storage.create('PgRetTfTicket', { label: 'fresh', createdAt: now - 500 })
      await system.storage.create('PgRetTfLaterLog', { label: 'expired', createdAt: now - 5000 })
      await system.storage.create('PgRetTfLaterLog', { label: 'fresh', createdAt: now })

      const labelsOf = async (entityName: string) =>
        ((await system.storage.find(entityName, undefined, undefined, ['label'])) as unknown as Array<{ label: string }>)
          .map(row => row.label)
          .sort()
      expect(await labelsOf('PgRetTfTicketView')).toEqual(['expired-1', 'expired-2', 'fresh'])

      const report = await controller.maintainEntityRetention({ now })
      expect(report).toEqual({
        entities: [
          { entityName: 'PgRetTfTicket', removed: 2 },
          { entityName: 'PgRetTfLaterLog', removed: 1 },
        ],
        removed: 3,
      })

      expect(await labelsOf('PgRetTfTicket')).toEqual(['fresh'])
      expect(await labelsOf('PgRetTfTicketView')).toEqual(['fresh'])
      expect(await labelsOf('PgRetTfLaterLog')).toEqual(['fresh'])
    } finally {
      await system.destroy()
    }
  }, 60000)
})
