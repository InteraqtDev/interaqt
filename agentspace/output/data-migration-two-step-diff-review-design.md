# Data Migration Two-Step Diff Review Design

## 结论

当前 Phase 1 migration 已经具备计算路线主能力，但开发者体验仍偏重：稳定 identity、`migrationKey`、`migrationCompute`、destructive scope 等都需要用户提前在业务定义里手动表达。

更友好的方向是把 migration 拆成两步：

1. **生成可审阅 diff**：框架用旧 manifest 和当前 definitions 做深度 diff，包括函数 `toString()` diff，产出一个可编辑的数据结构。
2. **使用用户确认后的 diff 执行 migration**：用户可以在应用或 CLI 中把 diff 写成文件，人工修正语义判断后再交给框架执行真正 migration。

这个方案的关键不是让框架用 `toString()` 自动判断语义，而是把 `toString()` 降级为“线索”。最终 migration 仍由用户确认后的显式 diff 决定，因此符合 interaqt “explicit control” 原则。

## 设计目标

1. **降低用户心智负担**  
   用户不必在每个 computation 上预先维护 `migrationKey`，也不必提前知道所有可能的迁移标记。

2. **保持生产安全**  
   框架不自动推断 rename/copy/merge/split，也不把 function text 变化直接当成最终语义判断。

3. **让语义决策可审计**  
   用户对每个差异的确认、覆盖、忽略、rename、destructive scope 都写入 diff 文件，并随 migration log 保存。

4. **为第二阶段 primitive 做铺垫**  
   rename/copy/backfill 等优化不再藏在运行时猜测中，而是由用户在 approved diff 中显式声明。

## 非目标

1. 不用 `Function.toString()` 作为生产语义真相。
2. 不自动识别 rename。
3. 不绕过 physical path gate、ownership proof、destructive gate、async completion gate。
4. 不替代数据库中的 migration manifest。manifest 仍是旧模型与旧 storage layout 的事实来源。

## 当前问题

当前实现要求用户在模型定义里显式提供：

1. 稳定 uuid / migration identity。
2. function-based computation 的 `migrationKey` 或 `version`。
3. event-based computation 的 `migrationCompute`。
4. async computation 的 `migrationAsync`。
5. destructive migration 的 `destructiveScope`。

这些信息对 migration 很重要，但大多不是业务逻辑本身。对开发者来说，最常见的困扰是：

1. 只是格式化代码，却需要处理 computation 版本。
2. closure/helper 变化了，框架无法发现，需要用户自己记得 bump。
3. rename 场景需要表达，但不应该靠框架猜。
4. destructive scope 手写 id 容易出错。

两步式 diff review 把这些决策从“散落在业务定义中的提前标注”改成“migration 前集中审阅确认”。

## 核心概念

### Migration Manifest

数据库中保存的上一次成功模型快照。它仍然是 migration 的起点，记录：

1. model hash。
2. records / relations / properties。
3. computations。
4. storage physical schema。
5. ownership proof。
6. bound state schema。

### Generated Migration Diff

框架根据旧 manifest 和当前 definitions 生成的观察结果。它是 proposal，不是最终 migration 意图。

它可以使用：

1. 稳定 identity diff。
2. dataContext / name / path diff。
3. storage physical schema diff。
4. structured computation dependency diff。
5. function `toString()` diff。
6. function hash。
7. callback presence diff。
8. state schema/default diff。

### Approved Migration Diff

用户确认和编辑后的 diff。真正执行 migration 时，框架只信任 approved diff 中的语义决策。

用户可以声明：

1. 某个 computation 语义变了。
2. 某个 computation 语义没变。
3. 某个函数文本没变，但 closure/helper 语义变了。
4. 某个实体/属性/关系是 rename。
5. 某个 destructive scope 已确认。
6. 某个 async computation 有迁移专用完成策略。
7. 某个 event-based computation 有 migration compute 策略。

## 推荐 API 形态

### 生成 diff

```ts
const diff = await controller.generateMigrationDiff()
```

或：

```ts
const diff = await controller.migrate({ dryRun: true, generateDiff: true })
```

CLI 形式：

```bash
interaqt migrate diff --out migration.diff.json
```

### 用户审阅并编辑 diff

应用或 CLI 将 diff 写成文件：

```bash
interaqt migrate diff --out migration.diff.json
```

用户编辑后得到：

```bash
migration.approved.json
```

### 执行 approved diff

```ts
await controller.migrate({
  approvedDiff,
})
```

CLI：

```bash
interaqt migrate apply migration.approved.json
```

## 数据结构草案

### 顶层结构

```ts
type MigrationDiffFile = {
  version: 1
  kind: 'interaqt-migration-diff'
  fromModelHash: string
  toModelHash: string
  generatedAt: string
  generatorVersion: string
  status: 'generated' | 'approved'
  summary: MigrationDiffSummary
  changes: MigrationChange[]
  decisions: MigrationDecision[]
  safety: MigrationSafetyReview
}
```

