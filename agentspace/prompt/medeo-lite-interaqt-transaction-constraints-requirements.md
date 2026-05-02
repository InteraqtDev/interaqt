# interaqt 数据库事务与约束能力需求

> 来源：`medeo-lite-credit-deduction-plan.md` 与 `medeo-lite-stripe-credit-recharge-plan.md` 中暂缓实现的数据库事务、唯一约束和并发幂等要求。
>
> 本文不是 medeo-lite 业务实现计划，也不讨论 migration 落地。目标是把这些需求抽象成对 interaqt 框架合理的通用能力，并说明框架应如何支持。

---

## 1. 背景

medeo-lite 的充值、Stripe 付款和扣费链路都遵守 interaqt 的响应式原则：用户或系统只 dispatch `Interaction` / `EventSource`，业务事实再通过 `Transform`、`StateMachine`、`Summation` 等 computation 派生。

当前实现已经在 guard、helper 和测试中维护了大量业务不变量，例如：

1. 同一个 admin 手动充值 nonce 只能产生一次 `CreditTopUp` 和一条 ledger。
2. 同一个外部充值 provider transaction 只能入账一次。
3. 同一个 Stripe Checkout Session 只能生成一次付款事实、一次 top-up、一次 ledger。
4. 同一个 billable usage idempotency key 只能生成一次 usage event、对应 charge 和 consume ledger。
5. 充值比例、扣费规则、充值套餐都是版本快照，同一业务 key 下 version 必须递增且不可重复。

这些 guard 层检查能给调用方友好错误，但不能解决并发下的 TOCTOU 问题：

```text
请求 A guard: 未发现 idempotencyKey
请求 B guard: 未发现 idempotencyKey
请求 A 写入
请求 B 写入
```

因此财务账本类数据必须由数据库约束兜底。同时，`EventSource` 落库与下游 `Transform` 派生记录必须具备明确事务边界，否则会出现“源事件已写入，但 charge / ledger 未完整派生”的半成品状态。

---

## 2. 已确认的 interaqt 模型

基于当前 medeo-lite 使用方式和 `medeo-lite/skill` 中的 interaqt 文档，可以确认：

1. interaqt 的核心业务入口是 `controller.dispatch(eventSource, args)`。
2. `Interaction` 只是声明用户意图；`Action` 不承载 handler，数据变化由 computation 表达。
3. 非用户意图的系统事实可用 `EventSource.create({ entity, guard, mapEventData })` 持久化。
4. `conditions` / `guard` 在事件落库前执行；被拒绝时不应持久化对应事件。
5. `Transform` 可监听 `InteractionEventEntity` 或其他实体 mutation，并派生新 entity / relation。
6. `StateMachine` 可监听 mutation event 并更新属性。
7. `Summation` 等属性 computation 会响应关系变化自动维护派生属性，例如 `User.creditBalance`。
8. `storage.create/update/delete` 会绕过业务 guard 和 interaction 语义，只适合测试 setup、seed 或底层工具；数据库约束仍应对它生效。
9. `controller.setup(true)` 负责安装 schema；`controller.setup()` 复用既有 schema。当前业务定义里没有通用的唯一约束 / 索引声明入口。

这些特征决定了事务和约束能力应该落在 interaqt 的声明式 model / schema / dispatch runtime 中，而不是让业务模块手写 DDL 或在 component 启动文件里感知某个业务模块。

---

## 3. 需求边界

### 3.1 应该由框架支持

1. 声明式唯一约束和必要的过滤唯一约束。
2. 约束随 interaqt schema setup 一起安装和校验。
3. 单次 dispatch 内的事件持久化、同步 reactive computation、派生记录写入处于同一个数据库事务。
4. 数据库唯一约束冲突能转换成结构化 dispatch error。
5. 约束声明不绑定 PostgreSQL，至少能在 PGLite 测试和 PostgreSQL 运行时保持一致语义。

### 3.2 不应该过度上推给框架

