// import { Database as SQLite } from "sqlite3";
import SQLite from "better-sqlite3";
import {Database, EntityIdRef, ROW_ID_ATTR} from "./System.js";

class IDSystem {
    constructor(public db: Database) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        const lastId =  (await this.db.query<{last: number}>( `SELECT last FROM _IDS_ WHERE name = '${recordName}'`, [] ))[0]?.last
        const newId = (lastId || 0) +1
        if (lastId === undefined) {
            // FIXME 用上 insert 后  returning _rowid 有问题？
            await this.db.scheme(`INSERT INTO _IDS_ (name, last) VALUES ('${recordName}', ${newId})`)
        } else {
            await this.db.update(`UPDATE _IDS_ SET last = ? WHERE name = ?`, [newId, recordName])
        }
        return newId as unknown as string
    }
}

export class SQLiteDB implements Database{
    db!: InstanceType<typeof SQLite>
    idSystem!: IDSystem
    constructor(public file:string = ':memory:', public options?: Parameters<typeof SQLite>[1]) {
        this.idSystem = new IDSystem(this)
    }
    async open() {
        this.db = new SQLite(this.file, this.options)
        await this.idSystem.setup()
    }
    async query<T extends any>(sql:string, where: any[] =[], name= '')  {
        console.log(`query==============${name}`)
        // console.log(sql)
        const finalValues = where.map(x => x===false ? 0 : x===true ? 1 : x)
        return  this.db.prepare(sql).all(...finalValues) as T[]
    }
    async update(sql:string,values: any[], idField?:string, name='') {
        console.log(`update=============${name}`)
        const finalSQL = `${sql} ${idField ? `RETURNING ${idField} AS id`: ''}`
        const finalValues = values.map(x => x===false ? 0 : x===true ? 1 : x)
        return this.db.prepare(finalSQL).run(...finalValues)  as unknown as any[]
    }
    async insert (sql:string, values:any[], name='')  {
        console.log(`insert==============${name}`)
        // console.log(`${sql} RETURNING ${ROW_ID_ATTR}`)
        const finalValues = values.map(x => x===false ? 0 : x===true ? 1 : x)
        return  this.db.prepare(`${sql} RETURNING ${ROW_ID_ATTR}`).run(...finalValues) as unknown as EntityIdRef
    }
    async delete (sql:string, where: any[], name='') {
        console.log(`delete==============${name}`)
        // console.log(sql)
        const finalValues = where.map(x => x===false ? 0 : x===true ? 1 : x)
        return this.db.prepare(sql).run(...finalValues) as unknown as  any[]
    }
    async scheme(sql: string) {
        console.log(`scheme=============`)
        // console.log(sql)
        return this.db.prepare(sql).run()
    }
    close() {
        this.db.close()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
}