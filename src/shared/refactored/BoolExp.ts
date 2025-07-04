import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';

// BoolAtomData
export interface BoolAtomDataInstance extends IInstance {
  type: string;
  data: { content?: Function; [key: string]: unknown };
}

export interface BoolAtomDataCreateArgs {
  type?: string;
  data: { content?: Function; [key: string]: unknown };
}

export class BoolAtomData implements BoolAtomDataInstance {
  public uuid: string;
  public _type = 'BoolAtomData';
  public _options?: { uuid?: string };
  public type: string;
  public data: { content?: Function; [key: string]: unknown };
  
  constructor(args: BoolAtomDataCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.type = args.type || 'atom';
    this.data = args.data;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'BoolAtomData';
  static instances: BoolAtomDataInstance[] = [];
  
  static public = {
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      defaultValue: () => 'atom'
    },
    data: {
      instanceType: {} as unknown as { content?: Function; [key: string]: unknown },
      required: true as const,
      collection: false as const,
    }
  };
  
  static create(args: BoolAtomDataCreateArgs, options?: { uuid?: string }): BoolAtomDataInstance {
    const instance = new BoolAtomData(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, BoolAtomData`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: BoolAtomDataInstance): string {
    const args: BoolAtomDataCreateArgs = {
      type: instance.type,
      data: stringifyAttribute(instance.data) as { content?: Function; [key: string]: unknown }
    };
    
    const data: SerializedData<BoolAtomDataCreateArgs> = {
      type: 'BoolAtomData',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: BoolAtomDataInstance, deep: boolean): BoolAtomDataInstance {
    const args: BoolAtomDataCreateArgs = {
      data: instance.data
    };
    if (instance.type !== 'atom') args.type = instance.type;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is BoolAtomDataInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'BoolAtomData';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): BoolAtomDataInstance {
    const data: SerializedData<BoolAtomDataCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

// BoolExpressionData
export interface BoolExpressionDataInstance extends IInstance {
  type: string;
  operator: 'and' | 'or' | 'not';
  left: BoolAtomDataInstance | BoolExpressionDataInstance;
  right?: BoolAtomDataInstance | BoolExpressionDataInstance;
}

export interface BoolExpressionDataCreateArgs {
  type?: string;
  operator?: 'and' | 'or' | 'not';
  left: BoolAtomDataInstance | BoolExpressionDataInstance;
  right?: BoolAtomDataInstance | BoolExpressionDataInstance;
}

export class BoolExpressionData implements BoolExpressionDataInstance {
  public uuid: string;
  public _type = 'BoolExpressionData';
  public _options?: { uuid?: string };
  public type: string;
  public operator: 'and' | 'or' | 'not';
  public left: BoolAtomDataInstance | BoolExpressionDataInstance;
  public right?: BoolAtomDataInstance | BoolExpressionDataInstance;
  
  constructor(args: BoolExpressionDataCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.type = args.type || 'expression';
    this.operator = args.operator || 'and';
    this.left = args.left;
    this.right = args.right;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'BoolExpressionData';
  static instances: BoolExpressionDataInstance[] = [];
  
  static public = {
    type: {
      type: 'string' as const,
      required: false as const,
      collection: false as const,
      defaultValue: () => 'expression'
    },
    operator: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      options: ['and', 'or', 'not'],
      defaultValue: () => 'and'
    },
    left: {
      instanceType: {} as unknown as { content?: Function; [key: string]: unknown },
      required: true as const,
      collection: false as const,
    },
    right: {
      instanceType: {} as unknown as { content?: Function; [key: string]: unknown },
      required: false as const,
      collection: false as const,
    }
  };
  
  static create(args: BoolExpressionDataCreateArgs, options?: { uuid?: string }): BoolExpressionDataInstance {
    const instance = new BoolExpressionData(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, BoolExpressionData`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: BoolExpressionDataInstance): string {
    const args: BoolExpressionDataCreateArgs = {
      type: instance.type,
      operator: instance.operator,
      left: stringifyAttribute(instance.left) as BoolAtomDataInstance | BoolExpressionDataInstance,
      right: instance.right ? stringifyAttribute(instance.right) as BoolAtomDataInstance | BoolExpressionDataInstance : undefined
    };
    
    const data: SerializedData<BoolExpressionDataCreateArgs> = {
      type: 'BoolExpressionData',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: BoolExpressionDataInstance, deep: boolean): BoolExpressionDataInstance {
    const args: BoolExpressionDataCreateArgs = {
      left: instance.left
    };
    if (instance.type !== 'expression') args.type = instance.type;
    if (instance.operator !== 'and') args.operator = instance.operator;
    if (instance.right !== undefined) args.right = instance.right;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is BoolExpressionDataInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'BoolExpressionData';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): BoolExpressionDataInstance {
    const data: SerializedData<BoolExpressionDataCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 