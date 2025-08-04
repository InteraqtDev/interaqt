import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { PropertyInstance } from './Property.js';
import type { ComputationInstance } from './types.js';
import type { RelationInstance } from './Relation.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export interface EntityInstance extends IInstance {
  name: string;
  properties: PropertyInstance[];
  computation?: ComputationInstance;
  baseEntity?: EntityInstance | RelationInstance; // for Filtered Entity
  matchExpression?: object; // for Filtered Entity
}

export interface EntityCreateArgs {
  name: string;
  properties?: PropertyInstance[];
  computation?: ComputationInstance;
  baseEntity?: EntityInstance | RelationInstance;
  matchExpression?: object;
}

export class Entity implements EntityInstance {
  public uuid: string;
  public _type = 'Entity';
  public _options?: { uuid?: string };
  public name: string;
  public properties: PropertyInstance[];
  public computation?: ComputationInstance;
  public baseEntity?: EntityInstance | RelationInstance;
  public matchExpression?: object;
  
  constructor(args: EntityCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.properties = args.properties || [];
    this.computation = args.computation;
    this.baseEntity = args.baseEntity;
    this.matchExpression = args.matchExpression;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Entity';
  static instances: EntityInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      constraints: {
        nameFormat: ({name}: { name: string }) => {
          return validNameFormatExp.test(name);
        }
      }
    },
    properties: {
      type: 'Property' as const,
      collection: true as const,
      required: true as const,
      constraints: {
        eachNameUnique: ({properties}: {properties: PropertyInstance[]}) => {
          const uniqueNames = new Set(properties.map((p: PropertyInstance) => p.name));
          return uniqueNames.size === properties.length;
        }
      },
      defaultValue: () => []
    },
    computation: {
      type: [] as const,
      collection: false as const,
      required: false as const,
    },
    baseEntity: {
      type: ['Entity', 'Relation'] as const,
      collection: false as const,
      required: false as const,
    },
    matchExpression: {
      type: 'object' as const,
      collection: false as const,
      required: false as const,
    }
  };
  
  static create(args: EntityCreateArgs, options?: { uuid?: string }): EntityInstance {
    const instance = new Entity(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Entity`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: EntityInstance): string {
    const args: EntityCreateArgs = {
      name: instance.name,
      properties: instance.properties,
      computation: instance.computation,
      baseEntity: instance.baseEntity,
      matchExpression: instance.matchExpression
    };
    
    const data: SerializedData<EntityCreateArgs> = {
      type: 'Entity',
      options: { uuid: instance.uuid },
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: EntityInstance, deep: boolean): EntityInstance {
    const args: EntityCreateArgs = {
      name: instance.name,
      properties: [...instance.properties],
      computation: instance.computation,
      baseEntity: instance.baseEntity,
      matchExpression: instance.matchExpression
    };
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is EntityInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Entity';
  }
  
  static check(data: unknown): boolean {
    if (data === null || typeof data !== 'object') return false;
    
    // 如果是完整的 Entity 实例
    if ('_type' in data && (data as IInstance)._type === 'Entity') {
      return true;
    }
    
    // 如果是实体引用（有 id 属性）
    if ('id' in data) {
      return true;
    }
    
    // 如果是新创建的实体数据（至少有一些属性）
    if (Object.keys(data).length > 0) {
      return true;
    }
    
    return false;
  }
  
  static parse(json: string): EntityInstance {
    const data: SerializedData<EntityCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 