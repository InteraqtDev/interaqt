# 全代码库深度 Review 报告（2026-07-09 第三轮）

> **维护说明（2026-07-09 更新）**：本报告发现的问题已在同分支（`cursor/deep-code-review-r3-e56f`）修复：
>
> - **致命 F-1 ~ F-5 全部修复**，回归测试见 `tests/runtime/review-fixes-2026-07-09-r3.spec.ts`（16 个用例）：
>   - F-1：`UpdateExecutor` 的成员资格 `changedFields` 改用**实际写入集合**（`getSameRowFieldAndValue` 的输出，含联动重算的 computed 列，与 update 事件的 `keys` 同源）。
>   - F-2：`MatchExp.and` 支持复合 `BoolExp` 作为子表达式；`AttributeQuery` 对 filtered relation 的用户 matchExpression 整棵传入而非取 `.data`。
>   - F-3：Custom 的 records dataDep 缺 `attributeQuery` 时在 setup 抛 `ComputationProtocolError`；显式 `attributeQuery: []` 表示「仅依赖成员资格」仍然合法（与 r2 的 property 依赖 fail-fast 对齐）。
>   - F-4：`getReverseAttribute` 对 relation 记录上除 source/target 外的普通关系属性走通用 linkName 反查；顺带补齐 `QueryExecutor` 三处可空 x:1/link 的空守卫（含原 I-4）。
>   - F-5：source map 对 global dict 依赖的 **create 与 update** 事件统一按 key 过滤（自身输出 dict、无关 dict 的事件不再触发计算）。`incrementalDataDeps` 的语义澄清为「增量执行时解析并传入的依赖值」，事件来源需在 `incrementalCompute` 中按 `event.recordName` 区分（既有 `transactionRetry`/`migration` spec 依赖该契约，不宜收窄）。
> - **重要项修复**：R-1（StateMachine `trigger.keys` setup 期校验：关系属性 / 未声明属性 / 空数组一律拒绝，附带修复 IM-2 空数组 vacuous 匹配）、R-2（SQLite `insert()` 改 `.all()` 返回 RETURNING 行；`oneToMany.spec.ts` 中固化了旧垃圾字段的断言一并修正）、R-3（Every/Any 移植 findOne 空守卫 + 清理死赋值 IM-4）、R-7（Transform lockRecord miss 按 delete 语义清理派生行）、R-9（旧成员在旧 base 上求值的防御性修正）。
> - **测试补强**：新增 `tests/runtime/filteredMembershipMatrix.spec.ts` —— filtered 成员资格组合矩阵（谓词列类型[普通/computed/跨实体] × 宿主[entity/relation] × 层级[单层/嵌套] × 变更方式[create命中/不命中、update进入/退出/无关字段、relink、级联delete]，每步断言「查询 == 事件推导 == Count」三方一致性不变式，6 个矩阵用例）；I-17（`computedUpdateEvent.spec.ts` 补 `keys` 断言）；I-18（filtered relation 谓词变更迁移回归）。
> - **明确遗留（建议独立 PR）**：R-4（asyncReturn advisory lock，需真实 PG 并发验证）、R-5（RealTime 时间调度器：实现或文档化的产品决策）、R-6（迁移终态 phase）、R-8（批量 1:n 孤儿告警）、六个聚合 handle 的共享模板抽取（大型重构，三轮累计 7 个缺陷的根治项）、I-1/I-2/I-3/I-5~I-16。
>
> 修复后全量测试 1715 passed / 26 skipped（基线 1693，新增 22 个用例）；`npm run check` 通过。下文正文保留 review 时的原始判定，作为问题背景与复现依据。

