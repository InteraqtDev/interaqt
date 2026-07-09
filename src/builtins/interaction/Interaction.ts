import {
    IInstance, SerializedData, generateUUID, Concept, ConceptAlias, ConceptInstance, DerivedConcept,
    EntityInstance, Entity, RelationInstance, Relation, Property,
    BoolExp, ExpressionData, BoolExpressionRawData, EventSourceInstance,
    stringifyInstance, decodeFunctionValues
} from '@core';
import type { Controller } from '@runtime';
import { ActionInstance, GetAction } from './Action.js';
import { ConditionInstance } from './Condition.js';
import { ConditionsInstance, Conditions } from './Conditions.js';
import { AttributiveInstance, AttributivesInstance, Attributive, Attributives } from './Attributive.js';
import { PayloadInstance } from './Payload.js';
import { DataPolicyInstance } from './Data.js';

export interface InteractionInstance extends EventSourceInstance<InteractionEventArgs, unknown> {
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
  context?: Record<string, unknown>,
}

export type EventQuery = {
  match?: unknown,
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
  public guard?: (this: Controller, args: InteractionEventArgs) => Promise<void>;
  public mapEventData?: (args: InteractionEventArgs) => Record<string, unknown>;
  public resolve?: (this: Controller, args: InteractionEventArgs) => Promise<unknown>;
  
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
  
  // CAUTION 必须走统一的 stringifyInstance 管线：嵌套的 Klass 实例（Action/Conditions/Payload/Entity 等）
  //  会被编码为 `uuid::` 引用、函数编码为 `func::`。此前手写的 JSON.stringify 会把嵌套实例内联成
  //  plain object（函数直接丢失、Klass 身份丢失），graph 级 round-trip（stringifyAllInstances →
  //  createInstancesFromString）产出损毁的 Interaction。
  static stringify(instance: InteractionInstance): string {
    return stringifyInstance(this, instance as unknown as IInstance);
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
  
  // 与 core（Entity.parse 等）对齐：还原 `func::` 函数并保持 uuid 身份。
  // `uuid::` 引用需要完整实例集合才能解析——graph 级反序列化请使用 createInstancesFromString。
  static parse(json: string): InteractionInstance {
    const data: SerializedData<InteractionCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}

export class InteractionGuardError extends Error {
  public readonly type: string
  public readonly error: unknown
  public readonly checkType: string

  constructor(message: string, options: { type: string, checkType: string, error?: unknown }) {
    super(message)
    this.name = 'InteractionGuardError'
    this.type = options.type
    this.checkType = options.checkType
    this.error = options.error
  }
}

function buildInteractionGuard(interaction: InteractionInstance): (this: Controller, args: InteractionEventArgs) => Promise<void> {
  return async function(this: Controller, args: InteractionEventArgs) {
    await runInteractionGuard(this, interaction, args);
  };
}

function buildInteractionMapEventData(interaction: InteractionInstance): (args: InteractionEventArgs) => Record<string, unknown> {
  return (args: InteractionEventArgs) => ({
    interactionName: interaction.name,
    interactionId: interaction.uuid,
    user: args.user,
    query: args.query || {},
    payload: args.payload || {},
    context: args.context || {},
  });
}

function buildInteractionResolve(interaction: InteractionInstance): (this: Controller, args: InteractionEventArgs) => Promise<unknown> {
  return async function(this: Controller, args: InteractionEventArgs) {
    return retrieveData(this, interaction, args);
  };
}

// Guard checks only need storage access and the ignoreGuard flag; using a structural
// type keeps them callable from both Controller and the activity runtime wrappers.
export type GuardController = { system: { storage: any }, ignoreGuard?: boolean }

// isRef user attributives can only be resolved inside an activity, where previously
// saved refs are available. The activity runtime provides this hook.
export type CheckUserRefHandle = (attributive: AttributiveInstance) => Promise<boolean> | boolean

export type InteractionGuardOptions = {
  checkUserRef?: CheckUserRefHandle
}

// The single guard runner shared by standalone interactions (buildInteractionGuard)
// and activity-wrapped interactions (ActivityCall.fullGuardWithUserRef), so the two
// paths cannot drift apart.
export async function runInteractionGuard(
  controller: GuardController,
  interaction: InteractionInstance,
  args: InteractionEventArgs,
  options?: InteractionGuardOptions
): Promise<void> {
  await checkCondition(controller, interaction, args);
  await checkUser(controller, interaction, args, options?.checkUserRef);
  await checkPayload(controller, interaction, args);
}

export async function checkCondition(controller: GuardController, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  if (!interaction.conditions) return;

  const conditions = Conditions.is(interaction.conditions)
    ? new BoolExp<ConditionInstance>(interaction.conditions.content as BoolExpressionRawData<ConditionInstance>)
    : BoolExp.atom<ConditionInstance>(interaction.conditions as ConditionInstance);

  const handleAttribute = async (condition: ConditionInstance) => {
    // fail-closed: a condition placed on the guard chain must be executable,
    // and its callback must explicitly return a boolean.
    if (!condition || !condition.content) {
      return `Condition '${(condition as ConditionInstance | undefined)?.name ?? '(unnamed)'}' has no content to execute`;
    }
    let result;
    try {
      result = await condition.content.call(controller, eventArgs);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return `Condition '${condition.name}' threw exception: ${errorMessage}`;
    }
    if (result === undefined) {
      return `Condition '${condition.name}' returned undefined; guard callbacks must explicitly return a boolean (did you forget a return statement?)`;
    }
    return result;
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

// Returns `true`/`false` from the attributive callback, or an error-message string
// (treated as failure by BoolExp.evaluateAsync) for definition-level problems.
export async function checkAttributive(controller: GuardController, attributive: AttributiveInstance, eventArgs: InteractionEventArgs | undefined, target: unknown): Promise<boolean | string> {
  // fail-closed: an attributive on the guard chain without executable content
  // must not silently grant access.
  if (!attributive.content) {
    return `Attributive '${attributive.name ?? '(unnamed)'}' has no content to execute`;
  }
  let result;
  try {
    result = await attributive.content.call(controller, target, eventArgs);
  } catch (e) {
    // CAUTION 与 Condition 一致：异常作为错误信息透出（fail-closed），而不是吞成 false。
    //  吞成 false 会让运维无法区分权限误配与真实拒绝；更严重的是在 not(attributive)
    //  组合下 false 会被取反成 true，异常反而变成放行（fail-open）。
    //  错误字符串在 BoolExp.evaluateAsync 中无论是否处于 not 之下都判为失败。
    const errorMessage = e instanceof Error ? e.message : String(e);
    return `Attributive '${attributive.name ?? '(unnamed)'}' threw exception: ${errorMessage}`;
  }
  if (result === undefined) {
    return `Attributive '${attributive.name ?? '(unnamed)'}' returned undefined; guard callbacks must explicitly return a boolean (did you forget a return statement?)`;
  }
  return result;
}

async function checkUser(controller: GuardController, interaction: InteractionInstance, eventArgs: InteractionEventArgs, checkUserRef?: CheckUserRefHandle) {
  if (!interaction.userAttributives) return;

  const userAttributiveCombined = Attributives.is(interaction.userAttributives)
    ? BoolExp.fromValue<AttributiveInstance>(interaction.userAttributives.content! as ExpressionData<AttributiveInstance>)
    : BoolExp.atom<AttributiveInstance>(interaction.userAttributives as AttributiveInstance);

  const checkHandle = (attributive: AttributiveInstance) => {
    if (attributive.isRef) {
      // `isRef` means "must be the specific user bound in the activity refs".
      // Inside an activity the runtime provides checkUserRef; outside, there are no
      // refs, so evaluating it would silently degrade to an unrelated role check —
      // reject the definition instead.
      if (checkUserRef) {
        return checkUserRef(attributive);
      }
      throw new InteractionGuardError(
        `Attributive '${attributive.name ?? '(unnamed)'}' has isRef: true, which can only be checked inside an activity. Use it on an activity interaction, or remove isRef for a standalone interaction.`,
        { type: 'isRef attributive outside activity', checkType: 'user' }
      );
    }
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

// Runtime checks for the primitive payload types a PayloadItem can declare.
// Non-primitive declarations (e.g. 'Entity'/'Relation') are validated through
// `base`/concept checks below instead.
const payloadPrimitiveTypeChecks: Record<string, (value: unknown) => boolean> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number',
  boolean: value => typeof value === 'boolean',
  object: value => value !== null && typeof value === 'object',
};

export async function checkPayload(controller: GuardController, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
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
    // CAUTION must be `continue`, not `return`: a missing optional field only skips
    // its own checks, never the validation of the fields defined after it.
    if (payloadItem === undefined) continue;

    if (payloadDef.isCollection && !Array.isArray(payloadItem)) {
      throw new InteractionGuardError(
        `Payload validation failed for field '${payloadDef.name}': data is not array`,
        { type: `${payloadDef.name} data is not array`, checkType: 'payload' }
      );
    }

    // enforce the declared primitive type: `type: 'string'` must reject objects etc.
    const primitiveTypeCheck = payloadPrimitiveTypeChecks[payloadDef.type];
    if (primitiveTypeCheck) {
      const itemsToCheck = payloadDef.isCollection ? (payloadItem as unknown[]) : [payloadItem];
      for (const item of itemsToCheck) {
        if (!primitiveTypeCheck(item)) {
          throw new InteractionGuardError(
            `Payload validation failed for field '${payloadDef.name}': expected ${payloadDef.type}, got ${item === null ? 'null' : typeof item}`,
            { type: `${payloadDef.name} type mismatch`, checkType: 'payload' }
          );
        }
      }
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

    // isRef payloads must reference an existing record of the declared entity/relation:
    // a made-up id (or an id belonging to another entity) must be rejected at the guard,
    // before any event record is created with wrong semantics.
    const baseRecordName = Entity.is(payloadDef.base) || Relation.is(payloadDef.base)
      ? (payloadDef.base as EntityInstance).name
      : undefined;
    if (payloadDef.isRef && baseRecordName) {
      const items = (payloadDef.isCollection ? payloadItem : [payloadItem]) as { id: string }[];
      for (const item of items) {
        const existing = await controller.system.storage.findOne(
          baseRecordName,
          BoolExp.atom({ key: 'id', value: ['=', item.id] }),
          undefined,
          ['id']
        );
        if (!existing) {
          throw new InteractionGuardError(
            `Payload validation failed for field '${payloadDef.name}': referenced ${baseRecordName} with id '${item.id}' does not exist`,
            { type: `${payloadDef.name} ref not found`, checkType: 'payload' }
          );
        }
      }
    }

    if (payloadDef.base) {
      const items = payloadDef.isCollection ? (payloadItem as unknown[]) : [payloadItem];
      for (const item of items) {
        const result = await checkConcept(controller, eventArgs, item, payloadDef.base as unknown as Concept);
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

// Evaluates an Attributive or an Attributives (bool expression of attributives)
// attached to a concept against a payload item.
async function checkConceptAttributive(controller: GuardController, attributive: unknown, eventArgs: InteractionEventArgs, target: unknown): Promise<boolean | string> {
  if (Attributives.is(attributive)) {
    const combined = BoolExp.fromValue<AttributiveInstance>((attributive as AttributivesInstance).content! as ExpressionData<AttributiveInstance>);
    const result = await combined.evaluateAsync((atom: AttributiveInstance) => checkAttributive(controller, atom, eventArgs, target));
    return result === true ? true : 'attributives check failed';
  }
  if (Attributive.is(attributive)) {
    return checkAttributive(controller, attributive, eventArgs, target);
  }
  return `unsupported attributive type in concept: ${JSON.stringify(attributive)}`;
}

async function checkConcept(controller: GuardController, eventArgs: InteractionEventArgs, instance: ConceptInstance, concept: Concept): Promise<true | { name: string, type: string, error: string }> {
  if (Attributive.is(concept as unknown) || Attributives.is(concept as unknown)) {
    const result = await checkConceptAttributive(controller, concept, eventArgs, instance);
    if (result === true) return true;
    return {
      name: (concept as { name?: string }).name || '',
      type: 'attributiveCheck',
      error: typeof result === 'string' ? result : 'attributive check failed'
    };
  }

  if (Entity.is(concept as unknown) || Relation.is(concept as unknown)) {
    if (instance && typeof instance === 'object') return true;
    return { name: (concept as { name?: string }).name || '', type: 'conceptCheck', error: 'invalid entity data' };
  }

  if ((concept as ConceptAlias).for) {
    for (const c of (concept as ConceptAlias).for!) {
      const result = await checkConcept(controller, eventArgs, instance, c);
      if (result === true) return true;
    }
    return { name: (concept as { name?: string }).name || '', type: 'conceptAlias', error: 'no match' };
  }

  if ((concept as DerivedConcept).base) {
    const derived = concept as DerivedConcept;
    const baseResult = await checkConcept(controller, eventArgs, instance, derived.base!);
    if (baseResult !== true) return baseResult;
    if (derived.attributive) {
      const result = await checkConceptAttributive(controller, derived.attributive, eventArgs, instance);
      if (result !== true) {
        return {
          name: derived.name || '',
          type: 'derivedConceptCheck',
          error: typeof result === 'string' ? result : 'attributive check failed'
        };
      }
    }
    return true;
  }

  // fail-closed: an unrecognized concept type on a payload definition is a definition
  // error, not a license to skip validation.
  return {
    name: (concept as { name?: string })?.name || '',
    type: 'conceptCheck',
    error: `unknown concept type; payload base must be an Entity, Relation, Attributive(s), ConceptAlias or DerivedConcept`
  };
}

async function retrieveData(controller: Controller, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
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
