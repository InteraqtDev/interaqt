# 全代码库深度 Review 报告（2026-07-11 第十八轮）

- 日期：2026-07-11
- 基线：`main` @ `19cb5f14`（v3.1.0，r1–r17 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1871 passed / 26 skipped**
- 范围：四路并行深度探查（storage 写路径与 SQL 编译 / runtime 调度与增量计算 / **migration+ScopedSequence+RefContainer 专项**（本轮新增的最少覆盖面）/ core+builtins+drivers）+ 对全部致命候选**亲自编写最小复现实际运行**（PGLiteDB / SQLiteDB）
- 方法：与 r1–r17 全部报告逐条去重；每个候选先做代码路径二次追踪，再以运行时复现定谳（本轮 1 项候选被复现证伪、1 项被架构追踪证伪，见第四节）。「已复现确认」才列为致命。
- 修复状态：**四个致命项 + 两个重要项已在本分支（`cursor/deep-code-review-r18-7a3e`）全部修复**，回归固化于 `tests/runtime/review-fixes-2026-07-11-r18.spec.ts`（11 用例）与 `tests/storage/review-fixes-2026-07-11-r18.spec.ts`（9 用例）。修复后 `npm run check` 通过，`npm test` 全量通过（含新增回归）。

---

## 一、结论摘要

r1–r17 修复后，storage 写路径、聚合增量一致性、对称关系、filtered 成员资格等高风险面已高度收敛（本轮 storage 探查未发现新致命项，印证矩阵体系生效）。本轮四个新致命问题全部落在**上一轮结构层没有铺到的三个面**：

1. **事件驱动计算轨道与数据驱动轨道的 filtered 路由不对称**（F-1）——r16 修了「视图成员资格事件的契约」、结构层给**数据驱动**计算修了 filtered update 路由（`normalizeFilteredUpdateSourceMap`），但**事件驱动**计算（StateMachine trigger / Transform eventDeps）没有走这条归一化：在 filtered 名上声明 `update` 监听是死监听，转移/派生永不触发、零告警。「双轨必须同构」的架构义务此前只在一条轨道上兑现。
2. **migration manifest 的签名采集对「普通值参数」全盲**（F-2）——十七轮建立的签名体系覆盖了函数文本（functionSignature）、数据/事件依赖（deps/eventDeps）、绑定状态（stateSignature），但 trigger.keys、trigger.record 模式、状态图拓扑（next 状态名）、Every.notEmpty、Transform eventDeps 的 record 模式这些**改了就改变存量数据语义**的普通值参数不进任何签名——迁移零感知、审阅零条目、存量数据带旧语义静默放行。这是对 Phase 1.5「审阅即契约」承诺的系统性破坏。
3. **声明期命名空间守卫的剩余缺口**（F-3）+ **ScopedSequence 的 create-time-stable 假设无执行力**（F-4）——前者是「值属性 vs 关系属性」共享命名空间的静默覆盖（实测标量字符串被逐字符摊开成假关联记录，**仓库自己的 activity 测试夹具就带着这个冲突**）；后者是 scope 字段编号后仍可变，配合文档推荐的 UniqueConstraint 会把目标 scope 的 create **永久堵死**（计数器随事务回滚，不可自愈）。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修复） | 4 | filtered update 死监听（事件驱动轨）、migration 普通值参数零感知、值/关系属性命名空间静默覆盖、ScopedSequence scope 可变导致重复编号+scope 永久堵死 |
| 重要（已修复） | 2 | 保留名/重复属性名声明期守卫、retrieveLastValue 真值短路 |
| 重要（记录，本轮不修） | 若干 | 见第三节 |
| 证伪/降级 | 2+ | 见第四节 |

---

## 二、致命问题（全部已复现确认并修复）

### F-1 事件驱动计算在 filtered entity/relation 名上的 `update` 监听是死监听——StateMachine 转移/Transform 派生永不触发

- 位置：`src/runtime/ComputationSourceMap.ts` `initialize`（eventDeps 分支直接按声明的 recordName 注册，不经过 `normalizeFilteredUpdateSourceMap`——该函数此前有 `!('dataDep' in source)` 早退）；`src/runtime/Scheduler.ts` `resolveFilteredUpdateEvent`（同样早退）。
- 机理：storage 的字段 update 事件**只以物理 base 记录名**发出（`RecordQuery.create` 把 filtered 名解析为 `resolvedBaseRecordName`）；filtered 名下只有成员资格 create/delete 事件。`findSourceMapsForMutation` 按事件的 recordName 精确查表——挂在 filtered 名上的 update 监听永远查不到。
- 复现（实测，PGLite）：

