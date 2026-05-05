# interaqt 数据迁移第一阶段实现计划：基于声明计算的重算路线

## 1. 目标与边界

当前 `setup(install = true)` 会按新的 entity/relation/computation 定义重新创建存储结构，这不适合已经存在业务数据的升级。第一阶段要实现的是一条完全不依赖优化猜测的迁移路线：保留已有事实数据，只为新增或变更的声明数据补齐物理结构，并通过 interaqt 已有的响应式计算语义重建派生数据。

第一阶段的目标：

1. 默认只走计算路线，不把“字段疑似改名”“实体疑似拆分/合并”等情况自动优化成 SQL rename/copy。
2. 只重算新增或变更的 computation 以及受它们影响的下游 computation，完全未变化的数据不重算。
3. 正确处理 computation 之间的依赖顺序：新增或变更的派生数据可以依赖其他新增或变更的派生数据。
4. storage 迁移基于 `DBSetup`/`EntityToTableMap` 的逻辑记录到物理表映射，不假设 entity/relation 与 table 一一对应。
5. 为第二阶段预留用户 hints/primitive 入口，例如 `Staff: from(Worker)`，但第一阶段只记录、校验和透传这些 hints，不执行加速。
6. 在新 runtime 读写任何业务数据前，先验证未重建的事实数据物理位置没有移动；如果移动，第一阶段必须 fail fast。
7. migration 完成状态必须确定：所有 affected output 和 state 已经落库，不能把普通 async task 的创建当成重算完成。

非目标：

1. 第一阶段不做自动 rename、copy、merge、split 推断。
2. 第一阶段不删除旧列/旧表。破坏性清理放到后续阶段，避免在计算迁移失败时丢失数据。
3. 第一阶段不支持无法从当前事实数据或持久事件记录重建的 computation。遇到这类 computation 必须给出明确错误，要求用户补充可重算定义、迁移种子或等待第二阶段/专门 handler。
4. 第一阶段默认不执行会删除事实记录的 computed output。即使该 output 在普通运行时有 hard deletion 语义，也必须进入显式 destructive gate。

## 2. 对现有框架机制的理解

interaqt 的运行时以事实写入为边界触发响应式计算：

1. `Controller.dispatch()` 在一个 storage transaction 中完成 guard、事件实体写入、event source resolve、同步 computations 和 afterDispatch。
2. `MonoStorage.callWithEvents()` 收集 `RecordMutationEvent`，同步分发给 `storage.listen()` 注册的监听器。
3. `Scheduler` 根据每个 computation 的 `dataDeps` 或 `eventDeps` 构建 `ComputationSourceMapManager`，把逻辑依赖展开成对具体 record 的 create/update/delete 监听。
4. source map 已经支持 `PHASE_BEFORE_ALL`、`PHASE_NORMAL`、`PHASE_AFTER_ALL`。同一个 mutation event 内，phase 顺序决定不同依赖监听的执行先后。
5. computation 输出可以是 global、entity、relation 或 property。property 上的 `RecordBoundState` 会在 `MonoSystem.setup()` 中注入到根 entity/relation 的 properties 中；global bound state 通过 `_ComputationState_` 和 dictionary 保存。
6. `Transform` 这类 entity/relation computation 已经通过 `sourceRecordId` 和 `transformIndex` 记录源数据与输出数据的对应关系，适合在重算时删除/更新特定派生结果。
7. `StateMachine` 属于 event-based computation。它能否迁移，取决于触发事件是否有足够的持久事实可重放，或 computation 是否提供等价的全量重算能力。

storage 层不能按“一个实体一张表”理解：

1. `DBSetup` 先生成 `map.records` 和 `map.links`，再根据 relation 类型、reliance、用户指定 mergeLinks 等规则执行合表。
2. filtered entity/relation 共享 resolved base record 的物理表，并通过 `resolvedBaseRecordName`、`resolvedMatchExpression` 和 `__filtered_entities` 标记参与查询与事件。
3. x:1 relation 可能把 link 表合并到 source 或 target 表；1:1 reliance 可能三表合一；relation record 的 `source`/`target` 字段也可能由合表规则决定是否真实存在。
4. `EntityToTableMap.getTableAliasAndFieldName()` 是逻辑属性到物理字段的唯一可信入口。migration 不能直接用逻辑名字拼 SQL。
5. `StorageSchemaMetadata` 已经暴露 records/tables/constraints，可作为后续 schema diff 的基础，但第一阶段需要补充更完整的 migration manifest。

## 3. 核心设计原则

### 3.1 以声明数据为中心

迁移计划以“新增或变更后的数据定义”为中心表达，而不是以过程为中心表达。第二阶段 hints 也遵循这个方向：

```ts
// 仅作为未来 hints 的形态示意，第一阶段不执行加速
Staff: from(Worker)
Staff.fullName: from(Worker.name)
Employment: from(WorkerDepartment)
```

