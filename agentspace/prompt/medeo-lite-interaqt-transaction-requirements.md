# Interaqt 数据库事务能力需求

## 背景

`medeo-lite` 的积分充值、扣费和 Stripe 自助充值都已经按照 interaqt 的响应式范式设计：外部事实或用户意图先进入 `Interaction` / 自定义 `EventSource`，再由 `Transform`、`StateMachine`、`Summation` 等 computation 派生业务记录和查询状态。

这些计划中原本希望补上的“数据库事务”和“约束”不应该由 `modules/credits`、Stripe integration 或各 component 手写数据库补丁实现。业务模块可以声明事实、幂等键、快照和派生规则，但一次 dispatch 内的数据原子性应该由 interaqt 框架统一保证。

本文只讨论事务语义和 dispatch 一致性。migration、唯一索引、外键、普通索引、partial unique index、声明式 key constraint 等能力暂不纳入本次要求，后续统一设计。

## 当前 interaqt 模型理解

`Interaction` 表示用户意图。conditions 通过后，框架会持久化 `InteractionEventEntity`，下游 computation 可以监听该事件派生数据。conditions 拒绝时，不应落 `InteractionEventEntity`，下游 computation 也不应触发。

自定义 `EventSource` 表示非公开用户交互的系统事实，例如 webhook、内部用量上报、worker 事件。它有自己的 event entity，不应写入 `InteractionEventEntity`。`guard` 负责入库前校验，`mapEventData` 负责把 dispatch args 转成事件记录，`resolve` / `afterDispatch` 可用于返回数据或派生副作用结果。

`Transform`、`StateMachine`、`Summation` 等 computation 是声明式派生规则。业务代码不应该在 custom API、component 或 helper 中直接写 `CreditTopUp`、`CreditLedgerEntry`、`User.creditBalance` 这类派生数据。

因此，业务真正需要的不是“开放任意事务 API 给模块手写 SQL”，而是让 `controller.dispatch()` 成为一个可靠的事务边界。

## 业务需求抽象

### 1. 一次 dispatch 的事实和派生数据必须原子提交

当业务 dispatch 一个 `Interaction` 或 `EventSource` 时，以下内容必须处于同一个数据库事务中：

1. `guard` / conditions 的校验读取。
2. event record 的创建，例如 `InteractionEventEntity`、`BillableUsageEvent`、`StripeRechargePaymentEvent`。
3. 由该 event 同步触发的 `Transform` 派生 entity / relation 创建。
4. 由该 event 或派生记录同步触发的 `StateMachine` 属性更新。
5. 由派生记录同步触发的聚合更新，例如 `User.creditBalance` 的 `Summation`。

如果其中任一步失败，本次 dispatch 必须整体回滚。调用方不能看到“event 已创建但 charge 没有创建”“top-up 已创建但 ledger 没有创建”“ledger 已创建但 balance 没更新”这类半成品状态。

典型业务链路：

- `RecordBillableUsage` 成功时，应原子产生 `BillableUsageEvent`、多条 `CreditCharge`、多条 consume `CreditLedgerEntry`，并更新 `User.creditBalance`。
- `RecordStripeCheckoutPaid` 成功时，应原子产生 `StripeRechargePaymentEvent`、`CreditTopUp`、正向 `CreditLedgerEntry`，并更新 `User.creditBalance`。
- `AdminGrantCredit` 成功时，应原子产生 `InteractionEventEntity`、`CreditTopUp`、`CreditLedgerEntry` 和余额变化。

### 2. guard、mapEventData 和 computation 必须看到一致的事务视图

业务 guard 经常需要读取当前状态并校验快照，例如：

- webhook 入账前确认 Checkout Session 还没有 paid。
- 用量上报前确认当前 `BillingRuleVersion` 与 payload 中冻结的规则快照一致。
- 充值回调前确认当前 `RechargeRatePolicyVersion` 与 payload 中冻结的比例快照一致。

框架应保证同一次 dispatch 内，`guard`、`mapEventData` 和同步 computation 使用同一个事务上下文，不要让后续步骤脱离 guard 的读取上下文单独提交。

这不等于要求框架替业务判断“什么是当前规则”或“什么字段必须匹配”。这些仍由业务 guard 声明。框架只负责让这些校验和后续写入同生共死。

### 3. dispatch 返回时，同步派生应已经完成

对 custom API、webhook handler 和内部 helper 来说，`controller.dispatch()` 成功返回意味着同步响应式链路已经收敛到可查询状态。

