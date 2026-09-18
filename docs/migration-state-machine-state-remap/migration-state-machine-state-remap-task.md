<!-- generated-by: cyclic-task-prompt | template-sha256: 43a33f632926 | generated-at: 2026-09-17 -->
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

- 设计文档：`docs/migration-state-machine-state-remap/migration-state-machine-state-remap.md`
- 设计评审：`docs/migration-state-machine-state-remap/migration-state-machine-state-remap-review.md`
- 实现审计：`docs/migration-state-machine-state-remap/migration-state-machine-state-remap-audit.md`
- 运行记录：`docs/migration-state-machine-state-remap/retro.md`

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

## Task 1 迁移期 StateMachine 持久化状态与状态图变更的一致性

### 背景

interaqt 的迁移子系统（`src/runtime/migration.ts`）把每个 computation 的变更分为「输出重建」（`rebuildOutput`：重算派生值）与「状态重建」（`rebuildState`：重置 bound state）。StateMachine 的 bound state `currentState` 记录每条宿主记录（property 级）或全局字典（global 级）当前处于状态图中的哪个节点；运行期 `TransitionFinder.findNextState(currentStateName, event)` 以持久化的状态名查找出边，找不到时 `incrementalCompute` 返回 `ComputationResult.skip()`。

生成时在 `main`（`f9f06b3`）上核实到下面这组事实（设计阶段必须对当前 HEAD 复核，不得只复述）：

- **症状。** 一次成功完成的迁移之后，针对被迁移 StateMachine 的 Interaction `dispatch` 返回成功（`error` 为 undefined），但输出值与内部状态都不变。迁移报告、输出值检查都是绿的，问题只在「迁移后的下一次交互」暴露。
- **机制 A：两个标志同时为真时状态重建被跳过。** `MigrationScheduler.run()` 中 `if (item.rebuildState && !item.rebuildOutput) { await this.rebuildStateDefaults(computation); continue; }`——当 `rebuildState && rebuildOutput` 同时为真（例如重命名初始状态：`currentState.defaultValue = initialState.name` 变化使 `stateSignature` 变化；`argsSignature` 规范化了 `StateNode.name` 使 `structuralSignature` 变化并要求 `changed` 决策），状态重建被跳过。输出重建路径（`runFullRecompute` → event rebuild handler → `writeComputationResult`）从不写 bound state；整个 `migration.ts` 中 `setInternal` 只出现在 `rebuildStateDefaults`。已用 PGLite 上的真实 `migrate()` + `dispatch()` 复现（property 与 global 两种作用域）。
- **机制 B：非初始状态改名对状态签名不可见。** `stateSignature` 只包含 bound state 的 key、作用域、宿主记录与**默认值**签名；把 `approved` 改名为 `accepted` 而初始状态 `pending` 不变时，`stateSignatureChanged: false`、`rebuildState: false`。处于 `approved` 的记录迁移后 `currentState` 仍为 `approved`——一个新状态图里不存在的名字——随后 `Archive` 交互成功但无效。已用探针复现。
- **机制 C：`rebuildStateDefaults` 的语义只对一类情形正确。** 它把所有 bound state 重置为声明默认值。对「初始状态改名」这恰好等于正确映射；对「非初始状态改名」它会把 `approved` 记录重置回 `pending`，是错误动作。正确动作是逐记录的旧状态名 → 新状态名映射，而现有 event rebuild handler 合约 `({ controller, dataContext, record?, mutationEvent? }) => outputValue` 没有表达它的通道。
- **机制 D：状态重建与输出重建的先后关系按 computation 家族而异。** 数据驱动聚合（Count / Summation / Average / Every / Any / WeightedSummation）的 `compute` / `persistFullResult` 会重写全部 bound state，先重置再重算是无害的冗余。Transform 的 `recomputeTransformOutput` 以 `${sourceRecordId}:${transformIndex}` 索引既有输出行，若先把这两列重置为默认值 `''` / `0`，所有既有行坍缩到同一键，`Map` 只保留一行，重算结果全部当作新行创建、只删掉幸存的一行——输出行重复且来源指针为空。今天 Transform 的 bound state 形状由框架固定，应用层声明触发不到；框架升级新增或改名 Transform bound state 时会触发。现有 `state-only` 路径对 Transform 有同一问题。
- **上游 PR #51**（https://github.com/InteraqtDev/interaqt/pull/51）把守卫改为 `if (item.rebuildState) { rebuildStateDefaults; if (!item.rebuildOutput) continue; }`。它修复了机制 A 的复现场景，但不覆盖机制 B、放大了机制 D 的暴露面、且没有把「持久化状态名必须存在于当前状态图」提升为受检不变量。该 PR 与生成时的评审报告 `agentspace/output/pr51-migration-state-rebuild-review-2026-09-17.md` 是本任务的**输入**，不是设计结论；本任务不以合并该 PR 为目标。

