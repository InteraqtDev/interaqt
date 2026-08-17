# 设计评审 — 应用键的跨副本原子占有

```text
结论: 通过
评审对象: docs/application-key-occupancy/application-key-occupancy.md
design-round（文档记载）: 1/15
status（文档记载）: 设计中
HEAD: c358cf9
评审日: 2026-08-17
```

独立评审当前设计文档。形成结论前未读取旧版评审正文。涉及可验证事实的判断均对照当前 HEAD 源码、既有测试，或本轮最小实验。

---

## 1. 评审范围与独立验证

阅读：Task 1 全文与编号要求；当前设计文档；`AGENTS.md` 相关原则；设计引用的源码与测试入口。

本轮亲自执行：

| 命令 / 实验 | 结果 |
|---|---|
| `git rev-parse HEAD` | `c358cf97e9be30e6d3fec73dd9c9a0fc670368fe`，与设计 §6.1 一致 |
| P1 / P2 / Adj-R1（PGLite / SQLite） | 7 例通过 |
| P3 / P4（真实 PostgreSQL 17，`INTERAQT_POSTGRES_DATABASE=interaqt_test`） | 2 例通过。P3.1/P3.2 败者 `ConstraintViolationError`，`context.code='KEY_TAKEN'`，`rawCode='23505'`，`effects=[]`，该 interaction 仅 1 行；P3.3 消费 update 事件 A=1/B=0；P4 顺序 `success-with-insert` / `success-no-insert`，竞态 10/10 轮同一分布 |
| 本轮新增 `review-at1-on-conflict.spec.ts` | 见下 |

设计把官方路径押在 `INSERT ... ON CONFLICT (身份物理列) DO NOTHING` 于 READ COMMITTED 下的等待与不插入，而设计期探针只覆盖了 UniqueConstraint 的 23505 与 Custom+lockRows。本轮用与框架 `database.insert` 相同的 RETURNING 契约、`CREATE UNIQUE INDEX`（非 UniqueConstraint Klass）、以及第二条 `(src, idx)` 唯一索引作非 arbiter，在真实 PostgreSQL 双连接上复验：10/10 轮恰好一行、恰好一次有 RETURNING 行、零错误（无 23505）；先插入未提交时对端等待，提交后对端 `insert()` 返回 `undefined`，既有载荷不变。SQLite / PGLite 顺序冲突同样空 RETURNING、既有载荷不变。

`assertNoIdInTransformedRecord` 在 `src/` 中无匹配，与设计「该守卫已移除」一致。

---

## 2. 六类复审条件逐项

### 2.1 关键事实错误

未发现会使方案整体失效的事实错误。抽查设计所依赖的 HEAD 行为，均与源码或本轮实验一致：

- UniqueConstraint 冲突经 `MonoSystem.callWithEvents` → `mapConstraintError` 成为不可重试的 `ConstraintViolationError`，整次 dispatch 回滚（含交互事件）。P1/P3 复证。`isRetryableTransactionError` 不含 23505（`src/runtime/transaction.ts`）。
- `storage.update` 先无锁预选再逐行更新（`UpdateExecutor.ts` 匹配查询后循环）；`atomic.lockRecord` 无行时返回 `undefined` 且不加锁（`MonoSystem.ts`）。
- 字典并发 create 唯一冲突转为 `RetryableWriteConflict`，重试后走 update（后写者覆盖）。
- `_DispatchIdempotency_` 为内部裸 DDL（`logicalPath: 'internal:...'`），不进 `createMigrationManifest` 的 records/relations/dictionaries/computations/sequences/storage 哈希输入。
- `Entity.retention` / `maintainEntityRetention` 对声明了 retention 的普通实体做 `storage.delete` 物理删除；对内部表不可见。
- 属性 StateMachine：`computeTarget` 以 controller 为 `this` 且被 await；只接受 `{id}`（及 relation 端点形态）；不能创建行（`applyResult` / `applyResultPatch` 的 property 分支按宿主 id 更新）。P2/P3.3 复证消费半边。
- 数据轨 Transform 的 insert 补丁不走 `requiresSerializablePatchApply`（该谓词仅 Custom 的 entity/relation patch）；update/delete 补丁自行要求 SERIALIZABLE。dispatch 默认 READ COMMITTED。
- `CreationExecutor.preprocessSameRowData` 在 INSERT 之前把 host create 推进 `events`；`insertSameRowData` 对 `database.insert` 做 `Object.assign`。`createTableSQL` 只拼接列名与 `fieldType`，忽略 `ColumnData.notNull`。Adj-R1 复证。
- `DispatchResponse.effects` 按 dispatch 使用 `AsyncLocalStorage`（`Controller.ts` `runDispatchAttemptBody`）。
- 逻辑 `id` 唯一索引与 Transform `(sourceRecordId, transformIndex)` 索引均走 `createUniqueIndexSQL`，不经 UniqueConstraint Klass。Identity 与这两条同族，可行。
- MySQL `transactions: false`，`Controller.dispatch` 不可用。S2 fail-fast 与任务非目标一致。
- 过滤实体创建：`NewRecordData` 已把 `recordName` 解析为 `resolvedBaseRecordName`，逻辑创建 INSERT 落在基表。身份元数据挂在物理基记录上时，经过滤名的 `storage.create` 不会单独分裂集合语义。

