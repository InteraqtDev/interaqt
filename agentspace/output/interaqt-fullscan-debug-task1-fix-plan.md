# Interaqt Full-Scan Debug Task 1 修复方案

## 实施进度（2026-05-29）

状态：已实施并完成验证。

本次完成：

1. `Scheduler.runComputation()` 已改为先生成增量计划，再按计划解析 data deps；普通增量路径不再 eager resolve 全部 `dataDeps`，fallback/full compute 才解析完整依赖。
2. `MigrationScheduler.runOneDirtyComputation()` 已同步复用 `Scheduler.executeDataBasedComputation()`，migration pending events 不再保留增量前解析主集合的旧路径，也不会复制一份易漂移的执行策略。
3. `DataBasedComputation` 增加 `primaryDataDepKeys`、`planIncremental()`、`IncrementalPlan`、`DataDepEventContext`、`LastValuePolicy` 等协议；Custom incremental 缺少 `planIncremental` / `incrementalDataDeps` 时会明确失败，第三方 data-based incremental handle 缺少 `planIncremental()` 会在 source map 初始化阶段失败。
4. 内置 Transform、Count、Any、Every、Summation、Average、WeightedSummation 均声明主 dep 并在增量计划中跳过主集合；GlobalWeightedSummation full/incremental callback 已统一传入外部 deps。
5. `resolveAllDataDeps()` / `resolveSelectedDataDeps()` 已拆分；partial resolve 会去重、校验非法 key，并按 key 构造结果，不依赖对象枚举顺序。
6. `records` data dep full resolve 已传入 `match` 和 `modifier`；source map update 触发补入 match 字段和 `modifier.orderBy` 字段；scheduler 已集中处理简单 records match membership，非匹配 create/delete/update 会 skip，跨边界 update 和无法安全判断的复杂 match 会 full recompute。
7. 对带 `limit` / `offset` / `orderBy` 的 records dep 已标记计划阶段 full recompute；modifier 排序/窗口变化不会再误走单条 delta 增量。
8. Transform 的半支持 `dataDeps` API 已从 core 类型与 runtime 构造分支移除，Transform 保持纯 source/event 映射。
9. 新增并扩展 `tests/runtime/incrementalPlanFullScan.spec.ts`，覆盖 Transform record create 不 full scan `_source`、Global Count 不 full scan `main`、Custom/第三方增量协议失败、partial deps key 映射、records dep resolve 传递 match/modifier、match skip/full recompute、modifier orderBy full recompute、entity/relation last value 策略，以及 data-based patch computation 计划阶段 full recompute 时必须按 full output 写入而不是误走 patch apply。
10. 已迁移旧 Custom incremental 测试到显式 `incrementalDataDeps` 协议。
11. `executeDataBasedComputation()` 已返回标准化执行模式：`skip`、`full`、`incremental`、`patch`。正常调度和 migration 都只在实际 patch 结果时走 patch apply；计划阶段 full recompute 或 fallback full recompute 会走 full result 写入路径。
12. `src/runtime/computations/README.md` 已更新为新的 `planIncremental` / partial data deps / match-modifier / last value / Custom incremental 协议文档。

验证结果：

- `npm run check:all` 通过。
- `npx vitest run tests/runtime/incrementalPlanFullScan.spec.ts` 通过。
- `npx vitest run tests/runtime/custom.spec.ts tests/runtime/customHandles.spec.ts tests/runtime/transactionRetry.spec.ts tests/runtime/migration.spec.ts` 通过。
- `npm test` 通过：117 个 test files passed，4 skipped；1570 tests passed，26 skipped。

已知边界：

- 本次已实现 modifier 窗口/排序风险的保守 full recompute，不实现 ordered/limited set 的细粒度增量维护。
- match relation path 触发复用现有 relation-aware attributeQuery source map 能力；复杂 match 的精确 membership skip 仍保持保守触发，不做漏算风险优化。

## 结论

`Transform.create({ record: InteractionEventEntity })` 的全表扫描不是 Transform 的局部实现问题，而是 runtime scheduler 的通用执行顺序问题：`Scheduler.runComputation()` 在选择增量路径之前，会先解析全部 `dataDeps`；其中 `records` dep 统一走 `storage.find(recordName, undefined, {}, attributeQuery)`，因此任何 data-based incremental computation 都可能在每次事件触发时先把主集合全量读出。

修复应该放在 scheduler/computation 协议层：增量计算不再默认预解析全部 `dataDeps`，也不默认读取 `useLastValue` 的完整输出表，而是由 computation 在计划阶段声明当前事件能否增量处理、增量路径真正需要哪些依赖、是否需要读取 last value。只有全量计算、初始化、force full compute、计划阶段要求 full recompute、增量失败回退全量时才解析完整依赖。这个执行策略必须同时覆盖正常 `Scheduler.runComputation()` 和 migration 的 `runOneDirtyComputation()`，避免迁移传播 pending events 时保留同类全扫路径。这样可以一次性覆盖 Transform、Count、Any、Every、Summation、Average、WeightedSummation、Custom 以及未来新增的 DataBasedComputation；框架不再保留“增量前 eager resolve 全部 dataDeps / last value”的旧协议。

## 根因

关键链路：

