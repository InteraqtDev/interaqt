import {createClass, Entity, KlassInstance, Property, Relation} from "@interaqt/shared";
import {InteractionEvent} from './types/interaction.js'
import {MatchExpressionData} from "@interaqt/storage";


export type SystemCallback =  (...arg: any[]) => any


export type RecordChangeListener = (mutationEvents:RecordMutationEvent[]) => any

export const SYSTEM_RECORD = '_System_'
export const EVENT_RECORD = '_Event_'
export const ACTIVITY_RECORD = '_Activity_'

export type Storage = {
    // 将 entity 映射到表结构的 map
    map: any
    // transaction
    beginTransaction: (transactionName?:string) => Promise<any>
    commitTransaction: (transactionName?:string) => Promise<any>
    rollbackTransaction: (transactionName?:string) => Promise<any>

    // kv 存储
    get: (itemName: string, id: string, initialValue?: any) => Promise<any>
    set: (itemName: string, id: string, value: any) => Promise<any>,
    // er存储
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], createTables?: boolean) => any
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

export type SystemLogger = {
    error: (arg: SystemLogType) => any,
    info: (arg: SystemLogType) => any,
    debug: (arg: SystemLogType) => any,
    child:(fixed: object) => SystemLogger,
}

export type SystemLogType = {
    label: string,
    message: string,
    [k: string]: any
}

export interface System {
    getEvent: (query: any) => Promise<InteractionEvent[]>
    saveEvent: (interactionEvent: InteractionEvent) => Promise<any>
    createActivity: (activity: any) => Promise<any>
    updateActivity: (match: MatchExpressionData, activity: any) => Promise<any>
    getActivity:(query?: MatchExpressionData) => Promise<any[]>
    conceptClass: Map<string, ReturnType<typeof createClass>>
    storage: Storage
    logger: SystemLogger
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], install?: boolean) => Promise<any>
}

export type EntityIdRef = {
    id: string,
    [ROW_ID_ATTR]? : string,
    [k:string]: any
}

export const ID_ATTR = 'id'
export const ROW_ID_ATTR = '_rowId'

export type DatabaseLogger = {
    info: (arg: {type: string, name: string, sql: string, params?: any[]}) => any,
    child:(fixed: object) => DatabaseLogger,
}

// FIXME 这里应该继承自 storage？
export type Database = {
    open: () => Promise<any>
    logger: DatabaseLogger
    scheme: (sql:string, name?:string) => Promise<any>
    query: <T extends any>(sql: string, values: any[],name?:string) => Promise<T[]>
    delete: <T extends any>(sql: string, where: any[], name?:string) => Promise<T[]>
    insert: (sql: string, values: any[], name?:string) => Promise<EntityIdRef>
    update: (sql: string, values: any[], idField?: string, name?:string) => Promise<EntityIdRef[]>
    getAutoId: (recordName: string) => Promise<string>,
    parseMatchExpression?: (key: string, value: [string, any], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue:(v: string) => string, genPlaceholder: (name?: string) => string) => any
    getPlaceholder?: () => (name?:string) => string,
    mapToDBFieldType: (type: string, collection?: boolean) => string

} // activity 数据
// state 等系统配置数据的实体化
// FIXME 应该独立到外部
export const systemEntity = Entity.create({
    name: SYSTEM_RECORD,
    properties: [
        Property.create({
            name: 'concept',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'key',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'value',
            type: 'string',
            collection: false,
        })
    ]
})
// event 的实体化
export const eventEntity = Entity.create({
    name: EVENT_RECORD,
    properties: [
        Property.create({
            name: 'interactionId',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'interactionName',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'activityId',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'args',
            type: 'string',
            collection: false,
        })
    ]
})
export const activityEntity = Entity.create({
    name: ACTIVITY_RECORD,
    properties: [
        Property.create({
            name: 'name',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'uuid',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'state',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'refs',
            type: 'string',
            collection: false,
        })
    ]
})