# 设计评审 — 迁移期 StateMachine 持久化状态与状态图变更的一致性

```text
评审轮次: design-round 0（首轮独立评审）
评审对象: docs/migration-state-machine-state-remap/migration-state-machine-state-remap.md（status: 设计中, design-round: 0/15）
基线: f9f06b3（main）
```

## 评审方法

按 additional task 1 要求独立执行，不依赖设计文档或任务输入报告的结论性陈述：

- 通读 Task 1 全文（要求 1–8、设计复审条件、additional tasks）、设计文档全文、AGENTS.md 项目规则。
- 亲自复核设计依赖的全部关键代码事实：`MigrationScheduler.run` 分支守卫（`migration.ts:3659`）、`rebuildStateDefaults` 是 `migration.ts` 中唯一的 `setInternal` 调用点（3762–3776）、`stateSignature = hash({stateKeys, boundStates})` 且节点名集合不进入（783–800、942）、`canonicalizeArgsForSignature` 对 `StateNode.name` 的规范化（885–916）、`TransitionFinder.findNextState` 未知状态返回 null → `ComputationResult.skip()`（`TransitionFinder.ts`、`StateMachine.ts:167-169/265-269`）、Transform 输出行键构造与唯一索引创建范围（`migration.ts:3393-3462`、`MonoSystem.ts:2476/2517`，确认唯一索引仅对 data-based Transform 创建，event-based Transform 对应行坍缩变体）、聚合家族 `compute`/`persistFullResult` 全量重写 item state、`simulateCascadeDeletionScope` 复用同一 scheduler（3554）、`migrationGenerativeFuzz` 变异菜单无 StateMachine/Transform/Custom。
- 可执行验证：
  - `npx vitest run tests/runtime/migration.spec.ts` = 90 passed（与设计基线一致）。
  - 自建最小验证实验（PGLite，真实 `generateMigrationDiff → 决策 → migrate → setup → dispatch`，property 级 StateMachine）：property 级 event rebuild handler 收到的 `record` 包含 bound-state 列（实测 record keys 含 `<host>_<property>_bound_currentState`）。这直接支撑设计 §3.1「先施加映射再跑输出重建，handler 依据新状态名计算输出值」的可行性——设计声称的顺序下 handler 确实能看到映射后的状态列。实验 spec 已删除，未污染工作树。
  - `validateApprovedDiff` 挂点核实：`Controller.ts:924` 在重算事务（1037）与 `dryRun` 早退（994）**之前**执行——设计 §3.1「fail-fast 在重算事务开始前发生、dryRun 也会触发」结构性成立。

## 六类复审条件逐项检查

### 1. 关键事实错误 — 未发现

设计的机制 A–G 结论（§1.1）逐项与源码和实测对勘一致；方案依赖的三个此前未被设计期实验覆盖的事实（handler 可见 bound-state 列、fail-fast 挂点先于事务与 dryRun、`setInternal` 唯一点）均由本轮补充验证成立。`modelHash` 相关表述（§3.1「不进入任何现有签名」）是设计决策而非事实断言，其可实现性见「实现注意事项」第 1 条。

### 2. 内部逻辑矛盾 — 未发现

对 §3.2 分支伪代码做了穷举检查（rebuildState × rebuildOutput × 是否有映射 × 所有权四值）：

- StateMachine 进入该分支时必然带映射：`rebuildState` 为真要求 `stateSignature` 变化，而 StateMachine 的 bound-state 默认值即初始态名，签名变化蕴含状态图变化，映射缺失已在 `validateApprovedDiff` 阶段 fail-fast；非初始改名（rebuildState=false）由 `hasApprovedStateGraphMapping` 兜住（机制 B 的修复点）。
- Transform state-only 计划（rebuildState=true、rebuildOutput=false，框架升级形态）在新分支下从「重置导致行坍缩」变为 no-op——保守且不劣于现状，机制 D 由所有权声明与「今日不可达」双重拦截。
- 聚合 state-only 变 no-op：现有 `migration.spec.ts` 的 state-only 用例只用 Custom GlobalBoundState（已核实，文件内无 StateMachine/聚合 state-only 用例），设计「不破坏任何现有测试」的判断成立。
- §3.3 顺序（先映射后输出重建）与 §3.4 不变量位置（映射后、输出重建前）自洽，且 kill-resume 语义与既有 bound-state 写入同轨（事务内回滚重放）。

### 3. 违反项目原则 — 未发现

方案符合 AGENTS.md 的显式控制（缺映射即拒、不做映射启发式）、「修一类而非实例」（状态所有权声明为 handle 静态属性而非家族名字符串匹配；§1.2 完成读者枚举，含 `simulateCascadeDeletionScope` 自动一致、`addMissingRebuildHandlerRequirements`/`getCascadeAwareDeletionScope` 只读 `rebuildOutput` 不受影响）、把已知规则升格为受检不变量（要求 3）。最小表面：拒绝候选 3（运行期声明携带迁移历史）的理由与项目原则一致。

