# 从本质上提升框架质量的路线图（r27 复盘的机制化落地）

- 日期：2026-07-13
- 关联：`deep-review-2026-07-13-r27.md`、`r27-test-blindness-retrospective.md`
- 性质：战略设计文档 + 首个支柱的已落地 PoC 证据

---

## 〇、问题的本质重述

27 轮审查、每轮致命——不是因为测试写得少（2000+ 用例、四观察面矩阵、7 条规则的事件预言机），
而是因为防御的**形态**与 bug 的**分布**不匹配：

- bug 分布在「声明面 × 物理编译 × 载荷形态 × 操作序列 × 驱动」的**指数组合空间**里；
- 防御是**人肉枚举**的矩阵格子 + 反应式回填的维度登记册——人枚举不出自己没想到的组合，
  登记册只登记已经咬过人的轴。

从本质上提升质量 = 让防御的形态匹配 bug 的分布。三个支柱，按杠杆从高到低：

| 支柱 | 一句话 | 攻击的失明类 |
|------|--------|------------|
| I. 生成器铺格子、预言机判对错 | 输入空间机器探索，正确性由性质断言判定 | 缺轴、缺格、夹具偏置 |
| II. 收缩空间：让"半支持"不可表达 | 未实现的组合 fail-fast，守恒律进代码 | 静默半写、部分成功遮蔽 |
| III. 声明-实现一致性的机器化 | 契约、文档、修复声明全部要有运行时探针 | 假绿、死代码修复、文档谎言 |

**本文档不是提案，支柱 I 的 PoC 已经落地并当场自证**（见第一节）——这是对
「为什么这是本质路径」最有力的回答。

---

## 一、支柱 I：生成式测试（已落地 PoC + 当场战果）

### 1.1 已落地：写路径结构化 fuzzer

`tests/storage/writePathStructuralFuzz.spec.ts`：

- **随机 schema**：从关系菜单（1:1 merged / 1:1 reliance / 1:1 mergeLinks / n:1 / 1:n / n:n /
  对称 n:n × 随机 link 属性）抽样——物理拓扑不是被枚举的轴，而是从声明面自然涌现；
- **随机操作序列**：create/update/delete/addRelation/removeRelation，载荷生成器递归产生
  嵌套新建 / ref（**双 id 形态：驱动原生 + 字符串**）/ null / 数组 / `&` 的任意组合；
- **判定全部复用既有预言机**：事件完备性 7 条规则 + 双向一致 + 排他唯一 + 新增
  「逻辑 id 唯一」「无身份记录」两条结构不变量；
- **确定性可复现**：mulberry32 种子，失败输出 seed + schema + 完整操作日志；
  `FUZZ_SEED_START/COUNT/OPS` 扩大探索，CI 固定小种子集。

### 1.2 当场战果：首跑在 27 轮审查过的代码库上抓获三个新致命 bug

这是「生成器铺格子」价值的最强证据——**同一批预言机早已存在，此前 26 轮没响，
只因这些输入形状从未被人写出来**：

