```text
status: 已完成
design-round: 3/15
implementation-round: 3/15
current-milestone: M-03
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无
```

# 提交后副作用的交付保证 — 设计

## 1. 背景和现状

任务输入：`prompt/post-commit-side-effect-delivery-guarantees.md`（问题陈述，非已定设计）。相邻已交付能力（事实，不是本方案）：`DispatchResponse.outcome`（FR-IDEM-01）、`runInBusinessTransaction` 及阶段 P 推迟、非业务事务内 dispatch 硬失败。本设计在实现前对 G1 / G2 / G3 用当前 HEAD 源码、既有测试与最小实验求证。

基线 Git revision：`aa7d1c73c8dbb596fc9db3755c478cb99e779cb9`（v4.8.0 文档提交；与问题陈述核对的 `aa7d1c7` 为同一提交）。工作树在求证时仅有本任务文档与探针，无其它生产改动。

**d1 裁决**：独立核验评审「问题 1」后**采纳**（类别 2 内部逻辑矛盾，其中 Relation 重建对 `['*']` 的断言同时构成类别 1 关键事实错误）。方案主线不变。修正是把阶段 P 的三个输入空间写成有限表，禁止互相替代；create 重建按记录种类写死 `attributeQuery`。证据见 §1.3 与 §3.2。未采纳其它「需要复审的问题」（评审只列了这一条）。评审「实现注意事项」不改变复审结论；其中会让下一轮再次写错契约的项已并入 §3 / §7。

**d2 裁决**：独立核验本轮评审两条「需要复审的问题」后均**采纳**。方案主线不变。
1. **问题 1（类别 1）**：create 重建分类与 d1 同一领域第二次出现，不得再补「含 filtered relation」这种种类名。改为 §3.2.1 的参考函数 `classifyCreateMutationRerun` 与编译 schema 标志覆盖表。分类只读 `map.data.records[name]`（`EntityToTableMap.getRecord`），禁止先访问 `getRecordInfo(name).isRelation`。`isFilteredRelation === true` 且 `isRelation` 不为真时走端点查询。`isMergedAbstract === true` **按编译形态加载当前行**（不是 fail-fast）：写路径会在抽象名与 input 过滤名下各发一条 create；`findOne` 在抽象名下可读到该行。
2. **问题 2（类别 2）**：`isPostCommitPhaseComplete` 仍只描述**本次返回值**那次阶段 P。官方组合只闭合 create mutation 副作用与 `postCommit`。update/delete 型失败是明确剩余缺口，§3.3 用义务可恢复表取代「直到成功」统称。证据见 §1.3、§3.2.1、§3.3。

评审「实现注意事项」不改变复审结论。其中会让下一轮写错契约的项（幂等 replay 的 `result.data` 是本次响应上的值，不必等于 live resolve）已并入 §3.2.2。

**d3 裁决**：独立核验本轮评审后**未采纳任何「需要复审的问题」**（评审结论为 `通过`，复审项为空）。方案主线不变。独立探针与源码核对确认：G1/G2/G3 缺口仍在；`classifyCreateMutationRerun` 覆盖表含 n:1；`['*']` 在基关系、filtered relation、n:1 上均无端点而端点查询可读 `source.id`/`target.id`；同名副作用后写覆盖会把最终 `sideEffects[name]` 变成成功；BT callback 返回前 P 未跑；`dispatchIdempotency.load` 无事务抛错；`queryHandle.map.data.records` 等于 `MonoStorage.map.records`（后者已是 `MapData`）。实现注意事项不改变复审结论；其中会让实现轮写错契约的项已并入 §3.1 / §3.2.1 / §3.5 / §7 与 M-01 验收。设计通过，进入实现。

### 1.1 阶段划分（当前主干，仍然正确）

`Controller.dispatch`（`src/runtime/Controller.ts`）把一次调用分成：

- **阶段 A（事实事务）**：`runDispatchAttemptBody` 在 `runInTransaction` 内执行 admit →（幂等 replay 则早退）→ open → map → 事件记录 create → resolve → afterDispatch → 参与者 `dispatchIdempotency.finish`。任一步失败则回滚，结果进入 `result.error`（顶层默认软错误；业务事务默认 abort 抛出）。
- **阶段 P（提交后义务）**：拥有者 COMMIT 成功之后，在事务外执行 `EventSource.postCommit` 与 `RecordMutationSideEffect`。失败写入 `result.sideEffects`，**不**设置 `result.error`，**不**回滚已提交事实。业务事务内推迟到 `runInBusinessTransaction` 拥有者 COMMIT 之后冲刷（`Controller.ts` 约 1241–1258、1360–1378 行）。

这一事务边界保持不变：外部 IO 不得进入事实事务。本任务补的是阶段 P 的**完成语义**，不是把 P 搬进 A。

### 1.2 G1 — 失败可见性不是一等语义：**缺口存在**

**源码表面**

```ts
export type DispatchResponse = {
    error?: unknown
    data?: unknown
    effects?: RecordMutationEvent[]
    sideEffects?: { [k: string]: SideEffectResult }
    context?: { [k: string]: unknown }
    outcome?: DispatchOutcome  // 仅幂等参与者的事实首次/回放
}
```

- `error` 只表示阶段 A 失败。`runPostCommitHook` / `runRecordChangeSideEffects` 捕获异常后写入 `sideEffects.__postCommit` 或 `sideEffects[name]`，从不赋值 `result.error`。
- `SideEffectResult` 是 `Controller.ts` 内未导出的内联类型。公开包 `interaqt` **不**再导出 `SideEffectError`（`src/runtime/index.ts` 未转出；探针中 `typeof SideEffectError === 'undefined'`）。
- 全 `src/` 无 `postCommitPhase`、`isPostCommitPhaseComplete`、`areSideEffectsComplete` 或等价一等字段 / helper。
- `sideEffects` map 以副作用 **name** 为键；同一 name 在一次 dispatch 的多条 mutation event 上后写覆盖先写（既有聚合限制）。完成判别若只扫最终 map，可能把「先失败后成功」看成成功。

**既有测试（须区分「有上报」与「有一等完成语义」）**

- `tests/runtime/recordMutationSideEffect.spec.ts`：用 `storage.create` + **手工 mock `effects`** 调 `runRecordChangeSideEffects`；含「一个失败不阻止另一个」。**未经 `dispatch`。**
- `tests/runtime/transactionRetry.spec.ts`：经 `dispatch` 的 `postCommit` 失败，断言 `result.error` 缺席且 `sideEffects.__postCommit.error` 存在，事实行仍在。
- `tests/runtime/transactionAcceptance.spec.ts`：经 `dispatch` 的 mutation 副作用失败，同样断言 `result.error` 缺席。

这些测试钉住的是「P 失败不回滚、错误在 map 里」，不是「调用方有官方完成判别」。

**最小实验**（设计期 `tests/runtime/_gap-verify-post-commit-se.spec.ts`，证据记录后删除）

经 `dispatch` 同时让 `postCommit` 与一条 `RecordMutationSideEffect` 抛错：

| 项 | 观测 |
|----|------|
| `result.error` | 缺席 |
| 事实行 | `G1Ticket` 仍为 1 行 |
| `sideEffects` | `__postCommit` 与 `g1Mirror` 均有 `SideEffectError` |
| 响应键 | `context, data, effects, outcome, sideEffects`（无 `error` 键，无 `postCommitPhase`） |
| Controller 上完成/重跑方法 | 全部 `typeof === undefined` |
| `import('interaqt').SideEffectError` | `undefined` |

**结论（G1）**：不是「完全没有失败上报」，而是 **有 `sideEffects` map、无一等完成语义**。只读 `result.error` 无法发现阶段 P 失败。官方教义（`usage/05-interactions.md`、`generator/api-reference.md`、`usage/07`/`14`、`README.md`）成功检查示例仍以 `if (result.error)` 为主。缺口存在，FR-SE-01 纳入实现。

### 1.3 G2 — 已提交事实的义务不可重执行；去重/重放假成功：**缺口存在**

**源码表面**

- 幂等回放：`result.outcome === 'replayed'` 时 `dispatch` **直接返回**，注释为 “P (postCommit + mutation side effects): never on idempotent replay”（约 1361–1364 行）。回放响应 `effects: []`、`sideEffects: {}`。合同测试 `dispatchIdempotency.spec.ts` 钉死 postCommit 首次 1、回放 0；业务事务回放不把 P 推入推迟队列。
- 公开重跑入口：仅 `runPostCommitHook(eventSource, args, result)` 与 `runRecordChangeSideEffects(result)`。后者**要求调用方持有含 `effects` 的 `DispatchResponse`**。无「按已提交记录 id 重建 create 事件并重跑」的 API。
- 应用层 admit 去重：重复键在阶段 A 抛错 → `result.error`，P 不执行。框架不解释该错误，也不提供「重复但义务未完成」的判别。

