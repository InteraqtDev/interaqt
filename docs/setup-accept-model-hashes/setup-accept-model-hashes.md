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
| 库中 hash 不等但在接受集里 | `manifestMode: 'accepted'`；`requireSchemaSuperset !== false` 时先做超集校验（§3） |
| 库中 hash 不等且不在接受集里 | 原 `Model manifest mismatch` 文本之后追加库中 hash、声明 hash 和接受集 |
| 接受集超过 2 个、不是数组、含空串或重复项 | 读库之前直接报错 |
| 非空接受集与 `install: true` 或 `migrate` 同时出现 | 直接报错（这两种模式下没有「库中已有模型」可接受） |

每次 attach 成功后经 `system.logger.info` 输出 `label: 'setup'`、`manifestMode`、
`declaredModelHash`（当前代码的 hash）和 `acceptedModelHash`（库中 manifest 的 hash）。
沿用仓库现有的日志接口；默认 `SystemConsoleLogger` 级别是 `ERROR`，因此默认无输出。

接受判定只有一个入口：`resolveManifestMode`（`src/runtime/setupAcceptance.ts`）。以后如果改为由
迁移在 manifest 里声明兼容来源，只需改这一处。

**边界：只承诺读兼容，通过超集校验不等于写入安全。** 以下情况不检查也不保证，由应用的
expand/contract 两次发布纪律保证：

- 新模型新增的 fact 属性没有数据库层 DEFAULT，旧代码插入的行在该列为 NULL。重新前滚时 hash
  相等，不会走迁移，也就不会回填。
- 新模型新增的 computed 属性在兼容窗口内不会被旧代码维护，旧代码改过的行上这个值会过期。
- 被新版本迁移重建过的 computation，会被旧代码按旧语义继续增量维护。

这几点写在 `SetupOptions` 的类型注释、`agent/agentspace/knowledge/usage/14-api-reference.md` 和
CHANGELOG 里。

## 3. 结构超集校验

两层，全部违例汇总进一个 `SchemaSupersetError`（`details.violations`）。

**逻辑层**（`findModelSupersetViolations`，`src/runtime/setupAcceptance.ts`）：比较当前代码的 manifest
和库中 manifest，复用迁移规划器的阻塞判定 `getStorageBlockingChanges`，以当前代码为 old、库中模型为
new。凡是「从当前模型迁到库中模型会被阻塞」的变化，恰好就是当前代码需要、而库中模型删掉、挪走或改了
类型的记录和属性，报为 `model-difference`。迁移规划器对 computed 属性的物理位置变更是放行的（迁移会把
值重算到新列），这里不放行：旧代码会继续读旧列，而新版本已经不再维护旧列。这一层看的是新模型的声明意图。

**物理层**（`MonoStorage.findSchemaSupersetViolations`，`src/runtime/MonoSystem.ts`，经
`System.findSchemaSupersetViolations` 调用）：读库的真实目录，看实际存在什么。逻辑层不能代替它：
库可能被迁移之外的 DDL 改过。

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
- **约束对象**复用加法计划里已经做过的目录核对结果（`reconcileManagedConstraints`），用与 attach 阶段
  完全相同的判定 `isStartupBlockingConstraintMismatch` 过滤，报为 `constraint-mismatch`。库里多出来的
  约束（新模型新增的 unique、NonNull 等）算不兼容：它们会拒绝旧代码的写入。报错写明多出的约束种类、
  物理名和所在表。
- 违例类型 `SchemaSupersetViolation`：`model-difference`、`missing-table`（含所属记录名）、
  `missing-column`、`incompatible-column-type`、`constraint-mismatch`，带物理名和 `Record.property`
  逻辑路径。

为什么类型校验大概率是安全网：框架自己的迁移不会删除列，也不会就地改类型
（`getStorageBlockingChanges` 对类型变更报 `unsupported-destructive-schema-change`）。经框架迁移
到达的库，旧代码需要的列一定还在且类型不变。校验真正拦住的是两类情况：接受集声明错了（例如新代码
把旧模型的 hash 当成兼容），或数据库被框架迁移之外的 DDL 改过。

## 4. 约束与 attach 阶段核对

`MonoStorage.setup` 在 attach 时本来就核对约束对象（`assertManagedConstraintsReconciled`），那段代码
的前提是「声明变化已被 modelHash 校验拦住」。接受模式打破了这个前提，因此：

- 默认（`requireSchemaSuperset` 开启）时，多出来的约束在超集校验里就以 `SchemaSupersetError` 报出。
- `requireSchemaSuperset: false` 时，attach 阶段核对照常拒绝启动（`ConstraintSetupError`），但报错改为
  接受模式的说法：不再建议「运行 migrate 来对齐」，因为让旧代码对新库执行迁移会删掉新模型的约束。
  报错按两个方向给出处理办法：库比代码旧就迁移，库比代码新就部署与库匹配的版本。

新约束应在旧版本下线之后的 contract 发布里加。用例：`a unique constraint the newer model added ...`
（PGLite、SQLite）和 `a NonNull constraint the newer model added ...`（PGLite；SQLite 不支持 NonNull 约束）。

## 5. 证据

- 测试：`tests/runtime/setupAcceptModelHashes.spec.ts`（PGLite 13 个、SQLite 12 个、选项校验 2 个、
  MySQL 环境门控 2 个），`tests/runtime/postgresqlMigration.spec.ts` 的
  `PostgreSQL setup acceptModelHashes`（真实 PostgreSQL，环境门控，3 个）。夹具在
  `tests/runtime/helpers/setupAcceptanceFixtures.ts`。CI 的 `postgres-concurrency.yml` 同时跑这两个
  文件的真实 PostgreSQL 与 MySQL 部分。
- 先红后绿：实现前 20 个用例失败；默认路径回归两例在实现前后都是绿的（这正是要证明的性质）。
- 变异：去掉接受集判断、去掉超集校验、上限不设限、去掉类型比较、默认路径也追加扩展报错文本、
  去掉启动日志、忽略 `requireSchemaSuperset: false`、去掉逻辑层、去掉约束层，每个变异都至少让一个
  对应用例变红。补丁与结果见 PR 描述。
