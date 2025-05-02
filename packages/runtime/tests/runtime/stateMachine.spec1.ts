import {beforeEach, describe, expect, test} from "vitest";
import {Controller} from "../Controller.js";
import {MonoSystem} from "../MonoSystem.js";
import {BoolExp} from 'src/runtime/index.js';
import {draftInteraction, publishInteraction, userEntity} from "../data/propertyStateMachine.js";


describe('map interaction', async () => {

    let system: MonoSystem
    let controller: Controller

    const {
        postEntity,
        userEntity,
        draftInteraction,
        finalizeInteraction,
        withdrawInteraction,
        publishInteraction,
    } = (await import('../data/propertyStateMachine.js'))

    beforeEach(async () => {


        system = new MonoSystem()
        controller = new Controller(
            system,
            [postEntity, userEntity],
            [],
            [],
            [draftInteraction, finalizeInteraction, withdrawInteraction, publishInteraction],
            []
        )
        await controller.setup(true)

    })

    test('simple stateMachine', async () => {
        const user = await system.storage.create('User', {name: 'A'})
        const post = await system.storage.create('Post', { })
        const idMatch = BoolExp.atom({
            key: 'id',
            value: ['=', post.id]
        })

        const p1 = await system.storage.findOne('Post', idMatch, undefined, ['*'])
        expect(p1.status).toBe('normal')
        await controller.callInteraction(draftInteraction.uuid, {user, payload: {content: post}})
        const p2 = await system.storage.findOne('Post', idMatch, undefined, ['*'])
        expect(p2.status).toBe('draft')
        await controller.callInteraction(finalizeInteraction.uuid, {user, payload: {content: post}})
        const p3 = await system.storage.findOne('Post', idMatch, undefined, ['*'])
        expect(p3.status).toBe('normal')
        await controller.callInteraction(publishInteraction.uuid, {user, payload: {content: post}})
        const p4 = await system.storage.findOne('Post', idMatch, undefined, ['*'])
        expect(p4.status).toBe('published')
        await controller.callInteraction(withdrawInteraction.uuid, {user, payload: {content: post}})
        const p5 = await system.storage.findOne('Post', idMatch, undefined, ['*'])
        expect(p5.status).toBe('normal')


        // 错误的状态转换
        await controller.callInteraction(draftInteraction.uuid, {user, payload: {content: post}})
        await controller.callInteraction(publishInteraction.uuid, {user, payload: {content: post}})
        const p6 = await system.storage.findOne('Post', idMatch, undefined, ['*'])
        expect(p6.status).toBe('draft')
    })
})