# 全代码库深度 Review 报告(2026-07-12 第二十二轮)

- 日期:2026-07-12
- 基线:`main` @ `417dcc62`(v4.0.3,r1–r21 全部致命/重要修复已落地)
- 基线健康度:`npm run check` 通过;`npm test` 全量 **1955 passed / 26 skipped**
- 范围:五路并行深度探查(runtime 调度与计算句柄 / storage 写路径与 Setup / storage 查询编译 / core+builtins / MonoSystem+Controller+migration+drivers)+ 对全部致命候选**亲自编写最小复现实际运行定谳**(PGLiteDB / SQLiteDB / mock-driver 注入)
- 方法:与 r1–r21 全部报告逐条去重;每个候选先做代码路径二次追踪,再以运行时复现定谳(本轮 4 项高置信候选被代码追踪或复现证伪,见第四节)。「已复现确认」才列为致命/重要。
- 修复状态:**两个致命项 + 五个重要项已在本分支(`cursor/deep-code-review-r22-a039`)全部修复**,回归固化于 `tests/runtime/review-fixes-2026-07-12-r22.spec.ts`(11 用例)与 `tests/storage/review-fixes-2026-07-12-r22.spec.ts`(3 用例)。修复后 `npm run check` 通过,`npm test` 全量通过(含新增回归)。

---

## 一、结论摘要

r21 之后,match 本地求值、行内写路径、抢夺家族等高危面进一步收敛。本轮两个致命发现的公共形状是**「同一概念的第二个寄生位置」**——filtered entity 此前作为"被查询名/监听名/视图"三个位置都修过,但它作为 **relation 端点声明**的位置从未被当作轴;「事务重试」此前只在 dispatch 路径被审视,storage 直调路径的 attempt 间状态隔离从未成为断言面:

1. **filtered entity 端点 relation 的成员资格事件整族缺失**(F-1,影响面最大)——`Relation.create({ source: ActiveUser, ... })` 是 r8 起的一等公开形态(属性注册在 base + filtered 双名下,查询面双名可用)。但 `Setup` 把 `link.sourceRecord/targetRecord` 存成**声明名**(`ActiveUser`),而 `FilteredEntityManager` 的依赖表按**物理 base 名**(`User`)注册——`collectLinkMembershipChecks` 以端点声明名查依赖表得到空集,该关系的 addRelation/removeRelation/link 级联删除对「谓词依赖该关系属性的 filtered entity」**零成员资格事件**。查询面正确、事件面缺失,下游 Count/Every/StateMachine 对视图永久陈旧(实测:`UserWithPost` 视图查询面正确进出,事件面零 create/delete;base 端点对照组正常)。
2. **事务重试把已回滚 attempt 的事件留在调用方数组里**(F-2)——事务外的 `storage.create/update/delete(..., events)` 经 `withAtomicTransaction` 包装,`events.push` 发生在事务函数内部(COMMIT 之前)。attempt 成功执行到 push、却在 COMMIT 时失败并重试(PG SERIALIZABLE 的 first-committer-wins 冲突**正是在 COMMIT 时**报 40001;ECONNRESET 同理)时,调用方数组残留幻影事件——事件数与提交行数分裂,幻影事件携带**不存在的记录 id**(实测:mock driver 第一次 COMMIT 抛 40001,外部数组 2 个 create 事件、DB 1 行)。`Controller.dispatch` 每 attempt 用 fresh `effectsContext`(健康),storage 直调路径是同一重试机制的**未被枚举的第二个消费方**。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命(已复现,已修复) | 2 | filtered 端点 relation 成员资格事件缺失、事务重试幻影事件 |
| 重要(已复现/代码确认,已修复) | 5 | 系统事件实体被用户实体遮蔽、监听 type 白名单 + StateMachine 图完整性、delete 事件 match 旧态快照、行内 link 视图事件 defaults、SQLite open 幂等 |
| 重要(记录,本轮不修) | 若干 | 见第三节 |
| 证伪/降级 | 4 | 见第四节 |

---

## 二、致命问题(全部已复现确认并修复)

