import {System, Storage, Database, EntityIdRef} from "./System";
import { InteractionEvent } from '../types/interaction'
import {createClass, KlassInstanceOf} from "../shared/createClass";
import {Entity, Relation} from "../shared/entity/Entity";
import { DBSetup } from '../storage/erstorage/Setup'
import { Database as SQLite } from "bun:sqlite";
import { EntityQueryHandle } from '../storage/erstorage/ERStorage'
import { EntityToTableMap } from '../storage/erstorage/EntityToTableMap'
import {SQLiteDB} from "./BunSQLite";

let id = 0



class MemoryStorage implements Storage{
    data = new Map<string, Map<string, any>>()
    db = new SQLiteDB()
    public queryHandle: EntityQueryHandle
    // kv 结构
    get(conceptName: string, id: string, initialValue?: any) {
        let res = this.data.get(conceptName)!.get(id)
        if (initialValue && !res) this.data.get(conceptName)!.set(id, (res = initialValue))
        return res
    }
    set(conceptName: string, id: string, value:any) {
        let conceptData = this.data.get(conceptName)
        if (!conceptData) this.data.set(conceptName, (conceptData = new Map()))
        conceptData.set(id, value)
    }
    async setup(entities: KlassInstanceOf<typeof Entity, false>[], relations: KlassInstanceOf<typeof Relation, false>[]) {
        const setup = new DBSetup(entities, relations, this.db)
        await setup.createTables()
        this.queryHandle = new EntityQueryHandle( new EntityToTableMap(setup.map), this.db)
    }
    findOne(...arg) {
        return this.queryHandle.findOne(...arg)
    }
    find(entityName:string, ...arg) {
        return this.queryHandle.find(entityName, ...arg)
    }
    create(entityName:string, data: any) {
        return this.queryHandle.create(entityName, data)
    }

}

export class MemorySystem implements System {
    eventStack: InteractionEvent[] = []
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    saveEvent(event: InteractionEvent) {
        this.eventStack.push(event)
        return true
    }
    getEvent(query: { [k:string]: any} = {} ) {
        return this.eventStack.filter(e => {
            return Object.keys(query).every(k => e[k] === query[k])
        })
    }
    util = {
        uuid() {
            return (++id).toString()
        }
    }
    storage = new MemoryStorage()

}
