# Data Migration Computation Safety Test Matrix

## 结论

本轮补齐了 Phase 1.5 compute-route migration 的 computation 安全测试矩阵。覆盖目标不是让所有变体都自动迁移，而是对每个 computation 类型做到：

1. 可安全重算的变体有正向迁移测试。
2. 需要人工语义确认的变体有 approved diff changed / unchanged 测试。
3. 需要外部 handler 的变体有 required decision / handler 测试。
4. 不能安全执行的变体在 dry-run 阶段 fail fast。
5. entity/relation 输出只允许有稳定 `sourceRecordId + transformIndex` 映射的 data-based `Transform` 进入 compute-route 重算。

## Computation 类型覆盖

| Computation | Global | Property | Entity Output | Relation Output | Event/Async/Safety |
| --- | --- | --- | --- | --- | --- |
| `Custom` | added / changed / downstream / async handler / state-only | added / chain / deletion / `_isDeleted_` destructive scope / fact takeover | non-Transform output blocked, including fact takeover | non-Transform output blocked, including fact takeover | function review, async handler, side-effect isolation |
| `Transform` | N/A | N/A | added / changed / stale cleanup / ownership proof / fact takeover | added relation output / fact takeover | event-based Transform blocked without handler; full compute skips null consistently |
| `Count` | added / filtered downstream / relation path downstream | relation aggregate migration events / fact takeover | N/A | N/A | related mutation event shape covered |
| `Summation` | downstream from changed Transform | existing relation aggregate matrix baseline / fact takeover | N/A | N/A | dependency ordering covered |
| `Average` | added global, changed/unchanged review | added relation property aggregate / fact takeover | N/A | N/A | state rebuild via full compute covered |
| `WeightedSummation` | added global, changed/unchanged review | added relation property aggregate / fact takeover | N/A | N/A | callback review covered |
| `Any` | added global, changed/unchanged review | added relation property aggregate / fact takeover | N/A | N/A | callback review covered |
| `Every` | added global, changed/unchanged review | added relation property aggregate / fact takeover | N/A | N/A | callback review covered |
| `RealTime` | added global | added property / fact takeover | N/A | N/A | callback review and state writes covered |
| `StateMachine` | handler-driven migration | handler-driven migration; fact takeover blocked | N/A | N/A | missing handler blocked, handler result validation covered |

## 新增/强化测试

本轮新增或强化的重点用例在 `tests/runtime/migration.spec.ts`：

1. `migrates added global built-in aggregate computations`
2. `approved changed and unchanged decisions control built-in global aggregate rebuilds`
3. `migrates added relation property aggregate built-ins`
4. `migrates added RealTime global and property computations`
5. `global StateMachine migration uses approved event rebuild handler`
6. `migrate rebuilds added Transform relation output from existing relation records`
7. `non-Transform entity and relation output computations are blocked in dry-run`
8. `event-based Transform dry-run requires an external rebuild handler`
9. `deleting async computed property reports unsupported internal task cleanup`
10. `dry-run reports computed property deletion physical cleanup as unsupported`
11. `fact property takeover matrix covers built-in property computations`
12. `fact entity and relation takeover to non-Transform output computations remains blocked`

## Fact-to-computation takeover 覆盖

Task 3 的 “手写转为受控” 场景现在由以下矩阵覆盖：

| 场景 | 覆盖点 |
| --- | --- |
| `Custom` property takeover | 覆盖旧值、旧值相等也触发下游、旧值缺失 host 也重算、`skip` 转 `null`、non-null `skip` fail-fast、handler 输入不包含旧 target 值 |
| Built-in property takeover | 同一用例覆盖 `Count` / `Summation` / `Average` / `WeightedSummation` / `Any` / `Every` / `RealTime` 从旧 fact property 转为 computation 控制 |
| `StateMachine` property takeover | 明确 blocking，直到 state rebuild handler 能保证 bound state 一致性 |
| `Transform` entity takeover | 需要 `computation-takeover`、`computation: changed` 和 destructive ids；清理旧 fact records 后重建 |
| `Transform` relation takeover | 需要精确 destructive link ids；清理旧 fact links 后重建 |
| 审批后数据变化 | property count/host count、entity ids、relation link ids 在执行期重新读取，不匹配则失败 |
| 非 `Transform` entity/relation takeover | 即使有 takeover 审批，也因无法安全 full rebuild 而 blocking |

## 实现收口

本轮实现改动：

1. `getRecomputeBlockingChanges()` 对所有 event-based computation 在 dry-run 阶段要求 approved event rebuild handler。
2. 删除 computed property 时不再静默跳过物理 cleanup，而是明确 blocking。
3. framework-generated async task record 删除被归因为 async task cleanup unsupported。
4. 非 `Transform` 的 entity/relation output computation 在 dry-run 阶段 blocking。
5. `Transform.compute()` full recompute 路径跳过 `null` 返回，与 incremental Transform 语义一致。
6. `computation-takeover` decision 显式授权旧 fact output 被 `discard-and-rebuild`，但不替代 `computation: changed` review。
7. entity/relation takeover 绑定 destructive-scope ids；property takeover 绑定 existing/host count 并覆盖所有 host records。

## 验证

已通过：

1. `npx vitest run tests/runtime/migration.spec.ts`
2. `npx vitest run tests/runtime/transform.spec.ts`
3. `npm run check:runtime`
4. `npm run test:runtime`
5. `PGHOST=<temp socket> PGPORT=<temp port> PGDATABASE=postgres INTERAQT_POSTGRES_DATABASE=interaqt_migration_matrix npx vitest run tests/runtime/postgresqlMigration.spec.ts`
6. `npx vitest run tests/runtime/migration.spec.ts -t "takeover"`

## PostgreSQL Driver Matrix

`tests/runtime/postgresqlMigration.spec.ts` 现在覆盖 PostgreSQL 专项矩阵：

| 测试 | 覆盖点 |
| --- | --- |
| `runs compute migration against real PostgreSQL and persists manifest` | 基础 computed property backfill、manifest 持久化 |
| `runs a PostgreSQL computation safety matrix in one approved migration` | 大组合：`Custom` property、relation property `Average` / `WeightedSummation` / `Any` / `Every`、`RealTime` global/property、property `StateMachine` handler、async handler、`Transform` entity output |
| `keeps PostgreSQL dry-run read-only while reporting schema and safety gates` | `openForSchemaRead()` 只读 dry-run、add column plan 不落库、computed cleanup blocking |
| `reports PostgreSQL event, async, output ownership, and fact deletion safety gates` | event handler gate、async handler gate、non-Transform entity output blocking、fact entity deletion blocking |
| `creates PostgreSQL post-recompute constraints after a combined backfill` | computed property backfill 后创建 non-null / unique constraints |
| `resumes PostgreSQL schema migration using operation log` | PostgreSQL DDL operation-level resume |

这些测试默认在 `INTERAQT_POSTGRES_DATABASE` 未设置时跳过；本轮用本机临时 PostgreSQL cluster 真实执行通过。

## 仍属于非 Phase 1.5 自动执行能力的边界

这些边界现在都有 fail-fast 或 handler gate，不属于自动迁移能力：

1. event-based computation 没有 approved handler。
2. async computation 没有 approved completion handler。
3. 非 `Transform` entity/relation output 的 full replace。
4. 删除旧 computed column、async task table、fact entity table 的 destructive physical cleanup。
5. rename/copy/merge/split 和 fact physical path move。
6. `StateMachine` property takeover。
