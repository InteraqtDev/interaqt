import { beforeEach, describe, expect, test } from "vitest";
import {
    KlassByName, Controller, EntityIdRef, RecordMutationEvent,
    ActivityCall, ActivityGroupNode,
    MonoSystem,
    KlassInstance,
    Relation
} from '@';
import { createData } from './data/activity/index.js';

describe("activity state", () => {
    let createFriendRelationActivityCall: ActivityCall
    let system: MonoSystem

    let sendRequestUUID:string
    let approveUUID:string
    let rejectUUID:string
    let cancelUUID:string
    let activityUUID:string

    let userA!: EntityIdRef
    let userB!: EntityIdRef

    let relationCreateEvent: RecordMutationEvent|undefined
    let relationDeleteEvent: RecordMutationEvent|undefined
    let controller!: Controller
    let friendRelation!: KlassInstance<typeof Relation>

    beforeEach(async () => {
        const { entities, relations, interactions, dicts, activities }  = createData()
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */

        system = new MonoSystem()
        system.conceptClass = KlassByName

        friendRelation = relations.find(r => (r as any).name === 'User_friends_friends_User')!



        controller = new Controller(
            system,
            entities,
            relations,
            activities,
            interactions,
            dicts,
            []
        )
        await controller.setup(true)

        // CAUTION 这里 controller 没什么用，只是作为 globals 注入的点。interaction  的各种 check 里面需要 controller 的 globals。
        const mainActivity = activities.find(a => a.name === 'createFriendRelation')!
        activityUUID = mainActivity.uuid
        createFriendRelationActivityCall = new ActivityCall(mainActivity, controller)

        sendRequestUUID = createFriendRelationActivityCall.graph.head.uuid
        approveUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![0].head.uuid
        rejectUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![1].head.uuid
        cancelUUID = (createFriendRelationActivityCall.graph.tail as ActivityGroupNode).childSeqs![2].head.uuid

        userA = await controller.system.storage.create('User', { id: "a", roles: ['user']})
        userB = await controller.system.storage.create('User', { id: "b", roles: ['user']})
    })

    test("call friend request activity with approve response", async () => {
        // 1. 创建 activity
        // const { activityId, state } = await  createFriendRelationActivityCall.create()
        // expect(activityId).not.toBe(null)
        // expect(state.current!.uuid).toBe(sendRequestUUID)
        let activityId
        expect(approveUUID).not.toBe(null)
        expect(rejectUUID).not.toBe(null)
        expect(cancelUUID).not.toBe(null)

        // 2. 交互顺序错误 approve
        const res1 = await controller.callActivityInteraction(activityUUID, approveUUID, activityId, {user: userA})
        expect(res1.error).toBeDefined()

        // 3. sendFriendRequest payload 错误
        // FIXME 由于现在 user 是 globalRole，并没有验证传入的东西是不是 user
        // const res11 = await createFriendRelationActivityCall.callInteraction(activityId, sendRequestUUID, {user: userA, payload: {to: { wrongThing:true }}})
        // expect(res11.error).toBeDefined()

        // 3. a 发起 sendFriendRequest
        const res2 = await controller.callActivityInteraction(activityUUID, sendRequestUUID, activityId, {user: userA, payload: {to: userB}})
        expect(res2.error).toBeUndefined()
        activityId = res2.context!.activityId


        // 4. 交互顺序错误 a sendFriendRequest
        const res3 =await  controller.callActivityInteraction(activityUUID, sendRequestUUID, activityId,{user: userA})
        expect(res3.error).toBeDefined()

        // 5. 角色错误 a approve
        const res4 = await controller.callActivityInteraction(activityUUID,  approveUUID, activityId,{user: userA})
        expect(res4.error).toBeDefined()
        // 6. 正确 b approve
        const res5 = await controller.callActivityInteraction(activityUUID, approveUUID, activityId,{user: userB})
        // 查询关系是否正确建立
        const relations = await controller.system.storage.findRelationByName(friendRelation.name, undefined, undefined, ['*', ['source', {attributeQuery: ['*']}], ['target', {attributeQuery: ['*']}]])
        expect(relations.length).toBe(1)
        expect(relations[0].source.id).toBe(userA.id)
        expect(relations[0].target.id).toBe(userB.id)

        expect(res5.error).toBeUndefined()

        // 7. 错误 b reject
        const res6 = await controller.callActivityInteraction(activityUUID, rejectUUID, activityId,{user: userB})
        expect(res6.error).toBeDefined()

        // 8. 错误 a cancel
        const res7 = await controller.callActivityInteraction(activityUUID,cancelUUID, activityId, {user: userA})
        expect(res7.error).toBeDefined()
        // 8. 获取 activity 状态是否 complete
        const currentState = await createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()
    })



    test("call friend request activity with cancel response", async () => {
        // 1. 创建 activity
        const { activityId} = await createFriendRelationActivityCall.create()

        // 3. a 发起 sendFriendRequest
        const res2 = await controller.callActivityInteraction(activityUUID,sendRequestUUID, activityId, {user: userA, payload: {to: userB}})
        expect(res2.error).toBeUndefined()

        // 6. 正确 a cancel
        const res5 = await controller.callActivityInteraction(activityUUID,cancelUUID, activityId, {user: userA})
        expect(res5.error).toBeUndefined()

        // 7. 错误 b reject
        const res6 = await controller.callActivityInteraction(activityUUID, rejectUUID, activityId,{user: userB})
        expect(res6.error).toBeDefined()

        // 8. 获取 activity 状态是否 complete
        const currentState = await createFriendRelationActivityCall.getState(activityId)
        expect(currentState.current).toBeUndefined()
    })

})
