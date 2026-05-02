# interaqt 数据约束能力评估与支持计划

## 1. 结论

`medeo-lite-interaqt-transaction-constraints-requirements.md` 提出的核心诉求是合理的，而且应该由 interaqt 框架支持。

它要求框架补齐的不是“计费业务能力”，而是响应式数据模型在生产场景下必须具备的通用一致性基础：

1. 声明式唯一约束，用于表达业务事实、外部事实和版本快照不可重复。
2. dispatch 事务边界，用于保证源事件与同步 computation 派生记录原子提交。
3. 结构化约束错误，用于把数据库兜底错误重新带回业务 helper。

这些能力符合 interaqt 的架构方向：用户通过 `Interaction` / `EventSource` 表达事实，数据变化由 `Transform`、`StateMachine`、`Summation` 等 computation 派生。只要事实派生跨多条记录，就必须有数据库事务和数据库约束兜底，否则 guard 层的检查会在并发下出现 TOCTOU 问题。

建议把本需求拆成两个相关但可独立验收的框架能力：

1. **Schema-level constraint**：在 core model 中新增约束声明，并由 storage setup 安装唯一索引 / 过滤唯一索引。
2. **Dispatch-level atomicity**：明确一次 dispatch 内事件落库与同步 computation 派生写入的事务语义，并补齐错误映射和测试。

不建议把 migration、业务 idempotency helper、任意 SQL expression、跨实体复杂 check、Stripe 语义或计费金额校验放进本次框架能力。

## 2. 需求合理性评估

### 2.1 合理的部分

#### 幂等唯一是框架级不变量

同一个 idempotency key、外部交易号、Stripe checkout session、webhook attempt 或业务版本号只能出现一次，这类约束不依赖 medeo-lite 的具体业务含义。它们本质上是“某个 record 类型的一组持久化属性必须唯一”。

如果只在 guard/helper 中查询后再写入，两个并发请求都可能在写入前看到“尚不存在”，最终产生重复事实。数据库唯一约束是解决这类问题的正确兜底层。

#### 复合唯一必须是一等能力

财务和版本快照场景中，唯一性通常不是单字段。例如：

```ts
UniqueConstraint.create({
  name: 'BillingRuleVersion_business_version_unique',
  properties: ['category', 'model', 'spec', 'version'],
})
```

因此不应只给 `Property.create` 增加 `unique: true`。property-level unique 无法自然表达复合唯一、过滤条件、约束命名和稳定错误映射。

#### 过滤唯一是常见集成模式

外部系统集成常见“先创建本地 intent，后绑定外部 id”的流程。多个本地记录可以暂时没有外部 id，但绑定真实外部 id 后必须唯一。

这不是 Stripe 特例，而是外部系统集成的通用建模需求。框架可以支持一个受限的 filtered unique，而不是开放任意 SQL：

1. `isNull` / `isNotNull`
2. `equals` / `notEquals`
3. `in` / `notIn`

受限谓词既能覆盖 `stripeCheckoutSessionId IS NOT NULL AND stripeCheckoutSessionId != ''` 这类需求，又不会把数据库方言和 SQL 注入到 core model。

#### dispatch 原子性符合 interaqt 响应式模型

一次 `controller.dispatch(eventSource, args)` 成功后，调用方合理预期对应事实和同步派生事实已经一致。如果 `RecordBillableUsage` 成功返回，却还需要 `settle()` 或 `setTimeout` 才能查到 charge / ledger，这会让框架使用者难以判断业务事务是否完成。

因此框架应该明确：

1. guard / conditions、`mapEventData`、事件落库、同步 computation 写入处于同一个数据库事务。
2. 任意一步失败时全部回滚。
3. 外部 side effect 不默认纳入事务。

现有代码已经接近这个语义，但缺少面向约束失败、异步 computation、afterDispatch 副作用边界的清晰 contract tests。

### 2.2 不应上推到框架的部分

以下内容仍应留在业务层：

1. 计费 rule 的 category / model / spec 含义。
2. Stripe livemode、金额、币种、checkout session 内容校验。
3. 重复请求是否可返回 duplicate success 的业务判断。
4. idempotency key 的命名规则和语义一致性检查。
5. “金额必须等于外部系统查询结果”这类跨系统校验。
6. webhook 验签、重放窗口和上游响应策略。

框架只负责提供不可绕过的持久化约束、事务原子性和结构化错误。业务 helper 在拿到唯一冲突后，可以读取既有记录并判断是否语义一致；框架不应自动把唯一冲突转换成成功。

## 3. 当前代码事实

### 3.1 Core model 目前没有数据库约束模型

