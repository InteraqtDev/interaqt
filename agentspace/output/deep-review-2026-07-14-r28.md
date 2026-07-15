# 全代码库深度 Review 报告（2026-07-14 第二十八轮）

- 日期：2026-07-14
- 基线：`main` @ `5b586bb0`（v4.1.1，r1–r27 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **2074 passed / 38 skipped**；全部 `postgresql*` 套件 @ 真实 PostgreSQL 16 **32 passed**；fuzzer CI 种子（1–8）全绿
- 范围：r27 复盘既定路线的执行轮——**以 fuzzer 扩展种子池收口 G-1–G-5 开放家族并继续扩大探索域（种子 1–499、50 操作）**，叠加五路并行深度探查（storage 查询编译 / storage 写路径 / runtime 调度与计算 / core+builtins / drivers+migration）
- 方法：与 r1–r27 全部报告逐条去重；每个候选先以最小复现实测定谳（SQLite / PGLite / 真实 MySQL 8 / 真实 PG 16），再按 fix-the-class 清单做兄弟轨/汇合点收敛
- 修复状态：**四个致命家族 + 三个重要项已在本分支（`cursor/deep-code-review-r28-ff3c`）全部修复**。回归固化于 `tests/storage/review-fixes-2026-07-14-r28.spec.ts`（18 用例）、`tests/runtime/review-fixes-2026-07-14-r28.spec.ts`（6 用例）
- 修复后：`npm run check` 通过；`npm test` 全量 **2097 passed / 38 skipped**（净增 23 用例）；全部 `postgresql*` 套件 @ 真实 PG 16 **32 passed**；MySQL env-gated 套件（open 幂等 / operationKey / close 幂等 / r26-leftovers）@ 真实 MySQL 8 串行全部通过；**fuzzer 种子 1–499（含 40/50 操作长序列）全绿**——r27 遗留的 G-1–G-5 全部收口，扩展探索新抓获的 H 家族亦全部收口

---

## 一、结论摘要

本轮是 r27「生成器铺格子、预言机判对错」路线的第一个完整收获期：**全部四个致命家族都由 fuzzer 种子先行抓获、人工最小化定谳、再按 fix-the-class 收敛修复**。四个家族共同指向同一个本体论真相：

> **combined（三表合一）的「同物理行」是一种编码手段，不是配对事实本身。**
> 配对事实的唯一真相源是 link id 列；行搬迁是物理操作，不是逻辑删除；
> 一张物理行对每个实体类型只有一个槽位，因此「同行」只能编码一条配对。
> 此前写读两侧的多处代码把「同住」直接当「配对」、把「搬迁」直接当「删除」消费——
> 每一处都是一个静默损坏家族。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（fuzzer 抓获，已修复） | 4 | 行槽位排他破坏（双 combined 放置）、行搬迁的逻辑删除误用家族、同住≠配对（幻影配对读取/级联）、事件驱动扇出双跑 |
| 重要（已修复） | 3 | reliance 语义跨拓扑不等价（merged/isolated 六种损坏/误拒形态）、Custom 同源多 dep 静默 N 倍增量、clone(deep) 家族三处忽略 deep |
| 记录，本轮不修 | 若干 | 见第四节 |
| 证伪 | 3 | 见第五节 |

---

## 二、致命问题（全部 fuzzer 先行抓获，已修复确认）

### F-1 行槽位排他不变量：同对实体的第二条 combined 放置（seeds 123 / 136 / 156）

- 位置：`Setup.mergeRecords` / `combineRecordTable`（`joinTables` 对「已同表」早退视为成功）。
- 机理：一张物理行对每个实体类型只有一个槽位，「同行」因此只能表达**一条**配对事实。同对实体（直接或经 combined 链间接）已同表后，第二条 combined 关系会与第一条**共享同一个物理槽位**——两条关系的配对无法独立取值。实测后果：
  - 查询面：第二条关系对同住行产生**幻影关联**（从未 link 过的 `a.out3` 返回同住记录、match 误命中）；
  - 写入面：经第二条关系认领对方时 flashOut 行搬迁与目的行槽位碰撞，同住记录被静默覆盖（`INSERT` 重复列名静默 last-wins）；
  - 删除面：reliance 分支按幻影配对**级联删除从未依赖过本记录的记录**（seed 156）；
  - 互为 reliance（A⇄B，两条自动合表）时 `sameTableReliance` 类型图成环，深查询递归无终止——**任何 update/delete 栈溢出**（seed 123）。
