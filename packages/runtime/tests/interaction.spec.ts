import {describe, test, expect, beforeEach} from "@jest/globals";
import {InteractionCall, LoginError} from "../InteractionCall";
import { MemorySystem } from "../MemorySystem";
import {createInstances, getInstance, KlassByName} from "../../shared/createClass";

import { Interaction } from "../../shared/activity/Activity";
import {InteractionEventArgs} from "../../types/interaction";



describe("interaction",  () => {
    let interactionCall: InteractionCall
    let system: MemorySystem

    beforeEach(async () => {
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
        system = new MemorySystem()
        system.conceptClass = KlassByName
        // TODO
        // @ts-ignore
        interactionCall = new InteractionCall(getInstance(Interaction)[0], system)
    })


    test("simple interaction should pass", async () => {
        const event: InteractionEventArgs = {
            user: {
                id: "1",
                roles: ['Admin']
            }
        }
        const response = interactionCall.call(event)

        expect(response.error).toBe(null)
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
        const response = interactionCall.call(event)

        expect(response.error).not.toBe(null)
        expect(response.error instanceof LoginError).toBe(true)
        expect(response.error.type).toBe('role')
    })


    // TODO payload check

});

export {}

