import {expect, test, describe, afterEach, beforeAll, beforeEach} from "vitest";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/SQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExp} from "../erstorage/MatchExp.ts";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle.ts";
import {MutationEvent} from "../erstorage/RecordQueryAgent.ts";
import {LINK_SYMBOL} from "../erstorage/RecordQuery.ts";

describe('many to many', () => {
    let db: SQLiteDB
    let setup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        // @ts-ignore
        db = new SQLiteDB()
        await db.open()
        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create many to many data:create self', async () => {
        const events: MutationEvent[] = []
        const userA = await handle.create('User', {name: 'aaa', age: 17}, events)
        const teamA = await handle.create('Team', {teamName: 'teamA'})

        const findUser = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age'] )
        expect(findUser).toMatchObject({
            name:'aaa',
        })
        const findTeam = await handle.findOne('Team', MatchExp.atom({ key: 'teamName', value: ['=', 'teamA']}), {}, ['teamName'] )
        expect(findTeam).toMatchObject({
            teamName:'teamA',
        })

        expect(events.length).toBe(1)
        expect(events[0]).toMatchObject({
            type: 'create',
            recordName: 'User',
            record: findUser,
        })
        debugger
    })


    test('create many to many data:create with new related', async () => {
        const events: MutationEvent[] = []

        const rawData = {
            name: 'aaa',
            age: 17,
            teams: [{
                teamName: 't1'
            }, {
                teamName: 't2'
            }]
        }
        const userA = await handle.create('User', rawData, events)

        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['teamName']}]]
        )

        expect(findUser).toMatchObject(rawData)

        expect(events.length).toBe(5)
        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "aaa",
                    age: 17,
                    teams: [
                        {
                            teamName: "t1"
                        }, {
                            teamName: "t2"
                        }
                    ],
                    id: userA.id
                }
            }, {
                type: "create",
                recordName: "Team",
                record: {
                    id: userA.teams[0].id,
                }
            }, {
                type: "create",
                recordName: "User_teams_members_Team",
                record: {
                    source: {
                        id: userA.id
                    },
                    target: {
                        id: userA.teams[0].id,
                    },
                    id: userA.teams[0][LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "Team",
                record: {
                    teamName: "t2",
                    id: 2
                }
            }, {
                type: "create",
                recordName: "User_teams_members_Team",
                record: {
                    source: {
                        id: userA.id
                    },
                    target: {
                        id: userA.teams[1].id,
                    },
                    id: userA.teams[1][LINK_SYMBOL].id
                }
            }
        ])
    })


    test('create many to many data:create with existing related', async () => {
        const teamA = await handle.create('Team', {teamName: 't1'})
        const teamB = await handle.create('Team', {teamName: 't2'})

        const events:MutationEvent[] = []
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]}, events)
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

        expect(events.length).toBe(3)
        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "aaa",
                    age: 17,
                    teams: [
                        {
                            teamName: "t1",
                            id: teamA.id
                        }, {
                            teamName: "t2",
                            id: teamB.id
                        }
                    ],
                    id: userA.id
                }
            }, {
                type: "create",
                recordName: "User_teams_members_Team",
                record: {
                    source: {
                        id: userA.id
                    },
                    target: {
                        id: teamA.id
                    },
                    id: userA.teams[0][LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "User_teams_members_Team",
                record: {
                    source: {
                        id: userA.id
                    },
                    target: {
                        id: teamB.id
                    },
                    id: userA.teams[1][LINK_SYMBOL].id
                }
            }
        ])

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

        const events:MutationEvent[] = []
        await handle.delete('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), events)


        const findUser = await handle.find(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age']
        )
        expect(findUser.length).toBe(0)

        const findRelation = await handle.find('User_teams_members_Team')
        expect(findRelation.length).toBe(0)

        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "User_teams_members_Team",
                record: {
                    role: null,
                    id: userA.teams[0][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "User_teams_members_Team",
                record: {
                    role: null,
                    id: userA.teams[1][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "User",
                record: {
                    name: "aaa",
                    age: 17,
                    id: userA.id,
                }
            }
        ])
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

        const events:MutationEvent[] = []
        const updatedUsers = await handle.update('User', MatchExp.atom({
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
        }, events)

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

        expect(events).toMatchObject([
            {
                "type": "update",
                "recordName": "User",
                "record": {
                    "name": "bbb",
                    "teams": [
                        {
                            "teamName": "t1"
                        },
                        {
                            "teamName": "t2"
                        }
                    ]
                },
                "oldRecord": {
                    "name": "aaa",
                    "age": 17,
                    "id": updatedUsers[0].id
                }
            },
            {
                "type": "create",
                "recordName": "Team",
                "record": {
                    "teamName": "t1",
                    "id": updatedUsers[0].teams[0].id
                }
            },
            {
                "type": "create",
                "recordName": "User_teams_members_Team",
                "record": {
                    "source": {
                        "id": updatedUsers[0].id
                    },
                    "target": {
                        "id": updatedUsers[0].teams[0].id
                    },
                    "id": updatedUsers[0].teams[0][LINK_SYMBOL].id
                }
            },
            {
                "type": "create",
                "recordName": "Team",
                "record": {
                    "teamName": "t2",
                    "id": updatedUsers[0].teams[1].id
                }
            },
            {
                "type": "create",
                "recordName": "User_teams_members_Team",
                "record": {
                    "source": {
                        "id": updatedUsers[0].id
                    },
                    "target": {
                        "id": updatedUsers[0].teams[1].id
                    },
                    "id": updatedUsers[0].teams[1][LINK_SYMBOL].id
                }
            }
        ])
    })


    test('update many to many data:update with existing related', async () => {
        const teamA = await handle.create('Team', {teamName: 't1'})
        const teamB = await handle.create('Team', {teamName: 't2'})
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]})
        const  events:MutationEvent[] = []
        const updatedUsers = await handle.update('User', MatchExp.atom({
                key: 'id',
                value: ['=', userA.id]
            }),
            {
                name: 'bbb',
                teams: [teamA,teamB]
            }, events)

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

        expect(events).toMatchObject([
            {
                type: "update",
                recordName: "User",
                record: {
                    name: "bbb",
                    teams: [
                        teamA,
                        teamB
                    ]
                },
                oldRecord: {
                    name: "aaa",
                    age: 17,
                    id: updatedUsers[0].id
                }
            }, {
                type: "delete",
                recordName: "User_teams_members_Team",
                record: {
                    role: null,
                    id: userA.teams[0][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "User_teams_members_Team",
                record: {
                    role: null,
                    id: userA.teams[1][LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "User_teams_members_Team",
                record: {
                    source: {
                        id: userA.id
                    },
                    target: {
                        id: updatedUsers[0].teams[0].id
                    },
                    id: updatedUsers[0].teams[0][LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "User_teams_members_Team",
                record: {
                    source: {
                        id:userA.id
                    },
                    target: {
                        id: updatedUsers[0].teams[1].id
                    },
                    id: updatedUsers[0].teams[1][LINK_SYMBOL].id
                }
            }
        ])

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

        const events:MutationEvent[] = []
        // user is source
        const relation1 = await handle.addRelationById('User', 'friends', user.id, user2.id, { level: 1 }, events)
        // user3 is source
        const relation2 = await handle.addRelationById('User', 'friends', user3.id, user.id, { level: 2 }, events)

        const a = await handle.findRelationByName("User_friends_friends_User", undefined, undefined, ['*'])

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

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User_friends_friends_User",
                record: {
                    source: {
                        id: user.id
                    },
                    target: {
                        id: user2.id
                    },
                    level: 1,
                    id: relation1.id
                }
            }, {
                type: "create",
                recordName: "User_friends_friends_User",
                record: {
                    source: {
                        id: user3.id
                    },
                    target: {
                        id: user.id
                    },
                    level: 2,
                    id: relation2.id
                }
            }
        ])

    })
})




