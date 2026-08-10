status: 已完成
design-round: 1/15
implementation-round: 2/10
current-milestone: M-02
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无

# 事务与 dispatch 官方路径强制（零灰色兼容）— 设计

## 0. 基线

| 项 | 值 |
|----|-----|
| Git revision | `92e8e70525717a55ab8304c35c374a3e35d55164` |
| 工作树 | clean（仅本任务将新增 `docs/tx-dispatch-path-uniqueness/`） |
| 当前 package 版本 | `4.6.0`（tag `v4.6.0` = `1a308ac…`）。admission/BT 产品提交 `92e8e70` **在 tag 之后**，尚未进入已发布 changelog 条目 |
| 相关已有测试（设计时实测） | `businessTransaction.spec.ts`、`conditionAdmissionContext.spec.ts`、`transactionAcceptance.spec.ts`、`transactionCapability.spec.ts`：**4 files / 53 tests passed** |
| 真实 PostgreSQL | 本机 `pg_isready` 未确认；实现期若环境可用则跑 `npm run test:postgres`（含 `postgresqlBusinessTransaction` / `postgresqlConditionAdmission`），不得新增失败 |
| 前置交付 | `docs/condition-admission-and-tx-visibility/`（`status: 已完成`）— FR-01 locks + FR-02 BT/结果代数 |
| 问题陈述 | 本 Task 文件 § Task 1（路径唯一化与强制迁移，非重做 admission/BT） |

设计期最小求证脚本（临时，非产品代码）：

- `/tmp/interaqt-tx-path-uniqueness-prove.mts` — 经 `npx vite-node --config vitest.config.ts` 在当前主干执行（见 §1.2）。

---

## 1. 背景和现状（含求证）

### 1.1 现行官方能力（已交付，本任务不重做）

| 能力 | 入口 | 合同要点 |
|------|------|----------|
| 声明式准入锁 | `Condition.locks` + `AdmissionSnapshot` | 同次 dispatch 内 check-then-act；不手写 `FOR UPDATE` |
| 业务事务 | `controller.runInBusinessTransaction` | 拥有最外层 BEGIN/COMMIT；每 dispatch attempt 用 SAVEPOINT；默认 `onDispatchError: 'abort'` 抛错并外层 ROLLBACK；`postCommit` / `RecordMutationSideEffect` **仅在 BT 拥有的 COMMIT 之后** flush |
| 类型化拒绝 | `InteractionGuardError.code` / soft `result.error.code` | 结构化 `{ allowed:false, code }`；历史鸭式 `type: 'condition check failed'` 仍在对象上 |

权威源码：

- `Controller.dispatch` / `runInBusinessTransaction`：`src/runtime/Controller.ts`（约 924–1183 行）
- 边界错误与 BT 谓词：`src/runtime/transaction.ts`（`BusinessTransactionBoundaryError`、`NestedDispatchError`）
- 存储事务 reuse / SAVEPOINT：`src/runtime/MonoSystem.ts`（`runInTransaction` nested → `depth++` 复用，**不**开全局 savepoint）
- Condition / Guard：`src/builtins/interaction/Interaction.ts`、`Condition.ts`

### 1.2 求证 — 非 BT 活跃存储事务内 `dispatch`（Task 要求 1）

**问题**：在**非** `runInBusinessTransaction` 上下文中，若调用方已处于 `storage.runInTransaction`，`controller.dispatch` 是否仍被允许？与 BT 合同差在何处？

**源码结论（汇合点）**：

1. `Controller.dispatch` 仅检查：
   - `dispatchExecutionContext` → 嵌套 dispatch → `NestedDispatchError`
   - `getActiveBusinessTransaction()?.aborted` → `BusinessTransactionBoundaryError(ABORTED)`
   - 若 `bt?.active` → BT attempt 路径（SAVEPOINT + defer SE）
   - **否则** → 顶层 `runWithTransactionRetry` → `runDispatchAttemptBody` → `storage.runInTransaction`
2. **没有** `storage.isInTransaction() && !bt` 的硬失败分支。
3. 当外层已有存储事务时，`MonoSystem.runInTransaction` nested 分支只做 `depth++` / `fn()` / `depth--`（reuse），**内层返回不等于 COMMIT**。
4. 非 BT 成功路径在 `dispatch` 返回前**立即**执行 `runPostCommitHook` 与 `runRecordChangeSideEffects`（`Controller.ts` 约 1100–1102 行），不判断外层是否仍持有未提交事务。

