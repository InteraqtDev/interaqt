<!-- generated-by: cyclic-task-prompt | template-sha256: 6cfe19e4e81c | generated-at: 2026-08-11 -->
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

- 设计文档：`docs/property-type-extension/property-type-extension.md`
- 设计评审：`docs/property-type-extension/property-type-extension-review.md`
- 实现审计：`docs/property-type-extension/property-type-extension-audit.md`
- 运行记录：`docs/property-type-extension/retro.md`

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

## Task 1 可扩展属性类型注册与原生列契约

### 背景

应用侧在声明 `Property` / `Dictionary` 时使用数据库插件类型（典型如 PostgreSQL + pgvector 的 `type: 'vector'`）会在声明期被拒绝。此前同类写法有时能“碰巧可用”，是因为未知 `type` 字符串会静默落到各驱动 `mapToDBFieldType` 的 fallback（原样拼进 DDL）；r23 起框架在 `Property.create` / `Dictionary.create` 对类型做白名单校验后，该旁路被关闭。

当前主干（生成时调研摘要，设计阶段须用源码与最小实验复核，不得仅复述本段）：

- 允许的逻辑类型封闭在 `ALLOWED_PROPERTY_TYPES` / `PropertyTypes`：`string`、`number`、`boolean`、`timestamp`、`object`、`id`，以及别名 `json`（`src/core/RealDictionary.ts`）。
- `Property.create` / `Dictionary.create` 对不在白名单内的 `type` 抛 `unsupported type "..."`（`src/core/Property.ts`、`src/core/RealDictionary.ts`；回归 `tests/runtime/review-fixes-2026-07-12-r23.spec.ts`）。
- 四驱动 `mapToDBFieldType` 对未识别逻辑类型仍保留 `else { return type }` 透传形态（`src/drivers/PostgreSQL.ts`、`PGLite.ts`、`SQLite.ts`、`Mysql.ts`），但该路径对用户声明已不可达；对框架内部或错误路径仍构成“偶然 DDL”风险。
- `type` 不只影响建表：还进入写路径值准备（`SQLBuilder.prepareFieldValue`）、Match 编译与方言入口（`MatchExp` / `parseMatchExpression`）、migration 的 `type`/`fieldType` 签名（`src/runtime/migration.ts`）以及读归一化等。任意字符串重新成为合法 `type` 会再次打穿类型系统。
- 仓库内**没有**一等公民的属性类型扩展注册表、`definePropertyType`、按 driver 声明的 storage codec，或“逻辑类型 / 物理列型”分离的公开扩展模型。用户装了数据库插件却无法在保持声明严谨的前提下合法使用插件列类型。
- 框架原则（`AGENTS.md`）：显式控制、禁止隐式默认与“魔法”补全；依赖方向 `builtins → runtime → storage → core`；跨 SQLite / PostgreSQL / PGLite / MySQL 的行为必须可预测。框架不可能、也不应该在 core 内置全部数据库插件类型。

本任务要解决的不是“把 `vector` 硬编码进白名单”，也不是“恢复静默放行”，而是：

> 在保持内置语义类型封闭与 fail-fast 的前提下，提供严谨、可扩展、driver-aware 的属性类型扩展机制，使应用/适配包能合法声明并使用数据库插件列（以 pgvector 类场景为规范证明），同时明确未注册能力的失败边界。

### 要求

1. **求证问题与现状（硬前置）**  
   设计阶段用源码、现有测试与最小验证实验确认：  
   - 未知 `type`（如 `vector`）在声明期被拒绝的精确错误与调用栈入口；  
   - r23 白名单引入前后的行为差异（至少对照回归测试与 `mapToDBFieldType` fallback 代码路径）；  
   - `type` 在 setup DDL、写路径、Match、migration 签名中的全部主要读者列表；  
   - 是否已存在任何半成品扩展点（注册表、`sqlType`、column override 等）。  
   证据写入设计文档；不得仅复述本 Task 背景。

