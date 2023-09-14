import {createClass} from "../shared/createClass";
import { Entity, Relation } from "../shared/entity/Entity";
import { interactionEvent } from '../types/interaction'



export interface Payload {
    [k: string]: any
}

export type QueryArg = {
    [k: string] : any
}

export type EventStack = Map<string, interactionEvent>

export type SystemCallback =  (...arg: any[]) => any


export type Storage = {
    get: (itemName: string, id: string, initialValue?: any) => any
    set: (itemName: string, id: string, value: any) => any,
    setup: (entities: (typeof Entity)[], relations: (typeof Relation)[]) => any
}

export interface System {
    saveEvent: (interactionEvent) => boolean
    conceptClass: Map<string, ReturnType<typeof createClass>>

    storage: Storage
    util: {
        uuid: () => string
    }
}