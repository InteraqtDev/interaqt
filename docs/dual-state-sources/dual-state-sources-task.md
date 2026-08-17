<!-- generated-by: cyclic-task-prompt | template-sha256: 6cfe19e4e81c | generated-at: 2026-08-16 -->
# interaqt — 项目画像

生成时快照。循环任务文件会逐字嵌入本画像；任务目录归档后仍可独立还原当时的工程背景。

## 1. 项目定位

interaqt 是一个**声明式响应式后端框架**（npm 包名 `interaqt`，全小写）。使用者是用 TypeScript 构建后端应用的工程师，以及基于本仓库知识库生成示例应用的 agent 工作流。

核心原则：

> 停止思考「如何操作数据」；开始思考「数据本质上是什么」。

权威工程规则：

| 路径 | 用途 |
|------|------|
| `AGENTS.md` | 跨工具总规则：概念、布局、命名、测试、修 bug 清单、命令 |
| `CLAUDE.md` | Claude Code 启动时的知识加载顺序 |
| `.cursor/rules/*.mdc` | 分层 Cursor 规则（架构、runtime、storage、测试、构建） |
| `tests/runtime/WritingComputationTests.md` | 计算测试维度注册表；新增矩阵或回归时必须对照 |
| `src/storage/USAGE_GUIDE.md` / `IMPLEMENTATION_DETAILS.md` | 存储层用法与内部实现 |

本仓库是**框架本身**，不是业务应用。每次改动都会放大到下游应用，优先保持表面小、语义一致、错误信息清晰。

## 2. 功能目标

### 长期目标

- 用声明（Entity / Relation / Property / Computation / Interaction / Activity）描述数据是什么，由框架负责传播与持久化。
- 数据变化的唯一入口是用户触发的 Interaction（经 `Controller.dispatch`），派生值由 Computation 自动维护。
- 跨实体连接以 Relation 为一等机制；查询走关系路径与 nested `attributeQuery`。

### 重要概念

| 概念 | 含义 |
|------|------|
| Entity | 数据基本单位 |
| Relation | 实体间连接；关系也是特殊记录 |
| Interaction / EventSource | 用户事件；`Controller.dispatch` 是触发入口 |
| Computation | Count、Transform、StateMachine、Every/Any 等派生 |
| Property | 实体字段，可挂 computation |
| Activity | 有序组合多个 Interaction 的工作流 |

数据流：`Interaction → Event → Computation → Data`。

### 非目标（框架层）

- 不把任意字符串 `*Id` 属性自动当成外键。
- 不在 Interaction handler 里嵌入业务步骤式更新逻辑。
- 不引入隐式默认行为或“魔法”补全；行为必须显式声明。

## 3. 技术目标

- **语言**：TypeScript strict。
- **分层与依赖方向**：`builtins → runtime → storage → core`，禁止向上导入。路径别名：`@core`、`@runtime`、`@storage`、`@drivers`。
- **数据库**：SQLite、PostgreSQL、PGLite、MySQL。MySQL 声明 `transactions: false`，`Controller.dispatch` 在其上会因缺少事务能力失败；dispatch 驱动的应用应使用 PostgreSQL / PGLite / SQLite。
- **身份与主键**：存储层为每条记录维护 `id`；创建时若调用方未提供 `id`，由 driver（如 uuidv7 / 序列）分配。嵌套关联引用形态为 `{ id }`。
- **兼容态度**：对外行为变更应尽量做成超集；破坏性语义变更需要文档、测试与（如适用）升级说明同步。
- **质量**：修 bug 修一类而非一个实例；优先在汇合点修复；把已知规则提升为可执行不变量；致命逃逸要做测试致盲复盘（见 `agentspace/output/r17-…` / `r18-…`）。

## 4. 代码职责

```text
src/
  core/       # Entity、Relation、Property、computations 纯定义（Klass 模式）
  runtime/    # Controller、System、Scheduler、computation handles、migration
  storage/    # ERStorage、SQL builder、executors、FilteredEntityManager
  builtins/   # Interaction、Activity、User 等内置
  drivers/    # SQLite、PostgreSQL、PGLite、MySQL
tests/        # Vitest；runtime / storage / core / builtins
agent/        # 示例应用生成工作流与 usage/generator 知识
agentspace/   # 框架深潜知识与 agent 产出（output/）
```

- 业务应用代码不在本仓库；本仓库只维护框架 API、实现与文档/知识库。
- agent 生成应用时的指南在 `agent/agentspace/knowledge/`；框架内部技术说明在 `agentspace/knowledge/`。
- 研究/设计/分析报告默认写到 `agentspace/output/`（循环任务协议文件写在 `docs/<slug>/`）。

## 5. 编码与修改原则

1. **声明式优先**：不写“先更新 A 再更新 B”的步骤链；用 computation 声明派生关系。
2. **显式控制**：不增加隐式行为。
3. **Klass 模式**：`interface → CreateArgs → Type.create → instances/isKlass → toData/fromData`。
4. **命名**：Entity 单数 PascalCase；Relation 描述性；Interaction 动词+名词；Property camelCase。
5. **测试通过 Interaction**：`controller.dispatch`；`await controller.setup(true)`；`storage.find`/`findOne` 必须带 `attributeQuery`（全字段用 `['*']`）；不手写实体 id 作为常规测试数据习惯（框架分配），除非任务明确验证“调用方提供 id”。
6. **修 bug 清单**（`AGENTS.md`）：枚举声明面全部读者；汇合点修复；提升为不变量；回填维度注册表；逃逸做机制化复盘；方言修复必须用匹配该方言的探针。
7. **书面语言**：文档、注释、错误信息、提交说明、报告使用准确技术术语与完整句子（`AGENTS.md` § Plain professional language）。
8. **变更后**：相关测试与（触及类型导出时）`npm run check` / `npm run build` 按任务需要执行。