| 编号 | 发现 | 机理 | 修复 |
|------|------|------|------|
| F-3 | **字符串 id 经公开 API 传入 → 行合并/同 id 判定静默跳过 → 重复逻辑 id 行 + 字段丢失** | 公开 API 把 id 声明为 `string`（`addRelationByNameById(sourceEntityId: string,...)`），HTTP 载荷的 id 天然是字符串；SQL 面 `1 = '1'` 判相等（列亲和/cast），JS `===` 判不等——查询匹配到行、身份判定说"不是同一个"，flashOut 合并被跳过 | 写路径 8 处 id 身份判定收敛到 `sameRecordId`（String 归一，null/undefined 无身份），与 QueryExecutor 批量回填、`dedupeRefItems` 的既有归一化约定同构 |
| F-4 | **reliance 置换静默销毁旧依赖**：owner 已持有 reliance 依赖时经 addRelation / 直建 link / create-ref 领养绑定新依赖 → 旧依赖行被物理清除，无 delete 事件、无级联 | reliance 生命周期契约（"只能随 owner 删除"）只在 update 轨有 unlink 守卫；link-endpoint 认领轨与 create-ref 领养轨是同一契约的兄弟轨，无守卫直通 flashOut 行搬迁 | `assertNoRelianceDisplacement`：两条漏网轨 fail-fast（同 id 幂等放行；改嫁依赖、认领空闲 owner 等合法面逐一探针验证保留） |
| F-5 | **跨关系 combined 同住行的 link-endpoint 认领静默销毁同住 link**：记录 A 经 mergeLinks 与 B 同住，再对 A 建立**另一条** merged link → 行搬迁不携带非 reliance 同住结构，B 的 combined link 消失，零事件 | flashOut 的行搬迁子树由 `getAttributeQueryDataForRecord` 的递归深度决定——递归对 `notRelianceCombined` 不下钻（reliance 会随行搬运，已探针验证）；清行复用的 `combinedLinkFields` 逻辑本是删除语义 | `assertNoNonRelianceCoTenant`：完整深度行搬运实现之前 fail-fast（守卫自行按需查询同住列，不受 flashOut 查询深度限制） |

三个 bug 全部走完「fuzzer 红 → 种子日志定位 → 手工最小化 → 兄弟轨扫描（探针矩阵 K/L/M）→
收敛点修复 → fuzzer 绿 + 存量套件绿」的闭环。**修复期间探针还顺带证实了若干合法工作面**
（依赖改嫁、空闲 owner 领养、reliance 同住随行搬运、非 reliance 1:1 的 replace 语义），
这些以对照用例固化，防止未来的守卫过度收紧。

### 1.3 展开路径（按杠杆排序）

> **【r33 落地纪要】剩余扩张点 + CI 编排全部落地（详见
> `quality-infra-expansion-2026-07-16-r33.md`）：**
> - **事件驱动计算生成** → `tests/runtime/eventComputationGenerativeFuzz.spec.ts`：
>   随机 StateMachine（property/global × 状态名/computeValue 计数器）+ 事件 Transform
>   （重叠 eventDep / 数组返回 / 条件 null）声明 × 随机 storage 写 + dispatch 流
>   （InteractionEvent 轨），独立 JS 模型从操作意图推导事件流并按框架契约重实现匹配
>   （合并视图 + keys 子集 + 每 (计算,事件) 恰好一跳/一跑）。种子 1–100 绿。
> - **async 计算生成** → `tests/runtime/asyncComputationGenerativeFuzz.spec.ts`：
>   数据驱动的返回类型交错（sync/resolved/async/skip）× worker/daemon/作废盲写全轨，
>   task 生命周期模型逐位对账（r30 规则 3 内建为预言机）。种子 1–40 绿。
> - **activity 层生成** → `tests/runtime/activityGenerativeFuzz.spec.ts`：随机活动树
>   （any/every/race × 嵌套）× 均匀随机 dispatch（合法/非法自然混合），独立工作流模型
>   对账状态 JSON/stateVersion/实例隔离；race 运行期语义首次获得系统覆盖。种子 1–60 绿。
> - **迁移破坏性变异** → `tests/runtime/migrationDestructiveFuzz.spec.ts`：
>   {Transform 收缩 / `_isDeleted_` 硬删除 / 空 fact 退役 / 计算 changed|unchanged 决策 /
>   被拒绝的非空删除与类型变更} × kill-resume。种子 1–60 绿（默认池 1–14 覆盖全变异种类）。
> - **taboo 声明形态** → `tests/runtime/declarationTabooFuzz.spec.ts`：登记的声明期守卫
>   （merged 同名异型 / 重复 dict / 模式字段面 / 非函数 defaultValue / 活动图五格）在随机
>   环绕 schema 上逐一验证 + 合法双胞胎防过度收紧 + 两个 deferred fail-loud 契约钉住。
> - **真实驱动差分接线** → driverDifferentialFuzz 副库矩阵化：PGLite（常跑）+ 真实
>   PostgreSQL / MySQL（env-gated，独占 `_difffuzz` 库）；种子池跨副库有效。
>   真实 PG/MySQL 各 20 种子绿。
> - **CI 编排** → `.github/workflows/tests.yml`（PR：`npm test` 内含全部套件固定默认池）
>   + `.github/workflows/nightly-fuzz.yml`（nightly：扩展池 + 真实驱动差分矩阵；
>   失败种子即回归用例）。

