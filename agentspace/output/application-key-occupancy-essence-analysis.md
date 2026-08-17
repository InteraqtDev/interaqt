# 应用键占有（application-key-occupancy）方案的本质性复盘

- 日期：2026-08-17
- 性质：分析报告（非设计文档、非缺陷单）。回答的问题是：已完成的 `docs/application-key-occupancy/` 任务是否把问题复杂化了、其设计与实现是否触达了响应式框架应有的抽象层级。
- 输入：`docs/application-key-occupancy/`（task / 设计 / retro）、`prompt/application-key-occupancy.md`、当前工作树的全部实现 diff（22 个文件，约 +967 行，另有新增 `src/core/keepExisting.ts` 与两个测试文件）、`AGENTS.md`、知识库教义、相邻任务文档（`docs/dual-state-sources/` 等）。
- 结论先行：**用户的直觉成立。方案落在了错误的抽象层级上。** 任务执行质量本身很高（3 轮设计、3 轮实现、0 reopen、真实 PostgreSQL 双连接证明、缺陷注入验证），问题不在执行，而在任务框定与概念选择。

---

## 0. 结论概要

这个问题只包含**一个**不可约的引擎缺口：**带键插入在唯一冲突时观察既有行而不是中止事务**（下文称「集合语义插入」，对应 SQL 的 `INSERT ... ON CONFLICT DO NOTHING RETURNING`）。这件事在用户态确实无法声明式表达，必须由引擎提供，本次交付中 `Controller.insertWithKeepExistingObservation` 的 SAVEPOINT 内核就是它的物理实现，这部分是对的。

但围绕这一个缺口，任务交付了**四套相互耦合的机制**：

1. `UniqueConstraint.onConflict: 'keep-existing'` —— 约束级冲突策略标志，语义随写入路径不同而不同；
2. `StateTransfer.expiresAtProperty` —— 每条转移上的专用过期短路；
3. `computeTarget` 的应用键定位形态 —— 按「键集合恰好等于某条 keep-existing 约束的 properties」做结构匹配；
4. `DispatchResponse.recordIdentity` —— 与既有两条观察通道并列的第三条专用结果回传通道，携带六个用例词汇的状态标签。

为了让这四套机制彼此自洽，设计文档需要两张全体性禁例表（§3.1.1 约 15 行、§3.2.1 约 16 行）、一张九行工作实例表、133 行的守卫模块（`src/core/keepExisting.ts`）、265 行新增禁忌 fuzz 用例，并把同一条「身份必须是全定标量」的不变量散布到五个执行点。逐条对照 computation 概念之所以成功的判据（见 §1），这四套机制在「命名数据关系、路径无关、自由组合、结果即数据」上全部不满足。

更深一层：这个问题里的「先到者登记」和「至多一次核销」本是**同一个概念的两次应用**（按应用身份键先写者胜地确立一条事实），交付方案却用了两套不同机制、两套词汇分别实现（§4）。这是「没有找到那个抽象」的最直接证据。

---

## 1. 评估基准：computation 概念为什么「触达本质」

用户的参照物是 computation。把它的成功拆成可检验的判据，作为本报告的标尺：

- **C1 命名数据关系，而不是写路径行为。** `Count.create({ record: LikeRelation })` 说的是「likeCount *是*点赞关系的数量」——一个关于数据的陈述，不含任何「何时、由谁、经哪条路径写入」。
- **C2 路径无关。** 无论点赞关系经哪个 Interaction、哪种写入形态产生或消失，count 都正确。声明的语义不依赖读它的代码分支。
- **C3 自由组合。** Count 可以挂在任何实体的任何属性上，与相邻声明（其它 computation、约束、filtered entity）不需要一张「禁止组合」清单就能共存。
- **C4 结果即数据。** 计算的产出落在数据模型里（属性值、派生记录、mutation event），任何读者——其它 computation、查询、测试——都能看见，不需要专用回传通道。

一个概念在这四条上得分越高，越接近「声明数据是什么」的框架本质；越低，越接近「在某条执行路径上补一个行为开关」。

---

## 2. 交付面盘点与复杂度度量