根因抽象（供求证，不是方案约束）：迁移把 bound state 当作「有默认值、可整体重置」的附属数据，而 StateMachine 的 `currentState` 实际上是**受状态图约束的持久化事实**——它的合法值集合、以及从旧图到新图的映射，都不在迁移的声明面里。

### 要求

1. **求证并界定问题类（硬前置）**  
   在设计阶段用源码、现有测试与最小验证实验，对当前 HEAD 复核上述机制 A–D，并给出可复现证据（失败断言或探针输出）。至少覆盖：初始状态改名 × 非初始状态改名 × 状态节点新增/删除；property 级与 global 级 StateMachine；带 `createState` 的 `Custom` computation（其 bound state 是否面临同一暴露）；以及 Transform 与聚合家族在 `rebuildState` 单独为真、与 `rebuildOutput` 同时为真两种计划下的实际行为。对每个机制给出「存在 / 不存在 / 今日不可达但可由框架升级触发」的结论；不成立的项写明反证并从实现范围关闭。  
   按 `AGENTS.md` § 修 bug 清单枚举 `rebuildState` / `rebuildOutput` / `rebuildStateDefaults` / `stateSignature` 的全部读者（含 `simulateCascadeDeletionScope`、`addMissingRebuildHandlerRequirements`、`getCascadeAwareDeletionScope`、diff 分类 `state-only` 分支、`WritingComputationTests.md` 中的迁移维度），并说明每个读者受方案影响的方式。

2. **状态图变更时持久化状态的映射合同（P0）**  
   为「StateMachine（及等价的带 bound state 的 event-based computation）的状态图在迁移中发生变化」定义一条官方路径，使迁移完成后每条宿主记录 / 全局字典的 `currentState` 都是新状态图中的合法名字，且该名字是对旧状态的**有意映射**而不是无差别重置。合同必须至少回答：  
   - 映射由谁表达（迁移 handler 的返回形态、审批 diff 中的专门决策、StateMachine 声明上的迁移元数据，或其它形态——由设计裁定，下面「任务特定说明」中的选项只是建议）；  
   - 未提供映射时的行为（拒绝迁移 / 要求决策 / 仅在旧名仍合法时放行），并说明为何该默认符合「显式控制」原则；  
   - property 级与 global 级两种作用域、以及输出值与状态在同一 handler 调用内的一致性（输出值由 `computeValue` 派生自状态，两者不能各自为政）。  
   验收硬约束：初始状态改名与非初始状态改名两种场景迁移后，对每种状态的记录分别执行一次依赖该状态的 Interaction，输出值与 `currentState` 均按新图变化；一个只改输出值不改状态的错误实现必须被测试区分出来。

3. **把「持久化状态名合法」提升为受检不变量（P0）**  
   在迁移执行路径（以及设计裁定的其它合适时机，例如 `setup`）加入检查：每个 StateMachine 的持久化 `currentState` 值都必须属于当前状态图的节点名集合，否则以清晰的错误 fail-fast，而不是在下一次交互时静默 skip。错误信息须包含 computation 的 dataContext、非法状态名与合法集合。设计须论证检查的成本边界（全表扫描是否可接受、是否只在状态图变化时触发）与对 kill-resume 的影响。

4. **`rebuildStateDefaults` 的适用边界与执行顺序（P0）**  
   明确「重置为默认值」只对哪些 bound state 是正确动作，并让实现无法把它施加在输出路径自行拥有的状态上（Transform 的 `sourceRecordId` / `transformIndex` 是已知反例）。可以按 computation 家族声明状态所有权、调整执行顺序，或用其它机制——由设计裁定。验收硬约束：为 Transform 构造一个 `rebuildState && rebuildOutput` 的计划（允许通过测试专用手段制造 `stateSignature` 变化），迁移后输出行数与来源指针必须与全量重算一致，不得出现重复行。

