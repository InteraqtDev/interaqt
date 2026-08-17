/**
 * M-02 — concurrent first-writer registration for Entity.identity.
 * M-03 — one-time consume via status/consumedBy StateMachines and the §3.4 algebra.
 *
 * Real PostgreSQL only. PGLite / a single connection must not count as
 * completion evidence. Two mandated topologies:
 *   (a) two independent connections, two independent Controllers (cross-replica);
 *   (b) one Controller, concurrent dispatch over the connection pool.
 *
 * Official algebra (design §3.4): winner's effects contain the entity create
 * event whose holder is the winner nonce; loser dispatch has no error; both
 * interaction events commit; query of the row distinguishes occupied.
 * Consume: exactly one status transition; loser's effects have no update;
 * query distinguishes consumed / already-used / expired / absent.
 *
 * Control (design R-4): strip ON CONFLICT (naked INSERT). The same concurrent
 * topology must then fail the occupancy algebra (typed unique violation +
 * rollback of the loser's interaction event). The production method is restored
 * in `finally`.
 */
import { describe, expect, test } from 'vitest'
import {
    Action,
    BoolExp,
    Controller,
    Count,
    Dictionary,
    Entity,
    Interaction,
    InteractionEventEntity,
    KlassByName,
    MatchExp,
    MonoSystem,
    Payload,
    PayloadItem,
    Property,
    Relation,
    StateMachine,
    StateNode,
    StateTransfer,
    Transform,
    findConstraintViolationError,
} from 'interaqt'
import { PostgreSQLDB } from '@drivers'
import { SQLBuilder } from '@storage'

type PostgresInsert = typeof PostgreSQLDB.prototype.insert

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const database = process.env.INTERAQT_POSTGRES_DATABASE
    ? `${process.env.INTERAQT_POSTGRES_DATABASE}_appident`
    : ''
const dbOptions = {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
}

const RACE_ROUNDS = 10

type OccupancyModel = ReturnType<typeof createOccupancyModel>

function createOccupancyModel(suffix: string) {
    const Register = Interaction.create({
        name: `PgIdentRegister${suffix}`,
        action: Action.create({ name: `pgIdentRegister${suffix}` }),
        payload: Payload.create({
            items: [
                PayloadItem.create({ name: 'ns', type: 'string' }),
                PayloadItem.create({ name: 'token', type: 'string' }),
                PayloadItem.create({ name: 'data', type: 'string' }),
                PayloadItem.create({ name: 'nonce', type: 'string' }),
            ],
        }),
    })
    const Token = Entity.create({
        name: `PgIdentTok${suffix}`,
        identity: { name: 'byKey', properties: ['ns', 'token'] },
        properties: [
            Property.create({ name: 'ns', type: 'string' }),
            Property.create({ name: 'token', type: 'string' }),
            Property.create({ name: 'payload', type: 'string' }),
            Property.create({ name: 'holder', type: 'string' }),
        ],
        computation: Transform.create({
            record: InteractionEventEntity,
            attributeQuery: ['interactionName', 'payload'],
            callback: (event: any) => event.interactionName === Register.name ? {
                ns: event.payload.ns,
                token: event.payload.token,
                payload: event.payload.data,
                holder: event.payload.nonce,
            } : null,
        }),
    })
    const tokenCount = Dictionary.create({
        name: `PgIdentCount${suffix}`,
        type: 'number',
        collection: false,
        computation: Count.create({ record: Token }),
    })
    return { Token, Register, tokenCount }
}

type ConsumeModel = ReturnType<typeof createConsumeModel>

