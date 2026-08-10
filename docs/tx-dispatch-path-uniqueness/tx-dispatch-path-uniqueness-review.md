# tx-dispatch-path-uniqueness — 设计评审

status: 评审完成
design-round-reviewed: 0
conclusion: 通过

评审角色：独立设计评审者（Task 1 additional task 1）  
评审对象：`docs/tx-dispatch-path-uniqueness/tx-dispatch-path-uniqueness.md`（`design-round: 0/15`，`status: 设计中`）  
基线 revision：`92e8e70525717a55ab8304c35c374a3e35d55164`  
本轮未读取旧版评审文件或归档运行结论（仅读取 Task、当前设计、项目规则与源码/探针证据）。

---

## 结论

**通过**

对照「设计复审条件」六类逐项检查后，**未发现**会使方案整体失效、关键路径不可达、违反 Task 硬约束、或里程碑不可执行的问题。方案以 `Controller.dispatch` 入口 try 外硬失败 + 扩展既有 `BusinessTransactionBoundaryError` / `DISPATCH_IN_NON_BT_TRANSACTION` 为实现汇合点，与 Task 要求 2–3、9 及既有 BT 所有权模型一致；里程碑 M-01→M-02 可独立验收，预算 `N = 10` 合理。

下列意见不构成复审条件命中，记入「实现注意事项」，**不影响**本结论。

---

## 六类复审条件检查

### 1. 关键事实错误 — 未命中

| 设计主张 | 独立核验 |
|----------|----------|
| 非 BT 的 `storage.runInTransaction` 内 `controller.dispatch` 今日允许 | **确认**。源码：`Controller.dispatch`（约 1018–1183 行）仅有 nested-dispatch / BT-aborted / BT-attempt vs 顶层 retry，**无** `isInTransaction() && !bt` 分支。 |
| 灰色路径 SE / postCommit 可在 outer COMMIT 前执行；soft reject 可与预写一并提交 | **确认**。复跑 `/tmp/interaqt-tx-path-uniqueness-prove.mts`（`npx vite-node --config vitest.config.ts`）：`grayPathDispatchAllowed=true`，`seRanBeforeOuterCommitOnSuccess=true`，`softRejectLeavesOuterWrites=true`，`seLeakedOnOuterRollback=true`。 |
| nested `runInTransaction` 为 depth reuse、内层返回≠COMMIT | **确认**。`MonoSystem.runInTransaction` nested 分支 `depth++` / `fn()` / `depth--`（约 270–280 行）。 |
| 既有边界 code：`NESTED_STORAGE_TRANSACTION` / `REENTRANT` / `SAVEPOINT_UNSUPPORTED` / `ABORTED`；BT 入口拒绝已有 RIT / 重入 | **确认**。`transaction.ts` 联合类型；`runInBusinessTransaction` A2-1..A2-4；测试 L/M 覆盖 NESTED / REENTRANT。 |
| 文档仍将裸 RIT+dispatch 写作弱推荐 / 非完备官方路径 | **确认**。至少：`usage/06-attributive-permissions.md:164`、`19-common-anti-patterns.md:659-660`、`18-api-exports-reference.md:224`、`20-postgresql-concurrency-migration.md:122` 等与设计 §1.4 一致。 |
| 新检查放在 try 外则不会被 soft `result.error` 包装 | **确认**。`NestedDispatchError` 与 `ABORTED` 均在 `try` 之前 throw；catch 仅包装进入 attempt 后的错误。设计 §3.2.1/§3.2.4 的 try 外约束与源码结构匹配。 |
| BT 内 `isInTransaction()===true` 且 ALS `active===true`，新判定不误伤 | **确认**。BT 为 `businessTransactionContext.run(bt, () => storage.runInTransaction(...))`；abort 后再次 dispatch 时 `active` 仍为 true 直至外层处理，故先命中既有 `ABORTED` 而非新 code（设计顺序正确）。 |

