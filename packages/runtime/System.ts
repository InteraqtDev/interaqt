import {createClass, KlassInstanceOf} from "../shared/createClass";
import { Entity, Relation } from "../shared/entity/Entity";
// @ts-ignore
import { InteractionEvent } from '../types/interaction'



export interface Payload {
    [k: string]: any
}

export type SystemCallback =  (...arg: any[]) => any


export type Storage = {
    // kv 存储
    get: (itemName: string, id: string, initialValue?: any) => any
    set: (itemName: string, id: string, value: any) => any,

    // er存储
    setup: (entities: KlassInstanceOf<typeof Entity, false>[], relations: KlassInstanceOf<typeof Relation, false>[]) => any
    findOne: (entityName: string, ...arg: any[]) => Promise<any>,
    update: (entityName: string, ...arg: any[]) => Promise<any>,
    find: (entityName: string, ...arg: any[]) => Promise<any[]>,
    create: (entityName: string, data:any) => Promise<any>
    findOneRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    findRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    updateRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    removeRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    // addRelation: (relationName: string, ...arg: any[]) => Promise<any>
    addRelationByNameById: (relationName: string, ...arg: any[]) => Promise<any>
    getRelationName: (...arg: any[]) => string
}

export interface System {
    getEvent: (query: any) => Promise<InteractionEvent[]>
    // FIXME 所有地方改成 async 的
    saveEvent: (interactionEvent: InteractionEvent) => Promise<boolean>
    conceptClass: Map<string, ReturnType<typeof createClass>>

    storage: Storage
    util: {
        uuid: () => string,
        autoIncrementId: () => number
    }
}

export type EntityIdRef = {
    id: string,
    [ROW_ID_ATTR]? : string,
    [k:string]: any
}


export const ID_ATTR = 'id'
export const ROW_ID_ATTR = '_rowId'
export type Database = {
    scheme: (sql:string) => Promise<any>
    query: (sql: string) => Promise<any[]>
    insert: (sql: string) => Promise<EntityIdRef>
    update: (sql: string, idField?: string) => Promise<EntityIdRef[]>
    getAutoId: (recordName: string) => Promise<string>
}