# 全代码库深度 Review 报告（2026-07-13 第二十七轮）

- 日期：2026-07-13
- 基线：`main` @ `d45356b4`（v4.1.0，r1–r26 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **2035 passed / 37 skipped**；全部 `postgresql*` 套件 @ 真实 PostgreSQL 16 **32 passed**；MySQL env-gated 套件 @ 真实 MySQL 8 通过
- 范围：五路并行深度探查（storage 查询编译 / storage 写路径 / runtime 调度与计算 / core+builtins / drivers+migration，含对 r26 leftovers 新代码的重点复查）+ 对全部致命候选**亲自编写最小复现实际运行定谳**（SQLite / PGLite / 真实 MySQL 8）
- 方法：与 r1–r26 全部报告逐条去重；每个候选先做代码路径二次追踪，再以运行时复现定谳。本轮聚焦两处结构性盲区：**「物理拓扑 × 载荷嵌套深度」的矩阵空白**（既有拓扑矩阵只铺深度 1）与**「单事件 × 多监听扇出」的执行次数语义**（从未被当作维度）
- 修复状态：**两个致命家族 + 五个重要项已在本分支（`cursor/deep-code-review-r27-aa44`）全部修复**。回归固化于 `tests/storage/review-fixes-2026-07-13-r27.spec.ts`（8 用例）、`tests/runtime/review-fixes-2026-07-13-r27.spec.ts`（15 用例）、`tests/runtime/mysqlMigrationOperationKey.spec.ts`（1 用例，env-gated）
- 修复后：`npm run check` 通过；`npm test` 全量 **2058 passed / 38 skipped**（净增 24 用例：新增回归 24，含 1 个 env-gated skip）；全部 `postgresql*` 套件 @ 真实 PG 16 **32 passed**；MySQL env-gated 套件（open 幂等 / close 幂等 / operationKey 代理键 / r26-leftovers timestamp 面）@ 真实 MySQL 8 全部通过

---

## 一、结论摘要

本轮两个致命发现都住在**从未被登记为维度的轴**上——不是既有契约的兄弟分支漏网（r25/r26 的形状），而是整根轴从未进过矩阵：

1. **combined（三表合一）子记录载荷中的嵌套结构全家族静默丢失/损坏**（F-1，影响面最大）——写路径只消费**宿主层**的分类列表；挂在 combined 子记录自身分类列表上的任何次级结构（关系、更深层嵌套）没有任何执行者处理，只有 value 列经 `getSameRowFieldAndValue` 递归写入。同一逻辑声明在 merged 拓扑下完整工作（子记录经 `createRecord` 递归），combined 拓扑下六种形态全部损坏。**运行时经 1:1 `isTargetReliance`（自动三表合一）即可触达**——不是 storage 层 `mergeLinks` 专属。
2. **同一计算的多个 property dataDeps 对同一事件双跑**（F-2）——每个 dataDep 注册独立监听，一次 update 同时命中 N 个 dep 时同一计算对**同一个事件对象**执行 N 次：`useLastValue` 的增量被双重叠加（实测 +2 而非 +1），create 的初始计算双跑。两次调用收到完全相同的事件，**用户层没有任何可区分信息做去重**，只能由框架合并。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修复） | 2 | combined 子记录嵌套结构静默丢失/损坏家族、多 property dep 单事件双跑 |
| 重要（已复现，已修复） | 5 | 单边 BoolExp 求值崩溃、聚合 record+property 静默偏好、MySQL 迁移 operationKey 代理键未接线、StateTransfer.clone(deep) 共享 trigger、onlyRelationData 静默丢数据 + 文档错误 |
| 文档修正 | 2 | RealTime「自动时间调度」不实承诺、storage-layer.mdc 第三元组误档为 "is collection" |
| 记录，本轮不修 | 若干 | 见第四节 |

---

## 二、致命问题（已复现确认并修复）

