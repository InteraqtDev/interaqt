# 第一阶段原子 State / Computation 改造设计 Review

Review 对象：`agentspace/output/atomic-state-computation-refactor-design.md`

结论：**不建议按当前文档直接实施。**

第一阶段的总体方向是对的：把内置 computation 的增量路径从 `get -> compute -> set` 改成数据库原子原语，是减少 PostgreSQL 多进程并发 bug 的正确第一步。但当前设计里有几个致命问题，会导致第一阶段实现后仍然在常见路径上出错，或者部分路径根本无法按文档实现。

以下只列“第一阶段必须修”的问题。明确属于第二阶段的 PostgreSQL Pool、SERIALIZABLE retry、IDSystem sequence、async return 事务化、在线 full recompute 并发控制，不计入致命问题。

## 致命问题 1：delete 事件不能对已删除 record 执行 `replace`

文档多处建议在 delete 时把 contribution state 原子替换成 0 / false：

```typescript
const { oldValue } = await itemValue.replace(record, 0)
const next = await sum.increment(-(oldValue ?? 0))
```

以及：

```typescript
const { oldValue } = await isItemMatch.replace(record, false)
const matchDelta = oldValue ? -1 : 0
```

这在当前框架执行模型下是不可行的。`MonoStorage.callWithEvents()` 是先执行 storage delete，再同步派发 mutation events。也就是说 computation 收到 delete event 时，被删除的 source record / relation record 通常已经不在数据库里了。

当前代码之所以能在 delete 路径读到旧 contribution，是因为 delete event 的 `record` 携带了删除前查询出的完整 record：

- `GlobalSumHandle` delete 当前使用 `this.state.itemValue.get(mutationEvent.record)`。
- `PropertySumHandle` delete 当前使用 `this.state.itemResult.get(relatedMutationEvent.record)`。
- Count / Every / Any 也依赖 delete event record 上的旧 state。

如果改成 `replace(record, 0)`，底层 SQL 会变成：

```sql
UPDATE "Record"
SET "state_key" = $newValue
WHERE "id" = $id
RETURNING ...
```

但 row 已经删除，结果是 0 行，拿不到旧 contribution。这样 delete 的 delta 会丢失，聚合值必然错误。

### 必须修改

delete 路径不能用 `replace` 更新被删除行上的 contribution state。应该使用 delete event record 中携带的旧 state 计算 delta：

- `Summation / WeightedSummation`：`delta = -(oldContributionFromDeletedRecord ?? 0)`。
- `Count / Every / Any`：`delta = oldMatchFromDeletedRecord ? -1 : 0`。
- `Average`：`sumDelta = -(oldContributionFromDeletedRecord ?? 0)`，`countDelta = -1`。

这个读取不需要再原子替换 deleted row。删除同一行本身已经由 PostgreSQL 行锁串行化；delete event record 应该是该事务实际删除前读到的最新版本。

如果担心 event record 没有带 state 字段，必须先保证 delete 查询的 attributeQuery 包含 framework internal state 字段，而不是在 computation 中更新已删除 row。

## 致命问题 2：Transform 的 `lockRows(mapped rows)` 不能锁住空集合

文档认为 Transform update/delete 的并发保护可以通过锁定同一 source record 已有 mapped rows 完成：

```typescript
const mappedRecords = await storage.atomic.lockRows(
    targetRecordName,
    MatchExp.atom({ key: sourceRecordIdKey, value: ['=', sourceRecordId] }),
    ['*']
)
```

这只能保护“已经存在 mapped rows”的情况。若某个 source record 当前没有 mapped rows，`SELECT ... FOR UPDATE` 返回空集合，不会锁任何东西。

典型错误场景：

1. source record 当前 transform 结果为空，没有 mapped rows。
2. 两个进程并发 update 同一个 source record。
3. 两边都 `lockRows(...)`，都锁到空集合。
4. 两边都重新计算出一条或多条 transformed records。
5. 两边都 insert，产生重复 mapped rows。

同样的问题也会出现在 mapped row 数量从 0 增加到 N、或某些 index 原本不存在但并发插入的场景。

文档提到“建议加唯一约束 `(sourceRecordId, transformIndex)`”，但这里不能只是建议。没有唯一约束或 source-level 锁，`lockRows` 无法杜绝 Transform 并发 bug。

### 必须修改

Transform 第一阶段至少需要一个稳定的线性化点：

1. **锁 source record**：对 source record 执行 `SELECT ... FOR UPDATE`，让同一 source record 的 transform patch 串行化。这个是最简单、最符合当前“只有一个数据库”的方案。
2. 同时把 `(sourceRecordId, transformIndex)` 唯一约束升级为强制要求，作为防漏保护。

只锁 mapped rows 不够，因为 PostgreSQL 在 `READ COMMITTED` 下不会对“不存在的行”加 gap lock。

