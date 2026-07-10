# 全代码库深度 Review 报告（2026-07-10 第十二轮）

- 日期：2026-07-10
- 基线：`main` @ `402df40f`（v2.0.3，r1–r11 的致命/重要修复全部落地）
- 范围：四路并行深度探查历史冷区——storage 读路径与表达式层（QueryExecutor 分页/递归、MatchExp 引用值、Modifier、AttributeQuery/RecordQuery/SchemaDialect、objectstorage）/ runtime 并发·异步·调度（transaction、asyncContext、patch 应用链、ScopedSequence helper 栈）/ core 声明层与序列化管线（createClass 校验空洞、RefContainer、clone 语义、注册表完备性）/ builtins 执行链与 drivers 纵深（Activity 图形态、四驱动 feature parity、Gateway/Event/Data 死区、vscode-extension、scripts）
- 方法：先对 r1–r11 全部报告做**逐条去重清单**（约三分之一的四路探查候选为既有遗留项重复，已剔除）→ 对每个致命/重要候选**编写最小复现测试实际运行**（PGLiteDB/SQLiteDB）。只有「已运行复现确认」的问题列为致命/重要；证伪或重新归类的候选明确记录（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1815 passed / 26 skipped。

> **维护说明（2026-07-10）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r12-4298`）全部修复。回归测试：`tests/runtime/review-fixes-2026-07-10-r12.spec.ts`（9 用例）+ `tests/storage/review-fixes-2026-07-10-r12.spec.ts`（5 用例）。修复后 `npm run check` 通过；`npm test` 全量 **1829 passed / 26 skipped**（零既有用例回归——本轮修复的静默失效形态恰好没有任何测试固化过，佐证其「零告警」属性）。知识库 `usage/12-data-querying.md` 补充 isReferenceValue 跨关系路径示例。

---

## 一、结论摘要

经十一轮修复，读写主路径、聚合增量、filtered/merged 编译、Activity 状态机、migration、json 等值匹配主干均已高度收敛。本轮在剩余冷区找到的新致命项集中在三类：

1. **patch 应用链的形态漏洞**——`incrementalPatchCompute` 的 patch 信封在 global dict 分支被原样写入（其他分支都解析 `patch.type`/`patch.data`），任何 global 级 patch 计算的 dict 值全链路污染。现有测试恰好只断言"回调被调用过"，从未断言 dict 终值。
2. **查询编译器只看 key 不看 value**——`isReferenceValue` 的引用路径（`value[1]`）从不参与 JOIN 树构建，跨关系的字段比较（文档已示例同行比较，跨关系是同一 API 的自然延伸）100% 裸崩 `missing FROM-clause entry`。
3. **json 列的"值域 × 驱动"矩阵残缺**——r10/r11 修通了 object 等值匹配的主干，但（a）字符串 JSON 值在返回已解析值的驱动（PGlite/pg/mysql2）上**读回必炸**（读路径对所有 string 无条件二次 JSON.parse）；（b）update 路径不走 `prepareFieldValue`，字符串值存成非法 JSON 文本、对象存成非规范形；（c）SQLite 文本回退比较对键序敏感，同一模型同一查询在 SQLite/PG 系产出不同结果（静默漏命中）。

另有一族「声明合法、语义静默蒸发」的声明期校验空洞（孤立 matchExpression、filtered+merged 模式叠加、computed+computation 双写通道、Activity 图节点实例复用），全部实测确认后以 fail-fast 收口。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 3 | global patch 信封污染 dict、isReferenceValue 跨关系必崩、json 值域×驱动矩阵（字符串值读回炸 / update 形态漂移 / SQLite 键序静默漏命中） |
| 重要（已复现，已修） | 5 | 见第三节 |
| 证伪/重新归类 | 6 | 见第五节 |
| 重要（探查/精读，高置信度，未修） | 9 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 `applyResultPatch` global 分支把 patch 信封整个写进 dict：patch 模式的 global 计算全链路污染

- 位置：`src/runtime/Controller.ts` `applyResultPatch`（global 分支 `dict.set(name, patch)`，对照 entity/relation/property 分支全部解析 `patch.type`/`patch.data`）。
- 复现（实测输出）：

```
// global dict + Custom.incrementalPatchCompute 返回 {type:'insert', data: lastValue+1}
create('PatchEntity', {...})
dict.get('patchDict') → {"type":"insert","data":1}     ❌ 信封对象，不是值 1
```

- 影响：`incrementalPatchCompute` 是文档化的扩展点，global（dict）形态声明合法、同步与 asyncReturn 两条路径都路由到该分支。一旦使用，dict 里存的是信封对象——依赖该 dict 的所有下游计算（dataDeps global 引用）、`dict.get` 的业务读取全部拿到损坏值。现有 `customHandles.spec.ts` 的 global patch 用例只断言回调执行过、从未断言 dict 终值，缺陷因此十一轮未被发现。
- 修复：global 分支解析信封——insert/update 写 `patch.data`，delete 写 `null`（与 property 分支的 delete → null 一致）；同时对**所有**分支增加信封形态校验（`patch.type` 不是 insert/update/delete 一律抛 `ComputationError`，指引「裸值请用 incrementalCompute」）——此前 entity/relation 分支对未知 type 也是静默跳过。

### F-2 `isReferenceValue` 的引用路径不参与 JOIN 树：跨关系的字段比较 100% 裸崩

- 位置：`src/storage/erstorage/MatchExp.ts` `buildQueryTree`（只遍历 atom.key，从不解析 `value[1]` 引用路径）；对照 `getReferenceFieldValue`（把 `leader.salary` 编译成 `"User_leader"."salary"` 列引用直接嵌入 WHERE）。
- 复现（实测输出）：

```
find('User', MatchExp.atom({ key:'salary', value:['<','leader.salary'], isReferenceValue:true }))
→ error: missing FROM-clause entry for table "RefUser7_leader"   ❌ 裸数据库错误
```

- 影响：`isReferenceValue` 是文档化 API（`usage/12-data-querying.md` 示例了同行字段比较）；跨 x:1 关系比较（"字段 A 小于关联实体的字段 B"）是同一声明形式的自然延伸——声明完全合法，运行 100% 崩溃，且错误信息与用户写法完全脱节。
- 修复：`buildQueryTree` 对 `isReferenceValue` 且引用值为多段路径的 atom，把引用路径加入 query tree（JOIN 自动构建；NULL 关联行按 SQL 比较语义自然不匹配）。exist 子查询场景（`contextRootEntity` 指向外层查询的根、引用解析的是外层已在作用域内的别名）明确排除，不误加内层 JOIN。知识库补充跨关系引用示例。

### F-3 json 列的「值域 × 驱动」矩阵残缺：字符串值读回必炸、update 形态漂移、SQLite 键序静默漏命中

三个问题同根（json 列的序列化/反序列化在写路径、读路径、匹配路径、驱动行为四方不对齐），一并修复。

- 位置：`src/storage/erstorage/QueryExecutor.ts` `structureRawReturns`（对 json 字段的所有 string 值无条件 `JSON.parse`）；`SQLBuilder.buildUpdateSQL`（不走 `prepareFieldValue`，由驱动兜底 `JSON.stringify`——字符串值原样绑定）；`MatchExp` json 文本回退比较与 `prepareFieldValue` 均用非规范 `JSON.stringify`。
- 复现（实测输出）：

```
// (a) 字符串 JSON 值 + 返回已解析值的驱动（PGlite/pg/mysql2 均默认解析 json 列）
create('Doc', { meta: 'plain-string' })   // type:'object' 的属性存字符串——合法 JSON 值
findOne(...) → Failed to parse JSON field "Doc.meta": Unexpected token 'p'   ❌ 读回必炸

