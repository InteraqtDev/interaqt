// import { Database as SQLite } from "sqlite3";
import {AsyncDatabase as SQLite} from "promised-sqlite3";
import {Database, EntityIdRef, ROW_ID_ATTR} from "./System.js";

class IDSystem {
    constructor(public db: Database) {}
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        const lastId =  (await this.db.query<{last: number}>( `SELECT last FROM _IDS_ WHERE name = '${recordName}'`))[0]?.last
        const newId = (lastId || 0) +1
        if (lastId === undefined) {
            // FIXME 用上 insert 后  returning _rowid 有问题？
            await this.db.query(`INSERT INTO _IDS_ (name, last) VALUES ('${recordName}', ${newId})`)
        } else {
            await this.db.query(`UPDATE _IDS_ SET last = ${newId} WHERE name = '${recordName}'`)
        }
        return newId as unknown as string
    }
}

export class SQLiteDB implements Database{
    db!: SQLite
    idSystem!: IDSystem
    constructor(public file:string = ':memory:', public options?: Parameters<typeof SQLite.open>[1]) {
        this.idSystem = new IDSystem(this)
    }
    async open() {
        this.db = await SQLite.open(this.file, this.options)
        await this.idSystem.setup()
    }
    async query<T extends any>(sql:string, name= '')  {
        console.log(`query==============${name}`)
        // console.log(sql)
        return (await this.db.all<T>(sql))
    }
    async update(sql:string, idField?:string, name='') {
        console.log(`update=============${name}`)
        console.log(sql)
        return (await this.db.run(`${sql} RETURNING ${ROW_ID_ATTR} ${idField ? `, ${idField} AS id`: ''}`))  as unknown as any[]
    }
    async insert (sql:string, name='')  {
        console.log(`insert==============${name}`)
        // console.log(`${sql} RETURNING ${ROW_ID_ATTR}`)
        return (await this.db.run(`${sql} RETURNING ${ROW_ID_ATTR}`)) as unknown as EntityIdRef
    }
    async delete (sql:string, name='') {
        console.log(`delete==============${name}`)
        // console.log(sql)
        return (await this.db.run(sql) ) as unknown as  any[]
    }
    scheme(sql: string) {
        console.log(`scheme=============`)
        // console.log(sql)
        return this.db.run(sql)
    }
    close() {
        return this.db.close()
    }
    async getAutoId(recordName: string) {
        return this.idSystem.getAutoId(recordName)
    }
}