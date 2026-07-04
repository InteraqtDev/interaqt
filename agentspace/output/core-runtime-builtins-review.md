# core / runtime / builtins 深度 Review 报告

- 日期:2026-07-04
- 基线 commit:`f6eb89d`(main,detached at `df1a9eb`)
- 范围:`src/core`、`src/runtime`、`src/builtins` 三个包(约 20,000 行),`src/storage` 仅在追溯问题根因时交叉阅读
- 方法:三个包并行深度探查 + 人工精读关键执行路径(Controller.dispatch、Scheduler、transaction、ComputationSourceMap、各 computation handle、InteractionCall/ActivityCall)+ **对每个致命判定编写最小复现测试实际运行验证**
- 测试基线:当前全量测试 **1636 passed / 26 skipped,全绿**。下述致命问题均不在现有断言覆盖范围内
- 复现测试:本次 review 为 F1/F2/F3/F5/F6/F7/F8(a) 编写的复现测试已提交为 `tests/runtime/review-repro-{guards,activity,computations}.spec.ts`(以 `test.fails` 标注,详见第五节)

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

**总体结论:架构和事务模型是健康的;致命问题集中在三处 —— (1) 增量计算在"update 事件只携带变更字段"这一事实下的多处错误,(2) builtins 的 guard/校验链存在多个 fail-open 和一个提前 return 的硬 bug,(3) Activity 运行时:Gateway 支持实际上是坏的,`any` 组的互斥剪枝失效可确定性双花。**

---

## 二、致命问题(Fatal)

除 F8(需要真实 PostgreSQL 并发,见该条说明)外,**所有 F 级问题均已由可运行的复现测试实际确认**。复现测试已提交进仓库(`tests/runtime/review-repro-*.spec.ts`),全部用 `test.fails` 标注"断言正确行为、当前必然失败":今天套件保持全绿,任何一个 bug 被修复后对应测试会自动转红提醒移除 `.fails`。

> **勘误**:初版报告中的 F4(PropertyCount + callback 双重计数 / computed 属性不触发 / HardDeletion 崩溃)**已在 main 上修复**(commits `0875658`、`06375f0`),`count-callback.spec.ts` 中的 BUG 注释是过期残留——测试断言的是正确值且全部通过。初版报告误读了"测试通过"的含义,该条已撤销,详见第 2.5 节。

### F1. `checkPayload` 遇到"缺失的可选字段"时提前 `return`,跳过其后所有校验(含 required)

`src/builtins/interaction/Interaction.ts` L350–351:

```342:351:src/builtins/interaction/Interaction.ts
  for (const payloadDef of payloadDefs) {
    if (payloadDef.required && !(payloadDef.name! in payload)) {
      throw new InteractionGuardError(
        `Payload validation failed for field '${payloadDef.name}': missing`,
        { type: `${payloadDef.name} missing`, checkType: 'payload' }
      );
    }

    const payloadItem = payload[payloadDef.name!];
    if (payloadItem === undefined) return;
```

`return` 应为 `continue`。payload 定义顺序中只要有一个可选字段未传,**其后所有字段的 required / isCollection / isRef / concept 校验全部被跳过**。

**复现已确认**:定义 `[note(可选), title(必填)]`,dispatch 空 payload,`result.error` 为 `undefined`,必填校验被完全绕过。这是一行修复(`return` → `continue`),但影响面是所有多字段 Interaction 的输入校验与权限语义,属于安全边界失效。

### F2. GlobalCount / GlobalEvery 的 update 增量路径使用"只含变更字段"的 partial record 调用 callback

storage 的 update 事件 `record` 只包含本次变更的值字段(`src/storage/erstorage/CreationExecutor.ts` L191–202 构造 `updateRecord` 时仅放入 `newEntityData` 中出现的字段)。而:

- `src/runtime/computations/Count.ts` L86–89(GlobalCount update 分支)
- `src/runtime/computations/Every.ts` L84–87(GlobalEvery update 分支)

直接把 `mutationEvent.record` 传给用户 callback。callback 若依赖任何**未在本次 update 中出现**的字段,读到 `undefined`,增量 delta 计算错误,且结果被写入 `isItemMatch` bound state,**错误会持久化并污染后续增量**。

**复现已确认(两例)**:callback 为 `t.status === 'active' && t.score > 50`,只 update `status` 字段 → Count 应为 1 实际为 0;Every 应为 true 实际为 false。复现测试:`tests/runtime/review-repro-computations.spec.ts`。

