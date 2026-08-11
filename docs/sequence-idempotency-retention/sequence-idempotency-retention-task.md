<!-- generated-by: cyclic-task-prompt | template-sha256: 6cfe19e4e81c | generated-at: 2026-08-10 -->
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

- 设计文档：`docs/sequence-idempotency-retention/sequence-idempotency-retention.md`
- 设计评审：`docs/sequence-idempotency-retention/sequence-idempotency-retention-review.md`
- 实现审计：`docs/sequence-idempotency-retention/sequence-idempotency-retention-audit.md`
- 运行记录：`docs/sequence-idempotency-retention/retro.md`

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

## Task 1 连续票号、幂等回放判别与声明式实体保留

### 背景

框架主干在三类真实应用场景上仍缺一等原语，导致业务只能用临时逃逸（循环单值分配、手扫 `effects`、手写 prune）完成语义。问题陈述输入（任务输入，非已定设计）：

`prompt/remaining-framework-gaps-seq-idem-retention.md`

三条需求相互独立，可分期交付；**只实现一半不算对应 ID 完成**。

| ID | 标题 | 建议优先级 | 一句话 |
|----|------|------------|--------|
| **FR-SEQ-01** | 原子连续区间票号 | P0 | 同一存储事务内按 scope 一次预留长度 N 的连续序号区间，供 Transform 等写出多行 |
| **FR-IDEM-01** | 一等幂等回放判别 | P1 | `dispatch` 结果显式区分首次生效与幂等回放，无需手扫 `effects` |
| **FR-RET-01** | 声明式实体保留 / TTL | P1 | 实体可声明按条数或时间的有界保留；框架在安全点修剪 |

生成时调研摘要（设计阶段须用源码、现有测试与最小实验复核，不得仅复述问题陈述）：

- **序号**：属性级 `ScopedSequence` 与 `storage.atomic.nextSequenceValue` 按 scope 分配**单个**值（`src/runtime/computations/ScopedSequence.ts`、`src/runtime/System.ts` `AtomicSequenceTarget` / `nextSequenceValue`、`src/runtime/MonoSystem.ts`）。未见 `reserveSequenceRange` 或等价「一次预留 N」公开 API；文档将 `ScopedSequence` 定位为宿主记录创建时的单值序号（`agent/agentspace/knowledge/usage/14-api-reference.md`、`20-postgresql-concurrency-migration.md`）。
- **幂等回放**：`DispatchResponse` 当前字段为 `error` / `data` / `effects` / `sideEffects` / `context`（`src/runtime/Controller.ts`），**无** `outcome: 'applied' | 'replayed'`（或等价）一等字段。仓库中 “idempotency” 相关测试多指 driver open/close 或唯一约束形状，而非 interaction 级幂等回放合同。
- **保留**：`Controller.cleanupAsyncTasks` 仅清理异步任务终态行（`applied` / `skipped`），有契约测试 `tests/runtime/asyncTaskRetention.spec.ts`；未见任意实体的声明式 `retainLatest` / TTL 机制。
- 已交付且**不得**在本任务重复立项：声明式 Condition 准入锁 / `AdmissionSnapshot`、`runInBusinessTransaction`、Condition 结果代数、单一逻辑 `id` / create-time id、`Interaction.postCommit`、非 BT 事务内 dispatch 路径强制（见 `docs/tx-dispatch-path-uniqueness/` 等）。

### 要求

1. **求证问题是否存在（硬前置）**  
   在设计阶段用源码、现有测试与最小验证实验，分别求证 **FR-SEQ-01**、**FR-IDEM-01**、**FR-RET-01** 所描述的缺口是否在当前主干真实存在。  
   - 对「存在」的结论：给出可复现证据（失败/缺失的合同测试、精确到文件与行为的 API 表面、或最小实验输出）。  
   - 对「不存在 / 已有官方路径」的结论：给出反证，并将对应子需求从实现范围中明确关闭（不得假装仍要交付）。  
   - 不得仅复述 `prompt/remaining-framework-gaps-seq-idem-retention.md` 的叙述作为证据。  
   - 若部分 ID 已不存在缺口，其余 ID 仍须按本任务交付；关闭项须在设计文档与 `retro.md` 中写明证据。

