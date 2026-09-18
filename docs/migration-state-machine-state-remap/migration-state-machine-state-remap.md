# 迁移期 StateMachine 持久化状态与状态图变更的一致性 — 设计文档

```text
status: 已完成
design-round: 1/15
implementation-round: 8/30
current-milestone: M-06
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无
```

## 1. 背景和现状（含求证结论，Task 要求 1）

基线：Git revision `f9f06b3`（main），工作树除本任务目录与评审报告外干净；
`npx vitest run tests/runtime/migration.spec.ts` = 90 passed（任务开始时实测；d1 裁决轮复跑
再次 90 passed）。

> d1 裁决记录（2026-09-17）：对评审报告的全部关键事实独立复核成立——分支守卫
> `migration.ts:3659`、`setInternal` 全文件仅 `rebuildStateDefaults`（3769/3773）、
> `stateSignature = hash({stateKeys, boundStates})`（942）且节点名不进入、
> `validateApprovedDiff` 在 `Controller.ts:924` 先于 dryRun 早退（994）与重算事务
> （1037）、`approveGeneratedMigrationDiff` 未知 kind 落 destructive-scope 兜底、
> state-only 现有测试仅用 Custom GlobalBoundState（`migration.spec.ts:4253-4295`）。
> 评审结论「通过」、无需要复审的问题；5 条实现注意事项全部采纳并已并入本文（见
> §3.1 modelHash 排除与版本决策、§3.4 宽口径、M-01/M-02 验收扩展）。裁决轮补充核实
> 两个新事实并并入：(1) `ComputationManifest` 不保存原始 args（仅哈希签名，
> `migration.ts:355-394`），检测的数据源按此修正（§3.1）；(2) property 级
> StateMachine takeover 今日即被整体拒绝（`migration.ts:2018-2020`），设计风险 3 关闭。

### 1.1 机制求证（设计期最小验证实验，全部在当前 HEAD 上执行）

探针方法：真实 `generateMigrationDiff → 人工决策 → migrate → setup → dispatch` 流程跑在
PGLite 上；两份临时 spec（`tmp-probe-mechanisms.spec.ts`、`tmp-probe-2/3.spec.ts`）已在本轮
结束时删除，关键输出记录如下。场景骨架：property 级 StateMachine
`pending → approved → archived`（`Request.status`），宿主记录先被转移到目标状态再迁移。

| 机制 | 结论 | 证据（当前 HEAD 实测） |
|------|------|----------------------|
| **A** `rebuildState && rebuildOutput` 同时为真时状态重建被跳过 | **存在** | 初始状态改名 `pending→queued` + `changed` 决策：diff `stateSignatureChanged: true`；rebuildPlan `{rebuildState: true, rebuildOutput: true}`；迁移后存量记录 `currentState='approved'` 未动；A2 探针（记录停在改名前的初始态 `pending`）：迁移后 `Approve` dispatch `error: undefined` 且 `status`/`currentState` 均不变——静默无效确认。 |
| **B** 非初始状态改名对 `stateSignature` 不可见 | **存在** | `approved→accepted` 改名：diff `stateSignatureChanged: false`（初始态默认值不变）；plan `{rebuildState: false, rebuildOutput: true}`；迁移后 `status='accepted'`、`currentState='approved'`；`Archive` dispatch `error: undefined` 且无效。**套用 PR #51 两行修复后重跑，结果不变**（修复只影响 `rebuildState` 为真的分支）。 |
| **C** `rebuildStateDefaults` 的「重置为默认值」只对一类情形正确 | **存在** | 在 PR #51 修复形态下（`rebuildState` 先执行 `rebuildStateDefaults` 再 `runFullRecompute`）实测：初始改名场景迁移后存量 `approved` 记录 `currentState='queued'`——被无差别重置回新初始态；非初始改名场景（B）`rebuildState=false` 修复根本不触及。正确动作应是逐记录旧名→新名映射。 |
| **D** 状态重建与输出重建的先后关系对 Transform 有害 | **存在（PR #51 修复引入的执行期故障，今日应用层不可达）** | 测试专用制造 `rebuildState && rebuildOutput` 计划（scheduler 级直接调 `recomputeChangedComputations`，模拟框架升级改变 Transform bound-state 形状）：未修复 HEAD 上两行输出完好（机制 A 跳过了重置）；套用 PR #51 修复后同一计划在 `rebuildStateDefaults` 的 `setInternal('')` 处即抛 `duplicate key value violates unique constraint "idx_transform_..."`（Transform 的 `(sourceRecordId, transformIndex)` 唯一索引）——迁移整体失败。评审报告预测的「行坍缩→重复行」在唯一索引存在时的实际表现是 fail-fast 崩溃（更早、但同样不可接受）；无索引方言/路径下仍是数据损坏形态。 |
| **E** 带 `createState` 的 `Custom` computation 同一暴露 | **存在** | Custom（global dict，`RecordBoundState('ProbeTicket')` 手动指定 host）默认值 0→10 的 `changed` 决策迁移：plan `{rebuildState: true, rebuildOutput: true}`；未修复 HEAD 上 bound state 留在旧值 42（陈旧）；PR #51 修复下被重置为 10（新默认值）——对 StateMachine 是「碰巧映射」，对 Custom 是语义丢失（42 是运行期事实，不是默认值）。 |
| **F** 持久化状态名合法性无检查 | **存在（今日无任何检查）** | 直接写入 `currentState='ghost'` 后重新 `setup()` + `dispatch(Archive)`：无错误、无效果——`TransitionFinder.findNextState` 返回 null → `ComputationResult.skip()`（`TransitionFinder.ts:213-217`、`StateMachine.ts:169/269`）。 |
| **G** 状态节点删除 | **存在（机制 B 的变体）** | 删除 `archived` 节点及其 transfers：diff 判 `functionTextChanged`（computeTarget 文本变化），plan `{rebuildState: false, rebuildOutput: true}`；迁移成功；停在已删除状态名上的记录无人过问。 |

补充核实（源码）：`stateSignature = hash({ stateKeys, boundStates })`，`boundStates[i] =
{ key, scope, hostRecord, defaultSignature, valueType }`（`migration.ts:942`、`serializeState`
`migration.ts:783-800`）——状态图节点名集合**不进入** stateSignature；它只经
`argsSignature`（`canonicalizeArgsForSignature` 规范化 `StateNode.name` 与 transfers 拓扑）
进入 `structuralSignature`（`migration.ts:943-959`）。`setInternal` 在整个 `migration.ts`
中只出现于 `rebuildStateDefaults`（3769/3773）。

### 1.2 读者枚举（AGENTS.md § 修 bug 清单第 1 条）

`rebuildState` / `rebuildOutput` / `rebuildStateDefaults` / `stateSignature` 的全部读者与受
方案影响方式：

| 读者 | 位置 | 消费面 | 受本方案影响 |
|------|------|--------|--------------|
| `MigrationScheduler.run` | `migration.ts:3659` | `rebuildState && !rebuildOutput` 分支守卫 | **改**：分支重写为按状态所有权分流（见方案）。`simulateCascadeDeletionScope` 复用同一 scheduler（3554），模拟与真实执行自动一致。 |
| `buildAffectedRebuildPlan` | `migration.ts:2411-2423` | `stateChanged = !old \|\| stateSignature 不等` → `rebuildState` | **改**：StateMachine 家族改由新的 state-graph 变更检测驱动 `rebuildState`（机制 B/G 修复点）。 |
| diff 分类循环 | `migration.ts:1782-1791` | `structuralSignature` 变化 → `changed`；`stateSignature` 变化且 output 不变 → `state-only` | **扩展**：新增 state-graph 节点集合变化检测，进入 `detected` 与新的决策要求（见方案）。 |
| `addMissingRebuildHandlerRequirements` | `migration.ts:1898-1933` | 只读 `rebuildOutput`；为 event-based 计算要求 event-rebuild-handler | **兼容**：本方案的状态映射决策独立追加，不改变该函数语义；state-mapping 要求与 event-rebuild-handler 要求可并存。 |
| `getCascadeAwareDeletionScope` | `migration.ts:3597/3611` | 只读 `rebuildOutput` | 不受影响（状态映射不产生删除）。 |
| `rebuildStateDefaults` | `migration.ts:3762-3776` | 全部 bound state 重置为 defaultValue | **改**：限定到「输出路径不拥有的状态」，并对 StateMachine 的 `currentState` 走映射而非重置。 |
| `serializeState` / `stateSignature` | `migration.ts:783-800/942` | bound state 形状签名 | **不改签名输入**（见要求 5 决策：用 diff 专门检测 + 不变量兜底，不动 modelHash 基础）。 |
| `validateApprovedDiff` | `migration.ts:1935-2107` | 决策与 requiredDecisions 对账 | **扩展**：新增 state-mapping 决策种类的存在性/一致性校验。 |
| `getChangedComputationsFromApprovedDiff` | `migration.ts:2109-2162` | `changed`/`state-only` 决策 → rebuild 计划种子 | **扩展**：state-mapping 批准也意味着该计算的持久化状态需要迁移处理。 |
| `recomputeTransformOutput` | `migration.ts:3393-3462` | 读 `state.sourceRecordId/transformIndex` 的**列值**（不读 state 对象） | 不直接改；由状态所有权分流保证其 bound state 不被重置。 |
| 聚合家族 `compute`/`persistFullResult` | `aggregationTemplate.ts:209-217` 等 | 全量 compute 重写全部 item state | 不受影响（重置冗余但无害；所有权分流后不再重置，同样正确）。 |
| `WritingComputationTests.md` 维度注册表 | 文档 | 迁移测试维度 | **回填**新维度（Task 要求 6）。 |
| `migrationGenerativeFuzz` / `migrationDestructiveFuzz` | tests | rng 决策流契约：`migrationGenerativeFuzz` 的变异菜单是纯加法（addProperty/addEntity/addRelation/addGlobalCount/addPropertyCount），**生成域里没有 StateMachine / Transform / Custom**；`approveGeneratedMigrationDiff` 按推荐决策批准全部 requiredDecisions | 新决策种类只在「状态图变化」时出现；fuzz 生成域不会产生状态图变化，故 rng 流与现有 seed 池不受影响。若实现期给 fuzzer 扩状态图变异，需按契约重验 seed 池（记为实现注意事项）。 |

