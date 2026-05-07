# Data Migration Task 3 Framework Bugs Review

## 结论

本轮逐项复核了 `agentspace/prompt/medeo-lite-data-migration-framework-bugs.md` 中的 5 个问题，并补充了对应测试。结论是：

1. event-based `Transform` dry-run 漏检是真问题，已修复为 dry-run/validation 阶段必须有 approved `event-rebuild-handler` 和运行时 handler。
2. `StateMachine` handler decision 无法 approve 是旧问题，当前 Phase 1.5 形态已不存在；已有测试证明 handler decision 可以被接受并执行。
3. 删除 async computation 后暴露内部 async task record 是真实的框架边界问题；当前 compute-route schema migration 不执行 destructive cleanup，本轮改成明确报告 framework-generated async task cleanup unsupported，避免伪装成应用 fact record 删除。
4. 删除 fact entity 在 Phase 1.5 中仍应显式阻断，而不是自动 drop table；本轮补测试证明错误信息明确说明 fact record removed。这个问题按当前设计不是“应自动迁移”的 bug，而是 Phase 1.5 不支持 destructive schema cleanup 的安全边界。
5. 删除 non-async computed property 后物理 column 静默残留是真问题；本轮改成 dry-run 明确产生 blocking change，说明 computed attribute physical cleanup unsupported，避免 manifest 与物理 schema 静默漂移。

## 逐项结果

### 1. Dry Run Does Not Catch Unsupported Recompute Paths

真实存在于 event-based `Transform` 场景：`Transform` 有 `eventDeps` 时不能调用 full `compute()`，否则真实 migration 会抛出 `Transform compute should not be called with eventDeps`。

修复：`getRecomputeBlockingChanges()` 现在对所有 event-based computation 都要求 approved `event-rebuild-handler` 和 runtime handler，不再因为对象上存在 `compute` 方法就误认为可重算。

测试：`event-based Transform dry-run requires an external rebuild handler`。

### 2. StateMachine Rebuild Handler Requirement Cannot Be Approved

当前实现中该问题不存在。Phase 1.5 的 diff 会生成 `event-rebuild-handler` required decision，`validateApprovedDiff()` 也按同一个 `dataContext` 接受对应 decision。

测试：已有 `StateMachine event rebuild handler is executed when provided` 覆盖 handler 校验与执行；`event-based computations without external rebuild handler are blocked` 覆盖缺 handler 时 fail fast。

### 3. Deleting Async Computation Creates Unapprovable Blocking Changes

真实问题的一部分成立：旧行为会把 `_ASYNC_TASK__...` 这类 framework-generated record 当作普通 removed fact record 报告，定位不清晰。

本轮没有实现 destructive table cleanup，因为 Phase 1/1.5 compute-route migration 明确不做旧表/旧列删除。修复方向是 fail fast 且错误归因正确：内部 async task record cleanup 目前 unsupported，不能静默通过，也不能混同为业务 entity 删除。

测试：`deleting async computed property reports unsupported internal task cleanup`。

### 4. Deleting Fact Entity Is Blocking Instead Of Reviewable

按当前 Phase 1.5 边界，删除 fact entity 应继续 blocking。它不是由 computation 可重建的派生数据，自动 drop table 会删除业务事实数据；没有 Phase 2 primitive/handler 前不能 review 后执行。

本轮补了测试，确保 dry-run 报告的是明确的 `unsupported-destructive-schema-change` 和 `fact record was removed`。

测试：`dry-run explicitly blocks removed fact entities`。

### 5. Deleting Non-Async Computed Property Leaves Orphan Physical Column

真实存在：旧逻辑跳过 computed attribute removal，因此可能让 migration 成功写入新 manifest，但旧物理 column 保留。

修复：删除 computed property 时也产生 blocking change，原因是 compute-route schema migration 不支持 computed attribute physical cleanup。这样不会再静默写入与物理 schema 不一致的新 manifest。

测试：`dry-run reports computed property deletion physical cleanup as unsupported`。

## 验证

已运行：

1. `npm run test:runtime -- tests/runtime/migration.spec.ts`
2. `npm run check:runtime`

两者均通过。
