# 全代码库深度 Review 报告（2026-07-11 第二十轮）

- 日期：2026-07-11
- 基线：`main` @ `b06f5448`（v4.0.1，r1–r19 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1908 passed / 26 skipped**
- 范围：五路并行深度探查（runtime 基础设施与异步计算 / storage 查询编译与执行 / storage 写路径与 Setup / runtime 调度与计算句柄 / core+builtins+drivers）+ 对全部致命候选**亲自编写最小复现实际运行**（PGLiteDB / SQLiteDB）
- 方法：与 r1–r19 全部报告逐条去重；每个候选先做代码路径二次追踪，再以运行时复现定谳。「已复现确认」才列为致命。
- 修复状态：**五个致命项 + 两个重要项已在本分支（`cursor/deep-code-review-r20-bfe0`）全部修复**，回归固化于 `tests/storage/review-fixes-2026-07-11-r20.spec.ts`（22 用例）、`tests/runtime/review-fixes-2026-07-11-r20.spec.ts`（6 用例）与 `tests/core/relationDeclarationGuards.spec.ts`（+2 用例）。修复后 `npm run check` 通过，`npm test` 全量通过（含新增回归）。

---

## 一、结论摘要

r20 最重要的发现是：**r19 自己的两个修复各留下了同族漏网**——这正是 AGENTS.md「修类不修实例」清单要防的形态，发生在把该清单写进制度的同一轮修复里：

1. **行内（in-row）写路径 × filtered 视图的成员资格事件整族缺失**（F-2，影响面最大）——merged link 与 combined 记录的数据落在宿主行上，其 create/update/delete 事件由 `preprocessSameRowData` / `flashOut` / `DeletionExecutor` **手工 push**，从不经过 `handleRecordCreation` / `collectMembershipChecks` / `collectDeletionMemberships`。以这些 link/combined 记录为 base 的 filtered relation / filtered entity 视图：查询面正确、事件面零事件——实测**七个行内写法格全军覆没**（host-create-with-ref、同 id `&` 原地翻转、update-replace 的新 link、combined 新记录创建、host 删除、combined 抢夺、removeRelation/relocate）。下游 `Count over filtered relation` 永久陈旧。r19 F-3 修的「combined 抢夺 × 宿主侧 filtered entity」恰是这个家族的**一个格**。
2. **`between` + `isReferenceValue` 的引用路径从不入 JOIN 树**（F-1）——r12 F-2 修了外层 direct match 的字符串引用、r19 F-2 修了 EXIST 载荷的字符串引用，两轮修复都只认 `value[1]` 为字符串的形态；between 的引用对（`['a.b','c.d']`）是**同一声明面的第三个漏网读者**，SQL 直接抛 `missing FROM-clause entry`。
3. **关系端点经 generic `update()` 静默重指且零事件**（F-3）——`updateRelationByName` 有「端点不可变」断言，`update(relationName, …, {target: {id}})` 是同一契约的不设防入口：端点列被物理重写，**旧 link 无 delete、新 link 无 create、连 update 事件都没有**。顺带击穿 r18 F-4 的 ScopedSequence scope 守卫（该守卫只监听 host update 与 relation delete）。
4. **flashOut 产生的 link create 事件缺 source/target 端点**（F-4）——与 `preprocessSameRowData` 的 link create 事件契约不一致，按端点模式匹配的下游（StateMachine trigger / Transform eventDeps）对该事件失明。
5. **StateMachine `trigger.record` 在 update 事件上按部分 record 匹配**（F-5）——update 事件的 `record` 只携带 changed keys；eventDep 匹配器早已实现「合并 oldRecord 得到当前状态」语义，`TransitionFinder` 是同一声明面（RecordMutationEventPattern）的分裂读者：`record: {status:'published'}` 的 trigger 在一次只更新 title 的事件上静默不触发。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修复） | 5 | 行内写路径 × filtered 视图事件整族缺失、between 引用 JOIN 缺失、端点静默重指零事件、flashOut link 事件缺端点、trigger.record 部分匹配 |
| 重要（已修复） | 2 | IN/NOT IN 含 null 三值逻辑治理（r19 记录项）、filtered/merged relation 矛盾声明守卫 |
| 重要（记录，本轮不修） | 若干 | 见第三节 |

---

