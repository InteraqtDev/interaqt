status: 已完成
design-round: 3/15
implementation-round: 6/25
current-milestone: M-05
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无

# Entity 身份与 Relation 一致性 — 设计

> **裁决 d1（采纳 R1-path）：** 逻辑 `id` 唯一**不得**经用户 `UniqueConstraint` → `createUniqueConstraintStatement` 总闸在全驱动落地；改为框架专有建索引路径。MySQL 保持 `constraints.unique === false`（用户 TEXT 属性 UniqueConstraint 仍 fail-fast）。  
> **裁决 d2（采纳 R1-field）：** 索引列必须是每个 base record 的物理 `idField`（`generateShortFieldName` 哈希名），**不是**字面列名 `id`；合表上每个参与 record 各一条 UNIQUE INDEX。领域「框架逻辑 id UNIQUE INDEX 发出」第二次复审 → §3.3 改为完整可执行契约（枚举 × 列解析 × 路径 × 方言 × 命名）。  
> **裁决 d3（设计通过）：** 独立复验当前设计与评审文件中的 R1。R1（物理 `idField` / 合表多逻辑 id / 禁止字面 `id` 列）已在 d2 写入 §3.3.1 参考函数与 M-01 验收，本轮**不采纳**任何新的「需要复审的问题」。探针复验：E2 外部 id 落库；E5 无唯一时静默重复；E4 update 改写 id 且返回旧 id；E6 SQLite 外部 `id=5` 后 auto 再发 `5`；Transform spread 顶层 id 抛错；`idField` 为哈希短名；字面 `id` DDL 失败；按 `idField` 建索引后重复 create fail-loud；1:1 reliance 合表三逻辑 id 列。`status: 实现中`，`N = 5 × 5 = 25`。

## 1. 背景和现状

### 1.1 任务要回答的张力

interaqt 的响应式 ER 约定：

- 跨实体连接走 `Relation`，引用形态为 `{ id }`。
- 派生记录（尤其是 `Transform`）的文档与运行时长期要求：**callback 不得返回顶层 `id`**。
- 真实应用又需要客户端/跨进程**预生成稳定标识**（幂等创建、落库前外部键、创建前回传身份）。

若应用身份 ≠ 框架 `id`，Relation 与公开引用分裂；若强行把 UUID 塞进 `id`，又撞上 Transform 守卫与文档教义。问题陈述见 `prompt/entity-identity-and-relations.md`（供对照，不是已批准方案）。

### 1.2 源码事实（求证）

| # | 事实 | 证据 |
|---|------|------|
| F1 | Transform **硬禁止**顶层 `id` | `src/runtime/computations/Transform.ts`：`assertNoIdInTransformedRecord` 在 `compute`、event-based insert、data-based insert/update 四条路径调用；抛 `ComputationError`，文案断言「与目标实体发号序列冲突 → 静默损坏」。 |
| F2 | r13 将「返回顶层 id 必须失败」钉为回归 | `tests/runtime/review-fixes-2026-07-10-r13.spec.ts` F-3：`callback: (r) => ({...r})` 必须抛 `/top-level "id" field/`，且派生表为空。 |
| F3 | 存储创建**已支持**外部 `id` | `CreationExecutor.preprocessSameRowData`：仅当 `!isUpdate && !newRawDataWithNewIds.id` 时 `allocateRecordId`；注释明确支持外部用户系统 id / relocate。 |
| F4 | `applyResultPatch` entity/relation：insert → `storage.create(..., patch.data)`；update/delete 仅按 `patch.affectedId` 匹配 | `Controller.applyResultPatch`。update **不会**用 `patch.data.id` 定位，但会把 `patch.data`（可含 `id`）交给 `storage.update`。 |
| F5 | 逻辑 `id` **不是**表主键；物理 PK 是 `_rowId`；逻辑 id 的**物理列名也不是字面 `id`** | 三层必须区分：(1) 逻辑属性名 `id`（`ID_ATTR`）；(2) 物理 value 列 `recordInfo.idField` = `attributes.id.field`，由 `assignTableAndField` 经 `generateShortFieldName(\`${recordName}_id\`)` 生成（如 `use_id_12wcb9i`、`not_id_awlyp0`）；(3) 表级 PK `_rowId`（`ROW_ID_ATTR`，`mapToDBFieldType('pk')`）。逻辑 id 的 fieldType 按 `type:'id'`：PGLite=`UUID`，SQLite/PG/MySQL=`INT`。既有约束路径经 `resolveConstraintField` / `getTableAliasAndFieldName` 解析物理 field，从不把属性名当列名。 |
| F6 | 逻辑 `id` 列**默认无唯一约束** | 建表 SQL 只列字段，无 UNIQUE；仅 `_rowId` 有 PK。Transform 的唯一索引是 `(sourceRecordId, transformIndex)` 的**物理 field**，不是逻辑属性名，也不是逻辑 `id`。 |
| F7 | update 事件构造**故意不把 `id` 算作值变更 keys**，但写路径仍可能改写 `id` 列 | `CreationExecutor.buildSameRowUpdateEvent`：`field.name !== 'id'` 才进 keys，且 `record.id = oldRecord.id`；`getSameRowFieldAndValue` / `updateSameRowData` 仍会把 payload 里的 `id` 写入列。 |
| F8 | 文档与 anti-pattern **绝对禁止**手写/返回 id，并推荐 `clientId` 双身份 | `agent/.../generator/computation-implementation.md`「NEVER include id」；`usage/04-reactive-computations.md`；`usage/19-common-anti-patterns.md` §9（含「Why IDs Must Be Auto-Generated」与 clientId 配方）。 |
| F9 | 整数 driver 的发号对账只在 `setupSequences`，**不在每次外部 create** | SQLite/MySQL/PostgreSQL 的 `setupSequences`：`MAX(id)` 推进计数器；运行中 `create({id:5})` 后随后的 `getAutoId` 仍从 1 起，可与 5 碰撞。PGLite 使用 uuidv7，空间碰撞概率可忽略。 |

