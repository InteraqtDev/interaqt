# 全代码库深度 Review 报告（2026-07-15 第三十一轮）

- 日期：2026-07-15
- 基线：`main` @ `550d616f`（v4.1.4，r1–r30 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **2138 passed / 38 skipped**；真实 PostgreSQL 16 就绪
- 范围：五路并行深度探查（runtime 事件驱动计算 / storage 读写路径 / builtins 交互与活动 / 迁移与并发 / drivers 与 core 声明层），聚焦 r30 报告点名的未覆盖侦测面——事件驱动计算的**消费侧**、r30 修复的兄弟面（挂载深度）、守卫边界的退化输入、声明期校验缺口
- 方法：与 r1–r30 全部报告逐条去重；每个候选先以最小复现实测定谳（scratch spec 红/绿判定），再按 fix-the-class 清单收敛
- 修复状态：**四个致命/fail-open 已修复** + 六项硬化（本分支 `cursor/deep-code-review-r31-07e2`）；回归固化于 `tests/runtime/review-fixes-2026-07-15-r31.spec.ts`（6 用例）、`tests/storage/review-fixes-2026-07-15-r31.spec.ts`（7 用例）、`tests/core/review-fixes-core.spec.ts`（+3 用例）、fuzzer 预言机 7b-deep、真实 PG timestamp 探针

---

## 一、结论摘要

| 级别 | 编号 | 主题 | 状态 |
|------|------|------|------|
| 致命（静默转移失效 / 派生数据缺失） | A | 事件驱动计算的消费者与匹配器读不同事件视图（r20 契约的消费侧缺口） | 已修复 |
| 致命（静默错误读结果） | S1 | filtered x:n relation 嵌套在 x:1 主干下时结果挂到 base 名（r30 修复的挂载侧兄弟面） | 已修复 |
| 致命（守卫 fail-open） | B1 | `required` payload 字段被显式 `undefined` 绕过全部校验 | 已修复 |
| 致命（静默 schema 损坏，声明期） | C1 | merged (union) 同名 property 类型冲突静默 last-wins——先处理 input 的列被重定型 | 已修复 |
| 硬化（fatal-when-triggered） | H1 | StateMachine computeDirtyRecords 去重用裸值 Set（string/number id 分裂时同一事件连走两个状态） | 已修复 |
| 硬化（一致性/契约） | H2–H6 | DeletionExecutor 事件富化 Map 裸 id、迁移 destructive count 误报全表、通用 SQLITE_CONSTRAINT 误判 unique、PG/PGLite Date 参数 JSON.stringify、非函数 defaultValue/computed 静默失效 | 已修复 |
| 硬化（静默死转移/过触发家族，A 的枚举顺产） | H7 | trigger/eventDep 模式外层字段无守卫：typo 字段 trigger 轨永不触发、eventDep 轨静默丢弃过滤条件 | 已修复 |
| 记录项完成轮（r31b/r31c） | — | 初版 §四 全部记录项收口：嵌套 x:1 谓词强制执行（fatal 家族）、combined ORDER BY 幽灵排序（定谳为真 bug 并修复）、dict 竞态（r12-I-1）、eventDep keys、活动定义漂移守卫、计算属性类型变更迁移盲区、迁移 patch 事件前态、PGLite 复活、三项契约定谳/文档化 | 已完成（见 §四） |
| 记录（本轮不修，有明确理由） | — | 见第四节 | 记录 |
| 证伪 | — | 见第五节 | 证伪 |

**本轮最深的一课**：A 与 S1 都是**已有修复的"同一契约、另一读者/另一面"**——A 是 r20「合并视图匹配」契约只统一了匹配器、没统一消费者（存活 11 轮）；S1 是 r30「alias 挂载」修复只修了读取父级 x:1 的面、没修挂载 x:n 结果的面（同一 PR 引入的约定自己没铺满）。fix-the-class 清单第 1 条的「枚举全部读者」必须包含**时间维度**：契约建立时的读者枚举≠契约的完整读者集合，每个后续新增的消费点都默认继承契约却没人验证。

---

## 二、致命问题（已修复确认）

### A｜事件驱动计算的消费者收到 partial record，匹配器却按合并视图命中（fatal，r20 契约的消费侧缺口）

