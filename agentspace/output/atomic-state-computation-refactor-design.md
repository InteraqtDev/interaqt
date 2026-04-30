# 原子 State 原语与 Computation 改造设计

> 本文档只覆盖第一阶段：新增原子 state 原语、必要的 PostgreSQL 专用内部 DDL，并用它改造内置 computation 的增量路径。暂不包含 PostgreSQL Pool、SERIALIZABLE retry、IDSystem sequence 化等后续工作。

## 1. 目标

当前内置 computation 的增量更新大量使用：

```text
oldValue = await state.get(...)
newValue = compute(oldValue, event)
await state.set(..., newValue)
```

在多个进程共享同一个 PostgreSQL 数据库时，这个模式会产生 lost update、非法状态迁移、映射结果覆盖等并发 bug。

本阶段目标是把这些非原子读改写替换成 framework 内部原子 state 原语：

- `increment`：数值累加。
- `replace`：原子替换并返回旧值。
- `compareAndSet`：条件更新，用于状态机迁移。
- `lockRecord`：锁定单个 source/host record，作为跨多行 patch 的线性化点。
- `lockRows`：锁定后续要 patch 的多行结果。

完成后，内置 computation 的常见热点路径不再依赖 `SERIALIZABLE + retry` 才能保证正确性。

## 2. 设计原则

1. **原子性由 state 原语提供，而不是每个 computation 自己拼出来。**
   computation 只表达语义：加多少、替换成什么、从哪个状态迁移到哪个状态。

2. **单行热点用 PostgreSQL 行锁和原子 UPDATE 解决。**
   对 `count += delta`、`sum += delta`、`state A -> B`，数据库单行更新是最小正确性边界。

3. **旧 API 保留，新 API 只用于 framework 内部改造。**
   `get/set` 仍保留给初始化、全量重算、低频路径使用；内置增量路径不再使用 `get/set` 做读改写。

4. **先只保证 PostgreSQL。**
   PGLite/SQLite 不在本阶段范围内。

## 3. 新增 Storage 原子 API

在 `Storage` 内部新增 `atomic` 能力。该 API 是 framework internal，不作为用户公开 API。

```typescript
type AtomicRecordTarget = {
    recordName: string
    id: string
    field: string
}

type AtomicGlobalTarget = {
    key: string
    valueType?: 'number' | 'boolean' | 'string' | 'json'
}

type AtomicTarget = AtomicRecordTarget | AtomicGlobalTarget

type AtomicStorage = {
    increment(target: AtomicTarget, delta: number): Promise<number>
    replace<T>(target: AtomicTarget, value: T): Promise<{ oldValue: T | null, newValue: T }>
    compareAndSet<T>(
        target: AtomicTarget,
        expected: T,
        next: T,
        options?: { defaultValue?: T }
    ): Promise<boolean>
    lockRecord(
        recordName: string,
        id: string,
        attributeQuery?: AttributeQueryData
    ): Promise<Record<string, unknown> | undefined>
    lockRows(
        recordName: string,
        match: MatchExpressionData,
        attributeQuery?: AttributeQueryData
    ): Promise<Record<string, unknown>[]>
}
```

`MonoStorage` 增加：

```typescript
atomic: AtomicStorage
```

### 3.1 `increment`

语义：

```typescript
const next = await storage.atomic.increment(target, delta)
```

要求：

- 对同一个 target 的并发 `increment` 不丢失。
- 返回递增后的值。
- `null/undefined` 按 0 处理。

Record state 的 PostgreSQL 形态：

```sql
UPDATE "Record"
SET "field" = COALESCE("field", 0) + $1
WHERE "id" = $2
RETURNING "field";
```

Global state 的实现建议见第 5 节。

### 3.2 `replace`

语义：

```typescript
const { oldValue, newValue } = await storage.atomic.replace(target, value)
```

要求：

- 锁住目标行。
- 返回更新前旧值和更新后新值。
- 调用方用 `newValue - oldValue` 计算 delta。

PostgreSQL 实现优先使用显式两步锁：`SELECT ... FOR UPDATE` 读取旧值，再 `UPDATE` 写新值。两条 SQL 必须封装在同一个 state 原语内部、同一事务内，调用方不能拆开：