- 日期：2026-07-09
- 基线：`main` @ `9e2b1e99`（PR #18 合入之后，前两轮 review 修复全部落地）
- 范围：`src/core`、`src/runtime`（含 computations、migration、ScopedSequence）、`src/storage`、`src/builtins`、`src/drivers` 全量
- 方法：五个方向并行深度探查（storage 读路径 / storage 写路径 / runtime 主路径 / computations / core+builtins+drivers+migration）→ 人工精读交叉验证 → **对每个致命候选编写最小复现测试并实际运行**（PGLiteDB / SQLiteDB）。只有「已运行复现确认」的问题列为致命；仅凭精读判定的问题单独分级并标注置信度。
- 与既有报告的关系：第一轮（`full-codebase-review-2026-07.md`）与第二轮（`deep-review-2026-07-08-r2.md`）的致命与重要项已全部修复并有回归测试；其「明确遗留」项（R-6/I-15 驱动类型映射、I-5 级联深度、I-6 async task 清理、I-7~I-11 合表事件、I-12/I-13 migration 运维、I-14/I-16/I-17、S1~S4/S8）仍然有效，本报告不重复展开。本报告发现均为**新增**。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1693 passed / 26 skipped，全部通过。

---

## 一、结论摘要

前两轮修复后，运行时主干（dispatch/事务/增量聚合边界）已明显收敛。本轮火力集中在**上一轮修复的完备性**与**未覆盖的正交组合**：computed 属性 × filtered entity、复合谓词 × filtered relation、relation-as-source × x:n 查询、Custom 的增量协议、以及 `keys`/关系变更事件的联动。发现 5 个已复现的致命问题、2 个已复现的重要问题和 7 个高置信度重要问题。

值得注意的规律：**F-1、F-3、F-5、R-1 全部是「上一轮修复只覆盖了名义路径」的产物**——F-3（r2 修复了裸 property dataDep，漏了 records dataDep 的同族问题）、F-1/R-1（r2 让 update 事件带上 `keys`，但成员资格 diff 与关系变更路径没有对齐同一套「实际写入集合」语义）、F-5（内置聚合的 `defaultDataBasedIncrementalPlan` 有 depRole 兜底，Custom 的 fallback 分支没有）。修复时建议按「同族路径全覆盖」的标准处理。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现） | 5 | computed 属性上的 filtered entity 无成员资格事件、filtered relation 复合谓词查询崩溃、records dataDep 缺 attributeQuery 静默错值、relation 侧 x:n 属性查询崩溃、Custom incrementalDataDeps 喂入无关事件产出垃圾值 |
| 重要（已复现） | 2 | 纯关系变更不发宿主 update 事件（trigger.keys 死路径二号）、SQLite insert() 污染返回记录 |
| 重要（精读，高置信度） | 7 | Every/Any findOne 空守卫缺失、asyncReturn 残余竞态、RealTime 无时间调度器、迁移成功先于 listener 注册、Transform lockRecord miss 留孤儿、批量 1:n 孤儿静默丢弃、filtered rebase 防御性错误 |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认）

### F-1 `computed` 属性上的 filtered entity：更新输入字段后**不产生成员资格事件**，下游增量计算永久脏数据

- 位置：
  - `src/storage/erstorage/UpdateExecutor.ts` L61（`changedFields = Object.keys(newEntityData.getData())`——只含**用户 payload 的键**）、L68（以该集合调用 `collectMembershipChecks`）；
  - `src/storage/erstorage/FilteredEntityManager.ts` L381–384（依赖属性与 `changedFields` 无交集时直接 `continue`，跳过快照）；
  - 对照：`src/storage/erstorage/NewRecordData.ts` L216–229（`getSameRowFieldAndValue` **确实**重算并落库了 computed 列，且 r2 修复后 update 事件的 `keys` 也包含它）。
- 复现（REPRO-1，实测输出）：`Task.isActive = computed(status === 'active')`，`ActiveTask = Task[isActive = true]`，`Count({record: ActiveTask})`。`update Task {status: 'inactive'}` 后：

```
查询侧：find('ActiveTask') → 0 行 ✓（谓词实时求值，正确）
事件侧：events = [{type:'update', recordName:'Task', keys:['status','isActive']}]
        ← 没有 ActiveTask 的 delete 事件 ❌
计算侧：activeTaskCount 停留 1 ❌（对照组：谓词直接建在普通属性上时 delete 事件正常产生）
```

