# 性能债盘点与收口规划（2026-07-16）

- 日期：2026-07-16（执行台账更新：同日，见文末「执行台账」）
- 基线：`main` @ `9bc58e81`（v4.2.0）
- 性质：对 r2–r34 全部评审轮次中**记录在案的性能后续工作**的系统盘点 + 分期收口规划
- 关联：`full-codebase-review-2026-07.md`（I-9）、`core-runtime-builtins-review.md`（S3）、
  `data-migration-scheme-deep-review.md`（I3）、`deep-review-*`（r10/r12/r19–r28/r31/r32 的性能记录项）、
  `quality-foundation-plan-r27.md`（三支柱——本计划是其刻意未覆盖的第四维度）

---

## 〇、方法与总判断

**方法**：把 34 轮 deep review、两份专项 review、quality-plan 与知识库中所有被标为
「性能项 / 性能债 / 维持记录（性能）」的条目全部挖出，逐项回到当前代码验证是否仍然成立
（给出文件锚点），按机制家族归并，再按仓库既有纪律（判据先行、收敛点修复、机制化防回归）排期。

**总判断（三句话）**：

1. 有效性能债共 **13 项**（B3 并入 B1 计；另有 A5、B5 两项已部分缓解），分四个家族：
   A 调度器热路径、B 查询编译/执行、C 资源生命周期、D 元问题。除 D1（本盘点新增观察）外
   没有一项是臆测——全部有轮次记录 + 当前代码锚点。
2. 所有轮次对性能项的处置口径完全一致：「**需先建基准判据再收口**」（r23/r24/r26 三轮明文，
   r24 的表述最准确——*无单点红-绿判据，不满足「能明确验证修复成功」的入选标准*）。
   而仓库目前**零性能测量设施**（无 bench、无计数判据、无场景基线）。所以计划的第一步不是任何优化，
   而是把「性能」变成可红-绿断言的观察面（Phase 0）。
3. 当下是收口的历史最佳窗口：r27–r34 建成的预言机群（朴素重算对拍、事件完备性、驱动差分、
   迁移 kill-resume）恰好是性能改动最需要的**正确性护栏**——「改快了但改错了」这一性能优化的
   头号历史风险首次有了系统性防护。

---

## 一、有效性能债总清单（逐项核实过当前代码）

### A 家族：调度器热路径——「增量性」缺口

响应式计算是框架的核心卖点；这一家族的每一项都是「本应增量的路径退化为全量」，
且被 `RequireSerializableRetry` 放大：**任何 fullRecompute 都要求 SERIALIZABLE 隔离级**
（`Scheduler.ts` L1176–1179），非 SERIALIZABLE 起步的 dispatch 事务会**整体作废重跑**——
所以一次全量退化的真实成本 = 事务重启 + 全量重算 + 更高隔离级的冲突概率。

| # | 条目 | 记录轮次 | 机制锚点（当前代码，已核实） | 状态 |
|---|------|---------|---------------------------|------|
| A1 | **filtered targetPath property 级全量重算风暴** | r19#4 → r21#1 → r22 → r23#3 → r24 → r25#9 → r26 → r27 → r28 → r32（**≥10 轮复确，全清单最高频**） | filtered 源的 update 监听挂物理 base 名（`ComputationSourceMap.normalizeFilteredUpdateSourceMap`）；`Scheduler.resolveFilteredUpdateEvent` 只对**无 targetPath** 的源做成员资格守卫 + 事件名改写，带 targetPath 的源在 L633 早退 → property 级聚合收到的 related 事件保持物理名；`aggregationTemplate.ts` 的 create/delete 分支按 filtered 名守卫（L431/L462），update 分支靠 filtered 名查询定位、非成员即 fullRecompute（L484–492），未识别形态走 catch-all fullRecompute（L506–507） | 有效 |
| A2 | **global dict 变更 → 依赖它的 property 计算宿主全表 `find(..., ['*'])`**（S3） | `core-runtime-builtins-review.md` S3（2026-07-04），此后几乎每轮「性能/资源」复确 | `Scheduler.ts` L713–728：事务内全表 `['*']` 拉取 + 每宿主合成一个 update 事件逐条执行计算 | 有效 |
| A3 | **relatedAttribute 深度 >3 一律 fullRecompute** | r10 | `aggregationTemplate.ts` L405–415：`relatedAttribute.length > 3` 直接退全量 | 有效（影响面窄） |
| A4 | **NewRecordData：任意字段更新重算全部 computed 字段** | I-9（full-codebase-review） | `NewRecordData.ts` L298–308，自带 CAUTION「没有标记 computed 依赖于哪些字段」 | 有效（单行级，量级小） |
| A5 | Custom entity/relation 的 lastValue 全表拉取 | r13-I-1 / r15-O-6 | `Custom.ts` L36–43：r15 起默认关闭，opt-in `useLastValue: true` 已文档化为知情选择 | **已缓解**，残余为显式 opt-in 面 |

