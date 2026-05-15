# Scoped Atomic Sequence Feature Plan

## 结论

为 interaqt 新增 `ScopedSequence`，把“某个业务 scope 下分配下一个递增值”建模为 **声明式 property computation**。

业务侧不直接访问数据库、不写 SQL，也不通过 imperative `system.sequence.next()` 把序号分配散落在任意 computation callback 中；而是在实体属性上声明：

```ts
const assetSerial = ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'prefix' },
  ],
  initialValue: 0,
  step: 1,
})

const Media = Entity.create({
  name: 'Media',
  properties: [
    Property.create({ name: 'project', type: 'id' }),
    Property.create({ name: 'prefix', type: 'string' }),
    Property.create({
      name: 'serialNumber',
      type: 'number',
      computation: assetSerial,
    }),
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'uniqProjectAssetSerial',
      properties: ['project', 'prefix', 'serialNumber'],
    }),
  ],
})
```

`ScopedSequence` 的 runtime handle 只响应宿主 record 的 create mutation。按当前 runtime 机制，它不是 insert-before-write 的数据库默认值，而是 **post-create, pre-commit allocation**：record 先由 interaction/Transform 创建，scheduler 监听 create mutation 后根据新 record 上的声明式 scope path 解析 scope key，再在同一个 dispatch transaction 内调用 storage 的原子 sequence primitive，并通过一次属性 update 写回序号。删除 record 不会回退 counter；已提交序号不会复用。

## 为什么必须是 property computation

当前 interaqt 的响应式范式是：

- `Controller.dispatch()` 是事实写入边界。
- `Interaction/EventSource` 产生 record mutation。
- scheduler 根据 property/entity/relation/global computation 响应 mutation。
- property computation 可以通过 `getInitialValue(record)` 在 record create mutation 后写入属性默认计算值。
- runtime computation handle 通过 `static computationType` + `static contextType` 注册到 scheduler。

因此 scoped sequence 应进入同一套机制，而不是暴露给业务代码一个任意可调用的 DB service。否则业务可以在多个 callback、side effect、普通 helper 里随意分配序号，框架无法从模型 manifest 中看见它，也无法迁移、校验、分析 rebuild 风险。

`ScopedSequence` 的语义正好是“某个属性在 record 创建事务中由框架分配一次”。它不是聚合派生值，不响应后续 record update/delete，也不应该用 `StateMachine(lastValue + 1)` 表达，因为 StateMachine 的 state 仍然绑定在当前进程调度和普通 storage update 语义上，不能天然表达跨进程 scope counter 的 insert-or-increment。

## Core API

新增 core concept：

```ts
export type ScopedSequenceScopeItem =
  | {
      name: string
      type: 'string' | 'number' | 'boolean'
      path: string
    }
  | {
      name: string
      type: 'ref'
      base: EntityInstance
      path: string
    }

export interface ScopedSequenceInstance extends IInstance {
  name: string
  scope: ScopedSequenceScopeItem[]
  initialValue?: number
  step?: number
  allowManualValue?: boolean
  initializeFrom?: ScopedSequenceInitializer
}

export class ScopedSequence implements ScopedSequenceInstance {
  static isKlass = true as const
  static displayName = 'ScopedSequence'
  static instances: ScopedSequenceInstance[] = []
  static create(args: ScopedSequenceCreateArgs, options?: { uuid?: string }): ScopedSequenceInstance
}
```

Validation rules:

- `name` must follow the same simple identifier rule as other core names.
- `scope` must be non-empty.
- scope item names must be unique.
- `step` must be a positive integer.
- `initialValue` defaults to `0`.
- property host type must be `number`.
- normal create must not provide the target property unless `allowManualValue: true`.

`allowManualValue` exists for import/backfill paths, but should default to `false` so normal business writes cannot bypass the allocator.

Scope path rules:

- `scope.path` can only read persisted primitive/ref values already present on the newly created host record. It must not perform relation traversal, storage queries, or arbitrary callback evaluation while resolving scope, because that would make sequence allocation depend on external mutable data.
- Missing scope values are explicit errors. `undefined` is not a legal canonical scope value.
- Computed outputs are not valid scope inputs unless they are already present in the raw create data and therefore have a stable value before the host create mutation. In particular, one property default computation must not depend on another property's post-create default result.
- Primitive scope values are canonicalized with their declared type.
- Ref scope values accept either an id string or an `{ id }` shape and canonicalize to `{ entity: base.name, id }`, so different entity types cannot collide when they share an id string.

## Runtime Semantics

新增 `PropertyScopedSequenceHandle`：

```ts
export class PropertyScopedSequenceHandle implements DataBasedComputation {
  static computationType = ScopedSequence
  static contextType = 'property' as const

  useLastValue = false
  dataDeps = {}

  async getInitialValue(initialRecord: Record<string, unknown>) {
    const hostName = this.dataContext.host.name
    const propertyName = this.dataContext.id.name
    const existingValue = initialRecord[propertyName]
    if (existingValue !== undefined && !this.args.allowManualValue) {
      throw new Error(`ScopedSequence property ${hostName}.${propertyName} cannot be set manually`)
    }

    if (existingValue !== undefined && this.args.allowManualValue) {
      return existingValue
    }

    const scope = resolveScope(this.args.scope, initialRecord)
    return this.controller.system.storage.atomic.nextSequenceValue({
      sequenceName: this.args.name,
      scope,
      initialValue: this.args.initialValue ?? 0,
      step: this.args.step ?? 1,
    })
  }
}
```

如果 `allowManualValue: true` 且 create input 已经包含目标属性，handle 必须直接返回该手动值，并且不能调用 `nextSequenceValue()`，也不能隐式推进 counter。导入后的 counter 推进只能通过 `initializeFrom` 或显式 migration seed API 完成；普通业务 create 不应把手动值和 seed 语义混在一起。

它只实现 `getInitialValue()`，不实现 `compute()` / `incrementalCompute()`，原因是 sequence allocation 不是可重放的纯派生计算。全量 recompute 不应重新分配序号，migration rebuild 也不应把它当成可重建 computation。

Current runtime integration:

- 当前 `Scheduler.addMutationPropertyComputationDefaultValueListeners()` 监听 storage create mutation，然后调用 `getInitialValue(mutationEvent.record)`。
- 当前 `Controller.applyResult()` 对 property result 的写入路径是 storage update。
- 因此 `ScopedSequence` 在现有 runtime 下的落地语义是 post-create/pre-commit allocation，而不是 insert-time default。
- 目标属性不能依赖 insert-time non-null constraint；如果未来必须支持 insert-before-write，需要新增 storage create pipeline hook，让特定 property computation 在生成 `NewRecordData` 之前运行。
- 依赖 `serialNumber` 的其他 computation 应通过 `serialNumber` 的 update 事件或 property dataDep 派生，不应从原始 create event 直接假设序号已经存在。
- 多个 property `getInitialValue()` default listener 之间没有可依赖的声明式拓扑排序。它们按当前 handle/listener 注册顺序产生 post-create update，但业务模型不能把这个顺序当作稳定 API；scope 输入必须由 create rawData 或已经持久在 host record 上的字段直接提供。

Manifest 中需要标记：

- `computationType: "ScopedSequence"`
- `allocation: "post-create-pre-commit"`
- `rebuildable: false`
- `allocationSignature`
- `scopeSignature`
- `initialValue`
- `step`
- `allowManualValue`

当前 `createComputationManifest()` 的通用 signature 只覆盖 computation type、dataContext、deps/eventDeps、state、function signature 和 compute/incremental compute 形态，不会自动序列化普通 computation args。`ScopedSequence` 必须补一个稳定的 `allocationSignature`，并把它纳入 `ComputationManifest.signature` 和 `MigrationManifest.modelHash`。`scope`、`step`、`initialValue`、`allowManualValue`、ref scope `base`、`initializeFrom` 的任何变更都应生成 explicit migration decision。默认不自动 rebuild 已有数据。