- 影响：与 r2 的 F-1（迁移期谓词变更）同构的运行期版本——查询侧永远正确、计算侧永久错误、无任何告警。凡是 filtered 谓词引用了 `computed` 属性的建模（例如「派生状态列 + 视图」这一常见组合）全部踩中。
- 修复方向：`collectMembershipChecks` 的 `changedFields` 改用**实际写入集合**（即 `getSameRowFieldAndValue` 的输出，与 update 事件的 `keys` 同源），而不是 payload 键；或在 setup 时把 computed 列的输入字段注册进 filtered 依赖的属性集合。前者一处改动同时对齐两套语义，更优。

### F-2 filtered relation 的 attributeQuery 带**复合** matchExpression：查询构造期崩溃

- 位置：`src/storage/erstorage/AttributeQuery.ts` L174——`rebasedMatchExp.and(subMatchExp.data)`。`subMatchExp` 是 `BoolExp`，而 `BoolExp.data` 只在 **atom** 上有定义（`BoolExp.ts` L270–272）；复合表达式（`.and()`/`.or()` 过的）取到 `undefined`，随后 `MatchExp.and` 的 `assert(condition.key !== undefined)`（`MatchExp.ts` L401）抛出。
- 复现（REPRO-2，实测输出）：`PinnedPosts`（filtered relation）上带 `MatchExp.atom(...).and({...})` 的嵌套查询：

```
TypeError: Cannot read properties of undefined (reading 'key')
  at MatchExp.and (MatchExp.ts:401)
  at AttributeQuery.ts:174 ❌
```

- 影响：单 atom 的嵌套过滤正常，任何复合过滤在 filtered relation 属性上直接崩——合法查询形态不可用，且错误信息（`key cannot be undefined`）与用户写法毫无关联。
- 修复方向：L174 改为 `rebasedMatchExp.and(subMatchExp instanceof BoolExp ? subMatchExp : ...)` 并让 `MatchExp.and` 接受 BoolExp/ExpressionData（它对 atom-like 对象的分支已存在，缺表达式分支）；或统一走 `BoolExp.standardizeData`。

### F-3 `records` dataDep 不带 `attributeQuery`：compute 只拿到 `{id}`、update 永不触发——静默错误值

- 位置：`src/runtime/ComputationSourceMap.ts` L314–323（records 依赖的 update 监听只在能提取出 attributeQuery/match/modifier 字段时注册，否则静默跳过）；取数侧对无 attributeQuery 的 records 依赖只查 `id`。
- 复现（REPRO-4，实测输出）：`Custom.create({ dataDeps: { items: { type: 'records', source: Item } }, compute: sum(price) })`：

```
create Item{price:10} 后：compute 被调 1 次，items = [{"id":"..."}]（没有 price）→ dict = 0 ❌（应为 10）
update price→99 后：compute 不再被调（callsAfterUpdate 仍为 1）→ dict = 0 ❌（应为 99）
```

- 影响：这是 r2 F-2（裸 property dataDep）的**同族问题**：r2 对 property 依赖加了 setup 期 fail-fast（`ComputationSourceMap.ts` L333–341），但 records 依赖的同样形态漏掉了。双重静默：值錯（字段缺失）+ 停滞（无 update 监听）。
- 修复方向：与 property 依赖对齐——records dataDep 无 attributeQuery 时要么 setup 期抛 `ComputationProtocolError`（推荐，符合显式控制），要么明确语义为「监听全字段 + 取全字段」。二选一，不能维持现状。

### F-4 relation-as-source 的 x:n 关系：从 relation 侧查询**必然崩溃**于内部 assert

- 位置：`src/storage/erstorage/EntityToTableMap.ts` L380–390——`getReverseAttribute` 对 `record.isRelation` 的记录断言 `attribute === 'source' || 'target'`，但 relation 记录上完全可以携带**其他关系属性**（`Relation.create({ source: someRelation, sourceProperty: 'tags', ... })` 是合法建模，测试数据 `tests/storage/data/common.ts` L112–119 的 `teamBaseRelation` 即为此形态的 1:1 版本）。调用链：`QueryExecutor.findXToManyRelatedRecords` L547 / `findRecords` L275 → `AttributeInfo.getReverseInfo` L151 → 崩溃。
- 复现（REPRO-3/3b/11，实测输出）：`LinkTag = Relation.create({ source: PersonProfile /* relation */, sourceProperty: 'tags', target: Tag, type: 'n:n' })`：