## 二、致命问题（全部已复现确认并修复）

### F-1 `between` + `isReferenceValue` 的引用路径从不入 JOIN 树——direct match 与 EXIST 载荷双双崩溃

- 位置：`src/storage/erstorage/MatchExp.ts` `buildQueryTree`（原 L172 只认 `typeof value[1] === 'string'`）与 `collectExistReferencePaths`（原 L246 同样只认字符串）；对照 `getFinalFieldValue` 的 between 分支（L404-409）对 `value[1]` 的两个元素分别 `getReferenceFieldValue` 编译成列引用。
- 机理：引用被编译进 SQL（`"User_leader"."minSal"`），但引用路径的 JOIN 入树逻辑不认识 between 的数组形态 → 外层 FROM 里没有 `User_leader` → `missing FROM-clause entry for table "User_leader"`。
- 复现（实测，PGLite）：

```
find('User', { salary: ['between', ['leader.minSal','leader.maxSal']], isReferenceValue: true })
→ error: missing FROM-clause entry for table "User_leader"   ❌（direct match）
find('User', { friends: ['exist', { age: ['between', [...]], isReferenceValue: true }] })
→ 同错                                                        ❌（EXIST 载荷）
```

- 影响：fail-loud 崩溃（非静默），但这是 `isReferenceValue` 声明面**第三次**漏网（r12 修 direct 字符串、r19 修 EXIST 字符串、between 两处都漏）——同一声明面的引用形态识别散落在两处且互相不一致。
- 修复：收口为单一识别器 `MatchExp.collectAtomReferencePaths`（字符串单引用 + between 引用对），`buildQueryTree` 与 `collectExistReferencePaths` 两个消费方共用。引用形态今后只在这一处登记。
- 回归：direct + EXIST 两用例（`review-fixes-2026-07-11-r20.spec.ts` F-1 组）。

### F-2 行内（merged link / combined 记录）写路径的 filtered 视图成员资格事件整族缺失

- 位置：`src/storage/erstorage/CreationExecutor.ts` `preprocessSameRowData`（手工 push 的 combined 记录 create、行内 link create、同 id `&` 原地 update 事件——零视图钩子）；`RecordQueryAgent.ts` `flashOutCombinedRecordsAndMergedLinks`（手工 push 的旧 link delete / 新 link create）与 `relocateCombinedRecordDataForLink`；`DeletionExecutor.ts` `deleteRecordSameRowDataGrouped`（宿主删除时手工 push 的行内 link delete）。
- 机理：filtered 视图的成员资格事件由三个记录级钩子产生（`handleRecordCreation` / `collectMembershipChecks`+`settleMembershipChecks` / `collectDeletionMemberships`+`settleDeletionMemberships`），全部挂在 `createRecord`/`updateRecord`/`deleteRecord` 上。行内记录（merged link 的 FK+属性列、combined 三表合一的记录列）不作为独立记录写入——事件手工 push、钩子全部旁路。r19 F-3 只补了「combined 抢夺时**宿主**的 filtered entity」这一格。
- 复现（实测，PGLite，`PrimaryUserTeam = filtered(UserTeam n:1 merged, isPrimary=true)` 等三套 fixture，七个格全红）：

```
create('User', {team: {id, '&': {isPrimary: true}}})     → 查询面 1 行 ✓ 事件面零 PrimaryUserTeam ❌
update 同 id '&' isPrimary true→false                    → 查询面退出 ✓ 零 delete ❌
update 换 team（replace）                                 → 旧 link delete ✓（经 deleteRecord）新 link 零 create ❌
create('User', {profile: {title, verified: true}})（combined）→ 零 VerifiedProfile create ❌
delete('User')（行内 link 随行消失）                       → 零 PrimaryUserTeam delete ❌
combined 抢夺                                             → 零 ActiveUserProfile delete/create ❌
removeRelationByName（combined relocate）                 → 零 ActiveUserProfile delete ❌
对照组：isolated n:n 经 createRecord ✓、updateRelationByName ✓
计算面：Count over PrimaryUserTeam 在上述写法下永久陈旧    ❌
```

