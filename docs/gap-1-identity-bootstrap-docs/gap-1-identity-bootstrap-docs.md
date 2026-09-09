# GAP-1 身份自举与系统事件源的文档缺口修复 — 设计文档

```text
status: 已完成
design-round: 3/15
implementation-round: 4/15
current-milestone: M-03
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无
```

## 1. 背景和现状

评审 `agentspace/output/paradigm-gaps-review-2026-08-29.md` §2 GAP-1 判定：按自然键的幂等创建与匿名 / 系统事件源两项能力在 4.10.0 均已存在，剩余的是**文档缺口**。本节记录设计期在当前 HEAD（`0249556`）上对全部关键事实的复核结果；每条附证据来源。

### 1.1 能力事实（已复核，与评审一致）

1. **`Entity.identity` 提供 set-semantic 创建。** 声明期校验在 `normalizeEntityIdentity`（`src/core/Entity.ts:280` 起）；写路径汇合在 `CreationExecutor.createIdentityRecord`（`src/storage/erstorage/CreationExecutor.ts:853` 起，经 `:164` 分派）。冲突方在同一事务内按键查回既有行，不报错、不发 create 事件。`UniqueConstraint` 提供「重复即类型化失败」分支，两者在同一属性集上互斥（声明期报错）。
2. **匿名 / 系统事件源能力已存在。** `src/core/EventSource.ts` 的 `EventSource.create`（`:198`）参数类型完全由调用方决定，不含 user 概念；`:80-82` 的注释将无 user 的事件源称为 anonymous EventSources。事件实体由调用方自建并作为 `entity` 传入。
3. **`Controller.dispatch` 入口不校验 user。** 复核 `src/runtime/Controller.ts:1392` 起的 dispatch 体：入口校验恰为四项——`eventSource` 非空断言、嵌套 dispatch（`NestedDispatchError`）、非业务事务内 dispatch（`DISPATCH_IN_NON_BT_TRANSACTION`）、业务事务已中止（`ABORTED`）。与评审陈述一致。`USER_ENTITY` 常量（`Controller.ts:78`）在 `src/` 内无任何校验消费（全仓 grep 仅此一处定义）。
4. **`Interaction` 的 user 契约是类型层的。** `InteractionEventArgs` 把 `user: EventUser` 声明为必填（`src/builtins/interaction/Interaction.ts:29`），但运行期守卫 `runInteractionGuard` = `checkCondition` + `checkPayload`（`Interaction.ts:327-328`），**没有 user 存在性检查**。最小验证实验（§5.1 探针 P1）证实：无 conditions 的 Interaction 在 args 完全不含 `user` 时 dispatch 成功并驱动 Transform 创建实体。
5. **能力残余三项**（评审要求成文化）：
   - `Relation` 创建面没有 `identity` 参数（`src/core/Relation.ts` 全文无 identity；grep 复核）。
   - filtered / merged 实体声明 identity 在声明期报错（`normalizeEntityIdentity` 内 `context.baseEntity` / `context.inputEntities` 两个 fail-fast 分支，`src/core/Entity.ts:302-312` 附近，定位以符号名为准）。
   - MySQL 在 setup 期 fail-fast（`assertMysqlDoesNotSupportIdentity`，`src/storage/erstorage/Setup.ts:746`，于 `:1010` 调用）。

### 1.2 文档现状盘点（要求 3 / 要求 5 的补缺范围依据）

**「唯一入口 / 测试哲学」矛盾叙述家族**（要求 4）。裁决轮 2 按评审轮 2 问题 1 采纳并按「设计复审条件」末段（同域第二次出现）重建为**结构化成员表**：成员资格谓词 + 全体成员 + 逐成员处置 + 验收锚点，一次固定，后续轮次不再逐句追加。

**成员资格谓词**（可判定；审计按此对任何句子分类）：

- **P 形（入口排他前提）**：句子断言「全部/唯一的数据变化经 Interaction」这一事实（all/only + data/changes + from/through/by Interactions 及其派生形式）。
- **C 形（覆盖率充分性结论）**：句子断言「测 [全] Interaction 即得到充分/完全/自动的覆盖」，以显式的充分性/完全性/自动性量词为标志——`sufficient`、`complete coverage`、`naturally covers`、`automatically covered/tested`、`below 100% after testing all …`、`provides complete coverage`。
- **不属于本家族**：纯规定性测试指令（test through Interactions / must use X / never test … directly），无 P 形事实断言、无 C 形量词。

**成员表 T1（23 处：22 处设计期枚举 + 1 处实现轮 4 语义发现、审计轮 4 回填入表与验收锚点）**。扫描方法与来源（使完整性断言与扫描方法匹配）：

- 模式集（大小写不敏感，允许强调标记等非字母数字字符出现在关键词之间）：`only[^a-z0-9]*(source|way|entry)`、`single[^a-z0-9]*source`、`only interactions`、`all [a-z ]*data`、`source of all data`、`data changes originate`、`derived from interaction`、`through interactions`，**另加 C 形专项**（裁决轮 2 引入，此前缺口）：`sufficient.{0,40}coverage`、`coverage.{0,60}(interaction|eventsource)`、`comprehensive interaction`、`naturally covers`、`automatically (covered|tested|tests? when)`、`provides complete coverage`。当前文本全量命中经逐行裁决后全部归入 T1 或下方保留清单。
- 范围：仓库全部 `*.md` 与 `*.mdc`（评审轮 2 对 `.mdc` 同题扫描无错误方向命中），排除 `node_modules/`、`dist/`、`docs/`（任务协议文件）、`agentspace/output/`（归档）、`prompt/`（历史任务输入，冻结不改写）、`CHANGELOG.md`（不可改写的发布历史）、`.git/`。行号为当前 HEAD 快照，实施与审计以锚点短语定位。

| # | 位置 | 形态 | 处置 | 锚点短语（验收断言旧文消失） |
|---|------|------|------|------|
| 1 | `agent/agentspace/knowledge/usage/01-core-concepts.md:15` | P | 改写节标题 | `Only Interactions Generate Data` |
| 2 | `agent/agentspace/knowledge/usage/01-core-concepts.md:107` | P | 改写 | `the **only source** of data changes` |
| 3 | `agent/agentspace/knowledge/usage/01-core-concepts.md:120` | P | 改写 | `All data changes originate from user Interactions` |
| 4 | `agent/agentspace/knowledge/usage/00-mindset-shift.md:7` | P | 改写节标题 | `Only Interactions Create Data` |
| 5 | `agent/agentspace/knowledge/usage/00-mindset-shift.md:288` | P | 改写 | `Only Interactions can generate new data` |
| 6 | `agent/agentspace/knowledge/usage/05-interactions.md:3` | P | 改写（同句后半 "the source of all data changes" 一并修正） | `the only way users interact with the system` |
| 7 | `agent/agentspace/knowledge/usage/README.md:98` | P | 改写 | `Only Interactions generate data` |
| 8 | `agent/agentspace/knowledge/usage/13-testing.md:166` | P | 改写 | `the ONLY way to execute business logic` |
| 9 | `agent/agentspace/knowledge/usage/13-testing.md:279` | P | 改写测试哲学块前提（见下） | `ALL data is derived from interaction events` |
| 10 | `agent/agentspace/knowledge/usage/13-testing.md:281` | P+C | 前提与同句结论（"naturally covers all data operations"）一并修正 | `created, modified, and deleted through Interactions` |
| 11 | `agent/agentspace/knowledge/generator/basic-interaction-generation.md:76` | P | 改写 | `The ONLY way to create, update, or delete data` |
| 12 | `agent/agentspace/knowledge/generator/test-implementation.md:4` | P+C | 前提与同句结论（"provides complete coverage"）一并修正 | `deletions flow through interactions` |
| 13 | `AGENTS.md:122` | P | 改写 | `the **only source** of data changes in the system` |
| 14 | 根 `README.md:56` | P | 改写**整条 bullet**：锚点短语是加粗标题，但同条第二句 "User interactions are the single source of truth. Everything else is derived." 同属入口排他前提，须一并语义更新（裁决轮 3 依评审轮 3 注意 3 明确，防只改标题留残句） | `Only Interactions create data` |
| 15 | 根 `README.md:361` | P | 改写（概念表 Interaction 行） | `the *only* way new data enters the system` |
| 16 | 根 `README.md:405` | P | 改写（弱形式括号补语；配方指南 21 教匿名 EventSource 创建实体，该句同错，一词成本） | `come into existence (through Interactions)` |
| 17 | `agent/agentspace/knowledge/usage/01-core-concepts.md:19` | P | 改写（派生形式排他，与 :15 同列表姊妹条目） | `All other data are computation results of interaction data` |
| 18 | `agent/agentspace/knowledge/usage/00-mindset-shift.md:289` | P | 改写（同上，与 :288 相邻姊妹条目） | `All other data are "derivatives" of Interaction data` |
| 19 | `agent/agentspace/knowledge/usage/13-testing.md:283` | C | 词级：`automatically tested when you test the Interactions` → EventSources（裁决轮 2 新增；旧模式集无自动性量词、未命中此句） | `automatically tested when you test the Interactions` |
| 20 | `agent/agentspace/knowledge/usage/13-testing.md:285`（含其下两条要点） | C | 结论句改写（"after testing all Interactions" → "after testing all declared EventSources"）；要点词级（`Missing Interaction definitions` → EventSource definitions、`existing Interactions` → existing EventSources）。裁决轮 2 采纳评审轮 2 问题 1：初稿曾裁保留，与 #9/#10/#12 的修正指令（结论句必须改）自相矛盾 | `after testing all Interactions`；要点锚点 `Missing Interaction definitions` |
| 21 | `agent/agentspace/knowledge/usage/13-testing.md:1172` | P+C | 章末总结句：前提（"all data flows from Interactions"）与结论（"sufficient to achieve complete test coverage"、"automatically covered when you test the Interactions"）一并修正。裁决轮 2 采纳评审轮 2 问题 1：初稿误裁为「不含排他前提」 | `all data flows from Interactions`；`sufficient to achieve complete test coverage`；`automatically covered when you test the Interactions` |
| 22 | `agent/agentspace/knowledge/generator/test-implementation.md:11` | C | 词级：justification 从句 "tested through interactions" → "tested through event sources"（与 #19 是孪生块条目——两个测试哲学块的「不做单独实体测试」项，归因于 Interaction 测试的 justification 同根因；裁决轮 2 新增） | `implementation details tested through interactions` |
| 23 | `agent/agentspace/knowledge/usage/01-core-concepts.md:18` | P | 改写（与 #5 同构的插入词变体 "Only **user** interactions can generate new data"——机械模式 `only interactions` 因插入词未命中；实现轮 4 按成员资格谓词发现并修正，审计轮 4 回填入表并补验收锚点，堵住「验收对 :18 回归致盲」的验证缺口） | `Only user interactions can generate new data` |

