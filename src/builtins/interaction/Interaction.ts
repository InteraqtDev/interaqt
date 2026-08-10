import {
    IInstance, SerializedData, generateUUID,
    EntityInstance, Entity, RelationInstance, Relation, Property,
    BoolExp, BoolExpressionRawData, EventSourceInstance,
    stringifyInstance, decodeFunctionValues
} from '@core';
import type { Controller } from '@runtime';
import { ActionInstance, GET_ACTION_UUID } from './Action.js';
import {
  AdmissionSnapshot,
  type AdmissionLockSpec,
  type ConditionInstance,
} from './Condition.js';
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

export type ConditionRejectionInfo = {
  code: string
  message?: string
  details?: unknown
  conditionName?: string
}

/**
 * Guard failure raised by Condition / Payload checks.
 * Condition failures expose a stable `code` (and optional `details`) for callers
 * without re-running the admission query (FR-02(b)).
 */
export class InteractionGuardError extends Error {
  public readonly type: string
  public readonly error: unknown
  public readonly checkType: string
  public readonly code?: string
  public readonly details?: unknown
  public readonly conditionName?: string

  constructor(
    message: string,
    options: {
      type: string
      checkType: string
      error?: unknown
      code?: string
      details?: unknown
      conditionName?: string
    }
  ) {
    super(message)
    this.name = 'InteractionGuardError'
    this.type = options.type
    this.checkType = options.checkType
    this.error = options.error
    this.code = options.code
    this.details = options.details
    this.conditionName = options.conditionName
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

/**
 * FR-02(b) Condition content result algebra (fail-closed).
 * Objects never enter BoolExp raw; structured rejections use the error-string path
 * plus a side channel so `code`/`details` survive BoolExp evaluation.
 */
export type ConditionContentResult =
  | boolean
  | { allowed: true; context?: Record<string, unknown> }
  | { allowed: false; code: string; message?: string; details?: unknown }

const CONDITION_REJECTED = 'CONDITION_REJECTED'
const CONDITION_INVALID_RESULT = 'CONDITION_INVALID_RESULT'
const CONDITION_THROWN = 'CONDITION_THROWN'

function formatConditionRejectionMessage(
  conditionName: string | undefined,
  info: ConditionRejectionInfo
): string {
  const name = conditionName ?? '(unnamed)'
  if (info.message) {
    return `Condition '${name}' rejected [${info.code}]: ${info.message}`
  }
  return `Condition '${name}' rejected [${info.code}]`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function checkCondition(controller: GuardController, interaction: InteractionInstance, eventArgs: InteractionEventArgs) {
  if (!interaction.conditions) return;

  const conditions = Conditions.is(interaction.conditions)
    ? new BoolExp<ConditionInstance>(interaction.conditions.content as BoolExpressionRawData<ConditionInstance>)
    : BoolExp.atom<ConditionInstance>(interaction.conditions as ConditionInstance);

  // FR-01: collect every atom's locks (including under not) before evaluation, then
  // acquire them in stable order on the current dispatch transaction. Snapshot is
  // passed as content's second argument so guards need not re-read unlocked rows.
  let admission: AdmissionSnapshot;
  try {
    admission = await acquireAdmissionLocks(controller, conditions, eventArgs);
  } catch (e) {
    if (e instanceof InteractionGuardError) throw e
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new InteractionGuardError(`Condition admission lock failed: ${errorMessage}`, {
      type: 'condition check failed',
      checkType: 'condition',
      error: errorMessage,
      code: CONDITION_THROWN,
      details: { cause: e },
    });
  }

  // FR-02(b): side channel for structured rejection metadata. Bound to this evaluate only.
  const rejectionByCondition = new WeakMap<ConditionInstance, ConditionRejectionInfo>()
  const admissionContext: Record<string, unknown> = {}

  const recordRejection = (
    condition: ConditionInstance | undefined,
    info: ConditionRejectionInfo
  ): string => {
    if (condition) rejectionByCondition.set(condition, info)
    return formatConditionRejectionMessage(condition?.name ?? info.conditionName, info)
  }

  const handleAttribute = async (condition: ConditionInstance): Promise<boolean | string> => {
    // fail-closed: a condition placed on the guard chain must be executable.
    if (!condition || !condition.content) {
      const name = (condition as ConditionInstance | undefined)?.name ?? '(unnamed)'
      return recordRejection(condition, {
        code: CONDITION_INVALID_RESULT,
        message: `Condition '${name}' has no content to execute`,
        conditionName: (condition as ConditionInstance | undefined)?.name,
      })
    }

    let raw: unknown
    try {
      raw = await condition.content.call(controller, eventArgs, admission)
    } catch (e) {
      // Already-normalized guard errors propagate unchanged (single choke point).
      if (e instanceof InteractionGuardError) throw e
      const thrownCode =
        e !== null &&
        typeof e === 'object' &&
        typeof (e as { code?: unknown }).code === 'string' &&
        (e as { code: string }).code.length > 0
          ? (e as { code: string }).code
          : CONDITION_THROWN
      const message = e instanceof Error ? e.message : String(e)
      const details =
        e !== null && typeof e === 'object' && 'details' in (e as object)
          ? (e as { details: unknown }).details
          : { cause: e }
      // Preserve prior EvaluateError string shape for existing tests ("threw exception").
      const human = `Condition '${condition.name}' threw exception: ${message}`
      rejectionByCondition.set(condition, {
        code: thrownCode,
        message: human,
        details,
        conditionName: condition.name,
      })
      return human
    }

    // true — pass (compatible)
    if (raw === true) {
      return true
    }

    // false — boolean polarity (subject to BoolExp not); default code only if final reject
    if (raw === false) {
      rejectionByCondition.set(condition, {
        code: CONDITION_REJECTED,
        message: `Condition '${condition.name}' returned false`,
        conditionName: condition.name,
      })
      return false
    }

    // Structured object results: must carry boolean `allowed`. Never feed objects into BoolExp.
    if (isPlainObject(raw) && typeof (raw as { allowed?: unknown }).allowed === 'boolean') {
      const allowed = (raw as { allowed: boolean }).allowed
      if (allowed) {
        const ctx = (raw as { context?: unknown }).context
        if (ctx !== undefined) {
          if (!isPlainObject(ctx)) {
            const message =
              `Condition '${condition.name}' returned allowed:true with non-object context ` +
              `(${ctx === null ? 'null' : Array.isArray(ctx) ? 'array' : typeof ctx})`
            return recordRejection(condition, {
              code: CONDITION_INVALID_RESULT,
              message,
              conditionName: condition.name,
              details: { result: raw },
            })
          }
          Object.assign(admissionContext, ctx)
        }
        return true
      }

      // allowed: false — structured rejection (error-string path; not flipped by not)
      const code = (raw as { code?: unknown }).code
      if (typeof code !== 'string' || code.length === 0) {
        const message =
          `Condition '${condition.name}' returned allowed:false without a non-empty string code`
        return recordRejection(condition, {
          code: CONDITION_INVALID_RESULT,
          message,
          conditionName: condition.name,
          details: { result: raw },
        })
      }
      const message =
        typeof (raw as { message?: unknown }).message === 'string'
          ? (raw as { message: string }).message
          : undefined
      const details = (raw as { details?: unknown }).details
      return recordRejection(condition, {
        code,
        message,
        details,
        conditionName: condition.name,
      })
    }

    // Informal fields (ok/success/pass) and any other shape → invalid, fail-closed.
    const rendered =
      raw === undefined
        ? 'undefined'
        : (() => {
            try {
              return JSON.stringify(raw)
            } catch {
              return String(raw)
            }
          })()
    const message =
      `Condition '${condition.name}' returned ${rendered} (${raw === null ? 'null' : typeof raw}); ` +
      `guard callbacks must return a boolean or { allowed: boolean, ... } ` +
      `(did you forget a return statement, or a !! coercion?)`
    return recordRejection(condition, {
      code: CONDITION_INVALID_RESULT,
      message,
      conditionName: condition.name,
      details: { result: raw },
    })
  }

  const result = await conditions.evaluateAsync(handleAttribute)
  if (result === true) {
    // Merge read-only admission context into this attempt's event args for mapEventData /
    // computations. Official channel is return-value merge — not payload mutation.
    if (Object.keys(admissionContext).length > 0) {
      const base =
        eventArgs.context && isPlainObject(eventArgs.context) ? { ...eventArgs.context } : {}
      base.admission = Object.freeze({ ...admissionContext })
      eventArgs.context = base
    }
    return
  }

  const failingAtom = (result as { data?: ConditionInstance }).data
  const channelInfo = failingAtom ? rejectionByCondition.get(failingAtom) : undefined
  // not(true) / bare boolean false with no structured info → default CONDITION_REJECTED
  const info: ConditionRejectionInfo = channelInfo ?? {
    code: CONDITION_REJECTED,
    message:
      typeof (result as { error?: unknown }).error === 'string'
        ? ((result as { error: string }).error)
        : `Condition '${failingAtom?.name ?? '(unnamed)'}' rejected`,
    conditionName: failingAtom?.name,
  }

  throw new InteractionGuardError(
    `Condition check failed: ${failingAtom?.name ?? info.conditionName ?? '(unnamed)'}`,
    {
      type: 'condition check failed',
      checkType: 'condition',
      error: result,
      code: info.code,
      details: info.details,
      conditionName: info.conditionName ?? failingAtom?.name,
    }
  )
}

/**
 * Walk a Condition BoolExp and return every atomic Condition (including atoms under not).
 * Locks are isolation, not polarity — negated atoms still contribute to the read set.
 */
export function collectConditionAtoms(conditions: BoolExp<ConditionInstance>): ConditionInstance[] {
  const atoms: ConditionInstance[] = [];
  const visit = (node: BoolExp<ConditionInstance>) => {
    if (node.isAtom()) {
      atoms.push(node.data);
      return;
    }
    visit(node.left);
    if (node.right) visit(node.right);
  };
  visit(conditions);
  return atoms;
}

type ResolvedRecordLock = {
  kind: 'record'
  recordName: string
  id: string | number
  attributeQuery: unknown
  sortKey: string
}

type ResolvedMatchLock = {
  kind: 'match'
  recordName: string
  match: unknown
  attributeQuery: unknown
  sortKey: string
}

type ResolvedAdmissionLock = ResolvedRecordLock | ResolvedMatchLock

async function resolveAdmissionLocks(
  atoms: ConditionInstance[],
  eventArgs: InteractionEventArgs
): Promise<ResolvedAdmissionLock[]> {
  const resolved: ResolvedAdmissionLock[] = [];
  // Admission lock resolvers use a structural event type (no Condition↔Interaction cycle).
  const admissionEvent = eventArgs as unknown as import('./Condition.js').AdmissionEventArgs;

  for (const condition of atoms) {
    const locks = condition.locks;
    if (!locks || locks.length === 0) continue;
    const conditionLabel = condition.name ?? '(unnamed)';

    for (let i = 0; i < locks.length; i++) {
      const spec = locks[i] as AdmissionLockSpec;
      const mode = spec.mode ?? 'record';
      const attributeQuery = spec.attributeQuery ?? ['*'];

      if (mode === 'match') {
        const matchSpec = spec as Extract<AdmissionLockSpec, { mode: 'match' }>;
        let match: unknown;
        try {
          match =
            typeof matchSpec.match === 'function'
              ? await matchSpec.match(admissionEvent)
              : matchSpec.match;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(
            `Condition '${conditionLabel}' locks[${i}] match resolver threw: ${msg}`
          );
        }
        if (match === undefined || match === null) {
          throw new Error(
            `Condition '${conditionLabel}' locks[${i}] match resolver returned ${match === null ? 'null' : 'undefined'}; admission locks must resolve a match expression.`
          );
        }
        resolved.push({
          kind: 'match',
          recordName: matchSpec.recordName,
          match,
          attributeQuery,
          // Stable order: recordName, then match specs after record locks for same name
          // (match sort after id locks via prefix), then a stable index within the list.
          sortKey: `${matchSpec.recordName}\0match\0${i}\0${conditionLabel}`,
        });
        continue;
      }

      const recordSpec = spec as Extract<AdmissionLockSpec, { mode?: 'record' }>;
      let idOrIds: unknown;
      try {
        idOrIds =
          typeof recordSpec.id === 'function' ? await recordSpec.id(admissionEvent) : recordSpec.id;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `Condition '${conditionLabel}' locks[${i}] id resolver threw: ${msg}`
        );
      }

      if (idOrIds === undefined || idOrIds === null) {
        throw new Error(
          `Condition '${conditionLabel}' locks[${i}] id resolver returned ${idOrIds === null ? 'null' : 'undefined'}; admission locks must resolve a record id.`
        );
      }

      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      if (ids.length === 0) {
        throw new Error(
          `Condition '${conditionLabel}' locks[${i}] id resolver returned an empty id list; admission locks must resolve at least one record id.`
        );
      }
      for (const id of ids) {
        if (id === undefined || id === null || (typeof id !== 'string' && typeof id !== 'number')) {
          throw new Error(
            `Condition '${conditionLabel}' locks[${i}] resolved an invalid id (${String(id)}); expected string or number.`
          );
        }
        resolved.push({
          kind: 'record',
          recordName: recordSpec.recordName,
          id,
          attributeQuery,
          sortKey: `${recordSpec.recordName}\0record\0${String(id)}`,
        });
      }
    }
  }

  // Deduplicate record locks by (recordName, id): keep the first attributeQuery (declaration order
  // after stable sort is by sortKey, so identical keys keep first-seen query via Map).
  const recordSeen = new Map<string, ResolvedRecordLock>();
  const matchLocks: ResolvedMatchLock[] = [];
  for (const lock of resolved) {
    if (lock.kind === 'match') {
      matchLocks.push(lock);
      continue;
    }
    const key = `${lock.recordName}\0${String(lock.id)}`;
    if (!recordSeen.has(key)) recordSeen.set(key, lock);
  }

  const recordLocks = Array.from(recordSeen.values()).sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  );
  matchLocks.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  // Global order: all record locks by (recordName, id), then match locks by (recordName, index).
  // Within the same recordName, record id locks come before match locks (sortKey middle token).
  return [...recordLocks, ...matchLocks].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  );
}

