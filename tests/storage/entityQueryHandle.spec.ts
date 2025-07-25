import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {createCommonData} from "./data/common";
import {DBSetup,EntityToTableMap,MatchExp,EntityQueryHandle} from "@storage";
import TestLogger from "./testLogger.js";
import {SQLiteDB} from '@runtime';


describe('create data', () => {
    let db: SQLiteDB
    let setup
    let logger
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        logger = new TestLogger('', true)

        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger})
        await db.open()

        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create and query with only value attribute', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        expect(returnUser).toMatchObject({id: 1})
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({key:'name', value: ['=', 'aaa']}), {}, ['name', 'age', 'gender'])
        expect(findUser).toMatchObject({
            name: 'aaa',
            age: 17,
            gender: 'male'
        })
    })


    test('create and query with 1:1 related entities', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, profile: {title: 'aaa-profile'}})
        expect(returnUser.profile?.id).not.toBeUndefined()
        //
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key:'profile.title', value: ['=', 'aaa-profile']}), {}, ['name', 'age'])
        expect(findUser).toMatchObject({
            name: 'aaa',
            age: 17
        })
    })


    test('create and query with n:n related entities', async () => {
        // TODO
    })

})




describe('update data', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle : EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('update self value', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        const updated = await entityQueryHandle.update('User', MatchExp.atom({ key: 'name', value: ['=', 'aaa']}), {name: 'bbb', age: 18})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(returnUser.id)
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'name', value: ['=', 'bbb']}), {}, ['name', 'age'] )
        expect(findUser.id).toBe(returnUser.id)
        expect(findUser.name).toBe('bbb')
        expect(findUser.age).toBe(18)
    })

    test('update self value with related entity as match', async () => {
        const leader = await entityQueryHandle.create('User', {name: 'elader', age: 17})
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, leader})
        const updated = await entityQueryHandle.update('User', MatchExp.atom({ key: 'leader.id', value: ['=', leader.id]}), {name: 'bbb', age: 18})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(returnUser.id)
        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'name', value: ['=', 'bbb']}), {}, ['name', 'age'] )
        expect(findUser.id).toBe(returnUser.id)
        expect(findUser.name).toBe('bbb')
        expect(findUser.age).toBe(18)
    })

    test('update value with 1:1 table merged related entity', async () => {

    })

    test('update value with 1:1 table not merged related entity', async () => {

    })

    test('update value with x:1 table related entity', async () => {
        const userA = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        const userB = await entityQueryHandle.create('User', {name: 'bbb', age: 18})
        // const userC = await entityQueryHandle.create('User', {name: 'ccc', age: 18})

        const updated = await entityQueryHandle.update('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {name: 'a1', leader: userB})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(userA.id)

        const findUser = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]] )
        expect(findUser).toMatchObject({
            name:'a1',
            leader: {
                name: 'bbb'
            }
        })

        // TODO 更复杂的情况
    })

    test('update value with new relation with non-1:1 related entity', async () => {

    })
})

describe('query data', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle : EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('query n:1:n data', async () => {

        const user1 = await entityQueryHandle.create('User', {
            name: 'leader1', 
            age: 17,
            teams: [{
                name: 'team1',
            }, {
                name: 'team2',
            }]
        })

        const user2 = await entityQueryHandle.create('User', {
            name: 'member1', 
            age: 18,
            leader: user1
        })

        const foundUser = await entityQueryHandle.findOne('User', 
            MatchExp.atom({key: 'id', value: ['=', user2.id]}), {}, 
            [
                'name', 
                [
                    'leader', {attributeQuery: [
                        'name',
                        ['teams', {attributeQuery: ['name']}]
                    ]}
                ]
            ]
        )
        expect(foundUser).toMatchObject({
            name: 'member1',
            leader: {
                name: 'leader1',
                teams: [{name: 'team1'}, {name: 'team2'}]
            }
        })
        
        
    })

    
})


