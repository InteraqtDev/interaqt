status: 已完成
design-round: 4/15
implementation-round: 7/20
current-milestone: M-04
current-milestone-reopens: 1
convergence-mode: normal
next-action: 无

# Condition 声明式准入与事务可见性 — 设计

## 0. 基线

| 项 | 值 |
|----|-----|
| Git revision | `5ae608ec833e3c357d8ecbe8be8beb7c491aa563` |
| 工作树 | 仅未跟踪 `docs/condition-admission-and-tx-visibility/`、`prompt/condition-admission-and-tx-visibility.md` |
| 相关已有测试（设计时） | `condition.spec.ts`、`transactionAcceptance.spec.ts`、`atomicState.spec.ts`、`transactionRetry.spec.ts`、`guard-klasses.spec.ts`：**5 files / 56 tests passed** |
| 真实 PostgreSQL | 本机可用：`PGHOST=127.0.0.1`，角色/库 `interaqt` / `interaqt_test`（PostgreSQL 17.6 Homebrew） |
| 问题陈述 | `prompt/condition-admission-and-tx-visibility.md`（FR-01 / FR-02） |
| 设计裁决 | d1 采纳 R-1/R-2/R-3（savepoint/BoolExp/SERIALIZABLE）；d2 采纳复审 R-1/R-2/R-3（nestedStrategy 作用域 / BT 内 retry 切断升级 / abort 只 throw）；d3 采纳复审 R-1/R-2（BT 提交所有权互斥 / BT 内可重试错误族收窄）；d4 **驳回** 复审 R-1（BT 内 S 族无需按隔离拆成 S-retry；见 §8.4） |

设计期最小求证脚本（临时，非产品代码）：

- 初版：`/tmp/interaqt-condition-admission-exp/prove*.mts`
- d1 裁决复核：`/tmp/interaqt-btx-*.mts`（nested abort / partial commit / retry dup / BoolExp code / SERIALIZABLE）
- d2 裁决：源码核验 `nestedStrategy` 仅声明无分支；`runWithTransactionRetry` 对 `RequireSerializableRetry` 固定升级；`dispatch` abort 路径 JS 不可既 return 又 throw
- d3 裁决：源码核验 `MonoSystem`/`PostgreSQLDB` nested 仅 `depth++`（内层返回≠COMMIT）；`isRetryableTransactionError` 含 `57P01`/`ECONNRESET`/`EPIPE`/`SQLITE_BUSY`（连接级重试前提是顶层新 BEGIN）；设计补充 BT 提交所有权互斥表与 BT 内错误族有限表
- d4 裁决：源码枚举全部 `throw new RequireSerializableRetry` 均带 `getTransactionIsolation() !== 'SERIALIZABLE'`（或 nested `existing.isolation !== 'SERIALIZABLE' && isolation === 'SERIALIZABLE'`）门闩；PGLite 探针：`SERIALIZABLE` 外层下 `getTransactionIsolation()==='SERIALIZABLE'`、嵌套 SERIALIZABLE **不**抛、门闩 wouldThrow=false；RC 外层嵌套 SERIALIZABLE **抛** `RequireSerializableRetry`。结论：BT isolation 已是 SERIALIZABLE 时框架计算路径 **前进** 而非抛 S，不存在「S 被 BT 一律 fail-fast 误杀」的生产路径

经项目 `vite-node --config vitest.config.ts` 执行。

---

## 1. 背景和现状（含求证）

### 1.1 现行路径（源码）

1. **`Controller.dispatch`**（`src/runtime/Controller.ts`）在 `runWithTransactionRetry` 下打开 **一次** `storage.runInTransaction`，顺序执行：`guard`（含 Condition）→ `mapEventData` → 写 EventSource 实体行 → `resolve` → 同步 computation → `afterDispatch`。成功返回后，在事务回调之外运行 `postCommit` 与 `runRecordChangeSideEffects`。默认失败路径把异常收成 `result.error`（软错误），除非 `forceThrowDispatchError`。
2. **默认隔离**为 `READ COMMITTED`；可通过 `RequireSerializableRetry` 提升并重试（`src/runtime/transaction.ts`）。该提升只在 **顶层** `runInTransaction` 真正 `BEGIN` 时有效。
3. **嵌套 `dispatch`** 由 `dispatchExecutionContext`（AsyncLocalStorage）检测，抛出 `NestedDispatchError`（明确文案要求外层提交后再 dispatch）。
4. **Condition**（`src/builtins/interaction/Condition.ts` + `checkCondition` in `Interaction.ts`）：
   - `content` 必须以 `this = Controller` 调用，且 **必须严格返回 `boolean`**；
   - 非 boolean、抛错、或 `false` 均 fail-closed，最终抛 **`InteractionGuardError`**（不是 `ConditionError` 实例；测试多以 `.type` / `.error.data.name` 鸭式断言）；
   - `false` 时 BoolExp 错误载荷为固定串 `"atom evaluate error"`，**不携带业务 code/详情**；
   - 抛错时仅拼接 `e.message`，**丢失**自定义 `code` / `details` 字段；
   - `RequireSerializableRetry` 在 Condition 内抛出时同样被收成错误字符串，**不会**触发 `runWithTransactionRetry` 升级。
5. **行锁基础设施**已存在且在真 PG 上验证过：
   - `storage.atomic.lockRecord` / `lockRows`（`MonoSystem.ts`，要求活跃事务；PG 上 `SELECT … FOR UPDATE` + 关联图锁）；
   - 今日主要服务 Transform 等 computation 内部（如 `Transform.ts`），**不是** Condition / 业务准入的声明式 API。
6. **连接绑定与嵌套策略**：
   - `PostgreSQLDB.transactionCapability.transactionBoundConnection: true`；
   - 全部生产驱动声明 `nestedStrategy: 'reuse'`（`PostgreSQL` / `PGLite` / `SQLite`）或 `'unsupported'`（`Mysql`）；
   - `MonoSystem.runInTransaction` / `PostgreSQLDB.runInTransaction` 在已有事务上下文时仅 **`depth++` 后直接执行 `fn`**，**无 `SAVEPOINT`**；
   - 类型上虽预留 `nestedStrategy: "savepoint"`，**当前无任何驱动实现 savepoint 嵌套**。
   - 因此：嵌套路径上的 throw **不会**单独回滚内层写集；只有最外层 `ROLLBACK` 才能撤销。软错误被 `dispatch` 吞掉后，外层事务仍可提交内层已写入的行。

### 1.2 FR-01 求证 — 缺口 **存在**

**实验**（真 PostgreSQL，同一 `Controller`/`PostgreSQLDB` 池上两次并发 `dispatch`，即两次 `pool.connect()`）：

- 模型：`ExpAccount.balance` 由 StateMachine 在 `ExpDebit` 的 InteractionEvent create 上执行 `balance := balance - amount`；Condition `expHasBalance` 用 **`storage.findOne` 无锁读** 判断 `balance >= amount`，读后 `await delay(150ms)` 放大竞态窗。
- 种子余额 `B = 100`；两次并发各扣 `100`。

**结果**：

```text
successes: 2
finalBalance: -100
overdraft: true
```

**对照**（同一模型，Condition 内改为 `storage.atomic.lockRecord('ExpAccount', id, ['id','balance'])` 再判断）：

```text
successes: 1
finalBalance: 0
overdraft: false
```

**结论**：

- 无声明式串行化时，Condition 无锁读 + 随后 computation 写在默认 READ COMMITTED 下 **可透支**；FR-01 描述的缺口在主干上真实存在。
- `lockRecord` 在 **同一 dispatch 事务** 内已足以修复该实例，但业务必须在 Condition 回调里 **命令式** 调用内部 atomic API，且无文档化的「准入读集」声明、无与 BoolExp 组合的锁合并规则——不满足「官方、可文档化、业务不再手写锁」的验收。
- PGLite / 单连接不能充当本需求完成证明（与 Task 一致）；实现验收必须挂真 PG 双连接（或同池双 client 并发，等价于双连接事务）。

### 1.3 FR-02(a) 求证 — 缺口 **存在**（可见性有、原子边界不完备）

| 场景 | 结果 | 含义 |
|------|------|------|
| A. 外层 `storage.runInTransaction` 内 `create(R)` 后立刻 `dispatch(I)`，Condition 读 `R` | **放行** | 嵌套复用同一绑定连接时，未提交写对 Condition **可见** |
| B. 连接 A 持有未提交 `R`，连接 B 上 `dispatch` | Condition **失败**（看不见 `R`） | 跨连接不可见；「先写再另开 dispatch」在未提交时不可用 |
| C. 外层事务在 dispatch 成功后 `throw` 回滚 | `R` 与 InteractionEvent **均消失**（`eventCount: 0`） | 存储事实可随外层回滚（仅当错误真正传播到外层） |
| D. 同上回滚路径上的 `RecordMutationSideEffect` | **在 outer commit 之前已执行**；回滚后 SE 已触发 | dispatch 把「内层 runInTransaction 返回」当成提交点跑 post-commit 钩子，**外层未提交时副作用已外逸** |
| E. 外层事务内顺序 `dispatch(Inc)` 再 `dispatch(Gate)`（Gate 的 Condition 依赖 Inc 写入） | **Gate 放行** | 多 interaction 顺序组合在复用事务下对后续 Condition 可见 |
| F. 在 guard / resolve 内再 `dispatch` | **`NestedDispatchError`** | 任意嵌套 dispatch 仍禁止 |
| G. 外层事务内 `create` + Condition 拒绝的 `dispatch`（默认软错误） | **`result.error` 存在，外层仍可提交**；draft 行保留 | 软错误 **不**构成 attempt 隔离；「可选 `throw result.error`」不能当官方原子性 |
| H. 自定义 EventSource：`resolve` 中 `create` 后 `throw`；嵌套软错误 | 外层提交后库中同时有 outer 行、半截写、事件行 | 中途失败的部分写集可随外层提交 |
| I. `resolve` 首次写后抛 `RetryableWriteConflict`，第二次成功 | **独立 dispatch**：仅 attempt-2 与 1 条事件；**嵌套 reuse**：`attempt-1`+`attempt-2` 与 **2** 条事件 | 无 savepoint 时 attempt 级重试在嵌套下重复写 |

（G–I 为 d1 裁决轮在真 PG 上复现；脚本 `/tmp/interaqt-btx-*.mts`。）

**结论**：

- 「未提交写对其它连接上的 Condition 不可见」为真；应用若不能把写与 dispatch 放进 **同一存储事务**，只能 commit-then-dispatch，失去原子性——动机成立。
- 框架 **意外** 支持 nested reuse 下的可见性，且在错误 **传播到外层** 时 DB 级回滚可用，但：
  1. **未**文档化为官方组合原语；`NestedDispatchError` 文案仍导向「外层提交后再 dispatch」；
  2. **postCommit / RecordMutationSideEffect 的提交边界错误**：在外层事务未提交时即执行，回滚无法收回；
  3. **无 per-dispatch-attempt 存储回滚边界**（`nestedStrategy: 'reuse'` 且无 savepoint）：软错误、中途 throw、attempt 重试均不能在嵌套下提供「单次 dispatch 尝试」的原子性；
  4. **无**一等「业务事务」API 来约束 defer-commit、fail-fast 与 attempt 隔离。
- 因此 FR-02(a) 仍须交付：官方原语 + **attempt 隔离** + 正确的提交/副作用边界 + 默认 fail-fast。不得把「知情人套一层 `runInTransaction`」或「文档建议 `throw result.error`」算作完成。

### 1.4 FR-02(b) 求证 — 缺口 **存在**

