# 数据约束 Task 1 追加任务1处理记录

## 结论

已逐条复核 `data-constraints-task1-deep-review.md` 的意见。整体判断：review 中 10 条改进意见均成立，没有发现需要驳回的结论；其中 MySQL filtered unique、filtered/merged record 支持范围、computation 错误包装三处需要把原计划从“理想完整支持”收紧为“明确 capability / 错误链 / setup 失败语义”。

已直接修订原计划 `data-constraints-evaluation-and-support-plan.md`，重点修正 API contract、predicate null 语义、relation source/target 表达、MySQL 支持矩阵、setup 行为、错误模型和测试矩阵。

## 逐条处理

### 3.1 Relation 约束属性表示需要重新对齐

采纳。

原计划只说不使用 `source.id` / `target.id`，但没有给出用户侧替代写法，确实会让 relation-level unique API 不完整。

已在原计划中明确：

1. relation 约束公开使用 `properties: ['source', 'target']`。
2. `source` / `target` 是 relation 约束中唯一的特殊引用属性。
3. setup 阶段由 `EntityToTableMap` 解析为实际外键字段。
4. `source.id` / `target.id` 不作为公开 DSL，已有需求文档或业务代码应迁移到 `source` / `target`。

### 3.2 `ConstraintPredicate` 类型需要防止无效组合

采纳。

原计划中的 optional-operator object 允许同一字段同时出现多个 operator，容易产生 AND / OR / 非法输入的歧义。

已改为 discriminated union：

```ts
export type ConstraintPredicateOperator =
  | { op: 'isNull' }
  | { op: 'isNotNull' }
  | { op: 'equals'; value: ConstraintPredicateValue }
  | { op: 'notEquals'; value: ConstraintPredicateValue }
  | { op: 'in'; value: ConstraintPredicateValue[] }
  | { op: 'notIn'; value: ConstraintPredicateValue[] }
```

并补充静态校验：每个字段只能有一个 operator，多个字段之间固定为 AND。

### 3.3 `notIn` 包含 `null` 的语义要一等定义

采纳。

这是 filtered unique 正确性的核心。直接生成 `NOT IN (NULL, '')` 在 SQL 三值逻辑下语义错误。

已在原计划中补充 public null contract：

1. `{ op: 'notIn', value: [null, ''] }` 等价于 `IS NOT NULL AND != ''`。
2. `{ op: 'in', value: [null, 'x'] }` 等价于 `IS NULL OR = 'x'`。
3. `{ op: 'notEquals', value: null }` 等价于 `IS NOT NULL`。
4. `{ op: 'equals', value: null }` 等价于 `IS NULL`。
5. 所有 predicate literal 必须参数化。

测试矩阵也已补充 `where.notIn` / `where.in` 含 `null` 的 contract tests。

### 3.4 MySQL filtered unique 的承诺可能过重

采纳。

原计划对 MySQL filtered unique 的承诺过满，低估了 generated column、表达式索引、版本、collation、TEXT/BLOB 索引长度和错误诊断等差异。

已收紧为：

1. MySQL 必须支持普通 unique 和复合 unique。
2. MySQL filtered unique 只有在 driver 提供经过验证的 generated column 或表达式索引方案，并明确版本下限后才标记为支持。
3. 不满足 capability 时 setup 必须失败，不能静默降级。
4. core API 不暴露 MySQL 专用参数。

### 3.5 错误映射位置需要覆盖 computation 包装错误

采纳。

review 指出的问题成立：同步 computation 写入失败可能被 `ComputationError` 包装，仅在 controller 外层识别 raw driver error 不够稳定。

已在原计划中明确：

1. storage mutation 边界先把 driver unique violation 转换为 `ConstraintViolationError`。
2. computation 包装时必须通过 `causedBy` / `cause` 保留该错误。
3. 提供 `findConstraintViolationError(error)` 之类的 helper 沿错误链查找。
4. 是否 unwrap 成 dispatch 顶层错误需要产品 contract 明确；不 unwrap 也可以，但必须可结构化识别。

### 3.6 `ConstraintViolationError` 字段设计应贴合现有 `FrameworkError`

采纳。

原计划同时使用 `code`、`retryable`、`driver`、`rawCode` 等字段，但没有说清它们与 `FrameworkError.errorType` / `context` / `causedBy` 的关系。

已修订为：

1. `error.name === 'ConstraintViolationError'`。
2. `error.errorType === 'ConstraintViolationError'`。
3. `error.context.code` 保存默认 code 或用户声明的 `violationCode`。
4. `error.context.kind === 'unique'`。
5. `constraintName`、`recordName`、`properties` 是稳定 public fields。
6. driver 原始信息只放入 `driver` / `rawCode` / `causedBy`，业务不需要解析。
7. 不额外引入 `error.code` 作为第二套业务 code。

### 3.7 `setup()` 行为要尊重现有 install 语义

采纳。

原计划对 `setup()` 补齐 index 的行为写得过宽，没有区分基础表是否已经安装，也没有限制非 destructive 行为。

已修订为：

1. `setup(true)` 是完整安装路径，建表后创建 constraints。
2. `setup()` 只在基础表已存在时验证并幂等补齐声明式 constraint index。
3. 基础表缺失时报 schema-not-installed 类错误。
4. `setup()` 不做 alter/drop，不修复字段类型或已有脏数据。
5. Transform 内部 unique index 和用户声明 constraint index 后续应复用同一 schema object builder。

### 3.8 约束名全局唯一与物理名截断策略要具体化

采纳。

直接要求用户声明的 `name` 满足所有 driver identifier 限制会把数据库细节泄漏到 core API。

已修订为：

1. `constraintName` 是 logical name，schema 内唯一，用于错误和文档。
2. `physicalName` 是 driver-safe 数据库对象名，可 hash / 截断，但必须稳定。
3. `ConstraintSchemaItem` 同时保存 logical name 和 physical name。
4. registry 同时支持 physical name 和 table/fields fallback 映射。

### 3.9 filtered / merged record 约束范围可以先收窄

采纳。

原计划对 filtered / merged record 的承诺偏理想化。filtered record 是否自动 AND `matchExpression`，merged record 字段是否位于同一物理表，都不能靠模糊描述带过。

已收紧为：

1. 普通 entity / relation 必须完整支持。
2. filtered entity / relation 支持前，必须定义是否把 `matchExpression` 合入 index predicate；未实现时 setup 明确失败。
3. merged entity / relation 必须证明所有约束字段位于同一物理表，否则 setup 失败。
4. 不允许半支持或静默忽略。

### 3.10 测试矩阵还缺少几个关键 case

采纳。

已补充测试矩阵：

1. `where.notIn` 含 `null`。
2. `where.in` 含 `null`。
3. 同字段多个 predicate operator 报错。
4. relation-level `source` / `target` unique。
5. Transform 派生写入唯一冲突时源事件回滚且错误可识别。
6. StateMachine property update 唯一冲突时整体回滚。
7. 已有冲突数据导致 setup 创建 index 失败时包含 logical constraint name。
8. 物理 index 名 hash / 截断后仍映射回 logical constraint name。

## 最终判断

`data-constraints-task1-deep-review.md` 的意见整体可靠，主要价值是把原计划从“方向正确”推进到“API、driver、错误和测试 contract 足够精确”。原计划已按这些意见修订，可以作为后续代码实现的更稳妥依据。
