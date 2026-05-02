import {
    ComputationState,
    Database,
    DatabaseLogger,
    RecordMutationCallback,
    RecordMutationEvent,
    Storage,
    AtomicStorage,
    AtomicTarget,
    AtomicRecordTarget,
    AtomicGlobalTarget,
    System,
    SYSTEM_RECORD,
    DICTIONARY_RECORD,
    SystemEntity,
    SystemLogger,
    SystemLogType,
    DictionaryEntity,
    EntityIdRef
} from "./System.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { RequireSerializableRetry, runWithTransactionRetry, TransactionIsolation, TransactionOptions } from "./transaction.js";
import { getCurrentEffects, addToCurrentEffects } from "./asyncEffectsContext.js";
import { Property, EntityInstance, RelationInstance, Entity, Relation, RefContainer } from "@core";
import {
    DBSetup,
    EntityQueryHandle,
    EntityToTableMap,
    MatchExp,
    MatchExpressionData,
    RawEntityData
} from '@storage';
// SQLiteDB is now imported from @drivers when needed
import { RecordBoundState } from "./computations/Computation.js";

function JSONStringify(value: unknown) {
    return encodeURI(JSON.stringify(value))
}

function JSONParse(value: string) {
    return value === undefined ? undefined : JSON.parse(decodeURI(value))
}

type StorageTransactionContext = {
    depth: number
    isolation: TransactionIsolation
}

class MonoStorage implements Storage{
    public map!: DBSetup["map"]
    public queryHandle?: EntityQueryHandle
    public dict: { get: (key: string) => Promise<unknown>, set: (key: string, value: unknown) => Promise<void>, setInternal?: (key: string, value: unknown) => Promise<void> }
    public atomic: AtomicStorage
    private transactionContext = new AsyncLocalStorage<StorageTransactionContext>()
    
