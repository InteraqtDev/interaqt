# 仍缺的框架能力：连续票号、幂等回执、有界保留

> 面向 interaqt 框架本身的需求摘要。只收录**当前主干仍未具备**的能力；已交付的声明式准入锁、业务事务、Condition 结果代数、单一逻辑 `id` / create-time id、`Interaction.postCommit` 等**不在本文重复**。
>
> 不绑定任何具体应用仓库。文中场景仅为通用动机说明。

## 1. 背景

下列三类问题在真实应用中反复出现，且无法用现有一等原语干净表达：

1. **一次事件要写入多行、且这些行需要同一 scope 下连续无重叠的序号**（变更日志、批量子树删除、批量出票）。
2. **同一 interaction 的幂等重放**：调用方需要稳定知道「本次是首次生效还是回放」，而不能靠猜测 `effects` 列表。
3. **派生/附属实体会无限增长**（操作回执、事件日志、短暂票据），需要声明式按条数或时间修剪，而不是业务在 Transform 之后手写 `delete`。

现有相关能力与缺口边界：

| 已有 | 覆盖范围 | 仍缺 |
|------|----------|------|
| `ScopedSequence`（属性级 computation） | 宿主记录创建时按 scope 分配**一个**序号；`atomic.nextSequenceValue` 每次返回一个值 | 同一次 computation / dispatch 内**原子预留连续 N 个**序号，供一次写出多行 |
| `DispatchResponse.effects` | 列出本次 attempt 产生的变更事件 | 官方、稳定的首次 / 回放判别 |
| `Controller.cleanupAsyncTasks` | 清理异步任务终态行 | 任意实体的声明式 retention / TTL |
| `Interaction.postCommit` / BT 内推迟 SE | 提交后外部副作用钩子 | （已有；**不**列入本文需求） |

---

## 2. 需求一览

| ID | 标题 | 优先级建议 | 一句话 |
|----|------|------------|--------|
| **FR-SEQ-01** | 原子连续区间票号 | P0 | 在同一存储事务内，按 scope 一次预留长度为 N 的连续序号区间，供 Transform 等写出多行 |
| **FR-IDEM-01** | 一等幂等回放判别 | P1 | `dispatch` 结果显式区分首次生效与幂等回放，无需手扫 effects |
| **FR-RET-01** | 声明式实体保留 / TTL | P1 | 实体可声明按条数或时间的有界保留；框架在安全点修剪 |

三条相互独立，可分期交付。

---

## 3. FR-SEQ-01 — 原子连续区间票号

### 3.1 问题本质

常见形态：

```text
一次 InteractionEvent
  → Transform 写出 K 条「变更 / 日志 / 凭证」行（K ≥ 1，K 由载荷决定）
  → 这些行在同一业务 scope（如租户、工作区、文档）下必须占用
     连续、无重叠的序号 [s, s+K)
  → 下游按序号间隙检测空洞、做增量同步或对账
```

今日 `ScopedSequence` 解决的是另一类问题：**每条宿主记录一个序号属性**（如「每个项目下的第 N 号资产」）。它在创建宿主时分配**单个**值；底层 `nextSequenceValue` 按 `step` 递增并返回**一个**数。

对「一次事件多行共享一条连续票号带」而言：

- 在 Transform 里循环调用 N 次单值分配，虽可在同事务内得到连续号，但不是声明式区间原语：调用次数、失败半截、与「一次 reserve 再批量写」的意图不对齐，也难文档化为官方模式。
- 应用若退回裸 SQL `UPDATE counter SET n = n + $K RETURNING …`，则绕过框架计数表 / 迁移 / 驱动抽象，与「序号应声明式」的方向冲突。
- `UniqueConstraint(scope, seq)` 只能兜底冲突，不能提供分配语义。

需要的是：**事务内原子「预留长度 N 的连续区间」**，返回区间起点（或闭开区间），供同一次 computation 写入多行。

### 3.2 期望语义

须同时满足：

