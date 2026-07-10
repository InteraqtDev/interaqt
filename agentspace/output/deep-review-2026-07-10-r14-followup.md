# r13 后续轮（2026-07-10 r14）：Attributive 概念废弃 + 全部显著改进项修复

- 日期：2026-07-10
- 基线：`cursor/deep-code-review-r13-f820` @ r13 修复之后（1841 passed / 26 skipped）
- 范围：按框架决策废弃 `Attributive` 概念（只保留 `Condition`）；修复 r13 报告第四节全部 10 项显著改进项。
- 结果：`npm run check` 通过；`npm run build` 通过；`npm test` 全量 **1839 passed / 26 skipped**（Attributive 专属测试删除/迁移后净变化，零功能回归）。

---

## 一、Attributive 概念废弃（breaking change）

### 决策

守卫概念收敛为唯一的 `Condition`/`Conditions`。理由：Condition 回调收到完整 event args（`user`/`payload`/`query`/`activityId`）且以 Controller 为 `this`，Attributive 能表达的所有形态（角色检查、payload 内容校验、activity 用户绑定）都可以用 Condition 等价且更直接地表达；两套守卫概念是纯粹的表面积成本（r7–r13 中 attributive 家族累计贡献了 9 个缺陷：isRef 死区、弱校验矩阵、userRef/itemRef 死 API、fail-open 形态等）。

### 移除清单

| 移除项 | 迁移路径 |
|--------|---------|
| `Attributive` / `Attributives` Klass（含注册表、序列化） | `Condition` / `Conditions` |
| `Interaction.userAttributives` / `Interaction.userRef` | `conditions`（回调读 `event.user`） |
| `PayloadItem.attributives` / `PayloadItem.itemRef` | `conditions`（回调读 `event.payload`） |
| `createUserRoleAttributive` / `boolExpToAttributives` | 角色检查写成 Condition；组合用 `Conditions.create({content: BoolExp})` |
| activity `refs` 存取（`saveUserRefs`/`checkUserRef`/`fullGuardWithUserRef`）与 `_Activity_.refs` 列 | Condition 查询本 activity 的既有交互事件（`InteractionEventEntity` + `activity.id` match）定位角色 |
| payload base 的 `Attributive`/`ConceptAlias`/`DerivedConcept` 形态（`checkConcept` 家族） | base 只接受 Entity/Relation（声明期校验）；内容校验用 conditions |
| core `Concept`/`DerivedConcept`/`ConceptAlias`/`ConceptInstance` 类型（只服务于被移除的 checkConcept） | 无需替代 |
| `ConditionError` 的 `user`/`attributive`/`concept` checkType 与对应工厂 | `condition`/`payload` 两种 checkType |

### 防静默迁移

旧代码传入 `userAttributives`/`userRef`（Interaction）或 `attributives`/`itemRef`（PayloadItem）时**声明期 fail-fast**，错误信息指引 Condition 写法——静默丢弃会让旧代码以为权限仍然生效（fail-open），这是本次拆除中最重要的安全设计。

### 连带修正

- guard 链简化为 `checkCondition + checkPayload`（`runInteractionGuard` 无 options，activity 与 standalone 路径完全同构）；
- payload base 的存在性校验（isRef）与结构校验（object）合并进 `checkPayload` 单一循环；
- `ActivityManager` 三个 guard 分支统一走 `fullGuard`；
- 知识库 16 个文档迁移为 Condition 写法（`06-attributive-permissions.md` 保留为迁移指引）；AGENTS.md / README / `.cursor/rules` 同步。

### 测试迁移

- `tests/builtins/attributive.spec.ts` → `guard-klasses.spec.ts`（Condition/Conditions/Activity/Transfer 序列化覆盖，Attributive 块删除、Condition round-trip 补齐）；
- `tests/core/bool-attributive-refactored.spec.ts` → `bool-condition-refactored.spec.ts`；
- activity 测试数据（好友申请流程）的 userRef/itemRef/isRef 用「查询 send 事件的 Condition」重写，`activity.spec.ts` 的"错误用户被拒"断言保持；
- r10/r12 的 isRef 回归测试改写为 Condition 等价场景（回归价值保留：head+activityId 走完整守卫、集合成员资格检查）；
- 新增 legacy 参数 fail-fast 回归（`review-repro-guards.spec.ts`）。

---

## 二、显著改进项修复（r13 §四 I-1 ~ I-10）

