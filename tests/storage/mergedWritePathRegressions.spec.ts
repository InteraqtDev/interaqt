/**
 * merged (union) 编译域的写路径回归（r29，extended fuzzer 首跑抓获的四个致命家族）。
 *
 * 共同根源：merged 编译把 input 变成物理 base 上的视图之后，写路径若以**声明名/视图种类**
 * 而非**物理身份**做判定，四个消费点各自出错：
 *  1. 行占用判定按记录种类排除视图/抽象记录 → merged link 删除误判无人占用 → DELETE ROW
 *     物理销毁宿主实体（零事件）——extended seed 1。
 *  2. combined 嵌套新建按声明名发号 → 视图名平行序列与物理表既有 id 碰撞 → 静默覆写
 *     既有记录字段——extended seed 41。
 *  3. combined 嵌套新建的 create 事件 payload 用物理名求 defaults → type-dispatch 的
 *     默认值（含 __type 判别列）整族缺席（行有值、payload 读 NULL）——extended seed 41/24。
 *  4. 级联删除轨按声明面名字发 record delete 事件 → 视图名下多出 record delete、
 *     物理名下整体缺失（监听物理名的计算对删除失明）——extended seed 37。
 *
 * 修复面：DeletionExecutor.clearOrDeletePhysicalRow（按 id 字段判占用，不按记录种类排除）、
 * CreationExecutor.allocateRecordId（发号统一走 resolvedBaseRecordName）+ flashOut 同契约、
 * combined create 事件 defaults 按 originalRecordName 求值、
 * DeletionExecutor.deleteRecordSameRowDataGrouped 的 record delete 统一归物理名。
 */
import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, type EntityInstance, type RelationInstance } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { PGLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";

async function setupHandle(entities: EntityInstance[], relations: RelationInstance[]) {
    const db = new PGLiteDB()
    await db.open()
    const setup = new DBSetup(entities, relations, db)
    await setup.createTables()
    return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) }
}

