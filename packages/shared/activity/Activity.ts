import { createClass, KlassInstanceOf, KlassType} from "../createClass";
import {Entity} from "../entity/Entity";
import {UserAttributive, UserAttributives} from "../user/User";


export const EntityAttributive = createClass({
    name: 'EntityAttributive',
    display: (obj) => `${obj.name}`,
    public: {
        name: {
            type: 'string',
        },
        // parse 之后的
        content: {
            type: 'object',
        },
        // 原始函数描述
        stringContent: {
            type: 'string',
        },
    }
})

// EntityAttributive 的 bool 组合
export const EntityAttributives = createClass({
    name: 'EntityAttributives',
    display: (obj) => `${obj.name}`,
    public: {
        content: {
            type: 'object',
        },
    }
})

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
            type: [EntityAttributives, UserAttributives],
            collection: false,
        },
        // 当前 Item 的具体概念类型
        base: {
            type: [UserAttributive, Entity],
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
            collection: false,
            required: true
        },
        // 用户自定义的任何定语
        userAttributives: {
            required: true,
            collection: false,
            type: UserAttributives,
        },
        // 角色定语。例如 NORMAL_USER, ADMIN 等
        userRoleAttributive : {
            type: UserAttributive,
            collection: false,
            required: true
        },
        // 当前的用户的 alias 名字。这个地方应该改成 Alias 才更加好
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

// 分支条件判断
export const Gateway = createClass({
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

//  执行的 side effect。通常需要和实现的系统进行约定。
export const SideEffect = createClass({
    name: 'SideEffect',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

// activity activityGroup transfer 互相引用了，所以 type 要单独写了。
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
            type: KlassType<TransferDef["public"]>
            collection: true
        },
        groups: {
            type: KlassType<ActivityGroupDef["public"]>,
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
            required: true,
            collection: false
        },
        activities: {
            type: KlassType<ActivityDef["public"]>,
            required: false,
            collection: true,
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
            type: [typeof Interaction, KlassType<ActivityGroupDef["public"]>,typeof Gateway]
            // type: KlassTypeAny[]
            required: boolean
            collection: boolean
        },
        target: {
            type: [typeof Interaction, KlassType<ActivityGroupDef["public"]>, typeof Gateway]
            required: boolean
            collection: boolean
        }
    }
}

const TRANSFER_PLACEHOLDER = {} as unknown as KlassType<TransferDef["public"]>
const ACTIVITY_GROUP_PLACEHOLDER = {} as unknown as KlassType<ActivityGroupDef["public"]>

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
            type: TRANSFER_PLACEHOLDER, // 待会要被替换掉的，因为 activity/transfer 循环引用了。所以只能待会再替换成真的
            collection: true
        },
        // 节点分组
        groups: {
            // 待会要被替换掉的，因为 activity/activityGroup 循环引用了。所以只能待会再替换成真的
            type: ACTIVITY_GROUP_PLACEHOLDER,
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


// ActivityGroup 本质上是一个控制单元，不是 Activity。用来决定里面的 interaction 在什么情况下达到了完成状态。
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
            required: false,
            collection: true
        }
    }
} as ActivityGroupDef)

// const a:[typeof Interaction, KlassType<ActivityGroupDef["public"]>, typeof Gateway ] = [Interaction, ActivityGroup, Gateway]



export const Transfer: KlassType<TransferDef["public"]> = createClass({
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
} as TransferDef)

// 修正前面 Activity 里面为了解决循环引用问题的占位符
Activity.public.transfers.type = Transfer
Activity.public.groups.type = ActivityGroup


export type ActivityInstanceType = KlassInstanceOf<typeof Activity, false>
export type ActivityGroupInstanceType = KlassInstanceOf<typeof ActivityGroup, false>
export type InteractionInstanceType = KlassInstanceOf<typeof Interaction, false>
export type GatewayInstanceType = KlassInstanceOf<typeof Gateway, false>
export type TransferInstanceType = KlassInstanceOf<typeof Transfer, false>

export function forEachInteraction(activity: ActivityInstanceType, handle:(i:InteractionInstanceType, g?: ActivityGroupInstanceType) => any, parenGroup?: ActivityGroupInstanceType) {
    activity.interactions!.forEach(i => handle(i, parenGroup))
    activity.groups?.forEach(group => group.activities!.forEach(sub => forEachInteraction(sub, handle, group)))
}

export function getInteractions(activity: ActivityInstanceType) {
    const result: InteractionInstanceType[] = []
    forEachInteraction(activity, (i) => result.push(i))
    return result
}


export function findRootActivity(interaction: InteractionInstanceType): ActivityInstanceType|null {
    return null
}