`src/core/Entity.ts` 和 `src/core/Relation.ts` 中已有 `static public.*.constraints`，但这些 constraints 是 Klass 元数据校验，例如名称格式、属性名唯一、merged entity/relation 限制。它们不是数据库约束声明，也不会进入 storage setup。

当前 `EntityCreateArgs` 包含：

```ts
export interface EntityCreateArgs {
  name: string;
  properties?: PropertyInstance[];
  computation?: ComputationInstance;
  baseEntity?: EntityInstance | RelationInstance;
  matchExpression?: object;
  inputEntities?: EntityInstance[];
  commonProperties?: PropertyInstance[];
}
```

`RelationCreateArgs` 也没有 `constraints` 字段。若要支持声明式数据库约束，需要新增 first-class core concept，而不是复用现有 `static public` 内部校验语义。

### 3.2 Schema setup 只创建表和列

`DBSetup.createTableSQL()` 当前只生成：

```sql
CREATE TABLE "TableName" (
    "columnName" COLUMN_TYPE
)
```

它不会生成普通索引、唯一索引、外键或 check constraint。`MonoStorage.setup()` 在建表后会构建 `EntityQueryHandle` 和 `EntityToTableMap`，并为 PostgreSQL 做 record id sequence setup。

现有唯一索引只有一个特例：`MonoSystem.setupTransformUniqueIndexes()` 会根据 Transform 的内部状态生成 `CREATE UNIQUE INDEX IF NOT EXISTS`，用于 Transform 派生记录的 source/index 去重。这说明当前 runtime 已经接受“在 setup 后追加唯一索引”的工程路径，但这个能力还没有暴露为通用 schema model。

### 3.3 事务骨架已经存在

`Controller.dispatch()` 当前会通过 `runWithTransactionRetry()` 包裹 `system.storage.runInTransaction()`。事务内执行：

1. event source guard。
2. `mapEventData`。
3. 写入 event source 对应实体。
4. 可选 `eventSource.resolve`。
5. 当前实现中的 `eventSource.afterDispatch`。

`MonoStorage.callWithEvents()` 要求 mutation 在事务内执行；若外部直接调用 `storage.create/update/delete` 且不在事务中，会创建一个 atomic transaction。mutation 完成后会同步 `await this.dispatch(methodEvents)`，而 storage listeners 包括 scheduler 注册的 reactive computation 监听器。因此多数同步 computation 会和触发它的 mutation 处于同一个事务尝试中。

但当前代码仍需要明确 contract：

1. `afterDispatch` 当前在 dispatch 事务内执行，而需求文档建议它作为外部副作用时应在 commit 后执行。需要重新命名或拆分语义。
2. `RecordMutationSideEffect` 当前在 dispatch 成功后、事务外执行，这符合“外部副作用 commit 后执行”的方向。
3. Scheduler 中异步任务回写使用独立事务，不应被承诺为原 dispatch 的一部分。
4. `MonoStorage.callWithEvents()` 中已有 “还没有实现异步机制” 注释，说明当前同步行为是事实，但需要用测试锁定。

### 3.4 Driver 错误尚未结构化

`src/runtime/errors/FrameworkError.ts` 已提供框架错误基类，`transaction.ts` 已能识别 PostgreSQL 的 `40001` 和 `40P01` 做事务重试。

但唯一约束错误目前仍会以 driver 原始错误抛出：

1. PostgreSQL / PGLite 通常是 SQLSTATE `23505`。
2. SQLite 通常是 `SQLITE_CONSTRAINT_UNIQUE` 或 message 中包含 `UNIQUE constraint failed`。
3. MySQL 通常是 errno `1062`。

框架还没有统一的 `ConstraintViolationError`，也没有把数据库对象名映射回 `recordName`、`properties`、`violationCode`。

## 4. 推荐能力边界

### 4.1 本次应支持

1. Entity 级唯一约束。
2. Relation 级唯一约束。
3. 单字段唯一和复合唯一。
4. 受限 filtered unique。
5. setup 时创建 / 校验约束。
6. storage 直接写入和 dispatch 写入都受数据库约束保护。
7. 唯一冲突映射为结构化框架错误。
8. dispatch 内事件落库和同步 computation 派生写入原子提交。

### 4.2 本次不应支持

1. 完整 migration 系统。
2. 任意 SQL predicate / expression index。
3. 跨实体 check constraint。
4. 自动推断业务唯一性。
5. 自动 duplicate success。
6. 自动为所有查询建立性能索引。
7. 默认 serializable 或悲观锁策略。
8. 把外部 IO 包进数据库事务。

