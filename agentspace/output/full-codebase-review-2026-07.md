# 全代码库深度 Review 报告（2026-07）

> **维护说明（2026-07-08 更新）**：本报告发现的问题已在同分支（`cursor/deep-code-review-0a77`）修复：
>
> - **致命 F-1 ~ F-5 全部修复**，回归测试见 `tests/runtime/review-fixes-2026-07.spec.ts`（13 个用例，覆盖附录中的全部复现场景 + 边界）。
> - **重要 R-1 ~ R-9 全部修复**（R-4 以文档强制约定的方式处置：`agent/agentspace/knowledge/generator/api-reference.md` 增加 dataPolicy.match 安全警告）。SQLite/PGLite 并发 dispatch 事务交错问题也已通过 MonoStorage 顶层事务串行化队列修复。
> - **已完成的改进项**：I-4（Custom 重复赋值 / Average 死代码）、I-6（`RecordQueryTree.addRecord` 合并）、I-8 部分（`JSON.parse` 带上下文报错、`LIMIT 0`）、I-13（Attributive 异常透出——顺带修复了 `not(attributive)` 下异常被反转为放行的 fail-open）、I-14（删除 `Controller.callbacks`/`addEventListener`、`ExternalSynchronizer.ts`、`runtime/boolExpression.ts`、`buildDeleteByWhereSQL`、`findPath` 的 `limitLength` 死参数）、I-15（FrameworkError 消息）、I-16（两个 Logger 的 `child()` 携带 fixed 元数据）。
> - **经核实为既定语义、不改动**：I-3 中 Average 对 null 计 0 且计入分母——`tests/runtime/average.spec.ts` L422 明确断言该行为（"null is considered as 0"），保持现状；property 路径缺失的 NaN/Infinity 守卫已补齐（与 global 对齐）。
> - **明确遗留（建议独立 PR）**：I-1（六个聚合 handle 的 property 增量模板抽取）、I-2（global create 路径与 update 对齐全量 findOne）、I-5（查询结果保留 SQL NULL 标量，属 API 行为变更）、I-7（orderBy 关联字段 + 扇出的代表行语义）、I-9（性能项）、I-10（序列化往返 / registerKlass 补全）、I-11（clone 注册语义统一）、I-12（'program' ActivityGroup 实现或移除）、4.4 节既有报告遗留项 S1–S4、S8。
>
> 下文正文保留 review 时的原始判定，作为问题背景与复现依据。

- 日期：2026-07-08
- 基线：`main` @ `af49f80a`（v1.7.0-alpha.0，即 `2b0dc63f` 之后的 release commit）
- 范围：`src/core`、`src/runtime`（含 computations）、`src/storage`、`src/builtins`、`src/drivers` 全量
- 方法：五个方向并行深度探查（storage / runtime 主路径 / computations / core+builtins / drivers）→ 人工精读交叉验证 → **对每个候选致命问题编写最小复现测试并实际运行**。本报告只把「已运行复现确认」的问题列为致命；仅凭代码精读判定的问题单独分级并标注置信度。
- 与既有报告的关系：`core-runtime-builtins-review.md`（2026-07-04）中 F1–F7 及 core/builtins 显著问题已修复；其遗留项 S1–S8 仍然有效，本报告不重复展开（在第四节引用）。本报告的发现均为**新增**（除特别标注）。

---

## 一、结论摘要

架构（`builtins → runtime → storage → core` 分层、单入口 dispatch、事务内同步级联计算、migration 的 manifest/diff/approval 体系）整体是健康的，近期的 fatal 修复与回归测试质量较高。但本轮 review 在**计算语义边界**（空集合、null/undefined、分页去重）和**框架健壮性**（重复 setup、驱动一致性）上发现了 5 个已运行复现的致命/严重错误结果问题，以及若干高置信度的重要问题。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现） | 5 | Every 空集合语义反转、`['=', null]` 静默匹配失败、WeightedSummation NaN 污染、LIMIT+join 扇出分页错误、重复 setup 导致监听器叠加 |
| 重要（代码精读，高置信度） | 9 | RealTime 崩溃、property 聚合 bound state 不复位、isRef 无 base 不校验、驱动 update() RETURNING 不生效、boolean 跨驱动不一致、`new Function` 注入、asyncInteractionContext 从未建立、migration 锁 TOCTOU、并发 dispatch 无保护 |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认）

