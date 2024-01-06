import {Atom, computed, incPick, incUnique} from 'data0'
import {createClass, getInstance, Klass, KlassInstance} from "../createClass.js";


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
        },
        computed: {
            required: false,
            type: "function",
            collection: false,
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
            type: [] as Klass<any>[],
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


export type RelationPublic = {
    name: {
        // TODO 是自动根据 entity/attribute 生成的，应该怎么表示？
        type: 'string',
        required: false,
        collection: false,
        // fixme type
        computed: (relation: any) => any
    },
    source: {
        // source 可以是 Entity 或者 relation
        // CAUTION 理论上应该改成 Entity 和 Relation 的交集，这里先强行这样实现了
        type: typeof Entity | Klass<RelationPublic>,
        required: true,
        collection: false,
        options: () => (KlassInstance<typeof Entity, any>|KlassInstance<Klass<RelationPublic>, any>)[]
    },
    sourceProperty: {
        type: 'string',
        required: true,
        collection: false,
        constraints: {
            [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string
        }
    }
    target: {
        type: typeof Entity,
        required: true,
        collection: false,
        options: () => (KlassInstance<typeof Entity, any>|KlassInstance<Klass<RelationPublic>, any>)[]
    },
    targetProperty: {
        type: 'string',
        required: true,
        collection: false,
        constraints: {
            [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string
        },
    }
    isTargetReliance: {
        type: 'boolean',
        required: true,
        collection:false,
        defaultValue:() => boolean
    },
    relType: {
        type: 'string',
        collection: false,
        required: true,
        options: () => string[]
        defaultValue: () => [string]
    }
    computedData: {
        // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
        type: Klass<any>[],
        collection: false,
        required: false,
    },
    properties: {
        type: typeof Property,
        collection: true,
        required: true,
        constraints: {
            [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string
        },
        defaultValue: () => any[]
    }
}

export const Relation = createClass({
    name: 'Relation',
    display: (instance) => ``,
    public: {
        name: {
            // TODO 是自动根据 entity/attribute 生成的，应该怎么表示？
            type: 'string',
            required: false,
            collection: false,
            // fixme type
            computed: (relation: any) => {
                return `${relation.source!.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target!.name}`
            }
        },
        source: {
            // source 可以是 Entity 或者 relation
            // CAUTION 理论上应该改成 Entity 和 Relation 的交集，这里先强行这样实现了
            type: [Entity] as unknown as typeof Entity,
            required: true,
            collection: false,
            options() {
                return getInstance(Entity)
            }
        },
        sourceProperty: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                nameNotSameWithProp(relation:KlassInstance<Klass<RelationPublic>, false>) {
                    return computed(() => {
                        const {source, sourceProperty} = relation
                        return source?.properties?.every((p) => {
                            return p.name !== sourceProperty
                        })
                    })
                },
                nameUnique(relation:KlassInstance<Klass<RelationPublic>, false>) {
                    return computed(() => {
                        const {source, target, sourceProperty, targetProperty} = relation
                        return !(source === target && sourceProperty === targetProperty)
                    })
                }
            }
        },
        target: {
            type: Entity,
            required: true,
            collection: false,
            options() {
                return getInstance(Entity)
            }
        },
        targetProperty: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                nameNotSameWithProp(relation:KlassInstance<Klass<RelationPublic>, false>) {
                    return computed(() => {
                        const {target, targetProperty} = relation
                        return target?.properties?.every((p) => {
                            return p.name !== targetProperty
                        })
                    })
                },
                nameUnique(relation:KlassInstance<Klass<RelationPublic>, false>) {
                    return computed(() => {
                        const {source, target, sourceProperty, targetProperty} = relation
                        return !(source === target && sourceProperty === targetProperty)
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
                eachNameUnique(relation:KlassInstance<Klass<RelationPublic>, false>) {
                    // CAUTION 这里取的是 leaf atom，不然到 incUnique 里面已经监听不到  name string 的变化了。
                    // FIXME 实例化之后 property 不是个 Class 吗？它的 name 就是个 atom，也没有 $name 这个属性，如何统一？？？
                    return computed(() => {
                        const {properties} = relation
                        const uniqueNames = incUnique(incPick(properties, '$name'))
                        return computed(() => {
                            return uniqueNames.size === properties.length
                        })
                    })
                }
            },
            defaultValue() {
                return []
            }
        },
    } as RelationPublic
})
// CAUTION Relation 可以作为 source
// FIXME type relation 和 entity 的 public type 最好都单独定义
// @ts-ignore
Relation.public.source.type.push(Relation)

export const RecordMutationSideEffect = createClass({
    name: 'RecordMutationSideEffect',
    public: {
        name: {
            type: 'string',
            collection: false,
            required: true
        },
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        content: {
            type: 'function',
            collection: false,
            required: true
        }
    }
})