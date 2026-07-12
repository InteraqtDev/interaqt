# 全代码库深度 Review 报告(2026-07-12 第二十三轮)

- 日期:2026-07-12
- 基线:`main` @ `f48c31fa`(v4.0.4,r1–r22 全部致命/重要修复已落地)
- 基线健康度:`npm run check` 通过;`npm test` 全量通过(含 r22 回归)
- 范围:五路并行深度探查(runtime 调度与计算句柄 / storage 写路径与 Setup / storage 查询编译 / core+builtins)+ 对全部致命候选**亲自编写最小复现实际运行定谳**(PGLiteDB)
- 方法:与 r1–r22 全部报告逐条去重;每个候选先做代码路径二次追踪,再以运行时复现定谳(本轮多项高置信候选被代码追踪或复现证伪,见第四节)。「已复现确认」才列为致命/重要。
- 修复状态:**一个致命项 + 四个重要项已在本分支(`cursor/deep-code-review-r23-35c9`)全部修复**,回归固化于 `tests/runtime/review-fixes-2026-07-12-r23.spec.ts`(8 用例)。修复后 `npm run check` 通过,`npm test` 全量 **1977 passed / 26 skipped**。

---

## 一、结论摘要

r22 之后,filtered 端点事件与事务重试幻影事件等高危面进一步收敛。本轮致命发现再次落在 r22 复盘命名的**「寄生位置」**形状上——`joinTables`「已同表则早退成功」的语义只对「同一合表的幂等重入」成立,却被第二条同 target 的 reliance 当成「也可以 claim combined」;事务事件契约(「events 必须与已提交行一致」)在 r22 只修了重试消费方,in-txn 回滚是同一契约的**第二个消费方**:

1. **双同 target 1:1 isTargetReliance → INSERT 列重复**(F-1,影响面最大)——`User.mainProfile` + `User.altProfile` 均 `1:1 isTargetReliance → Profile` 时,第一条合表成功后第二条因 Profile 已在 User 表被 `joinTables` 早退(返回 `undefined`=无冲突=成功),两条 link 都标 `mergedTo=combined`,但 Profile 列只分配一份 → create 时 INSERT 列出两份 `pro_tit_*` → SQL `column specified more than once`。setup 成功、create 才炸——典型的静默延迟故障。
2. **runInTransaction 回滚残留幻影事件**(I-1)——r22 F-2 只隔离了事务外重试路径(每 attempt 新数组、成功后搬运);事务内 `callWithEvents` 仍在 COMMIT 前 `events.push`。`runInTransaction { create(..., events); throw }` → DB 0 行、`events.length === 1`。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命(已复现,已修复) | 1 | 双同 target 1:1 isTargetReliance 合表假成功 → INSERT 列重复 |
| 重要(已复现/代码确认,已修复) | 4 | in-txn 回滚幻影事件、Entity.inputEntities:[ ]、Property/Dictionary type 白名单、Entity.clone 忽略 deep |
| 重要(记录,本轮不修) | 若干 | 见第三节 |
| 证伪/降级 | 若干 | 见第四节 |

---

## 二、致命问题(全部已复现确认并修复)

### F-1 双同 target 1:1 isTargetReliance:合表假成功 → INSERT 列重复

- 位置:`src/storage/erstorage/Setup.ts` reliance 合表循环(`mergeRecords` 步骤 2);`joinTables`(L93-128)在 `moveTable == joinTargetTable` 时 early-return(返回 `undefined`,调用方视为无冲突成功);合表成功后 `linkData.mergedTo = 'combined'`。
- 机理:`combineRecordTable(User, Profile, MainProfile)` 把 Profile(+link) 拉进 User 表并标 `mergedTo=combined`。第二条 `AltProfile` 再 `combineRecordTable(User, Profile, AltProfile)` 时,Profile 已在 User 表 → `joinTables` 早退成功 → AltProfile 也标 `mergedTo=combined`。列分配只为第一份 combined 写一份 Profile 字段前缀;写路径却按两条 combined link 各展开一份嵌套属性 → INSERT 列名重复。
- 复现(实测,PGLite):

