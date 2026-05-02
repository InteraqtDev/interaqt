# 数据约束最终实现契约

## 1. 支持范围

当前数据约束实现提供框架级唯一约束能力：

1. Entity 级 `UniqueConstraint`。
2. Relation 级 `UniqueConstraint`。
3. 单字段唯一和复合唯一。
4. PostgreSQL / PGLite / SQLite filtered unique。
5. dispatch 事务内同步 computation 写入的唯一冲突回滚。
6. 结构化 constraint violation / setup error。
7. 只读 schema metadata。

暂不支持：

1. check constraint / foreign key / 普通性能索引。
2. filtered entity / filtered relation 上声明 constraints。
3. 无法解析到同一物理表字段的 merged relation constraints。
4. MySQL constraints。当前 MySQL driver 明确 fail fast，不静默降级。

## 2. Core API

用户通过 `UniqueConstraint.create()` 声明唯一约束：

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
      violationCode: 'CREDIT_CHARGE_DUPLICATE',
    }),
  ],
})
```

Relation 约束使用 relation record 上的持久化属性名。relation 端点只公开 `source` / `target`，不支持 `source.id` / `target.id`：

```ts
Relation.create({
  name: 'Membership',
  source: User,
  sourceProperty: 'memberships',
  target: Group,
  targetProperty: 'members',
  type: 'n:n',
  constraints: [
    UniqueConstraint.create({
      name: 'Membership_source_target_unique',
      properties: ['source', 'target'],
    }),
  ],
})
```

## 3. Filtered Unique

`where` 支持的 operator：

1. `isNull`
2. `isNotNull`
3. `equals`
4. `notEquals`
5. `in`
6. `notIn`

字段之间固定为 AND。`in` / `notIn` 数组不能为空。`null` 有明确 SQL 语义：

1. `{ op: 'equals', value: null }` -> `IS NULL`
2. `{ op: 'notEquals', value: null }` -> `IS NOT NULL`
3. `{ op: 'in', value: [null, 'x'] }` -> `IS NULL OR IN ('x')`
4. `{ op: 'notIn', value: [null, ''] }` -> `IS NOT NULL AND NOT IN ('')`

filtered predicate literal 由 `SchemaDialect.encodeLiteral` 负责编码。partial index predicate 在不同 driver 上不能可靠参数化，因此 literal encoding 不放在 `DBSetup` 中手写，而由 driver/dialect 集中负责。

## 4. Schema Setup

`setup(true)` 行为：

1. 打开数据库。
2. 创建 computation state table。
3. 创建 record tables。
4. 创建声明式 constraint indexes。
5. 初始化 record id sequences。
6. 建立 query handle 和 schema metadata。

`setup(false)` 行为：

1. 不 drop 表。
2. 不 alter/drop 已有 schema。
3. 幂等补齐声明式 constraint indexes。
4. 基础表缺失或已有脏数据违反约束时，抛出 `ConstraintSetupError`。

setup 阶段失败不会被包装成 runtime duplicate success，也不会尝试清理脏数据。脏数据修复属于 migration / 运维流程。

## 5. Schema Metadata API

`storage.schema` 提供只读 schema metadata 快照：

```ts
const schema = system.storage.schema

