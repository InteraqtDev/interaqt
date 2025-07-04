import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';

export interface SideEffectInstance extends IInstance {
  name: string;
  handle: Function;
}

export interface SideEffectCreateArgs {
  name: string;
  handle: Function;
}

export class SideEffect implements SideEffectInstance {
  public uuid: string;
  public _type = 'SideEffect';
  public _options?: { uuid?: string };
  public name: string;
  public handle: Function;
  
  constructor(args: SideEffectCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.handle = args.handle;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'SideEffect';
  static instances: SideEffectInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      collection: false as const
    },
    handle: {
      type: 'function' as const,
      required: true as const,
      collection: false as const
    }
  };
  
  static create(args: SideEffectCreateArgs, options?: { uuid?: string }): SideEffectInstance {
    const instance = new SideEffect(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, SideEffect`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: SideEffectInstance): string {
    const args: SideEffectCreateArgs = {
      name: instance.name,
      handle: stringifyAttribute(instance.handle) as Function
    };
    
    const data: SerializedData<SideEffectCreateArgs> = {
      type: 'SideEffect',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: SideEffectInstance, deep: boolean): SideEffectInstance {
    return this.create({
      name: instance.name,
      handle: instance.handle
    });
  }
  
    static is(obj: unknown): obj is SideEffectInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'SideEffect';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): SideEffectInstance {
    const data: SerializedData<SideEffectCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.handle && typeof args.handle === 'string' && (args.handle as any).startsWith('func::')) {
      args.handle = new Function('return ' + (args.handle as any).substring(6))();
    }
    
    return this.create(args, data.options);
  }
} 