/// <reference types="data0" />

import {
    ACTIVITY_RECORD,
    Database,
    EVENT_RECORD,
    RecordChangeListener,
    RecordMutationEvent,
    Storage,
    System,
    SYSTEM_RECORD, SystemLogger
} from "./System.js";
import {InteractionEvent} from './types/interaction.js'
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
import {SQLiteDB} from "./SQLite.js";
import winston, {format} from "winston";
const { combine, timestamp, label, printf } = format;
import chalk from "chalk";


function JSONStringify(value:any) {
    return encodeURI(JSON.stringify(value))
}

function JSONParse(value: string) {
    return value === undefined ? undefined : JSON.parse(decodeURI(value))
}


class MonoStorage implements Storage{
    public queryHandle?: EntityQueryHandle
    constructor(public db: Database) {
    }
    public callbacks: Set<RecordChangeListener> = new Set()
    beginTransaction(name='') {
        return this.db.scheme('BEGIN', name)
    }
    commitTransaction(name='') {
        return this.db.scheme('COMMIT', name)
    }
    rollbackTransaction(name='') {
        return this.db.scheme('ROLLBACK', name)
    }
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
    async setup(entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], createTables = false) {
        await this.db.open()
        const dbSetup = new DBSetup(entities, relations, this.db)
        if (createTables) await dbSetup.createTables()
        this.queryHandle = new EntityQueryHandle( new EntityToTableMap(dbSetup.map), this.db)
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



// state 等系统配置数据的实体化
// FIXME 应该独立到外部
export const systemEntity = Entity.create({
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
export const eventEntity = Entity.create({
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
export const activityEntity = Entity.create({
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

const printLine = printf(({ level, message, label, timestamp }) => {
    return `${chalk.bgBlack.white(timestamp)} ${level === 'error' ? chalk.bgRed.white(level.padEnd(6, ' ')) : chalk.bgBlue.white(level.padEnd(6, ' '))} ${chalk.bgCyan.black(label.padEnd(11, ' '))} : ${message}`;
});

const defaultLogger = winston.createLogger({
    level: 'silly',
    transports: [
        new winston.transports.Console({
            format:combine(
                timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                printLine
            ),
        }),
    ]
})

export class MonoSystem implements System {
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    storage: Storage
    constructor(db: Database = new SQLiteDB(), public logger: SystemLogger = defaultLogger) {
        this.storage = new MonoStorage(db)
    }
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
    setup(entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], install = false){
        return this.storage.setup([...entities, systemEntity, eventEntity, activityEntity], relations, install)
    }
}
