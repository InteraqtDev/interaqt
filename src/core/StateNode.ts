import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';

// StateNode 实例接口
export interface StateNodeInstance extends IInstance {
  name: string;
  computeValue?: (this: unknown, lastValue: unknown, event?: unknown) => unknown;
}

// StateNode 创建参数
export interface StateNodeCreateArgs {
  name: string;
  computeValue?: (this: unknown, lastValue: unknown, event?: unknown) => unknown;
}

// StateNode 类定义
export class StateNode implements StateNodeInstance {
  public uuid: string;
  public _type = 'StateNode';
  public _options?: { uuid?: string };
  public name: string;
  public computeValue?: (this: unknown, lastValue: unknown, event?: unknown) => unknown;

  constructor(args: StateNodeCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.computeValue = args.computeValue;
  }

  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'StateNode';
  static instances: StateNodeInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      collection: false as const,
      required: true as const
    },
    computeValue: {
      type: 'function' as const,
      required: false as const,
      collection: false as const
    }
  };

  static create(args: StateNodeCreateArgs, options?: { uuid?: string }): StateNodeInstance {
    const instance = new StateNode(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, StateNode`);
    }
    
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: StateNodeInstance): string {
    return stringifyInstance(this, instance);
  }

  static clone(instance: StateNodeInstance, deep: boolean): StateNodeInstance {
    const args: StateNodeCreateArgs = {
      name: instance.name
    };
    if (instance.computeValue !== undefined) args.computeValue = instance.computeValue;
    
    return this.create(args);
  }

    static is(obj: unknown): obj is StateNodeInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'StateNode';
  }

    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }

  static parse(json: string): StateNodeInstance {
    const data: SerializedData<StateNodeCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 