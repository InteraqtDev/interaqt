# Scoped Atomic Sequence Release Readiness Review

## 结论

当前 `ScopedSequence` 实现已经达到可进入发布流程的代码状态：未发现阻塞发布的实现错误，也未发现 `agentspace/output/scoped-atomic-sequence-feature-plan.md` 中核心设计仍未完成的项。

发布判断仍应保留一个硬门禁：真实 PostgreSQL 双 controller 并发测试必须在 CI 或配置了 `INTERAQT_POSTGRES_DATABASE` 的本机环境中通过。当前工作树已经提供 `npm run test:postgres-scoped-sequence` 和 GitHub Actions 服务化 PostgreSQL 门禁，但本机没有该环境变量，因此本轮无法实际执行 PostgreSQL 测试体。

换句话说：

- 代码与本地 release hook 检查：通过。
- feature plan 一致性：通过。
- 发布前最终门禁：等待 PostgreSQL scoped sequence CI 绿灯。

## 检查范围

- 设计依据：`agentspace/output/scoped-atomic-sequence-feature-plan.md`
- Core API：`src/core/ScopedSequence.ts`、`src/core/index.ts`、`src/core/init.ts`、`src/core/types.ts`
- Runtime：`src/runtime/computations/ScopedSequence.ts`、`src/runtime/Scheduler.ts`、`src/runtime/Controller.ts`
- Storage/internal schema：`src/runtime/System.ts`、`src/runtime/MonoSystem.ts`、`src/drivers/PostgreSQL.ts`、`src/drivers/PGLite.ts`、`src/drivers/SQLite.ts`
- Manifest/migration：`src/runtime/scopedSequenceManifest.ts`、`src/runtime/scopedSequenceScope.ts`、`src/runtime/migration.ts`
- Tests/CI：`tests/runtime/scopedSequence.spec.ts`、`tests/runtime/postgresqlScopedSequence.spec.ts`、`tests/runtime/migration.spec.ts`、`tests/core/serialization.spec.ts`、`package.json`、`.github/workflows/postgres-concurrency.yml`

## 发布就绪核对

### 1. API 与响应式范式

`ScopedSequence` 已按 core Klass pattern 落地，并作为 `Property` computation 暴露。实现没有引入业务侧 imperative sequence service，也没有把分配逻辑散落到 callback 中，符合 interaqt 的声明式响应式范式。

已核对点：

- `ScopedSequence` 已从 core public barrel 导出，并注册到 `KlassByName`。
- `ComputationInstance` union 已包含 `ScopedSequenceInstance`。
- runtime handle 通过 `ScopedSequenceHandles` 进入 `Controller` 默认 computation handle 集合。
- 宿主 property 必须为 `number`，非 number host 会在 controller 构造阶段失败。
- core validation 覆盖 name、非空 scope、重复 scope name、stable path、ref base、正整数 step、finite initialValue、initializer scope 完整性。

### 2. Runtime 分配语义

runtime 语义与计划一致：`PropertyScopedSequenceHandle` 只实现 `getInitialValue()`，由 `Scheduler.addMutationPropertyComputationDefaultValueListeners()` 在 host record create mutation 后触发，再通过 `Controller.applyResult()` 写回目标属性。因此它是明确的 post-create/pre-commit allocation，而不是 insert-time default。

已核对点：

- 默认禁止手动写入 sequence property。
- `allowManualValue: true` 时保留手动值并直接返回，不调用 `nextSequenceValue()`，不会推进 counter。
- 自动分配从 create mutation record 解析 scope，缺失或类型不匹配会显式报错。
- ref scope canonical value 包含 `{ type: "ref", entity, id }`，避免不同 entity 共享 id 时碰撞。
- `ScopedSequence` 没有 `compute()` / `incrementalCompute()` 路径，不会被当成可普通重算的派生值。

### 3. Storage 与事务安全

storage primitive 使用 `_ScopedSequence_` internal table，主键为 `(sequenceName, scopeKey)`，`scopeKey` 由声明顺序稳定 JSON 生成。`nextSequenceValue()` 和 `seedSequenceValue()` 都要求 active transaction，不存在 `max + 1` fallback。

