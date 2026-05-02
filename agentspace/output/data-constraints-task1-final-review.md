# 数据约束支持计划 Task 1 最终 Review

## 1. Review 范围

本 review 针对 `agentspace/output/data-constraints-evaluation-and-support-plan.md` 当前版本进行复核，目标是判断该支持计划是否存在会导致方向不可采用、需求判断错误、架构冲突或实现后语义错误的致命问题。

复核依据包括：

1. `agentspace/prompt/medeo-lite-interaqt-transaction-constraints-requirements.md` 中抽象出的事务、唯一约束、过滤唯一约束和幂等需求。
2. 当前 interaqt core / runtime / storage / driver 代码事实。
3. 已有 `data-constraints-task1-deep-review.md` 和后续修订记录中提出的问题是否已被当前计划吸收。

## 2. 总结论

当前支持计划没有发现致命错误，可以作为后续实现的数据约束能力设计基础。

计划的核心方向是正确的：

1. medeo-lite 的并发幂等、外部事实去重、版本快照唯一性不是业务特例，而是通用的数据库唯一约束能力。
2. interaqt 的响应式模型要求 dispatch 接受后，源事件与同步派生记录具有明确事务边界。
3. guard / helper 只能提供友好错误和业务校验，不能替代数据库约束解决 TOCTOU。
4. 结构化约束错误是必要的，否则业务 helper 只能解析 driver message，无法稳定处理 duplicate / retry / failed 语义。

当前计划已经吸收了上一轮 review 中最关键的高风险点，包括 filtered unique 的 `null` 语义、relation `source` / `target` 表达、MySQL filtered unique capability、computation 错误包装、logical / physical constraint name 分离，以及 filtered / merged record 范围收窄。因此原先最接近致命的问题已经降级为需要实现时严格验证的 contract 风险。

## 3. 代码事实复核

### 3.1 Core 仍没有持久化约束模型

当前 `EntityCreateArgs` 和 `RelationCreateArgs` 没有 `constraints` 字段。`Entity.public.*.constraints` 和 `Relation.public.*.constraints` 是 Klass 元数据校验，不是数据库 schema 约束声明，也不会进入 storage setup。

因此计划提出新增 `UniqueConstraint` Klass，并让 `Entity` / `Relation` 挂载 `constraints?: ConstraintInstance[]`，符合当前架构缺口。

### 3.2 setup 仍以建表建字段为主

当前 `DBSetup.createTableSQL()` 只生成 `CREATE TABLE` 和 columns，不生成通用 unique index / partial unique index / check / foreign key。唯一索引只有 Transform 内部状态的专项后置逻辑：`MonoSystem.setupTransformUniqueIndexes()` 会按 computation state 创建 `CREATE UNIQUE INDEX IF NOT EXISTS`。

因此计划选择以独立 schema object / unique index 方式实现用户声明约束，而不是 inline `UNIQUE (...)`，与当前实现路径兼容。

### 3.3 dispatch 已有事务骨架，但 contract 仍需锁定

当前 `Controller.dispatch()` 使用 `runWithTransactionRetry()` 包裹 `system.storage.runInTransaction()`，事务内执行 guard、`mapEventData`、事件实体写入、`resolve` 和当前 `afterDispatch`。

`MonoStorage.callWithEvents()` 在事务内执行 mutation 后同步 `await this.dispatch(methodEvents)`，所以当前同步 record mutation listeners 和同步 computation 派生写入事实上会加入同一事务尝试。

计划要求把这个事实提升为 public contract，并用测试锁定，是合理的。尤其是 dispatch 成功返回后同步派生记录应可查询，失败时源事件和同步派生写入应整体回滚。

### 3.4 afterDispatch 语义冲突已经被识别

需求文档希望外部副作用在 commit 后执行；当前 `EventSource.afterDispatch` 实际在 dispatch transaction 内执行。当前计划已经明确要求拆分事务内 hook 与 post-commit side effect，不再把同一个名称同时承载两种语义。

这不是致命错误，但实现时必须保持兼容设计清晰：要么保留 `afterDispatch` 的事务内语义并新增 post-commit hook，要么迁移语义并提供明确升级路径。

### 3.5 driver 与错误模型判断基本准确

当前 `runWithTransactionRetry()` 只识别 PostgreSQL serialization / deadlock 类错误，例如 `40001` 和 `40P01`。唯一冲突尚未统一映射为框架错误。

