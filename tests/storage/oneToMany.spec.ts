
import {createCommonData} from "./data/common";
import {DBSetup,EntityToTableMap,MatchExp,EntityQueryHandle,LINK_SYMBOL} from "@storage";
import {SQLiteDB,RecordMutationEvent} from '@runtime';
import TestLogger from "./testLogger.js";
import { beforeEach, describe, expect, test,afterEach } from "vitest";

describe('one to many', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let logger
    let entityQueryHandle: EntityQueryHandle

    beforeEach(async () => {
        const { entities, relations } = createCommonData()
        logger = new TestLogger('', true)

        // @ts-ignore
        db = new SQLiteDB(':memory:', {logger})
        await db.open()


        setup = new DBSetup(entities, relations, db)
        await setup.createTables()
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
    })

    afterEach(async () => {
        // CAUTION 因为是 memory, 所以会清空数据。如果之后测试改成实体数据库，那么要主动清空数据
        await db.close()
    })

    test('create one to many data:create with new related as source', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            member: [
                {name:'m1', age:12},
                {name:'m2', age:13},
            ]}

        const events: RecordMutationEvent[] = []
        const userA = await entityQueryHandle.create('User', rawData, events)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject(rawData)
        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    member: [
                        {name:'m1', age:12},
                        {name:'m2', age:13},
                    ],
                    id: userA.id
                }
            }, {
                type: "create",
                recordName: "User",
                record: {
                    name: "m1",
                    age: 12,
                    leader: {
                        id:userA.id,
                    },
                    id: userA.member[0].id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[0][LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "User",
                record: {
                    name: "m2",
                    age: 13,
                    leader: {
                        id:userA.id,
                    },
                    id: userA.member[1].id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[1][LINK_SYMBOL].id,
                }
            }
        ])
    })

    test('create one to many data:create with existing related as source', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'm1', age:12})
        const user2 = await entityQueryHandle.create('User', { name: 'm2', age:13})

        const events: RecordMutationEvent[] = []
        const userA = await entityQueryHandle.create('User', {
            name: 'a1',
            age:11,
            member: [
                user1,
                user2
            ]
        }, events)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age:11,
            member: [
                {name:'m1', age:12},
                {name:'m2', age:13},
            ]
        })

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    member: [
                        {name:'m1', age:12},
                        {name:'m2', age:13},
                    ],
                    id: userA.id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[0][LINK_SYMBOL].id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[1][LINK_SYMBOL].id
                }
            }
        ])
    })


    test('create one to many data:create with new related as target', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            leader: {name:'l1', age:12}
        }

        const events: RecordMutationEvent[] = []
        const userA = await entityQueryHandle.create('User', rawData, events)
        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject(rawData)
        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "l1",
                    age: 12,
                    id: userA.leader.id
                }
            }, {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    leader: {
                        id: userA.leader.id
                    },
                    id: 2
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.leader[LINK_SYMBOL].id
                }
            }
        ])
    })

    test('create one to many data:create with existing related as target', async () => {
        const user1 = await entityQueryHandle.create('User', {name:'l1', age:12})

        const events: RecordMutationEvent[] = []
        const userA = await entityQueryHandle.create('User', {name: 'a1', age:11, leader: user1}, events)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age:11,
            leader: {name:'l1', age:12
            }
        })


        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    leader: {
                        id:userA.leader.id
                    },
                    id: userA.id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.leader[LINK_SYMBOL].id
                }
            }
        ])
    })

    test('delete one to many data:delete self as source', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            leader: {name:'l1', age:12}
        }
        const userA = await entityQueryHandle.create('User', rawData)

        const events: RecordMutationEvent[] = []

        await entityQueryHandle.delete('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), events)

        const findUsers = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age']
        )

        expect(findUsers.length).toBe(0)

        const findUsers2 = await entityQueryHandle.find('User',
            undefined,
            {},
            ['name', 'age']
        )
        // console.log(findUsers2)
        expect(findUsers2.length).toBe(1)
        expect(findUsers2[0].name).toBe('l1')


        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.leader[LINK_SYMBOL].id,
                    source: {
                        id: 2,
                    },
                    // IMPORTANT: Both source and target should be present in delete events
                    target: {
                        id: userA.leader.id
                    }
                }
            }, {
                type: "delete",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    id: 2,
                    leader: {
                        id: userA.leader.id
                    }
                }
            }
        ])
    })

    test('delete one to many data:delete self as target', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            member: [
                {name:'m1', age:12},
                {name:'m2', age:13},
            ],
            powers: [
                {powerName: 'speed'},
                {powerName: 'fly'},
            ]
        }


        const userA = await entityQueryHandle.create('User', rawData)

        const events: RecordMutationEvent[] = []
        // 删除用户
        await entityQueryHandle.delete('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), events)

        const findUsers = await entityQueryHandle.find('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age']
        )

        expect(findUsers.length).toBe(0)

        const findUsers2 = await entityQueryHandle.find('User',
            undefined,
            {
                orderBy: {
                    age: 'ASC'
                }
            },
            ['name', 'age', ['leader', {attributeQuery: ['name', 'age']}]]
        )
        expect(findUsers2.length).toBe(2)
        expect(findUsers2[0].name).toBe('m1')
        expect(findUsers2[0].leader).toBeUndefined()
        expect(findUsers2[1].name).toBe('m2')
        expect(findUsers2[1].leader).toBeUndefined()

        //1:n reliance 要被连带删除
        const findPowers = await entityQueryHandle.find('Power', undefined, undefined, ['powerName'])
        expect(findPowers.length).toBe(0)

        expect(events).toMatchObject([
            {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[0][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[1][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "User_powers_owner_Power",
                record: {
                    id: userA.powers[0][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "User_powers_owner_Power",
                record: {
                    id: userA.powers[1][LINK_SYMBOL].id
                }
            }, {
                type: "delete",
                recordName: "Power",
                record: {
                    powerName: "speed",
                    id: userA.powers[0].id
                }
            }, {
                type: "delete",
                recordName: "Power",
                record: {
                    powerName: "fly",
                    id: userA.powers[1].id
                }
            }, {
                type: "delete",
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    id: userA.id,
                }
            }
        ])
    })



    test('update one to many data:update self with new related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})

        const events: RecordMutationEvent[] = []
        const [updatedUser] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [{name: 'm1', age:11} ] }, events)


        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            member: [{
                name: 'm1',
                age: 11
            }]
        })

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "m1",
                    age: 11,
                    id: updatedUser.member[0].id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    source: {
                        id: updatedUser.member[0].id
                    },
                    target: {
                        id: updatedUser.id
                    },
                    id: updatedUser.member[0][LINK_SYMBOL].id
                }
            }
        ])

        const events2: RecordMutationEvent[] = []
        const [updatedUser2] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [{name: 'm2', age:14}] }, events2)

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser2).toMatchObject({
            name: 'a1',
            age: 12,
            member: [{
                name: 'm2',
                age: 14
            }]
        })

        expect(events2).toMatchObject([
            {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUser.member[0][LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: updatedUser.member[0].id
                    }),
                    target: expect.objectContaining({
                        id: userA.id
                    })
                }
            },
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "m2",
                    age: 14,
                    id: updatedUser2.member[0].id
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    source: {
                        id: updatedUser2.member[0].id
                    },
                    target: {
                        id: updatedUser2.id
                    },
                    id: updatedUser2.member[0][LINK_SYMBOL].id
                }
            }
        ])
    })

    test('update one to many data:update self with new related as target', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})

        await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader : {name: 'm1', age:11} })

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            leader: {
                name: 'm1',
                age: 11
            }
        })

        const events: RecordMutationEvent[] = []
        const [updatedUser] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader: {name: 'm2', age:14} }, events)

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser2).toMatchObject({
            name: 'a1',
            age: 12,
            leader: {
                name: 'm2',
                age: 14
            }
        })

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User",
                record: {
                    name: "m2",
                    age: 14,
                    id: updatedUser.leader.id
                }
            }, 
            {
                "record":  {
                  "id": 1,
                  "target":  {
                    "id": 2,
                  },
                  // IMPORTANT: Both source and target should be present in delete events
                  "source": expect.objectContaining({
                    "id": userA.id
                  })
                },
                "recordName": "User_leader_member_User",
                "type": "delete",
              },
              {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUser.leader[LINK_SYMBOL].id,
                    "source":  {
                        "id": 1,
                        "leader":  {
                        "&":  {
                            "id": 2,
                        },
                        "age": 14,
                        "changes": 1,
                        "id": 3,
                        "lastInsertRowid": 3,
                        "name": "m2",
                        },
                    },
                    "target":  {
                        "age": 14,
                        "changes": 1,
                        "id": 3,
                        "lastInsertRowid": 3,
                        "name": "m2",
                    },
                }
            }
        ])
    })


    test('update one to many data:update with existing related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const userB = await entityQueryHandle.create('User', {name: 'm1', age:11})
        const userC = await entityQueryHandle.create('User', {name: 'm2', age:14})

        const events: RecordMutationEvent[] = []
        const [updatedUserA] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [userB] }, events)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            member: [{
                name: 'm1',
                age: 11
            }]
        })

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    source: {
                        id: userB.id
                    },
                    target: {
                        id: userA.id
                    },
                    id: updatedUserA.member[0][LINK_SYMBOL].id
                }
            }
        ])

        const events2: RecordMutationEvent[] = []
        const [updatedUserA2]=await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [userC] }, events2)

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser2).toMatchObject({
            name: 'a1',
            age: 12,
            member: [{
                name: 'm2',
                age: 14
            }]
        })

        expect(events2).toMatchObject([
            {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUserA.member[0][LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: userB.id
                    }),
                    target: expect.objectContaining({
                        id: userA.id
                    })
                }
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    source: {
                        id: userC.id
                    },
                    target: {
                        id: userA.id
                    },
                    id: updatedUserA2.member[0][LINK_SYMBOL].id
                }
            }
        ])
    })

    test('update one to many data:update with existing related as target', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const userB = await entityQueryHandle.create('User', {name: 'm1', age:11})
        const userC = await entityQueryHandle.create('User', {name: 'm2', age:14})

        const events: RecordMutationEvent[] = []
        const [updatedUserA] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader : userB }, events)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            leader: {
                name: 'm1',
                age: 11
            }
        })

        expect(events).toMatchObject([
            {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUserA.leader[LINK_SYMBOL].id,
                }
            }
        ])

        const events2: RecordMutationEvent[] = []
        const [updatedUserA2] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader: userC }, events2)

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser2).toMatchObject({
            name: 'a1',
            age: 12,
            leader: {
                name: 'm2',
                age: 14
            }
        })

        expect(events2).toMatchObject([
            {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUserA.leader[LINK_SYMBOL].id,
                    // IMPORTANT: Both source and target should be present in delete events
                    source: expect.objectContaining({
                        id: userA.id
                    }),
                    target: expect.objectContaining({
                        id: userB.id
                    })
                }
            },
            {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUserA2.leader[LINK_SYMBOL].id,
                }
            }
        ])

        // 测试 update 传入一样的数据，应该不产生事件
        const events3: RecordMutationEvent[] = []
        const [updatedUserA3] = await entityQueryHandle.update('User', MatchExp.atom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader: userC }, events3)

        const findUser3 = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser3).toMatchObject({
            name: 'a1',
            age: 12,
            leader: {
                name: 'm2',
                age: 14
            }
        })

        // 应该没有事件
        expect(events3).toMatchObject([])
    })

    test('find one to many data:find with new related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12, powers: [{powerName: 'p1'}, {powerName: 'p2'}]})

        const findUser = await entityQueryHandle.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['powers', { attributeQuery: ['id','powerName']}]])

        expect(findUser).toMatchObject({
            name: 'a1',
            age: 12,
            powers: [{powerName: 'p1'}, {powerName: 'p2'}]
        })

        const firstPower = findUser.powers[0]

        const findPower = await entityQueryHandle.findOne('Power',
            MatchExp.atom({ key: 'id', value: ['=', firstPower.id]}),
            {},
            ['powerName', ['owner', {attributeQuery: ['name', ['&', {attributeQuery: ['id']}]]}]]
        )

        expect(findPower).toMatchObject({
            powerName: 'p1',
            owner: {
                name: 'a1'
            }
        })
    })

    test('delete one to many relation as source: should have both source and target in delete event', async () => {
        const leader = await entityQueryHandle.create('User', {
            name: 'leader',
            age: 40,
            member: [
                {name: 'member1', age: 20},
                {name: 'member2', age: 25}
            ]
        })

        const events: RecordMutationEvent[] = []
        
        // Delete the leader
        await entityQueryHandle.delete('User', 
            MatchExp.atom({ key: 'id', value: ['=', leader.id]}),
            events
        )

        // Find all delete events for User_leader_member_User relations
        const relationDeleteEvents = events.filter(e => 
            e.type === 'delete' && e.recordName === 'User_leader_member_User'
        )

        expect(relationDeleteEvents.length).toBe(2)
        
        // All relation delete events should have both source and target
        relationDeleteEvents.forEach((event, index) => {
            expect(event.record).toHaveProperty('source')
            expect(event.record).toHaveProperty('target')
            expect(event.record?.source).toHaveProperty('id')
            expect(event.record?.target).toHaveProperty('id')
            
            // Verify that leader is the target in the relation
            expect(event.record?.target.id).toBe(leader.id)
            // Verify that member is the source
            expect(event.record?.source.id).toBe(leader.member[index].id)
        })
    })

    test('delete one to many relation as target: should have both source and target in delete event', async () => {
        const leader = await entityQueryHandle.create('User', {name: 'leader', age: 40})
        const member = await entityQueryHandle.create('User', {
            name: 'member',
            age: 25,
            leader: leader
        })

        const events: RecordMutationEvent[] = []
        
        // Delete the member (which has a leader)
        await entityQueryHandle.delete('User', 
            MatchExp.atom({ key: 'id', value: ['=', member.id]}),
            events
        )

        // Find the delete event for User_leader_member_User relation
        const relationDeleteEvent = events.find(e => 
            e.type === 'delete' && e.recordName === 'User_leader_member_User'
        )

        expect(relationDeleteEvent).toBeDefined()
        
        // The relation delete event should have both source and target
        expect(relationDeleteEvent?.record).toHaveProperty('source')
        expect(relationDeleteEvent?.record).toHaveProperty('target')
        
        // Verify the IDs
        expect(relationDeleteEvent?.record?.source).toHaveProperty('id', member.id)
        expect(relationDeleteEvent?.record?.target).toHaveProperty('id', leader.id)
    })

    test('update one to many relation: delete event should have both source and target', async () => {
        const leader1 = await entityQueryHandle.create('User', {name: 'leader1', age: 35})
        const leader2 = await entityQueryHandle.create('User', {name: 'leader2', age: 40})
        const member = await entityQueryHandle.create('User', {
            name: 'member',
            age: 25,
            leader: leader1
        })

        const events: RecordMutationEvent[] = []
        
        // Update member's leader from leader1 to leader2
        await entityQueryHandle.update('User',
            MatchExp.atom({ key: 'id', value: ['=', member.id]}),
            { leader: leader2 },
            events
        )

        // Find the delete event for the old relation
        const deleteEvent = events.find(e => 
            e.type === 'delete' && e.recordName === 'User_leader_member_User'
        )

        expect(deleteEvent).toBeDefined()
        
        // The delete event should have both source and target
        expect(deleteEvent?.record).toHaveProperty('source')
        expect(deleteEvent?.record).toHaveProperty('target')
        expect(deleteEvent?.record?.source).toHaveProperty('id', member.id)
        expect(deleteEvent?.record?.target).toHaveProperty('id', leader1.id)
    })
})


