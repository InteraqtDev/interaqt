import {Database, DatabaseLogger, EntityIdRef, asyncInteractionContext, InteractionContext, dbConsoleLogger, TransactionCapability, defaultEncodeLiteral} from "interaqt";
import mysql, {type Connection, type ConnectionOptions, RowDataPacket} from 'mysql2/promise'

class IDSystem {
    constructor(public db: Database) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        const lastId =  (await this.db.query<{last: number}>( `SELECT last FROM "_IDS_" WHERE name = '${recordName}'`, [], `finding last id of ${recordName}` ))[0]?.last
        const newId = (lastId || 0) +1
        const name =`set last id for ${recordName}: ${newId}`
        if (lastId === undefined) {
            await this.db.scheme(`INSERT INTO "_IDS_" (name, last) VALUES ('${recordName}', ${newId})`, name)
        } else {
            await this.db.update(`UPDATE "_IDS_" SET last = ? WHERE name = ?`, [newId, recordName], undefined, name)
        }
        return newId as unknown as string
    }
}

export type MysqlDBConfig = Omit<ConnectionOptions, 'database'> & { logger? :DatabaseLogger }

export class MysqlDB implements Database{
    idSystem!: IDSystem
    logger: DatabaseLogger
    db!: Connection
    // MySQL 8.0+ 支持 SELECT ... FOR UPDATE OF <alias>
    supportsSelectForUpdate = true
    transactionCapability: TransactionCapability = {
        transactions: false,
        isolationLevels: [],
        transactionBoundConnection: false,
        concurrentTransactions: 'unsupported',
        nestedStrategy: 'unsupported',
        notes: [
            'The current MySQL driver has no transaction-bound connection implementation; strong dispatch transactions are unsupported.'
        ],
    }
    schemaDialect = {
        name: 'mysql' as const,
        maxIdentifierLength: 64,
        supportsCreateIndexIfNotExists: false,
        encodeLiteral: defaultEncodeLiteral,
        constraints: { unique: false, filteredUnique: false, nonNull: false },
    }
    constructor(public database:string, public options: MysqlDBConfig = {}) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || dbConsoleLogger
    }
    async open(forceDrop = false) {
        // 第一条连接不带默认库，仅用于检查/创建目标库；用完必须关闭（否则每次 open 泄漏一条连接）。
        const bootstrapConnection = await mysql.createConnection({
            ...this.options,
        })
        await bootstrapConnection.connect()
        try {
            const [rows] = await bootstrapConnection.query(`SHOW DATABASES LIKE '${this.database}'`)
            if ((rows as RowDataPacket[]).length === 0) {
                await bootstrapConnection.query(`CREATE DATABASE ${this.database}`)
            } else if (forceDrop) {
                await bootstrapConnection.query(`DROP DATABASE ${this.database}`)
                await bootstrapConnection.query(`CREATE DATABASE ${this.database}`)
            }
        } finally {
            await bootstrapConnection.end()
        }

        // CAUTION 无论目标库是已有还是刚创建，工作连接都必须显式带上 database，
        //  否则后续 scheme/query 跑在没有默认库的连接上，首次建库启动即失败。
        this.db = await mysql.createConnection({
            ...this.options,
            database: this.database
        })
        await this.db.connect()
        await this.db.query(`SET sql_mode='ANSI_QUOTES'`)

        await this.idSystem.setup()

    }
    async openForSchemaRead() {
        if (this.db) return
        // Strict dry-run schema planning should not create databases or
        // initialize framework tables such as _IDS_.
        this.db = await mysql.createConnection({
            ...this.options,
            database: this.database
        })
        await this.db.connect()
        await this.db.query(`SET sql_mode='ANSI_QUOTES'`)
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
        return  (await this.db.query(sql, params))[0] as T[]
    }
    async update<T>(sql:string,values: unknown[], idField?:string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        // CAUTION MySQL 不支持 UPDATE ... RETURNING，无法履行 idField 返回契约。
        //  这里如实记录并执行原始 SQL；调用方（storage 层）不依赖 update 的返回行。
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) : x===false ? 0 : x===true ? 1 : x
        })
        logger.info({
            type:'update',
            name,
            sql,
            params
        })
        return  (await this.db.query(sql, params))[0] as T[]
    }
    async insert(sql:string, values:unknown[], name='')  {
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

        await this.db.query(sql, params)
        const [rows] = (await this.db.query(`SELECT LAST_INSERT_ID();`))
        const insertedId = (rows as RowDataPacket[])[0]['LAST_INSERT_ID()']
        return {id: insertedId} as EntityIdRef
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
        return  (await this.db.query(sql, params))[0] as T[]
    }
    async scheme(sql: string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        logger.info({
            type:'scheme',
            name,
            sql,
        })
        return  await this.db.query(sql)
    }
    close() {
        return this.db.end()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
    parseMatchExpression(key: string, value:[string, string], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue: (v: string) => string, p: () => string) {
        if (fieldType === 'JSON') {
            if (value[0].toLowerCase() === 'contains') {
                const fieldNameWithQuotes = fieldName.split('.').map(x => `"${x}"`).join('.')
                // CAUTION 匹配值必须走参数绑定，不能字符串拼接进 SQL（否则存在 SQL 注入）。
                return {
                    fieldValue: `IS NOT NULL AND JSON_CONTAINS(${fieldNameWithQuotes}, ${p()}, '$')`,
                    fieldParams: [JSON.stringify(value[1])]
                }
            }
        }
    }

    getPlaceholder() {
        return () => {
            return '?'
        }
    }
    mapToDBFieldType(type: string, collection?: boolean) {
        if (type === 'pk') {
            return 'INT AUTO_INCREMENT PRIMARY KEY'
        } else if (type === 'id') {
            return 'INT'
        } else if (collection || type === 'object') {
            return 'JSON'
        } else if (type === 'string') {
            return 'TEXT'
        } else if (type === 'boolean') {
            return 'INT(2)'
        } else if(type === 'number'){
            // CAUTION JS 的 number 是双精度浮点。映射成 INT 会让合法的小数值
            //  （例如内置 Average 计算的结果 sum/count）在写入时直接报错。
            return "DOUBLE"
        }else if(type === 'timestamp'){
            return "TIMESTAMP"
        }else{
            return type
        }
    }
}