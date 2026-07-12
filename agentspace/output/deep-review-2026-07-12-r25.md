# 全代码库深度 Review 报告(2026-07-12 第二十五轮)

- 日期:2026-07-12
- 基线:`main` @ `97b63281`(v4.0.5,r1–r24 全部致命/重要修复已落地)
- 基线健康度:`npm run check` 通过;`npm test` 全量 **1984 passed / 30 skipped**;全部 `postgresql*` 套件 @ 真实 PostgreSQL 16 **30 passed**
- 范围:五路并行深度探查(runtime 调度与计算句柄 / storage 写路径与 Setup / storage 查询编译 / core+builtins / MonoSystem+Controller+migration+drivers)+ 对全部致命候选**亲自编写最小复现实际运行定谳**(PGLite / SQLite / 真实 PostgreSQL 16 / 真实 MySQL 8)
- 方法:与 r1–r24 全部报告逐条去重;每个候选先做代码路径二次追踪,再以运行时复现定谳(本轮两项高置信探查候选被复现证伪,见第四节)。本轮环境同时具备真实 PostgreSQL 16 与真实 MySQL 8——首次把 MySQL 驱动的连接管理面跑在真实服务器上
- 修复状态:**两个致命项 + 四个重要项已在本分支(`cursor/deep-code-review-r25-ea42`)全部修复**,另有预言机升级首跑抓出的一个端点子格附带修复。回归固化于 `tests/storage/review-fixes-2026-07-12-r25.spec.ts`(7 用例)、`tests/runtime/review-fixes-2026-07-12-r25.spec.ts`(14 用例)、`tests/runtime/postgresqlJsonMatch.spec.ts`(2 用例,env-gated)、`tests/runtime/mysqlOpenIdempotency.spec.ts`(1 用例,env-gated)
- 修复后:`npm run check` 通过;`npm test` 全量 **2005 passed / 33 skipped**;全部 `postgresql*` 套件(含新增)@ 真实 PG 16 **32 passed**;MySQL 幂等套件 @ 真实 MySQL 8 **1 passed**

---

## 一、结论摘要

本轮两个致命发现的公共形状仍是 r22–r24 复盘反复命名的**「同一契约的第二个消费方」**——且这次两个洞都紧贴着**此前修复自己的边界**:

1. **行内 base create 事件缺 default-only 字段 → 增量静默少计 / StateMachine trigger 永不触发**(F-1,影响面最大)——create 事件 payload 契约(defaults + payload,r16 R-1)在每个产生点有**两条消费轨**:base 名事件与 filtered 视图事件。r22 I-4 发现了完全相同的缺陷(三个行内产生点漏 default-only 字段),但只把 defaults 补齐做在了**视图轨**(`enqueuePostWriteCreationCheck`);同一批产生点的 **base 名事件**原样裸 push。下游受害者恰是 r21 F-1 亲手建立的快照完备性契约:records match 的本地求值把「缺席的普通值属性」按 NULL 解读——`match {isPrimary:['=',true]}` 对 default-only 的 `isPrimary` 判 skip,聚合恒 0(实测);StateMachine trigger / Transform eventDeps 的深度匹配对同字段直接失明,transfer 永不触发(实测)。n:1/1:1 的行内 link 是这些 relType 的**默认物理拓扑**,「谓词字段仅有默认值」是最自然的声明——组合下「增量==全量」契约静默破坏。
2. **filtered relation × EXIST:link 谓词未入子查询 → 幻影多行**(F-2)——filtered relation 的谓词有三个查询消费位置:attributeQuery 子查询(r8 起就把谓词并进子查询 match,正确)、普通路径 match(rebased 谓词与路径原子共享外层 JOIN 别名,"同一条边"由别名合并保证,正确)、**EXIST(漏网)**。`convertFilteredRelation` 把谓词一律 AND 在外层,而 EXIST 子查询按反向端点 id 独立关联——两个原子可以被**不同的边**分别满足:`u1 --inactive--> B`、`u1 --active--> A` 时,`activePosts: ['exist', {title:'B'}]` 错误返回 u1(实测;SQL 面 filtered 边中根本没有指向 B 的)。静默多行比少行更隐蔽。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命(已复现,已修复) | 2 | 行内 base create 事件缺 defaults(下游静默少计/不触发)、filtered relation × EXIST 幻影多行 |
| 重要(已复现,已修复) | 4 | type:'json' 匹配 PG/MySQL 方言分裂、MySQL open() 连接泄漏、record-target atomic 写路径 json、merged 声明守卫接线 |
| 附带修复 | 2 | combined 嵌套新建 link 事件端点缺 id(预言机升级首跑抓出);事件完备性预言机新增 create payload 完备性规则 |
| 证伪 | 2 | 见第四节 |
| 记录,本轮不修 | 若干 | 见第三节 |

