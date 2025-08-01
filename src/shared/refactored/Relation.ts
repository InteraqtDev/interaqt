import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { PropertyInstance, Property } from './Property.js';
import { EntityInstance } from './Entity.js';
import type { ComputationInstance } from './types.js';

export interface RelationInstance extends IInstance {
  name?: string;
  source: EntityInstance | RelationInstance;
  sourceProperty: string;
  target: EntityInstance | RelationInstance;
  targetProperty: string;
  isTargetReliance: boolean;
  type: string; // '1:1', '1:n', 'n:1', 'n:n'
  computation?: ComputationInstance;
  properties: PropertyInstance[];
  sourceRelation?: RelationInstance; // for Filtered Relation
  matchExpression?: object; // for Filtered Relation
}

export interface RelationCreateArgs {
  name?: string;
  source?: EntityInstance | RelationInstance;
  sourceProperty?: string;
  target?: EntityInstance | RelationInstance;
  targetProperty?: string;
  isTargetReliance?: boolean;
  type?: string;
  computation?: ComputationInstance;
  properties?: PropertyInstance[];
  sourceRelation?: RelationInstance;
  matchExpression?: object;
}

export class Relation implements RelationInstance {
  public uuid: string;
  public _type = 'Relation';
  public _options?: { uuid?: string };
  private _name?: string;
  public source: EntityInstance | RelationInstance;
  public sourceProperty: string;
  public target: EntityInstance | RelationInstance;
  public targetProperty: string;
  public isTargetReliance: boolean;
  public type: string;
  public computation?: ComputationInstance;
  public properties: PropertyInstance[];
  public sourceRelation?: RelationInstance;
  public matchExpression?: object;
  
  // Getter for name that returns computed name if _name is undefined
  get name(): string | undefined {
    if (this._name !== undefined) {
      return this._name;
    }
    // Use computed name if available
    return Relation.public.name.computed ? Relation.public.name.computed(this) : undefined;
  }
  
  // Setter for name
  set name(value: string | undefined) {
    this._name = value;
  }
  
  constructor(args: RelationCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    
    // For filtered relation, inherit from sourceRelation
    if (args.sourceRelation) {
      // Filtered relation must have sourceProperty and targetProperty
      if (!args.sourceProperty || !args.targetProperty) {
        throw new Error('Filtered relation must have sourceProperty and targetProperty');
      }
      
      this.sourceRelation = args.sourceRelation;
      this.matchExpression = args.matchExpression;
      this.source = args.sourceRelation.source;
      this.sourceProperty = args.sourceProperty;
      this.target = args.sourceRelation.target;
      this.targetProperty = args.targetProperty;
      this.isTargetReliance = args.sourceRelation.isTargetReliance;
      this.type = args.sourceRelation.type;
      this._name = args.name; // name is optional for filtered relation
    } else {
      // Normal relation, require all fields
      if (!args.source || !args.sourceProperty || !args.target || !args.targetProperty || !args.type) {
        throw new Error('Relation requires source, sourceProperty, target, targetProperty, and type');
      }
      
      this.source = args.source;
      this.sourceProperty = args.sourceProperty;
      this.target = args.target;
      this.targetProperty = args.targetProperty;
      this.type = args.type;
      // Use provided name or leave undefined (will use computed name)
      this._name = args.name;
    }
    
    // Common fields
    this.isTargetReliance = args.isTargetReliance ?? false;
    this.computation = args.computation;
    this.properties = args.properties || [];
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Relation';
  static instances: RelationInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: false as const,
      collection: false as const,
      computed: (relation: RelationInstance) => {
        if (relation.source && relation.target) {
          return `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
        }
        return '';
      }
    },
    source: {
      type: ['Entity', 'Relation'] as const,
      required: true as const,
      collection: false as const,
    },
    sourceProperty: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    target: {
      type: ['Entity', 'Relation'] as const,
      required: true as const,
      collection: false as const,
    },
    targetProperty: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    isTargetReliance: {
      type: 'boolean' as const,
      required: true as const,
      collection: false as const,
      defaultValue: () => false
    },
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    computation: {
      type: [] as const,
      collection: false as const,
      required: false as const,
    },
    properties: {
      type: 'Property' as const,
      collection: true as const,
      required: true as const,
      constraints: {
        eachNameUnique: (thisInstance: RelationInstance) => {
          const uniqueNames = new Set(thisInstance.properties.map((p: PropertyInstance) => p.name));
          return uniqueNames.size === thisInstance.properties.length;
        }
      },
      defaultValue: () => []
    },
    sourceRelation: {
      type: 'Relation' as const,
      collection: false as const,
      required: false as const,
    },
    matchExpression: {
      type: 'object' as const,
      collection: false as const,
      required: false as const,
    }
  };
  
  static create(args: RelationCreateArgs, options?: { uuid?: string }): RelationInstance {
    const instance = new Relation(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Relation`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: RelationInstance): string {
    const args: RelationCreateArgs = {
      source: instance.source,
      sourceProperty: instance.sourceProperty,
      target: instance.target,
      targetProperty: instance.targetProperty,
      isTargetReliance: instance.isTargetReliance,
      type: instance.type,
      properties: instance.properties
    };
    
    // Use the private _name field if the instance is a Relation class instance
    const name = (instance as any)._name ?? instance.name;
    if (name !== undefined) args.name = name;
    
    if (instance.computation !== undefined) args.computation = instance.computation;
    if (instance.sourceRelation !== undefined) args.sourceRelation = instance.sourceRelation;
    if (instance.matchExpression !== undefined) args.matchExpression = instance.matchExpression;
    
    const data: SerializedData<RelationCreateArgs> = {
      type: 'Relation',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    
    return JSON.stringify(data);
  }
  
  static clone(instance: RelationInstance, deep = false): RelationInstance {
    const args: RelationCreateArgs = {
      source: instance.source,
      sourceProperty: instance.sourceProperty,
      target: instance.target,
      targetProperty: instance.targetProperty,
      isTargetReliance: instance.isTargetReliance,
      type: instance.type,
      properties: instance.properties?.map(p => Property.clone(p, deep))
    };
    
    // Use the private _name field if the instance is a Relation class instance
    const name = (instance as any)._name ?? instance.name;
    if (name !== undefined) args.name = name;
    
    if (instance.computation !== undefined) args.computation = instance.computation; // Note: This is a reference, not a deep clone
    if (instance.sourceRelation !== undefined) args.sourceRelation = instance.sourceRelation;
    if (instance.matchExpression !== undefined) args.matchExpression = instance.matchExpression;
    
    return new Relation(args, instance._options);
  }
  
  static is(obj: unknown): obj is RelationInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Relation';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): RelationInstance {
    const data: SerializedData<RelationCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 