import {EntityQueryHandle} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExpression} from "../erstorage/MatchExpression.ts";


describe('create data', () => {
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

    test('create and query with only value attribute', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        expect(returnUser).toMatchObject({id: 1})
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({key:'name', value: ['=', 'aaa']}), {}, ['name', 'age'])
        console.log(findUser)
    })


    test('create and query with 1:1 related entities', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, profile: {title: 'aaa-profile'}})
        console.log(111111, returnUser)
        expect(returnUser.profile?.id).not.toBeUndefined()
        //
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key:'profile.title', value: ['=', 'aaa-profile']}), {}, ['name', 'age'])
        console.log(findUser)
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
        db = new SQLiteDB(':memory:', {create:true, readwrite: true})
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
        const updated = await entityQueryHandle.update('User', MatchExpression.createFromAtom({ key: 'name', value: ['=', 'aaa']}), {name: 'bbb', age: 18})
        expect(updated.length).toBe(1)
        console.log(updated)
        expect(updated[0].id).toBe(returnUser.id)
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key: 'name', value: ['=', 'bbb']}), {}, ['name', 'age'] )
        expect(findUser.id).toBe(returnUser.id)
        expect(findUser.name).toBe('bbb')
        expect(findUser.age).toBe(18)
    })

    test('update self value with related entity as match', async () => {
        const leader = await entityQueryHandle.create('User', {name: 'elader', age: 17})
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, leader})
        const updated = await entityQueryHandle.update('User', MatchExpression.createFromAtom({ key: 'leader.id', value: ['=', leader.id]}), {name: 'bbb', age: 18})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(returnUser.id)
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key: 'name', value: ['=', 'bbb']}), {}, ['name', 'age'] )
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

        const updated = await entityQueryHandle.update('User', MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}), {name: 'a1', leader: userB})
        expect(updated.length).toBe(1)
        expect(updated[0].id).toBe(userA.id)

        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]] )
        console.log(findUser)
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