// (b) update 路径（SQLite）
update('Doc', ..., { meta: 'plain-string' })  → 存成 plain-string（非法 JSON 文本）
findOne(...) → Failed to parse JSON field                                      ❌ 同炸

// (c) SQLite 等值匹配键序敏感
create('Doc', { meta: {a:1, b:2} })
find(..., ['=', {b:2, a:1}]) → SQLite: 0 命中 / PGLite: 1 命中                 ❌ 跨驱动语义漂移
```

- 影响：(a) 是「合法值域必炸」——JSON 的值域包含字符串，任何在 json/object 属性里存字符串的应用在 PG 系/MySQL 上读回即崩（`'123'` 这类数字字符串则被静默变成数字，更隐蔽）；(b) 让 update 过的 json 行在 SQLite 上损坏或与 create 行形态漂移；(c) 是静默错误结果——测试（PGLite）通过、生产换 SQLite 后同一查询漏命中。
- 修复（治理为「一种规范形 + 驱动声明」）：
  1. 新增 `canonicalJSONStringify`（递归键排序的规范 JSON 序列化），`prepareFieldValue` 与 MatchExp 的 `=`/`!=`/`in`/`not in` 文本回退全部改用——写入与匹配两侧永远一致，SQLite 文本比较从此对键序不敏感，与 PG 系（`::jsonb`）/MySQL（`CAST AS JSON`）的语义相等对齐；
  2. `buildUpdateSQL` 与 INSERT 一致走 `prepareFieldValue`（`UpdateExecutor` 透传 fieldType）；
  3. `Database` 接口新增 `returnsParsedJSON` 能力声明（PGlite/pg/mysql2 为 true，better-sqlite3 缺省 false），读路径只对「返回原始 JSON 文本」的驱动做 `JSON.parse`——已解析驱动上的字符串 JSON 值不再被二次 parse。

---

## 三、重要问题（已复现，本轮已修复）

### R-1 声明模式冲突静默蒸发：孤立 matchExpression / filtered+merged 叠加 / computed+computation 双写通道

- 位置：`src/core/Entity.ts` / `Relation.ts` / `Property.ts` 的 create/构造校验空洞。
- 复现（实测输出）：

```
Entity.create({ name:'X', matchExpression: {...} })            // 无 baseEntity
→ setup 按普通实体建表，谓词从不生效，全量记录可见            ❌ 声明静默蒸发