### F-1 `Every` + `notEmpty: true`：空集合走全量 `compute()` 时返回 `true`（语义反转）

- 位置：`src/runtime/computations/Every.ts` L45–59（`GlobalEveryHandle.compute`）、L171–185（`PropertyEveryHandle.compute` 同样问题）
- `compute()` 对空集合返回 `matchCount === totalCount`，即 `0 === 0 → true`。而 `getInitialValue()` 与增量路径（L107 `if (totalCount === 0) return this.defaultValue`）都正确返回 `!notEmpty`（`notEmpty: true` 时为 `false`）。三条路径语义不一致，全量路径是错的。
- 触发场景：任何导致 full recompute 的事件（非主依赖变化、`relatedAttribute` 路径事件、membership 进出等）发生在集合为空时。复现中 dict 依赖初始化即触发：

```ts
// Every.create({ record: Request, notEmpty: true, dataDeps: { threshold: {type:'global', ...} }, callback: r => r.handled })
await controller.setup(true)
await system.storage.dict.get('everyRequestHandled')   // 实测返回 true，应为 false
```

- 影响：布尔派生值直接反转（例如「所有请求都已处理」在没有任何请求时为 true，用户显式声明 `notEmpty: true` 就是为了排除这种情况）。修复：`compute()` 中 `totalCount === 0` 时返回 `this.defaultValue`，与增量路径对齐；`PropertyEveryHandle.compute` 同步修。

### F-2 `MatchExp` 不支持 NULL 匹配：`['=', null]` 永远匹配不到任何行，且文档宣称的 `'is null'` 操作符不存在

- 位置：`src/storage/erstorage/MatchExp.ts` L205–272（`getFinalFieldValue`）
- `['=', null]` 生成 `"col" = $1` 绑定 `null`，SQL 语义下恒为 UNKNOWN，静默返回 0 行。唯一的 null 检查是 `['not', null]` → `IS NOT NULL`；不存在 `IS NULL` 的表达方式。
- 复现：两行数据（一行 `deletedAt` 为 NULL），`MatchExp.atom({key:'deletedAt', value:['=', null]})` 实测返回 0 行。
- 加重因素：`.cursor/rules/storage-layer.mdc` 和 `agentspace/knowledge/` 中的操作符列表明确写了 `'is null'` / `'is not null'` / `'not in'`——这三个在实现中都不存在（会落入 `assert(result, 'unknown value expression')`）。文档引导用户（和代码生成 agent）写出静默错误或直接报错的查询。
- 修复：实现 `['=', null]` → `IS NULL`（或显式 `'is null'` 操作符），补 `'not in'`，同步修正文档。filtered entity 的 matchExpression 涉及 null 判断时同样受益。

### F-3 `WeightedSummation`：`weight * value` 无有限性守卫，一条脏记录永久污染总和

- 位置：`src/runtime/computations/WeightedSummation.ts` L50–52（全量）、L70–73（增量 create）、property handle 同样
- `Summation.resolveSumField` 显式把 null/NaN/Infinity 归零（`Summation.ts` L55–61），WeightedSummation 没有等价处理。callback 返回 `{weight: 1, value: undefined}` 时 `1 * undefined = NaN`，`increment(NaN)` 后总和不可恢复。
- 复现：三条记录 `price` 分别为 `10, （缺失）, 5`，实测 `total` 为 `null`（NaN 落库后读出），应为 `15`。
- 修复：与 Summation 对齐，对 `weight`、`value`、乘积做 `Number.isFinite` 归一化（或抛出明确错误——按「显式控制」原则报错可能更符合框架气质，但至少不能静默 NaN）。

### F-4 根查询 `LIMIT`/`OFFSET` 作用于 join 扇出后的原始行，去重后返回数量错误