    constructor(public db: Database) {
        // Initialize dict property with get/set methods
        this.dict = {
            get: async (key: string) => {
                const match = MatchExp.atom({key: 'key', value: ['=', key]})
                const value = (await this.queryHandle!.findOne(DICTIONARY_RECORD, match, undefined, ['value']))?.value
                return value?.raw
            },
            set: async (key: string, value: unknown): Promise<void> => {
                await this.setDictionaryValue(key, value, true)
            },
            setInternal: async (key: string, value: unknown): Promise<void> => {
                await this.setDictionaryValue(key, value, false)
            }
        }
        this.atomic = this.createAtomicStorage()
    }
    public callbacks: Set<RecordMutationCallback> = new Set()
    private getActiveTransactionContext() {
        const context = this.transactionContext.getStore()
        return context && context.depth > 0 ? context : undefined
    }
    getTransactionIsolation() {
        return this.getActiveTransactionContext()?.isolation
    }
    async runInTransaction<T>(options: TransactionOptions, fn: () => Promise<T>): Promise<T> {
        const isolation = options.isolation ?? 'READ COMMITTED'
        const existing = this.getActiveTransactionContext()
        if (existing) {
            if (existing.isolation !== 'SERIALIZABLE' && isolation === 'SERIALIZABLE') {
                throw new RequireSerializableRetry(`${options.name || 'nested transaction'} requires SERIALIZABLE isolation`)
            }
            existing.depth++
            try {
                return await fn()
            } finally {
                existing.depth--
            }
        }

        const context: StorageTransactionContext = { depth: 1, isolation }
        const run = async () => this.transactionContext.run(context, fn)
        if (this.db.runInTransaction) {
            return this.db.runInTransaction({ name: options.name, isolation }, run)
        }

        await this.db.scheme('BEGIN', options.name)
        try {
            const result = await run()
            await this.db.scheme('COMMIT', options.name)
            return result
        } catch (error) {
            await this.db.scheme('ROLLBACK', options.name)
            throw error
        }
    }
    private isInTransaction() {
        return (this.getActiveTransactionContext()?.depth ?? 0) > 0
    }
    private requireTransaction(operation: string) {
        if (!this.isInTransaction()) {
            throw new Error(`${operation} requires an active transaction`)
        }
    }
    private async withAtomicTransaction<T>(operation: string, fn: () => Promise<T>): Promise<T> {
        if (this.isInTransaction()) {
            return fn()
        }
        return runWithTransactionRetry(operation, (isolation) => this.runInTransaction({ name: operation, isolation }, fn))
    }
    private async setDictionaryValue(key: string, value: unknown, emitEvents: boolean): Promise<void> {
        const match = MatchExp.atom({key: 'key', value: ['=', key]})
        const origin = await this.queryHandle!.findOne(DICTIONARY_RECORD, match, undefined, ['value'])
        if (origin) {
            const args: [string, MatchExpressionData, RawEntityData] = [DICTIONARY_RECORD, MatchExp.atom({key: 'id', value: ['=', origin.id]}), {key, value: {raw:value}}]
            if (emitEvents) {
                await this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), args, [])
            } else {
                await this.queryHandle!.update(...args, [])
            }
        } else {
            const args: [string, RawEntityData] = [DICTIONARY_RECORD, { key, value: {raw:value}}]
            if (emitEvents) {
                await this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), args, [])
            } else {
                await this.queryHandle!.create(...args, [])
            }
        }
    }
    // CAUTION kv 结构数据的实现也用 er。这是系统约定，因为也需要  Record 事件！
    async get(concept: string, key: string, initialValue?: unknown) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const value = (await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value']))?.value
        if (value === undefined) return initialValue

        return JSONParse(value)
    }
    async set(concept: string, key: string, value: unknown, events?: RecordMutationEvent[]) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const origin = await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value'])
        if (origin) {
            return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [SYSTEM_RECORD, match, { concept, key: key.toString(), value: JSONStringify(value)}], events)
        } else {
            return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [SYSTEM_RECORD, { concept, key: key.toString(), value: encodeURI(JSON.stringify(value))}], events)
        }
    }
    async setup(entities: EntityInstance[], relations: RelationInstance[], createTables = false) {
        await this.db.open(createTables)
        if (createTables && this.db.setupInternalComputationState) {
            await this.db.setupInternalComputationState()
        }
        const dbSetup = new DBSetup(
            entities, 
            relations, 
            this.db
        )
        if (createTables) await dbSetup.createTables()
        if (this.db.setupRecordSequences) {
            const tableMap = new EntityToTableMap(dbSetup.map, dbSetup.aliasManager)
            await this.db.setupRecordSequences(Object.keys(dbSetup.map.records).map(recordName => {
                const recordInfo = tableMap.getRecordInfo(recordName)
                const idField = recordInfo.idField
                if (!idField) {
                    throw new Error(`id field not found for ${recordName}`)
                }
                return {
                    recordName,
                    tableName: recordInfo.table,
                    idField,
                }
            }))
        }
        this.queryHandle = new EntityQueryHandle( new EntityToTableMap(dbSetup.map, dbSetup.aliasManager), this.db)

        this.map = dbSetup.map
    }

    private isRecordTarget(target: AtomicTarget): target is AtomicRecordTarget {
        return (target as AtomicRecordTarget).recordName !== undefined
    }

    private resolveRecordTarget(target: AtomicRecordTarget) {
        const map = this.queryHandle!.map
        const inputRecordInfo = map.getRecordInfo(target.recordName)
        const resolvedRecordName = inputRecordInfo.resolvedBaseRecordName || target.recordName
        const recordInfo = map.getRecordInfo(resolvedRecordName)
        const [, fieldName, tableName] = map.getTableAliasAndFieldName([resolvedRecordName], target.field, true)
        return { tableName, idField: recordInfo.idField, fieldName }
    }

    private resolveRecordTable(recordName: string) {
        const map = this.queryHandle!.map
        const inputRecordInfo = map.getRecordInfo(recordName)
        const resolvedRecordName = inputRecordInfo.resolvedBaseRecordName || recordName
        const recordInfo = map.getRecordInfo(resolvedRecordName)
        return { tableName: recordInfo.table, idField: recordInfo.idField, resolvedRecordName }
    }

    private resolveGlobalColumn(target: AtomicGlobalTarget, value?: unknown) {
        const valueType = target.valueType || typeof target.defaultValue || typeof value
        if (valueType === 'number') return 'numberValue'
        if (valueType === 'boolean') return 'booleanValue'
        if (valueType === 'string') return 'stringValue'
        return 'jsonValue'
    }

    private normalizeGlobalValue(value: unknown, column: string) {
        if (value === undefined) return null
        if (column === 'numberValue' && value !== null) return Number(value)
        if (column === 'jsonValue' && value !== null && typeof value !== 'string') return JSON.stringify(value)
        return value
    }

    private parseGlobalValue<T>(value: unknown, column: string): T | null {
        if (value === undefined || value === null) return null
        if (column === 'numberValue') return Number(value) as T
        if (column === 'jsonValue' && typeof value === 'string') return JSON.parse(value) as T
        return value as T
    }

    private supportsForUpdate() {
        return this.db.supportsSelectForUpdate !== false
    }

    private getPlaceholder() {
        return this.db.getPlaceholder?.() || (() => '?')
    }

    private async ensureGlobalStateRow(target: AtomicGlobalTarget, column: string, defaultValue = target.defaultValue) {
        const p = this.getPlaceholder()
        const storedDefault = this.normalizeGlobalValue(defaultValue, column)
        if (storedDefault === null) {
            await this.db.update(
                `INSERT INTO "_ComputationState_" ("key") VALUES (${p()}) ON CONFLICT ("key") DO NOTHING`,
                [target.key],
                undefined,
                `atomic ensure global ${target.key}`
            )
        } else {
            const keyPlaceholder = p()
            const valuePlaceholder = p()
            await this.db.update(
                `INSERT INTO "_ComputationState_" ("key", "${column}") VALUES (${keyPlaceholder}, ${valuePlaceholder}) ON CONFLICT ("key") DO NOTHING`,
                [target.key, storedDefault],
                undefined,
                `atomic ensure global ${target.key}`
            )
        }
    }

    private createAtomicStorage(): AtomicStorage {
        const globalColumns = ['numberValue', 'booleanValue', 'stringValue', 'jsonValue']
        return {
            get: async <T>(target: AtomicTarget): Promise<T | null> => {
                const p = this.getPlaceholder()
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName } = this.resolveRecordTarget(target)
                    const rows = await this.db.query<Record<string, unknown>>(
                        `SELECT "${fieldName}" AS value FROM "${tableName}" WHERE "${idField}" = ${p()}`,
                        [target.id],
                        `atomic get ${target.recordName}.${target.field}`
                    )
                    return (rows[0]?.value ?? null) as T | null
                }

                const column = this.resolveGlobalColumn(target)
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${column}" AS value FROM "_ComputationState_" WHERE "key" = ${p()}`,
                    [target.key],
                    `atomic get ${target.key}`
                )
                return this.parseGlobalValue<T>(rows[0]?.value, column)
            },
            increment: async (target: AtomicTarget, delta: number): Promise<number> => {
                const p = this.getPlaceholder()
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName } = this.resolveRecordTarget(target)
                    const deltaPlaceholder = p()
                    const idPlaceholder = p()
                    const rows = await this.db.query<Record<string, unknown>>(
                        `UPDATE "${tableName}" SET "${fieldName}" = COALESCE("${fieldName}", 0) + ${deltaPlaceholder} WHERE "${idField}" = ${idPlaceholder} RETURNING "${fieldName}" AS value`,
                        [delta, target.id],
                        `atomic increment ${target.recordName}.${target.field}`
                    )
                    if (!rows.length) throw new Error(`Atomic increment target not found: ${target.recordName}.${String(target.id)}.${target.field}`)
                    return Number(rows[0]?.value ?? await this.atomic.get(target) ?? 0)
                }

                const keyPlaceholder = p()
                const deltaPlaceholder = p()
                const updateDeltaPlaceholder = p()
                const rows = await this.db.query<Record<string, unknown>>(
                    `INSERT INTO "_ComputationState_" ("key", "numberValue") VALUES (${keyPlaceholder}, ${deltaPlaceholder})
ON CONFLICT ("key") DO UPDATE SET "numberValue" = COALESCE("_ComputationState_"."numberValue", 0) + ${updateDeltaPlaceholder}
RETURNING "numberValue" AS value`,
                    [target.key, delta, delta],
                    `atomic increment ${target.key}`
                )
                return Number(rows[0]?.value ?? await this.atomic.get(target) ?? 0)
            },
            replace: async <T>(target: AtomicTarget, value: T): Promise<{ oldValue: T | null, newValue: T }> => this.withAtomicTransaction(
                this.isRecordTarget(target) ? `atomic replace ${target.recordName}.${target.field}` : `atomic replace ${target.key}`,
                async () => {
                const p = this.getPlaceholder()
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName } = this.resolveRecordTarget(target)
                    const lockIdPlaceholder = p()
                    const oldRows = await this.db.query<Record<string, unknown>>(
                        `SELECT "${fieldName}" AS value FROM "${tableName}" WHERE "${idField}" = ${lockIdPlaceholder}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                        [target.id],
                        `atomic replace lock ${target.recordName}.${target.field}`
                    )
                    if (!oldRows.length) throw new Error(`Atomic replace target not found: ${target.recordName}.${String(target.id)}.${target.field}`)
                    const updateP = this.getPlaceholder()
                    const valuePlaceholder = updateP()
                    const idPlaceholder = updateP()
                    const newRows = await this.db.query<Record<string, unknown>>(
                        `UPDATE "${tableName}" SET "${fieldName}" = ${valuePlaceholder} WHERE "${idField}" = ${idPlaceholder} RETURNING "${fieldName}" AS value`,
                        [value, target.id],
                        `atomic replace ${target.recordName}.${target.field}`
                    )
                    return { oldValue: (oldRows[0].value ?? null) as T | null, newValue: (newRows[0]?.value ?? value) as T }
                }

                const column = this.resolveGlobalColumn(target, value)
                const storedValue = this.normalizeGlobalValue(value, column)
                await this.ensureGlobalStateRow(target, column)
                const lockKeyPlaceholder = p()
                const oldRows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${column}" AS value FROM "_ComputationState_" WHERE "key" = ${lockKeyPlaceholder}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [target.key],
                    `atomic replace lock ${target.key}`
                )
                const clearColumns = globalColumns.filter(item => item !== column).map(item => `"${item}" = NULL`).join(', ')
                const oldValue = (this.parseGlobalValue<T>(oldRows[0]?.value, column) ?? target.defaultValue ?? null) as T | null
                const updateP = this.getPlaceholder()
                const valuePlaceholder = updateP()
                const keyPlaceholder = updateP()
                const setColumns = [`"${column}" = ${valuePlaceholder}`, clearColumns].filter(Boolean).join(', ')
                const newRows = await this.db.query<Record<string, unknown>>(
                    `UPDATE "_ComputationState_" SET ${setColumns} WHERE "key" = ${keyPlaceholder} RETURNING "${column}" AS value`,
                    [storedValue, target.key],
                    `atomic replace ${target.key}`
                )
                return { oldValue, newValue: (this.parseGlobalValue<T>(newRows[0]?.value, column) ?? value) as T }
            }),
            compareAndSet: async <T>(target: AtomicTarget, expected: T, next: T, options?: { defaultValue?: T }): Promise<boolean> => {
                const p = this.getPlaceholder()
                const defaultValue = options?.defaultValue
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName } = this.resolveRecordTarget(target)
                    const nextPlaceholder = p()
                    const idPlaceholder = p()
                    const defaultPlaceholder = p()
                    const expectedPlaceholder = p()
                    const rows = await this.db.query<Record<string, unknown>>(
                        `UPDATE "${tableName}" SET "${fieldName}" = ${nextPlaceholder} WHERE "${idField}" = ${idPlaceholder} AND COALESCE("${fieldName}", ${defaultPlaceholder}) = ${expectedPlaceholder} RETURNING "${fieldName}" AS value`,
                        [next, target.id, defaultValue, expected],
                        `atomic compareAndSet ${target.recordName}.${target.field}`
                    )
                    return rows.length > 0
                }

                const column = this.resolveGlobalColumn(target, next)
                const storedNext = this.normalizeGlobalValue(next, column)
                const storedDefault = this.normalizeGlobalValue(defaultValue, column)
                const storedExpected = this.normalizeGlobalValue(expected, column)
                const nextPlaceholder = p()
                const keyPlaceholder = p()
                const defaultPlaceholder = p()
                const expectedPlaceholder = p()
                const rows = await this.db.query<Record<string, unknown>>(
                    `UPDATE "_ComputationState_" SET "${column}" = ${nextPlaceholder} WHERE "key" = ${keyPlaceholder} AND COALESCE("${column}", ${defaultPlaceholder}) = ${expectedPlaceholder} RETURNING "${column}" AS value`,
                    [storedNext, target.key, storedDefault, storedExpected],
                    `atomic compareAndSet ${target.key}`
                )
                if (rows.length) return true
                if (storedExpected !== storedDefault) return false
                const insertP = this.getPlaceholder()
                const insertKeyPlaceholder = insertP()
                const insertNextPlaceholder = insertP()
                const inserted = await this.db.query<Record<string, unknown>>(
                    `INSERT INTO "_ComputationState_" ("key", "${column}") VALUES (${insertKeyPlaceholder}, ${insertNextPlaceholder}) ON CONFLICT ("key") DO NOTHING RETURNING "${column}" AS value`,
                    [target.key, storedNext],
                    `atomic compareAndSet insert ${target.key}`
                )
                return inserted.length > 0
            },
            lockGlobal: async <T>(target: AtomicGlobalTarget): Promise<T | null> => {
                this.requireTransaction(`atomic lockGlobal ${target.key}`)
                const column = this.resolveGlobalColumn(target)
                await this.ensureGlobalStateRow(target, column)
                const p = this.getPlaceholder()
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${column}" AS value FROM "_ComputationState_" WHERE "key" = ${p()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [target.key],
                    `atomic lockGlobal ${target.key}`
                )
                return (this.parseGlobalValue<T>(rows[0]?.value, column) ?? target.defaultValue ?? null) as T | null
            },
            updateGlobalFields: async (
                target: AtomicGlobalTarget,
                deltas: Record<string, number>,
                defaults: Record<string, number> = {}
            ): Promise<Record<string, number>> => {
                this.requireTransaction(`atomic updateGlobalFields ${target.key}`)
                const jsonTarget = { ...target, valueType: 'json' as const, defaultValue: defaults }
                await this.ensureGlobalStateRow(jsonTarget, 'jsonValue', defaults)
                const p = this.getPlaceholder()
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "jsonValue" AS value FROM "_ComputationState_" WHERE "key" = ${p()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [target.key],
                    `atomic updateGlobalFields lock ${target.key}`
                )
                const current = (this.parseGlobalValue<Record<string, number>>(rows[0]?.value, 'jsonValue') ?? {}) as Record<string, number>
                const next = { ...defaults, ...current }
                Object.entries(deltas).forEach(([key, delta]) => {
                    next[key] = Number(next[key] ?? defaults[key] ?? 0) + delta
                })
                const updateP = this.getPlaceholder()
                const valuePlaceholder = updateP()
                const keyPlaceholder = updateP()
                await this.db.update(
                    `UPDATE "_ComputationState_" SET "jsonValue" = ${valuePlaceholder} WHERE "key" = ${keyPlaceholder}`,
                    [JSON.stringify(next), target.key],
                    undefined,
                    `atomic updateGlobalFields ${target.key}`
                )
                return next
            },
            lockRecord: async (recordName: string, id: string | number, attributeQuery = ['*']) => {
                this.requireTransaction(`atomic lockRecord ${recordName}`)
                const { tableName, idField } = this.resolveRecordTable(recordName)
                const p = this.getPlaceholder()
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${idField}" AS id FROM "${tableName}" WHERE "${idField}" = ${p()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [id],
                    `atomic lockRecord ${recordName}`
                )
                if (!rows.length) return undefined
                return this.queryHandle!.findOne(recordName, MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, attributeQuery)
            },
            lockRows: async (recordName: string, match: MatchExpressionData, attributeQuery = ['*']) => {
                this.requireTransaction(`atomic lockRows ${recordName}`)
                const rows = await this.queryHandle!.find(recordName, match, undefined, ['id'])
                const ids = rows.map(row => row.id)
                if (!ids.length) return []
                const { tableName, idField } = this.resolveRecordTable(recordName)
                const p = this.getPlaceholder()
                const placeholders = ids.map(() => p()).join(',')
                await this.db.query(
                    `SELECT "${idField}" AS id FROM "${tableName}" WHERE "${idField}" IN (${placeholders})${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    ids,
                    `atomic lockRows ${recordName}`
                )
                return this.queryHandle!.find(recordName, MatchExp.atom({ key: 'id', value: ['in', ids] }), undefined, attributeQuery)
            }
        }
    }
    findOne(...arg:Parameters<EntityQueryHandle["findOne"]>) {
        return this.queryHandle!.findOne(...arg)
    }
    find(...arg:Parameters<EntityQueryHandle["find"]>) {
        return this.queryHandle!.find(...arg)
    }
    create(entityName: string, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [entityName, rawData], events) as Promise<EntityIdRef>
    }
    update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [entity, matchExpressionData, rawData], events) as Promise<EntityIdRef>
    }
    delete(entityName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.delete.bind(this.queryHandle), [entityName, matchExpressionData], events) as Promise<EntityIdRef>
    }
    async callWithEvents<T extends unknown[]>(method: (...arg: [...T, RecordMutationEvent[]]) => unknown, args: T, events: RecordMutationEvent[] = []): Promise<unknown> {
        if (!this.isInTransaction()) {
            return this.withAtomicTransaction('storage mutation with events', async () => this.callWithEvents(method, args, events))
        }
        const methodEvents:RecordMutationEvent[] = []
        const result = await method(...args, methodEvents)
        // FIXME 还没有实现异步机制
        // nextJob(() => {
        //     this.dispatch(events)
        // })
        // CAUTION 特别注意这里会空充 events
        const  newEvents = await this.dispatch(methodEvents)
        events.push(...methodEvents, ...newEvents)
        
        // Also add to async context if available
        const contextEffects = getCurrentEffects()
        if (contextEffects && methodEvents.length > 0) {
            addToCurrentEffects(methodEvents)
        }
        if (contextEffects && newEvents.length > 0) {
            addToCurrentEffects(newEvents)
        }
        
        return result
    }
    findRelationByName(...arg:Parameters<EntityQueryHandle["findRelationByName"]>) {
        return this.queryHandle!.findRelationByName(...arg)
    }
    findOneRelationByName(...arg: Parameters<EntityQueryHandle["findOneRelationByName"]>) {
        return this.queryHandle!.findOneRelationByName(...arg)
    }
    updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.updateRelationByName.bind(this.queryHandle), [relationName, matchExpressionData, rawData], events) as Promise<EntityIdRef>
    }
    removeRelationByName(relationName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.removeRelationByName.bind(this.queryHandle), [relationName, matchExpressionData], events) as Promise<EntityIdRef>
    }
    addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {}, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.addRelationByNameById.bind(this.queryHandle), [relationName, sourceEntityId, targetEntityId, rawData], events) as Promise<EntityIdRef>
    }
    getRelationName(...arg:Parameters<EntityQueryHandle["getRelationName"]>) {
        return this.queryHandle!.getRelationName(...arg)
    }
    getEntityName(...arg:Parameters<EntityQueryHandle["getEntityName"]>) {
        return this.queryHandle!.getEntityName(...arg)
    }
    listen(callback: RecordMutationCallback) {
        this.callbacks.add(callback)
    }
    async dispatch(events: RecordMutationEvent[]) {
        const newEvents: RecordMutationEvent[] = []
        for(let callback of this.callbacks) {
            const callbackResult = (await callback(events)) as {events?: RecordMutationEvent[]}
            if (callbackResult?.events) {
                newEvents.push(...callbackResult.events)
            }
        }
        return newEvents
    }
    destroy() {
        return this.db.close()
    }
}




