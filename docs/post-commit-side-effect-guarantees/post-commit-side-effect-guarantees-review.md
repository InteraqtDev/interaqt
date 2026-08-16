# 提交后副作用的交付保证 — 设计评审

```text
conclusion: 通过
reviewed-design-round: 2/15
reviewed-at: 2026-08-16
```

独立评审。形成结论前未读取旧版评审文件或归档运行。对照 Task 1、当前设计 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees.md`、权威规则，以及当前 HEAD `aa7d1c73c8dbb596fc9db3755c478cb99e779cb9` 的源码与可执行证据。

## 方法与证据

源码：`src/runtime/Controller.ts`（`DispatchResponse`、`dispatch` 阶段 P、业务事务推迟队列、`runPostCommitHook`、`runRecordChangeSideEffects`、`jsonSafeSubset`、`dispatchIdempotency.finish`）、`src/runtime/index.ts` 导出面、`src/runtime/MonoSystem.ts`（`queryHandle` / `map`、`dispatchIdempotency.load` 必须在事务内）、`src/storage/erstorage/EntityToTableMap.ts` / `RecordInfo.ts` / `AttributeQuery.ts` / `Setup.ts` / `CreationExecutor.ts` / `FilteredEntityManager.ts` / `MergedItemProcessor.ts`、`src/builtins/interaction/activity/ActivityManager.ts`。

既有套件（本轮复跑，**75 passed**，含本轮探针 1 项）：`dispatchIdempotency.spec.ts`、`businessTransaction.spec.ts`、`transactionRetry.spec.ts`、`transactionAcceptance.spec.ts`、`recordMutationSideEffect.spec.ts`、`review-fixes-2026-07-10-r14.spec.ts`。

独立探针 `tests/runtime/_review-d3-verify-post-commit-se.spec.ts`（证据写入后删除，不进入常规套件）：经 `dispatch` 的阶段 P 失败、admit 去重、幂等 replay、编译 schema 标志与参考函数求值、关系形态 `['*']` 与端点查询、n:1、filtered / merged 双名 create、同名副作用后写覆盖、I-6 键集合、业务事务推迟、`dispatchIdempotency.load` 无事务时抛错。

## 六类复审条件

### 1. 关键事实错误

未发现会使方案整体失效的事实错误。本轮独立观测与设计 §1 / §3.2.1 一致：

| 设计主张 | 本轮观测 |
|----------|----------|
| G1：有 `sideEffects` map、无一等完成语义；P 失败不进 `result.error` | 经 `dispatch` 同时失败的 `postCommit` 与 create 副作用：`error` 缺席，事实行仍在，`sideEffects.__postCommit` 与 `d3rMirror` 有 `SideEffectError`；响应无 `postCommitPhase`；`isPostCommitPhaseComplete` / `rerunCreateMutationSideEffects` 为 `undefined`；`'SideEffectError' in import('interaqt')` 为 false |
| G2：replay 跳过 P；admit 重复为阶段 A 错误且不跑 P；无按 id 重跑入口 | 二次幂等 `outcome === 'replayed'`、`effects: []`；二次 admit 错误字符串含 `DuplicateOrder`、`effects`/`sideEffects` 为空 |
| G3：回执在 P 前；无义务查询 API | `finish` 在 `runDispatchAttemptBody` 事务内（约 1584–1594 行），P 在 COMMIT 之后（约 1360–1378 行）；事务外 `dispatchIdempotency.load` 抛 `dispatchIdempotency.load requires an active transaction` |
| `['*']` 不含关系端点 | 基关系、filtered relation、n:1 的 `findOne(..., ['*'])` 均无 `source`；端点 `attributeQuery` 可读 `source.id` |
| filtered relation 不是 `isRelation` | `D3rActiveRel`：`isFilteredRelation === true`，`isRelation` 缺席 |
| merged input 编译为 filtered | `D3rDog`：`isFilteredEntity === true`；`D3rSrc_liked_likedBy_D3rTgt`：`isFilteredRelation === true` |
| merged 抽象名可按该名加载，不可按该名 create | `findOne('D3rPet', id)` 可读行；`create('D3rPet')` 抛 merged union 错误 |
| 未知名 `getRecord` / `getRecordInfo` | `getRecord` 为 `undefined`；`getRecordInfo(name).isRelation` 为 `TypeError` |
| 写路径双名 create | 一次 `D3rSrc` create 同时发 `D3rSrc` 与 `D3rActiveSrc`；一次 `D3rDog` create 同时发 `D3rPet` 与 `D3rDog`；一次 Like create 同时发 `D3rInteract` 与 input 关系名 |
| 同名 map 后写覆盖 | create 失败后同记录 update 成功：两次回调均执行，最终 `sideEffects[name]` 只有 `result: 'ok'`、无 `error` |
| 业务事务推迟 P | callback 返回前 `postCommit` 未跑；`runInBusinessTransaction` resolve 之后已跑 |
| I-6 错误路径键 | `context, data, effects, error, sideEffects`；非参与成功路径另有 `outcome` 键（值为 `undefined`） |
| 参考函数 `classifyCreateMutationRerun` | 对本轮全部形态（普通实体、filtered entity、基关系、filtered relation、n:1、merged input/抽象实体与关系、`_Dictionary_` / `_System_` / 事件实体、缺席）求值与 §3.2.1 覆盖表一致 |
| `queryHandle.map.data` | 运行时等于 `MonoStorage.map`（`MapData`）；`Storage` 公开类型不声明 `queryHandle` |

`ActivityManager` 转发 `postCommit`（约 170 行）。`entityRetention` 仍在 P 尝试之后、不依赖 P 成功（约 1374–1378、1255–1258 行）。

### 2. 内部逻辑矛盾

未发现两项要求不能同时满足、或里程碑按设计无法通过验收的矛盾。

已在设计内收口、本轮不再作为复审项的张力：

- FR-SE-03 的「直到成功」与 FR-SE-02 的 create 子集：§3.3 义务可恢复表把闭合范围限制在 create mutation 副作用与 `postCommit`；update/delete 写为剩余缺口；M-03 负向禁止把 create 重跑 `complete` 当成首次阶段 P 全部收敛。与 Task 要求 3「必须明确不支持或引入历史」及要求 5 关闭 FR-SE-04 后必须写明剩余缺口一致。
- 三个输入空间不可互换：`postCommit` 调用约定为 `{ data: result.data, context: result.context }`（约 1616–1618 行）；探针中 `resolve` 包装对象与 `findOne(['*'])` 不相等。
- 状态表「非幂等成功 / outcome 缺席」与成功对象上存在 `outcome: undefined` 键：§3.5 与 M-01 已规定按**各自现有键集合**加 `postCommitPhase`，不删除成功路径的 `outcome` 键，也不给错误路径补 `outcome: undefined`。本轮错误路径键与 I-6 一致；非参与成功键为 `context, data, effects, outcome, sideEffects`。

§3.1 的 `!isPostCommitPhaseComplete` 示例包含「推迟中」，§3.3 要求业务事务在 `runInBusinessTransaction` resolve **之后**再走组合。二者可并存；实现注意事项中要求示例与重跑入口不要把 callback 内的 `notRun` 当成立刻重跑。

### 3. 违反项目原则

未发现。阶段 P 仍在 COMMIT 之后、失败不回滚事实、不写入 `result.error`。不把 `replayed` 改义为义务完成。不引入第二套事实成功枚举。分类只读编译 schema，禁止手走 `Controller.entities`。公开面最小（一个完成对象、一个谓词、两个重跑方法）。框架不内置调度器。

### 4. 违反任务目标

未发现。G1/G2 纳入 FR-SE-01/02/03；G3 存在且 FR-SE-04 不纳入，剩余缺口在 §3.4 写明（崩溃且不重投不可查询、admit 路径无 S3 归档、update/delete 无历史）。官方组合是文档化的 dispatch 之后按挂钩重跑，并保留默认 replay 跳过 P，满足「要么声明 replay 不含义务并走 FR-SE-02，要么提供替代入口」，且不维持「只跳过、无替代」。不把遍历 `sideEffects` 留作唯一官方完整成功检查。

### 5. 里程碑不可执行

未发现。M = 3，依赖顺序 M-01 → M-02 → M-03，均有可执行 Vitest 入口与负向对照。第一个里程碑经 `dispatch`（含业务事务）闭合可见性，符合尽早打通端到端。`postgresqlBusinessTransaction.spec.ts` 无真实 PG 时 skip 已写明。

### 6. 必须提前验证的重大风险

未发现无法在实现环境中及时验证、一旦推迟会使后续整体失效的风险。分类、端点重建、双名 create、后写覆盖、BT 推迟、replay 跳过均已在当前 HEAD 上用最小实验闭合。合表 / combined 关系与基关系走同一 `isRelation` 分支，可在 M-02 用项目既有 Vitest 覆盖，不必再开设计轮。

## 需要复审的问题

无。

## 实现注意事项

下列事项不改变复审结论，实现轮与审计轮应按设计正文执行，并避免用验收命令的缩写清单替代 §3 负向对照。

1. **M-01 必须包含同名后写覆盖负向。** 本轮探针：create 失败后同记录 update 成功，最终 `sideEffects[name]` 只有成功 `result`。若完成状态从最终 map 反推，该路径会标成 `complete`。§3.1 已列为非法；M-01 验收命令块未逐字写出，合同测试仍须包含，否则错误实现可以绿。
2. **官方组合按 `(recordName, id)` 调用，而不是只按 id。** 同一物理行会在 filtered / merged 下发两条 create（本轮：`D3rSrc`+`D3rActiveSrc`，`D3rDog`+`D3rPet`，input 关系名+`D3rInteract`）。`recordNameToSideEffects` 按名字分册。§3.2.1 已禁止「查一行覆盖该次 dispatch 的全部 mutation 义务」；M-03 示例不要写成只对业务实体名重跑一次。
3. **重跑入口不要在活跃业务事务里执行外部 IO。** §3.3 已要求在 BT resolve 之后组合。§7.13 的 fail-fast 不要只当可选加强：callback 内 `postCommitPhase.status === 'notRun'` 时立刻 `rerun*` 会把义务提前到 COMMIT 之前，随后冲刷还会再跑一次。§3.1 官方检查示例应写明：BT callback 内的 `notRun` 是等待冲刷。
4. **分类读取 `EntityToTableMap`。** 运行时路径是 `(system.storage as MonoStorage).queryHandle.map`（`.data.records` / `getRecord`）。`Storage` 类型没有 `queryHandle`。`MonoStorage.map` 已是 `MapData`，不是 `EntityToTableMap`，不能再取 `.data`。禁止先 `getRecordInfo(name).isRelation`。
5. **I-6 与成功路径键集合本来不同。** 错误路径今日无 `outcome` 键；非参与成功路径有 `outcome: undefined`。只把 `postCommitPhase` 加进各自现有键集合。
6. **幂等 replay 的 `rerunPostCommit` 使用本次响应上的 `data`/`context`。** 不要再 `dispatchIdempotency.load`（无活跃事务会抛错）。该对值是 `jsonSafeSubset` 之后的归档，不是 live `resolve` 返回值。
7. **文档扫面。** 除设计已列的 05 / 14 / generator / README 外，`agent/skill/interaqt-patterns.md` 仍以 `if (result.error)` 为成功检查示例，落地时一并改义务敏感表述。
8. **BT 推迟队列今日是两项**（`postCommit` 与 `mutationEffects` 共用同一 `result` 引用）。同一 `result` 只 `finalizePostCommitPhase` 一次。callback 内若保留该引用，冲刷前快照。
9. **`isPostCommitPhaseComplete` 是导出函数**，不是 Controller 方法。`PostCommitRerunResult` 不是 `DispatchResponse`（无 `error` / `outcome`）。`failures[].name` 对 postCommit 固定为 `'__postCommit'`，与 `SideEffectError.sideEffectName`（事件源名）不是同一个字段。
10. **n:1 / 合表关系**与基 n:n 同属 `kind: 'relation'`；M-02 用端点查询即可，不要用裸 `['*']` 当绿。合表拓扑建议有一条，但不单独构成新的设计分支。

## 结论

**通过。** 当前设计在六类复审条件下没有必须再开一轮设计的问题。下一会话执行 additional task 2（设计裁决）。
