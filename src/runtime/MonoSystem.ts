import {
    ComputationState,
    Database,
    DatabaseLogger,
    RecordMutationCallback,
    RecordMutationEvent,
    Storage,
    System,
    SYSTEM_RECORD,
    SystemEntity,
    SystemLogger,
    SystemLogType
} from "./System.js";
import { createClass, Property, EntityInstance, RelationInstance, Entity, Relation, RefContainer } from "@shared";
import {
    DBSetup,
    EntityQueryHandle,
    EntityToTableMap,
    MatchExp,
    MatchExpressionData,
    RawEntityData
} from '@storage';
import { SQLiteDB } from "./SQLite.js";
import pino from "pino";
import { RecordBoundState } from "./computations/Computation.js";

function JSONStringify(value:any) {
    return encodeURI(JSON.stringify(value))
}

function JSONParse(value: string) {
    return value === undefined ? undefined : JSON.parse(decodeURI(value))
}


class MonoStorage implements Storage{
    public map!: DBSetup["map"]
    public queryHandle?: EntityQueryHandle
    constructor(public db: Database) {
    }
    public callbacks: Set<RecordMutationCallback> = new Set()
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
    async set(concept: string, key: string, value:any, events?: RecordMutationEvent[]) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const origin = await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value'])
        if (origin) {
            return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [SYSTEM_RECORD, match, { concept, key: key.toString(), value: JSONStringify(value)}], events)
        } else {
            return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [SYSTEM_RECORD, { concept, key: key.toString(), value: encodeURI(JSON.stringify(value))}], events)
        }
    }
    async setup(entities: EntityInstance[], relations: RelationInstance[], createTables = false) {
        await this.db.open(createTables)
        const dbSetup = new DBSetup(
            entities as any, 
            relations as any, 
            this.db
        )
        if (createTables) await dbSetup.createTables()
        this.queryHandle = new EntityQueryHandle( new EntityToTableMap(dbSetup.map), this.db)

        this.map = dbSetup.map
    }
    findOne(...arg:Parameters<EntityQueryHandle["findOne"]>) {
        return this.queryHandle!.findOne(...arg)
    }
    find(...arg:Parameters<EntityQueryHandle["find"]>) {
        return this.queryHandle!.find(...arg)
    }
    create(entityName: string, rawData: RawEntityData, events?: RecordMutationEvent[]) {
        return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [entityName, rawData], events)
    }
    update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]) {
        return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [entity, matchExpressionData, rawData], events)
    }
    delete(entityName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]) {
        return this.callWithEvents(this.queryHandle!.delete.bind(this.queryHandle), [entityName, matchExpressionData], events)
    }
    async callWithEvents<T extends any[]>(method: (...arg: [...T, RecordMutationEvent[]]) => any, args: T, events: RecordMutationEvent[] = []) {
        const result = await method(...args, events)
        // FIXME 还没有实现异步机制
        // nextJob(() => {
        //     this.dispatch(events)
        // })
        // CAUTION 特别注意这里会空充 events
        const  newEvents = await this.dispatch(events)
        events.push(...newEvents)
        return result
    }
    findRelationByName(...arg:Parameters<EntityQueryHandle["findRelationByName"]>) {
        return this.queryHandle!.findRelationByName(...arg)
    }
    findOneRelationByName(...arg: Parameters<EntityQueryHandle["findOneRelationByName"]>) {
        return this.queryHandle!.findOneRelationByName(...arg)
    }
    updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[] ) {
        return this.callWithEvents(this.queryHandle!.updateRelationByName.bind(this.queryHandle), [relationName, matchExpressionData, rawData], events)
    }
    removeRelationByName(relationName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]) {
        return this.callWithEvents(this.queryHandle!.removeRelationByName.bind(this.queryHandle), [relationName, matchExpressionData], events)
    }
    addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {}, events?: RecordMutationEvent[]) {
        return this.callWithEvents(this.queryHandle!.addRelationByNameById.bind(this.queryHandle), [relationName, sourceEntityId, targetEntityId, rawData], events)
    }
    getRelationName(...arg:Parameters<EntityQueryHandle["getRelationName"]>) {
        return this.queryHandle!.getRelationName(...arg)
    }
    getEntityName(...arg:Parameters<EntityQueryHandle["getEntityName"]>) {
        return this.queryHandle!.getEntityName(...arg)
    }
    listen(callback: RecordMutationCallback) {
        this.callbacks.add(callback)
    }
    async dispatch(events: RecordMutationEvent[]) {
        const newEvents: RecordMutationEvent[] = []
        for(let callback of this.callbacks) {
            const callbackResult = (await callback(events)) as {events?: RecordMutationEvent[]}
            if (callbackResult?.events) {
                newEvents.push(...callbackResult.events)
            }
        }
        return newEvents
    }
    destroy() {
        return this.db.close()
    }
}




