# interaqt 1.5.6 Migration 阻塞点分析

## 结论

`agentspace/prompt/interaqt-1.5.6-migration-blockers.md` 中记录的四个阻塞点都能在当前 interaqt data migration 实现中找到对应行为。它们不是 `medeo-lite` 业务定义本身造成的错误，而是框架迁移能力在真实跨版本、发布包、已有生产数据场景下暴露出的边界。

其中前三个阻塞点形成了同一条主链路，真正需要修复的根因是阻塞点 1：

1. computation migration identity 使用运行时 handle class name。
2. 发布包版本变化导致大量 computation id 漂移。
3. 阻塞点 2 的执行期检查把这些伪 new computation 强制推向 changed / rebuild。
4. 阻塞点 3 中的 destructive safety gate 被误触发。

第四个阻塞点是另一类 schema cleanup 能力缺口：当前框架能正确阻止删除历史 fact record，但还没有“确认表为空后安全删除”的显式审批路径。

## 阻塞点 1：Computation Identity 在 1.5.4 -> 1.5.6 之间不兼容

### 是否和当前框架有关

有关，而且是根因级框架问题。

当前 `computationManifestId()` 的 id 生成规则是：

```ts
computation:${dataContextPath(computation.dataContext)}:${computation.constructor?.name || computation.args.constructor?.name || "UnknownComputation"}
```

也就是说，migration identity 依赖 runtime computation handle 的 `constructor.name`。这不是一个稳定的框架级语义名。发布包构建、压缩、bundler 调整、类名重命名都会改变它。

阻塞文档中出现的 `Gr -> ia`、`Cr -> Lr`、`Vr -> Jr` 等变化，正符合“打包后内部类名变化导致 manifest id 漂移”的特征。文档中同时显示 `functionHash` 没有变化，也进一步说明这不是业务 computation 函数发生了实质变更。

### 应如何修复

需要把 computation migration identity 改成稳定语义 identity，不能继续依赖 `constructor.name`。

推荐方向：

1. 为每类 runtime computation handle 提供稳定 `computationType` / semantic kind，例如 `Transform`、`StateMachine`、`Count`、`Custom`。
2. `computationManifestId()` 使用 `dataContext + stable computation kind`，必要时再结合用户声明的 computation uuid 区分同一 data context 上未来可能出现的多 computation 场景。
3. `createComputationManifest()` 中用于 diff 的 `type`、`outputSignature`、`structuralSignature` 也不应依赖 minified class name，否则即使 id 稳定，signature 仍会因打包名变化而误判 changed。
4. 为旧 manifest 兼容提供一次性 normalization：旧版本中已经写入的 `Gr/Cr/...` 应在读取或对比 manifest 时归一化为新稳定 kind，避免用户升级后无关 computation 全量进入 rebuild。

这不是业务侧能可靠绕过的问题。业务侧最多固定 interaqt 版本或避免升级，但不能控制框架发布包内部类名。

### 为什么本地测试没覆盖到

现有测试主要在源码路径和同一版本进程内生成 old/new manifest。这个环境下 `constructor.name` 稳定，不会模拟 npm 发布包从 1.5.4 到 1.5.6 后内部类名变化。

缺失的测试类型是“跨已发布 dist 版本 manifest 兼容测试”：用旧版本包生成 manifest，再用新版本包读取同一数据库和业务模型生成 diff，断言业务未变的 computation 不应因内部类名变化进入 required decision / rebuild。

## 阻塞点 2：新 computation 被强制要求 `changed`，无法审批为 `unchanged`

### 是否和当前框架有关

有关，是 migration decision 解释逻辑的问题。

当前 `getChangedComputationsFromApprovedDiff()` 只把 `decision: "changed"` 或 `"state-only"` 的 computation 放入 `changedComputations`。随后它会遍历 next manifest 中所有 computation：

```ts
if (!previousManifest.computations.some(item => item.id === computation.id) &&
    !changedComputations.some(item => item.id === computation.id)) {
  throw new MigrationError(`New computation requires approved changed decision: ${computation.id}`);
}
```