5. **迁移分类与签名的一致性**  
   若求证证明 `stateSignature` 无法感知状态图节点集合的变化（机制 B），设计须决定：让签名覆盖合法值集合、让 diff 分类给出专门的变更类型 / 决策要求、或以要求 3 的不变量兜底——并说明选择理由。任何签名变更都要评估对既有部署 `modelHash` 的影响（是否会让未变更的模型被判为变更）与 `migrationGenerativeFuzz` 的 rng 决策流契约。

6. **测试与维度注册表**  
   - 优先使用项目既有 Vitest 体系；新增测试挂在 `tests/runtime/` 迁移相关位置。  
   - 必须覆盖：机制 A（property / global）、机制 B（非初始改名）、状态节点删除、Custom bound state、Transform 顺序反例、不变量 fail-fast 的正负向。每个用例都必须在迁移后执行真实 Interaction 并读取输出值与 bound state，只断言 handler 返回值或迁移计划不算通过。  
   - 在 `tests/runtime/WritingComputationTests.md` 回填新维度：状态图变更类型（初始改名 / 非初始改名 / 增删节点）× 作用域 × bound state 所有权（输出路径拥有 / 不拥有）× rebuild 标志组合。  
   - 真实 PostgreSQL：迁移触及事务与 kill-resume，须在 `tests/runtime/postgresql*.spec.ts` 体系内补最小对照（至少一个状态映射场景），并按 `AGENTS.md` 的 env-gated 方式运行。PGLite 不作为多连接或崩溃恢复的完成证明。  
   - 回归：`migration.spec.ts`、`migrationGenerativeFuzz.spec.ts`、`migrationDestructiveFuzz.spec.ts`、`declarationTabooFuzz.spec.ts` 无新增失败；任务开始前已失败的检查以基线为准。

7. **文档与逃逸复盘**  
   - 在 `agent/agentspace/knowledge/usage/` 或 `agentspace/knowledge/`（现有目录中尚无迁移 handler 合约的正式文档，设计决定落点）写清：状态图变更时应用需要提供什么、框架如何校验、失败时的错误形态。  
   - 按 `AGENTS.md` § 修 bug 清单第 5 条，在 `agentspace/output/` 写一份逃逸分析：为什么现有迁移测试（含生成式套件）没有发现「迁移成功但后续交互静默无效」，并把结论落成机制（新的 oracle / 维度 / 不变量），不只是文字。

8. **范围边界与非目标**  
   - 不以合并或修补 PR #51 为目标；不得复制其测试文件作为本任务的设计结论（可以作为复现输入）。  
   - 不引入应用特定的状态名、兼容状态节点或「自动猜测映射」的启发式；映射必须由应用显式表达或由框架显式拒绝。  
   - 不重做迁移子系统的审批 / 破坏性 scope / kill-resume 机制；只在必要处扩展。  
   - 不为已经执行过错误迁移的存量数据库提供自动修复；可以在文档中说明如何用本任务交付的路径完成一次修复性迁移。  
   - 不改变运行期 StateMachine 的转移语义（`TransitionFinder`、`incrementalCompute`）；本任务是迁移期一致性。  
   - 不把本任务扩大为通用「bound state 迁移框架」；只交付让 StateMachine（及同族带状态的 event-based computation）在状态图变更下正确、并让 Transform 不被误伤所必需的部分。

请先完成设计，不要实施生产代码。任务特定说明：

- 任务输入（事实来源，不是设计结论）：
  - 生成时的评审报告：`agentspace/output/pr51-migration-state-rebuild-review-2026-09-17.md`（含机制 A–D 的证据、读者清单与探针描述）。
  - 上游 PR #51 及其 `tests/runtime/migrationStateRebuild.spec.ts`（`gh pr diff 51 --repo InteraqtDev/interaqt` 可取得）；其 `renamed=true` 两行在当前 `main` 上失败，是机制 A 的现成复现材料。生成时该 PR 未合并，仓库内没有它的任何改动。