```
setup ✓；create 链路 ✓（从 Tag 侧写入 links 正常）；从 Tag 侧查询 links ✓
find(relationName, ..., [['tags', {...}]])                     → 崩溃 ❌
find('Person', ..., [['profile', {aq: [['&', {aq: [['tags',…]]}]]}]]) → 崩溃 ❌
Error: wrong attribute tags for relation R3Person_profile_owner_R3Profile
```

- 影响：合法建模形态（关系上的标注/标签是常见需求）可以建表、可以写入、可以从实体侧读，唯独从 relation 侧读必崩，且错误是内部断言。半可用状态比完全不支持更危险。
- 修复方向：`getReverseAttribute` 对 relation 记录先查 `record.attributes[attribute]` 是否为普通 RecordAttribute（走与实体相同的 linkName 反查分支），仅在 attribute 确为 source/target 时走特殊分支。x:1 方向（`teamBaseRelation.base`）已能工作，说明其余管线基本就绪。

### F-5 Custom `incrementalDataDeps`：所有事件（包括自身 dict 创建、未声明依赖的事件）都被喂进 `incrementalCompute`——静默垃圾值

- 位置：`src/runtime/computations/Custom.ts` L192–204——`incrementalDataDeps` 的 fallback plan 只看 `context.skip / context.requiresFullRecompute`，从不检查**事件属于哪个 dataDep**；对照内置聚合的 `defaultDataBasedIncrementalPlan`（`Computation.ts` L312–314）会对 `depRole !== 'primary'` 的事件返回 fullRecompute。
- 复现（REPRO-8，实测输出）：`dataDeps: { items: records, threshold: global }`、`incrementalDataDeps: ['threshold']`、`incrementalCompute` 按 Item 事件形态写：

```
实际喂入 incrementalCompute 的事件序列：
  _Dictionary_ create (r3dSum 自身!)、_Dictionary_ create (threshold)、
  R3dItem create、_Dictionary_ update (threshold)
最终 dict 值："0[object Object][object Object]5[object Object]" ❌（应为 5）
```

- 影响：按文档（`04-reactive-computations.md` L90「Use incrementalDataDeps for the common case」）写出的声明产出字符串垃圾并持久化，无任何错误。用户 `incrementalCompute` 的事件契约完全不可依赖。
- 修复方向：fallback plan 中根据 `context.depName/depRole` 判断——事件不属于 `incrementalDataDeps` 声明的依赖时返回 `fullRecompute`；自身 bound-state / 输出 dict 的事件应直接 skip。同时补文档明确事件契约。

---

## 三、重要问题

### R-1 纯关系变更不发宿主 update 事件：`trigger.keys` 指向关系属性时静默永不触发（已复现）

- 位置：`src/storage/erstorage/CreationExecutor.ts` L186–207——宿主 update 事件以 `newEntityData.valueAttributes.length` 为门槛；`{profile: {id}}` 这类纯关系 payload 的 valueAttributes 为空 → 只有 link create/delete 事件，无宿主 update、无 `keys`。
- 复现（REPRO-7，实测输出）：`StateTransfer.trigger = { recordName:'Person', type:'update', keys:['profile'] }`，`storage.update('Person', ..., {profile:{id}})`：

```
events = [{type:'create', recordName:'Person_profile_owner_Profile'}]（无宿主 update）
status 停留 'draft' ❌（应为 'assigned'）
```

- 影响：与 r2 已修复的 F-3（trigger.keys 死 API）同族——类型系统允许的声明静默失效。可以说 r2 的修复只救活了值属性的 keys，关系属性的 keys 仍是死路径。
- 修复方向：关系替换成功时（`handleUpdateReliance` 的 unlink+addLink 路径）为宿主合成一条 `update` 事件、`keys` 含被替换的关系属性名；或在 `TransitionFinder`/setup 期对指向关系属性的 `keys` 抛出明确的「不支持」错误。两者都比现状好，前者语义更完整。

### R-2 SQLite `insert()` 仍用 `.run()`：创建返回的记录被 better-sqlite3 元数据污染（已复现）

- 位置：`src/drivers/SQLite.ts` L131（`INSERT ... RETURNING _rowId` + `.run()`）；`CreationExecutor.insertSameRowData` L270–272 将返回值 `Object.assign` 进记录。
- 复现（REPRO-10，实测输出）：

