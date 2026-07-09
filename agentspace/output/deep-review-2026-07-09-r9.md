# 全代码库深度 Review 报告（2026-07-09 第九轮）

- 日期：2026-07-09
- 基线：`main` @ `4ca925d2`（PR #25 合入之后，r1–r8 的致命/重要修复全部落地）
- 范围：`src/storage/erstorage`（含 r8 从未专项审查过的 `MergedItemProcessor`）、`src/runtime`（r8 新落地的 `aggregationTemplate` / Scheduler 事件路由 / Custom 契约）、`src/builtins`（Activity / 守卫链）、`src/runtime/migration.ts` 纵深、知识库与代码事实的一致性
- 方法：四路并行深度探查（r8 新代码与 filtered 组合盲区 / storage 写路径与 merged entity / runtime 调度事务与异步计算 / builtins 守卫链与 migration 纵深）→ 与 r1–r8 报告**逐条去重**（本轮候选中近半为既有遗留项的重复发现）→ 对每个新致命候选**编写最小复现测试实际运行**（PGLiteDB）。只有「已运行复现确认」的问题列为致命；复现失败或代码证伪的候选明确记录（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1768 passed / 26 skipped。

> **维护说明（2026-07-09）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r9-3e6d`）全部修复。回归测试：`tests/storage/review-fixes-2026-07-09-r9.spec.ts`（10 用例）+ `tests/runtime/review-fixes-2026-07-09-r9.spec.ts`（2 用例）。修复后 `npm run check` 通过；`npm test` 全量 **1780 passed / 26 skipped**（基线 1768，净 +12 回归用例；顺带修正 1 处编码了 F-2 反模式的测试装置 `tests/runtime/data/leaveRequest.ts`——两个 relation 共用 `User.request` 反向属性名，此前靠"从不经由该属性查询"侥幸通过）。

---

## 一、结论摘要

经八轮修复，读写主路径、增量聚合、对称关系、Activity/序列化、migration 均已高度收敛。本轮延续既往规律：新致命问题依然全部落在「**声明合法、零告警、但从未被测试矩阵走过的组合**」——且四个致命项中有三个属于同一族：**共享命名空间里的静默覆盖/静默丢弃**（filtered 视图的属性命名空间、base 家族的关系属性命名空间、merged 的判别列）。修复方向也一致：按显式控制原则一律 setup 期 / 写入口 fail-fast。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 4 | filtered 自有属性被 setup 静默丢弃、同族 relation 同名属性静默互相覆盖、goto 递归对不经过起点的环无限递归、merged `__type` 判别列可被载荷覆写 |
| 重要（已复现，已修） | 2 | 跨 Activity activityId 裸 TypeError（潜在授权错绑）、知识库 Custom 增量示例教错误模式（代码生成管线级污染） |
| 证伪 | 3 | 见第五节 |
| 重要（精读，高置信度，未修） | 5 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 filtered entity/relation 声明自己的新 property：被 setup 静默丢弃（静默数据丢失）

- 位置：`src/storage/erstorage/Setup.ts` `createFilteredEntityRecord`（`attributes: {}`，属性整体忽略）；`copyAttributesToFilteredEntities` 随后用 base 的属性表整体覆盖 filtered 的属性表；写路径 `NewRecordData.groupAttributes` 对未知键静默丢弃。
- 声明合法性：`Entity.create({ baseEntity, matchExpression, properties: [...] })` 类型系统完全接受，setup 零告警，建表成功。
- 复现（实测输出）：

```
// ActiveUser（User 的 filtered entity）声明 Property nickname：
ActiveUser attributes: [name, isActive, id]                    ❌ nickname 消失
create('ActiveUser', {..., nickname:'nick'}) → 读回无 nickname  ❌ 写入被静默丢弃

