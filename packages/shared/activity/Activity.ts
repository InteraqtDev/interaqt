import {createClass} from "../createClass";
import {Entity} from "../entity/Entity";
import {UserAttributive, UserAttributives} from "../user/User";


// TODO Entity 和 Attributive 合在一起可以变成新的 Role，怎么表示？
export const EntityAttributive = createClass({
    name: 'EntityAttributive',
    display: (obj) => `${obj.name}`,
    public: {
        name: {
            type: 'string',
        },
        content: {
            type: 'object',
        },
        stringContent: {
            type: 'string',
        },
    }
})

export const EntityAttributives = createClass({
    name: 'EntityAttributives',
    display: (obj) => `${obj.name}`,
    public: {
        content: {
            type: 'object',
        },
    }
})


export const Action = createClass({
    name: 'Action',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})


export const GetAction = new Action({ name: 'get'})


export const PayloadItem = createClass({
    name: 'PayloadItem',
    public: {
        name: {
            type: 'string',
            required: true
        },
        // 用于修饰后面的 UserAttributive 或者 Entity，类型根据 base 变化而变化
        attributives: {
            type: [EntityAttributives, UserAttributives]
        },
        // 当前 Item 的具体概念类型
        base: {
            type: [UserAttributive, Entity],
            required: true,
        },
        isRef: {
            type: 'boolean',
            defaultValue: () => false

        },
        isCollection: {
            type: 'boolean',
            defaultValue: () => false
        },
        // 类型根据 base 变化而变化
        itemRef: {
            type: [UserAttributive, Entity]
        }
    }
})

export const Payload = createClass({
    name: 'Payload',
    public: {
        items: {
            type: PayloadItem,
            collection: true,
            required: true,
        }
    }
})


export const Interaction = createClass({
    name:'Interaction',
    display: (obj) => `${obj.action.name}`,
    public: {
        name: {
          type: 'string',
          required: true
        },
        userAttributives: {
            required: true,
            type: UserAttributives,
        },
        userRoleAttributive : {
            type: UserAttributive,
            required: true
        },
        userRef: {
            type: UserAttributive
        },
        action:  {
            type: Action,
            required: true
        },
        payload: {
            type: Payload
        }
    }
})


export const InteractionGroup = createClass({
    name: 'InteractionGroup',
    public: {
        type: {
            type: 'string',
            required: true
        },
        interactions: {
            type: Interaction,
            collection: true
        }
    }
})

export const Gateway = createClass({
    name: 'Gateway',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

export const Transfer = createClass({
    name: 'Transfer',
    public: {
        name: {
            type: 'string',
            required: true
        },
        source: {
            type: Interaction,
            required: true
        },
        target: {
            type: [Interaction, InteractionGroup],
            required: true
        }
    }
})

export const Event = createClass({
    name: 'Event',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

export const SideEffect = createClass({
    name: 'SideEffect',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

export const Activity = createClass({
    name: 'Activity',
    public: {
        // 节点
        interactions: {
            type: Interaction,
            collection: true
        },
        // 节点
        gateways: {
            type: Gateway,
            collection: true
        },
        // 边
        transfers: {
            type: Transfer,
            collection: true
        },
        // 节点分组
        groups: {
            type: InteractionGroup,
            collection: true
        },
        // 抛出的事件
        events: {
            type: Event,
            collection: true
        },
        // 副作用
        sideEffects: {
            type: SideEffect,
            collection: true
        },
    }
})

type ActivityInstance = InstanceType<typeof Activity>
type InteractionInstance = InstanceType<typeof Interaction>
type InteractionGroupInstance = InstanceType<typeof InteractionGroup>

export function forEachInteraction(activity: ActivityInstance|InteractionGroupInstance, handle: (interaction:InteractionInstance) => any) {
    activity.interactions.forEach(interaction => handle(interaction));
    (activity as ActivityInstance).groups?.forEach((group) => forEachInteraction(group as InteractionGroupInstance, handle) )
}