```
ActiveTicket = filtered(Ticket, isActive=true)
StateMachine trigger: { recordName:'ActiveTicket', type:'update', keys:['title'] }
update(Ticket, {title:'b'})   → 事件 {recordName:'Ticket', ...}
phase 停在 'active'           ❌ 转移永不触发（期望 'done'）
Transform eventDeps 同构      ❌ AuditLog 零条目
对照：type:'create' 的 trigger（成员资格事件以 filtered 名发出）正常触发 ✓
```

- 影响：在「视图」上声明状态转移/事件派生是完全自然的声明形态（"只关心活跃工单的标题变更"）。数据驱动计算（Count/Summation over filtered）r17 结构层已修，事件驱动轨道是平行漏网——同一声明形态在两条轨道上行为静默分裂，正中 explicit control 的反面。
- 修复：`normalizeFilteredUpdateSourceMap` 去掉 dataDep 限定，事件驱动 update 监听同样挂到物理名 + 携带 `filteredRecordName`；`resolveFilteredUpdateEvent` 对事件驱动源做同一套成员资格守卫（同批次成员资格事件驱动 enter/exit、stay-in 改写事件名后放行、非成员跳过）。改写后的事件以 filtered 名到达 TransitionFinder/callback，模式匹配命中。
- 回归：转移触发/非成员不触发/enter 场景由成员资格 create 驱动不双跳、Transform 派生（含事件名断言），共 3 用例。

### F-2 migration manifest 对「普通值参数」全盲：改 trigger 模式/状态图拓扑/notEmpty 等，迁移零感知

- 位置：`src/runtime/migration.ts`——`serializeEventDeps` 只取 recordName/type/phase（丢 trigger.keys、record 模式）；`OWN_FUNCTION_FIELDS` 对 StateTransfer 只采集 computeTarget（丢 current/next 拓扑）；`createComputationManifest` 的 structuralSignature 输入里没有任何普通值参数通道。
- 复现（实测，四个子形态签名逐一对比）：

```
v1: trigger.keys ['title']  → v2: ['priority']        签名相同 ❌
v1: transfer next='closed'  → v2: next='archived'      签名相同 ❌
v1: Every notEmpty:false    → v2: true                 签名相同 ❌
v1: eventDep record {interactionName:'CreatePost'} → 'DeletePost'  签名相同 ❌
```

- 影响：`signature` 相同 ⇒ `getChangedComputations` 判 unchanged ⇒ 无 diff 条目、无审阅决策、无 rebuild；manifest 逐字段进 `modelHash` ⇒ `setup(false)` 直接放行。存量 `status` 列保留旧状态机语义下的值，新代码按新 trigger/新状态图运行——例如旧图写入的 'closed' 状态在新图（open→archived）下永远无转移可走，且用户在迁移审阅中**看不到任何变更**。这是「审阅即契约」的系统性破坏，且是一个**家族**（任何 klass 上的普通值参数），不是四个孤立点。
- 修复：新增 `argsSignature` 进入 structuralSignature——对 `computation.args` 做规范化序列化：函数 → 位置标记 `[Function]`（**不含**文本哈希：函数文本由 functionSignature 单独覆盖进 `signature`，混入 structuralSignature 会把 createState 文本变化误判为结构变更、破坏 state-only 分类——首版实现踩中此坑，被既有 state-only 测试抓出后修正）；模型引用（Entity/Relation/Property/Dictionary）→ `[<type>:<name>]` 截断（身份由 deps 覆盖，深入遍历会卷入整个模型图）；其他 klass 实例（StateNode/StateTransfer/BoolExp 节点）遍历自有语义字段；uuid/_type/_options 一律剔除（uuid 逐进程随机，进签名会让未变更模型被误判）；键排序 + 循环守卫。**manifest generator 版本 2 → 3**（按既定「不同代版本互不采信、拒绝并指引重建基线」政策处置——升级方需重建 manifest 基线）。
- 回归：四个子形态变更可见 + 未变更模型跨进程签名稳定（uuid 不泄漏）+ 函数文本-only 变更不动 structuralSignature（state-only 分类保持），共 6 用例；全部 90 个既有 migration 测试通过。

