/**
 * Independent design-review probe (additional task 1).
 * Not part of the regular suite. Verifies the load-bearing SQL contract of
 * Entity.identity collection semantics: INSERT ... ON CONFLICT (identity cols)
 * DO NOTHING under each dialect's real insert() (empty RETURNING) and, on real
 * PostgreSQL, two connections at READ COMMITTED with a second unique index that
 * must not be the arbiter.
 */
import { describe, expect, test } from 'vitest'
import { PGLiteDB, PostgreSQLDB, SQLiteDB } from '@drivers'
import type { Database } from 'interaqt'

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip
const database = process.env.INTERAQT_POSTGRES_DATABASE
    ? `${process.env.INTERAQT_POSTGRES_DATABASE}_akop_rev`
    : ''
const dbOptions = {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
}

function pkType(db: Database) {
    return db.mapToDBFieldType('pk')
}

function insertSql(db: Database) {
    const p = db.getPlaceholder ? db.getPlaceholder() : () => '?'
    return `INSERT INTO "rev_oc" ("ns", "token", "payload", "src", "idx") VALUES (${p()}, ${p()}, ${p()}, ${p()}, ${p()}) ON CONFLICT ("ns", "token") DO NOTHING`
}

async function installSchema(db: Database) {
    await db.scheme(`
CREATE TABLE "rev_oc" (
    "_rowId" ${pkType(db)},
    "ns" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "payload" TEXT,
    "src" TEXT NOT NULL,
    "idx" INTEGER NOT NULL
)
`)
    await db.scheme(`CREATE UNIQUE INDEX "rev_oc_identity" ON "rev_oc" ("ns", "token")`)
    await db.scheme(`CREATE UNIQUE INDEX "rev_oc_src" ON "rev_oc" ("src", "idx")`)
}

describe('review AT1: ON CONFLICT DO NOTHING contract (SQLite / PGLite sequential)', () => {
    for (const [name, makeDb] of [
        ['SQLite', () => new SQLiteDB()] as const,
        ['PGLite', () => new PGLiteDB()] as const,
    ]) {
        test(`${name}: unique INDEX arbiter, empty RETURNING, payload of existing row unchanged`, async () => {
            const db = makeDb()
            await db.open(true)
            await installSchema(db)
            const sql = insertSql(db)
            const first = await db.insert(sql, ['camp', 'K', 'winner', 'src-a', 0])
            expect(first).toBeTruthy()
            const conflict = await db.insert(sql, ['camp', 'K', 'loser', 'src-b', 0])
            expect(conflict).toBeUndefined()
            const rows = await db.query<{ payload: string, src: string }>(`SELECT "payload", "src" FROM "rev_oc"`)
            expect(rows).toEqual([{ payload: 'winner', src: 'src-a' }])
            await db.close()
        })
    }
})

describeIfPostgres('review AT1: real-PostgreSQL ON CONFLICT concurrent', () => {
    test('two connections, READ COMMITTED, identity arbiter + second unique index: exactly one row, no 23505', async () => {
        const a = new PostgreSQLDB(database, dbOptions)
        await a.open(true)
        await installSchema(a)

        const b = new PostgreSQLDB(database, dbOptions)
        await b.open(false)

        try {
            const sqlA = insertSql(a)
            const sqlB = insertSql(b)

            const run = (db: PostgreSQLDB, sql: string, payload: string, src: string) =>
                db.runInTransaction({ name: `rev-oc-${src}`, isolation: 'READ COMMITTED' }, async () => {
                    return db.insert(sql, ['camp', 'K', payload, src, 0])
                })

            const rounds: Array<{ inserted: number, errors: string[], definedReturns: number }> = []
            for (let i = 0; i < 10; i++) {
                await a.scheme(`DELETE FROM "rev_oc"`)
                const errors: string[] = []
                const settled = await Promise.allSettled([
                    run(a, sqlA, `A${i}`, `src-a-${i}`),
                    run(b, sqlB, `B${i}`, `src-b-${i}`),
                ])
                let definedReturns = 0
                for (const item of settled) {
                    if (item.status === 'rejected') {
                        const err = item.reason as { code?: string, message?: string }
                        errors.push(`${err?.code ?? ''} ${String(err?.message ?? item.reason).slice(0, 180)}`)
                    } else if (item.value !== undefined) {
                        definedReturns += 1
                    }
                }
                const rows = await a.query<{ payload: string }>(`SELECT "payload" FROM "rev_oc"`)
                rounds.push({ inserted: rows.length, errors, definedReturns })
            }

            console.log('[review-at1] concurrent rounds', JSON.stringify(rounds))
            for (const round of rounds) {
                expect(round.errors, `unexpected errors: ${round.errors.join(' | ')}`).toEqual([])
                expect(round.inserted).toBe(1)
                expect(round.definedReturns).toBe(1)
            }

            await a.scheme(`DELETE FROM "rev_oc"`)
            const t1 = a.runInTransaction({ name: 'rev-oc-hold', isolation: 'READ COMMITTED' }, async () => {
                const inserted = await a.insert(sqlA, ['camp', 'K', 'held', 'src-hold-a', 0])
                expect(inserted).toBeTruthy()
                await new Promise(resolve => setTimeout(resolve, 400))
                return 't1-committed'
            })
            await new Promise(resolve => setTimeout(resolve, 80))
            const t2 = b.runInTransaction({ name: 'rev-oc-wait', isolation: 'READ COMMITTED' }, async () => {
                return b.insert(sqlB, ['camp', 'K', 'late', 'src-hold-b', 0])
            })
            const [t1Result, t2Result] = await Promise.all([t1, t2])
            expect(t1Result).toBe('t1-committed')
            expect(t2Result).toBeUndefined()
            const held = await a.query<{ payload: string, src: string }>(`SELECT "payload", "src" FROM "rev_oc"`)
            expect(held).toEqual([{ payload: 'held', src: 'src-hold-a' }])
        } finally {
            await b.close().catch(() => {})
            await a.close().catch(() => {})
        }
    }, 120000)
})
