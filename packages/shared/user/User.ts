
// TODO Role 和 Attributive 合在一起可以变成新的 Role，怎么表示？
import {createClass, KlassOptions, ReactiveKlassOptions} from "../createClass";

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
        // 是否是角色定语
        isRole: {
            type: 'boolean'
        },
        // 是否是引用了同 activity 下其他的 interaction 的 user。
        //  这个值只有在 isRole 为 true 时才可能为 true
        isRef: {
            type: 'boolean'
        },
    }
})

export const UserAttributives = createClass({
    name: 'UserAttributives',
    display: (obj) => `${obj.name}`,
    public: {
        // CAUTION content 的类型是 BoolExpressionData<UserAttributiveAtom>
        content: {
            type: 'object',
        },
    }
})

export function createUserRoleAttributive({name, isRef = false}: { name: string, isRef?: boolean}, options?: KlassOptions|ReactiveKlassOptions) {
    // TODO type?
    // @ts-ignore
    return new UserAttributive({
        name,
        stringContent: `function(user) { return user.roles.includes('${name}')}`,
        isRef,
        isRole: true
    }, options)
}




