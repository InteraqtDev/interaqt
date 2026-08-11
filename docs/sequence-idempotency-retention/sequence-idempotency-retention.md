```text
status: 已完成
design-round: 8/15
implementation-round: 7/30
current-milestone: M-06
current-milestone-reopens: 1
convergence-mode: normal
next-action: 无
```

# 连续票号、幂等回放判别与声明式实体保留 — 设计

## 1. 背景和现状

任务输入：`prompt/remaining-framework-gaps-seq-idem-retention.md`（问题陈述，非已定设计）。本设计在实现前对三条缺口做了源码与最小实验求证。

### 1.1 FR-SEQ-01 — 原子连续区间票号：**缺口存在**（求证时 / M-01 快照）

> **快照边界**：下列「源码表面」描述的是 **M-01 求证时**主干（git `a7f6ec8`，尚无 range API）。  
> M-02 已交付 `reserveSequenceRange` 与共享 upsert 内核（见 M-02 证据）。  
> **仍开放、由 M-03 闭合**的是 d5/d6 建表合同：能力向总是确保 `_ScopedSequence_`，且 install / migration prepare / migration apply 共用单一谓词（见 §3.1）。  
> 不以本小节「不存在 reserve…」否定 M-02 已交付事实。

**源码表面（M-01 求证时）**

- `AtomicStorage`（`src/runtime/System.ts`）仅暴露：
  - `nextSequenceValue(target: AtomicSequenceTarget): Promise<number>`
  - `seedSequenceValue(...)`
  - `readSequenceValue(...)`
- **当时不存在** `reserveSequenceRange` / `reserveSequence` / 任何返回区间的公开方法。
- `nextSequenceValue` 实现（`src/runtime/MonoSystem.ts`）对 `_ScopedSequence_` 做
  `INSERT ... ON CONFLICT DO UPDATE SET lastValue = lastValue + step RETURNING lastValue`，
  每次调用只推进 **一个** `step` 并返回 **一个** 数。
- 属性级 `ScopedSequence`（`src/runtime/computations/ScopedSequence.ts`）在宿主创建时调用一次
  `nextSequenceValue`，语义是「每条宿主记录一个序号」，不是「一次事件预留 N」。

**文档地位**

- `agent/agentspace/knowledge/usage/14-api-reference.md`、`20-postgresql-concurrency-migration.md`、
  `04-reactive-computations.md` 将 `ScopedSequence` 定位为 number 属性上的 per-scope 串行分配；
  未文档化区间预留，也未把「循环 N 次 `nextSequenceValue`」写成官方多行票号模式。

**最小实验**（设计期，PGLite；脚本曾置于 `tests/runtime/_gap-verify-seq-idem-ret.spec.ts`，证据已记录后删除以免污染常规套件）

- `typeof atomic.reserveSequenceRange === 'undefined'`。
- 同事务内循环 5 次 `nextSequenceValue` 得到 `[1,2,3,4,5]`：循环**可以**拼出连续号，但 API
  合同仍是「单值推进」，调用方必须自行循环，且没有「一次 reserve(N)」的原子区间返回值可绑定到
  Transform 批量写意图。

**已有可复用基建（应扩展，不平行重建）**

- 内部表 `_ScopedSequence_`、`AtomicSequenceTarget` / scope 规范化 / `sequenceScopeKey`。
- 迁移清单与 seed/no-seed 决策（`scopedSequenceManifest`、`migration.ts`）。
- 真实 PG 双 controller 并发套件模式：`tests/runtime/postgresqlScopedSequence.spec.ts`。
- 回滚可产生全局 sequence gap 的既有政策（文档与 `scopedSequence.spec.ts` 事务回滚用例）。

### 1.2 FR-IDEM-01 — 一等幂等回放判别：**缺口存在**

**源码表面**

```ts
// src/runtime/Controller.ts
export type DispatchResponse = {
    error?: unknown
    data?: unknown
    effects?: RecordMutationEvent[]
    sideEffects?: { [k: string]: SideEffectResult }
    context?: { [k: string]: unknown }
}
```

- **无** `outcome` / `replayed` / `applied` 一等字段。
- `EventSource` / `Interaction` 声明面（`src/core/EventSource.ts`、`src/builtins/interaction/Interaction.ts`）
  **无** idempotency key 路径或官方幂等参与者字段。
- 仓库中名称含 idempotency 的测试主要指 driver open/close 或唯一约束形状，**不是** interaction
  级首次/回放合同。

**最小实验**（同设计期脚本，EventSource + `UniqueConstraint` on `clientRequestId`）

| 次 | 成功? | `DispatchResponse` keys | effects 长度 | 行数 |
|----|-------|-------------------------|--------------|------|
| 1 | 是 | `context, data, effects, sideEffects` | 1 | 1 |
| 2 | 否（唯一约束冲突 → `error`） | 同上 + `error` | 0 | 1 |

结论：

- 第二次不是「成功回放」，而是**错误**；调用方若要自己做幂等，只能扫 `effects`、查库或把
  unique 冲突特判成「或许已处理」——均非稳定官方判别。
- 响应上**永远没有** `outcome: 'applied' | 'replayed'`。

### 1.3 FR-RET-01 — 声明式实体保留 / TTL：**缺口存在**

**源码表面**

- `EntityCreateArgs`（`src/core/Entity.ts`）字段：`name, properties, computation, baseEntity,
  matchExpression, inputEntities, commonProperties, constraints` — **无** `retain` /
  `retention` / `retainLatest` / TTL。
- `Controller.cleanupAsyncTasks` **仅**删除异步 computation 的 task 表终态行
  （`applied` / `skipped`），契约测试：`tests/runtime/asyncTaskRetention.spec.ts`。注释明确：
  框架不自动清理；协议态不可清。

**最小实验**

- 普通实体写入 12 行后 `cleanupAsyncTasks()` 返回且行数仍为 12。
- `controller.maintainEntityRetention` / `pruneEntity` / `storage.pruneRetention` 均不存在。

**边界厘清（设计约束）**

| 机制 | 对象 | 触发 | 本任务 |
|------|------|------|--------|
| `cleanupAsyncTasks` | 内部 async task 表终态行 | 显式 API | **保留**；不替换 |
| 实体 retention（本设计） | 用户声明的实体行 | 声明 + 安全点 / 显式 maintenance | **新增** |
| 领域归档/硬删除 Interaction | 业务语义删除 | 用户 dispatch | 非目标 |
| `postCommit` 外部 blob GC | 对象存储等 | 提交后钩子 | 非目标 |

### 1.4 明确不在范围（已交付或另立任务）

准入锁 / `AdmissionSnapshot`、`runInBusinessTransaction`、Condition 结果代数、单一逻辑 id /
create-time id、`Interaction.postCommit`、非 BT 事务内 dispatch 硬失败 —— 不重新设计。

---

## 2. 目标与非目标

对应 Task 要求编号。**d5 起适用要求 8（无历史兼容负担）**：方案按终态合同书写；不保留双轨控制流或软兼容壳。

| 要求 | 目标 | 非目标 |
|------|------|--------|
| **1** 求证 | 三条缺口均已用源码 + 实验证实存在；无关闭项 | 不得仅复述问题陈述 |
| **2 FR-SEQ-01** | 同事务内 `reserveSequenceRange` 原子预留连续区间；官方唯一入口 `this.atomic`（统一 computation 上下文）；零业务方言 SQL；真实 PG 双连接并发；atomic 能力下 setup **总是**建 `_ScopedSequence_` 表 | 不替代属性级单值 `ScopedSequence`；不要求跨 scope 全局无洞；不理解「变更日志」业务形态；不把自建 counter + 裸 SQL 或循环 `nextSequenceValue` 写多行当作官方模式 |
| **3 FR-IDEM-01** | 声明幂等键后，成功响应在类型/不变式上必有 `outcome: applied | replayed`；dispatch **唯一**管道 `admit → open? → …`；回放无重复可观察副作用；并发同键一等错误码（非 raw unique） | 不默认全部 interaction 幂等；不规定业务回执字段形状；不做分布式 exactly-once 总线；不保留遗留合成 `guard` 与 admit/open 双轨；不把扫 `effects` 或 unique 冲突当 `replayed` |
| **4 FR-RET-01** | 实体可声明 per-partition cap 与/或 TTL（可辨别联合）；单一维护 API；未声明默认不删；与 `cleanupAsyncTasks` 边界清晰 | 不 GC 外部 blob；不替代领域删除 Interaction；不在 Condition 内修剪；不替换 `cleanupAsyncTasks`；不默认自动删 |
| **5** 关系 | 扩展 atomic / `_ScopedSequence_` / EventSource 阶段字段 / `DispatchResponse` / PG 并发基建；枚举公开面读者；汇合点切换合同 | 不引入灰色 dispatch 路径；不平行协议；不靠「兼容旧调用方」保留过时形态 |
| **6** 验证 | 每 FR 独立可验收；SEQ 完成证明含真实 PG 双连接 | PGLite/单连接单独充当 SEQ 并发完成证明 |
| **7** 范围 | 框架声明、runtime、storage 暴露面、文档、测试；下游应用随合同修改（可控） | 不在本仓库改具体业务产品形态；但**不**以保护旧应用代码为由冻结错误 API |
| **8** 无历史兼容负担 | 终态单一合同；官方教义删除临时逃逸；框架内测试/示例随迁 | 长期双轨、软降级并存、错误语义折叠充兼容 |

