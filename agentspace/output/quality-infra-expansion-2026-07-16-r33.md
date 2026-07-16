# r33：quality-plan 测试基建扩张轮——生成域覆盖五个未机器化子系统 + CI 编排（2026-07-16）

- 日期：2026-07-16
- 基线：`main` @ `582efb9d`（r32 全部修复已合入）
- 性质：**测试基建专项轮**——执行 `quality-foundation-plan-r27.md` §1.3/§1.5 登记的
  全部剩余扩张点（r32 §一结尾明列「生成域剩余扩张……属专项轮工程」）。
  不是探查轮：无新增缺陷候选定谳；所有新预言机在当前 main 上全绿（见 §四健康度），
  其判定力以开发期敏感性实验证明（§三）。
- 分支：`cursor/quality-plan-test-infra-expansion-469e`

---

## 一、交付物总表

| 扩张点（quality-plan 登记处） | 套件 | 机制一句话 | 本轮验证规模 |
|------|------|------|------|
| 事件驱动计算（§1.3 步 2 剩余 / §1.5） | `tests/runtime/eventComputationGenerativeFuzz.spec.ts` | 随机 SM（property/global × 状态名/计数器 computeValue）+ 事件 Transform（重叠 eventDep / 数组返回 / 条件 null）× 随机 storage 写 + dispatch（InteractionEvent 轨）；独立 JS 模型从**操作意图**推导事件流并重实现匹配语义（合并视图 + keys 子集 + 每 (计算,事件) 恰好一跳/一跑），逐 op 对账 SM 值 / dict 值 / 派生行多重集 / 链式 Count | 种子 1–100 × 25–30 ops 绿 |
| async 计算（§1.3 步 2 剩余 / §1.5；r30 规则 3） | `tests/runtime/asyncComputationGenerativeFuzz.spec.ts` | 返回类型由数据驱动（record.mode / Σinput%4 ⇒ sync/resolved/async/skip 的随机交错序列）× worker 盲写 / daemonReturn（含陈旧与已处理重放）/ 作废后盲写；task 生命周期模型逐位对账（值收敛 = 最后已提交产出；作废必须物理删除行；per-key task 行状态序列相等） | 种子 1–40 × 30 ops 绿 |
| activity 层（§1.5） | `tests/runtime/activityGenerativeFuzz.spec.ts` | 随机活动树（单链层 × any/every/race × 2–3 分支 × 嵌套深度 2）× 双实例均匀随机 dispatch（合法/乱序/剪枝/完成/缺 activityId 自然混合）；独立工作流模型断言成败 + 错误族 + 状态 JSON canonical 相等 + stateVersion + 实例隔离。**race 组运行期语义首次获得系统覆盖**（r29 探索报告点名空白） | 种子 1–60 × 40 ops 绿 |
| 迁移破坏性变异（§1.3 步 3 剩余） | `tests/runtime/migrationDestructiveFuzz.spec.ts` | 随机存量数据（共享操作决策器 + 确定性命中面插入）× 每种子恰好一个破坏性变异：Transform 收缩（changed + 自动 destructive-scope）/ `_isDeleted_` 硬删除（级联感知 scope + link 级联 + 下游 Count 重算）/ 空 fact 退役（DROP）/ Count changed|unchanged 决策分叉 / **两个必须整体拒绝且数据无损的阻塞形态**；偶数种子 kill-resume 注入 | 种子 1–60 × 10–12 ops 绿（默认池 1–14 覆盖全部变异种类 + 各破坏性种类的 kill-resume 变体） |
| taboo 声明形态（r31 规则 4 / r30 规则 4） | `tests/runtime/declarationTabooFuzz.spec.ts` | 登记的声明期守卫（merged 同名异型 / 重复 Dictionary / trigger|eventDep 模式字段面三格 / 非函数 defaultValue / 活动图四格）在**随机环绕 schema** × 3 种子上逐一断言按登记阶段+错误族拒绝（守卫必须对环绕上下文不敏感）；合法双胞胎三格断言端到端可用（防过度收紧）；两个 deferred fail-loud 契约钉住（filtered 谓词引用未声明属性 = 首写 fail-loud；歧义 SM transfers = 触发写 fail-loud，绝不静默取首条） | 12 taboo 格 + 3 legal 格 × 3 种子 = 48 用例绿 |
| 真实驱动差分接线（§1.5 开放项） | `driverDifferentialFuzz.spec.ts` 副库矩阵化 | runner 参数化副库描述符；决策流只消费主库侧 ⇒ **同一种子池跨副库有效**。副库：PGLite（常跑）/ 真实 PostgreSQL / 真实 MySQL（env-gated，`_difffuzz` 独占库每种子 forceDrop）。顺带补齐 runner 缺失的 `setupRecordSequences` 步（真实 PG 对未初始化序列 fail-fast——本身就是矩阵暴露的方言分裂面） | PGLite 1–6、真实 PG 1–20、真实 MySQL 1–20 绿（本机 PG16/MySQL8） |
| CI 编排（§1.3 步 4） | `.github/workflows/tests.yml` + `nightly-fuzz.yml` | PR 门：`npm run check` + `npm test`（内含全部生成式套件固定默认池——此前仓库无主测试工作流，只有 postgres 套件门）。nightly：storage base 200 + extended 120 / 差分 PGLite 120 + 真实 PG 40 + MySQL 40 / 计算 100 / 事件 120 / async 120 / activity 120 / taboo 6 / 迁移 60 + 破坏性 60。失败种子即回归用例（`FUZZ_*_SEED_START=<seed> COUNT=1 FUZZ_VERBOSE=1` 复现，收口时固化进 deterministic 组） | 工作流 YAML；PR 门本地等价验证见 §四 |

