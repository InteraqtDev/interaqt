import { IInstance, SerializedData, generateUUID, decodeFunctionValues, stringifyInstance } from '@core';

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
  
  // CAUTION 必须走统一的 stringifyInstance 管线：match 常见形态是函数（GetAction 的动态过滤），
  //  手写 JSON.stringify 会把函数静默丢成 undefined，round-trip 后 dataPolicy 失去过滤语义。
  static stringify(instance: DataPolicyInstance): string {
    return stringifyInstance(this, instance);
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
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}