**最小实验**

Admit 去重（`admit` 发现已有 `bizKey` 则抛 `DuplicateOrder`）与框架幂等（`idempotency.key`）两条路径，首次 P 均失败：

| 路径 | 第一次 | 第二次 | 副作用计数 |
|------|--------|--------|------------|
| admit 去重 | `error` 缺席；P 失败写入 `sideEffects` | `error = DuplicateOrder:...`；`effects: []`；`sideEffects: {}` | `g2Mirror` 1→1；`postCommit` 1→1 |
| 幂等 replay | `outcome: 'applied'`；P 失败 | `outcome: 'replayed'`；`error` 缺席；`effects: []` | 计数不再增加 |

API：`rerunCreateMutationSideEffects` / `rerunPostCommit` 为 `undefined`；`runRecordChangeSideEffects` 为 `function`。

Create 事件重建对照（**仅值属性的实体**）：首次 mutation event 的 `record` 键为 `bizKey, id`，`storage.findOne(..., ['*'])` 键相同。这是实体记录上 FR-SE-02 的可行子集，**不是**已有官方原语，也**不能**外推到 Relation。

d1 裁决实验（`tests/runtime/_adjudicate-verify-post-commit-se.spec.ts`，3 passed 后删除）：

| 对照 | 观测 |
|------|------|
| `resolve` 返回 `{ wrapper: true, recordId }` | `postCommit` 所见 `data` 等于该包装对象；`findOne(..., ['*'])` 含 `bizKey` / `title`，不含 `wrapper`；二者 `not.toEqual` |
| Relation create 经 `dispatch` | mutation event 与副作用回调上 `record.source.id` / `record.target.id` 有值 |
| 同一 id 的 `findOne(relationName, ..., ['*'])` | `source` / `target` 为 `undefined`（`AttributeQuery` 把 `*` 展开为 `valueAttributes`，排除 `isRecord` 端点，`AttributeQuery.ts` 约 231–233 行） |
| 显式 `['*', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]` | 读回端点 id |
| 非幂等成功响应键 | `context, data, effects, outcome, sideEffects`（`outcome` 键存在且值为 `undefined`） |
| 阶段 A 错误响应键（I-6） | `context, data, effects, error, sideEffects`（无 `outcome` 键） |
| 包导出 | `'SideEffectError' in import('interaqt')` 为 false；无 `postCommitPhase` |

d2 裁决实验（`tests/runtime/_adjudicate-d2-verify-post-commit-se.spec.ts`，2 passed 后删除）。编译 schema 标志（`map.data.records[name]`，值为 `undefined` 的键未列出）：

| 记录名 | `isRelation` | `isFilteredEntity` | `isFilteredRelation` | `isMergedAbstract` | `hasMergedDiscriminator` |
|--------|--------------|--------------------|----------------------|--------------------|--------------------------|
| 实体 `Adj2Src` | — | — | — | — | — |
| filtered entity `Adj2ActiveSrc` | — | `true` | — | — | — |
| 基关系 `Adj2BaseRel` | `true` | — | — | — | — |
| filtered relation `Adj2ActiveRel` | — | — | `true` | — | — |
| merged input 实体 `Adj2Dog`（编译后） | — | `true` | — | — | — |
| merged 抽象实体 `Adj2Pet` | — | — | — | `true` | `true` |
| merged input 关系 `Adj2Like`（编译后） | — | — | `true` | — | — |
| merged 抽象关系 `Adj2Interact` | `true` | — | — | `true` | `true` |
| `_Dictionary_` / `_System_` | — | — | — | — | — |

其它观测：

| 对照 | 观测 |
|------|------|
| `getRecord('Adj2DoesNotExist')` | `undefined` |
| `getRecordInfo('Adj2DoesNotExist').isRelation` | `TypeError: Cannot read properties of undefined` |
| `Adj2BaseRel` / `Adj2ActiveRel` 的 `findOne(..., ['*'])` | 无 `source` / `target` |
| 二者的端点 `attributeQuery` | 可读 `source.id` / `target.id` |
| filtered relation 的 create mutation event | 带 `record.source.id` / `record.target.id` |
| `storage.create('Adj2Pet', …)` | 抛「merged (union) type」 |
| `storage.create('Adj2Dog')` 的 mutation 事件名 | `Adj2Pet` create **和** `Adj2Dog` create |
| `storage.create('Adj2Like')` 的 mutation 事件名 | `Adj2Interact` create **和** `Adj2Like` create |
| `findOne('Adj2Pet', …, ['*'])` / `findOne('Adj2Interact', …, 端点查询)` | 按 input 创建的 id **能读到行** |
| 同一次 `resolve` 内 create 再 update；副作用在 update 时抛错 | `result.error` 缺席；`sideEffects.adj2Up.error` 存在；计数 `{ create: 1, update: 1, postCommit: 1 }`；事实行已是更新后的值 |
| 带 `idempotency` 的第二次 `dispatch` | `outcome === 'replayed'`；`effects: []`；计数不再增加 |

d3 裁决实验（`tests/runtime/_adjudicate-d3-verify-post-commit-se.spec.ts`，1 passed 后删除）。与 d2 标志表一致，并补上 n:1：

| 对照 | 观测 |
|------|------|
| n:1 `D4aN1Rel` | `isRelation === true` → `classifyCreateMutationRerun` 为 `relation` |
| `D4aBaseRel` / `D4aActiveRel` / `D4aN1Rel` 的 `findOne(..., ['*'])` | 均无 `source` / `target` |
| 三者的端点 `attributeQuery` | 均可读 `source.id` / `target.id` |
| 同名副作用：create 抛错后同记录 update 成功 | 两次回调都执行；最终 `sideEffects[name]` 只有 `{ result: 'ok' }`、无 `error` |
| `queryHandle.map.data.records` | 等于 `MonoStorage.map.records`；`MonoStorage.map.data` 为 `undefined` |
| 事务外 `dispatchIdempotency.load` | 抛 `dispatchIdempotency.load requires an active transaction` |
| 业务事务 callback 内 | `sideEffects.__postCommit` 缺席；`runInBusinessTransaction` resolve 之后 postCommit 已跑 |
| 包导出 / 完成 API | `'SideEffectError' in import('interaqt')` 为 false；无 `postCommitPhase`；Controller 上无完成/重跑方法 |

**结论（G2）**：上游 at-least-once 重投无论走 admit 抛错还是 `replayed`，都不会重跑 P；也没有不依赖首次 `effects` 的重跑入口。调用方若把 `DuplicateOrder` 或 `replayed` 当成「已成功」，义务永久丢失。缺口存在，FR-SE-02 / FR-SE-03 纳入实现。三个输入空间不可互换，见 §3.2。create 重建分类必须按上面的标志表求值，见 §3.2.1。update 型失败不能靠 create 重跑闭合，见 §3.3。 n:1 / 合表关系与基关系走同一 `isRelation` 分支，重建必须用端点查询。

### 1.4 G3 — 义务完成与事实回执合并；崩溃窗口无痕迹：**缺口存在；本次不交付查询账本**

**源码表面**

- `dispatchIdempotency.finish` 在事实事务内、COMMIT 之前调用（约 1584–1594 行），早于阶段 P。
- `_DispatchIdempotency_` 列：`namespace, idempotencyKey, state, data, context, createdAt`。无义务完成列。`storage.dispatchIdempotency` 仅 `load` / `claim` / `finish`。
- 无 `_PostCommitReceipt_` / obligation 表或 `postCommitReceipt` API。

**最小实验**

幂等参与者首次 dispatch 的 `postCommit` 抛错后：账本行为 `state: 'succeeded'` 且 `has_data: true`；`information_schema` 中无 SideEffect / Obligation / PostCommit 类表；`storage.postCommitReceipt` / `obligationReceipt` 为 `undefined`。

**结论（G3）**：缺口存在。要求 5 允许设计裁决不纳入 FR-SE-04。本次**不**做义务完成回执表（见 §3.4）。P0 闭环不依赖该账本：副作用幂等是框架合同，未完成时**总是可以安全重跑**。剩余缺口必须在设计中写明，不得假装已闭合。

### 1.5 对照：业务事务推迟与默认 replay 跳过 P（仍然成立）

最小实验顺序：`before-dispatch` → `resolve` → `after-dispatch-return` →（BT 返回前无 P）→ `postCommit` → `mutationSe`。同一键的第二次 BT dispatch 为 `replayed`，不增加 P 计数。

既有回归（求证时全部通过）：`dispatchIdempotency.spec.ts`、`businessTransaction.spec.ts`、`transactionRetry.spec.ts`、`transactionAcceptance.spec.ts`、`recordMutationSideEffect.spec.ts` 共 70 tests passed。

### 1.6 明确不在范围（已交付或另立）

