# 全代码库深度 Review 报告（2026-07-09 第四轮）

> **维护说明（2026-07-09 更新）**：本报告发现的问题已在同分支（`cursor/deep-code-review-r4-b7cd`）修复，回归测试见 `tests/runtime/review-fixes-2026-07-09-r4.spec.ts`（29 个用例）：
>
> - **致命 F-1 ~ F-4 全部修复**：
>   - F-1：`DeletionExecutor.deleteNotReliantSeparateLinkRecords` 对对称关系（`linkInfo.isSymmetric()`）改用 `source.id IN (...) OR target.id IN (...)` 双向匹配；`manyToMany.spec.ts` 中固化了单侧删除的断言一并修正（2 条 delete 事件 + 关系表零残留），并补「非对称关系单向语义不受影响」与「下游 Count 结算为 0」的回归。
>   - F-2：`retrieveData` 把 `dataPolicy.attributeQuery` 实施为**投影上限**——调用方未提供投影时直接采用策略投影；提供了则逐项（含嵌套关联遍历）递归校验只能收窄，`'*'`、越界字段、越界嵌套遍历一律 `InteractionGuardError` 拒绝。`queryDataInteraction.spec.ts` 中依赖旧（失效）语义的用例已对齐新语义。
>   - F-3：两层修复——(1) setup 期：property dataDep 的 `attributeQuery` 显式包含计算自身输出属性时抛 `ComputationProtocolError`（提示改用 `useLastValue`/bound state）；(2) 运行期：`MonoStorage.callWithEvents` 以事务上下文计数 mutation 级联嵌套深度，超过 `MAX_MUTATION_CASCADE_DEPTH`（100）抛出指向「计算依赖图存在环」的明确错误——同时解决既有遗留 I-5（r1，级联深度上限），跨 property 的计算环（A↔B）由熔断兜底。
>   - F-4：`DBSetup.validateBaseChains()` 在 `buildMap` 一切处理之前对 baseEntity/baseRelation 链做环检测，错误信息带完整环路径（`FA -> FB -> FA`）。
> - **重要 R-1 ~ R-7 全部修复**：
>   - R-1：`Setup.createRecord` 拒绝用户声明名为 `id` 的 Property（relation 的 source/target 已有既有 assert）。
>   - R-2：`Relation.create` + storage 入口（`validateRecordNames`）双层校验 `type ∈ {'1:1','1:n','n:1','n:n'}`。**Property.type 白名单仍为遗留**：测试与生态中存在 `'object'`/`'json'` 等非枚举类型的既有使用，收紧属行为变更需单独评审（与 r2 R-6/I-15 结论一致）。
>   - R-3：新增 `MatchExp.extractSingleKeys`；`validateFilteredEntityPaths` 对单段 key 校验存在于 base 记录属性集合，错误信息指向 filtered entity 名与谓词 key。
>   - R-4：`PropertyCountHandle`/`PropertyWeightedSummationHandle` 补 `relatedMutationEvent` 空守卫；Count/Summation/Average/WeightedSummation 的 update 分支补 recordName 守卫（与 Every/Any 对齐，未知形态退 fullRecompute）。
>   - R-5：`cloneDispatchArgs` 改为纯数据深拷贝（plain object/array 递归克隆、类实例与函数按引用保留、WeakMap 防环）——重试对就地修改 payload 的用户代码恢复幂等，且调用方原始 args 不再被污染。
>   - R-6：非 isRef 的实体/关系 payload 携带顶层 `id` 时 guard 拒绝（伪造嵌入 `{id: 真实id, ...假字段}` 不再进入事件事实）；引用既有记录必须显式 `isRef: true`。
>   - R-7：`getFilteredRecordChanges` 识别 `removed` 变更；`recomputeFilteredMemberships` 为被删除 filtered 记录的旧成员合成 delete 事件（base 同时被删则安全跳过）；removed 上下文不进 rebuild 种子。
> - **改进项**：I-1（删除 `src/storage/objectstorage/` 死代码，import 已断裂且零引用）、I-4（`mergeAttributeQueryData` 合并重复关联项时保留 `matchExpression`/`modifier` 等查询选项）、I-8（Transform `planIncremental` 消费 `context.skip`，与内置聚合契约对齐）、I-16（`enforceDeclaredConstraints`：Klass `public` 声明的 constraints 在 `Entity.create`/`Relation.create` 时执行，重名属性 fail-fast 且错误信息指向模型而非迁移）。
> - **明确遗留（建议独立 PR）**：Property.type 白名单（行为变更）、六 handle 共享模板抽取（结构性重构，四轮累计 12 处漂移证据）、I-2/I-3/I-5/I-6/I-7（storage 潜伏与文档项）、I-9~I-15、I-17~I-20（契约决策类）。
>
> 修复后全量测试 1745 passed / 26 skipped（基线 1716，新增 29 个用例）；`npm run check` 通过。下文正文保留 review 时的原始判定，作为问题背景与复现依据。