---

## 3. 方案（单一方案）

三条能力相互独立，按 **FR-SEQ-01 → FR-IDEM-01 → FR-RET-01** 分期落地；共享纪律（事务、显式控制、汇合点修复），不合并验收。

### 3.1 FR-SEQ-01 — `atomic.reserveSequenceRange`

#### 决策

在现有 `AtomicStorage` 上扩展区间原语，复用 `_ScopedSequence_` 与 scope 规范化，不建平行 counter 协议。

```ts
type ReserveSequenceRangeTarget = AtomicSequenceTarget & {
  count: number  // 正整数 N ≥ 1
}

type SequenceRange = {
  start: number       // 区间第一个可用序号（含）
  count: number       // N
  end: number         // start + (N-1)*step，闭区间末端值（step=1 时即 start+N-1）
  step: number
  // 可写序号：start + i*step，i = 0..count-1
}

interface AtomicStorage {
  nextSequenceValue(target: AtomicSequenceTarget): Promise<number>
  reserveSequenceRange(target: ReserveSequenceRangeTarget): Promise<SequenceRange>
  // seed / read 不变
}
```

#### 语义（与单值共享内核）

`reserveSequenceRange({ ..., count: N, step, initialValue })`：

1. 校验：`N` 为正整数；`sequenceName` / `scope` / `step` / `initialValue` 与
   `validateAtomicSequenceTarget` 同族；`N * step` 必须为有限数。
2. 空行：`start = initialValue + step`，`lastValue = initialValue + N * step`，一次写入，
   返回 `{ start, count: N, end: lastValue, step }`。
3. 已有行：一次 `lastValue := lastValue + N*step`，`end = 新 lastValue`，
   `start = end - (N-1)*step`。
4. 成功预留区间在 step 网格上连续、内部无空洞；同一 `sequenceName+scopeKey` 上并发
   `reserve` / `nextSequenceValue` 区间不相交（行锁 / upsert 串行化）。
5. **全局 gap 政策**：事务回滚不收回已推进的 `lastValue`（允许全局间隙）；**成功提交**的
   同一批多行之间不得有洞。
6. `nextSequenceValue` **必须**实现为 `reserveSequenceRange(..., count: 1)` 后取 `start`
   （共享私有 upsert 内核），禁止两套推进公式。
7. 属性级 `ScopedSequence` 仍为宿主创建时单值分配；与 range API 同表同族。共享
   `sequenceName` 时推进互相可见——官方教义：**分名**。

#### Setup 与表生命周期（d5/d6：与 Property 声明解耦；单一建表谓词）

**单一建表谓词（汇合点）**

逻辑谓词（实现须收为**唯一** helper，名称可微调；**禁止**在多处内联复制条件）：

```ts
// AtomicSequenceCapability 是对象描述符（System.ts），不是 boolean。
// 判定必须与 MonoSystem.validateAtomicSequenceTarget 一致：真值性 + setup 函数存在。
// 禁止：db.atomicSequenceCapability === true（对象 !== true，会在全部现网 atomic 驱动上恒假）。
function needsScopedSequenceTable(db: Database): boolean {
  return !!db.atomicSequenceCapability
    && typeof db.setupScopedSequenceState === 'function'
}
// 明确不读：ScopedSequence Property 是否存在、
// internalRequirements 里 scoped-sequence-table.declarations.length。
// 可选加强（非必须）：若 capability 存在，可额外断言其字段形状
// （例如 requiresActiveTransaction === true），但不得把整个 capability 与布尔 true 比等。
```

| 规则 | 合同 |
|------|------|
| 谓词**真**（capability 对象存在且 `setupScopedSequenceState` 为函数；现网：PostgreSQL / PGLite / SQLite） | 下表 **全部**读者在其生命周期点确保 `_ScopedSequence_` 存在且可用（`setupScopedSequenceState` / `CREATE TABLE IF NOT EXISTS`） |
| 谓词**假**（无 `atomicSequenceCapability` 字段/值为空，或无 `setupScopedSequenceState`；现网：MySQL） | 保持现有 `TransactionCapabilityError`（或既有等价 fail-fast）；不新增平行 capability 位；**不得**因 capability 是对象而非布尔 `true` 而判假 |
| 无任何 `ScopedSequence` Property | **仍**可调用 `nextSequenceValue` / `reserveSequenceRange`；**禁止**要求测试或应用「挂一条轻量 ScopedSequence 凑表」作为正式前提或夹具合同 |
| Property 级 seed / no-seed migration decision | **仍仅**由 `kind: 'scoped-sequence-table'` 的 **declarations** 触发；与建表谓词**分离** |
| 「仅 atomic API」应用 | 不强制新的业务 migration decision kind；只依赖上表建表读者 |

**建表读者清单（完整、有限；必须共用同一 helper）**

| ID | 读者 | 触发路径 | 动作 |
|----|------|----------|------|
| **S1** | `MonoSystem.setup`（`createTables === true` / install） | `Controller.setup(true)` → `system.setup(..., install: true)` → storage setup | 谓词真 ⇒ `await db.setupScopedSequenceState()` |
| **S2** | `MonoSystem.prepareMigrationAdditive` | `prepareMigrationSchema` / 迁移 diff 规划；`setup(false)` 附着前的 plan 构建 | 谓词真且 `existingTables` 无 `_ScopedSequence_` ⇒ 向 `preRecomputeDDL` **前置** `CREATE TABLE IF NOT EXISTS "_ScopedSequence_"`（方言 JSON/JSONB 与现网一致） |
| **S3** | `MonoSystem.applyMigrationAdditivePlan` | `applyMigrationSchema` / `migrate` apply | 谓词真 ⇒ `await db.setupScopedSequenceState()`；**禁止**再写 `declarations.length > 0` 内联条件 |
| 上游（非门闩） | `Scheduler.createInternalSchemaRequirements` | setup / migration 传入 `internalRequirements` | 无 Property 声明时仍可返回 `[]`；**不得**再被 S1/S2/S3 当作建表条件 |
| 被调用方 | Driver `setupScopedSequenceState`（PG / PGLite / SQLite） | 由 S1/S3 调用 | 保持 `IF NOT EXISTS`；**不**自行决定「是否需要表」 |
| 排除 | MySQL 等**未设置** `atomicSequenceCapability`（或未提供 `setupScopedSequenceState`） | — | 谓词假；atomic API 既有 fail-fast |

**d6 裁决时主干现状（M-03 必须消除，证据）**

| 位置 | 现状 |
|------|------|
| `requiresScopedSequenceState` | 仍为 `internalRequirements` 中 `scoped-sequence-table` **且** `declarations.length > 0`（`MonoSystem.ts`） |
| S1 / S2 | 调用上述 declarations 谓词 |
| S3 | **内联重复** `declarations.length > 0`，未走 helper |
| M-02 夹具 | `tests/runtime/sequenceRange.spec.ts` 仍靠 Property 级 ScopedSequence 凑表 |

d5 正文已写「能力向总是建表」，但实现落点只概括「setup…」、M-03 验收只强制 install 侧无 Property 测时，实现轮可能只改 S1 而留下 S2/S3 缺口。**d6 将读者清单与 M-03 验收一并收紧。**

> M-02 已交付共享内核与 range API。**凑表路径不再是设计选定**；M-03 必须落地本表谓词与 S1–S3，并至少一条 range 合同与真实 PG 并发文件均不依赖 Property 级 ScopedSequence。

#### 官方调用面：统一 `ComputationActionContext.atomic`（d5）

**唯一**业务侧多行票号写法：

```ts
await this.atomic.reserveSequenceRange({ sequenceName, scope, count: N, step, initialValue })
```

其中 `this` 为框架注入的 **`ComputationActionContext`**（名称实现可微调，字段合同如下）：

```ts
type ComputationActionContext = {
  controller: Controller
  /** 恒等于 controller.system.storage.atomic */
  atomic: AtomicStorage
  // Custom 另含：
  state?: unknown
  getState?: (...) => ...
}
```

| 回调 | 安装合同（d5） |
|------|----------------|
| **Transform** `callback` | `this` 为 `ComputationActionContext`（至少含 `controller` + `atomic`）。**不再**以裸 `Controller` 作为官方多行票号 `this`。 |
| **Custom** `compute` / `incrementalCompute` / `incrementalPatchCompute` / `asyncReturn` | 在现有 `{ controller, state, getState }` 上**必须**增加 `atomic`；官方示例只写 `this.atomic...`。 |
| 直接 `controller.system.storage.atomic` | 仍合法（非 computation 回调内）。 |

