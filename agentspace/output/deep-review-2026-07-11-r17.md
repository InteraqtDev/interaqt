# 全代码库深度 Review 报告（2026-07-11 第十七轮）

- 日期：2026-07-11
- 基线：`main` @ `ae41ce6f`（v3.0.2，r1–r16 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1852 passed / 26 skipped**
- 范围：三路并行深度探查（storage 写路径与 SQL 编译 / runtime 调度与增量计算 / core+builtins+drivers）+ 对全部致命候选**亲自编写最小复现实际运行**（SQLiteDB / PGLiteDB）
- 方法：与 r1–r16 全部报告逐条去重（候选中约半数为既有遗留项或已修项，剔除；三项子探查结论被复现实验**证伪**，见第五节）。「已复现确认」才列为致命。
- 复现固化：`tests/storage/review-repro-r17.spec.ts`（4 用例）+ `tests/runtime/review-repro-r17.spec.ts`（2 用例），全部按仓库惯例以 `test.fails` 形态提交（修复后翻转为常驻回归）。提交后全量 **1858 passed / 26 skipped**。

> **维护说明（2026-07-11）**：本报告的四个致命项已在同分支（`cursor/deep-code-review-r17-99e4`）全部修复：
> - **F-1**：`addLink` 对 isolated 1:1 双侧、merged 1:1 非 FK 侧显式解除旧 link（reliance 除外，保持业务级 fail-fast）；宿主路径（create/update）经 `unlinkOldOwnersOfExclusiveTargets` 解除已占用目标的旧 owner，同 id 原地引用跳过。
> - **F-2**：`preprocessSameRowData` 对同 id + `&`/嵌套值的原地更新补发 link/combined 记录的 update 事件（keys + oldRecord，与宿主 update 事件同契约）；`NewRecordData.getSameRowFieldAndValue` 对同 id link 数据传入旧 link 快照（防默认值重置绑定状态列）；combined 拓扑下同 id 引用不再走 flashOut（旧值 merge 覆盖新值的数据面 bug，修复过程中新发现）。
> - **F-3**：聚合模板对「对称关系 + 逐项状态（callback 型）」显式守卫退回全量重算，并停写无法归属宿主的逐项状态；无 callback 的存在性 delta 路径不受影响。
> - **F-4**：`spawnManyToManySymmetricPath` 展开路径中**全部**对称段（笛卡尔积，含防二次展开守卫），MatchExp 值/记录两分支按变体 OR 组合；错误注释（"路径中只可能有一个对称关系"）删除。
>
> 修复回归：上述 6 个复现翻转为常驻回归 + 兄弟格扫描 6 用例（combined 同 id 数据面+事件面、combined/merged 抢夺对照、replace 对照、幂等对照、n:1 非排他对照）+ `spawnManyToManySymmetricPath` 多段展开单测（含防二次展开）。修复后 `npm run check` 通过，`npm test` 全量 **1863 passed / 26 skipped**（零既有用例回归；1 个既有用例 `review-fixes-2026-07-08-r2` 曾暴露 reliance 边界，已用 isTargetReliance 守卫收口）。
> 为什么这些问题十七轮才被发现：见配套复盘 `agentspace/output/r17-test-blindness-retrospective.md`。

---

## 一、结论摘要

r1–r16 十六轮修复后，读写主路径、聚合增量一致性、守卫链、migration 主流程已高度收敛。本轮四个新致命问题延续既往规律——全部落在「**测试矩阵从未走过的合法声明组合**」，且集中在两个族：

1. **merged-link（关系表合并进宿主行）写路径的两个缺口**——历轮修复了 combined（三表合一）的抢夺（flashOut）、isolated 1:n 的抢夺（r6-F3）、replace 场景的 `&` 数据丢失（r5-F-3），但**默认合并策略**产出的 merged-link 拓扑上：x:1 引用已被占用目标时不解除旧 owner（F-1），同 id 原地改 `&` 属性时数据落库但零事件（F-2）。前者破坏 1:1 不变量，后者让响应式计算永久陈旧——正中框架的核心卖点。
2. **对称关系 × 聚合/查询的两个缺口**——r7 修复了对称关系的删除/update 漏删侧，但（a）带 callback 的属性级聚合以 **link 行**为逐项状态 key，对称关系下同一行承载两端宿主的贡献，状态碰撞导致一端计数恒 0、删边时负数崩溃**且删除事务回滚（删除操作直接不可用）**（F-3）；（b）match 路径含**两段连续对称段**时只展开第一段，第二段静默半结果（F-4，同时是 Scheduler 脏宿主定位的查询底座）。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，未修，test.fails 固化） | 4 | x:1 merged-link 抢夺双 owner、`&` 原地更新零事件、对称+callback 聚合状态碰撞、双对称段路径半展开 |
| 重要（代码证据，高置信度） | 4 | attributeQuery 重复键合并丢 matchExpression、dataPolicy 缺省投影可被调用方放大、payload 弱校验新维度（NaN/数组冒充 object）、update 返回值三态分叉 |
| 证伪/降级 | 3 | 见第五节 |
| 既有遗留复确 | 若干 | 见第六节 |