- 日期：2026-07-09
- 基线：`main` @ `b9ee8404`（PR #19/#20 合入之后，前三轮 review 修复全部落地）
- 范围：`src/core`、`src/runtime`（含 computations、migration）、`src/storage`（含首次覆盖的 `objectstorage/`、DeletionExecutor 级联语义、对称关系全链路）、`src/builtins`（GetAction/dataPolicy、payload 校验、activity group）、`src/drivers`
- 方法：四个方向并行深度探查（r3 修复同族路径完备性 / storage 未覆盖区 / runtime 主路径与调度 / builtins+core+migration 语义）→ 人工精读交叉验证 → **对每个致命候选编写最小复现测试并实际运行**（PGLiteDB）。只有「已运行复现确认」的问题列为致命；仅凭精读判定的问题单独分级并标注置信度。探查中若干候选被实测**否证**（见附录「已否证候选」），未纳入正文。
- 与既有报告的关系：前三轮的致命与重要项已全部修复并有回归测试；其「明确遗留」项（六 handle 模板抽取、S1 同批拓扑排序、级联深度上限 I-5、async task 清理、合表事件 I-7~I-9、migration 运维、RealTime 调度契约 R-5、asyncReturn advisory lock R-4、`'program'` ActivityGroup I-12、驱动类型映射等）仍然有效，本报告不重复展开。本报告发现均为**新增**。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1716 passed / 26 skipped，全部通过。

---

## 一、结论摘要

前三轮把火力集中在计算语义、迁移、事务与「修复同族补漏」上。本轮转向**此前零覆盖的正交区域**：删除级联 × 对称关系、GetAction 的数据策略实施、setup 期模型校验（循环引用/保留名/类型白名单）、以及计算依赖图的自环。发现 4 个已复现的致命问题、3 个已复现的重要问题和若干精读判定的重要问题。

值得注意的规律：本轮致命问题全部集中在**「合法（或看似合法）声明 × 无校验/无实施」**的组合上——F-1 是唯一的运行期数据正确性缺陷（对称关系是文档主推的建模形态）；F-2 是「文档承诺的安全控制静默不生效」；F-3/F-4 是「非法模型无 fail-fast，以进程死亡代替错误信息」。这与框架规则中「Robustness：静默失败不可接受」直接冲突。前三轮的修复质量本身经受住了检验：r3 六个修复的同族路径审查只发现两处小的守卫漂移（R-4），主干无回归。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现） | 4 | 对称 n:n 级联删除孤儿关系行、dataPolicy.attributeQuery 静默失效（数据越权读取）、自依赖 property 计算无界递归、循环 baseEntity 链 setup OOM |
| 重要（已复现） | 3 | property 名 `id` 静默覆盖、relation type 无白名单、filtered 谓词未知字段不在 setup 拦截 |
| 重要（精读，高置信度） | 4 | Count/WeightedSummation 缺 relatedMutationEvent 守卫、dispatch retry 复用被污染的 args、payload 嵌入实体带 id 无存在性校验、迁移删除 filtered 记录无成员退出事件 |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认）

### F-1 对称 n:n 关系的级联删除：只清理 source 侧的关系行，target 侧成为**孤儿**——数据库脏数据 + 事件缺失 + 下游计数永久错误

