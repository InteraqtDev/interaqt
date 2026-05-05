# Data Migration Phase 1.5 Two-Step Review Implementation Plan

## 结论

Task 2 的正确方向是把当前 Phase 1 migration 从“业务定义中预先写 migration metadata”改成“两步式人工审阅”：

1. `generateMigrationDiff()` 只生成可审阅的结构化差异文件，包含框架观察到的模型、storage、computation、函数文本、destructive scope 等线索。
2. `migrate({ approvedDiff })` 只根据用户确认后的 diff 执行现有 compute-route migration，并继续强制执行 Phase 1 已有安全 gate。

本计划按用户要求不保留兼容层：不继续要求或支持通过 `version` / `migrationKey` 表达 computation 语义变化，不保留 `allowDestructiveCleanup` / `destructiveScope` 作为主执行入口，也不让 `hints` 承担 phase 2 primitive 语义。旧 API 和旧 manifest 形态应被直接重写为 Phase 1.5 形态。

## 当前实现现状

当前 migration 主逻辑集中在 `src/runtime/migration.ts` 和 `src/runtime/Controller.ts`。

1. `createMigrationManifest()` 当前要求 entity / relation / property / computation 都有稳定 `uuid`。缺少时会抛出 `AmbiguousComputationSignatureError`。
2. `createComputationManifest()` 当前把 computation signature 建立在 `version` / `migrationKey`、deps、eventDeps、state signature 和 callback presence 上，但不保存函数文本或函数 hash。
3. `getChangedComputations()` 当前只比较新旧 computation `signature`，因此函数语义变化必须由用户提前更新 `version` / `migrationKey` 才能被识别。
4. `getRecomputeBlockingChanges()` 当前会对 rebuild plan 中的 function-based computation 调用 `assertVersionedUserFunctions()`，缺少 `version` / `migrationKey` 时直接产生 blocking change。
5. event-based computation 当前要求 computation 对象上存在 `migrationCompute`；async computation 当前要求 computation 对象上存在 `migrationAsync`。
6. destructive computed output 当前通过 `allowDestructiveCleanup` 和 `destructiveScope` 参数确认，确认内容不进入一个统一的审阅文件。
7. `Controller.migrate()` 当前一次性完成：读取 manifest、生成 schema plan、找 changed computations、生成 rebuild plan、收集 blocking changes、dry-run 或执行。
8. migration log 当前只记录 `modelHash`、phase、status、error 和 operation resume 状态，没有记录 approved diff hash 或人工 decision。

这些实现满足 Phase 1 的 compute-route 能力，但把大量 migration 决策提前塞进业务模型定义，正是 Phase 1.5 要移除的体验问题。

## Phase 1.5 目标

1. 去掉业务定义中与 migration 审阅有关的要求：不再要求 `version`、`migrationKey`、migration-specific stable uuid、`migrationCompute`、`migrationAsync` 写在业务对象上。
2. 所有不属于业务模型本身的 migration 决策集中进入 approved diff：computation changed / unchanged / state-only、event rebuild handler、async completion handler、destructive scope 确认。
3. `Function.toString()` 只作为 diff 线索：可以生成函数文本 hash 和文本变化提示，但不能自动判定语义是否变化。
4. Phase 1 的安全 gate 继续保留：physical path move、fact destructive schema change、ownership proof、async completion、event rebuild、destructive computed output 都不能被绕过。
5. 不实现 phase 2 primitive 执行。rename / copy / backfill 可以作为 diff 中的审阅项或 blocked candidate 出现，但 Phase 1.5 不执行 rename/copy/merge/split 优化。

## 非目标

1. 不自动识别或执行 rename。
2. 不使用函数文本自动决定是否重算。
3. 不支持把旧 `migrationKey` / `version` 当作 approved decision 的快捷方式。
4. 不保留 `controller.migrate()` 裸执行旧行为。
5. 不引入 CLI 作为必需交付项。当前 package 没有 bin/CLI 基础，Phase 1.5 先完成 runtime API；CLI 可在后续独立任务基于 runtime API 增加。

## 新 API 形态

### 生成审阅 diff

```ts
const diff = await controller.generateMigrationDiff()
```

可选参数只影响 diff 生成的展示和检测，不表达执行意图：

```ts
type GenerateMigrationDiffOptions = {
  includeFunctionText?: boolean
  includeDestructiveScope?: boolean
}
```

默认输出函数 hash，不输出完整函数文本；测试可以开启 `includeFunctionText` 断言 diff 内容。

