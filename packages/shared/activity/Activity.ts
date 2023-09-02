import {createClass, KlassInstanceOf, KlassType} from "../createClass";
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
            type: [EntityAttributives, UserAttributives],
            collection: false,
        },
        // 当前 Item 的具体概念类型
        base: {
            type: [UserAttributive, Entity],
            required: true,
            collection: false,
        },
        isRef: {
            type: 'boolean',
            collection: false,
            defaultValue: () => false
        },
        required: {
            type: 'boolean',
            collection: false,
            defaultValue: () => false
        },
        isCollection: {
            type: 'boolean',
            collection: false,
            defaultValue: () => false
        },
        // 类型根据 base 变化而变化
        itemRef: {
            collection: false,
            type: [UserAttributive, Entity]
        }
    }
})

// const i = {
//     name: 'PayloadItem',
//     public: {
//         name: {
//             type: 'string',
//             required: true
//         },
//         // 用于修饰后面的 UserAttributive 或者 Entity，类型根据 base 变化而变化
//         attributives: {
//             type: [EntityAttributives, UserAttributives]
//         },
//         // 当前 Item 的具体概念类型
//         base: {
//             type: [UserAttributive, Entity],
//             required: true,
//             collection: false
//         },
//         isRef: {
//             type: 'boolean',
//             defaultValue: () => false
//         },
//         required: {
//             type: 'boolean',
//             defaultValue: () => false
//         },
//         isCollection: {
//             type: 'boolean',
//             defaultValue: () => false
//         },
//         // 类型根据 base 变化而变化
//         itemRef: {
//             type: [UserAttributive, Entity]
//         }
//     }
// }
//
// type II = (typeof i)["public"]["base"]["collection"] extends true ? true: string



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
            collection: false,
            required: true
        },
        userAttributives: {
            required: true,
            collection: false,
            type: UserAttributives,
        },
        userRoleAttributive : {
            type: UserAttributive,
            collection: false,
            required: true
        },
        userRef: {
            type: UserAttributive,
            collection: false,
        },
        action:  {
            type: Action,
            collection: false,
            required: true
        },
        payload: {
            type: Payload,
            collection: false,
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


type ActivityDef = {
    name: string,
    public: {
        name: {
            type: 'string',
            collection :false
        },
        interactions: {
            type: typeof Interaction,
            collection :true
        },
        gateways: {
            type: typeof Gateway,
            collection: true
        },
        transfers: {
            computedType: () => KlassType<TransferDef["public"]>,
            collection: true
        },
        groups: {
            computedType: () => KlassType<ActivityGroupDef["public"]>,
            collection: true
        },
        events: {
            type: typeof Event,
            collection: true
        },
        // 副作用
        sideEffects: {
            type: typeof SideEffect,
            collection: true
        },
    }
}

type ActivityGroupDef = {
    name: string,
    public: {
        type: {
            type: 'string',
            collection: false
            required: true
        },
        activities: {
            type: KlassType<ActivityDef["public"]>,
            collection: true
        },
        // TODO 可以有配置逻辑的。用于让用户自己扩展 Group 类型。
    }
}

type TransferDef = {
    name: string,
    public: {
        name: {
            type: 'string',
            required: boolean,
            collection: boolean
        },
        source: {
            // type: [typeof Interaction, KlassType<ActivityGroupDef["public"]>, typeof Gateway ]
            type: KlassType<any>[]
            required: boolean
            collection: boolean
        },
        target: {
            // type: [typeof Interaction, KlassType<ActivityGroupDef["public"]>, typeof Gateway]
            type: KlassType<any>[]
            required: boolean
            collection: boolean
        }
    }
}

export const Activity: KlassType<ActivityDef["public"]> = createClass({
    name: 'Activity',
    public: {
        name: {
            type: 'string',
            collection: false
        },
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
            computedType: () => Transfer,
            collection: true
        },
        // 节点分组
        groups: {
            computedType: () =>  ActivityGroup,
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

export const ActivityGroup: KlassType<ActivityGroupDef["public"]> = createClass({
    name: 'ActivityGroup',
    public: {
        type: {
            type: 'string',
            required: true,
            collection: false
        },
        activities: {
            type: Activity,
            collection: true
        }
    }
} as ActivityGroupDef)


const transferDef: TransferDef = {
    name: 'Transfer',
    public: {
        name: {
            type: 'string',
            required: true,
            collection: false
        },
        source: {
            type: [Interaction, ActivityGroup, Gateway],
            required: true,
            collection: false
        },
        target: {
            type: [Interaction, ActivityGroup, Gateway],
            required: true,
            collection: false
        }
    }
}

export const Transfer: KlassType<TransferDef["public"]> = createClass(transferDef)

export type ActivityInstanceType = KlassInstanceOf<typeof Activity, false>
export type ActivityGroupInstanceType = KlassInstanceOf<typeof ActivityGroup, false>
export type InteractionInstanceType = KlassInstanceOf<typeof Interaction, false>
export type GatewayInstanceType = KlassInstanceOf<typeof Gateway, false>
export type TransferInstanceType = KlassInstanceOf<typeof Transfer, false>

export function forEachInteraction(activity: ActivityInstanceType, handle:(i:InteractionInstanceType, g?: ActivityGroupInstanceType) => any, parenGroup?: ActivityGroupInstanceType) {
    activity.interactions.forEach(i => handle(i, parenGroup))
    activity.groups?.forEach(group => group.activities.forEach(sub => forEachInteraction(sub, handle, group)))

}