这类 hint 说明新的逻辑数据来源于旧的逻辑数据。第一阶段只把 hints 作为 `MigrationOptions.hints` 进入 plan，供校验、日志和未来 planner 使用；实际执行仍然通过 computation 重算。

### 3.2 以 manifest 判断变化，不做运行时猜测

为了做到“只重算新增和变更的”，框架需要在每次成功 setup/migration 后持久化一份 `MigrationManifest`。下一次迁移时用旧 manifest 与新定义生成 diff：

```ts
type MigrationManifest = {
  version: 1
  frameworkVersion: string
  modelHash: string
  records: RecordManifest[]
  relations: RelationManifest[]
  computations: ComputationManifest[]
  storage: StorageSchemaManifest
}

type ComputationManifest = {
  id: string              // 生产迁移必须来自 uuid 或显式 migration identity
  type: string
  dataContext: string     // global:Dict / entity:OrderSummary / property:Order.status
  outputRecord?: string
  outputProperty?: string
  deps: ComputationDependencyManifest[]
  stateKeys: string[]
  boundStates: BoundStateManifest[]
  signature: string       // 来自可序列化定义；无法稳定序列化时要求用户显式 version
  owner?: 'exclusive' | 'shared'
}

type BoundStateManifest = {
  key: string
  scope: 'global' | 'record'
  hostRecord?: string
  tableName?: string
  fieldName?: string
  defaultSignature: string
  valueType?: string
}
```

生产迁移中的稳定身份规则必须收紧：

1. public data model 的 identity 优先来自 core instance 的 `uuid`。
2. 如果历史模型缺失稳定 uuid，生产迁移要求用户提供 baseline manifest 或显式 `migrationIdentity`。
3. `dataContext path + computation type` 只能用于 dry-run 诊断和错误提示，不能作为生产迁移的可靠 identity。否则 property/entity/relation 改名会让框架把同一个逻辑数据误判为删除加新增。

manifest 生命周期是第一阶段的一部分，而不是 migration 的附带行为：

1. `install: true` 成功创建表、约束、默认 dictionary、global computation state 和 bound state 字段后，必须写入当前 `MigrationManifest`。
2. migration 成功后必须原子写入新 manifest 与 migration log；如果写 manifest 失败，不能把迁移视为成功。
3. 普通 `setup(false)` 如果检测到已存在 manifest 且 `modelHash` 不一致，必须拒绝继续并提示用户调用 `migrate()`。
4. 非空库但无 manifest 的场景必须走显式 baseline API，例如 `controller.createMigrationBaseline()` 或 `migrate({ baseline })`。baseline 只能在当前数据库 schema 与当前 definitions 校验一致后生成。
5. baseline manifest 至少记录 storage schema、computation identity、signature、output ownership 和 bound state manifest，否则后续无法判断“只重算新增和变更的”。

对函数 callback、custom computation 等无法稳定序列化的定义，不允许用 `Function.toString()` 猜测语义变化。这里不区分“内置 computation”和“custom computation”：只要语义中包含用户函数，就必须显式版本化，或由 computation 类型提供完全结构化、非函数的可比较描述。策略如下：

1. 内置 computation 的结构化 signature 只覆盖 record、attributeQuery、dataDeps、eventDeps、phase、state schema 等可序列化声明。
2. `Transform.callback`、`Count.callback`、`Any.callback`、`Every.callback`、`Summation`/`WeightedSummation` 回调、`StateMachine.computeValue`、custom data deps 中的 match/callback 等用户函数语义，必须通过 `version`/`migrationKey` 进入 signature。
3. 用户自定义 computation 也必须提供显式 `version`/`migrationKey` 或结构化 signature，否则生产 migration fail fast，提示无法判断是否变化。
4. 缺失显式版本时，框架不能假设 computation 未变化；最多在 dry-run 中给出待补充项。

### 3.3 事实数据与派生数据分层

迁移中把数据分为三类：

1. **事实数据**：用户通过 Interaction/EventSource 写入、且没有 computation 管理的记录和字段。默认保留，不重算。
2. **派生数据**：由 computation 管理的 global/entity/relation/property，以及其 bound state。新增或变更时通过 computation 重建。
3. **系统数据**：dictionary、`_System_`、`_ComputationState_`、async task 表、filtered flags 等。由 migration runtime 维护。

第一阶段只保证派生数据的重算。对事实数据的破坏性变更，例如删除非计算字段、改变字段类型但无 computation 可重建，必须 fail fast。

## 4. 对外 API 形态

建议新增显式 migration API，不把复杂语义塞进现有 boolean `install`：

```ts
await controller.migrate({
  mode: 'compute',
  hints: [],
  dryRun: false,
  allowDestructiveCleanup: false,
})
```

为了兼容现有 `setup(install?: boolean)`，可以先引入重载：

```ts
type SetupOptions =
  | boolean
  | {
      install?: boolean
      migrate?: boolean | MigrationOptions
    }
```

推荐长期语义：

