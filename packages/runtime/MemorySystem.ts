import {System, Storage, Database, EntityIdRef, RecordMutationEvent, RecordChangeListener} from "./System";
import { InteractionEvent } from '../types/interaction'
import {createClass, KlassInstanceOf} from "../shared/createClass";
import {Entity, Relation} from "../shared/entity/Entity";
import { DBSetup } from '../storage/erstorage/Setup'
import {EntityQueryHandle} from '../storage/erstorage/EntityQueryHandle'
import {MatchExpressionData} from '../storage/erstorage/MatchExp'
import {RawEntityData} from '../storage/erstorage/NewRecordData'
import { EntityToTableMap } from '../storage/erstorage/EntityToTableMap'
import {SQLiteDB} from "./BunSQLite";
import { MutationEvent } from "../storage/erstorage/RecordQueryAgent";
import {nextJob} from "../shared/util";


class MemoryStorage implements Storage{
    data = new Map<string, Map<string, any>>()
    db = new SQLiteDB()
    public queryHandle?: EntityQueryHandle
    public callbacks: Set<RecordChangeListener> = new Set()
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
    create(entityName: string, rawData: RawEntityData,) {
        return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [entityName, rawData])
    }
    update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData,) {
        return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [entity, matchExpressionData, rawData])
    }
    delete(entityName: string, matchExpressionData: MatchExpressionData,) {
        return this.callWithEvents(this.queryHandle!.delete.bind(this.queryHandle), [entityName, matchExpressionData])
    }
    async callWithEvents<T extends any[]>(method: (...arg: [...T, MutationEvent[]]) => any, args: T) {
        const events: MutationEvent[] = []
        const result = await method(...args, events)
        // FIXME 还没有实现异步机制
        // nextJob(() => {
        //     this.dispatch(events)
        // })
        const recordMutationEvents = events.map(e => {
            // 区分 entity/relation
        })
        await this.dispatch(events)
        return result
    }
    findRelationByName(...arg:Parameters<EntityQueryHandle["findRelationByName"]>) {
        return this.queryHandle!.findRelationByName(...arg)
    }
    findOneRelationByName(...arg: Parameters<EntityQueryHandle["findOneRelationByName"]>) {
        return this.queryHandle!.findOneRelationByName(...arg)
    }
    updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData,  ) {
        return this.callWithEvents(this.queryHandle!.updateRelationByName.bind(this.queryHandle), [relationName, matchExpressionData, rawData])
    }
    removeRelationByName(relationName: string, matchExpressionData: MatchExpressionData,) {
        return this.callWithEvents(this.queryHandle!.removeRelationByName.bind(this.queryHandle), [relationName, matchExpressionData])
    }
    addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {},) {
        return this.callWithEvents(this.queryHandle!.addRelationByNameById.bind(this.queryHandle), [relationName, sourceEntityId, targetEntityId, rawData])
    }
    getRelationName(...arg:Parameters<EntityQueryHandle["getRelationName"]>) {
        return this.queryHandle!.getRelationName(...arg)
    }
    listen(callback: RecordChangeListener) {
        this.callbacks.add(callback)
    }
    async dispatch(events: RecordMutationEvent[]) {
        for(let callback of this.callbacks) {
            await callback(events)
        }
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
