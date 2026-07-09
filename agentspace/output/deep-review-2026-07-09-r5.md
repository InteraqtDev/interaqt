# 全代码库深度 Review 报告（2026-07-09 第五轮）

- 日期：2026-07-09
- 基线：`main` @ `1f848596`（PR #22 合入之后，前四轮 review 修复全部落地）
- 范围：`src/core`、`src/runtime`（Controller/Scheduler/ComputationSourceMap/computations/transaction）、`src/storage`（mutation executors / SQL 构造 / filtered entity）、`src/builtins`（dispatch 守卫链 / data API）、`src/drivers`、`agent/agentspace/knowledge/`（知识库与代码事实的一致性）
- 方法：五个方向并行深度探查（dispatch 守卫链与 data API / runtime 编排与事务 / SQL 构造与查询 / 计算引擎增量语义 / storage 写路径与 filtered entity）→ 人工精读交叉验证 → **对每个致命候选编写最小复现测试并实际运行**（PGLiteDB / SQLiteDB）。只有「已运行复现确认」的问题列为致命；仅凭精读判定的问题单独分级并标注置信度。两个子报告候选经复现被**证伪**（见第五节），未计入。
- 与既有报告的关系：前四轮（r1–r4）的致命与重要项已全部修复并有回归测试；其「明确遗留」项（r4 的 R-4/R-5/R-6.2/R-6.3/R-7、六聚合 handle 模板抽取、I-1~I-18，r3 的 R-4/R-5/R-6/R-8，r2 的驱动类型映射、级联深度、async task 清理、合表事件完整性）仍然有效，本报告不重复展开。本报告发现均为**新增**。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1725 passed / 26 skipped，全部通过。

---

## 一、结论摘要

前四轮把 storage 读写路径、增量计算边界、Activity/序列化、打包链路修到明显收敛。本轮纵深转向**声明组合的正交盲区**：filtered entity × 聚合计算的增量触发、data API 的字段投影策略、update 路径 × 关系属性（`&`）、`computed` 属性 × 关系数据。四处各查出一个已复现的致命问题。

延续前几轮的规律：本轮致命问题依然全部落在「**测试矩阵从未走过的合法声明组合**」——filtered 聚合只测过 membership 驱动的 Count（成员字段更新零覆盖）、`dataPolicy.attributeQuery` 的所有测试都同时传了 caller 侧 attributeQuery、`&` 关系属性只测过 create、`computed` 只测过同行字段输入。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现） | 4 | filtered 实体上的聚合对成员字段更新永久失明、dataPolicy.attributeQuery 零生效（字段投影可被调用方绕过）、update 丢弃 `&` 关系属性、computed 属性引用关系数据在 update 时静默翻转 |
| 重要（已复现） | 3 | 大 IN 列表超占位符上限崩溃、n:n update 重复 ref 内部断言崩溃、`contains` 用于非数组 JSON 裸 DB 错误 |
| 重要（精读，高置信度） | 5 | Scheduler.setup 失败留下零监听系统、setup(true) 半途失败进死角、dispatch retry 共享嵌套 payload、同名 side effect 结果覆盖、知识库 `getValue` API 不存在（代码生成管线级污染） |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认）

### F-1 建立在 filtered entity/relation 上的聚合计算：**成员字段更新永不触发**，聚合值永久陈旧

- 位置：
  - `src/runtime/ComputationSourceMap.ts` L322–331——records dataDep 的 update 监听注册在 `dataDep.source.name`（即 **filtered 视图名**，如 `ActiveUser`）；
  - 对照 storage 侧：update 事件的 `recordName` 是**base 实体名**（`CreationExecutor.ts` L199–206，`recordName: newEntityData.recordName`）；filtered 名下只发 membership 的 create/delete（`FilteredEntityManager.settleMembershipChecks`），成员**留在集合内**的字段变化不产生任何 filtered 名下的事件。
  - `rg 'baseEntity|filtered' src/runtime/ComputationSourceMap.ts src/runtime/Scheduler.ts` **零命中**——runtime 计算层完全不知道 filtered 与 base 的映射关系。
