```text
status: 需要修订 → 本轮结论见下
review-round: d7
design-round-reviewed: 7/15
conclusion: 通过
baseline-tests: sequenceRange + scopedSequence + asyncTaskRetention → 36 passed
git: a7f6ec856eafee428f327b627ad7648058ef85b8（工作树含 M-02 生产改动与任务文档）
```

# 设计复审 — sequence-idempotency-retention（d7）

## 结论

**通过**

在形成本结论前未读取旧版评审正文；依据 Task 1 要求、当前设计文档、`AGENTS.md` 原则，以及对源码与基线测试的直接核对。

六类设计复审条件均**未命中**需要阻塞下一实现轮的问题。d7 对 `needsScopedSequenceTable` 与对象型 `AtomicSequenceCapability` 的对齐成立，且与 `validateAtomicSequenceTarget` 的既有判定同构。

---

## 本轮核对范围

| 区域 | 动作 |
|------|------|
| 设计 §1–§3.4、§4 里程碑 M-01…M-06、§6/§7 | 通读；重点 d7 谓词、S1–S3、I1–I3、admit/open 管道、Activity 真值表、retention 联合、要求 8 |
| `System.ts` | `AtomicSequenceCapability` 对象类型；`AtomicStorage.reserveSequenceRange` / `SequenceRange`（M-02 已在） |
| `MonoSystem.ts` | `validateAtomicSequenceTarget` 真值性判定；`requiresScopedSequenceState` 仍绑定 `declarations.length > 0`；S1/S2/S3 三处建表门闩；`prepareMigrationAdditive` 的 `internal: { dbSetup }` 与上层 stamp `options`；共享 `reserveSequenceRangeInternal` |
| Drivers | PG / PGLite / SQLite：`atomicSequenceCapability = { … }` 对象 + `setupScopedSequenceState`；MySQL：无该 capability 字段 |
| `Controller.runDispatchAttemptBody` | 仍为 guard → map → create → resolve → afterDispatch；无 `outcome` / admit / open |
| `ActivityManager.buildActivityInteractionEventSource` | 合成 `wrappedGuard`（fullGuard + create/check）；转发 resolve/afterDispatch/postCommit；**未**转发未列字段（含未来 idempotency） |
| Transform / Custom | Transform：`bind/call(controller)`；Custom：`context = { controller, state, getState }`，无 `atomic` |
| 基线测试 | `npx vitest run tests/runtime/sequenceRange.spec.ts tests/runtime/scopedSequence.spec.ts tests/runtime/asyncTaskRetention.spec.ts` → **36 passed** |

---

## 六类条件逐项

### 1. 关键事实错误 — 未命中阻塞项

**d7 闭合项（上轮 R1）复核 — 成立**

设计伪代码（§3.1）：

```ts
function needsScopedSequenceTable(db: Database): boolean {
  return !!db.atomicSequenceCapability
    && typeof db.setupScopedSequenceState === 'function'
}
```

源码对照：

| 事实 | 证据 |
|------|------|
| capability **是对象**，不是 boolean | `System.ts`：`export type AtomicSequenceCapability = { requiresActiveTransaction: true; transactional; … }` |
| 现网 atomic 驱动赋**对象字面量** | `PostgreSQL.ts` / `PGLite.ts` / `SQLite.ts`：`atomicSequenceCapability = { requiresActiveTransaction: true as const, … }` |
| MySQL **无**该字段 | `src/drivers/Mysql.ts` 无 `atomicSequenceCapability` / `setupScopedSequenceState` |
| 既有校验用**真值性**，不是 `=== true` | `MonoSystem.validateAtomicSequenceTarget`：`if (!this.db.atomicSequenceCapability \|\| typeof this.db.setupScopedSequenceState !== 'function')` |
| 若写 `capability === true` | 对象 `!== true`，在全部现网 atomic 驱动上恒假 → S1–S3 永不建表（上轮已证伪路径） |

人工代入：

- PG 对象 + `setupScopedSequenceState` 为函数 → `!!obj && typeof fn === 'function'` → **真**
- 无 capability / 无 setup → **假**
- 与规则表「假仅对应无 capability 或无 setup」一致；禁止 helper 使用 `=== true` 已写入 M-03 源码抽查

**其它关键表面（与设计一致，属待实现而非事实错误）**