#9/#10/#12/#19–#22 是「测试哲学」前提-结论链（「所有数据经 Interaction 变化 → 测全 Interaction 即全覆盖 → 无需单独实体测试」）：前提改为「数据变化经 dispatch 的 EventSource（Interaction 是内建面向用户的一种）」，覆盖率结论改为「测全**声明的全部** EventSource」；修正限于前提与结论句本身，不重写章节其余内容（test-implementation.md:9 的 `callInteraction()` 污染属 §1.3 第 2 条独立缺陷，不在本任务修）。

**裁定保留清单**（按谓词裁决为不属本家族；审计对照用，同类合并列举）：

- 纯规定性测试指令（无 P 形事实、无 C 形量词）：`usage/13-testing.md:290/:296`、`usage/19-common-anti-patterns.md:406/:448/:449/:761`、`generator/test-implementation.md:9/:31/:128/:701`。其中 :296/:448/:449/:9 的 `callInteraction()` 污染另行立任务（§1.3.2）。
- 响应式/computation 叙述（数据由 computation 维护，非入口断言）：`usage/05-interactions.md:89/:441`、`usage/04-reactive-computations.md:195/:1107`、`usage/15-entity-crud-patterns.md:3`、`agent/skill/interaqt-patterns.md:319`。
- 需求/前端分析的完备性指令（"all data" 指需求数据，非数据入口）：`agent/.claude/agents/requirements-analysis-handler.md:845/:1352/:1353/:1471/:1479`、`implement-design-handler.md:97`、`frontend-generation-handler.md:48/:90/:331/:416`、`error-check-handler.md:120/:143/:182`。
- 事实正确的排他断言：`agent/.claude/agents/requirements-analysis-handler.md:50`（"Relations are the ONLY way to connect entities"——Relation 确是唯一连接机制）、`usage/18-api-exports-reference.md:248`（"InteractionEventEntity is the only pre-defined entity"——事实正确；裁决轮 3 宽扫描命中后裁定，供审计对照）。
- 无比较量词的叙述（裁决轮 3 宽扫描命中后裁定为非成员，供审计对照）：`usage/05-interactions.md:1527`（"Interactions are the bridge connecting user operations and data changes"）。
- 外部数据/副作用语境：`agent/.claude/agents/implement-integration-handler.md:72/:81/:1369/:1742`、`computation-generation-handler.md:94/:109`、`error-check-handler.md:1129`、`generator/api-reference.md:3522`、`generator/data-analysis.md:240`、`agentspace/prompt/interaqt-interaction-transform-fullscan.md:10/:136`。
- 其它义项/误报：`generator/api-reference.md:1014`、`src/storage/IMPLEMENTATION_DETAILS.md:133`（"single source" 另义项）；`agent/.claude/agents/code-generation-handler.md:162`（payload-only 建议）；`usage/17-performance-optimization.md:15`（性能表述）；根 `README.md:334`（"inst**all the data**base" 子串误报）。

**「框架有 user 校验」误导叙述家族**（要求 2 的反面；全库 grep "user validation" 仅以下两处，已实测）：

| 位置 | 现文 |
|------|------|
| `agent/agentspace/knowledge/generator/api-reference.md:2643` | Interaction "provides pre-built guard (condition checks, **user validation**, payload validation)" |
| `agent/agentspace/knowledge/generator/api-reference.md:3561` | ignoreGuard "bypass all guard checks (conditions, **user validation**, payload validation)" |

运行期不存在 user 校验（§1.1 第 4 条），这两处把不存在的保证写成了框架行为，属同一根因，必须与要求 2 一并修正。

**guard 词汇家族**（与 `admit` 改名漂移同根因）。裁决轮 2 按评审轮 2 问题 2 采纳并按「设计复审条件」末段（同域第二次出现）重建为**结构化成员表**。源码事实：`EventSource.create` 对 legacy guard-only CreateArgs **声明期抛错**（`src/core/EventSource.ts:205-212`；探针 P2 证实抛 `/admit/`；既有回归 `tests/runtime/dispatchIdempotency.spec.ts:503`）。权威 CreateArgs 为 `name, entity, admit?, open?, mapEventData?, resolve?, afterDispatch?, postCommit?, idempotency?, idempotencyInteractionKey?`（`EventSourceCreateArgs`，`EventSource.ts:84-95`）；实例属性 `guard` 为 `admit` 的弃用别名（`EventSource.ts:48-52` `@deprecated`，同引用；`Interaction.ts:196` `instance.guard = admit`）；dispatch 权威管线为 admit/open（`Controller.ts:1609-1617` 缺 `admit` 即报错）。

**成员资格谓词**（可判定）：

- **A 形**：在 `EventSource.create` CreateArgs 的教学面（参数说明、签名、示例、Key Points）使用 `guard` 键——照抄即声明期抛错，与要求 1 配方直接矛盾。
- **B 形**：以 `guard` 指称现名 `admit` 的准入阶段（dispatch 管线描述、阶段/回调清单、错误包装描述），或把弃用名作为主名教学。词级修正，不重写句子结构。
- **合法**：(i) 真实 API 名 `ignoreGuard` / `InteractionGuardError` 及其直接释义；(ii) 「guard 是弃用别名」的提及且现名在前；(iii) "the single guard concept" 指 Condition（`Interaction.ts:317-319` "Conditions are the only guard concept"）；(iv) 泛英语义（不变式/校验点）；(v) 历史记录与冻结输入。

**成员表 T2（完整；范围 = 仓库全部 `*.md` + `*.mdc`，排除 `node_modules/`、`dist/`、`docs/`、`agentspace/output/`、`prompt/`（冻结任务输入）、`CHANGELOG.md`（不可改写历史）、`.git/`。`\bguard\b` 全量扫描 **33 行**，逐行分类 = T2 18 行 + 合法清单 15 行，无未分类残留。裁决轮 3 逐行对账核平 33 = 18 + 15；裁决轮 2 表头曾记「27 处」，为计数误差，以本轮对账为准）**：

| # | 位置 | 形态 | 处置 | 锚点/命令 |
|---|------|------|------|------|
| A1 | `generator/api-reference.md:549` | `config.guard` 参数说明 | 键改为 `admit`，注明 legacy `guard` 键声明期抛错 | 命令 (2) 冒号形 grep |
| A2 | `generator/api-reference.md:573` | 签名 `guard?:` | 同上 | 命令 (2) |
| A3 | `generator/api-reference.md:597` | 示例 `guard: async function` | 同上 | 命令 (2) |
| A4 | `generator/api-reference.md:642` | 示例 `guard: async function` | 同上 | 命令 (2) |
| A5 | `generator/api-reference.md:669` | Key Point "`guard` runs before event processing" | 改 `admit` | 命令 (3) 锚点 |
| A6 | `generator/api-reference.md:674` | "provides pre-built `guard`, `mapEventData`, and `resolve`" | 改 `admit` | 命令 (3) 锚点 |
| A7 | `generator/api-reference.md:4496` | `EventSourceInstance` 类型签名 `guard?:` | 改 `admit?:`（并按权威 CreateArgs 补 `open?`） | 命令 (2) |
| A8 | `agent/skill/interaqt-reference.md:594` | 紧凑签名参考 `guard?:`（无 `admit`、缺 `open?`）；该文件自述 "Compact lookup for API signatures"，被照抄概率不低于 generator 指南（裁决轮 1 裁定纳入） | 改 `admit?:` 并补 `open?` | 命令 (2) |
| B1 | `generator/api-reference.md:3547` | dispatch 管线 "(guard → event record → resolve → sync computations)"，与 `usage/14-api-reference.md:1432` 权威管线矛盾 | 对齐权威管线 admit → open? → map → create → resolve → afterDispatch | 命令 (3) 锚点 |
| B2 | `generator/api-reference.md:4271` | "fails (guard, resolve, computation)" | 词级 `guard` → `admit` | 命令 (3) 锚点 |
| B3 | `generator/api-reference.md:2643` | "pre-built guard (condition checks, user validation, payload validation)" | 随 M-02 的 user-validation 改写一并处理（"pre-built admit"），见 §3.2 | M-02 命令 |
| B4 | `usage/05-interactions.md:30` | retry-safe 回调清单项 `` - `guard` `` | 词级 `` `admit` `` | 命令 (3) 锚点 |
| B5 | `usage/04-reactive-computations.md:97` | "`guard`, `mapEventData`, `resolve` … retry-safe" | 词级 `admit` | 命令 (3) 锚点 |
| B6 | `usage/20-postgresql-concurrency-migration.md:19` | 回放规则清单项 `` - `guard` `` | 词级 `` `admit` `` | 命令 (3) 锚点 |
| B7 | `generator/test-implementation.md:321` | "wrap **guard** and most domain failures in `result.error`"——dispatch 错误包装句中的阶段词（裁决轮 2 采纳评审轮 2 问题 2；同句 `callInteraction` 污染属 §1.3.2 不顺带重写） | 词级 `guard` → `admit` | 命令 (3) 锚点 |
| B8 | 根 `README.md:66` | "runs guard checks, `mapEventData`, …"（dispatch 管线阶段词；裁决轮 2 新增——评审轮 2 的「全量枚举」亦漏此处） | 词级 "runs guard checks" → "runs admit checks" | 命令 (3) 锚点 |
| B9 | 根 `README.md:76` | 表格行 `` `guard` / `mapEventData` / `resolve` ``（裁决轮 2 新增，同上） | 词级 `` `admit` `` | 命令 (3) 锚点 |
| B10 | `.cursor/rules/runtime-controller.mdc:44` | "`guard(args)` / `admit`"——弃用名以签名形式列为主名（裁决轮 2 新增；`.mdc` 为活规则文件，纳入扫描范围） | 调序并标注弃用："`admit(args)`（legacy alias `guard`）" | 命令 (3) 锚点 |

