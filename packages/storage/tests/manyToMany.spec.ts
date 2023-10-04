import {EntityQueryHandle} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExpression} from "../erstorage/MatchExpression.ts";

describe('many to many', () => {
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

    test('create many to many data:create self', async () => {
        const userA = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        const teamA = await entityQueryHandle.create('Team', {teamName: 'teamA'})

        const findUser = await entityQueryHandle.findOne('User', MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age'] )
        expect(findUser).toMatchObject({
            name:'aaa',
        })
        const findTeam = await entityQueryHandle.findOne('Team', MatchExpression.createFromAtom({ key: 'teamName', value: ['=', 'teamA']}), {}, ['teamName'] )
        expect(findTeam).toMatchObject({
            teamName:'teamA',
        })
    })


    test('create many to many data:create with new related', async () => {
        const rawData = {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        }
        const userA = await entityQueryHandle.create('User', rawData)

        const findUser = await entityQueryHandle.findOne(
            'User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['teamName']}]]
        )


        // console.log(await entityQueryHandle.database.query(`select * from User_teams_members_Team`))
        // console.log(await entityQueryHandle.find('User_teams_members_Team', undefined, undefined, ['source', 'target']))


        // console.log(findUser)
        expect(findUser).toMatchObject(rawData)

    })

    test('create many to many data:create with existing related', async () => {
        const userA = await entityQueryHandle.create('User', {name: 'aaa', age: 17})
        const teamA = await entityQueryHandle.create('Team', {teamName: 'teamA'})
        const teamB = await entityQueryHandle.create('Team', {teamName: 'teamA'})
    })


    test('delete many to many data:delete self', async () => {
    })


    test('update many to many data:update self', async () => {

    })

    test('update many to many data:update with new related', async () => {

    })

    test('update many to many data:update with existing related', async () => {

    })
})