2. **FR-SEQ-01 — 原子连续区间票号**  
   若求证确认缺口存在，提供官方、可文档化的路径，使同一存储事务内可按业务 scope **一次预留长度为 N 的连续序号区间**，供 Transform / Custom computation / 官方 helper 写出多行；业务**不得**依赖方言 `UPDATE … RETURNING` 或把循环 N 次 `nextSequenceValue` 文档化为最终官方模式。  
   须同时满足：  
   - **Scope**：与现有 `ScopedSequence` / atomic 计数通道同族或明确扩展；API 必须表达「区间」。  
   - **原子性**：`reserve(scope, n)` 与随后写入共享提交边界；并发两次 reserve 得到的区间不相交。  
   - **连续性（gapless 合同下）**：成功预留区间内部无空洞；是否允许因事务回滚产生全局间隙须在文档写清（可与现有「回滚可产生 sequence gap」政策对齐），但**成功提交的多行之间**不得有洞。  
   - **可用性**：不限于给某个 `Property.computation` 赋单个数。  
   - **无需方言 SQL**：业务代码不手写 driver 专用序号更新。  
   验收硬约束：  
   - **并发合同（真实 PostgreSQL，双连接）**：同一 scope 上并发 `reserve(…, n=10)` 与 `reserve(…, n=7)`，区间不相交；各自事务内用这些序号插入的行在 `(scope, seq)` 唯一约束下全部成功。  
   - **单次多行**：一次 dispatch 的 Transform 写出 N 行（N 由载荷决定，N>1），序号为连续区间；合同测试断言 `max(seq)-min(seq)+1 === N` 且无缺失。  
   - 官方文档示例完成上述场景时**零**业务侧方言 SQL。  
   - PGLite / 单连接不得单独充当并发完成证明。  
   非目标：不要求跨 scope 全局无空洞；不替代属性级单值 `ScopedSequence`；不要求框架理解「变更日志」业务形态；不把应用自建 counter 表 + 裸 SQL 升格为推荐写法。

3. **FR-IDEM-01 — 一等幂等回放判别**  
   若求证确认缺口存在，提供稳定、可文档化的官方路径，使调用方在**单次** `dispatch` 结果上区分「首次生效」与「幂等回放」，**无需**扫描 `effects`、无需二次查库或重跑 Condition。  
   可选形态（择一或可组合，但须单一明确方案）：  
   - `DispatchResponse` 一等字段（例如 `outcome: 'applied' | 'replayed'`，命名可议），在声明了幂等键或官方 idempotency 参与者时由框架填充；或  
   - 官方幂等回执 API：interaction / 实体声明幂等键路径；框架保证同键二次 dispatch 走回放分支并在结果中显式标记。  
   无论哪种：  
   - 回放不得重复产生对外可观察的重复副作用（与现有幂等教义一致）；若业务仍写回执实体，须定义回放时是否跳过 create、或唯一约束吸收后仍标为 `replayed`。  
   验收硬约束：  
   - 合同测试：同一幂等键连续两次成功 `dispatch` → 第一次 `applied`（或等价），第二次 `replayed`（或等价）；领域可观察状态与首次一致（无双份业务行，或按声明的唯一键冲突被正确吸收）。  
   - 调用方**不**读取 `effects` 即可完成判别（测试中禁止以 `effects` 作为断言来源）。  
   - 文档给出声明幂等键 + 读取结果字段的最小示例。  
   非目标：不规定业务回执实体字段形状；不要求所有 interaction 默认幂等；不把「扫描 `effects`」文档化为推荐最终方案；不在本需求内重做分布式 exactly-once 消息系统。

