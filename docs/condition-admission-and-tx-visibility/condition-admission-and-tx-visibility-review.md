# Condition 声明式准入与事务可见性 — 设计评审

- **评审角色**：独立设计评审（Task 1 additional task 1）
- **设计文档**：`docs/condition-admission-and-tx-visibility/condition-admission-and-tx-visibility.md`
- **设计轮次（评时）**：`design-round: 3/15`，`status: 设计中`
- **结论**：`需要修订`

本轮在形成结论前未依赖旧版评审正文；依据 Task 1、当前设计、`AGENTS.md` 与源码/最小实验。

---

## 已核对且不构成六类复审问题的要点

下列项在本轮对照源码或实验后，认为 **d3 修订已闭合** 或 **不落入六类复审条件**（可留作实现注意事项）：

| 主题 | 核对 |
|------|------|
| FR-01 / FR-02 求证 | 设计 §1 与主干行为一致：`checkCondition` 仅 boolean；`InteractionGuardError` 无 `code`；嵌套 `runInTransaction` 为 `depth++` reuse；`Controller.dispatch` 在 `runWithTransactionRetry` 成功返回后立即 `runPostCommitHook` / `runRecordChangeSideEffects`；`lockRecord`/`lockRows` 存在且要求活跃事务。 |
| FR-01 主路径 | 声明式 `locks` → 事务内 `lockRecord`/`lockRows` + AdmissionSnapshot；不交付 Interaction 级 SERIALIZABLE；真 PG 并发合同与 Task 一致。 |
| `nestedStrategy` 作用域 | 生产驱动仍为 `'reuse'`；全库无按该字段发 SAVEPOINT 的分支（仅类型/声明）。BT 专用 SAVEPOINT 与公开能力位解耦，并有非 BT 回归用例 J——与 d2 裁决一致，无回退。 |
| 提交所有权 A2 | 入口拒绝已有存储事务 / BT 重入；flush 仅最外层 COMMIT 成功之后；用例 L/M/O。与 `MonoSystem`/`PostgreSQLDB`「内层返回 ≠ COMMIT」事实一致，能堵住 §1.3 D 类 SE 外逸。 |
| abort 传播 | §3.3.2 E：`abort` 只 throw + BT reject；`continue` 只 soft；禁止「既返回又抛出」。与 JS `await` 语义一致。 |
| BT 内连接级错误 | D 表将 `57P01`/`ECONNRESET`/`EPIPE`/`SQLITE_BUSY` 排除出 SAVEPOINT 重试集，且禁止 BT 无参复用全量 `isRetryableTransactionError`；与 `transaction.ts` 注释（连接级重试=新连接+事务从头）一致；用例 N。 |
| FR-02(b) 桥接 | 对象不进 BoolExp；结构化拒绝走 string + 旁路 channel；`not(string)` fail-closed。本轮用 `BoolExp.evaluateAsync` 最小脚本复核：`or` 双拒绝返回 **右** 原子；`not(string)` 仍失败；`not(false)` 通过；`and` 左拒绝短路——与 §3.4.2 组合表一致。 |
| SAVEPOINT 错误恢复（PG） | 本轮真 PG：语句级 `40001` 后 `ROLLBACK TO SAVEPOINT` **可以**恢复同一外层事务并继续查询；唯一约束违反同理。说明「W 族 + SAVEPOINT 重试」在 PG 上不是空谈。（死锁 `40P01` 剧本本轮未稳定打完，不作为否决依据；设计已把 `40P01` 列入 W 族，实现期用用例覆盖即可。） |
| 里程碑拆分 | M-01..M-04 可分验收；FR-01 真 PG 门禁清楚；M-02 用例 A–O 覆盖 attempt/所有权/重试族；M-03 矩阵覆盖 code 与 `not`。 |
| Activity | Activity 包装 interaction 仍走 `Controller.dispatch` + `runInteractionGuard`；锁与 BT 钩子在汇合点可覆盖。实现期枚举出口即可。 |

---

## 需要复审的问题

### R-1 — BT 内将全部 `RequireSerializableRetry` 一律 fail-fast，误伤「已在 SERIALIZABLE 下的 attempt 重试」语义

