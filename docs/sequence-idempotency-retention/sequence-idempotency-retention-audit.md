# sequence-idempotency-retention — 实现审计（k=7-audit / M-06）

| 字段 | 值 |
|------|----|
| 角色 | additional task 4 独立实现审计 |
| 审计对象 | M-06 — 公开教义收敛、统一 `this.atomic`、导出与交叉回归 |
| 设计轮 | d=8 / 实现轮 k=7 |
| 审计前状态 | `待审`（k=7 闭合 D1 后） |
| 审计后状态 | `已完成` |
| reopen | 本轮无；累计 `reopen-count: 1`（领域 `knowledge-callback-this-doctrine: 1`，k=6-audit） |
| convergence-mode | `normal`（未再 reopen） |

## 1. 复验命令与结果

### 1.1 当前里程碑验收

```bash
npm run check
# → tsc --noEmit --skipLibCheck  EXIT 0

npx vitest run \
  tests/runtime/sequenceRange.spec.ts \
  tests/runtime/dispatchIdempotency.spec.ts \
  tests/runtime/entityRetention.spec.ts \
  tests/runtime/scopedSequence.spec.ts \
  tests/runtime/asyncTaskRetention.spec.ts
# → Test Files 5 passed | Tests 65 passed
#   sequenceRange 12 + dispatchIdempotency 13 + entityRetention 15
#   + scopedSequence 22 + asyncTaskRetention 3

INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 \
  PGUSER=interaqt PGPASSWORD=interaqt \
  npx vitest run tests/runtime/postgresqlSequenceRange.spec.ts
# → 2 passed（真实 PG 双连接）
```

自动化验收**通过**。

### 1.2 k=6-audit D1 门闩（generator 教义）

```bash
rg -n "callback:.*function\(this: Controller" \
  agent/agentspace/knowledge/generator/api-reference.md
# → no matches (exit 1)

rg -n "bound to the Controller instance, providing access to system APIs via \`this\.system\.storage\`" \
  agent/agentspace/knowledge/generator/api-reference.md
# → no matches

rg -n "this: \{ controller: Controller, state: any \}" \
  agent/agentspace/knowledge/generator/api-reference.md
# → no matches
```

结构化扫描（`Transform.create(...)` 块内）：

- `function(this: Controller`：**0**
- 推荐路径上的 `this.system.storage`：**0**（仅「Do not generate dual-path…」否定句保留旧字符串）
- 全部 Transform `callback` 示例均为 `this: ComputationActionContext`，存储经 `this.controller.system.storage` / `this.controller.globals`
- Custom 参数合同：`ComputationActionContext` 且显式含 `controller` + `atomic`（+ `state?` / `getState?`）

合法保留的 `this: Controller` / `this.system.storage`（不在 D1 范围）：

- EventSource `guard` / `resolve` / `afterDispatch`
- StateMachine `computeTarget`、StateNode `computeValue`（运行时 `call(controller, …)`）
- Condition `content`、DataPolicy `match`

其它 generator 文（`computation-implementation` / `basic-interaction-generation` / `entity-relation-generation`）无第二处 Transform `this: Controller` 合同。跨 knowledge 树扫描 Transform 回调旧绑定：**0**。

### 1.3 受影响的已完成里程碑与相关回归

```bash
npx vitest run \
  tests/runtime/versionControlExample.spec.ts \
  tests/runtime/versionControlHardDeleteExample.spec.ts \
  tests/runtime/versionControlHardDeleteExample2.spec.ts \
  tests/runtime/eventSource.spec.ts \
  tests/runtime/transactionAcceptance.spec.ts \
  tests/runtime/transactionRetry.spec.ts \
  tests/core/serialization.spec.ts \
  tests/builtins/serialization-r8.spec.ts \
  tests/core/callbackSynchronyContract.spec.ts
# → 9 files / 92 passed

INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 \
  PGUSER=interaqt PGPASSWORD=interaqt \
  npx vitest run tests/runtime/postgresqlScopedSequence.spec.ts
# → 2 passed
```

- M-01…M-05 合同未回退（含在 65 + 上述回归 + PG 套件中）。
- 真实 PG range / scoped sequence 并发合同未回退。

## 2. 源码与教义对抗核对（相对设计 §3.1 / M-06 / 要求 8）

| 可观察结果 | 证据 |
|------------|------|
| `ComputationActionContext` = `{ controller, atomic, state?, getState? }` | `src/runtime/computations/Computation.ts`；经 `computations/index` → `runtime/index` → 根 `src/index` 导出 |
| Transform 回调 `this` 注入 `controller`+`atomic` | `Transform.ts` `actionContext` + `bind`/`call` |
| Custom 全回调路径走 `buildActionContext()` | `Custom.ts` |
| 官方多行票号仅 `this.atomic.reserveSequenceRange` | `sequenceRange.spec.ts` Transform/Custom 合同；usage/generator 否定循环 `nextSequenceValue` |
| usage 删除扫 effects / 手写 prune 推荐 | `usage/05`/`14`/`19`/`04`；改为 `outcome` 与 `maintainEntityRetention` |
| generator 主体合同与运行时一致（D1 已闭合） | `generator/api-reference.md` Transform/Custom 合同与 10 处 callback |
| 类型与 CHANGELOG | `npm run check` EXIT 0；`CHANGELOG.md` Unreleased 含三条能力 + 教义条目 |

## 3. 验证缺口处理

无单独「产品正确但验收过弱且本轮必须注入缺陷」项。  
k=6-audit 建议的 generator 门闩已在本轮以独立 `rg` + 块扫描复验通过；未新增永久文档 lint 套件（非关闭阻塞）。

## 4. 实现缺陷

无。D1（`knowledge-callback-this-doctrine`）已在 k=7 按清单修正并通过本轮复验。

## 5. 全部里程碑最终核验（Task 要求逐项）

| 要求 | 结论 |
|------|------|
| 1 求证 | M-01 已完成；三 FR 缺口曾真实存在 |
| 2 FR-SEQ-01 | `reserveSequenceRange` + 共享内核；`sequenceRange` 12 passed；真实 PG 双连接 `postgresqlSequenceRange` 2 passed；官方路径 `this.atomic` |
| 3 FR-IDEM-01 | 声明式幂等 + `outcome` + admit/open 唯一管道；`dispatchIdempotency` 13 passed（含 Activity ★1/★4、IN_FLIGHT） |
| 4 FR-RET-01 | `Entity.retention` + `maintainEntityRetention`；`entityRetention` 15 passed |
| 5 与现有能力关系 | 扩展 atomic / DispatchResponse / Entity / migration 签名；未重做准入锁/BT/id |
| 6 交付与验证纪律 | 三 FR 合同可独立执行；check + runtime 套件 + 真实 PG 已跑绿 |
| 7 范围边界 | 仅框架 API/实现/文档/测试 |
| 8 无历史兼容负担 | 双 this / 循环 next / 扫 effects / 手写 prune 已从官方教义删除并改为否定；generator 主体与 usage 一致 |

里程碑终态：M-01…M-06 全部 `已完成`。`k=7 < N=30`，预算满足。

## 6. 裁决

- 审计前 `待审` → 审计后 **`已完成`**
- 无实现缺陷；无 reopen 增量
- `current-milestone-reopens` 保持历史值 `1`（M-06 累计）
- `convergence-mode`: `normal`
- `status`: **`已完成`**
- `next-action`: **无**
- 全部里程碑已完成且最终核验通过 → **任务终止**，不启动新的 chat