- 修复（Setup 汇合点）：`combineRecordTable` 检测端点对已同表 ⇒ 返回 `'co-located'`；显式 mergeLinks 路径 fail-fast（无法履行用户指令），reliance 自动合表路径**降级为关系表合并**（`mergedTo='source'`，物理拓扑是 Setup 的内部优化决策，1:1 与 reliance 生命周期语义全部保留）。降级同时使 sameTableReliance 类型图无环成为可依赖的不变量（后续多个递归依赖它）。

### F-2 物理行搬迁 ≠ 逻辑删除：搬迁误用删除机制的三个子家族（seeds 270 / 114 / 424 / 446 / 187）

- 位置：`RecordQueryAgent.relocateCombinedRecordDataForLink` / `flashOutCombinedRecordsAndMergedLinks`（复用 `deleteRecordSameRowData`）；`CreationExecutor.preprocessSameRowData`（link id 无条件重发号）。
- 机理：搬迁（解除 combined link 的 relocate、抢夺的 flashOut）中**没有任何记录逻辑死亡**——被移记录连同 reliance 子树 id 不变、整体重插新行。但清旧行复用了逻辑删除：
  - **级联误杀**（seed 270）：`deleteRecordSameRowData` 把携带的 reliance 子树成员按「死亡」处理——`handleDeletedRecordReliance` 物理删除其 **isolated link 行**与异表 reliance，且 events 为 undefined ⇒ 零事件销毁；
  - **默认值改写**（seeds 424/446）：查询快照对 NULL 列**省略键**，重插时写路径对缺席键应用 `defaultValue`——显式 null 被静默改写回默认值，零 update 事件；
  - **link id 重发号**（seed 114）：搬迁行上的 merged link 被当作新建重新发号——旧逻辑 id 消失、新 id 凭空出现，两侧零事件（按 link id 增量的响应式计算全部失明）；
  - **端点选择盲目**（seed 187）：relocate 恒移默认端点——默认端点带着**其他** combined 配对时，配对 link 列被清行销毁（星形共享行）。
- 修复：新增 `DeletionExecutor.clearRowDataForMigration`（纯物理清列，无级联无事件）供两个搬迁入口使用；`materializeNullsForRowMigration` 把快照缺席键如实物化为显式 null（含子树与 `&` link 数据）；preprocess 的 link id 分配尊重携带 id（载荷已带 link id ⇒ 物理搬迁，保号不发事件）；relocate 端点按「搬运子树无子树外配对」逐条决策，默认端点脏则**翻转移对端**，两端都脏 fail-fast。

### F-3 同住 ≠ 配对：combined 读取按裸同行编译（seed 369 + 查询面幻影家族）

- 位置：查询编译（combined x:1 无 JOIN 无 ON 的同行读取）、`DeletionExecutor` 级联判定、行删除足迹。
- 机理：F-1 守卫杜绝了**声明期**的双配对，但**运行期**仍能装配出「同住但未配对」的行——hub 亡故余留的孤儿 co-tenant、多 owner reliance（B.out4→D 与 C.out3→D，不同对、声明合法）的领养装配。裸同行读取把同住读成配对：
  - `find('B', ..., ['out4'])` 返回从未 link 过的同住 D（幻影嵌套读取）；
  - `match: out4.label = 'd5'` 误命中幻影行（filtered entity 谓词、成员资格判定同源）；
  - **删除面**：删 B 按幻影 out4 配对级联删除 C 的依赖 D（无辜记录物理销毁）；行删除的静态类型足迹把同住者的列一并清除（seed 369 的半清 link：端点 5→null、link 残存）。
