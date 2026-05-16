# ScopedSequence Match Implementation Plan

日期：2026-05-16

## 结论

为 interaqt 的 `ScopedSequence` 增加声明式 `match` 能力，用来表达“这个 property sequence 只适用于宿主实体的一部分记录”。

推荐 API：

```ts
const projectAssetSerial = ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'assetPrefix' },
  ],
  match: BoolExp.atom({ key: 'kind', value: ['=', 'PROJECT_ASSET'] }),
})
```

核心语义：

1. `match` 不满足：不分配 sequence，`getInitialValue()` 返回 `undefined`，scheduler 不写入目标 property。
2. `match` 满足：按现有 `ScopedSequence` 规则分配序号。
3. `match` 满足但 scope 缺失或类型不匹配：仍然报错。
4. `allowManualValue` 仍然只表示“允许手工提供目标 property 值”，不再被迫承担“非适用记录 bypass”的职责。
5. migration allocation signature 必须纳入 `match`，因为它改变了哪些记录会消耗 counter。

这比 `skipOnMissingScope` / `allowMissingScope` 更适合作为框架能力。缺 scope 是错误还是合法跳过，不应该由“字段是否存在”隐式推断，而应该由模型显式声明。

需要注意：`match` 只提供显式管辖范围，它不能替业务模型发明不存在的区分字段。如果业务需要区分“项目素材漏传 project”和“非项目媒体合法没有 project”，`match` 应该基于独立 discriminator，例如 `kind = 'PROJECT_ASSET'`、`source = 'PROJECT'` 或 `isProjectAsset = true`。在这种模型下，`match=true` 后缺 `project` 才会继续触发 scope missing error。

如果业务语义本身就是“有 project 才是项目素材”，那么 `match: project is not null` 是可接受的声明，但它表示缺 `project` 的记录不属于该 sequence；框架不会再把它识别为“项目素材漏传 project”。

本方案已经把关键约束纳入设计：create-time 数据边界、禁止引用目标或其他 computed property、ref path 语义、`in` / `not in` nullish 语义、initializer effective match、normalized raw expression 和 fallback 一致性。API 层直接复用框架已有的 `BoolExp` 组合结构，不再新增 `RecordMatch` 公开概念。

## 要解决的问题

当前 `ScopedSequence` 是 property 级全量 computation。只要它挂在 `Media.serialNumber` 上，所有新建 `Media` 都会触发 sequence 分配。

这会把两类记录混在一起：

- 项目素材：属于某个 `Project`，应该参与 `{ project, assetPrefix }` 下的递增序列。
- 非项目媒体：例如 public library、stock、seed、import、manual fixture，本来就不属于项目，不应该参与项目素材序列。

当前框架没有“仅对部分记录启用 sequence”的表达能力，因此应用侧只能保留 `allowManualValue: true`，让非项目媒体手填 `serialNumber: 0` 以绕开 scope 解析。这会削弱项目素材序号的强约束。

## 为什么不是 Allow Missing Scope

可以新增类似下面的配置：

```ts
ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [...],
  skipOnMissingScope: true,
})
```

它能解决非项目媒体缺 `project` 的报错，但语义不够精确。因为框架无法区分：

- 非项目媒体缺 `project`：合法跳过。
- 项目素材漏传 `project`：应该报错。

`skipOnMissingScope` 会把“是否适用 sequence”退化成“scope 是否缺失”。这容易让数据错误静默通过，也不符合 interaqt 的显式控制原则。

因此推荐把能力建模为：

```ts
match: <declarative record predicate>
```

`match` 决定记录是否受该 sequence 管辖；scope 只在记录已经受管辖后参与分配。

## API 设计

在 `ScopedSequenceCreateArgs` 和 `ScopedSequenceInstance` 上新增：

```ts
export interface ScopedSequenceInstance extends IInstance {
  name: string
  scope: ScopedSequenceScopeItem[]
  match?: ScopedSequenceMatchExpression
  initialValue?: number
  step?: number
  allowManualValue?: boolean
  initializeFrom?: ScopedSequenceInitializer
}

export type ScopedSequenceInitializer = {
  record: EntityInstance
  valuePath: string
  scope: Array<{ name: string; path: string }>
  aggregate: 'max'
  match?: ScopedSequenceMatchExpression
}
```

