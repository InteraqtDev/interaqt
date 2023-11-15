// import { Database as SQLite } from "sqlite3";
import { AsyncDatabase as SQLite } from "promised-sqlite3";
import {Database, EntityIdRef, ID_ATTR, ROW_ID_ATTR} from "./System";

export class SQLiteDB implements Database{
    db!: SQLite
    ids = new Map<string, number>
    constructor(public file:string = ':memory:', public options?: Parameters<typeof SQLite.open>[1]) {
    }
    async open() {
        this.db = await SQLite.open(this.file, this.options)
        // 这里处理？
        await this.createIDTable()
    }
    async query (sql:string, name= '')  {
        console.log(`query==============${name}`)
        // console.log(sql)
        return (await this.db.all(sql)) as unknown as any[]
    }
    async update(sql:string, idField?:string, name='') {
        console.log(`update=============${name}`)
        console.log(sql)
        return (await this.db.run(`${sql} RETURNING ${ROW_ID_ATTR} ${idField ? `, ${idField} AS id`: ''}`))  as unknown as any[]
    }
    async insert (sql:string, name='')  {
        console.log(`insert==============${name}`)
        console.log(`${sql} RETURNING ${ROW_ID_ATTR}`)
        return (await this.db.run(`${sql} RETURNING ${ROW_ID_ATTR}`)) as unknown as EntityIdRef
    }
    async delete (sql:string, name='') {
        console.log(`delete==============${name}`)
        console.log(sql)
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
    createIDTable() {
        return this.db.run(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
    }
    async getAutoId(recordName: string) {
        const lastId =  (await this.db.all( `SELECT last FROM _IDS_ WHERE name = '${recordName}'`))[0]?.last as unknown as number
        const newId = (lastId || 0) +1
        if (lastId === undefined) {
            await this.db.run(`INSERT INTO _IDS_ (name, last) VALUES ('${recordName}', ${newId})`)
        } else {
            await this.db.run(`UPDATE _IDS_ SET last = ${newId} WHERE name = '${recordName}'`)
        }
        return newId as unknown as string
    }
}