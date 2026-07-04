# core / runtime / builtins 深度 Review 报告

- 日期:2026-07-04
- 基线 commit:`f6eb89d`(main,detached at `df1a9eb`)
- 范围:`src/core`、`src/runtime`、`src/builtins` 三个包(约 20,000 行),`src/storage` 仅在追溯问题根因时交叉阅读
- 方法:三个包并行深度探查 + 人工精读关键执行路径(Controller.dispatch、Scheduler、transaction、ComputationSourceMap、各 computation handle、InteractionCall/ActivityCall)+ 对致命判定编写最小复现测试实际运行验证

> **维护说明**:本报告最初记录的 7 个致命问题(F1–F7,含并入 F7(a) 的原 S18)已全部修复并有回归测试覆盖(分支 `cursor/fix-fatal-review-issues-9cda`,回归测试见 `tests/runtime/review-repro-{guards,activity,computations}.spec.ts`),相关条目已从本文档删除以免误导后续工作。下文仅保留**尚未修复**的显著问题与债务项。

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

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| S9 | **Relation 的 `isTargetReliance` 继承被覆盖** | `Relation.ts` L114/131 vs L150 | merged/filtered 分支从 inputRelations/baseRelation 继承该值,但 L150 无条件 `args.isTargetReliance ?? false` 覆盖,用户未显式传参时继承值恒被抹成 false。storage 用它决定 reliance 删除语义(`Setup.ts` L388/591、`DeletionExecutor.ts` L299)。目前 filtered/merged relation + reliance 的组合无测试覆盖,一旦使用即错。L114/131 是死代码 —— 要么删掉,要么修 L150 只对普通 relation 生效 |
| S10 | **序列化 round-trip 系统性不完整** | 多文件 | ① `Entity/Relation.stringify` 不用 `stringifyAttribute`,嵌套的 properties/baseEntity 序列化为 plain object,parse 后不是 Instance;② `Property.stringify` 丢 `computation`,`computed` 是裸 Function 被 `JSON.stringify` 丢弃;③ `Transform.stringify` 丢 `eventDeps`;④ `StateNode.stringify` 丢 `computeValue`;⑤ `Summation/Average/Every/Dictionary` 各丢 `property`/`direction`/`notEmpty`/`defaultValue`;⑥ `createInstances` 没有第二遍 `uuid::` 引用解析,与 `stringifyAttribute` 的输出格式不配套。**当前运行时主流程不依赖这条序列化管道所以未爆雷,但它是 public API(`stringifyAllInstances`/`createInstancesFromString`),现状是"看起来能用、实际不可 round-trip"** —— 要么修完整,要么明确废弃 |
| S11 | **`init.ts` 未注册 `NonNullConstraint`、`Custom`** | `init.ts` L22–43 | 反序列化遇到这些类型仅 `console.warn` 跳过(`utils.ts` L120–122),静默丢数据。未知 type 应 throw |
| S12 | **clone 语义不一致且污染全局 registry** | `Entity.ts` L171–184 vs `Relation.ts` L349 | `Entity.clone` 走 `create()` 把 clone 注册进 `Entity.instances`(RefContainer 每次初始化都触发),`Relation.clone` 用 `new Relation()` 绕过 registry 与校验。两者应统一(建议都不注册),否则 `stringifyAllInstances` 输出重复、跨测试污染 |
| S13 | **`BoolExp.and/or` 用 truthy 过滤参数** | `BoolExp.ts` L232/241 | `filter(v => !!v)` 会丢弃 `0`/`false`/`''` 等合法 atom。当前调用点(如 `retrieveData` 合并 match)传的都是对象,未触雷,但作为通用 public API 应改为 `v != null` |
| S14 | **同步 `evaluate` 会把 Promise 当 truthy** | `BoolExp.ts` L384–395 | `AtomHandle` 类型允许返回 Promise,同步 evaluate 不检测,async handler 误用同步入口会静默恒真。应检测 `instanceof Promise` 并抛错 |
| S15 | **`Property/UniqueConstraint/NonNullConstraint.create` 不执行 name 格式校验** | `Property.ts` L87–98、`Constraint.ts` | `static.public.name.constraints.format` 声明了却不执行;property 名直接进入 SQL 列名,Entity/Relation 已在 create 强校验,此处不一致 |
| S16 | **`types.ts` 对 `CustomInstance` 值导入形成循环依赖** | `types.ts` L19 | `types → Custom → Computation → types`,当前靠 ESM 部分初始化侥幸工作,应改 `import type` |

### builtins

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| S17 | **`saveUserRefs` 对 `isCollection` payload 取 `.id` 得 undefined** | `ActivityCall.ts` L383–401 | collection 时 `payloadItem` 是数组,`(payloadItem as {id}).id` 为 undefined,refs 被污染;且 `checkUserRef`(L405–409)对数组 refs 用 `===` 比较恒 false。collection itemRef 从未真正工作过 |
| S19 | **`findStateNode` 嵌套 Group 时多取一层 `.current`** | `ActivityCall.ts` L90–95 | `find(child => child.findStateNode(uuid))?.current` 返回的是 seq 的 current 而非命中的 state node,嵌套 group 下 `completeInteraction` 会拿错节点 |
| S20 | **`PayloadItem.type` 声明了但从不校验** | `checkPayload` 全函数 | runtime 类型检查缺失,`type: 'string'` 传对象也通过 |
| S21 | **`DataAttributive`/`DataAttributives` 定义并导出但零接入** | `Data.ts` | `retrieveData` 只使用 `dataPolicy.match`,DataAttributive 是悬空 API,要么接入 `GetAction` 的 resolve 链,要么移除 |
| S22 | **未知 ActivityGroup type 直接 `new undefined()`** | `ActivityCall.ts` L132 | `GroupStateNodeType.get(type)!` 无校验,应在 Activity.create 时报清晰错误 |
| S23 | **头/非头 Interaction 的 guard 路径不一致** | `ActivityManager.ts` L105–124 | 头节点走 `interaction.guard`(遇 isRef attributive 会显式报错,无法消费 refs),非头节点走 `fullGuardWithUserRef`(不含 `interaction.guard` 中的完整逻辑),两套代码漂移。应提取统一的 guard runner |

### 分层违规

- **M-1**:`src/builtins/interaction/activity/ActivityCall.ts` L6 直接 `import { MatchExp } from "@storage"`,违反 `builtins → runtime → storage → core` 的单向依赖(builtins 不应直接触达 storage)。core 与 runtime 未发现违规。建议 runtime re-export MatchExp 或提供查询封装。

---

## 三、修复优先级建议

(原 P0/P1 中的致命项均已修复,见文首维护说明;以下为遗留项的建议顺序。)

**P1(需要设计,但属于框架可信度基石):**
1. S9 Relation `isTargetReliance` 覆盖修复。

**P2(债务清理):**
2. S10/S11/S12 序列化与 registry 一致性(或正式废弃这条管道)。
3. S1 计算拓扑排序、S3 global-dep 全表扫描、S17/S19 Activity 细节、M-1 分层违规。
4. 清理 `count-callback.spec.ts` / `count-hard-deletion.spec.ts` 头部过期的 "BUG ... This assertion FAILS" 注释:这些 bug 已由 `0875658`/`06375f0` 修复,测试断言正确值并通过,但注释仍宣称断言会失败,会严重误导读者(包括自动化 agent)对现状的判断。