`match` 应采用 core 层稳定的 record predicate data。公开 API 直接复用已有 `BoolExp` 作为 `and/or/not/atom` 组合结构，而不是新增 `RecordMatch` helper；同时也不应把 storage 层 `MatchExp` 作为 public contract。

原因：

- 可序列化：能进入 `ScopedSequence.stringify()` / `parse()`。
- 可比较：能纳入 migration diff。
- 可哈希：能纳入 allocation signature。
- 可分析：initializer 和运行时分配可以共享同一声明式条件。
- 可迁移：不会依赖闭包、环境变量、时间、外部服务或进程状态。

不建议把主 API 设计为：

```ts
appliesTo(record) {
  return Boolean(record.project)
}
```

callback 对用户方便，但对框架不可稳定序列化和迁移。后续如果确实需要，可以单独作为明确标记的 runtime-only escape hatch，但不应作为第一版能力。

## Core 类型边界

需要注意当前依赖方向：`storage` 依赖 `core`，`core` 不应反向导入 `storage/erstorage/MatchExp`。

最终 API 应选择方向 1：把“声明式 scoped sequence match atom 的数据结构”提升为 core 类型，并复用 core 已有 `BoolExp` 作为表达式结构，而不是让 `ScopedSequence` 直接依赖 storage 层的查询实现，也不要把 `match` 长期定义成语义不明确的 `unknown`。

建议新增 core 类型和 helper：

```ts
export type ScopedSequenceMatchOperator =
  | '='
  | '!='
  | 'is null'
  | 'is not null'
  | 'in'
  | 'not in'

export type ScopedSequenceMatchAtom = {
  key: string
  value: [ScopedSequenceMatchOperator, unknown]
}

export type ScopedSequenceMatchExpression =
  | ExpressionData<ScopedSequenceMatchAtom>
  | BoolExp<ScopedSequenceMatchAtom>
```

`ScopedSequence.match` 直接复用 `BoolExp` 的 raw expression 结构，但 atom contract 是“host create-time record predicate data”，不是“ERStorage SQL match expression”。这样既避免新增 `RecordMatch` 概念，也避免用户误以为 relation traversal、inner query、JSON driver operator、function match 都可用于 `ScopedSequence.match`。

推荐用户写法：

```ts
match: BoolExp.atom({ key: 'kind', value: ['=', 'PROJECT_ASSET'] })
```

复杂条件沿用 `BoolExp` 组合：

```ts
match: BoolExp.atom({ key: 'kind', value: ['=', 'PROJECT_ASSET'] })
  .and({ key: 'project', value: ['is not null', null] })
```

这与当前框架中 `Conditions` / `Attributives` / storage `MatchExp` 复用 `BoolExp` 做组合结构的做法一致。后续可以在不改变内部数据结构的前提下增加 plain object shorthand，例如 `match: { kind: ['=', 'PROJECT_ASSET'] }`。但第一版主 API 应先复用 `BoolExp`，避免同时引入多个表达方式。

第一版可限制 `match` 支持范围：

- 只允许读取宿主 record 上已经存在的 primitive/ref 字段。
- 只允许读取 create input 中已经持久化到宿主 record、并且在 create mutation record 中稳定可见的字段。
- 不允许依赖当前 `ScopedSequence` 所在的目标 property。否则用户可以通过手工传入目标 property 让 `match=false`，绕过 `allowManualValue: false` 的 sequence authority。
- 不允许依赖宿主上的任何 property computation 输出，也不允许依赖 relation traversal、storage query、callback、SQL function、driver-specific JSON operator 或 inner query。
- 如果字段来自 storage default 或 property default，只有在它已经稳定出现在 create mutation record 中时才能作为 `match` 依据；否则必须由业务在 create input 中显式提供。
- 支持简单路径，例如 `project`、`project.id`、`source`、`assetPrefix`。
- 支持基础比较符：`=`, `!=`, `is null`, `is not null`, `in`, `not in`。
- 不支持 relation traversal、inner query、SQL function、storage-only operator。

这样可以保证 runtime 在 `getInitialValue(initialRecord)` 阶段无需查询数据库即可判断是否适用。

storage 层可以另外提供从 `ScopedSequenceMatchExpression` 到 storage `MatchExp` 的显式转换 helper，但 `ScopedSequence.match` 本身不应该接受 storage-only match 能力。

`ScopedSequence.match` 必须以 normalized raw expression data 作为内部标准形态，而不是在不同路径里混用 `BoolExp` 实例和 JSON round-trip object。建议新增 helper：