- **位置**：`Scheduler.computeEventBasedDirtyRecordsAndEvents`（收敛点）；受影响消费者：`StateMachine.computeTarget` / `computeValue`（Global + Property 两个 handle）、Transform 事件驱动 callback、事件驱动 `incrementalCompute/incrementalPatchCompute`。
- **症状**（复现实测，PGLite）：
  - StateMachine：`trigger: {recordName:'Post', type:'update', record:{status:'published'}}`，`computeTarget: (e) => e.record.status === 'published' ? {id: e.record.id} : undefined`。只更新 title → 合并视图（status 已是 published）命中 trigger，但 computeTarget 收到 partial record（无 status）→ 返回 undefined → **转移无声失效**（flag 停在 normal）。
  - Transform 事件驱动：`callback: (e) => ({docTitle: e.record.title})`，只更新 status → 命中，但 title 不在 partial record → 派生记录 `docTitle: undefined`（**字段静默缺失**）。
- **机制**：update 事件的 `record` 只携带本次写入的字段（keys + id）。r20 把 trigger / eventDep 的 record 模式匹配统一到合并视图（`mergedMutationEventView`，`{...oldRecord, ...record}`），但命中后交给消费者的仍是原始事件——「匹配命中但回调读不到命中所依据的字段」。同一声明面（RecordMutationEventPattern）的读者分两个阶段：匹配阶段（r20 统一）与消费阶段（本轮统一）。
- **修复（收敛点）**：`computeEventBasedDirtyRecordsAndEvents` 对事件应用一次 `mergedMutationEventView`，`computeDirtyRecords` 与配对给 `runComputation` 的事件都用合并视图。`keys` / `oldRecord` 原样保留——「本次更新触及了哪些字段」的语义仍由 keys 表达（回归 A2 断言 callback 收到的 keys 只含 status）。
- **读者枚举**：
  - 事件驱动轨的全部消费入口：computeDirtyRecords（StateMachine computeTarget / Transform 返回 `[{}]`）✅、事件驱动 incrementalCompute（StateMachine findNextState + computeValue）✅、incrementalPatchCompute（Transform callback）✅——全部经收敛点；
  - **数据驱动轨刻意不合并**：`shouldTriggerUpdateComputation` 的 hasOwnProperty 语义、聚合增量的「本次写入了什么」判定依赖 partial record——两轨语义不同是既有契约（数据驱动读新旧值对比，事件驱动读模式匹配视图）；
  - 迁移轨：事件驱动计算在迁移中只走 eventRebuildHandler（全量语义，`runIncrementalRecompute` 对无 handler 的事件驱动计算 fail-fast），不消费 partial record ✅；
  - `mergedMutationEventView` 幂等（重复应用产出同一对象），TransitionFinder 内部的再次合并无害 ✅。
- **回归**：`review-fixes-2026-07-15-r31.spec.ts`（runtime）A1（computeTarget 合并视图）/ A1-guard（不匹配的 current 不误触发）/ A2（Transform callback 合并视图 + keys 语义保留）。

### S1｜filtered x:n relation 嵌套在 x:1 主干下：结果挂到 base 属性名（fatal，r30 修复的挂载侧兄弟面）

