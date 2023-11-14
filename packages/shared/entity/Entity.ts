import {Atom, computed, incPick, incUnique} from 'rata'
import {createClass, getInstance, Klass} from "../createClass";
import {ComputedData} from "../IncrementalComputation";


export enum PropertyTypes {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
}


const validNameFormatExp = /^[a-zA-Z0-9_]+$/


export const Property = createClass({
    name: 'Property',
    display: (obj: any) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                format({name}: { name: Atom<string> }) {
                    return computed(() => validNameFormatExp.test(name))
                },
                length({name}: { name: Atom<string> }) {
                    return computed(() => name.length > 1 && name.length < 5)
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
            computedType: (values: { type: PropertyTypes }) => PropertyTypeMap[values.type],
        },
        computedData: {
            collection: false,
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: [] as Klass<any>[],
            required: false,
        }
    }
})

export const constraints = {
    entityNameUnique({entities}: { entities: (typeof Entity)[] }) {
        const uniqueNames = incUnique(incPick(entities, '$name'))
        return computed(() => uniqueNames.size === entities.length)
    }
}

export const Entity = createClass({
    name: 'Entity',
    display: (instance: any) => instance.name,
    public: {
        name: {
            type: 'string',
            collection: false,
            required:true,
            constraints: {
                nameFormat({name}: { name: Atom<string> }) {
                    return computed(() => {
                        return validNameFormatExp.test(name)
                    })
                }
            }
        },
        computedData: {
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: [] as (typeof ComputedData)[],
            collection: false,
            required: false,
        },
        properties: {
            type: Property,
            collection: true,
            required:true,
            constraints: {
                // 默认第一参数是 property 本身，第二参数是 entity
                eachNameUnique({properties}) {
                    // CAUTION 这里取的是 leaf atom，不然到 incUnique 里面已经监听不到  name string 的变化了。
                    // FIXME 实例化之后 property 不是个 Class 吗？它的 name 就是个 atom，也没有 $name 这个属性，如何统一？？？
                    const uniqueNames = incUnique(incPick(properties, '$name'))
                    return computed(() => {
                        return uniqueNames.size === properties.length
                    })
                }
            },
            defaultValue() {
                return []
            }
        },
        isRef: {
            required: true,
            collection: false,
            type: 'boolean', // 可以在 payload 中作为 ref 被后续的 interaction 引用。
            defaultValue: () => false
        }
    }
})

export const PropertyTypeMap = {
    [PropertyTypes.String]: 'string',
    [PropertyTypes.Number]: 'number',
    [PropertyTypes.Boolean]: 'boolean',
}


export const Relation = createClass({
    name: 'Relation',
    display: (instance) => ``,
    public: {
        name: {
            // TODO 是自动根据 entity/attribute 生成的，应该怎么表示？
            type: 'string',
            required: false,
            collection: false
        },
        entity1: {
            type: [Entity],
            required: true,
            collection: false,
            options() {
                return getInstance(Entity)
            }
        },
        targetName1: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                nameNotSameWithProp({entity1, targetName1}) {
                    return computed(() => {
                        return entity1?.properties?.every((p: typeof Property) => {
                            return p.name !== targetName1
                        })
                    })
                },
                nameUnique({entity1, entity2, targetName1, targetName2}) {
                    return computed(() => {
                        return !(entity1 === entity2 && targetName1 === targetName2)
                    })
                }
            }
        },
        entity2: {
            type: Entity,
            required: true,
            collection: false,
            options() {
                return getInstance(Entity)
            }
        },
        targetName2: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                nameNotSameWithProp({entity2, targetName2}) {
                    return computed(() => {
                        return entity2?.properties?.every((p: typeof Property) => {
                            return p.name !== targetName2
                        })
                    })
                },
                nameUnique({targetName1, entity1, entity2, targetName2}) {
                    return computed(() => {
                        return !(entity1 === entity2 && targetName1 === targetName2)
                    })
                }
            }
        },
        isTargetReliance: {
            type: 'boolean',
            required: true,
            collection:false,
            defaultValue() {
                return false
            }
        },
        relType: {
            type: 'string',
            collection: false,
            required: true,
            options() {
                return ['1:1', '1:n', 'n:1', 'n:n']
            },
            defaultValue() {
                return ['1:1']
            }
        },
        computedData: {
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: [] as Klass<any>[],
            collection: false,
            required: false,
        },
        properties: {
            type: Property,
            collection: true,
            required: true,
            constraints: {
                // 这里是从上面复制下来的。
                // 默认第一参数是 property 本身，第二参数是 relation
                eachNameUnique({properties}) {
                    // CAUTION 这里取的是 leaf atom，不然到 incUnique 里面已经监听不到  name string 的变化了。
                    // FIXME 实例化之后 property 不是个 Class 吗？它的 name 就是个 atom，也没有 $name 这个属性，如何统一？？？
                    const uniqueNames = incUnique(incPick(properties, '$name'))
                    return computed(() => {
                        return uniqueNames.size === properties.length
                    })
                }
            },
            defaultValue() {
                return []
            }
        },
    }
})
// CAUTION Relation 可以作为 source
// FIXME type relation 和 entity 的 public type 最好都单独定义
// @ts-ignore
Relation.public.entity1.type.push(Relation)

const User = Entity.create({
    name: 'test',
})

console.log(User.name)

log(User.properties)

function log(name: any[]) {

}