**A1 补充**：正确性由全量重算兜底（r21 亲自核实「同批 enter+update 不会 +2」），这正是它十轮不修的原因；
但代价是 filtered relation × property 聚合这一**旗舰组合**在热路径上的每次相关写都可能触发
「事务重启 + 全量重算」。记录的终局修法（r21 建议 1）：`resolveFilteredUpdateEvent`
对带 targetPath 的源同样改写事件名并复用成员资格守卫；同批去重语义已有 r27 定谳
（同一 mutation 对同一计算的 property dep 合并为一次 / records dep 不去重 / 异 targetPath 不去重）。
另注意：多轮记录期间代码已演化（r18 补 membership 守卫、聚合模板统一抽取），
**风暴的当代精确形态需要重新钉住**（哪个分支退全量、reason 字符串是什么、每事件退几次）——这本身就是 Phase 0 计数器的第一个用例。

### B 家族：查询编译/执行——结构性 fan-out 与分页

同一个根：**x:n 路径的 LEFT JOIN fan-out × 分页语义**。四个面互相纠缠，收敛点是两个
（B1 小改，B4 结构性改写），其余项随之贬值或消失。

| # | 条目 | 记录轮次 | 机制锚点（当前代码，已核实） | 状态 |
|---|------|---------|---------------------------|------|
| B1 | **EXIST 命中路径仍进外层 JOIN 树** | r12-I-5 → r20#3（给出源头修法）→ r21/r22 建议（三轮复确） | `MatchExp.buildQueryTree` L232–244：exist 原子照样 `addRecord` 入树。注释自证「join 的表没用到会自动数据库忽略」——但谓词已由 EXISTS 子查询表达，外层 x:n JOIN 只贡献 fan-out 行，并让 `queryTreeHasXToManyPath` 判定触发 post-pagination | 有效 |
| B2 | **offset-only / limit>1 + x:n match → post-pagination 全量拉取 + 内存 slice** | r12-I-4 | `QueryExecutor.ts` L363–406：`needsPostPagination` 剥离 SQL 的 LIMIT/OFFSET → 数据库返回全部扇出行再内存分页。深分页大表 = 性能悬崖（正确性无损） | 有效 |
| B3 | post-pagination 判定保守（纯 EXIST 也算 x:n） | r12-I-5 附属 | `QueryExecutor.queryTreeHasXToManyPath` L525–537，注释自证保守 | 有效；B1 修复后判定自然精确化 |
| B4 | **两段式根查询改写**（分页/排序在扇出下的终局修法） | full-codebase-review F-4 修复方向的遗留半场 + I-7（orderBy 关联字段代表行）+ r22#7（post-pagination tie 稳定性） | F-4 当时以「剥离 LIMIT + 内存去重分页」止血（正确性到位）；记录的终局方向是 `WHERE id IN (SELECT DISTINCT root.id … ORDER BY … LIMIT/OFFSET)` 两段式 | 记录未做 |
| B5 | **残余 N+1** | I-9 + r31 诚实边界 | ① `completeXToOneLeftoverRecords`（x:1 主干上的 x:n 枝干逐父查询，L667–742）；② `canBatchXToManyQuery` 排除面（label/goto 递归、per-parent limit/offset、n:n、对称，L539–557）；③ `enforceXToOnePredicates` pair-敏感谓词逐父探针（r32 已批量**纯谓词**面，注释 L184–188 登记了边界） | 部分收口（直连 1:n 批量与纯谓词探针批量已落地），残余有效 |
| B6 | `dedupeIdenticalRows` 每行全列 `JSON.stringify` | I-9 | `QueryExecutor.ts` L299–310 | 有效；B4 落地后大幅贬值 |

