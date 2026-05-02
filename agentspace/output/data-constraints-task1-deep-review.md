# 数据约束支持计划 Task 1 深度 Review

## 1. Review 结论

`agentspace/output/data-constraints-evaluation-and-support-plan.md` 的主判断是正确的：medeo-lite 抽象出的需求本质上是 interaqt 框架级一致性能力，应该通过声明式唯一约束、dispatch 事务语义和结构化约束错误来支持，而不应该把 Stripe、充值、扣费等业务语义上推到框架层。

本次 review 没有发现会推翻整体方向的致命错误。文档对当前代码事实的核心描述基本成立：

1. `Entity` / `Relation` 目前没有持久化数据库约束模型。
2. `DBSetup` 主要负责表、字段和 record/table 映射，不生成通用唯一约束。
3. `Controller.dispatch()` 已经把 guard、`mapEventData`、事件落库、`resolve`、`afterDispatch` 放在同一个 retryable transaction attempt 内。
4. `MonoStorage.callWithEvents()` 在事务内同步 `await` mutation listeners，因此当前同步 computation 派生写入事实上会加入同一事务。
5. driver 层尚未把唯一约束错误统一映射成框架错误。

但计划文档里有几处需要在正式实现前修正或补强，否则容易导致 API 不一致、跨数据库语义不一致，或实现范围被低估。

## 2. 是否存在致命错误

没有发现“需求不合理”“方案方向错误”或“与当前架构完全冲突”的致命问题。

最接近致命风险的是 filtered unique 的 SQL 三值逻辑和跨 driver 支持。如果实现时直接把：

```ts
where: {
  stripeCheckoutSessionId: { notIn: [null, ''] },
}
```

翻译成：

```sql
"stripeCheckoutSessionId" NOT IN (NULL, '')
```

语义就是错的，因为 SQL 中 `NOT IN (NULL, ...)` 通常会得到 unknown，而不是“非 null 且非空”。计划文档的 SQL 示例写成了 `IS NOT NULL AND != ''`，这是正确方向，但 API DSL 到 SQL 的翻译规则需要明确写入方案和测试矩阵。否则 filtered unique 会成为一个看起来支持、实际不生效的高风险能力。

## 3. 值得改进的地方

### 3.1 Relation 约束属性表示需要重新对齐

需求文档中的 relation 示例使用：

```ts
properties: ['source.id', 'target.id']
```

而支持计划在 `5.3` 中建议 relation 约束“不使用 `source.id` / `target.id` 这类路径表达”，改为由 `EntityToTableMap` 解析 relation record 上实际存在的持久化字段。

这个调整有合理性，因为当前 relation record 内部确实通过 `source` / `target` record attributes 管理物理字段，且字段名会受 merge 策略影响。但计划文档没有给出新的用户侧写法，容易让实现和需求脱节。

建议明确其中一种 API：

1. 支持 `properties: ['source', 'target']` 作为 relation record 的特殊持久化引用属性。
2. 或继续支持 `source.id` / `target.id`，但在 constraint resolver 中把它们规范化为 relation record 的 `source` / `target` 外键字段。

不建议只说“不要用 `source.id` / `target.id`”却不给替代写法。relation 是 interaqt 的一等 record，relation-level unique 是本需求明确范围，用户侧 API 必须稳定。

### 3.2 `ConstraintPredicate` 类型需要防止无效组合

计划中的类型允许同一字段同时出现多个 operator：

```ts
type ConstraintPredicateOperator = {
  isNull?: true
  isNotNull?: true
  equals?: string | number | boolean | null
  notEquals?: string | number | boolean | null
  in?: Array<string | number | boolean | null>
  notIn?: Array<string | number | boolean | null>
}
```

这会产生语义歧义，例如 `{ isNull: true, notEquals: '' }` 到底是 AND、OR，还是非法输入。框架级 API 应该避免这种宽松结构。

建议改成 discriminated union 或在 `UniqueConstraint.create()` / setup validation 中强制“每个字段只能有一个 operator”。如果允许多个字段，则字段之间应明确是 AND。复杂 OR、字段间比较、函数表达式继续不支持。

### 3.3 `notIn` 包含 `null` 的语义要一等定义

需求里的典型 filtered unique 是“允许多个 null / 空字符串，不允许重复非空外部 id”。这不是普通 `NOT IN` 能自然表达的语义，尤其当集合里包含 `null` 时。