// ActiveUser 声明 Count 计算属性 activePostCount：
读回 {name, isActive, _ActiveUser_activePostCount_bound_count: 2}  ❌
// 计算在跑（bound state 落库），可见属性列却根本不存在——applyResult 的写入被静默丢弃
```

- 影响：三层静默——列不建、写入不报错、computation 只维护内部 bound state 而可见值永远不存在。用户以为「视图上的属性」在工作，实际上任何读取都拿不到值。filtered relation 的自有属性同样中招（`createFilteredRelationRecord` 虽登记了属性，但查询/更新统一按 resolvedBaseRecordName 解析，`update` 载荷里的该属性被静默丢弃）。
- 修复：新增 `DBSetup.validateFilteredItemProperties`（buildMap 步骤 0.5）——filtered entity/relation 声明了 base 链上不存在的新 property 即抛错，指引声明到 base 上。**与 base 同名的再声明保持合法**（解析到 base 列）——merged item 编译管线会把 input entity rebase 成携带原属性列表的 filtered item，这些属性都已合并进物理 base，不能误伤。
- 语义决策记录：filtered item 是共享 base 表行的视图，"子集上的新列"结构上等价于"base 上的列"，fail-fast + 指引到 base 是零损失的诚实契约。将来若要支持（等价于自动把列登记到 base + 家族冲突校验 + 属性计算在成员资格进出时的语义定义），应作为显式设计决策而不是隐式行为。

### F-2 同一 base 家族里多个 relation 声明同名属性：后注册者静默覆盖，先注册的 relation 从此不可达

- 位置：`src/storage/erstorage/Setup.ts` `validateRelations` 家族级冲突校验（r8 引入）L563–576——条件带 `hasFilteredDeclarer`，**纯 base 声明的重复完全豁免**；`populateRecordAttributes` 按名写入 `attributes[prop]`，后写覆盖先写。
- 复现（实测输出）：

```
Relation.create({ source: User, sourceProperty: 'items', target: Post, ... })
Relation.create({ source: User, sourceProperty: 'items', target: Task, ... })
→ setup 成功，User.items 指向 Task   ❌ Post 关系静默不可达（查询走错关系、级联漏删）
```

- 现有测试盲区：`tests/runtime/data/leaveRequest.ts` 自己就编码了这个反模式（`sendRequestRelation` 与 `reviewerRelation` 都用 `User.request`），因为测试从不经由 `User.request` 查询而侥幸通过——已一并修正为 `sentRequests`/`reviewedRequests`。
- 修复：家族级校验去掉 `hasFilteredDeclarer` 条件——同族（base + 全部 filtered 变体）多个 relation 声明同名属性一律 setup 期抛错。同一 relation 对称两端共用属性名（symmetric）经 Set 去重后不受影响（有回归用例）。

### F-3 label/goto 递归查询：数据图中不经过起点的环 → 无限递归（挂起/栈溢出）

- 位置：`src/storage/erstorage/QueryExecutor.ts` `findRecords` 环检测（原 L181–185）——只比较 `stack[0].id === stack.at(-1).id`。
- 复现（实测输出）：自引用 n:n `next` 关系，数据 `A→B→C→D→C`（环 C↔D 不含入栈首节点）：

```
递归 50 层仍未终止（靠测试注入的 exit 保险丝停住）   ❌ 无 exit 时 = 无限递归
对照：环回到起点（A→B→A）正常终止                    ✓（旧检测只覆盖这一种）
```

- 影响：树/图遍历是 label/goto 的目标场景，图数据含环是完全合法的形态。用户没写 `exit`（或 exit 条件不含深度上限）时查询挂死整个请求。现有测试 `queryExecutorEdgeCases.spec.ts` 只覆盖「回到起点」的环。
- 修复：环检测改为「当前记录在本轮递归路径上**任意位置**出现过」即停止展开（含原栈首行为，两个方向都有回归用例）。

### F-4 merged entity/relation 的 `__type` 判别列可被 create/update 载荷显式覆写（跨视图数据腐蚀）

- 位置：`src/storage/erstorage/MergedItemProcessor.ts` `createTypeProperty`——判别列是带 defaultValue 的普通 value 属性；`NewRecordData` 的 defaultValues 逻辑在 `rawData.hasOwnProperty('__type')` 时跳过 default 闭包，直接落库用户值；update 路径同样直通。
- 复现（实测输出）：

```
create('Customer', { name:'x', level:'gold', __type:'Vendor' })
→ Customer 视图 0 条、Vendor 视图 1 条（携带 Customer 特有列 level）  ❌
update('Customer', ..., { __type:'Vendor' }) → 记录跨视图漂移           ❌
```

- 影响：单表继承的判别列是 merged 语义的根基——被覆写后记录静默错标到其他 input 视图（跨视图可见性错乱 + input 特有列交叉污染），订阅 filtered 视图事件的下游计算收到与业务声明不符的成员资格事件。`storage.create/update` 会被 Transform 回调、Interaction resolve 等用户代码直接调用，属于框架信任边界。
- 修复：`processMergedItems` 返回判别列宿主名集合 → `DBSetup` 标记 `RecordMapItem.hasMergedDiscriminator` → `EntityQueryHandle` 的全部公共写入口（create/update/updateRelationByName/addRelationByNameById/addRelationById）递归校验载荷（含嵌套关联记录与 `&` link 数据），显式携带 `__type` 即抛明确错误。非 merged 家族用户自定义 `__type` 属性不受影响（有回归用例）；框架内部路径（flash-out/搬迁重插全行数据）走 agent 层不经过该入口，不受影响。

---

## 三、重要问题（已复现，本轮已修复）

### R-1 跨 Activity 使用 activityId：裸 TypeError；共享 Interaction 实例时可错绑状态/授权

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` `getActivity`——按 id 查 `_Activity_` 记录后**不校验**记录上的 `uuid`（活动定义标识，create 时已存储）是否属于当前 ActivityCall。
- 复现（实测输出）：两个 Activity A/B，把 A 的 activityId 传给 B 的交互：