**运行时探针**（`/tmp/interaqt-tx-path-uniqueness-prove.mts`，PGLite，当前 revision）：

| 探针 | 结果 |
|------|------|
| P1：`runInTransaction` 内 `create` + 成功 `dispatch(Activate)` | **允许**。`getActiveBusinessTransaction()` 为 inactive；`isInTransaction()===true`。dispatch **无** error。`postCommit` 与 mutation SE 计数在 **outer 回调返回前** 已为 1（即在 outer COMMIT 前执行）。事实最终提交。 |
| P2：同路径 + Condition `{ allowed:false, code:'ALWAYS_NO' }` | dispatch 返回 soft `InteractionGuardError`（`code=ALWAYS_NO`，`type='condition check failed'`）；**outer 不 throw**；预 `create` 的 draft **随 outer COMMIT 存活**；无 interaction 事件行。→ 失败 dispatch + 部分写一并提交。 |
| P3：对照 BT 默认 abort + 同一 Reject | BT **reject/throw** 同一 `InteractionGuardError.code`；draft **不**存活；SE/postCommit = 0。 |
| P4：P1 成功后 outer `throw` | DB 事实回滚（draft 不存活）；但 **postCommit 与 mutation SE 已执行**（计数为 1）。→ 副作用在“假提交边界”泄漏。 |

**与 BT 合同的差异（必须写入设计，不得仅复述背景段）**：

| 维度 | 灰色路径：`storage.runInTransaction` + `dispatch` | 官方 BT |
|------|-----------------------------------------------------|---------|
| 是否允许（今日） | **是** | 是（唯一完备路径） |
| Attempt 隔离 | 无 per-dispatch SAVEPOINT；失败 attempt 依赖“内层 reuse 抛错是否传到 outer” | 每 attempt `SAVEPOINT` / `ROLLBACK TO` |
| 业务拒绝默认 | 顶层 soft `result.error`；**不**自动 abort 外层 RIT | 默认 `abort` → throw → outer ROLLBACK |
| 软错误 + 外层继续 | 外层预写可与失败 dispatch **一同提交** | 默认不会：throw 中止 fn |
| postCommit / RecordMutationSideEffect | dispatch 成功即跑，**可在 outer COMMIT 前**；outer 随后 ROLLBACK 时 **SE 已外逸、DB 已回滚** | 仅 BT 拥有的 COMMIT 成功后 flush |
| 自动升级为 BT | 无 | N/A |

**结论**：灰色路径在主干上**真实存在且可运行**；合同不完整（attempt 隔离、失败传播、副作用时机）。本任务必须在 runtime 硬失败，而不是继续文档劝阻。

### 1.3 边界错误抛出点与 code 稳定性（Task 要求 3 枚举）

| 场景 | 类型 | 稳定判别面 | 今日是否存在 | 文案是否可行动 |
|------|------|------------|--------------|----------------|
| BT 套在已有 `runInTransaction` 内 | `BusinessTransactionBoundaryError` | **`code: 'NESTED_STORAGE_TRANSACTION'`**（实例字段 + `context.code`） | 是（BT 入口） | 是：须拥有最外层存储事务 |
| BT 重入 | 同上 | **`code: 'REENTRANT'`** | 是 | 是：单回调内完成全部写与顺序 dispatch |
| 驱动无 SAVEPOINT | 同上 | **`code: 'SAVEPOINT_UNSUPPORTED'`** | 是 | 是 |
| 驱动无事务 | `TransactionCapabilityError` 或 BT `TRANSACTIONS_UNSUPPORTED` | capability / **`code: 'TRANSACTIONS_UNSUPPORTED'`** | 是 | 是 |
| BT abort 后再次 dispatch | `BusinessTransactionBoundaryError` | **`code: 'ABORTED'`** | 是（dispatch 入口） | 是：已 abort，拒绝继续 dispatch |
| 嵌套 dispatch | `NestedDispatchError` | `errorType` / `instanceof`（无业务 `code` 字段；保持既有） | 是 | 是：顺序 dispatch 或 BT |
| **非 BT 活跃存储事务内 dispatch** | **无** | **无** | **否 — 本任务缺口** | — |

汇合点：所有 BT 边界失败已集中在 `BusinessTransactionBoundaryError` + `BusinessTransactionBoundaryCode`。本任务新增场景应 **扩展同一联合类型与同一错误类**，避免新魔法字符串或平行错误类型。