2. **封闭默认 + 显式扩展（硬约束）**  
   - **内置逻辑类型**保持封闭白名单；拼写错误（`strng`、`String`、`vectr` 等）必须在声明期或等价的最早安全点 fail-fast，错误信息须列出合法内置类型并指向扩展注册路径（若适用）。  
   - **禁止**将“任意字符串 `type` 原样进 DDL”恢复为默认或推荐行为。  
   - **禁止**仅在 core 白名单硬编码个别插件类型（如只加 `vector`）作为本任务的最终方案——那把生态写死进框架，无法覆盖用户自定义 plugin。  
   - 扩展类型必须通过**显式注册**进入类型系统；未注册名称不得被当成合法 Property/Dictionary type。

3. **一等扩展模型：语义类型与物理能力分离**  
   提供官方、可文档化的属性类型扩展机制，满足：  
   - **逻辑/语义名**（应用在 `Property.create({ type, args? })` 上书写的名字）与 **物理 DDL / 驱动绑定** 分离；core 不依赖具体 SQL 方言字符串作为唯一真相。  
   - 扩展定义至少能表达（命名可议，语义必须齐全）：  
     - 类型名与可选 `args` 契约（如维度）；  
     - **按 driver（或 driver 能力族）** 的 storage：DDL 生成、`toDB` / `fromDB`（或等价编解码）；  
     - 当前 driver **未提供 storage** 时，setup/绑定阶段明确失败，不得静默降级为 TEXT/JSON/透传字符串；  
     - 可选的 Match/查询算子扩展；**未注册算子不得 silently 生成错误 SQL**，应在编译/setup 期失败或给出明确不支持错误；  
     - 扩展默认按 **opaque** 处理：框架不对未知内部结构做“聪明”变换，除非注册了 codec。  
   - 依赖方向：扩展机制不得迫使 `core` 依赖 `drivers`；注册与解析的层次划分须符合 `builtins → runtime → storage → core`。  
   - API 应适合放在应用启动代码或独立适配包（例如未来的 pgvector adapter），而不是要求改框架源码才能增加一种插件列。

4. **绑定与生命周期闸门**  
   - 声明模块可能早于具体 `Database` 实例创建：设计须明确 **create 时** 与 **setup/绑定当前 driver 时** 各自校验什么。  
   - 至少在绑定当前数据库时保证：每个已使用的扩展类型对该 driver 可解析 storage，否则失败信息指明类型名、实体/属性、当前 driver，以及“去注册 storage / 换 driver / 改用内置类型”的配置动作。  
   - 四驱动 `mapToDBFieldType`（或其后继解析入口）对**未解析**类型不得再默认 `return type`；未解析即错误。若保留任何高级逃生口，必须是显式、可发现、默认可关闭/非默认的，且不得与“拼写错误静默进 DDL”不可区分。

5. **读写、查询、迁移合同**  
   - **读写往返**：经注册 codec 的扩展类型，create/update/find 路径上值往返符合注册定义；无 codec 时行为须在文档与测试中写成明确合同（拒绝或受限 opaque），不得每条路径不一致。  
   - **Match**：仅开放注册的算子；内置 json/timestamp 等语义不得被扩展机制破坏（沿用 r25 方言自洽纪律：驱动必须识别自己产出的 fieldType 形态）。  
   - **Migration**：扩展类型的 `type`、`args`、解析后的物理 `fieldType`（及必要的类型版本）须进入可判定的签名/变更分类；同名同契约兼容，DDL/契约变化须可被迁移引擎识别为变更而非静默漂移。  
   - 触及声明面时枚举全部读者（Property、Dictionary、Setup、SQLBuilder、MatchExp、migration、公开导出、知识库），在汇合点修复，避免只修 create 白名单一条路径。

6. **规范证明：插件列场景（pgvector 类）**  
   本任务不要求把 pgvector 做成框架内置必装依赖，但必须用**可运行的规范证明**展示扩展模型足够用：  
   - 通过扩展 API 注册一种向量类类型（可在测试内 mock/最小实现，或可选真实 PG + 扩展；设计选定一种并写清环境门控）；  
   - 应用声明 `Property.create({ name, type: <registered>, args: … })` 不再被白名单误杀；  
   - 在**声明支持该类型的 driver** 上完成 setup + 写入 + 读回（往返）；  
   - 在**未注册 storage 的 driver** 上 setup/绑定失败且错误可行动；  
   - 未注册类型名、错误 args、未支持 match 算子等负向合同。  
   真实 PostgreSQL 相关证明在具备 `INTERAQT_POSTGRES_DATABASE` 时应可跑；环境不可用不得把依赖该环境的里程碑标为完成。不得用“只在文档里写个 vector 示例、测试未执行绑定”充当完成。