```
storage.create('Doc', {title:'t'}) → {"changes":1,"lastInsertRowid":1,"title":"t","id":1} ❌
```

- 影响：`changes`/`lastInsertRowid` 两个垃圾键随记录返回（并可能进入 create 事件的 record），与 PG/PGLite 驱动（返回 RETURNING 行）契约不一致。r2 R-5 修了 `update()`，`insert()` 漏掉了——同一族第二次漏修。
- 修复方向：`.all()` 取行并返回首行（与 `update()` 修复一致）；顺带审查 `Mysql.ts` insert 契约。

### R-3 `PropertyEveryHandle` / `PropertyAnyHandle` 缺 `findOne` 空守卫（fa3e5d38 修复不完整；精读，高置信度）

- 位置：`Every.ts` L220–226（create 分支）、L264–266（update 分支）；`Any.ts` 同族——`findOne` 返回 null 时直接解引用 `[isSource?'target':'source']` 抛 TypeError。对照 `Count.ts` L232–234、L272–274 已加守卫并回退 `fullRecompute`。
- 影响：filtered relation 成员资格时序 / 级联竞态下计算调度硬崩溃而非优雅重算。上一轮同一修复（fa3e5d38）覆盖了 Count/Sum/Avg/Weighted，漏了 Every/Any——六 handle 复制粘贴漂移（既有遗留 I-1）的又一实证。
- 修复方向：移植相同守卫；根治靠抽取共享模板。

### R-4 `handleAsyncReturn` 残余竞态窗口（PostgreSQL READ COMMITTED；精读，中高置信度，未复现）

- 位置：`src/runtime/Scheduler.ts` L916–991 + `MonoSystem.ts` L1064–1078。r2 修复（6ff6b08a）对**已存在**的同 freshnessKey 行取锁是正确的，但仍有两个窗口：(1) `lockRows` 是「先 find 再 FOR UPDATE」的快照，两步之间并发插入的新 task（幻影行）不在锁集内；(2) `isLatest` 判定通过后到 `applyResult` 提交之间，另一连接可插入并应用更新的 task，旧结果后写覆盖。
- 修复方向：对 freshnessKey 做 advisory lock（PG `pg_advisory_xact_lock(hash(freshnessKey))`），或 apply 后在同事务内二次校验 isLatest。通用 `lockRows`（`Transform.ts` L152 也在用）的 find-then-lock 语义应在能力声明中写明。

### R-5 RealTime 的 `nextRecomputeTime` 只落库、无任何调度器消费——纯时间驱动的 RealTime 永久冻结（精读+grep 确认）

- 位置：`RealTime.ts` L91–94/L152–155 持久化 `nextRecomputeTime`；`rg 'RealTime' src/runtime/Scheduler.ts` 零命中，`src/runtime` 无 setInterval/timer/轮询消费该状态。文档（`14-api-reference.md`）却给出「Update every second / every 5 minutes」的示例。
- 影响：没有 dataDep 变更的 RealTime 值在首次计算后永不刷新，与文档承诺直接矛盾。测试（`realTime.spec.ts`）只断言了状态落库，从未等待定时重算——掩盖了缺口。
- 修复方向：要么实现基于 `nextRecomputeTime` 的调度入口（例如 controller 暴露 `runDueRealTimeComputations()` 供宿主定时调用，符合显式控制原则），要么在文档与 API 上明确「时间驱动重算需要外部调度」，并让 `realTime.spec.ts` 覆盖该契约。

### R-6 迁移 `succeeded` 落账早于 `scheduler.setup(false)`：后者失败时数据库已迁移但**无任何计算监听器**（精读，高置信度）

- 位置：`src/runtime/Controller.ts` L490–498（CAUTION 注释已自认这一拆分）。
- 影响：migration log 显示成功、schema/manifest 均为新版，但 mutation listeners 未注册——后续 dispatch 落数据而所有增量计算冻结，属「静默失效框架」。虽是有意的 resume 取舍，但缺少一个可观测的中间态。
- 修复方向：增加 `listeners-registered` 之类的终态 phase（成功 = `succeeded` + 该 phase 完成）；`scheduler.setup` 失败时在 migration log 里追加明确的 warning 记录，而不是仅向上抛。

