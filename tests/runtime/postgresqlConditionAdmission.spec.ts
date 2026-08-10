/**
 * FR-01 — declarative Condition admission locks (true PostgreSQL concurrency).
 *
 * Contract: account balance B, two concurrent dispatch(Debit, amount=B).
 * With declarative locks + snapshot Condition (no hand-written FOR UPDATE / advisory
 * lock SQL in the app Condition), at most one debit succeeds and final balance >= 0.
 *
 * Requires INTERAQT_POSTGRES_DATABASE. Uses an exclusive DB suffix because setup(true)
 * drops and recreates the database with FORCE.
 */
import { describe, expect, test } from 'vitest'
import {
  Action,
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
  StateMachine,
  StateNode,
  StateTransfer,
} from 'interaqt'
import { PostgreSQLDB } from '@drivers'

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const database = process.env.INTERAQT_POSTGRES_DATABASE
  ? `${process.env.INTERAQT_POSTGRES_DATABASE}_cond_admission`
  : ''
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

describeIfPostgres('FR-01 Condition declarative admission locks (PostgreSQL)', () => {
  test(
    'concurrent debit of full balance: locks + snapshot ⇒ at most one success, balance >= 0',
    async () => {
      const B = 100

      const Debit = Interaction.create({
        name: 'PgCondAdmissionDebit',
        action: Action.create({ name: 'pgCondAdmissionDebit' }),
        payload: Payload.create({
          items: [
            PayloadItem.create({ name: 'accountId', type: 'string', required: true }),
            PayloadItem.create({ name: 'amount', type: 'number', required: true }),
          ],
        }),
        conditions: Condition.create({
          name: 'pgHasBalance',
          locks: [
            {
              recordName: 'PgCondAccount',
              id: (event: any) => event.payload.accountId,
              attributeQuery: ['id', 'balance'],
            },
          ],
          content: async function (this: Controller, event: any, admission: any) {
            // Prefer locked snapshot — no unlocked findOne, no dialect lock SQL.
            const account = admission.get('PgCondAccount', event.payload.accountId)
            // Widen the race window so a second concurrent dispatch reaches the
            // Condition while the first still holds the row lock (or has not committed).
            await delay(150)
            return !!account && Number(account.balance) >= Number(event.payload.amount)
          },
        }),
      })

      // Self-loop StateMachine: on each Debit event, balance := balance - amount.
      const idle = StateNode.create({
        name: 'idle',
        computeValue: (lastValue: unknown, mutationEvent: any) => {
          const prev = Number(lastValue ?? 0)
          const amount = Number(mutationEvent?.record?.payload?.amount ?? 0)
          return prev - amount
        },
      })

      const Account = Entity.create({
        name: 'PgCondAccount',
        properties: [
          Property.create({
            name: 'balance',
            type: 'number',
            // Initial balance is set via create payload; StateMachine owns subsequent values.
            computation: StateMachine.create({
              states: [idle],
              initialState: idle,
              transfers: [
                StateTransfer.create({
                  current: idle,
                  next: idle,
                  trigger: {
                    recordName: InteractionEventEntity.name,
                    type: 'create',
                    record: { interactionName: Debit.name },
                  },
                  computeTarget: (event: any) => ({
                    id: event.record?.payload?.accountId,
                  }),
                }),
              ],
            }),
          }),
        ],
      })

      const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
      system.conceptClass = KlassByName
      const controller = new Controller({
        system,
        entities: [Account],
        relations: [],
        eventSources: [Debit],
      })

      try {
        await controller.setup(true)

        const account = await system.storage.create('PgCondAccount', { balance: B })
        const user = { id: 'pg-cond-user' }
        const payload = { accountId: String(account.id), amount: B }

        const [r1, r2] = await Promise.all([
          controller.dispatch(Debit, { user, payload }),
          controller.dispatch(Debit, { user, payload }),
        ])

        const successes = [r1, r2].filter(r => !r.error).length
        const failures = [r1, r2].filter(r => !!r.error).length

        const final = await system.storage.findOne(
          'PgCondAccount',
          MatchExp.atom({ key: 'id', value: ['=', account.id] }),
          undefined,
          ['id', 'balance']
        )

        // Exactly one success is required. successes<=1 alone is too weak: an empty
        // AdmissionSnapshot (locks skipped entirely) makes both Conditions fail-closed
        // with successes=0 and balance still B, which is not the FR-01 debit contract.
        expect(successes).toBe(1)
        expect(failures).toBe(1)
        expect(Number(final.balance)).toBeGreaterThanOrEqual(0)
        expect(Number(final.balance)).toBe(B - successes * B)
        expect(Number(final.balance)).toBe(0)
      } finally {
        await system.destroy()
      }
    },
    60000
  )
})