普通非唯一索引属于性能能力，不纳入本次正确性约束方案；本计划一次性解决唯一约束、过滤唯一约束、dispatch 原子性和结构化错误，不把额外索引能力混入同一设计。

## 5. API 设计建议

### 5.1 新增 Constraint core concept

建议新增 `src/core/Constraint.ts`：

```ts
export type ConstraintPredicate =
  | { [propertyName: string]: ConstraintPredicateOperator }

export type ConstraintPredicateValue = string | number | boolean | null

export type ConstraintPredicateOperator =
  | { op: 'isNull' }
  | { op: 'isNotNull' }
  | { op: 'equals'; value: ConstraintPredicateValue }
  | { op: 'notEquals'; value: ConstraintPredicateValue }
  | { op: 'in'; value: ConstraintPredicateValue[] }
  | { op: 'notIn'; value: ConstraintPredicateValue[] }

export interface UniqueConstraintInstance extends IInstance {
  name: string
  properties: string[]
  where?: ConstraintPredicate
  violationCode?: string
}

export interface UniqueConstraintCreateArgs {
  name: string
  properties: string[]
  where?: ConstraintPredicate
  violationCode?: string
}
```

并提供符合 Klass pattern 的 `UniqueConstraint.create(args, options?)`。

本计划只引入 `UniqueConstraint`，不同时设计普通索引、check、foreign key。这样可以一次性解决当前问题，同时避免为尚未确认的约束类型预留过大的抽象层。

### 5.2 Entity / Relation 接入 constraints

在 `EntityInstance` / `RelationInstance` 和对应 create args 中增加：

```ts
constraints?: ConstraintInstance[]
```

序列化、clone、parse 也要保留 constraints。`core/index.ts` 和 `src/index.ts` 需要导出新类型，使用户可以：

```ts
import { Entity, Property, UniqueConstraint } from 'interaqt'
```

约束声明示例：

```ts
const CreditCharge = Entity.create({
  name: 'CreditCharge',
  properties: [
    Property.create({ name: 'idempotencyKey', type: 'string' }),
    Property.create({ name: 'userId', type: 'string' }),
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'CreditCharge_idempotencyKey_unique',
      properties: ['idempotencyKey'],
      violationCode: 'CREDIT_CHARGE_IDEMPOTENCY_DUPLICATE',
    }),
  ],
})
```

relation 级唯一约束使用 relation record 的持久化引用属性名表达 source/target，而不是路径表达式。公开 API 推荐：

```ts
Relation.create({
  name: 'UserGroupMembership',
  source: User,
  target: Group,
  constraints: [
    UniqueConstraint.create({
      name: 'UserGroupMembership_source_target_unique',
      properties: ['source', 'target'],
    }),
  ],
})
```

`source` / `target` 是 relation 约束中唯一的特殊引用属性，setup 阶段由 `EntityToTableMap` 解析成实际外键字段。`source.id` / `target.id` 不作为约束 DSL 的公开写法；如果需求文档或业务代码中出现这类路径，应迁移为 `source` / `target`。这样可以避免把内部外键列名、merge 策略和 record attribute 结构暴露给用户。

### 5.3 约束校验规则

setup 前应做静态校验：

1. `name` 必填，且在整个 controller schema 内唯一。
2. `name` 是 logical constraint name，用于错误、文档和 schema registry；physical index name 由 driver-safe name builder 生成，可以 hash / 截断，但必须稳定。
3. `properties` 非空。
4. `properties` 只能引用当前 entity / relation 的持久化属性。
5. 不允许引用 computed property。
6. 普通 entity / relation 必须完整支持。
7. filtered entity / relation 上声明约束时，必须明确定义是否把 record 的 `matchExpression` 自动合入 index predicate；在该规则实现并测试前，应明确报错，不允许半支持。
8. merged entity / relation 上声明约束时，需要确认所有引用属性实际存在于同一物理表；无法证明时 setup 失败。
9. `where` 只能使用支持列表中的操作符，每个字段只能出现一个 operator；多个字段之间语义固定为 AND。
10. `where.in` / `where.notIn` 中包含 `null` 时必须使用显式 SQL null 语义，不能直接生成 `IN (NULL, ...)` 或 `NOT IN (NULL, ...)`。
11. 所有 predicate literal 都必须参数化，不能拼接用户值。
12. `violationCode` 是业务稳定 code，但不能影响数据库对象名。

约束属性引用应统一使用 record 上的持久化属性名。relation 的 source/target 引用使用 `source` / `target`，由 `EntityToTableMap` 解析 relation record 上实际存在的持久化字段；无法解析为单一物理字段时 setup 直接失败。

filtered unique 的 null contract 必须作为 public 语义写入测试：

