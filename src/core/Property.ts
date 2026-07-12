import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { PropertyTypes, ALLOWED_PROPERTY_TYPES } from './RealDictionary.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import type { ComputationInstance } from './types.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export interface PropertyInstance extends IInstance {
  name: string;
  type: string;
  collection?: boolean;
  defaultValue?: Function;
  computed?: Function;
  computation?: ComputationInstance;
}

export interface PropertyCreateArgs {
  name: string;
  type: string;
  collection?: boolean;
  defaultValue?: Function;
  computed?: Function;
  computation?: ComputationInstance;
}

export class Property implements PropertyInstance {
  public uuid: string;
  public _type = 'Property';
  public _options?: { uuid?: string };
  public name: string;
  public type: string;
  public collection?: boolean;
  public defaultValue?: Function;
  public computed?: Function;
  public computation?: ComputationInstance;
  
  constructor(args: PropertyCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.type = args.type;
    this.collection = args.collection;
    this.defaultValue = args.defaultValue;
    this.computed = args.computed;
    this.computation = args.computation;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Property';
  static instances: PropertyInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      constraints: {
        format: ({name}: { name: string }) => {
          return validNameFormatExp.test(name);
        }
      }
    },
    type: {
      type: 'string' as const,
      required: true as const,
      options: () => [...ALLOWED_PROPERTY_TYPES]
    },
    collection: {
      type: 'boolean' as const,
      required: false as const
    },
    defaultValue: {
      type: 'function' as const,
      required: false as const
    },
    computed: {
      type: 'function' as const,
      required: false as const
    },
    computation: {
      type: [] as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: PropertyCreateArgs, options?: { uuid?: string }): PropertyInstance {
    // 强制执行 format 约束：property 名会被用作 SQL 列名/别名，必须严格校验。
    if (typeof args.name !== 'string' || !validNameFormatExp.test(args.name)) {
      throw new Error(`Property name "${args.name}" is invalid. Property names must match ${validNameFormatExp} (letters, numbers and underscore only).`);
    }
    // computed（storage 写路径上按同行字段求值）与 computation（反应式计算写回）是两条
    // 互相竞争的写通道：同时声明时 computed 会在每次写入时静默覆盖 computation 的输出，
    // computation 声明形同虚设——零告警的声明失效，必须 fail-fast。
    // （defaultValue + computation 的并存已在 Scheduler setup 期拒绝，语义同族。）
    if (args.computed && args.computation) {
      throw new Error(`Property "${args.name}" declares both computed and computation. They are competing write channels for the same column (computed re-evaluates on every write and silently overwrites the computation's output) — keep exactly one.`);
    }
    // type 白名单（r23）：未知字符串此前静默落到 mapToDBFieldType 的 fallback（原样当 SQL 类型），
    //  SQLite 亲和放过、PG/MySQL 在 setup 才炸——声明形同虚设。与 PayloadItem.type / Dictionary.type 同族。
    if (args.type !== undefined && !(ALLOWED_PROPERTY_TYPES as readonly string[]).includes(args.type)) {
      throw new Error(
        `Property "${args.name}" has unsupported type "${args.type}". ` +
        `Allowed types: ${ALLOWED_PROPERTY_TYPES.join(', ')}.`
      );
    }

    const instance = new Property(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Property`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: PropertyInstance): string {
    return stringifyInstance(this, instance);
  }
  
  // CAUTION clone 不注册进全局 registry，与 Entity.clone / Relation.clone 语义一致。
  static clone(instance: PropertyInstance, deep: boolean): PropertyInstance {
    const args: PropertyCreateArgs = {
      name: instance.name,
      type: instance.type
    };
    if (instance.collection !== undefined) args.collection = instance.collection;
    if (instance.defaultValue !== undefined) args.defaultValue = instance.defaultValue;
    if (instance.computed !== undefined) args.computed = instance.computed;
    if (instance.computation !== undefined) args.computation = instance.computation;
    
    return new Property(args);
  }
  
    static is(obj: unknown): obj is PropertyInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Property';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): PropertyInstance {
    const data: SerializedData<PropertyCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 