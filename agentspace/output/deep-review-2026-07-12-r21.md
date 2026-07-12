# 全代码库深度 Review 报告（2026-07-12 第二十一轮）

- 日期：2026-07-12
- 基线：`main` @ `8054dcff`（v4.0.2，r1–r20 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1938 passed / 26 skipped**
- 范围：四路并行深度探查（runtime 基础设施与事务 / 调度与计算句柄 / storage 查询编译与执行 / 写路径与 Setup / builtins+core+drivers+migration）+ 对全部致命候选**亲自编写最小复现实际运行定谳**（PGLiteDB）
- 方法：与 r1–r20 全部报告逐条去重；每个候选先做代码路径二次追踪，再以运行时复现定谳（本轮 4 项探查候选被复现证伪或降级，见第四节）。「已复现确认」才列为致命。
- 修复状态：**两个致命项 + 三个重要项已在本分支（`cursor/deep-code-review-r21-6038`）全部修复**，回归固化于 `tests/runtime/review-fixes-2026-07-12-r21.spec.ts`（9 用例）、`tests/storage/review-fixes-2026-07-12-r21.spec.ts`（4 用例）与 `tests/core/boolexp.spec.ts`（+4 用例）。修复后 `npm run check` 通过，`npm test` 全量通过（含新增回归）。

---

## 一、结论摘要

r20 之后，storage 写路径、聚合增量一致性、filtered 成员资格事件等高危面进一步收敛（本轮 storage 查询编译与 runtime 事务面均未发现新致命项）。本轮两个致命发现都落在**「同一语义的第二套判定实现」**上——这正是 r19 复盘写进登记册的「底层原语正确性」轴在数据流内部的兑现：

1. **records dataDep 的 match 本地求值与 SQL 判定分裂**（F-1，影响面最大）——增量调度用事件快照对 `match` 做本地求值来决定 skip/entered/left（`Scheduler.buildMatchEventContext`）。本地求值器把「键缺席」与「值为 null」混为一谈、负向操作符不按 SQL 三值逻辑。四个实测形态：match 建立在 **computed 列**上时 create 事件被静默 skip（计算永久少计）；`['=', null]`（IS NULL 语义）同样被 skip（少计）；`['!=', x]` 对缺席字段被误判 entered（**多计**——SQL 面该行根本不满足谓词）；match 跨关联路径时**更新聚合自身字段**被 skip（update 前置查询裁剪掉未涉及的关系，oldRecord 无该键 → 双 false）。「增量与全量必须同答案」是框架的根本契约，这是对它的静默破坏。
2. **combined 拓扑经 addRelation 抢夺：旧 owner 的 filtered entity delete 事件缺失**（F-2）——r19 F-3 修了 create/update 抢夺（业务属性 ref 形态），但 addRelation 形态下正在创建的是 link record、`combinedRecordIdRefs` 是虚拟端点 ref，旧 owner 收口分支被 `isLinkSourceRelation()` 守卫排除——同一家族的第三个入口形态漏网（复现：查询面 u1 正确退出视图、事件面零 delete）。顺带发现该路径还把 delete 事件 push 在**虚拟 link 名**（`UserProfile_target`）下——r18「storage 从不以虚拟 link 名发事件」不变量的对偶面破坏（幻影事件）。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修复） | 2 | match 本地求值与 SQL 分裂（skip/entered 误判 → 静默少计/多计/陈旧）、combined addRelation 抢夺旧 owner 视图事件缺失（+ 虚拟 link 幻影事件） |
| 重要（已修复） | 3 | between 边界含 null 静默零行、PayloadItem.type 未知值静默零校验（+ Payload 重名）、BoolExp atom 非 boolean truthiness 求值 |
| 重要（记录，本轮不修） | 若干 | 见第三节 |
| 证伪/降级 | 4 | 见第四节 |

---

## 二、致命问题（全部已复现确认并修复）

### F-1 records dataDep 的 match 本地求值与 SQL 判定分裂——增量计算静默少计/多计/陈旧

