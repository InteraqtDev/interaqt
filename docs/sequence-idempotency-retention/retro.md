# sequence-idempotency-retention — 运行记录

generated-by: cyclic-task-prompt | template-sha256: 6cfe19e4e81c | generated-at: 2026-08-10

| 轮次 | 角色 | 结论 | 类别/证据 | 下一步 |
|------|------|------|-----------|--------|
| d0 | Task 1 设计初稿 | 设计文档已建立；三 FR 缺口均经源码+最小实验证实存在 | 基线 git `a7f6ec8`；AtomicStorage 无 range API；DispatchResponse 无 outcome；Entity 无 retention；scopedSequence+asyncTaskRetention 25 passed | additional task 1 设计评审 |
| d0-review | additional task 1 设计评审 | 需要修订 | R1 attempt回放步骤未闭合(类2/4)；R2 Interaction/Activity读者漏枚举(类1/3)；R3 retention orderBy类型矛盾(类2)；基线25 passed | additional task 2 设计裁决 |
| d1 | additional task 2 设计裁决 | 采纳 R1/R2/R3 并修订设计；无驳回项；status 仍为设计中 | R1: `runDispatchAttemptBody` 固定 guard→map→create→resolve→afterDispatch，设计原「跳过部分副作用」未规定是否跳过事件 create/guard/afterDispatch/postCommit——已改为步骤表(含 replayed 仍 guard、跳过 create/resolve/afterDispatch/postCommit)。R2: InteractionCreateArgs 无扩展字段；ActivityManager 手工拷贝 guard/map/resolve/afterDispatch/postCommit 不含未列字段——已补 EventSource/Interaction/Activity 安装与转发合同及 eventSource.name 键空间。R3: bounded 分支 orderBy 必填与「仅 TTL 可省」矛盾——改为 retainLatest 支必有 orderBy、ttl-only 支无 orderBy 的可辨别联合。复验 25 passed @ a7f6ec8 | additional task 1 设计复审（d=1） |
| d1-review | additional task 1 设计复审 | 需要修订 | R1: §3.1 将 Custom 与 Transform 的 this 合并为 Controller；Custom 实际 this={controller,state,getState}，须 this.controller.system.storage.atomic（类1 关键事实错误）。IDEM 步骤表/读者面、RET 可辨别联合、三缺口求证本轮成立。基线 25 passed | additional task 2 设计裁决 |
| d2 | additional task 2 设计裁决 | 采纳 R1 并修订设计；无驳回项；status 仍为设计中 | R1(类1): §3.1 将 Custom/Transform 的 this 合并为 Controller；源码 Transform.ts bind/call(controller) 成立，Custom.ts compute 等 this={controller,state,getState} 须 this.controller.system.storage.atomic。已拆分官方示例+this 表，M-02 验收要求两种回调各一例。同类范围仅命中 §3.1/M-02。基线 scopedSequence+asyncTaskRetention 25 passed @ a7f6ec8 | additional task 1 设计复审（d=2） |
| d3 | additional task 2 设计裁决 | 采纳 R1（类2/1），无驳回；status 仍为设计中 | R1: Activity `wrappedGuard` 在 head 无 activityId 时 `activityCall.create`，非 head/`checkActivityState` 在步完成后会 `ActivityStateError`；设计原「replayed 仍执行完整 eventSource.guard + 跳过 afterDispatch + M-04 Activity 成功回放」不能同时成立（对照 `ActivityManager.ts`/`runDispatchAttemptBody`）。同领域第二次复审→§3.2.4 改为阶段 A/L-open/… + 参考算法 + Activity 真值表 ★1/★4；`admission`/`openLedger` 分列；I7 fail-fast；M-04 强制真实 Activity 合同。基线 25 passed @ a7f6ec8 | additional task 1 设计复审（d=3） |
| d3-review | additional task 1 设计复审 | 通过 | 六类均未命中阻塞项；源码核对 AtomicStorage/DispatchResponse/Entity/Activity 包装/attempt 顺序/Transform·Custom this 与 §3.2.4 一致；基线 25 passed @ a7f6ec8；实现注意事项 10 条（建表触发、key 不得依赖 activityId 等）不触发复审 | additional task 2 设计裁决 |
| d4 | additional task 2 设计裁决 | 设计通过；未采纳任何「需要复审的问题」；status→实现中；N=5×6=30 | 评审 conclusion=通过、需要复审的问题=（无）。独立核验：AtomicStorage 仍仅单值 API；DispatchResponse 无 outcome；EntityCreateArgs 无 retention；`runDispatchAttemptBody` 序 guard→map→create→resolve→afterDispatch；Activity `wrappedGuard` 含 fullGuard+create/check、包装未转发 idempotency；Transform this=Controller / Custom this={controller,state,getState}；§3.2.4 算法+真值表 ★1/★4 与 checkActivityState 完成后重入矛盾已闭合。基线 25 passed @ a7f6ec8 | additional task 3 实现轮（M-01） |
| k=1 | additional task 3 实现 | M-01 → 待审 | 复核 §1 与源码：AtomicStorage 无 range；DispatchResponse 无 outcome；Entity 无 retention；cleanupAsyncTasks 仅 task 终态。验收 `scopedSequence`+`asyncTaskRetention` 25 passed @ a7f6ec8；无生产代码改动 | additional task 4 审计 M-01 |
| k=1-audit | additional task 4 审计 | M-01 通过 → `已完成`；无实现缺陷；无 reopen | 独立复跑 scopedSequence+asyncTaskRetention **25 passed**；源码核对 AtomicStorage/DispatchResponse/EntityCreateArgs/cleanupAsyncTasks 与 §1 一致；工作树无生产改动 @ a7f6ec8 | additional task 3 实现 M-02 |
| k=2 | additional task 3 实现 | M-02 → 待审 | 实现 `reserveSequenceRange` 共享内核（System 类型 + MonoSystem upsert）；合同测 `sequenceRange.spec.ts` **11 passed**；scopedSequence 22 + asyncTaskRetention 3 回归绿；`npm run check` 通过 | additional task 4 审计 M-02 |
| k=2-audit | additional task 4 审计 | M-02 通过 → `已完成`；无实现缺陷；无 reopen | 独立复跑 sequenceRange **11 passed**；scopedSequence+asyncTaskRetention **25 passed**；`npm run check` 通过；共享内核与 Transform/Custom 合同与当时 §3.1 一致（见设计 M-02 审计栏） | additional task 3 实现 M-03（后经 d5 修订含 setup 建表） |
| d5 | 用户授权设计修订（非评审循环） | 任务写入要求 8（无历史兼容负担）；设计按终态合同重写：admit/open 唯一管道、ComputationActionContext.atomic、setup 总是建表、幂等 in_flight 一等码、retention mode=cap|ttl、M-03/04/05/06 更新；M-01/M-02 保持已完成 | 依据会话结论与用户指示「不考虑历史负担」；未走 additional task 1/2 全循环 | 实现续 M-03（含 d5 setup） |
| d6 | additional task 2 设计裁决 | 采纳 R1（类3/5），无驳回；status→设计中；d=6 | R1: 源码 `requiresScopedSequenceState` 仍绑定 `declarations.length>0`；S1 setup / S2 prepareMigrationAdditive / S3 applyMigrationAdditivePlan（S3 内联分叉）均不会在无 Property 时建表；M-03 验收原只强制 install 侧。已写入单一 `needsScopedSequenceTable`、S1–S3 清单、M-03 含 migration/apply、§3.2.11a 幂等表 I1–I3 同构；§1.1 标 M-01 快照；基线工作树更新。 复验 sequenceRange+scopedSequence+asyncTaskRetention **36 passed** @ a7f6ec8 | additional task 1 设计复审（d=6） |
| d6-review | additional task 1 设计复审 | 需要修订 | R1: §3.1 `needsScopedSequenceTable` 伪代码写 `atomicSequenceCapability === true`，但类型/驱动均为对象，字面实现恒假、S1–S3 永不建表（类1，衍生类2）。S1–S3/I1–I3 清单与三 FR 主方案本轮成立；基线 36 passed | additional task 2 设计裁决 |
| d7 | additional task 2 设计裁决 | 采纳 R1（类1，衍生类2），无驳回；status 仍为设计中 | R1: `AtomicSequenceCapability` 为对象（System.ts）；PG/PGLite/SQLite 赋对象、MySQL 无字段；`validateAtomicSequenceTarget` 用真值性。设计伪代码 `=== true` 字面恒假。已改为 `!!db.atomicSequenceCapability && typeof setup…==='function'`；规则表「假」仅无 capability/无 setup；M-03 抽查禁止 helper `=== true`；§7 备忘同步。不重开 M-01/M-02；S1–S3/I1–I3 不变。复验 sequenceRange+scopedSequence+asyncTaskRetention **36 passed** @ a7f6ec8 | additional task 1 设计复审（d=7） |
| d7-review | additional task 1 设计复审 | 通过 | 六类均未命中阻塞项；d7 谓词 `!!capability && typeof setup==='function'` 与对象型 AtomicSequenceCapability / validateAtomicSequenceTarget 对齐；S1–S3/I1–I3、admit/open、Activity 真值表、retention 联合、M-03…M-06 验收本轮成立；基线 36 passed @ a7f6ec8；实现注意事项 10 条不触发复审 | additional task 2 设计裁决 |
| d8 | additional task 2 设计裁决 | 设计通过；未采纳任何「需要复审的问题」；status→实现中；N 保持 5×6=30 | 评审 conclusion=通过、需要复审的问题=（无）。独立核验：AtomicSequenceCapability 为对象；validateAtomicSequenceTarget 用真值性；设计 needsScopedSequenceTable 为 `!!cap && typeof setup==='function'`（禁止 === true）；S1–S3 源码仍 declarations 门闩（M-03）；Dispatch 仍 guard、无 outcome；Activity wrappedGuard 字段白名单无 idempotency；Transform this=Controller / Custom this={controller,…}；Entity 无 retention。基线 sequenceRange+scopedSequence+asyncTaskRetention **36 passed** @ a7f6ec8 | additional task 3 实现轮（M-03） |
| k=3 | additional task 3 实现 | M-03 → 待审 | 抽出 `needsScopedSequenceTable`（!!cap && typeof setup）；S1/S2/S3 全部改用；删除 declarations 建表门闩。sequenceRange 无 Property 夹具 + S2/S3 lifecycle **12 passed**；postgresqlSequenceRange 双连接并发 **2 passed**（真实 PG 绿跑）；scopedSequence+asyncTaskRetention 回归 **25 passed**；check 通过；`test:postgres` 纳入新套件 | additional task 4 审计 M-03 |
| k=3-audit | additional task 4 审计 | M-03 通过 → `已完成`；无实现缺陷；无 reopen | 独立复跑 sequenceRange+scopedSequence+asyncTaskRetention **37 passed**；postgresqlSequenceRange **2 passed**（真实 PG 双连接）；postgresqlScopedSequence **2 passed**；check 通过；S1/S2/S3 同源 `needsScopedSequenceTable`；无 declarations 门闩/无 `=== true`；lifecycle DROP+空 requirements 证明 S2/S3 | additional task 3 实现 M-04 |
| k=4 | additional task 3 实现 | M-04 → 待审 | admit/open 唯一管道 + 声明式幂等 + outcome；`_DispatchIdempotency_` I1–I3 总是建；Activity 分列 admit/open 转发 idempotency；IdempotencyError IN_FLIGHT；`dispatchIdempotency.spec.ts` **13 passed**（含真实 Activity ★1/★4、postCommit/BT、I5/I10）；eventSource/activity/scopedSequence/sequenceRange/transaction* 回归绿；`npm run check` 通过 | additional task 4 审计 M-04 |
| k=4-audit | additional task 4 审计 | M-04 通过 → `已完成`；无实现缺陷；无 reopen | 独立复跑 dispatchIdempotency **13 passed**；相关回归 136+activity2 绿；check 通过；源码核对 admit/open 管道、I1–I3、Activity ★1/★4、IN_FLIGHT；对抗探针 scope:interaction / ★2 / 序列化通过 | additional task 3 实现 M-05 |
| k=5 | additional task 3 实现 | M-05 → 待审 | EntityRetention 联合 + maintainEntityRetention + 可选 auto-hook；migration retention 签名；entityRetention.spec.ts **13 passed**；check 通过；相关回归绿 | additional task 4 审计 M-05 |
| k=5-audit | additional task 4 审计 | M-05 通过 → `已完成`；无实现缺陷；无 reopen | 独立复跑 entityRetention **15 passed**（审计加强 mutation events + failed/BT auto-hook）；相关回归 50+asyncTask 3 绿；check EXIT 0；源码核对 §3.3 联合/唯一入口/cap→ttl 序/storage.delete 事件/挂钩时序；验证缺口直接加强后关闭 | additional task 3 实现 M-06 |
| k=6 | additional task 3 实现 | M-06 → 待审 | ComputationActionContext + Transform/Custom `this.atomic`；sequenceRange 官方路径；usage/generator 删除双 this/循环 next/扫 effects/手写 prune；CHANGELOG Unreleased；check EXIT 0；验收 65 passed；versionControl/transform/custom 23 passed；postgresqlSequenceRange 2 passed | additional task 4 审计 M-06 |
| k=6-audit | additional task 4 审计 | M-06 退回 `开放`；reopen-count 1；领域 `knowledge-callback-this-doctrine`；convergence=normal | 复验 check+65+PG range2+回归92 绿；代码注入/导出正确；**D1** generator/api-reference Transform 仍教 `this: Controller`/`this.system.storage`，Custom 合同缺 `atomic`；探针证实 residual 路径运行时抛错；usage 已收敛不能掩盖 generator 主体 | additional task 3 实现 M-06（修 generator 教义） |
| k=7 | additional task 3 实现 | M-06 → 待审（闭合 D1） | generator/api-reference：Transform 合同+10 callback→ComputationActionContext/`this.controller.system.storage`；Custom 合同补 atomic；门闩无 Transform 旧绑定；Condition/EventSource/StateMachine 合法 Controller 保留；check EXIT 0；65 passed；postgresqlSequenceRange 2 passed | additional task 4 审计 M-06 |
| k=7-audit | additional task 4 审计 | M-06 通过 → `已完成`；无实现缺陷；无 reopen 增量；任务 `status: 已完成` | 独立复跑 check EXIT 0；65 passed；postgresqlSequenceRange 2；postgresqlScopedSequence 2；回归 92；D1 门闩无 Transform 旧绑定；Custom 含 atomic；Task 要求 1–8 最终核验通过 | 终止（不启动新 chat） |