- 位置：`src/storage/erstorage/DeletionExecutor.ts` L250–264（`deleteNotReliantSeparateLinkRecords`）——删除实体时按 `info.isRecordSource() ? 'source.id' : 'target.id'` 单侧匹配关系行；`src/storage/erstorage/LinkInfo.ts` L102–104——对称关系（source === target 且 sourceProperty === targetProperty）的 `isRelationSource` **恒为 true**，因此永远只匹配 `source.id`。
- 复现（REPRO-A，实测输出）：`User_friends_friends_User`（n:n 对称），建立 `alice→bob`（alice 为 source）与 `charlie→alice`（alice 为 **target**）两条关系后 `delete('User', alice)`：

```
links before delete: [{s:alice, t:bob}, {s:charlie, t:alice}]
links after delete:  [{s:charlie, t:alice}]   ← 指向已删除实体的孤儿行 ❌
relation delete events: 1                      ← 应为 2 ❌
```

- 影响：三重损坏——(1) 关系表残留指向已删除 id 的行，后续从 charlie 侧查询 `friends` 会解析出空/幽灵记录；(2) 只发 1 条关系 delete 事件，依赖该关系的 Count/Every/Summation 等只减一次，**永久停留错误值**；(3) 对称关系是 AGENTS.md 与知识库明确主推的建模形态（Friendship 示例），属主路径缺陷。查询路径对对称关系做了双向拆分（`spawnManyToManySymmetricPath`），唯独删除路径没有。
- 附注：既有测试 `manyToMany.spec.ts` L653–680 只断言「2 条关系删 1 个用户产生 1 条 delete 事件」——恰好把 bug 固化成了预期值。
- 修复方向：`deleteNotReliantSeparateLinkRecords` 对 `linkInfo.isSymmetric()` 的关系改用 `source.id IN (...) OR target.id IN (...)` 匹配（事件相应补全两侧）；修正 `manyToMany.spec.ts` 的断言并补「删除后关系表零残留」的回归。

### F-2 `dataPolicy.attributeQuery` 是死配置：声明了字段级读取策略，调用方仍可用 `query.attributeQuery: ['*']` 读取任意字段与关联实体

- 位置：`src/builtins/interaction/Interaction.ts` L556–572（`retrieveData`）——`dataPolicy.match` 与 `dataPolicy.modifier` 都被合并实施，唯独 L564 `const attributeQuery = eventArgs.query?.attributeQuery || []` **只读调用方输入**，`interaction.dataPolicy.attributeQuery` 从未被引用（全仓 grep 确认仅 `Data.ts` 定义处出现）。
- 复现（REPRO-D，实测输出）：`DataPolicy.create({ attributeQuery: ['id', 'name'] })` + dispatch `query: { attributeQuery: ['*'] }`：

```
dispatch result data: [{"name":"n1","secret":"s3cret","id":"..."}]  ← secret 泄露 ❌
```

- 影响：`agent/agentspace/knowledge/generator/api-reference.md` L2546/L2679 明确把 `dataPolicy.attributeQuery` 文档化为「Fields to retrieve / field restrictions」安全配置，三个官方示例都在用。按文档写出的字段级访问控制**静默不生效**，且 attributeQuery 支持关联遍历，调用方可以顺着关系读出策略之外的整棵关联子图。与 r1 R-4（无 dataPolicy.match 时行级全开，已文档化）不同，这是**声明了策略仍被绕过**，性质更严重。
- 修复方向：`retrieveData` 中以 `dataPolicy.attributeQuery` 为**上限**——声明了 policy 时要么直接采用 policy 的投影（忽略调用方超集），要么对调用方请求做交集校验、越界即抛 `InteractionGuardError`。交集校验更符合「调用方只能收窄」的既有 match 语义。同时补回归测试锁定 `['*']`、显式越界字段、嵌套关联三种绕过形态。

### F-3 property 计算依赖自身输出字段：写入→事件→重算→写入的**无界递归**，setup 无校验、运行期无熔断

