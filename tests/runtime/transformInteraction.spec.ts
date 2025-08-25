import { beforeEach, describe, expect, test } from "vitest";
import {
    Controller, MonoSystem,
    BoolExp, Interaction,
    KlassByName, SQLiteDB, ConditionError
} from 'interaqt';
import { createData } from './data/leaveRequest.js';

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('map interaction', () => {

    let system: MonoSystem
    let sendRequestName: string
    let approveRequestName: string
    let controller: Controller

    let userAId: string
    let userBId: string
    let userCId: string
    beforeEach(async () => {
        const {entities, interactions, relations} = createData()

        // createInstances(data)
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */

        // const db = new SQLiteDB('test.db')
        const db = new SQLiteDB(':memory:')
        system = new MonoSystem(db)
        system.conceptClass = KlassByName

        controller = new Controller({
            system,
            entities,
            relations,
            activities: [],
            interactions
        })
        await controller.setup(true)
        sendRequestName = 'sendRequest'
        approveRequestName = 'approve'

        const userARef = await system.storage.create('User', {name: 'A', age: 10})
        userAId = userARef.id

        const userBRef = await system.storage.create('User', {name: 'B', age: 12})
        userBId = userBRef.id

        const userCRef = await system.storage.create('User', {name: 'C', age: 14})
        userCId = userCRef.id
    })

    test('map interaction to relation', async () => {
        // 0. 验证初始数据
        const userA: User = {
            ...await system.storage.findOne('User', BoolExp.atom({
                key: 'id',
                value: ['=', userAId]
            }), undefined, ['*']),
            roles: ['user']
        }

        const userB: User = {
            ...await system.storage.findOne('User', BoolExp.atom({
                key: 'id',
                value: ['=', userBId]
            }), undefined, ['*']),
            roles: ['user']
        }

        const userC: User = {
            ...await system.storage.findOne('User', BoolExp.atom({
                key: 'id',
                value: ['=', userCId]
            }), undefined, ['*']),
            roles: ['user']
        }

        // 3. a 发起 sendFriendRequest
        const payload = {
            to: userB,
            reason: 'let use make friend'
        }
        const res1 = await controller.callInteraction(sendRequestName,  {user: userA, payload})
        expect(res1.error).toBeUndefined()

        const requests1 = await controller.system.storage.find('Request', undefined, undefined, ['*', ['from', {attributeQuery: ["*"]}], ['to', {attributeQuery: ["*"]}]])
        expect(requests1.length).toBe(1)
        expect(requests1[0].to.id).toBe(userBId)
        expect(requests1[0].from.id).toBe(userAId)
        expect(requests1[0].approved).toBeFalsy()
        expect(requests1[0].rejected).toBeFalsy()
        expect(requests1[0].result).toBe('pending')


        // 4. 错误 C 接受
        const _payload2 = {
            request: requests1[0]
        }


        // should throw
        const _res2 = await controller.callInteraction(approveRequestName,  {user: userC, payload: _payload2})
        expect(_res2.error).toBeInstanceOf(ConditionError)
        // FIXME 获取 userAttribute error 信息

        // 4. b 接受
        const payload2 = {
            request: requests1[0]
        }
        const res2 = await controller.callInteraction(approveRequestName,  {user: userB, payload: payload2})
        const requests2 = await controller.system.storage.find(
            'Request',
            undefined,
            undefined,
            ['*',
                ['from', {attributeQuery: ["*"]}],
                ['to', {
                    attributeQuery: ["*", ["&", {attributeQuery:["*"]}]]
                }]
            ]
        )
        expect(requests2.length).toBe(1)
        expect(requests2[0].approved).toBeTruthy()
        expect(requests2[0].rejected).toBeFalsy()
        expect(requests2[0].result).toBe('approved')
    })
})