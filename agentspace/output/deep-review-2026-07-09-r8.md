# 全代码库深度 Review 报告（2026-07-09 第八轮）

> **维护说明二（2026-07-09 追加）**：本报告第三节（R-1~R-4）与第六节优先级清单（1~5）的**显著改进项已在同分支全部完成**：
>
> - **优先级 1 · 六聚合 handle 模板抽取（含 R-2）**：新增 `src/runtime/computations/aggregationTemplate.ts`——`GlobalRecordsAggregationHandle` / `PropertyRelationAggregationHandle` 收敛全部共享骨架（事件守卫、拉全记录、竞态防御、逐项绑定状态复位、负值守卫入口）；六个聚合（12 个 handle，原 ~1440 行）只声明「单项贡献 / 增量应用 / 全量落盘」三件事（净 -700 行）。绑定状态名与形状全部保留（兼容既有部署）。顺带统一了历史漂移：负值守卫补齐到 GlobalAverage/GlobalEvery/GlobalAny/PropertyEvery/PropertyAny，x:n 断言补齐到 PropertyEvery（原 Any 独有），attributeQuery 非空校验补齐到 PropertySum/PropertyAverage（原 global 独有），create 路径的 `&` 一律挂载回查后的关系记录（原 Count/Every/Any 挂事件局部 record）。
> - **优先级 2 · R-1**：`MigrationScheduler.runIncrementalRecompute` 复用 live Scheduler 的 `resolveFilteredUpdateEvent` 守卫（该方法从 private 改为共享并注明用途），filtered 源的链式 rebuild 不再可能双计成员资格+字段更新或路由 stay-out 记录。
> - **优先级 3 · 生命周期三件套**（回归测试 `tests/runtime/review-improvements-2026-07-09.spec.ts`，3 用例）：`Scheduler.setup` 改为**原子切换**（先完整构建新 listener 再注销旧的，构建失败不再留下零监听的静默系统，r5 R-4）；`Controller.setup(true)` 半途失败抛带恢复指引的 `SchedulerError`（指向重跑 install，不再落进误导性的 `MigrationBaselineError` 死角，r5 R-5）；`Controller.migrate` 后的 `scheduler.setup` 失败同样抛明确指引（「数据库已迁移完成，修复后 setup(false)，不要重跑迁移」，r3 R-6）。
> - **优先级 4 · 序列化往返收尾**（回归测试 `tests/builtins/serialization-r8.spec.ts`，3 用例）：`Payload.stringify`/`PayloadItem.stringify`（itemRef 不再丢失）/`DataPolicy.stringify`（match 函数编码为 func::）全部走统一 `stringifyInstance` 管线；`EventSource` 注册进 `core/init.ts`、补齐 `static public`（含全部生命周期回调）、stringify/parse 与统一契约对齐。
> - **优先级 5 · 驱动一致性**（回归测试 `tests/storage/driverIdAllocation.spec.ts`；MySQL 侧对真实 MariaDB 10.11 实测验证）：SQLite `getAutoId` 改单语句 UPSERT（唯一索引 IF NOT EXISTS 兼容旧表）；MySQL `getAutoId` 改 `ON DUPLICATE KEY UPDATE + LAST_INSERT_ID(expr)`（两语句对用本地分配链防会话交错——修复前实测并发 30 次分配全部撞同一 id）；MySQL 建库路径参数化/反引号转义；MySQL 事务按「文档化不支持」处置（AGENTS.md + 驱动 capability note，dispatch 已 fail-fast）；SQLite `number → INT` 经核实为非问题（动态类型按值存储，注释文档化，不改声明避免触发存量 schema 迁移）。
> - **R-3**：以预言机测试固化 combined record 挤出/搬迁的**正确事件语义**（物理行搬迁不发实体级事件、只发 link 事实——`tests/storage/combinedRecordEvents.spec.ts` 2 用例，两条路径实测事件完整），两个函数补上语义注释；`mergeLinks` 的去留仍是产品决策（参数未从 MonoSystem 暴露）。
> - **R-4**：删除 `computeOldRecord` 占位（FIXME 兑现）——关联路径合成事件的 `oldRecord` 如实置 undefined（真实快照在 `relatedMutationEvent` 上），不再用现值副本冒充；global dict 扇出事件的 `oldRecord` 改为独立副本防别名污染。
> - **附带快速项**：`MatchExp.fromObject` 签名与实现对齐（原始相等值 + 空对象 fail-fast，r3 I-1）；`deleteDifferentTableReliance` 事件回填只扫描本级新增区间（消除 O(n×m)）；`decodeFunctionValues`/`createInstances` 文档化 `func::`/new Function 信任边界（r3 I-16）。
>
> **有意不做（需维护者决策，非本轮遗漏）**：SQL NULL 键缺失语义（API 行为变更需评审，r4 I-1）；x:n 谓词分页/orderBy 代表行（查询编译器级重设计，r3 I-2）；global dict 变更触发宿主全表扫描（需要依赖粒度追踪设计，S3）；`dispatch` 默认吞错返回 `{error}`（既定 API 语义）；payload `base` 弱校验矩阵与 `userRef`/Entity `itemRef` 死 API（行为契约变更家族，r7 I-11~I-14，现状已有测试固化）；MySQL 事务的**实现**路线（本轮选择文档化不支持）。
>
> 完成后 `npm run check` 通过；`npm test` 全量 **1768 passed / 26 skipped**（r8 致命修复后基线 1758，净 +10 回归用例：生命周期 3 + 序列化 3 + id 分配 2 + combined 事件预言机 2）。
>
> **维护说明（2026-07-09）**：本报告的致命项已在同分支（`cursor/deep-code-review-r8-c6a5`）修复，回归测试见 `tests/storage/review-fixes-2026-07-09-r8.spec.ts`（4 用例）+ `tests/runtime/review-fixes-2026-07-09-r8.spec.ts`（7 用例）：
>
> - **F-1（新发现，已复现，schema 级腐蚀）**：以 filtered entity 为端点的 relation（`Relation.create({ source: ActiveUser, ... })`，`filteredEntityRelationValidation.spec.ts` 明确断言该声明合法），其关系属性在 `DBSetup.buildMap` 里被 `copyAttributesToFilteredEntities` **整体抹掉**——查询编译按 `resolvedBaseRecordName` 解析属性直接崩溃（`attribute activePosts not found in User`），删除 base 实体时级联清理看不到该关系、留下**孤儿 link**。修复：`populateRecordAttributes` 把 filtered 端点的关系属性同步登记到 resolved base record（copy 阶段自然回流到所有 filtered 变体）；`LinkInfo.isRelationSource` 按 resolved 名比较端点；`EntityToTableMap.getReverseAttribute` 改用属性自身的 `isSource` 判向；`validateRelations` 补齐家族级（兄弟 filtered entity 之间）属性名冲突校验。
> - **F-2（新发现，已复现，聚合漂移）**：Global `Count`/`Every`/`Any`/`WeightedSummation` 的 **create** 增量分支直接把 mutation 事件里的局部 record（defaultValues + payload）喂给 callback；callback 读 `attributeQuery` 声明的关联数据（如 `rel.target.vip`）或 computed 列时，增量结果与全量重算漂移（实测 Count 少计、总和错误）。update 路径在 r2/F-2 已改为 findOne 全量拉取，create 一直是漏网（r3 I-9 曾点名"两种策略并存是漂移温床"但未修）。修复：create 与 update 对齐，先按 `attributeQuery` findOne 再调 callback，记录已不在时退回 fullRecompute（与 PropertyCount 的防御一致）。
> - **F-3（r2/r3 家族收尾，已复现，静默冻结）**：内置聚合声明了 `callback` 却没有 `attributeQuery` 时——full compute 取数是 **id-only**（callback 读字段拿到 undefined）、字段 update **不注册任何监听**（`ComputationSourceMap` L365–374 对空 attributeQuery 跳过）——聚合值静默错误或永久冻结。r3 F-3 已对 `Custom` 的 records dataDep 做了 setup 期 fail-fast，四个内置聚合一直豁免。修复：`Count`/`Every`/`Any`/`WeightedSummation`（global + property）构造时抛 `ComputationProtocolError`；显式 `attributeQuery: []`（纯成员资格 callback）仍然合法，与 Custom 契约一致。同步修正了 9 处编码了该反模式的既有测试与 14 处知识库示例（`agent/agentspace/knowledge/`）。
>
> 修复后 `npm run check` 通过；`npm test` 全量 **1758 passed / 26 skipped**（基线 1747，净 +11：4 个 F-1 storage 回归 + 7 个 F-2/F-3 runtime 回归）。下文正文保留 review 时的原始判定。