1. **Scope**：与 `ScopedSequence` 类似，按业务键划分计数空间（可复用或扩展现有 `_ScopedSequence_` / atomic 通道，但 API 必须表达「区间」）。
2. **原子性**：同一事务内 `reserve(scope, n)` 与随后写入共享提交边界；并发两个 `reserve(scope, n1)` / `reserve(scope, n2)` 得到的区间不相交。
3. **连续性（在要求 gapless 的 scope 合同下）**：成功预留的区间内部无空洞；是否允许因事务回滚产生全局间隙，须在文档中写清（可与现有「回滚可产生 sequence gap」政策对齐，但**成功提交的多行之间**不得有洞）。
4. **可用性**：可在 Transform / Custom computation / 官方 helper 中调用，而不仅限于「给某个 Property.computation 赋一个数」。
5. **无需方言 SQL**：业务代码不手写 `UPDATE … RETURNING`。

API 形态示例（示意，非最终设计）：

```text
const start = await atomic.reserveSequenceRange({
  sequenceName: 'workspace.changeSeq',
  scope: { workspaceId },
  count: deletedNodeCount, // N ≥ 1
})
// 写入行使用 start, start+1, …, start+N-1
```

### 3.3 非目标

- 不要求跨 scope 的全局无空洞序号。
- 不要求替代属性级 `ScopedSequence`（单值宿主序号仍可保留）。
- 不要求框架理解「变更日志」业务形态；只提供票号原语。
- 不把应用自建 counter 表 + 裸 SQL 升格为推荐写法。

### 3.4 验收标准

- **并发合同（真实 PostgreSQL，双连接）**：同一 scope 上并发两次 `reserve(…, n=10)` 与 `reserve(…, n=7)`，得到的区间不相交；各自事务内用这些序号插入的行在 `(scope, seq)` 唯一约束下全部成功。
- **单次多行**：一次 dispatch 的 Transform 写出 N 行（N 由载荷决定，N>1），序号为连续区间；合同测试断言 `max(seq)-min(seq)+1 === N` 且无缺失。
- 官方文档示例完成上述场景时**零**业务侧方言 SQL。
- PGLite / 单连接不得单独充当并发完成证明。

### 3.5 阻塞含义

在本能力落地前，依赖「一次事件多行连续序号」的应用只能保留临时 SQL / 循环单值分配，**不得**宣称已具备框架级票号原语。

---

## 4. FR-IDEM-01 — 一等幂等回放判别

### 4.1 问题本质

幂等 interaction 的常见合同：

```text
客户端携带 idempotencyKey / clientRequestId
  → 首次 dispatch：创建业务行 + 可选「回执」行，返回成功载荷
  → 相同键再次 dispatch：不重复产生副作用，返回与首次一致的业务结果
  → 调用方需要知道：这次是「新执行」还是「回放」
```

今日 `DispatchResponse` 提供 `effects`（本次 attempt 的变更事件列表）。应用若要区分首次 / 回放，往往：

- 扫描 `effects` 里是否出现某类 `create`（例如回执实体）；或
- 在 Condition / computation 外再查库对比「dispatch 前后是否已有回执」。

这把**框架本应稳定提供的语义**推给每个模块自行推断：effects 形状、过滤条件、与软错误 / 部分失败路径耦合后容易误判；也没有类型化字段可供 API 层直接映射。

### 4.2 期望语义

任选清晰官方路径之一（可组合），但须可文档化且稳定：

1. **`DispatchResponse` 一等字段**：例如 `outcome: 'applied' | 'replayed'`（命名可议），在声明了幂等键或官方 idempotency 参与者时由框架填充。
2. **官方幂等回执 API**：interaction / 实体声明幂等键路径；框架保证同键二次 dispatch 走回放分支，并在结果中显式标记；业务仍可通过 Transform 铸造领域回执行，但**判别本身不依赖**手扫 effects。

无论哪种：

- 首次与回放的判别对调用方**单次 `dispatch` 可见**，无需第二次查询或重跑 Condition。
- 回放不得重复产生对外可观察的重复副作用（与现有幂等教义一致）；若业务仍写回执实体，框架应定义回放时是否跳过 create、或 create 被唯一约束吸收后仍标为 `replayed`。

### 4.3 非目标

- 不规定业务回执实体的字段形状。
- 不要求所有 interaction 默认幂等。
- 不把「扫描 `effects`」文档化为推荐最终方案。
- 不在本需求内重做分布式 exactly-once 消息系统。

### 4.4 验收标准

