# Effect (EffectTS) 对 interaqt 的适用性评估

日期：2026-08-31
结论：**不建议引入 Effect。** Effect 解决的问题层与 interaqt 的核心难点不重叠；在少数重叠的领域（类型化错误、重试、资源管理、依赖注入），interaqt 已有领域定制的解法，Effect 的通用组合子不构成显著改善，而其病毒式类型签名与运行时成本会直接违反本框架"最小表面积"与"显式控制"两条原则。评估过程中发现的两处真实改进点（`DispatchResponse.error` 的类型、Klass 静态注册表的全局可变状态）都可以在不引入 Effect 的前提下解决。

## 1. Effect 的能力图谱

Effect 是一个 TypeScript 的效应系统运行时，核心类型 `Effect<A, E, R>` 把一段程序的成功值（A）、类型化失败（E）、环境依赖（R）编码进类型签名。其主要能力：

| 能力 | 机制 |
|------|------|
| 类型化错误通道 | `E` 泛型参数，编译期穷举失败分支（`catchTag`） |
| 依赖注入 | `Context` / `Layer`，环境依赖在 `R` 中显式声明 |
| 结构化并发 | Fiber（轻量协程）、可中断、父子生命周期绑定 |
| 资源安全 | `Scope` / `acquireUseRelease`，保证释放 |
| 重试与调度 | `Schedule` 组合子（指数退避、抖动、条件重试） |
| 事务性内存 | STM（进程内共享内存的乐观事务） |
| 流处理 | `Stream`，带背压的拉式流 |

关键点：这些能力全部作用于**单进程内的程序组合层**——"如何把一段段效应程序安全地拼起来、跑起来"。

## 2. interaqt 的问题层与现状逐项比对

interaqt 的核心命题是**数据语义编译**：把"数据是什么"的声明编译为增量计算 + SQL，执行语义锚定在数据库事务上。逐项对照 Effect 的能力：

### 2.1 类型化错误 —— 已有领域分层方案，Effect 的单一 E 通道反而不匹配

现状（`src/runtime/errors/`、`src/runtime/Controller.ts`）：
- `FrameworkError` 抽象基类携带 `errorType`、`context`、`causedBy` 因果链与链遍历工具；子类（`ComputationError`、`ConstraintViolationError`、`BusinessTransactionBoundaryError` 等）带字符串联合类型的 `code` 字段。
- 失败传播是**刻意的三层分类**，而非单一通道：
  1. 边界错误（`NestedDispatchError` 等）——硬抛出，调用方永远看到异常；
  2. 事实事务（stage A）失败——落入 `DispatchResponse.error`，Result 风格软返回；
  3. 提交后（stage P）失败——不设 `error`、不回滚事实，落入 `postCommitPhase.failures`。

Effect 的 `Effect<A, E, R>` 只有一条失败通道。要表达上述三层语义，必须把 stage A 错误放进 A（`Either` 嵌套）或拆多层 Effect——写出来比现在的 `DispatchResponse` 更绕。错误分类的难点从来不在通道类型，而在**领域判定逻辑**（哪些码可重试、哪些必须升隔离级别、哪些属于连接级致命），这部分 Effect 不提供。

**真实短板**：`DispatchResponse.error?: unknown`（Controller.ts:129）确实丢失了类型信息，调用方无法编译期穷举。但修复方式是一个可辨识联合类型（`DispatchError = InteractionGuardError | ComputationError | ConstraintViolationError | ...`），零依赖即可完成。

### 2.2 重试与调度 —— `Schedule` 能表达退避，表达不了隔离级别升级

现状（`src/runtime/transaction.ts:174-346`）：`runWithTransactionRetry` 提供 5 次尝试、`[10,25,60,150,350]ms` 抖动退避，可重试性由**遍历错误因果链匹配错误码集合**判定（PG 40001/40P01/57P01、ECONNRESET/EPIPE、SQLITE_BUSY），且区分三个谓词（通用可重试 / BT SAVEPOINT 可重试 / 连接级致命快速失败）。`RequireSerializableRetry` 信号会让重试**升级隔离级别到 SERIALIZABLE**。

`Effect.retry(Schedule.jittered(Schedule.exponential(...)))` 可以复现退避曲线，但"重试时更换隔离级别重新 BEGIN"、"SAVEPOINT 级重试 vs 整个业务事务快速失败"这类**与数据库事务语义耦合的状态化重试策略**，仍要手写等量的领域逻辑。净收益约等于替换 30 行退避循环，代价是整个运行时。

### 2.3 资源管理与环境传递 —— ALS 已承担 FiberRef 的职责，且混用有真实风险

现状：连接获取/释放是 `pg.Pool` + try/finally（`src/drivers/PostgreSQL.ts:244-282`）；环境传递用 `AsyncLocalStorage`（dispatch 执行上下文、业务事务上下文、事件累积上下文、驱动事务上下文）。这正是 Effect 用 `Scope` + `FiberRef`/`Context` 解决的问题，Effect 的方案在纯 Effect 代码里确实更优雅。

