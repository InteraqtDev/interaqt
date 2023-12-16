import {expect, test, describe, afterEach, beforeAll, beforeEach} from "vitest";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup.js";
import { SQLiteDB } from '../../runtime/SQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap.js";
import {MatchExp} from "../erstorage/MatchExp.js";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle.js";
import {MutationEvent} from "../erstorage/RecordQueryAgent.js";
import {Entity, Property} from "@interaqt/shared";

describe('json field test', () => {
    let db: SQLiteDB
    let setup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({
                    name: 'name',
                    type: 'string',
                }),
                Property.create( {
                    name: 'roles',
                    type: 'string',
                    collection: true
                })
            ]
        })
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup([userEntity], [], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create many to many data:create self', async () => {

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
})