**合法清单**（供审计对照；按谓词分组）：

- 真实 API 名及释义（谓词 i）：`ignoreGuard` 选项（`Controller.ts:284/:413`；`usage/18-api-exports-reference.md:84`；`.cursor/rules/runtime-controller.mdc:21` 注释 "skip guard checks" 直接释义 `ignoreGuard` 选项名）；`InteractionGuardError`；`generator/api-reference.md:3561` ignoreGuard 释义句中的 "guard checks"（M-02 只移除其中的 "user validation"，释义合法保留）；裁决轮 3 补记的同类释义行 `generator/api-reference.md:3365`（`ignoreGuard?: boolean, // Skip guard checks when true`）、`:3378`（ignoreGuard 参数说明）、`agent/skill/interaqt-reference.md:415`（同为 ignoreGuard 注释）——三行均为 `\bguard\b` 命中行，补入后合法清单按行对账 15 行。
- 弃用别名提及且现名在前（谓词 ii）：`.cursor/rules/runtime-controller.mdc:27`（"Admit / guard"）。
- "the single guard concept" 指 Condition（谓词 iii；`Interaction.ts:317-319`）：`generator/api-reference.md:3164`、`usage/14:1326`、`usage/06:14`。
- 泛英语义（谓词 iv）：`AGENTS.md:247/:256/:257`（declaration-time guard / 不变式 / choke point）、`.cursor/rules/interaqt-project.mdc:57`、`usage/19:671`（示例注释 "in the guard" 泛指准入回调；两轮独立裁决均为合法，本任务不改）。另注（裁决轮 3）：`usage/06:68`（"`dataPolicy.match` guards an entity"，动词屈折）与 `usage/11:171`（"create guards"，复数名词，指 `Dictionary.create` 声明期校验）经核原文确为泛英语义、合法，但屈折形式不是 `\bguard\b` 扫描的命中行，对账时不计入 33 行。
- 历史记录与冻结输入（谓词 v）：`CHANGELOG.md` 各历史条目（如 :292，不可改写）；`prompt/condition-admission-and-tx-visibility.md:13`（历史任务需求摘要，自述「只读参考」，与 `agentspace/output/` 同类冻结）。

**EventSource 文档现状**：usage 指南（00–20）中没有任何 `EventSource.create` / anonymous 事件源内容（复核与任务背景一致）。generator `api-reference.md` §13.2 与 `agent/skill/interaqt-reference.md` 的 guard 形态即上表家族 A——照抄即抛错，属要求 4「与配方矛盾的叙述」范围。

**能力残余三项的现有覆盖**（要求 3 盘点结果）：

| 残余 | 已有覆盖 | 缺口 |
|------|----------|------|
| Relation 无 identity | `usage/03-entity-relations.md:76`（"Relations cannot declare identity"，并引 02）。（裁决轮 1 更正：初稿曾把 `usage/19-common-anti-patterns.md:516` 列为覆盖，该节实际讲自然键与逻辑 `id` 的区别，不覆盖「`Relation.create` 无 identity 参数」——引用修正，缺口结论不变） | 权威定义位置 `usage/02-define-entities-properties.md:388` 的残余清单句只列了 filtered/merged 与 MySQL，未列 Relation — **补一句** |
| filtered / merged 不得声明 identity | `usage/02:388`、`usage/14-api-reference.md:23`、`AGENTS.md`（Entity.identity 段） | 无缺口 |
| MySQL setup fail-fast | `usage/02:388`、`usage/14:23`、`generator/api-reference.md:1713`、`AGENTS.md` | 无缺口 |

权威位置定为 `usage/02-define-entities-properties.md` §"UniqueConstraint vs Entity.identity"（已是最完整的一处），其余位置保持引用。

**观察路径判别两步法的现有覆盖**（要求 5 盘点结果）：`usage/15-entity-crud-patterns.md:1228-1237` 已有完整判别表（`effects` 中有无 create 事件 + 提交后按键查询，六种结果代数）；`generator/api-reference.md:1709` 有生成规则。**判定：已有正式覆盖，按要求 5 只需在新配方指南中补交叉引用**，不重复定义。

### 1.3 对任务背景与评审的事实更正 / 补充

1. 任务画像 §6 称 `src/runtime/computations/Transform.ts` 存在硬失败守卫 `assertNoIdInTransformedRecord`、且 `computation-implementation.md` / `19-common-anti-patterns.md` / generator `api-reference.md` 有 "NEVER include id" 表述、`review-fixes-2026-07-10-r13.spec.ts` 断言顶层 id 必须抛错——**在当前 HEAD 均已不成立**：Transform 顶层 id 现为合法（`Transform.ts:13-16` 注释；r13 spec F-3 测试组现断言「碰撞才 fail-loud、显式唯一 id 合法」），相应文档矛盾已被此前工作清除（grep 无命中）。本任务无需处理。
2. 设计期新发现（记录，**不扩大实现范围**）：usage 指南多处教授 `controller.callInteraction(name, args)`（`05-interactions.md:1251` 明言其存在；`13-testing.md` 24 处使用），以及 `Controller` 构造参数 `interactions:` / `activities:`（`13-testing.md:348-351` 等）。当前 `Controller` 上**不存在** `callInteraction`（全仓 grep 零命中；探针 P4 证实实例上为 `undefined`），`ControllerOptions` 也不含 `interactions` / `activities` 键（`Controller.ts:274-291`），Interaction 经 `eventSources` 注册。这是与本任务不同根因（API 移除后文档未同步）的独立文档缺陷，波及面大，修复应另立任务。裁决轮 1 更正污染面实测计数：`agent/agentspace/knowledge/` 下 9 个文件（usage 05/07/13/14/15/19 + generator api-reference / test-implementation / permission-test-implementation），另有 `agent/skill/`（2）、`agent/.claude/agents/`（4）、`agentspace/knowledge|challenge/`（3）；另立任务时范围按此确定。本任务内的处理边界不变：新增与修改的文本一律使用 `controller.dispatch` + `eventSources`，不复制受污染示例；对必须触碰的行（如 `13-testing.md:166` 的叙述句、`generator/test-implementation.md:4` 的前提句）只改叙述、不顺带重写周边示例。

### 1.4 评审基准与行号漂移

评审基准 `94a9194`、任务生成工作树 `0249556`、当前 HEAD `0249556` 一致（`git log` 复核：`0249556` 即评审文档入库提交）。任务背景所引行号在当前 HEAD 上全部复核通过（§1.1）。

### 1.5 裁决轮 1 记录（评审问题逐条核验）

评审文件：`gap-1-identity-bootstrap-docs-review.md`，结论「需要修订」，提出 2 个需要复审的问题。裁决者未直接接受结论，逐条独立复核（读源码、跑 grep、执行判别实验）：

1. **问题 1（「唯一入口」家族清单不完整 + M-03 验收 grep 弱于清单）——采纳，类别 1 成立。**
   - 复核证据：评审新增 4 处命中全部实测存在（`13-testing.md:279`——评审写 :278，实测行号 279，内容一致、以锚点定位；`:281`；`generator/test-implementation.md:4`；`README.md:361`）；`README.md:405` 裁定**纳入**（弱形式派生句，与 :56/:361 同错、修正成本一词）。初稿验收 grep 弱于清单经实测复现：模式 1 命中 2 处、模式 2 命中 4 处，合并 6/11，清单 5 处（01-core:107/:120、05:3、usage/README:98、AGENTS.md:122）保持原文不动时验收仍绿。
   - 修正（本轮已完成）：家族清单以更宽模式重扫重建为 18 处（评审 4 处 + README:405 裁定纳入 + 宽模式另行发现的 2 处派生形式 01-core:19、00-mindset:289）；扫描模式与范围记录于 §1.2；全部 65 行扫描命中逐行裁决（家族 18 或裁定保留）。M-03 验收重构为「枚举清单即验收工件」：18+7=25 个锚点断言旧文消失（判别力 25/25 RED 实测，探针 P5）+ 宽模式辅助筛查（基线 65 行已裁决）。
2. **问题 2（guard 家族检查范围漏 `agent/skill/interaqt-reference.md`）——采纳，类别 1 成立。**
   - 复核证据：`agent/skill/interaqt-reference.md:594` 实测教 `guard?:` 签名（无 `admit`）；`src/core/EventSource.ts:206-212` 对 guard-only CreateArgs 声明期抛错实测在源；初稿扫描范围与 M-03 验收均只指向 generator `api-reference.md`，而结果陈述称「全库扫描无 guard: EventSource 示例」——范围与结果不一致。
   - 修正（本轮已完成）：按评审给出的选项 1 纳入修正范围（理由：该文件自述签名查询参考、被照抄概率不低于 generator 指南，初稿纳入判据同样成立）；同一根因检查扩展为完整 guard 词汇家族——家族 A（EventSource.create 教学面 8 处：generator 7 + skill 1）+ 家族 B（弃用阶段词汇 5 处：api-reference:3547/:4271、usage/05:30、usage/04:97、usage/20:19，词级修正），合法 guard 用语（ignoreGuard、InteractionGuardError、"single guard concept" 指 Condition 等）逐条记录于 §1.2；验收命令 (2)(3) 覆盖两个文件并声明期望输出（空 / 锚点消失）。
3. **评审「实现注意事项」采纳情况**：注意 1（19:516 不构成覆盖）——采纳，§1.2 覆盖表已更正；注意 2（callInteraction 污染面 9 文件）——采纳，§1.3.2 计数已更正，边界规则不变；注意 3（`test $? -eq 1` 的 shell 形式）——采纳，M-02 验收改 `! grep -q` 并补 `pre-built guard` 断言；注意 4（05:30 术语对齐）——采纳并扩展为家族 B 完整枚举；注意 5（WritingComputationTests 注册表自查）——采纳，写入 M-01 实现注记；注意 6（guard grep 期望输出）——采纳，命令 (2) 期望空。

