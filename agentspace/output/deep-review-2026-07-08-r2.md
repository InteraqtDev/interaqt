# 全代码库深度 Review 报告（2026-07-08 第二轮）

- 日期：2026-07-08
- 基线：`main` @ `3ff3ccd2`（PR #17 合入之后，v1.7.0-alpha.0 + 前两轮 review 修复）
- 范围：`src/core`、`src/runtime`（含 computations、migration）、`src/storage`、`src/builtins`、`src/drivers` 全量
- 方法：五个方向并行深度探查（storage 写路径 / runtime 主路径 / computations / core+builtins+drivers / migration+filtered entity）→ 人工精读交叉验证 → **对每个致命候选编写最小复现测试并实际运行**（PGLiteDB）。只有「已运行复现确认」的问题列为致命；仅凭精读判定的问题单独分级并标注置信度。
- 与既有报告的关系：`full-codebase-review-2026-07.md`（同日第一轮）的 F-1~F-5、R-1~R-9 已全部修复并有回归测试；其「明确遗留」项（I-1、I-2、I-5、I-7、I-9~I-12、S1~S4、S8、migration I3）仍然有效，本报告不重复展开。本报告发现均为**新增**。
- 基线健康度：`npm test` 全量 1681 passed / 26 skipped，全部通过。

---

## 一、结论摘要

前两轮 review 修复后，计算语义边界（空集合、NaN、NULL 匹配、分页）和事务串行化已明显收敛。本轮把火力集中在**此前未覆盖的纵深**：migration 与 filtered entity 的交互、依赖声明→监听注册的编译完备性、StateMachine trigger 匹配语义、乐观并发控制的原子性、合表（combined table）路径。发现 4 个已复现的致命问题和 8 个高置信度重要问题。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现） | 4 | filtered 谓词变更迁移后下游计算永久脏数据、裸 property dataDep 静默不注册监听、`trigger.keys` 死 API、自引用 1:1 reliance setup 崩溃 |
| 重要（精读，高置信度） | 8 | storage.update 版本匹配非原子 CAS、asyncReturn TOCTOU、MySQL open() 首次建库即坏、StateMachine 多 transfer 静默取首、SQLite update RETURNING 契约、驱动类型映射不一致、BoolExp.or 不对称、函数型 state defaultValue 迁移盲区 |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认）

### F-1 已有 filtered entity/relation 的 `matchExpression` 变更：迁移后查询立即生效，但下游增量计算**永久脏数据**，且 diff 审阅推荐「ignore」

- 位置：
  - `src/runtime/migration.ts` `getNewFilteredDataContexts`（L2871–2876）、`recomputeFilteredMemberships`（L3289–3308）——两者都只识别**新增**的 filtered 记录名，从不对比旧/新 `resolvedMatchExpression`，不为成员「进入/退出」合成 create/delete 事件，也不把变更的 filtered 上下文注入 rebuild 种子；
  - diff 侧：`buildMigrationDiff` 对该计算实际检出了 `dataDepsChanged: true`，但因结构签名不变而给出 `changeType: "unchanged"`、`recommendation: "ignore"`，`requiredDecisions` 为空——审阅者对语义变更完全不可见。
- 复现（REPRO-1，实测输出）：v1 定义 `SeniorUser = User[age >= 30]` + `Count({record: SeniorUser})`，存量 age=20/40 各一条，count=1。v2 仅把谓词改为 `age >= 18`，走完整审批迁移：

```
REPRO-1 diff changes: [{ changeType: "unchanged", detected: { dataDepsChanged: true, ... }, recommendation: "ignore" }]
REPRO-1 requiredDecisions: []
REPRO-1 rebuildPlan: []
REPRO-1 query result count: 2   ← 查询侧立即正确
REPRO-1 count after migration: 1 ← 计算侧永久停留旧值 ❌
```