### F-1 combined 子记录载荷中的嵌套结构：六种形态全部静默丢失/损坏

- 位置：`src/storage/erstorage/CreationExecutor.ts` `preprocessSameRowData` / `handleCreationReliance` / `createRecordDependency`（全部只消费宿主层分类列表）；`NewRecordData` 的递归分类构造了完整的嵌套结构树，但 combined 子记录（`combinedNewRecords` / `combinedRecordIdRefs`）自身列表上的结构从无消费方。
- 机理：merged 拓扑的子记录经 `createRecordDependency → createRecord` 完整递归（自己的关系由自己的 create 处理）；combined 子记录与宿主同行，**刻意不走 createRecord**——id 分配、link id 分配、事件推送、reliance 处理（isolated / 反向合并 / merged-FK）全部只在宿主层执行一层。子记录 value 列经 `getSameRowFieldAndValue` 递归写入造成「表面可用」的错觉。
- 复现（六种形态全部实测，SQLite `mergeLinks` + PGLite `isTargetReliance` 两条轨）：

```
User–Profile 1:1 reliance（自动三表合一）；Profile–Team n:n；Profile–Company n:1；Profile–Avatar 1:1 reliance

① create User { profile: { title, teams: [{id}] } }
   → Profile.teams 恒 []（link 行静默不创建，零告警数据丢失）❌
② create User { profile: { title, company: { companyName } } }
   → Company 表恒空（嵌套新建静默不执行）❌
③ create User { profile: { title, company: { id } } }
   → FK 列写入、实体面查询可用，但 link 记录无 id、find(employment) 恒 []、零事件
   → 依赖该关系的 Count/StateMachine/filtered relation 全部失明 ❌
④ create User { profile: { title, avatar: { url } } }（深度2 combined 链）
   → avatar 值写入行内（嵌套查询可见）但无 id、无 create 事件、find('Avatar') 恒 [] ❌
⑤ create User { profile: { title: 'p2', avatar: { id: existing } } }
   → 旧行不迁移：同一逻辑 avatar id 出现两行（一行完整、一行只有 id）——数据损坏 ❌
⑥ update User { profile: { id: same, avatar: { id: other } } }（原地 ref 内嵌异 id ref）
   → 同上，重复逻辑 id + 零事件 ❌

对照：同形声明在 merged 拓扑（不加 reliance/mergeLinks）下全部正常 ✓
```

- 影响：任何使用 1:1 `isTargetReliance`（框架推荐的生命周期依赖声明）+ 依赖实体上其他关系的应用，嵌套一步到位的写法静默丢关系；文档（USAGE_GUIDE「Removing Multiple Relations」等）演示的深嵌套 create 形态在 combined 拓扑下全部踩雷。物理拓扑是 Setup 的内部优化决策，用户从声明面**无法预知**哪种拓扑会被选中。
- 修复（fail-fast，非全量实现）：`preprocessSameRowData` 汇合点（create + update 唯一必经路径）新增 `assertCombinedChildrenCarryNoUnsupportedStructure`：
  - 新建的 combined 子记录：只允许 value 属性 + `&` link 数据，任何关系属性拒绝（错误信息给出两步 workaround：先独立创建关联记录——其自身 create 处理全部关系——再以 `{id}` 引用装配，此形态经 flashOut 整行搬迁完整工作）；
  - 抢夺（非原地）ref 子记录：载荷残留豁免（既有契约：flashOut 以被抢行数据为准，快照残留被显式忽略）；
  - 同 id 原地更新的 ref 子记录：嵌套关系属性只允许**同 id 幂等 ref**（快照 round-trip、Transform relation patch 依赖该形态），异 id ref / 嵌套新建 / null 清除拒绝。
