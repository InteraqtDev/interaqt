import {describe, test, expect, beforeEach} from "bun:test";

import { MemorySystem } from "../MemorySystem";
import {createInstances, getInstance, KlassByName, KlassInstanceOf, removeAllInstance} from "../../shared/createClass";

import { Activity } from "../../shared/activity/Activity";
import {ActivityCall, ActivityGroupNode} from "../AcitivityCall";

describe("activity state", () => {
    let createFriendRelationActivityCall: ActivityCall
    let system: MemorySystem

    let sendRequestUUID:string
    let approveUUID:string
    let rejectUUID:string
    let cancelUUID:string

    const userA = { id: "1", roles: ['user']}
    const userB = { id: "2", roles: ['user']}
    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/simpleActivity'))
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
        const mainActivity = (getInstance(Activity) as KlassInstanceOf<typeof Activity, false>[]).find(a => a.name === 'createFriendRelation')!
        createFriendRelationActivityCall = new ActivityCall(mainActivity, system)

        sendRequestUUID = createFriendRelationActivityCall.graph.head.uuid
        approveUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![0].head.uuid
        rejectUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![1].head.uuid
        cancelUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![2].head.uuid
    })

    test("call friend request activity with approve response", () => {
        // 1. 创建 activity
        const { activityId, state } =  createFriendRelationActivityCall.create()
        expect(activityId).not.toBe(null)
        expect(state.current!.uuid).toBe(sendRequestUUID)
        expect(approveUUID).not.toBe(null)
        expect(rejectUUID).not.toBe(null)
        expect(cancelUUID).not.toBe(null)

        // 2. 交互顺序错误 approve
        const res1 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userA})

        expect(res1.error).toBeDefined()

        // 3. a 发起 sendFriendRequest
        const res2 = createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA, payload: {to: userB}})
        expect(res2.error).toBeUndefined()

        // 4. 交互顺序错误 a sendFriendRequest
        const res3 = createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA})
        expect(res3.error).toBeDefined()

        // 5. 角色错误 a approve
        const res4 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userA})
        expect(res4.error).toBeDefined()


        // 6. 正确 b approve
        const res5 = createFriendRelationActivityCall.callInteraction(activityId, approveUUID, {user: userB})
        expect(res5.error).toBeUndefined()

        // 7. 错误 b reject
        const res6 = createFriendRelationActivityCall.callInteraction(activityId, rejectUUID, {user: userB})
        expect(res6.error).toBeDefined()

        // 8. 错误 a cancel
        const res7 = createFriendRelationActivityCall.callInteraction(activityId, cancelUUID, {user: userA})
        expect(res7.error).toBeDefined()
        // 8. 获取 activity 状态是否 complete
        const currentState = createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()
    })

    test("call friend request activity with cancel response", () => {
        // 1. 创建 activity
        const { activityId} =  createFriendRelationActivityCall.create()

        // 3. a 发起 sendFriendRequest
        const res2 = createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA, payload: {to: userB}})
        expect(res2.error).toBeUndefined()

        // 6. 正确 a cancel
        const res5 = createFriendRelationActivityCall.callInteraction(activityId, cancelUUID, {user: userA})
        expect(res5.error).toBeUndefined()

        // 7. 错误 b reject
        const res6 = createFriendRelationActivityCall.callInteraction(activityId, rejectUUID, {user: userB})
        expect(res6.error).toBeDefined()

        // 8. 获取 activity 状态是否 complete
        const currentState = createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()
    })

})