1. `RecordsTransformHandle` 在 `record` 模式下把 source record 转换为隐式 `_source` records data dep；见 `src/runtime/computations/Transform.ts:26`。
2. `Scheduler.runComputation()` 在任何 full/incremental 分支之前先执行 `resolveDataDeps()`；见 `src/runtime/Scheduler.ts:721`。
3. `resolveDataDeps()` 对所有 `records` dep 使用无 match 的 `storage.find(...)`；见 `src/runtime/Scheduler.ts:890`。
4. Transform 的 data-based incremental patch 实际只需要按事件 id `findOne()` 当前 source record；见 `src/runtime/computations/Transform.ts:105`。
5. `runComputation()` 在进入 `incrementalCompute` / `incrementalPatchCompute` 前还会按 `computation.useLastValue` 调用 `controller.retrieveLastValue()`；对 entity/relation dataContext，`retrieveLastValue()` 当前会 `storage.find(outputRecordName, undefined, undefined, ['*'])` 读取完整输出表。这不是原始 Transform 场景的触发点，但它是同一类增量路径的全表读取侧门。

这导致 create 事件实际执行：

```text
storage.find(source.name, undefined, {}, attributeQuery)  // 不必要的全量读取
storage.findOne(source.name, id = mutationEvent.record.id) // 真正的增量读取
```

这个模式并不只影响 Transform。所有内置 `incrementalCompute`/`incrementalPatchCompute` 都会先被动解析完整 `dataDeps`，然后才进入增量逻辑。

## 受影响范围

| Computation | 当前全量读取来源 | 增量路径实际需要 |
| --- | --- | --- |
| `Transform` record 模式 | `_source` records dep | create 时按 id 读取 source；update/delete 时锁 source 与 mapped rows |
| `GlobalCount` | `main` records dep | mutation event record、match state、外部 `args.dataDeps` |
| `PropertyCount` | `_current` property dep 会读取整条当前记录的关联查询 | dirty record、related mutation event；callback 场景按需 `findOne` relation |
| `Any` / `Every` | 同 Count 类似 | mutation event、per-item state、外部 deps |
| `Summation` / `Average` | `main` 或 `_current` dep | mutation event id 上的 `findOne` 或 related relation `findOne` |
| `WeightedSummation` | `main` 或 `_current` dep | mutation event、必要的单条 source lookup、外部 deps |
| `StateMachine` | 通常没有 dataDeps，影响小 | 保持现状 |
| `RealTime` | 没有事件增量收益，按当前语义处理 | 保持现状 |
| `Custom` | 用户声明的所有 dataDeps | 通过 `planIncremental()` 显式声明本次增量需要的 deps；缺失计划协议则启动失败 |

## 修复目标

1. 增量路径不得隐式解析主集合 records dep。
2. 全量计算语义不变：初始化、force full compute、计划阶段 full recompute、增量回退全量时仍解析完整 dataDeps。
3. 内置 computation 的增量计划由框架负责，用户不需要修改模型定义。
4. Custom 和第三方 DataBasedComputation 也必须遵守同一增量计划协议；不再保留旧 eager resolve 作为默认语义。
5. `RecordsDataDep.match` 不能继续被忽略：full resolve 必须应用 match，source map 必须把 match 相关字段纳入触发语义；调度预过滤只能在安全可判定时应用，不能因为复杂 match 误跳过事件。
6. `RecordsDataDep.modifier` 不能只在 full resolve 传参。带 `limit`、`offset`、`orderBy` 等窗口或排序 membership 语义的 modifier 默认不安全增量，必须在事件触发时直接 full recompute；只有明确证明不改变集合 membership 的 modifier 子集，才可以继续走普通单条 delta 增量。
7. `useLastValue` 不能绕过增量计划。增量路径只有在 plan 明确声明需要 last value 时才读取；entity/relation 输出表 last value 默认视为高风险全量读取，必须显式声明并有测试覆盖。

## 设计

### 1. 扩展 DataBasedComputation 为统一的增量计划协议

在 `DataBasedComputation` 上增加正式必需的增量计划协议。只要 scheduler 认定为 data-based 的 computation 声明了 `incrementalCompute` 或 `incrementalPatchCompute`，就必须实现 `planIncremental()`，否则在 computation handle 初始化或 source map 构建阶段抛 `ComputationProtocolError`。框架不再通过 `constructor.name`、字段碰巧存在、或者 opt-in policy 判断是否启用新语义。

```ts
export type LastValuePolicy =
  | { mode: 'none' }
  | { mode: 'normal' }
  | { mode: 'fullOutput'; reason: string }

export type IncrementalPlan =
  | {
      type: 'incremental'
      dataDepKeys: string[]
      needsLastValue?: boolean | LastValuePolicy
      reason?: string
    }
  | {
      type: 'fullRecompute'
      reason: string
    }
  | {
      type: 'skip'
      reason: string
    }

export interface DataBasedComputation {
  // ...
  primaryDataDepKeys?: string[]
  planIncremental?: (
    event: EtityMutationEvent,
    record: unknown | undefined,
    context: DataDepEventContext
  ) => IncrementalPlan
}
```

语义：

