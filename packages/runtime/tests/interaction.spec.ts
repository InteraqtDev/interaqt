import {describe, test, expect, beforeEach} from "vitest";
import {InteractionCall, LoginError} from "../InteractionCall";
import { MonoSystem } from "../MonoSystem";
import {createInstances, getInstance, KlassByName, KlassInstance, removeAllInstance} from "@shared/createClass";

import { Interaction } from "@shared/activity/Activity";
import {InteractionEventArgs} from "../../types/interaction";

describe("interaction",  () => {
    let interactionCall: InteractionCall
    let system: MonoSystem

    beforeEach(async () => {
        removeAllInstance()
        const { data }  = (await import('./data/simpleInteraction'))
        /**
         * 当前的格式为:
         * New && Other Admin as A
         * sendRequest
         * to: Other Admin isRef
         * message: Message
         */

        // TODO 需要能 destroy instance
        createInstances(data, false)
        system = new MonoSystem()
        await system.setup([], [])
        system.conceptClass = KlassByName
        interactionCall = new InteractionCall(getInstance(Interaction)[0] as KlassInstance<typeof Interaction, false>, system)
    })


    test("simple interaction should pass", async () => {
        const event: InteractionEventArgs = {
            user: {
                id: "1",
                roles: ['Admin']
            }
        }
        const response = await interactionCall.call(event)

        expect(response.error).toBeUndefined()
        const events = (await system.getEvent())
        expect(events.length).toBe(1)
        expect(events[0].args).toMatchObject(event)
    })

    test("simple interaction with wrong role should not pass", async () => {
        const event: InteractionEventArgs = {
            user: {
                id: "1",
                roles: ['User']
            }
        }
        const response = await interactionCall.call(event)

        expect(response.error).toBeDefined()
        expect(response.error instanceof LoginError).toBe(true)
        expect(response.error.type).toBe('check user failed')
    })


    // TODO payload check

});

export {}

