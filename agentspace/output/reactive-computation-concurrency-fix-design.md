# 响应式 Computation 多进程并发问题：终局解决方案设计

> 目标：在多个进程共享同一个 PostgreSQL 数据库时，彻底消除 interaqt reactive computation 的并发正确性问题，同时避免热点场景下的 SERIALIZABLE retry 风暴。

## 1. 结论

最终方案不是“所有 dispatch 全部跑 SERIALIZABLE”，而是分两层：

1. **主方案：把 framework 内部 state 写入原子化。**
   所有内置 computation 不再用 `get → compute → set` 这种天然 race 的模式更新状态，而是通过 PostgreSQL 单条原子 SQL 完成 `increment`、`replace`、`compare-and-set` 等操作。

2. **兜底方案：SERIALIZABLE + retry 只保护无法原子化的跨行/跨表依赖。**
   对少数自定义 computation 或复杂全量重算路径，使用 PostgreSQL SSI 检测不可串行化历史，并在 `40001 / 40P01` 时自动重试整个事务。

这才是更接近工业界高并发 OLTP 实践的方案：**热点更新走数据库原子操作，复杂一致性问题交给 SERIALIZABLE 兜底**。

## 2. 当前问题

### 2.1 当前执行模型

当前 dispatch 链路如下：

1. `Controller.dispatch(eventSource, args)` 开事务。
2. `eventSource.resolve()` 通过 storage 写入业务数据。
3. `MonoStorage.callWithEvents()` 同步派发 `RecordMutationEvent`。
4. `Scheduler` 根据 mutation event 触发 computation。
5. computation 通常执行：
   - `resolveDataDeps()`
   - `retrieveLastValue()` 或 `state.get()`
   - `incrementalCompute(...)`
   - `state.set(...)` / `applyResult(...)`
6. commit。

单进程内看起来是顺序的，但多进程下每个 Controller 都有自己的事务和连接。PostgreSQL 默认 `READ COMMITTED` 不保证跨语句快照一致性，因此所有 `read old value → compute new value → write new value` 都可能丢失更新。

### 2.2 具体 bug

#### Bug A：全局 Count 丢失更新

`GlobalCountHandle.incrementalCompute` 当前逻辑等价于：

```text
count = await state.count.get()
count = count + 1
await state.count.set(count)
```

并发时：

```text
P1 read count = 5
P2 read count = 5
P1 write count = 6
P2 write count = 6
```

正确值应为 7，实际为 6。

同类问题影响：

- `GlobalCountHandle`
- `GlobalSumHandle`
- `GlobalAverageHandle`
- `GlobalEveryHandle`
- `GlobalAnyHandle`
- `GlobalWeightedSummationHandle`

#### Bug B：Property 聚合丢失更新

例如同一个 User 同时新增两条 Order：

```text
P1 read user.total = 100
P2 read user.total = 100
P1 write user.total = 110
P2 write user.total = 120
```

正确值应为 130。

同类问题影响所有基于关联记录聚合的 property computation：

- `PropertyCountHandle`
- `PropertySumHandle`
- `PropertyAverageHandle`
- `PropertyEveryHandle`
- `PropertyAnyHandle`
- `PropertyWeightedSummationHandle`

#### Bug C：StateMachine 非法并发迁移

当前 `PropertyStateMachineHandle.incrementalCompute`：

```text
currentState = await state.currentState.get(record)
nextState = findNextState(currentState, event)
await state.currentState.set(record, nextState.name)
```

并发时：

```text
Order.state = pending

P1 approve: read pending -> approved
P2 reject:  read pending -> rejected
P1 write approved
P2 write rejected
```

两个本应互斥的迁移都“成功”了。最终 state 取决于提交顺序，但两个事务内部的其他写入、后续 computation、afterDispatch 都可能已经基于各自以为成功的状态执行过。

#### Bug D：Transform 更新映射结果时竞态

