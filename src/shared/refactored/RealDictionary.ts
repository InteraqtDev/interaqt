import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import type { ComputationInstance } from './types.js';

export enum PropertyTypes {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Timestamp = 'timestamp',
}

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
        },
        length: ({name}: { name: string }) => {
          return name.length > 1 && name.length < 5;
        }
      }
    },
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      options: Array.from(Object.values(PropertyTypes)),
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
    const args: DictionaryCreateArgs = {
      name: instance.name,
      type: instance.type,
      collection: instance.collection
    };
    if (instance.args !== undefined) args.args = instance.args;
    if (instance.defaultValue !== undefined) args.defaultValue = instance.defaultValue;
    if (instance.computation !== undefined) args.computation = instance.computation;
    
    const data: SerializedData<DictionaryCreateArgs> = {
      type: 'Dictionary',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
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
    return this.create(data.public, data.options);
  }
} 