例如 Stripe webhook 只有在确认入账事实、top-up、ledger 和余额更新都已经提交后，才能安全向 Stripe 返回 2xx。`recordBillableUsage()` 处理重复请求时，也需要能在 dispatch 完成后查询既有 `BillableUsageEvent`、`CreditCharge` 和 `CreditLedgerEntry` 来判断重复请求是否完整完成。

因此，框架应区分：

- 同步数据派生：必须在 dispatch 事务内完成。
- 外部副作用或异步任务：不应混入 dispatch 事务，可由 post-commit hook、outbox 或 integration worker 处理。

### 4. 失败不能留下可被下游消费的事件

如果 guard 拒绝、mapEventData 抛错、computation 抛错或数据库写入失败，框架不能留下已创建的 event record，也不能触发后续 side effect 认为事实已经成立。

这对财务链路尤其重要。比如 `RecordBillableUsage` 如果因为某条 line item 规则快照过期而失败，不能先落 `BillableUsageEvent` 再让 charge 派生失败；否则后续重复请求会误以为该 usage 已经处理过。

### 5. 事务边界不能包含外部网络调用

业务计划中的 Stripe Checkout 创建、Stripe webhook retrieve、provider 调用、Restate submit 等外部操作不应由 interaqt 事务包裹。

正确边界是：

- 外部调用前需要冻结本地意图时，先 dispatch 一个本地事实并提交。
- 外部调用完成后，再 dispatch 一个结果事实并提交。
- webhook 或 provider 回调进入系统时，先完成验签和必要的外部 retrieve，然后 dispatch 被验证后的业务事实。

框架需要提供清晰的 post-commit 语义，而不是鼓励业务在 transaction callback 内做网络 I/O。

### 6. 可重试错误需要结构化返回

业务 helper 需要区分可重试和不可重试错误。例如计费用量 helper 在规则快照过期时只重试 `STALE_BILLING_RULE_SNAPSHOT`，但重复幂等键、缺规则、非系统用户、篡改快照等错误都不能重试。

框架应保留或增强 dispatch 的结构化错误返回能力：

- 默认不抛异常，返回 `result.error`。
- error 可携带稳定 `code`。
- 回滚后的错误仍能被调用方识别。
- `forceThrowDispatchError` 这类模式不应破坏错误 code。

这仍然不要求框架理解 billing 领域错误。框架只需要稳定传递业务 guard / computation 抛出的结构化错误。

## 框架能力建议

### 1. `controller.dispatch()` 内建事务

`controller.dispatch(eventSource, args)` 应默认创建事务上下文，并将本次 dispatch 的所有同步读写绑定到同一个上下文。概念流程：

```text
begin transaction
  run conditions / guard
  create event record
  run synchronous computations until mutation queue settles
  collect dispatch data / side effects metadata
commit transaction
run post-commit hooks
return dispatch result

on error:
  rollback transaction
  skip post-commit hooks
  return structured error
```

这个能力应在框架层统一实现，业务模块不直接拿数据库连接手写 `BEGIN` / `COMMIT`。

### 2. storage 和 scheduler 需要共享事务上下文

事务不能只包住 event record 的创建。`guard` 中通过 `this.system.storage.findOne()` 的读取、`Transform` callback 里的读取、StateMachine 更新、relation 创建和聚合更新，都必须使用同一个 transaction-bound storage。

如果框架内部有 mutation scheduler，应确保 scheduler 在同一个事务上下文中 drain 完同步 mutation queue。不能先提交 event，再用另一个事务异步补派生数据。

### 3. 明确同步 computation 和 post-commit side effect 的边界

建议框架把 dispatch 内部过程分为三类：

1. `guard` / `mapEventData` / synchronous computation：事务内执行，可读写数据库，失败则回滚。
2. post-commit callback：只在 commit 成功后执行，适合触发 outbox、通知、非关键返回附加信息。
3. async worker / integration：由已经提交的事实驱动，失败时通过新的 EventSource 记录结果。

如果现有 `afterDispatch` 在事务提交前执行，应调整或新增 `afterCommit`。对财务类链路，调用方必须能选择“只在数据 commit 后才执行后续动作”。

### 4. 支持嵌套 dispatch 的明确策略

业务代码应避免在 computation 中再次 dispatch；但 seed side effect、helper 或 integration handler 可能连续 dispatch 多个事实。

框架需要明确：

