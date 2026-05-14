# Data Migration Task 3 追加任务1 Review

## 结论

本次 review 的对象是当前版本的 `agentspace/output/data-migration-handwritten-to-controlled-plan.md`。结论：当前方案已经补齐“手写转为 computation 受控”场景中最关键的安全边界，未发现仍会直接推翻方案的致命错误。

方案总体符合 Task 3 的目标：

1. 将已有字段、实体、关系从 fact authority 显式切换为 computation authority。
2. 第一版只支持 `discard-and-rebuild`，不迁移旧手写值，不做自动映射。
3. 对旧 output 的清理和新 computation 的重建都通过 approved diff 显式授权。
4. 不把这个场景扩展成 EventSource 历史重放、通用 state migration 或 storage 退役方案。

因此，这份方案可以作为下一步实施计划的基础。但实现时必须严格保留文档中的几个边界，否则会重新引入当前 runtime 正在防止的 destructive 风险。

## Review 范围

本次 review 对照了 Task 3 的原始要求：

1. 允许没有 computation 的字段 / 实体 / 关系转为 computation 控制。
2. 如果已有数据，旧数据直接清理并按新 computation 完整重建。
3. 暂不支持旧数据迁移策略，只保留未来扩展口子。
4. 不沿用旧复杂方案，不在本阶段引入过大的 EventSource takeover 框架。

同时抽查了当前 migration 实现中的关键约束：

1. `MigrationDecision` / `MigrationDecisionRequirement` 当前尚无 `computation-takeover` primitive。
2. `getChangedComputationsFromApprovedDiff()` 只从 `kind: "computation"` decision 推出 rebuild seed。
3. `buildAffectedRebuildPlan()` 依赖 changed computation 和 changed data context 推动下游 rebuild。
4. `getRecomputeBlockingChanges()` 对 entity / relation output replacement 要求旧 manifest 有 exclusive computed ownership proof。
5. `assertDestructiveScopeAllowed()` 使用 ids 精确比较 destructive scope。
6. `writeComputationResult()` 在新旧值相等时会跳过 storage write 和 mutation event。

这些现状说明：Task 3 不是单纯“放开一个 blocking”，而是需要新增一个有限、可审计的 takeover primitive。

## 致命错误检查

### 1. Property no-op output 问题：已处理

当前方案明确指出，property takeover 不能只依赖实际 storage write 产生 mutation event。即使新 computation 算出的值与旧手写值字面相等，authority 已经从 fact 切到 computation，下游仍必须按 output changed 处理。

方案现在要求通过 changed data context seed 或 synthetic takeover event 推动传播，并且建议二者同时满足：

1. storage 层可以避免无意义 update。
2. propagation 层必须把 takeover output 当作 changed output。
3. migration log 需要区分 authority takeover event 和普通业务 update。

这与当前 `writeComputationResult()` 的 no-op 优化不冲突，能够避免“值没变但 authority 变了”时下游不重建的问题。

### 2. StateMachine bound state 问题：已收敛为 blocking

当前方案没有再允许 StateMachine 只重建 property output、把 bound state 重置为默认值后声明迁移成功。它明确要求：

1. StateMachine 有 bound state 时必须有 state rebuild handler。
2. 第一版不新增 state rebuild handler API。
3. 因此缺少该 handler 时 StateMachine takeover 必须 blocking。

这个结论符合 Task 3 的目标。因为 StateMachine 后续 transition 依赖 `currentState`，如果 output 和 bound state 不一致，迁移后数据虽然看似由 computation 接管，实际运行语义已经损坏。

### 3. Entity / relation destructive 授权边界：已处理

当前方案没有再把 `expectedExistingCount` 当作删除授权。它要求 entity / relation takeover 同时绑定 destructive-scope ids，并在执行期重新读取 ids 精确比较。

这与现有 destructive-scope gate 的方向一致，也正确限制了 takeover decision 的权力范围：

1. `computation-takeover` 只表达旧 fact output 可以被丢弃。
2. 具体删除哪些 entity / relation records 仍必须通过 ids 精确审批。
3. 只有同一 `dataContext`、同一 recordName、且 `previousAuthority: "fact"` 时，takeover 才能有限替代旧 computed ownership proof。

这避免了把 takeover 变成删除任意 fact records 的过宽授权。

### 4. Takeover decision 与 computation decision 的关系：已处理

当前方案明确规定 `computation-takeover` 是安全授权，不替代现有 `kind: "computation"` decision。对应 computation 仍必须有 `decision: "changed"`，rebuild seed 仍来自 computation decision。

这与当前 planner 的设计兼容，也避免 approved diff 中出现“只批准 takeover，但没有批准 computation rebuild”的不可执行状态。

## 是否违反 Task 3 注意事项

未发现违反 Task 3 目标的地方。当前方案没有试图保留旧手写值，也没有让框架从旧数据形状中自动猜测迁移策略。

特别是以下约束与 Task 3 保持一致：

1. `oldDataStrategy` 第一版只允许 `discard-and-rebuild`。
2. handler 不能把 takeover target 的旧手写值当作权威迁移输入。
3. property takeover 中 `ComputationResultSkip` 不能表示“保留旧值”。
4. manifest 只记录新模型的 canonical authority，不混入一次迁移执行的审计字段。
5. 物理表、旧字段、旧 storage layout 的退役不属于本阶段。

## 与既有设计的冲突检查

当前方案需要改动 runtime，但没有发现与既有设计不可调和的冲突。它需要显式修改的点主要是：

1. 扩展 diff / approved diff 类型，新增 `computation-takeover` change、requirement 和 decision。
2. 在 diff 生成中识别 fact authority 到 computation authority 的切换。
3. 在 validation 中要求 takeover decision、computation changed decision、handler decision、destructive-scope decision 之间的匹配关系。
4. 在 rebuild plan 中加入 takeover changed data context seed，避免 property no-op 吞掉传播。
5. 在 recompute blocking gate 中，只对已批准 takeover 的同 data context fact output 放开旧 computed ownership proof 要求。
6. 在 executor 中新增 takeover 清理和执行期 count / ids 校验。

这些都是对现有显式审阅机制的扩展，而不是绕过现有机制。

## 非阻断澄清建议

以下不是致命问题，但建议实施前在计划或代码注释中保持清晰：

1. StateMachine handle 当前总是有 `currentState` bound state；因此“如果 StateMachine 没有 bound state”基本只是理论分支。第一版实现可以直接把 StateMachine takeover 判为需要 state rebuild handler，否则 blocking。
2. `expectedExistingCount` 对 property 只是旧非空值风险提示，执行覆盖范围仍应以 host scan 为准，并校验 `expectedHostCount` 或等价 host set。
3. entity / relation takeover 删除旧 fact records 时，如果存在外部 fact relations 或业务引用，第一版不迁移这些引用；这应被 destructive review 明确展示为“旧 ids 将被废弃”，不能暗示会保留 identity。
4. `destructiveScopeRef` 如果实现时没有独立引用机制，可以先用 `dataContext + recordName` 与 destructive-scope decision 关联，避免新增不必要的 key 体系。

## 最终判断

当前 `agentspace/output/data-migration-handwritten-to-controlled-plan.md` 通过 Task 3 追加任务1的 review。它没有剩余致命错误，也没有违反“旧数据丢弃并重建、不支持旧数据迁移策略、保持显式控制”的目标。

实施时最重要的是不要弱化三个安全条件：takeover 不能替代 computation changed decision，entity / relation 必须有 ids 精确 destructive-scope，StateMachine 缺少 state rebuild handler 必须 blocking。
