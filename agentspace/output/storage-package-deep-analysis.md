# storage package 深度分析报告

> 分析范围：`src/storage/`（erstorage 全部 26 个文件，约 7400 行），以及与其耦合的 driver 层（`src/drivers/`）和 runtime 调用方式。
>
> **修订说明**：本报告初版中列出并验证过 8 个致命错误（EXIST 占位符错位、filtered entity 关系变更脏状态、merged entity 破坏 root base、写路径全表扫描、x:n match 重复行、FOR UPDATE 报错、嵌套 JSON 不反序列化、MySQL 注入）。它们已全部修复并配有回归测试（见 `tests/storage/fatalBugFixes.spec.ts`），相关章节已从本报告删除以免误导后续工作。
>
> **第二次修订**：原《三、其他显著值得改进的地方》章节的全部 18 项（3.1 正确性/健壮性 7 项、3.2 性能 5 项、3.3 API/代码质量 6 项）也已全部修复并配有回归测试（见 `tests/storage/deepAnalysisSection3Fixes.spec.ts`、`tests/storage/getShrinkedAttribute.spec.ts` 补充用例），该章节已删除。顺带修复了让 PostgreSQL 并发 CI 跑通后暴露的 driver 层问题（序列回拨污染增量聚合、连接池孤儿化、`number` 误映射为 INT），见 `tests/runtime/postgresqlConcurrency.spec.ts`。本文仅保留**仍然成立**的分析与改进建议。

---

## 一、storage package 职责概述

storage 是 interaqt 的持久化层，本质是一个为"响应式计算"定制的 ORM：

1. **Schema 映射**（`Setup.ts` / `EntityToTableMap.ts`）：把 Entity/Relation 定义映射成物理表。核心特色是三种合表策略（1:1 三表合一、x:1 关系字段合入实体表、独立关系表），以及 filtered/merged entity 的虚拟化处理。
2. **查询**（`RecordQuery` / `AttributeQuery` / `MatchExp` / `SQLBuilder` / `QueryExecutor`）：语义查询 → SQL。x:1 靠 JOIN 一次查出，x:n 靠二次查询（1:n 已按父 id 集合批量执行，n:n 及递归/分页场景逐条）；支持递归查询（label/goto）。
3. **变更**（`CreationExecutor` / `UpdateExecutor` / `DeletionExecutor`）：在合表策略下正确地创建/更新/删除记录与关系，处理"flash out"（合表数据搬迁）、reliance 级联删除等。
4. **事件**（`RecordMutationEvent`）：每次变更产生精确的事件序列，是上层 runtime 增量计算（Count/Every/StateMachine 等）的输入。**事件的正确性直接决定框架核心承诺（响应式计算正确性）**。
5. **filtered / merged entity**（`FilteredEntityManager` / `MergedItemProcessor`）：实体的"谓词子集视图"与"联合类型"，是复杂度最高的部分。

---

## 二、merge / filter 的实现分析与更优方案

### 2.1 现状：多套机制层层叠加

当前"一个概念、多套并行实现"：

| 概念 | 机制 | 位置 |
|---|---|---|
| filtered entity 查询 | `resolvedBaseRecordName` + `resolvedMatchExpression` 查询重写 | `Setup` 预计算，合并逻辑已收敛到 `MatchExp` 构造器一处 |
| filtered entity 事件 | `__filtered_entities` JSON 标记列 + 依赖图（含属性与关系段）+ 逐条读-改-写 | `FilteredEntityManager`，由三个 Executor 与 link 变更钩子调用 |
| filtered relation | attribute 级重写（`AttributeQuery` 构造器内联 rebase）+ `MatchExp.convertFilteredRelation` 路径改写 | 又一条独立代码路径 |
| merged entity/relation | `MergedItemProcessor` 在 setup 前把实体图整体改写：克隆→替换→虚拟 base→`__X_input_entity` tag 列→把 input 转成 filtered entity | 数百行图手术 |

复杂度的根源可以概括为三点：

1. **成员资格有两个真相源**。查询走谓词重写（实时正确），事件走持久化标记（增量维护）。虽然关系变更现已纳入依赖图并通过 `propagateLinkChange` 传播，且标记维护已批量化（`updateFilteredEntityFlagsForRecords`），但架构上仍然是"两套判定 + 手工同步"：任何新增的变更路径都必须记得挂钩子，否则两者再次分叉。标记的读-改-写（先 SELECT `['*']` 再 UPDATE 整个 JSON）在并发下也有丢失更新的风险。
2. **用"子集"机制模拟"联合"语义**。merged entity 本质是 Single Table Inheritance（联合类型/子类型），却被实现为"tag 列 + filtered entity"的组合：tag 是**创建时写死**的（存进 JSON 数组，靠 `contains` 匹配，不可索引），而 filter 是**声明式谓词**（随数据变化）。目前 filtered input 的谓词已在 rebase 时保留，但 tag 本身仍是创建时静态决定的——例如某记录以 input A 名义创建后，即使其属性变化到"语义上更像 input B"，tag 也不会迁移。`mergeProperties` 里为 defaultValue 生成闭包（捕获 `leafToInputMap`），还使得 schema 无法序列化、难以调试。
3. **name 字符串驱动的图手术**。`MergedItemProcessor` 通过 `RefContainer` 克隆整个实体图、按 name 查找替换、生成 `${name}_base` / `__${name}_input_entity` 等约定命名。任何一步 name 冲突或替换顺序问题都是静默错误（历史上确实发生过 root base 被错误替换的 bug）。