**关联 watch 项**（正确性风险记录，与 B 家族收口耦合，非性能项）：dedupe 扇出少去重风险（r25#6，未构造出红例）、
深嵌 EXIST × 多 self-join 别名碰撞（r25#7，未构造出红例）。B4 的设计必须把这两格作为对照面一并定谳。

### C 家族：资源生命周期——长期运行成本

| # | 条目 | 记录轮次 | 机制锚点（当前代码，已核实） | 状态 |
|---|------|---------|---------------------------|------|
| C1 | **async task 表只增不减** | r2-I-6（+ r12-I-3 无 failed 终态） | applied/skipped 行永驻（`markAsyncTaskStatus` 只标记）；`isLatestAsyncTask` 每次投递按 freshnessKey `findOne(orderBy id DESC)`（L1406–1411），freshnessKey 无索引；r34 的 `invalidateUnappliedAsyncTasks` 只删 pending/success（作废轨），不是保留策略 | 有效 |
| C2 | **storage 级联删除无深度上限** | r2-I-5 | 计算传播翼已有深度守卫（r11-F1）；`DeletionExecutor` 无任何 depth 计数（已 grep 确认） | 有效（性能/健壮性混合） |
| C3 | **迁移全表载入内存 + diff 罗列全量 id** | MIG-I3（data-migration review）+ r16 补充形态 | 重算/审阅路径整表进内存、takeover/destructive scope 罗列精确 id 集合；r16：scoped-sequence seed 的 match 编译失败时**静默降级全表内存扫描** | 有效 |

### D 元问题

| # | 条目 | 依据 |
|---|------|------|
| D0 | **仓库零性能测量设施** | 无 bench 文件、无 tests/performance、无计数判据（已搜索确认）；r23/r24/r26 三轮把「先建基准判据」列为性能收口的明文前置；quality-plan 三支柱（生成器/收缩空间/一致性探针）刻意不含性能维度 |
| D1 | **生成 schema 零查询性能索引**（本盘点新增观察，未见于任何轮次记录） | 全仓库索引产生点只有三处（已逐点核实）：约束管线的唯一索引（用户 UniqueConstraint + `_Dictionary_` 等内部 kv 约束，`SchemaDialect.createUniqueIndexSQL`）、Transform 簿记唯一索引（`MonoSystem.setupTransformUniqueIndexes`）、SQLite `_IDS_` 簿记唯一索引——全部为唯一性服务。`Setup.createTableSQL` 不产生任何二级索引：逻辑 `id` 列（r32 已实证 SQLite id 列无唯一索引）、link/FK 列（`source`/`target`/`Entity_attr`）、filtered 谓词常用列全部无索引。x:1 JOIN 探 `_rowId`（PK）尚可，但顶层 `id = ?` 匹配、1:n 反向查找（按 FK 列找子行）、task 表 `freshnessKey` 热查询在大表上都是全表扫描 |

**D1 补充**：这是被 34 轮 review「正确性优先」的观察角度系统性漏掉的一面——r32 触及 id 列无索引时关心的是撞号静默双行（正确性），而不是查找成本。收口需要产品决策：自动为 link 列/逻辑 id 列建索引（违背「显式控制」但符合关系库常识）vs 提供显式 `Index` 声明面（与 UniqueConstraint 同构）。放 Phase 0 测量后决策（bench 会直接暴露量级），设计评审归 Phase 2。

### 参考背景（方向性文档，非承诺项，不进本计划）

- `agentspace/knowledge/query-complexity-analysis.md`：短期建议中 QueryExecutor 分层已落地、
  批量查询部分落地（`findXToManyRelatedRecordsBatched`）；查询缓存、SQL AST、Knex 替换未采纳——
  后两者与仓库「最小表面积/显式控制」气质冲突，维持参考。
- `agentspace/knowledge/storage-refactor-design.md`：拆层重构已落地；其「性能测试」步骤即本计划 Phase 0。
- `agentspace/challenge/01–07`（高频秒杀/批量/图算法/审计）：产品级能力设计，超出「记录的后续工作」范围。

---

## 二、结构性判断（排期依据）

1. **判据先行是记录的前置，不是我的偏好**。三轮明文 + 仓库红-绿纪律。没有判据的性能修复
   无法证明「修好了」，更无法防回退。
