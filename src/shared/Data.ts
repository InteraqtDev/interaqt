import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';

// DataAttributive
export interface DataAttributiveInstance extends IInstance {
  content: Function;
  name?: string;
}

export interface DataAttributiveCreateArgs {
  content: Function;
  name?: string;
}

export class DataAttributive implements DataAttributiveInstance {
  public uuid: string;
  public _type = 'DataAttributive';
  public _options?: { uuid?: string };
  public content: Function;
  public name?: string;
  
  constructor(args: DataAttributiveCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.content = args.content;
    this.name = args.name;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'DataAttributive';
  static instances: DataAttributiveInstance[] = [];
  
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
  
  static create(args: DataAttributiveCreateArgs, options?: { uuid?: string }): DataAttributiveInstance {
    const instance = new DataAttributive(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, DataAttributive`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: DataAttributiveInstance): string {
    const args: DataAttributiveCreateArgs = {
      content: stringifyAttribute(instance.content) as Function,
      name: instance.name
    };
    
    const data: SerializedData<DataAttributiveCreateArgs> = {
      type: 'DataAttributive',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: DataAttributiveInstance, deep: boolean): DataAttributiveInstance {
    const args: DataAttributiveCreateArgs = {
      content: instance.content
    };
    if (instance.name !== undefined) args.name = instance.name;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is DataAttributiveInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'DataAttributive';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): DataAttributiveInstance {
    const data: SerializedData<DataAttributiveCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.content && typeof args.content === 'string' && (args.content as any).startsWith('func::')) {
      args.content = new Function('return ' + (args.content as any).substring(6))();
    }
    
    return this.create(args, data.options);
  }
}

// DataPolicy - defines fixed constraints for data fetching in interactions
export interface DataPolicyInstance extends IInstance {
  match?: any;
  modifier?: any;
  attributeQuery?: any;
}

export interface DataPolicyCreateArgs {
  match?: any;
  modifier?: any;
  attributeQuery?: any;
}

export class DataPolicy implements DataPolicyInstance {
  public uuid: string;
  public _type = 'DataPolicy';
  public _options?: { uuid?: string };
  public match?: any;
  public modifier?: any;
  public attributeQuery?: any;
  
  constructor(args: DataPolicyCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.match = args.match;
    this.modifier = args.modifier;
    this.attributeQuery = args.attributeQuery;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'DataPolicy';
  static instances: DataPolicyInstance[] = [];
  
  static public = {
    match: {
      type: 'any' as const,
      required: false as const,
      collection: false as const,
    },
    modifier: {
      type: 'any' as const,
      required: false as const,
      collection: false as const,
    },
    attributeQuery: {
      type: 'any' as const,
      required: false as const,
      collection: false as const,
    }
  };
  
  static create(args: DataPolicyCreateArgs, options?: { uuid?: string }): DataPolicyInstance {
    const instance = new DataPolicy(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, DataPolicy`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: DataPolicyInstance): string {
    const args: DataPolicyCreateArgs = {};
    if (instance.match !== undefined) args.match = instance.match;
    if (instance.modifier !== undefined) args.modifier = instance.modifier;
    if (instance.attributeQuery !== undefined) args.attributeQuery = instance.attributeQuery;
    
    const data: SerializedData<DataPolicyCreateArgs> = {
      type: 'DataPolicy',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: DataPolicyInstance, deep: boolean): DataPolicyInstance {
    const args: DataPolicyCreateArgs = {};
    if (instance.match !== undefined) args.match = instance.match;
    if (instance.modifier !== undefined) args.modifier = instance.modifier;
    if (instance.attributeQuery !== undefined) args.attributeQuery = instance.attributeQuery;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is DataPolicyInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'DataPolicy';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): DataPolicyInstance {
    const data: SerializedData<DataPolicyCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}