1. `{ op: 'notIn', value: [null, ''] }` 等价于 `IS NOT NULL AND != ''`。
2. `{ op: 'in', value: [null, 'x'] }` 等价于 `IS NULL OR = 'x'`。
3. `{ op: 'notEquals', value: null }` 等价于 `IS NOT NULL`。
4. `{ op: 'equals', value: null }` 等价于 `IS NULL`。

### 5.4 为什么用 unique index 而不是 inline UNIQUE

建议统一生成 `CREATE UNIQUE INDEX`，而不是把 `UNIQUE (...)` 内联进 `CREATE TABLE`。

原因：

1. filtered unique 在 PostgreSQL / PGLite 中天然是 partial unique index。
2. `CREATE UNIQUE INDEX IF NOT EXISTS` 更容易做到 setup 幂等。
3. 与现有 `setupTransformUniqueIndexes()` 的路径一致。
4. 更容易在 `setup()` 非重建表时补齐或诊断缺失索引。
5. 将来 migration 系统也更容易把约束创建作为独立 schema object 处理。

## 6. Storage / Schema 支持计划

### 6.1 增加 schema constraint metadata

`DBSetup` 在 build map/build tables 后，应额外生成 constraint metadata，包含：

```ts
type ConstraintSchemaItem = {
  kind: 'unique'
  constraintName: string
  physicalName: string
  recordName: string
  tableName: string
  properties: string[]
  fields: string[]
  where?: ConstraintPredicate
  violationCode?: string
}
```

这里需要把业务属性名解析为物理字段名。解析必须复用 `EntityToTableMap` / `AliasManager` 的现有映射能力，避免在约束实现里重新写一套 “record property -> table column” 逻辑。

`constraintName` 和 `physicalName` 必须同时保留。`constraintName` 是用户声明的 logical name，在 schema 内唯一，用于错误和文档；`physicalName` 是实际数据库对象名，由统一命名器按 driver identifier 限制生成，可以包含 hash 或截断，但同一 schema 输入必须稳定产出同一物理名。错误映射 registry 应同时索引 logical name、physical name 和 table/fields fallback。

### 6.2 DDL 生成

新增 driver-agnostic builder，将 metadata 转成 DDL：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "CreditCharge_idempotencyKey_unique"
ON "CreditCharge" ("idempotencyKey")
```

filtered unique 示例：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "StripeCreditCheckoutSession_stripeCheckoutSessionId_unique"
ON "StripeCreditCheckoutSession" ("stripeCheckoutSessionId")
WHERE "stripeCheckoutSessionId" IS NOT NULL
  AND "stripeCheckoutSessionId" != ''
```

PostgreSQL、PGLite、SQLite 都使用 partial unique index 表达 filtered unique，并用同一组 contract tests 锁定 null、空字符串和复合条件语义。predicate builder 必须按 5.3 的 null contract 展开 SQL：

```sql
-- { op: 'notIn', value: [null, ''] }
WHERE "stripeCheckoutSessionId" IS NOT NULL
  AND "stripeCheckoutSessionId" != $1
```

MySQL v1 支持口径需要更保守：

1. 普通 unique 和复合 unique 必须支持。
2. filtered unique 只有在 driver 提供经过验证的 generated column 或表达式索引方案，并明确版本下限后才标记为支持。
3. 如果当前 MySQL driver 或数据库版本无法保证同一 filtered unique 语义，setup 必须失败并给出能力诊断，不能静默降级为普通 unique，也不能只在文档中提示风险。
4. core API 不暴露 MySQL 专用参数；差异只能出现在 driver capability 和 setup diagnostics 中。

### 6.3 setup 行为

建议行为：

1. `setup(true)`：建表后创建所有 constraint indexes。
2. `setup()`：不 drop 表；仅在基础表已经存在时验证并幂等补齐声明式 constraint index。若基础表缺失，应报清晰的 schema-not-installed 错误。
3. 重复 setup 不应失败。
4. 约束创建失败时必须带上约束名、recordName 和 driver 原始错误。
5. 如果已有数据违反新约束，setup 可以失败；脏数据清理交给 migration 方案。
6. `setup()` 的补齐范围只限非 destructive 的声明式 constraint index，不做 alter/drop，也不自动修复字段类型或已有脏数据。

`MonoSystem.setup()` 当前在 `storage.setup()` 后调用 `setupTransformUniqueIndexes()`。通用 constraints 可以采用类似后置步骤，但更适合放在 `DBSetup`/storage setup 层，因为它属于 schema，而不是 runtime computation state。后续实现应尽量让 Transform 内部 unique index 和用户声明 constraint index 复用同一个 schema object builder、命名器和错误映射路径，避免两套路由在 driver 行为上分叉。

