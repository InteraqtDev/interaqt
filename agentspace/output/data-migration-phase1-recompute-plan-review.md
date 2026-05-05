# Data Migration Task 1 追加任务1 Review

## 结论

对 `agentspace/output/data-migration-phase1-recompute-plan.md` 的当前版本做完复核后，没有发现需要推翻方案的致命错误，也没有发现违反 Task 1 注意事项的设计方向。

当前计划已经满足 Task 1 的主体要求：第一阶段默认只走声明计算路线，不做 rename/copy/merge/split 猜测；第二阶段 primitive/hints 只作为入口保留；重算范围限定为新增、变更 computation 及受影响下游；storage 迁移基于 manifest、`DBSetup`、`EntityToTableMap` 和物理 path 差异，而不是假设 entity/relation 与 table 一一对应。

早期最危险的三个缺口已经被当前计划覆盖：事实数据物理位置变化硬门禁、async computation 的确定性迁移契约、`_isDeleted_`/delete patch 等 destructive computed output gate。因此本 review 的最终判断是：计划可以作为第一阶段实现规格继续推进。

## Review 范围

本次 review 重点检查两类问题：

1. 是否存在致命错误，导致第一阶段“基于计算重建新增/变更派生数据”的路线不可执行。
2. 是否违反 Task 1 的明确约束，包括 interaqt 响应式范式、禁止优化猜测、primitive 表达方向、依赖顺序、storage 复杂映射、只重算新增/变更数据。

同时对照了现有实现中的关键路径：

1. `Controller.setup()` 会先创建 computation state，再调用 `MonoSystem.setup()`，最后 `Scheduler.setup()` 安装监听。
2. `MonoStorage.setup()` 会用当前 definitions 构建新的 `DBSetup`、`EntityToTableMap`、constraints、query handle 和 schema metadata。
3. `DBSetup.buildMap()` 包含 filtered record 解析、relation link 创建、合表和字段分配，不存在稳定的一实体一表假设。
4. `EntityToTableMap.getTableAliasAndFieldName()` 是逻辑 path 到物理 table/field 的关键入口，尤其 relation 合表时 id/source/target 字段可能落在不同物理位置。
5. `Scheduler.runComputation()` 中 `ComputationResultAsync` 只创建 async task，普通结果 apply 才会写 output。
6. `Controller.applyResult()` 和 `applyResultPatch()` 对 `_isDeleted_ = true` 会直接删除 host record。

## 符合 Task 1 的部分

### 1. 符合 interaqt 响应式范式

计划没有把 migration 设计成外部 SQL 脚本系统，而是围绕 interaqt 已有的响应式结构展开：computation output、dataDeps/eventDeps、dirty propagation、state、bound state、normalized mutation events 和 affected downstream。新增的 `MigrationScheduler` 也明确只复用现有语义中的可迁移部分，而不是直接让普通 dispatch listener 接管 migration。

这符合 interaqt 的核心范式：事实数据由 interaction/event source 写入，派生数据由声明 computation 重建。

### 2. 没有做第一阶段优化猜测

计划明确把 rename/copy/merge/split 等能力放到第二阶段 hints/primitive 中，第一阶段 executor 不使用这些 hints 做加速。遇到事实字段 rename、合表方向变化、物理 path move 等无法通过 computation 重建的情况，第一阶段 fail fast，而不是猜测用户意图。

这点符合 Task 1 中“框架不要做任何优化的猜测，默认走计算路线”的要求。

### 3. primitive 表达方向正确

计划中的 hint 示例是以新增或变更后的 target data 为中心：

```ts
Staff: from(Worker)
Staff.fullName: from(Worker.name)
Employment: from(WorkerDepartment)
```

它表达的是“新声明数据从哪里来”，不是“执行 rename/copy 过程”。这符合 Task 1 对 primitive 方向的要求。

### 4. 考虑了新增/变更数据之间的依赖顺序

计划通过 computation graph 建模 output dataContext，并沿“被依赖数据 -> 依赖它的 output”传播 affected set，再按拓扑顺序执行。它还保留了现有 phase 概念，并对强连通分量给出 fail fast 或 migration seed 的边界。

这覆盖了“新增或修改的数据依赖其他新增或修改数据，计算过程有顺序”的要求。

### 5. 正确认识 storage 复杂性

计划没有用 entity/relation 名称直接拼表名，而是要求扩展 `StorageSchemaManifest` 并记录 physical path。它还明确处理了合表、拆表、filtered record、relation source/target 字段位置、bound state 物理位置和 constraints/indexes 的分阶段创建。

这一点与源码一致：`DBSetup` 会在 build map 后做合表和字段分配，`EntityToTableMap` 才是逻辑 path 到物理字段的可信入口。

### 6. 符合“完全没变的不应该重新计算”

