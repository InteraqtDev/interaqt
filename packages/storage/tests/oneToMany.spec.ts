import {EntityQueryHandle} from "../erstorage/ERStorage";
import {expect, test, describe, afterEach, beforeAll, beforeEach} from "bun:test";
import { createCommonData} from "./data/common";
import {DBSetup} from "../erstorage/Setup";
import { SQLiteDB } from '../../runtime/BunSQLite'
import {EntityToTableMap} from "../erstorage/EntityToTableMap";
import {MatchExpression} from "../erstorage/MatchExpression.ts";

describe('one to many', () => {
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

    test('create one to many data:create with new related as source', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            member: [
                {name:'m1', age:12},
                {name:'m2', age:13},
            ]}
        const userA = await entityQueryHandle.create('User', rawData)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['member', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject(rawData)
    })

    test('create one to many data:create with existing related as source', async () => {
        const user1 = await entityQueryHandle.create('User', { name: 'm1', age:12})
        const user2 = await entityQueryHandle.create('User', { name: 'm2', age:13})

        const userA = await entityQueryHandle.create('User', {
            name: 'a1',
            age:11,
            member: [
                user1,
                user2
            ]
        })

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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
    })


    test('create one to many data:create with new related as target', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            leader: {name:'l1', age:12}
        }
        const userA = await entityQueryHandle.create('User', rawData)

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject(rawData)
    })


    test('create one to many data:create with existing related as target', async () => {
        const user1 = await entityQueryHandle.create('User', {name:'l1', age:12})
        const userA = await entityQueryHandle.create('User', {name: 'a1', age:11, leader: user1})

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age', ['leader', { attributeQuery: ['name', 'age']}]]
        )

        expect(findUser).toMatchObject({
            name: 'a1',
            age:11,
            leader: {name:'l1', age:12
            }
        })
    })


    test('delete one to many data:delete self as source', async () => {
        const rawData = {
            name: 'a1',
            age:11,
            leader: {name:'l1', age:12}
        }
        const userA = await entityQueryHandle.create('User', rawData)
        await entityQueryHandle.delete('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }))

        const findUsers = await entityQueryHandle.find('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age']
        )

        expect(findUsers.length).toBe(0)

        const findUsers2 = await entityQueryHandle.find('User',
            undefined,
            {},
            ['name', 'age']
        )
        console.log(findUsers2)
        expect(findUsers2.length).toBe(1)
        expect(findUsers2[0].name).toBe('l1')
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
        // 删除用户
        // console.log(await entityQueryHandle.database.query(`select * from User_leader_member_User`))
        await entityQueryHandle.delete('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }))

        const findUsers = await entityQueryHandle.find('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
            {},
            ['name', 'age']
        )

        expect(findUsers.length).toBe(0)

        const findRelations = await entityQueryHandle.find('User',
            undefined,
            {},
            ['name', 'age', ['leader', {attributeQuery: ['name', 'age']}]]
        )
        expect(findRelations.length).toBe(2)
        expect(findRelations[0].leader.id).toBe(null)
        expect(findRelations[1].leader.id).toBe(null)

        //1:n reliance 要被连带删除
        const findPowers = await entityQueryHandle.find('Power', undefined, undefined, ['powerName'])
        expect(findPowers.length).toBe(0)
    })



    test('update one to many data:update self with new related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})


        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [{name: 'm1', age:11} ] })


        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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


        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [{name: 'm2', age:14}] })

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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
    })

    test('update one to many data:update self with new related as target', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})

        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader : {name: 'm1', age:11} })

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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

        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader: {name: 'm2', age:14} })

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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
    })


    test('update one to many data:update with existing related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const userB = await entityQueryHandle.create('User', {name: 'm1', age:11})
        const userC = await entityQueryHandle.create('User', {name: 'm2', age:14})

        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [userB] })

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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

        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { member: [userC] })

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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
    })

    test('update one to many data:update with existing related as source', async () => {
        const userA = await entityQueryHandle.create('User', {name:'a1', age:12})
        const userB = await entityQueryHandle.create('User', {name: 'm1', age:11})
        const userC = await entityQueryHandle.create('User', {name: 'm2', age:14})

        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader : userB })

        const findUser = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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

        await entityQueryHandle.update('User', MatchExpression.createFromAtom({
            key: 'id',
            value: ['=', userA.id]
        }), { leader: userC })

        const findUser2 = await entityQueryHandle.findOne('User',
            MatchExpression.createFromAtom({ key: 'id', value: ['=', userA.id]}),
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
    })
})




