# 设计评审：controller-retention-via-property-instances Task 1（设计轮 d=0）

评审对象：`docs/controller-retention-via-property-instances/controller-retention-via-property-instances.md`（`status: 设计中`，`design-round: 0/15`）。
评审人：独立设计评审（additional task 1）。评审前未读取任何旧版评审或归档运行（本轮为首轮，不存在）。

**结论：通过。**

未发现符合「设计复审条件」六类中任何一类的「需要复审的问题」。设计的关键事实主张经本评审独立复核全部成立（复核方式与证据见下）。其余有价值的意见列为「实现注意事项」，不影响本结论。

---

## 1. 评审方法（证据优先）

本评审没有采信设计的文字，而是对每条可验证主张做了独立执行：

| 设计主张 | 本评审的独立验证 | 结果 |
|---|---|---|
| §1.3 最小复现：每轮 `Entity+3 / Relation+3 / Property+9`、Controller / System / Database 全部存活、RSS 每轮 +≈215 MB | 亲自运行 `/tmp/interaqt-retention/repro.mts`（`npx tsx --expose-gc /tmp/interaqt-retention/repro.mts 4 pglite none`，PGLite，4 轮） | 一致：`delta={"Entity":3,"Relation":3,"Property":9}` 每轮，4 轮后全部 `CSD` 存活，RSS 576→1222 MB；`stringifyAllInstances` bound-state 名 0→24；`__type` Property 12 个（3/轮）；`Animal`/`Pet_base` 等派生 Entity 出现在 `Entity.instances` |
| 因果实验 A：只截断 `Property.instances` 三者仍存活 | 亲自运行（`truncate-property`） | 一致：`delta={"Entity":3,"Relation":3}`，全部 `CSD` 存活 → 证明问题陈述 §2 的直接链不是唯一保留链 |
| 因果实验 B：截断三表后三者全部释放、RSS 平稳 | 亲自运行（`truncate-all`） | 一致：`delta={}`，全部 `---`，RSS 4 轮稳定在 ≈417 MB → 证明除 Klass 注册表外无其它静态根 |
| §1.4 vitest 下 `v8.setFlagsFromString` + `vm.runInNewContext('gc')` 可获得可用 gc | 写临时 spec 在 `vitest.config.ts` 默认配置下实测（无 CLI 参数 与 `NODE_OPTIONS=--expose-gc` 两种方式） | 成立，**但有一个实现注意事项**：目标对象必须在「只返回 `WeakRef` 的函数内」创建（如 repro.mts 的 `oneRound()` 形态）；若目标在测试函数体内联创建、`ref` 存活于栈槽，或判定用的 `deref()` 与下一轮 `gc()` 同微任务（`WeakRef` KeepDuringJob 语义），会出现「gc 已可用但收集不掉」的假阴性（本评审第一次探针即因此误判，已定位并纠正）。§5.2 已把「CI 抖动」列为实现期风险，实现时须用 repro.mts 的形态 |
| §1.2 登记点枚举 R1–R8 完整 | `rg` 全部 33 个 `static instances` Klass（`src/core/init.ts` + `src/builtins/init.ts` 注册面）× `src/runtime` `src/storage` `src/builtins` `src/drivers` 的运行期 `X.create(` 调用 | 一致。其它 Klass 的命中全部是模块顶层常量（`GetAction`、`SystemEntity`、`InteractionEventEntity`、`ActivityStateEntity`、`NON_EXIST_STATE` 家族、`System.ts` 的 UniqueConstraint）或错误信息文本。另核对了两条设计未列入但确属非增长路径的边：(a) `Conditions` 构造器会把 `BoolExp` 转成注册的 `BoolAtomData`/`BoolExpressionData`——但它只在用户声明 / 反序列化路径被调用，`src/` 内无 setup/dispatch 调用点（`rg "Conditions.create"` 无生产命中）；(b) `Activity.clone(deep)` / `StateMachine.clone` / `Interaction.clone` / `Gateway.clone` / `Event.clone` 内部走 `this.create()` 会登记，但 `src/` 生产代码无任何调用点（仅测试与 `clone` 家族互调），不随 setup 增长。设计的 allowlist spec（§3.5）扫描的是 `src` 源码静态文本，能拦住未来新出现的运行期 `create` 调用，形态正确 |
| §1.1 注册表读者枚举（`clearAllInstances` / `stringifyAllInstances` / `ScopedSequence.parse` 路径；manifest 不读注册表） | `rg "\.instances\b" src/` 逐条核对；`createMigrationManifest`（`migration.ts:1010`）通读，确认读 `controller.entities` / `controller.relations`（构造函数里 `[...entities]` 即用户声明数组）而非注册表 | 成立。`ScopedSequence.deserializeEntityRef`（`ScopedSequence.ts:84–104`）确在 parse 路径按 uuid/name 查 `Entity.instances`；派生定义离开注册表后按 name 的 `find` 只会少命中、不会错命中（`find` 取首个，用户声明先入表），设计「只会更可靠」的判断成立 |
| §1.1「`stringifyAllInstances` 仅 `tests/core/utils.spec.ts` 使用」 | `rg -l stringifyAllInstances tests/` | **不准确但不影响结论**：实际有三个测试文件（`utils.spec.ts`、`stringify.spec.ts`、`serialization-roundtrip.spec.ts`）。逐一通读：`stringify.spec.ts` 只断言 API 存在；`serialization-roundtrip.spec.ts` 在 `beforeEach` 里 `clearAllInstances` 后自建模型再 round-trip。三者都**不依赖派生定义出现在输出中**。本评审亲自运行这三文件（33 用例）全绿。属于资料性陈述误差，列入实现注意事项 1 |
| §3.1 否决 `create(args, {register:false})` 形态的理由（`_options` 进序列化输出） | 读 `utils.ts:56–74` `stringifyInstance`：`options: instance._options` 确实逐实例序列化 | 理由成立 |
| §3.2 R1/R2「逐字同构」与汇合可行性 | 并排对照 `MonoSystem.ts` 2346–2402 与 2404–2453；差异仅有：`setup` 版遍历 `Object.entries(state)` 带 `stateName`（未使用）、尾部长 `[...entities, DictionaryEntity, SystemEntity], relations` 与 `prepareEntitiesForStorage` 返回值逐字相同；`storage.setup` 另收 `install` / `schemaOptions` 两参（汇合后照传即可） | 汇合方案可行，无隐藏差异 |
| §3.2 `derive` 新 uuid 与 `RefContainer` 身份匹配 | 读 `RefContainer.ts` `findReplacement`（`===` 或 uuid）、`addEntity`/`addRelation`（`===` 或 uuid 去重）、`replaceEntity`/`replaceRelation`（键匹配）；`Entity.clone`/`Relation.clone`/`Property.clone` 均 `new` 直构不带原 uuid，`create` 与 `derive` 同样 `generateUUID()` | 身份语义不变，主张成立 |
| R2 的三个触发点（`setup(install=false)` 轨 / `createMigrationBaseline` / `prepareMigrationContext`）与每轮增量 | `Controller.setup` 528–565：`install=false` 轨先 `prepareMigrationSchema`（→`prepareEntitiesForStorage`）再 `system.setup`（→R1），一次 `setup(false)` 实际走**两批** state 注入；`setup(true)` 只走 R1 一批。`createMigrationBaseline`（823）与 `prepareMigrationContext`（842）各调一次 `prepareMigrationSchema`。设计的 §3.5 第 4 项已把 migration 轨单列断言，M-01 的红色基线在 `setup(true)` 上计量（+9/轮），migration 轨在 spec 内另行断言 | 与设计一致，无缺口 |
| `HardDeletionProperty.create()` 是用户声明路径 | `Controller.ts:390–392` 只定义工厂；`rg HardDeletionProperty src/` 无运行时调用点；使用全部在测试（`stateMachine.spec.ts` 等）与 `tests/runtime/data/` 的实体声明里 | 归类正确 |
| 闭包捕获主张：`defaultValue` 捕获整个 `stateItem`、`RecordBoundState.controller` 由 `Scheduler.createStates`（262–268）/ `setupGlobalBoundStateDefaultValues`（400+）/ `Custom.ts`（195–226）赋值 | 逐处读源码 | 成立。`setup` / `prepareEntitiesForStorage` 的箭头函数 `() => stateItem.defaultValue` 按闭包捕获语义捕获 `stateItem` 整个绑定；`createStates` 里 `stateItem.controller = this.controller` 无条件执行 |
| 文档落点存在 | `agent/agentspace/knowledge/usage/13-testing.md` 存在；`agentspace/knowledge/` 目录存在；`CHANGELOG.md` 存在 | 落点可行 |