- **位置**：`QueryExecutor.completeXToOneLeftoverRecords`（两处）、`findXToManyRelatedRecords` / `findXToManyRelatedRecordsBatched` 的 link x:n 挂载、`findRecords` 步骤 2 的 link x:n 挂载。
- **症状**（复现实测，SQLite）：`User --n:1--> Dept --1:n--> Employee`（link 属性 isActive），filtered relation `ActiveDeptEmployee`（`Dept.activeEmployees`）。`find('User', ['dept', {attributeQuery: ['activeEmployees']}])` → `dept.activeEmployees` **undefined**，过滤后的子集挂在 `dept.employees` 下（谓词生效但挂载名错误）。同时请求 base 与 filtered 时两者互相覆盖。顶层查询（`find('Dept', ['activeEmployees'])`）一直正确——只有 x:1 主干下的补全枝干走错。
- **机制**：AttributeQuery 把 filtered relation 解析为 `attributeName = base 属性名, alias = filtered 名`。顶层 x:n 挂载（findRecords 步骤 3）用 `alias || attributeName`（r30 起），但 **x:1 主干的 x:n 补全枝干**（completeXToOneLeftoverRecords 步骤 2）挂载用 `attributeName`——同一「结果按 alias 挂载」契约在不同结构深度有独立实现点，r30 只修了「读取父级 x:1」的面（`subResultKey`），挂载面漏网。
- **修复（收敛点）**：全部子查询结果挂载点统一 `alias || attributeName`（补全枝干步骤 1 的读取+挂载、步骤 2 的挂载、三处 link x:n 挂载）。alias 对非 filtered 关系恒等于 attributeName——对普通关系零行为差异。
- **读者枚举（挂载/读取点全查）**：findRecords goto（✅ r30 前已 alias）/ 步骤 2 link x:n（本轮）/ 步骤 3 顶层 x:n（✅）/ batched resultKey（✅）+ batched link x:n（本轮）/ findXToManyRelatedRecords link x:n（本轮）/ completeXToOneLeftoverRecords 步骤 1 读取+挂载（本轮）、步骤 2 挂载（本轮）、步骤 2/3 读取（✅ r30）；structureRawReturns 经 nameContext（✅ alias）；pruneUnpairedCombinedReads resultKey（✅ alias）。
- **机制化收口**：fuzzer 预言机 **7b-deep**（filtered 嵌套读取完备性 × 挂载深度）——经「parent --x:1--> host」进入的 filtered 属性读取必须给出与 link 面一致的配对。敏感性实验：回退修复后 extended seed 9/26/31 当场变红（红点即 S1 损坏面），恢复后 base 200 + extended 120 + filtered 60 全绿。纯读取侧断言、零 rng 调用，既有种子池全部有效。
- **回归**：`review-fixes-2026-07-15-r31.spec.ts`（storage）A（filtered 挂载）/ A2（base+filtered 同时请求不互相覆盖）/ A-guard（非 filtered 不受扰）。

### B1｜`required` payload 字段被显式 `undefined` 绕过（fatal，守卫 fail-open）

- **位置**：`checkPayload`（`Interaction.ts`）。
- **症状**（复现实测）：`PayloadItem.create({name:'title', type:'string', required:true})`，`dispatch(CreateDoc, {payload: {title: undefined}})` → **无任何错误**（缺键形态 `{}` 则正确报 missing）。键在场使 `'title' in payload` 通过 required 检查，值为 undefined 又走 `continue` 跳过**全部**后续校验（类型/isRef/base 存在性检查一并跳过）。
- **修复**：required 按「值是否为 undefined」判定（undefined 值与缺键在 JSON 语义下等价于"未提供"）。同时：
  - **非对象 payload**（string/array）声明期干净拒绝（此前 `Object.keys('oops')` 枚举出下标 → "0 in payload is not defined" 这类与用户写法脱节的错误）；
  - **`cloneDispatchArgs` 不再把数组 payload 展开成普通对象**（`{...[1,2]}` → `{0:1,1:2}`——守卫看不到"payload 是数组"这个非法形态，克隆不得改变形状）。
- **读者枚举**：checkPayload 是 required 声明的唯一消费点；`runInteractionGuard` 是 standalone 与 activity-wrapped 两条轨的共用守卫（注释已声明），一处修复覆盖两轨 ✅。原型链注入（`Object.create({title:...})`）已被 cloneDispatchArgs 的 own-key 展开中和（实测确认）✅。
- **回归**：`review-fixes-2026-07-15-r31.spec.ts`（runtime）C（合法值通过 / 显式 undefined 拒绝 / 非对象 payload 干净报错）。

### C1｜merged (union) 同名 property 类型冲突静默 last-wins（fatal，声明期 schema 损坏）

- **位置**：`MergedItemProcessor.mergeProperties`（两处 `Object.assign` 合并点）。
- **症状**（复现实测，PGLite）：`A{score: number}`、`B{score: string}`、`M = merged(A, B)` → setup 成功，物理列 TEXT，且 **A 自己的 score 列元数据也变成 string**（同名属性共享同一物理列）——A 的 number 数据以 TEXT 存取，读回类型漂移，零告警。
- **机制**：union 合并的 propertyMap 直接 `Object.assign`，后处理的 input 覆盖先处理的。`commonProperties` 有 name+type 一致性校验，但**非 common 的同名属性**没有——同一约束（同名 ⇒ 同列 ⇒ 必须同型）只在一个入口执行。
- **修复（收敛点）**：抽出 `mergeCompatiblePropertyMap`，两处合并点（直接 input + 嵌套 merged 子孙）全部经它——同名但 `type` 或 `collection` 形态不一致时声明期 fail-fast（错误信息给出冲突双方与对齐建议）。commonProperties 种子的 map 同样受保护（后续 input 与 common 冲突同样拒绝）。
- **回归**：`review-fixes-2026-07-15-r31.spec.ts`（storage）B（冲突拒绝）/ B-guard（同名同型仍正常工作，input 写入经 merged 读回）。

