# storage package 深度分析报告

> 分析范围：`src/storage/`（erstorage 全部文件，约 7400 行），以及与其耦合的 driver 层（`src/drivers/`）和 runtime 调用方式。
>
> **修订说明**：本报告初版中列出并验证过 8 个致命错误（EXIST 占位符错位、filtered entity 关系变更脏状态、merged entity 破坏 root base、写路径全表扫描、x:n match 重复行、FOR UPDATE 报错、嵌套 JSON 不反序列化、MySQL 注入）。它们已全部修复并配有回归测试（见 `tests/storage/fatalBugFixes.spec.ts`），相关章节已从本报告删除以免误导后续工作。
>
> **第二次修订**：原《三、其他显著值得改进的地方》章节的全部 18 项（3.1 正确性/健壮性 7 项、3.2 性能 5 项、3.3 API/代码质量 6 项）也已全部修复并配有回归测试（见 `tests/storage/deepAnalysisSection3Fixes.spec.ts`、`tests/storage/getShrinkedAttribute.spec.ts` 补充用例），该章节已删除。顺带修复了让 PostgreSQL 并发 CI 跑通后暴露的 driver 层问题（序列回拨污染增量聚合、连接池孤儿化、`number` 误映射为 INT），见 `tests/runtime/postgresqlConcurrency.spec.ts`。
>
> **第三次修订**：原《二、merge / filter 的实现分析与更优方案》的核心重构（2.2 (a)(b)(c)）已实施完成，回归测试见 `tests/storage/deepAnalysisSection2Refactor.spec.ts` 与 `tests/runtime/filteredMembershipRuntime.spec.ts`，该章节从本报告删除，实施结果摘要如下。本文仅保留**仍然成立**的分析与遗留项。

---

## 一、storage package 职责概述

storage 是 interaqt 的持久化层，本质是一个为"响应式计算"定制的 ORM：

1. **Schema 映射**（`Setup.ts` / `EntityToTableMap.ts`）：把 Entity/Relation 定义映射成物理表。核心特色是三种合表策略（1:1 三表合一、x:1 关系字段合入实体表、独立关系表），以及 filtered/merged entity 的虚拟化处理。
2. **查询**（`RecordQuery` / `AttributeQuery` / `MatchExp` / `SQLBuilder` / `QueryExecutor`）：语义查询 → SQL。x:1 靠 JOIN 一次查出，x:n 靠二次查询（1:n 已按父 id 集合批量执行，n:n 及递归/分页场景逐条）；支持递归查询（label/goto）。
3. **变更**（`CreationExecutor` / `UpdateExecutor` / `DeletionExecutor`）：在合表策略下正确地创建/更新/删除记录与关系，处理"flash out"（合表数据搬迁）、reliance 级联删除等。
4. **事件**（`RecordMutationEvent`）：每次变更产生精确的事件序列，是上层 runtime 增量计算（Count/Every/StateMachine 等）的输入。**事件的正确性直接决定框架核心承诺（响应式计算正确性）**。
5. **filtered / merged entity**（`FilteredEntityManager` / `MergedItemProcessor`）：实体的"谓词子集视图"与"联合类型"。

---

## 二、merge / filter 重构实施结果（原第二节建议，已完成）

**核心思路已落地：把"视图（子集）"和"子类型（联合）"拆成两个正交概念，成员资格只保留一个真相源（SQL 谓词求值）。**

### (a) filtered entity → 纯虚拟视图（已实施）

- 查询侧：`resolvedMatchExpression` 谓词重写保持不变（原有最稳的部分）。
- 事件侧：`__filtered_entities` 持久化标记列已删除。所有变更路径（create/update/delete/addLink/unlink/relocate，包括删除关联实体引发的隐式关系删除）统一为 `FilteredEntityManager` 的两阶段钩子：变更前采集受影响记录及其成员资格（before 快照），变更后重新求值并 diff（settle），差异即事件。
- 与建议的两点偏差（有意为之）：
  1. **不做内存中的谓词求值**。建议中"本地属性谓词在内存中对 before/after 求值（0 次额外查询）"会引入第二套判定引擎（JS 语义必须逐 driver 精确对齐 SQL 的 null/布尔/collation 行为），违背"单一真相源"的初衷。实现中 before/after 均由 SQL 求值，查询次数与旧实现同量级，且无 events 数组的调用完全跳过求值（净收益）。
  2. **操作内账本（ledger）**。"完全无状态"在一次操作内部有多个钩子包裹同一段变更时（如 update 内嵌套 unlink/addLink）会产生重复事件。实现中用一个按 events 批次隔离的内存账本判重——数据库层面无状态，操作层面有协调。