2. **判据的正确形态是确定性计数器，不是 wall-clock**。仓库判据文化是确定性红-绿；
   wall-clock 抖动天然不可 CI。主判据 = SQL 语句数 / fullRecompute 次数（`ComputationResultFullRecompute`
   自带 reason，可按 reason 归因）/ `RequireSerializableRetry` 次数 / post-pagination 触发次数——
   全部确定性、全部有现成收敛点可采集。wall-clock 只进 nightly 趋势，不阻塞 PR。
3. **收敛点优先（fix the class）**：A1 的修复点是 `resolveFilteredUpdateEvent` 单点
   （live Scheduler 与 MigrationScheduler 两个消费方复用同一守卫，源码 CAUTION 已声明）；
   B 家族四个面同根，按 B1（小而确定）→ B4（结构改写）两步收，不逐项打补丁。
4. **正确性护栏已就位**：计算层朴素重算对拍 fuzz（r29）、驱动差分 fuzz（r29/r33）、
   事件完备性预言机（r17+）、迁移 kill-resume fuzz（r29/r33）——每个 Phase 的护栏直接复用，
   仅需按 AGENTS.md 扩对应种子池。

---

## 三、Phase 0：性能判据设施（一切收口的入场券）

### 0.1 确定性执行计数器（「性能预言机」）

采集点全部是现成收敛点，不新增公开 API（最小表面积）：

| 计数器 | 采集点 | 先例 |
|--------|--------|------|
| SQL 语句数（按 queryName 归类） | `Database.query/insert/update/delete` 包装 | `deepAnalysisSection3Fixes.spec.ts` 的 `recordQueries()` 测试内 patch |
| fullRecompute 次数 + reason | Scheduler 的 `ComputationResultFullRecompute` 消费点（reason 已是结构化字符串） | reason 字符串本就为归因设计 |
| 事务重启次数 + 原因 | `runWithTransactionRetry`（`RequireSerializableRetry` / 40001 已分类） | 现成错误分类 |
| post-pagination 触发 | `QueryExecutor.needsPostPagination` 判定点 | — |

落地形态：`tests/helpers/perfProbe.ts` 一类的测试级 instrumentation + 断言辅助
（「该操作序列：SQL ≤ k / fullRecompute = 0 / 隔离级升级 = 0 / post-pagination = 0」）。

**验收（先当场红）**：给 A1 / A2 / B1 / B2 各钉一个**现状红例**（计数器断言写成「应有的样子」，
在当前代码上失败），转为各 Phase 的红-绿判据。这一步同时完成 A1 风暴当代形态的重新定谳。

### 0.2 微基准 harness（nightly / env-gated）

`scripts/bench/` + 场景清单 = 本清单每个条目一个场景（A1：filtered relation 聚合下的批量写；
A2：dict 变更 × 宿主表 N 行；B2：深分页 × 扇出；B5：深嵌套 attributeQuery；C1：task 表增长后的投递延迟；
C3：迁移 × 存量行数；D1：大表 `id = ?` 点查与 1:n 反向查找有无索引的对照）。PGLite 常跑、
真实 PG env-gated；输出基线数字入 `agentspace/output/perf-baseline-<date>.md`。
**作用**：用测量校正 A3/A4/B6/D1 这些「量级存疑或需决策」项的取舍（measured-first），
并为后续每期提供 before/after 证据。

### 0.3 登记

- `tests/runtime/WritingComputationTests.md` 维度登记册新增观察轴：**执行路径断言**
  （增量 / 全量+reason / 隔离级升级）——A1 这类「correct but degraded」缺陷此前不可见，
  正是因为矩阵只有值断言没有路径断言。
- AGENTS.md 测试节补一行：涉及调度器/查询编译的改动应带计数器断言。

---

## 四、Phase 1：调度器热路径收口（A 家族）

### 1.1 A1 filtered targetPath 事件名改写 + 同批去重（本计划最高优先的实质修复）

- **第一步（依赖 0.1）**：用计数器钉住风暴当代形态——哪个分支退全量（update 非成员 /
  catch-all / create-delete 守卫不命中）、每个写操作退几次。多轮记录之间实现已演化，不做这一步就是
  r26 警告的「盲目改事件改写路径」。