- 位置：`src/runtime/Scheduler.ts` `readMatchPath` / `compareMatchValue` / `evaluateRecordsMatch`（原 L827-883）；消费方 `buildMatchEventContext` → `executeDataBasedComputation` 的 `context.skip` 收口（L1024）。
- 机理：本地求值的用途是「事件对该 match 确定性地新旧都不匹配 → skip」。但（a）`readMatchPath` 对缺席键返回 undefined 参与比较——事件快照的键集合 ≠ DB 行的列集合（create 事件不携带 computed 列；update 的前置查询把未涉及的关系属性裁剪掉）；（b）`compareMatchValue` 不按 SQL 三值逻辑：`undefined === null` 为 false（SQL `IS NULL` 对 NULL 行为 true）、`undefined !== 'x'` 为 true（SQL `NULL != 'x'` 是 UNKNOWN 不匹配）、`not in` 同构；（c）like 的本地正则不支持 `_` 通配、大小写敏感性因驱动而异（PG 敏感 / SQLite ASCII 不敏感）。
- 复现（实测，PGLite，四形态全红）：

```
Custom dataDeps: { items: { type:'records', source, match, attributeQuery } } + incrementalCompute
match {isActive:['=',true]}（computed 列）  create('Task',{status:'active'}) → skip → 总和恒 0   ❌ 少计
match {assignee:['=',null]}                 create({value:5})（不带字段）    → skip → 恒 0        ❌ 少计
match {status:['!=','archived']}            create({value:9})（不带字段）    → entered 误判 → 9   ❌ 多计（SQL 面 0 行匹配）
match {'team.type':['=','tech']}            update(task,{value:5})           → skip → 停在 1      ❌ 陈旧
对照：match 字段在 payload 中直接给出        skip/enter 语义正常              ✓
```

- 影响：`match` 是 `RecordsDataDep` 的公开声明面（Custom 计算、内置聚合的额外 dataDeps 都可携带）。skip 由框架先于 `planIncremental` 集中收口（r15 S-4），计算句柄无法自救；多计形态连全量重算都不会触发（事件被当作合法 entered 喂给 incrementalCompute）。这是「增量 == 全量」契约的直接破坏，且四个形态全部是自然声明 + 常规写入。
- 修复（汇合点收口）：`readMatchPath` 区分「键缺席」（`hasOwnProperty` 逐段检查，返回 unresolved）与「值为 null」（中段 null 按 LEFT JOIN 语义解析为终端 NULL）；缺席的**普通值属性**按快照完备性契约解析为 NULL（create 事件 = defaults+payload、update 的 oldRecord 保留全部值属性——普通值字段缺席 ⟺ 库里 NULL），computed/computation 属性与关联路径缺席则不可判定 → 保守 full recompute；`compareMatchValue` 逐操作符镜像 MatchExp 编译语义（`=`/`!=` 对 null 操作数按 IS NULL/IS NOT NULL、NULL 行对非 null 操作数恒不匹配、in/not in 按 r20 编译期拆分后的语义、新增 is null/is not null、like 与对象值/isReferenceValue 一律不可判定）；`evaluateRecordsMatch` 的 and/or 按 Kleene 三值逻辑短路（false AND unknown = false、true OR unknown = true）。
- 回归：四形态 + skip/enter 对照组共 5 用例（`review-fixes-2026-07-12-r21.spec.ts` F-1 组）。

### F-2 combined 拓扑经 addRelation 抢夺：旧 owner 的 filtered entity delete 事件缺失 + 虚拟 link 幻影事件

- 位置：`src/storage/erstorage/RecordQueryAgent.ts` `flashOutCombinedRecordsAndMergedLinks`——旧 owner 收口分支（原 L191）带 `!isLinkSourceRelation()` 守卫：addRelation 形态下正在创建的是 link record，`combinedRecordIdRefs` 是虚拟端点 ref，被守卫排除；同函数 ref 循环的事件 push（原 L226-231）对虚拟 ref 也 push delete，recordName 是虚拟 link 名。
- 复现（实测，PGLite，combined `User.profile 1:1` + `UserWithProfile = filtered(User, profile.id not null)`）：