`NestedDispatchError` 保持独立（语义是 call-stack 嵌套，不是“事务所有权”）。不要求为其补 `code` 字段（非本任务扩大范围）。

### 1.4 文档仍将裸路径写作“可跑 / 弱推荐”的位置

下列段落在强制硬失败后必须改写为 **运行时硬错误**（或删除“Prefer / not complete”软表述），并与实现一致：

| 路径 | 现状措辞（摘要） |
|------|------------------|
| `agent/agentspace/knowledge/usage/06-attributive-permissions.md`（合同表 “Bare `runInTransaction` + `dispatch`”） | “Not a complete official path … Prefer BT.” |
| `agent/agentspace/knowledge/usage/19-common-anti-patterns.md` | 反模式注释：“is not the complete official path …” |
| `agent/agentspace/knowledge/usage/18-api-exports-reference.md` | “Prefer those over … bare `storage.runInTransaction` + `dispatch`” |
| `agent/agentspace/knowledge/usage/20-postgresql-concurrency-migration.md` | “not a bare outer `runInTransaction` around `dispatch`”（方向正确，须升为硬错误 + code） |
| `agent/agentspace/knowledge/usage/05-interactions.md`、`14-api-reference.md` | 已推荐 BT；须补非法路径硬失败与稳定 code |
| `agent/agentspace/knowledge/generator/api-reference.md`、`permission-implementation.md` | “not bare `storage.runInTransaction` alone” 等 |
| `AGENTS.md`、`README.md` | 已提 BT / NestedDispatch；须对齐“活跃非 BT 事务内 dispatch 硬失败” |
| `CHANGELOG.md` | **尚无**本 breaking 条目；admission/BT 本身也尚未写入已发布版本说明（产品在 `92e8e70`，tag 4.6.0 之前） |

`generator` 中 `storage.runInTransaction` 的**纯存储**示例（无 dispatch）合法，保留。

### 1.5 错误符号与断言面现状

- 正式业务拒绝：`InteractionGuardError`（`code` / `details` / `conditionName`；仍带历史 `type: 'condition check failed'`）。
- `ConditionError` 仍从 `src/runtime/index.ts` 导出；部分旧测试（如 `condition.spec.ts`）以 `.type === 'condition check failed'` 为断言。新 admission 套件已以 `.code` 为主。
- 不删除 `ConditionError` 符号（Task 非目标 / P2 仅文档 deprecated）。

---

## 2. 目标与非目标

### 2.1 目标（对应 Task 要求编号）

1. **求证灰色路径**（要求 1）：§1.2 已完成；实现不得回退该事实判断。
2. **P0 路径唯一**（要求 2）：活跃存储事务且非 BT 时，`dispatch` 硬失败；合法路径（顶层 dispatch、BT 内顺序 dispatch、纯 `runInTransaction` 无 dispatch）保持。
3. **P0 边界错误可识别**（要求 3）：新场景纳入 `BusinessTransactionBoundaryError` 稳定 `code`；既有 code 保持；文案指向 `runInBusinessTransaction`。
4. **P0 强制升级说明**（要求 4）：changelog 迁移表 + usage 权威章与运行时一致；版本占位见 §3.4。
5. **P1 文档与 generator 路径唯一化**（要求 5）：扫尾 §1.4 列表；反模式标硬错误；`code` 为业务分支正式面。
6. **P1 测试与示例以 `code` 为正式断言面**（要求 6）：本任务新增/更新测试以稳定 `code`（及必要时 `conditionName`）为准。
7. **P2 `ConditionError` 文档降级**（要求 7）：标历史/deprecated，指向 `InteractionGuardError`；不删符号。
8. **非目标边界**（要求 8）：见 §2.2。
9. **交付纪律**（要求 9）：Vitest / 既有 runtime 与（可用时）`test:postgres`；`npm run check`；汇合点修复；灰色路径允许 breaking。

### 2.2 非目标

