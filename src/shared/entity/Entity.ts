import {createClass, getInstance, Klass} from "../createClass.js";

export enum PropertyTypes {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
}

const validNameFormatExp = /^[a-zA-Z0-9_]+$/

// Define types for Property, Entity, and Relation to avoid circular references
type PropertyPublic = {
    name: {
        type: 'string',
        required: true,
        constraints: {
            format: (arg: { name: string }) => boolean,
            length: (arg: { name: string }) => boolean
        }
    },
    type: {
        type: 'string',
        required: true,
        options: () => string[]
    },
    collection: {
        type: 'boolean',
        required: false,
    },
    defaultValue: {
        type: 'function',
        required: false,
    },
    computed: {
        type: 'function',
        required: false,
    },
    computedData: {
        type: Klass<any>[],
        collection: false,
        required: false,
    }
};

type EntityPublic = {
    name: {
        type: 'string',
        required: true,
        constraints: {
            nameFormat: (arg: { name: string }) => boolean
        }
    },
    properties: {
        type: Klass<PropertyPublic>,
        collection: true,
        required: true,
        constraints: {
            eachNameUnique: (arg: { properties: any[] }) => boolean
        },
        defaultValue: () => any[]
    },
    computedData: {
        type: Klass<any>[],
        collection: false,
        required: false,
    },
    // Filtered Entity 字段 - 从哪个 entity 过滤
    sourceEntity: {
        type: 'string',
        collection: false,
        required: false,
    },
    // Filtered Entity 字段 - 过滤条件（使用 MatchExp 格式）
    filterCondition: {
        type: 'object',
        collection: false,
        required: false,
    }
};

export const Property: Klass<PropertyPublic> = createClass({
    name: 'Property',
    display: (obj: any) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            constraints: {
                format({name}: { name: string }) {
                    return validNameFormatExp.test(name);
                },
                length({name}: { name: string }) {
                    return name.length > 1 && name.length < 5;
                }
            }
        },
        // 这个是 property 的类型
        type: {
            type: 'string',
            required: true,
            options: () => Object.values(PropertyTypes)
        },
        collection: {
            type: 'boolean',
            required: false,
        },
        // 这个是 property 的值
        defaultValue: {
            type: 'function',
            required: false,
        },
        // 这个是 property 的值的类型
        computed: {
            type: 'function',
            required: false,
        },
        computedData: {
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: [] as Klass<any>[],
            collection: false,
            required: false,
        }
    },
    constraints: {
        entityNameUnique(thisInstance: object, allInstances: object[]) {
            const entities = allInstances as any[];
            const uniqueNames = new Set(entities.map(e => e.name));
            return uniqueNames.size === entities.length;
        }
    }
})

// CAUTION 这里的 Entity 是 Concept 的一种
export const Entity: Klass<EntityPublic> = createClass({
    name: 'Entity',
    display: (obj: any) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            constraints: {
                nameFormat({name}: { name: string }) {
                    return validNameFormatExp.test(name);
                }
            }
        },
        properties: {
            type: Property,
            collection: true,
            required: true,
            constraints: {
                eachNameUnique({properties}) {
                    const uniqueNames = new Set(properties.map((p: any) => p.name));
                    return uniqueNames.size === properties.length;
                }
            },
            defaultValue() {
                return []
            }
        },
        computedData: {
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: [] as Klass<any>[],
            collection: false,
            required: false,
        },
        // Filtered Entity 字段 - 从哪个 entity 过滤
        sourceEntity: {
            type: 'string',
            collection: false,
            required: false,
        },
        // Filtered Entity 字段 - 过滤条件（使用 MatchExp 格式）
        filterCondition: {
            type: 'object',
            collection: false,
            required: false,
        }
    }
})