- 影响：filtered relation / combined 记录上的 filtered entity 是文档一等形态（`usage/09`），n:1/1:1 的默认拓扑就是 merged/combined——**最普通的声明组合**下视图的响应式计算全部静默失灵。「数据变更必有事件」契约的最大一次成族破坏。
- 修复（汇合点收口，不逐格修补）：
  - `FilteredEntityManager` 新增 **post-write 任务队列**（挂在 events 数组上，与 ledger 同作用域）：create 形态在物理写入完成后按 `handleRecordCreation` 契约求值（谓词只由 SQL 求值，preprocess 时行还没写入）；update 形态在 enqueue 时采集 before 快照（行还活着）、写入后 settle diff。`insertSameRowData` / `updateSameRowData` 的写入完成点统一 drain。
  - **删除快照扩展**：`collectDeletionMemberships` 把「随本行消失的行内 link」（mergedRecordAttributes / notRelianceCombined / sameTableReliance 的 link）一并快照为子快照；`DeletionExecutor` 事件段 push 完 base link delete 后用 `settleDeletionMemberships` 生成视图 delete。
  - flashOut / relocate：物理清列前 `collectInlineDeletionSnapshot`（轻量非递归快照），base 事件后 settle；新 link 走 post-write 队列。
- 回归：storage 面 9 用例（七个行内格 + 谓词不匹配对照 + 直接写法对照）+ runtime 面 1 用例（Count over filtered relation 走完 create/flip/delete 全程）。

### F-3 关系端点经 generic `update()` 静默重指——数据变更零事件，ScopedSequence 守卫被击穿

- 位置：`src/storage/erstorage/UpdateExecutor.ts` `updateRecord`（原实现对 link 记录的 `source`/`target` 载荷不设防）；对照 `EntityQueryHandle.updateRelationByName` L152 的既有断言（"Relation can only update attributes"）。
- 复现（实测，PGLite，`UserProject n:1`，link merged 进 User 行）：

```
update('UserProject', {id: link.id}, {target: {id: p2.id}}, events)
→ user.project 从 P1 变成 P2       ❌ 数据面被物理重指
→ events = []                      ❌ 零事件（无 delete、无 create、无 update）
```

- 影响：（a）「数据变更必有事件」被最彻底地破坏——下游一切响应式计算失明；（b）r18 F-4 的 ScopedSequence scope 不可变守卫只监听 host update 与 relation delete，端点 update 是旁路——已编号记录可被静默移 scope，重复编号 + 唯一约束下目标 scope 永久堵死（r18 修复的原始病灶复活）。
- 修复：`UpdateExecutor.updateRecord` 对 link 记录的端点**变更** fail-fast（错误信息给出 addRelation/removeRelation 出路）；**同 id 幂等引用放行**——Transform 派生 relation 的 update patch 会原样携带端点（migration 测试即依赖此形态）。`updateRelationByName` 的断言（全量拒绝）与 generic 路径（幂等放行）在「不可重指」这一契约上同构。
- 回归：端点变更拒绝 + 数据面未触碰 + 同 id 幂等引用合法（2 用例）。

### F-4 flashOut 产生的 link create 事件缺 source/target 端点

- 位置：`src/storage/erstorage/RecordQueryAgent.ts` flashOut 的新 link create（原实现 record 只有 `{...linkRecordData, id}`）；对照 `preprocessSameRowData` L313-315（link 事件补挂两端）。
- 复现（实测）：combined 抢夺后 `create:UserProfile` 事件 `record = {"id":"…"}`——无 source、无 target。
- 影响：同一事件类型（link create）在两条产生路径上 payload 契约分裂；按 `record: {source: {id}}` 模式匹配的 StateMachine trigger / Transform eventDeps 对 flashOut 路径失明（静默不触发）。
- 修复：flashOut 补挂端点（新 owner id 由 `preprocessSameRowData` 显式传入——flashOut 拿到的 `newEntityData` 在 create 场景没有新分配的 id）；create/update 两条抢夺路径同验。
- 回归：create 路径 + update 路径的端点断言（1 用例 2 断言组）。

### F-5 StateMachine `trigger.record` 在 update 事件上按部分 record 匹配——与 eventDep 轨道语义分裂