- `primaryDataDepKeys` 表示 computation 自己的主集合/当前记录依赖，例如 `main`、`_current`、`_source`。
- `planIncremental()` 是计划阶段 API，不复用 `ComputationResultFullRecompute` 这种计算结果类型表达调度决策。
- 返回 `{ type: 'incremental', dataDepKeys: [] }`：增量前不解析任何 dataDeps。
- 返回 `{ type: 'incremental', dataDepKeys: ['a'] }`：只解析这些 dataDeps。
- `needsLastValue` 默认为 `false`。scheduler 不再因为 `computation.useLastValue` 自动读取 last value；只有 plan 明确返回 `needsLastValue: true` 或更细的 `lastValuePolicy` 时才调用 `retrieveLastValue()`。
- 对 global/property last value，plan 可以声明普通读取；对 entity/relation last value，因为当前实现会读取完整输出表，默认禁止隐式读取，必须显式返回 `lastValuePolicy: { mode: 'fullOutput', reason }` 之类的高风险策略。没有显式策略时，如果 computation 同时声明 `useLastValue: true` 和 entity/relation incremental 输出，启动阶段或执行阶段抛 `ComputationProtocolError`。
- 返回 `{ type: 'fullRecompute', reason }`：当前事件不适合增量；scheduler 不先解析 partial deps，而是直接按 full recompute 流程解析完整 deps 一次。
- 返回 `{ type: 'skip', reason }`：事件被 source map 保守触发，但计划阶段确认对本 computation 无影响；scheduler 不解析 deps、不调用 compute、不写结果。
- 返回的 key 必须存在于 `dataDeps`；否则抛 `ComputationDataDepError`。
- 返回的 key 需要去重；partial resolve 的结果对象只包含请求的 keys，不能依赖 `Object.entries(...).map()` 和数组 index 重组，避免过滤后 key/value 错位。
- 没有增量方法的 computation 不需要实现 `planIncremental()`，全量路径始终解析完整 dataDeps。

命名上避免叫 `skipDataDeps`，因为增量依赖应该是正向声明：这个增量算法需要什么，而不是碰巧跳过什么。

建议提供共享 helper，避免每个 handle 零散手写：

```ts
function externalDataDepKeys(
  dataDeps: Record<string, DataDep>,
  primaryKeys: string[]
) {
  const primary = new Set(primaryKeys)
  return Object.keys(dataDeps).filter(key => !primary.has(key))
}
```

同时在 scheduler/source-map 层提供标准事件归因上下文，避免每个 computation handle 重复解析 `event.dataDep`、match membership 和 modifier 风险：

```ts
export type DataDepEventContext = {
  depKey?: string
  dep?: DataDep
  depRole: 'primary' | 'external' | 'self' | 'unknown'
  membershipChange: 'none' | 'entered' | 'left' | 'maybe' | 'unknown'
  requiresFullRecompute: boolean
  requiresFullOutputLastValue?: boolean
  reason?: string
}
```

当前 mutation event 只有 `dataDep` 引用，没有 `dataDepName`。source map 中保存的是 `computation.dataDeps` 里的 dep 对象引用，因此事件归因阶段先按对象引用解析出 key；如果未来 source map 结构变化，也只需要改这一个阶段。内置 computation 只消费 `DataDepEventContext`，不直接散落实现“事件来自哪个 dep”的判断。

### 2. 抽出共享执行策略，改造 Scheduler 与 MigrationScheduler

把现在的 eager resolve 改为先决定执行模式：

```ts
const shouldFullCompute =
  forceFullCompute ||
  (!computation.incrementalCompute && !computation.incrementalPatchCompute)

if (shouldFullCompute) {
  const dataDeps = await this.resolveAllDataDeps(computation, record)
  result = await computation.compute(dataDeps, record)
} else {
  const eventContext = buildDataDepEventContext(computation, erRecordMutationEvent, record)
  const plan = computation.planIncremental?.(erRecordMutationEvent, record, eventContext)

  if (!plan) {
    throw new ComputationProtocolError('incremental computation must implement planIncremental')
  }

  if (plan.type === 'skip') {
    return ComputationResult.skip()
  }

  if (eventContext.requiresFullRecompute || plan.type === 'fullRecompute') {
    assertSerializable()
    const fullDeps = await this.resolveAllDataDeps(computation, record)
    result = await computation.compute(fullDeps, record)
    return result
  }

  const dataDeps = await this.resolveSelectedDataDeps(computation, record, plan.dataDepKeys)
  const lastValue = await this.resolvePlannedLastValue(computation, record, plan, eventContext)
  result = await computation.incrementalCompute(lastValue, ..., dataDeps)

  if (result instanceof ComputationResultFullRecompute) {
    assertSerializable()
    const fullDeps = await this.resolveAllDataDeps(computation, record)
    result = await computation.compute(fullDeps, record)
  }
}
```

这段逻辑不能只写在 `Scheduler.runComputation()` 里。`src/runtime/migration.ts` 的 `MigrationScheduler.runOneDirtyComputation()` 当前也在选择 `incrementalPatchCompute` / `incrementalCompute` 前调用 `controller.scheduler.resolveDataDeps(computation, record)`，因此 migration incremental recompute 会保留同样的全量主集合读取。必须把“判断 full/incremental、解析 incremental dep keys、fallback 时解析完整 deps、SERIALIZABLE 校验”的策略抽成 scheduler 上的共享 helper，例如 `executeDataBasedComputation()`，由正常调度和 migration 调度共同调用；migration 只保留写入 result/patch 的差异。

依赖解析拆成两个显式入口，避免 `undefined` 表示全部、`[]` 表示空集的隐式约定：

```ts
async resolveAllDataDeps(
  computation: DataBasedComputation,
  record?: unknown
)

async resolveSelectedDataDeps(
  computation: DataBasedComputation,
  record?: unknown,
  depKeys: string[]
)
```

`resolveSelectedDataDeps(..., [])` 明确返回 `{}`。全量路径只能调用 `resolveAllDataDeps()`，增量路径只能在 `planIncremental()` 返回 incremental 计划后调用 `resolveSelectedDataDeps()`。

`planIncremental()` 的默认策略和校验：