- 修复（读写两面同一真相源 = link id 列）：
  - 查询面：`AttributeQuery` 为 combined x:1 自动附带 `&`(id)（同行列零 JOIN 开销），`QueryExecutor.pruneUnpairedCombinedReads` 结果剪枝（用户未请求 `&` 时剥除辅助数据）；`MatchExp` 对 match 路径的每个 combined 段追加 `link-id IS NOT NULL` 守卫原子（对称变体逐一；虚拟 link 端点豁免——link 行的存在就是配对）；
  - 删除面：`verifyAndEnrichDyingRecordPairings` 以 link id 列核验数据上携带的配对（幻影剪除、缺失的多 owner 配对按需补载以发 delete 事件）；`clearOrDeletePhysicalRow` 的足迹按**行上真实 link id 值**实例化（真实依赖才随行死亡），行删除判定以「足迹外仍有记录身份列非空」为准（孤儿 co-tenant 保全）；
  - 搬迁面：flashOut 行认领**刻意**按物理同住寻址——`physicalRowMatch` / `physicalRowRead` 显式豁免标记（被领养的独居记录没有配对可查）。

### F-4 事件驱动计算的扇出双跑：重叠 eventDeps（r27 F-2 的事件驱动轨兄弟格）

- 位置：`Scheduler.buildComputationMutationListener`（r27 只收了 property dep 轨）；`migration.runIncrementalRecompute` 同构。
- 机理：`Transform.create({ eventDeps: { anyOrder: {...}, paidOrder: {...record 过滤} } })` 注册两个监听；一个 create 同时命中两个模式 ⇒ `eventBasedIncrementalPatchCompute` 执行两次 ⇒ **两份相同的派生记录**（实测 2 行）。两次调用收到完全相同的事件对象、callback 无 dep 身份可读——用户层不可去重，必须框架合并（与 r27 F-2 同一judgment标准）。StateMachine 注册期按 (recordName,type) 折叠 + 脏记录去重，天然单跑不受影响。
- 修复：live Scheduler 与 migration 重放路径对事件驱动计算按 (computation, event) 去重；回归含「重叠命中合并为一次」与「单命中不受影响」两个方向。

---

## 三、重要问题（全部已修复）

- **I-1 reliance 语义跨物理拓扑不等价**（reliance 拓扑等价矩阵，8 轨 × 3 拓扑实测）：combined 的既定契约（r27b 固化：re-parent 合法 / displacement fail-fast / 空闲领养合法 / 幂等快照回写合法）在 **merged**（自引用 1:1 reliance、F-1 降级产物）与 **isolated**（1:n reliance 恒独立表）上两侧皆漏：
  - 认领他人依赖（re-parent）⇒ **静默双 link**（1:x 排他破坏；级联删除会销毁其他 owner 仍引用的依赖）；
  - 1:1 owner 已占用时绑新依赖（displacement）⇒ **FK 槽位静默覆盖 / 双 link**；
  - **空闲 owner 领养 / update 赋值**被 `cannot unlink reliance data` 误拒（无操作被判违规）；
  - isolated 1:n 的 update 超集新增被误拒、快照回写崩在 `link already exist`。
  修复收敛于三点：`createRecord` 入口的 reliance 槽位守卫（owner 侧 1:1 占用 fail-fast + 依赖侧 re-parent 删旧 link 带事件）、`unlinkOldOwnersOfExclusiveTargets` 的 reliance 分支（方向感知：ref=依赖 ⇒ re-parent；ref=owner ⇒ 占用 fail-fast）、UpdateExecutor 两处 unlink 的 reliance 语义化（「终态集合⊇既有集合」判定：孤儿化 fail-fast、超集/幂等放行）。
- **I-2 Custom 同源多 records/global dep 的静默 N 倍增量**：同一 source 的多个 records dep + 默认增量计划（incrementalDataDeps 无 planIncremental）下，单个 create/delete 命中全部同源监听 ⇒ `incrementalCompute` N 倍执行（实测 counter +2）。records dep 之间刻意不做框架级去重（per-dep membership 是增量语义组成部分，r27 契约），因此该形态**声明期 fail-fast**，错误信息指引合并 dep 或用 `planIncremental(context.depKey)` 显式分流（后者以回归固化为受支持写法）。
- **I-3 clone(deep) 家族三处忽略 deep**（r26 L-5 / r27 I-4 的兄弟面收口）：`BoolExpressionData.clone` / `Conditions.clone` 共享守卫树引用、`Activity.clone` 整图共享（transfers 不重指）。修复与 `StateMachine.clone(deep)` 同一隔离契约：树/图结构深拷贝（Activity 按 old→new 节点映射重指 transfers、嵌套子活动经 ActivityGroup 递归）、行为实例（Condition/callback）按惯例共享；浅 clone 语义不变。

