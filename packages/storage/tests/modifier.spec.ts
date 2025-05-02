import {expect, test, describe, afterEach, beforeAll, beforeEach} from "vitest";
import { createCommonData} from "./data/common";
import {DBSetup} from "../src/erstorage/Setup.js";
import { SQLiteDB } from '../../runtime/src/SQLite'
import {EntityToTableMap} from "../src/erstorage/EntityToTableMap.js";
import {EntityQueryHandle} from "../src/erstorage/EntityQueryHandle.js";
import TestLogger from "./testLogger.js";


describe('modifier test', () => {
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

        // logger.enable()
        // db = new PostgreSQLDB('test', {
        //     host:'127.0.0.1',
        //     port: 5432,
        //     user: 'postgres',
        //     password: 'rootroot',
        //     logger
        // })
        // await db.open(true)

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
        const findUsers = await entityQueryHandle.find('User', undefined, { orderBy: {age: 'DESC'}}, ['name', 'age'])
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

    test('test order by with limit', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'a', age: 17})
        const returnUser2 = await entityQueryHandle.create('User', {name: 'b', age: 18})
        const returnUser3 = await entityQueryHandle.create('User', {name: 'c', age: 19})
        const returnUser4 = await entityQueryHandle.create('User', {name: 'd', age: 20})
        const findUsers = await entityQueryHandle.find('User', undefined, { orderBy: {age: 'DESC'}, limit: 2}, ['name', 'age'])
        expect(findUsers.length).toBe(2)
        expect(findUsers).toMatchObject([
            {
                name: 'd',
                age: 20
            },
            {
                name: 'c',
                age: 19
            },
        ])
    })


})