### 1.3 最小验证实验（本设计轮，PGLite + SQLite，revision `b7fe969`）

探针脚本（设计轮临时文件，实现前删除）：`tmp-entity-id-probe.mts`、`tmp-entity-id-probe2.mts`。

| 实验 | PGLite | SQLite | 结论 |
|------|--------|--------|------|
| E1 省略 id 创建 | uuidv7 写入逻辑 `id` | 整数序列 | 自动分配正常 |
| E2 创建携带外部 id | UUID 字符串原样落库，可按 id 查到 | 整数 `900001` 原样落库 | **存储层创建侧已具备外部 id** |
| E3 创建携带 UUID 字符串（INT 驱动） | n/a | SQLite 动态类型接受字符串 id | 类型契约松散；设计不得假设全驱动接受任意字符串 PK |
| E4 `storage.update(match by oldId, { id: other, title })` | 行逻辑 id **被改写**为 `other`；API 返回对象仍带**旧** id | 同左 | **update 可改写身份；返回值与存储不一致** |
| E5 重复外部 id 再 create | **无错误**，同 id 多行 | 同左 | **无唯一约束 → 静默重复 id**（与 Transform 守卫注释中的损坏形态一致） |
| E6 先外部 `id=5`，再连续自动分配 | n/a（uuid） | 自动得到 1..5，**与 5 重复** | 运行时外部 id **不推进**计数器；setup 对账不能覆盖本事务内碰撞 |
| E7 event-based Transform 返回 `id` | 抛 `ComputationError`（守卫） | — | 工厂型创建被拦，与文档一致、与存储能力不一致 |
| E8 data-based `({...r})` / 有意唯一 id | 均被守卫拦截 | — | 自然展开与合法预生成被同一规则拒绝 |
| E9 `applyResultPatch(update, data:{id:'should-not-stick'})` | PGLite 因非法 UUID 语法失败；合法 UUID 时会走 E4 改写路径 | — | patch 汇合点**未**剥离 `data.id` |
| E10 表结构 | PK=`_rowId`；逻辑 id 物理列为哈希短名（UUID，可空），无 unique | PK=`_rowId`；逻辑 id 物理列为哈希短名（INT），无 index | 印证 F5/F6；列名 ≠ 字面 `id` |
| E11 物理 `idField` + 合表（裁决 d2） | 孤立 `Note`：`idField=not_id_*` ≠ `id`；1:1 reliance 合表 `User_Profile` 上并存 `use_id_*` / `pro_id_*` / 关系 `use_pro_*` 三列 | 同左（INT 哈希名） | ``CREATE UNIQUE INDEX … ON T ("id")`` → `column "id" does not exist`；按各 `idField` 建索引后重复 create fail-loud |

### 1.4 问题是否成立

**成立，且不止「文档-only」。** 分解：

1. **运行时硬限制（真实缺口）**：Transform 全路径禁止顶层 `id`，使 InteractionEvent → Entity 工厂无法在创建时写入客户端预生成主键，尽管 `storage.create` 已支持。
2. **存储身份不变量不完整（比问题陈述更深）**：逻辑 `id` 无唯一约束；update 可改写 `id`；整数序列不与外部 id 在线对账。即便去掉 Transform 守卫，「单一身份」仍不安全——重复 id 与身份漂移是**已复现**的静默损坏，不是假设。
3. **文档/教义夹击（真实）**：绝对禁止手写 id + 反对裸 `*Id` 外键 + 推荐 `clientId` 平行列，逼出双身份或伪外键；与存储注释「支持外部 id」及 Relation 只认 `{ id }` 不一致。
4. **历史动机部分成立、部分过宽**：
   - **(a) 源 id 经 spread 误写入目标**：真实风险；在无唯一约束时是静默多行同 id。守卫用「一律禁止」消除了 (a)，也误伤了 (b)。
   - **(b) 客户端有意提供与目标表唯一的 id**：存储已支持；被 Transform/文档误伤。
   - **(c) 重复 id / 序列碰撞**：在 INT 驱动上真实（E5/E6）；正确消解是**唯一约束 + 创建时推进发号**，而不是永远禁止外部 id。

**范围不收缩为「只改文档」。** 若不修存储不变量，仅放宽 Transform 会放大 (a)(c)。

### 1.5 与「双身份 / identity 扩展」

文档中的 `clientId` 配方与问题陈述 §5.1 的声明式 `identity` 属于双身份过渡。求证表明：存储主键通道已在创建路径存在；缺口是契约与不变量，不是缺少第二列。**本任务不交付声明式 `identity`**（见非目标）。

---

## 2. 目标与非目标

对应 Task 要求编号。

### 2.1 目标