FR-IDEM-01 的 `outcome` 与 `_DispatchIdempotency_`、`runInBusinessTransaction`、非 BT 内 dispatch 硬失败、`NestedDispatchError`、Condition 准入锁 —— 不重新设计，不把 `replayed` 改义为义务已完成。

---

## 2. 目标与非目标

对应 Task 要求编号。

| 要求 | 目标 | 非目标 |
|------|------|--------|
| **1** 求证 | G1/G2 存在并纳入交付；G3 存在但 FR-SE-04 不纳入，剩余缺口写明 | 不得仅复述问题陈述；不得把「map 里有 error」当成 G1 已闭合 |
| **2 FR-SE-01** | 单次 `dispatch` 结果上可用官方字段/谓词判别阶段 P 是否全部成功，并能取失败明细（含 `postCommit`） | 不把 P 失败写入 `result.error`；默认不因 P 失败 throw；不把扫 `sideEffects` 留作官方完整成功检查 |
| **3 FR-SE-02** | 不依赖首次 `effects`，对已提交 **create** 记录重跑该 record 名上全部 mutation 副作用；分类按 §3.2.1 参考函数；另提供 `postCommit` 重跑入口，`prior` 必须为 resolve/`afterDispatch` 同源；失败同形状、不改事实 | 不支持无历史的 update/delete 静默重跑；不对关系形态用裸 `['*']` 静默重跑；不把存储行当作 `postCommit` 的 `data`；不把 `getRecordInfo(name).isRelation` 当成 filtered relation 谓词；不把现有 `runRecordChangeSideEffects(DispatchResponse)` 单独当完成本条 |
| **4 FR-SE-03** | admit 去重与幂等 replay 两条路径都有官方收敛答案，且两个挂钩分别取输入；默认 replay 仍跳过 P（既有合同）；义务敏感方用完成判别 + **可恢复挂钩**的重跑。官方组合不声称能恢复 update/delete 型失败 | 不把 `replayed` 改成义务完成；不新增第二套事实成功枚举；不把重复错误教成成功；不把加载行教成 postCommit `data`；不把 create 重跑 `complete` 教成「首次阶段 P 已全部收敛」 |
| **5 FR-SE-04** | **不纳入本次**。剩余缺口与应用侧恢复路径见 §3.4 | 不假装崩溃窗口可查询；不内置重试/退避/outbox/死信调度 |
| **6** 阶段与非目标 | 保持两阶段事务模型；P 仍非事务；概念面最小；与 `outcome` 一致叙述 | 不把 P 纳入事实事务；不做补偿事务框架；不重做已交付幂等/BT/路径唯一 |
| **7** 与现有能力 | 在 `dispatch` / BT 推迟冲刷 / `runPostCommitHook` / `runRecordChangeSideEffects` 汇合点扩展；枚举读者 | 不平行第二套 dispatch；不漏 BT 路径 |
| **8** 验证 | FR-SE-01/02/03 分里程碑但各 ID 须完整；经 `dispatch` 的失败合同；回归既有套件 | 不得只用 mock `runRecordChangeSideEffects` 充当 FR-SE-01 完成证明 |
| **9** 范围 | 框架公开 API、runtime 行为、文档、测试 | 不改造本仓库外的业务应用 |

---

## 3. 方案（单一方案）

不照抄问题陈述方向 A/B/C。选定方案是：

> **一等阶段 P 完成对象 + create 记录级 mutation 副作用重跑 + `postCommit` 重跑 + 去重/回放上的文档化组合合同。默认幂等回放仍跳过 P。本次不做义务回执表。**

**为何不是「dispatch 选项在 replay 上自动跑完 P」（方向 B 的形态）**：幂等回放的 `effects` 为空，框架没有已提交 mutation 列表，无法从 replay 响应重建全部 `RecordMutationSideEffect` 输入，除非把 effects / 创建引用写入账本（那是 FR-SE-04 或扩大幂等表，本次不做）。提供一个假装「replay 仍完成全部义务」的 `dispatch` 选项会成为假 API。

**为何「总是重跑」能闭合 P0 而不需要完成回执**：FR-SE-02 规定副作用必须幂等。因此对 **create mutation 副作用与 `postCommit`**，「重复且义务状态未知」的官方动作是重跑，而不是先查询再决定。这使 at-least-once 上游可以把「dispatch + 若可恢复挂钩未 complete 则按挂钩重跑」写成稳定模式。update/delete 型失败不在该模式内，见 §3.3。

### 3.1 FR-SE-01 — 阶段 P 完成状态一等化

#### 决策

在 `DispatchResponse` 上增加一等对象 `postCommitPhase`，并导出谓词 `isPostCommitPhaseComplete`。不引入严格模式（P 失败 throw）。不把 P 失败折叠进 `error`。

```ts
export type PostCommitPhaseStatus = 'complete' | 'failed' | 'notRun'

export type PostCommitPhaseFailure = {
  name: string  // 副作用 name，或 postCommit 钩子的固定键 '__postCommit'
  error: unknown
}

export type PostCommitPhase = {
  status: PostCommitPhaseStatus
  failures: PostCommitPhaseFailure[]
}

export type DispatchResponse = {
  error?: unknown
  data?: unknown
  effects?: RecordMutationEvent[]
  sideEffects?: { [k: string]: SideEffectResult }
  context?: { [k: string]: unknown }
  outcome?: DispatchOutcome
  /**
   * 阶段 P（EventSource.postCommit + RecordMutationSideEffect）的完成状态。
   * 与 outcome 正交：outcome 只描述事实首次/回放；本字段只描述义务是否跑完、是否成功。
   */
  postCommitPhase?: PostCommitPhase
}

export function isPostCommitPhaseComplete(
  result: { postCommitPhase?: PostCommitPhase }
): boolean {
  return result.postCommitPhase?.status === 'complete'
}
```

`SideEffectResult` 改为导出类型。`SideEffectError` 从 `src/runtime/index.ts` 公开导出（与 `IdempotencyError` 同级），供义务敏感调用方收窄失败明细。

#### 状态表（有限、完整）

| 路径 | `result.error` | `outcome` | 阶段 P 是否执行 | `postCommitPhase.status` | `failures` |
|------|----------------|-----------|-----------------|--------------------------|------------|
| 阶段 A 失败（顶层软错误） | 有 | 缺席 | 否 | `notRun` | `[]` |
| 业务事务 `onDispatchError: 'abort'` | 抛出，无返回 | — | 否（外层 ROLLBACK，丢弃 defer） | — | — |
| 非幂等成功，P 全部成功（含无钩子的空跑） | 无 | 缺席 | 是 | `complete` | `[]` |
| 幂等 `applied`，P 全部成功 | 无 | `applied` | 是 | `complete` | `[]` |
| 成功提交后 P 任一失败 | 无 | `applied` 或缺席 | 是 | `failed` | 每个失败一项（见下） |
| 幂等 `replayed`（默认） | 无 | `replayed` | 否 | `notRun` | `[]` |
| 业务事务内、拥有者 COMMIT 前（callback 内） | 无 | `applied` 或缺席 | 尚未 | `notRun` | `[]` |
| 业务事务 COMMIT 后冲刷完毕 | 同 dispatch 结果对象（就地更新） | 不变 | 是 | `complete` 或 `failed` | 按执行结果 |

义务敏感调用方的官方完整成功检查：

```ts
if (result.error) {
  // 阶段 A 失败。事实未提交（顶层软错误 / BT continue）或 BT abort 已抛出。
} else if (!isPostCommitPhaseComplete(result)) {
  // 事实已提交，或为 replay / 业务事务推迟中：本次阶段 P 未完成或未跑。
  // replay / 顶层 dispatch 返回之后：对可恢复挂钩使用 §3.2 / §3.3。
  // 业务事务 callback 内的 notRun 表示等待拥有者 COMMIT 后冲刷，此时不得调用 rerun*。
  // 不要把 replayed 当义务成功；
  // 不要把 create 重跑 complete 当成首次含 update/delete 失败的 P 已全部收敛。
}
```

只关心事实的调用方继续只检查 `result.error`：P 失败时 `error` 仍缺席（与今日一致）。

#### 失败明细如何收集（汇合点，避免扫 map）

`postCommitPhase.failures` 在阶段 P **执行循环中追加**，不从最终 `sideEffects` map 反推。原因：map 以 name 为键，同一副作用对多条 event 后写覆盖先写。官方明细必须保留每一次失败。`sideEffects` map 保持现有 last-write-wins 形状，以免无谓破坏读 `sideEffects[name].result` 的调用方；官方完成与明细以 `postCommitPhase` 为准。

`__postCommit` 失败必须出现在 `failures` 中（name `'__postCommit'`），与今日 map 键一致。

空跑（无 `postCommit`、无匹配副作用）：执行了阶段 P 入口但无失败 → `complete`。这与 replay 的 `notRun` 可区分。