因此只要 computation id 在 previous manifest 中不存在，就必须被批准为 `changed`。即使 reviewer 已经判断它只是 identity 漂移，并把 decision 审批为 `unchanged`，执行阶段也必然失败。

这条规则在“真正新增 computation”场景下是合理的，因为新增 output / state 通常需要明确 rebuild。本次之所以触发它，是阻塞点 1 让旧 computation 被错误识别成了新 computation。

### 应如何修复

不需要为阻塞点 2 设计独立修复方法。正确修复是先修阻塞点 1：让 computation migration identity 稳定，并把旧 manifest 中已经落盘的短类名归一化到稳定 kind。

只要阻塞点 1 修复到位，业务未变的 computation 就不会再以“新 id”出现在 next manifest 中，也就不会触发 `New computation requires approved changed decision`。继续保留“真正新增 computation 必须 approved changed”的执行期检查是合理的，它不应该因为这次事故被放宽。

因此后续实施不要通过允许 “new id but unchanged” 来绕过该错误，也不要新增单独的 `unchanged` 审批通道。那会把 identity 漂移问题扩散到 decision 语义里，反而削弱真正新增 computation 的安全边界。

### 为什么本地测试没覆盖到

现有测试覆盖了 computation decision 的基本流转，但默认 old/new computation id 稳定。`unchanged` 的语义只在“同 id 且 signature 未变或 reviewer 认可”的场景下成立。

缺失的是“修复阻塞点 1 后，不再产生伪 new computation”的跨版本回归测试。测试重点应该放在旧短类名 manifest 被归一化后，业务未变的 computation 不进入 required decision，也不进入 rebuild plan。

## 阻塞点 3：被迫 rebuild 无关 entity Transform 后触发 ownership proof 阻塞

### 是否和当前框架有关

有关，但它不是独立根因，而是阻塞点 1 引起的连锁结果。

`getRecomputeBlockingChanges()` 对 entity / relation output rebuild 有几条安全检查：

1. output computation 必须提供完整 `compute`。
2. entity / relation output 必须是 data-based `Transform`，并带有 `sourceRecordId` 和 `transformIndex` state。
3. event-based computation 必须提供 rebuild handler。
4. 旧 manifest 必须证明该 output 由同一 computation exclusive owning，否则删除 / 替换已有 records 是 destructive 行为。
5. 已批准的 `computation-takeover` 可以在同 data context 的 fact -> computation authority 切换中有限放开旧 ownership proof 要求。

这些检查本身是正确的。它们防止 migration 在没有来源映射、没有重建能力、没有旧 ownership proof 的情况下删除或替换 entity / relation records。

真正的问题是：阻塞点 1 造成 id 漂移，随后触发阻塞点 2 的强制 changed 检查，把大量无关 computation 误判成必须 rebuild。于是这些本来不该参与本次 `TodoItem` takeover 的 output 被送进 safety gate。safety gate 发现它们缺少 Transform 状态或旧 ownership proof，于是正确地阻塞。

所以阻塞点 3 和框架有关，但不是因为 ownership proof 规则错了，也不应该通过修改这一层来解决。它是阻塞点 1 污染 changed computation 集合后的表现。只要阻塞点 1 修复到位，无关 computation 不再进入 rebuild plan，阻塞点 3 在本次迁移链路中就不会出现。

### 应如何修复

不需要为阻塞点 3 设计独立修复方法。正确修复是阻塞点 1：稳定 computation identity，并对旧 manifest 中已经落盘的短类名进行归一化，使业务未变的 computation 不再被误判为 new/changed，也就不会进入 rebuild plan。

entity / relation output 的 ownership proof、Transform state、event handler、async handler 检查都应该保留。后续实施不要为了消除这次报错而放宽这些 safety gate。

对于业务侧，临时把所有 new computation 审批为 `changed` 是错误方向，因为它会把 identity 漂移扩大成 destructive rebuild。

