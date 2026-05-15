import { Entity, Property } from "@core";
import { GlobalBoundState } from "./computations/Computation.js";
import { RecordBoundState } from "./computations/Computation.js";
import { EntityInstance, RelationInstance } from "@core";
import { DataContext } from "./computations/Computation.js";
import type { AttributeQueryData, ConstraintSchemaItem, MatchExpressionData, SchemaDialect } from "@storage";
import { TransactionCapability, TransactionIsolation, TransactionOptions } from "./transaction.js";
import type { MigrationManifest, MigrationPhase, MigrationRunState, MigrationSchemaPlan } from "./migration.js";
export type SystemCallback = (...arg: unknown[]) => unknown
export type RecordMutationCallback = (mutationEvents:RecordMutationEvent[]) => Promise<{ events?: RecordMutationEvent[] } |undefined|void>
export const SYSTEM_RECORD = '_System_'
export const DICTIONARY_RECORD = '_Dictionary_'

export type AtomicRecordTarget = {
    recordName: string
    id: string | number
    field: string
}

export type AtomicGlobalTarget = {
    key: string
    valueType?: 'number' | 'boolean' | 'string' | 'json'
    defaultValue?: unknown
}

export type AtomicTarget = AtomicRecordTarget | AtomicGlobalTarget

export type AtomicSequenceScopeValue =
    | string
    | number
    | boolean
    | null
    | { type: 'ref'; entity: string; id: string }

export type AtomicSequenceScopeItem = {
    name: string
    type: 'string' | 'number' | 'boolean' | 'null' | 'ref'
    value: AtomicSequenceScopeValue
}

export type AtomicSequenceScope = AtomicSequenceScopeItem[]

export type AtomicSequenceTarget = {
    sequenceName: string
    scope: AtomicSequenceScope
    initialValue: number
    step: number
}

export type AtomicSequenceCapability = {
    requiresActiveTransaction: true
    transactional: boolean
    crossConnection: boolean
    crossProcess: boolean
    returning: boolean
    equivalentSafeReturning?: boolean
    productionSafe: boolean
}

export type ScopedSequenceDeclarationManifest = {
    computationId: string
    hostRecord: string
    property: string
    sequenceName: string
    scopeSignature?: string
    allocationSignature?: string
}

export type InternalSchemaRequirement =
    | {
        kind: 'scoped-sequence-table'
        declarations: ScopedSequenceDeclarationManifest[]
    }

export type SystemSchemaOptions = {
    install?: boolean
    internalRequirements?: InternalSchemaRequirement[]
}

export type AtomicStorage = {
    get<T>(target: AtomicTarget): Promise<T | null>
    increment(target: AtomicTarget, delta: number): Promise<number>
    replace<T>(target: AtomicTarget, value: T): Promise<{ oldValue: T | null, newValue: T }>
    compareAndSet<T>(target: AtomicTarget, expected: T, next: T, options?: { defaultValue?: T }): Promise<boolean>
    lockGlobal<T>(target: AtomicGlobalTarget): Promise<T | null>
    nextSequenceValue(target: AtomicSequenceTarget): Promise<number>
    seedSequenceValue(target: AtomicSequenceTarget & { value: number; mode?: 'max' | 'replace' }): Promise<void>
    readSequenceValue(target: Pick<AtomicSequenceTarget, 'sequenceName' | 'scope'>): Promise<number | undefined>
    updateGlobalFields(
        target: AtomicGlobalTarget,
        deltas: Record<string, number>,
        defaults?: Record<string, number>
    ): Promise<Record<string, number>>
    lockRecord(recordName: string, id: string | number, attributeQuery?: AttributeQueryData): Promise<Record<string, unknown> | undefined>
    lockRows(recordName: string, match: MatchExpressionData, attributeQuery?: AttributeQueryData): Promise<Record<string, unknown>[]>
}

export type StorageSchemaRecordItem = {
    recordName: string,
    tableName: string,
    isRelation: boolean,
    isFiltered: boolean,
    attributes: readonly string[],
    resolvedBaseRecordName?: string,
    resolvedMatchExpression?: MatchExpressionData,
    attributeDetails?: readonly StorageSchemaAttributeItem[],
}

export type StorageSchemaTableItem = {
    tableName: string,
    columns: readonly string[],
    columnDetails?: readonly StorageSchemaColumnItem[],
}

export type StorageSchemaAttributeItem = {
    name: string,
    kind: 'value' | 'record',
    tableName?: string,
    fieldName?: string,
    type?: string,
    fieldType?: string,
    collection?: boolean,
    computed?: boolean,
    linkName?: string,
    sourceField?: string,
    targetField?: string,
    resolvedBaseRecordName?: string,
}