### R-7 Transform update 路径：`lockRecord` miss 返回 `[]`，既有派生行成为孤儿（精读，中高置信度）

- 位置：`src/runtime/computations/Transform.ts` L145–147。update patch 路径中源记录锁不到（并发删除/竞态）时直接返回空 patch；对照 delete 路径（L185–190）会删除全部映射行。
- 修复方向：lockRecord miss 时按 delete 语义清理该 sourceRecordId 的全部派生行（幂等），或返回 `fullRecompute`。

### R-8 批量 1:n 回填：父记录解析失败的子行被静默丢弃（精读，高置信度）

- 位置：`src/storage/erstorage/QueryExecutor.ts` L434–467——`findXToManyRelatedRecordsBatched` 按反向属性 id 分组，`parent` 找不到时子行不进任何结果、无日志。引用不一致或反向属性注入 bug 时数据「看起来合法地为空」。
- 修复方向：至少 `console.warn`/logger 记录 orphan 数量；更严格可抛 `DatabaseError`。

### R-9 filtered rebase 的旧成员查询用了新 base——防御性错误，当前不可达（已验证被阻断）

- 位置：`src/runtime/migration.ts` L3352–3372——`recomputeFilteredMemberships` 对 predicate-changed 的记录统一以 `change.newRecord.resolvedBaseRecordName` 查询旧成员集合；若 filtered 记录 rebase（同名换 base），旧成员将在错误的表上求值。
- 实测（REPRO-9）：rebase 场景在 `Controller.migrate` L444–446 被 blocking change（`physical-path-move: fact record table changed`）**先行拦截**，migration 直接抛错，故该代码缺陷当前不可达。列为防御性修复项：改用 `change.oldRecord.resolvedBaseRecordName`，并留注释说明 rebase 被 blocking check 拦截的前提。

---

## 四、显著值得改进的地方

### 4.1 storage

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | `MatchExp.fromObject` 类型签名与实现矛盾 | `MatchExp.ts` L31–39 | 签名声明 `{[k]: MatchAtom}`，实现按原始值处理（`value: ['=', value]`），文档示例用原始值。按声明类型传 MatchAtom 会把对象嵌成 RHS。改签名为 `{[k]: unknown}` 或支持两种形态；补测试 |
| I-2 | x:n 谓词一律禁用 SQL LIMIT，即使走 EXISTS 无扇出 | `QueryExecutor.ts` L343–348 | `['exist', ...]` 在 SQLBuilder 里是 EXISTS 子查询、不产生行扇出，却仍触发 post-pagination 全量拉取。热查询 `limit 20` 退化为全表读。可按 atom 粒度判定是否真有 JOIN 扇出 |
| I-3 | `updateRecord` 返回值遗漏 dependency 合并 | `UpdateExecutor.ts` L72 vs L81 | `result.push` 用了原始 `newEntityData` 而非 L72 的 `newEntityDataWithDep`，嵌套创建的依赖数据不在返回记录中 |
| I-4 | `completeXToOneLeftoverRecords` 的根 parentLink 路径缺空守卫 | `QueryExecutor.ts` L482–498、L525–528 | 与 F-4 同块代码；可空 x:1 为 null 时 `[].concat(...)` 得 `[null]` 继续递归。修 F-4 时一并加守卫 |
| I-5 | 合表 create 事件 / relocate 事件完整性 | （既有遗留 I-7~I-9） | 维持上一轮结论，等待 mergeLinks 去留决策 |

