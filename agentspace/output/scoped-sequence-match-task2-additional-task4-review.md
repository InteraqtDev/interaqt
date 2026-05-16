# ScopedSequence Match Task 2 Additional Task 4 Review

日期：2026-05-16

## 结论

本轮 review 对照了 `agentspace/output/scoped-sequence-match-implementation-plan.md` 与当前代码实现，重点检查 core API、runtime 分配、match evaluator、initializer seed、migration manifest、测试矩阵和上一轮 review 中留下的未完成项。

当前实现未发现会破坏 `ScopedSequence.match` 分配正确性的致命错误。上一份 review 中指出的两个 Medium 未完成项也已经在当前代码中补齐：

- `match` path 已收紧为 top-level field 与 ref id path，避免第一版 API 暗含 arbitrary nested object traversal。
- PostgreSQL gated 测试已覆盖 `match=true` 项目素材的双 controller 并发、`match=false` 非项目媒体不推进 counter、以及 `match=true` 缺 scope 的失败路径。

因此，从当前 interaqt 框架代码看，`ScopedSequence.match` 主体实现已经达到计划中的发布级语义要求。PostgreSQL gated 用例已在本地临时 PostgreSQL 实例上真实执行并通过。

## 已验证实现点

### 1. Core API 与序列化

`src/core/ScopedSequence.ts` 已定义 `ScopedSequenceMatchAtom`、`ScopedSequenceMatchExpression`、`normalizeScopedSequenceMatchExpression()`、`stableScopedSequenceMatchStringify()` 与 `getEffectiveScopedSequenceInitializerMatch()`。

实现符合 plan 中的 core/storage 边界：`ScopedSequence.match` 复用 core 层 `BoolExp` raw expression，不依赖 storage 层 `MatchExp`。constructor、stringify、parse、clone 都使用 normalized raw data，避免 `BoolExp` 实例形态与 JSON round-trip object 造成 migration signature 漂移。

`validateScopedSequenceMatchExpression()` 当前也已经收紧 atom key：

- 允许 top-level path，例如 `kind`、`project`、`assetPrefix`。
- 允许 ref-like id path，例如 `project.id`。
- 拒绝 `project.name`、`metadata.source` 等其他 dotted path，并报错 `only supports top-level fields and ref id paths`。

这符合第一版“显式 create-time stable input field，不提供 relation traversal / arbitrary nested traversal”的边界。

### 2. Runtime 分配语义

`src/runtime/computations/ScopedSequence.ts` 的 `getInitialValue()` 在 manual value 检查和 scope 解析之前调用 `matchesScopedSequenceRecord()`。

当前语义与计划一致：

- `match=false` 时返回 `undefined`，scheduler 不写目标 property，不解析 scope，不检查 `allowManualValue`。
- `match=true` 时继续执行既有强约束，包括禁止手写、scope 缺失报错、scope 类型校验和 atomic allocation。
- `match=false` 且 create input 手工传入目标 property 时，保留该值，但不会推进 sequence counter。

`validateMatchInputFields()` 也会在 property handle 构造阶段拒绝 `match` 引用目标 computed property 或宿主上的其他 computed property，避免用户绕过 sequence authority 或依赖非 create-time stable 字段。

### 3. Match Evaluator

`src/runtime/scopedSequenceMatch.ts` 已实现 scoped sequence 专用 raw record evaluator，覆盖 `=`、`!=`、`is null`、`is not null`、`in`、`not in`。

关键语义符合 plan：

- 缺字段、`undefined`、`null` 在 `is null` 下匹配。
- `not in` 对 nullish record value 不匹配，避免 JS fallback 与 SQL `NULL NOT IN (...)` 分歧。
- operand 中含 `null` 时，`in` / `not in` 使用显式 nullish 语义。
- `project.id` 对 primitive ref id 与 `{ id }` object ref 形态保持一致。

### 4. Initializer、Migration 与 Manifest

`src/runtime/scopedSequenceManifest.ts` 已把主 `match` 与 initializer effective match 写入 allocation manifest。`allocationSignature` 基于完整 allocation manifest 计算，因此新增、修改或删除 `match` 都会被识别为 allocation 行为变化。

`src/runtime/migration.ts` 中 `seedScopedSequenceInitializers()` 使用 `initializer.match ?? args.match` 计算 effective match。seed 读取优先走 `compileScopedSequenceSeedMatch()` 的专用 SQL 快路径；遇到 `project.id` 等 SQL 快路径不稳定支持的形态时，会退回读取 attribute superset，再用 `matchesScopedSequenceRecord()` 在 JS 中过滤。

这满足 plan 中最关键的约束：initializer fallback 不把 scoped sequence match 原样交给普通 storage `find()` 的 `MatchExp` 编译路径。

### 5. 测试矩阵

`tests/runtime/scopedSequence.spec.ts` 覆盖了核心功能矩阵：

- operator nullish、`in`、`not in` 与 ref-like path evaluator 行为。
- normalized serialization / parse / clone / initializer equality。
- path 边界收紧，拒绝 `metadata.source` 与 `project.name`。
- `match=false` 跳过 sequence、跳过 scope 解析、保留手工值且不推进 counter。
- `match=true` 缺 scope 报错。
- `match=true` 且 `allowManualValue=false` 拒绝手工值。
- primitive ref id 与 `{ id }` object ref 的 `project.id` 行为一致。
- initializer effective match、SQL seed 快路径、JS fallback seed。
- allocation signature 随 `match` 变化。
- 禁止引用目标 property 和其他 computed property。

`tests/runtime/postgresqlScopedSequence.spec.ts` 当前模型已经声明 `kind` 字段和 `match: BoolExp.atom({ key: "kind", value: ["=", PROJECT_ASSET] })`。测试覆盖两个 controller 并发创建项目素材、夹杂非项目媒体不推进 counter、以及项目素材缺 scope 的失败路径。

## 非阻断观察

1. `compileScopedSequenceSeedMatch()` 与 JS evaluator 仍是两份实现。当前测试覆盖了主要漂移点，但后续如果扩展 operator，建议把 operand 规范化与 nullish 语义抽成共享 helper，避免 SQL 和 JS 再次分叉。

2. `scopedSequenceMatchAttributeQuery()` 仍保留了复杂 dotted path 时退回 `["*"]` 的兜底逻辑。由于 core validate 已经拒绝复杂 dotted path，这个兜底主要是防御旧数据或绕过类型系统的输入，不再扩大公开 API surface。

3. 当前框架测试覆盖了 Medeo Lite 需求抽象出的关键语义：discriminator match 下非项目媒体跳过、项目素材缺 scope 报错、非适用记录手工值不推进 counter。实际 Medeo Lite 应用模型把 `allowManualValue` 从绕过机制迁移掉属于下游集成任务，不是当前 interaqt 仓库的阻断项。

## 已执行验证

- `npm test -- tests/runtime/scopedSequence.spec.ts`：通过，22 tests。
- `npm test -- tests/runtime/postgresqlScopedSequence.spec.ts`：通过，2 tests。测试使用本地临时 PostgreSQL 实例，覆盖双 controller 并发和 `match=false` 不推进 counter。
- `npm run check:all`：通过。

## 最终判断

当前代码没有发现致命错误，也没有发现 plan 范围内仍未完成的框架实现项。`ScopedSequence.match` 已通过当前 release gate，达到发布新版本的代码标准。
