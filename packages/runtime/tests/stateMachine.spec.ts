import { describe, expect, test, beforeEach } from "vitest";
import { KlassInstance } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { MonoSystem } from "../MonoSystem.js";
import { Interaction } from "@interaqt/shared";
import { createData as createPropertyStateMachineData } from "./data/propertyStateMachine.js";
import { createData as createGlobalStateMachineData } from "./data/globalStateMachine.js";
import { createData as createRelationStateMachineData } from "./data/relationStateMachine.js";
describe('StateMachineRunner', () => {

    test('property state machine', async () => {
        const {entities, interactions} = createPropertyStateMachineData()
        const draftInteraction = interactions.draftInteraction
        const finalizeInteraction = interactions.finalizeInteraction
        const publishInteraction = interactions.publishInteraction
        const withdrawInteraction = interactions.withdrawInteraction
        
        const system = new MonoSystem();
        const controller = new Controller(system, entities, [], [], Object.values(interactions), [], []);
        await controller.setup(true);
        const user1 = await controller.system.storage.create('User', {
            name: 'user1',
        })
        // 1. 创建多个 post。查看 status default value
        await controller.system.storage.create('Post', {
            title: 'post1',
        })
        await controller.system.storage.create('Post', {
            title: 'post2',
        })

        const post1 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post1[0].status).toBe('normal')
        expect(post1[1].status).toBe('normal')
        // 2. 针对一个 post 执行 interaction。查看 status 变化
        await controller.callInteraction(draftInteraction.uuid, {
            user: user1,
            payload: {
                content: {
                    id: post1[0].id,
                }
            }
        })

        const post2 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post2[0].status).toBe('draft')
        expect(post2[1].status).toBe('normal')

        // draft 不能直接 publish
        await controller.callInteraction(publishInteraction.uuid, {
            user: user1,
            payload: {
                content: {
                    id: post2[0].id,
                }
            }
        })
        const post3 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post3[0].status).toBe('draft')
        expect(post3[1].status).toBe('normal')

        // draft 可以 finalize
        await controller.callInteraction(finalizeInteraction.uuid, {
            user: user1,
            payload: {
                content: {
                    id: post2[0].id,
                }
            }
        })
        const post4 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post4[0].status).toBe('normal')
        expect(post4[1].status).toBe('normal')
        
        // normal 可以 publish
        await controller.callInteraction(publishInteraction.uuid, {
            user: user1,
            payload: {
                content: {
                    id: post4[0].id,
                }
            }
        })
        const post5 = await controller.system.storage.find('Post', undefined, undefined, ['*'])
        expect(post5[0].status).toBe('published')
        expect(post5[1].status).toBe('normal')
        
    });

    test('global state machine', async () => {
        const {entities, interactions, dicts} = createGlobalStateMachineData()
        const enableInteraction = interactions.enableInteraction
        const disableInteraction = interactions.disableInteraction

        const system = new MonoSystem();
        const controller = new Controller(system, entities, [], [], Object.values(interactions), dicts, []);
        await controller.setup(true);

        const user1 = await controller.system.storage.create('User', {
            name: 'user1',
        })
        
        const globalState = await controller.system.storage.get('state', 'globalState')
        expect(globalState).toBe('enabled')

        await controller.callInteraction(disableInteraction.uuid, {
            user: user1,
        })
        const globalState2 = await controller.system.storage.get('state', 'globalState')
        expect(globalState2).toBe('disabled')

        await controller.callInteraction(enableInteraction.uuid, {
            user: user1,
        })
        const globalState3 = await controller.system.storage.get('state', 'globalState')
        expect(globalState3).toBe('enabled')
    })


    test('relation state machine', async () => {
        const {entities, relations, interactions} = createRelationStateMachineData()
        const sendInteraction = interactions.sendInteraction
        const transferReviewersInteraction = interactions.transferReviewersInteraction
        
        const system = new MonoSystem();
        const controller = new Controller(system, entities, relations, [], Object.values(interactions), [], []);
        await controller.setup(true);

        const user1 = await controller.system.storage.create('User', {
            name: 'user1',
        })
        const user2 = await controller.system.storage.create('User', {
            name: 'user2',
        })
        const user3 = await controller.system.storage.create('User', {
            name: 'user3',
        })

        const {error} =await controller.callInteraction(sendInteraction.uuid, {
            user: user1,
            payload: {
                to: user2,
                request: {
                    title: 'request1',
                }
            }
        })

        const request = await controller.system.storage.find('Request', undefined, undefined, ['title', ['to', {attributeQuery:['*']}]])
        expect(request[0].title).toBe('request1')
        expect(request[0].to.id).toBe(user2.id)

        await controller.callInteraction(transferReviewersInteraction.uuid, {
            user: user1,
            payload: {
                reviewer: user3,
                request: {
                    id: request[0].id,
                }
            }
        })

        const request2 = await controller.system.storage.find('Request', undefined, undefined, ['*', ['to', {attributeQuery:['*']}]])
        expect(request2[0].title).toBe('request1')
        expect(request2[0].to.id).toBe(user3.id)
        
        
    })
});     