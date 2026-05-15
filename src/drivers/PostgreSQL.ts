import {Database, DatabaseLogger, EntityIdRef, ROW_ID_ATTR, asyncInteractionContext, InteractionContext, dbConsoleLogger, RequireSerializableRetry, TransactionCapability, TransactionOptions} from "interaqt";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import pg, { type ClientConfig, type PoolClient} from 'pg'
import { defaultEncodeLiteral } from "@storage";

const { Client, Pool } = pg

type TransactionContext = {
    client: PoolClient
    depth: number
    isolation: TransactionOptions['isolation']
}

class IDSystem {
    private initialized = new Set<string>()
    private recordToSequenceName = new Map<string, string>()
    constructor(public db: PostgreSQLDB) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS "_IDS_" (last INTEGER, name TEXT)`)
    }
    private sanitizeIdentifierPart(value: string) {
        const sanitized = value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '')
        return (sanitized || 'record').slice(0, 32)
    }
    sequenceName(recordName: string) {
        return this.sequenceNameForKey(recordName, recordName)
    }
    private sequenceNameForKey(key: string, displayName: string) {
        const hash = createHash('sha1').update(key).digest('hex').slice(0, 12)
        return `seq_${hash}_${this.sanitizeIdentifierPart(displayName)}`.slice(0, 63)
    }
    private quoteIdentifier(identifier: string) {
        return `"${identifier.replace(/"/g, '""')}"`
    }
    async setupSequences(records: Array<{ recordName: string, tableName: string, idField: string }>) {
        const idsTableExists = (await this.db.query<{ exists: string | null }>(
            `SELECT to_regclass($1) AS exists`,
            ['"_IDS_"'],
            'check legacy id table'
        ))[0]?.exists

        const sequenceMax = new Map<string, number>()
        for (const record of records) {
            const sequenceName = this.sequenceNameForKey(`${record.tableName}.${record.idField}`, record.tableName)
            this.recordToSequenceName.set(record.recordName, sequenceName)
            const quotedSequence = this.quoteIdentifier(sequenceName)
            await this.db.scheme(`CREATE SEQUENCE IF NOT EXISTS ${quotedSequence} START WITH 1`, `create sequence ${record.recordName}`)

            const tableRows = await this.db.query<{ max: number | string | null }>(
                `SELECT COALESCE(MAX("${record.idField}"), 0) AS max FROM ${this.quoteIdentifier(record.tableName)}`,
                [],
                `read max id for ${record.recordName}`
            )
            let legacyMax = 0
            if (idsTableExists) {
                const legacyRows = await this.db.query<{ last: number | string | null }>(
                    `SELECT COALESCE(MAX("last"), 0) AS last FROM "_IDS_" WHERE "name" = $1`,
                    [record.recordName],
                    `read legacy id for ${record.recordName}`
                )
                legacyMax = Number(legacyRows[0]?.last ?? 0)
            }
            const maxExistingId = Math.max(Number(tableRows[0]?.max ?? 0), legacyMax)
            sequenceMax.set(quotedSequence, Math.max(sequenceMax.get(quotedSequence) ?? 0, maxExistingId))
            this.initialized.add(record.recordName)
        }
        for (const [quotedSequence, maxExistingId] of sequenceMax) {
            if (maxExistingId >= 1) {
                await this.db.query(`SELECT setval($1::regclass, $2, true)`, [quotedSequence, maxExistingId], `set sequence ${quotedSequence}`)
            }
        }
    }
    async getAutoId(recordName: string) {
        if (!this.initialized.has(recordName)) {
            throw new Error(`PostgreSQL sequence for ${recordName} is not initialized. Run storage setup before creating records.`)
        }
        const sequenceName = this.recordToSequenceName.get(recordName) ?? this.sequenceName(recordName)
        const rows = await this.db.query<{ id: number | string }>(
            `SELECT nextval($1::regclass) AS id`,
            [this.quoteIdentifier(sequenceName)],
            `next id for ${recordName}`
        )
        return rows[0]!.id as unknown as string
    }
}