| 设计声称的现状 | 源码 |
|----------------|------|
| M-02 已有 range API / 共享内核 | `AtomicStorage.reserveSequenceRange`；`reserveSequenceRangeInternal`；`nextSequenceValue` = range(count=1).start |
| 建表仍绑 declarations（M-03 待消） | `requiresScopedSequenceState` 与 S3 内联均 `declarations.length > 0` |
| Dispatch 无 outcome / 无 admit·open 管道 | `runDispatchAttemptBody` 仍调 `eventSource.guard` |
| Activity 包装为合成 guard、未分列 admit/open | `ActivityManager.ts` `wrappedGuard` + 仅拷贝已列字段 |
| Transform/Custom 尚未注入 `this.atomic` | 见上；属 M-06 / d5 增量，设计已标明 |
| Entity 无 retention；cleanupAsyncTasks 仅 task 终态 | 与 §1.3 一致（本轮未重跑 M-01 全量路径，与既有已完成审计一致） |

**S3 与 plan.internal.options**：当前 apply 从 `plan.internal.options` 读 declarations 门闩，而 `prepareMigrationAdditive` 自身只返回 `internal: { dbSetup }`，options 由上层 migrate 路径事后 stamp。设计将 S3 改为 `needsScopedSequenceTable(this.db)` 后**不再依赖**该 stamp 作建表条件，与「能力向总是建表」一致，且消除对 stamp 时序的隐式依赖。这是实现改进方向，不是设计事实错误。

### 2. 内部逻辑矛盾 — 未命中阻塞项

| 检查点 | 结果 |
|--------|------|
| 成功预留区间内部无洞 vs 回滚可产生全局 gap | 分列清楚；与既有 sequence 政策对齐 |
| `next` = `reserve(count:1)` 共享内核 | 与 M-02 实现及测试「count=1 等价」一致 |
| 建表谓词与 Property seed/no-seed **分离** | 规则表写明；无「有 Property 才建表」回流 |
| replayed：仍 admit、跳过 open 及之后与 P | 与 Activity ★1/★4（不要求 activityId、不二次 complete）可同时成立 |
| in_flight → 一等错误码，≠ replayed | 与「禁止 unique 冲突折成 replayed」一致 |
| retention `cap` 必有 orderBy、`ttl` 无 orderBy | 可辨别联合；组合顺序先 TTL 再 cap |
| M-02 已完成证据保留双 this / 凑表夹具 vs 终态 `this.atomic` / 无凑表 | 明确为历史证据 + M-03/M-06 迁移，不重开 M-01/M-02 |
| I1–I3 幂等表「总是建」与 sequence S1–S3 同构 | 无第二套「有声明才建」条件 |

未发现两项硬要求不可同时满足，或里程碑按设计无法通过其书面验收的路径断裂。

### 3. 违反项目原则 — 未命中阻塞项

- 扩展既有 atomic / `_ScopedSequence_` / dispatch 事务边界，不平行 counter 协议。
- 建表与幂等表均要求**单一 helper + 有限读者清单**，符合「汇合点修复、修一类而非一个实例」。
- 依赖方向：类型在 System/Controller/core，实现在 runtime。
- 要求 8：删除循环 next 多行、扫 effects、手写 prune、合成 guard 双轨作为正式教义；与「无历史兼容负担」一致。
- 真实 PG 双连接作为 SEQ 并发完成证明；PGLite/单连接不顶替。

### 4. 违反任务目标 — 未命中阻塞项

| 要求 | 设计覆盖 |
|------|----------|
| 1 求证 | §1 三 FR 缺口均证实；M-01 已完成；§1.1 标明 M-01 快照边界 |
| 2 FR-SEQ-01 | range API + 并发 + 能力向建表 + 官方 `this.atomic`；非目标边界清楚 |
| 3 FR-IDEM-01 | 声明键 + outcome + admit/open 唯一管道 + in_flight 码；不扫 effects |
| 4 FR-RET-01 | Entity retention 联合 + `maintainEntityRetention`；与 cleanupAsyncTasks 分界 |
| 5–7 | 复用基建、独立验收、框架范围 |
| 8 | 贯穿 d5+ 正文与 M-06 教义收敛 |

三条 FR 分期与独立验收可执行；未把已交付能力（BT、准入锁等）重开。

### 5. 里程碑不可执行 — 未命中阻塞项

