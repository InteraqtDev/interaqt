import {createClass} from "../shared/createClass";
import { interactionEvent } from '../types/interaction'





export interface Payload {
    [k: string]: any
}

export type QueryArg = {
    [k: string] : any
}

export type EventStack = Map<string, interactionEvent>

export interface System {
    saveEvent: (interactionEvent) => boolean
    conceptClass: Map<string, ReturnType<typeof createClass>>
    util: {
        uuid: () => string
    }
}