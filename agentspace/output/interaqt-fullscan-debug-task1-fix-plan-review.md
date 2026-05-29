# interaqt-fullscan-debug-task1-fix-plan review

## Review 范围

本轮 review 按 `agentspace/prompt/interaqt-fullscan-debug.md` 的 Task 1 additional task 1 执行：深度理解 `Transform.create({ record: InteractionEventEntity })` 增量路径前全表扫描问题，并检查 `agentspace/output/interaqt-fullscan-debug-task1-fix-plan.md` 是否存在致命错误，或是否违背“框架级、根因级、一次性完善解决”的原则。

我核对了这些关键代码：

- `src/runtime/Scheduler.ts`：`runComputation()` 当前确实在 full / incremental 分支前 eager `resolveDataDeps()`，且 `resolveDataDeps()` 对 records dep 使用 `storage.find(source.name, undefined, {}, attributeQuery)`，忽略 `match` / `modifier`。
- `src/runtime/computations/Transform.ts`：data-based Transform 的 incremental patch path 自己按 source id `findOne()`，原始 `_Interaction_` full scan 来自 scheduler 预解析，而不是 Transform patch 逻辑本身。
- `src/runtime/migration.ts`：`MigrationScheduler.runOneDirtyComputation()` 也在 incremental 前 eager `resolveDataDeps()`，并按 `useLastValue` 直接读取 last value，原方案要求 migration 复用同一执行策略是必要的。
- `src/runtime/Controller.ts`：`retrieveLastValue()` 对 entity/relation output 会读取完整输出表，是同类隐式全量读取侧门；当前方案已经把它纳入 `IncrementalPlan`。
- `src/runtime/ComputationSourceMap.ts`：records dep 的 update source map 当前只从 `attributeQuery` 生成，没有纳入 `RecordsDataDep.match` 或 `modifier.orderBy` 的 membership 触发语义；当前方案已经覆盖这点。
- `src/core/Transform.ts` 与 `src/runtime/computations/Transform.ts`：Transform 的 `dataDeps` 只存在于类型/运行时半分支里，core constructor/stringify/clone/parse 不保存它；当前方案选择移除这个半支持入口，方向合理。
- `src/runtime/computations/WeightedSummation.ts`：global handle 当前不把外部 deps 传给 callback，而 property handle 会传；当前方案要求补齐 global/property 语义一致，判断正确。

## 结论

没有发现 P0/P1/P2 级别问题。当前 fix plan 的方向是正确的：它没有把问题局限在 Transform，也没有把 Mesh 侧 `eventDeps` 迁移当作框架修复，而是把根因放在 scheduler/computation 协议层，要求增量路径显式声明需要解析哪些 deps、是否需要 last value，并让正常调度与 migration 共享同一执行策略。

当前方案也已经补上了几个容易遗漏的框架级边界：

- `useLastValue` 不再作为绕过 plan 的隐式全表读取入口。
- `RecordsDataDep.match` 同时影响 full resolve 和 source map membership 触发。
- `RecordsDataDep.modifier`，尤其 `orderBy` / `limit` / `offset`，被当作 membership 语义处理，而不是只当作查询参数。
- 外部 dep 触发时先决策 full recompute，避免 partial resolve 后又 fallback full resolve 的重复读取。
- `resolveAllDataDeps()` / `resolveSelectedDataDeps()` 拆分，避免 `undefined` / `[]` 这类隐式约定。
- Custom / 第三方 DataBasedComputation 缺少增量计划时明确失败，不保留旧 eager resolve 默认路径。
- async、resolved result、patch apply、SERIALIZABLE、migration 写入差异都被纳入共享 helper 的职责边界说明。

## 非阻塞建议

### P3: 澄清 Summation / Average 是否真的要支持外部 dataDeps

方案在“内置 computation 的增量依赖声明”里多次用“默认解析外部 deps”描述 `GlobalSummation` / `GlobalAverage` / property summation-average 一类 computation。但当前 `src/core/Summation.ts` 和 `src/core/Average.ts` 没有公开 `dataDeps`，runtime handle 也只构造主 dep。这里不影响 full-scan 修复正确性，但实现时容易让人误以为需要顺手扩展 Summation/Average 的 public API。

建议在原方案里把这句话收窄为：

- 对当前没有 `args.dataDeps` 的 Summation/Average，`planIncremental()` 只需声明跳过主 dep。
- 只有 Count / Any / Every / WeightedSummation / Custom 这类当前已有外部 deps 的 computation，才需要在增量路径解析 external dep keys。
- 若未来要给 Summation/Average 增加外部 deps，应作为独立 API 扩展，并配套 full/incremental callback 语义测试。

### P3: 协议校验要按运行时分类，避免误伤 eventDeps Transform

`RecordsTransformHandle` 这个类同时承载 record 模式和 eventDeps 模式；当前 scheduler 通过 `eventDeps` 是否存在来判断 data-based 还是 event-based，而不是通过类实现的 TypeScript interface。方案说“只要 DataBasedComputation 声明 incrementalCompute / incrementalPatchCompute，就必须实现 planIncremental()”，这个原则正确，但实现时要按 runtime computation instance 的实际分类校验。

建议在原方案中补一句：

- 协议校验只适用于 scheduler 认定为 data-based 的 computation；`Transform.create({ eventDeps })` 仍走 event-based source map，不应因为 handle 类上存在 `incrementalPatchCompute` 而被要求声明 data-based `planIncremental()`。

这只是实现防呆，不改变设计方向。

## 建议结论

当前文档可以进入 additional task 2 的“逐条 review 意见处理”阶段。由于本轮没有 P0/P1/P2 意见，additional task 2 处理完本 review 后不需要继续启动下一轮 additional task 1。

## Additional Task 2 处理结果

- P3 “澄清 Summation / Average 是否真的要支持外部 dataDeps”：已采纳。已在原方案中明确当前 `Summation` / `Average` core API 没有公开 `dataDeps`，runtime handle 也只构造主 dep；本次只需要跳过主 dep，未来如需外部 deps 应作为独立 API 扩展并补测试。
- P3 “协议校验要按运行时分类，避免误伤 eventDeps Transform”：已采纳。已在原方案中明确 `planIncremental()` 协议校验只适用于 scheduler 认定为 data-based 的 computation；`Transform.create({ eventDeps })` 仍走 event-based source map。