function createConsumeModel(suffix: string) {
    const tokenName = `PgIdentCTok${suffix}`
    const registerName = `PgIdentCReg${suffix}`
    const consumeName = `PgIdentCCons${suffix}`

    const Register = Interaction.create({
        name: registerName,
        action: Action.create({ name: `pgIdentCRegister${suffix}` }),
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
        name: consumeName,
        action: Action.create({ name: `pgIdentCConsume${suffix}` }),
        payload: Payload.create({
            items: [
                PayloadItem.create({ name: 'ns', type: 'string' }),
                PayloadItem.create({ name: 'token', type: 'string' }),
                PayloadItem.create({ name: 'nonce', type: 'string' }),
            ],
        }),
    })

    async function locateLiveRow(this: Controller, event: any) {
        const row = await this.system.storage.findOne(
            tokenName,
            BoolExp.atom({ key: 'ns', value: ['=', event.record.payload.ns] })
                .and({ key: 'token', value: ['=', event.record.payload.token] }),
            undefined,
            ['id', 'expiresAt'],
        )
        if (!row) return undefined
        if (!(row.expiresAt > Date.now())) return undefined
        return { id: row.id }
    }

    const unused = StateNode.create({ name: 'unused' })
    const used = StateNode.create({ name: 'used' })
    const vacant = StateNode.create({ name: 'vacant', computeValue: () => null })
    const claimed = StateNode.create({
        name: 'claimed',
        computeValue: (_last: unknown, event: any) => event.record.payload.nonce,
    })

    const Token = Entity.create({
        name: tokenName,
        identity: { name: 'byKey', properties: ['ns', 'token'] },
        properties: [
            Property.create({ name: 'ns', type: 'string' }),
            Property.create({ name: 'token', type: 'string' }),
            Property.create({ name: 'payload', type: 'string' }),
            Property.create({ name: 'holder', type: 'string' }),
            Property.create({ name: 'expiresAt', type: 'number' }),
            Property.create({
                name: 'status',
                type: 'string',
                computation: StateMachine.create({
                    states: [unused, used],
                    initialState: unused,
                    transfers: [
                        StateTransfer.create({
                            current: unused,
                            next: used,
                            trigger: {
                                recordName: InteractionEventEntity.name,
                                type: 'create',
                                record: { interactionName: consumeName },
                            },
                            computeTarget: locateLiveRow,
                        }),
                    ],
                }),
            }),
            Property.create({
                name: 'consumedBy',
                type: 'string',
                computation: StateMachine.create({
                    states: [vacant, claimed],
                    initialState: vacant,
                    transfers: [
                        StateTransfer.create({
                            current: vacant,
                            next: claimed,
                            trigger: {
                                recordName: InteractionEventEntity.name,
                                type: 'create',
                                record: { interactionName: consumeName },
                            },
                            computeTarget: locateLiveRow,
                        }),
                    ],
                }),
            }),
        ],
        computation: Transform.create({
            record: InteractionEventEntity,
            attributeQuery: ['interactionName', 'payload'],
            callback: (event: any) => event.interactionName === registerName ? {
                ns: event.payload.ns,
                token: event.payload.token,
                payload: event.payload.data,
                holder: event.payload.nonce,
                expiresAt: event.payload.expiresAt,
            } : null,
        }),
    })
    return { Token, Register, Consume }
}

function createReplica(model: OccupancyModel) {
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: [model.Token],
        relations: [],
        eventSources: [model.Register],
        dict: [model.tokenCount],
    })
    return { system, controller }
}

function createConsumeReplica(model: ConsumeModel) {
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: [model.Token],
        relations: [],
        eventSources: [model.Register, model.Consume],
    })
    return { system, controller }
}

function createEventsFor(effects: any[] | undefined, recordName: string) {
    return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'create')
}

async function dispatchRegister(
    controller: Controller,
    Register: OccupancyModel['Register'],
    payload: { ns: string, token: string, data: string, nonce: string },
) {
    return controller.dispatch(Register, {
        user: { id: `u-${payload.nonce}` },
        payload,
    })
}

