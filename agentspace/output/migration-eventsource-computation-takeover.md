# Migration: 从手写事实接管为 EventSource Computation

## 背景

业务模型常见演进路径是：

```text
手写 fact / 手写字段
  -> Interaction / custom EventSource
  -> Transform / StateMachine / reactive computation
```

也就是说，早期应用可能直接写入某个 property、entity 或 relation；随着模型成熟，开发者希望这些数据不再由业务代码直接维护，而是由 interaqt 的 EventSource + Computation 机制自动推导。

这类迁移的目标通常不是“保留旧手写值并初始化一些 state”，而是：

1. 停止旧的手写事实来源。
2. 删除或废弃旧 fact 数据的权威性。
3. 由新的 computation 完整重建 output。
4. 让后续写入完全通过 EventSource 驱动。
5. 对删除、接管和重建过程保留 migration 审计。

当前 migration 框架可以覆盖其中一部分，但不能完整表达“一步删除旧手写事实并完全接管为 EventSource computation”。

## 当前框架能力

当前 computation migration 的核心 decision 是：

- `changed`
- `state-only`
- `unchanged`
- `unrebuildable`

其中：

- `changed` 表示 output 需要重建。
- `state-only` 表示只重建 bound state，不重建 output，不传播 output events。

对于 data-based computation，框架通常可以直接 full recompute。对于 event-based computation，例如 `StateMachine` 或基于 `eventDeps` 的 `Transform`，框架无法从 event 定义自动推导历史结果，因此会要求 `event-rebuild-handler`。

这意味着当前框架已经支持一种有限形式：

```text
新增/变更 computation
  -> reviewer 批准 changed
  -> 必要时提供 event-rebuild-handler
  -> migration 写入新的 computed output
```

但它不完整支持以下场景：

```text
已有 fact output
  -> 改为 computed output
  -> 删除旧 fact 权威数据
  -> 用新的 EventSource computation 完整接管
```

## 当前缺口

### 1. `state-only` 不是接管语义

`state-only` 只适合“output 不变，只需要迁移 computation state”的场景。

如果目标是删除旧手写值并完全重建 output，应该使用 `changed`，而不是 `state-only`。

但对 `StateMachine` 来说，仅使用 `changed` 也不够。`event-rebuild-handler` 可以重建 property output，却没有正式语义保证内部 state 与 output 一致。

例如：

```text
Ticket.status = "closed"
StateMachine.currentState = "open"
```

这种状态下，表面 output 看起来已经迁移成功，但后续事件转移可能基于错误的内部状态执行。

因此 StateMachine 接管需要的不只是 output rebuild，还需要 state rebuild/backfill 语义。

### 2. 旧 fact storage 的退役缺少可审计 decision

当前 `getStorageBlockingChanges()` 对 old manifest 存在而 new manifest 不存在的 fact record，会生成 blocking change：

```text
unsupported-destructive-schema-change: fact record was removed from the new schema
```

这个保守策略本身合理，因为框架不能擅自删除用户事实数据。

问题在于：即使 reviewer 已确认旧表为空、无消费者、无新写入，当前 diff 层也没有一个 decision 可以表达“允许安全退役这个 fact storage”。

用户只能选择：

- 永久保留 legacy entity/relation/property，让 manifest 不删除旧表。
- 绕过 interaqt migration，手工处理数据库。

两者都不是理想框架工作流。

### 3. computed output 接管旧 fact output 缺少所有权转移语义

entity/relation output 的全量重建会替换一组记录。当前框架要求 old manifest 中存在 exclusive computed output ownership proof。

这对“本来就是 computed output，现在重新计算”的场景是合理的。

但对“旧表原本是 fact，现在要由 Transform 接管”的场景，old manifest 不可能有 computed ownership proof。因此框架会阻断。

这不是 bug，而是缺少一个显式的 ownership takeover primitive。

### 4. EventSource computation 不能自动历史重放

EventSource 描述的是后续事件如何驱动 computation，并不天然包含“如何从当前数据库快照推导历史最终状态”的信息。

因此框架不应该尝试自动猜测接管结果。对于 event-based computation，必须由开发者提供可审计的 rebuild/backfill handler。

## 当前建议处理方式

在当前框架能力下，推荐使用分阶段迁移。

### property 接管

如果是已有手写字段迁移成 computed property：

1. 保留旧字段或旧数据作为迁移输入。
2. 新增 computation。
3. approval 使用 `changed`，不要使用 `state-only`。
4. 如果 computation 是 event-based，提供 `event-rebuild-handler`。
5. 迁移后校验 computed output 与预期一致。
6. 应用层切换到新 EventSource 写入路径。
7. 后续单独清理旧字段或旧写入路径。