> **【r29 落地纪要】1–3 全部落地（详见 `deep-review-2026-07-15-r29-quality-pillars.md`）：**
> - **驱动差分** → `tests/storage/driverDifferentialFuzz.spec.ts`：同种子意图流经 id 双射在
>   SQLite（主）/PGLite（副）逐操作对账（错误语义 + 事件多重集 + 逻辑快照）。120 种子绿。
>   固化契约决策：**一个操作内的兄弟事件顺序是驱动方言（无 ORDER BY 承诺），只比多重集**。
> - **计算层生成** → `tests/runtime/computationGenerativeFuzz.spec.ts`：随机 (源 × 聚合 ×
>   宿主位置) 声明（全局 dict / property 级、实体 / 关系 / filtered 视图源）× 随机写序列，
>   每步与朴素全量重算对照。Count/Summation 天然非幂等 ⇒ 增量双跑/漏跑直接体现为值漂移
>   （r27 F-2 的"执行计数 spy"由此结构性内建）。60 种子绿 + 预言机敏感性自检（坏真值必红）。
> - **迁移生成** → `tests/runtime/migrationGenerativeFuzz.spec.ts`：随机 v1 schema（稳定
>   uuid）× 随机存量数据 × 随机加法变异 → 真实两步审查 migrate。预言机：存量保真 / 默认值
>   回填 / 新计算回填=朴素重算 / 迁移后可写 / **kill-resume 收敛**（偶数种子在第 N 次 DB
>   调用注入故障 → 重跑必须收敛）。60 种子绿。
> - storage fuzzer 表达域纳入 **filtered entity/relation + merged (union) entity**
>   （filtered/extended 两个新模式）+ 预言机第 8 条（配对读取一致性）。首跑抓获 merged 域
>   4 个致命家族并收口（见 §1.4b），EXT-1 开放家族建档。

1. **驱动差分**（✅ r29）：同一种子序列跑 SQLite + PGLite，逐操作 diff
   查询结果与事件流——r24/r25 驱动分裂家族的机器化收口。真实 PG/MySQL 进 nightly。
2. **计算层生成**（✅ r29 数据驱动聚合面）：随机 dataDeps/聚合声明 + 随机 dispatch 序列，预言机 = 朴素全量重算对照
   （`symmetricAggregationMatrix` 已有样板）+ **执行计数 spy**（r27 F-2 的夹具幂等性遮蔽
   只有非幂等观察者能抓；r29 以非幂等聚合的值漂移结构性实现）。
   剩余扩张点：StateMachine/Transform 等事件驱动计算（需 InteractionEvent 轨）、async 计算。
3. **迁移生成**（✅ r29）：随机 schema 对（前后版本）+ 随机存量数据 → migrate → 与"drop 重建 + 全量
   重算"对照；随机注入 kill-resume 点。
   剩余扩张点：破坏性变异（删属性/删实体 → destructive-scope 决策轨）、计算**变更**（非新增）轨。
4. **CI 编排**：PR 跑固定种子集（storage base 8 + extended 8 + 差分 6 + 计算 6 + 迁移 6，
   合计 <40s）；nightly 跑大种子池 + 长序列（各套件 `FUZZ_*_SEED_START/COUNT/OPS` 环境变量
   扩池）；失败种子自动进回归集（种子即测试用例）。

### 1.4 扩展探索的开放发现（100 种子 × 40 操作首跑，25 种子失败，去重后 ≥4 个独立家族）

