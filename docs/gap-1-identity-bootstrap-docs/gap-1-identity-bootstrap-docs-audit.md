# GAP-1 实现审计 — 第 4 轮（审计 M-03）

结论：**M-03 验收通过，0 实现缺陷 / 1 验证缺口（本轮已直接加强并复验通过，里程碑保持关闭），`待审`→`已完成`**。M-01、M-02 复验通过、保持`已完成`。全部里程碑完成，触发最终核验分支：全部里程碑验收命令 + Task 要求逐项检查 + 全量基础测试（`npm test` 2721 passed / 66 skipped[env-gated PG] / 0 failed）全部通过，任务转入 `已完成`。

审计对象：实现轮 4（implementation-round 4/15）——M-03「唯一入口」与 guard 词汇一次性修正、交叉引用同步。范围核对：`git status` 16 个已跟踪文件全部为文档/规则（`.cursor` ×1、根 README、AGENTS.md、generator ×3、usage ×8、skill ×1），`src/` 零改动（R6 成立）；未跟踪文件仅任务目录、M-01 spec（内容经三形态标题核对未变）、M-02 指南 21 与协议脚本。

## 1. 验收命令独立复验（全部通过）

| 命令 | 结果 |
|------|------|
| (1) T1 锚点（加强前 25） | 25/25 OK |
| (2) 冒号/参数形 guard 签名全库（`*.md`+`*.mdc`，排除归档/冻结/历史） | 0 命中（修正前基线 6 处，探针 P6 一致） |
| (3) T2 锚点 | 11/11 OK |
| (4) 入口模式辅助筛查 | 56 行剩余命中，逐条独立裁决：修正后陈述（AGENTS:122、01:19/:107/:120、05:3、13:279/:281/:1172、usage/README:98、00:289、21:3、generator test-impl:4、basic-interaction-gen:76）+ 事实正确排他（mdc:10，排他归于 dispatch）+ §1.2 保留清单成员（行号 ±2 漂移后逐条对应）。无清单外新命中 |
| (4b) C 形覆盖率筛查 | 4 行命中（13:283/:285/:1172、generator test-impl:4）全部为充分性归因于全部声明 EventSource 的修正后陈述 |
| (5) usage/README 学习路径 | `:146` 含第 22 项（21-system-event-sources） |
| M-02 回归：guide 锚点链 / user validation / pre-built guard / built-in guard / 悬空引用断言 / 02 Relation 句 | 全部通过 |
| M-01 回归：4 specs（systemEventSourceRecipe / eventSource / applicationIdentity / dispatchIdempotency） | 4 files / 98 tests 全部通过 |
| `npm run check`（tsc --noEmit） | 通过 |

## 2. 对抗性 diff 审查（16 文件逐 hunk 对照成员表）

全部 hunk 与设计成员一一对应，无清单外改动：

- **T1（22 成员 + 1 同族补校）逐处核实**：#1–#8、#11–#18、#19–#22 的替换文本均满足 §3.4 统一措辞基准（唯一入口 = 经 `Controller.dispatch` 触发的 EventSource；Interaction 是内建的、面向用户交互的一种），排他断言全部从 Interaction 改派到 dispatched EventSources；#9/#10/#12/#19–#22 测试哲学前提-结论链成对修正（前提 + 覆盖率结论同步改为「测全声明的全部 EventSource」，无半句残留——风险 5.2.2 核实）；#14 整条 bullet 含第二句 "single source of truth" 一并语义更新（裁决轮 3 注意 3 落实）；同族补校 `01-core:18`（"Only user interactions can generate new data"）按 P 形谓词判定正确、修正到位（见 §3）。
- **反命令式教学保留（风险 5.2.1）**：`01-core:21` "Never try to 'operate' data"、`00-mindset` "Shadow of Data" 框架、`usage/README:101` 单向数据流等教学核心全部未动；修正仅收回「Interaction = 唯一」的排他断言。
- **T2 家族 A（8 处）**：A1 注记与 `src/core/EventSource.ts:206-212` 实际报错逐点忠实（"Move the callback to admit"）；A2/A7（同一接口两份拷贝）与 A8 签名对齐源码 `EventSourceInstance` / `EventSourceCreateArgs`（`admit?` + 补 `open?`，字段序一致）；A3/A4 示例、A5/A6 Key Points 全部改 `admit`。
- **T2 家族 B（9 处，B3 随 M-02）**：B1 管线句与权威 `usage/14:1432` 逐字一致（`admit → open? → map → create → resolve → afterDispatch`）且与 `Controller.ts:1609-1617` 源码事实相符；B2/B4/B5/B6/B7/B8/B9 词级替换；B10 调序并标注弃用。同句既有 `callInteraction` 污染（B7、13-testing:167 等）按 §1.3.2 边界保持原样（diff 证实未触碰）。
- **交叉引用闭合**：入链 21 = 05:3（本轮新增）、05:24、06:56、usage/README:146；指南 21 出链（02/05/06/13/14/15 + `src/core/EventSource.ts`）全部解析到真实文件；Test Anchoring 引用的三个含 guard 词汇测试标题逐一在 spec 中逐字存在（eventSource:91/:245、dispatchIdempotency:503）。

## 3. 验证缺口（1 项，本轮直接加强后复验通过）

**V1【acceptance-anchor-coverage】命令 (1)/(4) 对 `01-core:18` 回归致盲。**

