# 全代码库深度 Review 报告（2026-07-09 第七轮）

> **维护说明（2026-07-09）**：本报告的致命项已在同分支（`cursor/deep-code-review-r7-77bc`）修复，回归测试见 `tests/runtime/review-fixes-2026-07-09-r7.spec.ts`（4 个用例）+ 修正的既有测试：
>
> - **F-1 / F-2（新发现，已复现）**：对称 n:n 关系（`source===target` 且 `sourceProperty===targetProperty`）的删除与 update 替换只清理「实体在 source 侧」的 link 行，实体在 target 侧的关系被漏删/漏 unlink——留下孤儿 link、对称 Count 偏高、新旧关系并存。修复：`DeletionExecutor.deleteNotReliantSeparateLinkRecords` 与 `UpdateExecutor.handleUpdateReliance` 对 `isLinkManyToManySymmetric()` 的 link 用 `source.id IN ids OR target.id IN ids` 匹配。
> - **F-3（新发现，已复现，数据暴露级）**：`dataPolicy.modifier` 浅合并只覆盖同名键，policy 声明 `limit` 时调用方仍可追加 `offset` 逐页翻取全表。修复：policy 声明了 `limit` 时锁定分页/排序键（`offset`/`orderBy`），调用方引入 policy 未声明的键即报明确错误。
> - **F-5（既有遗留，已确认仍在，已复现）**：`'program'` ActivityGroup 注册了类型但无完成语义，子分支跑完后 group 永久卡死、后续 transfer 不可达。修复：不再注册该死类型——`buildGraph` 的 `GroupStateNodeType.has()` 守卫对 `type:'program'` 抛清晰的「not supported」声明期错误（与 Gateway 一致的 fail-fast），而非运行时静默死锁。
> - **明确遗留（未修，建议独立处理）**：r5 的 R-1（大 IN 崩溃）、R-2（重复 ref 崩溃）、R-3（`contains` 非数组裸 DB 错误）本轮**复现确认仍然存在**；reliance 关系 `{rel: null}` 抛内部 assert；以及 r6 之后的其余 R/I 项。详见第三、四节。
>
> 修复后 `npm run check` 通过；`npm test` 全量 **1737 passed / 26 skipped**（基线 1733，净 +4；新增 4 个 r7 回归用例，修正 1 个编码了错误行为的对称删除测试与 1 个断言 `program` 为受支持类型的既有测试）。下文正文保留 review 时的原始判定。

- 日期：2026-07-09
- 基线：`main` @ `66cda53c`（PR #23 合入之后，r1–r6 的致命/重要修复全部落地）
- 范围：`src/core`、`src/runtime`（Scheduler/ComputationSourceMap/computations/事务）、`src/storage/erstorage`（删除/级联/对称关系/合表）、`src/builtins`（dispatch 守卫链 / Activity / data API）、`src/drivers`
- 方法：四路并行深度探查（死 API 与静默声明审计 / storage 删除与级联 / runtime 调度与计算语义 / dispatch 守卫链与 builtins）→ 人工精读交叉验证 → **对每个致命候选编写最小复现测试并实际运行**（PGLiteDB / SQLiteDB）。只有「已运行复现确认」的问题列为致命；仅凭精读判定的问题单独分级并标注置信度。数个候选经复现被证伪（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1733 passed / 26 skipped。

---

## 一、结论摘要

前六轮把 storage 读写主路径、增量计算边界、Activity/序列化、聚合一致性矩阵修到高度收敛。本轮纵深转向**对称关系的写路径**、**data API 的 modifier 语义**、以及**历史遗留的死类型与崩溃项的现状核实**。延续既往规律：新致命问题依然全部落在「**测试矩阵从未走过的合法声明组合**」——对称关系只测过「按 id 删除」和「实体在 source 侧」、`dataPolicy.modifier` 只测过固定 `limit`（从不追加 `offset`）。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 3 | 对称关系删除/update 漏删 target 侧 link、`dataPolicy.modifier` limit 可被 offset 绕过（数据暴露）、`'program'` ActivityGroup 静默死锁 |
| 遗留复现确认（仍存在，未修） | 3 | 大 IN 列表崩溃、n:n 重复 ref update 崩溃、`contains` 非数组 JSON 裸 DB 错误（均 r5 明确遗留） |
| 重要（精读，高/中置信度） | 若干 | StateMachine delete-trigger 静默 skip、`asyncReturn` record 参数恒 undefined、非 GetAction 的 `data`/`dataPolicy` 无效、独立 Interaction 的 `userRef`/Entity `itemRef` 静默不写、Klass 工厂未知参数静默丢弃等 |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 对称 n:n 关系删除实体时，只清理「实体在 source 侧」的 link 行，target 侧留孤儿

