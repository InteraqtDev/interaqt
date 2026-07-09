import { describe, it, expect } from 'vitest';
import { Entity, Relation, Property } from '@core';
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';

/**
 * r8 F-1 回归：以 filtered entity 为端点的 relation。
 *
 * 根因：populateRecordAttributes 只把关系属性写到 filtered entity 的 record 上，
 * 而查询编译（RecordQuery.create）统一按 resolvedBaseRecordName 解析属性、
 * copyAttributesToFilteredEntities 又会用 base 的属性表整体覆盖 filtered 的属性表——
 * 于是该关系属性在 schema map 里彻底消失，任何经由它的查询/级联全部崩溃或静默失效。
 */
describe('r8 F-1: relation with filtered entity endpoint survives setup and works end-to-end', () => {
    function createModel() {
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })
        const Post = Entity.create({
            name: 'Post',
            properties: [Property.create({ name: 'title', type: 'string' })]
        })
        const ActiveUser = Entity.create({
            name: 'ActiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] })
        })
        return { User, Post, ActiveUser }
    }

    it('filtered entity as relation source: attribute registered on base + filtered, query works from both names', async () => {
        const db = new PGLiteDB()
        await db.open()
        const { User, Post, ActiveUser } = createModel()
        const ActiveUserPostRelation = Relation.create({
            source: ActiveUser,
            sourceProperty: 'activePosts',
            target: Post,
            targetProperty: 'activeAuthor',
            type: '1:n'
        })

        const setup = new DBSetup([User, Post, ActiveUser], [ActiveUserPostRelation], db)
        await setup.createTables()

        // 属性必须同时登记在 filtered 与 resolved base record 上
        expect(Object.keys(setup.map.records['ActiveUser'].attributes)).toContain('activePosts')
        expect(Object.keys(setup.map.records['User'].attributes)).toContain('activePosts')

        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
        const u1 = await handle.create('User', { name: 'u1', isActive: true })
        await handle.create('Post', { title: 'p1', activeAuthor: { id: u1.id } })

        // 从 filtered 名查询
        const viaFiltered = await handle.findOne('ActiveUser',
            MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined,
            ['id', 'name', ['activePosts', { attributeQuery: ['id', 'title'] }]])
        expect(viaFiltered.activePosts).toHaveLength(1)
        expect(viaFiltered.activePosts[0].title).toBe('p1')

        // 从 base 名查询（filtered 与 base 共享同一属性命名空间）
        const viaBase = await handle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined,
            ['id', ['activePosts', { attributeQuery: ['id'] }]])
        expect(viaBase.activePosts).toHaveLength(1)

        // 反向端也可用
        const post = await handle.findOne('Post', undefined, undefined,
            ['id', 'title', ['activeAuthor', { attributeQuery: ['id', 'name'] }]])
        expect(post.activeAuthor?.id).toBe(u1.id)

        await db.close()
    })

    it('deleting the base entity cleans up links declared on the filtered endpoint (no orphan links)', async () => {
        const db = new PGLiteDB()
        await db.open()
        const { User, Post, ActiveUser } = createModel()
        const ActiveUserPostRelation = Relation.create({
            source: ActiveUser,
            sourceProperty: 'activePosts',
            target: Post,
            targetProperty: 'activeAuthor',
            type: '1:n'
        })
        const setup = new DBSetup([User, Post, ActiveUser], [ActiveUserPostRelation], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)

        const u1 = await handle.create('User', { name: 'u1', isActive: true })
        await handle.create('Post', { title: 'p1', activeAuthor: { id: u1.id } })

        await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', u1.id] }))

        // 删除 base 实体后，经由 filtered 端点声明的关系不能留下孤儿 link
        const links = await handle.find(ActiveUserPostRelation.name!, undefined, undefined,
            ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]])
        expect(links).toHaveLength(0)

        await db.close()
    })

    it('filtered entity as relation target: targetProperty registered on base record too', async () => {
        const db = new PGLiteDB()
        await db.open()
        const { User, Post, ActiveUser } = createModel()
        const PostActiveUserRelation = Relation.create({
            source: Post,
            sourceProperty: 'reviewer',
            target: ActiveUser,
            targetProperty: 'reviewedPosts',
            type: 'n:1'
        })
        const setup = new DBSetup([User, Post, ActiveUser], [PostActiveUserRelation], db)
        await setup.createTables()

        expect(Object.keys(setup.map.records['User'].attributes)).toContain('reviewedPosts')
        expect(Object.keys(setup.map.records['ActiveUser'].attributes)).toContain('reviewedPosts')

        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
        const u1 = await handle.create('User', { name: 'u1', isActive: true })
        await handle.create('Post', { title: 'p1', reviewer: { id: u1.id } })

        const viaBase = await handle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', u1.id] }), undefined,
            ['id', ['reviewedPosts', { attributeQuery: ['id', 'title'] }]])
        expect(viaBase.reviewedPosts).toHaveLength(1)

        await db.close()
    })

    it('sibling filtered entities declaring the same relation property name fail fast at setup', () => {
        const db = new PGLiteDB()
        const { User, Post, ActiveUser } = createModel()
        const InactiveUser = Entity.create({
            name: 'InactiveUser',
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', false] })
        })
        const rel1 = Relation.create({
            source: ActiveUser,
            sourceProperty: 'taggedPosts',
            target: Post,
            targetProperty: 'activeTagger',
            type: '1:n'
        })
        const rel2 = Relation.create({
            source: InactiveUser,
            sourceProperty: 'taggedPosts',
            target: Post,
            targetProperty: 'inactiveTagger',
            type: '1:n'
        })
        expect(() => {
            new DBSetup([User, Post, ActiveUser, InactiveUser], [rel1, rel2], db)
        }).toThrow(/Relation property name conflict.*taggedPosts.*base record family 'User'/)
    })
})