- 复现（REPRO-A / REPRO-L，实测输出）：

```
// Summation({record: ActiveUser, attributeQuery: ['salary']}) 挂 dict
create User{isActive:true, salary:100} → sum = 100 ✓（membership create 驱动）
update User.salary → 200（仍是成员，无 membership 事件）
  → sum = 100 ❌（应为 200，无任何报错）

// Count({record: ActiveTask, attributeQuery:['score'], callback: r => r.score > 10})
create Task{isActive:true, score:5} → count = 0 ✓
update Task.score → 20 → count = 0 ❌（应为 1）
```

- 影响：文档明确承诺该模式（`agent/agentspace/knowledge/usage/09-filtered-entities.md` L12「Supports computations: Can perform reactive computations on filtered data」，L374 直接给出 filtered + WeightedSummation 示例）。凡是「视图 + 按字段聚合」的建模（活跃用户薪资总额、已支付订单金额、高分任务计数……）在成员字段更新后全部静默陈旧——**查询侧正确、聚合侧永久错误、无告警**，与 r3 F-1 同为最危险的失效形态。纯 membership 驱动的 Count（无 attributeQuery/callback 读字段）不受影响，这正是现有测试矩阵（`filteredMembershipMatrix.spec.ts` 只断言 Count）没发现它的原因。
- 修复方向：source-map 构建时对 `dataDep.source` 携带 `baseEntity`/`baseRelation` 的情况，把 update 监听注册到**resolved base 链**上（穿透嵌套 filtered），并在事件到达时用 filtered 谓词做成员资格预检（可复用 storage 侧 `FilteredEntityManager.analyzeDependencies` 已有的依赖分析）；增量分支中 oldRecord/newRecord 的成员资格组合（留在集合内 / 进入 / 退出）要与 membership 事件去重，避免双计。测试矩阵需补：filtered source × {Summation, Average, WeightedSummation, Count+callback} × 成员字段 update。

### F-2 `dataPolicy.attributeQuery` 从未生效：Get 交互的字段投影完全由调用方决定

- 位置：`src/builtins/interaction/Interaction.ts` L552–553：

```ts
const modifier = { ...(eventArgs.query?.modifier || {}), ...(fixedModifier || {}) };  // policy 覆盖 caller ✓
const attributeQuery = eventArgs.query?.attributeQuery || [];                        // ← policy.attributeQuery 无人消费 ❌
```

  `retrieveData` 只读取了 `dataPolicy.match` 与 `dataPolicy.modifier`；`rg 'dataPolicy' src/` 确认 `attributeQuery` 在整个 src 中零消费。`DataPolicy.public` 却把它声明为一等字段（`Data.ts` L48–52）。
- 复现（REPRO-B，实测输出）：

```ts
const GetSecrets = Interaction.create({ action: GetAction, data: Secret,
  dataPolicy: DataPolicy.create({ attributeQuery: ['id', 'title'] }) })  // 作者意图：固定投影
await controller.dispatch(GetSecrets, { user, query: { attributeQuery: ['id', 'title', 'ssn'] } })
// → [{"id":"…","title":"t","ssn":"123-45-6789"}] ❌  ssn 全量返回，policy 零效果
```

- 影响：这是**权限/数据暴露级**问题——交互作者以为 `dataPolicy.attributeQuery` 限定了可见列（`queryDataInteraction.spec.ts` L857–861 的测试也这么写），实际上任何调用方都可以请求任意字段（含 `['*']`）。match/modifier 都是「policy 覆盖/合并 caller」，唯独 attributeQuery 是「caller 全权」，同一 API 内三个字段两种语义。现有测试全部在 query 里同时传了合法 attributeQuery，所以从未暴露。
- 修复方向：policy 存在时以 policy 为上限（取交集，或直接 policy-wins，与 modifier 的合并方向一致）；并补「caller 无法越权拓宽字段」的负向测试。半可用的策略字段比没有更危险——建议按显式控制原则，policy 声明了就必须生效。