// Define a simplified RelationPublic type that matches the actual implementation
export type RelationPublic = {
    name: {
        type: 'string',
        required: false,
        collection: false,
        computed: (relation: any) => string
    },
    source: {
        type: (typeof Entity | typeof Relation)[],
        required: true,
        collection: false,
        options: () => any[]
    },
    sourceProperty: {
        type: 'string',
        required: true,
        collection: false,
        constraints: {
            nameNotSameWithProp: (thisInstance: any) => boolean,
            nameUnique: (thisInstance: any) => boolean
        }
    },
    target: {
        type: (typeof Entity | typeof Relation)[],
        required: true,
        collection: false,
        options: () => any[]
    },
    targetProperty: {
        type: 'string',
        required: true,
        collection: false,
        constraints: {
            nameNotSameWithProp: (thisInstance: any) => boolean,
            nameUnique: (thisInstance: any) => boolean
        }
    },
    isTargetReliance: {
        type: 'boolean',
        required: true,
        collection: false,
        defaultValue: () => boolean
    },
    relType: {
        type: 'string',
        collection: false,
        required: true,
        options: () => string[],
        defaultValue: () => string
    },
    type: {
        type: 'string',
        collection: false,
        required: true,
    },
    computedData: {
        type: Klass<any>[],
        collection: false,
        required: false,
    },
    properties: {
        type: typeof Property,
        collection: true,
        required: true,
        constraints: {
            eachNameUnique: (thisInstance: any) => boolean
        },
        defaultValue: () => any[]
    }
};

// Create a placeholder for Relation to avoid circular reference
const RELATION_PLACEHOLDER = {} as unknown as Klass<RelationPublic>;

// Use type assertion to avoid circular reference issues
export const Relation: Klass<RelationPublic> = createClass({
    name: 'Relation',
    display: (obj: any) => obj.name || `${obj.source?.name || 'unknown'} -> ${obj.target?.name || 'unknown'}`,
    public: {
        name: {
            type: 'string',
            required: false,
            collection: false,
            computed: (relation: any) => {
                if (relation.source && relation.target) {
                    return `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`
                }
                return ''
            }
        },
        source: {
            type: [Entity, RELATION_PLACEHOLDER],
            required: true,
            collection: false,
            options(): any[] {
                return [...getInstance(Entity), ...getInstance(Relation)]
            }
        },
        sourceProperty: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                nameNotSameWithProp(thisInstance: any) {
                    const relation = thisInstance as any;
                    if (!relation.source) return false;
                    return !relation.source.properties.some((p: any) => p.name === relation.sourceProperty);
                },
                nameUnique(thisInstance: any): boolean {
                    const relation = thisInstance as any;
                    if (!relation.source) return false;
                    const relations = getInstance(Relation).filter(r => (r as any).source === relation.source);
                    return !relations.some(r => r !== relation && (r as any).sourceProperty === relation.sourceProperty);
                }
            }
        },
        target: {
            type: [Entity, RELATION_PLACEHOLDER],
            required: true,
            collection: false,
            options() {
                return [...getInstance(Entity), ...getInstance(Relation)]
            }
        },
        targetProperty: {
            type: 'string',
            required: true,
            collection: false,
            constraints: {
                nameNotSameWithProp(thisInstance: any) {
                    const relation = thisInstance as any;
                    if (!relation.target) return false;
                    return !relation.target.properties.some((p: any) => p.name === relation.targetProperty);
                },
                nameUnique(thisInstance: any): boolean {
                    const relation = thisInstance as any;
                    if (!relation.target) return false;
                    const relations = getInstance(Relation).filter(r => (r as any).target === relation.target);
                    return !relations.some(r => r !== relation && (r as any).targetProperty === relation.targetProperty);
                }
            }
        },
        isTargetReliance: {
            type: 'boolean',
            required: true,
            collection: false,
            defaultValue() {
                return false
            }
        },
        relType: {
            type: 'string',
            required: true,
            collection: false,
            options() {
                return ['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany']
            },
            defaultValue() {
                return 'oneToOne'
            }
        },
        type: {
            type: 'string',
            required: true,
            collection: false,
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
                eachNameUnique(thisInstance: any) {
                    const relation = thisInstance as any;
                    const uniqueNames = new Set(relation.properties.map((p: any) => p.name));
                    return uniqueNames.size === relation.properties.length;
                }
            },
            defaultValue() {
                return []
            }
        }
    }
})

// Fix the source and target types to use the actual Relation class
Relation.public.source.type = [Entity, Relation];
Relation.public.target.type = [Entity, Relation];

// 这个是 PropertyTypeMap
export const PropertyTypeMap = {
    [PropertyTypes.String]: 'string',
    [PropertyTypes.Number]: 'number',
    [PropertyTypes.Boolean]: 'boolean',
}