## 6. 调研入口

### 权威规范

- `AGENTS.md` — 总规则
- `tests/runtime/WritingComputationTests.md` — 计算测试维度
- `agent/agentspace/knowledge/usage/` — 用法（从 `00-mindset-shift.md`、`01-core-concepts.md` 起）
- `agent/agentspace/knowledge/generator/` — 生成与 API 细节（含 Transform / anti-pattern）
- `src/storage/USAGE_GUIDE.md`、`IMPLEMENTATION_DETAILS.md`

### 身份 / Transform / Relation 相关源码

- `src/runtime/computations/Transform.ts` — Transform handle；当前对顶层 `id` 有硬失败守卫 `assertNoIdInTransformedRecord`
- `src/runtime/Controller.ts` — `applyResultPatch`（insert → `storage.create`；update/delete 按 `affectedId`）
- `src/storage/erstorage/CreationExecutor.ts` — 创建时仅在缺少 `id` 时 `allocateRecordId` / `getAutoId`
- `src/storage/erstorage/UpdateExecutor.ts`、`NewRecordData.ts` — 更新与引用形态
- `src/drivers/*` — 各库 `getAutoId`
- `src/core/Transform.ts`、`Entity.ts`、`Relation.ts` — 声明面

### 文档中与身份冲突的表述（生成时已存在）

- `agent/agentspace/knowledge/generator/computation-implementation.md` — “NEVER include `id` in callback return value”
- `agent/agentspace/knowledge/usage/19-common-anti-patterns.md` — “Never manually specify ID”
- `agent/agentspace/knowledge/generator/api-reference.md` — “do NOT include id field”
- 回归：`tests/runtime/review-fixes-2026-07-10-r13.spec.ts` 断言 Transform 返回顶层 `id` 必须抛错

### 问题陈述输入

- `prompt/entity-identity-and-relations.md` — 身份模型范式缺口与目标形态（任务输入，非已定设计）

### 测试

- `tests/runtime/` — 计算、dispatch、migration、真实 PostgreSQL 套件
- `tests/storage/` — 写路径、匹配语义、驱动差分、结构 fuzz
- 生成式套件与环境变量见 `AGENTS.md`（`FUZZ_*` 等）

## 7. 测试与运行环境

```bash
npm install
npm test                 # Vitest 全量（PGLite/SQLite；postgresql* 无 env 时静默 skip）
npm run test:runtime
npm run test:storage
npm run test:core
npm run check            # tsc --noEmit
npm run build            # 库构建 → dist/
```

真实 PostgreSQL（改 driver / 写路径 / migration / 事务 / 锁 / id 一致性时必须显式跑）：

```bash
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
  npm run test:postgres
```

各 spec 会从 `INTERAQT_POSTGRES_DATABASE` 派生独占库名；`setup(true)` 会 DROP/重建，勿指向贵重库。

任务开始前已有的失败：由具体任务在启动时实测并记入设计基线，不在本画像维护白名单。

生成式 fuzz 在触及对应子系统时应扩大 seed 池；失败 seed 用 `FUZZ_*_SEED_START=<n> FUZZ_*_SEED_COUNT=1 FUZZ_VERBOSE=1` 复现。


### 共同原则

1. **产品结果优先**：下列规范用于促进任务完成，不得为了完善流程文件而延迟主要工作。
2. **证据优先**：涉及代码现状、运行行为或外部接口的判断，应优先使用源码、现有测试、实际命令或最小验证实验。纯逻辑矛盾可以使用准确引用和具体反例证明。
3. **一次处理同类问题**：评审问题必须说明根因和检查范围，并列出该范围内全部同类问题。裁决或修复时应再次检查同类位置并一次处理完毕。
4. **设计不追求完美**：设计阶段只消除会使实施方向失效、目标受损或里程碑不可执行的问题。验证程序仍可加强、局部表述可改善等事项不得单独延长设计循环。
5. **验证采用项目原有体系**：优先使用项目已有测试、合同、运行脚本和真实环境。只有任务确有需要时才增加专用验证程序。
6. **协议版本固定**：本次运行始终使用本文件中的规则，不得在运行中同步其它版本。
7. **会话自主性**：设计、评审、实现和审计分别在独立会话中完成。各会话不得向用户询问如何继续；遇到未明确规定的事项，应依据任务目标、项目原则和已取得的证据作出合理决定，并记录理由。

### 文件和状态

本次运行只要求以下流程文件：

- 设计文档：`docs/dual-state-sources/dual-state-sources.md`
- 设计评审：`docs/dual-state-sources/dual-state-sources-review.md`
- 实现审计：`docs/dual-state-sources/dual-state-sources-audit.md`
- 运行记录：`docs/dual-state-sources/retro.md`

设计评审和实现审计文件每轮覆盖写入，只保留当前结论。`retro.md` 每轮追加一行简要记录，并在任务终止时补充总结。

设计文档开头必须维护：

```text
status: 设计中 | 实现中 | 已完成 | 不可实现 | 协议失败
design-round: d/15
implementation-round: k/N
current-milestone: M-xx
current-milestone-reopens: r
convergence-mode: normal | domain-review | milestone-review
next-action: <下一实现轮首先完成的具体工作；没有时写“无”>
```

计数规则：