```ts
function normalizeScopedSequenceMatchExpression(match: ScopedSequenceMatchExpression | undefined): ExpressionData<ScopedSequenceMatchAtom> | undefined
function stableScopedSequenceMatchStringify(match: ScopedSequenceMatchExpression | undefined): string
```

`ScopedSequence.validate()`、`ScopedSequence.stringify()`、`ScopedSequence.parse()`、`ScopedSequence.clone()`、runtime evaluator、initializer effective match、manifest hash 和 equality check 都应使用这套 helper。这样结构相同的配置不会因为实例形态不同而被 migration diff 误判为变化。

其中“禁止引用目标 property 或其他 computed property”需要 host context，不能只依赖 core 层 `ScopedSequence.validate()`。实现应在能拿到 `PropertyDataContext` 的阶段校验，例如 `PropertyScopedSequenceHandle` 构造阶段或统一的 schema validation helper：

1. 遍历 normalized `match` 和 `initializeFrom.match` 的 atom key。
2. 取 atom key 的 top-level segment。
3. 如果它等于当前目标 property 名，直接报错。
4. 如果宿主实体或关系上同名 property 存在 computation，也直接报错。

错误信息必须明确指出 `ScopedSequence.match` 只能读取 create-time stable input fields，不能读取目标 computed property 或其他 computed property。

## Runtime 语义

修改 `PropertyScopedSequenceHandle.getInitialValue()`：

```ts
async getInitialValue(initialRecord: Record<string, unknown>) {
  const hostName = this.dataContext.host.name
  const propertyName = this.dataContext.id.name
  const existingValue = initialRecord[propertyName]

  if (!matchesScopedSequence(this.args.match, initialRecord)) {
    return undefined
  }

  if (existingValue !== undefined && !this.args.allowManualValue) {
    throw new Error(`ScopedSequence property ${hostName}.${propertyName} cannot be set manually`)
  }

  if (existingValue !== undefined) {
    assertFiniteNumber(existingValue)
    return existingValue
  }

  return this.controller.system.storage.atomic.nextSequenceValue({
    sequenceName: this.args.name,
    scope: resolveScopedSequenceScope(this.args.scope, initialRecord),
    initialValue: this.args.initialValue ?? 0,
    step: this.args.step ?? 1,
  })
}
```

当前 `Scheduler.addMutationPropertyComputationDefaultValueListeners()` 已经有合适的跳过语义：如果 `getInitialValue()` 返回 `undefined`，不会调用 `applyResult()` 写入目标属性。因此 `match=false` 可以自然表达“不分配、不写入”。

需要明确一个设计点：`match=false` 且 create input 手工提供了目标 property 时，第一版建议允许保留该值，不报错。原因是这些记录不在该 sequence 的管辖范围内，`allowManualValue` 不应约束它们。这样非项目媒体可以保留 seed/import/manual fixture 的特殊值，项目素材则通过 `match=true` 受到严格控制。

同时必须在文档中说明这不是一次 scoped sequence allocation：

- 该手工值不会推进 sequence counter。
- 该手工值不会参与 `initializeFrom` seed，除非它所在记录也满足同一个 `match`。
- 它仍然会落入普通 storage constraint，例如宿主实体上的 unique constraint。
- 如果业务希望非适用记录也禁止手写该字段，需要单独建模为 guard、condition 或 constraint，而不是复用 `allowManualValue`。

如果未来需要更细的约束，可以另加 `manualValuePolicy`，但不建议在本次改动里扩大 API。

## Match 评估器

需要新增一个针对 raw record 的轻量 match evaluator。

它不同于 storage 查询里的 `MatchExp` SQL 编译器，不做 join，不查库，只读取当前 `initialRecord`：

```ts
function matchesRecord(match: ScopedSequenceMatchExpression | undefined, record: Record<string, unknown>): boolean {
  if (!match) return true
  // BoolExp: recursively evaluate and/or/not
  // Atom: read path from record and compare with operator/value
}
```

路径读取规则建议复用或抽取 `readScopedSequencePath()`：