### StateMachine 接管

如果目标 computation 是 `StateMachine`：

1. 使用 `changed` 重建 output。
2. 提供 `event-rebuild-handler` 推导每条记录的 output。
3. 不要假设 output 重建等于 StateMachine 内部状态也已正确迁移。
4. 若后续转移依赖内部 state，应通过业务脚本或专门 backfill 流程同步 state。
5. 在框架支持 state rebuild handler 前，不建议把这类迁移设计成一步完成。

### Transform entity/relation 接管

如果是已有 fact entity/relation 改为 Transform output：

1. 不要直接让 computed output 抢占旧 fact table。
2. 新增独立 computed output entity/relation。
3. 使用 `changed` 和必要 handler 重建新 output。
4. 应用读路径切到新 output。
5. 确认旧 fact storage 无新写入、无消费者、可废弃后，再单独退役。

## 框架是否应该支持一步接管

框架应该支持这个能力，但不应该把它做成隐式自动行为。

原因是从手写事实迁移到响应式 computation，是 interaqt 这类框架的核心模型演进路径。如果框架不支持，用户会被迫在两个不理想选项中选择：

- 永久保留 legacy model，污染业务定义。
- 手工修改数据库，绕过 migration 审计。

但这个能力涉及数据删除、所有权转移、状态重建、并发写入和 downstream propagation，不能通过简单放松 safety gate 实现。

正确方向应该是新增显式、可审计、可验证的 migration primitive。

## 建议的框架支持方案

### 1. 引入 output takeover decision

新增 decision 用于表达 computed output 接管旧 fact output：

```ts
{
  kind: "output-takeover",
  from: {
    kind: "fact-output",
    dataContext: "entity:LegacyDerivedTicket"
  },
  to: {
    kind: "computed-output",
    dataContext: "entity:DerivedTicket",
    computationId: "computation:entity:DerivedTicket:RecordsTransformHandle"
  },
  strategy: "replace-from-rebuild",
  requireExclusiveWriteFreeze: true,
  reason: "DerivedTicket is now maintained by Transform from Ticket events"
}
```

这个 decision 不应该默认生成 executable plan。它必须要求 reviewer 明确批准，并要求框架在 dry-run 和 execution 阶段验证安全条件。

### 2. 引入 storage retirement decision

新增 decision 用于表达旧 fact storage 可以退役：

```ts
{
  kind: "storage-retirement",
  logicalPath: "LegacyTicketEvent",
  oldPhysicalPath: "LegacyTicketEvent",
  requireEmpty: true,
  reason: "legacy event source retired after migration to InteractionEventEntity"
}
```

执行要求：

1. dry-run 查询旧 storage 行数。
2. `requireEmpty: true` 且 count 为 0 时允许生成 drop plan。
3. execution 阶段再次检查行数，避免 dry-run 后出现新写入。
4. migration log 记录 decision、count、physical path 和执行结果。

### 3. 引入 event output rebuild handler

当前已有 `event-rebuild-handler`，但它承担的语义偏宽。建议明确它用于 output rebuild：

```ts
{
  kind: "output-rebuild-handler",
  dataContext: "property:Ticket.status",
  handlerRef: "rebuildTicketStatus",
  reason: "Ticket.status is now derived from TicketLifecycle StateMachine"
}
```

handler 负责从当前数据库快照返回最终 output：

```ts
async function rebuildTicketStatus({ record, controller }) {
  return deriveStatusFromExistingData(record, controller)
}
```

对于 property output，框架可以逐条 host record 调用 handler。对于 global/entity/relation output，handler 可以返回完整结果集合。

### 4. 引入 state rebuild handler

StateMachine 和其他有 bound state 的 computation，需要独立的 state rebuild 语义：

```ts
{
  kind: "state-rebuild-handler",
  dataContext: "property:Ticket.status",
  handlerRef: "rebuildTicketLifecycleState",
  reason: "StateMachine currentState must match migrated status output"
}
```

handler 返回 state key 到 state value 的映射：

```ts
async function rebuildTicketLifecycleState({ record, output }) {
  return {
    currentState: output === "closed" ? "closed" : "open"
  }
}
```

框架负责将返回值写入对应 bound state storage。

对于 record-bound state，handler 应该逐条 record 执行。对于 global-bound state，handler 可以执行一次。

### 5. 明确 write freeze / no-new-writes 条件

接管迁移必须避免迁移期间旧写入路径继续产生数据。

