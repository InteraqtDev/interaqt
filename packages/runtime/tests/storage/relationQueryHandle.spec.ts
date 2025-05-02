import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {createCommonData} from "./data/common";
import {DBSetup,EntityToTableMap,MatchExp,EntityQueryHandle} from "@interaqt/storage";
import {SQLiteDB} from '@/SQLite.js'
import {removeAllInstance} from '@interaqt/shared'
import TestLogger from "./testLogger.js";


describe('find relation', () => {
    let db: SQLiteDB
    let setup
    let handle: EntityQueryHandle
    let logger

    beforeEach(async () => {
        removeAllInstance()
        const { entities, relations } = createCommonData()
        logger = new TestLogger('', true)

        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger: logger} )
        await db.open()

        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create and query and delete 1:1 relation', async () => {
        await handle.create('User', {name: 'aaa', age: 17, profile: {title: 'aaa-profile'}})

        const relationName = handle.getRelationName('User', 'profile')
        const result = await handle.findRelationByName(relationName, undefined, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        expect(result.length).toBe(1)
        expect(result[0].source.title).toBe('aaa-profile')
        expect(result[0].target.name).toBe('aaa')

        const match1 = MatchExp.atom({
            key: 'source.title',
            value: ['=', 'xxx']
        })
        const result1 = await handle.findRelationByName(relationName, match1, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        expect(result1.length).toBe(0)

        const match2 = MatchExp.atom({
            key: 'source.title',
            value: ['=', 'aaa-profile']
        })


        const result2 = await handle.findRelationByName(relationName, match2, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        expect(result2.length).toBe(1)


        const match3 = MatchExp.atom({
            key: 'target.name',
            value: ['=', 'aaa']
        }).and({
            key: 'source.title',
            value: ['=', 'aaa-profile']
        })

        await handle.removeRelationByName(relationName, match3)
        const result3 = await handle.findRelationByName(relationName, match3, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        expect(result3.length).toBe(0)

        // 只是关系断开，数据仍然要存在
        const findUser = await handle.find('User', MatchExp.atom({
            key: 'name',
            value: ['=', 'aaa'],
        }), undefined, ['name'])
        expect(findUser.length).toBe(1)
        expect(findUser[0]).toMatchObject({
            name: 'aaa'
        })

        const findProfile = await handle.find('Profile', MatchExp.atom({
            key: 'title',
            value: ['=', 'aaa-profile'],
        }), undefined, ['title'])
        expect(findProfile.length).toBe(1)
        expect(findProfile[0]).toMatchObject({
            title: 'aaa-profile'
        })

    })


    test('create and query and delete with 1:n related entities', async () => {
        const user = await handle.create('User', {name: 'aaa', age: 17 })
        const file1 = await handle.create('File', {fileName: 'file1', owner: user })
        const file2 = await handle.create('File', {fileName: 'file2', owner: user })

        const relationName = handle.getRelationName('User', 'file')


        const match1 = MatchExp.atom({
            key: 'target.name',
            value: ['=', 'aaa']
        })
        const result1 = await handle.findRelationByName(relationName, match1, {}, [['source', { attributeQuery: ['fileName']}], ['target', {attributeQuery: ['name']}]])

        expect( result1.length).toBe(2)
        expect( result1[0].source.fileName).toBe('file1')
        expect( result1[0].target.name).toBe('aaa')
        expect( result1[1].source.fileName).toBe('file2')
        expect( result1[1].target.name).toBe('aaa')

        const match2 = MatchExp.atom({
            key: 'target.name',
            value: ['=', 'aaa']
        }).and({
            key: 'source.fileName',
            value: ['=', 'file1']
        })

        await handle.removeRelationByName(relationName, match2)
        const result2 = await handle.findRelationByName(relationName, match1, {}, [['source', { attributeQuery: ['fileName']}], ['target', {attributeQuery: ['name']}]])

        expect( result2.length).toBe(1)
        expect( result2[0].source.fileName).toBe('file2')
        expect( result2[0].target.name).toBe('aaa')
    })


    test('create and query and delete with n:n related entities', async () => {
        const user = await handle.create('User', {name: 'aaa', age: 17 })
        const user2 = await handle.create('User', {name: 'bbb', age: 18, friends: [user] })
        const user3 = await handle.create('User', {name: 'ccc', age: 19 })
        await handle.addRelationById('User', 'friends', user3.id, user.id)

        const relationName = handle.getRelationName('User', 'friends')

        const match1 = MatchExp.atom({
            key: 'target.name',
            value: ['=', 'aaa']
        })
        const result1 = await handle.findRelationByName(relationName, match1, {orderBy: { id: 'ASC'}}, [['source', { attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['name', 'age']}]])
        //
        expect( result1.length).toBe(2)
        expect( result1[0].target.name).toBe('aaa')
        expect( result1[0].source.name).toBe('bbb')
        expect( result1[1].target.name).toBe('aaa')
        expect( result1[1].source.name).toBe('ccc')
        //
        const match2 = MatchExp.atom({
            key: 'target.name',
            value: ['=', 'aaa']
        }).and({
            key: 'source.name',
            value: ['=', 'bbb']
        })
        // 把 bbb 的关系删除
        await handle.removeRelationByName(relationName, match2)
        // 重新用 match1 查找，应该就只剩 ccc 了
        const result2 = await handle.findRelationByName(relationName, match1, undefined, [['source', { attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['name', 'age']}]])
        expect( result2.length).toBe(1)
        // console.log(result2)
        expect( result2[0].source.name).toBe('ccc')
        expect( result2[0].target.name).toBe('aaa')
    })


})
