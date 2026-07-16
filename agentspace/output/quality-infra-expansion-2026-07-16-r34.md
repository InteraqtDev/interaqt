# r34：quality-plan 登记项收口轮——诚实边界定向探针出货三个 async bug + 生成域再扩张 + 支柱 II 双项落地（2026-07-16）

- 日期：2026-07-16
- 基线：r33（同分支 `cursor/quality-plan-test-infra-expansion-469e` 增量）
- 性质：**登记项收口轮**——按 quality-plan §1.5 诚实边界与 §四 #5 逐项完成。
  与 r33（纯基建、全绿）不同：本轮对登记边界做**定向探针**，async 任务生命周期面
  当场出货三个真 bug（一个 fatal 静默覆写家族 × 两条轨 + 一个毒丸），全部走完
  红-绿闭环；随后把该域纳入生成域。
- 核心教训（进操作性规则）：**登记的诚实边界就是下一个 bug 的地址**。r30-B 修复时
  头注里写下的「自定义 args.freshnessKey 时纯同步路径只能按默认键作废」不是边界说明，
  是一个活的静默损坏面的精确坐标——r33 报告把它列为「未进生成域」，本轮第一个探针
  就在这里变红。边界登记必须附带「该边界失守时的损坏形态」判断；fail-silent 形态的
  边界不允许只登记不探测。

---

## 一、发现与修复（fix-the-class 检查表逐条执行）

### A｜自定义 freshnessKey 下同步/resolved 产出不作废旧 task（fatal，静默陈旧覆写）

- **症状**：compute 返回 `ComputationResult.async({freshnessKey: 'crawl-slow'})` 建 pending
  task；源更新后 compute 走同步分支直出新值；慢 worker 完成旧 task → daemon 投递 →
  isLatest 在 'crawl-slow' 分区里判"最新" → **陈旧结果覆写更新的同步值**（r30-B 经
  自定义分区还魂）。
- **机制**：freshnessKey 承担两个语义——并发 async task 的**排序分区**（用户可自定义）
  与陈旧性**作废范围**。r30-B 的作废按「默认键」（record id / context 名）求值，
  自定义分区里的行匹配不中而存活。
- **修复（收敛点）**：`invalidateUnappliedAsyncTasks` 作废范围改按**数据上下文身份**
  （property ⇒ 宿主记录经 record link；global/entity/relation ⇒ 本计算独占整表），
  与分区键彻底解耦。分区管「并发 async 谁赢」，上下文身份管「非 task 轨产出后谁都
  不许再写」。
- **读者枚举**（freshnessKey 声明面的全部消费者）：createAsyncTask（分区登记，不变）✅、
  isLatestAsyncTask（分区内排序，不变——A4-guard 固化纯 async 排序不受扰）✅、
  invalidateUnappliedAsyncTasks（本修复）✅、handleAsyncReturn 的 TOCTOU 锁维度
  （按分区锁行——作废是行删除写者，两种提交顺序都收敛，锁维度不需随动）✅、
  **迁移轨 → A5**。

### A5｜迁移重建不作废旧纪元 task（同家族第三条轨，枚举顺产）

- **症状**：迁移前遗留 pending task；迁移经 asyncCompletion handler 直写新值；迁移后
  worker 完成旧 task → 投递 apply → **旧声明纪元的结果覆写迁移产出**。
- **机制**：迁移 rebuild（writeComputationResult/Patch 直写）是第三条「绕过 task 代理的
  产出轨」（登记册 r30 行早已点名迁移回填轨，但 r30/r31/r32 三轮都没接线）。
- **修复**：`MigrationScheduler.run` 对 rebuildOutput 的 async 计算在重建前
  `invalidateUnappliedAsyncTasks(computation, 'all')`（重建纪元 = 整表作废；simulate
  模式随模拟事务回滚；kill-resume 随 SERIALIZABLE 回滚/重放收敛；state-only 重建
  不产出输出、不作废）。
- **回归**：r34 spec A5（迁移前 pending → 迁移 → 旧 task 盲写+投递 = missing-task，
  值保持 'migrated'）。

### B｜record link 缺席的悬挂 task 投递是毒丸（fail-loud 但永不收敛）

- **症状**：宿主删除（或 link 被更新 task 置换，见下）后完成其 task → `handleAsyncReturn`
  在 apply 的 `taskRecord.record.id` 上抛**裸 TypeError**，task 停在 success——daemon
  每次重投递都再抛（无限重试毒丸）。
- **修复**：apply 之前对 record link 缺席的 property task 标记 skipped 并返回
  `{skipped: true, reason: 'orphaned-record'}`；重投递经 already-handled 短路；
  晚到的 worker 盲写复活成 success 也无害（守卫先于 apply，再次投递仍落回 orphaned）。