- **第二步（收敛点修复）**：`resolveFilteredUpdateEvent` 撤销 targetPath 早退（L633），
  把成员资格守卫 + 物理名→filtered 名改写推广到 targetPath 源；同批去重按 r27 定谳规则执行。
- **消费方枚举（fix the class，缺一不可）**：live Scheduler 数据轨、MigrationScheduler
  增量重算轨（源码 CAUTION 明文要求复用）、事件驱动轨（`EventBasedEntityEventsSourceMap.filteredRecordName`
  同构面）、`aggregationTemplate` 三分支守卫（create/delete/update 与 catch-all）。
- **护栏**：computation fuzz 的 property 格菜单扩到 **filtered relation 源**——已核实缺格：
  共享生成器 `fuzzSchema.ts` 已产出 `filteredRelations`，但 `computationGenerativeFuzz` 的
  `roleMenu` 只消费 `schema.relationChoices`（普通关系），风暴形态在生成域为空白。菜单扩张只动
  该套件自身的决策流（新种子宇宙重验），不触碰 fuzzSchema 的共享 rng 序（storage 池不受影响）；
  另有 `filteredMembershipMatrix` / `aggregationConsistencyMatrix` / 真实 PG 全套件为存量护栏。
- **判据（红→绿）**：成员内字段更新 / 成员资格进出 / 非成员行更新三格全部走增量
  （fullRecompute = 0、隔离级升级 = 0），聚合值与朴素重算相等。

### 1.2 A2 global dict 全表扫描收窄

- 半步收窄（低风险）：全表 `find(host, ..., ['*'])` 改为分批 + 只取增量路径实际消费的列
  （合成事件只需要记录身份 + 计算自己按 attributeQuery 回查，聚合模板 create/update 本就
  「先按 attributeQuery 拉全记录」）。
- 终局（需设计决策）：「global dep 变化 = 宿主全体脏」表达为集合式重算计划，
  而不是 N 个合成 per-record 事件。涉及计算协议面，单独评审。
- **判据**：dict 变更时 SQL 从 O(N×全列) 降为 O(batch)；语义不变（现有 dict 依赖用例 + fuzz 绿）。

### 1.3 A3 / A4 / B6：measured-first

先跑 0.2 的对应 bench 场景，超阈值才动。预判：A3 影响面窄（>3 段 targetPath 罕见）；
A4 的正解是 computed 显式依赖声明（属 API 决策，「显式控制」气质下合理但须单独评审）；
B6 在 B4 落地后大幅贬值。三项默认**维持记录**。

---

## 五、Phase 2：查询编译/执行收口（B 家族）

### 2.1 B1 EXIST 原子跳过外层 JOIN 树（小而确定，记录了源头修法）

- 修复：`buildQueryTree` 对 exist 原子不再 `addRecord`（exist 之前的中段路径仍须入树；
  `existInnerFold` 折叠面与引用路径收集面已各自独立处理，逐一核对不受影响）。
- 连带收益：`queryTreeHasXToManyPath` 对纯 EXIST 查询不再误判 → LIMIT/OFFSET 恢复下推 →
  B3 自动精确化；EXIST 查询消除 fan-out 行与 dedupe 开销。
- **判据**：纯 EXIST match 的 find → JOIN 树无 x:n 节点、SQL 含 LIMIT、post-pagination = 0；
  **护栏**：驱动差分 fuzz（读结果逐操作对拍）+ filtered relation EXIST 语义回归（r25 F-2 家族）+ 真实 PG。

### 2.2 B4 两段式根查询改写（家族终局，最大改动，最后落）

- 设计：match/orderBy 树含真 x:n 路径且带分页时，根查询改写为
  `WHERE id IN (SELECT DISTINCT root.id … ORDER BY … LIMIT/OFFSET)`（或先取根 id 再取全量字段）。
- 一次收掉：B2 全量拉取、I-7 orderBy 扇出代表行、r22#7 tie 稳定性（借机补 id tiebreaker 并文档化）、
  B6 dedupe 贬值；r25#6 watch 项在设计中一并定谳。
- 风险与前置：SQL 生成面广、四驱动方言差异 → 必须在 0.1 计数器 + 2.1 落地后进行，
  以差分 fuzz 扩池 + 全真实 PG/MySQL 套件为准入；行为面变化（分页语义修正）配 CHANGELOG。
- **判据**：分页恒下推（post-pagination = 0）+ 全部读语义对拍不变。