## 致命问题 3：StateMachine CAS 之后使用的是 CAS 之前读取的 `lastValue`

文档建议 StateMachine 流程为：

```typescript
const currentStateName = await this.state.currentState.get(dirtyRecord)
const nextState = this.transitionFinder.findNextState(currentStateName, mutationEvent)

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

问题是 `lastValue` 由 `Scheduler.runComputation()` 在调用 `incrementalCompute` 之前通过 `retrieveLastValue()` 读取。也就是说，`lastValue` 读取发生在 CAS 等待行锁之前。

并发下可能出现：

1. T1 读取 external computed property = `A_value`，CAS `A -> B`，稍后写入 `B_value`。
2. T2 在 T1 commit 前也读取 external computed property = `A_value`。
3. T2 的 CAS 等待 T1。
4. T1 commit 后，T2 读取到 internal state 已经可从 `B -> C`，CAS 成功。
5. T2 调用 `C.computeValue(lastValue, event)`，但传入的 `lastValue` 仍是过期的 `A_value`，不是 `B_value`。

这样 internal state 的迁移被 CAS 线性化了，但 external computed property 的计算输入仍然可能错。对于依赖 previous value 的 `computeValue`，这是错误结果。

approve/reject 这种互斥迁移可能不暴露这个问题，因为第二个 CAS 会失败。但 StateMachine 支持任意 transfers，不能假设并发事件只会竞争同一个 expected state。

### 必须修改

CAS 成功后不能继续使用 CAS 前读取的 `lastValue`。可选修正方式：

- StateMachine 增量路径禁用 `useLastValue` 的预读取，CAS 成功后重新读取 external computed property。
- 或者把 StateMachine 的状态行锁定、读取 currentState 和 external value、计算 nextState、写 currentState 放在同一个受锁保护的流程里。
- 更好的是让 StateMachine 的原子原语返回线性化点上的旧 state / 旧 external value，避免上层自己拼时序。

无论采用哪种方式，文档必须明确：`computeValue` 使用的 previous value 必须和成功迁移的 previous state 属于同一个串行时刻。

## 致命问题 4：Property aggregate 的原子写回目标没有统一定义

文档在不同章节里有两种不一致的说法：

1. 在各 computation 小节中，PropertyCount / PropertySum / PropertyAverage 的伪代码直接对 host record 上的聚合值做 `increment(hostRecord, delta)`。
2. 在 `applyResult` 路径调整中，又建议第一阶段先采用“原子 state 计算出 nextValue，再 `applyResult` 写回”的方式。

这两种方式的实现要求不同。

如果聚合结果直接存 computed property 本身，那么需要一个明确的 internal helper，可以把 computed property 当作 `RecordBoundState` 做 `increment` / `replace` / `compareAndSet`。这对 PropertyCount 无 callback、PropertySum、PropertyAverage、PropertyEvery/Any 都是核心路径。

如果聚合结果存独立 internal state，再普通 `applyResult` 写 computed property，那么文档必须为每个 property aggregate 明确新增对应的 aggregate state，例如：

- `PropertyCount` 无 callback 也需要 host-bound `count` state。
- `PropertySum` 需要 host-bound `sum` state，不能只维护 relation 上的 `itemResult`。
- `PropertyEvery/Any` 需要 host-bound `totalCount` / `matchCount` state。

当前文档没有统一选择，导致实现时很容易保留 `lastValue -> applyResult` 的非原子路径，或找不到可调用的 `hostCount.increment`。

### 必须修改

第一阶段应该明确选择一个实现模型。建议直接选择：

- property aggregate 的对外 computed property 本身就是原子更新目标；
- 新增内部 helper，将 property dataContext 转为 `{ recordName: host.name, id: hostRecord.id, field: computedPropertyName }`；
- computation 返回 `ComputationResult.skip()` 或返回已经原子写入的值时，`applyResult` 不能再次用旧值覆盖。

如果不想直接写 computed property，则必须为每个 property aggregate 新增 host-bound internal aggregate state，并证明 `applyResult` 写回不会被旧事务覆盖。当前文档没有完成这个证明。

## 可修复性判断：没有架构级阻塞，但必须补齐 atomic result apply

上述致命问题在当前框架里都能修复，没有看到必须推翻 runtime / storage 架构的阻塞点。

当前 `Storage` 接口虽然很薄，但底层 `Database.query/update` 已经允许执行原生 SQL；`EntityToTableMap` / `RecordInfo` / `AttributeInfo` 也能定位 record 的真实 table、id field 和 value field。因此 `storage.atomic.increment / replace / compareAndSet / lockRows / lockRecord` 可以作为 framework internal 能力添加到 `MonoStorage`，并先只在 PostgreSQL driver 下保证正确性。

但第一阶段必须补齐一个横向约束：**原子写回不能绕过当前事件系统。**

当前 computation 链依赖 `MonoStorage.callWithEvents()` 产生 mutation event，再由 `Scheduler` 同步触发下游 computation。普通 `storage.update()` 会发事件；如果新的原子 helper 直接执行 SQL，但没有生成等价的 `RecordMutationEvent`，则用户可见 computed property 虽然更新了，下游依赖这个 property 的 computation 却不会被触发，reactive 链会断。

因此第一阶段的 atomic API 需要区分两类写入：

- internal contribution state：默认可以不触发用户可见事件，避免状态字段更新反复触发 computation。
- external computed property result：必须生成与 `storage.update(host, id, { computedProperty })` 等价的 update event，或者通过一个专门的 `applyAtomicResult` 路径写入并派发事件。

尤其是 property aggregate 如果选择“computed property 本身作为原子更新目标”，就不能只返回 `nextValue` 再走普通 `applyResult`。正确流程应该是：

1. computation 内部对 computed property 执行原子 `increment / replace`。
2. 该原子写回同时记录必要的 mutation event。
3. computation 返回 `ComputationResult.skip()`，或返回一个明确表示“已写入”的结果，避免 Scheduler 再用 stale result 调用 `applyResult` 覆盖。

这不是阻塞问题，但如果设计文档不明确这一点，实现很容易“数据库值对了、响应式链错了”。

## 需要补强但不算致命的问题

### `replace` SQL 需要强制执行顺序

文档给出的 writable CTE：

```sql
WITH old AS (
    SELECT "field" AS old_value
    FROM "Record"
    WHERE "id" = $1
    FOR UPDATE
), updated AS (
    UPDATE "Record"
    SET "field" = $2
    WHERE "id" = $1
    RETURNING "field" AS new_value
)
SELECT old.old_value, updated.new_value
FROM old, updated;
```

建议改成让 `updated` 显式依赖 `old`，或者直接用 state 原语内部的两条 SQL：

```sql
SELECT "field" FROM "Record" WHERE "id" = $1 FOR UPDATE;
UPDATE "Record" SET "field" = $2 WHERE "id" = $1;
```

两条 SQL 封装在同一个 state 原语内部、同一事务内即可。重点是调用方不能自己拆开。

### `compareAndSet` 要处理默认值 / NULL

`RecordBoundState.get()` 当前会在 record 缺字段时返回 `defaultValue`。但 SQL CAS 如果直接写：

```sql
WHERE "field" = $expected
```

当数据库里实际是 `NULL` 而 expected 是默认值时会失败。对于新 schema 默认值正常落库的场景问题不大，但 migration / 老数据 / 手工插入数据会踩坑。

建议 CAS 明确支持：

```sql
WHERE COALESCE("field", $defaultValue) = $expected
```

或者在 setup / migration 阶段保证 internal state 字段永远不为 NULL。

### `Math.max(0, nextCount)` 不应该掩盖并发或事件错误

文档沿用了当前代码里“防止计数为负数”的习惯。并发改造后，负数通常意味着事件顺序、delete contribution、或 state 初始化有 bug。第一阶段测试中应该让负数暴露为错误，而不是把返回值 clamp 到 0 后继续运行。

## 非致命：可留到第二阶段的问题

以下问题重要，但文档已经明确排除在第一阶段之外，或者属于终局方案兜底层，所以本 review 不把它们算作第一阶段致命问题：

- PostgreSQL driver 从单 `pg.Client` 改 `pg.Pool`。
- `SERIALIZABLE + retry` 兜底。
- `_IDS_` 改 PostgreSQL sequence。
- `Scheduler.handleAsyncReturn` 事务化。
- Custom computation 的并发安全声明。
- 在线 full recompute 与普通 dispatch 并发。

但第一阶段实现和测试时要避免误判：只要某个内置 computation 仍会在常见事件中回退到 full recompute，它在多进程并发下仍然不是 race-free，只能说该路径留给第二阶段兜底。

## 建议修订后的第一阶段验收标准

当前文档的验收标准需要补充：

1. delete 路径不更新已删除 record 上的 contribution state，而是从 delete event record 读取旧 contribution。
2. Transform 对同一 source record 的 update/delete 必须锁 source record；mapped rows lock 只能作为补充。
3. StateMachine 的 `computeValue(lastValue, event)` 不能使用 CAS 前读取的 stale `lastValue`。
4. Property aggregate 必须明确原子写回目标：要么 computed property 本身原子更新，要么每个 aggregate 都有 host-bound internal state 且不会被 `applyResult` 旧值覆盖。
5. 用户可见 computed property 的原子写回必须产生等价 mutation event，不能绕过当前 reactive event 链。
6. `replace` / `compareAndSet` 的 PostgreSQL 实现必须有直接单元测试覆盖并发、NULL/default、0 行更新。

修完以上问题后，第一阶段方案才适合进入实现。