### 1.3 根因抽象（求证后的修正表述）

迁移子系统把 bound state 当作「有默认值、可整体重置的附属数据」；StateMachine 的
`currentState` 实际是**受状态图约束的持久化事实**。三个缺口：它是否需要迁移处理不
由「图是否变化」决定（机制 B/G：签名盲区）；需要时的正确动作不是重置而是映射（机制 C）；
没有任何受检不变量保证迁移后名字合法（机制 F）。机制 D 是同一盲区的另一个消费者
（Transform），说明修复必须按「状态所有权」分流而不是修补单个分支。

## 2. 目标与非目标

### 目标（对应 Task 要求编号）

1. **要求 2（P0）**：状态图变更时持久化状态的映射合同——迁移后每条宿主记录/全局字典的
   `currentState` 都是新图合法名字，且是有意映射。
2. **要求 3（P0）**：「持久化状态名合法」提升为迁移执行路径上的受检不变量（fail-fast）。
3. **要求 4（P0）**：`rebuildStateDefaults` 的适用边界与执行顺序——Transform 的输出路径
   拥有的状态不可被重置。
4. **要求 5**：diff 分类与签名的一致性——签名不覆盖节点集合时用专门检测 + 决策 + 不变量
   兜底，并说明选择理由。
5. **要求 6**：测试矩阵 + 维度注册表回填 + 真实 PostgreSQL 最小对照。
6. **要求 7**：文档（迁移 handler 合约的正式文档落点）+ 逃逸复盘（机制化结论）。

### 非目标（Task 要求 8 逐条对齐）

- 不合并/修补 PR #51；其测试文件仅作为复现输入（机制 A 场景将用自建测试覆盖）。
- 不引入应用状态名、兼容状态节点或映射启发式。
- 不重做审批 / 破坏性 scope / kill-resume 机制；只在必要处扩展（新增一种决策要求）。
- 不为存量错误数据库提供自动修复；文档说明修复性迁移的路径。
- 不改运行期 `TransitionFinder` / `incrementalCompute` 语义。
- 不做通用 bound state 迁移框架；StateMachine 家族（StateMachine、Custom 的
  `currentState` 类状态）+ Transform 防误伤是全部范围。

## 3. 方案

单一方案，四个部分。核心决策：**映射由审批 diff 中的专门决策表达（Task 候选 2 的形态），
而非扩展 event rebuild handler 返回形态（候选 1）或声明携带迁移元数据（候选 3）**。

### 3.1 决策 A：新增 `state-graph-mapping` 决策（要求 2、5）

**触发**：diff 生成时（`generateMigrationDiff`），对每个 computation 检测「StateMachine
状态图节点集合变化」。数据来源（d1 裁决轮核实修正：`ComputationManifest` **不保存原始
args**，只有 `argsSignature` 等哈希签名，`migration.ts:355-394`）：
- **新侧**：manifest 序列化层从活着的 computation handle 读取
  `args.states[].name` 与 `args.initialState.name`（`createComputationManifest` 的入参
  即 `computation`，可直接取 `args`；`StateMachine.ts` 声明面已核实两字段存在且
  `initialState` 必须属于 `states`，`src/core/StateMachine.ts:66-84`）。
- **旧侧**：从**存储的旧 manifest** 的 `stateGraph` 字段读取；字段缺失（框架升级后的
  首次迁移）定义为「**不比较**」——不产生 `renamed`/`removed`/`added` 判定，也不产生
  映射要求（防止把升级后首次迁移变成全体 StateMachine 的映射要求噪声）。残余暴露由
  3.4 的宽口径不变量扫描兜住（见 3.4「升级窗口」）。

比较得三类变化：
- `renamed`（旧集合有、新集合没有的名字 + 新集合有、旧集合没有的名字；初始态名变化也在此列）；
- `removed`（旧有新无，且无对应新增名可配对）；
- `added`（新有旧无）。

检测落在 manifest 序列化层：给 `ComputationManifest` 增加可选字段
`stateGraph?: { nodeNames: string[], initialStateName: string }`（仅 event-based、type 为
StateMachine 的 computation 填充；由 `args` 中的 `states`/`initialState` 直接读取）。
**`stateGraph` 必须显式排除出 `modelHash` 输入**（d1 采纳评审实现注意事项 1，事实核实：
默认数据流会把 `ComputationManifest` 的新字段带进 `hashComputations` → `model` →
`modelHash`，`migration.ts:1099-1111`——`hashComputations` 直接展开 computation manifest
对象）。排除方式：在 `hashComputations` 的映射中把 `stateGraph` 置 undefined（与
`functionSignature.text` 被置 undefined 同一模式，`migration.ts:1101-1104`）。M-01 加
直接断言：同一 declarations 下带/不带 `stateGraph` 填充的 `modelHash` 相等。
**不进入任何现有签名**（`stateSignature`/`structuralSignature`/`modelHash` 输入不变），
已部署 `modelHash` 不受影响——`stateGraph` 是 diff 检测的输入，不是签名的输入。
**manifest 生成器版本不升版**（d1 裁决：`MIGRATION_MANIFEST_GENERATOR_VERSION` 当前为
"5"，`migration.ts:27`；版本不匹配会被**彻底拒绝**并要求 `createMigrationBaseline()`
重置基线，`assertManifestGeneratorCurrent`，`migration.ts:1129-1142`——升版的代价是所有
存量部署强制 re-baseline，而本检测对旧 manifest 缺失 `stateGraph` 已有「不比较」降级，
无需付出该代价）。旧格式 manifest 读回的降级语义作为 M-01 显式测试。选择
理由（对候选 1 / 3）：

- 候选 1（扩展 handler 返回 `{ value, state }`）：把「持久化事实的迁移」藏进输出重建的
  handler，审阅面看不到状态映射决策本身；且 StateMachine 的输出值 `computeValue` 派生自
  状态，让 handler 同时回答两者会造成两个真相源。驳回。
- 候选 3（`StateNode.previousNames`）：把迁移历史写进运行期声明，运行期语义与迁移期历史
  耦合，违反最小表面与显式控制。驳回。
- 候选 2（专门决策）：审阅面显式（diff 文件里看得见每个旧名的去向）、与既有决策种类
  （computation / event-rebuild-handler / destructive-scope）同一模式、映射表可与不变量
  共用同一合法集合。采纳。

**决策形态**：

```ts
{ kind: "state-graph-mapping", id, dataContext,
  mapping: Record<string /* oldName */, string /* newName */ | null /* to initial */>,
  reason: string }
```

- `mapping` 的 key 必须恰好覆盖「旧图节点名 ∩（新图节点名的补集）」∪「旧初始态名（若
  改名）」——即所有不再合法的旧名；value 是新图中的合法名（`null` 表示映射到新初始态，
  用于「状态被删除」时的显式降级决策）。