7. **公开教义与破坏性收敛**  
   - 更新 usage / API 参考（及必要时 generator、CHANGELOG）：说明内置类型列表、如何注册扩展类型、driver 不支持时的行为、opaque 默认语义。  
   - **删除或明确禁止**将“任意 `type` 字符串当 SQL 类型透传”描述为可用技巧。  
   - 本仓库与下游在可控范围内：**允许**为清晰终态做破坏性收敛（例如去掉未解析 fallback）；**禁止**长期双轨（一边白名单、一边文档教人靠 fallback）。  
   - 临时用 `object`/`json` 存 embedding 可作为迁移期应用策略写在升级说明中，但不得升格为“插件列的最终官方模型”。

8. **交付与验证纪律**  
   - 优先 Vitest 既有分层：`tests/core`（声明校验）、`tests/storage`（DDL/写读/Match 方言）、`tests/runtime`（setup 绑定、migration 签名）；驱动相关用匹配方言的探针。  
   - 变更后按需 `npm run check`、相关 test；触及公开导出保持类型与文档一致。  
   - 遵守 `AGENTS.md`：修一类而非实例；汇合点修复；已知规则提升为可执行不变量；书面语言使用准确技术术语与完整句子。  
   - 第一个可验证里程碑应尽早打通「注册 → 声明 → 绑定 → DDL/往返或明确失败」最小闭环，再展开 Match/migration/文档。

9. **范围边界**  
   - **非目标**：在 core 内置全部数据库插件；实现完整的 ANN 索引调优产品；把框架改成通用 DDL 生成器；为 MySQL 伪造 vector 语义；恢复静默放行；仅加 `sqlType` 字符串透传而无注册/codec/driver 作用域作为最终扩展体系。  
   - 裸 column override / 单次 SQL 片段若作为高级逃生口，不得替代主扩展模型，且须在设计中论证不会重新打穿类型系统。  
   - 不在本仓库实现具体业务应用改造；本任务是框架扩展面、驱动接合、文档与测试。  
   - 不重做 Condition/BT/身份模型等已另立任务主题。

10. **无历史兼容负担（硬约束）**  
    不得以“旧应用写了 `type:'vector'` 曾能过”为由恢复默认透传。合法路径是：注册扩展类型或改用内置类型。评审若发现方案用静默 fallback、全局任意字符串、或 core 硬编码单个 plugin 冒充扩展性，按违反本任务目标与项目原则处理。


请先完成设计，不要实施生产代码。任务特定说明：

- 触发问题：应用使用 `type: 'vector'`（及同类数据库插件类型）在 r23 类型白名单后声明失败；用户希望在不内置全部 DB plugin 的前提下保持框架严谨与可扩展。
- 生成前已达成的方向性共识（**供设计求证与细化，不是不可修改的实现说明书**；若源码证据否定某细节，设计可调整，但不得退回“静默放行”或“只 hardcode vector”）：  
  1. 内置语义类型封闭；  
  2. 主方案为 **definePropertyType（或等价）注册表**：语义名 + args + per-driver storage/codec + 可选 match；  
  3. setup/绑定当前 driver 为能力闸门；未解析类型错误化 `mapToDBFieldType` fallback；  
  4. 扩展默认 opaque；  
  5. 用 pgvector 类场景做规范证明，插件实现可在测试/外部适配包，而非 core 必装。  
