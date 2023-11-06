import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExp} from "../erstorage/MatchExp.ts";
import {EntityQueryHandle} from "../erstorage/EntityQueryHandle.ts";
import {MutationEvent} from "../erstorage/RecordQueryAgent.ts";
import {LINK_SYMBOL} from "../erstorage/RecordQuery.ts";
import exp from "constants";

describe('one to many', () => {
    let db: SQLiteDB
    let setup: DBSetup
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

    test('create one to many data:create with new related as source', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            member: [
                {name:'m1', age:12},
                {name:'m2', age:13},
            ]}

        const events: MutationEvent[] = []
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
                recordName: "User_leader_member_User",
                record: {
                    id: userA.member[0][LINK_SYMBOL].id
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
                    id: userA.member[1][LINK_SYMBOL].id,
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
            }
        ])
    })

    test('create one to many data:create with existing related as source', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'm1', age:12})
        const user2 = await entityQueryHandle.create('User', { name: 'm2', age:13})

        const events: MutationEvent[] = []
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

        const events: MutationEvent[] = []
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
                recordName: "User_leader_member_User",
                record: {
                    id: userA.leader[LINK_SYMBOL].id
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
            }
        ])
    })

    test('create one to many data:create with existing related as target', async () => {
        const user1 = await entityQueryHandle.create('User', {name:'l1', age:12})

        const events: MutationEvent[] = []
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
                recordName: "User_leader_member_User",
                record: {
                    id: userA.leader[LINK_SYMBOL].id
                }
            }, {
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

        const events: MutationEvent[] = []

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
                recordName: "User",
                record: {
                    name: "a1",
                    age: 11,
                    id: 2,
                    leader: {
                        id: userA.leader.id
                    }
                }
            }, {
                type: "delete",
                recordName: "User_leader_member_User",
                record: {
                    id: userA.leader[LINK_SYMBOL].id
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

        const events: MutationEvent[] = []
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
            {},
            ['name', 'age', ['leader', {attributeQuery: ['name', 'age']}]]
        )
        expect(findUsers2.length).toBe(2)
        expect(findUsers2[0].name).toBe('m1')
        expect(findUsers2[0].leader.id).toBe(null)
        expect(findUsers2[1].name).toBe('m2')
        expect(findUsers2[1].leader.id).toBe(null)

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

        const events: MutationEvent[] = []
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

        const events2: MutationEvent[] = []
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
                    id: updatedUser.member[0][LINK_SYMBOL].id
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

        const events: MutationEvent[] = []
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
            }, {
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUser.leader[LINK_SYMBOL].id,
                }
            }
        ])
    })


    test('update one to many data:update with existing related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const userB = await entityQueryHandle.create('User', {name: 'm1', age:11})
        const userC = await entityQueryHandle.create('User', {name: 'm2', age:14})

        const events: MutationEvent[] = []
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

        const events2: MutationEvent[] = []
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
                    id: updatedUserA.member[0][LINK_SYMBOL].id
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

    test('update one to many data:update with existing related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const userB = await entityQueryHandle.create('User', {name: 'm1', age:11})
        const userC = await entityQueryHandle.create('User', {name: 'm2', age:14})

        const events: MutationEvent[] = []
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

        const events2: MutationEvent[] = []
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
                type: "create",
                recordName: "User_leader_member_User",
                record: {
                    id: updatedUserA2.leader[LINK_SYMBOL].id,
                }
            }
        ])
    })
})




