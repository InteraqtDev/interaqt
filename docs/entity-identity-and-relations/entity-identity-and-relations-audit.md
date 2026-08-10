# entity-identity-and-relations — 实现审计

status: 通过（M-05 已完成；Task 全部里程碑关闭）
milestone: M-05
implementation-round-audited: 6/25
convergence-mode: normal
reopen: 无（本轮未退回）
reopen-domains: ∅（M-05）；M-01 累计 { 框架逻辑 id UNIQUE INDEX setup 幂等: 1 }（本轮未增加）

## 复验

| 命令 | 结果 |
|------|------|
| `npm run check` | 绿 |
| `npx vitest run tests/runtime/entityIdentity.spec.ts tests/runtime/review-fixes-2026-07-10-r13.spec.ts tests/runtime/transform.spec.ts tests/runtime/transformInteraction.spec.ts tests/runtime/transformUpdatePath.spec.ts` | **40 passed / 2 skipped**（无 PG/MySQL env：新增 PG 序列用例 skip + MySQL 可选 skip） |
| 同上 + `INTERAQT_POSTGRES_DATABASE=interaqt_test` 定向 `PostgreSQL: external large id advances sequence` | **1 passed**（审计轮补钉 V7） |
| `npx vitest run tests/storage/writePathStructuralFuzz.spec.ts` | **16 passed**（默认池） |
| `FUZZ_SEED_START=100 FUZZ_SEED_COUNT=20 FUZZ_OPS=40 npx vitest run tests/storage/writePathStructuralFuzz.spec.ts` | **28 passed** |
| `npx vitest run tests/storage/driverDifferentialFuzz.spec.ts` | **6 passed / 8 skipped**（SQLite↔PGLite；真实次驱动 env 未开） |
| `npx vitest run tests/runtime/migrationGenerativeFuzz.spec.ts` | **7 passed** |
| `npx vitest run tests/runtime/dataConstraints.spec.ts` | **14 passed** |
| 真实 PG：`postgresqlIdConsistency` + `postgresqlConcurrency` + `postgresqlDataConstraints` | **20 passed** |
| M-04 主验收 `rg`（永远禁止 id 模式） | exit 1 / 零命中 |
| 已完成 M-01–M-04 相关套件随上表复验 | 无回归 |

本轮实现者未新增生产 `src/`（M-01–M-04 已落地）。审计轮仅加强验收（真实 PostgreSQL `noteAllocatedId` 序列推进），未改产品路径。

## 对照设计的实现审查（M-05 + 全栈复核）

### 单一身份不变量（M-01）

| 设计点 | 实现 | 证据 |
|--------|------|------|
| §3.3.1 参考函数 per non-filtered × `idField` | `frameworkLogicalIdUniqueIndexes` / `createFrameworkLogicalIdUniqueIndexSQL` | `SchemaDialect.ts`；entityIdentity 物理列/合表用例 |
| 绕过用户 UniqueConstraint 总闸 | setup + migration postRecompute 专有 emit；MySQL `unique:false` 保持 | MonoSystem setup/migration；dataConstraints + mysql-like 探针 |
| setup 再入幂等 | `isIndexAlreadyExists` catch；IF NOT EXISTS 方言仍安全 | entityIdentity reentry + catch-path stub |
| update 身份不可变 | `CreationExecutor.preprocessSameRowData` 固定 `oldRecord.id` | entityIdentity update 用例 |
| 外部 id 推进发号 | SQLite/MySQL/PostgreSQL `noteAllocatedId`；resolvedBase 与 allocate 一致 | SQLite 用例 + **审计补钉真实 PG** |

### Transform / 写回（M-02）

| 设计点 | 实现 | 证据 |
|--------|------|------|
| 删除创建禁令 `assertNoIdInTransformedRecord` | 已删；文件头注释与 §3.2 一致 | Transform.ts；rg 无符号 |
| insert 透传 id | compute / event / data-based create | entityIdentity M-02；r13 合法 id insert |
| update 双层剥离 | Transform update 分支 + `Controller.applyResultPatch` | entityIdentity strip spy 用例 |
| 自然 spread 不静默双行 | 唯一索引 fail-loud | r13 F-3 `ConstraintViolationError` |

