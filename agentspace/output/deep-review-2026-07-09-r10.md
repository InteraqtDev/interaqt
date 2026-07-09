# 全代码库深度 Review 报告（2026-07-09 第十轮）

- 日期：2026-07-09
- 基线：`main` @ `9eabcab6`（v2.0.1，r1–r9 的致命/重要修复全部落地）
- 范围：四路并行深度探查历史盲区——storage 写路径冷区与 r9 守卫的绕过面 / runtime 调度与 aggregationTemplate / builtins 执行链与 core 声明校验 / drivers 与 migration 纵深、打包导出面
- 方法：与 r1–r9 报告**逐条去重**（四路探查候选中约三分之一为既有遗留项的重复发现，已剔除）→ 对每个致命/重要候选**编写最小复现测试实际运行**（PGLiteDB）。只有「已运行复现确认」的问题列为致命/重要；复现失败或代码证伪的候选明确记录（见第五节）。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1780 passed / 26 skipped。

> **维护说明（2026-07-09）**：本报告的致命项与重要项已在同分支（`cursor/deep-code-review-r10-f03a`）全部修复。回归测试：`tests/storage/review-fixes-2026-07-09-r10.spec.ts`（8 用例）+ `tests/runtime/review-fixes-2026-07-09-r10.spec.ts`（7 用例）。修复后 `npm run check` 通过；`npm test` 全量 **1795 passed / 26 skipped**。顺带修正 7 处被新 fail-fast 暴露的既有测试反模式（详见 F-2 的「测试矩阵连带修正」）。

---

## 一、结论摘要

经九轮修复，读写主路径、聚合增量、对称关系、filtered/merged 编译、Activity 状态机、migration 均已高度收敛。本轮的新致命项延续既往规律，且进一步向两类收缩：

1. **共享命名空间里的静默丢弃/污染**（r9 主题的直接延续）——merged input 视图共享物理表属性命名空间导致的跨视图列污染，以及所有写入口对未声明键的静默丢弃（r9 报告第七节明确预告的「下一个模板化目标」，本轮落地）。
2. **声明合法、永不可用的死路径**——空 ActivityGroup（声明期零告警 → 运行期永久死锁）、json 字段等值匹配（写路径序列化 / 读路径不序列化的不对称）。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修） | 3 | 空 ActivityGroup 死锁、merged 跨 input 属性污染 + 未知键静默丢弃、json 字段 =/!= 匹配断裂 |
| 重要（已复现，已修） | 6 + 文档 1 | 见第三节 |
| 证伪 | 4 | 见第五节 |
| 重要（精读/探查，高置信度，未修） | 9 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认，本轮已修复）

### F-1 `activities: []` 的空 ActivityGroup：进入即永久死锁，声明期零告警

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` `buildGraph`（原先不校验 group 子分支数）；`InteractionState.createInitialState` 对空 childSeqs 生成 `children: []`；`Every/Any/Race` 的完成语义全部由子分支 `transferToNext → parent.onChange` 触发。
- 复现（实测输出）：`start → emptyGroup(type:'every') → end`，dispatch start 成功进入 group 后：

```
dispatch end → Error: interaction id_29 not available   ❌ 永久不可达（无任何子分支能触发 onChange）
```

- 影响：与 r4 F-1（group 作起点栈溢出）、r7 F-5（`program` 类型无完成语义）同族——「类型系统接受但运行时死锁」的 Activity 图形态。`isGroupCompleted()` 对空集 vacuous true，但没有任何入口会调用它，activity 卡死且无任何错误。
- 修复：`buildGraph` 对 `!group.activities?.length` 声明期抛出「empty group can never complete, the activity would deadlock」。

### F-2 merged input 视图的跨 input 属性写入静默污染 + 全写入口未知键静默丢弃

两个问题同根（`groupAttributes` 只挑 map 认识的键、其余静默忽略；merged 编译把全部 input 属性合并进物理 base 的共享 attributes 表），一并修复。

- 位置：`src/storage/erstorage/MergedItemProcessor.ts` `mergeProperties`（全部 input 属性并入物理 base）；`EntityToTableMap.groupAttributes`（未知键静默跳过）；`EntityQueryHandle` 各写入口（此前仅有 r9 的 `__type` 判别列校验）。
- 复现（实测输出）：

```
// vendorCode 仅声明在 Vendor input 上：
create('Customer', { name:'c', level:'g', vendorCode:'SHOULD-NOT-BE-HERE' })
→ 静默落库，Customer 视图读回携带 vendorCode          ❌ 跨视图列污染