### F-3 update 替换关系时 `&` 关系属性被静默丢弃

- 位置：`src/storage/erstorage/UpdateExecutor.ts` L219——`handleUpdateReliance` 重建关系时调用 `addLinkFromRecord(..., /* attributes */ undefined, events)`，link 数据参数**恒为 undefined**；对照 create 路径（`CreationExecutor.ts` L337–343）正确使用 `record.linkRecordData?.getData()`。
- 复现（REPRO-E，实测输出）：

```ts
await storage.create('User', { teams: [{ id: t1.id, '&': { role: 'member' } }] })
// link: [{"role":"member","team":"t1"}] ✓
await storage.update('User', matchU, { teams: [{ id: t2.id, '&': { role: 'lead' } }] })
// link: [{"team":"t2"}] ❌  role 丢失（应为 'lead'），无报错
```

- 影响：`&` 是文档化的一等语法（`update relation with & payload` 是合法建模），create 可用、update 静默丢数据——又一处「半可用 API」。关系属性上挂了 filtered relation 谓词或聚合计算时，错误会进一步向下游传导。现有 `relationAttributes.spec.ts` 只覆盖 create 与 null-delete。
- 修复方向：`handleUpdateReliance` 把 `newRelatedEntityData.linkRecordData?.getData()` 传入 `addLinkFromRecord`；同族检查 `updateSameRowData` 路径上 merged link 的 `&` 数据（`NewRecordData.getSameRowFieldAndValue` L242 起对 mergedLinkTargetRecordIdRefs 有处理，isolated/differentTableMerged 没有）。补 update-with-`&` 的回归测试（含事件断言）。

### F-4 `computed` 属性引用关系数据：create 时"可用"，任意后续 update **静默翻转**

- 位置：
  - `src/storage/erstorage/UpdateExecutor.ts` L46–52——update 前置查询按 `newEntityData.getData()` 的键裁剪，**isolated/差表关系永远不在** `fullAttributeQuery`（`AttributeQuery.getAttributeQueryDataForRecord` 不含 differentTableRecordAttributes）；
  - `src/storage/erstorage/NewRecordData.ts` L216–230——update 时**无条件重算全部** computed 列，`newRecord = {...oldRecord, ...rawData}` 中关系路径缺失，`r.team?.type` 求值为 undefined 并落库。
- 复现（REPRO-D2，实测输出）：

```ts
// User.inTech = computed(r => r.team?.type === 'tech')，User–Team n:1
await storage.create('User', { name: 'A', team: { type: 'tech' } })   // 嵌套 payload
// inTech = true ✓（create 时 rawData 里恰好有 team.type）
await storage.update('User', matchU, { name: 'A2' })                  // 与 team 无关的更新
// inTech = false ❌  静默翻转并持久化
```

  （用 ref 形式 `team: {id}` 创建时，inTech 从 create 起就是 false——同一声明两种建立方式产生不同值。）
- 影响：`computed` 的契约（同行字段派生）从未在声明期强制——引用关系数据的写法**创建时表面可用**，诱导用户依赖它，然后在任意一次无关 update 时静默腐蚀数据。若 filtered entity 谓词建立在这样的 computed 列上，还会连带产生错误的 membership 事件（r4 F-1 修复让 computed 列进了 changedFields，此处翻转会触发假的成员退出）。
- 修复方向（二选一，不能维持现状）：
  1. **声明期拒绝**（推荐，符合显式控制）：`computed` 函数无法静态分析依赖，但可以在运行 computed 时传入仅含同行 value 字段的 record 代理，访问关系属性即抛出明确错误——把契约变成可执行的；文档同步写明「computed 只能引用同行字段，跨记录派生用 computation」。
  2. 支持关系输入：update 前置查询不裁剪 computed 所需的关系子图（需要 computed 声明依赖，等于引入新 API）。成本高，不建议。

---

## 三、重要问题

### R-1 用户侧大 `IN` 列表超数据库占位符上限：崩溃（已复现）

