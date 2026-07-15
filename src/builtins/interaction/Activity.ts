import { IInstance, SerializedData, generateUUID, stringifyAttribute, decodeFunctionValues } from '@core';
import { validateCreateArgs, type PublicFieldDef } from '@core';
import { Interaction, InteractionInstance } from './Interaction.js';
import { Gateway, GatewayInstance } from './Gateway.js';
import { Event, EventInstance } from './Event.js';

// Forward declarations for circular dependencies
export interface ActivityInstance extends IInstance {
  name: string;
  interactions: InteractionInstance[];
  gateways: GatewayInstance[];
  transfers: TransferInstance[];
  groups: ActivityGroupInstance[];
  events: EventInstance[];
}

export interface ActivityGroupInstance extends IInstance {
  type: string;
  activities?: ActivityInstance[];
}

export interface TransferInstance extends IInstance {
  name: string;
  source: InteractionInstance | ActivityGroupInstance | GatewayInstance;
  target: InteractionInstance | ActivityGroupInstance | GatewayInstance;
}

// Create args interfaces
export interface ActivityCreateArgs {
  name: string;
  interactions?: InteractionInstance[];
  gateways?: GatewayInstance[];
  transfers?: TransferInstance[];
  groups?: ActivityGroupInstance[];
  events?: EventInstance[];
}

export interface ActivityGroupCreateArgs {
  type: string;
  activities?: ActivityInstance[];
}

export interface TransferCreateArgs {
  name: string;
  source: InteractionInstance | ActivityGroupInstance | GatewayInstance;
  target: InteractionInstance | ActivityGroupInstance | GatewayInstance;
}

// Classes
export class Activity implements ActivityInstance {
  public uuid: string;
  public _type = 'Activity';
  public _options?: { uuid?: string };
  public name: string;
  public interactions: InteractionInstance[];
  public gateways: GatewayInstance[];
  public transfers: TransferInstance[];
  public groups: ActivityGroupInstance[];
  public events: EventInstance[];
  