```sql
SELECT "field" AS old_value
FROM "Record"
WHERE "id" = $1
FOR UPDATE;

UPDATE "Record"
SET "field" = $2
WHERE "id" = $1
RETURNING "field" AS new_value;
```

这里的 `FOR UPDATE` 是必要的。它确保两个事务不会同时基于同一个旧贡献值计算 delta。
第一阶段不要求把 `replace` 做成单条 writable CTE；如果未来使用 CTE，必须确保 `UPDATE` 对读取旧值的 CTE 有真实执行依赖，不能只追求“单 statement”而丢掉锁语义。
如果目标行不存在，`replace` 必须返回明确的 0 行结果或抛出 framework internal 错误，调用方不能把它当成 `oldValue = null` 继续计算。delete 路径不能对已删除行使用 `replace`，见第 6 节。

### 3.3 `compareAndSet`

语义：

```typescript
const changed = await storage.atomic.compareAndSet(target, expected, next)
```

要求：

- 只有当前值等于 `expected` 时才更新为 `next`。
- 成功返回 `true`。
- 失败返回 `false`，不抛错。
- 对 default value / NULL 的语义必须和 `RecordBoundState.get()` 一致。

PostgreSQL 实现：

```sql
UPDATE "Record"
SET "field" = $next
WHERE "id" = $id AND COALESCE("field", $defaultValue) = $expected
RETURNING "field";
```

如果返回 0 行，说明状态已经被别的事务改掉。

### 3.4 `lockRecord`

语义：

```typescript
const row = await storage.atomic.lockRecord(recordName, id, attributeQuery)
```

要求：

- 使用 `SELECT ... FOR UPDATE` 锁住指定 record。
- 返回的数据结构和 `storage.findOne` 一致。
- 用于 Transform、StateMachine、property aggregate 等需要以 host/source record 作为线性化点的路径。

PostgreSQL 形态：

```sql
SELECT ...
FROM "Record"
WHERE "id" = $1
FOR UPDATE;
```

### 3.5 `lockRows`

语义：

```typescript
const rows = await storage.atomic.lockRows(recordName, match, attributeQuery)
```

要求：

- 查询结果使用 `FOR UPDATE` 锁住。
- 返回的数据结构和 `storage.find` 一致。
- 用于 Transform 等“先读一批目标行，再决定 update/delete/insert”的 patch 路径。

PostgreSQL 形态：

```sql
SELECT ...
FROM "Record"
WHERE ...
FOR UPDATE;
```

## 4. BoundState API 改造

### 4.1 `RecordBoundState`

新增：

```typescript
class RecordBoundState<T> {
    async increment(record: Record<string, unknown>, delta: number): Promise<number>

    async replace(
        record: Record<string, unknown>,
        value: T
    ): Promise<{ oldValue: T | null, newValue: T }>

    async compareAndSet(
        record: Record<string, unknown>,
        expected: T,
        next: T
    ): Promise<boolean>

    async lock(
        record: Record<string, unknown>,
        attributeQuery?: AttributeQueryData
    ): Promise<Record<string, unknown> | undefined>
}
```

内部 target：

```typescript
{
    recordName: this.record!,
    id: record.id,
    field: this.key
}
```

### 4.2 `GlobalBoundState`

新增：

```typescript
class GlobalBoundState<T> {
    async increment(delta: number): Promise<number>

    async replace(value: T): Promise<{ oldValue: T | null, newValue: T }>

    async compareAndSet(expected: T, next: T): Promise<boolean>

    async lock(): Promise<T | null>
}
```

内部 target：

```typescript
{
    key: this.key
}
```

## 5. Global State 存储

当前 `GlobalBoundState` 写 `_Dictionary_` 的 `value.raw`。这对高频数值 `increment` 不理想，因为：

- 值是 JSON 包装。
- 数值累加需要 cast。
- 不利于 PostgreSQL 优化。

本阶段新增 PostgreSQL driver-owned internal table：

```sql
CREATE TABLE IF NOT EXISTS "_ComputationState_" (
    "key" TEXT PRIMARY KEY,
    "numberValue" NUMERIC NULL,
    "booleanValue" BOOLEAN NULL,
    "stringValue" TEXT NULL,
    "jsonValue" JSONB NULL
);
```

