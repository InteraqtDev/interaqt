# 全代码库深度 Review 报告（2026-07-10 第十三轮）

- 日期：2026-07-10
- 基线：`main` @ `de859b4d`（v2.0.4，r1–r12 的致命/重要修复全部落地）
- 范围：四路并行深度探查历史冷区——storage 元数据与 SQL 生成层（EntityToTableMap 路径解析、SQLBuilder orderBy/WHERE 编译、Setup 标识符治理、AliasManager）/ runtime 引擎与系统门面（MonoSystem KV/dict/atomic、Controller applyResult 链、Scheduler 生命周期、transaction 重试面）/ computations 语义一致性（六聚合模板残余、Transform 身份管理、StateMachine 触发匹配、Custom 返回值契约）/ builtins 守卫链与 drivers 纵深（BoolExp 组合求值的 fail-open 面、Attributive/Condition 契约、PG 连接管理、导出面）
- 方法：先对 r1–r12 全部报告做**逐条去重清单**（四路探查候选中约四成为既有遗留项重复，已剔除）→ 对每个致命/重要候选**编写最小复现测试实际运行**（PGLiteDB/SQLiteDB）。只有「已运行复现确认」的问题列为致命/重要；证伪或重新归类的候选明确记录（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1829 passed / 26 skipped。