| 维度 | 数值 / 事实 |
|------|------------|
| 生产代码改动 | 22 个已跟踪文件 +967/−66 行，另有新增 `src/core/keepExisting.ts`（133 行，纯守卫）与两个新测试文件 |
| 知识库改动 | 9 个 usage / generator 文档 |
| 新公开概念 | `onConflict`、`isDefiniteOccupancyScalar`、`expiresAtProperty`、应用键 computeTarget 形态、`RecordIdentityReport` 及 6 个状态标签 |
| 状态标签 | `established` / `already-held` / `transitioned` / `already-used` / `expired` / `not-found` |
| 设计期全体性表 | 2 张（§3.1.1、§3.2.1），合计约 30 行「输入 × 合同」 |
| 同一不变量的执行点 | 「身份是全定标量」共 5 处：声明期类型检查（`keepExisting.ts`）、`CREATE TABLE` 列级 `NOT NULL`（`Setup.ts`）、迁移 NULL 探针（`MonoSystem.ts`）、计算插入值检查（`Controller.ts`）、computeTarget 值检查（`computations/StateMachine.ts`） |
| 新增禁忌 fuzz | `declarationTabooFuzz.spec.ts` +265 行 |

作为对照：Count / Summation 这类 computation 的声明面没有任何宿主组合禁例；它们靠概念本身的正交性而不是守卫清单维持自洽。

---

## 3. 对照判据的逐条评估

### 3.1 `onConflict: 'keep-existing'` 是写路径行为标志，不是数据声明（违反 C1、C2）

同一条声明，在不同写入路径下含义不同：

- 计算插入（`applyResultPatch` insert）撞键 → 观察既有行，报告 `already-held`；
- 裸 `storage.create` 撞同一约束 → 仍是 `ConstraintViolationError`；
- 嵌套 create（载荷里指向另一 keep-existing 实体）→ 仍是故障；
- 迁移重建路径（`recomputeTransformOutput`）→ 被声明为「到不了」。

一条语义取决于**哪个读者在读**的声明，不是关于数据的陈述，而是分发路径上的行为开关。设计文档自己就是证据：它必须在设计期执行 `AGENTS.md` 修 bug 清单第 1 条（枚举声明面全部读者），产出 §3.2.1 的 16 行读者表——这个动作本应发生在修复一个泄漏抽象的 bug 时，而不是发明一个新概念时。**一个在诞生当天就需要读者枚举表的概念，其语义没有收敛在概念自身内部。**

### 3.2 组合禁例表是非正交概念的疤痕组织（违反 C3）

keep-existing 宿主禁止：数据轨 Transform、任何非 create 的 eventDeps、实体级 Custom、全量替换、计算 update / delete patch、filtered / merged 宿主、`_isDeleted_`、`where` 谓词、非标量身份列、defaultValue 补齐身份……这个概念只能存活在一块用声明期、setup 期、运行期三层守卫圈出来的隔离区里。

教义层面同样分裂：仓库首页教义 `agent/agentspace/knowledge/usage/00-mindset-shift.md` 用 `Transform.create({ record: InteractionEventEntity })` 作为标准示范，而占有宿主上这个形态被声明期拒绝，官方形态换成 create-only `eventDeps`。同一个框架，同一个「从交互事件派生记录」的需求，从此有两种互斥的方言，用哪种取决于宿主上是否挂了某个约束标志。每增加一种这样的「模式」，教学面和生成器规则面都按乘法增长（本次 9 个知识文档被改是直接后果）。

还有一个被永久牺牲的能力：官方建立形态被标为 `unrebuildable-computation`（迁移不能重建占有实体）。这不是偶然——袋语义（bag semantics，每个事件产出一行、行与行之间无身份）的事件轨 Transform 本来就无法幂等重放。若派生集合带键（见 §5.1），重建就是幂等 upsert，这条非目标根本不需要存在。

### 3.3 结果代数是用例词汇装进了框架 API（违反 C1）

六个状态标签是兑换码场景的本体论，不是框架层的概念：

- `already-used` 的实际定义是「`findNextState` 为空，且当前状态等于本次事件命中的某条转移的 next」。这个定义只在状态图是单向吸收结构（unused → used）时才有直觉含义；为了不把双态切换机（idle ⇄ active）误判成 already-used，设计花了一轮裁决（d1 问题 2）、一个探针（P-toggle）和一张九行工作实例表来围绕它划界。一个需要 gerrymander 的标签，说明它不是状态机空间里的自然分割——它是「消费型单调状态」这个特例的名字。
- `expired` 是一个特定比较（有限 number 且 `now >= v`）的名字，被硬编码进引擎（§3.4）。
- `established` / `already-held` 描述的其实是「本次事件是否创建了这条记录」——一个事件与记录之间的关系，本质上是 mutation event 的属性（见 3.4）。

### 3.4 第三条观察通道，且结果不落数据（违反 C4）

