```text
status: 设计中
design-round: 0/15
implementation-round: 0/0
current-milestone: M-01
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无
```

# 双状态来源 — 设计

任务输入：`prompt/dual-state-sources.md`（问题陈述，非已定设计）。本设计在实现前对形态 A（重叠表示）与形态 B（框架外原子占有）做了源码与最小实验求证。两条形态均成立，均纳入实现范围；无关闭项。

分期：**先 FR-DS-02（占有记录），后 FR-DS-01（投影读合同）**。与问题陈述 §7 一致；求证未改变该顺序。

---

## 1. 背景和现状

### 1.1 求证方法与基线

- Git revision：`aa7d1c73c8dbb596fc9db3755c478cb99e779cb9`（`main`）。
- 工作树与本任务无关的未跟踪文件不进入本设计结论。
- 设计期探针：`tests/runtime/_gap-verify-dual-state-sources.spec.ts`（PGLite，10 tests passed；记录证据后删除，以免进入常规 `npm test`）。
- 相关既有套件（同 revision）：`dispatchIdempotency.spec.ts` 13 passed；`entityRetention.spec.ts` 15 passed；`dataConstraints.spec.ts` 14 passed。
- `INTERAQT_POSTGRES_DATABASE` 在设计会话中 **unset**。真实 PostgreSQL 双连接并发 claim 列为 **M-02 实现期必做**；PGLite / 单连接不得充当该完成证明。

### 1.2 形态 A — 重叠表示：**缺口存在**

问题：源图 S 与可滞后投影 P 是两套行时，框架是否区分完备/滞后、是否提供官方 coalesce、查询是否拒绝无标记混读、合法双 Transform 是否已与「异步索引 ∪ 源图」划界。

**源码表面**

| 事实 | 证据 |
|------|------|
| Entity 声明面无投影完整度 / listing authority | `src/core/Entity.ts`：`EntityCreateArgs` 为 name / properties / computation / baseEntity / matchExpression / inputEntities / commonProperties / constraints / retention。无 `projection` / `completeness` / `listingAuthority`。 |
| Transform 无投影合同 | `src/core/Transform.ts`：`record` / `eventDeps` / `attributeQuery` / `callback`。无 completeness / stale。 |
| 无官方 coalesce / 来源标记查询 | `src/runtime/System.ts` `Storage`：`find` / `findOne` 按单一 `entityName` 返回无来源标记的行。无 `findProjection` / `coalesce` / `insertOrClaim`。 |
| FilteredEntity 是同源谓词视图 | `src/storage/erstorage/Setup.ts` `createFilteredEntityRecord`：`table` 取 base 的物理表，`isFilteredEntity: true`。不是第二套可滞后行。 |
| MergedEntity 是不同输入类型的属性并集视图 | `Entity.create` 对 `inputEntities` 的守卫与 merged 编译路径；不是同一身份两份事实的 coalesce。 |
| 合法双 Transform 已有教义，但未划界异步并集 | `agent/agentspace/knowledge/usage/04-reactive-computations.md`：「One data source, multiple Transforms」鼓励同一 InteractionEvent 写出 Order / InventoryChange / PointsReward。未写「异步索引 ∪ 源图不属于该模式」，也未写禁止读时 `concat` + 部分键去重。 |

**最小实验（探针 A1–A4，PGLite）**

| 实验 | 结果 |
|------|------|
| A1 公开面 | `storage.occupancy` / `insertOrClaim` / `consumeOnce` / `findProjection`、`atomic.claim`、`controller.readProjection` 均不存在。`Note` 实例无 `occupancy` / `projection` 字段。 |
| A2 同一 InteractionEvent 两条 Transform | 一次 `dispatch` 后 `find('DssShapeA')` 与 `find('DssShapeB')` 各 1 行、`label` 分别为 `shape-a` / `shape-b`。官方读路径是分表 `find`，没有并集原语。 |
| A3 应用层 `concat` + `Set(objectKey)` | 同源业务键 `obj-1` 上 Source.title=`from-source`、Index.title=`from-index`。Index 在前则胜者 `from-index`，Source 在前则胜者 `from-source`。**官方 `find` 既不阻止该写法，也不给出确定胜者。** 仅存在于 Source 的 `obj-2` 会在并集中出现，完整度也随插入顺序与去重键而变。 |
| A4 FilteredEntity | `schema.records`：base `isFiltered=false`，filtered `isFiltered=true` 且 `tableName` 与 base 相同、`resolvedBaseRecordName` 为 base。向 base `create` 后立刻能按同一 `id` 从 filtered `findOne` 读到。这是同源完备视图，**不是** FR-DS-01 的滞后投影，也不是官方 coalesce。 |