- `d` 由设计裁决轮增加，设计评审轮不增加。
- `k` 由实现轮增加，审计轮不增加。
- `r` 是当前里程碑因实现缺陷从 `待审`退回`开放`的累计次数；验证缺口直接加强后产品仍正确、或里程碑本来就是`开放`时不增加。
- 设计完成时，以初始里程碑数量 `M` 计算 `N = 5 × M`。这是所有里程碑共享的总预算，不设单个里程碑预算。
- 实现中可以调整未完成里程碑，但 `N` 不随拆分或合并而改变。

里程碑状态只有：

- `开放`：尚未完成。
- `待审`：实现轮已取得通过证据，等待独立审计。
- `已完成`：审计轮独立复验通过。

实现轮不得将里程碑标记为 `已完成`。

#### Reopen 与收敛

设计文档中每个里程碑还必须维护 `reopen-count` 和按稳定行为领域归组的 `reopen-domains`。审计确认实现缺陷并将该里程碑从`待审`退回`开放`时，同时更新这些计数。同一审计轮的同一领域只计一次；领域名按根因稳定复用，不得通过改名规避升级。旧任务首次采用本机制且缺少计数时，下一审计轮根据 `retro.md` 中该里程碑真实的`待审`→`开放`记录初始化。

触发规则：

- 同一领域第二次 reopen：`convergence-mode: domain-review`。
- 同一里程碑第三次 reopen：`convergence-mode: milestone-review`。
- `milestone-review` 优先级更高；收敛模式一旦触发，直到里程碑关闭前不得恢复为 `normal`。

触发收敛模式的审计轮必须在当前实现审计文件顶部维护 `## Convergence Note`，不得新增流程文件。Note 只记录尚未闭合的差异，不复制 Task、设计正文或完整历史，并固定为四部分：

1. **Remaining closure map**：未闭合行为领域及当前失败证据。
2. **Root cause and scope**：根因、同类检查范围，以及前轮为何漏检。
3. **Next implementation batch**：按依赖顺序给出下一轮应完成的具体工作和完成条件。
4. **Closure gates**：当前应红、完成应绿以及不得退化的命令。

后续审计覆盖写审计文件时必须保留并更新该 Note，直到里程碑关闭。`next-action` 应简短指向 Note 的下一实施批次；`retro.md` 只记录 reopen 次数、触发领域、收敛模式和关闭轮次。

### 设计文档要求

设计文档应包含：

1. **背景和现状**：只写与任务有关的事实，并给出代码、文档或运行证据。
2. **目标与非目标**：逐项对应 Task 的编号要求。
3. **方案**：只保留一个明确方案，说明关键决策及理由。
4. **里程碑**：按依赖顺序编号为 `M-01..M-N`。
5. **风险与验证安排**：区分设计期必须验证的风险和可以在实现期验证的风险。
6. **基线**：记录任务开始时的 Git revision、工作树状态，以及与本任务相关的已有测试结果。

每个里程碑必须包含：

- 可独立观察的结果。
- 覆盖的 Task 要求编号。
- 前置里程碑。
- `reopen-count` 与 `reopen-domains`，初始分别为 `0` 与空集合。
- 验收命令；如果命令尚不存在，应准确说明实现阶段需要新增的测试或运行入口。
- 最新证据。

里程碑应当是可以运行和验证的阶段性系统状态。第一个里程碑应尽早消除最大的技术不确定性；对于跨组件任务，通常应建立最小端到端链路。

设计阶段采用精简的可执行验收：

- 每个里程碑至少有一个可执行验收入口或明确的待建测试。
- 并发、崩溃、切换、删除、权限和不可逆数据变更等高风险行为，至少提供一个能区分错误实现的负向对照或最小验证实验。
- 不要求为每个断言建立专用 schema、夹具集合或通用断言框架。

### 设计复审条件

只有以下六类问题可以要求下一轮设计评审：

1. **关键事实错误**：方案依赖的技术、接口、代码行为或运行条件与实际不符，可能使方案整体失效。
2. **内部逻辑矛盾**：两项要求不能同时满足、关键路径不可达，或里程碑按设计无法通过验收。
3. **违反项目原则**：方案违反项目权威规则中的架构职责、数据原则或工程约束。
4. **违反任务目标**：方案偏离 Task 的目标、范围或硬性约束。
5. **里程碑不可执行**：里程碑过大、依赖顺序错误、验收不明确，或明显不能在合理实现轮次内完成。
6. **必须提前验证的重大风险**：该风险无法在实现环境中及时验证，若推迟会使后续实现整体失效。

验证还可以更严格、测试还可以增加、资料性说明可以改进、局部命名可以优化等问题，均不得单独触发下一轮设计评审。

若同一设计领域第二次出现需要复审的问题，裁决轮不得继续逐句补充说明。应根据问题性质，将完整行为整理为状态表、真值表、参考函数、结构化清单或最小契约测试，并一次检查全部输入情况。

### 运行记录

任务终止时，`retro.md` 只记录可核对事实：

- 终止状态和原因。
- 设计轮数、实现轮数及各里程碑最终状态。
- 设计阶段采纳的问题类别。
- 审计发现的实现缺陷数与验证缺口数。
- 各里程碑 reopen 次数、重复领域、收敛模式及关闭轮次。
- 自动调整里程碑的次数和原因。
- 是否发生人工介入；按本文件正常运行时应为 0。
- 预算是否满足，以及未完成任务的明确阻塞。
- 对协议的改进建议，最多三项，并说明对应证据。

---

## Task 1 双状态来源

### 背景

