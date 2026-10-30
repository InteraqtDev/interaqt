```text
status: 已完成
tracking-issue: one2x-ai/mesh#2826
decision-record: sskyy 2026-10-30 15:07（接受集）、2026-10-30 15:47（改为由迁移声明兼容）
delivery: PR #60（接受集 + 超集校验），第二个 PR（迁移声明兼容，§6）
```

# setup 的 N-1 attach：迁移声明兼容与接受集 — 设计记录

## 1. 问题

`controller.setup(false)`（attach）要求库中迁移 manifest 的 `modelHash` 与当前声明的
`modelHash` 严格相等。数据库被新版本迁移之后，上一版本的代码一律以
`Model manifest mismatch` 拒绝启动。下游（mesh）的三条恢复路径因此不可用：迁移后拨回旧版本、
canary 期间旧 ReplicaSet 的 Pod 重启、Rollout 自动 abort。即使迁移只加了一列或一张表，旧代码
完全可以读新结构，hash 不等仍然无法启动。

缺的不是放宽校验，而是一种显式声明「这一次兼容」的手段，并且框架要能验证这个声明。

声明由谁来做：崩的是旧版本（N-1）的 Pod，而 N-1 的镜像构建时不可能知道 N 的 hash，运行时注入
接受集又恰好要走触发 Pod 重建的配置通道。迁移是唯一同时知道新旧两个 hash 的时刻，所以主路径是
由迁移在库的 manifest 里声明兼容（§6，做法对应 Flyway 的「库比代码新可以容忍」）；接受集
`acceptModelHashes` 保留为显式覆盖手段。两条路径都经同一个判定函数，并且都要过超集校验（§3）。

## 2. 合同

显式覆盖只在对象形态上提供（`src/runtime/migration.ts` 的 `SetupOptions`）：

```ts
await controller.setup({
  install: false,
  acceptModelHashes: [releaseNModelHash], // 至多 2 个；省略或 [] = 严格相等
  requireSchemaSuperset: true,            // 默认 true
})
```

| 情形 | 行为 |
|---|---|
| 库中 hash 等于声明 hash | `manifestMode: 'exact'`，与 4.12.0 一致，不做结构校验 |
| 库中 hash 不等，库 manifest 的 `compatibleFrom` 含声明 hash | `manifestMode: 'declared-compatible'`（默认路径，不需要参数）；先做超集校验（§3） |
| 库中 hash 不等但在接受集里 | `manifestMode: 'accepted'`；先做超集校验（§3） |
| 以上都不满足，manifest 没有声明且接受集为空（布尔形态、`setup()`、`{}`、`{ install: false }`、`acceptModelHashes: []`） | 与 4.12.0 一致：报错文本逐字不变 |
| 以上都不满足，其他情况 | 原 `Model manifest mismatch` 文本之后追加库中 hash、声明 hash、manifest 的 `compatibleFrom`、接受集，以及迁移被判为不兼容的原因 |
| 接受集超过 2 个、不是数组、含空串或重复项 | 读库之前直接报错 |
| 非空接受集与 `install: true` 或 `migrate` 同时出现 | 直接报错（这两种模式下没有「库中已有模型」可接受） |

每次 attach 成功后经 `system.logger.info` 输出 `label: 'setup'`、`manifestMode`、
`declaredModelHash`（当前代码的 hash）和 `acceptedModelHash`（库中 manifest 的 hash）。
沿用仓库现有的日志接口；默认 `SystemConsoleLogger` 级别是 `ERROR`，因此默认无输出。

接受判定只有一个入口：`resolveManifestMode`（`src/runtime/setupAcceptance.ts`），顺序是精确相等、
库的声明、显式接受集。`requireSchemaSuperset: false` 对声明路径和接受集路径都生效（只能在对象形态
里显式关闭）。

**边界：只承诺读兼容，通过超集校验不等于写入安全。** 以下情况不检查也不保证，由应用的
expand/contract 两次发布纪律保证：

- 新模型新增的 fact 属性没有数据库层 DEFAULT，旧代码插入的行在该列为 NULL。重新前滚时 hash
  相等，不会走迁移，也就不会回填。（依赖应用侧默认值的新属性会让迁移判为不兼容，见 §6；不带
  默认值的新属性仍判为兼容，NULL 由新代码自行处理。）
- 新模型新增的 computed 属性在兼容窗口内不会被旧代码维护，旧代码改过的行上这个值会过期；重新
  前滚时也不会重算。
- 被新版本迁移重建过的 computation，会被旧代码按旧语义继续增量维护。迁移声明路径把这种迁移判为
  不兼容（§6）；只有显式接受集能越过这一判定，后果由使用者承担。

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