建议 decision 支持：

```ts
{
  requireNoNewWrites: true,
  writeFreezeRecordNames: ["LegacyTicketEvent", "Ticket"]
}
```

框架执行时至少应支持以下保护之一：

- 在 transaction 中验证旧表 row count 或 watermark 未变化。
- 对相关表加 migration lock。
- 要求应用层进入维护窗口，并在 migration log 中记录该 requirement。

不同数据库能力不同，框架可以先提供保守实现：dry-run 记录 count，execution 前再次检查 count/hash/watermark，不一致则 blocking。

### 6. 将 destructive scope 与 takeover 绑定

对于会删除旧 output 或替换 entity/relation output 的 migration，destructive scope 应该与 takeover decision 绑定，而不是单独散落在 diff 中。

例如：

```ts
{
  kind: "output-takeover",
  from: "entity:LegacyDerivedTicket",
  to: "entity:DerivedTicket",
  destructiveScope: {
    recordName: "LegacyDerivedTicket",
    requireEmpty: false,
    expectedIds: ["..."]
  },
  handlerRef: "rebuildDerivedTickets",
  reason: "replace legacy fact output with Transform output"
}
```

这样 reviewer 能在一个 decision 中看到：

- 删除什么。
- 由谁接管。
- 如何重建。
- 影响哪些记录。
- 为什么安全。

### 7. dry-run plan 增加明确状态

dry-run 返回 plan 是合理的，但 plan 应该明确告诉调用方是否可执行：

```ts
{
  ok: false,
  blockingChanges: [...],
  warnings: [...],
  takeoverPlans: [...]
}
```

这样上层脚本不会把“dry-run 成功返回 plan”误解成“migration 可以执行”。

## 设计原则

### 显式控制

框架不应自动把 fact output 接管为 computed output。所有接管、删除、handler、write freeze 都必须由 approved diff 显式表达。

### 审计优先

每个 destructive action 都应写入 migration log，包括：

- approved decision hash
- handlerRef
- old/new dataContext
- old/new physical path
- affected count / ids
- dry-run observation
- execution observation

### 不重放未知历史

EventSource computation 不应被假定能从历史事件重放出当前状态。除非用户提供完整历史事件源和重放策略，否则 migration 应从当前数据库快照和 handler 显式重建。

### output rebuild 与 state rebuild 分离

output 是用户可见数据，state 是 computation 内部运行状态。两者可以相关，但不应混为一个 handler。

### safety gate 不应只看 computation 是否在 plan 中

safety gate 应读取 rebuild item 的语义：

- `rebuildOutput`
- `rebuildState`
- `propagateOutputEvents`
- takeover decision
- destructive scope

只有真正会替换或删除 output 时，才触发 output destructive gate。

## 建议落地顺序

### Phase 1: 修复现有语义断层

1. `getRecomputeBlockingChanges()` 尊重 `rebuildOutput: false`。
2. `getDestructiveDeletionScope()` 跳过 `rebuildOutput: false` 的 item。
3. `MigrationScheduler.run()` 在 state-only 分支之前不要要求 output rebuild handler。
4. 修正新增 computation 错误信息，使其与 `changed/state-only` 实际语义一致。

这一步不新增接管能力，只修复现有 state-only 语义。

### Phase 2: 明确 handler 语义

1. 将现有 `event-rebuild-handler` 文档化为 output rebuild handler。
2. 为 StateMachine 增加 state rebuild handler。
3. 在 diff 中区分 output handler requirement 和 state handler requirement。

### Phase 3: 支持 storage retirement

1. 增加 `storage-retirement` decision。
2. dry-run 查询旧 storage count。
3. execution 阶段再次验证。
4. 写入 migration log。

### Phase 4: 支持 output takeover

1. 增加 `output-takeover` decision。
2. 将 ownership proof、destructive scope、handler、write freeze 统一到 takeover plan。
3. 支持从 fact output 接管为 computed output。
4. 对 entity/relation replacement 保持严格安全验证。

## 结论

“一步删除旧手写事实并完全接管为 EventSource computation”是框架应该支持的模型演进能力，但它不能是隐式的 `changed` 或一个宽松的 destructive allow。

它应该被设计成显式接管工作流：

```text
approve takeover
  -> freeze/validate old writes
  -> rebuild output
  -> rebuild state
  -> verify destructive scope
  -> retire storage
  -> write manifest and migration log
```

在当前框架下，业务应采用分阶段迁移；在框架层，应该补齐 output takeover、state rebuild 和 storage retirement 这三类 migration primitive。
