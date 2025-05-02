export type EventUser = {
    [k: string]: any;
    id: string;
    roles: string[];
};
export type EventPayload = {
    [k: string]: any;
};
/**
 * 与 interaction 无关，但与当前 query 有关的信息。例如数据获取的 viewPort，innerInteraction 的 activity id
 */
export type EventQuery = {
    [k: string]: any;
};
export type InteractionEventArgs = {
    user: EventUser;
    payload?: EventPayload;
    query?: EventQuery;
};
export type InteractionEvent = {
    interactionId: string;
    interactionName: string;
    activityId?: string;
    args: InteractionEventArgs;
};
//# sourceMappingURL=interaction.d.ts.map