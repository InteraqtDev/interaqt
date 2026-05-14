# Interaqt Migration 源码问题排查

## 背景

本次排查只阅读 `/Users/camus/Work/interqat/interaqt/src`，没有修改 interaqt 源码。触发排查的现象是：业务侧希望把已有实体的字段写入改为 interaction + computation 后，migration dry-run 报 `destructive-computed-output`，即使 approved decision 已经使用 `state-only`，rebuild plan 也显示 `rebuildOutput: false`。

这不是某个业务模型的孤立问题，而是 migration 框架在“决策语义 -> rebuild plan -> safety gate”之间存在通用语义断层。

## 问题 1：`state-only` 计划仍触发输出替换 destructive gate

源码位置：`/Users/camus/Work/interqat/interaqt/src/runtime/migration.ts`

相关逻辑：

- `getChangedComputationsFromApprovedDiff()` 会把 `decision: "state-only"` 加入 `stateOnlyIds`。
- `buildAffectedRebuildPlan()` 会根据 `stateOnlyIds` 生成 rebuild item，并设置：
  - `rebuildState: true`
  - `rebuildOutput: false`
  - `propagateOutputEvents: false`
- 但 `getRecomputeBlockingChanges()` 后续只检查 computation id 是否在 rebuild plan 中，不检查该 item 的 `rebuildOutput`。

具体结果是：一个明确不会重建输出的 entity/relation computation，仍然被当作“要替换 entity/relation 输出”来检查 exclusive output ownership，最终报：

```text
destructive-computed-output: entity/relation output replacement requires exclusive output ownership proof in the previous manifest
```

这违反了 `state-only` decision 的语义。`state-only` 的核心含义就是“只迁移绑定状态，不替换 computed output，不传播 output events”。如果 safety gate 不读取 `rebuildOutput`，那么它检查的是“computation 在计划内”，而不是“输出是否真的会被替换”。

建议修改：

1. 在 `getRecomputeBlockingChanges()` 中建立 `rebuildPlan` map。
2. 对 destructive computed output、entity/relation full compute contract、source/index state 等输出重建相关检查，只在对应 rebuild item 的 `rebuildOutput !== false` 时执行。
3. async handler 检查和 event rebuild handler 检查也应区分 state rebuild 与 output rebuild：
   - 如果 `state-only` 不执行 output recompute，就不应该要求 event rebuild handler。
   - 如果框架后续确实需要 handler 来重建 state，则应引入独立的 state rebuild handler 语义，而不是复用 output rebuild handler。

示意方向：

```ts
const rebuildById = new Map(rebuildPlan.map(item => [item.computationId, item]))

// inside loop
const rebuildItem = rebuildById.get(computationId)
const rebuildsOutput = rebuildItem?.rebuildOutput !== false

if ((isEntityOrRelation) && rebuildsOutput && oldManifest && !hasExclusiveOutputOwnershipProof(...)) {
  blockingChanges.push(...)
}
```

这里的关键不是让当前 migration 通过，而是让 safety gate 与 approved decision 的语义一致：只有真正会破坏或替换输出时，才应该触发 destructive output gate。

## 问题 2：新增 computation 的校验信息与实际支持的 decision 不一致

源码位置：`getChangedComputationsFromApprovedDiff()`

当前代码实际接受：

- `decision: "changed"`
- `decision: "state-only"`

两者都会被放入 `changedComputations`，因此新增 computation 并非只能使用 `changed`。但错误信息写的是：

```text
New computation requires approved changed decision
```

这会误导 diff reviewer，以为新增 computation 不能使用 `state-only`。从现有实现看，更准确的约束应是：

```text
New computation requires an approved changed or state-only decision
```

建议修改：

- 更新错误信息，使其与实际逻辑一致。
- 更进一步，框架可以在 `requiredDecisions` 生成阶段根据 computation 类型给出更准确的推荐：
  - 新增 entity/relation output computation：默认推荐 `changed`。
  - 新增 property StateMachine 且 output signature 不变：可推荐 `state-only`。
  - 新增 computation 但不需要 output rebuild 的场景，应允许 reviewer 明确选择 `state-only`，且后续 safety gate 应尊重它。

