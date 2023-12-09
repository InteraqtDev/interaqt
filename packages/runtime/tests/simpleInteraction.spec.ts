import {beforeEach, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {MonoSystem} from "../MonoSystem.js";
import {Interaction, KlassByName, removeAllInstance} from "@interaqt/shared";
import '../computedDataHandles/index.js'
import {MatchExp} from '@interaqt/storage'

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('map interaction', () => {

    let system: MonoSystem
    let createRequestUUID: string
    let approveRequestUUID: string
    let getMyPendingRequestsUUID: string
    let controller: Controller

    let userAId: string
    let userBId: string
    let userCId: string
    beforeEach(async () => {
        removeAllInstance()
        const { entities, relations, interactions} = (await import('./data/leaveRequestSimple.js'))

        system = new MonoSystem()
        system.conceptClass = KlassByName
        controller = new Controller(
            system,
            entities,
            relations,
            [],
            interactions,
            []
        )
        await controller.setup(true)
        createRequestUUID = Interaction.instances!.find(i => i.name === 'createRequest')!.uuid
        approveRequestUUID = Interaction.instances!.find(i => i.name === 'approve')!.uuid
        getMyPendingRequestsUUID = Interaction.instances!.find(i => i.name === 'getMyPendingRequests')!.uuid

        const userARef = await system.storage.create('User', {name: 'A'})
        userAId = userARef.id

        const userBRef = await system.storage.create('User', {name: 'B', supervisor: userARef})
        userBId = userBRef.id

        const userCRef = await system.storage.create('User', {name: 'C', supervisor: userBRef})
        userCId = userCRef.id
    })

    test('simple leave request example test', async () => {
        // 0. 验证初始数据


        const userC: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key: 'id',
                value: ['=', userCId]
            }), undefined, ['*']),
            roles: ['user']
        }

        // 3. a 发起 leave request
        const payload = {
            request:{
                reason: 'let use make friend'
            }
        }
        const res1 = await controller.callInteraction(createRequestUUID,  {user: userC, payload})
        expect(res1.error).toBeUndefined()

        const requests1 = await controller.system.storage.find('Request', undefined, undefined, ['*', ['from', {attributeQuery: ["*"]}]])
        expect(requests1.length).toBe(1)
        expect(requests1[0].from.id).toBe(userCId)
        expect(requests1[0].approved_match_count).toBe(0)
        expect(requests1[0].approved_total_count).toBe(2)
        expect(requests1[0].approved).toBeFalsy()
        expect(requests1[0].result).toBe('pending')


        const userA: User = await system.storage.findOne('User', MatchExp.atom({
                key: 'id',
                value: ['=', userAId]
            }), undefined, ['*'])

        const userB: User = await system.storage.findOne('User', MatchExp.atom({
                key: 'id',
                value: ['=', userBId]
            }), undefined, ['*'])

        expect(userB.pendingRequestCount).toBe(1)
        expect(userA.pendingSubRequestCount).toBe(1)

        // // 4. b 同意
        const payload2 = {
            request: requests1[0]
        }

        // 错误 c 自己同意
        const res2w = await controller.callInteraction(approveRequestUUID,  {user: userC, payload: payload2})
        expect(res2w.error).toBeDefined()

        const res2 = await controller.callInteraction(approveRequestUUID,  {user: userB, payload: payload2})
        expect(res2.error).toBeUndefined()
        const requests2 = await controller.system.storage.find(
            'Request',
            undefined,
            undefined,
            ['*']
        )
        expect(requests2.length).toBe(1)
        expect(requests2[0].approved_match_count).toBe(1)
        expect(requests2[0].approved_total_count).toBe(2)
        expect(requests2[0].approved).toBeFalsy()
        expect(requests2[0].result).toBe('pending')

        // 获取 getMyPendingRequestsUUID
        const res3 = await controller.callInteraction(getMyPendingRequestsUUID,  {user: userA, query: { attributeQuery: ['*', ['reviewer', {attributeQuery: ['*']}]]}})
        expect(res3.error).toBeUndefined()
        const data = res3.data
        expect(data.length).toBe(1)
        expect(data[0].approved_match_count).toBe(1)
        expect(data[0].approved_total_count).toBe(2)
        expect(data[0].approved).toBeFalsy()
        expect(data[0].result).toBe('pending')
        expect(data[0].reviewer.length).toBe(2)
        expect(data[0].reviewer.find((reviewer: any) => reviewer.id === userAId)).toBeDefined()

        // a 同意
        const res4 = await controller.callInteraction(approveRequestUUID,  {user: userA, payload: payload2})
        expect(res4.error).toBeUndefined()
        const requests4 = await controller.system.storage.find(
            'Request',
            undefined,
            undefined,
            ['*']
        )
        expect(requests4.length).toBe(1)
        expect(requests4[0].approved_match_count).toBe(2)
        expect(requests4[0].approved_total_count).toBe(2)
        expect(requests4[0].approved).toBeTruthy()
        expect(requests4[0].result).toBe('approved')
    })
})