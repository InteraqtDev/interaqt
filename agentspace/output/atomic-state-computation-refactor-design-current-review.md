# 第一阶段原子 State / Computation 改造设计 Review（当前版）

Review 对象：`agentspace/output/atomic-state-computation-refactor-design.md`

结论：**当前版没有发现第一阶段必须阻塞实现的致命错误。**

设计已经把旧版中会直接破坏正确性的关键点补齐：delete 事件不再更新已删除 record、StateMachine 不再使用 CAS/锁之前预读的 `lastValue`、property aggregate 统一使用 host-bound internal state、Transform update/delete 分流，并且用户可见 computed result 仍通过 `applyResult` 进入事件链。

本文只判断第一阶段目标：通过原子 state 原语和内置 computation 增量路径改造，尽量减少 PostgreSQL 多进程并发下的错误场景。文档明确留到第二阶段的 PostgreSQL Pool、SERIALIZABLE retry、IDSystem sequence 化、async return 事务化、custom computation、在线 full recompute 并发控制，不作为本 review 的致命问题。

## 致命问题检查

### 1. delete contribution 路径

当前设计是正确的。

`DeletionExecutor` 会先查询待删除 record，再执行实际删除，最后把删除前 snapshot 放入 delete mutation event。Scheduler 收到 delete event 时，source row / relation row 通常已经不存在。因此第一阶段设计明确要求：

- Count / Sum / Average / Every / Any / WeightedSummation 的 delete 路径从 delete event record 读取旧 contribution。
- delete 路径不能对已删除 record 执行 `replace(record, 0)` 或 `replace(record, false)`。

这和当前 storage 事件模型匹配。只要实现时保证 delete 查询的 attributeQuery 包含 internal state 字段，就不会丢失旧 contribution。

### 2. StateMachine 线性化

当前设计是正确的。

现有 `Scheduler.runComputation()` 会在调用 `incrementalCompute` 前按 `useLastValue` 预读 external computed property。这个值在并发下可能早于 StateMachine 的锁等待或 CAS 成功时刻，不能继续作为 `computeValue(previousValue, event)` 的输入。

当前设计已经要求：

- StateMachine 设置 `useLastValue = false`。
- Property StateMachine 先锁 host record，再在锁内读取 internal currentState 和 external computed property。
- 成功迁移 internal currentState 后，使用同一锁保护时刻的 previous value 调用 `computeValue`。
- Global StateMachine 同理通过 global state lock 与 external value 读取形成同一串行时刻。

这能避免 internal state 已串行化、external value 却使用 stale `lastValue` 的错误。

### 3. Property aggregate 写回

当前设计是正确的。

第一阶段没有直接把用户可见 computed property 作为原子累加目标，而是为 property aggregate 增加 host-bound internal aggregate state：

- `PropertyCount` 维护 host-bound `count`。
- `PropertySum` 维护 host-bound `sum`。
- `PropertyAverage` 维护 host-bound `sum` 和 `count`。
- `PropertyEvery` / `PropertyAny` 维护 host-bound `totalCount` 和 `matchCount`。

internal aggregate state 是线性化点，`applyResult` 只把已经线性化出的 `nextValue` 写回用户可见 computed property。由于 host-bound state 和 computed property 在同一 host row 上，PostgreSQL row lock 会串行化同一 host 的并发更新；同时普通 `applyResult` 仍会触发当前 reactive event 链。

### 4. Transform update/delete

当前设计是正确的。

Transform update 和 delete 已经分开：

- source update：锁 source record，锁已有 mapped rows，重新计算 transformed records，再 patch。
- source delete：不再锁已删除 source record，而是使用 delete event record 作为 source snapshot，只锁已有 mapped rows 并生成 delete patch。
- `(sourceRecordId, transformIndex)` 唯一约束是强制 PostgreSQL DDL，不是建议项。

这解决了两个关键问题：

1. update 场景中，mapped rows 可能为空，单纯 `SELECT ... FOR UPDATE` 锁 mapped rows 锁不住空集合；锁 source record 才是稳定线性化点。
2. delete 场景中，source row 已经不存在，不能要求 `lockRecord(source)` 成功；只删除已有 mapped rows，不会从空集合插入新 mapped rows，因此不需要 gap lock。

## 必须守住的实现约束