```ts
// Transform / Custom 合同示例（同构）
const { start, step } = await this.atomic.reserveSequenceRange({
  sequenceName: 'WorkspaceChangeSeq',
  scope: [
    { name: 'workspace', type: 'ref', value: { type: 'ref', entity: 'Workspace', id: workspaceId } },
  ],
  initialValue: 0,
  step: 1,
  count: items.length,
})
return items.map((item, i) => ({
  workspace: workspaceId,
  seq: start + i * step,
  ...item,
}))
```

**明确删除的官方形态（要求 8）**

- 文档/生成器中「Transform 用 `this.system.storage.atomic`、Custom 用 `this.controller.system.storage.atomic`」的**双表教义**——实现迁移完成后不得再作为最终用法。
- 循环 N 次 `nextSequenceValue` 作为多行连续票号示例。
- 业务侧方言 `UPDATE … RETURNING`。

> M-02 合同测已覆盖迁移前双路径，可作为回归直至 M-06 切换示例与 Transform 绑定；**新代码与 M-06 教义**只认 `this.atomic`。

#### 实现落点（汇合点）

| 读者 / 位置 | 变更 |
|-------------|------|
| `System.ts` `AtomicStorage` | `reserveSequenceRange` + `SequenceRange`（M-02 已做） |
| `MonoSystem.ts` 共享内核 | upsert 内核（M-02 已做） |
| `MonoSystem.ts` **S1/S2/S3** | **唯一** `needsScopedSequenceTable`（或改名 helper）；S1 install、S2 prepare DDL、S3 apply 全部走它；删除 `declarations.length > 0` 建表门闩与 S3 内联分叉（**M-03**） |
| Transform / Custom handles | 注入 `ComputationActionContext.atomic`（d5 增量；M-06 前可分步） |
| `ScopedSequence` property | 对外仍单值；内部可走 range(1)；**不再**承担「打开表」职责 |
| 公开导出 | `SequenceRange` 等 |
| 文档 / generator | 单一 `this.atomic` 示例；删除循环 next 多行与双 this 表；删除凑表教义 |

#### 并发合同

- **真实 PostgreSQL、两个独立连接/Controller** 并发 `reserve(10)` 与 `reserve(7)`，区间不相交；用返回序号插入带 `(scope, seq)` 唯一约束的行全部成功。
- PGLite / 单连接不得作为该并发完成证明。

---

### 3.2 FR-IDEM-01 — 声明式幂等 + 唯一 dispatch 管道 + `outcome`

#### 决策总览

1. 幂等为 **EventSource / Interaction 可选声明**；未声明则不参与幂等。
2. Dispatch attempt **唯一**控制流为阶段管道（下表）；**删除**「遗留合成 `guard` 与结构化字段并行」的正式双轨。
3. 成功且参与幂等时，响应**必须**带 `outcome: 'applied' | 'replayed'`（不变式 + 类型收紧）；未参与成功则**不得**出现 `outcome`。
4. 回放：仍执行 **admit**；跳过 **open 及之后所有写阶段与 postCommit**。
5. 并发同键：一等错误码，**不**把唯一约束异常翻译为 `replayed`。

#### 3.2.1 声明面

```ts
idempotency?: {
  /** 非空 string → 参与；null/undefined/'' → 本请求不参与 */
  key: (args: TArgs) => string | null | undefined
  /**
   * 幂等行命名空间（可选，默认 'eventSource'）。
   * - eventSource：键 = (dispatch 所用 eventSource.name, key)
   * - interaction：键 = (interaction.uuid 或稳定 interaction.name, key)
   *   用于「同一 Interaction 在独立入口与 Activity 包装入口去重」的显式选择
   * - custom：键 = (namespace(args), key)
   */
  scope?:
    | 'eventSource'
    | 'interaction'
    | { custom: (args: TArgs) => string }
  /** 回放时覆盖 data；默认存档 data */
  replayData?: (args: TArgs, stored: { data?: unknown }) => unknown
}
```

| 位置 | 合同 |
|------|------|
| `EventSourceCreateArgs` / 实例 / `public` / create / clone / parse | `idempotency`、`admit`、`open`（及既有 map/resolve/afterDispatch/postCommit） |
| `InteractionCreateArgs` | 正式 `idempotency`；`admit` 由 `runInteractionGuard` 安装（见下） |
| `ActivityManager.buildActivityInteractionEventSource` | **必须**转发 `idempotency`；**必须**安装 `admit`=仅 fullGuard、`open`=仅 create/check 簿记；`afterDispatch`=complete+用户钩子；**不得**再输出「唯一依赖合成 guard」的包装 |
| 匿名 EventSource | 可直接声明；有簿记副作用必须提供 `open`，且必须有 `admit` |

**默认 scope = `eventSource`**：Activity 包装名为 `activityName:interactionName`，与独立 Interaction **默认不共享**行。需要共享时调用方显式 `scope: 'interaction'`。

#### 3.2.2 阶段定义（互斥；唯一管道）

| 阶段 ID | 名称 | 允许的持久化副作用 | 禁止 |
|---------|------|-------------------|------|
| **A** | **admit** | 无业务/工作流行写入；Condition / payload | Activity create/check/complete；写事件行；外部 IO |
| **L-open** | **open** | Activity：`create`（head∧¬activityId）或 `checkActivityState`；可写回 `args.activityId` | Condition；complete 步 |
| **M** | mapEventData | 只读/纯函数 → 事件字段 | 推进 Activity |
| **C** | create event row | `storage.create(eventSource.entity, …)` | — |
| **R** | resolve | 读模型 / 返回 data | 不可逆外部 IO |
| **L-close** | close（`afterDispatch`） | Activity `completeInteractionState` + 用户 afterDispatch → context | 再次 admit |
| **I-claim / I-finish** | 幂等占位与成功存档 | 见 3.2.4 | 失败路径留下成功行 |
| **P** | postCommit + mutation side effects | 事务外或 BT deferred | 回放执行 |

「参与幂等」= 声明了 `idempotency` 且 `key(args)` 为非空字符串。

#### 3.2.3 事件源安装（无遗留 guard 双轨）

Controller **只**调度 `admit` / `open` / map / create / resolve / afterDispatch / 幂等行 / postCommit。  
**`EventSource.guard` 不再作为 dispatch 正式入口。**

| 事件源 | `admit` | `open` | `afterDispatch` | `idempotency` |
|--------|---------|--------|-----------------|---------------|
| 独立 Interaction | `runInteractionGuard`（今日 buildInteractionGuard 的语义） | 缺省 no-op | 用户 afterDispatch | CreateArgs 安装 |
| Activity 包装 | **仅** `fullGuard` | **仅** create/check 簿记（与今日 wrappedGuard 中非 Condition 部分相同） | complete + 用户 afterDispatch，context 含 activityId/nextState | **必须**转发 |
| 匿名 EventSource | 必填（若完全无检查可为显式空实现）；禁止靠未文档化旁路跳过 | 可选 | 可选 | 可选 |

**迁移框架内部（要求 8，非双轨兼容）**

- 删除或降为非 dispatch 路径：`ActivityManager` 的合成 `wrappedGuard` 作为**唯一**守卫字段的模式。
- Interaction 实例上若仍保留 `guard` 属性名作内部别名，必须与 `admit` **同一函数引用**且不得出现「只填 guard 不填 admit」的公开 CreateArgs 合同；公开 CreateArgs / 文档只教 `admit` 管道字段 + 既有 conditions。
- Setup/包装：Activity 源缺少 `admit`+`open` 分列 → **fail-fast**（无论是否声明幂等——避免再次长回合成 guard）。

#### 3.2.4 幂等存储与并发

内部表 `_DispatchIdempotency_`（名可微调）：

```ts
// 逻辑行
type DispatchIdempotencyRow = {
  namespace: string          // scope 解析结果
  idempotencyKey: string
  state: 'in_flight' | 'succeeded'
  // succeeded 时：
  data?: unknown             // JSON 安全子集
  context?: Record<string, unknown>  // 含 activityId 等
  createdAt: number
}
// UNIQUE (namespace, idempotencyKey)
```

**协议（选定：开始占位 + 成功终态）**

1. 事务内解析 `namespace` 与 `key`；参与则 `SELECT` 行（宜 `FOR UPDATE` 或等价串行化）。
2. 若 `state === 'succeeded'` → 分支 `replayed`（仍先/已做 admit，见算法）。
3. 若 `state === 'in_flight'` → **失败**，稳定错误
   `IdempotencyError`（或项目错误类型）`code: 'IDEMPOTENCY_IN_FLIGHT'`，
   **不得**伪装 `replayed`，**不得**只抛裸唯一约束。