export type StorageSchemaColumnItem = {
    columnName: string,
    fieldType: string,
    ownerRecords: readonly string[],
}

export type StorageSchemaMetadata = {
    dialect: SchemaDialect,
    records: readonly StorageSchemaRecordItem[],
    tables: readonly StorageSchemaTableItem[],
    constraints: readonly ConstraintSchemaItem[],
}

export type Storage = {
    map: unknown
    schema: StorageSchemaMetadata
    runInTransaction: <T>(options: TransactionOptions, fn: () => Promise<T>) => Promise<T>
    getTransactionIsolation: () => TransactionIsolation | undefined
    getTransactionCapability: () => TransactionCapability

    atomic: AtomicStorage

    dict: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<void>
        setInternal?: (key: string, value: unknown) => Promise<void>
    }

    get: (itemName: string, id: string, initialValue?: unknown) => Promise<unknown>
    set: (itemName: string, id: string, value: unknown, events?: RecordMutationEvent[]) => Promise<unknown>,
    setup: (entities: EntityInstance[], relations: RelationInstance[], createTables?: boolean, options?: SystemSchemaOptions) => unknown
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
    setup: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[], options?: boolean | SystemSchemaOptions) => Promise<void>
    migrateSchema?: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[], options?: SystemSchemaOptions) => Promise<void>
    prepareMigrationSchema?: (entities: EntityInstance[], relations: RelationInstance[], states: ComputationState[], options?: SystemSchemaOptions) => Promise<MigrationSchemaPlan>
    applyMigrationSchema?: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
    verifyMigrationSchema?: (plan: MigrationSchemaPlan) => Promise<void>
    applyMigrationPostSchema?: (plan: MigrationSchemaPlan, migrationId?: string) => Promise<void>
    hasExistingData?: () => Promise<boolean>
    beginMigration?: (modelHash: string, approvedDiffHash?: string, approvedDiffSummary?: unknown, decisionCount?: number) => Promise<MigrationRunState>
    updateMigrationPhase?: (migrationId: string, phase: Exclude<MigrationPhase, 'pending' | 'succeeded' | 'failed'>) => Promise<void>
    finishMigration?: (migrationId: string, status: 'succeeded' | 'failed', error?: unknown) => Promise<void>
    readMigrationManifest?: () => Promise<MigrationManifest | undefined>
    writeMigrationManifest?: (manifest: MigrationManifest) => Promise<void>
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

export type SchemaDialectConfig = {
    name: 'postgres' | 'sqlite' | 'mysql',
    maxIdentifierLength?: number,
    supportsCreateIndexIfNotExists?: boolean,
    encodeLiteral?: (value: string | number | boolean | null) => string,
    constraints?: {
        unique?: boolean,
        filteredUnique?: boolean,
    },
}

// FIXME 这里应该继承自 storage？
export type Database = {
    open: (forceDrop?:boolean) => Promise<void>
    openForSchemaRead?: () => Promise<void>
    logger: DatabaseLogger
    schemaDialect?: SchemaDialectConfig
    scheme: (sql:string, name?:string) => Promise<unknown>
    query: <T>(sql: string, values: unknown[],name?:string) => Promise<T[]>
    delete: <T>(sql: string, where: unknown[], name?:string) => Promise<T[]>
    insert: (sql: string, values: unknown[], name?:string) => Promise<EntityIdRef>
    update: (sql: string, values: unknown[], idField?: string, name?:string) => Promise<EntityIdRef[]>
    getAutoId: (recordName: string) => Promise<string>,
    parseMatchExpression?: (key: string, value: [string, any], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue:(v: string) => string, genPlaceholder: (name?: string) => string) => { fieldValue: string, fieldParams: unknown[] } | undefined
    getPlaceholder?: () => (name?:string) => string,
    supportsSelectForUpdate?: boolean,
    setupInternalComputationState?: () => Promise<void>,
    setupScopedSequenceState?: () => Promise<void>,
    atomicSequenceCapability?: AtomicSequenceCapability,
    setupRecordSequences?: (records: Array<{ recordName: string, tableName: string, idField: string }>) => Promise<void>,
    mapToDBFieldType: (type: string, collection?: boolean) => string
    close: () => Promise<void>
    transactionCapability?: TransactionCapability
    runInTransaction?: <T>(options: TransactionOptions, fn: () => Promise<T>) => Promise<T>
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

