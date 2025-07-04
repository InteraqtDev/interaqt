import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { PropertyTypes } from './RealDictionary.js';
import { stringifyAttribute } from './utils.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export interface PropertyInstance extends IInstance {
  name: string;
  type: string;
  collection?: boolean;
  defaultValue?: Function;
  computed?: Function;
  computation?: any;
}

export interface PropertyCreateArgs {
  name: string;
  type: string;
  collection?: boolean;
  defaultValue?: Function;
  computed?: Function;
  computation?: any;
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
  public computation?: any;
  
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
        },
        length: ({name}: { name: string }) => {
          return name.length > 1 && name.length < 5;
        }
      }
    },
    type: {
      type: 'string' as const,
      required: true as const,
      options: () => Object.values(PropertyTypes)
    },
    collection: {
      type: 'boolean' as const,
      required: false as const,
    },
    defaultValue: {
      type: 'function' as const,
      required: false as const,
    },
    computed: {
      type: 'function' as const,
      required: false as const,
    },
    computation: {
      type: [] as const,
      collection: false as const,
      required: false as const,
    }
  };
  
  static create(args: PropertyCreateArgs, options?: { uuid?: string }): PropertyInstance {
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
    const args: Partial<PropertyCreateArgs> = {
      name: instance.name,
      type: instance.type
    };
    if (instance.collection !== undefined) args.collection = instance.collection;
    if (instance.defaultValue !== undefined) args.defaultValue = stringifyAttribute(instance.defaultValue) as Function;
    if (instance.computed !== undefined) args.computed = stringifyAttribute(instance.computed) as Function;
    if (instance.computation !== undefined) args.computation = stringifyAttribute(instance.computation);
    
    const data: SerializedData<any> = {
      type: 'Property',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: PropertyInstance, deep: boolean): PropertyInstance {
    const args: PropertyCreateArgs = {
      name: instance.name,
      type: instance.type
    };
    if (instance.collection !== undefined) args.collection = instance.collection;
    if (instance.defaultValue !== undefined) args.defaultValue = instance.defaultValue;
    if (instance.computed !== undefined) args.computed = instance.computed;
    if (instance.computation !== undefined) args.computation = instance.computation;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is PropertyInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Property';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): PropertyInstance {
    const data: SerializedData<any> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.defaultValue && typeof args.defaultValue === 'string' && args.defaultValue.startsWith('func::')) {
      args.defaultValue = new Function('return ' + args.defaultValue.substring(6))();
    }
    if (args.computed && typeof args.computed === 'string' && args.computed.startsWith('func::')) {
      args.computed = new Function('return ' + args.computed.substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 