import SQLite from "better-sqlite3";
import {Database, EntityIdRef, ROW_ID_ATTR} from "./System.js";
import chalk from 'chalk';

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

export type SQLiteDBOptions = Parameters<typeof SQLite>[1] & {log: SQLiteDB['log']}
export type SQLiteDBLog = {type: string, name: string, sql: string, params?: any[]}

function defaultLog({type, name, sql, params}: Parameters<SQLiteDB['log']>[0]) {
    const color = type === 'delete' ? chalk.bgRed.black :
        type === 'insert' ? chalk.bgYellow.black:
            type === 'update'? chalk.bgYellowBright.black:
                type === 'query' ? chalk.bgGreen.black:
                    chalk.bgBlue.white


    console.log(`${color(`[${type}:${name}] `)} 
${sql} 
${color(`params: [${params?.map(x => JSON.stringify(x)).join(',')}]`)} 
`)
}

export class SQLiteDB implements Database{
    db!: InstanceType<typeof SQLite>
    idSystem!: IDSystem
    log: (msg: SQLiteDBLog) => any
    constructor(public file:string = ':memory:', public options?: SQLiteDBOptions) {
        this.idSystem = new IDSystem(this)
        this.log = this.options?.log || defaultLog
    }
    async open() {
        this.db = new SQLite(this.file, this.options)
        await this.idSystem.setup()
    }
    async query<T extends any>(sql:string, where: any[] =[], name= '')  {
        const params = where.map(x => x===false ? 0 : x===true ? 1 : x)
        this.log({
            type:'query',
            name,
            sql,
            params
        })
        return  this.db.prepare(sql).all(...params) as T[]
    }
    async update(sql:string,values: any[], idField?:string, name='') {
        const finalSQL = `${sql} ${idField ? `RETURNING ${idField} AS id`: ''}`
        const params = values.map(x => x===false ? 0 : x===true ? 1 : x)
        this.log({
            type:'update',
            name,
            sql:finalSQL,
            params
        })
        return this.db.prepare(finalSQL).run(...params)  as unknown as any[]
    }
    async insert (sql:string, values:any[], name='')  {
        if (!name) debugger
        const params = values.map(x => x===false ? 0 : x===true ? 1 : x)
        this.log({
            type:'insert',
            name,
            sql,
            params
        })
        return  this.db.prepare(`${sql} RETURNING ${ROW_ID_ATTR}`).run(...params) as unknown as EntityIdRef
    }
    async delete (sql:string, where: any[], name='') {
        const params = where.map(x => x===false ? 0 : x===true ? 1 : x)
        this.log({
            type:'delete',
            name,
            sql,
            params
        })
        return this.db.prepare(sql).run(...params) as unknown as  any[]
    }
    async scheme(sql: string, name='') {
        this.log({
            type:'scheme',
            name,
            sql,
        })
        return this.db.prepare(sql).run()
    }
    close() {
        this.db.close()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
}