- 位置：`src/storage/erstorage/MatchExp.ts` L254–257——`IN (${value[1].map(() => p()).join(',')})`，每元素一个占位符，无分片无上限。框架内部批量路径有 `BATCH_SIZE = 500`（`QueryExecutor.ts` L386–414），用户 matchExpression 不在保护内。
- 复现（REPRO-G，实测输出）：SQLite 上 `['in', 40000 个值]` → `too many SQL variables`（SQLite 默认上限 999/32766，PG 65535）。
- 修复方向：MatchExp 编译期对超阈值 IN 自动分片为 OR 链，或在 QueryExecutor 侧拆查询合并结果；至少给出带建议的受控错误。

### R-2 n:n update payload 含重复 ref：内部断言崩溃（已复现）

- 位置：`src/storage/erstorage/CreationExecutor.ts` L416–427 `assert(!existRecord, 'link already exist')`，经 `UpdateExecutor.handleUpdateReliance` L202–219 逐元素 addLink，无去重。
- 复现（REPRO-H，实测输出）：`update('User', …, { teams: [{id: t1}, {id: t1}] })` → `Error: cannot create User_teams_members_Team for <id> <id>, link already exist`。
- 影响：update 语义是 replace（先 unlink 再重建），payload 内部重复是调用方数据不洁的常见形态；崩溃点是内部断言，信息与用户写法脱节。修复方向：handleUpdateReliance 对 (attribute, targetId) 去重（幂等），或在入口给出指向 payload 的明确错误。

### R-3 `contains` 用于非数组 JSON 字段：裸数据库错误（已复现）

- 位置：`src/drivers/PGLite.ts` L206 / `PostgreSQL.ts` L349——`json_array_elements_text` 假定列值是 JSON 数组。
- 复现（REPRO-I，实测输出）：`type: 'object'` 属性 + `['contains', 'key']` → `cannot call json_array_elements_text on a non-array`。
- 修复方向：对非 collection 列使用 `contains` 时给出声明期/编译期错误，或驱动侧兼容对象语义并文档化跨驱动差异（MySQL `JSON_CONTAINS` / SQLite `json_each` 语义本就不完全一致，见 4.1 I-5）。

### R-4 `Scheduler.setup` 失败序：先注销后注册，中途抛出留下**零监听**的静默系统（精读，高置信度）

- 位置：`src/runtime/Scheduler.ts` L1238–1243——`removeRegisteredMutationListeners()` 最先执行；随后 `addMutationComputationListeners()` 内的 `sourceMapManager.initialize()` 有多条抛出路径（如 `ComputationProtocolError`）。抛出后旧监听已全部移除、新监听未注册完成，错误向上抛但**没有恢复逻辑**。调用方（尤其 migrate 后的 resume 场景）若捕获错误继续使用 controller，事实写入照常、所有增量计算冻结，无任何后续报错——与 r3 R-6（migration succeeded 先于 scheduler.setup）同族的「静默失效框架」，但这里连 migration log 的线索都没有。
- 修复方向：注册-后-切换（先构建新 listener 集合，全部成功后原子替换），或失败时显式进入「不可用」状态让后续 dispatch fail-fast。

### R-5 `setup(true)` 半途失败：有表无 manifest，后续 `setup(false)` 死于 `MigrationBaselineError`（精读，高置信度）

- 位置：`src/runtime/Controller.ts` L269–274——`system.setup`（建表）成功后才执行 `scheduler.setup(install)`，manifest 在**最后**写入。scheduler.setup 抛出（坏的 dict 初始值 / R-4 的任何 initialize 错误）时：表已建、`hasExistingData()` 为真、无 manifest → 下次 `setup(false)` 命中 L262–264 的 baseline 检查，只能走 `createMigrationBaseline()` 恢复，错误信息不指向真实原因。
- 修复方向：install 失败时回滚 schema（或至少在错误里附带「首次安装未完成，可 forceDrop 重装」的恢复指引）；或把 manifest 写入提前到 system.setup 之后、scheduler.setup 之前（manifest 描述的是 schema，与 scheduler 无关）。

