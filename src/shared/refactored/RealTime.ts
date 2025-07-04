import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import type { AttributeQueryData, DataDependencies } from './types.js';
import { stringifyAttribute } from './utils.js';

export interface RealTimeInstance extends IInstance {
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: {[key: string]: any};
  nextRecomputeTime?: Function;
  callback: Function;
}

export interface RealTimeCreateArgs {
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: {[key: string]: any};
  nextRecomputeTime?: Function;
  callback: Function;
}

export class RealTime implements RealTimeInstance {
  public uuid: string;
  public _type = 'RealTimeValue';
  public _options?: { uuid?: string };
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: {[key: string]: any};
  public nextRecomputeTime?: Function;
  public callback: Function;
  
  constructor(args: RealTimeCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.attributeQuery = args.attributeQuery;
    this.dataDeps = args.dataDeps;
    this.nextRecomputeTime = args.nextRecomputeTime;
    this.callback = args.callback;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'RealTimeValue';
  static instances: RealTimeInstance[] = [];
  
  static public = {
    attributeQuery: {
      instanceType: {} as unknown as any,
      collection: false as const,
      required: false as const
    },
    dataDeps: {
      instanceType: {} as unknown as {[key: string]: any},
      collection: false as const,
      required: false as const
    },
    nextRecomputeTime: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    callback: {
      type: 'function' as const,
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: RealTimeCreateArgs, options?: { uuid?: string }): RealTimeInstance {
    const instance = new RealTime(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, RealTimeValue`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: RealTimeInstance): string {
    const args: any = {
      callback: stringifyAttribute(instance.callback)
    };
    if (instance.attributeQuery !== undefined) args.attributeQuery = stringifyAttribute(instance.attributeQuery);
    if (instance.dataDeps !== undefined) args.dataDeps = instance.dataDeps;
    if (instance.nextRecomputeTime !== undefined) args.nextRecomputeTime = stringifyAttribute(instance.nextRecomputeTime);
    
    const data: SerializedData<any> = {
      type: 'RealTimeValue',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: RealTimeInstance, deep: boolean): RealTimeInstance {
    const args: RealTimeCreateArgs = {
      callback: instance.callback
    };
    if (instance.attributeQuery !== undefined) args.attributeQuery = instance.attributeQuery;
    if (instance.dataDeps !== undefined) args.dataDeps = instance.dataDeps;
    if (instance.nextRecomputeTime !== undefined) args.nextRecomputeTime = instance.nextRecomputeTime;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is RealTimeInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'RealTime';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): RealTimeInstance {
    const data: SerializedData<any> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.callback && typeof args.callback === 'string' && args.callback.startsWith('func::')) {
      args.callback = new Function('return ' + args.callback.substring(6))();
    }
    if (args.nextRecomputeTime && typeof args.nextRecomputeTime === 'string' && args.nextRecomputeTime.startsWith('func::')) {
      args.nextRecomputeTime = new Function('return ' + args.nextRecomputeTime.substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 