Manifest/diff implementation requirements:

- `ComputationManifest` 增加可选 `allocationSignature` 与可读的 `allocation` metadata；`ScopedSequence` 的 `structuralSignature` 和最终 `signature` 都必须包含它。
- `normalizePreviousComputationManifest()` 的 legacy normalize 逻辑必须保留新字段；旧 manifest 没有 allocation metadata 时不能被误判为与新 `ScopedSequence` 等价。
- `buildMigrationDiff()` 的 `detected`/`reason` 应能指出 allocation args 变化，例如 scope/step/initialValue/manual import policy changed，而不是只给出 generic computation structure changed。
- `getRecomputeBlockingChanges()` 必须按 computation type 识别 `ScopedSequence`，把 allocation change 报为不可普通 rebuild 的变更；只有显式 seed/migration decision 可以推进 counter 状态。

## Internal Schema Requirements

`_ScopedSequence_` 是 framework internal table，但 `ScopedSequence` 不应为了让 setup/migration 看见它而制造 dummy `RecordBoundState` 或 `GlobalBoundState`。当前 `Controller.setup()` / migration flow 只把 `scheduler.createStates()` 交给 `System.setup()` 和 `prepareMigrationSchema()`；而 `createStates()` 只收集实现了 `createState()` 的 computation handle。`ScopedSequence` 按设计没有 bound state，因此需要新增一等内部 schema requirement 通道。

建议契约：

```ts
export type InternalSchemaRequirement =
  | {
      kind: 'scoped-sequence-table'
      declarations: ScopedSequenceDeclarationManifest[]
    }

export type ScopedSequenceDeclarationManifest = {
  computationId: string
  hostRecord: string
  property: string
  sequenceName: string
  scopeSignature: string
  allocationSignature: string
}
```

`Scheduler` 或 `Controller` 在 setup/migration 前汇总 computation handles，生成 `InternalSchemaRequirement[]`，并传给 system API。为了避免继续扩张多布尔/多数组参数，建议把 setup/migration system API 改成 options object：

```ts
type SystemSchemaOptions = {
  install?: boolean
  internalRequirements?: InternalSchemaRequirement[]
}
```

影响的入口：

- `System.setup(entities, relations, states, options)`
- `System.prepareMigrationSchema(entities, relations, states, options)`
- `System.migrateSchema(entities, relations, states, options)`
- manifest 生成与 diff/hash

`MonoSystem` / storage migration plan 根据 requirement 规划 `_ScopedSequence_` 的 additive internal DDL。也可以选择无条件创建 `_ScopedSequence_`，因为空 internal table 不改变业务模型；但 declared sequence definitions、allocation signature 和 seed/decision 状态仍必须通过 manifest/diff 可见，不能只依赖表是否存在。

## Storage Primitive

扩展 `AtomicStorage`：

```ts
export type AtomicSequenceScopeValue =
  | string
  | number
  | boolean
  | null
  | { type: 'ref'; entity: string; id: string }

export type AtomicSequenceTarget = {
  sequenceName: string
  scope: Record<string, AtomicSequenceScopeValue>
  initialValue: number
  step: number
}

export type AtomicStorage = {
  nextSequenceValue(target: AtomicSequenceTarget): Promise<number>
  seedSequenceValue(target: AtomicSequenceTarget & { value: number; mode?: 'max' | 'replace' }): Promise<void>
  readSequenceValue(target: Pick<AtomicSequenceTarget, 'sequenceName' | 'scope'>): Promise<number | undefined>
  // existing methods...
}
```

使用专用 internal table，而不是复用 `_ComputationState_` 的单 key number：

