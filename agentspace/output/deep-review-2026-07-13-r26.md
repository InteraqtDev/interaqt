# 全代码库深度 Review 报告（2026-07-13 第二十六轮）

- 日期：2026-07-13
- 基线：`main` @ `eeea3106`（v4.0.6，r1–r25 全部致命/重要修复已落地）
- 范围：五路并行深度探查（storage 写/查询、runtime 调度与计算、drivers+core+builtins）+ 对全部致命候选**亲自编写最小复现实际运行定谳**
- 方法：与 r1–r25 全部报告逐条去重；每个候选先做代码路径二次追踪，再以运行时复现定谳。本轮聚焦「同一契约的兄弟产生点 / 对称面」——r25 收口 create 事件 payload 后，delete 事件端点契约与连接生命周期 close 面成为自然 sweep 目标
- 修复状态：**一个致命项 + 四个重要项已在本分支（`cursor/deep-code-review-r26-5fc6`）全部修复**。回归固化于 `tests/runtime/review-fixes-2026-07-13-r26.spec.ts`（7 用例）

---

## 一、结论摘要

本轮致命发现的形状仍是「**同一契约在同一函数内的兄弟分支漏网**」：

1. **flashOut create-steal 的 link delete 事件缺 `source`/`target` 端点 → StateMachine `computeTarget` 永不触发**（F-1）——同函数内：create 事件（r17 已补端点）、merged-link replace delete（已有端点）、`DeletionExecutor` 规范形（已有端点）全部正确；**唯独 create-steal 分支** push 裸 `LINK_SYMBOL`。既有测试（`combinedRecordEvents`、拓扑矩阵）只断言 delete **存在**，不断言端点形状——预言机也只查存在性。下游按端点定位的事件轨（StateMachine / Transform）静默失明。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现，已修复） | 1 | flashOut create-steal link delete 缺端点 → 事件轨失明 |
| 重要（已复现，已修复） | 4 | Activity 状态泄漏、UniqueConstraint/BoolExpressionData 声明守卫未接线、四驱动 close 幂等 |
| 记录，本轮不修 | 若干 | 见第三节 |

---

## 二、致命问题（已复现确认并修复）

### F-1 flashOut create-steal link delete 缺 `source`/`target`：事件轨 `computeTarget` 永不触发

- 位置：`src/storage/erstorage/RecordQueryAgent.ts` `flashOutCombinedRecordsAndMergedLinks`（原 L255–259；快照构造原 L214–216）
- 机理：delete 事件 payload 契约 = link 属性 + `source`/`target` 端点（`DeletionExecutor` 为规范形）。同函数内三条兄弟路径：
  - **create 事件**（L324–328）：显式补端点 ✓
  - **merged-link replace delete**（L286–295）：显式补端点 ✓
  - **create-steal combined delete**：裸 `LINK_SYMBOL` ✗
- 复现（实测，PGLite，两轨全红）：

```
User–Profile 1:1 reliance（三表合一）
A = create User + nested profile
B = create User { profile: { id: p } }   // flashOut 抢夺

link delete 事件：record = { id }        // 缺 source/target ❌
StateMachine trigger { type:'delete' } + computeTarget(event.record.source.id)：
  A.linkStatus 恒 'idle' ❌（computeTarget 返回 undefined，transfer 永不触发）
```

- 影响：1:1 reliance / `mergeLinks` combined 拓扑下，一切按端点定位旧 owner 的 delete 响应（状态机、Transform eventDeps、自定义 listeners）静默不触发。数据面正确（归属转移完成），事件面残缺。
- 修复：在清列前构造完整 `oldCombinedLinkRecord`（`LINK_SYMBOL` + 按 `isRecordSource()` 放置的端点），base delete push 与 filtered-view `settleDeletionMemberships` 共用同一快照——视图轨同步收口（否则 filtered relation 名上的 delete 同样缺端点）。
- 回归：storage 面端点断言 + runtime 面 StateMachine `gone` 转移（修复前恒 `idle`）。

### F-1 同族收口 sweep（follow-up：预言机第 6/7 条落地后按契约全域执行）

把「relation 事件端点契约」升格为预言机规则（第 6 条 delete、第 7 条 update：端点存在 + 与变更前快照**值一致**）后重跑拓扑矩阵，首跑再抓出三个同族缺口，全部红-绿收口：

1. **`{id: undefined}` 残缺端点**（`oldBusinessLinkRecord`，addRelation 抢夺形态）：`source: { id: recordWithCombined.source?.id }` 在端点未加载时推入残缺对象——JSON 面像有 source 键，`computeTarget` 读到 undefined。修复：端点任一缺失即跳过该推送（merged-replace / DeletionExecutor 规范形负责完备事件）。
2. **`stolenIsSource = !isRelationSource(...)` 端点左右反转**（merged-replace delete，1:n merged-to-target × addRelation 抢夺格）：Item 被标成 source、User 被标成 target——delete 事件与快照分裂。**存在性断言与全部手写测试对此失明，只有预言机的值比对能抓**。修复：去掉错误取反；同函数上方 membership check 的同名取反一并修正。
3. **update 对称面（第 7 条首跑抓出）**：行内同 id `&` 原地更新的 link update 事件 oldRecord 手工拼自 `LINK_SYMBOL` 数据——无端点；canonical `updateRelationByName` 路径的 oldRecord 是 matchedEntity（带端点）。同一契约的第二产生点。修复：行内路径 oldRecord 显式补端点。
4. **视图轨快照端点**：merged-replace 分支给 `collectInlineDeletionSnapshot` 的是裸 `oldLink`——filtered relation 名上的 delete 事件缺端点（base 轨对、视图轨漏，r25 F-1「两条消费轨」的 delete 版本）。修复：快照构造期即带端点。