1. 不把计费规则 category / model / spec、Stripe livemode、金额校验、业务归属校验写成框架能力。
2. 不要求框架理解 idempotency key 的命名规则。
3. 不要求框架自动判断重复请求是否语义一致；这仍然属于业务 helper。
4. 不要求框架支持任意复杂业务 check DSL，例如“amountMinor 必须等于 Stripe retrieve 结果”。这应留在 guard。
5. 不要求框架在本任务里提供完整 migration 系统；migration 后续统一处理。
6. 不要求框架自动重试所有事务冲突。是否重试取决于业务语义，例如扣费规则 stale snapshot 可以由业务 helper 重算后重试，重复付款不能静默重试成另一笔订单。

---

## 4. medeo-lite 抽象出的通用不变量

### 4.1 幂等唯一

这类不变量表示“某个外部事实、业务请求或派生记录只能出现一次”。

需要框架支持的通用形式：

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

对应 medeo-lite 需求包括：

1. `CreditTopUp(idempotencyKey)`。
2. `CreditLedgerEntry(idempotencyKey)`。
3. `BillableUsageEvent(idempotencyKey)`。
4. `CreditCharge(idempotencyKey)`。
5. `StripeCreditCheckoutSession(idempotencyKey)`。
6. `StripeWebhookReceiptAttempt(attemptId)`。
7. `StripeWebhookAttemptResult(attemptId)`。
8. `StripeRechargePaymentEvent(stripeCheckoutSessionId)`。
9. `StripeRefundDisputeEvent(stripeEventId)`。

### 4.2 复合业务唯一

这类不变量表示“同一业务维度下某个 version / external id 不能重复”。

通用形式：

```ts
UniqueConstraint.create({
  name: 'BillingRuleVersion_business_version_unique',
  properties: ['category', 'model', 'spec', 'version'],
})
```

对应 medeo-lite 需求包括：

1. `RechargeRatePolicyVersion(currency, version)`。
2. `BillingRuleVersion(category, model, spec, version)`。
3. `CreditRechargePackageVersion(provider, currency, displayName, version)`；如果最终产品语义要求同名不同金额并行展示，也可以把 `amountMinor` 纳入业务 key。
4. `ExternalRechargeEvent(provider, providerTxnId)`。
5. `StripeCustomer(userId)`。
6. `StripeCustomer(stripeCustomerId)`。
7. `StripeCustomerCreationIntent(userId)`。
8. `StripeCustomerCreationIntent(creationAttemptId)`。
9. `StripeCreditCheckoutSession(checkoutAttemptId)`。

### 4.3 可空 / 未绑定外部 id 的唯一

Stripe Checkout Session 有一个典型模式：本地 quote intent 先创建，`stripeCheckoutSessionId` 初始为空；Stripe API 成功后再通过状态事件写入真实 `cs_...`。

业务语义是：

```text
StripeCreditCheckoutSession(stripeCheckoutSessionId) 唯一
但空值 / 未绑定状态不能参与唯一比较
```

这不是 Stripe 特例，而是外部系统集成常见模式。因此框架可以支持有限的 filtered unique constraint：

```ts
UniqueConstraint.create({
  name: 'StripeCreditCheckoutSession_stripeCheckoutSessionId_unique',
  properties: ['stripeCheckoutSessionId'],
  where: {
    stripeCheckoutSessionId: { notIn: [null, ''] },
  },
})
```

为了避免框架承载过多数据库方言，v1 只需要支持很小的过滤能力：

1. `isNull` / `isNotNull`。
2. `equals` / `notEquals`。
3. `in` / `notIn`。
4. 对字段之间比较、函数表达式、任意 SQL 片段暂不支持。

如果框架暂时不想支持 filtered unique，也应提供明确替代方案，例如把“外部 id 绑定”建模为单独实体 `StripeCheckoutSessionBinding(stripeCheckoutSessionId)`，再对该实体做普通唯一约束。但这会影响 interaqt 建模习惯，所以 filtered unique 是更自然的通用能力。

### 4.4 派生记录完整性

充值和扣费链路都不是只写一条记录，而是一条源事实派生多条账本记录：

