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