- 位置：`src/runtime/computations/TransitionFinder.ts` `matchMutationEvent`（原实现直接 `deepPartialMatch(event, trigger)`）；对照 `ComputationSourceMap.shouldTriggerEventBasedComputation` L363-370（明确注释「合并 oldRecord 和 record 来获得完整的当前状态」）。
- 机理：update 事件的 `record` 只携带本次实际写入的字段（changed keys + id）。`trigger.record: {status: 'published'}` 要求 `status` 出现在事件的 record 里——一次只更新 title 的事件（record = {title, id}）静默不命中，即便记录的 status 就是 published。同一声明面（RecordMutationEventPattern）的两个读者一个合并、一个不合并。
- 复现（实测，PGLite）：`status='published'` 的记录更新 title → 期望转移（合并语义）→ 实际 phase 停在 draft ❌；Transform eventDeps 同形声明 → 触发 ✓（轨道分裂实锤）。
- 影响：「记录处于某状态时的任何更新」是 record 模式的自然语义（eventDep 轨道已经这样工作）；StateMachine 侧静默不触发且无告警。
- 修复：抽出共享合并视图 `mergedMutationEventView`，`TransitionFinder` 与 `shouldTriggerEventBasedComputation` 两个读者共用（汇合点收口）。「本次更新触及字段 X」的语义继续由 `keys: ['X']` 表达（keys 匹配保持不变，可与 record 组合）。
- 回归：合并命中 / 不匹配不触发 / 直接写匹配字段仍触发 / keys+record 组合 / Transform eventDeps 同构对照（5 用例）。
- 升级注意：此前依赖「update 的 record 模式只匹配本次写入字段」的 trigger 行为会改变——该写法应改用 `keys`（语义等价且明确）。合并语义下宿主自更新回声匹配面变宽，属 r7-I-8 已文档化的回声家族（无 keys 的 update trigger 本就匹配回声）。

---

## 三、重要问题

### 已修复（本轮）

- **I-1 `IN`/`NOT IN` 值数组含 null 未治理**（r19 第三节第 1 条记录项）：SQL 三值逻辑下 `col IN (…, NULL)` 恒不匹配 NULL 行、`col NOT IN (…, NULL)` 对任意行 UNKNOWN——**静默过滤掉所有行**。修复：`buildFieldMatchExpression` 编译期拆分（`splitNullInListValue`）——in → `(IS NULL) OR (IN 非空集)`、not in → `(IS NOT NULL) AND (NOT IN 非空集)`；每个分支是独立原子走正常编译管线（列引用由 SQLBuilder 统一加前缀，EXIST 子查询安全），与约束层 `SchemaDialect.predicateSQLForOperator` 的既有 null 拆分语义对齐；`getFinalFieldValue` 留断言防绕过。不含 null 的列表保持 SQL 原生语义（NOT IN 不匹配 NULL 行——未显式声明时不替用户做决定）。回归 PGLite+SQLite 双驱动 6 用例。
- **I-2 filtered/merged relation 的矛盾声明被静默丢弃**：`Relation.create` 对 filtered relation 显式传入的 `type`/`source`/`target`、merged relation 显式传入的 `type`，此前通过校验后被继承值静默覆盖（声明形同虚设）。修复：矛盾值 fail-fast；与 base 一致的显式值放行（`Relation.clone` 原样携带这些字段，往返不受影响）。回归 +2 用例（`relationDeclarationGuards.spec.ts`）。

### 记录，本轮不修（按影响排序，均有代码证据）