### 4. 违反任务目标 — 未发现

目标/非目标与 Task 要求 1–8 逐条对齐（含要求 8 的六条非目标）。Custom 的界定（type=StateMachine 为辖区、Custom 不触发映射决策）是设计对「及等价的带 bound state 的 event-based computation」的显式裁定，理由（Custom 状态值域是应用语义、框架无法生成映射表）成立，且设计在 §3.1 与风险 5 中公开了该裁定供裁决轮复核——这属于任务授予设计的裁量，不是偏离。要求 6 测试清单中「Custom bound state」的执行层覆盖在里程碑中较薄，属测试补充事项（见实现注意事项第 3 条），不构成目标违反。

### 5. 里程碑不可执行 — 未发现

M-01–M-06 均有可独立观察结果、明确验收命令与正确的前置顺序。每个验收所需的技术手段已被设计期探针证明可行（探针 A/B/D/F/G 即 M-02/M-03/M-04 用例的雏形；本轮补充的 handler-可见性实验补齐了 M-02「输出值由已映射状态决定」断言的可行性）。M-05 的真实 PostgreSQL 环境不可用时「记录阻塞与已跑的 PGLite 证据」符合 AGENTS.md 的 env-gated 约定。预算 M=6、N=30 与工作量匹配。

### 6. 必须提前验证的重大风险 — 未发现

设计期已验证清单覆盖了会使方案整体失效的风险：机制 A–G 全部定谳、fuzz 生成域不受影响。剩余实现期风险（`stateGraph` 提取稳定性、modelHash 排除、takeover 交互、真实 PG 可用性）均满足「可在实现环境中及时验证 + 已绑定里程碑验收」的条件，不属于「推迟会使后续实现整体失效」的类别。

## 需要复审的问题

无。

## 实现注意事项（不构成复审问题，不影响结论）

1. **`stateGraph` 必须显式排除出 `modelHash` 输入。** 已核实默认数据流会把 `ComputationManifest` 的新字段带进 `hashComputations` → `modelHash`（`migration.ts` `createComputationManifest`/`createMigrationManifest`：`modelHash: hash(model)`，model 内含 computations 数组）。设计 §3.1/风险 2 已声明「不含新字段」，但 M-01 的「同模型两版 diff、changes 为空」验收是间接的——建议加一条直接断言（同一 declarations 下，带/不带 `stateGraph` 填充的 `modelHash` 相等），防止实现者以「字段自动进哈希」收工后所有存量部署被判一次全量变更。同时需显式决定 `MIGRATION_MANIFEST_GENERATOR_VERSION` 是否升版：不升版则旧 manifest 读回时 `stateGraph` 为 undefined，检测按「旧名集合为空 → 无需映射」自然降级（安全，建议补一条旧格式 manifest 读回测试）；升版则触发全量 re-baseline（恢复路径 `createMigrationBaseline` 已存在，但部署成本设计未提及）。
2. **`tests/runtime/helpers/migrationApproval.ts` 需认识新决策种类。** `approveGeneratedMigrationDiff` 对未知 kind 走 destructive-scope 兜底转换，会把 `state-graph-mapping` 要求误批成破坏性决策。今日 fuzz 生成域无 StateMachine 所以不可达，但任何经该 helper 驱动的 StateMachine 迁移测试（含未来给 fuzzer 扩状态图变异时）都会命中；实现 M-01/M-02 时一并扩展。
3. **要求 6 的「Custom bound state」执行层用例。** 设计在 M-01 覆盖了「Custom 不触发要求」的 diff 层负向对照，机制 E 的行为（changed 决策下 bound state 重置为新默认值）只有设计期探针证据；建议在 M-02/M-03 矩阵中加一个执行层 Custom 用例（迁移 + dispatch + 读 bound state），把要求 6 的枚举清单收满。
4. **不变量扫描触发面的实现口径。** §3.4 措辞是「rebuild 计划被触发且是 StateMachine」即扫单列——比 `rebuildStateDefaults` 的触发面（rebuildState 为真）宽，输出单独变化的 StateMachine 也会被扫。成本仍是每迁移一次单列 `find`、与既有扫描同量级，可接受；但实现与文档应统一口径（要么收窄到「状态图相关项或映射施加项」，要么明确接受更宽的保守扫描），避免验收断言与实现脱节。
5. **`stateGraph` 检测读取旧 manifest 缺失字段的语义**应作为 M-01 的显式测试（旧格式 manifest × 新图含改名 → 不产生映射要求是**错误**方向时如何暴露）：本设计下 undefined 旧集合意味着「无从映射」，只对框架升级后的首次迁移出现，此时新图相对旧 manifest 的 detected 需要定义为「不比较」而非「全量 added」，防止把升级后首次迁移变成全体 StateMachine 的映射要求噪声。

## 结论

通过