### F-3 值属性与关系属性同名：Setup 静默覆盖，标量写入被摊开成假关联记录

- 位置：`src/storage/erstorage/Setup.ts` `populateRecordAttributes` L694/L722——关系属性**无条件**写入端点 record 的属性表；`validateRelations` 此前只查「filtered 端点 vs base 链上的关系属性」与「同家族多关系同名」，**不查值属性 vs 关系属性**。
- 复现（实测，PGLite）：

```
User { email: string }  +  Relation(User.email → Contact, 1:n)
setup 零报错
create('User', {email:'a@b.c'}) 返回：
  email: [{"0":"a","1":"@","2":"b","3":".","4":"c", owner:{...}, id:...}]
  ❌ 字符串被逐字符摊开成对象、创建了假 Contact 关联记录
findOne(..., ['*']) → {id}   ❌ email 数据面完全消失
```

- 影响：零告警 schema 损坏 + 写入路径数据损坏。**仓库自己的 `tests/runtime/data/activity/index.ts` 夹具就带着这个冲突**（Request 的标量 `message` 被 `messageToRequestRelation.sourceProperty='message'` 覆盖，标量声明是死代码）——守卫落地后夹具立即被抓出，佐证该形态在真实代码里自然出现。
- 修复：`validateRelations` 增加家族级「值属性登记表」（entity/relation 全量 + filtered 变体共享命名空间），关系端点属性命中即 fail-fast；activity 夹具删除死标量声明。
- 回归：source 侧/target 侧/filtered 变体家族三向冲突 fail-fast + 无冲突对照组，共 4 用例。

### F-4 ScopedSequence 的 scope 输入编号后仍可变：目标 scope 重复编号；配合文档推荐的唯一约束，目标 scope 的 create 永久失败

- 位置：`src/runtime/computations/ScopedSequence.ts`——分配只发生在 `getInitialValue`（create 时），无任何 update/unlink 钩子；scope 字段是宿主上的普通属性/关系，写路径不设防。
- 复现（实测，PGLite，文档 `usage/04` 推荐的 `UniqueConstraint(project, seq)` 形态）：

```
A#1 A#2 B#1 已编号
update(A#2, {project:'B'})     → 静默成功，B 内出现 [1, 2(迁入), ...]
create({project:'B'})           → 计数器发 2 → 撞唯一约束 ❌
再次 create                     → 计数器随上次事务回滚，仍发 2 ❌
scope B 从此永久不可创建（不可自愈）
```

- 影响：两个面——（a）无唯一约束时同 scope 重复编号（静默破坏「按 scope 单调唯一」语义）；（b）有唯一约束时**目标 scope 的 create 操作永久不可用**，与 r17-F-3「删除操作不可用」同级别的硬故障。触发操作（改工单所属项目）完全常规。
- 修复：Scheduler mutation 监听层新增 scope 输入不可变守卫（`buildScopedSequenceScopeGuards` / `assertScopedSequenceScopeUnchanged`）——值型 scope 字段的宿主 update 实际变更、ref 型 scope 关系的 delete（解除/替换必先删旧链）均 fail-fast（事务回滚，错误信息给出「删除重建」与「把可变维度移出 scope」两条出路）；**未编号记录（match 未命中）不受限制**；宿主整体删除的级联解链不受影响（届时宿主行已不存在）。知识库 `usage/04` 补齐「scope 输入 create-time stable」契约与 match 字段的同族说明。
- 回归：值型 scope 拒改 + scope 保持可用 + 非 scope 字段照常可更新；ref 型 scope 拒替换 + 宿主删除不受影响 + 后续编号连续，共 2 用例。

---

## 三、重要问题

### 已修复（本轮随手收口）

- **R-1 保留属性名与重复属性名无声明期守卫**：`Property.create({name:'id'})` 被框架主键静默覆盖（含其 defaultValue/computation——声明形同虚设）；同实体重复属性名 `Object.fromEntries` 静默保留最后一个、但**两个计算句柄都注册**（争用一列），此前仅靠 migration 的 "Migration identity is ambiguous" 意外拦截（报错点与病因相距甚远）。修复：`Entity.create`/`Relation.create` 声明期拒绝 `id`/`_rowId`（relation 另加 `source`/`target`）与重复名；`DBSetup.validatePropertyNames` 兜底（覆盖 create 后 push 属性、直接 new 构造等旁路）。非 merged 实体的自定义 `__type` 维持 r9 判定（合法）。`Entity.public.constraints.eachNameUnique` 元数据从「从不执行的死代码」变为有实际执行点。
- **R-2 `retrieveLastValue` 属性分支真值短路**：`if (record![prop])` 把 0/false/'' 误判为缺失而绕查数据库——多数时候是浪费一次查询，record 快照比库新时会拿到错误 lastValue。改为 `!== undefined`。

