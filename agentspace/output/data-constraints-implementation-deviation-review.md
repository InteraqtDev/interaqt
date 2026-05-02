# 数据约束实现偏差深度 Review

## 1. Review 结论

当前实现已经完成了一个可运行的最小闭环：用户可以声明 `UniqueConstraint`，`Entity` / `Relation` 可以挂载 constraints，setup 会创建 unique index / partial unique index，普通 storage mutation 和同步 computation 派生写入的唯一冲突会被映射为 `ConstraintViolationError`，并且新增测试覆盖了 PGLite / SQLite filtered unique、relation `source` / `target` unique、以及同步 Transform 冲突回滚。

但它还不是原计划中定义的“框架级完整交付”。当前实现存在多处简化、妥协或偏离，其中最重要的是：

1. filtered unique predicate literal 没有参数化，而是手动拼 SQL literal。
2. schema setup 阶段的约束创建错误没有结构化包装。
3. MySQL 支持没有真正按计划完成，普通 unique 也缺少验证。
4. setup(false) 缺少 schema-not-installed / dirty-data 诊断。
5. runtime 静态校验和 contract tests 不够完整。
6. 通用 constraint index builder 没有和 Transform 内部 unique index 复用。

这些问题不推翻当前方向，但说明当前实现更接近“第一条可工作的 vertical slice”，而不是原计划要求的一次性完整方案。建议在进入业务回迁或发布前修复 P0/P1 项。

## 2. 主要偏差

### 2.1 Predicate literal 没有参数化

当前 `DBSetup.predicateSQLForOperator()` 会通过 `quoteLiteral()` 把 `equals` / `notEquals` / `in` / `notIn` 的值直接拼入 DDL：

```ts
return `${quotedField} = ${this.quoteLiteral(operator.value)}`
```

这偏离了原计划中“所有 predicate literal 必须参数化”的要求。

原因可以理解：当前 `Database.scheme(sql, name?)` 接口不支持 params，约束 DDL 也沿用了已有 `createTableSQL()` 的纯字符串风格。为了快速完成 partial unique index，当前实现选择了手动 quote。

是否值得修复：值得，优先级 P0/P1。虽然 constraints 通常来自开发者声明，不是普通用户输入，但 interaqt 是框架，不能把 SQL literal 拼接作为 public schema builder 的长期实现。修复方向是让 constraint DDL builder 返回 `{ sql, params }`，并扩展或新增 schema execution API 支持参数化；如果部分数据库不支持 DDL 参数，也应有集中、可审计的 driver literal encoder，而不是散落在 `DBSetup`。

### 2.2 Schema 创建错误没有结构化包装

当前 `MonoStorage.setup()` 中会直接执行：

```ts
await dbSetup.createConstraints()
```

`createConstraints()` 内部调用 `database.scheme()`。如果已有脏数据导致 unique index 创建失败，或者基础表不存在，错误会以 driver 原始错误抛出。原计划要求约束创建失败必须带上 logical constraint name、recordName 和 driver 原始错误；当前只有 query name 里带了 `setup constraint ${item.constraintName}`，没有转换为框架错误，也没有稳定字段。

原因是当前错误映射只接入了 `callWithEvents()` mutation 边界，没有覆盖 setup/schema 边界。

是否值得修复：值得，优先级 P1。这个问题会直接影响 migration / setup 诊断体验。建议新增 `ConstraintSetupError` 或复用 schema error 类型，至少包含 `constraintName`、`recordName`、`properties`、`physicalName`、`driver`、`rawCode`、`causedBy`。如果 index 创建失败是唯一冲突，也可以提供 `findConstraintViolationError()` 能识别的链路，但 setup 语义最好和 runtime mutation violation 区分清楚。

### 2.3 MySQL 支持是 capability fail-fast 的简化版，普通 unique 未验证

原计划要求 MySQL v1 至少支持普通 unique / 复合 unique；filtered unique 在 capability 不满足时 fail fast。