对比:`Any.ts` L81–90 和 `Summation`/`Average`/`WeightedSummation` 的同路径都已改为先 `findOne` 拉全量(Any 中有明确注释"拉取全量的 new record 数据"),**Count/Every 是被遗漏的两个**。修复方式与 Any 完全一致。

### F3. PropertyAverage 的 update 增量路径 relationMatchKey 构造错误,直接抛 TypeError

`src/runtime/computations/Average.ts` L286–296:update 分支固定使用

```typescript
MatchExp.atom({key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'), value: ['=', relatedMutationEvent.oldRecord!.id]})
```

当 `relatedAttribute` 为 `['students']`(关联实体自身字段更新的常见形态)时,`slice(2)` 得空数组,match key 变成 `'id'` —— 用**学生实体的 id 去匹配关系记录的 id**。两类 id 一旦不一致,`findOne` 返回 `undefined`,下一行 `newRelationWithEntity[this.isSource ? 'target' : 'source']` 抛 `Cannot read properties of undefined (reading 'target')`,**整个 dispatch 事务被 abort**。

**复现已确认**:先创建 3 个学生再建立关系(让关系 id ≠ 实体 id),update 学生 score → `ComputationError: ... Cannot read properties of undefined (reading 'target')`。复现测试:`tests/runtime/review-repro-computations.spec.ts`。

现有测试 `averageUpdatePath.spec.ts` 恰好在关系 id 与实体 id 巧合相等的场景下通过(每张表各自从 1 开始自增,测试里第一个学生配第一条关系)。`Summation.ts` L242–247 和 `Count.ts` L248–253 有正确的三分支 key 构造逻辑,Average 应复用同一实现(建议抽取共享的 `buildRelationMatchKey`)。

### F4.(已撤销)PropertyCount + callback 双重计数 / computed 属性不触发 / HardDeletion 崩溃 —— **已在 main 上修复**

初版报告将此列为致命现存问题,**经重新核实予以撤销**:

- `tests/runtime/count-callback.spec.ts` 与 `count-hard-deletion.spec.ts` 断言的是**正确值**(`toBe(0)`/`toBe(1)`/`toBe(3)`),且当前**全部通过**——即框架行为已正确。
- 修复对应 commits:`0875658 fix: propagate computed updates to count callbacks`、`06375f0 fix: use record instead of oldRecord in Count delete event handling`,均已在 HEAD 祖先链上。
- 这两个测试文件头部的大段 "BUG ... This assertion FAILS" 注释是修复前的过期残留,极具误导性(本次 review 的初版判读即被其误导)。**建议清理这些注释**,并把文件更名为常规回归测试。

保留的关注点:PropertyCount 的 relation delete 分支(`Count.ts` L232–242)仍不像 GlobalCount(L85)那样在减 delta 后复位 `isItemMatchCount`,filtered relation 成员资格"退出→再进入"场景下有陈旧 state 风险(归入 S5)。

### F5. Activity Gateway 全链路损坏(图构建 + 状态推进)

`src/builtins/interaction/activity/ActivityCall.ts`:

- **图构建**(L230–240):`Gateway.is(sourceNode)` 检查的是 `_type === 'Gateway'`,但 `sourceNode` 是图节点包装 `{ content, next: [], prev: [], uuid }`,没有 `_type`,恒为 false。于是 GatewayNode 的 `next: []` 数组被 `sourceNode.next = targetNode` 直接覆盖成单节点,**并行分支拓扑丢失**。已核实 `Gateway.is` 实现(`Gateway.ts` L69–70)确认此判断不可能为真。
- **状态推进**(L96–105):`transferToNext` 会把 GatewayNode 当作普通状态节点写入 `current`,而 `isInteractionAvailable` 只匹配 Interaction/Group 的 uuid,Gateway 的 uuid 永远无法被 dispatch 命中 → **Activity 永久卡死在 Gateway 上**。
- 另有 L225–226 的 `rawGatewayToNode` map 声明后从未写入(gateway 实际存进了 `rawToNode`,查找侥幸成立),属于同一块代码质量问题的佐证。

**复现已确认(两例)**,见 `tests/runtime/review-repro-activity.spec.ts`:
- F5a(状态卡死):`step1 → gateway → step2` 的线性 Activity,完成 step1 后 dispatch step2 → `Error: interaction ... not available`,Activity 永久卡死。
- F5b(拓扑丢失):gateway 两条出边,构图后 `gatewayNode.next` 不是含 2 条边的数组,而是被覆盖成单个节点。

