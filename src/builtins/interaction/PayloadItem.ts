import { IInstance, SerializedData, generateUUID } from '../../core/interfaces.js';
import { AttributiveInstance, AttributivesInstance } from './Attributive.js';
import { EntityInstance } from '../../core/Entity.js';

export interface PayloadItemInstance extends IInstance {
  name: string;
  type: string;
  base?: EntityInstance;
  isRef?: boolean;
  required?: boolean;
  isCollection?: boolean;
  itemRef?: AttributiveInstance | EntityInstance;
}

export interface PayloadItemCreateArgs {
  name: string;
  type: string;
  base?: EntityInstance;
  isRef?: boolean;
  required?: boolean;
  isCollection?: boolean;
  itemRef?: AttributiveInstance | EntityInstance;
}

export class PayloadItem implements PayloadItemInstance {
  public uuid: string;
  public _type = 'PayloadItem';
  public _options?: { uuid?: string };
  public name: string;
  public base?: EntityInstance;
  public isRef: boolean;
  public required: boolean;
  public isCollection: boolean;
  public itemRef?: AttributiveInstance | EntityInstance;
  public type: string;
  constructor(args: PayloadItemCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.base = args.base;
    this.type = args.type;
    this.isRef = args.isRef ?? false;
    this.required = args.required ?? false;
    this.isCollection = args.isCollection ?? false;
    this.itemRef = args.itemRef;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'PayloadItem';
  static instances: PayloadItemInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const
    },
    type: {
      type: 'string' as const,
      required: true as const
    },
    base: {
      type: 'Entity' as const,
      required: false as const,
      collection: false as const
    },
    isRef: {
      type: 'boolean' as const,
      collection: false as const,
      defaultValue: () => false
    },
    required: {
      type: 'boolean' as const,
      collection: false as const,
      defaultValue: () => false
    },
    isCollection: {
      type: 'boolean' as const,
      collection: false as const,
      defaultValue: () => false
    },
    itemRef: {
      collection: false as const,
      required: false as const,
      type: ['Attributive', 'Entity'] as const
    }
  };
  
  static create(args: PayloadItemCreateArgs, options?: { uuid?: string }): PayloadItemInstance {
    const instance = new PayloadItem(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, PayloadItem`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: PayloadItemInstance): string {
    const args: PayloadItemCreateArgs = {
      name: instance.name,
      base: instance.base,
      isCollection: instance.isCollection,
      required: instance.required,
      isRef: instance.isRef,
      type: instance.type,
    };
    
    const data: SerializedData<PayloadItemCreateArgs> = {
      type: 'PayloadItem',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: PayloadItemInstance, deep: boolean): PayloadItemInstance {
    const args: PayloadItemCreateArgs = {
      name: instance.name,
      type: instance.type,
    };
    if (instance.base !== undefined) args.base = instance.base;
    if (instance.isRef !== false) args.isRef = instance.isRef;
    if (instance.required !== false) args.required = instance.required;
    if (instance.isCollection !== false) args.isCollection = instance.isCollection;
    if (instance.itemRef !== undefined) args.itemRef = instance.itemRef;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is PayloadItemInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'PayloadItem';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): PayloadItemInstance {
    const data: SerializedData<PayloadItemCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 