| 项 | 内容 |
|----|------|
| **类别** | 1 关键事实错误；2 内部逻辑矛盾 |
| **设计位置** | §3.3.2 **D** 错误族表（S 行）；§3.3.4 业务事务与隔离级别；§3.3.5 用例 K（仅 RC）；§1.5 / 风险表中「BT 内切断升级环」的表述 |
| **被违反的要求或原则** | （1）关键事实：`RequireSerializableRetry` 在现行 `runWithTransactionRetry` 中不仅表示「请升级隔离」，而且在 **已经是 SERIALIZABLE** 时仍会 `continue` 重跑 attempt——框架写路径（Transform replace、Scheduler 若干 full-recompute/patch 等）用它表达「整段 attempt 重来」。（2）内部矛盾：§3.3.1/§3.3.4 提供 `runInBusinessTransaction({ isolation: 'SERIALIZABLE' })` 作为合法 API，但 D 表对 S 族「**立即**结束该 dispatch；**零次**隔离升级重试」未区分「不能升级」与「已在 SERIALIZABLE 下应 SAVEPOINT 重试」，使 SERIALIZABLE BT 与顶层 SERIALIZABLE `dispatch` 在同类抛错下行为分裂，相关 computation 路径在 BT 内会误失败。 |
| **证据** | 1. `src/runtime/transaction.ts` `runWithTransactionRetry`：捕获 `isRequireSerializableRetry` 后固定 `isolation = "SERIALIZABLE"` 并 `continue`，**不**判断「是否已是 SERIALIZABLE」；因此第二次及以后的同族错误仍是 attempt 重试，直到 `maxAttempts`。2. 抛出点不只是 nested isolation 升级：`Controller.ts`（entity/relation replace）、`Scheduler.ts`、`Transform.ts` 等在业务/计算路径直接 `throw new RequireSerializableRetry(...)`。3. `MonoSystem.runInTransaction` / `PostgreSQLDB.runInTransaction`：仅当 **existing.isolation !== 'SERIALIZABLE' && 请求 SERIALIZABLE** 时抛 `RequireSerializableRetry`；BT 已以 SERIALIZABLE BEGIN 时，嵌套 `runInTransaction(..., SERIALIZABLE)` **不会**再因升级而抛——此时仍出现的 `RequireSerializableRetry` 来自上述计算路径，含义是 **retry**，不是 **upgrade**。4. 设计 D 表 S 行与用例 K 只钉死「RC 下不能升级、错误可识别」，未给出「BT isolation 已是 SERIALIZABLE」列，也未要求与 F（W 族 SAVEPOINT 重试）对等的 SERIALIZABLE 重试用例。 |
| **同类检查范围与命中** | 所有「BT 内 retry / 隔离」叙述：D 全集、§3.3.4、M-02 K/F 对照、实现备忘 §6.6、风险表「BT 内 RequireSerializableRetry 空转升级」。**命中**：S 族合同不完整。**未命中（已正确）**：RC 下拒绝升级、切断「nested RC + 反复 RequireSerializable → TransactionRetryExhaustedError 空转」——该部分应保留。 |
| **必须完成的修正** | 1. 将 D 表 **S** 拆成互斥两行（名称可微调，语义固定）：<br>• **S-upgrade**（BT 当前 isolation 为 `READ COMMITTED`）：`RequireSerializableRetry` → **立即**失败该 dispatch；**零次**「设 isolation=SERIALIZABLE 再 continue」；错误对调用方可识别为 `RequireSerializableRetry`（或稳定包装且 cause 链保留原实例）；**不得**耗尽为无 cause 的纯 `TransactionRetryExhaustedError`；文档/消息提示改用 `runInBusinessTransaction({ isolation: 'SERIALIZABLE' })`。<br>• **S-retry**（BT 当前 isolation **已是** `SERIALIZABLE`）：`RequireSerializableRetry` → 与 **W** 相同：当前 attempt `ROLLBACK TO SAVEPOINT` 后 **允许**同一 dispatch 多 attempt 重试；**不得**再改 isolation；耗尽 → 该 dispatch 失败 → E。<br>2. 不变量补一句：`BT 内对 RequireSerializableRetry 的 attempt 循环 ⇔ 外层 isolation 已是 SERIALIZABLE`；RC 下该错误 **∉** `BT_SAVEPOINT_RETRYABLE`。<br>3. 汇合点：BT 感知 retry 包装必须读取「当前 BT isolation」（或外层事务 isolation），禁止对 S 族无条件 fail-fast。<br>4. M-02 验收：保留 **K**（RC + RequireSerializableRetry → 一次失败、可识别）；**新增 K2**（或扩展 K）：`runInBusinessTransaction({ isolation: 'SERIALIZABLE' })` 内第一次 attempt 抛 `RequireSerializableRetry`、第二次成功 → 仅最终 attempt 事实与 1 条事件（与 F 同构），证明 SERIALIZABLE BT 下 S 为可重试而非整 BT 误杀。 |
| **修正完成的验证方式** | 设计正文 D/§3.3.4/用例表/风险表交叉一致，无「BT 内 S 一律零重试」残留；裁决轮按 K + K2 对照阅读后应能唯一确定 RC vs SERIALIZABLE 行为。实现后：K 红/绿合同不变；K2 与 F 一起证明「可重试集合」含「已 SERIALIZABLE 下的 RequireSerializableRetry」，且 RC 下仍无升级空转。 |