- **未提供映射时的行为**：`migrate()` 在 `validateApprovedDiff` 阶段 fail-fast（`MigrationError`，
  错误信息列出 dataContext、非法旧名集合与新图合法名集合）。理由：静默放行=机制 B 复现；
  自动重置=违反「不自动猜测映射」；显式拒绝符合框架「显式控制」原则，与
  `Migration requires an approved diff` 的既有姿态一致。**注意顺序**：该 fail-fast 在重算
  事务开始前发生（挂进 `validateApprovedDiff`，dryRun 也会触发）。
- **作用域**：property 级与 global 级同形；映射由调度器直接施加到 bound state（见 3.2），
  global 字典走 `GlobalBoundState.setInternal`。输出值一致性（要求 2 第三点）：映射施加后、
  同一 handler 调用内的输出值由**已映射的 currentState** 决定——具体地，event rebuild
  handler 收到的 `record` 里 bound-state 列已是新名（先施加映射再跑输出重建，顺序见 3.3），
  handler 依据新状态名计算输出值，两者不能各自为政。
- Custom computation：`createState` 返回的状态是应用自定义形状，框架不解释其值域，
  **不生成 state-graph-mapping 要求**（也不做合法性检查）；其暴露（机制 E）由 3.4 的
  不变量仅覆盖 `currentState` 语义（Custom 通常不用这个名字），文档写明 Custom 带状态
  迁移仍走 `state-only`/`changed` + 应用自决。这是「StateMachine 及等价的带 currentState
  语义的 event-based computation」的界定：以 computation type 为准（StateMachine），
  不猜测 Custom 的状态语义。

### 3.2 决策 B：调度器施加映射（要求 2）

`MigrationScheduler.run` 的分支重写：

```ts
// 伪代码
if (item.rebuildState || hasApprovedStateGraphMapping(computation)) {
    if (isStateMachineWithMapping(computation)) {
        await this.applyStateGraphMapping(computation)   // 逐记录/全局 setInternal(mapping[old] ?? old)
    } else if (stateOwnedByOutputPath(computation)) {
        // Transform 家族：跳过重置（输出重算会重建这些列）
    } else {
        await this.rebuildStateDefaults(computation)     // 保留给真正「可整体重置」的状态
    }
    if (!item.rebuildOutput) continue
}
```

- `applyStateGraphMapping`：对 record 作用域，遍历宿主记录，`currentState` 值为旧名集合中
  的键时 `setInternal(mapping[old])`（`null` → 新初始态名）；值已是新图合法名则不动。
  global 作用域同构。逐记录映射即机制 C 的正确动作。
- `stateOwnedByOutputPath(computation)`：在 computation handle 上声明（Transform 的
  `sourceRecordId`/`transformIndex` 为 true；聚合家族 item state 为 true——其 compute 重写
  它们；StateMachine 的 `currentState` 为 false）。实现为 handle 上的静态声明
  （如 `static ownsStateOnRebuild = true` 或 state 对象上的标记），调度器读取；不做
  家族名字字符串匹配。这满足要求 4 的「让实现无法把它施加在输出路径自行拥有的状态上」。
- 聚合家族：所有权声明为「输出拥有」后 `rebuildStateDefaults` 不再触及它们（原本就是
  无害冗余）；`state-only` 计划对聚合不再重置 item state——语义讨论：state-only 对聚合
  的旧语义（重置 item state、输出不动）本就依赖「下次全量重算纠正」的巧合，声明所有权
  后 state-only 对聚合变为 no-op，行为更保守且不破坏任何现有测试（迁移 state-only 测试
  只用 Custom GlobalBoundState，不涉及聚合）。

### 3.3 执行顺序（要求 4）

对同一 computation：**先施加状态映射（或 no-op），再跑输出重建**。理由：
- StateMachine：输出值派生自状态（`computeValue(state)`），先映射后重建输出，handler
  看到的 `record` 已含新状态名，天然一致。
- Transform：映射分支不触及（所有权声明拦截），输出重建照旧——机制 D 的崩溃/行坍缩
  从「无法到达」与「所有权拦截」双重保证。
- 聚合：先 no-op 后重算，与现状等价。

kill-resume：映射施加发生在重算事务内（`recomputeChangedComputations`），崩溃随
SERIALIZABLE 事务回滚，resume 重放——与现有 bound-state 写入同一恢复语义，无新机制。

### 3.4 决策 C：持久化状态名合法性不变量（要求 3）

**位置**：迁移执行路径，`MigrationScheduler.run` 处理完某 StateMachine 的全部计划项后
（映射施加完、输出重建前）执行一次检查；`setup({ install: false })`（含迁移后的
`scheduler.setup`）不检查（成本边界见下）。检查内容：该 computation 的每条宿主记录 /
global 字典的 `currentState` 值 ∈ 新图节点名集合，否则抛
`MigrationError`（信息含 dataContext、非法值集合、合法集合）。

- **成本边界与扫描口径（d1 裁决，采纳评审实现注意事项 4 并定夺口径）**：扫描触发面
  采用**宽口径**——「该 StateMachine 的 rebuild 计划项被触发（`rebuildState` 或
  `rebuildOutput` 任一为真）」即扫单列 `find(host, undefined, undefined, [stateKey])`；
  不收窄到「状态图变化项」。理由（评审注意事项 4 与 5 的交互推演）：收窄口径在
  「框架升级窗口 + 同版迁移内改名」的交叠下会漏检——旧 manifest 缺 `stateGraph` 使
  检测降级为「不比较」、不产生映射要求、也不触发窄口径扫描，非法名静默存活到下一次
  交互；宽口径以「每迁移一次、每个受影响 StateMachine 一次单列 find」的代价堵住该
  残余，与 `rebuildStateDefaults` 的既有扫描同量级。未受影响（无 rebuild 计划项）的
  StateMachine 不扫。**不在 setup 做全量检查**（每次启动全模型扫描的成本不可接受）；
  作为补偿，`dispatch` 期的静默 skip 依旧存在（运行期语义不改，Task 要求 8）。
  宽口径的已知误报面与出路在文档中写明：升级窗口内若应用同时改了状态图，首次迁移
  可能因非法名 fail-fast——正确出路是用两步迁移（第一步先按当前图迁移输出、第二步
  提供映射），或 `createMigrationBaseline()` 重置基线后走一次带映射的正式迁移。
- **kill-resume**：检查在事务内，失败即回滚，与映射施加同一恢复语义。
- 负向对照：直接写入非法 `currentState`（探针 F 场景）不属于迁移路径，setup/dispatch
  依旧不报错——该不变量的辖区是「迁移不得制造非法状态」，不是「运行期防御所有非法
  写入」；边界在文档中写明。

### 3.5 检测与分类的一致性（要求 5 的选择）

选择：**diff 专门检测（`stateGraph` 字段）+ 专门决策要求 + 不变量兜底**，不改
`stateSignature` 输入。理由：
- 让 `stateSignature` 覆盖合法值集合需要把「值域」概念塞进通用 bound-state 签名
  （RecordBoundState 没有 valueDomain 概念），并使所有已部署模型在该签名维度上重算
  ——虽然 hash 输入新增维度只会改变全部 modelHash 一次（不产生假阳性「变更」判定，
  因为新旧 manifest 同用新算法），但会令所有存量部署在升级后产生一次「全 computation
  stateSignature 变化」的 diff 噪声，审阅面成本高。
- 专门检测只在 StateMachine 上发生、只在 diff 文件可见，无存量噪声。
- `migrationGenerativeFuzz` 的 rng 决策流不受影响（其生成域无 StateMachine；映射决策
  种类不进入其变异菜单，本任务不给 fuzzer 扩状态图变异——记为逃逸复盘中的机制补强
  建议而非本任务范围，见 M-06 的说明）。

## 4. 里程碑

预算：初始里程碑数 M = 6，N = 5 × 6 = 30。

### M-01 检测层：`stateGraph` manifest 字段 + diff 检测 + `state-graph-mapping` 决策要求
- 状态：已完成（实现轮 1 待审 → 审计轮 1 通过，无实现缺陷；1 个验证缺口由审计轮
  直接闭合——modelHash 排除断言补金值锚点后具备判别力，见审计文件 §3）。
- 可独立观察结果：`generateMigrationDiff` 对「初始改名 / 非初始改名 / 增删节点」三种
  StateMachine 变更在 `changes[].detected` 中给出 `stateGraphChanged` 信号，并在
  `requiredDecisions` 中出现 `state-graph-mapping` 要求（含旧名集合）；无状态图变化的
  迁移 diff 与今天逐字节同构（决策种类不出现）。
