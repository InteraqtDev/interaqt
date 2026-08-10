# tx-dispatch-path-uniqueness — 实现审计（M-02）

status: 通过  
milestone: M-02  
implementation-round-audited: 2/10  
convergence-mode: normal  
auditor: independent additional task 4  
date: 2026-08-10

## 结论

**M-02 验收通过，无实现缺陷。** 将里程碑标记为 `已完成`。

未触发 reopen；`convergence-mode` 保持 `normal`。不存在需维护的 Convergence Note。

M-01 与 M-02 均已完成。本审计轮已执行最终核验（见 §5）；任务目标达成，设置 `status: 已完成`。

---

## 1. 验收复验

| 命令 | 结果 |
|------|------|
| `rg -n "Prefer BT\|not a complete official path\|not the complete official path" agent/agentspace/knowledge AGENTS.md README.md CHANGELOG.md` | **无命中**（exit 1） |
| `npx vitest run tests/runtime/businessTransaction.spec.ts tests/runtime/conditionAdmissionContext.spec.ts tests/runtime/transactionAcceptance.spec.ts tests/runtime/transactionCapability.spec.ts` | **4 files / 56 tests passed** |
| `npm run check` | **通过**（`tsc --noEmit --skipLibCheck`） |
| `INTERAQT_POSTGRES_DATABASE=interaqt_test … npx vitest run tests/runtime/postgresqlBusinessTransaction.spec.ts tests/runtime/postgresqlConditionAdmission.spec.ts` | **2 files / 6 tests passed** |

已完成里程碑回归（M-01）：运行时 gate、I1/I1′/ABORTED 与 BT/admission 套件仍绿；真 PG 6 tests 绿。

---

## 2. 实现对照（Task / 设计 vs 交付）

### 2.1 Changelog 强制迁移（要求 4 / 设计 §3.3.1–3.3.2）

`CHANGELOG.md` 顶部 `[Unreleased]`：

- **Breaking**：`DISPATCH_IN_NON_BT_TRANSACTION` 硬失败；**Must migrate**；合法/非法路径写清；明确**不**自动升级 bare RIT。
- **Forced migration table** 四行均在：RIT+dispatch→BT；手写锁→`Condition.locks`+snapshot；`event.error`/污染 payload→结构化 allowed；鸭式 `type`→`InteractionGuardError.code`。
- **Boundary error codes** 表含新增 code 与既有 code。
- **Deprecations**：`ConditionError` 历史/仍导出，指向 `InteractionGuardError` + `code`。
- 未 bump `package.json` version（符合非目标 / Unreleased 占位）。

usage `06-attributive-permissions.md` 同步含合同表硬错误行与 forced migration 表。

### 2.2 §1.4 文档扫尾（要求 5 / 设计 §3.3.3）

| 路径 | 硬错误 + code | 纯 RIT 无 dispatch 仍合法 |
|------|---------------|---------------------------|
| `usage/06-attributive-permissions.md` | 是 | 是 |
| `usage/19-common-anti-patterns.md` | 是（反模式 + checklist） | 是 |
| `usage/18-api-exports-reference.md` | 是 | 是 |
| `usage/20-postgresql-concurrency-migration.md` | 是 | 是 |
| `usage/05-interactions.md` | 是（含 boundary 永不 soft-wrap） | 是 |
| `usage/14-api-reference.md` | 是 | 是 |
| `generator/api-reference.md` | 是 | 是 |
| `generator/permission-implementation.md` | 是 | （checklist：never bare RIT+dispatch） |
| `generator/permission-test-implementation.md` | 是（负向注释） | — |
| `AGENTS.md` | 是 | 是 |
| `README.md` | 是 | 是 |

软放行短语验收扫描：**无命中**。CHANGELOG 中仅在 Docs 节说明「不再描述为 soft prefer BT」，属已硬失败的历史对比，符合验收「或仅出现在明确历史/对比过时描述且标注已硬失败」。

generator 与 usage 对路径唯一、BT 所有权、boundary codes 表述一致，无互相矛盾。

### 2.3 官方示例 / 测试以 `code` 为正式断言面（要求 6）

- `permission-test-implementation.md`：top-level soft 与 BT abort 示例均以 `InteractionGuardError.code` / `conditionName` 为主；`type === 'condition check failed'` 仅标 optional historical / not sole discriminant。
- `businessTransaction.spec.ts`（M-01 引入、本轮未回退）：I1/I1′/ABORTED 与 BT reject 以稳定 `code` 断言。
- 相关 runtime 套件 56 tests 绿。

