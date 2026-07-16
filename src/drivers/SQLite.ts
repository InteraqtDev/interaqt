import SQLite from "better-sqlite3";
// CAUTION drivers 是发布包的独立子入口（interaqt/drivers），只能从主入口 "interaqt" 导入：
//  路径别名（@storage 等）在消费者环境不存在，且共享单例（asyncInteractionContext）必须与主包同源。
import {Database, DatabaseLogger, EntityIdRef, ROW_ID_ATTR, asyncInteractionContext, InteractionContext, dbConsoleLogger, TransactionCapability, sqliteEncodeLiteral} from "interaqt";

class IDSystem {
    constructor(public db: Database) {}
    async setup() {
        await this.db.scheme(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
        // 原子 UPSERT 依赖 name 上的唯一索引；IF NOT EXISTS 同时兼容旧版建出的无约束 _IDS_ 表。
        await this.db.scheme(`CREATE UNIQUE INDEX IF NOT EXISTS "_IDS__name_unique" ON _IDS_ (name)`)
    }
    /**
     * 计数器与存量数据对账（r28 记录项，r32 收口；与 PG 驱动 setupSequences 同一契约）：
     * setup(false) attach 到已有数据而 _IDS_ 计数器缺失/落后（手工导入、备份恢复、跨库
     * 搬迁）时，getAutoId 会从 1 重发号——SQLite 的逻辑 id 列没有唯一索引，重复 id 是
     * **静默**数据损坏（同一逻辑 id 两行），不是 PK 冲突。
     * 只向前推进（MAX(last, 存量最大 id)），绝不回拨。
     */
    async setupSequences(records: Array<{ recordName: string, tableName: string, idField: string }>) {
        const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`
        for (const record of records) {
            const rows = await this.db.query<{ max: number | null }>(
                `SELECT COALESCE(MAX(${quote(record.idField)}), 0) AS max FROM ${quote(record.tableName)}`,
                [],
                `read max id for ${record.recordName}`
            )
            const maxExistingId = Number(rows[0]?.max ?? 0)
            if (maxExistingId >= 1) {
                await this.db.query(
                    `INSERT INTO _IDS_ (name, last) VALUES (?, ?)
ON CONFLICT(name) DO UPDATE SET last = MAX(last, excluded.last)
RETURNING last`,
                    [record.recordName, maxExistingId],
                    `reconcile id counter for ${record.recordName}`
                )
            }
        }
    }
    async getAutoId(recordName: string) {
        // CAUTION 原子 UPSERT：此前的「SELECT 再 INSERT/UPDATE」读-改-写在并发下会分配重复 id；
        //  recordName 一律走参数绑定（与 PostgreSQL 驱动的参数化路径一致）。
        const rows = await this.db.query<{ last: number }>(
            `INSERT INTO _IDS_ (name, last) VALUES (?, 1)
ON CONFLICT(name) DO UPDATE SET last = last + 1
RETURNING last`,
            [recordName],
            `allocate next id for ${recordName}`
        )
        return rows[0].last as unknown as string
    }
}

export type SQLiteDBOptions = Parameters<typeof SQLite>[1] & { logger :DatabaseLogger }

export class SQLiteDB implements Database{
    db!: InstanceType<typeof SQLite>
    idSystem!: IDSystem
    logger: DatabaseLogger
    supportsSelectForUpdate = false
    // SQLite 的 SQLITE_MAX_VARIABLE_NUMBER 自 3.32 起默认 32766；留出安全余量。
    maxQueryParams = 32000
    transactionCapability: TransactionCapability = {
        transactions: true,
        isolationLevels: ['READ COMMITTED', 'SERIALIZABLE'],
        transactionBoundConnection: false,
        concurrentTransactions: 'unsupported',
        nestedStrategy: 'reuse',
        notes: [
            'SQLite uses MonoStorage fallback transaction metadata for retry paths and does not provide PostgreSQL-level concurrent dispatch isolation.'
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
        name: 'sqlite' as const,
        maxIdentifierLength: 63,
        supportsCreateIndexIfNotExists: true,
        enforceMaxIdentifierLength: false,
        encodeLiteral: sqliteEncodeLiteral,
        constraints: { unique: true, filteredUnique: true, nonNull: false },
    }
    constructor(public file:string = ':memory:', public options?: SQLiteDBOptions) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || dbConsoleLogger
    }
    async open(forceDrop = false) {
        // CAUTION open/openForSchemaRead 必须幂等复用已有连接（与 PG 的 `if (this.pool)` /
        //  MySQL 的 `if (this.db) return` 同构）：better-sqlite3 的每个 `new SQLite(':memory:')`
        //  都是独立的空库。setup(true) 之后的 manifest 校验 / 迁移路径（setup(false)、
        //  generateMigrationDiff → openForSchemaRead / open(false)）若无条件 new，会把
        //  this.db 替换成全新空库——已建的表、数据、manifest 全部"消失"（旧连接成孤儿），
        //  文件库则泄漏连接句柄。
        if (!this.db || !this.db.open) {
            this.db = new SQLite(this.file, this.options)
        }
        // CAUTION forceDrop 必须真正清空已有表：与 PG/PGLite 的 forceDrop 语义（重建）一致。
        if (forceDrop) {
            const tables = this.db.prepare(
                `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
            ).all() as Array<{ name: string }>
            for (const table of tables) {
                this.db.prepare(`DROP TABLE IF EXISTS "${table.name.replace(/"/g, '""')}"`).run()
            }
        }
        await this.idSystem.setup()
    }
    async openForSchemaRead() {
        if (this.db && this.db.open) return
        this.db = new SQLite(this.file, this.options)
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
    "scope" JSON NOT NULL,
    "lastValue" NUMERIC NOT NULL,
    PRIMARY KEY ("sequenceName", "scopeKey")
)`, 'setup scoped sequence table')
    }
    async query<T>(sql:string, where: unknown[] =[], name= '')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})

        const params = where.map(x => x===false ? 0 : x===true ? 1 : x)
        logger.info({
            type:'query',
            name,
            sql,
            params
        })
        return  this.db.prepare(sql).all(...params) as T[]
    }
    async update(sql:string,values: unknown[], idField?:string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const finalSQL = `${sql} ${idField ? `RETURNING ${idField} AS id`: ''}`
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) : x===false ? 0 : x===true ? 1 : x
        })
        logger.info({
            type:'update',
            name,
            sql:finalSQL,
            params
        })
        // CAUTION better-sqlite3 对 RETURNING 语句必须用 .all() 才能取回行；
        //  .run() 只返回 {changes, lastInsertRowid}，与 PostgreSQL/PGLite 驱动的返回行契约不一致。
        if (idField) {
            return this.db.prepare(finalSQL).all(...params) as unknown as EntityIdRef[]
        }
        return this.db.prepare(finalSQL).run(...params)  as unknown as EntityIdRef[]
    }
    async insert (sql:string, values:unknown[], name='')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) : x===false ? 0 : x===true ? 1 : x
        })
        logger.info({
            type:'insert',
            name,
            sql,
            params
        })
        // CAUTION better-sqlite3 对 RETURNING 语句必须用 .all() 才能取回行；
        //  .run() 只返回 {changes, lastInsertRowid}，这些元数据会被上层 Object.assign 进创建的记录，
        //  与 PostgreSQL/PGLite 驱动（返回 RETURNING 行）的契约不一致。
        const rows = this.db.prepare(`${sql} RETURNING ${ROW_ID_ATTR}`).all(...params) as unknown as EntityIdRef[]
        return rows[0]
    }
    async delete<T> (sql:string, where: unknown[], name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const params = where.map(x => x===false ? 0 : x===true ? 1 : x)
        logger.info({
            type:'delete',
            name,
            sql,
            params
        })
        return this.db.prepare(sql).run(...params) as unknown as T[]
    }
    async scheme(sql: string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        logger.info({
            type:'scheme',
            name,
            sql,
        })
        return this.db.prepare(sql).run()
    }
    async close() {
        // CAUTION close 必须幂等（r26 I-4）：二次 close 不得抛错。
        // better-sqlite3：已关闭的 Database.open === false；二次 close 会抛错。
        if (!this.db || !this.db.open) return
        try {
            this.db.close()
        } catch {
            // already closed
        }
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
    async setupRecordSequences(records: Array<{ recordName: string, tableName: string, idField: string }>) {
        return this.idSystem.setupSequences(records)
    }
    parseMatchExpression(key: string, value:[string, string], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue: (v: string) => string, p: () => string) {
        // CAUTION 方言必须识别自己 mapToDBFieldType 产出的全部 json fieldType 形态（r25 I-1）：
        //  本驱动把 type:'json' 映射为大写 'JSON'，但按小写归一比较与其余驱动/MatchExp 保持同构，
        //  防止未来映射面扩展时再次分裂。
        if (fieldType.toLowerCase() === 'json') {
            if (value[0].toLowerCase() === 'contains') {
                return {
                    fieldValue: `NOT NULL AND EXISTS (
    SELECT 1
    FROM json_each(${fieldName})
    WHERE json_each.value = ${p()}
)`,
                    fieldParams: [value[1]]
                }
            }
        }
    }
    mapToDBFieldType(type: string, collection?: boolean) {
        if (type === 'pk') {
            return 'INTEGER PRIMARY KEY'
        } else if (type === 'id') {
            return 'INT'
        } else if (collection || type === 'object'||type==='json') {
            return 'JSON'
        } else if (type === 'string') {
            return 'TEXT'
        } else if (type === 'boolean') {
            return 'INT(2)'
        } else if(type === 'number'){
            // CAUTION SQLite 是动态类型（type affinity）：INT 亲和的列写入 2.5 仍原样存为 REAL，
            //  不会像 PG/MySQL 的 INT 那样报错或截断，所以 number 在 SQLite 上没有精度问题。
            //  保持 INT 声明是为了既有部署的 schema/manifest 兼容（改声明会触发迁移 diff）。
            return "INT"
        }else if(type === 'timestamp'){
            return "INT"
        }else{
            return type
        }
    }
}