1. **`asyncReturn` 返回形态与计算模式不匹配时静默写穿**（runtime 探查，中）：`Scheduler.handleAsyncReturn` 按「是否声明 `incrementalPatchCompute`」选 apply 路径；非 patch 计算的 `asyncReturn` 误返回 patch 形态对象（`{type:'update', data}`）会被 `applyResult` 原样写入 dict/property（信封污染下游）。反向（patch 模式返回裸值）已 fail-fast。无法按值形状可靠推断意图（`{type}` 键的对象可以是合法业务值），建议文档强化 + `asyncReturn` 协议说明。
2. **`GlobalBoundState.setInternal` 在 install 期是两个独立事务**（runtime 探查，中）：`atomic.replace`（自开事务）+ `dict.setInternal`（无事务包装）——install 中途失败会让 `_ComputationState_` 与 `_Dictionary_` 分叉。dispatch 路径复用外层事务不受影响。建议 install 默认值 seeding 整体包一个事务。
3. **EXIST 命中的 x:n 路径仍加入外层 JOIN 树**（storage 查询探查，性能）：谓词已由 EXISTS 子查询表达，外层 LEFT JOIN 只贡献 fan-out（触发保守 post-pagination，r12-I-5 的源头）。建议 `buildQueryTree` 对 exist 原子跳过 `addRecord`。
4. **`handleAsyncReturn` 在 commit 期连接故障重试时可能双次 apply**（runtime 探查，边缘）：任务状态 `applied` 随失败 commit 回滚，重试重放 asyncReturn+apply——幂等写安全，非幂等变换双次生效。与 S2（guard/afterDispatch 重放）同族不同点。
5. **`asyncReturn` 返回 undefined 即标记 applied**（runtime 探查）：漏写 return 的 asyncReturn 永久消费任务且不写值、无 failed 状态。建议至少 debug 日志。
6. **Activity `any` 组的并发双头窗口**（builtins 探查）：排他剪枝在 `onChange`（首分支推进后）才发生，两个并发 dispatch 可同时进入不同 head 的 resolve；CAS 保证只有一个提交（DB 无双写），但 resolve 内的外部 IO（违反契约但可能存在）会双发。建议 `wrappedGuard` 阶段做分支独占 CAS。
7. **`RefContainer.replace*` 不重写 `entity.properties[].computation` 内的引用**（core 探查）：替换实体后 clone 图中 Property.computation.record 仍指旧实例——r18 已记录的「replace 不 clone」家族的引用维度补充。主路径（setup 用 add + getRawInstances）不受影响。
8. **create 载荷显式 `{field: undefined}` 进 INSERT 列列表**（core 探查，低）：显式 undefined 键与缺失键行为分叉（driver 相关：PG 系写 NULL、better-sqlite3 抛绑定错误）。建议 storage 写入口把显式 undefined 视同缺失或 fail-fast。
9. **`addSourceMap` 在 `initialize()` 之前调用时报错形态不佳**（runtime 调度探查，低）：事件命名空间未建立时可达性校验对一切 recordName 报「不存在」——fail-loud 但信息误导。建议专门的「先 initialize」错误。
10. **RealTime `solve()` 可能返回过去时间戳**（低，休眠）：`nextRecomputeTime` 全链无消费方（r3-R5），时间调度器落地时需加 `solved > now` 守卫。
11. **布尔读归一化不覆盖字符串 `'0'/'1'`**（低）：当前四驱动不产生该形态，防御性记录。
12. **矩阵格建议**：`orderBy x:1 字段 × x:n fan-out × post-pagination` 组合无覆盖（正确性依赖「x:1 排序键在扇出行间恒定」这一未断言的性质）。

### 证伪/降级的候选（本轮探查结论被推翻或核实为既有设计的）

| 候选 | 结论 |
|------|------|
| 「Transform eventDeps 声明 update/delete 也恒产 insert patch」（调度探查 C-3，初判重要） | r19 第四节已核实为 audit 场景刻意形态（eventDeps 不维护源↔派生映射），属文档问题，不重复立项 |
| 「JSON =/!= 分支对操作符大小写敏感」（查询探查 #5） | `=`/`!=` 是符号无大小写形态；`lowerOp` 已归一化词形操作符。非问题 |
| 「ScopedSequence 可经 relation update 换端点绕过守卫」（调度探查 C-2） | 复现证实的是更深一层的 F-3（generic update 静默重指 + 零事件）；F-3 修复后端点 update 一律 fail-fast，该绕过路径不存在了 |
| 「Interaction.parse 留下未解析的 uuid:: action」（core 探查 #5） | `tests/builtins/serialization-r4.spec.ts` L135 已把「standalone parse 保留编码、graph 管线负责解析」固化为标注契约 |

---

