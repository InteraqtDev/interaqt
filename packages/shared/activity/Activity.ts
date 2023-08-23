import {createClass} from "../createClass";
import {Atom, computed, incPick, incUnique} from "rata";
import {Entity} from "../entity/Entity";

export const Role = createClass({
    name: 'Role',
    display: (obj) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            constraints: {
                format({ name } : {name:Atom<string>}) {
                    return computed(() => validNameFormatExp.test(name))
                },
            }
        },
        isRef: {
            type: 'boolean',
            defaultValue: () => false
        }
    }
})

// TODO Role 和 Attributive 合在一起可以变成新的 Role，怎么表示？

export const RoleAttributive = createClass({
    name: 'RoleAttributive',
    display: (obj) => `${obj.name}`,
    public: {
        content: {
            type: 'object',
        },
        stringContent: {
            type: 'string',
        },
        name: {
            type: 'string'
        }
    }
})


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

export const Attributive = createClass({
    name: 'Attributive',
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

const validNameFormatExp = /^[a-z(A-Z0-9_]+$/



export const Action = createClass({
    name: 'Action',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})




export const PayloadItem = createClass({
    name: 'PayloadItem',
    public: {
        name: {
            type: 'string',
            required: true
        },
        attributive: {
            type: RoleAttributive
        },
        // TODO 可以是 role 也可以是 entity 怎么表达？？？
        base: {
            type: Role,
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
        itemRef: {
            type: [Role, Entity]
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

export const constraints = {
    actionNameUnique({actions}) {
        const uniqueNames = incUnique(incPick(actions, '$name'))
        return computed(() => uniqueNames.size === actions.length)
    },
    roleNameUnique({ roles }) {
        const uniqueNames = incUnique(incPick(roles, '$name'))
        return computed(() => uniqueNames.size === roles.length)
    }
}

export const Interaction = createClass({
    name:'Interaction',
    display: (obj) => `${obj.action.name}`,
    public: {
        name: {
          type: 'string',
          required: true
        },
        roleAttributive: {
            type: RoleAttributive,
        },
        role : {
            type: Role,
            required: true
        },
        roleRef: {
            type: Role
        },
        action:  {
            type: Action,
            required: true
        },
        payload: Payload
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

export function forEachInteraction(activity: ReturnType<typeof Activity.create>|ReturnType<typeof Activity.createReactive>, handle: (interaction: ReturnType<typeof Interaction.create>|ReturnType<typeof Interaction.createReactive>) => any) {
    activity.interactions.forEach(interaction => handle(interaction))
    activity.groups?.forEach((group) => forEachInteraction(group as InstanceType<typeof Activity>, handle) )
}