async function assertOccupancyRace(args: {
    results: [{ error?: unknown, effects?: any[] }, { error?: unknown, effects?: any[] }]
    storage: InstanceType<typeof MonoSystem>['storage']
    replicaStorage?: InstanceType<typeof MonoSystem>['storage']
    tokenName: string
    registerName: string
    dictName: string
    ns: string
    token: string
    nonces: [string, string]
    payloads: [string, string]
    expectedCount: number
}) {
    const {
        results, storage, replicaStorage, tokenName, registerName, dictName,
        ns, token, nonces, payloads, expectedCount,
    } = args
    expect(results.map(r => r.error).filter(Boolean)).toEqual([])

    const row = await storage.findOne(
        tokenName,
        MatchExp.atom({ key: 'ns', value: ['=', ns] }).and({ key: 'token', value: ['=', token] }),
        undefined,
        ['*'],
    )
    expect(row).toBeTruthy()
    const winnerIndex = nonces.indexOf(row.holder) as 0 | 1
    expect(winnerIndex).toBeGreaterThanOrEqual(0)
    const loserIndex = (1 - winnerIndex) as 0 | 1

    expect(row.payload).toBe(payloads[winnerIndex])
    expect(row.holder).not.toBe(nonces[loserIndex])

    // Winner is the stored row; the create event must sit on that dispatch's
    // effects. Flattening both responses would miss a shared in-process report
    // channel that attributed the create to the other concurrent dispatch.
    expect(createEventsFor(results[winnerIndex].effects, tokenName)).toHaveLength(1)
    expect(createEventsFor(results[winnerIndex].effects, tokenName)[0].record?.holder).toBe(row.holder)
    expect(createEventsFor(results[loserIndex].effects, tokenName)).toHaveLength(0)

    if (replicaStorage) {
        const replicaRow = await replicaStorage.findOne(
            tokenName,
            MatchExp.atom({ key: 'ns', value: ['=', ns] }).and({ key: 'token', value: ['=', token] }),
            undefined,
            ['*'],
        )
        expect(replicaRow?.holder).toBe(row.holder)
        expect(replicaRow?.payload).toBe(row.payload)
    }

    const interactions = await storage.find(
        InteractionEventEntity.name!,
        MatchExp.atom({ key: 'interactionName', value: ['=', registerName] }),
        undefined,
        ['interactionName', 'payload'],
    )
    const forKey = interactions.filter((event: any) => event.payload?.token === token)
    expect(forKey).toHaveLength(2)

    expect(await storage.dict.get(dictName)).toBe(expectedCount)
}

/**
 * Hold both identity-table INSERTs in JavaScript until both dispatches have
 * reached `database.insert`. Without this, Promise.all can complete sequentially
 * and would not distinguish INSERT ... ON CONFLICT from find-then-insert.
 */
async function withIdentityTableInsertBarrier<T>(tableName: string, run: () => Promise<T>): Promise<T> {
    const original: PostgresInsert = PostgreSQLDB.prototype.insert
    let waiting = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const needle = `INSERT INTO "${tableName}"`
    PostgreSQLDB.prototype.insert = async function (this: InstanceType<typeof PostgreSQLDB>, sql: string, values: unknown[], name = '') {
        if (sql.includes(needle)) {
            waiting += 1
            if (waiting >= 2) release()
            await gate
        }
        return original.call(this, sql, values, name)
    }
    try {
        return await run()
    } finally {
        PostgreSQLDB.prototype.insert = original
    }
}

type PostgresQuery = typeof PostgreSQLDB.prototype.query

/**
 * Hold both consume-path row locks in JavaScript until two distinct transactions
 * have reached `atomic.lockRecord` on the identity table. The first FOR UPDATE
 * of each transaction waits; a second lock in the same transaction (consumedBy)
 * does not increment the arrival count. Without this, Promise.all can complete
 * sequentially and would not distinguish lock+re-read from a find-then-update.
 */