`_ComputationState_` 不能只建模成普通 Entity。当前 ER setup 只生成列，没有表达 `key` primary key / unique constraint 的通用机制；而 global `increment` 依赖 `ON CONFLICT ("key")`。因此该表和约束必须由 PostgreSQL driver / storage setup 显式创建。

Global numeric state 的 `increment`：

```sql
INSERT INTO "_ComputationState_" ("key", "numberValue")
VALUES ($key, $delta)
ON CONFLICT ("key")
DO UPDATE SET "numberValue" = COALESCE("_ComputationState_"."numberValue", 0) + $delta
RETURNING "numberValue";
```

Global boolean/string/json 的 `replace` / `compareAndSet` 使用对应 typed column。

兼容策略：

- 新的 `GlobalBoundState` 默认读写 `_ComputationState_`。
- 旧 `_Dictionary_` 仍用于用户显式 Dictionary 值。
- computation state 不再混入普通 dictionary。

## 6. Computation 改造

### 6.1 Count

#### GlobalCount

当前风险：

```text
count = await state.count.get()
await state.count.set(count + delta)
```

改为：

```typescript
const { oldValue } = await this.state.isItemMatch.replace(record, newMatch)
const delta = Number(newMatch) - Number(!!oldValue)
const nextCount = await this.state.count.increment(delta)
if (nextCount < 0) throw new Error('GlobalCount became negative')
return nextCount
```

事件规则：

- `create`：`delta = newMatch ? +1 : 0`
- `delete`：不能对已删除 record 执行 `replace`；从 delete event 的 `record` 读取旧 `isItemMatch`，`delta = oldMatch ? -1 : 0`
- `update`：`delta = Number(newMatch) - Number(oldMatch)`

`isItemMatch.replace` 是关键。它保证并发 update 同一 item 时，只有一个事务拿到某个旧状态。

#### PropertyCount

无 callback 时：

```typescript
const delta = relationCreate ? +1 : -1
const next = await this.state.count.increment(hostRecord, delta)
if (next < 0) throw new Error('PropertyCount became negative')
return next
```

有 callback 时：

```typescript
const delta = relatedMutationEvent.type === 'delete'
    ? (readOldMatchFromDeletedRelationEvent(relatedMutationEvent) ? -1 : 0)
    : Number(newMatch) - Number(!!(await isItemMatchCount.replace(relationRecord, newMatch)).oldValue)

const next = await this.state.count.increment(hostRecord, delta)
if (next < 0) throw new Error('PropertyCount became negative')
return next
```

`PropertyCount` 必须显式维护 host-bound `count` state：

```typescript
createState() {
    return {
        count: new RecordBoundState<number>(0, this.dataContext.host.name),
        ...(this.callback ? {
            isItemMatchCount: new RecordBoundState<boolean>(false, this.relation.name!)
        } : {})
    }
}
```

### 6.2 Summation

#### GlobalSum

改造模式：

```typescript
const newValue = resolveSumField(record)
const { oldValue } = await this.state.itemValue.replace(record, newValue)
const delta = newValue - (oldValue ?? 0)
return await this.state.sum.increment(delta)
```

事件规则：

- `create`：`oldValue` 视为 0，replace 后 `delta = newValue`
- `delete`：不能对已删除 record 执行 `replace`；从 delete event 的 `record` 读取旧 `itemValue`，`delta = -oldValue`
- `update`：`delta = newValue - oldValue`

删除时使用 event record：

```typescript
const oldValue = readContributionFromDeletedRecord(mutationEvent.record, itemValue.key)
const next = await sum.increment(-(oldValue ?? 0))
```

#### PropertySum

同 GlobalSum，但：

- contribution state 在 relation record 上。
- aggregate result state 是 host record 上的 internal `sum` state。
- `increment` target 是 host record 的 internal `sum` state，随后返回 `nextValue` 交给 `applyResult` 写对外 computed property。

```typescript
const delta = relatedMutationEvent.type === 'delete'
    ? -(readContributionFromDeletedRecord(relatedMutationEvent.record, itemResult.key) ?? 0)
    : newValue - ((await this.state.itemResult.replace(relationRecord, newValue)).oldValue ?? 0)

const nextValue = await this.state.sum.increment(hostRecord, delta)
return nextValue
```

