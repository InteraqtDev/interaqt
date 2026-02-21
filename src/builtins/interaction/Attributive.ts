import { IInstance, SerializedData, generateUUID, stringifyAttribute, BoolAtomDataInstance, BoolExpressionDataInstance } from '@core';

// Attributive
export interface AttributiveInstance extends IInstance {
  stringContent?: string;
  content: Function;
  name?: string;
  isRef?: boolean;
}

export interface AttributiveCreateArgs {
  stringContent?: string;
  content: Function;
  name?: string;
  isRef?: boolean;
}

export class Attributive implements AttributiveInstance {
  public uuid: string;
  public _type = 'Attributive';
  public _options?: { uuid?: string };
  public stringContent?: string;
  public content: Function;
  public name?: string;
  public isRef?: boolean;
  
  constructor(args: AttributiveCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.stringContent = args.stringContent;
    this.content = args.content;
    this.name = args.name;
    this.isRef = args.isRef;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Attributive';
  static instances: AttributiveInstance[] = [];
  
  static public = {
    stringContent: {
      type: 'string' as const,
    },
    content: {
      type: 'function' as const,
      required: true as const,
      collection: false as const
    },
    name: {
      type: 'string' as const
    },
    isRef: {
      type: 'boolean' as const
    }
  };
  
  static create(args: AttributiveCreateArgs, options?: { uuid?: string }): AttributiveInstance {
    const instance = new Attributive(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Attributive`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: AttributiveInstance): string {
    const args: AttributiveCreateArgs = {
      content: stringifyAttribute(instance.content) as Function,
      stringContent: instance.stringContent,
      name: instance.name,
      isRef: instance.isRef
    };
    
    const data: SerializedData<AttributiveCreateArgs> = {
      type: 'Attributive',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: AttributiveInstance, deep: boolean): AttributiveInstance {
    const args: AttributiveCreateArgs = {
      content: instance.content
    };
    if (instance.stringContent !== undefined) args.stringContent = instance.stringContent;
    if (instance.name !== undefined) args.name = instance.name;
    if (instance.isRef !== undefined) args.isRef = instance.isRef;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is AttributiveInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Attributive';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): AttributiveInstance {
    const data: SerializedData<AttributiveCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.content && typeof args.content === 'string' && (args.content as any).startsWith('func::')) {
      args.content = new Function('return ' + (args.content as any).substring(6))();
    }
    
    return this.create(args, data.options);
  }
}

// Attributives  
export interface AttributivesInstance extends IInstance {
  content?: BoolExpressionDataInstance | BoolAtomDataInstance;
}

export interface AttributivesCreateArgs {
  content?: BoolExpressionDataInstance | BoolAtomDataInstance;
}

export class Attributives implements AttributivesInstance {
  public uuid: string;
  public _type = 'Attributives';
  public _options?: { uuid?: string };
  public content?: BoolExpressionDataInstance | BoolAtomDataInstance;
  
  constructor(args: AttributivesCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.content = args.content;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Attributives';
  static instances: AttributivesInstance[] = [];
  
  static public = {
    content: {
      type: ['BoolExpressionData', 'BoolAtomData'] as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: AttributivesCreateArgs, options?: { uuid?: string }): AttributivesInstance {
    const instance = new Attributives(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Attributives`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: AttributivesInstance): string {
    const args: Partial<AttributivesCreateArgs> = {};
    if (instance.content !== undefined) args.content = stringifyAttribute(instance.content) as BoolExpressionDataInstance | BoolAtomDataInstance;
    
    const data: SerializedData<AttributivesCreateArgs> = {
      type: 'Attributives',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: AttributivesInstance, deep: boolean): AttributivesInstance {
    const args: AttributivesCreateArgs = {};
    if (instance.content !== undefined) args.content = instance.content;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is AttributivesInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Attributives';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): AttributivesInstance {
    const data: SerializedData<AttributivesCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

// 兼容性函数
import { BoolExp, BoolAtomData, BoolExpressionData, type BoolExpressionRawData } from '@core';

function toAttributives(obj?: BoolExp<AttributiveInstance>): BoolAtomData | BoolExpressionData | undefined {
  if (!obj) return undefined;

  if (obj.raw.type === 'atom') {
    return BoolAtomData.create({
      type: 'atom',
      data: obj.raw.data as unknown as { content?: Function; [key: string]: unknown }
    });
  }

  const expData = obj.raw as BoolExpressionRawData<AttributiveInstance>;
  return BoolExpressionData.create({
    type: 'expression',
    operator: expData.operator,
    left: toAttributives(obj.left) as BoolAtomData | BoolExpressionData,
    right: toAttributives(obj.right) as BoolAtomData | BoolExpressionData | undefined,
  });
}

export function boolExpToAttributives(obj: BoolExp<AttributiveInstance>) {
  return Attributives.create({
    content: toAttributives(obj) as BoolExpressionData
  });
} 