# 全代码库深度 Review 报告（2026-07-11 第十九轮）

- 日期：2026-07-11
- 基线：`main` @ `ca6d9d03`（v4.0.0，r1–r18 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **1896 passed / 26 skipped**
- 范围：四路并行深度探查（builtins 交互管线 / storage 查询编译与执行 / storage 写路径与 Setup / runtime 调度与增量计算 / core+drivers+migration）+ 对全部致命候选**亲自编写最小复现实际运行**（PGLiteDB）
- 方法：与 r1–r18 全部报告逐条去重；每个候选先做代码路径二次追踪，再以运行时复现定谳（本轮 1 项候选被复现证伪，见第四节）。「已复现确认」才列为致命/重要。
- 修复状态：**三个致命项 + 一个重要项已在本分支（`cursor/deep-code-review-r19-583e`）全部修复**，回归固化于 `tests/core/boolexp.spec.ts`（De Morgan 真值表组）、`tests/runtime/review-fixes-2026-07-11-r19.spec.ts`（6 用例）与 `tests/storage/review-fixes-2026-07-11-r19.spec.ts`（3 用例）。修复后 `npm run check` 通过，`npm test` 全量通过（含新增回归）。

---

## 一、结论摘要

r1–r18 十八轮修复后，聚合增量一致性、对称关系、filtered 成员资格、migration 签名、写路径三拓扑等高风险面已高度收敛。本轮最重要的发现是**一个存在了十九轮都没被抓到的核心权限 bug**：

1. **`BoolExp.evaluate`/`evaluateAsync` 的 `NOT` 不贯穿 `AND`/`OR` 子树**（F-1）——`NOT(A OR B)` 静默退化成 `A OR B`。由于 Interaction 守卫（`Conditions` + `BoolExp` 组合）正是这条求值路径的实际消费方，一条本意「A、B 皆不成立才放行」的守卫会在 A 成立时**静默放行**——权限 fail-open。这是本轮影响面最大、最应被早发现的问题：它不在任何 storage/runtime 的高危面上，而在最基础的布尔求值原语里，`.not()` 只要套在 `.and()`/`.or()` 外面就中招。
2. **EXIST 子查询内层 `isReferenceValue` 引用外层 x:1 路径时，外层 JOIN 树缺失**（F-2）——`friend.age < 本用户的 leader.salary` 这类相关子查询直接抛 `missing FROM-clause entry`。r12-F-2 修了外层 direct match 的引用路径，EXIST 载荷是同族漏网读者。
3. **combined 拓扑抢夺既有 owner 时，旧 owner 的 filtered 成员资格事件丢失**（F-3）——查询面正确（旧 owner 退出视图）、事件面无 delete，下游对该视图的响应式计算永久陈旧。merged 拓扑经既有 unlink 机制已覆盖，combined 的 flashOut 是平行漏网（r18 复盘已把 combined × filtered 标为空白格）。
4. **entity/relation 类型的 payload 接受数组冒充单条**（I-1）——`typeof [] === 'object'` 且 `[]` 为真值，数组绕过结构校验，下游按单条实体消费时静默走偏。r17 修了 `type:'object'` 的数组拒绝，`base`（Entity/Relation）声明是同族漏网。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修复） | 3 | BoolExp NOT 组合 fail-open、EXIST 内层引用外层 JOIN 缺失、combined 抢夺旧 owner filtered 事件丢失 |
| 重要（已修复） | 1 | entity/relation payload 数组冒充单条 |
| 重要（记录，本轮不修） | 若干 | 见第三节 |
| 证伪/降级 | 1+ | 见第四节 |

---

## 二、致命问题（全部已复现确认并修复）

### F-1 `BoolExp.evaluate`/`evaluateAsync` 的 NOT 不贯穿 AND/OR 子树——守卫链权限 fail-open

- 位置：`src/core/BoolExp.ts` `evaluate` L401-416 / `evaluateAsync` L447-462（原实现）。`inverse` 参数只在 atom 分支（L398）与 `not` 分支（L415 传 `!inverse` 给直接子节点）生效；`and`/`or` 分支求值子节点时**完全不传 `inverse`**（用默认 `false`），并把子树的原义求值结果原样返回。
- 机理：`NOT(A OR B)` 求值时，`not` 节点以 `inverse=true` 求值 `(A OR B)`；`or` 节点收到 `inverse=true` 但**丢弃**，以原义求值 A、B——A 为真即返回 `true`。于是 `NOT(A OR B)` 等价于 `(A OR B)`。`NOT(A AND B)` 同构退化为 `(A AND B)`。
- 复现（实测真值表，12 例，修复前 8 例错）：

