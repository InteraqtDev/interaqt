# 应用键的跨副本原子占有 — 实现审计

```text
audit-of: k=6
milestone: M-01
conclusion: 通过
reopen: 无
reopen-count: 2（保持；本轮未退回）
reopen-domains: { filtered-membership-events: 1, identity-merged-link-record: 1 }
convergence-mode: normal
```

不得信任里程碑状态。k=6 将第二步补丁改为按物理列写入 `insertSameRowData` 会写而第一步未写的同行。本轮独立复验该合同、按有限领域一次列全兄弟格，并注入 D-2 旧过滤器检验验收判别力。产品实现未被证明错误。

---

## 1. 复验

| 命令 | 结果 |
|------|------|
| `npx vitest run tests/runtime/applicationIdentity.spec.ts` | **71 passed**（加强前 62；加强后复验仍 71） |
| `npx vitest run tests/runtime/declarationTabooFuzz.spec.ts` | 81 passed |
| `FUZZ_SEED_START=100 FUZZ_SEED_COUNT=100 FUZZ_OPS=40 npx vitest run tests/storage/writePathStructuralFuzz.spec.ts` | 108 passed |
| `INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npx vitest run tests/runtime/postgresqlApplicationIdentity.spec.ts` | **7 passed**（原 6；新增真实 PG merged-link `&` / steal） |
| 基线 `dataConstraints` / `dispatchIdempotency` / `entityRetention` | 14 / 13 / 15 passed |
| `npx vitest run tests/runtime/applicationIdentityMigration.spec.ts tests/runtime/migrationGenerativeFuzz.spec.ts` | 9 + 7 passed |
| `npm run check` / `npm run build` | 通过 |

源码合同（`CreationExecutor.ts`）：`identityHostRelationPatchFields` 以宿主 `valueAttributes` 的**物理列名**为第一步集合，第二步写入 `getSameRowFieldAndValue()` 中其余列。观察路径仍在 `createRecordDependency` 之前返回。`insertSameRowData`（flash-out / relocate）仍不附加 `ON CONFLICT`。

---

## 2. 实现缺陷

无。k=5 的 D-2（只补实体 FK、丢掉 merged link id / `&`）在本轮实现中已闭合：`findRelationByName` 有行、1:1 抢夺只留一个 owner、`&` 与宿主 value 同名时关系载荷落在关系行上。D-1 的 related-record 成员资格快照时序本轮复验仍绿，不计入本轮 reopen。

---

## 3. 本轮加强的验证（不单独构成退回理由）

同一验证领域（身份宿主 merged-link 完整同行）在 k=5 已靠事后补 `findRelationByName` 才暴露 D-2。本轮按「有限领域一次列全」对照维度登记表与设计 §3.3.10，补上官方套件中仍缺的读者/拓扑/载荷格，而不是再加一条孤立条件：

| 格 | 断言 |
|----|------|
| n:1 `&` | 关系行有 `note`；观察不改写 |
| 两个 n:1 共享 owner | `findRelationByName` 长度 2 |
| 同一宿主两条 merged link | 两条关系名均可查 |
| 身份宿主 n:n isolated | 关系行 + link create 事件（`handleCreationReliance`，非第二步补丁） |
| 嵌套创建 identity 子记录 | 子键观察、父行两条、关系行两条 |
| 1:1 抢夺事件面 | 旧 link `delete` 1 + 新 link `create` 1 |
| 过滤名创建 + merged 1:1 | 关系行存在；二次观察不增行 |
| SQLite n:1 | `findRelationByName` 长度 1 |
| 宿主 create 事件 | 含 default-only 字段；关系 create 带 source/target 端点 |
| 真实 PostgreSQL | 1:1 `&` 落关系行 + steal 后仍一行 |

缺陷注入：将 `identityHostRelationPatchFields` 改回宿主 `attributes[field.name].isRecord` 后，steal 双 owner、`&` 关系载荷缺失、filtered relation 空、n:1 `&` 空、双 merged link 空、抢夺无 delete 事件均红。已完全还原；复验 71 / 7 全绿。

结构 fuzz 默认生成域仍不含 `Entity.identity`（108 绿不能替代上表）。未改 fuzz 生成器：改 rng 决策流会作废既有 seed 池，超出本轮验证加强范围。

---

## 4. 实现注意事项（不影响结论）

- `applicationIdentity.spec.ts` 仍有两套重复的 set-semantics 描述块。
- 身份宿主 create 事件只携带标量（含默认值），嵌套关系对象在关系 create 事件上；与 HEAD `preprocessSameRowData` 把写载荷嵌套对象放进宿主 create 的形态不同。本任务占用配方与 M-01 验收不依赖宿主 create 上的嵌套图；关系 create 端点已钉住。
- M-02 / M-03 / M-04 占用配方无 merged link；本轮真实 PG 已另加 merged-link 格，不推翻其并发/消费/迁移结论。

---

## 5. 状态

- M-01：`待审` → `已完成`。无实现缺陷，不增加 reopen。
- M-02 / M-03 / M-04：保持 `已完成`。
- `current-milestone: M-01`；`current-milestone-reopens: 2`；`convergence-mode: normal`。
- `implementation-round` 仍为 `6/20`（本轮是审计，不增加 `k`）。
- 全部里程碑已完成。最终核验见下节。`status: 已完成`。`next-action: 无`。

---

## 6. 最终核验（全部里程碑已完成）

### 6.1 里程碑验收命令

| 里程碑 | 命令 | 本轮结果 |
|--------|------|----------|
| M-01 | `applicationIdentity.spec.ts`；`declarationTabooFuzz`；writePathStructuralFuzz `FUZZ_SEED_START=100 COUNT=100 OPS=40` | 71 / 81 / 108 |
| M-02 / M-03 | `postgresqlApplicationIdentity.spec.ts`（真 PG） | 7 passed |
| M-03 配方 | `applicationIdentity.spec.ts` occupancy 组（含在 71 内） | 绿 |
| M-04 | `applicationIdentityMigration.spec.ts`；`entityRetention.spec.ts`；`migrationGenerativeFuzz` 默认池；`npm run check`；`npm run build` | 9 / 15 / 7 / 通过 / 通过 |

### 6.2 Task 要求逐项

| 要求 | 结论 |
|------|------|
| 1 求证缺口 | 设计 §1.3 成立；本轮未重做求证。官方路径已落地。 |
| 2 官方路径 | `Entity.identity` + Transform 登记 + StateMachine 消费 + `Entity.retention`；声明 + `Controller.dispatch`；无平行写 API。结果通道为 effects + 查询（§3.4）。 |
| 3 并发登记 | 真 PG 拓扑 a/b 各 10 轮；裸 INSERT 对照仍在套件中。 |
| 3 一次性消费 | 真 PG 拓扑 a/b；PGLite 真值表。 |
| 3 框架可见 | `records[].applicationIdentity` 进 modelHash；迁移 additive 索引 + NULL/重复键校验。 |
| 3 保留与 TTL 后重登记 | `entityRetention` 15；migration spec 回收后同键再登记。 |
| 4 非目标 | 无分布式锁/平行写 API/重做幂等或 retention；MySQL setup fail-fast。 |
| 5 既有能力 | UniqueConstraint 仍故障回滚；identity 不经其 Klass。 |
| 6 纪律 | 基线无新增失败；usage/generator/CHANGELOG 已在 M-04 交付；本轮只加强测试。 |
| 7 范围 | 框架 API / runtime / storage / 文档 / 测试。 |

无实现缺陷。任务终止，不启动新的 chat。
