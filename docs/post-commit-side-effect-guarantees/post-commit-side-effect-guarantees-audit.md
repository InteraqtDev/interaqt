# post-commit-side-effect-guarantees — 实现审计

- **轮次**：implementation-round 3/15 之后（additional task 4）
- **当前里程碑**：M-03
- **结论**：**验收通过，无实现缺陷** — M-03 `待审` → **`已完成`**。全部里程碑已关闭；最终核验通过，任务 `status: 已完成`。
- **convergence-mode**：normal（本轮无 reopen）
- **reopen-count / reopen-domains**：不变（0 / ∅）
- **next-action**：无

## 1. 复验命令与结果

M-03 验收命令（独立复跑，不采信实现轮数字）：

| 命令 | 结果 |
|------|------|
| `npx vitest run tests/runtime/postCommitPhase.spec.ts tests/runtime/dispatchIdempotency.spec.ts tests/runtime/businessTransaction.spec.ts tests/runtime/postgresqlBusinessTransaction.spec.ts` | **67 passed**；无 `INTERAQT_POSTGRES_DATABASE` 时 PG 套件 5 skipped |
| 同上，但 `INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt` 跑 `postgresqlBusinessTransaction.spec.ts` | **5/5 passed**（本机 127.0.0.1:5432 可连；设计要求有真实 PG 时要跑） |
| `npx vitest run tests/runtime/transactionRetry.spec.ts tests/runtime/transactionAcceptance.spec.ts tests/runtime/recordMutationSideEffect.spec.ts tests/runtime/eventSource.spec.ts` | **43 passed** |
| `npm run check` | **exit 0** |

已完成里程碑回归：

| 里程碑 | 命令 | 结果 |
|--------|------|------|
| M-01 I-6 | `npx vitest run tests/runtime/review-fixes-2026-07-10-r14.spec.ts` | **8/8 passed** |
| M-01 / M-02 合同 | `postCommitPhase.spec.ts` 全文件 | **33/33 passed**（含 M-01 14 + M-02 14 + M-03 5） |
| M-01 幂等 / BT | `dispatchIdempotency` + `businessTransaction` | 含在上表 67 passed 中 |

最终核验（全部里程碑已关闭后）：`npm run test:runtime` → **116 files passed / 14 skipped**，**1188 passed / 51 skipped**，exit 0。跳过项为无 env 的真实 PostgreSQL 套件（本轮已单独跑过 `postgresqlBusinessTransaction`）及其它原有 skip，无新增失败。

## 2. M-03 关闭条件对照

设计可观察结果与验收负向，逐项独立核验。

| 条件 | 证据 |
|------|------|
| admit 去重命中后查找 + `rerunCreateMutationSideEffects` 直到 **create** mutation 副作用成功 | 二次 `dispatch` 为阶段 A `DuplicateOrder`、`postCommitPhase.notRun`、`effects: []`；按业务键 `findOne` 后 create 重跑 `complete`，镜像行 1 |
| 幂等 replay 默认仍跳过 P | 二次 `outcome === 'replayed'`、`postCommitPhase.notRun`、P 计数不增加；`dispatchIdempotency.spec.ts` 首次 1 / 回放 0 仍绿 |
| replay 之后用**本次响应** S3 走 `rerunPostCommit`，并用 id 走 create 重跑直到这些挂钩成功 | `rerunPostCommit(source, args, { data: second.data, context: second.context })`；`second.data === first.data`（包装对象）；create id 来自 `second.data.recordId`；两挂钩重跑后 `complete`；首次结果仍为 `failed` |
| admit 路径 `rerunPostCommit` 不得把 `findOne` 行当 `prior.data` | 加载行 `!==` 首次 `postCommit` 所见包装 `data`；重跑传入 `first.data` / `first.context`；第二次所见 `data` 等于第一次且 `!== found` |
| args 可重入钩子可用空 `prior` | `rerunPostCommit(source, args, {})` → `complete`；`seenKeys` 两次均为业务键 |
| create 重跑 `complete` ≠ 首次含 update 失败的阶段 P 已全部收敛 | 同一次 dispatch create 再 update，update 副作用抛错；首次 `failed` 且 `mutationType === 'update'`；create 重跑 `complete` 后首次仍 `failed` |
| 业务事务推迟 P 仍在拥有者 COMMIT 之后；之后才可组合重跑 | callback 内 `notRun` 且 `postCommitCount === 0`；resolve 后 `failed`；callback 外 `rerunPostCommit` 成功 |
| 教义指向 `isPostCommitPhaseComplete` 与可恢复重跑 | `usage/05`、`usage/14`、`generator/api-reference.md`、`generator/test-implementation.md`、`README.md`、`CHANGELOG.md` Unreleased、`agent/skill/interaqt-patterns.md`（及 `interaqt-reference.md`、`EventSource.postCommit` 注释）区分阶段 A / P；不把重复错误当成功；不把加载行当 `prior.data`；写明 update/delete 不能重建 |
| 不把 `replayed` 改义为义务完成；不新增第二套事实成功枚举 | `outcome` 仍仅为 `applied` \| `replayed`；replay 为 `notRun` |
| 默认 `result.error` 合同 | P 失败路径 `error` 仍缺席（M-01 合同仍绿） |
| FR-SE-04 未假装闭合 | CHANGELOG / 教义未声称崩溃窗口可查询或义务回执表 |

## 3. 对抗性实现审查