---

## 二、致命问题（已编写最小复现运行确认；本轮以 `test.fails` 固化，未修复）

### F-1 x:1 merged-link 关系引用已被占用的目标：旧 owner 不解除，双 owner 并存（create/update 双路）

- 位置：`src/storage/erstorage/CreationExecutor.ts` `addLink` L450（自动 unlink 条件 `!isCombined() && !isMerged() && (isManyToOne || isOneToMany)` 把 **merged link 与 1:1** 双双排除在外）；`UpdateExecutor.ts` `updateSameRowData` L126–144（unlink 只匹配**当前记录侧** `${updatedEntityLinkAttr}.id = matchedEntity.id`，从不清除目标记录的既有反向占用）。
- 触发拓扑：**默认合并策略**。非 reliance 的 1:1/n:1 关系，`Setup.mergeRecords` 第 3 步把关系表合并进宿主行（`mergedTo: 'source'`），FK 列在宿主行上——这是最普通的 `User.profile` 声明形态，无需任何特殊配置。
- 复现（实测输出，SQLite，`User —1:1 profile→ Profile`，link merged to source）：

```
p 已被 u1 拥有
create('User', {name:'u2', profile:{id: p.id}})       // 或 update u2 同形
owners of p = ['u1', 'u2']                            ❌ 两行 FK 同指 p
p.owner（反向查询）= u2                                ❌ 与正向查询（2 个 owner）自相矛盾
事件流只有 u2 的新 link create，没有 u1 的旧 link delete ❌ 下游 Count 双计
```

- 影响：1:1 不变量被静默破坏——正反两个方向的查询结果自相矛盾；依赖该关系的 Count/Every/StateMachine 收不到旧关系的 delete 事件，聚合永久偏高。对照组：三表合一（combined）拓扑有 flashOut 抢夺、isolated 1:n 有 r6-F3 修复后的转移语义、`addLink` 对 isolated n:1/1:n 有自动 unlink——唯独 merged link（默认拓扑）与 isolated 1:1 是缺口。「把已有实体改挂到另一个宿主」（订单转移、资料改绑）是完全常规的操作。
- 修复方向：与 create 侧 `handleCreationReliance` L385–392 的 isolated x:1 处理对齐——对 x:1 关系（含 merged/1:1），link 建立前先按**目标侧** id unlink 既有旧链；merged 拓扑下即清除旧宿主行的 FK 列并补发旧 link delete 事件。
- 复现固化：`tests/storage/review-repro-r17.spec.ts`（create/update 两用例）。

### F-2 同 id ref + `&` 关系属性变更：数据落库、事件为零——响应式计算永久陈旧

- 位置：`src/storage/erstorage/CreationExecutor.ts` `preprocessSameRowData` L239–259（link 事件只在 `newRawDataWithNewIds[attr].id !== oldRecord[attr].id` 即**换了关联目标**时生成）；对照 `NewRecordData.getSameRowFieldAndValue` L293–307（mergedLinkTargetRecordIdRefs 的 `&` 数据**无条件写入**同行 link 列）。写路径与事件路径的条件不一致。
- 复现（实测输出，两层验证）：

```
// storage 层（SQLite）
update('User', u1, { profile: { id: 同一个p, '&': { viewed: 99 } } }, events)
link 列 viewed = 99                                    ✓ 数据面已更新
events = []                                            ❌ 连一条事件都没有

// runtime 层（PGLite，WeightedSummation over link property）
Customer.totalQuantity = Σ boughtProduct.&.quantity
update('Customer', c, { boughtProduct: { id: 同一个prod, '&': { quantity: 2→5 } } })
关系行 quantity = 5                                    ✓
c.totalQuantity = 2                                    ❌ 永久陈旧
对照组：updateRelationByName 直接改 quantity → totalQuantity = 5 ✓
```