schema.dialect.name
schema.records
schema.tables
schema.constraints
```

字段含义：

1. `schema.dialect`：当前数据库 schema dialect，包括 identifier 长度、unique capability、filtered unique capability 和 literal encoder。
2. `schema.records`：record 到物理 table 的映射摘要，包括 `recordName`、`tableName`、`isRelation`、`isFiltered`、`attributes`。
3. `schema.tables`：物理表摘要，包括 `tableName` 和 `columns`。
4. `schema.constraints`：声明式 constraint metadata，包括 logical name、physical name、recordName、tableName、properties、fields、where、violationCode。

该 API 用于诊断、测试、migration 规划和错误映射，不应作为 mutation 入口。

## 6. 错误模型

### ConstraintViolationError

runtime mutation 违反唯一约束时抛出或返回 `ConstraintViolationError`：

```ts
error.name === 'ConstraintViolationError'
error.errorType === 'ConstraintViolationError'
error.context.code === violationCode || 'UNIQUE_CONSTRAINT_VIOLATION'
error.context.kind === 'unique'
error.constraintName
error.recordName
error.properties
```

如果冲突发生在同步 computation 派生写入中，顶层错误可能是 `ComputationError`。调用方应使用：

```ts
findConstraintViolationError(error)
```

沿 `causedBy` / `cause` 链查找稳定的 constraint error。

### ConstraintSetupError

setup 阶段创建约束失败时抛出 `ConstraintSetupError`：

```ts
error.name === 'ConstraintSetupError'
error.errorType === 'ConstraintSetupError'
error.context.code === 'CONSTRAINT_SETUP_FAILED'
error.constraintName
error.recordName
error.properties
error.context.physicalName
error.context.tableName
```

常见原因：

1. 基础表不存在。
2. 已有数据违反新增 unique index。
3. constraint 定义非法。
4. 当前 driver capability 不支持该约束。

### Database Error Normalization

底层 driver error 会先经过 `normalizeDatabaseError()` 归一化，再映射到 constraint registry。当前归一化字段包括：

1. `driver`
2. `message`
3. `rawCode`
4. `constraintName`
5. `tableName`
6. `fields`
7. `isUniqueViolation`

## 7. Dispatch 事务与 Post-Commit Hook

一次 dispatch 的事务内范围包括：

1. guard / conditions。
2. `mapEventData`。
3. event source entity 落库。
4. `resolve` 中的框架管理写入。
5. 同步 record mutation listeners。
6. 同步 computation 产生的 create / update / delete。
7. `afterDispatch`。

`afterDispatch` 明确是事务内 hook，可能因 transaction retry 被重放，不能执行不可逆外部 IO。

外部 IO 应放在 `postCommit`：

```ts
interaction.postCommit = async function(args, result) {
  await sendWebhook(result.data)
}
```

`postCommit` 在 dispatch transaction 成功 commit 后运行。若 `postCommit` 失败：

1. 不回滚已提交数据。
2. 不设置 `result.error`。
3. 错误记录在 `result.sideEffects.__postCommit.error`。

## 8. Driver Capability

当前 dialect capability：

1. PostgreSQL / PGLite：支持 unique 和 filtered unique。
2. SQLite：支持 unique 和 filtered unique。
3. MySQL：当前 constraints capability 为 unsupported，setup 时 fail fast。

MySQL 后续若要支持普通 unique，需要单独实现 MySQL schema dialect、identifier quoting、DDL idempotency 策略和集成测试；不能静默把 filtered unique 降级成普通 unique。

## 9. 验证覆盖

当前 tests 覆盖：

1. direct storage unique violation -> `ConstraintViolationError`。
2. PGLite / SQLite filtered unique null semantics。
3. relation `source` / `target` unique。
4. 同步 Transform 派生写入唯一冲突时 dispatch 整体回滚。
5. dispatch 默认 result 模式下 error chain 可识别。
6. `setup(false)` 基础表缺失 -> `ConstraintSetupError`。
7. 已有脏数据导致 unique index 创建失败 -> `ConstraintSetupError`。
8. 非法 where / computed property / 非法 relation path fail fast。
9. filtered record constraints fail fast。
10. merged relation endpoint 无法解析到物理字段 fail fast。
11. schema metadata 暴露 constraints / records / tables / dialect。
12. normalized database error shape。
13. dialect-owned literal escaping and all supported predicate operators.
14. `postCommit` 成功路径 context merge、失败不回滚、dispatch 失败时不运行。
15. schema metadata 的 record attributes、table columns、relation record、filtered record。
16. PostgreSQL 真实 unique violation raw shape 到 constraint registry 的映射。