当前实现只在 `item.where && MysqlDB` 时 fail fast。普通 unique 会生成：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "physicalName" ON "table" ("field")
```

这条 SQL 使用双引号和 `IF NOT EXISTS`，是否被当前 MySQL driver 接受没有测试证明。MySQL 对 quoted identifier、`CREATE INDEX IF NOT EXISTS`、版本差异都比较敏感。当前实现不能认为已经兑现了“MySQL 普通 unique 必须支持”的计划。

原因是第一轮实现主要通过 PGLite / SQLite 验证，未引入 driver capability 层，也未跑 MySQL 集成测试。

是否值得修复：如果 MySQL 是当前发布支持面的一部分，值得，优先级 P1；如果本阶段只承诺 PGLite / SQLite / PostgreSQL，则应在文档和 capability 中显式标记 MySQL constraints unsupported。更稳妥的修复是给 `Database` 增加 schema capability / identifier dialect，DDL builder 不再通过 `constructor.name` 判断 driver。

### 2.4 setup(false) 缺少明确的 schema-not-installed 诊断

原计划要求：

1. `setup(true)` 建表后创建 constraints。
2. `setup()` 在基础表已存在时幂等补齐 constraint index。
3. 基础表缺失时报 schema-not-installed 类错误。
4. 不做 destructive 修复。

当前实现会在 `createTables` 为 false 时仍然直接执行 `createConstraints()`。如果表不存在，会抛出原始数据库错误；如果已有数据违反约束，也会抛出原始 index 创建错误。

原因与 2.2 类似：为了快速接入幂等 index 创建，当前没有增加 schema introspection / diagnostic 层。

是否值得修复：值得，优先级 P1。它不是唯一约束正确性的核心，但会影响无状态 worker 重启、迁移前置检查、生产诊断。建议在创建 index 前验证基础表存在，并对 dirty data violation 给出 constraint-level 诊断。

### 2.5 Runtime 静态校验不完整

当前有以下校验：

1. logical constraint name 全局唯一。
2. properties 非空。
3. filtered entity / relation 上声明约束 fail fast。
4. 属性必须能解析为单一物理字段，且字段在 record table 上。

但原计划中的部分校验没有完全落地：

1. `where` 的 operator 只靠 TypeScript 类型约束，runtime 没有验证非法 `op`、空数组之外的非法 value 类型等。
2. computed property 的禁止依赖于无法解析到字段，错误信息不是“computed property unsupported”的稳定诊断。
3. merged entity / relation 没有独立 contract tests 证明“能证明同表则支持，不能证明则失败”。
4. relation `source.id` / `target.id` 这类非法 DSL 没有专门测试。

原因是当前实现把大部分校验合并进物理字段解析，减少了额外 schema validator 的工作量。

是否值得修复：值得，优先级 P1/P2。框架 public API 不应只依赖 TypeScript 类型，因为用户可能从 JS、反序列化数据、生成器或跨包版本输入 constraints。建议新增 `validateConstraintDefinition()`，输出稳定、可测试的错误消息。

### 2.6 错误映射依赖 message fallback，registry 还比较轻量

当前 mutation 错误映射逻辑是：

1. 根据 driver error code / errno / message 判断是否 unique violation。
2. 优先用 `error.constraint` 匹配 physical/logical name。
3. 再用 message 包含 physical/logical name 匹配。
4. 最后用 table + fields fallback。

这符合原计划的大方向，但仍是轻量实现。SQLite / MySQL message 格式、PostgreSQL/PGLite error object 字段、不同版本返回字段都没有系统测试。对于无法识别的 unique violation，当前会返回 generic `ConstraintViolationError`，但业务拿不到 `constraintName` / `recordName` / `properties`。

原因是当前还没有 driver-level normalized error adapter，也没有把 constraint registry 下沉到 storage/driver 边界。

是否值得修复：值得，优先级 P1。至少需要补 PostgreSQL / SQLite / PGLite 的 raw error shape 测试；MySQL 是否纳入取决于支持矩阵。长期建议增加 `normalizeDatabaseError()` 或 driver capability adapter。

### 2.7 Dispatch result 模式测试不足

新增测试覆盖了 `forceThrowDispatchError: true` 下的同步 Transform unique violation，并通过 `findConstraintViolationError()` 验证 error chain，同时验证源事件回滚。

但原计划还要求 dispatch result / throw 模式下字段都不丢失。当前没有测试默认返回模式：

```ts
const result = await controller.dispatch(...)
expect(findConstraintViolationError(result.error)).toBeDefined()
```

原因是第一轮测试优先验证了最严格的 throw path 和事务回滚。

是否值得修复：值得，优先级 P2。实现看起来大概率可用，因为 `Controller.dispatch()` catch 后会把原 error 放入 `result.error`，但 framework contract 应用测试锁住。

### 2.8 Constraint DDL 没有和 Transform unique index 复用

原计划建议 Transform 内部 unique index 和用户声明 constraint index 后续复用同一个 schema object builder、命名器和错误映射路径。

当前用户声明 constraints 在 `DBSetup` 中构建；Transform unique index 仍在 `MonoSystem.setupTransformUniqueIndexes()` 中单独生成 SQL、单独命名、单独执行。二者没有共享 builder 或 registry。

原因是 Transform unique index 是既有专项逻辑，第一轮实现为了降低改动面没有重构它。

是否值得修复：值得，但优先级 P2/P3。只要两套 DDL 行为都稳定，短期不会阻塞业务约束能力；但长期会造成 driver 行为、命名、错误映射和 setup 诊断分叉。建议在后续 schema object 抽象中统一。

### 2.9 afterDispatch / post-commit hook 语义未处理

原计划要求澄清 `afterDispatch`、事务内 hook、post-commit side effect 的边界。当前实现没有改动这块，`Controller.dispatch()` 中 `eventSource.afterDispatch` 仍在事务内执行。

原因是本轮主要聚焦 unique constraint 与错误映射，没有处理 hook API 语义。

是否值得修复：值得，但应独立设计，优先级 P2。它属于 dispatch transaction contract 的另一半，影响外部 IO 是否会被错误地放入事务内。当前不阻塞 unique constraint 的基本能力，但会影响完整数据一致性方案。

## 3. 哪些简化可以暂时接受

### 3.1 只实现 `UniqueConstraint`

当前 `ConstraintInstance = UniqueConstraintInstance`，没有抽象普通 index、check、foreign key。这与原计划一致，不是偏离。因为本需求核心是唯一性和幂等兜底，过早扩展 constraint hierarchy 会增加 public API 成本。

### 3.2 filtered entity / relation 上 constraints fail fast

当前 filtered record 直接 fail fast，没有实现自动合并 `matchExpression` 到 index predicate。这符合原计划中“规则未实现前不半支持”的要求。需要改进的是错误类型和测试，而不是马上支持 filtered record。

### 3.3 computation 派生写入冲突不强制 unwrap 为顶层 `ConstraintViolationError`

当前通过 `findConstraintViolationError()` 沿 error chain 查找。原计划允许 top-level 保留 `ComputationError`，只要求可结构化识别。因此这不是偏离。需要补的是默认 dispatch result 模式测试。

## 4. 建议修复顺序

### P0 / P1：发布前建议修

1. 参数化或集中规范化 predicate literal 生成，避免 `DBSetup` 直接拼 SQL 值。
2. setup/schema 阶段错误结构化，尤其是创建 index 失败、基础表缺失、已有脏数据违反约束。
3. 明确 MySQL constraints capability：要么实现并测试普通 unique / 复合 unique，要么 fail fast 标记暂不支持。
4. 增加 runtime constraint validator，覆盖非法 `where`、非法 relation path、computed property、empty `in` / `notIn`、duplicate logical name。
5. 补 dispatch 默认返回模式的 error-chain 测试。

### P2：建议随后修

1. 增加 PostgreSQL 实库或 PGLite raw error shape 的更细粒度测试，验证 `error.constraint` / message fallback。
2. 补 setup(false) 幂等补齐和缺表诊断测试。
3. 补 merged record constraints 的支持 / fail-fast contract tests。
4. 将 constraint registry 暴露为更明确的 storage schema metadata，而不是仅保存在 `MonoStorage` 私有字段。

### P3：架构整理

1. 把用户 constraint index 和 Transform unique index 统一到 schema object builder。
2. 重新整理 `afterDispatch` 与 post-commit hook 的 public API。
3. 用 driver capability 取代 `database.constructor.name` 判断。

## 5. 最终判断

当前实现没有方向性错误，也没有明显破坏已有架构的设计；它成功证明了 interaqt 可以在 core model 中声明唯一约束，并通过 storage setup 和 dispatch transaction 形成一致性闭环。

但它确实存在简化和妥协，尤其是 SQL literal 拼接、schema 错误未结构化、MySQL 未验证、setup diagnostics 不完整。这些问题对于应用内原型可能可以接受，但对于 interaqt 这样的框架级项目，不应作为最终状态发布。

建议把当前实现视为 Task 1 追加任务2的第一阶段完成：功能主链路可用，测试证明核心语义成立；下一阶段应优先补齐 P0/P1 项，让实现真正达到原计划的框架级 contract。