export type PostgreSQLDBConfig = Omit<ClientConfig, 'database'> & { logger? :DatabaseLogger }

export class PostgreSQLDB implements Database{
    idSystem!: IDSystem
    logger: DatabaseLogger
    db: InstanceType<typeof Client>
    pool?: InstanceType<typeof Pool>
    private transactionContext = new AsyncLocalStorage<TransactionContext>()
    supportsSelectForUpdate = true
    transactionCapability: TransactionCapability = {
        transactions: true,
        isolationLevels: ['READ COMMITTED', 'SERIALIZABLE'],
        transactionBoundConnection: true,
        concurrentTransactions: 'database',
        nestedStrategy: 'reuse',
    }
    atomicSequenceCapability = {
        requiresActiveTransaction: true as const,
        transactional: true,
        crossConnection: true,
        crossProcess: true,
        returning: true,
        productionSafe: true,
    }
    schemaDialect = {
        name: 'postgres' as const,
        maxIdentifierLength: 63,
        supportsCreateIndexIfNotExists: true,
        encodeLiteral: defaultEncodeLiteral,
        constraints: { unique: true, filteredUnique: true, nonNull: true },
    }
    constructor(public database:string, public options: PostgreSQLDBConfig = {}) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || dbConsoleLogger
        this.db = new Client({ ...options })
    }
    async open(forceDrop = false) {
        const adminClient = new Client({
            ...this.options,
        })
        await adminClient.connect()
        // 要不要有存在 就删掉的？
        // SELECT 'DROP DATABASE your_database_name' WHERE EXISTS (SELECT FROM pg_database WHERE dataname = 'your_database_name');
        const databaseExist = await adminClient.query(`SELECT FROM pg_database WHERE datname = $1`, [this.database])
        if (databaseExist.rows.length === 0) {
            await adminClient.query(`CREATE DATABASE "${this.database}"`)
        } else {
            if (forceDrop) {
                await adminClient.query(`DROP DATABASE "${this.database}" WITH (FORCE)`)
                await adminClient.query(`CREATE DATABASE "${this.database}"`)
            }
        }
        await adminClient.end()

        this.pool = new Pool({
            ...this.options,
            database: this.database
        })

        this.db = new Client({
            ...this.options,
            database: this.database
        })
    }
    async openForSchemaRead() {
        if (this.pool) return
        // Strict dry-run schema planning must only connect to the target
        // database. Database creation/drop and framework table setup belong to
        // the normal open/setup paths.
        this.pool = new Pool({
            ...this.options,
            database: this.database
        })

        this.db = new Client({
            ...this.options,
            database: this.database
        })
    }
    private getQueryable() {
        const context = this.transactionContext.getStore()
        if (context && context.depth > 0) return context.client
        if (!this.pool) {
            throw new Error(`PostgreSQL pool is not initialized. Call open() before querying.`)
        }
        return this.pool
    }
    async runInTransaction<T>(options: TransactionOptions, fn: () => Promise<T>): Promise<T> {
        const existing = this.transactionContext.getStore()
        if (existing && existing.depth > 0) {
            if (existing.isolation !== 'SERIALIZABLE' && (options.isolation ?? 'READ COMMITTED') === 'SERIALIZABLE') {
                throw new RequireSerializableRetry(`${options.name || 'nested transaction'} requires SERIALIZABLE isolation`)
            }
            existing.depth++
            try {
                return await fn()
            } finally {
                existing.depth--
            }
        }
        if (!this.pool) {
            throw new Error(`PostgreSQL pool is not initialized. Call open() before starting a transaction.`)
        }
        const isolation = options.isolation ?? 'READ COMMITTED'
        const client = await this.pool.connect()
        const context: TransactionContext = { client, depth: 1, isolation }
        let released = false
        try {
            await client.query(`BEGIN ISOLATION LEVEL ${isolation}`)
            const result = await this.transactionContext.run(context, fn)
            await client.query('COMMIT')
            return result
        } catch (error) {
            try {
                await client.query('ROLLBACK')
            } finally {
                client.release()
                released = true
            }
            throw error
        } finally {
            if (!released) {
                client.release()
            }
        }
    }
    async setupInternalComputationState() {
        await this.scheme(`
CREATE TABLE IF NOT EXISTS "_ComputationState_" (
    "key" TEXT PRIMARY KEY,
    "numberValue" NUMERIC NULL,
    "booleanValue" BOOLEAN NULL,
    "stringValue" TEXT NULL,
    "jsonValue" JSONB NULL
)`, 'setup computation state table')
    }
    async setupScopedSequenceState() {
        await this.scheme(`
CREATE TABLE IF NOT EXISTS "_ScopedSequence_" (
    "sequenceName" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "lastValue" NUMERIC NOT NULL,
    PRIMARY KEY ("sequenceName", "scopeKey")
)`, 'setup scoped sequence table')
    }
    async query<T>(sql:string, where: unknown[] =[], name= '')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})

        const params = where
        logger.info({
            type:'query',
            name,
            sql,
            params
        })
        return  (await this.getQueryable().query(sql, params)).rows as T[]
    }
    async update<T>(sql:string,values: unknown[], idField?:string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const finalSQL = `${sql} ${idField ? `RETURNING "${idField}" AS id`: ''}`
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) : x
        })
        logger.info({
            type:'update',
            name,
            sql:finalSQL,
            params
        })
        return  (await this.getQueryable().query(finalSQL, params)).rows as T[]
    }
    async insert(sql:string, values:unknown[], name='')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) : x
        })
        logger.info({
            type:'insert',
            name,
            sql,
            params
        })

        const finalSQL = `${sql} RETURNING "${ROW_ID_ATTR}"`
        return (await this.getQueryable().query(finalSQL, params)).rows[0] as EntityIdRef
    }
    async delete<T> (sql:string, where: unknown[], name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const params = where
        logger.info({
            type:'delete',
            name,
            sql,
            params
        })
        return  (await this.getQueryable().query(sql, params)).rows as T[]
    }
    async scheme(sql: string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        logger.info({
            type:'scheme',
            name,
            sql,
        })
        return  await this.getQueryable().query(sql)
    }
    close() {
        return this.pool ? this.pool.end() : this.db.end()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
    setupRecordSequences(records: Array<{ recordName: string, tableName: string, idField: string }>) {
        return this.idSystem.setupSequences(records)
    }
    parseMatchExpression(key: string, value:[string, string], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue: (v: string) => string, p: () => string) {
        if (fieldType === 'JSON') {
            if (value[0].toLowerCase() === 'contains') {
                const fieldNameWithQuotes = fieldName.split('.').map(x => `"${x}"`).join('.')
                return {
                    fieldValue: `IS NOT NULL AND ${p()} = ANY (SELECT json_array_elements_text(${fieldNameWithQuotes}))`,
                    fieldParams: [value[1]]
                }
            }
        }
    }

    getPlaceholder() {
        let index = 0
        return () => {
            index++
            return `$${index}`
        }
    }
    mapToDBFieldType(type: string, collection?: boolean) {
        if (type === 'pk') {
            return 'INT GENERATED ALWAYS AS IDENTITY'
        } else if (type === 'id') {
            return 'INT'
        } else if (collection || type === 'object') {
            return 'JSON'
        } else if (type === 'string') {
            return 'TEXT'
        } else if (type === 'boolean') {
            return 'BOOLEAN'
        } else if(type === 'number'){
            return "INT"
        }else if(type === 'timestamp'){
            return "TIMESTAMP"
        }else{
            return type
        }
    }
}