1. `install: true` 只用于空库初始化或测试重建。
2. `migrate: true` 用于已有数据库升级。
3. 如果数据库已有 manifest 且模型 hash 不一致，但用户只调用普通 setup，框架应拒绝继续并提示使用 migrate，避免误把新 schema 套到旧数据上。

迁移不能先执行普通 `setup(false)` 再执行 `migrate()`。当前 `Controller.setup()` 会调用 `MonoSystem.setup()` 和 `Scheduler.setup()`；`MonoStorage.setup(createTables = false)` 仍会创建 constraints、初始化 sequences 和 query handle，`Scheduler.setup()` 会注册普通 mutation listeners。因此迁移入口必须走专用 bootstrap：

1. `db.open(false)` 打开数据库，不 drop、不 create table。
2. 构建新的 runtime definitions、computation handles、states、`DBSetup`、`EntityToTableMap` 和 storage manifest。
3. 不创建普通 constraints/index，不安装 scheduler listeners，不设置默认 dict 值。
4. migration 成功写入新 manifest 后，才安装普通 Scheduler listeners。

## 5. Migration Plan 分层

迁移执行分为四个 plan：

### 5.1 Model Diff Plan

输入旧 manifest 和新 controller 定义，输出逻辑变化：

1. 新增/删除/变更的 entity、relation、property、dictionary。
2. 新增/删除/变更的 computation。
3. computation 输出 dataContext 与依赖 dataContext 的图。
4. 无法自动迁移的变更列表。

判断 computation 是否变更时，以 `ComputationManifest.signature` 为准，不根据物理表变化猜测。

### 5.2 Storage Schema Plan

分别用旧 manifest 中的 storage schema 和新定义经过 `DBSetup` 生成的新 storage schema 做 diff。这里必须比较物理 tables/columns/constraints，但变化来源仍然记录为逻辑 record/property：

1. 新增 table：执行 `CREATE TABLE`。
2. 新增 column：执行 `ALTER TABLE ADD COLUMN`。
3. 新增 `_ComputationState_` 或 async task table：通过 driver 内部 setup 能力创建。
4. 新增 constraint/index：在数据重算完成后创建，避免中间态违反约束。
5. 删除/重命名/类型变更：第一阶段不直接执行破坏性操作。新字段以新 schema 创建，旧字段保留；若无可重算路径则报错。

这个 plan 不能复用当前 `DBSetup.createTables()` 或 `storage.setup(..., createTables = false)` 间接完成。第一阶段需要新增 driver-aware additive DDL builder，从 old/new storage manifest 生成增量操作：

1. `CREATE TABLE` 只针对旧 manifest 中不存在的新物理表。
2. `ALTER TABLE ADD COLUMN` 使用新 `DBSetup` 中的物理 column manifest，保持与现有 `createTableSQL()` 一致的 field type 生成规则。
3. nullable/default/constraint 分阶段处理：先创建可写入的结构，程序 backfill 或重算后再创建约束。
4. index/constraint 创建需要按 driver 支持实现幂等或可恢复，避免重复约束错误中断重入。
5. SQLite、MySQL、PostgreSQL/PGLite 的 transactional DDL 能力不同，executor 必须配合 migration log 支持恢复。

`StorageSchemaDiffer` 的产物必须明确分阶段，而不是只给出一个 DDL 列表：

```ts
type StorageSchemaPlan = {
  preRecomputeDDL: AdditiveDDLOperation[]
  postRecomputeDDL: ConstraintOrIndexOperation[]
  verificationDDL: VerificationOperation[]
  blockingChanges: StorageBlockingChange[]
}

type StorageBlockingChange = {
  kind: 'physical-path-move' | 'unsupported-destructive-schema-change'
  logicalPath: string
  oldPhysicalPath: string
  newPhysicalPath: string
  reason: string
}
```

1. `preRecomputeDDL` 只创建重算可写入的结构。新增 column 默认先按可空、无唯一约束的形式创建；事实字段 default 由程序 backfill，computed 字段由 computation rebuild 填充。
2. `postRecomputeDDL` 在所有相关 output 和 state 完成后创建唯一约束、索引和可支持的非空约束。
3. `verificationDDL` 或等价查询负责验证新增非空 computed property、唯一 computed output 等约束条件已经满足。
4. 约束创建失败时，错误必须能定位到逻辑 record/property、物理 table/column 和 constraint name。
5. 对 driver 不支持的后补约束或 nullability 修改，第一阶段要 fail fast 或要求用户选择显式 table rebuild 方案，不能静默跳过。
6. `blockingChanges` 记录第一阶段不能安全执行的物理位置变化，例如事实 record/property/link 的 table/field move、合表方向变化、relation `source`/`target` 字段位置变化。

Schema diff 不能使用 entity/relation 名直接推断表名，必须通过新旧 `StorageSchemaManifest` 或 `EntityToTableMap` 解析：

