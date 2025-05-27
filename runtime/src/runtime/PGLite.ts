import {Database, DatabaseLogger, EntityIdRef, ROW_ID_ATTR} from "./System.js";
import { PGlite} from '@electric-sql/pglite'
import {asyncInteractionContext} from "./asyncInteractionContext.js";
import pino from "pino";
import {InteractionContext} from "./Controller.js";

class IDSystem {
    constructor(public db: Database) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS "_IDS_" (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        const lastId =  (await this.db.query<{last: number}>( `SELECT last FROM "_IDS_" WHERE name = '${recordName}'`, [], `finding last id of ${recordName}` ))[0]?.last
        const newId = (lastId || 0) +1
        const name =`set last id for ${recordName}: ${newId}`
        if (lastId === undefined) {
            await this.db.scheme(`INSERT INTO "_IDS_" (name, last) VALUES ('${recordName}', ${newId})`, name)
        } else {
            await this.db.update(`UPDATE "_IDS_" SET last = $1 WHERE name = $2`, [newId, recordName], undefined, name)
        }
        return newId as unknown as string
    }
}

export type PGLiteDBConfig = { logger? :DatabaseLogger }

export class PGLiteDB implements Database{
    idSystem!: IDSystem
    logger: DatabaseLogger
    db: InstanceType<typeof PGlite>
    constructor(public database?:string, public options: PGLiteDBConfig = {}) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || pino()
        this.db = new PGlite(this.database)
    }
    async open(forceDrop = false) {
        // 要不要有存在 就删掉的？
        // SELECT 'DROP DATABASE your_database_name' WHERE EXISTS (SELECT FROM pg_database WHERE dataname = 'your_database_name');
        const databaseExist = await this.db.query(`SELECT FROM pg_database WHERE datname = '${this.database}'`)
        if (databaseExist.rows.length === 0) {
            await this.db.query(`CREATE DATABASE ${this.database}`)
        } else {
            if (forceDrop) {
                await this.db.query(`DROP DATABASE ${this.database}`)
                await this.db.query(`CREATE DATABASE ${this.database}`)
            }
            this.db = new PGlite(this.database)
        }

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
        return  (await this.db.query(sql, params)).rows as T[]
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
        return  (await this.db.query(sql, params)).rows as T[]
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

        const finalSQL = `${sql} RETURNING "${ROW_ID_ATTR}"`
        return (await this.db.query(finalSQL, params)).rows[0] as EntityIdRef
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
        return  await this.db.query(sql)
    }
    close() {
        return this.db.close()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
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