4. **FR-RET-01 — 声明式实体保留 / TTL**  
   若求证确认缺口存在，使实体（或明确支持的 append-only / 日志类实体）可声明保留策略，例如：  
   - **按条数**：每个分区键保留最新 N 条（按时间戳或单调序号排序）；  
   - **按时间**：超过 TTL 的行可删；  
   - 或二者组合（先 TTL，再 cap）。  
   框架在**安全点**执行修剪（候选：成功 commit 后的维护阶段、显式 maintenance API、或受控后台步）。须保证：  
   - 与正在进行的读（增量 feed）有清晰隔离或快照合同，避免读者看到撕裂的序号流（或文档明确允许的可见性）。  
   - 业务默认路径**无需**手写 `storage.delete` 修剪循环。  
   - 永久账本类实体可声明 `retain: forever` / 不声明 retention，默认不删。  
   验收硬约束：  
   - 合同测试：某分区连续产生 `M` 条回执（`M > N`），声明 `retainLatest: N` 后，稳定状态下该分区行数 ≤ N，且保留的是最新 N 条（按声明排序键）。  
   - TTL 合同：写入后拨钟 / 注入过期时间戳，维护步之后过期行不存在、未过期行仍在。  
   - 官方示例与文档完成上述场景时业务侧无手动 `storage.delete` 修剪循环。  
   - 负向：未声明 retention 的实体不被该机制删除。  
   非目标：不内置对象存储 / 外部 blob 的 GC（属 post-commit 外部副作用）；不替代用户显式领域「归档 / 硬删除」interaction；不要求在 Condition 内做修剪；不把「每个模块手写 prune」升格为推荐模式。不要求 `cleanupAsyncTasks` 被替换，但须厘清二者边界（任务终态 vs 任意实体保留）。

5. **与现有能力的关系**  
   - 优先复用并正当扩展已有 atomic 序号通道、`_ScopedSequence_` / 迁移清单、`DispatchResponse`、唯一约束、事务与真实 PG 并发基建，而不是另起平行协议。复用机制不等于保留过时调用形态；见要求 8。  
   - 触及公开 API、迁移签名、computation 声明面时，枚举全部读者（data track、event track、migration、公开导出），在汇合点修复，避免只修一条路径。  
   - 不得把问题陈述中已排除的已交付能力（准入锁、BT、Condition 代数、id 模型、postCommit、dispatch 路径强制）重新设计一遍。  
   - 与进行中的 `docs/tx-dispatch-path-uniqueness/` 等任务：若工作树存在并行改动，本任务实现须与主干事务/dispatch 合同兼容，不得引入新的灰色路径。

6. **交付与验证纪律**  
   - 三个 FR 可分期；每个 ID 的验收标准必须可独立执行；只实现一半不算该 ID 完成。建议落地顺序 **FR-SEQ-01 → FR-IDEM-01 → FR-RET-01**（仅为风险提示，设计可在求证后调整分期，但不得合并导致验收不可分）。  
   - 优先使用项目既有 Vitest / `test:postgres` 体系；新增测试挂在 runtime（及必要时 storage）合适位置。  
   - FR-SEQ-01 的真实 PostgreSQL 双连接并发合同必须在具备 `INTERAQT_POSTGRES_DATABASE` 的环境中跑绿；环境不可用时不得将对应里程碑标为完成。PGLite / 单连接不得单独充当该并发证明。  
   - 变更后按需执行 `npm run check` / 相关 runtime·storage 测试；触及公开 API 时保持类型导出、知识库 usage/generator 与 CHANGELOG（若适用）一致。  
   - 遵守 `AGENTS.md`：修一类而非一个实例；汇合点修复；已知规则提升为可执行不变量；书面语言使用准确技术术语与完整句子。