```sql
CREATE TABLE IF NOT EXISTS "_ScopedSequence_" (
  "sequenceName" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "scope" JSON NOT NULL,
  "lastValue" NUMERIC NOT NULL,
  PRIMARY KEY ("sequenceName", "scopeKey")
)
```

`scopeKey` 由稳定 canonical JSON 生成，字段顺序按 `scope` 声明顺序固定；必要时可以用 hash 缩短 key，但 manifest 和 debug 信息保留原始 scope JSON。

Canonicalization contract:

- `scopeKey` is generated from a tuple ordered by the declared `scope` array, not by object key enumeration.
- Each tuple item includes `name`, declared `type`, and canonical `value`, so `"1"` and `1` cannot collide.
- Ref values include the referenced entity name and id, for example `{ type: "ref", entity: "Project", id: "..." }`.
- If a hash is used as the primary key, the hash algorithm is fixed by framework code and shared by all drivers; drivers cannot choose their own encoding.

Value semantics:

- `nextSequenceValue()` returns the allocated last value after applying `step`.
- First allocation for an empty sequence writes and returns `initialValue + step`.
- `seedSequenceValue(..., { value })` treats `value` as the maximum value already allocated; the next successful allocation returns `value + step`.
- `mode: 'max'` only raises the stored counter, while `mode: 'replace'` sets it exactly and should require an explicit migration decision.

Driver behavior:

- PostgreSQL: use `INSERT ... ON CONFLICT ("sequenceName", "scopeKey") DO UPDATE SET "lastValue" = "_ScopedSequence_"."lastValue" + $step RETURNING "lastValue"`; the insert branch stores `initialValue + step`.
- PGLite: use the same PostgreSQL SQL path for framework tests.
- SQLite: use `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` when supported by `better-sqlite3`; otherwise run `INSERT OR IGNORE` then `UPDATE ... RETURNING` inside the active transaction.
- Unsupported drivers: throw `TransactionCapabilityError` or a dedicated capability error at setup/dispatch time. They must not fall back to `find max + 1`.

`nextSequenceValue()` must require an active transaction. In normal dispatch this is already true because `Controller.dispatch()` wraps resolution and scheduler callbacks in `storage.runInTransaction()`.

Add a dedicated storage capability rather than overloading transaction capability:

```ts
export type AtomicSequenceCapability = {
  requiresActiveTransaction: true
  transactional: boolean
  crossConnection: boolean
  crossProcess: boolean
  returning: boolean
  equivalentSafeReturning?: boolean
  productionSafe: boolean
}
```

PostgreSQL should report `transactional: true`, `crossConnection: true`, `crossProcess: true`, and `productionSafe: true`. PGLite and SQLite may report test/single-process support clearly, but must not be described as production cross-process safe if their driver transaction capability remains `concurrentTransactions: 'unsupported'`. MySQL or other unsupported drivers should fail during setup or dispatch with a clear capability error.

## Transaction And Gap Semantics

推荐定义为 **transactional counter allocation**：

- sequence row update and business record mutation are in the same dispatch transaction.
- if dispatch rolls back, sequence increment rolls back too.
- committed records never receive duplicate values for the same sequence + scope.
- committed deletions do not decrement counters, so deleted serials are not reused.
- failed transactions may not create gaps. This is acceptable because no business record committed with that value.

这个语义比 PostgreSQL `nextval()` 更贴合 interaqt 的 dispatch transaction model，也能在 PostgreSQL/PGLite/SQLite 之间保持一致。

唯一约束仍然必须保留。`ScopedSequence` 是分配器，unique constraint 是数据库层兜底和数据完整性声明。

## Migration Design

Schema migration must treat `_ScopedSequence_` as framework internal schema, similar `_ComputationState_`:

