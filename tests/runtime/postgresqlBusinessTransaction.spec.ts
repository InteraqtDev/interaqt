/**
 * FR-02(a) — business transaction on real PostgreSQL.
 *
 * PGLite covers the full A–O matrix in businessTransaction.spec.ts. This suite
 * pins the transaction-bound-connection path (pool client + SAVEPOINT via scheme
 * routed through getQueryable) for the attempt/isolation/ownership cases that
 * the design marks as "真 PG 为准".
 *
 * Requires INTERAQT_POSTGRES_DATABASE. Uses exclusive DB suffixes because
 * setup(true) drops and recreates the database with FORCE.
 */
import { describe, expect, test } from 'vitest'
import {
  Action,
  BusinessTransactionBoundaryError,
  Condition,
  Controller,
  Entity,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  RecordMutationSideEffect,
  RequireSerializableRetry,
  RetryableWriteConflict,
  isBusinessTransactionBoundaryError,
  isRequireSerializableRetry,
} from 'interaqt'
import { PostgreSQLDB } from '@drivers'

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const baseDatabase = process.env.INTERAQT_POSTGRES_DATABASE
  ? `${process.env.INTERAQT_POSTGRES_DATABASE}_bt`
  : ''
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
}
const user = { id: 'pg-bt-user', name: 'pg-bt' }

function dbName(suffix: string) {
  return `${baseDatabase}_${suffix}`
}

