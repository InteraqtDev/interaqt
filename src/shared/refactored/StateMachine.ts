import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { StateNodeInstance } from './StateNode.js';
import { StateTransferInstance } from './StateTransfer.js';

export interface StateMachineInstance extends IInstance {
  states: StateNodeInstance[];
  transfers: StateTransferInstance[];
  defaultState: StateNodeInstance;
}

export interface StateMachineCreateArgs {
  states: StateNodeInstance[];
  transfers: StateTransferInstance[];
  defaultState: StateNodeInstance;
}

export class StateMachine implements StateMachineInstance {
  public uuid: string;
  public _type = 'StateMachine';
  public _options?: { uuid?: string };
  public states: StateNodeInstance[];
  public transfers: StateTransferInstance[];
  public defaultState: StateNodeInstance;
  
  constructor(args: StateMachineCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.states = args.states;
    this.transfers = args.transfers;
    this.defaultState = args.defaultState;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'StateMachine';
  static instances: StateMachineInstance[] = [];
  
  static public = {
    states: {
      type: 'StateNode' as const,
      collection: true as const,
      required: true as const
    },
    transfers: {
      type: 'StateTransfer' as const,
      collection: true as const,
      required: true as const
    },
    defaultState: {
      type: 'StateNode' as const,
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: StateMachineCreateArgs, options?: { uuid?: string }): StateMachineInstance {
    const instance = new StateMachine(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, StateMachine`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: StateMachineInstance): string {
    const data: SerializedData<StateMachineCreateArgs> = {
      type: 'StateMachine',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        states: instance.states,
        transfers: instance.transfers,
        defaultState: instance.defaultState
      }
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: StateMachineInstance, deep: boolean): StateMachineInstance {
    return this.create({
      states: instance.states,
      transfers: instance.transfers,
      defaultState: instance.defaultState
    });
  }
  
    static is(obj: unknown): obj is StateMachineInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'StateMachine';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): StateMachineInstance {
    const data: SerializedData<StateMachineCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 