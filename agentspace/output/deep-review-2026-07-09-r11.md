# 全代码库深度 Review 报告（2026-07-09 第十一轮）

- 日期：2026-07-09
- 基线：`main` @ `e447997a`（v2.0.2，r1–r10 的致命/重要修复全部落地）
- 范围：四路并行深度探查历史冷区——ScopedSequence/RealTime 全栈 / 并发·事务·异步生命周期（transaction、asyncContext、ComputationSourceMap）/ storage 读路径与表达式层（QueryExecutor、MatchExp 非 simpleOp 分支、objectstorage）/ builtins 执行链与 core 声明层（GetAction、序列化、Klass 注册表）
- 方法：与 r1–r10 报告**逐条去重** → 对每个致命/重要候选**编写最小复现测试实际运行**（PGLiteDB/SQLiteDB）。只有「已运行复现确认」的问题列为致命/重要；证伪或重新归类的候选明确记录（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1795 passed / 26 skipped。

> **维护说明（2026-07-09）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r11-5327`）全部修复。回归测试：`tests/runtime/review-fixes-2026-07-09-r11.spec.ts`（10 用例）+ `tests/runtime/review-fixes-2026-07-09-r11-serialization.spec.ts`（1 用例）+ `tests/storage/review-fixes-2026-07-09-r11.spec.ts`（6 用例）。顺带修正 2 处被新 fail-fast 暴露的既有测试（`queryDataInteraction.spec.ts` 的 data-on-non-get 用例改为断言声明期错误；`review-fixes-2026-07.spec.ts` 的 RealTime 守卫用例补占位 dataDep）。

---

## 一、结论摘要

经十轮修复，读写主路径、聚合增量、filtered/merged 编译、Activity 状态机、migration 已高度收敛。本轮在历史冷区找到的新致命项集中在两类：

1. **无终止的反应式反馈环**——计算写回重入 mutation listener 是反应式语义的主干，但十轮以来这条主干上**没有任何环路/深度守卫**：互相派生的 Transform、互相依赖的 dict 计算，声明期零告警、运行期无任何报错地挂起（实测 setup 挂满 120s 超时）或无限创建记录。
2. **引用同一性绑定的查询语义**——`resolve` 只在 `args.action === GetAction`（单例引用相等）时挂载。GetAction 的 uuid 每进程随机，序列化 round-trip 重建的 Action 对象必然 `!==` 单例；用户自建 `Action.create({name:'get'})` 同理——声明看起来是查询交互，dispatch 却静默返回 `data: undefined`。
3. 另有 r10 F-3 的直接延伸：json 列的 `in`/`not in` 与 `=`/`!=` 同病（写路径序列化、匹配参数裸绑定），PGLite 裸报数据库错误、SQLite 直接崩（数组参数被展开成多余绑定参数）。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 3 | 计算传播环无守卫、GetAction 引用同一性绑定、json IN/NOT IN 断裂 |
| 重要（已复现，已修） | 4 | 见第三节 |
| 证伪/重新归类 | 4 | 见第五节 |
| 重要（精读/探查，高置信度，未修） | 8 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 计算传播无环路/深度守卫：循环依赖声明 → 无报错的死循环/无限增长

- 位置：`src/runtime/Scheduler.ts` `buildComputationMutationListener`（计算写回 `applyResult/applyResultPatch` → `callWithEvents` → `dispatch` → 同一 listener 同步重入，无 visited/depth/批次延迟任何机制）；`src/runtime/ComputationSourceMap.ts` `initialize`（自引用 dataDep 无声明期校验）。
- 复现（实测输出）：

```
// 互相派生的 Transform：Entity A 由 B 派生，B 由 A 派生
create('A', {label:'seed'}) → 回调无限执行（测试用 30 次上限抛错才终止）  ❌ 无守卫
// 互相依赖的 dict：X 依赖 Y、Y 依赖 X（或 X 依赖自身）
controller.setup(true) → 挂满 120s 测试超时，无任何报错                  ❌ setup 死锁
```

- 影响：AGENTS.md 只有一句 "Avoid circular computation dependencies" 的提醒；migration 有静态环检测（`migration.ts` L2216）但只在迁移期生效。运行期一旦命中：Transform 环 = 每跳创建新记录（事务内无限增长直至 OOM/参数上限），dict 环 = 无限重算挂起。与 r10 F-1（空 ActivityGroup 死锁）同族——「类型系统接受但运行时死锁」，且这条比 Activity 更隐蔽：跨实体的派生链在大模型里靠人工审查几乎不可能发现。
- 修复（双层）：
  1. **声明期**：dict 计算把自己的输出声明为 global dataDep（直接自引用）在 source-map 初始化时抛 `ComputationProtocolError`（指引改用 `useLastValue`/`GlobalBoundState`）；
  2. **运行期**：mutation listener 用 `AsyncLocalStorage` 记录传播深度（并发事务互不串扰），超过 `Scheduler.MAX_COMPUTATION_PROPAGATION_DEPTH`（100，对合法深链留充足余量）时抛出带最近传播轨迹（最近若干个计算名）的 `SchedulerError`。间接环（X→Y→X、Transform 互相派生）由此层兜住。
  3. 正向回归：合法的两跳链（Transform 派生 + 计数）无误报。

### F-2 json/collection 列的 `IN` / `NOT IN`：与 r10 F-3 的 `=`/`!=` 同病，且 SQLite 上直接崩

- 位置：`src/storage/erstorage/MatchExp.ts` `getFinalFieldValue` 的 `in`/`not in` 分支（元素参数原样绑定）；对照写路径 `SQLBuilder.prepareFieldValue`（一律 `JSON.stringify`）。
- 复现（实测输出）：

```
Property.create({ name:'tags', type:'string', collection:true })
find('Doc', MatchExp.atom({ key:'tags', value:['in', [['alpha','beta']]] }))
→ PGLite: error: operator does not exist: json = unknown        ❌ 裸数据库错误
→ SQLite: RangeError: Too many parameter values were provided   ❌ 数组参数被 better-sqlite3 展开，直接崩
```

- 影响：r10 F-3 修了 `=`/`!=` 后，「按快照集合查 json 列」的下一个自然写法（`in`）仍然全链路断裂，且 SQLite 上是崩溃而非零命中。
- 修复：与 r10 F-3 同一治理模板——`MatchExp` 对 json 字段的 `in`/`not in` 先给驱动方言机会、否则退化为与写路径一致的逐元素序列化文本比较；PG/PGLite `parseMatchExpression` 新增逐元素 `::jsonb` 语义比较（键序不敏感），MySQL 新增 `CAST(? AS JSON)`。NULL 行不参与匹配（与 `=`/`!=` 一致）。空数组的恒 false/true 表达式对 json 列避开 `IN (NULL)`（PG 系会触发 json 比较操作符）。PGLite/SQLite 双驱动 + 空数组回归用例。

### F-3 GetAction 按引用同一性绑定 resolve：round-trip / 自建 'get' Action 的查询交互静默返回 undefined

- 位置：`src/builtins/interaction/Interaction.ts` L172（`if (args.action === GetAction)`）；`src/builtins/interaction/Action.ts` L87（`GetAction = Action.create({name:'get'})`，uuid 每进程随机）。
- 复现（实测输出）：

```
// 形态一：用户自建同名 Action
Interaction.create({ action: Action.create({name:'get'}), data: Post, dataPolicy: ... })
dispatch → { error: undefined, data: undefined }                ❌ 声明形似查询、静默无数据

