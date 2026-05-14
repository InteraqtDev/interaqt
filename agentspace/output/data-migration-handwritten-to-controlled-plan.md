# Data Migration: 手写数据转为 Computation 受控的最小方案

## 目标

本方案支持一种当前必须立刻覆盖的模型演进：

```text
已有字段 / 实体 / 关系由业务代码直接写入
  -> 新模型中改为由 computation 维护
  -> 旧的手写值不再作为权威数据
  -> 清理已有 output，并按新 computation 完整重建
```

这里的核心语义是“权威来源切换”。旧数据不迁移、不映射、不尝试保留业务含义；它只作为即将被废弃的旧 output。迁移成功后，该 data context 的后续写入必须完全由 computation 负责。

## 非目标

1. 不支持把旧手写值转换成新 computation state。
2. 不支持用户自定义旧数据映射、merge、rename、copy 或 SQL 加速。
3. 不支持基于历史 EventSource 自动重放。
4. 不支持删除旧 storage 表或旧字段的物理清理。
5. 不把这个场景伪装成普通 `state-only`。只要 output 会被清理并重建，就必须是 output rebuild。

未来如果要支持旧数据迁移策略，应在同一个 decision 上扩展 `oldDataStrategy`，而不是让框架根据旧数据形状自动猜测。

## 判断规则

当旧 manifest 中某个 data context 是事实数据，而新 manifest 中同一个 data context 由 computation 输出时，框架识别为 takeover candidate。

覆盖范围：

1. **Property**：旧 `Entity.property` 没有 computation，新模型中该 property 有 computation。
2. **Entity**：旧 entity 是事实 record，新模型中同名 entity 是 computation output。
3. **Relation**：旧 relation 是事实 link/record，新模型中同名 relation 是 computation output。

判断以 manifest 为准，不用数据库表名或字段名猜测。storage 层仍然通过 manifest 中的 logical record、attribute detail 和 physical path 定位真实数据。

具体 authority 判断规则：

1. property：旧 manifest 中 `computed: false`，新 manifest 中 `computed: true`。
2. entity / relation：旧 manifest 中不存在输出到 `entity:X` / `relation:Y` 的 computation ownership proof，新 manifest 中存在输出到同一 data context 的 computation ownership proof。
3. 旧 manifest 中同一 data context 已经由 computation 输出时，不属于本场景，仍按普通 computed output 迁移和 ownership proof 规则处理。

## Review 复核后的修订结论

对 `agentspace/output/data-migration-handwritten-to-controlled-plan-review.md` 中的意见逐条复核后，结论如下：

1. property takeover 的 no-op output 问题成立。当前迁移写入 helper 会在新旧值相等时跳过 mutation event；但 takeover 的语义是 authority 切换，即使值相等也必须让下游按 output changed 处理。因此本方案补充 synthetic takeover event / changed data context seed 规则。
2. StateMachine bound state 问题成立。当前 StateMachine 后续 transition 依赖 `currentState` bound state，只重建 output、把 state 重置成默认值会破坏迁移后的 computation 不变量。因此第一版不支持缺少 state rebuild handler 的 StateMachine takeover。
3. entity / relation destructive 授权边界问题成立。`expectedExistingCount` 只能提示风险和防止 dry-run 后数量变化，不能证明将删除的具体 records。entity / relation takeover 必须同时走 destructive-scope ids 精确审批。
4. takeover decision 与 computation decision 的关系问题成立。`computation-takeover` 是安全授权，不替代现有 `kind: "computation"` decision。rebuild seed 仍来自 `decision: "changed"` 的 computation decision。
5. property “清理”不等于必须物理置空，这一点只部分采纳。为避免 non-null constraint，property takeover 可以采用覆盖写入；但必须禁止 `ComputationResultSkip` 表示“保留旧值”，并且必须保证所有 host records 被新 computation 覆盖或明确写成 `null`。
6. handler 输入边界问题成立。`discard-and-rebuild` 下的 handler 不能把 takeover target 的旧手写值当作迁移来源；如果业务要读取旧值映射新状态，已经超出第一版。
7. audit 字段问题部分采纳。当前 migration log 已记录 `approvedDiffHash`、summary、decisionCount 和 phase，manifest 写入的是新模型 canonical manifest。第一版不把 takeover hash / discarded count 写入 manifest 的模型结构，避免污染模型 manifest；takeover 的审计信息应进入 approved diff、migration log summary 和执行日志。

## 新增 Decision

在 approved diff 中新增一个显式 decision：