### 2.4 ConditionError 文档降级（要求 7）

- usage `18`：导出列表标注 DEPRECATED；笔记指向 `InteractionGuardError` + `.code`。
- CHANGELOG Deprecations 节。
- `src/runtime/errors/ConditionErrors.ts`：`@deprecated` JSDoc。
- `src/runtime/index.ts` / 包入口仍 `export { ConditionError }` — **未删符号**。

### 2.5 非目标守门

- 无 RIT→BT 自动升级（changelog/文档/代码均声明 illegal + 不升级）。
- 未开放嵌套 dispatch；未改 SAVEPOINT/defer SE/locks/结果代数。
- 顶层 soft `result.error` 合同仍在文档中与 BT abort 正交说明。
- 未 bump package version；未做 Mesh 迁移。

---

## 3. 对抗性检查

### 3.1 软表述残留

- 精确验收 `rg`：无命中。
- 扩大扫描 `prefer`/`optional`/`gray path` 等邻近 bare RIT+dispatch：未发现把非法路径写回「可选/建议」的段落。
- 各 §1.4 文件均含 `DISPATCH_IN_NON_BT_TRANSACTION`（至少一处）。

### 3.2 文档—实现一致性

`Controller.dispatch` 仍为 try 外：

1. NestedDispatch  
2. `isInTransaction() && bt?.active !== true` → `DISPATCH_IN_NON_BT_TRANSACTION`  
3. BT aborted → `ABORTED`  

与文档「boundary errors always throw / never soft-wrapped」一致。

### 3.3 问题分类

| 类型 | 数量 | 说明 |
|------|------|------|
| 实现缺陷 | **0** | — |
| 验证缺口（需加强且已处理） | **0** | 文档验收以清单 + rg + 对照实现为主；运行时判别力已在 a1 缺陷注入证明 |
| 实现注意事项（不阻塞） | 0 | — |

---

## 4. 状态更新指示

- M-02：`待审` → **`已完成`**
- `reopen-count` / `reopen-domains`：不变（0 / ∅）
- 全部里程碑已完成 → 最终核验通过 → **`status: 已完成`**
- `next-action` → **无**
- 预算：`k=2 < N=10`；任务正常完成，**不**启动新 chat

---

## 5. 最终核验（全里程碑 + Task 要求）

### 5.1 验收命令汇总

| 范围 | 结果 |
|------|------|
| M-01 相关 4 files / 56 tests | 通过 |
| M-02 文档 soft-phrase rg | 无命中 |
| `npm run check` | 通过 |
| 真 PG BT + admission 6 tests | 通过 |

### 5.2 Task 要求逐项

| # | 要求 | 结论 |
|---|------|------|
| 1 | 求证灰色路径 | 设计 §1.2 已完成；实现硬失败后非法路径不再允许 |
| 2 | P0 路径唯一硬失败 | M-01：try 外 `DISPATCH_IN_NON_BT_TRANSACTION`；I1/I1′ |
| 3 | P0 边界 code 可识别 | 联合类型 + 默认文案 + 测试；既有 code 保持 |
| 4 | P0 强制升级说明 | CHANGELOG Unreleased 迁移表 + usage 06 |
| 5 | P1 文档/generator 路径唯一 | §1.4 全扫尾；AGENTS/README 硬约束 |
| 6 | P1 测试/示例以 code 断言 | permission-test + businessTransaction 新/改用例 |
| 7 | P2 ConditionError 降级 | 文档 + JSDoc deprecated；符号仍导出 |
| 8 | 非目标 | 抽查无越界 |
| 9 | 交付纪律 | Vitest / check / 真 PG 绿；汇合点修复；灰色路径 breaking |

### 5.3 证据索引

- Diff：`CHANGELOG.md`、`AGENTS.md`、`README.md`、`agent/agentspace/knowledge/**`（usage + generator）、`src/runtime/errors/ConditionErrors.ts`；运行时仍含 M-01 的 `Controller.ts` / `transaction.ts` / `businessTransaction.spec.ts`
- 设计：`docs/tx-dispatch-path-uniqueness/tx-dispatch-path-uniqueness.md` §3.3、§4 M-02
- 复验：本审计会话 2026-08-10