4. 若无行 → 插入 `in_flight`（I-claim）；执行 open…L-close；将行更新为 `succeeded` 并写入 data/context（I-finish）。
5. 事务回滚 → 占位消失；同键可再次 `applied`（I5）。
6. SAVEPOINT 重试属于**同一逻辑首次 attempt**：回滚后无成功行，可再 claim；不得与跨提交回放混淆。

> 若实现证明单库 upsert 更简且能对「他方已 succeeded」与「他方 in_flight」分支映射到上述码，允许内部合并语句，但**对外码与真值表不变**。

#### 3.2.5 `DispatchResponse`（收紧）

```ts
export type DispatchOutcome = 'applied' | 'replayed'

export type DispatchResponse = {
  error?: unknown
  data?: unknown
  effects?: RecordMutationEvent[]
  sideEffects?: { [k: string]: SideEffectResult }
  context?: { [k: string]: unknown }
  /**
   * 参与幂等且 attempt 成功得出分支时必填。
   * 未参与：必须为 undefined（不得填）。
   * 失败：不得表示成功分支（通常不设 outcome）。
   */
  outcome?: DispatchOutcome
}
```

**不变式（类型 + 运行时/测试）**

- 参与 ∧ `!error` ∧ 成功返回 ⇒ `outcome === 'applied' | 'replayed'`。
- 未参与 ∧ 成功 ⇒ `outcome` 缺省。
- `outcome === 'replayed'` ⇒ `effects` 为空数组（或等价无突变）；P 不执行。

（可选增强，不阻塞 M-04：导出判别辅助类型 / 类型守卫 `isIdempotentReplay(result)`。）

#### 3.2.6 参考算法（唯一控制流）

```text
function runDispatchAttemptBody(eventSource, args, isolation) -> DispatchResponse:
  keyRaw = eventSource.idempotency?.key(args)   // 纯函数
  participating = typeof keyRaw === 'string' && keyRaw.length > 0
  namespace = participating ? resolveNamespace(eventSource, args) : null

  return storage.runInTransaction(...):
    branch = 'unscoped'
    stored = null
    if participating:
      stored = loadIdempotencyRow(namespace, keyRaw)  // 串行化读
      if stored?.state == 'succeeded':
        branch = 'replayed'
      else if stored?.state == 'in_flight':
        throw IdempotencyError('IDEMPOTENCY_IN_FLIGHT')
      else:
        branch = 'applied'

    // --- A admit：applied / replayed / unscoped 凡 !ignoreGuard 均执行 ---
    if not controller.ignoreGuard:
      if eventSource.admit == null:
        throw InstallationError('eventSource.admit is required')
      await eventSource.admit.call(controller, args)
      // 失败 → 抛错；回滚；无成功 outcome

    if branch == 'replayed':
      data = eventSource.idempotency.replayData?.(args, stored) ?? stored.data
      return {
        outcome: 'replayed',
        data,
        effects: [],
        sideEffects: {},
        context: stored.context,
      }
      // 不执行：open, M, C, R, L-close, I-*, P

    // --- applied / unscoped ---
    if branch == 'applied':
      insertInFlight(namespace, keyRaw)   // I-claim

    if eventSource.open != null:
      await eventSource.open.call(controller, args)

    eventData = await eventSource.mapEventData?(args) ?? {}
    await storage.create(eventSource.entity.name, eventData)
    data = await eventSource.resolve?.call(controller, args)
    context = undefined
    if eventSource.afterDispatch:
      context = await eventSource.afterDispatch.call(controller, args, { data }) || undefined

    if branch == 'applied':
      finishSuccess(namespace, keyRaw, {
        data: jsonSafeSubset(data),
        context: jsonSafeSubset(context),
        createdAt: now(),
      })   // I-finish: in_flight → succeeded

    return {
      outcome: participating ? 'applied' : undefined,
      data,
      effects: effectsContext.effects,
      sideEffects: {},
      context,
    }

// 事务成功之后：
if result.error: do not run P
else if result.outcome == 'replayed': do not run P; do not push bt.deferred
else: run P
```

`resolveNamespace`：

- `scope` 缺省或 `'eventSource'` → `eventSource.name`
- `'interaction'` → 稳定 interaction 标识（安装时写入包装元数据；独立 Interaction 用其 name/uuid）
- `{ custom }` → `custom(args)` 非空字符串

#### 3.2.7 Activity × 幂等真值表（验收标 ★ 必测）

符号：`K` = 同幂等键第二次；`A0` = 无 activityId；`A1` = 带首次 activityId；`auth`/`deny` = admit 结果。

| # | 场景 | 第二次 | outcome | Activity 行 Δ | 备注 |
|---|------|--------|---------|---------------|------|
| ★1 | Head 已成功，K+A0+auth | `replayed` | 0 | 不要求客户端带 activityId；context.activityId 来自存档 |
| ★2 | Head 已成功，K+A1+auth | `replayed` | 0 | 不跑 checkActivityState |
| ★3 | Head 已成功，K+deny | error | 0 | 回放仍 admit |
| ★4 | 步已完成，K+A1+auth | `replayed` | 0 | 不二次 complete；无 ActivityStateError |
| ★5 | 同键并发第二人见 in_flight | error `IDEMPOTENCY_IN_FLIGHT` | — | 非 replayed |
| 6 | 未参与 head 两次 | outcome 缺省 | +1/次 | 今日多实例语义，不收紧 |
| ★7 | 包装转发 idempotency | ★1 可复现 | — | 漏转发禁止 |
| 8 | 独立 Interaction | applied→replayed | n/a | 无 open |

#### 3.2.8 分支总表

| 步骤 | unscoped | applied | replayed | in_flight 冲突 | 首次失败 |
|------|----------|---------|----------|----------------|----------|
| admit | 执行 | 执行 | **执行** | 视实现：可在检测后抛 | 执行/失败 |
| open | 若有 | **执行** | **跳过** | 不进入 | 回滚 |
| M/C/R/L-close | 执行 | 执行 | 跳过 | — | 回滚 |
| I-claim/finish | 无 | claim+finish | 不更新 | 无新成功行 | 无成功行 |
| outcome | 缺省 | `applied` | `replayed` | 无成功 outcome | 无 |
| P | 是 | 是 | **否** | 否 | 否 |

#### 3.2.9 不变式

- **I1** 支持幂等的源：同键两次成功 ⇒ `applied` 然后 `replayed`。
- **I2** 回放：事件行不增；Activity 行不增；领域行不双份。
- **I3** 回放：`postCommit`=0；`completeInteractionState`=0。
- **I4** admit 失败 ⇒ 无成功 `replayed`。
- **I5** 首次失败/回滚后同键可再 `applied`。
- **I6** 未参与 ⇒ 成功时无 `outcome`。
- **I7** Activity 包装缺少 `admit`+`open` 分列 ⇒ setup/包装 fail-fast。
- **I8** 默认 namespace 按 scope 合同；显式 `interaction` 才能跨入口共享。
- **I9** 参与 ∧ 成功 ⇒ `outcome` 必填。
- **I10** 同键 `in_flight` ⇒ `IDEMPOTENCY_IN_FLIGHT`，非 `replayed`。

**明确否定**

- 唯一约束冲突 ≠ `replayed`。
- 回放跳过 admit。
- 回放执行 open / C / L-close / P。
- 合成 guard 正式双轨。
- 静默丢弃 Interaction/Activity 上的 `idempotency`。
- 强制回放必须带 activityId（与 ★1 冲突）。

#### 3.2.10 与 BT

- 幂等读写在 attempt 存储事务（BT 下 SAVEPOINT）内。
- `result.error`：不 finish 成功行；不推 deferred P。
- BT ROLLBACK：未提交占位/成功行消失。
- BT COMMIT：仅非 replayed 成功路径的 deferred P 执行一次。

#### 3.2.11 读者枚举

| 读者 | 处理 |
|------|------|
| EventSource Klass | `idempotency` / `admit` / `open` 序列化与校验 |
| Interaction Klass | 安装 idempotency；admit=runInteractionGuard |
| ActivityManager | 转发 idempotency；分列 admit/open；afterDispatch=complete+用户 |
| `runDispatchAttemptBody` + postCommit/deferred | **唯一**解释参考算法 |
| 错误类型导出 | `IDEMPOTENCY_IN_FLIGHT`（及必要时 `IDEMPOTENCY_CONFLICT`） |
| setup / migration（表生命周期） | 见 **§3.2.11a**；与 sequence **同构**读者清单，禁止分叉条件 |
| usage/generator | 声明 key + 读 `outcome`；删除扫 effects 教义 |

#### 3.2.11a `_DispatchIdempotency_` 表生命周期（与 §3.1 S1–S3 同构）

**单一建表谓词（选定：总是建）**