**结论（形态 A）**

缺口成立，且不是「缺一篇文档」那么窄：

1. 合法双 Transform（同一事件、两种业务类型、分别查询）**已经能跑**，教义也鼓励；缺的是与「滞后投影 ∪ 源图」的划界，以及验收禁止测试里写并集去重。
2. 两张普通表共享业务键时，应用可以 `concat` + 部分键 `Set`；冲突字段随数组顺序翻转。框架没有完整度声明，也没有带身份键与冲突策略的官方合并。
3. FilteredEntity / MergedEntity **不得**被当成 FR-DS-01 的现成解。

本任务必须交付：合法双 Transform 的教义化（选项 3）**以及**滞后投影的单一读权威（选项 1）。不交付官方 coalesce（选项 2），见 §3.1。

### 1.3 形态 B — 框架外原子占有：**缺口存在**

问题：应用能否在框架管理的记录上声明复合键 first-wins claim、一次性 consume、TTL，且结果代数稳定；而不是唯一约束异常冒充业务语义，也不是应用 `CREATE TABLE`。

**源码表面**

| 能力 | 覆盖 | 缺口 |
|------|------|------|
| UniqueConstraint | 复合键唯一；冲突映射为 `ConstraintViolationError`（可带 `violationCode`） | 这是约束违反，不是 claimed / already-held / already-used / expired。 |
| `atomic.compareAndSet` | 已有行（按逻辑 `id`）或全局 `_ComputationState_` 键上的字段 CAS | 记录目标在行不存在时返回 `false`，**不插入**。`AtomicRecordTarget` 需要 `id`，不是按应用键 insert-or-claim。 |
| `atomic.lockRecord` / `lockRows` | 事务内行锁 | 不是占有记录生命周期。 |
| Dictionary | `_Dictionary_` 全局 JSON KV，`key` 唯一 | 无 namespaced 行模型、无 consume-once、无行级 TTL；`set` 覆盖写。 |
| `dispatchIdempotency` | 内部表 `_DispatchIdempotency_`，键 `(namespace, idempotencyKey)`；Controller 先 `load` 再 `claim`/`finish`；`outcome: 'applied' \| 'replayed'` | 绑定 dispatch 键空间。表由 I1–I3 `CREATE TABLE IF NOT EXISTS` 安装，**不进入** `createMigrationManifest.records[]`。不能挂 computation / `Entity.retention`。不能 `storage.find`。 |
| `_ScopedSequence_` | 序号账本 | 同为内部表，不是业务令牌。 |
| `Entity.retention` / `maintainEntityRetention` | 已声明为普通 Entity 的 cap / ttl | 只扫描 `controller.entities` 上非 forever 的 retention。内部账本不是 Entity，不会被回收。前提是记录已经是 Entity。 |

`AtomicStorage`（`src/runtime/System.ts`）方法：`get` / `increment` / `replace` / `compareAndSet` / `lockGlobal` / `nextSequenceValue` / `reserveSequenceRange` / `seedSequenceValue` / `readSequenceValue` / `updateGlobalFields` / `lockRecord` / `lockRows`。无按应用键 first-wins insert。

全 `src/` 无 `insertOrClaim` / `consumeOnce` / occupancy 结果代数。

**最小实验（探针 B1–B6，PGLite）**

| 实验 | 结果 |
|------|------|
| B1 Entity + UniqueConstraint `(namespace, tokenId)` 第二次 `create` | 抛 `ConstraintViolationError`，`context.code = 'TOKEN_DUPLICATE'`（自定义 `violationCode`）。不是 already-held。表中仍一行，payload 仍为先到者。 |
| B2 同一事务内 SAVEPOINT + 第二次 `create` + `rollbackToSavepoint` + `findOne` | `supportsSavepoint() === true`。唯一冲突后回滚保存点，能读到先到者 payload。**占有 claim 可以走 Entity 写路径而不使外层事务 aborted。** |
| B3 `compareAndSet` | 对不存在的合法 UUID：返回 `false`，表仍为空（不能 first-wins insert）。对已有行：`consumed: false → true` 第一次 true、第二次 false（布尔 CAS 可做消费标记）。对可空 number `consumedAt`：`expected=null` 因 SQL `NULL = NULL` 未知而**恒 false**——不能用 number 空值 CAS 表达 consume。 |
| B4 Dictionary | `dict.set('dssNonce', {payload:'one'})` 再 set `'two'` 覆盖。`find('_Dictionary_')` 可见该 key。无 consume-once，无行级 TTL。 |
| B5 直接 `dispatchIdempotency.claim` 已成功键 | 第二次 INSERT 唯一冲突使 **PGLite 事务 aborted**；catch 里的 `load` 得到 `current transaction is aborted`，**不是** `IdempotencyError`。`storage.find('_DispatchIdempotency_')` 抛错。`createMigrationManifest.records` 含业务 Entity，**不含** `_DispatchIdempotency_` / `_ScopedSequence_`。Controller 的 dispatch 管道是先 load 再 claim，不能把该账本开放成通用 nonce API，也不能把其 unique-violation 映射当作本任务完成形态。 |
| B6 retention | 声明 `retention.mode: 'ttl'` 的 Entity 在注入 `now` 后被 `maintainEntityRetention` 删除（removed=1）。未声明 retention 的兄弟 Entity 保留。同一维护步之后 `_DispatchIdempotency_` 行仍能 `load` 到 `state: 'succeeded'`。 |