- 日期：2026-07-09
- 基线：`main` @ `56d700ff`（PR #24 合入之后，r1–r7 的致命/重要修复全部落地）
- 范围：`src/core`、`src/runtime`（Scheduler / migration / computations / 事务）、`src/storage/erstorage` 全量、`src/builtins`（守卫链 / Activity / 序列化）、`src/drivers`
- 方法：四路并行深度探查（storage 全量 / runtime 引擎与 migration / computations 增量语义 / core+builtins+drivers）→ 与 r1–r7 报告**逐条去重**（本轮候选中约六成为既有遗留项的重复发现，见第四节）→ 对每个新致命候选**编写最小复现测试实际运行**（PGLiteDB）。只有「已运行复现确认」的问题列为致命；复现失败的候选明确证伪（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1747 passed / 26 skipped。

---

## 一、结论摘要

经七轮修复，storage 读写主路径、对称关系、增量聚合边界、Activity/序列化、migration 均已高度收敛。本轮延续既往规律，新致命问题依然全部落在「**声明合法、测试矩阵从未走过的组合**」：filtered entity 作 relation 端点只测过 `createTables()` 成功（从未 CRUD）、聚合 create 增量路径只测过「callback 只读事件自带字段」的场景。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 3 | filtered 端点关系被 setup 抹掉（查询崩溃 + 孤儿 link）、聚合 create 增量用局部事件 record（漂移）、callback 无 attributeQuery 静默冻结（fail-fast 收尾） |
| 重要（精读，高置信度，未修） | 4 | MigrationScheduler 缺 filtered update 路由守卫、GlobalAverage/GlobalEvery 负值无守卫、combined record 挤出/搬迁不发事件（r2 遗留复确）、`computeOldRecord` 关联路径占位（S4 遗留复确） |
| 既有遗留复确（r2–r7 已记录，本轮核实仍在） | 约 15 | 见第四节清单 |
| 证伪 | 2 | 见第五节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 以 filtered entity 为端点的 relation：属性被 setup 抹掉，查询崩溃、删除留孤儿 link

