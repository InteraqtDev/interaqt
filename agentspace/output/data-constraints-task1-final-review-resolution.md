# 数据约束 Task 1 最终 Review 逐条处理记录

## 结论

已逐条复核 `agentspace/output/data-constraints-task1-final-review.md` 对 `agentspace/output/data-constraints-evaluation-and-support-plan.md` 的意见。

总体判断：最终 review 的意见成立，没有发现需要驳回的结论。它没有要求推翻原计划，而是确认当前计划已经吸收前序高风险问题，并建议进入代码实现前冻结若干 public contract。

本次已修订原计划，新增“实施前 public contract 冻结清单”，把 final review 中要求实现前明确的 contract 从建议提升为计划正文的一部分。

## 逐条处理

### 1. “当前支持计划没有致命错误”

采纳。

复核后该判断成立。原计划的核心方向仍然正确：声明式唯一约束、dispatch 事务边界和结构化约束错误都是 interaqt 框架级一致性能力，不是 medeo-lite 业务语义泄漏。

不需要推翻原计划。

### 2. “Core 仍没有持久化约束模型”

采纳，原计划已覆盖。

当前 `EntityCreateArgs` / `RelationCreateArgs` 没有 `constraints` 字段；现有 `static public.*.constraints` 是 Klass 元数据校验，不是数据库 schema 约束。原计划新增 `UniqueConstraint` Klass，并在 `Entity` / `Relation` 上挂载 `constraints?: ConstraintInstance[]`，与该代码事实一致。

### 3. “setup 仍以建表建字段为主”

采纳，原计划已覆盖。

当前通用 setup 不生成用户声明的 unique index，只有 Transform 内部状态存在专项 unique index 路径。原计划选择用独立 schema object / unique index 方式实现用户声明约束，而不是 inline `UNIQUE (...)`，方向正确。

### 4. “dispatch 已有事务骨架，但 contract 仍需锁定”

采纳，原计划已覆盖，并在本次补强为冻结项。

原计划已经要求 guard、`mapEventData`、事件落库、`resolve`、同步 mutation listeners 和同步 computation 写入处于同一事务，并要求失败整体回滚。本次新增的冻结清单进一步要求实现前锁定事务内 hook、post-commit side effect 和 async computation 边界。

### 5. “afterDispatch 语义冲突已经被识别”

采纳，原计划已覆盖，并在本次补强为冻结项。

最终 review 的判断成立：当前 `afterDispatch` 位于事务内，而需求文档希望外部副作用在 commit 后执行。原计划已经要求事务内 hook 与 post-commit hook 分离。本次把该点加入 public contract 冻结清单，明确外部 IO 只能进入 commit 后语义。

### 6. “driver 与错误模型判断基本准确”

采纳，原计划已覆盖。

唯一冲突需要在 storage mutation 边界映射为 `ConstraintViolationError`；同步 computation 失败被 `ComputationError` 包装时，也必须通过 error chain helper 稳定识别内部约束错误。原计划已经写入 `findConstraintViolationError(error)` 和 error-chain contract。

### 7. “filtered unique 的 null contract 必须作为公共语义”

采纳，原计划已覆盖，并在本次补强为冻结项。

该意见正确，尤其是 `{ op: 'notIn', value: [null, ''] }` 不能翻译成 SQL `NOT IN (NULL, '')`。原计划已经明确 `notIn` / `in` / `equals null` / `notEquals null` 的 public SQL 语义和测试矩阵。本次把 `ConstraintPredicate` 的 null 语义列入实现前冻结清单。

### 8. “relation 约束必须只公开稳定 DSL”

采纳，原计划已覆盖，并在本次补强为冻结项。

最终 review 认可使用 `properties: ['source', 'target']`，不公开 `source.id` / `target.id`。该判断成立，因为 relation 端点到物理字段的映射属于 storage 映射细节，应由 `EntityToTableMap` 解析。本次把该 DSL 边界加入冻结清单。

### 9. “filtered / merged record 范围不能半支持”

采纳，原计划已覆盖，并在本次补强为冻结项。

原计划已经收窄为普通 entity / relation 必须支持，filtered / merged record 只有在规则明确时支持，否则 setup 失败。本次把该支持边界加入冻结清单，要求失败诊断包含 record、constraint 和属性信息。

### 10. “error chain contract 不能只停留在文档”

采纳，原计划已覆盖。

该意见正确。实现时必须同时完成 storage 边界错误转换、`ComputationError.causedBy` 保留、error-chain helper 和 dispatch throw/return 模式测试。原计划已把这些内容纳入错误映射工作包和运行时测试矩阵。

### 11. “setup(false) 的补齐行为要严格非 destructive”

采纳，原计划已覆盖。

最终 review 的约束成立：`setup()` 可以验证并幂等补齐声明式 constraint index，但不能做 alter/drop、字段类型修复或脏数据清理。原计划已明确 `setup(true)` / `setup()` 的边界和非 destructive 行为。

### 12. “进入代码实现前建议轻量设计冻结”

采纳，并已修复原计划。

这是 final review 中唯一需要对原计划追加正文的意见。原计划虽然已经分散覆盖相关 contract，但缺少一个集中冻结清单。本次新增 `## 9. 实施前 public contract 冻结清单`，明确：

1. `UniqueConstraint` 类型与 Klass 序列化格式。
2. relation `source` / `target` DSL。
3. `ConstraintPredicate` null 语义与参数化 SQL 规则。
4. `ConstraintViolationError` public fields 与 error-chain helper。
5. MySQL filtered unique capability 行为。
6. `afterDispatch` / post-commit side effect / async computation 边界。
7. filtered / merged record 不支持时的 setup error 形态。

## 最终判断

`data-constraints-task1-final-review.md` 的意见整体可靠，没有发现错误意见。

原计划无需重写；本次只需要把最终 review 建议的实现前设计冻结项显式写入原计划。修订后的 `data-constraints-evaluation-and-support-plan.md` 可以继续作为后续实现数据约束能力的设计依据。