```ts
const recordInfo = map.getRecordInfo(recordName)
const [, fieldName, tableName] = map.getTableAliasAndFieldName([recordName], propertyName, true)
```

`StorageSchemaDiffer` 必须把逻辑数据的物理位置作为一等 diff，而不只是比较 table/column 是否存在。规则如下：

1. 对事实 record/property/link，旧 manifest 与新 manifest 的 physical path 必须一致，包括 table、field、link table、source/target field、filtered resolved base。任何 move 都在 plan 阶段报错，除非该数据属于可重建 computed output，或用户显式提供第二阶段 primitive/handler。
2. 对 computed output，物理位置变化可以通过新 map 重建，但必须先确认 output ownership 为 `exclusive`，并且重建 writer 能按新 physical path 写入。
3. migration bootstrap 在这个 gate 通过前，不能暴露新的 `EntityQueryHandle` 给普通 scheduler listener、side effect 或业务 dispatch，避免新 map 读取仍停留在旧物理位置的事实数据。
4. 错误必须同时报告逻辑 path 与旧/新 physical path，例如 `Order.customer -> old: Order.customer_id, new: CustomerOrder.source_id`。

### 5.3 Computation Rebuild Plan

从 Model Diff Plan 中找出所有需要重算的 dataContext：

1. 新增 computation 的输出。
2. signature 变更的 computation 输出。
3. state key/default/schema 变更的 computation 输出。
4. 依赖了上述输出的下游 computation 输出。

未变化且不依赖变化输出的 computation 不进入 rebuild plan。

rebuild plan 需要区分 state 与 output 两个层面：

```ts
type ComputationRebuildItem = {
  computationId: string
  dataContext: string
  rebuildState: boolean
  rebuildOutput: boolean
  propagateOutputEvents: boolean
}
```

1. `rebuildState` 表示 bound state identity、默认值、schema、host record 或物理字段位置发生变化，即使最终 output 值不变也必须重建 state。
2. `rebuildOutput` 表示 output 本身需要重新计算和写入。
3. `propagateOutputEvents` 只能由真实 output diff 决定。state-only rebuild 不应向下游传播 output event，除非重算后 output 实际发生变化。
4. state 变化会影响未来增量计算语义时，即使 output diff 为空，也必须更新 manifest 和 migration log。

### 5.4 Verification Plan

迁移结束前执行轻量校验：

1. 新 manifest 写入前，确认所有新增字段/table 存在。
2. 确认 rebuild plan 中所有 output dataContext 已完成。
3. 对新增约束执行创建；失败则迁移事务回滚或标记为 failed。
4. 写入新的 `MigrationManifest` 和 migration log。

## 6. 计算重建算法

### 6.1 构建 computation 依赖图

每个 computation 输出一个 dataContext node：

```txt
property:Order.total
entity:InvoiceLine
relation:UserActiveTeam
global:DailyStats
```

边的方向为“被依赖数据 -> 依赖它的 computation 输出”。依赖来源：

1. `DataBasedComputation.dataDeps.records.source`
2. `DataBasedComputation.dataDeps.property`
3. `DataBasedComputation.dataDeps.global`
4. `EventBasedComputation.eventDeps.recordName`
5. Transform/state bound state 对输出记录的隐式依赖

当一个 changed node 发生变化，沿依赖图向下游扩散，得到完整 affected set。然后按拓扑顺序执行。拓扑排序要保留现有 phase 概念：

1. 跨 dataContext 使用拓扑顺序。
2. 同一个源 mutation 内，仍按 `PHASE_BEFORE_ALL -> PHASE_NORMAL -> PHASE_AFTER_ALL` 执行。
3. 同 phase 内保持 Scheduler 当前收集顺序，避免引入新的隐式优先级。

如果发现强连通分量：

1. 如果其中存在明确的持久事实源或用户提供的 migration seed，可以按 seed 打破循环。
2. 如果全是派生数据互相依赖，第一阶段报错，要求用户拆分 computation 或提供显式 migration order/seed。

### 6.2 迁移专用 Scheduler

不要直接复用普通 dispatch listener 全量监听所有 computation，否则重算一个 changed output 时可能触发未受影响 computation。建议新增 `MigrationScheduler`：

1. 复用现有 `Scheduler` 的 computation handle 创建、state 创建和 data dep 解析语义，但不能假设现有 `compute()`、`incrementalCompute()`、`applyResult()`、`applyResultPatch()` 直接就是迁移契约。
2. 只注册 affected computations 的 source maps。
3. 写入派生数据时收集 mutation events，但只把事件投递给 affected set 内的下游 computation。
4. 禁止 postCommit hook 和 `RecordMutationSideEffect`，避免迁移过程触发外部副作用。
5. 迁移写入使用一个明确的 `context.source = 'migration'`，方便日志和未来审计。

第一阶段需要新增内部迁移重算契约，并在 plan 生成阶段 fail fast：