---

## 四、记录，本轮不修（有明确理由）

1. **SQLite/MySQL `_IDS_` 计数器不从表 `MAX(id)` 自举**（drivers 探查）：PG 的 `setupSequences` 有该对账，SQLite/MySQL `setup(false)` 挂到已有数据（人工导入/恢复场景）时首个 `getAutoId` 可能撞 PK。fail-loud（PK 冲突）非静默，可达面窄（绕过框架的运维操作）；记录待 driver 家族统一处理。
2. **非空约束违规未映射为 `ConstraintViolationError`**（drivers 探查）：只有 unique 违规有结构化映射；`NonNullConstraint` 运行期命中返回裸驱动错误。fail-loud、元数据缺失级别；记录。
3. **重复 Dictionary 名的报错可读性**：`Controller.setup` 经迁移 manifest 以 `AmbiguousComputationSignatureError: Migration identity is ambiguous for dictionary:total` 拒绝（含无 computation 变体）——fail-fast 已存在但信息与用户操作（两个同名 Dictionary.create）距离较远；记录为报错质量改进项。
4. **Activity 父级 Transfer 指向嵌套子活动交互时孤儿化 ActivityGroup**（core 探查）：start/end 计数校验只看顶层节点，`Transfer.create({source: head, target: nestedStep})` 使 group 成为不可达死节点、every/race 语义静默跳过。需要先做「是否支持跨层 jump」的产品决策再收紧；记录。
5. **查询面 NOT(combined 路径原子) 的三值逻辑分歧**：本轮的 link-id 守卫使 `NOT(out4.label='x')` 对未配对行返回 TRUE（旧行为 / JOIN 语义为 UNKNOWN→过滤）。逻辑上「配对不存在 ⇒ 否定成立」自洽，但与 LEFT JOIN 三值语义存在分歧面；记录为契约决策项。
6. **MySQL 套件并行互扰**：`mysqlOpenIdempotency` 断言 processlist 连接数，与其他 MySQL 套件并行时假红（r27 已在 CI 序列化，本地并行仍会踩）；维持记录。
7. r23–r27 既有记录项（RealTime 调度器、MySQL TIMESTAMP、legacy operationKey 回退、filtered targetPath 风暴、深嵌 EXIST 别名、post-pagination tie、Property/Entity 未接 validateCreateArgs 的潜伏元数据缺陷等）：本轮探查无新增证据，维持记录。

---

## 五、证伪 / 未达致命门槛的候选

| 候选 | 结论 |
|------|------|
| 「宿主删除后 combined 伙伴残留产生幻影宿主行」（storage 探查子代理 #1：`find('User')` 返回 `{profile:{...}}` 幽灵行） | 证伪：实测宿主删除走列清除 + `id not null` 根守卫，`find('User')` / `profile.title` match 均为空；孤儿行全 NULL 无幻影 |
| 重复 Dictionary 名静默 last-writer-wins（core 探查子代理 F-1） | 证伪（作为静默损坏）：`assertUniqueIdentities` 在 setup 期 fail-fast（含无 computation 变体）；降级记录为报错质量项（第四节 #3） |
| `between` 反序边界静默零行 | 未达门槛：调用方书写错误且 fail-empty 与 SQL 语义一致；记录在案不修 |

---

## 六、逃逸分析（为什么 r27 的防御没有当场抓全）

完整复盘见 `r28-test-blindness-retrospective.md`。一句话版本：