- 影响：filtered entity 是无状态谓词，查询侧「看起来一切正常」，而所有依赖它的 Count/Summation/Every 等增量计算保持旧基数并在后续业务事件上继续错误累加——**静默、永久、且审阅流程绿灯放行**。filtered relation 同理。
- 修复方向：(1) `recomputeFilteredMemberships` 对「同名且 isFiltered」的记录比较旧/新 `resolvedMatchExpression`，不等时按两个谓词做全集 membership diff（合成 create + delete 事件）；(2) `getNewFilteredDataContexts` 扩展为 `getChangedFilteredDataContexts`，把谓词变更的上下文注入 rebuild 种子；(3) diff 增加 `filtered-predicate-changed` review item（含新旧谓词摘要），`dataDepsChanged: true` 不应被 `unchanged` 吞掉。

### F-2 `type: 'property'` 的 dataDep 不带 `attributeQuery` 时：静默不注册任何监听，计算**从不执行**（连初次 compute 都没有）

- 位置：`src/runtime/ComputationSourceMap.ts` L326–334——`property` 依赖仅在提供 `attributeQuery` 时才编译进 source map，否则整个分支空转，setup 无任何告警。
- 复现（REPRO-3，实测输出）：`Custom.create({ dataDeps: { _current: { type: 'property' } }, compute: ... })` 挂在 property 上：

```
对照组（带 attributeQuery: ['price']）：update 后 double=50 ✓
裸依赖组：create 后 computeCalls=0，update 后 computeCalls=0，double 恒为 getInitialValue 的 0 ❌
```

- 影响：一个看起来完全合法的声明，产出的派生值永远是初始值，无任何错误。直接违反「显式控制 + Robustness（静默失败不可接受）」的框架原则。
- 修复方向：`property` dataDep 缺 `attributeQuery` 时应在 setup 阶段抛出带上下文的 `ComputationError`（fail-fast），或明确定义并实现「裸依赖 = 监听宿主全字段 update」的语义。同族：`records` dataDep 在 attributeQuery/match/modifier 均无可提取字段时不注册 update 监听（L314–324），也应至少文档化或告警。

### F-3 `StateTransfer.trigger.keys` 是死 API：带 `keys` 的 trigger 永远不匹配任何 storage 事件

- 位置：`src/core/StateTransfer.ts` L5–11（`RecordMutationEventPattern` 公开声明 `keys?: string[]`）；`src/runtime/computations/TransitionFinder.ts` L19–26（`deepPartialMatch` 要求 pattern 的每个 key 都存在于 event 上）；`src/storage/` 全目录 **没有任何位置**在 mutation 事件上设置 `keys`（`rg 'keys:' src/storage` 零命中）。
- 复现（REPRO-4，实测输出）：`trigger: { recordName, type: 'update', keys: ['reviewed'] }` 声明字段级转移，update `reviewed` 后：

```
REPRO-4 status after keyed update: draft   ← 应为 published ❌
```

- 加重因素：`migration.ts` 合成的事件**带** `keys`（L2986/L3003/L3021/L3095），即同一个 trigger 在迁移回放时可能命中、在正常运行时永不命中——语义分裂。
- 影响：按类型系统写出的合法声明静默失去全部转移能力，状态永久停留。
- 修复方向：要么让 storage 的 update 事件携带 `keys`（`UpdateExecutor.updateRecord` 已有 `changedFields`，顺手带上即可），要么从 `RecordMutationEventPattern` 中删除 `keys` 并在 `TransitionFinder` 构造时对带 `keys` 的 trigger 抛错。

### F-4 自引用 1:1 `isTargetReliance` 关系：schema 构建阶段崩溃于内部 assert

- 位置：`src/storage/erstorage/Setup.ts` `mergeRecords` 第 2 步（L830–848）对所有 1:1 reliance 链自动三表合一 → `combineRecordTable` → `joinTables` L95 `assert(joinTargetRecord !== record, ...)`。
- 复现（REPRO-2，实测输出）：`Relation.create({ source: Node, target: Node, type: '1:1', isTargetReliance: true })`：

```
ConstraintSetupError: join entity should not equal, ReproSelfNode ❌ （controller.setup 直接抛出）
```

- 影响：一个合法的建模形态（节点及其影子/快照）导致应用无法启动，错误信息是内部合表断言，用户无从定位。
- 修复方向：`mergeRecords` 对 `sourceRecord === targetRecord` 的 reliance 链跳过合表（走独立关系表），或在 `Relation.create` / DBSetup 入口给出明确的「自引用 1:1 reliance 不支持合表」业务级错误。

