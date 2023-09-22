import {EntityQueryHandle, MatchExpression} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";

let db
let setup
let entityQueryHandle

describe('create data', () => {

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

    test('create and query with only value attribute', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        expect(returnUser).toMatchObject({id: 1})
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({key:'name', value: ['=', 'aaa']}), {}, ['name', 'age'])
        console.log(findUser)
    })


    test('create and query with 1:1 related entities', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, profile: {title: 'aaa-profile'}})
        console.log(returnUser)
        expect(returnUser.profile?.id).not.toBeUndefined()
        //
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key:'profile.title', value: ['=', 'aaa-profile']}), {}, ['name', 'age'])
        console.log(findUser)
    })


    test('create and query with n:n related entities', async () => {
        const returnUser = await entityQueryHandle.create('User', {name: 'aaa', age: 17, file: {fileName: 'aaa-file'}})
        console.log(returnUser)
        expect(returnUser.file?.length).toBe(1)
        expect(returnUser.file[0].id).not.toBeUndefined()
        //
        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key:'file.fileName', value: ['=', 'aaa-file']}), {}, ['name', 'age'])
        console.log(findUser)
    })

    // test('create with existing related entities', () => {
    //     // TODO
    // })
})
