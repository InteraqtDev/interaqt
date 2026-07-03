# interaqt 深度 Review 报告（2026-07）

> 目标：理解 interaqt 的后端响应式数据设计目标，找出致命 bug、架构缺陷，并给出可落地的架构/实现改进方案，为项目质量的大提升提供路线图。
>
> 方法：对 `src/core`、`src/runtime`、`src/storage`、`src/builtins`、`src/drivers` 五层做了逐层代码走读，所有关键结论均已在源码中人工复核（带文件+行号）。

---

## 0. 设计目标的理解

interaqt 的核心命题是：**后端数据不该被"命令式地更新"，而应被"声明式地定义"**。

- 唯一的数据入口是 `Controller.dispatch(eventSource, args)`，产生事实（event record）。
- 所有派生数据（Count/Summation/StateMachine/Transform 等）由 Scheduler 监听 mutation events 在**同一事务内同步级联重算**。
- 事务边界清晰：guard → mapEventData → event create → resolve → 同步计算 → afterDispatch 都在一个可重试事务内；postCommit / RecordMutationSideEffect 在提交后执行。

这个模型的价值主张成立，且事务边界的文档化（`Controller.ts:582-592`、README）是当前代码库中做得最好的部分之一。**但实现层存在多处会直接破坏"自动一致性"这一核心承诺的 bug**——对一个以"framework 保证一致性"为卖点的项目，这些是最高优先级问题。

---

## 1. 致命 Bug（P0：破坏核心承诺或安全）

### P0-1 Activity Gateway 图构建完全失效

`src/builtins/interaction/activity/ActivityCall.ts:230-240`

```typescript
if (Gateway.is(sourceNode)) {
    (sourceNode as GatewayNode).next.push(targetNode)
} else {
    sourceNode.next = targetNode
}
```

`sourceNode` 是 `GraphNode`（含 `content` 字段），而 `Gateway.is()` 检查的是 `obj._type === 'Gateway'`（`Gateway.ts:69-71`）。GraphNode 没有 `_type`，**该判断恒为 false**。后果：

- Gateway 的 fan-out/fan-in（`next: []` / `prev: []`）逻辑从未执行过。
- 同一 source 发出多条 transfer 时，`sourceNode.next = targetNode` 相互**覆盖**而非追加——静默丢失分支。
- 附带：`ActivityCall.ts:225-226` 引用的 `rawGatewayToNode` 从未 populate（gateway 实际注册在 `rawToNode`），且 `ActivityCall.ts:229` 的 assert 消息把 target 写成了 `transfer.source.name`。

**修复**：判断应基于 `Gateway.is(sourceNode.content)` 或给 GatewayNode 加类型标记；同时补充多分支 Activity 的测试（当前测试全部是单链路，所以没暴露）。

### P0-2 Payload 校验提前 return，跳过后续所有字段校验（安全问题）

`src/builtins/interaction/Interaction.ts:350-351`

```typescript
const payloadItem = payload[payloadDef.name!];
if (payloadItem === undefined) return;   // ← 应为 continue
```

在 `for (const payloadDef of payloadDefs)` 循环内，第一个**可选且未提供**的字段会让整个 `checkPayload` 直接返回——排在其后的所有字段的 `isRef`/`isCollection`/`base` concept 校验全部被跳过。攻击者只需让一个可选字段缺席，即可绕过后续字段的结构校验。一行修复（`return` → `continue`），但必须补测试。

### P0-3 权限求值链存在两处"默认放行"陷阱

1. **`BoolExp.evaluate`（同步版）不处理 Promise**（`src/core/BoolExp.ts:387-395`）：`AtomHandle` 类型允许返回 `Promise<boolean|string>`，若 async handle 被传入同步 `evaluate`，Promise 对象为 truthy → **权限误判为通过**。当前框架内部路径均用 `evaluateAsync`，但这是公开 API，用户自定义 guard 一踩即中。应在 `evaluate` 中检测到 thenable 直接抛错。
2. **`checkConcept` 几乎恒为 true**（`Interaction.ts:400-427`）：`DerivedConcept.attributive` 分支两侧代码完全相同（attributive 被忽略）；Entity 校验只检查 `typeof instance === 'object'`。`PayloadItem.base` 给用户的预期是"校验 payload 符合该实体约束"，实际几乎不校验任何东西。要么实装，要么在文档/类型上明确降级为 hint。