// Define log levels for database logger
export enum DBLogLevel {
    ERROR = 0,
    INFO = 1,
}

export class DBConsoleLogger implements DatabaseLogger{
    constructor(private level: DBLogLevel = DBLogLevel.ERROR) {}
    
    info({type, name, sql, params}: Parameters<DatabaseLogger["info"]>[0]) {
        if (this.level >= DBLogLevel.INFO) {
            console.log({type, name, sql, params})
        }
    }
    error({type, name, sql, params, error}: Parameters<DatabaseLogger["error"]>[0]) {
        if (this.level >= DBLogLevel.ERROR) {
            console.error({type, name, sql, params, error})
        }
    }
    child() {
        return new DBConsoleLogger(this.level)
    }
}

// Define log levels for system logger
export enum SystemLogLevel {
    MUTE = -1,
    ERROR = 0,
    INFO = 1,
    DEBUG = 2,
}

export class SystemConsoleLogger implements SystemLogger{
    constructor(private level: SystemLogLevel = SystemLogLevel.ERROR) {}
    
    error({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.ERROR) {
            console.error(`[ERROR] ${label}: ${message}`, rest)
        }
    }
    info({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.INFO) {
            console.info(`[INFO] ${label}: ${message}`, rest)
        }
    }
    debug({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.DEBUG) {
            console.debug(`[DEBUG] ${label}: ${message}`, rest)
        }
    }
    child(fixed: object) {
        return new SystemConsoleLogger(this.level)
    }
}
export const dbConsoleLogger = new DBConsoleLogger()
export const systemConsoleLogger = new SystemConsoleLogger()