- 协议校验只适用于 scheduler 认定为 data-based 的 computation。只要 data-based computation 有 `incrementalCompute` 或 `incrementalPatchCompute`，就必须实现 `planIncremental()`；缺失时启动失败或 source-map 构建失败，不能静默回到 eager resolve。`Transform.create({ eventDeps })` 这类 event-based instance 仍走 event source map，不因为 handle 类上存在 `incrementalPatchCompute` 而被要求实现 data-based `planIncremental()`。
- 内置 computation 可以使用共享 helper：当事件来自主 dep 且没有 membership 风险时，返回 `dataDeps - primaryDataDepKeys`。
- 如果 `DataDepEventContext.requiresFullRecompute` 为 true，scheduler 直接 full recompute；computation 不需要重复理解底层 match/modifier 细节。
- 如果 `planIncremental()` 根据 `recordName` / `relatedAttribute` 判定当前事件不是当前算法可增量处理的形状，返回 `fullRecompute` 或 `skip`，避免先解析外部大 dep 后立刻 fallback full recompute 的双重读取。
- `resolvePlannedLastValue()` 只根据 plan 读取 last value。`computation.useLastValue` 作为兼容性元信息参与协议校验，但不再直接触发读取；entity/relation output 的 full-output last value 必须通过显式 policy 声明并接受 SERIALIZABLE/性能约束。
- 返回值校验统一放在 scheduler：去重、检查 key 是否存在、构造只包含请求 keys 的结果对象。
- partial resolve 的结果语义只按 key 访问；对象枚举顺序最多用于调试可读性，不能成为 callback contract。

这个 preflight full-recompute signal 是本次修复要求，不是后续优化。否则主 dep 全扫虽然消失，但外部 records dep 触发时仍可能出现“partial resolve 大 dep + fallback full resolve 完整 deps”的重复读取。

需要明确两类全量读取的边界：

- 本任务要消除的是不必要的 eager `dataDeps` resolve、隐式 full-output last value、以及 partial-then-full 的重复读取。
- `computeDataBasedDirtyRecordsAndEvents()` 中 global dep 影响 property computation 时读取所有 host records，是“全局值变化可能影响每条 property 记录”的语义 fan-out，不属于 `planIncremental()` 能自动消除的问题。验收测试不能把这类 host discovery 误判为主 dep eager resolve；后续若要优化，需要 affected-record 索引或 computation 声明式筛选策略。

共享 helper 的职责边界也必须固定下来，避免正常调度与 migration 漂移：

- helper 负责选择 full/incremental/skip、解析 all/selected deps、按 plan 读取 last value、处理 `ComputationResultFullRecompute` fallback，并返回标准化的 result/patch/skip/async decision。
- 正常 `Scheduler.runComputation()` 继续负责现有 async task 创建、`ComputationResultResolved.asyncReturn()`、`applyResult` / `applyResultPatch`、entity/relation patch 的 SERIALIZABLE 校验。
- migration 复用同一选择与解析策略，但保留自己的 `writeComputationResult` / `writeComputationPatch`、migration async resolution 和事件生成差异。
- 重构时必须覆盖 async Custom、resolved result、patch apply、fallback full recompute 的行为回归，确保本次性能协议不改变非 full-scan 语义。

### 3. 内置 computation 的增量依赖声明

内置 handles 应该明确声明主数据依赖不在增量前解析。

建议规则：

- `Transform` record 模式：`primaryDataDepKeys = ['_source']`，`planIncremental()` 在 `_source` 的 create/update/delete 且无 membership 风险时返回 `{ type: 'incremental', dataDepKeys: [] }`。`_source` 由 `dataBasedIncrementalPatchCompute()` 自己按 id/lock 读取；Transform callback 不接收额外 deps。
- `GlobalCount`：`primaryDataDepKeys = ['main']`，默认解析外部 deps。`main` 不解析，callback 仍可得到用户额外 deps。
- `PropertyCount`：`primaryDataDepKeys = ['_current']`，默认解析外部 deps。`_current` 不解析，相关记录由已有 incremental 逻辑读取。
- `Any` / `Every`：同 Count。
- `GlobalSummation` / `GlobalAverage`：当前 core API 没有公开 `dataDeps`，runtime handle 也只构造主 dep；`primaryDataDepKeys = ['main']`，增量 plan 只需跳过主 dep，主记录按 id 查询必要字段。如果未来要支持外部 deps，必须作为独立 API 扩展补齐 full/incremental callback 语义测试。
- `PropertySummation` / `PropertyAverage`：当前 core API 没有公开 `dataDeps`，runtime handle 也只构造 `_current` 主 dep；`primaryDataDepKeys = ['_current']`，增量 plan 只需跳过主 dep，相关 relation/entity 由 incremental 逻辑按 id 查询。如果未来要支持外部 deps，必须作为独立 API 扩展处理。
- `PropertyWeightedSummation`：`primaryDataDepKeys = ['_current']`，默认解析外部 deps；当前 property 级实现的 `compute()` 和 `incrementalCompute()` 都会把外部 deps 传给 callback。
- `GlobalWeightedSummation`：必须补齐外部 deps 语义，再按默认外部 deps 处理。core 层暴露了 `WeightedSummation.dataDeps`，property handle 已经把外部 deps 传给 callback；global handle 当前只在 `dataDeps` 中合并它们，`compute({ main })` 和 `incrementalCompute(lastValue, mutationEvent)` 没有把外部 deps 传给 callback，这是实现不一致。global callback 签名统一扩展为 `(item, dataDeps) => { weight, value }`，full 和 incremental 都传入外部 deps，并增加测试。
- `StateMachine` / `RealTime`：如果没有 dataDeps 返回 `[]`；如未来增加 deps 按语义声明。
- `Custom`：core API 增加 `planIncremental` 或声明式 `incrementalDataDeps` 并在 runtime handle 中归一为 `planIncremental()`。只要声明 `incrementalCompute` 或 `incrementalPatchCompute`，就必须给出计划协议；否则抛明确迁移错误，提示用户声明增量依赖或删除增量方法改走 full compute。

