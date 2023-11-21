import {createClass, Klass} from "./createClass";
import {Activity, Interaction} from "./activity/Activity";
import {Entity, Property, Relation} from "./entity/Entity";
import {State} from "./state/State";

export const MapActivityToEntity = createClass({
    name: 'MapActivityToEntity',
    public: {
        sourceActivity: {
            type: Activity,
            collection: false,
            required: true
        },
        triggerInteraction: {
            type: Interaction,
            collection: true,
            required: false
        },
        handle: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

export const MapInteractionToRecord = createClass({
    name: 'MapInteractionToRecord',
    public: {
        sourceInteraction: {
            type: Interaction,
            collection: false,
            required: true
        },
        handle: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

export const MapInteractionToPropertyItem = createClass({
    name: 'MapInteractionToPropertyItem',
    public: {
        interaction: {
            type: Interaction,
            collection: false,
            required: true
        },
        value: {
            type: 'string',
            collection: false,
            required: true
        },
        computeSource: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

export const MapInteractionToProperty = createClass({
    name: 'MapInteractionToProperty',
    public: {
        items: {
            type: MapInteractionToPropertyItem,
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

// CAUTION 修补 Entity computedData 里面的类型
Entity.public.computedData.type.push(
    MapActivityToEntity as unknown as typeof ComputedData,
    MapInteractionToRecord as unknown as typeof ComputedData
)


const FixedProperty = createClass({
    name: 'RelationFixedProperty',
    public: {
        name: {
            type: 'string',
            collection: false,
            required:true
        },
        value: {
            type: [] as Klass<any>[], // 可以是任何
            collection: false,
            required: true,
        }
    }
})

export const RelationStateNode = createClass({
    name: 'RelationStateNode',
    public: {
        hasRelation: {
            type: 'boolean',
            required: true,
            collection:false
        },
        // 用来标记一个 独特的 state。
        fixedProperties: {
            type: FixedProperty,
            collection: true,
            required: false,
        },
        propertyHandle: {
            type: 'string',
            required: false,
            collection:false
        }
    }
})

export const RelationStateTransfer = createClass({
    name: 'RelationStateTransfer',
    public: {
        sourceActivity: {
            type: Activity,
            collection: false,
            required: false
        },
        triggerInteraction: {
            type: Interaction,
            collection: false,
            required: true
        },
        fromState: {
            type: RelationStateNode,
            collection: false,
            required: true
        },
        toState: {
            type: RelationStateNode,
            collection: false,
            required: true
        },
        handleType: {
            type: 'string',   // 支持 'enumeration' 和 'computeSource'
        },
        handle: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})


export const RelationStateMachine = createClass({
    name: 'RelationStateMachine',
    public: {
        states: {
            type: RelationStateNode,
            collection: true,
            required: true
        },
        transfers: {
            type: RelationStateTransfer,
            collection:true,
            required:true
        },
        defaultState: {
            type: RelationStateNode,
            collection: false,
            required: true
        }
    }
})

Relation.public.computedData.type.push(RelationStateMachine)


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
            type: 'string',
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
        matchExpression: {
            type: 'string',
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
        records: {
            type: [Entity, Relation],
            collection: true,
            required: true
        },
        matchRecordToWeight: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

export const Count = createClass({
    name: 'Count',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        matchExpression: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

State.public.computedData.type.push(WeightedSummation, Count)


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
        matchExpression: {
            type: 'string',
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
        matchExpression: {
            type: 'string',
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
        matchExpression: {
            type: 'string',
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

export const Any = createClass({
    name: 'Any',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        matchExpression: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})


// TODO Property 支持的 只增不减的 max/min/topN/
//  TODO 支持 filter？就是 关系上 comptedData