### P0-4 级联计算无环检测、无深度限制

`MonoSystem.ts:1112-1173` + `Scheduler.ts:371-387`：computation 写回 fact → 嵌套 `callWithEvents` → 同步触发下游 computation，**深度优先递归展开，没有任何环检测或最大深度**。用户声明 A 依赖 B、B 依赖 A（或经由 Transform 写出触发自身的记录）时，结果是单事务内死循环 / stack overflow，错误信息完全无法定位到"计算图有环"。

migration 路径有 cycle 检测（`migration.ts:2156`），runtime 没有——建议在 setup 时对 computation 静态依赖图做环检测（静态 source map 已经具备全部信息），runtime 再加一道 depth guard 作为兜底。

### P0-5 驱动层：SQLite 自增 ID 的 SQL 拼接 + 读改写竞态

`src/drivers/SQLite.ts:10-19`

```typescript
const lastId = (await this.db.query(`SELECT last FROM _IDS_ WHERE name = '${recordName}'`, ...))[0]?.last
const newId = (lastId || 0) + 1
await this.db.scheme(`INSERT INTO _IDS_ (name, last) VALUES ('${recordName}', ${newId})`, name)
```

- `recordName` 直接拼进 SQL（MySQL 驱动同病，`Mysql.ts:10-17`）。虽然 recordName 来自开发者定义的 entity 名（受 `[a-zA-Z0-9_]+` 约束），不算直接注入面，但违背了全库其余部分的参数化纪律。
- SELECT→+1→UPDATE 非原子。SQLite 声明 `concurrentTransactions: 'unsupported'` 算是自洽，但没有任何 runtime 强制，多连接下会分配重复 ID。应改为 `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` 的原子 UPSERT。

### P0-6 PGLite/MySQL 驱动 `update()` 构造了 `finalSQL`（RETURNING）却执行了原始 `sql`

`src/drivers/PGLite.ts:121-134`

```typescript
const finalSQL = `${sql} ${idField ? `RETURNING "${idField}" AS id`: ''}`
logger.info({ type:'update', name, sql: finalSQL, params })
return (await this.db.query(sql, params)).rows as T[]   // ← 执行的是 sql，不是 finalSQL
```

日志与实际执行不符（调试时会严重误导），且任何依赖 update 返回 id 的调用方拿到空数组。当前 `UpdateExecutor.ts:217` 恰好忽略返回值所以未爆雷——这是**潜伏 bug**，一旦有调用方开始使用返回值即成事实 bug。MySQL 驱动同样问题（`Mysql.ts:100-113`，且 MySQL 根本不支持 RETURNING）。

### P0-7 增量计算拿到的 `oldRecord` 可能是"新值的副本"

`src/runtime/Scheduler.ts:440-446`

```typescript
computeOldRecord(newRecord: any, sourceMap: DataBasedEntityEventsSourceMap, mutationEvent: RecordMutationEvent) {
    // FIXME 理论上我们现在不需要 computeOldRecord 了。
    if(!sourceMap.targetPath?.length) {
        return mutationEvent.oldRecord
    }
    return {...newRecord}   // ← 关联路径上，oldRecord = 新值副本
}
```

当依赖经由关系路径（targetPath 非空）时，传给增量计算的 `oldRecord` 就是 newRecord 的浅拷贝。任何依赖 old/new 差值的增量逻辑（match membership 判断 entered/left、Summation 差量等）在这条路径上**语义上就是错的**。目前靠 `buildDataDepEventContext` 里对不确定场景 fallback 到 fullRecompute 兜底，但这既是正确性风险又是性能黑洞。这是响应式引擎的核心数据契约问题，见 §3.2。

### P0-8 Update mutation event 的 `record` 在 DB 写入前生成、且不完整