### 为什么本地测试没覆盖到

现有测试覆盖了 “non-Transform entity / relation output rebuild 应阻塞”、 “缺少 ownership proof 应阻塞”、 “takeover 可有限绕过旧 fact output ownership proof” 等单点规则。

没有覆盖的是连锁场景：大量无关 computation 因跨版本 identity 漂移被误判为 new/changed，然后被加入 rebuild plan，最后触发本不该触发的 destructive safety gate。

测试缺口不是 safety gate 的单元测试，而是“真实大模型 + 跨版本 manifest + 少量目标 takeover + 大量无关 computation 不应被 rebuild”的集成测试。

## 阻塞点 4：旧空 fact table 删除会触发 destructive schema block

### 是否和当前框架有关

有关，但它和 `TodoItem` computation takeover 主链路不是同一个问题。

当前 `getStorageBlockingChanges()` 的规则是：old storage record 在 new schema 中不存在，且不是 filtered record，就产生：

```text
unsupported-destructive-schema-change
reason: fact record was removed from the new schema
```

这个判断不读取数据库实际行数，也没有 approved decision 可以表达“这个历史 fact table 为空，允许删除”。因此即使 `TodoItemWriteEvent` 实际 count 为 0，只要旧 manifest 中有 record、新模型中不再声明，就会被 blocking。

这个默认行为是保守且合理的。框架不能只因为模型删除了 record 就自动 drop fact table，否则会破坏显式控制原则。但当前缺少一个安全处理空表退役的显式路径。

### 应如何修复

可分两层处理：

1. 当前业务可立即绕过：在 `medeo-lite` 中暂时保留历史兼容 entity / record 声明，让 schema 不发生 fact record removal。这是业务层 workaround，不改变数据。
2. 框架后续应支持显式空表删除审批：diff / dry-run 读取旧表 count；当 count 为 0 时生成 `empty-fact-record-removal` 之类的 required decision；执行期在 transaction 中重新确认 count 仍为 0，然后再允许 schema cleanup。

如果 count 不为 0，仍应 blocking，除非未来设计了完整 fact data deletion approval。第一版不应把“空表删除”扩展成“任意 fact table 删除”。

### 为什么本地测试没覆盖到

现有 PostgreSQL migration safety 测试已经断言移除 fact record 会产生 `unsupported-destructive-schema-change`。也就是说，当前测试覆盖的是“必须阻塞”这个保守行为。

没有覆盖的是产品能力需求：“当旧 fact table 明确为空时，是否应该有非手工 SQL 的可审批删除路径”。这属于新能力缺失，不是现有测试漏掉了一个 bug。

## 总体修复优先级

建议按以下顺序修复：

1. **稳定 computation migration identity**。这是根因。没有这个修复，任何 patch 都会继续把框架内部构建细节暴露给用户迁移流程。
2. **增加跨发布版本 migration regression 测试**。至少覆盖 1.5.4 manifest 到当前版本 manifest 的业务无变更 diff，确保不会出现无关 computation rebuild。
3. **保留并强化 takeover 只影响目标 data context 的测试**。尤其要覆盖一个大模型中只有 `TodoItem` fact -> computation takeover 时，其他 entity / relation output 不进入 rebuild plan。
4. **为空 fact table 删除设计显式审批路径**。这是独立增强项，可以排在主链路之后；短期业务可通过保留历史 record 声明绕过。

## 对本次 `medeo-lite` 迁移的判断

`TodoItem` 的 `computation-takeover` review item 能被 1.5.6 生成，说明 Task 3 “手写转受控”的主体方向已经进入框架。但当前版本还不能安全支撑真实项目升级执行，原因不是 takeover primitive 缺失，而是跨版本 computation identity 不稳定污染了 diff 和 rebuild plan。

在框架修复前，不建议通过把所有无关 computation 审批为 `changed` 来推进迁移。这会让迁移尝试删除 / 重建大量不属于本次目标的 computed entity / relation output，风险明显超出 `TodoItem` takeover 的授权范围。