- 不强制所有 Condition 声明 `locks`。
- 不废除 boolean `true`/`false` Condition 结果。
- 不改变顶层单独 `dispatch` 的默认 soft `result.error` 合同（与 BT 默认 abort=throw 正交）。
- 不把 `runInTransaction` 改成 BT 别名或自动升级。
- 不开放嵌套 `dispatch`。
- 不实施 Mesh 等应用仓库迁移。
- 不重做 FR-01 锁语义或 BT SAVEPOINT 主模型（除非实现时发现与本硬失败规则冲突 — 预期无冲突：硬失败在进入 attempt 之前）。
- 不碰 entity-identity / Transform id 教义。
- 不要求本任务 bump `package.json` 版本号（只准备可直接用于发版的 changelog 形态）。

---

## 3. 方案（单一方案）

### 3.1 决策摘要

| 决策 | 选择 | 理由 |
|------|------|------|
| 拦截点 | `Controller.dispatch` 入口，在 nested-dispatch 检查之后、BT aborted 检查附近 | 唯一用户入口；覆盖 Interaction / 自定义 EventSource；早于任何 `runInTransaction` reuse |
| 判定 | `storage.isInTransaction() === true` 且 `getActiveBusinessTransaction()` 无 active 上下文 | 精确区分“BT 拥有的外层事务”与“调用方自开的存储事务”；BT 回调内 `isInTransaction()` 为 true 但 ALS active，放行 |
| 错误类型 | 扩展既有 `BusinessTransactionBoundaryError` | 同属事务所有权/边界族；调用方可 `instanceof` + `code` 一处处理 |
| 新 code | `'DISPATCH_IN_NON_BT_TRANSACTION'` | 稳定、可文档化、与 `NESTED_STORAGE_TRANSACTION` 对称（后者是“BT 不得钻进已有 RIT”，前者是“dispatch 不得钻进非 BT 的 RIT”） |
| 自动升级 | **禁止** | Task 硬约束；伪装 BT 会继承错误 SE 时机或静默改变 soft/abort 语义 |
| 顶层 dispatch | 不变 | 无活跃存储事务时仍 `runWithTransactionRetry` + soft error 默认 |
| 纯 RIT | 不变 | 回调内不调用 `dispatch` 则永不触及新检查 |
| 文档 | 硬失败 + 迁移表；删除 “Prefer BT / not complete” 软口吻 | 与强制升级态度一致 |
| ConditionError | 仅文档 deprecated | 避免无替代的符号删除 |

### 3.2 运行时行为（规范性）

#### 3.2.1 `dispatch` 入口顺序（实现必须保持可测）

对每次 `controller.dispatch(eventSource, args)`：

1. `eventSource` 必填断言（现有）。
2. 若 `dispatchExecutionContext` 已有 store → `NestedDispatchError`（现有）。
3. **【新增】** 若 `this.system.storage.isInTransaction()` 且 **非**（`getActiveBusinessTransaction()?.active === true`）→  
   `throw new BusinessTransactionBoundaryError({ code: 'DISPATCH_IN_NON_BT_TRANSACTION', businessTransactionName?: 可选 })`  
   默认文案必须同时包含：
   - 禁止原因：非业务事务拥有的活跃存储事务内不能 `dispatch`；
   - 行动：将“写库 + dispatch”移入 `controller.runInBusinessTransaction`；纯存储事务内不要调用 `dispatch`。
4. 若 BT active 且 `aborted` → `ABORTED`（现有）。
5. 其余：BT attempt 路径或顶层 retry 路径（现有，不改 SE/abort 语义）。

说明：

- 步骤 3 在步骤 5 的 `runInTransaction` **之前**，因此不会出现“先 reuse 再失败”的半截 attempt。
- BT 内：ALS `active===true` 且 storage 在事务中 → 不触发步骤 3。
- 顶层：通常 `isInTransaction()===false` → 不触发；dispatch 自己开事务。
- **不得**在 `MonoSystem.runInTransaction` 内根据“回调里是否会 dispatch”做猜测拦截（无法静态知道）；拦截点保持在 `dispatch`。

#### 3.2.2 合法 / 非法矩阵（验收真值表）

