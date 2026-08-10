# Entity 身份与 Relation 一致性 — 设计评审

- **评审角色：** additional task 1（独立设计评审）
- **设计版本：** `docs/entity-identity-and-relations/entity-identity-and-relations.md`（`status: 设计中`，`design-round: 2/15`）
- **基线 revision：** `b7fe969d5b3e5fcc6518c830ad9744e6246bf6bc`
- **结论：** `通过`

本轮在形成结论前未读取旧版 `entity-identity-and-relations-review.md` 正文；证据来自 Task 1、当前设计、项目规则、源码与本轮独立探针。

---

## 1. 复审范围与方法

逐项检查六类设计复审条件：

1. 关键事实错误  
2. 内部逻辑矛盾  
3. 违反项目原则  
4. 违反任务目标  
5. 里程碑不可执行  
6. 必须提前验证的重大风险  

对可验证事实独立核对：

| 核对项 | 方法 | 结果 |
|--------|------|------|
| F1 Transform 硬禁顶层 `id` | 阅读 `src/runtime/computations/Transform.ts`：`assertNoIdInTransformedRecord` 在 compute / event insert / data insert / data update 四路径调用 | 与设计一致 |
| F3 创建支持外部 `id` | 阅读 `CreationExecutor.preprocessSameRowData`；探针 E2（PGLite UUID / SQLite 整数） | 外部 id 原样落库 |
| F4 `applyResultPatch` update 仅按 `affectedId` 定位且透传 `data` | 阅读 `Controller.applyResultPatch` entity/relation 分支 | 与设计一致；未剥离 `data.id` |
| F5 逻辑 id 物理列 = `idField` 哈希短名，≠ 字面 `id`；PK = `_rowId` | 探针：`Note.idField=not_id_*`，`User/Profile/rel` 在 1:1 `isTargetReliance` 合表上为三列不同 `idField` | 与 §3.3.1 / E11 一致；``ON T ("id")`` → `column "id" does not exist` |
| F6 逻辑 id 默认无 UNIQUE | 探针 E5：同 id 二次 create 静默两行 | 与设计一致 |
| F7 update 可改写逻辑 id，事件 keys 不含 id | 阅读 `buildSameRowUpdateEvent` + `getSameRowFieldAndValue` + `updateSameRowData`；探针 E4 | 行 id 被改写；API 返回对象仍带 match 侧旧 id |
| F9 运行时外部 id 不推进 INT 序列 | 探针 E6（SQLite）：外部 `id=5` 后 auto 得 `1..6`，与 5 碰撞 | 与设计一致 |
| MySQL `constraints.unique === false` 且 `createUniqueConstraintStatement` 总闸抛错 | `src/drivers/Mysql.ts`；`createUniqueConstraintStatement` 实测 throw；`createUniqueIndexSQL` 仍可生成 `CREATE UNIQUE INDEX ... (idField)`（无 `IF NOT EXISTS`） | 与 d1 路径裁决一致 |
| §3.3.1 参考函数枚举（非 filtered + entity/relation + `idField`；合表每 record 一条） | 1:1 reliance 合表与 n:n 孤立关系枚举；按 `(table,idField)` 分组无重复物理列双发；merged 编译后 input 为 filtered、base 抽象非 filtered 共享同一 `idField` | 与参考函数一致，不会对同一物理列重复建索引 |
| 文档绝对禁令锚点 | `rg`：`computation-implementation.md` / `04-reactive-computations.md` / `19-common-anti-patterns.md` / `api-reference.md` | 与 §3.6 一致 |
| 行搬迁（flashOut）与 UNIQUE | `clearRowDataForMigration` 先清列（id 置 NULL）再整行重插同逻辑 id | 与「非空 id 唯一、允许多 NULL」相容；不构成设计期否决项 |

临时探针：`tmp-entity-id-review-probe.mts`、`tmp-entity-id-review-probe2.mts`、`tmp-entity-id-review-probe3.mts`（评审结束删除，未改 `src/`）。

---

## 2. 需要复审的问题

**无。**

