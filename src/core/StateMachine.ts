import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import { StateNodeInstance } from './StateNode.js';
import { StateTransferInstance } from './StateTransfer.js';

export interface StateMachineInstance extends IInstance {
  states: StateNodeInstance[];
  transfers: StateTransferInstance[];
  initialState: StateNodeInstance;
}

export interface StateMachineCreateArgs {
  states: StateNodeInstance[];
  transfers: StateTransferInstance[];
  initialState: StateNodeInstance;
}

export class StateMachine implements StateMachineInstance {
  public uuid: string;
  public _type = 'StateMachine';
  public _options?: { uuid?: string };
  public states: StateNodeInstance[];
  public transfers: StateTransferInstance[];
  public initialState: StateNodeInstance;
  
  constructor(args: StateMachineCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.states = args.states;
    this.transfers = args.transfers;
    this.initialState = args.initialState;
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
    initialState: {
      type: 'StateNode' as const,
      collection: false as const,
      required: true as const
    }
  };
  
  static create(args: StateMachineCreateArgs, options?: { uuid?: string }): StateMachineInstance {
    // CAUTION 声明期图完整性校验（r22）：运行期转移表（TransitionFinder）按 StateNode 的
    //  name 字符串索引——同名节点会被静默合并进同一个桶，各自的 computeValue / 转移语义
    //  产生歧义（命中哪个取决于 transfers 数组顺序）。initialState / transfer 端点脱离
    //  states 数组则是声明与运行语义的分裂（states 是序列化与迁移签名的声明面）。
    //  序列化管线（parse/fromData）传入的可能是未解析的 uuid 引用（graph 管线负责解析），
    //  只对已解析的 StateNode 实例执行图校验。
    if (!args.states || args.states.length === 0) {
      throw new Error('StateMachine requires a non-empty states array.');
    }
    const isResolvedNode = (node: unknown): boolean =>
      node !== null && typeof node === 'object' && typeof (node as { name?: unknown }).name === 'string';
    const allResolved = args.states.every(isResolvedNode)
      && isResolvedNode(args.initialState)
      && (args.transfers || []).every(transfer => isResolvedNode(transfer?.current) && isResolvedNode(transfer?.next));
    if (allResolved) {
      const namesSeen = new Set<string>();
      for (const state of args.states) {
        if (namesSeen.has(state.name)) {
          throw new Error(`StateMachine declares duplicate state name "${state.name}". State names must be unique — transitions are keyed by state name, so duplicates make the machine ambiguous.`);
        }
        namesSeen.add(state.name);
      }
      const stateSet = new Set(args.states);
      if (!stateSet.has(args.initialState)) {
        throw new Error(`StateMachine initialState "${args.initialState?.name}" is not in the states array. Declare every state node in states.`);
      }
      for (const transfer of args.transfers || []) {
        if (!stateSet.has(transfer.current)) {
          throw new Error(`StateMachine transfer references current state "${transfer.current?.name}" which is not in the states array. Declare every state node in states.`);
        }
        if (!stateSet.has(transfer.next)) {
          throw new Error(`StateMachine transfer references next state "${transfer.next?.name}" which is not in the states array. Declare every state node in states.`);
        }
      }
    }

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
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: StateMachineInstance, deep: boolean): StateMachineInstance {
    return this.create({
      states: instance.states,
      transfers: instance.transfers,
      initialState: instance.initialState
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
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 