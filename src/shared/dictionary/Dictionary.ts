import {createClass, Klass} from "../createClass.js";
import {PropertyTypes} from "../entity/Entity.js";
const validNameFormatExp = /^[a-zA-Z0-9_]+$/

export const Dictionary = createClass({
    name: 'Dictionary',
    display: (obj: any) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                format({name}: { name: any }) {
                    return validNameFormatExp.test(name)
                },
                length({name}: { name: any }) {
                    return name.length > 1 && name.length < 5
                }
            }
        },
        type: {
            type: 'string',
            required: true,
            collection: false,
            // 有这个基本就不需要其他验证了
            // TODO 怎么表示那种可以用 option，也可以自由创建的值？
            options: Array.from(Object.values(PropertyTypes)),
        },
        collection: {
            type: 'boolean',
            required: true,
            collection: false,
            defaultValue() {
                return false
            }
        },
        args: {
            // TODO 怎么表达 args？？需要根据不同的 type 类型构建。例如 string 长度，number 范围。
            type: 'object',
            required: false,
            collection: false,
        },
        defaultValue: {
            type: 'function',
            required: false,
            collection: false,
        },
        computedData: {
            collection: false,
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: [] as Klass<any>[],
            required: false,
        }
    }
})