### R-6 dispatch retry 的 `cloneDispatchArgs` 是浅拷贝：嵌套 payload 跨尝试共享（精读，高置信度）

- 位置：`src/runtime/Controller.ts` L616–626——只 spread 了顶层与 payload/user 第一层。`guard`/`resolve`/`afterDispatch` 对嵌套对象的原地修改在 retryable 错误（40001/40P01）后**泄漏进下一次尝试**，重试不再等价于干净重放。`transactionRetry.spec.ts` 只验证了顶层语义。
- 修复方向：对 payload/user 深拷贝（structuredClone，注意函数字段），或冻结输入并文档化「dispatch 输入不可变」。

### R-7 知识库 `getValue` API 不存在：**代码生成管线级**的文档污染（已实测确认）

- 位置：`agent/agentspace/knowledge/usage/` 五个指南（02/04/14/15/19）+ `agent/agentspace/knowledge/generator/` 两个指南反复推荐 `Property.create({ getValue: (record) => … })` 作为「同实体简单派生」的正解（02 L204–248 有整节教程，04 L685 起「CRITICAL: When to Use Transform vs getValue」，19 L195 把它标成 ✅ CORRECT）。但 `src/core/Property.ts` **没有 `getValue`**（实际 API 是 `computed`），实测 `Property.create({..., getValue})` **静默丢弃**该参数——生成的属性是一个永远为 null 的普通列，无任何报错。
- 影响：这套知识库是 agent 代码生成工作流（`agent/CLAUDE.md`）的直接输入——按文档生成的应用会批量产出静默失效的派生属性。另外文档还宣称 computed 属性「not stored in the database but calculated dynamically at query time」（02 L253），而实际实现是**写时持久化列**（`NewRecordData.getSameRowFieldAndValue`，读路径无动态求值）——两个方向都与代码事实相反。`agent/skill/interaqt-reference.md` L44 的「NOT persisted」同错。
- 修复方向：全量替换文档中的 `getValue` → `computed`，改正持久化语义描述；顺带在 Klass 工厂对未声明的 create 参数告警/抛错（displayName + 未知键），把这类漂移从「静默」变「fail-fast」——这对框架所有 Klass 都是一次性收益。

### R-8 `RecordMutationSideEffect` 同名结果覆盖：一次 dispatch 多事件命中同一注册时只保留最后一次（精读，高置信度）

- 位置：`src/runtime/Controller.ts` L756–783——`result.sideEffects![sideEffect.name] = {...}` 以 name 为键，批量创建 / membership 连锁产生多事件时前面的 result/error 被覆盖。副作用本身都执行了，但 `DispatchResponse` 丢失了前面的结果（含 **error**——失败可能被后续成功掩盖）。
- 修复方向：按 name 聚合为数组，或 key 加事件序号；error 至少不能被覆盖。

---

## 四、显著值得改进的地方

