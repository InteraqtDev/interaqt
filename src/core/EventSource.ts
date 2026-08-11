import { IInstance, generateUUID, SerializedData } from './interfaces.js';
import { validateCreateArgs, type PublicFieldDef } from './klassValidation.js';
import { decodeFunctionValues, stringifyInstance } from './utils.js';
import { EntityInstance } from './Entity.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this` is bound at runtime by Controller; core layer cannot reference it
type CallbackThis = any

/**
 * Optional per-request idempotency declaration on an EventSource / Interaction.
 * Participation requires `key(args)` to return a non-empty string.
 */
export type EventSourceIdempotencyConfig<TArgs = unknown> = {
  /**
   * Non-empty string → this request participates in idempotency.
   * null / undefined / '' → this request does not participate.
   */
  key: (args: TArgs) => string | null | undefined
  /**
   * Ledger namespace selection (default `'eventSource'`).
   * - `eventSource`: (eventSource.name, key) — Activity wrappers use `activity:interaction` names
   * - `interaction`: stable interaction identity shared across standalone and Activity-wrapped entries
   * - `{ custom }`: caller-provided namespace string
   */
  scope?:
    | 'eventSource'
    | 'interaction'
    | { custom: (args: TArgs) => string }
  /** Override replay `data`; default is the archived data from the succeeded ledger row. */
  replayData?: (args: TArgs, stored: { data?: unknown }) => unknown
}

export interface EventSourceInstance<TArgs = unknown, TResult = void> extends IInstance {
  name: string
  entity: EntityInstance
  /**
   * Admission phase (A): conditions / payload checks only.
   * Must not create Activity rows, write event rows, or perform irreversible external IO.
   * Required for dispatch unless `Controller.ignoreGuard` is set.
   */
  admit?: (this: CallbackThis, args: TArgs) => Promise<void>
  /**
   * Open / ledger phase (L-open): Activity create/check bookkeeping only.
   * Skipped on idempotent replay.
   */
  open?: (this: CallbackThis, args: TArgs) => Promise<void>
  /**
   * @deprecated Dispatch no longer calls `guard`. Kept as an internal alias of `admit`
   * (same function reference) for any leftover readers. Public CreateArgs use `admit`.
   */
  guard?: (this: CallbackThis, args: TArgs) => Promise<void>
  /**
   * Runs inside the dispatch transaction attempt and may be replayed on retry.
   */
  mapEventData?: (args: TArgs) => Record<string, unknown> | Promise<Record<string, unknown>>
  /**
   * Runs inside the dispatch transaction attempt and may be replayed on retry.
   * External side effects should be modeled with record mutation side effects,
   * which run after the final successful commit.
   */
  resolve?: (this: CallbackThis, args: TArgs) => Promise<TResult>
  /**
   * Runs before commit inside the retryable transaction attempt. It may produce
   * response context, but it must not perform irreversible external IO.
   */
  afterDispatch?: (this: CallbackThis, args: TArgs, result: { data?: TResult }) => Promise<Record<string, unknown> | void>
  /**
   * Runs after the dispatch transaction has committed successfully. Failures do
   * not roll back committed storage changes and are reported in sideEffects.
   * Skipped on idempotent replay (`outcome: 'replayed'`).
   */
  postCommit?: (this: CallbackThis, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>
  /** Optional idempotency declaration; see `EventSourceIdempotencyConfig`. */
  idempotency?: EventSourceIdempotencyConfig<TArgs>
  /**
   * Stable interaction identity for `idempotency.scope: 'interaction'`.
   * Set by Interaction.create and Activity wrappers; anonymous EventSources leave it unset.
   */
  idempotencyInteractionKey?: string
}

export interface EventSourceCreateArgs<TArgs = unknown, TResult = void> {
  name: string
  entity: EntityInstance
  admit?: (this: CallbackThis, args: TArgs) => Promise<void>
  open?: (this: CallbackThis, args: TArgs) => Promise<void>
  mapEventData?: (args: TArgs) => Record<string, unknown> | Promise<Record<string, unknown>>
  resolve?: (this: CallbackThis, args: TArgs) => Promise<TResult>
  afterDispatch?: (this: CallbackThis, args: TArgs, result: { data?: TResult }) => Promise<Record<string, unknown> | void>
  postCommit?: (this: CallbackThis, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>
  idempotency?: EventSourceIdempotencyConfig<TArgs>
  idempotencyInteractionKey?: string
}

async function defaultAdmit(): Promise<void> {
  // Explicit empty admission for sources with no conditions.
}

export class EventSource<TArgs = unknown, TResult = void> implements EventSourceInstance<TArgs, TResult> {
  public uuid: string;
  public _type = 'EventSource';
  public _options?: { uuid?: string };
  public name: string;
  public entity: EntityInstance;
  public admit?: (this: CallbackThis, args: TArgs) => Promise<void>;
  public open?: (this: CallbackThis, args: TArgs) => Promise<void>;
  /** @deprecated alias of `admit` — same function reference */
  public guard?: (this: CallbackThis, args: TArgs) => Promise<void>;
  public mapEventData?: (args: TArgs) => Record<string, unknown> | Promise<Record<string, unknown>>;
  public resolve?: (this: CallbackThis, args: TArgs) => Promise<TResult>;
  public afterDispatch?: (this: CallbackThis, args: TArgs, result: { data?: TResult }) => Promise<Record<string, unknown> | void>;
  public postCommit?: (this: CallbackThis, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>;
  public idempotency?: EventSourceIdempotencyConfig<TArgs>;
  public idempotencyInteractionKey?: string;

  constructor(args: EventSourceCreateArgs<TArgs, TResult>, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.entity = args.entity;
    // Install admit always so dispatch's unique pipeline never sees a missing phase hook
    // on framework-created sources. Callers that need checks pass an explicit admit.
    const admit = args.admit ?? defaultAdmit;
    this.admit = admit;
    this.guard = admit;
    this.open = args.open;
    this.mapEventData = args.mapEventData;
    this.resolve = args.resolve;
    this.afterDispatch = args.afterDispatch;
    this.postCommit = args.postCommit;
    this.idempotency = args.idempotency;
    this.idempotencyInteractionKey = args.idempotencyInteractionKey;
  }

  static isKlass = true as const;
  static displayName = 'EventSource';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous collection
  static instances: EventSourceInstance<any, any>[] = [];

  // CAUTION public 是 stringifyInstance 的单一事实来源：所有回调都必须列出，
  //  否则序列化会静默丢弃 admit/resolve 等行为定义，round-trip 后得到残缺实例。
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    entity: {
      type: 'Entity' as const,
      required: true as const,
      collection: false as const,
    },
    admit: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    open: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    mapEventData: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    resolve: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    afterDispatch: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    postCommit: {
      type: 'function' as const,
      required: false as const,
      collection: false as const,
    },
    idempotency: {
      type: 'object' as const,
      required: false as const,
      collection: false as const,
    },
    idempotencyInteractionKey: {
      type: 'string' as const,
      required: false as const,
      collection: false as const,
    },
  };

