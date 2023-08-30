
export type EventUser = {
    [k: string]: any,
    id: string,
    roles: string[]
}

export type Payload = {
    [k: string] : any
}

/**
 * 与 interaction 无关，但与当前 query 有关的信息。例如数据获取的 viewPort，innerInteraction 的 activity id
 */
export type Query = {
    [k: string] : any
}

export type InteractionEventArgs = {
    user: EventUser,
    payload?: Payload,
    query?: Query
}

export type interactionEvent = {
    interactionId: string,
    args: InteractionEventArgs
}