- 合同测试：同一幂等键连续两次成功 `dispatch` → 第一次 `applied`（或等价），第二次 `replayed`（或等价）；领域可观察状态与首次一致（无双份业务行，或按声明的唯一键冲突被正确吸收）。
- 调用方**不**读取 `effects` 即可完成判别（测试中禁止以 effects 作为断言来源）。
- 文档给出声明幂等键 + 读取结果字段的最小示例。

### 4.5 阻塞含义

在本能力落地前，依赖 effects 推断的应用代码应视为临时逃逸，不得写入框架公开教义。

---

## 5. FR-RET-01 — 声明式实体保留 / TTL

### 5.1 问题本质

响应式系统常派生出**附属、可丢弃、但必须有界**的记录，例如：

- 每次成功 mutation 铸造一条 apply / operation receipt，供客户端增量拉取；
- 短时票据、nonce、调试轨迹；
- 按时间窗口保留的审计片段（非永久账本）。

若无框架级保留策略，应用只能：

- 在请求路径上 `storage.find` + 批量 `storage.delete` 修剪；或
- 外挂 cron / 手写 GC。

问题：

1. 修剪与产生回执的 Transform **不在同一声明面**，易漏、易在错误时机删除仍被引用的行。
2. 每个模块重复发明「retain 最新 N 条 / TTL」；并发与索引策略不一致。
3. 现有 `cleanupAsyncTasks` 只覆盖异步任务终态行，**不能**表达任意实体的有界日志。

### 5.2 期望语义

实体（或某类 append-only 日志实体）可声明保留策略，例如：

- **按条数**：每个分区键（如 `projectId`）保留最新 N 条（按时间戳或单调序号排序）；
- **按时间**：超过 TTL 的行可删；
- 或二者组合（先 TTL，再 cap）。

框架在**安全点**执行修剪（候选：成功 commit 之后的维护阶段、显式 maintenance API、或受控后台步）。须保证：

1. 与正在进行的读（增量 feed）有清晰隔离或快照合同，避免读者看到撕裂的序号流（或文档明确允许的可见性）。
2. 业务默认路径**无需**手写 delete 循环。
3. 永久账本类实体可声明 `retain: forever` / 不声明 retention，默认不删。

### 5.3 非目标

- 不内置对象存储 / 外部 blob 的 GC（那是 post-commit 外部副作用范畴，已有钩子）。
- 不替代用户显式的领域「归档 / 硬删除」interaction。
- 不要求在 Condition 内做修剪。
- 不把「每个模块手写 prune」升格为推荐模式。

### 5.4 验收标准

- 合同测试：某分区连续产生 `M` 条回执（`M > N`），声明 `retainLatest: N` 后，稳定状态下该分区行数 ≤ N，且保留的是最新 N 条（按声明排序键）。
- TTL 合同：写入后拨钟 / 注入过期时间戳，维护步之后过期行不存在、未过期行仍在。
- 官方示例与文档完成上述场景时业务侧无手动 `storage.delete` 修剪循环。
- 负向：未声明 retention 的实体不被该机制删除。

### 5.5 阻塞含义

在本能力落地前，有界回执 / 日志只能由应用临时 prune，并应在注释中标明依赖本缺口。

---

## 6. 建议实施顺序

1. **FR-SEQ-01**（P0）：与现有 `ScopedSequence` / atomic 计数通道同族，缺口最硬，旁路成本最高（裸 SQL）。
2. **FR-IDEM-01**（P1）：改动面集中在 dispatch 结果合同与幂等声明，利于收敛各模块推断逻辑。
3. **FR-RET-01**（P1）：可与日志/回执实体模式一起设计；注意与增量读取合同的交互。

## 7. 明确不在本文范围

以下能力已在框架侧交付或另有进行中任务，**不要**在本文件下重复立项：

- 声明式 Condition 准入锁 / `AdmissionSnapshot`
- `runInBusinessTransaction` 与 Condition 对未提交写的可见性
- Condition `{ allowed, code, context }` 结果代数
- 单一逻辑 `id`、create-time 可选 id、Transform insert 可带 id
- `Interaction.postCommit` 与业务事务提交后副作用冲刷
- 非 BT 外层事务内 `dispatch` 的路径强制（见进行中的路径唯一化工作，属纪律收紧而非新原语）