- 位置：`src/runtime/ComputationSourceMap.ts` L325–343——property dataDep 按 `attributeQuery` 在宿主实体上注册 update 监听，**不排除计算自身的输出属性**（对比 global dict 依赖在 L194–196 有按 key 的自环过滤）；`src/runtime/Scheduler.ts` / `MonoSystem.ts` 的 mutation 级联无深度上限（既有遗留 I-5）在此被自环放大为必然死循环。
- 复现（REPRO-F，实测输出）：`score` 属性的 Custom 计算声明 `dataDeps: { _current: { type: 'property', attributeQuery: ['price', 'score'] } }`，`compute` 返回 `score + 1`（不收敛）：

```
compute 被调 201 次仍在继续（测试注入的熔断才停下）❌
```

对照（REPRO-C）：返回值收敛（`price + 1`）时 2 次调用后因值不变而停止——即该声明形态在收敛场景「看起来能用」，用户完全可能写出，一旦逻辑改为依赖旧值即进入死循环。
- 影响：合法类型签名 + 文档只有一句「avoid circular computation dependencies」的软性提示。触发后 dispatch 事务内同步递归直至栈溢出/事务超时/OOM，无任何指向自环的错误信息。
- 修复方向：两层——(1) setup 期静态拒绝：property 计算的 dataDep `attributeQuery` 包含自身输出属性名时抛 `ComputationProtocolError`（自环是静态可判定的，成本极低）；(2) 运行期熔断：级联深度计数超限抛带链路上下文的错误（顺带解决既有 I-5 的跨计算环）。若确有「依赖上一轮自身值」的合法需求，应引导到 `useLastValue`/bound state，而不是让自环静默通过。

### F-4 循环 `baseEntity` 链：setup 阶段死循环直至**进程 OOM 崩溃**

- 位置：`src/storage/erstorage/Setup.ts` L347–377（`resolveRootBaseRecordNameAndMatchExpression`）——`while ((currentEntity).baseEntity || (currentEntity).baseRelation)` 无环检测，且每轮向 `matchExpressions` 数组 push，循环引用时同步死循环 + 内存增长。
- 复现（REPRO-B，实测输出）：`FA.baseEntity = FB; FB.baseEntity = FA`：

```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory   ← vitest worker 直接死亡 ❌
```

由于死循环是同步的，事件循环被阻塞，任何基于 timer 的超时保护都无法介入——只能等 OOM。
- 影响：模型错误（环）本身非法，但框架的响应是进程死亡而非错误信息。间接构造（A 基于 B 的 filtered relation，B 又基于 A）在多人协作/代码生成场景并不罕见。`getBaseEntityChain`（filtered 依赖注册处）同样无环检测。
- 修复方向：解析链上用 `Set` 记录已访问节点，重复出现即抛 `ConstraintSetupError`（含环路径）。一处工具函数供 `resolveRootBaseRecordNameAndMatchExpression` 与 `getBaseEntityChain` 共用。

---

## 三、重要问题

### R-1 用户声明名为 `id` 的 Property 被框架主键**静默覆盖**（已复现）

- 位置：`src/storage/erstorage/Setup.ts` L239–264——先映射用户 properties，再无条件注入 `attributes[ID_ATTR]`（`ID_ATTR === 'id'`），同名用户属性被覆盖、无任何告警。
- 复现（REPRO-G，实测输出）：`Property.create({ name: 'id', type: 'string' })` setup 通过；`create('DocG', { id: 'user-supplied-id', ... })` →

```
error: invalid input syntax for type uuid: "user-supplied-id" ❌（PG 层错误，用户无从定位）
```

- 修复方向：`Setup.createRecord`（或 `Entity.create`）对保留属性名（`id`、以及 relation 上的 `source`/`target`）抛出明确错误。

### R-2 `Relation.type` 无白名单校验：`'2:3'` 之类的非法基数静默接受，运行期查询**静默返回空**（已复现）

- 位置：`src/core/Relation.ts` L151（直接赋值）；`src/storage/erstorage/Setup.ts` L382（`relation.type.split(':')` 直接消费）。
- 复现（REPRO-I/M，实测输出）：`type: '2:3'` → setup 通过、写入通过，从 source 侧带 `['bs', {...}]` 的查询返回的行**不含任何关联数据、也不报错**。
- 影响：与 r2 R-6/I-15（Property.type 白名单，已知遗留）同族，但 relation 基数直接决定表结构与合并策略，错误影响更隐蔽。一行校验的成本。
- 修复方向：`Relation.create` 校验 `type ∈ {'1:1','1:n','n:1','n:n'}`；顺带把 Property.type 白名单（既有遗留）一起收掉。