```
u1(VIP)+profile 创建；u2 创建
addRelationByNameById('UserProfile', u2.id, profile.id, {}, events)
→ 查询面：UserWithProfile 成员 [u2]                          ✓
→ 事件面：零 UserWithProfile delete(u1)                       ❌
→ 事件流含 {type:'delete', recordName:'UserProfile_target'}   ❌ 幻影（r18 不变量：虚拟 link 名从不发事件）
对照：create('User',{profile:{id}}) 抢夺形态（r19 F-3 已修）  ✓ delete(u1) 存在
```

- 影响：下游对该视图的响应式计算（Count/Every/StateMachine trigger）永久陈旧。抢夺有三个入口形态（create-with-ref / update-with-ref / addRelation），r19 修复按复现覆盖了前两个——「修类不修实例」清单第 1 条（枚举声明面全部读者）在**操作入口维度**上的又一次兑现失败。
- 修复（汇合点收口）：flashOut 内每条手工 push 的旧 link delete（旧业务 link、被替换的旧 merged link）统一按 `deleteRecord` 对 link 删除的契约采集两端实体的成员资格快照（`collectLinkMembershipChecks`，物理清列之前），与既有 `oldOwnerMembershipChecks` 一并在清列后结算；行迁移中的被抢夺端点 settle 时查不到行会安全跳过（由 createRecord 级的 `collectCreationLinkChecks` 在写入完成后覆盖——B3 对照实测确认该路径健康）。虚拟端点 ref 的 delete push 移除（业务 link delete 已由 `newRecordIsLink` 分支按业务名发出）。
- 回归：addRelation 抢夺（旧 owner delete + 新 owner create + 被抢 Profile 的跨宿主谓词视图 delete + 零虚拟 link 事件）+ create 抢夺对照组（2 用例）。

---

## 三、重要问题

### 已修复（本轮）

- **I-1 `between` 边界含 null/undefined 静默零行**：`MatchExp.getFinalFieldValue` 的 between 分支只校验数组长度。SQL `col BETWEEN NULL AND x` 恒为 UNKNOWN——静默匹配零行（实测确认）。=/!= 的 null 已翻译成 IS NULL/IS NOT NULL、其余 simpleOp 的 null 已 fail-fast（r12）、in/not in 已编译期拆分（r20 I-1）——between 是这个「null 载荷」家族的最后一个未决策成员。修复：非引用形态的 null/undefined 边界编译期 fail-fast（单边界区间用 `['>=', min]` / `['<=', max]` 显式表达）。回归 2 用例（拒绝 + 字面量/引用边界照常工作）。
- **I-2 PayloadItem.type 未知值静默零校验 + Payload 重名**：运行期只有 string/number/boolean/object 有 primitive 校验、Entity/Relation 走 base 概念校验；`type: 'json'`/`'timestamp'`/大小写笔误等任意字符串被静默接受且不做任何校验（声明形同虚设——silently-broken declaration 家族，与 r18 的 Property.type 白名单缺口同类）；`type: 'Entity'` 无 base 同样整段跳过。修复：声明期白名单（六个合法值）+ Entity/Relation 必须携带 base + Payload items 重名 fail-fast（r18 #4 记录项随手收口）。**仓库自己的 `stateMachine.spec.ts` 夹具带着 7 处 `type: 'Entity'` 无 base 的死声明**（实际载荷是 string/number），守卫落地后立即被抓出并修正——佐证该形态在真实代码里自然出现。回归 4 用例。
- **I-3 BoolExp atom 非 boolean 结果按 truthiness 求值**：`evaluate`/`evaluateAsync` 的 atom 分支对 handler 返回值按 truthiness 判定——falsy 的协议违规值（null/0/''）在 `not(...)` 下被取反成「通过」（与 r19 F-1 同族的 fail-open 形态，发生在 handler 协议层）。守卫链（`checkCondition`）已有 boolean 强制（r13），但那只保护一个消费方——本轮把契约提升到原语层：非 boolean 非 string 的返回值按错误处理，任何极性下都判失败（fail-closed）。同步/异步同构。回归 4 用例（`boolexp.spec.ts`）。

### 记录，本轮不修（按影响排序，均有代码证据）

