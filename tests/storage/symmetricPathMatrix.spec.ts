/**
 * 对称关系路径查询矩阵（r17 复盘落地项，盲区 3/4：多跳 × 端点形态成积）。
 *
 * 背景：r17 F-4 暴露「路径中的对称段只展开第一段」——`friends.friends.*` 静默半结果，
 * 且代码注释断言「路径中只可能有一个对称关系」从未被测试挑战。本矩阵把
 * 【跳数（1/2/3）× 端点形态（值字段 / & 关系字段 / 关系 id）】铺满，
 * 并固化对称 fan-out 下 `&` 数据按边归属挂载的回归（对称聚合矩阵首跑发现的错挂 bug）。
 */
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';

describe('symmetric path query matrix', () => {
    let db: SQLiteDB
    let handle: EntityQueryHandle
    let relationName: string
    let ids: Record<string, string>

    // 链型装置：A—B—C—D（带 & weight），保证 source/target 方向交错
    beforeEach(async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            type: 'n:n',
            properties: [Property.create({ name: 'weight', type: 'number' })]
        })
        relationName = friends.name!
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([User], [friends], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        ids = {}
        for (const name of ['A', 'B', 'C', 'D']) {
            ids[name] = (await handle.create('User', { name })).id
        }
        // 方向交错：A→B、C→B（B 在 target 侧两次）、C→D
        await handle.addRelationByNameById(relationName, ids.A, ids.B, { weight: 1 })
        await handle.addRelationByNameById(relationName, ids.C, ids.B, { weight: 2 })
        await handle.addRelationByNameById(relationName, ids.C, ids.D, { weight: 3 })
    })

    afterEach(async () => { await db.close() })

    async function findNames(matchKey: string, value: unknown): Promise<string[]> {
        const rows = await handle.find('User', MatchExp.atom({ key: matchKey, value: ['=', value] }), undefined, ['name'])
        return [...new Set(rows.map(r => r.name))].sort()
    }

    test('1-hop: value endpoint reaches through both sides', async () => {
        // B 的朋友：A（B 在 target 侧）、C（B 在 target 侧，C 是 source）
        expect(await findNames('friends.name', 'B')).toEqual(['A', 'C'])
        // C 的朋友：B、D
        expect(await findNames('friends.name', 'C')).toEqual(['B', 'D'])
    })

    test('2-hop: value endpoint expands BOTH symmetric segments (cartesian)', async () => {
        // 谁的「朋友的朋友」里有 A：A 的朋友是 B，B 的朋友是 A、C → C（经 B）、A（经 B 回环）
        expect(await findNames('friends.friends.name', 'A')).toEqual(['A', 'C'])
        // 有 D：D 的朋友是 C，C 的朋友是 B、D → B（经 C）、D（回环）
        expect(await findNames('friends.friends.name', 'D')).toEqual(['B', 'D'])
        // 有 B：B 是 A、C 的朋友，A 的朋友 {B}、C 的朋友 {B,D} → B（回环）、D（经 C）
        expect(await findNames('friends.friends.name', 'B')).toEqual(['B', 'D'])
    })

    test('2-hop: & endpoint (link id / link field) reaches hosts through both sides of both hops', async () => {
        const links = await handle.findRelationByName(relationName, undefined, undefined,
            ['id', 'weight', ['source', { attributeQuery: ['name'] }], ['target', { attributeQuery: ['name'] }]])
        const cdLink = links.find((l: any) => [l.source.name, l.target.name].sort().join() === 'C,D')!

        // 第二跳的边是 C—D：宿主 = C 的朋友 ∪ D 的朋友 = {B,D} ∪ {C}
        expect(await findNames('friends.friends.&.id', cdLink.id)).toEqual(['B', 'C', 'D'])
        // 按 & 值字段匹配（weight=3 只有 C—D 边）
        expect(await findNames('friends.friends.&.weight', 3)).toEqual(['B', 'C', 'D'])
        // 1 跳对照
        expect(await findNames('friends.&.weight', 3)).toEqual(['C', 'D'])
    })

    test('3-hop: three symmetric segments expand as 8 variants', async () => {
        // 谁的 friends.friends.friends 里有 A：
        //  A: A→B→A→B? 3 跳可达 = 路径长 3 的可达点。手工枚举：
        //  A→B→{A,C}→(A 的朋友 B / C 的朋友 {B,D})：从 A 出发 3 跳 → {B, D}（B 经回环，D 经 C）
        //  即「3 跳内含 A」的宿主 = 从 A 反向 3 跳可达 = {B, D}
        expect(await findNames('friends.friends.friends.name', 'A')).toEqual(['B', 'D'])
    })

    test('symmetric fan-out: & data attaches to the OWN edge, never a sibling edge of the far endpoint', async () => {
        // 回归（对称聚合矩阵首跑发现）：B 在 target 侧有两条边（A—B w=1、C—B w=2），
        //  查 A.friends 时 B 行上两个方向变体同时有值，必须选「连接到 A 的那条」。
        const aRow = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', ids.A] }), undefined,
            ['name', ['friends', { attributeQuery: ['name', ['&', { attributeQuery: ['weight'] }]] }]])
        expect(Object.fromEntries((aRow.friends || []).map((f: any) => [f.name, f['&']?.weight]))).toEqual({ B: 1 })

        const cRow = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', ids.C] }), undefined,
            ['name', ['friends', { attributeQuery: ['name', ['&', { attributeQuery: ['weight'] }]] }]])
        expect(Object.fromEntries((cRow.friends || []).map((f: any) => [f.name, f['&']?.weight]))).toEqual({ B: 2, D: 3 })

        const bRow = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', ids.B] }), undefined,
            ['name', ['friends', { attributeQuery: ['name', ['&', { attributeQuery: ['weight'] }]] }]])
        expect(Object.fromEntries((bRow.friends || []).map((f: any) => [f.name, f['&']?.weight]))).toEqual({ A: 1, C: 2 })
    })

    test('symmetric fan-out: user-declared source/target inside & are preserved (incl. nested entity attrs), undeclared are stripped', async () => {
        // 端点数据是实现为挂载判据强制附带的，用户没要就要剥掉；用户显式要了必须保留，
        // 包括端点实体的嵌套属性（link 上嵌套 x:1 的 JOIN 需与方向变体同步展开，r17 修复）。
        const aRow = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', ids.A] }), undefined,
            ['name', ['friends', { attributeQuery: ['name', ['&', { attributeQuery: ['weight', ['source', { attributeQuery: ['name'] }], ['target', { attributeQuery: ['name'] }]] }]] }]])
        const bFriend = (aRow.friends || []).find((f: any) => f.name === 'B')
        // A—B 边是 A→B 建立的：source=A、target=B
        expect(bFriend['&'].source?.name).toBe('A')
        expect(bFriend['&'].target?.name).toBe('B')

        const aRowNoEndpoint = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', ids.A] }), undefined,
            ['name', ['friends', { attributeQuery: ['name', ['&', { attributeQuery: ['weight'] }]] }]])
        const bFriend2 = (aRowNoEndpoint.friends || []).find((f: any) => f.name === 'B')
        expect(bFriend2['&'].source).toBeUndefined()
        expect(bFriend2['&'].target).toBeUndefined()
    })
})