```text
RecordBillableUsage
  -> BillableUsageEvent
  -> CreditCharge[]
  -> CreditLedgerEntry[]
  -> User.creditBalance Summation

RecordStripeCheckoutPaid
  -> StripeRechargePaymentEvent
  -> CreditTopUp
  -> CreditLedgerEntry
  -> User.creditBalance Summation
```

框架层通用不变量是：

> 一次 dispatch 被接受后，框架负责的事件落库和同步派生写入要么全部提交，要么全部回滚。

如果 `CreditLedgerEntry(idempotencyKey)` 唯一约束冲突，不能留下已经写入的 `CreditCharge` 或 `BillableUsageEvent` 半成品。

---

## 5. 框架 API 建议

### 5.1 Constraint 定义

建议新增通用 constraint 概念，而不是把唯一约束塞进 `Property.create({ unique: true })`。

原因：

1. 复合唯一是财务链路的核心需求，property-level `unique` 不够。
2. filtered unique 需要约束级 where 条件。
3. 未来如果支持 foreign key、check、普通 index，也可以复用同一聚合模型。

建议 API：

```ts
import { Entity, Property, UniqueConstraint } from 'interaqt'

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
    }),
  ],
})
```

`UniqueConstraint.create` 字段：

```ts
type UniqueConstraintArgs = {
  name: string
  properties: string[]
  where?: ConstraintPredicate
  violationCode?: string
}
```

约束要求：

1. `name` 必填，且在全 schema 内稳定唯一。数据库错误应能回溯到这个名字。
2. `properties` 只能引用当前 entity / relation 的持久化属性，不支持 computed property。
3. `where` 只支持有限谓词，避免业务 SQL 泄漏到底层框架。
4. `violationCode` 可选；未配置时框架返回通用 `UNIQUE_CONSTRAINT_VIOLATION`。

### 5.2 Relation 约束

relation 也应支持 constraint，因为 relation 在 interaqt 中同样是持久化记录。

通用例子：

```ts
Relation.create({
  source: User,
  sourceProperty: 'roles',
  target: Role,
  targetProperty: 'users',
  type: 'n:n',
  constraints: [
    UniqueConstraint.create({
      name: 'UserRole_pair_unique',
      properties: ['source.id', 'target.id'],
    }),
  ],
})
```

本次 medeo-lite 财务链路主要需要 entity unique；relation unique 可以作为同一抽象自然补齐，但不是本次业务的阻塞项。

### 5.3 Schema setup 支持

约束声明必须被 `controller.setup(true)` 和 `controller.setup()` 识别。

建议行为：

1. `setup(true)` 创建表时同步创建约束 / unique index。
2. `setup()` 在不重建表时验证约束是否存在；如果框架当前负责“补齐缺失 schema”，则幂等创建缺失约束；如果不负责，应返回明确诊断，不能静默继续。
3. PGLite / PostgreSQL 驱动都使用同一 constraint model 生成 DDL。
4. 约束安装必须幂等，重复 setup 不报错。
5. 约束命名应稳定，避免不同环境生成不同数据库对象名。

本任务不要求框架处理历史脏数据迁移。如果现有数据违反新约束，setup 可以失败并报告冲突数量 / 约束名，由后续 migration 统一清理。

### 5.4 结构化约束错误

数据库唯一冲突不能只暴露 driver 原始错误字符串。dispatch 应返回结构化错误：

```ts
{
  error: {
    type: 'constraint violation',
    code: 'UNIQUE_CONSTRAINT_VIOLATION',
    constraintName: 'CreditTopUp_idempotencyKey_unique',
    recordName: 'CreditTopUp',
    properties: ['idempotencyKey'],
    retryable: false,
  }
}
```

要求：

1. PostgreSQL / PGLite 的唯一冲突都映射到同一结构。
2. 如果约束配置了 `violationCode`，使用业务稳定 code。
3. 错误必须能从 `controller.dispatch()` 的 `result.error` 读取；如果 `forceThrowDispatchError` 开启，则 throw 的 error 也应保留同样字段。
4. 框架不要把唯一冲突自动转换成 duplicate success；业务 helper 需要读取既有记录并校验语义一致后才可返回 duplicate。