describe('merged (union) write-path regressions (r29 extended fuzzer findings)', () => {
    test('removeRelation on a merged FK link must not physically destroy the merged-input host row (seed 1)', async () => {
        const A = Entity.create({ name: 'MwrA', properties: [Property.create({ name: 'label', type: 'string' })] })
        const B = Entity.create({ name: 'MwrB', properties: [Property.create({ name: 'label', type: 'string' })] })
        const C = Entity.create({ name: 'MwrC', properties: [Property.create({ name: 'label', type: 'string' })] })
        const rel = Relation.create({
            source: A, sourceProperty: 'out', target: B, targetProperty: 'in', type: 'n:1',
            properties: [Property.create({ name: 'weight', type: 'number', defaultValue: () => 1 })]
        })
        const M = Entity.create({ name: 'MwrM', inputEntities: [A, C] })
        const { db, handle } = await setupHandle([A, B, C, M], [rel])

        const b1 = await handle.create('MwrB', { label: 'b1' })
        await handle.create('MwrA', { label: 'a1', out: { id: b1.id } })
        const links = await handle.findRelationByName(rel.name!, undefined, undefined, ['id'])
        expect(links.length).toBe(1)

        const events: RecordMutationEvent[] = []
        await handle.removeRelationByName(rel.name!, MatchExp.atom({ key: 'id', value: ['=', String(links[0].id)] }), events)

        // 宿主行必须存活（此前：占用判定排除视图/抽象记录 → 整行 DELETE，宿主物理消失且零事件）
        expect((await handle.find('MwrA', undefined, undefined, ['id', 'label'])).length).toBe(1)
        expect((await handle.find('MwrM', undefined, undefined, ['id', 'label'])).length).toBe(1)
        expect(events.some(e => e.type === 'delete' && e.recordName === 'MwrA')).toBe(false)
        await db.close()
    })

    test('combined nested-new child of a merged input allocates ids from the physical sequence (seed 41)', async () => {
        const C = Entity.create({ name: 'MwrIdC', properties: [Property.create({ name: 'label', type: 'string' })] })
        const D = Entity.create({ name: 'MwrIdD', properties: [Property.create({ name: 'label', type: 'string' })] })
        const E = Entity.create({ name: 'MwrIdE', properties: [Property.create({ name: 'label', type: 'string' })] })
        // D—C 1:1 reliance ⇒ C 与 D 合行（combined），嵌套新建 C 走 combinedNewRecords 发号
        const rel = Relation.create({ source: D, sourceProperty: 'own', target: C, targetProperty: 'owner', type: '1:1', isTargetReliance: true })
        const M = Entity.create({ name: 'MwrIdM', inputEntities: [C, E] })
        const { db, handle } = await setupHandle([C, D, E, M], [rel])

        // 先经另一 input 名推进物理序列：视图名平行序列会从头发号并撞上它
        const e1 = await handle.create('MwrIdE', { label: 'e1' })
        const d1 = await handle.create('MwrIdD', { label: 'd1', own: { label: 'c-nested' } })

        const mRows = await handle.find('MwrIdM', undefined, undefined, ['id', 'label'])
        const ids = mRows.map(r => String(r.id))
        // id 必须互不相同（此前：C 从视图名序列发出与 e1 相同的 id，静默覆写 e1 的字段）
        expect(new Set(ids).size).toBe(ids.length)
        const e1Row = mRows.find(r => String(r.id) === String(e1.id))
        expect(e1Row?.label).toBe('e1')
        await db.close()
    })

    test('combined nested-new create event payload carries type-dispatched defaults incl. __type (seed 41/24)', async () => {
        const C = Entity.create({
            name: 'MwrDefC', properties: [
                Property.create({ name: 'label', type: 'string' }),
                Property.create({ name: 'score', type: 'number', defaultValue: () => 7 }),
            ]
        })
        const D = Entity.create({ name: 'MwrDefD', properties: [Property.create({ name: 'label', type: 'string' })] })
        const E = Entity.create({ name: 'MwrDefE', properties: [Property.create({ name: 'label', type: 'string' })] })
        const rel = Relation.create({ source: D, sourceProperty: 'own', target: C, targetProperty: 'owner', type: '1:1', isTargetReliance: true })
        const M = Entity.create({ name: 'MwrDefM', inputEntities: [C, E] })
        const { db, handle } = await setupHandle([C, D, E, M], [rel])

        const events: RecordMutationEvent[] = []
        await handle.create('MwrDefD', { label: 'd1', own: { label: 'c1' } }, events)

        // create 事件 payload 契约 = defaults + payload；merged input 的 defaults 按声明名 type-dispatch
        const mCreate = events.find(e => e.type === 'create' && e.recordName === 'MwrDefM')
        expect(mCreate, 'combined child create event must be emitted under the physical (merged) name').toBeTruthy()
        expect(mCreate!.record!.score, 'type-dispatched default must be present in payload').toBe(7)
        expect(mCreate!.record!.__type).toBe('MwrDefC')
        // 视图名（input）下是成员资格 create
        expect(events.some(e => e.type === 'create' && e.recordName === 'MwrDefC')).toBe(true)
        await db.close()
    })

    test('reliance cascade of a merged input emits record delete under the physical name (seed 37)', async () => {
        const B = Entity.create({ name: 'MwrCasB', properties: [Property.create({ name: 'label', type: 'string' })] })
        const C = Entity.create({ name: 'MwrCasC', properties: [Property.create({ name: 'label', type: 'string' })] })
        const D = Entity.create({ name: 'MwrCasD', properties: [Property.create({ name: 'label', type: 'string' })] })
        const rel = Relation.create({ source: D, sourceProperty: 'own', target: C, targetProperty: 'owner', type: '1:1', isTargetReliance: true })
        const M = Entity.create({ name: 'MwrCasM', inputEntities: [C, B] })
        const { db, handle } = await setupHandle([B, C, D, M], [rel])

        const c1 = await handle.create('MwrCasC', { label: 'c1' })
        const d1 = await handle.create('MwrCasD', { label: 'd1' })
        await handle.addRelationByNameById(rel.name!, String(d1.id), String(c1.id), {})

        const events: RecordMutationEvent[] = []
        await handle.delete('MwrCasD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }), events)

        expect((await handle.find('MwrCasC', undefined, undefined, ['id'])).length).toBe(0)
        expect((await handle.find('MwrCasM', undefined, undefined, ['id'])).length).toBe(0)
        const deletesByName = events.filter(e => e.type === 'delete').map(e => e.recordName)
        // 物理名 record delete 必须恰好一次；视图名下是成员资格 delete（同样恰好一次，不重复）
        expect(deletesByName.filter(n => n === 'MwrCasM').length,
            `physical-name delete missing/duplicated in ${JSON.stringify(deletesByName)}`).toBe(1)
        expect(deletesByName.filter(n => n === 'MwrCasC').length,
            `view-name membership delete missing/duplicated in ${JSON.stringify(deletesByName)}`).toBe(1)
        await db.close()
    })
})