- 覆盖 Task 要求：2（触发面）、5。
- 前置：无。
- `reopen-count: 0`；`reopen-domains: ∅`。
- 验收命令：新增 `tests/runtime/migrationStateMachineStateGraph.spec.ts`（diff 层单测：
  三类变化 × property/global 作用域的 detected/requiredDecisions 断言 + 无变化对照 +
  Custom `createState` 不触发要求的负向对照 + **`modelHash` 排除断言**（同一
  declarations 下带/不带 `stateGraph` 填充的 `modelHash` 相等，d1 采纳评审注意事项 1）+
  **旧格式 manifest（无 `stateGraph` 字段）读回降级测试**：字段缺失 → 检测为「不比较」、
  不产生映射要求（d1 采纳评审注意事项 5））；`tests/runtime/helpers/migrationApproval.ts`
  的 `approveGeneratedMigrationDiff` 认识 `state-graph-mapping` 要求（提供默认映射
  `oldName → requirement 推荐`或显式 `stateMappings` 选项；否则未知 kind 落入
  destructive-scope 兜底误批，d1 采纳评审注意事项 2）；
  `npx vitest run tests/runtime/migration.spec.ts` 保持 90 通过。
- 最新证据（实现轮 1，2026-09-17）：
  - `src/runtime/migration.ts`：`ComputationManifest.stateGraph?` 字段 +
    `createStateGraphManifest` 提取（仅 StateMachine 语义类型；Custom 不产生）；
    `hashComputations` 将其与 `functionSignature.text` 同模式置 undefined（modelHash
    排除）；`detected.stateGraphChanged`；`state-graph-mapping` requirement/decision
    union 成员；`getStateGraphChange`/`requiresStateGraphMapping` 导出；
    `validateApprovedDiff` 校验（映射键必须恰覆盖 removedStateNames、目标必须在
    nextNodeNames 或为 null）；requirement 生成独立于 computation recommendation，
    与 event-rebuild-handler 要求并存。
  - `tests/runtime/migrationStateMachineStateGraph.spec.ts` 新增 10 用例全绿
    （`npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts` →
    10 passed），含非循环 modelHash 断言（抹掉已存 manifest 的 `stateGraph`、保留其
    `modelHash` 写回后用当前声明重算，二者相等）与旧格式降级用例。
  - `tests/runtime/helpers/migrationApproval.ts` 增 `stateMappings` 选项与默认映射
    `removedStateNames[i] → addedStateNames[i]`（无新增则 `null`）；
    `tests/runtime/postgresqlMigration.spec.ts` 本地审批 helper 同步认识新 kind
    （该矩阵只增不删，行为不变）。
  - 回归：`npx vitest run tests/runtime/migration.spec.ts` → 90 passed；
    `migrationGenerativeFuzz` + `migrationDestructiveFuzz` + `declarationTabooFuzz`
    → 132 passed；`npm run check`、`npm run build` 无错误。
  - 审计轮 1（2026-09-17）复验：上述命令全部独立重跑通过；另加跑同类本地审批
    helper 消费者（r2/r3/r15/r16、scopedSequence，67/67）与真实 PostgreSQL
    （postgresqlMigration 7/7、postgresqlIdConsistency 2/2，PG 17.6）。审计轮
    补强：modelHash 排除断言增加金值
    `c27d996588e0477cb08d44af5836546932a4ba7fb930dbccfb14647645ee0fc0`
    （取自 pre-M-01 代码对 setupV1 声明集的计算，跨进程确定；缺陷注入双向验证：
    删除排除 → 断言失败，恢复 → 10/10）。细节见实现审计文件。

### M-02 映射施加：调度器 `applyStateGraphMapping` + 分支重写 + 决策校验
- 状态：已完成（实现轮 2 主体 + 实现轮 3 D-1 修复；审计轮 3 通过——验收全部独立复验，
  矛盾组合面（`unchanged`/`unrebuildable` × mapping，含 dryRun）无静默路径，2 个验证
  缺口由审计轮直接闭合：机制 A 的 global 旧初始名子格补强、`unrebuildable` dryRun
  断言钉住，均经缺陷注入双向验证）。
- 可独立观察结果：机制 A（property/global）与机制 B、G 场景迁移后，每条记录
  `currentState` 为映射后的新名；`Archive`/`Approve` dispatch 后输出值与 `currentState`
  均按新图变化；未提供 mapping 的迁移在 `migrate()` fail-fast（dryRun 同样触发）；
  已批准 mapping 与矛盾 computation 决策（`unchanged`）的组合被 fail-fast 拒绝（D-1 闭合）。
- 覆盖 Task 要求：2（合同主体）、1（复现 A/B/G 的红灯基线——测试先红后绿）。
- 前置：M-01。
- `reopen-count: 1`；`reopen-domains: {迁移决策组合一致性}`。
- 验收命令：M-01 测试文件扩展执行层用例（每用例迁移后真实 dispatch + 读输出值与
  bound state；含「只改输出值不改状态」的错误实现必须被区分的断言——即断言
  `currentState` 列本身，而非只断言输出值）；缺失 mapping 的 fail-fast 正负向；
  **决策组合面用例（D-1）**：`unchanged` + mapping 必须 fail-fast（或按裁定施加映射且
  不重建输出），迁移后 dispatch 不得静默无效；
  **Custom 带 `createState` 的执行层用例**（迁移 + dispatch + 读 bound state，验证
  其走 `state-only`/`changed` 决策、不被 state-graph 机制接管，d1 采纳评审注意事项 3，
  收满 Task 要求 6 的「Custom bound state」执行层枚举）。
- 最新证据（实现轮 2，2026-09-18）：
  - **红灯基线**（next-action 要求的先复现后实现）：M-02 执行层 4 用例在实现前全部
    失败于「持久化 currentState 残留旧名」——机制 B `expected 'accepted', received
    'approved'`、机制 A `expected 'queued', received 'pending'`、机制 G
    `expected 'pending', received 'archived'`、「只改输出值可区分」用例
    `expected 'accepted', received 'approved'`；同时 M-01 的 10 个 diff 层用例与
    Custom 执行层对照用例保持通过（复现精确限定在映射施加缺失）。
  - `src/runtime/migration.ts`：`MigrationScheduler.run` 分支重写——触发面为
    「批准的 state-graph-mapping 决策存在 **或** `item.rebuildState`」（机制 B 的计划项
    `rebuildState=false`，只看标志会漏）；有映射决策时走 `applyStateGraphMapping`
    （逐记录/全局 `setInternal`，值已是新图合法名则不动，null 目标降级到
    `handle.initialState.name`），否则保留 `rebuildStateDefaults`（Custom createState
    等无状态图语义的计算）；映射施加先于输出重建（§3.3 顺序——event rebuild handler
    收到的 `record` 里 bound-state 列已是新名，`["*"]` 包含派生 bound 列）。模块级
    `getStateGraphMappingDecision` 以 handle 的 `computationType === StateMachine`
    判定（不猜测 Custom 状态语义）。kill-resume：施加发生在 SERIALIZABLE 重算事务内，
    与现有 bound-state 写入同一恢复语义。
  - `tests/runtime/migrationStateMachineStateGraph.spec.ts` 扩至 15 用例全绿
    （`npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts` →
    15 passed）：机制 B（非初始改名，property+global 双面断言 + 迁移后
    archive/retreat 真实 dispatch）、机制 A（初始改名：未转移记录 pending→queued、
    已转移 approved 不动——非无差别重置；迁移后 approve dispatch 生效）、机制 G
    （节点删除：`{archived: null}` 显式降级 + dispatch 生效）、「只改输出值」可区分
    用例（handler 谎报输出值，currentState 列断言仍锚定映射事实）、Custom `createState`
    执行层用例（state-only 路径按新默认值重建 bound state、不产生 state-graph-mapping
    决策）。缺失 mapping 的 fail-fast 正负向已由 M-01 用例覆盖
    （`migrate() fail-fasts on missing state-graph-mapping decision (dry-run included)`）。
  - 测试事实修正（非缺陷）：event rebuild handler 合约是
    `({ controller, dataContext, record })`，property 分支按宿主记录逐条调用——首轮
    草稿误按 `(record) =>` 签名编写，修正后转绿；交互必须 `Interaction.create`
    （静态工厂才注入 `_Interaction_` event entity，`new Interaction` 会让 StateMachine
    trigger 监听因未知名被 setup 拒绝）。
  - 回归：`npx vitest run tests/runtime/migration.spec.ts` → 90 passed；
    `migrationGenerativeFuzz` + `migrationDestructiveFuzz` + `declarationTabooFuzz`
    → 132 passed；`npm run check`、`npm run build` 无错误。
