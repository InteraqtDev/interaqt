import {createClass, KlassInstance} from "../createClass";
import {BoolExp, BoolExpressionRawData, BoolExpressionData, BoolAtomData} from "../BoolExp";


export const Condition = createClass({
    name: 'Condition',
    display: (obj) => `${obj.name}`,
    public: {
        content: {
            type: 'function',
            required: true,
            collection: false
        },
        name: {
            type: 'string'
        },
    }
})

export const Conditions = createClass({
    name: 'Conditions',
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

function toConditions(obj?: BoolExp<KlassInstance<typeof Condition, false>>): KlassInstance<typeof BoolAtomData, false>|KlassInstance<typeof BoolExpressionData, false>|undefined {
    if (!obj) return undefined

    if (obj.raw.type === 'atom') {
        return BoolAtomData.create({
            type: 'atom',
            data: obj.raw.data!
        })
    }

    const expData = obj.raw as BoolExpressionRawData<KlassInstance<typeof Condition, false>>
    return BoolExpressionData.create({
        type: 'expression',
        operator: expData.operator,
        left: toConditions(obj.left)!,
        right: toConditions(obj.right),
    })
}


export function boolExpToConditions(obj: BoolExp<KlassInstance<typeof Condition, false>>) {
    return Conditions.create({
        content: toConditions(obj) as KlassInstance<typeof BoolExpressionData, false>
    })
}
