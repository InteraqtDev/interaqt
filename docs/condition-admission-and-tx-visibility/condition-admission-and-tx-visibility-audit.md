# condition-admission-and-tx-visibility — 实现审计

- **轮次**：implementation-round 7/20 之后（additional task 4）
- **当前里程碑**：M-04
- **结论**：**验收通过，无实现缺陷** — M-04 `待审` → **`已完成`**；全部里程碑关闭；**最终核验通过** → `status: 已完成`
- **convergence-mode**：normal（本轮无 reopen）
- **reopen-domains**：不变（M-04 保持 `docs-condition-contract-consistency: 1`，已在 k7 修复后闭合）

## 1. 复验命令与结果

| 命令 | 结果 |
|------|------|
| `npm run check` | **exit 0** |
| `npx vitest run tests/runtime/condition.spec.ts tests/runtime/transactionAcceptance.spec.ts tests/runtime/transactionRetry.spec.ts tests/runtime/atomicState.spec.ts` | **4 files / 43 passed** |
| `npx vitest run tests/runtime/conditionAdmissionContext.spec.ts tests/runtime/businessTransaction.spec.ts tests/builtins/guard-klasses.spec.ts` | **3 files / 52 passed**（M-01..M-03 回归） |
| 交叉 runtime 合计（condition + admissionContext + BT + guard + txnAcceptance + txnRetry + atomicState） | **7 files / 95 passed** |
| `INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npm run test:postgres` | **9 files / 39 passed**（含 `postgresqlConditionAdmission` 1 + `postgresqlBusinessTransaction` 5） |

## 2. M-04 关闭条件对照（含 k6 D-1 修复）

### 2.1 包根导出

tsx 抽检值空间均可导入：`AdmissionSnapshot`、`InteractionGuardError`、`BusinessTransactionBoundaryError`、`getActiveBusinessTransaction`、`NestedDispatchError`、`ConditionError`、`RequireSerializableRetry`、`RetryableWriteConflict`、`isBusinessTransactionSavepointRetryable`、`isBusinessTransactionConnectionFatal`、`isBusinessTransactionBoundaryError`、`isRequireSerializableRetry`、`Condition`、`Controller`。

路径：`src/index.ts` → runtime / builtins `export *`；与设计 §3.5 一致。

### 2.2 D-1 完成条件逐项

| # | 要求 | 本轮证据 |
|---|------|----------|
| 1 | `generator/api-reference.md` Condition 对齐 fail-closed 结果代数、snapshot、locks、typed code；删除 `undefined→true` 与官方 `event.error` | Condition 节签名含 `AdmissionSnapshot` / `{ allowed }` / `locks`；`undefined` → `CONDITION_INVALID_RESULT`；Controller 含 `runInBusinessTransaction`、BT abort 抛出、NestedDispatch 对照、RSR 非升级 |
| 2 | `permission-test-implementation.md` 去掉 Condition `event.error=` 教学模式 | 分页 / CustomError 示例为 `{ allowed:false, code }`；`event.error =` **仅**出现在 ❌ 反模式块 |
| 3 | `test-implementation.md` 取消「永远不需要 try-catch」绝对句 | 明确顶层 soft `result.error` vs BT abort / NestedDispatch / `forceThrowDispatchError` 抛出 |
| 4 | `rg` 扫尾 Condition 语境无 fail-open / 官方 event.error 通道 | 全 knowledge 树 `event.error =` 仅：`permission-test` ❌ 与 `usage/19` 反模式；无 `Treated as true` / `undefined→true` 教学 |
| 5 | 复跑 M-04 验收 | check 0；43；test:postgres 9/39 |

### 2.3 usage / AGENTS / README / generator 其它