- 最新证据（实现轮 3，2026-09-18，D-1 修复）：
  - **红灯基线**：新增组合面用例在修复前实测 2 failed——`unchanged + mapping`（property
    与 global 两侧）`migrate()` 成功返回、映射被静默丢弃，与审计探针记录完全一致；
    同时 state-only 边界用例（防过度拒绝）修复前即通过。
  - `src/runtime/migration.ts` `validateApprovedDiff` 的 `state-graph-mapping` 决策校验
    块追加一致性检查（审计推荐方案 1）：同 dataContext 的 computation 决策为
    `unchanged` 或 `unrebuildable` 时抛 `MigrationError`——两者都不播种 rebuild 计划
    （`getChangedComputationsFromApprovedDiff` 只为 changed/state-only 入列），映射施加
    无执行点；`unrebuildable` 一并纳入是同类收口（审计轮实测其今日已由 blocking
    fail-fast 兜住，纳入使该不变量不依赖 blocking 顺序）。错误信息指出矛盾与合法取值
    （`Approve 'changed' or 'state-only' for this computation.`）。dryRun 同样触发
    （`validateApprovedDiff` 在 Controller.migrate 先于 dryRun 早退）。审批 helper 的
    `computationDecisions` 选项是产生该组合的合法审批面，无需改 helper。
  - `tests/runtime/migrationStateMachineStateGraph.spec.ts` 扩至 18 用例全绿
    （`npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts` →
    18 passed）：D-1 回归 property 级（migrate 与 dryRun 双断言）、global 级、
    state-only + mapping 边界用例（映射施加、输出不动、迁移后 dispatch 生效——
    钉住新校验不得扩大拒绝面）。
  - 回归：`npx vitest run tests/runtime/migration.spec.ts` → 90 passed；三 fuzz 套件
    → 132 passed；`npm run check`、`npm run build` 无错误；真实 PostgreSQL
    `postgresqlMigration.spec.ts` → 7 passed（PG 17.6，`INTERAQT_POSTGRES_DATABASE=
    interaqt_test`）。
- 最新证据（审计轮 3，2026-09-18）：验收命令全部独立复验通过（18/90/132/check/build、
  真实 PG postgresqlMigration 7/7 + postgresqlIdConsistency 2/2，PG 17.6）。D-1 修复
  对照设计核验：矛盾校验落在 `validateApprovedDiff`（migration.ts:2244-2258，审计推荐
  方案 1），`unchanged`/`unrebuildable` 同根因收口（两者都不播种 rebuild 计划；dryRun
  在 blocking 检查前早退，`unrebuildable` 若不纳入校验则 dryRun 静默返回丢弃映射的计划
  ——注入实证）。组合空间同类枚举：computation 决策完全缺失由既有 Missing-decision
  循环闭合（stateGraph 变化必使 `argsSignature` 变化 → computation requirement 必与
  mapping requirement 同时生成，源码推演）；初始态换名（removed=[]）与 `constructor`
  状态名（`value in mapping` 原型链）探针实测——前者正确，后者声明面即被
  TransitionFinder 拒绝、今日不可达（留 M-03 防御性备注）。2 个验证缺口审计轮直接
  闭合（机制 A global 旧初始名子格断言 + `unrebuildable` dryRun 断言），三轮缺陷注入
  （短路矛盾校验 / 短路 global 映射分支 / 移除 `unrebuildable`）分别 2/2/1 failed 证实
  判别力，注入完全还原后 18/18。实现缺陷 0，M-02 待审→已完成（reopen 维持 1，
  未触发收敛）。

### M-03 状态所有权与 `rebuildStateDefaults` 边界（含 Transform 反例）
- 状态：已完成（实现轮 4 主体；审计轮 4 通过——验收全部独立复验，所有权声明覆盖面
  （全部 createState handle 家族）经同类枚举核对完整，2 个验证缺口由审计轮直接闭合：
  RealTime 所有权子格与 Transform state-only 子格补强，均经缺陷注入双向验证）。
- 可独立观察结果：handle 声明状态所有权后，制造 Transform `rebuildState &&
  rebuildOutput` 计划（测试专用：scheduler 级直接调 `recomputeChangedComputations`，
  与设计期探针 D 同法）迁移后输出行数与 `sourceRecordId`/`transformIndex` 与全量重算
  一致，无重复行、无唯一索引崩溃；聚合家族 state-only 计划不再重置 item state 且现有
  测试全绿。
- 覆盖 Task 要求：4。
- 前置：M-02。
- `reopen-count: 0`；`reopen-domains: ∅`。
- 验收命令：M-01 测试文件扩展 Transform 顺序反例 + 聚合所有权用例；
  `npx vitest run tests/runtime/migration.spec.ts`、`tests/runtime/migrationDestructiveFuzz.spec.ts`。
- 最新证据（实现轮 4，2026-09-18）：
  - **红灯基线**（先复现后实现）：M-03 两个核心用例在实现前实测失败于设计 §1.1 预测的
    两种形态——Transform 双真计划 `duplicate key value violates unique constraint
    "idx_transform_..."`（`rebuildStateDefaults` 的 `setInternal('')` 把全部既有行重置为
    `''`/`0`，唯一索引崩溃）；聚合 state-only 计划把 `_…_bound_isItemMatch` 全部清零
    （`expected [] to have length of 2`）。Custom 对照用例实现前即通过（重置对其仍是
    正确动作），复现精确锚定所有权缺失。
  - 实现：handle 静态声明 `ownsStateOnRebuild = true`——`RecordsTransformHandle`
    （sourceRecordId/transformIndex）、聚合双模板基类
    `GlobalRecordsAggregationHandle` / `PropertyRelationAggregationHandle`（聚合值 +
    逐项贡献；全部子类 Count/Summation/Average/Every/Any/WeightedSummation 继承）、
    RealTime 双 handle（lastRecomputeTime/nextRecomputeTime——compute 每次以当前时间
    重写，重置为 null 会丢失下一次触发点）。`MigrationScheduler.run` 的状态重建分支
    按「映射决策 → 输出所有权 → 重置」三路分流，新增模块级 `stateOwnedByOutputPath`
    读取声明（无家族名字字符串匹配）。
  - `tests/runtime/migrationStateMachineStateGraph.spec.ts` 扩至 21 用例全绿
    （`npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts` →
    21 passed）：Transform 双真计划（行数/唯一键/来源指针回指/输出值 `{5,10}` 与全量
    重算一致）、聚合 state-only no-op（item state 保持运行期事实、输出不动）、
    Custom 重置语义对照（所有权路由不得误伤）。计划制造手段是测试直调
    `recomputeChangedComputations`（migrate 的重算入口，同一 scheduler 同一写路径），
    模拟「框架升级改变 bound-state 形状使 stateSignature 变化」——测试注释已写明。
  - 回归：`npx vitest run tests/runtime/migration.spec.ts` → 90 passed；
    `migrationGenerativeFuzz` + `migrationDestructiveFuzz` + `declarationTabooFuzz`
    → 132 passed；`npm run check`、`npm run build` 无错误；全 runtime 套件 1335
    passed / 58 skipped（postgresql* env-gated）、全 storage 套件 846 passed /
    8 skipped；真实 PostgreSQL `postgresqlMigration.spec.ts` → 7 passed（PG 17.6，
    `INTERAQT_POSTGRES_DATABASE=interaqt_test`）。
- 最新证据（审计轮 4，2026-09-18）：验收命令全部独立复验通过（23/90/132/check/build、
  真实 PG postgresqlMigration 7/7，PG 17.6）。所有权覆盖面同类枚举核对：聚合 12 个
  具体子类经两个抽象基类静态继承全覆盖；RealTime compute 重写时间戳的声明理由核实
  （RealTime.ts:103-104/178-179）；StateMachine/Custom 不声明是正确边界（映射/重置
  各归其主）。2 个验证缺口审计轮直接闭合并缺陷注入双向验证后完全还原：RealTime
  所有权子格（实现轮声明无测试覆盖；property 级 state-only 用例补上，注入双 handle
  置 false → 1 failed）与 Transform state-only 子格（「跳过重置依赖 rebuildOutput」
  的错误形态可全过原有用例；补 no-op 用例，注入条件路由 → 3 failed 捕获）。四轮注入
  （Transform 声明 / 聚合声明 / RealTime 声明 / 条件路由）全部还原后 23/23。实现缺陷 0，
  M-03 待审→已完成（reopen 维持 0，未触发收敛）。防御性备注（`Object.hasOwn` 收口
  `value in mapping`）移交 M-04。

### M-04 合法性不变量
- 状态：已完成（实现轮 5 主体 → 审计轮 5 退回 D-2 → 实现轮 6 修复 → 审计轮 6 通过：
  验收全部独立复验（31/90/132/check/build、真实 PG 7/7），D-2 修复的控制流重排对照
  设计核验正确；实现轮对审计指令字面顺序的偏离（扫描在重置之前）经缺陷注入双向验证
  为必要且被 N7 钉住——重置洗白形态 1 failed 捕获；同类格枚举闭环，无「进循环但漏扫」
  的剩余格；D-1 boundary 与 P5 保持绿，无过度拒绝）。
