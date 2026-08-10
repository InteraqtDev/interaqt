# condition-admission-and-tx-visibility — 运行记录

生成印记：cyclic-task-prompt | task: condition-admission-and-tx-visibility | Task 1 设计轮启动

| 轮次 | 角色 | 结论摘要 |
|------|------|----------|
| d0 | 设计 | 初始化设计文档 `status: 设计中`，`design-round: 0/15`。基线 git `5ae608e`；相关测试 56 passed。真 PG 求证：FR-01 无锁 Condition+SM 双并发扣满余额 → successes=2、balance=-100；lockRecord 对照 → successes=1、balance=0。FR-02(a) 跨连接不可见；外层 runInTransaction 嵌套 dispatch 可见但 SE 在 outer commit 前触发；NestedDispatchError 仍在。FR-02(b) 仅 boolean；无稳定 code；InteractionGuardError 非 ConditionError 实例。方案：Condition.locks + AdmissionSnapshot；runInBusinessTransaction + defer post-commit；Condition 结果代数 + context.admission。里程碑 M-01..M-04 全开放。下一步：additional task 1 设计评审。 |
| d0 | 评审 | 结论：需要修订。覆盖写入 `condition-admission-and-tx-visibility-review.md`。R-1（关键事实+逻辑）：业务事务依赖 nested reuse 无 savepoint；真 PG 证软错误部分写可提交、RetryableWriteConflict 嵌套双写双事件；须 savepoint 或整事务重试 + 默认 fail-fast。R-2：FR-02(b) 对象返回值未桥接 BoolExp，`error.code` 不可达。R-3：nested/Condition 路径无法升 SERIALIZABLE。FR-01 主路径可继续。未改设计文档。下一步：additional task 2 裁决。 |
| d1 | 裁决 | 评审结论「需要修订」成立。**全部采纳** R-1/R-2/R-3（类别 1+2）。独立真 PG 复核：软错误外层可提交 draft；resolve 半截写可提交；嵌套 retry → notes=`[attempt-1,attempt-2]` 且 events=2；`error.code` undefined；Condition 内 RequireSerializableRetry → attempts=1 不升级。修订设计：§3.3 SAVEPOINT per attempt + 默认 onDispatchError abort + defer SE；§3.4.2 BoolExp 旁路 channel 与 and/or/not code 表；§3.2.3 删除 Interaction 级 SERIALIZABLE，隔离仅外层 BEGIN。`design-round: 1/15`，`status: 设计中`。下一步：additional task 1 复审。 |
| d1 | 评审 | 结论：需要修订。覆盖写入 review。R-1（事实+逻辑）：`nestedStrategy:'savepoint'` 作用域未钉死——今日仅声明 reuse 且无代码分支；全局改 savepoint 会改裸嵌套 catch-continue 语义，仅 BT savepoint 又与能力位冲突。R-2（事实+逻辑）：BT 内仍走 `runWithTransactionRetry` 时 `RequireSerializableRetry` 会空转升级至 `TransactionRetryExhaustedError`，与「错误可识别、不升级」矛盾。R-3（逻辑+里程碑）：abort 同时写返回 soft error 与 throw，JS 不可并存；M-02 C/D 调用形态不定。主方案与 FR 求证仍成立。未改设计。下一步：additional task 2。 |
| d2 | 裁决 | 评审「需要修订」成立。**全部采纳** R-1/R-2/R-3（类别 1+2+5）。独立源码核验：`nestedStrategy` 仅声明无分支；`runWithTransactionRetry` 对 RequireSerializable 固定升级；dispatch abort 不可既 return 又 throw。修订：§3.3.2 A 互斥表（BT 专用 SAVEPOINT，`nestedStrategy` 保持 reuse，用例 J）；D 表切断 BT 内升级环并保留写冲突重试（用例 K）；E 表 abort=只 throw + BT reject。`design-round: 2/15`，`status: 设计中`。下一步：additional task 1 复审。 |
| d2 | 评审 | 结论：需要修订。覆盖写入 review。R-1（事实+逻辑+任务目标）：BT 未规定必须拥有最外层存储提交；已有 `runInTransaction` 内启动 BT 时 nested reuse 使 defer-SE 在外层 ROLLBACK 前可外逸，与 FR-02(a) 同构回归；须拒绝非最外层/BT 重入并加用例 L/M。R-2（事实+逻辑）：BT 内可重试集合未收窄，全量 `isRetryableTransactionError` 含连接级错误，与 BT 同连接 SAVEPOINT 模型矛盾；须完整错误族表+用例 N。FR-01/FR-02(b)/d2 已闭合项无新阻断。未改设计。下一步：additional task 2。 |
| d3 | 裁决 | 评审「需要修订」成立。**全部采纳** R-1/R-2（类别 1+2+4）。独立源码核验：`MonoSystem`/`PostgreSQLDB` nested 仅 depth++（内层返回≠COMMIT）；`Controller.dispatch` 成功后立即 SE；`isRetryableTransactionError` 含 57P01/ECONNRESET/EPIPE/SQLITE_BUSY 且注释要求新连接重试。修订：§3.3.2 A2 提交所有权互斥表（拒绝已有存储事务/BT 重入；flush 仅最外层 COMMIT 成功后）；§3.3.2 D 完整错误族 S/W/C/Q/O 与 BT_SAVEPOINT_RETRYABLE 不变量；用例 L/M/N/O；风险与 M-02 同步。`design-round: 3/15`，`status: 设计中`。下一步：additional task 1 复审。 |
| d3 | 评审 | 结论：需要修订。覆盖写入 review。R-1（事实+逻辑）：BT 内 D 表将全部 `RequireSerializableRetry` 一律 fail-fast，未区分 RC 下不可升级 vs 已 SERIALIZABLE 时顶层 `runWithTransactionRetry` 仍会 attempt 重试；Transform/Scheduler/replace 等路径会在 SERIALIZABLE BT 内被误杀。须拆 S-upgrade/S-retry 并增 M-02 K2。A2 所有权、abort=throw、连接级收窄、FR-01/FR-02(b)、nestedStrategy 作用域本轮无新阻断。未改设计。下一步：additional task 2。 |
| d4 | 裁决 | 评审「需要修订」**不成立于采纳层面**。**驳回** R-1（主张类别 1+2，证据不足/误读）。独立源码枚举：全部 `throw new RequireSerializableRetry` 均带 `!== 'SERIALIZABLE'` 门闩或 nested 升级条件；顶层 `runWithTransactionRetry` 对 S 的 continue 是新 BEGIN 升级 attempt，不是「已 SERIALIZABLE 连接上门闩再抛再 continue」。PGLite 探针：SERIALIZABLE 外层 isolation 可见、嵌套 SER 不抛、门闩 wouldThrow=false；RC 外层嵌套 SER 抛 S。澄清修订（非采纳）：D 事实 5、S 行钉死与 isolation 无关 fail-fast、S∉BT_SAVEPOINT_RETRYABLE、禁止 S-retry 分支、用例 K′（SER BT 门闩前进）。`design-round: 4/15`，**无采纳复审问题** → `status: 实现中`，`N=20`。下一步：additional task 3 实现 M-01。 |
| k1 | 实现 | M-01 实现完成并标 `待审`。`Condition.locks` + `AdmissionSnapshot`；`checkCondition` 求值前并集加锁（含 not）、稳定序复用 `atomic.lockRecord`/`lockRows`、content 第二参数。验收：`postgresqlConditionAdmission.spec.ts` 1 passed（真 PG 并发双扣）；`condition.spec.ts`+`guard-klasses.spec.ts` 30 passed；`npm run check` 0。`implementation-round: 1/20`。下一步：additional task 4 审计 M-01。 |
| k1 | 审计 | M-01 退回开放（reopen 1，domain admission-snapshot-readonly）。验收命令复验：加强前 condition/guard 30 passed、PG 1 passed、check 0。缺陷注入：跳过 lockRecord 时空 snapshot 使原 `successes≤1` 仍绿 → 审计直接收紧为 successes=1/failures=1/balance=0，并纳入 test:postgres；补 match 单测。实现缺陷：AdmissionSnapshot get/getAll 共享可变行且 put 对 content 可见，and 组合后 atom 读到被改写 balance；失败复现 condition.spec 只读用例保持红。next-action：封板只读 snapshot。下一步 additional task 3。 |
| k2 | 实现 | M-01 只读密封完成并标 `待审`。`AdmissionSnapshot.seal()` 后 `put` 抛错；`get`/`getAll` 与入库 `put` 均浅拷贝；`acquireAdmissionLocks` 返回前 seal。验收：`AdmissionSnapshot is read-only` 1 passed；`condition.spec`+`guard-klasses` 32 passed；`postgresqlConditionAdmission` 1 passed；`npm run check` 0。`implementation-round: 2/20`。下一步：additional task 4 审计 M-01。 |
| k2 | 审计 | M-01 再次退回开放（reopen 2，domain admission-snapshot-readonly → **domain-review**）。验收复验：有锁只读/PG/check 绿；缺陷：`acquireAdmissionLocks` 在 locks 为空时 early-return 未 seal，content 可 put 伪造行。失败复现 empty-locks 只读用例保持红。Convergence Note 已写。下一步 additional task 3。 |
| k3 | 实现 | M-01 domain-review 闭合：`acquireAdmissionLocks` 单一出口 `seal()`（含 locks 为空）；empty-locks 只读用例 + condition/guard 33 passed；真 PG 1/1/0；check 0。标 `待审`。`implementation-round: 3/20`。下一步：additional task 4 审计 M-01。 |
| k3 | 审计 | M-01 关闭（admission-snapshot-readonly 领域闭合；domain-review → normal）。独立复验：condition+guard 33 passed；empty-locks/有锁只读绿；真 PG 1/1/0；check 0。缺陷注入（去 seal/put 忽略 sealed/get·getAll 共享引用/跳过 lock*）均能令对应用例红并已复原。验证缺口：加强有锁只读覆盖 getAll 浅拷贝（产品原正确，不 reopen）。next-action 无；current-milestone M-02。下一步 additional task 3。 |
| k4 | 实现 | M-02 实现完成并标 `待审`。`Controller.runInBusinessTransaction`（A2 所有权拒绝 + 最外层 BEGIN/COMMIT）；BT 内 dispatch attempt SAVEPOINT；abort=throw / continue=soft；BT retry：S fail-fast、W SAVEPOINT 重试、C/Q 零次连接级重试；SE/postCommit 仅 owned COMMIT 后 flush。验收：businessTransaction 18 passed；真 PG admission+BT 19 passed；transactionAcceptance+Retry 30 passed；condition+guard 33 passed；check 0。`implementation-round: 4/20`。下一步：additional task 4 审计 M-02。 |
| k4 | 审计 | M-02 关闭（无实现缺陷；验证加强不 reopen）。独立复验：businessTransaction 18；真 PG admission+BT 套件+businessTransaction 24；txn acceptance/retry 30；condition+guard 33；check 0。缺陷注入：无 SAVEPOINT→F 红；early SE→加强后 B+O 红；全量 retry→K+N 红；跳过 A2-3→L 红；abort=soft→C+D 红。验证缺口：B/C/D 死 SE 观察者改为 InteractionEvent+postCommit；新增 postgresqlBusinessTransaction（A/F/K/L/O）并入 test:postgres；NestedDispatch 文案同步 AGENTS/README。next-action 无；current-milestone M-03。下一步 additional task 3。 |
| k5 | 实现 | M-03 实现完成并标 `待审`。`checkCondition` 规范化 boolean / `{allowed}` 对象 / throw；结构化拒绝走 error-string + WeakMap 旁路 channel；`InteractionGuardError` 暴露 `code`/`details`/`conditionName`；通过侧合并 `context.admission`（freeze）；`cloneDispatchArgs` 浅克隆 context。验收：conditionAdmissionContext 13 + condition 12 + guard 21 + businessTransaction 18；`npm run check` 0。`implementation-round: 5/20`。下一步：additional task 4 审计 M-03。 |
| k5 | 审计 | M-03 关闭（无实现缺陷；验证加强不 reopen）。独立复验：conditionAdmissionContext 13 + condition 12；check 0；guard+BT 39。对抗探针与缺陷注入见 audit 文件；矩阵 #10 加强 freeze/clone 断言。next-action 无；current-milestone M-04。下一步 additional task 3。 |
| k6 | 实现 | M-04 文档/导出/交叉回归完成并标 `待审`。usage+generator 写入 FR-01 locks/snapshot、FR-02(a) BT 合同表与 NestedDispatch 对照、FR-02(b) 结果代数与 typed code、SERIALIZABLE/RSR 边界；18 导出清单对齐公开符号。验收：check 0；condition+txnAcceptance+txnRetry+atomicState 43；admissionContext+BT+guard 52；`test:postgres` 9 files / 39 tests（含 ConditionAdmission + BusinessTransaction）。`implementation-round: 6/20`。下一步：additional task 4 审计 M-04。 |
| k6 | 审计 | M-04 退回开放（reopen 1，domain docs-condition-contract-consistency）。验收命令复验绿：check 0；43；52；test:postgres 9/39。导出与 usage/06/14/18/19/20、permission-implementation、AGENTS、README 对照通过。实现缺陷：generator/api-reference.md Condition 仍 fail-open（undefined→true、event.error、仅 boolean、无 locks/BT）；permission-test-implementation event.error 示例；test-implementation NEVER try-catch 与 BT abort 冲突。next-action：对齐 generator API/测试指南文档后复跑验收。下一步 additional task 3。 |
| k7 | 实现 | M-04 文档一致性缺陷 D-1 修复并标 `待审`。对齐 generator/api-reference Condition（fail-closed 结果代数、locks/snapshot、BT/dispatch 错误模式；删 undefined→true 与 event.error 通道）；permission-test-implementation 结构化拒绝 + BT abort 断言；test-implementation 区分 soft result.error 与 BT abort try-catch。rg 扫尾仅剩 ❌ 反模式 event.error。验收：check 0；43；test:postgres 9/39。`implementation-round: 7/20`。下一步：additional task 4 审计 M-04。 |
| k7 | 审计 | M-04 关闭（docs-condition-contract-consistency 领域闭合）。独立复验：check 0；43；admissionContext+BT+guard 52；交叉 runtime 95；test:postgres 9/39。D-1 完成条件与 generator/usage/导出对照通过；event.error 仅 ❌ 反模式。最终核验 Task §1–§7 通过。全部里程碑已完成 → `status: 已完成`。不启动新 chat。 |