### 2.3 B5 残余 N+1 批量化

逐格评估：`completeXToOneLeftoverRecords` 的 x:n 枝干（与 `findXToManyRelatedRecordsBatched`
同构的 IN + 反向分组）；`canBatchXToManyQuery` 排除面中 n:n / 对称可解，
per-parent limit / 递归 label 语义上不可合并——**登记为永久诚实边界而非遗留**（写进方法头注）。

### 2.4 D1 索引声明面（设计评审项）

依 Phase 0.2 的对照数字决策：方案 a）link 列 / 逻辑 id 列自动建索引（关系库常识，但引入隐式行为，
且对既有部署是 DDL 变更须走迁移面）；方案 b）显式 `Index` 声明（与 `UniqueConstraint` 同构的
Klass + Setup/迁移接线，符合「显式控制」）。倾向 b + 文档指引（生成器文档默认为 link 列声明索引）；
无论取向，迁移 additive-DDL 轨与 `SchemaDialect` 是现成接线点。

---

## 六、Phase 3：资源生命周期（C 家族）

| 项 | 修法（记录方向 + 框架气质） | 判据 |
|----|---------------------------|------|
| 3.1 C1 task 保留 | 显式控制风格：提供 `cleanupAsyncTasks({statuses, before})` 类 API + 文档，**不做隐式自动清理**；评估 freshnessKey（或复合 (freshnessKey, id)）索引——`isLatestAsyncTask` 是每次投递的热查询 | task 表 10^5 行时投递 SQL 成本有界（bench 场景）；清理 API 不触碰 pending/success 作废轨语义（r34） |
| 3.2 C2 级联深度熔断 | 深度计数 + 明确熔断错误，与计算传播守卫（r11-F1）同构——「fail-fast 优于静默长事务」 | 深链删除在阈值处得到清晰 FrameworkError；正常深度回归全绿 |
| 3.3 C3 迁移规模化 | 迁移专项轮：分批游标（keyset）+ 超阈值 id 集合降级 `count + checksum` + 分段提交显式设计（原报告修复方向）；顺带修 r16 的 scoped-sequence seed 静默降级 | 存量 10^5 行迁移内存有界（bench）；migration fuzz（加法/破坏性/kill-resume）全池绿 |

---

## 七、明确不进本计划（维持记录，理由）

1. **challenge 场景**（秒杀/撮合/图算法）：需要产品级原语设计（悲观扣减、队列、推送），不是「记录的后续工作」。
2. **查询缓存 / SQL AST / ORM 替换**（query-complexity-analysis 的中长期建议）：无判据无需求牵引，
   且与最小表面积原则冲突；等 Phase 0 基线数字说话。
3. **S1 同批计算无拓扑排序**：收敛性/正确性项（依赖级联事件二次修正），不按性能项处理，单独决策。
4. **r25#6 / r25#7 watch 项**：未构造出红例的正确性观察项，由 2.2 设计定谳或单独探针，不算性能债。
5. **post-pagination tie 的行为语义**：并入 2.2 一并处置（文档化「orderBy 建议携带 id 兜底」+ tiebreaker）。

---

## 八、执行顺序与依赖

```
Phase 0（判据设施 + 4 个现状红例 + 基线报告）
   ├─→ 1.1 A1 filtered targetPath（判据已备，护栏 = 计算 fuzz 扩 filtered relation property 格）
   ├─→ 2.1 B1 EXIST 跳出 JOIN 树（判据已备，护栏 = 驱动差分 fuzz）
   │      └─→ 2.2 B4 两段式改写（依赖 2.1 + 计数器 + 差分扩池；行为面配 CHANGELOG）
   ├─→ 1.2 A2 dict 全表收窄        ├─→ 2.3 B5 残余批量化（可并行）
   ├─→ 2.4 D1 索引声明面（依赖 0.2 对照数字 → 设计评审 → 迁移接线）
   ├─→ 3.1 C1 / 3.2 C2（可并行，改动面独立）
   └─→ 3.3 C3 迁移规模化（独立专项轮，护栏 = migration fuzz 全池）

A3 / A4 / B6：悬挂在 Phase 0.2 的基线数字上（measured-first，默认维持记录）
```