- 缺字段、`undefined` 和 `null` 在 `is null` 下都视为 nullish；在 `is not null` 下都视为 false。
- `in` / `not in` 的 operand 必须是数组，且第一版直接拒绝包含 `undefined` 的数组。
- `in` / `not in` 的 operand 如果包含 `null`，必须编译成显式 nullish 逻辑，而不是依赖 SQL `IN` / `NOT IN` 三值逻辑：
  - `field in [null, ...values]` 等价于 `field IS NULL OR field IN (...values)`。
  - `field not in [null, ...values]` 等价于 `field IS NOT NULL AND field NOT IN (...values)`。
  - `field in [...values]` 在字段缺失、`undefined` 或 `null` 时不匹配。
  - `field not in [...values]` 在字段缺失、`undefined` 或 `null` 时也不匹配，避免 JS fallback 与 SQL `NULL NOT IN (...)` 分歧。
- `project` 表示 ref 字段本身，primitive id 和 `{ id }` 对象都应可用于 `is null` / `is not null`、`=`、`!=`、`in`、`not in`。
- `project.id` 只表示对象形态 ref 的 `id` 字段；如果 create record 中 `project` 是 primitive id，通用 dotted path 会读到 `undefined`。如果希望 `project.id` 兼容 primitive id，必须由 evaluator 显式 special-case，并在 runtime、SQL compiler、fallback 三处保持一致。
- 这不是 relation traversal，不会查询 `Project` 表，也不会读取 ref 指向记录的其他字段。
- 不支持 collection path。

operator 语义必须由 `ScopedSequence.match` 自己的 evaluator 定义，并被 runtime allocation、initializer SQL seed compiler、initializer fallback 三处共享。不要在 fallback 路径把 `ScopedSequenceMatchExpression` 原样传给普通 `storage.find()`，因为当前 storage `MatchExp` 的通用 SQL 编译路径与 scoped sequence match 支持的 operator 并不完全一致，尤其不能把 `not in` 与 `null` 的语义交给通用 SQL 三值逻辑。

具体策略：

1. runtime create 阶段使用 `matchesRecord()` 直接评估 raw `initialRecord`。
2. initializer SQL 快路径使用 `compileScopedSequenceSeedMatch()` 的 scoped sequence 专用 compiler。
3. initializer fallback 路径应读取必要字段的 superset，再用同一个 `matchesRecord()` 在 JS 中过滤；不能调用 `storage.find(recordName, initializer.match, ...)`。

fallback 的 attributeQuery 必须包含：

- `initializeFrom.valuePath`
- 所有 `initializeFrom.scope[].path`
- `match` 中所有 atom key 对应的 top-level/path 字段

如果某个 match path 无法被当前 driver 的 attribute query 稳定读取，fallback 必须报清晰错误或退回读取 `["*"]` 后再用 `matchesRecord()` 过滤，不能静默把 match 交给普通 storage 查询层。

`match` 评估失败应给出清晰错误。例如：

- unsupported operator
- unsupported path shape
- match value cannot be undefined
- in/not in value must be an array and cannot contain undefined
- relation traversal is not supported for ScopedSequence.match

## InitializeFrom 语义

`initializeFrom` 必须与 `match` 保持一致，否则 runtime 分配范围和 counter seed 范围可能不一致。

推荐第一版规则：

1. 如果 `ScopedSequence.match` 存在，`initializeFrom` 的有效 match 默认使用同一个 `match`。
2. 如果 `initializeFrom.match` 也显式存在，必须与 `ScopedSequence.match` 稳定序列化后相等；不相等则 `ScopedSequence.validate()` 报错。
3. 如果 `ScopedSequence.match` 不存在，`initializeFrom.match` 也不应单独存在；否则 seed 范围会比 runtime allocation 范围更窄，仍然会污染 counter state。若确实需要过滤 seed 范围，应先把同一个条件声明为主 `match`。
4. `initializeFrom` 聚合时只扫描有效 match 匹配的记录。
5. 匹配记录缺 initializer scope 时仍然报错或被显式排除，不能静默 seed 出错误 counter。

这样可以避免用户写出：

```ts
ScopedSequence.create({
  match: BoolExp.atom({ key: 'source', value: ['!=', 'PUBLIC_LIBRARY'] }),
  initializeFrom: {
    // 没有 match，错误地把 PUBLIC_LIBRARY 的 serialNumber: 0 也纳入 max
  },
})
```

实现上应通过 helper 计算 effective initializer match，而不是要求用户重复声明：

```ts
function getEffectiveInitializeFromMatch(args: ScopedSequenceInstance) {
  return normalizeScopedSequenceMatchExpression(args.initializeFrom?.match ?? args.match)
}
```

