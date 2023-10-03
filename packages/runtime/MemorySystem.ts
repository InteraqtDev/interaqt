import {System, Storage, Database, EntityIdRef} from "./System";
import { InteractionEvent } from '../types/interaction'
import {createClass, KlassInstanceOf} from "../shared/createClass";
import {Entity, Relation} from "../shared/entity/Entity";
import { DBSetup } from '../storage/erstorage/Setup'
import { Database as SQLite } from "bun:sqlite";
import { EntityQueryHandle } from '../storage/erstorage/ERStorage'
import { EntityToTableMap } from '../storage/erstorage/EntityToTableMap'
import {SQLiteDB} from "./BunSQLite";





class MemoryStorage implements Storage{
    data = new Map<string, Map<string, any>>()
    db = new SQLiteDB()
    public queryHandle?: EntityQueryHandle
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
    findOne(...arg:Parameters<EntityQueryHandle["findOne"]>) {
        return this.queryHandle!.findOne(...arg)
    }
    find(...arg:Parameters<EntityQueryHandle["find"]>) {
        return this.queryHandle!.find(...arg)
    }
    create(...arg:Parameters<EntityQueryHandle["create"]>) {
        return this.queryHandle!.create(...arg)
    }
    update(...arg:Parameters<EntityQueryHandle["update"]>) {
        return this.queryHandle!.update(...arg)
    }

    findRelationByName(...arg:Parameters<EntityQueryHandle["findRelationByName"]>) {
        return this.queryHandle!.findRelationByName(...arg)
    }
    findOneRelationByName(...arg: Parameters<EntityQueryHandle["findOneRelationByName"]>) {
        return this.queryHandle!.findOneRelationByName(...arg)
    }
    updateRelationByName(...arg:Parameters<EntityQueryHandle["updateRelationByName"]> ) {
        return this.queryHandle!.updateRelationByName(...arg)
    }
    removeRelationByName(...arg:Parameters<EntityQueryHandle["removeRelationByName"]>) {
        return this.queryHandle!.removeRelationByName(...arg)
    }
    addRelationByNameById(...arg:Parameters<EntityQueryHandle["addRelationByNameById"]>) {
        return this.queryHandle!.addRelationByNameById(...arg)
    }
    getRelationName(...arg:Parameters<EntityQueryHandle["getRelationName"]>) {
        return this.queryHandle!.getRelationName(...arg)
    }
}

type EventQuery = {
    interactionId?: string,
    activityId?: string,
}

let id = 0

export class MemorySystem implements System {
    eventStack: InteractionEvent[] = []
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    saveEvent(event: InteractionEvent) {
        this.eventStack.push(event)
        return Promise.resolve(true)
    }
    getEvent(query: EventQuery = {} ) {
        return Promise.resolve(this.eventStack.filter(e => {
            // @ts-ignore
            return Object.keys(query).every(k => e[k] === query[k])
        }))
    }
    util = {
        uuid() {
            return (++id).toString()
        }
    }
    storage = new MemoryStorage()

}