```ts
function needsDispatchIdempotencyTable(_db: Database): boolean {
  // MonoSystem / Controller 可安装的存储路径上总是为 true。
  // 不读：是否有 eventSource 声明了 idempotency。
  return true
}
```

未声明幂等的应用多一张空内部表，换取与 sequence 相同的「零声明门闩、零分叉」纪律。不支持事务 / 不能 `dispatch` 的 driver（如 MySQL）可在既有 capability 门闩处 fail-fast；**不得**再引入「有声明才建表」第二套条件。

| ID | 读者 | 触发路径 | 动作 |
|----|------|----------|------|
| **I1** | `MonoSystem.setup`（install / `createTables`） | `Controller.setup(true)` | 谓词真 ⇒ 创建 `_DispatchIdempotency_`（`IF NOT EXISTS` / 专用 setup helper） |
| **I2** | `MonoSystem.prepareMigrationAdditive` | 迁移规划 | 谓词真且表缺失 ⇒ `preRecomputeDDL` 前置建表 DDL |
| **I3** | `MonoSystem.applyMigrationAdditivePlan` | 迁移 apply | 谓词真 ⇒ 确保表存在（同一 helper；**禁止**内联「有 idempotency 声明」条件） |

M-04 实现必须一次闭合 I1–I3；验收至少覆盖 install 路径建表；迁移路径与 sequence M-03 同级抽查（可与 M-04 合同测合并，但不得只改 I1）。

#### 3.2.12 M-04 验收清单（强制）

1. 独立 Interaction：`applied`→`replayed`，事件行不增；断言不读 `effects` 判别。
2. postCommit：首次 1、回放 0；BT 回放不推 deferred。
3. admit 拒绝 ⇒ 无成功 replayed。
4. **真实 Activity** head ★1（第二次可无 activityId）。
5. **真实 Activity** ★4（步完成后 replayed，无 ActivityStateError）。
6. 包装缺 admit/open ⇒ fail-fast。
7. 未参与无 outcome；失败后可再 applied。
8. 同键 in_flight / 并发 ⇒ `IDEMPOTENCY_IN_FLIGHT`（至少单测串行模拟 + 可行时并发）。

---

### 3.3 FR-RET-01 — 实体 `retention` 声明 + 安全点修剪

#### 决策

仅 **Entity**（Relation 非目标）。`Entity.create` 增加可选 `retention`。

```ts
/**
 * 可辨别联合（标签清晰；与校验同一规则）。
 * - forever / 缺省：本机制不删
 * - cap：按 orderBy 降序每分区保留最新 N；可叠加 ttl（先 ttl 再 cap）
 * - ttl：仅按时间删除；无 orderBy
 */
type EntityRetention =
  | { mode: 'forever' }
  | {
      mode: 'cap'
      partitionBy?: string[]
      retainLatest: number          // 正整数
      orderBy: string[]             // 非空；各键降序；禁止隐式 createdAt
      ttl?: {
        timestampProperty: string
        maxAgeMs: number
      }
    }
  | {
      mode: 'ttl'
      partitionBy?: string[]
      ttl: {
        timestampProperty: string
        maxAgeMs: number
      }
      // 无 retainLatest / orderBy
    }
```

> 相对 d4 的 `bounded+retainLatest` / `bounded+仅 ttl`：语义相同，**mode 标签**改为 `cap` | `ttl`，避免靠字段有无猜测分支。若实现早期曾写 `mode:'bounded'`，须在落地前统一为上表（无双名并存教义）。

**声明期校验**

| 规则 | 行为 |
|------|------|
| 未声明或 `forever` | 合法；不删 |
| `cap` | `retainLatest` 正整数；`orderBy` 非空且为实体属性；`partitionBy` 名合法；可选 ttl 字段合法 |
| `ttl` | `timestampProperty` 为 date/number；**无** orderBy/retainLatest |
| FilteredEntity / MergedEntity | 声明 retention → create 期 fail-fast（类型上尽量排除） |
| 含硬删除 computation（`_isDeleted_` 等） | 禁止 retention |

**组合**：`cap` 且带 `ttl` ⇒ **先 TTL，再 cap**。

#### 安全点与 API（单一主路径）

1. **唯一执行修剪入口**  
   `controller.maintainEntityRetention(options?: { entityNames?: string[]; now?: number }): Promise<RetentionReport>`  
   - 独立存储事务（或按实体分事务），**不**进入业务 attempt 事务。  
   - 报告每实体删除行数。  
   - 合同测试与生产调度均只教此 API。

2. **可选自动挂钩（默认关闭）**  
   `ControllerOptions.entityRetention?: { runAfterSuccessfulDispatch?: boolean }`  
   - 默认 `false`。  
   - 为 `true` 时：在 dispatch **成功提交之后**（与 postCommit 同阶段之后）调用维护；仍是上述同一函数，**不**另造第二套删除语义。  
   - 可见性：READ COMMITTED 下读者可能看到行数下降；增量 feed 以序号/游标为准；需快照则在单查询事务中读。文档写清即可。

3. **实现策略**  
   - 分 partition；cap：orderBy 降序删排名 > N。  
   - TTL：`timestamp < now - maxAgeMs`（`now` 可注入）。  
   - 删除走 `storage.delete`，正常 mutation 事件。  
   - 未声明 retention 的实体不扫。  
   - 大批量分批（内部常量）。

4. **与 `cleanupAsyncTasks`**  
   并存；对象不同（用户实体 vs 内部 async task 终态行）；retention 不清理未声明的内部表。

#### 读者枚举

| 读者 | 处理 |
|------|------|
| Entity Klass | 序列化 retention；声明期校验 |
| Controller setup | 收集清单 |
| `maintainEntityRetention` | 唯一修剪执行点 |
| migration 签名 | 纳入实体声明签名（热读优先；签名字段最小扩展） |
| usage/generator | cap/ttl 示例；**删除**手写 prune 推荐 |

---

### 3.4 横切纪律

- **依赖方向**：类型在 core / System / Controller；实现在 runtime；禁止向上导入。
- **汇合点**：sequence 共享内核；dispatch 只跑 admit/open 管道；retention 只经 `maintainEntityRetention`。
- **要求 8**：不保留正式双轨；官方教义删除临时逃逸；框架测试与示例随迁。
- **与并行任务**：遵守非 BT 事务内 dispatch 硬失败；不新增灰色路径。
- **真实 PG**：SEQ 并发 env 门控；无绿跑不得完成 M-03。
- **d5/d6/d7 与已完成里程碑**：M-01 求证、M-02 range API/共享内核仍然有效。d5/d6/d7 增量（**单一** `needsScopedSequenceTable`——d7 与对象型 capability 对齐——+ S1/S2/S3、幂等表 I1–I3 同构、`this.atomic`、admit/open 唯一管道、in_flight 码、retention mode 标签）落在 **未完成**里程碑，不重开已审计通过的 M-01/M-02；M-02 的双 this 合同测可保留为迁移期回归，直至 M-06 切换官方唯一入口。M-02 夹具若仍凑表，由 M-03 删除该合同依赖，不重开 M-02。

---

## 4. 里程碑

初始里程碑数 **M = 6** → 实现总预算 **N = 5 × 6 = 30**（设计通过时由裁决轮写入状态头）。

### M-01 — 求证固化与基线（设计已完成证据；实现轮仅归档/钉住）

- **状态**：`已完成`
- **reopen-count**：`0`
- **reopen-domains**：`{}`
- **前置**：无
- **覆盖要求**：1
- **可观察结果**：设计文档 §1 三条「缺口存在」证据可核对；相关既有套件绿。
- **验收命令**：
  - 人工：设计 §1 与源码路径一致（审计核对）。
  - `npx vitest run tests/runtime/scopedSequence.spec.ts tests/runtime/asyncTaskRetention.spec.ts`
- **最新证据（实现轮 k=1，2026-08-11）**：
  - Git：`a7f6ec856eafee428f327b627ad7648058ef85b8`（`main`）；工作树仍仅 `?? docs/sequence-idempotency-retention/` 与 `?? prompt/remaining-framework-gaps-seq-idem-retention.md`；无生产代码改动。
  - **§1 与源码路径复核（本轮）**：
    - **FR-SEQ-01**：`AtomicStorage`（`src/runtime/System.ts:80–88`）仅 `nextSequenceValue` / `seedSequenceValue` / `readSequenceValue`；全 `src/` 无 `reserveSequenceRange`。`MonoSystem.createAtomicStorage`（约 `1392+`）单值 `+ step` upsert。
    - **FR-IDEM-01**：`DispatchResponse`（`src/runtime/Controller.ts:114–120`）字段为 `error`/`data`/`effects`/`sideEffects`/`context`，无 `outcome`；全 `src/` 无 `idempotenc*`。
    - **FR-RET-01**：`EntityCreateArgs`（`src/core/Entity.ts:22–31`）无 `retention`/`retainLatest`；全 `src/` 无 `maintainEntityRetention`/`retainLatest`；`Controller.cleanupAsyncTasks`（约 `404+`）仅终态 async task 行。
  - **验收命令**：`npx vitest run tests/runtime/scopedSequence.spec.ts tests/runtime/asyncTaskRetention.spec.ts` → **25 passed**（2 files；asyncTaskRetention 3 + scopedSequence 22）。
  - 设计期三 FR 最小实验结论仍有效（见 §1）；本轮未再引入临时 gap 脚本。