- 位置：`src/storage/erstorage/DeletionExecutor.ts` `deleteNotReliantSeparateLinkRecords` L250–263——匹配键固定为 `info.isRecordSource() ? 'source.id' : 'target.id'`。对称关系（`User.friends` 自反 n:n）中 `isRecordSource()` 恒为 true，只按 `source.id IN ids` 匹配。
- 根因：查询侧对称 OR（`MatchExp.buildFieldMatchExpression` + `spawnManyToManySymmetricPath`）没有被删除侧复用；对称关系里同一实体可能存在于某些 link 的 source 侧、另一些的 target 侧。
- 复现（实测输出）：`friends` 自反 n:n，`Count({record: friends})`。建 `(A,B)`（A source）与 `(C,A)`（A target），删 A：

```
删除 A 后残留 link: [{"source":{id:C},"target":{id:A}}]  ❌（应为空）
link delete 事件数：1                                     ❌（应为 2）
C.friendCount：1                                          ❌（应为 0，孤儿 link 让对称 Count 永久偏高）
```

- 影响：删除用户/节点后残留孤儿关系行、对称聚合计算永久偏高、下游 StateMachine/Transform 漏触发。「删除参与对称关系的一方」是最常规的操作（社交好友、双向连接）。
- 现有测试盲区：`manyToMany.spec.ts` 的对称删除用例**恰好只断言 1 条 delete 事件、且不查 DB 残留**——测试本身编码了错误行为。`symmetricRelation.spec.ts` 只测「按 id 删除」。
- 修复：`isLinkManyToManySymmetric()` 的 link 用 `source.id IN ids OR target.id IN ids` 匹配；同时修正 `manyToMany.spec.ts` 的错误断言为「2 条 delete 事件 + DB 无残留」。

### F-2 对称 n:n 关系 update 替换时，只 unlink「实体在 source 侧」的旧 link

- 位置：`src/storage/erstorage/UpdateExecutor.ts` `handleUpdateReliance` L186–197（`updateSameRowData` L128–143 同构）——unlink 匹配 `${updatedEntityLinkAttr}.id = matchedEntity.id`，方向固定。
- 复现（实测输出）：建 `(C,A)`（A 在 target 侧），`update('User', A, { friends: [{id: B}] })`：

```
A.friends after replace: ["B","C"]  ❌（应为 ["B"]——旧的 (C,A) 未被 unlink，新旧并存）
```

- 影响：update 是 replace 语义，但对称关系的旧边未清理，产生脏数据（对称 OR 查询下双向可见）。
- 现有测试盲区：`relationAttributes.spec.ts` 的 `friends`/null 用例全部从 source 侧建链。
- 修复：与 F-1 同族——对称 link 用 `source.id = id OR target.id = id` 匹配 unlink。

### F-3 `dataPolicy.modifier` 的 `limit` 可被调用方追加 `offset` 绕过（数据暴露级）

- 位置：`src/builtins/interaction/Interaction.ts` `retrieveData` L552——`const modifier = { ...caller, ...fixedModifier }`。浅合并只覆盖**同名键**：policy 声明 `{ limit: 3 }` 时，caller 传 `{ offset: 3/6/9… }` 会被完整保留。
- 复现（实测输出）：`dataPolicy: { modifier: { limit: 3 } }`，seed 10 条，循环 `query.modifier.offset = page*3`：

```
用 policy limit 3 通过分页翻取到的去重记录数：10  ❌（应 ≤ 3）
```