`isPostCommitPhaseComplete(result)` **只**回答：该 `result` 对象所代表的那一次阶段 P 执行是否跑完且无失败。它不是「历史上所有义务都已可恢复地收敛」。create 重跑返回 `complete` 不改变首次 `dispatch` 结果上的 `failed`。update/delete 型失败会使首次结果为 `failed`，且 §3.2 没有对应重跑原语，见 §3.3 可恢复表。

#### 汇合点

新增内部 `runPostCommitPhase(eventSource, args, result)`：

1. `runPostCommitHook`
2. `runRecordChangeSideEffects`
3. `finalizePostCommitPhase(result)`（按循环中收集的失败设置 `status` / `failures`）

读者：

- 顶层 `dispatch` 成功且非 `replayed`：调用该汇合点（其后可选 `maintainEntityRetention`，时序不变：P 尝试之后，无论 P 成败）。
- `runInBusinessTransaction` 冲刷：推迟队列改为**一项** `postCommitPhase`（或等价地：两项仍按 postCommit → mutationEffects 顺序执行，但必须在同一 `result` 上只 finalize 一次）。禁止只改顶层 `dispatch` 而漏 BT。
- `replayed`：不调用汇合点；写入 `postCommitPhase: { status: 'notRun', failures: [] }` 后返回。
- 阶段 A 软错误构造 `DispatchResponse` 时写入 `notRun`（错误路径也带 `postCommitPhase` 键；见 §3.5 对 I-6 的说明：成功与错误两条路径的键集合本来就不同，只是各自加上该字段）。

`runPostCommitHook` 与 `runRecordChangeSideEffects` 保持公开，供低层/既有测试；**不是** FR-SE-01 的官方完成判别，也不是 FR-SE-02 的完成证明。

`ActivityManager` 已转发 `postCommit`；新字段在 `DispatchResponse` 上，包装后的 dispatch 自动带上。无需新的 Activity 声明字段。

#### 负向对照（必须能判别错误实现）

- P 失败却把 `error` 设上 → 非法（伪装成阶段 A 失败）。
- P 失败却 `postCommitPhase.status === 'complete'` → 非法。
- 仅扫最终 `sideEffects` map 而漏掉被覆盖的失败 → 非法（failures 在循环中收集）。
- `replayed` 却 `status === 'complete'` → 非法（把跳过当成义务成功）。

### 3.2 FR-SE-02 — 已提交事实的义务可重执行

阶段 P 有**三个**不可互换的数据形状。两个重跑原语分别消费其中两个；第三个（当前存储行）只用于 mutation 重建，**不得**充当 `postCommit` 的 `data`。

#### 3.2.0 三个输入空间（有限、完整）

| 空间 | 形状 | 生产者 | 合法消费者 | 禁止 |
|------|------|--------|------------|------|
| **S1 mutation event** | `{ type: 'create', recordName, record }` | 写路径事件 payload（defaults + 载荷；Relation 另带 `source` / `target` 端点） | `RecordMutationSideEffect.content`；`rerunCreateMutationSideEffects` 按 §3.2.1 从存储**重建**后交给同一 runner | 用缺端点的 Relation 行、或缺 `oldRecord` 的 update 形状静默重跑 |
| **S2 当前存储行** | `findOne` 的返回值，其键由 `attributeQuery` 决定 | storage | 仅作为 S1 重建的原料 | 当作 `DispatchResponse.data`；对 `kind: 'relation'` 使用裸 `['*']`（不含端点） |
| **S3 resolve 结果** | `DispatchResponse.data` / `context` | `resolve` / `afterDispatch`；幂等 replay 则是**本次响应上的这对值**（默认来自账本经 JSON 子集化的归档，或 `replayData`） | `postCommit(args, { data, context })`；`rerunPostCommit` 的 `prior` | 用 S2 加载行顶替，除非该 EventSource 的 `resolve` **本来就返回该行** |

`postCommit` 调用约定（`Controller.ts` 约 1616–1618 行）：`eventSource.postCommit.call(this, args, { data: result.data, context: result.context })`。

#### 3.2.1 `rerunCreateMutationSideEffects`（必须交付）

```ts
export type RerunCreateMutationSideEffectsInput = {
  recordName: string
  id: string
}

export type PostCommitRerunResult = {
  effects: RecordMutationEvent[]
  sideEffects: { [k: string]: SideEffectResult }
  postCommitPhase: PostCommitPhase
}

async rerunCreateMutationSideEffects(
  input: RerunCreateMutationSideEffectsInput
): Promise<PostCommitRerunResult>
```

`isPostCommitPhaseComplete` 必须能用于该返回值（参数类型为 `{ postCommitPhase?: PostCommitPhase }`，不是仅 `DispatchResponse`）。

语义：

1. **进程局部性**：使用当前 Controller 的 `recordNameToSideEffects`。跨进程装配差异是应用责任，文档写明。
2. **调用方错误**：缺少 `id` / `recordName` → fail-fast（不是副作用失败）。
3. **记录名分类（参考函数，有限、完整）**：只读编译后的 `EntityToTableMap`。运行时路径是 `(system.storage as MonoStorage).queryHandle.map`（`getRecord` / `.data.records`）。`Storage` 公开类型不声明 `queryHandle`。`MonoStorage.map` 已是 `MapData`，**不要**再取 `.data`。禁止手走 `Controller.entities`。**必须先** `const rec = map.data.records[recordName]`（即 `getRecord`）。`getRecordInfo(name)` 在名字缺席时仍构造对象，访问 `.isRelation` 会变成 `TypeError`，不得当作 `UNKNOWN_RECORD_NAME`。

```ts
const RELATION_CREATE_ATTRIBUTE_QUERY = [
  '*',
  ['source', { attributeQuery: ['id'] }],
  ['target', { attributeQuery: ['id'] }],
] as const

type CreateRerunClass =
  | { kind: 'unknown' }
  | { kind: 'relation'; attributeQuery: typeof RELATION_CREATE_ATTRIBUTE_QUERY }
  | { kind: 'entity'; attributeQuery: ['*'] }

function classifyCreateMutationRerun(
  records: Record<string, { isRelation?: boolean; isFilteredRelation?: boolean; isMergedAbstract?: boolean }>,
  recordName: string,
): CreateRerunClass {
  const rec = records[recordName]
  if (rec === undefined) return { kind: 'unknown' }
  // isMergedAbstract 不改变查询：写路径会在抽象名下发 create（与 input 过滤名各一条）。
  // 按编译形态加载当前行；不得 fail-fast，也不得把抽象名映射成 UNKNOWN_RECORD_NAME。
  if (rec.isRelation === true || rec.isFilteredRelation === true) {
    return { kind: 'relation', attributeQuery: RELATION_CREATE_ATTRIBUTE_QUERY }
  }
  return { kind: 'entity', attributeQuery: ['*'] }
}
```

求值顺序固定为：缺席 → 关系形态（`isRelation === true` **或** `isFilteredRelation === true`）→ 其余。`isMergedAbstract`、`isFilteredEntity`、`hasMergedDiscriminator` 不是独立分支；覆盖表如下（d2/d3 探针实测，`—` 表示该键为 `undefined`）。

| `recordName` 形态 | 标志组合 | `classifyCreateMutationRerun` | `attributeQuery` |
|-------------------|----------|-------------------------------|------------------|
| 缺席 | `records[name] === undefined` | `{ kind: 'unknown' }` → 抛 `PostCommitRerunError` `UNKNOWN_RECORD_NAME` | 不查询 |
| 普通实体、事件实体、`_Dictionary_`、`_System_` | 四标志皆 — | `entity` | `['*']` |
| filtered entity（含 merged input 实体编译结果） | `isFilteredEntity === true` | `entity` | `['*']` |
| merged 抽象实体 | `isMergedAbstract === true`，`isRelation` 不为真 | `entity`（显式按该名加载，不是 fail-fast） | `['*']` |
| 基关系（含 n:n、n:1 / 默认 x:1 合关系表、合表 combined） | `isRelation === true` | `relation` | 端点查询 |
| filtered relation（含 merged input 关系编译结果） | `isFilteredRelation === true`，`isRelation` 不为真 | `relation` | 端点查询 |
| merged 抽象关系 | `isRelation === true` 且 `isMergedAbstract === true` | `relation`（抽象不抢先 fail-fast） | 端点查询 |

`hasMergedDiscriminator` 与 `writablePropertyNames` 不参与分类。若将来 `isRelation` 与 `isFilteredRelation` 同为真，端点查询仍然正确。已声明但未注册任何副作用的名字走步骤 6 的空跑 `complete`，与 dispatch 空跑一致，**不是** `UNKNOWN_RECORD_NAME`。

4. **加载 / 重建查询**：按参考函数返回的 `attributeQuery` 调用 `findOne(recordName, id 匹配, …)`。