sweep 后验证：全量 `npm test` **2022 passed / 33 skipped**；`npm run test:postgres` @ 真实 PostgreSQL 16 全部 7 套件 **32 passed**；MySQL open/close 幂等 @ 真实 MySQL 8 passed（新增 env-gated `driverCloseIdempotency.spec.ts` 覆盖 PG/MySQL double-close）。

---

## 三、重要问题

### 已修复（本轮）

- **I-1 Activity `checkActivityState` 先于 `fullGuard`：未授权方可从 `ActivityStateError.currentState` 读取完整工作流状态树**（r25 §三 #1）：持有 `activityId` 的攻击者探测尚未到达的步骤时，在 Condition 之前收到带完整 `currentState` 的错误。修复：两处非 head-create 路径改为 **先 `fullGuard` 再 `checkActivityState`**——未授权方得到 Condition 错误（无状态树）；已授权方探测不可达步骤仍保留 `currentState` 可观测性。
- **I-2 `UniqueConstraint.create` 不执行 `nonEmpty` / `eachNameUnique`**（r16#4 / r25 I-4 家族）：空 `properties` / 重名声明期通过，setup 深处才炸。修复：接线进 `create()`。
- **I-3 `BoolExpressionData.create` 不执行 operator 白名单**：`operator: 'xor'` 声明期通过，首次求值才炸。修复：接线白名单 + `not` 不得带 `right`。
- **I-4 四驱动 `close()` 非幂等**（open 幂等家族对称面）：二次 `close` 抛错。修复：PG/MySQL/SQLite/PGLite 一律幂等守卫。

### 记录，本轮不修（按影响排序）

1. **迁移 `operationKey` 含 DDL 列表下标**（r25 §三 #2）：resume 前计划重排会误标已完成——改键格式影响进行中的迁移，需配套设计，不宜顺手改。
2. **timestamp 读路径无跨驱动归一化**（r25 §三 #5）：行为变更，需 CHANGELOG。
3. **`canonicalizeArgsForSignature` 的 Date/Set/Map/RegExp codec**（多轮遗留）。
4. **Transform `hashIdentifier` 32-bit 弱哈希**（r25 §三 #3）：换哈希触发存量索引重建。
5. **createClass 统一声明期校验**（r16 建议 4，十轮复确）：本轮又手写两处守卫，积压持续增长；Count/Every/Transform 的 `required` 字段等仍未接线。
6. **filtered targetPath 全量重算风暴**（多轮复确）：性能项。
7. **StateMachine.clone 共享图、`new StateMachine` 绕过 create 守卫**。
8. **Activity 图校验只在 ActivityManager 构造期**（声明期缺口）。
9. 其余 r25 §三 清单（dedupe / 深嵌 EXIST 别名 / 等）——本轮无新增证据。

---

## 四、证伪 / 未达致命门槛的候选

| 候选 | 结论 |
|------|------|
| create 事件仍有 host/membership 旁路 `completeEventPayloadWithDefaults` | 代码事实成立，但 host 用等价 `defaultValues` spread；无用户可见红例 |
| PG `openForSchemaRead` 创建未使用的 Client | Client 从未 `connect()`，非真实连接泄漏；close 幂等已覆盖二次关闭 |
| 对称多跳 targetPath × 无 callback Count | 机制可疑（Scheduler TODO），本轮未构造红例；维持记录 |

---

## 五、既有遗留 + 本轮教训

### 本轮补充教训（escape analysis 一句话）

**「同函数内的兄弟分支是契约的第二消费方」**：r25 把 create payload 契约收口到三产生点，但 delete 端点契约在**同一个 `flashOut` 函数**里已有正确实现（create / merged-replace），create-steal delete 却漏网——审查者看到同文件的正确模式就盖了「已处理」章。既有测试断言 delete **计数**而非 **形状**，预言机也不查端点。机制回应：登记册把 delete 端点契约升格为多产生点声明面；回归同时覆盖 storage 形状断言与 runtime 事件轨消费。完整复盘见 `r26-test-blindness-retrospective.md`。

---

## 六、修复优先级与后续建议

本轮一个致命项 + 四个重要项已全部修复。后续轮次建议：

1. **迁移 `operationKey` 去 index、改内容哈希**（第三节 #1）——resume 正确性。
2. **createClass 统一声明期校验**（十轮复确）——停止手写守卫增殖。
3. **timestamp 读归一化决策**。
4. **filtered targetPath 事件名改写**（性能）。
5. CI 补 MySQL service container（r25 建议延续）。

### 升级注意（behavior-tightening）

- **行为修正（无 API 变化）**：combined create-steal 的 link delete 事件开始携带 `source`/`target`；依赖端点的增量计算 / trigger 将开始正常工作。
- **Activity 守卫顺序**：非 head 路径与带 activityId 的 head 路径现在先跑 Condition，再检查状态可达性——未授权探测不再收到 `currentState`。
- **新增声明期 fail-fast**：`UniqueConstraint` 空/重名 properties；`BoolExpressionData` 非法 operator / `not`+right。
- **四驱动 `close()` 幂等**（此前二次 close 抛错）。
