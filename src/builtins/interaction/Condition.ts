import {
  IInstance,
  SerializedData,
  generateUUID,
  stringifyAttribute,
  decodeFunctionValues,
} from '@core';
import type { AttributeQueryData } from '../../core/types.js';

/**
 * Event args shape for admission lock resolvers.
 * Kept structural (not imported from Interaction) to avoid a Condition ↔ Interaction cycle.
 */
export type AdmissionEventArgs = {
  user: { id: string; [k: string]: unknown }
  query?: unknown
  payload?: Record<string, unknown>
  activityId?: string
  context?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * Structural match expression accepted by admission locks.
 * Same shape as storage MatchExpressionData (BoolExp of match atoms). Typed as
 * `object` so callers can pass BoolExp/MatchExp values without pulling @storage
 * into builtins (dependency direction: builtins → runtime → storage).
 */
export type AdmissionMatchExpression = object

export type AdmissionLockSpec =
  | {
      mode?: 'record'
      recordName: string
      id:
        | string
        | number
        | ((
            event: AdmissionEventArgs
          ) =>
            | string
            | number
            | Array<string | number>
            | undefined
            | null
            | Promise<string | number | Array<string | number> | undefined | null>)
      attributeQuery?: AttributeQueryData
    }
  | {
      mode: 'match'
      recordName: string
      match:
        | AdmissionMatchExpression
        | ((
            event: AdmissionEventArgs
          ) => AdmissionMatchExpression | Promise<AdmissionMatchExpression>)
      attributeQuery?: AttributeQueryData
    }

/**
 * Read-only snapshot of rows locked for admission before Condition content runs.
 * Populated by the framework from declarative `locks`; content should prefer this
 * over a second unlocked findOne.
 *
 * After `seal()`, the snapshot is immutable from Condition content's perspective:
 * - `put` throws (not a public write channel for guards)
 * - `get` / `getAll` return shallow copies so later atoms cannot observe mutations
 *   of objects returned to earlier atoms
 */
export class AdmissionSnapshot {
  private readonly byRecord = new Map<string, Map<string, Record<string, unknown>>>()
  private sealed = false

  /**
   * @internal Framework-only population API. Throws once the snapshot is sealed
   * for Condition evaluation.
   */
  put(recordName: string, record: Record<string, unknown> | undefined | null): void {
    if (this.sealed) {
      throw new Error(
        'AdmissionSnapshot is read-only after admission locks are acquired; Condition content cannot put rows.'
      )
    }
    if (!record || record.id === undefined || record.id === null) return
    let byId = this.byRecord.get(recordName)
    if (!byId) {
      byId = new Map()
      this.byRecord.set(recordName, byId)
    }
    // Defensive copy: do not retain the lockRecord/lockRows row reference.
    byId.set(String(record.id), { ...record })
  }

  /**
   * @internal Mark the snapshot immutable before Condition content runs.
   */
  seal(): void {
    this.sealed = true
  }

  get(recordName: string, id: string | number): Record<string, unknown> | undefined {
    const row = this.byRecord.get(recordName)?.get(String(id))
    return row ? { ...row } : undefined
  }

  getAll(recordName: string): Record<string, unknown>[] {
    const byId = this.byRecord.get(recordName)
    if (!byId) return []
    return Array.from(byId.values(), (row) => ({ ...row }))
  }
}

export interface ConditionInstance extends IInstance {
  content: Function
  name?: string
  locks?: AdmissionLockSpec[]
}

export interface ConditionCreateArgs {
  content: Function
  name?: string
  locks?: AdmissionLockSpec[]
}

export class Condition implements ConditionInstance {
  public uuid: string
  public _type = 'Condition'
  public _options?: { uuid?: string }
  public content: Function
  public name?: string
  public locks?: AdmissionLockSpec[]

  constructor(args: ConditionCreateArgs, options?: { uuid?: string }) {
    this._options = options
    this.uuid = generateUUID(options)
    this.content = args.content
    this.name = args.name
    this.locks = args.locks
  }

  // 静态属性和方法
  static isKlass = true as const
  static displayName = 'Condition'
  static instances: ConditionInstance[] = []

  static public = {
    content: {
      type: 'function' as const,
      required: true as const,
      collection: false as const
    },
    name: {
      type: 'string' as const
    },
    locks: {
      type: 'object' as const,
      collection: true as const,
      required: false as const
    }
  }

  static create(args: ConditionCreateArgs, options?: { uuid?: string }): ConditionInstance {
    // fail-fast：content 是守卫的可执行体。缺失/非函数的 content 在运行期会被 checkCondition
    //  fail-closed 拒绝（每次 dispatch 都报错），但错误暴露点与声明处脱节——配置错误应在
    //  声明期发现，而不是等到第一个用户请求。
    if (typeof args.content !== 'function') {
      throw new Error(
        `Condition${args.name ? ` "${args.name}"` : ''} requires a function "content" (got ${args.content === undefined ? 'undefined' : typeof args.content}). ` +
          `Provide the guard callback, e.g. Condition.create({ name, content: async function(event) { return !!event.user.isAdmin } }).`
      )
    }
    if (args.locks !== undefined) {
      if (!Array.isArray(args.locks)) {
        throw new Error(
          `Condition${args.name ? ` "${args.name}"` : ''} "locks" must be an array of admission lock specs when provided.`
        )
      }
      for (let i = 0; i < args.locks.length; i++) {
        validateLockSpec(args.locks[i], args.name, i)
      }
    }
    const instance = new Condition(args, options)

    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid)
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Condition`)
    }

    this.instances.push(instance)
    return instance
  }

  static stringify(instance: ConditionInstance): string {
    const args: ConditionCreateArgs = {
      content: stringifyAttribute(instance.content) as Function,
      name: instance.name
    }
    if (instance.locks !== undefined) {
      args.locks = stringifyAttribute(instance.locks) as AdmissionLockSpec[]
    }

    const data: SerializedData<ConditionCreateArgs> = {
      type: 'Condition',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    }
    return JSON.stringify(data)
  }

  static clone(instance: ConditionInstance, deep: boolean): ConditionInstance {
    const args: ConditionCreateArgs = {
      content: instance.content
    }
    if (instance.name !== undefined) args.name = instance.name
    if (instance.locks !== undefined) args.locks = instance.locks

    return this.create(args)
  }

  static is(obj: unknown): obj is ConditionInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Condition'
  }

  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string'
  }

  static parse(json: string): ConditionInstance {
    const data: SerializedData<ConditionCreateArgs> = JSON.parse(json)
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid })
  }
}

function validateLockSpec(spec: AdmissionLockSpec, conditionName: string | undefined, index: number): void {
  const label = `Condition${conditionName ? ` "${conditionName}"` : ''} locks[${index}]`
  if (!spec || typeof spec !== 'object') {
    throw new Error(`${label} must be an object.`)
  }
  if (typeof spec.recordName !== 'string' || !spec.recordName) {
    throw new Error(`${label} requires a non-empty string "recordName".`)
  }
  const mode = spec.mode ?? 'record'
  if (mode === 'record') {
    const recordSpec = spec as Extract<AdmissionLockSpec, { mode?: 'record' }>
    if (recordSpec.id === undefined || recordSpec.id === null) {
      throw new Error(`${label} (mode "record") requires "id" (value or resolver).`)
    }
  } else if (mode === 'match') {
    const matchSpec = spec as Extract<AdmissionLockSpec, { mode: 'match' }>
    if (matchSpec.match === undefined || matchSpec.match === null) {
      throw new Error(`${label} (mode "match") requires "match" (expression or resolver).`)
    }
  } else {
    throw new Error(`${label} has unknown mode "${String(mode)}"; expected "record" or "match".`)
  }
}
