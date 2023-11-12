import {describe, test, expect, beforeEach} from "bun:test";
import {InteractionCall, LoginError} from "../InteractionCall";
import { BunSystem } from "../BunSystem";
import {createInstances, getInstance, KlassByName, KlassInstanceOf, removeAllInstance} from "../../shared/createClass";

import { Interaction } from "../../shared/activity/Activity";
import {InteractionEventArgs} from "../../types/interaction";

describe("interaction",  () => {
    let interactionCall: InteractionCall
    let system: BunSystem

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
        system = new BunSystem()
        system.conceptClass = KlassByName
        interactionCall = new InteractionCall(getInstance(Interaction)[0] as KlassInstanceOf<typeof Interaction, false>, system)
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
        expect(system.eventStack.length).toBe(1)
        expect(system.eventStack[0].args).toBe(event)
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