- **审计（additional task 4，对应 k=1，2026-08-11）**：
  - 独立复跑验收命令：**25 passed**（2 files）。
  - 直接读源复核 §1：AtomicStorage 无 range；DispatchResponse 无 outcome；EntityCreateArgs 无 retention；cleanupAsyncTasks 仅 async task 终态；`rg` 全 `src/` 无 `reserveSequenceRange` / `idempotenc*` / `maintainEntityRetention` / `retainLatest`。
  - 无实现缺陷；无验证缺口 reopen。详见 `sequence-idempotency-retention-audit.md`。

### M-02 — FR-SEQ-01：`reserveSequenceRange` API 与单连接合同

- **状态**：`已完成`
- **reopen-count**：`0`
- **reopen-domains**：`{}`
- **前置**：M-01
- **覆盖要求**：2（功能与单次多行；不含真实 PG 双连接完成证明）
- **可观察结果**：
  - `storage.atomic.reserveSequenceRange` 可用；与 `nextSequenceValue` 共享推进语义。
  - 同事务 reserve N 后写入 N 行，`max-min+1 === N`（step=1）且无缺失。
  - Transform 与 Custom **各自**官方用法测试零方言 SQL：Transform 经
    `this.system.storage.atomic...`，Custom 经 `this.controller.system.storage.atomic...`
    （见 §3.1 `this` 表）；禁止只用一种回调形态充当两种完成证明。
- **验收命令**（实现期新增，建议路径）：
  - `npx vitest run tests/runtime/sequenceRange.spec.ts`
  - 含：空 scope 首次 N、后续追加、与 `nextSequenceValue` 交错不相交、回滚后允许全局 gap、
    `count` 非法 fail-fast、事务外调用 fail-fast、
    Transform 回调路径多行连续区间、Custom 回调路径多行连续区间（两种 `this` 取法各至少一例）。
- **最新证据（实现轮 k=2，2026-08-11）**：
  - **API 落点**：
    - `src/runtime/System.ts`：新增 `ReserveSequenceRangeTarget`、`SequenceRange`；`AtomicStorage.reserveSequenceRange`。
    - `src/runtime/MonoSystem.ts`：私有 `reserveSequenceRangeInternal` 为共享 upsert 内核；`nextSequenceValue` = `reserve(..., count:1).start`；`reserveSequenceRange` 公开挂载。
    - 表仍由 ScopedSequence 声明 / `internalRequirements` 路径创建（与设计选定一致）；测试用轻量 property ScopedSequence 打开表。
  - **验收**：`npx vitest run tests/runtime/sequenceRange.spec.ts` → **11 passed**（空 scope 首次 N、追加、与 next 交错 step=2、回滚 gap 政策、count 非法、事务外 fail-fast、count=1 等价、Transform `this.system`、Custom compute `this.controller`、Custom incrementalCompute `this.controller`、同事务 reserve+N 行唯一约束）。
  - **回归**：`npx vitest run tests/runtime/scopedSequence.spec.ts` → **22 passed**；`asyncTaskRetention.spec.ts` → **3 passed**；`npm run check`（`tsc --noEmit --skipLibCheck`）通过。
  - 未改 property 级 ScopedSequence 对外语义；未宣称真实 PG 双连接（属 M-03）。
- **审计（additional task 4，对应 k=2，2026-08-11）**：
  - 独立复跑 `sequenceRange.spec.ts` → **11 passed**；`scopedSequence`+`asyncTaskRetention` → **25 passed**；`npm run check` 通过。
  - 源码核对：共享 `reserveSequenceRangeInternal`；`nextSequenceValue` = range(count=1).start；空行/已有行公式与 §3.1 一致；Transform `this.system` 与 Custom `this.controller` 合同各有用例；属性级 ScopedSequence 仍走单值 API。
  - 无实现缺陷；无验证缺口 reopen。详见 `sequence-idempotency-retention-audit.md`。


- **d5 备注**：本里程碑在要求 8 之前完成，双 `this` 路径与「轻量 ScopedSequence 建表」曾符合当时设计。d5 后官方终态见 §3.1 / M-03 / M-06；**不**因此自动 reopen M-02，除非审计发现 range 语义本身错误。

### M-03 — FR-SEQ-01：真实 PostgreSQL 双连接并发合同 + d5/d6 建表谓词（S1–S3）

- **状态**：`已完成`
- **reopen-count**：`0`
- **reopen-domains**：`{}`
- **前置**：M-02
- **覆盖要求**：2（并发硬约束）+ d5/d6 setup（单一谓词 + 全读者）
- **可观察结果**：
  1. **真实 PG 双连接**：两独立连接/Controller 并发 `reserve(10)` 与 `reserve(7)` 区间不相交；用返回序号插入带 `(scope, seq)` 唯一约束的行全部成功。
  2. **S1 — install 无 Property**：driver 支持 atomic sequence 时，**无任何 ScopedSequence Property** 的应用仅 `controller.setup(true)` 即可 `reserveSequenceRange`（禁止凑表夹具）。
  3. **S2/S3 — migration / 附着路径**：无 Property 声明时，下列**至少一条**可执行路径在**不**先靠 install 凑表声明的前提下，仍能使 `_ScopedSequence_` 可用并成功 `reserveSequenceRange`：
     - `prepareMigrationAdditive` 规划结果含建表 DDL（可断言 plan），且 `applyMigrationAdditivePlan`（或完整 `migrate` / 等价 apply）之后 reserve 成功；或
     - 对已存在库的 `setup(false)` 附着路径，若会走 prepare+apply 补内部表，则附着后 reserve 成功。
  4. **汇合点**：S1/S2/S3 源码均调用同一 `needsScopedSequenceTable`（或等价唯一 helper）；`applyMigrationAdditivePlan` **无** `declarations.length` 内联建表条件。
  5. **回归**：`sequenceRange.spec.ts` 去掉「必须靠 ScopedSequence 打开表」的夹具合同（可保留有 Property 的兼容测，但至少一条 range 测零 Property）；`scopedSequence` 既有套件不回退。
- **验收命令**：
  - `INTERAQT_POSTGRES_DATABASE=... PGHOST=... PGUSER=... PGPASSWORD=... npx vitest run tests/runtime/postgresqlSequenceRange.spec.ts`  
    （无 env 时 skip；**无绿跑不得将本里程碑标完成**；PG 文件本身不依赖凑表。）
  - `npx vitest run tests/runtime/sequenceRange.spec.ts`  
    （必须含：**无** Property 级 ScopedSequence 的 setup(true)+reserve；以及 **S2/S3 或 setup(false)/migration 补表** 路径之一的可执行断言——可同文件新增 describe，或 `tests/runtime/sequenceTableLifecycle.spec.ts`。）
  - 源码抽查（审计用）：
    - `rg -n "needsScopedSequenceTable|requiresScopedSequenceState|declarations\.length > 0" src/runtime/MonoSystem.ts` — 建表门闩不得再绑定 declarations。
    - helper 体与调用处**不得**出现 `atomicSequenceCapability === true`（capability 为对象描述符；须与 `validateAtomicSequenceTarget` 同为真值性 / 空值判断）。
- **最新证据（实现轮 k=3 + 审计轮 k=3-audit，2026-08-11）**：
  - **S1/S2/S3 汇合点**（`src/runtime/MonoSystem.ts`）：
    - 唯一 helper `needsScopedSequenceTable()` = `!!db.atomicSequenceCapability && typeof db.setupScopedSequenceState === 'function'`（禁止 `=== true`；不读 declarations）。
    - S1 `setup(createTables)`、S2 `prepareMigrationAdditive`（表缺失时前置 CREATE DDL）、S3 `applyMigrationAdditivePlan` 均调用该 helper；删除 `requiresScopedSequenceState` 与 `declarations.length > 0` 建表门闩。
  - **审计独立复验**：
    - `sequenceRange` + `scopedSequence` + `asyncTaskRetention` → **37 passed**。
    - `postgresqlSequenceRange`（真实 PG）→ **2 passed**；加跑 `postgresqlScopedSequence` → **2 passed**。
    - `npm run check` → 通过。
    - 源码抽查：仅 `needsScopedSequenceTable` 三处调用；无 declarations 建表门闩；无 `=== true`。
    - 对抗核对：lifecycle DROP 后空 `internalRequirements` 仍规划 create-table；PG 双独立 `PostgreSQLDB` 连接并发；M-02 共享内核未回退。
  - `package.json` `test:postgres` 已纳入 `postgresqlSequenceRange.spec.ts`。
  - 审计结论：无实现缺陷；无 reopen；状态 → `已完成`。