---

## 三、重要问题（代码精读判定，高置信度，未逐一运行复现）

### R-1 `storage.update(match)` 是「先查后按 id 改」，不是原子 CAS——建立其上的所有乐观并发控制在 PostgreSQL READ COMMITTED 下失效

- 位置：`src/storage/erstorage/UpdateExecutor.ts` L39–85（`updateRecord`：非锁定 `findRecords` 匹配 → 逐条 `updateRecordDataById`，UPDATE 的 WHERE 只有 id）；消费方 `src/builtins/interaction/activity/ActivityCall.ts` L346–366（`completeInteractionState` 以 `stateVersion` 匹配做 OCC，注释宣称「并发推进会匹配零行」）。
- 问题：dispatch 默认 READ COMMITTED（`transaction.ts` L166）。两个并发事务都能在 find 阶段读到 `stateVersion=0`（对方未提交），随后各自按 id UPDATE——第二个只是等待行锁后覆写，**两个都「成功」**：activity 状态双推进 + `saveUserRefs`（L369–390，本身无版本控制）后写覆盖先写。SQLite/PGLite 因单连接事务串行化不受影响，问题只在真正并发的 PostgreSQL 上暴露——恰好是生产配置。
- 修复方向：给 storage 提供真正的条件更新原语（UPDATE ... WHERE id AND version，检查 affected rows），或 OCC 场景改用 `storage.atomic.compareAndSet` / `lockRows(FOR UPDATE)`。`tests/runtime/postgresqlConcurrency.spec.ts` 应补「两个并发 dispatch 完成同一 activity 不同分支」的用例。

### R-2 `handleAsyncReturn` 的 freshness 判定存在 check-then-apply 窗口（TOCTOU）

- 位置：`src/runtime/Scheduler.ts` L907–975。`lockRows` 只锁**当前 task 行**；`isLatestAsyncTask`（L970–975）是非锁定 `findOne(orderBy id DESC)`。在「isLatest 通过 → apply → commit」窗口内，另一个连接可创建并应用更新的 task，旧结果随后覆写新结果。与 R-1 同根（非锁定读做一致性判定），READ COMMITTED + PostgreSQL 下成立。
- 修复方向：apply 前对同 `freshnessKey` 的全部 task 行 `FOR UPDATE`（阻塞并发 handler），并在 apply 后二次校验；或对 freshnessKey 做 advisory lock。注意 SQLite `supportsSelectForUpdate: false` 时 `lockRows` 本就是空操作（`MonoSystem.ts` L778、L1072–1076），依赖单连接串行化兜底——应在能力声明里写明。

### R-3 MySQL `open()`：目标库不存在时建库后不重连、不 `USE`；库存在时首条连接泄漏

- 位置：`src/drivers/Mysql.ts` L52–77。`SHOW DATABASES` 为空时只 `CREATE DATABASE`，随后所有 `scheme/query` 跑在**无默认库**的连接上——全新数据库首次启动即失败。`else` 分支重连时旧连接未 `end()`，每次 `open()` 泄漏一条连接。
- 说明：MySQL 驱动当前 `transactions: false`，dispatch 本就 fail-fast，但 `setup`/直接查询路径都受此影响。修复：`CREATE DATABASE` 后统一走「重连带 database + 关闭旧连接」的路径。

### R-4 StateMachine：同一 `current` 状态上多条 transfer 同时命中同一事件时，静默取声明顺序第一条

- 位置：`src/runtime/computations/TransitionFinder.ts` L48–58。`findNextState` 先命中先返回，无歧义检测。与已修复的「同 trigger 不同 current 去重」（`computeDirtyRecords` 的 seen 集合）是不同缺陷。
- 影响：转移结果与 `transfers` 数组顺序耦合，重构调序即改变运行时行为，且无任何告警。修复：命中多条时抛出带上下文的错误（或至少 warn），把歧义暴露给声明者——符合显式控制原则。

### R-5 SQLite `update()`：拼接 `RETURNING` 却用 `.run()` 执行，返回 `{changes, lastInsertRowid}` 被强转为 `EntityIdRef[]`

