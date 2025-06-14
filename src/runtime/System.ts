import {createClass, Entity, KlassInstance, Property, Relation} from "@shared";
import { GlobalBoundState } from "./computedDataHandles/Computation.js";
import { RecordBoundState } from "./computedDataHandles/Computation.js";
import { DataContext } from "./computedDataHandles/ComputedDataHandle.js";
import { InteractionEvent } from "./InteractionCall.js";
export type SystemCallback =  (...arg: any[]) => any
export type RecordMutationCallback = (mutationEvents:RecordMutationEvent[]) => Promise<{ events?: RecordMutationEvent[] } |undefined|void>

export const SYSTEM_RECORD = '_System_'
export const INTERACTION_RECORD = '_Interaction_'
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
    set: (itemName: string, id: string, value: any, events?: RecordMutationEvent[]) => Promise<any>,
    // er存储
    setup: (entities: KlassInstance<typeof Entity>[], relations: KlassInstance<typeof Relation>[], createTables?: boolean) => any
    findOne: (entityName: string, ...arg: any[]) => Promise<any>,
    update: (entityName: string, ...arg: any[]) => Promise<any>,
    find: (entityName: string, ...arg: any[]) => Promise<any[]>,
    create: (entityName: string, data:any,  events?: RecordMutationEvent[]) => Promise<any>
    delete: (entityName: string, data:any,  events?: RecordMutationEvent[]) => Promise<any>
    findOneRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    findRelationByName: (relationName: string, ...arg: any[]) => Promise<any>
    updateRelationByName: (relationName: string, matchExpressionData: any, rawData: any, events?: RecordMutationEvent[]) => Promise<any>
    removeRelationByName: (relationName: string, matchExpressionData: any, events?: RecordMutationEvent[]) => Promise<any>
    addRelationByNameById: (relationName: string, sourceEntityId: string, targetEntityId: string, rawData: any, events?: RecordMutationEvent[]) => Promise<any>
    getRelationName: (...arg: any[]) => string
    getEntityName: (...arg: any[]) => string
    listen: (callback: RecordMutationCallback) => any
    destroy: () => Promise<any>
}

export type RecordMutationEvent = {
    recordName:  string,
    type: 'create' | 'update' | 'delete',
    keys?: string[],
    record?:EntityIdRef & {
        [key: string]: any
    },
    oldRecord?: EntityIdRef & {
        [key: string]: any
    },
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

export type ComputationState = {dataContext: DataContext, state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}}

export interface System {
    getEvent: (query: any) => Promise<InteractionEvent[]>
    saveEvent: (interactionEvent: InteractionEvent, mutationEvents: RecordMutationEvent[]) => Promise<any>
    createActivity: (activity: any) => Promise<any>
    updateActivity: (match: any, activity: any) => Promise<any>
    getActivity:(query?: any) => Promise<any[]>
    conceptClass: Map<string, ReturnType<typeof createClass>>
    storage: Storage
    logger: SystemLogger
    setup: (entities: KlassInstance<typeof Entity>[], relations: KlassInstance<typeof Relation>[], states: ComputationState[], install?: boolean) => Promise<any>
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
    close: () => Promise<any>
} // activity 数据
// state 等系统配置数据的实体化
// FIXME 应该独立到外部
export const SystemEntity = Entity.create({
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

type EntityType = {
    name: string,
    properties: {
        name: string,
        type: string,
        collection: boolean,
        required?: boolean
    }[]
}

type InferType<T> = T extends { type: 'string' } ? string :
    T extends { type: 'number' } ? number :
        // 添加更多类型映射
        unknown;

export type EntityInstanceType<T extends EntityType> = {
    [P in T['properties'][number] as P['name']]: P['collection'] extends true ? Array<InferType<P>> : InferType<P>;
}

// event 的实体化
export const InteractionEventEntity = Entity.create({
    name: INTERACTION_RECORD,
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
            name: 'payload',
            type: 'object',
            collection: false,
        }),
        Property.create({
            name: 'user',
            type: 'object',
            collection: false,
        }),
        Property.create({
            name: 'query',
            type: 'object',
            collection: false,
        }),
    ]
})


export const ActivityStateEntity = Entity.create({
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
            type: 'object',
            collection: false,
        }),
        Property.create({
            name: 'refs',
            type: 'object',
            collection: false,
        })
    ]
})

export const ActivityInteractionRelation = Relation.create({
    name: 'activityInteraction',
    source: ActivityStateEntity,
    sourceProperty: 'interaction',
    target: InteractionEventEntity,
    targetProperty: 'activity',
    type: '1:n',
})

export type InteractionEventRecord = InteractionEvent & EntityIdRef
