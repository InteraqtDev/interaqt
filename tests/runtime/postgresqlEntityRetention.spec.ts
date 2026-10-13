/**
 * Entity retention on real PostgreSQL.
 *
 * entityRetention.spec.ts covers the retention contracts on PGLite. This suite pins the
 * production driver for the cell where a retained entity is the source of a data-based
 * Transform: deleting the source rows produces a delete patch that requires SERIALIZABLE,
 * so maintainEntityRetention must upgrade each per-entity transaction on the pool client,
 * as dispatch does.
 *
 * The second cell covers the other consumer kinds that require SERIALIZABLE on the production
 * driver: a Custom computation with the default concurrency and a data-based Transform whose
 * source is a relation removed together with the retained rows. The third cell prunes a TTL
 * backlog larger than one batch, so several per-batch transactions commit at SERIALIZABLE.
 *
 * Requires INTERAQT_POSTGRES_DATABASE. Uses exclusive DB suffixes because setup(true)
 * drops and recreates the database with FORCE.
 */
import { describe, expect, test } from 'vitest'
import {
  Controller,
  Custom,
  Dictionary,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
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

  test('Custom (default concurrency) and a relation-sourced Transform converge after retention', async () => {
    const consumersDatabase = `${process.env.INTERAQT_POSTGRES_DATABASE}_retention_consumers`
    const Item = Entity.create({
      name: 'PgRetConsItem',
      properties: [
        Property.create({ name: 'amount', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
    })
    const Owner = Entity.create({
      name: 'PgRetConsOwner',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Link = Relation.create({
      name: 'PgRetConsLink', source: Item, sourceProperty: 'owner', target: Owner, targetProperty: 'items', type: 'n:1',
    })
    const LinkView = Entity.create({
      name: 'PgRetConsLinkView',
      properties: [Property.create({ name: 'tag', type: 'string' })],
      computation: Transform.create({ record: Link, attributeQuery: ['id'], callback: () => ({ tag: 'link' }) }),
    })
    const total = Dictionary.create({
      name: 'pgRetConsTotal',
      type: 'number',
      collection: false,
      computation: Custom.create({
        name: 'PgRetConsTotal',
        dataDeps: { rows: { type: 'records', source: Item, attributeQuery: ['amount'] } },
        compute: async (deps: { rows?: Array<{ amount: number }> }) => (deps.rows ?? []).reduce((sum, row) => sum + row.amount, 0),
        getInitialValue: () => 0,
      }),
    })

    const system = new MonoSystem(new PostgreSQLDB(consumersDatabase, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Item, Owner, LinkView],
      relations: [Link],
      dict: [total],
    })
    await controller.setup(true)

    try {
      const now = 1_700_000_000_000
      const owner = await system.storage.create('PgRetConsOwner', { name: 'owner' })
      await system.storage.create('PgRetConsItem', { amount: 10, createdAt: now - 5000, owner: { id: owner.id } })
      await system.storage.create('PgRetConsItem', { amount: 4, createdAt: now - 2000, owner: { id: owner.id } })
      await system.storage.create('PgRetConsItem', { amount: 3, createdAt: now - 500, owner: { id: owner.id } })
      const linkViews = async () => (await system.storage.find('PgRetConsLinkView', undefined, undefined, ['id'])).length
      expect(await linkViews()).toBe(3)
      expect(await system.storage.dict.get('pgRetConsTotal')).toBe(17)

      const report = await controller.maintainEntityRetention({ now })
      expect(report).toEqual({ entities: [{ entityName: 'PgRetConsItem', removed: 2 }], removed: 2 })
      expect(await linkViews()).toBe(1)
      expect(await system.storage.dict.get('pgRetConsTotal')).toBe(3)
    } finally {
      await system.destroy()
    }
  }, 60000)

  test('a TTL backlog larger than one batch on a Transform source is pruned in per-batch transactions', async () => {
    const backlogDatabase = `${process.env.INTERAQT_POSTGRES_DATABASE}_retention_backlog`
    const BATCH = 500 // ENTITY_RETENTION_DELETE_BATCH in Controller.ts
    const Ticket = Entity.create({
      name: 'PgRetBacklogTicket',
      properties: [
        Property.create({ name: 'seq', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' }),
      ],
      retention: {
        mode: 'ttl',
        ttl: { timestampProperty: 'createdAt', maxAgeMs: 1000 },
      },
    })
    const TicketView = Entity.create({
      name: 'PgRetBacklogTicketView',
      properties: [Property.create({ name: 'seq', type: 'number' })],
      computation: Transform.create({
        record: Ticket,
        attributeQuery: ['seq'],
        callback: (ticket: { seq: number }) => ({ seq: ticket.seq }),
      }),
    })
    const system = new MonoSystem(new PostgreSQLDB(backlogDatabase, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Ticket, TicketView], relations: [] })
    await controller.setup(true)

    try {
      const now = 1_700_000_000_000
      for (let seq = 0; seq < BATCH + 20; seq++) {
        await system.storage.create('PgRetBacklogTicket', { seq, createdAt: now - 5000 })
      }
      await system.storage.create('PgRetBacklogTicket', { seq: -1, createdAt: now })
      const seqsOf = async (name: string) =>
        ((await system.storage.find(name, undefined, undefined, ['seq'])) as unknown as Array<{ seq: number }>).map(row => row.seq)

      const report = await controller.maintainEntityRetention({ now })
      expect(report).toEqual({ entities: [{ entityName: 'PgRetBacklogTicket', removed: BATCH + 20 }], removed: BATCH + 20 })
      expect(await seqsOf('PgRetBacklogTicket')).toEqual([-1])
      expect(await seqsOf('PgRetBacklogTicketView')).toEqual([-1])
    } finally {
      await system.destroy()
    }
  }, 120000)
})