**结论（形态 B）**

缺口成立。框架已经为自己做过同形内部账本，但应用级令牌没有：

- 进入应用 schema / migration 签名的 Entity 行；
- claimed / already-held / consumed / already-used / expired / not-found 结果代数；
- 跨副本 first-wins insert（UniqueConstraint 只提供异常）；
- 与 `maintainEntityRetention` 同一维护步的 TTL。

`atomic.compareAndSet` 可作为**已有行**上消费标记的零件（布尔字段），**不是**完成形态。Interaction 幂等账本 **不是**完成形态。

### 1.4 明确不在范围

- 搜索引擎 / 向量索引 / 外部只读副本。
- 物化图投影的增量维护算法。
- 订单 vs 发票这类相关但不同的事实。
- 分布式锁服务、租约续约、时钟同步；TTL 以存储/主机时间为准。
- 进程内 `Map` 作为多副本权威。
- 重做 dispatch 幂等、`Entity.retention` 本身。
- `prompt/post-commit-side-effect-delivery-guarantees.md`（提交后义务是否跑完 ≠ 状态表示的权威个数）。
- 本仓库内某个具体搜索并集或私有令牌表的应用改造；前端双通道状态。

---

## 2. 目标与非目标

对应 Task 要求编号。

| 要求 | 目标 | 非目标 |
|------|------|--------|
| **1** 求证 | §1 为权威求证记录；形态 A、形态 B 均成立；无关闭项 | 不得只复述问题陈述；不得把 FilteredEntity / Dictionary / dispatch 幂等 / CAS 误判为已有官方路径 |
| **2 FR-DS-01** | 合法双 Transform 教义化 + 投影实体的单一读权威（完整度声明 + listing authority + 来源标记）。冲突不随查询顺序翻转；仅源无投影时官方读与声明一致 | 不实现官方 coalesce（投影赢 / 源赢 / 拼接不相交字段 / 冲突失败）。不把 `storage.find` 改成隐式并集。不把 FilteredEntity 当投影 |
| **3 FR-DS-02** | 普通 Entity 上的 occupancy 声明 + `controller.occupancy.claim/consume`；复合键唯一；跨进程 first-wins；consume 三态 + not-found；TTL 复用 `Entity.retention`；install / migrate 可见 | 不新建与 `_DispatchIdempotency_` 平行的内部表作为应用 API。不把 dispatch 幂等键空间开放成 nonce API。不把 Dictionary 升格。不要求 claim 走 Interaction → Transform。不手写 DELETE 循环，不平行 GC |
| **4** 阶段与非目标 | 见 §1.4；滞后必须是声明状态 | 不规定每次派生同步完备 |
| **5** 与现有能力 | 扩展 Entity 声明与 Controller API；UniqueConstraint / SAVEPOINT / retention / migration `records[]` 为零件；枚举读者 | 不绕过 Entity 写路径做第二套存储运行时 |
| **6** 验证 | 各 FR 独立可验收；FR-DS-02 并发完成证明含真实 PG 双连接 | PGLite / 单连接单独充当并发完成证明 |
| **7** 范围 | 框架声明、runtime、文档、测试 | 不改造具体业务应用；落地后官方教义不得再推荐读时手工并集或部分键去重，也不得推荐应用 `CREATE TABLE` 做跨副本 claim |

---

## 3. 方案（唯一）

### 3.1 总决策