所有内置 computation 的 `planIncremental()` 都要先做事件可增量性判定：事件来自自己的主 dep 且 mutation shape 被当前算法支持时，返回当前 computation 实际需要的增量 deps。对 Count / Any / Every / WeightedSummation / Custom 这类当前已有外部 deps 的 computation，通常是 external dep keys；对 Summation / Average 这类当前没有外部 deps 的 computation，则是 `[]`。事件来自外部 dep、复杂 relation path、match/modifier membership 变化或任何当前算法不能表达的集合变化时，返回 `{ type: 'fullRecompute', reason }`，让 scheduler 只做一次完整 resolve。

所有需要 last value 的内置 computation 必须把 last value 需求写入 plan：

- global/property 聚合类通常只需要现有 scalar value，可返回普通 `needsLastValue: true`。
- entity/relation 输出类默认不允许隐式 `useLastValue`，因为当前 `retrieveLastValue()` 会读取完整输出表；确实需要完整输出表才能计算 patch 的 computation，必须显式返回 `lastValuePolicy: { mode: 'fullOutput', reason }`，并配套 SERIALIZABLE 与性能测试。
- 不需要 last value 的 incremental patch computation 返回 `needsLastValue: false` 或省略该字段，scheduler 不得调用 `retrieveLastValue()`。

`Transform` 需要单独修正 API 现状：core `TransformCreateArgs` 虽然声明了 `dataDeps`，但 `Transform` 构造函数、`public`、`stringify`、`clone`、`parse` 都没有保存或公开它；runtime 读取 `this.args.dataDeps` 实际不是当前稳定语义。本次破坏性修复选择移除 Transform 的 `dataDeps` 类型入口和 runtime 分支，保持 Transform 为纯 source/event 映射。需要外部数据参与映射时，使用 Custom 或其他更明确的 computation 表达。

### 4. 修正 RecordsDataDep.match

当前 `RecordsDataDep` 类型有 `match?: MatchExpressionData`，但 `resolveDataDeps()` 没有传给 storage。需要改为：

```ts
storage.find(dataDep.source.name!, dataDep.match, dataDep.modifier ?? {}, dataDep.attributeQuery)
```

同时补上测试确保 `match` 和 `modifier` 都被传递，避免用户声明过滤条件却仍全表读取。

这不只是 resolve 层性能问题，也是 source map 正确性问题。`ComputationSourceMapManager.convertDataDepToERMutationEventsSourceMap()` 当前 records dep 的 update 触发只来自 `attributeQuery`，没有从 `dataDep.match` 提取字段，也没有定义记录进入/离开 match 集合时的增量语义。需要补充：

- 从 `RecordsDataDep.match` 中提取可静态识别的字段，加入 update source map；无法提取时对该 records dep 保守监听 `'*'`，并在 source map metadata 上标记“match membership 变化需要 full recompute”。
- match 路径不能只当作 source record 自身字段字符串处理。`project.status`、`owner.team.name` 这类关系路径必须转换成 source map 能理解的 relation-aware `AttributeQueryData`，复用或抽象 `convertAttrsToERMutationEventsSourceMap()` / `convertRelationAttrToERMutationEventsSourceMap()` 的递归逻辑，使相关实体或关系记录的 update/create/delete 能触发 computation。
- 对 x-to-one / x-to-many / relation attribute path 无法安全转换的 match，不能只监听 source record 的 `'*'`；必须保守监听可能改变 membership 的相关 record/relation 事件，或者把该 match 标记为 source-map 层无法安全增量、触发后直接 full recompute。
- create/delete：如果 mutation event record 能用 match evaluator 确认不匹配，可以在 source-map/scheduler 事件归因阶段生成 `skip`。
- update：用 `oldRecord` 判断旧 membership，用合并后的 `{ ...oldRecord, ...record }` 判断新 membership；任一可能匹配都必须触发。跨越 match 边界时，由统一 `DataDepEventContext` 标记 `membershipChange` 与 `requiresFullRecompute`，不能让各个 computation 把它当作普通属性 update。
- 对复杂 relation path、函数式 match、无法在内存安全判定的 match，不跳过，只能保守触发。

预过滤本身是性能优化；但 match 字段参与 source map 触发、无法安全增量时回退 full recompute，是正确性要求。

match membership 的判断必须集中在 DataDep/source-map/scheduler 事件归因层，而不是分散到 Count、Any、Every、Summation、Average 等每个 handle。computation 只读取标准化的 `DataDepEventContext` 并决定自身算法是否支持该上下文。

### 5. 定义 RecordsDataDep.modifier 的增量安全边界

`RecordsDataDep.modifier` 当前同样存在于类型中，但 `resolveDataDeps()` 没有传给 storage。full resolve 必须传入 `modifier`，但这只解决查询语义的一半；modifier 还会改变集合 membership：

