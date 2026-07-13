import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { validateCreateArgs, type PublicFieldDef } from './klassValidation.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import type { EntityInstance, RelationInstance, AttributeQueryData, DataDependencies } from './types.js';

export interface WeightedSummationInstance extends IInstance {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
}

export interface WeightedSummationCreateArgs {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData;
  dataDeps?: DataDependencies;
}

export class WeightedSummation implements WeightedSummationInstance {
  public uuid: string;
  public _type = 'WeightedSummation';
  public _options?: { uuid?: string };
  public record?: EntityInstance | RelationInstance;
  public property?: string;
  public direction?: string;
  public callback: Function;
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
  
  constructor(args: WeightedSummationCreateArgs, options?: { uuid?: string }) {
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
  static displayName = 'WeightedSummation';
  static instances: WeightedSummationInstance[] = [];
  
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
  
  static create(args: WeightedSummationCreateArgs, options?: { uuid?: string }): WeightedSummationInstance {
    // 统一声明期校验（r16 建议 4 / r26 落地）：static.public 的 required/options/constraints
    //  在 create 时执行；record/property 二选一是聚合的结构性前提（缺失时 Scheduler 深处才炸）。
    validateCreateArgs(this.displayName, this.public as unknown as Record<string, PublicFieldDef>, args as unknown as Record<string, unknown>);
    if (!args.record && !args.property) {
      throw new Error(`${this.displayName}.create() requires either "record" (target entity/relation) or "property" (host relation property).`);
    }
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
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: WeightedSummationInstance, deep: boolean): WeightedSummationInstance {
    return this.create({
      record: instance.record,
      property: instance.property,
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
    const data: SerializedData<WeightedSummationCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 