1. **FR-DS-02 用普通 Entity，不用新的内部表。** 内部表证明框架会给自己做形态 B，但应用令牌需要 schema / 迁移 / `storage.find` / 可选 computation / `Entity.retention`。这些已经是 Entity 空间的性质。再抄一张 `_TokenClaim_` 会把「技术表」再次赶出 Entity 空间，违反任务约束。
2. **FR-DS-01 选选项 1 + 选项 3，不选选项 2。** 选项 3（合法双 Transform）已存在，只需教义与测试划界。选项 1（投影声明单一读权威）能满足冲突可测与完整度可测，且不把「无合同并集」升格为官方原语。选项 2（官方 coalesce）表面最大、最容易把反模式正规化；本任务不实现。
3. **分期：M-01…M-03 闭合 FR-DS-02，M-04 闭合 FR-DS-01。** 形态 B 缺口更硬，零件（UniqueConstraint、SAVEPOINT、retention、migration）已在主干上。
4. **Claim 走 SAVEPOINT + `storage.create`，不走「捕获唯一冲突后在同一已 aborted 事务里 load」。** B2 证明保存点可恢复；B5 证明无保存点时 PG 系事务 aborted。这是汇合点：成功 claim 仍是 Entity 创建（逻辑 id、变更事件、可挂 computation）。
5. **Consume 走「锁定读 + 条件更新」，不用 number 列 `compareAndSet(null, now)`。** B3 证明 SQL 空值等值使该 CAS 恒失败。布尔 CAS 可做零件，但过期与已消费必须区分，故占用专用分类更新，而不是把 CAS 当作完成形态。

### 3.2 FR-DS-02 — Entity occupancy

#### 3.2.1 声明

```ts
type EntityOccupancy = {
  identity: string[]                 // 1 个或多个属性名，构成占有键
  payloadProperty: string
  claimedAtProperty: string
  consumedAtProperty: string
  expiresAtProperty?: string         // 省略则 consume 不做过期判定
}

Entity.create({
  name: 'HandshakeNonce',
  properties: [ /* namespace, tokenId, payload, claimedAt, consumedAt, expiresAt */ ],
  occupancy: { identity: ['namespace', 'tokenId'], payloadProperty: 'payload', ... },
  constraints: [
    UniqueConstraint.create({
      name: 'HandshakeNonce_identity',
      properties: ['namespace', 'tokenId'],
    }),
  ],
  retention: {
    mode: 'ttl',
    ttl: { timestampProperty: 'expiresAt', maxAgeMs: 1 },
  },
})
```

`normalizeEntityOccupancy` 在 `Entity.create` 中与 `normalizeEntityRetention` 同级调用（声明期 fail-fast）。

**声明期守卫（有限清单）**

1. occupancy 为省略或合法对象；非法形态抛错。
2. Filtered / Merged / 硬删除宿主（`_isDeleted_`）不可声明 occupancy。
3. occupancy 与 projection 互斥（见 §3.3）。
4. `identity` 为非空、无重复的属性名数组；每个属性必须存在，类型为 `string` 或 `number`，且 `collection` 不为 true。
5. payload / claimedAt / consumedAt 属性必须存在。claimedAt、consumedAt、expiresAt（若有）类型为 `number` 或 `timestamp`。
6. 必须存在一条 `UniqueConstraint`，其 `properties` 与 `identity` **集合相等**（顺序无关）。不得靠 occupancy 隐式建唯一约束（显式控制）。
7. 身份属性不得为 `id` / `_rowId`（已有保留名守卫）。

`Entity.clone` / `stringify` / `static.public` 纳入 `occupancy`，与 `retention` 同形。

#### 3.2.2 公开 API

挂在 Controller 上（与 `maintainEntityRetention` 一样需要实体声明；Storage 不持有 occupancy 配置）：

```ts
type OccupancyClaimResult =
  | { status: 'claimed'; record: EntityIdRef }
  | { status: 'already-held'; record: EntityIdRef }

type OccupancyConsumeResult =
  | { status: 'consumed'; payload: unknown; record: EntityIdRef }
  | { status: 'already-used' }
  | { status: 'expired' }
  | { status: 'not-found' }

controller.occupancy.claim(recordName, {
  identity: Record<string, string | number>,
  payload: unknown,
  now?: number,          // 默认 Date.now()；测试注入
  ttlMs?: number,        // 与 expiresAt 二选一；仅当声明了 expiresAtProperty
  expiresAt?: number,
}): Promise<OccupancyClaimResult>

controller.occupancy.consume(recordName, {
  identity: Record<string, string | number>,
  now?: number,
}): Promise<OccupancyConsumeResult>
```

