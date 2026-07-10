# 全代码库深度 Review 报告（2026-07-10 第十六轮）

- 日期：2026-07-10
- 基线：`main` @ `233deaa2`（v3.0.1，r1–r15 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1844 passed / 26 skipped**
- 范围：四路并行深度探查 + 亲自精读验证——runtime 引擎（dispatch 事务链、applyResult/applyResultPatch 家族、相位序、dict 回退的 r15 新代码回归面）/ storage 写路径与事件生成（CreationExecutor、FilteredEntityManager 成员资格事件、NewRecordData）/ computations 语义一致性（六聚合模板、Summation/Average 字段解析、StateMachine r15 改动回归面、MathResolver）/ builtins 守卫链 + drivers + migration 深路径（chained rebuild、event-rebuild handler 合约、RefContainer）
- 方法：与 r1–r15 全部报告逐条去重（四路探查候选 15 项中约半数为既有遗留项或已修项，剔除）→ 对每个致命/重要候选**编写最小复现测试实际运行**（PGLiteDB）。「已复现确认」才列为致命/重要；证伪/降级候选明确记录（见第五节）。

> **维护说明（2026-07-10）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r16-9a08`）全部修复。回归测试：`tests/runtime/review-fixes-2026-07-10-r16.spec.ts`（8 用例）。修复后 `npm run check` 通过，`npm test` 全量 **1852 passed / 26 skipped**（净 +8 回归用例，零既有用例回归）。

---

## 一、结论摘要

r1–r15 十五轮修复后，读写主路径、聚合增量一致性、filtered/merged 编译、守卫链严格 boolean 契约、migration 主流程已高度收敛。本轮新问题集中在三类「上一轮修复的对称面」：

1. **applyResult 收口了、applyResultPatch 没收口**——r13-F-2（undefined 写穿）与 r15-R-1（ComputationResult 信封写穿）都在 `applyResult` 修复，但 patch 信封的 `data` 字段是同族的平行通道：`{type:'update', data: ComputationResult.fullRecompute(...)}` 把信封对象原样落库，`{type:'update', data: undefined}` 把已有值静默抹掉。「从 incrementalCompute 迁移到 incrementalPatchCompute」这类自然重构直接踩中。
2. **base 事件契约对齐了、视图事件没对齐**——create 事件的文档契约是「record = defaults + payload」，base 记录事件一直遵守；filtered/merged **视图**的成员资格 create 事件却漏掉 defaultValues（含 merged 的 `__type` 判别列）且泄漏内部 `_rowId` 列。按 `__type` 或默认值字段做模式匹配的下游（StateMachine trigger、Transform eventDeps）对同一条记录「查询可见、事件不可见」。
3. **全量路径逐宿主、增量路径丢宿主**——迁移的 event-rebuild handler 在全量路径按宿主记录逐条调用（收到 `record`），链式增量路径却以 `record=undefined` 直进 `writeComputationResult`，property 上下文在 `record!.id` 处抛裸 TypeError——「改上游计算公式 + 同记录上有 StateMachine」这个常见组合的迁移必然失败，且 resume 每次走进同一条死路。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 2 | patch 信封/undefined data 写穿、迁移链式 event-rebuild 裸崩且 resume 死路 |
| 重要（已复现，已修） | 2 | 成员资格 create 事件契约（defaults/`__type`/`_rowId`）、Summation/Average 多字段静默取首 |
| 重要（代码证据，已修） | 1 | merged-link 嵌套依赖递归漏传 events |
| 证伪/降级 | 4 | 见第五节 |
| 重要观察（本轮不修） | 7 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 `applyResultPatch` 的 `data` 通道写穿信封与 undefined：r13-F-2 / r15-R-1 的平行漏网

- 位置：`src/runtime/Controller.ts` `applyResultPatch`（此前只校验 `patch.type`，不校验 `patch.data`）；对照 `applyResult`（r13 起 skip undefined、r15 起拒绝 ComputationResult 信封）。
- 复现（实测输出）：

```
// global dict + incrementalPatchCompute 返回 {type:'update', data: ComputationResult.fullRecompute('x')}
create('Entity', ...) → dict.get() → {"reason":"x"}          ❌ 信封对象落库，零告警
// property + {type:'update', data: undefined}（回调漏赋值）
初始 derived = 7 → update 宿主 → derived → undefined          ❌ 已有值被静默抹掉
```

- 影响：`incrementalPatchCompute` 是文档化扩展点，`asyncReturn` 路径同样路由到 `applyResultPatch`。r15-R-1 只在 `applyResult` 收口信封、r13-F-2 只在 `applyResult` skip undefined——patch 信封的 `data` 字段是完全对称的第二通道。信封落库污染所有下游读取方；undefined 写穿把「已有正确值」抹成 null，比算错更隐蔽（测试通常只覆盖首次计算）。
- 修复：`applyResultPatch` 对 insert/update 信封统一收口——`data === undefined` 抛 `ComputationError`（信封显式声明了"要写 data"，缺失只能是回调实现遗漏；错误指引「null 清空 / skip 保值」）；`data` 为 ComputationResult 实例复用 `assertNotComputationEnvelope` fail-fast。delete 信封（无 data 语义）与合法值/null 不受影响。
- 回归：信封与 undefined 两种形态均受控失败且事务回滚（dict 保持 0、property 保持 7）；`{type:'update', data: 值}` 与 `{type:'delete'}`（写 null）照常工作。

### F-2 迁移链式 rebuild 驱动到 event-based property 计算：`record=undefined` 裸 TypeError，resume 死循环

- 位置：`src/runtime/migration.ts` `MigrationScheduler.runIncrementalRecompute`（event-based 分支恒以 `writeComputationResult(..., undefined)` 调用）；对照 `runFullRecompute`（property 上下文按宿主记录逐条调 handler、逐条传 `record`）。
- 复现（实测输出，v1→v2 改 `score` 计算公式，同实体上有 update-trigger 的 StateMachine `status`）：

```
migrate({approvedDiff, handlers: {eventRebuild: {...}}})
→ handler called with record = undefined                    ❌ handler 合约破坏
→ TypeError: Cannot read properties of undefined (reading 'status')
    at Controller.retrieveLastValue (Controller.ts:575)      ❌ 裸崩，非 MigrationError