`RecordsTransformHandle.dataBasedIncrementalPatchCompute` 会读取已有 mapped records，再决定 insert/update/delete。并发更新同一个 source record 时，两个事务可能基于同一份 mapped records 做 patch，导致删除覆盖、新增重复或结果错位。

#### Bug E：自研 IDSystem 不安全

PostgreSQL driver 里的 `_IDS_` 自增逻辑是：

```text
SELECT last FROM "_IDS_" WHERE name = ?
UPDATE "_IDS_" SET last = newId WHERE name = ?
```

并发时两个事务可能都读到 `10`，都写入 `11`，从而拿到重复领域 ID。

#### Bug F：async computation 回流无事务

`Scheduler.handleAsyncReturn` 当前不在 dispatch 事务内。多个 worker 同时回写 async result，或 async return 与正常 dispatch 并发时，同样会产生上述所有问题。

### 2.3 根因

根因不是某个 computation 写错，而是 framework 把状态变化表达成了非原子的三步：

```text
Read current state
Compute next state in application
Write next state
```

在多进程 `READ COMMITTED` 下，这个模式不具备并发安全性。

## 3. 为什么不把所有 dispatch 都改成 SERIALIZABLE

`SERIALIZABLE + retry` 是正确的，但不适合作为唯一方案。

### 3.1 它确实是业界认可的正确性方案

PostgreSQL SSI、CockroachDB、Spanner、FoundationDB 都证明了 serializable transaction 是严肃的一致性方案。它的优点是：

- 不需要逐个业务逻辑手写锁。
- 能检测所有不可串行化历史。
- 对复杂跨行依赖非常适合。

### 3.2 但它不是热点更新的吞吐最优方案

interaqt 的内置 computation 有很多天然热点：

- 一个全局 Count。
- 一个全局 Sum。
- 某个热门 User 的订单聚合字段。
- 某个 record 的 StateMachine 状态。

如果这些热点靠 SERIALIZABLE 解决，PostgreSQL 会在冲突后 abort 其中一个事务，让上层重试整个 dispatch。高并发时会出现：

- abort 率上升。
- retry 风暴。
- CPU/IO 被重复 computation 消耗。
- 长事务更容易被 abort。

对于 `count += 1` 这类问题，用单条 SQL：

```sql
UPDATE table SET count = count + 1 WHERE id = $1 RETURNING count;
```

明显比“读旧值、算新值、冲突后整事务重试”更直接、更稳。

### 3.3 正确定位

因此 SERIALIZABLE 应该是**兜底网**，不是第一选择：

- 内置 computation 的常见状态更新：用原子 state 原语。
- 复杂自定义 computation、跨多行条件判断、全量重算：用 SERIALIZABLE + retry。

## 4. 终局方案

### 4.1 新增原子 state 原语

在 `RecordBoundState` 和 `GlobalBoundState` 上新增原子方法。现有 `get/set` 保留，但内置 computation 的增量路径不再用它们做读改写。

#### `increment(delta)`

用于 Count / Sum / Average / Every / Any 中的计数、求和、匹配计数。

语义：

```typescript
const newValue = await state.increment(record, delta)
```

PostgreSQL 实现必须是一条 SQL：

```sql
UPDATE "Record"
SET "state_key" = COALESCE("state_key", 0) + $delta
WHERE "id" = $id
RETURNING "state_key";
```

Global state 同理更新 `_Dictionary_` 对应 key 的 json/number value，或者把 global state 从 `_Dictionary_` 迁到专门的 `_System_` row 后使用同样的单行原子更新。

#### `replace(value)`

用于记录某个 item 上一次计算出的贡献值，例如：

- `itemValue`
- `itemResult`
- `isItemMatch`

语义：

```typescript
const oldValue = await state.replace(record, newValue)
```

实现要求：**读取旧值与写入新值在同一条 UPDATE 内完成**。

PostgreSQL 形式：

```sql
UPDATE "Record"
SET "state_key" = $newValue
WHERE "id" = $id
RETURNING old_value;
```

PostgreSQL 不能直接 `RETURNING` 更新前旧值，实际实现有两种：

