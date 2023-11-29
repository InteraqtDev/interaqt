import {BoolExpressionRawData} from "./BoolExp";


// Role/RoleAttributive/Entity 是 ConceptType
export type ConceptType = {}

// Concept 是 Role/RoleAttributive/Entity 的实例。例如 UserRole / Post
export interface Concept {
    name: string,
}

export interface DerivedConcept extends Concept {
    base? : Concept,
    attributive?: any,
}

export interface ConceptAlias extends Concept {
    for: Concept[]
}


export type ConceptInstance = any

export type UserAttributiveAtom = {
    key: string,
    [k:string]: any
}

export type UserAttributivesType = BoolExpressionRawData<UserAttributiveAtom>

export type EntityAttributiveAtom = {
    key: string,
    [k:string]: any
}

export type EntityAttributivesType = BoolExpressionRawData<EntityAttributiveAtom>