// 形态二：graph round-trip（uuid 保留但对象重建）
stringifyAllInstances → clearAllInstances → createInstances
→ restored.action.uuid === GetAction.uuid 为 true，restored.resolve === undefined  ❌ resolve 静默丢失
```

- 影响：形态二意味着**任何**经过序列化管线（migration manifest、代码生成、跨进程传输）的查询交互都会静默失去查询能力——r8 已把 Payload/DataPolicy/EventSource 纳入 round-trip 治理，但 GetAction 的单例身份从未被审视。形态一是 r7 I-10（data/dataPolicy 挂非 get action 静默失效）的对偶：get 形状的 action 也可以静默失效。
- 修复：查询语义按 `action.name === 'get'` 识别（名字是序列化中稳定的身份，引用不是）；并把 r7 I-10 一并收口——`data`/`dataPolicy` 挂在非 get action 上声明期 fail-fast。既有测试 `queryDataInteraction.spec.ts` 的「非 GetAction 不返回数据」用例改为断言声明期错误（该用例此前固化的正是静默失效行为）。round-trip 回归：反序列化后的 get 交互 `resolve` 正常重建。

---

## 三、重要问题（已复现，本轮已修复）

### R-1 Controller 同名 eventSource：静默后写覆盖先写

- 位置：`src/runtime/Controller.ts` L190–195（`eventSourcesByName.set` 无重复检测）。
- 复现：两个同名 Interaction（不同守卫链）注册进同一 Controller → `findEventSourceByName` 只命中最后注册者，先注册者的 guard/权限链从此不可达，零告警。Activity 名重复（`ActivityManager` L79）与 entity/relation 名重复（`Setup.ts`）早有 fail-fast，eventSource 是最后一个无守卫的注册表。
- 修复：构造期对「不同实例、相同名字」抛错；同一实例重复注册保持合法。Activity 内的 interaction 以 `activity:interaction` 作用域名注册，不受影响。

### R-2 零触发的 RealTime 计算：声明合法、callback 永不执行、property 形态静默持久化 0

- 位置：`src/runtime/computations/RealTime.ts`——property 形态无 `attributeQuery` 且无 `dataDeps` 时 `dataDeps={}`，注册不出任何监听；`getInitialValue()` 返回 0 被宿主 create 监听持久化。global 形态同理（值永远停在 null）。
- 复现：纯时间驱动的 property RealTime（只有 `nextRecomputeTime` + `callback`）→ 实测 `callbackRuns === 0`、`liveSeconds === 0` 永不变化。
- 背景：时间驱动的重算调度器尚未实现（r3 R-5 遗留，`nextRecomputeTime` 只被记录、无消费方）——纯时间驱动形态是「声明合法、永不可用」的死配置，且 property 形态还主动写入误导性的 0。
- 修复：两个 handle 构造期 fail-fast，错误信息明确说明「时间调度未实现，需声明 attributeQuery/dataDeps」。调度器落地后此校验应放宽。

### R-3 操作符大小写：`['LIKE', ...]` 落入内部 assert

- 位置：`src/storage/erstorage/MatchExp.ts` L226–229——simpleOp 表精确匹配小写 `'like'`，而 `in`/`not in`/`between` 早已 `toLowerCase()`，口径不一致。大写 `LIKE` 穿透到末尾 `assert(result, 'unknown value expression ...')`。
- 复现：`value: ['LIKE', '%hello%']` → `Error: unknown value expression ["LIKE","%hello%"]`。
- 修复：simpleOp 统一按小写归一识别；大小写 LIKE 双回归。

### R-4 `between` 操作数不校验：畸形值裸 TypeError

- 复现：`value: ['between', 25]` → 深入 `value[1][0]` 抛裸错。`in` 早有 `Array.isArray` 守卫（r5 I-1），`between` 漏了。
- 修复：非两元数组给出带指引的受控错误；合法 between 正向回归。

---

## 四、重要问题（探查/精读判定，高置信度，本轮未修）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | **`storage.listen` 的用户回调在事务提交前执行**：dispatch 后续失败回滚时，框架内监听的写入随事务回滚，但用户回调已产生的外部副作用（webhook、日志、消息队列）不会 | `MonoSystem.ts` `callWithEvents` L1146–1171（listener 在 `runInTransaction` 内同步 await）对照 `Controller.ts` L734+（`RecordMutationSideEffect` 明确 post-commit） | 需要外部副作用的场景应使用 `RecordMutationSideEffect`（post-commit 语义有测试固化）。建议在知识库明确「listen = 事务内、可能随回滚作废；SideEffect = 提交后」的契约分工 |
| I-2 | 同一 source 的多条 records dataDeps：一次 mutation 每个 dep 各触发一次 incrementalCompute（本轮实测同一 create 事件双跑、计数翻倍） | `ComputationSourceMap.ts` L151–154 每 dep 独立注册；`Custom.ts` L218–222 注释确认「任何已声明 dataDep 的事件都会走到 incrementalCompute」是既定契约 | 契约成立但极易踩坑：用户可按 `event.dataDep` 区分来源，但这一点只存在于源码注释。建议知识库 Custom 增量一节明确「每 (dataDep, event) 一次调用」并给出去重范式；对**完全相同**的 dep 声明（同 source 同 attributeQuery 同 match）可考虑注册期去重 |
| I-3 | `RecordMutationCallback` 返回的 `{events}` 被累积进 effects 但**从不回喂 listener**：监听器合成的事件不会触发任何计算 | `MonoSystem.ts` `dispatch` L1205–1213（`newEvents` 只 push 不再 dispatch）；`System.ts` L10 类型契约允许返回 events | 仓库内无消费方（死 API）。要么实现回喂（需接入 F-1 的深度守卫），要么从类型契约中移除返回值，避免下游按契约实现后静默失效 |
| I-4 | `RecordMutationSideEffect` 对 effects 里**所有**事件触发（含计算驱动的 update、bound-state 列写入），不区分业务写入 | `Controller.ts` `runRecordChangeSideEffects` L779+ | 对 `User` 声明的副作用会被 `likeCount` 这类计算列更新触发，外部 IO 次数放大。与 r5 R-8（同名结果覆盖）正交。建议文档化或提供事件过滤声明 |
| I-5 | `isRef` payload 守卫只做存在性校验（按 id `findOne`），无行级授权：能通过 user 门槛的调用方可以引用该实体的**任意**存量 id | `Interaction.ts` L458–474 | 行级授权的正确出口是 attributive/DerivedConcept base，但「裸 Entity base + isRef = 存在即通过」这一点未在知识库风险提示。属 r7 I-14 弱校验族的安全切面，建议文档显式警告 IDOR 形态 |
| I-6 | ScopedSequence `allowManualValue`：手工值不推进计数器（`scopedSequence.spec.ts` 已固化该语义）——手工值落在自动分配区间内时，后续自动分配产生重复序号；无 UniqueConstraint 时是静默重复 | `computations/ScopedSequence.ts` L54–58；`MonoSystem.ts` `nextSequenceValue` | 语义是深思后的选择（导入历史高位号不应跳空自动区间），但安全网只有「建议声明 UniqueConstraint」的惯例。建议声明期要求（或强烈建议）宿主对 scope+serial 声明 UniqueConstraint，或文档明确风险 |
| I-7 | ScopedSequence scope path 若读取「create 载荷之外、由 reliance/link 后置合并的字段」，分配时读到的是 create 事件的早期快照 → `scope is missing` 或错误 scope | `CreationExecutor.ts` L180–188（事件快照先于 reliance 合并）；`Scheduler.ts` L344 传 `mutationEvent.record` | 中高置信度（事件时序已核实、现有测试全部把 scope 字段放在 payload）。建议文档明确「scope 字段必须在 create 载荷内」或对缺失字段给出指向该约束的错误 |
| I-8 | Klass `static public.*.constraints` 是死元数据：如 `Entity.public.properties.constraints.eachNameUnique` 从不在 `create()` 执行，重复属性名的实体声明成功、错误延迟到 storage 深处 | `Entity.ts` L76–80 对照 `create()` L133+ | r7 I-13（未知参数静默丢弃）的姊妹项：已知约束也不执行。建议 `createClass` 层统一执行 public.constraints，一次性根治 |

另有低优先级项（本轮探查发现、影响面小）：`objectstorage/objectStorage.js` 将 `rawFileName` 直传应用的 `makePath`（信任边界未文档化）；批量 1:n 分组用原始 `Map` 键（父子 id 类型分歧时静默丢子行，现实触发面窄，可用 `String()` 归一化根治）；`dataPolicy.modifier` 只在声明 `limit` 时锁定调用方分页键（r7 F-3 的残余语义，policy 只声明 orderBy 时不构成可见范围约束）。

## 五、本轮证伪/重新归类的候选

| 候选 | 结论 |
|------|------|
| 「`initializeFrom.scope[].path` 与声明 scope 的 path 不一致 → 迁移种子错桶」（ScopedSequence 探查） | 证伪：initializer 的 path 映射进的是 `initializeFrom.record`（历史遗留实体）的字段，与运行期宿主 scope path 本就应当不同，跨记录的路径等价性无法也不应静态校验 |
| 「GetAction 单例不在序列化 blob 中 → 反序列化抛 Cannot resolve reference」 | 重新归类：fail-closed 的正确行为（引用完整性校验），非 bug；真正的问题是 blob 完整时 resolve 仍丢失，已作为 F-3 修复 |
| 「property RealTime 首次 create 持久化错误的 0」（RealTime 探查 #4） | 归并进 R-2：根因是零触发死配置，fail-fast 后该形态不再可声明；有 attributeQuery/dataDeps 的形态首次 create 会执行 compute，无此问题 |
| 「Activity 首步 guard 不接 `checkUserRef`」（builtins 探查 #6） | 与 r8 §四已记录项重复，去重剔除 |

## 六、既有遗留项复确（r2–r10 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4 I-1）；`!=` 三值逻辑；dispatch 先持久化事件再 resolve（r9 I-2）；守卫非 boolean truthy 放行（r9 I-4）；payload 弱校验族 / `userRef`/`itemRef` 死 API（r7）；StateMachine 单事件单跳（r7 I-8）；同批 property 计算无拓扑序（r7 I-9）。
- **性能/资源**：global dict 变更宿主全表扫描；async task 表只增不减；级联无深度上限（注：F-1 的传播深度守卫覆盖了其中「计算传播」一翼，storage 级联删除仍无上限）；迁移锁无租约。
- **并发**：activity `refs` 无版本 read-modify-write（r5 I-12）。
- **migration**：rename = remove+add（r9 I-3）；I-1/I-2（r10 未修项：迁移阶段顺序、merged input 移除孤儿数据）仍在。
- **时间调度**：`nextRecomputeTime` 无消费方（r3 R-5）——R-2 的 fail-fast 使这一缺口从「静默」变为「显式」，实现调度器后应放宽。

## 七、修复优先级建议（遗留项）

1. **I-1 `storage.listen` 事务语义文档化**——外部副作用误挂 listen 是数据一致性事故的直接来源，一段知识库文档即可消除；
2. **r10 I-1 迁移阶段顺序**（连续两轮位居榜首的未修项）——唯一可能产出「静默错误聚合值」的已知路径；
3. **I-8 public.constraints 统一执行**——与 r7 I-13 合并做一次 `createClass` 层的声明校验收口，能同时消灭一族「声明期静默接受」问题；
4. I-2/I-3/I-4 事件契约收口（Custom 多依赖触发口径、listener 返回值死 API、SideEffect 触发面）——同属「mutation 事件消费契约」，适合一轮集中治理；
5. I-6/I-7 ScopedSequence 使用面防护（改动小，文档为主）。

## 附录：复现要点（验证用）

- F-1：互相派生的 Transform → `create` 应抛 `propagation exceeded the maximum depth`；dict 自引用 dataDep → setup 应抛 `references the computation's own output`；X→Y→X 间接环 → setup 应抛深度错误；合法两跳链不误报。
- F-2：collection 属性 `['in', [['alpha','beta']]]` → PGLite/SQLite 均应正确命中快照；`not in` 排除且 NULL 行不参与；空数组恒 false/true。
- F-3：`Action.create({name:'get'})` + data → dispatch 应返回数据；data 挂非 get action → 声明期错误；round-trip 后 `resolve` 应存在。
- R-1：两个同名 eventSource → Controller 构造期抛 `Duplicate eventSource name`。
- R-2：无 attributeQuery/dataDeps 的 RealTime（property/global）→ 构造期错误。
- R-3/R-4：`['LIKE','%x%']` 应正常命中；`['between', 25]` 应抛 two-element array 错误。