| `kind` | 重建后的 `record` 合同 |
|--------|------------------------|
| `entity` | 当前行的**值属性**快照（含 `id`）。不是创建载荷嵌套图。 |
| `relation` | 当前行值属性 **加上** `source.id` 与 `target.id`。端点形状与孤立 `addLink` create 事件的 `{ id }` 同构；**不**承诺嵌套端点图或创建时刻 payload 逐字段相等。 |

行不存在（schema 认识该名但 `findOne` 无行）→ 抛 `PostCommitRerunError`（`code: 'RECORD_NOT_FOUND'`）。对 `kind: 'relation'` 使用裸 `['*']` 后继续跑是非法实现（端点被 `AttributeQuery` 丢掉）。

5. **重建 event**：唯一合法值为 `{ type: 'create', recordName, record: loaded }`。这是 **当前存储快照**，不是创建时刻历史。不得发明 `oldRecord` / `keys`。
6. **全量重跑**：对该 `recordName` 注册的**全部** `RecordMutationSideEffect` 各执行一次（与今日 runner 相同；回调自己过滤 `event.type`）。无注册副作用 → 空跑 `complete`。部分成功后再跑：已成功项由副作用自身幂等吸收。
7. **失败同形状**：捕获为 `SideEffectError` 写入返回值的 `sideEffects` 与 `postCommitPhase`；**不 throw**；**不改事实**。
8. **不跑 `postCommit`**：该原语是记录级的；`postCommit` 是 EventSource 级的。

本 API 每次只重跑**一条** create 记录。一次 dispatch 可能产生多条 create（业务行、`_Interaction_` 事件行、关系行、filtered 视图行）。官方组合必须对每一个需要收敛的 create id 各调用一次，不得暗示「查一行就覆盖该次 dispatch 的全部 mutation 义务」。

**update / delete**：本 API 不接受 mutation type 参数，因此没有「残缺 update event 静默重跑」路径。若未来有人把内部 runner 暴露成通用 replay，必须对非 create **抛** `PostCommitRerunError`（`UNSUPPORTED_MUTATION_TYPE`），不得缺 `oldRecord` 继续跑。文档明确：无存储历史，update/delete 重跑不在本次范围。

**与 `runRecordChangeSideEffects(DispatchResponse)`**：后者仍要求首次 `effects`，不得单独充当本条完成证明。实现上重跑应构造 `{ effects: [reconstructed], sideEffects: {} }` 再走**同一** runner，然后 `finalizePostCommitPhase`。禁止复制一份副作用循环。

#### 3.2.2 `rerunPostCommit`（阶段 P 的另一半）

```ts
async rerunPostCommit<TArgs, TResult>(
  eventSource: EventSourceInstance<TArgs, TResult>,
  args: TArgs,
  prior: Pick<DispatchResponse, 'data' | 'context'>
): Promise<PostCommitRerunResult>
```

内部走现有 `runPostCommitHook`（汇合点），再 finalize。无 `postCommit` 钩子 → 空跑 `complete`。失败写入 `__postCommit`，不 throw，不改事实。

`prior.data` / `prior.context` 必须与首次成功 attempt 的 S3 同源。下表穷尽本任务关心的三条路径；空缺时的官方动作不得用 S2 顶替。

| 路径 | `prior.data` / `prior.context` 来源 | 空缺时的官方动作 |
|------|--------------------------------------|------------------|
| 首次 `dispatch` 成功返回后立刻重跑 | 本次 `DispatchResponse` 上的 `data` / `context` | 不空缺 |
| 幂等 `replayed` | 本次响应上的 `data` / `context`（`dispatch` 回放路径已经填好的值）。默认是账本经 `jsonSafeSubset` 之后的归档；若声明了 `idempotency.replayData`，则是该函数的返回值。官方动作是把**本次响应上的这对值**交给 `rerunPostCommit`，不要再 `dispatchIdempotency.load` 一层（`load` 还要求活跃事务），也不要把这对值叙述成「live resolve 返回值」 | 不空缺（replay 成功响应必带这对字段） |
| admit 重复（阶段 A `result.error`） | 框架**没有**该归档。合法来源只有：（A）调用方自行持有的首次成功 `data`/`context`（内存中的首次 `DispatchResponse`，或应用自己记下的副本）；（B）该 `postCommit` 被声明为仅由 `args` 加钩子内部的存储读取即可重入，此时允许 `prior` 为 `{ data: undefined, context: undefined }` | 不得把 `findOne` 行传入 `prior.data`，除非该 EventSource 的 `resolve` 本来就返回该行。若既无保留的 S3、钩子又不是 args 可重入，则**不能忠实重跑 postCommit**；mutation 副作用仍按 §3.2.1 从 id 重跑。这是关闭 FR-SE-04 后 admit 路径上 postCommit 的剩余限制，须写进教义，不得用加载行掩盖。 |

#### 3.2.3 副作用幂等是框架合同

文档必须写明：`RecordMutationSideEffect.content` 与 `postCommit` 必须可安全执行多次（至少-一次投递、部分成功后全量重跑、crash 后重投）。框架不给回调自动去重，也不内置调度器。合同测试用「带唯一业务键的镜像行 / 二次执行不再插入」证明吸收，而不是框架记账跳过。

### 3.3 FR-SE-03 — 去重 / 重放路径的义务收敛

#### 与 `outcome` 的单一真相

| 字段 | 含义 | 禁止 |
|------|------|------|
| `outcome: 'applied' \| 'replayed'` | 事实是否首次生效（仅幂等参与者） | 把 `replayed` 读成「义务已完成」 |
| `postCommitPhase.status` | 本次返回值所代表的那次阶段 P 是否跑完且成功 | 新增第三种事实成功枚举 |
| `result.error` | 仅阶段 A | 把 P 失败写入 error |

默认 `dispatch`：**replay 仍跳过 P**。`dispatchIdempotency` 回归（首次 1 / 回放 0）必须保持绿色。这不是「文档化跳过且无替代」，替代是下面的官方组合。

#### 官方组合（上游 at-least-once → 可恢复义务 at-least-once）

调用方表达「重投仍要求可恢复义务完成」的方式：在 `dispatch` 返回之后（业务事务则在 `runInBusinessTransaction` resolve 之后），按 §3.3 可恢复表对 **create mutation 副作用** 与 **`postCommit`** 分别调用 §3.2 原语，直到这些挂钩各自返回 `complete`（或进入应用自己的死信策略）。框架不调度重试。不要用 `!isPostCommitPhaseComplete(首次 result)` 作为「再跑直到首次结果变成 complete」的循环条件：首次对象不会因为后来的重跑而变成 `complete`。

官方组合闭合的是 **create mutation 副作用** 与 **`postCommit`**，不是首次 `failed` 的全部原因。`isPostCommitPhaseComplete` 不要改成「可重跑部分已成功」。create / postCommit 重跑返回 `complete` 时，若首次阶段 P 曾因 update/delete 副作用失败，那些义务仍然没有原语可恢复。

#### 义务可恢复表（有限、完整）

挂钩按失败种类穷尽。`postCommitPhase` 列是首次（或那次已执行的）阶段 P 结果。

| 阶段 P 失败种类 | 首次 `postCommitPhase` | 官方组合能否闭合 | 官方动作 |
|-----------------|------------------------|------------------|----------|
| 无失败（空跑或全部成功） | `complete` | 无需再跑；若仍重跑则幂等吸收 | 可选重跑 |
| `postCommit` 失败 | `failed` | 条件闭合（S3 规则见 §3.2.2） | `rerunPostCommit` |
| create 型 mutation 副作用失败 | `failed` | 能 | 按每个 `(recordName, id)` 调用 `rerunCreateMutationSideEffects` |
| update 型 mutation 副作用失败 | `failed` | **不能** | 不提供静默重跑；教义不得写成直到成功 |
| delete 型 mutation 副作用失败 | `failed` | **不能** | 同上（无 `oldRecord`，行可能已不存在） |
| 混合失败 | `failed` | 仅 create + `postCommit` 部分可闭合 | 可闭合部分按上表；不可闭合部分保持剩余缺口 |
| `replayed` / 推迟中 | `notRun` | 不表示成功 | 仍只对可闭合挂钩重跑；update/delete 若曾在首次 P 失败，仍然不能恢复 |
| admit 路径上 `postCommit` 且无首次 S3、钩子也不可仅由 `args` 重入 | 首次可能是 `failed` 或未跑 | **postCommit 不能忠实闭合** | mutation 仍按 create 重跑；不得用加载行当 `prior.data`。见 §3.4 |

两个挂钩的输入不得合并。下表是官方组合对**可恢复挂钩**的全部步骤。

**路径 1 — 框架幂等 replay**