- 为什么不是全量实现：完整支持需要 4 个 executor 的递归改造（id/link-id 分配递归、事件递归、嵌套 reliance 的 post-insert 处理、flashOut 的嵌套路径匹配与结果挂载）+ 新矩阵维度全铺——属于特性级工程，不是 review 轮内可安全落地的修复。fail-fast 把六种静默损坏全部转化为带 workaround 的声明错误，工作面（值属性 + `&`、ref 整行抢夺、原地值更新、同 id 幂等 ref、深度 2 ref 装配）逐一verified 保留。
- 回归：storage 面 8 用例（六种拒绝形态 + 工作面保全 + merged 拓扑对照）；runtime 面 1 用例（reliance 拓扑 + 两步 workaround 全程验证）。

### F-2 同一计算的多个 property dataDeps：单事件双跑增量/初始计算

- 位置：`src/runtime/ComputationSourceMap.ts` `convertDataDepToERMutationEventsSourceMap`（每个 dataDep 注册独立监听，本身合理）；受害消费方 `src/runtime/Scheduler.ts` `buildComputationMutationListener`（逐 source 执行，无同计算去重）与 `src/runtime/migration.ts` `queueEvents` / `runIncrementalRecompute`（链式 rebuild 同构双跑，且入队×重放两层放大）。
- 机理：`Custom.create({ dataDeps: { scoreDep: {...['score']}, bonusDep: {...['bonus']} } })` 注册两个 update 监听。`update(User, { score, bonus })` 的单个事件命中两个 source → `runDirtyRecordsComputation` 执行两次——`incrementalCompute(lastValue)` 以「+1」语义写两次（实测值 2）；create 事件同理双跑 `compute`。两次调用的事件对象完全相同（`recordName`/`keys`/`record` 全同），`planIncremental` 的 `context.depKey` 不同但增量结果已经落库——**用户层不可能实现正确去重**。
- 复现（实测，PGLite）：

```
User { score, bonus, changeCount: Custom(useLastValue, incrementalCompute: last+1,
       dataDeps: { scoreDep: ['score'], bonusDep: ['bonus'] }) }

update(User, { score: 2, bonus: 2 })   // 一次逻辑变更
→ incrementalCalls === 2, changeCount +2 ❌（应为 1）
create(User, { score, bonus })
→ compute 双跑（初始计算两次）❌
```

- 修复（语义按 dep 类型分裂，两个消费方同一契约）：
  - **property dep（自身或同一 targetPath 的关联路径）**：同一 mutation 事件对同一计算合并为一次执行——property dep 的事件语义就是「宿主的一次变更」，事件自带 `keys` 供用户区分触及字段；
  - **records dep 不去重**：不同 dep 携带不同 match，per-dep 的 membership 判定（entered/left/skip）是增量语义的组成部分（一次 update 把记录从 dep A 的 match 迁到 dep B 时，两个 dep 各自的增量都必须执行）；
  - **不同 targetPath 的 property dep 不去重**：脏记录集不同（实测对照用例保留独立触发）。
  - live Scheduler 与 migration 链式 rebuild 两个消费方同步收口（migration 侧修双层：queueEvents 入队按 (computation, event) 去重防平方级重放 + runIncrementalRecompute 重放循环内 property-dep 去重）。
- 回归：runtime 面 3 用例（update 双 dep 合并为一次 + 单 dep 对照、create 初始计算一次、异 targetPath 不过度去重）。

---

## 三、重要问题（全部已修复）