---

## 三、硬化（已修复）

### H1｜StateMachine computeDirtyRecords 去重用裸值 Set（fatal-when-triggered）

两个 transfer 共用 trigger 而 computeTarget 分别返回字符串 id（用户载荷形态）与原生 id（存储查询形态，SQLite number）时，`Set.has(record.id)` 判不等 → 同一记录被 incrementalCompute 处理两次 → **一次事件连走两个状态**。修复：`String(id)` 归一（与写路径 `sameRecordId` 同族约定）。回归：runtime B（SQLite 上两形态 computeTarget，一次 update 恰好走一步）。

### H2｜DeletionExecutor 级联事件富化 Map 用裸 id 键

`deleteDifferentTableReliance` 的 `recordsById` Map 裸 id 键；id JS 形态分裂时 link delete 事件端点富化被静默跳过（thin 事件）。修复：`String(id)` 键 + 查找归一（r28 F-3 家族的事件面兄弟格；QueryExecutor 批量回填已有同款约定）。

### H3｜迁移 destructive scope 的 count 误报全表

`getDestructiveDeletionScope` 的 `count: ids.length || records.length`——硬删除重算结果为「一行都不删」（ids=[]）时 `0 || n` 把 count 误报成全表行数，审查面误导（执行面靠 ids 对账仍正确）。修复：能重算时 count = ids.length（含 0）；无法重算时 = 存量行数上界。回归：runtime D。

### H4｜通用 SQLITE_CONSTRAINT 误判为 unique violation

`normalizeDatabaseError` 把通用码 `SQLITE_CONSTRAINT` 列入 unique 判定——NOT NULL / CHECK / FK 失败携带该通用码时被误类型化（调用方按"重复键"处理）。修复：移除通用码（真 unique 由扩展码 `SQLITE_CONSTRAINT_UNIQUE` 或消息文本识别）。回归：storage C（三形态）。

### H5｜PG/PGLite 驱动对 Date 参数 JSON.stringify

insert/update 的参数映射把 Date 序列化成**带引号**的 JSON 字符串（`'"2026-…Z"'`），能否入库完全依赖 PG datetime 解析器对双引号的历史容忍（实测目前恰好工作——分类为契约脆弱性而非现行损坏）。修复：Date 原样交给驱动绑定，与 MySQL（r26 已排除 Date）同一契约。方言匹配探针：真实 PG 的 `postgresqlDataConstraints.spec.ts` 新增 timestamp insert/update round-trip（AGENTS.md 清单第 7 条——PGLite 不能替代 pg 客户端的参数序列化路径）；PGLite 面固化于 storage 回归 D。

### H6｜非函数 defaultValue/computed 静默失效

`Property.create({defaultValue: 'user'})`（直觉写法）被接受，但写路径只对 `typeof === 'function'` 求值——字段落 NULL、零告警的声明失效；Dictionary.defaultValue 在迁移回填面还会抛裸 TypeError。修复：Property/Dictionary create 期拒绝非函数 defaultValue（Property.computed 同）。**连带修正三份 usage 文档**（`02-define-entities-properties.md`「Static Default Values」一节等 13 处字面量示例——面向生成 agent 的文档在教被静默忽略的 API，19-common-anti-patterns.md 早已声明这是反模式）。回归：core +3 用例。

### H7｜trigger/eventDep 模式外层字段面守卫（A 的读者枚举顺产的家族收口）

修 A 时枚举 RecordMutationEventPattern 声明面的读者，暴露出同一声明面上还有一个**无守卫的静默失效家族**：模式的外层字段名是框架定义的闭 world（recordName/type/keys/record/oldRecord），但两个消费轨对未知字段都是静默的——
- **trigger 轨（under-trigger）**：`trigger: {recordName, type, recrod: {...}}`（typo）经 deepPartialMatch 在事件上永远找不到该字段 → transfer **永不触发**（静默死转移，与 r18 死监听同族，第三根轴）；
- **eventDep 轨（over-trigger）**：注册面只拷贝已知字段，typo 的 `record` 或 trigger 才支持的 `keys` 被**静默丢弃** → 过滤条件消失，依赖对每个匹配事件都触发（静默过触发/过派生）。