- 可独立观察结果：迁移路径上任何使 `currentState` 落在新图外的实现缺陷（含映射表
  value 非法、映射漏项）在迁移事务内 fail-fast，错误信息含 dataContext、非法值、合法
  集合；按 §3.4 的宽口径（rebuild 计划项触发即扫，`rebuildState` 或 `rebuildOutput`
  任一为真），`state-only`/无图变化但 rebuild 计划项存在的 StateMachine 迁移**也会**
  触发扫描（这是升级窗口兜底的一部分，验收断言按宽口径写）；无任何 rebuild 计划项的
  StateMachine 迁移不扫描。
- 覆盖 Task 要求：3。
- 前置：M-02。
- `reopen-count: 1`；`reopen-domains: {不变量触发面完整性}`。
- 验收命令：M-01 测试文件扩展不变量正负向（负向：mapping value 指向不存在的名字 →
  迁移抛错且事务回滚——探针 F 的迁移路径版本）。
- 最新证据（实现轮 5，2026-09-18）：
  - **红灯基线**（先复现后实现）：4 个负向用例（N1 升级窗口 property 级、N2 迁移前
    被腐蚀的图外名 ghost、N3 宽口径 rebuildOutput-only、N4 升级窗口 global 级）在实现前
    全部失败于 `migrationError === undefined`——migrate 成功返回、非法持久化名静默存活
    （机制 B/F 的迁移路径形态），N0（非法映射目标，M-01 已有 diff 层校验）与 P5（成本
    边界：无 rebuild 计划项不扫、迁移成功且后续 dispatch 生效）实现前即通过——复现
    精确锚定「不变量缺失」，不是迁移链路本身损坏。
  - 实现：`MigrationScheduler` 新增 `assertPersistedStatesLegal`——以 handle 静态
    `computationType === "StateMachine"` 判定（与映射施加同一 `isStateMachineComputation`
    收口，Custom 不进入）；合法集合取活 handle 的 `args.states[].name`（迁移时刻的当前
    状态图）；record 作用域单列 `find(host, undefined, undefined, ["id", stateKey])`
    扫描，global 作用域读 `GlobalBoundState.get()`；非法值抛 `MigrationError`（信息含
    dataContext、非法值集合排序去重、合法集合、修复指引）。挂在 `run()` 的
    「映射施加 → **不变量** → 输出重建」顺序上（§3.4：先映射——映射是使旧名合法的
    官方路径——再检查），触发面为 `item.rebuildState || item.rebuildOutput`（宽口径，
    不收窄到状态图变化项——升级窗口内检测降级为「不比较」时这是唯一防线）。simulate
    模式（级联删除 scope 发现）复用同一 scheduler，同一检查随模拟事务回滚。
    kill-resume：检查在 SERIALIZABLE 重算事务内，失败即整体回滚（N2 断言已施加的映射
    也被撤销）。
  - 防御性收口（审计轮 4 移交）：`applyStateGraphMapping` 的 `value in mapping` 改为
    `Object.hasOwn`——原型链上的 `constructor`/`toString` 不再可能被误当作映射键
    （今日声明面被 TransitionFinder 拒绝，属防御性）。
  - `tests/runtime/migrationStateMachineStateGraph.spec.ts` 扩至 29 用例全绿
    （`npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts` →
    29 passed）：N0 非法映射目标在 validateApprovedDiff 被拒且数据不动；N1/N4 升级窗口
    ×（property/global）改名——检测降级、无映射要求，不变量在事务内发现非法名并回滚；
    N2 探针 F 的迁移路径版本——改名 + 正确映射，但另一记录被腐蚀为 ghost，映射后扫描
    发现且已施加的映射一并回滚；N3 宽口径边界——无任何状态图变化（仅 computeTarget
    运行时文本变化：`String(...)` 包装，TS 断言会被转译擦除不改变哈希）+ ghost，
    rebuildOutput-only 计划同样触发扫描；P5 成本边界——property 侧被腐蚀但不在 rebuild
    计划内：不扫、不阻塞迁移，global 侧改名照常完成且迁移后 dispatch 生效。断言采用
    try/catch + `String(error)` 匹配（不用 `expect().rejects`：迁移意外成功的红灯形态
    下 vitest 序列化整个 MigrationPlan 对象做 diff，足以在失败报告中 OOM——本轮实测）。
  - 回归：`npx vitest run tests/runtime/migration.spec.ts` → 90 passed；三 fuzz 套件
    （migrationGenerativeFuzz + migrationDestructiveFuzz + declarationTabooFuzz）→
    132 passed；`npm run check`、`npm run build` 无错误；真实 PostgreSQL
    `postgresqlMigration.spec.ts` → 7 passed（PG 17.6，`INTERAQT_POSTGRES_DATABASE=
    interaqt_test`）。
- 最新证据（审计轮 5，2026-09-18）：验收命令全部独立复验通过（29/90/132/check/build、
  真实 PG 7/7），但对抗性探针发现实现缺陷 D-2：**state-only 计划项
  （`{rebuildState: true, rebuildOutput: false}`）在 `run()` 的 `if (!item.rebuildOutput)
  continue`（migration.ts:3885）处跳出，3896 行的扫描对它不可达**——宽口径的
  `rebuildState` 单真半边未实现。探针（PGLite）：state-only 决策 + 正确映射 +
  ghost 记录 → migrate 成功、映射照常施加（approved→accepted）、ghost 存活、迁移后
  dispatch `error: undefined` 且状态不变。state-only + mapping 是 M-02 D-1 boundary
  钉住的合法审批组合，路径真实可达。既有 29 用例未覆盖该交集格（N1–N4 全为
  `rebuildOutput=true`；D-1 boundary 数据全合法）。同类枚举：`rebuildOutput=false`
  当且仅当 state-only 决策项——D-2 是唯一漏扫路径，修复即闭合。M-04 待审→开放
  （reopen 1，领域「不变量触发面完整性」，未触发收敛）。修正指向与红灯骨架见
  审计文件 §2/§2.1。
- 最新证据（实现轮 6，2026-09-18，D-2 修复）：
  - **红灯基线**（审计 §2.1 骨架，先复现后修复）：N6（state-only + 正确映射 + ghost，
    D-1 boundary 同款合法审批组合）与 N7（升级窗口无映射变体——state-only 决策 +
    ghost，检测降级为不比较、无映射要求）在修复前均失败于 `migrationError ===
    undefined`：migrate 成功返回、ghost 穿过迁移存活、映射照常施加（与审计探针输出
    一致）；既有 29 用例保持绿——复现精确锚定扫描对 state-only 项不可达。
  - 修复（migration.ts `run()` 控制流重排）：映射施加独立提前（`stateGraphMappingDecision`
    存在即施加，先于一切检查），随后对 `item.rebuildState || item.rebuildOutput`（宽
    口径，含 state-only 项）执行 `assertPersistedStatesLegal`，**之后**才进入状态重建
    分支（所有权路由跳过重置 / `rebuildStateDefaults`）与 `if (!item.rebuildOutput)
    continue`。审计修正指令的字面「移到 continue 之前（映射施加与重置之后）」在与
    其自身 §2.1 有映射变体的完成条件对照下不可同时满足：`rebuildStateDefaults` 的
    defaultValue 是新初始态名，重置会把图外名无差别洗白为新初始名（机制 C 的错误
    动作），扫描放重置之后 N7 格永远拦不住。落位采用「映射 → 不变量 → 重置 →
    输出重建」：映射仍是使旧名合法的官方路径且先于检查（§3.4 顺序不变），重置不再
    能掩盖非法名。副作用界定：升级窗口 ×初始态改名 ×`changed`/state-only 决策的复合
    格从「重置洗白、迁移成功」变为 fail-fast——这正是 §3.4 写明的升级窗口语义
    （fail-fast，出路是两步迁移或 re-baseline），且审计轮 2 已把该格记入 M-06 文档
    注意事项；既有用例无此格（N1/N4 均为非初始改名、`rebuildState=false`）。
  - `tests/runtime/migrationStateMachineStateGraph.spec.ts` 扩至 31 用例全绿
    （`npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts` →
    31 passed）：N6 断言 migrate 抛含 `ghost` 与合法集合的 `MigrationError`、事务回滚
    （approved 记录的映射写一并撤销为 approved、ghost 保持 ghost）；N7 断言无映射的
    state-only 计划同样被扫描拦截（ghost 未被 `rebuildStateDefaults` 洗白，回滚保持
    ghost）。
  - 回归：`npx vitest run tests/runtime/migration.spec.ts` → 90 passed；三 fuzz 套件 →
    132 passed；`npm run check`、`npm run build` 无错误；全 runtime 套件 1345 passed /
    58 skipped（env-gated postgresql*）；真实 PostgreSQL `postgresqlMigration.spec.ts`
    → 7 passed（PG 17.6，`INTERAQT_POSTGRES_DATABASE=interaqt_test`）。D-1 boundary
    的不过度拒绝断言与 P5 成本边界断言保持绿。