| 尝试 | 结果 |
|------|------|
| `return { allowed: false, code: 'INSUFFICIENT', details: … }`（及 `{ ok: false, … }`） | 拒绝：非 boolean；错误串包含 JSON，**无**稳定 `code` 字段给调用方 |
| `return false` | `InteractionGuardError`，内层 `error: "atom evaluate error"`，**无**业务 code |
| `throw Object.assign(new Error('no credits'), { code:'NO_CREDITS', details })` | 仅保留 message 文本；**code/details 丢弃** |
| 在 Condition 里写 `event.context.resolved = …`（不碰 payload） | 因 `mapEventData` 持久化 `args.context`，且 `cloneDispatchArgs` **不**克隆 `context`，该字段进入 InteractionEvent 并被 StateMachine `computeValue` 看见 |
| 组合 `structuredReject.and(pass)`，content 返回 `{ ok:false, code:'NO_CREDITS' }` | `result.error.code === undefined`（d1 真 PG/同栈复现） |

**BoolExp 协议事实**（`src/core/BoolExp.ts`）：

- `AtomHandle` 契约：返回 `boolean | string`（或 Promise 同形）。
- 返回 **string** → 始终得到 `EvaluateError`（**不**受 `inverse`/NOT 翻转）——fail-closed。
- 返回 **boolean** → 按 De Morgan 受 `inverse` 影响（`false` 在 `not(...)` 下会变成通过）。
- `EvaluateError.error` 仅为 string；**无**自定义字段通道。
- `InteractionGuardError` 仅有 `type/checkType/error`，**无** `code`。

**结论**：

- 官方通道实质上只有 boolean 通过/不通过；类型化错误与稳定 code **不存在**。
- 仅扩展 `content` 返回对象但继续经 `typeof !== 'boolean' → JSON 字符串` 喂给 BoolExp，**无法**让 `result.error.code` 稳定可达。
- 通过 mutation `event.context` 把解析结果塞给下游是 **未文档化的就地修改**，不是只读结果通道。
- `ConditionError` 类与工厂存在，但 `checkCondition` 抛的是 `InteractionGuardError`。
- FR-02(b) 缺口存在；方案必须定义 **content → handleAttribute → BoolExp → 最终错误** 的唯一桥接，且保持 fail-closed。

### 1.5 与现有能力的关系（约束设计）

| 能力 | 设计态度 |
|------|----------|
| `atomic.lockRecord` / `lockRows` | FR-01 **实现复用**；升为 Condition/Interaction 声明式读集的执行后端，不另起锁协议 |
| `runWithTransactionRetry` / SERIALIZABLE | **仅**作为顶层 dispatch / 顶层业务事务 BEGIN 的隔离手段；**不**默认全部 Condition SERIALIZABLE；**不**在 nested reuse 上升级隔离；BT 内对 S **切断** 隔离升级环且 **不** 将 S 纳入 SAVEPOINT 重试（§3.3.2；d4） |
| 外层事务连接复用 | FR-02(a) 的连接共享基础；须补官方 API、**BT 专用 savepoint attempt 隔离**、默认 fail-fast、**defer post-commit** |
| `nestedStrategy` 能力位 | **保持**今日生产驱动声明（`'reuse'` / MySQL `'unsupported'`）；**不**因 BT 改为全局 `'savepoint'`（见 §3.3.2 互斥表） |
| BT 专用 SAVEPOINT | FR-02(a) 仅在 `runInBusinessTransaction` + 其内 `dispatch` attempt 路径强制；由 BusinessTransaction ALS 驱动，**不**改写裸 `storage.runInTransaction` 嵌套语义 |
| BT 提交所有权 | `runInBusinessTransaction` **必须**拥有最外层存储 `BEGIN`/`COMMIT`；禁止在已有存储事务或已有 BT 内启动；flush SE 仅在该最外层 `COMMIT` 成功之后（§3.3.2 A2） |
| BT 内可重试集合 | **严格小于**顶层 `isRetryableTransactionError`：仅序列化失败 / 死锁 / 框架写冲突可在同一外层连接上 SAVEPOINT 重试；连接级错误 fail-fast 整个 BT（§3.3.2 D） |
| 禁止无约束嵌套 dispatch | **保留**；用业务事务内的 **顺序** dispatch 替代 |
| 真 PG 并发测试基建 | FR-01 验收必须使用（同 `test:postgres` 纪律） |

---

## 2. 目标与非目标

### 2.1 目标（对应 Task 编号）

1. **求证**（本节 §1）：FR-01、FR-02(a)、FR-02(b) 均在主干确认存在；无一子项关闭。
2. **FR-01**：官方声明式准入读集（行锁），使「读 → 决定 → computation 应用」在并发 dispatch 下安全；真 PG 合同：余额 `B`、两次并发各扣 `B`、透支上限 0 → 至多一次成功且余额 ≥ 0；示例与文档不手写方言锁 SQL。
3. **FR-02(a)**：官方业务事务（同一存储事务 / 同一连接）支持「先 `storage` 写 `R` 再 dispatch 依赖 `R` 的 interaction」，Condition 可见未提交写；具备 **BT 专用 per-dispatch-attempt SAVEPOINT 隔离**、**默认 abort=throw**、**BT 内切断 SERIALIZABLE 升级环（S 一律 fail-fast，不引入 S-retry）**、**BT 必须拥有最外层存储提交（禁止套在已有 `runInTransaction` / 禁止 BT 重入）**、**BT 内可重试错误族按同连接模型收窄**；回滚时 `R`、interaction 事实与 **框架定义的 post-commit 副作用**均不外逸；并支持同一业务事务内顺序多次 dispatch。明确与 NestedDispatch 的关系；不改全局 nested reuse。
4. **FR-02(b)**：Condition 拒绝时稳定类型化错误（code + message/详情），且在 BoolExp 组合下可达；通过时只读上下文可供同次 dispatch 的 computation 使用且可测，无需 `Object.assign` payload。
5. **复用**现有事务/锁/PG 测试基建；触及 NestedDispatch 时同步文档。
6. **交付纪律**：FR-01 与 FR-02(a)(b) 验收可分；真 PG 环境不可用时不得将 FR-01 里程碑标完成。

### 2.2 非目标

- 不强制所有 Condition 默认 SERIALIZABLE。
- 不在 FR-01/FR-02 主路径交付 Interaction 级「单次 dispatch 升 SERIALIZABLE」嵌套升级（见 §3.2.3 / §3.3.4）。
- 不把应用自建 advisory-lock 助手升格为公共 API。
- 不要求 Condition 回调手写方言 SQL。
- 不把 commit-then-dispatch 固化为推荐模式。
- 不开放任意深度递归嵌套 dispatch。
- 不让 Condition 获得第二套任意写库 API（结果通道只读）。
- 不处理 entity identity / Relation 教义；不改 Mesh 等应用仓库。
- 不把裸 `storage.runInTransaction` + `dispatch` 标为支持完备的官方路径。
- 不把全局 `storage.runInTransaction` 嵌套从 reuse 改为 savepoint；不把 `nestedStrategy` 能力位因 BT 改写成 `'savepoint'`。
- 不支持「外层 `runInTransaction` 包裹 `runInBusinessTransaction`」作为扩展原子范围的手段（A2 入口拒绝）。
- 不在 BT 内对连接级错误复用顶层「新连接重试」语义。

---

## 3. 方案（单一明确方案）

### 3.1 总览

三条能力共享同一原则：**在既有 `dispatch` 事务与 `atomic` 锁之上增加声明式表面与正确的提交/attempt 边界，而不是平行协议。**

```text
FR-01  Interaction/Condition 声明 locks
         → runInteractionGuard 前在当前 dispatch 事务内 lockRecord/lockRows
         → content / computation 共享锁持有期至（savepoint 或）事务结束

FR-02(a) controller.runInBusinessTransaction(fn)
         → 入口 A2：拒绝已有存储事务 / BT 重入 / 无事务能力 / 无 savepoint
         → 唯一合法：打开**最外层** storage 事务 + 业务事务 ALS（BT 拥有 COMMIT）
         → BT 专用 SAVEPOINT（不改全局 nestedStrategy；见 §3.3.2 A）
         → fn 内 storage 写与 controller.dispatch 复用连接
         → 每个 dispatch attempt：SAVEPOINT → 工作 → 成功 RELEASE / 失败 ROLLBACK TO
         → 默认 abort：dispatch 只 throw → fn 中止 → BT reject → 外层 ROLLBACK
         → BT 内 S（RequireSerializableRetry）一律 fail-fast（不升级、不做 S-retry）；仅 W 族（写冲突/40001/40P01）可 attempt 重试；连接级 fail-fast
         → 顺序多次 dispatch 合法；dispatch 栈内再 dispatch 仍 NestedDispatchError
         → postCommit / RecordMutationSideEffect **仅**在 BT 拥有的最外层 COMMIT 成功之后 flush

FR-02(b) Condition content 扩展结果代数（fail-closed）
         → 对象结果不进入 BoolExp；经 handleAttribute 规范化为 boolean|string
         → 结构化拒绝经旁路 channel 在 evaluate 后挂到错误的 code/details
         → 通过：只读 admissionContext 合并进 dispatch 作用域
```

### 3.2 FR-01 — 声明式读集锁

#### 3.2.1 声明面

在 **Condition** 上增加可选锁声明（与守卫同地，便于 BoolExp 组合收集）：

```typescript
type AdmissionLockSpec =
  | {
      mode?: 'record' // default
      recordName: string
      id: string | number | ((event: InteractionEventArgs) => string | number | Array<string | number> | undefined | null)
      attributeQuery?: AttributeQueryData // default ['*']；传入 lockRecord 以稳定读快照
    }
  | {
      mode: 'match'
      recordName: string
      match: MatchExpressionData | ((event: InteractionEventArgs) => MatchExpressionData)
      attributeQuery?: AttributeQueryData
    }

Condition.create({
  name: 'hasBalance',
  locks: [
    {
      recordName: 'Account',
      id: (event) => event.payload.accountId,
      attributeQuery: ['id', 'balance'],
    },
  ],
  content: async function (this: Controller, event, admission) {
    const account = admission.get('Account', event.payload.accountId)
    return !!account && Number(account.balance) >= Number(event.payload.amount)
  },
})
```

规则：

- `locks` 缺省 = 今日行为（无额外锁）。
- 多个 Condition（BoolExp and/or/not）在 **evaluate 之前** 由框架 **并集** 解析所有原子 Condition 的 `locks`（not 下的原子仍收集——锁是隔离手段，不是权限极性）。解析失败（id 回调抛错等）→ 整次 guard 失败。
- 框架在当前 dispatch 事务内按稳定顺序执行锁：
  - 先按 `recordName` 字典序，再按 id 字符串序，避免多资源死锁；
  - `mode:'record'` → `atomic.lockRecord`（已有图锁语义时 attributeQuery 含关联则跟现实现）；
  - `mode:'match'` → `atomic.lockRows`。
- 锁结果放入 **AdmissionSnapshot**（只读）：`get(recordName, id)` / `getAll(recordName)`；作为 `content` 的第二参数（推荐显式第二参数，避免污染 event 形状）。
- `content` 仍可 `findOne`；官方示例应示范优先用 snapshot，避免无锁二次读。
- **不**在 Condition 内鼓励手写 SQL；**不**导出应用级 advisory lock 助手。

#### 3.2.2 并发合同

真 PostgreSQL：`tests/runtime/postgresqlConditionAdmission.spec.ts`（名称可微调），`describeIfPostgres`，独占库后缀（如 `_cond_admission`）。

- 种子余额 `B`，两次并发 `dispatch` 各请求扣 `B`，Condition 仅用声明式 `locks` + snapshot 判断，StateMachine 扣减。
- 断言：成功次数 ≤ 1，最终 `balance >= 0`，且 `balance === B - successCount * B`。
- 负向对照（可同文件）：无 `locks` 的基线在扩大竞态窗下 **允许** 观察到透支或双成功（`test.fails` 或单独 `describe` 文档化现状）——可选；若维护成本高，则以有锁合同 + 设计期实验记录为准。

#### 3.2.3 隔离级别（FR-01 边界，回应 R-3）