> **【r28 收口纪要】G-1–G-5 全部定谳并修复（见 `deep-review-2026-07-14-r28.md`）：**
> - G-1 = 双 combined 放置的幻影/槽位碰撞（seed 136/156）+ host-attr 认领轨漏子树守卫（seed 108/119）；
> - G-2 = 行搬迁误用逻辑删除家族的 link id 重发号面（seed 114 等）；
> - G-3 = handleCreationReliance 嵌套新建子记录的 `&` 数据未挂反向 ref（seed 113 家族）；
> - G-4 = 互为 reliance 的 sameTableReliance 类型环 → 深查询栈溢出（seed 123；对称 n:n 是烟雾弹）；
> - G-5 = 幻影配对的 delete 事件（seed 156/193，「同住≠配对」家族）。
> r28 并把种子池扩到 **1–499 × 50 操作**，新暴露的 H 家族（事件端点字符串形态、
> 搬迁 NULL→默认值改写、孤儿同住连坐删除、半清 link）亦全部收口，全池绿。
> 下一步扩张按 §1.3 路线：filtered/merged 入生成域、驱动差分。

修复 F-3/F-4/F-5 后把种子池扩到 100，**又**暴露出以下家族（全部带种子可复现，
`FUZZ_SEED_START=<seed> FUZZ_SEED_COUNT=1 FUZZ_VERBOSE=1` 即得完整操作日志）。
按本仓库的红-绿纪律，这些留待逐一走「最小化 → 兄弟轨扫描 → 收敛点修复」闭环，
不在本轮仓促修复：

| 家族 | 症状 | 代表种子 | 初判 |
|------|------|---------|------|
| G-1 | 记录/link「disappeared with NO delete event」（create-with-ref 轨，非 addRelation） | 108, 119, 136 | F-5 的 create-ref 兄弟轨：行搬迁深度问题的另一入口（O 探针单独复放不中，需序列上下文——说明还有状态前置条件未定位） |
| G-2 | 记录「appeared with NO create event」（update / removeRelation 之后凭空出现） | 114, 126, 137 | 疑似 relocate/行搬迁把记录写回但不发 create（relocate 的"物理搬迁无事件"语义在某条轨上泄漏成了逻辑新增） |
| G-3 | link create 事件 payload 缺 link 属性（`note`：行有值、payload 为 null） | 113, 128, 141 | r25 F-1（create payload 契约）家族在某个未收口产生点的残留 |
| G-4 | `Maximum call stack size exceeded`（对称 n:n 数组载荷 update：`peers2: [{new}, {id}]`） | 123 | 对称关系 update 的递归失控——fail-loud，严重度低于静默家族 |
| G-5 | 「phantom delete event #undefined」（delete 事件 id 为 undefined） | 156, 193 | 事件 payload 身份缺失——预言机第 4 条首次抓到实例 |

**这张表本身就是支柱 I 的论证**：预言机 + 生成器在两天内产出的待办队列，
超过了此前数轮人肉审查的总和。CI 固定种子集保持在已收口的 1–8（全绿）；
扩展池的收口进度以本表为准跟踪。

### 1.4b r29 扩域首跑发现（filtered/merged 入生成域，60→120 种子）

**已收口（当轮修复 + `mergedWritePathRegressions.spec.ts` 固化）——共同根源是
「写路径以声明名/记录种类判定，而 merged 编译把 input 变成物理 base 上的视图」：**

