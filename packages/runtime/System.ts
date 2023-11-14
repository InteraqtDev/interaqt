import {createClass, KlassInstance} from "@shared/createClass";
import { Entity, Relation } from "@shared/entity/Entity";
// @ts-ignore
import { InteractionEvent } from '../types/interaction'



export interface Payload {
    [k: string]: any
}

export type SystemCallback =  (...arg: any[]) => any


export type RecordChangeListener = (mutationEvents:RecordMutationEvent[]) => any

export const SYSTEM_RECORD = '_System_'

export type Storage = {
    // kv 存储
    get: (itemName: string, id: string, initialValue?: any) => Promise<any>
    set: (itemName: string, id: string, value: any) => Promise<any>,

    // er存储
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[]) => any
    findOne: (entityName: string, ...arg: any[]) => Promise<any>,
    update: (entityName: string, ...arg: any[]) => Promise<any>,
    find: (entityName: string, ...arg: any[]) => Promise<any[]>,
    create: (entityName: string, data:any) => Promise<any>
    delete: (entityName: string, data:any) => Promise<any>
    findOneRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    findRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    updateRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    removeRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    // addRelation: (relationName: string, ...arg: any[]) => Promise<any>
    addRelationByNameById: (relationName: string, ...arg: any[]) => Promise<any>
    getRelationName: (...arg: any[]) => string
    getRelationNameByDef: (...arg: any[]) => string
    listen: (callback: RecordChangeListener) => any
}

export type RecordMutationEvent = {
    recordName:  string,
    type: 'create' | 'update' | 'delete',
    keys?: string[],
    record?: {
        [key: string]: any
    },
    oldRecord?: {
        [key: string]: any
    }
}

export interface System {
    getEvent: (query: any) => Promise<InteractionEvent[]>
    // FIXME 所有地方改成 async 的
    saveEvent: (interactionEvent: InteractionEvent) => Promise<boolean>
    conceptClass: Map<string, ReturnType<typeof createClass>>

    storage: Storage
    util: {
        uuid: () => string
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
    scheme: (sql:string, name?:string) => Promise<any>
    query: (sql: string, name?:string) => Promise<any[]>
    delete: (sql: string, name?:string) => Promise<any[]>
    insert: (sql: string, name?:string) => Promise<EntityIdRef>
    update: (sql: string, idField?: string, name?:string) => Promise<EntityIdRef[]>
    getAutoId: (recordName: string) => Promise<string>
}