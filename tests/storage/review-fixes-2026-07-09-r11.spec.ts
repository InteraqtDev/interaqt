import { describe, expect, test } from "vitest";
import { Entity, Property, KlassByName, Controller, MonoSystem } from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB, SQLiteDB } from '@drivers';

/**
 * r11 review 回归（storage 侧）。
 *
 * F-2: json/collection 列的 IN / NOT IN 匹配。写入路径统一 JSON.stringify，
 *      匹配参数此前原样绑定：PG 系裸报 "operator does not exist: json = unknown"，
 *      SQLite 把数组元素展开成多余绑定参数直接崩（"Too many parameter values"）。
 *      r10 F-3 只修了 =/!=，本轮把同一治理延伸到 IN / NOT IN：
 *      PG/PGLite 走 ::jsonb 语义比较（键序不敏感），MySQL 走 CAST(? AS JSON)，
 *      其余驱动退化为与写入路径一致的序列化文本比较。NULL 行不参与匹配。
 *
 * R-3: 操作符大小写归一。'LIKE'（大写）此前落入末尾的 unknown-expression assert，
 *      抛出与用户写法脱节的内部错误；in/not in/between 早已 toLowerCase。
 *      现在 simpleOp（=、!=、>、<、>=、<=、like）统一按小写识别。
 *
 * R-4: between 的操作数校验。['between', 25]（非两元数组）此前深入到 value[1][0]
 *      抛裸 TypeError，现在给出带指引的受控错误。
 */

async function setupDocModel(name: string, db: any) {
    const Doc = Entity.create({
        name,
        properties: [
            Property.create({ name: 'name', type: 'string' }),
            Property.create({ name: 'tags', type: 'string', collection: true }),
        ],
    })
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Doc], relations: [] })
    await controller.setup(true)
    return { system, controller }
}

describe('r11 F-2: json IN / NOT IN matching', () => {
    test('PGLite: IN matches whole-value snapshots, NOT IN excludes and skips NULL rows', async () => {
        const { system } = await setupDocModel('R11JsonDocPg', new PGLiteDB())
        await system.storage.create('R11JsonDocPg', { name: 'a', tags: ['alpha', 'beta'] })
        await system.storage.create('R11JsonDocPg', { name: 'b', tags: ['gamma'] })
        await system.storage.create('R11JsonDocPg', { name: 'nullRow' })

        const hits = await system.storage.find('R11JsonDocPg',
            MatchExp.atom({ key: 'tags', value: ['in', [['alpha', 'beta'], ['x']]] }), undefined, ['name'])
        expect(hits.map((h: any) => h.name)).toEqual(['a'])

        const misses = await system.storage.find('R11JsonDocPg',
            MatchExp.atom({ key: 'tags', value: ['not in', [['alpha', 'beta']]] }), undefined, ['name'])
        expect(misses.map((h: any) => h.name)).toEqual(['b'])
        await system.destroy()
    })

    test('SQLite: IN matches whole-value snapshots, NOT IN excludes', async () => {
        const { system } = await setupDocModel('R11JsonDocSq', new SQLiteDB())
        await system.storage.create('R11JsonDocSq', { name: 'a', tags: ['alpha', 'beta'] })
        await system.storage.create('R11JsonDocSq', { name: 'b', tags: ['gamma'] })

        const hits = await system.storage.find('R11JsonDocSq',
            MatchExp.atom({ key: 'tags', value: ['in', [['alpha', 'beta']]] }), undefined, ['name'])
        expect(hits.map((h: any) => h.name)).toEqual(['a'])

        const misses = await system.storage.find('R11JsonDocSq',
            MatchExp.atom({ key: 'tags', value: ['not in', [['alpha', 'beta']]] }), undefined, ['name'])
        expect(misses.map((h: any) => h.name)).toEqual(['b'])
        await system.destroy()
    })

    test('empty IN / NOT IN lists on json columns keep constant-false/true semantics', async () => {
        const { system } = await setupDocModel('R11JsonDocEmpty', new PGLiteDB())
        await system.storage.create('R11JsonDocEmpty', { name: 'a', tags: ['alpha'] })

        const none = await system.storage.find('R11JsonDocEmpty',
            MatchExp.atom({ key: 'tags', value: ['in', []] }), undefined, ['name'])
        expect(none).toEqual([])

        const all = await system.storage.find('R11JsonDocEmpty',
            MatchExp.atom({ key: 'tags', value: ['not in', []] }), undefined, ['name'])
        expect(all.map((h: any) => h.name)).toEqual(['a'])
        await system.destroy()
    })
})

describe('r11 R-3: operator case normalization', () => {
    test('uppercase LIKE works the same as lowercase', async () => {
        const { system } = await setupDocModel('R11LikeDoc', new PGLiteDB())
        await system.storage.create('R11LikeDoc', { name: 'hello world' })

        const upper = await system.storage.find('R11LikeDoc',
            MatchExp.atom({ key: 'name', value: ['LIKE', '%hello%'] }), undefined, ['name'])
        const lower = await system.storage.find('R11LikeDoc',
            MatchExp.atom({ key: 'name', value: ['like', '%hello%'] }), undefined, ['name'])
        expect(upper.length).toBe(1)
        expect(lower.length).toBe(1)
        await system.destroy()
    })
})

describe('r11 R-4: between operand validation', () => {
    test('non-array between value gives a controlled error', async () => {
        const Doc = Entity.create({
            name: 'R11BetweenDoc',
            properties: [Property.create({ name: 'num', type: 'number' })],
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Doc], relations: [] })
        await controller.setup(true)
        await expect(system.storage.find('R11BetweenDoc',
            MatchExp.atom({ key: 'num', value: ['between', 25] }), undefined, ['num'])
        ).rejects.toThrow(/requires a two-element array/)
        await system.destroy()
    })

    test('valid between still works', async () => {
        const Doc = Entity.create({
            name: 'R11BetweenDoc2',
            properties: [Property.create({ name: 'num', type: 'number' })],
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Doc], relations: [] })
        await controller.setup(true)
        await system.storage.create('R11BetweenDoc2', { num: 30 })
        await system.storage.create('R11BetweenDoc2', { num: 99 })
        const hits = await system.storage.find('R11BetweenDoc2',
            MatchExp.atom({ key: 'num', value: ['between', [25, 50]] }), undefined, ['num'])
        expect(hits.map((h: any) => h.num)).toEqual([30])
        await system.destroy()
    })
})