| 机制 | FR-01 主路径？ | 规则 |
|------|----------------|------|
| 声明式 `locks` + `lockRecord`/`lockRows` | **是** | 默认 READ COMMITTED 下完成并发合同 |
| Interaction / Condition 声明 `transactionIsolation: 'SERIALIZABLE'` | **否（本任务不交付）** | 从 M-01 范围 **删除**；避免与业务事务 nested 升级语义纠缠 |
| Condition / computation 内 `throw new RequireSerializableRetry(...)` | **不作为官方升级手段** | 今日被 `checkCondition` 收成普通拒绝字符串，**不会**触发 retry 升级（d1 实验：`transactionAttempts=1`）。实现不得依赖该路径做隔离升级；文档明确禁止把它当作 SERIALIZABLE 开关 |
| 顶层（无业务事务）dispatch 因写路径抛出的 `RequireSerializableRetry` | 保持现有框架行为 | 与本任务新增 API 正交；回归既有 `transactionRetry` 测试 |

FR-01 验收 **只**绑定声明式锁合同，不绑定 SERIALIZABLE。

### 3.3 FR-02(a) — 官方业务事务

#### 3.3.1 API

```typescript
// 默认 onDispatchError: 'abort'：Condition 拒绝时 dispatch **throw**，
// fn 中止，runInBusinessTransaction reject，外层 ROLLBACK。
// 调用方用 try/catch 或 await expect(bt).rejects...；不要假设拿到 soft result。
await controller.runInBusinessTransaction(
  {
    name: 'create-and-activate',
    isolation?: 'READ COMMITTED' | 'SERIALIZABLE', // 默认 READ COMMITTED；仅作用于外层 BEGIN
    onDispatchError?: 'abort' | 'continue',         // 默认 'abort'（fail-fast → throw）
  },
  async (tx) => {
    const r = await controller.system.storage.create('Draft', { ... })
    // abort 默认下：Activate 拒绝 → 此处 throw，后续语句不执行；
    // 成功路径才得到 DispatchResponse（无 error）。
    const result = await controller.dispatch(Activate, {
      user,
      payload: { draftId: r.id },
    })
    return result
  }
)
```

`continue` 模式（高级、显式 opt-in）才允许在 `fn` 内读 soft `result.error` 并自行决定是否继续。

#### 3.3.2 存储、嵌套策略与 attempt 语义

##### A. 嵌套路径互斥表（回应 d2 R-1）

今日事实：`nestedStrategy` **仅**出现在驱动能力声明与测试断言；`src/` 内 **无** 按该字段选择 SAVEPOINT 的分支。嵌套真实行为是 `MonoSystem` / 驱动在 `existing` 时 `depth++` 后直接 `fn()`（reuse）。

本任务采用 **模型 1（推荐，唯一采纳）**，禁止实现者在下列三列之间自由混读：

| 路径 | 存储嵌套行为 | `nestedStrategy` 能力位 | 本任务是否改动 |
|------|--------------|-------------------------|----------------|
| 裸 `storage.runInTransaction` 嵌套（无 BT） | **保持今日 reuse**：内层 throw 被外层 catch 后，内层已写入仍留在外层未提交快照 | 生产驱动继续声明 `'reuse'`（MySQL `'unsupported'`） | **不**改为全局 savepoint；**不**谎报能力位 |
| `runInBusinessTransaction` 外层 | **必须**打开真正的顶层 `BEGIN`（与今日顶层事务相同）；见 **A2 提交所有权** | 同上 | 新增 API |
| BT 内每一次 `dispatch` **attempt** | **专用** `SAVEPOINT` / `RELEASE` / `ROLLBACK TO`（由 BusinessTransaction ALS 强制） | **不**因此把 `nestedStrategy` 改成 `'savepoint'` | **是**（BT 专用实现，可另增内部能力探测如 `supportsSavepoint: true`，与 `nestedStrategy` 解耦） |

规则：

1. **BT 专用 SAVEPOINT**：仅当 BusinessTransaction ALS `active` 时，`Controller.dispatch` 的每次 attempt 在已有外层连接上执行 `SAVEPOINT iqt_dispatch_<n>`；成功 `RELEASE`，失败 `ROLLBACK TO`。汇合点：`Controller.dispatch` + `runInBusinessTransaction`，**不**改 `MonoSystem.runInTransaction` 的默认 nested 分支去全局发 SAVEPOINT。
2. **能力探测**：BT 启动时检查驱动是否能执行 savepoint（实现可选：内部 `supportsSavepoint`、或对 PG/PGLite/SQLite 白名单）。不能 → **拒绝** `runInBusinessTransaction`（明确错误），**禁止**静默降级为 reuse。
3. **`nestedStrategy` 字段**：本任务 **不** 把它改写成全局 `'savepoint'`。类型上预留的 `'savepoint'` 值可继续存在，但 **不是** 本任务交付的全局嵌套合同。若未来要把全局嵌套改为 savepoint，须单独任务并覆盖裸嵌套 catch-continue 语义。
4. **非 BT 回归**：无 BT 时，嵌套 `runInTransaction` 的 throw-catch 写集语义与今日一致（内层写在外层 catch 后仍可见于未提交快照）——M-02 用例 J。
5. **提交所有权**：见下行 **A2**（d3）；禁止「假顶层」BT。

| 驱动 | `transactions` | BT savepoint（本任务） | `runInBusinessTransaction` | `nestedStrategy`（公开能力位） |
|------|----------------|------------------------|----------------------------|--------------------------------|
| PostgreSQL | 是 | 必须 | 支持（且须为最外层） | 保持 `'reuse'` |
| PGLite | 是 | 必须 | 支持（功能测试；并发合同仍以真 PG 为准） | 保持 `'reuse'` |
| SQLite | 是 | 必须 | 支持（单连接串行） | 保持 `'reuse'` |
| MySQL | 否（既有） | — | **拒绝** `TransactionCapabilityError` | `'unsupported'` |

##### A2. 业务事务提交所有权 / 嵌套互斥表（回应 d3 R-1）

**关键事实（源码）**

- `MonoSystem.runInTransaction` / `PostgreSQLDB.runInTransaction`：已有活跃事务时仅 `depth++` 后执行 `fn`，**不** `BEGIN`/`COMMIT`。因此「内层 `fn` 正常返回」**不等于**存储已提交。
- 今日 `Controller.dispatch` 在 `runWithTransactionRetry` **返回成功之后**立即 `runPostCommitHook` / `runRecordChangeSideEffects`（`Controller.ts`）。BT 方案把该触发点改为「登记 defer」，**合同前提**是：BT 结束 ≡ 真正拥有并完成最外层 `COMMIT` 之后。
- 若允许 `storage.runInTransaction(async () => { await controller.runInBusinessTransaction(...) })` 静默 nested reuse，则 `fn` 返回后实现若按 §3.3.2 F flush SE，外层随后 `ROLLBACK` 会撤销 DB 事实而 SE 已外逸——与 §1.3 D 同构，FR-02(a) 目标破产。

**入口判定（完整、互斥；按表自上而下第一条命中即停）**

探测手段（实现汇合点，名称可微调，语义固定）：

- **活跃存储事务**：`MonoSystem` 事务 ALS `depth > 0`，或驱动事务上下文显示已在事务中（与 `isInTransaction` / `getActiveTransactionContext` 同源事实）。
- **活跃 BT**：BusinessTransaction ALS 已存在且 `active === true`（含 `aborted` 仍视为 BT 作用域未退出，直至外层 API 返回）。

| # | 入口条件 | `runInBusinessTransaction` 行为 | `fn` | 存储 | defer / SE |
|---|----------|--------------------------------|-----|------|------------|
| A2-1 | 驱动 `transactions: false`（MySQL 等） | **立即拒绝** `TransactionCapabilityError`（或既有能力错误） | **不执行** | 无 | 无 |
| A2-2 | 驱动不支持 BT 所需 SAVEPOINT | **立即拒绝**（明确错误，如 `BusinessTransactionUnsupportedError`） | **不执行** | 无 | 无 |
| A2-3 | 已存在活跃存储事务（任意外层 `runInTransaction` / 其它已 BEGIN 上下文） | **立即拒绝**（明确错误，如 `BusinessTransactionNestingError`）；**禁止**静默 reuse 成「假顶层」 | **不执行** | 不新增 BEGIN；不 flush | 无 |
| A2-4 | 已存在活跃 BT ALS（BT 重入 / 嵌套 BT） | **立即拒绝**（同上或专用 `BusinessTransactionReentrancyError`）；**禁止**重入 | **不执行** | 不新开 BT | 无 |
| A2-5 | 无活跃存储事务、无活跃 BT、驱动支持事务+savepoint | **唯一合法路径**：本 API **打开**最外层 `BEGIN`（`storage.runInTransaction` 顶层分支），设置 BT ALS `active`，执行 `fn` | 执行 | 见 F | 见 F / 下表 flush |

说明：

1. **BT 的存储提交边界与 `storage.runInTransaction` 最外层边界重合**。调用方 **不得**再包一层外层事务来「扩展」原子范围；需要更大原子范围时，把全部 `storage` 写与 `dispatch` 放进 **同一个** `runInBusinessTransaction` 的 `fn`。
2. **flush 谓词（硬）**：`deferredPostCommits` / `deferredMutationEffects` **仅当且仅当** A2-5 路径上最外层 `COMMIT` **成功返回之后**执行。任一拒绝入口、`fn` throw、外层 `ROLLBACK`、或 COMMIT 失败 → **丢弃** defer，**零次** SE 外逸。
3. **禁止**实现把「BT 的 `runInTransaction` 回调返回成功」误当成提交完成而去 flush——在 A2-3 若被错误放行，二者不等价；正确实现因 A2-3 根本不进入 `fn`。
4. **与 H 的关系**：裸 `runInTransaction`+`dispatch` 仍为非官方完备路径；本表保证 **官方** BT **不会**继承该路径的假提交边界。
5. **错误类型**：可用单一 `BusinessTransactionBoundaryError` 区分 `code`（`NESTED_STORAGE_TRANSACTION` / `REENTRANT` / `SAVEPOINT_UNSUPPORTED`），或分类型；须稳定可测、带清晰 message。不要求本任务统一全库错误命名风格之外的新教义。

**生命周期（仅 A2-5）**

```text
enter runInBusinessTransaction
  → assert A2-1..A2-4 皆未命中
  → BEGIN (outer, owned by BT)
  → BT ALS active = true
  → run fn (storage writes + sequential dispatch with BT savepoints)
  → if fn throws: ROLLBACK; discard defer; clear ALS; reject
  → if fn returns: COMMIT
       → if COMMIT fails: discard defer; clear ALS; reject
       → if COMMIT ok: flush defer in registration order; clear ALS; resolve
```

##### B. BusinessTransactionContext（ALS）状态

| 字段 | 含义 |
|------|------|
| `active` | 业务事务进行中 |
| `isolation` | 外层 BEGIN 隔离级别（内层继承，不可升级） |
| `onDispatchError` | `'abort'`（默认）或 `'continue'` |
| `deferredPostCommits` | 待冲刷的 postCommit 钩子队列 |
| `deferredMutationEffects` | 待冲刷的 RecordMutationSideEffect 所需 effects |
| `aborted` | fail-fast 已触发；后续 `dispatch` 应立即拒绝 |

##### C. 单次 `dispatch` 在业务事务内的 attempt 表

| 步骤 | 行为 |
|------|------|
| 进入 attempt | `SAVEPOINT iqt_dispatch_<n>`（名称实现可微调，须唯一） |
| guard / map / create event / resolve / sync computation / afterDispatch | 与今日相同，写在同一连接、同一外层事务中；锁与未提交写可见 |
| attempt **成功**（无 throw） | `RELEASE SAVEPOINT`；将本 attempt 的 postCommit / mutation effects **登记**到推迟队列（**不**立即执行） |
| attempt **失败**（throw） | `ROLLBACK TO SAVEPOINT` → 该 attempt 的存储写集撤销；截断本 attempt 登记的内存 effects / event 基线；**不**登记 SE |
| attempt 级重试 | 见下行 **D. BT 内 retry 策略**；每次 attempt 独立 savepoint |
| 可重试错误耗尽 | 视为该次 dispatch 失败，进入 **E. 失败传播** |
| 隔离升级请求（S 族，见 D） | **立即**失败该 dispatch，**零次**隔离升级重试；**不**按当前 isolation 做 S 族 attempt 循环（见 D 与 d4 裁决） |

