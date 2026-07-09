import { describe, it, expect } from 'vitest';
import { SQLiteDB } from '@drivers';

/**
 * r8 显著改进项回归：SQLite getAutoId 原子化（UPSERT + 唯一索引 + 参数化）。
 * 此前是「SELECT 再 INSERT/UPDATE」的读-改-写，且 recordName 直接字符串拼接进 SQL。
 */
describe('SQLite id allocation', () => {
    it('allocates strictly sequential unique ids per record name', async () => {
        const db = new SQLiteDB(':memory:')
        await db.open()

        const ids: string[] = []
        for (let i = 0; i < 50; i++) {
            ids.push(String(await db.getAutoId('Alpha')))
        }
        expect(ids).toEqual(Array.from({ length: 50 }, (_, i) => String(i + 1)))

        // 不同 record name 的序列互不影响
        expect(String(await db.getAutoId('Beta'))).toBe('1')
        expect(String(await db.getAutoId('Alpha'))).toBe('51')

        await db.close()
    })

    it('upgrades a legacy _IDS_ table (no unique index) in place', async () => {
        const db = new SQLiteDB(':memory:')
        // 先手工建出旧版的无约束表，再走正常 open（IF NOT EXISTS 跳过建表、补建唯一索引）。
        ;(db as any).db = new (await import('better-sqlite3')).default(':memory:')
        ;(db as any).db.prepare(`CREATE TABLE _IDS_ (last INTEGER, name TEXT)`).run()
        ;(db as any).db.prepare(`INSERT INTO _IDS_ (name, last) VALUES ('Legacy', 7)`).run()
        await (db as any).idSystem.setup()

        expect(String(await db.getAutoId('Legacy'))).toBe('8')
        expect(String(await db.getAutoId('Legacy'))).toBe('9')
        expect(String(await db.getAutoId('Fresh'))).toBe('1')

        await db.close()
    })
})
