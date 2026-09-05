# 实现审计（第 6 轮，最终核验）：M-04 修正复验 + 全任务终验

审计对象：k=6 的 D1 修正（知识文档 §1 读者枚举）及其后的 M-04 全部验收命令。生产代码自 a=4 记录的 k=4 结束态以来零改动（`git diff --stat -- src/` = 5 文件 +78/−64，逐字一致；M-04 两轮均只触及文档与测试登记文件）。

审计时点：实现轮 k=6 之后。结论：**验收命令全部独立复验通过，D1 修正与代码/设计/CHANGELOG 三方一致，未发现新的实现缺陷或验证缺口 → M-04 `待审` → `已完成`。四个里程碑全部关闭，触发最终核验；最终核验全部通过 → `status: 已完成`，任务终止。**

## 1. M-04 验收命令复验（全部独立重跑）

| 命令 | 结果 | 与 k=6 记录 |
|---|---|---|
| `npm run check` | 通过 | 一致 |
| `npm run build` | 通过；`static derive` 进入 `dist/core/Entity.d.ts:186` / `Property.d.ts:84` / `Relation.d.ts:153` | 一致 |
| `rg -c "derive\|destroy"` 三文档 | 知识文档 11、usage 6、CHANGELOG 24；`rg -n "运行时派生定义" tests/runtime/WritingComputationTests.md` 1 行（`:321`） | 一致 |
| `npm test` 全量 | 234 文件通过 / 15 skip，**2769 通过 / 66 skip / 0 失败**（117.9 s） | 与 k=5 / k=6 / a=4 基线完全一致 |
| 定向：`derivedDefinitionRetention` + `tests/core` | 28 文件 / 597 用例全绿（13 用例无 skip，可回收性用例无条件运行） | 一致 |

## 2. D1 修正的对抗性复核（本轮核心审查）

**修正内容核实**（`agentspace/knowledge/controller-lifecycle-and-declaration-registry.md` §1 第 13–20 行）：

- 「`stringifyAllInstances()` 产物供 `parse`（`createInstancesFromString`）做 graph 级回读」——与 `src/builtins/interaction/Interaction.ts:211` 注释（`stringifyAllInstances → createInstancesFromString` round-trip）及 `src/core/utils.ts:163`（`createInstancesFromString` 定义）一致。
- 「migration manifest **不**是其消费者——`createMigrationManifest` 读 controller 图（`controller.entities` / `relations` / `dict` / `scheduler.computationsHandles`）与 storage schema，不读注册表、不调用 `stringifyAllInstances`」——逐字段对照 `src/runtime/migration.ts:1010–1117`：函数签名 `(controller, storageSchema, options)`，records 来自 `controller.entities.map`（:1012）、relations 来自 `controller.relations`（:1042、:1065）、dictionaries 来自 `controller.dict`（:1078）、computations 来自 `controller.scheduler.computationsHandles.values()`（:1091、:2553、:2765）；`rg "stringifyAllInstances|KlassByName|\.instances" src/runtime/migration.ts` **零命中**。
- 三方一致：知识文档 :14–18 ↔ CHANGELOG:28（「the migration manifest never read the registries」）↔ 设计 §1.1，无矛盾。
- 保留「这也是『派生定义移出序列化输出不影响 migration manifest』的依据」——正确保留了本任务安全论证的承重事实，符合 a=5 §2 D1 要求的修正形态。

**同类检查范围与全部命中**：三文档 + 维度行中全部「谁读注册表 / 谁消费序列化输出」表述——

- `rg -n "migration manifest"` 三文档：仅知识文档 :14/:18（即修正后的正确表述）与 CHANGELOG:28（一致事实），无错误同类。
- 生产侧唯一相关命中 `src/core/utils.ts:80`（`decodeFunctionValues` 的 SECURITY 注释把「stringifyAllInstances 的产物、migration manifest 等」并列为**必须与应用源码同信任级**的输入示例）——该句主张的是信任边界（两类制品都含 `func::` 编码），不是「manifest 消费 stringifyAllInstances 输出」，事实成立，不构成同类缺陷。
- `rg -n "\.instances\b" src/` 全量复核：生产读者仍只有各 Klass `create()` 内部的 uuid 去重、`ScopedSequence.deserializeEntityRef`（:91–99）与 `utils.ts` 的 `clearAllInstances` / `stringifyAllInstances`；与知识文档 §1 枚举一致。