响应式 ER 的默认假设是：持久形状只有 Entity / Relation（外加框架自管内部表）；同一业务事实只有一份权威；读走 `storage.find` / 关系路径 / nested `attributeQuery` 得到的就是那份权威或其声明式派生。问题陈述认为真实应用会反复撕开该假设，失败形态同构：**调用方面对两份状态，且没有一等的权威 / 完整度 / 冲突合同。**

两种压力：

- **形态 A — 重叠表示。** 源图 S 与可滞后投影 P 是两套写入路径、两套行；读路径做 `P ∪ fallback(S)`，再按身份子集去重。同名属性冲突由插入顺序决胜。这不是「同一 `InteractionEvent` 上两条 Transform 写出两种形状、权威仍是该事件」（那是已有合法用法）。
- **形态 B — 实体形状的框架外存储。** 跨副本 first-wins claim / 一次性 consume / TTL 若无法用 Entity + UniqueConstraint + dispatch 表达，应用会 `CREATE TABLE` + 方言 SQL。该表不进 schema / 迁移、不能挂 computation / `Entity.retention`、不能经 `storage.find` 被其余领域看见。框架已为自己做过同形内部账本（`_DispatchIdempotency_`、`_ScopedSequence_`），应用级令牌却被挤到方言 SQL。

问题陈述输入（任务输入，非已定设计）：

`prompt/dual-state-sources.md`

行号与能力边界曾对照仓库现状做生成时调研（见下方任务特定说明）。设计阶段必须对**当前 HEAD** 用源码、现有测试与最小实验复核，不得只复述该文件。

根因抽象（供求证，不是方案约束）：框架把 Entity 既当作唯一持久概念，又当作唯一权威概念，却没有把「权威事实」与「可滞后派生」分成两种声明，也没有把「按应用键跨副本原子占有的短命记录」收进同一持久概念。

FR-DS-01 与 FR-DS-02 **相互独立、可分期验收**。只实现投影物化却仍允许读路径无合同并集，不算 FR-DS-01 完成。只把 SQL 换成 Entity 却没有原子 claim 语义，不算 FR-DS-02 完成。问题陈述建议先做 FR-DS-02；设计可在求证后调整分期，但两条都必须有可独立执行的验收。

### 要求

1. **求证问题是否存在（硬前置）**  
   在设计阶段用源码、现有测试与最小验证实验，分别求证问题陈述中的形态 A 与形态 B 是否在当前主干真实存在。  
   - **形态 A：** 框架是否区分完备投影与滞后子集；是否存在官方 coalesce（身份键 + 冲突策略 + 来源标记）；查询 API 是否拒绝把投影行与源行压成同一无标记列表；合法双 Transform 是否已被教义写清，并与「异步索引 ∪ 源图」划界。  
   - **形态 B：** 应用是否能在框架管理的记录上声明 `(namespace, tokenId)`（或等价复合键）的跨副本 first-wins claim、一次性 consume、TTL / 保留，且结果代数稳定（成功 / 已占用 / 已消费 / 过期），而不是唯一约束异常冒充业务语义。核对 `UniqueConstraint`、`atomic.compareAndSet` / `lockRecord`、Dictionary、`dispatchIdempotency`、`Entity.retention` 各自覆盖什么、缺什么。  
   - 对「存在」的结论：给出可复现证据（合同测试缺口、精确到文件与行为的 API 表面、或最小实验输出）。  
   - 对「不存在 / 已有官方路径」的结论：给出反证，并将对应子需求从实现范围中明确关闭。  
   - 不得仅复述 `prompt/dual-state-sources.md` 作为证据。  
   - 若仅一条形态成立，另一条关闭后仍须按本任务交付成立的那一条。关闭项须在设计文档与 `retro.md` 中写明证据。

2. **FR-DS-01 — 重叠表示的读合同（P0）**  
   若求证确认形态 A 存在，须提供一条可文档化的官方路径（可组合，但必须能写进教义），使下面三者**至少成立其一**，且测试能区分：  
   1. **单一读权威。** 派生视图声明为源图的投影：要么完备（读只走 P），要么显式不完备（读走 S，或读 P 时带 stale / pending 状态，**不得**把 P 行与 S 行压成同一无标记列表）。  
   2. **官方 coalesce。** 查询原语接受：身份键集合、冲突策略（投影赢 / 源赢 / 仅拼接不相交字段 / 冲突失败）、以及「未出现在投影中的源行是否纳入」。结果行带上来源标记。去重键必须等于声明的身份；窄于身份的去重应被拒绝或成为显式、可测的策略。  
   3. **合法双形状模式（仅此一种）。** 同一 `InteractionEvent` 上两条 Transform 写出两种行，权威仍是该事件；读某一种形状时不回源合并。这是已有正确用法的教义化，不是新原语，但必须写清：**异步补全的索引行不属于这种模式。**  
   无论选哪条，下列行为必须从推荐用法中消失：应用层 `concat` 两张表再 `Set(partialKey)`；同名属性冲突时依赖数组顺序；把滞后投影当成与源可互换的同一行类型。  
   设计只保留一个明确方案（可以是上述三条的组合，但必须写清各自适用边界），并说明关键决策及理由。问题陈述 §4.1 的三条选项不是必须全做的清单。  
   验收硬约束：  
   - **冲突可测：** 构造源行与投影行共享身份键、某展示字段取值不同。无声明 coalesce 的混读要么无法通过官方 API 表达，要么按声明策略得到确定胜者，**不得**随查询顺序翻转。  
   - **完整度可测：** 仅存在源、尚无投影行时，官方读要么只返回源（并标记非投影），要么返回空 + stale，由声明决定；合同断言与声明一致。  
   - **合法双 Transform：** 同一事件两条 Transform 写出形状 A / 形状 B，分别查询得到各自全集，测试中 **禁止** 出现并集去重代码。  
   - 文档给出最小示例；反模式明确写出「读时手工并集 + 部分键去重」。

