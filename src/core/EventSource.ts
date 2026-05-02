import { IInstance, generateUUID, SerializedData } from './interfaces.js';
import { EntityInstance } from './Entity.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this` is bound at runtime by Controller; core layer cannot reference it
type CallbackThis = any

export interface EventSourceInstance<TArgs = unknown, TResult = void> extends IInstance {
  name: string
  entity: EntityInstance
  /**
   * Runs inside the dispatch transaction attempt. It may be replayed when the
   * transaction is promoted or retried, so it must be deterministic and must
   * not perform irreversible external IO.
   */
  guard?: (this: CallbackThis, args: TArgs) => Promise<void>
  /**
   * Runs inside the dispatch transaction attempt and may be replayed on retry.
   */
  mapEventData?: (args: TArgs) => Record<string, unknown>
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
   */
  postCommit?: (this: CallbackThis, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>
}

export interface EventSourceCreateArgs<TArgs = unknown, TResult = void> {
  name: string
  entity: EntityInstance
  guard?: (this: CallbackThis, args: TArgs) => Promise<void>
  mapEventData?: (args: TArgs) => Record<string, unknown>
  resolve?: (this: CallbackThis, args: TArgs) => Promise<TResult>
  afterDispatch?: (this: CallbackThis, args: TArgs, result: { data?: TResult }) => Promise<Record<string, unknown> | void>
  postCommit?: (this: CallbackThis, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>
}

export class EventSource<TArgs = unknown, TResult = void> implements EventSourceInstance<TArgs, TResult> {
  public uuid: string;
  public _type = 'EventSource';
  public _options?: { uuid?: string };
  public name: string;
  public entity: EntityInstance;
  public guard?: (this: CallbackThis, args: TArgs) => Promise<void>;
  public mapEventData?: (args: TArgs) => Record<string, unknown>;
  public resolve?: (this: CallbackThis, args: TArgs) => Promise<TResult>;
  public afterDispatch?: (this: CallbackThis, args: TArgs, result: { data?: TResult }) => Promise<Record<string, unknown> | void>;
  public postCommit?: (this: CallbackThis, args: TArgs, result: { data?: TResult, context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void>;

  constructor(args: EventSourceCreateArgs<TArgs, TResult>, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.entity = args.entity;
    this.guard = args.guard;
    this.mapEventData = args.mapEventData;
    this.resolve = args.resolve;
    this.afterDispatch = args.afterDispatch;
    this.postCommit = args.postCommit;
  }

  static isKlass = true as const;
  static displayName = 'EventSource';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous collection
  static instances: EventSourceInstance<any, any>[] = [];

  static create<TArgs = unknown, TResult = void>(
    args: EventSourceCreateArgs<TArgs, TResult>,
    options?: { uuid?: string }
  ): EventSourceInstance<TArgs, TResult> {
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

  static stringify(instance: EventSourceInstance): string {
    const data: SerializedData<EventSourceCreateArgs> = {
      type: 'EventSource',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name,
        entity: instance.entity,
      }
    };
    return JSON.stringify(data);
  }

  static clone(instance: EventSourceInstance, deep: boolean): EventSourceInstance {
    return this.create({
      name: instance.name,
      entity: instance.entity,
      guard: instance.guard,
      mapEventData: instance.mapEventData,
      resolve: instance.resolve,
      afterDispatch: instance.afterDispatch,
      postCommit: instance.postCommit,
    });
  }

  static parse(json: string): EventSourceInstance {
    const data: SerializedData<EventSourceCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}