### 记录，本轮不修（按影响排序）

1. **迁移子系统的三个审阅完整性缺口**（migration 专项探查产出，均有代码证据）：
   - 事实属性/Dictionary 的 `defaultValue` 变更不进 manifest（property 只记录 type/collection/computed）——存量行保持旧默认语义、审阅不可见；与 r16 的「新增属性 backfill」形成不对称。建议：property manifest 增加 `defaultValueSignature`（与 boundStates 的 `[Function:hash]` 同模式），可随下一次 generator 版本变更一并处置。
   - manifest 持久化的 `computation.deps` 剥离了 match/modifier（签名用完整 deps、落盘用裁剪版）——signature 能检测变更，但审阅者在 diff 文件里看不到「哪个 match 变了」。建议落盘保留完整 deps。
   - 重算阶段无 per-computation operation log（整包单事务）——大规模迁移失败需整段重跑，生产可恢复性差（非正确性问题）。
2. **`RefContainer.replaceEntity/replaceRelation` 不 clone 传入实例**（与 `addEntity` 的 clone 语义不一致）——调用方后续 mutate 会污染容器内图。当前主路径多用 add，风险偏低，属 API 契约脆弱性。
3. **Scheduler `computeDirtyDataDepRecords` 中间对称段 TODO**（L546，r17 复确项）——正确性由 `relatedAttribute.length>3 → fullRecompute` 兜底（r16-O-5），代价是重算风暴；建议与 storage 的路径变体展开对齐后移除兜底。
4. **core 声明期守卫的低成本补洞**（core 探查产出）：`Property.create` 不校验 type 白名单（`'varchar'` 静默产出畸形 DDL、报错点远离声明点）；`Payload.create` 不查 items 重名；Activity `transfers` 无环检测（`A→B→C→A` 声明期接受，流程无「完成」语义——与 r9 的 goto 环检测形成对比）；Interaction 对 `event.user`/`user.id` 缺失无 fail-closed（残缺事件写入 `_Interaction_` 表，下游 StateMachine 按 user.id 匹配时静默不触发）。均为一两行守卫，建议随下一轮 createClass 统一校验（r16 建议 4）一并处置。
5. **对称 n:n 的 link 级 API 不做端点归一化**（r4-I-17/r7-I-2 遗留复确，storage 探查再次命中）：`addLink(A,B)` 后 `addLink(B,A)` 产出两条物理行（Count 双计）；`removeRelation` 反向 endpoint 匹配不到（"删不掉"）。需产品决策（无向边唯一 → 归一化/fail-fast；否则文档强制固定方向）。
6. **测试矩阵两个空白格**（storage 探查产出，防回归性价比最高）：`物理拓扑 × filtered entity` 交叉格（writePathTopologyMatrix 全文无 filtered）；`updateRelationByName ⟺ 宿主同 id + '&'` 的事件等价性对账（r17-F-2 的同族风险面，两种合法写法的事件契约无结构性断言）。
7. **`Event`/`Gateway` 死 API 仍在公开导出面**（r12-I-8 复确）——建议 `@deprecated` 标注或移出主入口。

---

## 四、证伪/降级的候选（本轮探查结论被推翻的）

| 候选 | 证伪证据 |
|------|----------|
| 「迁移 DDL 在 `db.scheme()` 成功与 operation log 写入之间崩溃 → `ADD COLUMN` 无 IF NOT EXISTS → resume 永久撞列已存在」（migration 探查 F-3，初判中置信致命） | resume 路径**每次重新生成 plan**（`Controller.migrate` → `prepareMigrationAdditive` → `createAdditiveSchemaPlan` 按 `getExistingColumns` 现查）——崩溃窗口内已加的列在重算 plan 时被识别为已存在、不再进 plan，operation log 只是同一次 plan 内的幂等加速。自愈，非致命 |
| 「StateMachine 的 create trigger 挂 filtered 名也不触发」（F-1 的扩大化推断） | 复现实验证伪：成员资格 create/delete 事件本就以 filtered 名发出，create trigger 正常触发（`review-fixes-2026-07-11-r18.spec.ts` enter 用例同时固化了这一边界） |
| 「MySQL 声明 ScopedSequence 要到运行期才失败」（core 探查 S-6） | `PropertyScopedSequenceHandle` 构造器（Controller 构造时）即检查 `db.atomicSequenceCapability`/`setupScopedSequenceState` 并抛明确错误——声明邻近期已 fail-fast，降级为文档补充项 |

