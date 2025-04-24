import { describe, expect, test, beforeEach, vi } from "vitest";
import { KlassInstance } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { MonoSystem } from "../MonoSystem.js";
import { StateNode, StateTransfer, StateMachine, Interaction, Action, Payload, PayloadItem } from "@interaqt/shared";
import { createData } from "./data/stateMachine.js";

describe('StateMachineRunner', () => {
    let controller: Controller;
    let draftState: KlassInstance<typeof StateNode>;
    let normalState: KlassInstance<typeof StateNode>;
    let publishedState: KlassInstance<typeof StateNode>;
    let finalizeInteraction: KlassInstance<typeof Interaction>;
    let draftInteraction: KlassInstance<typeof Interaction>;
    let publishInteraction: KlassInstance<typeof Interaction>;
    let withdrawInteraction: KlassInstance<typeof Interaction>;
    let stateMachine: KlassInstance<typeof StateMachine>;

    beforeEach(async () => {
        const {entities, interactions} = createData()
        draftInteraction = interactions.draftInteraction
        finalizeInteraction = interactions.finalizeInteraction
        publishInteraction = interactions.publishInteraction
        withdrawInteraction = interactions.withdrawInteraction
        const system = new MonoSystem();
        controller = new Controller(system, entities, [], [], Object.values(interactions), [], []);
        await controller.setup(true);
    });

    test('property state machine', async () => {
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
}); 