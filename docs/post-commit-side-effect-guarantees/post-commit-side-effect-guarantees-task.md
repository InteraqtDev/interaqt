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

- 设计文档：`docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees.md`
- 设计评审：`docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-review.md`
- 实现审计：`docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-audit.md`
- 运行记录：`docs/post-commit-side-effect-guarantees/retro.md`

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

## Task 1 提交后副作用的交付保证

### 背景

`Controller.dispatch` 把一次调用分成两个阶段：阶段 A 是事实事务（admit → map → 事件记录 → resolve → 同步 computation → afterDispatch → 幂等回执 `finish`，失败回滚并写入 `result.error`）；阶段 P 是提交后义务（`postCommit` 与 `RecordMutationSideEffect`，失败写入 `result.sideEffects`、不回滚事实、不设置 `result.error`）。这是正确的事务边界：外部 IO 不应进入事实事务。

问题陈述认为：框架给了阶段 P 官方挂点，却没有配套的**完成语义**——完成判别不是一等结果、已提交事实的义务不可重执行、去重/重放路径会把「事实已存在」折叠成调用方眼中的成功，从而使上游 at-least-once 传不到阶段 P。与已交付的 FR-IDEM-01（`DispatchResponse.outcome: 'applied' | 'replayed'`，判别事实是否首次生效）相邻而不同：本任务解决「提交后义务是否完成、能否完成」。

问题陈述输入（任务输入，非已定设计）：

`prompt/post-commit-side-effect-delivery-guarantees.md`

行号与行为曾核对于主干 `aa7d1c7`（v4.8.0）；设计阶段必须对**当前 HEAD** 复核，不得只复述该文件。

生成时调研摘要（设计阶段须用源码、现有测试与最小实验复核，不得仅复述问题陈述）：

- `DispatchResponse`（`src/runtime/Controller.ts`）含 `error` / `data` / `effects` / `sideEffects` / `context` / `outcome`。`outcome` 只覆盖幂等参与者的事实首次/回放。阶段 P 失败不设置 `error`，只写入 `sideEffects[name].error` 或 `sideEffects.__postCommit.error`。
- 重放跳过 P：`result.outcome === 'replayed'` 时 `dispatch` 直接返回（源码注释 “P (postCommit + mutation side effects): never on idempotent replay”）。合同测试 `tests/runtime/dispatchIdempotency.spec.ts` 断言 postCommit 首次 1、回放 0，业务事务回放不把阶段 P 推入推迟队列。
- `runRecordChangeSideEffects` 是 `Controller` 上的公开方法，入参是带 `effects` 的 `DispatchResponse`。`tests/runtime/recordMutationSideEffect.spec.ts` 主要通过 `storage.create` + 手工构造 mock `effects` 调用该方法（含一项「一个失败不阻止另一个」）；`tests/runtime/transactionAcceptance.spec.ts` 与 `transactionRetry.spec.ts` 有经 `dispatch` 的副作用 / postCommit 失败用例，且断言 `result.error` 仍为 undefined。未见官方「P 是否全部成功」判别字段或 helper，也未见「按已提交记录重建 mutation event 并重跑 P」的公开原语。
- 幂等回执 `dispatchIdempotency.finish` 在事实事务内、阶段 P 之前落为 `succeeded`。
- 公开教义（`agent/agentspace/knowledge/usage/05-interactions.md`、`generator/api-reference.md`）把 `RecordMutationSideEffect` / `postCommit` 指定为提交后外部 IO 挂点，并说明失败不回滚、错误在 `sideEffects`；成功检查示例仍以 `if (result.error)` 为主。

已交付且**不得**在本任务重复立项：FR-IDEM-01 的 `outcome` 与 `_DispatchIdempotency_` 账本、`runInBusinessTransaction` 及阶段 P 推迟到拥有者 COMMIT 之后、非业务事务内 dispatch 硬失败、`NestedDispatchError`、Condition 准入锁。本任务扩展完成语义时必须与这些合同一致叙述，不得发明第二套「事实成功」。

### 要求

1. **求证问题是否存在（硬前置）**  
   在设计阶段用源码、现有测试与最小验证实验，分别求证问题陈述中的 **G1**（失败可见性不是一等语义）、**G2**（已提交事实的义务不可重执行；去重/重放路径假成功）、**G3**（义务完成与事实回执状态合并；commit 与阶段 P 之间的崩溃窗口无痕迹）是否在当前主干真实存在。  
   - 对「存在」的结论：给出可复现证据（合同测试缺口、精确到文件与行为的 API 表面、或最小实验输出）。  
   - 对「不存在 / 已有官方路径」的结论：给出反证，并将对应子需求从实现范围中明确关闭（不得假装仍要交付）。  
   - 不得仅复述 `prompt/post-commit-side-effect-delivery-guarantees.md` 的叙述作为证据。  
   - 生成时摘要可能不精确：副作用失败测试并非完全缺失，而是可能未走完整 `dispatch` 合同、或无一等完成判别。求证必须区分「完全没有失败上报」与「有 `sideEffects` map 但无一等完成语义」。  
   - 若部分缺口已不存在，其余缺口仍须按本任务交付；关闭项须在设计文档与 `retro.md` 中写明证据。