说明（**不**升格为关键事实错误）：§1.3 将「驱动无事务」同时写成可抛 `BusinessTransactionBoundaryError` / `code: 'TRANSACTIONS_UNSUPPORTED'`。源码中该 code 仅存在于类型与默认文案表，**无** `throw` 站点；无事务时 BT 入口实际抛 `TransactionCapabilityError`。方案不依赖该 code 的抛出路径，扩展联合类型仍合法。实现轮文档/清单宜按真实抛出类型表述，避免测试去断言一个永不抛出的 code。

### 2. 内部逻辑矛盾 — 未命中

- 合法/非法矩阵 L1–L4 / I1–I4 与判定谓词 `isInTransaction() && !(getActiveBusinessTransaction()?.active === true)` 一致；与 BT 入口 `NESTED_STORAGE_TRANSACTION`（I4）正交。
- 禁止 RIT→BT 自动升级与「硬失败 + 迁移表」一致，满足 Task「不得伪装 BT」。
- 不改变顶层 soft `result.error`、不开放嵌套 dispatch、不重做 SAVEPOINT/locks 主模型，与非目标 §2.2 及 FR-01/FR-02 回归关系 §3.2.5 一致。
- M-01（行为）先于 M-02（文档）避免「文档先于运行时」；验收命令可区分错误实现（`rejects` + 稳定 `code`，而非 `result.error`）。

§3.2.4 有一处**表述笔误**（先写 nested「在 try 内」、随即更正为 try 外），但规范性约束明确为「与 NestedDispatch / ABORTED 同级、try 外」。不构成路径不可达或双重要求冲突。

### 3. 违反项目原则 — 未命中

- 汇合点在 `Controller.dispatch`（用户唯一 Interaction 入口），扩展既有 `BusinessTransactionBoundaryError`，符合 `AGENTS.md`「汇合点修复 / 可执行不变量 / 清晰错误信息」。
- 依赖方向未要求 storage→runtime 上逆。
- 对灰色集成路径 breaking 由 Task 要求 9 明确覆盖画像「尽量超集」默认句；合法 L1–L4 保持。
- 书面方案使用稳定 `code` 与完整技术表述，符合 Plain professional language。

### 4. 违反任务目标 — 未命中

| Task 要求 | 设计覆盖 |
|-----------|----------|
| 1 求证灰色路径 | §1.2 源码 + 探针；本轮复跑一致 |
| 2 路径唯一硬失败 | §3.1–3.2；I1/I2；禁止自动升级 |
| 3 边界错误可识别 | 扩展同一 code 联合；文案指向 `runInBusinessTransaction`；既有 code 保留 |
| 4 强制升级说明 | §3.3.1–3.3.2 Unreleased + 四行迁移表 |
| 5 文档/generator 扫尾 | §1.4 + M-02 |
| 6 测试/`code` 断言面 | §3.4.1；新用例以 `code` 为准 |
| 7 ConditionError 文档降级 | M-02；不删符号 |
| 8 非目标 | §2.2 |
| 9 交付纪律 | Vitest / check / 可选 postgres；汇合点 |

范围未滑入 Mesh 迁移、entity-identity、重做 admission/BT 主模型。

### 5. 里程碑不可执行 — 未命中

- **M-01**：单点 runtime 改动（`transaction.ts` code + `Controller.dispatch` 检查）+ 负向 I1 + 既有 BT/admission/transaction 回归；可观察、可 `vitest`/`check`。
- **M-02**：changelog + 清单化文档扫尾 + ConditionError 文档降级；验收含 `rg` 软表述残留与相关测试。
- 依赖顺序正确；`M=2 → N=10` 符合协议；未把不可分验收合并进单一过大里程碑。

### 6. 必须提前验证的重大风险 — 未命中

设计期已完成灰路径存在性、SE/soft 差异、边界 code 枚举、文档软表述清单。剩余风险（误伤 BT、soft 吞错误、隐藏调用方、PG 环境）均可在 M-01/M-02 实现环境用既有套件与负向 `rejects` 及时验证，推迟不会使后续整体失效。

---

## 需要复审的问题

（无）

---

## 实现注意事项

以下**不得**单独触发设计复审；供实现轮与审计轮使用。