- **I-1 单边 and/or BoolExpression：声明期合法、求值期必炸**：`BoolExpressionData.create({ left })`（单边包装）是 r26 I-3 明确保留的合法声明形态，测试夹具大量使用；但 `BoolExp.evaluate/evaluateAsync` 的 `requireRight` 对缺 right 的 and/or 一律抛 `"missing the right operand"`——带此 Conditions 的 Interaction **每次 dispatch 都以内部错误失败**（非守卫语义错误）。同一声明面的第三个读者 `SQLBuilder.buildWhereClause` 对单边 and/or 直接在 `right!` 上 TypeError。修复：三个读者（evaluate/evaluateAsync/map + SQL 编译）统一为**左透传**（and/or 幺元语义），De Morgan 取反随左子树正常传播；fail-closed 方向保留（条件不满足仍是守卫错误）。r2 时代断言 throw 的旧测试按契约演化更新。
- **I-2 聚合计算 record 与 property 同给：record 被静默忽略**：六个聚合类（Count/Every/Any/Summation/Average/WeightedSummation）的 create 只查「至少给一个」；运行期 `aggregationTemplate` property 分支优先，record 是死配置——声明者以为在聚合 record 指定的集合，实际绑定宿主 property 关系，**错误数字零告警**。修复：`validateAggregationTarget`（@core 汇合点）XOR 拒绝，六类统一接线；两处携带死配置的既有夹具顺带修正（`serialization-roundtrip` 拆为 property/record 两个实例断言、r3 夹具删除死 record）。
- **I-3 MySQL 迁移 operationKey sha256 代理键：r26 声称已修但从未接线**：r26 把迁移簿记表键列改为 VARCHAR(191) 并在注释与报告中声称「MySQL 上以 sha256 代理键存储」，但归一化 helper 挂在 MonoSystem 上**从未被调用**（死代码），MonoStorage 的读写路径直接使用原文键。operationKey 是内容寻址键（含完整 DDL 文本），CREATE TABLE 轻松超 191 字符；驱动 `SET sql_mode='ANSI_QUOTES'` **替换**掉了 STRICT_TRANS_TABLES——超长键被静默截断：resume 判定（全长键查询）恒 miss、共享前缀的不同操作主键碰撞（第二个操作被误判已完成 → DDL 静默跳过）。修复：归一化移入 MonoStorage 读写两侧（唯一汇合点，`applyMigrationOperations`/`verifyMigrationPlan`/Controller manifest key 全部经过），删除死 helper。回归 @ 真实 MySQL 8：400+ 字符键 round-trip + 共享 191 前缀不碰撞 + 幂等重放（env-gated，已加入 CI MySQL 套件清单）。
- **I-4 `StateTransfer.clone(deep)` 共享 trigger 引用**（r26 L-5 深 clone 的兄弟面）：改克隆的 `trigger.record` 会隔空篡改原状态机的触发条件。修复：deep 时 `structuredClone(trigger)`；节点保持引用共享（standalone clone 无节点映射上下文，克隆节点会产生与 `states` 数组失联的孤儿——整图深拷贝走 `StateMachine.clone(sm, true)`）；行为函数按惯例共享；浅 clone 语义不变。
- **I-5 attributeQuery 第三元组（onlyRelationData）：声明即静默丢整个属性 + 文档错档**：该历史标志让 x:n 关联的二阶段查询被跳过，而主查询从不 SELECT x:n 数据——结果里该属性**整体缺失**（实体数据与 `&` 数据都没有，零告警）。代码库中没有任何内部生产点（纯公开面死 API）；更糟的是 `.cursor/rules/storage-layer.mdc` 把第三元组档成 **"true = is collection"**——按文档写集合查询的用户/agent 每个 x:n 属性都静默消失。修复：AttributeQuery 构造期 fail-fast（错误信息说明集合无需任何标记）+ 文档修正 + 既有存在性测试改为拒绝断言 + 正确集合查询对照。

### 文档修正（随修复落地）

- **RealTime「自动时间调度」不实承诺**：`agent/agentspace/knowledge/usage/04-reactive-computations.md` 通篇声称 "System automatically manages when to recompute" / "Update every second"——运行时**没有任何时间调度器**（r3 R-5 / r11 R-2 已知，property 零依赖形态已 fail-fast，但文档从未修正）。`nextRecomputeTime` 只被求值并持久化到 bound state，重算只由 dataDeps 变更（或迁移 rebuild）触发。文档改为如实描述：边界时间持久化供**外部调度器**（cron/dispatch）驱动，全部误导措辞逐条修正。时间调度器仍是记录中的特性缺口（见第四节）。