### 6.4 约束注册表

为了把数据库错误映射回业务约束，需要在 runtime 或 storage 中保存：

```ts
Map<constraintPhysicalName, ConstraintSchemaItem>
```

对于 PostgreSQL/PGLite，唯一冲突错误通常能带回 constraint/index 名。对 SQLite/MySQL，如果错误只包含字段或 message，则需要 fallback 匹配：

1. 优先用 constraint/index 名。
2. 其次用 table + fields 匹配。
3. 无法识别时返回通用 storage error，但保留原始错误。

## 7. 错误模型建议

新增 `ConstraintViolationError`，继承 `FrameworkError`。public contract 应贴合现有 `FrameworkError` 结构，避免同时引入多个业务需要判断的 code 层级：

```ts
type ConstraintViolationErrorContext = {
  code: string
  kind: 'unique'
  constraintName?: string
  recordName?: string
  properties?: string[]
  retryable: false
  driver?: string
  rawCode?: string | number
}
```

稳定约定：

1. `error.name === 'ConstraintViolationError'`。
2. `error.errorType === 'ConstraintViolationError'`。
3. `error.context.code` 保存 `UNIQUE_CONSTRAINT_VIOLATION` 或用户声明的 `violationCode`。
4. `error.context.kind === 'unique'`。
5. `constraintName`、`recordName`、`properties` 是业务可以依赖的稳定字段。
6. driver 原始信息只放在 `driver` / `rawCode` / `causedBy`，业务不需要解析它们。

默认 `context.code` 为 `UNIQUE_CONSTRAINT_VIOLATION`；如果约束声明了 `violationCode`，则使用用户声明的稳定业务 code。不要再额外暴露 `error.code` 作为第二套业务 code，避免调用方不知道应该读取 `error.code`、`error.context.code` 还是 `error.errorType`。

`controller.dispatch()` 的返回应保持当前模式：

```ts
{
  error: ConstraintViolationError,
  effects: [],
  sideEffects: {},
}
```

如果 `forceThrowDispatchError` 开启，则直接 throw 同一个 error 对象，不能丢失 context。

错误映射位置建议在 storage/driver 边界：

1. driver 保留原始错误。
2. storage 层捕获 insert/update/schema 中的数据库错误。
3. 结合 constraint registry 转换成 `ConstraintViolationError`。
4. `runWithTransactionRetry()` 不应重试唯一冲突，因为它不是 transient serialization/deadlock error。
5. 如果唯一冲突发生在同步 Transform / StateMachine / Summation 的派生写入中，storage mutation 边界也必须先转换为 `ConstraintViolationError`，再允许 scheduler 包装为 `ComputationError`。

由于当前 computation 执行路径可能把派生写入异常包装成 `ComputationError`，还需要提供一个稳定 helper，例如 `findConstraintViolationError(error)`，沿 `causedBy` / `cause` 链查找 `ConstraintViolationError`。业务 helper 和 dispatch result 处理逻辑应依赖这个 helper，而不是解析 driver message。

如果最终产品 contract 要求 dispatch 顶层 `result.error` 在派生写入唯一冲突时也直接是 `ConstraintViolationError`，实现需要显式定义 unwrap 规则。否则保留 `ComputationError` 作为 top-level error 也可以接受，但必须保证 `ConstraintViolationError` 可通过 error chain helper 稳定取出。

## 8. Dispatch 事务语义建议

### 8.1 推荐 contract

一次 `controller.dispatch(eventSource, args)` 的事务边界应定义为：

```text
begin transaction
  guard / conditions
  mapEventData
  persist event source entity
  eventSource.resolve 中的框架管理写入
  同步 record mutation listeners
  同步 computation 产生的 create / update / delete
commit
run post-commit side effects
```

失败时：

```text
rollback
return / throw structured error
```

### 8.2 afterDispatch 的语义需要澄清

当前 `eventSource.afterDispatch` 在事务内执行。需求文档把 afterDispatch 视为 commit 后外部副作用。两者存在语义冲突。

建议做一次 API 语义整理：

1. 如果保留当前事务内行为，应将其明确命名为 `afterEventPersisted` 或文档化为“仍在 dispatch transaction 内，不允许外部 IO”。
2. 新增或改造真正的 post-commit hook，用于外部 IO。
3. `RecordMutationSideEffect` 保持事务外、commit 后执行。