3. **FR-DS-02 — 框架内的原子占有记录（P0）**  
   若求证确认形态 B 存在，应用可声明一类记录（Entity，或与 `_DispatchIdempotency_` 同级的官方内部类型——形态由设计裁定），满足：  
   1. **身份：** `(namespace, tokenId)`（或等价复合键）唯一。  
   2. **原子占有（claim）：** 跨进程、跨连接，先到者成功并写入 payload；后到者得到稳定的「已占用」结果，而非唯一约束异常冒充业务语义。  
   3. **一次性消费（consume）：** 未消费且未过期 → 返回 payload 并标记已消费；已消费 → 稳定的 already-used；过期 → 稳定的 expired。TTL 后是否允许回收键再 claim，必须文档化并有测试。  
   4. **TTL / 保留：** 过期行可被 `Entity.retention`（或同等官方维护步）回收；业务默认路径无手写 `DELETE` 循环。不得再做一套与 `maintainEntityRetention` 平行的 GC。  
   5. **框架可见：** 表由 schema install / migrate 创建与变更；禁止应用 `CREATE TABLE IF NOT EXISTS` 作为正式后端。可选挂 computation（非必须，但不得因为「这是技术表」就被赶出 Entity 空间）。  
   `atomic.compareAndSet` 可作为实现零件，**不是**本要求的完成形态：它不提供记录的创建 / 迁移 / TTL / 按应用键 first-wins insert。  
   Interaction 幂等账本 **不是**本要求的完成形态：它绑定 dispatch 键，不能替代握手 nonce、兑换码、跨 API 的一次性票据。  
   验收硬约束：  
   - **并发合同（真实 PostgreSQL，双连接）：** 同一 `(namespace, tokenId)` 并发 `claim` → 恰好一次成功，另一次 already-used；无重复 payload 生效。PGLite / 单连接不得单独充当并发完成证明。  
   - **consume：** claim 成功后一连接 consume 得 payload，另一连接 consume 得 already-used；过期后 consume 得 expired（按声明）。  
   - **schema：** 关闭应用侧 DDL 后，install / migrate 仍能得到该表；迁移签名包含其形状。负向：应用 `CREATE TABLE` 不得出现在官方示例中。  
   - **retention：** 声明 TTL 或 cap 后，维护步回收过期 / 超额行；未声明的其它 Entity 不被误删。

4. **阶段划分与非目标（硬约束）**  
   - 不在本需求内规定搜索引擎、向量索引或外部只读副本（集成边界）。  
   - 不要求每一次派生都必须同步完备；允许滞后，但滞后必须是声明状态，而不是靠并集假装完备。  
   - 不把「物化图投影的增量维护算法」展开为本任务（更广的投影原语）；本任务只收 **共存时的读合同**（FR-DS-01）与 **框架内原子占有记录**（FR-DS-02）。  
   - 不禁止两个实体描述相关但不同的事实（订单 vs 发票）；禁止的是 **同一身份、同一事实、两份持久表示、无读合同**。  
   - 不内置分布式锁服务、租约续约协议或时钟同步算法；TTL 与现有 retention 一样，以存储时间为准并在文档中写清。  
   - 不把进程内 `Map` 升格为多副本权威（测试内存后端可以，生产路径不行）。  
   - 不要求 claim 走完整 Interaction → Transform 栈（若过重，允许更窄的官方 API），但结果必须仍是框架管理的行。  
   - 不在本任务内重做 dispatch 幂等（已有 `outcome: 'applied' | 'replayed'` 与 `_DispatchIdempotency_`）。  
   - 不重做 `Entity.retention` / `maintainEntityRetention` 本身；FR-DS-02 的 TTL 应复用。  
   - 不实施 `prompt/post-commit-side-effect-delivery-guarantees.md` 的提交后义务完成语义（相邻任务；状态表示的权威个数 ≠ 副作用是否跑完）。  
   - 不把标量列 group-by、复合 interaction、Condition 事务可见性、时间驱动 StateTransfer 纳入本任务。  
   - 不在本仓库实施某个具体搜索并集或某一张私有令牌表的应用改造。  
   - 不在本任务实施前端双通道状态。  
   - 问题陈述中的方向选项仅为讨论材料，**不是**方案约束。设计只保留一个明确方案。

5. **与现有能力的关系**  
   - Transform 多实体派生：FR-DS-01 的合法双形状路径；须在文档中与「异步索引 ∪ 源图」划清。不得把已有双 Transform 误判为缺口而重做。  
   - UniqueConstraint：能兜底冲突，不能单独充当 claim 结果代数，也不能替代「应用表不进迁移」的可见性缺口。  
   - `atomic.compareAndSet` / `lockRecord`：FR-DS-02 的实现候选；今日不是按应用键 insert-or-claim 的一等 API。  
   - `_DispatchIdempotency_` / `_ScopedSequence_`：证明框架已经为**自己**做过形态 B；应用级令牌应对齐同一可见性（迁移、官方 API、保留），而不是再抄一张私有表。不得把 dispatch 幂等键空间开放成通用 nonce API 来假装完成本任务。  
   - `Entity.retention` / `maintainEntityRetention`：FR-DS-02 的 TTL 应复用。  
   - Dictionary：全局 JSON KV，无 namespaced 行、无 consume-once、无行级 TTL；不得把 Dictionary 升格为本任务完成形态。  
   - FilteredEntity / MergedEntity：若求证表明它们是同源完备视图而非滞后投影，不得把它们误当成 FR-DS-01 的官方 coalesce。  
   - 触及声明面或公开 API 时按 `AGENTS.md` 修一类而非一个实例：枚举全部读者（data-based / event-based / migration 签名 / 公开查询与 atomic API）。优先汇合点修复。