1. 使用 writable CTE：

```sql
WITH old AS (
  SELECT "state_key" AS old_value
  FROM "Record"
  WHERE "id" = $id
  FOR UPDATE
), updated AS (
  UPDATE "Record"
  SET "state_key" = $newValue
  WHERE "id" = $id
  RETURNING "state_key" AS new_value
)
SELECT old.old_value, updated.new_value FROM old, updated;
```

2. 或使用 `SELECT ... FOR UPDATE` 后再 `UPDATE`，但必须封装在 state 原语内部，同一事务内完成，调用方不能自己拆开。

#### `compareAndSet(expected, next)`

用于 StateMachine。

语义：

```typescript
const changed = await state.compareAndSet(record, expectedState, nextState)
```

实现：

```sql
UPDATE "Record"
SET "state_key" = $next
WHERE "id" = $id AND "state_key" = $expected
RETURNING "state_key";
```

如果返回 0 行，说明状态已被其他事务改变。本次 transition 必须视为失败：

```typescript
if (!changed) return ComputationResult.skip()
```

这样 approve/reject 并发时，只有第一个成功更新 `pending -> approved/rejected` 的事务生效。另一个事务 retry 后读到新状态，要么找不到 transition 并 skip，要么进入新的合法 transition。

#### `lockAndRead()`

用于少数需要读取复杂 state 后做条件判断的内置路径，例如 Transform 的 mapped records patch。

语义：

```typescript
const records = await state.lockAndRead(match)
```

实现必须使用 `SELECT ... FOR UPDATE` 锁住后续会被 patch 的目标行，保证当前事务中基于这些行做出的 insert/update/delete 决策不会和另一个事务交错。

### 4.2 改写内置 computation 的增量逻辑

#### Count

当前：

```text
count = await state.count.get()
count += delta
await state.count.set(count)
return count
```

改为：

```text
delta = computeDeltaFromEvent(...)
newCount = await state.count.increment(delta)
return newCount
```

带 callback 的 Count：

```text
oldMatch = await state.isItemMatch.replace(record, newMatch)
delta = Number(newMatch) - Number(oldMatch)
newCount = await state.count.increment(delta)
```

#### Summation

当前：

```text
sum = lastValue
oldItemValue = await itemValue.get(record)
newItemValue = resolve(...)
await itemValue.set(record, newItemValue)
return sum + newItemValue - oldItemValue
```

改为：

```text
oldItemValue = await itemValue.replace(record, newItemValue)
delta = newItemValue - oldItemValue
newSum = await sum.increment(delta)
return newSum
```

Property Summation 同理，目标 record 是聚合宿主 record。

#### Average

Average 不直接维护 average，而维护原子 `sum` 与 `count`：

```text
oldItemValue = await itemValue.replace(record, newItemValue)
newSum = await sum.increment(newItemValue - oldItemValue)
newCount = await count.increment(countDelta)
return newCount > 0 ? newSum / newCount : 0
```

注意：`sum.increment` 与 `count.increment` 必须在同一个事务里。单条 SQL 各自原子，事务保证它们一起提交。

#### Every / Any

Every / Any 维护：

- `totalCount`
- `matchCount`
- `isItemMatch`

改为：

```text
oldMatch = await isItemMatch.replace(record, newMatch)
matchDelta = Number(newMatch) - Number(oldMatch)
newMatchCount = await matchCount.increment(matchDelta)
newTotalCount = await totalCount.increment(totalDelta)
return computeBoolean(newMatchCount, newTotalCount)
```

#### WeightedSummation

WeightedSummation 同 Summation，只是贡献值来自 `weight * value`：

```text
oldContribution = await itemContribution.replace(record, newContribution)
newSum = await sum.increment(newContribution - oldContribution)
```

#### StateMachine

当前状态迁移改为 CAS：

