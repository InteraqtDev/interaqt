import { describe, it, expect } from 'vitest';
import { Entity, Relation, Property } from '@core';
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import type { RecordMutationEvent } from '@runtime';

/**
 * r8 显著改进项核实（r2 I-7/I-9 遗留）：combined record（1:1 reliance 自动三表合一）
 * 的挤出（flash-out）/搬迁（relocate）路径的事件完整性。
 *
 * 结论（以本测试固化）：这两条路径内部的 deleteRecordSameRowData / insertSameRowData
 * 是**物理行搬迁**——实体的逻辑身份（id）全程不变，语义上没有实体的删除/重建，
 * 所以**不应该**产生实体级 delete/create 事件（否则下游聚合会被虚假地减/加一次）。
 * 事件流上应该出现且只出现关系层面的事实：旧 link delete（+ 新 link create，抢夺场景）。
 */
describe('combined record (1:1 reliance) event completeness', () => {
    function createModel() {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'nickname', type: 'string' })]
        })
        const OwnProfile = Relation.create({
            source: User,
            sourceProperty: 'profile',
            target: Profile,
            targetProperty: 'owner',
            type: '1:1',
            isTargetReliance: true
        })
        return { User, Profile, OwnProfile }
    }

    it('stealing a combined profile emits old-link delete + new-link create, and no spurious entity events', async () => {
        const db = new PGLiteDB()
        await db.open()
        const { User, Profile, OwnProfile } = createModel()
        const setup = new DBSetup([User, Profile], [OwnProfile], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

        // A 与 profile P 三表合一同行存储
        const a = await handle.create('User', { name: 'A', profile: { nickname: 'p1' } })
        const aWithProfile = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id', 'nickname'] }]])
        const profileId = aWithProfile.profile.id

        // B 抢夺 P（flash-out 路径）
        const events: RecordMutationEvent[] = []
        const b = await handle.create('User', { name: 'B', profile: { id: profileId } }, events)

        // 关系层面的事实完整：旧 link delete + 新 link create
        const linkDeletes = events.filter(e => e.type === 'delete' && e.recordName === OwnProfile.name)
        const linkCreates = events.filter(e => e.type === 'create' && e.recordName === OwnProfile.name)
        expect(linkDeletes.length).toBe(1)
        expect(linkCreates.length).toBe(1)

        // 实体层面：P 的身份从未消失，不允许出现 Profile 的 delete/create 事件
        // （只有 B 自己的 create 事件）。
        expect(events.some(e => e.recordName === 'Profile' && e.type === 'delete')).toBe(false)
        expect(events.some(e => e.recordName === 'Profile' && e.type === 'create')).toBe(false)

        // 数据完整：P 归属 B，A 不再有 profile
        const bWithProfile = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', b.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id', 'nickname'] }]])
        expect(bWithProfile.profile?.id).toBe(profileId)
        expect(bWithProfile.profile?.nickname).toBe('p1')
        const aAfter = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id'] }]])
        expect(aAfter.profile?.id).toBeUndefined()

        await db.close()
    })

    it('unlinking a combined profile relocates the row without spurious entity events', async () => {
        // relocate 路径只对非 reliance 的 combined link 可达（reliance unlink 是业务级 fail-fast，
        //  只能删记录）；非 reliance 的三表合一目前只能通过 DBSetup 的 mergeLinks 参数配置。
        const db = new PGLiteDB()
        await db.open()
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        })
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'nickname', type: 'string' })]
        })
        const OwnProfile = Relation.create({
            source: User,
            sourceProperty: 'profile',
            target: Profile,
            targetProperty: 'owner',
            type: '1:1'
        })
        const setup = new DBSetup([User, Profile], [OwnProfile], db, ['User.profile'])
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

        const a = await handle.create('User', { name: 'A', profile: { nickname: 'p1' } })
        const aWithProfile = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id'] }]])
        const profileId = aWithProfile.profile.id

        // 解除关系（relocate 路径：P 的行数据搬到独立行）
        const events: RecordMutationEvent[] = []
        await handle.update('User', MatchExp.atom({ key: 'id', value: ['=', a.id] }), { profile: null }, events)

        const linkDeletes = events.filter(e => e.type === 'delete' && e.recordName === OwnProfile.name)
        expect(linkDeletes.length).toBe(1)
        expect(events.some(e => e.recordName === 'Profile' && e.type === 'delete')).toBe(false)
        expect(events.some(e => e.recordName === 'Profile' && e.type === 'create')).toBe(false)

        // P 仍然存在（独立行），数据不丢
        const profile = await handle.findOne('Profile', MatchExp.atom({ key: 'id', value: ['=', profileId] }), undefined,
            ['id', 'nickname'])
        expect(profile?.nickname).toBe('p1')

        await db.close()
    })
})
