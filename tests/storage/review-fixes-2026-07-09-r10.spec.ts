import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from '@storage';
import { PGLiteDB, SQLiteDB } from '@drivers';

/**
 * r10 review 回归（storage/core 侧）。
 *
 * F-2: merged 编译把全部 input 的属性合并进同一物理表，属性命名空间被共享——
 *      此前以 input A 的名义写 input B 的特有属性会静默落库（跨视图列污染）；
 *      未声明的属性名（拼写错误）也被 groupAttributes 静默丢弃（零告警数据丢失）。
 *      现在公共写入口 fail-fast；携带 id 的嵌套 ref 载荷（记录快照 round-trip）保持豁免。
 *
 * F-3: json/collection 字段的 =/!= 匹配此前参数不做序列化——PG/PGLite 直接抛
 *      "operator does not exist: json = unknown" 的裸数据库错误，文本型存储恒零命中。
 *      现在与写入路径一致地序列化（PG 系走 ::jsonb 语义比较）。
 *
 * F-4: baseEntity/baseRelation 不带 matchExpression 的"filtered 视图"没有语义，
 *      此前 setup/查询在深处抛裸 TypeError，现在声明期 fail-fast。
 *
 * R-3: Relation.create 此前不校验 type，畸形值静默流入 relType.split(':')，
 *      产出不可预测的存储布局。现在白名单校验。
 *
 * R-4: match/attributeQuery 路径越过值属性继续深入时，此前抛
 *      "Cannot read properties of undefined" 的裸 TypeError，现在给出指明路径的错误。
 */

async function setupHandle(entities: any[], relations: any[]) {
    const db = new PGLiteDB()
    await db.open()
    const setup = new DBSetup(entities, relations, db)
    await setup.createTables()
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    return { db, handle }
}

describe('r10 F-2: merged input property namespace is guarded at the write entry', () => {
    function makeMergedFamily(suffix: string) {
        const Customer = Entity.create({
            name: `Customer${suffix}`,
            properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'level', type: 'string' })]
        })
        const Vendor = Entity.create({
            name: `Vendor${suffix}`,
            properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'vendorCode', type: 'string' })]
        })
        const Contact = Entity.create({ name: `Contact${suffix}`, inputEntities: [Customer, Vendor] })
        return { Customer, Vendor, Contact }
    }

    test('writing a sibling input property through another input fails fast (create and update)', async () => {
        const { Customer, Vendor, Contact } = makeMergedFamily('R10A')
        const { db, handle } = await setupHandle([Customer, Vendor, Contact], [])

        await expect(handle.create('CustomerR10A', { name: 'c', vendorCode: 'X' }))
            .rejects.toThrow(/property "vendorCode" is not declared on "CustomerR10A"/)

        const c = await handle.create('CustomerR10A', { name: 'c', level: 'gold' })
        await expect(handle.update('CustomerR10A', MatchExp.atom({ key: 'id', value: ['=', c.id] }), { vendorCode: 'X' }))
            .rejects.toThrow(/belongs to another input of merged record "ContactR10A"/)

        // 自己声明面内的写入照常可用
        await handle.update('CustomerR10A', MatchExp.atom({ key: 'id', value: ['=', c.id] }), { level: 'silver' })
        const read = await handle.findOne('CustomerR10A', MatchExp.atom({ key: 'id', value: ['=', c.id] }), {}, ['name', 'level'])
        expect(read.level).toBe('silver')
        await db.close()
    })
})