框架在 HEAD 上已有两条稳定的观察通道：

1. **mutation events / `DispatchResponse.effects`** —— 「这次 dispatch 造成了什么」的正典表达；调试教义（`AGENTS.md` § Debugging）明说靠它。
2. **typed condition rejection** —— `Condition.create({ locks, content })` + `AdmissionSnapshot` + `InteractionGuardError.code`，专为「并发 check-then-act 下稳定、可分支的业务性拒绝」而建（`src/builtins/interaction/Condition.ts`）。「已使用 / 已过期是结果不是故障」这条要求，typed rejection 本来就满足——它是 fail-closed 的设计内结果，不是未处理的驱动异常。设计 §3.8 以「Task 要求这些是结果不是故障」为由拒绝了 Condition 路线，这是把「不得是未处理故障」过度解读成了「不得是任何拒绝分支」；任务验收（「测试必须能把五种情形区分开」）只要求可区分性，两条既有通道都给得出。

`recordIdentity` 在这两条之外开了第三条：由 `AsyncLocalStorage` 承载、从 computation handle 内部向 dispatch 响应旁路推送、**不持久化**。`established` vs `already-held` 这件事实只对发起那一次 dispatch 的调用方存在一瞬间；其它 computation、后续查询、其它副本都无法从数据模型里重构它。在一个「一切派生自数据与事件」的框架里，出现了一类只活在响应对象上的事实——这是对 C4 最直接的违反。

若把缺失的信息补进正典通道——冲突观察发一种新的 mutation event 形态（例如 create 的结果标记为「found-existing」）、转移不发生时发「skipped(reason)」——`recordIdentity` 就塌缩成 effects 上的一个视图函数，而且**所有** computation 的调试都受益（skip 原因恰是当前调试教义缺失的那一半）。

---

## 4. 一个概念、两套机制：登记与核销同构

把问题陈述还原到最简：

- **先到者登记** = 「事实 Occupancy(K)」按应用身份键 K 先写者胜地确立，后到者观察到已存在。
- **至多一次核销** = 「事实 Consumed(K)」按同一身份键 K 先写者胜地确立，后到者观察到已存在。

两者是**同一个概念的两次实例化**。（核销侧另需一个前置谓词「未过期」，那是守卫问题，见 §5.2；它不改变核销事实本身的先写者胜结构。）

交付方案对第一次实例化用了「约束标志 + SAVEPOINT 观察」，对第二次实例化用了「StateMachine 扩展 + expiresAtProperty + already-used 标签 + 应用键定位形态」——两套机制、两套词汇、两张读者表。当一个问题的两半明明同构、解法却不同构时，几乎可以断定抽象没有被找到。找到抽象的解法里，核销要么是第二个带键实体（Consumption），要么是身份键上的单调状态，但无论哪种，它复用的都是与登记**完全相同**的先写者胜原语和完全相同的观察形态。

---

## 5. 缺失的一般概念

三个候选抽象，按解释力排序。它们不是本报告的设计裁决，而是「本质版应该在哪个方向」的坐标。

### 5.1 声明式应用身份（natural key）与带键派生集合

根因：框架的记录身份只有框架分配的 `id`；应用身份（campaign + code）在数据模型里没有一等地位，只能以「唯一约束」这个完整性工具的形态旁挂。本任务的一切复杂度都从这里派生：

- 「该键至多一行」要靠约束 + NOT NULL + 标量谓词五处执行 → 若身份是一等声明，这就是一条规则：**身份必须全定**（total），在一个汇合点检查。
- 「撞键观察既有行」只对计算插入成立 → 若身份是一等声明，「再次创建同一身份的记录」在**所有**写路径上都只有一个含义：引用既有记录（集合语义）。是观察还是报错成为调用点意图，而不是按路径分裂的隐式行为。
- 事件轨 Transform 不可重建 → 带键派生集合的重建是幂等 upsert（增量视图维护里按键去重的标准结论），`unrebuildable` 非目标消失。
- `established` / `already-held` → 就是「本次事件创建了它 / 发现它已存在」，是 mutation event 的自然属性，落数据、全局可见。
- computeTarget 的应用键形态 → 就是「按身份引用记录」，与 `{id}` 同级，不再需要「键集合恰好等于某条约束 properties」的结构魔法（该魔法同时违反显式控制原则：返回对象的含义取决于宿主上其它声明，且 `{id, campaign}` 会静默走 id 分支）。

