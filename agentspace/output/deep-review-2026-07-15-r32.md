# 记录项完成轮报告（2026-07-15 第三十二轮）

- 日期：2026-07-15
- 基线：`main` @ `eff9bbdd`（r31 全部修复已合入；v4.1.4 + 未发布的 r31 批次）
- 性质：**记录项完成轮**——不是新一轮探查，而是把 r28–r31 报告中登记为「待下轮 / 开放家族 /
  记录项」的全部未完成项逐一收口。范围来源：r31 §四「诚实边界」、r30 §四「记录，本轮不修」、
  r29 §1.4b「开放家族」、r28 §四「记录，本轮不修」、r27 §四 #7、quality-plan 登记表。
- 分支：`cursor/complete-recorded-items-a899`
- 修复后健康度：`npm run check` 通过；`npm test` 全量 **2184 passed / 41 skipped**（净增 15 用例）；
  真实 PostgreSQL 16 七套件 **33 passed**；真实 MySQL 8 env-gated 五套件（新增 id 对账探针）全绿；
  fuzzer 全池绿：storage base 100 种子 ×40 ops + extended 120（**含解锁后的 merged full domain**）+
  默认 CI 池、驱动差分 60、计算生成 60、迁移生成 30（含 kill-resume）。

---

## 一、处置总表

| 来源 | 项 | 处置 |
|------|-----|------|
| r31 §四边界 #1 | `_System_` set(concept,key) 竞态 | **已修复**：(concept,key) 复合唯一 + `RetryableWriteConflict` 转换（`_Dictionary_` 兄弟轨同构收口）。回归 r32-A1/A2 |
| r31 §四边界 #2 | 迁移 patch 事件 oldRecord 完备性的直接行为断言 | **已落**（r32-C）：三级 Transform 链 × filtered 成员资格进/出双向 × 迁移端到端——并当场抓获同族更深缺陷（见 §二.2） |
| r31 §四边界 #3 | enforceXToOnePredicates 批量化 | **已实现**：谓词纯关联侧时按父 id 集合批量（IN + 命中集判存活）；pair 敏感谓词（link 属性谓词/`&`/引用值/EXIST）保持逐父——健全性守卫测试 r32-storage-A2 固化「集合探针会把 P1 的合格边误判给 P2」的不可批量面 |
| r30 §四 E | Transform 链上游收缩的迁移死路（fatal 开放家族） | **已修复**（见 §二.1）：级联感知 destructive scope（回滚事务内模拟执行）+ 执行期删除审计。回归 r32-B1–B4 |
| r29 §1.4b EXT-1 | merged input 作为 x:1/combined 端点的 Setup 装配错位（开放家族） | **已修复**（见 §二.3）：视图 `record.table` 指针统一以 recordToTableMap 为真相源；`FUZZ_MERGED_FULL` 门移除、生成域解锁（full-domain 种子 1–90 绿）。回归 r32-storage-B1/B2 |
| r28 §四 #1 | SQLite/MySQL `_IDS_` 不自举 | **已修复**：`setupRecordSequences` 落地两驱动（MAX(id) 对账、只前进）。实测定谳比登记更严重：SQLite 逻辑 id 列无唯一索引，撞号是**静默**双行（非 fail-loud PK 冲突）。回归 r32-storage-C1 + MySQL env-gated 探针 |
| r28 §四 #2 | 非空约束违规未映射 | **已修复**：`normalizeDatabaseError.isCheckViolation` + `mapConstraintError` 归一为 `ConstraintViolationError`（kind 'non-null'，仅框架声明的约束，用户自建 CHECK 不在辖区）。回归 r32-D |
| r28 §四 #3 | 重复 Dictionary 名报错质量 | **已修复**：Controller 构造期 fail-fast（用户语言指出两个同名 Dictionary.create）。回归 r32-E |
| r28 §四 #4 | Activity 跨层 Transfer 孤儿 group | **确认已由 r30-D2 收口**：跨层端点 build 期拒绝；同层孤儿 group 由 start/end 基数检查拒绝（复核，无缺口） |
| r28 §四 #5 | NOT(combined 路径) 三值逻辑分歧 | **已定谳（契约决策）并文档化**：combined 路径按经典二值求值——未配对行满足否定（同行编码没有"关联行缺席"的 NULL 行形态）；与 LEFT JOIN 三值语义的差异是拓扑可见的既定行为。文档化于 `buildCombinedSegmentGates` 收敛点 |
| r28 §四 #6 | MySQL 套件并行互扰 | **已修复**：`mysqlOpenIdempotency` 连接计数按本套件独占 database 过滤（各套件共用 MySQL 用户、库名唯一）。五套件并行实测绿 |
| r27 §四 #7 | Property.public.type.options 函数形态 / Entity.commonProperties 谓词读错字段 | **已修复**：静态数组 + 谓词按 create args 契约读 commonProperties。兄弟面扫描：全 core 无其余函数形态 options；Relation 的实例命名谓词读的字段名恰与 args 同名（工作，仅命名误导） |
| r30 §五 | deepMatch 空对象/空数组语义 | **已文档化**：partial-match 语义下空模式 vacuous 恒真（「是某个对象」而非「为空」），精确形状匹配不在声明面表达域。文档化于 deepPartialMatch（与 ComputationSourceMap.deepMatch 同语义） |