- 位置：
  - `src/storage/erstorage/Setup.ts` `copyAttributesToFilteredEntities`（原 L638–652）——`record.attributes = this.copyAttributes(baseRecord.attributes)` 整体**替换**，把 `populateRecordAttributes`（步骤 4）刚写到 filtered record 上的关系属性抹掉；
  - `src/storage/erstorage/RecordQuery.ts` L31–48——查询编译统一按 `resolvedBaseRecordName` 解析属性，所以该属性本来就**必须**存在于 base record 上，而 populate 只写了 filtered record；
  - `src/storage/erstorage/LinkInfo.ts` `isRelationSource`（原 L102–104）——按端点名字符串精确匹配，删除级联拿 base 名（'User'）匹配 link 的 filtered 端点名（'ActiveUser'）恒 false，方向判反。
- 声明合法性：`filteredEntityRelationValidation.spec.ts` 明确断言 `source: ActiveUser` "now allowed"；`filteredEntityRelationPropertyConflict.spec.ts` 为它专门做了冲突校验。但**没有任何测试对这种 relation 做过 CRUD**——现有用例止步于 `createTables()` 成功。
- 复现（实测输出）：`ActiveUser`（`User` 的 filtered entity）为 source 的 `activePosts` 关系：

```
setup 后 ActiveUser attributes: [name, isActive, id]      ❌ activePosts 消失
findOne('ActiveUser', ..., ['activePosts']) →
    Error: attribute activePosts not found in User        ❌ 查询直接崩溃
（修 Setup 后）delete User → link 表残留 1 行              ❌ 孤儿 link（isRelationSource 方向判反）
```