另有一项按建议**文档处置而非守卫**：ScopedSequence 的 `match` 谓词字段事后可变（记录后来才满足谓词不会补编号）——与 scope 不同，match 字段（如 kind 归档）与业务生命周期常有正当重叠，一刀切 fail-fast 会阻断合法操作；已在 `usage/04` 写明 create-time-stable 期望。

---

## 五、既有遗留项复确（r2–r17 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；update/create 返回值三态（r16-O-2/r17-R-4，F-2 修复时再次绕行）；`Custom.asyncReturn` 2 参（r5-I-15）；StateMachine 单事件单跳 + 宿主自更新回声匹配（r7-I-8 家族——本轮 enter 用例的 keys 限定即为规避回声；无 keys 的宿主 update trigger 会连状态机自己写回结果的事件也匹配，属既有语义，建议文档提示）；`func::` 信任边界、`ignoreGuard`（文档化）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减（r2-I-6）；级联删除无深度上限（r2-I-5）；offset-only 全量拉取（r12-I-4）；EXIST 误触 post-pagination（r12-I-5）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；lockRows 5 轮上限（r15-O-3）；Activity every 组 CAS 不自动重试（r16-O-7）。
- **时间调度**：`nextRecomputeTime` 全链无消费方——RealTime 的时间驱动重算仍不存在（r3-R5）。
- **驱动**：MySQL 无事务（文档化）；contains 四驱动语义矩阵（r12-I-6）；PGLite UUID id vs 其他 INT。

---

## 六、修复优先级与后续建议

本轮四个致命项已全部修复。后续轮次建议：

1. **矩阵补格**（第三节第 6 条）——`filtered × 拓扑` 与 `updateRelationByName 事件等价` 两格是 r17 复盘「维度回灌义务」的直接应用，成本低、防回归收益最高。
2. **migration 审阅完整性三缺口**（第三节第 1 条）——defaultValueSignature 可与下一次 generator 版本变更合并处置，避免两次基线重建。
3. **createClass 统一声明期校验**（r16 建议 4 + 本轮第三节第 4 条清单）——本轮的保留名/重复名守卫又新增了两处手写校验点，「public.constraints 元数据 → create 自动执行」的统一机制能一次性消化 Property.type 白名单、Payload 重名、Activity 环检测等积压项。
4. **对称 link API 语义产品决策**（r4-I-17/r7-I-2，三轮复确）——建议下轮直接定谳。

### 升级注意（behavior-tightening，供 CHANGELOG 参考）

- **manifest generator 2 → 3**：既有 migration 基线需按错误信息指引重建（与 r14 确立的「不同代版本拒绝采信」政策一致）。
- **新增声明期 fail-fast**：值/关系属性同名、`id`/`_rowId`/`source`/`target` 保留名、同记录重复属性名——此前被静默接受（并静默损坏）的声明现在 setup/create 期报错。
- **新增运行期 fail-fast**：编号后的 ScopedSequence scope 输入变更被拒绝（此前静默重复编号）。
- **行为激活**：filtered 名上的事件驱动 `update` 监听从死监听变为按成员资格语义触发——依赖「永不触发」旧行为的声明（不应存在）会开始收到事件。

## 附录：复现要点（验证用）

全部固化在 `tests/runtime/review-fixes-2026-07-11-r18.spec.ts` 与 `tests/storage/review-fixes-2026-07-11-r18.spec.ts`：

- F-1：filtered 名 update trigger → 成员字段更新触发转移/派生；非成员不触发；enter 由成员资格 create 驱动不双跳。
- F-2：trigger.keys / next 状态 / notEmpty / eventDep record 四形态签名可见；未变更模型签名稳定；函数文本-only 不动 structuralSignature。
- F-3：三向命名空间冲突 setup fail-fast；无冲突对照组照常建表。
- F-4：值型/ref 型 scope 变更 fail-fast；scope 保持可用（编号连续）；宿主删除不受影响。