- 调研入口（设计轮必读/复核）：  
  - `src/core/RealDictionary.ts` — `PropertyTypes`、`ALLOWED_PROPERTY_TYPES`  
  - `src/core/Property.ts` — create 白名单与错误文案  
  - `src/builtins/interaction/PayloadItem.ts` — 另一处 type 白名单（是否纳入同一扩展模型须论证）  
  - `src/runtime/System.ts` — `Database.mapToDBFieldType` 等驱动接口  
  - `src/storage/erstorage/Setup.ts` — 属性 → `fieldType` / DDL  
  - `src/storage/erstorage/SQLBuilder.ts` — `prepareFieldValue`  
  - `src/storage/erstorage/MatchExp.ts`、各驱动 `parseMatchExpression`  
  - `src/runtime/migration.ts` — type/fieldType 变更检测  
  - `src/drivers/{PostgreSQL,PGLite,SQLite,Mysql}.ts` — `mapToDBFieldType` fallback  
  - 测试：`tests/runtime/review-fixes-2026-07-12-r23.spec.ts`、`tests/storage/driverDialectConsistency.spec.ts`、`tests/runtime/postgresqlJsonMatch.spec.ts`  
  - 历史：`agentspace/output/deep-review-2026-07-12-r23.md`、`deep-review-2026-07-12-r25.md`（json fieldType 方言分裂）、`deep-review-2026-07-08-r2.md`（早期 type 白名单建议）  
- 设计阶段最小验证实验建议：  
  1. `Property.create({ name: 'embedding', type: 'vector' })` 断言当前精确错误；  
  2. 列出 `type`/`fieldType` 从 create → Setup → 写/读/Match/migration 的读者表；  
  3. 若尝试“只改白名单加 vector、不改 codec”，用最小实验说明跨驱动与 Match/migration 仍无合同（作为否决纯 hardcode 方案的证据）。  
- PayloadItem.type 与 Property.type 是否共用扩展注册表：设计必须明确决策（共用或显式排除及理由），避免一侧可扩展、一侧永久分叉且无文档。  
- 会话后端：本任务使用 **ZCode**（`prompt/skill/new-zcode-session.md` / `new_zcode_session.sh`）启动后续独立会话。


执行本 Task 时：

1. 调研任务要求、项目规则、相关源码和测试。
2. 对会影响整体方案的未知事实执行最小验证实验。
3. 创建设计文档，初始化状态为 `设计中`、`design-round: 0/15`、`implementation-round: 0/0`、`current-milestone-reopens: 0`、`convergence-mode: normal`。
4. 建立里程碑，状态全部为 `开放`，`reopen-count: 0`、`reopen-domains` 为空。
5. 只完成设计和必要的验证实验，不编写生产实现。
6. 覆盖写入 `retro.md` 的运行标题和生成印记。
7. 不要执行下面任何 additional task。使用 `Please execute docs/property-type-extension/property-type-extension-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**

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
5. 覆盖写入 `docs/property-type-extension/property-type-extension-review.md`，结论只能是：
   - `通过`
   - `需要修订`
   - `目标不可实现`
6. 不修改设计文档。
7. 使用 `Please execute docs/property-type-extension/property-type-extension-task.md Task 1 additional task 2.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**

### additional task 2

你是设计裁决者。深度理解 Task 1 和原设计 `docs/property-type-extension/property-type-extension.md`，然后逐条核验 `docs/property-type-extension/property-type-extension-review.md` 中的问题，不得直接接受评审结论。遵守「设计复审条件」及以下流程：

1. 对每个问题复核证据和复审类别。
2. 采纳问题时，按同一根因检查相关设计和代码范围，并一次修正全部同类位置。
3. 驳回问题时，给出源码、测试、项目规则或逻辑推演证据。
4. 对第二次出现问题的同一设计领域，按「设计复审条件」的要求改用完整、有限的表达形式。
5. 更新设计文档，并执行所有设计期验收命令和最小验证实验。
6. `d` 增加 1；向 `retro.md` 追加一行：轮次、评审结论、采纳的问题类别、主要证据和下一步。
7. 按顺序评估并执行（只走命中的第一条分支）：
  - 若有充分证据证明 Task 的核心目标在当前技术、权限或运行环境下不可实现：设置 `status: 不可实现`，在 `retro.md` 写明证据后终止，不启动新的 chat。
  - 若本轮没有采纳任何「需要复审的问题」：设计通过。设置 `status: 实现中`，以初始里程碑数计算 `N = 5 × M`，然后使用 `Please execute docs/property-type-extension/property-type-extension-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**
  - 若有采纳问题且 `d < 15`：使用 `Please execute docs/property-type-extension/property-type-extension-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**
  - 若 `d = 15`：完成一次全局修订和六类条件自检。不存在已知阻塞问题时按上面的设计通过分支进入实现；仍存在已知阻塞问题时设置 `status: 协议失败`，记录原因并终止，不启动新的 chat。不得自行提高预算或要求用户选择方案。