### Summary

```ts
type MigrationDiffSummary = {
  addedRecords: number
  removedRecords: number
  changedRecords: number
  addedProperties: number
  removedProperties: number
  changedProperties: number
  addedComputations: number
  changedComputations: number
  stateOnlyComputations: number
  physicalPathMoves: number
  destructiveCandidates: number
  asyncCandidates: number
}
```

### Change

```ts
type MigrationChange =
  | RecordChange
  | PropertyChange
  | RelationChange
  | ComputationChange
  | StorageChange
  | ConstraintChange
  | OwnershipChange
```

### Computation Change

```ts
type ComputationChange = {
  kind: 'computation'
  id: string
  dataContext: string
  changeType: 'added' | 'removed' | 'changed' | 'state-only' | 'possibly-changed'
  detected: {
    dataDepsChanged?: boolean
    eventDepsChanged?: boolean
    stateSignatureChanged?: boolean
    outputSignatureChanged?: boolean
    functionTextChanged?: boolean
    functionTextUnchanged?: boolean
    functionHash?: string
    previousFunctionHash?: string
    hasClosureRisk?: boolean
  }
  recommendation: 'rebuild' | 'ignore' | 'needs-review' | 'blocked'
  reason: string
}
```

`functionTextChanged` 只表示检测线索，不表示语义一定变化。

### Decision

```ts
type MigrationDecision =
  | {
      kind: 'computation'
      id: string
      dataContext: string
      decision: 'changed' | 'unchanged' | 'state-only' | 'unrebuildable'
      reason: string
    }
  | {
      kind: 'rename'
      from: string
      to: string
      renameType: 'entity' | 'relation' | 'property' | 'dictionary'
      reason: string
    }
  | {
      kind: 'destructive-scope'
      dataContext: string
      recordName?: string
      ids: string[]
      reason: string
    }
  | {
      kind: 'async-contract'
      computationId: string
      strategy: 'migrationAsync' | 'external-handler'
      reason: string
    }
  | {
      kind: 'event-rebuild-contract'
      computationId: string
      strategy: 'migrationCompute' | 'external-handler'
      reason: string
    }
```

## 示例 diff 文件

```json
{
  "version": 1,
  "kind": "interaqt-migration-diff",
  "fromModelHash": "old-model-hash",
  "toModelHash": "new-model-hash",
  "generatedAt": "2026-05-05T00:00:00.000Z",
  "generatorVersion": "1",
  "status": "approved",
  "summary": {
    "addedRecords": 1,
    "removedRecords": 0,
    "changedRecords": 0,
    "addedProperties": 2,
    "removedProperties": 0,
    "changedProperties": 0,
    "addedComputations": 1,
    "changedComputations": 1,
    "stateOnlyComputations": 0,
    "physicalPathMoves": 0,
    "destructiveCandidates": 0,
    "asyncCandidates": 0
  },
  "changes": [
    {
      "kind": "computation",
      "id": "property:Product.normalizedEmail",
      "dataContext": "property:Product.normalizedEmail",
      "changeType": "possibly-changed",
      "detected": {
        "functionTextChanged": true,
        "dataDepsChanged": false,
        "stateSignatureChanged": false
      },
      "recommendation": "needs-review",
      "reason": "Function text changed; semantic meaning must be confirmed by user."
    }
  ],
  "decisions": [
    {
      "kind": "computation",
      "id": "property:Product.normalizedEmail",
      "dataContext": "property:Product.normalizedEmail",
      "decision": "changed",
      "reason": "Normalization now lowercases unicode using a new helper."
    }
  ],
  "safety": {
    "blockingChanges": [],
    "destructiveScopes": []
  }
}
```

## 执行规则

### Hash 校验

执行 approved diff 前必须校验：

1. `fromModelHash` 等于数据库当前 manifest hash。
2. `toModelHash` 等于当前 definitions 生成的新 manifest hash。
3. diff 文件 `version` 兼容当前框架。
4. diff 文件 `status` 必须是 `approved`。

任何不匹配都必须 fail fast。不能把旧 diff 套到新代码或新数据库上。

### Decision 覆盖规则

对每个 generated change：

1. 如果框架能确定安全行为，可以自动给出默认 decision。
2. 如果存在函数文本变化、closure 风险、event-based 重建、async completion、destructive cleanup，必须要求用户 decision。
3. 如果用户删除了 required decision，执行阶段 fail fast。

### Function `toString()` 规则

`toString()` 只用于：

1. 标记 `functionTextChanged`。
2. 计算 review hash。
3. 提示用户某个 callback 可能发生变化。

不能用于：

1. 自动判定语义变化。
2. 自动判定语义未变化。
3. 自动生成生产 migration intent。

### Rename 规则

框架可以展示候选 rename，但不能自动接受。

例如框架可以输出：