类型校验主要起兜底作用，原因是：框架自己的迁移不会删除列，也不会就地改类型
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
  `PostgreSQL setup acceptModelHashes`（真实 PostgreSQL，环境门控，4 个）。夹具在
  `tests/runtime/helpers/setupAcceptanceFixtures.ts`。CI 的 `postgres-concurrency.yml` 同时跑这两个
  文件的真实 PostgreSQL 与 MySQL 部分。
- 先红后绿：在 4.12.0（`102d569`）上跑最终的 spec，25 个用例失败；默认路径回归两例在实现前后都是绿的（这正是要证明的性质）。
- 变异：去掉接受集判断、去掉超集校验、上限不设限、去掉类型比较、默认路径也追加扩展报错文本、
  去掉启动日志、忽略 `requireSchemaSuperset: false`、去掉逻辑层、去掉约束层，每个变异都至少让一个
  对应用例变红。补丁与结果见 PR 描述。

## 6. 迁移声明兼容（第二个 PR）

**分类**（`classifyMigrationCompatibility`，`src/runtime/setupAcceptance.ts`）：`migrate` 用批准后的
决策给本次迁移分类，结果写进它写入的 manifest：

- `compatibleFrom`：兼容时为 `[上一个 modelHash]`，不兼容时为 `[]`。只声明紧邻的上一个模型，不做传递
  （A→B→C 两步都兼容时，C 的 manifest 只有 `[B]`）。
- `compatibility`：`{ fromModelHash, compatible, reasons }`，无论是否兼容都记录，供排障。
- 模型没变的迁移（例如只对齐约束对象）保留上一次迁移的声明，不会把声明抹掉。
- 两个字段都不进 `modelHash`。install、`createMigrationBaseline` 和 4.12.x 写的 manifest 没有这两个
  字段，setup 对它们保持严格相等，报错文本与 4.12.0 一致。

判为不兼容的情况（每条都会写进 `reasons`）：

| 规则 | 依据 |
|---|---|
| 上一个模型的记录或属性被删除、挪动或改类型 | 与 setup 逻辑层同一个判定（`findModelSupersetViolations`） |
| 上一个模型用到的表上约束对象有增、删、改（unique、non-null、identity） | 新增的会拒绝旧代码的写入；删除或修改的会让旧代码的 attach 核对失败。新增在这类表上的 Transform 输出索引除外，与 attach 判定一致；目录核对里「不可判定、按原定义重建」的条目不算 |
| 已有 computation 被修改、删除或接管 fact 属性 | 旧代码会继续按旧语义维护这些数据；修改被批准为 `'unchanged'` 时不算 |
| StateMachine 状态重映射（state-graph-mapping） | 持久化的状态名变了，旧代码会继续写旧名字 |
| 已有记录上新增的 fact 属性依赖应用侧默认值 | 数据库没有 DEFAULT，旧代码插入的行在该列为 NULL |

新表、不带默认值的新列、新数据上的新 computation 仍然兼容（写语义边界见 §2）。

`generateMigrationDiff()` 在 `diff.compatibility` 里给出临时分类：决策尚未做出，已有 computation 的
修改一律按语义修改计，并提示「若不是语义修改，可批准为 `'unchanged'`」。`migrate()` 用批准后的
决策重新计算，结果写进 manifest，也在 `plan.compatibility` 里返回（dry run 同样返回）。批准文件里的
`compatibility` 只是参考，`migrate` 不采信。

**setup**：`resolveManifestMode` 先看精确相等，再看库 manifest 的 `compatibleFrom` 是否包含当前代码的
hash，最后看显式接受集。声明路径同样要过超集校验：库被迁移之外的 DDL 改过时，即使 manifest 声明了
兼容也拒绝启动，报错写明 `manifestMode: declared-compatible`，并说明是库与声明不符。

**证据**：`tests/runtime/migrationDeclaredCompatibility.spec.ts`（PGLite、SQLite 各 12 个），
`tests/runtime/postgresqlMigration.spec.ts` 的 `PostgreSQL migration-declared compatibility`（真实
PostgreSQL，2 个）。实现前在 PR #60 的代码上跑，22 个失败；没有声明的旧 manifest 那两例在实现前后都是绿的。
10 个变异都至少让一个用例变红：分类器把新增约束判为兼容、setup 忽略 `compatibleFrom`、分类器忽略
computation 修改、忽略状态重映射、忽略应用侧默认值、模型不变的迁移抹掉声明、声明做传递、旧 manifest
的报错追加内容、忽略 `'unchanged'` 决策、声明路径跳过超集校验。补丁与结果见第二个 PR 的描述。