```
dispatch B:b2 with A's activityId
→ TypeError: Cannot read properties of undefined (reading 'content')   ❌ 裸内部错误
```

- 风险面：默认场景 fail-closed 但错误无法定位；若两个 Activity **共用同一 Interaction 实例**（节点 uuid = interaction.uuid，两图 uuid 相同），A 的 state/refs 会被 B 的图成功解释——状态推进与 `isRef` attributive 授权判定错绑到别的流程。
- 修复：`getActivity` 校验 `activity.uuid === this.activity.uuid`，不匹配即抛「activity instance X belongs to activity "A", not "B"」的业务级错误；本流程内推进不受影响（回归用例覆盖三个方向）。

### K-1 知识库 Custom 增量示例：直接从 `mutationEvent.record` 读字段——update 事件只带变更字段，聚合静默漂移

- 位置：`agent/agentspace/knowledge/generator/api-reference.md` `IncrementalCounter` 示例（原 L1775+）：`(mutationEvent.record?.value || 0) - (mutationEvent.oldRecord?.value || 0)`。
- 事实：update 事件的 `record` **只携带本次写入的字段（+id）**，`oldRecord` 才是完整旧快照；delete 事件的完整快照在 `record` 上、`oldRecord` 为 undefined。照抄示例的代码在「更新其他字段」时把贡献读成 undefined→0。
- 复现（实测输出）：`Counter{value:10, active:false}` → `update({active:true})`（record 里没有 value）：

```
文档模式增量结果: 0     ❌（应为 10，且永不自愈）
```

- 影响：与 r8 F-3 的知识库连带修正同性质——这些示例是代码生成管线的模板，每一份都会教下游生成静默漂移的 Custom 计算。r8 F-2 只修了内置聚合（改为 findOne 全量拉取），Custom 是「自带逻辑」的 API，框架侧无法代取，正确契约必须由文档承载。
- 修复：示例改为 `{...oldRecord, ...record}` 重建全量新状态 + delete 分支读 `record`；`generator/api-reference.md` 与 `usage/14-api-reference.md` 新增「Mutation event snapshots」契约小节（三种事件类型的快照形状表）。正确模式以回归用例固化（create/update-部分字段/update-多字段/delete 全路径与真值一致）。

---

## 四、重要问题（精读判定，高置信度，本轮未修）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | base 宿主的 property 聚合无法引用「声明在 filtered 变体上的 relation」 | `aggregationTemplate.ts` L249–252（`relations.find(r => r.source === host)` 按实例相等） | r8 允许了 filtered 端点 relation，但 `User` 上的 `Count.create({property:'activePosts'})` 找不到 `source: ActiveUser` 的 relation → setup assert。fail-fast 无静默风险，但组合上是「r8 开了声明、rooms 里还没家具」——F-1 的 fail-fast 又把「声明在 ActiveUser 上」的路也封了，当前该 relation 上不能挂任何 property 聚合。需要显式设计：允许 host 解析到自身 filtered 变体端点的 relation，并定义非成员宿主的增量语义（成员资格进出时 full recompute） |
| I-2 | dispatch 先持久化 InteractionEvent 再执行 resolve：StateMachine 的 trigger 挂在 InteractionEventEntity 上时看不到 resolve 产出 | `Controller.ts` L695–709 | `computeTarget` 依赖 resolve 中才创建的实体 id 时 lock 失败 → 静默 skip，状态永久停在初态。属调度顺序的既定语义（事件先于产出），建议文档化「依赖 resolve 产出的转移应监听产出实体自身的 create 事件」 |
| I-3 | Entity/Property 改名（即使保留 uuid）被 migration 识别为 remove+add | `migration.ts` `identityKey` L554–555（身份键 = 名称路径，uuid 仅记录不参与身份） | rename decision 在 Phase 1.5 被拒绝（fail-fast，有测试），不会静默丢数据；但「同 uuid 改名 = 安全重构」的直觉不成立，存量数据无搬迁路径。需要 rename 一等支持或文档明确「改名 = 删+建，需自写迁移」 |
| I-4 | Condition/Attributive 回调返回非 boolean 的 truthy 直接放行 | `Interaction.ts` `checkCondition`/`checkAttributive`；`BoolExp.evaluateAsync` `(result && !inverse)` | 守卫写 `return user.role`（字符串恒 truthy）之类的类型错误静默 fail-open。已拦截 undefined/异常；建议对非 boolean 返回值告警或拒绝（契约变更需评审） |
| I-5 | 批量化 1:n 子查询静默丢弃无法挂靠父记录的子行 | `QueryExecutor.ts` `findXToManyRelatedRecordsBatched` L436–469（`if (parent)` 无 else） | 需要前置数据腐蚀（悬挂端点）才触发，属防御深度：建议 assert 或 warn，让读路径暴露写路径的腐蚀而不是掩盖 |