1. **property 级 filtered targetPath 监听绕过 `resolveFilteredUpdateEvent`**（`Scheduler.ts` L597 早退，r19 #4 三轮复核后**降级为性能项**）：本轮亲自核实——filtered relation 上的 property 聚合，link 字段 update 事件以物理名到达，聚合模板的 `relatedMutationEvent.recordName === this.relation.name`（filtered 名）守卫不命中 → 恒退 `fullRecompute`。**正确性由全量重算自愈（同批 enter+update 不会 +2）**，代价是热路径重算风暴 + SERIALIZABLE 升级重试。建议与事件名改写一并收口。
2. **`settlePostWriteChecks` 先删队列再处理**（`FilteredEntityManager.ts` L563-575）：任务中途异常时剩余任务丢失（已发出的视图事件与未结算任务分裂）；物理写失败时队列残留在 events 数组上，调用方复用同一数组重试可能串批。dispatch 事务回滚场景无害；直接 storage 调用 + 捕获重试的形态才可见。建议 drain 语义显式化（copy-then-delete + 失败时清空并透传）。
3. **`GlobalBoundState` 的 dict 镜像只在 set/setInternal 双写**（`Computation.ts` L151-167 vs L177-198）：increment/replace/compareAndSet 不更新 `_Dictionary_` 镜像。框架自身零读者（`get()` 只读 `_ComputationState_`、migration 按 Dictionary 名读输出值），但测试把镜像当可观察面（`custom.spec.ts` L300）。镜像是遗留双轨——建议独立轮次收口单一事实源（移除镜像属行为变更；给 increment 补镜像会在并发下写入错序值，不可取）。与 r20 已录的 install 期双事务同族。
4. **`storage.atomic` 对记录业务列的写不产生 mutation events**（`MonoSystem.ts` L853+）：`atomicState.spec.ts` 明确 sanction 业务列用法（count/status），但零事件意味着依赖这些列的响应式计算全部失明。这是原语的刻意语义（绑定状态写入不得触发重算），但 usage 知识库没有 `storage.atomic` 章节、更没有这条警告——建议文档化「业务字段需要响应式传播时必须用 `storage.update`」。
5. **事件驱动计算不经过 `executeDataBasedComputation` 的 skip/信封协议**（`Scheduler.ts` L1235+）：event-based 句柄直接 `incrementalCompute`，返回 `ComputationResultFullRecompute` 等信封时无对应处理（与 r15/r16 在 data-based 路径修复的缺口对称）。当前内置句柄自洽，属框架契约缺口。
6. **`MonoStorage.dispatch` 的 listener 返回 events 不链式再派发**（`MonoSystem.ts` L1259-1267）：回调 A 返回的 events 只进 effects，不会喂给回调 B。今天无生产者，latent API 契约缺口。
7. **install 期 `scheduler.setup(true)` 半初始化窗口**（`Controller.ts` L277-296）：listener 已原子切换注册后，默认值 seeding / manifest 写入若中途失败，系统处于「部分计算已跑、部分 dict 未 seed」状态（fail-loud 但恢复窗口隐蔽）。与 r20 记录的 seeding 事务化建议一并处置。
8. **dict 编解码对 Date 无 codec**（`MonoSystem.ts` L284-291）：`dict.set(key, new Date())` 读回是 ISO 字符串。四驱动一致，属类型面缺口，建议文档或 codec。
9. **`getReversePath` 含 `&` 路径的 FIXME**（`EntityToTableMap.ts` L458-479）：filtered relation 谓词 rebase（`convertFilteredRelation`）依赖它，复杂 `&` 中间段路径的反向解析可能不完整。未构造出错误复现，记录待查。
10. **未知 match 操作符报错形态**（`MatchExp.ts` L452）：`['regexp', ...]` 等落到内部 `assert(result, 'unknown value expression ...')`，建议升级为「支持列表 + 建议」的受控错误。
11. **Activity `stateVersion` CAS 与 state 写入分两条 UPDATE**（`ActivityCall.ts` L389-415）：dispatch 事务内正确；若未来出现事务外调用路径则有半提交窗口。健壮性债务。
12. **x:n 预加载语义的文档缺口**（`QueryExecutor.findXToManyRelatedRecords`）：外层 match 经 x:n 路径过滤**父**记录，嵌套 attributeQuery 是 preload、返回全部子记录——标准 ORM 语义且 §11.5.1 提供嵌套 matchExpression 过滤子集，但 usage/12 §11.2.3 的示例（"Query users with specific tags"）易被误读为子集也被过滤。本轮已在文档补充说明。
13. **矩阵格建议**：`Setup.mergeRecords` 的边界拓扑（自引用 1:1 reliance 退化 merge、多跳 mergeLinks 冲突）未进登记册维度。

