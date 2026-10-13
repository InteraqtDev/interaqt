# 复盘：retention 清理事务不升级 SERIALIZABLE 为什么逃过了测试体系

- 日期：2026-10-13
- 关联：下游应用 Mesh 在 v4.11.1 上的验收；`Controller.maintainEntityRetention` / `Controller.cleanupAsyncTasks`
- 证据纪律：每条归因附源码锚点或红-绿实验。每个修复用例都在对应的回退形态上确认红（第三节），针对 SERIALIZABLE 的用例红在 `RequireSerializableRetry`；不要求 SERIALIZABLE 的消费者格与已知缺口的固定测试按设计在所有形态上为绿。

---

## 〇、结论

| 编号 | 缺陷 | 逃逸机理（一句话） | 盲区类型 |
|------|------|------------------|---------|
| E-1 | 被清理实体是 data-based Transform 的源时，`maintainEntityRetention` 每次都失败，且按实体循环在该实体处中止；开启 `runAfterSuccessfulDispatch` 时 dispatch 在事实已提交后 reject（本次只消除 SERIALIZABLE 这一触发原因，提交后 reject 的契约缺口见第四节） | retention 用例的被清理实体全部没有下游计算消费者；「框架持有的事务入口」不是登记过的维度 | 消费者维度恒为「无」+ 入口维度缺失 |
| E-2 | `cleanupAsyncTasks` 同样以 READ COMMITTED 开事务、不升级；计算的 attributeQuery 穿过框架声明的 `_<property>_task` link 时同样失败 | 同 E-1；该格只有显式读取内部 link 才可达，手写用例与生成域都不会构造 | 同族入口，按「修类不修例」枚举时发现 |
| E-3 | 修复首版在两个入口各自手写「`runWithTransactionRetry` + `runInTransaction`」。在已有存储事务内调用 `maintainEntityRetention` 时，首次尝试失败后又做 4 次必然失败的嵌套尝试（嵌套事务不能提高外层的隔离级别），最终抛 `TransactionRetryExhaustedError`（attempts=5），而不是原样传播 `RequireSerializableRetry` | 同一逻辑已有四份手写副本，副本之间已经不一致：`MonoStorage.withAtomicTransaction` 有「已在事务内则直接执行」的分支，新副本没有；没有任何检查要求入口共用一处实现 | 重复实现漂移（AGENTS「修类不修例」第 2 条），评审时发现 |

## 一、根因

计算侧对隔离级别的要求是显式的：data-based Transform 的 update/delete patch（`src/runtime/computations/Transform.ts` 的
`dataBasedIncrementalPatchCompute`）、非 `atomic-safe` 的 Custom、entity/relation 全量替换与全量重算在 READ COMMITTED 下抛
`RequireSerializableRetry`，由事务持有者把隔离级别升到 SERIALIZABLE 后重跑。框架里的事务持有者分两类：

| 入口 | 修复前 | 修复后 |
|---|---|---|
| `dispatch` | `runWithTransactionRetry`（upgrade），每次尝试克隆参数；在非业务事务的存储事务内调用直接报错 | 不变 |
| 事务外 storage 写（`MonoStorage.withAtomicTransaction`）/ `handleAsyncReturn` | 各自手写 `runWithTransactionRetry`（upgrade） | 共用 `runInRetryableTransaction`（`src/runtime/frameworkTransaction.ts`），行为不变 |
| `maintainEntityRetention`（含自动挂钩） | 直接 `runInTransaction`，默认 READ COMMITTED，不升级 | `runInRetryableTransaction` |
| `cleanupAsyncTasks` | 同上 | `runInRetryableTransaction` |
| `runInBusinessTransaction` | 调用方固定隔离级别，契约为 fail-fast | 不变（契约如此） |
| migration recompute / deletion-scope 模拟 | 固定 SERIALIZABLE | 不变 |

`runInRetryableTransaction` 的语义：不在事务内时经 `runWithTransactionRetry` 执行（`RequireSerializableRetry` 升级到 SERIALIZABLE
后重跑，可重试错误退避重试）；已在事务内时直接在外层事务里执行一次，不重试，`RequireSerializableRetry` 与可重试错误交给外层
事务的持有者处理。后一条与 `withAtomicTransaction` 的既有语义一致，`handleAsyncReturn` 的嵌套调用也由此从「必然失败的重试」
变为直接传播（框架内部没有嵌套调用它的位置）。

retention 设计（`docs/sequence-idempotency-retention/sequence-idempotency-retention.md` FR-RET-01）同时规定了「独立存储事务」与
「删除走 `storage.delete`，产生正常 mutation 事件」，但没有把两者连起来：正常 mutation 事件意味着下游计算在同一事务内运行，
而下游计算可能要求 SERIALIZABLE。设计的「读者枚举」只列了 retention 声明的读者，没有列被删除记录的读者（下游计算）。

## 二、为什么测试体系没有抓到

- `tests/runtime/entityRetention.spec.ts` 的全部 retention 格使用没有任何计算依赖的实体：「被删除记录的下游消费者」这一维度恒为「无」。
  READ COMMITTED 下没有任何计算抛 `RequireSerializableRetry`，所以不升级不可观测。
- 生成式套件（`computationGenerativeFuzz` 等）的写入经 dispatch 或事务外的 storage 写，两者都走 `runWithTransactionRetry`；
  不升级的入口从未出现在生成域里。
- 「框架持有的顶层事务入口」不在维度登记册里，新增入口时没有需要显式决策的检查点。`runInTransaction` 的隔离级别默认值是
  READ COMMITTED，漏掉升级不会产生任何声明期或 setup 期错误。

