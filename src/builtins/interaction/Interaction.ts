import {
    IInstance, SerializedData, generateUUID,
    EntityInstance, Entity, RelationInstance, Relation, Property,
    BoolExp, BoolExpressionRawData, EventSourceInstance,
    stringifyInstance, decodeFunctionValues
} from '@core';
import type { Controller } from '@runtime';
import { ActionInstance, GET_ACTION_UUID } from './Action.js';
import { ConditionInstance } from './Condition.js';
import { ConditionsInstance, Conditions } from './Conditions.js';
import { PayloadInstance } from './Payload.js';
import { DataPolicyInstance } from './Data.js';

export interface InteractionInstance extends EventSourceInstance<InteractionEventArgs, unknown> {
  conditions?: ConditionsInstance | ConditionInstance;
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
    // fail-fast：挂在守卫链上的容器必须可执行。content 为空的 Conditions
    //  会在每次 dispatch 时深入到 BoolExp 构造器才抛出与用户写法无关的内部错误
    //  （"BoolExp raw data cannot be undefined"），必须在声明期给出业务级错误。
    if (Conditions.is(args.conditions) && !args.conditions.content) {
      throw new Error(`Interaction "${args.name}" declares conditions with a Conditions instance that has no content. Provide content (a Condition BoolExp), or omit the conditions field.`);
    }
    // 显式拒绝已废弃的 Attributive 概念参数：静默丢弃会让旧代码以为权限仍然生效（fail-open）。
    const legacyArgs = args as unknown as Record<string, unknown>;
    for (const legacyKey of ['userAttributives', 'userRef'] as const) {
      if (legacyArgs[legacyKey] !== undefined) {
        throw new Error(
          `Interaction "${args.name}" declares "${legacyKey}", but the Attributive concept has been removed. ` +
          `Express the check as a Condition (conditions receives the full event args: user, payload, activityId).`
        );
      }
    }
    // CAUTION 查询语义按 GetAction 的固定 uuid（GET_ACTION_UUID）识别：
    //  - 不能按引用同一性（args.action === GetAction）：序列化 round-trip 重建的 Action
    //    对象 `===` 判定必然失败，resolve 静默丢失、dispatch 返回 data: undefined；
    //  - 也不能按 name === 'get'：'get' 是常用词，用户自建同名 Action 不应在不知情的
    //    情况下获得查询语义。固定 uuid 随序列化保留，是跨进程稳定的显式身份。
    const isGetAction = args.action?.uuid === GET_ACTION_UUID;
    // fail-fast：data/dataPolicy 只在查询语义下被消费。挂在非 GetAction 上是合法声明、
    //  永不生效的死配置（dispatch 成功但永远不返回数据），必须在声明期拒绝。
    if (!isGetAction && (args.data !== undefined || args.dataPolicy !== undefined)) {
      const namedGetHint = args.action?.name === 'get'
        ? ` An Action merely named "get" is not the query action.`
        : '';
      throw new Error(`Interaction "${args.name}" declares data/dataPolicy but its action "${args.action?.name}" is not the built-in query action.${namedGetHint} Import { GetAction } from 'interaqt' and declare action: GetAction, or remove data/dataPolicy.`);
    }