### M-04 — FR-IDEM-01：admit/open 管道 + 声明式幂等 + `outcome`

- **状态**：`已完成`
- **reopen-count**：`0`
- **reopen-domains**：`{}`
- **前置**：M-01（不依赖 M-02/03）
- **覆盖要求**：3
- **可观察结果**（与 §3.2 一致；缺一不可）：
  - EventSource/Interaction/Activity **无**正式合成 guard 双轨；Activity 包装分列 `admit`/`open` 并转发 `idempotency`。
  - `_DispatchIdempotency_` 经 I1–I3 确保存在（总是建；无「有声明才建」分叉）；至少 install 路径合同测覆盖建表。
  - 独立 Interaction：同键 `applied`→`replayed`；参与成功必有 `outcome`；未参与无 `outcome`；不读 `effects` 判别。
  - postCommit / BT deferred：回放为 0。
  - admit 失败无成功 replayed。
  - 真实 Activity ★1、★4。
  - 缺 admit/open ⇒ fail-fast（I7）。
  - in_flight / 并发 ⇒ `IDEMPOTENCY_IN_FLIGHT`（I10）。
  - 首次失败后同键可再 applied（I5）。
- **验收命令**：
  - `npx vitest run tests/runtime/dispatchIdempotency.spec.ts`
  - 必须含真实 Activity + `controller.dispatch(activityEventSource, …)`，禁止仅 stub guard。
- **最新证据**（k=4 实现轮 + k=4-audit）：
  - 实现轮：`dispatchIdempotency.spec.ts` **13 passed**；相关回归与 `npm run check` 绿
  - 审计轮独立复跑：`dispatchIdempotency` **13 passed**；含 eventSource/sequenceRange/scopedSequence/transaction*/activity/serialization 的回归 **136+2 passed**；`npm run check` exit 0
  - 源码：admit/open 唯一管道；Activity 分列 + 转发 idempotency；I1–I3 `needsDispatchIdempotencyTable`；`IdempotencyError`；回放跳过 open…P
  - 对抗探针（临时）：`scope:'interaction'` 跨入口共享、★2 带 activityId 回放、idempotency 序列化 `func::` 编码均通过后删除
  - 详见 `sequence-idempotency-retention-audit.md`

### M-05 — FR-RET-01：声明式 retention + `maintainEntityRetention`

- **状态**：`已完成`
- **reopen-count**：`0`
- **reopen-domains**：`{}`
- **前置**：M-01
- **覆盖要求**：4
- **可观察结果**：
  - `mode:'cap'` + 必填 `orderBy`：M>N 维护后每分区 ≤ N 且为最新 N。
  - `mode:'ttl'`（无 orderBy）：注入 `now` 后过期删、未过期留。
  - `cap`+`ttl`：先过期再 cap。
  - 未声明 / `forever` 不删；无手写 prune 循环。
  - 与 `cleanupAsyncTasks` 边界文档化。
  - filtered/merged 或硬删除 computation ⇒ 声明期失败。
  - 自动挂钩默认关；若测开启，仍只调用同一 `maintainEntityRetention`。
- **验收命令**：
  - `npx vitest run tests/runtime/entityRetention.spec.ts`
- **最新证据**：
  - `EntityRetention` 可辨别联合（`forever` | `cap` | `ttl`）+ `Entity.create` 声明期校验（filtered/merged/硬删除/`orderBy`/`ttl` 类型）。
  - `Controller.maintainEntityRetention` 为唯一修剪入口；独立事务；cap 先可选 TTL 再 latest-N；`storage.delete` 分批。
  - `ControllerOptions.entityRetention.runAfterSuccessfulDispatch` 默认 `false`；开启时在成功 commit + postCommit 之后调用同一 API（含 BT 路径）。
  - migration manifest `records[].retention` 纳入 modelHash。
  - 验收：`npx vitest run tests/runtime/entityRetention.spec.ts` → **15 passed**（审计加强：mutation events + failed-dispatch/BT auto-hook timing）。
  - `npm run check` 通过；相关回归 dispatchIdempotency / sequenceRange / scopedSequence / asyncTaskRetention 绿。
- **审计（k=5-audit）**：
  - 独立复跑验收 **15 passed**；相关回归 50 + asyncTaskRetention 3 绿；`npm run check` EXIT 0。
  - 源码核对：§3.3 联合与声明期守卫、唯一 `maintainEntityRetention`、cap 先 TTL 再 latest-N、`storage.delete` 走 `callWithEvents`、auto-hook 默认关且仅成功 applied 后调用（非 BT 与 BT 两条路径）。
  - 对抗探针（临时，已删除）：mutation listen、global cap、timestamp ttl、failed dispatch 不 prune、unknown entityNames fail-fast、嵌套 storage 事务 reuse/回滚可见性均通过。
  - 验证缺口（非实现缺陷）：原套件未钉 mutation events 与 BT 挂钩时序；审计轮直接加强测试并复验通过。
  - 无实现缺陷；无 reopen；状态 → `已完成`。

### M-06 — 公开教义收敛、统一 `this.atomic`、导出与交叉回归

- **状态**：`已完成`
- **reopen-count**：`1`
- **reopen-domains**：`{ knowledge-callback-this-doctrine: 1 }`
- **前置**：M-02、M-04、M-05；M-03 未完成则不得宣称 FR-SEQ-01 整包完成（文档可标 env 依赖）
- **覆盖要求**：2、3、4、5、6、8
- **可观察结果**：
  - Transform/Custom 官方多行票号**仅** `this.atomic.reserveSequenceRange`；`ComputationActionContext` 已注入；usage/generator **删除**双 this 表与循环 `nextSequenceValue` 多行示例。
  - usage/generator：**删除**扫 `effects` 判幂等、手写 prune 作为可用模式；改为 `outcome` 与 `maintainEntityRetention`。
  - 类型导出与 `npm run check` 通过。
  - 回归：sequenceRange、dispatchIdempotency、entityRetention、scopedSequence、asyncTaskRetention 全绿；有 env 时含 postgresqlSequenceRange。
- **验收命令**：
  - `npm run check`
  - `npx vitest run tests/runtime/sequenceRange.spec.ts tests/runtime/dispatchIdempotency.spec.ts tests/runtime/entityRetention.spec.ts tests/runtime/scopedSequence.spec.ts tests/runtime/asyncTaskRetention.spec.ts`
  - 有 env 时追加 postgresql 套件
  - 人工：知识库无旧逃逸推荐段落
  - 门闩（k=6-audit 增补）：`generator/api-reference.md` 的 Transform 合同/callback 示例不得再写 `this: Controller` / `this.system.storage`；Custom 合同须含 `atomic`
- **最新证据**（k=7 实现轮 — 闭合 D1）：
  - 针对 k=6-audit D1：修正 `agent/agentspace/knowledge/generator/api-reference.md`
    - Transform.create 参数合同：`this` → `ComputationActionContext`；存储 → `this.controller.system.storage` / `this.controller.globals`；序号区间 → `this.atomic`。
    - 全部 Transform `callback` 示例（10 处）：`this: ComputationActionContext`；`this.system.storage` → `this.controller.system.storage`；`this.globals` → `this.controller.globals`。
    - Custom.create 参数合同：`this: ComputationActionContext` 并显式含 `controller`+`atomic`（+`state?`/`getState?`）。
    - 保留 Condition / EventSource guard·resolve·afterDispatch / StateMachine `computeTarget` / StateNode `computeValue` 等合法 `this: Controller` 绑定。
    - 反模式否定句中的旧路径字符串保留（禁止侧）。
  - 其它 generator 文（`computation-implementation` / `basic-interaction-generation` / `entity-relation-generation`）无第二处 Transform `this: Controller` 合同。
  - 门闩：
    ```bash
    rg -n "callback:.*function\\(this: Controller" agent/agentspace/knowledge/generator/api-reference.md  # none
    rg -n "bound to the Controller instance, providing access to system APIs via \`this\\.system\\.storage\`" \
      agent/agentspace/knowledge/generator/api-reference.md  # none
    rg -n "this: \\{ controller: Controller, state: any \\}" \
      agent/agentspace/knowledge/generator/api-reference.md  # none
    ```
  - 既有代码/导出/usage 收敛保持 k=6 结论不变。
  - `npm run check`：**EXIT 0**
  - 验收套件：**65 passed**（sequenceRange 12 + dispatchIdempotency 13 + entityRetention 15 + scopedSequence 22 + asyncTaskRetention 3）
  - 真实 PG：`postgresqlSequenceRange` **2 passed**