7. **范围边界**  
   - 不在本仓库实施具体业务应用（如 Mesh）的改造；本任务是框架能力：声明、runtime、storage 暴露面、文档与测试。  
   - 不处理 Condition 准入锁、业务事务可见性、实体身份模型等已另立任务的主题。  
   - 不把「应用侧临时 SQL / 手扫 effects / 手写 prune」升格为长期推荐教义；并见要求 8：落地后须从官方教义中删除，而非长期软降级并存。


8. **无历史兼容负担（硬约束）**  
   本仓库与全部下游应用代码均在可控范围内。设计与实现**必须**按清晰终态合同推进，**不得**为迁就旧业务代码、旧推荐逃逸或旧半闭合语义而保留技术债形态。具体包括：  
   - **禁止长期双轨**：不得把「遗留合成 `guard`」与「结构化 admit/open」并行作为正式控制流；不得把「文档分表维持两套 computation `this`」当作区间票号的最终官方用法；不得靠「可选松散字段 + 运行时猜」代替类型与安装期合同。  
   - **禁止软兼容壳**：不得将循环 N 次 `nextSequenceValue` 写多行连续号、扫描 `effects` 判别首次/回放、手写 `storage.delete` 修剪循环保留为 usage/generator 中的可用推荐或等价最终模式；落地后这些写法须从官方教义中**删除**（示例、生成器、反模式文档改为禁止或指向新 API），框架内既有测试与示例随新合同修改。  
   - **禁止错误语义折叠充兼容**：例如不得将唯一约束冲突自动翻译为 `replayed` 以迁就旧客户端。  
   - **允许并要求的破坏性收敛**：在汇合点直接切换 EventSource/Interaction/Activity/computation 回调合同；下游应用同步修改。  
   - **「复用现有基建」的边界**：复用 atomic / `_ScopedSequence_` / 事务 / dispatch 尝试边界等**正确机制与存储**，不等于保留过时调用形态或双轨控制流。  
   - 评审与裁决若发现方案以「兼容旧代码」为由引入双轨、软降级或遗留半闭合语义，按违反本条与任务目标处理。

请先完成设计，不要实施生产代码。任务特定说明：

- 问题陈述全文：`prompt/remaining-framework-gaps-seq-idem-retention.md`。建议落地顺序（FR-SEQ-01 → FR-IDEM-01 → FR-RET-01）仅为风险提示；求证后可调整分期与里程碑切分，但每个 FR 的验收必须可独立执行。
- 调研入口（设计轮必读/复核）：
  - `src/runtime/System.ts` — `AtomicSequenceTarget`、`nextSequenceValue` / `seedSequenceValue` / `readSequenceValue`
  - `src/runtime/MonoSystem.ts` — atomic 序号实现与 `_ScopedSequence_` 存储
  - `src/runtime/computations/ScopedSequence.ts`、`src/runtime/scopedSequenceScope.ts`、`src/runtime/scopedSequenceManifest.ts`
  - `src/runtime/Controller.ts` — `DispatchResponse`、`dispatch`、`cleanupAsyncTasks`
  - `src/runtime/migration.ts` 中与 ScopedSequence 声明/种子相关的路径
  - 测试：`tests/runtime/scopedSequence.spec.ts`、`tests/runtime/asyncTaskRetention.spec.ts`、真实 PG 并发套件模式（`tests/runtime/postgresql*.spec.ts`）
  - 文档：`agent/agentspace/knowledge/usage/14-api-reference.md`、`20-postgresql-concurrency-migration.md`、`10-async-computations.md`（cleanupAsyncTasks）、generator 中 ScopedSequence / dispatch 章节
- 设计阶段最小验证实验建议（可合并，但证据须分 FR 归组）：
  1. 确认 public / storage.atomic 表面是否已有 range reserve；若无，用最小脚本证明循环 `nextSequenceValue` 与「一次 reserve N」在 API 合同与文档地位上的差异。
  2. 对声明了唯一幂等键的 interaction（或最接近的现有模式）连续两次 `dispatch`，记录 `DispatchResponse` 形状，证明调用方无法在不读 `effects`/不查库的前提下得到官方首次/回放判别。
  3. 对普通实体写入超过 N 条后，确认除 `cleanupAsyncTasks` 外无框架 retention 入口会自动修剪。