## 三、机制落地与敏感性证据

敏感性实验有两种回退形态：A = `maintainEntityRetention` 改回 v4.11.2 的裸 `runInTransaction`；B = 改回修复首版的
`runWithTransactionRetry` + `runInTransaction`（无「已在事务内」分支）。

| 机制 | 位置 | 敏感性实验 |
|---|---|---|
| 框架持有的事务入口收敛到一个助手 `runInRetryableTransaction` | `src/runtime/frameworkTransaction.ts`；调用方 `MonoStorage.withAtomicTransaction`、`Scheduler.handleAsyncReturn`、`Controller.maintainEntityRetention`、`Controller.cleanupAsyncTasks` | — |
| 源码结构不变量：`src/` 内每个 `.runInTransaction(` / `runWithTransactionRetry(` 调用点必须是该助手、字面量 `isolation: 'SERIALIZABLE'`，或带理由与精确次数的白名单项（按所在函数计，不按文件） | `tests/runtime/frameworkTransactionEntrySites.spec.ts` | A、B 均红：列出违规调用点 |
| ttl × data-based Transform 源 × 后续实体（PGLite） | `entityRetention.spec.ts` | A 红：`Retry transaction with SERIALIZABLE isolation: data-based Transform update/delete patch` |
| cap × data-based Transform 源 × 自动挂钩（PGLite） | 同上 | A 红：dispatch reject，同一错误（栈经 `deleteBeyondCap`） |
| 下游消费者矩阵：12 种消费者（Count / Summation / WeightedSummation / Average / Every / Any / Custom 默认并发 / Custom `atomic-safe` / data-based Transform / 只监听 create 的 event-based Transform / 以被一并删除的关系为源的 data-based Transform / 经该关系的属性 Count），期望值由存活行手算 | `entityRetention.spec.ts`「downstream consumers of the deleted rows」 | A 下恰好 3 个要求 SERIALIZABLE 的格红（Custom 默认并发、data-based Transform、关系源 Transform），其余 9 格绿；另有一个守卫用例断言矩阵同时含两类消费者 |
| 调用上下文：外层 READ COMMITTED 事务内（只执行一次、原样传播 `RequireSerializableRetry`、外层回滚后数据不变）/ 外层 SERIALIZABLE 事务内（在外层事务内完成清理） | 同上 | B 下 READ COMMITTED 格红（`TransactionRetryExhaustedError`，attempts=5） |
| 同 ttl 格 + Custom 默认并发与关系源 Transform 格，真实 PostgreSQL | `postgresqlEntityRetention.spec.ts`（已加入 `npm run test:postgres`） | A 红，同一错误（栈经 `PostgreSQLDB.runInTransaction`） |
| `cleanupAsyncTasks` × 读取 task link 的 Transform（PGLite） | `asyncTaskRetention.spec.ts` | 未修复源码上红，同一错误 |
| 已知缺口的固定测试：自动挂钩失败在提交后让 `dispatch` / `runInBusinessTransaction` reject（见第四节） | `entityRetention.spec.ts`「known gap: ...」 | 按当前行为断言；缺口修复后该测试变红，应替换为对报告结果的断言 |
| 维度登记 | `tests/runtime/WritingComputationTests.md`「框架持有的顶层事务入口 × 需要 SERIALIZABLE 的计算」行 | — |

## 四、未处理的相邻项（记录，不在本次修复范围）

- **自动挂钩失败违反 dispatch 的提交后阶段契约。** API 参考（`14-api-reference.md`「Stage P completion」）规定提交后阶段的
  失败不设置 `error`、不回滚事实，通过 `postCommitPhase` 报告。`Controller.dispatch` 与 `Controller.runInBusinessTransaction`
  在提交之后直接 `await this.maintainEntityRetention()`，没有捕获错误，所以清理中的任何失败（本次修复后仍可能来自下游计算或
  监听器的普通错误、重试耗尽等）都会让调用方收到 reject，而事实已经提交；调用方若据此重试，非幂等的事件源会重复写入事实。修复需要先
  决定报告通道：dispatch 可以写入 `DispatchResponse`，但 `runInBusinessTransaction` 只返回回调的结果，没有现成的位置。
  固定测试：`entityRetention.spec.ts`「known gap: an auto-hook failure rejects dispatch and runInBusinessTransaction after their commit」。
- **单个实体持续失败会阻塞后续实体。** 按实体循环不捕获错误，某个实体每轮都失败时，排在它之后的实体永远不会被清理；
  `RetentionReport` 没有失败字段。是否改为继续处理后续实体并报告失败，属于 API 契约决策。
- **每个实体的清理是一个事务。** `deleteExpiredByTtl` 在同一事务内分批循环直到删完，下游应用首次补清理时约 5.1 万行会在
  一个 SERIALIZABLE 事务内完成，遇到串行化冲突时整体重做，最多 5 次。ttl 模式每批都按当前存储重新查询过期行，改为按批提交
  预计可以保持幂等，但未验证；cap 模式的待删列表来自一次全表扫描，按批提交需要重新论证。
- **嵌套调用时调用方吞掉错误会提交不一致的状态。** 在外层 READ COMMITTED 事务内调用 `maintainEntityRetention` 时，源行的
  删除已经执行，派生行的删除因 `RequireSerializableRetry` 没有执行；调用方若捕获错误后让外层事务提交，结果是源行已删、派生
  行残留。这是嵌套复用事务（没有 SAVEPOINT）的通用语义，修复前后相同；正确用法是让错误传播使外层回滚，或在 SERIALIZABLE
  外层事务内调用。