| 步骤 | 动作 | 输入空间 |
|------|------|----------|
| 1 | `dispatch` → `outcome === 'replayed'`，`postCommitPhase.status === 'notRun'`（P 未跑，不是成功） | — |
| 2 | `await controller.rerunPostCommit(source, args, { data: result.data, context: result.context })` | S3 归档 |
| 3 | 用与幂等键相同的业务键查找需要收敛的 **create 行**；若 `resolve` 返回了记录 id，也可用 `result.data` 中的 id（这是从 S3 取 id，不是把 S3 当成存储行） | S2 只用于定位 id |
| 4 | 对每一个需要收敛的 create id 调用 `rerunCreateMutationSideEffects({ recordName, id })` | S1 由 §3.2.1 重建 |
| 5 | 副作用幂等吸收重复执行 | — |

**路径 2 — 应用层 admit 去重**

| 步骤 | 动作 | 输入空间 |
|------|------|----------|
| 1 | 二次 `dispatch` → `result.error` 为重复类错误。这是阶段 A 失败，**不是**成功 | — |
| 2 | 不得把该错误映射为 HTTP 200 / 「已处理」 | — |
| 3 | 用业务键查找已提交 create 行。行不存在 → 按阶段 A 失败处理，不重跑 P | S2 定位 |
| 4 | 行存在 → 对每个需收敛的 create id 调用 `rerunCreateMutationSideEffects({ recordName, id })` | S1 重建 |
| 5 | `rerunPostCommit`：**禁止**把步骤 3 的加载行当作 `prior.data`。按 §3.2.2 表：使用调用方持有的首次 S3，或 args 可重入钩子加空 `prior` | S3 或 args；（B）空 prior |

「重复且义务已完成」与「重复且义务未完成」在无回执表时**不能持久区分**。官方答案：因为幂等合同，两者都重跑；已完成项被吸收。这不是 G3 闭合，而是 P0 收敛。教义不得写成已经能查询区分。

#### 真值表（dispatch 默认路径 × 义务敏感后续；仅可恢复挂钩）

表中「mutation 重跑」只覆盖 **create** 行。update/delete 型失败不出现在本表的闭合列里。

| 第一次可恢复挂钩 | 第二次 dispatch 机制 | 第二次默认 P | create mutation 重跑 | postCommit 重跑 | 可恢复义务 |
|------------------|----------------------|--------------|----------------------|-----------------|------------|
| 成功 | 幂等 replay | 跳过 | 按 id / 业务键；幂等吸收 | 用本次响应上的 S3 | 保持已完成 |
| 失败 | 幂等 replay | 跳过 | 同上 | 用本次响应上的 S3 | 重跑直到这些挂钩 `complete` |
| 未跑（crash 在 COMMIT 后、返回前） | 幂等 replay（上游重投） | 跳过 | 同上 | 用本次响应上的 S3（`finish` 已在 COMMIT 前写入） | 重跑直到这些挂钩 `complete` |
| 成功 | admit 重复抛错 | 不跑 | 查找记录后按 id | 首次 S3 或 args 可重入；**不用加载行当 data** | 保持已完成 |
| 失败 | admit 重复抛错 | 不跑 | 查找记录后按 id | 同上 | 重跑直到这些挂钩 `complete`（postCommit 受 §3.2.2 空缺规则约束） |
| 未跑（crash） | admit 重复抛错 | 不跑 | 查找记录后按 id | 无首次 S3 时：仅当钩子 args 可重入才能忠实重跑 postCommit；否则只保证 create mutation 重跑。剩余缺口见 §3.4 | create mutation 直到 `complete`；postCommit 受空缺规则约束 |

Crash 窗口：at-least-once 调用方收不到成功返回就会重投，落入上表「未跑」行。幂等路径上 S3 已在账本中，postCommit 可忠实重跑。admit 路径没有该归档。无重投、又丢失了记录 id 的运维场景，见 §3.4。首次阶段 P 若含 update/delete 副作用失败，上表闭合后那些挂钩仍未恢复。

### 3.4 FR-SE-04 — 不纳入本次

**裁决：不纳入。** 理由：

1. 任务将 FR-SE-04 标为 P1，并授权设计关闭。
2. 持久义务回执需要与 `_DispatchIdempotency_` 分离的表、setup/migration、查询 API、以及 commit 后 / P 前的短路探针，表面超过本任务 P0 闭环，且会诱导把回执做成调度器（非目标）。
3. P0 在「副作用必须幂等」下可用「未知则重跑」收敛；不需要「已成功则跳过」的细粒度记账。

**剩余缺口（不得标为已闭合）**：

1. 进程在事实 COMMIT 成功之后、阶段 P 执行之前崩溃，且调用方**不再重投**、也**不知道**已提交记录 id 时，框架没有可查询的未完成义务列表。问题陈述验收第 3 条（崩溃窗口可查询未完成项）本次不交付。
2. admit 去重路径没有 S3 归档。若 `postCommit` 依赖 resolve 专用返回值，而调用方既未保留首次 `data`/`context`、钩子也不能仅由 `args` 重入，则 postCommit 无法忠实重跑。mutation 副作用仍可由记录 id 重跑。不得用加载行假装已闭合该缺口。
3. 无存储历史，**update / delete 型** `RecordMutationSideEffect` 失败不能通过 §3.2 原语恢复。首次 `postCommitPhase.status === 'failed'` 可以来自这类挂钩；create 重跑 `complete` 不得被教成「阶段 P 已全部收敛」。

**应用侧恢复（无账本）**：持有业务键或记录 id 时调用 `rerunCreateMutationSideEffects`；持有首次 S3 或编写了 args 可重入 `postCommit` 时调用 `rerunPostCommit`。at-least-once 投递层应重投原始 dispatch，再走 §3.3。框架不内置 outbox。

### 3.5 公开教义（落地时必须改写的读者）

义务敏感路径必须指向 `isPostCommitPhaseComplete` + 重跑原语。下列位置不得再把「只检查 `result.error`」或「把重复错误当成功」写成完整成功模式：

- `agent/agentspace/knowledge/usage/05-interactions.md`（postCommit 失败说明与 `if (result.error)` 示例）
- `agent/agentspace/knowledge/usage/14-api-reference.md`（dispatch / 幂等 replay 跳过 postCommit）
- `agent/agentspace/knowledge/generator/api-reference.md`（`DispatchResponse`、RecordMutationSideEffect、成功检查）
- `agent/agentspace/knowledge/generator/test-implementation.md`
- `agent/skill/interaqt-patterns.md`（仍以 `if (result.error)` 为成功检查示例）
- `README.md` Dispatch Transactions 段
- 其它仍教「扫 `sideEffects` 即完整成功」的 usage 段落（`07-payload-parameters.md`、`06-attributive-permissions.md` 等只关心阶段 A 的示例可保留 `if (result.error)`，但须在 05/14/generator 写明二者区别）

`EventSource.postCommit` 注释已写明 replay 跳过；应补充「可恢复义务走重跑原语；update/delete 型失败本次不能重跑」。

`CHANGELOG.md` Unreleased：新字段、新 API、默认 replay 行为不变、P 失败仍不进入 `error`。

I-6 键集合测试（`tests/runtime/review-fixes-2026-07-10-r14.spec.ts`）在**错误路径**上断言精确键列表，今日为 `context, data, effects, error, sideEffects`。非幂等成功路径另有 `outcome` 键（值可为 `undefined`）；参与者成功路径 `outcome` 为 `'applied'`。两条路径本来就不是同一键集合。M-01 须把 `postCommitPhase` 加进**各自**现有键集合：错误路径变为含 `postCommitPhase` 与 `error`、不含参与者才有的成功 `outcome` 语义；不得为了对齐键名而给错误路径补一个 `outcome: undefined`，也不得从成功路径去掉 `outcome` 键。

### 3.6 评价标准（要求 6）

| 标准 | 本方案如何满足 |
|------|----------------|
| 上游 at-least-once → 义务 at-least-once 成为官方模式 | §3.3 组合合同覆盖 **可恢复挂钩**（create mutation 副作用 + `postCommit`）+ 合同测试；update/delete 型失败明确为剩余缺口，不是每个应用私自编排且无框架原语 |
| API / 概念面最小 | 一个完成对象、一个谓词、两个重跑方法；不改 `outcome`；不加 dispatch 假选项；不做回执表 |
| 与 `outcome` 一致 | 正交字段；replay 默认仍跳过 P |
| 默认 `result.error` | P 失败不写入；只检查 error 的调用方行为不变 |

---

## 4. 里程碑

初始里程碑数 **M = 3**。设计通过后 `N = 15`。M-01、M-02、M-03 均已完成。

### M-01 — 阶段 P 完成对象（FR-SE-01）