// 拼写错误：
create('User', { nmae: 'Alice' }) → 无报错，读回只有 id  ❌ 零告警数据丢失
```

- 影响：前者是 r9 F-2/F-4「共享命名空间静默覆盖」家族的最后一个成员——input 视图声明面之外的列被静默写入，Vendor 视图的列被 Customer 名义的写入污染；后者是 r7 I-13（Klass 工厂未知参数静默丢弃）的 storage 版，r9 报告第七节已明确列为「下一个模板化目标」。
- 修复（一个统一的写入口校验 `EntityQueryHandle.validateWritePayload`，吸收 r9 的判别列校验）：
  1. 未知键（不在 record attributes 表内）一律 fail-fast，错误信息附声明面清单；
  2. merged input 视图按「声明面」裁剪：`MergedItemProcessor` 在 rebase 前沿 base 链收集各 input 名下可写属性集合（含 commonProperties 同名再声明与 bound-state 注入列）→ `DBSetup` 写入 `RecordMapItem.writablePropertyNames` → 写入口对 value 属性校验归属；
  3. **携带 id 的嵌套 ref 载荷豁免**未知键/归属检查（ref 的语义是「按 id 建立关系」，快照残留字段被写路径显式忽略；把 `event.user` 等完整记录对象直接用作关系端点是既有合法形态）；`_rowId` 出现在框架返回的记录上，round-trip 回写保持合法。判别列检查对 ref 同样生效。
- 测试矩阵连带修正（新 fail-fast 暴露的既有反模式，7 处）：`activity.spec` 写未声明的 `roles`（guard 检查的是内存 user 对象，改为内存补齐）；`every.spec` 写错属性名 `everyRequestHandled`（实为 `everyRequestHasTwoItems`，**真实拼写错误**，此前静默丢弃侥幸通过）；`transformInteraction.spec` 写未声明的 `age`；`symmetricRelation.spec` 写未声明的关系属性 `level`；`longColumnNames.spec` 把关系属性内联在 ref 对象上（正确形态是 `'&'`，此前被静默丢弃且测试从未断言其持久化）；`versionControlHardDeleteExample2.spec` 两处 Transform 回调用 `{...style}` 展开把源实体的 `_isDeleted_` / bound-state 列带进目标实体载荷（改为显式拷贝声明面）。

### F-3 json/collection 字段的 `=` / `!=` 匹配：写路径序列化、读路径不序列化——PG 系裸数据库错误，文本型存储恒零命中

- 位置：`src/storage/erstorage/MatchExp.ts` `getFinalFieldValue` simpleOp 分支（参数原样绑定）；对照 `SQLBuilder.prepareFieldValue`（INSERT/UPDATE 一律 `JSON.stringify`）；各驱动 `parseMatchExpression` 只处理 `contains`。
- 复现（实测输出）：

```
Property.create({ name:'tags', type:'string', collection:true })
create('Doc', { tags:['x','y'] })
find('Doc', MatchExp.atom({ key:'tags', value:['=', ['x','y']] }))
→ PGLite: error: operator does not exist: json = unknown   ❌ 裸数据库错误
→ SQLite: （参数为 JS 数组，文本比较恒不等）零命中          ❌ 静默错误结果
```

- 影响：json 列的全链路是「写 stringify / 读 parse / 匹配裸绑定」，三方不对齐。`contains` 之外的等值匹配（如按 tag 集合精确查、按 object 字段快照查）完全不可用，且 SQLite/MySQL 上是静默零命中而非报错。
- 修复：`MatchExp` 对 json 字段的 `=`/`!=` 先给驱动方言机会、否则退化为与写路径一致的序列化文本比较；PG/PGLite `parseMatchExpression` 新增 `::jsonb` 语义相等比较（键序不敏感），MySQL 新增 `CAST(? AS JSON)`。NULL 行不参与 `=`/`!=` 匹配，与标量列语义一致。PGLite 与 SQLite 双驱动回归用例。

---

## 三、重要问题（已复现，本轮已修复）

### R-1 StateMachine `computeTarget` 端点形态缺 id：静默 skip，转移无声失效

- 位置：`src/runtime/computations/StateMachine.ts` `normalizeComputeTargetResult` L107–109——端点双重循环里 `if (!source?.id || !target?.id) continue`，与同函数「无法识别形态一律 fail-fast」的注释和 L119 的 `ComputationProtocolError` 直接矛盾。
- 复现：relation 宿主 property StateMachine，`computeTarget` 返回 `{source:{}, target:{id}}` → 实测 flag 永远停在 `idle`，零报错。
- 修复：端点形态中缺 id 一律抛 `ComputationProtocolError`（消息指明缺的是 source 还是 target，并说明「显式 skip 请整体返回 undefined」）；正确端点形态的转移有正向回归用例。

### R-2 `Conditions.create({})` / `Attributives.create({})` 挂上守卫链：每次 dispatch 抛 BoolExp 内部错误

- 位置：`src/builtins/interaction/Interaction.ts` `checkCondition`（`new BoolExp(content)`）/ `checkUser`（`BoolExp.fromValue(content!)`）；`Conditions/Attributives` 的 `content` 声明为 optional。
- 复现：`dispatch → Error: BoolExp raw data cannot be undefined`（fail-closed 但与声明处完全脱节）。
- 修复：`Interaction.create` 声明期校验 conditions/userAttributives 容器必须有 content；`checkConceptAttributive`（payload 概念检查路径）对空 content 返回业务级错误信息。`Conditions.create({})` 本身保持合法（序列化 round-trip 测试在用），只在挂上守卫链时拒绝。

### R-3 `Relation.create` 不校验 `type`：畸形值静默流入 `relType.split(':')`

- 复现：`type:'bogus'` → setup 成功、create 成功，基数语义完全未定义（实测按某种默认行为建了表）。
- 修复：`type` 白名单 `'1:1' | '1:n' | 'n:1' | 'n:n'`（filtered/merged relation 的 type 继承自 base/inputs，不受影响）。

### R-4 filtered entity/relation 声明 `baseEntity/baseRelation` 但无 `matchExpression`：裸 TypeError

- 复现：`Entity.create({ name:'AllUsers', baseEntity: User })` → setup/查询抛 `Cannot read properties of undefined (reading 'and')`。
- 修复：声明期 fail-fast（`Entity.create` / `Relation` 构造器 filtered 分支）。内部管线（merged rebase、transformMergedItem）全部携带 matchExpression 或在 create 后赋值，不受影响。

### R-5 match/attributeQuery 路径越过值属性继续深入：裸 TypeError

- 位置：`src/storage/erstorage/EntityToTableMap.ts` `computeInfoByPath`——值属性使 `currentEntity=''`，下一段对 `records['']`（undefined）取 `attributes` 直接 TypeError。
- 复现：`MatchExp.atom({ key:'owner.name.extra', ... })` → `Cannot read properties of undefined (reading 'attributes')`。
- 修复：给出指明路径与违规段的明确错误（`"name" is a value attribute and cannot be traversed further`）。

### R-6 同一 source 的多条 Transfer：后写静默覆盖先写

- 位置：`ActivityCall.buildGraph`——每个节点单 `next` 指针，`sourceNode.next = targetNode` 无重复检测；部分双出边图形（如 A→B、A→C、B→D、C→D）能通过 start/end 唯一性校验，构建出与声明不一致的图。
- 修复：重复出边声明期抛错，指引用 ActivityGroup 建模分支。

### K-1 知识库：驱动导入路径教错（npm 消费者照抄即失败）

- 位置：`agent/agentspace/knowledge/usage/18-api-exports-reference.md`（把 `PGLiteDB` 等列在主包 import 清单里）、`usage/13-testing.md` 两处测试模板。
- 事实：r4 F-3 把驱动拆到 `interaqt/drivers` 子入口后主包不再导出驱动（`src/index.ts` 实测无驱动导出），文档未同步——这些文件是代码生成管线的模板，与 r5 R-7 / r9 K-1 同性质的管线级污染。
- 修复：三处改为 `import { PGLiteDB } from 'interaqt/drivers'` 并在「Database Drivers」注记子路径。顺带修正 `Scheduler.ts` 错误消息拼写（"shuold not has" → "should not have"）。

---

## 四、重要问题（探查/精读判定，高置信度，本轮未修）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | 迁移阶段顺序：`recomputeFilteredMemberships` 先于 computation 重算，谓词依赖「本轮将重算的 computed 列」时基于旧值/NULL 产出错误成员资格事件 | `migration.ts` L3346–3404、`Controller.ts` L480–485 | 需要「谓词变更 + 同批 computation 变更」组合触发；建议成员资格 diff 延后到依赖列重算之后，或对该组合 fail-fast 要求分两次迁移 |
| I-2 | merged 家族**移除 input**：物理表/判别列不变、无 blocking，存量 `__type='X'` 行成为声明式 API 不可达的孤儿数据 | `migration.ts` `getStorageBlockingChanges`（无 merged/input 专项） | 与 r9 F-4 正交（写侧已堵、声明收缩侧未审阅）；需要产品决策（blocking + 显式数据处置 or 文档化） |
| I-3 | MySQL legacy `__interaqt_migration_log` 升级：`ADD COLUMN IF NOT EXISTS` 为 PG 语法，MySQL 上 ALTER 失败被空 catch 吞掉，后续 `beginMigration` 在远离根因处硬错 | `MonoSystem.ts` L1311–1328 | 按驱动分支或探测列存在性 |
| I-4 | PGLite 与 PostgreSQL 的 entity `id` 策略根本不同（UUID+uuidv7 vs INT+sequence），同一模型无跨驱动迁移路径且未文档化 | `PGLite.ts` L10–12 / `PostgreSQL.ts` L83–94 | manifest 的 fieldType 差异会 blocking（fail-closed），但「测试 PGLite / 生产 PG」是被知识库推荐的组合，语义鸿沟应显式文档化 |
| I-5 | Global StateMachine 的 `initialState.computeValue` 在 setup 期收到 `event=undefined`，与 property 路径（传入 create record）不对称、契约未声明 | `StateMachine.ts` `getInitialValue` / `Scheduler.ts` `setupGlobalComputationDefaultValue` | 文档化或对齐 |
| I-6 | global dict 扇出合成事件 `oldRecord` 仅顶层浅拷贝，嵌套对象与 `record` 共享引用——用户 incremental 回调 in-place 修改会反向污染 | `Scheduler.ts` L527–536 | 已知「顶层同引用」问题（r7 I-7）的嵌套版；深拷贝或文档化「事件快照只读」契约 |
| I-7 | property 级聚合（targetPath 非空）不经过 `resolveFilteredUpdateEvent` 同批去重守卫，filtered relation 端点的成员资格+字段更新同批时口径弱于 global 路径 | `Scheduler.ts` L433–441 / `aggregationTemplate.ts` L358–448 | 多数路径有 findOne 失败→fullRecompute 兜底；守卫对称化 |
| I-8 | group-head Activity 多个分支 head 都不带 activityId dispatch：各自 `create()` 出独立 activity 实例，流程状态分裂 | `ActivityManager.ts` L105–111 / `ActivityCall.isActivityHead` | r4 测试已固化「第二个 head 必须传 activityId」的用法，但不阻止误用；建议 head 集合中第一个之外的裸 dispatch 给出警告性错误或文档化 |
| I-9 | 以 merged **union 名**（如 `Contact`）update 携带 input 特有属性仍不受 F-2 归属校验（union 名可匹配到任意 input 的行） | `EntityQueryHandle.validateWritePayload`（writablePropertyNames 只登记在 input 视图名上） | union 名的合法写入面是 commonProperties；收紧需评估「按 id 跨类型更新公共字段」的既有用法，本轮保守未动 |

## 五、本轮证伪的候选

| 候选 | 证伪依据 |
|------|----------|
| 「merged base 与 1:1 伙伴合表时部分删除把 `__type` 置 NULL = 判别列腐蚀」（storage 探查 C-1） | 实测：`delete('Customer')` 后 Customer/Vendor/Contact 视图均查不到该行、Extension 伙伴数据完整保留——`__type IS NULL` 恰是「merged 实体已删、伙伴列保留」的正确表达，无腐蚀 |
| 「`interaqt/drivers` 的 types 路径与构建产物不一致」（drivers 探查 I-1） | 实测 `npm run build`：vite-plugin-dts `rollupTypes:false` 按源码结构产出 `dist/drivers/index.d.ts`（与 `package.json` exports 一致），同时 `insertTypesEntry` 产出 `dist/drivers.d.ts`，双路径均存在 |
| 「filtered base 指向 merged entity 应声明期拒绝」（builtins 探查 I-3） | 这是有意设计：`SeniorStaff`（filtered over merged）作为**查询视图**完全合法（现有测试断言其可查询），仅 create 因无法确定具体 `__type` 被拒（r9 已有明确错误）。声明期全面拒绝会误伤合法查询视图 |
| 「`defaultValue` + `computation` 并存静默接受」（builtins 探查 I-4） | 实测 setup 期已有 fail-fast（`Scheduler.ts` L339 assert），消息明确指向宿主与属性名；仅拼写错误，已顺带修正 |

## 六、既有遗留项复确（r2–r9 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4 I-1）；`!=` 三值逻辑；dispatch 先持久化事件再 resolve 的时序（r9 I-2）；Condition/Attributive 非 boolean truthy 放行（r9 I-4）；payload 弱校验族 / `userRef` / `itemRef` 死 API（r7）；StateMachine 单事件单跳 / 宿主 delete-trigger 静默 skip（r7）；Transform 身份 =（sourceRecordId, transformIndex）二元组的重排语义（契约限制）。
- **性能/资源**：global dict 变更宿主全表扫描；async task 表只增不减；级联无深度上限；迁移锁无租约；property 聚合 relatedAttribute>3 一律 fullRecompute。
- **并发**：activity `refs` 无版本 read-modify-write（r5 I-12/r10 复确，stateVersion CAS 不覆盖 refs）。
- **migration**：rename = remove+add（r9 I-3）；dictionary defaultValue 不进 modelHash（r4 R-7）。
- **filtered/merged 功能空洞**：base 宿主 property 聚合无法引用 filtered 变体端点 relation（r9 I-1）。

## 七、修复优先级建议（遗留项）

1. **I-1 迁移阶段顺序**——唯一可能产出「静默错误聚合值」的未修项，虽然触发组合窄，但一旦命中无自愈路径；
2. **I-2 merged input 移除的孤儿数据**——与 I-1 同属「声明演化 × merged/filtered」象限，r8–r10 三轮证明这个象限是致命问题的持续产地；
3. I-8 多 head 裸 dispatch 分裂 + I-9 union 名写入面——Activity/merged 的「误用防护」收尾（改动小）；
4. I-5/I-6 事件与初值契约文档化（与 r9 K-1 的「Mutation event snapshots」小节合并扩展）。

## 附录：复现要点（验证用）

- F-1：`ActivityGroup.create({type:'every', activities: []})` 入图 → `new ActivityManager` 应抛 deadlock 错误。
- F-2：merged input 名下写兄弟 input 特有属性 / 任意名下写拼写错误键 → 应抛归属/未知键错误；`{...snapshot}` ref 载荷与 `_rowId` round-trip 应通过。
- F-3：collection 属性 `['=', ['x','y']]` 匹配 → PGLite/SQLite 均应正确命中；`!=` 不含 NULL 行。
- R-1：`computeTarget` 返回 `{source:{}, target:{id}}` → 应抛 `endpoint form whose source has no id`。
- R-2：`Interaction.create({conditions: Conditions.create({})})` → 应抛声明期错误。
- R-4：`Entity.create({baseEntity})` 无 matchExpression → 应抛声明期错误。
- R-5：`key:'owner.name.extra'` → 应抛 value-attribute 路径错误。
- R-6：同 source 两条 Transfer → 应抛 multiple transfers 错误。
