import {createClass, KlassInstanceOf} from "../shared/createClass";
import { Entity, Relation } from "../shared/entity/Entity";
import { InteractionEvent } from '../types/interaction'



export interface Payload {
    [k: string]: any
}

export type QueryArg = {
    [k: string] : any
}

export type EventStack = Map<string, InteractionEvent>

export type SystemCallback =  (...arg: any[]) => any


export type Storage = {
    // kv 存储
    get: (itemName: string, id: string, initialValue?: any) => any
    set: (itemName: string, id: string, value: any) => any,

    // er存储
    setup: (entities: KlassInstanceOf<typeof Entity, false>[], relations: KlassInstanceOf<typeof Relation, false>[]) => any
    findOne: (entityName: string, ...arg: any[]) => Promise<any>,
    find: (entityName: string, ...arg: any[]) => Promise<any[]>,
    create: (entityName: string, data:any) => Promise<any>
}

export interface System {
    getEvent: (query: any) => InteractionEvent[]
    saveEvent: (interactionEvent) => boolean
    conceptClass: Map<string, ReturnType<typeof createClass>>

    storage: Storage
    util: {
        uuid: () => string
    }
}

export type EntityIdRef = {
    'id': string,
    [k:string]: any
}

export type Database = {
    scheme: (sql:string) => Promise<any>
    query: (sql: string) => Promise<any[]>,
    insert: (sql: string) => Promise<EntityIdRef>
}