| 表面 | FR-01 | FR-02(a) | FR-02(b) | NestedDispatch / S·RSR |
|------|-------|----------|----------|-------------------------|
| usage/06, 05, 14, 18, 19, 20 | 有 | 合同表 / API | 结果代数 + code | 有 |
| generator/permission-implementation | locks + snapshot | BT | 结果代数 | 有 |
| generator/api-reference | 对齐 | BT 方法 + 错误模式 | 对齐 | 有 |
| generator/permission-test + test-implementation | — | BT abort 断言 | structured code | 有 |
| AGENTS.md / README.md | locks 注释 | runInBusinessTransaction | `{allowed,code?}` | NestedDispatch 文案已改 |
| `package.json` `test:postgres` | 含 ConditionAdmission | 含 BusinessTransaction | — | — |
| `src/runtime/transaction.ts` NestedDispatch 文案 | — | 指向 BT | — | 已改 |

### 2.4 产品合同抽检（防文档绿、实现回退）

- `AdmissionSnapshot.seal` / `put` 只读；`acquireAdmissionLocks` 出口 seal（M-01 领域已关）。
- `Controller.runInBusinessTransaction`：A2 所有权、`onDispatchError` 默认 abort、defer SE。
- `checkCondition`：`CONDITION_INVALID_RESULT` / `CONDITION_REJECTED` / `CONDITION_THROWN`；`context.admission` freeze。
- 真 PG：FR-01 并发扣满；FR-02(a) A/F/K/L/O 子集。

## 3. 对抗性文档审查

- **同类范围**：generator Condition / Controller / 测试指南；usage 06/14/18/19/20；AGENTS；README；导出清单。
- **未发现**仍教授 fail-open、仅 boolean、官方 `event.error` 通道、或「先 commit 再 nested dispatch」为推荐路径的权威段落。
- **非阻塞观察**（不 reopen、不阻最终完成）：
  - README「Useful exported helpers」仍未枚举 BT / Admission 新符号；正文与 NestedDispatch 段已描述 BT。
  - generator 测试示例大量保留鸭式 `ConditionError.type === 'condition check failed'`，与运行时兼容且设计允许；structured `.code` 已在关键示例中出现。

## 4. 缺陷注入 / 验证缺口

本轮为文档一致性关闭轮：

- 产品测试不能捕获 generator 文档；关闭门闩是内容对照 + `rg` + 验收命令复验。
- k6 指出的 D-1 三项文件均已按完成条件修复；无新实现缺陷。
- 未对已关闭的 M-01..M-03 产品路径重复缺陷注入（前轮已注入且本轮回归 95 + PG 39 全绿）。

## 5. 最终核验（全部里程碑 + Task 要求）

| Task 项 | 结论 |
|---------|------|
| §1 求证 FR-01/02 缺口 | 设计 §1.2–1.4 有真 PG / 源码证据；实现已交付对应能力 |
| §2 FR-01 声明式锁 + 真 PG 双连接至多一成功 | M-01 已完成；本轮 `postgresqlConditionAdmission` 1 passed |
| §3 FR-02(a) 业务事务可见性 + 原子回滚 + SE 边界 | M-02 已完成；BT 18 + PG BT 5 passed |
| §4 FR-02(b) 类型化 code + 只读 admission 上下文 | M-03 已完成；`conditionAdmissionContext` 13 passed |
| §5 复用 lockRecord / 事务基建；NestedDispatch 文档与替代原语 | 源码 + NestedDispatch 文案 + usage/generator 一致 |
| §6 分期可测；真 PG 在 env 下绿；check / 导出 / 文档一致 | M-04 关闭；check 0；导出抽检通过；D-1 已闭合 |
| §7 范围（框架非 Mesh；非 Transform id） | 无范围偏离 |

**里程碑终态**

| 里程碑 | 状态 | reopen-count | reopen-domains | 关闭轮次 |
|--------|------|--------------|----------------|----------|
| M-01 | 已完成 | 2 | admission-snapshot-readonly: 2 | k3 审计（经 domain-review） |
| M-02 | 已完成 | 0 | ∅ | k4 审计 |
| M-03 | 已完成 | 0 | ∅ | k5 审计 |
| M-04 | **已完成** | 1 | docs-condition-contract-consistency: 1 | **k7 审计（本轮）** |

## 6. 状态写入

- M-04：`待审` → **`已完成`**
- `current-milestone`: M-04（终态）
- `next-action`: 无
- `status`: **已完成**
- 不启动新 chat（协议：全部里程碑完成且最终核验通过则终止）