---

## 终止总结

| 项 | 值 |
|----|----|
| 终止状态 | `已完成` |
| 终止原因 | 全部里程碑 M-01…M-06 审计通过；最终核验（验收命令 + Task 要求 1–8）通过 |
| 设计轮数 | d=8/15 |
| 实现轮数 | k=7/30（N=5×6=30） |
| 里程碑终态 | M-01…M-06 全部 `已完成` |
| 设计阶段采纳的问题类别 | 类1 关键事实错误；类2 内部逻辑矛盾；类3 违反项目原则/读者漏枚举；类5 里程碑验收缺口（见 d0–d8 行） |
| 审计实现缺陷数 | 1（M-06 D1 `knowledge-callback-this-doctrine`，k=6-audit；k=7 闭合） |
| 审计验证缺口数 | 1 轮次内直接加强后关闭（M-05 mutation events + failed/BT auto-hook）；未单独 reopen |
| 各里程碑 reopen | M-01…M-05：0；M-06：1（领域 `knowledge-callback-this-doctrine`） |
| 收敛模式 | 全程 `normal`；未触发 domain-review / milestone-review |
| M-06 关闭轮次 | k=7-audit |
| 自动调整里程碑次数 | 0（实现中未拆分/合并里程碑编号；d5 用户授权修订更新了未完成里程碑合同，N 未变） |
| 人工介入 | d5 用户授权设计修订（任务要求 8 / 无历史兼容负担）1 次；其余按协议自动交替 |
| 预算 | 满足（k=7 ≤ 30） |
| 未完成阻塞 | 无 |

### 协议改进建议（最多三项）

1. **公开教义应纳入可执行门闩**：M-06 自动化 65 测全绿仍放过 generator 主体旧 `this: Controller` 合同（D1）。证据：k=6-audit 探针 residual `this.system.storage` 运行时 TypeError。建议将「Transform/Custom 回调 this 形状」做成静态文档断言或片段合同测，与 runtime 注入同源约束。
2. **能力对象谓词勿写字面 `=== true`**：d6→d7 因 `AtomicSequenceCapability` 为对象导致设计伪代码恒假。证据：评审 R1 类1。模板/检查清单可提示「capability 用真值性 + typeof setup」。
3. **Activity / 幂等交叉真值表宜在设计早期强制**：d3 因 `wrappedGuard` 与 replayed 步骤表冲突二次复审。证据：d3 R1。涉及多阶段 guard 的设计应默认附 ★ 真值表再进实现。
