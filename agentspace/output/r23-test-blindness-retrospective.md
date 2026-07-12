# 深度反思:为什么「合表成功」的第二个含义在 23 轮审查后才被发现(r23 F-1 / I-1)

- 日期:2026-07-12
- 关联:`deep-review-2026-07-12-r23.md`(问题发现与修复)、`r22-test-blindness-retrospective.md`(上一轮复盘:概念寄生位置是轴)、`r17-–r21-test-blindness-retrospective.md`(前五轮复盘)
- 性质:测试与修复体系的结构性复盘 + 本轮已落地的机制改造记录。

---

## 〇、先给结论

r23 的致命项与核心重要项都不是新机制的 bug,而是**已知答案被用在第二个含义/第二个消费方上**:

1. **F-1(双同 target reliance → INSERT 列重复)**:`joinTables` 在「已同表」时 early-return(无冲突=成功)——对**同一合表的幂等重入**是正确的(重复调用 `combineRecordTable` 不应把已合表的实体再搬一次)。但这条成功语义被第二条**独立**的 1:1 isTargetReliance 继承:第二条也拿到「合表成功」、也标 `mergedTo=combined`,而列只分配了一份。**「合表成功」有两个含义**——「这两张表已经在一起了(幂等)」vs「这条 reliance 可以宣称自己拥有 combined」——机制只验证了第一个。
2. **I-1(in-txn 回滚幻影事件)**:r22 F-2 确立了「events 必须与已提交行一致」,并在**重试消费方**上做了 attempt 隔离。`runInTransaction` 内的 push-before-COMMIT 是同一契约的**第二个消费方**——回滚不是重试,但同样让「数组里的事件」与「库里的行」分裂。r22 复盘说「机制的每个消费方都要回答同一组问题」——本轮字面兑现:修了 retry,漏了 in-txn abort。

这与 r22 的「寄生位置」是同一形状:**一个只对第一消费者/第一含义成立的答案,被默认为对全家成立**。

---

## 一、显微镜:防线为什么没拦住

### 1.1 F-1:「成功」返回值承载了两种不可兼容的语义

`joinTables` 的返回约定:`undefined` = 无冲突(含「已经同表」早退),`string[]` = 冲突列表。调用方 `if (!conflicts) { mergedTo = 'combined' }` 把「无冲突」等同于「可以认领 combined」。对**第一次**合表,两者重合;对**第二次**同 target reliance,「已经同表」仍是无冲突,但**不能**再认领一份 combined——列空间已被第一份占用。

早退本身不是 bug(避免把同表记录再搬一次、避免无意义的 mergeLog)。bug 在于**把早退成功提升为 link 级 `mergedTo=combined` 的许可证**。许可证本应是「本 reliance 是否成功地把 target 合进 source 并分配了列」——这是比「两表是否同表」更强的命题。

**教训的一般形**:当 API 用同一个成功码表达「幂等已完成」与「本次新完成」时,下游若用成功码去做**资源认领**(标 combined、分配列、注册监听),必须另有 claim 集合——幂等成功不能自动等于认领成功。这与「HTTP 200 既表示创建又表示更新」同构:读者必须区分。

### 1.2 F-1:reliance 矩阵只铺了「单条」格

合表/reliance 测试覆盖单条 1:1 isTargetReliance 的 create/delete/级联,以及不同 target 类型的多 reliance(合法)。**同 source × 同 target 类型 × 多条 1:1 isTargetReliance** 从未进入登记册——既不是合法格(应 fail-fast),也不是「已测通过」格,而是空白。r20/r22 复盘的「交叉格空白应按『这里有 bug』处置」再次兑现:空白格里藏着「早退成功被二次认领」。

storage 探查曾怀疑「双不同类型 reliance 的删除快照 `find(recordName)` 碰撞」——那是把同类型案的症状(两份 combined 抢同一组列)错误外推到不同类型案。复现证明不同类型两份视图 delete 正常;真正的同类型案在 setup 就该死,却活到了 create。**证伪过程本身有价值**:它把候选从「快照查找」收窄到「合表认领」,才定位到 `joinTables` 早退语义。

