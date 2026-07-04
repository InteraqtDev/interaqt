import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import type { ComputationRecord, AttributeQueryData } from './types.js';

const PHASE_BEFORE_ALL = 0
const PHASE_NORMAL = 1
const PHASE_AFTER_ALL = 2
type ComputationPhase = typeof PHASE_BEFORE_ALL|typeof PHASE_NORMAL|typeof PHASE_AFTER_ALL


type EventDep = {
  recordName: string;
  type: 'create'|'delete'|'update';
  record?: Record<string, unknown>
  oldRecord?: Record<string, unknown>
  phase?: ComputationPhase
};

export interface TransformInstance extends IInstance {
  record?: ComputationRecord;
  eventDeps?: {
    [key: string]: EventDep;
  };
  attributeQuery?: AttributeQueryData;
  callback: Function;
}

export interface TransformCreateArgs {
  record?: ComputationRecord;
  eventDeps?: {
    [key: string]: EventDep;
  };
  attributeQuery?: AttributeQueryData;
  callback: Function;
}

export class Transform implements TransformInstance {
  public uuid: string;
  public _type = 'Transform';
  public _options?: { uuid?: string };
  public record?: ComputationRecord;
  public eventDeps?: {
    [key: string]: EventDep;
  };
  public attributeQuery?: AttributeQueryData;
  public callback: Function;
  
  constructor(args: TransformCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.record = args.record;
    this.eventDeps = args.eventDeps;
    this.attributeQuery = args.attributeQuery;
    this.callback = args.callback;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Transform';
  static instances: TransformInstance[] = [];
  
  static public = {
    record: {
      type: ['Entity', 'Relation', 'Activity', 'Interaction'] as const,
      collection: false as const,
      required: true as const
    },
    eventDeps: {
      instanceType: {} as unknown as {[key: string]: EventDep},
      collection: false as const,
      required: false as const
    },
    attributeQuery: {
      instanceType: {} as unknown as AttributeQueryData,
      collection: false as const,
      required: false as const
    },
    callback: {
      type: 'function' as const,
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: TransformCreateArgs, options?: { uuid?: string }): TransformInstance {
    const instance = new Transform(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Transform`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: TransformInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: TransformInstance, deep: boolean): TransformInstance {
    return this.create({
      record: instance.record,
      eventDeps: instance.eventDeps,
      attributeQuery: instance.attributeQuery,
      callback: instance.callback
    });
  }
  
  static is(obj: unknown): obj is TransformInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Transform';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): TransformInstance {
    const data = JSON.parse(json) as SerializedData<TransformCreateArgs>;
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 