## 问题 3：移除旧 fact record 只有 blocking，没有可审计的安全处理路径

源码位置：`getStorageBlockingChanges()`

当前逻辑对 old manifest 中存在、新 manifest 中不存在的 storage record 一律生成：

```text
unsupported-destructive-schema-change: fact record was removed from the new schema
```

这个保守策略本身合理，但框架缺少一个通用、可审计的后续路径。实际模型演进中，旧 fact record 可能来自：

- 被废弃的 custom EventSource。
- 迁移到标准 InteractionEventEntity 后留下的旧事件表。
- 已经为空、无消费者、无新模型引用的历史 fact table。

现在 reviewer 即使确认旧表为空，也没有 diff-level decision 可以表达“允许删除这个空 fact record storage”。`destructiveScopes` 主要面向 computed output/host records 的删除范围，而不是 fact storage record 的退役。因此用户只能：

- 保留一个 legacy entity 让 manifest 不再删除表。
- 或绕过框架手工处理数据库。

前者污染业务模型，后者违反 migration 工作流。

建议修改：

1. 给 storage record removal 引入独立 decision，例如：

```ts
{
  kind: "storage-retirement",
  logicalPath: "SomeOldEvent",
  oldPhysicalPath: "SomeOldEvent",
  requireEmpty: true,
  reason: "old fact event source retired after migration to InteractionEventEntity"
}
```

2. dry-run 阶段查询旧表行数：
   - `requireEmpty: true` 且行数为 0：允许生成 drop plan。
   - 行数不为 0：继续 blocking，并报告 count。
3. execution 阶段再次检查行数，避免 dry-run 后出现新写入。
4. 所有这类动作进入 migration log，保持审计性。

这比把旧 fact entity 永久留在业务定义里更通用，也符合 migration 文档“不手工改数据库绕过 interaqt migration”的原则。

## 问题 4：dry-run API 的“成功返回”容易被误读

源码位置：`Controller.migrate()`

当前 `dryRun: true` 时，即使 `plan.blockingChanges` 非空，也会直接 return plan；只有非 dry-run 才会 throw。这个 API 设计本身可以成立，因为调用方可以检查 plan。但如果上层脚本打印“Dry run passed”后再检查 `blockingChanges`，用户会看到自相矛盾的日志。

建议修改方向：

- 保持 `dryRun` 返回 plan，但提供明确字段：
  - `ok: boolean`
  - `blockingChanges: string[]`
- 或提供 helper：`assertMigrationPlanAllowed(plan)`。
- 文档中明确 dry-run returned 不等于 pass，`blockingChanges.length === 0` 才是 pass。

这不是本次 migration 的根因，但会放大排查成本。

## 建议的最小框架改动优先级

1. 修复 `getRecomputeBlockingChanges()`：所有 output destructive gate 必须基于 rebuild item 的 `rebuildOutput` 判断，而不是只看 computation 是否在 rebuild plan 中。
2. 修正新增 computation 的错误信息和 decision 推荐，使 `changed/state-only` 的语义一致贯穿 diff、approval、planning、safety。
3. 为 retired fact storage 增加可审计 decision，而不是一律 blocking 或要求业务模型保留 legacy entity。
4. 改善 dry-run plan 的 API/日志语义，减少“dry run passed 但 blocking”的误解。

## 结论

当前问题的本质不是业务代码需要再绕一层兼容逻辑，而是 migration 框架缺少两个通用能力：

1. safety gate 没有完整尊重 rebuild plan 中的 `rebuildOutput: false`。
2. fact storage retirement 缺少可审计的安全删除路径。

修复应发生在 interaqt migration 框架层，而不是通过业务模型长期保留废弃实体、手工改数据库，或把业务逻辑改回非响应式写入。