| 里程碑 | 评估 |
|--------|------|
| M-01/M-02 | 已完成；d7 不重开 |
| M-03 | 范围：唯一 helper、改 S1/S2/S3、去 declarations 门闩、无 Property 合同测、真实 PG 并发文件；验收命令与源码抽查（含禁止 `=== true`）明确；单轮可完成 |
| M-04 | 清单 8 项含真实 Activity ★1/★4 与 I1–I3；大但可拆测、可验收 |
| M-05 | cap/ttl/组合/负向；单一 API |
| M-06 | 教义与 `this.atomic` 收敛；依赖前置里程碑写清 |

依赖顺序合理（M-03 在 M-02 后；M-04/M-05 不依赖 SEQ 完成；M-06 收口）。无「明显不能在合理实现轮次内完成」的不可分巨石。

### 6. 必须提前验证的重大风险 — 未命中阻塞项

上轮「谓词 `=== true` 导致永不建表」属实现前即可由类型/驱动赋值证伪的风险，**已在设计层闭合**。其余风险（Activity 漏转发、in_flight 残留、PG env、Transform this 迁移）已落入对应里程碑验收或实现期验证表，且可在实现环境及时用合同测试区分正误，不构成「推迟则后续整体失效且现在无法验证」的第六类项。

---

## 需要复审的问题

（无）

---

## 实现注意事项

下列意见**不**触发设计复审，供实现轮与审计使用。

1. **M-03 落地顺序**：先抽出 `needsScopedSequenceTable`（或改名）并替换 S1/S2/S3 三处，删除 `requiresScopedSequenceState` 的建表用途（或缩为仅诊断），再改 `sequenceRange` 夹具与新增 PG 文件；避免只改 S1。
2. **S2 DDL 与 S1/S3 setup**：S2 仍用 `CREATE TABLE IF NOT EXISTS` 前置 DDL（方言 JSON/JSONB 与现网一致）；S1/S3 调 `setupScopedSequenceState`。保持 IF NOT EXISTS，防止 prepare/apply 双路径重复创建失败。
3. **S3 不再读 `plan.internal.options` 作建表条件**后，确认没有测试依赖「未 stamp options 则 apply 不建表」的旧行为。
4. **M-04 Activity 包装**：`buildActivityInteractionEventSource` 必须产出分列 `admit`/`open` 并**显式转发** `idempotency`；今日返回对象是字段白名单，漏列即静默丢失（I7 + ★7）。
5. **幂等 key 与 activityId**：key 函数不得依赖 open 之后才写入的 `activityId`（★1）；示例用 payload 侧稳定键。
6. **in_flight 占位**：空行不能靠 `SELECT FOR UPDATE` 锁住；用插入/upsert，冲突后再读 state 映射到 `IDEMPOTENCY_IN_FLIGHT` 或 `replayed`（§7 已备忘）。
7. **`ComputationActionContext.atomic`**：M-06 切换官方唯一入口前，M-02 双路径测可保留作迁移回归；新测与文档只写 `this.atomic`。
8. **retention**：`orderBy` 显式降序；禁止隐式 `createdAt`；Filtered/Merged/硬删除 computation 声明期 fail-fast。
9. **M-03 完成门闩**：无 `INTERAQT_POSTGRES_DATABASE` 绿跑不得标 M-03 完成；skip ≠ pass。
10. **M-01 正文行号**：§4 M-01 证据中 `AtomicStorage` 行号仍写 M-01 求证时编号；以 §1.1 快照说明为准，实现审计勿用过时行号否定 M-02。

---

## 基线证据（本轮执行）

```text
npx vitest run tests/runtime/sequenceRange.spec.ts \
  tests/runtime/scopedSequence.spec.ts \
  tests/runtime/asyncTaskRetention.spec.ts
→ Test Files  3 passed (3)
→ Tests      36 passed (36)
```

源码抽查摘要：

- `AtomicSequenceCapability`：对象类型（`System.ts`）。
- `validateAtomicSequenceTarget`：`!capability || typeof setup !== 'function'`（真值性）。
- 建表门闩现状仍为 declarations（待 M-03）：`requiresScopedSequenceState`、S3 内联 `declarations.length > 0`。
- 驱动：PG/PGLite/SQLite 对象 capability；设计 d7 谓词与之对齐。

---

## 给裁决轮

- **结论**：`通过`
- **需要复审的问题**：无
- **建议 next-action**：按任务协议进入 additional task 2；若裁决确认通过且无采纳问题，应将 status 转回实现中并启动 additional task 3 实现 **M-03**（含 d7 谓词与 S1–S3）。