- 位置：`src/storage/erstorage/SQLBuilder.ts` L255–260（LIMIT/OFFSET 直接拼在扇出 join 的 SQL 上）+ `src/storage/erstorage/QueryExecutor.ts` L194–197（取回后再 `dedupeIdenticalRows`）
- match 走 x:n 路径（LEFT JOIN 扇出）时，同一根实体出现多行；`LIMIT n` 限制的是原始行数，去重后根实体数 < n；`OFFSET` 同理会跳过或重复逻辑实体，分页完全不可靠。
- 复现：3 个 user 各关联 3 个匹配 team，`find('PUser', {key:'teams.name', value:['like','A-%']}, {limit: 2})` 实测返回 **1** 个 user，应为 2。
- 影响：所有「按关联条件过滤 + 分页」的查询结果数量错误，`findOne`（limit 1）在扇出下反而碰巧正确，掩盖问题。修复方向：当 match 树含 x:n 路径时，将根查询改写为 `WHERE id IN (SELECT DISTINCT root.id … LIMIT/OFFSET)` 的两段式，或子查询先取根 id 再取全量字段。

### F-5 `Scheduler.setup()` 非幂等：重复 setup / migrate 后监听器叠加，Transform 类计算直接崩溃

- 位置：`src/runtime/Scheduler.ts` L1206–1215（每次 `setup()` 都无条件 `addMutationPropertyComputationDefaultValueListeners()` + `addMutationComputationListeners()`）；`src/runtime/MonoSystem.ts` L1183–1185（`listen()` 只增不减，闭包各不相同，Set 去重无效）；`src/runtime/Controller.ts` L489（`migrate()` 末尾再次 `scheduler.setup(false)`）
- 复现：同一 controller `setup(true)` 后再 `setup(false)`（监听器 2→4），随后任意一次会触发 Transform 的 `storage.create` 实测抛出 `ConstraintViolationError: duplicate key … "idx_transform_…"`——第二个监听器把同一源记录再 Transform 一遍，撞上派生记录唯一索引，整个 dispatch 回滚，**应用不可用**。
- 补充说明：Count/Summation 等增量计算因 per-item bound state 的 `replace()` 恰好幂等而侥幸不翻倍（第二遍 delta=0），这是偶然而非设计；Transform 靠唯一索引兜底才没有静默产生重复派生记录。
- 触发路径评估：`setup({migrate})` 或全新 controller + `migrate()` 的常规路径只会注册一次；但「同一 controller 实例调用两次 setup」「setup 成功后又调用 migrate」在长驻进程/测试/serverless 复用中并不罕见。框架级修复：`scheduler.setup()` 幂等化（先注销旧监听器或注册前判重），并给 `MonoStorage` 增加 `unlisten`。

---

## 三、重要问题（代码精读判定，高置信度，未逐一运行复现）

### R-1 `RealTime`：`nextRecomputeTime` 在 core 里可选，runtime 里强制非空调用

`src/core/RealTime.ts` L15 声明 `nextRecomputeTime?: Function`；`src/runtime/computations/RealTime.ts` L49/L112 在 callback 返回 `Expression` 时执行 `this.nextRecomputeTime!(now, dataDeps)`。合法的 core 声明（只给 Expression callback 不给 nextRecomputeTime）首次 compute 即 `TypeError`。L52/L115 的 `result.solve()!` 对无解情况同样无守卫。应在 handle 构造时校验并抛出带上下文的 `ComputationError`。

### R-2 Property 级聚合在 relation delete 时不复位 per-item bound state（与 global 路径不对称）

Global 各聚合 handle 的 delete 分支都带 CAUTION 注释并 `setInternal(record, false/0)`（filtered 成员资格退出时行还在，必须复位）；property 路径没有：`Count.ts` L241–251、`Summation.ts`、`Average.ts`、`WeightedSummation.ts`、`Any/Every.ts` 的 property delete 分支均只减不复位。filtered relation 成员退出再进入时 `replace()` 读到陈旧 state，delta 为 0，计数永久偏低。这是既有报告 S5 的延续，仍未修复，建议与 F-1/F-3 一起处理并抽取共享的 property-relation 增量模板（六个 handle 各复制了 ~80 行几乎相同的分支代码，已经漂移出这个不对称）。

### R-3 `PayloadItem` `isRef: true` 但未声明 `base` 时，guard 只检查 `.id` 为 truthy，不校验存在性

`src/builtins/interaction/Interaction.ts` L439–470：存在性校验依赖 `baseRecordName`，无 `base` 时任意伪造 `{id: '…'}` 直接通过 guard，由下游代码裸信任。建议在 `PayloadItem.create` 时强制 `isRef` 必须携带 `base`（显式控制原则），或至少在 guard 失败路径给出明确错误。