| # | 修复 | 位置 | 回归测试 |
|---|------|------|---------|
| I-1 | entity/relation 级 Custom 的 `useLastValue` **默认关闭**（全表 lastValue 快照是 OOM 悬崖；此前默认开启时增量路径实际会撞 `fullOutput` 协议错误）。显式 opt-in 路径保留：`useLastValue: true` + `planIncremental` 返回 `needsLastValue: {mode: 'fullOutput', reason}`（知情选择） | `computations/Custom.ts` | r14 spec I-1 ×2 |
| I-2 | `Controller.teardown()` / `Scheduler.teardown()`：注销全部计算监听。长生命周期进程（热重载、多租户）丢弃 controller 前调用，否则旧计算闭包永驻 storage 回调集合 | `Controller.ts` / `Scheduler.ts` | r14 spec I-2 |
| I-3 | `atomic.lockRows` 锁后稳定化：锁定后**按原 match 重查**（漂出的行不再以陈旧内容返回），发现锁集外的新匹配 id 时有界扩锁重试（5 轮），无行锁驱动单轮即稳定 | `MonoSystem.ts` | r14 spec I-3（语义）；PG 并发行为由 postgresqlConcurrency CI 覆盖 |
| I-4 | `dict.get` 声明驱动回退：Scheduler.setup 把 `Dictionary.defaultValue` 注册进 storage（`dict.registerDefaults`），无存储行时按声明求值；已存储的显式值（含 null）优先 | `MonoSystem.ts` / `System.ts` / `Scheduler.ts` | r14 spec I-4 |
| I-5 | 事务重试判定收录 `SQLITE_BUSY`（写锁竞争）、PG `57P01`（池空闲连接被回收）、`ECONNRESET`/`EPIPE`（连接瞬断，重试从池取新连接）；`ECONNREFUSED` 等持续性错误明确排除 | `transaction.ts` | r14 spec I-5 |
| I-6 | dispatch 错误响应与成功路径同键集（`data`/`context` 显式 undefined），HTTP 层序列化形态一致 | `Controller.ts` | r14 spec I-6 |
| I-7 | 物理表名长度治理：新增方言能力位 `enforceMaxIdentifierLength`（PG/PGLite/MySQL true、SQLite false——SQLite 实际无标识符限制），强制方言下超限表名 Setup 期 fail-fast（不自动缩短——表名变更等于换库，须显式改实体名） | `SchemaDialect.ts` / `Setup.ts` / 四驱动 | r14 storage spec ×2（PG 方言拒绝 + SQLite 放行） |
| I-8 | orderBy 走 x:n 关系路径声明期拒绝（扇出行序排序语义未定义），x:1 路径不受影响；错误指引 computed 聚合属性或应用层排序 | `Modifier.ts` | r14 storage spec ×2 |
| I-9 | **决策：不改**。PG `pk → INT GENERATED ALWAYS AS IDENTITY` 补 PRIMARY KEY 会改变 fieldType 字符串 → 进迁移 manifest 的 modelHash（storage schema 全量入哈希）→ 所有存量 PG 部署 setup(false) 撞 manifest mismatch。_rowId 无外键引用、唯一性由 IDENTITY 保证，缺约束无实际损坏路径。源码注释记录该奠定性差异 | `PostgreSQL.ts`（注释） | — |
| I-10 | Activity 声明期错误 → `ActivityError`、运行期状态错误 → `ActivityStateError`（含 activityName/activityInstanceId/currentState 上下文），调用方可按 FrameworkError 树分流；错误消息全部保留（既有 message 正则断言不受影响） | `ActivityCall.ts` / `ActivityManager.ts` | r14 spec I-10 |

### 连带清理

- `ConditionError` 收敛为 `condition`/`payload` 两种 checkType（`user`/`attributive`/`concept` 与对应工厂随 Attributive 概念移除）；
- r13 的 `permission-test-implementation.md` 契约描述同步（"Condition callbacks"）。

## 三、遗留项状态更新

r13 §四之外的历史遗留项不在本轮范围（迁移阶段顺序 r10-I-1、并发家族的驱动级 UPSERT 治理、async task failed 态、Klass.clone 注册语义、createClass 统一校验等），r13 报告第六、七节的清单与优先级建议继续有效。r13 §四低优先级尾巴中：`checkConceptAttributive` 错误聚合、`PayloadItem.base` 序列化契约两项随 Attributive 拆除自然消失；数组 pattern 前缀匹配、RealTime NaN、ScopedSequence scope 更新语义三项仍为已记录遗留。
