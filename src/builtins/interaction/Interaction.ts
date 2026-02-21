import {
    IInstance, SerializedData, generateUUID, Concept, ConceptAlias, ConceptInstance, DerivedConcept,
    EntityInstance, Entity, RelationInstance, Relation, Property,
    BoolExp, ExpressionData, BoolExpressionRawData, EventSourceInstance
} from '@core';
import { ActionInstance, GetAction } from './Action.js';
import { ConditionInstance } from './Condition.js';
import { ConditionsInstance, Conditions } from './Conditions.js';
import { AttributiveInstance, AttributivesInstance, Attributive, Attributives } from './Attributive.js';
import { PayloadInstance } from './Payload.js';
import { DataPolicyInstance } from './Data.js';

export interface InteractionInstance extends EventSourceInstance<InteractionEventArgs> {
  conditions?: ConditionsInstance | ConditionInstance;
  userAttributives?: AttributivesInstance | AttributiveInstance;
  userRef?: AttributiveInstance;
  action: ActionInstance;
  payload?: PayloadInstance;
  data?: EntityInstance | RelationInstance;
  dataPolicy?: DataPolicyInstance;
}

export type InteractionEventArgs = {
  user: EventUser,
  query?: EventQuery,
  payload?: EventPayload,
  activityId?: string,
  context?: Record<string, any>,
}

export type EventQuery = {
  match?: any,
  modifier?: Record<string, unknown>,
  attributeQuery?: string[],
}

export type EventPayload = {
  [k: string]: unknown
}

export type EventUser = {
  id: string,
  [k: string]: unknown
}

export const INTERACTION_RECORD = '_Interaction_'

export const InteractionEventEntity = Entity.create({
  name: INTERACTION_RECORD,
  properties: [
    Property.create({ name: 'interactionId', type: 'string', collection: false }),
    Property.create({ name: 'interactionName', type: 'string', collection: false }),
    Property.create({ name: 'payload', type: 'object', collection: false }),
    Property.create({ name: 'user', type: 'object', collection: false }),
    Property.create({ name: 'query', type: 'object', collection: false }),
    Property.create({ name: 'context', type: 'object', collection: false }),
  ]
})

export interface InteractionCreateArgs {
  name: string;
  conditions?: ConditionsInstance | ConditionInstance;
  userAttributives?: AttributivesInstance | AttributiveInstance;
  userRef?: AttributiveInstance;
  action: ActionInstance;
  payload?: PayloadInstance;
  data?: EntityInstance | RelationInstance;
  dataPolicy?: DataPolicyInstance;
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
  public data?: EntityInstance | RelationInstance;
  public dataPolicy?: DataPolicyInstance;

  public entity!: EntityInstance;
  public guard?: (this: any, args: InteractionEventArgs) => Promise<void>;
  public mapEventData?: (args: InteractionEventArgs) => Record<string, any>;
  public resolve?: (this: any, args: InteractionEventArgs) => Promise<any>;
  