2. **FR-SE-01 — 副作用完成状态一等化（P0）**  
   若求证确认 G1 存在，使调用方能以**官方、可编程**的方式从单次 `dispatch` 结果判别「阶段 P 是否全部成功」，并能拿到失败明细。必须覆盖 `postCommit` 失败（今日藏在 `sideEffects.__postCommit`）。  
   形态由设计裁定（一等字段、官方 helper、或选择加入的严格模式），但不得把「遍历 `sideEffects` 检查每个 entry」继续作为唯一官方完整成功检查。  
   硬约束：  
   - **不得**把阶段 P 失败折叠进 `result.error`：那会把已提交事实伪装成阶段 A 失败，破坏两阶段合同。  
   - 默认不因阶段 P 失败而 throw。  
   - 现有只检查 `result.error` 的调用方：事实已提交时 `error` 仍缺席（与今日一致）。义务敏感的调用方必须改用新的完成判别；落地后官方教义须写明二者区别。  
   验收硬约束：副作用或 `postCommit` 失败 → 官方判别为未完成，且能取得失败明细；事实仍已提交；`result.error` 仍只表示阶段 A 失败。合同测试必须经 `dispatch`（不得仅用 mock `runRecordChangeSideEffects` 充当本条完成证明）。

3. **FR-SE-02 — 已提交事实的义务可重执行（P0）**  
   若求证确认 G2 存在，提供官方原语，对已提交事实重跑阶段 P。须逐一定义并测试：  
   1. **输入重建确定性**：重执行拿到的 mutation event 与首次执行同构（create 型：记录从 storage 按全属性加载）。  
   2. **重跑 = 全量重跑**：对该记录名上注册的全部副作用整体重跑；**副作用幂等是框架合同**（须文档化）。部分成功后再次重跑时，已成功项由副作用自身幂等吸收。  
   3. **失败上报同形状**：与 FR-SE-01 同一完成结果形状；不 throw、不改事实。  
   4. **进程局部性**：在调用方持有的 Controller 实例上执行（`recordNameToSideEffects` 为实例级注册表）；跨进程装配差异是应用责任，框架文档写明。  
   5. **支持范围显式化**：create 型是必须交付的良定义子集。update 型需要 `oldRecord`，storage 默认无历史——设计必须明确不支持或引入历史，不得用残缺 event 静默重跑。  
   现有 `runRecordChangeSideEffects(DispatchResponse)` 若仍要求调用方持有首次 `effects`，不得单独充当本要求的完成证明。  
   验收硬约束：在没有首次 `DispatchResponse.effects` 的情况下，能对已提交 create 记录重跑阶段 P；失败形状与首次 `dispatch` 路径一致。

4. **FR-SE-03 — 去重/重放路径的义务收敛（P0）**  
   若求证确认「上游重投无法触发义务重执行」存在，使调用方可表达「重投仍要求义务完成」；dedup 命中不得再被官方教义折叠为「已成功故无需再做」。两条路径都必须有官方答案：  
   - **应用层 admit 去重**（重复业务键抛错 → `result.error`）：调用方须能区分「重复且义务已完成」与「重复但义务未完成/未知」，并在后者触发重执行（配合 FR-SE-02），而不是把重复错误一律当作成功。  
   - **框架幂等 replay**（`outcome: 'replayed'` 今日跳过阶段 P）：须显式化——要么官方声明「replay 不含义务，义务完成走 FR-SE-02」，要么提供要求义务收敛的重放入口。不得维持「文档化跳过 + 无替代路径」。  
   - **与 `outcome` 单一真相**：不得把 `replayed` 改义为「义务已完成」，也不得新增与 `applied` / `replayed` 冲突的第二套事实成功枚举。  
   验收硬约束：admit 去重命中与幂等 replay 两条路径上，义务可被重执行直至成功；幂等副作用吸收重复执行（含部分成功后重跑）。若设计保留默认 replay 跳过阶段 P，必须同时提供可文档化的替代收敛入口，且现有 `dispatchIdempotency` 回归（首次 1 / 回放 0）在默认路径上不破坏。

