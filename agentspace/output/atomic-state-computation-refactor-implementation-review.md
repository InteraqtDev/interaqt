# 原子 State / Computation 实现 Review

Review 对象：当前工作区中按 `agentspace/output/atomic-state-computation-refactor-design.md` 落地的实现改动。

结论：**当前实现通过了现有全量 Vitest，但还不能视为第一阶段完成态。**

这轮实现已经把大部分内置 computation 的增量路径从 `get -> compute -> set` 改成了 contribution state + atomic aggregate state，这是正确方向。但 review 发现若干实现妥协和偏离，其中部分会在 PostgreSQL 多进程并发下继续产生错误，必须修复后才能认为满足原计划。

需要明确的是：`transaction context`、`global lock`、以及服务内置 global multi-state aggregate 的内部原语不是第二阶段的可选优化，而是第一阶段必须补齐的基础能力。否则 `replace/lockRecord/StateMachine` 的锁语义、`GlobalStateMachine` 的迁移语义，以及 `GlobalAverage/GlobalEvery` 的结果线性化都无法满足第一阶段目标。

已验证：

- `npm test`：110 个 test files / 1408 个 tests 全部通过。
- 新增 `tests/runtime/atomicState.spec.ts` 覆盖了基础 atomic primitive 行为。

但现有测试主要是单进程 SQLite/PGLite 路径，不能证明 PostgreSQL 多连接、多进程事务语义正确。

## 必须修复的问题

### 1. `GlobalBoundState.lock()` 会在并发下写回旧值

当前实现：

```typescript
async lock(): Promise<T | null> {
    const { oldValue } = await this.replace(await this.get())
    return oldValue
}
```

这是一个严重偏离。它用一次无锁 `get()` 得到 value，再用 `replace(value)` 获取锁并写回这个 value。并发时可能出现：

1. 事务 A 先 `get()` 到 `enabled`。
2. 事务 B 成功把 state 改成 `disabled` 并提交。
3. 事务 A 的 `replace(enabled)` 等锁后执行，把已经提交的 `disabled` 覆盖回 `enabled`。
4. A 看到的 `oldValue` 可能是 `disabled`，于是 skip，但 state 已经被错误回滚。

这和原计划“StateMachine 的迁移在 state/host record lock 内完成”不一致。当前 global state machine 在高并发下仍可能非法回退 internal currentState。

应该修复，并且这是第一阶段必须完成的内容。`GlobalBoundState.lock()` 不能通过 `replace(await get())` 模拟，应该新增真正的 global lock primitive：

- 对 `_ComputationState_` 指定 key 执行 `SELECT ... FOR UPDATE`。
- key 不存在时先以 default value 初始化，再锁住该行。
- 只读取，不写回。
- `GlobalStateMachine` 在同一锁保护下读取 internal state、判断 transition、写 next state。

### 2. GlobalAverage / GlobalEvery 缺少共同线性化点

当前 `GlobalAverage` 分别更新两个 global state：

```typescript
const sum = await this.state.sum.increment(sumDelta)
const count = await this.state.count.increment(countDelta)
return count > 0 ? sum / count : 0
```

`GlobalEvery` 也分别更新 `matchCount` 和 `totalCount`。

这是对原计划的隐性偏离。原计划在 `applyResult` 章节说 Global aggregate 的线性化点是 `_ComputationState_` 中的 aggregate row，但当前实现把一个逻辑 aggregate 拆成了多个 `_ComputationState_` rows。两个事务可以交错更新不同 rows，导致返回的 `sum/count` 或 `matchCount/totalCount` 不是同一串行时刻的组合，外部 computed result 仍可能被 stale 或不一致结果覆盖。

应该修复，并且这是第一阶段必须完成的内容。可选方向不是新增用户 API，而是在内部为多字段 global aggregate 增加一个共同线性化点：

- 为一个 computation 的 multi-state aggregate 使用同一个 global lock key。
- 或把 global aggregate 的多个数值放在同一 `_ComputationState_` row 的 JSON/typed payload 里，用一条 locked read/write 更新。
- 或新增内部 `atomic.updateGlobalFields(...)`，在同一 row lock 下返回一致的字段组合。