---

## 二、致命问题(全部已复现确认并修复)

### F-1 行内(merged/combined)base create 事件缺 default-only 字段:下游增量静默少计、trigger 永不触发

- 位置:`src/storage/erstorage/CreationExecutor.ts` `preprocessSameRowData` 的两个产生点(combined 记录 create 事件、merged/combined link create 事件)与 `src/storage/erstorage/RecordQueryAgent.ts` `flashOutCombinedRecordsAndMergedLinks` 的抢夺新 link create 事件;受害消费方:`Scheduler.buildMatchEventContext` 的本地 match 求值(r21 F-1)、`ComputationSourceMap.shouldTriggerEventBasedComputation` / `TransitionFinder` 的深度匹配。
- 机理:create 事件 payload 契约 = defaults + payload(r16 R-1)。宿主记录与 isolated 路径经 `createRecord` 主路径带 defaults;行内产生点手工拼 payload——用户不给 `&` 时 `linkRecordData` 不存在,payload 只有端点与显式数据。r22 I-4 修复了同一批产生点的**视图事件**(经 `enqueuePostWriteCreationCheck` 统一补齐 defaults),base 名事件是同一契约在同一产生点的**第二条消费轨**,漏网。r21 F-1 的本地求值建立在「缺席的普通值属性 ⟺ 库里 NULL」之上——契约被上游违反后,本地判定与 SQL 判定分裂:`['=', true]` 对缺席键判 false→skip(少计),深度匹配判不命中(trigger 死)。
- 复现(实测,PGLite,两个下游轨道全红):

```
User–Team n:1(link 属性 isPrimary/weight 仅有 defaultValue)
create('User', { name:'u1', team: { id } })   // 行内建边,不带 &

records dataDep match {isPrimary:['=',true]}:
  SQL 面:isPrimary=true 的 link 1 条 ✓
  增量面:总和恒 0 ❌(事件缺 isPrimary → 本地判 skip)
StateMachine trigger { recordName:link, type:'create', record:{isPrimary:true} }:
  linkStatus 恒 'idle' ❌(deepMatch 失败,transfer 永不触发)
```