### 4.1 storage / drivers

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | `between` 无参数形态校验 | `MatchExp.ts` L273–283 | `['between', 25]` 直接 TypeError；对照 `'in'` 有 Array.isArray 检查。补 arity 校验 |
| I-2 | 操作符大小写不一致 | `MatchExp.ts` L208–209 | `in/not in/between/is null` 走 toLowerCase，`like`/`!=` 必须小写，`['LIKE', …]` 落到 `unknown value expression` 断言。统一在一处 normalize |
| I-3 | `IN`/`NOT IN` 列表含 null 的三值逻辑陷阱 | `MatchExp.ts` L256–271 | `NOT IN (…, NULL)` 恒空集；文档化或过滤 null 并给告警 |
| I-4 | `mergeAttributeQueryData` 合并重复关系键时丢 matchExpression/modifier/onlyRelationData | `AttributeQuery.ts` L29–36 | 只保留 attributeQuery，两分支元数据冲突时静默丢弃；低频但语义错 |
| I-5 | 跨驱动 `contains` 语义漂移 | PG `json_array_elements_text` / MySQL `JSON_CONTAINS` / SQLite `json_each` | 无跨驱动 parity 测试；与 R-3 一并处理 |
| I-6 | `parentById` Map 键 string/number 混用 | `QueryExecutor.ts` L392–395 | SQLite 数值 id 与字符串化路径若混用会静默丢子行（既有「批量 1:n 孤儿」的类型学根因）；统一 String() 归一化 |
| I-7 | IDSystem 表名字符串插值 | `SQLite.ts` L12–16 / `Mysql.ts` L10–14 | 实体名 setup 期已有正则校验，风险低；defense-in-depth 改占位符 |
| I-8 | `EntityQueryHandle` 入口对 matchExpression 形态零校验 | `EntityQueryHandle.ts` L29–42 | modifier 有校验（F8 修复），match 没有；畸形 match 深入到 SQL 构建才崩 |
| I-9 | `handleUpdateReliance` 消费 `newEntityData` 而非 `newEntityDataWithDep` | `UpdateExecutor.ts` L80–84 | 与既有「updateRecord 返回值遗漏 dependency」同源，修 F-3 时顺带对齐 |

### 4.2 runtime / builtins

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-10 | Attributive/Condition 返回非 boolean 非 string 的 truthy（1/{}）被当放行 | `BoolExp.ts` L442–444 | undefined 已拒、string 当错误信息，1/{} 静默 pass；与「必须显式返回 boolean」的既有契约不齐，`typeof result !== 'boolean'` 应统一拒绝 |
| I-11 | `createUserRoleAttributive({name: ''})` 得到恒真 attributive | `User.ts` L24–26 | 无 name 的「anyone」是有意设计（`createUserRoleAttributive({})` 全测试在用），但空字符串同样落进 anyone 分支是纯 footgun；`name === ''` 应抛声明期错误 |
| I-12 | `checkConceptAttributive` 把 BoolExp 失败折叠成泛化字符串 | `Interaction.ts` L486–487 | per-atom 错误信息被丢，payload 概念检查只报 `attributives check failed`；DX |
| I-13 | `getActivityCall(activityId)` 以定义 uuid 为键，参数名却暗示运行期 activity 记录 id | `ActivityManager.ts` L75–77, L188–190 | 用运行期 id 调用恒得 undefined；改名或双索引 |
| I-14 | `core/SideEffect` 与 `RecordMutationSideEffect` 双轨并存，前者 runtime 零消费 | `src/core/SideEffect.ts` | 两套「副作用」概念增加集成错误率；收敛或文档化分工 |
| I-15 | `asyncReturn` 调用只传 2 参，宿主 record 参数恒 undefined | `Scheduler.ts` L947, L1113 | Custom 包装器签名期望 (result, dataDeps, record)；对齐 arity 或修类型 |
| I-16 | `computeOldRecord` 对关联实体脏行返回 `{...newRecord}` 假冒 oldRecord | `Scheduler.ts` L457–462 | 已有 FIXME；消费方若读 oldRecord 拿到的是现值。文档化或置 undefined |
| I-17 | 全局 dataDep 扇出的批处理一错全断 | `Scheduler.ts` L548–562 | 单条 host 记录计算失败阻断同批其余 host 更新；fail-fast 可以，但爆炸半径应文档化 |
| I-18 | `trigger.oldRecord` 模式对 delete 事件永不匹配 | `ComputationSourceMap.ts` L248–252 | delete 事件通常只有 record；声明期校验或文档化 |
| I-19 | GlobalEvery/GlobalAverage 负计数守卫缺失 | `Every.ts` L110–111 / `Average.ts` L132–135 | r4 R-6.1 只修了 Property Average；六 handle 模板抽取（四轮遗留）应一并收编 |
| I-20 | property 聚合对 `relatedAttribute.length > 3` 一律 fullRecompute | `Count.ts` L205–214 等六处 | 深嵌套 attributeQuery 的增量路径直接放弃，SERIALIZABLE 下退化为全量重算/重试风暴；功能缺口非正确性问题 |
| I-21 | `finishMigration` 只存 `error.message`；`FrameworkError.causedBy` 未接 `Error.cause` | `MonoSystem.ts` L1461 / `FrameworkError.ts` L21 | 排障信息损耗 |

