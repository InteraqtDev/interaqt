# 复盘：retention 清理事务不升级 SERIALIZABLE 为什么逃过了测试体系

- 日期：2026-10-13
- 关联：下游应用 Mesh 在 v4.11.1 上的验收；`Controller.maintainEntityRetention` / `Controller.cleanupAsyncTasks`
- 证据纪律：每条归因附源码锚点或红-绿实验；新增用例全部在未修复的 v4.11.2 源码上确认红，且红在 `RequireSerializableRetry`。

---

## 〇、结论

| 编号 | 缺陷 | 逃逸机理（一句话） | 盲区类型 |
|------|------|------------------|---------|
| E-1 | 被清理实体是 data-based Transform 的源时，`maintainEntityRetention` 每次都失败，且按实体循环在该实体处中止；开启 `runAfterSuccessfulDispatch` 时 dispatch 在事实已提交后 reject | retention 用例的被清理实体全部没有下游计算消费者；「框架持有的事务入口」不是登记过的维度 | 消费者维度恒为「无」+ 入口维度缺失 |
| E-2 | `cleanupAsyncTasks` 同样以 READ COMMITTED 开事务、不升级；计算的 attributeQuery 穿过框架声明的 `_<property>_task` link 时同样失败 | 同 E-1；该格只有显式读取内部 link 才可达，手写用例与生成域都不会构造 | 同族入口，按「修类不修例」枚举时发现 |

## 一、根因

计算侧对隔离级别的要求是显式的：data-based Transform 的 update/delete patch（`src/runtime/computations/Transform.ts` 的
`dataBasedIncrementalPatchCompute`）、非 `atomic-safe` 的 Custom、entity/relation 全量替换与全量重算在 READ COMMITTED 下抛
`RequireSerializableRetry`，由事务持有者把隔离级别升到 SERIALIZABLE 后重跑。框架里的事务持有者分两类：

| 入口 | 修复前 | 修复后 |
|---|---|---|
| `dispatch` / `handleAsyncReturn` / 事务外 storage 写（`withAtomicTransaction`） | `runWithTransactionRetry`（upgrade） | 不变 |
| `maintainEntityRetention`（含自动挂钩） | 直接 `runInTransaction`，默认 READ COMMITTED，不升级 | `runWithTransactionRetry` |
| `cleanupAsyncTasks` | 同上 | `runWithTransactionRetry` |
| `runInBusinessTransaction` | 调用方固定隔离级别，契约为 fail-fast | 不变（契约如此） |
| migration recompute / deletion-scope 模拟 | 固定 SERIALIZABLE | 不变 |

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

| 机制 | 位置 | 敏感性实验（未修复的 v4.11.2 源码） |
|---|---|---|
| 两个入口改走 `runWithTransactionRetry` | `src/runtime/Controller.ts` | — |
| ttl × data-based Transform 源 × 后续实体（PGLite） | `entityRetention.spec.ts` | 红：`Retry transaction with SERIALIZABLE isolation: data-based Transform update/delete patch` |
| cap × data-based Transform 源 × 自动挂钩（PGLite） | 同上 | 红：dispatch reject，同一错误（栈经 `deleteBeyondCap`） |
| 同 ttl 格，真实 PostgreSQL | `postgresqlEntityRetention.spec.ts`（已加入 `npm run test:postgres`） | 红，同一错误（栈经 `PostgreSQLDB.runInTransaction`） |
| `cleanupAsyncTasks` × 读取 task link 的 Transform（PGLite） | `asyncTaskRetention.spec.ts` | 红，同一错误 |
| 维度登记 | `tests/runtime/WritingComputationTests.md`「框架持有的顶层事务入口 × 需要 SERIALIZABLE 的计算」行 | — |

## 四、未处理的相邻项（记录，不在本次修复范围）

- 在已有存储事务内调用 `maintainEntityRetention` / `cleanupAsyncTasks` 时，嵌套 `runInTransaction` 复用外层事务，内层的
  升级重试不能改变外层的隔离级别，错误交给外层事务的持有者处理（与 `handleAsyncReturn` 的现有行为相同）。自动挂钩总是在
  提交之后、事务之外调用，不受影响；本次不改变嵌套调用的语义。
