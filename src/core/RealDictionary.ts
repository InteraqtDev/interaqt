import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import type { ComputationInstance } from './types.js';

export enum PropertyTypes {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Timestamp = 'timestamp',
  /** Structured JSON payload (maps to JSON/JSONB column). */
  Object = 'object',
}

/** Property / Dictionary `type` values accepted by create() and mapped by drivers. */
export const ALLOWED_PROPERTY_TYPES = [
  PropertyTypes.String,
  PropertyTypes.Number,
  PropertyTypes.Boolean,
  PropertyTypes.Timestamp,
  PropertyTypes.Object,
  // Framework internals (async task tables) and some apps use 'json' as an alias of object.
  'json',
] as const

export type AllowedPropertyType = (typeof ALLOWED_PROPERTY_TYPES)[number]

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export interface DictionaryInstance extends IInstance {
  name: string;
  type: string;
  collection: boolean;
  args?: object;
  defaultValue?: Function;
  computation?: ComputationInstance;
}

export interface DictionaryCreateArgs {
  name: string;
  type: string;
  collection?: boolean;
  args?: object;
  defaultValue?: Function;
  computation?: ComputationInstance;
}

export class Dictionary implements DictionaryInstance {
  public uuid: string;
  public _type = 'Dictionary';
  public _options?: { uuid?: string };
  public name: string;
  public type: string;
  public collection: boolean;
  public args?: object;
  public defaultValue?: Function;
  public computation?: ComputationInstance;
  
  constructor(args: DictionaryCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.type = args.type;
    this.collection = args.collection ?? false;
    this.args = args.args;
    this.defaultValue = args.defaultValue;
    this.computation = args.computation;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Dictionary';
  static instances: DictionaryInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      constraints: {
        format: ({name}: { name: string }) => {
          return validNameFormatExp.test(name);
        }
      }
    },
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      options: Array.from(ALLOWED_PROPERTY_TYPES),
    },
    collection: {
      type: 'boolean' as const,
      required: true as const,
      collection: false as const,
      defaultValue: () => false
    },
    args: {
      type: 'object' as const,
      required: false as const,
      collection: false as const,
    },
    defaultValue: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    computation: {
      collection: false as const,
      type: [] as const,
      required: false as const,
    }
  };
  
  static create(args: DictionaryCreateArgs, options?: { uuid?: string }): DictionaryInstance {
    // 强制执行 format 约束：dictionary 名会被用作全局状态记录键，必须严格校验。
    if (typeof args.name !== 'string' || !validNameFormatExp.test(args.name)) {
      throw new Error(`Dictionary name "${args.name}" is invalid. Dictionary names must match ${validNameFormatExp} (letters, numbers and underscore only).`);
    }
    if (args.type !== undefined && !(ALLOWED_PROPERTY_TYPES as readonly string[]).includes(args.type)) {
      throw new Error(
        `Dictionary "${args.name}" has unsupported type "${args.type}". ` +
        `Allowed types: ${ALLOWED_PROPERTY_TYPES.join(', ')}.`
      );
    }
    // defaultValue（install 期 seed / 读回退）与 computation（反应式写回）是两条竞争写通道：
    //  同时声明时两边都会跑，作者以为只有一个生效——与 Property.computed∥computation 同族，必须 fail-fast。
    if (args.defaultValue && args.computation) {
      throw new Error(
        `Dictionary "${args.name}" declares both defaultValue and computation. ` +
        `They are competing write channels for the same global key — keep exactly one.`
      );
    }

    const instance = new Dictionary(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Dictionary`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: DictionaryInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: DictionaryInstance, deep: boolean): DictionaryInstance {
    const args: DictionaryCreateArgs = {
      name: instance.name,
      type: instance.type,
      collection: instance.collection
    };
    if (instance.args !== undefined) args.args = instance.args;
    if (instance.defaultValue !== undefined) args.defaultValue = instance.defaultValue;
    if (instance.computation !== undefined) args.computation = instance.computation;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is DictionaryInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Dictionary';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): DictionaryInstance {
    const data: SerializedData<DictionaryCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 