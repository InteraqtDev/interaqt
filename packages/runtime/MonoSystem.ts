import {
    ACTIVITY_RECORD,
    EVENT_RECORD,
    RecordChangeListener,
    RecordMutationEvent,
    Storage,
    System,
    SYSTEM_RECORD
} from "./System";
import {InteractionEvent} from './types/interaction'
import {createClass, Entity, KlassInstance, Property, Relation} from "@interaqt/shared";
import {
    DBSetup,
    EntityQueryHandle,
    EntityToTableMap,
    MatchExp,
    MatchExpressionData,
    MutationEvent,
    RawEntityData
} from '@interaqt/storage'
import {SQLiteDB} from "./SQLite";


function JSONStringify(value:any) {
    return encodeURI(JSON.stringify(value))
}

function JSONParse(value: string) {
    return value === undefined ? undefined : JSON.parse(decodeURI(value))
}

class MonoStorage implements Storage{
    db = new SQLiteDB()
    public queryHandle?: EntityQueryHandle
    public callbacks: Set<RecordChangeListener> = new Set()
    public dbSetup?: DBSetup
    // CAUTION kv 结构数据的实现也用 er。这是系统约定，因为也需要  Record 事件！
    async get(concept: string, key: string, initialValue?: any) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const value = (await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value']))?.value
        if (value === undefined) return initialValue

        return JSONParse(value)
    }
    async set(concept: string, key: string, value:any) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const origin = await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value'])
        if (origin) {
            // CAUtION 之类一定是用 this 上的方法才有事件
            return this.update(SYSTEM_RECORD, match,{ concept, key: key.toString(), value: JSONStringify(value)})
        } else {
            return this.create(SYSTEM_RECORD, { concept, key: key.toString(), value: encodeURI(JSON.stringify(value))})
        }
    }
    async setup(entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[]) {

        await this.db.open()
        this.dbSetup = new DBSetup(entities, relations, this.db)
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


// state 等系统配置数据的实体化
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

// event 的实体化
const eventEntity = Entity.create({
    name: EVENT_RECORD,
    properties: [
        Property.create({
            name: 'interactionId',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'interactionName',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'activityId',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'args',
            type: 'string',
            collection: false,
        })
    ]
})

// activity 数据
const activityEntity = Entity.create({
    name: ACTIVITY_RECORD,
    properties: [
        Property.create({
            name: 'name',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'uuid',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'state',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'refs',
            type: 'string',
            collection: false,
        })
    ]
})

export class MonoSystem implements System {
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    async saveEvent(event: InteractionEvent) {
        return this.storage.create(EVENT_RECORD, {...event, args: JSONStringify(event.args||{})})
    }
    async getEvent(query?: MatchExpressionData ) {
        return (await this.storage.find(EVENT_RECORD, query, undefined, ['*'])).map(event => ({
            ...event,
            args: JSONParse(event.args)
        })) as unknown as InteractionEvent[]
    }
    async createActivity(activity: any) {
        return this.storage.create(ACTIVITY_RECORD, {
            ...activity,
            state: JSONStringify(activity.state),
            refs: JSONStringify(activity.refs),
        })
    }
    async updateActivity(match: MatchExpressionData, activity: any) {
        const data = {
            ...activity
        }
        delete data.state
        delete data.refs
        if (activity.state) {
            data.state = JSONStringify(activity.state)
        }
        if (activity.refs) {
            data.refs = JSONStringify(activity.refs)
        }
        return this.storage.update(ACTIVITY_RECORD, match, data)
    }
    async getActivity(query?: MatchExpressionData) {
        return (await this.storage.find(ACTIVITY_RECORD, query, undefined, ['*'])).map(activity => ({
            ...activity,
            state: JSONParse(activity.state),
            refs: JSONParse(activity.refs),
        }))
    }
    setup(entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[]){


        return this.storage.setup([...entities, systemEntity, eventEntity, activityEntity], relations)
    }
    storage = new MonoStorage()
}