```ts
type ComputationTakeoverDecision = {
  kind: "computation-takeover"
  dataContext: string
  computationId: string
  targetType: "property" | "entity" | "relation"
  previousAuthority: "fact"
  nextAuthority: "computation"
  oldDataStrategy: "discard-and-rebuild"
  expectedExistingCount: number
  expectedHostCount?: number
  destructiveScopeRef?: string
  reason: string
}
```

第一版只允许：

```ts
oldDataStrategy: "discard-and-rebuild"
```

这表示 reviewer 明确确认：旧手写数据可以被丢弃，迁移执行时先清理该 output，再由新 computation 重建。

`expectedExistingCount` 来自 diff 生成或 dry-run 阶段。执行阶段必须重新统计。如果实际 count 与 approved diff 不一致，migration fail fast，要求重新生成 diff 或重新审批。这避免 dry-run 后旧写入路径继续写入数据而被静默删除。

count 只是并发变更保护和 review 提示，不是完整删除授权：

1. property takeover 还必须记录或执行期验证 host record 覆盖范围。`expectedHostCount` 表示 dry-run 时 host record 数，执行期 host scan 必须重新确认。
2. entity / relation takeover 必须绑定 destructive-scope requirement，记录将被删除的 existing ids。执行期重新读取 ids 并精确比较。
3. 如果 reviewer 只批准 takeover decision，没有批准对应 destructive-scope，则 entity / relation takeover 不能执行。

`computation-takeover` 不替代现有 computation decision。它只表达“旧 fact output 可以被丢弃并由同 data context 的 computation 接管”。对应 computation 仍必须有 `kind: "computation"` decision，且 decision 必须是 `"changed"`。

## Diff 生成

`generateMigrationDiff()` 增加 takeover candidate 检测：

1. 从旧 manifest 读取 data context 的旧 authority。
2. 从新 manifest 找到输出到同一 data context 的 computation。
3. 如果旧 authority 是 fact，新 authority 是 computation，则生成：
   - `changes` 中的 `computation-takeover` change。
   - `requiredDecisions` 中的 `computation-takeover` requirement。
   - 同一个 computation 的 `computation` requirement，推荐 decision 为 `changed`。
   - event-based / async computation 的 handler requirement。
   - entity / relation target 的 destructive-scope requirement，包含 existing ids。
   - safety 中的 destructive candidate summary。

示例：

```json
{
  "kind": "computation-takeover",
  "dataContext": "property:Ticket.status",
  "computationId": "property:Ticket.status:StateMachine",
  "targetType": "property",
  "previousAuthority": "fact",
  "nextAuthority": "computation",
  "oldDataStrategy": "discard-and-rebuild",
  "expectedExistingCount": 128,
  "expectedHostCount": 128,
  "reason": "Ticket.status is now maintained by lifecycle computation."
}
```

这里的 count 语义：

1. property：旧字段中非 `null` / 非 `undefined` 的 host record 数。
2. entity：旧 entity record 数。
3. relation：旧 relation link/record 数。

property 的 execution 覆盖范围不能只看非空旧值。nullable property 中旧值为 `null` 的 host record 也必须被新 computation 重新确认；否则 `null` 可能只是旧手写数据残留。

## Validation Gate

`validateApprovedDiff()` 增加校验：

1. takeover decision 必须对应 generated required decision。
2. `oldDataStrategy` 只能是 `"discard-and-rebuild"`。
3. `expectedExistingCount` 必须是非负整数。
4. `computationId` 必须存在于新 manifest，并且输出的 data context 与 decision 一致。
5. takeover data context 必须在旧 manifest 中存在事实 authority，不能用于接管另一个 computation 的 output。
6. 对同一个 data context 不能同时出现多个 takeover decision。
7. 对应 computation 必须同时有 `kind: "computation"` decision，且 `decision === "changed"`。
8. event-based / async computation 必须继续满足对应 handler decision 和 runtime handler。
9. entity / relation takeover 必须有同 data context、同 recordName 的 destructive-scope decision，且执行期 ids 精确匹配。
10. StateMachine takeover 如果存在 bound state，必须有 state rebuild handler；第一版没有该 handler 时 blocking。

如果 reviewer 没有批准 takeover，现有 safety gate 必须继续 blocking。框架不能因为“新模型有 computation”就自动覆盖旧事实数据。

## Rebuild Plan 规则

被批准 takeover 的 computation 进入 rebuild plan，并强制：