6. **交付与验证纪律**  
   - FR-DS-01 与 FR-DS-02 构成最小闭环，可分里程碑，但只实现一半不算对应 ID 完成。建议先闭合形态 B（缺口更硬、与已有内部账本 / CAS / retention 同族），再闭合形态 A 的读合同；求证后可调整分期。  
   - 优先使用项目既有 Vitest 体系；新增测试挂在 runtime / storage 合适位置。  
   - FR-DS-01 必须覆盖：冲突字段不随查询顺序翻转；完整度声明与读结果一致；合法双 Transform 分别查询且测试无并集去重。  
   - FR-DS-02 必须覆盖：真实 PostgreSQL 双连接并发 claim；consume 三态；install / migrate 可见性；retention 回收且不误删未声明实体。方言修复必须用匹配该方言的探针。  
   - 回归：既有 UniqueConstraint、`atomic.compareAndSet`、`dispatchIdempotency`、`entityRetention`、Transform 双实体派生、migration 签名无新增失败。任务开始前已失败的检查以基线为准。  
   - 变更后按需执行 `npm run check`；触及公开 API 时保持类型导出、usage / generator 与 CHANGELOG（若适用）一致。  
   - 遵守 `AGENTS.md`：汇合点修复；已知规则提升为可执行不变量；书面语言使用准确技术术语与完整句子。

7. **范围边界**  
   - 不在本仓库实施具体业务应用的改造；本任务是框架能力：公开 API、runtime / storage 行为、文档与测试。  
   - 落地后不得把「读时手工并集 + 部分键去重」或「应用 `CREATE TABLE` + 方言 SQL 做跨副本 claim」保留为官方推荐模式。  
   - 若求证证明某一形态在框架内已有完整官方路径，将该形态标为已关闭并只交付文档划界（若教义仍把非法模式写成可用）。不得为实现陈述中的完整方案而扩大无证据的改动面。


请先完成设计，不要实施生产代码。任务特定说明：

- 问题陈述全文：`prompt/dual-state-sources.md`。FR-DS-01 / FR-DS-02 均为 P0；相互独立、可分期。问题陈述 §7 建议先做 FR-DS-02，设计可在求证后调整，但不得把未求证的实现形态写进方案。
- 相邻任务（事实与已交付 / 进行中的 API，**不是**本任务设计结论）：
  - 已完成：`docs/sequence-idempotency-retention/`（`Entity.retention` / `maintainEntityRetention`、`outcome` 与 `_DispatchIdempotency_`、`_ScopedSequence_`）。
  - 已完成或独立求证：`docs/entity-identity-and-relations/`（单一存储主键 `id` 与 Relation `{ id }`）。本任务的「身份键」是重叠表示上的业务身份集合，不是再做一遍主键模型；不得复制该运行的设计结论。
  - 进行中、范围不同：`docs/post-commit-side-effect-guarantees/`（提交后义务完成语义）。不得把副作用是否跑完与状态表示的权威个数混为一谈。
- 调研入口（设计轮必读/复核）：
  - `src/core/Entity.ts` — `EntityRetention`、Filtered / Merged 上的 retention 守卫
  - `src/runtime/Controller.ts` — `maintainEntityRetention`
  - `src/runtime/System.ts`、`src/runtime/MonoSystem.ts` — `AtomicStorage`（`compareAndSet` / `lockRecord` / `lockRows`）、`dispatchIdempotency.load` / `claim` / `finish`、`_DispatchIdempotency_` / `_ScopedSequence_` 建表
  - `src/core/Constraint.ts`、`src/runtime/errors/ConstraintErrors.ts`、`tests/runtime/dataConstraints.spec.ts` — UniqueConstraint 与 `ConstraintViolationError`
  - `src/core/RealDictionary.ts`、`src/runtime/System.ts` 中 `DICTIONARY_RECORD` / `DictionaryEntity`
  - `src/core/Transform.ts`、`src/runtime/computations/Transform.ts`、`agent/agentspace/knowledge/usage/04-reactive-computations.md`（「One data source, multiple Transforms」）
  - `src/runtime/migration.ts` — `records[].retention` 与内部表是否进入 modelHash
  - 测试：`tests/runtime/entityRetention.spec.ts`、`dispatchIdempotency.spec.ts`、`dataConstraints.spec.ts`、`postgresqlConcurrency.spec.ts`、相关 Transform spec
  - 文档：`agent/agentspace/knowledge/usage/`、`generator/api-reference.md`、`src/storage/USAGE_GUIDE.md`
- 生成时调研摘要（设计阶段须复核，不得当作已定缺口）：
  - 全 `src/` 未见应用级 `insertOrClaim` / `consumeOnce` / token claim 结果代数；`dispatchIdempotency.claim` 仅服务 dispatch 幂等账本，绑定 `(namespace, idempotencyKey)`，不是业务 nonce API。
  - `AtomicStorage` 有 `compareAndSet`、`lockRecord`、`lockRows`、序号能力，没有按应用键 first-wins insert 的一等方法。
  - UniqueConstraint 冲突映射为 `ConstraintViolationError`（可带 `violationCode`），这是约束违反，不是 claim / consume / expired 结果代数。
  - Dictionary 是全局 JSON KV（`_Dictionary_`），无 namespaced 行、无 consume-once、无行级 TTL。
  - `Entity.retention` + `maintainEntityRetention` 已交付，且进入 migration `records[].retention`；前提是记录已经是 Entity。Filtered / Merged / 硬删除 computation 上声明 retention 会 fail-fast。
  - Transform 文档鼓励同一数据源多条 Transform 写出不同业务类型；未见「投影完整度」声明，未见官方 coalesce / 来源标记查询原语；`src/core` 中无 completeness / stale 投影合同。
  - `_DispatchIdempotency_` / `_ScopedSequence_` 由 MonoSystem / driver 以内部表 `CREATE TABLE IF NOT EXISTS` 安装，走 I1–I3 / S1–S3，对应用 schema 可见性与 Entity 不同。