现状:tests 中没有任何"执行经过 Gateway 的 Activity"的运行时测试(仅 core 层的结构测试)。**建议:要么完整实现(gateway 自动跳过 + 并行边),要么在 `Activity.create` 中对含 transfers 指向 Gateway 的定义直接抛"not supported",不要让用户静默得到坏状态机。**

### F6. 权限链多处 fail-open

`src/builtins/interaction/Interaction.ts`:

1. **`checkConcept` 对 Attributive base 直接放行**(L417–419):payload 字段以 Attributive 为 base 时 `return true`,attributive 的 content 从不执行 —— payload 级权限校验为空实现。
2. **`checkConcept` 末行无条件 `return true`**(L426–427):未知 concept 类型一律通过。
3. **Entity base 不验证存在性/所属实体**(L421–424):`isRef` 只检查形状 `{id}`,不查库确认该 id 存在、更不确认属于声明的 Entity。跨实体 id 注入、伪造引用均可通过 guard(后续 storage 操作可能失败,但那时事件记录语义已错,且错误信息完全不指向权限问题)。
4. **回调返回 `undefined` 视为通过**(L277–278、L301–302,`ActivityCall.ts` L408 同):Condition/Attributive 回调若忘写 `return`,静默放行。异常是 fail-closed(catch → false),但 `undefined` 是 fail-open,与之不一致。
5. **`DerivedConcept.attributive` 分支为死代码**(L401–407):if/else 两个分支完全相同,derived attributive 从不执行。

**复现已确认(1/3/4 三例)**,见 `tests/runtime/review-repro-guards.spec.ts`:
- F6-1:payload base 为 content 恒返回 `false` 的 Attributive,dispatch 依然成功(attributive 从未执行)。
- F6-3:`isRef` payload 传不存在的 id `'no-such-id-999'`,guard 放行,dispatch 无错误。
- F6-4:attributive 回调忘写 `return`(返回 `undefined`),权限检查静默通过。

按项目"explicit control"原则,guard 链应统一 fail-closed:`undefined`、未知类型、无 content 的 attributive 出现在权限位上都应显式报错而非放行。

### F7. `isRef` Attributive 在独立 Interaction 中语义静默降级

Activity 路径的 `fullGuardWithUserRef`(`ActivityCall.ts` L340–346)对 `attributive.isRef` 走 `checkUserRef`(对比 activity refs 中记录的用户 id);而独立 Interaction 的 `checkUser`(`Interaction.ts` L307–316)**没有 isRef 分支**,`createUserRoleAttributive({ name: 'B', isRef: true })` 会被当成 `user.roles.includes('B')` 的角色检查执行。开发者以为在做"必须是流程中绑定的那个人"的身份校验,实际执行的是完全不同的检查。无 `activityId` 场景下遇到 isRef attributive 应显式抛错(fail-closed)。

**复现已确认**,见 `tests/runtime/review-repro-guards.spec.ts`:userAttributives 为 `isRef: true` 的 'Approver',一个恰好持有名为 `'Approver'` 的**角色**的无关用户 dispatch 成功——身份绑定检查被静默降级为角色检查。

### F8. Activity `any` 组互斥性失效:剪枝丢失(确定性复现)+ 并发 read-modify-write(设计缺陷)

本条在复现过程中拆成两个层次:

**(a) 确定性复现 —— `any` 组剪枝结果被丢弃(即 S18 的升级)。** `AnyActivityStateNode.onChange`(`ActivityCall.ts` L416–426)返回 `{ children: <过滤后的分支> }`,但**没有任何调用方消费这个返回值**(基类 `onChange` 返回 void,`transferToNext` L104 不接收)。只要 `any` 组的分支是多步序列,一条分支推进后兄弟分支依然可用——**互斥分支可以被顺序地全部执行完,不需要任何并发**。

**复现已确认**,见 `tests/runtime/review-repro-activity.spec.ts`:`any` 组含 approve1→approve2 与 reject1→reject2 两条两步分支,完成 approve1 后 dispatch reject1、reject2 全部成功,XOR 语义完全失效。这把原 S18 从 significant 升级为 fatal 级别的确定性双花。