---

## 四、证伪/降级的候选（本轮探查结论被推翻或核实为既有设计的）

| 候选 | 结论 |
|------|------|
| 「combined 子实体 × 跨宿主谓词（`owner.name`）的 filtered entity 在 create/update 抢夺下缺成员资格事件」（写路径探查 C-1，初判高置信致命） | 复现证伪：create 抢夺路径经 `collectCreationLinkChecks`、update 路径经 `collectUpdateLinkChecks` 均覆盖被抢夺端点的实体侧视图（实测 `VipProfile` delete 事件存在）。家族真正的洞在 **addRelation 入口**（本轮 F-2，且缺的是旧 owner 侧） |
| 「x:n 外层 match + 嵌套 attributeQuery 返回全量子记录是静默多挂致命 bug」（查询探查 F-21-1，初判高置信） | 语义核实：match 过滤父记录、嵌套 attributeQuery 是 preload——与 §11.5.1 的嵌套 matchExpression 机制并存的标准两层语义（Prisma 等同构）。降级为文档澄清（已补） |
| 「`BoolExp.evaluate` 同步路径 truthiness 是可达的权限 fail-open」（builtins 探查 C-2） | 主路径核实：守卫链唯一消费方 `checkCondition` 已有 boolean 强制（r13），当前不可达。但按「修类不修实例」把契约提升到原语层 fail-closed（本轮 I-3），属加固而非可达 bug |
| 「ScopedSequence match 的深关联路径被静默按 null 求值」（本人探查衍生候选） | `assertSupportedMatchPath` 已在声明期把 match key 限制为 top-level 字段与 `x.id`，深路径不可达；「缺键=null」是 payload 求值的**刻意契约**（真值表测试固化）。`scopedSequenceMatchAttributeQuery` 的 `['*']` 分支是防御性死代码 |
| 「GlobalBoundState.increment 与 dict 镜像分叉是致命项」（runtime 探查 C-2） | 框架自身零读者（get 走 atomic、migration 按 Dictionary 名读输出），降级为第三节第 3 条记录项 |

---

## 五、既有遗留项复确（r2–r20 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1，`structureRawReturns` 复确）；update/create 返回值三态（r16-O-2/r17-R-4）；`Custom.asyncReturn` 2 参（r5-I-15）；StateMachine 单事件单跳 + 宿主自更新回声（r7-I-8）；`shouldTriggerUpdateComputation` 按 record diff 而非 event.keys（r3-I-7）；对称 n:n link API 不归一化端点（r4-I-17/r7-I-2，六轮复确，待产品决策）；checkCondition 先于 checkPayload（r19 #7）；LIKE 无转义（r19 #2）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减（r2-I-6）；级联删除无深度上限（r2-I-5）；offset-only 全量拉取（r12-I-4）；EXIST 命中路径仍入外层 JOIN 树（r12-I-5/r20 #3，本轮查询探查复确源头修法仍未做）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；lockRows 5 轮上限（r15-O-3）；Activity every 组 CAS 不自动重试（r16-O-7）；Activity any 组并发双头窗口（r20 #6）。
- **异步/install**：asyncReturn 信封写穿 / undefined 即 applied / commit 重试双 apply / install 双事务（r20 记录家族）。
- **时间调度**：`nextRecomputeTime` 全链无消费方（r3-R5）。
- **驱动**：MySQL 无事务（文档化）；contains 四驱动语义矩阵（r12-I-6）；driver 错误映射缺口（r19 #8）；布尔读归一化 '0'/'1'（r20 #11）。
- **迁移**：审阅完整性三缺口（r18）；`canonicalizeArgsForSignature` 对 Date/Set/Map/RegExp 坍缩（r19 #3）；rename 决策无执行器（r3-I-15）。
- **clone/replace 隔离**：Entity/Relation.clone 共享 constraints 数组与 Property 实例引用（r19 #5 + 本轮 core 探查补充）；RefContainer.replace* 不 clone、不重写 computation 引用（r18/r20）。
- **公开面**：Event/Gateway 死 API（r12-I-8）；`retrieveData` modifier 限制仅在有 limit 时生效（r19 #9）；ActivityInteractionRelation 声明但不写入（r19 #6）。