async function withIdentityRowLockBarrier<T>(tableName: string, run: () => Promise<T>): Promise<T> {
    const original: PostgresQuery = PostgreSQLDB.prototype.query
    const arrived = new Set<unknown>()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const fromNeedle = `FROM "${tableName}"`
    PostgreSQLDB.prototype.query = async function <T>(
        this: InstanceType<typeof PostgreSQLDB>,
        sql: string,
        where: unknown[] = [],
        name = '',
    ): Promise<T[]> {
        if (
            typeof sql === 'string'
            && sql.includes(fromNeedle)
            && /FOR UPDATE/i.test(sql)
            && String(name).startsWith('atomic lockRecord')
        ) {
            const client = (this as unknown as {
                transactionContext?: { getStore: () => { client?: unknown } | undefined }
            }).transactionContext?.getStore()?.client ?? this
            if (!arrived.has(client)) {
                arrived.add(client)
                if (arrived.size >= 2) release()
                await gate
            }
        }
        return original.call(this, sql, where, name) as Promise<T[]>
    }
    try {
        return await run()
    } finally {
        PostgreSQLDB.prototype.query = original
    }
}

async function withNakedIdentityInsert<T>(run: () => Promise<T>): Promise<T> {
    const original = SQLBuilder.prototype.buildInsertSQL
    // Drop onConflictDoNothingFields so the identity INSERT is a naked INSERT.
    SQLBuilder.prototype.buildInsertSQL = function (this: SQLBuilder, recordName, fieldAndValues) {
        return original.call(this, recordName, fieldAndValues)
    }
    try {
        return await run()
    } finally {
        SQLBuilder.prototype.buildInsertSQL = original
    }
}