### R-3 filtered entity 谓词引用不存在的**单段**属性名：setup 不拦截，首次写入 base 实体时抛内部错误（已复现）

- 位置：`src/storage/erstorage/MatchExp.ts` L68–76（`getAttributePathsFromMatch` 只收集 `pathParts.length > 1` 的多段路径，单段 key 从不校验）；对照多段路径在 setup 有 `validateFilteredEntityPaths`。
- 复现（REPRO-E，实测输出）：`matchExpression: MatchExp.atom({ key: 'statsu', ... })`（拼写错误）→ setup 通过；`create('BaseE', ...)` →

```
Error @ EntityToTableMap.computeInfoByPath ← FilteredEntityManager.checkRecordsMatchFilter ❌
（错误信息是内部路径解析栈，与用户的谓词拼写错误无从关联）
```

- 修复方向：setup 期把单段 key 一并校验（存在于 base 实体属性集合），错误信息指向 filtered entity 名与谓词 key。

### R-4 `PropertyCountHandle` / `PropertyWeightedSummationHandle` 缺 `relatedMutationEvent` 空守卫（精读，高置信度）

- 位置：`Count.ts` L217、`WeightedSummation.ts` L197——`mutationEvent.relatedMutationEvent!` 强制解包；对照 `Summation.ts` L213–216 / `Average.ts` 同位置已有 `if (!relatedMutationEvent) return fullRecompute` 守卫（r2 I-2 修复），`Every/Any` 在 r3 R-3 补齐。六个 handle 中同一守卫第三次漏掉两个——复制粘贴漂移（既有遗留 I-1「共享模板抽取」）的又一实证，该重构应再次提升优先级。
- 修复方向：移植同款守卫；根治靠模板抽取。

### R-5 dispatch 事务重试复用**浅拷贝**的 args：用户代码就地修改 payload 嵌套结构后，重试以被污染的 args 重放（精读，高置信度）

- 位置：`src/runtime/Controller.ts` L616–626（`cloneDispatchArgs` 只浅拷贝顶层 `payload`/`user`）+ `transaction.ts` 的 `runWithTransactionRetry` 以同一引用重放。`guard`/`resolve`/`mapEventData` 中 `payload.items.push(...)` 之类的就地规范化在 serialization retry 后会二次叠加——重试对用户代码**不是幂等的**。
- 修复方向：每次 attempt 前深拷贝 args（structuredClone，payload 通常是纯数据）；或文档化「dispatch args 必须视为不可变」并在 dev 模式冻结。

### R-6 payload 非 `isRef` 的实体项携带 `id`：guard 不做存在性校验，伪造的嵌入实体原样进入事件事实（精读，高置信度）

- 位置：`src/builtins/interaction/Interaction.ts` L517–519——非 isRef 的 Entity/Relation payload 只检查 `typeof === 'object'`；`{ id: 真实id, title: '伪造' }` 通过 guard 后持久化在 `_Interaction_` 事件记录上，下游 Transform/StateMachine 读 `event.payload.x.id` 时会信任它。与 isRef 路径（有存在性校验）语义割裂。是 r2 I-14（checkConcept 浅校验）的具体武器化形态，风险高于原判级。
- 修复方向：非 isRef payload 中出现 `id` 字段时，要么按 ref 语义校验存在性，要么在 guard 拒绝（「嵌入创建的数据不允许携带 id」）——后者与「显式控制」更一致。

### R-7 迁移中**删除** filtered entity/relation：不产生成员退出事件（精读；低危注记）

- 位置：`src/runtime/migration.ts` L2906–2922（`getFilteredRecordChanges` 只遍历新 manifest，old 有、new 无的 filtered 记录不产生任何 change）。当前实际危害有限：依赖该 filtered 记录的计算在新模型中必然一并删除（否则 setup 报错），故无「留存消费者读到脏值」的路径。列为防御性修复项——未来若 rebuild 种子或事件回放消费到该缺口会成为隐患。