同类：`base` 为 Entity/Relation 且非 isRef 时（L512–515）只检查 `typeof item === 'object'`，payload 可注入任意字段形状。

### R-4 `GetAction` 的 `query.match` 完全由调用方控制，无 `dataPolicy` 时等于全表任意过滤读取

`Interaction.ts` L551–567：`dataPolicy.match` 只在声明时才 AND 收窄。这是设计使然，但对下游应用是一个安全 footgun——`userAttributives` 只控制「能不能调」，不控制「能看哪些行」。至少应在使用指南和 `agent/` 生成器文档中强制要求 Get 类 interaction 声明 `dataPolicy`。

### R-5 PGLite / MySQL 驱动 `update()`：拼了 `RETURNING` 的 `finalSQL` 只用于日志，实际执行的是 `sql`

`src/drivers/PGLite.ts` L121–134、`src/drivers/Mysql.ts` L102–115（PostgreSQL 驱动是对的，L283–296 执行 `finalSQL`）。当前 storage 调用方（`UpdateExecutor.ts` L245、`DeletionExecutor.ts` L146）忽略返回值所以尚未爆发，但接口契约已破损且日志与实际执行的 SQL 不一致，属于埋雷。顺带：MySQL 的 `RETURNING` 语法本身不成立，需要按驱动分派。

### R-6 boolean 跨驱动读写不一致

SQLite/MySQL 写入时 `false→0 / true→1`（列类型 `INT(2)`），PostgreSQL/PGLite 用原生 `BOOLEAN`；读取路径没有任何反向归一化。`if (record.isActive)` 在不同驱动下拿到 number 或 boolean，`Every/Any` 之类布尔计算与用户回调在 SQLite 下可能出现 `record.flag === true` 恒 false 的隐性错误。应在 storage 层按字段类型做读归一化。

### R-7 `createUserRoleAttributive`：把 name 字符串插值进 `new Function` 源码

`src/builtins/interaction/User.ts` L19–24。含引号的 name 直接语法错误，恶意构造的 name 是定义期代码注入。改为闭包捕获：`(user) => user.roles.includes(name)`（如需可序列化，用 `JSON.stringify(name)` 插值）。

### R-8 `asyncInteractionContext` 从未被建立

全仓库 grep 无任何 `asyncInteractionContext.run(...)`；四个驱动每条 SQL 都读它取 `logContext`（永远为空）。dispatch 只建立了 `dispatchExecutionContext` 和 `asyncEffectsContext`。要么在 `Controller.dispatch` 里真正 run 起来（把 `args.context` 传进去，日志关联能力立刻生效），要么删掉驱动里的死读取。

### R-9 migration 收尾与锁的两个次要缺陷

1. `Controller.migrate()` L464–493：SERIALIZABLE 事务提交（manifest 已写）之后 `scheduler.setup(false)` 若抛错，catch 会把 migration 标记为 `failed`，但库里已经是迁移完成状态，resume 语义混乱。`finishMigration('succeeded')` 应以 manifest 事务提交为准。
2. `MonoSystem.ts` L1382–1407：迁移锁是 SELECT-then-INSERT，两个进程并发时第二个得到的是不明所以的主键冲突而非清晰的「已在迁移中」。应直接 INSERT 靠主键冲突判定（捕获后转成友好错误）。

另外既有报告 #2（runtime review）指出的「SQLite/PGLite 单连接下并发 dispatch 事务交错」仍然成立：驱动声明了 `concurrentTransactions: 'unsupported'` 但 `Controller.dispatch` 没有据此串行化。建议在 MonoSystem 层对声明 unsupported 的驱动加 dispatch 互斥队列。

---

## 四、显著值得改进的地方

