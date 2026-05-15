# Scoped Atomic Sequence Task 1 Additional Task 5 Review

## 结论

基于 `agentspace/output/scoped-atomic-sequence-feature-plan.md` 对当前代码重新 review 后，没有发现会阻塞 `ScopedSequence` 合入的实现错误，也没有发现 feature plan 中仍未完成的核心工作项。

当前实现已经把 scoped atomic sequence 建模为声明式 property computation，并覆盖了 plan 中最关键的语义：post-create/pre-commit 分配、事务内原子 counter、显式 scope canonicalization、不可普通 rebuild 的 migration 处理、manifest/diff 可见性，以及 seed/no-seed 的显式审批。

剩余风险不是代码缺口，而是环境验收缺口：本机没有配置 `INTERAQT_POSTGRES_DATABASE`，因此无法实际执行真实 PostgreSQL 双 controller 并发测试。该测试文件和 npm script 已存在，应由本机配置或 CI 完成最终确认。

## Review 范围

- Feature plan：`agentspace/output/scoped-atomic-sequence-feature-plan.md`
- Core API：`src/core/ScopedSequence.ts`、`src/core/index.ts`、`src/core/init.ts`、`src/core/types.ts`
- Runtime：`src/runtime/computations/ScopedSequence.ts`、`src/runtime/Scheduler.ts`、`src/runtime/Controller.ts`
- Storage/internal schema：`src/runtime/System.ts`、`src/runtime/MonoSystem.ts`、`src/drivers/PostgreSQL.ts`、`src/drivers/PGLite.ts`、`src/drivers/SQLite.ts`
- Migration/manifest：`src/runtime/scopedSequenceManifest.ts`、`src/runtime/scopedSequenceScope.ts`、`src/runtime/migration.ts`
- Tests：`tests/core/serialization.spec.ts`、`tests/runtime/scopedSequence.spec.ts`、`tests/runtime/postgresqlScopedSequence.spec.ts`

## 逐项核对

### 1. Core API 与 Klass 集成

`ScopedSequence` 已按 core Klass pattern 实现，并注册到 `KlassByName` 与 public exports。校验覆盖了 name、非空 scope、scope item 唯一性、stable path、ref base、正整数 step、finite initialValue，以及 `initializeFrom` 的 record/valuePath/scope/aggregate 约束。

序列化实现会把 ref scope base 和 initializer record 保存为 EntityRef，并在 parse 时按 uuid 优先恢复；legacy 无 uuid 数据才按 name fallback。这避免了同名 Entity 在新格式里被错误恢复的问题。

核对结果：符合 feature plan，未发现未完成项。

### 2. Runtime allocation 语义

`PropertyScopedSequenceHandle` 只注册为 property computation，只实现 `getInitialValue()`，不提供 `compute()` 或 `incrementalCompute()`。构造阶段校验宿主 property 必须是 `number`，并在不支持 atomic scoped sequence 的 driver 上清晰失败。

默认禁止 create input 手动设置目标 property；`allowManualValue: true` 时保留手动值并直接返回，不推进 counter。自动分配时从 create mutation record 解析 stable scope，再调用 `storage.atomic.nextSequenceValue()`。

`Scheduler.addMutationPropertyComputationDefaultValueListeners()` 仍通过 create mutation 触发 default value，再由 `Controller.applyResult()` 写入 property update；`Controller.dispatch()` 把 resolve、scheduler listener 和 update 包在同一个 storage transaction 内。因此实际语义是 plan 要求的 post-create/pre-commit，而不是 insert-time default。

核对结果：符合 feature plan，未发现实现偏差。

### 3. Scope canonicalization 与 storage primitive

runtime allocation 和 migration seed 共用 `scopedSequenceScope` 中的 canonicalization 规则。scope key 保留声明顺序，每个 item 包含 name/type/value；ref value 规范成 `{ type: "ref", entity, id }`，primitive 类型严格匹配，`undefined` 会作为 missing scope 报错。

`MonoStorage.atomic.nextSequenceValue()` 使用 `_ScopedSequence_` 的 `(sequenceName, scopeKey)` 主键和 `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`。首次分配返回 `initialValue + step`，后续按 `step` 增长；写入和 seed 都要求 active transaction，没有 `max + 1` fallback。

driver capability 标注符合 plan：PostgreSQL 标记 cross-connection/cross-process production safe；PGLite/SQLite 仅声明本地或测试级支持。

核对结果：符合 feature plan，未发现实现错误。

### 4. Internal schema 与 migration manifest

`Scheduler.createInternalSchemaRequirements()` 会从 `ScopedSequence` handles 生成 `scoped-sequence-table` requirement，`Controller.setup()`、baseline、diff 和 migrate 路径都会传给 system schema API。`MonoSystem` 会在 setup/migration schema planning 中创建 `_ScopedSequence_`，且它作为 internal DDL 出现，不被建模为业务 entity/relation。

`createComputationManifest()` 已把 `allocationSignature` 纳入 output/structural/final signature；top-level `sequences` manifest 也记录 computationId、hostRecord、property、sequenceName、scopeSignature、allocationSignature。scope、step、initialValue、allowManualValue、initializeFrom 等 allocation args 变化会进入 model hash 和 diff review。

`normalizePreviousComputationManifest()` 不会把旧 manifest 缺少 allocation metadata 的 computation 误判为等价的 scoped allocation，因为 semantic match 要求 allocationSignature 一致。

核对结果：符合 feature plan，未发现未完成项。

### 5. Seed/no-seed 与不可重建语义

新增或 allocation args 变更的 `ScopedSequence` 会在 diff 中推荐 `unrebuildable`。`getRecomputeBlockingChanges()` 按 computation type 识别 `ScopedSequence`，没有 approved seed/no-seed decision 时会阻止普通 recompute。

`seedScopedSequenceInitializers()` 只在 migration transaction 中执行 sequence state seed，不调用 `getInitialValue()` 给既有数据重新分配。`initializeFrom` 必须匹配宿主 record 和目标 property，并按 scope group 取 MAX 后用 `seedSequenceValue(..., mode: "max")` 推进 counter。无 `initializeFrom` 时，只有 host table 为空且通过 no-seed decision 才允许迁移，执行前还有二次空表校验。

核对结果：符合 feature plan，未发现实现错误。

## 测试与验证

- `npm run check:all` 通过。
- `npx vitest run tests/core/serialization.spec.ts tests/runtime/scopedSequence.spec.ts` 通过，结果为 `59 passed`。
- `npm run test:postgres-scoped-sequence` 未执行测试体；本机缺少 `INTERAQT_POSTGRES_DATABASE`，脚本按预期失败并提示需要该环境变量。

## 剩余风险

真实 PostgreSQL 双 controller 并发测试是该 feature 的关键验收，因为原始问题就是跨连接/跨进程 scoped counter 竞争。当前代码和 CI 脚本都已具备该测试入口，但本机环境无法验证测试体结果。发布或合入前应确认 CI 的 `npm run test:postgres-scoped-sequence` 通过。

除此之外，本轮 review 没有发现实现错误或未完成工作项。
