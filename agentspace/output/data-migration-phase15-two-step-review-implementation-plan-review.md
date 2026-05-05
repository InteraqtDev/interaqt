# Data Migration Task 2 追加任务1 Review

## 结论

对 `agentspace/output/data-migration-phase15-two-step-review-implementation-plan.md` 做完复核后，没有发现需要推翻方案的致命错误，也没有发现违反 Task 2 约束的设计方向。

当前实施计划正确继承了 `agentspace/output/data-migration-two-step-diff-review-design.md` 的核心判断：Phase 1.5 不是让框架自动猜测业务语义，而是把 migration 拆成“生成可审阅 diff”和“基于 approved diff 执行”两步。函数文本、函数 hash、storage diff、event/async/destructive 线索只进入审阅材料；真正是否重算、是否允许 destructive scope、是否提供 event/async handler，必须来自人工确认后的 approved diff。

尤其重要的是，计划按 Task 2 要求没有保留旧 API 兼容：不继续要求或支持用户在业务定义中维护 `version`、`migrationKey`、migration-only uuid、`migrationCompute`、`migrationAsync`，也不继续把 `allowDestructiveCleanup` / `destructiveScope` 作为主要执行入口。这一点与原设计文档中“可继续支持旧 shortcut”的描述不同，但符合 Task 2 prompt 明确追加的“不要做任何兼容，直接做完全修改原代码的方案”。

## Review 范围

本次 review 重点检查：

1. 实施计划是否存在致命错误，导致 two-step review 不能安全接入当前 Phase 1 compute-route migration。
2. 实施计划是否违反 Task 2 的约束：只考虑 Phase 1.5，不引入 Phase 2 primitive 执行；不做旧 API 兼容；去掉业务定义中的 migration metadata 要求；继续保留 Phase 1 安全 gate。
3. 实施计划是否与当前 runtime/migration 现状相符，尤其是 manifest、changed computation 判断、event/async rebuild、destructive output、migration log/resume。

对照的当前实现关键点包括：

1. `createMigrationManifest()` 目前依赖 uuid，并把 `version` / `migrationKey` 放进 computation signature。
2. `getChangedComputations()` 目前直接比较旧/新 computation signature，函数语义变化需要用户提前 bump metadata。
3. `getRecomputeBlockingChanges()` 目前通过 `assertVersionedUserFunctions()`、`migrationCompute`、`migrationAsync`、`allowDestructiveCleanup` 做 blocking gate。
4. `Controller.migrate()` 目前一次性完成 plan、dry-run、执行、manifest write，并只用 `modelHash` 参与 migration operation resume。
5. `recomputeChangedComputations()` 已经有 rebuild state/output/propagation 的分离基础，但 handler 来源和 destructive scope 来源仍是旧 options/computation object。

## 通过项

### 1. 符合 two-step review 的核心设计

计划新增 `controller.generateMigrationDiff()` 和强制 `migrate({ approvedDiff })`，并把 `migrate()` 裸执行改为 fail fast。这符合设计文档中“Generated Migration Diff 是 proposal，Approved Migration Diff 才是执行意图”的核心原则。

计划也明确 `Function.toString()` 只产生 `functionHash`、`functionTextChanged`、`hasClosureRisk` 等 review 线索，不进入 `structuralSignature`，不会自动决定 changed/unchanged。这避免了把格式化变化或函数文本变化误当成生产语义真相。

### 2. 正确移除了业务定义中的 migration metadata 要求

计划要求删除：

1. 缺少 uuid 直接抛错的 manifest identity 行为。
2. computation 缺少 uuid 直接抛错的行为。
3. `assertVersionedUserFunctions()` 和 `version` / `migrationKey` blocking change。
4. computation object 上的 `migrationCompute` / `migrationAsync` 要求。

这些改动正是 Task 2 的核心目标：业务定义只描述业务模型和响应式计算，不再提前塞入 migration 审阅信息。

### 3. 没有引入 Phase 2 primitive 执行

计划允许 diff 中出现 rename/copy/backfill 相关候选或 future primitive 审阅记录，但明确 Phase 1.5 不执行 rename/copy/merge/split 优化。事实数据 physical path move、schema destructive change 等仍然受 Phase 1 gate 阻断。

这符合 Task 2 “先不要考虑任何 phase 2 内容”的约束。这里的候选信息只是审阅材料和后续阶段铺垫，不是执行能力。

### 4. 保留了 Phase 1 安全 gate

计划明确 approved diff 不能绕过：

1. physical path move gate。
2. ownership proof gate。
3. event rebuild handler gate。
4. async completion handler gate。
5. destructive computed output scope 精确确认。

这与当前实现的危险点一致。当前 `_isDeleted_` computed property 会通过 `Controller.applyResult()` 删除 host record，Transform stale derived output 也可能删除派生记录；计划把这些都收敛到 approved diff 的 destructive scope decision，并在执行前重新计算 actual scope 精确比较，是正确方向。

### 5. Approved diff planner 接入方向正确

计划把 `Controller.migrate()` 拆成：

1. `prepareMigrationContext()`。
2. `planMigrationFromApprovedDiff()`。
3. `executeMigrationPlan()`。