1. **fuzzer 的价值曲线验证了 r27 的判断，也暴露了它的操作学**：G/H 家族全部由种子先行抓获——但只有把种子池从 8 扩到 499、操作数从 30 扩到 50，家族才陆续现身。**生成域的每一次扩张都是一次新的审查**；固定小种子集只保住已收口的格。
2. **F-1/F-3 是「编码手段被当作事实本身」的本体论错误**：`mergedTo='combined'` 的语义是「用同行编码这条配对」，实现却让「同行」反向蕴含「配对」。这类错误不住在任何单个分支里——它是**读写两侧几十个消费点共同的默认假设**，只有跨消费点的真相源审计（「配对事实存在于哪一列？谁读它？谁绕过它？」）能系统性找到。
3. **F-2 是「机制复用继承了错误语义」**：搬迁复用删除的清行例程，删除的级联/默认值/发号语义全部被继承。复用判定必须问「两个调用方的语义前提是否同构」，而不是「代码形状是否相同」。
4. **I-1 重复了 r27 F-1 的教训（物理拓扑不得改变声明面语义），但在关系语义层**：r27 收口的是载荷合法性 × 拓扑，本轮是 reliance 生命周期契约 × 拓扑——同一根轴在不同语义层的投影，说明「拓扑等价」应作为**每个声明面语义**的固定审计维度，而不是逐 bug 回填。

---

## 七、修复优先级与后续建议

1. **fuzzer 生成域继续扩张**（quality-foundation-plan §1.3 的既定路线）：filtered entity/relation、merged (union) entity、computed/computation 属性入域；驱动差分（SQLite vs PGLite 同种子对账）。
2. **`&` link id 的读取成本审计**：本轮为 combined x:1 自动附带 `&`(id)（同行列零 JOIN），确认无慢查询回归后可考虑在 `findRelationByName` 面同样收敛到统一的配对判定助手。
3. 第四节 #1/#2/#3（driver 自举、非空映射、报错质量）打包进下一次 driver 轮。
4. Activity 跨层 Transfer 的产品决策（第四节 #4）。

### 升级注意（behavior-tightening，供 CHANGELOG 参考）

- **新增 Setup 期 fail-fast**：对已（直接或经 combined 链）同表的实体对再声明 mergeLinks 合并（此前幻影关联/行槽位静默碰撞）。**互为 reliance / 链闭合的 reliance 自动合表改为降级编译（merged link）**——声明语义不变，此前栈溢出/幻影级联的拓扑开始正确工作。
- **combined x:1 的读取/匹配开始以 link id 列为配对真相源**：孤儿同住不再被读成关联（此前返回幻影记录、match 误命中）。
- **行搬迁（removeRelation 解除 combined link、flashOut 抢夺）行为修正**：不再级联删除被搬记录的独立表关系行；被搬行的显式 null 不再被 defaultValue 改写；merged link 的逻辑 id 保持不变；默认搬迁端点带有其他 combined 配对时自动改移对端，两端都带时 fail-fast（新错误 `cannot unlink combined relation ... both endpoints ...`）。
- **reliance link 建立/更新语义跨拓扑统一**：merged/isolated 拓扑的 re-parent（认领他人依赖）开始合法生效（此前静默双 link）；owner 已占用时绑定新依赖在全部拓扑 fail-fast；「给空闲 owner 经 update/create 赋依赖」不再被误拒；update 声明的集合若**丢弃**既有配对则 fail-fast（超集新增/幂等快照回写合法）。
- **事件驱动计算（Transform eventDeps）对单一事件只执行一次**（此前每个命中的 eventDep 各插入一份派生记录；存量重复行需自查）。
- **新增声明期 fail-fast**：Custom 同一 source 的多个 records/global dataDeps + 增量路径但无 planIncremental（此前单事件 N 倍增量）。
- **`BoolExpressionData/Conditions/Activity/ActivityGroup.clone(x, true)` 开始真正深拷贝**（此前 deep 参数被忽略、共享子树/图引用）。
- **relation update 事件的 `record` 不再携带端点**（端点契约归 `oldRecord`，存储原生形态；此前载荷形态的字符串 id 会进入 merged 视图）。
- **link create 事件 payload 开始携带经嵌套新建子记录声明的 `&` 属性**（此前行有值、事件读 NULL）。
