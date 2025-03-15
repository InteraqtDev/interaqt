import {createClass, KlassInstance} from "./createClass.js";
import {BoolExp, BoolExpressionRawData, BoolExpressionData, BoolAtomData} from "./BoolExp.js";
// import {BoolExp, BoolExpressionRawData} from "./BoolExp.js";


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

export const Attributive = createClass({
    name: 'Attributive',
    display: (obj) => `${obj.name}`,
    public: {
        stringContent: {
            type: 'string',
        },
        content: {
            type: 'function',
            required: true,
            collection: false
        },
        name: {
            type: 'string'
        },
        // 是否是引用了同 activity 下其他的 interaction 的 user/entity。
        //  这个值只有在 isRole 为 true 时才可能为 true
        isRef: {
            type: 'boolean'
        },
    }
})

export const Attributives = createClass({
    name: 'Attributives',
    display: (obj) => `${obj.name}`,
    public: {
        // CAUTION content 的类型是 BoolExpressionData<UserAttributiveAtom>
        content: {
            type: [BoolExpressionData, BoolAtomData],
            collection: false,
            required: false
        },
    }
})

function toAttributives(obj?: BoolExp<KlassInstance<typeof Attributive>>): KlassInstance<typeof BoolAtomData>|KlassInstance<typeof BoolExpressionData>|undefined {
    if (!obj) return undefined

    if (obj.raw.type === 'atom') {
        return BoolAtomData.create({
            type: 'atom',
            data: obj.raw.data
        })
    }

    const expData = obj.raw as BoolExpressionRawData<KlassInstance<typeof Attributive>>
    return BoolExpressionData.create({
        type: 'expression',
        operator: expData.operator,
        left: toAttributives(obj.left)!,
        right: toAttributives(obj.right),
    })
}


export function boolExpToAttributives(obj: BoolExp<KlassInstance<typeof Attributive>>) {
    return Attributives.create({
        content: toAttributives(obj) as KlassInstance<typeof BoolExpressionData>
    })
}