- `limit` / `offset` / `orderBy` 表示窗口集合，任何 create/update/delete 都可能让未变更记录进入或离开窗口。
- 普通内置增量算法只围绕 mutation event 的单条记录或单条 relation 调 delta，无法表达 “top N 中另一条记录被挤出/补入”。
- `modifier.orderBy` 涉及的字段必须进入 update source map，即使它们不在 `attributeQuery` 中。例如 `attributeQuery: ['id', 'name']` 搭配 `{ orderBy: { priority: 'DESC' }, limit: 10 }` 时，`priority` update 可能改变窗口 membership，必须触发 computation。
- orderBy 路径同样需要 relation-aware 转换；无法静态提取或无法转换的 modifier 要保守监听 `'*'` 或相关 relation/entity 事件，并标记 `requiresFullRecompute`。
- 因此，带 membership/window 风险 modifier 的 records dep 触发时，source-map metadata / `DataDepEventContext` 必须标记 `requiresFullRecompute`，scheduler 在解析 partial deps 前直接执行 full recompute。
- 第一阶段不要尝试维护 ordered/limited set 的增量状态；如果未来支持，需要独立设计窗口 membership state、边界查询和并发锁语义。
- 如果存在可证明不影响 membership 的 modifier 子集，必须显式列白名单并有测试；未知 modifier 一律保守 full recompute。

### 6. 不把 Mesh mitigation 当框架修复

`eventDeps` 仍然是表达“监听某个 interactionName”的更准确建模方式，Mesh 可以迁移：

```ts
Transform.create({
  eventDeps: {
    createRequest: {
      recordName: InteractionEventEntity.name,
      type: 'create',
      record: { interactionName: CreateEditorRuntimeRequest.name },
    },
  },
  callback(event) {
    return { ... }
  },
})
```

但框架修复不能依赖业务侧迁移。即使用户继续使用 `record: InteractionEventEntity`，增量 create 路径也不应该先 full scan `_Interaction_`。

## 实施步骤

1. 修改 `src/runtime/computations/Computation.ts`，加入 `IncrementalPlan`、`DataDepEventContext`、`planIncremental()` 协议和相关错误类型。
   - 同时加入 `primaryDataDepKeys?: string[]`，并提供 `externalDataDepKeys()` 等共享 helper，避免每个内置 handle 手写易漂移的 key 过滤逻辑。
   - 加入 `LastValuePolicy` / `needsLastValue`，把 last value 读取纳入同一个计划协议。
   - 有 `incrementalCompute` 或 `incrementalPatchCompute` 的 DataBasedComputation 必须实现 `planIncremental()`；缺失时抛 `ComputationProtocolError`。
2. 修改 `src/runtime/Scheduler.ts`：
   - 抽出可复用的 data-based computation 执行 helper，使 `runComputation()` 先判断 full/incremental，再解析 deps。
   - 拆分 `resolveAllDataDeps()` 与 `resolveSelectedDataDeps()`，避免一个可选参数承载 full/partial 两种语义。
   - 增加 `resolvePlannedLastValue()`：只在 plan 明确声明时读取 last value；entity/relation full-output last value 需要显式 policy，否则抛协议错误。
   - dep key 子集需要去重、校验存在性，并按 key 构造结果对象；不要沿用数组 index 重组。
   - 构建统一 `DataDepEventContext`，集中处理 mutation event `dataDep` 引用到 dep key 的映射、主 dep / 外部 dep / self dep 归因、match membership、modifier membership 风险。
   - partial resolve 的实现和测试都只把 key/value 对应关系当语义，不把对象枚举顺序当语义。
   - `records` dep resolve 应用 `match` 和 `modifier`。
   - partial deps 解析前处理 `fullRecompute` plan 或 `DataDepEventContext.requiresFullRecompute`，直接解析完整 deps 一次。
   - fallback full recompute 保持完整 deps 解析和 SERIALIZABLE 要求。
3. 修改 `src/runtime/migration.ts`：
   - `MigrationScheduler.runOneDirtyComputation()` 不再自行 eager resolve 全部 dataDeps。
   - 复用 scheduler 的共享执行策略，只保留 `writeComputationResult` / `writeComputationPatch` 的 migration 写入差异。
   - migration 也必须按 plan 读取 last value，不得继续用 `computation.useLastValue ? retrieveLastValue(...) : undefined` 绕过协议。
   - migration incremental recompute 中的 fallback full recompute 同样只解析一次完整 deps。
4. 为内置 computation handles 增加 `primaryDataDepKeys` / `planIncremental()`。
   - 优先通过 `primaryDataDepKeys` 标注主 dep；只有 Transform 这类完全不消费外部 deps 的场景才显式返回 `[]`。
   - 每个内置 handle 必须在解析 deps 前判断 `mutationEvent` 是否属于自己可增量处理的主 dep；否则返回 full recompute 或 skip plan。
   - 对 `DataDepEventContext.requiresFullRecompute` 直接尊重，不重复解析 match/modifier 底层细节。
   - 补齐 `GlobalWeightedSummation` 的外部 `dataDeps` 语义，使 global/property callback 在 full 与 incremental 中都接收一致的外部 deps。
5. 扩展 `src/core/Custom.ts` 与 `src/runtime/computations/Custom.ts`，支持 `planIncremental` 或声明式 `incrementalDataDeps`。
   - 声明增量方法但未声明增量计划时抛明确错误，提示迁移 Custom 代码。
   - 声明式 `incrementalDataDeps` 在 runtime handle 中转换为 `planIncremental()`；函数式 `planIncremental` 用于复杂事件能力判断。
