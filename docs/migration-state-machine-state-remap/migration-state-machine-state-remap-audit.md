# 实现审计 — 迁移期 StateMachine 持久化状态与状态图变更的一致性

- 审计轮次：第 8 次实现审计（对应实现轮 8，k=8/30，M-06 待审——文档、维度注册表与
  逃逸复盘；本任务的最后一个里程碑）
- 审计范围：M-06 三件交付物（`agent/agentspace/knowledge/usage/22-state-machine-state-graph-migration.md`、
  `tests/runtime/WritingComputationTests.md` 维度行、`agentspace/output/migration-state-remap-test-blindness-retrospective.md`）
  逐句对照实现与真实行为的核验；README 登记行；验收命令与全部里程碑回归面的独立
  复验；全部里程碑完成后的最终核验（Task 要求逐项检查 + 全量基础测试）。
- 结论：**实现缺陷 0；验证缺口 1（文档一处因果表述不精确），由本轮直接闭合**（措辞
  修正，行为与测试均无需改动——正确行为本就由代码与审计轮 3 探针定谳）。**M-06 从
  `待审`转`已完成`**（reopen-count 维持 0）。**全部 6 个里程碑已完成，最终核验通过，
  任务 `status: 已完成`。**

## 1. 验收命令复验（全部独立重跑，在缺陷定谳前执行）

| 命令 | 结果 | 备注 |
|------|------|------|
| `npx vitest run tests/runtime/migrationStateMachineStateGraph.spec.ts tests/runtime/migration.spec.ts` | 121/121 通过 | M-06 声明的验收组合（31+90） |
| `npx vitest run tests/runtime/migrationGenerativeFuzz.spec.ts tests/runtime/migrationDestructiveFuzz.spec.ts tests/runtime/declarationTabooFuzz.spec.ts` | 132/132 通过 | 三 fuzz 套件 |
| `npm run check` / `npm run build` | 通过 | exit 0（tsc --noEmit / prod tsc） |
| 真实 PG `postgresqlMigration.spec.ts`（PG 17.6，`INTERAQT_POSTGRES_DATABASE=interaqt_test`） | 10/10 通过 | 含 state map 3 场景（`-t "state graph mapping"` 单跑 3/3） |
| 真实 PG 全矩阵 `npm run test:postgres` | 11 文件 51/51 通过 | 最终核验（§5） |
| 全 runtime 套件（非 postgresql*） | 1345 passed / 10 skipped | 最终核验 |
| 全 storage 套件 | 846 passed / 8 skipped | 最终核验 |
| 全 core + builtins 套件 | 612/612 通过 | 最终核验 |
| 交付物存在性 | 通过 | README 第 23 条登记行、两份文档、注册表行 grep 命中 |

M-06 验收条目「无命令可执行时以实现审计核验内容与实际行为一致」按 §2 执行。

## 2. M-06 交付物对照实现与真实行为的核验

### 2.1 使用文档（usage/22）逐点核实

- **触发面与 requirement 字段**：`getStateGraphChange`（migration.ts:1206-1218，
  `removed/added/initialState` 三元比较）、`requiresStateGraphMapping`（1225-1227，
  `removed.length > 0 || initial 改名`）、requirement 携带四字段（1229-1239）——与文档
  「When a Mapping Is Required」一致。「仅新增不需要映射」「初始态改名总是要求映射」
  均有测试对应（`purely added node…`、`initial state rename is detected even though…`）。
- **决策规则三条**（键恰等于 removedStateNames、目标 ∈ nextNodeNames 或 null、与
  `unchanged`/`unrebuildable` 矛盾拒绝）：逐条对照 `validateApprovedDiff` 的
  state-graph-mapping 校验块（migration.ts:2230-2277）与 `getChangedComputationsFromApprovedDiff`
  的播种逻辑（2331-2347：只有 changed/state-only 入列）——表述准确。dryRun 同样触发
  （`validateApprovedDiff` 先于 dryRun 早退，审计轮 3 已注入验证）。
- **执行顺序「映射 → 不变量 → 输出重建」与 handler 收到的 record 已含新名**：
  `run()` 控制流（3871-3905）核实一致；M-02 测试的 `statusFromState` 助手
  （spec:491）即「handler 从状态列推导输出值」的活体形态。
- **bound-state 列名 `` `_${host}_${property}_bound_currentState` ``**：与
  `Scheduler.getBoundStateName`（Scheduler.ts:250-257）实算一致。
- **失败目录六条**：错误信息前缀与 migration.ts:2244/2250/2260/2274/2303/4081 的
  字符串逐字核对一致（含 `requirementKey` 尾随冒号形态
  `state-graph-mapping:<dataContext>:`——1256-1263 实算确认）。N0/N1/N2 测试断言
  的匹配串与目录吻合。