「先到者登记」在 HEAD 上确无框架承诺的声明式结果代数：Transform+UniqueConstraint 是故障加回滚；Custom+lockRows 的收敛依赖 SERIALIZABLE 重试与方言行为，且正确性前提在应用代码中。缺口裁定成立。

### 2.2 内部逻辑矛盾

未发现两项要求不能同时满足、关键路径不可达、或里程碑按设计无法通过验收的矛盾。

- UniqueConstraint 与 `Entity.identity` 分 Klass、分约束表、分写路径：前者永远冲突即故障并回滚，后者仅逻辑创建集合语义。D6 禁止同一属性集双声明。子集 / 超集 UniqueConstraint 与身份索引并存时，ON CONFLICT 指定身份列，其它唯一索引冲突仍为 23505——与「UniqueConstraint 永不改语义」一致。
- 集合语义只加在逻辑创建（`createRecord`），flash-out / relocate 走 `insertSameRowData` 且不加 ON CONFLICT。S1 禁止身份实体与另一非过滤实体三表合一，降低 relocate 命中身份行的可能，合同仍要求代码路径区分。
- 五种结果落在既有 `effects` + 按键查询，不新增响应通道。成功登记的主信号是本 dispatch 的 create 事件；「已被占用 / 已使用 / 已过期」依赖查询侧单调字段。官方配方写明 nonce 必须调用方唯一，且「无事件」不作孤立信号。
- 过期判定（`expiresAt` 与查询方时钟）与 retention 物理删除是两套时间；回收后按键无行、允许再登记。与任务「TTL 之后能否再登记必须文档化」一致。
- 全量重建按本次插入顺序集合化、不保留历史竞态胜者，已写明；官方配方的数据轨 Transform 走增量 insert。

`createRecord` 今日顺序是依赖创建 / 排他 unlink → INSERT。设计要求观察决策在 `createRecordDependency` 之前，以避免观察路径留下嵌套行或误解除他人关系。该顺序与「成功路径仍要写入嵌套 / FK」可以同时成立（先插入身份标量再补关系，或 SAVEPOINT 回滚观察路径）；不是互相否定的合同。实现注意事项见 §4。

### 2.3 违反项目原则

未发现。

- 写入口仍是声明 + `Controller.dispatch`，无平行 `claim` / `consume`。
- 不把唯一约束异常冒充「已被占用」；不把内部幂等账本当应用票据；不把进程内映射当权威。
- 有界存活复用 `Entity.retention` / `maintainEntityRetention`。
- 声明面读者表覆盖 core 归一化、stringify `public`、`Entity.clone`、DBSetup、CreationExecutor、SQLBuilder、UpdateExecutor、`database.insert`、迁移签名、`mapConstraintError`、教义、taboo fuzz。Identity 不进入 UniqueConstraint 全局逻辑名表，与「两实体可同用 `identity.name: 'byKey'`」一致。
- `declarationTabooFuzz` 已支持 `phase: 'setup'`，S1/S2 可作为 setup 期细胞，不必新造测试框架。

### 2.4 违反任务目标

未发现。

- 官方路径是 `Entity.identity` + 既有 Transform / StateMachine / retention / effects+查询。
- 一般性陈述：应用身份（自然键）与带键集合语义；占有是第一消费场景；另给出 webhook 去重摄入、派生集合重建、种子数据可重入初始化。
- 方案质量代价已列入：组合禁例 D1–D6 / S1 / S2；不变量执行点；声明不按路径分裂；结果落在数据模型。
- 并发登记双拓扑在 M-02，且明确不得用平行写 API 或 PGLite 冒充完成证明。
- 非目标（锁服务、dispatch 幂等、平行回收、时钟推进、源图读约定、提交后副作用、MySQL 占有写路径）均有落点。

### 2.5 里程碑不可执行