```ts
type MigrationRecomputeResult = {
  output: unknown
  stateWritten?: boolean
}

interface MigrationRecomputableComputation {
  recomputeAll?(ctx: MigrationRecomputeContext): Promise<MigrationRecomputeResult>
  recomputeRecord?(record: object, ctx: MigrationRecomputeContext): Promise<MigrationRecomputeResult>
  recomputeFromSourceRecord?(record: object, ctx: MigrationRecomputeContext): Promise<MigrationRecomputeResult>
  diffOutput?(oldOutput: unknown, newOutput: unknown, ctx: MigrationRecomputeContext): Promise<MigrationMutationEvent[]>
}
```

1. global aggregate 通常实现 `recomputeAll()`。
2. property computation 通常实现 `recomputeRecord(hostRecord)`，并明确 full compute 时是否自行维护 `RecordBoundState`。
3. data-based Transform 通常实现 `recomputeFromSourceRecord(sourceRecord)`，继续使用 `sourceRecordId + transformIndex` 对齐输出。
4. `migrationCompute` 必须声明它会直接维护 bound state，还是只返回 output 交给统一 writer 写入 state。
5. event-based/custom computation 只有显式实现迁移契约时才能进入第一阶段重算；不能因为存在 `computeValue`、`getInitialValue` 或普通 `incrementalCompute` 就自动视为可迁移。
6. 迁移契约返回的是确定的最终 output/state，不允许返回 `ComputationResultAsync` 并只创建普通 `_ASYNC_TASK_...` task。普通 runtime 的 async task 需要后续 `handleAsyncReturn()` 才会 apply output，不能作为 migration 完成依据。
7. 如果某个 computation 的迁移重算确实需要异步外部计算，必须提供迁移专用 contract：executor 可等待、可重试、可审计，且只有 task drain 到所有 output/state 已落库后才能进入 verification 和 manifest 写入。没有该 contract 时，plan 生成阶段报 `UnrebuildableComputationError`。

### 6.3 Output Diff

重算 output 后不能只说“生成迁移内部 mutation event”。迁移重算通常没有天然的 source mutation event，必须先把新旧输出归一成规范化事件，再交给 migration scheduler 的下游 dirty resolver。

```ts
type MigrationMutationEvent = {
  recordName: string
  type: 'create' | 'update' | 'delete'
  record?: object
  oldRecord?: object
  keys?: string[]
  dataDep?: string
  attributes?: string[]
  relatedAttribute?: string[]
  relatedMutationEvent?: MigrationMutationEvent
  isRelation?: boolean
  affectedId?: string
  source: 'migration'
}
```

规则：

1. property/global：读取旧值、计算新值，只在值真正变化时写入并产生 update/create event。若新增字段从不存在变为存在，event 要表达为该 dataContext 的 create 或 update，并包含足够的 `record`、`oldRecord`、`keys`。
2. relation path 或 aggregate 触发的下游事件必须保留 `relatedAttribute` 与 `relatedMutationEvent`。property aggregate 的增量逻辑依赖这些字段判断关联关系 create/delete/update，不能丢失成普通 host record update。
3. filtered entity/relation membership diff 要明确事件 recordName 是 filtered record 还是 resolved base record；底层写入 `__filtered_entities` 时，还要按 source map 需要生成 filtered create/delete 事件，必要时同时保留 base update 事件。
4. Transform entity/relation：对 data-based Transform，按 `sourceRecordId + transformIndex` 对齐旧输出与新输出，生成最小 insert/update/delete patch。现有 `Transform` handle 已使用这两个 bound state 做增量 patch，迁移应复用这条语义，而不是简单 delete all + insert all。写入后的事件必须包含真实创建、更新、删除记录；`affectedId` 只用于执行 patch，不能替代下游事件内容。
5. full replace 型 entity/relation：只有 manifest 标记该 output 由某个 computation 独占管理，并且存在稳定身份匹配策略时，才允许 replace。没有稳定身份时，第一阶段只能声明为不可精确迁移，或把 full replace 限制在 affected computation 自身，不能把事件放大到未受影响 computation。
6. 下游 dirty resolver 只消费这些规范化 `MigrationMutationEvent`，并沿 affected set 拓扑传播。

### 6.4 不同输出类型的重算方式

#### Global

新增或变更的 global computation：

1. 确保 `_ComputationState_` 与 dictionary row 存在。
2. 执行 full compute。
3. 用 `GlobalBoundState.setInternal()` 或 storage internal dict 写入结果，避免产生普通业务事件。
4. 通过规范化 `MigrationMutationEvent` 只为真实变化生成迁移内部 mutation event 给 affected 下游。

#### Property

新增或变更的 computed property：

1. 通过 host record 的 `RecordInfo` 找到实际物理字段；新增字段先 schema add。
2. 找到需要重算的 host records：
   - computation 自身变更：host 全量 records。
   - 上游变化：由 dependency dirty resolver 找到受影响 records。