共享基建变更：`createFaultInjectedDb` 从 migrationGenerativeFuzz 抽取为
`tests/runtime/helpers/faultInjection.ts`（两个迁移 fuzzer 共用唯一实现；rng 决策流不受影响）。

## 二、方法论要点

1. **独立真相源的三种形态**（新套件各选其一，非套用同一模板）：
   - 事件驱动计算：**意图推导**——无关系 schema 下事件构造是确定函数（create ⇒ 全字段含
     默认值；update ⇒ keys=写入字段、record=行终态；dispatch ⇒ InteractionEvent create），
     模型完全不读框架事件流（读了就与被测系统同源，r29「预言机不依赖被测编译」原则）；
   - async：**生命周期状态机**——模型维护 per-key task 序列与「最后已提交产出」，
     对账面含 task 行物理状态（作废=删行 而非标记，r30-B 的删除语义直接进预言机）；
   - activity：**语义重实现**——按文档语义（非抄实现）重写 any/every/race 推进规则，
     状态 JSON canonical 逐字节对账。
2. **回声（echo）域的显式排除**：SM 写回自身属性产生 update 事件、Transform 插入产生
   create 事件——生成域把 update trigger 全部 keys 锚定在 value prop 上、派生实体名排除出
   trigger 菜单，使模型无需模拟二阶事件。回声触发语义登记为后续扩张点（套件头注）。
3. **敏感性自检成为惯例**（r29 方法论 5 的执行）：每个新预言机在开发期注入坏真值验证会红
   （§三），再转绿提交。全绿的预言机首先要证明自己会红。
4. **生成域受限时必须双侧登记**（r30 规则 1）：每个套件头注同时登记「生成侧缺什么形状」
   与「观察侧缺什么面」，quality-plan §1.5 汇总。
5. **守卫的一致性面**：taboo 套件把「守卫在任意环绕 schema 里都响」升格为断言——
   只在动机夹具里响的守卫不算守卫；合法双胞胎防住反方向（过度收紧）。

## 三、预言机敏感性证据（开发期，坏真值注入后当场红）

| 套件 | 坏真值 | 结果 |
|------|--------|------|
| eventComputationGenerativeFuzz | 模型吞掉 property SM 转移 | 2/6 种子红 |
| 同上 | 模型吞掉 Transform 输出 | 3/10 红 |
| 同上 | 模型吞掉 global SM 转移 | 3/10 红 |
| asyncComputationGenerativeFuzz | 作废不删行（isLatest 载体谎言） | 10/10 红 |
| 同上 | 陈旧 task 允许 apply | 3/10 红 |
| activityGenerativeFuzz | any 组不剪枝 | 4/12 红 |
| 同上 | every 按 any 语义完成 | 4/12 红 |
| 同上 | race 按 start 节点完成 | 3/12 红 |
| migrationDestructiveFuzz | transformShrink 期望按旧阈值重算 | 2/2 相关种子红 |

## 四、验证证据链

- ✅ `npm run check`
- ✅ `npm test` 全量（新套件按默认池并入；数字见 PR 描述）
- ✅ 真实 PostgreSQL 16：`npm run test:postgres` 七套件 + 差分 PG 副库种子 1–20
- ✅ 真实 MySQL 8：env-gated 五套件 + 差分 MySQL 副库种子 1–20
- ✅ 扩展池：事件 1–100×25-30、async 1–40×30、activity 1–60×40、迁移破坏性 1–60×10-12、
  taboo 12+3 格 ×3 种子、既有套件默认池（storage base/extended、差分 PGLite、计算、迁移加法）
- 决策流兼容性：共享生成器（fuzzSchema/fuzzOps）本轮零改动（新套件独立种子宇宙；
  差分 runner 的副库参数不消费 rng）——既有种子池全部有效

## 五、诚实边界（登记，非本轮范围）

- **事务并发交错**仍不在任何生成域（真实 PG 并发套件按手工格覆盖）——纳入需要
  per-op 多连接调度器，独立专项。
- 事件域：关系事件 trigger（combined/link 事件名维度）、oldRecord 模式、回声触发。
- async 域：自定义 `args.freshnessKey`、宿主删除 × 悬挂 task、entity/relation 级 async。
- activity 域：group-as-root 第二分支头不带 activityId 的实例分叉（文档化 footgun）、
  并发 dispatch（CAS 竞争面）。
- 迁移域：计算**类型**变更（remove+add 形态）、共享物理表退役、fact→computed takeover
  的生成式覆盖（手工格已有）。
- 支柱 II 两个框架代码项保持登记：「分类⇒消费」守恒律 setup 期审计、
  `getAttributeQueryDataForRecord` 深度契约显式化（quality-plan §四 #5）。
- taboo 套件钉住的两个 deferred fail-loud 契约（filtered 谓词未声明属性 / 歧义 SM
  transfers）的**声明期拒绝**是登记的改进项——现状 fail-loud 无静默面，未达修复门槛。