---

## 四、显著值得改进的地方

### 4.1 storage

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | `objectstorage/` 是死代码且 import 已断裂 | `objectStorage.js` L1（`import ... from '../../util.js'` 不存在） | 全仓零引用、未从 index 导出、加载即报错。删除或移入示例应用 |
| I-2 | 对称关系在 map 数据中的 `isSource` 被 target 侧覆盖 | `Setup.ts` L582–616 | 现有消费方都走 LinkInfo 元数据故未爆发；任何直接读 `RecordAttribute.isSource` 的新代码在对称关系上必错。潜伏项，修 F-1 时顺带修正或注释 |
| I-3 | `buildTables` 对映射到同一 field 的第二个属性静默跳过 | `Setup.ts` L1003–1004 | 依赖 hash 冲突计数器保证不发生，一旦上游出 bug 即静默丢列。改为抛错 |
| I-4 | `AttributeQuery.mergeAttributeQueryData` 合并重复关联项时丢弃首项的 `modifier`/`matchExpression` | `AttributeQuery.ts` L29–36 | 同一关系出现两次时限流/过滤静默失效 |
| I-5 | `['!=', v]` 遵循 SQL 三值逻辑排除 NULL 行 | `MatchExp.ts` L229 | 标准 SQL 语义但未文档化；用户预期 NULL 行匹配 `!= 'x'` 时静默漏行。在 storage 规则/USAGE_GUIDE 写明 |
| I-6 | `like` 无通配符转义辅助 | `MatchExp.ts` L229 | 用户值中的 `%`/`_` 生效为通配符；至少文档化，或提供 `escapeLike` 工具 |
| I-7 | `deleteDifferentTableReliance` 的事件回填扫描整个 events 数组 | `DeletionExecutor.ts` L279–290 | 多级级联中同名 link 的无关事件可能被错误改写 record 引用；应只回填本次调用新增的事件区间 |

### 4.2 runtime / computations

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-8 | Transform 的 `planIncremental` 不消费 `context.skip` | `Transform.ts` L81–88 | 当前 Transform 的 dataDep 不含 `match`，skip 实际不可达（REPRO-K2 实测 filtered source 行为正确）；但 `DataDepEventContext.skip` 是一等契约，六内置 handle 中唯它不认，未来给 Transform 增加 match 支持时必踩。一行对齐 |
| I-9 | 事件型 Transform（eventDeps）只会产生 insert patch，无 update/delete 生命周期 | `Transform.ts` L90–107 | 现状是「append-only 事件汇」，但 API 不拒绝 `type:'update'` 的 eventDep 也不文档化该语义；期望 1:1 派生态的用户会得到无限追加的行。setup 校验或文档明确 |
| I-10 | mutation listener 无错误隔离：第一个抛错的 listener 中止同批后续 listener | `MonoSystem.ts` L1205–1213 | 事务回滚保证了一致性，但「用户 listener 抛错 → 属性初始值与全部计算跳过」的失败形态应文档化（或隔离用户 listener 与框架 listener 的注册区） |
| I-11 | `recordMutationSideEffects` 结果按 name 键控，同批多事件时后者覆盖前者 | `Controller.ts` L751–787 | 一次 dispatch 创建两条 Order 时 `sideEffects.notify` 只剩最后一条的结果。改为数组或 name+eventIndex |
| I-12 | 全局聚合 create 分支「事件局部 record」与「findOne」两种策略并存 | `Count.ts` L74–77 vs `Summation.ts` L87–88 | 三轮 review 反复出现的漂移温床（本轮 R-4 又+2），模板抽取时统一 |
| I-13 | `dict.set` 不校验 Dictionary 声明的 type/collection | `MonoSystem.ts` L258–275 | 显式控制原则下可接受宽松，但 `Dictionary.create` 的 type 声明会给用户「有校验」的预期；至少文档化 |