6. 修改 `src/runtime/ComputationSourceMap.ts`：
   - `RecordsDataDep.match` 可静态识别的字段必须参与 update source map。
   - match 字段路径必须转换成 relation-aware source map；不能把 `project.status` 之类路径简单塞进 source record 的 primitive attributes。
   - 无法静态识别或无法 relation-aware 转换时，保守监听 `'*'` 或可能影响 membership 的相关 record/relation 事件，并标记触发后必须 full recompute。
   - `modifier.orderBy` 字段必须参与 update source map；字段不在 `attributeQuery` 中也必须触发。
   - create/delete/update 的 match 预过滤只能在本地安全判断时跳过，否则保守触发，并输出标准 `DataDepEventContext`。
   - `RecordsDataDep.modifier` 的不安全窗口语义必须标记为 `requiresFullRecompute`，不允许普通 delta 增量假装正确。
7. 修改 `src/core/Transform.ts` 与 `src/runtime/computations/Transform.ts`：
   - 从 Transform API 移除 `dataDeps`，删除 runtime 对 `args.dataDeps` 的半支持分支。
   - 保持 Transform 为纯 source/event 映射。
8. 更新 `src/runtime/computations/README.md`，明确 full deps、primary deps、incremental deps、match membership、modifier membership 变化的区别。

## 回归测试计划

新增测试应覆盖“没有不必要 full scan”，而不是只断言结果正确。

建议在 storage spy 层记录 `find(recordName, undefined, ...)` 调用：

1. `Transform` record 模式 create：
   - 创建 source record 后目标记录正确生成。
   - 断言没有对 source record 的 `find(source, undefined, ...)`。
   - 断言存在按 id 的 `findOne`。
2. `Transform` eventDeps 模式：
   - 不解析 dataDeps。
   - unrelated event 不触发 computation。
3. `GlobalCount` 带 callback：
   - create/update/delete 后 count 正确。
   - 增量路径不 full scan `main`。
   - 如果声明额外 records dep，则只解析该额外 dep。
4. `Any` / `Every` / `Summation` / `Average` / `WeightedSummation`：
   - 对 global 与 property 两类至少各覆盖一个代表。
   - 断言主集合或 `_current` 不在增量前被完整解析。
5. `Custom` 统一协议：
   - 声明增量方法但未声明 `planIncremental` / `incrementalDataDeps` 的 Custom 启动失败，并给出明确错误。
   - 声明 `incrementalDataDeps: []` 的 Custom 不触发 full scan。
   - 函数式 `planIncremental` 能返回 incremental/fullRecompute/skip 三类计划。
6. `RecordsDataDep.match`：
   - full compute resolve 时传入 match。
   - match 字段 update 能触发 computation，即使字段不在 attributeQuery 中。
   - match 字段在关联实体或关联关系路径上时，相关 record/relation 的 update/create/delete 能触发 computation，不能只监听 source record 自身字段。
   - match membership 从不匹配变匹配、从匹配变不匹配时结果正确；无法安全增量的 computation 返回 full recompute。
   - match 不满足的 create/delete event 在可安全判定时不触发 computation。
7. `RecordsDataDep.modifier`：
   - full compute resolve 时传入 modifier。
   - `orderBy` 字段不在 `attributeQuery` 中时，更新该字段仍触发 computation。
   - `limit` / `offset` / `orderBy` records dep 被相关 create/update/delete 触发时不走单条 delta 增量，而是直接 full recompute。
   - 验证不会先 partial resolve 带 modifier 的大 dep 再 fallback full resolve。
8. migration incremental recompute：
   - 构造带 pending mutation event 的 migration/recompute 场景，验证 data-based incremental computation 不在进入增量前解析主集合。
   - migration fallback full recompute 只解析完整 deps 一次。
9. 外部 dataDep 触发：
   - 对 `GlobalCount`/`Any`/`Every` 等带额外 records dep 的 computation，外部 dep 事件触发时直接 full recompute。
   - 断言不会先解析外部 dep 再 fallback 解析完整 deps。
10. fallback full recompute：
   - incremental 返回 `ComputationResult.fullRecompute()` 时才解析完整 deps。
   - 非 SERIALIZABLE 下仍触发 retry，不改变并发语义。
11. last value 计划：
   - `dataDepKeys: []` 且 plan 未声明 last value 时，不调用 `retrieveLastValue()`。
   - entity/relation incremental computation 如果仍设置 `useLastValue: true` 但没有显式 full-output last value policy，启动或执行时报 `ComputationProtocolError`。
   - 明确声明 full-output last value policy 的 computation 有单独性能/事务测试，不被误认为普通轻量增量路径。
12. partial data deps：
   - `resolveSelectedDataDeps(computation, record, ['b', 'a', 'b'])` 只返回 `a`、`b` 两个 key，且 key/value 不错位；测试不依赖对象枚举顺序。
   - 不存在的 dep key 抛 `ComputationDataDepError`。
   - `DataDepEventContext` 能把 source map 中的 dep 对象引用稳定映射回 dep key；未知引用返回 `depRole: 'unknown'` 或抛出明确错误，由 scheduler 策略统一处理。
13. `GlobalWeightedSummation` 外部 deps：
   - full/incremental callback 都能收到外部 deps，且增量路径只解析外部 deps、不解析 `main`。
14. `Transform` API 边界：
   - `Transform.create({ dataDeps })` 被类型/API 禁止。
   - runtime Transform 不再读取 `args.dataDeps`；record 模式增量 plan 返回 `dataDepKeys: []`。