未在本轮处置（维持记录，理由如注）：RealTime 时间调度器（特性级缺口，需产品设计）、
MySQL TIMESTAMP 列型（等 MySQL 驱动整体升级）、legacy operationKey 回退 / `#occurrence`
计划序（一次性过渡机制的窄退化格）、`{id: null}` 第三种清除写法（r27 已定谳不收紧）、
filtered targetPath 风暴 / dedupe 扇出 / 深嵌 EXIST 别名 / post-pagination tie（性能项）、
生成域剩余扩张（事件驱动计算 / async / 事务交错 / activity 层 / 迁移破坏性变异 / taboo
声明形态——quality-plan §1.3/§1.5 的既定路线，属专项轮工程）、`getAttributeQueryDataForRecord`
深度契约显式化与「分类⇒消费」守恒律审计（quality-plan §二 支柱项）。

---

## 二、三个深项的机制

### 1｜r30-E：级联感知的破坏性 scope（迁移引擎级）

**死路的两道门**（此前）：链式依赖计算（TransformB）对上游收缩的级联删除
(a) 无法进入 scope——`getDestructiveDeletionScope` 按**迁移前**数据独立评估各计算，依赖的
删除集取决于上游**迁移后**状态；(b) `writeComputationPatch` 对 entity/relation delete patch
**无条件拒绝**。用户手工补批准会撞第三道门：入口断言要求「批准 ⊆ 一阶 actual」。
kill-resume 每次走进同一条死路。

**修复架构（三层）**：

1. **发现层**（`getCascadeAwareDeletionScope` + `simulateCascadeDeletionScope`）：在「将被
   回滚的事务」内**真实执行** rebuildPlan（同一 MigrationScheduler / 同一写路径；
   preRecomputeDDL 事务内先行应用——要求事务性 DDL，MySQL 直接回退），收集每个计算实际
   执行的删除。忠实性来自「与真实迁移共用同一引擎」——链式 Transform、级联依赖的
   `_isDeleted_` 宿主、seed 的 stale 清理全部精确。模拟不可行（无 queryHandle 且无
   readHandle、缺 handler、MySQL）→ 回退分析性一阶 scope（exact=false）。
   模拟期临时注入 readHandle/schema/map 并清空 mutation callbacks（事务回滚撤销全部写入，
   但监听者内存状态不可回滚——不能让它们观测到幻影事件）。
2. **入口断言**（migrate 入口）：模拟可用 ⇒ ids 双向精确对账（dryRun 即可发现差异）；
   不可用 ⇒ 只查存在性，ids 精确性推迟到执行期。
3. **执行期审计**（`MigrationScheduler` 收集 + `assertExecutedDeletionsApproved`）：删除
   乐观执行、以 delete 事件出账（stale 清理 / takeover 清空 / delete patch / 硬删除重算
   四条来路收敛到一个收集点），重算结束时与已批准 scope **双向精确对账**——不一致则抛错，
   外层 SERIALIZABLE 事务回滚。**未经审计的销毁依然无法提交**，且错误一次性给出全部差异
   （含级联删除的精确 id），批准后单次重试收敛（B4 固化回退环路的收敛性）。

**契约演化**：`writeComputationPatch` 的无条件拒绝与 `recomputeTransformOutput` stale 轨的
逐 id fail-fast 全部收敛到执行期审计（per-branch 守卫 → 单一 choke point）；migration.spec
的 opt-in 测试按新契约更新（批准生成的 diff = 知情 opt-in，单轮收敛；无/错 ids 的批准依旧
`/scope mismatch/` 拒绝且整体回滚）。

### 2｜r31 测试债引出的同族深缺陷：迁移 patch 事件流以 storage 事件为真相源

写 r32-C（三级链 × filtered 成员资格 × 迁移）时，正面断言当场红：手工合成的 patch 事件
只有裸 update——**filtered entity 成员资格退出的派生 delete 事件在合成流里根本不存在**，
链式依赖的聚合对退出面完全失明（sum 残留退出成员的旧值）。r31 修的是「oldRecord 不完备」，
但同一合成点还有「派生事件缺失」这另一半——live 轨的事件真相源是 storage 写路径的完整产出。
收敛修复：`applyResult`/`applyResultPatch` 增加可选 storageEvents 捕获参数，
`writeComputationPatch` 与 property 轨的 `writeComputationResult` 直接转发 storage 事件流
（完整前态 + 派生事件）。entity/relation 的 eventRebuildHandler 全量替换轨刻意不流事件
（授权模型是人工批准的 handler + 依赖走全量 rebuild）；global dict 无派生事件保持合成。

### 3｜EXT-1：视图 table 指针的真相源