- 顺带修复的旧缺陷：删除关联实体不产生成员资格事件（旧标记模型下标记永久脏掉、Count 永久虚高）；嵌套创建（带既有关联 id ref）不传播另一端成员资格。runtime 侧同步修复了各聚合计算（Count/Summation/Average/Every/Any/WeightedSummation）在"成员退出后再进入"时 record-bound 状态不复位导致增量为 0 的问题。

### (b) merged entity → 单表继承 + 可索引判别列（已实施）

- 单一 `__type` 字符串判别列取代 `__{Name}_input_entity` JSON 数组 + `contains`：记录创建时 `__type` = 创建所用实体的具体类型名（filtered input 取其 root base 名）；普通 input 成员条件为等值匹配，filtered input 为 `__type = 'Base' AND 谓词`，merged 为 OR 展开；嵌套 merge 就是谓词 OR 的递归展开，`buildLeafToInputMap` 与闭包 defaultValue（捕获实体实例）已删除，`__type` 的 defaultValue 只捕获纯字符串映射。
- 直接以 merged 名字（含嵌套内层 merged 名、以 merged 为 base 的 filtered 名）创建记录在运行期显式报错。旧行为是静默接受产生不属于任何 input 的孤儿记录（旧测试因 `expect.fail` 被 catch 吞掉而假阳性）。
- 语义修正：filtered input 的成员资格完全声明式——以 root base 名义创建且满足谓词的记录同样属于该 input（旧 tag 模型"创建时写死、不迁移"的限制随判别列模型消失，即原 2.3 第一项）。
- 与建议的一点偏差（有意为之）：`MergedItemProcessor` **没有**改为直接输出 `MapData` 的 schema 编译器，而是保留"编译为 filtered entity 视图"的降级路径——filtered entity 是唯一的一等机制，merged 是其上的语法糖，查询重写与事件机制零新增代码路径。图手术的脆弱性通过拓扑排序、成员条件的组合式编译（`resolveInputMembership`）与统一的 `rebaseAsFilteredItem` 消除。
- 顺带修复：merged relation 的 filtered input relation 此前不会 rebase 到 merged 的物理 base link 上（通过它创建的记录永远不出现在 merged relation 查询里），现与 entity 路径完全对称。

### (c) filtered relation 统一（已实施）

事件侧与 filtered entity 完全共用同一套 membership diff 机制（link record 与 entity record 同构）。查询重写侧（`AttributeQuery` 构造器内联 rebase、`MatchExp.convertFilteredRelation`）按建议原样保留。

---

## 三、已知的残留限制与优先级建议

| 优先级 | 项 | 说明 |
|---|---|---|
| P2 | x:n match 的 fan-out 与分页 | x:n 路径 match 产生的重复行已在结果层去重（等价 DISTINCT），但 SQL 的 `LIMIT` 在去重前生效——x:n match 与 `limit/offset` 组合时分页可能取到少于预期的行数。彻底修复需要把 x:n 值条件改写为 EXISTS 子查询或 SQL 级 DISTINCT（后者与 ORDER BY 非选择列冲突）。属于查询计划层的独立改动，未与第二节重构捆绑实施。 |
| P3 | `__type` 判别列索引 | 判别列已可索引（等值匹配），但框架目前不自动创建二级索引。若 merged entity 数据量大，可考虑在 Setup 阶段为 `__type` 建索引。 |
| P3 | 合表行迁移（flash-out/relocate）中 1:1 combined 关系变化的成员资格传播 | 此类路径不产生成员资格事件（与旧实现一致，查询侧始终正确）。场景罕见，如需要可在 `flashOutCombinedRecordsAndMergedLinks` 补充与 relocate 相同的钩子。 |