##### D. BT 内 retry 策略（回应 d2 R-2 + d3 R-2；d4 钉死 S 族语义）— 完整有限错误族表

**事实**

1. `Controller.dispatch` 固定包在 `runWithTransactionRetry` 内；该函数对 `isRequireSerializableRetry(error)` **会**把 `isolation` 设为 `SERIALIZABLE` 并 `continue`；嵌套已存在 RC 事务时再请求 SERIALIZABLE **再次**抛出同族错误 → 空转至 `TransactionRetryExhaustedError`。须切断该环（d2）。
2. `isRetryableTransactionError`（`src/runtime/transaction.ts`）今日集合为：
   - 类型：`RetryableWriteConflict`
   - 码：`40001`（serialization_failure）、`40P01`（deadlock_detected）、`57P01`（admin_shutdown）、`ECONNRESET`、`EPIPE`、`SQLITE_BUSY`
   - 注释写明：`57P01` / `ECONNRESET` / `EPIPE` 的重试前提是「**从池里取新连接，事务从头执行**」。
3. 顶层（无 BT）每次 attempt 经 `runInTransaction` **真正** `BEGIN`（新连接或新事务），连接级重试有意义。
4. BT 下外层事务已 `BEGIN`，attempt 仅 `SAVEPOINT` / `ROLLBACK TO`；PG 上 `transactionBoundConnection: true`。连接已断时，在**同一** BT 外层上 `continue` **不能**取得新连接/新事务。因此 BT 内 **禁止**无参复用全量 `isRetryableTransactionError`。
5. **生产路径中 `RequireSerializableRetry` 的抛出条件（d4 源码枚举）**：
   - `Controller` entity/relation replace、`Transform` update/delete patch、`Scheduler` full-recompute / custom / patch 等：均先判断 `getTransactionIsolation() !== 'SERIALIZABLE'`，**仅在非 SERIALIZABLE 时**抛出。
   - `MonoSystem` / `PostgreSQLDB` nested `runInTransaction`：仅当 `existing.isolation !== 'SERIALIZABLE' && requested === 'SERIALIZABLE'` 时抛出。
   - 因此：当 BT（或任意外层事务）**已经**以 `SERIALIZABLE` BEGIN 且 `getTransactionIsolation()` 报告 `SERIALIZABLE` 时，上述路径 **直接前进**，**不会**再抛 `RequireSerializableRetry`。顶层 `runWithTransactionRetry` 在已是 SERIALIZABLE 后对同族错误的 `continue`，对应的是「升级后的新 BEGIN attempt」，不是「同一已 SERIALIZABLE 连接上的无意义重跑门闩」。
   - d4 探针（PGLite）：SERIALIZABLE 外层下 isolation 可见、嵌套 SERIALIZABLE 不抛、门闩 wouldThrow=false；RC 外层嵌套 SERIALIZABLE 抛 `RequireSerializableRetry`。

**错误族 → 行为（互斥；禁止再写「…」；按判定顺序：先 RequireSerializable，再 BT-savepoint-retryable，再 connection-fatal，再 other）**

| 错误族 | 判定（实现须等价） | 无 BT（今日，保持） | BT 内（本任务钉死） |
|--------|-------------------|---------------------|---------------------|
| **S — 隔离升级请求** | `isRequireSerializableRetry(error)` | 将 isolation 升为 SERIALIZABLE 并重试；耗尽 → `TransactionRetryExhaustedError` | **无论** BT 当前 isolation 是 `READ COMMITTED` 还是 `SERIALIZABLE`：**立即**结束该 dispatch（当前 attempt 已 SAVEPOINT 回滚）；**零次**「设 isolation=SERIALIZABLE 再 continue」；**零次**把 S 当作 W 族做 SAVEPOINT attempt 循环；错误对调用方 **可识别**为 `RequireSerializableRetry`（或稳定包装且 `cause`/`causedBy` 为原实例，**不得**仅暴露无 cause 的 `TransactionRetryExhaustedError`）。RC BT：消息/文档提示改用 `runInBusinessTransaction({ isolation: 'SERIALIZABLE' })`。SERIALIZABLE BT：若仍观测到 S（仅非生产门闩路径或测试注入），同样 fail-fast 且可识别——**不是**「应重试却被误杀」；生产门闩路径在已 SERIALIZABLE 下本就不会抛 S（事实 5） |
| **W — 同连接可 SAVEPOINT 重试** | `RetryableWriteConflict` **或** 错误链含码 `40001` **或** `40P01`（**仅此二码**；不含连接级码） | 退避重试至耗尽（今日全量集合的一部分） | **允许**同一 dispatch 多 attempt；每 attempt 独立 SAVEPOINT；**不得**改外层 isolation；耗尽 → 该 dispatch 失败 → E |
| **C — 连接级 / 须换连接才能恢复** | 错误链含码 `57P01`、`ECONNRESET`、`EPIPE`（任一） | 退避重试（新 BEGIN / 新连接） | **零次**「当作可恢复 attempt」的重试；当前 attempt 尽力 `ROLLBACK TO`（若连接已不可用则记录并继续传播）；错误 **立即**传播使 `runInBusinessTransaction` **失败**（走 E / F 的 reject + 外层 `ROLLBACK` 尽力而为）；`cause` 链保留原错误；**不得**循环至 `maxAttempts` 耗尽再包装成「重试耗尽」假象 |
| **Q — SQLite 忙** | 错误链含码 `SQLITE_BUSY` | 退避重试（今日） | **BT 内归入 C 同类：fail-fast 整个 BT（零次 SAVEPOINT 级重试）**。理由：BT 持有外层写事务时，同进程单连接串行下再 attempt 通常不能消除 BUSY 根因；与「同连接 SAVEPOINT 重试可自愈」的 W 族不同。若未来有证据支持 BUSY 在 SAVEPOINT 下可自愈，须另开任务改表，本任务不得含糊默许 |
| **O — 其它** | 非 S/W/C/Q（含 Condition/guard 拒绝、普通 Error、约束违反等） | 单次失败 | 单次失败 → E |

**集合关系（不变量）**

```text
BT_SAVEPOINT_RETRYABLE  = { RetryableWriteConflict } ∪ { 40001, 40P01 }
BT_CONNECTION_FATAL     = { 57P01, ECONNRESET, EPIPE, SQLITE_BUSY }
TOP_LEVEL_RETRYABLE     = BT_SAVEPOINT_RETRYABLE ∪ BT_CONNECTION_FATAL   // 即今日 isRetryableTransactionError
BT 内 attempt 循环谓词  = BT_SAVEPOINT_RETRYABLE   // S ∉ 该集合；S 一律 fail-fast，与 BT isolation 无关
BT 内 对 S∪C∪Q          = 立即失败，不 continue
生产路径：isolation===SERIALIZABLE  ⇒  框架门闩路径不抛 RequireSerializableRetry
```

**汇合点（实现必须单点，禁止分叉）**

在 `Controller.dispatch` 内对 BT 使用 **BT 感知** 的 retry 包装，**必须**满足：

1. **不得**无参调用今日 `isRetryableTransactionError` 全集合作为 BT attempt 的 `continue` 条件。
2. 任选其一（语义等价即可）：
   - 扩展 `runWithTransactionRetry(..., { onRequireSerializableRetry: 'fail-fast', retryablePredicate: isBusinessTransactionSavepointRetryable })`；或
   - 导出 `isBusinessTransactionSavepointRetryable` / `isBusinessTransactionConnectionFatal`（或单一分类函数），BT 专用 `runDispatchAttemptsInBusinessTransaction` 只对 W 族循环，对 S/C/Q/O 按上表处理。
3. **不得**实现「BT isolation 已是 SERIALIZABLE 时对 S 做 SAVEPOINT 重试」分支：生产路径在该隔离下不抛 S；为测试注入的 S 也 fail-fast 即可，避免双语义。
4. 非 BT 顶层路径保持今日全量 `isRetryableTransactionError` + RequireSerializable 升级默认，既有 `transactionRetry` 测试不得被本任务改红。
5. BT 外层 `BEGIN` 必须把所选 isolation 写入与 `getTransactionIsolation()` 相同的事务上下文（与今日 `MonoStorage.runInTransaction` 一致），以便 Transform/Scheduler/replace 门闩在 SERIALIZABLE BT 下正确放行。

**与用例对照**

| 用例 | 覆盖 |
|------|------|
| F | W 族：`RetryableWriteConflict` 一次后成功 → 仅最终 attempt 事实 |
| K | S 族（**BT + RC**）：RequireSerializable → 一次失败、可识别、无空转升级 |
| K′ | （推荐，非 S-retry）**BT + SERIALIZABLE**：走一条在 RC 下会抛 `RequireSerializableRetry` 的生产门闩路径（如 data-based Transform update/delete，或 entity replace / full recompute）；期望 **成功前进**（不抛 S、不 fail-fast 误杀），证明 isolation 上下文对门闩可见。**不是**「注入 S 后应 SAVEPOINT 重试」 |
| N | C 族：注入 `ECONNRESET` 或 `57P01`（mock / 错误码包装）→ BT **立即**失败；attempt 计数为 1（无 N 次连接级重试） |

##### E. 失败传播合同（回应 d2 R-3）— 互斥，禁止「既返回又抛出」

| 模式 | `dispatch` 对调用方（BT 的 `fn` 内） | `fn` / `runInBusinessTransaction` | 存储与 defer |
|------|-------------------------------------|-----------------------------------|--------------|
| 无 BT（今日） | 默认 soft：`result.error`；`forceThrowDispatchError===true` 则 **throw** | — | 失败 attempt 整段 ROLLBACK；成功后立即 SE |
| BT + `onDispatchError: 'abort'`（**默认**） | **只 throw**，不返回含 `error` 的 soft `DispatchResponse`。抛出对象须带 FR-02(b) 的 `code`/`details`（Condition 路径）或保持原错误类型（`RequireSerializableRetry` 等）；可用薄包装（如 `BusinessTransactionAbortedError`）但 **必须** `cause`/`causedBy` 保留原错误且 `code` 等可枚举字段对调用方可达 | `fn` 因 throw 中止；`runInBusinessTransaction` **reject**（同一错误或上述包装）；**不** resolve 出「带 error 的结果对象」 | 失败 attempt 已 SAVEPOINT 回滚；外层 `ROLLBACK`；丢弃 defer 队列 |
| BT + `onDispatchError: 'continue'`（显式 opt-in） | **只** soft：返回与今日同形的 `DispatchResponse`（`error` 有值），**不** throw | `fn` 可继续读 `result.error` 并决定后续；原子性由调用方负责 | 失败 attempt 已 SAVEPOINT 回滚；外层事务仍由 `fn` 正常返回 → COMMIT 或 `fn` throw → ROLLBACK |

说明：

- JavaScript 中同一 `await dispatch(...)` **不可**既得到返回值又抛出；设计与示例 **禁止** 再写「返回 soft 且抛出」。
- **不得**把原子性建立在文档可选的 `if (result.error) throw result.error`。
- 默认 `'abort'` 下，成功路径才把 `DispatchResponse` 返回给 `fn`；拒绝路径用 `try/catch` 或 `expect(runInBusinessTransaction(...)).rejects`。
- `forceThrowDispatchError`：无 BT 时保持今日语义。**BT 内忽略该标志**，失败传播只由 `onDispatchError` 决定（abort=throw，continue=soft），避免 continue×forceThrow 组合矩阵。

##### F. `fn` 结束（仅 A2-5 合法进入后）

前提：本表只描述 **A2-5** 已打开、由 BT **拥有**的最外层事务。A2-1..A2-4 在入口即拒绝，不进入本表。

