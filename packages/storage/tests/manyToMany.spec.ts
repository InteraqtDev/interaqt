import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExp} from "../erstorage/MatchExp.ts";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle.ts";

describe('many to many', () => {
    let db: SQLiteDB
    let setup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB(':memory:', {create:true, readwrite: true})
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create many to many data:create self', async () => {
        const userA = await handle.create('User', {name: 'aaa', age: 17})
        const teamA = await handle.create('Team', {teamName: 'teamA'})

        const findUser = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age'] )
        expect(findUser).toMatchObject({
            name:'aaa',
        })
        const findTeam = await handle.findOne('Team', MatchExp.atom({ key: 'teamName', value: ['=', 'teamA']}), {}, ['teamName'] )
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
        const userA = await handle.create('User', rawData)

        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['teamName']}]]
        )

        expect(findUser).toMatchObject(rawData)

    })

    test('create many to many data:create with existing related', async () => {
        const teamA = await handle.create('Team', {teamName: 't1'})
        const teamB = await handle.create('Team', {teamName: 't2'})

        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]})
        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['teamName']}]]
        )

        expect(findUser).toMatchObject({
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        })
    })


    test('delete many to many data:delete self', async () => {
        const rawData = {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        }

        const userA = await handle.create('User', rawData)
        await handle.delete('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }))


        const findUser = await handle.find(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age']
        )
        expect(findUser.length).toBe(0)

        const findRelation = await handle.find('User_teams_members_Team')
        expect(findRelation.length).toBe(0)
    })


    test('update many to many data:update self', async () => {
        const rawData = {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        }

        const userA = await handle.create('User', rawData)
        await handle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { name: 'bbb'})

        const findUser = await handle.find(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age']
        )
        expect(findUser.length).toBe(1)
        expect(findUser[0].name).toBe('bbb')
    })


    test('update many to many data:update with new related', async () => {
        const rawData = {
            name: 'aaa',
            age: 17,
        }

        const userA = await handle.create('User', rawData)

        await handle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }),
        {
            name: 'bbb',
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        })

        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['teamName']}]]
        )

        expect(findUser).toMatchObject({
            name: 'bbb',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        })
    })

    test('update many to many data:update with existing related', async () => {
        const teamA = await handle.create('Team', {teamName: 't1'})
        const teamB = await handle.create('Team', {teamName: 't2'})
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]})
        await handle.update('User', MatchExp.atom({
                key: 'id',
                value: ['=', userA.id]
            }),
            {
                name: 'bbb',
                teams: [teamA,teamB]
            })

        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['teamName']}]]
        )

        expect(findUser).toMatchObject({
            name: 'bbb',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        })
    })

    test('query many to many data: with match expression', async () => {
        const teamA = await handle.create('Team', {teamName: 't1'})
        const teamB = await handle.create('Team', {teamName: 't2'})
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]})
        const foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            [
                'name',
                'age', [
                    'teams',
                    {
                        attributeQuery: ['teamName'],
                        matchExpression: MatchExp.atom({
                            key: 'teamName',
                            value: ['=', 't2']
                        })
                    }
                ]
            ]
        )

        expect(foundUser).toMatchObject({
            id: userA.id,
            name: 'aaa',
            age:17,
            teams: [{
                id: teamB.id,
                teamName:'t2'
            }]
        })
    })

    test('n:n symmetric relation create and query', async () => {
        const user = await handle.create('User', {name: 'aaa', age: 17 })
        const user2 = await handle.create('User', {name: 'bbb', age: 18})
        const user3 = await handle.create('User', {name: 'ccc', age: 19 })
        // user is source
        await handle.addRelationById('User', 'friends', user.id, user2.id, { level: 1 })
        // user3 is source
        await handle.addRelationById('User', 'friends', user3.id, user.id, { level: 2 })

        const foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id]}), {},
            [
                'name',
                'age', [
                'friends',
                {
                    attributeQuery: [
                        'name',
                        'age',
                        ['&', { attributeQuery: ['level']}]
                    ],
                }
            ]
            ]
        )

        console.log(JSON.stringify(foundUser, null, 4))
        expect(foundUser).toMatchObject({
            id: user.id,
            name: 'aaa',
            age: 17,
            friends: [{
                id: user2.id,
                name: 'bbb',
                age: 18,
                '&': {
                    level: 1
                }
            }, {
                id: user3.id,
                name: 'ccc',
                age: 19,
                '&': {
                    level: 2
                }
            }]
        })

    })
})