---

## 终止总结

- **终止状态**：`已完成`（全部里程碑审计关闭且最终核验通过）。
- **原因**：FR-01 / FR-02(a) / FR-02(b) 与文档导出交叉回归均已交付并独立复验。
- **设计轮数**：`design-round: 4/15`（d0 设计 + d1..d4 裁决；d4 驳回复审后进入实现）。
- **实现轮数**：`implementation-round: 7/20`（预算 N=20，未耗尽）。
- **里程碑终态**：
  - M-01 已完成（reopen 2，domain `admission-snapshot-readonly`，k2 触发 domain-review，k3 关闭）。
  - M-02 已完成（reopen 0）。
  - M-03 已完成（reopen 0）。
  - M-04 已完成（reopen 1，domain `docs-condition-contract-consistency`，k7 关闭）。
- **设计阶段采纳问题类别**：事实错误、内部逻辑矛盾、里程碑不可执行、违反任务目标（R-1/R-2/R-3 等，见设计 §8）；d4 驳回一项误读的 S-retry 拆分主张。
- **审计实现缺陷**：M-01 只读 snapshot（2 次 reopen，含 empty-locks 未 seal）；M-04 generator 文档 fail-open / event.error（1 次）。M-02/M-03 无实现缺陷 reopen。
- **审计验证缺口（不 reopen）**：M-01 getAll 浅拷贝加强；M-02 SE 观察者与 postgresqlBusinessTransaction；M-03 freeze/clone 矩阵加强。
- **收敛模式**：M-01 曾 `domain-review`（admission-snapshot-readonly），关闭后恢复 normal；未触发 milestone-review。
- **自动调整里程碑次数**：0（未拆分/合并里程碑；N 保持 20）。
- **人工介入**：0。
- **预算**：满足（k=7 ≤ N=20）；无未完成阻塞。
- **协议改进建议**（最多 3）：
  1. M-04 类「文档一致性」里程碑应在设计验收命令中显式列出 generator 权威路径与 `rg` 扫尾表达式，避免 usage 已对齐而 generator API 参考仍相反却晚到 reopen。
  2. 只读/密封类 API 的验收宜默认包含「空输入 / early-return」单元格（M-01 empty-locks 未 seal 逃过首轮有锁用例）。
  3. 审计轮对纯文档缺陷可规定「内容对照清单 + 禁止教学句式表」作为关闭门闩模板，减少与产品缺陷注入模板混用时的遗漏。

