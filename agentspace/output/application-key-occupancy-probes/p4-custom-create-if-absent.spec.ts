/**
 * Probe P4 (design phase, docs/application-key-occupancy Task 1).
 *
 * The strongest "maybe HEAD already covers first-writer registration" candidate:
 * an entity-context Custom computation whose incrementalPatchCompute does
 * atomic.lockRows(key) and returns an insert patch only when no row exists
 * (create-if-absent, forced SERIALIZABLE by the Custom default concurrency).
 *
 * Questions this probe answers on real PostgreSQL:
 *   1. Sequential case: does the second claim converge to a stable no-op success?
 *   2. True two-connection race on an absent key: does the loser converge
 *      (retryable 40001 path) or fault (non-retryable 23505 path)? Either way,
 *      is the result kind deterministic enough to document as a stable algebra?
 */
import { describe, expect, test } from 'vitest'
import {
    Action,
    Controller,
    Custom,
    Entity,
    Interaction,
    InteractionEventEntity,
    KlassByName,
    MatchExp,
    MonoSystem,
    Payload,
    PayloadItem,
    Property,
    UniqueConstraint,
    findConstraintViolationError,
} from 'interaqt'
import { PostgreSQLDB } from '@drivers'

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const database = process.env.INTERAQT_POSTGRES_DATABASE ? `${process.env.INTERAQT_POSTGRES_DATABASE}_akop2` : ''
const dbOptions = {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
}

const Slot = Entity.create({
    name: 'P4Slot',
    properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
        Property.create({ name: 'holder', type: 'string' }),
    ],
    constraints: [
        UniqueConstraint.create({
            name: 'P4Slot_key_unique',
            properties: ['ns', 'token'],
            violationCode: 'SLOT_TAKEN',
        }),
    ],
    computation: Custom.create({
        name: 'P4SlotClaim',
        dataDeps: {
            events: {
                type: 'records',
                source: InteractionEventEntity,
                attributeQuery: ['interactionName', 'payload'],
            },
        },
        incrementalDataDeps: [],
        compute: async function () {
            return []
        },
        incrementalPatchCompute: async function (this: any, _lastValue: any, mutationEvent: any) {
            if (mutationEvent?.type !== 'create') return undefined
            const rec = mutationEvent.record
            if (rec?.interactionName !== 'P4Claim') return undefined
            const existing = await this.atomic.lockRows(
                'P4Slot',
                MatchExp.atom({ key: 'ns', value: ['=', rec.payload.ns] })
                    .and({ key: 'token', value: ['=', rec.payload.token] }),
                ['id'],
            )
            if (existing.length > 0) return undefined
            return {
                type: 'insert',
                data: { ns: rec.payload.ns, token: rec.payload.token, holder: rec.payload.nonce },
            }
        },
    }),
})

const Claim = Interaction.create({
    name: 'P4Claim',
    action: Action.create({ name: 'p4claim' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'ns', type: 'string' }),
            PayloadItem.create({ name: 'token', type: 'string' }),
            PayloadItem.create({ name: 'nonce', type: 'string' }),
        ],
    }),
})

function createReplica() {
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions))
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Slot], relations: [], eventSources: [Claim] })
    return { system, controller }
}

function classify(result: any) {
    if (!result.error) {
        const inserts = (result.effects ?? []).filter((e: any) => e.recordName === 'P4Slot' && e.type === 'create')
        return inserts.length > 0 ? 'success-with-insert' : 'success-no-insert'
    }
    const violation = findConstraintViolationError(result.error)
    if (violation) return `constraint-violation(${violation.context?.code})`
    return `error(${(result.error as any)?.constructor?.name}: ${String((result.error as any)?.message).slice(0, 120)})`
}

describeIfPostgres('P4: Custom lockRows create-if-absent on real PostgreSQL', () => {
    test('sequential and racing claims on an absent key', async () => {
        const a = createReplica()
        await a.controller.setup(true)
        const b = createReplica()
        await b.controller.setup(false)

        try {
            // --- Sequential: A claims, then B claims the same key ---
            const s1 = await a.controller.dispatch(Claim, {
                user: { id: 'ua' }, payload: { ns: 'seq', token: 'S-1', nonce: 'nA' },
            })
            const s2 = await b.controller.dispatch(Claim, {
                user: { id: 'ub' }, payload: { ns: 'seq', token: 'S-1', nonce: 'nB' },
            })
            console.log('[P4 sequential] first:', classify(s1), '| second:', classify(s2))
            expect(classify(s1)).toBe('success-with-insert')
            expect(classify(s2)).toBe('success-no-insert')
            const seqRows = await a.system.storage.find(
                'P4Slot', MatchExp.atom({ key: 'token', value: ['=', 'S-1'] }), undefined, ['*'])
            expect(seqRows).toHaveLength(1)
            expect(seqRows[0].holder).toBe('nA')

            // --- Race: both replicas claim the same absent key concurrently (10 keys) ---
            const outcomes: Record<string, number> = {}
            for (let i = 0; i < 10; i++) {
                const token = `R-${i}`
                const [r1, r2] = await Promise.all([
                    a.controller.dispatch(Claim, { user: { id: 'ua' }, payload: { ns: 'race', token, nonce: 'nA' } }),
                    b.controller.dispatch(Claim, { user: { id: 'ub' }, payload: { ns: 'race', token, nonce: 'nB' } }),
                ])
                const rows = await a.system.storage.find(
                    'P4Slot',
                    MatchExp.atom({ key: 'ns', value: ['=', 'race'] }).and({ key: 'token', value: ['=', token] }),
                    undefined, ['*'])
                expect(rows).toHaveLength(1)
                const key = [classify(r1), classify(r2)].sort().join(' + ')
                outcomes[key] = (outcomes[key] ?? 0) + 1
            }
            console.log('[P4 race] outcome distribution over 10 rounds:', JSON.stringify(outcomes, null, 2))
        } finally {
            await b.system.destroy().catch(() => {})
            await a.system.destroy().catch(() => {})
        }
    }, 120000)
})