describeIfPostgres('PostgreSQL application identity concurrent registration', () => {
    test('topology (a): two controllers, two connections — exactly one winner, loser occupies by query', async () => {
        const model = createOccupancyModel('A')
        const a = createReplica(model)
        await a.controller.setup(true)
        const b = createReplica(model)
        await b.controller.setup(false)
        try {
            for (let i = 0; i < RACE_ROUNDS; i++) {
                const token = `K-a-${i}`
                const nonces: [string, string] = [`nA-${i}`, `nB-${i}`]
                const payloads: [string, string] = [`payload-A-${i}`, `payload-B-${i}`]
                const [ra, rb] = await withIdentityTableInsertBarrier(model.Token.name, () => Promise.all([
                    dispatchRegister(a.controller, model.Register, {
                        ns: 'camp', token, data: payloads[0], nonce: nonces[0],
                    }),
                    dispatchRegister(b.controller, model.Register, {
                        ns: 'camp', token, data: payloads[1], nonce: nonces[1],
                    }),
                ]))
                await assertOccupancyRace({
                    results: [ra, rb],
                    storage: a.system.storage,
                    replicaStorage: b.system.storage,
                    tokenName: model.Token.name,
                    registerName: model.Register.name,
                    dictName: model.tokenCount.name,
                    ns: 'camp',
                    token,
                    nonces,
                    payloads,
                    expectedCount: i + 1,
                })
            }
            const rows = await a.system.storage.find(model.Token.name, undefined, undefined, ['id'])
            expect(rows).toHaveLength(RACE_ROUNDS)
        } finally {
            await b.system.destroy().catch(() => {})
            await a.system.destroy().catch(() => {})
        }
    }, 120000)

    test('topology (b): same controller connection-pool concurrent dispatch', async () => {
        const model = createOccupancyModel('B')
        const replica = createReplica(model)
        await replica.controller.setup(true)
        try {
            for (let i = 0; i < RACE_ROUNDS; i++) {
                const token = `K-b-${i}`
                const nonces: [string, string] = [`n1-${i}`, `n2-${i}`]
                const payloads: [string, string] = [`payload-1-${i}`, `payload-2-${i}`]
                const [pa, pb] = await withIdentityTableInsertBarrier(model.Token.name, () => Promise.all([
                    dispatchRegister(replica.controller, model.Register, {
                        ns: 'camp', token, data: payloads[0], nonce: nonces[0],
                    }),
                    dispatchRegister(replica.controller, model.Register, {
                        ns: 'camp', token, data: payloads[1], nonce: nonces[1],
                    }),
                ]))
                await assertOccupancyRace({
                    results: [pa, pb],
                    storage: replica.system.storage,
                    tokenName: model.Token.name,
                    registerName: model.Register.name,
                    dictName: model.tokenCount.name,
                    ns: 'camp',
                    token,
                    nonces,
                    payloads,
                    expectedCount: i + 1,
                })
            }
            const rows = await replica.system.storage.find(model.Token.name, undefined, undefined, ['id'])
            expect(rows).toHaveLength(RACE_ROUNDS)
        } finally {
            await replica.system.destroy().catch(() => {})
        }
    }, 120000)

    test('control: naked INSERT fails the occupancy algebra (loser error + rolled-back interaction)', async () => {
        const model = createOccupancyModel('Ctrl')
        const a = createReplica(model)
        await a.controller.setup(true)
        const b = createReplica(model)
        await b.controller.setup(false)
        try {
            await withNakedIdentityInsert(async () => {
                const token = 'K-ctrl'
                const [ra, rb] = await withIdentityTableInsertBarrier(model.Token.name, () => Promise.all([
                    dispatchRegister(a.controller, model.Register, {
                        ns: 'camp', token, data: 'payload-A', nonce: 'nA',
                    }),
                    dispatchRegister(b.controller, model.Register, {
                        ns: 'camp', token, data: 'payload-B', nonce: 'nB',
                    }),
                ]))
                const results = [ra, rb]
                const winners = results.filter(r => !r.error)
                const losers = results.filter(r => r.error)
                expect(winners).toHaveLength(1)
                expect(losers).toHaveLength(1)

                const violation = findConstraintViolationError(losers[0].error)
                expect(violation).toBeTruthy()
                expect(violation?.context?.rawCode).toBe('23505')
                expect(violation?.constraintName).toBeUndefined()
                expect(losers[0].effects ?? []).toHaveLength(0)

                const rows = await a.system.storage.find(
                    model.Token.name,
                    MatchExp.atom({ key: 'token', value: ['=', token] }),
                    undefined,
                    ['*'],
                )
                expect(rows).toHaveLength(1)
                expect(createEventsFor(winners[0].effects, model.Token.name)).toHaveLength(1)
                expect(rows[0].holder).toBe(createEventsFor(winners[0].effects, model.Token.name)[0].record?.holder)

                const interactions = await a.system.storage.find(
                    InteractionEventEntity.name!,
                    MatchExp.atom({ key: 'interactionName', value: ['=', model.Register.name] }),
                    undefined,
                    ['id'],
                )
                expect(interactions).toHaveLength(1)
                expect(await a.system.storage.dict.get(model.tokenCount.name)).toBe(1)
            })
        } finally {
            await b.system.destroy().catch(() => {})
            await a.system.destroy().catch(() => {})
        }
    }, 120000)
})

function entityUpdates(effects: any[] | undefined, recordName: string) {
    return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'update')
}

type ConsumeOutcome = 'consumed' | 'already-used' | 'expired' | 'absent' | 'error' | 'unexpected'

function classifyConsume(args: {
    error?: unknown
    effects?: any[]
    row: any | undefined
    recordName: string
    myNonce: string
    now: number
}): ConsumeOutcome {
    if (args.error) return 'error'
    const updates = entityUpdates(args.effects, args.recordName)
    if (updates.length > 0 && args.row?.status === 'used' && args.row?.consumedBy === args.myNonce) {
        return 'consumed'
    }
    if (updates.length === 0 && args.row?.status === 'used' && args.row?.consumedBy !== args.myNonce) {
        return 'already-used'
    }
    if (
        updates.length === 0
        && args.row?.status === 'unused'
        && args.row.expiresAt <= args.now
    ) {
        return 'expired'
    }
    if (updates.length === 0 && !args.row) return 'absent'
    return 'unexpected'
}