3. 对每条 host record 调用 computation full compute 或 migration-safe incremental compute。
4. 比较旧值与新值，只写回变化项和必要的 `RecordBoundState`，再生成规范化 `MigrationMutationEvent` 供下游 dirty resolver 使用。
5. 如果 property 名称是 `_isDeleted_`，不能复用普通 `Controller.applyResult()` 或 `applyResultPatch()` 路径。该路径在结果为 true 时会真实删除 host record，迁移期必须交给 destructive computed output gate 处理。

#### Destructive Computed Output

任何会产生真实 delete 的 computed output 都不能被普通 rebuild writer 默默执行：

1. `_isDeleted_` hard deletion property 默认 fail fast，除非用户显式开启 destructive migration，并且 dry-run plan 能列出将删除的 record 范围。
2. entity/relation replace 或 patch delete 也必须受 output ownership 与 destructive gate 双重限制。只有 manifest 证明 output 由该 computation 独占管理时，才允许删除旧派生记录。
3. 事实 record 的删除永远不能作为第一阶段默认计算路线的副作用。需要删除事实数据时，应要求用户提供显式 migration handler 或后续阶段的清理计划。
4. `MigrationOutputWriter` 应直接使用 storage 原语写入受控 output，并显式分流 `_isDeleted_`、entity/relation delete patch 等 destructive case，而不是把普通 runtime `applyResult*` 当成迁移契约。

#### Entity / Relation

新增或变更的 entity/relation computation：

1. 若输出完全由该 computation 管理，可以先逻辑清空该 output 的旧派生记录。第一阶段不 drop 物理表，只 delete 逻辑 record。
2. 对 Transform 这类可按 source record 映射的 computation，优先按 source records 批量重建，并写入 `sourceRecordId`、`transformIndex` bound state。
3. 对只支持 full compute 的 computation，执行 full compute 后用 replace 语义写入输出。
4. 输出 mutation events 只进入 migration scheduler 的 affected 下游，不触发外部 side effects。

其中第 1、3 点必须受 ownership 限制：只有 manifest 明确标记为 computation 独占管理的 entity/relation output，才允许清空或 replace。共享 output、事实 output、或无法证明由当前 computation 管理的 output 不能被清空。

#### Event-based Computation

event-based computation 的第一阶段支持条件更严格：

1. 只有 computation 显式实现 `migrationCompute` 或 `MigrationRecomputableComputation`，并声明其输入、输出、state 写入责任时，才按 full compute 重算。
2. 事件 replay 不作为第一阶段默认承诺。即使 event source record 被持久化，也不一定包含 dispatch args、`oldRecord`、resolve 过程、side effects 过滤等可还原语义；只有用户显式 opt-in 且 event record 足够完整时，后续阶段才考虑按事件记录顺序重放。
3. 如果只依赖历史 `RecordMutationEvent`，但历史 mutation event 没有持久化，或缺少重建所需的 `record`/`oldRecord`/关联事件信息，则无法可靠重建，必须在 plan 生成阶段报错。
4. `StateMachine.computeValue` 只描述某个 state node 在一次 transition 后如何产出值，不等价于从当前事实数据全量重建状态机历史；不能据此自动进入迁移重算。

后续应引入可选的 `_MutationJournal_`，在成功 dispatch 后持久化最小 mutation event，用于未来 event-based migration。第一阶段可以设计接口，但不要求立即支持旧数据无日志重建。

### 6.5 Dirty Set 计算

Dirty set 不能简单等于“所有记录”：

1. computation 自身新增或变更时，输出 dataContext 是 dirty。
2. dataDep 指向的上游 output 变更时，使用现有 `computeDataBasedDirtyRecordsAndEvents()` 逻辑定位受影响 records。
3. relation path 变化要通过 `EntityToTableMap.getRelationName()`、`getEntityName()` 和 source map 的 `targetPath` 解析。
4. filtered entity/relation 的 dirty event 要使用 resolved base record 和 `__filtered_entities` 当前状态，不直接扫 filtered record 的虚拟表。

当 dirty set 无法精确计算时，允许退化为该 computation 的 host/output 全量重算，但只限 affected computation，不扩大到未变化 computation。

## 7. Schema 迁移细节

### 7.1 Manifest 驱动的物理差异

第一阶段需要把 `StorageSchemaMetadata` 扩展为可持久 manifest：

```ts
type StorageSchemaManifest = {
  dialect: string
  records: Array<{
    recordName: string
    tableName: string
    isRelation: boolean
    isFiltered: boolean
    resolvedBaseRecordName?: string
    resolvedMatchExpression?: object
    attributes: Array<{
      name: string
      kind: 'value' | 'record'
      tableName?: string
      fieldName?: string
      type?: string
      fieldType?: string
      collection?: boolean
      nullable?: boolean
      defaultSignature?: string
    }>
  }>
  tables: Array<{
    tableName: string
    columns: Array<{
      columnName: string
      fieldType: string
      nullable?: boolean
      ownerRecords: string[]
    }>
  }>
  constraints: ConstraintSchemaItem[]
  boundStates: BoundStateManifest[]
}
```