| 结果 | 存储 | 推迟队列 |
|------|------|----------|
| `fn` 正常返回且未因 abort 抛出，且最外层 **`COMMIT` 成功** | 外层 `COMMIT`（BT 拥有的那次） | **仅在 COMMIT 成功返回之后**，按登记顺序执行 postCommit 与 RecordMutationSideEffect；某个 SE 失败不回滚已提交事实（与今日单 dispatch 合同一致） |
| `fn` 正常返回但 **`COMMIT` 失败** | 驱动已失败提交 / 连接可能不可用 | **丢弃** defer；**零次** SE；`runInBusinessTransaction` reject（cause 保留提交错误） |
| `fn` 抛错（含 abort 路径、W 族耗尽、S/C/Q/O 失败） | 外层 `ROLLBACK`（尽力） | **丢弃**；副作用不得外逸 |

##### G. 无业务事务时

- `dispatch` 行为与今日完全一致（顶层 BEGIN/COMMIT、失败整 attempt 回滚、成功后立即 SE、soft error 默认）。
- 独立 `dispatch` 的 retry 回归：仍只有最后一次成功 attempt 的事实。

##### H. 裸 `storage.runInTransaction` + `dispatch`

- **不**标为官方支持完备路径；文档写明：无 attempt savepoint、软错误可提交部分写、SE 可能在外层 commit 前触发。
- 官方唯一推荐：`runInBusinessTransaction`。
- 非 BT 嵌套 reuse 语义见互斥表与用例 J，**不得**被 BT 实现连带修改。

#### 3.3.3 与 NestedDispatch / Activity

- 任意 `dispatch` 调用栈内的嵌套 dispatch：**继续禁止**（`NestedDispatchError`）。
- 业务事务内 **顺序** 多次 `dispatch`：**允许且推荐** 作为多 interaction 原子组合。
- Activity 逐步 dispatch 若需与前置 `storage` 写原子，应由应用把整段包在 `runInBusinessTransaction` 中；本任务不重写 Activity 运行时，除非实现时发现 Activity 路径绕过 defer / savepoint 点（实现期枚举 `dispatch` 唯一出口）。
- 更新 `NestedDispatchError` 文案：指向业务事务内顺序 dispatch，而非仅「提交后再 dispatch」。

#### 3.3.4 业务事务与隔离级别

| 场景 | 行为 |
|------|------|
| `runInBusinessTransaction({ isolation: 'READ COMMITTED' })`（默认） | 外层 `BEGIN ISOLATION LEVEL READ COMMITTED`；内层 dispatch **继承**；出现 `RequireSerializableRetry` → 按 §3.3.2 D **立即失败**，不升级；依赖 SERIALIZABLE 门闩的 computation（Transform update/delete、full recompute、entity/relation replace 等）在 RC BT 内会按今日语义抛 S 并因此失败——调用方应改用 SERIALIZABLE BT 或避免这些路径 |
| `runInBusinessTransaction({ isolation: 'SERIALIZABLE' })` | 外层即以 SERIALIZABLE BEGIN，且 **必须**写入 `getTransactionIsolation()` 可读的上下文；内层全部继承；框架门闩路径 **放行**（不抛 S）；若仍出现 S（注入/非门闩）→ 同 D **fail-fast**，**不**做 S 族 SAVEPOINT 重试，**不**再「升级」 |
| 业务事务内 Interaction 若未来存在 isolation 字段 | 本任务不交付该字段；若调用方以其它方式请求 nested SERIALIZABLE → fail-fast（同 D；在已 SERIALIZABLE 外层上 nested 请求 SERIALIZABLE 今日不抛，保持该行为） |
| 顶层（无业务事务）既有 retry 升 SERIALIZABLE | 不变 |

#### 3.3.5 验收（M-02 必须覆盖）

真 PG（功能语义亦可用 PGLite 辅助，但 attempt/隔离相关以真 PG 为准）固定用例：

| # | 场景 | 期望 |
|---|------|------|
| A | 业务事务内 `create(R)` → `dispatch(I)`，Condition 见 `R` | 放行；提交后行与事件存在 |
| B | 同上，`fn` 末尾 throw | 回滚后无 `R`、无事件；测试用 SE **未**执行 |
| C | 业务事务内 Condition 拒绝（默认 `abort`） | `await expect(runInBusinessTransaction(...)).rejects` 且错误带稳定 `code`（FR-02(b) 落地后）或至少可识别 guard 错误；库中无 `R`、无事件、SE 未执行；**不是** resolve 出 soft result |
| D | 业务事务内 `create` 后两次 dispatch，第一次 Condition 失败（默认 abort） | `runInBusinessTransaction` reject；无前置 `storage` 写、无事件、无 SE |
| E | 业务事务内 EventSource：`create` 辅助行后 `throw` | 辅助行与事件均不泄漏到提交后 |
| F | 业务事务内 `RetryableWriteConflict` 一次后成功 | 仅最终成功 attempt 的事实与 **1** 条事件（无双写）；证明写冲突重试 **未**被整表关掉 |
| G | 独立 `dispatch`（无业务事务）同构 retry | 回归：仅最后一次 attempt 事实 |
| H | 无业务事务时成功 `dispatch` 的 SE | 仍在成功后执行（回归） |
| I | 业务事务 `fn` 内、某次 dispatch 的 **调用栈内**再 `dispatch` | `NestedDispatchError` |
| J | **非 BT**：外层 `storage.runInTransaction` 内嵌套 `runInTransaction`，内层写入后 throw，外层 catch 后读库 | 与今日 reuse 一致：未提交快照中仍可见内层写（证明未把全局嵌套改成 savepoint） |
| K | BT + RC：attempt 内抛 `RequireSerializableRetry` | **一次**失败；`runInBusinessTransaction` reject；错误可识别为 `RequireSerializableRetry`（或 cause 链上为该类型）；`transactionAttempts` 对应该次 dispatch 为 1（无 N 次空转升级）；外层无残留写；与 F 对照 |
| K′ | BT + SERIALIZABLE：生产门闩路径（RC 下会抛 S 的 Transform update/delete 或等价） | **成功前进**（门闩见 isolation=SERIALIZABLE 不抛 S）；**不是**「注入 S 后多 attempt 重试」。可选负向：同 BT 内 **测试注入** `throw new RequireSerializableRetry(...)` → 仍一次 fail-fast（与 K 同形），证明 S ∉ `BT_SAVEPOINT_RETRYABLE` |
| L | 已在 `storage.runInTransaction` 内调用 `runInBusinessTransaction` | **立即拒绝**（A2-3）；`fn` **不执行**（可用 spy/计数器证明零调用）；无 BT 拥有的 COMMIT；无因本调用而产生的 defer flush；错误稳定可识别为嵌套/边界类 |
| M | BT 的 `fn` 内再次 `runInBusinessTransaction`（重入） | **立即拒绝**（A2-4）；内层 `fn` 不执行；外层 BT 按调用方是否 catch 决定继续或回滚；推荐默认测试：未 catch → 外层 reject 且无提交事实 |
| N | BT 内 dispatch attempt 注入连接级错误（`ECONNRESET` 或 `57P01` 包装 Error） | **零次**连接级 attempt 重试；`runInBusinessTransaction` 失败；dispatch 侧 attempt 计数为 1；与 F（W 族可重试）对照，证明未「全开」也未「全关」写冲突重试 |
| O |（推荐）BT 成功路径：登记 SE spy，断言 SE 仅在 outer `COMMIT` 之后执行一次 | 与 B（回滚无 SE）成对；可用 hook 顺序或 `committed` 标志证明 flush 谓词 |

### 3.4 FR-02(b) — Condition 结果通道

#### 3.4.1 返回值代数（fail-closed）

`content` 允许：

| 返回值 | 含义 |
|--------|------|
| `true` | 通过（兼容） |
| `false` | 拒绝（**布尔极性**，受 BoolExp `not` 翻转）；默认 code `CONDITION_REJECTED`（仅当该 false 在最终求值中导致拒绝时出现在错误上） |
| `{ allowed: true, context?: Record<string, unknown> }` | 通过；`context` 浅合并进 admissionContext |
| `{ allowed: false, code: string, message?: string, details?: unknown }` | **结构化拒绝**（见桥接表）；稳定 code |
| 其它（含 `undefined`、带 `ok` 等非合同字段的 object、缺 `allowed` 的 object） | **拒绝**（fail-closed），code `CONDITION_INVALID_RESULT` |

判别字段固定为 **`allowed: boolean`**。不使用 `ok`、`success`、`pass` 等非正式字段；实现不得把它们当作通过/拒绝的同义词（一律 `CONDITION_INVALID_RESULT`）。

抛错：

- 若 `error` 已是框架 guard/condition 错误，按实现单点规范化传播（保持可预测）。
- 其它 throw：包装为结构化拒绝，`code` 取 `error.code` 若为非空 string，否则 `CONDITION_THROWN`；`message` 来自 `Error.message`；`details` 可带 `cause`。

#### 3.4.2 content → BoolExp → 错误 桥接（完整合同，回应 R-2）

**原则**

1. **对象结果不得原样进入 BoolExp**（AtomHandle 只接受 `boolean|string`）。
2. 结构化拒绝必须走 **error string** 路径进入 BoolExp，以保证在 `not(...)` 下仍 fail-closed（string 结果不受 `inverse` 翻转——既有 `BoolExp.evaluateAsync` 契约）。
3. 稳定 `code/details` **不**编码进 string 再解析；而由 `checkCondition` 级 **旁路 channel**（例如 `Map<ConditionInstance, RejectionInfo>` 或与本次 evaluate 绑定的闭包变量）在 atom 规范化时写入，在 `evaluateAsync !== true` 后读出，挂到抛出的 `InteractionGuardError`。
4. 汇合点唯一：`checkCondition`（及共享的 `runInteractionGuard`）。

**handleAttribute 规范化表**

| content 结果 / 抛错 | 写入旁路 channel | 返回给 BoolExp | 备注 |
|---------------------|------------------|----------------|------|
| `true` | 无拒绝信息 | `true` | |
| `{ allowed: true, context? }` | 合并 `context` → admissionContext（通过侧） | `true` | `context` 非对象则视为 invalid |
| `false` | 可选记录「布尔拒绝」默认 `CONDITION_REJECTED` + conditionName | `false` | 受 NOT 翻转（兼容今日布尔语义） |
| `{ allowed: false, code, message?, details? }` | `{ code, message, details, conditionName }`；`code` 缺省或非 string → 按 invalid 处理 | **string**（人类可读，含 name/message；**不是** code 的唯一载体） | **不受** NOT 翻转 |
| 非法返回值 | `{ code: 'CONDITION_INVALID_RESULT', ... }` | **string** | fail-closed |
| throw 且带 string `code` | `{ code, message, details?, conditionName }` | **string** | |
| throw 无 string `code` | `{ code: 'CONDITION_THROWN', ... }` | **string** | |
| throw `RequireSerializableRetry` | 同 throw 规则（通常 → `CONDITION_THROWN` 或保留 name）；**不**触发事务升级 | **string** | 与 §3.2.3 一致 |

**evaluate 之后**

```text
result = await conditions.evaluateAsync(handleAttribute)
if (result === true) → 准入通过；admissionContext 只读冻结后交给 dispatch 后续
else →
  failingAtom = result.data          // ConditionInstance
  info = channel.get(failingAtom)    // 若布尔 false 且无 structured，用 CONDITION_REJECTED
  throw InteractionGuardError(..., { code: info.code, details: info.details, conditionName, error: result, ...兼容字段 })
```

**组合条件时以哪个 code 为准**

| 表达式 | BoolExp 行为（既有） | code 来源 |
|--------|---------------------|-----------|
| `A.and(B)`，A 结构化拒绝 | 短路，返回 A 的 `EvaluateError` | A |
| `A.and(B)`，A 通过、B 拒绝 | 返回 B 的 `EvaluateError` | B |
| `A.or(B)`，A 拒绝、B 通过 | 整体通过 | 无错误 |
| `A.or(B)`，A 与 B 均拒绝 | 返回 **B** 的 `EvaluateError`（左失败后评右，右仍失败则返回右） | **B**（右） |
| `not(A)`，A 返回 `false` | 布尔翻转 → 通过 | 无错误 |
| `not(A)`，A 结构化拒绝 / invalid / throw（string 路径） | string → 始终 `EvaluateError`，**不**翻转 | A 的 structured code |
| `not(A)`，A 返回 `true` | 翻转 → 拒绝；无 structured | `CONDITION_REJECTED`（或实现选定的 NOT 失败默认 code，须单测固定） |