当前 Scheduler 在 computation result application 失败时会包装为 `ComputationError` 并保留 `causedBy`，所以计划要求在 storage mutation 边界先转换为 `ConstraintViolationError`，再提供 `findConstraintViolationError(error)` 沿 error chain 查找，是必要且合理的。

## 4. 是否存在致命错误

没有发现致命错误。

具体判断如下：

1. **需求判断没有致命错误**：唯一约束、过滤唯一约束、dispatch 原子性和结构化错误都属于框架通用一致性能力，不是 medeo-lite 业务语义泄漏。
2. **API 方向没有致命错误**：使用独立 `UniqueConstraint` 而不是 `Property.unique`，能覆盖单字段、复合、过滤、命名和错误映射需求。
3. **storage 方向没有致命错误**：用 unique index / partial unique index 作为 DDL 主路径，与 filtered unique、幂等 setup 和现有 Transform unique index 路径相容。
4. **事务方向没有致命错误**：当前 runtime 已有事务与同步 listener 骨架，计划主要是补 contract、错误处理和边界测试，不是逆着架构重写。
5. **跨 driver 方向没有致命错误**：当前计划已经不再承诺 MySQL 必然支持 filtered unique，而是要求 capability 明确，不支持时 setup fail fast。

## 5. 非致命但必须守住的实现风险

### 5.1 filtered unique 的 null contract 必须作为公共语义

`{ op: 'notIn', value: [null, ''] }` 不能翻译成 SQL `NOT IN (NULL, '')`。当前计划已经修正为 `IS NOT NULL AND != ''` 等价语义。

实现时必须用 contract tests 覆盖：

1. `notIn` 包含 `null`。
2. `in` 包含 `null`。
3. `equals null` / `notEquals null`。
4. PostgreSQL / PGLite / SQLite 的一致行为。

### 5.2 relation 约束必须只公开稳定 DSL

当前计划选择 relation unique 使用 `properties: ['source', 'target']`，不公开 `source.id` / `target.id`。这是合理的，但实现必须保证 `EntityToTableMap` 能把它们解析到真实外键字段；无法解析时 setup 应失败，而不是生成错误 index。

### 5.3 filtered / merged record 范围不能半支持

当前计划已收窄为普通 entity / relation 必须支持，filtered / merged record 只有在规则明确时支持，否则 setup 失败。这个边界必须落实到校验逻辑。

尤其 filtered record 需要明确是否把 `matchExpression` 自动合入 index predicate；merged record 需要证明所有约束字段位于同一物理表。

### 5.4 error chain contract 不能只停留在文档

如果唯一冲突发生在 Transform / StateMachine / Summation 派生写入中，top-level error 可能是 `ComputationError`。业务仍需要稳定识别内部的 `ConstraintViolationError`。

因此必须同时实现：

1. storage mutation 边界的错误转换。
2. `ComputationError.causedBy` 保留约束错误。
3. `findConstraintViolationError(error)` 之类的 helper。
4. dispatch result / throw 模式下字段不丢失的测试。

### 5.5 setup(false) 的补齐行为要严格非 destructive

当前计划要求 `setup()` 在基础表存在时验证并幂等补齐 constraint index。这个方向可接受，但必须限制为非 destructive 行为，不做 alter/drop，不修复字段类型，不清理脏数据。

如果基础表缺失、字段缺失或已有数据违反约束，应返回明确 schema / constraint 诊断。

## 6. 建议最终处理

建议接受当前 `data-constraints-evaluation-and-support-plan.md` 作为实现依据，不需要推翻重写。

进入代码实现前，建议再做一次轻量设计冻结，明确以下 public contract：

1. `UniqueConstraint` 的最终 TypeScript 类型和 Klass 序列化格式。
2. relation 约束中 `source` / `target` 的唯一公开写法。
3. `ConstraintPredicate` 的 null 语义和参数化 SQL 生成规则。
4. `ConstraintViolationError` 的 public fields 与 error-chain helper。
5. MySQL filtered unique 的 capability 行为。
6. `afterDispatch`、post-commit side effect、async computation 的事务边界。
7. filtered / merged record 不支持时的 setup error 形态。

## 7. 最终判断

Task 1 的 review 结论是：当前支持计划方向正确，没有致命错误；此前最关键的风险点已经被修订吸收。

后续真正的风险主要来自实现阶段是否严格兑现 contract tests，尤其是 filtered unique null 语义、computation 派生写入错误识别、relation source/target 解析、MySQL capability fail fast，以及 setup 非 destructive 行为。只要这些点按当前计划落地，方案可以支撑 medeo-lite 财务链路所需的数据约束与事务一致性能力。
