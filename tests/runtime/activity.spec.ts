import { beforeEach, describe, expect, test } from "vitest";
import {
    KlassByName, Controller, EntityIdRef,
    ActivityCall, ActivityManager, MonoSystem,
    RelationInstance, EventSourceInstance
} from 'interaqt';
import { SQLiteDB } from '@drivers';
import { createData } from './data/activity/index.js';

describe("activity state", () => {
    let createFriendRelationActivityCall: ActivityCall
    let system: MonoSystem

    let activityName:string = 'createFriendRelation'

    let userA!: EntityIdRef
    let userB!: EntityIdRef

    let controller!: Controller
    let friendRelation!: RelationInstance

    let sendRequestES!: EventSourceInstance
    let approveES!: EventSourceInstance
    let rejectES!: EventSourceInstance
    let cancelES!: EventSourceInstance

    beforeEach(async () => {
        const { entities, relations, interactions, dicts, activities }  = createData()

        system = new MonoSystem(new SQLiteDB())
        system.conceptClass = KlassByName

        friendRelation = relations.find(r => r.name === 'User_friends_friends_User')!

        const activityManager = new ActivityManager(activities)
        const activityOutput = activityManager.getOutput()

        controller = new Controller({
            system,
            entities: [...entities, ...activityOutput.entities],
            relations: [...relations, ...activityOutput.relations],
            eventSources: [...interactions, ...activityOutput.eventSources],
            dict: dicts
        })
        await controller.setup(true)

        createFriendRelationActivityCall = activityManager.getActivityCallByName('createFriendRelation')!

        sendRequestES = controller.findEventSourceByName(`${activityName}:sendRequest`)!
        approveES = controller.findEventSourceByName(`${activityName}:approve`)!
        rejectES = controller.findEventSourceByName(`${activityName}:reject`)!
        cancelES = controller.findEventSourceByName(`${activityName}:cancel`)!

        userA = await controller.system.storage.create('User', { roles: ['user']})
        userB = await controller.system.storage.create('User', { roles: ['user']})
    })

    test("call friend request activity with approve response via dispatch", async () => {
        let activityId: string | undefined

        // 1. approve without activityId - should fail (non-head interaction needs activityId)
        const res1 = await controller.dispatch(approveES, {user: userA})
        expect(res1.error).toBeDefined()

        // 2. a sends friend request (head interaction, no activityId needed)
        const res2 = await controller.dispatch(sendRequestES, {user: userA, payload: {to: userB}})
        expect(res2.error).toBeUndefined()
        activityId = res2.context!.activityId as string

        // 3. sendRequest again with same activityId - should fail (interaction not available)
        const res3 = await controller.dispatch(sendRequestES, {user: userA, activityId})
        expect(res3.error).toBeDefined()

        // 4. wrong user: a tries to approve - should fail (userRef check)
        const res4 = await controller.dispatch(approveES, {user: userA, activityId})
        expect(res4.error).toBeDefined()

        // 5. correct user: b approves
        const res5 = await controller.dispatch(approveES, {user: userB, activityId})
        expect(res5.error).toBeUndefined()

        // verify friend relation was created
        const relations = await controller.system.storage.findRelationByName(friendRelation.name!, undefined, undefined, ['*', ['source', {attributeQuery: ['*']}], ['target', {attributeQuery: ['*']}]])
        expect(relations.length).toBe(1)
        expect(relations[0].source.id).toBe(userA.id)
        expect(relations[0].target.id).toBe(userB.id)

        // 6. reject after approve - should fail (activity completed)
        const res6 = await controller.dispatch(rejectES, {user: userB, activityId})
        expect(res6.error).toBeDefined()

        // 7. cancel after approve - should fail (activity completed)
        const res7 = await controller.dispatch(cancelES, {user: userA, activityId})
        expect(res7.error).toBeDefined()

        // 8. verify activity state is complete
        const currentState = await createFriendRelationActivityCall.getState(controller, activityId!)
        expect(currentState.current).toBeUndefined()
    })



    test("call friend request activity with cancel response via dispatch", async () => {
        // 1. a sends friend request (head interaction creates activity)
        const res2 = await controller.dispatch(sendRequestES, {user: userA, payload: {to: userB}})
        expect(res2.error).toBeUndefined()
        const activityId = res2.context!.activityId as string

        // 2. a cancels
        const res5 = await controller.dispatch(cancelES, {user: userA, activityId})
        expect(res5.error).toBeUndefined()

        // 3. b tries to reject after cancel - should fail
        const res6 = await controller.dispatch(rejectES, {user: userB, activityId})
        expect(res6.error).toBeDefined()

        // 4. verify activity state is complete
        const currentState = await createFriendRelationActivityCall.getState(controller, activityId)
        expect(currentState.current).toBeUndefined()
    })

})