两项采纳均属「同类枚举不完整」同一根因；本轮已按根因把两个家族的同类检查范围一次枚举完整并重建验收。

### 1.6 裁决轮 2 记录（评审轮 2 问题逐条核验）

评审轮 2 结论「需要修订」，提出 2 个需要复审的问题。裁决者未直接接受结论，逐条独立复核（读原文、跑独立扫描、执行判别实验），并按「设计复审条件」末段处理同域第二次出现：

1. **问题 1（`:1172` / `:285` 被误裁保留，M-03 验收对违反要求 4 的终态保持绿）——采纳，类别 1 成立（并构成类别 2 内部矛盾）。**
   - 复核证据：`:1172` 原文实测含排他前提 `all data flows from Interactions` 与结论 `sufficient to achieve complete test coverage`、`automatically covered when you test the Interactions`——初稿裁为「不含排他前提」与原文不符；`:285` 是「测全 Interaction 即全覆盖」结论句本身，而初稿对 #9/#10/#12 的修正指令明言「覆盖率结论必须改为『测全声明的全部 EventSource』」，保留裁定与修正指令互相冲突；M-03 命令 (1) 的 18 锚点不含此两处（逐行核对 heredoc），且命令 (4) 修正后仍会命中 `:1172`（`all data flows` 命中 `all [a-z ]*data`）而保留清单指示放行——验收致盲成立。
   - **超出评审枚举的同类成员（独立扫描发现，评审成员表亦不全）**：`13-testing.md:283`（"automatically tested when you test the Interactions that use them"——评审模式 `automatically (covered|tests? when)` 不匹配 `tested`，漏检）；`generator/test-implementation.md:11`（"implementation details tested through interactions"——与 `:283` 是两个测试哲学块的孪生「不做单独实体测试」justification 从句，同根因归因）。另核实评审裁为正确的 `:290`、`generator:9/:31/:701`、`19:406/:448/:449/:761` 确为纯规定性指令（无 P 形事实、无 C 形量词），维持保留。
   - 修正（本轮已完成）：家族重建为成员表 **T1（22 处）**，含成员资格谓词（P 形 / C 形 / 纯规定性三分类）；C 形量词专项模式并入扫描方法；M-03 命令 (1) 扩为 25 锚点、新增 C 形辅助筛查（命令 4b，剩余命中须逐条裁决为「充分性归因于全部 EventSource 的修正后陈述」）。
2. **问题 2（guard 家族 B 漏 `generator/test-implementation.md:321`）——采纳，类别 1 成立。**
   - 复核证据：`:321` 原文实测 "Top-level `dispatch` / `callInteraction` wrap **guard** and most domain failures…"，`guard` 为 dispatch 错误包装句中的阶段词，与已入家族 B 的 `api-reference.md:4271` 同形同义；M-03 命令 (3) 无对应锚点。
   - **超出评审枚举的同类成员（评审「全量 `\bguard\b` 扫描…全部残留即此一处」的完整性断言本身不实）**：根 `README.md:66`（"runs guard checks, `mapEventData`, …"）、根 `README.md:76`（表格行 `` `guard` / `mapEventData` / `resolve` ``）、`.cursor/rules/runtime-controller.mdc:44`（"`guard(args)` / `admit`"——弃用名以签名形式列为主名）。评审枚举范围为 `*.md` 且未含 `.mdc`；裁决轮把扫描范围扩为 `*.md` + `*.mdc` 并对全部 27 处 `\bguard\b` 命中逐行分类，无未分类残留。
   - 修正（本轮已完成）：家族重建为成员表 **T2（A 8 处 + B 10 处 + 合法清单）**，含成员资格谓词（A 形 / B 形 / 合法五类）；M-03 命令 (2) 改为全库 `! grep` 形式、命令 (3) 扩为 11 锚点。
3. **同域第二次出现的处理**：两域均为裁决轮 1 已出现设计领域的第二次（轮 1 问题 1 → 入口/测试哲学家族；轮 1 问题 2 → guard 词汇家族），按「设计复审条件」末段不再逐句补充，改用结构化成员表（T1/T2）+ 可判定成员资格谓词一次固定全部成员及处置，验收锚点从成员表机械导出。
4. **评审轮 2「实现注意事项」采纳情况**：注意 1（M-02 `grep -c` 判别力弱）——采纳，M-02 验收改为逐关键词 `grep -q` 串联断言；注意 2（M-01 实现要点：payload 需声明 Payload/PayloadItem、Transform 监听须用 `InteractionEventEntity.name`、实体名复用须 `clearAllInstances`）——采纳，写入 M-01 实现注记；注意 3（命令 (2) 退出码语义）——采纳，改 `! grep … | grep -v …` 形式；注意 4（`19:671` 顺手对齐）——不采纳「可选对齐」表述，裁定为合法清单成员、本任务不触碰（消除审计的模糊裁量）；注意 5（CHANGELOG 历史条目排除）——采纳，写入 T2 扫描范围。

两项采纳仍属「同类枚举不完整」同一根因（且两轮评审自身的枚举也各自不全），本轮以谓词 + 全量分类表收敛该根因。

### 1.7 裁决轮 3 记录（评审轮 3 结论「通过」的独立复核）

评审轮 3 结论「通过」，未提出任何需要复审的问题。裁决者未直接接受该结论，对评审的设计事实复核记录逐项独立重验，并自行执行六类条件检查：

1. **事实复核重验**：§1.1 全部源码事实（EventSourceCreateArgs 字段、legacy guard-only 声明期抛错、dispatch 四项入口校验、`USER_ENTITY` 无校验消费、`runInteractionGuard` 无 user 检查、`normalizeEntityIdentity` 两分支、Relation 无 identity、MySQL fail-fast、`createIdentityRecord`）亲自读源码核实；Transform 顶层 id 注释与 r13 spec F-3 三测试核实；基线三件套复跑 95/95 通过。
2. **验收判别力复现**：对未修正文本重跑 M-03 命令 (1)(2)(3)——T1 25/25 RED、T2 11/11 RED、冒号形签名恰 6 处；M-02 锚点（`user validation` 2 处、`pre-built guard` 1 处、usage/02 Relation 句缺失、README 路径缺失）全部应红。与探针 P5/P6 记录一致。
3. **裁决者独立完备性扫描**（模式变体为此前两轮评审与设计均未使用）：排他措辞变体（exclusively through / must go through / no other way / sole / only entry|channel|mechanism / data enters|originates / enters the system through）、覆盖率变体（100% / full coverage / no need to test / implicitly / complete coverage）、guard 屈折（guards / guarded / guarding）。全部命中逐条裁决：或为 T1/T2 已列成员，或在保留清单，或为已核实非成员（`frontend-generation-handler.md:89` 前端需求完备性指令、`usage/02:166` Property 类型扩展域、`usage/11:171` Dictionary.create 声明期校验泛称、`usage/04:1295` "Guarding Transitions" 节教 StateTransfer 无 condition 字段、`README.md:374` Condition Guards）。未发现 T1 ∪ T2 ∪ 保留清单之外的家族成员；C 形辅助筛查（命令 4b）当前 5 处命中逐条对应 T1 成员（13-testing :281/:283/:285/:1172、generator test-implementation :4）。
4. **T2 记账对账与更正**：活范围 `\bguard\b` 全量 33 行逐行列出并分类——T2 18 行（A1–A8、B1–B10 各一行）+ 合法 15 行核平。裁决轮 2 表头「27 处」为计数误差，已更正；评审轮 3 注意 1 指出的 3 处合法未列行（api-reference:3365/:3378、skill:415，均为谓词 i 的 ignoreGuard 释义）已补入合法清单；`usage/06:68` / `usage/11:171` 屈折形式已注明不计入 33 行。
5. **评审轮 3「实现注意事项」采纳情况**：注意 1（T2 合法清单记账 + 33 行对账）——采纳，见上；注意 2（命令 (4) 基线 64 非 65）——采纳，实测 64，已更正命令注释；注意 3（README:56 整条 bullet 含第二句 "single source of truth" 一并改写）——采纳，已写入 T1 #14 处置；注意 4（M-01 payload 混淆项已被评审探针复现）——已在 M-01 实现注记中，无需新增；注意 5（`usage/18:248`、`usage/05:1527` 已核实非成员）——采纳，补入 §1.2 保留清单供审计对照。
6. **结论**：评审「通过」成立，本轮零采纳需要复审的问题。按裁决分支规则进入设计通过分支：`status: 实现中`，N = 5 × 3 = 15。

## 2. 目标与非目标

### 目标（对应 Task 要求编号）

- **R1** 系统 / 匿名事件源正式配方进入 usage 知识库：自建事件实体 + `EventSource.create` + 自定义 `admit`，含至少一个无主体场景的完整可运行示例，说明与 `Interaction` 的分工；配方中每个代码形态由可运行测试钉住（优先引用既有测试，缺口新增）。
- **R2** 成文化「无框架级 user 闸门」：`Controller.dispatch` 入口不校验 user；对 Interaction 而言拦住匿名调用的只有用户自己声明的 Condition。同步清除「framework 提供 user validation」的误导表述（§1.2 第二家族）。
- **R3** 能力残余三项显式说明：按 §1.2 盘点，只补 `usage/02` 的 Relation 一句，其余确认引用链完整。
- **R4** 「唯一入口」叙述一致化：按 §1.2 成员表 **T1（22 处：P 形入口排他 + C 形覆盖率充分性）**逐处修正为「数据变化的唯一入口是经 `Controller.dispatch` 触发的 EventSource；Interaction 是内建的、面向用户交互的 EventSource」；同时按成员表 **T2** 修正 guard 词汇家族 A（EventSource.create 教学面，8 处，含 `agent/skill/interaqt-reference.md:594`）与家族 B（弃用阶段词汇，10 处，词级修正，含根 README 两处与 `.cursor/rules` 一处）——均与配方直接矛盾或与既有权威管线口径矛盾。
- **R5** 观察路径判别两步法：已有正式覆盖（`usage/15`），新配方指南补交叉引用。
- **R6** 范围边界：`src/` 零改动；不建 `DispatchResponse` 解析结果通道。

### 非目标