- 调研入口（设计轮必读 / 复核，行号为生成时数值）：
  - `src/runtime/migration.ts`：`MigrationScheduler.run`（约 3644–3687）、`rebuildStateDefaults`（约 3762）、`runFullRecompute`（约 3711）、`recomputeTransformOutput`（约 3392，`existingByKey` 的键构造）、`writeComputationResult`（约 3249）、`buildRebuildPlan` 中 `rebuildState` / `rebuildOutput` 的计算（约 2408–2423）、diff 分类（约 1749–1800，`state-only` 分支在 1787）、`getChangedComputationsFromApprovedDiff`（约 2109）、`serializeState` / `stateSignature`（约 782–800、942）、`canonicalizeArgsForSignature`（约 885）、`MigrationEventRebuildHandler` / `MigrationHandlers` 类型（约 324–348）、`simulateCascadeDeletionScope`（约 3505，复用同一 scheduler）。
  - `src/runtime/computations/StateMachine.ts`：`createState`（global 154、property 213）、`incrementalCompute`（165、263）、`createStateData`（276）。
  - `src/runtime/computations/TransitionFinder.ts`：`findNextState` 对未知状态名的行为。
  - `src/runtime/computations/Transform.ts` `createState`（67）；`aggregationTemplate.ts` `compute` / `persistFullResult`（209、392）；`Custom.ts` `createState`（219）。
  - `src/runtime/computations/Computation.ts`：`RecordBoundState` / `GlobalBoundState`（`setInternal`、`defaultValue`）。
  - `src/runtime/Scheduler.ts` `getBoundStateName` / `createStates`（250–286）：bound state 列名与宿主记录的派生规则。
  - 测试：`tests/runtime/migration.spec.ts`（`state-only changes rebuild bound state without changing output`，约 4253，是现有 state-only 覆盖；文件内有 41 处 StateMachine 相关引用可作对照）、`migrationGenerativeFuzz.spec.ts`、`migrationDestructiveFuzz.spec.ts`、`postgresqlMigration*.spec.ts`；维度注册表 `tests/runtime/WritingComputationTests.md`。
  - 知识库：`agent/agentspace/knowledge/usage/`、`agentspace/knowledge/` 中目前**没有**迁移 handler 合约的正式文档（生成时 `rg eventRebuild` 无命中），设计需决定文档落点。
- 生成时调研摘要（设计阶段须复核，不得当作已定缺口）：
  - 机制 A：PR #51 测试在 `main` 上 2 失败 / 3 通过；套上其两行修复后 5 通过，`migration.spec.ts` 90 通过。
  - 机制 B：探针 `pending → approved → archived`，改名 `approved → accepted` 并提供输出转换 handler；diff 显示 `changeType: changed`、`stateSignatureChanged: false`；计划 `{ rebuildState: false, rebuildOutput: true }`；迁移后 `status='accepted'`、`currentState='approved'`；`Archive` dispatch 无 error 且无效。该结果在套用 PR #51 修复后依然成立。
  - 机制 D 为静态分析结论，尚无执行证据；设计阶段应构造一个能让 Transform 进入 `rebuildState` 为真的计划（例如测试专用地改变 `stateSignature` 输入）来实际观察。
  - `stateSignature = hash({ stateKeys, boundStates })`，`boundStates[i] = { key, scope, hostRecord, defaultSignature, valueType }`；状态图节点名集合只经 `argsSignature` 进入 `structuralSignature`。
- 方案方向（**仅供参考的候选，不是要求；设计可以采纳、组合、或提出更好的形态，但必须给出选择理由并覆盖要求 2–5**）：
  1. 扩展 event rebuild handler 的返回形态，允许同时返回输出值与 bound state（例如 `{ value, state: { currentState: 'accepted' } }`），由 `writeComputationResult` 经 `setInternal` 落盘；未返回 state 且状态图变化时拒绝。优点是复用现有 handler 通道；需处理 global 作用域与向后兼容的裸返回值。
  2. 在审批 diff 中增加专门的决策种类（例如 `state-mapping`），当状态图节点集合变化时由 diff 生成器要求它，`migrate()` 缺失即拒绝；映射表 `{ oldName: newName | null }` 由迁移调度器直接施加到 bound state。优点是审阅面显式、可与不变量共用同一合法集合；需要签名或分类能感知节点集合变化。
  3. 让 StateMachine 声明本身携带迁移元数据（例如 `StateNode` 的 `previousNames`），框架据此自动派生映射。优点是零 handler；缺点是把迁移历史留在运行期声明里，与「最小表面」和显式控制的取舍需要论证。
  4. 对要求 4，可考虑由各 computation handle 声明「哪些 bound state 由输出重建拥有」，或让 `rebuildStateDefaults` 只处理不在输出路径写入集合中的 state，或调整为输出重建之后再做状态重建——需对 Transform 与聚合分别验证。
