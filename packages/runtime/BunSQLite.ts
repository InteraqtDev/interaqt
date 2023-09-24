import { Database as SQLite } from "bun:sqlite";
import {Database, EntityIdRef} from "./System";

export class SQLiteDB implements Database{
    db: SQLite
    constructor(public file:string = ':memory:', public options?: Parameters<typeof SQLite>[1]) {
        this.db = new SQLite(file, options)
    }
    query= (sql:string) => {
        console.log('query', sql)
        const result = this.db.query(sql).all() as any[]
        return Promise.resolve(result)
    }
    update = (sql:string) => {
        console.log('update', sql)
        const result = this.db.query(`${sql} RETURNING id`).all() as any[]
        return Promise.resolve(result)
    }
    insert= (sql:string) => {
        console.log('insert', `${sql} RETURNING id`)
        const { id } = this.db.query(`${sql} RETURNING id`).get()
        return Promise.resolve( {id} as EntityIdRef)
    }
    scheme = (sql: string) => {
        console.log(sql)
        return Promise.resolve(this.db.query(sql).run())
    }
    close() {
        return Promise.resolve(this.db.close())
    }
}