5. **FR-SE-04 — 义务完成可查询（P1，由设计裁决是否纳入本次）**  
   G3：幂等回执在阶段 P 之前即为 `succeeded`，「事实已提交」与「义务已完成」不可区分；commit 成功但阶段 P 未执行（进程崩溃）时，义务可永久丢失且无框架痕迹。  
   设计必须明确裁决是否纳入本次实现：  
   - **纳入**：把「义务已对某次提交执行过（及结果）」落为框架管理的持久标记，与事实幂等账本分离；崩溃窗口可查询未完成项；FR-SE-02 可跳过已成功项（细粒度收敛）；FR-SE-03 的「重复且义务已完成」有据。回执是完成事实，不是调度器。须有独立可验收里程碑，并用可重复的崩溃窗口模拟（例如 commit 后、阶段 P 前短路）证明可查询未完成项。  
   - **不纳入**：在设计中写明剩余缺口、应用侧如何用 FR-SE-02 从已知已提交记录恢复，以及为何 P0 闭环不依赖查询账本。不得把 G3 或问题陈述验收第 3 条假装已闭合。  
   无论是否纳入：框架**不**内置重试、退避、outbox 或死信调度。投递策略仍归应用。

6. **阶段划分与非目标（硬约束）**  
   - 不改事实事务模型：阶段 P 在提交后执行、失败不回滚事实。  
   - 副作用保持非事务：不把阶段 P 纳入事实事务，不提供补偿事务框架。  
   - 框架不做出站调度。  
   - 不重做 FR-IDEM-01、业务事务、dispatch 路径唯一、嵌套 dispatch 禁止。  
   - 问题陈述 §7 的方向 A / B / C 仅为讨论材料，**不是**方案约束。设计只保留一个明确方案，并说明关键决策及理由。  
   - 方案必须能回答：上游 at-least-once → 义务 at-least-once 能否成为官方模式而非应用手工编排；API 与概念面是否最小；与 `outcome` 是否一致；默认 `result.error` 合同是否保持。

7. **与现有能力的关系**  
   - 优先在现有 `dispatch` / 业务事务推迟冲刷 / `runPostCommitHook` / `runRecordChangeSideEffects` 汇合点扩展，避免只修顶层 `dispatch` 而漏业务事务路径。  
   - 枚举全部读者：`DispatchResponse` 公开类型与文档、`postCommit`、`RecordMutationSideEffect`、幂等 replay 早退、业务事务推迟队列、`entityRetention` 在成功阶段 P 之后的钩子、Activity 包装转发清单（`ActivityManager`）。触及声明面或公开 API 时按 `AGENTS.md` 修一类而非一个实例。  
   - 不得把已交付的 `outcome` 语义改成义务完成标记。

8. **交付与验证纪律**  
   - FR-SE-01 / 02 / 03 构成最小闭环，可分里程碑，但只实现一半不算对应 ID 完成。建议先闭合可见性与重执行，再闭合去重路径；求证后可调整分期，验收必须可独立执行。  
   - 优先使用项目既有 Vitest 体系；新增测试挂在 runtime 合适位置（可扩展现有 spec 或新增文件）。  
   - 必须覆盖：经 `dispatch` 的阶段 P 失败；`postCommit` 失败；create 重执行；部分成功后重跑；admit 去重与幂等 replay 两条收敛路径；业务事务推迟阶段 P；默认 replay 仍跳过阶段 P（若设计保留该默认）。  
   - 回归：正常 `dispatch`、幂等 replay 默认跳过阶段 P、业务事务推迟执行、`postCommit` 语义；既有 `dispatchIdempotency` / `businessTransaction` / `transactionRetry` / `transactionAcceptance` / `recordMutationSideEffect` 无新增失败。  
   - 变更后按需执行 `npm run check`；触及公开 API 时保持类型导出、usage / generator 与 CHANGELOG（若适用）一致。  
   - 遵守 `AGENTS.md`：汇合点修复；已知规则提升为可执行不变量；书面语言使用准确技术术语与完整句子。

9. **范围边界**  
   - 不在本仓库实施具体业务应用的改造；本任务是框架能力：公开 API、runtime 行为、文档与测试。  
   - 不把应用层 admit 去重抛错本身定为非法；要补的是义务收敛的官方答案。  
   - 不要求所有 EventSource 默认参与义务回执。  
   - 落地后不得把「扫描 `sideEffects`」或「把重复错误当作成功」保留为官方推荐的完整成功模式；义务敏感调用方须指向新的完成判别与重执行入口。


请先完成设计，不要实施生产代码。任务特定说明：