工作量画像（按改动侵入性）：Phase 0 = 测试设施 + 文档（零 src 行为变化）；
1.1 = `Scheduler.resolveFilteredUpdateEvent` + `aggregationTemplate` 守卫面 + fuzz 生成域扩张；
2.1 = `MatchExp.buildQueryTree` 单点 + 读语义回归；1.2 / 3.1 / 3.2 = 各自单文件级；
2.2 = `SQLBuilder` + `QueryExecutor` 的结构性改写（全计划最大项）；3.3 = `migration.ts` 专项轮。

---

## 九、执行台账（2026-07-16 收口轮，同分支 `cursor/performance-debt-plan-6433`）

按重要性逐项执行的结果；每项的红-绿证据与护栏见对应 commit 与 spec。

| 项 | 处置 | 关键产出 |
|----|------|---------|
| Phase 0.1 判据设施 | **落地** | `tests/runtime/helpers/perfProbe.ts`：执行路径计数器（compute 调用数 / fullRecompute 信封 reason / SERIALIZABLE attempt 数）+ SQL 语句记录器；登记册新增「执行路径断言」轴 |
| A1 filtered targetPath 风暴 | **定谳修正 + 顺产 fatal 修复**：判据落地后实测**记录已陈旧**——r19–r32 记录期间的历轮修复（`resolveFilteredUpdateEvent` 家族、聚合模板统一）已消除主风暴形态，但从未有判据能证明（值断言绿 ≠ 路径断言绿）。全部成员资格 × 操作 × 聚合形态格现为增量并被 `filteredRelationAggregationIncrementality.spec.ts` 钉死（fullRecompute=0、隔离级升级=0）。邻域扫描顺产 fatal：聚合 update 分支反查**缺宿主端约束**——共享 target 时每宿主增量读写第一条命中 link 的贡献状态（**值静默算错**；PGLite MVCC 行序轮转掩蔽、SQLite 确定性现形，计算 fuzz 仅跑 PGLite 因此失明） | `aggregationTemplate.ts` 宿主约束修复；`aggregationSharedTargetUpdate.spec.ts`（双驱动矩阵）；计算 fuzz 补 filtered relation property 格 + `FUZZ_COMP_DRIVER=sqlite` 轴（坏真值敏感性：旧代码 sqlite seed 11 红）；登记册新增「共享关联记录 × 增量反查唯一性」轴 |
| A2 dict 全表扫描（S3） | **收口（无界物化半场）**：keyset 分批（`GLOBAL_DEP_FANOUT_BATCH_SIZE`，orderBy id + cursor + limit）。列面 `['*']` 定谳为**公开契约**不裁剪——`compute(deps, record)` 可读宿主任意字段（`globalDataDependency.spec` 的 `context.price` 用法固化） | `Scheduler.ts` global 分支；`globalDepFanoutScan.spec.ts`（SQL 形状 + 值 + 空表退化格；红 on baseline） |
| B1 EXIST 入外层 JOIN 树 | **收口**：`buildQueryTree` 对 exist 原子终段 x:n 跳过入树（父路径保留；对称路径保守维持）。LIMIT/OFFSET 恢复下推、原始行无 fan-out、B3 判定自动精确化。顺带定谳基线既有缺口：exist 载荷内**嵌套 exist**（key 为关系属性）在基线就不工作（r25#7 邻族），记录不断言 | `MatchExp.ts`；`existJoinPruning.spec.ts` 7 格（3 格红 on baseline） |
| B2/B4 分页全量拉取 | **收口**：两段式根查询——第一段 `SELECT DISTINCT 根id+排序键`（LIMIT/OFFSET 在库端按根记录粒度生效；orderBy 已被 Modifier 限制为 x:1 → 每根恰一行），第二段 match 替换为 `id IN (页集合)`（fan-out JOIN 树消失）。r31 combined 幽灵值 CASE 门抽取为 `buildOrderByExpressions` 单一实现（两个消费方共用）。诚实边界：offset-only 无 limit / limit>500（占位符预算）回退旧后分页路径；findOne 单 SQL 热路径保留 | `SQLBuilder.buildPagedRootIdQuery` + `QueryExecutor`；`paginationPushdown.spec.ts` 20 格（双驱动：窗口滑动/x:1 排序键/DESC 等价/无排序/LIMIT 0/双回退/findOne/页内 x:n 装载/非扇出对照） |
| B5 残余 N+1 | **部分收口**：x:1 主干下 x:n 枝干补全批量化（IN + 反向分组，复用既有 helper）。边界（登记，保持逐条）：n:1 共享目标（对象别名泄漏改变公开契约——回归断言对象隔离）、label/goto 递归、per-parent limit/offset、n:n/对称反向、parentLink 侧枝干（第 1 步）与 link x:n 装载点 | `QueryExecutor.completeXToOneLeftoverRecords` 第 2 步；`xToOneTrunkBranchBatching.spec.ts`（O(1) 查询数红 on baseline） |
| C1 task 表只增不减 | **收口**：`Controller.cleanupAsyncTasks({statuses?})`——只清终态（applied/skipped）、协议态传入 fail-fast、**分区内有未投递行则整分区跳过**（防陈旧复活：isLatest 按分区内最大 id 判定）。用户显式调用（显式控制），usage 指南新增 Task Table Retention 节 | `Controller.ts`；`asyncTaskRetention.spec.ts` 3 格（清理语义/复活防护/协议态拒绝+global 上下文） |
| C2 级联深度上限 | **证伪并再定谳**：逐形态探针实测——combined 互 reliance 数据环**不可构造**（r27 同住认领守卫 fail-fast）；merged 1:n 互 reliance 环删除**正常终止**；300 深自引用链 <1s 无栈增长（async 递归不长原生栈）。深度熔断守卫反而会误伤合法深链（版本链），不加；三个边界钉为回归（未来回归以超时/断言现形） | `cascadeDeletionBoundaries.spec.ts` 3 格 |
| A3 / A4 / B6 | **维持记录（measured-first）**：待 Phase 0.2 bench 场景给出量级再决策（B6 在 B4 落地后大幅贬值——两段式主查询已无 fan-out 行可去重） | 计划 §四 1.3 |
| C3 迁移规模化 | **维持计划**：独立迁移专项轮（diff 产物形状牵动 approvedDiffHash/resume 兼容性，需版本化设计），不并入本轮 | 计划 §六 3.3 |
| D1 索引声明面 | **维持计划**：公开面设计决策（显式 `Index` Klass vs 自动索引），按计划 §五 2.4 待 bench 数字后评审 | 计划 §五 2.4 |
| Phase 0.2 微基准 harness | **未落地（顺延）**：本轮判据全部用确定性计数器表达（红-绿可 CI）；wall-clock 趋势基线待 A3/A4/B6/D1 决策需要时补 | 计划 §三 0.2 |