相邻已完成任务 `docs/entity-identity-and-relations/` 处理的是逻辑 `id`；应用身份这一半当时没有被拿起来，本任务实际上撞进的就是这个洞。

### 5.2 转移守卫（transition guard）

`expiresAtProperty` 是一个被硬编码的特例：谓词固定（有限 number、`now >=`）、挂载点固定（每条 transfer 一个属性名）、还必须额外校验「同 current 同 next 的多条转移声明一致」——这条校验之所以存在，纯粹因为把谓词做成了转移上的数据而不是谓词。一等概念是 `StateTransfer.guard(record, event) => boolean`（状态机教科书概念）：过期只是守卫的一个实例，「expired」标签变成「守卫拒绝（原因名）」，一致性校验消失，同时下游应用反复需要的「条件转移」一并解决。

### 5.3 计算决策可观察性（provenance）

`recordIdentity` 真正携带的新信息只有一种：**某个计算决定不写入的原因**（already-used / expired / not-found 都是 skip 的原因；established / transitioned 在 effects 里本来就有对应事件）。把「fired / skipped + reason」做成正典事件或每 dispatch 的通用决策记录，占有场景就不需要任何专用响应字段，而且补上了所有 computation 的调试盲区。

### 5.4 不可约内核的归宿

集合语义插入的 SAVEPOINT 实现（观察冲突、回滚子事务、读先到者行、不留幽灵事件）在上述任何方向下都保留为引擎内部零件。本次实现的这一段（`Controller.insertWithKeepExistingObservation`）与其设计推理（d1 的 NULL/UNIQUE 全体性分析、d2 的数据轨删除语义分析）是无论如何都值得保留的资产。

---

## 6. 实现层信号：旁路架构已经产生了它特有的缺陷类

分析过程中发现一个未被任务测试覆盖的结构性隐患，它恰好是 §3.4 批评的架构（把每 dispatch 的事实存放在旁路状态里而不是让它随数据管线流动）的特征失效模式：

- `PropertyStateMachineHandle` 是每 Controller 单例（`Scheduler` 对每个 computation `new ComputationCtor(controller, ...)` 一次）。
- 新增的 `applicationKeyLocatedIds` 是 handle 实例字段（`src/runtime/computations/StateMachine.ts` 291 行），在每次 `computeDirtyRecords` 开头 `clear()`（339 行），在 `incrementalCompute` 里读取（375 行）；两者之间隔着 Scheduler 的多个 await 点。
- 真实 PostgreSQL 声明 `concurrentTransactions: 'database'`，**同一个 Controller 上并发 dispatch 不做串行化**，且这是官方已测试的形态（`tests/runtime/postgresqlConcurrency.spec.ts` 用单 Controller + `Promise.all` 并发 dispatch）。
- 交错序列：dispatch A 按应用键定位到行 X（集合 = {X}）→ dispatch B 进入 `computeDirtyRecords`，`clear()` 清掉 X，然后在 `lockRows` 上阻塞（行被 A 锁住）→ A 进入 `incrementalCompute`，`locatedByApplicationKey` 为 false → **A 正常完成状态转移，但静默不产生 `transitioned` 报告**。A 的调用方拿到的 `recordIdentity` 缺失转移条目——恰好丢掉了这个特性存在的理由。（ALS 存储本身是每 dispatch 隔离的，安全；不安全的只是这个跨 dispatch 共享的 Set。）
- M-02 的并发验收是**每条连接一个独立 Controller**（`postgresqlOccupancyIdentity.spec.ts` 每 worker `new Controller`），所以「共享 handle」这一维从未被行使。占有测试矩阵缺失的维度：**同 Controller 并发 dispatch**（应回填 `tests/runtime/WritingComputationTests.md` 维度注册表）。

定性：这是按代码结构推演出的交错，尚无运行复现；按 `AGENTS.md` 的口径它应当先获得一个可执行的失败复现再修。修复方向本身也印证本报告主张：把「该行由应用键定位」这一事实随 dirty-record 元组在管线里传递（Scheduler 本来就传 `[record, event]` 对），而不是存放在 handle 单例状态里——**当观察是数据时，事务性与并发隔离是免费继承的；当观察是旁路状态时，每一条并发保证都要重新手工挣得。**

---

## 7. 反方立场与公平性

**反方：「onConflict 也是声明——它声明了冲突的含义。」** 不成立到底：它声明的含义按写入路径分裂（§3.1）、按宿主形态圈禁（§3.2）、其可观察输出不落数据模型（§3.4）。一条真正的数据声明在这三点上都应闭合。