### 2.2 建议的目标架构

**核心思路：把"视图（子集）"和"子类型（联合）"拆成两个正交概念，各自用最贴合的机制实现；成员资格只保留一个真相源。**

#### (a) filtered entity → 纯虚拟视图，删除持久化标记

- 查询：保留现有 `resolvedMatchExpression` 重写（这部分是对的），合并逻辑已收敛到 `MatchExp` 构造器一处。
- 事件：不再持久化 `__filtered_entities`，改为**变更时的成员资格 diff**：
  - setup 期为每个 base entity 预编译一个 `MembershipEvaluator`：`{ filteredEntityName, 谓词, 依赖 = {本地属性集, 关系边集, 远端属性集} }`。
  - 所有变更路径（create/update/delete/addLink/unlink，包括合表产生的隐式关系变化）收敛到一个钩子：`onMutation(recordName | linkName, before, after)`。钩子按依赖图找出受影响的 base 记录，本地属性谓词直接在内存中对 before/after 求值（0 次额外查询，UpdateExecutor 本来就取回了完整旧记录）；跨实体谓词按现在的方式发两次 membership 查询（次数与现状相同，但不再有可脱同步的状态）。
  - 好处：无脏状态可言（stateless），并发下也不需要对 JSON 列做读-改-写；创建记录时也省掉现在"INSERT 后再补一条 UPDATE 写 flags"的额外往返。

#### (b) merged entity → 显式的单表继承 + 可索引判别列

- 用**单个字符串判别列** `__type`（或框架统一的 `_entity` 列）替代 `__X_input_entity` JSON 数组 + `contains`：
  - 记录创建时 `__type = 创建所用的实体名`（普通 input 直接是自身；filtered input 的记录 `__type = 其根 base 名`）。
  - 普通 input entity 的成员条件：`__type = 'Cat'`——可加索引，等值匹配，跨 driver 无 JSON 兼容问题。
  - filtered input 的成员条件：`__type = 'CustomerBase' AND isActive = true`——谓词语义完全声明式，记录属性变化时自然进出，且事件由 (a) 的统一 diff 钩子覆盖。
  - merged entity 的成员条件：各 input 条件的 OR。
- `MergedItemProcessor` 从"运行前图手术"退化为纯粹的 **schema 编译**：输出仍是 `MapData`（表、列、每个 record 的成员谓词），不再需要克隆实体实例、生成闭包 defaultValue、虚拟 `_base` 实体命名约定。嵌套 merged（merged of merged）在判别列模型下就是谓词 OR 的展开，无需 `buildLeafToInputMap` 这类逐层传播。
- 直接以 merged 名字创建记录应当在 schema 编译期或运行期**显式报错**（union 是抽象类型）。当前行为是静默接受并产生不属于任何 input 的记录，违反"explicit control"。

#### (c) 统一 filtered relation 到同一模型

filtered relation 目前在 `AttributeQuery` 构造器里内联 rebase、在 `MatchExp.convertFilteredRelation` 里做路径替换，两处都很难读。在 (a) 的模型里，link record 与 entity record 本就同构（都是 `RecordMapItem`），filtered relation 只是"base 为 link 的视图"，谓词重写和事件 diff 可以完全复用同一个 evaluator，无需独立代码路径。

这一方案不是推翻重来：查询重写层（现有最稳的部分）原样保留；改动集中在 `FilteredEntityManager`（重写为 evaluator + 统一钩子）、`MergedItemProcessor`（重写为 schema 编译）、三个 Executor 中散落的 filtered 调用点（收敛到钩子）。`__filtered_entities` 与 `__X_input_entity` 两个物理列被一个 `__type` 判别列取代（仅 merged 场景需要）。

### 2.3 已知的残留语义限制

- **merged entity 的 tag 是创建时静态的**：记录以哪个 input 名义创建就永久属于哪个 input（filtered input 的谓词会额外过滤，但 tag 不迁移）。这是当前 tag 模型的固有语义，采用 2.2(b) 的判别列 + 谓词模型后自然消失。
- **x:n match 的 fan-out 与分页**：x:n 路径 match 产生的重复行已在结果层去重（等价 DISTINCT），但 SQL 的 `LIMIT` 在去重前生效——x:n match 与 `limit/offset` 组合时分页可能取到少于预期的行数。彻底修复需要把 x:n 值条件改写为 EXISTS 子查询或 SQL 级 DISTINCT（后者与 ORDER BY 非选择列冲突），建议与 2.2 重构一起处理。

---

## 三、结论与优先级建议

storage 的分层（Setup → Map → Query/Executor → SQLBuilder）与合表策略设计是有想法的，查询重写路径（filtered entity 的读侧）基本稳固，历史致命错误与工程质量问题（原第三节的 18 项）均已修复。剩余问题集中在架构层面：

| 优先级 | 项 | 工作量特征 |
|---|---|---|
| P1 | 第二节重构：filtered/merged 统一为 evaluator + 判别列，消除双真相源与图手术 | 涉及 FilteredEntityManager、MergedItemProcessor、三个 Executor 的调用点；查询重写层不动 |
| P1 | x:n match 与 limit/offset 组合的分页语义（见 2.3） | 与上一项一起处理最自然 |