```
NOT(T OR F):        期望 false  实际 true   ❌
NOT(F OR F):        期望 true   实际 false  ❌
NOT(T AND T):       期望 false  实际 true   ❌
NOT(T AND F):       期望 true   实际 false  ❌
NOT(F AND F):       期望 true   实际 false  ❌
NOT(T OR F) AND T:  期望 false  实际 true   ❌
T AND NOT(T AND T): 期望 false  实际 true   ❌
NOT(NOT(T/F)):      正确（not 直接套 atom/not，走既有正确分支）
[async] 同构        ❌
```

- 端到端复现（PGLite，经 `Controller.dispatch`）：守卫 `Conditions.create({ content: BoolExp.atom(A).or(B).not() })`，A 返回 true、B 返回 false → 本应 `NOT(true OR false)=false`（拒绝）→ 实际 dispatch **无 error（放行）**。
- 影响：**权限 fail-open**。文档明确推荐 `Conditions.create({ content: BoolExp.atom(a).and(b).or(c) })` 组合守卫（`usage/06`），`.not()` 是 `BoolExp` 一等算子（`review-fixes-r13` 已在用 `BoolExp.atom(x).not()`）。任何「非…才放行」的组合守卫都会静默失效。这是所有错误形态里对安全性最伤的一类：无报错、按文档写、守卫悄悄放行。既有测试甚至**把错误行为编码成了断言**（`boolexp.spec.ts` 两处注释「Current implementation doesn't propagate inverse through AND/OR」）。
- 修复：`inverse` 贯穿 `and`/`or` 子树，按 De Morgan 翻转算子——取反下 `or` 按 `and` 语义（两子都需在取反下为真）、`and` 按 `or` 语义求值，短路与错误透传语义不变。同步/异步两条路径同构修复。两处编码错误行为的旧断言改为正确的 De Morgan 断言。
- 回归：`boolexp.spec.ts` 新增 De Morgan 真值表组（sync + async 一致性）；`review-fixes-2026-07-11-r19.spec.ts` 端到端守卫组（NOT(A OR B) 仅两者皆假放行、NOT(A AND B) 除两者皆真外放行）。

### F-2 EXIST 子查询内层 `isReferenceValue` 引用外层 x:1 路径——外层 JOIN 树缺失，SQL 崩

- 位置：`src/storage/erstorage/MatchExp.ts` `buildQueryTree` L172（`isReferenceValue` 引用路径入树的分支有 `!this.contextRootEntity` 限定——只处理外层 direct match，从不下钻 EXIST 载荷）；`SQLBuilder.ts` `parseFunctionMatchAtom` L410-421（内层 `RecordQuery` 继承 `contextRootEntity`，内层引用按外层根作用域解析别名）。
- 机理：EXIST 内层的引用（`value[1]`，如 `leader.salary`）经 `getReferenceFieldValue` 按 `contextRootEntity`（外层根）解析成列引用 `"User_leader"."salary"`。这要求 `User_leader` 出现在**外层**查询的 FROM/JOIN 里（相关子查询引用外层别名）。但外层的 match 只有 `friends EXIST(...)`，`leader` 只出现在 EXIST 载荷内部，`buildQueryTree` 从不遍历该载荷 → 外层不 JOIN `User_leader` → SQL 报 `missing FROM-clause entry for table "User_leader"`。
- 复现（实测，PGLite）：

```
User —leader(n:1)→ User ; User —friends(n:n)→ User
find('User', { friends: ['exist', { age: ['<', 'leader.salary'], isReferenceValue:true }] })
→ error: missing FROM-clause entry for table "User_leader"   ❌
```

