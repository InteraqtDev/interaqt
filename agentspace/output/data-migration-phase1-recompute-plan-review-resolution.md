# Data Migration Task 1 追加任务2 Review Resolution

## 处理结论

已逐条核实 `agentspace/output/data-migration-phase1-recompute-plan-review.md` 中的 3 条高风险意见。结论：3 条意见均成立，已修复到 `agentspace/output/data-migration-phase1-recompute-plan.md`；没有发现需要驳回的意见。

这次修订只补齐第一阶段计算路线的可落地约束，没有引入第二阶段 rename/copy/merge/split 加速实现，也没有为用户写错的模型定义增加兜底行为。

## 逐条处理

### 1. 物理布局变化需要作为 migration bootstrap 的硬门禁

采纳。

源码核实：`MonoSystem.setup()` 会基于新 definitions 构建 `DBSetup`、创建 constraints/sequence，并把新的 `EntityToTableMap` 注入 `EntityQueryHandle`。`DBSetup.joinTables()`、`combineRecordTable()`、filtered record 的 `resolvedBaseRecordName`，以及 `EntityToTableMap.getTableAliasAndFieldName()` 都会影响逻辑 record/property/link 到物理 table/field 的映射。如果事实数据仍在旧位置，却让新 query handle 按新 map 读写，就会读不到或写错数据。

已修订：

1. `1` 增加目标：新 runtime 读写业务数据前必须验证未重建事实数据物理位置没有移动。
2. `5.2` 增加 `blockingChanges`，要求 `StorageSchemaDiffer` 比较逻辑数据的旧/新 physical path。
3. `5.2` 明确事实 record/property/link 的 table/field move、合表方向变化、`source`/`target` 字段位置变化都要 fail fast，除非属于可重建 computed output 或显式 primitive/handler。
4. `8` 增加 storage blocking gate：gate 通过前不能暴露新 `EntityQueryHandle` 给普通 scheduler listener、side effect 或业务 dispatch。
5. `10` 增加 `PhysicalLayoutChangeError` 验收与测试。

### 2. 异步 computation 的迁移语义还需要明确

采纳。

源码核实：`Scheduler` 会为 async computation 创建 `_ASYNC_TASK_...` entity/relation；`runComputation()` 遇到 `ComputationResultAsync` 时只调用 `createAsyncTask()`。真正的 output apply 发生在后续 `handleAsyncReturn()` 中，并且会检查 task freshness、执行 `asyncReturn()`、再调用 `applyResult()` 或 `applyResultPatch()`。因此 migration 不能把“task 已创建”视为重算完成，否则 verification 和 manifest 写入会早于 output/state 落库。

已修订：

1. `1` 增加目标：migration 完成状态必须确定，普通 async task 创建不等于 output 重算完成。
2. `6.2` 明确迁移契约不能返回 `ComputationResultAsync` 后只创建普通 `_ASYNC_TASK_...` task。
3. `6.2` 要求真正需要异步外部计算时，必须提供 migration 专用、可等待、可重试、可审计的 async executor；否则 plan 阶段报 `UnrebuildableComputationError`。
4. `8` 增加 async contract gate 和 task drain 步骤。
5. `10` 增加 `AsyncMigrationComputationError` 验收与测试。

### 3. `_isDeleted_` 这类 computed output 不能走普通 property apply 路径

采纳。

源码核实：`Controller.applyResult()` 在 property data context 中遇到 `HARD_DELETION_PROPERTY_NAME` 且结果为 truthy 时，会调用 `storage.delete()` 删除 host record。`applyResultPatch()` 也有同样分支。迁移第一阶段原则是保留事实数据、只重算新增/变更派生数据；如果直接复用普通 property apply 路径，computed `_isDeleted_` backfill 可能在用户未显式允许的情况下删除事实记录。

已修订：

1. `1` 增加非目标：第一阶段默认不执行会删除事实记录的 computed output。
2. `6.4 Property` 明确 `_isDeleted_` 不能复用普通 `Controller.applyResult()`/`applyResultPatch()`。
3. `6.4` 新增 `Destructive Computed Output`，要求 `_isDeleted_`、entity/relation replace、patch delete 都进入 destructive gate。
4. `8` 增加 destructive computed output gate。
5. `10` 增加 `DestructiveComputedOutputError` 验收与测试。

## 未采纳意见

无。