Entity.create({ name:'Y', baseEntity, matchExpression, inputEntities: [A,B] })
→ merged 编译管线接管，filtered 语义（谓词）静默丢弃           ❌ 两种模式叠加取其一

Property.create({ name:'x', computed: r=>r.n*2, computation: Custom.create(...) })
→ 实测 computed 每次写入静默覆盖 computation 的输出（x=10/14 而非 105/107）❌ 双写通道竞争
```

- 修复：三处声明期 fail-fast（错误信息说明互斥语义与正确做法）。`defaultValue + computation` 的并存 r10 已证实有 setup 期拒绝，`computed + computation` 是同族漏项。内部管线核实不受影响（merged 的 transformMergedItem 在 create 后赋值 matchExpression，不走 create 参数；`Property.clone` 用 `new Property` 不过校验）。Relation 侧同步收口 `inputRelations + baseRelation` 与孤立 matchExpression。

### R-2 Activity 图节点实例复用：静默覆盖图注册表

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` `buildGraph`——`uuidToNode.set`/`rawToNode.set` 无重复检测，同一 Interaction 实例出现两次时后写覆盖先写。
- 复现：同一 interaction 同时挂在顶层与 group 子活动 → 实测抛出与声明完全脱节的 `start node must one, current: 2`（本形态碰巧被起点唯一性校验拦下；其他形态——如两个分支共享同一实例——会静默把 transfer/状态推进绑到错误节点）。
- 修复：interaction/group 实例在图中重复出现即声明期抛错（指引「每个节点必须是独立的 Interaction.create 实例」）。

### R-3 activity head 带 activityId 时不走 `fullGuardWithUserRef`：isRef attributive 落到误导性错误

- 位置：`src/builtins/interaction/activity/ActivityManager.ts` `wrappedGuard`——head+activityId 分支调 `interaction.guard`（standalone 路径，无 `checkUserRef` 钩子）。
- 复现：every 组两分支各有 head，分支一 head 保存 userRef 后，分支二 head（带 activityId、userAttributives 为 isRef attributive）dispatch → 修复前抛 `isRef... can only be checked inside an activity`（明明就在 activity 里）。
- 修复：head+activityId 分支与非 head 一致走 `fullGuardWithUserRef`（refs 已存在，isRef 语义完整）；首个 head（无 activityId，refs 尚不存在）保持 standalone 校验。回归覆盖「错误用户被拒 + 正确用户放行」。