**(b) 并发 read-modify-write。** `checkActivityState`(L318–323)与 `completeInteractionState`(L362–368)是经典 read-modify-write,无版本号/CAS。对单步分支的 `any` 组(如 friend-request 的 approve/reject),双花需要两个事务在对方 commit 前完成同一状态快照的读取。**本次在真实 PostgreSQL 16 上用 `Promise.all` 并发 dispatch 未能稳定触发**:观察到的行为是后到者在 `completeInteractionState` 重读时拿到已推进的状态,`findStateNode(uuid)!` 返回 `undefined` 后抛 `TypeError: Cannot read properties of undefined (reading 'complete')`——即当前实现"侥幸"以一个**未处理的 TypeError**(而非清晰的 `ActivityStateError`)挡住了这条竞争路径,且窗口是否可穿越取决于 guard 读与状态写的时序,属于时序运气而非设计保证。结论:(a) 已是确定性 bug 必须修;(b) 的修复(state 版本号条件 update,失败给出明确业务错误)应与 (a) 一起做,顺带消除这个 TypeError。

---

## 三、显著问题(Significant)

### runtime

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| S1 | **同一 mutation 触发的多个 computation 无拓扑排序** | `Scheduler.ts` L367–387 | 按 source map 注册顺序串行执行,若计算 A 的输出是 B 的输入且同批触发,B 可能基于陈旧值计算,依赖后续级联事件二次修正才收敛(收敛性依赖偶然而非设计)。migration 路径有 topo sort(`migration.ts`),runtime 主路径没有。建议 manifest 级构建依赖图排序,或至少检测环并文档化顺序契约 |
| S2 | **guard / mapEventData / afterDispatch 在 retry 边界内会被重放** | `Controller.ts` L608–638 | `RequireSerializableRetry` 与 40001 冲突都会整段重跑。`postCommit` 已正确隔离,但用户在 `afterDispatch`/`guard` 里做的非幂等外部 IO 会重复执行。README 有提示,但框架层面可考虑在 attemptArgs 上暴露 `attempt` 编号,并在错误信息中强化约束 |
| S3 | **global dict 变更触发依赖它的 property 计算时全表扫描 `['*']`** | `Scheduler.ts` L451–464 | 对每个依赖该 dict 的 property computation 做 host entity 全表 find 且在事务内,大表下是延迟与锁放大的隐患 |
| S4 | **`computeOldRecord` 对关联路径返回 `{...newRecord}` 占位** | `Scheduler.ts` L440–446(带 FIXME) | 关联实体变更时 oldRecord 是当前记录副本,依赖 old/new diff 的下游判断(如 membership 变化)可能误判 |
| S5 | **Property 级聚合在 relation delete 时不复位 per-item bound state** | `Summation.ts` L235–238、`WeightedSummation.ts` L204–207、`Count.ts` L232–242 | Global 路径在 `dd5feef` 中已修复并加了 CAUTION 注释,property 路径行为不对称;filtered relation 成员资格退出后再进入会读到陈旧 state |
| S6 | **`Controller.addEventListener`/`callbacks` 是死代码** | `Controller.ts` L568、L734–739 | 从未被读取;`agentspace/knowledge/filtered-entity-usage-guide.md` 还在描述该 API。删除或接入 |
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

### builtins(除 F 级外)

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| S17 | **`saveUserRefs` 对 `isCollection` payload 取 `.id` 得 undefined** | `ActivityCall.ts` L379–385 | collection 时 `payloadItem` 是数组,`(payloadItem as {id}).id` 为 undefined,refs 被污染;且 `checkUserRef`(L392–396)对数组 refs 用 `===` 比较恒 false。collection itemRef 从未真正工作过 |
| S18 | **`AnyActivityStateNode.onChange` 返回值被丢弃** | `ActivityCall.ts` L416–426 | 已升级并入 F8(a):确定性双花,见 `review-repro-activity.spec.ts` 复现 |
| S19 | **`findStateNode` 嵌套 Group 时多取一层 `.current`** | `ActivityCall.ts` L90–95 | `find(child => child.findStateNode(uuid))?.current` 返回的是 seq 的 current 而非命中的 state node,嵌套 group 下 `completeInteraction` 会拿错节点 |
| S20 | **`PayloadItem.type` 声明了但从不校验** | `checkPayload` 全函数 | runtime 类型检查缺失,`type: 'string'` 传对象也通过 |
| S21 | **`DataAttributive`/`DataAttributives` 定义并导出但零接入** | `Data.ts` | `retrieveData` 只使用 `dataPolicy.match`,DataAttributive 是悬空 API,要么接入 `GetAction` 的 resolve 链,要么移除 |
| S22 | **未知 ActivityGroup type 直接 `new undefined()`** | `ActivityCall.ts` L132 | `GroupStateNodeType.get(type)!` 无校验,应在 Activity.create 时报清晰错误 |
| S23 | **头/非头 Interaction 的 guard 路径不一致** | `ActivityManager.ts` L98–117 | 头节点走 `interaction.guard`(无 isRef 支持),非头节点走 `fullGuardWithUserRef`(不含 `interaction.guard` 中的完整逻辑),两套代码漂移。应提取统一的 guard runner |

