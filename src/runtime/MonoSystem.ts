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
    StorageSchemaMetadata,
    DictionaryEntity,
    EntityIdRef
} from "./System.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { RequireSerializableRetry, runWithTransactionRetry, TransactionCapability, TransactionCapabilityError, TransactionIsolation, TransactionOptions } from "./transaction.js";
import { getCurrentEffects, addToCurrentEffects } from "./asyncEffectsContext.js";
import { Property, EntityInstance, RelationInstance, Entity, Relation, RefContainer, type ConstraintPredicateOperator } from "@core";
import {
    ConstraintSchemaItem,
    DBSetup,
    EntityQueryHandle,
    EntityToTableMap,
    MatchExp,
    MatchExpressionData,
    RawEntityData
} from '@storage';
// SQLiteDB is now imported from @drivers when needed
import { RecordBoundState } from "./computations/Computation.js";
import { ConstraintSetupError, ConstraintViolationError, findConstraintViolationError } from "./errors/ConstraintErrors.js";
import { normalizeDatabaseError } from "./errors/DatabaseErrors.js";
import { createUniqueIndexSQL, getSchemaDialect } from "@storage";
import type { AdditiveDDLOperation, MigrationManifest, MigrationPhase, MigrationRunState, MigrationSchemaPlan } from "./migration.js";

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
    private constraintSchemaItems: ConstraintSchemaItem[] = []
    public schema: StorageSchemaMetadata = {
        dialect: getSchemaDialect(),
        records: [],
        tables: [],
        constraints: []
    }
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

    private async ensureDbOpenForSchemaRead() {
        if (this.db.openForSchemaRead) {
            await this.db.openForSchemaRead()
        } else {
            if ((this.db as unknown as { db?: unknown }).db) return
            await this.db.open(false)
        }
    }
    public callbacks: Set<RecordMutationCallback> = new Set()
    private getActiveTransactionContext() {
        const context = this.transactionContext.getStore()
        return context && context.depth > 0 ? context : undefined
    }
    getTransactionIsolation() {
        return this.getActiveTransactionContext()?.isolation
    }
    getTransactionCapability(): TransactionCapability {
        return this.db.transactionCapability ?? {
            transactions: true,
            isolationLevels: ['READ COMMITTED'],
            transactionBoundConnection: false,
            concurrentTransactions: 'unsupported',
            nestedStrategy: 'reuse',
            notes: [
                'This driver has no explicit transaction capability declaration; MonoStorage will use fallback BEGIN/COMMIT semantics only.'
            ],
        }
    }
    async runInTransaction<T>(options: TransactionOptions, fn: () => Promise<T>): Promise<T> {
        const isolation = options.isolation ?? 'READ COMMITTED'
        const capability = this.getTransactionCapability()
        if (!capability.transactions) {
            throw new TransactionCapabilityError({
                transactionName: options.name,
                requestedIsolation: isolation,
                capability,
                reason: 'driver does not support transactions',
            })
        }
        if (!capability.isolationLevels.includes(isolation)) {
            throw new TransactionCapabilityError({
                transactionName: options.name,
                requestedIsolation: isolation,
                capability,
                reason: `driver does not support ${isolation} isolation`,
            })
        }
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
        let dbSetup: DBSetup
        try {
            dbSetup = new DBSetup(
                entities, 
                relations, 
                this.db
            )
        } catch (error) {
            throw new ConstraintSetupError(
                error instanceof Error ? error.message : String(error),
                {
                    driver: this.db.constructor?.name,
                    causedBy: error instanceof Error ? error : undefined,
                }
            )
        }
        if (createTables) await dbSetup.createTables()
        await this.createConstraints(dbSetup)
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
        this.constraintSchemaItems = dbSetup.constraintSchemaItems
        this.schema = this.createSchemaMetadata(dbSetup)
    }

    async prepareMigrationAdditive(entities: EntityInstance[], relations: RelationInstance[]): Promise<MigrationSchemaPlan> {
        await this.ensureDbOpenForSchemaRead()
        if (this.db.setupInternalComputationState) {
            // The table creation itself is idempotent, but planning must stay
            // read-only. The actual setup runs in applyMigrationAdditivePlan.
        }
        let dbSetup: DBSetup
        try {
            dbSetup = new DBSetup(
                entities,
                relations,
                this.db
            )
        } catch (error) {
            throw new ConstraintSetupError(
                error instanceof Error ? error.message : String(error),
                {
                    driver: this.db.constructor?.name,
                    causedBy: error instanceof Error ? error : undefined,
                }
            )
        }

        const preRecomputeDDL = await this.createAdditiveSchemaPlan(dbSetup)
        const { verificationDDL, postRecomputeDDL } = this.createPostRecomputeSchemaPlan(dbSetup)
        return {
            schema: this.createSchemaMetadata(dbSetup),
            preRecomputeDDL,
            postRecomputeDDL,
            verificationDDL,
            blockingChanges: [],
            internal: { dbSetup },
        }
    }

    private migrationOperationKey(phase: string, operation: AdditiveDDLOperation, index: number) {
        return `${phase}:${index}:${operation.kind}:${operation.tableName || ''}:${operation.columnName || ''}:${operation.logicalPath || ''}:${operation.sql || operation.description}`
    }

    async isMigrationOperationComplete(migrationId: string | undefined, operationKey: string) {
        if (!migrationId) return false
        const dialect = getSchemaDialect(this.db).name
        const rows = await this.db.query<{ status: string }>(
            dialect === 'mysql'
                ? `SELECT "status" FROM "__interaqt_migration_operation_log" WHERE "migrationId" = ? AND "operationKey" = ? LIMIT 1`
                : `SELECT "status" FROM "__interaqt_migration_operation_log" WHERE "migrationId" = $1 AND "operationKey" = $2 LIMIT 1`,
            [migrationId, operationKey],
            'read migration operation log'
        )
        return rows[0]?.status === 'succeeded'
    }

    async markMigrationOperationComplete(migrationId: string | undefined, operationKey: string) {
        if (!migrationId) return
        const escapedMigrationId = migrationId.replace(/'/g, "''")
        const escapedOperationKey = operationKey.replace(/'/g, "''")
        if (getSchemaDialect(this.db).name === 'mysql') {
            await this.db.scheme(
                `INSERT INTO "__interaqt_migration_operation_log" ("migrationId", "operationKey", "status") VALUES ('${escapedMigrationId}', '${escapedOperationKey}', 'succeeded') ON DUPLICATE KEY UPDATE "status" = VALUES("status")`,
                'write migration operation log'
            )
            return
        }
        await this.db.scheme(
            `INSERT INTO "__interaqt_migration_operation_log" ("migrationId", "operationKey", "status") VALUES ('${escapedMigrationId}', '${escapedOperationKey}', 'succeeded') ON CONFLICT ("migrationId", "operationKey") DO UPDATE SET "status" = EXCLUDED."status"`,
            'write migration operation log'
        )
    }

    private async applyMigrationOperations(phase: string, operations: AdditiveDDLOperation[], migrationId?: string) {
        for (const [index, operation] of operations.entries()) {
            if (!operation.sql) continue
            const operationKey = this.migrationOperationKey(phase, operation, index)
            if (await this.isMigrationOperationComplete(migrationId, operationKey)) continue
            await this.db.scheme(operation.sql, operation.description)
            await this.markMigrationOperationComplete(migrationId, operationKey)
        }
    }

    async applyMigrationAdditivePlan(plan: MigrationSchemaPlan, migrationId?: string) {
        const dbSetup = (plan.internal as { dbSetup: DBSetup }).dbSetup
        await this.db.open(false)
        if (this.db.setupInternalComputationState) {
            await this.db.setupInternalComputationState()
        }
        await this.applyMigrationOperations('schema', plan.preRecomputeDDL, migrationId)
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
        this.queryHandle = new EntityQueryHandle(new EntityToTableMap(dbSetup.map, dbSetup.aliasManager), this.db)
        this.map = dbSetup.map
        this.constraintSchemaItems = dbSetup.constraintSchemaItems
        this.schema = this.createSchemaMetadata(dbSetup)
    }

    async applyPostRecomputeSchemaPlan(plan: MigrationSchemaPlan, migrationId?: string) {
        await this.applyMigrationOperations('constraints', plan.postRecomputeDDL, migrationId)
    }

    async verifyMigrationPlan(plan: MigrationSchemaPlan, migrationId?: string) {
        for (const [index, operation] of plan.verificationDDL.entries()) {
            if (!operation.sql) continue
            const operationKey = this.migrationOperationKey('verification', operation, index)
            if (await this.isMigrationOperationComplete(migrationId, operationKey)) continue
            const rows = await this.db.query<Record<string, unknown>>(operation.sql, [], operation.description)
            if (rows.length > 0) {
                throw new ConstraintSetupError(`Migration verification failed for ${operation.logicalPath || operation.description}`, {
                    tableName: operation.tableName,
                    constraintName: operation.logicalPath,
                })
            }
            await this.markMigrationOperationComplete(migrationId, operationKey)
        }
    }

    private async createAdditiveSchemaPlan(dbSetup: DBSetup): Promise<AdditiveDDLOperation[]> {
        const operations: AdditiveDDLOperation[] = []
        const existingTables = await this.getExistingTables()
        for (const [tableName, table] of Object.entries(dbSetup.tables)) {
            if (!existingTables.has(tableName)) {
                const createTableSQL = dbSetup.createTableSQL().find(sql => sql.includes(`CREATE TABLE "${tableName}"`))
                if (!createTableSQL) {
                    throw new Error(`Cannot find create table SQL for ${tableName}`)
                }
                operations.push({
                    kind: 'create-table',
                    sql: createTableSQL.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'),
                    tableName,
                    description: `migration create table ${tableName}`,
                })
                continue
            }

            const existingColumns = await this.getExistingColumns(tableName)
            for (const column of Object.values(table.columns)) {
                if (existingColumns.has(column.name) || column.name === '_rowId') continue
                operations.push({
                    kind: 'add-column',
                    sql: `ALTER TABLE "${tableName}" ADD COLUMN "${column.name}" ${column.fieldType}`,
                    tableName,
                    columnName: column.name,
                    description: `migration add column ${tableName}.${column.name}`,
                })
            }
        }
        return operations
    }

    private createPostRecomputeSchemaPlan(dbSetup: DBSetup): { verificationDDL: AdditiveDDLOperation[], postRecomputeDDL: AdditiveDDLOperation[] } {
        const dialect = getSchemaDialect(this.db)
        if (dbSetup.constraintSchemaItems.length && dialect.constraints?.unique !== true) {
            const hasUnique = dbSetup.constraintSchemaItems.some(item => item.kind === 'unique')
            if (hasUnique) throw new ConstraintSetupError(`Migration post-recompute unique constraints are not supported by ${dialect.name}`, {
                driver: this.db.constructor?.name,
            })
        }
        if (dbSetup.constraintSchemaItems.some(item => item.kind === 'non-null') && dialect.constraints?.nonNull !== true) {
            throw new ConstraintSetupError(`Migration post-recompute non-null constraints are not supported by ${dialect.name}`, {
                driver: this.db.constructor?.name,
            })
        }
        const verificationDDL = dbSetup.constraintSchemaItems.map(item => ({
            kind: 'verify' as const,
            sql: item.kind === 'unique' ? this.createUniqueVerificationSQL(item) : this.createNonNullVerificationSQL(item),
            tableName: item.tableName,
            logicalPath: item.kind === 'unique' ? `${item.recordName}.${item.properties.join('.')}` : `${item.recordName}.${item.property}`,
            description: `migration verify constraint ${item.constraintName}`,
        }))
        const postRecomputeDDL = dbSetup.createConstraintSQL().map(statement => ({
            kind: 'create-constraint' as const,
            sql: statement.sql,
            tableName: statement.item.tableName,
            logicalPath: statement.item.kind === 'unique'
                ? `${statement.item.recordName}.${statement.item.properties.join('.')}`
                : `${statement.item.recordName}.${statement.item.property}`,
            description: `migration setup constraint ${statement.item.constraintName}`,
        }))
        return { verificationDDL, postRecomputeDDL }
    }

    private createNonNullVerificationSQL(item: ConstraintSchemaItem) {
        if (item.kind !== 'non-null') {
            throw new Error('expected non-null constraint')
        }
        return `SELECT "${item.field}" FROM "${item.tableName}" WHERE "${item.field}" IS NULL LIMIT 1`
    }

    private createUniqueVerificationSQL(item: Extract<ConstraintSchemaItem, { kind: 'unique' }>) {
        const fields = item.fields.map(field => `"${field}"`)
        const notNull = fields.map(field => `${field} IS NOT NULL`)
        const whereClauses = [...notNull]
        Object.entries(item.where || {}).forEach(([property, operator]) => {
            const field = item.fields[item.properties.indexOf(property)]
            if (field) {
                whereClauses.push(this.constraintPredicateToSQL(`"${field}"`, operator as ConstraintPredicateOperator))
            }
        })
        const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''
        return `SELECT ${fields.join(', ')}, COUNT(*) AS "__count" FROM "${item.tableName}" ${where} GROUP BY ${fields.join(', ')} HAVING COUNT(*) > 1 LIMIT 1`
    }

    private constraintPredicateToSQL(field: string, operator: ConstraintPredicateOperator) {
        const encode = getSchemaDialect(this.db).encodeLiteral || ((value: string | number | boolean | null) => value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`)
        switch (operator.op) {
            case 'isNull':
                return `${field} IS NULL`
            case 'isNotNull':
                return `${field} IS NOT NULL`
            case 'equals':
                return `${field} = ${encode(operator.value)}`
            case 'notEquals':
                return `${field} <> ${encode(operator.value)}`
            case 'in':
                return `${field} IN (${operator.value.map(value => encode(value)).join(', ')})`
            case 'notIn':
                return `${field} NOT IN (${operator.value.map(value => encode(value)).join(', ')})`
        }
    }

    async getExistingTables() {
        await this.ensureDbOpenForSchemaRead()
        const dialect = getSchemaDialect(this.db).name
        if (dialect === 'postgres') {
            const rows = await this.db.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
                [],
                'migration list tables'
            )
            return new Set(rows.map(row => row.table_name))
        }
        if (dialect === 'sqlite') {
            const rows = await this.db.query<{ name: string }>(
                `SELECT name FROM sqlite_master WHERE type = 'table'`,
                [],
                'migration list tables'
            )
            return new Set(rows.map(row => row.name))
        }
        const rows = await this.db.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`,
            [],
            'migration list tables'
        )
        return new Set(rows.map(row => row.table_name))
    }

    private async getExistingColumns(tableName: string) {
        const dialect = getSchemaDialect(this.db).name
        if (dialect === 'postgres') {
            const rows = await this.db.query<{ column_name: string }>(
                `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
                [tableName],
                `migration list columns ${tableName}`
            )
            return new Set(rows.map(row => row.column_name))
        }
        if (dialect === 'sqlite') {
            const escapedTableName = tableName.replace(/"/g, '""')
            const rows = await this.db.query<{ name: string }>(
                `PRAGMA table_info("${escapedTableName}")`,
                [],
                `migration list columns ${tableName}`
            )
            return new Set(rows.map(row => row.name))
        }
        const rows = await this.db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
            [tableName],
            `migration list columns ${tableName}`
        )
        return new Set(rows.map(row => row.column_name))
    }

    private createSchemaMetadata(dbSetup: DBSetup): StorageSchemaMetadata {
        const tableOwners = new Map<string, string[]>()
        Object.entries(dbSetup.map.records).forEach(([recordName, record]) => {
            if (!tableOwners.has(record.table)) tableOwners.set(record.table, [])
            tableOwners.get(record.table)!.push(recordName)
        })
        return {
            dialect: getSchemaDialect(this.db),
            records: Object.entries(dbSetup.map.records).map(([recordName, record]) => ({
                recordName,
                tableName: record.table,
                isRelation: record.isRelation === true,
                isFiltered: record.isFilteredEntity === true || record.isFilteredRelation === true,
                resolvedBaseRecordName: record.resolvedBaseRecordName,
                resolvedMatchExpression: record.resolvedMatchExpression,
                attributes: Object.keys(record.attributes),
                attributeDetails: Object.entries(record.attributes).map(([attributeName, attribute]) => {
                    const valueAttribute = attribute as any
                    const recordAttribute = attribute as any
                    return {
                        name: attributeName,
                        kind: recordAttribute.isRecord ? 'record' as const : 'value' as const,
                        tableName: valueAttribute.table || record.table,
                        fieldName: valueAttribute.field,
                        type: valueAttribute.type,
                        fieldType: valueAttribute.fieldType,
                        collection: valueAttribute.collection,
                        computed: valueAttribute.computed !== undefined,
                        linkName: recordAttribute.linkName,
                        sourceField: dbSetup.map.links[recordAttribute.linkName]?.sourceField,
                        targetField: dbSetup.map.links[recordAttribute.linkName]?.targetField,
                        resolvedBaseRecordName: recordAttribute.resolvedBaseRecordName,
                    }
                }),
            })),
            tables: Object.entries(dbSetup.tables).map(([tableName, table]) => ({
                tableName,
                columns: Object.keys(table.columns),
                columnDetails: Object.values(table.columns).map(column => ({
                    columnName: column.name,
                    fieldType: column.fieldType || '',
                    ownerRecords: tableOwners.get(tableName) || [],
                })),
            })),
            constraints: dbSetup.constraintSchemaItems.map(item => ({ ...item })),
        }
    }

    private async createConstraints(dbSetup: DBSetup) {
        let statements
        try {
            statements = dbSetup.createConstraintSQL()
        } catch (error) {
            throw new ConstraintSetupError(
                error instanceof Error ? error.message : String(error),
                {
                    driver: this.db.constructor?.name,
                    causedBy: error instanceof Error ? error : undefined,
                }
            )
        }

        for (const statement of statements) {
            const item = statement.item
            try {
                await this.db.scheme(statement.sql, `setup constraint ${item.constraintName}`)
            } catch (error) {
                throw new ConstraintSetupError(
                    `Failed to setup constraint "${item.constraintName}" on "${item.recordName}"`,
                    {
                        constraintName: item.constraintName,
                        physicalName: item.physicalName,
                        recordName: item.recordName,
                        tableName: item.tableName,
                        properties: item.kind === 'unique' ? item.properties : [item.property],
                        driver: this.db.constructor?.name,
                        rawCode: normalizeDatabaseError(error, this.db).rawCode,
                        causedBy: error instanceof Error ? error : undefined,
                    }
                )
            }
        }
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
    private findConstraintForError(error: unknown) {
        const normalized = normalizeDatabaseError(error, this.db)
        if (normalized.constraintName) {
            const byConstraint = this.constraintSchemaItems.find(item => item.physicalName === normalized.constraintName || item.constraintName === normalized.constraintName)
            if (byConstraint) return byConstraint
        }
        const byName = this.constraintSchemaItems.find(item => normalized.message.includes(item.physicalName) || normalized.message.includes(item.constraintName))
        if (byName) return byName
        return this.constraintSchemaItems.find(item => {
            const normalizedFields = normalized.fields || []
            const itemFields = item.kind === 'unique' ? item.fields : [item.field]
            const exactFieldMatch = normalized.tableName === item.tableName && itemFields.every(field => normalizedFields.includes(field))
            return exactFieldMatch || (normalized.message.includes(item.tableName) && itemFields.every(field => normalized.message.includes(field)))
        })
    }
    private mapConstraintError(error: unknown): unknown {
        const existing = findConstraintViolationError(error)
        if (existing) return existing
        const normalized = normalizeDatabaseError(error, this.db)
        if (!normalized.isUniqueViolation) return error
        const item = this.findConstraintForError(error)
        return new ConstraintViolationError(
            item ? `Unique constraint "${item.constraintName}" was violated` : 'Unique constraint was violated',
            {
                kind: 'unique',
                constraintName: item?.constraintName,
                recordName: item?.recordName,
                properties: item?.kind === 'unique' ? item.properties : item ? [item.property] : undefined,
                violationCode: item?.violationCode,
                driver: normalized.driver,
                rawCode: normalized.rawCode,
                causedBy: error instanceof Error ? error : undefined,
            }
        )
    }
    async callWithEvents<T extends unknown[]>(method: (...arg: [...T, RecordMutationEvent[]]) => unknown, args: T, events: RecordMutationEvent[] = []): Promise<unknown> {
        if (!this.isInTransaction()) {
            return this.withAtomicTransaction('storage mutation with events', async () => this.callWithEvents(method, args, events))
        }
        try {
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
        } catch (error) {
            throw this.mapConstraintError(error)
        }
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

    private get db() {
        return (this.storage as MonoStorage).db
    }

    private async ensureMigrationManifestTable() {
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_manifest" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL
)`, 'setup migration manifest table')
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_log" (
    "id" TEXT PRIMARY KEY,
    "modelHash" TEXT NOT NULL,
    "approvedDiffHash" TEXT NULL,
    "approvedDiffSummary" TEXT NULL,
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TEXT NULL,
    "phase" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL,
    "error" TEXT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
)`, 'setup migration log table')
        try {
            await this.db.scheme(`ALTER TABLE "__interaqt_migration_log" ADD COLUMN IF NOT EXISTS "phase" TEXT NOT NULL DEFAULT 'pending'`, 'setup migration log phase column')
        } catch {
            // Some drivers do not support ADD COLUMN IF NOT EXISTS; fresh schemas
            // already have the column and legacy duplicate-column failures are safe.
        }
        for (const columnDDL of [
            `"approvedDiffHash" TEXT NULL`,
            `"approvedDiffSummary" TEXT NULL`,
            `"decisionCount" INTEGER NOT NULL DEFAULT 0`,
            `"reviewedAt" TEXT NULL`,
        ]) {
            try {
                await this.db.scheme(`ALTER TABLE "__interaqt_migration_log" ADD COLUMN IF NOT EXISTS ${columnDDL}`, 'setup migration log review column')
            } catch {
                // Drivers without IF NOT EXISTS either already have the column or
                // are using the fresh schema above.
            }
        }
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_lock" (
    "key" TEXT PRIMARY KEY,
    "migrationId" TEXT NOT NULL
)`, 'setup migration lock table')
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_operation_log" (
    "migrationId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    PRIMARY KEY ("migrationId", "operationKey")
)`, 'setup migration operation log table')
    }

    async readMigrationManifest(): Promise<MigrationManifest | undefined> {
        const tables = await (this.storage as MonoStorage).getExistingTables()
        if (!tables.has('__interaqt_migration_manifest')) return undefined
        const dialect = getSchemaDialect(this.db).name
        const rows = await this.db.query<{ value: string }>(
            dialect === 'mysql'
                ? `SELECT "value" FROM "__interaqt_migration_manifest" WHERE "key" = ? LIMIT 1`
                : `SELECT "value" FROM "__interaqt_migration_manifest" WHERE "key" = $1 LIMIT 1`,
            ['current'],
            'read migration manifest'
        )
        return rows[0]?.value ? JSON.parse(rows[0].value) as MigrationManifest : undefined
    }

    async writeMigrationManifest(manifest: MigrationManifest): Promise<void> {
        await this.ensureMigrationManifestTable()
        const value = JSON.stringify(manifest)
        const dialect = getSchemaDialect(this.db).name
        if (dialect === 'mysql') {
            await this.db.scheme(
                `INSERT INTO "__interaqt_migration_manifest" ("key", "value") VALUES ('current', '${value.replace(/'/g, "''")}') ON DUPLICATE KEY UPDATE "value" = VALUES("value")`,
                'write migration manifest'
            )
            return
        }
        await this.db.scheme(
            `INSERT INTO "__interaqt_migration_manifest" ("key", "value") VALUES ('current', '${value.replace(/'/g, "''")}') ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`,
            'write migration manifest'
        )
    }

    async hasExistingData(): Promise<boolean> {
        const storage = this.storage as MonoStorage
        const tables = await storage.getExistingTables()
        const ignored = new Set(['_IDS_', '__interaqt_migration_manifest', '__interaqt_migration_log', '__interaqt_migration_lock'])
        for (const tableName of tables) {
            if (ignored.has(tableName)) continue
            const escaped = tableName.replace(/"/g, '""')
            const rows = await this.db.query<{ exists: number }>(
                `SELECT 1 AS "exists" FROM "${escaped}" LIMIT 1`,
                [],
                `migration check data ${tableName}`
            )
            if (rows.length > 0) return true
        }
        return false
    }

    async beginMigration(modelHash: string, approvedDiffHash?: string, approvedDiffSummary?: unknown, decisionCount = 0): Promise<MigrationRunState> {
        await this.ensureMigrationManifestTable()
        const dialect = getSchemaDialect(this.db).name
        const existing = await this.db.query<{ migrationId: string }>(
            dialect === 'mysql'
                ? `SELECT "migrationId" FROM "__interaqt_migration_lock" WHERE "key" = ? LIMIT 1`
                : `SELECT "migrationId" FROM "__interaqt_migration_lock" WHERE "key" = $1 LIMIT 1`,
            ['current'],
            'read migration lock'
        )
        if (existing[0]) {
            throw new Error(`Migration is already running: ${existing[0].migrationId}`)
        }
        const resumable = await this.db.query<{ id: string, phase: MigrationPhase, status: string }>(
            dialect === 'mysql'
                ? `SELECT "id", "phase", "status" FROM "__interaqt_migration_log" WHERE "modelHash" = ? AND COALESCE("approvedDiffHash", '') = ? AND "status" IN ('pending', 'failed') AND "phase" IN ('pending', 'schema-applied', 'computation-applied', 'constraints-applied', 'manifest-written') ORDER BY "updatedAt" DESC LIMIT 1`
                : `SELECT "id", "phase", "status" FROM "__interaqt_migration_log" WHERE "modelHash" = $1 AND COALESCE("approvedDiffHash", '') = $2 AND "status" IN ('pending', 'failed') AND "phase" IN ('pending', 'schema-applied', 'computation-applied', 'constraints-applied', 'manifest-written') ORDER BY "updatedAt" DESC LIMIT 1`,
            [modelHash, approvedDiffHash || ''],
            'read resumable migration'
        )
        if (resumable[0]) {
            await this.db.scheme(
                `INSERT INTO "__interaqt_migration_lock" ("key", "migrationId") VALUES ('current', '${resumable[0].id}')`,
                'acquire migration lock'
            )
            return { id: resumable[0].id, phase: resumable[0].phase }
        }
        const migrationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const now = new Date().toISOString()
        const summary = approvedDiffSummary === undefined ? null : JSON.stringify(approvedDiffSummary).replace(/'/g, "''")
        const escapedDiffHash = (approvedDiffHash || '').replace(/'/g, "''")
        await this.db.scheme(
            `INSERT INTO "__interaqt_migration_lock" ("key", "migrationId") VALUES ('current', '${migrationId}')`,
            'acquire migration lock'
        )
        await this.db.scheme(
            `INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "approvedDiffSummary", "decisionCount", "reviewedAt", "phase", "status", "createdAt", "updatedAt") VALUES ('${migrationId}', '${modelHash}', '${escapedDiffHash}', ${summary === null ? 'NULL' : `'${summary}'`}, ${decisionCount}, '${now}', 'pending', 'pending', '${now}', '${now}')`,
            'write migration log pending'
        )
        return { id: migrationId, phase: 'pending' }
    }

    async updateMigrationPhase(migrationId: string, phase: Exclude<MigrationPhase, 'pending' | 'succeeded' | 'failed'>): Promise<void> {
        await this.ensureMigrationManifestTable()
        const now = new Date().toISOString()
        await this.db.scheme(
            `UPDATE "__interaqt_migration_log" SET "phase" = '${phase}', "status" = 'pending', "updatedAt" = '${now}' WHERE "id" = '${migrationId}'`,
            `migration log ${phase}`
        )
    }

    async finishMigration(migrationId: string, status: 'succeeded' | 'failed', error?: unknown): Promise<void> {
        await this.ensureMigrationManifestTable()
        const now = new Date().toISOString()
        const errorMessage = error === undefined ? null : String(error instanceof Error ? error.message : error).replace(/'/g, "''")
        await this.db.scheme(
            `UPDATE "__interaqt_migration_log" SET "status" = '${status}', "error" = ${errorMessage === null ? 'NULL' : `'${errorMessage}'`}, "updatedAt" = '${now}' WHERE "id" = '${migrationId}'`,
            'finish migration log'
        )
        await this.db.scheme(
            `DELETE FROM "__interaqt_migration_lock" WHERE "key" = 'current' AND "migrationId" = '${migrationId}'`,
            'release migration lock'
        )
    }

    async isMigrationOperationComplete(migrationId: string | undefined, operationKey: string): Promise<boolean> {
        await this.ensureMigrationManifestTable()
        return (this.storage as MonoStorage).isMigrationOperationComplete(migrationId, operationKey)
    }

    async markMigrationOperationComplete(migrationId: string | undefined, operationKey: string): Promise<void> {
        await this.ensureMigrationManifestTable()
        await (this.storage as MonoStorage).markMigrationOperationComplete(migrationId, operationKey)
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

    private prepareEntitiesForStorage(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[]) {
        // Use RefContainer to handle cloning and reference updates
        const container = new RefContainer(originalEntities, originalRelations);

        // Get cloned entities and relations with all references automatically updated
        const { entities, relations } = container.getAll();

        // Process states to inject properties into entities/relations
        states.forEach(({state}) => {
            Object.entries(state).forEach(([, stateItem]) => {
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

        return {
            entities: [...entities, DictionaryEntity, SystemEntity],
            relations,
        }
    }

    async prepareMigrationSchema(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[]) {
        const { entities, relations } = this.prepareEntitiesForStorage(originalEntities, originalRelations, states)
        const plan = await (this.storage as MonoStorage).prepareMigrationAdditive(
            entities,
            relations,
        )
        ;(plan.internal as { states?: ComputationState[] }).states = states
        plan.postRecomputeDDL.push(...this.createTransformUniqueIndexOperations(plan, states))
        return plan
    }

    async applyMigrationSchema(plan: MigrationSchemaPlan, migrationId?: string) {
        await (this.storage as MonoStorage).applyMigrationAdditivePlan(plan, migrationId)
    }

    async applyMigrationPostSchema(plan: MigrationSchemaPlan, migrationId?: string) {
        await (this.storage as MonoStorage).applyPostRecomputeSchemaPlan(plan, migrationId)
    }

    async verifyMigrationSchema(plan: MigrationSchemaPlan, migrationId?: string) {
        await (this.storage as MonoStorage).verifyMigrationPlan(plan, migrationId)
    }

    async migrateSchema(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[]) {
        const { entities, relations } = this.prepareEntitiesForStorage(originalEntities, originalRelations, states)
        const plan = await (this.storage as MonoStorage).prepareMigrationAdditive(
            entities,
            relations,
        )
        ;(plan.internal as { states?: ComputationState[] }).states = states
        await (this.storage as MonoStorage).applyMigrationAdditivePlan(plan)
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
            const dialect = getSchemaDialect(storage.db)
            await storage.db.scheme(
                createUniqueIndexSQL(indexName, recordInfo.table, [sourceRecordIdField, transformIndexField], dialect),
                `setup transform unique index ${recordName}`
            )
        }
    }

    private createTransformUniqueIndexOperations(plan: MigrationSchemaPlan, states: ComputationState[]): AdditiveDDLOperation[] {
        const dbSetup = (plan.internal as { dbSetup?: DBSetup }).dbSetup
        if (!dbSetup) return []
        const tableMap = new EntityToTableMap(dbSetup.map, dbSetup.aliasManager)
        const dialect = getSchemaDialect((this.storage as MonoStorage).db)
        return states.flatMap(({ dataContext, state }) => {
            const sourceRecordId = state.sourceRecordId
            const transformIndex = state.transformIndex
            if (
                !(sourceRecordId instanceof RecordBoundState) ||
                !(transformIndex instanceof RecordBoundState) ||
                (sourceRecordId as any).unique === false ||
                (dataContext.type !== 'entity' && dataContext.type !== 'relation')
            ) {
                return []
            }

            const recordName = dataContext.id.name!
            const recordInfo = tableMap.getRecordInfo(recordName)
            const [, sourceRecordIdField] = tableMap.getTableAliasAndFieldName([recordName], sourceRecordId.key, true)
            const [, transformIndexField] = tableMap.getTableAliasAndFieldName([recordName], transformIndex.key, true)
            const indexName = `idx_transform_${this.hashIdentifier(`${recordInfo.table}_${sourceRecordIdField}_${transformIndexField}`)}`
            return [{
                kind: 'create-constraint' as const,
                sql: createUniqueIndexSQL(indexName, recordInfo.table, [sourceRecordIdField, transformIndexField], dialect),
                tableName: recordInfo.table,
                logicalPath: `${recordName}.${sourceRecordId.key}.${transformIndex.key}`,
                description: `migration setup transform unique index ${recordName}`,
            }]
        })
    }
    async destroy() {
        await this.storage.destroy()
    }
}
