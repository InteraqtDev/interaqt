/**
 * r30 深度 review 修复回归（storage 面）。
 *
 * A｜filtered relation 落在 combined base 上时嵌套读取被 prune 误删（r28 引入 prune 后的致命回归）。
 *   根因：AttributeQuery 的「combined x:1 需附带 `&` 判真」按 **filtered link** 的拓扑求值
 *   （createFilteredLink 无 mergedTo → 恒非 combined → 不附带 `&`），而 QueryExecutor.pruneUnpairedCombinedReads
 *   按 **base 属性名** 判 isCombined（filtered 查询已把 attributeName 解析为 base → combined）。两侧读不同拓扑：
 *   prune 认为该读是 combined、又找不到 `&`.id → 把真实配对整体删除（静默空读）。
 *   收敛修复：两侧统一按 base 拓扑判定（AttributeQuery 用 getBaseAttributeInfo() 求 combined）。
 *
 * A-兼联面｜filtered x:1 属性下的 x:n / 深层 x:1 补全按 base 属性名读取，filtered 结果挂在 alias 上
 *   → 永远补不出来（按 base 名读到 undefined 而静默跳过）。修复：补全枝干统一按 alias || attributeName 读取。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from '@storage';
import { SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core';

describe('r30 storage review fixes', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => { db = new SQLiteDB(); await db.open() })
    afterEach(async () => { await db.close() })

    test('A: filtered relation over a COMBINED 1:1 base — nested read returns the real pairing (was: pruned to empty)', async () => {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Profile = Entity.create({ name: 'Profile', properties: [Property.create({ name: 'title', type: 'string' })] })
        const UserProfile = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1', isTargetReliance: true, // -> combined (three-tables-in-one)
            properties: [Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => false })]
        })
        const PrimaryProfile = Relation.create({
            name: 'PrimaryProfile', baseRelation: UserProfile,
            sourceProperty: 'primaryProfile', targetProperty: 'primaryOwner',
            matchExpression: MatchExp.atom({ key: 'isPrimary', value: ['=', true] })
        })
        setup = new DBSetup([User, Profile], [UserProfile, PrimaryProfile], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        expect(setup.map.links[UserProfile.name!].mergedTo).toBe('combined')

        const user = await handle.create('User', { name: 'u1', profile: { title: 'p1', '&': { isPrimary: true } } })

        // base attribute read (control) works
        const viaBase = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id', 'title'] }]])
        expect(viaBase.profile?.title).toBe('p1')

        // relation-by-name read (link-id truth source) works
        expect(await handle.findRelationByName('PrimaryProfile', undefined, undefined, ['id'])).toHaveLength(1)

        // the regression: nested read through the filtered attribute must return the real pairing
        const viaFiltered = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['primaryProfile', { attributeQuery: ['id', 'title'] }]])
        expect(viaFiltered.primaryProfile?.title).toBe('p1')

        // user requested no '&' -> synthetic link id must be stripped from the result
        expect(viaFiltered.primaryProfile['&']).toBeUndefined()
    })

    test('A: an explicit "&" request on a filtered combined read still surfaces the link id', async () => {
        const User = Entity.create({ name: 'U', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Profile = Entity.create({ name: 'P', properties: [Property.create({ name: 'title', type: 'string' })] })
        const UserProfile = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1', isTargetReliance: true,
            properties: [Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => false })]
        })
        const PrimaryProfile = Relation.create({
            name: 'PrimaryProfile2', baseRelation: UserProfile,
            sourceProperty: 'primaryProfile', targetProperty: 'primaryOwner',
            matchExpression: MatchExp.atom({ key: 'isPrimary', value: ['=', true] })
        })
        setup = new DBSetup([User, Profile], [UserProfile, PrimaryProfile], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        const user = await handle.create('U', { name: 'u1', profile: { title: 'p1', '&': { isPrimary: true } } })
        const r = await handle.findOne('U', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['primaryProfile', { attributeQuery: ['id', 'title', ['&', { attributeQuery: ['id', 'isPrimary'] }]] }]])
        expect(r.primaryProfile?.title).toBe('p1')
        expect(r.primaryProfile['&']?.id).toBeDefined()
    })

    test('A-sibling: nested x:n under a filtered x:1 attribute is backfilled (alias vs base attributeName)', async () => {
        const User = Entity.create({ name: 'U2', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Dept = Entity.create({ name: 'D2', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Tag = Entity.create({ name: 'T2', properties: [Property.create({ name: 'label', type: 'string' })] })
        const UserDept = Relation.create({
            source: User, sourceProperty: 'dept', target: Dept, targetProperty: 'members', type: 'n:1',
            properties: [Property.create({ name: 'isMain', type: 'boolean', defaultValue: () => false })]
        })
        const MainDept = Relation.create({
            name: 'MainDept2', baseRelation: UserDept, sourceProperty: 'mainDept', targetProperty: 'mainMembers',
            matchExpression: MatchExp.atom({ key: 'isMain', value: ['=', true] })
        })
        const DeptTag = Relation.create({ source: Dept, sourceProperty: 'tags', target: Tag, targetProperty: 'depts', type: 'n:n' })
        setup = new DBSetup([User, Dept, Tag], [UserDept, MainDept, DeptTag], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const dept = await handle.create('D2', { title: 'd1', tags: [{ label: 't1' }, { label: 't2' }] })
        const user = await handle.create('U2', { name: 'u1', dept: { id: dept.id, '&': { isMain: true } } })

        // base attribute nested x:n (control)
        const viaBase = await handle.findOne('U2', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['dept', { attributeQuery: ['id', 'title', ['tags', { attributeQuery: ['id', 'label'] }]] }]])
        expect(viaBase.dept?.tags?.length).toBe(2)

        // filtered attribute nested x:n must be backfilled too
        const viaFiltered = await handle.findOne('U2', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['mainDept', { attributeQuery: ['id', 'title', ['tags', { attributeQuery: ['id', 'label'] }]] }]])
        expect(viaFiltered.mainDept?.title).toBe('d1')
        expect(viaFiltered.mainDept?.tags?.length).toBe(2)
    })

    test('A-guard: non-filtered combined x:1 reads still return the pairing and strip synthetic "&"', async () => {
        // regression guard: the reorder must not disturb the plain combined x:1 read.
        const User = Entity.create({ name: 'U3', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Profile = Entity.create({ name: 'P3', properties: [Property.create({ name: 'title', type: 'string' })] })
        const UserProfile = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1', isTargetReliance: true
        })
        setup = new DBSetup([User, Profile], [UserProfile], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        const user = await handle.create('U3', { name: 'u1', profile: { title: 'p1' } })
        const r = await handle.findOne('U3', MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id', 'title'] }]])
        expect(r.profile?.title).toBe('p1')
        expect(r.profile['&']).toBeUndefined()
    })
})