`src/storage/erstorage/RecordQueryAgent.ts:103-118`：update 事件的 `record` 是"用户提交字段 + oldRecord id"的合成物，在 DB write 之前 push，不含 reliance/关联更新后的最终态；纯关系变更时甚至没有 entity update 事件。响应式引擎的全部正确性都建立在 mutation event 的 old/new 快照准确之上——这一层不牢，上层全部增量计算都在沙地上。与 P0-7 是同一个根因的两个表现。

---

## 2. 高危 Bug（P1）

| # | 问题 | 位置 | 后果 |
|---|------|------|------|
| P1-1 | Activity 状态推进是 read-modify-write，无版本号/CAS | `ActivityCall.ts:362-367`（state）、`370-389`（refs） | 并发 dispatch 同一 activity（如 responseGroup 'any' 下 approve/reject 同时到达）互相覆盖状态；refs 写入可能丢失。事务隔离只在 SERIALIZABLE 重试路径下偶然兜住 |
| P1-2 | `AnyActivityStateNode.onChange` 返回的分支过滤对象无人消费 | `ActivityCall.ts:415-426` | XOR 分支选中后其他 child seq 未被取消；多步 branch 的 activity 行为错误。当前测试的 branch 都只有一步所以没暴露 |
| P1-3 | 未知 `ActivityGroup.type` → `new undefined()` TypeError | `ActivityCall.ts:131-133` | 应在 create/setup 时校验并给出清晰错误；`'program'` 类型 group 永不自动完成也无文档说明 |
| P1-4 | 同一 mutation 可多次触发同一 computation | `ComputationSourceMap.ts:107-110` + `Scheduler.ts:375-384` | 每个 dataDep 独立生成 source map，无 per-(computation,event) 去重；non-primary dep 触发 fullRecompute，可能一次事件 = 1 次增量 + N 次全量重算。性能问题 + 结果依赖执行顺序 |
| P1-5 | 异步计算（ComputationResultAsync）无自动完成机制 | `Scheduler.ts:1062-1064`、`890-942` | task 记录创建后必须由应用层手动调 `handleAsyncReturn`，否则 computed 值永远 pending；且 stale 判断依赖 id 单调递增（`orderBy id DESC`），PGLite 的 UUIDv7 勉强满足，换驱动即坏 |
| P1-6 | Attributive 异常被静默吞掉 | `Interaction.ts:298-300`、`ActivityCall.ts:405-407` | `catch (_e) { result = false }`——权限拒绝但零日志零上下文，运维/调试黑洞；且与 Condition 的处理（返回错误字符串进 GuardError）行为不一致 |
| P1-7 | `checkUserRef` 在 refs 缺失时裸 TypeError | `ActivityCall.ts:392-396` | `refs[attributive.name!]` 上 refs 可为 undefined，抛的是 TypeError 而非 InteractionGuardError |
| P1-8 | MySQL `transactions: false` 但 README 列为 production driver | `Mysql.ts:29-30` vs README | dispatch 在 MySQL 上直接 `TransactionCapabilityError`。要么实现 transaction-bound connection，要么从 production 支持列表移除 |
| P1-9 | Global dict 变更触发宿主实体全表重算 | `Scheduler.ts:451-464` | property 计算依赖 global dict 时，dict 一次更新 = `find(host, id not null, ['*'])` 全表 + 逐条重算。大表下单次 dispatch 事务被无限拉长 |
| P1-10 | Filtered entity 跨实体依赖的 membership 传播不完整 | `FilteredEntityManager.ts:165-168` | 只有 base entity 直接 update 且 changedFields 命中 dependency attributes 才重估 membership；经由关联实体变化影响 filter 结果的场景漏更新 |

---

## 3. 架构缺陷（与"大提升"直接相关）

### 3.1 全局静态 Klass 注册表 —— 最深的结构性负债

**现状**：所有领域概念用 `static instances` 全局数组注册（30+ 个类），`Entity.create` push、永不释放（`Entity.ts:132-142`）。而 runtime 为了不 mutate 用户定义，用 `RefContainer` 克隆整个 schema 图——但 `Entity.clone()` 内部调用 `Entity.create()`（`Entity.ts:166-178`），**每次 `new Controller` / `setup()` 都向全局注册表追加一整套新实例**。

后果链：