15. async / patch / migration 行为：
   - async Custom 的 task 创建与 migration async resolution 不因共享 helper 重构而改变。
   - `ComputationResultResolved.asyncReturn()`、`applyResultPatch()`、entity/relation patch SERIALIZABLE 校验保持现有语义。
   - migration 的 `writeComputationResult` / `writeComputationPatch` 仍生成正确 mutation events。
16. 内置/第三方协议：
   - 第三方 `DataBasedComputation` 声明增量方法但缺失 `planIncremental()` 时启动失败。
   - 所有内置 incremental handles 都有 `planIncremental()` 覆盖。

## 风险与兼容性

- 最大破坏性风险在 Custom。旧 Custom incremental 回调如果依赖 scheduler 预解析全部 dataDeps，必须迁移为显式 `planIncremental` / `incrementalDataDeps`；这是本次修复有意消除旧错误协议的代价。
- 内置 computation 的 callback 可能依赖 `args.dataDeps`，因此不能一刀切传 `{}`。必须只跳过主 dep，保留用户外部 deps。
- 但外部 dep 触发自身通常不是当前内置增量算法可处理的事件；必须在解析 partial deps 前直接 full recompute，避免重复读取外部大 dep。
- `RecordsDataDep.match` 事件预过滤只能保守跳过；复杂 match 如果无法判断，继续触发，不能漏算。
- `RecordsDataDep.match` 的字段触发语义必须和 resolve 语义一致。只修 `storage.find(match)` 会让 full compute 看见过滤集合，但 match 字段 update 可能不触发 computation，这是不可接受的正确性风险。关联路径 match 尤其不能退化成监听 source record 自身的字符串字段。
- `RecordsDataDep.modifier` 的 full resolve 语义和 incremental membership 语义必须一致。只把 modifier 传给 `storage.find()` 会让 full compute 看见窗口集合，但普通 delta 增量仍会漏掉被排序/limit 窗口挤出或补入的记录。
- `modifier.orderBy` 字段是触发语义的一部分，不是查询层细节；如果 source map 不监听 orderBy 字段变化，scheduler 没有机会执行 full recompute。
- `useLastValue` 是另一个全量读取入口。跳过主 dataDep resolve 后，如果仍按旧 `useLastValue` 自动读取 entity/relation 输出表，框架级 full-scan 问题没有真正封死。
- global dep 触发 property computation 时的 host 全量发现是语义 fan-out，不等同于本任务要禁止的主 dataDep eager resolve。测试 spy 需要区分这两类 `find()`。
- 共享执行策略重构不能丢失 async task、resolved result、patch apply、SERIALIZABLE retry 等现有边界；这些不是性能优化点，而是 runtime 语义。
- 增量路径跳过 full deps 后，只有 computation 自己负责读取必要单条记录。现有内置实现基本已经这么做，测试要覆盖每类。
- `GlobalWeightedSummation` 现状存在 API 与 runtime 消费不一致：core 暴露 `dataDeps`，global runtime 当前不传给 callback。本次修复必须补齐 global/property 一致语义。
- `Transform` 的 `dataDeps` 当前只在类型和 runtime 构造分支中若隐若现，core 实例并不会保存/序列化/clone。本次修复直接移除该半支持 API，保持 Transform 范式简单。
- 第三方 computation 的兼容边界变为正式协议校验。不能用 constructor name 或“字段存在”这种脆弱方式推断行为；缺少 `planIncremental()` 就明确报错。

## 验收标准

1. 原始 `_Interaction_` Transform create 场景中，每个触发的 Transform 不再出现 `_Interaction_` 的无条件 `find(undefined)`。
2. 所有内置 incremental computation 在普通 create/update/delete 增量路径中不解析自己的主集合 dep。
3. full compute、setup、migration recompute、fallback full recompute 行为保持不变。
4. Custom incremental 必须显式声明增量计划；缺失声明的旧用法得到明确迁移错误，声明后的 partial deps 测试通过。
5. `RecordsDataDep.match` 在 resolve 层和 source map 触发层都生效，并有测试防止 match 字段 update 漏算。
6. `RecordsDataDep.match` 的 relation path 触发语义正确；关联实体/关系字段变化不会因为字段不在 source record 或 `attributeQuery` 中而漏算。
7. `RecordsDataDep.modifier` 在 resolve 层生效；`orderBy` 字段参与 source map 触发；带窗口/排序 membership 风险的 modifier 不走不安全单条增量。
8. `useLastValue` 读取受 `IncrementalPlan` 控制；未声明 last value 的增量路径不读取输出表，entity/relation full-output last value 必须显式声明。
9. migration incremental recompute 不再保留 eager resolve 主集合路径，也不绕过 last value 计划。
10. 外部 dep 触发时不会出现 partial resolve 大 dep 后马上 fallback full resolve 的重复读取。
11. partial `resolveSelectedDataDeps()` 不会 key/value 错位，非法 key 有明确错误。
   - partial resolve 不承诺对象枚举顺序，调用方必须按 key 访问。
   - scheduler 提供统一 dep 引用到 dep key 的映射 helper，内置 computation 不重复散落实现。
12. `WeightedSummation` 的 global/property 外部 deps 语义一致。
13. Transform 外部 `dataDeps` 被明确移除，runtime 不再保留半支持分支。
14. 第三方 computation 和 Custom 不存在旧 eager resolve 默认路径；增量方法缺少计划协议时明确失败。
15. async/resolved/patch/migration 写入语义在重构后保持兼容。