### 执行 approved diff

```ts
await controller.migrate({
  approvedDiff,
  dryRun: true,
  handlers: {
    eventRebuild: {
      "property:Ticket.status": async ({ record }) => "open",
    },
    asyncCompletion: {
      "property:Order.score": async ({ args }) => args.finalValue,
    },
  },
})
```

新的 `MigrationOptions`：

```ts
type MigrationOptions = {
  dryRun?: boolean
  approvedDiff: ApprovedMigrationDiff
  handlers?: MigrationHandlers
}
```

`approvedDiff` 是必需项。`dryRun` 表示“根据 approved diff 生成并校验将要执行的 plan，但不改数据库”。没有 approved diff 的 `migrate()` 必须 fail fast，并提示先调用 `generateMigrationDiff()`。

### setup 集成

`setup(true)` 仍用于全量安装并写入当前 manifest。

`setup(false)` 在 manifest mismatch 时继续 fail fast，但错误文案改成提示：

```ts
const diff = await controller.generateMigrationDiff()
await controller.migrate({ approvedDiff })
```

`setup({ migrate: { approvedDiff } })` 可以作为应用启动时的执行入口。`setup({ migrate: true })` 不再支持，因为它没有人工审阅输入。

## Diff 数据结构

### 顶层结构

```ts
type MigrationDiffFile = {
  kind: "interaqt-migration-diff"
  version: 2
  status: "generated" | "approved"
  fromModelHash: string
  toModelHash: string
  generatedAt: string
  generatorVersion: string
  summary: MigrationDiffSummary
  changes: MigrationChange[]
  requiredDecisions: MigrationDecisionRequirement[]
  decisions: MigrationDecision[]
  safety: MigrationSafetyReview
}
```

`version: 2` 表示 Phase 1.5 新 manifest/diff 语义，不兼容当前 Phase 1 的 migration metadata 要求。

### Identity

Phase 1.5 不再要求用户为 migration 额外维护 uuid。manifest 和 diff 同时记录：

```ts
type MigrationIdentity = {
  key: string
  kind: "entity" | "relation" | "property" | "dictionary" | "computation"
  namePath: string
  uuid?: string
}
```

规则：

1. `namePath` 是默认 identity，例如 `entity:Product`、`property:Product.price`、`relation:UserOrders`、`dictionary:globalCount`、`computation:property:Product.normalizedEmail:Custom`。
2. 如果用户提供 uuid，记录为辅助线索，但不是必需项。
3. 如果同一模型内出现同 kind 同 `namePath` 的多个对象，diff 生成阶段 fail fast，提示用户用明确名称拆开歧义。
4. rename 在 Phase 1.5 中只作为用户审阅决策记录，不改变 compute-route 执行能力。没有 phase 2 primitive 时，rename 仍会受 physical path / destructive schema gate 阻断。

### Computation Change

```ts
type ComputationChange = {
  kind: "computation"
  id: string
  dataContext: string
  computationType: string
  changeType: "added" | "removed" | "changed" | "state-only" | "possibly-changed" | "unchanged"
  detected: {
    dataDepsChanged?: boolean
    eventDepsChanged?: boolean
    outputSignatureChanged?: boolean
    stateSignatureChanged?: boolean
    functionTextChanged?: boolean
    functionHash?: string
    previousFunctionHash?: string
    hasFunction?: boolean
    hasClosureRisk?: boolean
    needsEventRebuildHandler?: boolean
    needsAsyncCompletionHandler?: boolean
  }
  recommendation: "rebuild" | "ignore" | "needs-review" | "blocked"
  reason: string
}
```

`possibly-changed` 用于函数文本或 callback 线索变化但结构化 deps/output 未变化的情况。执行阶段必须由 approved diff 决定 changed 或 unchanged。

### Decisions

```ts
type MigrationDecision =
  | {
      kind: "computation"
      id: string
      dataContext: string
      decision: "changed" | "unchanged" | "state-only" | "unrebuildable"
      reason: string
    }
  | {
      kind: "event-rebuild-handler"
      dataContext: string
      handlerRef: string
      reason: string
    }
  | {
      kind: "async-completion-handler"
      dataContext: string
      handlerRef: string
      reason: string
    }
  | {
      kind: "destructive-scope"
      dataContext: string
      recordName?: string
      ids: string[]
      reason: string
    }
  | {
      kind: "rename-candidate-reviewed"
      from: string
      to: string
      decision: "not-accepted" | "accepted-for-future-primitive"
      reason: string
    }
```