- setup/install creates the table when `InternalSchemaRequirement[]` includes `scoped-sequence-table`.
- migration plan includes additive DDL for creating `_ScopedSequence_` if missing.
- migration manifest records declared sequences, their scope signatures, and their allocation signatures.
- removing or changing a declared sequence must be explicit; framework should not silently delete counter rows.

`_ScopedSequence_` is not a normal business entity and should not appear as an entity/relation table in model diff. It should be planned as additive internal schema. Removing all declared `ScopedSequence` computations should not delete `_ScopedSequence_` rows unless the migration contains an explicit audited decision.

Initialization from existing data should be declared on the sequence, not hand-written raw SQL:

```ts
ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'prefix' },
  ],
  initialValue: 0,
  step: 1,
  initializeFrom: {
    record: Media,
    valuePath: 'serialNumber',
    scope: [
      { name: 'project', path: 'project' },
      { name: 'prefix', path: 'prefix' },
    ],
    aggregate: 'max',
    match: { /* optional BoolExp data */ },
  },
})
```

During migration:

1. Framework verifies the target property already has valid values or is being populated by an approved computation/data migration.
2. For each sequence + scope group, it computes `MAX(valuePath)`.
3. It seeds `_ScopedSequence_` with at least that max value using `seedSequenceValue(..., mode: 'max')`.
4. It runs in the same migration transaction as post-schema verification where the driver supports it.
5. It writes the initialized sequence definitions into the manifest.

If `initializeFrom` is absent and an existing database already has records for the host entity, migration should require an explicit decision or handler. The framework must not guess counters from arbitrary business data.

Sequence seeding is a migration operation, not a computation recompute. It must not enter the normal full-recompute path, must not call `getInitialValue()` for existing rows, and must not allocate fresh serials. If an existing database contains host records and neither `initializeFrom` nor an approved explicit seed decision is present, migration is blocked.

## Scheduler And Recompute Rules

`ScopedSequence` is intentionally create-only:

- It participates in property default initialization through `addMutationPropertyComputationDefaultValueListeners()`.
- In the current runtime that means it allocates after the host record create mutation and writes the value through a property update before dispatch commit.
- It has no dataDeps/eventDeps and should not be triggered by later mutations except for downstream computations that react to the sequence property update.
- It is not full-recomputable.
- If a migration tries to classify it as changed and rebuild it, `getRecomputeBlockingChanges()` should identify `ScopedSequence` by computation type and report an unrebuildable allocation change unless the migration only seeds/updates sequence state.

This avoids a dangerous interpretation where recomputing a model would allocate fresh serials for existing records.

## medeo-lite Target Model

medeo-lite should make `prefix` available on the newly created `Media` record before `serialNumber` allocation. The safest shape is a persisted property populated by the interaction/Transform that creates `Media`:

```ts
Property.create({
  name: 'prefix',
  type: 'string',
})
```

The creation computation should set it from `assetPrefixFromBizKind(bizKind)`.

Then:

```ts
Property.create({
  name: 'serialNumber',
  type: 'number',
  computation: ScopedSequence.create({
    name: 'projectAssetSerial',
    scope: [
      { name: 'project', type: 'ref', base: Project, path: 'project' },
      { name: 'prefix', type: 'string', path: 'prefix' },
    ],
    initialValue: 0,
    step: 1,
    initializeFrom: {
      record: Media,
      valuePath: 'serialNumber',
      scope: [
        { name: 'project', path: 'project' },
        { name: 'prefix', path: 'prefix' },
      ],
      aggregate: 'max',
    },
  }),
})
```

`displayName` should be another property derived from `prefix + serialNumber`. Because `serialNumber` is post-create/pre-commit in the current runtime, `displayName` must not read it directly from the original `Media` create event. It should be a normal property computation that reacts after `serialNumber` is assigned, or a sync computed property/dataDep path that reruns on the `serialNumber` update. It must not allocate another sequence.

All creation entries share the same `Media.serialNumber` declaration:

