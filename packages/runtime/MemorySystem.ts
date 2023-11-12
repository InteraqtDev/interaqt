import {RecordChangeListener, RecordMutationEvent, Storage, System, SYSTEM_RECORD} from "./System";
import {InteractionEvent} from '../types/interaction'
import {createClass, KlassInstanceOf} from "@shared/createClass";
import {Entity, Property, Relation} from "@shared/entity/Entity";
import {DBSetup} from '@storage/erstorage/Setup'
import {EntityQueryHandle} from '@storage/erstorage/EntityQueryHandle'
import {MatchExp, MatchExpressionData} from '@storage/erstorage/MatchExp'
import {RawEntityData} from '@storage/erstorage/NewRecordData'
import {EntityToTableMap} from '@storage/erstorage/EntityToTableMap'
import {SQLiteDB} from "./SQLite";
import {MutationEvent} from "@storage/erstorage/RecordQueryAgent";


class MemoryStorage implements Storage{
    data = new Map<string, Map<string, any>>()
    db = new SQLiteDB()
    public queryHandle?: EntityQueryHandle
    public callbacks: Set<RecordChangeListener> = new Set()
    public dbSetup?: DBSetup
    // CAUTION kv 结构数据的实现也用 er。这是系统约定，因为也需要  Record 事件！！！
    // async get(concept: string, key: string, initialValue?: any) {
    //     let res = this.data.get(concept)!.get(key)
    //     if (initialValue && !res) this.data.get(concept)!.set(key, (res = initialValue))
    //     return res
    // }
    // async set(concept: string, key: string, value:any) {
    //     let conceptData = this.data.get(concept)
    //     if (!conceptData) this.data.set(concept, (conceptData = new Map()))
    //     return await Promise.resolve().then(() => {
    //         conceptData!.set(key, value)
    //     })
    // }
    async get(concept: string, key: string, initialValue?: any) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const value = (await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value']))?.value
        if (value === undefined) return initialValue

        return JSON.parse(decodeURI(value))
    }
    async set(concept: string, key: string, value:any) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const origin = await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value'])
        if (origin) {
            // CAUtION 之类一定是用 this 上的方法才有事件
            return this.update(SYSTEM_RECORD, match,{ concept, key: key.toString(), value: encodeURI(JSON.stringify(value))})
        } else {
            return this.create(SYSTEM_RECORD, { concept, key: key.toString(), value: encodeURI(JSON.stringify(value))})
        }
    }
    async setup(entities: KlassInstanceOf<typeof Entity, false>[], relations: KlassInstanceOf<typeof Relation, false>[]) {
        const systemEntity = Entity.create({
            name: SYSTEM_RECORD,
            properties: [
                Property.create({
                    name: 'concept',
                    type: 'string',
                    collection: false,
                }),
                Property.create({
                    name: 'key',
                    type: 'string',
                    collection: false,
                }),
                Property.create({
                    name: 'value',
                    type: 'string',
                    collection: false,
                })
            ]
        })
        await this.db.open()
        this.dbSetup = new DBSetup([...entities, systemEntity], relations, this.db)
        await this.dbSetup.createTables()
        this.queryHandle = new EntityQueryHandle( new EntityToTableMap(this.dbSetup.map), this.db)
    }
    findOne(...arg:Parameters<EntityQueryHandle["findOne"]>) {
        return this.queryHandle!.findOne(...arg)
    }
    find(...arg:Parameters<EntityQueryHandle["find"]>) {
        return this.queryHandle!.find(...arg)
    }
    create(entityName: string, rawData: RawEntityData) {
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
    // FIXME 应该移出去，由 Relation 自己写成 computedData。这样动态获取没有必要
    getRelationNameByDef(relation:Parameters<DBSetup["getRelationName"]>[0]) {
        return this.dbSetup?.getRelationName(relation)!
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
