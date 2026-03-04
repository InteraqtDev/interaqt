import { Entity, Property } from "@core";
import { GlobalBoundState } from "./computations/Computation.js";
import { RecordBoundState } from "./computations/Computation.js";
import { EntityInstance, RelationInstance } from "@core";
import { DataContext } from "./computations/Computation.js";
export type SystemCallback = (...arg: unknown[]) => unknown
export type RecordMutationCallback = (mutationEvents:RecordMutationEvent[]) => Promise<{ events?: RecordMutationEvent[] } |undefined|void>
export const SYSTEM_RECORD = '_System_'
export const DICTIONARY_RECORD = '_Dictionary_'
export type Storage = {
    map: unknown
    beginTransaction: (transactionName?:string) => Promise<void>
    commitTransaction: (transactionName?:string) => Promise<void>
    rollbackTransaction: (transactionName?:string) => Promise<void>

    dict: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<void>
    }

    get: (itemName: string, id: string, initialValue?: unknown) => Promise<unknown>
    set: (itemName: string, id: string, value: unknown, events?: RecordMutationEvent[]) => Promise<unknown>,
    setup: (entities: EntityInstance[], relations: RelationInstance[], createTables?: boolean) => unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spread params vary per implementation
    findOne: (entityName: string, ...arg: any[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (entityName: string, ...arg: any[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    find: (entityName: string, ...arg: any[]) => Promise<EntityIdRef[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (entityName: string, data: any,  events?: RecordMutationEvent[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: (entityName: string, data: any,  events?: RecordMutationEvent[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findOneRelationByName: (relationName: string, ...arg: any[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findRelationByName: (relationName: string, ...arg: any[]) => Promise<EntityIdRef[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateRelationByName: (relationName: string, matchExpressionData: any, rawData: any, events?: RecordMutationEvent[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeRelationByName: (relationName: string, matchExpressionData: any, events?: RecordMutationEvent[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addRelationByNameById: (relationName: string, sourceEntityId: string, targetEntityId: string, rawData?: any, events?: RecordMutationEvent[]) => Promise<EntityIdRef>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRelationName: (...arg: any[]) => string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getEntityName: (...arg: any[]) => string
    listen: (callback: RecordMutationCallback) => void
    destroy: () => Promise<void>
}

export type RecordMutationEvent = {
    recordName:  string,
    type: 'create' | 'update' | 'delete',
    keys?: string[],
    record?: EntityIdRef,
    oldRecord?: EntityIdRef,
}

export type SystemLogger = {
    error: (arg: SystemLogType) => void,
    info: (arg: SystemLogType) => void,
    debug: (arg: SystemLogType) => void,
    child:(fixed: object) => SystemLogger,
}

export type SystemLogType = {
    label: string,
    message: string,
    [k: string]: unknown
}

export type ComputationState = {dataContext: DataContext, state: {[key: string]: RecordBoundState<unknown>|GlobalBoundState<unknown>}}

export interface System {
    conceptClass: Map<string, unknown>
    storage: Storage
    logger: SystemLogger
    setup: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[], install?: boolean) => Promise<void>
}

export type EntityIdRef = {
    id: string,
    [ROW_ID_ATTR]? : string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- records have dynamic fields accessed throughout
    [k:string]: any
}

export const ID_ATTR = 'id'
export const ROW_ID_ATTR = '_rowId'

export type DatabaseLogger = {
    info: (arg: {type: string, name: string, sql: string, params?: unknown[]}) => void,
    error: (arg: {type: string, name: string, sql: string, params?: unknown[], error: string}) => void,
    child:(fixed: object) => DatabaseLogger,
}

// FIXME 这里应该继承自 storage？
export type Database = {
    open: (forceDrop?:boolean) => Promise<void>
    logger: DatabaseLogger
    scheme: (sql:string, name?:string) => Promise<unknown>
    query: <T>(sql: string, values: unknown[],name?:string) => Promise<T[]>
    delete: <T>(sql: string, where: unknown[], name?:string) => Promise<T[]>
    insert: (sql: string, values: unknown[], name?:string) => Promise<EntityIdRef>
    update: (sql: string, values: unknown[], idField?: string, name?:string) => Promise<EntityIdRef[]>
    getAutoId: (recordName: string) => Promise<string>,
    parseMatchExpression?: (key: string, value: [string, any], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue:(v: string) => string, genPlaceholder: (name?: string) => string) => { fieldValue: string, fieldParams: unknown[] } | undefined
    getPlaceholder?: () => (name?:string) => string,
    mapToDBFieldType: (type: string, collection?: boolean) => string
    close: () => Promise<void>
    beginTransaction?: (name?:string) => Promise<void>
    commitTransaction?: (name?:string) => Promise<void>
    rollbackTransaction?: (name?:string) => Promise<void>
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

export const DictionaryEntity = Entity.create({
    name: DICTIONARY_RECORD,
    properties: [
        Property.create({
            name: 'key',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'value',
            type: 'json',
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

