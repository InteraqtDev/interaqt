# Data Migration Phase 1 Remaining Gaps Review

## 结论

当前 Phase 1 数据迁移实现已经覆盖了原计划的大部分主路径：manifest 生命周期、dry-run plan、baseline、additive schema、physical path gate、computed property/global/Transform/filtered rebuild、affected graph、state-only rebuild、async/destructive gate、non-null/unique verification、migration lock/log、operation-level DDL resume，以及较完整的测试矩阵。

剩余问题已经不是“计算路线不可行”或“框架范式冲突”，而是原计划中最严格的生产级边界尚未完全收口。它们主要集中在四类：

1. 复杂 relation aggregate 迁移事件的证明不足。
2. computed output ownership 仍是约定式，不是历史证明式。
3. strict dry-run 的 driver 覆盖还不完整。
4. operation-level resume 尚未覆盖 computation / verification / manifest write 等非 DDL 阶段。

## 1. Relation Aggregate 迁移事件缺少专项证明

### 未完成内容

原计划要求规范化迁移事件覆盖 `relatedAttribute`、`relatedMutationEvent`，尤其是 property aggregate 通过 relation path 依赖关联记录时，下游 `Count` / `Summation` / `Average` 等 computation 应能像普通 dispatch 路径一样得到正确 dirty records。

当前实现已经具备迁移事件传播能力，也覆盖了：

1. computed property chain。
2. filtered membership events。
3. global downstream computation。
4. Transform output patch。

但还没有专门测试“property aggregate 依赖 relation path”的场景，因此不能完全证明这类复杂 `relatedMutationEvent` 语义已经与普通 runtime 一致。

### 为什么没完成

这不是框架阻塞，而是测试与验证边界还没补齐。当前 `MigrationScheduler` 复用了 `ComputationSourceMapManager` 和 `Scheduler.computeDataBasedDirtyRecordsAndEvents()`，理论上可以支持这类事件，但 relation path aggregate 的事件形态复杂，必须构造专门 fixture 才能证明：

1. relation create/delete/update 会保留正确的 `relatedAttribute`。
2. `relatedMutationEvent` 不会被压扁成普通 host record update。
3. 下游 aggregate 能用这两个字段定位 dirty records。

### 完成难度

中等。

主要工作是补测试，而不是大规模改架构。可能需要根据测试结果修正 `MigrationScheduler.queueEvents()` 或 `createMutationEventForOutput()` 的事件细节。

预计改动范围：

1. `tests/runtime/migration.spec.ts` 增加 relation aggregate migration case。
2. 如测试暴露问题，微调 `src/runtime/migration.ts` 的 normalized event 生成。

### 收益

高。

这是响应式迁移语义中最容易出错的一类场景。补齐后可以更有信心地声明迁移事件传播与普通 runtime dispatch 语义一致，特别是关系聚合类 computation。

## 2. Computed Output Ownership 仍是约定式

### 未完成内容

原计划要求 entity/relation output 的清理、replace、delete 必须受 output ownership 限制：只有 manifest 能证明该 output 由某个 computation 独占管理时，才允许迁移 executor 清理或替换旧派生记录。

当前实现中，`ComputationManifest.owner` 对 entity/relation computation 直接标记为 `exclusive`。这对当前 Transform 这类典型派生输出是合理默认，但还不是“从旧 manifest 证明 ownership”。

### 为什么没完成

这里涉及更深的历史兼容语义。当前框架此前没有 output ownership manifest，所以第一版迁移只能按新 definitions 推断：

1. entity/relation 上声明了 computation，就视为 computed output。
2. computed entity/relation output 默认由该 computation 独占。

要做到原计划要求，需要在 manifest 中记录并演进 ownership 证据，例如：

1. output record 名称。
2. owner computation id。
3. owner 类型：`exclusive` / `shared` / `unknown`。
4. 历史 manifest 中该 output 是否曾由多个 computation 或事实写入共享。

对于没有旧 manifest 或旧 manifest 信息不足的库，应进入 baseline 校验或 fail-fast，而不是默认相信当前 definitions。

### 完成难度

中高。

这不是单个函数的修复，而是 manifest 合约增强。需要考虑兼容当前已经写入的 manifest version，以及 baseline 场景。

预计改动范围：

1. `src/runtime/migration.ts` 扩展 `ComputationManifest` / `MigrationManifest` ownership 字段。
2. `createMigrationManifest()` 写入 ownership proof。
3. `getRecomputeBlockingChanges()` 或 rebuild planner 在 ownership unknown 时 block destructive entity/relation replace/delete。
4. 增加 shared/unknown output 的测试。

### 收益

高。

