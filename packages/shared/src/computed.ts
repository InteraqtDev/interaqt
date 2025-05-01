import { createClass } from "./createClass.js";
import { Activity, Interaction } from "./activity/Activity.js";
import { Entity, Property, Relation } from "./entity/Entity.js";
import { Dictionary } from "./dictionary/Dictionary.js";
import { BoolExp } from "./BoolExp.js";

export const StateNode = createClass({
    name: 'StateNode',
    public: {
        // 用来标记一个 独特的 state。
        name: {
            type: 'string',
            collection: false,
            required: true,
        },
        computeValue: {
            type: 'function',
            required: false,
            collection: false
        }
    }
})

export const StateTransfer = createClass({
    name: 'StateTransfer',
    public: {
        trigger: {
            instanceType: {} as unknown as {[key:string]:any},
            collection: false,
            required: true
        },
        current: {
            type: StateNode,
            collection: false,
            required: true
        },
        next: {
            type: StateNode,
            collection: false,
            required: true
        },
        computeTarget: {
            type: 'function',
            collection: false,
            required: false
        }
    }
})


export const StateMachine = createClass({
    name: 'StateMachine',
    public: {
        states: {
            type: StateNode,
            collection: true,
            required: true
        },
        transfers: {
            type: StateTransfer,
            collection: true,
            required: true
        },
        defaultState: {
            type: StateNode,
            collection: false,
            required: true
        }
    }
})


Relation.public.computedData.type.push(StateMachine)
Entity.public.computedData.type.push(StateMachine)
Property.public.computedData.type.push(StateMachine)
Dictionary.public.computedData.type.push(StateMachine)


// ComputedData 的基础结构
export const ComputedData = createClass({
    name: 'ComputedData',
    public: {
        computeEffect: {
            type: 'string',
            collection: false,
            required: true
        },
        computation: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})


// 整个系统的加权和count
export const WeightedSummation = createClass({
    name: 'WeightedSummation',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        callback: {
            type: 'function',
            collection: false,
            required: true
        },
        attributeQuery: {
            instanceType: {} as unknown as AttributeQueryData,
            collection: false,
            required: false
        },
    }
})

type MatchExpressionData = BoolExp<any>;
type ModifierData = {
    orderBy?: {
        [k: string]: 'ASC' | 'DESC';
    };
    limit?: number;
    offset?: number;
};
type RecordQueryData = {
    matchExpression?: MatchExpressionData;
    attributeQuery?: AttributeQueryData;
    modifier?: ModifierData;
    label?: string;
    goto?: string;
    exit?: (data: any) => Promise<any>;
};

type AttributeQueryData = AttributeQueryDataItem[];

type AttributeQueryDataItem = string | AttributeQueryDataRecordItem;

type AttributeQueryDataRecordItem = [string, RecordQueryData, boolean?];

export const Count = createClass({
    name: 'Count',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
    }
})

Dictionary.public.computedData.type.push(WeightedSummation, Count)


// every
export const RelationBasedEvery = createClass({
    name: 'RelationBasedEvery',
    public: {
        relation: {
            type: Relation,
            collection: false,
            required: true
        },
        // 因为 relation 可能 source/target 实体相同，所以还有增加方向信息
        relationDirection: {
            type: 'string',
            collection: false,
            required: true,
            defaultValue: () => 'source'
        },
        // 创建初始值的时候用于计算哪些 relation 是要  count 的
        // 这里 match 的是 relatedEntity
        match: {
            type: 'function',
            collection: false,
            required: true
        },
        notEmpty: {
            type: 'boolean',
            collection: false,
            required: false
        }
    }
})


export const Every = createClass({
    name: 'Every',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        direction: {
            type: 'string',
            collection: false,
            required: false,
            defaultValue: () => 'source'
        },
        callback: {
            type: 'function',
            collection: false,
            required: true
        },
        attributeQuery: {
            instanceType: {} as unknown as AttributeQueryData,
            collection: false,
            required: false
        },
        notEmpty: {
            type: 'boolean',
            collection: false,
            required: false
        }
    }
})

export const Any = createClass({
    name: 'Any',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        direction: {
            type: 'string',
            collection: false,
            required: false,
            defaultValue: () => 'source'
        },
        callback: {
            type: 'function',
            collection: false,
            required: true
        },
        attributeQuery: {
            instanceType: {} as unknown as AttributeQueryData,
            collection: false,
            required: false
        },
    }
})



export const Transform = createClass({
    name: 'Transform',
    public: {
        record: {
            // TODO MutationEvent 等等
            type: [Entity, Relation, Activity, Interaction],
            collection: false,
            required: true
        },
        attributeQuery: {
            instanceType: {} as unknown as AttributeQueryData,
            collection: false,
            required: false
        },
        callback: {
            type: 'function',
            collection: false,
            required: true
        }
    }
})


// CAUTION 修补 Entity computedData 里面的类型

// TODO Property 支持的 只增不减的 max/min/topN/
//  TODO 支持 filter？就是 关系上 comptedData