**合同 §3 五条保证与 `teardown` 对照表未被顺手扩写**（a=5 §4 注意事项 1 遵守）：destroy 链（`MonoSystem.ts:2548` → `storage.destroy()` → `db.close()`，`MonoSystem.ts:2045`）、`teardown()`（`Controller.ts:596` → `Scheduler.teardown()`）、`getBoundStateName` 名形态（`Scheduler.ts:250–258`）逐点与代码一致。

## 3. 受影响已完成里程碑复验（M-01..M-03）

| 命令 | 结果 |
|---|---|
| `tests/runtime/derivedDefinitionRetention.spec.ts` + `tests/core`（M-01/M-02/M-03 验收入口） | 28 文件 / 597 用例全绿 |
| `tests/storage` 全量（含 `writePathStructuralFuzz` 默认池） | 85 文件 / 846 通过 / 8 skip，与基线一致 |
| migration + review-fixes 六套件（`migration` / `migrationGenerativeFuzz` / `migrationDestructiveFuzz` / `applicationIdentityMigration` / r23 / r12） | 6 文件 / 163 用例全绿 |
| 真实 PostgreSQL（本机 17.6，`INTERAQT_POSTGRES_DATABASE=interaqt_test …` `npm run test:postgres`） | 11 文件 / 48 用例全绿 |

## 4. 最终核验（全部里程碑完成后，按 additional task 4 第 11 条）

### 4.1 Task 要求逐项检查

| 要求 | 核验结果 |
|---|---|
| 1 求证（硬前置） | 设计 §1.3 完成：最小复现（PGLite 每轮 `Entity+3/Relation+5/Property+9`、三 WeakRef 存活、RSS +≈215 MB；SQLite 对照同增量）、两个因果实验（截断 Property 后仍存活 → 第二族链；截断三注册表后全释放 → 无其它静态根）、8 个登记点枚举（R1–R8）。审计 a=1–a=4 各轮独立复核过证据链 |
| 2 FR-RET-01 | 汇合点 `Entity/Relation/Property.derive`（共享 `validateCreateArgs`，`create()` 校验与错误信息逐字不变，a=3 逐行对照）；R1–R8 全部改走 `derive`（R1/R2 经 `prepareEntitiesForStorage` 汇合，diff 逐项核实）；`defaultValue` 闭包只捕获纯值；无截断式清理；用户声明语义不变（`create` 仍登记，对照用例在 `deriveDefinition.spec.ts`）。13 用例注册表不变量 / 可回收性 / 纯净性全绿 |
| 3 FR-RET-02 | 裁定 `system.destroy()` + 丢弃引用为唯一结束合同（因果实验 B 证明无需新 API）；知识文档 + usage `13-testing.md` + CHANGELOG Unreleased 三处落地，含 `teardown()` 场景区分 |
| 4 不变量与回归 | 注册表不变量（无条件，pglite+sqlite）、可回收性（无条件，`v8.setFlagsFromString` 兜底）、纯净性、per-site R1–R8 + sweep（setup 后 destroy 前捕获证据，a=2 加强）、migration 轨、闭包捕获断言——13 用例全绿；allowlist spec（站点级结构谓词，a=3 加强）绿；维度注册表回填（`WritingComputationTests.md:321`）；要求列出的全部既有套件 + 真实 PG 复跑全绿 |
| 5 非目标 | 未动 uuid 去重算法（`Property.create` 线性 `find` 原样）；`clearAllInstances` 无生产调用点、无自动清理；驱动零改动；Klass 模式与序列化格式未重构；未新增结束 API |

### 4.2 项目基础测试

`npm run check` 通过；`npm run build` 通过（`derive` 进入三个 d.ts）；`npm test` 全量 234 文件 / 2769 通过 / 66 skip / 0 失败；真实 PostgreSQL 11 文件 / 48 用例全绿。与任务基线（§1.5）相比零新增失败。

### 4.3 工作树观察

`prompt/skill/` 两文件的改动是任务协议自身的会话启动工具（a=4 已记录），非本任务生产改动，不参与构建测试。`agentspace/output/effect-ts-evaluation.md`、`prompt/output/controller-retention-via-property-instances.md` 为任务输入 / 无关产出，不在验收范围。

## 5. 裁定与状态更新

- **M-04：`待审` → `已完成`**。`reopen-count` 保持 1（本轮无 reopen；`文档事实准确性` 领域首次命中后本轮闭合）。
- M-01 / M-02 / M-03 维持`已完成`（§3 复验）。
- **全部里程碑已完成 → 最终核验（§4）全部通过 → 设计文档 `status: 已完成`，`next-action: 无`。任务终止，不启动新的 chat。**
