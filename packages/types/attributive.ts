import {BoolExpression} from "./boolExpression";


export type Attributives = BoolExpression

// Role/RoleAttributive/Entity 是 ConceptType
export type ConceptType = {}

// Concept 是 Role/RoleAttributive/Entity 的实例。例如 UserRole / Post
export interface Concept {
    name: string,
}

export interface DerivedConcept extends Concept {
    base? : Concept,
    attributive?: Attributives,
}

export interface ConceptAlias extends Concept {
    for: Concept[]
}


export type ConceptInstance = any