未知实体、实体无 occupancy、identity 键集合与声明不一致、expiresAt 配置不合法：抛描述性 `Error`（合同误用），不进入结果代数。

身份冲突 **不得** 以 `ConstraintViolationError` 或唯一约束异常冒充 already-held。

不要求走 Interaction → Transform。应用若愿意用 Interaction 包一层，那是应用代码，不是本 API 的完成条件。

#### 3.2.3 Claim 语义（参考步骤）

在 `withAtomicTransaction` 等价物中（已有事务则复用，否则自开并支持重试）：

1. 校验 `recordName` 已声明 occupancy；`identity` 键集合 = 声明 identity；每个值非 null。
2. 若声明了 `expiresAtProperty`：必须提供 `expiresAt` 或正有限 `ttlMs`（`expiresAt = now + ttlMs`），不能两个都给且冲突。未声明该属性时，禁止 `ttlMs` / `expiresAt`。
3. `createSavepoint`。
4. `storage.create(recordName, { ...identity, [payload]: payload, [claimedAt]: now, [consumedAt]: null, [expiresAt]: expiresAt? })`。
5. 成功：`releaseSavepoint`，返回 `{ status: 'claimed', record }`。创建变更事件走现有写路径。
6. 捕获 `ConstraintViolationError` 且约束 properties 集合等于 occupancy identity：`rollbackToSavepoint`，按 identity `findOne`，返回 `{ status: 'already-held', record }`。找不到行属于实现缺陷（应 fail-loud）。
7. 其它错误：回滚保存点并抛出。

**已存在行（无论是否消费、是否过期）一律 already-held。** Claim 不做就地回收；回收只发生在 `maintainEntityRetention` 物理删除之后。这保持 claim 与 GC 分离。

#### 3.2.4 Consume 语义（参考步骤）

同一事务包装：

1. 按 identity 锁定读取（`lockRows` 或等价 `SELECT … FOR UPDATE`；无 FOR UPDATE 的驱动依赖事务串行）。
2. 无行 → `not-found`。
3. `consumedAt` 非空 → `already-used`（即使此时已过期；已消费优先）。
4. 声明了 `expiresAtProperty` 且 `expiresAt != null` 且 `now >= expiresAt` → `expired`（不写消费标记）。
5. 否则更新 `consumedAt = now`，返回 `{ status: 'consumed', payload, record }`。更新走 `storage.update`，发出变更事件。

`not-found` 是第四个稳定 consume 结果：从未 claim 的键不能假装 already-used。Claim 结果代数仍是 claimed | already-held。

#### 3.2.5 TTL / 回收

不新做 GC。应用声明 `Entity.retention`（ttl 和/或 cap）。推荐：`expiresAt` 上 `mode: 'ttl'`，`maxAgeMs` 为过期后的宽限（测试可用 `1`），使过期行仍能被 consume 判为 `expired`，随后被维护步删除。

| 策略 | 声明 | claim 已过期仍在表中的行 | 维护步之后 |
|------|------|--------------------------|------------|
| 过期后回收键 | occupancy.expiresAt + retention ttl | already-held | 同一 identity 可再次 claimed |
| 永不回收 | 无 retention 或 `mode: 'forever'` | already-held | 键一直被占住；过期未消费的 consume 仍为 expired |

默认业务路径禁止手写 `DELETE` 循环。`maintainEntityRetention` 仍只删除声明了 retention 的实体；未声明的兄弟实体不被误删（B6 已证实该不变量，实现须保持）。

时钟：`now` 与 retention 一样是主机毫秒时间；不内置时钟同步。文档写明。

#### 3.2.6 Schema / 迁移 / 可见性

占有记录是普通 Entity 表：`setup(true)` 建表，`createMigrationManifest` 的 `records[]` 含该实体，并增加 `occupancy` 字段（与 `retention` 一样参与 modelHash）。禁止官方示例出现应用 `CREATE TABLE IF NOT EXISTS` 作为 claim 后端。

`_DispatchIdempotency_` 保持内部账本，不开放为 nonce API。

可选：占有实体可挂 Count 等 computation。不得因「技术表」拒绝。

#### 3.2.7 并发合同

真实 PostgreSQL、两个独立连接 / Controller（模式对齐 `tests/runtime/postgresqlSequenceRange.spec.ts`）：同一 `(namespace, tokenId)` 并发 `claim` → 恰好一次 `claimed`，另一次 `already-held`；payload 以成功者为准，无双行。PGLite 与单连接只作开发探针。