### 4.2 runtime / computations

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-6 | `trigger.keys: []` 空数组恒真匹配 | `TransitionFinder.ts` L14–15 | `[].every()` vacuous true；应在 StateTransfer 构造时拒绝空数组或文档化 |
| I-7 | `shouldTriggerUpdateComputation` 不消费 `event.keys` | `ComputationSourceMap.ts` L190–209 | 现靠 record/oldRecord 字段对比间接对齐；keys 已是一等公民，触发判定应统一用它，避免未来局部事件形态走偏 |
| I-8 | PropertyAverage 无负 count 守卫；Every/Any update 分支死赋值 | `Average.ts` L308–311；`Every.ts` L251、`Any.ts` L221 | 与 Count 的 `count < 0 throw` 不对称；死代码顺手清理 |
| I-9 | Global Count/Every/Any/WeightedSummation 的 create 分支用事件局部 record 求 callback，Sum/Average 用 findOne | `Count.ts` L74–77 等 | 本轮 REPRO-5 实测简单嵌套场景未出错（事件 record 含创建 payload），但六 handle 两种策略并存是漂移温床；抽共享模板时统一为 findOne + attributeQuery |
| I-10 | ScopedSequence match 不拦截非命中记录的手工 serial 值 | `ScopedSequence.ts` L48–52 | match 不命中时 payload 里的 serialNumber 原样落库，`allowManualValue: false` 只在命中时生效；至少文档化 |
| I-11 | ScopedSequence 迁移 seed 的 SQL 快路径不支持点路径 match，全量回退 JS 过滤 | `migration.ts` L2532 | 正确性有兜底，大表迁移性能风险；可扩展 SQL 编译支持 `project.id` |

### 4.3 core / builtins / migration

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-12 | activity `refs` 是无版本的 read-modify-write | `ActivityCall.ts` L375–395 | stateVersion CAS（r2 R-1 修复）不覆盖 refs 合并；并发 every 分支可互相覆盖 refs。建议 refs 合并进同一 CAS 行或对 refs 行加锁 |
| I-13 | head interaction 带 `activityId` 时走 `interaction.guard` 而非 `fullGuardWithUserRef` | `ActivityManager.ts` L106–123 | 头交互 + isRef userAttributive + 重放/自建 activityId 的组合下 guard 语义与非头交互不一致 |
| I-14 | `filtered-predicate-changed` 只进 `changes` 不进 `requiredDecisions` | `migration.ts` L1667–1677 | 语义变更自动 rebuild 是对的，但审阅者不被强制确认；大 diff 中易被忽略 |
| I-15 | `rename-candidate-reviewed` 决策在 migrate 期恒被拒绝 | `migration.ts` L1927–1928 | rename 工作流有类型、无实现；要么补实现要么从类型面移除 |
| I-16 | `decodeFunctionValues` 对反序列化字符串 `new Function` | `core/utils.ts` L78–80 | manifest 来源可信时可接受；应在文档中写明信任边界 |
| I-17 | `computedUpdateEvent.spec.ts` 未断言 `keys` 包含 computed 字段 | 测试缺口 | F-3（r2）回归网漏洞；本轮 REPRO-1b 实测 keys 行为正确，补一行断言即可锁定 |
| I-18 | filtered **relation** 谓词变更迁移零回归覆盖 | 测试缺口 | 代码同路径（`recomputeFilteredMemberships` 不分 entity/relation），但 manifest 反序列化/normalizeMatch 的回归无网兜底 |

### 4.4 既有报告遗留项（仍有效）

第一轮的 I-2、I-5、I-7、I-9~I-12、S1~S4、S8；第二轮的 R-6/I-15（驱动类型映射）、I-5（级联深度）、I-6（async task 清理）、I-7~I-11（合表事件）、I-12/I-13（migration 运维）、I-14/I-16/I-17。本轮 R-3/I-8/I-9 再次证明：**六个聚合 handle 的共享模板抽取（第一轮 I-1）应提升优先级**——三轮 review 中它累计贡献了 7 个具体缺陷。

---

## 五、修复优先级建议

**P0（静默错误数据 / 合法声明不可用，全部有复现可转回归）：**
1. F-1 成员资格 diff 的 `changedFields` 改用实际写入集合（与 `keys` 同源）——「查询正确 + 计算永久错」组合最危险
2. F-5 Custom incrementalDataDeps 的事件过滤（非声明依赖 → fullRecompute；自身输出事件 → skip）
3. F-3 records dataDep 缺 attributeQuery 的 setup 期 fail-fast（与 r2 property 修复对齐）
4. F-2 filtered relation 复合谓词合并（一处 standardize）
5. F-4 relation 记录的 getReverseAttribute 支持普通关系属性