修复（收敛点）：`validateMutationEventPatternSurface`（TransitionFinder.ts，与 mergedMutationEventView 同处——声明面的读写逻辑集中一处），StateMachine 双 handle 的 trigger 校验与 Transform eventDeps 构造期共同接线；`record`/`oldRecord` 非对象模式（原始值/数组永不匹配对象事件）与非法 `phase` 一并拒绝；eventDep 传 `keys` 给出指路错误（callback 内经 `event.keys` 过滤，或改用支持 keys 的 StateTransfer.trigger）。全仓扫描确认无既有合法声明受影响。回归：runtime E/E2（typo trigger / eventDep keys / typo eventDep / 非对象 record 模式四形态）。

---

## 四、记录项完成轮（r31b/r31c，应「继续完成剩余所有工作」指令全部收口）

初版 §四 的记录项在同轮的后续批次中全部完成或定谳。逐项处置：

| 项 | 处置 |
|----|------|
| Transform eventDeps 无法表达 `keys` | **已实现**：EventDep 类型 + 注册透传 + `shouldTriggerEventBasedComputation` 子集匹配（与 trigger.keys 同一契约）；keys 取值校验（非空 / 仅 update / 声明过的值属性）经 `validateMutationEventPatternKeys` 与 trigger 共用一个实现。迁移签名经 argsSignature 深遍历自然覆盖。回归：runtime E2/E3 |
| 活动定义变更 vs 在飞实例 | **已收口（临时 fail-fast，r30 规则 4）**：resume 水合对「分支数漂移」（any 类剪枝组只查上界，every 严格相等）与「节点 uuid 不可解析」抛 `ActivityStateError`（此前：every 组静默跳过新分支 / 裸 TypeError）。回归：r31b-C（含未漂移对照）；全量套件回归中修正了 any-group 剪枝的误伤 |
| `_Dictionary_` find-then-write 并发竞态（r12-I-1） | **已修复**：DictionaryEntity key 唯一约束（守恒律入 schema）+ `setDictionaryValue` create 轨把唯一冲突转成 `RetryableWriteConflict`（新可重试事务错误类）——dispatch 重试后 findOne 命中已提交行、走 update 轨收敛。真实 PG 并发回归（env-gated）+ PGLite 确定性回归。`_System_` 的 set(concept,key) 同族轨见诚实边界 |
| 计算型 property 的 type/fieldType 变更迁移盲区 | **已修复**：`getStorageBlockingChanges` 对 computed 属性不再豁免类型/collection 对比（compute-route DDL 无 ALTER COLUMN）；物理路径迁移豁免保留（rebuild 回填新列）。fact→computed 同型接管不受影响。回归：r31b-D |
| 迁移 patch 事件的 oldRecord 不完备 | **已修复**：`writeComputationPatch` 在 apply **之前**读真实前态——entity/relation update/delete patch 携带完整 previousRecord 为 oldRecord（此前 {id}-only）、property/global patch 携带真实 previous（此前强制 undefined）。链式依赖的合并视图匹配 / oldRecord 读取在迁移期与 live 轨同契约。回归安全性由 migration 套件（95）+ 真实 PG 迁移套件 + 迁移生成 fuzz（30 种子含 kill-resume）覆盖 |
| ScopedSequence 的 match 字段语义 | **已定谳（契约决策）**：match 是 **create-time 过滤器**——编号后 match 字段可自由流转（业务字段如 status 的正常更新不受限，号码保留）、创建时未命中的记录永不补编号。契约文档化于核心类型 jsdoc（ScopedSequence.match），与 scope 的不可变守卫显式对照 |
| combined x:1 的 ORDER BY 幽灵排序 | **已定谳（真 bug）并修复**：以 R28o 装配（B 与 C—D 配对孤儿同住）实测——读取面 prune 正确置 null、排序面按幽灵 label 排序（DESC 下孤儿排最前）。修复：`buildModifierClause` 对路径中每个 combined 段生成 link-id CASE WHEN 门（与 match 面 buildCombinedSegmentGates 同一真相源）。回归：r31b storage（DESC/ASC 双向 + 读取面对照） |
| filtered 属性路径在 orderBy / isReferenceValue 不 rebase | **已收口（清晰 fail-fast）**：此前生成 `no such column: REL_….undefined` 的裸 SQL 错误；现 Modifier / getReferenceFieldValue 对 filtered 段给出指路错误（指引 base 属性路径）。带谓词的排序语义（谓词不命中按 NULL 排）显式声明为未支持。回归：r31b storage |
| 迁移期残留 `storage.listen` 回调 | **已文档化（运维契约）**：migrate teardown 处 CAUTION 明示两条事件轨刻意分离、业务监听者在场的进程不得原地 migrate。enforcement 留待迁移引擎监听隔离 |
| update/delete `undefined` match 全表语义 | **已定谳（契约决策）并文档化**：undefined = 全表写是既有契约（单行 settings 实体的合法形态，TS 类型已强制显式传入）；storage 规则文档明示 CAUTION。读者枚举：src 内零 undefined 调用点、一个测试刻意消费 |
| PGLite close→open 复活 | **已修复**：open() 复位 closed 标志并重建实例（与 PG/MySQL/SQLite 生命周期契约对齐）。回归：r31b-A |
| 嵌套 x:1 子查询谓词不下推（r30 记录，filtered x:1 谓词是特例） | **已修复（查询编译面收口）**：`QueryExecutor.enforceXToOnePredicates`——携带谓词（用户 matchExpression / filtered 注入）的 x:1 节点逐父探针（谓词 + 反向 id，与 x:n 独立查询机制同构），不命中则关联置 null（父记录保留）。四拓扑格回归（filtered×isolated n:1 / filtered×combined 1:1 / 普通 x:1 用户谓词 / 深层）；**7b/7b-deep 预言机按承诺升级为相等断言**，敏感性实验：回退修复后 extended seed 3/4/10/12/13/14 当场红（predicate leak） |

