import {beforeAll, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {MonoSystem} from "../MonoSystem.js";
import {
    Activity, BoolExp,
    createInstances,
    Entity,
    Interaction,
    KlassByName,
    Relation,
    removeAllInstance,
    State
} from "@interaqt/shared";
import '../computedDataHandles/index.js'
import {DataAPIThis, startServer} from "../server.js";
import {MatchAtom} from "@interaqt/storage";

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

function post(url: string, data: any, headers?: Object) {
    return fetch(url, {
        method: 'POST',
        // @ts-ignore
        headers: {
            "Content-Type": "application/json",
            ...(headers || {})
        },
        body: JSON.stringify(data)
    })
}


describe('server test', () => {

    let system: MonoSystem
    let sendRequestUUID: string
    let approveRequestUUID: string
    let controller: Controller

    let userAId: number
    let userBId: number
    let userCId: string

    beforeAll(async () => {
        removeAllInstance()
        const {data} = (await import('./data/activity'))
        createInstances(data, false)

        // createInstances(data, false)
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */


        system = new MonoSystem()
        system.conceptClass = KlassByName
        controller = new Controller(
            system,
            [...Entity.instances].filter(e => !e.isRef),
            [...Relation.instances],
            [...Activity.instances],
            [...Interaction.instances],
            [...State.instances]
        )
        await controller.setup(true)
        sendRequestUUID = Interaction.instances!.find(i => i.name === 'sendRequest')!.uuid
        approveRequestUUID = Interaction.instances!.find(i => i.name === 'approve')!.uuid

        userAId = 11
        userBId = 12

        const getRequests = function(this: DataAPIThis, match: BoolExp<MatchAtom>) {
            return this.system.storage.find('Request', match, undefined, ['*',
                ['from', {attributeQuery: ["*"]}],
                ['to', {
                    attributeQuery: ["*", ["&", {attributeQuery:["*"]}]]
                }]
            ])
        }
        getRequests.params = [BoolExp<MatchAtom>]

        startServer(controller,  {
            port: 8082,
            parseUserId: async (headers) => {
                // TODO: 从 headers 中获取 userId
                return headers.userid
            }
        }, {
            getRequests
        })
    })

    test('use friend activity to test server', async () => {

        const response = await fetch('http://localhost:8082/ping')
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ message: 'pong' })

        // 1. 创建用户 a
        const resp1 = await post('http://localhost:8082/user/sync', {
            userId: userAId
        })
        expect(resp1.status).toBe(200)


        // 2. 创建用户 b
        await post('http://localhost:8082/user/sync', {
            userId: userBId
        })

        const users = await system.storage.find('User', undefined, undefined, ['*'])
        expect(users.length).toBe(2)
        expect(users[0].id).toBe(userAId)
        expect(users[1].id).toBe(userBId)

        const userA = {
            id: userAId,
            roles: ['user']
        }

        const userB= {
            id: userBId,
            roles: ['user']
        }


        // a 创建活动
        const {data} = await (await post('http://localhost:8082/api', {
            activity: 'createFriendRelation'
        }, {
            "userid": userAId,
        })).json()
        const {activityId} = data

        // 3. a 发起 sendFriendRequest
        const payload = {
            to: userB,
            request:{
                reason: 'let use make friend'
            }
        }

        const resp2 = await post('http://localhost:8082/api', {
            activity: 'createFriendRelation',
            activityId,
            interaction: 'sendRequest',
            payload
        }, {
            "userid": userAId,
        })
        expect(resp2.status).toBe(200)

        const requests1 = await controller.system.storage.find('Request', undefined, undefined, ['*', ['from', {attributeQuery: ["*"]}], ['to', {attributeQuery: ["*"]}]])
        expect(requests1.length).toBe(1)
        expect(requests1[0].to.id).toBe(userBId)
        expect(requests1[0].from.id).toBe(userAId)
        expect(requests1[0].approved).toBeFalsy()
        expect(requests1[0].approved_total_count).toBe(1)
        expect(requests1[0].rejected).toBeFalsy()
        expect(requests1[0].result).toBe('pending')

        // // 4. b 接受
        const payload2 = {}

        const resp3 = await post('http://localhost:8082/api', {
            activity: 'createFriendRelation',
            activityId,
            interaction: 'approve',
            payload: payload2
        }, {
            "userid": userBId,
        })
        expect(resp3.status).toBe(200)

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

        // 验证 data api
        const params = [
            BoolExp.atom<MatchAtom>({
                key: 'to.id',
                value: ['=', userBId]
            }).toValue()
        ]
        const resp4 = await post('http://localhost:8082/data/getRequests', params, {
            "userid": userBId,
        })
        expect(resp4.status).toBe(200)
        const requests3 = await resp4.json()
        expect(requests3.length).toBe(1)
        expect(requests3[0].id).toBe(requests2[0].id)
        expect(requests3[0].to.id).toBe(userBId)

    })
})