| # | 调用形态 | 期望 |
|---|----------|------|
| L1 | 顶层 `dispatch`（无外层存储事务） | 成功或 soft `result.error`（默认）；**不**抛 `DISPATCH_IN_NON_BT_TRANSACTION` |
| L2 | `runInBusinessTransaction` 回调内顺序 `dispatch` | 既有 BT 合同（含 abort/continue、SAVEPOINT、defer SE） |
| L3 | `runInTransaction` 仅 storage 读写，**无** `dispatch` | 成功；与今日 reuse/提交语义相同 |
| L4 | BT 内 `create` 后 `dispatch`，Condition 读未提交行 | 既有套件 A 等保持绿 |
| I1 | `runInTransaction(async () => { await controller.dispatch(...) })` | **抛** `BusinessTransactionBoundaryError`，`code === 'DISPATCH_IN_NON_BT_TRANSACTION'`；无部分 interaction 事实；调用方 pre-create 是否提交取决于 outer 是否吞掉错误（若未 catch 则 outer ROLLBACK） |
| I2 | 任意非 BT 拥有的活跃事务（含深度 >1 的 reuse 栈）内 `dispatch` | 同 I1 |
| I3 | 嵌套 `dispatch`（dispatch 栈内） | 仍 `NestedDispatchError`（优先于或并行于事务检查：现有顺序为先 nested；保持先 nested，避免改变 nested 测试语义） |
| I4 | `runInTransaction` 内 `runInBusinessTransaction` | 仍 `NESTED_STORAGE_TRANSACTION`（BT 入口，本任务不改） |

#### 3.2.3 边界 code 完整清单（实现后）

```text
BusinessTransactionBoundaryCode =
  | "NESTED_STORAGE_TRANSACTION"   // 已有
  | "REENTRANT"                    // 已有
  | "SAVEPOINT_UNSUPPORTED"        // 已有
  | "ABORTED"                      // 已有
  | "TRANSACTIONS_UNSUPPORTED"     // 已有
  | "DISPATCH_IN_NON_BT_TRANSACTION" // 新增
```

- 公共导出：已有 `export * from './transaction.js'`，新 code 随类型导出，无需新符号。
- 断言面：`error instanceof BusinessTransactionBoundaryError && error.code === 'DISPATCH_IN_NON_BT_TRANSACTION'`；`isBusinessTransactionBoundaryError` 继续可用。
- `FrameworkError.context.code` 与实例 `.code` 保持双写（与现构造器一致）。

#### 3.2.4 失败传播与 soft 路径

- 新错误在进入 attempt 前 **同步 throw**。
- 非 BT 顶层：`dispatch` 的 try/catch 会把一般错误收成 soft `result.error`，**除非** `forceThrowDispatchError`。  
  **本边界错误必须对调用方表现为可识别的失败。** 决策：
  - **硬失败优先于 soft 包装**：在 catch 分支中，若 `isBusinessTransactionBoundaryError(e)`（或至少对本 code），**重新 throw**，与 `NestedDispatchError` 的可观测性对齐意图（nested 今日在 try 内 throw，会被 soft 包装 — 见下条）。
  - 核验 nested 今日行为：`NestedDispatchError` 在 try 之前 throw，**不会**被 soft 包装。新检查与 nested 同级（try 外），因此 **天然 throw 到调用方**，不会变成 soft `result.error`。  
  - **实现约束**：新检查必须放在 `try` **之外**（与 `NestedDispatchError` / 当前 `ABORTED` 检查同级）。`ABORTED` 今日已在 try 外 — 新检查紧邻放置。

#### 3.2.5 与 FR-01 / FR-02 回归关系

- 不修改 SAVEPOINT 创建/释放、defer 队列、locks 获取、Condition 结果代数。
- 既有 `businessTransaction.spec.ts`、`conditionAdmissionContext.spec.ts`、`postgresqlBusinessTransaction.spec.ts`、`postgresqlConditionAdmission.spec.ts` 应无需改断言即可保持绿（它们不依赖灰色路径）。
- 若任何内部测试或文档示例使用了灰色路径，改为 BT 或拆成纯存储 + 顶层 dispatch。

### 3.3 文档与发布（规范性）

#### 3.3.1 Changelog 形态与版本占位

- **不**在本任务修改 `package.json` version。
- 在 `CHANGELOG.md` **顶部**增加面向下一发布版本的条目，推荐标题形态：

```markdown
## [Unreleased]

### Breaking changes

* **runtime:** `controller.dispatch` inside a non-business-transaction active storage
  transaction now throws `BusinessTransactionBoundaryError` with
  `code: 'DISPATCH_IN_NON_BT_TRANSACTION'`. …
```