- 影响：「对实体的某个子集建模关系」（活跃用户的推荐位、已发布文章的置顶记录……）是 filtered entity 的自然延伸用法。声明期零告警、建表成功，任何经由该关系的查询崩溃；删除端点实体则静默留下孤儿关系行——引用完整性腐蚀（r7 刚为此类问题建立了预言机矩阵，但矩阵没覆盖 filtered 端点关系）。
- 修复（三处联动 + 一处校验）：
  1. `populateRecordAttributes` 把 filtered 端点的关系属性同步登记到 resolved base record（虚拟 link 除外——filtered relation 的 `source`/`target` 属性仍由 copy 阶段统一继承 base relation 的虚拟 link）；copy 阶段自然把它回流到全部 filtered 变体；
  2. `LinkInfo.isRelationSource` 端点名按 `resolvedBaseRecordName` 归一后比较（家族内属性名唯一由校验保证）；
  3. `EntityToTableMap.getReverseAttribute` 改用属性自身的 `isSource` 判定方向；
  4. `validateRelations` 新增家族级冲突校验：兄弟 filtered entity 之间（或 filtered 声明在先、base 声明在后）同名关系属性 setup 期即报错——否则两者会在共享的 base 属性命名空间里静默互相覆盖。
- 回归：`tests/storage/review-fixes-2026-07-09-r8.spec.ts`——source 端/target 端双向查询（filtered 名与 base 名都可达）、删除 base 实体无孤儿 link、兄弟冲突 fail-fast。

### F-2 Global 聚合 create 增量分支用局部事件 record，callback 读关联数据/计算列时结果漂移

- 位置：`src/runtime/computations/Count.ts` L74–78、`Every.ts` L75–79、`Any.ts` L70–73、`WeightedSummation.ts` L76–81（修复前）。
- 根因：create 事件的 `record` 是 `{...defaultValues, ...payload}`（`CreationExecutor`），不含 computed 列，关联端只有 `{id}`。update 分支在 r2 F-2 已改为 `findOne(..., attributeQuery)` 全量拉取，create 分支四个 handle 全部维持事件局部 record。`Summation`/`Average` 的 create 分支一直是 findOne——六个同族 handle 两种策略并存（r3 I-9 明确点名，一直未修）。
- 复现（实测输出）：`Count({ record: AuthorRelation, attributeQuery: [['target', {attributeQuery: ['vip']}]], callback: rel => rel.target?.vip === true })`，创建 vip 用户的 Post：

```
增量结果: 0    ❌（事件 record 的 target 只有 {id}，读不到 vip）
全量真值: 1
```

- 影响：所有「callback 依赖关联数据或计算列」的全局聚合在 create 时静默漂移，且**永不自愈**（后续增量都基于错误的 bound state）。这正是 r6 聚合一致性矩阵的口径盲区：矩阵的 callback 只读记录自身在 create payload 里的字段。
- 修复：四个 handle 的 create 分支与 update 对齐——先按 `attributeQuery` findOne 全量 new record 再调 callback（`Count` 仅在声明了 callback 时增加这次查询，无 callback 路径零开销）；记录已不在（同批级联删除等竞态）时退回 `fullRecompute`，与 `PropertyCount` 的既有防御一致。
- 回归：`tests/runtime/review-fixes-2026-07-09-r8.spec.ts`——Count 读关系 target 字段、WeightedSummation 读关联实体字段、Every/Any 读 computed 列，create/update 全路径断言与真值一致。

### F-3 内置聚合 callback 无 attributeQuery：取数 id-only + update 零监听，静默冻结（fail-fast 收尾）

- 位置：`src/runtime/ComputationSourceMap.ts` L365–374（merged attributeQuery 为空时不注册 update 监听）；`EntityQueryHandle.ts` L29（attributeQuery 缺省为 `[]`，取数 id-only）。
- 复现（实测输出）：`Count({ record: Task, callback: t => t.done === true })`（无 attributeQuery）：