迁移比较的是这个 manifest，而不是源码里的 entity 名称。当前 `StorageSchemaMetadata` 只暴露 records/tables/constraints 的诊断快照，第一阶段需要补齐 column field type、nullability、default signature、filtered base 信息、bound state 物理位置和 constraint 逻辑来源，才能稳定生成 additive DDL 和后续错误定位。

### 7.2 新增字段与默认值

新增普通事实字段：

1. 有 `defaultValue`：新增 column 后由程序批量写入默认值，保持与 `DBSetup.createTableSQL()` 当前“不生成 DEFAULT 子句”的策略一致。
2. 无 default 且非 nullable 约束：第一阶段不应创建不可满足约束，要求用户提供 computation、default 或 migration seed。

新增 computed property：

1. 先 add column，默认以可写入、可空形式创建。
2. 重算填充。
3. 校验没有缺失值和唯一性冲突。
4. 再创建相关 constraint/index 或后补非空约束。

### 7.3 filtered entity/relation

filtered record 没有独立事实表，迁移时要处理两件事：

1. 如果新增 filtered entity/relation，需要确保 base record 的 `__filtered_entities` 字段存在。
2. 扫描 resolved base records，重新计算该 filtered name 的 flag，并为 affected computation 生成内部 create/delete events。

这一步仍是计算路线，因为 filtered membership 是由 `matchExpression` 声明得到的，不依赖 SQL rename/copy。

### 7.4 合表与拆表

合表/拆表导致的物理布局变化，第一阶段不做数据搬迁猜测：

1. 新 schema 需要的新增表/列可以创建。
2. 如果同一个逻辑事实字段从旧物理表迁到新物理表，但没有 computation 可重建，第一阶段报错，提示需要第二阶段 primitive 或显式 migration handler。
3. 对 computed output，如果新物理布局不同，可以按新 `EntityToTableMap` 重建并写入新位置；旧物理位置中的残留派生数据不在第一阶段做破坏性清理，除非 executor 同时有旧 manifest writer 和显式 cleanup gate。

## 8. 执行流程

推荐流程：

1. 打开数据库，但不 drop。
2. 读取旧 `MigrationManifest`。若不存在：
   - 空库：走 install。
   - 非空库：要求用户显式执行 baseline manifest 生成；baseline 必须校验当前 definitions 与现有 schema 一致，不能自动猜测。
3. 用新 definitions 构建 Controller/Scheduler，但暂不安装普通 computation listeners。
4. 生成 `DBSetup` 和新 storage manifest。
5. 生成 Model Diff、Storage Schema Plan、Computation Rebuild Plan。
6. 执行 storage blocking gate、unrebuildable/async contract gate、destructive computed output gate；任何 gate 不通过都不能继续安装新 query handle 或运行新 scheduler。
7. dryRun 时输出 plan 并停止。
8. 在 transaction 中执行：
   - 创建 migration lock。
   - 执行 additive schema changes。
   - 创建/初始化新增 bound state 字段和 global state row。
   - 执行 computation rebuild plan。
   - 如果使用迁移专用 async executor，等待 task drain 到所有 output/state 完成。
   - 执行 verification plan。
   - 创建新增 constraints/indexes 和 driver 支持的后补约束。
   - 写入新 manifest 与 migration log。
9. transaction 成功后再启动普通 Scheduler listeners。

空库 install 不是 migration 的降级路径，而是 manifest 生命周期的起点：成功 install 后必须写入 manifest；之后再次启动时，如果 manifest hash 与当前模型不一致，普通 setup 要提示 migrate。

如果数据库 driver 不支持足够的 DDL transaction，需要 migration log 支持 resumable 状态：

```txt
pending -> schema-applied -> computation-applied -> constraints-applied -> manifest-written
```

重入时根据 log 跳过已完成步骤，但每个步骤必须设计为幂等。

## 9. 新增内部模块建议

```txt
src/runtime/migration/
├── MigrationBootstrap.ts
├── MigrationManifest.ts
├── MigrationPlanner.ts
├── ModelDiffer.ts
├── StorageSchemaDiffer.ts
├── AdditiveDDLBuilder.ts
├── ComputationGraph.ts
├── OutputDiffer.ts
├── MigrationScheduler.ts
├── MigrationExecutor.ts
└── MigrationErrors.ts
```

模块职责：