`handlerRef` 必须能在 `migrate({ handlers })` 中找到同名 handler。approved diff 文件只保存审计信息，不保存函数体。

## Manifest 修改

### 删除旧要求

需要删除：

1. `getInstanceId()` 缺少 uuid 直接抛错的行为。
2. `computationManifestId()` 缺少 computation uuid 直接抛错的行为。
3. `assertVersionedUserFunctions()` 和所有 `version or migrationKey` blocking change。
4. `createComputationManifest()` 中 `version` / `migrationKey` 对 output signature 的影响。

### 新 manifest 内容

`ComputationManifest` 增加 review metadata：

```ts
type ComputationManifest = {
  id: string
  identity: MigrationIdentity
  type: string
  dataContext: string
  deps: ComputationDepManifest[]
  eventDeps: ComputationEventDepManifest[]
  boundStates: BoundStateManifest[]
  outputSignature: string
  stateSignature: string
  structuralSignature: string
  functionSignature?: {
    hasFunction: boolean
    hash?: string
    text?: string
    callbackPaths: string[]
  }
}
```

`structuralSignature` 只包含 computation 类型、dataContext、deps、eventDeps、output record/property、callback presence 和 other non-function structural args。函数文本 hash 不直接进入 `structuralSignature`，否则框架会再次把函数文本变化变成隐式语义判断。

`modelHash` 可以包含 function hash，因为 approved diff 会校验 `toModelHash`，用于防止 diff 过期。但 changed-computation 语义不能只由 `modelHash` 或 function hash 自动决定。

## Diff 生成算法

新增内部函数：

```ts
buildMigrationDiff(controller, previousManifest, nextManifest, schemaPlan, options)
```

步骤：

1. 准备 storage schema plan，读取 previous manifest，创建 next manifest。
2. 比较 records / relations / properties / dictionaries，生成结构化 added / removed / changed changes。
3. 比较 storage metadata，复用 `getStorageBlockingChanges()` 输出 safety blocking changes。
4. 比较 computations：
   - 新增 computation：默认 required decision 为 `changed`，recommendation 为 `rebuild`。
   - structural signature 改变：required decision，recommendation 为 `needs-review`。
   - state signature 改变但 output signature 未变：required decision 可建议 `state-only`。
   - function hash 改变但 structural signature 未变：required decision，changeType 为 `possibly-changed`。
   - function hash 未变但存在 callback / closure：可生成 `hasClosureRisk`，要求用户确认 `unchanged` 或 `changed`。
5. 基于 initial generated decisions 生成 tentative rebuild plan，用于计算 destructive scope、event/async blockers 和下游影响。
6. 把需要人工确认的项写入 `requiredDecisions`，并把框架能安全默认的项写入 `decisions`。
7. 返回 `status: "generated"` 的 diff 文件。

注意：diff 生成阶段允许返回 blocking/safety 信息，不应该因为 required decision 缺失直接抛错；只有 manifest 缺失、identity 歧义、schema introspection 不支持这类无法生成 diff 的情况才抛错。

## Approved Diff 校验

执行前新增：

```ts
validateApprovedDiff(approvedDiff, previousManifest, nextManifest)
```

必须校验：

1. `kind === "interaqt-migration-diff"`。
2. `version === 2`。
3. `status === "approved"`。
4. `fromModelHash === previousManifest.modelHash`。
5. `toModelHash === nextManifest.modelHash`。
6. 每个 `requiredDecision` 都有唯一对应 decision。
7. 每个 decision 都对应当前 diff 中的 change 或 safety item。
8. `handlerRef` 都能在 `options.handlers` 中找到。
9. destructive scope decision 的 ids 与执行前重新计算的 actual scope 完全一致。

任何不匹配都 fail fast，不能降级为旧行为。

## Planner 接入

将当前 `Controller.migrate()` 拆成三层：

1. `prepareMigrationContext()`：创建 states、schemaPlan、previousManifest、nextManifest。
2. `planMigrationFromApprovedDiff()`：把 approved decisions 转成 `changedComputations`、`changedDataContexts`、`rebuildPlan`、blocking changes 和 deletion scope。
3. `executeMigrationPlan()`：复用当前 schema apply、recompute、verification、manifest write、resume 逻辑。

`getChangedComputations()` 不再直接比较 signature 后决定最终 changed set，而是改成：

```ts
getChangedComputationsFromApprovedDiff(previousManifest, nextManifest, approvedDiff)
```

