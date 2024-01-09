import {
    Controller,
    DataAPIContext,
    KlassInstance,
    Interaction, createDataAPI, InteractionEventArgs
} from "@interaqt/runtime"


/**
 * 1. full control
 * nothing, use RecordMutationSideEffect directly
 */

/**
 * 2. half control
 */
export function createInteractionPreCheckAPI(interaction: KlassInstance<typeof Interaction, any>, sign?: any) {
    return createDataAPI(async function(this: Controller, context: DataAPIContext, payload: any) {
        const interactionCall = this.interactionCallsByName.get(interaction.name)
        let error:any
        let signedUrl
        try {
            await interactionCall?.checkCondition({user: context.user, payload })
            if (sign) {
                signedUrl = await sign.call(this, context,  payload)
            }
        } catch (e) {
            error = e
        }
        return {
            signedUrl,
            error
        }
    }, { useNamedParams: true })
}

type EventToArgs = (...callbackArgs: any[]) => InteractionEventArgs

export function createWebhookCallbackAPI(interaction: KlassInstance<typeof Interaction, any>, eventToArgs: EventToArgs) {
    return createDataAPI(async function(this: Controller, context: DataAPIContext, callbackEvent: any) {
        // 模拟调用
        const args = eventToArgs(callbackEvent)

        return await this.callInteraction(interaction.uuid, args)
    }, { useNamedParams: true, allowAnonymous: true })
}

/**
 * TODO
 * 3. external + sync
 */