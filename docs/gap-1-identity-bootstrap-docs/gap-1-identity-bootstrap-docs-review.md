# GAP-1 身份自举与系统事件源文档缺口 — 设计评审（轮 3）

```text
结论: 通过
design-round 被评审对象: 2/15（状态块 status: 设计中, implementation-round: 0/0）
评审日期: 2026-08-30
评审基准: 工作树 HEAD 0249556（与设计文档 §6 基线一致；知识库文件自裁决轮 2 后无变化，git status 仅未跟踪任务目录与 prompt/skill 文件）
```

评审者为独立会话，未读取本文件旧版内容与归档运行；全部结论基于对 Task 1、当前设计、项目规则、源码与知识库文本的独立复核，以及可执行验证（见「设计事实复核记录」）。

## 设计事实复核记录

以下每项均由本轮亲自执行（读源码、跑 grep、运行测试、编写并删除最小验证探针），非转述设计文档：

1. **能力事实（设计 §1.1）全部属实。**
   - `src/core/EventSource.ts`：`EventSource.create` 在 `:198`；`EventSourceCreateArgs`（`:85-96`）字段与设计所列权威清单一致；legacy guard-only CreateArgs 在 `:205-212` 声明期抛错，错误文本含 "admit"；实例 `guard` 为弃用别名（`:48-52`、`:110-111`、构造器 `:128`）；anonymous EventSources 注释在 `:78-82`。
   - `src/runtime/Controller.ts`：`dispatch` 体（`:1392` 起）入口校验恰为四项——eventSource 非空断言、`NestedDispatchError`、`DISPATCH_IN_NON_BT_TRANSACTION`、`ABORTED`——无任何 user 校验；`USER_ENTITY` 常量（`:78`）在 `src/` 全仓仅此一处定义、无校验消费；admit 管线与缺 admit 报错在 `:1609-1617`；`ControllerOptions` 无 `interactions` / `activities` 键，Interaction 经 `eventSources` 注册。
   - `src/builtins/interaction/Interaction.ts`：`InteractionEventArgs.user` 为类型层必填（`:29`）；`instance.guard = admit`（`:196`）；`runInteractionGuard` = `checkCondition` + `checkPayload`，无 user 存在性检查（`:325-330`）。
   - `src/core/Entity.ts`：`normalizeEntityIdentity`（`:280` 起）含 `baseEntity`（`:301`）/ `inputEntities`（`:306`）两个 fail-fast 分支。`src/core/Relation.ts` 全文无 identity。`src/storage/erstorage/Setup.ts` 的 `assertMysqlDoesNotSupportIdentity`（`:746`，`:1010` 调用）。`CreationExecutor.createIdentityRecord`（`:853`，`:164` 分派）。
