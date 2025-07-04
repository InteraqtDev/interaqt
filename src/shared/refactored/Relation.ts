import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { PropertyInstance } from './Property.js';
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
}

export interface RelationCreateArgs {
  name?: string;
  source: EntityInstance | RelationInstance;
  sourceProperty: string;
  target: EntityInstance | RelationInstance;
  targetProperty: string;
  isTargetReliance?: boolean;
  type: string;
  computation?: ComputationInstance;
  properties?: PropertyInstance[];
}

export class Relation implements RelationInstance {
  public uuid: string;
  public _type = 'Relation';
  public _options?: { uuid?: string };
  public name?: string;
  public source: EntityInstance | RelationInstance;
  public sourceProperty: string;
  public target: EntityInstance | RelationInstance;
  public targetProperty: string;
  public isTargetReliance: boolean;
  public type: string;
  public computation?: ComputationInstance;
  public properties: PropertyInstance[];
  
  constructor(args: RelationCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.source = args.source;
    this.sourceProperty = args.sourceProperty;
    this.target = args.target;
    this.targetProperty = args.targetProperty;
    this.isTargetReliance = args.isTargetReliance ?? false;
    this.type = args.type;
    this.computation = args.computation;
    this.properties = args.properties || [];
    
    // 始终使用计算出的完整名称
    this.name = `${args.source.name}_${args.sourceProperty}_${args.targetProperty}_${args.target.name}`;
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
    if (instance.name !== undefined) args.name = instance.name;
    if (instance.computation !== undefined) args.computation = instance.computation;
    
    const data: SerializedData<RelationCreateArgs> = {
      type: 'Relation',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: RelationInstance, deep: boolean): RelationInstance {
    const args: RelationCreateArgs = {
      source: instance.source,
      sourceProperty: instance.sourceProperty,
      target: instance.target,
      targetProperty: instance.targetProperty,
      isTargetReliance: instance.isTargetReliance,
      type: instance.type,
      properties: instance.properties
    };
    if (instance.name !== undefined) args.name = instance.name;
    if (instance.computation !== undefined) args.computation = instance.computation;
    
    return this.create(args);
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