---

## 四、记录，本轮不修（有明确理由）

1. **RealTime 时间调度器缺失**（r3 R-5 / r11 R-2 / 本轮复确）：特性级缺口而非缺陷——需要 Controller 生命周期内的 timer 管理、崩溃恢复（持久化边界的启动重扫）、多进程协调等产品设计。本轮以文档如实化收口用户预期；property 零依赖形态的 fail-fast 守卫（r11）继续拦截最危险的静默形态。
2. **MySQL `TIMESTAMP` 列型的 1970–2038 range**（drivers 探查）：越界 epoch-ms 在非严格模式下被钳制/置零（读回错误时刻）。改列型为 `DATETIME(3)` 会动 `mapToDBFieldType` 产出 → modelHash → 存量部署 re-baseline，且 MySQL 驱动 `transactions: false` 下 dispatch/migrate 本就不可用（transactionCapability 固化）——收益不匹配破坏面，记录待 MySQL 驱动整体升级时一并处理。
3. **迁移 legacy operationKey 回退按当前计划 index 匹配**（drivers 探查）：跨版本 resume + 计划重排的窄场景下 legacy 行 miss → 操作重跑。additive DDL 计划从现库状态重新生成（已应用列不会再入计划），实际暴露面限于 constraints 阶段的窄组合；legacy 回退本身是一次性过渡机制，记录。
4. **`#occurrence` 后缀的计划序依赖**（r26 报告已记录的边界）：同内容操作在 resume 间重排的退化格，维持记录。
5. **`{ id: null }` 关系引用形态**：实测在 combined 拓扑下与 `{attr: null}` 等价工作（unlink + 清列 + delete 事件），巧合正确；作为第三种清除写法未文档化，暂不收紧（收紧会破坏可能依赖它的存量代码，且当前行为无损坏）。
6. **filtered targetPath 全量重算风暴 / dedupe 扇出 / 深嵌 EXIST 别名 / post-pagination tie**：r23–r26 既有记录项，本轮探查无新增证据，维持记录。
7. **`Property.public.type.options` 是函数、`Entity.commonProperties` 约束谓词读错字段**（core 探查）：均为**未接线**的潜伏元数据缺陷（Property/Entity 未走 `validateCreateArgs`）——接线前不可达。记录：未来把这两个类接入统一校验时必须先修元数据（`validateCreateArgs` 需支持函数形态 options，或元数据改静态数组）。
8. **relocate 物理搬迁对 merged-FK link 重新分配 link id**（F-1 探查路上顺带发现的疑点）：relocate 的 insertSameRowData 会对被搬迁行上的 merged link 重新走 id 分配循环——link 逻辑身份可能变化。未构造出用户可见红例（relocate 只对非 reliance mergeLinks 拓扑可达），记录待查。

---

## 五、证伪 / 未达致命门槛的候选

| 候选 | 结论 |
|------|------|
| 深度 2 combined 的 ref 装配（`profile: {id}` 引用带 avatar 的既有行）会丢失孙记录 | 证伪：flashOut 整行搬迁把全部同行列（含孙记录）完整带走，实测 avatar 随行迁移、逻辑 id 不变 |
| 深度 2 reliance 链的级联删除漏删孙记录 | 证伪：删除走 map 编译后的 reliance 结构（非载荷驱动），实测 User→Profile→Avatar 全链级联 |
| 快照整体回写（`update {profile: <find 返回的完整快照>}`）在 combined 拓扑下损坏 | 证伪：非原地 ref 走 flashOut 抢夺，快照残留被显式忽略；原地同 id 幂等 ref 由本轮守卫显式放行 |
| MySQL open 幂等回归失败 | 证伪：并行运行的测试文件互数连接（测试环境干扰），串行复跑通过 |

---

## 六、逃逸分析（为什么 26 轮没抓到）