- 设计阶段最小验证实验建议（可合并，但证据须按机制 A–D 归组）：
  1. 在当前 HEAD 重跑 PR #51 测试文件（不套用其源码修复）与机制 B 探针，记录基线输出。
  2. 用 `Custom` computation 声明一个 `RecordBoundState`，走一次 `changed` 决策的迁移，观察 bound state 是否被重建、由谁重建。
  3. 为 Transform 制造 `rebuildState && rebuildOutput` 计划，观察输出行数与 `sourceRecordId` 列。
  4. 直接向一条记录写入不在状态图中的 `currentState` 值，然后 `setup()` 与 `dispatch()`，确认今天没有任何检查能发现它（要求 3 的基线）。
- 会话后端：本任务全部后续会话使用 **ZCode**（`prompt/skill/new-zcode-session.md` / `new_zcode_session.sh`），启动参数 `-w "$(pwd)"`。
- 用户已要求在生成完成后立即启动 Task 1（由生成会话执行首个启动命令）。

执行本 Task 时：

1. 调研任务要求、项目规则、相关源码和测试。
2. 对会影响整体方案的未知事实执行最小验证实验。
3. 创建设计文档，初始化状态为 `设计中`、`design-round: 0/15`、`implementation-round: 0/0`、`current-milestone-reopens: 0`、`convergence-mode: normal`。
4. 建立里程碑，状态全部为 `开放`，`reopen-count: 0`、`reopen-domains` 为空。
5. 只完成设计和必要的验证实验，不编写生产实现。
6. 覆盖写入 `retro.md` 的运行标题和生成印记。
7. 不要执行下面任何 additional task。使用 `Please execute docs/migration-state-machine-state-remap/migration-state-machine-state-remap-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat，启动参数：`-w "$(pwd)"`。**

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
5. 覆盖写入 `docs/migration-state-machine-state-remap/migration-state-machine-state-remap-review.md`，结论只能是：
   - `通过`
   - `需要修订`
   - `目标不可实现`
6. 不修改设计文档。
7. 使用 `Please execute docs/migration-state-machine-state-remap/migration-state-machine-state-remap-task.md Task 1 additional task 2.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat，启动参数：`-w "$(pwd)"`。**

### additional task 2

你是设计裁决者。深度理解 Task 1 和原设计 `docs/migration-state-machine-state-remap/migration-state-machine-state-remap.md`，然后逐条核验 `docs/migration-state-machine-state-remap/migration-state-machine-state-remap-review.md` 中的问题，不得直接接受评审结论。遵守「设计复审条件」及以下流程：

1. 对每个问题复核证据和复审类别。
2. 采纳问题时，按同一根因检查相关设计和代码范围，并一次修正全部同类位置。
3. 驳回问题时，给出源码、测试、项目规则或逻辑推演证据。
4. 对第二次出现问题的同一设计领域，按「设计复审条件」的要求改用完整、有限的表达形式。
5. 更新设计文档，并执行所有设计期验收命令和最小验证实验。
6. `d` 增加 1；向 `retro.md` 追加一行：轮次、评审结论、采纳的问题类别、主要证据和下一步。
7. 按顺序评估并执行（只走命中的第一条分支）：
  - 若有充分证据证明 Task 的核心目标在当前技术、权限或运行环境下不可实现：设置 `status: 不可实现`，在 `retro.md` 写明证据。终止，不启动新的 chat。
  - 若本轮没有采纳任何「需要复审的问题」：设计通过。设置 `status: 实现中`，以初始里程碑数计算 `N = 5 × M`，然后使用 `Please execute docs/migration-state-machine-state-remap/migration-state-machine-state-remap-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat，启动参数：`-w "$(pwd)"`。**
  - 若有采纳问题且 `d < 15`：使用 `Please execute docs/migration-state-machine-state-remap/migration-state-machine-state-remap-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat，启动参数：`-w "$(pwd)"`。**
  - 若 `d = 15`：完成一次全局修订和六类条件自检。不存在已知阻塞问题时按上面的设计通过分支进入实现；仍存在已知阻塞问题时设置 `status: 协议失败`，记录原因。终止，不启动新的 chat。不得自行提高预算或要求用户选择方案。