### 4.3 文档 / 测试矩阵缺口（本轮致命项的共同根因）

| 场景 | 现状 |
|------|------|
| filtered source × {Summation/Average/WeightedSummation/Count+callback} × 成员字段 update | **零覆盖** → F-1 |
| `dataPolicy.attributeQuery` 单独生效（caller 不传/传更宽） | 所有测试都同时传 caller attributeQuery → F-2 |
| update payload 携带 `&` 关系属性 | 仅 create 覆盖 → F-3 |
| `computed` 引用关系数据（create ref 形式 / update 无关字段） | 零覆盖 → F-4 |
| 大 IN / 畸形 between / 重复 ref / contains 非数组 | 零覆盖 → R-1/I-1/R-2/R-3 |
| 知识库示例代码 vs 真实 API 的 CI 级校验 | 无（`getValue` 漂移存活于 7 个指南）→ R-7 |
| filtered entity OR 谓词的 membership diff | 代码已实现（`FilteredEntityManager` L169–175 递归 OR），零测试 |
| `agentspace/knowledge/filtered-entity-cross-entity-limitation.md` | 声称不支持 cross-entity，实际已支持且有测试——文档过时 |

### 4.4 既有报告遗留项（仍有效）

r4 的 R-4（program group 语义）、R-5（initialState.computeValue 契约）、R-6.2/6.3、R-7（dictionary defaultValue 进 modelHash）、I-1~I-18；r3 的 R-4（asyncReturn advisory lock）、R-5（RealTime 时间调度器）、R-6（迁移终态 phase）、R-8；r2 的驱动类型映射、级联深度、async task 清理、合表事件完整性（本轮 storage 复查再次确认 `flashOutCombinedRecordsAndMergedLinks` / `relocateCombinedRecordDataForLink` 的内部行删除/插入不传 events——维持「先决策 mergeLinks 去留」）。**六聚合 handle 共享模板抽取**：本轮 I-19/I-20 又见两处漂移，五轮累计 12 个具体缺陷，这是全部遗留项中投入产出比最高的一项。

---

## 五、本轮证伪的候选与复查确认健康的区域

| 候选/区域 | 结论 |
|------|------|
| 「SQLite JSON contains 缺 `IS` 导致 SQL 语法错误」 | **证伪**：SQLite 语法接受 `expr NOT NULL` 后缀形态，`JSONfield.spec.ts` 在位且通过 |
| 「StateMachine delete 触发器静默失效」 | **证伪**（对关联记录删除的常规形态）：REPRO-F 实测 owner 删除后 pet.status 正确转移；宿主自身 delete 触发的 lock-miss skip 语义上合理（记录已不存在），仅建议文档化 |
| Attributive 返回 truthy **字符串** | 实测**被正确拒绝**（string 按错误信息处理，fail-closed）；仅 1/{} 形态漏网（I-10） |
| 守卫链 async BoolExp / 异常 fail-closed / not 反转安全 | `evaluateAsync` + 错误字符串语义健壮；`BoolExp.evaluate` 对 Promise 有显式拒绝 |
| dispatch 事务重试边界（effects 重置 / post-commit 门控 / listener 不叠加） | `transactionRetry.spec.ts` 覆盖，结构正确（除 R-6 的深拷贝缺口） |
| 空 IN / EXIST 占位符次序 / x:n fan-out 去重 / 长别名 | 既有回归测试在位 |
| filtered membership（computed 列 / 嵌套 / 级联 relation delete） | r3/r4 修复与矩阵测试在位；本轮 F-1 是 runtime 监听注册层的问题，storage 事件层健康 |
| 嵌套创建事件完整性 / 默认值 falsy（0/false/''）处理 | `preprocessSameRowData` 每嵌套记录发事件；defaultValue 用 `=== undefined` 判断，无 `\|\|` 陷阱 |

