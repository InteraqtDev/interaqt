import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@core';
import { PGLiteDB } from '@drivers';
import { afterEach, describe, expect, test } from "vitest";

/**
 * C2（performance-debt-plan §六 3.2 / r2-I-5「级联删除无深度上限」）的再定谳回归。
 *
 * r2 记录的威胁是「深链依赖图可栈溢出/长事务」。逐形态探针核实（2026-07-16）：
 *  1. combined（1:1 合表）互 reliance 的数据环**不可构造**——r27 的跨关系同住认领守卫
 *     在建第二条关系时 fail-fast（assertNoNonRelianceCoTenant 家族）；
 *  2. merged（1:n reliance）互 reliance 的数据环删除**正常终止**（递归到达时连接行
 *     已删，match 落空自然见底）；
 *  3. 深自引用 reliance 链（300 节点）删除**正常终止**且无栈溢出（级联是 async 递归，
 *     await 边界不增长原生栈；实测 <1s）。
 *
 * 结论：原记录的「深度熔断守卫」不再需要——反而会误伤合法的深链数据（版本链等）。
 * 本 spec 把三个边界钉成回归：若未来写路径改动让环重新可构造/不终止，用例会以
 * 超时或断言失败现形。
 */

describe('cascade deletion boundaries (C2 re-verdict)', () => {
    afterEach(() => {
        Entity.instances.length = 0
        Relation.instances.length = 0
        Property.instances.length = 0
    })

    test('combined mutual-reliance data cycle is unconstructible (claim-time fail-fast)', async () => {
        const A = Entity.create({ name: 'CycA', properties: [Property.create({ name: 'name', type: 'string' })] })
        const B = Entity.create({ name: 'CycB', properties: [Property.create({ name: 'name', type: 'string' })] })
        Relation.create({ source: A, sourceProperty: 'b', target: B, targetProperty: 'aOwner', type: '1:1', isTargetReliance: true })
        Relation.create({ source: B, sourceProperty: 'a', target: A, targetProperty: 'bOwner', type: '1:1', isTargetReliance: true })

        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([A, B], Relation.instances.filter(r => [A, B].includes(r.source as never)), db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const a1 = await handle.create('CycA', { name: 'a1' })
        const b1 = await handle.create('CycB', { name: 'b1', aOwner: { id: a1.id } })
        // 闭环第二条边在 flashOut 认领时被同住守卫拒绝——环不可达，删除面无环可挂
        await expect(
            handle.addRelationByNameById(handle.getRelationName('CycB', 'a'), b1.id, a1.id, {})
        ).rejects.toThrow(/row migration does not carry combined pairings/)

        await db.close()
    })

    test('merged (1:n) mutual-reliance data cycle deletes terminally with both members gone', async () => {
        const A = Entity.create({ name: 'MCycA', properties: [Property.create({ name: 'name', type: 'string' })] })
        const B = Entity.create({ name: 'MCycB', properties: [Property.create({ name: 'name', type: 'string' })] })
        Relation.create({ source: A, sourceProperty: 'bs', target: B, targetProperty: 'aOwner', type: '1:n', isTargetReliance: true })
        Relation.create({ source: B, sourceProperty: 'as', target: A, targetProperty: 'bOwner', type: '1:n', isTargetReliance: true })

        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([A, B], Relation.instances.filter(r => [A, B].includes(r.source as never)), db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const a1 = await handle.create('MCycA', { name: 'a1' })
        const b1 = await handle.create('MCycB', { name: 'b1', aOwner: { id: a1.id } })
        await handle.addRelationByNameById(handle.getRelationName('MCycB', 'as'), b1.id, a1.id, {})

        // 环上删除必须终止（用例超时即回归信号），且两个成员都随环消亡
        await handle.delete('MCycA', MatchExp.atom({ key: 'id', value: ['=', a1.id] }))
        expect(await handle.find('MCycA', undefined, undefined, ['id'])).toHaveLength(0)
        expect(await handle.find('MCycB', undefined, undefined, ['id'])).toHaveLength(0)

        await db.close()
    }, 15000)

    test('deep self-reliance chain (300 nodes) cascades without stack overflow', async () => {
        const Node = Entity.create({ name: 'ChainNode', properties: [Property.create({ name: 'idx', type: 'number' })] })
        Relation.create({ source: Node, sourceProperty: 'next', target: Node, targetProperty: 'prev', type: '1:1', isTargetReliance: true })

        const db = new PGLiteDB()
        await db.open()
        const setup = new DBSetup([Node], Relation.instances.filter(r => r.source === Node), db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const DEPTH = 300
        const head = await handle.create('ChainNode', { idx: 0 })
        let prev = head
        const relName = handle.getRelationName('ChainNode', 'next')
        for (let i = 1; i < DEPTH; i++) {
            const node = await handle.create('ChainNode', { idx: i })
            await handle.addRelationByNameById(relName, prev.id, node.id, {})
            prev = node
        }
        expect(await handle.find('ChainNode', undefined, undefined, ['id'])).toHaveLength(DEPTH)

        await handle.delete('ChainNode', MatchExp.atom({ key: 'id', value: ['=', head.id] }))
        expect(await handle.find('ChainNode', undefined, undefined, ['id'])).toHaveLength(0)

        await db.close()
    }, 120000)
})