PropertyAverage / PropertyEvery 的 `sum/count` 或 `match/total` 都在同一 host record 上，PostgreSQL 行锁会在事务内串行化同一 host record，因此风险主要集中在 global 多 row state。

### 3. Atomic primitive 本身没有保证事务边界

原计划要求 `replace` 的 `SELECT ... FOR UPDATE` 和 `UPDATE` 必须“封装在同一个 state 原语内部、同一事务内”。当前实现把两条 SQL 放进同一个方法，但没有自己开启事务，也没有检测调用方是否已在事务中。

在 `Controller.dispatch()` 内调用时，外层事务通常存在，所以 computation 增量路径基本能得到事务保护。但 `storage.atomic.*` 是挂在 storage 上的 internal API，测试和未来内部调用可以直接调用它。一旦在 PostgreSQL autocommit 模式下直接调用：

- `SELECT ... FOR UPDATE` 的锁只在该 statement 事务内有效。
- 后续 `UPDATE` 已经不再受同一锁保护。
- `replace` / `lockRecord` / `lockRows` 的语义低于设计承诺。

应该修复，并且这是第一阶段必须完成的基础设施，不应推迟到第二阶段。内部 atomic API 至少需要一种明确机制：

- 要么由 atomic primitive 自己在无外层事务时开启短事务。
- 要么 storage 维护 transaction depth，atomic API 断言必须在事务中调用，并给出清晰错误。
- 要么把 `replace` 改成 PostgreSQL 单 statement 且有真实锁依赖的 writable CTE。

目前“依赖外层 dispatch transaction”可以解释为实现简化，但不应该作为最终状态。更准确地说，本阶段至少要让 storage 维护 transaction depth，并让需要锁语义的 atomic primitive 在无事务调用时 fail fast；否则这些 primitive 的设计契约本身不成立。

### 4. Global `replace` 对缺失 key 的并发插入不安全

当前 global `replace` 对 `_ComputationState_` 的逻辑是：

1. `SELECT ... WHERE key = ? FOR UPDATE`
2. 如果存在则 `UPDATE`
3. 如果不存在则 `INSERT`

当 key 不存在时，`SELECT FOR UPDATE` 锁不到任何 row。两个进程并发 replace 同一个新 key 时，都会走 insert，其中一个会触发 primary key 冲突。这个行为不符合 `replace` 应该作为原子 state primitive 的预期。

应该修复。global state key 应先被初始化，或 `replace` 对 missing key 使用 `INSERT ... ON CONFLICT ... DO UPDATE` 并能正确返回旧值。若需要 oldValue，则可用一条 CTE 或先通过 per-key advisory lock / bootstrap row 保证缺失 key 也有锁点。

### 5. Internal state 写入仍会产生用户可见 mutation event

原计划明确区分：

- internal contribution / aggregate state：不触发用户可见 mutation event。
- external computed property / dictionary result：必须通过 `applyResult` 触发等价 event。

当前新增的 `increment` / `replace` / `compareAndSet` 使用底层 SQL，确实不会走 `callWithEvents`。但旧的 `RecordBoundState.set()` 仍然通过 `storage.update()` 写 record，会产生 mutation event；`GlobalBoundState.set()` 现在还会同步写 `_Dictionary_` 镜像，也会产生 dictionary event。

这影响两类路径：

- full compute / setup 仍大量使用 `state.set(...)`。
- StateMachine 增量迁移仍使用 `currentState.set(...)` 写 internal currentState。

这和“internal state 默认不触发用户可见 mutation event”不一致。现有测试能通过，说明当前事件链没有明显坏掉，但框架语义仍不干净。

应该修复。建议拆出 internal setter：

- `RecordBoundState.setInternal(...)` / `GlobalBoundState.setInternal(...)` 不发 event。
- full compute 和 StateMachine internal currentState 写入使用 internal setter。
- 只有 computed result 继续走 `applyResult` / `applyResultPatch`。