---

## 6. Dispatch 事务语义建议

### 6.1 事务边界

对一次 `controller.dispatch(eventSource, args)`，建议框架使用如下事务边界：

```text
begin transaction
  1. 执行 conditions / guard
  2. mapEventData
  3. 写入 EventSource 对应事件记录
  4. 执行由该写入同步触发的 Transform / StateMachine / Summation 等内部 computation
  5. 写入 computation 产生的 entity / relation / property 更新
commit
afterDispatch / 外部副作用在 commit 后执行
```

如果任一步出现错误：

```text
rollback
返回结构化 dispatch error
```

这样业务能依赖：

1. `RecordBillableUsage` 成功时，usage、charge、consume ledger 已经一致。
2. `RecordStripeCheckoutPaid` 成功时，payment event、top-up、ledger 已经一致。
3. 如果派生 ledger 写入因唯一约束失败，源事件也不会残留。

### 6.2 Computation 执行模式

当前 medeo-lite 测试中经常需要 `settle()` 等待 reactive computation 完成，这说明框架可能存在异步调度行为。财务账本类链路需要更强语义。

框架可以选择两种设计之一：

1. 默认所有由 dispatch 直接触发的持久化 computation 都在 dispatch 返回前完成并纳入同一事务。
2. 增加 computation 级别的强一致声明，例如 `Transform.create({ ..., consistency: 'transactional' })`，并要求声明为 transactional 的 computation 在 dispatch 事务内完成。

推荐默认采用第一种，因为 interaqt 的业务模型把 computation 当成事实派生，不应让普通业务开发者猜测哪些派生记录还没完成。若出于性能考虑保留异步调度，也必须让财务类模块能显式选择 transactional。

### 6.3 afterDispatch 与外部副作用

外部网络调用、webhook 响应、消息发送等不应被数据库事务包住。建议框架明确分层：

1. `guard`：事务内，落库前校验，可查询数据库，不产生外部副作用。
2. `mapEventData`：事务内，生成要持久化的事件数据，保持同步或可控 async。
3. computation：事务内，做框架管理的数据库派生。
4. `afterDispatch` / `RecordMutationSideEffect` 中的外部副作用：默认 commit 后执行。

如果 `RecordMutationSideEffect` 会写数据库，框架必须明确它是否纳入 dispatch 事务。建议：

1. 数据库派生优先使用 computation，不用 side effect。
2. side effect 默认 commit 后执行，不保证事务原子性。
3. 若框架允许 transactional side effect，需要显式声明，并禁止不可回滚外部 IO。

### 6.4 嵌套 dispatch

seed side effect 和业务 helper 中可能 dispatch 另一个 interaction / event source。框架应定义嵌套 dispatch 语义：

1. 默认不允许在事务内嵌套开启独立事务，避免半提交。
2. 如果在 computation 中 dispatch，应明确禁止或加入同一事务上下文。
3. 如果业务确实需要多个 dispatch 组成一个原子单元，框架可提供显式 `controller.transaction(async txController => { ... })`，但本次计费链路不要求。

本次 medeo-lite 更推荐把一个财务事实建模为一个 EventSource，然后用 computation 派生，不依赖嵌套 dispatch 原子性。

---

## 7. 业务 guard 与数据库约束的分工

### 7.1 guard 仍然必须存在

即使框架支持数据库唯一约束，业务 guard 仍然需要：

1. 校验调用者，例如必须是 `SYSTEM_USER_ID` 或 admin。
2. 校验目标用户存在。
3. 校验金额、credit、quantity 为正整数。
4. 校验 Stripe retrieved object 与本地 session 快照一致。
5. 校验扣费规则快照仍是当前规则。
6. 在重复请求时返回更友好的业务错误或 duplicate 结果。

数据库约束负责最终兜底，不能替代业务语义校验。

### 7.2 数据库约束负责最终不可破坏的不变量