### R-4 SQLite `open(forceDrop)` 忽略 forceDrop：文件库 `setup(true)` 二次运行即报错

- 位置：`src/drivers/SQLite.ts` `open()`（无参实现）。`:memory:` 每次 new 都是新库掩盖了问题；文件库上第二次 `setup(true)` 在 CREATE TABLE 处抛 `table already exists`，与 PG（DROP DATABASE）/PGLite（drop 全表）的 forceDrop 语义不一致。
- 修复：forceDrop 时枚举 `sqlite_master` 用户表并 drop（与 PGLite 同策略）。文件库回归用例。

### R-5 小修集

- `RecordQuery.derive` 不传 `alias`（filtered relation 的对外名），派生查询挂载名可能退回 base 属性名——补透传；
- `Scheduler.runDirtyRecordsComputation` 注释声称"continue with other records"而实际 fail-fast 中断整批——注释改为与行为一致（部分成功的静默不一致比中断更危险，行为本身是对的）。

---

## 四、重要问题（探查/精读判定，高置信度，本轮未修）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | **`setDictionaryValue` find-then-write 竞态**：并发 dispatch 双 miss 时两路 create（`_DICTIONARY_` 无唯一约束，产生双行）、双 hit 时 lost update | `MonoSystem.ts` L258–275 | 与 r3-R4/r5-I-12 同族的并发缺口；根治需要驱动级 UPSERT 原语 + dict key 唯一约束，建议与 activity refs CAS 一起做一轮并发治理 |
| I-2 | **Klass.clone 注册表语义分裂**：Entity/Relation/Property 的 clone 显式不注册（r 系列修复的既定语义，源码有 CAUTION 注释），其余 25+ 个 Klass 的 clone 全部经 `create()` 注册进 `instances`——实测 `Count.clone` 后 `Count.instances` 增长 | 各 core/builtins Klass | 污染 `stringifyAllInstances` 输出（序列化管线是公开 API）、跨测试泄漏。框架内部当前零调用非 ER clone（RefContainer/MergedItemProcessor 只用 ER 三件套），无 live 触发路径，但公开 API 的语义分裂应统一为「clone 不注册」；改动面广（25+ 文件）建议独立 PR |
| I-3 | **async task 无 failed 终态**：`handleAsyncReturn` 或 `applyResult*` 抛错（非 retryable）时事务回滚，task 永驻 `success`/`pending`，无失败标记、无重试退避、无告警钩子 | `Scheduler.ts` L993–1062、`markAsyncTaskStatus`（仅 applied/skipped） | 与 r2-I-6（task 表只增不减）叠加成运维债务；建议补 `failed` 状态 + 错误详情列 |
| I-4 | **offset-only + x:n 路径全表拉取**：`needsPostPagination` 剥离 SQL 的 LIMIT/OFFSET 后内存 slice——`{offset: 1000}` 无 limit 时数据库返回全部扇出行 | `QueryExecutor.ts` L200–238 | r3-I-2（x:n+LIMIT 禁用下推）家族的具体形态；正确性无损（两段式语义正确），深分页大表上是性能悬崖 |
| I-5 | **EXIST 子查询误触 post-pagination**：`queryTreeHasXToManyPath` 保守判定把纯 EXIST 过滤（无 join 扇出）也算作 x:n 路径，触发全量拉取+内存分页 | `QueryExecutor.ts` L343–354（注释自证保守） | 语义正确、性能保守；查询编译器级优化项 |
| I-6 | **`contains` 四驱动语义不完全等价**：PG 系 `json_array_elements_text` 假设数组展开、MySQL `JSON_CONTAINS` 对 object/array/scalar 规则不同、SQLite `json_each` 再比 value——json 列存 object/scalar 混合值时行为漂移 | 四驱动 `parseMatchExpression` | F-3 治理了 `=`/`in` 的矩阵；contains 的跨驱动矩阵建议测试固化后文档化 |
| I-7 | **SQLite 无行锁能力**：`supportsSelectForUpdate=false` 时 `lockRows`/`lockRecord` 实为普通 SELECT，asyncReturn/Transform 的锁语义在 SQLite 上不成立 | `SQLite.ts` L33、`MonoSystem.ts` lockRows | 驱动 notes 已声明无 PG 级隔离；建议在 `atomicSequenceCapability` 样式上补 `rowLocking` 能力位并文档化「SQLite=单进程串行」 |
| I-8 | **`Event`/`Activity.events` 全链死 API**：Event 已注册 Klass、可序列化进 Activity graph，但执行链（ActivityCall/ActivityManager/Controller）零引用；`findRootActivity` 永久 `return null`；`ActivityManager.getActivityCall(activityId)` 参数名误导（key 实为定义 uuid，传运行期 activityId 恒 undefined） | `Event.ts`、`Activity.ts` L363–365、`ActivityManager.ts` L188–190 | r7-I-15 死代码族的 builtins 残余；删除是 breaking 决策，建议下一个 major 统一清理 |
| I-9 | **head 无 activityId + isRef attributive 的错误信息误导**：首个 head 尚无 refs，isRef 检查落入 standalone 拒绝分支，错误说"can only be checked inside an activity"（用户明明在 activity 里）| `Interaction.ts` `checkUser` | R-3 修了带 activityId 的形态；无 activityId 的首 head 语义上确实无 refs 可查（永不可通过），建议错误信息区分「首个 head 没有先前保存的 refs」或声明期直接拒绝 head+isRef 组合 |