1. `MigrationBootstrap`：打开数据库、构建 definitions/handles/states/`DBSetup`/manifest，但不创建约束、不安装普通 listeners。
2. `MigrationManifest`：生成、序列化、校验旧 manifest。
3. `ModelDiffer`：比较逻辑 definitions 和 computation signatures。
4. `StorageSchemaDiffer`：基于 storage manifest 生成 additive schema 操作。
5. `AdditiveDDLBuilder`：按 driver 生成 `CREATE TABLE`、`ALTER TABLE ADD COLUMN`、deferred constraint/index SQL。
6. `ComputationGraph`：生成 affected set、拓扑排序、循环检测。
7. `OutputDiffer`：把重算结果规范化为最小 create/update/delete events。
8. `MigrationScheduler`：限定 affected computations 的重算执行器。
9. `MigrationExecutor`：事务、lock、日志、dryRun、恢复。
10. `MigrationErrors`：提供可定位的错误，例如 `UnrebuildableComputationError`、`DestructiveSchemaChangeError`、`AmbiguousComputationSignatureError`、`PhysicalLayoutChangeError`、`AsyncMigrationComputationError`、`DestructiveComputedOutputError`。

## 10. 第一阶段验收标准

最小可交付能力：

1. 从旧 manifest 和新 definitions 生成 dry-run migration plan。
2. 对新增 computed property，能 add column 并从已有 records 重算，只影响该 property 与依赖它的下游。
3. 对新增 Transform entity/relation，能创建新表/字段并从已有 source records 生成输出。
4. 对变更的 data-based computation，能识别变更、清理/覆盖旧派生输出并重算下游。
5. 对新增 filtered entity，能补齐 `__filtered_entities` flag，并正确触发依赖 filtered entity 的 affected computation。
6. 对需要 rename/copy 才能保留的事实数据变更，第一阶段明确报错，不静默丢数据。
7. 普通业务 side effects 不在 migration 中触发。
8. 成功后写入新 manifest；再次运行 migration 得到空 plan。
9. install 成功写入 baseline manifest；非空库无 manifest 时只能通过显式 baseline API 进入迁移体系。
10. 对 state-only 变化能重建 bound state 但不误发下游 output event。
11. 规范化迁移事件覆盖 `keys`、`oldRecord`、`relatedAttribute`、`relatedMutationEvent`、filtered membership 和 Transform patch 场景。
12. 新增非空/唯一 computed output 经过 pre-recompute DDL、重算、校验、post-recompute 约束创建的两阶段流程；driver 不支持后补约束时给出明确错误。
13. 事实数据的 physical path 变化会在 plan 阶段失败，且错误包含旧/新 table/field；migration 在该 gate 通过前不会暴露新 runtime map 给普通 dispatch/listener。
14. affected computation 若只能产生普通 async task 而不能在迁移中确定落库，plan 阶段失败；提供迁移专用 async executor 时，verification 必须等待所有 task drain。
15. `_isDeleted_` 或其他 destructive computed output 不会默认删除既有事实记录；只有显式 destructive 选项与可审计删除范围同时存在时才允许执行。

建议测试矩阵：

1. 新增 computed property，依赖普通字段。
2. 新增 computed property，依赖另一个新增 computed property。
3. 变更 Transform callback，下游 Count/Summation 跟随重算。
4. 新增 filtered entity，并有 computation 依赖 filtered records。
5. relation 合表场景下新增 relation computed property，验证字段定位通过 `EntityToTableMap` 而不是逻辑名。
6. custom computation 或包含用户函数语义的内置 computation 未提供 migration signature/version 时失败。
7. event-based computation 无 `migrationCompute`/full compute 时失败并给出清晰错误；历史事件 replay 只作为显式 opt-in 的后续能力。
8. bound state schema/default 变化但 output 值不变时，只更新 state 与 manifest，不触发下游 computation。
9. property aggregate 的迁移事件保留 relation `relatedMutationEvent`，下游 Count/Summation 结果与普通 dispatch 路径一致。
10. 新增 unique computed property 在 backfill 前不创建 unique index，backfill 后创建失败时错误能定位到逻辑 property 与物理 column。
11. 关系合表方向变化导致事实 link 的 `source`/`target` physical field 变化时，第一阶段报 `PhysicalLayoutChangeError`。
12. async computation 返回普通 `ComputationResultAsync` 时，migration 不写入成功 manifest；缺少迁移专用 async contract 时直接生成不可重建错误。
13. `StateMachine` 或其他 computation 写 `_isDeleted_ = true` 时，默认 migration 只报告 destructive computed output，不删除 host record。

## 11. 第二阶段预留口子

第一阶段 API 保留 `hints`，但 executor 不使用。第二阶段可在 `MigrationPlanner` 中把 hints 编译成优化 primitive：

```ts
type MigrationHint =
  | { kind: 'from', target: 'Staff', source: 'Worker' }
  | { kind: 'from', target: 'Staff.fullName', source: 'Worker.name' }
  | { kind: 'from', target: 'Employment', source: 'WorkerDepartment' }
```

primitive 的原则：

1. 以新增/修改后的 target data 为中心表达。
2. 只在用户显式提供时使用。
3. primitive 命中后可以把部分 rebuild plan 替换为 SQL rename/copy/backfill。
4. primitive 执行后仍要通过 verification 和必要的下游 computation 重算，不能绕过一致性校验。

这样第一阶段保证计算路线正确可行，第二阶段再在同一个 plan/executor 框架下引入可证明安全的加速路径。