这些不变量即使 `storage.create` 被测试、seed、脚本或 bug 直接调用，也必须被数据库阻止：

1. 同一 idempotency key 不重复。
2. 同一外部 transaction / checkout session 不重复入账。
3. 同一业务 key 下同一 version 不重复。
4. 同一 user 不出现多个 Stripe customer mapping。

### 7.3 并发冲突的业务处理

框架只需要返回结构化 constraint error，不应自行决定业务补偿。

业务层处理方式：

1. admin 发布规则 version 冲突：重新读取最新 version，重试整个 publish interaction 或提示管理员重试。
2. external recharge / Stripe webhook 重复：读取既有 payment/top-up/ledger，确认完整且语义一致后返回 duplicate / processed。
3. billable usage 重复：读取既有 usage、charge、ledger，确认 line items 和 metadata 一致后返回 duplicate。
4. 若既有状态不完整或不一致：返回 500 / failed，让人工排查或上游重试，不能静默补另一笔。

---

## 8. medeo-lite 约束声明示例

以下是框架支持后，credits 模块应该声明的约束示例。字段名仅表达需求，不代表最终 API 必须完全一致。

```ts
export const CreditTopUp = Entity.create({
  name: 'CreditTopUp',
  properties: [
    Property.create({ name: 'idempotencyKey', type: 'string' }),
    // ...
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'CreditTopUp_idempotencyKey_unique',
      properties: ['idempotencyKey'],
    }),
  ],
})

export const BillingRuleVersion = Entity.create({
  name: 'BillingRuleVersion',
  properties: [
    Property.create({ name: 'category', type: 'string' }),
    Property.create({ name: 'model', type: 'string' }),
    Property.create({ name: 'spec', type: 'string' }),
    Property.create({ name: 'version', type: 'number' }),
    // ...
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'BillingRuleVersion_business_version_unique',
      properties: ['category', 'model', 'spec', 'version'],
    }),
  ],
})

export const StripeCreditCheckoutSession = Entity.create({
  name: 'StripeCreditCheckoutSession',
  properties: [
    Property.create({ name: 'checkoutAttemptId', type: 'string' }),
    Property.create({ name: 'idempotencyKey', type: 'string' }),
    Property.create({ name: 'stripeCheckoutSessionId', type: 'string' }),
    // ...
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'StripeCreditCheckoutSession_checkoutAttemptId_unique',
      properties: ['checkoutAttemptId'],
    }),
    UniqueConstraint.create({
      name: 'StripeCreditCheckoutSession_idempotencyKey_unique',
      properties: ['idempotencyKey'],
    }),
    UniqueConstraint.create({
      name: 'StripeCreditCheckoutSession_stripeCheckoutSessionId_unique',
      properties: ['stripeCheckoutSessionId'],
      where: {
        stripeCheckoutSessionId: { notIn: [null, ''] },
      },
    }),
  ],
})
```

---

## 9. 最小框架验收标准

框架实现完成后，应能用与业务无关的测试证明以下能力。

### 9.1 唯一约束安装

1. `controller.setup(true)` 会创建单字段唯一约束。
2. `controller.setup(true)` 会创建复合唯一约束。
3. `controller.setup(true)` 会创建 filtered unique 约束。
4. 重复 `controller.setup()` 不会重复创建或报错。
5. PGLite 和 PostgreSQL 驱动行为一致。

### 9.2 唯一约束生效

1. 通过 `controller.dispatch()` 写入重复 key 时，第二次失败。
2. 通过 `system.storage.create()` 直接写入重复 key 时，同样失败。
3. filtered unique 允许多个空值，但不允许多个相同非空值。
4. 复合唯一只阻止同一组合，允许同一字段在不同组合中复用。

### 9.3 事务原子性

1. 一个 EventSource 派生两条记录，第二条触发唯一冲突时，源事件和第一条派生记录都回滚。
2. 一个 Interaction 触发 StateMachine 更新和 Transform 派生，Transform 写入失败时，InteractionEvent 和 StateMachine 更新都回滚。
3. `Summation` 所依赖的 ledger 写入失败时，聚合属性不会进入错误中间状态。
4. dispatch 返回成功时，同步派生记录已经可查询，不需要调用方靠 `setTimeout` / `settle()` 猜测。