建议在计划中明确：

1. `{ notIn: [null, ''] }` 必须生成等价于 `IS NOT NULL AND != ''` 的谓词。
2. `{ in: [null, 'x'] }` 必须生成等价于 `IS NULL OR = 'x'` 的谓词。
3. 所有 predicate builder 必须参数化字面量，不能拼接用户值。
4. PostgreSQL/PGLite/SQLite/MySQL 都要用同一组 null contract tests。

这是约束能力的正确性核心，应该从“实现细节”提升为设计约束。

### 3.4 MySQL filtered unique 的承诺可能过重

计划要求 MySQL driver 也通过 generated column 或表达式索引提供 filtered unique 的一致语义。方向上可以理解，但实现风险被低估了：

1. 当前 MySQL driver 还没有 `runInTransaction()`，整体事务能力已经弱于 PostgreSQL/PGLite/SQLite 路径。
2. MySQL 对 generated column、functional index、TEXT/BLOB 索引长度、collation、null 唯一语义和版本能力都有额外限制。
3. 如果为了 filtered unique 引入隐藏 generated columns，就会牵涉 schema introspection、命名、drop/alter、冲突诊断和 migration 兼容。

建议把方案改成更精确的 driver support matrix：

1. PostgreSQL/PGLite/SQLite 必须完整支持普通 unique、复合 unique、filtered unique。
2. MySQL 必须完整支持普通 unique、复合 unique。
3. MySQL filtered unique 要么给出经过验证的 generated-column 设计和版本下限，要么在 setup 时明确失败，不静默降级。

这仍然保持 public API 一致，但避免把 v1 的实现范围扩大到不确定的 MySQL DDL 兼容工程。

### 3.5 错误映射位置需要覆盖 computation 包装错误

计划建议在 storage/driver 边界映射数据库错误，这个方向是对的。但当前同步 computation 写入失败时，`Scheduler.runDirtyRecordsComputation()` 会把 result application 阶段的异常包装成 `ComputationError`。

如果唯一冲突发生在 Transform / StateMachine / Summation 派生写入中，最终 dispatch error 可能是：

```text
ComputationError
  causedBy: raw driver unique violation
```

因此仅在 `Controller.dispatch()` 外层识别 raw driver error 不够；仅在 driver 层抛 raw error 也不够。建议约束错误在 storage mutation 边界就转换为 `ConstraintViolationError`，并让 `ComputationError` 保留它作为 `causedBy`。同时提供 helper 从 error chain 中识别 `ConstraintViolationError`，保证业务 helper 可以稳定拿到 `violationCode`、`constraintName`、`recordName` 和 `properties`。

如果产品语义希望 dispatch 的 top-level `result.error` 直接是 `ConstraintViolationError`，那还需要定义是否要 unwrap computation errors。这个选择必须明确，否则“结构化约束错误”在派生写入场景中会被框架错误包住，调用方处理会不一致。

### 3.6 `ConstraintViolationError` 字段设计应贴合现有 `FrameworkError`

计划里写的 context 包含 `code`、`retryable`、`driver`、`rawCode` 等字段，但当前 `FrameworkError` 已有 `errorType`、`context`、`causedBy`、`toJSON()` 等结构。

建议把 public contract 明确为：

1. `error.name === 'ConstraintViolationError'`。
2. `error.errorType === 'ConstraintViolationError'` 或稳定等价值。
3. `error.context.code` 保存 `UNIQUE_CONSTRAINT_VIOLATION` 或用户声明的 `violationCode`。
4. `error.context.kind === 'unique'`。
5. `error.context.constraintName`、`recordName`、`properties` 稳定可依赖。
6. driver 原始信息放在 `rawCode` / `driver` / `causedBy`，但不要让业务必须解析它。

不要同时引入多个“code”层级，避免业务侧不知道该读 `error.code`、`error.context.code` 还是 `error.errorType`。

### 3.7 `setup()` 行为要尊重现有 install 语义

计划建议 `setup(true)` 创建约束，`setup()` 校验或补齐缺失 index。这个方向可以接受，但需要结合当前行为写清楚。