async function findToken(
    storage: InstanceType<typeof MonoSystem>['storage'],
    recordName: string,
    ns: string,
    token: string,
) {
    return storage.findOne(
        recordName,
        MatchExp.atom({ key: 'ns', value: ['=', ns] }).and({ key: 'token', value: ['=', token] }),
        undefined,
        ['*'],
    )
}

async function dispatchConsume(
    controller: Controller,
    Consume: ConsumeModel['Consume'],
    payload: { ns: string, token: string, nonce: string },
) {
    return controller.dispatch(Consume, {
        user: { id: `c-${payload.nonce}` },
        payload,
    })
}

async function assertConsumeRace(args: {
    results: [{ error?: unknown, effects?: any[] }, { error?: unknown, effects?: any[] }]
    storage: InstanceType<typeof MonoSystem>['storage']
    replicaStorage?: InstanceType<typeof MonoSystem>['storage']
    tokenName: string
    consumeName: string
    ns: string
    token: string
    nonces: [string, string]
    expectedPayload: string
}) {
    const {
        results, storage, replicaStorage, tokenName, consumeName,
        ns, token, nonces, expectedPayload,
    } = args
    expect(results.map(r => r.error).filter(Boolean)).toEqual([])

    const row = await findToken(storage, tokenName, ns, token)
    expect(row).toBeTruthy()
    expect(row.status).toBe('used')
    expect(row.payload).toBe(expectedPayload)
    const winnerIndex = nonces.indexOf(row.consumedBy) as 0 | 1
    expect(winnerIndex).toBeGreaterThanOrEqual(0)
    const loserIndex = (1 - winnerIndex) as 0 | 1

    expect(classifyConsume({
        error: results[winnerIndex].error,
        effects: results[winnerIndex].effects,
        row,
        recordName: tokenName,
        myNonce: nonces[winnerIndex],
        now: Date.now(),
    })).toBe('consumed')
    expect(classifyConsume({
        error: results[loserIndex].error,
        effects: results[loserIndex].effects,
        row,
        recordName: tokenName,
        myNonce: nonces[loserIndex],
        now: Date.now(),
    })).toBe('already-used')
    const winnerUpdates = entityUpdates(results[winnerIndex].effects, tokenName)
    expect(winnerUpdates.some((event: any) => event.keys?.includes('status') && event.record?.status === 'used')).toBe(true)
    expect(winnerUpdates.some((event: any) => event.keys?.includes('consumedBy') && event.record?.consumedBy === nonces[winnerIndex])).toBe(true)
    expect(entityUpdates(results[loserIndex].effects, tokenName)).toHaveLength(0)

    if (replicaStorage) {
        const replicaRow = await findToken(replicaStorage, tokenName, ns, token)
        expect(replicaRow?.status).toBe('used')
        expect(replicaRow?.consumedBy).toBe(row.consumedBy)
        expect(replicaRow?.payload).toBe(expectedPayload)
    }

    const interactions = await storage.find(
        InteractionEventEntity.name!,
        MatchExp.atom({ key: 'interactionName', value: ['=', consumeName] }),
        undefined,
        ['interactionName', 'payload'],
    )
    const forKey = interactions.filter((event: any) => event.payload?.token === token)
    expect(forKey).toHaveLength(2)
}