### F-1 filtered entity 端点 relation:成员资格事件整族缺失

- 位置:`src/storage/erstorage/FilteredEntityManager.ts` `collectLinkMembershipChecks`(L438-443,以 `link.sourceRecord/targetRecord` 直查依赖表)与 `initializeDependencies`/`analyzeDependencies`(依赖表按 `resolvedBaseRecordName` 注册);对照 `Setup.ts` L383/385(`sourceRecord: relation.source.name` 原样保存声明名)。
- 机理:同一条物理记录有多个名字——物理 base 名(`User`)与声明名(filtered 视图名 `ActiveUser`)。依赖表(`filtered entity 谓词依赖 → 受影响实体`)按物理名注册;link 元数据按声明名保存端点。`collectLinkMembershipChecks` 是唯一以「link 端点名」为入口查依赖表的读者——`dependencies.get('ActiveUser')` 恒为空,直接返回零 check。
- 复现(实测,PGLite):

```
User + ActiveUser = filtered(User, isActive=true) + Post
ActiveUserPost = Relation(source: ActiveUser, sourceProperty:'primaryPost', target: Post, n:1)
UserWithPost = filtered(User, primaryPost.id not null)

addRelationByNameById(ActiveUserPost, u, p) → 查询面 UserWithPost=[u1] ✓ 事件面零 create ❌
removeRelationByName(ActiveUserPost, ...)   → 查询面 []            ✓ 事件面零 delete ❌
对照:source 为 base User 的同构 relation    → create/delete 事件正常 ✓
```

- 影响:filtered entity 作为 relation 端点是文档与测试固化的一等形态(r8 修过属性注册);谓词依赖关系属性的 filtered entity 是最常见的视图声明。两者组合下「数据变更必有事件」契约整族失效,且查询面完全正常——典型的静默陈旧。
- 修复(名字空间收口):`FilteredEntityManager.resolveBaseRecordName` 成为「实体名 → 物理 base 名」的唯一归一化点,所有「实体名 → 依赖/视图」入口(`getAffectedFilteredEntities`、`collectMembershipChecks` 的入口名与 `depInfos` 过滤、`getFilteredEntitiesForBase`、`analyzeDependencies` 的注册键与 `dep.entityName`)一律先归一化。今后任何新读者以任何声明名进来都拿到正确依赖。
- 回归:filtered 端点 addRelation/removeRelation 的 create/delete 事件 + base 端点对照组(`review-fixes-2026-07-12-r22.spec.ts` F-1 组)。

### F-2 事务重试把已回滚 attempt 的事件留在调用方数组(幻影事件)

- 位置:`src/runtime/MonoSystem.ts` `callWithEvents`(原 L1200-1231):非事务分支 `withAtomicTransaction(... => this.callWithEvents(method, args, events, ...))` 把**同一个**调用方数组传进每次 attempt;`events.push(...methodEvents, ...newEvents)`(原 L1216)在事务函数内部执行。
- 机理:`runWithTransactionRetry` 对 retryable 错误(40001/40P01/57P01/ECONNRESET/EPIPE/SQLITE_BUSY)整体重跑事务函数。push 之后、COMMIT 完成之前的失败(SERIALIZABLE 写偏斜在 COMMIT 时检测是 PostgreSQL 的标准行为)→ DB 回滚,数组不回滚 → 重试再 push → 调用方看到「已回滚 attempt 的事件 + 成功 attempt 的事件」。幻影事件的 record.id 是回滚掉的 id,指向不存在的行。
- 复现(实测,PGLite + scheme 注入):

```
mock: 第一次 COMMIT 抛 {code:'40001'}(之后正常)
storage.create('Item', {name:'x'}, events)
→ DB 行数 1 ✓
→ events 含 2 个 create(其中一个 id 在库里不存在)❌
```