以下不是设计层面的致命错误，但实现时必须明确落地，否则会把正确设计实现成错误系统。

### 1. `_ComputationState_` 必须是 PostgreSQL internal DDL

Global state 的 `increment` 依赖：

```sql
INSERT INTO "_ComputationState_" ("key", "numberValue")
VALUES ($key, $delta)
ON CONFLICT ("key")
DO UPDATE SET "numberValue" = COALESCE("_ComputationState_"."numberValue", 0) + $delta
RETURNING "numberValue";
```

因此 `_ComputationState_.key` 必须有真实 primary key / unique constraint。当前普通 ER setup 只适合生成 record table 和普通 property，不应该拿普通 Entity schema 去模拟这个 internal table。

实现还需要同步调整 `setupGlobalBoundStateDefaultValues()` 一类初始化路径，让 `GlobalBoundState` 的默认值进入 `_ComputationState_`，而不是继续只写 `_Dictionary_`。

### 2. Transform 唯一约束必须按 computation 维度生成

`(sourceRecordId, transformIndex)` 唯一索引必须落到 target table 的对应 internal state fields 上，例如：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "<transform_unique_index>"
ON "<TargetTable>" ("<sourceRecordIdStateField>", "<transformIndexStateField>");
```

索引名要稳定且避免冲突；索引列要对应当前 Transform 的 state fields，不能把不同 Transform 或不同 target 的 mapped rows 混在一起约束。

### 3. atomic helper 不能绕过事务边界

`increment`、`replace`、`compareAndSet`、`lockRecord`、`lockRows` 必须使用当前 dispatch 事务里的同一个 PostgreSQL connection。特别是 `replace` 如果采用 `SELECT ... FOR UPDATE` 加 `UPDATE` 两条 SQL，它们必须封装在一个 atomic 原语内部、同一事务内，调用方不能自行拆开。

### 4. internal state 写入默认不发用户事件，external result 写入必须发事件

internal contribution / aggregate state 的原子写入不应该触发普通 mutation event，否则会让 computation 被自身内部状态反复触发。

用户可见 computed property / dictionary result 的写回必须继续通过 `applyResult` 或等价 `applyAtomicResult` 产生事件。当前设计采用普通 `applyResult`，这个选择与现有 runtime 结构匹配。

### 5. delete event record 必须包含 internal state 字段

delete 路径依赖 event record 上的旧 contribution。当前删除入口使用完整 attributeQuery 查询删除前 record；实现第一阶段时不能为了裁剪查询字段而漏掉 computation internal state columns。

## 非致命：明确留到第二阶段的风险

以下问题仍然重要，但按任务边界不计入第一阶段致命问题：

- PostgreSQL driver 仍是单 `pg.Client`，同一进程内更完整的连接并发模型留到 Pool 阶段。
- `_IDS_` 仍可能在多进程 concurrent create 下产生重复领域 id，sequence 化属于第二阶段。
- Custom computation 仍可手写 `get -> set`。
- async return 仍不在 dispatch 事务边界内。
- full recompute 与普通 dispatch 并发仍需要 SERIALIZABLE / 独占锁兜底。

第一阶段测试如果包含并发 create，可能被 `_IDS_` 的已知问题污染。为了验证本阶段本身，应单独区分“computation atomic state 失败”和“IDSystem 重复 id 失败”。

## 建议验收标准

当前设计的验收标准基本充分，建议实现验收时特别检查：

1. 内置 computation 的增量热点路径不再出现 `state.get() -> state.set()` 形式的读改写。
2. delete 路径只从 delete event record 读取旧 contribution，不更新已删除 row。
3. StateMachine 的 previous external value 与 successful transition 的 previous state 来自同一锁保护时刻。
4. Property aggregate 的 internal aggregate state 与 external result 写回不会被旧事务覆盖。
5. Transform update 锁 source record；Transform delete 不锁已删除 source record。
6. `_ComputationState_` 和 Transform unique index 都由 PostgreSQL DDL 强制保证约束。
7. PostgreSQL 多进程测试报告明确列出仍会 fallback 到 full recompute 的路径，以及第二阶段才处理的 IDSystem / async return 风险。

综合判断：当前第一阶段设计可以进入实现；没有看到需要推翻 atomic state 原语、runtime 事件模型或两阶段总体方案的架构级阻塞。
