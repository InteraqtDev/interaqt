/**
 * r27 深度 review 修复回归（storage 面）。
 *
 * F-1：combined（三表合一）子记录载荷中的嵌套结构此前被写路径静默忽略/损坏——
 *  写路径只消费宿主层分类列表，挂在 combined 子记录自身列表上的关系与更深层记录
 *  没有任何执行者处理（只有 value 列经 getSameRowFieldAndValue 递归写入）。实测形态：
 *   - 子记录携带 isolated n:n / 反向合并关系：link 行静默不创建（零告警数据丢失）；
 *   - 子记录携带嵌套新建 n:1：关联记录静默不创建；
 *   - 子记录携带 merged-FK ref：FK 列写入但 link 记录无 id、不可查询、零事件；
 *   - 深度 2 combined 新建：孙记录值写入行内但无 id、无 create 事件、按名查询不可见；
 *   - 新建子记录内嵌 combined ref：旧行不迁移，同一逻辑 id 出现两行（数据损坏）。
 *  修复：preprocessSameRowData 汇合点 fail-fast（create + update 同一守卫），
 *  工作面（值属性 + `&`、ref 整行抢夺、同 id 原地值更新、同 id 幂等嵌套 ref）保持不变。
 */
import { expect, test, describe, afterEach } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";