```
User + Profile
MainProfile = Relation(User→Profile, 1:1, isTargetReliance, sourceProperty:'mainProfile')
AltProfile  = Relation(User→Profile, 1:1, isTargetReliance, sourceProperty:'altProfile')

controller.setup(true)  → 成功 ✓(本应拒绝)
storage.create('User', {
  name: 'u1',
  mainProfile: { title: 'a', kind: 'main' },
  altProfile:  { title: 'b', kind: 'alt' },
})
→ SQL error: column "pro_tit_..." specified more than once ❌
```

- 影响:公开合法声明形态(多条 1:1 reliance 指向同类型 target)在 setup 期静默通过,运行期 create 才炸;错误信息是驱动 SQL 层的,用户难以追溯到声明冲突。同 source 不同 target 类型的双 reliance(Profile+Address)不受影响——各合表一次,列前缀不同。
- 修复:合表**成功前**按 `(sourceRecord, targetRecord)` claim;第二次命中同一 key 时 fail-fast,报错明确指出「target 实体只能合表一次」及改法(保留单条 reliance,或去掉多余的 `isTargetReliance`)。claim 仅在成功 combine 后写入(冲突回退到只合 link 的路径不占 claim)。
- 回归:双同 target setup 拒绝 + 单条 reliance create/delete 仍正常(`review-fixes-2026-07-12-r23.spec.ts` F-1 组)。

---

## 三、重要问题

### 已修复(本轮)

- **I-1 runInTransaction 回滚幻影事件**:r22 F-2 修复了事务外 `withAtomicTransaction` 重试路径的 attempt 隔离;事务内 `callWithEvents` 仍直接 `events.push` 于 COMMIT 之前。`runInTransaction` abort → DB 回滚、调用方数组不回滚。修复:`StorageTransactionContext.eventArrayBaselines` 在首次 push 前记录数组基线长度,最外层 rollback 时 `events.length = baseline`。回归 2 用例(空基线 abort + 事务外 seed 后部分批次 abort)。
- **I-2 `Entity.inputEntities: []`**:Relation 已拒空 `inputRelations`;Entity 空数组合并体是静默损坏声明(无输入的空壳,仍进 merged 编译路径)。修复:与 Relation 同规则——空数组 fail-fast。回归 1 用例(+ `mergedEntityInRelation.spec.ts` 原「空 inputEntities 应可查询」用例改为断言拒绝)。
- **I-3 Property/Dictionary `type` 白名单**:允许 `string|number|boolean|timestamp|object|id|json`;未知串(含 `String`/`Number`/`array`/`float`/`strng`)此前静默落到非法 SQL 类型。修复:声明期白名单校验。顺带修正 `tests/storage/data/common.ts` 的 `String`/`Number`、`defaultValue.spec.ts` 的 `array`/`float`。回归 2 用例。
- **I-4 `Entity.clone` 忽略 `deep`**:`MergedItemProcessor` 调用 `clone(e, true)` 期望深拷贝 Property 实例;Entity.clone 此前忽略第二参,与 `Relation.clone` 不对齐 → 声明图共享 Property 引用。修复:深拷贝时 clone properties 数组与各 Property 实例。回归 1 用例。

### 记录,本轮不修(按影响排序,均有代码证据;含 r22 §三 仍成立项 + 本轮新见)

