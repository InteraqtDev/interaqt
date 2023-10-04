import {describe, test, expect, beforeEach} from "bun:test";
import {Controller} from "../Controller";
import {ActivityCall, ActivityGroupNode} from "../AcitivityCall";
import {MemorySystem} from "../MemorySystem";
import {createInstances, getInstance, KlassByName, KlassInstanceOf, removeAllInstance, stringifyAllInstances} from "../../shared/createClass";
import { Activity, Interaction } from "../../shared/activity/Activity";
import { Entity, Relation } from "../../shared/entity/Entity";
import '../incrementalComputationHandles/MapActivityToEntity'
import '../incrementalComputationHandles/RelationStateMachine'
import {MatchExpression} from '../../storage/erstorage/MatchExpression'
import exp from "constants";

// 里面有所有必须的数据？


type User = {
    id: string,
    roles: string[],
    [k:string]: any
}

describe('map activity', () => {

    let createFriendRelationActivityCall: ActivityCall
    let system: MemorySystem

    let makeFriendActivityUUID: string
    let sendRequestUUID:string
    let approveUUID:string
    let rejectUUID:string
    let cancelUUID:string
    let deleteUUID: string
    let controller: Controller

    let userA: User
    let userB: User
    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/activity'))
        createInstances(data, false)

        // createInstances(data, false)
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */


        system = new MemorySystem()
        system.conceptClass = KlassByName
        controller = new Controller(system, [...Entity.instances].filter(e => !e.isRef), [...Relation.instances], [...Activity.instances], [...Interaction.instances])
        await controller.setup()

        createFriendRelationActivityCall = controller.activityCallsByName.get('createFriendRelation')!
        makeFriendActivityUUID = createFriendRelationActivityCall.activity.uuid

        sendRequestUUID = createFriendRelationActivityCall.graph.head.uuid
        approveUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![0].head.uuid
        rejectUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![1].head.uuid
        cancelUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![2].head.uuid
        deleteUUID = Interaction.instances.find(i => i.name === 'deleteFriend').uuid


        userA = {name: 'A', age:10}
        const userARef = await system.storage.queryHandle!.create('User', userA)
        userA.id = userARef.id
        userA.roles = ['user']

        userB = {name: 'B', age:12}
        const userBRef = await system.storage.queryHandle!.create('User', userB)
        userB.id = userBRef.id
        userB.roles = ['user']

    })

    test.only('make friend activity', async () => {
        // 1. 创建 activity
        const { activityId, state } = controller.createActivity(makeFriendActivityUUID)
        expect(activityId).not.toBe(null)
        expect(state.current!.uuid).toBe(sendRequestUUID)
        expect(approveUUID).not.toBe(null)
        expect(rejectUUID).not.toBe(null)
        expect(cancelUUID).not.toBe(null)


// 查询 request 数据
        const requestMatch = MatchExpression.createFromAtom({
            key: 'from.name',
            value: ['=', userA.name]
        }).and({
            key:'to.name',
            value: ['=', userB.name]
        })

        const requests1 = await controller.system.storage.find('Request', requestMatch, undefined, ['handled', 'activityId', ['from',{attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])
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
        const res2 = await controller.callActivityInteraction(makeFriendActivityUUID,  sendRequestUUID, activityId,{user: userA, payload})
        expect(res2.error).toBeUndefined()

        const requests2 = await controller.system.storage.find('Request', requestMatch, undefined, ['handled', 'activityId', ['from',{attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])
        expect(requests2.length).toBe(1)
        expect(!!requests2[0].handled).toBeFalse()
        expect(requests2[0].activityId).toBe(activityId)
        // 4. 交互顺序错误 a sendFriendRequest
        // const res3 = createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA})
        // expect(res3.error).toBeDefined()

        // 5. 角色错误 a approve
        // const res4 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userA})
        // expect(res4.error).toBeDefined()


        // 6. 正确 b approve
        const res5 = await controller.callActivityInteraction(makeFriendActivityUUID, approveUUID, activityId, {user: userB})
        expect(res5.error).toBeUndefined()

        const requests3 = await controller.system.storage.find('Request', requestMatch, undefined, ['handled', 'activityId', ['from',{attributeQuery:["name"]}], ['to', {attributeQuery:["name"]}], ['message', {attributeQuery:["content"]}]])
        expect(requests3.length).toBe(1)
        expect(!!requests3[0].handled).toBeTrue()
        expect(requests3[0].activityId).toBe(activityId)

        // 7. 错误 b reject
        // const res6 = createFriendRelationActivityCall.callInteraction(activityId, rejectUUID, {user: userB})
        // expect(res6.error).toBeDefined()

        // 8. 错误 a cancel
        // const res7 = createFriendRelationActivityCall.callInteraction(activityId, cancelUUID, {user: userA})
        // expect(res7.error).toBeDefined()
        // 8. 获取 activity 状态是否 complete
        const currentState = createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()

        const relationName = controller.system.storage.getRelationName('User', 'friends')
        const friendRelations = await controller.system.storage.findRelationByName(relationName, undefined, undefined, [['source', {attributeQuery: ['name', 'age']}], ['target', {attributeQuery: ['name', 'age']}]])

        expect(friendRelations.length).toBe(1)
        expect(friendRelations[0].source.name).toBe('A')
        expect(friendRelations[0].source.id).toBe(userA.id)
        expect(friendRelations[0].target.name).toBe('B')
        expect(friendRelations[0].target.id).toBe(userB.id)


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
    })

})