2. **§1.3 更正属实。** `src/runtime/computations/Transform.ts:13-16` 注释明言顶层 id 合法、碰撞经唯一索引 fail-loud；`tests/runtime/review-fixes-2026-07-10-r13.spec.ts` F-3 三个测试（`:182` 碰撞 fail-loud、`:226` 剥离正对照、`:253` 显式唯一 id 合法）与之匹配。`callInteraction` 在 `Controller` 上不存在（`ControllerOptions` 已读，无该键；知识库中 172 处引用属另立任务范围，与设计 §1.3.2 判断一致）。
3. **成员表 T1（22 处）与 T2（18 处）的验收锚点全部具备判别力。** 对当前未修正文本实测：M-03 命令 (1) 的 25 个 T1 锚点 25/25 命中（RED）；命令 (3) 的 11 个 T2 锚点 11/11 命中（RED）；命令 (2) 冒号形签名基线恰为 6 处（`generator/api-reference.md` ×5 + `agent/skill/interaqt-reference.md:594`），与设计 §5.1 探针 P6 记录一致；M-02 的 `user validation`（全库活范围恰 2 处：api-reference `:2643`/`:3561`）、`pre-built guard`（`:2643`）、usage/02 缺 Relation 句（grep 计 0）、README 学习路径不含 21（rc=1）今日均为 RED。
4. **M-01 形态 (b)(c) 独立可运行证实。** 本评审编写临时探针 spec（PGLiteDB、经 `eventSources` 注册、`setup(true)`、显式 attributeQuery）实测：无 conditions 的 Interaction 在 args 完全不含 `user` 时 dispatch 成功且 Transform 经 `InteractionEventEntity` create 事件派生实体（形态 b）；读 `event.user` 的 Condition 拒绝匿名调用（形态 c）。探针首轮失败暴露的正是设计 M-01 实现注记所警告的混淆项——payload 未声明 `Payload`/`PayloadItem` 时 `checkPayload` 以 `InteractionGuardError`（`checkType: 'payload'`，`type: 'email not defined'`）拒绝，与 user 无关——该注记必要且准确。探针已删除现场（`git status tests/` 干净）。
5. **基线测试复现。** `npx vitest run tests/runtime/eventSource.spec.ts tests/runtime/applicationIdentity.spec.ts tests/runtime/dispatchIdempotency.spec.ts` → 3 files, 95 passed / 0 failed，与设计 §5.1 记录一致。§3.1 映射表所引测试标题逐个核实存在（eventSource.spec `:13`/`:91`/`:189`/`:245`；`dispatchIdempotency.spec.ts:503` 恰为 guard-only 拒绝回归）。
6. **覆盖盘点属实。** `usage/02:388` 残余清单句确实只列 filtered/merged 与 MySQL、未列 Relation（R3 缺口成立）；`usage/03:76` 已覆盖 Relation 并引用 02；`usage/14:23` 与 `generator/api-reference.md:1713` 覆盖 filtered/merged 与 MySQL；AGENTS.md identity 段覆盖同两项；`usage/15:1228-1237` 判别表与 `generator/api-reference.md:1709` 生成规则存在（R5「已有正式覆盖、补交叉引用」的判定成立）；`usage/14:1432` 为权威管线表述（admit → open? → map → create → resolve → afterDispatch），与 `Controller.ts` 实际管线一致，B1 的对齐处置正确。

## 六类复审条件逐项检查

1. **关键事实错误**：未发现。§1.1、§1.2、§1.3 全部载重事实经上述独立复核为真。前两轮的失败模式（同类枚举不完整）本轮以独立更宽扫描复检：P 形变体（entry point / exclusively through / must go through / created…through Interactions / no other way / sole / source of truth / data enters-originates-flows）、C 形变体（full coverage / 100% / no need to test / implicitly / naturally / sufficient）、guard 屈折形式（guards / guarded / guarding）、`.mdc`、`agent/CLAUDE.md`、`agentspace/knowledge|challenge`——未发现 T1 ∪ T2 ∪ 保留清单之外的家族成员；C 形辅助筛查（命令 4b）当前 5 处命中逐条对应 T1 成员行（13-testing `:281`/`:283`/`:285`/`:1172`、generator test-implementation `:4`），无未分类残留。抽查保留清单分类（19:406/:448/:449、generator test-impl :9/:31、04:195/:1107、05:89/:441、data-analysis:240 等）均为纯规定性指令或响应式叙述，裁定正确。
2. **内部逻辑矛盾**：未发现。M-01 → M-02 → M-03 依赖序成立；api-reference `:2643` 同时命中 user-validation 家族与 T2-B3，设计已在 §3.2/M-02 验收中显式协调（一次改写、两处验收覆盖，`! grep "user validation"` 与 `! grep "pre-built guard"` 互补且今日均 RED）；M-03 验收锚点从成员表机械导出，与处置一致；统一措辞基准与 C 形成员的「测全声明的全部 EventSource」改写指令一致。
3. **违反项目原则**：未发现。`src/` 零改动（R6）；新增 spec 遵循 AGENTS.md § Testing（PGLiteDB、dispatch 驱动、显式 attributeQuery、setup(true)）；成员表 + 谓词 + 机械验收正是「修一类而非一个实例 / 汇合点修复 / 提升为可检查不变量」的落实；M-01 注记含 WritingComputationTests 注册表自查义务；书面产出符合 plain professional language。
4. **违反任务目标**：未发现。R1–R6 逐项有方案与验收；任务说明 1–6 全部被处置（行号以符号定位、英文正文自包含配方、2–3 里程碑取 3、README 交叉引用同步）；`callInteraction` 缺陷的另立任务决定有记录、有边界规则（新增/修改文本不复制污染），不构成对本任务硬约束的违反。
5. **里程碑不可执行**：未发现。三个里程碑均可在合理实现轮内完成；全部验收入口已实测可执行且今日处于应红状态（T1 25/25、T2 11/11、冒号形 6 处、user validation 2 处、Relation 句缺失、README 路径缺失）；形态 (a) 由既有测试加探针 P3 覆盖、(b)(c) 由本评审探针独立证实可行；M-02 要触碰的章节标题（usage/05 `:5` "Important Note: About User Identity"、usage/06 `:53` "Contract"）实际存在。
6. **必须提前验证的重大风险**：未发现遗留。前两轮识别的判别力风险已由探针 P5/P6 收敛为本轮复现的机械锚点验收；本任务无并发/迁移/删除类高风险行为（§5.3 判断成立）。