1. **求证结论入库**：上文 §1 为权威求证记录；实现不得回退到与 E1–E10 矛盾的假设。（要求 1）
2. **单一身份模型**：逻辑列 `id` 即应用身份与框架引用主键；创建时可选（预生成或框架生成）；创建后不可变；跨实体只走 Relation + `{ id }`。（要求 3、5）
3. **Transform / 写回规则**（要求 4）：
   - **insert**（含 event-based 工厂、data-based 新建映射行、`applyResult` 全量重建中的 create）：允许顶层 `id`；与已有行冲突则**唯一约束失败**（fail-loud），不得静默多行。
   - **update**：定位只认 `affectedId`（或 storage update 的 match）；**禁止**通过 patch/payload 改写逻辑 `id`（剥离或拒绝，见方案）；data-based 增量仍按 `sourceRecordId`/`transformIndex` → `affectedId` 工作。
   - **delete**：只认 `affectedId`。
4. **兼容超集**：省略 `id`、由框架分配的路径与现有测试必须继续通过；不强迫存量应用迁移主键。（要求 6）
5. **文档与错误信息**与运行时一致；删除「永远禁止返回/手写 id」的绝对表述。（要求 7）
6. **测试**：保留 r13「自然展开不得静默损坏」意图并按新机制调整断言；覆盖合法 insert id、省略 id、update 携带 id 不改主键、预生成 id 上 Relation / nested query / `computeTarget`；触及写路径时按 `AGENTS.md` 跑适用 fuzz / 真实 PG。（要求 8）
7. **工程**：分层与汇合点收敛；修一类而非单点；不扩大无关重构。（要求 10）

### 2.2 非目标

- 不把任意 `*Id` 字符串属性自动升格为外键。（要求 9）
- 不引入「仅 InteractionEvent Transform 可返回 id」的双轨主键语义。（要求 9）
- 不要求所有实体客户端预生成 id。（要求 9）
- 不做应用侧存量主键折叠迁移工具；不做声明式 `identity` 双身份桥（要求 6、9）。若库中已有重复逻辑 id，迁移加唯一索引失败时由应用先清洗数据——框架只提供清晰错误。
- 不在本任务改变 uuidv7 vs 整数发号的驱动差异（PGLite 仍 uuid，SQLite/PG/MySQL 仍整数序列）；**预生成 id 的类型必须与目标驱动的逻辑 id 类型相容**（文档写明）。
- 不把物理 `_rowId` 暴露为应用身份 API。

---

## 3. 方案（唯一）

### 3.1 身份语义（规范）

```text
逻辑 id（记录的 id 属性）
  = 应用身份
  = Relation / computeTarget / MatchExp 使用的主键
  ≠ 物理表主键 _rowId（实现细节，应用不可依赖其作为业务身份）

创建：
  - payload/callback 省略 id → allocateRecordId / getAutoId
  - 提供 id → 原样写入；写入成功后，整数序列驱动须保证后续 getAutoId > 该 id
    （或至少不再发出已占用 id；见 3.3）
  - 与已存在逻辑 id 冲突 → 存储唯一约束错误（不得第二行）

更新：
  - 匹配键是既有 id（match / affectedId）
  - 写入载荷中的顶层 id：不得改变已存储逻辑 id
    （规范行为：忽略/剥离；若与 affectedId 不同则不得写入新值）
  - 更新事件的 keys 继续不包含 id（已有行为保留）

删除：
  - 仅按 id / affectedId
```

### 3.2 Transform 规则（替换「永远禁止」）

| 路径 | 顶层 `id` | 行为 |
|------|-----------|------|
| insert 类 patch / compute 产出的新建行 | 允许 | 传入 `storage.create`；冲突 → 唯一约束失败 |
| update 类 patch | 禁止生效 | 在写入 storage 前从 `patch.data` **剥离** `id`；定位仅 `affectedId` |
| delete | 无 data.id | 仅 `affectedId` |
| 自然写法 `callback: (r) => ({...r})` | insert 时会带上源 id | **不再**靠 Transform 一律抛错消除；靠目标表逻辑 id **唯一约束**使「与已有目标 id 冲突」fail-loud。若目标尚无该 id，则目标行 id = 源行 id（派生行与源共享 id 值）。这是可观察行为，须在文档中写明：data-based 映射若需要独立身份，应 `({id: _, ...rest}) => rest` 或显式指定新 id。 |
| 嵌套 `{ author: { id } }` | 始终合法 | 关系引用，不经顶层 id 规则 |

**为何 update 选「剥离」而不是「与 insert 一样允许」：** data-based Transform 的增量模型用 `affectedId` 标识已映射行；允许 callback 改 id 会打断映射、Relation 外键与事件定位。E4 证明当前存储会静默改写，必须在汇合点关掉。

**为何 insert 不再 fail-fast 禁止：** 与单一身份及工厂型 Transform 目标一致；静默损坏由唯一约束承接（比「禁止一切外部 id」更窄、更准）。

**r13 意图保留方式：**

- 负向：在**已存在**同 id 目标行时，spread 源 id 插入必须失败（唯一约束），不得出现两行同 id。
- 正向：剥离 id 的 callback 仍得到框架新 id，且 `String(dst.id) !== String(src.id)`（保持现有正对照）。
- 新增正向：callback 返回**与源不同**的合法唯一 id 时，行主键即为该值。