这能最大限度复用当前 Phase 1 已经完成的 schema apply、recompute、verification、manifest write、resume 流程，同时把 changed computation seed 从旧 signature 自动比较改为 approved decision。`unchanged` 不是 seed，但仍可能因为上游 output 变化成为 downstream affected computation；`state-only` 只重建 state 不传播 output event。这些规则与 interaqt 的响应式传播语义一致。

### 6. Migration log/resume 风险被识别

计划要求记录 `approvedDiffHash`、decision summary，并让 resume 同时匹配 `modelHash` 和 `approvedDiffHash`。这是必要补强。

当前实现只用 `nextManifest.modelHash` 开始 migration，并用 `manifest:current:${nextManifest.modelHash}` 作为 operation key。如果相同 model hash 下 approved decisions 不同，只按 model hash resume 可能复用错误的失败迁移状态。计划已经覆盖这个风险。

## 非致命但实现时必须守住的边界

以下不是当前实施计划的致命错误，但落地时不能弱化。

### 1. Diff 生成阶段不能因为 required decision 缺失而抛错

`generateMigrationDiff()` 的价值就是把未决项收集给用户审阅。函数变化、closure risk、event rebuild、async completion、destructive scope 等应该进入 `requiredDecisions` 和 `safety`，而不是在 diff 生成阶段复用旧 blocking 逻辑直接失败。

只有无法生成可信 diff 的情况才应该 fail fast，例如缺少 previous manifest、identity 在同一模型内歧义、storage introspection 不可用。

### 2. Approved diff 校验必须基于重新生成的当前 diff

执行阶段不能只校验 approved diff 的 hash 字段和 status。必须重新准备 previous manifest、next manifest、schema plan，并重新生成当前 required decisions / safety scope，再检查：

1. 每个 required decision 都有唯一 approved decision。
2. 每个 approved decision 都对应当前 change 或 safety item。
3. destructive scope ids 与执行前 actual scope 完全一致。
4. handlerRef 能在 `options.handlers` 中找到。

否则 approved diff 可能成为绕过当前安全 gate 的输入。

### 3. Handler 接入要贯穿 full recompute 和 incremental propagation

当前 `MigrationScheduler` 在 full recompute 和 event-based incremental propagation 两条路径都会读取 computation object 上的 `migrationCompute`，async result 也通过 computation object 上的 `migrationAsync` 完成。实现 Phase 1.5 时，不能只改 blocking check，还必须把 external handlers 传到：

1. event-based full recompute。
2. event-based incremental recompute。
3. async `ComputationResultAsync` resolve。
4. Transform/entity/relation output recompute 中可能产生的 async result。

否则 plan 层看似接受了 approved handler，执行层仍会抛旧的 `migrationCompute` / `migrationAsync` 缺失错误。

### 4. `modelHash` 包含 function hash 后，changed set 仍不能从 hash 自动推导

计划允许 `modelHash` 包含 function hash，用于判断 approved diff 是否过期。这是合理的。但实现时必须保持边界：`modelHash` 变化只能触发“需要 migration review”，不能直接成为 changed computation seed。

changed seed 必须来自 approved diff decision。格式化导致 function hash 变化时，用户可以标记 `unchanged`，执行阶段只写新 manifest，不应该重算该 computation。

### 5. Manifest identity 改为 namePath 后要显式检测同模型歧义

去掉 uuid 必填后，默认 identity 变成 `namePath`。这符合降低 migration metadata 的目标，但必须在单个 next manifest 内检测重复：

1. 同名 entity/relation/property/dictionary。
2. 同一 dataContext 上多个同类型 computation 无法区分。
3. 匿名或缺少稳定 name 的 computation。

发现歧义时 diff 生成应 fail fast，不能退回随机 uuid、数组顺序或 constructor 名称猜测。

### 6. `setup({ migrate: true })` 必须彻底移除旧语义

计划已经说 `setup({ migrate: true })` 不再支持。实现时要确保 `Controller.setup()` 不再把 boolean `true` 转成空 migration options 调用 `migrate({})`。缺少 approved diff 应给出明确错误，提示先生成 diff 并审阅。

## 与原设计文档的差异判断

实施计划相对 `data-migration-two-step-diff-review-design.md` 有几处主动收紧：

1. 原设计提到可以保留 `migrate({ dryRun: true })` 和 `migrationKey` shortcut；实施计划删除旧入口和旧 shortcut。
2. 原设计把 CLI 列为后续步骤；实施计划把 CLI 明确列为非目标，只交付 runtime API。
3. 原设计 diff `version` 示例为 `1`；实施计划使用 `version: 2` 表示 Phase 1.5 新语义。

这些差异不构成问题。Task 2 prompt 已明确要求“不做任何兼容，直接做完全修改原来代码的方案”，并且当前 package 没有现成 CLI 基础，先完成 runtime API 是合理收敛。

## 最终判断

`data-migration-phase15-two-step-review-implementation-plan.md` 可以通过 Task 2 追加任务1的 review。它没有致命错误，也没有违反 Task 2 的注意事项。

建议后续进入实现时按计划的 Step 1 到 Step 5 严格拆分验证：先让无 uuid / 无 `migrationKey` manifest 与 diff 生成通过，再接入 approved diff planner，最后处理 event/async handlers、destructive scope、log/resume。每一步都要用现有 `tests/runtime/migration.spec.ts` 和 `tests/runtime/postgresqlMigration.spec.ts` 替换旧 metadata 测试，避免旧 Phase 1 metadata 要求残留。
