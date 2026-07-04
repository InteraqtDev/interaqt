import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import type { AttributeQueryData, DataDependencies, EntityInstance, RelationInstance } from './types.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';

export interface AnyInstance extends IInstance {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: DataDependencies;
}

export interface AnyCreateArgs {
  record?: EntityInstance | RelationInstance;
  property?: string;
  direction?: string;
  callback: Function;
  attributeQuery?: AttributeQueryData; // AttributeQueryData
  dataDeps?: DataDependencies;
}

export class Any implements AnyInstance {
  public uuid: string;
  public _type = 'Any';
  public _options?: { uuid?: string };
  public record?: EntityInstance | RelationInstance;
  public property?: string;
  public direction?: string;
  public callback: Function;
  public attributeQuery?: AttributeQueryData;
  public dataDeps?: DataDependencies;
  
  constructor(args: AnyCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.property = args.property;
    this.direction = args.direction;
    this.callback = args.callback;
    this.attributeQuery = args.attributeQuery;
    this.dataDeps = args.dataDeps;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Any';
  static instances: AnyInstance[] = [];
  
  static public = {
    record: {
      type: ['Entity', 'Relation'] as const,
      collection: false as const,
      required: false as const
    },
    property: {
      type: 'string' as const,
      collection: false as const,
      required: false as const
    },
    direction: {
      type: 'string' as const,
      collection: false as const,
      required: false as const
    },
    callback: {
      type: 'function' as const,
      collection: false as const,
      required: true as const
    },
    attributeQuery: {
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: false as const
    },
    dataDeps: {
      instanceType: {} as unknown as {[key: string]: unknown},
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: AnyCreateArgs, options?: { uuid?: string }): AnyInstance {
    const instance = new Any(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Any`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: AnyInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: AnyInstance, deep: boolean): AnyInstance {
    return this.create({
      record: instance.record,
      property: instance.property,
      direction: instance.direction,
      callback: instance.callback,
      attributeQuery: instance.attributeQuery,
      dataDeps: instance.dataDeps
    });
  }
  
    static is(obj: unknown): obj is AnyInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Any';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): AnyInstance {
    const data: SerializedData<AnyCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 