describeIfPostgres('PostgreSQL application identity one-time consume', () => {
    test('sequential algebra: absent / consumed / already-used / expired', async () => {
        const model = createConsumeModel('Alg')
        const replica = createConsumeReplica(model)
        await replica.controller.setup(true)
        const ns = 'camp'
        try {
            const absent = await dispatchConsume(replica.controller, model.Consume, {
                ns, token: 'T-none', nonce: 'c0',
            })
            expect(classifyConsume({
                error: absent.error,
                effects: absent.effects,
                row: await findToken(replica.system.storage, model.Token.name, ns, 'T-none'),
                recordName: model.Token.name,
                myNonce: 'c0',
                now: Date.now(),
            })).toBe('absent')

            await replica.controller.dispatch(model.Register, {
                user: { id: 'r1' },
                payload: {
                    ns, token: 'T-live', data: 'secret-live', nonce: 'alice',
                    expiresAt: Date.now() + 3_600_000,
                },
            })
            const consume1 = await dispatchConsume(replica.controller, model.Consume, {
                ns, token: 'T-live', nonce: 'carol',
            })
            const consumedRow = await findToken(replica.system.storage, model.Token.name, ns, 'T-live')
            expect(classifyConsume({
                error: consume1.error,
                effects: consume1.effects,
                row: consumedRow,
                recordName: model.Token.name,
                myNonce: 'carol',
                now: Date.now(),
            })).toBe('consumed')
            expect(consumedRow.payload).toBe('secret-live')
            expect(consumedRow.consumedBy).toBe('carol')
            const consumedUpdates = entityUpdates(consume1.effects, model.Token.name)
            expect(consumedUpdates.some((event: any) => event.keys?.includes('status') && event.record?.status === 'used')).toBe(true)
            expect(consumedUpdates.some((event: any) => event.keys?.includes('consumedBy') && event.record?.consumedBy === 'carol')).toBe(true)

            const consumeAgain = await dispatchConsume(replica.controller, model.Consume, {
                ns, token: 'T-live', nonce: 'carol',
            })
            const againRow = await findToken(replica.system.storage, model.Token.name, ns, 'T-live')
            expect(consumeAgain.error).toBeUndefined()
            expect(entityUpdates(consumeAgain.effects, model.Token.name)).toHaveLength(0)
            expect(againRow.status).toBe('used')
            expect(againRow.consumedBy).toBe('carol')

            const consume2 = await dispatchConsume(replica.controller, model.Consume, {
                ns, token: 'T-live', nonce: 'dave',
            })
            const usedRow = await findToken(replica.system.storage, model.Token.name, ns, 'T-live')
            expect(classifyConsume({
                error: consume2.error,
                effects: consume2.effects,
                row: usedRow,
                recordName: model.Token.name,
                myNonce: 'dave',
                now: Date.now(),
            })).toBe('already-used')
            expect(usedRow.consumedBy).toBe('carol')

            await replica.controller.dispatch(model.Register, {
                user: { id: 'r2' },
                payload: {
                    ns, token: 'T-old', data: 'secret-old', nonce: 'erin',
                    expiresAt: Date.now() - 1000,
                },
            })
            const consumeExpired = await dispatchConsume(replica.controller, model.Consume, {
                ns, token: 'T-old', nonce: 'frank',
            })
            const expiredRow = await findToken(replica.system.storage, model.Token.name, ns, 'T-old')
            expect(classifyConsume({
                error: consumeExpired.error,
                effects: consumeExpired.effects,
                row: expiredRow,
                recordName: model.Token.name,
                myNonce: 'frank',
                now: Date.now(),
            })).toBe('expired')
            expect(expiredRow.status).toBe('unused')
            expect(expiredRow.consumedBy == null).toBe(true)
        } finally {
            await replica.system.destroy().catch(() => {})
        }
    }, 120000)

    test('topology (a): two controllers, two connections — exactly one consume', async () => {
        const model = createConsumeModel('A')
        const a = createConsumeReplica(model)
        await a.controller.setup(true)
        const b = createConsumeReplica(model)
        await b.controller.setup(false)
        try {
            for (let i = 0; i < RACE_ROUNDS; i++) {
                const token = `K-ca-${i}`
                await a.controller.dispatch(model.Register, {
                    user: { id: `r-a-${i}` },
                    payload: {
                        ns: 'camp', token, data: `payload-${i}`, nonce: `holder-${i}`,
                        expiresAt: Date.now() + 3_600_000,
                    },
                })
                const nonces: [string, string] = [`cA-${i}`, `cB-${i}`]
                const [ca, cb] = await withIdentityRowLockBarrier(model.Token.name, () => Promise.all([
                    dispatchConsume(a.controller, model.Consume, { ns: 'camp', token, nonce: nonces[0] }),
                    dispatchConsume(b.controller, model.Consume, { ns: 'camp', token, nonce: nonces[1] }),
                ]))
                await assertConsumeRace({
                    results: [ca, cb],
                    storage: a.system.storage,
                    replicaStorage: b.system.storage,
                    tokenName: model.Token.name,
                    consumeName: model.Consume.name,
                    ns: 'camp',
                    token,
                    nonces,
                    expectedPayload: `payload-${i}`,
                })
            }
        } finally {
            await b.system.destroy().catch(() => {})
            await a.system.destroy().catch(() => {})
        }
    }, 120000)

    test('topology (b): same controller connection-pool concurrent consume', async () => {
        const model = createConsumeModel('B')
        const replica = createConsumeReplica(model)
        await replica.controller.setup(true)
        try {
            for (let i = 0; i < RACE_ROUNDS; i++) {
                const token = `K-cb-${i}`
                await replica.controller.dispatch(model.Register, {
                    user: { id: `r-b-${i}` },
                    payload: {
                        ns: 'camp', token, data: `payload-${i}`, nonce: `holder-${i}`,
                        expiresAt: Date.now() + 3_600_000,
                    },
                })
                const nonces: [string, string] = [`c1-${i}`, `c2-${i}`]
                const [ca, cb] = await withIdentityRowLockBarrier(model.Token.name, () => Promise.all([
                    dispatchConsume(replica.controller, model.Consume, { ns: 'camp', token, nonce: nonces[0] }),
                    dispatchConsume(replica.controller, model.Consume, { ns: 'camp', token, nonce: nonces[1] }),
                ]))
                await assertConsumeRace({
                    results: [ca, cb],
                    storage: replica.system.storage,
                    tokenName: model.Token.name,
                    consumeName: model.Consume.name,
                    ns: 'camp',
                    token,
                    nonces,
                    expectedPayload: `payload-${i}`,
                })
            }
        } finally {
            await replica.system.destroy().catch(() => {})
        }
    }, 120000)
})