1. **`atomic.get` / record-target boolean 0/1 未归一化**(r22 §三 #1 的兄弟格):`structureRawReturns` 把 SQLite 的 0/1 归一化为 boolean,atomic 读路径与部分 record-target 布尔属性读路径原样返回——公开 API 面跨路径类型分裂。建议与 `QueryExecutor` 的布尔归一化对齐(全局路径 + record-target 路径一并收口)。
2. **`settlePostWriteChecks` drain × 写失败**:post-write 检查队列在写路径失败时的 drain/残留语义未与事务回滚对齐——失败后队列状态可能泄漏到后续成功写。属 r22 F-2 / r23 I-1 同族「副作用与提交边界」的第三消费方。
3. **filtered targetPath property 级全量重算风暴**(r19 #4 / r21 #1 / r22 建议 1):正确性由全量兜底,性能收口仍未做。
4. **`canonicalizeArgsForSignature` 对显式 `undefined` 键值 / NaN**(r22 §三 #2 扩展):`JSON.stringify(undefined)` 产生非法片段;NaN 坍缩为 `null`——「键缺席」与「键=undefined」/NaN 可能产生不同或错误碰撞的签名。
5. **`lockRecord` 只锁 root**:嵌套 reliance / 同表关联行不在锁集合内——并发抢夺/更新下的隔离缺口。
6. **`StateMachine.clone` 共享图**:clone 后 states/transfers 与原图共享节点引用——与 Entity.clone(deep) 本轮修的同族隔离缺口。
7. **`BoolExpressionData` operator 白名单**:未知 operator 静默接受,匹配期行为未定义。
8. **`ActivityGroup.type` 在 create 时未校验**:非法 type 延迟到运行期。
9. **listener 非幂等副作用在重试下重放**(r22 §三 #4 复确):F-2/I-1 修了事件数组面;listener 内 HTTP/文件等外部副作用仍可能执行 N 次。文档面契约。
10. **ScopedSequence `scopeKey` 对 scope 项声明顺序敏感**(r22 §三 #3):调换顺序开新序列槽位。
11. **对称关系多跳 targetPath / `getReversePath` 含 `&`**(r22 §三 #5/#6):未构造红例,维持记录。
12. **post-pagination tie 组稳定性 / EntityToTableMap 无 aliasManager / migration resume 只信 phase / INTEGER id > 2^53**(r22 §三 #7–#10):维持记录。
13. **base create 事件不含异表关联**(r22 §三 #11):事件 payload 契约文档化待办。
14. **矩阵格建议**(r22 §三 #12 + 本轮):reliance 合表轴需登记「同 source × 同 target 类型 × 多条 1:1 isTargetReliance」(本轮 F-1 已铺 fail-fast 格);「同 source × 不同 target 类型」为合法对照组。

---

## 四、证伪/降级的候选(本轮探查结论被推翻或核实为既有设计的)

| 候选 | 结论 |
|------|------|
| 「双**不同类型** reliance(Profile+Address)删除快照 `child.find(recordName)` 碰撞 → 第二份视图 delete 丢失」(storage 探查候选,初判高置信) | 复现证伪:两份视图 delete 均正确发出;不同 `recordName` 下 `find` 各找各的。原候选把「同类型双 reliance」与「不同类型双 reliance」混为一谈——同类型案是 setup 合表假成功(F-1),不是快照查找 bug |
| 「Dictionary `defaultValue` ∥ `computation` 是静默竞争写通道」(core 探查候选) | **降级/证伪为产品契约**:大量既有测试与 `getInitialValue` 路径刻意并用两者(dict seed + computation 初值);Property 侧拒绝的是 `computed`∥`computation` 与 Scheduler 对 **property** `defaultValue`∥`computation` 的 assert,不能机械搬到 Dictionary。本轮初修后全量红,已撤回该守卫 |
| 「UPDATE 前置查询裁剪 oldRecord × 顶层 plain match → 错误 skip」(r22 已证伪) | 本轮再次核对:值属性不被裁剪,维持证伪 |

---

## 五、既有遗留项复确(r2–r22 已记录,本轮探查再次命中,不重复展开)

- **语义/契约**:SQL NULL 键缺失(r4-I-1);update/create 返回值三态(r16-O-2);`Custom.asyncReturn` 2 参(r5-I-15);StateMachine 单事件单跳 + 宿主自更新回声(r7-I-8);对称 n:n link API 不归一化端点(r4-I-17);checkCondition 先于 checkPayload(r19 #7);LIKE 无转义(r19 #2)。
- **性能/资源**:filtered targetPath property 级监听恒退全量(第三节 #3);EXIST 命中路径仍入外层 JOIN 树;global dict 变更宿主全表扫描;async task 表只增不减;级联删除无深度上限;offset-only 全量拉取。
- **并发**:`setDictionaryValue` find-then-write;`lockRows` 5 轮上限;`lockRecord` 只锁 root(第三节 #5);Activity every 组 CAS 不自动重试;any 组并发双头窗口。
- **异步/install**:asyncReturn 信封写穿 / undefined 即 applied / commit 重试双 apply / install 双事务 / 半初始化窗口。
- **单一事实源**:GlobalBoundState 的 dict 镜像;`_System_` 与 dict 双轨 KV;`storage.atomic` 业务列零事件。
- **事件驱动契约**:event-based 计算不经 skip/信封协议;MonoStorage.dispatch listener 不链式;listener 重试副作用(第三节 #9)。
- **迁移**:审阅完整性三缺口;rename 决策无执行器;`canonicalizeArgsForSignature` Date/Set/Map/RegExp/undefined/NaN(第三节 #4)。
- **clone/replace 隔离**:Entity.clone(deep) 本轮已修;Relation.clone 共享 constraints;StateMachine.clone 共享图(第三节 #6);RefContainer.replace* 不 clone。
- **驱动**:MySQL 无事务(文档化);contains 四驱动语义矩阵;driver 错误映射缺口;dict 编解码无 Date codec。
- **公开面**:Event/Gateway 死 API;`retrieveData` modifier 限制;ActivityInteractionRelation 声明但不写入;createClass 统一声明期校验积压(本轮 I-2/I-3/I-4 又添三处手写守卫)。

---

## 六、修复优先级与后续建议

本轮一个致命项 + 四个重要项已全部修复。后续轮次建议:

1. **atomic / record-target 布尔归一化**(第三节 #1)——与 `QueryExecutor` 对齐,单点修复面,r22 建议 2 的延续。
2. **settlePostWriteChecks × 写失败 drain**(第三节 #2)——与 r22 F-2 / r23 I-1 同族收口到「提交边界」清单。
3. **filtered targetPath 事件名改写 + 同批去重**(第三节 #3,多轮复确)。
4. **`canonicalizeArgsForSignature` 剔除 undefined / 规范化 NaN**(第三节 #4)。
5. **createClass 统一声明期校验**(r16 建议 4,六轮复确)——本轮 Entity/Property type 又添手写守卫,积压持续增长。

### 升级注意(behavior-tightening,供 CHANGELOG 参考)

- **新增声明期/setup 期 fail-fast**:同一 source 上多条 1:1 `isTargetReliance` 指向同一 target 实体类型(此前 setup 成功、create 时报 SQL 列重复);`Entity.inputEntities: []`;Property/Dictionary `type` 不在白名单(`string|number|boolean|timestamp|object|id|json`)。
- **行为修正(无 API 变化)**:`runInTransaction` 回滚后调用方 `events` 数组截断回事务前基线(此前残留幻影);`Entity.clone(entity, true)` 深拷贝 Property 实例(此前忽略 deep)。
- **合法对照组不变**:单条 1:1 isTargetReliance 合表与 create/delete 语义不变;同 source 指向**不同** target 类型的多条 reliance 仍合法;Dictionary 同时声明 `defaultValue` 与 `computation` 仍合法(见第四节证伪)。

---

## 附录:复现要点(验证用)

全部固化在 `tests/runtime/review-fixes-2026-07-12-r23.spec.ts`(8 用例):

- F-1:User→Profile 双 1:1 isTargetReliance 在 setup 期被拒绝(报错含 combine / Profile);单条 reliance setup + 嵌套 create 仍成功。
- I-1:`runInTransaction` 内 create 后 throw → DB 0 行且 `events.length === 0`;事务外 seed 后再 abort → 数组回到 seed 基线、DB 仅 seed 行。
- I-2:Entity `inputEntities: []` → 声明期拒绝。
- I-3:Property/Dictionary `type: 'strng'` / `'String'` → 拒绝;`object`/`json`/`id` 放行。
- I-4:Entity.clone(original, true) 不共享 Property 实例;改 clone 的 name 不泄漏到原声明。