## 有意妥协或兼容性偏离

### 1. `GlobalBoundState.set()` 同时写 `_ComputationState_` 和 `_Dictionary_`

原计划写的是：

- 新的 `GlobalBoundState` 默认读写 `_ComputationState_`。
- computation state 不再混入普通 dictionary。

当前实现为了让既有 custom / realTime / scheduler 测试继续通过，在 `GlobalBoundState.set()` 中写 atomic state 后，又同步写了一份 `_Dictionary_`：

```typescript
await this.controller.system.storage.atomic.replace(...)
await this.controller.system.storage.dict.set(this.key, value)
```

原因是一些既有测试直接通过 `storage.dict.get('_xxx_bound_state')` 读取内部 bound state。这是测试和历史行为耦合，不是新设计想保留的公共 contract。

是否应该修复：**应该修，但可以分阶段。**

短期可保留 dictionary mirror 作为兼容层，但必须明确 `_ComputationState_` 是 source of truth。长期应该改测试，不再从 `_Dictionary_` 读取 internal state，然后移除镜像写入。否则同一个 internal state 有两个存储位置，`increment/replace/CAS` 不同步 mirror，debug 时很容易读到过期值。

### 2. `_ComputationState_` DDL 同时出现在 PostgreSQL driver 和 `MonoStorage.setup()`

原计划要求 PostgreSQL driver-owned internal DDL。当前实现有两处创建：

- `PostgreSQLDB.open()` 创建 JSONB 版本。
- `MonoStorage.setup()` 在 `createTables` 时创建 JSON 版本，用于 SQLite/PGLite 测试兼容。

原因是现有 runtime 测试大量运行在 SQLite/PGLite 上；如果只在 PostgreSQL driver 创建表，现有测试会失败。

是否应该修复：**架构上应该收敛。**

建议把能力下沉为 driver hook，例如 `database.setupInternalComputationState?.()`，PostgreSQL 实现正式 JSONB schema，测试 driver 可以提供兼容 schema。这样 runtime 不需要知道 driver-specific DDL，也不会出现同一张内部表在不同位置重复定义。

### 3. Atomic SQL 做了 SQLite/PGLite 兼容分支

原计划明确“先只保证 PostgreSQL”。当前实现为了跑通全量测试：

- 通过 `database.getPlaceholder()` 同时支持 `$1` 和 `?`。
- SQLite 下跳过 `FOR UPDATE`。
- 对 SQLite `RETURNING` 不返回 rows 的情况用 `atomic.get()` 兜底。

这些不是 PostgreSQL 目标的一部分，属于测试兼容性妥协。

是否应该修复：**不一定要删除，但应该隔离。**

如果继续保持全量测试跨 driver 通过，可以保留兼容层；但 PostgreSQL 正确性测试必须单独覆盖，不能因为 SQLite/PGLite 测试通过就认为并发正确。

### 4. Transform 唯一索引只对 data-based Transform 生效

实现中给 `sourceRecordId` state 打了 `unique = !this.eventDeps`，因此 event-based Transform 不创建 `(sourceRecordId, transformIndex)` 唯一索引。

这和文档“Transform 强制创建唯一索引”的字面描述不完全一致，但从语义看是合理的：event-based Transform 经常是 append-only audit / notification，每次事件都可以为同一个 source record 生成 index 0 的新记录。给它加唯一索引会错误阻止合法 insert。

是否应该修复：**不需要按字面强制修复，但设计文档应补充限定。**

唯一索引应明确只适用于 data-based Transform 的 mapped rows patch 模式；event-based Transform 不维护 source record 的一组可替换 mapped rows，不应共享这个约束。

## 测试覆盖不足

### 1. 没有 PostgreSQL 多进程测试

原计划要求：

- PostgreSQL 真库。
- 多 Node.js process 或 worker 并发。
- 验证 global/property 聚合、StateMachine、Transform 的最终值与全量扫描一致。

当前新增的 `atomicState.spec.ts` 使用 PGLiteDB，并且是单进程 `Promise.all`。它能覆盖 API 基础语义，但不能证明 PostgreSQL 多连接 row lock / `ON CONFLICT` / transaction wait 行为。

