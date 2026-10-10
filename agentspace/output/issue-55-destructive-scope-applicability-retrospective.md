# 复盘：迁移 destructive-scope 适用性缺陷（issue #55，取代 #54）为什么逃过了测试体系

- 日期：2026-10-10
- 关联：issue #55、issue #54、PR #53（只修了调度器守卫一处）；r30-E / r32 / r35 的删除审计复盘
- 证据纪律：每条归因附源码锚点或红-绿实验；新增防线全部做了敏感性实验（在 v4.11.1 基线上必须变红）。

---

## 〇、结论

| 编号 | 缺陷 | 逃逸机理（一句话） | 盲区类型 |
|------|------|------------------|---------|
| D-1 | 同一迁移新建的 `_isDeleted_` 宿主被要求 destructive-scope 审批（ids 为空），不批准即拒绝 | 生成域与手写用例的硬删除宿主**全部是已有存量行的表**；且审批助手批准 diff 要求的一切，「过度要求审批」不可观测 | 生成域缺维度 + 预言机缺「必要性」 |
| D-2 | `state-only` 的 `_isDeleted_` 无论批不批都无法应用 | 生成域里硬删除变异的计算决策恒为 `changed` | 决策维度从未取 state-only |
| D-3 | 无 bound state 的计算被批准为 `state-only` 时，调度器仍执行全量输出重算 | 同 D-2；且该格此前被 D-1/D-2 的守卫「顺带」拦住——守卫修正后它会变成未经审批的删除（fail-open） | 守卫掩蔽了下游控制流缺陷 |

D-3 不在 issue 中，是按「修类不修例」枚举读者时发现的：适用性判定一旦改为「不重建输出就不需要审批」，
执行路径必须保证「不重建输出就真的不写输出」。v4.11.1 的 `MigrationScheduler.run` 只在状态重建分支内
`continue`，`rebuildState=false ∧ rebuildOutput=false` 的计划项（state-only × 无 bound state）越过分支落入
`runFullRecompute`。修复前它被硬删除守卫与审计拦截（结果是 D-2 的「无法应用」）；只修 D-1/D-2 而不修 D-3，
`Custom` 实现的 `_isDeleted_` 在 state-only 下会删除存量行且不经任何审批（敏感性实验见 §三）。

## 一、根因：一个判定，六个读者，四种条件子集

「该重建项是否需要 destructive-scope 审批」正确的条件是三项合取：重建输出（`rebuildOutput`）、输出能删除
记录（entity/relation 输出或 `_isDeleted_`）、可删除的记录类型在迁移前 schema 中存在。v4.11.1 中六个读者
各自实现了其中一部分：

| 读者（v4.11.1 锚点） | rebuildOutput | 源 schema 存在性 |
|---|---|---|
| `getDestructiveDeletionScope` 实体/关系分支（migration.ts L3197） | 否（逐项） | 是 |
| `getDestructiveDeletionScope` `_isDeleted_` 分支（L3173） | 否 | 否 |
| `getCascadeAwareDeletionScope` 补零条目（L3812） | 是 | 否 |
| `MigrationScheduler.run` 守卫（L3857） | 否 | 否 |
| `getRecomputeBlockingChanges`（L2786，issue 未列出） | 是 | 否 |
| `collectAuditedDeletions` 执行期审计（L3289） | 隐含（只在输出重建后调用） | 否 |

另外，入口核对 `assertDestructiveScopeAllowed` 把「批准了空集合、实际没有条目」判为不一致，而执行期
`assertExecutedDeletionsApproved` 判为一致——两层核对对同一对输入给出相反结论，这是 D-2 中「批准了反而被拒」的来源。

修复：新增唯一判定 `getDestructiveScopeRecordName(computation, item, oldManifest)`，六个读者全部经由它；
入口核对对「空批准 ∧ 无实际条目」与执行期核对取同一判定；调度器对 `rebuildOutput=false` 的计划项一律
跳过输出重建。执行期审计的辖区随之明确为「迁移前已存在的记录类型」：新建记录类型的行全部由迁移产生，
删除它们不销毁存量数据；若仍审计，diff 不要求审批而执行期要求，且模拟事务与真实执行分配的 id 不同，
审批永远无法匹配（同一迁移的 Transform 先填充新宿主、`_isDeleted_` 再删除部分行时即如此）。

## 二、为什么测试体系没有抓到

