import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import { assertSynchronousFunctionArg } from './klassValidation.js';
import {
  ALLOWED_PROPERTY_TYPES,
  formatBuiltinPropertyTypesForError,
  isBuiltinPropertyType,
  isExtendedPropertyType,
  PropertyTypes,
  type AllowedPropertyType,
} from './propertyTypes.js';
import type { ComputationInstance } from './types.js';

// Re-export builtins so existing `import { PropertyTypes, ALLOWED_PROPERTY_TYPES } from './RealDictionary.js'` keeps working.
export { ALLOWED_PROPERTY_TYPES, PropertyTypes }
export type { AllowedPropertyType }

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
      // setup/迁移回填同步求值直接落库（create() 内 assertSynchronousFunctionArg 执行拒绝）。
      synchronous: true as const,
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
    // Dictionary 仅接受内置逻辑类型（决策 A）：扩展类型只用于 Entity/Relation Property 列；
    //  物理上 Dictionary 值永远落在 _Dictionary_.value JSON，不解析 fieldType/codec。
    if (args.type !== undefined && !isBuiltinPropertyType(args.type)) {
      if (isExtendedPropertyType(args.type)) {
        throw new Error(
          `Dictionary "${args.name}" cannot use extended property type "${args.type}". ` +
          `Extended property types apply only to Entity/Relation Property columns; ` +
          `Dictionary values are stored in the shared JSON table _Dictionary_. ` +
          formatBuiltinPropertyTypesForError()
        );
      }
      throw new Error(
        `Dictionary "${args.name}" has unsupported type "${args.type}". ` +
        formatBuiltinPropertyTypesForError()
      );
    }
    // 与 Property 对齐：内置类型拒绝无意义 args（历史字段可省略）。
    if (args.type !== undefined && isBuiltinPropertyType(args.type) && args.args !== undefined) {
      throw new Error(
        `Dictionary "${args.name}" uses builtin type "${args.type}" with args. ` +
        `Builtin dictionary types do not accept args; omit args.`
      );
    }
    // 与 Property.defaultValue 同族（r31）：非函数 defaultValue 在部分消费点被静默忽略、
    //  在另一些消费点（迁移回填 declared.defaultValue()）直接抛裸 TypeError——声明期统一拒绝。
    if (args.defaultValue !== undefined && typeof args.defaultValue !== 'function') {
      throw new Error(
        `Dictionary "${args.name}" declares a non-function defaultValue (${JSON.stringify(args.defaultValue)}). ` +
        `defaultValue must be a function, e.g. defaultValue: () => ${JSON.stringify(args.defaultValue)}.`
      );
    }
    // defaultValue 在 setup/迁移回填时同步求值直接落库：async 函数返回的 Promise 会被
    //  序列化成 "{}" 持久化——r35，与 Property.defaultValue 同族，声明期拒绝。
    assertSynchronousFunctionArg(`Dictionary "${args.name}"`, 'defaultValue', args.defaultValue);

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