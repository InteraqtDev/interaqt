import {createClass, Klass, KlassInstance, KlassInstancePrimitiveProps} from "../createClass.js";
import {Entity, Relation} from "../entity/Entity.js";
import {Attributive, Attributives, } from "../attributive.js";
import {Condition, Conditions} from './Condition.js'
import {Computation, DataAttributive, DataAttributives, Query} from "./Data.js";


// 交互动作，因为以后可能有更多的关于交互动作的管理，所以应该是个对象，而不只是字符串名字。
//  例如获取所有的 send xxx 类型的交互动作。
export const Action = createClass({
    name: 'Action',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})


// CAUTION 全局唯一的 GET 交互。
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
            type: [Attributives, Attributive],
            collection: false,
        },
        // 当前 Item 的具体概念类型
        base: {
            type: Entity,
            required: true,
            collection: false,
        },
        // isRef 表示这个 payload 是不是一个有 id ，系统中已经存在的。
        //  例如交互"用户 删除 内容"，用户执行这个交互时传的 "内容" 就应该是有 id 。
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
        // payload 也可以指向前其他交互中定义的实体之类的，这用在了 activity 中。
        itemRef: {
            collection: false,
            required: false,
            type: [Attributive, Entity] as (typeof Attributive | typeof Entity)[],
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
            defaultValue: () => []
        }
    }
})
//  执行的 side effect。通常需要和实现的系统进行约定。
export const SideEffect = createClass({
    name: 'SideEffect',
    public: {
        name: {
            type: 'string',
            required: true,
            collection: false
        },
        handle: {
            type: 'function',
            required: true,
            collection: false
        }
    }
})

export type InteractionPublicType = {
    name: {
        type: 'string',
        collection: false,
        required: true
    },
    conditions: {
        required: false,
        collection: false,
        type: (typeof Conditions|typeof Condition)[],
    },
    // 用户自定义的任何定语
    userAttributives: {
        required: false,
        collection: false,
        type: (typeof Attributives|typeof Attributive)[],
    },
    // 当前的用户的 alias 名字。这个地方应该改成 Alias 才更加好
    userRef: {
        type: typeof Attributive,
        collection: false,
    },
    action:  {
        type: typeof Action,
        collection: false,
        required: true
    },
    payload: {
        type: typeof Payload,
        collection: false,
    },
    // 副作用
    sideEffects: {
        type: typeof SideEffect,
        collection: true
        defaultValue: (...args: any[]) => KlassInstance<typeof SideEffect, any>[]
    },
    dataAttributives: {
      required: false,
      collection: false,
      type: (typeof DataAttributive|typeof DataAttributives)[],
    },
    data: {
        type: (typeof Entity|typeof Relation|typeof Computation)[],
        required: false,
        collection: false
    },
    query: {
        type: typeof Query,
        collection: false,
    }

}

export const Interaction: Klass<InteractionPublicType> = createClass({
    name:'Interaction',
    display: (interaction: KlassInstance<Klass<InteractionPublicType>, false>) => `${interaction.action.name}`,
    public: {
        name: {
            type: 'string',
            collection: false,
            required: true
        },
        conditions: {
            type: [Conditions, Condition],
            required: false,
            collection: false,
        },
        // 用户自定义的任何定语
        userAttributives: {
            type: [Attributives, Attributive],
            required: false,
            collection: false,
        },
        // 当前的用户的 alias 名字。这个地方应该改成 Alias 才更加好
        userRef: {
            type: Attributive,
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
        },
        // 副作用
        sideEffects: {
            type: SideEffect,
            collection: true,
            defaultValue: (...args: any[]) => []
        },
        dataAttributives: {
            type: [DataAttributive, DataAttributives],
            required: false,
            collection: false,
        },
        data: {
            type: [Entity, Relation, Computation],
            required: false,
            collection: false
        },
        query : {
            type: Query,
            required: false,
            collection: false
        }
    }
})

export type GatewayPublicType = {
    name: {
        type: 'string',
        required: true
    }
}
// 分支条件判断
export const Gateway: Klass<GatewayPublicType> = createClass({
    name: 'Gateway',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})


// 用户可以定义事件
export const Event = createClass({
    name: 'Event',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})



// activity activityGroup transfer 互相引用了，所以 type 要单独写了。
type ActivityPublicType = {
    name: {
        type: 'string',
        collection :false,
        required: true
    },
    interactions: {
        type: Klass<InteractionPublicType>,
        collection :true,
        defaultValue: (...args: any[]) => KlassInstance<Klass<InteractionPublicType>, any>[]
    },

    transfers: {
        type: Klass<TransferPublicType>
        collection: true
        defaultValue: (...args: any[]) => KlassInstance<Klass<TransferPublicType>, any>[]
    },
    groups: {
        type: Klass<ActivityGroupPublicType>,
        collection: true
        defaultValue: (...args: any[]) => KlassInstance<Klass<ActivityGroupPublicType>, any>[]
    },
    gateways: {
        type: Klass<GatewayPublicType>
        collection: true
        defaultValue: (...args: any[]) => KlassInstance<Klass<GatewayPublicType>, any>[]
    },
    events: {
        type: typeof Event,
        collection: true
        defaultValue: (...args: any[]) => KlassInstance<typeof Event, any>[]
    }
} 