- 不修复 §1.3 第 2 条的 `callInteraction` / `interactions:` 文档缺陷（另立任务；本任务只保证自己新增/修改的文本不复制该错误）。
- 不重写 `13-testing.md` / `05-interactions.md` 的既有示例集。
- 不新增框架 API、运行时行为、迁移或存储改动。

## 3. 方案

### 3.1 新配方指南 `agent/agentspace/knowledge/usage/21-system-event-sources.md`（R1、R2、R5）

英文正文，遵循 usage 指南既有结构。内容骨架：

1. **When Interaction is not the right shape**——无主体入口（注册、验证码签发、合作方开通、定时任务、webhook）的问题陈述；明确 `Interaction` 的契约包含 user（类型层）与 payload 校验，而这些场景没有已认证主体。
2. **The recipe**：自建事件实体（调用方定义的普通 Entity）+ `EventSource.create({ name, entity, admit, mapEventData, resolve? })` + `Controller` 经 `eventSources` 注册 + `controller.dispatch(source, args)`。完整可运行示例采用**合作方开通（partner provisioning）**场景：匿名 EventSource 承载开通请求 → Transform（`eventDeps` 监听事件实体 create）派生 `Partner` 实体 → `Partner` 声明 `Entity.identity`（按 `code`）使重复开通 set-semantic 收敛。该链路已由探针 P3 端到端验证。
3. **Division of labor vs Interaction**：Interaction = 内建的、面向用户交互的 EventSource（预置 conditions/payload 校验、事件实体 `_Interaction_`）；自建 EventSource = 其余一切事件形态，校验完全由自定义 `admit` 承担（抛错即拒绝、事务回滚）。
4. **No framework-level user gate**（R2 的权威定义位置之一，与 05/06 的表述互相引用）：dispatch 入口四项校验清单、无 user 校验；Interaction 的 `user` 必填只是类型契约；拦截匿名调用的只有自声明 Condition。
5. **Insert vs observe**：两步判别法交叉引用 `15-entity-crud-patterns.md` 的判别表（R5），配方内只给最小示例（`effects` 过滤 create 事件 + 提交后按键 `storage.findOne`）。
6. 结尾 cross-references（02 identity、05 interactions、06 conditions、15 occupancy、13 testing）。

指南中出现的每个代码形态与钉住测试的映射表（写入指南末尾或设计文档保留均可，实现时定稿）：

| 配方代码形态 | 钉住测试 |
|--------------|----------|
| 自建事件实体 + `EventSource.create` + `mapEventData` + Transform eventDeps 派生 | 既有 `tests/runtime/eventSource.spec.ts`（"should dispatch a custom event source and trigger computation"） |
| 自定义 `admit` 拒绝 + 事务回滚 | 既有 `tests/runtime/eventSource.spec.ts`（admit 校验、rollback 两测试） |
| `resolve` 返回数据 | 既有 `tests/runtime/eventSource.spec.ts` |
| 匿名 EventSource → Transform → identity 实体 set-semantic 收敛 + effects 判别 | **新增** `tests/runtime/systemEventSourceRecipe.spec.ts`（探针 P3 成形） |
| 无 conditions 的 Interaction 在 args 无 `user` 时 dispatch 成功（无框架 user 闸门） | **新增** 同一 spec（探针 P1 成形） |
| 声明 Condition 读 `event.user` 后匿名调用被拒（对照组：闸门只来自 Condition） | **新增** 同一 spec |
| legacy `guard:` 键声明期抛错（配方用 `admit` 的反向锚点） | 既有 `tests/runtime/dispatchIdempotency.spec.ts:503`（引用，不重复） |

### 3.2 「无框架级 user 闸门」成文化（R2）

- `usage/05-interactions.md` §"Important Note: About User Identity"：追加明确段落——框架在 `Controller.dispatch` 入口不校验 user；`user` 必填是 `InteractionEventArgs` 的 TypeScript 契约，运行期唯一能拒绝匿名调用的是你声明的 Condition；引用 21 与 06。
- `usage/06-attributive-permissions.md` §"Contract"：补一条契约要点（同一事实，一句 + 引用 05/21，避免重复定义；权威完整表述放 05）。
- 修正 `generator/api-reference.md:2643`、`:3561` 的 "user validation" 为实际行为（condition checks、payload validation）。`:2643` 的 "pre-built guard" 同句改为 "pre-built admit"（guard 家族 B 协调项，一次改写同时消两处误导）。

### 3.3 能力残余与判别配方（R3、R5）

- `usage/02-define-entities-properties.md:388` 残余清单句补 "Relations cannot declare identity（`Relation.create` has no identity parameter）"；该处保持权威定义，03/14/19/generator 处核对引用不动。
- R5 不新增定义，21 指南交叉引用 `usage/15` 判别表（§3.1 第 5 点）。

### 3.4 「唯一入口」叙述一次性修正（R4）

按 §1.2 成员表 T1（22 处）逐处改写。统一措辞基准（按上下文微调，不逐句复制）：

> The only entry point for data changes is an EventSource dispatched through `Controller.dispatch`. `Interaction` is the built-in, user-facing EventSource; custom EventSources (see usage 21) cover system / anonymous entries. Data is still never written imperatively — every change flows from a dispatched event through computations.

教学重心保持不变：反对命令式写数据；修正的只是「Interaction = 唯一」的排他断言。#9/#10/#12/#19–#22（测试哲学前提-结论链）按 §1.2 T1 的逐成员处置修正前提与覆盖率结论（C 形结论一律改为「测全声明的全部 EventSource」），其余指导内容不动。

guard 家族修正（同轮一次完成，全部以 §1.2 成员表 T2 为准）：

- **家族 A（A1–A8，8 处）**：`guard` 键/签名/示例/Key Points 全部改为 `admit`，并注明 legacy `guard` 键在 `EventSource.create` 声明期抛错；`agent/skill/interaqt-reference.md:594`（A8）与 `api-reference.md:4496`（A7）的签名与权威 `EventSourceCreateArgs`（`EventSource.ts:84-95`）对齐（补 `open?`）。
- **家族 B（B1–B10，10 处，词级）**：B1 管线描述对齐 `usage/14:1432` 权威管线（admit → open? → map → create → resolve → afterDispatch）；B2/B4/B5/B6/B7 阶段/回调/错误包装清单项 `guard` → `admit`；B8 "runs guard checks" → "runs admit checks"；B9 `` `guard` `` → `` `admit` ``；B10 调序为 "`admit(args)`（legacy alias `guard`）"。B3 随 M-02 的 user-validation 改写一并处理（§3.2）。同句 `callInteraction`（B7）属 §1.3.2 另立任务缺陷，不顺带重写。

### 3.5 交叉引用同步

`usage/README.md` 学习路径追加第 22 项（21-system-event-sources.md）；核对 02/05/06/15/21 间引用闭合（任务说明第 6 条）。

### 关键决策及理由

1. **新指南（21）而不是塞进 05 或 14**：R1 要求「正式配方 + 完整可运行示例 + 分工说明」，体量与 15（occupancy 配方）同级；05 已 1400+ 行且被 callInteraction 污染（§1.3），塞入会扩大触碰面。
2. **generator §13.2 的 guard 修正划入本任务**：它与配方形态直接矛盾且照抄即抛错，属 R4「与配方矛盾的表述」同根因；不修则知识库在任务完成后仍自相矛盾。
3. **callInteraction 缺陷不修**：不同根因、波及面大，修复会使本任务膨胀数倍；已在 §1.3 记录并建议另立任务（符合任务说明「不扩大实现范围」）。
4. **一个新 spec 而不是分散**：三个新形态锚点同属配方叙事，集中在 `tests/runtime/systemEventSourceRecipe.spec.ts` 便于指南按名引用；按 `AGENTS.md` § Testing（PGLiteDB、dispatch、显式 attributeQuery、`await controller.setup(true)`）。

## 4. 里程碑

### M-01 配方测试锚点

- **状态**：已完成（审计轮 1 独立复验通过：验收命令 4 files / 98 tests、`npm run check`、全套 runtime 1301 passed 无回归；§3.1 映射表逐形态对账属实；缺陷注入（删除 identity 声明）证实形态 (a) 判别力后在判别断言处转红、还原后复绿；无实现缺陷、无验证缺口）
- **结果**：`tests/runtime/systemEventSourceRecipe.spec.ts` 存在并通过，钉住 §3.1 表中三个「新增」形态：(a) 匿名 EventSource → Transform → identity 实体收敛 + effects/查询判别；(b) 无 conditions 的 Interaction 无 `user` dispatch 成功；(c) 读 `event.user` 的 Condition 拒绝匿名调用（负向对照）。既有测试（eventSource / applicationIdentity / dispatchIdempotency 引用项）保持通过。
- **覆盖 Task 要求**：R1（测试钉住）、R2（行为锚点）、R5（判别行为锚点）、R6（仅新增测试）。
- **前置里程碑**：无。
- **reopen-count**: 0；**reopen-domains**: {}
- **验收命令**：
  ```bash
  npx vitest run tests/runtime/systemEventSourceRecipe.spec.ts tests/runtime/eventSource.spec.ts tests/runtime/applicationIdentity.spec.ts tests/runtime/dispatchIdempotency.spec.ts
  ```
- **最新证据**（实现轮 1，2026-08-30）：
  - 验收命令通过：4 files / 98 tests 全部通过（基线三件套 95 + 新增 3），本工作树、PGLite。
  - 新 spec 形态与 §3.1 表逐项对应：(a) 合作方开通场景——`provisionPartner` 匿名 EventSource（自定义 admit 拒空 code 并回滚）→ `RecipePartner`（`identity: byCode`）经 Transform eventDeps 派生；同键二次 dispatch 无 error、无目标 create 事件、行保留首写 payload（`requestedBy` 判别「实插 vs 观察」两步法：effects 过滤 + 提交后按 `code` 查询）；异键三次 dispatch 正常插入；事件行每次 dispatch 各自落盘（3 条）。(b) `RecordSignup` 无 conditions、声明 Payload/PayloadItem，args 完全不含 `user` dispatch 成功并驱动 Transform 创建 `RecipeSignupLog`；`_Interaction_` 事件行的 `user` 字段为 undefined。(c) `UpdateProfile` 的 Condition `requireSignedIn` 读 `event.user?.id`，匿名调用以 `InteractionGuardError`（`code: 'AUTH_REQUIRED'`、`conditionName: 'requireSignedIn'`）拒绝且事务回滚（0 条事件行）；同一 Interaction 带 user dispatch 成功（1 条事件行）——闸门只来自 Condition 的正反对照。
  - 项目基础检查：`npm run check`（tsc --noEmit）通过，无新增失败。
  - 维度注册表自查（按实现注记要求）：已查阅 `tests/runtime/WritingComputationTests.md` 注册表。新 spec 非维度矩阵（钉配方代码形态），其形态全部落在既有轴上——计算轨道轴（(a) 事件驱动 eventDeps / (b) 数据驱动 record dep 各一格）、观察面轴（查询面 + 事件面 effects，(a) 两面兼用）、「视图 × 写形态」轴已登记的 identity 逻辑创建格（配方刻意用无关系最小形态，merged-link 补丁格不在教学面）。无新增声明面读者，**无新维度需补登**。