  constructor(args: ActivityCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.interactions = args.interactions || [];
    this.gateways = args.gateways || [];
    this.transfers = args.transfers || [];
    this.groups = args.groups || [];
    this.events = args.events || [];
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Activity';
  static instances: ActivityInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      collection: false as const,
      required: true as const
    },
    interactions: {
      type: 'Interaction' as const,
      collection: true as const,
      defaultValue: () => []
    },
    gateways: {
      type: 'Gateway' as const,
      collection: true as const,
      defaultValue: () => []
    },
    transfers: {
      type: 'Transfer' as const,
      collection: true as const,
      defaultValue: () => []
    },
    groups: {
      type: 'ActivityGroup' as const,
      collection: true as const,
      defaultValue: () => []
    },
    events: {
      type: 'Event' as const,
      collection: true as const,
      defaultValue: () => []
    }
  };
  
  static create(args: ActivityCreateArgs, options?: { uuid?: string }): ActivityInstance {
    validateCreateArgs(this.displayName, this.public as unknown as Record<string, PublicFieldDef>, args as unknown as Record<string, unknown>);
    const instance = new Activity(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Activity`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: ActivityInstance): string {
    const args: ActivityCreateArgs = {
      name: instance.name,
      interactions: instance.interactions.length > 0 ? instance.interactions.map(i => stringifyAttribute(i) as InteractionInstance) : undefined,
      gateways: instance.gateways.length > 0 ? instance.gateways.map(g => stringifyAttribute(g) as GatewayInstance) : undefined,
      transfers: instance.transfers.length > 0 ? instance.transfers.map(t => stringifyAttribute(t) as TransferInstance) : undefined,
      groups: instance.groups.length > 0 ? instance.groups.map(g => stringifyAttribute(g) as ActivityGroupInstance) : undefined,
      events: instance.events.length > 0 ? instance.events.map(e => stringifyAttribute(e) as EventInstance) : undefined
    };
    
    const data: SerializedData<ActivityCreateArgs> = {
      type: 'Activity',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: ActivityInstance, deep: boolean): ActivityInstance {
    // CAUTION deep clone 的隔离契约与 StateMachine.clone(deep) 对齐（r28 clone 家族收口）：
    //  此前 deep 参数被忽略——克隆后对交互/网关/传递的修改会隔空影响原活动图。
    //  deep 时按 old→new 节点映射克隆整图（transfers 的 source/target 必须重指到克隆节点，
    //  否则克隆图与原图的节点集合失联）；嵌套子活动经 ActivityGroup 递归。
    //  Interaction/Gateway 内部的行为定义（conditions 回调等）由各自的 clone(deep) 决定。
    if (deep) {
      const nodeMap = new Map<InteractionInstance | ActivityGroupInstance | GatewayInstance, InteractionInstance | ActivityGroupInstance | GatewayInstance>();
      const cloneNode = <T extends InteractionInstance | ActivityGroupInstance | GatewayInstance>(node: T): T => {
        let cloned = nodeMap.get(node)
        if (!cloned) {
          if (Interaction.is(node)) cloned = Interaction.clone(node, true)
          else if (ActivityGroup.is(node)) cloned = ActivityGroup.clone(node, true)
          else cloned = Gateway.clone(node as GatewayInstance, true)
          nodeMap.set(node, cloned)
        }
        return cloned as T
      }
      const args: ActivityCreateArgs = { name: instance.name };
      if (instance.interactions?.length) args.interactions = instance.interactions.map(cloneNode);
      if (instance.gateways?.length) args.gateways = instance.gateways.map(cloneNode);
      if (instance.groups?.length) args.groups = instance.groups.map(cloneNode);
      if (instance.events?.length) args.events = instance.events.map(event => Event.clone(event, true));
      if (instance.transfers?.length) args.transfers = instance.transfers.map(transfer => Transfer.create({
        name: transfer.name,
        source: cloneNode(transfer.source),
        target: cloneNode(transfer.target),
      }));
      return this.create(args);
    }
    const args: ActivityCreateArgs = {
      name: instance.name
    };
    if (instance.interactions && instance.interactions.length > 0) args.interactions = instance.interactions;
    if (instance.gateways && instance.gateways.length > 0) args.gateways = instance.gateways;
    if (instance.transfers && instance.transfers.length > 0) args.transfers = instance.transfers;
    if (instance.groups && instance.groups.length > 0) args.groups = instance.groups;
    if (instance.events && instance.events.length > 0) args.events = instance.events;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is ActivityInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Activity';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  // 与 core（Entity.parse 等）对齐：还原 `func::` 函数并保持 uuid 身份。
  // interactions/transfers/groups 等 `uuid::` 引用需要完整实例集合才能解析——
  // graph 级反序列化请使用 createInstancesFromString（Transfer/ActivityGroup 已注册 Klass）。
  static parse(json: string): ActivityInstance {
    const data: SerializedData<ActivityCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}

export class ActivityGroup implements ActivityGroupInstance {
  public uuid: string;
  public _type = 'ActivityGroup';
  public _options?: { uuid?: string };
  public type: string;
  public activities?: ActivityInstance[];
  
  constructor(args: ActivityGroupCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.type = args.type;
    this.activities = args.activities || [];
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'ActivityGroup';
  static instances: ActivityGroupInstance[] = [];
  
  static public = {
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      // 与 ActivityCall 的 GroupStateNodeType 注册表一致（'program' 因无完成语义已除名）。
      //  声明期白名单让 typo 在 create 时报错，而不是 ActivityManager 构造期。
      options: ['any', 'every', 'race']
    },
    activities: {
      instanceType: {} as unknown as ActivityInstance,
      collection: true as const,
      required: false as const,
      defaultValue: () => []
    }
  };
  
  static create(args: ActivityGroupCreateArgs, options?: { uuid?: string }): ActivityGroupInstance {
    validateCreateArgs(this.displayName, this.public as unknown as Record<string, PublicFieldDef>, args as unknown as Record<string, unknown>);
    const instance = new ActivityGroup(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, ActivityGroup`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: ActivityGroupInstance): string {
    const args: ActivityGroupCreateArgs = {
      type: instance.type,
      activities: instance.activities && instance.activities.length > 0 
        ? instance.activities.map(a => stringifyAttribute(a) as ActivityInstance)
        : undefined
    };
    
    const data: SerializedData<ActivityGroupCreateArgs> = {
      type: 'ActivityGroup',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: ActivityGroupInstance, deep: boolean): ActivityGroupInstance {
    const args: ActivityGroupCreateArgs = {
      type: instance.type
    };
    if (instance.activities && instance.activities.length > 0) {
      // deep：嵌套子活动整图递归克隆（与 Activity.clone(deep) 的节点映射契约一致）。
      args.activities = deep ? instance.activities.map(sub => Activity.clone(sub, true)) : instance.activities;
    }
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is ActivityGroupInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'ActivityGroup';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): ActivityGroupInstance {
    const data: SerializedData<ActivityGroupCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}

export class Transfer implements TransferInstance {
  public uuid: string;
  public _type = 'Transfer';
  public _options?: { uuid?: string };
  public name: string;
  public source: InteractionInstance | ActivityGroupInstance | GatewayInstance;
  public target: InteractionInstance | ActivityGroupInstance | GatewayInstance;
  
  constructor(args: TransferCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.source = args.source;
    this.target = args.target;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Transfer';
  static instances: TransferInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      collection: false as const
    },
    source: {
      type: ['Interaction', 'ActivityGroup', 'Gateway'] as const,
      required: true as const,
      collection: false as const
    },
    target: {
      type: ['Interaction', 'ActivityGroup', 'Gateway'] as const,
      required: true as const,
      collection: false as const
    }
  };
  
  static create(args: TransferCreateArgs, options?: { uuid?: string }): TransferInstance {
    const instance = new Transfer(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Transfer`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: TransferInstance): string {
    const data: SerializedData<TransferCreateArgs> = {
      type: 'Transfer',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name,
        source: stringifyAttribute(instance.source) as InteractionInstance | ActivityGroupInstance | GatewayInstance,
        target: stringifyAttribute(instance.target) as InteractionInstance | ActivityGroupInstance | GatewayInstance
      }
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: TransferInstance, deep: boolean): TransferInstance {
    return this.create({
      name: instance.name,
      source: instance.source,
      target: instance.target
    });
  }
  
  static is(obj: unknown): obj is TransferInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Transfer';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): TransferInstance {
    const data: SerializedData<TransferCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}

// Helper functions
export function forEachInteraction(
  activity: ActivityInstance, 
  handle: (i: InteractionInstance, g?: ActivityGroupInstance) => void, 
  parentGroup?: ActivityGroupInstance
) {
  activity.interactions.forEach(i => handle(i, parentGroup));
  activity.groups.forEach(group => {
    group.activities?.forEach(sub => forEachInteraction(sub, handle, group));
  });
}

export function getInteractions(activity: ActivityInstance): InteractionInstance[] {
  const result: InteractionInstance[] = [];
  forEachInteraction(activity, (i) => result.push(i));
  return result;
}

export function findRootActivity(interaction: InteractionInstance): ActivityInstance | null {
  // TODO: Implement this function if needed
  return null;
} 