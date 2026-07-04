# core / runtime / builtins 深度 Review 报告

- 日期:2026-07-04
- 基线 commit:`f6eb89d`(main,detached at `df1a9eb`)
- 范围:`src/core`、`src/runtime`、`src/builtins` 三个包(约 20,000 行),`src/storage` 仅在追溯问题根因时交叉阅读
- 方法:三个包并行深度探查 + 人工精读关键执行路径(Controller.dispatch、Scheduler、transaction、ComputationSourceMap、各 computation handle、InteractionCall/ActivityCall)+ 对致命判定编写最小复现测试实际运行验证

> **维护说明**:本报告最初记录的 7 个致命问题(F1–F7,含并入 F7(a) 的原 S18)已全部修复并有回归测试覆盖(分支 `cursor/fix-fatal-review-issues-9cda`,回归测试见 `tests/runtime/review-repro-{guards,activity,computations}.spec.ts`),相关条目已从本文档删除以免误导后续工作。
>
> 显著问题中 **core(S9–S16)与 builtins(S17、S19–S23)及分层违规 M-1 已全部修复**并有回归测试覆盖(分支 `cursor/fix-core-builtins-review-issues-5b32`,回归测试见 `tests/core/review-fixes-core.spec.ts`、`tests/core/serialization-roundtrip.spec.ts`、`tests/runtime/review-fixes-builtins.spec.ts`),相关条目已从下表删除。其中 S21 的处置是**移除** DataAttributive/DataAttributives 悬空 API(从未接入任何 resolve 链,文档也早已声明其不存在)。下文仅保留**尚未修复**的 runtime 显著问题与债务项。

---

## 一、项目理解(目标与原理)

interaqt 是一个**声明式响应式后端框架**:用户声明"数据是什么"(Entity/Relation/Property + Count/Summation/Transform/StateMachine 等 Computation),而不是写"如何更新数据"。数据流严格单向:

```
Controller.dispatch(EventSource, args)
  └─ runWithTransactionRetry(默认 READ COMMITTED,可升级 SERIALIZABLE 重试)
      └─ storage.runInTransaction
          guard → mapEventData → 创建事件记录 → resolve → [级联同步计算] → afterDispatch → commit
  └─ commit 后:postCommit、RecordMutationSideEffect(失败只记入 sideEffects,不回滚)
```

同步计算的触发机制:每个 Computation 声明 `dataDeps`,`ComputationSourceMapManager` 把它们编译成「(recordName, 事件类型) → computation」的 source map;storage 的每次 mutation 产生 `RecordMutationEvent`,`Scheduler` 在**同一事务内**同步匹配 source map、计算脏记录、执行增量(`incrementalCompute`)或全量(`compute`,强制 SERIALIZABLE)计算并写回,写回又产生新的 mutation 形成级联。异步计算通过 task 记录 + `handleAsyncReturn` 独立事务应用。

分层 `builtins → runtime → storage → core` 基本被遵守(见 M-1 例外)。事务边界、post-commit 副作用隔离、`RequireSerializableRetry` 升级、filtered entity 成员资格 delete 时复位 bound state(`dd5feef` 修复)等近期工作质量较高。

**总体结论:架构和事务模型是健康的。**review 发现的致命问题(增量计算的 partial-record 错误、guard 链 fail-open、Activity 的 Gateway/`any` 组运行时缺陷)均已修复(见文首维护说明);遗留的是下述显著问题与债务清理项。

---

## 二、显著问题(Significant)

### runtime

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| S1 | **同一 mutation 触发的多个 computation 无拓扑排序** | `Scheduler.ts` L367–387 | 按 source map 注册顺序串行执行,若计算 A 的输出是 B 的输入且同批触发,B 可能基于陈旧值计算,依赖后续级联事件二次修正才收敛(收敛性依赖偶然而非设计)。migration 路径有 topo sort(`migration.ts`),runtime 主路径没有。建议 manifest 级构建依赖图排序,或至少检测环并文档化顺序契约 |
| S2 | **guard / mapEventData / afterDispatch 在 retry 边界内会被重放** | `Controller.ts` L608–638 | `RequireSerializableRetry` 与 40001 冲突都会整段重跑。`postCommit` 已正确隔离,但用户在 `afterDispatch`/`guard` 里做的非幂等外部 IO 会重复执行。README 有提示,但框架层面可考虑在 attemptArgs 上暴露 `attempt` 编号,并在错误信息中强化约束 |
| S3 | **global dict 变更触发依赖它的 property 计算时全表扫描 `['*']`** | `Scheduler.ts` L451–464 | 对每个依赖该 dict 的 property computation 做 host entity 全表 find 且在事务内,大表下是延迟与锁放大的隐患 |
| S4 | **`computeOldRecord` 对关联路径返回 `{...newRecord}` 占位** | `Scheduler.ts` L440–446(带 FIXME) | 关联实体变更时 oldRecord 是当前记录副本,依赖 old/new diff 的下游判断(如 membership 变化)可能误判 |
| S5 | **Property 级聚合在 relation delete 时不复位 per-item bound state** | `Summation.ts` L235–238、`WeightedSummation.ts` L204–207、`Count.ts` L241–251(各 property handle 的 relation delete 分支) | Global 路径在 `dd5feef` 中已修复并加了 CAUTION 注释,property 路径行为不对称;filtered relation 成员资格退出后再进入会读到陈旧 state |
| S6 | **`Controller.addEventListener`/`callbacks` 是死代码** | `Controller.ts` L568、L734–739 | `callbacks` 只写不读;另外 `agentspace/knowledge/filtered-entity-usage-guide.md` L252/256 示例的 `system.addEventListener(recordName, type, cb)` 在 System/MonoSystem 上**根本不存在**(签名也与 Controller 版不同),文档描述的是虚构 API。删除或接入,并修文档 |
| S7 | **GlobalAverage 对 null 字段的语义**:null 计 0 且计入分母 | `Average.ts` L63–77 | 与 SQL `AVG`(忽略 null)不同,应文档化或改为不计 count |
| S8 | **manifest/migration log 写入用字符串拼接 SQL** | `MonoSystem.ts` L1323–1331 等 | 目前 value 是框架生成的 hash/JSON,风险低,但属于埋雷,应统一参数化 |

### core

(S9–S16 已全部修复,见文首维护说明。)

### builtins

(S17、S19–S23 已全部修复,见文首维护说明。)

### 分层违规

(M-1 已修复:`ActivityCall.ts` 不再直接依赖 `@storage`,改用 `@core` 的 `BoolExp` 构造 match 表达式——storage 的 `MatchExpressionData` 就是 `BoolExp<MatchAtom>` 的别名。core 与 runtime 未发现违规。)

---

## 三、修复优先级建议

(原 P0/P1 中的致命项与 core/builtins 显著问题均已修复,见文首维护说明;以下为遗留项的建议顺序。)

**P2(债务清理):**
1. S1 计算拓扑排序、S3 global-dep 全表扫描。
2. 清理 `count-callback.spec.ts` / `count-hard-deletion.spec.ts` 头部过期的 "BUG ... This assertion FAILS" 注释:这些 bug 已由 `0875658`/`06375f0` 修复,测试断言正确值并通过,但注释仍宣称断言会失败,会严重误导读者(包括自动化 agent)对现状的判断。
