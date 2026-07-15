import {Database, DatabaseLogger, EntityIdRef, ROW_ID_ATTR, asyncInteractionContext, InteractionContext, dbConsoleLogger, TransactionCapability, defaultEncodeLiteral} from "interaqt";
import { PGlite} from '@electric-sql/pglite'
import { uuidv7 } from "@interaqt/uuidv7";

class IDSystem {
    constructor(public db: Database) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS "_IDS_" (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        return uuidv7()
    }
}

export type PGLiteDBConfig = { logger? :DatabaseLogger }

export class PGLiteDB implements Database{
    idSystem!: IDSystem
    logger: DatabaseLogger
    db: InstanceType<typeof PGlite>
    supportsSelectForUpdate = true
    // PostgreSQL wire protocol 的绑定参数数量是 Int16（65535）；留出安全余量。
    maxQueryParams = 65000
    // PGlite 返回已解析的 JSON 列值（对象/数组/字符串原值），读路径不得再 JSON.parse。
    returnsParsedJSON = true
    transactionCapability: TransactionCapability = {
        transactions: true,
        isolationLevels: ['READ COMMITTED', 'SERIALIZABLE'],
        transactionBoundConnection: false,
        concurrentTransactions: 'unsupported',
        nestedStrategy: 'reuse',
        notes: [
            'PGLite uses MonoStorage fallback BEGIN/COMMIT; SERIALIZABLE is framework metadata for retry-path tests, not a production PostgreSQL isolation guarantee.'
        ],
    }
    atomicSequenceCapability = {
        requiresActiveTransaction: true as const,
        transactional: true,
        crossConnection: false,
        crossProcess: false,
        returning: true,
        productionSafe: false,
    }
    schemaDialect = {
        name: 'postgres' as const,
        maxIdentifierLength: 63,
        supportsCreateIndexIfNotExists: true,
        enforceMaxIdentifierLength: true,
        encodeLiteral: defaultEncodeLiteral,
        constraints: { unique: true, filteredUnique: true, nonNull: true },
    }
    constructor(public database?:string, public options: PGLiteDBConfig = {}) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || dbConsoleLogger
        this.db = new PGlite(this.database)
    }
    async open(forceDrop = false) {
        // PGLite doesn't support CREATE/DROP DATABASE commands
        // When forceDrop is true, we'll drop all existing tables instead
        
        if (forceDrop) {
            // Get all table names except system tables
            const tables = await this.db.query<{tablename: string}>(`
                SELECT tablename FROM pg_tables 
                WHERE schemaname = 'public' 
                AND tablename NOT LIKE 'pg_%'
                AND tablename NOT LIKE 'sql_%'
            `)
            
            // Drop each table
            for (const table of tables.rows) {
                await this.db.query(`DROP TABLE IF EXISTS "${table.tablename}" CASCADE`)
            }
        }

        await this.idSystem.setup()
    }
    async openForSchemaRead() {
        // PGLite is constructed with an open in-memory database. Avoid the
        // normal open() path here because it initializes framework tables.
    }
    async setupInternalComputationState() {
        await this.scheme(`
CREATE TABLE IF NOT EXISTS "_ComputationState_" (
    "key" TEXT PRIMARY KEY,
    "numberValue" NUMERIC NULL,
    "booleanValue" BOOLEAN NULL,
    "stringValue" TEXT NULL,
    "jsonValue" JSON NULL
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
    async query<T>(sql:string, params: unknown[] =[], name= '')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})

        logger.info({
            type:'query',
            name,
            sql,
            params
        })
        try {
            return (await this.db.query(sql, params)).rows as T[]
        } catch (error: unknown) {
            logger.error({
                type:'query',
                name,
                sql,
                params,
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }
    async update<T>(sql:string,values: unknown[], idField?:string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const finalSQL = `${sql} ${idField ? `RETURNING "${idField}" AS id`: ''}`
        // CAUTION Date 必须原样交给驱动绑定（timestamp 列的方言可绑定形态，r26 契约）。
        //  JSON.stringify(Date) 产出**带引号**的字符串，能否被接受完全依赖 PG datetime
        //  解析器对双引号的历史容忍——与 MySQL 驱动（r26 已排除 Date）同一契约。
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null && !(x instanceof Date)) ? JSON.stringify(x) : x
        })
        logger.info({
            type:'update',
            name,
            sql:finalSQL,
            params
        })
        return  (await this.db.query(finalSQL, params)).rows as T[]
        
    }
    async insert(sql:string, values:unknown[], name='')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        // Date 原样绑定（同 update 的 CAUTION）。
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null && !(x instanceof Date)) ? JSON.stringify(x) :  x
        })
        logger.info({
            type:'insert',
            name,
            sql,
            params
        })

        const finalSQL = `${sql} RETURNING "${ROW_ID_ATTR}"`
        try {
            return (await this.db.query(finalSQL, params)).rows[0] as EntityIdRef
        } catch (error: unknown) {
            logger.error({
                type:'insert',
                name,
                sql: finalSQL,
                params,
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }
    async delete<T> (sql:string, params: unknown[], name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        logger.info({
            type:'delete',
            name,
            sql,
            params
        })
        return  (await this.db.query(sql, params)).rows as T[]
        
    }
    async scheme(sql: string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        logger.info({
            type:'scheme',
            name,
            sql,
        })
        try {
            return await this.db.query(sql)
        } catch (error: unknown) {
            logger.error({
                type:'scheme',
                name,
                sql,
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }
    private closed = false
    async close() {
        // CAUTION close 必须幂等（r26 I-4）：二次 close 不得抛错。
        if (this.closed || !this.db) return
        this.closed = true
        try {
            await this.db.close()
        } catch {
            // already closed
        }
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
    parseMatchExpression(key: string, value:[string, string], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue: (v: string) => string, p: () => string) {
        if (fieldType.toLowerCase() === 'json') {
            if (value[0].toLowerCase() === 'contains') {
                const fieldNameWithQuotes = fieldName.split('.').map(x => `"${x}"`).join('.')
                return {
                    fieldValue: `IS NOT NULL AND ${p()} = ANY (SELECT json_array_elements_text(${fieldNameWithQuotes}))`,
                    fieldParams: [value[1]]
                }
            }
            // json 类型没有 = / != 操作符（"operator does not exist: json = unknown"），
            // 转成 jsonb 做语义相等比较（对键序不敏感）。NULL 行不参与匹配，与标量列的 =/!= 语义一致。
            if (value[0] === '=' || value[0] === '!=') {
                const fieldNameWithQuotes = fieldName.split('.').map(x => `"${x}"`).join('.')
                return {
                    fieldValue: `IS NOT NULL AND ${fieldNameWithQuotes}::jsonb ${value[0]} ${p()}::jsonb`,
                    fieldParams: [JSON.stringify(value[1])]
                }
            }
            // IN / NOT IN 与 =/!= 同理：逐元素做 jsonb 语义比较。NULL 行不参与匹配。
            const lowerOp = value[0].toLowerCase()
            if ((lowerOp === 'in' || lowerOp === 'not in') && Array.isArray(value[1]) && value[1].length > 0) {
                const fieldNameWithQuotes = fieldName.split('.').map(x => `"${x}"`).join('.')
                const placeholders = (value[1] as unknown[]).map(() => `${p()}::jsonb`).join(',')
                return {
                    fieldValue: `IS NOT NULL AND ${fieldNameWithQuotes}::jsonb ${lowerOp === 'in' ? 'IN' : 'NOT IN'} (${placeholders})`,
                    fieldParams: (value[1] as unknown[]).map(item => JSON.stringify(item))
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
            return 'SERIAL PRIMARY KEY'
        } else if (type === 'id') {
            return 'UUID'
        } else if (collection || type === 'object') {
            return 'JSON'
        } else if (type === 'string') {
            return 'TEXT'
        } else if (type === 'boolean') {
            return 'BOOL'
        } else if(type === 'number'){
            // CAUTION JS 的 number 是双精度浮点。映射成 INT 会让合法的小数值
            //  （例如内置 Average 计算的结果 sum/count）在写入时直接报错。
            return "DOUBLE PRECISION"
        }else if(type === 'timestamp'){
            return "TIMESTAMP"
        }else{
            return type
        }
    }
}