**本轮 escape 教训（升华为机制）**：①「值断言绿 ≠ 路径断言绿」——全量兜底把路由缺陷折叠成"值对但慢"，十轮记录期间无人能红-绿验证；执行路径计数器现为登记册常备轴。②「无唯一性保证的 findOne 当"恰好那条"用是潜伏缺陷类」——A1 顺产 fatal 的根因；且其掩蔽机理（MVCC 行序轮转）证明**行扫描序是驱动差异轴的取值**，PGLite-only 的值预言机对扫描序敏感缺陷失明（计算 fuzz 增设 sqlite 变体）。

---

## 十、全局风险与护栏

1. **决策流契约**：任何 fuzz 生成域扩张都要区分「动没动共享生成器（fuzzSchema/fuzzOps）的
   rng 消费序」——动了必须按 AGENTS.md 重验全部依赖套件的基础种子池（storage 1–499 等）；
   只动单套件自身决策流（如 1.1 的计算格菜单）则该套件以新种子宇宙重验即可。
2. **行为收紧面**：A1 让十轮以来恒全量的路径变增量——增量与全量必须对同一事件流等值
   （计算 fuzz 的朴素对拍就是这条等值公理的机器化）；B4 改变 SQL 形状，驱动方言面须
   真实 PG + MySQL 全测（r27 I-3 的教训：方言不匹配的探针是假绿）。
3. **性能不回退的机制化**：每期落地的计数器断言进对应回归 spec（确定性、CI 常跑）；
   bench 进 nightly 不阻塞 PR；新的性能敏感路径在登记册「执行路径断言」轴下登记。
4. **诚实边界**：随机化与计数判据不证明「不慢」，只证明「指定场景下计数不劣化」；
   per-parent limit 等语义上不可批量的形态登记为永久边界，不伪装成待办。