### additional task 3

你是实现者。深度理解并实施 `docs/property-type-extension/property-type-extension.md`。你是实现循环中的**实现轮**，与 additional task 4 的**审计轮**交替执行。严格遵守以下流程：

1. 首先读取 `next-action`。内容不是「无」时，必须先完成该项工作；只有证据证明它不再适用时才可改写。若 `convergence-mode` 不是 `normal`，还必须先读取当前审计文件的 `Convergence Note`，按其 `Next implementation batch` 顺序推进。
2. 只推进编号最小的未完成里程碑。完成该里程碑所必需的测试、脚本、环境配置和缺陷修复均属于本轮范围。
3. 优先复用项目测试体系。修复真实缺陷时，先建立能够失败的复现，再修复并运行通过。
4. 实现中发现设计事实错误时，可以修订当前及后续未完成里程碑、拆分或重排工作，但不得删除 Task 要求，不得增加总预算 `N`。
5. 执行当前里程碑的验收。通过时标记为 `待审`并记录命令、结果和证据；未通过时保持 `开放`并记录具体阻塞。收敛模式下必须先通过 `Convergence Note` 的全部 Closure gates，不能以只完成部分批次为由标记`待审`。
6. 执行受本轮修改影响的项目基础检查。任务开始前已经失败的检查以基线记录为准；不得新增失败，也不得以同名旧失败掩盖不同的新原因。
7. `k` 增加 1，更新 `implementation-round: k/N`。
8. 不得把里程碑标记为 `已完成`。
9. 本轮结束时**一律**使用 `Please execute docs/property-type-extension/property-type-extension-task.md Task 1 additional task 4.` 作为 prompt 启动新的 chat（无论你认为完成与否，都交给审计轮判定，不再自行连续启动 additional task 3）。只要启动就可以结束，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**

### additional task 4

你是独立实现审计者。深度理解 `docs/property-type-extension/property-type-extension.md` 并对实现进行对抗性 review。你是实现循环中的**审计轮**，与 additional task 3 的**实现轮**交替执行。不得信任里程碑状态或实现者的结论。按以下顺序执行：

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
9. 覆盖写入 `docs/property-type-extension/property-type-extension-audit.md`。
10. 按审计结论更新状态：
  - 验收通过且没有实现缺陷：将 `待审`里程碑标记为 `已完成`，`next-action` 写「无」。
  - 存在实现缺陷：将里程碑标记为 `开放`；若原状态为`待审`则增加 reopen 计数。普通模式在 `next-action` 写明具体修改、失败命令、涉及位置和完成条件；收敛模式则令 `next-action` 指向 `Convergence Note` 的下一实施批次。
  - 当前里程碑原本为 `开放`且实现轮未取得通过：给出明确诊断和下一步，不得只写一般性建议。
11. 按顺序评估并执行（只走命中的第一条分支）：
  - 全部里程碑已完成：执行一次最终核验（全部里程碑验收命令、Task 要求逐项检查以及项目要求的基础测试）。全部通过后设置 `status: 已完成`，按「运行记录」完成 `retro.md` 并终止，不启动新的 chat。
  - 未完成且 `k < N`：使用 `Please execute docs/property-type-extension/property-type-extension-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**
  - 未完成且 `k >= N`：若有证据证明核心目标不可实现，设置 `status: 不可实现`；否则设置 `status: 协议失败`。按「运行记录」完成 `retro.md` 后终止，不启动新的 chat。不得自行增加预算或要求用户决定下一步。
