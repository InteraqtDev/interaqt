import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { StateNodeInstance } from './StateNode.js';
import { InteractionInstance } from './Interaction.js';

export interface StateTransferInstance extends IInstance {
  trigger: InteractionInstance;
  current: StateNodeInstance;
  next: StateNodeInstance;
  computeTarget?: Function;
}

export interface StateTransferCreateArgs {
  trigger: InteractionInstance;
  current: StateNodeInstance;
  next: StateNodeInstance;
  computeTarget?: Function;
}

export class StateTransfer implements StateTransferInstance {
  public uuid: string;
  public _type = 'StateTransfer';
  public _options?: { uuid?: string };
  public trigger: InteractionInstance;
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
      instanceType: {} as unknown as InteractionInstance,
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
    const args: StateTransferCreateArgs = {
      trigger: instance.trigger,
      current: instance.current,
      next: instance.next
    };
    if (instance.computeTarget !== undefined) args.computeTarget = instance.computeTarget;
    
    const data: SerializedData<StateTransferCreateArgs> = {
      type: 'StateTransfer',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: StateTransferInstance, deep: boolean): StateTransferInstance {
    return this.create({
      trigger: instance.trigger,
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
    return this.create(data.public, data.options);
  }
} 