完整复盘见 `r27-test-blindness-retrospective.md`。一句话版本：

1. **F-1：矩阵有「物理拓扑」轴、有「载荷形态」轴，但两轴只在深度 1 交叉**。`writePathTopologyMatrix` 把 combined/merged 铺满了宿主直接属性的全部写法，而「子记录载荷自身携带什么」从未成为取值——merged 拓扑下深嵌套恰好工作（createRecord 递归天然覆盖），给「嵌套载荷已覆盖」发了假签证。**拓扑轴的语义是「同一逻辑声明在不同物理编译下必须等价」，这要求每个载荷形态×每个拓扑全积**，深度是载荷形态的隐藏参数。
2. **F-2：监听注册面从未有「扇出语义」维度**。r18 的死监听不变量管「监听可达」，r22 管「type 合法」——都是单监听的性质；「同一事件命中同一计算的多个监听时执行几次」是**监听集合**的性质，逐监听断言天然失明。既有多 dep 测试恰好都只让单个 dep 命中（每次 update 只改一个 dep 的字段）——夹具偏置与 r25 F-1 的「测试总带显式 `&`」同族。
3. **I-1/I-5：声明面与消费面的合法性判定分裂**。r26 声明期确认单边包装合法却没有问「三个求值读者是否接受」；onlyRelationData 有类型位、有合并语义、有存在性测试，唯独没有任何测试断言**它返回什么**。
4. **I-3：「声称已修」与「已接线」之间没有机器验证**。r26 的修复注释、报告、CHANGELOG 都说了 sha256 代理键，helper 也写了——但没有任何 MySQL 面的 operationKey 测试，dead code 静静躺了一轮。**修复声明必须伴随该修复独有行为的运行时探针**。

---

## 七、修复优先级与后续建议

1. **combined 子记录嵌套结构的完整实现**（F-1 的特性面）：本轮 fail-fast 已消除静默损坏；若用户需求充分，按登记册新维度全铺矩阵后做 4-executor 递归改造。设计要点已在守卫注释与本报告 §二记录。
2. **RealTime 时间调度器**：文档已如实化；实现时按 `nextRecomputeTime` bound state 驱动 + Controller 生命周期 timer + 启动重扫设计。
3. **MySQL 驱动整体升级决策**（transactions 支持 + TIMESTAMP→DATETIME(3) 列型迁移打包处理）。
4. **Property/Entity 接入 `validateCreateArgs`**（先修元数据，见第四节 #7）。
5. 其余 r23–r26 记录项按既有清单推进。

### 升级注意（behavior-tightening，供 CHANGELOG 参考）

- **新增写入期 fail-fast**：combined（三表合一，含 1:1 `isTargetReliance` 自动合表）子记录载荷携带关系属性/嵌套记录（此前六种形态静默丢失或损坏数据）。两步写法不受影响：先独立创建关联记录再以 `{id}` 引用。
- **行为修正（无 API 变化）**：同一计算的多个 property dataDeps 被单个 mutation 事件命中时只执行一次（此前执行 N 次；`useLastValue` 增量计数与 create 初始计算受影响，首次 setup 后全量重算纠正存量错值）。
- **单边 and/or（`BoolExpressionData.create({ left })`）开始按左操作数求值**（此前每次求值抛 "missing the right operand"；依赖该错误做防御的代码需改为声明期校验）。
- **新增声明期 fail-fast**：聚合计算 record 与 property 同给（此前 record 被静默忽略）。
- **attributeQuery 第三元组（legacy onlyRelationData）开始 fail-fast**（此前该属性从结果中静默整体缺失）。
- **MySQL 迁移 operationKey 以 sha256 代理键存储**（此前超长键静默截断；存量 MySQL 迁移日志行若有截断键将不再命中——MySQL 迁移面此前本就不可用，无实际存量影响）。
- **`StateTransfer.clone(x, true)` 的 trigger 开始深拷贝**（此前共享引用）。
