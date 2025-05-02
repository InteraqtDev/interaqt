import {Database, DatabaseLogger, EntityIdRef} from "./System.js";
import mysql, {type Connection, type ConnectionOptions, RowDataPacket} from 'mysql2/promise'
import {asyncInteractionContext} from "./asyncInteractionContext.js";
import pino from "pino";
import {InteractionContext} from "./Controller";

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
    constructor(public database:string, public options: MysqlDBConfig = {}) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || pino()
    }
    async open(forceDrop = false) {
        const options = {...this.options}
        delete options.logger
        this.db = await mysql.createConnection({
            ...this.options,
        })
        await this.db.connect()
        const [rows] = await this.db.query(`SHOW DATABASES LIKE '${this.database}'`)
        if ((rows as RowDataPacket[]).length === 0) {
            await this.db.query(`CREATE DATABASE ${this.database}`)
        } else {
            if (forceDrop) {
                await this.db.query(`DROP DATABASE ${this.database}`)
                await this.db.query(`CREATE DATABASE ${this.database}`)
            }
            this.db = await mysql.createConnection({
                ...this.options,
                database: this.database
            })
            await this.db.connect()
        }
        await this.db.query(`SET sql_mode='ANSI_QUOTES'`)

        await this.idSystem.setup()

    }
    async query<T extends any>(sql:string, where: any[] =[], name= '')  {
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
    async update<T extends any>(sql:string,values: any[], idField?:string, name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const finalSQL = `${sql} ${idField ? `RETURNING "${idField}" AS id`: ''}`
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) : x===false ? 0 : x===true ? 1 : x
        })
        logger.info({
            type:'update',
            name,
            sql:finalSQL,
            params
        })
        return  (await this.db.query(sql, params))[0] as T[]
    }
    async insert(sql:string, values:any[], name='')  {
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
    async delete<T extends any> (sql:string, where: any[], name='') {
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
                return {
                    fieldValue: `IS NOT NULL AND JSON_CONTAINS(${fieldNameWithQuotes}, '${JSON.stringify(value[1])}', '$')`,
                    fieldParams: []
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
            return "INT"
        }else if(type === 'timestamp'){
            return "TIMESTAMP"
        }else{
            return type
        }
    }
}