**`false` vs `{ allowed: false }`**

| | `false` | `{ allowed: false, code }` |
|--|---------|----------------------------|
| BoolExp 路径 | boolean | error string |
| 受 `not` 翻转 | 是 | **否**（fail-closed） |
| 稳定业务 code | 默认 `CONDITION_REJECTED` | 调用方 code |
| 官方示例 | 简单开关 | **推荐**用于需稳定 code 的业务拒绝 |

#### 3.4.3 错误形状

统一 dispatch 失败时调用方可依赖：

```typescript
interface ConditionRejectionError /* 实现：扩展后的 InteractionGuardError */ {
  errorType?: string
  name: 'InteractionGuardError'
  type: 'condition check failed'   // 兼容既有鸭式
  checkType: 'condition'
  conditionName?: string
  code: string                     // 稳定业务/框架 code
  details?: unknown
  error: EvaluateError<...>        // 兼容既有
  // message：人类可读
}
```

优先路径：`checkCondition` 抛出的错误 **同时**满足现有鸭式字段与新 `code`/`details`。收敛公开类型：`InteractionGuardError` 增加 `code/details`；`ConditionError.conditionCheckFailed` 与其对齐或变为别名，避免文档/运行分裂。

#### 3.4.4 只读上下文

- 单次 dispatch（及业务事务内该次 dispatch）级 `AdmissionContext`：Condition 通过结果合并；**Object.freeze** 浅层或只读视图。
- 写入 InteractionEvent：`mapEventData` 将 admissionContext 合并进 `context` 的保留键 `context.admission`（用户 context 顶层键保留，admission 放子键）。
- computation 通过 `event.record.context.admission` 只读访问；测试可断言。
- **禁止**将 admission 当作可写共享袋在 computation 间再写回。
- `cloneDispatchArgs` **浅克隆 `context`**，避免 Condition 与调用方共享可变引用；官方通道走返回值合并。

#### 3.4.5 验收矩阵（M-03）

| # | content / 组合 | 期望 `result.error.code`（或通过） |
|---|----------------|-------------------------------------|
| 1 | 单原子 `{ allowed:false, code:'NO_CREDITS', details }` | `'NO_CREDITS'`，details 可达；无二次查库 |
| 2 | 单原子 `false` | `'CONDITION_REJECTED'` |
| 3 | throw `{ message, code:'NO_CREDITS' }` | `'NO_CREDITS'` |
| 4 | 非法返回值 / `{ ok:false }` | `'CONDITION_INVALID_RESULT'` |
| 5 | `reject.and(pass)` | 左 code |
| 6 | `pass.and(reject)` | 右 code |
| 7 | `rejectA.or(rejectB)` | **B** 的 code |
| 8 | `not(structuredReject)` | 仍拒绝，code 为结构化 code（不翻转成通过） |
| 9 | `not(false)` | 通过（布尔兼容） |
| 10 | `{ allowed:true, context:{ accountId } }` | 通过；computation 见 `context.admission.accountId`；payload 无污染 |

### 3.5 文档与导出

- usage：Condition 声明式锁；`runInBusinessTransaction`（含 savepoint / fail-fast / 隔离边界）；Condition 结果代数与 BoolExp 组合 code 规则；NestedDispatch 与业务事务对照表。
- 更新 `NestedDispatchError` 文案。
- 明确：Condition 内抛 `RequireSerializableRetry` **不是**隔离升级开关。
- `npm run check` 覆盖公开类型；`InteractionGuardError` / 新 API 从包根导出。

### 3.6 明确不采用的备选

| 备选 | 未采纳原因 |
|------|------------|
| 仅 SERIALIZABLE 默认 | 成本高；非目标；且 nested 无法升级 |
| Interaction 级 SERIALIZABLE 作为 FR-01 主路径 | 与业务事务 nested 语义冲突；Condition 抛 Retry 无效；本任务用声明式锁 |
| 仅整笔业务事务重试、attempt 内禁止 retry | 可行但差：拉长临界区、强制 `fn` 全幂等；在 savepoint 可用时不如 attempt 级 savepoint |
| 仅文档要求 `throw result.error` | 默认软错误合同下不可依赖；违背 fail-closed 原子性 |
| 原子 decrement 专用 API 替代锁 | 覆盖面窄；可作后续 |
| 开放嵌套 dispatch | 与事务/重试/SE 模型冲突大 |
| 仅文档化「请用 lockRecord」 | 非声明式，BoolExp 难组合 |
| 把 code 塞进 EvaluateError 字符串再 regex | 脆弱；旁路 channel 更清晰 |

---

## 4. 里程碑

### M-01 — FR-01 声明式读集锁 + 真 PG 并发合同

- **状态**：已完成
- **reopen-count**：2
- **reopen-domains**：admission-snapshot-readonly: 2
- **前置**：无
- **覆盖**：Task §2 FR-01；§5 复用 atomic；§6 真 PG 纪律
- **可观察结果**：
  - Condition 支持 `locks` + content 第二参数 AdmissionSnapshot（或等价）；
  - `checkCondition` / `runInteractionGuard` 在求值前加锁；
  - 真 PG 并发扣减合同绿；无锁手写 SQL；
  - **不**交付 Interaction 级 SERIALIZABLE 声明。
- **验收命令**：
  ```bash
  INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
    npx vitest run tests/runtime/postgresqlConditionAdmission.spec.ts
  npx vitest run tests/runtime/condition.spec.ts tests/builtins/guard-klasses.spec.ts
  npm run check
  ```
  （文件名若在实现时微调，以设计文档同步更新的路径为准。）
- **最新证据**（implementation-round 3；审计 k3 **关闭**；domain `admission-snapshot-readonly` 闭合）：
  - **汇合点修复**：`acquireAdmissionLocks` 取消 `locks.length === 0` 未 seal 的 early-return；无论是否解析到 locks，均在**单一出口** `snapshot.seal()` 后再返回。
  - 审计独立复验：condition+guard **33 passed**；empty-locks 只读 **passed**；真 PG **1 passed**（1/1/0）；`npm run check` **0**。
  - 审计缺陷注入（均复原）：去 seal / put 忽略 sealed / get 共享引用 / getAll 共享引用 / 跳过 lock* → 对应只读或 PG 合同变红。
  - 审计验证加强（非 reopen）：有锁只读用例覆盖 `getAll` 浅拷贝隔离；产品原已正确。
  - 关闭轮次：implementation-round 3 之后的审计轮；收敛模式随里程碑关闭恢复 `normal`。
- **历史证据**（implementation-round 2；**审计 k2 退回**）：
  - 有 locks 路径：`seal()` + `get`/`getAll` 浅拷贝使既有只读用例绿；真 PG 合同与 `npm run check` 仍绿。
  - **审计缺陷**：`acquireAdmissionLocks` 在 `locks.length === 0` 时 **early-return 且未 `seal()`**，content 可 `put` 伪造行供后续 atom 读取。失败复现：`condition.spec.ts` — `empty-locks AdmissionSnapshot is still read-only`（保持红）。同领域第二次 reopen → `domain-review`。
  - **只读密封（有锁路径）**：`AdmissionSnapshot.put` 在 `seal()` 后抛错；`get`/`getAll` 返回浅拷贝；`put` 入库时亦浅拷贝；有锁路径返回前 `seal()`。
  - `npx vitest run tests/runtime/condition.spec.ts -t "AdmissionSnapshot is read-only"` → **1 passed**（后续 atom 仍见 balance=50；`put` 不可改写）。
  - `npx vitest run tests/runtime/condition.spec.ts tests/builtins/guard-klasses.spec.ts` → **32 passed**。
  - `INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npx vitest run tests/runtime/postgresqlConditionAdmission.spec.ts` → **1 passed**（`successes === 1 && failures === 1 && balance === 0`）。
  - `npm run check` → **exit 0**（顺带将 `AdmissionMatchExpression` 放宽为 `object`，使 `MatchExp`/`BoolExp` 解析器返回值可赋给 locks.match）。
- **历史证据**（implementation-round 1 / 审计 k1）：
  - 实现：`Condition.locks` / `AdmissionSnapshot`；求值前并集收集原子 locks（含 `not`）、稳定序 `lockRecord`/`lockRows`、content 第二参数 snapshot。
  - 审计验证缺口已加强：真 PG 合同改为严格 `successes === 1 && failures === 1 && balance === 0`；补 `mode:'match'` 单测；`test:postgres` 纳入本文件。
  - 审计实现缺陷（已修）：snapshot 非只读 → reopen `admission-snapshot-readonly`。

### M-02 — FR-02(a) 业务事务：BT 专用 savepoint + fail-fast throw + post-commit 推迟

- **状态**：已完成
- **reopen-count**：0
- **reopen-domains**：∅
- **前置**：M-01（无硬依赖锁，但分期顺序按风险；若并行需保证 dispatch 钩子/savepoint 改动可回归 M-01）
- **覆盖**：Task §3 FR-02(a)；§5 NestedDispatch 文档
- **可观察结果**：
  - `controller.runInBusinessTransaction` 可用；
  - **仅** BT 内 dispatch attempt 使用 SAVEPOINT；`nestedStrategy` 保持 `'reuse'`；无 savepoint 能力则拒绝 BT 而非静默 reuse；
  - **提交所有权**：已有存储事务内启动 BT → 拒绝（用例 L）；BT 重入 → 拒绝（用例 M）；flush SE **仅**在 BT 拥有的最外层 COMMIT 成功之后；
  - 默认 `onDispatchError: 'abort'` → dispatch **只 throw**，`runInBusinessTransaction` **reject**；
  - BT 内 `RequireSerializableRetry` **零次隔离升级**、错误可识别（用例 K）；S **不属于** SAVEPOINT 可重试集合（与 isolation 无关；d4）；SERIALIZABLE BT 下生产门闩路径前进（用例 K′）；`RetryableWriteConflict` / `40001` / `40P01` 仍可 attempt 重试（用例 F）；连接级错误零次 BT 内重试（用例 N）；
  - 非 BT 嵌套 reuse 写集语义不变（用例 J）；
  - §3.3.5 用例 A–N、K′（及推荐 O）测试覆盖；
  - 无业务事务时 SE 时机与 retry 语义不变；
  - NestedDispatch 仍禁止；文案与 usage 已更新（NestedDispatchError message 指向 sequential BT dispatch）。
- **验收命令**：
  ```bash
  npx vitest run tests/runtime/businessTransaction.spec.ts
  INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
    npx vitest run tests/runtime/postgresqlConditionAdmission.spec.ts tests/runtime/postgresqlBusinessTransaction.spec.ts tests/runtime/businessTransaction.spec.ts
  npx vitest run tests/runtime/transactionAcceptance.spec.ts tests/runtime/transactionRetry.spec.ts
  ```