应该补。至少需要：

- 多进程并发更新同一 record contribution，验证 Count/Sum/Any/WeightedSummation。
- 多进程并发 GlobalAverage / GlobalEvery，尤其覆盖前面指出的多 row state 问题。
- 并发 approve/reject 同一 StateMachine target。
- 并发 Transform update 同一 source record，从 0 mapped rows 变为 N mapped rows。
- `lockRecord` / `lockRows` 的等待测试。

### 2. Atomic primitive 测试还没有覆盖 replace 串行链和 lock wait

当前测试覆盖了：

- record increment 100 次。
- record replace 返回 old/new。
- record CAS 只有一个成功。
- global increment 正负 delta。

还缺：

- 并发 `replace` oldValue 形成合法串行链。
- `compareAndSet` NULL/default 语义。
- `lockRecord` / `lockRows` 在事务 A 未提交时阻塞事务 B。
- `_ComputationState_` key 唯一性在 PostgreSQL 多连接下成立。

这些都应该补。

## 其他风险

### 1. `FOR UPDATE` 直接拼到复杂 SELECT 末尾可能不适用于带 LEFT JOIN 的查询

`lockRecord` / `lockRows` 复用了 `QueryExecutor.findRecords()`，通过在生成的 SELECT 后追加 `FOR UPDATE` 实现锁。

简单 `['*']` 查询通常没问题。但如果 `attributeQuery` 包含 x:1 join，PostgreSQL 对 `LEFT JOIN ... FOR UPDATE` 可能报错，或者锁范围超过预期。Transform 的 source `attributeQuery` 是用户传入的，完全可能包含关系路径。

应该修复。更稳的实现是：

1. 用 root table/id 单独执行 `SELECT id FROM root WHERE id = ? FOR UPDATE`。
2. 锁住 root row 后，再用普通 `findOne/find` 读取完整 attributeQuery。
3. `lockRows` 对 mapped rows 也只锁 root target rows，不锁 join 出来的关联行。

### 2. full recompute fallback 仍存在，且没有产出覆盖路径报告

实现保留了不少 `ComputationResult.fullRecompute(...)` fallback，例如 mutation source 不匹配、related mutation path 超出支持范围、部分 dataDeps 变化等。

原计划允许第一阶段区分“仍 fallback 到 full recompute 的路径”，但要求测试报告标注。当前没有单独报告这些路径。

是否应该修复：**不一定要改代码，但应该补文档/测试说明。**

属于第二阶段在线 full recompute 并发控制之前的已知边界，不能误认为第一阶段已经覆盖所有 reactive path。

## 总体建议

建议不要直接把当前实现视为 merge-ready 的最终第一阶段。推荐按以下顺序修复：

第一阶段必须完成：

1. 补 `transaction context` / transaction depth，并让需要锁语义的 atomic primitive 在无事务时 fail fast，或由 primitive 自己安全管理短事务。
2. 修复 `GlobalBoundState.lock()`，禁止 `replace(await get())`，改为真正的 global row lock。
3. 为 GlobalAverage / GlobalEvery 增加共同线性化点；可以是内部 lock row、单 row multi-state payload，或只服务内置 computation 的 `atomic.updateGlobalFields(...)`。
4. 修复 missing global key 的 `replace` 并发插入。
5. 拆出 internal state setter，避免 internal state 写入发 mutation event。

可以作为后续清理或第二阶段内容：

6. 把 `_ComputationState_` DDL 和 SQLite/PGLite 兼容逻辑收敛到 driver hook。
7. 增加 PostgreSQL 多进程并发测试。

现有实现已经完成了大部分结构性改造，但上述“第一阶段必须完成”的第 1、2、3、4 项直接关系到 PostgreSQL 并发正确性，不能作为后续阶段的可选改进。第 5 项关系到 internal state / external result 的事件边界，也应该在第一阶段收口，避免后续 computation 继续依赖不干净的 state 写入语义。