- 症状：实现轮诚实报告的同族补校（`01-core-concepts.md:18` 旧文 "Only user interactions can generate new data"）不在 T1 表内——机械模式 `only interactions` 因插入词 "user" 不命中；实测该短语对命令 (1) 全部 25 锚点与命令 (4) 全部 8 模式均无匹配（`grep -c` = 0）。若该行回归，验收保持绿。
- 定性：当前实现正确（diff 核实修正到位），属**验证缺口**而非实现缺陷——现有验收可能放过错误实现，但产品实现未被证明错误。按协议第 4 条，审计轮直接加强验收，不退回实现轮。
- 加强（本轮已完成）：T1 回填第 23 号成员（含发现与回填来源注记），表头计数 22→23；命令 (1) 增补锚点 `01-core-concepts.md|Only user interactions can generate new data`（25→26）。
- 判别力证明（缺陷注入，协议第 5 条）：临时把 `:18` 还原为旧文 → 锚点断言 RED（"anchor catches the regression"）；字节级还原（备份覆盖，`git diff --stat` 与注入前一致）→ GREEN。注入现场已完全还原。
- 复验：加强后命令 (1) 26/26 OK。
- 同类检查：按「插入词变体」形状全库重扫（`only [a-z]+ interactions?`、`only … can (generate|create|enter|modify|delete|change)`、`interactions? (are|is) the (sole|exclusive)`）——14 行命中逐条裁决为修正后陈述或特定业务规则/集成语境注释，无清单外成员；重跑裁决轮 3 的排他措辞变体与 C 形充分性变体（`no need to test` / `enough to` / `redundant to test` 等）——零新命中。

## 4. T2 记账独立对账

全库 `\bguard\b` 残留 21 行，逐行独立分类：合法 15 行（ignoreGuard 释义 ×5：mdc:21、skill:415、api-reference:3366/:3379/:3562；`InteractionGuardError`（usage/18:84）；弃用别名提及且现名在前 mdc:27；"single guard concept" 指 Condition ×3：14:1326、06:14、api-reference:3165；泛英语义 ×5：AGENTS:247/:256/:257、mdc(interproject):57、19:671）+ 设计要求的弃用名注记 6 行（mdc:44 B10、api-reference:549 A1、指南 21 ×4：:75 弃用键注记、:201/:202/:207 既有测试标题逐字引用）。21 = 15 + 6 核平，无未分类行。user-validation 变体全库扫描 3 命中均合法（指南 21 否定句、skill:567 条件作者建议、前端表单校验）。

## 5. 最终核验（全部里程碑完成后，协议第 11 条第一分支）

| 项 | 结果 |
|------|------|
| M-01 验收命令 | 4 files / 98 tests 通过 |
| M-02 验收命令（含三条防复发断言） | 全部通过 |
| M-03 验收命令（含本轮加强的 26 锚点） | (1) 26/26、(2) 0、(3) 11/11、(4)(4b) 逐条裁决、(5) 通过 |
| `npm run check` | 通过 |
| 全量基础测试 `npm test` | 232 files passed / 15 skipped（env-gated 真实 PG 套件，按 AGENTS.md 预期 skip）；2721 tests passed / 66 skipped / 0 failed |
| `src/` 零改动（R6） | `git diff --name-only -- src/` 为空 |
| Task 要求 R1 | 指南 21 六节骨架 + 合作方开通完整示例 + 分工说明；Test Anchoring 表引用逐字真实；M-01 spec 3 形态在场 |
| Task 要求 R2 | 05:24 / 06:56 / api-reference:2643 三处成文「无框架 user 闸门」，表述与源码一致（dispatch 四项入口校验、`user` 仅类型契约） |
| Task 要求 R3 | 02:388 权威位置三残余齐全（Relation / filtered-merged / MySQL），其余位置引用不重复 |
| Task 要求 R4 | T1 23/23 + T2 A8/B10 全部修正；知识库无自相矛盾入口叙述（本轮全部筛查逐条裁决） |
| Task 要求 R5 | 指南 21 §Insert vs observe 交叉引用 15 判别表（:130/:149），不重复定义 |
| Task 要求 R6 | `src/` 零改动；未建 `DispatchResponse` 解析结果通道；无 API/运行时行为变更 |
| 任务说明第 6 条 | usage/README 学习路径 + 05/06/02/15/21 交叉引用闭合 |

## 6. reopen 记账

- 本轮 0 实现缺陷、1 验证缺口（V1，按协议第 4 条当轮加强并复验通过）→ M-03 无 reopen（纯验证缺口不计），`reopen-count` 保持 0。
- M-01 `reopen-count` 0；M-02 `reopen-count` 1（`reopen-domains: { guide-factual-accuracy: 1, guard-terminology: 1 }`，审计轮 2 记入，其后未再触发）。
- 全程 `convergence-mode: normal`（两域均未出现第二次 reopen）。

## 7. 状态更新与终止

- **M-03：`待审` → `已完成`**；M-01、M-02 保持`已完成`。全部里程碑完成。
- 设计文档头部：`status: 已完成`、`implementation-round: 4/15`（审计轮不增 k）、`next-action: 无`。
- 按协议第 11 条第一分支完成最终核验（§5）与 `retro.md` 运行记录；**终止，不启动新的 chat**。
