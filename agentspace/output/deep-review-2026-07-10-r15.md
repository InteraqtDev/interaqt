# 全代码库深度 Review 报告（2026-07-10 第十五轮）

- 日期：2026-07-10
- 基线：`main` @ `99fe23ba`（v3.0.0，r1–r14 全部致命/重要修复及 Attributive 概念废弃已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1836 passed / 26 skipped**
- 范围：四路并行深度探查 + 亲自精读验证——runtime 引擎（Scheduler 事件路由 / Controller applyResult 链 / r14 新增 teardown·dict 回退·lockRows 稳定化）/ storage 读路径（QueryExecutor 批量分组、AttributeQuery 合并）/ computations 语义一致性（StateMachine 提交顺序、ComputationResult 协议面）/ builtins 守卫链（Attributive 拆除后的回归面）/ migration（跨进程 resume、dict 回退一致性）
- 方法：与 r1–r14 全部报告逐条去重（四路探查候选中过半为既有遗留项或已修项，全部剔除）→ 对每个致命/重要候选**编写最小复现测试实际运行**（PGLiteDB）。「已复现确认」才列为致命/重要；证伪/降级的候选明确记录（见第五节）。

> **维护说明（2026-07-10）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r15-43e1`）全部修复。回归测试：`tests/runtime/review-fixes-2026-07-10-r15.spec.ts`（8 用例）。修复后 `npm run check` 通过，`npm test` 全量通过（净 +8 回归用例，零既有用例回归）。

---

## 一、结论摘要

r1–r14 十四轮修复后，读写主路径、聚合增量一致性（r6 矩阵 `KNOWN_BROKEN_CELLS = []`）、filtered/merged 编译、守卫链严格 boolean 契约、migration 主流程都已高度收敛。本轮找到的新问题集中在两类：

1. **「先提交内部状态、再校验输出值」的顺序缺口**——StateMachine 在调用 `computeValue` **之前**就用 `setInternal` 推进了 bound `currentState`，而 r13-F-2 让 `applyResult` 对 undefined 统一 skip。两个各自正确的行为组合出新的脱钩形态：`computeValue` 漏写 return 时，**状态机内部已前进、可见属性原地不动**，下一个事件从新状态出发做转移，读方却仍看到旧值——比写穿 undefined 更隐蔽（值"看起来没坏"）。
2. **ComputationResult 协议信封的处理不对称**——增量路径（`executeDataBasedComputation`）会拆解 `fullRecompute` 信封，`compute()` 全量路径与 `asyncReturn` 路径却把信封当普通值直通 `applyResult` 原样落库（dict 值变成 `{"reason":"..."}`）。
3. **迁移跨进程 resume 的进程内状态缺口**——`phase >= schema-applied` 时跳过 `applyMigrationSchema`，但该函数同时承担「初始化本进程 queryHandle」的职责；崩溃后在全新进程 resume 时带着未初始化的 queryHandle 进重算事务，抛裸 TypeError 且每次重试都一样——迁移永久卡死。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 2 | StateMachine bound state 与可见属性脱钩、迁移 resume 永久卡死 |
| 重要（已复现，已修） | 4 | ComputationResult 信封写穿、dict 默认值工厂漂移、teardown 残留回退、context.skip 未集中收口 |
| 重要（代码证据，已修） | 4 | 迁移期 dict 回退缺失、migrate 无监听防御、批量 1:n id 类型归一、Condition 声明期校验 |
| 证伪/降级 | 5 | 见第五节 |
| 遗留项复确 | — | 见第六节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 StateMachine `computeValue` 返回 undefined：bound state 已推进、可见属性不动——状态机内外脱钩

- 位置：`src/runtime/computations/StateMachine.ts` `PropertyStateMachineHandle.incrementalCompute` / `GlobalStateMachineHandle.incrementalCompute`（`setInternal(nextState.name)` 在 `computeValue` 调用**之前**）；`src/runtime/Controller.ts` `applyResult`（r13-F-2 起对 undefined 统一 skip）。
- 复现（实测输出，pending → approved → done 三态机，approved 的 `computeValue` 漏写 return）：

```
dispatch(advance) → { error: undefined }               // 第一跳"成功"
task.status → 'pending'                                 ❌ 可见属性没动
dispatch(advance) → { error: undefined }               // 第二跳
task.status → 'done'                                    ❌ 直接跳到 done——
                                                        //  内部 bound state 早已是 approved