```typescript
const currentStateName = await this.state.currentState.get(dirtyRecord)
const nextState = this.transitionFinder.findNextState(currentStateName, mutationEvent)
if (!nextState) return ComputationResult.skip()

const changed = await this.state.currentState.compareAndSet(
    dirtyRecord,
    currentStateName,
    nextState.name
)
if (!changed) return ComputationResult.skip()

return nextState.computeValue
    ? await nextState.computeValue.call(this.controller, lastValue, mutationEvent)
    : nextState.name
```

更严格的实现可以用单条 SQL 的 `WHERE currentState IN (...)` 直接判断 expected state，避免先读再 CAS 的额外 roundtrip。

#### Transform

Transform 的 create 源事件通常不会冲突，因为每个 source record 生成自己的 mapped records。危险点主要是同一个 source record 的并发 update/delete。

改法：

1. 对同一 source record 的 mapped target rows 使用 `SELECT ... FOR UPDATE` 锁住。
2. 在锁内重新计算 transformed records。
3. 再生成 patch。

也可以进一步加数据库唯一约束：

```text
(sourceRecordId, transformIndex)
```

这样即便代码路径遗漏锁，数据库也能拒绝重复映射结果。

### 4.3 IDSystem 改用 PostgreSQL Sequence

删除 `_IDS_` 手写递增表，改用 PostgreSQL 原生 sequence：

```sql
CREATE SEQUENCE IF NOT EXISTS "Record_id_seq";
SELECT nextval('"Record_id_seq"');
```

或者更好：所有业务 record 的数据库主键统一使用 `GENERATED ALWAYS AS IDENTITY`，framework 不再自己维护自增 ID。

这是 PostgreSQL 最成熟的原子 ID 方案，性能和正确性都优于 `_IDS_` 表。

### 4.4 async return 纳入事务

`Scheduler.handleAsyncReturn` 必须和 dispatch 一样有事务边界：

```typescript
await controller.transaction('asyncReturn:...', async () => {
    // find task
    // asyncReturn
    // applyResult / applyResultPatch
})
```

如果 async return 会更新普通业务数据或 computation state，就必须享受同样的原子 state 原语和 SERIALIZABLE 兜底。

### 4.5 PostgreSQL 连接模型改为 Pool

当前 `PostgreSQLDB` 持有单个 `pg.Client`。如果要允许同一进程内多个 dispatch 并发，必须改成：

- `pg.Pool`
- 每个 dispatch 从 pool checkout 一个 client
- 使用 `AsyncLocalStorage` 把当前事务 client 绑定到整个 async chain
- storage query 优先使用当前事务 client，否则使用 pool 直接 query

这样就不需要 per-controller mutex 把同一进程内 dispatch 全部串行化。

事务 helper：

```typescript
await db.withTransaction(async () => {
    await controller.dispatch(...)
})
```

内部大致为：

```typescript
const client = await pool.connect()
try {
    await client.query('BEGIN')
    return await transactionContext.run({ client }, async () => {
        const result = await fn()
        await client.query('COMMIT')
        return result
    })
} catch (e) {
    await client.query('ROLLBACK')
    throw e
} finally {
    client.release()
}
```

SERIALIZABLE 兜底时，把 `BEGIN` 换成：

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE
```

## 5. SERIALIZABLE 兜底层

原子 state 原语解决的是内置 computation 的主要热点问题，但仍需兜底：

- Custom computation 自己写了复杂 `get → set`。
- 全量 recompute 需要读取多行并整体替换结果。
- Transform 的复杂 patch 无法完全表达成原子单行更新。
- 未来新增 computation 引入跨表约束。

### 5.1 启用方式

建议引入内部标记：

```typescript
interface Computation {
    requireSerializable?: boolean
}
```

触发规则：

1. 内置 computation 默认 `false`，因为增量路径已使用原子 state。
2. Custom computation 默认 `true`，除非用户显式声明 `concurrency: 'atomic-safe'`。
3. 任何全量重算 `ComputationResult.fullRecompute()` 路径默认 `true`。
4. Entity / Relation 级 `applyResult` 的“先删全量再插入全量”默认 `true`。

### 5.2 retry 策略

捕获 PostgreSQL：

- `40001` serialization_failure
- `40P01` deadlock_detected

策略：

- 最多重试 5 次。
- 指数退避 + jitter。
- 只重试事务内逻辑。
- `recordMutationSideEffects` 只在最终 commit 成功后执行一次。

### 5.3 为什么作为兜底层性能可接受

因为热点路径已经不靠 SSI 解决。SERIALIZABLE 只覆盖少数复杂事务，冲突率低、重试成本可控。

## 6. 事务与副作用边界

正确的 dispatch 边界：

```text
retry loop:
  BEGIN [READ COMMITTED 或 SERIALIZABLE]
    guard
    mapEventData
    resolve
    computation
    applyResult
  COMMIT