| 家族 | 症状 | 代表种子 | 收敛点修复 |
|------|------|---------|-----------|
| MRG-1 | merged FK link 删除把宿主实体**整行物理销毁**（零事件） | extended 1 | `clearOrDeletePhysicalRow` 行占用判定改按 **id 字段**（不按记录种类排除视图/抽象记录） |
| MRG-2 | combined 嵌套新建按**视图名**发号 → 平行序列撞物理表既有 id → 静默覆写既有记录 | extended 41 | `CreationExecutor.allocateRecordId`：全部发号点经 `resolvedBaseRecordName` 归一（含 flashOut） |
| MRG-3 | combined 嵌套新建 create 事件 payload 丢 type-dispatch 默认值（含 `__type`） | extended 41/24 | defaults 按 `originalRecordName` 求值（事件 recordName 仍是物理名） |
| MRG-4 | 级联删除轨按**声明面名字**发 record delete → 物理名事件缺失 + 视图名双 delete | extended 37 | `deleteRecordSameRowDataGrouped` record delete 统一归物理名（canonical 轨已解析，级联轨归一） |
| MIG-1 | property 聚合模板全量 compute 对 **to-one** 关系属性裸 for...of → 迁移回填 TypeError | mig-fuzz 3 | `aggregationTemplate.compute` 关联行读取点归一（对象→单元素数组），六种聚合共用 |

**开放家族（生成域已相应收缩，收口后解除）：**

| 家族 | 症状 | 代表种子 | 初判 |
|------|------|---------|------|
| EXT-1 | merged input 作为 x:1 / combined 关系端点时 Setup 字段-表装配错位 → 查询期 `no such column`（fail-loud） | extended 2/10/50/71/72/81（`FUZZ_MERGED_FULL=1`） | rebase 后 link FK 字段/属性字段落错表——需要专门一轮走 Setup 装配审计；CI 生成域暂把 merged pair 限制在仅 n:n/无关系实体（`fuzzSchema.ts` 有 CAUTION 注释） |

> **【r32 收口纪要】EXT-1 已修复并解除生成域限制**：根因不是 rebase 的字段落错表，而是
> filtered/merged-input 视图记录的 `record.table` 指针停在创建期快照——对视图端点的合表
> 移动整个物理 base 之后，视图指针失联（查询 JOIN 落在幽灵表 + buildTables 建出多余物理表）。
> 收敛修复：`Setup.assignTableAndField` 对**所有** recordToTableMap 注册记录（含视图名）统一
> 以其为 table 真相源。`FUZZ_MERGED_FULL` 门移除（x:1/combined 端点回归默认生成域；
> mergeLinks 端点仍排除——以视图名寻址的显式 mergeLinks 是未定谳面）。
> 回归：`tests/storage/review-fixes-2026-07-15-r32.spec.ts` B1/B2；full-domain 种子 1–90 绿。

### 1.5 诚实的边界

- fuzzer 的强度 = 预言机的强度 × 生成器的表达域。r33 后生成器已产出：filtered
  entity/relation（嵌套链）、merged (union) entity、数据驱动聚合声明（全局/property 级）、
  **事件驱动计算（StateMachine trigger / Transform eventDeps × InteractionEvent 轨）、
  async 计算（返回类型交错 × task 生命周期）、activity 层（any/every/race × 嵌套 ×
  非法 dispatch）、迁移加法 + 破坏性变异、taboo 声明形态（守卫一致性）**。
  仍不产出（各套件头注有逐项登记）：**事务并发交错**（真实 PG 并发套件承担）、
  关系事件 trigger / oldRecord 模式 / SM 回声触发（事件域）、自定义 freshnessKey /
  宿主删除悬挂 task / entity 级 async（异步域）、group-as-root 实例分叉 footgun
  （活动域）、计算类型变更（remove+add 形态）/ 共享表退役（迁移域）。
- 驱动差分副库矩阵：PGLite（常跑）+ 真实 PostgreSQL / MySQL（env-gated；nightly 工作流
  已接线，`_difffuzz` 独占库每种子重建）。
- 随机化不证明不存在 bug，只把「逃逸概率」变成种子数量的函数——这正是对指数空间唯一
  诚实的陈述方式。

---

## 二、支柱 II：收缩空间——让"半支持"不可表达

生成式测试暴露的三个 bug 有共同形状：**一个机制（flashOut 行搬迁）被复用到超出其实现深度的
输入上**。修复全部是 fail-fast——这不是权宜，而是框架质量的第一性原则：

> **每一个可以到达实现的输入，要么被完整正确地处理，要么被清晰地拒绝。
> 不存在第三种状态（静默半处理）。**