### 诚实边界（本完成轮）

- `_System_` 表的 `set(concept, key)` 是 dictionary 竞态的同族兄弟轨（find-then-create），本轮未加唯一索引（(concept,key) 复合唯一 + 同款 RetryableWriteConflict 是同构修法）——`_System_` 的并发写入面（activity state 走 CAS、其余消费点单写者）风险显著低于 dict，登记待下轮顺手收口。
- 迁移 patch 事件 oldRecord 完备性的**直接**行为断言（三级 Transform 链上依赖计算读 oldRecord 的迁移端到端用例）未落——现有覆盖是回归安全性（存量迁移套件 + fuzz）而非新契约的正面证明；构造成本高（三级链 × 稳定 uuid × 审批流），登记为迁移专项轮的测试债。
- enforceXToOnePredicates 的探针是逐父 N+1（仅在声明谓词的 x:1 节点上发生）；批量化（IN + 反向分组，与 findXToManyRelatedRecordsBatched 同构）留作性能优化项。

---

## 五、证伪 / 未达门槛

| 候选 | 结论 |
|------|------|
| Conditions OR 下 atom 异常被右支通过掩盖（子代理判 fail-open） | 证伪：OR 语义正确——B=true 时授权与 A 无关；错误串在 NOT 下不取反（fail-closed 不变量守住否定极性）。De Morgan 展开下 `NOT(A AND B)`、A 异常、B=false → 通过，语义上 `A AND B` = unknown AND false = false，取反为 true——正确 |
| PGLite/PG timestamp 写入损坏（子代理判 fatal） | 降级：实测 PGLite round-trip 正确（PG datetime 解析器容忍双引号）——按契约脆弱性处理（H5），非现行数据损坏 |
| isRef payload 接受软删除记录 | 未达门槛：`_isDeleted_` 硬删除计算的语义是物理删除（applyResult 对 true 直接 storage.delete），不存在"软删除残留行"可被 ref 引用的窗口 |
| RecordBoundState.setInternal 吞掉 "Atomic replace target not found" | 证伪（by-design）：聚合模板的删除复位路径刻意依赖"物理删除场景安全忽略"（代码注释明示）；StateMachine 路径先 lock 后 setInternal，同事务内不会 miss |
| recursive label/goto 环判定 `===` 不终止 | 未达门槛：环判定作用于同一查询递归栈内的记录（同一来源、同一 JS 形态），跨形态 id 不会出现在同一栈中 |
| prototype 链 payload key 满足 required | 证伪：cloneDispatchArgs 的 own-key 展开在守卫前中和了原型链注入（实测 missing 报错正确） |