- **不变量的成本边界与辖区**（宽口径 rebuildState||rebuildOutput、setup/dispatch
  不查、无 rebuild 项不扫）：与 `run()` 3887 触发条件、`assertPersistedStatesLegal`
  4066-4097 实现一致；P5 用例钉住成本边界，N3 钉住宽口径。
- **修复性迁移路径**：两步迁移（先把新名改回旧名使库回到合法、再正式改名）与
  `createMigrationBaseline` 的边界（清 manifest 阻塞但不修复数据、rebuild 触发时
  不变量仍拦）——与实现语义一致。本轮探针（PGLite，临时 spec，已删除）对「库携带
  图外名 + 正确映射的改名迁移」执行验证：改名迁移正是使图外名回到合法的路径，
  迁移成功且迁移后 dispatch 生效（`accepted → archived` 转移可用），与文档路径自洽。
- **Boundaries 三条**（Custom 不接管、所有权声明清单、运行期语义不变）：与
  `isStateMachineComputation`（computationType 判定，1307-1309）、四处
  `ownsStateOnRebuild` 声明（Transform.ts:27、aggregationTemplate.ts:146/275、
  RealTime.ts:58/114）、Task 要求 8 逐条一致。

### 2.2 维度注册表行（WritingComputationTests.md）

新增行覆盖 Task 要求 6 指定的四维：状态图变更类型（初始改名 / 非初始改名——显式标注
`rebuildState=false` 只看标志会漏 / 删除节点 / 仅新增）/ 作用域（property / global）/
bound state 所有权（输出路径不拥有 vs 拥有——Transform 键坍缩、聚合贡献、RealTime
时间戳的破坏形态显式标注）/ rebuild 标志组合（双真、state-only——「在 continue 处跳出，
扫描/映射必须挂在 continue 之前」、rebuildOutput 单真——「映射施加以批准决策存在为
触发面」）。映射决策组合面（changed / state-only / unchanged / unrebuildable）与升级
窗口独立格均已入行；双面断言（迁移后真实 dispatch + 输出值与 currentState 列同时
变化、只改输出值的错误实现必须可区分）写为强制口径。样板文件指向两处测试。与
AGENTS.md「新增矩阵或回归时必须对照注册表」的机制要求一致。

### 2.3 逃逸复盘（agentspace/output）

- 四个结构性盲区（观察终点=迁移完成、签名不描述值域、fuzz 生成域缺物种、静默 skip
  无错误信号）与设计 §1.1 求证结论同构且互为印证；对既有防线的显微镜分析中，
  「state-only 唯一用例只用 Custom+GlobalBoundState 并把可整体重置语义固化为绿灯」
  与 `migration.spec.ts` 的 state-only 用例（约 4253 行）逐行核实成立。
- 「落成机制」五条与本任务交付一一对应且全部可执行存在（31 用例 oracle、
  `assertPersistedStatesLegal`、检测/决策面、`ownsStateOnRebuild`、注册表行）——满足
  AGENTS.md § 修 bug 清单第 5 条「结论落成机制，不只是文字」。
- 诚实边界双侧登记（fuzz 生成域无状态图变异为后续建议并注明 rng 契约、运行期不变量
  有意不存在、Custom 语义不进机制）——与设计 §3.4/§3.5 与 Task 要求 8 的裁定一致。

## 3. 验证缺口 1（本轮直接闭合）：文档一处因果表述不精确

**缺口描述**：文档原句「A rename of the initial state does require a mapping even
when the old initial name remains a legal node, **because records still sitting on
the old initial name must move to the new initial name's semantics**」。该因果表述
在「旧初始名保留为节点」的形状（`removedStateNames` 为空集）下不成立：此时
requirement 要求的映射是**空映射 `{}`**，坐在旧初始名上的记录**保持**这个仍合法的
名字、不被移动——审计轮 3 已用探针实测该格（`removed=[]`，记录保持旧初始名，
行为正确），本轮再经代码定谳（`requiresStateGraphMapping` 只看 initial 名不等；
映射校验的键集恰等于空集 → 空 mapping 合法；`applyStateGraphMapping`
对不在映射键中的值不动）。**产品行为正确、实现与测试无需任何改动**——这是文档
措辞把「删除形状的理由」误推广到「保留形状」的表述缺口。

**闭合动作**：将该句改写为按两种形状分列——删除形状（旧初始名进 removedStateNames，
必须映射）与保留形状（required mapping 为空 `{}`，记录保持仍合法的旧初始名，
decision requirement 的存在是让审阅者显式确认这一结果）。