export class MonoSystem implements System {
    conceptClass: Map<string, unknown> = new Map()
    storage: Storage
    constructor(db: Database, public logger: SystemLogger = systemConsoleLogger) {
        this.storage = new MonoStorage(db)
    }
    
    async setup(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[], install = false){
        // Use RefContainer to handle cloning and reference updates
        const container = new RefContainer(originalEntities, originalRelations);
        
        // Get cloned entities and relations with all references automatically updated
        const { entities, relations } = container.getAll();
        
        // Process states to inject properties into entities/relations
        states.forEach(({dataContext, state}) => {
            Object.entries(state).forEach(([stateName, stateItem]) => {
                if (stateItem instanceof RecordBoundState) { 
                    if (!stateItem.record) {
                        return;
                    }
                    let rootEntity: EntityInstance|RelationInstance | undefined = container.getEntityByName(stateItem.record);
                    if (!rootEntity) {
                        rootEntity = container.getRelationByName(stateItem.record);
                    }
                    if (!rootEntity) {
                        throw new Error(`Entity or Relation not found: ${stateItem.record}`);
                    }

                    // 考虑 filtered entity 和 filtered relation 的级联问题，这里要找到根
                    while ((rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation) {
                        rootEntity = (rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation!
                    }

                    if (stateItem.defaultValue instanceof Property) {
                        // CAUTION 特别注意这里改了 name
                        stateItem.defaultValue.name = stateItem.key
                        rootEntity.properties.push(stateItem.defaultValue)
                    } else {
                        const defaultValuetype = typeof stateItem.defaultValue
                        rootEntity.properties.push(Property.create({
                            name: stateItem.key,
                            type: defaultValuetype,
                            // 应该系统定义
                            collection: Array.isArray(stateItem.defaultValue),
                            defaultValue: () => stateItem.defaultValue
                        }))
                    }
                }
            })
        })

        
        // Pass the prepared entities to storage.setup
        await this.storage.setup(
            [...entities, DictionaryEntity, SystemEntity], 
            relations,
            install
        )
        await this.setupTransformUniqueIndexes(states)
    }

    private hashIdentifier(input: string) {
        let hash = 0
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
        }
        return Math.abs(hash).toString(36)
    }

    private async setupTransformUniqueIndexes(states: ComputationState[]) {
        for (const { dataContext, state } of states) {
            const sourceRecordId = state.sourceRecordId
            const transformIndex = state.transformIndex
            if (
                !(sourceRecordId instanceof RecordBoundState) ||
                !(transformIndex instanceof RecordBoundState) ||
                (sourceRecordId as any).unique === false ||
                (dataContext.type !== 'entity' && dataContext.type !== 'relation')
            ) {
                continue
            }

            const recordName = dataContext.id.name!
            const storage = this.storage as MonoStorage
            const map = storage.queryHandle!.map
            const recordInfo = map.getRecordInfo(recordName)
            const [, sourceRecordIdField] = map.getTableAliasAndFieldName([recordName], sourceRecordId.key, true)
            const [, transformIndexField] = map.getTableAliasAndFieldName([recordName], transformIndex.key, true)
            const indexName = `idx_transform_${this.hashIdentifier(`${recordInfo.table}_${sourceRecordIdField}_${transformIndexField}`)}`
            await storage.db.scheme(
                `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "${recordInfo.table}" ("${sourceRecordIdField}", "${transformIndexField}")`,
                `setup transform unique index ${recordName}`
            )
        }
    }
    async destroy() {
        await this.storage.destroy()
    }
}