已核对点：

- PostgreSQL/PGLite 使用 `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`。
- SQLite 以单进程测试级能力启用相同抽象。
- PostgreSQL capability 标记为 `crossConnection: true`、`crossProcess: true`、`productionSafe: true`。
- PGLite/SQLite 明确标记为非 cross-process production safe。
- 不支持 atomic scoped sequence 的 driver 会在 setup/dispatch 前清晰失败。
- rollback 和 delete 语义由测试覆盖：失败事务不推进已提交 counter，删除不回退 counter。

### 4. Internal Schema 与 Migration

实现没有用 dummy computation state 表达 sequence state，而是新增 internal schema requirement 通道。`Controller.setup()`、baseline、diff、migrate 都会把 `scheduler.createInternalSchemaRequirements()` 传给 system schema API。

已核对点：

- `MonoSystem.setup()` 在需要时创建 `_ScopedSequence_`。
- migration additive plan 能规划 `_ScopedSequence_` internal DDL。
- migration manifest 顶层 `sequences` 记录 sequence declaration。
- computation manifest 记录 `allocation`、`scopeSignature`、`allocationSignature`，并把 allocation signature 纳入最终 signature/model hash。
- legacy manifest normalization 保留 allocation 字段，旧 manifest 不会被误判为等价的新 scoped allocation。
- 新增或变更 scoped allocation 会产生 `unrebuildable` review，而不是走普通 recompute。
- `initializeFrom` seed 需要显式 `scoped-sequence-seed` decision；无 initializer 时只有 host table 为空并批准 `scoped-sequence-no-seed` 才允许迁移。
- seed 在 migration recompute transaction 内执行，按 scope group 使用 MAX 以 `mode: "max"` 推进 counter。

### 5. 测试覆盖

本轮执行结果：

- `npm run check:all` 通过。
- `npx vitest run tests/core/serialization.spec.ts tests/runtime/scopedSequence.spec.ts tests/runtime/migration.spec.ts tests/runtime/postgresqlMigration.spec.ts` 通过；其中本机未配置 PostgreSQL，`postgresqlMigration.spec.ts` 的 PostgreSQL 测试按条件 skip。
- `npm test` 通过：`116 passed | 4 skipped` test files，`1554 passed | 25 skipped` tests。
- `npm run build` 通过，包括 production build 和 `tsconfig.prod.json` 检查。
- `ReadLints` 未发现新增 linter diagnostics。
- `npm run test:postgres-scoped-sequence` 在本机按预期失败，原因是缺少 `INTERAQT_POSTGRES_DATABASE`，测试体未执行。

测试矩阵已覆盖 feature plan 要求的大部分重点：

- core validation
- first value = `initialValue + step`
- manual import 不推进 counter
- single-controller 并发不重复
- multi-scope isolation
- rollback/delete semantics
- unique constraint fallback
- manifest allocation signature diff
- additive internal schema
- migration seed/no-seed
- unsupported driver clear failure
- runtime timing effects
- downstream property computation reaction
- SQLite 单进程 driver 行为

真实 PostgreSQL 双 controller 并发测试已存在于 `tests/runtime/postgresqlScopedSequence.spec.ts`，CI workflow `.github/workflows/postgres-concurrency.yml` 已启动 PostgreSQL 16 service，并执行：

- `npm run test:postgres-concurrency`
- `npm run test:postgres-scoped-sequence`

## 发布前门禁

发布前必须确认以下命令在有 PostgreSQL 环境的 CI 或本机通过：

```sh
npm run test:postgres-scoped-sequence
```

建议同时保留现有 GitHub Actions workflow 作为 PR/push 必跑项，因为该 feature 的原始风险就是跨连接/跨 controller scoped counter 竞争，本地 PGLite/SQLite 不能替代这个验收。

## 最终判断

当前代码没有发现发布阻塞级问题。若 PostgreSQL scoped sequence CI 通过，则可以按新版本发布；若该 CI 未跑或失败，则不能宣称该 feature 已完成生产级发布验收。