```

- 影响：`computeValue` 漏写 return / 分支遗漏是与 r13-F-2（compute 漏写 return）完全同族的最常见用户错误。r13 把 applyResult 的 undefined 从「写穿抹值」改为「skip 保值」是正确的，但 StateMachine 的 bound `currentState` 在那之前就已用 `setInternal`（原子 replace，随事务提交）推进——**转移的判定基础（bound state）与转移的输出（可见属性）从此各说各话**：后续 `findNextState` 按新状态取转移、审计/查询读到旧值。存量测试全部显式 return，十四轮未暴露。
- 修复：新增 `resolveComputeValue` 统一执行四个调用点（global/property × getInitialValue/incrementalCompute）的 computeValue，**undefined 返回值一律 `ComputationProtocolError` fail-fast**——dispatch 事务整体回滚（bound state 推进一并回滚，内外保持一致），错误信息指引「返回要持久化的值 / `return lastValue` 保值 / `return null` 清空」。合法形态（返回值、null、无 computeValue 用状态名）不受影响。
- 回归：漏写 return 的三态机两次 dispatch 均受控失败且 status 恒为 pending（绝不出现 pending→done 跳变）；值/null 两种合法 computeValue 照常工作。

### F-2（升级自探查判定）迁移跨进程 resume 永久卡死：`schema-applied` 跳过的不只是 DDL，还有本进程 queryHandle 初始化

- 位置：`src/runtime/Controller.ts` `migrate()`（`if (!reached(phase, 'schema-applied')) applyMigrationSchema(...)`）；`src/runtime/MonoSystem.ts` `applyMigrationAdditivePlan`（末四行初始化 `queryHandle/map/schema`——进程内状态）。
- 复现（实测输出）：v1 install → v2 approvedDiff → 手工应用 preRecomputeDDL + 迁移日志记 `phase='schema-applied', status='failed'`（模拟崩溃）→ **全新 MonoSystem/Controller** resume：

```
controllerV3.migrate({ approvedDiff })
→ Cannot read properties of undefined (reading 'find')   ❌ 重算事务第一次 storage 读即裸崩
→ finishMigration('failed') → 下次 resume 同样路径同样崩溃  ❌ 不可恢复的 resume 循环
```

- 影响：迁移的 resume 能力正是为「进程崩溃后换进程重试」设计的（beginMigration 按 modelHash+diffHash 找 resumable 行），但 phase 记录的是**数据库**状态，queryHandle 是**进程**状态——按 phase 跳过 applyMigrationSchema 把两者混为一谈。带 rebuildPlan 的迁移（加 computed property、改 computation——最常见的迁移形态）在此场景必然卡死，只能人工清理迁移日志。既有 resume 测试全部复用同进程 system（queryHandle 已由 v1 setup 初始化），未覆盖跨进程形态。
- 修复：`applyMigrationSchema` 改为**无条件执行**——DDL 经 operation log + 每次 migrate 重新 diff（已应用的列不再出现在 plan 中）双重幂等，重复执行零成本；phase 判定只保留「是否要写 phase 记录」。同时 migrate 在进入重算前 `scheduler.teardown()`（防御本 controller 曾 setup 过的反应式监听干扰重算，fresh controller 上是 no-op）并 `registerDictDefaults()`（见 R-3）。
- 回归：同复现场景在全新 system 上 resume 成功，`doubled` 重算值正确（[2, 10]）。

---

## 三、重要问题（本轮已修复）

### R-1 `compute()` / `asyncReturn()` 返回 ComputationResult 信封被当普通值写穿（已复现）

- 位置：`src/runtime/Scheduler.ts` `executeDataBasedComputation` 全量分支（L894 直通）对照增量分支（L933 拆解 `ComputationResultFullRecompute`）；`handleAsyncReturn`（L1042 `asyncReturn` 返回值直通 applyResult）。
- 复现：global Custom 的 `compute` 返回 `ComputationResult.fullRecompute('confused user')` → dict 值变成 `{"reason":"confused user"}`，所有下游读取方拿到信封对象，零告警。
- 影响：`ComputationResult` 是文档化的计算返回值词汇表；增量路径拆解、全量路径写穿的**不对称**让「从 incrementalCompute 复制逻辑到 compute」这类自然重构直接产出脏数据。fullRecompute 从 compute 返回本身是协议误用（compute 就是全量重算），应 fail-fast 而非落库。
- 修复：`Controller.applyResult` / `applyInitialValue` 收口——Skip/undefined 检查之后，任何残余的 `ComputationResult` 实例一律 `ComputationError`（指引「返回计算值本身或 skip；fullRecompute 只在增量路径有意义；async/resolved 应在应用前拆解」）。单一 choke point 同时覆盖 compute 全量路径、asyncReturn 路径、migration writeComputationResult 路径。

### R-2 dict `defaultValue` 工厂在读回退路径每次 miss 重新求值：非幂等工厂产出漂移的"事实"（已复现）

- 位置：`src/runtime/MonoSystem.ts` `dict.get`（r14-I-4 引入的回退每次调用 `defaultValueFn()`）；`src/runtime/Scheduler.ts` setup 注册处。
- 复现：`defaultValue: () => ({seq: ++n})` + 删除持久化行 → 连续两次 `dict.get` 返回 `{seq:2}`、`{seq:3}`——同一事务内两个计算读同一 key 拿到不同值。
- 影响：`Dictionary.defaultValue` 在 install 路径的既有语义是**求值一次、持久化**（setupDictDefaultValue）；r14 的读回退把工厂下放到每次 miss 求值，`() => Date.now()`、对象字面量等非幂等工厂在回退路径与 install 路径行为分裂。
- 修复：`Scheduler.registerDictDefaults()`（从 setup 中提取，migrate 亦复用）在注册时**求值一次**、注册求出的值；`MonoStorage.dict.get` miss 时返回该值的 JSON round-trip 副本（与存储路径「每次读经 JSON codec 产出独立副本」的语义对齐，避免多读方共享可变引用）。`registerDefaults` 契约类型同步为 `Map<string, unknown>`。

### R-3 迁移期 global dataDep 读不到声明的 dict 默认值（代码证据）

- 位置：`src/runtime/migration.ts` `resolveDataDepsForMigration` global 分支（只读存储行）；migrate 重算期间 scheduler.setup 未运行、读回退未注册。
- 影响：v2 新增「带 defaultValue 的 dict + 依赖它的 computation」时，迁移重算读到 undefined、迁移后运行时读到声明默认值——重算结果与运行时语义不一致（错误值被永久固化）。dry-run / destructive-scope 评估同理。
- 修复：`migrate()` 进入重算前调用 `scheduler.registerDictDefaults()`（运行时路径生效）；`resolveDataDepsForMigration` global 分支无存储行时回退 `controller.dict` 声明的 defaultValue（readHandle 路径生效）。

### R-4 `context.skip` 依赖 planIncremental 自觉遵守：自定义 planner 忽略时用无关事件跑增量（已复现）

- 位置：`src/runtime/Scheduler.ts` `executeDataBasedComputation`（构建 context 后直接交给 planIncremental）；内置 planner（`defaultDataBasedIncrementalPlan`、Custom 的 incrementalDataDeps 路径）遵守 skip，自定义 `planIncremental` 回调无任何强制。
- 影响：`skip: true` 只在「事件记录对 records 依赖的 match **确定性地**新旧都不匹配」时给出（本地无法确定走 requiresFullRecompute），即该事件不可能影响计算结果。自定义 planner 忽略它返回 incremental 时，增量计算拿无关事件跑出错误值且零告警（复现：match 排除的记录 create 事件把 sum 从 10 抬到 1009——修复前形态）。
- 修复：框架在调用 planIncremental **之前**集中收口 `context.skip`（顺带修正既有优先级瑕疵：unsafe modifier + 排除事件此前会走不必要的 fullRecompute）。
- 回归：故意忽略 skip 的 planner，match 外记录的 create 不触发 incrementalCompute、值不变。

### R-5 `teardown()` 残留 dict 读回退（代码证据）

- 位置：`src/runtime/Scheduler.ts` `teardown`（r14-I-2 只注销 mutation listener）。
- 影响：teardown 后 storage 若继续被使用（多租户单进程、热重载的窗口期），dict.get 仍按旧 controller 的声明回退——I-2 生命周期修复的另一半。
- 修复：teardown 一并 `registerDefaults(new Map())`。回归：teardown 前回退 42、teardown 后 undefined。

### R-6 批量 1:n 分组的父 id 裸值 Map 匹配：id 类型混用时子记录静默丢失（代码证据，防御性收口）

- 位置：`src/storage/erstorage/QueryExecutor.ts` `findRelatedRecordsInBatch`（`parentById.set(parent.id, ...)` / `.get(item[reverse].id)` 裸值匹配）。
- 影响：父记录 id 与子记录反向端点 id 以不同 JS 类型返回时（整型发号驱动 number/string 混用、BIGINT 字符串化），Map 匹配失败的子记录被**静默丢弃**（父记录拿到空集合、无报错）。r5-I-6 首次记录；同文件 `NewRecordData.dedupeRefItems` 已有 `String(id)` 归一化先例，批量路径是漏项。
- 修复：两端 `String(id)` 归一化（类型一致时零行为变化，既有全部 1:n 测试通过）。

### R-7 `Condition.create` 不校验 content：配置错误延迟到第一次 dispatch 才暴露（代码证据）

- 位置：`src/builtins/interaction/Condition.ts` `create`（`public.content` 声明 `required: true` 但无运行校验）。
- 影响：`content: undefined`（typo / 代码生成缺陷）的 Condition 挂上守卫链后，运行期被 checkCondition fail-closed 拒绝（安全），但错误暴露点与声明处脱节——每个用户请求都失败，而非应用启动时失败。与 r10 对 `Conditions` 容器的既有校验不对称。
- 修复：声明期校验 content 必须是函数，错误信息含示例写法。回归：undefined 与非函数两种形态均声明期抛出。

### 连带小修

- `ActivityManager` head-无-activityId 分支统一走 `activityCall.fullGuard`（此前直调 `interaction.guard`，行为等价但三分支两套写法，留下未来 guard 逻辑漂移面）；
- `ActivityCall.completeInteractionState` 注释中残留的 `saveUserRefs`（Attributive 拆除遗漏）清除；
- `src/core/README.md` 中不存在的 `InteractionCall` 引用修正。

---

## 四、重要观察（高置信度，本轮不修，含设计权衡记录）

| # | 观察 | 位置 | 说明 |
|---|------|------|------|
| O-1 | **PHASE_AFTER_ALL 不等待同事件触发的 async 计算**：NORMAL 相位的计算返回 `ComputationResult.async` 时只创建 task 行，AFTER_ALL 相位的 Transform 快照看不到 task 之后应用的结果 | `Scheduler.ts` 相位循环 | 这是 async 计算「最终一致」语义的固有推论（结果在独立事务、可能由外部 worker 完成，无法在当前事务内等待）。建议知识库在 async computation 章节明确「相位序只约束同步计算」 |
| O-2 | **group-as-root 的多分支 head 均可隐式建活动实例**：every/race 组作根时，任一分支 head 不带 activityId dispatch 都会 create 新 `_Activity_` 实例 | `ActivityManager.ts` `isHeadInteraction` | 与单 head 活动「head 不带 id = 开新实例」语义一致（多实例并存合法，第二分支加入既有实例必须显式传 activityId），不是缺陷；但客户端漏传 id 会静默 fork 工作流，值得在 activity 文档中示警 |
| O-3 | **`lockRows` 稳定化 5 轮上限后按当前锁集返回**：持续高并发插入下返回覆盖不全的行集，无告警 | `MonoSystem.ts` L1090 | 与 SQL `SELECT ... FOR UPDATE` 的幻影语义一致（锁定后插入的行本就不在任何锁定方案的覆盖内），r14 注释已记录该边界；无行为缺陷，维持现状 |
| O-4 | **函数体 toString 哈希进 modelHash**：bundler/压缩/Node 版本差异可让语义相同的部署产生 manifest mismatch | `migration.ts` L728/L791 | 函数语义等价判定不可计算，现设计（文本哈希 + 显式 approvedDiff 流程）是正确的保守选择；跨构建产物部署的 ops 文档值得提示「以同一构建产物跑迁移」 |
| O-5 | **propagation trail 数组同深度共享**：批内多计算并发时深度守卫错误的 trail 可能混入无关计算名 | `Scheduler.ts` L411 | 仅影响诊断信息精度，不影响判定；留待与可观测性改造一轮做 |
| O-6 | **`retrieveLastValue` property 分支 truthy 判断**：`if (record![name])` 对 false/0/'' 走冗余重查；宿主行恰在中途被删时裸 TypeError | `Controller.ts` L559 | 值域正确性不受影响（重查返回同值）；TypeError 窗口极窄且事务会回滚。与 I-1（entity/relation lastValue 全表）同属 lastValue 语义家族，留待该家族收口轮 |

## 五、本轮证伪/降级的候选

| 候选 | 结论 |
|------|------|
| 「storage.dispatch 不把 listener 返回的衍生事件喂给同轮其他 listener」（migration 探查 #5，初判重要） | 证伪：listener 回调返回的 events 只用于 effects 汇总；listener 内部的 storage 写入本身走 `callWithEvents` 递归 dispatch，所有 listener 都能看到衍生 mutation。无缺口 |
| 「批量 1:n 孤儿子记录静默丢弃掩盖数据损坏」（storage 探查 #4） | 降级为既有遗留（r9-I-5 已记录 assert/warn 建议）；孤儿 FK 本身是上游损坏，读路径不新增损坏 |
| 「查询结果 SQL NULL 键缺失」（storage 探查 #1） | 既有遗留 r4-I-1 原样复确，非新发现（探查报告自己也标注了）|
| 「mergeAttributeQueryData 丢弃重复键的 modifier/match」（storage 探查 #3） | 既有遗留（r5-I-4/r12 记录）复确，未在本轮升级：触发面要求同名关系键在合并流中带 modifier/match，主路径（reliance 合并）不产出该形态 |
| 「migrate() 时其他 controller 的旧监听器污染重算」（migration 探查 #2） | 部分成立、按边界修复：本 controller 的监听已在 migrate 前 teardown（本轮修复）；**其他** controller 的监听器框架层无从辨识（app 级 storage.listen 是文档化用法，不能一刀切清空），操作契约（migrate 前 teardown 旧 controller）已写入 migrate 的注释 |

## 六、既有遗留项复确（r2–r14 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；`!=` 三值逻辑；dispatch 先持久化事件再 resolve（r9-I-2）；payload 弱校验族；isRef 无行级授权 IDOR 面（r11-I-5）；StateMachine 单事件单跳（r7-I-8）；同批 property 计算无拓扑序（r7-I-9）；`Event`/`Activity.events` 死 API（r12-I-8）；Custom 多 dataDeps 每 dep 各触发一次（r11-I-2）；数组 pattern 前缀匹配；RealTime NaN；ScopedSequence scope 更新语义（r11-I-6/I-7）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减 + 无 failed 终态（r2-I-6/r12-I-3）；级联删除无深度上限（r2-I-5）；offset-only 全表拉取 / EXIST 误触 post-pagination（r12-I-4/I-5）；迁移全表载入内存（MIG-I3）；retrieveLastValue entity/relation 全表（r13-I-1，Custom 默认关闭后仅显式 opt-in 面残留）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；handleAsyncReturn find-then-lock 幻影行（r3-R4）；SERIALIZABLE 重试边界内 guard/afterDispatch 重放（S2）。
- **migration**：迁移阶段顺序（r10-I-1）；rename = remove+add（r9-I-3）；merged input 移除孤儿数据（r10-I-2）。
- **驱动**：contains 四驱动语义矩阵（r12-I-6）；SQLite 无行锁能力位（r12-I-7）；Klass.clone 注册表语义分裂（r12-I-2）。
- **时间调度**：`nextRecomputeTime` 无消费方（r3-R5）。

## 七、修复优先级建议（遗留项，更新）

1. **并发治理专轮**（r12-I-1 dict.set 竞态 + r3-R4 幻影行 + lockRows 覆盖语义文档化）——「READ COMMITTED 下的 find-then-write/lock」家族，需要驱动级 UPSERT/单语句锁原语 + 关键表唯一约束；
2. **r10-I-1 迁移阶段顺序**——连续五轮位居榜首的未修项，唯一可能产出「静默错误聚合值」的已知路径；
3. **lastValue/默认值语义收口轮**（r13-I-1 entity/relation lastValue 全表 opt-in 面 + 本轮 O-6 truthy 判断 + r4-I-1 NULL 键缺失）——三者同属「值缺失/值形态」语义家族；
4. **createClass 统一校验**（r7-I-13 + r11-I-8 + r12-R-1 + r13-R-2 + 本轮 R-7 的手工 fail-fast）——第五轮佐证「声明校验应在 createClass 层统一执行」的一次性根治价值；
5. **async task 生命周期**（r2-I-6 + r12-I-3 + O-1 文档化）——增加 failed 终态与清理策略，同时把「相位序不覆盖 async」写进知识库。

## 附录：复现要点（验证用）

- F-1：`StateNode.create({name:'approved', computeValue: async () => { /* 漏写 return */ }})` 的转移 → dispatch 受控失败（错误含 `returned undefined`），status 恒为初始态；`computeValue: () => null` / `() => 'lit'` 照常。
- F-2：v1 install → v2 approvedDiff → 手工应用 preRecomputeDDL + 迁移日志 `phase='schema-applied', status='failed'` → 全新 MonoSystem resume `migrate({approvedDiff})` → 成功且重算值正确。
- R-1：global Custom `compute: () => ComputationResult.fullRecompute('x')` → create 触发时受控失败（错误含 `envelope where a plain value is expected`），dict 零污染。
- R-2：`defaultValue: () => ({seq: ++n})` + 删行 → 两次 `dict.get` 同值、副本独立、工厂不再被读路径调用。
- R-4：自定义 `planIncremental: () => ({type:'incremental', ...})`（忽略 context.skip）+ match 排除的记录 create → incrementalCompute 不执行、值不变。
- R-5：teardown 后 `dict.get` 不再返回旧 controller 声明的默认值。
- R-7：`Condition.create({name:'x'})`（无 content）→ 声明期抛 `requires a function "content"`。
