import { createClass} from "./createClass";
import {Activity, Interaction} from "./activity/Activity";
import {Entity, Relation} from "./entity/Entity";

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

// CAUTION 修补 Entity computedData 里面的类型
Entity.public.computedData.type.push(MapActivityToEntity)


const FixedProperty = createClass({
    name: 'RelationFixedProperty',
    public: {
        name: {
            type: 'string',
            collection: false,
            required:true
        },
        value: {
            type: [], // 可以是任何
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
            required: false
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
// TODO 其他几种类型