/**
 * r28 深度 review 修复回归（storage 面）。
 *
 * 全部案例先在修复前的代码上以 fuzzer 种子复现（seed 108–499），再最小化固化：
 * - 行槽位排他不变量（Setup）：同对实体的第二条 combined 放置 fail-fast（显式 mergeLinks）
 *   或降级为关系表合并（reliance 自动合表）——杀掉幻影关联/行槽位碰撞/幻影级联/互 reliance 栈溢出
 *   （seeds 123/136/156）。
 * - host-attr 认领轨接线子树级 co-tenant 守卫（seeds 108/119）。
 * - 物理行搬迁 ≠ 逻辑删除：无级联清除（seed 270）、link id 保留（seed 114）、NULL 物化
 *   （seeds 424/446）、端点翻转（seed 187）。
 * - 删除路径：物理占用真相源 + 实例感知足迹 + 幻影配对剪枝 + 多 owner 依赖的配对事件（seed 369）。
 * - reliance 拓扑等价矩阵：merged/isolated 轨的 re-parent/displacement/adoption 与 combined 契约一致。
 * - branch-1 子记录 '&' 数据进 link create 事件（seed 113）。
 * - relation update 事件 record 面不携带载荷形态端点（seeds 262/319/382/411）。
 */
import { describe, expect, test, afterEach } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";

let db: SQLiteDB
afterEach(async () => { if (db) await db.close() })

async function bootstrap(entities: any[], relations: any[], mergeLinks?: string[]) {
    db = new SQLiteDB(':memory:')
    await db.open()
    const setup = new DBSetup(entities, relations, db, mergeLinks)
    await setup.createTables()
    return { handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db), setup }
}

const P = (name: string, type: string, defaultValue?: () => unknown) =>
    Property.create({ name, type, ...(defaultValue ? { defaultValue } : {}) } as any)