另有低优先级项：`RecordBoundState.setInternal` 吞掉「目标行不存在」（并发删除宿主后 bound state 静默不更新，聚合模板有 fullRecompute 兜底、通用路径无）；`AttributeQuery.mergeAttributeQueryData` 合并重复关系键时丢第三元组 `onlyRelationData`（r3-I-4 的姊妹维度，正常路径未复现出错误结果）；`vscode-extension/` 的 webview 类型与主包 API 完全脱节（自定义 Interaction/PayloadField 形状，改 builtins 零编译反馈）；`scripts/update-coverage-badge.ts` 对缺失 coverage 文件裸崩。

## 五、本轮证伪/重新归类的候选

| 候选 | 结论 |
|------|------|
| 「PostgreSQL `pk` 列 `GENERATED ALWAYS AS IDENTITY` + 框架恒显式 INSERT id → 真 PG 上 create 全失败」（drivers 探查，初判致命） | 证伪：`Setup.assignTableAndField` 第一遍会用 `mapToDBFieldType('id')`（INT）覆盖 ID_ATTR 的初始 'pk' fieldType，最终只有从不显式插入的 `_rowId` 列是 IDENTITY；PostgreSQL Concurrency CI（真 PG16 + create 路径）持续绿灯 |
| 「findOne/limit-1 下推 + orderBy 在 x:n 扇出下选错根记录」「post-pagination 不修正 ORDER BY」（storage 探查 #1/#2） | 证伪：实测（PGLite，n:n 扇出 ×2，orderBy age DESC）findOne 返回正确的最大值根记录、`limit:2 offset:1` 分页序正确——根字段排序下扇出行成组相邻，首行/首现顺序即根序 |
| 「goto 无对应 label 时环检测失效 → 无限递归」（storage 探查 #5） | 证伪：`recordQueryRef.get(goto)` 为 undefined 时 `assert` 立即抛 `goto xxx not found` 受控错误，不会进入递归 |
| 「global dataDep 的 create 事件缺 dict key 过滤 → 每个新 dict 键触发全部 global 计算」（runtime 探查 N-2） | 证伪：`shouldTriggerUpdateComputation` 的 dict key 过滤位于函数首行（早于 `source.type !== 'update'` 短路），对 create/update 事件同样生效 |
| 「ScopedSequence match 未知算子静默判 false」（runtime 探查 N-10） | 证伪：`ScopedSequence.create`/round-trip 均经 `validateScopedSequenceMatchExpression` 白名单校验（6 算子），运行期 switch 覆盖白名单全集，非法算子到不了求值层 |
| 「传播轨迹 trail 数组跨层级共享引用 → 兄弟分支污染」（runtime 探查 N-9） | 重新归类：共享是有意设计——trail 是跨传播链的调试面包屑（深度超限报错需要完整链路），兄弟残留只影响错误消息的「最近 32 条」窗口内容，深度计数本身按 ALS 隔离正确 |

