import {expect, test, describe, afterEach, beforeAll, beforeEach} from "vitest";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup.js";
import { SQLiteDB } from '../../runtime/SQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap.js";
import {MatchExp} from "../erstorage/MatchExp.js";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle.js";


describe('modifier test', () => {
    let db: SQLiteDB
    let setup
    let entityQueryHandle: EntityQueryHandle

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

    test('test limit and offset', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'a', age: 17})
        const returnUser2 = await entityQueryHandle.create('User', {name: 'b', age: 18})
        const returnUser3 = await entityQueryHandle.create('User', {name: 'c', age: 19})
        const returnUser4 = await entityQueryHandle.create('User', {name: 'd', age: 20})
        const findUsers = await entityQueryHandle.find('User', undefined, { limit: 2}, ['name', 'age'])
        expect(findUsers.length).toBe(2)
        expect(findUsers).toMatchObject([
            {
                name: 'a',
                age: 17
            },
            {
                name: 'b',
                age: 18
            }
        ])

        const findUsers2 = await entityQueryHandle.find('User', undefined, { limit: 2, offset: 2}, ['name', 'age'])
        expect(findUsers2.length).toBe(2)
        expect(findUsers2).toMatchObject([
            {
                name: 'c',
                age: 19
            },
            {
                name: 'd',
                age: 20
            }
        ])
    })


    test('test order by', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'a', age: 17})
        const returnUser2 = await entityQueryHandle.create('User', {name: 'b', age: 18})
        const returnUser3 = await entityQueryHandle.create('User', {name: 'c', age: 19})
        const returnUser4 = await entityQueryHandle.create('User', {name: 'd', age: 20})
        const findUsers = await entityQueryHandle.find('User', undefined, { orderBy: {age: 'desc'}}, ['name', 'age'])
        expect(findUsers.length).toBe(4)
        expect(findUsers).toMatchObject([
            {
                name: 'd',
                age: 20
            },
            {
                name: 'c',
                age: 19
            },
            {
                name: 'b',
                age: 18
            },
            {
                name: 'a',
                age: 17
            }
        ])
    })


})