- **最新证据**（implementation-round 4；审计 k4 **关闭**）：
  - 实现：`Controller.runInBusinessTransaction` + BT ALS；dispatch attempt `SAVEPOINT iqt_dispatch_<n>`；`runWithTransactionRetry` 选项 `onRequireSerializableRetry:'fail-fast'` + `retryablePredicate:isBusinessTransactionSavepointRetryable`；`BusinessTransactionBoundaryError`（NESTED_STORAGE_TRANSACTION / REENTRANT / SAVEPOINT_UNSUPPORTED / ABORTED）；`Storage.isInTransaction` / `supportsSavepoint` / savepoint API；SE defer 至 owned COMMIT 后 flush。
  - 审计独立复验：`businessTransaction` **18 passed**；真 PG `postgresqlConditionAdmission` + `postgresqlBusinessTransaction` + `businessTransaction` → **24 passed**（1+5+18）；`transactionAcceptance`+`transactionRetry` **30 passed**；`condition`+`guard-klasses` **33 passed**；`npm run check` exit 0。
  - 审计缺陷注入（均复原）：无 SAVEPOINT SQL → F 红；early SE flush → B+O 红；全量 top-level retry → K+N 红；跳过 A2-3 → L 红；abort=soft → C+D 红。
  - 审计验证加强（非 reopen）：B/C/D 的 SE 观察者改为 InteractionEventEntity + postCommit（原 Draft-only 观察者在 early-SE 注入下仍绿）；新增 `postgresqlBusinessTransaction.spec.ts`（A/F/K/L/O）；`test:postgres` 纳入该文件；NestedDispatch 文案同步 AGENTS.md / README.md。
  - 关闭轮次：implementation-round 4 之后的审计轮；`current-milestone` → M-03。
- **历史证据**（implementation-round 4 实现者自报）：
  - `npx vitest run tests/runtime/businessTransaction.spec.ts` → **18 passed**（A–O、K′、continue、sequential）。
  - 真 PG 命令跑 `postgresqlConditionAdmission` + PGLite `businessTransaction` → **19 passed**（1+18）；attempt 路径未在真 PG 文件内钉死（审计已补）。
  - 回归：`transactionAcceptance` + `transactionRetry` → **30 passed**；`condition` + `guard-klasses` → **33 passed**；`npm run check` exit 0。
  - 未改全局 `nestedStrategy`（仍 `'reuse'`；用例 J 绿）。

### M-03 — FR-02(b) 类型化拒绝与只读 admission 上下文

- **状态**：已完成
- **reopen-count**：0
- **reopen-domains**：∅
- **前置**：M-01 的 Condition 调用签名扩展点（第二参数/上下文）宜复用；与 M-02 并行时合并点在 `checkCondition`
- **覆盖**：Task §4 FR-02(b)
- **可观察结果**：
  - §3.4.2 桥接表落地；对象不进入 BoolExp；
  - §3.4.5 矩阵绿；`result.error.code` 稳定；
  - `context.admission` 对 computation 可见；payload 无需污染；
  - `cloneDispatchArgs` 克隆 context。
- **验收命令**：
  ```bash
  npx vitest run tests/runtime/condition.spec.ts tests/runtime/conditionAdmissionContext.spec.ts
  npm run check
  ```
- **最新证据**（implementation-round 5 之后审计轮关闭；无实现缺陷；验证加强已复原）：
  - 独立复验：`conditionAdmissionContext.spec.ts` **13 passed**；`condition.spec.ts` **12 passed**；`npm run check` **exit 0**。
  - 回归：`guard-klasses` 21 + `businessTransaction` 18 **passed**。
  - 对抗探针（临时 `/tmp/m03-audit-probe.mts`，非产品）：freeze 在 computation 内 `Object.isFrozen===true`；`not(throw code)` 保留 code；`reject.or(pass)` 通过；多 Condition context 浅合并 last-wins；`RequireSerializableRetry` → `CONDITION_THROWN` 软错误；`{ok/success/pass}`/`null`/`0`/`"yes"` → `CONDITION_INVALID_RESULT`；调用方 `context.admission` 保留键被官方通道覆盖；`InteractionGuardError` 包根可导入。**0 failures**。
  - 缺陷注入（均已复原生产代码）：
    - 省略 `InteractionGuardError.code` → 矩阵 #1 红；
    - 结构化拒绝改走 boolean `false` → 矩阵 #8 `not(...)` 红；
    - 污染 payload 代替 `context.admission` → 矩阵 #10 红；
    - 初轮：去掉 `Object.freeze` / 去掉 `cloneDispatchArgs` 的 context 浅克隆时 #10 **仍绿**（验证缺口）。
  - **验证加强**（审计轮直接改测试，不退回实现）：矩阵 #10 增加 (a) computation 内 `Object.isFrozen(admission)` 与改写后值不变；(b) Condition 故意改写 attempt `context` 字段后调用方对象仍无 `mutatedByCondition`/`admission`。加强后 I3/I4 注入变红；产品实现未改。
  - 关闭轮次：implementation-round 5 之后的审计轮；`convergence-mode: normal`。
- **历史证据**（implementation-round 5 实现者自报，审计前）：
  - 实现：`checkCondition` 结果代数 + 旁路 channel（WeakMap）；`InteractionGuardError`/`ConditionError` 增 `code`/`details`/`conditionName`；通过侧 `context.admission` 冻结合并；`cloneDispatchArgs` 浅克隆 context。
  - 验收：`conditionAdmissionContext.spec.ts` **13 passed**（§3.4.5 矩阵 1–10 + not(true)/throw/invalid code）；`condition.spec.ts` 12；`guard-klasses` 21；`businessTransaction` 18 回归；`npm run check` exit 0。

### M-04 — 文档、导出与交叉回归

- **状态**：已完成
- **reopen-count**：1
- **reopen-domains**：{ docs-condition-contract-consistency: 1 }
- **前置**：M-01、M-02、M-03
- **覆盖**：Task §5–§6 文档与类型导出；§7 范围（仅框架）
- **可观察结果**：
  - usage/generator 文档含 FR-01/02 官方示例与业务事务合同表；
  - NestedDispatch 与业务事务对照；SERIALIZABLE/RequireSerializableRetry 边界说明；
  - 包导出完整；相关 runtime 回归绿。
- **验收命令**：
  ```bash
  npm run check
  npx vitest run tests/runtime/condition.spec.ts tests/runtime/transactionAcceptance.spec.ts tests/runtime/transactionRetry.spec.ts tests/runtime/atomicState.spec.ts
  INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
    npm run test:postgres
  ```
  （`test:postgres` 若耗时过长，实现/审计可拆为「本任务新增 PG spec + 既有 lock/concurrency 子集」并在证据中写明；不得省略 FR-01 真 PG 合同。）
- **最新证据**（implementation-round 7）：
  - 修复 audit D-1（docs-condition-contract-consistency）：
    1. `generator/api-reference.md` Condition 对齐 usage/14+06：结果代数 fail-closed、第二参数 `AdmissionSnapshot`、`locks`、结构化 `code`、删除 `undefined→true` 与 `event.error` 官方通道；Controller 增补 `runInBusinessTransaction`、NestedDispatch/BT abort 错误模式与 RSR 边界。
    2. `generator/permission-test-implementation.md`：Guard 结果代数；去掉 Condition `event.error=` 示例（分页/CustomError 改为 `{ allowed:false, code }`）；顶层 soft vs BT abort 断言形态。
    3. `generator/test-implementation.md`：删除「NEVER try-catch」绝对句；区分顶层 soft `result.error` 与 BT abort / NestedDispatch 抛出。
  - `rg` 扫尾：Condition 语境下无 fail-open / 官方 `event.error=` 通道；残留 `event.error =` 仅出现在 ❌ 反模式示例（permission-test、usage/19）。
  - 验收命令：**通过** — `npm run check` exit 0；condition+txnAcceptance+txnRetry+atomicState **4 files / 43 passed**；`npm run test:postgres` **9 files / 39 passed**（含 `postgresqlConditionAdmission` 1 + `postgresqlBusinessTransaction` 5）。
- **审计关闭**（implementation-round 7 之后）：独立复验 check 0、43、M-01..M-03 回归 52、交叉 95、test:postgres 9/39；D-1 完成条件与 generator/usage/导出对照通过；最终核验 Task §1–§7 全部满足。关闭轮次：k7 审计。

**初始里程碑数 M = 4** → 设计通过进入实现时 **N = 5 × 4 = 20**。

---

## 5. 风险与验证安排

| 风险 | 阶段 | 处理 |
|------|------|------|
| 真 PG 环境缺失导致 FR-01 无法验收 | 实现 | 里程碑保持开放；不标完成 |
| BoolExp `not` 下收集 locks 是否过锁 | 设计已定并集；实现 | 单测 not 组合仍加锁 |
| 多 row 锁顺序死锁 | 实现 | 全局排序；PG 上双序对测可选 |
| BT savepoint 与 MonoSystem eventArrayBaselines / 监听器回滚一致性 | 实现 | ROLLBACK TO 后截断本 attempt 登记的 effects；单测 E/F |
| 误把全局 nested 改成 savepoint | 设计已定互斥表 | M-02 用例 J；`nestedStrategy` 保持 reuse |
| BT 套在已有 `runInTransaction` 成假顶层、SE 外逸 | 设计已定 A2 互斥 | M-02 用例 L/M；入口拒绝 + flush 仅 COMMIT 后 |
| 业务事务 defer SE 与 retry 交互 | 设计 | 仅成功 attempt 登记；仅 BT 拥有的外层成功 COMMIT 后冲刷 |
| 默认软错误 vs 业务事务 fail-fast | 设计已定 abort=throw | M-02 用例 C/D；传播表 §3.3.2 E |
| BT 内 RequireSerializableRetry 空转升级 | 设计已定 S 一律 fail-fast 切断升级环 | M-02 用例 K；与 F 对照防关掉全部重试 |
| 误把「顶层 SERIALIZABLE 下 S 可 continue」搬成 BT 内 S-retry | d4 驳回：生产门闩在已 SERIALIZABLE 下不抛 S；BT 内 S ∉ SAVEPOINT 重试集 | 用例 K′（门闩前进）+ 可选注入 S 仍一次失败；实现禁止 S-retry 分支 |
| BT 内复用全量 `isRetryableTransactionError`（连接级假重试） | 设计已定 D 有限族表 | M-02 用例 N；BT 专用 predicate；顶层 transactionRetry 回归 |
| admission 键与用户 context 冲突 | 设计 | 保留子键 `admission` |
| 既有 Condition 测试依赖 InteractionGuardError 形状 | 实现 | 兼容 `.type` / `.error.data.name` |
| Activity 是否走同一 `runInteractionGuard` / dispatch 出口 | 实现 | 枚举确认 |
| 外层仅 `storage.runInTransaction` 不用官方 API | 文档 + A2 | 明确不支持完备语义；官方 BT 拒绝被其包裹 |

**设计期已验证**：FR-01 透支与 lockRecord 对照；FR-02(a) 可见性/回滚/SE 提前/NestedDispatch/软错误部分提交/嵌套 retry 双写；FR-02(b) 返回值与 code 不可达；Condition 内 RequireSerializableRetry 不升级；d2 源码确认 nestedStrategy 无消费分支、retry 升级环、abort 返回/抛出不可并存；d3 源码确认 nested `depth++` 无 COMMIT、`isRetryableTransactionError` 含连接级码且注释要求新连接重试；d4 源码确认全部 `RequireSerializableRetry` 抛出点带 SERIALIZABLE 门闩，SERIALIZABLE 下门闩前进、RC 下嵌套 SERIALIZABLE 抛 S——驳回「须 S-retry」主张。

**实现期验证**：各里程碑验收命令；M-04 交叉回归。

---

## 6. 实现要点备忘（非第二方案）

1. **汇合点**：锁收集与结果规范化只放在 `checkCondition` / `runInteractionGuard`；BT savepoint、fail-fast throw、defer 只改 `Controller.dispatch` 与 `runInBusinessTransaction` 出口及单一 flush 函数；**不要**改默认 `runInTransaction` nested 为全局 savepoint。
2. **Klass**：`ConditionCreateArgs` 增 `locks?`；`toData`/`fromData`/stringify 跟进。
3. **类型**：AdmissionSnapshot、ConditionResult、BusinessTransaction 选项、边界/重入错误、扩展后的 `InteractionGuardError` 从合适层导出。
4. **Savepoint**：由 BT ALS 在 dispatch attempt 边界调用驱动/连接级 SAVEPOINT API；可对 PG/PGLite/SQLite 做 `supportsSavepoint` 内部探测，与公开 `nestedStrategy` 解耦；无能力则 BT 拒绝。
5. **BT 入口所有权**：`runInBusinessTransaction` 开头按 A2 表检查活跃存储事务与 BT ALS；拒绝路径不执行 `fn`；flush 函数只在 outer COMMIT 成功钩子调用一次。
6. **BT retry**：单点扩展 `runWithTransactionRetry` 选项或 BT 专用 attempt 循环；对 `RequireSerializableRetry` **一律 fail-fast**（不升级、不做 S 族 SAVEPOINT 重试，与 BT isolation 无关）；attempt `continue` **仅** W 族（`RetryableWriteConflict`∪`40001`∪`40P01`）；**过滤**连接级码；**禁止** BT 路径无参调用全量 `isRetryableTransactionError`；BT 外层 BEGIN 必须填充 `getTransactionIsolation()` 上下文以便 SERIALIZABLE 门闩放行。
7. **修一类**：所有 EventSource 只要走 `Controller.dispatch` 即自动获得业务事务 defer/savepoint；Condition 锁对 Activity 包装 interaction 同样生效。
8. **FR-02(b) channel**：与单次 `checkCondition` 调用同生命周期；不可泄漏到另一次 dispatch。