// Define log levels for database logger
export enum DBLogLevel {
    ERROR = 0,
    INFO = 1,
}

export class DBConsoleLogger implements DatabaseLogger{
    constructor(private level: DBLogLevel = DBLogLevel.ERROR) {}
    
    info({type, name, sql, params}: Parameters<DatabaseLogger["info"]>[0]) {
        if (this.level >= DBLogLevel.INFO) {
            console.log({type, name, sql, params})
        }
    }
    error({type, name, sql, params, error}: Parameters<DatabaseLogger["error"]>[0]) {
        if (this.level >= DBLogLevel.ERROR) {
            console.error({type, name, sql, params, error})
        }
    }
    child() {
        return new DBConsoleLogger(this.level)
    }
}

// Define log levels for system logger
export enum SystemLogLevel {
    MUTE = -1,
    ERROR = 0,
    INFO = 1,
    DEBUG = 2,
}

export class SystemConsoleLogger implements SystemLogger{
    constructor(private level: SystemLogLevel = SystemLogLevel.ERROR) {}
    
    error({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.ERROR) {
            console.error(`[ERROR] ${label}: ${message}`, rest)
        }
    }
    info({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.INFO) {
            console.info(`[INFO] ${label}: ${message}`, rest)
        }
    }
    debug({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.DEBUG) {
            console.debug(`[DEBUG] ${label}: ${message}`, rest)
        }
    }
    child(fixed: object) {
        return new SystemConsoleLogger(this.level)
    }
}
export const dbPinoLogger = pino()
export const dbConsoleLogger = new DBConsoleLogger()
export const systemConsoleLogger = new SystemConsoleLogger()

export class MonoSystem implements System {
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    storage: Storage
    constructor(db: Database = new SQLiteDB(undefined,{logger: dbConsoleLogger}), public logger: SystemLogger = systemConsoleLogger) {
        this.storage = new MonoStorage(db)
    }
    
    setup(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[], install = false){
        // Use RefContainer to handle cloning and reference updates
        const container = new RefContainer(originalEntities, originalRelations);
        
        // Get cloned entities and relations with all references automatically updated
        const { entities, relations } = container.getAll();
        
        // Process states to inject properties into entities/relations
        states.forEach(({dataContext, state}) => {
            Object.entries(state).forEach(([stateName, stateItem]) => {
                if (stateItem instanceof RecordBoundState) { 
                    if (!stateItem.record) {
                        return;
                    }
                    let rootEntity: EntityInstance|RelationInstance | undefined = container.getEntityByName(stateItem.record);
                    if (!rootEntity) {
                        rootEntity = container.getRelationByName(stateItem.record);
                    }
                    if (!rootEntity) {
                        throw new Error(`Entity or Relation not found: ${stateItem.record}`);
                    }

                    // 考虑 filtered entity 和 filtered relation 的级联问题，这里要找到根
                    while ((rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation) {
                        rootEntity = (rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation!
                    }

                    if (stateItem.defaultValue instanceof Property) {
                        // CAUTION 特别注意这里改了 name
                        stateItem.defaultValue.name = stateItem.key
                        rootEntity.properties.push(stateItem.defaultValue)
                    } else {
                        const defaultValuetype = typeof stateItem.defaultValue
                        rootEntity.properties.push(Property.create({
                            name: stateItem.key,
                            type: defaultValuetype,
                            // 应该系统定义
                            collection: Array.isArray(stateItem.defaultValue),
                            defaultValue: () => stateItem.defaultValue
                        }))
                    }
                }
            })
        })

        
        // Pass the prepared entities to storage.setup
        return this.storage.setup(
            [...entities, SystemEntity], 
            relations,
            install
        )
    }
    destroy() {
        this.storage.destroy()
    }
}