### 3.3 存储层不变量（单一身份的前提）

在放宽 Transform 之前或同一里程碑内落地，否则回归 F1 注释中的损坏。

#### 3.3.1 逻辑 id 唯一 — 完整发出契约（领域第二次复审后锁定）

本领域（框架逻辑 id UNIQUE INDEX）在 d1（路径总闸）与 d2（物理列 / 合表枚举）各出现一次复审命中。按协议，以下用**有限、可执行**的契约一次写全；实现不得再靠「实现轮核对」补列名或合表分支。

**A. 为何不走用户 `UniqueConstraint` → `createUniqueConstraintStatement`（d1，仍成立）**

MySQL 方言声明 `constraints.unique === false`（历史：用户 `string`→`TEXT` 不可整列索引）。`createUniqueConstraintStatement` 在该标志下**无条件抛错**，与列是否为 INT 无关。`shouldSkipConstraintForDialect` 仅跳过 `_System_`/`_Dictionary_` 且名以 `interaqt_` 开头的内部 best-effort 约束。把逻辑 id 唯一登记成普通 `UniqueConstraint` 会使**任意含实体的 MySQL setup 失败**（`dataConstraints.spec.ts` 契约）。逻辑 `id` 是框架保留身份列，不是用户属性约束；与「用户 UniqueConstraint 在能力缺失方言上 fail-fast」不冲突。

**B. SQL 生成入口（唯一允许）**

- 仅调用 `createUniqueIndexSQL(physicalName, tableName, fields, dialect)`（`SchemaDialect.ts`）。
- **禁止**经 `createUniqueConstraintStatement` / 用户 `UniqueConstraint` 登记流水线发出框架 id 唯一。
- `fields` 数组元素必须是**已经解析好的物理列名**；`createUniqueIndexSQL` 只做字符串拼接与 quoting，**不会**把逻辑属性名翻译成物理 field（E11：字面 `"id"` → `column "id" does not exist`）。

**C. 记录枚举集合（谁需要一条索引）**

对 `EntityToTableMap` / setup map 中每个 record `R`：

| 条件 | 动作 |
|------|------|
| `R` 是 **非 filtered** 的 entity 或 relation（`!isFilteredEntity && !isFilteredRelation`），且存在 `attributes.id` / `idField` | **发出**一条 UNIQUE INDEX |
| `R` 是 filtered entity/relation | **跳过**（与 resolved base 共享物理 `idField` 与表；重复建无意义且名称冲突） |
| 内部非 ER 表（无逻辑 `id` 属性 / 无 `idField`） | **跳过**（本契约不覆盖） |
| 合表：多个 base record 共享同一 `table` | **每个**参与的 base record **各发一条**（互不替代）；同一物理表上可并存多条单列 UNIQUE INDEX |

孤立关系表、1:1 reliance 合表中的 source/target/link record，只要满足「非 filtered + 有 idField」，均在枚举内。不得写成「每个物理表一条」——合表下一表多逻辑 id（E11：`User`/`Profile`/关系三列并存）。

**D. 列与表解析（对每个枚举到的 `R`）**

```text
recordInfo = map.getRecordInfo(R)   // 或 setup 阶段等价的 map.records[R] + RecordInfo
table      = recordInfo.table
idField    = recordInfo.idField     // === attributes.id.field
             // 已由 assignTableAndField:
             //   field = generateShortFieldName(`${R}_id`)
             // 先例：用户约束 resolveConstraintField → getTableAliasAndFieldName([R], property, true)
             //       Transform 索引 MonoSystem.setupTransformUniqueIndexes 先取物理 field 再 createUniqueIndexSQL
assert idField is non-empty string
assert idField is NOT assumed equal to the literal "id"
             // 当前 generateShortFieldName 下实体/关系 id 列均非字面 "id"（E11）
SQL        = createUniqueIndexSQL(indexName, table, [idField], dialect)
```

实现须与上述先例同一纪律：**先解析物理列，再 DDL**。不得手写 ``ON T (id)``、不得把属性名 `"id"` 塞进 `fields`。

**E. 索引命名与可观测性**

- 名称由 `(recordName, idField)`（或等价稳定输入）派生，带框架可识别前缀（建议 `interaqt_` 或与 Transform `idx_transform_*` 并列的稳定前缀），经现有 identifier 长度治理 / 哈希缩短（对照 `Setup` 用户 unique 命名与 `MonoSystem.hashIdentifier`）。
- 名称必须进入 setup/migration 的可观测集合（schema items / manifest），使迁移能增删、审计能断言「已发出」。
- 合表上三条索引名称彼此不同（输入含不同 `recordName`/`idField`）。

**F. 方言决策表（实现一次对照，不得再改分支）**

| 方言 | `constraints.unique` | 用户 UniqueConstraint | 框架逻辑 id UNIQUE INDEX | 重复非空 id create |
|------|----------------------|----------------------|--------------------------|-------------------|
| PGLite / SQLite / PostgreSQL | `true` | 经现有流水线 | §3.3.1 B–E 专有路径；`fields=[idField]` | 唯一索引冲突 → fail-loud |
| MySQL | `false`（**保持**） | 仍 fail-fast（既有契约） | **同一**专有路径；`fields=[idField]`；类型 INT 可整列索引 | 唯一索引冲突 → fail-loud |

补充：