落地形态（部分已在 r27 完成）：

1. **写入面守卫清单**（已落地 4 个）：combined 子记录嵌套结构（F-1）、原地 ref 异 id 嵌套（F-1）、
   reliance 置换（F-4）、跨关系同住认领（F-5）。每个守卫的错误信息都给出 workaround。
2. **守恒律候选**（下一轮落地）：
   - 「凡被 NewRecordData 分类的必须被消费或被拒绝」——分类树与执行者消费面的差集断言
     （dev-mode 或 setup 期静态审计）；
   - 「行搬迁必须保全行上全部逻辑记录与 link」——搬迁前后按 recordName 逐一 count 对账
     （可作为 fuzzer 预言机第 8 条先落地，再决定是否进运行时 debug 模式）。
3. **实现深度的显式声明**：`getAttributeQueryDataForRecord` 的递归深度参数目前隐式决定了
   行搬迁/删除/flashOut 的语义边界——把「本查询的深度契约」写成参数注释 + 每个调用点
   声明自己需要的深度，深度不足处要么补齐要么守卫。

## 三、支柱 III：声明-实现一致性的机器化

r27 的 I-1/I-3/I-5 与 fuzzer 的 F-3 都是「声明与实现分叉」：

1. **修复声明必须携带方言/路径匹配的运行时探针**（I-3 教训：r26 的 sha256 修复测试跑在
   PGLite 上——被测的恰是不需要哈希的分支，假绿比无测试更糟）。已进复盘操作性规则。
2. **公开类型面的每个字段要有行为差异断言**（I-5 教训：onlyRelationData 有类型位、有合并
   语义、有存在性测试，唯独没人断言"声明它之后返回什么"）。
3. **公开 API 的类型签名是契约**（F-3 教训：`sourceEntityId: string` 写在签名里 26 轮，
   实现按 number 语义比较）。签名声明的输入域必须进 fuzzer 的生成域——这次是 string id，
   同类的还有：可选参数的缺席形态、联合类型的每个分支。
4. **面向 agent 的规则文档纳入一致性检查**（I-5 的 .mdc 错档教训）：规则文档中的 API 示例
   应可提取执行（长期项）。

## 四、执行顺序（供下一轮起点）

1. fuzzer 进 CI（PR 固定种子 + nightly 扩展）——✅ r33（tests.yml + nightly-fuzz.yml）；
2. 驱动差分 fuzz（SQLite vs PGLite）——✅ r29；真实 PG/MySQL 副库 ✅ r33；
3. 行搬迁 count 对账升格为 fuzzer 预言机第 8 条——✅ r29（配对读取一致性）；
4. 计算层生成 + 执行计数 spy 夹具——✅ r29；事件驱动/async/activity 域 ✅ r33；
5. 「分类⇒消费」守恒律 setup 期审计——**未落**（支柱 II 框架代码项，非测试基建；
   与 `getAttributeQueryDataForRecord` 深度契约显式化一同保持登记）；
6. 迁移生成测试——✅ r29；破坏性变异轨 ✅ r33；
7. 主动轴审计（实现分支点 vs 登记册求差集）作为每轮 review 的固定前置步骤——
   方法论项，进 review 轮工作流。

---

## 附：本轮红-绿证据链（供验证）

- fuzzer 首跑（守卫前）：seed 1/3/4/6（F-3 家族，label 静默置 null / 重复行）、
  seed 2 step27（F-4，D 记录消失）、seed 3 step19（F-5，out3 link 消失）——
  全部带完整种子日志定位；
- 手工最小化：`review-fixes-2026-07-13-r27b.spec.ts`（F-3/F-4/F-5 各含损坏形态红测
  转 fail-fast/正确行为 + 合法面对照）；
- 修复后：fuzzer 8 种子 + 100 扩展种子全绿；全量套件、真实 PG 7 套件、MySQL env-gated
  套件全绿（数字见 PR 描述）。