- 位置：`src/drivers/SQLite.ts` L99–113。实测 better-sqlite3 对 RETURNING 语句 `.run()` 不抛错但**不返回行**（本轮已验证），与 PostgreSQL/PGLite 驱动（返回 rows）契约不一致。当前 storage 调用方忽略返回值所以未爆发，属埋雷——与上一轮修复的 PGLite/MySQL `update()` RETURNING 属同族，修复时漏掉了 SQLite。改用 `.all()`（有 idField 时）。

### R-6 四驱动 `mapToDBFieldType` 语义漂移

| 类型 | SQLite | PostgreSQL | PGLite | MySQL |
|------|--------|-----------|--------|-------|
| `number` | `INT` | `DOUBLE PRECISION` | `DOUBLE PRECISION` | `DOUBLE` |
| `timestamp` | `INT` | `TIMESTAMP` | `TIMESTAMP` | `TIMESTAMP` |
| `id`（非 pk） | `INT` | `INT` | **`UUID`** | `INT` |

- `Property.create({ type: 'number' })` 在 SQLite 上声明为 `INT`（靠 SQLite 弱类型才存得下小数），换 PostgreSQL 语义即变；`timestamp` 在 SQLite 是整数。另外任意未识别的 `type` 字符串会被各驱动 else 分支**原样拼进 CREATE TABLE**（`Property.create` 不校验 type 白名单）——误配产生非法 DDL。建议统一映射表 + type 白名单校验。

### R-7 `BoolExp.or()` 不做 `standardizeData`，与 `.and()` 不对称（已复现）

- 位置：`src/core/BoolExp.ts` L329–336 vs L308–315。REPRO-5 实测：`.and(rawExpressionData)` 得到 `right.type === 'expression'`，`.or(rawExpressionData)` 得到 `right.type === 'atom'`——整棵子树被当作单个 atom，组合条件静默错误。静态 `BoolExp.or`（L242）同样用 `BoolExp.atom` 而非 `standardizeData`。一行修复。顺带：手工构造 `operator:'and'` 缺 `right` 的表达式在求值时是裸 `undefined.evaluate` TypeError（L405–409），应转为带上下文的校验错误。

### R-8 函数型 bound-state `defaultValue` 在 migration 签名中不可区分

- 位置：`src/runtime/migration.ts` `serializeState`（L721–731）+ `stableStringify`（L541–544）：任何函数都序列化为常量 `"[Function]"`。修改 `RecordBoundState/GlobalBoundState` 的函数型 defaultValue 不会引起 `stateSignature`/`modelHash` 变化，`state-only` 迁移可能带着错误初始状态通过，或 `setup(false)` 直接放行。与已修复的 `StateNode.computeValue`/`computeTarget` 签名收集（F2）同族，应按相同方式收集函数文本。

---

## 四、显著值得改进的地方

### 4.1 computations / runtime

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | Property 聚合增量分支对未知 related 事件静默 `delta=0` | `Summation.ts` L242–261、`Average.ts`、`WeightedSummation.ts`（对比 `Count.ts` L277 / `Any/Every` 的 `fullRecompute` 兜底） | 外层守卫通过但内层分支未命中时直接 `increment(0)`，聚合静默停滞。是既有 I-1（六 handle 复制粘贴漂移）的又一实例，抽共享模板时统一加 `fullRecompute` 兜底 |
| I-2 | Property 聚合 update 分支 `findOne` 无 null 守卫 | `Summation.ts` L247–254、`Average/WeightedSummation/Count` 同 | 关系已删/竞态时 `newRelationWithEntity[...]` 直接 TypeError；`Every.ts` 有 try/catch → fullRecompute，其余五个没有 |
| I-3 | Custom 仅声明 `incrementalCompute` 无 `compute` 时，planned full recompute 必崩 | `Custom.ts` L70–85 回退 `fullRecompute` + `Scheduler.ts` L815–827 要求 `compute` 存在 | 应在 setup 时校验并给出清晰错误 |
| I-4 | RealTime 回调返回多变量 Inequality/Equation 时 `solve()` 直接 throw 且未被捕获 | `MathResolver.ts` L324–326、L394–396；`RealTime.ts` L30 只处理 null/NaN | 整个计算失败；应捕获后按 nextRecomputeTime 回退或抛 ComputationError |
| I-5 | mutation 级联无深度上限 | `MonoSystem.ts` L1145–1172 ↔ `Scheduler.ts` 同步递归 | 深链依赖图可栈溢出/长事务，建议 depth 计数 + 明确熔断错误 |
| I-6 | async task 表只增不减 | `Scheduler.ts` L865–905 | stale 只标 `skipped`，无清理/配额；`isLatestAsyncTask` 的 `orderBy id DESC` 成本随之增长 |