本计划要求一次性澄清 hook 语义：事务内 hook 与 post-commit hook 必须在 API 和文档中分开。若保留现有 `afterDispatch` 名称，就必须明确它的执行位置；若它被定义为 post-commit hook，则当前事务内逻辑需要迁移到新的内部 hook。不能继续让同一个名称同时承担事务内逻辑和外部副作用语义。

### 8.3 同步 computation 与异步 computation

本计划应承诺：

1. 由当前 mutation 同步触发并被 storage listener `await` 的 computation，纳入同一事务。
2. Scheduler async task / asyncReturn 使用独立事务，不属于原 dispatch 原子范围。
3. 财务账本链路应使用同步 Transform / StateMachine / Summation，不依赖异步 computation 完成后再保证一致性。

如果为了性能保留或引入异步调度，必须同步提供显式 `consistency: 'transactional' | 'async'`。本计划完成后，财务类模型可以显式选择 transactional，不能依赖隐含的调度实现细节。

### 8.4 嵌套事务

`MonoStorage.runInTransaction()` 当前用 depth 处理嵌套，不创建 savepoint。PostgreSQL driver 也采用连接级 depth 复用，不开独立事务。

本计划应明确：

1. 嵌套 storage mutation 加入外层事务。
2. 不支持在 computation 中开启独立事务。
3. 如果需要多个 dispatch 组成一个原子单元，应在同一次交付中给出明确答案：要么禁止并给出错误，要么提供 `controller.transaction()` 并定义它与 dispatch、guard、computation 的关系。不能留下“嵌套 dispatch 是否原子”的空白语义。

## 9. 实施前 public contract 冻结清单

进入代码实现前，应先把以下 contract 固化到类型、文档和测试计划中，避免实现阶段在不同模块中各自解释：

1. `UniqueConstraint` 的最终 TypeScript 类型、Klass 序列化格式和导出位置。
2. relation 约束只公开 `source` / `target` 作为端点引用写法，不公开 `source.id` / `target.id`；无法解析到单一物理字段时 setup 失败。
3. `ConstraintPredicate` 的 discriminated union 结构、字段间固定 AND 语义、同字段单 operator 限制，以及 `null` 在 `equals` / `notEquals` / `in` / `notIn` 中的 public SQL 语义。
4. `ConstraintViolationError` 的 public fields、`FrameworkError` 继承关系、`context.code` 语义，以及 `findConstraintViolationError(error)` 的 error-chain 查找规则。
5. MySQL filtered unique 的 capability 行为：未验证 generated column / 表达式索引方案和版本下限前，setup 必须 fail fast，不能静默降级。
6. `afterDispatch`、事务内 hook、post-commit side effect 和 async computation 的执行边界。外部 IO 只能进入 commit 后语义。
7. filtered / merged record 上声明 constraints 的支持边界；规则未实现时必须 setup 失败并给出 record、constraint 和属性诊断。

这些 contract 不改变本计划的方向，但应作为进入代码实现前的设计冻结项。实现 PR 中的类型、DDL builder、错误映射和事务测试都应反向验证这份清单。

## 10. 一次性解决方案

本计划不拆成多个版本，也不延迟关键能力。一次性交付应同时完成 core 声明、schema 安装、driver 差异封装、错误映射、dispatch 事务语义和 medeo-lite 回迁验证。实现时可以按依赖顺序提交代码，但验收口径必须是一个完整闭环：业务能在 entity/relation 定义中声明约束，setup 能安装约束，重复写入会触发结构化错误，dispatch 失败会整体回滚。

### 10.1 Core model 工作包

1. 新增 `UniqueConstraint` Klass，符合 interaqt 现有 Klass pattern。
2. `Entity` / `Relation` 增加 `constraints` 字段，并在 create/clone/stringify/parse 中完整保留。
3. `core/index.ts` 和主入口导出 `UniqueConstraint`、`ConstraintPredicate` 等 public API。
4. schema 初始化时校验约束名全局唯一、属性引用合法、谓词合法、computed property 不可参与约束。
5. `ConstraintPredicateOperator` 使用 discriminated union；同一字段多个 operator 属于非法输入。
6. relation 约束公开使用 `source` / `target`，并通过统一字段解析规则落到物理字段；无法解析则 setup 失败。

### 10.2 Schema 与 driver 工作包