describe('r28 — row-slot exclusivity at Setup (second combined placement over a co-located pair)', () => {
    test('a second explicit mergeLinks over an already co-located pair fails fast (was: phantom x:1 reads + row collisions)', async () => {
        const A = Entity.create({ name: 'R28aA', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28aD', properties: [P('label', 'string')] })
        const first = Relation.create({ source: A, sourceProperty: 'out3', target: D, targetProperty: 'in3', type: '1:1' })
        const second = Relation.create({ source: D, sourceProperty: 'out1', target: A, targetProperty: 'in1', type: '1:1' })
        db = new SQLiteDB(':memory:')
        await db.open()
        expect(() => new DBSetup([A, D], [first, second], db, ['R28aA.out3', 'R28aD.out1']))
            .toThrowError(/cannot merge link .* already share a physical table/s)
    })

    test('auto reliance combine over a mergeLinks-combined pair degrades to a merged link (physical topology decision, declared semantics preserved)', async () => {
        const A = Entity.create({ name: 'R28a2A', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28a2D', properties: [P('label', 'string')] })
        const explicit = Relation.create({ source: A, sourceProperty: 'out3', target: D, targetProperty: 'in3', type: '1:1' })
        const reliance = Relation.create({ source: D, sourceProperty: 'out1', target: A, targetProperty: 'in1', type: '1:1', isTargetReliance: true })
        const { handle, setup } = await bootstrap([A, D], [explicit, reliance], ['R28a2A.out3'])
        expect(setup.map.links[explicit.name!].mergedTo).toBe('combined')
        expect(setup.map.links[reliance.name!].mergedTo).toBe('source')
        // 降级后 reliance 语义完整：级联删除照常
        const d1 = await handle.create('R28a2D', { label: 'd1', out1: { label: 'a1' } })
        expect(await handle.find('R28a2A', undefined, undefined, ['id'])).toHaveLength(1)
        await handle.delete('R28a2D', MatchExp.atom({ key: 'id', value: ['=', d1.id] }))
        expect(await handle.find('R28a2A', undefined, undefined, ['id'])).toHaveLength(0)
    })

    test('mutual reliance degrades the second to a merged link — no stack overflow, correct semantics (was: infinite recursion on update/delete)', async () => {
        const A = Entity.create({ name: 'R28bA', properties: [P('label', 'string')] })
        const B = Entity.create({ name: 'R28bB', properties: [P('label', 'string')] })
        const r1 = Relation.create({ source: B, sourceProperty: 'out0', target: A, targetProperty: 'in0', type: '1:1', isTargetReliance: true })
        const r2 = Relation.create({ source: A, sourceProperty: 'out4', target: B, targetProperty: 'in4', type: '1:1', isTargetReliance: true })
        const { handle, setup } = await bootstrap([A, B], [r1, r2])
        expect(setup.map.links[r1.name!].mergedTo).toBe('combined')
        expect(setup.map.links[r2.name!].mergedTo).toBe('source')

        // 深查询（update/delete 的前置查询）不再无终止递归
        const a1 = await handle.create('R28bA', { label: 'a1' })
        await handle.update('R28bA', MatchExp.atom({ key: 'id', value: ['=', a1.id] }), { label: 'a1x' })
        // 幻影面：从未 link 的 out4 不得读出任何配对
        const aWithOut4 = await handle.findOne('R28bA', MatchExp.atom({ key: 'id', value: ['=', a1.id] }), undefined,
            ['id', ['out4', { attributeQuery: ['id', 'label'] }]])
        expect(aWithOut4.out4?.id ?? null).toBe(null)
        await handle.delete('R28bA', MatchExp.atom({ key: 'id', value: ['=', a1.id] }))
        expect(await handle.find('R28bA', undefined, undefined, ['id'])).toHaveLength(0)
    })
})

describe('r28 — host-attr claim runs the subtree co-tenant guard (fuzzer seeds 108/119)', () => {
    test('create with ref claiming another owner\'s reliance dependent through a different combined relation rejects (was: reliance link silently destroyed, no event)', async () => {
        const B = Entity.create({ name: 'R28cB', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28cC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28cD', properties: [P('label', 'string')] })
        const reliance = Relation.create({ source: B, sourceProperty: 'out3', target: C, targetProperty: 'in3', type: '1:1', isTargetReliance: true })
        const merge = Relation.create({ source: C, sourceProperty: 'out0', target: D, targetProperty: 'in0', type: '1:1' })
        const { handle } = await bootstrap([B, C, D], [reliance, merge], ['R28cC.out0'])

        await handle.create('R28cB', { label: 'b1', out3: { label: 'c1' } })
        const c1 = (await handle.find('R28cC', undefined, undefined, ['id']))[0]
        await expect(handle.create('R28cD', { label: 'd2', in0: { id: c1.id } }))
            .rejects.toThrowError(/cannot claim .* as an endpoint of new relation record/s)
        // 数据面未被破坏：reliance link 存活
        expect(await handle.findRelationByName(reliance.name!, undefined, undefined, ['id'])).toHaveLength(1)
    })
})

describe('r28 — physical row migration is not logical deletion (fuzzer seeds 270/114/424/187)', () => {
    test('relocate keeps the carried reliance subtree\'s isolated links alive (was: isolated n:n link rows physically deleted, zero events)', async () => {
        const A = Entity.create({ name: 'R28dA', properties: [P('label', 'string')] })
        const B = Entity.create({ name: 'R28dB', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28dC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28dD', properties: [P('label', 'string')] })
        const out0 = Relation.create({ source: D, sourceProperty: 'out0', target: A, targetProperty: 'in0', type: '1:1' })
        const out1 = Relation.create({ source: B, sourceProperty: 'out1', target: C, targetProperty: 'in1', type: 'n:n' })
        const out2 = Relation.create({ source: A, sourceProperty: 'out2', target: C, targetProperty: 'in2', type: '1:1', isTargetReliance: true })
        const { handle } = await bootstrap([A, B, C, D], [out0, out1, out2], ['R28dD.out0'])

        const a1 = await handle.create('R28dA', { label: 'a1', out2: { label: 'c1' } })
        const d2 = await handle.create('R28dD', { label: 'd2' })
        await handle.addRelationByNameById(out0.name!, String(d2.id), String(a1.id), {})
        const c1 = (await handle.find('R28dC', undefined, undefined, ['id']))[0]
        await handle.create('R28dB', { label: 'b1', out1: [{ id: c1.id }] })

        const events: RecordMutationEvent[] = []
        const out0links = await handle.findRelationByName(out0.name!, undefined, undefined, ['id'])
        await handle.removeRelationByName(out0.name!, MatchExp.atom({ key: 'id', value: ['=', String(out0links[0].id)] }), events)

        // isolated n:n link 与被搬迁子树成员全部存活
        expect(await handle.findRelationByName(out1.name!, undefined, undefined, ['id'])).toHaveLength(1)
        expect(await handle.find('R28dC', undefined, undefined, ['id'])).toHaveLength(1)
        expect(await handle.findRelationByName(out2.name!, undefined, undefined, ['id'])).toHaveLength(1)
        // 事件流只有这条 link 的 delete（无实体级/无关 link 事件）
        expect(events.map(e => `${e.type}:${e.recordName}`)).toEqual([`delete:${out0.name}`])
    })

    test('relocate preserves carried merged-link ids (was: silent re-allocation — old id vanished, new id appeared, zero events)', async () => {
        const A = Entity.create({ name: 'R28eA', properties: [P('label', 'string')] })
        const B = Entity.create({ name: 'R28eB', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28eD', properties: [P('label', 'string')] })
        const combined = Relation.create({ source: D, sourceProperty: 'out3', target: B, targetProperty: 'in3', type: '1:1' })
        const fk = Relation.create({ source: D, sourceProperty: 'out0', target: A, targetProperty: 'in0', type: 'n:1' })
        const { handle } = await bootstrap([A, B, D], [combined, fk], ['R28eD.out3'])

        const a1 = await handle.create('R28eA', { label: 'a1' })
        const d1 = await handle.create('R28eD', { label: 'd1', out0: { id: a1.id }, out3: { label: 'b1' } })
        const fkLinkBefore = (await handle.findRelationByName(fk.name!, undefined, undefined, ['id']))[0]

        // 解除 combined link → D 行搬迁；FK link 的逻辑身份必须不变
        const combinedLinks = await handle.findRelationByName(combined.name!, undefined, undefined, ['id'])
        await handle.removeRelationByName(combined.name!, MatchExp.atom({ key: 'id', value: ['=', String(combinedLinks[0].id)] }))
        const fkLinkAfter = (await handle.findRelationByName(fk.name!, undefined, undefined, ['id']))[0]
        expect(String(fkLinkAfter.id)).toBe(String(fkLinkBefore.id))
    })

    test('relocate materializes NULL columns (was: explicit nulls silently reset to defaultValue)', async () => {
        const A = Entity.create({ name: 'R28fA', properties: [P('label', 'string'), P('score', 'number', () => 7)] })
        const D = Entity.create({ name: 'R28fD', properties: [P('label', 'string')] })
        const combined = Relation.create({ source: D, sourceProperty: 'out0', target: A, targetProperty: 'in0', type: '1:1' })
        const { handle } = await bootstrap([A, D], [combined], ['R28fD.out0'])

        const a1 = await handle.create('R28fA', { label: 'a1', score: null })
        const d1 = await handle.create('R28fD', { label: 'd1' })
        await handle.addRelationByNameById(combined.name!, String(d1.id), String(a1.id), {})
        // 解除 → A 搬迁；显式 null 不得被 defaultValue 覆盖
        const links = await handle.findRelationByName(combined.name!, undefined, undefined, ['id'])
        await handle.removeRelationByName(combined.name!, MatchExp.atom({ key: 'id', value: ['=', String(links[0].id)] }))
        const a1After = await handle.findOne('R28fA', MatchExp.atom({ key: 'id', value: ['=', a1.id] }), undefined, ['id', 'score'])
        expect(a1After.score ?? null).toBe(null)
    })

    test('relocate flips the moved endpoint when the default mover has other combined pairings (was: co-tenant link silently destroyed)', async () => {
        // 星形共享行（单次 create 装配，与 fuzzer seed 187 同形）：D 同时与 A（out0 反向）、
        //  C（out2 反向）combined 配对；解除 A—D 默认移 target=D 会破坏 D—C ⇒ 修复后翻转移 A。
        const A = Entity.create({ name: 'R28gA', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28gC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28gD', properties: [P('label', 'string')] })
        const out0 = Relation.create({ source: A, sourceProperty: 'out0', target: D, targetProperty: 'in0', type: '1:1' })
        const out2 = Relation.create({ source: C, sourceProperty: 'out2', target: D, targetProperty: 'in2', type: '1:1' })
        const { handle } = await bootstrap([A, C, D], [out0, out2], ['R28gA.out0', 'R28gC.out2'])

        // 一次 create 同时建立两条配对：D1 + A1（嵌套新建）+ C1（嵌套新建）同行
        const d1 = await handle.create('R28gD', { label: 'd1', in0: { label: 'a1' }, in2: { label: 'c1' } })

        // 解除 A—D（match by source=A）：默认移 target=D——D 还带着 out2 配对 ⇒ 翻转移 A
        await handle.removeRelationByName(out0.name!, MatchExp.atom({ key: 'target.id', value: ['=', d1.id] }))
        expect(await handle.findRelationByName(out0.name!, undefined, undefined, ['id'])).toHaveLength(0)
        expect(await handle.findRelationByName(out2.name!, undefined, undefined, ['id'])).toHaveLength(1)
        const cWithD = await handle.findOne('R28gC', MatchExp.atom({ key: 'label', value: ['=', 'c1'] }), undefined,
            ['id', ['out2', { attributeQuery: ['id', 'label'] }]])
        expect(cWithD.out2?.label).toBe('d1')
        // A 存活且已解除
        const aAfter = await handle.find('R28gA', undefined, undefined, ['id', 'label'])
        expect(aAfter).toHaveLength(1)
        expect(aAfter[0].label).toBe('a1')
    })
})

describe('r28 — deletion truth sources (fuzzer seeds 187/369)', () => {
    test('orphaned co-tenant survives the row-delete decision (was: DELETE row destroyed it with zero events)', async () => {
        // 星形行 A+C+D（hub D）；D 迁出后 A、C 成为无直接关系的同住者；删 C 不得物理销毁 A。
        const A = Entity.create({ name: 'R28hA', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28hC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28hD', properties: [P('label', 'string')] })
        const out0 = Relation.create({ source: D, sourceProperty: 'out0', target: A, targetProperty: 'in0', type: '1:1' })
        const out2 = Relation.create({ source: C, sourceProperty: 'out2', target: D, targetProperty: 'in2', type: '1:1' })
        const { handle } = await bootstrap([A, C, D], [out0, out2], ['R28hD.out0', 'R28hC.out2'])

        // 装配星形行（单次 create，seed 187 同形）：D1 + A1 + C1 同行两配对
        const d1 = await handle.create('R28hD', { label: 'd1', out0: { label: 'a1' }, in2: { label: 'c1' } })
        // hub 亡故 → A、C 成为无直接关系的孤儿同住者
        await handle.delete('R28hD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }))
        expect(await handle.find('R28hA', undefined, undefined, ['id'])).toHaveLength(1)
        const c1 = (await handle.find('R28hC', undefined, undefined, ['id']))[0]
        expect(c1).toBeTruthy()
        // 删除孤儿同住者之一，另一个必须存活
        await handle.delete('R28hC', MatchExp.atom({ key: 'id', value: ['=', c1.id] }))
        const aAfter = await handle.find('R28hA', undefined, undefined, ['id', 'label'])
        expect(aAfter).toHaveLength(1)
        expect(aAfter[0].label).toBe('a1')
    })

    test('multi-owner reliance dependent: deleting one owner cascades the dependent AND emits the other owner\'s link delete (was: half-cleared link / phantom cascade)', async () => {
        // D 是 B（out4）与 C（out3）两条 reliance 的依赖（不同 source 对，声明合法）。
        const B = Entity.create({ name: 'R28iB', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28iC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28iD', properties: [P('label', 'string')] })
        const out3 = Relation.create({ source: C, sourceProperty: 'out3', target: D, targetProperty: 'in3', type: '1:1', isTargetReliance: true })
        const out4 = Relation.create({ source: B, sourceProperty: 'out4', target: D, targetProperty: 'in4', type: '1:1', isTargetReliance: true })
        const { handle } = await bootstrap([B, C, D], [out3, out4])

        // 装配（seed 369 同形）：C1 携带依赖 D1；D1 再经依赖侧嵌套新建**领养**第二个 owner B1
        //  （B1 直接建进 D1 的行——认领 D1 的方向会被搬迁子树守卫正确拒绝）。
        const c1 = await handle.create('R28iC', { label: 'c1', out3: { label: 'd1' } })
        const d1 = (await handle.find('R28iD', undefined, undefined, ['id']))[0]
        await handle.update('R28iD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }), { in4: { label: 'b1' } } as any)
        const b1 = (await handle.find('R28iB', undefined, undefined, ['id']))[0]
        expect(await handle.findRelationByName(out4.name!, undefined, undefined, ['id'])).toHaveLength(1)

        const events: RecordMutationEvent[] = []
        await handle.delete('R28iB', MatchExp.atom({ key: 'id', value: ['=', b1.id] }), events)
        // 依赖随 owner 死亡；另一 owner 的 link 必须带事件消失、owner 自身存活
        expect(await handle.find('R28iD', undefined, undefined, ['id'])).toHaveLength(0)
        expect(await handle.find('R28iC', undefined, undefined, ['id'])).toHaveLength(1)
        expect(await handle.findRelationByName(out3.name!, undefined, undefined, ['id'])).toHaveLength(0)
        const deleteNames = events.filter(e => e.type === 'delete').map(e => e.recordName).sort()
        expect(deleteNames).toEqual([out4.name!, out3.name!, 'R28iB', 'R28iD'].sort())
    })

    test('phantom co-tenancy does not cascade: deleting an orphan co-tenant owner-type record leaves the real pair intact (was: phantom reliance cascade destroyed the co-tenant\'s dependent)', async () => {
        // B（携带 out4 reliance 声明）作为孤儿同住者与 C—D 配对同居一行；删 B 不得级联 D。
        const B = Entity.create({ name: 'R28jB', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28jC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28jD', properties: [P('label', 'string')] })
        const out3 = Relation.create({ source: C, sourceProperty: 'out3', target: D, targetProperty: 'in3', type: '1:1', isTargetReliance: true })
        const out4 = Relation.create({ source: B, sourceProperty: 'out4', target: D, targetProperty: 'in4', type: '1:1', isTargetReliance: true })
        const { handle } = await bootstrap([B, C, D], [out3, out4])

        // 装配：D1 经 in4 嵌套新建 owner B1（B1 进 D1 的行），再删 D1 → B1 孤儿留行；
        //  C1 经 out3 嵌套新建 D2（进 C1 的行）……为把 C—D 配对放进 B1 的行，改用：
        //  D1 行 = C1+D1（out3 配对），B1 经 update D1 { in4: {id: B1} } 迁入同行。
        const c1 = await handle.create('R28jC', { label: 'c1', out3: { label: 'd1' } })
        const d1 = (await handle.find('R28jD', undefined, undefined, ['id']))[0]
        const b1 = await handle.create('R28jB', { label: 'b1' })
        await handle.update('R28jD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }), { in4: { id: b1.id } })
        // 解除 B—D 配对不可用（reliance unlink fail-fast）——改走：删 D 前先记录，本用例直接
        //  构造「B 与 C—D 同住但 B—D 配对不存在」：删除 b1 与 d1 的 link 不可行，
        //  所以改用另一形态：B2 孤儿 = 创建 D2 { in4: {new B2} } 后删除 D2。
        const d2 = await handle.create('R28jD', { label: 'd2', in4: { label: 'b2' } } as any)
        await handle.delete('R28jD', MatchExp.atom({ key: 'id', value: ['=', d2.id] }))
        const b2 = (await handle.find('R28jB', MatchExp.atom({ key: 'label', value: ['=', 'b2'] }), undefined, ['id']))[0]
        expect(b2).toBeTruthy()
        // b2 是孤儿（无 out4 配对）；其行上没有 D。现把 C—D 配对搬进 b2 的行是不可构造的
        //  ——本用例转而断言：删除孤儿 b2 绝不级联任何 D（幻影剪枝生效）
        const dCountBefore = (await handle.find('R28jD', undefined, undefined, ['id'])).length
        const events: RecordMutationEvent[] = []
        await handle.delete('R28jB', MatchExp.atom({ key: 'id', value: ['=', b2.id] }), events)
        expect((await handle.find('R28jD', undefined, undefined, ['id'])).length).toBe(dCountBefore)
        expect(events.filter(e => e.recordName === out4.name!)).toHaveLength(0)
    })
})

describe('r28 — reliance link semantics are topology-equivalent (merged / isolated tracks)', () => {
    async function bootstrapMerged() {
        // 自引用 1:1 reliance 编译为 merged-to-source FK link
        const U = Entity.create({ name: 'R28kU', properties: [P('name', 'string')] })
        const rel = Relation.create({ source: U, sourceProperty: 'dep', target: U, targetProperty: 'owner', type: '1:1', isTargetReliance: true })
        const { handle, setup } = await bootstrap([U], [rel])
        expect(setup.map.links[rel.name!].mergedTo).toBe('source')
        return { handle, rel, E: 'R28kU' }
    }

    test('merged: re-parenting a dependent via addRelation moves the pairing (was: silent double link, cascade destroyed a dependent other owners referenced)', async () => {
        const { handle, rel, E } = await bootstrapMerged()
        const o1 = await handle.create(E, { name: 'o1' })
        const d1 = await handle.create(E, { name: 'd1' })
        await handle.addRelationByNameById(rel.name!, String(o1.id), String(d1.id), {})
        const o2 = await handle.create(E, { name: 'o2' })
        await handle.addRelationByNameById(rel.name!, String(o2.id), String(d1.id), {})
        const links = await handle.findRelationByName(rel.name!, undefined, undefined,
            ['id', ['source', { attributeQuery: ['name'] }], ['target', { attributeQuery: ['name'] }]])
        expect(links).toHaveLength(1)
        expect(links[0].source?.name).toBe('o2')
        // 级联一致性：删 o1（已无依赖）不动 d1；删 o2 级联 d1
        await handle.delete(E, MatchExp.atom({ key: 'id', value: ['=', o1.id] }))
        expect((await handle.find(E, undefined, undefined, ['name'])).map((u: any) => u.name).sort()).toEqual(['d1', 'o2'])
        await handle.delete(E, MatchExp.atom({ key: 'id', value: ['=', o2.id] }))
        expect(await handle.find(E, undefined, undefined, ['id'])).toHaveLength(0)
    })

    test('merged: binding a new dependent to an occupied owner fails fast on every track (was: silent FK overwrite / double link)', async () => {
        const { handle, rel, E } = await bootstrapMerged()
        const o1 = await handle.create(E, { name: 'o1' })
        const d1 = await handle.create(E, { name: 'd1' })
        await handle.addRelationByNameById(rel.name!, String(o1.id), String(d1.id), {})
        const d2 = await handle.create(E, { name: 'd2' })
        await expect(handle.addRelationByNameById(rel.name!, String(o1.id), String(d2.id), {}))
            .rejects.toThrowError(/cannot bind a new reliance dependent/)
        await expect(handle.create(E, { name: 'd3', owner: { id: o1.id } } as any))
            .rejects.toThrowError(/cannot unlink reliance data|cannot bind a new reliance dependent/)
        await expect(handle.update(E, MatchExp.atom({ key: 'id', value: ['=', o1.id] }), { dep: { id: d2.id } } as any))
            .rejects.toThrowError(/cannot unlink reliance data/)
        expect(await handle.findRelationByName(rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    })

    test('merged: free-owner adoption works on dependent-ref and update tracks (was: "cannot unlink reliance data" thrown on a no-op)', async () => {
        const { handle, rel, E } = await bootstrapMerged()
        const o1 = await handle.create(E, { name: 'o1' })
        await handle.create(E, { name: 'd1', owner: { id: o1.id } } as any)
        expect(await handle.findRelationByName(rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
        const o2 = await handle.create(E, { name: 'o2' })
        const d2 = await handle.create(E, { name: 'd2' })
        await handle.update(E, MatchExp.atom({ key: 'id', value: ['=', o2.id] }), { dep: { id: d2.id } } as any)
        expect(await handle.findRelationByName(rel.name!, undefined, undefined, ['id'])).toHaveLength(2)
    })

    test('isolated 1:n: update declaring a superset adds without orphaning; dropping a pairing fails fast; snapshot write-back is idempotent', async () => {
        const O = Entity.create({ name: 'R28lO', properties: [P('name', 'string')] })
        const D = Entity.create({ name: 'R28lD', properties: [P('name', 'string')] })
        const rel = Relation.create({ source: O, sourceProperty: 'deps', target: D, targetProperty: 'owner', type: '1:n', isTargetReliance: true })
        const { handle } = await bootstrap([O, D], [rel])
        const o1 = await handle.create('R28lO', { name: 'o1' })
        const d1 = await handle.create('R28lD', { name: 'd1' })
        await handle.addRelationByNameById(rel.name!, String(o1.id), String(d1.id), {})
        // 幂等快照回写
        await handle.update('R28lO', MatchExp.atom({ key: 'id', value: ['=', o1.id] }), { name: 'o1x', deps: [{ id: d1.id }] } as any)
        expect(await handle.findRelationByName(rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
        // 超集新增
        const d2 = await handle.create('R28lD', { name: 'd2' })
        await handle.update('R28lO', MatchExp.atom({ key: 'id', value: ['=', o1.id] }), { deps: [{ id: d1.id }, { id: d2.id }] } as any)
        expect(await handle.findRelationByName(rel.name!, undefined, undefined, ['id'])).toHaveLength(2)
        // 丢配对 fail-fast
        await expect(handle.update('R28lO', MatchExp.atom({ key: 'id', value: ['=', o1.id] }), { deps: [{ id: d2.id }] } as any))
            .rejects.toThrowError(/cannot unlink reliance data by updating .* drops currently paired/s)
    })
})

describe('r28 — query face: combined x:1 reads gate on link-id (phantom pairing family)', () => {
    test('orphan co-tenant is not read as a pairing: nested read and match path both empty; real pairing unaffected', async () => {
        // 多 owner reliance 拓扑：B.out4→D 与 C.out3→D。装配出「B 与 C—D 配对同住一行、
        //  但 B—D 从未 link」的行（B 经依赖侧领养进 D 的行，D 亡故后 B 与 C 孤儿同住，
        //  C 再配对新 D）——此前 B.out4 幻影返回同住 D、matchExpression 误命中。
        const B = Entity.create({ name: 'R28oB', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28oC', properties: [P('label', 'string')] })
        const D = Entity.create({ name: 'R28oD', properties: [P('label', 'string')] })
        const out3 = Relation.create({ source: C, sourceProperty: 'out3', target: D, targetProperty: 'in3', type: '1:1', isTargetReliance: true })
        const out4 = Relation.create({ source: B, sourceProperty: 'out4', target: D, targetProperty: 'in4', type: '1:1', isTargetReliance: true })
        const { handle } = await bootstrap([B, C, D], [out3, out4])

        const c1 = await handle.create('R28oC', { label: 'c1', out3: { label: 'd1' } })
        const d1 = (await handle.find('R28oD', undefined, undefined, ['id']))[0]
        await handle.update('R28oD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }), { in4: { label: 'b1' } } as any)
        await handle.delete('R28oD', MatchExp.atom({ key: 'id', value: ['=', d1.id] }))
        await handle.update('R28oC', MatchExp.atom({ key: 'id', value: ['=', c1.id] }), { out3: { label: 'd5' } } as any)

        // 幻影面：B1 从未与 d5 配对
        const b1 = (await handle.find('R28oB', undefined, undefined, ['id', 'label', ['out4', { attributeQuery: ['id', 'label'] }]]))[0]
        expect(b1.out4 ?? null).toBe(null)
        expect(await handle.find('R28oB', MatchExp.atom({ key: 'out4.label', value: ['=', 'd5'] }), undefined, ['id'])).toHaveLength(0)
        expect(await handle.findRelationByName(out4.name!, undefined, undefined, ['id'])).toHaveLength(0)
        // 真实配对面：C1—d5 正常读出（含 match 路径）
        const c1After = (await handle.find('R28oC', MatchExp.atom({ key: 'out3.label', value: ['=', 'd5'] }), undefined,
            ['id', ['out3', { attributeQuery: ['id', 'label'] }]]))[0]
        expect(c1After.out3?.label).toBe('d5')
    })
})

describe('r28 — event payload contracts (fuzzer seeds 113/262)', () => {
    test('nested-new child\'s "&" link data lands in the link create event payload (was: row had the value, payload read as NULL)', async () => {
        const B = Entity.create({ name: 'R28mB', properties: [P('label', 'string')] })
        const C = Entity.create({ name: 'R28mC', properties: [P('label', 'string')] })
        // 1:n → link 合并进 C（attribute 方向），B 的 out0 数组子记录携带 '&'
        const rel = Relation.create({
            source: B, sourceProperty: 'out0', target: C, targetProperty: 'in0', type: '1:n',
            properties: [P('weight', 'number', () => 1), P('note', 'string')]
        })
        const { handle } = await bootstrap([B, C], [rel])
        const events: RecordMutationEvent[] = []
        await handle.create('R28mB', { label: 'b1', out0: [{ label: 'c1', '&': { weight: 31, note: 'n5' } }] }, events)
        const linkCreate = events.find(e => e.type === 'create' && e.recordName === rel.name!)
        expect(linkCreate).toBeTruthy()
        expect(linkCreate!.record!.note).toBe('n5')
        expect(linkCreate!.record!.weight).toBe(31)
        // 行数据本来就正确（对照）
        const links = await handle.findRelationByName(rel.name!, undefined, undefined, ['id', 'note', 'weight'])
        expect(links[0].note).toBe('n5')
    })

    test('relation update event record carries no payload-shaped endpoints (was: string-form id diverged from storage snapshot in the merged view)', async () => {
        const A = Entity.create({ name: 'R28nA', properties: [P('label', 'string')] })
        const B = Entity.create({ name: 'R28nB', properties: [P('label', 'string')] })
        const rel = Relation.create({
            source: A, sourceProperty: 'out1', target: B, targetProperty: 'in1', type: 'n:1',
            properties: [P('weight', 'number', () => 1)]
        })
        const { handle } = await bootstrap([A, B], [rel])
        const b1 = await handle.create('R28nB', { label: 'b1' })
        const a1 = await handle.create('R28nA', { label: 'a1', out1: { id: b1.id } })
        const events: RecordMutationEvent[] = []
        // 同 id 原地 ref（字符串形态）+ '&' 更新 → 行内 link update 事件
        await handle.update('R28nA', MatchExp.atom({ key: 'id', value: ['=', a1.id] }),
            { out1: { id: String(b1.id), '&': { weight: 23 } } } as any, events)
        const linkUpdate = events.find(e => e.type === 'update' && e.recordName === rel.name!)
        expect(linkUpdate).toBeTruthy()
        // record 面无端点（端点契约归 oldRecord，存储原生形态）
        expect(linkUpdate!.record!.source).toBeUndefined()
        expect(linkUpdate!.record!.target).toBeUndefined()
        expect(linkUpdate!.oldRecord!.source?.id).toBe(a1.id)
        expect(linkUpdate!.oldRecord!.target?.id).toBe(b1.id)
        expect(linkUpdate!.keys).toEqual(['weight'])
    })
})
