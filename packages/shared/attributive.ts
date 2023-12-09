import {createClass, KlassInstance} from "./createClass.js";
import {BoolExp, BoolExpressionRawData} from "./BoolExp.js";


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
            type: 'function'
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

export const BoolAtomData = createClass({
    name: 'BoolAtomData',
    public: {
        type: {
            type: 'string',
            required: true,
            collection: false,
            defaultValue: () => 'atom'
        },
        data: {
            type: Attributive,
            required: true,
            collection: false,
        }
    }
})
export type UnwrappedBoolExpressionInstanceType = {
    // type: 'expression',
    // operator: 'and' | 'or' | 'not',
    type: string,
    operator: string,
    left: UnwrappedBoolExpressionInstanceType | KlassInstance<typeof BoolAtomData, any>,
    right?: UnwrappedBoolExpressionInstanceType | KlassInstance<typeof BoolAtomData, any>,
}
type BoolExpressionDataPublic = {
    type: {
        type: 'string',
        required: true,
        collection: false,
        defaultValue: () => 'expression'
    },
    operator: {
        type: 'string',
        required: true,
        collection: false,
        options: ['and', 'or', 'not'],
        defaultValue: () => 'and'
    },
    left: {
        // type: (typeof BoolAtomData | Klass<BoolExpressionDataPublic>)[],
        instanceType: (KlassInstance<typeof BoolAtomData, false>  | UnwrappedBoolExpressionInstanceType),
        required: true,
        collection: false,
    },
    right: {
        instanceType: (KlassInstance<typeof BoolAtomData, false> | UnwrappedBoolExpressionInstanceType),
        required: false,
        collection: false,
    }
}
export const BoolExpressionData = createClass({
    name: 'BoolExpressionData',
    public: {
        type: {
            type: 'string',
            required: true,
            collection: false,
            defaultValue: () => 'expression'
        },
        operator: {
            type: 'string',
            required: true,
            collection: false,
            options: ['and', 'or', 'not'],
            defaultValue: () => 'and'
        },
        left: {
            instanceType: {} as unknown as (typeof BoolAtomData | UnwrappedBoolExpressionInstanceType),
            required: true,
            collection: false,
        },
        right: {
            instanceType: {} as unknown as (typeof BoolAtomData | UnwrappedBoolExpressionInstanceType),
            required: false,
            collection: false,
        }
    } as BoolExpressionDataPublic
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

export class AttributiveBoolExp extends BoolExp<KlassInstance<typeof Attributive, false>> {
    static toAttributives(obj?: BoolExp<KlassInstance<typeof Attributive, false>>): KlassInstance<typeof BoolAtomData, false>|UnwrappedBoolExpressionInstanceType|undefined {
        if (!obj) return undefined

        if (obj.raw.type === 'atom') {
            return BoolAtomData.create({
                type: 'atom',
                data: obj.raw.data
            })
        }

        const expData = obj.raw as BoolExpressionRawData<KlassInstance<typeof Attributive, false>>
        return BoolExpressionData.create({
            type: 'expression',
            operator: expData.operator,
            left: AttributiveBoolExp.toAttributives(obj.left)!,
            right: AttributiveBoolExp.toAttributives(obj.right),
        })
    }
}


export function boolExpToAttributives(obj: BoolExp<KlassInstance<typeof Attributive, false>>) {
    // if (obj.raw.type === 'atom') {
    //     return obj.raw.data
    // }

    return Attributives.create({
        content: AttributiveBoolExp.toAttributives(obj) as KlassInstance<typeof BoolExpressionData, false>
    })
}

// CAUTION 直接复用，但是取个不同的名字，有更强的语义
export const Condition = Attributive
export const Conditions = Attributives
export const boolExpToConditions = boolExpToAttributives