```ts
{
  rebuildState: true,
  rebuildOutput: true,
  propagateOutputEvents: true
}
```

`rebuildState` 是否实际写入取决于 computation 是否有 bound state；但 plan 语义上必须允许 state 与 output 一起重建。这样可以避免把接管误判成 `state-only`。

对下游 computation 的传播按现有 affected graph 处理，但不能只依赖实际 storage write 产生的 mutation event。property takeover 中如果新 computation 算出的值与旧手写值字面相等，普通写入 helper 可能把它当作 no-op。takeover 必须额外把该 data context 作为 changed data context seed，或产生 synthetic takeover event，确保下游 computation 被纳入 rebuild。推荐两者同时满足：

1. storage 层可以避免无意义 update。
2. propagation 层必须把 takeover output 当作 changed output。
3. migration log 必须能区分这是 authority takeover event，而不是普通业务 update。

## 执行流程

在 migration transaction 中，对每个 takeover item 执行：

1. 重新统计 existing count。
2. 与 approved `expectedExistingCount` 比较，不一致则失败。
3. entity / relation 重新读取 destructive-scope ids，并与 approved ids 精确比较。
4. 清理旧 output。
5. 执行 computation full rebuild。
6. 生成 migration 内部 mutation events 或 synthetic takeover events。
7. 按 affected graph 推动下游 computation。
8. 在 migration log 中记录 approved diff hash、decision summary、count、data context、computation id 和执行结果。

### Property

property takeover 不应依赖旧字段值。执行时应该覆盖所有 host records 的目标 property。

推荐实现：

1. 扫描 host records。
2. 对每条 host record 用新 computation 计算新值。
3. 写入新值。
4. 如果某条 host record 没有可写入结果：
   - nullable property：写入 `null`。
   - non-null property：migration fail fast，错误指向该 data context。

这样可以避免先把列置空时触发数据库非空约束，同时保证旧值不会残留。

额外约束：

1. `ComputationResultSkip` 在 takeover 中不能表示“保留旧手写值”。如果 computation 对某条 host record 返回 skip，nullable property 必须转成 `null`，non-null property 必须 fail fast。
2. 即使新值与旧值相等，也必须记录 authority takeover，并通过 changed data context seed / synthetic event 触发下游 rebuild。
3. property takeover 的 “清理” 是语义清理，不要求物理置空；核心是旧 fact authority 不再影响迁移后的数据。

### Entity

entity takeover 使用 clear-and-rebuild：

1. 删除旧 entity 的全部 existing records。
2. 调用新 computation 重建完整 output。
3. 写入新 records。
4. 为 create/delete/update 生成 migration events。

第一版不要求旧 manifest 有 computed ownership proof，因为 takeover decision 本身就是 reviewer 对旧 fact output 的删除授权。但这个授权只能用于 `previousAuthority: "fact"`，不能绕过 computed output 的 ownership proof。

为了让这个授权足够精确，entity takeover 必须同时要求 destructive-scope ids：

1. diff / dry-run 读取旧 entity existing ids，生成 destructive-scope requirement。
2. reviewer 同时批准 takeover decision 和 destructive-scope decision。
3. 执行期在 transaction 内重新读取 existing ids，必须与 approved ids 完全一致。
4. 只有同一个 `dataContext`、同一个 output record、且 `previousAuthority: "fact"` 时，takeover 才能替代旧 computed ownership proof gate。

### Relation

relation takeover 与 entity 类似：

1. 删除旧 relation 的全部 existing links/records。
2. 调用新 computation 重建完整 relation output。
3. 写入新 links/records。
4. 生成 relation create/delete events，保留 source/target 信息供下游 aggregate 使用。

relation 的物理写入仍必须经过 storage manifest / `EntityToTableMap`，不能假设存在独立 link table。

relation takeover 同样必须使用 destructive-scope ids 精确审批。count 不足以表达删除范围，因为 relation 可能与实体共表、经过 source / target 字段映射，或包含额外 relation properties。

## 与 Blocking Gate 的关系

takeover decision 只解除一个特定 blocking：旧 fact output 被新 computation output 替换。

它不能解除：

1. fact data 的 physical path move。
2. fact field type / collection 变化。
3. event-based computation 缺少 rebuild handler。
4. async computation 缺少 migration completion handler。
5. `_isDeleted_` 等 hard deletion 的 destructive scope。
6. 旧 storage record/field 的物理 drop。

如果 computation 本身不可重建，即使 takeover 已批准，也必须 blocking。接管授权只说明旧数据可以丢弃，不说明新数据一定能算出来。