### 4.2 storage（合表路径事件完整性）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-7 | `relocateCombinedRecordDataForLink` 重插实体不发 create 事件 | `RecordQueryAgent.ts` L197–207（`insertSameRowData` 未传 events） | 下游 reactive 只见 link delete，见不到实体重建。注：该路径当前仅 user-`mergeLinks` 可达，而 `mergeLinks` 在 `MonoSystem.setup`（L307）根本没有暴露——修复时先决定是暴露还是删除该参数 |
| I-8 | 三表合一子实体 create 事件不合并 `defaultValues` | `CreationExecutor.ts` L207–216（对比主记录 L177–184） | 事件里的 record 与落库状态不一致，增量计算可能拿到缺字段的记录 |
| I-9 | `flashOutCombinedRecordsAndMergedLinks` 内部 `deleteRecordSameRowData` 不传 events | `RecordQueryAgent.ts` L137 | 被抢实体若含 reliance 子树，级联 delete 事件丢失 |
| I-10 | 合表后表名 `entities.join('_')` 无长度截断 | `Setup.ts` L139–155 | 字段名/约束名都有 hash 截断，表名没有；PG 63 字节静默截断有碰撞风险 |
| I-11 | `buildUpdateSQL` 不走 `prepareFieldValue`，INSERT/UPDATE 不对称 | `SQLBuilder.ts` L480 vs L500–505 | 当前被驱动的 JSON.stringify 兜底，属架构性埋雷 |

### 4.3 migration / builtins / core

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-12 | dry-run 时 Transform 输出的 destructive scope 在无 `queryHandle` 时整段跳过 | `migration.ts` L2790–2795 | 审阅产物可能不完整，执行期才失败；dry-run 应统一走 migration read handle |
| I-13 | 迁移锁无租约/超时自动回收 | `MonoSystem.ts` L1389–1420 | 进程崩溃后必须人工 `forceReleaseMigrationLock()`；建议锁行带 heartbeat/expiry |
| I-14 | `checkConcept` 对非 isRef 的 Entity/Relation payload 只检查 `typeof === 'object'` | `Interaction.ts` L517–519 | 任意形状对象通过 guard，脏数据延迟到 storage 层爆发；应按 entity schema 做字段校验或文档化宽松语义 |
| I-15 | `Property.create` 不校验 `type` 白名单 | `core/Property.ts` L87–91 + 各驱动 `mapToDBFieldType` else 原样返回 | 与 R-6 一起修：白名单 + 统一映射 |
| I-16 | `RefContainer.replaceEntity` 注释写 Clone 实为直接引用 | `core/RefContainer.ts` L252–256 | 与 `addEntity` 的克隆隔离契约不一致，外部 mutation 可污染容器内图 |
| I-17 | SQLite/MySQL `getAutoId` 用字符串插值拼 recordName | `SQLite.ts` L10–18、`Mysql.ts` L10–18 | 当前被实体名 `/^[a-zA-Z0-9_]+$/` 校验缓解；与 PG 的参数化路径不一致，统一参数化 |
| I-18 | `count-callback.spec.ts` / `count-hard-deletion.spec.ts` 头部 60+ 行过期 BUG 注释 | 两个 spec 文件头部与断言处 | 断言的是**正确值且全部通过**（本轮基线实测），注释却宣称 "This assertion FAILS"。上一轮 review 已列为 P2，仍未清理，会严重误导人和 agent 对现状的判断 |

