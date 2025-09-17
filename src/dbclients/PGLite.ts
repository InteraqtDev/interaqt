import {Database, DatabaseLogger, EntityIdRef, ROW_ID_ATTR, asyncInteractionContext, InteractionContext, dbConsoleLogger} from "interaqt";
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
    async query<T extends any>(sql:string, params: any[] =[], name= '')  {
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
        } catch (error: any) {
            logger.error({
                type:'query',
                name,
                sql,
                params,
                error: error.message
            })
            throw error
        }
    }
    async update<T extends any>(sql:string,values: any[], idField?:string, name='') {
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
        return  (await this.db.query(sql, params)).rows as T[]
        
    }
    async insert(sql:string, values:any[], name='')  {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        const params = values.map(x => {
            return (typeof x === 'object' && x !==null) ? JSON.stringify(x) :  x
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
        } catch (error: any) {
            logger.error({
                type:'insert',
                name,
                sql: finalSQL,
                params,
                error: error.message
            })
            throw error
        }
    }
    async delete<T extends any> (sql:string, params: any[], name='') {
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
        } catch (error: any) {
            logger.error({
                type:'scheme',
                name,
                sql,
                error: error.message
            })
            throw error
        }
    }
    close() {
        return this.db.close()
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
            return "INT"
        }else if(type === 'timestamp'){
            return "TIMESTAMP"
        }else{
            return type
        }
    }
}