## 需要复审的问题

无。本轮未发现符合六类复审条件的问题。

## 实现注意事项（不影响评审结论）

1. **T2 合法清单记账补齐**：活范围 `\bguard\b` 全量共 33 行；T2 占 18 行、合法清单现有列举覆盖 12 行，另有 3 行合法但未列入——`generator/api-reference.md:3365`（`ignoreGuard?: boolean, // Skip guard checks when true`）、`:3378`（ignoreGuard 参数说明）、`agent/skill/interaqt-reference.md:415`（同为 ignoreGuard 注释），三者均为谓词 i（真实 API 名 `ignoreGuard` 的直接释义），无需修正，但建议实现轮把它们补进 §1.2 合法清单，使审计按行对账时 33 = 18 + 15 可以核平。同理，清单中 `usage/06:68`（"`dataPolicy.match` guards an entity"，动词屈折）与 `usage/11:171`（"create guards"，复数名词）不是 `\bguard\b` 扫描的命中行（本轮已核实其原文确为泛英语义、合法），对账时会形成「列了却扫不到」的条目，宜注明屈折形式或移入脚注。
2. **命令 (4) 基线计数微差**：本轮实测入口模式基线为 64 行，设计记录 65 行（辅助筛查、逐行裁决制，非计数断言）。不影响任何验收判定；实现与审计以逐条裁决为准，不建议把行数当作断言。
3. **README:56 整条改写范围**：T1 #14 的锚点是加粗标题 "Only Interactions create data"，但同一 bullet 还有第二句 "User interactions are the single source of truth. Everything else is derived."，同属入口排他前提。处置已是「改写」，审计比对时应确认整条 bullet 语义更新，而非仅标题短语消失。
4. **M-01 payload 混淆项已复现**：本评审探针首轮即触发 `InteractionGuardError`（`checkType: 'payload'`、`type: 'email not defined'`），证实 M-01 实现注记中「args 传 payload 必须声明 Payload/PayloadItem，勿误判为 user 闸门」是实操必需，新增 spec 照此编写即可。
5. **两处已核实的非成员**：`usage/18:248`（"InteractionEventEntity is the only pre-defined entity"，事实正确的排他）与 `usage/05:1527`（"Interactions are the bridge connecting user operations and data changes"，无比较量词）在本轮宽扫描中命中、经裁决非家族成员，记录于此供审计对照，避免误判为漏网。

## 结论

**通过**。设计的事实基础、家族枚举完整性、验收判别力与里程碑可执行性均经本轮独立复核成立；上述实现注意事项供实现轮与审计轮参考，不构成修订要求。
