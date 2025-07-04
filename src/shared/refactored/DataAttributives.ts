import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';
import { BoolAtomDataInstance, BoolExpressionDataInstance } from './BoolExp.js';

export interface DataAttributivesInstance extends IInstance {
  content?: BoolExpressionDataInstance | BoolAtomDataInstance;
}

export interface DataAttributivesCreateArgs {
  content?: BoolExpressionDataInstance | BoolAtomDataInstance;
}

export class DataAttributives implements DataAttributivesInstance {
  public uuid: string;
  public _type = 'DataAttributives';
  public _options?: { uuid?: string };
  public content?: BoolExpressionDataInstance | BoolAtomDataInstance;
  
  constructor(args: DataAttributivesCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.content = args.content;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'DataAttributives';
  static instances: DataAttributivesInstance[] = [];
  
  static public = {
    content: {
      type: ['BoolExpressionData', 'BoolAtomData'] as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: DataAttributivesCreateArgs, options?: { uuid?: string }): DataAttributivesInstance {
    const instance = new DataAttributives(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, DataAttributives`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: DataAttributivesInstance): string {
    const args: any = {};
    if (instance.content !== undefined) args.content = stringifyAttribute(instance.content);
    
    const data: SerializedData<any> = {
      type: 'DataAttributives',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: DataAttributivesInstance, deep: boolean): DataAttributivesInstance {
    const args: DataAttributivesCreateArgs = {};
    if (instance.content !== undefined) args.content = instance.content;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is DataAttributivesInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'DataAttributives';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): DataAttributivesInstance {
    const data: SerializedData<any> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 