- 四驱动逻辑 id 列类型均可整列索引：MySQL/SQLite/PostgreSQL=`INT`，PGLite=`UUID`。
- **不得**为迁就 id 唯一把 MySQL `constraints.unique` 翻成 `true`（用户 TEXT UniqueConstraint 会生成非法 SQL）。
- **不采用**：MySQL 跳过 id unique；MySQL 因 id unique 拒方言；仿内部 kv「跳过」却仍宣称 M-01 唯一；按「每物理表一列 id」建模。

**G. 参考函数（实现与验收的单一判据）**

```text
function frameworkLogicalIdUniqueIndexes(map): list of { recordName, table, idField, indexName }
  for each recordName, record in map.records:
    if record.isFilteredEntity or record.isFilteredRelation: continue
    if record is not entity and not relation: continue
    idField = record.attributes.id?.field   // == getRecordInfo(recordName).idField
    if not idField: continue
    table = record.table                    // == getRecordInfo(recordName).table
    indexName = stableName(recordName, idField)
    yield { recordName, table, idField, indexName }

emit:
  for each item in frameworkLogicalIdUniqueIndexes(map):
    db.scheme(createUniqueIndexSQL(item.indexName, item.table, [item.idField], dialect), ...)
```

验收时：生成的 SQL/`fields` 必须与该函数输出逐条一致；合表用例下 `group by table` 的索引条数 ≥ 该表上 base record 数（各用不同 `idField`）。

**H. NULL 语义（非阻塞说明）**

逻辑 id 列在合表/same-row 删除场景可空；SQL UNIQUE 通常允许多个 NULL。本契约保证**非空逻辑 id 值唯一**。若未来要求「活行 id 非空」，另开增强，不是本任务通过条件。

#### 3.3.2 update 身份不可变

汇合点（至少一处，推荐两层防御）：

- **A. `Controller.applyResultPatch`（entity/relation update）**：写入前 `delete patch.data.id`（或等价剥离）。  
- **B. `UpdateExecutor` / `preprocessSameRowData(isUpdate)` 路径**：若 payload 含 `id` 且与 `oldRecord.id` 不同，则剥离或抛明确错误；同 id 幂等保留。  

选择：**B 为存储总闸（所有调用方）+ A 为 computation 路径清晰化**。公开 `storage.update` 同样不可改身份，避免只修 Transform 分支。  
规范行为锁定为**剥离且不抛错**（与同 id 幂等一致）；测试断言「行 id 未改且不依赖抛错」。

#### 3.3.3 外部 id 与发号序列

- 在 `allocateRecordId` 的对称路径：当 create 使用调用方 id 且驱动为单调整数序列时，**在同一写入路径推进计数器**到至少 `id`（与 `setupSequences` 的 MAX 语义一致，可复用 driver 能力或新增 `noteAllocatedId(recordName, id)`）。  
- PGLite uuidv7：无需整数推进；唯一索引仍要。  
- PostgreSQL：外部整数 id 后须 `setval` 推进（已有 setup 逻辑可抽到 create 路径或批量 note）。  
- MySQL：`IDSystem` 注释已承认「逻辑 id 无唯一索引时外部 id 与序列可静默碰撞」；本任务用框架 id UNIQUE + create 路径推进同时关闭该洞。

### 3.4 运行时汇合点与读者枚举

消费 Transform 结果或等价写回的路径（实现时须全部核对，避免单分支）：

| 读者 | 文件 | 动作 |
|------|------|------|
| `RecordsTransformHandle.compute` | `Transform.ts` | 去掉（或降级）`assertNoIdInTransformedRecord`；保留 sourceRecordId/transformIndex 注入 |
| `eventBasedIncrementalPatchCompute` | 同上 | insert 允许 id |
| `dataBasedIncrementalPatchCompute` create 分支 | 同上 | insert 允许 id |
| `dataBasedIncrementalPatchCompute` update 分支 | 同上 | 产出 update patch 时即可剥离 data.id，或依赖汇合点 B |
| `Controller.applyResult` entity/relation | `Controller.ts` | create 多项；透传 id |
| `Controller.applyResultPatch` | `Controller.ts` | insert 透传；update 剥离 id；delete 不动 |
| `Scheduler` 调 applyResult* | `Scheduler.ts` | 无独立 id 逻辑；回归覆盖即可 |
| `migration.ts` applyResultPatch | `migration.ts` | 走同一 Controller API，自动继承 |
| `CreationExecutor.preprocessSameRowData` | 创建/更新预处理 | 外部 id + 序列 note；update 身份闸 |
| `UpdateExecutor.updateSameRowData` | 更新 | 配合身份闸 |
| `DBSetup` / migration 索引阶段 | `Setup.ts`、migration | 按 §3.3.1 参考函数枚举非 filtered entity/relation；列=`idField`；`createUniqueIndexSQL`；绕过 unique 总闸；合表每 record 一条 |
| Driver `getAutoId` / `setupSequences` | drivers | 序列推进 API |

**收敛原则：** id 合法性不散落在每个 Transform 分支复制；**禁止改写**放在 storage update 总闸；**允许创建携带**保持 CreationExecutor 现有分支；Transform 只删除过宽断言并保证 update patch 不依赖「返回 id 改身份」。

### 3.5 Relation 与 `computeTarget`

