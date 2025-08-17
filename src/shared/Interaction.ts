import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { ActionInstance } from './Action.js';
import { ConditionInstance } from './Condition.js';
import { ConditionsInstance } from './Conditions.js';
import { AttributiveInstance, AttributivesInstance } from './Attributive.js';
import { PayloadInstance } from './Payload.js';
import { SideEffectInstance } from './SideEffect.js';
import { EntityInstance } from './Entity.js';
import { RelationInstance } from './Relation.js';
import { QueryInstance } from './Data.js';

export interface InteractionInstance extends IInstance {
  name: string;
  conditions?: ConditionsInstance | ConditionInstance;
  userAttributives?: AttributivesInstance | AttributiveInstance;
  userRef?: AttributiveInstance;
  action: ActionInstance;
  payload?: PayloadInstance;
  sideEffects?: SideEffectInstance[];
  data?: EntityInstance | RelationInstance;
  query?: QueryInstance;
}

export interface InteractionCreateArgs {
  name: string;
  conditions?: ConditionsInstance | ConditionInstance;
  userAttributives?: AttributivesInstance | AttributiveInstance;
  userRef?: AttributiveInstance;
  action: ActionInstance;
  payload?: PayloadInstance;
  sideEffects?: SideEffectInstance[];
  data?: EntityInstance | RelationInstance;
  query?: QueryInstance;
}

export class Interaction implements InteractionInstance {
  public uuid: string;
  public _type = 'Interaction';
  public _options?: { uuid?: string };
  public name: string;
  public conditions?: ConditionsInstance | ConditionInstance;
  public userAttributives?: AttributivesInstance | AttributiveInstance;
  public userRef?: AttributiveInstance;
  public action: ActionInstance;
  public payload?: PayloadInstance;
  public sideEffects: SideEffectInstance[];
  public data?: EntityInstance | RelationInstance;
  public query?: QueryInstance;
  
  constructor(args: InteractionCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.conditions = args.conditions;
    this.userAttributives = args.userAttributives;
    this.userRef = args.userRef;
    this.action = args.action;
    this.payload = args.payload;
    this.sideEffects = args.sideEffects || [];
    this.data = args.data;
    this.query = args.query;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Interaction';
  static instances: InteractionInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      collection: false as const,
      required: true as const
    },
    conditions: {
      type: ['Conditions', 'Condition'] as const,
      required: false as const,
      collection: false as const,
    },
    userAttributives: {
      type: ['Attributives', 'Attributive'] as const,
      required: false as const,
      collection: false as const,
    },
    userRef: {
      type: 'Attributive' as const,
      collection: false as const,
    },
    action: {
      type: 'Action' as const,
      collection: false as const,
      required: true as const
    },
    payload: {
      type: 'Payload' as const,
      collection: false as const,
    },
    sideEffects: {
      type: 'SideEffect' as const,
      collection: true as const,
      defaultValue: () => []
    },
    data: {
      type: ['Entity', 'Relation'] as const,
      required: false as const,
      collection: false as const
    },
    query: {
      type: 'Query' as const,
      required: false as const,
      collection: false as const
    }
  };
  
  static create(args: InteractionCreateArgs, options?: { uuid?: string }): InteractionInstance {
    const instance = new Interaction(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Interaction`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: InteractionInstance): string {
    const args: InteractionCreateArgs = {
      name: instance.name,
      action: instance.action
    };
    if (instance.conditions !== undefined) args.conditions = instance.conditions;
    if (instance.userAttributives !== undefined) args.userAttributives = instance.userAttributives;
    if (instance.userRef !== undefined) args.userRef = instance.userRef;
    if (instance.payload !== undefined) args.payload = instance.payload;
    if (instance.sideEffects && instance.sideEffects.length > 0) args.sideEffects = instance.sideEffects;

    if (instance.data !== undefined) args.data = instance.data;
    if (instance.query !== undefined) args.query = instance.query;
    
    const data: SerializedData<InteractionCreateArgs> = {
      type: 'Interaction',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: InteractionInstance, deep: boolean): InteractionInstance {
    const args: InteractionCreateArgs = {
      name: instance.name,
      action: instance.action
    };
    if (instance.conditions !== undefined) args.conditions = instance.conditions;
    if (instance.userAttributives !== undefined) args.userAttributives = instance.userAttributives;
    if (instance.userRef !== undefined) args.userRef = instance.userRef;
    if (instance.payload !== undefined) args.payload = instance.payload;
    if (instance.sideEffects && instance.sideEffects.length > 0) args.sideEffects = instance.sideEffects;

    if (instance.data !== undefined) args.data = instance.data;
    if (instance.query !== undefined) args.query = instance.query;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is InteractionInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Interaction';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): InteractionInstance {
    const data: SerializedData<InteractionCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 