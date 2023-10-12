import { Database as SQLite } from "bun:sqlite";
import {Database, EntityIdRef, ID_ATTR, ROW_ID_ATTR} from "./System";

export class SQLiteDB implements Database{
    db: SQLite
    ids = new Map<string, number>
    constructor(public file:string = ':memory:', public options?: ConstructorParameters<typeof SQLite>[1]) {
        this.db = new SQLite(file, options)
    }
    query= (sql:string, name='') => {
        console.log(`query==============${name}`)
        console.log(sql)
        const result = this.db.query(sql).all() as any[]
        return Promise.resolve(result)
    }
    update = (sql:string, idField?:string, name='') => {
        console.log(`update=============${name}`)
        // console.log(sql)
        const result = this.db.query(`${sql} RETURNING ${ROW_ID_ATTR} ${idField ? `, ${idField} AS id`: ''}`).all() as any[]
        return Promise.resolve(result)
    }
    insert= (sql:string, name='') => {
        console.log(`insert==============${name}`)
        // console.log(`${sql} RETURNING ${ROW_ID_ATTR}`)
        const result = this.db.query(`${sql} RETURNING ${ROW_ID_ATTR}`).get() as EntityIdRef
        return Promise.resolve( result as EntityIdRef)
    }
    delete= (sql:string, name='') => {
        console.log(`delete==============${name}`)
        // console.log(sql)
        const result = this.db.query(sql).all() as any[]
        return Promise.resolve(result)
    }
    scheme = (sql: string) => {
        console.log(`scheme=============`)
        // console.log(sql)
        return Promise.resolve(this.db.query(sql).run())
    }
    close() {
        return Promise.resolve(this.db.close())
    }
    getAutoId(recordName: string) {
        if(!this.ids.get(recordName)) this.ids.set(recordName, 0)
        const lastId = this.ids.get(recordName)!
        const newId = lastId+1
        this.ids.set(recordName, newId)
        return Promise.resolve(newId as unknown as string)
    }
}