1. `DBSetup` 或相邻模块生成 `ConstraintSchemaItem` metadata。
2. 复用 `EntityToTableMap` / `AliasManager` 解析 record property 到 table/field 的映射。
3. `setup(true)` 建表后创建所有 unique indexes。
4. `setup()` 仅在基础表已安装时校验并幂等补齐缺失 unique indexes；如果基础表缺失或已有数据违反约束，setup 失败并报告约束名和冲突来源。
5. PostgreSQL、PGLite、SQLite 使用 partial unique index 支持 filtered unique，并按 null contract 生成 predicate SQL。
6. MySQL driver 必须支持普通 unique、复合 unique；filtered unique 只有在 generated column 或表达式索引方案被验证后才支持，否则 setup 返回明确 capability error。
7. 普通 unique、复合 unique 的 contract tests 覆盖所有 SQL driver；filtered unique contract tests 覆盖 PostgreSQL、PGLite、SQLite，以及声明支持该能力的 MySQL 版本。

### 10.3 错误映射工作包

1. 新增 `ConstraintViolationError`，继承 `FrameworkError`。
2. 建立 constraint registry，把数据库对象名映射回 `constraintName`、`recordName`、`properties`、`violationCode`。
3. 捕获 PostgreSQL/PGLite `23505`、SQLite unique constraint 错误、MySQL `1062`，统一转换为 `ConstraintViolationError`。
4. 在 storage mutation 边界完成错误转换，确保 computation 派生写入失败时 `ComputationError.causedBy` 中保留 `ConstraintViolationError`。
5. 提供 `findConstraintViolationError(error)` 之类的 error-chain helper。
6. `controller.dispatch()` 返回的 `result.error` 和 `forceThrowDispatchError` 抛出的 error 必须保留可结构化识别的同一约束错误信息。
7. `runWithTransactionRetry()` 不重试唯一冲突，只重试明确的 serialization/deadlock 类错误。

### 10.4 Dispatch 事务工作包

1. 明确一次 dispatch 的事务边界：guard / mapEventData / event 持久化 / resolve 内框架写入 / 同步 mutation listeners / 同步 computation 写入全部在同一事务中。
2. 任意同步写入触发唯一冲突时，源事件、已执行的派生写入、StateMachine 更新、Summation 结果全部回滚。
3. dispatch 成功返回后，同步派生记录立即可查询，不要求调用方额外 `settle()`。
4. 事务内 hook 和 post-commit hook 的 API 语义必须分开；外部 IO 只能放在 post-commit side effect。
5. 嵌套 dispatch / 嵌套事务必须有明确行为：禁止并报错，或加入同一事务上下文；不能保持未定义。


## 11. 测试矩阵

### Core tests

1. `UniqueConstraint.create()` 符合 Klass pattern。
2. `Entity.create({ constraints })` 和 `Relation.create({ constraints })` 保留约束。
3. clone/stringify/parse 不丢失约束。
4. 无效 property 引用报清晰错误。
5. 重复 constraint name 报清晰错误。
6. 同一 predicate 字段出现多个 operator 报清晰错误。
7. relation-level unique 使用 `source` / `target` 声明并可序列化。

### Storage / setup tests

1. 单字段 unique 创建成功。
2. 复合 unique 创建成功。
3. filtered unique 创建成功。
4. 重复 setup 幂等。
5. 已有冲突数据时 setup 失败并指出约束名。
6. filtered unique 允许多个 null/空值，不允许相同非空值。
7. `where.notIn` 含 `null` 时生成并执行 `IS NOT NULL AND != ...` 语义。
8. `where.in` 含 `null` 时生成并执行 `IS NULL OR = ...` 语义。
9. relation-level unique 的 `source` / `target` 复合唯一生效。
10. 物理 index 名 hash/截断后，错误仍能映射回 logical constraint name。

### Runtime tests

1. dispatch 重复 key 返回 `ConstraintViolationError`。
2. `forceThrowDispatchError` 下 throw 同一个结构化错误。
3. storage direct create 也触发相同约束。
4. dispatch 原子回滚覆盖源事件、Transform 派生、StateMachine 更新、Summation 结果。
5. 成功 dispatch 后无需 `settle()` 即可查询同步派生记录。
6. 唯一冲突发生在同步 Transform 派生写入中时，源事件回滚且可通过 error chain 识别 `ConstraintViolationError`。
7. 唯一冲突发生在 StateMachine property update 中时，源事件和已执行写入全部回滚。

### Driver tests

1. PGLite 和 PostgreSQL 的 unique violation 都映射到 `UNIQUE_CONSTRAINT_VIOLATION`。
2. PostgreSQL、PGLite、SQLite partial unique 行为一致。
3. MySQL 普通 unique、复合 unique 返回同一结构化错误。
4. MySQL filtered unique 若声明支持，必须通过 generated column 或等价 driver 实现达到同样外部语义；若不支持，setup 必须返回明确 capability error。
5. 所有 driver 支持的 constraint 类型都能返回同一结构化错误。

## 12. 风险与注意事项

### 12.1 filtered / merged records 的物理表映射

