import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import { BoolAtomDataInstance, BoolExpressionDataInstance } from './BoolExp.js';

export interface ConditionsInstance extends IInstance {
  content?: BoolExpressionDataInstance | BoolAtomDataInstance;
}

export interface ConditionsCreateArgs {
  content?: BoolExpressionDataInstance | BoolAtomDataInstance;
}

export class Conditions implements ConditionsInstance {
  public uuid: string;
  public _type = 'Conditions';
  public _options?: { uuid?: string };
  public content?: BoolExpressionDataInstance | BoolAtomDataInstance;
  
  constructor(args: ConditionsCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.content = args.content;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Conditions';
  static instances: ConditionsInstance[] = [];
  
  static public = {
    content: {
      type: ['BoolExpressionData', 'BoolAtomData'] as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: ConditionsCreateArgs, options?: { uuid?: string }): ConditionsInstance {
    const instance = new Conditions(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Conditions`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: ConditionsInstance): string {
    const args: Partial<ConditionsCreateArgs> = {};
    if (instance.content !== undefined) args.content = stringifyAttribute(instance.content) as BoolAtomDataInstance | BoolExpressionDataInstance;
    
    const data: SerializedData<any> = {
      type: 'Conditions',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: ConditionsInstance, deep: boolean): ConditionsInstance {
    const args: ConditionsCreateArgs = {};
    if (instance.content !== undefined) args.content = instance.content;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is ConditionsInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Conditions';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): ConditionsInstance {
    const data: SerializedData<any> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 