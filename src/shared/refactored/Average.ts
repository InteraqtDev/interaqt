import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import type { EntityInstance, RelationInstance, AttributeQueryData } from './types.js';

export interface AverageInstance extends IInstance {
  record: EntityInstance | RelationInstance;
  direction?: string;
  attributeQuery: AttributeQueryData;
}

export interface AverageCreateArgs {
  record: EntityInstance | RelationInstance;
  direction?: string;
  attributeQuery: AttributeQueryData;
}

export class Average implements AverageInstance {
  public uuid: string;
  public _type = 'Average';
  public _options?: { uuid?: string };
  public record: EntityInstance | RelationInstance;
  public direction?: string;
  public attributeQuery: AttributeQueryData;
  
  constructor(args: AverageCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.direction = args.direction;
    this.attributeQuery = args.attributeQuery;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Average';
  static instances: AverageInstance[] = [];
  
  static public = {
    record: {
      type: ['Entity', 'Relation'] as const,
      collection: false as const,
      required: true as const
    },
    direction: {
      type: 'string' as const,
      collection: false as const,
      required: false as const
    },
    attributeQuery: {
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: AverageCreateArgs, options?: { uuid?: string }): AverageInstance {
    const instance = new Average(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Average`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: AverageInstance): string {
    const args: Partial<AverageCreateArgs> = {
      record: stringifyAttribute(instance.record) as EntityInstance | RelationInstance,
      attributeQuery: stringifyAttribute(instance.attributeQuery) as AttributeQueryData
    };
    if (instance.direction !== undefined) args.direction = instance.direction;
    
    const data: SerializedData<AverageCreateArgs> = {
      type: 'Average',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: AverageInstance, deep: boolean): AverageInstance {
    return this.create({
      record: instance.record,
      direction: instance.direction,
      attributeQuery: instance.attributeQuery
    });
  }
  
    static is(obj: unknown): obj is AverageInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Average';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): AverageInstance {
    const data: SerializedData<AverageCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 