- 不改 Relation 引用形态；单一身份下 `{ id: pregenerated }` 即应用 id。  
- 不增加按业务列解析的 helper（非目标）。  
- 验收：预生成 id 创建实体 → `Relation` / nested `attributeQuery` → `StateMachine.computeTarget: () => ({ id: pregenerated })` 更新成功。

### 3.6 文档与错误信息

必须改写的表述族（实现轮全文检索收口，下列为生成时已定位的锚点）：

- `agent/agentspace/knowledge/generator/computation-implementation.md` — NEVER include id  
- `agent/agentspace/knowledge/usage/04-reactive-computations.md` — must NOT return top-level id  
- `agent/agentspace/knowledge/usage/19-common-anti-patterns.md` §9 — 整节改为「创建可选 id / 更新不可变 / 勿用 spread 误带源 id；clientId 降为可选追踪列而非唯一推荐」  
- `agent/agentspace/knowledge/generator/api-reference.md` — 「do NOT include id field」及同类绝对禁令  
- `Transform.ts` 错误文案（若保留部分守卫或改为 update 专用错误）不得再写「explicit id collides with sequence and silently corrupts」作为创建禁令  
- `Setup.validatePropertyNames` / `propertyNameGuards` 中「use externalId」示例可保留（禁止用户声明名的属性叫 `id`），但须与「创建载荷可带 id 值」区分

### 3.7 明确不采用的替代

| 替代 | 拒绝理由 |
|------|----------|
| 仅改文档，保留 Transform 禁止 | 工厂型预生成主键仍不可用（E7） |
| 仅删守卫，不建唯一索引 | E5 静默重复 id 立即回归 |
| 声明式 `identity` 作默认 | 双身份成本高；存储单身份通道已存在 |
| 仅 InteractionEvent 允许 id | Task 禁止双轨；data-based insert 也应一致 |
| update 允许改 id | 破坏 affectedId 映射与引用稳定性（E4/E9） |
| 经用户 `UniqueConstraint` 流水线自动登记逻辑 id 唯一 | MySQL `unique:false` 使 setup 全崩（d1）；与「用户约束能力缺失 fail-fast」混淆 |
| 将 MySQL `constraints.unique` 翻为 `true` | 用户 TEXT 属性 UniqueConstraint 会生成非法整列索引 SQL |
| MySQL 跳过逻辑 id UNIQUE / 仅文档警告外部 id | 削弱单一身份的 fail-loud；与驱动自述「无唯一索引则静默损坏」矛盾 |
| MySQL 因 id unique 拒方言 | 存储层仍支持 MySQL；dispatch 缺事务是另一契约，不在此放弃身份不变量 |
| 对字面列名 `id` 建 UNIQUE / 假设每物理表一列 id | 物理列是 `idField` 哈希名；合表多逻辑 id（d2/E11）；DDL 会失败或漏索引 |

---

## 4. 里程碑

### M-01 — 存储身份不变量

- **结果：** 每个非 filtered entity/relation 的逻辑 id 经**框架专有 UNIQUE INDEX** 在其物理 `idField` 上唯一（四驱动含 MySQL；不经用户 `UniqueConstraint` 总闸；合表多逻辑 id 各一条）；`storage.create` 省略/携带 id 行为稳定；`storage.update` 不能改写逻辑 id（剥离、不抛错）；整数驱动在外部 id 创建后不会发出重复 id。MySQL 上用户声明的 `UniqueConstraint` 仍按既有契约 fail-fast。  
- **覆盖要求：** 3（存储侧）、8（基础测试）、部分 4。  
- **前置：** 无。  
- **reopen-count:** 1  
- **reopen-domains:** { 框架逻辑 id UNIQUE INDEX setup 幂等: 1 }  
- **状态:** `已完成`  
- **验收命令（实现阶段新增测试文件，建议名）：**  
  `npx vitest run tests/runtime/entityIdentity.spec.ts`  
  至少包含：  
  - create 省略 id / 携带唯一 id（PGLite + SQLite）  
  - 重复 id create 失败（唯一索引，fail-loud）  
  - update `{ id: other }` 后 find 仍为原 id，且**不抛错**  
  - SQLite（或当前 INT 驱动）外部大 id 后多次 auto create 无重复  
  - PGLite UUID 外部 id 路径  
  - **物理列契约（设计 d2 锁定，实现必须断言）：**  
    - 框架发出的每条逻辑 id UNIQUE INDEX，其列名等于对应 `recordInfo.idField`（`attributes.id.field`），且**不等于**误用的字面 `"id"`（在当前 `generateShortFieldName` 下实体/关系 id 列不会碰巧叫 `id`；若未来某记录 field 恰为 `id`，仍以 `idField` 解析结果为准，不得写死字面量）。  
    - 发出集合与 §3.3.1 参考函数一致：每个非 filtered entity/relation 恰一条；filtered 不重复。  
    - **合表**至少一例（1:1 `isTargetReliance`）：同一物理表上不少于两个（通常三个：source/target/link）不同 `idField` 各有 UNIQUE INDEX；对其中任一 record 的重复 id create fail-loud。  
  - **MySQL / mysql-like 方言探针（实现阶段新增，可与上同文件或 `entityIdentity.mysqlDialect.spec.ts`）：**  
    - setup **不因**框架逻辑 id UNIQUE 崩溃；  
    - **setup 再入幂等（审计 k=1 D1）：** `setup(true)` 后再次 `setup(false)`（及无 `IF NOT EXISTS` 方言路径）不得因框架 id UNIQUE INDEX 已存在而失败；首次仍须发出 `fields=[idField]`；重复逻辑 id 写入仍 fail-loud。  
    - 用户对实体声明 `UniqueConstraint` 时仍抛 `/unique constraints are not supported/`（既有契约不回退）；  
    - 框架 id 索引 SQL 由 `createUniqueIndexSQL` 生成且 `fields=[idField]`，**不**走 `createUniqueConstraintStatement`；  
    - 若环境有真实 MySQL（或最小 scheme 执行）：重复 id create 失败；`mysqlIdSequenceReconcile` 类 `setup(false)` 序列仍通过。无真实 MySQL 时至少 dialect/SQL + setup 再入断言锁定上列。  