### E2E / 文档（M-03、M-04）

- 预生成 id × Relation `{id}` × nested AQ × SM `computeTarget`：entityIdentity M-03（含双行选择性）。
- §3.6 锚点与 AGENTS.md：与运行时一致；绝对禁令 `rg` 空。

### 回归面（M-05）

- 兼容超集：transform 幸福路径与省略 id 创建仍绿。
- 写路径：structural fuzz 默认 + 扩展种子；migration generative 默认池。
- 驱动：differential SQLite↔PGLite；真实 PG id/concurrency/constraints。
- 分层：无向上依赖；身份闸在 storage + Controller 汇合点。

### 实现缺陷

本轮**无**阻塞关闭的实现缺陷。产品行为与设计 §3 / Task 要求 1–10 对齐。

### 验证缺口

| ID | 描述 | 处理 |
|----|------|------|
| V7 | M-05 验收与既有用例只钉 SQLite 的 create-path 序列推进；PostgreSQL `noteAllocatedId`（`setval` 守卫 SQL）无真实驱动可执行断言，与设计「改序列推进须跑真实 PG」及 AGENTS「driver-branch fixes need dialect-matched probes」不完全对齐。当前实现未被证明错误。 | **审计轮直接加强**：`entityIdentity` 增加 env-gated「PostgreSQL: external large id advances sequence — auto creates do not collide」（含重复 external id fail-loud）。定向复验 **1 passed**。里程碑继续关闭，不退回实现轮。 |

无第二轮同域验证缺口（V7 为首次该域在 M-05 暴露）。

### 非阻塞观察

- 无真实 MySQL env 时，MySQL 在线序列 / 真实唯一冲突仍依赖 dialect 探针 + 可选 env 用例（既有 M-01 范围）。
- `usage/14-api-reference.md` 仍以省略 id 示例为主（M-04 非阻塞观察延续）。
- 迁移 `applyMigrationOperations` 对 framework id UNIQUE 依赖操作日志幂等 + 方言 `IF NOT EXISTS`（PG/SQLite）；MySQL 迁移再入若无日志会撞名——与既有用户约束迁移模型同类，非本任务身份语义回退；`setup(false)` 路径已有 catch。

## Task 要求逐项（最终核验）

| # | 要求 | 结论 |
|---|------|------|
| 1 | 求证 | 设计 §1；问题成立且含存储不变量 |
| 2 | 范围 | 非文档-only；未无证据扩大 |
| 3 | 单一身份 | id 可选创建 / 更新不可变 / Relation `{id}` |
| 4 | Transform 写回 | insert 允许；update/delete 认 affectedId；汇合点收敛 |
| 5 | Relation / computeTarget | M-03 E2E |
| 6 | 兼容超集 | transform/r13 正对照 + 省略 id |
| 7 | 文档 | M-04；绝对禁令清空 |
| 8 | 测试 | entityIdentity + r13 + fuzz + 真实 PG（含 V7） |
| 9 | 非目标 | 无 *Id 升格、无双轨、无 identity 桥、无迁移工具 |
| 10 | 工程 | 分层与一类一修；无无关重构 |

## 结论

- **M-05：验收通过，无实现缺陷 → 状态 `已完成`。**
- 验证缺口 V7 由审计轮加强后闭合；**不**计 reopen。
- `current-milestone-reopens` 保持 0（M-05）。
- `convergence-mode: normal`。
- **全部里程碑 M-01–M-05 已完成。** 最终核验通过 → Task `status: 已完成`。
- **next-action：** 无。不启动新 chat。

## 状态更新指令（已写入设计文档 / retro）

- M-05：`待审` → `已完成`
- `status: 已完成`
- `current-milestone: M-05`（终态）
- `next-action: 无`
- `implementation-round` 保持 `6/25`（本轮为审计，不增加 k）