- 设计阶段最小验证实验建议（可合并，但证据须按形态 A / 形态 B 归组）：
  1. 形态 A：同一 InteractionEvent 上两条 Transform 写出实体 A / 实体 B，分别 `find`；再构造两个普通 Entity 共享业务键、展示字段冲突，用两次 `find` 后 `concat` + 部分键 `Set` 模拟应用并集，证明官方 API 既不阻止该写法，也不给出确定胜者。核对 FilteredEntity 是否只是同源视图（若是，则不是本缺口的现成解）。
  2. 形态 B：用 Entity + UniqueConstraint 并发插入同一业务键（真实 PostgreSQL 双连接若环境可用，否则先记录单连接极限并在设计中把双连接列为实现期必做），记录失败者得到的是 `ConstraintViolationError` 还是稳定 already-used。用 `atomic.compareAndSet` 在已有行上做消费标记，证明「行必须先存在」且无 first-wins insert + TTL 生命周期。核对 Dictionary 与 `dispatchIdempotency` 能否表达 namespaced consume-once。
  3. 对照：声明了 `retention.mode: 'ttl'` 的 Entity 经 `maintainEntityRetention` 可回收；内部 `_DispatchIdempotency_` 行是否可被同一维护步回收（预期否）。
- 公开教义：落地后须更新 usage / generator：合法双 Transform vs 非法读时并集；应用级 token 走框架记录而非方言 DDL。官方示例不得出现应用 `CREATE TABLE IF NOT EXISTS` 作为 claim 后端。
- 会话后端：本任务使用 **Cursor Agents Window**（`prompt/skill/new-cursor-agent-session.md` / `new_cursor_agent_session.sh`）启动后续独立会话。
- 用户未要求在本生成会话启动 Task 1；生成完成后仅交付路径与启动提示词。

执行本 Task 时：

1. 调研任务要求、项目规则、相关源码和测试。
2. 对会影响整体方案的未知事实执行最小验证实验。
3. 创建设计文档，初始化状态为 `设计中`、`design-round: 0/15`、`implementation-round: 0/0`、`current-milestone-reopens: 0`、`convergence-mode: normal`。
4. 建立里程碑，状态全部为 `开放`，`reopen-count: 0`、`reopen-domains` 为空。
5. 只完成设计和必要的验证实验，不编写生产实现。
6. 覆盖写入 `retro.md` 的运行标题和生成印记。
7. 不要执行下面任何 additional task。使用 `Please execute docs/dual-state-sources/dual-state-sources-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**

### additional task 1

你是独立设计评审者。完整阅读 Task 1、当前设计、项目规则和必要的代码；在形成全部结论前，不读取旧版评审内容或归档运行。遵守「设计复审条件」及以下流程：

1. 逐项检查「设计复审条件」的六类问题。
2. 涉及可验证事实时，亲自读取代码、运行现有测试，或编写最小验证实验。不得仅以概括性文字代替可以执行的证明。
3. 每个问题按根因归组，写明：
   - 类别；
   - 设计位置；
   - 被违反的要求或项目原则；
   - 证据；
   - 同类检查范围和全部命中；
   - 必须完成的修正；
   - 修正完成的验证方式。
4. 只把符合六类复审条件的问题列为「需要复审的问题」。其它有价值的意见列为「实现注意事项」，不得影响评审结论。
5. 覆盖写入 `docs/dual-state-sources/dual-state-sources-review.md`，结论只能是：
   - `通过`
   - `需要修订`
   - `目标不可实现`
6. 不修改设计文档。
7. 使用 `Please execute docs/dual-state-sources/dual-state-sources-task.md Task 1 additional task 2.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**

### additional task 2

你是设计裁决者。深度理解 Task 1 和原设计 `docs/dual-state-sources/dual-state-sources.md`，然后逐条核验 `docs/dual-state-sources/dual-state-sources-review.md` 中的问题，不得直接接受评审结论。遵守「设计复审条件」及以下流程：

1. 对每个问题复核证据和复审类别。
2. 采纳问题时，按同一根因检查相关设计和代码范围，并一次修正全部同类位置。
3. 驳回问题时，给出源码、测试、项目规则或逻辑推演证据。
4. 对第二次出现问题的同一设计领域，按「设计复审条件」的要求改用完整、有限的表达形式。
5. 更新设计文档，并执行所有设计期验收命令和最小验证实验。
6. `d` 增加 1；向 `retro.md` 追加一行：轮次、评审结论、采纳的问题类别、主要证据和下一步。
7. 按顺序评估并执行（只走命中的第一条分支）：
  - 若有充分证据证明 Task 的核心目标在当前技术、权限或运行环境下不可实现：设置 `status: 不可实现`，在 `retro.md` 写明证据后终止，不启动新的 chat。
  - 若本轮没有采纳任何「需要复审的问题」：设计通过。设置 `status: 实现中`，以初始里程碑数计算 `N = 5 × M`，然后使用 `Please execute docs/dual-state-sources/dual-state-sources-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**
  - 若有采纳问题且 `d < 15`：使用 `Please execute docs/dual-state-sources/dual-state-sources-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**
  - 若 `d = 15`：完成一次全局修订和六类条件自检。不存在已知阻塞问题时按上面的设计通过分支进入实现；仍存在已知阻塞问题时设置 `status: 协议失败`，记录原因并终止，不启动新的 chat。不得自行提高预算或要求用户选择方案。

