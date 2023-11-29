import { createClass, KlassInstance } from "@shared/createClass";
import { Entity, Relation } from "@shared/entity/Entity";
import { InteractionEvent } from '../types/interaction';
import { MatchExpressionData } from "@storage/erstorage/MatchExp";
export interface Payload {
    [k: string]: any;
}
export type SystemCallback = (...arg: any[]) => any;
export type RecordChangeListener = (mutationEvents: RecordMutationEvent[]) => any;
export declare const SYSTEM_RECORD = "_System_";
export declare const EVENT_RECORD = "_Event_";
export declare const ACTIVITY_RECORD = "_Activity_";
export type Storage = {
    get: (itemName: string, id: string, initialValue?: any) => Promise<any>;
    set: (itemName: string, id: string, value: any) => Promise<any>;
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[]) => any;
    findOne: (entityName: string, ...arg: any[]) => Promise<any>;
    update: (entityName: string, ...arg: any[]) => Promise<any>;
    find: (entityName: string, ...arg: any[]) => Promise<any[]>;
    create: (entityName: string, data: any) => Promise<any>;
    delete: (entityName: string, data: any) => Promise<any>;
    findOneRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    findRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    updateRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    removeRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    addRelationByNameById: (relationName: string, ...arg: any[]) => Promise<any>;
    getRelationName: (...arg: any[]) => string;
    listen: (callback: RecordChangeListener) => any;
};
export type RecordMutationEvent = {
    recordName: string;
    type: 'create' | 'update' | 'delete';
    keys?: string[];
    record?: {
        [key: string]: any;
    };
    oldRecord?: {
        [key: string]: any;
    };
};
export interface System {
    getEvent: (query: any) => Promise<InteractionEvent[]>;
    saveEvent: (interactionEvent: InteractionEvent) => Promise<any>;
    createActivity: (activity: any) => Promise<any>;
    updateActivity: (match: MatchExpressionData, activity: any) => Promise<any>;
    getActivity: (query?: MatchExpressionData) => Promise<any[]>;
    conceptClass: Map<string, ReturnType<typeof createClass>>;
    storage: Storage;
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[]) => Promise<any>;
}
export type EntityIdRef = {
    id: string;
    [ROW_ID_ATTR]?: string;
    [k: string]: any;
};
export declare const ID_ATTR = "id";
export declare const ROW_ID_ATTR = "_rowId";
export type Database = {
    scheme: (sql: string, name?: string) => Promise<any>;
    query: <T extends any>(sql: string, name?: string) => Promise<T[]>;
    delete: <T extends any>(sql: string, name?: string) => Promise<T[]>;
    insert: (sql: string, name?: string) => Promise<EntityIdRef>;
    update: (sql: string, idField?: string, name?: string) => Promise<EntityIdRef[]>;
    getAutoId: (recordName: string) => Promise<string>;
};
//# sourceMappingURL=System.d.ts.map