- **状态**：已完成
- **可观察结果**：经 `dispatch`（含业务事务冲刷）的成功响应带有 `postCommitPhase`；P 失败时 `status === 'failed'` 且 `failures` 含 mutation 与 `__postCommit`；`result.error` 仍缺席；事实已提交；`isPostCommitPhaseComplete` 为官方谓词；`replayed` 为 `notRun`；阶段 A 错误为 `notRun`。`SideEffectError` 可从 `interaqt` 导入。
- **覆盖要求**：1（G1 证据已在设计期）、2、7（汇合点 + 读者）、8 中与可见性相关的部分。
- **前置**：无。
- **reopen-count**：0。**reopen-domains**：∅。
- **验收命令**（实现阶段新增 `tests/runtime/postCommitPhase.spec.ts`，必须经 `dispatch`）：
  ```bash
  npx vitest run tests/runtime/postCommitPhase.spec.ts
  npx vitest run tests/runtime/dispatchIdempotency.spec.ts tests/runtime/businessTransaction.spec.ts tests/runtime/transactionRetry.spec.ts tests/runtime/transactionAcceptance.spec.ts tests/runtime/recordMutationSideEffect.spec.ts tests/runtime/review-fixes-2026-07-10-r14.spec.ts
  npm run check
  ```
  负向：P 失败不得设置 `error`；`replayed` 不得为 `complete`。同名副作用 create 失败后同记录 update 成功时，最终 `sideEffects[name]` 可能只有成功 `result`——`postCommitPhase.failures` 仍须含那次 create 失败（不得从最终 map 反推）。业务事务：callback 返回前 P 未跑（`notRun` 或尚未 finalize）；`runInBusinessTransaction` resolve 之后结果对象为 `complete`/`failed`。I-6：错误路径键含 `postCommitPhase`，且仍含 `error`；成功路径键含 `postCommitPhase`，且非参与成功仍可有 `outcome: undefined`。callback 内若保留 `DispatchResponse` 引用，冲刷后同一对象会被就地 finalize——断言 callback 内状态须在冲刷前快照。
- **最新证据**（implementation-round 1；审计关闭）：
  - 汇合点 `runPostCommitPhase`：`runPostCommitHook` → `runRecordChangeSideEffects` → 一次 `finalizePostCommitPhase`。失败在循环中追加，不从最终 `sideEffects` map 反推。业务事务推迟队列改为一项 `postCommitPhase`；callback 内写入 `notRun`，拥有者 COMMIT 后就地 finalize。
  - `isPostCommitPhaseComplete` 与 `SideEffectError` 从 `interaqt` 导出。
  - 独立复验所列回归 **74/74**；`npm run check` 通过。
  - 审计加强两项验证后 `postCommitPhase.spec.ts` **14/14 passed**（原 12 条 + `applied` 且 P 失败仍为 `failed` + 同名 create/update 双失败两条 `failures`）。缺陷注入（map 反推、`applied` 强制 `complete`）打红对应用例后已还原。无实现缺陷，无 reopen。

### M-02 — create 重跑与 postCommit 重跑（FR-SE-02）

- **状态**：已完成
- **可观察结果**：无首次 `effects` 时，可用 `rerunCreateMutationSideEffects({ recordName, id })` 重跑该记录上全部 mutation 副作用。分类实现必须与 §3.2.1 参考函数一致：实体 / filtered entity / merged 抽象实体用 `['*']`；`isRelation === true` 或 `isFilteredRelation === true`（含 n:n、n:1、filtered relation、merged input 关系、merged 抽象关系）用端点查询；裸 `['*']` 不得被当成关系形态的合法重建。未知名得到 `UNKNOWN_RECORD_NAME` 而不是 `TypeError`。`rerunPostCommit` 使用 S3 `prior`，失败形状与 M-01 相同（官方谓词可用于 `PostCommitRerunResult`）；部分成功后再跑不丢已成功项（幂等吸收）；非法输入 fail-fast；已声明但无副作用的名字空跑 `complete`；不改事实。
- **覆盖要求**：3、8 中 create 重执行与部分成功后重跑。
- **前置**：M-01。
- **reopen-count**：0。**reopen-domains**：∅。
- **验收命令**：
  ```bash
  npx vitest run tests/runtime/postCommitPhase.spec.ts
  npx vitest run tests/runtime/recordMutationSideEffect.spec.ts tests/runtime/transactionRetry.spec.ts
  npm run check
  ```
  须含：实体重建键与 `findOne(..., ['*'])` 对照；**基关系、filtered relation 与 n:1** 重建含 `source.id` / `target.id`，同一 id 的 `['*']` 查询无端点（负向：不得用截断 event 验收为绿；**仅测具名 n:n 基关系不能关闭分类**）。merged 抽象名按该名 `findOne` 加载，不得映射成 `UNKNOWN_RECORD_NAME`。未知记录名与空跑 `complete` 可区分。两次 rerun 且镜像副作用幂等。`runRecordChangeSideEffects` 未持有首次 effects 时不得作为本里程碑唯一证明。`rerunPostCommit` 的合同不得把存储行传入 `prior.data`（可用 resolve 包装对象对照）。
- **最新证据**（implementation-round 2；审计关闭）：
  - `Controller.rerunCreateMutationSideEffects` 按 `classifyCreateMutationRerun` 读 `storage.map.records`（缺席不走 `getRecordInfo`），构造 `{ type: 'create', recordName, record: loaded }` 后走同一 `runRecordChangeSideEffects` 并一次 finalize。`rerunPostCommit` 把 caller 的 S3 `prior` 交给同一 `runPostCommitHook`。活跃业务事务内两者均抛 `PostCommitRerunError` `IN_BUSINESS_TRANSACTION`。
  - `PostCommitRerunError` / `PostCommitRerunResult` / `isPostCommitPhaseComplete` 可用于重跑返回值；`PostCommitRerunResult` 无 `error` / `outcome`。
  - 独立复验所列回归 **74/74**；`npm run check` 通过。
  - 审计加强三项验证后 `postCommitPhase.spec.ts` **28/28 passed**（原 26 条 + filtered entity `['*']` + create mutation 重跑持续失败不 throw；空 id 并入 `INVALID_INPUT`）。缺陷注入（`isFilteredEntity` 当关系、mutation 重跑 throw、空 id 不守卫）打红对应用例后已还原。无实现缺陷，无 reopen。

### M-03 — 去重/回放收敛与教义（FR-SE-03）

- **状态**：已完成
- **可观察结果**：admit 去重命中后经查找 + `rerunCreateMutationSideEffects` 直到 **create** mutation 副作用成功；幂等 replay 默认仍跳过 P（既有 `dispatchIdempotency` 绿）；replay 之后用本次响应上的 S3 走 `rerunPostCommit`，并用 id 走 create 重跑直到这些挂钩成功；admit 路径的 `rerunPostCommit` 不得把 `findOne` 行传入 `prior.data`（resolve 返回包装对象时，加载行与首次 `postCommit` 所见 `data` 不同）。业务事务推迟 P 仍在拥有者 COMMIT 之后；usage / generator / README / CHANGELOG / `agent/skill/interaqt-patterns.md` 将义务敏感完整成功指向 `isPostCommitPhaseComplete` 与**可恢复**重跑，不再推荐扫 map 或把重复错误当成功，也不得把「直到成功」写成覆盖 update/delete。
- **覆盖要求**：4、6、8 文档与两条收敛路径、9。
- **前置**：M-02。
- **reopen-count**：0。**reopen-domains**：∅。
- **验收命令**：
  ```bash
  npx vitest run tests/runtime/postCommitPhase.spec.ts tests/runtime/dispatchIdempotency.spec.ts tests/runtime/businessTransaction.spec.ts tests/runtime/postgresqlBusinessTransaction.spec.ts
  npx vitest run tests/runtime/transactionRetry.spec.ts tests/runtime/transactionAcceptance.spec.ts tests/runtime/recordMutationSideEffect.spec.ts tests/runtime/eventSource.spec.ts
  npm run check
  ```
  `postgresqlBusinessTransaction.spec.ts` 在无 `INTERAQT_POSTGRES_DATABASE` 时 skip；有真实 PG 时应跑。文档验收：抽查 05/14/generator/README/`agent/skill/interaqt-patterns.md` 不得把「只检查 error」写成义务完整成功；admit 组合不得教「加载行当作 postCommit data」。**负向**：同一次 dispatch 内 create 再 update、update 副作用抛错后，仅 create 重跑返回 `complete` 不得被合同测试当成「阶段 P 已全部收敛」；首次结果在实现 FR-SE-01 后仍为 `failed`。