- `CreateMediaFromUpload`
- `RegisterUploadedMedia`
- `CreateMediaFromUrl`
- `CreateMediaFromAI`

The old `Project.assetSerialState` JSON counter becomes migration-only input and should be removed from new write logic after sequence initialization is approved.

## Required Framework Tests

Add focused tests instead of relying on application behavior:

1. Core validation: duplicate scope names, invalid step, non-number host property, manual value rejected by default.
2. First value semantics: `initialValue: 0, step: 1` first returns `1`; different step values return `initialValue + step`.
3. Manual import semantics: with `allowManualValue: true`, provided values are preserved and do not call or advance `nextSequenceValue()`.
4. Single controller concurrency: 100 concurrent dispatches for the same scope produce `1..100` with no duplicates.
5. Two controller PostgreSQL concurrency: two controllers against the same DB produce `1..200` with no duplicates.
6. Multi-scope isolation: `{project:A,prefix:p}`, `{project:A,prefix:v}`, `{project:B,prefix:p}` maintain independent counters.
7. Rollback semantics: a dispatch that allocates then fails rolls back the counter; the next successful dispatch gets the next committed value by the documented transactional rule.
8. Delete semantics: deleting a record never decrements the counter; the next create gets a larger value.
9. Unique constraint fallback: manually seeded or imported conflicting values fail through existing `UniqueConstraint`.
10. Migration manifest diff: changing scope, `initialValue`, `step`, or `allowManualValue` changes `allocationSignature` and requires an explicit decision.
11. Migration schema: `_ScopedSequence_` is created additively and appears in migration planning without destructive changes.
12. Migration seed: existing records initialize counters by `MAX(serialNumber)` per scope; next allocation returns max + step.
13. Unsupported driver: setup or dispatch fails clearly, without `max + 1` fallback.
14. Runtime timing: one dispatch effect stream contains the host record create and the sequence property update, proving post-create/pre-commit allocation.
15. Downstream derivation: a computation deriving `displayName` from `serialNumber` must react to the `serialNumber` update, while tests must not assert that raw create-event computations can read the allocated value.

PostgreSQL double-controller concurrency is the critical acceptance test because the original medeo-lite bug is cross-process/cross-client.

## Implementation Touch Points

Likely files:

- `src/core/ScopedSequence.ts`
- `src/core/index.ts`
- `src/core/init.ts`
- `src/core/types.ts`
- `src/runtime/computations/ScopedSequence.ts`
- `src/runtime/Controller.ts` for built-in handle registration
- `src/runtime/System.ts` for `AtomicStorage` sequence methods and capability typing
- `src/runtime/MonoSystem.ts` for storage implementation and migration schema metadata
- `src/drivers/PostgreSQL.ts`, `src/drivers/PGLite.ts`, `src/drivers/SQLite.ts` for table setup and SQL compatibility
- `src/runtime/migration.ts` for manifest, diff, seeding, and unrebuildable semantics
- `tests/runtime/scopedSequence.spec.ts`
- `tests/runtime/postgresqlScopedSequence.spec.ts`
- migration tests under existing runtime migration specs

The implementation should not modify `StateMachine` semantics, should not relax transaction safety gates, and should not add a business-facing raw sequence service as the primary API.

## Open Design Decisions

The plan intentionally fixes these choices:

- Primary API is property computation.
- Allocation is post-create/pre-commit in the current runtime.
- Counters are transactional.
- Counter storage is an internal table with unique `(sequenceName, scopeKey)`.
- Unsupported drivers fail explicitly.

Remaining small decisions for implementation:

- Whether `scope.path` supports only top-level host properties or also dotted paths inside persisted object-valued host properties. It must not support relation traversal or storage-backed attribute query semantics.
- Whether `displayName` composition needs a first-class pre-insert dependency ordering improvement, or whether existing property computation update semantics are sufficient.
- Whether sequence manifest entries live inside `computations` only or also in a top-level `sequences` section for clearer migration review.