在六类复审条件内，未发现会使方案整体失效、自相矛盾、违反项目原则/任务目标、或使里程碑按设计无法验收的问题。先前两轮已锁定的「框架逻辑 id UNIQUE INDEX」领域（路径总闸 + 物理 `idField` / 合表枚举）在本轮独立复验下与源码和探针一致；§3.3.1 参考函数可作为实现与验收的单一判据。

---

## 3. 目标符合性（摘要）

| Task 要求 | 设计对应 | 评审 |
|-----------|----------|------|
| 1 求证 | §1 事实表 + E1–E11；问题成立且非文档-only | 充分 |
| 2 范围收缩 | 明确不收缩为仅文档；存储不变量为放宽 Transform 前提 | 与证据一致 |
| 3 单一身份 | 逻辑 `id` = 应用身份；创建可选、更新不可变；Relation 仍 `{ id }` | 与默认方向一致 |
| 4 Transform / 写回 | insert 允许 id；update 剥离；delete 认 affectedId；读者表汇合点 | 完整；依赖 M-01 先落地 |
| 5 Relation / computeTarget | 不改引用形态；M-03 端到端验收 | 充分 |
| 6 兼容超集；identity 非默认 | 省略 id 路径保留；声明式 identity 非目标 | 符合 |
| 7 文档 | §3.6 锚点 + M-04 `rg` 验收 | 可执行 |
| 8 测试 | M-01..M-05 命令；r13 意图改为唯一约束 fail-loud | 可执行 |
| 9 非目标 | 裸 `*Id`、双轨主键、强制预生成、迁移折叠工具均排除 | 符合 |
| 10 工程 | 分层；storage 总闸 + Transform 去过宽断言；MySQL 用户 UniqueConstraint 契约保留 | 符合原则 |

里程碑依赖 M-01 → M-02 → M-03/M-04 → M-05 合理；首个里程碑对准最大不确定性（存储身份不变量）。初始 M=5 → 通过后 N=25 的写法正确（由裁决轮写入状态头）。

---

## 4. 实现注意事项（不影响结论）

下列事项有价值，但属于实现收敛或验证加强，**不得**单独触发设计复审：

1. **发出钩子与迁移登记：** 参考函数已锁定「发什么」；「在 DBSetup 约束阶段 / MonoSystem 类似 `setupTransformUniqueIndexes` 的阶段 / `create*UniqueIndexOperations` 迁入 `postRecomputeDDL`」的具体挂点，实现时应与 Transform 框架索引同一可观测集合（名称进 manifest / AdditiveDDL），避免只做 `setup(true)` 而 migration attach 漏建。M-05 已覆盖写路径/迁移加固。  
2. **`noteAllocatedId` / 在线序列推进：** 各 INT 驱动目前仅有 `getAutoId` + `setupSequences(MAX)`；create 路径推进需新增或内联对称 API，并处理「外部 id 非有限整数」时跳过或 fail-fast（与「预生成类型须与驱动相容」一致）。  
3. **MySQL 无 `IF NOT EXISTS`：** `createUniqueIndexSQL` 在 MySQL 上不带该子句；幂等重入需与 Transform 索引同样约定（`setup(true)` 重建库，或迁移操作日志去重）。  
4. **内部表 `_System_` / `_Dictionary_`：** 二者有 `idField` 且非 filtered。参考函数若按「凡非 filtered 且有 idField 的 map record」枚举会为其建 UNIQUE——通常无害；若刻意排除，实现时用稳定名字集合，勿破坏用户 ER 枚举。  
5. **data-based spread 使目标 id = 源 id：** 设计已接受并要求文档写明；实现勿再加过宽「禁止 id===sourceId」除非产品另行决策。  
6. **update 剥离不抛错：** 测试断言「行 id 未改」即可，勿依赖异常。  
7. **合表验收构造：** 探针须使用 `isTargetReliance: true`（不是错误字段名）；降级为 `mergedTo: 'source'` 时同表逻辑 id 列数会少于「通常三个」，断言应跟编译结果而非死写 3。

---

## 5. 结论

**`通过`**

- 不修改设计文档。  
- 无「需要复审的问题」须裁决轮采纳。  
- 下一会话：设计裁决（additional task 2）确认通过后，将状态置为 `实现中`，`N = 5 × 5 = 25`，并启动 additional task 3。