### 4.3 builtins / core / migration

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-14 | dispatch 不校验 `user.id` 存在 | `Interaction.ts` checkUser / `ActivityCall.saveUserRefs` L375–396 | `user: {}` 时 attributive 拿到 undefined 目标、activity refs 存入 undefined。入口一行校验 |
| I-15 | `itemRef` 声明的 Attributive 从不在 guard 中求值 | `Interaction.ts` checkPayload | itemRef 仅用于 afterDispatch 存 ref；带约束语义的 itemRef 声明静默不生效。求值或从类型面明确其仅为「命名引用」 |
| I-16 | 重复 property 名的错误来自迁移 identity 而非模型校验 | 实测：`Migration identity is ambiguous for property:DocN.title` | fail-fast 是对的，但错误层级与信息误导（用户没在做迁移）。`Entity.create` 已有 `eachNameUnique` 约束定义却从不执行——把 `static constraints` 接入 create/setup |
| I-17 | BoolExp OR 左侧求值错误的可观测性 | `BoolExp.ts` L447–450 | 语义上「右侧独立放行」成立（实测 REPRO-L：左抛错+右通过=放行），不算 fail-open；但左侧错误信息被完全丢弃，权限服务故障不留痕。至少 logger.warn |
| I-18 | `'race'` ActivityGroup 完成后不剪枝 sibling 分支状态 | `ActivityCall.ts` L448–454 | 可用性判定正确，持久化的 state JSON 误导运维；对照 `'any'` 的剪枝逻辑补齐 |
| I-19 | 迁移 identity 只用 namePath，uuid 未参与匹配 | `migration.ts` L554–556 | 实体 rename = remove+add，旧表数据孤儿。与 r3 I-15（rename-candidate-reviewed 恒拒绝）同根：rename 工作流有类型无实现，应整体决策（实现 uuid 匹配的 rename，或从类型面移除） |
| I-20 | MySQL `insert()` 返回 `{id}` 而非 RETURNING 行；四驱动 `delete()` 返回形态各异 | `Mysql.ts` L122–139 | r3 R-2 修了 SQLite，MySQL 契约仍不同（MySQL 现状 transactions:false 本就不能跑 dispatch，优先级随 MySQL 事务支持决策） |

### 4.4 既有报告遗留项（仍有效）

六 handle 共享模板抽取（四轮累计 9 个具体缺陷，本轮 R-4/I-12 又 +3 实证，**强烈建议下一轮直接做**）、S1 同批拓扑排序、I-5 级联深度上限（与本轮 F-3 熔断合并处理）、async task 清理、合表事件完整性（含 flashOut 不传 events）、migration 运维项、RealTime 调度契约、asyncReturn advisory lock、`'program'` ActivityGroup（r1 I-12，本轮 builtins 探查再次确认其永不完成，若无实现计划应删除该类型）、驱动类型映射白名单（与本轮 R-2 一起收）。

---

## 五、修复优先级建议

**P0（数据损坏 / 安全 / 进程崩溃，全部有复现可转回归）：**
1. F-1 对称 n:n 级联删除双向清理 + 事件补全（唯一的存量数据损坏项，修复后建议提供孤儿行检测脚本）
2. F-2 dataPolicy.attributeQuery 实施（文档化的安全控制必须生效；交集校验 + 越界抛错）
3. F-4 baseEntity 环检测（数行代码消除一类进程死亡）
4. F-3 property 计算自环的 setup 拒绝 + 级联深度熔断（后者连带解决既有 I-5）

**P1（fail-fast 补全 / 同族补漏）：**
R-1 保留属性名校验、R-2 relation type 白名单（连带 Property.type）、R-3 filtered 谓词单段 key 校验、R-4 Count/Weighted 守卫移植、R-6 payload 嵌入 id 语义收紧、I-16 Entity constraints 接入。

**P2（契约与债务）：**
R-5 dispatch args 深拷贝、R-7 迁移 removed filtered 防御、I-1~I-15、I-17~I-20；结构性重构首推六 handle 模板抽取。

---

## 附录 A：复现测试代码（验证用，未提交为正式测试）

以下测试在 `b9ee8404` 上以 PGLiteDB 运行，结果如注释所示。修复时可改造为回归测试。