- 影响：任何「关联子集的字段 vs 本记录跨关联字段」的相关 EXIST 查询直接崩溃（fail-loud，非静默）。这是 r12-F-2「外层 direct match 引用路径入 JOIN 树」修复的**自然延伸漏网**——同一声明面（`isReferenceValue` 引用路径）的第二个读者（EXIST 载荷）没被覆盖。
- 修复：`buildQueryTree` 命中 EXIST 原子时，递归收集内层（含嵌套 EXIST——`contextRootEntity` 逐层继承同一根）的全部 `isReferenceValue` 引用路径，并入**根查询**的 query tree（仅根查询 `!contextRootEntity` 负责，因为所有引用都解析自根）。收集函数对 `BoolExp` / `ExpressionData` / 裸 `MatchAtom` 三种载荷形态归一化。
- 回归：`review-fixes-2026-07-11-r19.spec.ts` F-2 组——两跳相关 EXIST 端到端执行并正确过滤；既有 `existQueryProof` / r12 引用路径测试保持通过。

### F-3 combined 拓扑抢夺既有 owner：旧 owner 的 filtered 成员资格 delete 事件丢失

- 位置：`src/storage/erstorage/RecordQueryAgent.ts` `flashOutCombinedRecordsAndMergedLinks` L179（`deleteRecordSameRowData` 物理清列，不经成员资格机制）；对照 merged 拓扑经 `CreationExecutor.unlinkOldOwnersOfExclusiveTargets` → `unlink` → `deleteRecord` → `collectLinkMembershipChecks` + `settle`。
- 机理：combined（三表合一）拓扑下，新 owner 抢夺既有 owner 的合并端点时，flashOut 把端点列从旧 owner 的共享行物理搬出，但**从不重算旧 owner 的 filtered 成员资格**。旧 owner 失去关系属性、退出 filtered 视图（查询面正确），却零成员资格 delete 事件（事件面缺失）。
- 复现（实测，PGLite，combined `User.profile → Profile` 1:1 + `UserWithProfile = filtered(User, profile.id is not null)`）：

```
create('User', {name:'A', profile:{title:'p'}})    → A ∈ UserWithProfile
create('User', {name:'B', profile:{id: p.id}})     → 抢夺 p
UserWithProfile 成员：['B']                          ✓ 查询面正确
UserWithProfile 事件：仅 create(B)                   ❌ 无 delete(A)
```

- 影响：下游对 `UserWithProfile` 视图的响应式计算（Count/Every/Transform/StateMachine）永久陈旧——A 已退出但计算里还算着 A。这是 r18 复盘明确标注的「combined × filtered 交叉格空白」在写路径上的兑现，与 r17-F-2「同 id `&` 零事件」同属「数据变更必有事件」契约破坏家族。
- 修复：flashOut 在物理清列**之前**快照旧 owner（`recordWithCombined`，业务关系端点、非虚拟 link）在依赖该关系属性的 filtered entity 上的成员资格，清列**之后**统一 `settleMembershipChecks`——退出视图的旧 owner 产生 delete 事件。复用 `FilteredEntityManager` 既有 collect/settle 机制，与 merged 拓扑同构。
- 回归：`review-fixes-2026-07-11-r19.spec.ts` F-3 组——combined 抢夺后断言旧 owner 的 `UserWithProfile` delete 事件存在 + 新 owner create 存在 + 查询面成员正确。

---

## 三、重要问题

### 已修复（本轮）

- **I-1 entity/relation payload 接受数组冒充单条**：`Interaction.ts` `checkPayload` L400-407，`base`（Entity/Relation）声明的 payload item 结构校验只判 `!item || typeof item !== 'object'`。`typeof [] === 'object'` 且 `[]` 为真值——`isCollection:false` 时数组作为单条实体放行、`isCollection:true` 时嵌套数组作为元素放行。下游读 `.id`/展开为单条记录时静默走偏。修复：结构校验显式拒绝 `Array.isArray(item)`（镜像 r17 的 `type:'object'` 数组拒绝），集合语义须经 `isCollection:true` 声明。回归 4 用例（两向拒绝 + 两向合法对照）。

### 记录，本轮不修（按影响排序，均有代码证据/子探查产出）

