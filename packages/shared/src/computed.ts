import { createClass } from "./createClass.js";
import { Activity, Interaction } from "./activity/Activity.js";
import { Entity, Property, Relation } from "./entity/Entity.js";
import { Dictionary } from "./dictionary/Dictionary.js";
import { BoolExp } from "./BoolExp.js";

export const StateNode = createClass({
    name: 'StateNode',
    public: {
        // 用来标记一个 独特的 state。
        value: {
            type: ['object', 'string', 'number', 'boolean', 'null'],
            collection: false,
            required: false,
        },
        propertyHandle: {
            type: 'function',
            required: false,
            collection: false
        }
    }
})

export const StateTransfer = createClass({
    name: 'StateTransfer',
    public: {
        triggerInteraction: {
            type: Interaction,
            collection: false,
            required: true
        },
        fromState: {
            type: StateNode,
            collection: false,
            required: true
        },
        toState: {
            type: StateNode,
            collection: false,
            required: true
        },
        handleType: {
            type: 'string',   // 支持 'enumeration' 和 'computeTarget'
        },
        handle: {
            type: 'function',
            collection: false,
            required: true
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


const RelationBasedItem = createClass({
    name: 'WeightedSummationRelation',
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
    }
})


export const RelationBasedWeightedSummation = createClass({
    name: 'RelationWeightedSummation',
    public: {
        relations: {
            type: RelationBasedItem,
            collection: true,
            required: true
        },
        // 创建初始值的时候用于计算哪些 relation 是要  count 的
        // 这里 match 的是 relatedEntity
        matchRelationToWeight: {
            type: 'function',
            collection: false,
            required: true
        }
    }
})

export const RelationCount = createClass({
    name: 'PropertyIncrementalCount',
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
        }
    }
})

Property.public.computedData.type.push(RelationCount, RelationBasedWeightedSummation)

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
export const RelationBasedAny = createClass({
    name: 'RelationBasedAny',
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
        }
    }
})
Property.public.computedData.type.push(RelationBasedEvery, RelationBasedAny)

export const Every = createClass({
    name: 'Every',
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



export const MapInteractionItem = createClass({
    name: 'MapInteractionItem',
    public: {
        interaction: {
            type: Interaction,
            collection: false,
            required: true
        },
        map: {
            type: 'function',
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

export const MapInteraction = createClass({
    name: 'MapInteraction',
    public: {
        items: {
            type: MapInteractionItem,
            collection: true,
            required: true
        },
        defaultValue: {
            type: 'string',
            collection: false,
            required: false
        }
    }
})


export const MapActivityItem = createClass({
    name: 'MapActivityItem',
    public: {
        activity: {
            type: Activity,
            collection: false,
            required: true
        },
        triggerInteractions: {
            type: Interaction,
            collection: true,
            required: false
        },
        map: {
            type: 'function',
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

export const MapActivity = createClass({
    name: 'MapActivity',
    public: {
        items: {
            type: MapActivityItem,
            collection: true,
            required: true
        },
        defaultValue: {
            type: 'string',
            collection: false,
            required: false
        }
    }
})

export const MapRecordMutation = createClass({
    name: 'MapRecordMutation',
    public: {
        map: {
            type: 'function',
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



// CAUTION 修补 Entity computedData 里面的类型
Entity.public.computedData.type.push(
    MapInteraction as unknown as typeof ComputedData,
    MapActivity as unknown as typeof ComputedData,
    MapRecordMutation as unknown as typeof ComputedData,
)

Relation.public.computedData.type.push(
    MapInteraction as unknown as typeof ComputedData,
    MapActivity as unknown as typeof ComputedData,
    MapRecordMutation as unknown as typeof ComputedData,
)

Property.public.computedData.type.push(
    MapInteraction as unknown as typeof ComputedData,
    MapActivity as unknown as typeof ComputedData,
    MapRecordMutation as unknown as typeof ComputedData,
)

Dictionary.public.computedData.type.push(
    MapInteraction as unknown as typeof ComputedData,
    MapActivity as unknown as typeof ComputedData,
    MapRecordMutation as unknown as typeof ComputedData,
)


// TODO Property 支持的 只增不减的 max/min/topN/
//  TODO 支持 filter？就是 关系上 comptedData


