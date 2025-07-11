import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import type { EntityInstance, RelationInstance, AttributeQueryData, DataDependencies } from './types.js';
import { Entity } from './Entity.js';
import { Relation } from './Relation.js';

export interface CountInstance extends IInstance {
  record: EntityInstance | RelationInstance;
  direction?: string;
  callback?: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
}

export interface CountCreateArgs {
  record: EntityInstance | RelationInstance;
  direction?: string;
  callback?: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
}

export class Count implements CountInstance {
  public uuid: string;
  public _type = 'Count';
  public _options?: { uuid?: string };
  public record: EntityInstance | RelationInstance;
  public direction?: string;
  public callback?: Function;
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
  
  constructor(args: CountCreateArgs, options?: { uuid?: string }) {
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
  static displayName = 'Count';
  static instances: CountInstance[] = [];
  
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
      required: false as const
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
  
  static create(args: CountCreateArgs, options?: { uuid?: string }): CountInstance {
    const instance = new Count(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Count`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: CountInstance): string {
    const args: CountCreateArgs = {
      record: instance.record,
      direction: instance.direction,
      attributeQuery: instance.attributeQuery ? stringifyAttribute(instance.attributeQuery) as AttributeQueryData : undefined,
      dataDeps: instance.dataDeps,
      callback: instance.callback ? stringifyAttribute(instance.callback) as Function : undefined
    };
    
    const data: SerializedData<CountCreateArgs> = {
      type: 'Count',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: CountInstance, deep: boolean): CountInstance {
    // 对于 Entity 和 Relation，即使是深度克隆，也只克隆引用
    // 因为它们是全局单例管理的
    let record = instance.record;
    if (deep) {
      // 如果是深度克隆，对 Entity 或 Relation 调用它们的 clone 方法
      if (Entity.is(instance.record)) {
        record = Entity.clone(instance.record, deep);
      } else if (Relation.is(instance.record)) {
        record = Relation.clone(instance.record, deep);
      }
    }
    
    return this.create({
      record: record,
      direction: instance.direction,
      callback: instance.callback,
      attributeQuery: instance.attributeQuery,
      dataDeps: instance.dataDeps
    });
  }
  
    static is(obj: unknown): obj is CountInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Count';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): CountInstance {
    const data: SerializedData<CountCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.callback && typeof args.callback === 'string' && (args.callback as any).startsWith('func::')) {
      args.callback = new Function('return ' + (args.callback as any).substring(6))();
    }
    
    return this.create(args, data.options);
  }
}