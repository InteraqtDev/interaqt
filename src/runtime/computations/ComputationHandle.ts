import { EntityInstance, RelationInstance, PropertyInstance } from "@shared";
import { Computation } from "./Computation.js";

export type GlobalDataContext = {
    type: 'global',
    id: string
}

export type EntityDataContext = {
    type: 'entity',
    id: EntityInstance
}

export type RelationDataContext = {
    type: 'relation',
    id: RelationInstance
}

export type PropertyDataContext = {
    type: 'property',
    host: EntityInstance |  RelationInstance,
    id: PropertyInstance
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