### additional task 3

你是实现者。深度理解并实施 `docs/migration-state-machine-state-remap/migration-state-machine-state-remap.md`。你是实现循环中的**实现轮**，与 additional task 4 的**审计轮**交替执行。严格遵守以下流程：

1. 首先读取 `next-action`。内容不是「无」时，必须先完成该项工作；只有证据证明它不再适用时才可改写。若 `convergence-mode` 不是 `normal`，还必须先读取当前审计文件的 `Convergence Note`，按其 `Next implementation batch` 顺序推进。
2. 只推进编号最小的未完成里程碑。完成该里程碑所必需的测试、脚本、环境配置和缺陷修复均属于本轮范围。
3. 优先复用项目测试体系。修复真实缺陷时，先建立能够失败的复现，再修复并运行通过。
4. 实现中发现设计事实错误时，可以修订当前及后续未完成里程碑、拆分或重排工作，但不得删除 Task 要求，不得增加总预算 `N`。
5. 执行当前里程碑的验收。通过时标记为 `待审`并记录命令、结果和证据；未通过时保持 `开放`并记录具体阻塞。收敛模式下必须先通过 `Convergence Note` 的全部 Closure gates，不能以只完成部分批次为由标记`待审`。
6. 执行受本轮修改影响的项目基础检查。任务开始前已经失败的检查以基线记录为准；不得新增失败，也不得以同名旧失败掩盖不同的新原因。
7. `k` 增加 1，更新 `implementation-round: k/N`。
8. 不得把里程碑标记为 `已完成`。
9. 本轮结束时**一律**使用 `Please execute docs/migration-state-machine-state-remap/migration-state-machine-state-remap-task.md Task 1 additional task 4.` 作为 prompt 启动新的 chat（无论你认为完成与否，都交给审计轮判定，不再自行连续启动 additional task 3）。只要启动就可以结束，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat，启动参数：`-w "$(pwd)"`。**

### additional task 4

你是独立实现审计者。深度理解 `docs/migration-state-machine-state-remap/migration-state-machine-state-remap.md` 并对实现进行对抗性 review。你是实现循环中的**审计轮**，与 additional task 3 的**实现轮**交替执行。不得信任里程碑状态或实现者的结论。按以下顺序执行：

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
9. 覆盖写入 `docs/migration-state-machine-state-remap/migration-state-machine-state-remap-audit.md`。
10. 按审计结论更新状态：
  - 验收通过且没有实现缺陷：将 `待审`里程碑标记为 `已完成`，`next-action` 写「无」。
  - 存在实现缺陷：将里程碑标记为 `开放`；若原状态为`待审`则增加 reopen 计数。普通模式在 `next-action` 写明具体修改、失败命令、涉及位置和完成条件；收敛模式则令 `next-action` 指向 `Convergence Note` 的下一实施批次。
  - 当前里程碑原本为 `开放`且实现轮未取得通过：给出明确诊断和下一步，不得只写一般性建议。
11. 按顺序评估并执行（只走命中的第一条分支）：
  - 全部里程碑已完成：执行一次最终核验（全部里程碑验收命令、Task 要求逐项检查以及项目要求的基础测试）。全部通过后设置 `status: 已完成`，按「运行记录」完成 `retro.md`。终止，不启动新的 chat。
  - 未完成且 `k < N`：使用 `Please execute docs/migration-state-machine-state-remap/migration-state-machine-state-remap-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat，启动参数：`-w "$(pwd)"`。**
  - 未完成且 `k >= N`：若有证据证明核心目标不可实现，设置 `status: 不可实现`；否则设置 `status: 协议失败`。按「运行记录」完成 `retro.md`。终止，不启动新的 chat。不得自行增加预算或要求用户决定下一步。