interaqt 支持 filtered entity/relation 和 merged entity/relation，同一个逻辑 record 可能映射到 base table 或合并表。约束实现不能简单使用 entity.name 作为 table name，必须走 `EntityToTableMap` 的解析结果。

一次性交付必须处理这些映射规则：

1. 普通 entity/relation 完整支持。
2. filtered entity/relation 支持前，必须明确是否把 filtered record 的 `matchExpression` 自动合入 index predicate；未实现该规则时 setup 应报错。
3. merged entity/relation 的约束必须确认所有引用字段落在同一物理表；不满足时报错。
4. 报错必须指出逻辑 record、约束名和无法解析的属性。

### 12.2 MySQL filtered unique 差异

MySQL 没有与 PostgreSQL partial unique index 完全一致的 DDL。一次性解决方案需要在 driver 层封装差异，而不是让 core API 分叉。

建议明确：

1. 普通 unique 和复合 unique 必须支持 MySQL。
2. filtered unique 只有在 generated column、表达式索引或等价机制完成验证并声明版本下限后才支持 MySQL。
3. MySQL 能力检测在 driver setup 时完成；版本或 driver 能力不满足时给出清晰 capability error。
4. core API 不暴露 MySQL 专用参数。

### 12.3 afterDispatch 兼容性

当前 `afterDispatch` 位于事务内。如果直接改成 commit 后执行，可能改变现有用户行为。计划中必须同时写清现状、补测试，并设计单独 post-commit hook，避免事务内逻辑和外部副作用共用同一个语义入口。

### 12.4 长事务与 computation 成本

把同步 computation 纳入 dispatch 事务会延长事务时间。框架需要避免在 transactional computation 中执行外部 IO，也需要让业务将耗时的非一致性任务放到 commit 后 side effect 或 async computation 中。

### 12.5 错误对象的稳定性

业务 helper 会依赖 `errorType`、`context.code`、`constraintName`、`recordName`、`properties`，以及 error-chain helper。 这些字段一旦发布就是 public contract。字段应少而稳定，避免暴露过多 driver-specific 细节。

## 13. 完整交付定义

本需求的交付标准不是“先支持一部分”，而是一次性形成可用于财务链路的完整闭环。完成标准为：

1. `UniqueConstraint` 可在 `Entity` 和 `Relation` 上声明。
2. 所有支持的 SQL driver 都支持单字段 unique、复合 unique；PostgreSQL/PGLite/SQLite 支持 filtered unique；MySQL filtered unique 只有在 driver 声明 capability 时支持，否则 setup 给出明确错误。
3. `controller.setup(true)` 创建对应 unique index，`controller.setup()` 校验并幂等补齐缺失约束。
4. 重复 setup 不报错；已有脏数据违反约束时，setup 失败并报告约束名和 record。
5. `controller.dispatch()` 和 `storage.create()` 触发唯一冲突时返回/抛出结构化 `ConstraintViolationError`，或在 computation 包装错误中可稳定找到该错误。
6. dispatch 中源事件和同步 computation 派生写入在唯一冲突时整体回滚。
7. dispatch 成功返回后，同步派生记录立即可查询。
8. 事务内 hook、post-commit side effect、异步 computation 的语义都有明确文档和测试。
9. medeo-lite 的充值、扣费、Stripe webhook、业务版本发布场景都能删除手写 DDL 并改用声明式 constraints。
10. 有与业务无关的框架级 tests 和 medeo-lite 回迁 tests 共同证明上述行为。

如果某个数据库版本确实无法实现 filtered unique，框架不能静默降级，也不能让业务以为约束已生效；setup 必须失败并给出明确能力诊断。除此之外，计划目标是完整解决问题，不设计多个版本。

## 14. 最终建议

应该接受这份需求，并以“框架一致性基础设施”的名义实现，而不是以 medeo-lite 业务补丁实现。

推荐 API 是：

```ts
Entity.create({
  name: 'CreditTopUp',
  properties: [
    Property.create({ name: 'idempotencyKey', type: 'string' }),
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'CreditTopUp_idempotencyKey_unique',
      properties: ['idempotencyKey'],
    }),
  ],
})
```

推荐 runtime contract 是：

1. dispatch 接受后，事件与同步派生事实原子提交。
2. dispatch 失败时，事件与派生事实全部回滚。
3. 数据库唯一冲突以结构化错误返回。
4. 外部副作用不在事务内执行。

这样既能解决 medeo-lite 充值、扣费、Stripe webhook、业务版本发布中的并发正确性问题，也不会把 medeo-lite 的业务概念污染到 interaqt 的 core/runtime/storage 分层中。