> **维护说明（2026-07-10）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r13-f820`）全部修复。回归测试：`tests/runtime/review-fixes-2026-07-10-r13.spec.ts`（8 用例）+ `tests/storage/review-fixes-2026-07-10-r13.spec.ts`（4 用例）。修复后 `npm run check` 通过；`npm test` 全量 **1841 passed / 26 skipped**（净 +12 回归用例，零既有用例回归——本轮修复的 fail-open / 静默写穿形态同样没有任何测试固化过）。
>
> **维护说明二（2026-07-10 追加，r14 后续轮）**：第四节 I-1~I-10 全部显著改进项已在同分支修复/决策完毕（I-9 经迁移 manifest 哈希影响评估后决策为「文档化奠定性差异、不改 DDL」）；同轮按框架决策废弃了 `Attributive` 概念（守卫收敛为 Condition 单一概念）。详见 `deep-review-2026-07-10-r14-followup.md`。回归测试：`tests/runtime/review-fixes-2026-07-10-r14.spec.ts`（8 用例）+ `tests/storage/review-fixes-2026-07-10-r14.spec.ts`（4 用例）。

---

## 一、结论摘要

经十二轮修复，读写主路径、聚合增量、filtered/merged 编译、Activity 状态机、migration、json 值域矩阵均已高度收敛。本轮在剩余冷区找到的新致命项集中在三类「契约空洞」：

1. **守卫链的类型契约缺口是双向的**——r9 拦截了 `undefined` 返回值、记录了「truthy 非 boolean 放行」；但 **falsy 非 boolean（null/0/''）在 `not(...)` 组合下会被取反成"通过"**。`return user.profile && user.profile.isAdmin` 这类短路表达式产出 null 是 JS 最常见的意外形态之一，挂进 `not()` 就是权限 fail-open——比 truthy 放行更危险（truthy 放行至少要求回调"想放行"，这里是回调"想拒绝"却被放行）。
2. **计算结果应用链对 undefined 的语义分裂**——`applyResult` 的 entity/relation 分支把 undefined/null 视为 skip，global/property 分支却**原样写穿**：`compute`/`incrementalCompute` 漏写 `return`（返回 undefined）时，dict 值与 property 列被静默抹掉。现有测试从未固化「漏写 return」形态，十二轮未被发现。
3. **Transform 的身份管理可被自然写法击穿**——派生记录身份由 (sourceRecordId, transformIndex) 管理，但 callback 返回值直接展开进 create 载荷，顶层 `id` 走 storage 的「外部 id」路径原样落库。`callback: (r) => ({...r, extra})` 是展开源记录的自然写法，携带的源 id 与派生实体自己的发号序列必然冲突——SQLite 整型 id 下实测**立即**产生同表重复 id（按 id 查询命中 2 行），数组回调 + 展开则单次 create 内即重复。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 3 | 守卫 falsy 非 boolean 在 not() 下 fail-open、applyResult 写穿 undefined、Transform 外部 id 重复 |
| 重要（已复现，已修） | 5 | 见第三节 |
| 重要（代码证据，已修） | 2 | PG adminClient 泄漏、聚合端点 null 守卫（见第三节） |
| 证伪/重新归类 | 5 | 见第五节 |
| 重要（探查/精读，高置信度，未修） | 10 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 守卫回调返回 falsy 非 boolean（null/0/''）在 `not(...)` 组合下 fail-open

- 位置：`src/builtins/interaction/Interaction.ts` `checkCondition.handleAttribute` / `checkAttributive`（仅拦截 `undefined`）；`src/core/BoolExp.ts` `evaluateAsync` L444（`(result && !inverse || !result && inverse)`——inverse 分支对任何 falsy 判 true）。
- 复现（实测输出）：

```
Condition.create({ content: async () => null })   // 短路表达式的典型产物
Interaction({ conditions: Conditions.create({ content: BoolExp.atom(leaky).not() }) })
dispatch → { error: undefined }                    ❌ 权限检查被放行（fail-open）
```

- 影响：`not(...)` 是文档化的守卫组合形态（黑名单式权限："不是被封禁用户"、"不在维护期"）。回调因数据缺失短路出 null/0/'' 时——正是它"想表达拒绝"的时刻——`not` 把 falsy 取反成通过。r9-I-4 记录的「truthy 非 boolean 放行」是同一契约缺口的另一半，当时因"契约变更需评审"搁置。
- 修复（一并收口 r9-I-4）：Condition/Attributive 的返回值执行**严格 boolean 契约**——非 boolean 一律转为错误信息（BoolExp 中错误字符串无论是否处于 not 之下都判失败，fail-closed），错误信息包含实际返回值与类型、指引 `!!` 归一。回归覆盖：`not(null)` 拒绝、`not(false)` 放行（合法双重否定不受影响）、truthy 字符串拒绝。

### F-2 `applyResult` 对 global/property 写穿 undefined：漏写 return 的计算静默抹掉已有值

- 位置：`src/runtime/Controller.ts` `applyResult`——entity/relation 分支有 `result === undefined || result === null → return` 守卫，global 分支直接 `dict.set(name, undefined)`、property 分支直接 `update({[name]: undefined})`。
- 复现（实测输出）：

```
// global dict：初始值 99；incrementalCompute 漏写 return
create('Item', ...) → dict.get('trapDict') → undefined     ❌ 99 被静默抹掉
// property：初始值 7；同形态
update('Host', ...) → host.derived → null                  ❌ 7 被静默抹掉
```

- 影响：`incrementalCompute`/`compute` 漏写 `return`（或分支遗漏）是最常见的用户错误之一；受影响的还有 StateMachine `computeValue` 返回 undefined、异步计算 `asyncReturn` 返回 undefined 等所有路由到 `applyResult` 的路径。破坏形态是**已有正确值被抹掉**且零告警——比"算错"更隐蔽（测试常只覆盖首次计算，不覆盖"后续事件不该改值"）。
- 修复：`applyResult` 对 undefined **统一 skip**（四个 dataContext 分支一致，与 `incrementalPatchCompute` 的「undefined = 无 patch」语义、property 初始值链的 `defaultValue !== undefined` 守卫对齐）；null 保持写入（null 是合法值域——显式清空 dict/property）。回归覆盖 undefined 保值 + 显式 null 仍写穿两个方向。

### F-3 Transform 回调返回顶层 `id` → 派生表重复 id（静默数据损坏）

- 位置：`src/runtime/computations/Transform.ts` 四条路径（compute 全量 / eventBased / dataBased create / dataBased update）均把 callback 返回值直接展开进 insert/update 载荷；`EntityQueryHandle.create` 支持外部 id（注释明示），`CreationExecutor.insertSameRowData` 对带 id 载荷跳过 `getAutoId`。
- 复现（实测输出）：

```
// 自然写法：展开源记录
Transform.create({ record: Order, callback: (order) => ({...order}) })
// SQLite（整型发号序列，各表独立从 1 起）：
create('Order', ...)   → Archived 派生行 id = 1（Order 的 id）
create('Archived', ...) → 直接创建也分配 id = 1               ❌ 同表两行 id=1
find('Archived', {id: 1}) → 命中 2 行                          ❌ 按 id 查询/更新/删除任意命中
// 数组回调 + 展开（PGLite uuid 同样中招）：
callback: (o) => [{...o, kind:'a'}, {...o, kind:'b'}]
→ 单次 create 产出两行相同 uuid                                ❌ 一次事件即重复
```

- 影响：id 列无唯一约束（id 唯一性由发号器保证——外部 id 恰好绕过发号器），重复 id 落库后按 id 的一切操作（查询、增量更新、删除、关系端点解析）命中任意一行。`{...record}` 展开是文档内外最自然的派生写法，uuid 驱动下损坏延迟到「碰巧再次操作该 id」才暴露，SQLite/MySQL 整型序列下几乎立即撞车。
- 修复：Transform 的四条路径对 callback 返回记录的**顶层 `id` 字段 fail-fast**（`ComputationError`，指引 `({id: _, ...rest}) => rest` 剥离写法）；嵌套关联引用（`{author: {id}}`）不受影响。正向回归：剥离 id 的 callback 照常工作、派生行获得独立 id。

---

## 三、重要问题（本轮已修复）

### R-1 `storage.set(concept, key, undefined)` 存入字面量 `"undefined"`：该 key 永久不可读（已复现）

- 位置：`src/runtime/MonoSystem.ts` `JSONStringify`（`encodeURI(JSON.stringify(value))`——`JSON.stringify(undefined)` 返回 undefined 非字符串，`encodeURI` 把它 ToString 成 `"undefined"`）。
- 复现：`set('concept','k',undefined)` → `get` 抛 `SyntaxError: "undefined" is not valid JSON`。`_System_` 表是 activity refs、migration 状态的宿主，一次坏写即污染。
- 修复：与 JSON 语义对齐（数组中的 undefined 也序列化为 null）——undefined 归一为 `null` 存储；create 分支顺带改用同一 `JSONStringify`（原先内联重复了一份 `encodeURI(JSON.stringify(...))`）。round-trip 回归（含 update 分支覆盖写）。

### R-2 global 聚合缺 `record` 参数：createStates 处裸 TypeError（已复现）

- 位置：`src/runtime/computations/aggregationTemplate.ts` `GlobalRecordsAggregationHandle` 构造（`this.record = args.record!` 非空断言）；`core/Count.ts` 等声明层 `record.required: false`（property 形态合法不传，global 形态必须传——声明层无法区分）。
- 复现：`Dictionary + Summation.create({attributeQuery})`（漏 record）→ `Cannot read properties of undefined (reading 'name')`，错误栈指向 `createStates`，与声明完全脱节。
- 修复：模板构造期 `requireAggregationRecord`——缺失或无 `name` 的 record 抛出带指引的明确错误（六个 global 聚合 handle 一次覆盖）。

### R-3 orderBy / isReferenceValue 引用路径的叶子属性无校验：裸 TypeError 或 `"表"."undefined"` 非法 SQL（已复现）

- 位置：`src/storage/erstorage/EntityToTableMap.ts` `getTableAliasAndFieldName` 末段（直接 `.field` 解引用）。match key 与 attributeQuery 的 typo 早有 assert（r10 收口写入口、r7 收口路径中段），orderBy 与 isReferenceValue 的**叶子**是最后一个无守卫出口。
- 复现：`orderBy: {nmae:'ASC'}` → `TypeError: Cannot read properties of undefined (reading 'field')`；`orderBy: {team:'ASC'}`（关系属性名）→ SQLite 裸报 `no such column: User.undefined`；`value: ['=','nmae'], isReferenceValue: true` → 同 TypeError。
- 修复：该公共出口对叶子属性显式校验——未知属性抛 `attribute "x" not found on "path"`；无物理列的关系属性抛「is a relation, not a value field，请用 `rel.someField` 值路径」。带物理列的 record attribute（relation 记录的 source/target、合并链接列）是合法形态，照常放行（`dataConstraints.spec.ts` 的关系端点唯一约束路径依赖这一点，实测验证）。

### R-4 match 操作符 `['NOT', null]` 大小写未归一（已复现）

- 位置：`src/storage/erstorage/MatchExp.ts`——r11 R-3 把 simpleOp/in/not in/between 统一按小写归一后，`'not'` 分支仍是精确匹配，大写 `NOT` 落入末尾 `unknown value expression` assert。
- 修复：`not` 分支改用 lowerOp；`in`/`between` 分支顺带复用已计算的 lowerOp（消除对非字符串操作符的 `.toLowerCase()` 裸调用面）。大小写双回归 + 非 null 操作数受控错误保持。

### R-5 StateMachine trigger 的 null pattern 匹配任何值：声明了 null 约束的转移被静默误触发（已复现）

- 位置：`src/runtime/computations/TransitionFinder.ts` `deepPartialMatch` 首行 `if (pattern === undefined || pattern === null) return true`——null 作为**嵌套 pattern 值**时（`trigger: {record: {clearedAt: null}}`，意图"该字段必须为 null"）匹配任何值。与 `ComputationSourceMap.deepMatch` 的精确语义（`expected === null → actual === expected`）相悖。
- 复现：trigger `record: {flag: null}` 的转移在 `flag` 更新为 `'other'`（非 null）时也被触发，状态被错误推进。
- 修复：null pattern 改为精确匹配（undefined 保持"不关心该字段"语义——显式声明键但值 undefined 时跳过）。回归覆盖「非 null 不触发 + null 精确触发」。

### R-6 / R-7 代码证据类修复（无独立复现，风险面明确）

- **R-6 PostgreSQL `open()` 管理连接泄漏**：`adminClient.connect()` 后的建库/删库语句无 try/finally，权限不足、库名冲突、连接上限等失败路径不执行 `adminClient.end()`——反复 open 失败累积悬挂连接直至撞服务端上限（CI/多租户建库场景放大）。修复：try/finally 包裹（与 `Mysql.ts` bootstrap 连接的既有模式对齐）。
- **R-7 property 聚合增量的关系端点缺失裸解引用**：`aggregationTemplate` create/update 增量分支对 `relationWithEntity[this.relationSide]` 直接挂 `LINK_SYMBOL`——关系行存在但端点实体已被并发删除（关系行短暂悬挂）时抛 `TypeError: Cannot set properties of undefined`，整批 dispatch 失败且无聚合自愈。修复：端点缺失时退回 `fullRecompute`（与同函数中「关系行不存在」的既有防御一致）。

---

## 四、重要问题（探查/精读判定，高置信度，本轮未修）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | **`retrieveLastValue` 对 entity/relation 上下文返回全表**：`useLastValue` 的 entity/relation 级计算每次增量拉全表当 lastValue；migration 的等值短路同样拿全表做深比较 | `Controller.ts` L538–549 | 语义上"计算的输出值 = 全部记录"成立，但大表上是 OOM/超时悬崖；建议 lastValue 语义按上下文分化（entity/relation 提供游标/分页或禁用 useLastValue） |
| I-2 | **Controller/Scheduler 无销毁路径**：`system.destroy()` 只关 DB，`callbacks` Set 里的计算监听闭包永不注销；同一 MonoSystem 上重复 `new Controller().setup()` 累积监听器 | `MonoSystem.ts` listen/destroy、`Scheduler.ts` removeRegisteredMutationListeners（仅 setup 内部调用） | 长生命周期进程热重载 / 多租户单进程的内存泄漏与「旧 controller 的计算仍在触发」风险；建议补 `controller.teardown()` |
| I-3 | **`atomic.lockRows` find-then-lock 行集漂移**：先 find 取 id 集再 `FOR UPDATE`，READ COMMITTED 下两步之间的并发 insert 不在锁集、并发 delete 的 id 做无效锁 | `MonoSystem.ts` L1064–1078 | r3-R4（asyncReturn 幻影行）的门面层同族形态；根治需单语句 `SELECT ... WHERE ... FOR UPDATE`（子查询形态），与既有并发治理一轮做 |
| I-4 | **`dict.get` 无 defaultValue 回退**：dict 行缺失（新加声明未 migrate、手工删行）时返回 undefined，不回落 `Dictionary.defaultValue`；下游计算把 undefined 当 0/false 静默走偏 | `MonoSystem.ts` L83–87 | 与 `storage.get(concept,key,initialValue)` 的显式回退不对称；建议 dict.get 感知声明的 defaultValue 或文档化 |
| I-5 | **事务重试判定面窄**：仅 PG `40001`/`40P01` 重试；`ECONNRESET`/`57P01`（连接回收）、SQLite `SQLITE_BUSY` 等瞬时基础设施错误立即失败 | `transaction.ts` L96–102 | 生产 PG 连接池回收场景的可用性缺口；扩展需谨慎（区分"事务级可重试"与"连接级需重连"） |
| I-6 | **dispatch 错误响应缺 `data`/`context` 字段**：错误路径返回 `{error, effects:[], sideEffects:{}}`，成功路径含 `data`/`context`——直接序列化 DispatchResponse 的 HTTP 层拿到形态不一致的 JSON | `Controller.ts` L745–751 | 契约一致性小项 |
| I-7 | **物理表名无标识符长度治理**：合表名 `EntityA_EntityB_...` 直接插值 DDL；超 PG 63 字节时静默截断（后续 CREATE 撞 already exists 的错误与声明脱节），MySQL 64 直接报错 | `Setup.ts` L148、L1166 | 字段名（generateShortFieldName）、查询别名（AliasManager）、约束名（buildPhysicalConstraintName）都有治理，物理表名是唯一漏项；建议 Setup 期按 dialect fail-fast |
| I-8 | **orderBy 走 x:n 路径的排序语义未定义**：`orderBy: {'posts.title':'ASC'}` 按 JOIN 扇出行序排序后 dedupe，结果近似"按每宿主最小关联值排序"但无文档无校验 | `Modifier.ts` L38–60、`QueryExecutor.ts` post-pagination | 建议文档化或声明期拒绝 x:n orderBy 路径 |
| I-9 | **PG `_rowId` 列无 PRIMARY KEY 约束**：PG 驱动 `pk → INT GENERATED ALWAYS AS IDENTITY`（无约束），PGLite `SERIAL PRIMARY KEY`、SQLite `INTEGER PRIMARY KEY` | `PostgreSQL.ts` L387 对照 `PGLite.ts`/`SQLite.ts` | 无 FK 引用 _rowId 故无实际损坏路径，但跨驱动 DDL 漂移应统一 |
| I-10 | **Activity 运行期错误全是裸 `Error`**：`ActivityStateError`/`InteractionExecutionError` 已定义、已导出、零引用；调用方无法按 FrameworkError 树分流 | `ActivityCall.ts` L186 等、`errors/ActivityErrors.ts` | API 卫生 + 可观测性；与 `InteractionGuardError`（实际使用）不一致 |

另有低优先级项：`checkConceptAttributive` 把组合 attributive 的 atom 级错误聚合成统一的 `'attributives check failed'`（isCollection 多元素失败难定位）；`PayloadItem.base` 的 Klass 元数据只声明 `'Entity'` 而运行期支持 Relation（round-trip 契约面）；trigger/eventDep 的数组 pattern 是前缀匹配（`[1,2]` 匹配 `[1,2,3]`，TransitionFinder 与 ComputationSourceMap 行为一致但均未文档化）；RealTime `Expression.evaluate` 对 `sqrt(负数)` 产出 NaN 直接持久化（与 Summation 的 NaN 归零哲学不一致）；ScopedSequence 宿主 update 改 scope 字段时序号不重分配也不拒绝（序号仍占旧 scope 计数器，语义空洞——r11-I-6/I-7 家族）；global Summation/Average 传 property 形态的 `[['&',...]]` attributeQuery 在 install 期报错但错误信息与声明脱节（storage 层报错被 install 指引包裹）。

## 五、本轮证伪/重新归类的候选

| 候选 | 结论 |
|------|------|
| 「`or(左支抛错, 右支 true)` 整体放行 = fail-open」（builtins 探查 #2，初判高置信） | 重新归类为一致设计：BoolExp 的错误传播符合 Kleene 三值逻辑（`UNKNOWN OR TRUE = TRUE`、`TRUE AND UNKNOWN = UNKNOWN`、`NOT UNKNOWN = UNKNOWN`）——or 语义本就是"任一分支授权即通过"，右支真实通过时左支的故障不构成越权；and/not 下错误仍 fail-closed。F-1 修复后，"返回值形态错误"也不再依赖该路径 |
| 「global Summation 传 `[['&',...]]` attributeQuery 静默恒 0」（computations 探查 #5，初判致命） | 证伪（降级）：实测 install 期即抛错（storage 层拒绝该 attributeQuery），不产出静默 0；错误信息可读性列入第四节低优先级项 |
| 「Scheduler.setup 注册循环中途失败 → 新旧监听器混合态」（runtime 探查 #3） | 证伪：`registerMutationListener` 最终落到 `MonoStorage.listen` 的 `Set.add`，同步且不抛错；r8 的原子切换覆盖了唯一真实的失败窗口（构建期） |
| 「AliasManager 按 JS 字符数判 63 上限，多字节标识符静默截断」（storage 探查 #6） | 证伪：Entity/Relation/Property 名在声明期强制 `/^[a-zA-Z0-9_]+$/`（纯 ASCII），字符数恒等于字节数 |
| 「TransitionFinder 与 ComputationSourceMap 的 deepMatch 对同一 trigger 判定分歧」（computations 探查 #7 的跨层部分） | 证伪：StateMachine 的 eventDeps 只注册 recordName+type（源码注释明示不用系统深度匹配），record pattern 仅在 TransitionFinder 求值——两个匹配器服务不同特性，无同一声明双路径分歧；null 语义缺陷独立成立（已作为 R-5 修复） |

## 六、既有遗留项复确（r2–r12 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；`!=` 三值逻辑；dispatch 先持久化事件再 resolve（r9-I-2）；payload 弱校验族 / `userRef`/`itemRef` 死 API（r7）；isRef 无行级授权 IDOR 面（r11-I-5）；StateMachine 单事件单跳（r7-I-8）；同批 property 计算无拓扑序（r7-I-9）；`Event`/`Activity.events` 死 API（r12-I-8）；head 无 activityId + isRef 错误信息（r12-I-9）；Custom 多 dataDeps 每 dep 各触发一次（r11-I-2）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减 + 无 failed 终态（r2-I-6/r12-I-3）；storage 级联删除无深度上限（r2-I-5）；offset-only 全表拉取 / EXIST 误触 post-pagination（r12-I-4/I-5）；迁移全表载入内存（MIG-I3）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；activity refs 无版本 RMW（r5-I-12）；handleAsyncReturn find-then-lock 幻影行（r3-R4，本轮 I-3 为其门面层同族）；SERIALIZABLE 重试边界内 guard/afterDispatch 重放（S2）。
- **migration**：迁移阶段顺序（r10-I-1）；rename = remove+add（r9-I-3）；merged input 移除孤儿数据（r10-I-2）。
- **驱动**：contains 四驱动语义矩阵（r12-I-6）；SQLite 无行锁能力位（r12-I-7）；Klass.clone 注册表语义分裂（r12-I-2）。
- **时间调度**：`nextRecomputeTime` 无消费方（r3-R5）。

## 七、修复优先级建议（遗留项）

1. **并发治理专轮**（r12-I-1 dict.set 竞态 + r5-I-12 refs RMW + r3-R4 幻影行 + 本轮 I-3 lockRows 行集漂移）——四者同属「READ COMMITTED 下的 find-then-write/lock」家族，需要驱动级 UPSERT/单语句锁原语 + 关键表唯一约束；
2. **r10-I-1 迁移阶段顺序**（连续四轮位居榜首的未修项）——唯一可能产出「静默错误聚合值」的已知路径；
3. **I-2 Controller/Scheduler 销毁路径**——长生命周期进程的正确性边界，改动集中（补 teardown + destroy 调用链）；
4. **I-1 retrieveLastValue 全表**——entity/relation useLastValue 的语义分化设计（与 I-4 dict.get 回退同做一轮「lastValue/默认值语义」收口）；
5. **createClass 统一校验**（r7-I-13 未知参数 + r11-I-8 public.constraints + r12-R-1 + 本轮 R-2 的手工 fail-fast）——第四轮佐证「声明校验应在 createClass 层统一执行」的一次性根治价值。

## 附录：复现要点（验证用）

- F-1：`Conditions.create({content: BoolExp.atom(returnsNull).not()})` → dispatch 应被拒绝（错误信息含"must explicitly return a boolean"）；`not(returnsFalse)` 应放行；truthy 字符串返回值应被拒绝。
- F-2：global/property Custom 的 `incrementalCompute` 漏写 return → dict/property 保持原值；显式 `return null` → 写入 null。
- F-3：`Transform callback: (r) => ({...r})` → create 源记录应抛 `top-level "id" field` 错误、派生表零污染；剥离 id 的 callback 正常派生且 id 独立。
- R-1：`storage.set(c, k, undefined)` → `get` 返回 null（不抛 SyntaxError）；覆盖写 round-trip 正常。
- R-2：`Summation.create({attributeQuery})` 挂 Dictionary → Controller 构造期抛 `requires a "record" argument`。
- R-3：`orderBy: {nmae:'ASC'}` → `attribute "nmae" not found`；`orderBy: {team:'ASC'}` → `is a relation, not a value field`；`orderBy: {'team.title':'ASC'}` 正常。
- R-4：`['NOT', null]` 与 `['not', null]` 等价；`['NOT', 'x']` 受控错误。
- R-5：trigger `record: {flag: null}` → flag 更新为非 null 不触发转移，更新为 null 触发。