### 2.1 生成域：两个维度从未取过非默认值

- `migrationDestructiveFuzz` 的 `hardDeletion` 变异（v4.11.1 `buildVersion` L107）只在 v1 已存在且有确定性
  存量行（`label: 'gone'`/`'keep'`）的 B 上增加 `_isDeleted_`。「可删除记录类型在源 schema 中是否存在」
  这一维度恒为「存在」。
- 同一变异的计算决策恒为审批助手的推荐值 `changed`；`state-only` 只出现在 `countChange` 之外的状态图测试里，
  从未与破坏性输出组合。
- 手写用例 `migration.spec.ts` L455 / L491 / L531 三格同样全部是「已有宿主 + changed」。

### 2.2 预言机：只有相对对账与上界，没有必要性

v4.11.1 的 scope 预言机有两条：「批准集合 == 执行集合」（相对对账，r30-E）与「ids ⊆ 迁移前行」
（上界，r35 预言机 0）。二者都只约束「批准了什么」与「删除了什么」的一致性和范围，**不约束「是否应当
要求审批」**。审批助手 `approveGeneratedMigrationDiff` 批准 diff 要求的一切：对新宿主，diff 要求的是空范围，
助手批准空范围，`changed` 决策下迁移成功——过度要求的审批在测试里完全不可见。只有 `state-only` 会让
它显形，而 `state-only` 不在生成域里（2.1）。

这与 r35 F-5 同属「预言机只在已有判定内部检查一致性」的家族，但方向相反：F-5 是相对对账对共享实现
的污染失明（**少拦**不可见）；本例是两条预言机对「多要求」失明（**多拦**不可见）。多拦在测试里表现为
「多批一个空范围即可通过」，在生产里表现为发布策略禁止 destructive scope 的应用无法发布。

### 2.3 守卫掩蔽（D-3）

D-3 的错误控制流在 v4.11.1 上从未产生错误结果，因为同一格先被 D-1/D-2 的守卫拒绝。修复上游判定会
解除掩蔽——这是「修复一个守卫前，必须审计守卫背后的执行路径是否满足守卫所依赖的前提」的实例。

## 三、机制落地与敏感性证据

| 机制 | 位置 | 敏感性实验（v4.11.1 的 migration.ts 上运行） |
|---|---|---|
| 唯一判定 + 六读者收敛 | `src/runtime/migration.ts` `getDestructiveScopeRecordName` | — |
| 确定性矩阵（宿主存在性 × 决策 × 审批 × 估算路径 × 输出类型，13 格） | `tests/runtime/migrationDestructiveScopeApplicability.spec.ts` | 修复前 7 格红（新宿主 changed/state-only、已有宿主 state-only 不批/批空、Transform 填充的新宿主、分析性读者逐项规则、无状态 state-only）；其余 6 格为保持不变的既有行为 |
| D-3 的执行面 pin | 同上「state-only on a stateless data-based _isDeleted_」 | 只修判定、不修调度器时该格红（`gone` 行被删除，无审批），确认 fail-open 风险真实存在 |
| 生成域新增 `hardDeletionNewHost` / `hardDeletionStateOnly`（omit / empty 两种审批形态） | `tests/runtime/migrationDestructiveFuzz.spec.ts` | 默认池中两类变异的全部种子（4f, 30f, 36f, 41, 43, 44f）在基线上全红 |
| 预言机 0b：destructive-scope 只能指向 v1 声明面中存在的记录类型 | 同上 | 基线上 `hardDeletionNewHost` 种子由该预言机报出（`names record "MigDS30Mir", which does not exist in the source (v1) schema`） |
| 维度登记 | `tests/runtime/WritingComputationTests.md`「迁移 destructive-scope 的适用性」行 | — |

## 四、未处理的相邻项（记录，不在本次修复范围）

- diff 在计算决策之前生成，按「每个变更计算都重建输出」估计 scope 与 event-rebuild-handler 要求。
  因此 `state-only` 的已有宿主仍会在 diff 里看到 destructive-scope 要求（省略或批准空 ids 均可），
  事件驱动计算在 `state-only` 下仍需提供 event-rebuild-handler 决策与运行期 handler，尽管不会调用它。
  这是「审查面先于决策」的设计约束，不产生错误结果；若要消除，需要让 diff 的要求携带「仅当决策为
  changed 时适用」的条件语义，属于审批文件格式的契约变更。
