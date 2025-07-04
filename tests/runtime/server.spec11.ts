import {beforeAll, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {MonoSystem} from "../MonoSystem.js";
import {
    Activity,
    BoolExp,
    createInstances, DataAPIContext,
    Entity,
    Interaction,
    KlassByName,
    Relation,
    removeAllInstance,
    Dictionary,
    createDataAPI
} from 'src/runtime/index.js';
import {startServer} from "../server.js";
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
        const {data} = (await import('../data/activity/index.js'))
        createInstances(data)

        // createInstances(data)
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
            [...Entity.instances].filter(e => !(e as any).isRef),
            [...Relation.instances],
            [...Activity.instances],
            [...Interaction.instances],
            [...Dictionary.instances]
        )
        await controller.setup(true)
        sendRequestUUID = Interaction.instances!.find(i => i.name === 'sendRequest')!.uuid
        approveRequestUUID = Interaction.instances!.find(i => i.name === 'approve')!.uuid

        userAId = 11
        userBId = 12

        const getRequests = createDataAPI(function(this: Controller, context: DataAPIContext, match: BoolExp<MatchAtom>) {
            return this.system.entities.find('Request', match, undefined, ['*',
                ['from', {attributeQuery: ["*"]}],
                ['to', {
                    attributeQuery: ["*", ["&", {attributeQuery:["*"]}]]
                }]
            ])
        }, { params: [BoolExp<MatchAtom>]})

        const syncUser = createDataAPI(function syncUser(this: Controller, context: DataAPIContext, body: any) {
            return this.system.entities.create('User', { id: body.userId })
        }, {allowAnonymous:true, useNamedParams: true})

        startServer(controller,  {
            port: 8083,
            parseUserId: async (headers) => {
                // TODO: 从 headers 中获取 userId
                return headers.userid
            }
        }, {
            getRequests,
            syncUser
        })
    })

    test('use friend activity to test server', async () => {

        const response = await fetch('http://localhost:8083/ping')
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ message: 'pong' })

        // 1. 创建用户 a
        const resp1 = await post('http://localhost:8083/api/syncUser', {
            userId: userAId
        })
        expect(resp1.status).toBe(200)


        // 2. 创建用户 b
        await post('http://localhost:8083/api/syncUser', {
            userId: userBId
        })

        const users = await system.entities.find('User', undefined, undefined, ['*'])
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



        // 3. a 发起 sendFriendRequest
        const payload = {
            to: userB,
            request:{
                reason: 'let use make friend'
            }
        }

        const resp2 = await post('http://localhost:8083/interaction', {
            activity: 'createFriendRelation',
            interaction: 'sendRequest',
            payload
        }, {
            "userid": userAId,
        })
        const {activityId} = (await resp2.json()).context!

        const requests1 = await controller.system.entities.find('Request', undefined, undefined, ['*', ['from', {attributeQuery: ["*"]}], ['to', {attributeQuery: ["*"]}]])
        expect(requests1.length).toBe(1)
        expect(requests1[0].to.id).toBe(userBId)
        expect(requests1[0].from.id).toBe(userAId)
        expect(requests1[0].approved).toBeFalsy()
        expect(requests1[0].approved_total_count).toBe(1)
        expect(requests1[0].rejected).toBeFalsy()
        expect(requests1[0].result).toBe('pending')

        // // 4. b 接受
        const payload2 = {}

        const resp3 = await post('http://localhost:8083/interaction', {
            activity: 'createFriendRelation',
            activityId,
            interaction: 'approve',
            payload: payload2
        }, {
            "userid": userBId,
        })
        expect(resp3.status).toBe(200)

        const requests2 = await controller.system.entities.find(
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
        const resp4 = await post('http://localhost:8083/api/getRequests', params, {
            "userid": userBId,
        })
        expect(resp4.status).toBe(200)
        const requests3 = await resp4.json()
        expect(requests3.length).toBe(1)
        expect(requests3[0].id).toBe(requests2[0].id)
        expect(requests3[0].to.id).toBe(userBId)

    })
})