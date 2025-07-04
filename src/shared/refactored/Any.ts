import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import type { AttributeQueryData, DataDependencies, EntityInstance, RelationInstance } from './types.js';
import { stringifyAttribute } from './utils.js';

export interface AnyInstance extends IInstance {
  record: EntityInstance | RelationInstance;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: DataDependencies;
}

export interface AnyCreateArgs {
  record: EntityInstance | RelationInstance;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: DataDependencies;
}

export class Any implements AnyInstance {
  public uuid: string;
  public _type = 'Any';
  public _options?: { uuid?: string };
  public record: EntityInstance | RelationInstance;
  public direction?: string;
  public callback: Function;
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
  
  constructor(args: AnyCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.direction = args.direction;
    this.callback = args.callback;
    this.attributeQuery = args.attributeQuery;
    this.dataDeps = args.dataDeps;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Any';
  static instances: AnyInstance[] = [];
  
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
    callback: {
      type: 'function' as const,
      collection: false as const,
      required: true as const
    },
    attributeQuery: {
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: false as const
    },
    dataDeps: {
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: AnyCreateArgs, options?: { uuid?: string }): AnyInstance {
    const instance = new Any(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Any`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: AnyInstance): string {
    const args: Partial<AnyCreateArgs> = {
      record: stringifyAttribute(instance.record) as EntityInstance | RelationInstance,
      callback: stringifyAttribute(instance.callback) as Function
    };
    if (instance.direction !== undefined) args.direction = instance.direction;
    if (instance.attributeQuery !== undefined) args.attributeQuery = stringifyAttribute(instance.attributeQuery) as AttributeQueryData;
    if (instance.dataDeps !== undefined) args.dataDeps = instance.dataDeps;
    
    const data: SerializedData<AnyCreateArgs> = {
      type: 'Any',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: AnyInstance, deep: boolean): AnyInstance {
    return this.create({
      record: instance.record,
      direction: instance.direction,
      callback: instance.callback,
      attributeQuery: instance.attributeQuery,
      dataDeps: instance.dataDeps
    });
  }
  
    static is(obj: unknown): obj is AnyInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Any';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): AnyInstance {
    const data: SerializedData<AnyCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.callback && typeof args.callback === 'string' && args.callback.startsWith('func::')) {
      args.callback = new Function('return ' + args.callback.substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 