`ScopedSequence.validate()` 负责校验显式 `initializeFrom.match` 与主 `match` 稳定序列化后一致；没有主 `match` 时拒绝单独声明 `initializeFrom.match`。这样既避免 seed 范围污染 counter state，也避免让用户维护两份容易漂移的声明。

## Migration 与 Manifest

`createScopedSequenceAllocationManifest()` 需要新增 `match`：

```ts
export type ScopedSequenceAllocationManifest = {
  kind: 'scoped-sequence'
  timing: 'post-create-pre-commit'
  rebuildable: false
  sequenceName: string
  scope: Array<...>
  match?: ExpressionData<ScopedSequenceMatchAtom>
  initialValue: number
  step: number
  allowManualValue: boolean
  initializeFrom?: ...
}
```

`allocationSignature` 必须包含 `match`。

原因：`match` 改变了哪些 record 会消耗 sequence counter，这是 allocation 行为的一部分，不只是查询优化或展示信息。

迁移判断建议：

- 仅新增 `match`：视为 allocation signature 变化，需要明确迁移策略。
- 修改 `match`：视为 allocation signature 变化。
- 删除 `match`：视为扩大分配范围，风险更高，需要 migration diff 标记。

因为 `ScopedSequence` 是 `rebuildable: false`，框架不应自动重放历史分配。migration 文档/诊断应提示用户需要通过 `initializeFrom` 或显式 seed 方式处理已有数据。

manifest 中的 `match` 与 `initializeFrom.match` 都必须保存 normalized raw expression data。`initializeFrom` 的 manifest 应保存 effective match：当用户省略 `initializeFrom.match` 但主 `match` 存在时，initializer 的 signature 仍然包含主 `match`，确保 seed 行为和 runtime allocation 范围在 hash 层保持一致。

## 序列化与稳定性

需要更新：

- `ScopedSequence.stringify()`
- `ScopedSequence.parse()`
- `ScopedSequence.clone()`
- `ScopedSequence.validate()`
- `createScopedSequenceAllocationManifest()`

`match` 的稳定 hash 必须基于结构化数据，而不是函数源码或对象引用。

如果 `match` 使用 `BoolExp` 实例，需要确认：

- stringify 时保存 raw data，而不是带 prototype 的实例。
- parse 后能还原为 runtime evaluator 和 storage initializer 可识别的数据。
- stableStringify 对 `match` 的 key 顺序稳定。
- `clone()` 不复用可变实例形态，而是复制 normalized raw data。
- `initializeFrom.match` 与主 `match` 的一致性比较基于 `stableScopedSequenceMatchStringify()`，不是引用相等，也不是普通 `JSON.stringify()`。

`initializeFrom.match` 的 signature 应使用 effective match。也就是说，用户省略 `initializeFrom.match` 时，manifest 中用于 seed 行为和 hash 的 initializer match 仍然应等于主 `match`，避免 runtime allocation 范围与 seed 范围不一致。

## 测试计划

新增 core/runtime 单元测试：

1. `match` 不满足时不调用 `nextSequenceValue()`，目标 property 不写入。
2. `match` 满足时正常分配 sequence。
3. `match` 满足但 scope 缺失时报 `ScopedSequence scope "x" is missing`。
4. `match` 不满足且 scope 缺失时不报错。
5. `match` 满足且手工传目标 property，`allowManualValue: false` 时报错。
6. `match` 不满足且手工传目标 property，保留手工值且不推进 counter。
7. `match` 满足且 `allowManualValue: true`，保留手工值且不推进 counter。
8. `initializeFrom` 只 seed 匹配记录。
9. `initializeFrom.match` 缺失但主 `match` 存在时，验证 initializer 使用主 `match` 的 effective value。
10. `initializeFrom.match` 与主 `match` 结构不同但逻辑看似等价时，按稳定结构比较并 validate 报错。
11. `allocationSignature` 会随 `match` 变化。
12. `match` 使用独立 discriminator：`kind = 'PROJECT_ASSET'` 且缺 `project` 时必须报 scope missing。
13. `match` 使用 `project is not null`：缺 `project` 时跳过 sequence，用例名称明确这是业务语义选择。
14. `project` 为 primitive id 与 `{ id }` 两种形态时，`project is not null` 行为一致。
15. 如果支持 `project.id`，必须覆盖 primitive id 与 object ref 的差异或特殊兼容规则。
16. `match` 引用当前目标 property 时必须拒绝启动 controller，错误信息说明不能读取目标 computed property。
17. `match` 依赖宿主上另一个 property computation 输出时必须拒绝启动 controller，错误信息说明只能读取 create-time stable input fields。
18. `match=false` 且手工写目标 property：确认该值不是 sequence allocation，不推进 counter，后续 `match=true` 记录仍拿到正确序号。