**判别力复核**：改写不改变任何行为声明；两形状的行为均已被现有测试与审计轮 3 探针
钉住（`initial state rename is detected even though the old initial name may remain a
legal node` 是删除形状；保留形状的「空映射合法 + 记录不动」由映射校验语义与
`mapValue` 的 `changed:false` 分支共同保证）。

## 4. 同类检查（AGENTS.md § 修 bug 清单第 1、3 条）

- **知识库文档落点的同类位置**：usage 系列 00–21 中与迁移相关的既有文档
  （20-postgresql-concurrency-migration 等）不描述 bound state 迁移语义，与新文档
  无重叠或矛盾；`agentspace/knowledge/` 深潜文档未涉及状态图迁移。新文档是
  state-graph-mapping 合约的唯一权威落点（设计 §3.1 的落点裁定）。
- **错误信息文档化的同类面**：grep 全部 `state-graph-mapping` 相关错误字符串
  （六条）与失败目录表逐一对齐，无漏列、无多余。
- **README 登记行的编号连续性**：第 23 条与文件名 `22-…md` 的错位与既有系列
  （19-common-anti-patterns.md 登记为第 20/21 条）同构，非缺陷。
- **临时探针清理**：本轮探针 spec 已删除，`git status` 与审计开始时一致（探针仅
  运行、未触碰生产代码；其结论为「文档措辞修正」，无需保留复现）。

## 5. 最终核验（全部里程碑已完成分支）

按 additional task 4 第 11 条第一分支执行：

1. **全部里程碑验收命令复跑**：M-01/M-04 面（migrationStateMachineStateGraph
   31/31）、M-02 同族（migration.spec 90/90）、M-05 面（四套件 222/222 于 §1 分跑
   覆盖、真实 PG 51/51）、M-06 面（§1 全行）——全绿。
2. **Task 要求逐项检查**：
   - 要求 1（求证）：设计 §1.1 机制 A–G 定谳 + §1.2 读者枚举（d1 裁决轮独立复核）。
   - 要求 2（映射合同）：M-01 检测/决策 + M-02 施行；「只改输出值」可区分用例在册；
     property/global 双作用域；初始/非初始改名迁移后依赖状态的 Interaction 双面断言。
   - 要求 3（不变量）：M-04 `assertPersistedStatesLegal` 宽口径、fail-fast、事务回滚
     （PGLite N2/N6 + 真实 PG `_state_map_c`）；错误信息含 dataContext/非法值/合法集合。
   - 要求 4（所有权边界）：M-03 `ownsStateOnRebuild` 三路分流；Transform 双真计划
     与全量重算一致的执行证据；`rebuildStateDefaults` 无法施加于输出路径拥有的状态。
   - 要求 5（签名一致性）：专门检测 + 专门决策 + 不变量兜底；modelHash 金值断言钉住
     排除；fuzz rng 流不受影响（132/132）。
   - 要求 6（测试与注册表）：机制 A（property/global）/B/节点删除/Custom bound state/
     Transform 顺序反例/不变量正负向全覆盖，全部迁移后真实 dispatch + 双面断言；
     注册表四维行；真实 PG 3 场景（正向 ×2 + 事务回滚负向 ×1）；四回归套件无新增失败。
   - 要求 7（文档与复盘）：usage/22 合约文档（本轮修正后与行为逐点一致）、逃逸复盘
     五项机制化结论。
   - 要求 8（边界）：未合并 PR #51、无映射启发式、未重做审批/kill-resume、无存量自动
     修复（文档写明修复路径）、运行期 TransitionFinder/incrementalCompute 语义未动
     （migration.ts 对其零 diff）、未扩大为通用 bound state 迁移框架。
3. **项目基础测试**：runtime 1345 passed / 10 skipped（env-gated postgresql* 之外）、
   storage 846 passed / 8 skipped、core+builtins 612/612、真实 PG 全矩阵 51/51、
   `npm run check`/`npm run build` 干净。任务开始前基线（migration.spec 90/90）之上
   无新增失败。

## 6. 结论与状态更新

- **实现缺陷**：0。
- **验证缺口**：1（文档因果表述），本轮直接闭合（措辞修正），M-06 维持关闭路径
  （`待审` → `已完成`），不退回实现轮。
- `reopen-count` 维持 0，`reopen-domains` 维持 `∅`，未触发收敛模式。累计 reopen：
  M-02 ×1（迁移决策组合一致性）、M-04 ×1（不变量触发面完整性），均已在后续轮闭合。
- M-01、M-02、M-03、M-04、M-05 维持`已完成`（§1、§5 回归全绿）。
- **全部 6 个里程碑已完成，最终核验通过：`status: 已完成`，`next-action: 无`。**
  按「运行记录」完成 retro.md（终止，不启动新的 chat）。