describeIfPostgres('PostgreSQL application identity merged-link write path', () => {
    test('identity 1:1 merged link writes the relation row, `&` payload, and steal unlinks', async () => {
        const Other = Entity.create({
            name: 'PgIdentLinkPeer',
            properties: [Property.create({ name: 'title', type: 'string' })],
        })
        const Token = Entity.create({
            name: 'PgIdentLinkTok',
            identity: { name: 'byKey', properties: ['k'] },
            properties: [
                Property.create({ name: 'k', type: 'string' }),
                Property.create({ name: 'payload', type: 'string' }),
            ],
        })
        const Rel = Relation.create({
            name: 'PgIdentLinkRel',
            source: Token,
            sourceProperty: 'other',
            target: Other,
            targetProperty: 'token',
            type: '1:1',
            properties: [Property.create({ name: 'payload', type: 'string' })],
        })
        const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Other, Token],
            relations: [Rel],
        })
        await controller.setup(true)
        try {
            const peer = await system.storage.create(Other.name, { title: 'p' })
            await system.storage.create(Token.name, {
                k: 'live',
                payload: 'host-payload',
                other: { id: peer.id, '&': { payload: 'link-payload' } },
            })
            const links = await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id', 'payload'])
            expect(links).toHaveLength(1)
            expect(links[0].payload).toBe('link-payload')

            await system.storage.create(Token.name, { k: 'live2', other: { id: peer.id } })
            const afterSteal = await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])
            expect(afterSteal).toHaveLength(1)
            const tokens = await system.storage.find(Token.name, undefined, undefined, ['k', ['other', { attributeQuery: ['title'] }]])
            expect(tokens.filter((row: any) => row.other?.title === 'p')).toHaveLength(1)
            expect(tokens.filter((row: any) => row.other?.title === 'p')[0].k).toBe('live2')
        } finally {
            await system.destroy().catch(() => {})
        }
    })
})