- 影响：「更新关系属性」的两种合法写法（经宿主实体的 `&` 形态 vs 直接更新关系记录）**一个传播、一个静默失灵**。数据查询正确、计算结果错误——这是对声明式框架最伤的一类静默错误（用户按文档声明，无任何报错，聚合悄悄停滞）。r5-F-3/r6 家族修的是 **replace 场景**丢 `&` 数据；同 id **原地更新**场景从未生成过事件。
- 修复方向：`preprocessSameRowData` 对「id 未变但 `&` 数据出现」的 merged link 生成 link update 事件（keys=变更的关系属性，oldRecord 取前置查询已加载的 link 数据）；或在该形态下路由到关系记录的 updateRecord 复用其事件管线。
- 复现固化：`tests/storage/review-repro-r17.spec.ts`（事件面）+ `tests/runtime/review-repro-r17.spec.ts`（计算面）。

### F-3 对称 n:n 关系 + 带 callback 的属性级聚合：逐项状态以 link 行为 key 碰撞——一端恒 0，删边负数崩溃且删除不可用

- 位置：`src/runtime/computations/aggregationTemplate.ts` `PropertyRelationAggregationHandle`——逐项贡献状态 `RecordBoundState`（如 Count 的 `isItemMatchCount`，L73 `new RecordBoundState<boolean>(false, this.relation.name!)`）以**关系行**为 key；`incrementalCompute` L430/L441 对 create/delete 事件按 link 行 replace/get 状态。对称关系下**同一条 link 行同时承载两端宿主各自的贡献**，两个宿主共享同一个状态槽。
- 复现（实测输出，PGLite，`User.activeFriendCount = Count(friends, callback: f => f.active)`）：

```
A—B 建立好友（A、B 均 active）
A.activeFriendCount = 1  ✓（先处理，replace(link,true) oldValue=false → +1）
B.activeFriendCount = 0  ❌（后处理，replace(link,true) oldValue=true（A 写入的）→ delta 0）

删除 A—B 边：
ComputationError: Count count became negative for U.activeFriendCount
  — bound state and event stream are out of sync
❌ 整个删除事务回滚——这条边从此删不掉
```

- 影响：两个面都致命——（a）建边后一端计数永久错误；（b）**删边操作直接不可用**（fail-fast 负数守卫 + 事务回滚，用户无法通过任何重试恢复）。对称关系（好友、双向连接）+「按条件统计对端」（活跃好友数）是社交类应用的标准组合。现有 `symmetricRelation.spec.ts` 只测了**无 callback** 的 Count（无逐项状态，presence delta 恰好绕开碰撞）——测试矩阵的盲格。
- 修复方向：对称关系的逐项状态 key 必须带上**宿主侧维度**（如 `(link.id, source|target)` 复合 key，或分列存储 `itemValueAsSource`/`itemValueAsTarget`）；`incrementalCompute` 按事件中宿主相对 link 的方向选择状态槽。
- 复现固化：`tests/runtime/review-repro-r17.spec.ts`。

### F-4 match 路径含两段连续对称段时只展开第一段：查询静默半结果（兼 Scheduler 脏宿主定位的底座缺陷）

- 位置：`src/storage/erstorage/EntityToTableMap.ts` `findManyToManySymmetricPath` L385–400——从头扫描，命中**第一个**对称段即 `break`；`spawnManyToManySymmetricPath` 只产出该段的 source/target 两个变体，路径中的**第二段对称关系不展开**。`MatchExp.buildFieldMatchExpression` L410 的注释「路径中只可能有一个 n:n symmetric 关系。因为路径中有多个的在语义逻辑上就不正确」是错误断言——`friends.friends`（朋友的朋友）是完全自然的声明。
- 复现（实测输出，SQLite，单边 A—B）：

```
find('User', { 'friends.&.id': link })        → ['A','B']  ✓ 一跳双端命中
find('User', { 'friends.friends.&.id': link }) → ['A']      ❌ 应为 ['A','B']
                                                （B→A→link 需要第二段的 target 变体）
find('User', { 'friends.friends.id': A })      → ['A']      ❌ B 经 B→A→A? 不可达但
                                                A→B→A 可达 ✓；B 侧同构路径丢失
```

