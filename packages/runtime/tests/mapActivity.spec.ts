import {describe, test, expect, beforeEach} from "bun:test";
import {Controller} from "../Controller";
import {ActivityCall, ActivityGroupNode} from "../AcitivityCall";
import {MemorySystem} from "../MemorySystem";
import {createInstances, getInstance, KlassByName, KlassInstanceOf, removeAllInstance} from "../../shared/createClass";
import { Activity, Interaction } from "../../shared/activity/Activity";
import { Entity, Relation } from "../../shared/entity/Entity";
import {EntityQueryHandle, MatchExpression} from '../../storage/erstorage/ERStorage'

describe('map activity', () => {

    let createFriendRelationActivityCall: ActivityCall
    let system: MemorySystem

    let makeFriendActivityUUID: string
    let sendRequestUUID:string
    let approveUUID:string
    let rejectUUID:string
    let cancelUUID:string
    let controller

    let userA
    let userB
    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/simpleActivityWithER'))
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */

        createInstances(data, false)
        system = new MemorySystem()
        system.conceptClass = KlassByName
        controller = new Controller(system, [...Entity.instances].filter(e => !e.isRef), [...Relation.instances], [...Activity.instances], [...Interaction.instances])
        await controller.setup()

        createFriendRelationActivityCall = controller.activityCallsByName.get('createFriendRelation')
        makeFriendActivityUUID = createFriendRelationActivityCall.activity.uuid

        sendRequestUUID = createFriendRelationActivityCall.graph.head.uuid
        approveUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![0].head.uuid
        rejectUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![1].head.uuid
        cancelUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![2].head.uuid


        userA = {name: 'A', age:10}
        const userARef = await system.storage.queryHandle.create('User', userA)
        userA.id = userARef.id
        userA.roles = ['user']

        userB = {name: 'B', age:12}
        const userBRef = await system.storage.queryHandle.create('User', userB)
        userB.id = userBRef.id
        userB.roles = ['user']

    })

    test('make friend activity', async () => {
        // 1. 创建 activity
        const { activityId, state } = controller.createActivity(makeFriendActivityUUID)
        expect(activityId).not.toBe(null)
        expect(state.current!.uuid).toBe(sendRequestUUID)
        expect(approveUUID).not.toBe(null)
        expect(rejectUUID).not.toBe(null)
        expect(cancelUUID).not.toBe(null)

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
        const res2 = await controller.callActivityInteraction(makeFriendActivityUUID,  sendRequestUUID, activityId,{user: userA, payload})
        expect(res2.error).toBeUndefined()

        // 4. 交互顺序错误 a sendFriendRequest
        // const res3 = createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA})
        // expect(res3.error).toBeDefined()

        // 5. 角色错误 a approve
        // const res4 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userA})
        // expect(res4.error).toBeDefined()


        // 6. 正确 b approve
        const res5 = await controller.callActivityInteraction(makeFriendActivityUUID, approveUUID, activityId, {user: userB})
        expect(res5.error).toBeUndefined()

        // 7. 错误 b reject
        // const res6 = createFriendRelationActivityCall.callInteraction(activityId, rejectUUID, {user: userB})
        // expect(res6.error).toBeDefined()

        // 8. 错误 a cancel
        // const res7 = createFriendRelationActivityCall.callInteraction(activityId, cancelUUID, {user: userA})
        // expect(res7.error).toBeDefined()
        // 8. 获取 activity 状态是否 complete
        const currentState = createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()


        // 查询 request 数据
        const match = MatchExpression.createFromAtom({
            key: 'from.name',
            value: ['=', userA.name]
        }).and({
            key:'to.name',
            value: ['=', userB.name]
        })
        const requests = await controller.system.storage.queryHandle.find('Request', match, undefined, [['from', {attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])

        expect(requests.length).toBe(1)
        console.log(requests)
    })

})
