# r29：三支柱落地——fuzzer 扩域、驱动差分、迁移生成（2026-07-15）

> 任务：完成 r28 复盘承诺的三步硬活。产出 = 三个新生成式套件 + storage fuzzer 两个新模式
> + 五个致命/严重 bug 收口 + 一个开放家族建档。本文是执行纪要与发现档案；
> 计划面的登记在 `quality-foundation-plan-r27.md` §1.3/§1.4b。

## 一、交付物

| 支柱 | 套件 | 机制 | 规模（本轮验证） |
|------|------|------|------|
| fuzzer 扩域 | `writePathStructuralFuzz.spec.ts` 新增 filtered / extended 模式 | filtered entity/relation（嵌套链）+ merged (union) entity 进生成域；membership-only 事件对账 + filtered 谓词一致性（独立 JS 真值）+ merged 并集一致性 + 配对读取一致性（预言机第 8 条） | base 1–499 × 40 绿；extended 1–120 × 30 绿 |
| 驱动差分 | `driverDifferentialFuzz.spec.ts` | 同种子意图流，SQLite（主）/PGLite（副）经 id 双射逐操作对账：错误语义、事件多重集、update keys、端点存在性、全量逻辑快照 | 1–120 × 25-30 绿 |
| 计算层生成 | `computationGenerativeFuzz.spec.ts` | 随机 (源 × 聚合 × 宿主位置) 声明 × 随机写序列；每步朴素全量重算对照；源含 filtered 视图 | 1–60 × 15-20 绿 + 敏感性自检 |
| 迁移生成 | `migrationGenerativeFuzz.spec.ts` | 随机 v1（稳定 uuid）× 存量数据 × 加法变异 → 真实两步审查 migrate；存量保真/回填/朴素重算/冒烟写/kill-resume 收敛 | 1–60 × 12-15 绿（偶数种子注入崩溃） |

共享基建：`tests/storage/helpers/{fuzzRandom,fuzzSchema,fuzzOps}.ts`（决策流唯一实现，
四个 runner 复用）；`tests/runtime/helpers/migrationApproval.ts`（migration.spec 同步改为导入）。
决策流兼容性由 base 全池 1–499 重跑验证（逐位一致，否则老种子失效）。

## 二、发现与收口（fix-the-class 检查表逐条执行）

### MRG-1｜merged FK link 删除物理销毁宿主行（致命，extended seed 1 首跑抓获）

- **症状**：`M = merged(A, C)`，关系 `A --n:1--> B`（merged FK 落在 A 行）。
  `removeRelationByName` 删 link → **A 的整行从物理表消失**，仅有 link delete 事件。
- **机制**：r28 引入的 `clearOrDeletePhysicalRow` 行占用判定把
  `isFilteredEntity / isFilteredRelation / isMergedAbstract` 记录整类排除。
  merged 编译后物理身份列属于 merged-abstract 记录、input 是视图——两类都被排除
  ⇒ link 的行足迹之外"查无占用" ⇒ 走 DELETE ROW。
- **修复（收敛点）**：占用判定改按 **id 字段是否有值**，不按记录种类排除——视图与 base
  共享同一 id 字段，字段面判定天然去重。此判定只有这一个实现点。
- **读者枚举**：`deleteRecordSameRowDataGrouped`（canonical + 级联两轨都经此）✅；
  `clearRowDataForMigration`（搬迁清行）同函数复用 ✅。

### MRG-2｜combined 嵌套新建按视图名发号 → id 碰撞静默覆写（致命，extended seed 41）

- **症状**：`M = merged(C, E)`；`D --1:1 reliance--> C`。经其他 input 推进 M 的物理序列后，
  `create D { own: {…嵌套新建 C} }` 给 C 从 **'C' 名下的平行序列**发号 → 与 M 表既有 id
  相同 → 写路径按"外部 id"语义落列，**覆写既有记录的字段**（零 create 事件差异）。
- **机制**：顶层 create 的 `NewRecordData.recordName` 构造期已解析物理名；嵌套分类列表上的
  `attr.recordName / attr.linkName` 是**声明名**。四个发号点中三个用了声明名。
- **修复（收敛点）**：`CreationExecutor.allocateRecordId(recordName)`——一切发号经
  `resolvedBaseRecordName` 归一；RecordQueryAgent 的 flashOut 发号点同契约。
- **读者枚举**：`getAutoId` 全仓四个调用点逐一核对（406/478/522 + RecordQueryAgent:451）✅。

### MRG-3｜combined 嵌套新建 create 事件丢 type-dispatch 默认值（严重，extended seed 41/24）

- **症状**：同上形态，M 名下的 combined 子记录 create 事件 payload 缺 `score`（行=7、
  payload=null）与 `__type`。