- **最新证据：** 审计 k=2：复验 `entityIdentity` 9 passed/1 skipped（含 catch-path 加强用例）+ `dataConstraints` 14；对照设计无实现缺陷。D1 由 `isIndexAlreadyExists` + setup 捕获闭合；V2 metadata 已登记；审计轮补钉无 `IF NOT EXISTS` 时的再入 catch（stub scheme 1061 成功 / 1062 失败）。M-01 → `已完成`。

### M-02 — Transform / applyResultPatch 规则收敛

- **结果：** 删除过宽的 `assertNoIdInTransformedRecord` 创建禁令；insert 可带 id；update patch 在汇合点剥离 id；event-based 与 data-based 行为一致；错误信息与 §3.2 一致。  
- **覆盖要求：** 4、8（r13 调整）、10。  
- **前置：** M-01（必须先有逻辑 id 唯一索引，避免放宽守卫后静默重复）。  
- **reopen-count:** 0  
- **reopen-domains:** ∅  
- **状态:** `已完成`  
- **验收命令：**  
  `npx vitest run tests/runtime/review-fixes-2026-07-10-r13.spec.ts tests/runtime/entityIdentity.spec.ts tests/runtime/transform.spec.ts tests/runtime/transformInteraction.spec.ts`  
  r13：保留「不得静默双行同 id」；允许合法唯一 id insert；剥离 id 正对照仍通过。  
- **最新证据：** 审计 k=3：复验 34 passed/1 skipped + dataConstraints 14 + check 绿。对照 §3.2/§3.4 无实现缺陷。验证缺口 V4/V5 由审计轮直接加强（Controller strip spy；r13 碰撞钉 `ConstraintViolationError`/`id`）。M-02 → `已完成`。

### M-03 — 预生成 id × Relation × computeTarget 端到端

- **结果：** 客户端预生成 id 创建的实体可建 Relation、nested `attributeQuery` 可读、`StateMachine.computeTarget` 用同一 id 更新属性。  
- **覆盖要求：** 5、3、8。  
- **前置：** M-01、M-02。  
- **reopen-count:** 0  
- **reopen-domains:** ∅  
- **状态:** `已完成`  
- **验收命令：**  
  `npx vitest run tests/runtime/entityIdentity.spec.ts`（E2E 用例段）  
- **最新证据：** 审计 k=4：复验 `entityIdentity` 16 passed/1 skipped + r13/dataConstraints 23 + check 绿。对照 §3.5：预生成 id × Relation `{id}` × nested AQ 双向 × SM computeTarget 成立；无实现缺陷、无 src 回归。验证缺口 V6（单行 SM 无法证明 id 选择性）由审计轮直接加强为双预生成 id 行（目标转移、兄弟 pending）后复验绿。M-03 → `已完成`。

### M-04 — 文档与知识库一致

- **结果：** §3.6 所列锚点及全库同类「永远禁止 id」表述改为精确规则；usage/generator/anti-pattern/API 参考无夹击教义。  
- **覆盖要求：** 7。  
- **前置：** M-02（文实一致）。  
- **reopen-count:** 0  
- **reopen-domains:** ∅  
- **状态:** `已完成`  
- **验收命令：**  
  `rg -n "NEVER include \`id\`|must NOT return a top-level|Never specify ID|Why IDs Must Be Auto-Generated" agent/agentspace` 为空或仅剩历史归档说明；人工抽读 §3.6 文件。  
- **最新证据：** 审计 k=5：主验收 `rg` 零命中；扩展绝对禁令模式在 `agent/`+`AGENTS.md` 零命中；§3.6 四锚点与 `AGENTS.md` 抽读与单一身份一致；`propertyNameGuards` 保留名与载荷 id 值区分成立；M-01–M-03 套件 39 passed/1 skipped + `check` 绿。无实现缺陷、无 src 回归。M-04 → `已完成`。

### M-05 — 回归与写路径加固

- **结果：** 全量相关测试通过；若改动 CreationExecutor/UpdateExecutor/schema 约束，按 AGENTS.md 跑适用套件。  
- **覆盖要求：** 8、10、6。  
- **前置：** M-01–M-04。  
- **状态:** `已完成`  
- **reopen-count:** 0  
- **reopen-domains:** ∅  
- **验收命令：**  
  - `npm run check`  
  - `npx vitest run tests/runtime/entityIdentity.spec.ts tests/runtime/review-fixes-2026-07-10-r13.spec.ts tests/runtime/transform.spec.ts tests/runtime/transformInteraction.spec.ts tests/runtime/transformUpdatePath.spec.ts`  
  - 若触达 storage 写路径/约束：`npx vitest run tests/storage/writePathStructuralFuzz.spec.ts`（默认池）；约束/迁移相关时补 `tests/runtime/migrationGenerativeFuzz.spec.ts` 默认池或定向迁移测。  
  - 若改 PostgreSQL 序列推进：`INTERAQT_POSTGRES_DATABASE=... npm run test:postgres` 中 id/序列相关 spec。  
