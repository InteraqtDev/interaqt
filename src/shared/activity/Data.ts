import {createClass, KlassInstance} from "../createClass.js";
import {BoolExp, BoolExpressionRawData, BoolExpressionData, BoolAtomData} from "../BoolExp.js";


export const DataAttributive = createClass({
    name: 'DataAttributive',
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

export const DataAttributives = createClass({
    name: 'DataAttributives',
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

export const QueryItem = createClass({
    name: 'QueryItem',
    public: {
        name: {
            type: 'string',
            required: true,
            collection: false,
        },
        value: {
            type: 'string',
            required: true,
            collection: false,
        },
    }
})

export const Query = createClass({
    name: 'Query',
    public: {
        items: {
            type: QueryItem,
            required: true,
            collection: true,
        }
    }
})


function toDataAttributives(obj?: BoolExp<KlassInstance<typeof DataAttributive>>): KlassInstance<typeof BoolAtomData>|KlassInstance<typeof BoolExpressionData>|undefined {
    if (!obj) return undefined

    if (obj.raw.type === 'atom') {
        return BoolAtomData.create({
            type: 'atom',
            data: obj.raw.data
        })
    }

    const expData = obj.raw as BoolExpressionRawData<KlassInstance<typeof DataAttributive>>
    return BoolExpressionData.create({
        type: 'expression',
        operator: expData.operator,
        left: toDataAttributives(obj.left)!,
        right: toDataAttributives(obj.right),
    })
}


export function boolExpToDataAttributives(obj: BoolExp<KlassInstance<typeof DataAttributive>>) {
    return DataAttributives.create({
        content: toDataAttributives(obj) as KlassInstance<typeof BoolExpressionData>
    })
}