实现须把该套件加入 `npm run test:postgres`。

### 3.3 FR-DS-01 — 投影读合同

#### 3.3.1 两条官方路径（互斥，按声明选择）

**路径 L — 合法双 Transform（选项 3，已有能力的教义化）**

同一 `InteractionEvent`（或同一源记录）上两条 Transform 写出实体 A 与实体 B。权威是该事件/源，不是其中一张派生表。读 A 或读 B 使用普通 `storage.find`，**禁止**回源合并，**禁止**测试与示例中的 `concat` + 部分键去重。

**异步补全的索引行不属于路径 L。** 若派生行相对源图可以滞后或子集，必须走路径 P，而不是「再写一条 Transform 然后在读路径并集」。

**路径 P — 投影单一读权威（选项 1）**

```ts
type EntityProjection = {
  source: EntityInstance
  identity: string[]                 // 源与投影上都存在的业务身份；去重键必须等于此集合
  completeness: 'complete' | 'incomplete'
  listingAuthority: 'source' | 'projection'
}
```

规范化规则：

1. 非 Filtered / Merged；与 occupancy 互斥。
2. `source` 必须是已声明的普通 Entity（不是 Relation、不是自己）。
3. `identity` 非空无重复；每个名字在投影实体与 source 上都存在，类型相容（string/number，非 collection）。
4. `completeness: 'complete'` ⇒ `listingAuthority` 必须是 `'projection'`（完备投影就是读权威）。
5. `completeness: 'incomplete'` ⇒ `listingAuthority` 为 `'source'` 或 `'projection'`，必须显式给出。
6. 属性名 `_projectionOrigin` 在投影实体上禁止声明（结果注解保留名）。

不提供「去重键窄于 identity」的策略；窄键去重正是 A3 翻转的原因。

#### 3.3.2 `controller.readProjection`

```ts
type ProjectionOrigin = 'projection' | 'source'
type ProjectionReadResult = {
  rows: Array<Record<string, unknown> & { _projectionOrigin: ProjectionOrigin }>
  completeness: 'complete' | 'stale'
  listingAuthority: 'source' | 'projection'
}

controller.readProjection(
  recordName,
  match?: MatchExpressionData,
  modifier?: unknown,
  attributeQuery?: AttributeQueryData,
): Promise<ProjectionReadResult>
```

对未声明 `projection` 的实体调用：抛错（不能把任意两张表混读）。

**行来源**

- `listingAuthority: 'projection'`：`find(投影实体, match, modifier, attributeQuery)`，每行 `_projectionOrigin: 'projection'`。
- `listingAuthority: 'source'`：`find(source, match, modifier, attributeQuery)`，每行 `_projectionOrigin: 'source'`。match/modifier/attributeQuery 作用在 **listing authority 那张表** 上。不把 P 行与 S 行压进同一无标记列表。

**完整度（全局身份集合，与当前 match 无关）**

令 `pKeys` / `sKeys` 为两表全部行的 identity 元组集合（属性为 null 的行视为未覆盖，使 completeness 为 `stale`）：

- 若 `sKeys ⊆ pKeys` → `completeness: 'complete'`
- 否则 → `completeness: 'stale'`

match 只过滤返回行，不改变完整度含义。完整度是「投影是否覆盖源身份」的声明对照，不是分页窗口。大规模表的扫描成本在文档中写明；专用查询仍可用 `storage.find(P)`，但不携带完整度合同。

**与验收的对应**

| 场景 | 声明 | 官方读 |
|------|------|--------|
| 仅源、尚无投影行 | incomplete + listingAuthority `projection` | `rows=[]`，`completeness: 'stale'` |
| 仅源、尚无投影行 | incomplete + listingAuthority `source` | 源行，`_projectionOrigin: 'source'`，`completeness: 'stale'` |
| 同源身份、展示字段冲突 | 任一 listingAuthority | 只出现权威表上的字段值；交换 find 顺序不会改变 `readProjection` 结果 |
| 完备投影 | complete + listingAuthority `projection` | 只读 P；若源有未投影身份则 `stale`（诚实报告，不混入源行） |
| 合法双 Transform | 无 projection 声明 | 分别 `find`；测试禁止并集去重 |

不实现 coalesce。无声明混读无法通过官方 API 表达：没有把两张表压成一列的方法。应用仍可在 JS 里 `concat`；教义将其列为反模式，测试用 A3 形态做负向对照（官方路径不得依赖它）。

#### 3.3.3 文档

更新 usage / generator：