- **最新证据：** 审计 k=6：复验 check；主套件 40 passed / 2 skipped（含 env-gated PG 序列用例）；writePathStructuralFuzz 默认 16 + 扩展 100–119 → 28；driverDifferential SQLite↔PGLite 6/8 skip；migrationGenerativeFuzz 7；dataConstraints 14；真实 PG idConsistency/concurrency/dataConstraints 20。对照设计/Task 无实现缺陷。验证缺口 V7（PostgreSQL `noteAllocatedId` 缺方言匹配探针）由审计轮直接加强 `entityIdentity` PG 外部大 id 序列推进用例后定向复验 1 passed。M-05 → `已完成`。全部里程碑关闭 → Task `status: 已完成`。

**初始里程碑数 M = 5 → 实现预算 N = 5 × 5 = 25**（由设计通过裁决轮写入状态头）。

---

## 5. 风险与验证安排

| 风险 | 阶段 | 处理 |
|------|------|------|
| 存量库已有重复逻辑 id，加 UNIQUE 失败 | 实现 | migration 报错信息指明表/约束；文档说明需先清洗。setup(true) 测试不受影响。 |
| 放宽 Transform 后 data-based spread 使目标 id=源 id | 设计已接受 | 文档写明；唯一索引防双行；正对照测试保留 strip 写法。若评审认为必须禁止「id===sourceId」，可在 M-02 加可选警告——**默认不额外禁止**，避免再引入过宽规则。 |
| 整数序列与外部 id 推进的并发正确性 | 实现 | 复用 driver 现有原子 UPSERT / setval 模式；M-01 单测 + 必要时 postgres id 测。 |
| update 剥离 id vs 抛错 | 设计选定剥离 | 与「幂等重写同 id ref」一致；不同 id 静默剥离须在测试中断言「未改写」且不依赖抛错。若未来要严格模式可另开任务。 |
| PGLite UUID vs 他库 INT，预生成类型 | 文档 | 应用按驱动选择 id 类型；框架不在本任务统一为 UUID。 |
| Manifest / modelHash 因框架 id UNIQUE INDEX 变化触发迁移 | 实现 | 预期内；走现有 migration 约束/索引阶段；须确保 MySQL 路径登记的是框架专有索引而非用户 UniqueConstraint 项。 |
| 误经 `createUniqueConstraintStatement` 登记 id 唯一 | 设计已否决（d1） | 方言决策表锁定；M-01 mysql-like 探针断言用户 UniqueConstraint 仍 throw、框架 id 索引仍发出。 |
| 按字面列名 `id` 建索引 / 每表一条 | 设计已否决（d2） | §3.3.1 参考函数 + M-01 `idField`/合表断言；E11 证明字面 `id` DDL 失败。 |
| 仅文档问题误判 | 已否证 | E7 运行时拦截。 |

**设计期已验证：** E1–E11（创建/更新/重复/Transform/schema/物理 idField/合表）；裁决 d1 复验 MySQL unique 总闸；裁决 d2 复验 `idField` 与合表多索引。  
**实现期验证：** M-01–M-05 命令；不在设计期改生产代码。

---

## 6. 基线

| 项 | 值 |
|----|-----|
| Git revision | `b7fe969d5b3e5fcc6518c830ad9744e6246bf6bc`（`docs(changelog): fold the handwritten Unreleased section into the v4.4.0 entry`） |
| 工作树 | 干净实现树 + 未跟踪 `docs/`、`prompt/`（本任务文档）；设计轮临时探针已不在工作树；实现前无需清理 |
| 分支 | `main` |
| 相关已有测试 | r13 F-3 红于「允许 id」目标、绿于当前禁止语义；`transform*.spec.ts` 走剥离 id 幸福路径；**无**系统的「create 带 id + Relation」官方验收 |
| 设计轮实验 | §1.3 E1–E10；裁决 d2 E11（PGLite+SQLite 物理 idField/合表/字面 id DDL 失败）；未改 `src/`；临时探针已删除 |

---

## 7. 实现要点备忘（非独立方案）

1. 先 M-01 存储闸（§3.3.1 参考函数：per base record × `idField` × `createUniqueIndexSQL`，含 MySQL 与合表），再 M-02 删守卫。  
2. 修改 `assertNoIdInTransformedRecord` 或 r13 属契约变更：同步文档与所有依赖该错误文案的测试。  
3. `applyResult` 全量替换路径产出的行若带 id，依赖 M-01 唯一索引。  
4. 不引入向上依赖；框架 id 索引生成放 storage setup/migration（**不**经 `createUniqueConstraintStatement`；列必须先解析为 `idField`），Transform 只依赖放宽后的 create 契约。  
5. MySQL：保持 `constraints.unique === false`；用户 UniqueConstraint 契约测试不得回退。  
6. 列名纪律与 Transform `(sourceRecordId, transformIndex)` 索引、`resolveConstraintField` 一致：先 `getTableAliasAndFieldName` / `recordInfo.idField`，再 DDL。