`PropertySum` 必须新增 host-bound `sum` state：

```typescript
createState() {
    return {
        sum: new RecordBoundState<number>(0, this.dataContext.host.name),
        itemResult: new RecordBoundState<number>(0, this.relation.name!)
    }
}
```

### 6.3 Average

Average 必须维护两个原子 state：

- `sum`
- `count`

#### GlobalAverage

```typescript
const { oldValue } = await this.state.itemValue.replace(record, newValue)
const sumDelta = newValue - (oldValue ?? 0)
const nextSum = await this.state.sum.increment(sumDelta)
const nextCount = await this.state.count.increment(countDelta)

return nextCount > 0 ? nextSum / nextCount : 0
```

事件规则：

- `create`：`countDelta = +1`
- `delete`：不能对已删除 record 执行 `replace`；从 delete event 的 `record` 读取旧 `itemValue`，`sumDelta = -oldValue`，`countDelta = -1`
- `update`：`countDelta = 0`

#### PropertyAverage

当前 `PropertyAverage` 只维护 `count` 和 `itemResult`，用 `lastValue * count` 还原 sum。这个在并发下不安全。

需要新增 `sum` state：

```typescript
createState() {
    return {
        sum: new RecordBoundState<number>(0, this.dataContext.host.name),
        count: new RecordBoundState<number>(0, this.dataContext.host.name),
        itemResult: new RecordBoundState<number>(0, this.relation.name!)
    }
}
```

增量逻辑同 GlobalAverage：

```typescript
const sumDelta = relatedMutationEvent.type === 'delete'
    ? -(readContributionFromDeletedRecord(relatedMutationEvent.record, itemResult.key) ?? 0)
    : newValue - ((await itemResult.replace(relationRecord, newValue)).oldValue ?? 0)
const nextSum = await sum.increment(hostRecord, sumDelta)
const nextCount = await count.increment(hostRecord, countDelta)
return nextCount > 0 ? nextSum / nextCount : 0
```

### 6.4 Every / Any

Every 和 Any 都维护：

- `totalCount`
- `matchCount`
- `isItemMatch`

#### Every

```typescript
const { oldValue } = await isItemMatch.replace(record, newMatch)
const matchDelta = Number(newMatch) - Number(!!oldValue)
const nextMatchCount = await matchCount.increment(matchDelta)
const nextTotalCount = await totalCount.increment(totalDelta)

return nextTotalCount === 0
    ? defaultValue
    : nextMatchCount === nextTotalCount
```

#### Any

```typescript
return nextMatchCount > 0
```

删除事件：

```typescript
const oldValue = readContributionFromDeletedRecord(mutationEvent.record, isItemMatch.key)
const matchDelta = oldValue ? -1 : 0
const totalDelta = -1
```

PropertyEvery / PropertyAny 同理，只是 `totalCount` 和 `matchCount` 绑定在 host record 上，`isItemMatch` 绑定在 relation record 上。

### 6.5 WeightedSummation

WeightedSummation 本质是 Summation，只是 contribution 计算不同：

```typescript
const newContribution = resolveValue(record) * resolveWeight(record)
const { oldValue } = await itemContribution.replace(record, newContribution)
const delta = newContribution - (oldValue ?? 0)
return await total.increment(delta)
```

删除事件同 Summation：从 delete event 的 `record` 读取旧 contribution，不能对已删除 record 执行 `replace(record, 0)`。

### 6.6 StateMachine

StateMachine 使用 `compareAndSet` 作为迁移线性化点。

#### PropertyStateMachine

```typescript
const lockedRecord = await this.state.currentState.lock(dirtyRecord, ['*'])
const currentStateName = readCurrentState(lockedRecord)
const previousValue = lockedRecord[this.dataContext.id.name]
const nextState = this.transitionFinder.findNextState(currentStateName, mutationEvent)
if (!nextState) return ComputationResult.skip()

await this.state.currentState.setLocked(lockedRecord, nextState.name)

return nextState.computeValue
    ? await nextState.computeValue.call(this.controller, previousValue, mutationEvent)
    : nextState.name
```

StateMachine 不能继续使用 `Scheduler.runComputation()` 在 CAS/锁之前预读的 `lastValue`。`computeValue(previousValue, event)` 的 `previousValue` 必须和成功迁移的 `currentStateName` 来自同一个锁保护的串行时刻。

