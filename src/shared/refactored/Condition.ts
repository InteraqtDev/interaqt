import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';

export interface ConditionInstance extends IInstance {
  content: Function;
  name?: string;
}

export interface ConditionCreateArgs {
  content: Function;
  name?: string;
}

export class Condition implements ConditionInstance {
  public uuid: string;
  public _type = 'Condition';
  public _options?: { uuid?: string };
  public content: Function;
  public name?: string;
  
  constructor(args: ConditionCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.content = args.content;
    this.name = args.name;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Condition';
  static instances: ConditionInstance[] = [];
  
  static public = {
    content: {
      type: 'function' as const,
      required: true as const,
      collection: false as const
    },
    name: {
      type: 'string' as const
    }
  };
  
  static create(args: ConditionCreateArgs, options?: { uuid?: string }): ConditionInstance {
    const instance = new Condition(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Condition`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: ConditionInstance): string {
    const args: Partial<ConditionCreateArgs> = {
      content: stringifyAttribute(instance.content) as Function
    };
    if (instance.name !== undefined) args.name = instance.name;
    
    const data: SerializedData<ConditionCreateArgs> = {
      type: 'Condition',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: ConditionInstance, deep: boolean): ConditionInstance {
    const args: ConditionCreateArgs = {
      content: instance.content
    };
    if (instance.name !== undefined) args.name = instance.name;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is ConditionInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Condition';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): ConditionInstance {
    const data: SerializedData<ConditionCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.content && typeof args.content === 'string' && args.content.startsWith('func::')) {
      args.content = new Function('return ' + args.content.substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 