- **实现注记**：新增 spec 虽非维度矩阵，实现轮须按 `tests/runtime/WritingComputationTests.md` 注册表口径自查一遍形态覆盖；无新增维度时在里程碑证据中记录「已查阅、无新维度」，有新维度则补登注册表。形态 (b)/(c) 的实现要点（评审轮 2 实测）：args 传 payload 时必须声明对应 `Payload`/`PayloadItem`，否则 `checkPayload` 以 `InteractionGuardError` 拒绝（与 user 无关，勿误判为闸门）；Transform 监听内建事件实体必须用 `InteractionEventEntity.name`（写错名字会在 `setup(true)` 撞 dead-listener 不变量）；同文件复用实体名时参照 `dispatchIdempotency.spec.ts` 的 `beforeEach(clearAllInstances)`。

### M-02 配方指南与 user 闸门成文化

- **状态**：已完成（审计轮 3 独立复验通过：全套验收命令（含实现轮 3 并入的三条防复发断言）全绿、M-01 套件 98/98 无回归、`npm run check` 通过；D1 修复对源码逐项核实——字段清单与 `EventSourceCreateArgs`（`src/core/EventSource.ts:85-96`）10 字段同序一致、语义注记与 `Interaction.ts:199` / `ActivityManager.ts:173` / 源注释逐点忠实、引用改指真实权威位置（`usage/14` 该术语 0 命中证实旧引用悬空）、Related 节 14 条目逐条对应 14 实际覆盖；D2 修复 "built-in guard" 清零且大小写不敏感同类扫描 6 行均合法分类；指南代码块逐字符组装 scratch 独立复现端到端 1/1（现场已还原）；四个已跟踪文件 diff 与设计 §3.2/§3.3 逐处一致；M-03 基线未动（冒号形 6 处）。0 实现缺陷 / 0 验证缺口，无新增 reopen）
- **结果**：`agent/agentspace/knowledge/usage/21-system-event-sources.md` 按 §3.1 骨架建成，每个代码形态标注钉住测试；05/06 按 §3.2 补「无框架级 user 闸门」；generator `api-reference.md` 两处 "user validation" 修正；02 补 Relation 残余一句（§3.3）。
- **覆盖 Task 要求**：R1、R2、R3、R5。
- **前置里程碑**：M-01（指南引用其测试名）。
- **reopen-count**: 1；**reopen-domains**: { guide-factual-accuracy: 1, guard-terminology: 1 }
- **验收命令**（文档验收 = 内容存在性 + 引用一致性检查；配方代码与 M-01 spec 逐形态一致由审计人工比对。裁决轮 2：`grep -c` 计数断言判别力弱，改为逐关键词 `grep -q` 串联，缺任一关键词即非零退出）：
  ```bash
  # 配方指南存在且含全部关键节/关键词（任一缺失即失败）
  F=agent/agentspace/knowledge/usage/21-system-event-sources.md
  grep -q "EventSource.create" "$F" && grep -q "admit" "$F" && \
  grep -q "Insert vs observe" "$F" && grep -q "user gate" "$F" && \
  grep -q "idempotencyInteractionKey" "$F" && echo "guide anchors OK"
  # user validation 误导表述清零（! grep 形式，兼容 set -e）
  ! grep -q "user validation" agent/agentspace/knowledge/generator/api-reference.md
  # :2643 的 "pre-built guard" 随 user-validation 改写消除（guard 家族 B 协调项，T2-B3）
  ! grep -q "pre-built guard" agent/agentspace/knowledge/generator/api-reference.md
  # 防复发（审计轮 2 D2）：新增文本不得以弃用阶段名 "built-in guard" 指称准入机制
  ! grep -qE "[Bb]uilt-in guard" "$F"
  # 防复发（审计轮 2 D1）：字段清单完整性——`idempotencyInteractionKey?` 在锚点链中；
  # 悬空引用消除——`EventSourceCreateArgs` 不得指向 usage/14（14 中该术语零命中）
  ! grep -qE "EventSourceCreateArgs.*14-api-reference|14-api-reference.*EventSourceCreateArgs" "$F"
  # 02 权威残余清单含 Relation
  grep -n "Relations cannot declare identity" agent/agentspace/knowledge/usage/02-define-entities-properties.md
  # 配方内代码块可运行性由 M-01 spec 钉住（审计比对形态一致）
  npx vitest run tests/runtime/systemEventSourceRecipe.spec.ts
  ```
- **证据**（实现轮 2，2026-08-30；该轮状态被审计轮 2 退回，正确部分经审计核实不重做）：
  - 验收命令逐项通过（本工作树）：`guide anchors OK`（EventSource.create / admit / Insert vs observe / user gate 四锚点串联 grep）；`user validation` 在 generator `api-reference.md` 清零（`! grep -q` 成立）；`pre-built guard` 清零（T2-B3 随 :2643 改写为 "pre-built admit (condition checks, payload validation)" 消除）；`usage/02:388` 命中 "Relations cannot declare identity (`Relation.create` has no identity parameter)"；`npx vitest run tests/runtime/systemEventSourceRecipe.spec.ts` → 1 file / 3 tests 通过。
  - 指南 21 按 §3.1 六节骨架建成（When Interaction Is Not the Right Shape / The Recipe 四步 / Insert vs observe / Division of Labor / No Framework-Level User Gate / Test Anchoring + Related）；Test Anchoring 表逐形态标注钉住测试（eventSource.spec.ts 四项、systemEventSourceRecipe.spec.ts 三项、dispatchIdempotency.spec.ts 一项），与 §3.1 映射表一致。
  - 指南代码块可运行性独立验证：把指南各代码块原样组装为临时 scratch spec 运行，1/1 通过（合作方开通链路端到端：dispatch → effects create 判别 → 按键 findOne），验证后删除（与设计期探针同协议）。
  - §3.2 / §3.3 编辑落位：05「About User Identity」节尾追加「无框架级 user 闸门」段落（`does not validate user`、Condition 是唯一闸门、引用 06/21；节内既有 `callInteraction` 示例未触碰，属 §1.3.2 另立任务）；06 §Contract 追加一条契约要点（引用 05/21）；`api-reference.md:2643` 改写为 pre-built admit + 类型契约句（同句消除 user validation 与 pre-built guard 两处误导）；`:3561` 仅移除 "user validation"，"guard checks" 保留为 `ignoreGuard` 选项名的合法释义（T2 谓词 i）；`usage/02:388` 补 Relation 残余句，该处保持权威定义。
  - 项目基础检查：M-01 验收套件复跑 4 files / 98 tests 全部通过（无回归）；`npm run check`（tsc --noEmit）通过。`src/` 零改动（R6）。
  - 边界自查（§1.3.2 / §5.2 风险 5）：新增/修改文本全部使用 `controller.dispatch` + `eventSources`（guide 21 内 `callInteraction`/`interactions:` 零命中）；guard 冒号形签名全库仍 6 处（api-reference ×5 + skill ×1，均属 M-03 修正范围，本轮未增未减）；guide 21 对 M-03 命令 (4) 的唯一命中是 §3.4 规范修正后入口陈述（"The only entry point for data changes is an EventSource dispatched through `Controller.dispatch`"，属命令 (4) 允许的剩余命中类 (a)）；C 形模式（命令 4b）对 guide 21 零命中。
  - 实现期修正记录（诚实起报）：初稿三处文字触碰了机械验收并在本轮内修正——(i) 指南 user-gate 节首句缺小写锚点 `user gate`（标题式 "User Gate" 不被大小写敏感 grep 命中），补 "There is no framework-level user gate:"；(ii) Test Anchoring 表初用 `` `guard:` `` 冒号形，会使 M-03 命令 (2) 的全库零命中断言误红，改为 "`guard`-only CreateArgs"（与钉住测试名一致）；(iii) `:2643` 首版替换句含字面 "user validation"（"performs no user validation"）会触发 M-02 自身 `! grep` 验收，改为 "does not validate `user`"。三处均已复验通过。