after commit:
  recordMutationSideEffects
```

要求：

- `recordMutationSideEffects` 保持在 commit 后执行，避免 retry 导致外部副作用重复。
- `afterDispatch` 如果仍在事务内，就必须视为可重放逻辑，不得做不可逆外部 IO。
- 文档中明确：外部 IO 应放到 `recordMutationSideEffects`。

## 7. Storage API 变更

为了支撑 state 原语，storage 需要新增内部能力。

### 7.1 原子更新

```typescript
type AtomicUpdateOptions = {
    recordName: string
    id: string
    field: string
}

storage.atomic.increment(options, delta): Promise<number>
storage.atomic.replace<T>(options, value: T): Promise<{ oldValue: T | null, newValue: T }>
storage.atomic.compareAndSet<T>(options, expected: T, next: T): Promise<boolean>
storage.atomic.lockRows(recordName, match, attributeQuery): Promise<Record<string, unknown>[]>
```

这些 API 是 framework internal，不对普通用户暴露。

### 7.2 Global state 存储建议

当前 GlobalBoundState 写 `_Dictionary_` 的 json `value.raw`。这不适合高频原子数值更新。

建议新增或复用 `_System_`，把 global state 存为稳定单行：

```text
concept = 'ComputationState'
key = state.key
value = ...
```

对 PostgreSQL 可用 JSONB 或 typed columns。为了支持 `increment` 高效执行，数值 state 最好使用独立 numeric column；如果短期不改 schema，可以先用表达式把 json value cast 成 numeric，但这不是性能最优。

终局建议：新增 `_ComputationState_` internal entity：

```text
key TEXT PRIMARY KEY
numberValue NUMERIC NULL
booleanValue BOOLEAN NULL
stringValue TEXT NULL
jsonValue JSONB NULL
```

这样 global numeric state 的 `increment` 是标准单行 update。

## 8. 正确性论证

### 8.1 Lost update 被原子 update 消除

`UPDATE col = col + delta` 在 PostgreSQL 中会获取行锁。多个事务并发更新同一行时，后者等待前者提交，然后基于最新行版本继续执行。因此：

```text
count += 1
count += 1
```

不会丢失，最终一定加 2。

### 8.2 StateMachine 被 CAS 线性化

`UPDATE ... WHERE state = expected` 是状态迁移的线性化点。对同一 record 的同一旧状态，只有一个事务能成功把它改到下一状态。

失败事务不会覆盖成功事务，只会得到 `changed = false`，然后 skip 或在 retry 后基于新状态重新判断。

### 8.3 Contribution state 用 replace 保证 delta 正确

Summation / Average / Every / Any 的关键不是“读旧贡献”，而是“原子替换旧贡献并拿到旧值”。一旦 `replace` 锁住贡献所在行，delta 就不会和另一个事务交错。

### 8.4 SERIALIZABLE 覆盖剩余复杂情况

对无法表达成单行原子 update 的复杂事务，SSI 检测所有不可串行化历史。retry 后重新读取最新数据，最终行为等价于某个串行顺序。

## 9. 性能分析

### 9.1 热点 Count / Sum

原方案（全 SERIALIZABLE）：

```text
read count
write count
conflict -> abort whole transaction -> retry
```

新方案：

```text
UPDATE count = count + delta RETURNING count
```

热点下仍会排队，但排队点是 PostgreSQL 行锁，不会制造大量事务 abort。吞吐稳定，延迟随排队增长，而不是 retry 风暴。

### 9.2 StateMachine

CAS 是单行条件 update。热点 record 的迁移天然必须串行，CAS 让串行化发生在最小粒度上。

### 9.3 Transform

Transform update/delete 需要锁 mapped rows，冲突粒度是同一个 source record 的映射结果，而不是整个 transform 表。

### 9.4 pg.Pool

Pool 让同一进程内多个 dispatch 能并发跑在不同连接上。相比 per-controller mutex，吞吐上限从：

```text
1 / average_dispatch_duration
```

提升为：

```text
pool_size / average_dispatch_duration
```

实际吞吐再由数据库热点行锁决定。

### 9.5 SERIALIZABLE 成本被限制

只有少数路径启用 SSI，所以不会把所有 dispatch 都拖进 predicate lock 与高 abort 率。

## 10. 落地步骤

### Step 1：PostgreSQL driver 改为 Pool + transaction context

- `pg.Client` 改为 `pg.Pool`。
- 新增 transaction AsyncLocalStorage。
- 每个 dispatch / async return 使用独立 pool client。
- query/update/insert/delete 自动使用当前事务 client。

### Step 2：新增 storage atomic API

- `atomic.increment`
- `atomic.replace`
- `atomic.compareAndSet`
- `atomic.lockRows`

先只保证 PostgreSQL。PGLite/SQLite 不在本任务范围内。

### Step 3：改造 BoundState

`RecordBoundState` 新增：

- `increment(record, delta)`
- `replace(record, value)`
- `compareAndSet(record, expected, next)`
- `lock(record)`

`GlobalBoundState` 新增：

- `increment(delta)`
- `replace(value)`
- `compareAndSet(expected, next)`

### Step 4：改造内置 computation

优先级：

1. `StateMachine`：CAS，避免非法迁移。
2. `Count / Summation / Average`：最大热点收益。
3. `Every / Any / WeightedSummation`：同一模式。
4. `Transform`：锁 mapped rows + 唯一约束。

### Step 5：IDSystem 改为 sequence

- 删除 `_IDS_` 手写递增。
- 每个 record 使用 PostgreSQL sequence / identity。

### Step 6：SERIALIZABLE 兜底

- 新增 transaction retry helper。
- 捕获 `40001 / 40P01`。
- Custom / full recompute / entity-replace 路径启用。
- side effects 保持 commit 后执行。

### Step 7：并发测试

只测 PostgreSQL，多进程真实并发：

- 100 个进程/worker 并发 create，同一个 GlobalCount 最终正确。
- 同一个 User 并发新增 Order，PropertySum 正确。
- 同一个 StateMachine record 并发 approve/reject，只有一个合法迁移生效。
- 同一个 source record 并发 update，Transform mapped records 不重复、不丢失。
- async return 与 dispatch 并发，最终结果正确。
- Custom computation 标记 requireSerializable 后，高冲突下可重试成功。

## 11. 最终设计原则

1. **内置 computation 不依赖用户理解事务隔离。**
   framework 的 state 原语本身必须 race-free。

2. **热点路径不能靠整事务 retry 维持正确性。**
   对 `count += delta`、`state: A -> B` 这类操作，数据库单行原子 update 是最小、最快、最可靠的并发控制。

3. **SERIALIZABLE 是兜底，不是锤子。**
   它用于复杂跨行不变量，不用于替代原子增量。

4. **一个数据库就是唯一协调者。**
   不引入 Redis、不引入分布式锁、不引入应用层全局 mutex。所有并发控制都落在 PostgreSQL 行锁、sequence、CAS、SSI 上。

5. **副作用必须在 commit 后。**
   retry 只能重放数据库事务，不能重放外部世界。

按这个方案实施后，interaqt 的 reactive computation 在 PostgreSQL 多进程并发下既能保证正确性，也能在热点场景保持可预期的性能。