当前 `Controller.setup(install)` 会把 `install` 传给 `system.setup()` / `storage.setup()`，而 `MonoSystem.setup()` 无论 install 与否都会调用 `setupTransformUniqueIndexes(states)`。也就是说，当前 transform unique index 已经是 “setup 后置 schema object” 风格，但这也意味着如果表不存在，普通 `setup()` 可能会在建 index 时失败。

建议补充：

1. `setup(true)` 是完整安装路径，必须建表后建 constraints。
2. `setup(false)` 只能在表已存在时验证/补齐 constraints；若基础表缺失，应报清晰 schema-not-installed 错误。
3. 补齐缺失 index 是否属于非 migration 行为，需要与现有框架约定对齐；如果允许补齐，应只补齐声明式 constraint index，不做 destructive alter。
4. transform unique index 和用户声明 constraint index 最好走同一个 schema object builder，避免两套路由产生不一致命名和错误处理。

### 3.8 约束名全局唯一与物理名截断策略要具体化

计划要求约束名全 schema 唯一，这是正确的。但 PostgreSQL identifier 只有 63 字节限制，MySQL/SQLite 也有各自限制；当前代码中 transform unique index 使用 hash 生成物理名，PostgreSQL sequence 也有 sanitize/hash 策略。

建议区分：

1. logical constraint name：用户声明，schema 内唯一，用于错误和文档。
2. physical index name：driver-safe，可 hash，可截断，但必须稳定。

错误映射 registry 应同时保存 logical name 和 physical name。不要要求用户的 `name` 直接满足所有数据库 identifier 限制，否则 API 会暴露过多 driver 细节。

### 3.9 filtered / merged record 约束范围可以先收窄

计划要求 filtered entity/relation 和 merged entity/relation 都要正确解析到物理表。这是理想目标，但实现复杂度较高，尤其是：

1. filtered record 与 base record 共享物理表时，constraint 的 `where` 是否需要自动 AND 上 filtered `matchExpression`。
2. merged record 中约束属性可能落在同一行，也可能因为 merge 失败或 link 隔离而不在同一物理表。
3. 同一个 base table 上多个 filtered record 的唯一约束可能需要不同 predicate，物理 index 不能仅按 recordName 推断。

建议把可交付范围写得更保守：

1. 普通 entity/relation 必须支持。
2. filtered record 支持前，必须明确定义是否把 filter predicate 作为 index predicate 的一部分。
3. merged record 若无法证明所有约束字段位于同一物理表，setup 失败。
4. 如果本次不完整支持 filtered/merged 上声明 constraints，应明确报错，而不是半支持。

### 3.10 测试矩阵还缺少几个关键 case

建议在现有测试矩阵中补充：

1. `where.notIn` 含 `null` 的语义测试。
2. `where.in` 含 `null` 的语义测试。
3. 同字段多个 predicate operator 应报错。
4. relation-level unique 的 source/target 唯一测试。
5. 唯一冲突发生在同步 Transform 派生写入中时，源事件回滚且错误可结构化识别。
6. 唯一冲突发生在 StateMachine property update 中时，源事件和已执行写入回滚。
7. 已有冲突数据导致 setup 创建 unique index 失败时，错误包含 logical constraint name。
8. 物理 index 名 hash/截断后，错误仍能映射回 logical constraint name。

## 4. 建议修改后的优先级

建议把计划文档中的交付顺序调整为：

1. 先定 API contract：`UniqueConstraint`、relation source/target 表达、predicate 精确语义、错误字段。
2. 再做 schema metadata：logical/physical constraint registry、property 到 field 解析、普通 record 范围。
3. 先完成 PostgreSQL/PGLite/SQLite 的普通 unique、复合 unique、filtered unique。
4. 同步完成 storage mutation 边界的 `ConstraintViolationError` 映射。
5. 再用 dispatch contract tests 锁定同步 computation 事务原子性。
6. 最后决定 MySQL filtered unique 是完整支持还是 setup capability error。

## 5. 最终判断

这份支持计划可以作为实现基础，但应在进入代码实现前修订上述问题。尤其需要先修正 filtered unique 的 null 语义、relation 约束 API、错误包装/识别方式和 MySQL 支持口径。

如果这些点不修正，最可能出现的问题不是“代码写不出来”，而是框架公开了一个看似通用的约束 API，却在 relation、filtered unique、派生写入错误处理和跨 driver 行为上产生不一致。这对 interaqt 这样的框架级项目风险较高。