  static create<TArgs = unknown, TResult = void>(
    args: EventSourceCreateArgs<TArgs, TResult>,
    options?: { uuid?: string }
  ): EventSourceInstance<TArgs, TResult> {
    // 统一声明期校验（r16 建议 4 / r26 落地）：缺 entity 的 EventSource 到 dispatch 才炸
    //  （storage.create(undefined.name)）。
    validateCreateArgs(this.displayName, this.public as unknown as Record<string, PublicFieldDef>, args as unknown as Record<string, unknown>);
    // Reject legacy CreateArgs that only fill `guard` (no dual-track admission).
    const legacy = args as unknown as Record<string, unknown>
    if (legacy.guard !== undefined && args.admit === undefined) {
      throw new Error(
        `EventSource "${args.name}" declares "guard", but dispatch only runs "admit". ` +
        `Move the callback to admit (open is a separate phase for Activity bookkeeping).`
      )
    }
    const instance = new EventSource<TArgs, TResult>(args, options);

    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, EventSource`);
    }

    this.instances.push(instance);
    return instance;
  }

  static is(obj: unknown): obj is EventSourceInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'EventSource';
  }

  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }

  // CAUTION 必须走统一的 stringifyInstance 管线：entity 编码为 uuid:: 引用、回调编码为 func::，
  //  否则 graph round-trip（createInstances）无法还原实例身份与行为。
  static stringify(instance: EventSourceInstance): string {
    return stringifyInstance(this, instance as unknown as IInstance);
  }

  static clone(instance: EventSourceInstance, deep: boolean): EventSourceInstance {
    return this.create({
      name: instance.name,
      entity: instance.entity,
      admit: instance.admit,
      open: instance.open,
      mapEventData: instance.mapEventData,
      resolve: instance.resolve,
      afterDispatch: instance.afterDispatch,
      postCommit: instance.postCommit,
      idempotency: instance.idempotency,
      idempotencyInteractionKey: instance.idempotencyInteractionKey,
    });
  }

  // 与其他 Klass 的 parse 契约一致：还原 func:: 编码的回调、保持 uuid 身份；
  // uuid:: 引用（entity）需要 graph 管线（createInstances）才能解析。
  static parse(json: string): EventSourceInstance {
    const data: SerializedData<EventSourceCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}