- 发版时由 release 流程将 `Unreleased` 重命名为具体版本（预期为 admission/BT 首次进入 registry 的版本，可能与 BT 功能说明合并为同一 minor；若 BT 功能说明仍缺失，本任务 changelog **可在同一 Unreleased 块中**用独立 bullet 写路径强制，并可用简短 “see also” 指向 usage，但不强制在本任务重写完整 FR-01/FR-02 feature 长文 — 以免范围膨胀。若实现轮发现 Unreleased 中尚无 BT 功能条目，**最少**写清本 breaking；BT 功能 bullet 可作为同块的可选补充，以 usage 已存在合同为准。）

#### 3.3.2 强制迁移表（changelog + usage 06 权威章必须出现）

| 旧写法 | 新写法 |
|--------|--------|
| `storage.runInTransaction` 内 `controller.dispatch` | `controller.runInBusinessTransaction` 内 storage 写 + 顺序 `dispatch` |
| Condition 内手写行锁 / `FOR UPDATE` | `Condition.locks` + `AdmissionSnapshot` |
| `event.error` / 污染 payload 传递拒绝或上下文 | `{ allowed:false, code }` / `{ allowed:true, context }` → `event.context.admission` |
| 业务分支依赖鸭式 `error.type === 'condition check failed'` | `InteractionGuardError.code` 或 soft `result.error.code`（及 `conditionName`） |

说明语气：**必须迁移**；非法路径为运行时硬错误，不是“建议”。

#### 3.3.3 文档扫尾清单（M-02）

对 §1.4 每一路径：

1. 删除或改写 “Prefer BT / not a complete official path” 为硬错误 + `DISPATCH_IN_NON_BT_TRANSACTION`。
2. 反模式示例标注 throws / 稳定 code。
3. 保留纯 `runInTransaction`（无 dispatch）合法用法。
4. generator 与 usage 不得互相矛盾。
5. `AGENTS.md` / `README.md` 各至少一处与实现一致的硬约束句。
6. `ConditionError`：在 exports / api-reference 适当地点标明 historical/deprecated，指向 `InteractionGuardError`；**不**删除导出。

### 3.4 测试计划

#### 3.4.1 新增 / 扩展（优先挂在既有 `businessTransaction.spec.ts` 或紧邻新文件 `dispatchPathUniqueness.spec.ts`）

| 用例 | 断言 |
|------|------|
| I1 负向 | `runInTransaction` + `dispatch` → rejects `BusinessTransactionBoundaryError` / `code === 'DISPATCH_IN_NON_BT_TRANSACTION'`；message 匹配可行动关键词（如 `runInBusinessTransaction`） |
| I1 无泄漏 | 失败路径不产生成功 interaction 事件；若 outer 未 catch，预 create 回滚 |
| L1 回归 | 顶层成功 dispatch + 顶层 Condition soft reject（`result.error.code`）仍绿 |
| L2 回归 | 既有 BT A/C/O 等全套保持 |
| L3 回归 | 纯 nested `runInTransaction` reuse 行为（既有用例 J）保持 |
| 边界并列 | `NESTED_STORAGE_TRANSACTION` / `REENTRANT` 仍可测（既有 L/M） |
| ABORTED（若仍缺独立用例） | BT abort 后再次 dispatch → `code === 'ABORTED'`（补强要求 3，实现轮若已有等价覆盖可引用） |

业务拒绝断言：新用例一律 `code`；允许附带断言 `type` 但不得作为唯一判别。

#### 3.4.2 回归命令

```bash
npx vitest run tests/runtime/businessTransaction.spec.ts \
  tests/runtime/conditionAdmissionContext.spec.ts \
  tests/runtime/transactionAcceptance.spec.ts \
  tests/runtime/transactionCapability.spec.ts
# 若新增独立 spec，一并列入

npm run check

# 环境允许时：
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
  npm run test:postgres
```

### 3.5 明确不做的实现

- 不在 `storage.runInTransaction` 自动设置 BT ALS。
- 不改变 global `nestedStrategy: 'reuse'`。
- 不修改 MySQL `transactions: false` 合同（dispatch 仍因无事务能力失败）。
- 不删除 `ConditionError` 或批量改写全部历史测试的鸭式断言（仅本任务触及的测试与官方示例以 `code` 为准；全仓库考古式替换不在范围，但 **新增** 测试不得以鸭式为唯一面）。

---

## 4. 里程碑

### M-01 — 运行时路径唯一硬失败 + 稳定边界 code + 可执行测试

