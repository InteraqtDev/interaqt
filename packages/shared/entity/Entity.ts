import {Atom, incUnique, computed, incPick} from 'rata'
import {createClass, getInstance} from "../createClass";


export enum PropertyTypes {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
}


const validNameFormatExp = /^[a-z(A-Z0-9_]+$/


export const Property = createClass({
    name: 'Property',
    display: (obj) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            constraints: {
                format({ name } : {name:Atom<string>}) {
                    return computed(() => validNameFormatExp.test(name))
                },
                length({ name } : {name:Atom<string>}) {
                    return computed(() => name.length > 1 && name.length < 5)
                }
            }
        },
        type: {
            type: 'string',
            required: true,
            // 有这个基本就不需要其他验证了
            // TODO 怎么表示那种可以用 option，也可以自由创建的值？
            options: Array.from(Object.values(PropertyTypes)),
        },
        collection: {
            type: 'boolean',
            defaultValue () {
                return false
            }
        },
        args: {
            // TODO 怎么表达 args？？需要根据不同的 type 类型构建。例如 string 长度，number 范围。
            computedType: (values) => PropertyTypeMap[values.type],
        }
    }
})

export const constraints = {
    entityNameUnique({entities}) {
        const uniqueNames = incUnique(incPick(entities, '$name'))
        return computed(() => uniqueNames.size === entities.length)
    }
}

export const Entity = createClass({
    name: 'Entity',
    display: (instance) => instance.name,
    public: {
        name: {
            type: 'string',
            constraints: {
                nameFormat({ name }: {name: Atom<string>} ) {
                    return computed(() => validNameFormatExp.test(name))
                }
            }
        },
        properties: {
            type: Property,
            collection: true,
            constraints: {
                // 默认第一参数是 property 本身，第二参数是 entity
                eachNameUnique({ properties }) {
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
            type: 'boolean', // 可以在 payload 中作为 ref 被后续的 interaction 引用。
            defaultValue: () => false
        }
    }
})



export const PropertyTypeMap =  {
    [PropertyTypes.String]:null,
    [PropertyTypes.Number]: null,
    [PropertyTypes.Boolean]: null,
}


export const Relation = createClass({
    name: 'Relation',
    display: (instance) => ``,
    public: {
        entity1: {
            type: Entity,
            required: true,
            options() {
                return getInstance(Entity)
            }
        },
        targetName1 : {
            type: 'string',
            required: true,
            constraints: {
                nameNotSameWithProp({ entity1, targetName1 }) {
                    return computed(() => {
                        return entity1?.properties?.every(p => {
                            return p.name !== targetName1
                        })
                    })
                },
                nameUnique({ entity1, entity2, targetName1, targetName2 }) {
                    return computed(() => {
                        return !(entity1 === entity2 && targetName1 === targetName2)
                    })
                }
            }
        },
        entity2: {
            type: Entity,
            required: true,
            options() {
                return getInstance(Entity)
            }
        },
        targetName2 : {
            type: 'string',
            required: true,
            constraints: {
                nameNotSameWithProp({ entity2, targetName2 }) {
                    return computed(() => {
                        return entity2?.properties?.every(p => {
                            return p.name !== targetName2
                        })
                    })
                },
                nameUnique({ targetName1, entity1, entity2, targetName2 }) {
                    return computed(() => {
                        return !(entity1 === entity2 && targetName1 === targetName2)
                    })
                }
            }
        },
    }
})