- 影响：与 r5 F-2（`attributeQuery` 可被绕过）同族的**数据暴露**——交互作者用 `dataPolicy.modifier.limit` 做「最多返回 N 条」授权，任何调用方可翻页取走全表。`attributeQuery` 在 r5 已 policy-wins，`modifier` 的分页键却仍是 caller 全权。
- 现有测试盲区：`queryDataInteraction.spec.ts` 只测固定 `limit`，从不追加 `offset`。
- 修复：policy 声明了 `limit` 时锁定分页/排序键组——调用方引入 policy 未声明的 `offset`/`orderBy` 即抛明确错误。（`match`/`attributeQuery` 已是 policy-wins，本次补齐 `modifier` 的分页语义。）

### F-5 `'program'` ActivityGroup：注册了类型但无完成语义，activity 永久卡死（r4/r5/r6 遗留，本轮确认仍在并修复）

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` L470–472——`ProgrammaticActivityStateNode` 空类注册进 `GroupStateNodeType`，`onChange` 为空（对照 `every`/`any`/`race` 都在 `onChange` 里调用 `complete()`），无任何程序化 `complete()` 入口。
- 复现（实测输出）：`ActivityGroup.create({ type: 'program', activities: [...] })` 作为流程一环，head→group→after：

```
dispatch after → error: "interaction ... not available"  ❌（group 永不完成，after 永不可达）
```

- 影响：合法声明 `type: 'program'` 的 activity 在运行期静默死锁，与 r4 首次记录、历轮均列为「明确遗留」。这是「类型系统接受但运行时不可用」的死路径，与已被 fail-fast 的 Gateway 同性质。
- 修复：不再注册 `'program'`——`buildGraph` 的 `GroupStateNodeType.has()` 守卫对该类型抛清晰的声明期错误「ActivityGroup type "program" ... is not supported. Supported types: 'any', 'every', 'race'.」，而非运行时死锁。若将来要支持程序化完成的 group，需同时实现 `onChange`/`complete` 入口与测试后再注册。

---

## 三、遗留问题复现确认（r5 明确遗留，本轮实测仍然存在，未修）

用户要求核实历史报告遗留项是否仍存在。以下三项 r5 报告已列为「明确遗留、建议独立 PR」，本轮编写复现在 `66cda53c` 上实测**全部仍然崩溃**：

| 编号 | 现象（实测） | 位置 |
|------|------|------|
| r5-R-1 | `find(..., ['in', 40000 个值])` → SQLite `too many SQL variables` | `MatchExp.ts` L256（`IN` 每元素一占位符，无分片） |
| r5-R-2 | `update('User', …, { teams: [{id:t1},{id:t1}] })` → `cannot create ... link already exist` | `CreationExecutor.ts` L437 `assert(!existRecord)`，`handleUpdateReliance` 无去重 |
| r5-R-3 | `type:'object'` 属性 + `['contains','key']` → `cannot call json_array_elements_text on a non-array` | `PGLite.ts` L206 / `PostgreSQL.ts` L349 |

均为「合法输入 → 崩溃于内部断言或裸 DB 错误」，非静默错值，用户可观测。本轮按前几轮既定分工不合并修复（避免 PR 过大），此处仅提供复现坐标以供独立 PR 直接转回归。

此外，以下更早遗留项经代码核对**结构仍在**：
- `'program'`（本轮已修，见 F-5）；
- reliance 关系 `{rel: null}`：`DeletionExecutor.unlink` L297 `assert(!linkInfo.isTargetReliance, 'cannot unlink reliance data, ...')`——`update('User', …, { item: null })`（`item` 为 1:1 reliance）抛内部 assert（见第四节 I-1）；
- 六聚合 handle 模板抽取（r1 I-1 起至今，累计十余处漂移）；`asyncInteractionContext`（r1 R-8）；RealTime 无时间调度器（r3 R-5）；合表内部行删除/插入不传 events（r2 I-7~I-9）——均维持既往结论。

---

## 四、重要问题与显著改进（精读判定，附代码坐标）

### 4.1 storage / 删除路径

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | reliance 关系 `{rel: null}` 抛内部 assert | `DeletionExecutor.ts` L297；`UpdateExecutor.updateSameRowData` | `update(owner, { reliance: null })` 命中 `cannot unlink reliance data`。语义上 reliance = 所有权（只能随 owner 删除）可接受，但对合法形态的 payload 抛**内部**断言、消息含物理 linkName，是 DX footgun。建议入口给业务级错误或明确文档化「reliance 只能随记录删除」 |
| I-2 | 对称反向 endpoint 显式 delete/add 不识别等价边 | `EntityToTableMap.spawnManyToManySymmetricPath`（仅实体路径生效）、`CreationExecutor.addLink` L427 | `delete(linkName, {source:B, target:A})` 在存储为 `(A,B)` 时找不到行；`addLink(B,A)` 在已有 `(A,B)` 时可能报 `link already exist`——与查询双向可见矛盾。与 F-1/F-2 同根，link 级操作未做对称归一化 |
| I-3 | 跨关系路径 `storage.delete(matchExpression)` 几乎无回归 | `DeletionExecutor.deleteRecord` L46–53 | 读路径六轮已修，删除路径的复杂 match（`team.type='x'`）无独立验证 |
| I-4 | 合表内部行删除/插入不传 events | `RecordQueryAgent.ts` L137/L227（`flashOutCombinedRecordsAndMergedLinks`/`relocateCombinedRecordDataForLink`） | r2 遗留，维持「先决策 mergeLinks 去留」 |

### 4.2 runtime / computations

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-5 | StateMachine 宿主 `delete` 型 trigger 在 incrementalCompute 中 `lock` 失败即静默 skip | `StateMachine.ts` L256–262 | 声明 `trigger:{type:'delete', recordName:Host}` 的转移永远写不回（记录已删，`lockRecord` 返回 undefined → `skip()`）。r5 曾对「关联记录删除触发」证伪，但**宿主自身 delete 作 trigger** 仍是死路径；建议声明期拒绝或文档化 |
| I-6 | `asyncReturn` 只传 2 参，宿主 `record` 恒 undefined | `Scheduler.ts` L1002 vs `Custom.ts` L130–138 | property 级 Custom 的 `asyncReturn(result, dataDeps, record)` 第三参永远拿不到；r5 I-15 的再确认 |
| I-7 | global dict fan-out 合成事件 `oldRecord === record`（同引用） | `Scheduler.ts` L523–536 | membership enter/left 判定的 old/new 恒等，带 `records` match 的 property 增量在 global 变更驱动下可能误判；中置信度，未复现出错值 |
| I-8 | StateMachine 单事件单跳，不支持 transfer 链（A→B 同事件再 B→C） | `TransitionFinder.findNextState` | 同一 mutation 命中链式转移只执行第一跳；建议文档化 |
| I-9 | 同批 property 计算无拓扑序（S1 遗留） | `Scheduler.ts` L70–87 注册顺序=声明顺序 | 本轮实测：`dataDeps` 引用同记录另一 computed 字段时，因内层 update 会重新入队，最终值收敛正确（见第五节证伪）；但仍无显式拓扑保证，深链/多跳仍是隐患 |

### 4.3 builtins / 死 API 与弱校验

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-10 | 非 GetAction 的 Interaction 上声明 `data`/`dataPolicy` 完全无效 | `Interaction.ts` L162–164（仅 GetAction 绑定 `retrieveData`） | 合法声明静默失效；建议声明期校验「`data`/`dataPolicy` 仅 GetAction 有意义」 |
| I-11 | 独立（非 Activity）Interaction 上声明 `userRef` 永不写入 | `Interaction.ts` L124；仅 `ActivityCall.saveUserRefs` 消费 | 后续 `isRef` attributive 在 activity 外抛错，声明诱导误用 |
| I-12 | `PayloadItem.itemRef: EntityInstance` 静默不保存 | `PayloadItem.ts` L14（类型允许 Entity）；`ActivityCall.ts` L394 仅 `Attributive.is` 分支 | 类型系统接受、运行期忽略 |
| I-13 | 全 Klass 工厂对未知 create 参数静默丢弃（无 fail-fast） | 各 `static create`（如 `Property.ts` L37–45） | r5 R-7（`getValue`）的系统性根因；建议按 `Klass.public` 键表对未知参数告警/抛错，一次性根治此类漂移 |
| I-14 | payload 弱校验矩阵 | `Interaction.ts` L400–432、L506–508 | `required:false` + 显式 `null` 被拒（非缺省）、`isCollection` 空数组 vacuous 通过、非 isRef Entity payload 接受任意对象——r2/r4 遗留族的延续 |
| I-15 | 死代码 / 仅序列化字段 | `Activity.events`+`Event`、`core/SideEffect`、`Controller.globals`、`findRootActivity()`（恒 null）、`Attributive.stringContent`、`Dictionary.args`、`Transfer.name` | 零运行时消费；建议收敛或标注 deprecated，减少表面积 |

---

## 五、本轮证伪的候选与复查确认健康的区域

| 候选/区域 | 结论 |
|------|------|
| property 计算链**反向声明顺序** + 同批 update（H1 候选） | **证伪**：实测 `priceDescription`（声明在前）依赖 `finalPrice`（声明在后），update `discount` 后两者最终都正确（`finalPrice=50`、`priceDescription='final:50'`）——内层 update 事件会让下游重新入队收敛。仍建议补显式拓扑（I-9） |
| `dataPolicy.match` 返回 null/undefined | **既定语义**（非 bug）：`queryDataInteraction.spec.ts` 明确断言「返回 null = 不加额外过滤」；曾误列为 fail-closed 候选，已撤回 |
| 非对称 n:n / 1:1 / 1:n 的删除、update replace、`{rel:null}`（非 reliance） | 复查健康：`relationAttributes.spec.ts`/`oneToOne`/`oneToMany` 覆盖在位 |
| 对称关系**查询**（双向可见）、按 id 删除、Count 增量 | 健康：`symmetricRelation.spec.ts`/`manyToMany.spec.ts` 查询与 id 删除路径正确；本轮 F-1/F-2 是实体级删除/update 的方向缺陷 |
| 聚合一致性矩阵（r6 的 700+ 断言）、filtered membership 矩阵 | 全绿，r3–r6 修复扎实 |

---

## 六、修复优先级建议

**已在本轮修复（P0，全部有回归）：** F-1/F-2 对称关系删除与 update 的双侧匹配、F-3 `dataPolicy.modifier` 分页锁定、F-5 `'program'` ActivityGroup fail-fast。

**建议独立 PR（P1，已复现仍崩溃）：** r5-R-1 大 IN 分片、r5-R-2 重复 ref 幂等/明确错误、r5-R-3 `contains` 类型防护。

**建议独立 PR（P2，契约与债务）：** I-1 reliance null 业务级错误、I-2 对称 link 级操作归一化、I-5 StateMachine delete-trigger 声明期拒绝、I-10~I-13 死 API/未知参数 fail-fast（含 Klass 工厂一次性根治）、六聚合 handle 模板抽取（累计遗留最久、投入产出比最高）。

---

## 附录：复现要点（验证用）

```ts
// F-1：对称 n:n 删除漏 target 侧（PGLite）
// friends 自反 n:n；(A,B) A source, (C,A) A target；delete A
// → 残留 (C,A) ❌；link delete 事件 1 条 ❌；C.friendCount=1 ❌   [已修：残留 0 / 2 事件 / count 0]

// F-2：对称 n:n update replace 漏 target 侧
// (C,A) A target；update A { friends:[B] }
// → A.friends = [B,C] ❌   [已修：= [B]]

// F-3：dataPolicy.modifier limit 被 offset 绕过
// dataPolicy:{ modifier:{ limit:3 } }；循环 query.modifier.offset=page*3
// → 取到 10 条 ❌（数据暴露）   [已修：追加 offset 报错，≤3]

// F-5：program ActivityGroup 死锁
// ActivityGroup.create({type:'program', activities:[...]})；head→group→after
// → dispatch after: "interaction not available" ❌   [已修：声明期抛 not supported]

// 遗留仍在（未修，r5 R-1/R-2/R-3）
storage.find('I', {n:['in', Array(40000)]})            // SQLite: too many SQL variables ❌
storage.update('U', m, { teams:[{id:t1},{id:t1}] })    // link already exist ❌
storage.find('D', { meta:['contains','key'] })         // json_array_elements_text non-array ❌
```
