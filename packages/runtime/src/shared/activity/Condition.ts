import {createClass, KlassInstance} from "../createClass.js";
import {BoolExp, BoolExpressionRawData, BoolExpressionData, BoolAtomData} from "../BoolExp.js";


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

function toConditions(obj?: BoolExp<KlassInstance<typeof Condition>>): KlassInstance<typeof BoolAtomData>|KlassInstance<typeof BoolExpressionData>|undefined {
    if (!obj) return undefined

    if (obj.raw.type === 'atom') {
        return BoolAtomData.create({
            type: 'atom',
            data: obj.raw.data
        })
    }

    const expData = obj.raw as BoolExpressionRawData<KlassInstance<typeof Condition>>
    return BoolExpressionData.create({
        type: 'expression',
        operator: expData.operator,
        left: toConditions(obj.left)!,
        right: toConditions(obj.right),
    })
}


export function boolExpToConditions(obj: BoolExp<KlassInstance<typeof Condition>>) {
    return Conditions.create({
        content: toConditions(obj) as KlassInstance<typeof BoolExpressionData>
    })
}