describe('r10 F-2: unknown payload keys fail fast instead of silent drop', () => {
    test('typo keys are rejected; ref payloads and _rowId round-trips stay legal', async () => {
        const User = Entity.create({ name: 'UserR10B', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Post = Entity.create({ name: 'PostR10B', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Rel = Relation.create({ source: User, sourceProperty: 'posts', target: Post, targetProperty: 'owner', type: '1:n' })
        const { db, handle } = await setupHandle([User, Post], [Rel])

        await expect(handle.create('UserR10B', { nmae: 'Alice' }))
            .rejects.toThrow(/unknown attribute "nmae" in write payload for "UserR10B"/)

        const u = await handle.create('UserR10B', { name: 'Alice' })
        await expect(handle.update('UserR10B', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { nmae: 'Bob' }))
            .rejects.toThrow(/unknown attribute "nmae"/)

        // 框架返回的记录（含 _rowId）round-trip 回写、以及携带快照字段的 ref 载荷是合法形态
        const userSnapshot = await handle.findOne('UserR10B', MatchExp.atom({ key: 'id', value: ['=', u.id] }), {}, ['*'])
        const p = await handle.create('PostR10B', { title: 't', owner: { ...userSnapshot, extraneousSnapshotField: 1 } })
        const readBack = await handle.findOne('PostR10B', MatchExp.atom({ key: 'id', value: ['=', p.id] }), {}, ['title', ['owner', { attributeQuery: ['name'] }]])
        expect(readBack.owner.name).toBe('Alice')
        await db.close()
    })
})

describe('r10 F-3: json field equality match', () => {
    test('collection property = / != works on PGLite (jsonb semantic comparison)', async () => {
        const Doc = Entity.create({
            name: 'DocR10C',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'tags', type: 'string', collection: true })
            ]
        })
        const { db, handle } = await setupHandle([Doc], [])
        await handle.create('DocR10C', { title: 'a', tags: ['x', 'y'] })
        await handle.create('DocR10C', { title: 'b', tags: ['z'] })
        await handle.create('DocR10C', { title: 'c' }) // tags 为 NULL 的行不参与 =/!= 匹配

        const eq = await handle.find('DocR10C', MatchExp.atom({ key: 'tags', value: ['=', ['x', 'y']] }), {}, ['title'])
        expect(eq.map(r => r.title)).toEqual(['a'])

        const ne = await handle.find('DocR10C', MatchExp.atom({ key: 'tags', value: ['!=', ['x', 'y']] }), {}, ['title'])
        expect(ne.map(r => r.title)).toEqual(['b'])
        await db.close()
    })

    test('collection property = works on SQLite (serialized text comparison)', async () => {
        const Doc = Entity.create({
            name: 'DocR10D',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'tags', type: 'string', collection: true })
            ]
        })
        const db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([Doc], [], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        await handle.create('DocR10D', { title: 'a', tags: ['x', 'y'] })
        await handle.create('DocR10D', { title: 'b', tags: ['z'] })
        const eq = await handle.find('DocR10D', MatchExp.atom({ key: 'tags', value: ['=', ['x', 'y']] }), {}, ['title'])
        expect(eq.map(r => r.title)).toEqual(['a'])
        await db.close()
    })
})

describe('r10 F-4: filtered view without matchExpression is rejected at declaration time', () => {
    test('filtered entity', () => {
        const U = Entity.create({ name: 'UserR10E', properties: [Property.create({ name: 'name', type: 'string' })] })
        expect(() => Entity.create({ name: 'AllUserR10E', baseEntity: U }))
            .toThrow(/declares baseEntity but no matchExpression/)
    })

    test('filtered relation', () => {
        const U = Entity.create({ name: 'UserR10F', properties: [Property.create({ name: 'name', type: 'string' })] })
        const P = Entity.create({ name: 'PostR10F', properties: [Property.create({ name: 'title', type: 'string' })] })
        const base = Relation.create({ source: U, sourceProperty: 'posts', target: P, targetProperty: 'owner', type: '1:n' })
        expect(() => Relation.create({ baseRelation: base, sourceProperty: 'activePosts', targetProperty: 'activeOwner' }))
            .toThrow(/declares baseRelation but no matchExpression/)
    })
})

describe('r10 R-3: Relation.create validates type', () => {
    test('malformed type values are rejected', () => {
        const A = Entity.create({ name: 'AR10G', properties: [Property.create({ name: 'name', type: 'string' })] })
        const B = Entity.create({ name: 'BR10G', properties: [Property.create({ name: 'name', type: 'string' })] })
        expect(() => Relation.create({ source: A, sourceProperty: 'bs', target: B, targetProperty: 'as', type: 'bogus' }))
            .toThrow(/Relation type "bogus" is invalid/)
        expect(() => Relation.create({ source: A, sourceProperty: 'bs2', target: B, targetProperty: 'as2', type: 'n:n:extra' }))
            .toThrow(/Relation type "n:n:extra" is invalid/)
        // 合法值照常可用
        const rel = Relation.create({ source: A, sourceProperty: 'bs3', target: B, targetProperty: 'as3', type: 'n:n' })
        expect(rel.type).toBe('n:n')
    })
})

describe('r10 R-4: attribute path past a value attribute gives a clear error', () => {
    test('match path continuing after a value attribute', async () => {
        const U = Entity.create({ name: 'UserR10H', properties: [Property.create({ name: 'name', type: 'string' })] })
        const P = Entity.create({ name: 'PostR10H', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Rel = Relation.create({ source: U, sourceProperty: 'posts', target: P, targetProperty: 'owner', type: '1:n' })
        const { db, handle } = await setupHandle([U, P], [Rel])
        await expect(handle.find('PostR10H', MatchExp.atom({ key: 'owner.name.extra', value: ['=', 'x'] }), {}, ['title']))
            .rejects.toThrow(/"name" is a value attribute and cannot be traversed further/)
        await db.close()
    })
})