1. **内存泄漏**：长驻进程反复 setup（测试、热重载、多租户）时 instances 无界增长。
2. **跨实例污染**：`ScopedSequence.deserializeEntityRef`（`ScopedSequence.ts:75-83`）等逻辑用 `Entity.instances.find(...)` 全局查找,多 Controller 时可能绑定到错误代际的实体。
3. **测试脆弱**：依赖手动 `clearAllInstances(...)` 且要枚举所有 Klass,漏一个就是诡异的 duplicate uuid。
4. **序列化断裂**：`stringifyAttribute` 生成 `uuid::` 引用但 `createInstances`（`utils.ts:115-129`）不解析它们;`Property.stringify` 丢 `computation` 字段（`Property.ts:100-109`）;`Entity.stringify` 未走 stringifyAttribute,循环引用直接 JSON.stringify 崩溃。**toData/fromData 这条声称支持的路径实际无法 round-trip**。另外 `Attributive.parse` 用 `new Function('return ' + code)` 反序列化即任意代码执行,必须在文档标注信任边界。

**改进方案**：引入 `SchemaRegistry` 实例（由 Controller 持有），`Klass.create` 保持兼容但注册行为收敛到 registry；`clone` 走 `{ register: false }` 路径；所有 `X.instances.find()` 改为经 registry 查找。这是一次侵入面较大但机械性强的重构，能同时解决泄漏、隔离、序列化三个问题域。

### 3.2 Mutation Event 契约不严谨 —— 响应式引擎的地基问题

响应式引擎的一切正确性建立在"每次 mutation 产出准确的 `{type, recordName, record, oldRecord}`"之上。当前有三处松动（P0-7、P0-8、`shouldTriggerUpdateComputation` 里对部分字段快照的 hasOwnProperty 补丁 `ComputationSourceMap.ts:205-209`）。散落各处的 fallback-to-fullRecompute 和 `{...newRecord}` 都是对这个契约缺失的补偿。

**改进方案**：把 mutation event 定义为一等公民契约——

1. update 事件在 **DB write 完成后**生成，`record` 为写后完整快照（或至少含全部被计算依赖的字段），`oldRecord` 为写前快照。UpdateExecutor 反正已经为 update 做了全量 find（`UpdateExecutor.ts:47-55` 的 FIXME），快照数据是现成的，只是没有接到事件上。
2. 删掉 `computeOldRecord` 这类"猜测"逻辑，关联路径上的 old/new 由事件自身携带的准确快照推导。
3. 给事件契约写 property-based 测试（任意 mutation 序列后，增量计算结果 === 全量重算结果）。这是整个框架最值得投入的一类测试。

### 3.3 计算调度：无 DAG、无去重、深度优先递归

当前调度 = 静态 source map 查表 + 注册顺序 + phase(0/1/2) + 嵌套 `callWithEvents` 深度优先展开。没有：

- 计算间拓扑排序（依赖只能靠 phase 手工分层）；
- 同一事务内 per-(computation, dirty record) 去重/合并（同一 record 被多次 update 就多次重算）；
- 环检测（P0-4）。

**改进方案**：setup 时基于 dataDeps/eventDeps 构建显式计算 DAG（信息已齐备），做环检测 + 拓扑序；runtime 把"立即递归执行"改为**事务内微批队列**——mutation events 入队，按拓扑序批量出队执行,天然获得去重、合并与确定性顺序。这是本报告中对"质量大提升"杠杆最大的单项改造：同时解决 P0-4、P1-4、级联顺序不确定性,并为后续的批量优化（如同 record 多事件合并）铺路。

### 3.4 存储层性能：N+1、update 放大、零索引

- **x:n 查询 N+1**：`QueryExecutor.ts:215-229` 对每个 parent 逐条二次查询,递归展开。100 parent × 3 层 = 数百条 SQL。应改为 `WHERE parent_id IN (...)` 批量加载后内存装配。
- **update 读放大**：`UpdateExecutor.ts:47-55` 自带 FIXME,每次 update 全量拉取关联树。应按需查询（本次 update 涉及的字段 + 计算依赖的字段）。
- **零自动索引**：无 FK 约束（可接受,应用层管理）但也无任何自动索引——junction 表的 source/target 列、合表 FK 列全部裸奔,关系查询全表扫描。框架完全知道哪些列会被 JOIN,setup 时自动建索引是纯收益。
- **Modifier 的 limit/offset 直接插值**（`SQLBuilder.ts:236-241`）：TypeScript 类型是 number,但 runtime 无校验,JS 调用方传字符串即注入面。加 `Number.isInteger` 校验即可。