因此 StateMachine 第一阶段采用 record/global state lock 作为迁移线性化点：

- `useLastValue = false`，禁止 Scheduler 预读 external computed property。
- Property state machine 对 dirty host record 执行 `SELECT ... FOR UPDATE`。
- 在锁内读取 internal currentState 和 external computed property。
- 在锁内写 internal currentState。
- CAS 可作为无锁版本的优化，但只有在原语能同时返回线性化点上的 previous external value 时才可使用。

并发 approve/reject 时，只有一个事务能先锁住 `pending` 并迁移到下一个状态。另一个事务等待后看到新 currentState，要么没有合法迁移并 skip，要么执行从新状态出发的合法迁移。

#### GlobalStateMachine

同理：

```typescript
const { currentStateName, previousValue } = await currentState.lockWithExternalValue()
const nextState = transitionFinder.findNextState(currentStateName, mutationEvent)
if (!nextState) return ComputationResult.skip()
await currentState.setLocked(nextState.name)
```

注意：`computeValue` 如果依赖状态迁移成功，必须放在锁内成功写入 internal currentState 后执行。

### 6.7 Transform

Transform 的关键是同一个 source record 的 mapped rows patch 不能并发交错。source update 和 source delete 的锁语义不同，必须分开定义。

#### Create 源事件

每个 source record 第一次生成自己的 mapped rows，一般不需要锁旧 rows。但数据库必须加唯一约束：

```text
(sourceRecordId, transformIndex)
```

该约束不是建议项，必须落成 PostgreSQL DDL。实现时对当前 Transform 的 target table 和两个 internal state field 创建唯一索引，例如：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "<transform_unique_index>"
ON "<TargetTable>" ("<sourceRecordIdStateField>", "<transformIndexStateField>");
```

索引只约束该 Transform 写入的 target table / state fields，避免不同 Transform 或不同 target 的 mapped rows 相互影响。

#### Update 源事件

改造流程：

1. 对 source record 执行 `SELECT ... FOR UPDATE`，这是 Transform patch 的线性化点。
2. 根据 `sourceRecordId` 查询 mapped target rows，并使用 `FOR UPDATE` 锁住已有 mapped rows。
3. 重新计算 transformed records。
4. 在锁内生成 insert/update/delete patch。
5. apply patch。

伪代码：

```typescript
const lockedSourceRecord = await storage.atomic.lockRecord(
    sourceRecordName,
    sourceRecordId,
    sourceAttributeQuery
)

const mappedRecords = await storage.atomic.lockRows(
    targetRecordName,
    MatchExp.atom({ key: sourceRecordIdKey, value: ['=', sourceRecordId] }),
    ['*']
)

const mappedRecordsByIndex = indexBy(mappedRecords, transformIndexKey)
const transformedRecords = await computeNewRecords(lockedSourceRecord, ...)
return diff(mappedRecordsByIndex, transformedRecords)
```

只锁 mapped rows 不够，因为当前 mapped rows 可能为空，`SELECT ... FOR UPDATE` 锁不到不存在的行。锁 source record 才能保证同一个 source record 的两个并发 update 串行生成 patch；`(sourceRecordId, transformIndex)` 唯一约束作为防漏保护，避免遗漏锁路径时插入重复 mapped rows。

#### Delete 源事件

delete event 到达 Scheduler 时，source row 通常已经被 storage 删除；event 里的 `record` 是删除前查询得到的旧 snapshot。因此 delete 路径不能再对 source record 执行 `lockRecord`，否则 `SELECT ... FOR UPDATE` 会返回 0 行。

delete 流程：

1. 使用 mutation event 的 `record` 作为 source snapshot。
2. 根据 `sourceRecordId` 查询 mapped target rows，并使用 `FOR UPDATE` 锁住已有 mapped rows。
3. 生成删除 mapped rows 的 patch，不重新插入 transformed records。
4. apply patch。

伪代码：

```typescript
const sourceRecordSnapshot = mutationEvent.record
const sourceRecordId = sourceRecordSnapshot.id

const mappedRecords = await storage.atomic.lockRows(
    targetRecordName,
    MatchExp.atom({ key: sourceRecordIdKey, value: ['=', sourceRecordId] }),
    ['*']
)