1. **`IN` / `NOT IN` 值数组含 `null` 未治理**（storage 查询探查，中高）：`MatchExp.ts` L291-346 `in`/`not in` 分支直接 `fieldParams = value[1]`，不像 `SchemaDialect.predicateSQLForOperator`（约束 DDL）那样拆 null。SQL 三值逻辑下 `col NOT IN (1, NULL)` 对任意行求值 UNKNOWN，`col IS NULL` 的行被静默滤掉、`IN (…,null)` 无法匹配 NULL 列。API 未声明该语义。建议：`in`/`not in` 编译期拆出 null 分支（`col IS [NOT] NULL OR/AND col [NOT] IN (…)`），与约束层实现对齐。
2. **`LIKE` 无 `%`/`_` 转义、无 `ESCAPE` 子句**（storage 查询探查）：`MatchExp.ts` L238-277。用户传入含 `%`/`_` 的字面量会意外扩大匹配面（非经典注入，值仍参数化，属语义安全缺口）。建议提供转义或显式 `ESCAPE`。
3. **`canonicalizeArgsForSignature` 对 `Date`/`Set`/`Map`/`RegExp` 坍缩为 `{}`**（migration 探查，中）：`migration.ts` L828-843 非数组 object 一律 `Object.keys().sort()` 遍历，上述类型无可枚举键 → 规范化为 `{}`，不同语义值产生相同 `argsSignature` → 迁移零感知。需 computation args 中实际出现这些类型才触发（`trigger` 等 plain object 路径安全）。建议补 exotic-object 分支（类似 `[Function]` 标记）或文档禁止在 args 中使用。
4. **property 级 filtered dataDep 不经 `resolveFilteredUpdateEvent` 同批去重**（runtime 探查，中）：`Scheduler.ts` L597 `targetPath?.length` 早退绕过 r18 为无 targetPath 源补的「同批成员资格 create/delete 则跳过物理 update」守卫。callback 型 property 聚合在「同批 enter + 聚合字段更新」时可能 +2 而非 +1。需确认 storage 是否同批发两类事件；建议对 `targetPath` 监听在 property 增量入口复用同一批次去重逻辑，并补 filtered **relation** 上 eventDeps update 的回归（r18 仅覆盖 filtered entity）。
5. **`Entity.clone`/`Relation.clone` 共享 `constraints` 数组引用**（core 探查，中）：`Entity.ts` L185 / `Relation.ts` L378 浅 clone 直接赋值 `constraints: instance.constraints`。RefContainer/setup 对 clone 侧 constraints 的原地修改会污染原实体。与已记录的 `RefContainer.replaceRelation/replaceEntity` 不 clone 同属「clone/replace 隔离语义不一致」家族。建议统一浅拷贝数组。
6. **`ActivityInteractionRelation` 声明但运行期从不写入**（builtins 探查）：`ActivityManager.ts` L40-47/125-127 注册了 `activityInteraction` 1:n 关系，但 `mapEventData` 只在事件 JSON 内嵌 `activity:{id}`，不建 relation 行。用 relation 查询的 Condition/报表得空集，`activity.id` 点查有效。建议：显式建 relation，或移除该 relation 并文档固定「只查 `InteractionEventEntity.activity.id`」。
7. **`checkCondition` 先于 `checkPayload`**（builtins 探查）：`Interaction.ts` L272-273。Condition 回调看到未校验 payload（含未知类型）。若条件提前读 payload 做授权可能基于畸形形态决策。建议文档明确顺序，或调换（breaking）。
8. **driver 错误映射缺口**（drivers 探查）：`DatabaseErrors.ts` 覆盖 PG `23505`/SQLite unique/MySQL `1062`，缺 MySQL `1213` 死锁、PG 以外的 serialization 冲突结构化标记。建议补齐以让并发重试策略跨驱动一致。
9. **`retrieveData` 的 modifier 限制仅在有 `limit` 时生效**（builtins 探查，r7-F-3 家族复确）：`Interaction.ts` L442-448。仅声明 `dataPolicy.match` 无 `limit` 时，调用方可用 `query.modifier.offset` 分页枚举全部匹配行（match 范围仍有效）。建议文档化「match-only policy ≠ 防枚举」或提供显式 `lockPagination`。

---

## 四、证伪/降级的候选（本轮探查结论被推翻的）

| 候选 | 证伪证据 |
|------|----------|
| 「Summation/Average 全量重算路径对 string 数值字段做字符串拼接（`0 + "10" + "20"` → `"01020"`）」（runtime 探查，初判中置信） | 复现证伪：`resolveSumField`/`resolveAvgField` 对 string `"10"` 因 `Number.isFinite("10") === false` 而**返回 0**（不是原样返回 string），`reduce` 累加得 0，不会字符串拼接。全量与增量口径一致（both 0）。属「非 number 字段按 0 计」的既定语义，非 bug |