规则：

1. decision 为 `changed` 的 computation 是 seed。
2. 新增 computation 必须是 seed。
3. decision 为 `state-only` 的 computation 只 rebuild state，不传播 output events。
4. decision 为 `unchanged` 的 computation 不是 seed，但如果上游 output 变化影响它，它仍可能作为 downstream affected computation 被 rebuild。
5. decision 为 `unrebuildable` 直接形成 blocking change。

`buildAffectedRebuildPlan()` 可保留拓扑排序和下游传播能力，但输入 seed 必须来自 approved diff，而不是旧 signature 自动判断。

## Event / Async Handler 接入

删除 computation 对象上的 migration-only 要求：

1. 不再要求 event-based computation 定义 `migrationCompute`。
2. 不再要求 async computation 定义 `migrationAsync`。

新增 `MigrationHandlers`：

```ts
type MigrationHandlers = {
  eventRebuild?: Record<string, MigrationEventRebuildHandler>
  asyncCompletion?: Record<string, MigrationAsyncCompletionHandler>
}
```

执行时：

1. `event-rebuild-handler` decision 的 `handlerRef` 指向 `handlers.eventRebuild[handlerRef]`。
2. `async-completion-handler` decision 的 `handlerRef` 指向 `handlers.asyncCompletion[handlerRef]`。
3. handler 缺失或返回非法值时 fail fast。
4. handler 执行上下文仍包含 controller、dataContext、record、mutationEvent、async args 等当前已有信息。

这把 migration 专用逻辑从业务定义移到 migration 执行配置，同时保持显式控制。

## Destructive Scope 接入

删除旧执行入口：

1. `allowDestructiveCleanup`
2. `destructiveScope`

新规则：

1. `generateMigrationDiff({ includeDestructiveScope: true })` 计算 candidate scope。
2. 用户把 candidate scope 复制/保留到 approved diff 的 `destructive-scope` decision。
3. 执行阶段重新计算 actual scope，并与 approved ids 精确比较。
4. 无 matching decision 时，仍然产生 `DestructiveComputedOutputError`。

Transform stale derived row cleanup 也应进入同一 safety / destructive-scope 机制，不能只靠 boolean flag 打开。

## Migration Log

扩展 migration log，至少记录：

1. `approvedDiffHash`
2. `approvedDiffSummary`
3. `decisionCount`
4. `reviewedAt` 或执行时记录的 `approvedAt`

实现上优先在 `__interaqt_migration_log` 增加 nullable JSON/text columns。operation resume 仍保留当前 `__interaqt_migration_operation_log` 机制。

manifest 写入前应把 approved diff hash 作为 operation key 的一部分，避免同一 model hash 但不同 decisions 的失败迁移被错误 resume。

## 实施步骤

### Step 1：类型和 manifest 改造

1. 在 `src/runtime/migration.ts` 增加 `MigrationDiffFile`、`MigrationDecision`、`MigrationDecisionRequirement`、`MigrationHandlers`、新版 `MigrationOptions` 类型。
2. 改造 manifest identity 生成，删除 uuid 必填。
3. 增加 function text 收集与 hash 逻辑，替换当前 `[Function]` 的粗粒度签名。
4. 删除 `assertVersionedUserFunctions()` 及相关 tests。

验收：

1. 不带 uuid 的 entity/property/computation 可以 `setup(true)` 并写 manifest。
2. 不带 `migrationKey/version` 的 function-based computation 可以生成 manifest。

### Step 2：生成 diff API

1. 在 `Controller` 增加 `generateMigrationDiff(options?)`。
2. 抽出 `prepareMigrationContext()`，供 diff generation 和 migrate 共用。
3. 实现 `buildMigrationDiff()`。
4. dry-run diff 不应用 schema、不 recompute、不写 manifest。

验收：

1. 函数文本变化产生 `possibly-changed` 和 required decision。
2. 函数文本不变但有 function callback 时产生 closure risk review 项。
3. event/async/destructive candidate 出现在 safety 和 required decisions 中。

### Step 3：approved diff planner

1. 实现 `validateApprovedDiff()`。
2. 实现 `getChangedComputationsFromApprovedDiff()`。
3. 改造 `Controller.migrate()`，要求 `approvedDiff`。
4. 保留现有 schema/recompute/constraint/manifest 执行顺序。
5. 删除 `hints`、`mode`、`allowDestructiveCleanup`、`destructiveScope` 的执行语义。

验收：