- 问题陈述全文：`prompt/post-commit-side-effect-delivery-guarantees.md`。FR-SE-01 / 02 / 03 为 P0 最小闭环；FR-SE-04 是否纳入本次实现由设计裁决（要求 5）。
- 相邻已完成任务（事实与已交付 API，**不是**本任务设计结论）：`docs/sequence-idempotency-retention/`（FR-IDEM-01 `outcome`）、`docs/condition-admission-and-tx-visibility/`（业务事务与阶段 P 推迟）、`docs/tx-dispatch-path-uniqueness/`（非业务事务内 dispatch 非法）。不得复制这些运行的设计结论作为本任务方案。
- 调研入口（设计轮必读/复核）：
  - `src/runtime/Controller.ts` — `DispatchResponse`、`dispatch` 阶段 P、`runPostCommitHook`、`runRecordChangeSideEffects`、业务事务推迟冲刷、`outcome === 'replayed'` 早退
  - `src/runtime/System.ts`、`src/runtime/MonoSystem.ts` — `dispatchIdempotency.load` / `claim` / `finish`
  - `src/runtime/errors/SideEffectError.ts`
  - `src/builtins/interaction/activity/ActivityManager.ts` — `postCommit` 等字段转发
  - 测试：`tests/runtime/recordMutationSideEffect.spec.ts`、`dispatchIdempotency.spec.ts`、`transactionRetry.spec.ts`、`transactionAcceptance.spec.ts`、`businessTransaction.spec.ts`、`postgresqlBusinessTransaction.spec.ts`
  - 文档：`agent/agentspace/knowledge/usage/05-interactions.md`、`04-reactive-computations.md`、`generator/api-reference.md`（RecordMutationSideEffect 与 DispatchResponse）
- 设计阶段最小验证实验建议（可合并，但证据须按 G1 / G2 / G3 归组）：
  1. G1：经 `dispatch` 触发一条会抛错的 `RecordMutationSideEffect`（以及一条失败的 `postCommit`），记录 `DispatchResponse` 全字段；证明只读 `error` 无法发现阶段 P 失败；核对是否已有官方完成判别 helper。
  2. G2：对「admit 遇重复业务键抛错」的二次 `dispatch`，以及对声明了 `idempotency` 的二次 `dispatch`（期望 `outcome: 'replayed'`），证明两条路径都不重跑阶段 P；并核对公开面上是否存在不依赖首次 `effects` 的重跑入口。
  3. G3：核对 `dispatchIdempotency.finish` 相对阶段 P 的时序；确认无独立义务完成回执表或查询 API。
  4. 对照：业务事务内阶段 P 是否仍在拥有者 COMMIT 之后执行；默认 replay 跳过阶段 P 是否仍被 `dispatchIdempotency` 测试钉住。
- 问题陈述 §7 的方向 A / B / C 不得直接当作方案选型清单照抄进设计而不做求证。
- 公开教义：落地后须更新 usage / generator 中与 `dispatch` 结果、`postCommit`、`RecordMutationSideEffect` 相关的说明；义务敏感路径须指向完成判别与重执行（及若有回执）的官方模式，不得继续把「只检查 `result.error`」写成完整成功检查。
- 会话后端：本任务使用 **Cursor Agents Window**（`prompt/skill/new-cursor-agent-session.md` / `new_cursor_agent_session.sh`）启动后续独立会话。

执行本 Task 时：

1. 调研任务要求、项目规则、相关源码和测试。
2. 对会影响整体方案的未知事实执行最小验证实验。
3. 创建设计文档，初始化状态为 `设计中`、`design-round: 0/15`、`implementation-round: 0/0`、`current-milestone-reopens: 0`、`convergence-mode: normal`。
4. 建立里程碑，状态全部为 `开放`，`reopen-count: 0`、`reopen-domains` 为空。
5. 只完成设计和必要的验证实验，不编写生产实现。
6. 覆盖写入 `retro.md` 的运行标题和生成印记。
7. 不要执行下面任何 additional task。使用 `Please execute docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**

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
5. 覆盖写入 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-review.md`，结论只能是：
   - `通过`
   - `需要修订`
   - `目标不可实现`
