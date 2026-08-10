# Condition：声明式准入与事务可见性

> 面向 interaqt 框架本身的需求摘要。由应用侧（Mesh）在并发计费准入、以及「同请求写实体后再 dispatch」场景中求证出的范式缺口抽象而来。不绑定具体业务模块实现；文中业务例子仅作动机说明。

来源对照（应用侧文档，只读参考）：

- Mesh `docs/paradigm-unexpected-violations/paradigm-unexpected-violations.md` → `## interaqt 框架需求（批量）`（FR-01 / FR-02）

## 1. 背景

现行交互模型大致是：

1. `Controller.dispatch` 在**单次**事务内跑 guard / Condition → 写 `InteractionEvent` → 触发 Transform / StateMachine 等 computation。
2. Condition 用 `storage.findOne` 等读状态，返回 boolean（或失败），决定是否准入。
3. 属性更新由 StateMachine 的 `computeValue` 等推进；框架已在部分 Transform 路径上使用 `atomic.lockRecord` / `lockRows`（常配合 SERIALIZABLE 重试）。
4. **禁止嵌套 dispatch**（`NestedDispatchError`）：一次业务请求若要先落库再触发依赖该行的 interaction，应用无法「在同一 dispatch 栈里」组合完成。

应用因此反复出现两类绕过：

- Condition 内手写 `FOR UPDATE` / advisory lock（仓库自建锁助手），才能让 check-then-act 在并发下正确。
- 外层先 `storage` 写实体并 **commit**，再 `dispatch` 依赖它的 interaction——因为 Condition 走 controller 连接池读库时，看不见同请求未提交写。

这两类都破坏「领域写路径应声明式、可组合」的教义，应上升为框架能力，而不是应用惯例。

## 2. 需求一览

| ID | 标题 | 一句话 |
|----|------|--------|
| **FR-01** | 声明式可串行化准入 | Condition（或等价准入原语）声明读集串行化/行锁语义，使「读 → 决定 → computation 应用」对并发 dispatch 安全，无需业务手写 SQL 锁 |
| **FR-02** | 事务可见性 + Condition→computation 结果通道 | (a) Condition 读与同一次业务事务的未提交写一致可见，或官方多 interaction 原子批次；(b) Condition 可将已解析字段/类型化错误交给下游 computation/API，无需 mutate payload 或二次准入 |

两条相互独立，可分期交付；**只实现一半不算对应 ID 完成**（尤其 FR-02 的 a/b）。

---

## 3. FR-01 — 声明式可串行化准入（Condition 读集）

### 3.1 问题本质

典型 check-then-act：

```text
Condition:  读余额 B；若 B >= 扣减额则放行
StateMachine: availableCredits := availableCredits - amount
```

在默认隔离 / 无锁读下，两个并发 dispatch 可同时读到同一 `B` 并都通过 Condition，随后两次相减导致透支。框架今日没有**声明式**方式表达「本 Condition 的读集需要与后续 computation 串行化」；应用要么赌竞态，要么在 Condition 里塞 `FOR UPDATE`。

注意：仅把 StateMachine 改成「再读一遍再决定」仍不够——第二次读若同样无串行化语义，竞态仍在；需要的是准入与应用落在同一隔离/锁协议下。

### 3.2 期望语义（择一或组合，但须可文档化）

任选一条清晰的官方路径即可，关键是业务**不再**手写锁 SQL：

1. **声明式读集锁 / 隔离**：Condition（或附属 admission 声明）可标明对某些实体/行的串行化读（行锁、`SELECT … FOR UPDATE`、或把该段升到 SERIALIZABLE + 官方重试），与随后 computation 共享同一事务与锁持有期。
2. **原子「准入 + 应用」原语**：例如带谓词的官方 decrement / compare-and-set，失败则整次 dispatch 失败，超额在框架层被拒绝。

已有 `storage.atomic.lockRecord` / `lockRows` 与 SERIALIZABLE 重试是实现线索，但今日主要服务 Transform 内部，**未**成为 Condition / 业务准入的一等 API。

### 3.3 非目标

- 不要求业务在 Condition 回调里手写方言 SQL。
- 不把各应用自建的 advisory-lock 助手升格为正式公共 API。
- 不强制所有 Condition 默认 SERIALIZABLE（成本过高）；应是**显式声明**的能力。

### 3.4 验收标准

- **并发合同（真实 PostgreSQL，双连接）**：账户余额为 `B`，两次并发 dispatch 各请求扣 `B`，透支上限为 0 → **至多一次成功**，结束后余额 ≥ 0。
- 文档与官方示例完成上述场景时**不依赖**应用侧 `database-locks` 一类手写锁。
- PGLite / 单连接模拟不得单独充当本需求的完成证明。