```
create {done:false} → count 0   ✓（碰巧对：事件 record 带 payload）
update {done:true}  → count 0   ❌（无监听，永久冻结）
```

- 家族史：r2 F-2 对 property dataDep、r3 F-3 对 Custom 的 records dataDep 均已 fail-fast，唯独四个内置聚合的主依赖一直豁免——同一族问题第三次出现，本轮收尾。
- 修复：`Count`/`Every`/`Any`/`WeightedSummation`（global + property 六个 handle）构造时校验：声明了 callback 而 `attributeQuery === undefined` → 抛带定位信息的 `ComputationProtocolError`；显式 `attributeQuery: []`（callback 只依赖成员资格/id/外部 dataDeps）仍然合法——契约与 Custom 完全一致。共享校验器 `assertCallbackAttributeQueryDeclared` 放在 `Computation.ts`，为将来六 handle 模板抽取预留。
- 连带修正：9 处既有测试编码了该反模式（恒真 callback 改为去掉 callback 或显式 `attributeQuery: []`；`weightedSummation.spec.ts` 两处 callback 读字段但没声明——它们此前只测 create/delete 所以侥幸通过，正是 F-2 的活体样本）；知识库 14 处示例（`agent/agentspace/knowledge/usage/` 与 `generator/api-reference.md`）全部补上 `attributeQuery`——这些示例是代码生成管线的模板，此前每一份都会教下游生成静默冻结的聚合。

---

## 三、重要问题（精读判定，高置信度，本轮未修）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| R-1 | `MigrationScheduler` 增量重算路径没有 live `Scheduler` 的 `resolveFilteredUpdateEvent` 守卫 | `migration.ts` L3220–3327 vs `Scheduler.ts` L403–459 | `propagateOutputEvents: true` 的链式 rebuild 涉及 filtered entity 时，同批 membership + 字段 update 可能被双计或路由到错误 recordName。常规迁移走全量重算不受影响；建议迁移增量路径复用 live 守卫或降级为全量 |
| R-2 | `GlobalAverage`/`GlobalEvery` 聚合计数可为负且无守卫 | `Average.ts` L103–135、`Every.ts` L99–111 | `GlobalCount`（`count < 0` 即抛）与 `PropertyAverage`（负 count 检测）都有 fail-fast，这两处没有——状态失步时产出 NaN/错误布尔而非报错。六 handle 模板抽取时一并对齐 |
| R-3 | combined record 挤出/搬迁不发事件 | `RecordQueryAgent.ts` L137、L225–234 | r2 I-7/I-9 遗留，本轮 storage 复查确认仍在；该路径仅显式 `mergeLinks` 配置可达（`MonoSystem.setup` 未暴露），维持「先决策 mergeLinks 去留」结论 |
| R-4 | `computeOldRecord` 对关联路径返回 `{...newRecord}` 占位 | `Scheduler.ts` L512–518（带 FIXME） | S4/r5 I-16 遗留复确。关联实体变更合成的宿主 update 事件中 `oldRecord` 是现值副本，依赖 old/new diff 的成员资格判断可能误判为 `none`。内置聚合的增量路径都重查关系行所以未实际中招，但对自定义 incremental handle 是暗雷 |

## 四、既有遗留项复确（r2–r7 已记录，本轮四路探查再次命中，不重复展开）

本轮子探查产出的候选中约六成与既往报告重复，逐条比对后确认以下遗留项**仍然存在**（编号沿用原报告）：