---

## 实现注意事项（不触发复审）

1. **SAVEPOINT 与内存 effects / `eventArrayBaselines`**：外层 `ROLLBACK` 才截断 baselines 的今日逻辑不足以覆盖 `ROLLBACK TO`；实现必须在每次失败 attempt 后截断本 attempt 的 `effects`、调用方事件数组基线及任何 attempt 级登记，并用 E/F/K2 固定。设计风险表已点到，保持即可。
2. **无公开 savepoint API**：PG `scheme()` 经 `getQueryable()` 走事务绑定连接，具备落地条件；宜内部 `supportsSavepoint`（或驱动白名单）与 `nestedStrategy:'reuse'` 解耦，失败拒绝 BT，禁止静默 reuse。
3. **`cloneDispatchArgs` 与 `context.admission`**：今日不克隆 `context`；M-03 需浅克隆并在 guard→`mapEventData` 之间规定 admission 暂存位置（例如写入 attemptArgs 的只读合并点），避免与用户 `context` 顶层键冲突（子键 `admission` 已定）。
4. **锁 id 为空 / 锁行不存在**：解析结果为 `null`/`undefined`/空列表时应 fail-closed 或按「无行可锁」的明确合同处理；`lockRecord` 空快照下 `content` 不得误通过。
5. **`storage.listen` 回调**：在写路径事务内同步触发，不是本任务的 `RecordMutationSideEffect` 通道；文档可一句界定，避免与 defer SE 混淆。
6. **BT 外层 COMMIT 时的 `40001`**：F 表已规定 COMMIT 失败则丢弃 defer 并 reject；是否对整个 `fn` 做 BT 级自动重试非本任务目标——保持「调用方重试整个 `runInBusinessTransaction`」即可，勿在实现中静默半套外层 retry 却不定义幂等合同。
7. **死锁 `40P01` + SAVEPOINT**：实现期在真 PG 上为 W 族补一条与 F 并列的死锁重试或至少语句级恢复探针，避免只测 `RetryableWriteConflict` 注入。

---

## 结论

| 项 | 值 |
|----|-----|
| **结论** | **需要修订** |
| **需要复审的问题数** | 1（R-1） |
| **主方案是否仍成立** | **是**。Condition 声明式锁、BT 专用 SAVEPOINT、A2 提交所有权、abort=throw、defer SE、连接级错误收窄、FR-02(b) BoolExp 旁路 channel 均仍成立；本轮仅要求把 BT 内 `RequireSerializableRetry` 按 **当前隔离级别** 拆成 upgrade-fail vs serializable-retry，并补验收对照。 |
| **目标不可实现？** | 否 |
| **设计文档** | 本轮 **未修改** |
| **下一步** | additional task 2（设计裁决） |
