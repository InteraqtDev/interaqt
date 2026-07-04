import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import type { AttributeQueryData, DataDependencies } from './types.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';

export interface RealTimeInstance extends IInstance {
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: DataDependencies;
  nextRecomputeTime?: Function;
  callback: Function;
}

export interface RealTimeCreateArgs {
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: DataDependencies;
  nextRecomputeTime?: Function;
  callback: Function;
}

export class RealTime implements RealTimeInstance {
  public uuid: string;
  public _type = 'RealTimeValue';
  public _options?: { uuid?: string };
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
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
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: false as const
    },
    dataDeps: {
      instanceType: {} as unknown as {[key: string]: unknown},
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
    return stringifyInstance(this, instance);
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
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'RealTimeValue';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): RealTimeInstance {
    const data = JSON.parse(json) as SerializedData<RealTimeCreateArgs>;
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 