## Handler 要求

data-based computation 可以使用现有 full compute 路线。

event-based computation 必须提供 approved `event-rebuild-handler` 和 runtime handler。handler 的职责是从当前数据库快照生成最终 output，而不是重放未知历史事件。

StateMachine property takeover 第一版按 property output rebuild 处理：

1. 如果 StateMachine 没有 bound state，可按普通 event-based property output rebuild 处理。
2. 如果 StateMachine 有 bound state，必须提供 state rebuild handler，同时返回每条 host record 的最终 output 与对应 state patch。
3. 第一版不新增 state rebuild handler API；因此缺少该 handler 时，StateMachine takeover 必须 blocking。

不能把 bound state 重置成默认值后仍声明迁移成功。StateMachine 的后续 transition 依赖 `currentState`，output 与 state 不一致会破坏 computation 接管后的运行语义。

handler 的输入边界：

1. handler 可以读取当前数据库中的其他权威事实数据。
2. handler 不能把 takeover target 的旧手写值当作权威迁移输入。
3. 如果业务需要把旧值映射成新 state / output，这已经不是 `discard-and-rebuild`，应留到未来 `oldDataStrategy`。

## Manifest 更新

迁移成功后，新 manifest 必须记录：

1. 该 data context 的 authority 已经变为 computation。
2. computation 的 ownership proof。

takeover decision hash、discarded count、approved diff hash 和执行结果不写进 canonical manifest 结构，而是进入 approved diff 与 migration log。这样 manifest 保持“当前模型事实”的职责，不混入一次迁移执行的审计数据。

后续 migration 再遇到同一个 computation 变化时，应按普通 computed output 迁移处理，而不是再次进入 fact takeover。

## 测试矩阵

最小测试应覆盖：

1. fact property 转 computed property，旧值被覆盖，下游 computation 跟随重算。
2. property takeover 新旧值相等时仍触发下游 rebuild，验证 no-op 写入不会吞掉 authority takeover。
3. nullable property 中 computation 对部分 host record 无结果时写入 `null`，旧值不残留。
4. non-null property 无法为某条 host record 生成值时 migration 失败。
5. property takeover 覆盖所有 host records，而不是只处理旧非空值 records。
6. fact entity 转 Transform entity，旧 records 全部删除后按 source records 重建。
7. fact relation 转 Transform relation，旧 links 全部删除后重建，并触发下游 Count。
8. entity / relation destructive-scope ids 与执行期 ids 不一致时 migration 失败。
9. takeover 未批准时 migration blocking。
10. dry-run count 与执行期 count 不一致时 migration 失败。
11. event-based takeover 缺少 `event-rebuild-handler` 时 blocking。
12. StateMachine takeover 缺少 state rebuild handler 时 blocking。
13. takeover decision 不能用于旧 computed output，仍要求 computed ownership proof。
14. takeover 不 drop 旧物理字段或表，只改变数据权威与 output 内容。

## 实施步骤

1. 扩展 migration diff 类型，加入 `computation-takeover` change、requirement 和 decision。
2. 在 diff 生成阶段识别 fact-to-computation authority change，并统计 existing count / host count / destructive-scope ids。
3. 在 approved diff validation 中校验 takeover decision。
4. 要求 takeover 对应 computation 同时有 `decision: "changed"`；rebuild seed 继续来自 computation decision。
5. 在 `buildAffectedRebuildPlan()` 输入中加入 takeover changed data context seed，强制 output rebuild 与下游传播。
6. 调整 recompute blocking gate：对已批准 takeover 且 destructive-scope 匹配的 fact output，不要求旧 manifest 中存在 computed ownership proof。
7. 在 migration executor 中为 property/entity/relation takeover 增加 clear-and-rebuild 前置步骤和 execution-time count / ids 校验。
8. 在 migration log 中记录 takeover 审计信息，manifest 只写新模型 canonical authority。
9. 补齐测试矩阵，确保每个 takeover 分支都有失败和成功用例。

## 最终结论

本阶段应把“手写转为受控”设计成一个小而明确的 destructive rebuild 能力：

```text
review takeover
  -> confirm old fact data can be discarded
  -> verify count has not changed
  -> clear old output
  -> recompute new output
  -> update manifest authority
```

它不迁移旧事实值，不做自动猜测，也不处理 storage 退役。这样既能立刻支持业务从手写数据切换到 computation 控制，又保持 interaqt migration 的显式控制和可审计性。
