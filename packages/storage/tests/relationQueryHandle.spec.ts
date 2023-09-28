import {EntityQueryHandle, MatchExpression} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {removeAllInstance} from '../../shared/createClass'


describe('find relation', () => {
    let db
    let setup
    let entityQueryHandle

    beforeEach(async () => {
        removeAllInstance()
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
        expect(result.length).toBe(1)
        expect(result[0].source.title).toBe('aaa-profile')
        expect(result[0].target.name).toBe('aaa')

        const match1 = MatchExpression.createFromAtom({
            key: 'source.title',
            value: ['=', 'xxx']
        })
        const result1 = await entityQueryHandle.findRelation(['User', 'profile'], match1, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        expect(result1.length).toBe(0)

        const match2 = MatchExpression.createFromAtom({
            key: 'source.title',
            value: ['=', 'aaa-profile']
        })
        const result2 = await entityQueryHandle.findRelation(['User', 'profile'], match2, {}, [['source', { attributeQuery: ['title']}], ['target', {attributeQuery: ['name']}]])
        expect(result2.length).toBe(1)
    })

    test('create and query with n:n related entities', async () => {

    })

})