未发现。四个里程碑依赖顺序清楚，验收入口可执行或明确待建。

- M-01 把最大不确定性（声明物化、逻辑创建集合语义、事件时序、空 RETURNING、守卫）放在最前，并含 UniqueConstraint 控制组与写路径结构 fuzz 回归门。
- M-02 绑定真实 PostgreSQL 双拓扑 + 缺陷注入（关闭条件插入须变红）。
- M-03 消费半边在 HEAD 已有 P2/P3.3；本里程碑把它接到 identity 实体与五结果真值表。
- M-04 可见性 / 迁移 / retention 重登记 / 教义；`N = 20` 按协议在设计通过时由裁决轮写入。

M-01 工作量大，但是同一内核的可运行状态，不是无法在合理实现轮次内完成的「巨型不可拆验收」。

### 2.6 必须提前验证的重大风险

未发现属于本类的问题。核心 SQL 合同（指定 arbiter 的 ON CONFLICT、空 RETURNING、READ COMMITTED 双连接等待）可在实现环境用真实 PostgreSQL 及时验证，且已列入 M-01/M-02。本轮评审已提前复验通过，不构成「推迟则后续实现整体失效」的未知风险。

合表完成态为 S1 fail-fast（而非 NULL 共存成功细胞），避免把不可移植的部分唯一索引做成方案前提。SQLite 上 NonNullConstraint 不可用（Adj-R1），设计已禁止 identity 走该管线。

---

## 3. 需要复审的问题

无。

---

## 4. 实现注意事项

下列事项不触发下一轮设计评审；实施与审计时应纳入验收，避免合同被实现细节悄悄削弱。

1. **观察路径的返回值必须是库中既有行。** HEAD 的 `insertSameRowData` 在 INSERT 后执行 `Object.assign(result, getData())`。观察时若先 SELECT 既有行再赋上本次载荷，调用方会拿到胜者 `id` 与败者 `holder`/`payload` 的混合物。合同写的是「按身份键读回既有行」。M-01 应断言返回的载荷字段属于已存储行，而不是本次被丢弃的载荷。
2. **观察不得执行排他 unlink / 嵌套新建。** 今日 `createRecord` 在 INSERT 之前就会 `createRecordDependency` 与 `unlinkOldOwnersOfExclusiveTargets`。设计写明观察发生在 `createRecordDependency` 之前。成功路径仍须能写 merged FK 与嵌套新建（两阶段 UPDATE 或 SAVEPOINT 均可）。M-01 除「观察不执行嵌套载荷」外，应有「首次插入仍创建嵌套行」的对照。
3. **ON CONFLICT 的 arbiter 必须是物理列名。** 框架列名经哈希（P1 日志中的 `p1t_ns_1pgs7eq`）。无目标的 `ON CONFLICT DO NOTHING` 会吞掉 Transform 源索引与逻辑 `id` 索引上的故障，设计已禁止。
4. **列级 NOT NULL 只服务 identity 列。** `ColumnData.notNull` 在 HEAD 上声明了但无人赋值，`createTableSQL` 也忽略它。补 DDL 出口时不要顺便让其它列发出 NOT NULL，以免改变 NonNullConstraint 合同。
5. **身份标志挂在物理基记录上。** 过滤名创建已解析到 `resolvedBaseRecordName`。`SQLBuilder.buildInsertSQL` / `createRecord` 应按基记录判断是否附加集合语义，避免只认声明名。
6. **taboo 合法孪生与 S1。** `constructController` 会纳入 `genSchema` 的环绕实体与关系。身份实体的合法孪生若被环绕 schema 的 1:1 `isTargetReliance` 合表，会在 setup 因 S1 失败，误伤「合法孪生应能 setup」格。细胞构造需避免该组合，或对环绕关系做隔离。
7. **`database.insert` 的占位符因方言而异。** SQLite 无 `getPlaceholder`（默认 `?`）；PG / PGLite 为 `$n`。`SQLBuilder` 已按驱动取占位符；手写探针或缺陷注入不要写死一种。

---

## 5. 结论

**通过。** 当前设计在六类复审条件下没有需要下一轮设计修订的问题。缺口求证成立；唯一方案（`Entity.identity` 作为记录元数据，逻辑创建集合语义，登记 / 消费 / 保留复用既有概念）与 Task 的架构前提、验收硬约束和方案质量要求一致；里程碑可执行。

下一步由设计裁决轮按 additional task 2 处理：本轮无「需要复审的问题」可采纳时，应将 `status` 设为 `实现中`，以 `N = 5 × 4 = 20` 进入实现循环。
