
// TODO Role 和 Attributive 合在一起可以变成新的 Role，怎么表示？

import {createClass, KlassOptions, ReactiveKlassOptions} from "../createClass";
import {Atom, computed} from "rata";

export const UserAttributive = createClass({
    name: 'UserAttributive',
    display: (obj) => `${obj.name}`,
    public: {
        stringContent: {
            type: 'string',
        },
        name: {
            type: 'string'
        },
        isRef: {
            type: 'boolean'
        },
        isRole: {
            type: 'boolean'
        }
    }
})

export const UserAttributives = createClass({
    name: 'UserAttributives',
    display: (obj) => `${obj.name}`,
    public: {
        content: {
            type: 'object',
        },
    }
})

const validNameFormatExp = /^[a-z(A-Z0-9_]+$/

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


export function createUserRoleAttributive({name, isRef = false}: { name: string, isRef?: boolean}, options?: KlassOptions|ReactiveKlassOptions) {
    // TODO type?
    // @ts-ignore
    return new UserAttributive({
        name,
        stringContent: `function({ user }) { return user.roles.includes('${name}')}`,
        isRef,
        isRole: true
    }, options)
}