1. 没有 approved diff 的 `migrate()` fail fast。
2. approved diff hash 不匹配 fail fast。
3. 缺少 required decision fail fast。
4. `unchanged` decision 不重算 seed computation。
5. `changed` decision 重算 seed computation 并传播下游。

### Step 4：handlers 和 destructive scope

1. 将 event rebuild 从 computation object 的 `migrationCompute` 改为 approved diff + handlers。
2. 将 async completion 从 computation object 的 `migrationAsync` 改为 approved diff + handlers。
3. 将 destructive scope 从 options 改为 approved diff decisions。
4. 将 Transform stale cleanup 纳入 destructive scope 校验。

验收：

1. event-based computation 没有 handler decision 时 blocked。
2. event handler decision 存在但 runtime handler 缺失时 fail fast。
3. async handler 可以完成 `ComputationResult.async()` 的最终值写入。
4. destructive scope ids 不一致时 fail fast。

### Step 5：审计日志和 resume

1. 扩展 migration log schema。
2. `beginMigration()` 接收 modelHash 和 approvedDiffHash。
3. resume 查询同时匹配 modelHash 和 approvedDiffHash。
4. 成功/失败日志记录 decisions summary。

验收：

1. 相同 modelHash 但不同 approved diff 不会错误复用 failed migration。
2. migration 成功后可以从 log 查到 approved diff hash 和 decision summary。

### Step 6：导出和文档

1. `src/runtime/index.ts` 已 re-export `migration.ts`，新增类型自然导出。
2. 更新 `agent/skill/interaqt-migration.md`，删除 `migrationKey/version` 生命周期说明，改成 two-step review workflow。
3. 更新错误信息，统一指向 `generateMigrationDiff()` 和 approved diff。

## 测试计划

在 `tests/runtime/migration.spec.ts` 中替换旧 metadata 测试，并新增覆盖：

1. `generateMigrationDiff()` 在无 uuid / 无 `migrationKey` 的模型上成功。
2. 函数文本变化生成 `possibly-changed` required decision。
3. approved diff 标记 `changed` 后只重算该 computation 和受影响 downstream。
4. approved diff 标记 `unchanged` 后 seed computation 不重算，但 downstream 在上游变化时仍按依赖传播。
5. state-only decision 只 rebuild state，不传播 output events。
6. `migrate()` 缺少 approved diff fail fast。
7. diff `fromModelHash` / `toModelHash` 过期 fail fast。
8. required decision 缺失 fail fast。
9. event-based computation 通过 external handler 完成 migration。
10. async computation 通过 external handler 完成 migration。
11. destructive `_isDeleted_` scope 必须由 approved diff 精确确认。
12. Transform stale derived output cleanup 进入 destructive scope 校验。
13. physical path move 即使 approved diff 标记 unchanged 仍 blocked。
14. ownership proof gate 仍 blocked。
15. migration log 记录 approved diff hash，resume 按 approved diff hash 匹配。

PostgreSQL 集成测试需要更新 `tests/runtime/postgresqlMigration.spec.ts`：

1. 使用 generated diff + approved diff 执行真实 PostgreSQL migration。
2. schema operation-log resume 增加 approved diff hash 匹配断言。

## 风险与处理

1. **去掉 uuid 必填后 identity 可能歧义**：同一 manifest 内用 `namePath` 检测重复，生成 diff 前 fail fast，不猜测。
2. **用户把 changed 误标为 unchanged**：这是人工审阅决策的责任边界。框架记录 function hash、function text changed、closure risk 和 decision reason，供代码评审和 CI 审计。
3. **函数文本 hash 受格式化影响**：这是预期行为。格式化变化会进入 review，而不是自动触发或自动跳过 migration。
4. **approved diff 文件过期**：`fromModelHash` 和 `toModelHash` 强校验。
5. **approved diff 成为绕过安全 gate 的通道**：approved diff 只能决定语义 changed/unchanged 和审计确认；physical path、ownership、async/event handler、destructive scope 精确匹配仍强制执行。

## 最终验收标准

1. 用户可以不写 `version`、`migrationKey`、migration-specific uuid、`migrationCompute`、`migrationAsync` 完成 Phase 1 compute-route migration。
2. migration 执行必须经过 approved diff；没有人工审阅输入不能直接改数据库。
3. `Function.toString()` 只影响 diff 线索，不直接决定重算。
4. Phase 1 已有安全能力不回退。
5. 所有旧的 metadata-required 测试被新的 two-step review 测试替代，并通过 `npm run test:runtime`。