- 并发与驱动纪律：FR-SEQ-01 完成证明必须含真实 PostgreSQL 双连接；方言相关修复必须用匹配该方言的探针。
- 公开教义：落地后须更新 usage/generator 中与序号、dispatch 结果、实体保留相关的说明；**删除**循环 `nextSequenceValue` 多行票号、扫 `effects` 判幂等、手写 prune 等旧写法作为可用模式（见要求 8）；不得以「仍兼容旧代码」为由保留双轨教义。
- 会话后端：本任务使用 **ZCode**（`prompt/skill/new-zcode-session.md` / `new_zcode_session.sh`）启动后续独立会话。

执行本 Task 时：

1. 调研任务要求、项目规则、相关源码和测试。
2. 对会影响整体方案的未知事实执行最小验证实验。
3. 创建设计文档，初始化状态为 `设计中`、`design-round: 0/15`、`implementation-round: 0/0`、`current-milestone-reopens: 0`、`convergence-mode: normal`。
4. 建立里程碑，状态全部为 `开放`，`reopen-count: 0`、`reopen-domains` 为空。
5. 只完成设计和必要的验证实验，不编写生产实现。
6. 覆盖写入 `retro.md` 的运行标题和生成印记。
7. 不要执行下面任何 additional task。使用 `Please execute docs/sequence-idempotency-retention/sequence-idempotency-retention-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**

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
5. 覆盖写入 `docs/sequence-idempotency-retention/sequence-idempotency-retention-review.md`，结论只能是：
   - `通过`
   - `需要修订`
   - `目标不可实现`
6. 不修改设计文档。
7. 使用 `Please execute docs/sequence-idempotency-retention/sequence-idempotency-retention-task.md Task 1 additional task 2.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**

### additional task 2

你是设计裁决者。深度理解 Task 1 和原设计 `docs/sequence-idempotency-retention/sequence-idempotency-retention.md`，然后逐条核验 `docs/sequence-idempotency-retention/sequence-idempotency-retention-review.md` 中的问题，不得直接接受评审结论。遵守「设计复审条件」及以下流程：

1. 对每个问题复核证据和复审类别。
2. 采纳问题时，按同一根因检查相关设计和代码范围，并一次修正全部同类位置。
3. 驳回问题时，给出源码、测试、项目规则或逻辑推演证据。
4. 对第二次出现问题的同一设计领域，按「设计复审条件」的要求改用完整、有限的表达形式。
5. 更新设计文档，并执行所有设计期验收命令和最小验证实验。
6. `d` 增加 1；向 `retro.md` 追加一行：轮次、评审结论、采纳的问题类别、主要证据和下一步。
7. 按顺序评估并执行（只走命中的第一条分支）：
  - 若有充分证据证明 Task 的核心目标在当前技术、权限或运行环境下不可实现：设置 `status: 不可实现`，在 `retro.md` 写明证据后终止，不启动新的 chat。
  - 若本轮没有采纳任何「需要复审的问题」：设计通过。设置 `status: 实现中`，以初始里程碑数计算 `N = 5 × M`，然后使用 `Please execute docs/sequence-idempotency-retention/sequence-idempotency-retention-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**
  - 若有采纳问题且 `d < 15`：使用 `Please execute docs/sequence-idempotency-retention/sequence-idempotency-retention-task.md Task 1 additional task 1.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**
  - 若 `d = 15`：完成一次全局修订和六类条件自检。不存在已知阻塞问题时按上面的设计通过分支进入实现；仍存在已知阻塞问题时设置 `status: 协议失败`，记录原因并终止，不启动新的 chat。不得自行提高预算或要求用户选择方案。