---

## 六、逃逸分析（为什么此前没抓到）

完整复盘见 `r31-test-blindness-retrospective.md`。三个致命项的逃逸机理：

1. **A（事件视图消费侧）逃逸 = 契约修复的"读者枚举"缺时间维度**：r20 统一匹配视图时枚举了当时的匹配器读者（TransitionFinder + eventDep deepMatch），但「命中后消费者读什么视图」不在当时的问题框里——匹配与消费被当成一个阶段。r20 的回归只断言"触发了"（`logs.length === 1`），不断言"回调看到了什么"。**断言的观察深度停在触发面，没有下探到消费面**——与 r30-A「预言机读取面缺格」同构，投影在手写回归上。
2. **S1（挂载深度）逃逸 = 同一约定的多实现点没有清单**：「结果按 alias 挂载」是 r30 引入的约定，但 QueryExecutor 有 8 个独立的挂载/读取实现点，r30 只修复了复现走过的 3 个。7b 预言机只在**顶层**读 filtered 属性——挂载深度（顶层 vs x:1 主干下）是读取面的又一子维度，r30 复盘的「读取面 × 名字形态」矩阵缺了这根轴。敏感性实验证明 7b-deep 在 buggy 代码上 extended seed 9 即红——形状一直在生成域里，缺的又是观察面。
3. **B1（required fail-open）逃逸 = 守卫测试只测三态中的两态**：required 的输入空间是「缺键 / 键在值在 / 键在值 undefined」三态，既有测试只铺缺键与合法值。`in` 操作符的键存在性与值存在性分裂是 JS 特有形态——JSON 反序列化不产生 undefined 值，HTTP 面天然测不到，只有进程内调用（agent/测试/BFF 直连）可达。**守卫边界的输入生成必须包含宿主语言的退化形态**，不只是线协议可表达的形态。
4. **C1（merged 同名异型）逃逸 = 生成域的属性名刻意不重叠**：fuzzer schema 生成器给每个实体同一组属性（label/score，同型），merged 输入间同名同型——同名**异型**在生成域之外；手写 merged 测试全部用不相交或 commonProperties 声明的属性集。声明空间的"冲突形态"（同名异型/同名异 collection）是典型的 taboo 形状。

---

## 七、给后续轮次的操作性规则（增补）

1. **契约的读者枚举有时间维度**：修复/建立契约时的读者清单只覆盖当时存在的读者。契约声明（如「record 模式按合并视图匹配」「结果按 alias 挂载」）应落为代码内 CAUTION + 回归断言**消费侧可见性**（回调收到什么、结果挂在哪），而不只断言触发/命中。
2. **约定的实现点清单**：一个跨函数的约定（挂载 key、id 归一化、事件名归一化）落地时，grep 出全部实现点并逐一核对——「同一约定的第 N 个实现点」是 r31-S1/r28-sameRecordId/r29-MRG 反复出现的形态。
3. **守卫输入生成含宿主语言退化形态**：undefined 值、原型链、数组/字符串代替对象、Symbol 键——守卫边界（checkPayload/checkCondition/checkUser）的矩阵必须包含 JS 特有形态，不只 JSON 可表达形态。
4. **声明空间的冲突形态进生成域**：fuzzer schema 生成器应以低概率生成「合法性存疑」的声明（同名异型属性、自引用 filtered 链、循环 merged）——声明期 fail-fast 的存在性只有 taboo 形状能验证。

---

## 附：红-绿证据链（供验证）

- A/B1/C1/S1 复现：scratch spec 在未修复代码上 4 红（S1 结果挂 base 名、StateMachine flag 停 normal、Transform docTitle undefined、required+undefined 无错误、merged setup 静默成功且 A.score 变 string）；修复后全绿。
- S1 机制化：7b-deep 预言机敏感性实验——回退 QueryExecutor 修复，extended seed 9/26/31 当场红（`filtered-nested-read-deep ... MISSING from the FzS9_D.in2.fr_out2 nested read (x:1-trunk mount face)`）；恢复后 base 1–200×40 / extended 1–120×30 / filtered 1–60 全绿。
- 修复后：`npm run check` 通过；全量套件 2151+ passed；真实 PG 7 套件 33 passed（含新增 timestamp Date 绑定探针）；驱动差分 60 种子、计算生成 60 种子、迁移生成 30 种子全绿。
