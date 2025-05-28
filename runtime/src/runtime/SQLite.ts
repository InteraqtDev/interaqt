import SQLite from "better-sqlite3";
import {Database, DatabaseLogger, EntityIdRef, ROW_ID_ATTR} from "./System.js";
import {asyncInteractionContext} from "./asyncInteractionContext.js";
import pino from "pino";
import {InteractionContext} from "./Controller";

class IDSystem {
    constructor(public db: Database) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        const lastId =  (await this.db.query<{last: number}>( `SELECT last FROM _IDS_ WHERE name = '${recordName}'`, [], `finding last id of ${recordName}` ))[0]?.last
        const newId = (lastId || 0) +1
        const name =`set last id for ${recordName}: ${newId}`
        if (lastId === undefined) {
            await this.db.scheme(`INSERT INTO _IDS_ (name, last) VALUES ('${recordName}', ${newId})`, name)
        } else {
            await this.db.update(`UPDATE _IDS_ SET last = ? WHERE name = ?`, [newId, recordName], undefined, name)
        }
        return newId as unknown as string
    }
}

export type SQLiteDBOptions = Parameters<typeof SQLite>[1] & { logger :DatabaseLogger }

export class SQLiteDB implements Database{
    db!: InstanceType<typeof SQLite>
    idSystem!: IDSystem
    logger: DatabaseLogger
    constructor(public file:string = ':memory:', public options?: SQLiteDBOptions) {
        this.idSystem = new IDSystem(this)
        this.logger = this.options?.logger || pino()
    }
    async open() {
        this.db = new SQLite(this.file, this.options)
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
        return  this.db.prepare(sql).all(...params) as T[]
    }
    async update(sql:string,values: any[], idField?:string, name='') {
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
        return this.db.prepare(finalSQL).run(...params)  as unknown as any[]
    }
    async insert (sql:string, values:any[], name='')  {
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
        return  this.db.prepare(`${sql} RETURNING ${ROW_ID_ATTR}`).run(...params) as unknown as EntityIdRef
    }
    async delete (sql:string, where: any[], name='') {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const params = where.map(x => x===false ? 0 : x===true ? 1 : x)
        logger.info({
            type:'delete',
            name,
            sql,
            params
        })
        return this.db.prepare(sql).run(...params) as unknown as  any[]
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
        return this.db.close()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
    parseMatchExpression(key: string, value:[string, string], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue: (v: string) => string, p: () => string) {
        if (fieldType === 'JSON') {
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
            return "INT"
        }else if(type === 'timestamp'){
            return "INT"
        }else{
            return type
        }
    }
}