新增集成测试：

1. 同一个实体中同时创建项目素材和非项目媒体。
2. 项目素材在 `{ project, assetPrefix }` 下并发创建仍然不重名。
3. 非项目媒体缺 `project` 不触发 sequence，也不消耗项目素材 counter。
4. 关闭 `allowManualValue` 后，项目素材不能手工写 `serialNumber`。
5. initializer fallback 路径覆盖 `is null`、`is not null`、`not in`，确认不依赖普通 storage `MatchExp` 支持。
6. `match=false` 且手工写目标 property：确认 record 保留该值、counter 不推进、下一条 `match=true` record 仍拿到正确序号。
7. initializer SQL 快路径和 JS fallback 对缺字段、`undefined`、`null`、空数组、operand 含 `null` 的 `in`/`not in` 结果一致。
8. `initializeFrom.match` 缺失但主 `match` 存在时，SQL 快路径和 fallback 都使用主 `match` 的 effective value。

Medeo Lite 回归场景：

```ts
ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'assetPrefix' },
  ],
  match: BoolExp.atom({ key: 'kind', value: ['=', 'PROJECT_ASSET'] }),
  allowManualValue: false,
})
```

预期：

- 项目素材自动获得 `p1`、`v2`、`m3` 等 display name。
- public library / import / manual fixture 媒体不需要项目 scope。
- `kind = 'PROJECT_ASSET'` 但缺 `project` 的媒体会继续报 scope missing，而不是被静默跳过。
- 不再需要为了非项目媒体保留 property 级 `allowManualValue: true`。

如果 Medeo Lite 的业务模型最终确认“有 project 才是项目素材”，也可以改用：

```ts
match: BoolExp.atom({ key: 'project', value: ['is not null', null] })
```

但这时缺 `project` 的记录会被视为非项目媒体，这是应用模型选择，不是框架对漏传 project 的保护。

## 实施步骤

1. 先确定 `match` 的 core 数据结构：新增轻量 `ScopedSequenceMatchAtom` / `ScopedSequenceMatchExpression` 类型，复用 `BoolExp` 作为表达式结构，避免 core 依赖 storage，也避免新增 `RecordMatch` 公开 helper。
2. 增加 `normalizeScopedSequenceMatchExpression()` / `stableScopedSequenceMatchStringify()`，统一 `BoolExp` 实例和 raw expression data。
3. 扩展 `ScopedSequence` 类型、validate、serialize、parse、clone，并校验 `initializeFrom.match` 与主 `match` 的一致性。
4. 新增 raw record match evaluator，并限制支持范围；明确 nullish、ref path 和 operator 语义。
5. 在拿得到 `PropertyDataContext` 的阶段校验 `match` 不能引用当前目标 property，也不能引用宿主上的其他 computed property。
6. 修改 `PropertyScopedSequenceHandle.getInitialValue()`，在手工值检查和 scope 解析前判断 `match`。
7. 扩展 `initializeFrom` seed 逻辑，使其使用 effective match，并在 validate 阶段校验显式 initializer match 与主 match 一致。
8. 扩展 manifest 和 migration signature，确保主 `match` 与 initializer effective match 都进入 allocation signature。
9. 修正 initializer fallback，禁止把 scoped sequence `match` 原样传给普通 storage `find()`；fallback 读取 superset 后用 scoped sequence evaluator 过滤。
10. 补齐 runtime、migration、driver 集成测试。
11. 最后在 Medeo Lite 中关闭 `allowManualValue`，把非项目媒体从“手工绕过 sequence”迁移为“match 不适用所以跳过 sequence”。

## 非目标

本方案不处理以下能力：

- 任意 callback `appliesTo(record)`。
- relation traversal 或数据库查询式 match。
- 自动重建历史 sequence。
- 针对 seed/import 的完整权限模型。
- 把 `Media` 拆成 `ProjectMedia` / `PublicMedia` 等应用层重构。

这些可以后续单独设计，但不应阻塞第一版 `ScopedSequence.match`。