### 4.4 既有报告遗留项（仍有效）

第一轮报告的 I-1（聚合模板抽取，本轮 I-1/I-2 是其代价的新证据）、I-2、I-5、I-7、I-9~I-12；更早报告的 S1（同批计算无拓扑排序）、S2、S3、S4、S8；migration 报告的 I3（规模化）。

---

## 五、修复优先级建议

**P0（静默错误数据 / 合法模型不可用，全部有复现测试可转回归）：**
1. F-1 filtered 谓词变更的 membership diff + rebuild 种子 + diff review item（本轮最重要的发现，「审阅绿灯 + 永久脏数据」组合最危险）
2. F-2 裸 property dataDep fail-fast（一处校验 + 明确错误消息）
3. F-3 `trigger.keys`：storage update 事件带上 `changedFields` 或删除该 API
4. F-4 自引用 1:1 reliance：跳过合表或给出业务级错误

**P1（并发正确性 / 驱动一致性）：**
R-1 原子条件更新原语（连带 ActivityCall OCC、saveUserRefs）、R-2 asyncReturn freshness 锁、R-3 MySQL open()、R-4 多 transfer 歧义检测、R-5 SQLite update RETURNING、R-8 函数型 state defaultValue 签名。

**P2（健壮性 / 债务）：**
R-6/I-15 类型映射统一 + 白名单、R-7 BoolExp.or、I-1~I-6 计算层收尾、I-7~I-11 合表事件完整性（先决定 mergeLinks 的去留）、I-12/I-13 migration 运维、I-18 过期注释清理（成本极低，收益是消除误导）。

---

## 附录：复现测试代码（验证用，未提交为正式测试）

以下测试在 `3ff3ccd2` 上以 PGLiteDB 运行，结果如注释所示。修复时可改造为回归测试（断言改为正确语义）。

```ts
// F-1 (REPRO-1)：filtered 谓词变更迁移 → count 停留旧值
// v1: SeniorUser = User[age>=30]，存量 age=20/40，count=1
// v2: 仅改谓词为 age>=18，同 uuid，走 generateMigrationDiff + migrate({approvedDiff})
await controllerV2.migrate({ approvedDiff })
await systemV2.storage.find("ReproSeniorUser", ...)       // 2 行 ✓（查询侧正确）
await systemV2.storage.dict.get("reproSeniorCount")       // 1 ❌ 应为 2；rebuildPlan 为 []

// F-2 (REPRO-3)：裸 property dataDep 从不触发计算
Property.create({ name: "double", computation: Custom.create({
  dataDeps: { _current: { type: "property" } },            // 无 attributeQuery
  compute: async (deps) => { calls++; return (deps._current?.price ?? 0) * 2 },
  getInitialValue: () => 0,
})})
// create + update 后 calls === 0，double 恒为 0 ❌（对照组带 attributeQuery 时 update 后为 50 ✓）

// F-3 (REPRO-4)：trigger.keys 永不命中
StateTransfer.create({
  trigger: { recordName: "ReproKeysDoc", type: "update", keys: ["reviewed"] },
  current: draft, next: published, computeTarget: e => ({ id: e.oldRecord?.id }),
})
await storage.update("ReproKeysDoc", ..., { reviewed: true })
// status 仍为 'draft' ❌

// F-4 (REPRO-2)：自引用 1:1 reliance setup 崩溃
Relation.create({ source: Node, sourceProperty: "shadow", target: Node,
  targetProperty: "shadowOf", type: "1:1", isTargetReliance: true })
await controller.setup(true)
// ConstraintSetupError: join entity should not equal, ReproSelfNode ❌

// R-7 (REPRO-5)：BoolExp.or 吞掉 raw ExpressionData
BoolExp.atom(a).and(rawExprData)   // right.type === 'expression' ✓
BoolExp.atom(a).or(rawExprData)    // right.type === 'atom' ❌

// R-5（驱动层验证）：better-sqlite3 对 RETURNING 语句
prepare('UPDATE ... RETURNING id AS id').run()  // {"changes":1,...} —— 无行返回
prepare('UPDATE ... RETURNING id AS id').all()  // [{"id":1}] —— 应该用这个
```