6. 不修改设计文档。
7. 使用 `Please execute docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-task.md Task 1 additional task 2.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**

### additional task 2

你是设计裁决者。深度理解 Task 1 和原设计 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees.md`，然后逐条核验 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-review.md` 中的问题，不得直接接受评审结论。遵守「设计复审条件」及以下流程：

1. 对每个问题复核证据和复审类别。
2. 采纳问题时，按同一根因检查相关设计和代码范围，并一次修正全部同类位置。
3. 驳回问题时，给出源码、测试、项目规则或逻辑推演证据。
4. 对第二次出现问题的同一设计领域，按「设计复审条件」的要求改用完整、有限的表达形式。
5. 更新设计文档，并执行所有设计期验收命令和最小验证实验。
6. `d` 增加 1；向 `retro.md` 追加一行：轮次、评审结论、采纳的问题类别、主要证据和下一步。
7. 按顺序评估并执行（只走命中的第一条分支）：
  - 若有充分证据证明 Task 的核心目标在当前技术、权限或运行环境下不可实现：设置 `status: 不可实现`，在 `retro.md` 写明证据后终止，不启动新的 chat。
  - 若本轮没有采纳任何「需要复审的问题」：设计通过。设置 `status: 实现中`，以初始里程碑数计算 `N = 5 × M`，然后使用 `Please execute docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**
  - 若有采纳问题且 `d < 15`：使用 `Please execute docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**
  - 若 `d = 15`：完成一次全局修订和六类条件自检。不存在已知阻塞问题时按上面的设计通过分支进入实现；仍存在已知阻塞问题时设置 `status: 协议失败`，记录原因并终止，不启动新的 chat。不得自行提高预算或要求用户选择方案。

### additional task 3

你是实现者。深度理解并实施 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees.md`。你是实现循环中的**实现轮**，与 additional task 4 的**审计轮**交替执行。严格遵守以下流程：

1. 首先读取 `next-action`。内容不是「无」时，必须先完成该项工作；只有证据证明它不再适用时才可改写。若 `convergence-mode` 不是 `normal`，还必须先读取当前审计文件的 `Convergence Note`，按其 `Next implementation batch` 顺序推进。
2. 只推进编号最小的未完成里程碑。完成该里程碑所必需的测试、脚本、环境配置和缺陷修复均属于本轮范围。
3. 优先复用项目测试体系。修复真实缺陷时，先建立能够失败的复现，再修复并运行通过。
4. 实现中发现设计事实错误时，可以修订当前及后续未完成里程碑、拆分或重排工作，但不得删除 Task 要求，不得增加总预算 `N`。
5. 执行当前里程碑的验收。通过时标记为 `待审`并记录命令、结果和证据；未通过时保持 `开放`并记录具体阻塞。收敛模式下必须先通过 `Convergence Note` 的全部 Closure gates，不能以只完成部分批次为由标记`待审`。
6. 执行受本轮修改影响的项目基础检查。任务开始前已经失败的检查以基线记录为准；不得新增失败，也不得以同名旧失败掩盖不同的新原因。
7. `k` 增加 1，更新 `implementation-round: k/N`。
8. 不得把里程碑标记为 `已完成`。
9. 本轮结束时**一律**使用 `Please execute docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-task.md Task 1 additional task 4.` 作为 prompt 启动新的 chat（无论你认为完成与否，都交给审计轮判定，不再自行连续启动 additional task 3）。只要启动就可以结束，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**

### additional task 4

你是独立实现审计者。深度理解 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees.md` 并对实现进行对抗性 review。你是实现循环中的**审计轮**，与 additional task 3 的**实现轮**交替执行。不得信任里程碑状态或实现者的结论。按以下顺序执行：

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
9. 覆盖写入 `docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-audit.md`。
10. 按审计结论更新状态：
  - 验收通过且没有实现缺陷：将 `待审`里程碑标记为 `已完成`，`next-action` 写「无」。
  - 存在实现缺陷：将里程碑标记为 `开放`；若原状态为`待审`则增加 reopen 计数。普通模式在 `next-action` 写明具体修改、失败命令、涉及位置和完成条件；收敛模式则令 `next-action` 指向 `Convergence Note` 的下一实施批次。
  - 当前里程碑原本为 `开放`且实现轮未取得通过：给出明确诊断和下一步，不得只写一般性建议。
11. 按顺序评估并执行（只走命中的第一条分支）：
  - 全部里程碑已完成：执行一次最终核验（全部里程碑验收命令、Task 要求逐项检查以及项目要求的基础测试）。全部通过后设置 `status: 已完成`，按「运行记录」完成 `retro.md` 并终止，不启动新的 chat。
  - 未完成且 `k < N`：使用 `Please execute docs/post-commit-side-effect-guarantees/post-commit-side-effect-guarantees-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-cursor-agent-session.md` 中的方法来启动新的 chat。**
  - 未完成且 `k >= N`：若有证据证明核心目标不可实现，设置 `status: 不可实现`；否则设置 `status: 协议失败`。按「运行记录」完成 `retro.md` 后终止，不启动新的 chat。不得自行增加预算或要求用户决定下一步。
