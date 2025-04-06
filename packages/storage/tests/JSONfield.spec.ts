import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {DBSetup} from "../erstorage/Setup.js";
// @ts-ignore
import {SQLiteDB} from '../../runtime/SQLite.js'
import {EntityToTableMap} from "../erstorage/EntityToTableMap.js";
import {MatchExp} from "../erstorage/MatchExp.js";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle.js";
import TestLogger from "./testLogger.js";
import { Entity, Property } from "../types/entity.js";

describe('json field test', () => {
    let db: SQLiteDB
    let setup
    let handle: EntityQueryHandle
    let logger

    beforeEach(async () => {
        const userEntity: Entity = {
            name: 'User',
            properties: [
                {
                    name: 'name',
                    type: 'string',
                },
                {
                    name: 'roles',
                    type: 'string',
                    isCollection: true
                },
                {
                    name: 'scores',
                    type: 'number',
                    isCollection: true
                }
            ]
        }
        logger = new TestLogger('', true)
        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger})
        await db.open()

        setup = new DBSetup([userEntity], [], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('string array', async () => {

        const userA = await handle.create('User', {name: 'aaa', roles: ['admin', 'user']})
        const userB = await handle.create('User', {name: 'aaa', roles: ['admin', 'supervisor']})
        const findUser = await handle.find('User', undefined, undefined, ['*'])

        expect(findUser.length).toBe(2)
        expect(findUser[0].roles).toEqual(['admin', 'user'])


        const findUser2 = await handle.find('User', MatchExp.atom({key: 'roles', value: ['contains', 'admin']}), undefined, ['*'])
        const findUser3 = await handle.find('User', MatchExp.atom({key: 'roles', value: ['contains', 'supervisor']}), undefined, ['*'])
        expect(findUser2.length).toBe(2)
        expect(findUser3.length).toBe(1)

        const findUser4 = await handle.find('User', MatchExp.atom({key: 'roles', value: ['contains', 'supervisor']}).not(), undefined, ['*'])
        expect(findUser4.length).toBe(1)
        expect(findUser4[0].roles).toEqual(['admin', 'user'])
    })

    test('number array', async () => {
        const userA = await handle.create('User', {name: 'aaa', scores: [1,2,3]})
        const findUser2 = await handle.find('User', MatchExp.atom({key: 'scores', value: ['contains', 2]}), undefined, ['*'])
        expect(findUser2.length).toBe(1)
    })
})