- **审计（k=6-audit）**：
  - 独立复跑：check EXIT 0；65 passed；postgresqlSequenceRange 2 passed；相关回归 92 passed。
  - 源码核对：`ComputationActionContext` 注入与导出正确；usage 主路径与 range 合同测已收敛。
  - **实现缺陷 D1（`knowledge-callback-this-doctrine`）**：`agent/agentspace/knowledge/generator/api-reference.md` Transform 主体合同仍写 `this` bound to Controller + 多处 `this: Controller` / `this.system.storage` 示例；Custom 合同 `this` 缺 `atomic`。临时探针证实 residual `this.system.storage` 在现网 Transform 回调中抛错。要求 8 / M-06「删除双 this 教义」未闭合。
  - 状态 → `开放`；reopen-count 1。
  - **k=7**：D1 教义正文已按上列清单修正。
- **审计（k=7-audit）**：
  - 独立复跑：check EXIT 0；65 passed；postgresqlSequenceRange 2 passed；postgresqlScopedSequence 2 passed；相关回归 92 passed。
  - D1 门闩：`api-reference` Transform 合同/callback 无 `this: Controller` / residual `this.system.storage`；Custom 合同含 `atomic`；其它 generator/usage 无第二处旧绑定；合法 Controller 回调保留。
  - 无实现缺陷；无 reopen 增量；状态 → `已完成`。全部里程碑最终核验通过；任务 `status: 已完成`。详见 `sequence-idempotency-retention-audit.md`。

## 5. 风险与验证安排

| 风险 | 阶段 | 处理 |
|------|------|------|
| range 与 next 公式不一致 | M-02 已共享内核 | 保持交错测 |
| setup 未建表导致纯 atomic 失败 | d5 / M-03 | 能力向总是建表 + 无 Property 测 |
| Transform `this` 迁移导致既有回调依赖 Controller | d5 / M-06 | 上下文同时提供 `controller`+`atomic`；框架内测全量改 |
| admit/open 迁移漏改 Activity 包装 | M-04 | I7 fail-fast；真实 Activity 测 |
| in_flight 行残留 | M-04 | 同事务回滚；无成功 finish 不占 succeeded |
| 回放仍触发 postCommit / complete | M-04 | mock 次数 |
| retention 删除与增量读 | M-05 | 提交后独立事务 + 文档 |
| 真实 PG 不可用 | M-03 | 不得完成 |
| 教义残留旧逃逸 | M-06 | 人工检查 usage/generator |

**设计期必须验证（已做）**：三缺口存在性（§1）。  
**d5 文档修订**：要求 8 写入任务；方案去掉正式双轨与软兼容壳。  
**可实现期验证**：上表其余项。

---

## 6. 基线

| 项 | 值 |
|----|-----|
| Git revision | `a7f6ec856eafee428f327b627ad7648058ef85b8` |
| 分支 | `main` |
| 工作树（任务启动 / M-01） | 当时：`?? docs/sequence-idempotency-retention/`、`?? prompt/...`；无已修改跟踪文件 |
| 工作树（d6 裁决时） | `M src/runtime/System.ts`、`M src/runtime/MonoSystem.ts`（M-02 range）；`?? tests/runtime/sequenceRange.spec.ts`；`?? docs/sequence-idempotency-retention/`；`?? prompt/remaining-framework-gaps-seq-idem-retention.md` |
| 最近提交 | `feat(runtime): hard-fail dispatch inside non-BT storage transactions` |
| 相关既有测试 | `scopedSequence` + `asyncTaskRetention`：25 passed；M-02 后另加 `sequenceRange`：11 passed（合计相关 36 passed @ d6） |
| 设计期缺口实验 | 三 FR 均证实缺口（§1）；临时 spec 已删除 |
| 真实 PG | 设计期未跑；M-03 强制 |
| 设计轮 d1 裁决 | 采纳评审 R1/R2/R3：闭合 attempt 步骤表；补全 Interaction/Activity/EventSource 读者；`EntityRetention` 可辨别联合统一 orderBy |
| d1 基线复验 | `scopedSequence` + `asyncTaskRetention`：25 passed；git `a7f6ec8` |
| 设计轮 d2 裁决 | 采纳 Custom/Transform `this` 分表（类1） |
| 设计轮 d3 裁决 | 采纳 Activity×idempotency 矛盾（类2/1）：§3.2.4 改为阶段定义+参考算法+Activity 真值表；`admission`/`openLedger` 分列；M-04 强制真实 Activity ★1/★4 |
| d3 基线复验 | `scopedSequence` + `asyncTaskRetention`：25 passed；git `a7f6ec8`；ActivityManager `wrappedGuard` 含 create/check 已对照源码 |
| 设计轮 d4 裁决 | 评审结论「通过」且「需要复审的问题」为空；独立核验未采纳任何六类阻塞项；status→实现中；N=5×M=30 |
| d4 基线复验 | `scopedSequence` + `asyncTaskRetention`：25 passed；git `a7f6ec8` |
| 设计轮 d5 修订 | 用户授权：任务要求 8 无历史兼容负担；方案改为唯一 admit/open 管道、`this.atomic`、setup 总是建表、幂等 in_flight 码、retention mode 标签；M-03/04/05/06 合同已更新；M-01/M-02 保持已完成 |
| 设计轮 d6 裁决 | 采纳评审 R1（类3/5）：建表改为单一 `needsScopedSequenceTable`；S1/S2/S3 完整读者清单；消除 apply 内联分叉；M-03 验收含无 Property 的 install **与** migration/apply；`_DispatchIdempotency_` I1–I3 同构；§1.1 标注 M-01 快照；基线工作树更新。status→设计中，待复审 |
| d6 基线复验 | `sequenceRange` + `scopedSequence` + `asyncTaskRetention`：**36 passed**；git `a7f6ec8`；源码仍见 declarations 建表门闩（待 M-03） |
| 设计轮 d7 裁决 | 采纳评审 R1（类1，衍生类2）：`needsScopedSequenceTable` 伪代码由 `atomicSequenceCapability === true` 改为 `!!db.atomicSequenceCapability`（与 `validateAtomicSequenceTarget` / 对象型 `AtomicSequenceCapability` 对齐）；规则表「假」仅对应无 capability / 无 setup 的 driver；M-03 源码抽查增补禁止 helper 对 capability 使用 `=== true`。不重开 M-01/M-02；不改变 S1–S3 / I1–I3。status→设计中，待复审 |
| d7 基线复验 | `sequenceRange` + `scopedSequence` + `asyncTaskRetention`：**36 passed**；git `a7f6ec8`；人工代入：PG/PGLite/SQLite capability 对象 ⇒ 谓词真；无字段 ⇒ 谓词假 |
| 设计轮 d8 裁决 | 评审 conclusion=通过、需要复审的问题=（无）。独立核验未采纳任何六类阻塞项：d7 谓词与对象型 `AtomicSequenceCapability` / `validateAtomicSequenceTarget` 真值性一致；S1–S3 仍绑 declarations（属 M-03 待实现）；admit/open、Activity 真值表、I1–I3、retention 联合、M-03…M-06 验收可执行。基线 36 passed。status→实现中；N 保持 5×6=30 |
| d8 基线复验 | `sequenceRange` + `scopedSequence` + `asyncTaskRetention`：**36 passed**；git `a7f6ec8`；源码：capability 为对象；`requiresScopedSequenceState`/`apply` 仍 declarations 门闩；`runDispatchAttemptBody` 仍 guard；Activity 合成 wrappedGuard 未转发 idempotency；Entity 无 retention |

---

## 7. 实现要点备忘

- `SequenceRange.end` 在 `step≠1` 时用算术网格断言。
- 幂等 key / namespace 长度上限 fail-fast。
- `_DispatchIdempotency_` 与 `_Activity_` / sequence 同级 internal schema；建表走 **I1–I3**，与 sequence **S1–S3** 同构，总是建、无声明门闩。
- 幂等 key **不得**依赖 open 之后才写入的 `activityId`（★1）；示例用 payload 侧键。
- 幂等「无行」claim：不能靠 `SELECT FOR UPDATE` 锁空位；用插入 `in_flight` / upsert，冲突后再读状态 → `IDEMPOTENCY_IN_FLIGHT` 或 `replayed`。
- Activity 包装始终产出 `admit`+`open`（含非幂等），避免再分叉；`buildActivityInteractionEventSource` 必须转发 `idempotency`。
- retention 分批删除；硬删除属性名与现网常量对齐；cap 的 `orderBy` 显式 DESC，禁止隐式 `createdAt`。
- M-03：先收 `needsScopedSequenceTable` 再改测试夹具；S3 与 S1/S2 同 PR 闭合。
- `needsScopedSequenceTable`：**禁止** `atomicSequenceCapability === true`；与 `validateAtomicSequenceTarget` 同用真值性（`!!capability` 或等价空值判断）+ `typeof setupScopedSequenceState === 'function'`。
- M-06 前：M-02 双路径测可留；合并后官方只留 `this.atomic`。
- CHANGELOG：若发版需要，M-06 按项目惯例追加。
