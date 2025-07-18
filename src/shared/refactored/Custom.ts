import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import type { ComputationRecord, AttributeQueryData } from './types.js';

export interface CustomInstance extends IInstance {
  name: string;
  dataDeps?: { [key: string]: any };
  compute?: Function;
  incrementalCompute?: Function;
  incrementalPatchCompute?: Function;
  createState?: Function;
  getDefaultValue?: Function;
  asyncReturn?: Function;
  useLastValue?: boolean;
}

export interface CustomCreateArgs {
  name: string;
  dataDeps?: { [key: string]: any };
  compute?: Function;
  incrementalCompute?: Function;
  incrementalPatchCompute?: Function;
  createState?: Function;
  getDefaultValue?: Function;
  asyncReturn?: Function;
  useLastValue?: boolean;
}

export class Custom implements CustomInstance {
  public uuid: string;
  public _type = 'Custom';
  public _options?: { uuid?: string };
  public name: string;
  public dataDeps?: { [key: string]: any };
  public compute?: Function;
  public incrementalCompute?: Function;
  public incrementalPatchCompute?: Function;
  public createState?: Function;
  public getDefaultValue?: Function;
  public asyncReturn?: Function;
  public useLastValue?: boolean;
  
  constructor(args: CustomCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.dataDeps = args.dataDeps;
    this.compute = args.compute;
    this.incrementalCompute = args.incrementalCompute;
    this.incrementalPatchCompute = args.incrementalPatchCompute;
    this.createState = args.createState;
    this.getDefaultValue = args.getDefaultValue;
    this.asyncReturn = args.asyncReturn;
    this.useLastValue = args.useLastValue;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Custom';
  static instances: CustomInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      collection: false as const,
      required: true as const
    },
    dataDeps: {
      type: 'object' as const,
      collection: false as const,
      required: false as const
    },
    compute: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    incrementalCompute: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    incrementalPatchCompute: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    createState: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    getDefaultValue: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    asyncReturn: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    useLastValue: {
      type: 'boolean' as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: CustomCreateArgs, options?: { uuid?: string }): CustomInstance {
    const instance = new Custom(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Custom`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: CustomInstance): string {
    const args: any = {
      name: instance.name
    };
    if (instance.dataDeps !== undefined) args.dataDeps = stringifyAttribute(instance.dataDeps);
    if (instance.compute !== undefined) args.compute = stringifyAttribute(instance.compute) as Function;
    if (instance.incrementalCompute !== undefined) args.incrementalCompute = stringifyAttribute(instance.incrementalCompute) as Function;
    if (instance.incrementalPatchCompute !== undefined) args.incrementalPatchCompute = stringifyAttribute(instance.incrementalPatchCompute) as Function;
    if (instance.createState !== undefined) args.createState = stringifyAttribute(instance.createState) as Function;
    if (instance.getDefaultValue !== undefined) args.getDefaultValue = stringifyAttribute(instance.getDefaultValue) as Function;
    if (instance.asyncReturn !== undefined) args.asyncReturn = stringifyAttribute(instance.asyncReturn) as Function;
    if (instance.useLastValue !== undefined) args.useLastValue = instance.useLastValue;
    
    const data: SerializedData<any> = {
      type: 'Custom',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: CustomInstance, deep: boolean): CustomInstance {
    return this.create({
      name: instance.name,
      dataDeps: instance.dataDeps,
      compute: instance.compute,
      incrementalCompute: instance.incrementalCompute,
      incrementalPatchCompute: instance.incrementalPatchCompute,
      createState: instance.createState,
      getDefaultValue: instance.getDefaultValue,
      asyncReturn: instance.asyncReturn,
      useLastValue: instance.useLastValue
    });
  }
  
  static is(obj: unknown): obj is CustomInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Custom';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): CustomInstance {
    const data = JSON.parse(json) as SerializedData<any>;
    const args = { ...data.public };
    
    // 反序列化函数
    const functionFields = ['compute', 'incrementalCompute', 'incrementalPatchCompute', 'createState', 'getDefaultValue', 'asyncReturn'];
    functionFields.forEach(field => {
      if (typeof args[field] === 'string' && args[field].startsWith('func::')) {
        args[field] = new Function('return ' + args[field].substring(6))();
      }
    });
    
    return this.create(args as CustomCreateArgs, data.options);
  }
} 