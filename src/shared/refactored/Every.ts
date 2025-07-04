import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import type { EntityInstance, RelationInstance, AttributeQueryData, DataDependencies } from './types.js';

export interface EveryInstance extends IInstance {
  record: EntityInstance | RelationInstance;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
  notEmpty?: boolean;
}

export interface EveryCreateArgs {
  record: EntityInstance | RelationInstance;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
  notEmpty?: boolean;
}

export class Every implements EveryInstance {
  public uuid: string;
  public _type = 'Every';
  public _options?: { uuid?: string };
  public record: EntityInstance | RelationInstance;
  public direction?: string;
  public callback: Function;
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
  public notEmpty?: boolean;
  
  constructor(args: EveryCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.direction = args.direction;
    this.callback = args.callback;
    this.attributeQuery = args.attributeQuery;
    this.dataDeps = args.dataDeps;
    this.notEmpty = args.notEmpty;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Every';
  static instances: EveryInstance[] = [];
  
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
    },
    notEmpty: {
      type: 'boolean' as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: EveryCreateArgs, options?: { uuid?: string }): EveryInstance {
    const instance = new Every(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Every`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: EveryInstance): string {
    const args: Partial<EveryCreateArgs> = {
      record: stringifyAttribute(instance.record) as EntityInstance | RelationInstance,
      callback: stringifyAttribute(instance.callback) as Function
    };
    if (instance.direction !== undefined) args.direction = instance.direction;
    if (instance.attributeQuery !== undefined) args.attributeQuery = stringifyAttribute(instance.attributeQuery) as AttributeQueryData;
    if (instance.dataDeps !== undefined) args.dataDeps = instance.dataDeps;
    if (instance.notEmpty !== undefined) args.notEmpty = instance.notEmpty;
    
    const data: SerializedData<EveryCreateArgs> = {
      type: 'Every',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: EveryInstance, deep: boolean): EveryInstance {
    const args: EveryCreateArgs = {
      record: instance.record,
      callback: instance.callback
    };
    if (instance.direction !== undefined) args.direction = instance.direction;
    if (instance.attributeQuery !== undefined) args.attributeQuery = instance.attributeQuery;
    if (instance.dataDeps !== undefined) args.dataDeps = instance.dataDeps;
    if (instance.notEmpty !== undefined) args.notEmpty = instance.notEmpty;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is EveryInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Every';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): EveryInstance {
    const data: SerializedData<EveryCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.callback && typeof args.callback === 'string' && args.callback.startsWith('func::')) {
      args.callback = new Function('return ' + args.callback.substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 