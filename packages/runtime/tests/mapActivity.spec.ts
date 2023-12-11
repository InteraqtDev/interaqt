import {beforeEach, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {ActivityCall, ActivityGroupNode} from "../ActivityCall.js";
import {MonoSystem} from "../MonoSystem.js";
import {createInstances, KlassByName, removeAllInstance} from "@interaqt/shared";
import {Activity, Interaction} from "@interaqt/shared";
import {Entity, Relation} from "@interaqt/shared";
import {State} from "@interaqt/shared";
import '../computedDataHandles/index.js'
import {MatchExp} from '@interaqt/storage'

// 里面有所有必须的数据？
type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('map activity', () => {

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
    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/activity/index.js'))
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

        createFriendRelationActivityCall = controller.activityCallsByName.get('createFriendRelation')!
        makeFriendActivityUUID = createFriendRelationActivityCall.activity.uuid

        sendRequestUUID = createFriendRelationActivityCall.graph.head.uuid
        approveUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![0].head.uuid
        rejectUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![1].head.uuid
        cancelUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![2].head.uuid
        deleteUUID = Interaction.instances!.find(i => i.name === 'deleteFriend')!.uuid


        const userARef = await system.storage.create('User', {name: 'A', age:10})
        userAId = userARef.id

        const userBRef = await system.storage.create('User', {name: 'B', age:12})
        userBId = userBRef.id
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

        const totalFriendRelation = await system.storage.get('state','totalFriendRelation')

        expect(userA.totalUnhandledRequest).toBe(0)
        expect(userA.totalFriendCount).toBe(0)
        expect(userA.everySendRequestHandled).toBeTruthy()
        expect(userA.anySendRequestHandled).toBeFalsy()
        expect(userB.totalFriendCount).toBe(0)
        expect(userB.totalUnhandledRequest).toBe(0)

        expect(totalFriendRelation).toBe(0)


        // 查询 request 数据
        const requestMatch = MatchExp.atom({
            key: 'from.name',
            value: ['=', userA.name]
        }).and({
            key:'to.name',
            value: ['=', userB.name]
        })

        const requests1 = await controller.system.storage.find('Request', requestMatch, undefined, ['handled', ['activity', {attributeQuery: ['id']}], ['from',{attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])
        expect(requests1.length).toBe(0)
        // 2. 交互顺序错误 approve
        // const res1 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userA})
        // expect(res1.error).toBeDefined()

        // 3. a 发起 sendFriendRequest
        const payload = {
            to: userB,
            message: {
                content: 'let use make friend'
            }
        }
        const res2 = await controller.callActivityInteraction(makeFriendActivityUUID,  sendRequestUUID, undefined,{user: userA, payload})
        expect(res2.error).toBeUndefined()
        const activityId = res2.context!.activityId

        const requests2 = await controller.system.storage.find('Request', requestMatch, undefined, ['handled', ['activity', {attributeQuery: ['id']}], ['from',{attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])
        expect(requests2.length).toBe(1)
        expect(!!requests2[0].handled).toBeFalsy()
        expect(requests2[0].activity.id).toBe(activityId)

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


        // 4. 交互顺序错误 a sendFriendRequest
        // const res3 = createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA})
        // expect(res3.error).toBeDefined()

        // 5. 角色错误 a approve
        // const res4 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userA})
        // expect(res4.error).toBeDefined()

        // 6. 正确 b approve
        const res5 = await controller.callActivityInteraction(makeFriendActivityUUID, approveUUID, activityId, {user: userB})
        expect(res5.error).toBeUndefined()

        const requests3 = await controller.system.storage.find('Request', requestMatch, undefined, ['handled', ['activity', {attributeQuery: ['id']}], ['from',{attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])
        expect(requests3.length).toBe(1)
        expect(!!requests3[0].handled).toBeTruthy()
        expect(requests3[0].activity.id).toBe(activityId)

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
        // 7. 错误 b reject
        // const res6 = createFriendRelationActivityCall.callInteraction(activityId, rejectUUID, {user: userB})
        // expect(res6.error).toBeDefined()

        // 8. 错误 a cancel
        // const res7 = createFriendRelationActivityCall.callInteraction(activityId, cancelUUID, {user: userA})
        // expect(res7.error).toBeDefined()
        // 8. 获取 activity 状态是否 complete
        const currentState = await createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()

        const relationName = controller.system.storage.getRelationName('User', 'friends')
        const friendRelations = await controller.system.storage.findRelationByName(relationName, undefined, undefined, [['source', {attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['name', 'age']}]])

        expect(friendRelations.length).toBe(1)
        expect(friendRelations[0].source.name).toBe('A')
        expect(friendRelations[0].source.id).toBe(userA.id)
        expect(friendRelations[0].target.name).toBe('B')
        expect(friendRelations[0].target.id).toBe(userB.id)

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

        const friendRelations2 = await controller.system.storage.findRelationByName(relationName, undefined, undefined, [['source', {attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['name', 'age']}]])
        expect(friendRelations2.length).toBe(0)

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

    })

})