```ts
// F-1 (REPRO-A)：对称 n:n 级联删除孤儿
const friendRelation = Relation.create({ source: User, sourceProperty: 'friends',
  target: User, targetProperty: 'friends', type: 'n:n' })
await storage.addRelationByNameById(rel, alice.id, bob.id, {})     // alice 为 source
await storage.addRelationByNameById(rel, charlie.id, alice.id, {}) // alice 为 target
await storage.delete('User', matchAlice, events)
// 关系表残留 {s:charlie, t:alice} ❌；relation delete 事件只有 1 条 ❌

// F-2 (REPRO-D)：dataPolicy.attributeQuery 静默失效
Interaction.create({ action: GetAction, data: UserD,
  dataPolicy: DataPolicy.create({ attributeQuery: ['id', 'name'] }) })
await controller.dispatch(GetUsers, { user, query: { attributeQuery: ['*'] } })
// → [{"name":"n1","secret":"s3cret","id":"..."}] ❌ secret 泄露

// F-3 (REPRO-F)：自依赖 property 无界递归
Property.create({ name: 'score', computation: Custom.create({
  dataDeps: { _current: { type: 'property', attributeQuery: ['price', 'score'] } }, // ← 含自身
  compute: async deps => (deps._current?.score ?? 0) + 1,  // 不收敛
  getDefaultValue: () => 0 }) })
await storage.create('ItemF', { price: 10 })
// compute 被调 201+ 次仍在继续 ❌（对照：收敛函数 2 次后停止，说明该形态"看似可用"）

// F-4 (REPRO-B)：循环 baseEntity → setup OOM
const FA = Entity.create({ name: 'FA', baseEntity: Base, matchExpression: ... })
const FB = Entity.create({ name: 'FB', baseEntity: FA, matchExpression: ... })
FA.baseEntity = FB
await controller.setup(true)
// FATAL ERROR: JavaScript heap out of memory ❌（同步死循环，timer 无法介入）

// R-1 (REPRO-G)：property 'id' 静默覆盖
Entity.create({ name: 'DocG', properties: [Property.create({ name: 'id', type: 'string' }), ...] })
await storage.create('DocG', { id: 'user-supplied-id' })
// error: invalid input syntax for type uuid ❌（PG 层错误）

// R-2 (REPRO-I/M)：relation type '2:3' 静默接受
Relation.create({ source: A, sourceProperty: 'bs', target: B, targetProperty: 'as', type: '2:3' })
// setup ✓、写入 ✓、find(A, ..., ['*', ['bs', {...}]]) 静默返回不含关联数据的行 ❌

// R-3 (REPRO-E)：filtered 谓词 key 拼写错误
Entity.create({ name: 'FilteredE', baseEntity: Base,
  matchExpression: MatchExp.atom({ key: 'statsu', value: ['=', 'active'] }) })
// setup ✓；create('BaseE', ...) → Error @ EntityToTableMap.computeInfoByPath ❌
```

## 附录 B：已否证候选（探查中提出、实测/精读后排除，避免后续轮次重复）

- **Transform × filtered entity 的 skip**：REPRO-K2 实测 `Transform.create({ record: FilteredEntity })` 的成员进入/退出（含 create 不命中、update 退出）行为全部正确——filtered 成员资格走的是 storage 层的 membership 事件而非 dataDep.match，`Transform.planIncremental` 不认 `context.skip` 当前不可达（降级为 I-8 契约对齐项）。
- **Custom incrementalCompute 无 planIncremental 的 match 泄漏**：实测 setup 期即抛 `Custom incremental computation must declare planIncremental or incrementalDataDeps`（r3 修复生效）；`incrementalDataDepKeys` 路径已消费 `context.skip`（`Custom.ts` L212–214）。
- **MySQL DML 双引号标识符不合法**：`Mysql.ts` L77/L91 已 `SET sql_mode='ANSI_QUOTES'`，双引号合法。
- **BoolExp OR fail-open**：实测左 attributive 抛错 + 右通过 = 放行——但右侧独立授权成立，语义正确，仅可观测性问题（I-17）。
- **对称关系查询侧**：双向拆分路径（MatchExp OR + `:source/:target`）实测正确，缺陷仅在删除侧（F-1）。
- **MatchExp `['=', null]` / 空 IN / BoolExp.or standardize**：r1/r2 修复均在位。