**P1（同族补漏 / 并发正确性）：**
R-1 关系变更的宿主 update 事件（或 fail-fast）、R-2 SQLite insert() `.all()`、R-3 Every/Any 空守卫移植、R-7 Transform lockRecord miss 清理、R-4 asyncReturn advisory lock、R-9 rebase 防御性修正 + I-17/I-18 测试补漏。

**P2（契约与运维）：**
R-5 RealTime 调度契约（实现或文档化）、R-6 迁移终态 phase、I-1~I-16。

---

## 附录：复现测试代码（验证用，未提交为正式测试）

以下测试在 `9e2b1e99` 上以 PGLiteDB/SQLiteDB 运行，结果如注释所示。修复时可改造为回归测试（断言改为正确语义）。

```ts
// F-1 (REPRO-1)：computed 属性上的 filtered entity 无成员资格事件
const Task = Entity.create({ name: 'Task', properties: [
  Property.create({ name: 'status', type: 'string' }),
  Property.create({ name: 'isActive', type: 'boolean', computed: r => r.status === 'active' }),
]})
const ActiveTask = Entity.create({ name: 'ActiveTask', baseEntity: Task,
  matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }) })
// Count({record: ActiveTask}) 挂在 dict 上；create {status:'active'} → count=1
await storage.update('Task', matchId, { status: 'inactive' }, events)
// events 只有 Task update（keys 含 isActive ✓），无 ActiveTask delete ❌；count 停留 1 ❌

// F-2 (REPRO-2)：filtered relation + 复合 matchExpression
await storage.find('User', matchId, undefined, [
  ['pinnedPosts', { attributeQuery: ['title'],
    matchExpression: MatchExp.atom({key:'title',value:['like','Al%']})
      .and({key:'status',value:['=','published']}) }],   // ← 复合
])
// TypeError: Cannot read properties of undefined (reading 'key') @ MatchExp.and ❌

// F-3 (REPRO-4)：records dataDep 缺 attributeQuery
Custom.create({ dataDeps: { items: { type: 'records', source: Item } },  // 无 attributeQuery
  compute: deps => deps.items.reduce((a, i) => a + (i.price ?? 0), 0), getDefaultValue: () => 0 })
// create {price:10}：compute 收到 items=[{id}] → 0 ❌；update price→99：compute 不触发 ❌

// F-4 (REPRO-3/11)：relation-as-source x:n 查询
const LinkTag = Relation.create({ source: PersonProfile /* relation */,
  sourceProperty: 'tags', target: Tag, targetProperty: 'links', type: 'n:n' })
// 写入 ✓、Tag 侧查询 ✓；relation 侧：
await storage.find(PersonProfile.name, undefined, undefined, ['id', ['tags', {...}]])
// Error: wrong attribute tags for relation ... @ getReverseAttribute ❌

// F-5 (REPRO-8)：incrementalDataDeps 喂入无关事件
Custom.create({ useLastValue: true,
  dataDeps: { items: {type:'records',source:Item,attributeQuery:['value']},
              threshold: {type:'global',source:thresholdDict} },
  incrementalDataDeps: ['threshold'],
  incrementalCompute: async (last, event) => last + (event?.record?.value ?? 0),
  compute: ..., getDefaultValue: () => 0 })
// 实际喂入：自身 dict create、threshold create/update、Item create 全进 incrementalCompute
// 最终值 "0[object Object][object Object]5[object Object]" ❌（应为 5）

// R-1 (REPRO-7)：纯关系 update 无宿主事件
StateTransfer.create({ trigger: { recordName:'Person', type:'update', keys:['profile'] }, ... })
await storage.update('Person', matchId, { profile: { id: profileId } }, events)
// events = [link create]，无 Person update；status 停留 draft ❌

// R-2 (REPRO-10)：SQLite insert() 污染返回
await storage.create('Doc', { title: 't' })
// → {"changes":1,"lastInsertRowid":1,"title":"t","id":1} ❌

// R-9 (REPRO-9)：filtered rebase 被 blocking check 拦截（缺陷不可达的证据）
// v2 仅把 ActiveView 的 baseEntity 从 User 换成 Profile → migrate 抛
// "Migration plan has blocking changes: physical-path-move: ... fact record table changed"
```