## 六、既有遗留项复确（r2–r11 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；`!=` 三值逻辑；dispatch 先持久化事件再 resolve（r9-I-2）；守卫非 boolean truthy 放行（r9-I-4）；payload 弱校验族 / `userRef`/`itemRef` 死 API（r7）；isRef 无行级授权 IDOR 面（r11-I-5）；GetAction 无 dataPolicy 全表可查（r1-R4，文档已警告）；StateMachine 单事件单跳（r7-I-8）；同批 property 计算无拓扑序（r7-I-9）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减（r2-I-6）；storage 级联删除无深度上限（r2-I-5，r11-F1 只覆盖计算传播翼）；迁移全表载入内存（MIG-I3）；迁移锁无租约。
- **并发**：activity `refs` 无版本 RMW（r5-I-12，本轮 I-1 的 dict.set 为同族新形态）；handleAsyncReturn find-then-lock 幻影行（r3-R4）；SERIALIZABLE 重试边界内 guard/afterDispatch 重放（S2）。
- **migration**：rename = remove+add（r9-I-3）；迁移阶段顺序（r10-I-1）；merged input 移除孤儿数据（r10-I-2）；MySQL legacy log PG 方言（r10-I-3）。
- **时间调度**：`nextRecomputeTime` 无消费方（r3-R5）。

## 七、修复优先级建议（遗留项）

1. **I-1 dict.set 竞态 + r5-I-12 refs RMW + r3-R4 asyncReturn 幻影行**——三者同属「READ COMMITTED 下的 find-then-write」家族，适合一轮集中的并发治理（驱动 UPSERT 原语 + 关键表唯一约束 + CAS 扩展）；
2. **r10-I-1 迁移阶段顺序**（连续三轮位居榜首的未修项）——唯一可能产出「静默错误聚合值」的已知路径；
3. **I-2 Klass.clone 注册语义统一**——公开序列化管线的正确性边界，机械改动、独立 PR；
4. **I-3 async task failed 态**——可观测性缺口，改动小；
5. **createClass 统一校验**（r7-I-13 未知参数 + r11-I-8 public.constraints 死元数据 + 本轮 R-1 三处手工校验）——R-1 又添三个手工 fail-fast，进一步佐证「声明校验应在 createClass 层统一执行」的一次性根治价值。

## 附录：复现要点（验证用）

- F-1：global dict + `incrementalPatchCompute` 返回 `{type:'insert', data:n}` → `dict.get` 应得 `n`；返回 `{type:'delete'}` → null；返回裸值 → 抛 `ComputationResultPatch envelope` 错误。
- F-2：`MatchExp.atom({key:'salary', value:['<','leader.salary'], isReferenceValue:true})` → 应正确命中（无 leader 的行不匹配），不再报 missing FROM-clause。
- F-3：json 属性存字符串 → PGLite/SQLite 读回原字符串；update 成字符串/换键序对象 → 读回与等值匹配正确；`['=', {b,a}]` 与 `['in', [{b,a}]]` 在 SQLite/PGLite 命中一致。
- R-1：孤立 matchExpression / baseEntity+inputEntities / matchExpression 无 baseRelation / inputRelations+baseRelation / computed+computation → 均应声明期抛错。
- R-2：同一 Interaction 实例挂两处 → `new ActivityManager` 抛 `appears more than once`。
- R-3：every 组分支二 head 带 activityId + isRef userAttributives → 错误用户被拒（非 "outside activity" 错误）、正确用户放行。
- R-4：文件库 SQLite `setup(true)` 连续两次 → 第二次应重建成功且表为空。