- **最新证据**（implementation-round 3；审计关闭）：
  - 合同测试 `tests/runtime/postCommitPhase.spec.ts` 新增 FR-SE-03 组合：幂等 replay 默认跳过 P 后用本次响应 S3 + create id 重跑至挂钩 `complete`；admit 去重为阶段 A `error`，查找行后 create 重跑，`rerunPostCommit` 使用首次 S3 且加载行 ≠ 首次 `postCommit` 所见 `data`；args 可重入钩子可用空 `prior`；create 重跑 `complete` 时首次含 update 失败仍为 `failed`；业务事务 callback 内 P 未跑，拥有者 COMMIT 之后才可组合重跑。
  - 独立复验 `postCommitPhase.spec.ts`：**33/33 passed**。
  - 所列回归：`dispatchIdempotency` + `businessTransaction` + `transactionRetry` + `transactionAcceptance` + `recordMutationSideEffect` + `eventSource` = **77 passed**；`postgresqlBusinessTransaction.spec.ts` 在真实 PG 上 **5/5 passed**（无 env 时 skip）。
  - M-01 I-6：`review-fixes-2026-07-10-r14.spec.ts` **8/8**。`npm run check`：exit 0。
  - 最终核验 `npm run test:runtime`：**1188 passed / 51 skipped**。
  - 教义：`usage/05`、`usage/14`、`generator/api-reference.md`、`generator/test-implementation.md`、`README.md`、`CHANGELOG.md` Unreleased、`agent/skill/interaqt-patterns.md`（及 `interaqt-reference.md`、`EventSource.postCommit` 注释）指向 `isPostCommitPhaseComplete` 与可恢复重跑；不把重复错误当成功；不把加载行当 `prior.data`；不把 create 重跑 `complete` 写成覆盖 update/delete。
  - 审计缺陷注入（replay 标成 `complete`）打红 M-01 / M-03 replay 用例后已还原。无实现缺陷，无 reopen。

实现中可调整未完成里程碑，但不得删除 Task 要求，不得把 FR-SE-04 标为已交付。

---

## 5. 风险与验证安排

| 风险 | 阶段 | 处理 |
|------|------|------|
| 完成状态若从最终 `sideEffects` map 推导，多 event 同名会漏失败 | 设计已闭合 | failures 在执行循环收集；M-01 负向对照 |
| BT 只改顶层 dispatch、推迟冲刷漏 finalize | 实现 | 单一 `runPostCommitPhase`；M-01 含 BT 用例 |
| 把 `replayed` 做成 complete | 实现 | 状态表禁止；`dispatchIdempotency` 回归 + M-01 负向 |
| create 重建分类用 `isRelation` 漏掉 filtered relation | 设计已闭合 | §3.2.1 参考函数：`isRelation === true` 或 `isFilteredRelation === true`；M-02 必须含 filtered relation 与 n:1 负向 |
| 未知名走 `getRecordInfo` 变成 TypeError | 设计已闭合 | 先 `getRecord` / `records[name]`；M-02 区分 `UNKNOWN_RECORD_NAME` 与空跑 |
| 把 merged 抽象名当成未知或静默用错查询 | 设计已闭合 | 抽象名按编译形态加载；写路径会在该名下发 create |
| create 重建与首次 event 不完全同构（关系字段、`_rowId`、端点） | 设计已闭合查询形状；实现期验证 | 按参考函数。不承诺嵌套图与创建载荷逐字段相等。M-02 负向钉住关系形态裸 `['*']` 无端点 |
| 把存储行当作 `postCommit` 的 `data` | 设计已闭合 | §3.2.0 / §3.2.2 表；M-03 admit 路径负向对照 |
| 官方组合把 update/delete 失败写成直到成功 | 设计已闭合 | §3.3 可恢复表；M-03 负向：仅 create 重跑 `complete` ≠ 阶段 P 全部收敛 |
| 调用方把 admit 重复错误继续当成功 | 教义 | M-03 文档 + 合同测试展示「error + 查找 + 按挂钩分别重跑」 |
| 无回执时崩溃且不重投；admit 路径无 S3 归档；update/delete 无历史 | 已接受为剩余缺口 | §3.4；不在实现中用假查询 API、加载行或残缺 event 掩盖 |
| I-6 精确键列表因新字段失败 | 实现 | M-01 把 `postCommitPhase` 加进**各自**现有键集合，不强迫成功/失败键列完全相同 |

设计期必须验证的风险（G1/G2/G3、BT 推迟、replay 跳过、三个输入空间、filtered relation 标志、n:1 端点、create+update 同 P、同名后写覆盖）已用最小实验闭合。其余在实现期用项目 Vitest 验证。

---

## 6. 基线

- **Git revision**：`aa7d1c73c8dbb596fc9db3755c478cb99e779cb9`
- **工作树（求证时）**：未跟踪 `docs/post-commit-side-effect-guarantees/`、`prompt/post-commit-side-effect-delivery-guarantees.md`；无已修改的生产文件。
- **相关既有测试（求证时）**：`dispatchIdempotency` + `businessTransaction` + `transactionRetry` + `transactionAcceptance` + `recordMutationSideEffect` = **70 passed**。d1 裁决复跑上述套件 + `review-fixes-2026-07-10-r14` + 裁决探针 = **77 passed**。d2 裁决复跑上述套件 + r14 = **74 passed**；d2 探针 2 passed。d3 裁决复跑上述套件 + r14 = **74 passed**；d3 探针 1 passed。
- **设计期探针**：`tests/runtime/_gap-verify-post-commit-se.spec.ts`（d0）、`tests/runtime/_adjudicate-verify-post-commit-se.spec.ts`（d1，3 passed）、`tests/runtime/_adjudicate-d2-verify-post-commit-se.spec.ts`（d2，2 passed）、`tests/runtime/_adjudicate-d3-verify-post-commit-se.spec.ts`（d3，1 passed）证据写入后删除，以免进入常规套件。
- **包版本**：`4.8.0`。公开 `DispatchResponse` 尚无 `postCommitPhase`；`SideEffectError` 未从 `interaqt` 导出。

---

## 7. 实现备忘（不触发设计复审）

1. `finalizePostCommitPhase` 必须在 postCommit 与 mutation 循环都结束后调用一次；BT 推迟项不要 finalize 两次。
2. 顶层成功路径今天在结果对象上放 `outcome` 键（非参与者为 `undefined`）；错误路径没有 `outcome` 键。新字段加进**各自**现有键集合，不要把两条路径的键列强行做成完全相同。
3. `entityRetention.runAfterSuccessfulDispatch` 仍在 P **尝试之后**运行，不依赖 P 成功；不要改成「仅 complete 才 prune」，除非另开任务。
4. 重跑在 Controller 实例上执行，可与首次不同的进程镜像对比失败——文档写明装配必须一致。
5. 建议测试文件集中在 `tests/runtime/postCommitPhase.spec.ts`，idempotency / BT 回归仍跑原文件。
6. Activity 包装：抽一条经 Activity 头交互的 `postCommit` 失败，确认 `postCommitPhase.status === 'failed'`（读者枚举，M-01 或 M-03 一条即可）。重跑使用实际 `dispatch` 的那份 EventSource（包装后的名字与 idempotency namespace）。
7. 不要为「严格模式 throw」加 Controller 选项。
8. 不要把 effects 列表写入 `_DispatchIdempotency_.data` 来绕过 FR-SE-04。
9. `UNKNOWN_RECORD_NAME` 只表示 `map.data.records[name]` 缺席；已声明但未注册副作用 → 空跑 `complete`。分类实现应直接实现或等价于 `classifyCreateMutationRerun`，不要再发明「非关系 / 关系」种类名。
10. `id` 入参与 `EntityIdRef.id` 一致（公开类型为 `string`）。匹配时使用 storage 返回的 id，不要额外收窄到无法传入驱动返回值。
11. 业务事务冲刷就地更新同一 `DispatchResponse` 引用；测试若在 callback 内留引用，须快照 `postCommitPhase` / `sideEffects`，不要在冲刷后再把该引用当作「callback 返回前」的值比较。
12. 幂等 replay 的 `rerunPostCommit` 使用本次响应上的 `data`/`context`，不要从账本再 load。
13. 重跑入口在活跃业务事务内必须 fail-fast（外部 IO 不得早于 COMMIT）。callback 内 `postCommitPhase.status === 'notRun'` 时立刻 `rerun*` 会把义务提前到 COMMIT 之前，随后冲刷还会再跑一次。这不是可选加强。
14. `isPostCommitPhaseComplete` 不要改成「可恢复挂钩已成功」。M-03 负向必须能拆开「create 重跑 complete」与「首次 P 含 update 失败」。
15. M-01 合同测试必须包含同名后写覆盖负向（create 失败后同记录 update 成功）。
16. 官方组合按每个 `(recordName, id)` 调用。同一物理行在 filtered / merged 下会发两条 create；不要只对业务实体名重跑一次。
17. `isPostCommitPhaseComplete` 是导出函数，不是 Controller 方法。`PostCommitRerunResult` 不是 `DispatchResponse`（无 `error` / `outcome`）。`failures[].name` 对 postCommit 固定为 `'__postCommit'`，与 `SideEffectError.sideEffectName`（事件源名）不是同一个字段。
18. n:1 / 合表关系与基 n:n 同属 `kind: 'relation'`；M-02 用端点查询，不要用裸 `['*']` 当绿。
