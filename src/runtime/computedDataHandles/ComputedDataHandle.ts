import { KlassInstance, Klass } from "@shared";
import { Entity, Relation, Property } from "@shared";
import { Computation } from "./Computation.js";

export type GlobalDataContext = {
    type: 'global',
    id: string
}

export type EntityDataContext = {
    type: 'entity',
    id: KlassInstance<typeof Entity>
}

export type RelationDataContext = {
    type: 'relation',
    id: KlassInstance<typeof Relation>
}

export type PropertyDataContext = {
    type: 'property',
    host: KlassInstance<typeof Entity> | KlassInstance<typeof Relation>,
    id: KlassInstance<typeof Property>
}



export type DataContext = GlobalDataContext|EntityDataContext|RelationDataContext|PropertyDataContext

export type ComputedEffect = any

export type ComputeEffectResult= ComputedEffect|ComputedEffect[]|undefined


type HandlesForType = {
    global?: { new(...args: any[]): Computation },
    entity?: { new(...args: any[]): Computation },
    relation?: { new(...args: any[]): Computation },
    property?: { new(...args: any[]): Computation },
}

export class ComputedDataHandle {
    public static  Handles: Map<Klass<any>,  HandlesForType> = new Map()
}