- 最新证据（审计轮 6，2026-09-18）：验收命令全部独立复验通过（31/90/132/check/build、
  真实 PG postgresqlMigration 7/7，PG 17.6）。D-2 修复核验正确：控制流为「映射施加 →
  宽口径扫描（rebuildState||rebuildOutput，含 state-only 项）→ 所有权路由/重置 →
  continue/输出重建」（migration.ts:3871-3905）。实现轮对审计轮 5 修正指令字面顺序的
  偏离（扫描落位在重置之前）裁定为正确且必要：`rebuildStateDefaults` 的 defaultValue
  是新初始态名（合法名），先重置再扫描会把图外名洗白——审计指令的完成条件（§2.1
  无映射变体必须被拦截）优先于其括号内的顺序表述。缺陷注入双向验证：注入 A（D-2
  原形态：扫描收窄回 rebuildOutput 单边）恰好 N6/N7 转红（2 failed）；注入 B（字面
  顺序：扫描移到重置后）恰好 N7 转红（1 failed，洗白形态被捕获）；注入完全还原后
  31/31（stash 快照对照确认字节级还原）。同类格枚举闭环：rebuildOutput=false 当且仅当
  state-only 决策项，无剩余漏扫格；run() 内 currentState 的全部写点（映射/重置/输出
  重建）相对扫描的时点逐一核验。simulate 降级路径（非哨兵错误 → 回退分析性 scope）、
  kill-resume 事务语义（N2/N6 回滚断言）核验无回归。M-01/M-02/M-03 回归面全绿
  （含所有权声明与 Object.hasOwn 收口）。实现缺陷 0，验证缺口 0，M-04 待审→已完成
  （reopen 维持 1，未触发收敛）。

### M-05 回归面与真实 PostgreSQL 对照
- 状态：已完成（实现轮 7 主体；审计轮 7 通过——验收全部独立复验，2 个正向真实 PG
  场景的判别力经审计轮独立注入双向验证；1 个验证缺口由审计轮直接闭合：新增第三个
  真实 PG 负向场景，钉住映射施加与合法性扫描在真实连接事务内的回滚语义——PGLite
  的 N2/N6 回滚断言按 AGENTS.md 不作为真实 PG 事务语义的完成证明；该场景经独立
  注入双向验证后完全还原注入）。
- 可独立观察结果：Task 要求 6 列出的四个既有套件无新增失败；
  `tests/runtime/postgresqlMigration*.spec.ts` 体系内新增至少一个状态映射场景
  （property 级初始改名 + 非初始改名对照，迁移后 dispatch），按 env-gated 方式运行通过。
- 覆盖 Task 要求：6。
- 前置：M-01–M-04。
- `reopen-count: 0`；`reopen-domains: ∅`。
- 验收命令：`npx vitest run tests/runtime/migration.spec.ts tests/runtime/migrationGenerativeFuzz.spec.ts tests/runtime/migrationDestructiveFuzz.spec.ts tests/runtime/declarationTabooFuzz.spec.ts`；
  `INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npm run test:postgres`
  （d1 已核实本机 PostgreSQL 17.6 运行中、`interaqt` 角色存在；实现轮实测执行，环境
  漂移时记录阻塞与已跑的 PGLite 证据，不冒充完成）。
- 最新证据（实现轮 7，2026-09-18）：
  - `tests/runtime/postgresqlMigration.spec.ts` 新增独立 describe 块
    "PostgreSQL state graph mapping migration"，两个真实 PostgreSQL 场景（各自独占
    数据库派生名 `_state_map_b` / `_state_map_a`）：
    - **非初始改名**（`approved → accepted`，机制 B 形态，`rebuildState=false`——映射
      由批准决策触发）：先断言 diff 的 `requiredDecisions` 含
      `state-graph-mapping`（removed `[approved]`、added `[accepted]`）；迁移后
      `currentState` 列与输出值均为 `accepted`、未转移记录保持 `pending`；随后真实
      dispatch `Archive`，断言 `error: undefined` 且输出值与 `currentState` 双面变为
      `archived`。
    - **初始改名**（`pending → queued`，机制 A 形态，`rebuildState && rebuildOutput`
      双真）：未转移记录映射为 `queued`（非无差别重置）、已转移 `approved` 记录不动；
      随后 dispatch `Approve`，双面断言变为 `approved`。
    - 两个场景均按 M-02 验收口径断言持久化 `currentState` 列本身
      （`_PgStateMapTicket_status_bound_currentState`），不是只断言输出值；PG 侧 id 是
      number，payload 按既有 PG 套件惯例传 `String(ticket.id)`（string 类型
      PayloadItem）。
  - 文件内本地审批 helper 增 `stateMappings` 选项（与共享 helper 同形），映射显式
    给出而非依赖默认配对。
  - **判别力验证（缺陷注入双向）**：短路 `applyStateGraphMapping` 调用（pre-M-02
    形态）后，两个新场景恰好 2 failed（旧名残留），既有 7 用例不受影响；完全还原后
    9/9 通过（`cp` 快照对照确认字节级还原）。
  - 回归：四个验收套件 222/222（migration 90 + migrationGenerativeFuzz /
    migrationDestructiveFuzz / declarationTabooFuzz 132）；M-01–M-04 验收命令保持全绿
    （`migrationStateMachineStateGraph.spec.ts` 31/31、`npm run check`、`npm run build`
    无错误）；env-gated 全量真实 PostgreSQL 矩阵 `npm run test:postgres` → 11 文件 /
    50 tests 全部通过（PG 17.6，`INTERAQT_POSTGRES_DATABASE=interaqt_test`，
    postgresqlMigration 9/9 含两个新场景）。
- 最新证据（审计轮 7，2026-09-18）：验收命令全部独立复验通过（222/31/check/build、
  真实 PG 矩阵 postgresqlMigration 9/9，PG 17.6）。实现轮的两条注入声明独立重放：
  短路映射施加 → 恰好两新场景 2 failed、还原（MD5 `b2c680…` 对照）后 9/9。验证缺口
  1 直接闭合：映射写与不变量触发的回滚语义此前只有 PGLite 证据（N2/N6），新增第三个
  真实 PG 场景（`_state_map_c`，与 N2 同形：改名 + 正确映射 + ghost 腐蚀 → 迁移事务内
  抛错、approved 记录的映射写回滚、ghost 保持）——注入「短路 assertPersistedStatesLegal」
  恰好该场景 1 failed，还原后 10/10；全 PG 矩阵复跑 51/51。同类检查：其余本地审批
  helper（r2/r3/r16、scopedSequence 等）对未知 kind 走展开兜底而非误转 destructive-scope，
  且其套件不产生状态图变更，不受影响。实现缺陷 0，M-05 待审→已完成（reopen 维持 0，
  未触发收敛）。

### M-06 文档、维度注册表与逃逸复盘
- 状态：已完成（实现轮 8 主体；审计轮 8 通过——验收命令全部独立复验，三件交付物
  逐点对照实现与真实行为核验一致；1 个验证缺口由审计轮直接闭合：文档中「初始态改名
  时旧初始名记录必须移动」的因果表述在「旧初始名保留为节点」的形状（removed=[]，
  requirement 为空映射，记录合法保持原名的正确行为，审计轮 3 探针已定谳）下不精确，
  措辞修正为按两种形状分列，行为与测试无需改动）。
- 可独立观察结果：`agent/agentspace/knowledge/usage/` 新增（或并入现有）迁移 handler
  合约文档：状态图变化时应用提供什么（state-graph-mapping 决策的写法）、框架如何校验
  （missing 即拒、映射后不变量）、失败时的错误形态（错误信息样例）、修复性迁移路径
  （对已被错误迁移的库如何再迁移）；`WritingComputationTests.md` 回填维度：状态图变更
  类型（初始改名/非初始改名/增删节点）× 作用域 × bound state 所有权（输出路径拥有/
  不拥有）× rebuild 标志组合；`agentspace/output/` 逃逸复盘一份（结论落成机制：新
  oracle = 迁移后必须执行依赖该状态的 Interaction 并断言输出与 bound state 双面——
  已在 M-02 测试中机制化；fuzzer 生成域缺 StateMachine 变异记为后续建议）。