计划通过旧 manifest 与新 definitions 生成 model diff，只把新增/变更 computation、state 变化、以及受其 output 影响的下游 computation 放入 rebuild plan。未变化且不依赖 affected output 的 computation 不进入重算。

当 dirty set 无法精确计算时，计划允许退化为 affected computation 的 host/output 全量重算，但不扩大到未变化 computation。这个退化边界是合理的。

## 已覆盖的高风险点

### 1. 物理布局变化硬门禁

当前计划已经把逻辑数据 physical path 变化作为 `StorageSchemaDiffer` 的一等 diff，并要求在 migration bootstrap 暴露新 runtime map 之前完成 gate。对事实 record/property/link，旧/新 table、field、link table、source/target field、filtered resolved base 发生变化时，默认 fail fast。

这是必要的。否则新 `EntityQueryHandle` 会按新 `EntityToTableMap` 读写，而旧事实数据仍停留在旧物理位置，migration 可能在重算前就读错数据。

当前计划在这点上没有违反 Task 1，反而是正确补强。

### 2. Async computation 完成语义

当前计划明确禁止把普通 `ComputationResultAsync` 的 task 创建视为 migration 完成。affected computation 如果只能产生普通 async task，而不能通过迁移专用 contract 确定 output/state 已落库，plan 阶段必须失败。

这与现有 `Scheduler.runComputation()` 行为一致：`ComputationResultAsync` 只会创建 `_ASYNC_TASK_...` task，后续还需要 `asyncReturn`/resolved result 才会 apply output。migration 的 verification、constraint 创建和 manifest 写入都不能建立在“task 已创建”上。

### 3. Destructive computed output gate

当前计划已经要求 `_isDeleted_` hard deletion property、entity/relation replace delete、Transform patch delete 都进入 destructive gate。默认不能删除事实 record，除非用户显式开启 destructive migration，并且 dry-run plan 能列出删除范围。

这与现有 runtime 的危险点一致：普通 `applyResult()`/`applyResultPatch()` 对 `_isDeleted_ = true` 会真实删除 host record。migration 不能复用普通 apply 路径来处理这类 output。

### 4. Manifest 生命周期

计划把 manifest 生命周期作为第一阶段核心能力，而不是附属日志：install 成功写 baseline manifest，migration 成功原子写新 manifest 与 log，普通 `setup(false)` 遇到 model hash mismatch 必须拒绝并提示 migrate，非空库无 manifest 必须走显式 baseline。

这对“只重算新增和变更”是必需条件。没有稳定 old manifest，就无法可靠判断 computation identity、signature、output ownership 和 physical path 是否变化。

### 5. Output ownership 与 state-only rebuild

计划要求只有 manifest 证明 output 由某个 computation 独占管理时，entity/relation output 才能 replace 或清空旧派生记录。共享 output、事实 output 或无法证明 ownership 的 output 不允许被清空。

同时，计划把 `rebuildState`、`rebuildOutput`、`propagateOutputEvents` 分开，避免 bound state schema/default 变化时误把 state-only rebuild 放大成下游 output event。这是符合响应式语义的。

## 非致命但实现时必须守住的边界

以下不是当前 plan 的违规点，但实现时不能弱化，否则会重新引入致命问题。

1. Migration bootstrap 不能先调用普通 `setup(false)` 再迁移。普通 setup 会创建 constraints、query handle、record sequences，并在 scheduler setup 后安装 listeners；迁移入口必须有专用 bootstrap。
2. `StorageSchemaManifest` 必须比现有 `StorageSchemaMetadata` 更完整。当前 metadata 只包含 records/tables/constraints 的简化快照，不足以比较 column field type、nullability、default signature、filtered base、bound state 物理位置和 constraint 逻辑来源。
3. 对包含用户函数语义的 computation，不能用 `Function.toString()` 猜测变化。缺少显式 version/migrationKey 或结构化 signature 时，生产 migration 必须 fail fast。
4. Event-based computation 不能默认通过历史 event replay 重建。除非有足够持久事件日志和显式 opt-in，否则 `StateMachine.computeValue` 只能说明一次 transition 的产出，不等价于全量历史重建能力。
5. 新增非空/唯一 computed output 必须坚持两阶段约束：先创建可写入结构，重算和校验后再创建 constraint/index；driver 不支持后补约束时要明确失败。

## 最终判断

`data-migration-phase1-recompute-plan.md` 当前版本可以通过 Task 1 追加任务1的 review。没有发现致命错误，也没有发现违反 Task 1 注意事项的地方。

建议下一步进入实现拆分前，把本计划作为第一阶段规格冻结，并优先实现 dry-run planner、manifest 生成/比较、physical path gate 和一个最小 computed property rebuild 闭环。这样可以先验证“只重算新增/变更派生数据”的主路径，再逐步扩展 Transform、filtered record、state-only rebuild 和约束后置创建。