    const instance = new Interaction(args, options);
    
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Interaction`);
    }

    instance.entity = InteractionEventEntity;

    instance.guard = buildInteractionGuard(instance);
    instance.mapEventData = buildInteractionMapEventData(instance);

    if (isGetAction) {
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

// The single guard runner shared by standalone interactions (buildInteractionGuard)
// and activity-wrapped interactions (ActivityCall.fullGuard), so the two
// paths cannot drift apart. Conditions are the only guard concept: they receive the
// full event args (user, payload, query, activityId) and can express user checks,
// payload checks and cross-record checks uniformly.
export async function runInteractionGuard(
  controller: GuardController,
  interaction: InteractionInstance,
  args: InteractionEventArgs
): Promise<void> {
  await checkCondition(controller, interaction, args);
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
    // CAUTION 守卫回调必须严格返回 boolean。非 boolean 的返回值在 BoolExp 组合下按 truthiness
    //  求值：truthy 的类型错误（`return user.role`）静默放行；更危险的是 falsy 的类型错误
    //  （null / 0 / ''，如 `return user.profile && user.profile.isAdmin` 短路出 null）在
    //  not(...) 组合下会被取反成"通过"——权限检查的 fail-open。错误字符串在 BoolExp 中
    //  无论是否处于 not 之下都判为失败（fail-closed）。
    if (typeof result !== 'boolean') {
      return `Condition '${condition.name}' returned ${result === undefined ? 'undefined' : JSON.stringify(result)} (${typeof result}); guard callbacks must explicitly return a boolean (did you forget a return statement, or a !! coercion?)`;
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

// Runtime checks for the primitive payload types a PayloadItem can declare.
// Non-primitive declarations (e.g. 'Entity'/'Relation') are validated through
// `base`/concept checks below instead.
// CAUTION 弱校验矩阵（r7-I-14 家族，r17 R-3 收口两维）：
//  - number 必须是有限数：NaN/±Infinity 的 typeof 也是 'number'，放行后进入 Summation/Average
//    等聚合产出静默垃圾值（聚合侧按 0 计但事实数据已污染）；
//  - object 必须排除数组：typeof [] === 'object'，isCollection: false 的 object 字段收到数组时
//    下游按对象消费（属性访问/展开/入库映射）会静默走偏。集合语义应声明 isCollection: true。
const payloadPrimitiveTypeChecks: Record<string, (value: unknown) => boolean> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number' && Number.isFinite(value),
  boolean: value => typeof value === 'boolean',
  object: value => value !== null && typeof value === 'object' && !Array.isArray(value),
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

    if (payloadDef.base) {
      // Declaration time already guarantees base is an Entity or a Relation.
      const baseRecordName = (payloadDef.base as EntityInstance).name;
      const items = payloadDef.isCollection ? (payloadItem as unknown[]) : [payloadItem];
      for (const item of items) {
        // Structural check: an entity/relation payload must be an object.
        if (!item || typeof item !== 'object') {
          throw new InteractionGuardError(
            `Payload validation failed for field '${payloadDef.name}': expected ${baseRecordName} data (object), got ${item === null ? 'null' : typeof item}`,
            { type: `${payloadDef.name} check concept failed`, checkType: 'payload' }
          );
        }
        // isRef payloads must reference an existing record of the declared entity/relation:
        // a made-up id (or an id belonging to another entity) must be rejected at the guard,
        // before any event record is created with wrong semantics.
        if (payloadDef.isRef) {
          const existing = await controller.system.storage.findOne(
            baseRecordName,
            BoolExp.atom({ key: 'id', value: ['=', (item as { id: string }).id] }),
            undefined,
            ['id']
          );
          if (!existing) {
            throw new InteractionGuardError(
              `Payload validation failed for field '${payloadDef.name}': referenced ${baseRecordName} with id '${(item as { id: string }).id}' does not exist`,
              { type: `${payloadDef.name} ref not found`, checkType: 'payload' }
            );
          }
        }
      }
    }
  }
}

async function retrieveData(controller: Controller, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  if (Entity.is(interaction.data) || Relation.is(interaction.data)) {
    const recordName = (interaction.data as EntityInstance).name!;

    const fixedMatch = interaction.dataPolicy?.match;
    const fixedModifier = interaction.dataPolicy?.modifier;

    const modifier = { ...(eventArgs.query?.modifier || {}), ...(fixedModifier || {}) };
    // CAUTION policy 声明的 modifier 键（如 limit/offset/orderBy）是固定约束，调用方不得绕过。
    //  浅合并只覆盖同名键，若 policy 只声明 limit，调用方仍可追加 offset 逐页翻取全表——limit 授权形同虚设。
    //  因此凡是 policy 声明了 limit，就锁定 modifier 的整组分页/排序键（limit/offset/orderBy），
    //  调用方不能引入 policy 未声明的分页/排序键来扩大可见范围（数据暴露级缺陷）。
    if (fixedModifier && typeof fixedModifier === 'object' && 'limit' in fixedModifier) {
      const callerModifier = (eventArgs.query?.modifier || {}) as Record<string, unknown>;
      for (const key of ['offset', 'orderBy'] as const) {
        if (!(key in fixedModifier) && key in callerModifier) {
          throw new Error(`Interaction "${interaction.name}": caller cannot override modifier "${key}" restricted by dataPolicy`);
        }
      }
    }
    // CAUTION dataPolicy.attributeQuery 是交互作者声明的固定投影，声明了就必须生效（policy wins）。
    //  与 modifier 的合并方向一致：调用方不能越权拓宽可见字段——否则 policy 形同虚设，
    //  任何调用方都可以请求任意字段（含 '*'），这是数据暴露级缺陷（r5 F-2）。
    const attributeQuery = interaction.dataPolicy?.attributeQuery ?? (eventArgs.query?.attributeQuery || []);

    const matchValue = typeof fixedMatch === 'function'
      ? await fixedMatch.call(controller, eventArgs)
      : fixedMatch;
    const combinedMatch = BoolExp.and(matchValue, eventArgs.query?.match);

    return controller.system.storage.find(recordName, combinedMatch, modifier, attributeQuery);
  }
  return undefined;
}