1. **`TRANSACTIONS_UNSUPPORTED` 无 throw 站点**  
   文档与边界清单写「驱动无事务」时，以实际的 `TransactionCapabilityError` 为准；不要新增依赖该未使用 code 的测试，除非产品代码同步改为抛它（非本任务范围）。

2. **§3.2.4 以 try 外为唯一规范**  
   不要只做 catch 内 `isBusinessTransactionBoundaryError` 再抛作为主路径；负向测试必须用 `expect(promise).rejects`（或等价）断言 throw，而不是读 `result.error`。

3. **文档扫尾范围宜略宽于 §1.4 字面列表**  
   除已列路径外，实现 M-02 时建议一并检索：
   - `agent/agentspace/knowledge/generator/permission-test-implementation.md`（大量以 `ConditionError.type === 'condition check failed'` 为唯一/主断言的官方测试写法；与要求 6/7 正式面张力最大）
   - `usage/05-interactions.md`、`generator/permission-implementation.md` 中仅“推荐 BT”而未写硬错误 code 的段落  
   全仓库「考古式」替换旧测试鸭式断言仍可按设计 §3.5 不在范围；但 **generator 官方示例**若被本任务文档降级/迁移表覆盖，应避免与 usage 互相矛盾。

4. **ABORTED 可测性**  
   设计允许「若已有等价覆盖则引用」。当前 `businessTransaction.spec.ts` **无**直接 `code === 'ABORTED'` 用例；BT 在 `onDispatchError: 'abort'` 下于回调内 catch 失败 dispatch 后再 `dispatch` 即可构造。M-01 若时间允许补一条，有利于 Task 要求 3 的可文档化验收，非阻塞。

5. **隐藏灰色调用方**  
   设计风险表已要求 `rg` 邻近 `runInTransaction`/`dispatch`。抽查：既有 runtime 相关套件**未**把 RIT+`controller.dispatch` 当作正向合同；M-01 红测应主要来自新负向用例而非大面积改旧测。注意 `MonoSystem.dispatch(events)` 是存储 mutation 回调扇出，**不是** `Controller.dispatch`；勿误拦。

6. **验收命令文件集**  
   基线与 §3.4.2 含 `transactionCapability.spec.ts`，M-01 正文验收列表未写入手；实现轮回归时建议仍带上，避免 capability 面回归盲区。

7. **真 PostgreSQL**  
   路径唯一逻辑在 PGLite 上与 `isInTransaction`/ALS 判定同构；`test:postgres` 在环境可用时必跑且不得新增失败，不可用时不得宣称 PG 已回归（设计已写）。

---

## 独立核验命令与结果摘要

```text
# 源码阅读（本轮）
src/runtime/Controller.ts          dispatch / runInBusinessTransaction
src/runtime/transaction.ts         BusinessTransactionBoundaryCode / errors
src/runtime/MonoSystem.ts          isInTransaction / nested runInTransaction
tests/runtime/businessTransaction.spec.ts  A–O / L / M

# 灰路径探针（复跑设计期脚本）
npx vite-node --config vitest.config.ts /tmp/interaqt-tx-path-uniqueness-prove.mts
→ SUMMARY: grayPathDispatchAllowed=true,
  seRanBeforeOuterCommitOnSuccess=true,
  softRejectLeavesOuterWrites=true,
  seLeakedOnOuterRollback=true

# 文档软表述抽查
rg Prefer BT|not a complete official path|bare `storage.runInTransaction`
→ 命中 usage/06、18、19、20 及 generator 等，与设计 §1.4 一致

# TRANSACTIONS_UNSUPPORTED throw 站点
rg 'code: .TRANSACTIONS_UNSUPPORTED' src/ tests/
→ 无 throw 站点（仅类型与默认文案）
```

---

## 评审元数据

| 项 | 值 |
|----|-----|
| 结论 | 通过 |
| 需要复审的问题数 | 0 |
| 实现注意事项数 | 7 |
| 是否修改设计文档 | 否 |
| 下一动作（协议） | 启动 additional task 2（设计裁决者） |
