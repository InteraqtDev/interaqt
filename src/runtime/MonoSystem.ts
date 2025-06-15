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
    SystemLogger
} from "./System.js";
import { INTERACTION_RECORD} from "./ActivityManager.js";
import { InteractionEvent } from './InteractionCall.js';
import { createClass, Entity, KlassInstance, Property, Relation } from "@shared";
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
import { RecordBoundState, RelationBoundState } from "./computedDataHandles/Computation.js";
import { PropertyDataContext } from "./computedDataHandles/ComputedDataHandle.js";
import { assert } from "./util.js";

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
    async setup(entities: KlassInstance<typeof Entity>[], relations: KlassInstance<typeof Relation>[], createTables = false) {
        await this.db.open()
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
            const callbackResult = await callback(events)
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



export const defaultLogger = pino()
export class ConsoleLogger implements DatabaseLogger{
    info({type, name, sql, params}: Parameters<DatabaseLogger["info"]>[0]) {
        console.log({type, name, sql, params})
    }
    child() {
        return new ConsoleLogger()
    }
}

export class MonoSystem implements System {
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    storage: Storage
    constructor(db: Database = new SQLiteDB(undefined,{logger: new ConsoleLogger()}), public logger: SystemLogger = defaultLogger) {
        this.storage = new MonoStorage(db)
    }
    async saveEvent(event: InteractionEvent, mutationEvents: RecordMutationEvent[] = []): Promise<any> {
        return this.storage.create(INTERACTION_RECORD, event, mutationEvents)
    }
    async getEvent(query?: MatchExpressionData ) {
        return (await this.storage.find(INTERACTION_RECORD, query, undefined, ['*'])).map(event => ({
            ...event,
        })) as unknown as InteractionEvent[]
    }
    
    setup(entities: KlassInstance<typeof Entity>[], relations: KlassInstance<typeof Relation>[], states: ComputationState[], install = false){
        // Create a type that matches what DBSetup expects
        type DBSetupEntityType = KlassInstance<typeof Entity> & { isRef?: boolean };
        
        // Function to ensure entities have the required properties
        const prepareEntity = (entity: KlassInstance<typeof Entity>): DBSetupEntityType => {
            const entityAny = entity as any;
            if (entityAny.isRef === undefined) {
                entityAny.isRef = false;
            }
            return entityAny as DBSetupEntityType;
        };
        
        // Prepare all entities including system entities
        const preparedEntities = [
            ...entities.map(prepareEntity),
            prepareEntity(SystemEntity as KlassInstance<typeof Entity>),
        ];

        states.forEach(({dataContext, state}) => {
            Object.entries(state).forEach(([stateName, stateItem]) => {
                if (stateItem instanceof RecordBoundState) { 
                    let boundStateName = ''
                    let entity!: KlassInstance<typeof Entity> 
                    if (dataContext.type === 'property') {
                        const propertyDataContext = dataContext as PropertyDataContext
                        entity = propertyDataContext.host 
                        const propertyName = propertyDataContext.id as string
                        boundStateName = `_property_boundState_${entity.name}_${propertyName}_${stateName}`
                    } else if(dataContext.type === 'entity'||dataContext.type === 'relation') {
                        entity = dataContext.id as KlassInstance<typeof Entity>
                        boundStateName = `_${dataContext.type}_boundState_${dataContext.id.name}_${stateName}`
                    } else {
                        throw new Error(`Unsupported data context type: ${dataContext.type}`)
                    }
                    stateItem.key = boundStateName

                    if (stateItem.defaultValue instanceof Property) {
                        // TODO 特别注意这里改了 name
                        stateItem.defaultValue.name = boundStateName
                        entity.properties.push(stateItem.defaultValue)
                    } else {
                        const defaultValuetype = typeof stateItem.defaultValue
                        entity.properties.push(Property.create({
                            name: boundStateName,
                            type: defaultValuetype,
                            // 应该系统定义
                            collection: Array.isArray(stateItem.defaultValue),
                            defaultValue: () => stateItem.defaultValue
                        }))
                    }
                } else if (stateItem instanceof RelationBoundState) {
                    const propertyDataContext = dataContext as PropertyDataContext
                    const boundStateName = `_relation_boundState_${propertyDataContext.host.name}_${propertyDataContext.id}_${stateName}`
                    stateItem.key = boundStateName
                    const relationName = stateItem.record
                    const relation = relations.find(relation => relation.name === relationName)!
                    assert(relation, `relation ${relationName} not found`)
                    if (stateItem.defaultValue instanceof Property) {
                        // TODO 特别注意这里改了 name
                        stateItem.defaultValue.name = boundStateName
                        relation.properties.push(stateItem.defaultValue)
                    } else {
                        const defaultValuetype = typeof stateItem.defaultValue
                        relation.properties.push(Property.create({
                            name: boundStateName,
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
            preparedEntities as any, 
            relations,
            install
        );
    }
    destroy() {
        this.storage.destroy()
    }
}