## 五、本轮证伪的候选

| 候选 | 证伪依据 |
|------|----------|
| 「global 聚合以 filtered 端点 relation 为源：物理 link 全量计入 vs 全量重算按端点谓词过滤 → 漂移」（探查 A#2） | 实测 `Count({record: ActiveUserPostRel})` 对 inactive 用户建 link：dict = 2 == `find(Rel.name)` = 2。该 relation 不是 filtered relation，物理行就是唯一语义，增量与全量口径一致，无漂移 |
| 「Custom 的 dataDeps 里函数型 match 进不了 modelHash → 迁移不重算」（探查 D#3） | `RecordsDataDep.match` 类型是 `MatchExpressionData`（声明式 BoolExp，非函数）；args 里任何位置的函数由 `collectFunctionText` 深遍历收进 `functionSignature.hash`（`migration.ts` L768–800），函数体变更会触发 needs-review |
| 「PropertyRelationAggregation 对 filtered 端点 relation 的非成员宿主 +1」（探查 A#1） | 该形态的前提（property 聚合声明在 filtered entity 宿主上）被本轮 F-1 的 fail-fast 在 setup 期阻断；声明在 base 宿主上则命中 I-1 的 setup assert——两条路都 fail-closed，无静默错值路径存活 |

## 六、既有遗留项复确（r2–r8 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4 I-1）；x:n 谓词分页内存化 / orderBy 代表行（r3 I-2 / r1 I-7）；dispatch 默认吞错返回 `{error}`；payload 弱校验族 / `userRef` / `itemRef` 死 API（r7 I-11~I-14）；StateMachine 单事件单跳 / 宿主 delete-trigger 静默 skip / 同 current 多 transfer 取声明序（r2 R-4 / r7 I-5 / I-8）。
- **性能/资源**：global dict 变更触发宿主全表扫描（S3）；async task 表只增不减（r2 I-6）；级联无深度上限（r2 I-5）；迁移锁无租约（r2 I-13）。
- **驱动**：MySQL 事务文档化不支持；number 类型映射 SQLite/MySQL `INT` vs PG `DOUBLE PRECISION`（r2，r8 已核实 SQLite 侧非问题）；boolean 写侧不归一化（r1 R-6 写侧遗留）。
- **信任边界**：`func::` + `new Function` 反序列化即代码执行（r3 I-16，r8 已文档化）。
- **combined record**：挤出/搬迁不发实体级事件（r8 R-3 已按预言机固化为正确语义，`mergeLinks` 去留仍是产品决策）。

## 七、修复优先级建议（遗留项）

1. **I-1 filtered 端点 relation 的 property 聚合语义补全**——r8/r9 两轮 fail-fast 把静默错值全部封死了，但也意味着这个合法声明组合目前没有任何可用路径，是功能空洞而不只是债务；
2. I-3 migration rename 一等支持（或文档明确契约）；
3. I-2 dispatch 时序契约文档化 + I-4 守卫返回值类型收紧（同属「契约明确化」家族，改动小）；
4. 六聚合模板抽取后的下一个模板化目标：`EntityQueryHandle` 写入口的载荷校验（本轮 `__type` 保护是第一个成员，未知属性静默丢弃是同族问题——r7 I-13 Klass 工厂未知参数的 storage 版）。

## 附录：复现要点（验证用）

- F-1：`Entity.create({ baseEntity, matchExpression, properties: [新属性] })` → setup 应抛 `Filtered entity ... cannot declare its own property`；同名再声明应通过。
- F-2：两个 relation 同 `source`+`sourceProperty` → setup 应抛 `Relation property name conflict`；对称自引用（单 relation 双端同名）应通过。
- F-3：自引用 n:n，数据 `A→B→C→D→C`，label/goto 递归 + 恒 false 的 exit → 应正常返回（旧代码无限递归）。
- F-4：merged entity 的 input 名下 `create/update` 显式携带 `__type` → 应抛 discriminator 错误；嵌套载荷（`contact: {id, __type}`）同样拦截。
- R-1：跨 Activity 传 activityId → 应得到 `belongs to activity "A", not "B"` 的业务级错误。
- K-1：Custom 增量读 update 事件未变更字段 → 文档模式漂移；`{...oldRecord, ...record}` 模式与真值一致。