### 3.5 应用侧阻塞含义（参考）

在本能力落地前，依赖 Condition 无锁读做资金/库存类准入的应用**不得**宣称竞态已修复；最多保留「当前实现不安全」的红灯基线测试。

---

## 4. FR-02 — Condition 事务可见性 + 结果通道

### 4.1 问题本质（两个子问题）

**(a) 读可见性**

常见编排：

```text
同一 HTTP/业务请求：
  storage.create(R)          // 外层事务或外层连接
  controller.dispatch(I)     // Condition 需要看见 R
```

今日限制叠加：

- 嵌套 `dispatch` 被禁止；
- Condition / dispatch 事务若使用**另一连接**（池），则看不到外层未提交写；
- 于是应用被迫 **commit 后再 dispatch**，失去原子性，并引入「写成功但后续 dispatch 失败」的中间态。

**(b) 结果通道**

Condition 常已解析出实体、权限上下文或结构化拒绝原因，但官方通道只有「通过 / 不通过」。应用只好：

- `Object.assign` 污染 payload 把解析结果塞给 computation；或
- 失败后再跑一遍相同查询以构造 API 错误信息。

两者都重复准入逻辑，且易与 Condition 真相漂移。

### 4.2 期望语义

**(a) 事务可见性** — 至少一种官方方案：

- Condition（及同次 dispatch 内的 computation）与调用方提供的**同一业务事务 / 同一连接**共享未提交写可见性；或
- 官方 **多 interaction 原子批次**（一次事务内顺序执行多个 interaction，中间状态对后续 Condition 可见），并明确与「禁止任意嵌套 dispatch」的关系。

**(b) 结果通道**：

- Condition 可返回类型化错误（稳定 code + 消息/详情）直达 dispatch 结果 / API 层；
- 可选：将「已解析、只读的上下文」交给同次 dispatch 的 computation，而无需 mutate 原始 payload。

### 4.3 非目标

- 不把「先提交再 dispatch」固化为长期推荐模式。
- 不要求开放任意深度的递归嵌套 dispatch（可仍禁止无约束嵌套，但须提供官方组合原语）。
- 不要求 Condition 可以随意写库（结果通道是只读上下文与错误，不是第二套 mutation API）。

### 4.4 验收标准

必须 **(a)(b) 分别可测**；只实现一半不算 FR-02 完成。

- **(a)**：单事务内 `storage` 写入实体 `R` 后，立即（同事务 / 官方批次内）dispatch 依赖 `R` 的 interaction，其 Condition **能看见** `R` 并放行；事务回滚则 `R` 与 interaction 副作用一并消失。
- **(b)**：Condition 拒绝时，调用方拿到稳定的类型化错误，无需二次执行同一准入查询；Condition 解析出的字段可被同次 computation 使用且测试可断言，无需 `Object.assign(payload, …)`。

### 4.5 应用侧阻塞含义（参考）

依赖「写草稿实体 + 再 dispatch 激活/挂载」一类路径的应用，在本能力落地前只能保留非原子的 commit-then-dispatch，并在合同中显式排除「已原子修复」的误报。

---

## 5. 与现有框架能力的关系（实现时注意）

| 已有能力 | 与本需求的关系 |
|----------|----------------|
| `runInTransaction` + isolation / SERIALIZABLE 重试 | FR-01 可复用协议；需暴露给 Condition/admission，而非仅内部 Transform |
| `storage.atomic.lockRecord` / `lockRows` | FR-01 的实现候选；今日未成为 Condition 声明式 API |
| 禁止嵌套 `dispatch` | 直接催生 FR-02(a)；解决时应同时更新该约束的文档与替代原语 |
| Condition 布尔返回值 | FR-02(b) 的缺口所在；扩展返回值/旁路上下文时保持 fail-closed |
| PostgreSQL 真实双连接测试基建 | FR-01 验收必须挂在此层（与现有 `test:postgres` / concurrency suites 同纪律） |

## 6. 建议落地顺序

1. **FR-01**：并发正确性缺口更尖锐（资金/库存），且与现有 lock/SERIALIZABLE 基础设施更近；先做声明式 admission + 真实 PG 合同。
2. **FR-02(a)**：明确「同事务可见」vs「原子批次」选型，再改 dispatch 组合模型与文档。
3. **FR-02(b)**：可与 (a) 并行设计 API，但须独立测试；避免只做错误码包装却仍强制二次查询。

## 7. 非本文件范围

- 业务 id vs Relation 的教义裁决（见同目录 `entity-identity-and-relations.md`）。
- 应用侧如何删除死 Relation、改写计费 Condition 等 Mesh 修复——属应用仓库任务，不在本框架需求内实施。