- **状态**：`已完成`
- **reopen-count**：0
- **reopen-domains**：∅
- **前置**：无
- **覆盖要求**：1（求证已在设计完成）、2、3、9（测试/check 部分）
- **可观察结果**：
  1. `BusinessTransactionBoundaryCode` 含 `DISPATCH_IN_NON_BT_TRANSACTION`；默认文案可行动。
  2. `Controller.dispatch` 在非 BT 活跃存储事务内硬失败（try 外 throw）。
  3. 负向测试 I1 红→绿；合法 L1/L2/L3 与既有 BT/admission 套件绿。
  4. 不引入 RIT→BT 自动升级；不开放嵌套 dispatch。
- **验收命令**：
  ```bash
  npx vitest run tests/runtime/businessTransaction.spec.ts \
    tests/runtime/conditionAdmissionContext.spec.ts \
    tests/runtime/transactionAcceptance.spec.ts \
    tests/runtime/transactionCapability.spec.ts
  npm run check
  # 环境允许时：
  INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
    npx vitest run tests/runtime/postgresqlBusinessTransaction.spec.ts \
      tests/runtime/postgresqlConditionAdmission.spec.ts
  ```
- **最新证据**（implementation-round 1）：
  - 实现：`src/runtime/transaction.ts` 扩展 code + 默认可行动文案；`Controller.dispatch` 在 NestedDispatch 检查之后、try 外：`isInTransaction() && bt?.active !== true` → `DISPATCH_IN_NON_BT_TRANSACTION`。
  - 测试：`businessTransaction.spec.ts` 新增 I1 / I1′ / ABORTED；断言以稳定 `code` 为准。
  - `npx vitest run` businessTransaction + conditionAdmissionContext + transactionAcceptance + transactionCapability：**4 files / 56 tests passed**。
  - `npm run check`：通过。
  - 真 PG：`postgresqlBusinessTransaction` + `postgresqlConditionAdmission`：**2 files / 6 tests passed**（`INTERAQT_POSTGRES_DATABASE=interaqt_test`）。
  - 审计（additional task 4）：独立复验同上命令全绿；缺陷注入移除 gate 后 I1 变红（promise resolved），还原后 I1/I1′/ABORTED 再绿。结论：无实现缺陷，M-01 → 已完成。

### M-02 — 强制升级说明 + usage/generator/`code` 断言面扫尾 + ConditionError 文档降级

- **状态**：`已完成`
- **reopen-count**：0
- **reopen-domains**：∅
- **前置**：M-01（文档必须描述已落地的硬失败，避免文档先于行为）
- **覆盖要求**：4、5、6、7、9（文档与示例）
- **可观察结果**：
  1. `CHANGELOG.md` 存在 Unreleased（或约定占位）breaking 迁移表，含要求 4 四行映射；非法路径不写“可选建议”。
  2. §1.4 清单路径均改为硬错误合同；generator 与 usage 无矛盾；纯 RIT 无 dispatch 仍合法。
  3. 本任务新增/更新的官方示例与测试以 `code` 为业务拒绝正式断言面。
  4. `ConditionError` 在权威导出/API 文档标 deprecated/historical，指向 `InteractionGuardError`；符号仍导出。
  5. `AGENTS.md` / `README.md` 与实现一致。
- **验收命令**：
  ```bash
  # 文档：人工对照 §1.4 清单 + changelog 迁移表（审计轮逐项勾选）
  rg -n "Prefer BT|not a complete official path|not the complete official path" \
    agent/agentspace/knowledge AGENTS.md README.md CHANGELOG.md
  # 期望：无“软放行”残留；或仅出现在明确历史/对比过时描述且标注已硬失败

  npx vitest run tests/runtime/businessTransaction.spec.ts \
    tests/runtime/conditionAdmissionContext.spec.ts
  npm run check
  ```
- **最新证据**（implementation-round 2 + audit a2）：
  - `CHANGELOG.md` 顶部 `[Unreleased]`：Breaking + 四行强制迁移表 + 边界 code 表 + `ConditionError` deprecation；非法路径写硬错误。
  - §1.4 清单全部改硬错误：`06`/`19`/`18`/`20`/`05`/`14`、generator `api-reference`/`permission-implementation`/`permission-test-implementation`、`AGENTS.md`、`README.md`。
  - 软放行短语扫描：`Prefer BT|not a complete official path|not the complete official path` → **无命中**。
  - 官方示例断言面：permission-test 指南以 `InteractionGuardError.code` / `conditionName` 为主；BT abort 用 `rejects.toMatchObject({ code, conditionName })`。
  - `ConditionError`：usage `18` 标注 DEPRECATED；changelog Deprecations；源码 `ConditionErrors.ts` 加 `@deprecated` JSDoc；符号仍导出。
  - 审计复验：相关 **4 files / 56 tests** + `npm run check` + 真 PG **6 tests** 全绿；M-01 gate 仍在 try 外。
  - 审计结论：无实现缺陷，M-02 → 已完成；最终核验通过，任务 `status: 已完成`。