但存在硬性技术风险：**Effect 的 Fiber 调度与 Node 的 AsyncLocalStorage 传播模型不兼容**——Fiber 可能在不同的微任务边界间跳转执行，ALS 上下文会丢失。半迁移状态（部分代码 Effect 化、部分保留 ALS）会制造隐蔽的上下文丢失 bug，比现状更差。要安全就必须全量迁移，见 §3 成本分析。

### 2.4 并发 —— interaqt 刻意把并发控制放在数据库层，Fiber/STM 在错误的层

现状：无进程内队列、无 worker 池。并发正确性完全委托给数据库——行锁（`AdmissionSnapshot` 全局稳定排序加锁避免死锁）、隔离级别（含 SERIALIZABLE 升级）、幂等账本（`_DispatchIdempotency_` 表）。这是**设计决定**而非缺失：多进程部署下，进程内的 Fiber 锁和 STM 对跨进程竞争毫无作用。Effect 的结构化并发解决的是"一个进程里的一万个协程"，interaqt 的问题是"三个进程各自的事务在同一行上竞争"——层不对。

### 2.5 异步计算生命周期 —— 持久化任务表是为了跨进程存活，Fiber 不可持久化

现状（`src/runtime/Scheduler.ts:1249-1434`）：异步计算的任务是**数据库表中的行**（status/args/result/freshnessKey），由外部 worker 填结果、守护进程回调 `handleAsyncReturn`，新鲜度用分区内 MAX(id) 排序判定，失效靠删除未应用的任务行。没有超时/取消/自动重试——因为任务生存期跨进程、跨重启，取消语义就是行删除。

Effect 的 Fiber 中断是进程内内存操作，进程重启即消失，无法承载这个模型。Effect 生态的 Workflow/Cluster 是另一个量级的基础设施引入，且其持久化模型与 interaqt "任务即实体行、参与响应式计算"的设计根本不同。

### 2.6 事件管道 —— 同步、事务内、有回滚一致性机制，Stream 的背压模型不适用

现状（`src/runtime/MonoSystem.ts:1958-2044`）：变更事件是同步推送回调，**在同一个事实事务内**执行（计算调度器就是监听器之一），配有回滚时截断事件数组的基线机制、重试时的每次尝试独立数组。事件必须与事务同生共死——这排除了任何异步的、带背压的流模型。`Stream` 在这里没有位置。

### 2.7 核心价值层 —— Effect 完全无涉

增量视图维护、脏记录追踪、计算到 SQL 的编译、迁移签名、方言语义差异（真实 PG vs PGLite 的 id 分配差异）、新鲜度排序——这些是 interaqt 全部困难所在，也是测试体系（生成式 fuzz 套件、维度注册表）围绕的对象。Effect 对此没有任何原语。

## 3. 采纳成本

1. **病毒式类型签名**。若 `dispatch` 返回 `Effect<DispatchResponse, E, R>`，每个下游应用作者都必须引入 Effect 运行时、学习 generator/pipe 风格，所有 `Condition.content`、`Transform.callback` 等用户回调都要 Effect 化或包裹。这直接违反"每个用户必须学习的概念都是成本"。
2. **边界翻译损耗**。替代方案"内部用 Effect、边界暴露 Promise"：`runPromise` 会擦除 E 通道，编译期错误穷举的最大收益在边界处归零；付出了运行时依赖和双风格代码库的成本，收益只剩内部代码的组合风格偏好。
3. **框架级依赖承诺**。interaqt 目前对下游的运行时依赖极少。引入 Effect 意味着把一个大型、快速演进的运行时纳入框架的永久契约面。

## 4. 评估中发现的真实改进点（不需要 Effect）

1. **`DispatchResponse.error` 类型化**：从 `unknown` 收窄为可辨识联合类型，调用方可编译期穷举。这是 Effect 式思维的正确借鉴——"让失败出现在类型里"——但用普通联合类型即可实现。
2. **Klass 静态注册表**（`Entity.instances` 等模块级全局可变状态）：存在测试隔离与多 Controller 共存的固有问题。Effect 的 `Layer` 能解决，但实例作用域的注册表（registry 随 Controller 创建）同样能解决，且不改变用户 API 风格。

以上两项如需推进应各自立项，与本评估解耦。

## 5. 方法论教训：如何评估"要不要引入某框架"

1. **先定位问题层**。Effect 作用于"单进程效应程序的组合与执行"；interaqt 的难点在"数据语义编译 + 以数据库为锚的跨进程执行"。层不重叠时，再优雅的工具也只能触及外围。
2. **对照痛点清单，而非能力清单**。营销页列的是工具能做什么；决策依据应是你的缺陷清单上有什么。本仓库 30+ 轮评审积累的缺陷全部在 Effect 域之外（计算轨道遗漏、方言分叉、新鲜度排序、迁移破坏性作用域）。
3. **计算边界成本**。带类型参数的抽象（`Effect<A, E, R>`）是病毒式的：要么全量采纳（下游一起付学习成本），要么边界擦除（收益大幅衰减）。框架作者的采纳决定会被所有下游放大。
4. **区分"这个思想好"与"需要这个依赖"**。类型化错误通道是好思想，可辨识联合类型就能落地；资源安全是好思想，try/finally + 收敛点封装已经落地。思想可以偷师，依赖必须精算。