### additional task 3

你是实现者。深度理解并实施 `docs/dual-state-sources/dual-state-sources.md`。你是实现循环中的**实现轮**，与 additional task 4 的**审计轮**交替执行。严格遵守以下流程：

1. 首先读取 `next-action`。内容不是「无」时，必须先完成该项工作；只有证据证明它不再适用时才可改写。若 `convergence-mode` 不是 `normal`，还必须先读取当前审计文件的 `Convergence Note`，按其 `Next implementation batch` 顺序推进。
2. 只推进编号最小的未完成里程碑。完成该里程碑所必需的测试、脚本、环境配置和缺陷修复均属于本轮范围。
3. 优先复用项目测试体系。修复真实缺陷时，先建立能够失败的复现，再修复并运行通过。
4. 实现中发现设计事实错误时，可以修订当前及后续未完成里程碑、拆分或重排工作，但不得删除 Task 要求，不得增加总预算 `N`。
5. 执行当前里程碑的验收。通过时标记为 `待审`并记录命令、结果和证据；未通过时保持 `开放`并记录具体阻塞。收敛模式下必须先通过 `Convergence Note` 的全部 Closure gates，不能以只完成部分批次为由标记`待审`。
6. 执行受本轮修改影响的项目基础检查。任务开始前已经失败的检查以基线记录为准；不得新增失败，也不得以同名旧失败掩盖不同的新原因。
7. `k` 增加 1，更新 `implementation-round: k/N`。
8. 不得把里程碑标记为 `已完成`。
9. 本轮结束时**一律**使用 `Please execute docs/dual-state-sources/dual-state-sources-task.md Task 1 additional task 4.` 作为 prompt 启动新的 chat（无论你认为完成与否，都交给审计轮判定，不再自行连续启动 additional task 3）。只要启动就可以结束，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**

### additional task 4

你是独立实现审计者。深度理解 `docs/dual-state-sources/dual-state-sources.md` 并对实现进行对抗性 review。你是实现循环中的**审计轮**，与 additional task 3 的**实现轮**交替执行。不得信任里程碑状态或实现者的结论。按以下顺序执行：

1. 复验当前里程碑的验收命令，并复验本轮修改可能影响的已完成里程碑。
2. 对照 Task 要求、设计和代码差异审查真实实现。阻塞性问题必须附可复现失败、测试输出或明确的代码证据。
3. 对每个真实缺陷执行同类检查，列出相关范围内全部同类位置。
4. 区分两类问题：
   - **实现缺陷**：产品行为不符合设计或 Task。建立失败复现，将里程碑恢复为 `开放`。
   - **验证缺口**：现有验收可能放过错误实现，但当前产品实现未被证明错误。审计轮应直接加强测试或验收，完全还原临时缺陷注入，再立即复验。复验通过时里程碑继续关闭，不得仅因验证加强而退回实现轮。
5. 对高风险行为可以使用缺陷注入检验，但只应移除、短路或替换生产路径以验证测试的判别能力；不得制造虚假的生产副作用来满足测试。
6. 同一验证领域连续两轮出现缺口时，停止逐项增加条件：有限领域应一次列全并对照权威来源；开放行为领域应改用实际执行和因果观测。
7. 对实现缺陷使用稳定的行为领域名归组；若本轮将里程碑从`待审`退回`开放`，`reopen-count` 增加 1，本轮每个命中的 `reopen-domains` 各增加 1，再按「Reopen 与收敛」判断是否触发收敛模式。纯验证缺口和原本就是`开放`的里程碑不计。
8. 处于收敛模式时，不得只审最新 diff；`domain-review` 检查完整领域，`milestone-review` 检查整个里程碑，并创建或更新四段式 `Convergence Note`。
9. 覆盖写入 `docs/dual-state-sources/dual-state-sources-audit.md`。
10. 按审计结论更新状态：
  - 验收通过且没有实现缺陷：将 `待审`里程碑标记为 `已完成`，`next-action` 写「无」。
  - 存在实现缺陷：将里程碑标记为 `开放`；若原状态为`待审`则增加 reopen 计数。普通模式在 `next-action` 写明具体修改、失败命令、涉及位置和完成条件；收敛模式则令 `next-action` 指向 `Convergence Note` 的下一实施批次。
  - 当前里程碑原本为 `开放`且实现轮未取得通过：给出明确诊断和下一步，不得只写一般性建议。
11. 按顺序评估并执行（只走命中的第一条分支）：
  - 全部里程碑已完成：执行一次最终核验（全部里程碑验收命令、Task 要求逐项检查以及项目要求的基础测试）。全部通过后设置 `status: 已完成`，按「运行记录」完成 `retro.md` 并终止，不启动新的 chat。
  - 未完成且 `k < N`：使用 `Please execute docs/dual-state-sources/dual-state-sources-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**
  - 未完成且 `k >= N`：若有证据证明核心目标不可实现，设置 `status: 不可实现`；否则设置 `status: 协议失败`。按「运行记录」完成 `retro.md` 后终止，不启动新的 chat。不得自行增加预算或要求用户决定下一步。