**任务做对了什么（不应在重构叙事里被抹掉）：**

- 拆除 `controller.occupancy.claim / consume` 第二写入口是正确且重要的裁决；
- SAVEPOINT 观察内核、NULL/UNIQUE 全体性分析、`isDefiniteOccupancyScalar` 的值域分析是持久知识；
- 真实 PostgreSQL 双连接测试资产、禁忌 fuzz 单元、缺陷注入纪律都可以在任何后续形态下复用；
- 三轮设计裁决抓住的都是真问题（NULL 破坏全体唯一、分类表先于 `findNextState` 会改写现网语义、数据轨 Transform 的删除语义）。

问题从头到尾不在执行，在概念选择的自由度被任务框定收走了（§8）。

---

## 8. 过程根因：循环任务协议为什么收敛到这里

1. **非目标条款直接禁止了找到正确抽象。** Task 4 写明「不得为关闭本问题而引入与应用键占有无关的新概念或新查询原语」。而框架级的正确解（声明式身份、转移守卫、决策可观察性）按定义都「超出应用键占有」。computation 这个概念本身也绝不可能从一个「实现点赞计数、但不得引入与点赞计数无关的新概念」的任务里诞生。**框架仓库上的场景任务应当问「哪个缺失的一般概念使该场景可表达」，而不是「用最小改动关闭该场景」。**
2. **「结果不是故障」被预先解读成「必须是成功路径上的响应字段」**，从而排除了 typed condition rejection 这条现成通道（§3.4）。任务文本要求的只是稳定可区分，预解读把通道选择变成了隐含裁决。
3. **收敛压力选择局部最优。** 设计-评审-审计循环的优化目标是「以最小风险关闭验收」，这天然偏好「在现有 Klass 上加一个标志」而不是「立一个新概念」。协议里没有任何一道门问：这个特性是哪个一般概念的特例？新增机制数相对需求数是否成比例？每新增一条组合禁例是否计为设计成本？
4. **相邻任务碎片化印证同一个洞。** `entity-identity-and-relations`（逻辑 id）、`sequence-idempotency-retention`（幂等/保留）、`application-key-occupancy`（本任务）、`dual-state-sources`（仍在设计中，其 FR-DS-02 与本任务范围直接重叠、其 FR-DS-01 的「按身份键合并两套行」同样绕着身份概念转）、`post-commit-side-effect-guarantees`——五个运行全部环绕「什么标识一条事实、并发写谁胜、调用方可以观察到什么」这一个概念洞，每个切片用切片形状的机制各自闭合。按切片派发的协议看不见共享根因；这正是「fix the class, not the instance」在任务粒度上的失效。

---

## 9. 建议

1. **不要按当前形态发布这套公开表面。** 改动仍在 Unreleased（CHANGELOG 未发版），成本窗口还开着。建议把 `onConflict` / `recordIdentity` / `expiresAtProperty` / 应用键 computeTarget 标记为实验性（或暂缓合入公开教义），保留引擎内核与测试资产。
2. **发起一个概念级设计任务**（而不是又一个场景任务）：「实体与派生集合的声明式应用身份」。任务目标明确写为：求证 §5.1 的塌缩判断——keep-existing、recordIdentity 的 establishment 半边、应用键 computeTarget、`unrebuildable` 限制是否全部成为该概念的推论；转移守卫（§5.2）与决策可观察性（§5.3）可以作为两个独立的小任务跟进。`dual-state-sources` 应在该概念落定之前暂停设计（它的两个 FR 都会被身份概念重塑）。
3. **无论走哪条路，先处理 §6 的并发隐患**：建立同 Controller 并发 dispatch 的失败复现（真实 PostgreSQL、单 Controller、`Promise.all` 两个 `dispatch(Redeem)`），修复方向是让定位事实随 dirty-record 元组流动；并把「同 Controller 并发」维度回填测试维度注册表。即使保留现有表面，这也是必须的。
4. **修订 cyclic-task-prompt 协议对框架仓库的生成规则**：
   - 场景类任务必须包含一个设计期门槛问题：「陈述本特性是哪个一般概念的特例；若答不出，说明为什么允许特例落地」；
   - 把「新增组合禁例条数」「同一不变量的执行点数」作为设计成本显式计入评审（本任务分别是 ~30 与 5）；
   - 禁止在框架任务里使用「不得引入与本场景无关的新概念」这类条款，替换为「新概念必须证明其一般性（至少两个不同场景受益）」。
