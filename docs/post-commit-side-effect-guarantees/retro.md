# post-commit-side-effect-guarantees — 运行记录

generated-by: cyclic-task-prompt | template-sha256: 6cfe19e4e81c | generated-at: 2026-08-16

| 轮次 | 角色 | 结论 | 类别/证据 | 下一步 |
|------|------|------|-----------|--------|
| d0 | Task 1 设计初稿 | 设计文档已建立；G1/G2/G3 均经源码+最小实验证实存在；FR-SE-04 不纳入（剩余缺口已写明） | 基线 git `aa7d1c73c8dbb596fc9db3755c478cb99e779cb9`；DispatchResponse 无 postCommitPhase；replay/admit 二次不跑 P；幂等账本在 P 失败后仍为 succeeded；相关套件 70 passed | additional task 1 设计评审 |
| d1 | 设计裁决 | 评审结论「需要修订」；采纳问题 1（类别 1+2）；未驳回其它复审项 | 独立探针 3 passed：resolve `data` ≠ `findOne(['*'])`；Relation create 有端点而 `['*']` 无；I-6 错误/成功键集合不同。相关套件+r14+探针 77 passed。修正：三输入空间有限表、按种类重建、admit 禁止用加载行当 postCommit data | additional task 1 设计复审 |
| d2 | 设计裁决 | 评审结论「需要修订」；采纳问题 1（类别 1）与问题 2（类别 2） | 独立探针 2 passed：filtered relation `isFilteredRelation && !isRelation`，`['*']` 无端点、端点查询有端点；未知名 `getRecord` 为 undefined、`getRecordInfo.isRelation` 为 TypeError；merged 抽象名下写路径发 create 且 `findOne` 可读；create+update 同 P 时 update 抛错、replay 不重跑 P。相关套件+r14 74 passed。修正：`classifyCreateMutationRerun` 参考函数；义务可恢复表取代「直到成功」 | additional task 1 设计复审 |
| d3 | 设计裁决 | 评审结论「通过」；未采纳任何需要复审的问题；设计通过 | 独立核验六类条件；独立探针 1 passed：n:1 `isRelation`、三类关系 `['*']` 无端点/端点查询有端点、同名后写覆盖、BT 推迟、`load` 须在事务内、`queryHandle.map.data.records === MonoStorage.map.records`。相关套件+r14 74 passed。N=5×3=15。实现注意事项并入 §3.1/§3.2.1/§3.5/§7 与 M-01 验收，不改变方案 | additional task 3 实现 |
| k1 | 实现 | M-01 落地：`postCommitPhase` / `isPostCommitPhaseComplete`、失败循环收集、BT 单项冲刷、replayed/阶段 A 为 `notRun`；`SideEffectError` 公开导出。验收 12/12；所列回归 74/74；retention+eventSource 26/26；`npm run check` 通过。M-01→待审 | additional task 4 审计 |
| a1 | 审计 | M-01 通过，无实现缺陷；验证缺口 2（V-1 `applied`+P 失败、V-2 同名双失败明细）已加强并复验 14/14，缺陷注入已还原。M-01→已完成。reopen 0，convergence normal | additional task 3 实现 M-02 |
| k2 | 实现 | M-02 落地：`rerunCreateMutationSideEffects` / `rerunPostCommit` / `PostCommitRerunError`；分类读编译 schema；BT 内 fail-fast。验收 26/26；recordMutationSideEffect+transactionRetry 18/18；`npm run check` 通过。M-02→待审 | additional task 4 审计 |
| a2 | 审计 | M-02 通过，无实现缺陷；验证缺口 3（V-3 filtered entity 分类、V-4 mutation 重跑持续失败不 throw、V-5 空 id `INVALID_INPUT`）已加强并复验 28/28，缺陷注入已还原。M-01 回归 74/74。M-02→已完成。reopen 0，convergence normal | additional task 3 实现 M-03 |
| k3 | 实现 | M-03 落地：admit/replay 官方组合合同、create 重跑 complete ≠ 含 update 失败的首次 P、BT COMMIT 后才组合重跑；教义改写 05/14/generator/README/CHANGELOG/patterns。验收 postCommitPhase 33/33；所列回归 77 passed、postgresqlBusinessTransaction 5 skipped（无 env）；`npm run check` 通过。M-03→待审 | additional task 4 审计 |
| a3 | 审计 | M-03 通过，无实现缺陷。独立复验所列验收；真实 PG 上 `postgresqlBusinessTransaction` 5/5；缺陷注入（replay 标成 complete）打红后已还原。最终核验 `npm run test:runtime` 1188 passed / 51 skipped。M-03→已完成。全部里程碑关闭，`status: 已完成`。reopen 0，convergence normal | 终止，不启动新会话 |

## 终止记录

- **终止状态**：`已完成`。原因：M-01 / M-02 / M-03 审计均通过，最终核验通过。
- **设计轮数**：d = 3 / 15。**实现轮数**：k = 3 / 15。
- **里程碑最终状态**：M-01 已完成；M-02 已完成；M-03 已完成。
- **设计阶段采纳的问题类别**：d1 类别 1+2（三输入空间 / Relation `['*']`）；d2 类别 1（create 重建分类参考函数）与类别 2（义务可恢复表）；d3 无复审项。
- **审计发现**：实现缺陷 0；验证缺口 5（a1：V-1 `applied`+P 失败、V-2 同名双失败；a2：V-3 filtered entity 分类、V-4 mutation 重跑持续失败不 throw、V-5 空 id `INVALID_INPUT`）。缺口均在当轮加强并复验通过，未退回实现。a3 无新缺口。
- **reopen**：各里程碑 `reopen-count` 均为 0；`reopen-domains` 为空；`convergence-mode` 始终 `normal`。关闭轮次：M-01 于 a1，M-02 于 a2，M-03 于 a3。
- **自动调整里程碑**：0。
- **人工介入**：0。
- **预算**：满足（k = 3 < N = 15；d = 3 < 15）。
- **未完成任务**：无。FR-SE-04（义务完成回执表 / 崩溃窗口可查询）按设计不纳入，剩余缺口见设计 §3.4。
- **协议改进建议**（最多三项）：
  1. 验收命令中 env-gated 的真实 PostgreSQL 文件：实现轮无 env 时 skip 合法，但审计轮若探测到本机数据库可连，应补跑该文件。证据：k3 将 `postgresqlBusinessTransaction` 记为 5 skipped；a3 在同一机器用 `INTERAQT_POSTGRES_DATABASE=interaqt_test` 跑通 5/5。

