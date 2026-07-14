import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import { StateNodeInstance } from './StateNode.js';
// Partial RecordMutationEvent type for trigger matching
export type RecordMutationEventPattern = {
  recordName: string;
  type: 'create' | 'update' | 'delete';
  keys?: string[];
  record?: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
};

export interface StateTransferInstance extends IInstance {
  trigger: RecordMutationEventPattern;
  current: StateNodeInstance;
  next: StateNodeInstance;
  computeTarget?: Function;
}

export interface StateTransferCreateArgs {
  trigger: RecordMutationEventPattern;
  current: StateNodeInstance;
  next: StateNodeInstance;
  computeTarget?: Function;
}

export class StateTransfer implements StateTransferInstance {
  public uuid: string;
  public _type = 'StateTransfer';
  public _options?: { uuid?: string };
  public trigger: RecordMutationEventPattern;
  public current: StateNodeInstance;
  public next: StateNodeInstance;
  public computeTarget?: Function;
  
  constructor(args: StateTransferCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.trigger = args.trigger;
    this.current = args.current;
    this.next = args.next;
    this.computeTarget = args.computeTarget;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'StateTransfer';
  static instances: StateTransferInstance[] = [];
  
  static public = {
    trigger: {
      instanceType: {} as unknown as RecordMutationEventPattern,
      collection: false as const,
      required: true as const
    },
    current: {
      type: 'StateNode' as const,
      collection: false as const,
      required: true as const
    },
    next: {
      type: 'StateNode' as const,
      collection: false as const,
      required: true as const
    },
    computeTarget: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: StateTransferCreateArgs, options?: { uuid?: string }): StateTransferInstance {
    const instance = new StateTransfer(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, StateTransfer`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: StateTransferInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: StateTransferInstance, deep: boolean): StateTransferInstance {
    // CAUTION deep clone 的隔离契约与 StateMachine.clone(deep) 对齐（r26 L-5 的兄弟面）：
    //  trigger 是纯数据模式，deep 时必须 structuredClone——否则修改克隆的 trigger.record
    //  会静默改写原 transfer 的触发条件（状态机行为被隔空篡改）。
    //  current/next 保持引用共享：节点身份必须与所属 StateMachine 的 states 数组同一
    //  （standalone clone 没有节点映射上下文，克隆节点会产生游离孤儿）；整图深拷贝
    //  请走 StateMachine.clone(sm, true)。computeTarget 按惯例共享行为函数（Count.clone 同）。
    return this.create({
      trigger: deep ? structuredClone(instance.trigger) : instance.trigger,
      current: instance.current,
      next: instance.next,
      computeTarget: instance.computeTarget
    });
  }
  
    static is(obj: unknown): obj is StateTransferInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'StateTransfer';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): StateTransferInstance {
    const data: SerializedData<StateTransferCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 