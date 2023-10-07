import {EntityQueryHandle} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExpression} from "../erstorage/MatchExpression.ts";

describe('one to one', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB(':memory:', {create:true, readwrite: true})
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create one to one data:create self on combined table', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age']
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
        })
    })


    test('create one to one data:create with new related on combined table', async () => {
        const userA = await entityQueryHandle.create('User', {
            name:'a1',
            age:12,
            profile: {
                title: 'f1'
            }
        })
        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            profile: {
                title: 'f1'
            }
        })
    })


    test('create one to one data:create with existing related on combined table', async () => {
        const profileA = await entityQueryHandle.create('Profile', {title:'f1'})
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12, profile: profileA})

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )

        expect(findUser.name).toBe('a1')
        expect(findUser.profile.id).toBe(profileA.id)
        expect(findUser.profile.title).toBe('f1')
    })


    test('delete data:delete self with non same row data', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const profileA = await entityQueryHandle.create('Profile', {title:'f1'})

        await entityQueryHandle.delete('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
        )

        const findUsers = await entityQueryHandle.find('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name']
        )

        expect(findUsers.length).toBe(0)

        const findProfile = await entityQueryHandle.findOne('Profile',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', profileA.id]}),
            {},
            ['title']
        )

        expect(findProfile).toMatchObject({
            title: 'f1'
        })
    })


    test.only('delete data:delete self with same row data', async () => {
        const userA = await entityQueryHandle.create('User', {
            name:'a1',
            age:12,
            profile: {
                title: 'f1'
            },
            item: {
                itemName: 'item1'
            }
        })

        await entityQueryHandle.delete('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
        )


        const findProfile = await entityQueryHandle.findOne('Profile',
            MatchExpression.createFromAtom({ key: 'title', value: ['=', 'f1']}),
            {},
            ['title', ['owner', {attributeQuery: ['id']}]]
        )

        expect(findProfile).toMatchObject({
            title: 'f1',
            owner: {
                id: null
            }
        })

        const findItems = await entityQueryHandle.find('Item',
            undefined, {},
            ['itemName']
        )

        // reliance 会被连带删除
        expect(findItems.length).toBe(0)
    })


    test('update data:update self with new related on combined table', async () => {
        const userA = await entityQueryHandle.create(
            'User', {
                name:'a1',
                age:12,
                profile: {
                    title: 'f1'
                }
            })


        await entityQueryHandle.update('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            { profile: { title: 'f2'} }
        )

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )


        expect(findUser.name).toBe('a1')
        expect(findUser.profile.title).toBe('f2')

        const findProfiles = await entityQueryHandle.find('Profile',
            MatchExpression.createFromAtom({ key: 'title', value: ['=', 'f2']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )
        expect(findProfiles.length).toBe(1)
        expect(findProfiles[0]).toMatchObject({
            title: 'f2',
            owner: {
                name: 'a1'
            }
        })



        const findProfiles2 = await entityQueryHandle.find('Profile',
            MatchExpression.createFromAtom({ key: 'title', value: ['=', 'f1']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )

        expect(findProfiles2.length).toBe(1)
        expect(findProfiles2[0]).toMatchObject({
            title: 'f1',
            owner: {
                id: null,
                name: null,
            }
        })
    })


    test('update data:update with existing related on combined table', async () => {
        const userA = await entityQueryHandle.create(
            'User', {
                name:'a1',
                age:12,
                profile: {
                    title: 'f1'
                }
            })
        const profileA = await entityQueryHandle.create('Profile', {title:'f2'})

        await entityQueryHandle.update('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            { profile: profileA }
        )

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['profile', {attributeQuery: ['title']}]]
        )

        expect(findUser.name).toBe('a1')
        expect(findUser.profile.id).toBe(profileA.id)
        expect(findUser.profile.title).toBe('f2')

        const findProfiles = await entityQueryHandle.find('Profile',
            MatchExpression.createFromAtom({ key: 'title', value: ['=', 'f2']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )
        expect(findProfiles.length).toBe(1)
        expect(findProfiles[0]).toMatchObject({
            title: 'f2',
            owner: {
                name: 'a1'
            }
        })


        const findProfiles2 = await entityQueryHandle.find('Profile',
            MatchExpression.createFromAtom({ key: 'title', value: ['=', 'f1']}),
            {},
            ['title', ['owner', {attributeQuery: ['name']}]]
        )

        expect(findProfiles2.length).toBe(1)
        expect(findProfiles2[0]).toMatchObject({
            title: 'f1',
            owner: {
                id: null,
                name: null,
            }
        })


    })
})