// interface Activities {
//     type: Klass<ActivityPublicType>,
//     required: false,
//     collection: true,
// }

type UnwrappedActivityInstanceType = {
    name: string,
    interactions: KlassInstance<Klass<InteractionPublicType>, any>[]
    transfers: KlassInstance<Klass<TransferPublicType>, any>[]
    groups: KlassInstance<Klass<ActivityGroupPublicType>, any>[]
    gateways: KlassInstance<Klass<GatewayPublicType>, any>[]
    events: KlassInstance<typeof Event, any>[]
} & KlassInstancePrimitiveProps

export type ActivityGroupPublicType = {
    // 指定是并行的，还是串行的 等等
    type: {
        type: 'string',
        required: true,
        collection: false
    },
    activities: {
        // type: Klass<ActivityPublicType>,
        instanceType: UnwrappedActivityInstanceType,
        required: false,
        collection: true,
        defaultValue: (...args: any[]) => UnwrappedActivityInstanceType[]
    },
}


export type TransferPublicType = {
    name: {
        type: 'string',
        required: true,
        collection: false
    },
    source: {
        type: (Klass<InteractionPublicType>| Klass<ActivityGroupPublicType>| Klass<GatewayPublicType>)[]
        // type: [Klass<InteractionPublicType>, Klass<ActivityGroupPublicType>, Klass<GatewayPublicType>]
        required: true
        collection: false
    },
    target: {
        type: (Klass<InteractionPublicType>| Klass<ActivityGroupPublicType>| Klass<GatewayPublicType>)[]
        required: true
        collection: false
    }
}


const TRANSFER_PLACEHOLDER = {} as unknown as Klass<TransferPublicType>
const ACTIVITY_GROUP_PLACEHOLDER = {} as unknown as Klass<ActivityGroupPublicType>

export const Activity: Klass<ActivityPublicType> = createClass({
    name: 'Activity',
    public: ({
        name: {
            type: 'string',
            collection: false,
            required: true
        },
        // 节点
        interactions: {
            type: Interaction,
            collection: true,
            defaultValue: (...args: any[]) => []
        },
        // 节点
        gateways: {
            type: Gateway,
            collection: true,
            defaultValue: (...args: any[]) => []
        },
        // 边
        transfers: {
            type: TRANSFER_PLACEHOLDER, // 待会要被替换掉的，因为 activity/transfer 循环引用了。所以只能待会再替换成真的
            collection: true,
            defaultValue: (...args: any[]) => []
        },
        // 节点分组
        groups: {
            // 待会要被替换掉的，因为 activity/activityGroup 循环引用了。所以只能待会再替换成真的
            type: ACTIVITY_GROUP_PLACEHOLDER,
            collection: true,
            defaultValue: (...args: any[]) => []
        },
        // 抛出的事件groups
        events: {
            type: Event,
            collection: true,
            defaultValue: (...args: any[]) => []
        },

    } as ActivityPublicType)
})


// ActivityGroup 本质上是一个控制单元，不是 Activity。用来决定里面的 interaction 在什么情况下达到了完成状态。
export const ActivityGroup: Klass<ActivityGroupPublicType> = createClass({
    name: 'ActivityGroup',
    public: {
        type: {
            type: 'string',
            required: true,
            collection: false
        },
        activities: {
            // type: Activity,
            instanceType: {} as unknown as UnwrappedActivityInstanceType,
            collection: true,
            required: false,
            defaultValue: (...args: any[]) => []
        }
    }
})



export const Transfer: Klass<TransferPublicType> = createClass({
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
})

// 修正前面 Activity 里面为了解决循环引用问题的占位符
Activity.public.transfers.type = Transfer
Activity.public.groups.type = ActivityGroup


export type ActivityInstanceType = KlassInstance<typeof Activity, false>
export type ActivityGroupInstanceType = KlassInstance<Klass<ActivityGroupPublicType>, false>
export type InteractionInstanceType = KlassInstance<typeof Interaction, false>
export type GatewayInstanceType = KlassInstance<typeof Gateway, false>
export type TransferInstanceType = KlassInstance<typeof Transfer, false>


export function forEachInteraction(activity: ActivityInstanceType, handle:(i:InteractionInstanceType, g?: ActivityGroupInstanceType) => any, parenGroup?: ActivityGroupInstanceType) {
    activity.interactions.forEach(i => handle(i, parenGroup))
    activity.groups.forEach(group => {
        group.activities!.forEach(sub => forEachInteraction(sub, handle, group))
    })
}

export function getInteractions(activity: ActivityInstanceType) {
    const result: InteractionInstanceType[] = []
    forEachInteraction(activity, (i) => result.push(i))
    return result
}


export function findRootActivity(interaction: InteractionInstanceType): ActivityInstanceType|null {
    return null
}

// activity 的 action
export const ActivityCreateAction = Action.create({
    name: 'create'
})