这是避免误删事实数据或共享数据的关键安全阀。对 framework 级迁移来说，ownership 证明越严格，越能降低下游用户数据损坏风险。

## 3. Strict Dry-run 的 Driver 覆盖还不完整

### 未完成内容

当前已经新增 `Database.openForSchemaRead()`，并接入：

1. `PGLiteDB.openForSchemaRead()`
2. `SQLiteDB.openForSchemaRead()`

`MonoStorage.ensureDbOpenForSchemaRead()` 会优先使用这个接口，避免 dry-run 使用普通 `open(false)` 触发内部 setup。

但 PostgreSQL / MySQL driver 还没有实现 `openForSchemaRead()`。因此这些 driver 会 fallback 到 `open(false)`，严格零副作用 dry-run 在这些 driver 上还不能保证。

### 为什么没完成

这是 driver 覆盖问题，不是 migration 核心逻辑阻塞。不同 driver 的连接生命周期不同：

1. PGLite 构造时已有可查询实例，可以无副作用读 schema。
2. SQLite 必须打开文件连接，但可以避免 `_IDS_` setup。
3. PostgreSQL / MySQL 需要明确区分“建立连接”和“初始化 framework 内部表”。

当前只优先补了测试主力 driver PGLite 和本地 SQLite。

### 完成难度

低到中等。

如果 PostgreSQL / MySQL 的 `open(false)` 只是建立连接且不创建 framework 表，则实现 `openForSchemaRead()` 可能只是抽出连接逻辑；如果当前 `open()` 混合了连接和 setup，则需要拆函数。

预计改动范围：

1. `src/drivers/PostgreSQL.ts`
2. `src/drivers/Mysql.ts`
3. 可能补少量 driver-specific tests 或 smoke tests。

### 收益

中高。

dry-run 是迁移最重要的安全入口之一。生产用户更可能使用 PostgreSQL / MySQL，因此这些 driver 的严格只读 dry-run 能显著提升迁移可信度。

## 4. Operation-level Resume 尚未覆盖所有阶段

### 未完成内容

当前已经实现：

1. migration log 的 `phase` / `status` 分离。
2. DDL operation log：`__interaqt_migration_operation_log`。
3. schema DDL 和 post constraint DDL 的 operation-level skip。
4. 失败后可从 `schema-applied` 或已记录的 DDL operation 恢复。

但 operation-level resume 目前主要覆盖 DDL 阶段。以下阶段仍是 phase-level：

1. computation rebuild。
2. verification queries。
3. manifest write。
4. transform unique index setup。

如果这些阶段内部部分成功后失败，当前恢复粒度仍不够细。

### 为什么没完成

这些步骤的幂等性模型比 DDL 更复杂：

1. computation rebuild 可能写大量 records/properties，需要按 computation 或 record 粒度记录。
2. verification 通常是只读，可以重复执行，operation log 收益较低。
3. manifest write 应该是最后一步，失败时可安全重试，但要确保和 log 状态一致。
4. transform unique index setup 当前挂在 post schema 之后，但没有进入 `MigrationSchemaPlan.postRecomputeDDL` 的统一 operation list。

因此当前优先把最危险的 DDL 重复执行问题做了 operation-level resume，其他阶段先保持 phase-level。

### 完成难度

中等到高。

如果只补 verification / manifest write 的 operation log，难度中等；如果要 computation rebuild 也做到 record-level resume，难度会明显上升。

建议拆分：

1. 先把 transform unique index 纳入 post DDL plan。
2. 再把 verification / manifest write 纳入 operation log。
3. 最后再考虑 computation rebuild 的 per-computation 或 per-output checkpoint。

### 收益

中等。

DDL operation-level resume 已经解决了最常见、最危险的重复执行问题。继续扩大 operation log 覆盖可以提升长迁移任务的恢复能力，但复杂度也会上升。对于第一阶段来说，收益低于 ownership proof 和 relation aggregate 语义证明。

## 总体优先级建议

如果继续推进，建议优先级如下：

1. **补 relation aggregate migration event 测试**  
   难度中等，收益高，能验证响应式迁移核心语义。

2. **补 computed output ownership proof**  
   难度中高，收益高，是防止误删数据的关键安全能力。

3. **补 PostgreSQL / MySQL `openForSchemaRead()`**  
   难度低到中等，收益中高，增强生产 dry-run 可信度。

4. **扩大 operation-level resume 覆盖**  
   难度中高，收益中等，建议在 DDL resume 稳定后逐步推进。

## 最终判断

当前 Phase 1 已经满足“计算路线可行、安全 gate 覆盖主路径、迁移可验证”的大部分要求。剩余项属于严格生产化补强，不影响当前主路径可用性，但如果要完全达到原计划的最高标准，还应继续完成上述四类工作。
