import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import type { ComputationRecord, AttributeQueryData } from './types.js';

type EventDep = {
  recordName: string;
  type: 'create'|'delete'|'update';
};

export interface TransformInstance extends IInstance {
  record?: ComputationRecord;
  eventDeps?: {
    [key: string]: EventDep;
  };
  attributeQuery?: AttributeQueryData;
  callback: Function;
}

export interface TransformCreateArgs {
  record?: ComputationRecord;
  eventDeps?: {
    [key: string]: EventDep;
  };
  attributeQuery?: AttributeQueryData;
  callback: Function;
}

export class Transform implements TransformInstance {
  public uuid: string;
  public _type = 'Transform';
  public _options?: { uuid?: string };
  public record?: ComputationRecord;
  public eventDeps?: {
    [key: string]: EventDep;
  };
  public attributeQuery?: AttributeQueryData;
  public callback: Function;
  
  constructor(args: TransformCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.eventDeps = args.eventDeps;
    this.attributeQuery = args.attributeQuery;
    this.callback = args.callback;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Transform';
  static instances: TransformInstance[] = [];
  
  static public = {
    record: {
      type: ['Entity', 'Relation', 'Activity', 'Interaction'] as const,
      collection: false as const,
      required: true as const
    },
    attributeQuery: {
      instanceType: {} as unknown as AttributeQueryData,
      collection: false as const,
      required: false as const
    },
    callback: {
      type: 'function' as const,
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: TransformCreateArgs, options?: { uuid?: string }): TransformInstance {
    const instance = new Transform(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Transform`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: TransformInstance): string {
    const args: TransformCreateArgs = {
      record: stringifyAttribute(instance.record) as ComputationRecord,
      callback: stringifyAttribute(instance.callback) as Function
    };
    if (instance.attributeQuery !== undefined) args.attributeQuery = stringifyAttribute(instance.attributeQuery) as AttributeQueryData;
    
    const data: SerializedData<TransformCreateArgs> = {
      type: 'Transform',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: TransformInstance, deep: boolean): TransformInstance {
    return this.create({
      record: instance.record,
      attributeQuery: instance.attributeQuery,
      callback: instance.callback
    });
  }
  
  static is(obj: unknown): obj is TransformInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Transform';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): TransformInstance {
    const data = JSON.parse(json) as SerializedData<{
      record: ComputationRecord | string;
      attributeQuery?: AttributeQueryData;
      callback: Function | string;
    }>;
    const args = { ...data.public } as { record: ComputationRecord | string; attributeQuery?: AttributeQueryData; callback: Function | string; };
    
    // 反序列化函数
    if (typeof args.callback === 'string' && args.callback.startsWith('func::')) {
      args.callback = new Function('return ' + args.callback.substring(6))();
    }
    
    return this.create(args as TransformCreateArgs, data.options);
  }
} 