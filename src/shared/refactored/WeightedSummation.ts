import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';

export interface WeightedSummationInstance extends IInstance {
  record: any; // Entity or Relation
  direction?: string;
  callback: Function;
  attributeQuery?: any; // AttributeQueryData
  dataDeps?: {[key: string]: any};
}

export interface WeightedSummationCreateArgs {
  record: any; // Entity or Relation
  direction?: string;
  callback: Function;
  attributeQuery?: any; // AttributeQueryData
  dataDeps?: {[key: string]: any};
}

export class WeightedSummation implements WeightedSummationInstance {
  public uuid: string;
  public _type = 'WeightedSummation';
  public _options?: { uuid?: string };
  public record: any;
  public direction?: string;
  public callback: Function;
  public attributeQuery?: any;
  public dataDeps?: {[key: string]: any};
  
  constructor(args: WeightedSummationCreateArgs, options?: { uuid?: string }) {
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
  static displayName = 'WeightedSummation';
  static instances: WeightedSummationInstance[] = [];
  
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
      instanceType: {} as unknown as any,
      collection: false as const,
      required: false as const
    },
    dataDeps: {
      instanceType: {} as unknown as {[key: string]: any},
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: WeightedSummationCreateArgs, options?: { uuid?: string }): WeightedSummationInstance {
    const instance = new WeightedSummation(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, WeightedSummation`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: WeightedSummationInstance): string {
    const args: Partial<WeightedSummationCreateArgs> = {
      record: stringifyAttribute(instance.record),
      callback: stringifyAttribute(instance.callback) as Function
    };
    if (instance.direction !== undefined) args.direction = instance.direction;
    if (instance.attributeQuery !== undefined) args.attributeQuery = stringifyAttribute(instance.attributeQuery);
    if (instance.dataDeps !== undefined) args.dataDeps = instance.dataDeps;
    
    const data: SerializedData<any> = {
      type: 'WeightedSummation',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: WeightedSummationInstance, deep: boolean): WeightedSummationInstance {
    return this.create({
      record: instance.record,
      direction: instance.direction,
      callback: instance.callback,
      attributeQuery: instance.attributeQuery,
      dataDeps: instance.dataDeps
    });
  }
  
    static is(obj: unknown): obj is WeightedSummationInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'WeightedSummation';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): WeightedSummationInstance {
    const data: SerializedData<any> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.callback && typeof args.callback === 'string' && args.callback.startsWith('func::')) {
      args.callback = new Function('return ' + args.callback.substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 