describe('r27 F-1 — combined child nested structures fail fast instead of silently corrupting', () => {
    let db: SQLiteDB
    afterEach(async () => { if (db) await db.close() })

    function createSchema() {
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Profile = Entity.create({ name: 'Profile', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Avatar = Entity.create({ name: 'Avatar', properties: [Property.create({ name: 'url', type: 'string' })] })
        const Team = Entity.create({ name: 'Team', properties: [Property.create({ name: 'teamName', type: 'string' })] })
        const Company = Entity.create({ name: 'Company', properties: [Property.create({ name: 'companyName', type: 'string' })] })
        const owns = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner', type: '1:1',
            properties: [Property.create({ name: 'viewed', type: 'number' })]
        })
        const has = Relation.create({ source: Profile, sourceProperty: 'avatar', target: Avatar, targetProperty: 'profile', type: '1:1' })
        const membership = Relation.create({ source: Profile, sourceProperty: 'teams', target: Team, targetProperty: 'profiles', type: 'n:n' })
        const employment = Relation.create({ source: Profile, sourceProperty: 'company', target: Company, targetProperty: 'profiles', type: 'n:1' })
        return { entities: [User, Profile, Avatar, Team, Company], relations: [owns, has, membership, employment] }
    }

    async function bootstrap(mergeLinks?: string[]) {
        const { entities, relations } = createSchema()
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup(entities, relations, db, mergeLinks)
        await setup.createTables()
        return new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
    }

    test('create: combined child carrying isolated n:n relation is rejected (was: links silently dropped)', async () => {
        const handle = await bootstrap(['User.profile'])
        const team = await handle.create('Team', { teamName: 't1' })
        await expect(handle.create('User', { name: 'u1', profile: { title: 'p1', teams: [{ id: team.id }] } }))
            .rejects.toThrowError(/combined.*nested relation \(isolated\).*teams/s)
    })

    test('create: combined child carrying nested NEW n:1 record is rejected (was: record silently not created)', async () => {
        const handle = await bootstrap(['User.profile'])
        await expect(handle.create('User', { name: 'u1', profile: { title: 'p1', company: { companyName: 'new-co' } } }))
            .rejects.toThrowError(/combined.*nested relation \(merged link\).*company/s)
    })

    test('create: combined child carrying merged-FK ref is rejected (was: link record had no id and no event)', async () => {
        const handle = await bootstrap(['User.profile'])
        const company = await handle.create('Company', { companyName: 'acme' })
        await expect(handle.create('User', { name: 'u1', profile: { title: 'p1', company: { id: company.id } } }))
            .rejects.toThrowError(/combined.*nested relation \(merged link\).*company/s)
    })

    test('create: depth-2 combined nested-new is rejected (was: grandchild had no id, no event, invisible to find)', async () => {
        const handle = await bootstrap(['User.profile', 'Profile.avatar'])
        await expect(handle.create('User', { name: 'u1', profile: { title: 'p1', avatar: { url: 'a1' } } }))
            .rejects.toThrowError(/combined.*nested combined \(same-row\) record.*avatar/s)
    })

    test('create: NEW combined child carrying nested combined ref is rejected (was: duplicate logical id rows)', async () => {
        const handle = await bootstrap(['User.profile', 'Profile.avatar'])
        const p = await handle.create('Profile', { title: 'p1', avatar: { url: 'a1' } })
        const avatars = await handle.find('Avatar', undefined, undefined, ['*'])
        expect(avatars).toHaveLength(1)
        await expect(handle.create('User', { name: 'u1', profile: { title: 'p2', avatar: { id: avatars[0].id } } }))
            .rejects.toThrowError(/combined.*nested combined \(same-row\) record.*avatar/s)
        // 守卫拒绝后无半写入：Avatar 面仍是单行单 id。
        const avatarsAfter = await handle.find('Avatar', undefined, undefined, ['*'])
        expect(avatarsAfter).toHaveLength(1)
        expect(String(avatarsAfter[0].id)).toBe(String(avatars[0].id))
    })

    test('update: in-place combined ref carrying different-id nested ref is rejected (was: duplicate logical id rows)', async () => {
        const handle = await bootstrap(['User.profile', 'Profile.avatar'])
        // CAUTION 装配顺序（r28 收紧）：认领携带 combined co-tenant 的 profile 现在会被
        //  跨关系同住守卫拒绝（此前 avatar 的 combined link 在行搬迁中静默销毁、零事件），
        //  所以先认领裸 profile，再在原地补 avatar。
        const p1 = await handle.create('Profile', { title: 'p1' })
        const u = await handle.create('User', { name: 'u1', profile: { id: p1.id } })
        await handle.update('Profile', MatchExp.atom({ key: 'id', value: ['=', p1.id] }), { avatar: { url: 'a1' } } as any)
        await handle.create('Profile', { title: 'p2', avatar: { url: 'a2' } })
        const avatars = await handle.find('Avatar', undefined, undefined, ['*'])
        expect(avatars).toHaveLength(2)
        const a2 = avatars.find((a: any) => a.url === 'a2')!
        await expect(handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u.id] }),
            { profile: { id: p1.id, avatar: { id: a2.id } } } as any))
            .rejects.toThrowError(/in-place update of combined.*avatar.*not an idempotent same-id reference/s)
        // 数据面未被污染：仍是两个 avatar、id 不重复。
        const after = await handle.find('Avatar', undefined, undefined, ['*'])
        expect(after).toHaveLength(2)
        expect(new Set(after.map((a: any) => String(a.id))).size).toBe(2)
    })

    test('working cells preserved: value-only nested create with & link data; ref steal; in-place value update; same-id snapshot ref', async () => {
        const handle = await bootstrap(['User.profile'])
        const events: RecordMutationEvent[] = []
        // 1. 值属性 + `&` link 数据的嵌套新建（拓扑矩阵既有工作面）
        const u1 = await handle.create('User', { name: 'u1', profile: { title: 'p1', '&': { viewed: 1 } } }, events)
        expect(events.some(e => e.type === 'create' && e.recordName === 'Profile')).toBe(true)

        // 2. ref 整行抢夺（快照残留豁免）：携带嵌套结构的完整快照作为 ref 依旧放行
        const snapshot = await handle.findOne('Profile', MatchExp.atom({ key: 'id', value: ['=', u1.profile.id] }), undefined,
            ['title', ['company', { attributeQuery: ['companyName'] }]])
        const u2 = await handle.create('User', { name: 'u2', profile: snapshot })
        const owners = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', u1.profile.id] }), undefined, ['name'])
        expect(owners.map(o => o.name)).toEqual(['u2'])

        // 3. 同 id 原地值更新（documented 递归更新面）
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }),
            { profile: { id: u1.profile.id, title: 'p1-renamed' } } as any)
        const profiles = await handle.find('Profile', undefined, undefined, ['title'])
        expect(profiles[0].title).toBe('p1-renamed')

        // 4. 同 id 幂等嵌套 ref（快照 round-trip）：company 先经 update 轨建立（combined 行上
        //    追加 merged FK 的正确轨道——addRelation 的 link-endpoint 认领会触发整行搬迁，
        //    r27 F-5 守卫对跨关系同住行 fail-fast），再整快照回写
        const company = await handle.create('Company', { companyName: 'acme' })
        await handle.update('Profile', MatchExp.atom({ key: 'id', value: ['=', u1.profile.id] }), { company: { id: company.id } } as any)
        // 同住 User link 完好（此前 addRelation 轨在这里静默销毁 owns link 而断言未察觉——F-5 的价值面）
        const ownersAfterAssign = await handle.find('User', MatchExp.atom({ key: 'profile.id', value: ['=', u1.profile.id] }), undefined, ['name'])
        expect(ownersAfterAssign.map(o => o.name)).toEqual(['u2'])
        const fullSnapshot = await handle.findOne('Profile', MatchExp.atom({ key: 'id', value: ['=', u1.profile.id] }), undefined,
            ['title', ['company', { attributeQuery: ['companyName'] }]])
        expect(fullSnapshot.company?.id).toBeTruthy()
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', u2.id] }),
            { profile: fullSnapshot } as any)
        const after = await handle.find('Profile', undefined, undefined, ['title', ['company', { attributeQuery: ['companyName'] }]])
        expect(after[0].company?.companyName).toBe('acme')
    })

    test('control: merged topology accepts the same nested-relation payloads (physical topology must not change legality silently)', async () => {
        const handle = await bootstrap(undefined) // merged (default)
        const team = await handle.create('Team', { teamName: 't1' })
        const company = await handle.create('Company', { companyName: 'acme' })
        await handle.create('User', {
            name: 'u1',
            profile: { title: 'p1', teams: [{ id: team.id }], company: { id: company.id }, avatar: { url: 'a1' } }
        })
        const profiles = await handle.find('Profile', undefined, undefined,
            ['title', ['teams', { attributeQuery: ['teamName'] }], ['company', { attributeQuery: ['companyName'] }], ['avatar', { attributeQuery: ['url'] }]])
        expect(profiles[0].teams).toHaveLength(1)
        expect(profiles[0].company?.companyName).toBe('acme')
        expect(profiles[0].avatar?.url).toBe('a1')
    })
})