- 影响：（a）任何带两段对称段的业务查询静默少一半结果；（b）`Scheduler.computeDirtyDataDepRecords` 的 create 分支（L540–543）正是用 `targetPath.concat('&','id')` 这条查询定位脏宿主——2 跳对称 dataDep（`fofCount = Count(friends.friends)`）建边时只有单端宿主被重算，删边时 delete 分支（L551–555，`slice(0,-1)` + `IN [source,target]`）却命中双端，**增删两侧宿主集不对称**，叠加 F-3 的状态碰撞后表现为负数崩溃（实测：`fofCount` 场景删边即 `count became negative` + 事务回滚）。Scheduler L546 的 TODO 注释（`需要确定一下，是不是没考虑 targetPath 中间 semmetric relation 的情况`）指向的正是这个未完成面。
- 修复方向：`findManyToManySymmetricPath` 改为收集**全部**对称段并做笛卡尔展开（2 段 → 4 条变体路径）；或短期内对多对称段路径 fail-fast 拒绝 + 文档声明限制（explicit control 底线：宁可报错也不静默半结果）。
- 复现固化：`tests/storage/review-repro-r17.spec.ts`。

---

## 三、重要问题（代码证据，高置信度，本轮不修）

### R-1 `AttributeQuery.mergeAttributeQueryData` 合并重复关系键时丢弃 matchExpression / modifier / onlyRelationData

- 位置：`src/storage/erstorage/AttributeQuery.ts` L29–37——重复键合并时 `acc[name] = { attributeQuery: merge(...) }`，子查询的 `matchExpression`、`modifier` 与三元组第三位 `onlyRelationData` 全部静默丢弃。
- 影响：`[['posts', {matchExpression: X}], ['posts', {attributeQuery:['title']}]]` 这类重复声明（跨层拼装 attributeQuery 时容易产生）会**静默返回未过滤的关联记录**——过滤条件丢失比字段丢失更隐蔽。该函数同时被 `getAttributeQueryDataForRecord`（update 前置查询、flashOut 取数）消费，内部路径当前恰好不带 match，风险主要在公开查询面。
- 建议：重复键上非 attributeQuery 字段不一致时 fail-fast；一致时保留。

### R-2 `dataPolicy` 声明了 match/modifier 但未声明 attributeQuery 时，调用方可用 `['*']` 放大投影

- 位置：`src/builtins/interaction/Interaction.ts` L448（`attributeQuery = policy.attributeQuery ?? caller 的 query.attributeQuery`）。
- 影响：行级授权（match）与列级授权（attributeQuery）是两个独立开关，作者只声明前者时列投影完全由调用方控制（含 `passwordHash` 等敏感列）。r5-F-2 已保证「声明了就 policy wins」，缺省形态是纯 footgun。与 r7 对 `GetAction 无 dataPolicy = 全表任意过滤`（R-4，文档强制处置）同族。
- 建议：至少在生成器文档强制「声明 dataPolicy.match 时必须一并声明 attributeQuery」；或框架级提供 fail-closed 选项。

### R-3 payload 弱校验矩阵的两个新维度：`NaN`/`Infinity` 通过 number 检查；数组冒充 `object`

- 位置：`src/builtins/interaction/Interaction.ts` L320–325——`number: v => typeof v === 'number'`（NaN/Infinity 通过，直接毒化 Summation/Average）；`object: v => v !== null && typeof v === 'object'`（`typeof [] === 'object'`，`isCollection: false` 的 object 字段接受数组）。
- 影响：r7-I-14 弱校验家族的新维度。NaN 进入聚合后产出静默垃圾值（`Number.isFinite` 守卫在聚合侧把 NaN 记 0，但事实数据已污染）。
- 建议：`Number.isFinite` + `!Array.isArray` 两处收紧，属声明期低风险修复。

### R-4 update/create 返回值仍是「三态分叉」的第三态（r16-O-2 复确 + 影响面追加）

- 位置：`UpdateExecutor.ts` L89（返回值 = 用户 payload ⊕ 部分回填），`CreationExecutor.ts` L120。
- 追加影响：F-2 修复时（`&` 原地更新补事件）事件 payload 的 oldRecord/keys 取数将依赖前置查询与返回值形态，建议与 r16-O-2 的「值形态收口轮」一并处理，避免修一个面又造一个分叉面。

---

## 四、证伪/降级的候选（本轮探查结论中被复现实验推翻的）