- **生命周期边缘**：`Scheduler.setup` 先注销后注册、中途失败留下零监听系统（r5 R-4）；migration `succeeded` 落账早于 `scheduler.setup(false)`（r3 R-6）；`setup(true)` 半途失败进 `MigrationBaselineError` 死角（r5 R-5）。
- **驱动层**：MySQL `transactions: false`——dispatch 全线不可用（r2 已记录）；SQLite/MySQL `getAutoId` 读-改-写非原子（r2 I-17，SQLite 被单进程事务队列缓解）；`number` 类型 SQLite/MySQL 映射 `INT` vs PG/PGLite `DOUBLE PRECISION`（r2 驱动类型映射项）；boolean 写侧不归一化（r1 R-6 读侧已修，写侧遗留）。
- **语义/契约**：查询结果丢弃 SQL NULL（键缺失而非 `null`，r4 I-1，属 API 行为变更需评审）；x:n 谓词分页退化为全量拉取 + 内存分页（r3 I-2）、扇出 orderBy 取代表行语义（r1 I-7）；`MatchExp.fromObject` 类型签名与实现矛盾（r3 I-1）；`dispatch` 默认吞错返回 `{error}`（既定 API 语义）。
- **builtins 弱校验族**：非 isRef 的 Entity payload `base` 接受任意对象（r7 I-14 弱校验矩阵）；独立 Interaction 的 `userRef`/Entity `itemRef` 静默不写（r7 I-11/I-13）；Activity 首步 guard 未接 `checkUserRef`（isRef attributive 在首步抛错，fail-closed 但破坏合法模式）；`Payload.stringify`/`PayloadItem.stringify`（丢 `itemRef`）/`DataPolicy.stringify` 未走统一 `stringifyAttribute` 管线、`core/init.ts` 漏注册 `EventSource`（r1 I-10 序列化往返项，r4 只修了 `Interaction.stringify` 与 builtins 注册）。
- **信任边界**：`func::` + `new Function` 反序列化即代码执行（r3 I-16——序列化图与应用源码同信任级时可接受，文档化信任边界仍未做）。
- **性能**：global dict 变更触发依赖它的每个 property 计算宿主的全表 `['*']` 扫描（S3）；`deleteDifferentTableReliance` 事件回填 O(n×m)（r2 记录）。
- **最高投入产出比的债务**：六聚合 handle 共享模板抽取——r1 至今累计 **15+ 个具体缺陷**（本轮 F-2/F-3 又 +2 族）全部源于六 handle 手工同步漂移。本轮已把 create/update 取数策略与 callback 校验统一，抽取的前置条件比以往任何时候都好。

## 五、本轮证伪的候选

| 候选 | 证伪依据 |
|------|----------|
| `resolveRootBaseRecordNameAndMatchExpression` 对「有 baseEntity 无 matchExpression」的实体 `undefined.and()` 崩溃（storage 探查 #9） | 实测 `Entity.create({ baseEntity: User })` 不带 matchExpression，`DBSetup` + `createTables()` 正常完成，无崩溃 |
| 「`copyAttributesToFilteredEntities` 抹掉属性只影响 filtered 名下查询」 | 实际更糟：查询编译统一走 resolved base 名，base 上从来就没有该属性——即 F-1 不是 copy 一处的 bug，而是 populate/copy/LinkInfo 三处对「filtered 端点」这一合法形态的系统性缺失 |

## 六、修复优先级建议（遗留项）

1. **六聚合 handle 模板抽取**（含 R-2 负值守卫对齐）——累计缺陷最多、本轮已铺平前置条件；
2. R-1 迁移增量路径的 filtered 路由守卫（或文档化「filtered 链式 rebuild 走全量」）；
3. 生命周期边缘三件套（scheduler.setup 原子切换 / migration 终态 phase / install 半途恢复）；
4. 序列化往返收尾（Payload/PayloadItem/DataPolicy/EventSource）；
5. 驱动一致性（number 类型映射统一、MySQL 事务实现或文档化不支持）。

## 附录：复现要点（验证用）

- F-1：`Relation.create({ source: FilteredEntity, sourceProperty, target, targetProperty })` → `DBSetup` → 检查 `setup.map.records[base].attributes` 是否含 sourceProperty；`findOne(filteredName, ..., [[sourceProperty, {...}]])`；`delete(baseName, ...)` 后查 link 表残留。
- F-2：聚合 record 为 relation、callback 读 `target.<field>`、`attributeQuery: [['target', {attributeQuery: [field]}]]`，create 后对比 dict 值与全量真值。
- F-3：聚合 callback 读字段但不声明 attributeQuery，create（碰巧对）→ update（冻结）；修复后 setup 即抛 `ComputationProtocolError`。
