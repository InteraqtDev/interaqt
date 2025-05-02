import { KlassInstance, Interaction, InteractionEventArgs } from "@interaqt/runtime";
/**
 * 1. full control
 * nothing, use RecordMutationSideEffect directly
 */
/**
 * 2. half control
 */
export declare function createInteractionPreCheckAPI(interaction: KlassInstance<typeof Interaction, any>, sign?: any): import("@interaqt/runtime").DataAPI;
type EventToArgs = (...callbackArgs: any[]) => InteractionEventArgs;
export declare function createWebhookCallbackAPI(interaction: KlassInstance<typeof Interaction, any>, eventToArgs: EventToArgs): import("@interaqt/runtime").DataAPI;
export {};
/**
 * TODO
 * 3. external + sync
 */ 
//# sourceMappingURL=server.d.ts.map