### 分层违规

- **M-1**:`src/builtins/interaction/activity/ActivityCall.ts` L6 直接 `import { MatchExp } from "@storage"`,违反 `builtins → runtime → storage → core` 的单向依赖(builtins 不应直接触达 storage)。core 与 runtime 未发现违规。建议 runtime re-export MatchExp 或提供查询封装。

---

## 四、修复优先级建议

**P0(安全/正确性,改动小、收益大,建议立即修):**
1. F1 `checkPayload` 的 `return` → `continue`(一行)。
2. F2 GlobalCount/GlobalEvery update 路径改为 findOne 拉全量(照抄 Any 的实现,各约 5 行)。
3. F3 PropertyAverage 复用 Summation 的 relationMatchKey 三分支逻辑(建议抽公共函数,一并消除三处重复)。
4. F6 中的 1/2/5(checkConcept 的三处 fail-open,均为局部小改)。
5. F8(a) `any` 组剪枝:让 `transferToNext` 消费 `onChange` 的返回值或改为 `onChange` 内直接修改 `this.children`。

**P1(需要设计,但属于框架可信度基石):**
6. F7 isRef 语义统一 + F6-4 `undefined` fail-closed(可能破坏依赖隐式放行的现有用户,需要 changelog)。
7. F8(b) Activity state 版本号 CAS,顺带把并发落败路径的 `TypeError` 换成明确错误。
8. S9 Relation `isTargetReliance` 覆盖修复。

**P2(债务清理):**
9. F5 Gateway:短期在 create 时禁用并报错,长期决定是否完整实现。
10. S10/S11/S12 序列化与 registry 一致性(或正式废弃这条管道)。
11. S1 计算拓扑排序、S3 global-dep 全表扫描、S17/S19 Activity 细节、M-1 分层违规。
12. 清理 `count-callback.spec.ts` / `count-hard-deletion.spec.ts` 中过期的 BUG 注释(见 F4 勘误)。

---

## 五、复现测试

**已提交进仓库**(全部 `test.fails` 标注:断言正确行为、当前必然失败,套件保持全绿;bug 修复后对应测试转红提醒移除 `.fails`):

| 文件 | 覆盖 | 内容 |
|------|------|------|
| `tests/runtime/review-repro-guards.spec.ts` | F1、F6-1/3/4、F7 | 可选字段提前 return 绕过必填;Attributive base 不执行;isRef 不存在 id 放行;`undefined` fail-open;isRef 降级为角色检查 |
| `tests/runtime/review-repro-activity.spec.ts` | F5a、F5b、F8(a) | Gateway 卡死;Gateway 出边被覆盖;`any` 组剪枝失效顺序双花 |
| `tests/runtime/review-repro-computations.spec.ts` | F2×2、F3 | GlobalCount/GlobalEvery partial record;PropertyAverage match key 崩溃 |

**未提交的核实记录**:

- **F8(b) 并发路径**:在本机安装 PostgreSQL 16,用 `Promise.all` 并发 dispatch `any` 组两个互斥分支(附带拉长 guard 与 afterDispatch 窗口的延时),未能稳定穿越竞争窗口:后到者在 `completeInteractionState` 重读时状态已推进,`findStateNode(uuid)!` 为 `undefined`,抛 `TypeError: Cannot read properties of undefined (reading 'complete')` 使 dispatch 回滚。即互斥性目前由一个未处理的 TypeError"侥幸"守住,不是设计保证;确定性的双花走 F8(a) 已复现。
- **F4 勘误核实**:重跑 `count-callback.spec.ts`(5 个测试)与 `count-hard-deletion.spec.ts`(1 个测试),断言均为正确值且全部通过;`git merge-base --is-ancestor` 确认修复 commits `0875658`、`06375f0` 在 HEAD 祖先链上。