**初始里程碑数 M = 2 → 实现预算 N = 5 × 2 = 10。**

---

## 5. 风险与验证安排

| 风险 | 阶段 | 处置 |
|------|------|------|
| 灰路径硬失败后，仓库内隐藏调用方（测试/示例）失败 | 实现 M-01 | 全量 `rg` `runInTransaction` 邻近 `dispatch`；改为 BT 或拆分；以测试红为发现手段 |
| 新检查误伤 BT 内 dispatch | 实现 M-01 | 判定必须 `getActiveBusinessTransaction()?.active`；BT 套件 A/C/O 为闸 |
| 新错误被 soft `result.error` 吞掉 | 设计已约束 try 外；实现审 diff | 负向测试用 `expect(...).rejects`，不是 `result.error` |
| 文档与实现短暂不一致 | 里程碑顺序 M-01→M-02 | 禁止 M-02 先合并描述 |
| 真 PG 环境缺失 | 实现/审计 | PGLite 覆盖路径唯一逻辑；PG 套件 env 可用则必跑，不可用不得伪称完成 PG 回归 |
| changelog 版本号未知 | 设计已定 Unreleased 占位 | 发版流程改名；本任务不 bump version |
| 与画像“尽量超集”冲突 | Task 要求 9 覆盖 | 灰色路径允许 breaking；合法 L1–L4 保持 |

**设计期必须验证（已完成）**：灰路径存在性与 SE/软错误差异（§1.2）；边界 code 枚举（§1.3）；文档软表述清单（§1.4）。

**可实现期验证**：硬失败测试、全量相关回归、文档 rg 扫尾、可选 PG。

---

## 6. 实现轮指引（非规范外扩）

1. `src/runtime/transaction.ts`：扩展 `BusinessTransactionBoundaryCode` + 默认 message。
2. `src/runtime/Controller.ts`：`dispatch` try 外插入 §3.2.1 步骤 3。
3. 测试：负向 I1 + 确认 BT/顶层/纯 RIT 绿；必要时补 `ABORTED`。
4. 文档与 changelog 按 M-02 清单一次扫尾。
5. 不改 storage nested 语义；不自动升级。

---

## 7. 与前置任务关系

- 本任务是 `condition-admission-and-tx-visibility` 的**后继路径强制**，不重新定义 FR-01/FR-02 主模型。
- 前置设计将裸 RIT+dispatch 标为“非官方完备 / Prefer BT”；本任务将其升级为**运行时非法**。
- 回归不得破坏已关闭的 admission 并发合同与 BT SAVEPOINT/abort/defer 合同。

---

## 8. 设计裁决（d1）

- **评审结论**：`通过`（需要复审的问题：0）。
- **裁决**：不采纳任何「需要复审的问题」。独立核验：灰路径探针 SUMMARY 与设计 §1.2 一致；`Controller.dispatch` 无 `isInTransaction && !bt` 分支；`NestedDispatchError`/`ABORTED` 均在 try 外；`TRANSACTIONS_UNSUPPORTED` 无 throw 站点（实现注意事项，不阻塞）；合法/非法矩阵与判定谓词一致；M=2 → **N=10**。
- **实现轮须吸收的评审注意事项**（非设计缺陷）：
  1. 无事务驱动失败以实际 `TransactionCapabilityError` 表述，勿为未抛出的 `TRANSACTIONS_UNSUPPORTED` 单独立测。
  2. 新检查必须 try 外；负向用 `expect(...).rejects` + `code`。
  3. M-02 文档扫尾略宽于 §1.4：含 `generator/permission-test-implementation.md` 等官方示例断言面。
  4. 可选补 `ABORTED` 直接用例；`MonoSystem.dispatch(events)` 不是 `Controller.dispatch`，勿误拦。
  5. M-01 回归命令建议仍含 `transactionCapability.spec.ts`。
  6. `test:postgres` 环境可用则必跑且不得新增失败。