### additional task 3

你是实现者。深度理解并实施 `docs/sequence-idempotency-retention/sequence-idempotency-retention.md`。你是实现循环中的**实现轮**，与 additional task 4 的**审计轮**交替执行。严格遵守以下流程：

1. 首先读取 `next-action`。内容不是「无」时，必须先完成该项工作；只有证据证明它不再适用时才可改写。若 `convergence-mode` 不是 `normal`，还必须先读取当前审计文件的 `Convergence Note`，按其 `Next implementation batch` 顺序推进。
2. 只推进编号最小的未完成里程碑。完成该里程碑所必需的测试、脚本、环境配置和缺陷修复均属于本轮范围。
3. 优先复用项目测试体系。修复真实缺陷时，先建立能够失败的复现，再修复并运行通过。
4. 实现中发现设计事实错误时，可以修订当前及后续未完成里程碑、拆分或重排工作，但不得删除 Task 要求，不得增加总预算 `N`。
5. 执行当前里程碑的验收。通过时标记为 `待审`并记录命令、结果和证据；未通过时保持 `开放`并记录具体阻塞。收敛模式下必须先通过 `Convergence Note` 的全部 Closure gates，不能以只完成部分批次为由标记`待审`。
6. 执行受本轮修改影响的项目基础检查。任务开始前已经失败的检查以基线记录为准；不得新增失败，也不得以同名旧失败掩盖不同的新原因。
7. `k` 增加 1，更新 `implementation-round: k/N`。
8. 不得把里程碑标记为 `已完成`。
9. 本轮结束时**一律**使用 `Please execute docs/sequence-idempotency-retention/sequence-idempotency-retention-task.md Task 1 additional task 4.` 作为 prompt 启动新的 chat（无论你认为完成与否，都交给审计轮判定，不再自行连续启动 additional task 3）。只要启动就可以结束，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**

### additional task 4

你是独立实现审计者。深度理解 `docs/sequence-idempotency-retention/sequence-idempotency-retention.md` 并对实现进行对抗性 review。你是实现循环中的**审计轮**，与 additional task 3 的**实现轮**交替执行。不得信任里程碑状态或实现者的结论。按以下顺序执行：

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
9. 覆盖写入 `docs/sequence-idempotency-retention/sequence-idempotency-retention-audit.md`。
10. 按审计结论更新状态：
  - 验收通过且没有实现缺陷：将 `待审`里程碑标记为 `已完成`，`next-action` 写「无」。
  - 存在实现缺陷：将里程碑标记为 `开放`；若原状态为`待审`则增加 reopen 计数。普通模式在 `next-action` 写明具体修改、失败命令、涉及位置和完成条件；收敛模式则令 `next-action` 指向 `Convergence Note` 的下一实施批次。
  - 当前里程碑原本为 `开放`且实现轮未取得通过：给出明确诊断和下一步，不得只写一般性建议。
11. 按顺序评估并执行（只走命中的第一条分支）：
  - 全部里程碑已完成：执行一次最终核验（全部里程碑验收命令、Task 要求逐项检查以及项目要求的基础测试）。全部通过后设置 `status: 已完成`，按「运行记录」完成 `retro.md` 并终止，不启动新的 chat。
  - 未完成且 `k < N`：使用 `Please execute docs/sequence-idempotency-retention/sequence-idempotency-retention-task.md Task 1 additional task 3.` 作为 prompt 启动一个新的 chat，只要启动你自己就可以结束了，不需要等待。**使用 `prompt/skill/new-zcode-session.md` 中的方法来启动新的 chat。**
  - 未完成且 `k >= N`：若有证据证明核心目标不可实现，设置 `status: 不可实现`；否则设置 `status: 协议失败`。按「运行记录」完成 `retro.md` 后终止，不启动新的 chat。不得自行增加预算或要求用户决定下一步。