### 3.5 God Class 与层内耦合

`Controller.ts`（745 行）同时承担 dispatch、applyResult、migration、manifest；`Scheduler.ts`（1225 行）承担 handle 注册、source map、增量协议、async task、data dep 解析。此外还有一批死代码/未接线的 API 侵蚀可信度：`Controller.addEventListener`（`Controller.ts:734-738`,callbacks 从未被读）、`MonoStorage.dispatch` 的注释掉的异步机制（`MonoSystem.ts:1119-1122`）、空壳 `ExternalSynchronizer.ts`、`rawGatewayToNode` 死变量。**framework 中每个不工作的公开 API 都是负资产,应删除或实装**。

### 3.6 可扩展性天花板

- 单进程 MonoSystem,listener 链同步 await,慢 computation 阻塞整个 dispatch。
- postCommit / side effects 失败仅记录不重试,无 outbox——README 提到 "outbox enqueueing" 但框架不提供任何 outbox 设施。建议提供内置 outbox 表 + 至少一次投递语义,把"事实提交"与"外部副作用"解耦,这与框架的事件溯源气质天然契合。
- 异步计算需要内置 worker/poller（哪怕是简单的 `controller.processAsyncTasks()` 循环）,而不是把 `handleAsyncReturn` 完全推给用户。

---

## 4. 改进路线图（按杠杆排序）

### 第一波：止血（小改动、高确定性）
1. `checkPayload` 的 `return` → `continue` + 测试（P0-2）。
2. Gateway 图构建修复 + 多分支 Activity 测试（P0-1,顺带 P1-2/P1-3）。
3. PGLite/MySQL `update()` 执行 `finalSQL`;SQLite/MySQL `getAutoId` 参数化 + 原子 UPSERT（P0-5/P0-6）。
4. `BoolExp.evaluate` 检测 Promise 抛错;Attributive 异常接入 logger（P0-3/P1-6/P1-7）。
5. runtime 级联加 max-depth guard + 清晰报错（P0-4 的兜底半件）。
6. Modifier limit/offset 数值校验;删除死代码 API。

### 第二波：地基（响应式正确性）
7. Mutation event 契约重做：DB write 后完整快照,删除 `computeOldRecord`（P0-7/P0-8,§3.2）。
8. 增量 vs 全量等价的 property-based 测试基建。
9. setup 时计算 DAG 环检测（P0-4 的根治半件）。

### 第三波：架构升级
10. 事务内微批调度队列 + 拓扑序 + 去重（§3.3）。
11. SchemaRegistry 替代静态 instances;序列化 round-trip 修复（§3.1）。
12. 存储层:批量加载消除 N+1、自动索引、update 按需查询（§3.4）。
13. Activity 状态乐观锁（version + CAS update)（P1-1）。

### 第四波：能力扩展
14. 内置 outbox + side effect 重试语义。
15. async computation worker/poller。
16. MySQL transaction-bound connection 或正式降级其支持声明。

---

## 5. 总评

interaqt 的概念模型（事实事件 + 声明式派生 + 单事务同步一致性）是有真实差异化价值的,事务边界设计和 `planIncremental` 增量协议的抽象质量也不低。但当前实现与"framework 保证一致性"的承诺之间有明确落差:**Activity/权限子系统存在多个从未被测试路径覆盖的功能性断裂（Gateway、payload 校验、checkConcept）,响应式核心的 mutation event 契约不严谨,调度器缺少环检测与去重**。

好消息是:最危险的一批问题（第一波）修复成本都很低;而杠杆最大的两项改造（mutation event 契约 + DAG 微批调度）都有清晰的落点,且现有静态 source map 体系已经为它们准备好了大部分信息。按上述四波推进,可以在不推翻现有 API 的前提下完成质量的实质性跃迁。
