import {beforeEach, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {ActivityCall, ActivityGroupNode} from "../ActivityCall.js";
import {MonoSystem} from "../MonoSystem.js";
import {
    Activity,
    createInstances,
    Entity,
    Interaction,
    KlassByName,
    Relation,
    removeAllInstance,
    Dictionary
} from '@';
import '../computedDataHandles/index.js'
import {MatchExp} from '@interaqt/storage'

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('computed data in activity', () => {

    let createFriendRelationActivityCall: ActivityCall
    let system: MonoSystem

    let makeFriendActivityUUID: string
    let sendRequestUUID:string
    let approveUUID:string
    let rejectUUID:string
    let cancelUUID:string
    let deleteUUID: string
    let controller: Controller

    let userAId: string
    let userBId: string
    let userCId: string
    let userDId: string
    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/activity'))
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

        createFriendRelationActivityCall = controller.activityCallsByName.get('createFriendRelation')!
        makeFriendActivityUUID = createFriendRelationActivityCall.activity.uuid

        sendRequestUUID = createFriendRelationActivityCall.graph.head.uuid
        approveUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![0].head.uuid
        rejectUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![1].head.uuid
        cancelUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![2].head.uuid
        deleteUUID = Interaction.instances!.find(i => i.name === 'deleteFriend')!.uuid


        const userARef = await system.storage.create('User', {name: 'A', age:11})
        userAId = userARef.id

        const userBRef = await system.storage.create('User', {name: 'B', age:12})
        userBId = userBRef.id

        const userCRef = await system.storage.create('User', {name: 'C', age:13})
        userCId = userCRef.id

        const userDRef = await system.storage.create('User', {name: 'D', age:14})
        userDId = userDRef.id
    })

    test('make friend activity', async () => {
        // 0. 验证初始数据
        const userA: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key:'id',
                value: ['=', userAId]
            }), undefined, ['*']),
            roles:['user']
        }

        const userB: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key:'id',
                value: ['=', userBId]
            }), undefined, ['*']),
            roles:['user']
        }

        const userC: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key:'id',
                value: ['=', userCId]
            }), undefined, ['*']),
            roles:['user']
        }

        const userD: User = {
            ...await system.storage.findOne('User', MatchExp.atom({
                key:'id',
                value: ['=', userCId]
            }), undefined, ['*']),
            roles:['user']
        }

        const totalFriendRelation = await system.storage.get('state','totalFriendRelation')
        const everyRequestHandled = await system.storage.get('state','everyRequestHandled')
        const anyRequestHandled = await system.storage.get('state','anyRequestHandled')

        expect(userA.totalUnhandledRequest).toBe(0)
        expect(userA.totalFriendCount).toBe(0)
        expect(userA.everySendRequestHandled).toBeTruthy()
        expect(userA.anySendRequestHandled).toBeFalsy()
        expect(userB.totalFriendCount).toBe(0)
        expect(userB.totalUnhandledRequest).toBe(0)

        expect(totalFriendRelation).toBe(0)
        expect(everyRequestHandled).toBeTruthy()
        expect(anyRequestHandled).toBeFalsy()

        // 查询 request 数据
        const requestMatch = MatchExp.atom({
            key: 'from.name',
            value: ['=', userA.name]
        }).and({
            key:'to.name',
            value: ['=', userB.name]
        })

        // 3. a 发起 sendFriendRequest to b
        const payload = {
            to: userB,
            message: {
                content: 'let use make friend'
            }
        }
        const res2 = await controller.callActivityInteraction(makeFriendActivityUUID,  sendRequestUUID, undefined,{user: userA, payload})
        expect(res2.error).toBeUndefined()
        const { activityId } = res2.context!


        const userB1 = (await system.storage.findOne('User', MatchExp.atom({
                key:'id',
                value: ['=', userBId]
            }), undefined, ['*']))
        expect(userB1.totalUnhandledRequest).toBe(1)

        const userA1 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userAId]
        }), undefined, ['*']))
        expect(userA1.everySendRequestHandled).toBeFalsy()
        expect(userA1.anySendRequestHandled).toBeFalsy()
        const everyRequestHandled1 = await system.storage.get('state','everyRequestHandled')
        expect(everyRequestHandled1).toBeFalsy()

        // 6. 正确 b approve
        debugger
        const res5 = await controller.callActivityInteraction(makeFriendActivityUUID, approveUUID, activityId, {user: userB})
        expect(res5.error).toBeUndefined()

        const userB2 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userBId]
        }), undefined, ['*']))
        expect(userB2.totalUnhandledRequest).toBe(0)
        expect(userB2.totalFriendCount).toBe(1)

        const userA2 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userAId]
        }), undefined, ['*']))
        expect(userA2.totalFriendCount).toBe(1)
        expect(userA2.everySendRequestHandled).toBeTruthy()
        expect(userA2.anySendRequestHandled).toBeTruthy()

        const everyRequestHandled2 = await system.storage.get('state','everyRequestHandled')
        expect(everyRequestHandled2).toBeTruthy()
        const anyRequestHandled2 = await system.storage.get('state','anyRequestHandled')
        expect(anyRequestHandled2).toBeTruthy()

        const totalFriendRelation1 = await system.storage.get('state','totalFriendRelation')
        expect(totalFriendRelation1).toBe(1)


        // 删除关系，继续驱动状态机
        const res6 = await controller.callInteraction(deleteUUID, {
            user: userA,
            payload: {
                target: userB
            }
        })
        expect(res6.error).toBeUndefined()

        const userB3 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userBId]
        }), undefined, ['*']))
        expect(userB3.totalFriendCount).toBe(0)

        const userA3 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userAId]
        }), undefined, ['*']))
        expect(userA3.totalFriendCount).toBe(0)


        const totalFriendRelation2 = await system.storage.get('state','totalFriendRelation')
        expect(totalFriendRelation2).toBe(0)

        // c 与 d 发起请求
        const payload11 = {
            to: userB,
            message: {
                content: 'let use make friend'
            }
        }
        const res11 = await controller.callActivityInteraction(makeFriendActivityUUID,  sendRequestUUID, undefined,{user: userC, payload: payload11})
        expect(res11.error).toBeUndefined()
        const activity11 = res11.context!.activityId


        const payload12 = {
            to: userB,
            message: {
                content: 'let use make friend'
            }
        }
        const res12 = await controller.callActivityInteraction(makeFriendActivityUUID,  sendRequestUUID, undefined,{user: userD, payload: payload12})
        expect(res12.error).toBeUndefined()
        const activity12 = res12.context!.activityId


        const userB12 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userBId]
        }), undefined, ['*']))
        expect(userB12.totalUnhandledRequest).toBe(2)

        const everyRequestHandled12 = await system.storage.get('state','everyRequestHandled')
        expect(everyRequestHandled12).toBeFalsy()
        const anyRequestHandled12 = await system.storage.get('state','anyRequestHandled')
        expect(anyRequestHandled12).toBeTruthy()

        // b approve c 和 d
        const res13 = await controller.callActivityInteraction(makeFriendActivityUUID, approveUUID, activity11, {user: userB})
        expect(res13.error).toBeUndefined()
        const res14 = await controller.callActivityInteraction(makeFriendActivityUUID, approveUUID, activity12, {user: userB})
        expect(res14.error).toBeUndefined()

        const userB14 = (await system.storage.findOne('User', MatchExp.atom({
            key:'id',
            value: ['=', userBId]
        }), undefined, ['*']))
        expect(userB14.totalUnhandledRequest).toBe(0)

        const everyRequestHandled14 = await system.storage.get('state','everyRequestHandled')
        expect(everyRequestHandled14).toBeTruthy()
        const anyRequestHandled14 = await system.storage.get('state','anyRequestHandled')
        expect(anyRequestHandled14).toBeTruthy()
    })

})
