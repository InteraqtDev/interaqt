/**
 * r26 I-4 regression (env-gated): PostgreSQL / MySQL double-close idempotency
 * on real servers — the close() symmetric face of the open-idempotency family
 * (r22 I-5 SQLite open → r25 I-2 MySQL open → r26 I-4 four-driver close).
 * SQLite/PGLite cells live in review-fixes-2026-07-13-r26.spec.ts (no env gate).
 */
import { describe, expect, test } from 'vitest'
import { PostgreSQLDB, MysqlDB } from '@drivers'

const PG = process.env.INTERAQT_POSTGRES_DATABASE
const MY = process.env.INTERAQT_MYSQL_DATABASE

describe.skipIf(!PG)('r26 I-4 — PostgreSQL close idempotency', () => {
  test('double close does not throw', async () => {
    const db = new PostgreSQLDB(`${PG}_close_idem`, {
      host: process.env.PGHOST, user: process.env.PGUSER, password: process.env.PGPASSWORD,
    })
    await db.open(true)
    await db.close()
    await expect(db.close()).resolves.toBeUndefined()
  })
})

describe.skipIf(!MY)('r26 I-4 — MySQL close idempotency', () => {
  test('double close does not throw', async () => {
    const db = new MysqlDB(`${MY}_close_idem`, {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      user: process.env.MYSQL_USER || 'interaqt',
      password: process.env.MYSQL_PASSWORD || 'interaqt',
    })
    await db.open(true)
    await db.close()
    await expect(db.close()).resolves.toBeUndefined()
  })
})