describeIfPostgres('FR-02(a) runInBusinessTransaction (PostgreSQL)', () => {
  test(
    'A: create then dispatch — Condition sees uncommitted row; facts commit together',
    async () => {
      const Draft = Entity.create({
        name: 'PgBtDraftA',
        properties: [Property.create({ name: 'title', type: 'string' })],
      })
      const Activate = Interaction.create({
        name: 'PgBtActivateA',
        action: Action.create({ name: 'pgBtActivateA' }),
        payload: Payload.create({
          items: [PayloadItem.create({ name: 'draftId', type: 'string', required: true })],
        }),
        conditions: Condition.create({
          name: 'pgDraftExistsA',
          content: async function (this: Controller, event: any) {
            const row = await this.system.storage.findOne(
              'PgBtDraftA',
              MatchExp.atom({ key: 'id', value: ['=', event.payload.draftId] }),
              undefined,
              ['*']
            )
            return !!row
          },
        }),
      })

      const system = new MonoSystem(new PostgreSQLDB(dbName('a'), dbOptions))
      system.conceptClass = KlassByName
      const controller = new Controller({
        system,
        entities: [Draft],
        relations: [],
        eventSources: [Activate],
      })

      try {
        await controller.setup(true)
        expect(system.storage.getTransactionCapability().nestedStrategy).toBe('reuse')
        expect(system.storage.supportsSavepoint()).toBe(true)

        const result = await controller.runInBusinessTransaction({ name: 'pg-A' }, async () => {
          const draft = await system.storage.create('PgBtDraftA', { title: 't' })
          const dispatchResult = await controller.dispatch(Activate, {
            user,
            payload: { draftId: String(draft.id) },
          })
          expect(dispatchResult.error).toBeUndefined()
          return { draftId: draft.id }
        })

        const draft = await system.storage.findOne(
          'PgBtDraftA',
          MatchExp.atom({ key: 'id', value: ['=', result.draftId] }),
          undefined,
          ['*']
        )
        expect(draft?.title).toBe('t')
        const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ['*'])
        expect(events.some((e: any) => e.interactionName === 'PgBtActivateA')).toBe(true)
      } finally {
        await system.destroy()
      }
    },
    60000
  )

  test(
    'F: RetryableWriteConflict once then success → single final event / fact (SAVEPOINT)',
    async () => {
      let attempts = 0
      const Item = Entity.create({
        name: 'PgBtItemF',
        properties: [Property.create({ name: 'value', type: 'string' })],
      })
      const Add = Interaction.create({
        name: 'PgBtAddF',
        action: Action.create({ name: 'pgBtAddF' }),
        payload: Payload.create({
          items: [PayloadItem.create({ name: 'value', type: 'string', required: true })],
        }),
      })
      Add.resolve = async function (this: Controller, event: any) {
        attempts++
        if (attempts === 1) {
          await this.system.storage.create('PgBtItemF', { value: 'ghost-attempt-1' })
          throw new RetryableWriteConflict('pg bt inject write conflict')
        }
        await this.system.storage.create('PgBtItemF', { value: event.payload.value })
      }

      const system = new MonoSystem(new PostgreSQLDB(dbName('f'), dbOptions))
      system.conceptClass = KlassByName
      const controller = new Controller({
        system,
        entities: [Item],
        relations: [],
        eventSources: [Add],
      })

      try {
        await controller.setup(true)
        await controller.runInBusinessTransaction({ name: 'pg-F' }, async () => {
          const r = await controller.dispatch(Add, { user, payload: { value: 'final' } })
          expect(r.error).toBeUndefined()
        })
        expect(attempts).toBe(2)
        const items = await system.storage.find('PgBtItemF', undefined, undefined, ['*'])
        expect(items.map((i: any) => i.value).sort()).toEqual(['final'])
        const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ['*'])
        expect(events.filter((e: any) => e.interactionName === 'PgBtAddF')).toHaveLength(1)
      } finally {
        await system.destroy()
      }
    },
    60000
  )

  test(
    'K: BT + RC RequireSerializableRetry fails once, recognizable, no upgrade loop',
    async () => {
      let attempts = 0
      const Item = Entity.create({
        name: 'PgBtItemK',
        properties: [Property.create({ name: 'value', type: 'string' })],
      })
      const Add = Interaction.create({
        name: 'PgBtAddK',
        action: Action.create({ name: 'pgBtAddK' }),
      })
      Add.resolve = async function (this: Controller) {
        attempts++
        await this.system.storage.create('PgBtItemK', { value: `a${attempts}` })
        throw new RequireSerializableRetry('pg bt inject serializable')
      }

      const system = new MonoSystem(new PostgreSQLDB(dbName('k'), dbOptions))
      system.conceptClass = KlassByName
      const controller = new Controller({
        system,
        entities: [Item],
        relations: [],
        eventSources: [Add],
      })

      try {
        await controller.setup(true)
        let caught: unknown
        try {
          await controller.runInBusinessTransaction(
            { name: 'pg-K', isolation: 'READ COMMITTED' },
            async () => {
              await controller.dispatch(Add, { user })
            }
          )
        } catch (e) {
          caught = e
        }
        expect(isRequireSerializableRetry(caught)).toBe(true)
        expect(attempts).toBe(1)
        expect((caught as any)?.transactionAttempts).toBe(1)
        expect(await system.storage.find('PgBtItemK', undefined, undefined, ['*'])).toHaveLength(0)
      } finally {
        await system.destroy()
      }
    },
    60000
  )

  test(
    'L: runInBusinessTransaction inside storage.runInTransaction is rejected; fn not called',
    async () => {
      let fnCalls = 0
      const system = new MonoSystem(new PostgreSQLDB(dbName('l'), dbOptions))
      system.conceptClass = KlassByName
      const controller = new Controller({ system, entities: [], relations: [], eventSources: [] })

      try {
        await controller.setup(true)
        await expect(
          system.storage.runInTransaction({ name: 'outer-pg-L' }, async () => {
            await controller.runInBusinessTransaction({ name: 'pg-L' }, async () => {
              fnCalls++
              return 'nope'
            })
          })
        ).rejects.toSatisfy(
          (e: unknown) =>
            isBusinessTransactionBoundaryError(e) &&
            (e as BusinessTransactionBoundaryError).code === 'NESTED_STORAGE_TRANSACTION'
        )
        expect(fnCalls).toBe(0)
      } finally {
        await system.destroy()
      }
    },
    60000
  )

  test(
    'O: SE runs only after owned COMMIT (paired with rollback path)',
    async () => {
      const order: string[] = []
      let seRuns = 0
      const Item = Entity.create({
        name: 'PgBtItemO',
        properties: [Property.create({ name: 'value', type: 'string' })],
      })
      const Add = Interaction.create({
        name: 'PgBtAddO',
        action: Action.create({ name: 'pgBtAddO' }),
        payload: Payload.create({
          items: [PayloadItem.create({ name: 'value', type: 'string', required: true })],
        }),
      })
      Add.resolve = async function (this: Controller, event: any) {
        order.push('resolve')
        await this.system.storage.create('PgBtItemO', { value: event.payload.value })
      }
      Add.postCommit = async () => {
        order.push('postCommit')
        return { fromPostCommit: true }
      }
      const sideEffect = RecordMutationSideEffect.create({
        name: 'pgBtItemOSe',
        record: Item,
        content: async () => {
          seRuns++
          order.push('mutationSe')
        },
      })

      const system = new MonoSystem(new PostgreSQLDB(dbName('o'), dbOptions))
      system.conceptClass = KlassByName
      const controller = new Controller({
        system,
        entities: [Item],
        relations: [],
        eventSources: [Add],
        recordMutationSideEffects: [sideEffect],
      })

      try {
        await controller.setup(true)
        const btResult = await controller.runInBusinessTransaction({ name: 'pg-O' }, async () => {
          order.push('before-dispatch')
          const r = await controller.dispatch(Add, { user, payload: { value: 'o' } })
          order.push('after-dispatch')
          expect(seRuns).toBe(0)
          expect(order).not.toContain('postCommit')
          expect(order).not.toContain('mutationSe')
          return r
        })
        expect(seRuns).toBe(1)
        expect(order).toEqual([
          'before-dispatch',
          'resolve',
          'after-dispatch',
          'postCommit',
          'mutationSe',
        ])
        expect(btResult.error).toBeUndefined()
        expect(btResult.context).toMatchObject({ fromPostCommit: true })
      } finally {
        await system.destroy()
      }
    },
    60000
  )
})