基线复核：`npm run check` 通过；`tests/core/utils.spec.ts + serialization-roundtrip.spec.ts + stringify.spec.ts`（33 用例）、`tests/storage/review-fixes-2026-07-10-r12.spec.ts + tests/runtime/review-fixes-2026-07-12-r23.spec.ts`（13 用例）全绿。工作树除未跟踪的文档目录外无改动（本评审的探针脚本均在 `/tmp`，临时 spec 已删除）。

## 2. 六类复审条件逐项检查

1. **关键事实错误**：无。见 §1 表——所有方案承重的事实主张（问题存在、两族保留链、无其它静态根、读者枚举、身份语义、汇合可行性）均独立复核成立。唯一发现的陈述误差是 `stringifyAllInstances` 测试读者清单少列两个文件（见上），但逐一核对后它们的语义与设计结论（「无读者依赖派生定义出现在输出中」）相容，不构成使方案失效的事实错误。
2. **内部逻辑矛盾**：无。`derive` 不登记 + 闭包只捕获纯值 + `system.destroy()` 合同的组合，与因果实验 B 的「注册表净空 ⇒ 三者可回收」因果结论自洽；非目标（要求 5）与方案各条不冲突。
3. **违反项目原则**：无。汇合点修复（一条 `derive` 路径而非逐点补丁）符合 AGENTS.md「修一类，不修一个实例」；不截断注册表、不给 `clearAllInstances` 增加隐式语义符合显式控制原则；`Klass 模式不变`（不移除 `static instances`、`create` 校验与登记逐字保留）符合 Klass 模式约束；依赖方向未变。
4. **违反任务目标**：无。要求 1（求证 + 两族链 + 8 登记点 + 反证豁免项）已完成并有可复现证据；要求 2 的四条设计约束（汇合点 / 切断闭包 / 不截断 / 用户声明语义不变）全部映射到方案条款；要求 3 裁定了两个允许形态之一（不新增 API，且给出了「仅 FR-RET-01 即可满足」的因果证据）；要求 4 的四类测试与复跑清单齐备，且注册表不变量测试无条件运行；要求 5 的非目标逐条落为硬约束。范围提示（`MergedItemProcessor` 必须一并改走非注册路径）在 R3–R8 全覆盖。
5. **里程碑不可执行**：无。M-01→M-04 依赖顺序正确（红色基线 → core 工厂 → 全登记点改造 → 文档/全量回归）；每个里程碑有明确验收命令；M-01 的「当前 HEAD 上红」与本次复现数字一致，可执行；M-02 的 allowlist spec 在该里程碑预期红（R1–R8 未改）→ M-03 转绿，阶段可判定。
6. **必须提前验证的重大风险**：无遗留。设计阶段必验的五项（复现、保留链完整性、gc 暴露方式、`stringifyAllInstances` 读者、`RefContainer` 身份依赖）全部已在本轮完成并记录；剩余风险（错误信息逐字不变、`storage.setup` 收图等价、merged 守卫误拒、默认值语义、CI GC 抖动）按协议第 4 条属于实现期可验证风险，设计已在 §5.2 给出验证安排。