```json
{
  "kind": "rename-candidate",
  "from": "entity:Worker",
  "to": "entity:Staff",
  "confidence": "low",
  "reason": "Similar properties and no overlapping identity."
}
```

但真正执行必须来自用户 decision：

```json
{
  "kind": "rename",
  "from": "entity:Worker",
  "to": "entity:Staff",
  "renameType": "entity",
  "reason": "Business rename from Worker to Staff."
}
```

如果没有用户 decision，则按删除 + 新增处理，并受 Phase 1 blocking gate 限制。

### Destructive Scope 规则

Generated diff 可以包含候选 deletion scope：

```json
{
  "kind": "destructive-scope",
  "dataContext": "property:User._isDeleted_",
  "recordName": "User",
  "ids": ["1", "2"]
}
```

用户确认后，执行阶段必须重新计算 actual scope，并与 approved scope 完全一致。否则 fail fast。

### Physical Path Move 规则

即使 approved diff 标记 computation unchanged，也不能绕过 physical path gate。

事实数据 physical path move 默认仍是 blocking：

1. fact property table/field move。
2. fact relation source/target physical field move。
3. fact record table move。
4. fact property type/collection change。

只有用户提供明确 primitive/handler 时，后续阶段才允许执行。

## 与当前 Phase 1 的关系

当前 Phase 1 直接在运行时用 manifest diff 生成 `MigrationPlan`。

两步式方案可以作为 Phase 1.5：

1. 保留现有 `migrate({ dryRun: true })`。
2. 新增 `generateMigrationDiff()`，复用当前 manifest/diff/schema/rebuild 逻辑。
3. 新增 `migrate({ approvedDiff })`，把用户 decisions 输入现有 planner。
4. 当前 `migrationKey` 仍可继续支持，作为 approved diff 的快捷声明。

也就是说，两步式方案不是推翻现有实现，而是把当前隐式 plan 生成前面加一层“可审阅语义决策”。

## 开发者工作流

推荐流程：

```bash
interaqt migrate diff --out migration.diff.json
```

用户打开文件，确认：

1. 哪些 computation changed。
2. 哪些 computation unchanged。
3. 哪些 rename 是真实 rename。
4. 哪些 destructive scope 被允许。
5. 哪些 async/event computation 有迁移策略。

然后执行：

```bash
interaqt migrate apply migration.diff.json
```

运行时 API：

```ts
const diff = await controller.generateMigrationDiff()
await fs.promises.writeFile('migration.diff.json', JSON.stringify(diff, null, 2))

const approvedDiff = JSON.parse(await fs.promises.readFile('migration.diff.json', 'utf8'))
await controller.migrate({ approvedDiff })
```

## 用户体验收益

1. 用户不用预先给每个函数 computation 写 `migrationKey`。
2. 函数格式化变化可以在 diff 文件中标记为 unchanged。
3. closure/helper 变化可以在 diff 文件中标记为 changed。
4. rename 从“框架猜测”变成“用户显式声明”。
5. destructive scope 从手写参数变成 dry-run 生成后确认。
6. migration 决策集中在一个审阅文件中，更适合代码评审和 CI。

## 风险与缓解

### 风险：用户错误标记 unchanged

如果用户把真实变化标成 unchanged，derived data 可能不会重算。

缓解：

1. diff 文件记录 function text hash 和 detected changes。
2. CI 可以要求 reviewer 审批。
3. 可选 verification hook 对关键 computed output 抽样重算。

### 风险：diff 文件过期

用户生成 diff 后又改了代码。

缓解：

1. `toModelHash` 强校验。
2. 当前 manifest hash 强校验。

### 风险：approved diff 变成绕过安全 gate 的通道

缓解：

1. approved diff 只能影响语义 decisions。
2. physical path gate、ownership proof、destructive scope、async completion gate 仍然强制执行。
3. 所有 overrides 进入 migration log。

## 实施步骤建议

### Step 1：生成 diff 文件

新增：

```ts
controller.generateMigrationDiff(options?)
```

输出 `MigrationDiffFile`，包含当前 dry-run plan、function text hash、change recommendations。

### Step 2：approved diff 输入 planner

新增：

```ts
controller.migrate({ approvedDiff })
```

把 decisions 转换为：

1. forced changed computations。
2. forced unchanged computations。
3. destructive scope。
4. async/event migration contracts。
5. future rename primitives。

### Step 3：审计日志

migration 成功后，把 approved diff hash 和 decisions 写入 migration log。

### Step 4：CLI

新增：

```bash
interaqt migrate diff --out migration.diff.json
interaqt migrate apply migration.diff.json
```

CLI 不做额外猜测，只是调用 runtime API。

## 最终判断

两步式 diff review 是更好的开发者体验方向。

它允许框架充分利用深度 diff 和 `function.toString()` 来发现变化线索，同时仍然把最终语义判断交给用户显式确认。这样既降低了手写 migration metadata 的负担，又不牺牲生产 migration 的安全性。