- 最小正例：路径 L（双 Transform 分别查询）；路径 P（incomplete 投影 + `readProjection`）。
- 反模式标题明确：**读时手工并集 + 部分键去重**；**把滞后投影当成与源可互换的同一行类型**。
- 「One data source, multiple Transforms」保留，并加一句：该模式的权威是源事件，不是读路径合并；异步索引不属于该模式。

### 3.4 公开面读者（修一类）

实现时必须全部走到汇合点，禁止只改探针走过的分支。

| 表面 | 读者 |
|------|------|
| `EntityCreateArgs.occupancy` / `projection` | `Entity.create` 规范化；`clone` / `stringify` / `parse` / `static.public`；`createMigrationManifest` 的 `records[]`（modelHash）；`declarationTabooFuzz` 的 `TABOO_CELLS` |
| UniqueConstraint 与 occupancy identity | 声明期集合相等守卫；claim 捕获冲突时按 identity 匹配，避免误把其它唯一约束当成 already-held |
| `controller.occupancy` | claim / consume；事务与 SAVEPOINT；`storage.create` / `update` / `findOne` / `lockRows` |
| `controller.readProjection` | listing find；全局身份完整度；结果注解 `_projectionOrigin` |
| `maintainEntityRetention` | 不改算法；占有实体若声明 retention 则自然成为目标；内部账本仍不可达 |
| `storage.find` | 行为不变；不是混读入口 |
| `atomic.compareAndSet` / `dispatchIdempotency` / Dictionary | 回归：既有套件不得新增失败 |
| Transform | 无新原语；文档划界 |
| 教义 | `usage/04-reactive-computations.md`、`usage/19-common-anti-patterns.md`（若存在对应节）、`generator/api-reference.md`、CHANGELOG Unreleased |

### 3.5 与既有能力的边界（对照表）

| 既有 | 本设计如何用 | 不得如何用 |
|------|----------------|------------|
| Transform 多实体 | 路径 L | 不得当成滞后索引 ∪ 源 |
| UniqueConstraint | occupancy 身份守恒；claim 内部捕获 | 不得当公开 already-held |
| SAVEPOINT | claim 在 Entity 写路径上消化唯一冲突 | 不得在 aborted 事务里 load（B5） |
| `compareAndSet` | 可选实现零件；布尔消费标记已验证 | 不得当 first-wins insert；不得用 number null CAS 当 consume |
| `_DispatchIdempotency_` | 对照：框架内部形态 B | 不得开放为业务 nonce |
| `Entity.retention` | occupancy TTL 的唯一回收机制 | 不得平行 GC |
| Dictionary | 无关 | 不得当 namespaced consume-once |
| FilteredEntity / MergedEntity | 同源/并集视图 | 不得当投影 coalesce |

---

## 4. 里程碑

设计完成时初始里程碑数 **M = 4**，实现总预算 **N = 5 × 4 = 20**（由设计通过的裁决轮写入状态头）。下列状态均为 `开放`。

### M-01 占有声明与 claim 结果代数（PGLite）

- **结果：** `Entity.occupancy` 规范化；`controller.occupancy.claim` 返回 `claimed` / `already-held`；成功行是普通 Entity（`find` 可见）；migration `records[]` 含 `occupancy`；第二次 claim 不抛 `ConstraintViolationError`。
- **覆盖：** 要求 1（形态 B 实现开始）、3.1、3.2、3.5（schema 部分）、6（PGLite 合同）。
- **前置：** 无。
- **reopen-count:** 0；**reopen-domains:** ∅。
- **验收：** 新增 `tests/runtime/occupancyClaim.spec.ts`（名称可微调）：声明守卫（filtered/merged/缺 UniqueConstraint/identity 不匹配）；先到 claimed、后到 already-held；payload 为先到者；SAVEPOINT 外层事务仍可提交；`createMigrationManifest` 含 occupancy；`npm run check`。
- **最新证据：** 无（未实现）。设计期 B1/B2 证明零件可行。

### M-02 真实 PostgreSQL 双连接并发 claim

- **结果：** 两连接并发同一 identity，恰好一次 claimed、一次 already-held，无双行、无唯一约束异常冒充结果。
- **覆盖：** 要求 3 并发硬约束、6 方言探针。
- **前置：** M-01。
- **reopen-count:** 0；**reopen-domains:** ∅。
- **验收：** 新增 `tests/runtime/postgresqlOccupancy.spec.ts`，`INTERAQT_POSTGRES_DATABASE` 门控；独占库名后缀（与其它 postgresql* 相同纪律）；纳入 `npm run test:postgres`。设计会话中该 env unset，本里程碑不得用 PGLite 代替。
- **最新证据：** 无。

