/**
 * Design-adjudication probe for R-1 (not part of the regular suite).
 * Deleted after this round; results are recorded in the design document.
 */
import { describe, expect, test } from 'vitest'
import {
    Controller,
    Entity,
    KlassByName,
    MonoSystem,
    NonNullConstraint,
    Property,
    UniqueConstraint,
} from 'interaqt'
import { PGLiteDB, SQLiteDB } from '@drivers'
import { DBSetup } from '@storage'

describe('adjudication R-1', () => {
    test('SQLite rejects NonNullConstraint at setup; PGLite accepts it', async () => {
        const mk = (suffix: string) => Entity.create({
            name: `AdjNn${suffix}`,
            properties: [Property.create({ name: 'title', type: 'string' })],
            constraints: [NonNullConstraint.create({ name: `adj_nn_${suffix}`, property: 'title' })],
        })

        const sqliteSystem = new MonoSystem(new SQLiteDB())
        sqliteSystem.conceptClass = KlassByName
        const sqliteController = new Controller({ system: sqliteSystem, entities: [mk('Sqlite')], relations: [] })
        await expect(sqliteController.setup(true)).rejects.toThrow(/non-null constraints are not supported by sqlite/i)
        await sqliteSystem.destroy()

        const pgliteSystem = new MonoSystem(new PGLiteDB())
        pgliteSystem.conceptClass = KlassByName
        const pgliteController = new Controller({ system: pgliteSystem, entities: [mk('Pglite')], relations: [] })
        await pgliteController.setup(true)
        await pgliteSystem.destroy()
    })

    test('createTableSQL does not emit column NOT NULL even when ColumnData.notNull is set', () => {
        const Record = Entity.create({
            name: 'AdjNotNullCol',
            properties: [Property.create({ name: 'token', type: 'string' })],
        })
        const setup = new DBSetup([Record], [], new SQLiteDB())
        const table = Object.values(setup.tables)[0]
        const tokenCol = Object.values(table.columns).find(c => c.name !== '_rowId' && c.name !== 'id')
        expect(tokenCol).toBeDefined()
        ;(tokenCol as { notNull?: boolean }).notNull = true
        const sql = setup.createTableSQL().join('\n')
        expect(sql).not.toMatch(/NOT NULL/i)
    })

    test('SQLite INSERT ON CONFLICT DO NOTHING RETURNING is empty on conflict', async () => {
        const db = new SQLiteDB()
        await db.open(true)
        // SQLiteDB.insert always appends `RETURNING _rowId` (SQLite.ts:212).
        await db.scheme(`CREATE TABLE "adj_oc" ("_rowId" INTEGER PRIMARY KEY, "k" TEXT NOT NULL, "v" TEXT, UNIQUE("k"))`)
        const first = await db.insert(`INSERT INTO "adj_oc" ("k", "v") VALUES (?, ?)`, ['a', 'one'])
        expect(first).toBeTruthy()
        const conflict = await db.insert(
            `INSERT INTO "adj_oc" ("k", "v") VALUES (?, ?) ON CONFLICT ("k") DO NOTHING`,
            ['a', 'two'],
        )
        expect(conflict).toBeUndefined()
        const rows = await db.query<{ k: string, v: string }>(`SELECT "k", "v" FROM "adj_oc"`)
        expect(rows).toEqual([{ k: 'a', v: 'one' }])
        await db.close()
    })

    test('SQLite UniqueConstraint duplicate create still throws (control: identity must not change this)', async () => {
        const Charge = Entity.create({
            name: 'AdjUniqueSqlite',
            properties: [Property.create({ name: 'idempotencyKey', type: 'string' })],
            constraints: [UniqueConstraint.create({
                name: 'AdjUniqueSqlite_key',
                properties: ['idempotencyKey'],
            })],
        })
        const system = new MonoSystem(new SQLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Charge], relations: [] })
        await controller.setup(true)
        await system.storage.create('AdjUniqueSqlite', { idempotencyKey: 'same' })
        await expect(system.storage.create('AdjUniqueSqlite', { idempotencyKey: 'same' })).rejects.toMatchObject({
            name: 'ConstraintViolationError',
        })
        await system.destroy()
    })
})