async function acquireAdmissionLocks(
  controller: GuardController,
  conditions: BoolExp<ConditionInstance>,
  eventArgs: InteractionEventArgs
): Promise<AdmissionSnapshot> {
  const snapshot = new AdmissionSnapshot();
  const atoms = collectConditionAtoms(conditions);
  const locks = await resolveAdmissionLocks(atoms, eventArgs);

  // Populate while unsealed. Every path that hands the snapshot to Condition content
  // must seal first — including locks.length === 0 — so put cannot forge rows for
  // later atoms (design §3.2.1; domain admission-snapshot-readonly).
  if (locks.length > 0) {
    const atomic = controller.system?.storage?.atomic;
    if (!atomic || typeof atomic.lockRecord !== 'function' || typeof atomic.lockRows !== 'function') {
      throw new Error(
        'Condition admission locks require storage.atomic.lockRecord / lockRows on the active storage (missing atomic API).'
      );
    }

    for (const lock of locks) {
      if (lock.kind === 'record') {
        const row = await atomic.lockRecord(
          lock.recordName,
          lock.id,
          lock.attributeQuery
        );
        snapshot.put(lock.recordName, row as Record<string, unknown> | undefined);
        continue;
      }
      const rows = (await atomic.lockRows(
        lock.recordName,
        lock.match,
        lock.attributeQuery
      )) as Record<string, unknown>[];
      for (const row of rows ?? []) {
        snapshot.put(lock.recordName, row);
      }
    }
  }

  // Single exit: content always receives a sealed, copy-on-read snapshot.
  snapshot.seal();
  return snapshot;
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

  // CAUTION payload 必须是普通对象。字符串/数组是 truthy 且 typeof 'object'（数组）或可被
  //  Object.keys 枚举出下标（字符串），不拒绝就会落到 "0 in payload is not defined" 这类
  //  与用户写法脱节的错误信息。
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InteractionGuardError(
      `payload of interaction ${interaction.name} must be a plain object, got ${Array.isArray(payload) ? 'array' : typeof payload}`,
      { type: 'payload not an object', checkType: 'payload' }
    );
  }

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
    const payloadItem = payload[payloadDef.name!];
    // CAUTION required 按「值是否为 undefined」判定，而不是 `in` 的键存在性：
    //  显式传 { field: undefined }（in 为 true）会跳过下方全部类型/ref/base 校验，
    //  required 声明被静默绕过（守卫 fail-open）。undefined 值与缺键在 JSON 语义下
    //  等价于"未提供"，统一按 missing 拒绝。
    if (payloadDef.required && payloadItem === undefined) {
      throw new InteractionGuardError(
        `Payload validation failed for field '${payloadDef.name}': missing`,
        { type: `${payloadDef.name} missing`, checkType: 'payload' }
      );
    }

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
      // CAUTION 每个 ref 元素必须是「带 id 的对象」。null / 非对象元素（HTTP 客户端常发 null）
      //  必须给出干净的守卫错误，而不是在 `item.id` 上抛出深层的裸 TypeError（obscure stack trace）。
      if (payloadDef.isRef && !((payloadItem as unknown[])).every(item => !!item && typeof item === 'object' && !!(item as { id?: unknown }).id)) {
        throw new InteractionGuardError(
          `Payload validation failed for field '${payloadDef.name}': data not every is ref`,
          { type: `${payloadDef.name} data not every is ref`, checkType: 'payload' }
        );
      }
    } else {
      // CAUTION null / 非对象（HTTP 客户端常发 null）必须落到干净的守卫错误，
      //  不能在 `(payloadItem).id` 上抛裸 TypeError。
      if (payloadDef.isRef && !(!!payloadItem && typeof payloadItem === 'object' && !!(payloadItem as { id?: unknown }).id)) {
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
        // Structural check: an entity/relation payload item must be a plain object.
        // CAUTION Array.isArray must be rejected explicitly — typeof [] === 'object' and [] is truthy,
        //  so without this an array slips through as a single entity (isCollection:false) or as a
        //  nested-array element (isCollection:true). Downstream consumers then read `.id`/spread the
        //  value as one record and silently drift. Collection semantics must be declared via
        //  isCollection:true, whose per-element check lands here (mirrors the type:'object' array guard).
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new InteractionGuardError(
            `Payload validation failed for field '${payloadDef.name}': expected ${baseRecordName} data (object), got ${item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item}`,
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