## 3. 实现注意事项（不构成复审问题）

1. **§1.1 的测试读者清单少列**：`stringifyAllInstances` 的测试读者实为 `tests/core/utils.spec.ts`、`tests/core/stringify.spec.ts`、`tests/core/serialization-roundtrip.spec.ts` 三个（设计只写了第一个）。三者均 `clearAllInstances` 后自建模型，不依赖派生定义在输出中，设计结论不变；M-03 复跑时建议把三个文件都列入（`tests/core` 全量已覆盖，无需额外动作），设计文档如顺手可修正该句。
2. **可回收性测试的写法必须避开两个 V8 陷阱**（本评审实测踩过）：(a) 目标对象要在「只返回 `WeakRef` 的函数」内创建，避免测试帧的栈槽/局部变量保活；(b) 判定 `deref()` 不得与后续 `gc()` 同微任务循环（`WeakRef` KeepDuringJob 会保活到当前 job 结束）。§5.2 的「抖动重试」安排应建立在这个正确形态之上，而不是靠放宽重试次数掩盖形态错误。
3. **`setup(false)`（migration 轨）每轮是两批注入**（`prepareMigrationSchema` 的 R2 一批 + `system.setup` 的 R1 一批），`setup(true)` 只有一批。M-01 spec 的 migration 断言与 install 断言应分别计量，避免把「+18/轮」误读为新增回归。
4. **`type: typeof stateItem.defaultValue` 的既有小瑕疵**：当 `defaultValue` 是对象（非 number/string/boolean）时 `typeof` 得 `'object'`，`Property.create` 对 `object` 类型放行——`derive` 沿用同一校验即可，不要顺手"修复"（超出任务范围，且可能改变列类型行为）。
5. **allowlist spec 的扫描范围**：`src/drivers` 也应纳入扫描（设计 §3.5 写的是 `src/runtime`、`src/storage`、`src/builtins`，任务要求 1 的枚举范围含 drivers；当前 drivers 无命中，纳入只增不减）。
6. **`Relation.derive` 的参数面**：R3 传 `baseRelation`、R7/R8 传 `source`/`target` + `properties`，`derive` 复用 `create` 的校验块时要确认 merged-with-properties 守卫（`Relation.ts:361–365`）以 `inputRelations` 为条件——R8 的虚拟 base 无 `inputRelations`，带 `properties` 会正常通过，与设计 §3.2 的判断一致；实现时把该守卫行为写进 `deriveDefinition.spec.ts` 的用例即可固化。

## 4. 复核中产生的临时产物

- `/tmp/interaqt-retention/`（复现脚本随设计已存在，本评审复用；另新增 `gc-probe.spec.ts`、`gc-variants.mjs` 两个 gc 机制探针）。
- 仓库内临时 spec（`tests/runtime/__tmp-gc-probe.spec.ts`）已全部删除；`git status` 确认无已跟踪文件改动。

## 5. 结论

`通过`。设计可进入裁决（additional task 2）。