### 4.1 计算层（runtime/computations）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | 六个聚合 handle 的 property 增量分支为复制粘贴，已漂移 | `Count/Summation/Average/Any/Every/WeightedSummation.ts` | 各 ~80 行几乎相同的 relation create/delete/update 模板，差异（recordName 守卫、bound state 复位、try/catch）就是 R-2 这类 bug 的来源。抽取共享 helper 是一次性消除整类漂移的最高杠杆改进 |
| I-2 | 全局聚合 create 与 update 路径不一致 | `Count.ts` L76 vs L91、`Every/Any/WeightedSummation` 同 | update 路径带 CAUTION 注释重新 `findOne` 全量记录，create 路径直接用事件里的 record。当前因「默认值折叠进 create 事件 + 关系事件触发 fullRecompute」而大多自愈，但依赖 attributeQuery 嵌套数据的 callback 在 create 时刻仍可能看到不完整记录，且两条路径的不一致本身就是维护陷阱。建议 create 也统一 `findOne` |
| I-3 | `Average` 把 null 值计 0 且计入分母 | `Average.ts` L67–71 | 与 SQL `AVG`（忽略 null）语义相悖：`[100, null, null]` 得 33.3 而非 100。至少要文档化，建议改为 null 不计入 count；property 路径的 `resolveAvgField` 还缺 global 路径已有的 NaN/Infinity 守卫（L60 vs L212–218） |
| I-4 | `Custom.ts` 重复赋值、`Average.ts` 死函数 `setByPath` | L70–87 / L140–146 | 清理 |

### 4.2 storage 层

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-5 | 查询结果丢弃 SQL NULL 标量 | `QueryExecutor.ts` L112–114 | `value !== null` 才 set，调用方无法区分「没查这个字段」和「字段为 NULL」。应返回 `field: null` |
| I-6 | `RecordQueryTree.addRecord` 多段路径覆盖而非合并子树 | `RecordQuery.ts` L166–169 | 同一父节点下两个 match 分支（`leader.profile` + `leader.settings`）第一个分支被覆盖，可能丢 JOIN。长度为 1 的分支和 `merge()` 都是合并逻辑，仅此处不一致 |
| I-7 | `orderBy` 作用于扇出行、去重取首行 | `SQLBuilder.ts` L218–252 | 与 F-4 同根：按关联字段排序 + 扇出时代表行不确定。与 F-4 一起在「根查询两段式改写」中解决 |
| I-8 | JSON 反序列化裸 `JSON.parse`、批量 x:n 分组静默丢孤儿子记录、`LIMIT 0` 被当作无限制 | `QueryExecutor.ts` L109 / L382–415、`SQLBuilder.ts` L255 | 分别应抛带上下文的框架错误 / 记日志或抛错 / `limit !== undefined` 判断 |
| I-9 | N+1 与热路径复杂度 | `completeXToOneLeftoverRecords`（父记录 × 子查询）、`dedupeIdenticalRows` 每行全列 `JSON.stringify`、`NewRecordData` 任意字段变更重算全部 computed 字段 | 性能债，建议按 profiling 结果分期处理 |

### 4.3 core / builtins / 序列化

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-10 | 序列化往返不完整 | `Interaction.stringify` / `Payload.stringify` 未用 `uuid::` 编码嵌套实例；`PayloadItem.stringify` 丢 `itemRef`；`builtins/init.ts` 漏注册 `Attributives`/`ActivityGroup`/`Transfer`，`core/init.ts` 漏 `EventSource` | `stringifyAllInstances`/`createInstancesFromString` 对含 Activity 的完整应用图无法往返。若序列化是公开承诺（migration manifest 依赖函数文本哈希，间接相关），需要一次系统性的 round-trip 测试覆盖 |
| I-11 | `clone()` 语义不一致 | `EventSource/BoolExp/Dictionary/SideEffect/UniqueConstraint/Action` 等的 clone 走 `create()` 污染全局 registry，而 `Entity/Relation/Property.clone` 刻意不注册 | 统一为不注册（或提供 options 控制） |
| I-12 | `'program'` ActivityGroup 注册了但永远无法完成 | `ActivityCall.ts` L452–454 | `ProgrammaticActivityStateNode` 继承空 `onChange`，无人调用 `complete()`。要么实现、要么移除该类型 |
| I-13 | Attributive 异常被吞成拒绝，Condition 却透出错误信息 | `Interaction.ts` L328–333 vs L297–303 | 权限误配与真实拒绝不可区分，运维排障困难，建议至少记日志 |
| I-14 | 死代码/死 API | `Controller.callbacks`（只写不读）、`ExternalSynchronizer.ts` 空壳、`runtime/boolExpression.ts` 无人引用、`SQLBuilder.buildDeleteByWhereSQL`、`findPath` 的 `limitLength` 参数、`Activity.findRootActivity` 恒 null | 清理，减少表面积 |
| I-15 | `FrameworkError` 无 `causedBy` 时消息带 `"Caused by: undefined"` | `errors/FrameworkError.ts` L20–21 | 一行修复，但出现在所有对外错误消息里 |
| I-16 | `SystemConsoleLogger.child()` 丢弃 fixed 元数据 | `MonoSystem.ts` L1254–1256 | 与 R-8 一起修，日志上下文才真正可用 |