另有若干子探查候选核实为**既有设计/已文档化**：`isRef` 只验存在性不验归属（显式 Condition 负责授权，`usage/06` 已明确）；eventDeps Transform 不维护源↔派生映射（audit 场景刻意形态，与 dataDep 语义不对称属文档问题）；`Custom.asyncReturn` 三参回调 vs 两参调用（r5-I-15 已记录）；Activity 事件写入早于状态推进（同事务内，提交前回滚）。

---

## 五、既有遗留项复确（r2–r18 已记录，本轮探查再次命中，不重复展开）

- **语义/契约**：SQL NULL 键缺失（r4-I-1）；update/create 返回值三态（r16-O-2/r17-R-4）；`Custom.asyncReturn` 2 参（r5-I-15）；StateMachine 单事件单跳 + 宿主自更新回声（r7-I-8）；`func::` 信任边界、`ignoreGuard`（文档化）；对称 n:n link API 不归一化端点（r4-I-17/r7-I-2，四轮复确，待产品决策）。
- **性能/资源**：global dict 变更宿主全表扫描（S3）；async task 表只增不减（r2-I-6）；级联删除无深度上限（r2-I-5）；offset-only 全量拉取（r12-I-4）；EXIST 误触 post-pagination（r12-I-5）；`RefContainer.replace*` 不 clone（r18 记录）。
- **并发**：`setDictionaryValue` find-then-write（r12-I-1）；lockRows 5 轮上限（r15-O-3）；Activity every 组 CAS 不自动重试（r16-O-7）。
- **时间调度**：`nextRecomputeTime` 全链无消费方——RealTime 时间驱动重算仍不存在（r3-R5）。
- **驱动**：MySQL 无事务（文档化）；contains 四驱动语义矩阵（r12-I-6）；PGLite UUID id vs 其他 INT。
- **迁移审阅完整性三缺口**（r18 第三节）：`defaultValue` 变更不进 manifest、落盘 deps 剥离 match、重算无 per-computation log。

---

## 六、修复优先级与后续建议

本轮三个致命项 + 一个重要项已全部修复。后续轮次建议：

1. **`IN`/`NOT IN` 含 null 治理**（第三节第 1 条）——静默错误结果家族，编译期拆分成本低，参照 `SchemaDialect` 既有实现。
2. **property 级 filtered 双轨同批去重对称化**（第三节第 4 条）——r18-F-1 修复的同族风险面，先确认 storage 同批事件形态再定夺。
3. **clone/replace 隔离语义统一**（第三节第 5 条 + r18 记录的 RefContainer）——一次性收口 Entity/Relation clone 的 constraints 数组与 RefContainer.replace* 的不 clone。
4. **createClass 统一声明期校验**（r16 建议 4，多轮复确）——Property.type 白名单、Payload 重名、Activity 环检测等积压项。

### 升级注意（behavior-tightening，供 CHANGELOG 参考）

- **BoolExp NOT 语义修正**：`NOT(A OR B)`/`NOT(A AND B)` 现按 De Morgan 正确求值。依赖旧（错误）行为的守卫会改变判定——但旧行为是权限 fail-open，任何依赖它的声明本就是安全缺陷。这是**安全修复**。
- **新增声明期 fail-fast**：entity/relation payload 拒绝数组（此前静默接受并下游走偏）。

---

## 附录：复现要点（验证用）

全部固化在 `tests/core/boolexp.spec.ts`（De Morgan 组）、`tests/runtime/review-fixes-2026-07-11-r19.spec.ts` 与 `tests/storage/review-fixes-2026-07-11-r19.spec.ts`：

- F-1：De Morgan 真值表 12 例（sync + async）；端到端守卫 `NOT(A OR B)` 仅两者皆假放行、`NOT(A AND B)` 除两者皆真外放行。
- F-2：两跳相关 EXIST（`friend.age < 本用户 leader.salary`）端到端执行并正确过滤，不再抛 `missing FROM-clause entry`。
- F-3：combined 抢夺后旧 owner 的 `UserWithProfile` delete 事件存在、新 owner create 存在、查询面成员正确。
- I-1：entity payload `isCollection:false` 拒绝数组 / `isCollection:true` 拒绝嵌套数组元素；合法单条与合法数组对照放行。