→ finishMigration('failed') → resume 同路径同崩溃            ❌ 不可恢复
```

- 影响：触达路径是常见组合——上游计算（computed property）公式变更 + 同记录上任何 update-trigger 的 StateMachine：`eventDepNodes` 对 update 型 eventDep 登记宿主全部属性节点，StateMachine 必然被拉进受影响集合做链式 rebuild；审批流程还会强制要求提供 event-rebuild handler（做完全部审批仍然崩）。property 的 `retrieveLastValue`/`applyResult` 都要 `record!.id`，事件驱动分支从未给。
- 修复：`runIncrementalRecompute` 对 event-based **property** 计算统一退回按宿主记录的全量重建（`runFullRecompute` 的 property 分支——handler 本就是全量语义、幂等），整批事件只重建一次；global/entity/relation 的 event-based 路径不变。
- 回归：同场景迁移成功，handler 每宿主记录调用一次且收到完整 `record`，`score` 重算为新公式值、`status` 为 handler 产出。

---

## 三、重要问题（本轮已修复）

### R-1 filtered/merged 成员资格 create 事件缺 defaults 与 `__type`、泄漏 `_rowId`（已复现）

- 位置：`src/storage/erstorage/CreationExecutor.ts` `createRecord`（`handleRecordCreation` 收到的 fullRecord = rawData + idRef + relianceResult）；对照 `preprocessSameRowData` 的 base create 事件（`{...defaultValues, ...newRawDataWithNewIds}`——文档契约「defaults + payload」）。
- 复现（实测输出）：

```
// base 有 defaultValue: status='active'，filtered entity 谓词 status='active'
create('Product', {name:'widget'}, events)
base 事件:     {"status":"active","name":"widget","id":...}     ✓
filtered 事件: {"name":"widget","_rowId":1,"id":...}             ❌ 缺 status、泄漏 _rowId
// merged input 同族：视图 create 事件缺 __type 判别列
```

- 影响：settle 路径（update 驱动的成员资格 diff）用 DB 重查产出完整 payload，唯独 create 路径的视图事件与 base 事件、与查询结果三方不一致。按 `__type` / 默认值字段做 `record` 模式匹配的 StateMachine trigger、Transform eventDeps 对新建记录静默不触发；`_rowId` 是内部列不属于 API 面。
- 修复：成员资格 create 事件 payload 与 base create 事件同契约（`{...defaultValues, ...fullRecord}`，剔除 `ROW_ID_ATTR`）。回归覆盖 filtered（defaults 齐、无 `_rowId`）与 merged（input 视图与 merged 视图事件均带 `__type`）。

### R-2 Summation/Average 多字段 attributeQuery 静默只聚合第一个字段（已复现）

- 位置：`src/runtime/computations/aggregationTemplate.ts` `parseAggregationFieldPath`（把 attributeQuery 当单链消费，兄弟字段静默忽略）；`Summation.ts` / `Average.ts` 四个 handle。
- 复现：`Summation.create({record: Item, attributeQuery: ['score', 'bonus']})` + `{score:10, bonus:100}` → 总和 **10**（用户预期 110 或报错），零告警。
- 影响：Summation/Average 无 callback，attributeQuery 是唯一的字段声明面；`['score', 'bonus']` 是「聚合多个字段」的自然误写（WeightedSummation 的 attributeQuery 恰好就是多字段形态，两个 API 并排使用时极易迁移出该写法）。文档此前用「取最左路径」描述该行为，但静默丢弃其余字段与 explicit control 原则相悖（r10-F-2 未知键静默丢弃同族）。
- 修复：`parseAggregationFieldPath` 对每一层的兄弟字段 >1 声明期 fail-fast（错误指引单字段/单链嵌套写法与 WeightedSummation 替代）；单字段、`[['team', {attributeQuery:['budget']}]]`、`[['&', {attributeQuery:['grade']}]]` 等合法单链不受影响。三处知识库文档同步改为「恰好一个字段路径，多字段是声明期错误」。

### R-3 `createRecordDependency` merged-link 嵌套依赖递归漏传 events（代码证据）

- 位置：`src/storage/erstorage/CreationExecutor.ts` L67（`createRecordDependency(newLinkRecordData)` 无 events）；对照同函数 L76 combined 分支（透传）。
- 影响：link 数据（`&`）自身携带的嵌套新记录（relation-on-relation 形态，`tests/storage/data/common.ts` 的 `teamBaseRelation` 即该声明形态）在这条递归里 createRecord，events 为 undefined 时 create 事件与 filtered 成员资格钩子全部静默缺失。
- 修复：透传 events（与 combined 分支一致）。触发面窄且组合深，以代码不对称性为证据修复，由全量套件（含 relation-on-relation 场景）验证零回归。

---

## 四、重要观察（高置信度，本轮不修，含设计权衡记录）

| # | 观察 | 位置 | 说明 |
|---|------|------|------|
| O-1 | **挂在事件实体 create 上的 PHASE_AFTER_ALL 计算在 `resolve()` 之前执行**：dispatch 先 create 事件记录（同步跑完全部相位的计算），后运行 resolve——resolve 里的 storage 写入对这些 AFTER_ALL 计算不可见 | `Controller.ts` dispatch 顺序 | 与 r15-O-1（相位序不覆盖 async）同族的相位边界。`resolve` 的文档定位是查询/返回数据（数据变更应经计算反应），照文档写不会踩中；自定义 EventSource 在 resolve 里写数据 + AFTER_ALL 快照的组合会拿到旧快照。建议知识库 EventSource 章节标注「AFTER_ALL 只约束同一事件触发的同步计算传播，不含 resolve 产物」 |
| O-2 | **`create`/`update` 返回值不含联动重算的 computed 列与 default-only 列**：返回对象只拼 rawData+id+reliance，与「写后立即 find」的结果分叉 | `CreationExecutor.ts` L125 / `UpdateExecutor.ts` L89 | 事件 payload（本轮 R-1 后）与查询结果均完整，唯返回值是第三种形态；「拿返回值当下游输入」的调用方拿不到 computed。契约文档化或回灌返回值需一轮单独评审（返回值形态变更影响面广） |
| O-3 | **Summation/Average 对数字字符串记 0**：`resolveSumField` 用 `Number.isFinite` 判定，`"42"` 贡献 0 | `Summation.ts` L8 / `Average.ts` L10 | 主路径 storage 对 `number` 列返回 JS number（PG DOUBLE PRECISION/SQLite/MySQL 均解析），字符串数字只能经手工 SQL/迁移脏数据进入；与 null/NaN 归零哲学一致，暂不引入隐式 `Number()` 强转（explicit control）。记录该值域边界 |
| O-4 | **`MathResolver.Inequality.solve()` 不区分 `>`/`<` 方向**：只求 `combined=0` 的根 | `MathResolver.ts` L315–363 | `nextRecomputeTime` 至今无消费方（r3-R5），无运行时损害；时间调度器落地前必须修，已在遗留清单加注 |
| O-5 | **property 聚合 `relatedAttribute.length > 3` 一律 fullRecompute**：深嵌套关联更新退化全量重算 | `aggregationTemplate.ts` L372–381 | 正确性由 fullRecompute 兜底，仅性能面；与 r12-I-4/I-5 的「保守判定」家族一致，留待查询编译器优化轮 |
| O-6 | **RefContainer.replace 不修补 Property.computation 内嵌的 Entity/Relation 引用；replaceEntity 直接别名传入实例**（不 clone） | `RefContainer.ts` L252–260 / L309–350 | 当前无 live 触发路径：Scheduler 绑定原始声明图（Controller 构造入参），RefContainer 克隆图只进 storage setup（不消费 computation）。属 API 卫生/防御性契约，公开面收口建议独立小 PR |
| O-7 | **Activity every 组并发完成的 CAS 失败不纳入 dispatch 自动重试**：`stateVersion` CAS 失败抛 `ActivityStateError`，`runWithTransactionRetry` 不识别 | `ActivityCall.ts` L404–413 / `transaction.ts` | 事务回滚保证一致性（无数据损坏），调用方需手动重试；自动重试涉及「重放 guard/afterDispatch」的既有边界（S2），留待并发治理专轮一起决策 |

另有低优先级项：payload `type:'number'` 接受 `NaN`（弱校验矩阵 r7-I-14 的新维度）；`timestamp` 属性 SQLite（INT）与 PG 系（TIMESTAMP）读回类型不对齐（QueryExecutor 只归一化 boolean）；`Scheduler` 的 `isInitial` 分支全仓库无 true 调用点（死代码）；scoped-sequence seed 的 match 编译失败时静默降级全表内存扫描（MIG-I3 家族的具体形态，match 含 `like`/嵌套路径时触发）。

## 五、本轮证伪/降级的候选

| 候选 | 结论 |
|------|------|
| 「dict.get 声明回退的 JSON round-trip 对 Date/BigInt 语义损失」（runtime 探查 #3，初判次要） | 证伪为一致设计：install 路径（`dict.set` → JSON codec 落库）对 Date 同样产出 ISO 字符串、对 BigInt 同样抛错——r15-R-2 的回退实现与存储路径语义完全对齐，不存在路径分裂 |
| 「cloneDispatchArgs 浅拷贝嵌套 payload 跨重试共享」（runtime 探查 #4） | 既有遗留复确（S2/r5-R-6 家族）：框架内置路径不变异嵌套 payload，用户回调变异 + 可重试错误组合才触发；并发治理专轮统一处理 |
| 「Conditions.create({}) 缺声明期校验」（builtins 探查 #6） | 降级：`Interaction.create` 对空 content 的 Conditions 已声明期 fail-fast（主路径全覆盖），运行期 checkCondition 亦 fail-closed；孤立创建不挂守卫链无危害 |
| 「RefContainer 引用图缺口是致命绑定错位」（builtins 探查 #1/#2，初判重要） | 降级为 O-6：Scheduler 从不消费 RefContainer 克隆图的 computation 引用，storage 从不读 property.computation——无 live 触发路径，属公开 API 卫生 |

## 六、既有遗留项复确（r2–r15 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1，本轮 F-1 正向回归再次实证）；`!=` 三值逻辑；dispatch 先持久化事件再 resolve（r9-I-2）；payload 弱校验族（r7-I-14，本轮新增 NaN 维度）；StateMachine 单事件单跳（r7-I-8）；同批 property 计算无拓扑序（r7-I-9）；`Event`/`Activity.events` 死 API（r12-I-8）；Custom 多 dataDeps 每 dep 各触发一次（r11-I-2）；数组 pattern 前缀匹配；RealTime NaN（本轮 O-4 补充 solve 方向性）；ScopedSequence scope 更新语义（r11-I-6/I-7）；retrieveLastValue entity/relation 全表 + property truthy 判断（r13-I-1/r15-O-6）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减 + 无 failed 终态（r2-I-6/r12-I-3）；级联删除无深度上限（r2-I-5）；offset-only 全表拉取 / EXIST 误触 post-pagination（r12-I-4/I-5）；迁移全表载入内存（MIG-I3，本轮补 scoped-sequence seed 降级形态）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；handleAsyncReturn find-then-lock 幻影行（r3-R4）；SERIALIZABLE 重试边界内 guard/afterDispatch 重放（S2，本轮补嵌套 payload 共享注脚）；lockRows 稳定化 5 轮上限（r15-O-3）；本轮新增 O-7（Activity CAS 重试）。
- **migration**：迁移阶段顺序（r10-I-1）；rename = remove+add（r9-I-3）；merged input 移除孤儿数据（r10-I-2）；函数体 toString 哈希进 modelHash（r15-O-4）。
- **驱动**：contains 四驱动语义矩阵（r12-I-6）；SQLite 无行锁能力位（r12-I-7）；Klass.clone 注册表语义分裂（r12-I-2）；本轮新增 timestamp 读回类型不对齐（低优先级）。
- **时间调度**：`nextRecomputeTime` 无消费方（r3-R5，本轮 O-4 关联）。

## 七、修复优先级建议（遗留项，更新）

1. **并发治理专轮**（r12-I-1 dict.set 竞态 + r3-R4 幻影行 + S2 重试重放/嵌套 payload + 本轮 O-7 Activity CAS 重试）——「READ COMMITTED 下的 find-then-write/lock + 重试边界」家族，需要驱动级 UPSERT/单语句锁原语 + 关键表唯一约束 + 重试白名单扩展一次做完；
2. **r10-I-1 迁移阶段顺序**——连续六轮位居榜首的未修项，唯一可能产出「静默错误聚合值」的已知路径；
3. **值形态收口轮**（r4-I-1 NULL 键缺失 + O-2 create/update 返回值缺 computed + r13-I-1/r15-O-6 lastValue 家族 + O-3 数字字符串值域）——四者同属「同一记录在事件/查询/返回值三个面上的形态一致性」；
4. **createClass 统一校验**（r7-I-13 + r11-I-8 + r12-R-1 + r13-R-2 + r15-R-7 + 本轮 R-2 的手工 fail-fast）——第六轮佐证「声明校验应在 createClass 层统一执行」的一次性根治价值；
5. **知识库补相位边界章节**（r15-O-1 + 本轮 O-1）——「PHASE_AFTER_ALL 只约束同事件的同步计算传播：不等待 async 任务、不覆盖 resolve 产物」一段话写清两个已确认的边界。

## 附录：复现要点（验证用）

- F-1：`incrementalPatchCompute` 返回 `{type:'update', data: ComputationResult.fullRecompute('x')}` → create 受控失败（错误含 `envelope where a plain value is expected`），dict 保持初始值；返回 `{type:'update', data: undefined}` → update 受控失败（错误含 `has no "data"`），property 保持 7；`{type:'update', data: 5}` / `{type:'delete'}` 照常。
- F-2：v1（score=base\*1 + update-trigger StateMachine）→ v2（score=base\*2）→ migrate 带 event-rebuild handler → 成功，handler 每宿主记录收到完整 `record`，score=10、status=handler 产出。
- R-1：base 带 `defaultValue: () => 'active'` + filtered entity → create 捕获 events → filtered create 事件含 `status:'active'`、无 `_rowId`；merged input create → input 视图与 merged 视图事件均含 `__type`。
- R-2：`Summation.create({record, attributeQuery: ['score','bonus']})` → Controller 构造期抛 `declares 2 sibling fields`；`['score']` 与 `[['team',{attributeQuery:['budget']}]]` 照常。
- R-3：代码不对称修复（`createRecordDependency` 递归透传 events），全量套件验证。