---

## 六、修复优先级与后续建议

本轮两个致命项 + 三个重要项已全部修复。后续轮次建议：

1. **filtered targetPath 的事件名改写 + 同批去重收口**（第三节第 1 条）——r19 #4 家族的终局修法：`resolveFilteredUpdateEvent` 对带 targetPath 的源同样改写事件名并复用成员资格守卫，聚合模板即可走增量而非恒退全量。正确性已由全量兜底，此项是性能收口。
2. **EXIST 跳过外层 JOIN 树**（r20 建议 1 复确）——post-pagination 误触的源头修法。
3. **install 期原子性收口**（第三节第 7 条 + r20 seeding 事务化 + asyncReturn 协议 fail-fast）——async/install 面的三个中等缺口一并处置。
4. **单一事实源清理**：GlobalBoundState 的 dict 镜像（第三节第 3 条）+ `_System_` 与 dict 双轨 KV（runtime 探查记录）——遗留双轨的独立收口轮次。
5. **createClass 统一声明期校验**（r16 建议 4，多轮复确）——本轮 I-2 又添两处手写守卫（PayloadItem 白名单、Payload 重名），积压项继续增长。

### 升级注意（behavior-tightening，供 CHANGELOG 参考）

- **新增编译期 fail-fast**：`between` 的 null/undefined 边界（此前静默匹配零行）——单边界区间改用 `['>=', min]` / `['<=', max]`。
- **新增声明期 fail-fast**：PayloadItem 的未知 `type` 字符串与无 base 的 `type: 'Entity'/'Relation'`（此前静默零校验）；Payload 的重名 items（此前静默双份声明）。
- **BoolExp 原语收紧**：`evaluate`/`evaluateAsync` 的 atom handler 返回非 boolean（非错误字符串）时按错误处理（fail-closed）——此前按 truthiness 求值，falsy 违规值在 `not()` 下会被取反成通过。依赖 truthiness 的 handler 需显式 `!!` 强转。
- **行为修正（无 API 变化）**：records dataDep 的 match 增量判定与 SQL 语义对齐——此前被错误 skip 的事件将开始触发计算（首次 setup 后的全量重算会纠正存量错值）；被错误 entered 的事件不再触发。combined addRelation 抢夺开始发出旧 owner 的视图 delete 事件；虚拟 link 名下的幻影 delete 事件不再发出。

---

## 附录：复现要点（验证用）

全部固化在 `tests/runtime/review-fixes-2026-07-12-r21.spec.ts`、`tests/storage/review-fixes-2026-07-12-r21.spec.ts` 与 `tests/core/boolexp.spec.ts`：

- F-1：computed 列 create 计入 / `['=', null]` 计入 / `['!=', x]` 缺席字段不计入（SQL 面对照断言）/ 关联路径 match × 自身字段 update 重算 / 明确匹配与不匹配的 skip-enter 对照。
- F-2：addRelation 抢夺后旧 owner UserWithProfile delete + 新 owner create + 被抢 Profile 的 VipProfile delete + 零虚拟 link 事件；create 抢夺对照组（r19 F-3 语义保持）。
- I-1：between null/undefined 边界拒绝（含指引）；字面量与引用边界照常工作。
- I-2：未知 type 拒绝（json/timestamp/大小写笔误）；Entity/Relation 无 base 拒绝；重名 items 拒绝；合法声明端到端放行。
- I-3：falsy/truthy 非 boolean 在两种极性下都不通过（sync+async）；boolean 结果全极性正常。
