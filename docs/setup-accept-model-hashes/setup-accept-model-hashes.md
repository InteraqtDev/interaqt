```text
status: 已完成
tracking-issue: one2x-ai/mesh#2826
decision-record: sskyy 2026-10-30（issue 评论）
```

# setup 的 N-1 模型接受集 — 设计记录

## 1. 问题

`controller.setup(false)`（attach）要求库中迁移 manifest 的 `modelHash` 与当前声明的
`modelHash` 严格相等。数据库被新版本迁移之后，上一版本的代码一律以
`Model manifest mismatch` 拒绝启动。下游（mesh）的三条恢复路径因此不可用：迁移后拨回旧版本、
canary 期间旧 ReplicaSet 的 Pod 重启、Rollout 自动 abort。即使迁移只加了一列或一张表，旧代码
完全可以读新结构，hash 不等仍然无法启动。

缺的不是放宽校验，而是一种显式声明「这一次兼容」的手段，并且框架要能验证这个声明。

## 2. 合同

只在对象形态上提供（`src/runtime/migration.ts` 的 `SetupOptions`）：

```ts
await controller.setup({
  install: false,
  acceptModelHashes: [releaseNModelHash], // 至多 2 个；省略或 [] = 严格相等
  requireSchemaSuperset: true,            // 默认 true
})
```

| 情形 | 行为 |
|---|---|
| 布尔形态、`setup()`、`{}`、`{ install: false }`、`acceptModelHashes: []` | 与 4.12.0 一致：严格相等，报错文本逐字不变 |
| 库中 hash 等于声明 hash | `manifestMode: 'exact'`，不做结构校验 |
| 库中 hash 不等但在接受集里 | `manifestMode: 'accepted'`；`requireSchemaSuperset !== false` 时先读库的真实结构做超集校验 |
| 库中 hash 不等且不在接受集里 | 原 `Model manifest mismatch` 文本之后追加库中 hash、声明 hash 和接受集 |
| 接受集超过 2 个、不是数组、含空串或重复项 | 读库之前直接报错 |
| 非空接受集与 `install: true` 或 `migrate` 同时出现 | 直接报错（这两种模式下没有「库中已有模型」可接受） |

每次 attach 成功后经 `system.logger.info` 输出 `label: 'setup'`、`manifestMode`、
`declaredModelHash`（当前代码的 hash）和 `acceptedModelHash`（库中 manifest 的 hash）。
沿用仓库现有的日志接口；默认 `SystemConsoleLogger` 级别是 `ERROR`，因此默认无输出。

**边界：只承诺读兼容。** 接受集命中只说明当前代码能读新结构。写语义兼容（例如新模型期望旧代码
不写的列有值）不检查也不保证，由应用的 expand/contract 两次发布纪律保证。这一点写在
`SetupOptions` 的类型注释、`agent/agentspace/knowledge/usage/14-api-reference.md` 和 CHANGELOG 里。

## 3. 结构超集校验

实现位置：`MonoStorage.findSchemaSupersetViolations`（`src/runtime/MonoSystem.ts`），经
`System.findSchemaSupersetViolations` 由 `Controller.setup` 调用。

- **存在性**复用 attach 路径已经算出的加法迁移计划（`prepareMigrationSchema` →
  `createAdditiveSchemaPlan`）。该计划读的是真实目录（`information_schema.tables/columns`、
  `sqlite_master`、`PRAGMA table_info`），其中的 `create-table` / `add-column` 恰好是「当前模型
  需要而库里没有」的表和列，包括框架内部的账本表。存在性判断因此与迁移规划共用同一个读取点，
  不另写第二套。
- **类型**对已存在的列逐列读取目录类型，与当前声明的列类型比较：
  - PostgreSQL：`information_schema.columns.udt_name`（即 `pg_type.typname`）；声明类型去掉列约束
    子句（`PRIMARY KEY`、`GENERATED ... AS IDENTITY` 等）、把 `SERIAL` 一类伪类型换成实际类型后，
    由数据库自己用 `to_regtype` 解析，所以 `INT` / `integer` / `int4` 视为相同。类型修饰
    （长度、向量维度）不比较。
  - SQLite：目录只保存声明类型文本，比较规范化后的文本。
  - MySQL：`information_schema.columns.data_type`（不含修饰），声明类型按同义词表归一。
- 违例类型 `SchemaSupersetViolation`：`missing-table`（含所属记录名）、`missing-column`、
  `incompatible-column-type`，带物理表名、列名和 `Record.property` 逻辑路径。全部违例收进
  `SchemaSupersetError`，`details.violations` 可供程序判读。

为什么类型校验大概率是安全网：框架自己的迁移不会删除列，也不会就地改类型
（`getStorageBlockingChanges` 对类型变更报 `unsupported-destructive-schema-change`）。经框架迁移
到达的库，旧代码需要的列一定还在且类型不变。校验真正拦住的是两类情况：接受集声明错了（例如新代码
把旧模型的 hash 当成兼容），或数据库被框架迁移之外的 DDL 改过。

## 4. 已知限制（有测试钉住）

attach 时的约束对象核对保持原样。新模型在当前代码会用到的表上新增的约束对象（例如
`UniqueConstraint`）在旧代码看来是多出来的约束，仍会以 `ConstraintSetupError` 拒绝启动。这与
expand/contract 纪律一致：新约束可能拒绝旧代码的写入，应在旧版本下线之后的 contract 发布里加。
钉住它的用例是 `constraint objects added by the newer model ... still block startup`。

## 5. 证据

- 测试：`tests/runtime/setupAcceptModelHashes.spec.ts`（PGLite 与 SQLite 各 11 个用例 + 选项校验 2 个
  + MySQL 环境门控 2 个），`tests/runtime/postgresqlMigration.spec.ts` 的
  `PostgreSQL setup acceptModelHashes`（真实 PostgreSQL，环境门控，3 个）。夹具在
  `tests/runtime/helpers/setupAcceptanceFixtures.ts`。
- 先红后绿：实现前 20 个用例失败；默认路径回归两例在实现前后都是绿的（这正是要证明的性质）。
- 变异：去掉接受集判断、去掉超集校验、上限不设限、去掉类型比较、默认路径也追加扩展报错文本、
  去掉启动日志、忽略 `requireSchemaSuperset: false`，7 个变异都至少让一个对应用例变红。补丁与结果见
  PR 描述。