- **最新证据**（实现轮 3，2026-08-30，按审计轮 2 next-action 修复 D1/D2 并复验）：
  - 修复前先复现两条审计复现命令（红）：`grep -c idempotencyInteractionKey` = 0、`grep -nE "[Bb]uilt-in guard"` 命中 :5/:157 两处；另核实 `grep -c EventSourceCreateArgs usage/14-api-reference.md` = 0（引用悬空的另一侧事实）。
  - D1 修复：`:75` 字段清单补 `idempotencyInteractionKey?`，与源码 `EventSourceCreateArgs`（`src/core/EventSource.ts:85-96`）10 字段逐一一致，并注明该字段语义（"set by `Interaction.create` and Activity wrappers; anonymous EventSources leave it unset"，忠实于 `EventSource.ts:79-81` 注释）；`(see 14-api-reference.md)` 改指权威定义 `src/core/EventSource.ts` 的 `EventSourceCreateArgs` 接口（M-03 未实施、generator §13.2 仍用 guard 词汇，指源文件无需与其协调，即审计给出的两个选项中取前者）；Related 节 14 条目改为其实际覆盖内容（`dispatch`、`DispatchResponse`、idempotent dispatch，14:1431/:1434 实有），另增 `src/core/EventSource.ts` 条目承载权威字段清单引用。
  - D2 修复：`:5` "the built-in guard runs payload validation on top" → "the built-in admit runs condition checks and payload validation on top"（与 `:2643` 修正后的 "pre-built admit (condition checks, payload validation)" 及 `runInteractionGuard` = checkCondition + checkPayload 的源码事实对齐）；`:157` 表行 "Built-in guard runs" → "Built-in admit runs"。均词级替换，句子结构未重写。
  - 同类检查（按审计 D2 范围）：指南 21 内 `guard` 全量 7 行逐行复核——`:75` 弃用名提及（谓词 ii 合法，现名在前且明言弃用）、`:176` 动词泛英语义（谓词 iv）、`:188` `InteractionGuardError`（谓词 i）、`:201`/`:202`/`:207` 既有测试标题逐字引用（M-01 已钉住，历史命名不随本任务改）；无未分类行。M-03 命令 (2) 冒号形签名全库仍恰 6 处（api-reference ×5 + skill ×1，均属 M-03 范围，本轮未增未减）；指南 21 `callInteraction`/`interactions:` 零命中。
  - 验收（含并入的三条防复发断言）全部通过：锚点链含 `idempotencyInteractionKey` 输出 `guide anchors OK`；`user validation` / `pre-built guard` 清零；`! grep -qE "[Bb]uilt-in guard"` 成立；`EventSourceCreateArgs`→14 悬空指向断言成立；`usage/02:388` Relation 句命中；`npx vitest run tests/runtime/systemEventSourceRecipe.spec.ts` → 1 file / 3 tests 通过。
  - 回归：M-01 套件 4 files / 98 tests 全部通过；`npm run check`（tsc --noEmit）通过。本轮改动仅 `21-system-event-sources.md` 一个文件（`git diff` 核对），`src/` 零改动（R6）。

### M-03 「唯一入口」与 guard 词汇一次性修正、交叉引用同步

- **状态**：已完成（审计轮 4 独立复验通过：验收命令 (1)–(5) 全部通过（含审计轮 4 加强后的 26 锚点，26/26）；16 文件逐 hunk 对照成员表一致；T2 记账 21 = 15 合法 + 6 设计要求注记核平；交叉引用与测试标题引用逐字真实；0 实现缺陷；1 验证缺口 V1——命令 (1)/(4) 对实现轮同族补校 `01-core:18` 的回归致盲，审计轮按协议第 4 条直接加强（T1 回填 #23、锚点 25→26，缺陷注入验证判别力后复验 26/26），里程碑保持关闭。全部里程碑完成后触发最终核验：M-01/M-02/M-03 全部验收命令、Task 要求 R1–R6 逐项、`npm run check`、全量 `npm test` 2721 passed / 0 failed——任务转入`已完成`）
- **结果**：§1.2 成员表 T1 22 处 + guard 家族 A 8 处 + B 10 处（B3 随 M-02）全部修正；`usage/README.md` 学习路径含 21；02/05/06/15/21 交叉引用闭合；按 §1.2 记录的扫描模式（入口模式 + C 形模式）重扫，剩余命中逐条属于修正后陈述本身或裁定保留清单；guard 冒号形签名全库（`*.md` + `*.mdc`）零命中。
- **覆盖 Task 要求**：R4、R6，任务说明第 6 条。
- **前置里程碑**：M-02（统一措辞引用 21）。
- **reopen-count**: 0；**reopen-domains**: {}
- **验收命令**（裁决轮 2 按 T1/T2 重建：成员表即验收工件，锚点从成员表机械导出——T1 的 22 成员产出 25 个锚点（#20/#21 各含多条），T2 的 A5/A6 + B1/B2/B4–B10 产出 11 个锚点；判别力已验证：实施前 25/25 + 11/11 全部 RED（§5.1 探针 P5/P6）——任一位置未修正，验收必红。审计轮 4 回填 #23 后 T1 为 23 成员 26 锚点，#23 判别力经缺陷注入验证）：

  ```bash
  # (1) T1 入口/测试哲学家族：26 个锚点短语必须全部消失（期望全部输出 OK）
  #     （25 个设计期锚点 + 1 个审计轮 4 回填锚点 #23；#23 判别力经审计轮 4 缺陷注入验证）
  while IFS='|' read -r file phrase; do
    [ -z "$file" ] && continue
    if grep -qF -e "$phrase" "$file"; then echo "FAIL $file :: $phrase"; else echo "OK   $file :: ${phrase:0:40}"; fi
  done <<'EOF'
  agent/agentspace/knowledge/usage/01-core-concepts.md|Only Interactions Generate Data
  agent/agentspace/knowledge/usage/01-core-concepts.md|the **only source** of data changes
  agent/agentspace/knowledge/usage/01-core-concepts.md|All data changes originate from user Interactions
  agent/agentspace/knowledge/usage/01-core-concepts.md|Only user interactions can generate new data
  agent/agentspace/knowledge/usage/00-mindset-shift.md|Only Interactions Create Data
  agent/agentspace/knowledge/usage/00-mindset-shift.md|Only Interactions can generate new data
  agent/agentspace/knowledge/usage/05-interactions.md|the only way users interact with the system
  agent/agentspace/knowledge/usage/README.md|Only Interactions generate data
  agent/agentspace/knowledge/usage/13-testing.md|the ONLY way to execute business logic
  agent/agentspace/knowledge/usage/13-testing.md|ALL data is derived from interaction events
  agent/agentspace/knowledge/usage/13-testing.md|created, modified, and deleted through Interactions
  agent/agentspace/knowledge/generator/basic-interaction-generation.md|The ONLY way to create, update, or delete data
  agent/agentspace/knowledge/generator/test-implementation.md|deletions flow through interactions
  AGENTS.md|the **only source** of data changes in the system
  README.md|Only Interactions create data
  README.md|the *only* way new data enters the system
  README.md|come into existence (through Interactions)
  agent/agentspace/knowledge/usage/01-core-concepts.md|All other data are computation results of interaction data
  agent/agentspace/knowledge/usage/00-mindset-shift.md|All other data are "derivatives" of Interaction data
  agent/agentspace/knowledge/usage/13-testing.md|automatically tested when you test the Interactions
  agent/agentspace/knowledge/usage/13-testing.md|after testing all Interactions
  agent/agentspace/knowledge/usage/13-testing.md|Missing Interaction definitions
  agent/agentspace/knowledge/usage/13-testing.md|all data flows from Interactions
  agent/agentspace/knowledge/usage/13-testing.md|sufficient to achieve complete test coverage
  agent/agentspace/knowledge/usage/13-testing.md|automatically covered when you test the Interactions
  agent/agentspace/knowledge/generator/test-implementation.md|implementation details tested through interactions
  EOF

  # (2) T2 家族 A 冒号/参数形签名：全库（*.md + *.mdc，排除归档/冻结/历史）必须零命中
  #     （! grep 形式兼容 set -e；模式大小写敏感，不匹配 ignoreGuard / InteractionGuardError 中的大写 Guard）
  ! grep -rnE "config\.guard|(^|[^A-Za-z])guard\??:" --include="*.md" --include="*.mdc" . 2>/dev/null \
    | grep -vE "node_modules/|dist/|docs/|agentspace/output/|prompt/|CHANGELOG.md|\.git/"

  # (3) T2 家族 A 反引号形 + 家族 B：11 个锚点短语必须全部消失（期望全部输出 OK）
  while IFS='|' read -r file phrase; do
    [ -z "$file" ] && continue
    if grep -qF -e "$phrase" "$file"; then echo "FAIL $file :: $phrase"; else echo "OK   $file :: ${phrase:0:40}"; fi
  done <<'EOF'
  agent/agentspace/knowledge/generator/api-reference.md|`guard` runs before event processing
  agent/agentspace/knowledge/generator/api-reference.md|provides pre-built `guard`, `mapEventData`, and `resolve`
  agent/agentspace/knowledge/generator/api-reference.md|(guard → event record → resolve → sync computations)
  agent/agentspace/knowledge/generator/api-reference.md|fails (guard, resolve,
  agent/agentspace/knowledge/usage/05-interactions.md|- `guard`
  agent/agentspace/knowledge/usage/04-reactive-computations.md|`guard`, `mapEventData`
  agent/agentspace/knowledge/usage/20-postgresql-concurrency-migration.md|- `guard`
  agent/agentspace/knowledge/generator/test-implementation.md|wrap guard and most domain failures
  README.md|runs guard checks
  README.md|`guard` / `mapEventData` / `resolve`
  .cursor/rules/runtime-controller.mdc|`guard(args)` / `admit`
  EOF

  # (4) 辅助筛查 a（入口模式，8 模式，当前基线 64 行已逐行裁决；裁决轮 3 实测修正：裁决轮 1 曾记 65，为计数误差）：
  #     修正后剩余命中必须逐条属于
  #     (a) 修正后的入口陈述（"only entry point ... EventSource dispatched through Controller.dispatch"）
  #     (b) §1.2 T1 保留清单 —— 审计逐条裁决，清单外新命中为失败
  grep -rniE "only[^a-z0-9]*(source|way|entry)|single[^a-z0-9]*source|only interactions|all [a-z ]*data|source of all data|data changes originate|derived from interaction|through interactions" \
    --include="*.md" --include="*.mdc" . 2>/dev/null | grep -vE "node_modules/|dist/|docs/|agentspace/output/|prompt/|CHANGELOG.md|\.git/"

  # (4b) 辅助筛查 b（C 形覆盖率充分性模式，裁决轮 2 新增）：修正后剩余命中必须逐条为
  #      「修正后的覆盖率陈述」——充分性归因于声明的全部 EventSource；凡把充分性归因于
  #      Interaction 测试的命中即失败（该形态的 22 处旧文已由命令 (1) 机械断言消失）
  grep -rniE "sufficient.{0,40}coverage|coverage.{0,60}(interaction|eventsource)|comprehensive interaction|naturally covers|automatically (covered|tested|tests? when)|provides complete coverage" \
    --include="*.md" --include="*.mdc" . 2>/dev/null | grep -vE "node_modules/|dist/|docs/|agentspace/output/|prompt/|CHANGELOG.md|\.git/"

  # (5) README 学习路径含新指南
  grep -n "21-system-event-sources" agent/agentspace/knowledge/usage/README.md
  ```
