import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { validateCreateArgs, type PublicFieldDef } from './klassValidation.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import type { EntityInstance, RelationInstance, AttributeQueryData } from './types.js';

export interface SummationInstance extends IInstance {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  attributeQuery: AttributeQueryData;
}

export interface SummationCreateArgs {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  attributeQuery: AttributeQueryData;
}

export class Summation implements SummationInstance {
  public uuid: string;
  public _type = 'Summation';
  public _options?: { uuid?: string };
  public record?: EntityInstance | RelationInstance;
  public property?: string;
  public direction?: string;
  public attributeQuery: AttributeQueryData;
  
  constructor(args: SummationCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.property = args.property;
    this.direction = args.direction;
    this.attributeQuery = args.attributeQuery;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Summation';
  static instances: SummationInstance[] = [];
  
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
    attributeQuery: {
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: SummationCreateArgs, options?: { uuid?: string }): SummationInstance {
    // 统一声明期校验（r16 建议 4 / r26 落地）：static.public 的 required/options/constraints
    //  在 create 时执行；record/property 二选一是聚合的结构性前提（缺失时 Scheduler 深处才炸）。
    validateCreateArgs(this.displayName, this.public as unknown as Record<string, PublicFieldDef>, args as unknown as Record<string, unknown>);
    if (!args.record && !args.property) {
      throw new Error(`${this.displayName}.create() requires either "record" (target entity/relation) or "property" (host relation property).`);
    }
    const instance = new Summation(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Summation`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: SummationInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: SummationInstance, deep: boolean): SummationInstance {
    return this.create({
      record: instance.record,
      property: instance.property,
      direction: instance.direction,
      attributeQuery: instance.attributeQuery
    });
  }
  
    static is(obj: unknown): obj is SummationInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Summation';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): SummationInstance {
    const data: SerializedData<SummationCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 