- 一个 dispatch 内是否允许嵌套 dispatch。
- 如果允许，嵌套 dispatch 是复用外层事务、创建 savepoint，还是直接拒绝。
- 如果拒绝，错误要稳定，避免业务误以为嵌套 dispatch 是安全的事务组合方式。

对当前 medeo-lite 计费链路，推荐先不支持 computation 内嵌套 dispatch；多个事实之间需要事务性组合时，应重新建模为一个 EventSource 事实和下游 computation，而不是业务层包多个 dispatch。

### 5. 支持数据库驱动的事务能力探测

interaqt 支持不同数据库驱动。框架应在 setup 或运行时验证驱动是否实现了真实事务能力：

- 支持 `beginTransaction` / `commitTransaction` / `rollbackTransaction`。
- 同一 dispatch 内所有 storage 操作使用同一连接或同一事务 handle。
- 驱动不支持真实事务时，应显式报错或标记为不支持财务强一致链路。

不能让某个驱动把 transaction 方法实现成 no-op，同时业务仍以为财务 dispatch 是原子的。

### 6. 与原子条件事件能力保持兼容

Task 1 已经提出了自定义 EventSource 的原子 claim / compare-and-set 能力。那是事务能力之上的并发互斥语义，适用于 outbox worker 抢占任务。

本需求不重复展开 claim API，但 dispatch 事务应成为它的基础：条件检查、事件创建、状态转移和返回 `{ applied: true | false }` 必须在同一个事务中完成。

## 不应交给框架的内容

以下内容仍应留在业务模块：

1. 计费 category、model、spec、unitLabel 的含义。
2. Stripe runtimeMode、livemode、金额、币种、customer、PaymentIntent 的校验。
3. 缺规则是否拒绝、规则快照如何计算、哪些错误可重试。
4. webhook 是否返回 2xx、哪些 Stripe event 需要审计。
5. 余额不足 pre-flight 的业务门槛。
6. seedRevision 如何表达运营初始化语义。

框架不应该内建 credits、Stripe、billing rule、ledger 等概念。框架只提供“事实 dispatch 的事务性”和“声明式派生的一致执行”。

## 暂不纳入本次的能力

以下内容虽然对最终并发安全很重要，但按 Task 2 约束暂不在本文展开：

1. 声明式唯一约束和唯一索引。
2. foreign key / relation-level 数据库约束。
3. 普通索引、partial index、表达式索引。
4. migration 生成、迁移顺序、线上 schema 变更流程。
5. key constraint 与业务幂等键的统一声明 API。

在这些能力补齐前，业务 guard 可以继续做友好错误检查和幂等查询，但这只能提供业务层不变量表达，不能替代数据库并发唯一性。

## 验收测试建议

框架层至少需要增加以下测试：

1. `Interaction` conditions 拒绝时，不创建 `InteractionEventEntity`，下游 `Transform` / `StateMachine` 不触发。
2. 自定义 `EventSource.guard` 拒绝时，不创建自定义 event entity，下游 computation 不触发。
3. event record 创建后，如果下游 `Transform` 抛错，本次 dispatch 整体回滚，event record 不存在。
4. 多级派生链路成功时，dispatch 返回前 event、derived entity、relation、StateMachine 属性和 Summation 结果都可查询。
5. 多级派生链路中任一级失败时，所有前序写入回滚。
6. post-commit hook 只在 commit 成功后执行；事务回滚时不执行。
7. post-commit hook 失败不回滚已经 commit 的业务事实，但错误要以明确位置返回或记录。
8. 同一个 dispatch 中 `guard`、`mapEventData`、Transform callback 读取同一事务上下文。
9. 驱动事务方法为 no-op 或不支持真实事务时，框架能在强事务测试中失败，而不是静默通过。
10. 两个 controller 连接同一数据库并发 dispatch 财务类事件时，不出现半成品派生状态；唯一性冲突的最终处理留给后续 key constraint 能力测试。

## 对 medeo-lite 后续计划的影响

在 interaqt 提供并验证上述事务语义前，`medeo-lite` 不应在 credits 或 Stripe 业务模块里补手写 database setup、手写事务 wrapper 或 component 专用 DDL。

短期内业务计划可以继续通过 guard、快照、幂等键和 focused test 表达不变量；真正的“dispatch 内原子提交”和“失败无半成品”应作为 interaqt 的框架能力补齐。这样未来充值、扣费、Stripe、LRO outbox 和其他系统事件都能复用同一套事务协议，而不是每个模块各自绕开响应式模型实现一次。
