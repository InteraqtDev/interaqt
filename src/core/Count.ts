import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { validateCreateArgs, type PublicFieldDef } from './klassValidation.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import type { EntityInstance, RelationInstance, AttributeQueryData, DataDependencies } from './types.js';
import { Entity } from './Entity.js';
import { Relation } from './Relation.js';

export interface CountInstance extends IInstance {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  callback?: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
}

export interface CountCreateArgs {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  callback?: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
}

export class Count implements CountInstance {
  public uuid: string;
  public _type = 'Count';
  public _options?: { uuid?: string };
  public record?: EntityInstance | RelationInstance;
  public property?: string;
  public direction?: string;
  public callback?: Function;
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
  
  constructor(args: CountCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.property = args.property;
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
      required: false as const
    },
    property: {
      type: 'string' as const,
      collection: false as const,
      required: false as const
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
    // 统一声明期校验（r16 建议 4 / r26 落地）：static.public 的 required/options/constraints
    //  在 create 时执行；record/property 二选一是聚合的结构性前提（缺失时 Scheduler 深处才炸）。
    validateCreateArgs(this.displayName, this.public as unknown as Record<string, PublicFieldDef>, args as unknown as Record<string, unknown>);
    if (!args.record && !args.property) {
      throw new Error(`${this.displayName}.create() requires either "record" (target entity/relation) or "property" (host relation property).`);
    }
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
    return stringifyInstance(this, instance);
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
      property: instance.property,
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
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}