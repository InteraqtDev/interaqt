import { IInstance, SerializedData, generateUUID } from '../../core/interfaces.js';
import { stringifyAttribute } from '../../core/utils.js';
import { InteractionInstance } from './Interaction.js';
import { GatewayInstance } from './Gateway.js';
import { EventInstance } from './Event.js';

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
  
  static parse(json: string): ActivityInstance {
    const data: SerializedData<ActivityCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
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
      collection: false as const
    },
    activities: {
      instanceType: {} as unknown as ActivityInstance,
      collection: true as const,
      required: false as const,
      defaultValue: () => []
    }
  };
  
  static create(args: ActivityGroupCreateArgs, options?: { uuid?: string }): ActivityGroupInstance {
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
    if (instance.activities && instance.activities.length > 0) args.activities = instance.activities;
    
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
    return this.create(data.public, data.options);
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
    return this.create(data.public, data.options);
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