- 影响:(a)把 events 数组当事实源的消费方(手工二次派发、审计、测试断言)看到幻影;(b)ledger / post-write 队列按数组实例区分作用域,跨 attempt 复用同一数组还可能串批(r21 #2 记录的残留风险的另一面)。`Controller.dispatch` 每 attempt fresh `effectsContext`——直调路径与 dispatch 路径在「attempt 状态隔离」上分裂。
- 修复:非事务分支每次 attempt 用**全新数组**(ledger/post-write 队列作用域随之每 attempt 全新),提交成功后一次性 `events.push(...attemptEvents)` 搬运给调用方。
- 回归:COMMIT 失败重试后事件数=行数、事件 id=行 id(`review-fixes-2026-07-12-r22.spec.ts` F-2 组)。

---

## 三、重要问题

### 已修复(本轮)

- **I-1 用户实体遮蔽 eventSource 事件实体(静默丢字段)**:`Controller` 构造对「用户实体与 `es.entity` 同名」静默跳过注入——`_Interaction_`/`_Activity_` 被用户实体抢占后,dispatch 仍按系统字段(`interactionName`/`payload`/...)写入,但 schema 是用户列集,未声明字段被写路径**静默丢弃**(实测:`interactionName` 为 undefined)。监听 `record.interactionName` 的 StateMachine/Transform 全部失明。修复:同名不同实例 fail-fast(报错指出 `_` 前缀为系统保留)。回归 1 用例。
- **I-2 监听 type 白名单 + StateMachine 图完整性**:(a)`trigger.type`/`eventDep.type` 的 typo(`'updated'`/`'creat'`)此前静默注册永不命中的死监听——r18 的死监听不变量只验 `recordName`,type 是同一声明面的**第二根轴**。修复:`assertListenerReachable` 校验 `type ∈ {create,update,delete}`(汇合点,覆盖 StateMachine trigger / Transform eventDeps / addSourceMap 全部生产者)。(b)`StateMachine.create` 零图校验:同名 StateNode(TransitionFinder 按 name 索引,同名**静默合桶**,命中哪个取决于 transfers 顺序)、`initialState`/transfer 端点 ∉ `states`(声明与运行语义分裂)。修复:声明期 fail-fast(序列化管线的未解析 uuid 引用跳过,graph 管线解析后再验)。回归 6 用例。
- **I-3 delete 事件的 records match 旧态快照用错字段**:delete 事件没有 `oldRecord`,删除前完整快照在 `event.record` 上(DeletionExecutor 前置查询)。`buildMatchEventContext` 用 `oldRecord`(undefined)求旧态 → **每个 delete 都不可判定** → 强制 full recompute + `RequireSerializableRetry` 隔离升级——不匹配的 delete 本应 skip(r21 F-1 修复自身的漏网:skip 双向铺格只铺了 create/update,operation 轴的 delete 取值空白)。只声明增量路径(无 `compute()`)的 Custom 计算则直接 fail-loud。修复:delete 用 `event.record` 作旧态快照(delete 快照比 create 更完整,「缺席=NULL」契约同样成立)。回归 2 用例(不匹配 delete 零 full recompute + 匹配 delete 聚合正确)。
- **I-4 行内 link 视图 create 事件缺 default-only 字段**:视图 create 事件 payload 契约是 defaults + payload(r16 R-1),但行内 link 的三个产生点(preprocess 两处、flashOut 抢夺新 link)只有用户显式给 `&` 数据时才带 defaults(`linkRecordData?.defaultValues`,无 `&` 时 linkRecordData 不存在)——「谓词/匹配字段仅有默认值」形态下全部产生点漏字段(实测:`isPrimary` 仅有 defaultValue 时视图 create 事件 payload 无该键)。修复(汇合点):`enqueuePostWriteCreationCheck` 是行内视图 creation 检查的唯一入口,统一用 `NewRecordData` 的 defaults 规则补齐缺失键(单一事实源,不手写第二套 defaults 逻辑)。回归 1 用例。
- **I-5 SQLite `open`/`openForSchemaRead` 非幂等**:两方法无条件 `new SQLite(this.file)`——better-sqlite3 的每个 `new SQLite(':memory:')` 是**独立空库**。`setup(true)` 后走 manifest 校验/迁移路径(`setup(false)`、`generateMigrationDiff` → `openForSchemaRead` / `open(false)`)会把 `this.db` 换成全新空库:已建表、数据、manifest 全部"消失"(实测:`setup(false)` 后 `no such table`),文件库则泄漏连接句柄。PG(`if (this.pool)`)/MySQL(`if (this.db) return`)/PGLite(no-op)都有幂等守卫,SQLite 是四驱动中唯一漏网。修复:已打开(`this.db?.open`)时复用连接;forceDrop 语义不变。回归 1 用例。

### 记录,本轮不修(按影响排序,均有代码证据)

1. **`atomic.get` 对 `booleanValue` 列不做 0/1 归一化**(`MonoSystem.parseGlobalValue` L793-798):`structureRawReturns` 把 SQLite 的 0/1 归一化为 boolean,atomic 读路径原样返回——`GlobalBoundState<boolean>.get()` 在 SQLite 下返回 0/1。框架内部零直接消费(Count/Every/Any 的 `isItemMatch` 走 `RecordBoundState.get` → `findOne` 归一化路径),属公开 API 面的跨路径类型分裂。建议与 `QueryExecutor` 的布尔归一化对齐。
2. **`canonicalizeArgsForSignature` 对显式 `undefined` 键值**(`migration.ts` L828+):`JSON.stringify(undefined)` 产生非法 JSON 片段进入签名串——「键缺席」与「键=undefined」可能产生不同签名(假阳性)。r19 #3(Date/Set/Map/RegExp 坍缩)家族的相邻格。建议规范化时剔除 undefined 值键。
3. **ScopedSequence `scopeKey` 对 scope 项声明顺序敏感**(`scopedSequenceScope.ts` `normalizeSequenceScope` 不排序):调换 scope 数组顺序的重构会开出**新的序列槽位**(从 initialValue 重新发号)。建议按 name 排序后 stringify(需迁移路径配合,属行为变更)。
4. **重试边界 × listener 副作用重放**(`callWithEvents` 每 attempt 完整跑 `dispatch(listeners)`):F-2 修复了事件面(调用方数组),listener 内的**非幂等外部副作用**(HTTP、文件)在重试下仍会执行 N 次(DB 只提交一次)。与 r20 S2(guard/afterDispatch 重放)同族。属文档面:listener 不应执行非幂等外部副作用,或自行按事务 id 去重。
5. **对称关系多跳 targetPath 的对称段处理**(`Scheduler.ts` L648-666 自带 TODO):关系 delete 的对称分支用 `targetPath.slice(0,-1)` 反查宿主,中段夹对称关系时可能定位不全。未构造出红例,记录待查(与 r17 F-3 修的单跳共享 item state 不同段)。
6. **`getReversePath` 含 `&` 路径的 FIXME**(r21 #9 复确):本轮查询探查再次命中,仍未构造出错误复现,维持记录。
7. **post-pagination 在排序 tie 组上的稳定性**(`QueryExecutor` L206-243):多行同排序键时 dedupe 保留首现,页边界在 tie 组内依赖 JOIN 物理顺序。标准 SQL 语义(稳定分页需要唯一 tiebreaker),建议文档化「orderBy 建议携带 id 兜底」。
8. **`EntityToTableMap` 无 `aliasManager` 时超长别名依赖 PG 63 字节截断**(L285-286):正常 Setup 路径带 manager;手动构造 `new EntityToTableMap(map)`(部分测试/工具代码形态)+ 深路径在 PG 系有截断碰撞风险。建议构造函数缺省内建 manager 或文档警告。
9. **migration resume 判据只信 phase 不交叉校验 manifest**(`Controller.ts` L485-548):正常崩溃路径下 phase 与 manifest 同事务原子,安全;手工篡改 migration log 或驱动事务缺陷下 resume 会跳过整段重算。对抗性场景,记录。
10. **INTEGER 自增 id 超过 2^53 的 JS 精度**(SQLite `_IDS_`/PG sequence 无上限守卫):极长寿命部署的理论风险,记录。
11. **base create 事件不含异表关联(reliance 后建立的关系)**:`preprocessSameRowData` 在 reliance 之前 push base create(defaults+同行字段)。link create 事件单独存在,`handleRecordCreation` 的视图事件用 fullRecord——按「嵌套关联」做 create 事件模式匹配的下游需知晓该契约。建议文档化(事件 payload 契约 = defaults + 同行字段,关联语义看 link 事件)。
12. **矩阵格建议**:merged link 替换格(`newRecordIsLink` × 被替换旧 merged link)的视图事件断言、`relocate`(mergeLinks)后首次满足谓词的视图 create,登记册「视图 × 写形态」行的两个待铺格。

---

## 四、证伪/降级的候选(本轮探查结论被推翻或核实为既有设计的)

| 候选 | 结论 |
|------|------|
| 「UPDATE 前置查询裁剪 oldRecord × 顶层 plain match 字段 → 错误 skip → 聚合永久陈旧」(runtime 探查候选 1,初判高置信致命) | 代码追踪证伪:`UpdateExecutor` 的 `trimmedAttributeQuery` 只裁剪**关系属性**(`[name, {...}]` 形态项),值属性(string 项)全部保留——update 事件的 oldRecord 对普通值属性完整,r21 F-1 的快照完备性契约成立。复现测试(只更新聚合字段)确认 skip/增量语义正确 |
| 「eventDep.oldRecord 按裁剪快照匹配 → Transform 静默不触发」(runtime 探查候选 3) | 同上证伪:oldRecord 值属性完整,`oldRecord: {status:'draft'}` 模式在只改 title 的 update 上正常命中 |
| 「delete 事件 recordName 用 API 入参(filtered 名)→ 监听 base 名的 delete 失明」(storage-write 探查候选 2) | 代码追踪证伪:`deleteRecordSameRowDataGrouped` 收到的是 `deleteQuery.recordName`,`RecordQuery.create` 构造时已把 recordName 解析为 `resolvedBaseRecordName`——delete 事件恒以 base 名发出 |
| 「timestamp 属性 match 参数类型不一致 → 静默零行」(storage-query 探查候选 1,初判中高) | 语义核实降级:写入与查询使用一致的值形态是驱动层的既有契约(与 number/string 列同构),框架不做隐式类型转换(explicit control)。属文档面,不立项 |

---

## 五、既有遗留项复确(r2–r21 已记录,本轮探查再次命中,不重复展开)

- **语义/契约**:SQL NULL 键缺失(r4-I-1);update/create 返回值三态(r16-O-2);`Custom.asyncReturn` 2 参(r5-I-15);StateMachine 单事件单跳 + 宿主自更新回声(r7-I-8);对称 n:n link API 不归一化端点(r4-I-17,七轮复确,待产品决策);checkCondition 先于 checkPayload(r19 #7);LIKE 无转义(r19 #2)。
- **性能/资源**:filtered targetPath property 级监听恒退全量(r19 #4/r21 #1,终局修法仍未做);EXIST 命中路径仍入外层 JOIN 树(r12-I-5/r20 #3);global dict 变更宿主全表扫描;async task 表只增不减;级联删除无深度上限;offset-only 全量拉取。
- **并发**:`setDictionaryValue` find-then-write(r12-I-1);lockRows 5 轮上限(r15-O-3);Activity every 组 CAS 不自动重试(r16-O-7);any 组并发双头窗口(r20 #6)。
- **异步/install**:asyncReturn 信封写穿 / undefined 即 applied / commit 重试双 apply / install 双事务 / 半初始化窗口(r20/r21 记录家族)。
- **单一事实源**:GlobalBoundState 的 dict 镜像(r21 #3);`_System_` 与 dict 双轨 KV;`storage.atomic` 业务列零事件(r21 #4)。
- **事件驱动契约**:event-based 计算不经 skip/信封协议(r21 #5);MonoStorage.dispatch listener 不链式(r21 #6)。
- **迁移**:审阅完整性三缺口(r18);rename 决策无执行器(r3-I-15);`canonicalizeArgsForSignature` Date/Set/Map/RegExp 坍缩(r19 #3,本轮 undefined 键补充为第三节 #2)。
- **clone/replace 隔离**:Entity/Relation.clone 共享 constraints 数组与 Property 实例(r19 #5);RefContainer.replace* 不 clone(r18/r20)。
- **驱动**:MySQL 无事务(文档化);contains 四驱动语义矩阵(r12-I-6);driver 错误映射缺口(r19 #8);dict 编解码无 Date codec(r21 #8)。
- **公开面**:Event/Gateway 死 API(r12-I-8);`retrieveData` modifier 限制仅在有 limit 时生效(r19 #9);ActivityInteractionRelation 声明但不写入(r19 #6);createClass 统一声明期校验积压(r16 建议 4——本轮 I-2b 又添 StateMachine 一处手写守卫)。

---

## 六、修复优先级与后续建议

本轮两个致命项 + 五个重要项已全部修复。后续轮次建议:

1. **filtered targetPath 的事件名改写 + 同批去重收口**(r21 建议 1 复确)——property 级聚合在 filtered relation 上恒退全量的性能收口,正确性已由全量兜底。
2. **atomic 读路径布尔归一化**(第三节 #1)——与 `QueryExecutor` 对齐,单点修复面。
3. **EXIST 跳过外层 JOIN 树**(r20 建议 2 三轮复确)。
4. **install 期原子性收口**(r21 建议 3 复确)。
5. **createClass 统一声明期校验**(r16 建议 4,五轮复确)——本轮 I-2b 的 StateMachine 图校验又是一处手写守卫,积压持续增长。

### 升级注意(behavior-tightening,供 CHANGELOG 参考)

- **新增声明期/构造期 fail-fast**:用户实体与 eventSource 事件实体同名(此前静默遮蔽、事件字段静默丢失);StateMachine 的同名 StateNode / initialState 或 transfer 端点不在 states 数组(此前静默接受、运行期歧义);监听 type 非 create/update/delete(此前静默死监听)。
- **行为修正(无 API 变化)**:filtered entity 端点 relation 的成员资格事件开始正常发出(此前缺失;首次 setup 后的全量重算会纠正存量陈旧值);事务重试后调用方 events 数组只含提交成功 attempt 的事件(此前含幻影);行内 link 视图 create 事件 payload 补齐 default-only 字段;delete 事件对 records match 的判定从「恒全量重算」改为「与 SQL 一致的 skip/left」(不匹配的 delete 不再触发 SERIALIZABLE 升级重试)。
- **SQLite 连接语义**:`open()`/`openForSchemaRead()` 幂等复用已打开连接——`:memory:` 库上 `setup(true)` 后的 manifest 校验/迁移路径不再丢库;依赖「每次 open 都是新库」的用法(不存在于框架内)需显式 close 后重开。

---

## 附录:复现要点(验证用)

全部固化在 `tests/runtime/review-fixes-2026-07-12-r22.spec.ts` 与 `tests/storage/review-fixes-2026-07-12-r22.spec.ts`:

- F-1:filtered 端点 relation 的 addRelation → UserWithPost create 事件 + removeRelation → delete 事件;base 端点对照组语义不变。
- F-2:第一次 COMMIT 注入 40001 → 重试成功后外部数组恰 1 个 create 且 id 与 DB 行一致。
- I-1:`_Interaction_` 用户实体在 Controller 构造期被拒绝。
- I-2:trigger.type `'updated'` / eventDep.type `'creat'` 在 setup 期被拒绝(报错含合法值清单);同名 StateNode / initialState∉states / transfer 端点∉states 在声明期被拒绝;合法图放行。
- I-3:不匹配 delete 零 full recompute(计数器断言);匹配 delete 聚合值正确(7+3 → 删 7 → 3)。
- I-4:combined 抢夺(flashOut 新 link)的 PrimaryUserProfile create 事件携带 default-only 的 isPrimary。
- I-5:SQLite `:memory:` 上 setup(true) → 写入 → setup(false) → 数据仍可查。