---

## 六、修复优先级建议

**P0（静默错误数据 / 权限失效，全部有复现可转回归）：**
1. F-1 filtered 聚合的 base 链监听注册——「文档承诺的模式 + 查询正确 + 聚合永久错」组合，影响面最大
2. F-2 `dataPolicy.attributeQuery` 生效（policy 上限语义）——数据暴露级
3. F-3 update 传递 `&` link 数据——静默数据丢失
4. F-4 `computed` 关系输入的声明期拒绝（可执行契约）

**P1（崩溃与运维死角）：**
R-1 IN 分片、R-2 重复 ref 幂等/明确错误、R-3 contains 类型防护、R-4 Scheduler.setup 原子切换、R-5 install 半途失败恢复路径、R-6 dispatch 深拷贝、R-8 sideEffects 结果聚合。

**P2（管线与契约）：**
R-7 知识库 `getValue` 全量修正 + Klass 未知参数 fail-fast（一次性根治此类漂移）、I-1~I-21、4.3 测试矩阵缺口补齐。

---

## 附录：复现测试代码（验证用，未提交为正式测试）

以下测试在 `1f848596` 上以 PGLiteDB/SQLiteDB 运行，结果如注释所示。修复时可改造为回归测试（断言改为正确语义）。

```ts
// F-1 (REPRO-A)：filtered Summation 对成员字段更新失明
const ActiveUser = Entity.create({ name: 'ActiveUser', baseEntity: User,
  matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }) })
Dictionary.create({ name: 'activeSalarySum',
  computation: Summation.create({ record: ActiveUser, attributeQuery: ['salary'] }) })
await storage.create('User', { isActive: true, salary: 100 })   // sum = 100 ✓
await storage.update('User', matchU, { salary: 200 })
// sum = 100 ❌（应为 200）；Count+callback 变体（REPRO-L）同样失明

// F-2 (REPRO-B)：dataPolicy.attributeQuery 零生效
const GetSecrets = Interaction.create({ action: GetAction, data: Secret,
  dataPolicy: DataPolicy.create({ attributeQuery: ['id', 'title'] }) })
await controller.dispatch(GetSecrets, { user, query: { attributeQuery: ['id','title','ssn'] } })
// → [{id, title, ssn: '123-45-6789'}] ❌

// F-3 (REPRO-E)：update 丢 & 关系属性
await storage.create('User', { teams: [{ id: t1.id, '&': { role: 'member' } }] })  // role ✓
await storage.update('User', matchU, { teams: [{ id: t2.id, '&': { role: 'lead' } }] })
// link 上 role 为空 ❌

// F-4 (REPRO-D2)：computed 关系输入静默翻转
Property.create({ name: 'inTech', type: 'boolean', computed: r => r.team?.type === 'tech' })
await storage.create('User', { name: 'A', team: { type: 'tech' } })  // inTech = true
await storage.update('User', matchU, { name: 'A2' })                 // 与 team 无关
// inTech = false ❌（静默持久化）

// R-1 (REPRO-G)：大 IN 崩溃
await storage.find('Item', MatchExp.atom({ key: 'n', value: ['in', Array.from({length: 40000}, (_,i)=>i)] }), undefined, ['id'])
// SQLite: "too many SQL variables" ❌

// R-2 (REPRO-H)：重复 ref 崩溃
await storage.update('User', matchU, { teams: [{ id: t1.id }, { id: t1.id }] })
// Error: cannot create ... link already exist ❌

// R-3 (REPRO-I)：contains 非数组 JSON
await storage.find('Doc', MatchExp.atom({ key: 'meta', value: ['contains', 'key'] }), undefined, ['id'])
// PG: cannot call json_array_elements_text on a non-array ❌

// R-7：getValue 静默丢弃（实测）
const p = Property.create({ name: 'fullName', type: 'string', getValue: r => r.a } as any)
// 'getValue' in p === false，p.computed === undefined —— 属性恒为 null，无报错
```