### M-03 consume、过期与 retention 回收

- **结果：** consume 四态（consumed / already-used / expired / not-found）；已消费优先于过期；TTL 后维护步删除占有行；未声明 retention 的实体不被误删；删除后同一键可再次 claim（回收策略）；forever 策略下过期行仍 already-held。
- **覆盖：** 要求 3.3、3.4、3.5 retention、6 consume/retention。
- **前置：** M-01（claim）。并发 consume 在真实 PG 上至少覆盖：claim 成功后一连接 consumed、另一连接 already-used（可与 M-02 同文件或同门控套件）。
- **reopen-count:** 0；**reopen-domains:** ∅。
- **验收：** `tests/runtime/occupancyConsume.spec.ts` + postgresql 套件中的 consume 并发；`entityRetention.spec.ts` 回归仍绿；B6 不变量保持。
- **最新证据：** 无。设计期 B3/B6 证明 CAS 不足、retention 可复用。

### M-04 投影声明、`readProjection` 与双 Transform 教义

- **结果：** `Entity.projection` + `controller.readProjection`；冲突不随顺序翻转；完整度与声明一致；合法双 Transform 分别查询且测试无并集去重；文档正反例；反模式写明手工并集 + 部分键去重；官方示例无应用 `CREATE TABLE` claim。
- **覆盖：** 要求 2 全部硬约束、5 Transform 划界、6 FR-DS-01、7 教义。
- **前置：** 无硬依赖 FR-DS-02；顺序上放在占有闭环之后，避免并行改 Entity.create 规范化互相干扰。实现轮仍只推进编号最小的未完成里程碑，故本里程碑在 M-03 之后。
- **reopen-count:** 0；**reopen-domains:** ∅。
- **验收：** `tests/runtime/projectionRead.spec.ts`：冲突字段；仅源无投影的两种 listingAuthority；complete 投影不混源行；双 Transform 无 concat。`declarationTabooFuzz` 增加 occupancy/projection 守卫格。usage / generator / CHANGELOG。既有 `transform.spec.ts`、UniqueConstraint、CAS、dispatchIdempotency、entityRetention、migration 签名无新增失败。
- **最新证据：** 无。设计期 A2–A4 证明缺口与 FilteredEntity 边界。

实现阶段须把新维度写入 `tests/runtime/WritingComputationTests.md`（占有结果代数；投影 completeness × listingAuthority；路径 L vs 路径 P）。

---

## 5. 风险与验证安排

| 风险 | 何时验证 | 处理 |
|------|----------|------|
| PG 双连接 claim 不是恰好一次 | 实现期 M-02；设计期环境不可用 | 不得用 PGLite 代替；套件 skip 即本里程碑未完成 |
| PG 唯一冲突 abort 事务 | 设计期 B5 已证实 | claim 必须 SAVEPOINT（B2）或等价保存点；禁止 B5 路径 |
| number 空值 CAS 不能 consume | 设计期 B3 已证实 | consume 用 IS NULL / 过期比较，不用 `compareAndSet(null, now)` |
| `readProjection` 全局完整度扫描成本 | 实现期可接受；非设计阻塞 | 文档写明；专用查询仍用 `find` |
| 把 FilteredEntity 当投影 | 设计期 A4 已排除 | 声明期拒绝 projection on filtered |
| 误开放 dispatch 幂等为 nonce | 设计已关闭 | 回归 `dispatchIdempotency.spec.ts` |
| Entity.create 读者漏改 clone/stringify/migration | 实现纪律 §3.4 | M-01/M-04 验收含 manifest 与 clone/taboo |

设计期必须验证的风险（SAVEPOINT、CAS 空值、FilteredEntity 同源、幂等账本 aborted 映射）已用探针闭合。其余在实现环境验证，不单独延长设计循环。

---

## 6. 基线

| 项 | 值 |
|----|----|
| Git | `aa7d1c73c8dbb596fc9db3755c478cb99e779cb9` |
| 分支 | `main` |
| 设计期探针 | 10 passed（PGLite）；随后删除临时文件 |
| `dispatchIdempotency.spec.ts` | 13 passed |
| `entityRetention.spec.ts` | 15 passed |
| `dataConstraints.spec.ts` | 14 passed |
| 真实 PostgreSQL | 本会话未配置；M-02 必做 |
| 任务开始前已失败的相关检查 | 未发现（上述套件全绿） |