  constructor(args: InteractionCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.conditions = args.conditions;
    this.userAttributives = args.userAttributives;
    this.userRef = args.userRef;
    this.action = args.action;
    this.payload = args.payload;
    this.data = args.data;
    this.dataPolicy = args.dataPolicy;
  }
  
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
    data: {
      type: ['Entity', 'Relation'] as const,
      required: false as const,
      collection: false as const
    },
    dataPolicy: {
      type: 'DataPolicy' as const,
      required: false as const,
      collection: false as const
    }
  };
  
  static create(args: InteractionCreateArgs, options?: { uuid?: string }): InteractionInstance {
    const instance = new Interaction(args, options);
    
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Interaction`);
    }

    instance.entity = InteractionEventEntity;

    instance.guard = buildInteractionGuard(instance);
    instance.mapEventData = buildInteractionMapEventData(instance);

    if (args.action === GetAction) {
      instance.resolve = buildInteractionResolve(instance);
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

    if (instance.data !== undefined) args.data = instance.data;
    if (instance.dataPolicy !== undefined) args.dataPolicy = instance.dataPolicy;
    
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

    if (instance.data !== undefined) args.data = instance.data;
    if (instance.dataPolicy !== undefined) args.dataPolicy = instance.dataPolicy;
    
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

export class InteractionGuardError extends Error {
  public readonly type: string
  public readonly error: any
  public readonly checkType: string

  constructor(message: string, options: { type: string, checkType: string, error?: any }) {
    super(message)
    this.name = 'InteractionGuardError'
    this.type = options.type
    this.checkType = options.checkType
    this.error = options.error
  }
}

function buildInteractionGuard(interaction: InteractionInstance): (this: any, args: InteractionEventArgs) => Promise<void> {
  return async function(this: any, args: InteractionEventArgs) {
    await checkCondition(this, interaction, args);
    await checkUser(this, interaction, args);
    await checkPayload(this, interaction, args);
  };
}

function buildInteractionMapEventData(interaction: InteractionInstance): (args: InteractionEventArgs) => Record<string, any> {
  return (args: InteractionEventArgs) => ({
    interactionName: interaction.name,
    interactionId: interaction.uuid,
    user: args.user,
    query: args.query || {},
    payload: args.payload || {},
    context: args.context || {},
  });
}

function buildInteractionResolve(interaction: InteractionInstance): (this: any, args: InteractionEventArgs) => Promise<any> {
  return async function(this: any, args: InteractionEventArgs) {
    return retrieveData(this, interaction, args);
  };
}

export async function checkCondition(controller: any, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  if (!interaction.conditions) return;

  const conditions = Conditions.is(interaction.conditions)
    ? new BoolExp<ConditionInstance>(interaction.conditions.content as BoolExpressionRawData<ConditionInstance>)
    : BoolExp.atom<ConditionInstance>(interaction.conditions as ConditionInstance);

  const handleAttribute = async (condition: ConditionInstance) => {
    if (!condition) return true;
    if (condition.content) {
      let result;
      try {
        result = await condition.content.call(controller, eventArgs);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return `Condition '${condition.name}' threw exception: ${errorMessage}`;
      }
      if (result === undefined) return true;
      return result;
    }
    return true;
  };

  const result = await conditions.evaluateAsync(handleAttribute);
  if (result !== true) {
    throw new InteractionGuardError(`Condition check failed: ${(result as any)?.data?.name}`, {
      type: 'condition check failed',
      checkType: 'condition',
      error: result,
    });
  }
}

async function checkAttributive(controller: any, attributive: any, eventArgs: InteractionEventArgs | undefined, target: any): Promise<boolean> {
  if (attributive.content) {
    let result;
    try {
      result = await attributive.content.call(controller, target, eventArgs);
    } catch (_e) {
      result = false;
    }
    if (result === undefined) return true;
    return result;
  }
  return true;
}

async function checkUser(controller: any, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  if (!interaction.userAttributives) return;

  const userAttributiveCombined = Attributives.is(interaction.userAttributives)
    ? BoolExp.fromValue<AttributiveInstance>(interaction.userAttributives.content! as ExpressionData<AttributiveInstance>)
    : BoolExp.atom<AttributiveInstance>(interaction.userAttributives as AttributiveInstance);

  const checkHandle = (attributive: AttributiveInstance) => {
    return checkAttributive(controller, attributive, eventArgs, eventArgs.user);
  };

  const result = await userAttributiveCombined.evaluateAsync(checkHandle);
  if (result !== true) {
    throw new InteractionGuardError('User check failed', {
      type: 'check user failed',
      checkType: 'user',
      error: result,
    });
  }
}

export async function checkPayload(controller: any, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  const payload = eventArgs.payload || {};
  const payloadDefs = interaction.payload?.items || [];

  const payloadKeys = Object.keys(payload);
  for (const payloadKey of payloadKeys) {
    if (!payloadDefs.some(payloadDef => payloadDef.name === payloadKey)) {
      throw new InteractionGuardError(
        `${payloadKey} in payload is not defined in interaction ${interaction.name}`,
        { type: `${payloadKey} not defined`, checkType: 'payload' }
      );
    }
  }

  for (const payloadDef of payloadDefs) {
    if (payloadDef.required && !(payloadDef.name! in payload)) {
      throw new InteractionGuardError(
        `Payload validation failed for field '${payloadDef.name}': missing`,
        { type: `${payloadDef.name} missing`, checkType: 'payload' }
      );
    }

    const payloadItem = payload[payloadDef.name!];
    if (payloadItem === undefined) return;

    if (payloadDef.isCollection && !Array.isArray(payloadItem)) {
      throw new InteractionGuardError(
        `Payload validation failed for field '${payloadDef.name}': data is not array`,
        { type: `${payloadDef.name} data is not array`, checkType: 'payload' }
      );
    }

    if (payloadDef.isCollection) {
      if (payloadDef.isRef && !((payloadItem as unknown[]) as { id: string }[]).every(item => !!item.id)) {
        throw new InteractionGuardError(
          `Payload validation failed for field '${payloadDef.name}': data not every is ref`,
          { type: `${payloadDef.name} data not every is ref`, checkType: 'payload' }
        );
      }
    } else {
      if (payloadDef.isRef && !(payloadItem as { id: string }).id) {
        throw new InteractionGuardError(
          `Payload validation failed for field '${payloadDef.name}': data is not a ref`,
          { type: `${payloadDef.name} data is not a ref`, checkType: 'payload' }
        );
      }
    }

    if (payloadDef.base) {
      if (payloadDef.isCollection) {
        for (const item of payloadItem as unknown[]) {
          const result = await checkConcept(item, payloadDef.base as unknown as Concept);
          if (result !== true) {
            throw new InteractionGuardError(
              `Concept check failed for field '${payloadDef.name}'`,
              { type: `${payloadDef.name} check concept failed`, checkType: 'concept', error: result }
            );
          }
        }
      } else {
        const result = await checkConcept(payloadItem, payloadDef.base as unknown as Concept);
        if (result !== true) {
          throw new InteractionGuardError(
            `Concept check failed for field '${payloadDef.name}'`,
            { type: `${payloadDef.name} check concept failed`, checkType: 'concept', error: result }
          );
        }
      }
    }
  }
}

async function checkConcept(instance: ConceptInstance, concept: Concept): Promise<any> {
  if ((concept as DerivedConcept).base) {
    const derived = concept as DerivedConcept;
    if (derived.attributive) {
      return checkConcept(instance, derived.base!);
    }
    return checkConcept(instance, derived.base!);
  }

  if ((concept as ConceptAlias).for) {
    for (const c of (concept as ConceptAlias).for!) {
      const result = await checkConcept(instance, c);
      if (result === true) return true;
    }
    return { name: (concept as any).name, type: 'conceptAlias', error: 'no match' };
  }

  if (Attributive.is(concept as any)) {
    return true;
  }

  if (Entity.is(concept as any)) {
    if (instance && typeof instance === 'object') return true;
    return { name: (concept as any).name || '', type: 'conceptCheck', error: 'invalid entity data' };
  }

  if (instance && typeof instance === 'object') return true;
  return true;
}

async function retrieveData(controller: any, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  if (Entity.is(interaction.data) || Relation.is(interaction.data)) {
    const recordName = (interaction.data as EntityInstance).name!;

    const fixedMatch = interaction.dataPolicy?.match;
    const fixedModifier = interaction.dataPolicy?.modifier;

    const modifier = { ...(eventArgs.query?.modifier || {}), ...(fixedModifier || {}) };
    const attributeQuery = eventArgs.query?.attributeQuery || [];

    const matchValue = typeof fixedMatch === 'function'
      ? await fixedMatch.call(controller, eventArgs)
      : fixedMatch;
    const combinedMatch = BoolExp.and(matchValue, eventArgs.query?.match);

    return controller.system.storage.find(recordName, combinedMatch, modifier, attributeQuery);
  }
  return undefined;
}
