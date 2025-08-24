
import {createCommonData} from "./data/common";
import {DBSetup,EntityToTableMap,MatchExp,EntityQueryHandle,LINK_SYMBOL} from "@storage";
import {SQLiteDB,RecordMutationEvent} from '@runtime';
import TestLogger from "./testLogger.js";
import { beforeEach, describe, expect, test, afterEach } from "vitest";

describe('many to many', () => {
    let db: SQLiteDB
    let setup
    let logger
    let handle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        logger = new TestLogger('', false)

        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger})
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
        const events: RecordMutationEvent[] = []
        const userA = await handle.create('User', {name: 'aaa', age: 17}, events)
        const teamA = await handle.create('Team', {name: 'teamA'})

        const findUser = await handle.findOne('User', MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {}, ['name', 'age'] )
        expect(findUser).toMatchObject({
            name:'aaa',
        })
        const findTeam = await handle.findOne('Team', MatchExp.atom({ key: 'name', value: ['=', 'teamA']}), {}, ['name'] )
        expect(findTeam).toMatchObject({
            name:'teamA',
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
        const events: RecordMutationEvent[] = []

        const rawData = {
            name: 'aaa',
            age: 17,
            teams: [{
                name: 't1'
            }, {
                name: 't2'
            }]
        }
        const userA = await handle.create('User', rawData, events)

        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['name']}]]
        )

        // 查出来可能序不对
        findUser.teams = findUser.teams.sort((a:any, b:any) => a.name > b.name ? 1 : -1)
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
                            name: "t1"
                        }, {
                            name: "t2"
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
                    name: "t2",
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
        const teamA = await handle.create('Team', {name: 't1'})
        const teamB = await handle.create('Team', {name: 't2'})

        const events:RecordMutationEvent[] = []
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]}, events)
        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['name']}]]
        )

        findUser.teams = findUser.teams.sort((a:any, b:any) => a.name > b.name ? 1 : -1)
        expect(findUser).toMatchObject({
            name: 'aaa',
            age: 17,
            teams: [{
                name: 't1'
            }, {
                name: 't2'
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
                            name: "t1",
                            id: teamA.id
                        }, {
                            name: "t2",
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
                name: 't1'
            }, {
                name: 't2'
            }]
        }

        const userA = await handle.create('User', rawData)

        const events:RecordMutationEvent[] = []
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
                    id: userA.teams[0][LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: userA.id
                    }),
                    target: expect.objectContaining({
                        id: userA.teams[0].id
                    })
                }
            }, {
                type: "delete",
                recordName: "User_teams_members_Team",
                record: {
                    id: userA.teams[1][LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: userA.id
                    }),
                    target: expect.objectContaining({
                        id: userA.teams[1].id
                    })
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
                name: 't1'
            }, {
                name: 't2'
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

        const events:RecordMutationEvent[] = []
        const updatedUsers = await handle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }),
        {
            name: 'bbb',
            teams: [{
                name: 't1'
            }, {
                name: 't2'
            }]
        }, events)

        const findUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            ['name', 'age', ['teams', { attributeQuery: ['name']}]]
        )

        findUser.teams = findUser.teams.sort((a:any, b:any) => a.name > b.name ? 1 : -1)

        expect(findUser).toMatchObject({
            name: 'bbb',
            age: 17,
            teams: [{
                name: 't1'
            }, {
                name: 't2'
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
                            "name": "t1"
                        },
                        {
                            "name": "t2"
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
                    "name": "t1",
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
                    "name": "t2",
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
        const teamA = await handle.create('Team', {name: 't1'})
        const teamB = await handle.create('Team', {name: 't2'})
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]})
        const  events:RecordMutationEvent[] = []
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
            ['name', 'age', ['teams', { attributeQuery: ['name']}]]
        )

        findUser.teams = findUser.teams.sort((a:any, b:any) => a.name > b.name ? 1 : -1)
        expect(findUser).toMatchObject({
            name: 'bbb',
            age: 17,
            teams: [{
                name: 't1'
            }, {
                name: 't2'
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
                    id: userA.teams[0][LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: userA.id
                    }),
                    target: expect.objectContaining({
                        id: teamA.id
                    })
                }
            }, {
                type: "delete",
                recordName: "User_teams_members_Team",
                record: {
                    id: userA.teams[1][LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: userA.id
                    }),
                    target: expect.objectContaining({
                        id: teamB.id
                    })
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
        const teamA = await handle.create('Team', {name: 't1'})
        const teamB = await handle.create('Team', {name: 't2'})
        const userA = await handle.create('User', {name: 'aaa', age: 17, teams: [teamA, teamB]})
        const foundUser = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}), {},
            [
                'name',
                'age', [
                    'teams',
                    {
                        attributeQuery: ['name'],
                        matchExpression: MatchExp.atom({
                            key: 'name',
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
                name:'t2'
            }]
        })
    })

    test('n:n symmetric relation create and query', async () => {
        const user = await handle.create('User', {name: 'aaa', age: 17 })
        const user2 = await handle.create('User', {name: 'bbb', age: 18})
        const user3 = await handle.create('User', {name: 'ccc', age: 19 })

        const events:RecordMutationEvent[] = []
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

    test('using n:n target attribute to query n:n source', async () => {
        const user1 = await handle.create('User', {name: 'aaa', age: 17 })
        const user2 = await handle.create('User', {name: 'bbb', age: 18})

        const team1 = await handle.create('Team', {name: 't1'})
        const team2 = await handle.create('Team', {name: 't2', members: [user1, user2]})

        const match1 = await handle.create('Match', {name: 'm1', participants: [team2]})
        const match2 = await handle.create('Match', {name: 'm2', participants: [team1]})

        const foundUser = await handle.find('User', MatchExp.atom({ key: 'teams.participates.id', value: ['=', match1.id]}), {}, ['id', 'name', ['teams', {attributeQuery: ['name',['participates', {attributeQuery: ['name']}]]}]])
        // const foundUser2 = await handle.find('User', undefined, {}, ['id', 'name', ['teams', {attributeQuery: ['name',['participates', {attributeQuery: ['name']}]]}]])
        
        expect(foundUser.length).toBe(2)
    })

    test('delete many to many symmetric relation: should have both source and target in delete event', async () => {
        const user1 = await handle.create('User', {name: 'user1', age: 17 })
        const user2 = await handle.create('User', {name: 'user2', age: 18})
        const user3 = await handle.create('User', {name: 'user3', age: 19 })

        // Create symmetric friend relations
        const relation1 = await handle.addRelationById('User', 'friends', user1.id, user2.id, { level: 1 })
        const relation2 = await handle.addRelationById('User', 'friends', user3.id, user1.id, { level: 2 })

        const events: RecordMutationEvent[] = []
        // Delete user1 which is involved in both relations
        await handle.delete('User', MatchExp.atom({ key: 'id', value: ['=', user1.id]}), events)

        // Check that delete events for relations have both source and target
        const relationDeleteEvents = events.filter(e => e.type === 'delete' && e.recordName === 'User_friends_friends_User')
        
        expect(relationDeleteEvents.length).toBe(1)
        
        const event = relationDeleteEvents[0]
        expect(event.record).toHaveProperty('source')
        expect(event.record).toHaveProperty('target')
        expect(event.record.source).toHaveProperty('id')
        expect(event.record.target).toHaveProperty('id')
        
        // Verify that user1 is involved in each relation
        const isUser1Source = event.record.source.id === user1.id
        const isUser1Target = event.record.target.id === user1.id
        expect(isUser1Source || isUser1Target).toBe(true)
    })
})