| 候选 | 证伪证据 |
|------|----------|
| 「`handleUpdateReliance` 对 `differentTableMergedLinkRecordIdRefs` 走 addLinkFromRecord 是错误路径（应走 updateRecord），update 面必坏」（storage 探查 F-2，初判致命） | 复现实验（从 Profile 侧 `update({owner: {id}})`，link merged to source）：事件完整（旧 link delete + 新 link create）、无幽灵行、宿主 FK 正确替换——`addLink → createRecord(linkData)` 内部经 NewRecordData 正确落到宿主行 update。真正的缺口是 F-1（不解除目标侧旧占用），与路径选择无关 |
| 「SQLite/MySQL boolean 以 0/1 返回，应用判 `=== true` 跨驱动分裂」（drivers 探查 H-9，初判重要） | `QueryExecutor.structureRawReturns` L121–122 对 boolean 列显式做 `value !== 0` 归一化（按完整路径解析字段类型，含关联记录字段）——主读路径已收口，仅绕过 ER 层的裸 SQL 才可见差异 |
| 「Scheduler 对 targetPath 中间对称段的 delete 分支必坏」（runtime 探查 F-2 直译） | 复现实验（`Count(friends.posts)`，中间跳对称、末端非对称）：删 post 关系后计数正确归零——中间对称段由**剩余路径查询**的第一段展开兜住。真正的缺口是 F-4 的形态：**两段连续对称段**（`friends.friends`）或对称段即末端且路径 >1 跳 |

另有两项子探查候选核实为**既有设计**：`handleAsyncReturn` 需外部调用是 async computation 的文档化契约（`10-async-computations.md`）；entity/relation 级全量 applyResult 的 delete-all+insert-all 是 SERIALIZABLE 门控下的声明语义。

---

## 五、既有遗留项复确（r2–r16 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；`Custom.asyncReturn` 只收 2 参、record 恒 undefined（r5-I-15）；`getActivityCall(activityId)` 键语义误导（r5-I-13）；`Event`/`Activity.events` 死 API（r12-I-8）；payload 弱校验家族（r7-I-14，本轮 R-3 补两维）；StateMachine 单事件单跳（r7-I-8）；`func::` 反序列化信任边界（文档化 SECURITY 契约）；`ignoreGuard` 测试后门（文档化）。
- **性能/资源**：global dict 变更宿主全表 `['*']` 扫描（S3）；async task 表只增不减（r2-I-6/r12-I-3）；级联删除无深度上限（r2-I-5）；offset-only 全量拉取 / EXIST 误触 post-pagination（r12-I-4/I-5）；`relatedAttribute.length > 3` 一律 fullRecompute（r16-O-5）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；lockRows 稳定化 5 轮上限（r15-O-3）；Activity every 组 CAS 失败不自动重试（r16-O-7）；SERIALIZABLE 重试边界 guard/afterDispatch 重放（S2）。
- **时间调度**：`nextRecomputeTime` 全链无消费方——RealTime 的时间驱动重算至今不存在，仅数据依赖触发（r3-R5，runtime 探查本轮再次命中并确认 grep 零读取点）。
- **驱动**：MySQL 无事务/无唯一约束（文档化）；PGLite id=UUID vs 其他=INT（驱动内自洽，跨驱动迁移注意）；contains 四驱动语义矩阵（r12-I-6）。

---

## 六、修复优先级建议

1. **F-2（`&` 原地更新零事件）**——四个致命项中影响面最广：它破坏的是「数据变更必有事件、事件必驱动计算」这条框架根本契约，且用户完全按文档写代码即可踩中，无任何报错。修复面小（preprocessSameRowData 单点补事件）。
2. **F-1（x:1 merged-link 抢夺）**——默认拓扑上的数据不变量破坏，正反查询自相矛盾；修复方向明确（与 isolated x:1 的既有 unlink 语义对齐）。
3. **F-3 + F-4（对称关系族）**——建议一并修：F-3 的状态 key 补宿主侧维度、F-4 的路径展开或 fail-fast。F-3 的「删除操作不可用」是用户可感知的硬故障，但触发面（对称+callback 聚合）窄于 F-1/F-2。
4. **R-1（attributeQuery 重复键合并丢过滤）**——静默错误结果家族，fail-fast 修复成本低。
5. **R-3（payload NaN/数组）**——声明期小修，随下一轮 createClass 统一校验（r16 建议 4）一并处理亦可。

## 附录：复现要点（验证用）

全部固化在 `tests/storage/review-repro-r17.spec.ts` 与 `tests/runtime/review-repro-r17.spec.ts`（`test.fails` 形态，修复后翻转断言即为回归守卫）：

- F-1：`create/update('User', {profile: {id: 已占用的p}})` → `find('User', {profile.id: p})` 长度必须为 1（现为 2）。
- F-2：`update('User', {profile: {id: 同id, '&': {viewed: 99}}}, events)` → link 列已写 99 但 `events` 为空；runtime 面 `WeightedSummation(&.quantity)` 停在旧值。
- F-3：对称 n:n + `Count(property, callback)` → 建边后一端计数 0；删边抛 `count became negative` 且事务回滚。
- F-4：`find('User', {'friends.friends.&.id': link})` → 只命中单端（应双端）。