- 覆盖 Task 要求：6（注册表）、7。
- 前置：M-01–M-04（内容依赖最终行为）。
- `reopen-count: 0`；`reopen-domains: ∅`。
- 验收命令：文档存在性检查 + `WritingComputationTests.md` diff 审阅；无命令可执行时
  以实现审计核验内容与实际行为一致。
- 最新证据（实现轮 8，2026-09-18）：
  - **文档**：新增 `agent/agentspace/knowledge/usage/22-state-machine-state-graph-migration.md`
    （English，与 usage 系列同语言；README 学习路径第 23 条登记）。内容对照实现逐点
    核实：requirement 字段（`removedStateNames` 恰为映射必覆盖键集）、决策规则（键集
    恰覆盖 / 目标合法或 null / 与 `unchanged`·`unrebuildable` 矛盾拒绝——`validateApprovedDiff`
    源码原文）、施加顺序（映射 → 不变量 → 输出重建，handler 收到的 record 已含新名——
    M-02 测试的 `statusFromState` 助手即此形态）、宽口径扫描与升级窗口语义、**六条
    失败信息逐字核对**（含 `requirementKey` 的尾随冒号形态
    `state-graph-mapping:<dataContext>:`——`migration.ts:1262` 实算确认）、**修复性迁移
    路径**（两步迁移：先把新名改回旧名使库回到合法、再正式改名；
    `createMigrationBaseline` 清 manifest 阻塞但不修复数据、rebuild 触发时不变量仍拦）。
    Custom / Transform 所有权 / 运行期语义不变的边界与设计 §3.1/§3.4 一致。
  - **维度注册表**：`tests/runtime/WritingComputationTests.md` 维度表新增一行
    「迁移期状态图变更 × 作用域 × bound state 所有权 × rebuild 标志（migration-state-machine-state-remap
    引入）」：四维取值（含「非初始改名 rebuildState=false 只看标志会漏」「state-only 项
    在 continue 处跳出」「unchanged 组合面」等退化点）、**双面断言强制**（迁移后真实
    dispatch + 输出值与 currentState 列同时变化；「只改输出值」形态必须可区分）、
    升级窗口独立格、样板文件指向。
  - **逃逸复盘**：`agentspace/output/migration-state-remap-test-blindness-retrospective.md`。
    四个结构性盲区（观察终点=迁移完成、签名不描述值域、fuzz 生成域缺物种、静默 skip
    无错误信号），逐防线显微镜（state-only 既有用例只用 Custom+GlobalBoundState 且把
    「可整体重置」错误语义固化成绿灯——对其源码逐行核实；PR #51 预言机正确但矩阵
    维度不足）。结论全部落成机制：新 oracle（迁移后 dispatch + 双面断言，31 用例 +
    真实 PG 3 场景）、新不变量（assertPersistedStatesLegal）、新检测/决策面（stateGraph +
    state-graph-mapping）、新所有权声明（ownsStateOnRebuild）、注册表回填。诚实边界
    双侧登记：fuzz 生成域无状态图变异（后续建议，非本轮交付；扩展时按 rng 契约重验
    seed 池）、运行期不变量有意不存在（辖区=迁移路径）、Custom 语义不进机制。
  - **验收**：三件交付物存在性检查通过（README 登记行、文档/复盘文件、注册表行
    grep 命中）；行为一致性以源码核对 + 全部回归绿证明：
    `npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts tests/runtime/migration.spec.ts`
    → 121 passed；三 fuzz 套件 → 132 passed；`npm run check`、`npm run build` 无错误；
    真实 PostgreSQL `postgresqlMigration.spec.ts` → 10 passed（PG，`INTERAQT_POSTGRES_DATABASE=
    interaqt_test`，含 state map 3 场景）。
- 最新证据（审计轮 8，2026-09-18）：验收命令全部独立复验通过（121/132/check/build、
  真实 PG postgresqlMigration 10/10 + 全矩阵 51/51，PG 17.6）。三件交付物逐点对照
  实现核验：usage/22 的触发面/决策规则/执行顺序/列名/失败目录六条错误信息（逐字）/
  修复性迁移路径（探针执行验证：库携带图外名 + 正确映射的改名迁移即 re-legalize 路径，
  迁移后 dispatch 生效）/边界三条全部与代码一致；注册表行覆盖 Task 要求 6 的四维含
  退化点；复盘的机制化结论五条全部可执行存在、诚实边界双侧登记。1 个验证缺口
  （文档「初始态改名时记录必须移动」在 removed=[] 保留形状下因果不精确——正确行为
  是空映射 + 记录保持仍合法名）由审计轮直接修正措辞闭合，行为与测试零改动。
  实现缺陷 0，M-06 待审→已完成（reopen 维持 0）。全部 6 个里程碑完成，最终核验
  （各里程碑验收命令 + Task 要求 1–8 逐项 + 全量基础测试：runtime 1345、storage 846、
  core+builtins 612、真实 PG 51/51、check/build）通过，任务 `status: 已完成`。

## 5. 风险与验证安排

### 设计期已验证（d0 设计轮 + d1 裁决轮）

- 机制 A/B/C/D/E/F/G 全部按「存在」定谳（§1.1），包括 PR #51 修复形态下的 C/D 实际
  行为——方案以此为基线。
- `migrationGenerativeFuzz` 生成域与 rng 流不受新决策种类影响（§1.2 读者表；d1 复核
  其变异菜单确无 StateMachine/Transform/Custom）。
- d1 裁决轮补充：评审事实链全部独立复核成立（§1 d1 裁决记录）；两个新事实
  （manifest 无原始 args、takeover 阻断）并入正文；`migration.spec.ts` 复跑 90/90；
  本机 PostgreSQL 17.6 可用（`interaqt` 角色与库存在）。

### 实现期验证的风险

1. **`stateGraph` 提取的稳定性**：从 manifest 的 `args` 提取节点名依赖
   `canonicalizeArgsForSignature` 之前的原始 args（manifest 里存的是声明对象）。实现期
   需确认 `createMigrationManifest` 能拿到 `args.states[].name` 与 `args.initialState.name`
   （StateMachine handle 的 args 形状已在 `StateMachine.ts` 核实）。M-01 验收覆盖。
2. **「无状态图变化的 diff 与今天逐字节同构」**：新增 manifest 字段会进入 diff 文件的
   manifest 剌（`fromModelHash`/`toModelHash` 不含新字段即可）。实现期用「同模型两版
   生成 diff，changes 为空」对照。M-01 覆盖。
3. **`forceMutationEvent` / takeover 与映射的交互（d1 已闭）**：核实
   `validateApprovedDiff` 对 `targetType === "property"` 且 `computation.type` 含
   StateMachine 且有 bound state 的 takeover 决策**今日即整体拒绝**
   （`migration.ts:2018-2020`：`StateMachine computation takeover requires a state rebuild
   handler, which is not supported in this migration phase`，且该用例在
   `migration.spec.ts:3663` 有回归测试）。因此「fact→StateMachine 接管 + 状态图变化」
   的组合在本任务范围内不可达；M-02 不需要 takeover 对照用例。若未来放开该阻断，
   映射施加（先于输出重建）与 takeover 的 `forceMutationEvent` 写入顺序已自洽
   （旧名→新名映射发生在 handler 读到记录之前）。
4. **真实 PostgreSQL 可用性（d1 已核实）**：本机 PostgreSQL 17.6 运行中
   （`/tmp:5432 accepting connections`，`interaqt` 角色与 `interaqt` 库已存在），
   M-05 的 env-gated 套件可实际执行；实现轮按 AGENTS.md 的连接变量显式运行并记录
   输出（仍不排除环境漂移，届时不冒充完成、记录阻塞）。
5. **Custom 界定争议**：本设计以 computation type = StateMachine 为映射合同的辖区，
   Custom 不触发。若评审认为「带 `createState` 的 Custom」也须覆盖，其映射表形状无法
   由框架定义（值域是应用语义），只能提供「state-only 决策 + 文档指引」——维持本设计
   的界定，理由已写入 §3.1。

## 6. 基线

- Git revision：`f9f06b3`（main，2026-09-17）。
- 工作树：干净（除 `agentspace/output/pr51-migration-state-rebuild-review-2026-09-17.md`
  与 `docs/migration-state-machine-state-remap/` 两处任务输入/输出，均为未跟踪文件）。
- 相关测试：`tests/runtime/migration.spec.ts` 90/90 通过（实测）。其余套件未跑——实现
  轮按 M-05 验收统一执行；任务开始前的既有失败以届时实测记录为准。
