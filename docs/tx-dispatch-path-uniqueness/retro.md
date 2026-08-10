# tx-dispatch-path-uniqueness — 运行记录

generated-by: cyclic-task-prompt session
task: Task 1 事务与 dispatch 官方路径强制（零灰色兼容）
template-ref: docs/tx-dispatch-path-uniqueness/tx-dispatch-path-uniqueness-task.md

| 轮次 | 角色 | 摘要 |
|------|------|------|
| d0 | 设计 | 初始化设计文档；探针确认非 BT 的 `runInTransaction`+`dispatch` 今日允许且 SE 可在 outer COMMIT 前执行、软拒绝可致部分写提交；方案：`dispatch` try 外硬失败 + `BusinessTransactionBoundaryError.code=DISPATCH_IN_NON_BT_TRANSACTION`；里程碑 M-01 运行时+测试、M-02 文档/changelog/code 断言面（N=10）。基线 rev `92e8e70`，相关 53 tests passed。 |
| r0 | 设计评审 | 结论：通过。六类复审条件均未命中；灰路径探针复跑与源码一致；7 条实现注意事项（含 TRANSACTIONS_UNSUPPORTED 无 throw 站点、try 外硬失败、generator 扫尾加宽）。不修改设计。下一动作：additional task 2。 |
| d1 | 设计裁决 | 评审结论：通过。采纳需要复审问题：无。独立核验：探针 SUMMARY grayPathDispatchAllowed/seRanBeforeOuterCommit/softRejectLeavesOuterWrites/seLeakedOnOuterRollback 均为 true；dispatch 仅 Nested/ABORTED/BT-attempt，无非 BT 事务拦截；边界 code 联合类型与 throw 站点与 §1.3 一致（TRANSACTIONS_UNSUPPORTED 无 throw，不阻塞）。status→实现中，N=5×2=10。下一步：additional task 3 实现 M-01。 |
| k1 | 实现 | M-01：扩展 `DISPATCH_IN_NON_BT_TRANSACTION`；`Controller.dispatch` try 外硬失败；I1/I1′/ABORTED 测试以 code 断言。验收：相关 56 tests + check 绿；真 PG BT/admission 6 tests 绿。里程碑→待审。下一步：additional task 4 审计。 |
| a1 | 实现审计 | M-01 通过→已完成。复验 56+check+PG6 绿；对照设计：try 外 DISPATCH_IN_NON_BT_TRANSACTION、code/文案、I1/I1′/ABORTED；缺陷注入去 gate 后 I1 红。实现缺陷 0。next：additional task 3 实现 M-02。 |
| k2 | 实现 | M-02：CHANGELOG Unreleased breaking 迁移表；§1.4 usage/generator/AGENTS/README 硬错误扫尾；permission-test 以 code/conditionName 断言；ConditionError 文档+JSDoc deprecated。软短语 rg 无命中；34 tests + check 绿。里程碑→待审。下一步：additional task 4 审计。 |
| a2 | 实现审计 | M-02 通过→已完成。复验 soft-rg 无命中；相关 56 tests + check + 真 PG 6 tests 绿；§1.4 与 changelog 迁移表/ConditionError 降级对照通过；M-01 gate 仍在。实现缺陷 0。最终核验 Task 1–9 全覆盖。status→已完成。不启动新 chat。 |

## 终止总结

- **最终状态**：`已完成`
- **设计轮数**：1/15（d0 初稿 + r0 评审通过 + d1 裁决）
- **实现轮数**：2/10（k1 M-01，k2 M-02）
- **里程碑**：
  - M-01 运行时路径唯一硬失败 + 稳定边界 code + 测试 — `已完成`，reopen-count 0，reopen-domains ∅，关闭轮 a1
  - M-02 强制升级说明 + 文档/generator/`code` 断言面 + ConditionError 降级 — `已完成`，reopen-count 0，reopen-domains ∅，关闭轮 a2
- **收敛模式**：全程 `normal`；无 domain-review / milestone-review
- **里程碑调整次数**：0
- **预算**：N=10（初始 M=2）；实际 k=2
- **交付要点**：
  1. `Controller.dispatch` 在非 BT 活跃存储事务内 try 外抛 `BusinessTransactionBoundaryError` / `DISPATCH_IN_NON_BT_TRANSACTION`
  2. 合法路径保留：顶层 dispatch、BT 内顺序 dispatch、纯 `runInTransaction` 无 dispatch
  3. CHANGELOG `[Unreleased]` breaking + 四行强制迁移表；usage/generator/AGENTS/README 与实现一致
  4. 业务拒绝正式断言面为 `InteractionGuardError.code`；`ConditionError` 文档/JSDoc deprecated，符号仍导出
- **验证**：businessTransaction + conditionAdmission + transactionAcceptance + transactionCapability = 56 passed；`npm run check` 通过；真 PG BT/admission = 6 passed