r29 初判「rebase 后字段落错表」不准确。真机制：`assignTableAndField` 刻意跳过 filtered
记录的 table 赋值（注释声称它们不在 recordToTableMap——**与 buildEntityRecords 的注册代码
直接矛盾**），于是视图的 `record.table` 停在创建期快照。merged input 作为 x:1/combined
端点时，对视图端点的合表**实际移动整个物理 base**（视图共享 base 的行），快照失联：
查询 JOIN 落在幽灵表（`no such column`）+ buildTables 按幽灵指针建出**第二张**携带
merged 列的物理表。收敛修复：record.table 一律以 recordToTableMap（joinTables/rename
全程维护、含视图名）为真相源。生成域解锁后 full-domain 种子 1–90 + extended 120 全绿。

---

## 三、顺产发现（完成记录项时抓获的新缺陷）

| 缺陷 | 严重度 | 机制 |
|------|--------|------|
| r31 `_Dictionary_` 唯一约束使 **MySQL setup 全量崩溃** | fatal（MySQL 面） | MySQL 方言 `constraints.unique=false`，`createConstraintSQL` 对内部约束同样 fail-fast——r31 加约束时 MySQL env-gated 套件静默跳过，无人发现框架在 MySQL 上完全不可用。修复：`shouldSkipConstraintForDialect`（内部 kv 约束 best-effort 跳过；用户约束依旧 fail-fast）接线 setup 与迁移计划两个消费点 |
| MySQL information_schema **列头大写** | fatal（MySQL 迁移/attach 面，沉睡） | MySQL 8 的 information_schema 视图返回大写列头（与查询书写无关），`getExistingTables`/`getExistingColumns` 读 `row.table_name` 恒 undefined——manifest 判存、hasExistingData、additive DDL 规划在整条 MySQL 路径上从未工作。r24「沉睡面」家族：路径从未被 env-gated 套件走过。修复：显式 alias |
| SQLite `_IDS_` 撞号是**静默**双行 | 定谳升级 | r28 登记为 fail-loud PK 冲突；实测逻辑 id 列无唯一索引，`u3` 静默拿到与 `u1` 相同的 id——静默数据损坏，比登记严重一级 |
| 迁移 patch 事件缺派生事件（§二.2） | fatal（迁移链上 filtered 依赖） | r31 修复的合成点还有另一半缺口；由 r31 测试债的正面断言当场抓获 |

**方法论注**：四个顺产发现全部来自「补测试债 / 建方言匹配探针」的动作本身——r31 复盘
规则 7（方言匹配探针）与规则 2（断言深度×夹具敏感度）的又一实证：**登记的测试债不是
文档债，是未爆弹的引信**。

---

## 四、机制化收口清单

1. **fuzzer 生成域解锁**（EXT-1）：merged × x:1/combined 端点回归默认 extended 域——该形状
   家族从此由机器铺格（mergeLinks 端点仍排除，登记为未定谳面）。
2. **MySQL 方言匹配探针**：`mysqlIdSequenceReconcile.spec.ts`（env-gated）——首个覆盖
   「MySQL × setup(false) attach × 迁移路径入口」的探针（顺手唤醒了两个沉睡的 fatal）。
3. **执行期删除审计**（r30-E）：任何迁移删除以 delete 事件出账 + 双向对账后才能提交——
   destructive-scope 的守恒律从「入口预测」升格为「执行事实核对」。
4. **迁移事件流真相源统一**（§二.2）：patch/property 轨直接转发 storage 事件（含派生事件），
   合成点从此只剩 global dict 与 takeover 强制事件两个显式豁免。
5. **契约文档化**：NOT(combined) 二值决策（buildCombinedSegmentGates）、deepMatch 空模式
   vacuous 语义（deepPartialMatch）、内部约束 best-effort 契约（shouldSkipConstraintForDialect）。

## 五、验证证据链

- ✅ `npm run check`
- ✅ `npm test` 全量 2184 passed / 41 skipped（基线 2169/40；新增 r32 回归 15+，唯一新增 skip
  是 MySQL 探针的 env-gate）
- ✅ 真实 PostgreSQL 16：`npm run test:postgres` 七套件 33 passed
- ✅ 真实 MySQL 8：mysqlIdSequenceReconcile + mysqlOpenIdempotency + mysqlMigrationOperationKey +
  driverCloseIdempotency + r26-leftovers 并行全绿（并行互扰假红已修）
- ✅ fuzzer：storage base（FUZZ_SEED_START=100 COUNT=100 OPS=40）108 绿；extended 1–120 绿
  （merged full domain 解锁后）；默认 CI 池绿；full-domain 种子 1–90 绿（收口前 seed 2/10/50/71/72/81 红）
- ✅ 驱动差分 60 种子、计算生成 60 种子、迁移生成 30 种子（含 kill-resume 注入）全绿
- 红-绿：EXT-1 最小复现（seed-2 精确复刻）在修复前红（`no such column: FzS2_B_in4.fzs_a_1l8srxf`
  + 幽灵表）、修复后绿；r30-E 复现（Product/Deal/Promo 链）修复前「无法批准的 scope mismatch
  死循环」、修复后单轮批准收敛；r32-C 在 §二.2 修复前红（sum=50）、修复后绿（sum=30）。