- **机制**：`completeEventPayloadWithDefaults` 收到**解析后的物理名**——merged 的属性默认值
  经 `mergeProperties` 按具体类型分发（`__type` 判别列同理），物理名求 defaults 全部落空。
- **修复**：defaults 按 `record.originalRecordName`（声明名）求值；事件 `recordName`
  仍是物理名。快照完备性契约（r21 F-1 / r25 F-1 的产出面）在 merged 域闭合。

### MRG-4｜级联删除按声明面名字发 record delete（严重，extended seed 37）

- **症状**：reliance 级联删除 merged input 记录 → 事件流 `[delete C#1, delete C#1]`：
  视图名下双 delete、物理名（M）record delete **整体缺失**——监听物理名的计算对删除失明。
- **机制**：canonical 轨（`deleteRecord`）的 recordName 经 `RecordQuery.create` 已解析；
  级联轨（`sameTableReliance` / `handleDeletedRecordReliance`）以 attr 上的**声明名**直达
  `deleteRecordSameRowDataGrouped`。r18「字段 update 事件恒以物理名发出」的死监听不变量
  在 delete 轨上有同构要求，但只有一条轨遵守。
- **修复（收敛点）**：grouped 里 record delete 事件统一经 `resolvedBaseRecordName` 归一
  ——两条轨共用产出点，一处修复覆盖全部来路；视图名成员资格事件仍由 settle 负责（恰好一次）。

### MIG-1｜property 聚合模板全量 compute 对 to-one 崩溃（严重，mig-fuzz seed 3）

- **症状**：迁移给存量数据回填新增的 `Count.create({property: 'out'})`（out 是 n:1 的
  to-one 属性）→ `TypeError: relations is not iterable`。
- **机制**：`aggregationTemplate.compute` 裸 `for...of _current[relationAttr]`。
  运行期增量路径逐 link 事件维护、从不带着已填充的 to-one 走全量 compute——所以计算层
  fuzz 60 种子全绿、只有迁移轨（`runFullRecompute`）现形。**这是"同一声明面、不同消费轨"
  的又一实例**：计算的正确性不能只在增量轨验证。
- **修复（收敛点）**：模板的关联行读取点归一（对象→单元素数组）——六种聚合的 property
  模式共用这一个点。回归固化在 `migrationGenerativeFuzz.spec.ts` 的 deterministic 组。

### EXT-1｜merged input 作为 x:1/combined 端点的 Setup 装配错位（开放，建档）

- **症状**：`no such column: <alias>.<field>`——查询期 fail-loud。
- **代表种子**：extended 2/10/50/71/72/81（`FUZZ_MERGED_FULL=1` 复现）。
- **初判**：rebase 之后 link FK 字段或属性字段落错物理表（与 mergeLinks 无关，纯 merged ×
  x:1/combined 即触发）。需要专门一轮 Setup 装配审计（字段生成 → rebase → buildTables
  的三段一致性），不在本轮仓促修复。
- **风险面**：fail-loud（无静默损坏面）；CI 生成域已把 merged pair 限制在
  仅 n:n/无关系实体（`fuzzSchema.ts` CAUTION 注释 + 本表互为索引）。

## 三、方法论笔记（进 r30 的先验）

1. **扩域首跑必出货**：filtered 模式 200 种子全绿（r25-r27 多轮已收口该域）；merged 模式
   前 60 种子 10 红——「从未生成过的输入形状」仍是最大逃逸面，与 r28 复盘的预测精确一致。
2. **本轮五个修复共享一个类**：*写路径的身份判定必须区分「声明名 / 物理名 / 记录种类」三个
   概念面*。四个 merged bug 分别是发号、占用、defaults、事件名四个消费点在同一个类上跌倒。
   已在登记册补「概念寄生位置 × 写路径身份消费点」轴。
3. **差分预言机的第一个产出是契约决策而非 bug**：种子 35 暴露「同操作内兄弟事件的顺序在
   两驱动上不同」——按 r25 时间戳归一的先例，决策为**多重集一致、顺序不承诺**并写进套件
   头注。差分 fuzz 的价值一半在抓分裂，一半在把隐式跨驱动契约显式化。
4. **迁移 fuzz 的 kill-resume 注入触发率 ~2/3**（其余种子在故障点前完成）——两种终态
   （崩溃恢复 / 完整跑完）都必须收敛到同一预言机，天然覆盖"故障点晚于完成"的边界。
5. **预言机敏感性自检应成为惯例**：计算层 fuzz 落地时先用坏真值验证 6/6 种子变红再转绿。
   全绿的预言机首先要证明自己会红。