- **最新证据**（实现轮 4，2026-08-30，本工作树）：
  - **验收命令逐项通过**：(1) T1 的 25 锚点全部 OK（首跑 24/25——#21 章末总结句的改写初版保留了字面锚点短语 "sufficient to achieve complete test coverage"，被命令 (1) 当轮捕获，改写为 "thorough testing of all declared EventSources yields complete test coverage" 后复跑全绿；锚点断言的判别力对新增文本同样成立）；(2) 全库冒号/参数形 guard 签名零命中（修正前 6 处：api-reference ×5 + skill ×1，探针 P6 一致）；(3) T2 的 11 锚点全部 OK；(4)(4b) 辅助筛查剩余命中逐条裁决（见下）；(5) `usage/README.md:146` 含 `21-system-event-sources` 学习路径项。
  - **T1 修正落位（22 成员 + 1 同族补校）**：统一措辞为「数据变化唯一入口是经 `Controller.dispatch` 触发的 EventSource；Interaction 是内建的、面向用户交互的 EventSource」。测试哲学前提-结论链（#9/#10/#12/#19–#22）前提与覆盖率结论一并改为「测全声明的全部 EventSource」。**同族补校（诚实记录）**：`01-core-concepts.md:18`（"Only user interactions can generate new data"）不在 T1 表内——机械模式 `only interactions` 因插入词 "user" 未命中；按成员资格谓词（P 形）与任务要求 4「同类表述一次查全」判定为 #5（`00-mindset:288`）的同构句、#17 的同列表姊妹条目，随 #1/#17 的整块改写一并修正。
  - **T2 修正落位**：家族 A（8 处）`guard` 键/签名/示例/Key Points 全部改 `admit`；A1（`config.admit` 参数说明）按设计注明 legacy `guard` 键声明期抛错（措辞忠实于 `src/core/EventSource.ts:205-212` 的实际报错）；A2/A7/A8 签名与权威 `EventSourceCreateArgs`（`EventSource.ts:85-96`）对齐（`admit?` + 补 `open?`，A2 与 A7 为同一接口的两份拷贝，保持一致）。家族 B（9 处，B3 已随 M-02）：B1 管线描述对齐 `usage/14:1432` 权威管线（`admit → open? → map → create → resolve → afterDispatch`）；B2/B4/B5/B6/B7/B8/B9 词级替换；B10 调序并标注弃用（"`admit(args)` (legacy alias `guard`)"）。
  - **辅助筛查裁决（命令 4）**：剩余命中分三类——(a) 修正后的入口/派生陈述 14 行（AGENTS:122、05:3、13:279/:281/:1172、01:19/:107/:120、usage/README:98、00:289、21:3、generator test-impl:4、basic-interaction-gen:76，排他/派生全部归于 dispatched EventSources）；(b) 事实正确的排他断言 1 行（`.cursor/rules/runtime-controller.mdc:10`——"dispatch is the **only** entry for triggering any event source"，排他归于 dispatch 而非 Interaction，与修正后叙述同向）；(c) §1.2 保留清单成员（纯规定性测试指令、响应式叙述、需求完备性指令、外部数据语境、其它义项，行号随本轮编辑 ±2 漂移，逐条对应）。无清单外新命中。**命令 4b**：4 行命中（13-testing:283/:285/:1172、generator test-impl:4）全部为修正后覆盖率陈述——充分性归因于全部声明 EventSource。
  - **T2 记账对账**：全库 `\bguard\b` 残留 21 行 = 合法清单 15 行（与 §1.2 逐条对应：ignoreGuard 释义 ×5、InteractionGuardError、Admit/guard 弃用提及 mdc:27、single guard concept ×3、泛英语义 ×5）+ 刻意新增 6 行（B10 弃用别名注记 ×1、api-reference:549 legacy 抛错注记 ×1、指南 21 既有弃用提及/测试标题引用 ×4——其中 :549 为本轮 A1 要求的注记、指南 21 四行为 M-01/M-02 已裁决合法），无未分类行。
  - **交叉引用闭合**：05:3 新增指向 21 的链接；入链 21 的位置 = 05:24、06:56、usage/README:146；指南 21 出链（02/05/06/13/14/15）全部解析到真实文件。02/06 本轮未触碰（M-02 已落位）。
  - **回归与边界**：M-01 验收套件复跑 4 files / 98 tests 全部通过（无回归）；`npm run check`（tsc --noEmit）通过；本轮改动 12 个文件全部为文档/规则（`git diff` 核对：.cursor rule ×1、根 README、AGENTS.md、generator ×3、usage ×8、skill ×1），`src/` 零改动（R6）；新增/修改文本全部使用 `controller.dispatch` + `eventSources`（同句既有 `callInteraction` 污染按 §1.3.2 保持原样：13-testing:167/:173、generator test-impl:26/:32/:321）。

里程碑数 M = 3；设计已于裁决轮 3 通过，N = 5 × 3 = 15（总预算，所有里程碑共享）。

## 5. 风险与验证安排

### 5.1 设计期已完成的最小验证实验（探针，均已删除现场）

| 探针 | 内容 | 结果 |
|------|------|------|
| P1 | 无 conditions 的 Interaction，args 完全不含 `user`，PGLiteDB dispatch | 通过：`result.error` 为空，Transform 创建实体成功（注意：Interaction 须经 `eventSources` 注册；`interactions:` 键无效，见 §1.3.2） |
| P2 | `EventSource.create({ guard: ... })` legacy 键 | 声明期抛 `/admit/`（与既有回归一致） |
| P3 | 匿名 EventSource（admit + mapEventData）→ Transform eventDeps → `Entity.identity` 实体；同键二次 dispatch | 通过：首次 effects 含 1 条 create，二次 0 条且无 error，行保留首写 payload，按键查询判别成立 |
| P4 | `controller.callInteraction` 存在性 | `undefined`（配合全仓 grep 零命中） |
| P5（裁决轮 1） | M-03 重构验收的判别力反证：对**未修正的当前文本**运行验收命令 (1)(3) 的 25 个锚点断言（18 叙事 + 7 guard；短横开头的锚点需 `grep -F -e` 形式，已写入验收脚本） | 25/25 全部 RED（即每个家族位置都能被验收检测到「未修正」状态；任一位置漏改，验收必红。初稿验收 grep 经实测合并仅覆盖清单 11 处中的 6 处——这是评审轮 1 问题 1 的采纳依据。宽模式重扫另发现初稿清单漏 2 处派生形式，已并入） |
| P6（裁决轮 2） | 重建后验收的完整判别力反证：对未修正文本运行最终形态的命令 (1)(2)(3)——(1) T1 的 25 锚点、(3) T2 的 11 锚点、(2) 全库冒号形签名 | (1) 25/25 RED、(3) 11/11 RED（评审轮 2 两问题指向的位置 + 裁决轮独立发现的位置全部可被验收检测）；(2) 修正前命中 6 处（api-reference ×5 + skill ×1，与评审轮 2 §0.2 实测一致），修正后断言为零 |

基线套件：`npx vitest run tests/runtime/eventSource.spec.ts tests/runtime/applicationIdentity.spec.ts` → 2 files, 82 tests 全部通过（2026-08-30，本工作树）。裁决轮 1 复跑三件套（含 `dispatchIdempotency.spec.ts`）→ 3 files, 95 tests 全部通过（2026-08-30）；裁决轮 2 再次复跑三件套 → 95/95 通过；裁决轮 3 复跑三件套 → 95/95 通过，并复现全部验收锚点应红状态（T1 25/25、T2 11/11、冒号形 6、M-02 四项，见 §1.7）。

### 5.2 实现期验证的风险

1. **措辞修正削弱反命令式教学**（M-03）：修正排他断言时保留「数据永不命令式写入」的教学核心；审计轮逐处比对修正前后语义。
2. **测试哲学前提句修正削弱既有指导**（M-03，#9/#10/#12/#19–#22）：前提改为「数据变化经 dispatch 的 EventSource」后，覆盖率结论须同步改为「测全声明的全部 EventSource」，不得只改半句留下「测全 Interaction 即全覆盖」的残缺推理；修正限于前提与结论句，审计比对相邻指导内容未被重写。
3. **grep 验收模式误报 / 漏报**（M-03）：锚点断言是确定性主验收（判别力 25/25 + 11/11 已验证，探针 P5/P6）；宽模式筛查（命令 4/4b）是辅助手段，审计对每条剩余命中逐条裁决（修正后陈述 vs 保留清单 vs 清单外新命中）。
4. **指南代码块与钉住测试漂移**（M-02）：指南中每个代码块旁标注对应测试名，审计逐块比对形态一致性。
5. **触碰 05/13/04/20/test-implementation/README/.cursor 规则时误引入 callInteraction 污染或改写超范围**（M-02/M-03）：实现轮自查新增/修改文本只用 `dispatch` + `eventSources`；家族 B 修正保持词级（`guard` → `admit`，B10 仅调序并标注弃用），不重写句子结构；同句 `callInteraction`（B7、#22 所在文件多处）保持原样，属 §1.3.2 另立任务。

### 5.3 无需设计期提前验证的事项

高风险行为（并发、崩溃、迁移、删除）本任务不涉及；`src/` 零改动使回归面限于文档与新增测试。真实 PostgreSQL 套件按任务说明第 5 条不需要。

## 6. 基线

- **Git revision**：`0249556`（= 评审文档入库提交；评审基准 `94a9194` 为其父链上的 4.10.0 提交）。裁决轮 1、裁决轮 2、裁决轮 3 均在同一 revision 上完成（工作树仅任务目录文档变化，`src/` 零改动）。
- **工作树状态**：干净，除未跟踪的 `docs/gap-1-identity-bootstrap-docs/`、`prompt/skill/new-waku-session.md`、`prompt/skill/new_waku_session.sh`。
- **相关既有测试结果**：`tests/runtime/eventSource.spec.ts` + `tests/runtime/applicationIdentity.spec.ts` = 82 passed / 0 failed（PGLite，本机 2026-08-30，设计期）；裁决轮 1 复跑三件套（含 `dispatchIdempotency.spec.ts`）= 95 passed / 0 failed。任务开始前无已知失败。