---

## 7. 求证与任务对照表

| 子需求 | 存在？ | 证据 | 实现范围 |
|--------|--------|------|----------|
| FR-01 | 是 | §1.2 真 PG 双成功透支；lockRecord 对照修复 | M-01 |
| FR-02(a) | 是 | §1.3 跨连接不可见；SE 提前；软错误部分提交；嵌套 retry 双写；无官方 API | M-02 |
| FR-02(b) | 是 | §1.4 非 boolean/false/throw 均无稳定 code；BoolExp 无对象通道 | M-03 |
| 文档/导出 | — | — | M-04 |

---

## 8. 设计裁决记录

### 8.1 d1（首轮评审 → 裁决）

| 评审问题 | 裁决 | 类别核对 | 主要证据 | 设计修订 |
|----------|------|----------|----------|----------|
| **R-1** 业务事务套在 nested reuse、无 savepoint 上无法提供 attempt 原子性 | **采纳** | 1 关键事实错误；2 内部逻辑矛盾 | 源码：`nestedStrategy:'reuse'`，嵌套仅 depth++；真 PG：软错误外层可提交 draft；resolve 中途写后 throw 可提交半截写；嵌套 `RetryableWriteConflict` → notes=`[attempt-1,attempt-2]` 且 2 条事件 | §1.3 G–I；§3.3 引入 **SAVEPOINT per attempt + 默认 fail-fast + defer SE**；删除「可选 throw result.error」作为原子性前提 |
| **R-2** 结果代数未桥接 BoolExp，稳定 code 不可达 | **采纳** | 1 关键事实错误；2 内部逻辑矛盾 | `AtomHandle` 仅 `boolean\|string`；对象 → JSON 错误串；实验 `error.code === undefined` | §3.4.2 完整桥接表与 and/or/not code 归属；旁路 channel；M-03 矩阵 |
| **R-3** 可选 SERIALIZABLE 与 nested 升级冲突 | **采纳** | 1 关键事实错误 | nested 要求 SERIALIZABLE 时抛 `RequireSerializableRetry` 但不能升级已 BEGIN 连接；Condition 内抛出被收成 guard 错误，`transactionAttempts=1` | §3.2.3 从 FR-01 **删除** Interaction 级 SERIALIZABLE；§3.3.4 隔离仅外层 BEGIN；禁止把 Condition 抛 Retry 当升级手段 |

### 8.2 d2（复审 → 裁决）

| 评审问题 | 裁决 | 类别核对 | 主要证据 | 设计修订 |
|----------|------|----------|----------|----------|
| **R-1** `nestedStrategy:'savepoint'` 作用域与裸嵌套语义未钉死 | **采纳** | 1 关键事实错误；2 内部逻辑矛盾 | 全库 `nestedStrategy` 仅驱动声明/类型/测试，**无**分支消费；嵌套实为 depth++ reuse；全局改 savepoint 会改变裸嵌套 catch-continue 写集语义，M-02 A–I 原未覆盖 | §1.5 / §3.3.2 **A 互斥表**：BT 专用 SAVEPOINT；公开 `nestedStrategy` **保持 reuse**；M-02 增用例 **J**（非 BT reuse 回归）；禁止能力位谎报 |
| **R-2** BT 内 `RequireSerializableRetry` 与 `runWithTransactionRetry` 升级环未切断 | **采纳** | 1 关键事实错误；2 内部逻辑矛盾 | `Controller.dispatch` 包在 `runWithTransactionRetry`；该函数对 RequireSerializable 固定 `isolation=SERIALIZABLE`+continue；嵌套 RC 再请求 SERIALIZABLE 再抛同族 → 耗尽为 `TransactionRetryExhaustedError`，与「可识别、不升级」矛盾 | §3.3.2 **D 表**：BT 内 RequireSerializable **零次升级**、错误可识别；写冲突仍可多 attempt；汇合点 BT 感知 retry；M-02 增用例 **K**，与 F 对照 |
| **R-3** abort 同时「返回 soft error」与「抛出」 | **采纳** | 2 内部逻辑矛盾；5 里程碑不可执行 | JS 同一 await 不可既返回又抛出；§3.3.1 示例与 abort 表冲突；M-02 C「调用方收到错误」形态不定 | §3.3.2 **E 互斥传播表**：abort=**只 throw** + BT **reject**；continue=只 soft；示例与 M-02 C/D 改为 `expects.rejects`；BT 内忽略 `forceThrowDispatchError`，只遵 `onDispatchError` |

**本轮未采纳的「需要复审的问题」**：无（R-1/R-2/R-3 全部采纳）。

**实现注意事项**（评审文末，不触发复审）：已纳入风险表与实现备忘，不单独改结论。

**下一步（历史）**：有采纳问题且 `d=2 < 15` → 启动 additional task 1 复审修订后设计。

### 8.3 d3（复审 → 裁决）

| 评审问题 | 裁决 | 类别核对 | 主要证据 | 设计修订 |
|----------|------|----------|----------|----------|
| **R-1** 业务事务未定义必须拥有最外层存储提交；嵌套在已有 `runInTransaction` 时 defer-SE 合同破产 | **采纳** | 1 关键事实错误；2 内部逻辑矛盾；4 违反任务目标（FR-02(a) 回滚则副作用不外逸） | 源码：`MonoSystem`/`PostgreSQLDB` nested 仅 `depth++`，内层返回≠COMMIT；`Controller.dispatch` 成功路径在 retry 返回后立即 SE；设计 §3.3.2 A/F 写「真正顶层 BEGIN / fn 返回后 COMMIT+flush」但无入口拒绝已有事务/BT 重入 → 合法 `runInTransaction(() => runInBusinessTransaction)` 可在 outer ROLLBACK 前 flush SE，与 §1.3 D 同构 | §1.5 / §2.1 / §3.3.2 **A2 提交所有权互斥表**（A2-1..A2-5）；F 表钉死「仅 COMMIT 成功后 flush」；M-02 用例 **L/M/O**；风险与实现备忘同步 |
| **R-2** BT 内可重试集合未按同一外层连接可用性收窄 | **采纳** | 1 关键事实错误；2 内部逻辑矛盾 | `isRetryableTransactionError` 含 `57P01`/`ECONNRESET`/`EPIPE`/`SQLITE_BUSY`；注释明确连接级重试=新连接+事务从头；BT 为同连接 SAVEPOINT 模型；设计 D 表「40001/40P01/…」与「可复用 isRetryableTransactionError」省略号会误导实现全开重试 | §3.3.2 **D 完整有限族表** S/W/C/Q/O；不变量 `BT_SAVEPOINT_RETRYABLE` ⊂ 顶层集合；禁止 BT 无参调用全量谓词；M-02 用例 **N**；与 F/K 对照 |

**本轮未采纳的「需要复审的问题」**：无（R-1/R-2 全部采纳）。

**已核对不构成六类问题的要点**（本轮评审 §「已核对…」）：FR-01 主路径、nestedStrategy 作用域、abort=只 throw、FR-02(b) 桥接、Condition 内 RequireSerializable 收成字符串、里程碑拆分——维持 d2 闭合，本轮无回退修订。

**实现注意事项**（评审文末，不触发复审）：SAVEPOINT 与 `eventArrayBaselines`、无公开 savepoint API、`cloneDispatchArgs` 与 context、空 id fail-closed、`lockRecord` 空快照、Activity 出口、`storage.listen` 非本任务 SE 通道——已在风险/备忘覆盖或属实现期细节。

**下一步（历史）**：有采纳问题且 `d=3 < 15` → 启动 additional task 1 复审修订后设计。

### 8.4 d4（复审 → 裁决）

| 评审问题 | 裁决 | 类别核对 | 主要证据 | 设计修订 |
|----------|------|----------|----------|----------|
| **R-1** BT 内将全部 `RequireSerializableRetry` 一律 fail-fast，误伤「已在 SERIALIZABLE 下的 attempt 重试」语义；须拆 S-upgrade / S-retry 并增 K2 | **驳回** | 评审主张类别 1+2；**不成立** | （1）全库 `throw new RequireSerializableRetry` 均带隔离门闩：`getTransactionIsolation() !== 'SERIALIZABLE'`（Controller replace、Transform update/delete、Scheduler full-recompute/custom/patch）或 nested `existing.isolation !== 'SERIALIZABLE' && requested === 'SERIALIZABLE'`（MonoSystem / PostgreSQLDB）。（2）`runWithTransactionRetry` 对 S 的 `isolation=SERIALIZABLE; continue` 是**新 BEGIN attempt** 的升级语义，不是「同一已 SERIALIZABLE 连接上对门闩再 continue」；门闩在 SERIALIZABLE 下根本不抛。（3）d4 PGLite 探针：SERIALIZABLE 外层 `getTransactionIsolation()==='SERIALIZABLE'`、嵌套 SERIALIZABLE 不抛、门闩 wouldThrow=false；RC 外层嵌套 SERIALIZABLE 抛 `RequireSerializableRetry`。（4）故「SERIALIZABLE BT 内 Transform/Scheduler 被 S fail-fast 误杀」**无生产路径**；评审把顶层升级重试误读为 BT 内 S 应属 SAVEPOINT 可重试集。保留 d2/d3：RC 下切断升级空转环、S 可识别、W 族仍可重试 | §3.3.2 D **事实 5** + S 行钉死「与 BT isolation 无关，S 一律 fail-fast；S ∉ `BT_SAVEPOINT_RETRYABLE`」；**不**引入 S-retry 分支；§3.3.4 / M-02 增推荐用例 **K′**（SERIALIZABLE BT 下生产门闩前进，而非注入 S 后多 attempt）；风险表与实现备忘同步；汇合点明确禁止 S-retry |

**本轮采纳的「需要复审的问题」**：**无**（R-1 驳回）。

**澄清性修订**（不构成对复审问题的采纳，仅为消除误读、保持实现可执行）：

- D 表 S 行写明 RC 与 SERIALIZABLE 两种 BT 下的观测与 fail-fast 合同；
- 不变量补：`生产路径：isolation===SERIALIZABLE ⇒ 框架门闩路径不抛 RequireSerializableRetry`；
- 用例 K 保持（RC + S → 一次失败）；K′ 证明 SERIALIZABLE 门闩前进，可选注入 S 负向仍一次失败。

**已核对不构成六类问题的要点**（本轮评审 §「已核对…」）：FR-01 主路径、nestedStrategy 作用域、A2 提交所有权、abort=throw、连接级收窄、FR-02(b) 桥接、里程碑拆分——维持 d3 闭合。

**实现注意事项**（评审文末，不触发复审）：SAVEPOINT 与 effects 截断、无公开 savepoint API、`cloneDispatchArgs`、空锁 id、`storage.listen` 非 SE 通道、BT 外层 COMMIT 的 40001 由调用方重试整个 BT、死锁 40P01 探针——维持实现期处理。

**下一步**：本轮 **未采纳** 任何需要复审的问题 → 设计通过；`status: 实现中`，`N = 5 × 4 = 20`，启动 additional task 3 实现。