return mappedRecords.map(mappedRecord => ({
    type: 'delete',
    affectedId: mappedRecord.id
}))
```

delete 场景只锁 mapped rows 是可以接受的：source delete 本身已经通过 PostgreSQL 对 source row 的删除操作与并发 source update/delete 串行化；delete patch 不会从空 mapped set 插入新行，因此没有 update 场景的空集合 gap lock 问题。

## 7. `applyResult` 路径调整

即便 computation 内部用了原子 state，最后的 computed property 写回也不能再使用非原子 `lastValue → applyResult` 覆盖。

### 7.1 聚合类 result

Count/Sum/Average/Every/Any/WeightedSummation 的增量路径应直接返回内部原子 state 更新后的最新结果：

```typescript
return nextValue
```

`applyResult` 写回对外 computed property 时仍使用当前 `storage.update()` / `dict.set()` 路径。这个路径会生成 `RecordMutationEvent`，因此不会切断下游 reactive 链。

这个普通写回是安全的，前提是聚合 result 的线性化点已经发生在同一事务里的内部 atomic state 上：

- Global aggregate：`_ComputationState_` 中的 aggregate row 是线性化点。
- Property aggregate：host record 上的 internal aggregate state 是线性化点。
- `applyResult` 只负责把已经线性化出的 `nextValue` 写到用户可见字段并派发事件。

第一阶段不把对外 computed property 本身作为累加目标。若未来为了减少一次写入而直接原子更新对外 computed property，必须新增 `applyAtomicResult` 之类的专门路径：它既要执行原子写入，也要生成与 `storage.update(host, id, { computedProperty })` 等价的 mutation event，并让 Scheduler 跳过普通 `applyResult`，避免 stale result 再次覆盖。

### 7.2 StateMachine result

StateMachine 的 `currentState` 是内部 state，computed property 是对外值。锁保护的迁移成功后再 `applyResult` 写 computed property。

如果两个事务并发：

- 第一个事务锁住 state/host record，读取 previous value，写 internal currentState，返回 result。
- 第二个事务等待后基于新的 currentState 重新判断 transition。
- 没有合法 transition 的事务返回 skip，不写 result。

因此不会覆盖。

### 7.3 Internal state 与 external result 的事件边界

Atomic API 必须区分两类写入：

- internal contribution / aggregate state：默认不触发用户可见 mutation event，避免内部状态更新反复触发 computation。
- external computed property / dictionary result：必须通过 `applyResult` 或未来的 `applyAtomicResult` 生成等价 mutation event，保证下游 computation 仍会被触发。

## 8. 初始化与全量重算

`compute(...)` 全量路径仍可以使用 `set`，因为它通常发生在：

- setup 初始化。
- repair / rebuild。
- 明确的 full recompute。

但需要两条约束：

1. full recompute 不能和普通 dispatch 并发执行，除非后续用 SERIALIZABLE 兜底。
2. compute 内部写 contribution state 时可以继续 `set`，但若允许在线 full recompute，则必须改为独占锁或 SERIALIZABLE。

本阶段默认只改造增量路径，full recompute 并发控制留到第二阶段。

## 9. 推荐实施顺序

### Step 1：Storage atomic API

先实现 PostgreSQL：

- `atomic.increment`
- `atomic.replace`
- `atomic.compareAndSet`
- `atomic.lockRecord`
- `atomic.lockRows`

同时显式创建 `_ComputationState_` internal table 及其 `key` primary key，不能依赖普通 Entity schema。

并为每个 API 写直接的 storage 单元测试。

### Step 2：BoundState 方法

给 `RecordBoundState` / `GlobalBoundState` 接入 atomic API。

测试：

- 同一 record 并发 100 次 `increment(1)`，结果为 100。
- 同一 record 并发 `replace`，每次返回的 oldValue 串行一致。
- 同一 record 并发两个 `compareAndSet('pending', ...)`，只有一个成功。
- 事务 A `lockRecord` 未提交时，事务 B 锁同一 record 必须等待。

### Step 3：StateMachine

优先改 StateMachine，因为非法迁移的业务风险最高。

测试：

- 同一个 record 并发 approve/reject。
- 断言只有一个 transition 成功。
- 断言 computed property 与 internal currentState 一致。

### Step 4：Count / Summation / Average

这三类覆盖最常见聚合热点。

测试：

- 多进程并发 create/delete/update 源记录。
- 最终 global/property 聚合值与重新全量扫描结果一致。

### Step 5：Every / Any / WeightedSummation

沿用同一 contribution + counter 模式。

### Step 6：Transform

实现 update/delete 分流、source update 的 source record lock、mapped rows lock，以及 `(sourceRecordId, transformIndex)` PostgreSQL 唯一索引。

测试：

- 同一 source record 并发 update。
- source delete 使用 delete event record，不要求锁已删除 source record，并能清理 mapped rows。
- mapped records 不重复、不丢失、不残留旧 index。

## 10. 测试清单

### 10.1 原子原语测试

- `increment`：100 个并发事务，每个 `+1`，最终值为 100。
- `increment`：并发正负 delta，最终值等于 delta 总和。
- `replace`：并发替换同一 field，所有 oldValue 组成一条合法串行链。
- `compareAndSet`：同一 expected 下多个 next 只有一个成功。
- `compareAndSet`：数据库值为 NULL 时，default value 语义与 `BoundState.get()` 一致。
- `lockRecord`：事务 A 锁 record 未提交时，事务 B 锁同一 record 必须等待。
- `lockRows`：事务 A 锁行未提交时，事务 B patch 同一行必须等待。
- `_ComputationState_`：`key` primary key / unique constraint 存在，并发 global upsert 只生成一行。

### 10.2 Computation 测试

- GlobalCount 并发 create，最终 count 正确。
- PropertyCount 同一 host 并发 add relation，最终 count 正确。
- GlobalSum 并发 update 数值字段，最终 sum 正确。
- PropertySum 同一 host 并发 create/delete relation，最终 sum 正确。
- GlobalAverage 并发 create/update/delete，最终 average 正确。
- PropertyAverage 同理。
- Every/Any 并发改变 match 状态，最终 boolean 正确。
- StateMachine 并发互斥 transition，只有一个成功。
- Transform 同一 source record 并发 update/delete，最终 mapped result 与最后一次串行结果一致。
- Transform delete 不锁已删除 source record，使用 delete event record 清理已有 mapped rows。

### 10.3 多进程测试要求

必须用 PostgreSQL 真库，多 Node.js process 或 worker 并发。单进程 Promise 并发不足以证明多连接事务正确性。

第一阶段测试报告必须标注哪些路径仍会 fallback 到 `ComputationResult.fullRecompute()`。这些路径的在线并发控制留到第二阶段，不能把 full recompute、`IDSystem` 重复 id、async return 事务边界等已知非目标误判为本阶段 atomic state 失败。

## 11. 非目标

本阶段不处理：

- PostgreSQL `pg.Pool` 改造。
- SERIALIZABLE retry 兜底。
- `IDSystem` 改 sequence。
- Custom computation 的并发安全声明。
- 在线 full recompute 的事务隔离。

这些属于第二阶段。第一阶段先把 framework 内置 computation 的高频增量路径做成 race-free。

## 12. 最终验收标准

完成本阶段后，应满足：

1. 内置 computation 的增量路径不再出现 `state.get() -> state.set()` 形式的读改写。
2. Count/Sum/Average/Every/Any/WeightedSummation 的 delta 都基于 atomic contribution state 计算。
3. delete 路径不更新已删除 record 上的 contribution state，而是从 delete event record 读取旧 contribution。
4. StateMachine 的迁移在 state/host record lock 内完成，`computeValue` 使用同一锁保护时刻读取到的 previous value。
5. Transform update 对 source record 加锁；Transform delete 不要求锁已删除 source record，而是使用 delete event record 并锁定已有 mapped rows。
6. Transform 强制创建 `(sourceRecordId, transformIndex)` PostgreSQL 唯一索引。
7. `_ComputationState_` 由 PostgreSQL 专用 DDL 创建，并保证 `key` 唯一。
8. 用户可见 computed property / dictionary result 的写回必须产生等价 mutation event，不能绕过 reactive event 链。
9. PostgreSQL 多进程并发测试稳定通过，并区分第一阶段覆盖路径与明确留到第二阶段的问题。