- 影响:n:1 / 1:1 关系的行内 link 是**默认物理拓扑**;「谓词/匹配字段仅有默认值」是最常见的声明形态(isPrimary/isActive/status 类字段)。三个产生点(preprocess 两处 + flashOut 抢夺)全漏。增量与全量答案分裂且不自愈(skip 不触发任何计算)。
- 修复(汇合点收口):`NewRecordData.completeEventPayloadWithDefaults` 成为 create 事件 payload 补齐的**唯一实现**,base 名事件(三个产生点)与视图事件(`enqueuePostWriteCreationCheck`,r22 I-4 原实现迁移至此)全部经过它。行为说明:combined create 事件 payload 随之成为 push 时刻的不可变快照——link id(`&`)此前经共享引用的后置突变泄漏进事件,现在不再出现(关联语义看紧随其后的 link create 事件,与 r22 §三 #11 的契约方向一致)。
- 回归:`review-fixes-2026-07-12-r25.spec.ts` storage 面 4 用例(merged / combined / flashOut 三产生点 + 宿主与 isolated 对照)、runtime 面 2 用例(records match 少计、StateMachine trigger 失明)。
- 机制化:事件完备性预言机(`eventCompleteness.ts`)新增**第 5 条规则**——每个 created 行的全部非 NULL 普通值字段必须出现在 create 事件 payload 且值一致(computed/computation 属性显式豁免)。该规则首跑立即抓出同族端点子格(见第三节附带修复)。

### F-2 filtered relation × EXIST:link 谓词未折叠进子查询 → 幻影多行

- 位置:`src/storage/erstorage/MatchExp.ts` `convertFilteredRelation`(谓词一律外层 AND);EXIST 子查询构造在 `SQLBuilder.parseFunctionMatchAtom`(按反向端点 id 独立关联)。
- 机理:谓词的三个查询消费位置中,普通路径 match 的正确性依赖「rebased 谓词原子与路径原子共享同一条 JOIN 路径→合并到同一别名→约束同一条边」。EXIST 位置没有这条共享:子查询独立关联,外层 rebased 谓词落在另一次遍历的边上——SQL 行级语义下,「存在任意指向 B 的边(可 inactive)」AND「存在任意 active 边(可指向 A)」同时为真 → 幻影命中。
- 复现(实测,PGLite):

```
UserPost n:n + ActiveUserPost = filtered(isActive=true)
u1 --active--> A;u1 --inactive--> B

find('User', { activePosts: ['exist', { title:['=','B'] }] })
→ 修复前:[u1] ❌(SQL 面 filtered 边中没有指向 B 的)
→ 修复后:[] ✓;['exist',{title:'A'}] 照常命中 ✓;base 关系 EXIST 语义不变 ✓
路径 match 对照(activePosts.title = 'B')修复前后都正确(共享别名机制)✓
```

- 影响:经实体属性对 filtered relation 做存在性过滤的一切查询——静默**多**返回行(权限过滤、可见性收窄场景下比少行更危险)。
- 修复:终段是 filtered relation 属性且操作符为 EXIST 时,谓词 rebase 到**对端实体**(`linkMatchExp.rebase(farSide)`,产出 `reverseAttr.&.xxx` 形态)后 AND 进 EXIST 内层 match——内层关联原子(`reverseAttr.id`)与谓词原子走同一条反向路径、合并到同一子查询别名,"同一条边"语义成立。中段 filtered 属性维持外层 AND(EXIST 的关联引用 `parentPath.id` 与 rebased 谓词共享外层同一 JOIN 别名,语义本就正确)。内层 match 的三种书写形态(BoolExp / ExpressionData / 裸 MatchAtom)统一归一化,与 `collectExistReferencePaths` 同一集合。
- 回归:幻影行拒绝 + active 边命中 + base 对照 + 路径 match 对照 + 内层条件 AND 语义(3 用例)。

---

## 三、重要问题

### 已修复(本轮)

- **I-1 `type:'json'` 匹配在 PG/MySQL 方言入口大小写分裂**:r23 把 `'json'` 纳入 Property.type 白名单,但三个驱动的 `parseMatchExpression` 以 `fieldType === 'JSON'`(大小写敏感)判定方言入口,而 `mapToDBFieldType` 对 `type:'json'` 走 `else { return type }` 产出小写 `'json'`(object/collection 产出大写 `'JSON'`)——**方言不识别自己产出的 fieldType**。实测真实 PG 16:`['=', {...}]` 回退文本比较后裸报 `operator does not exist: json = unknown`;同一声明在 PGLite(toLowerCase 判定)上正常——「PostgreSQL 语义替身」在方言入口字符串面再次不成立(r24 F-1 的驱动差异轴新格)。修复:PG/MySQL/SQLite 方言入口一律按小写归一(与 PGLite/MatchExp 同构);不改 `mapToDBFieldType` 产出(fieldType 字符串参与迁移 manifest 的 modelHash,改动会触发存量部署 re-baseline)。回归:`postgresqlJsonMatch.spec.ts`(env-gated,旧驱动红测确认)+ 嵌入式驱动对照 2 用例。
- **I-2 MySQL `open()` 非幂等:工作连接泄漏**:`Controller.setup(false)` 固定序列 prepareMigrationSchema(`openForSchemaRead`)→ system.setup(`open(false)`)。PG(`if (!this.pool)`)、SQLite(r22 I-5)、PGLite(no-op)都有幂等守卫;MySQL 每次 `open()` 无条件 `createConnection` 且不 `end()` 旧连接——四驱动连接管理不变量的最后一格。实测真实 MySQL 8:修复前 openForSchemaRead→open→open→open(true) 序列悬挂 4 条连接,修复后恒 1 条;复用 schema-read 连接时补跑幂等的 `_IDS_` setup(openForSchemaRead 刻意跳过它)。回归:`mysqlOpenIdempotency.spec.ts`(env-gated on `INTERAQT_MYSQL_DATABASE`,与 postgresql* 套件同一 gate 约定)。
- **I-3 record-target atomic 写路径对 json 字段不归一化**(r24 I-1 读路径归一化的对称面):`replace` 把 JS 对象裸传 `db.query`——better-sqlite3 无法绑定对象直接崩溃(实测 "Too few parameter values were provided"),且绕过写路径的规范序列化契约(`prepareFieldValue`);`compareAndSet` 的单语句 `COALESCE(col,?)=?` 在 PG 系 json 类型上没有等值操作符(实测 PGLite 报 "operator does not exist")。修复:写参经 `normalizeRecordFieldParam`(canonicalJSONStringify,与 storage 写路径共用同一实现,经 `@storage` 新增导出);json 的 CAS 改走「锁定读 → 规范形比较 → 条件写」事务路径(与 replace 同一事务原语,键序不敏感);非 json 保持单语句快路径。回归 6 用例(SQLite/PGLite × replace/CAS-json/CAS-boolean)。
- **I-4 merged 声明守卫接线 + commonProperties 绕过名称守卫**:`static.public` 里的 `mergedEntityNoProperties` / `mergedRelationNoProperties` 约束自 merged 声明面引入起**从未被 create() 执行**——merged entity/relation 直接声明 properties 被静默接受并合并进物理表(任何 input 视图都写不到的半孤儿列,与文档契约矛盾);`commonProperties` 绕过 `validatePropertyNamesOnCreate`(保留名 id/_rowId/source/target、重名),且孤立声明(无 inputEntities/inputRelations)被静默忽略。修复:全部声明期 fail-fast;守卫只放 create——clone/图手术走直构,框架在 merged 编译与 bound-state 注入后合法地在克隆上携带合成属性。回归 4 用例。

### 附带修复(预言机升级首跑抓出)

- **combined 嵌套新建的 link create 事件端点缺 id**:combined 记录的 id 在 preprocess 步骤 1 分配给**替换后的容器**(`newRawDataWithNewIds[attr] = {...old, id}`),而 link 事件端点此前取 `record.getData()`(替换前的原始 rawData)——`event.record.<endpoint>.id === undefined`,按端点定位的下游(`computeTarget(event.record.target.id)`)拿到空。事件完备性预言机新增的 payload 完备性规则首跑即抓出(writePathTopologyMatrix 的 combined 格)。修复:端点读取替换后的容器。这正是预言机作为机制的价值证明——规则落地当天就发现了人工 review 漏掉的兄弟格。

### 记录,本轮不修(按影响排序,均有代码证据;含 r23/r24 清单仍成立项 + 本轮新见)

1. **Activity `checkActivityState` 先于 `runInteractionGuard`,未授权方可从 `ActivityStateError.currentState` 读取完整工作流状态树**(builtins 探查,本轮新见):r14 I-10 刻意添加 currentState 以支持可观测性,但它在 Condition 之前返回——持有 activityId 的调用方无需通过权限即可探测状态。属产品级决策(裁剪 error payload 或将 state 检查挪到 guard 之后都是行为变更),建议下轮决策。
2. **迁移 operation log 的 operationKey 含 DDL 列表下标**(MonoSystem 探查,本轮新见):resume 前计划变更(重排/插项)会让「同 index 不同 SQL」被误标已完成——「resume 只信 phase」既有记录项的执行器层具体机制,并入同一家族。
3. **Transform unique index 名 `hashIdentifier` 为 32-bit 弱哈希**(本轮新见):不同 (table, field...) 组合理论上可碰撞→复用/冲突索引。换 sha1 截断会改索引名、触发存量部署索引重建,需迁移配套,不宜顺手改。
4. **`readMigrationManifest` 对损坏 JSON 裸抛语法错误**(本轮新见):手工改库/半写场景,建议包一层带指引的受控错误。
5. **timestamp 读路径无跨驱动归一化**(查询探查,本轮新见):boolean/json 已在 r24/r25 归一,timestamp 是同族漏格(SQLite 返回 number,PG 返回 Date)——改读值类型是行为变更,需要 CHANGELOG 与迁移说明配套,记录待决策。
6. **`dedupeIdenticalRows` 在「x:n match 扇出 × attributeQuery 选中随扇出变化的 x:1 列」组合下的少去重风险**(查询探查,本轮新见,未构造出红例):与 r22#7 tie 稳定性相邻但机制不同,记录待查。
7. **深嵌 EXIST × 多 self-join 的别名碰撞风险**(查询探查,本轮新见,未构造出红例):`getReferenceFieldValue` 无子查询前缀,记录待查。
8. **计算声明类(Count/Every/Transform...)的 create() 不校验 static.public 的 required 字段**(builtins 探查):`Count.create({})` 声明期通过、setup 深处才炸——createClass 统一声明期校验(r16 建议 4,八轮复确)的又一实例。
9. **filtered targetPath property 级全量重算风暴**(r19#4/r21#1/r23#3/r24 复确):性能项,维持记录。
10. 其余 r23 §三/§五、r24 §五 清单项(StateMachine.clone 共享图、BoolExpressionData operator 白名单、对称关系多跳 targetPath、post-pagination tie 稳定性、canonicalizeArgsForSignature 的 Date/Set/Map/RegExp codec、listener 重试副作用、ScopedSequence scopeKey 顺序敏感等)——本轮探查再次命中、无新增证据,不重复展开。

---

## 四、证伪的候选(本轮探查结论被复现推翻的)

| 候选 | 结论 |
|------|------|
| 「merged 拓扑宿主 update 用嵌套新建替换关联时跳过 unlink → 旧 link delete 事件缺失」(写路径探查 #1,初判中高置信) | 复现证伪:`updateRecord` 先经 `createRecordDependency` 把嵌套新建转成 id ref,`updateSameRowData` 的 unlink 循环按 ref 正常覆盖——实测旧 link delete + 新 link create 事件完整、物理面单行 |
| 「filtered relation 的 link 元数据未继承 base 的 mergedTo → 经 filtered sourceProperty 写入分类为 isolated → 独立 link 行/事件错形」(写路径探查 #2,初判中置信) | 复现证伪:分类确实落 isolated 桶,但 isolated 路径对 link record 的 `createRecord` 经 NewRecordData 解析回 base link 名,端点虚拟 link 携带正确 mergedTo → 走 flashOut 行合并机制,物理面单行、base link 事件正常——净效果与 addRelation 等价 |

---

## 五、既有遗留项复确 + 本轮补充教训

r23 §三/§五、r24 §五 的清单项本轮全部维持(上文第三节已列出交集);r24 建议 #1(CI 补 PG service container)本轮落地(见第六节)。

### 本轮补充教训(escape analysis 一句话,详见 `r25-test-blindness-retrospective.md`)

**「契约的修复不等于契约的执行」**:r21 F-1 把「create 事件 = defaults + payload」从注释提升为本地求值的承重假设,r22 I-4 在同一批产生点修了这个契约的视图轨——两轮都离真相一步之遥,却没有人**枚举同一契约在同一产生点的全部消费轨**,也没有把契约本身变成机器检查。本轮的机制回应:契约进预言机(事件完备性第 5 条规则),规则落地首跑即抓出人工 review 漏掉的端点子格——**能被机器检查的契约才是契约,写在注释里的契约只是愿望**。完整复盘(覆盖全部六个问题的四类结构性失明:未被执行的契约 / 替身弱于本体 / 夹具偏置 / 特性引入期无交叉扫描,及 r22 家族 sweep 给 MySQL 发假合格证的解剖)见 `r25-test-blindness-retrospective.md`;复盘落地的机制还包括驱动方言自洽契约测试(`tests/storage/driverDialectConsistency.spec.ts`,旧驱动红测确认恰在 I-1 缺陷处失败)。

---

## 六、修复优先级与后续建议

本轮两个致命项 + 四个重要项 + 两个附带项已全部修复。后续轮次建议:

1. **CI 全 PG 套件已落地**(r24 建议 #1):workflow 从「concurrency + scoped-sequence 两个」扩到 `npm run test:postgres`(全部七个真实 PG 套件,~17s);MySQL 幂等套件以 `INTERAQT_MYSQL_DATABASE` gate 落地——建议 CI 后续补 MySQL service container 让它也常驻运行。
2. **Activity state 泄漏的产品决策**(第三节 #1)——权限面项,建议优先。
3. **timestamp 读归一化决策**(第三节 #5)——r24/r25 归一化家族的最后一格,需 CHANGELOG 配套。
4. **createClass 统一声明期校验**(r16 建议 4,八轮复确)——本轮 I-4 又添两处手写守卫,积压持续增长。
5. **filtered targetPath 事件名改写 + 同批去重**(多轮复确)——性能收口。

### 升级注意(behavior-tightening,供 CHANGELOG 参考)

- **行为修正(无 API 变化)**:行内(merged/combined)记录与 link 的 base create 事件 payload 补齐 default-only 字段(此前缺失;依赖这些字段的增量计算与 trigger 将开始正常工作,首次 setup 后全量重算纠正存量错值);combined create 事件 payload 成为 push 时刻的不可变快照——link id(`&` 键)不再经后置突变泄漏进事件;combined 嵌套新建的 link create 事件端点携带 id(此前 undefined);filtered relation 上的 EXIST 匹配开始只考虑满足谓词的边(此前多返回行)。
- **`type:'json'` 属性的 =/!=/in 匹配在 PostgreSQL/MySQL 上开始可用**(此前 PG 裸报 "operator does not exist");语义与 PGLite 一致(jsonb 语义相等,键序不敏感)。
- **`atomic.replace`/`compareAndSet` 对 record-target json 字段开始可用**:写入规范序列化文本(与 storage 写路径一致);json CAS 改事务路径(单连接驱动无感知;PG 系持锁窗口极短)。
- **新增声明期 fail-fast**:merged entity/relation 直接声明 `properties`(此前静默合并为半孤儿列);`commonProperties` 无 inputEntities/inputRelations(此前静默忽略);`commonProperties` 含保留名/重名(此前绕过守卫)。
- **MySQL `open()` 幂等复用连接**(此前每次泄漏一条);依赖「每次 open 都是新连接」的用法(不存在于框架内)需显式 close 后重开。

---

## 附录:复现要点(验证用)

本轮回归固化于四个文件:

- `tests/storage/review-fixes-2026-07-12-r25.spec.ts`(7 用例):
  - F-1 组(4):merged 行内 link / combined 嵌套记录+link / flashOut 抢夺新 link 的 base create 事件携带 default-only 字段(含数据面对照);宿主与 isolated link 对照组不回退;combined link 事件端点携带 id(附带修复)。
  - F-2 组(3):inactive 边不满足 filtered EXIST(修复前幻影返回 u1)+ active 边照常命中 + base EXIST 不变;路径 match 对照组;内层条件与折叠谓词的 AND 语义。
- `tests/runtime/review-fixes-2026-07-12-r25.spec.ts`(14 用例):
  - F-1 下游组(2):records dataDep match 对 default-only link 属性的行内 create 计入(修复前恒 0,SQL 面对照断言);StateMachine trigger 对同形态触发(修复前恒 idle)。
  - I-3 组(6):SQLite/PGLite × replace-json 往返 / CAS-json 规范形比较(键序不敏感、不匹配拒绝)/ CAS-boolean 快路径不回退。
  - I-4 组(4):merged entity/relation 声明 properties 拒绝;commonProperties 孤立声明拒绝;保留名/重名拒绝;合法 commonProperties 放行。
  - I-1 嵌入式对照组(2):SQLite/PGLite 的 json =/!= 匹配(键序不敏感)。
- `tests/runtime/postgresqlJsonMatch.spec.ts`(2 用例,需 `INTERAQT_POSTGRES_DATABASE`):type:'json' 的 =/!=/in @ 真实 PG(旧驱动红测确认 "operator does not exist");collection contains 对照组。
- `tests/runtime/mysqlOpenIdempotency.spec.ts`(1 用例,需 `INTERAQT_MYSQL_DATABASE`):openForSchemaRead→open→open 连接数恒定 + `_IDS_` 初始化 + forceDrop 不泄漏(旧驱动红测:同序列悬挂 4 条连接)。
- 红-绿方法备注:F-1/F-2/I-3 以探针红测先行(PGLite/SQLite);I-1 在真实 PG 16 上红测(`operator does not exist: json = unknown`)后转绿;I-2 在真实 MySQL 8 上以连接计数红测(4 条 → 1 条)后转绿;预言机第 5 条规则以 writePathTopologyMatrix 首跑红(端点缺 id)定谳附带修复。