- **顺产契约定谳（r34 fuzz 扩域新池 seed 7 首跑抓获）**：task↔record 关系声明为 1:1
  ⇒ **宿主侧排他 replace**——同宿主新 task 建链会抢走旧 task 的 link（脱链行与宿主
  已删行同形态 record=null）。这是 freshnessKey/上下文之外的**第三个身份面**：
  record 作废只删得到「持链」行，脱链开放行由 orphaned-record 守卫在投递时中和——
  两个机制合起来 = 无陈旧 apply、无毒丸。模型按此契约重写（linkedTo 三面对账）。

## 二、生成域再扩张（各套件头注登记同步更新；决策流均为新种子宇宙并重验）

| 域 | 扩张 | 验证 |
|----|------|------|
| async fuzz | 自定义 freshnessKey 分区（偶数种子）、deleteHost（悬挂/脱链 task）、daemon 投递语义逐字对账（applied/stale/orphaned/already-handled/task-not-success）、task 行三面（status/partition/link）逐位对账 | 新池 1–40×30 绿；敏感性：「按默认分区作废」坏真值 4/12 红 |
| 事件 fuzz | A—B n:n 关系入 schema；trigger/eventDep 菜单 + linkCreate/linkDelete（recordName=关系名）；SM computeTarget / Transform 输出消费 r26 端点完备性契约（source/target.id）；addRelation/removeRelation 入操作菜单；宿主删除级联 link delete 进模型。顺序无关性由生成域约束保证（同一 SM 不混用 hostDelete 与 link 族） | 新池 1–100×28 绿；敏感性：吞 link SM 转移 1/15 红、吞 link Transform 输出 2/15 红；20 种子生成覆盖 12 linkCreate + 19 linkDelete |
| 迁移破坏性 fuzz | fact→computed takeover（discard-and-rebuild：随机手工事实值废弃重算 + 新行 live 计算）、计算类型变更 Count→Summation（manifest id removed+added，值=新声明重算、增量走新代码 smoke +score） | 新默认池 1–24（全 8 种变异 + 各破坏性种类 kill-resume 变体）；池 1–40 绿 |

## 三、支柱 II 双项落地（r27 登记、r32/r33 两轮顺延）

1. **`getAttributeQueryDataForRecord` 深度契约显式化**（§二.3）：方法头注写明四开关的
   包含面与递归界——sameTableReliance **递归传递**（= 行搬迁「随行子树」的定义），
   notRelianceCombined **只下钻一层**（同住 ≠ 子树成员，跨关系同住不随行、由
   assertNoNonRelianceCoTenant/relocate 双端守卫兜底）；全部 6 个调用点以命名参数注释
   声明深度意图（flashOut 认领读 / relocate 读 / 删除快照 / update 前态 / 级联富化 /
   findPath）；陈年 FIXME 以定谳契约替换。零行为变化（storage 737 用例 + 结构化 fuzzer 绿）。
2. **「分类⇒消费」守恒律审计**（§二.2）：`tests/storage/newRecordDataConservation.spec.ts`
   ——分类面（真实 NewRecordData 树的运行时反射，新增桶无法绕过）⟺ 消费登记册
   （每桶的定谳消费者/守卫锚点 + 理由）双向差集为空；锚点存在性断言（删消费点不重定谳
   ⇒ 红）；原料面（relatedEntitiesData）不得被执行者直接消费（分类不可绕过）。
   行为面的逐输入消费正确性仍归写路径 fuzzer 事件完备性预言机——本套件收口的是
   **结构漂移面**。落地当场清出死桶 `sameRowEntityIdRefs`（自引入起零生产零消费）。

## 四、验证证据链

- ✅ `npm run check`
- ✅ r34 回归 spec 7 用例（修复前 5 红：A1/A2/A3-guard/B/B2；A5 在迁移修复前红）
- ✅ async 邻域：asyncComputed / globalAsyncComputed / entityAsyncComputed / r30 交错回归 /
  transactionRetry / schedulerEdgeCases / migration 套件 141 用例绿
- ✅ 扩张池：async 1–40×30、事件 1–100×28、迁移破坏性 1–40、storage 737 + 结构化 fuzzer
- ✅ 敏感性（开发期坏真值）：partition-invalidate 4/12 红、link-swallow 1/15 红、
  link-transform-swallow 2/15 红、transformShrink 旧阈值 2/2 红
- 全量 npm test + 真实 PG/MySQL 套件见 PR 描述（提交前统一重跑）

## 五、诚实边界（更新后）

- 事件域：combined（1:1）关系 link 事件名维度、link 属性 update 事件、oldRecord 模式、
  SM 回声触发。
- async 域：entity/relation 级 async、并发 daemon 投递（CAS/锁竞争面走真实 PG 并发套件）。
- 活动域：group-as-root 实例分叉 footgun（文档化行为）、并发 dispatch。
- 迁移域：共享物理表退役、迁移中途 schema 观测面。
- 事务并发交错：独立专项（per-op 多连接调度器）。
- **操作性规则（新增）**：fail-silent 形态的诚实边界不允许只登记不探测——登记时必须
  附带损坏形态判断；下一轮收口时按「探针 → 红 → 收敛修复 → 入生成域」的顺序走。
