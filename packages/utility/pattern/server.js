import { createDataAPI } from "@interaqt/runtime";
/**
 * 1. full control
 * nothing, use RecordMutationSideEffect directly
 */
/**
 * 2. half control
 */
export function createInteractionPreCheckAPI(interaction, sign) {
    return createDataAPI(async function (context, payload) {
        const interactionCall = this.interactionCallsByName.get(interaction.name);
        let error;
        let signedUrl;
        try {
            await (interactionCall === null || interactionCall === void 0 ? void 0 : interactionCall.checkCondition({ user: context.user, payload }));
            if (sign) {
                signedUrl = await sign.call(this, context, payload);
            }
        }
        catch (e) {
            error = e;
        }
        return {
            signedUrl,
            error
        };
    }, { useNamedParams: true });
}
export function createWebhookCallbackAPI(interaction, eventToArgs) {
    return createDataAPI(async function (context, callbackEvent) {
        // 模拟调用
        const args = eventToArgs(callbackEvent);
        return await this.callInteraction(interaction.uuid, args);
    }, { useNamedParams: true, allowAnonymous: true });
}
/**
 * TODO
 * 3. external + sync
 */ 
//# sourceMappingURL=server.js.map