## 四、既有遗留项复确（r2–r19 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；update/create 返回值三态（r16-O-2/r17-R-4）；`Custom.asyncReturn` 2 参（r5-I-15）；StateMachine 单事件单跳 + 宿主自更新回声（r7-I-8，F-5 的合并语义扩大了回声匹配面，同族）；`func::` 信任边界、`ignoreGuard`（文档化）；对称 n:n link API 不归一化端点（r4-I-17/r7-I-2，五轮复确，待产品决策）；checkCondition 先于 checkPayload（r19 #7）；`onlyRelationData` 合并取宽（代码注释已声明的刻意语义）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减（r2-I-6）；级联删除无深度上限（r2-I-5）；offset-only 全量拉取（r12-I-4）；EXIST 误触 post-pagination（r12-I-5，本轮第三节第 3 条给出源头修法）；`Entity.clone` 共享 constraints 数组（r19 #5）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；lockRows 5 轮上限（r15-O-3）；Activity every 组 CAS 不自动重试（r16-O-7）。
- **时间调度**：`nextRecomputeTime` 全链无消费方（r3-R5）。
- **驱动**：MySQL 无事务（文档化）；contains 四驱动语义矩阵（r12-I-6）；PGLite UUID id vs 其他 INT；driver 错误映射缺口（r19 #8）。
- **迁移审阅完整性三缺口**（r18 第三节）：`defaultValue` 变更不进 manifest、落盘 deps 剥离 match、重算无 per-computation log；`canonicalizeArgsForSignature` 对 Date/Set/Map/RegExp 坍缩（r19 #3）。
- **property 级 filtered targetPath 同批去重缺口**（r19 #4）：本轮调度探查复核，机制与记录一致、未发现更坏形态。

---

## 五、修复优先级与后续建议

本轮五个致命项 + 两个重要项已全部修复。后续轮次建议：

1. **EXIST 跳过外层 JOIN 树**（第三节第 3 条）——r12-I-5 记录的 post-pagination 误触的源头修法，正确性收益（消除 fan-out 依赖）+ 性能收益一次拿到。
2. **install 期全局状态 seeding 事务化**（第三节第 2 条）+ **asyncReturn 协议 fail-fast**（第 1 条）——async/install 面的两个中等缺口，可一并处置。
3. **createClass 统一声明期校验**（r16 建议 4，多轮复确）——本轮 I-2 又添了两处手写守卫；Property.type 白名单、Payload 重名、Activity 环检测等积压项等一次性机制收口。
4. **clone/replace 隔离语义统一**（r19 #5 + r18 RefContainer + 本轮第三节第 7 条）——三轮记录的同一家族，建议独立轮次收口。

### 升级注意（behavior-tightening，供 CHANGELOG 参考）

- **StateMachine `trigger.record` 在 update 事件上的语义修正**：从「匹配本次写入的字段集」改为「匹配合并后的当前状态」（与 eventDep 轨道一致）。依赖旧行为的声明改用 `keys`（可与 record 组合）。
- **新增运行期 fail-fast**：关系端点经 `update()` 变更（此前静默重指 + 零事件）；同 id 幂等引用不受影响。
- **新增声明期 fail-fast**：filtered/merged relation 的矛盾 `type`/`source`/`target` 声明（此前静默丢弃）。
- **`IN`/`NOT IN` 含 null 的语义修正**：从 SQL 三值逻辑的静默陷阱（in 不匹配 NULL 行 / not in 匹配零行）改为显式 null 分支语义。依赖旧（错误）行为的查询极不可能存在（旧行为是「永远查不到想查的行」）。
- **行为激活**：行内写路径（merged link / combined）上的 filtered 视图成员资格事件从缺失变为正常发出——此前对这些视图静默陈旧的下游计算将开始收到事件（首次 setup 后的全量重算会把存量错值纠正）。

---

## 附录：复现要点（验证用）

全部固化在 `tests/storage/review-fixes-2026-07-11-r20.spec.ts`、`tests/runtime/review-fixes-2026-07-11-r20.spec.ts` 与 `tests/core/relationDeclarationGuards.spec.ts`：

- F-1：between 引用（direct + EXIST）执行并正确过滤，不再抛 missing FROM-clause。
- F-2：七个行内写法格的视图事件断言 + 谓词不匹配对照 + 直接写法对照；Count over filtered relation 全程新鲜。
- F-3：端点变更 fail-fast 且数据面未触碰；同 id 幂等引用 + 属性更新合法。
- F-4：combined 抢夺（create/update 双路）的 link create 事件携带 source/target。
- F-5：合并语义真值表（命中/不命中/直写/keys 组合）+ Transform eventDeps 同构对照。
- I-1：in/not in × 含 null/纯 null/不含 null × PGLite/SQLite 全矩阵。
- I-2：filtered relation 矛盾 type/source/target 拒绝、一致值与 clone 放行；merged relation 矛盾 type 拒绝。
