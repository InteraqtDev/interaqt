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
import { createClass, Property, EntityInstance, RelationInstance, Entity, Relation } from "@shared";
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




export class DBConsoleLogger implements DatabaseLogger{
    info({type, name, sql, params}: Parameters<DatabaseLogger["info"]>[0]) {
        console.log({type, name, sql, params})
    }
    child() {
        return new DBConsoleLogger()
    }
}

export class SystemConsoleLogger implements SystemLogger{
    error({label, message, ...rest}: SystemLogType) {
        console.error(`[ERROR] ${label}: ${message}`, rest)
    }
    info({label, message, ...rest}: SystemLogType) {
        console.info(`[INFO] ${label}: ${message}`, rest)
    }
    debug({label, message, ...rest}: SystemLogType) {
        console.debug(`[DEBUG] ${label}: ${message}`, rest)
    }
    child(fixed: object) {
        return new SystemConsoleLogger()
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
        const originalEntityToClonedEntity = new Map<EntityInstance, EntityInstance>()
        const entities = originalEntities.map(entity => {
            const clonedEntity = Entity.clone(entity, true)
            originalEntityToClonedEntity.set(entity, clonedEntity)
            return clonedEntity
        })
        const originalRelationToClonedRelation = new Map<RelationInstance, RelationInstance>()
        const relations = originalRelations.map(relation => {
            const clonedRelation = Relation.clone(relation, true)
            originalRelationToClonedRelation.set(relation, clonedRelation)
            return clonedRelation
        })
        
        // 处理 filtered entity 和 filtered relation
        for(let entity of entities) {
            if (entity.baseEntity) {
                entity.baseEntity = originalEntityToClonedEntity.get(entity.baseEntity as EntityInstance)!
            }
        }
        for(let relation of relations) {
            if (relation.source) {
                relation.source = originalEntityToClonedEntity.get(relation.source as EntityInstance) || originalRelationToClonedRelation.get(relation.source as RelationInstance)!
            }
            if (relation.target) {
                relation.target = originalEntityToClonedEntity.get(relation.target as EntityInstance) || originalRelationToClonedRelation.get(relation.target as RelationInstance)!
            }
            // 处理 filtered relation 的 baseRelation
            if (relation.baseRelation) {
                relation.baseRelation = originalRelationToClonedRelation.get(relation.baseRelation as RelationInstance)!
            }
        }
        
        states.forEach(({dataContext, state}) => {
            Object.entries(state).forEach(([stateName, stateItem]) => {
                if (stateItem instanceof RecordBoundState) { 
                    // FIXME 因为一个 entity 可以有多个 filtered entity，所以未来还要考虑 state key 重名问题。
                    let rootEntity: EntityInstance|RelationInstance = entities.find(entity => entity.name === stateItem.record)! || relations.find(entity => entity.name === stateItem.record)!

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
