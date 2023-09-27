import {EntityQueryHandle, MatchExpression} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";


describe('find relation', () => {
    let db
    let setup
    let entityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        db = new SQLiteDB(':memory:', {create:true, readwrite: true})
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('find 1:1 relation', async () => {
        await entityQueryHandle.create('User', {name: 'aaa', age: 17, profile: {title: 'aaa-profile'}})
        const result = await entityQueryHandle.findRelation(['User', 'profile'], undefined, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        console.log(result)
    })

    test('create and query with n:n related entities', async () => {

    })

})