### 4.4 既有报告遗留项（仍有效，不重复展开）

`core-runtime-builtins-review.md` 的 S1（同批计算无拓扑排序）、S2（guard/afterDispatch 在 retry 边界内重放）、S3（global dict 变更触发 host 全表 `['*']` 扫描）、S4（`computeOldRecord` 对关联路径返回 `{...newRecord}` 占位，带 FIXME）、S8（migration bookkeeping SQL 局部拼接）——其中 S4 与本报告 R-2 相互放大，建议一并处理。

---

## 五、修复优先级建议

**P0（错误结果 / 应用不可用，全部有复现测试可直接转为回归测试）：**
1. F-1 Every 空集合语义（一行改动 + property 路径同步）
2. F-2 `['=', null]` → `IS NULL` + 文档操作符表修正
3. F-3 WeightedSummation 有限性守卫（对齐 Summation）
4. F-4 LIMIT/OFFSET 扇出分页（改动最大，需两段式查询设计）
5. F-5 `scheduler.setup()` 幂等化 + `MonoStorage.unlisten`

**P1（崩溃 / 安全 footgun / 驱动一致性）：**
R-1 RealTime 校验、R-2 property bound state 复位（借 I-1 模板抽取一起做）、R-3 `isRef` 强制 `base`、R-5 驱动 update() RETURNING、R-6 boolean 读归一化、R-7 `new Function` 注入。

**P2（可观测性 / 运维 / 债务）：**
R-8 asyncInteractionContext 接通、R-9 migration 收尾顺序与锁、R-4 GetAction dataPolicy 文档强制、I-5/I-6 storage 正确性小修、I-10 序列化往返、其余清理项。

---

## 附录：复现测试代码（验证时使用，未提交为正式测试）

以下测试在 `af49f80a` 上运行，PGLiteDB，结果如注释所示。修复时可直接改造为回归测试（断言改为正确语义）。

```ts
// F-1: Every notEmpty=true 空集合 → 实测 true（应为 false）
Dictionary.create({
  name: 'everyRequestHandled', type: 'boolean',
  computation: Every.create({
    record: requestEntity, attributeQuery: ['handled'], notEmpty: true,
    dataDeps: { threshold: { type: 'global', source: thresholdDict } },
    callback: (r: any) => r.handled,
  }),
})
await controller.setup(true)
await system.storage.dict.get('everyRequestHandled') // => true ❌

// F-2: ['=', null] → 实测 0 行（应为 1 行）
await system.storage.create('NUser', { name: 'alive' })            // deletedAt IS NULL
await system.storage.create('NUser', { name: 'gone', deletedAt: '2026-01-01' })
await system.storage.find('NUser',
  MatchExp.atom({ key: 'deletedAt', value: ['=', null] }), undefined, ['*']) // => [] ❌

// F-3: WeightedSummation undefined → 实测 total 为 null（应为 15）
// callback: (item) => ({ weight: 1, value: item.price })
await system.storage.create('WItem', { price: 10 })
await system.storage.create('WItem', {})          // price undefined → NaN
await system.storage.create('WItem', { price: 5 })
await system.storage.dict.get('total') // => null ❌

// F-4: 3 user × 3 匹配 team，limit 2 → 实测返回 1 个 user（应为 2）
await system.storage.find('PUser',
  MatchExp.atom({ key: 'teams.name', value: ['like', 'A-%'] }),
  { limit: 2 }, ['id', 'name']) // => 1 row ❌

// F-5: 重复 setup 后创建带 Transform 派生的源记录 → 实测抛错
await controller.setup(true)
await controller.setup(false)  // listeners: 2 → 4
await system.storage.create('Order', { amount: 42 })
// => ConstraintViolationError: duplicate key … "idx_transform_…" ❌
```