生产 diff 范围（相对主干）：`src/runtime/Controller.ts`、`src/runtime/index.ts`、`src/runtime/errors/PostCommitRerunError.ts`、`src/runtime/errors/index.ts`、`src/core/EventSource.ts`、`tests/runtime/postCommitPhase.spec.ts`、`tests/runtime/review-fixes-2026-07-10-r14.spec.ts`，以及 §3.5 所列教义文件。

### 3.1 同类检查范围与命中

官方组合是**调用方合同**（两个重跑原语 + 文档化步骤），不是第三套 `dispatch` 选项：

- 幂等 replay：`dispatch` 在 `outcome === 'replayed'` 时写入 `notRun` 并**返回**，不入 BT 推迟队列、不跑 `runPostCommitPhase`。尝试体返回的 `data` / `context` 来自账本或 `replayData`，供本次响应上的 `rerunPostCommit` 使用，不再 `dispatchIdempotency.load`。
- admit 去重：阶段 A 抛错 → `phaseAErrorResponse` 为 `notRun` + `error`；P 不执行。收敛靠查找已提交 create 行 + `rerunCreateMutationSideEffects`；`rerunPostCommit` 只接受调用方持有的 S3 或空 `prior`。
- 业务事务：推迟项为一项 `postCommitPhase`；callback 内 `notRun`；拥有者 COMMIT 后 `runPostCommitPhase` 就地 finalize。`rerun*` 在活跃 BT 内仍 `IN_BUSINESS_TRANSACTION`（M-02 合同）。
- 汇合点未回退：顶层 / BT 冲刷仍走同一 `runPostCommitHook` → `runRecordChangeSideEffects` → 一次 `finalizePostCommitPhase`。重跑仍走同一 runner，不复制副作用循环。
- `ActivityManager` 仍只转发 `postCommit`；完成对象在 `DispatchResponse` 上。M-01 已有 Activity 头交互 `failed` 合同。
- `isPostCommitPhaseComplete` 仍只判断本次 `status === 'complete'`，未改成「可恢复挂钩已成功」。

未发现实现缺陷。未把 FR-SE-04 标为已交付。

### 3.2 非阻塞观察（不 reopen）

- `usage/14-api-reference.md` 幂等示例先绑定 `first` / `second`，随后代码块写 `if (result.error)`（未声明的标识符）。周围正文仍正确区分阶段 A / P 与 admit 重复。资料性笔误，不构成产品行为错误。
- `agent/skill/interaqt-reference.md` 的 Complete Exports 列表未列入 `isPostCommitPhaseComplete` / `PostCommitRerunError`；同文件 Controller 段已写官方谓词与重跑 API。
- `.cursor/rules/runtime-controller.mdc` 仍写 `DispatchResponse: { error?, data?, effects?, sideEffects?, context? }`。不在 M-03 必改教义清单内。
- 幂等 replay 组合用例用 `second.data` 且断言其等于 `first.data`，未再断言重跑后 `postCommit` 所见对象。忽略 `prior` 的错误实现会被 M-02「S3 ≠ 存储行」与 admit 组合用例打红，不会从本文件 33 条上全部逃过。

## 4. 问题分类

### 实现缺陷

无。产品行为符合设计 §3.3 / §3.5 与 M-03 可观察结果。不将里程碑退回 `开放`，不增加 reopen。

### 验证缺口

无需要本轮加强后才能关闭的缺口。现有合同已能区分：replay 标成 `complete`、admit 当成功、加载行当 `prior.data`、create 重跑 `complete` 冒充首次 P 收敛、BT callback 内跑 P。

同一验证领域未连续两轮缺口。

## 5. 缺陷注入（已还原）

只短路 replay 路径上的 `postCommitPhase` 赋值；不向测试注入虚假生产副作用。

1. **`outcome === 'replayed'` 写成 `status: 'complete'`**：M-01「idempotent replay is notRun」与 M-03 replay 组合用例均红（期望 `notRun`）。已还原。

还原后 replay 仍写入 `notRunPostCommitPhase()`。全文件复验 33/33。

## 6. Task 要求逐项（最终核验）

| 要求 | 结论 |
|------|------|
| 1 求证 | 设计期已闭合；实现交付 G1/G2，G3/FR-SE-04 明确不纳入 |
| 2 FR-SE-01 | `postCommitPhase` + `isPostCommitPhaseComplete`；P 失败不进 `error`、默认不 throw；合同经 `dispatch` |
| 3 FR-SE-02 | 无首次 `effects` 的 create 重跑 + `rerunPostCommit`；失败同形状 |
| 4 FR-SE-03 | admit / replay 两条官方组合；默认 replay 仍跳过 P；`dispatchIdempotency` 首次 1 / 回放 0 |
| 5 FR-SE-04 | 不纳入；§3.4 剩余缺口仍写明 |
| 6 阶段与非目标 | 两阶段事务模型未改；无第二套事实成功枚举；无出站调度 |
| 7 汇合点 / 读者 | 顶层 dispatch、BT 冲刷、同一 runner；Activity 包装走 `DispatchResponse` |
| 8 验证 | 所列经 `dispatch` 失败、create 重跑、部分成功、两条收敛、BT 推迟、默认 replay 跳过均有合同 |
| 9 范围 | 仅框架 API、runtime、文档、测试 |

## 7. 状态更新

- M-01：保持 **已完成**
- M-02：保持 **已完成**
- M-03：`待审` → **`已完成`**
- `current-milestone: M-03`
- `current-milestone-reopens: 0`
- `next-action: 无`
- `status: 已完成`
- `implementation-round` 保持 `3/15`（审计轮不增加 `k`）

分支：全部里程碑已完成且最终核验通过 → 终止，不启动新的 chat。