### 9.4 错误结构

1. 唯一冲突返回 `UNIQUE_CONSTRAINT_VIOLATION`。
2. error 中包含 `constraintName`、`recordName`、`properties`。
3. `forceThrowDispatchError` 模式下 throw 出的错误也包含同样字段。
4. 不同 driver 的错误结构一致。

---

## 10. medeo-lite 回迁后的验收标准

等 interaqt 支持这些能力后，medeo-lite 应删除任何手写 database setup / DDL 方案，改为在 entity 定义中声明约束，并验证：

1. 并发重复 `AdminGrantCredit` 最终只产生一条 `CreditTopUp` 和一条 `CreditLedgerEntry`。
2. 并发重复 external recharge 最终只产生一条 `ExternalRechargeEvent`、一条 `CreditTopUp` 和一条 `CreditLedgerEntry`。
3. 并发重复 `RecordBillableUsage` 最终只产生一条 `BillableUsageEvent`、对应数量的 `CreditCharge` 和 consume ledger。
4. 并发重复 Stripe paid webhook 最终只产生一条 `StripeRechargePaymentEvent`、一条 `CreditTopUp` 和一条 ledger。
5. 并发发布同一 `(category, model, spec)` 的同一 next version 时，只有一个成功；失败方得到结构化唯一冲突。
6. quote intent 阶段允许多个 `stripeCheckoutSessionId = ''`；真实 `cs_...` 绑定后不允许重复。
7. `RecordBillableUsage` 成功返回后不需要额外 `settle()` 就能查到 charge 和 ledger。
8. 任何派生 ledger 唯一冲突都不会留下源事件半成品。

---

## 11. 不建议本次要求框架支持的能力

以下能力虽然长期可能有价值，但不应作为本次计费事务与约束需求的前置条件：

1. 完整 migration 规划、历史数据清洗和回滚脚本。
2. 任意 SQL expression index。
3. 跨实体复杂 check constraint，例如“CreditTopUp.credits 必须等于另一个实体快照计算结果”。
4. 悲观锁、余额锁定、预授权或 serializable 事务默认化。
5. 框架级 idempotency helper 自动返回 duplicate。
6. 框架级外部 webhook 处理语义。
7. 对所有 query 自动创建性能索引。

其中普通非唯一索引可以后续作为性能优化单独设计；它不是保证充值 / 扣费正确性的核心。

---

## 12. 推荐实施顺序

1. 在 interaqt core model 中加入 `Constraint` / `UniqueConstraint` 声明，并让 `Entity.create`、`Relation.create` 可携带 constraints。
2. 在 schema setup 层为 PGLite / PostgreSQL 生成唯一约束和 filtered unique DDL。
3. 在 storage / driver 层统一捕获唯一冲突，映射成结构化 constraint error。
4. 明确并实现 dispatch 事务边界，保证源事件和同步 computation 派生写入原子提交。
5. 补框架级 contract tests，先不绑定 medeo-lite 业务。
6. medeo-lite credits 模块把现有业务唯一性不变量声明为 constraints。
7. medeo-lite 增加并发重复 dispatch / webhook 测试，验证数据库约束兜底。

---

## 13. 结论

medeo-lite 对 interaqt 的合理框架诉求不是“让框架懂计费”，而是补齐响应式业务模型必须具备的通用一致性基础：

1. 用声明式唯一约束表达业务事实不可重复。
2. 用 dispatch 事务保证源事件和派生事实原子提交。
3. 用结构化约束错误把数据库兜底重新带回业务 helper。

计费金额、Stripe 验签、规则快照、重复请求语义一致性等仍然留在 medeo-lite 的 guard、helper 和 computation 中。这样既能解决财务链路的并发正确性，也不会把 medeo-lite 的业务概念污染到 interaqt 框架底层。