### 1.3 I-1:契约修在一个消费方上,清单没有强制枚举其余消费方

r22 F-2 的修复注释与复盘都写了「dispatch 健康、storage 直调是第二消费方」。但「events ↔ 提交行」契约的消费方不止 retry:

| 消费方 | 失败模式 | r22 是否修 |
|--------|----------|------------|
| 事务外 `withAtomicTransaction` 重试 | attempt 间数组累积 | ✓ F-2 |
| 事务内 `runInTransaction` 回滚 | push 后 abort,数组残留 | ✗ → r23 I-1 |
| (记录) post-write 队列 × 写失败 | 队列与提交边界 | 仍未修 |

机制旁的 consumer checklist 若在 r22 落地为强制枚举,I-1 应在同一轮被发现。实际是「修了眼前的 repro 路径」——经典的 instance fix 残留。

---

## 二、这两个 bug 的公共形状

> **机制答案的每个含义 / 每个消费方都是一根轴。** `joinTables` 早退成功对「幂等重入」成立,对「第二条 reliance 认领 combined」不成立——同一返回值,两个命题。`events` 与提交行一致对「重试」成立,对「in-txn 回滚」必须再次成立——同一契约,两个消费方。r22 说寄生位置是轴;r23 补充:**成功语义的歧义**和**契约的第二消费方**是寄生位置的两种具体形态——都表现为「第一处修完后印象扩散到全家」。

---

## 三、本轮已落地的机制改造

1. **reliance 合表 claim 集合**:`(sourceRecord, targetRecord)` 在成功 combine 前检查、成功后写入;重复 claim fail-fast(明确错误信息含改法)。把「认领 combined」从 `joinTables` 的成功返回值上剥离——早退仍可表示同表,但不能再默认可标 combined。
2. **事务事件数组基线**:`StorageTransactionContext.eventArrayBaselines` 在 in-txn 首次 push 前记长度,最外层 rollback 截断。与 r22 的「每 attempt 新数组」互补——覆盖非重试的 abort 路径。
3. **声明面对齐守卫**:Entity 空 inputEntities(对齐 Relation)、Property/Dictionary type 白名单(含框架使用的 `id`/`json`)、Entity.clone(deep)(对齐 Relation.clone)——「一侧有守卫、对称侧没有」的寄生缺口收一批。初探曾把 Dictionary `defaultValue`∥`computation` 当作对称守卫,全量回归证明那是刻意契约,已撤回(见主报告第四节)。
4. **登记册回灌建议**:reliance 合表轴增加「同 target 类型 × 多条 1:1 isTargetReliance」格(本轮为 fail-fast);「不同 target 类型」保留为合法对照。机制消费方轴补充:凡「events ↔ 提交行」类契约,枚举 retry / in-txn abort / post-write 失败至少三格。

---

## 四、有意不做(含理由)

- **不删除 `joinTables` 的同表早退**:幂等重入与内部多路径调用仍需要;改动面大且易引入「已同表却报冲突」的回归。正确收口是 claim 层,不是取消早退。
- **不在 `joinTables` 返回值上区分「新合表 / 已同表」三态**(例如返回 `'already-joined'`):会迫使所有调用方改分支;当前唯一需要区分的调用方是 reliance 认领,局部 claim 集合成本更低。若未来更多调用方误用成功码认领资源,再考虑三态返回。
- **不把 listener 副作用重放做成框架级去重**(r22 有意不做,维持):幂等是消费方契约。
- **本轮不修 settlePostWriteChecks × 写失败**(第三节记录 #2):与 I-1 同族但需独立复现与队列生命周期设计,列入后续。

---

## 五、一句话总结

**r22 说概念的寄生位置是轴——r23 的教训是:机制返回值的「成功」若同时表示幂等完成与资源认领,第二个含义就是下一个致命格;`events` 与提交行一致若只在一个消费方上落实,第二个消费方就是下一轮的幻影事件。修答案时问两句:这个成功还能被谁当成许可证?这条契约还有谁在依赖?**
