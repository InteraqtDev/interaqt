# 深度评审第三十五轮（2026-07-16）

- 日期：2026-07-16
- 基线：`main` @ `f47a8b3e`（v4.3.0，性能债收口轮 PR #49 合入当日）
- 性质：全库深审（重点：v4.3.0 新合入的性能轮代码 + 34 轮未覆盖的声明契约面）
- 分支：`cursor/deep-review-r35-fatal-fixes-2d63`
- 修复后健康度：`npm run check` 通过；`npm test` 全量 **2367 passed / 49 skipped**（基线 2336/49，
  净增 31 个 r35 回归用例）；真实 PostgreSQL 16 七套件 **33 passed**；fuzz 全池绿：
  storage 结构 fuzz 扩池（seed 100–199 × 40 ops）108、extended 池（seed 1–60）68、
  计算生成 60、驱动差分 60（含真实 PG 次驱动）、迁移生成 31（含 kill-resume）、
  迁移破坏性 30、声明 taboo 51（含新格）。

---

## 〇、方法与总判断

**方法**：四路并行深审（runtime 调度/计算、storage 查询/写路径、迁移引擎、builtins/驱动/core
声明面），每路先枚举「最近改动 + 历轮登记的开放面」，候选缺陷一律先构造最小复现定谳再修复；
修复遵循「修类不修例」（收敛点 + 读者枚举 + 邻域格 + 登记册回灌）。

**总判断**：v4.3.0 当日合入的性能轮代码本体质量良好（两段式分页、EXIST 终段剪枝、B5 批量化、
A2 分批、C1 API 的核心逻辑均未发现致命缺陷）；本轮定谳的 5 个致命缺陷全部是**长期潜伏的
契约面缺口**——其中两个（EXIST 否定量化、async 回调静默强转）自相应特性引入起就存在，
存活了全部 34 轮评审。共性教训见 §四。

---

## 一、致命缺陷（全部已修复，红-绿证据齐备）

### F-1｜EXIST 原子的否定量化按扇出行而非按根记录（storage 查询编译，静默错结果）

**症状**：`find('Org', atom({key:'groups.members', value:['exist', role=admin]}).not())`
在 orgA 拥有 G1(user)+G2(admin) 两个组时**返回 orgA**（正确语义应排除——orgA 存在 admin 组）。
同一 match 驱动 `update`/`delete` 的受害行选择。

**机制**：多段 exist 原子的父路径（`groups`）入外层 JOIN 树，EXISTS 只关联**直接父别名**。
父路径是 x:n 时外层每个扇出行独立求值 `NOT EXISTS`：G1 行（无 admin）使谓词为真 → orgA 通过。
否定与隐式存在量化不对易：¬(∃ 组 ∃ admin 成员) ≠ ∃ 组 ¬∃ admin 成员。正向 exist 无此症
（任一满足行保根，链式存在量化与逐行量化等价），因此 34 轮的正向用例全绿。

**修复**（收敛点 `MatchExp.existAtomCorrelation`，buildQueryTree 剪枝与 SQLBuilder 关联条件
共用同一判定）：父路径含（非对称）x:n 段的 exist 原子整条折叠进 EXISTS——子查询以**完整
反向路径**（`getReversePath`）直接关联根记录 id，外层零 JOIN。副产收益：此类查询不再触发
post-pagination/两段式，LIMIT 直接下推。

### F-2｜嵌套 EXIST 关联绑到最外层根的列（r25#7 的机制定谳，静默空集）

**症状**：`atom({key:'groups', value:['exist', atom({key:'members', value:['exist', P]})]})`
恒返回空集（r25 起登记为「深嵌 EXIST 别名碰撞风险/不工作」，从未定谳机制）。

**机制**：关联原子经 isReferenceValue 路径解析，解析作用域是 `contextRootEntity`（最外层根，
逐层继承）。内层 exist 的关联 `member.group_fk = ?` 被解析成 `= "OrgQ"."org_id"`（跨实体
id 比较）而非外层子查询的 `"OrgQ_groups___GroupQ"."gro_id"`——恒不相等 → 空集。

**修复**：关联原子在 `parseFunctionMatchAtom` 内**预解析**成「直接外层查询的别名（含前缀链）+
物理列」，以内部标记 `isResolvedFieldReference` 直接嵌入（与 `physicalRowMatch` 同构的内部
标记先例）；子查询前缀串联外层前缀，深嵌别名全局唯一（一并消除 r25#7 登记的遮蔽碰撞风险）。
用户写的 isReferenceValue 引用按既有契约仍解析自最外层根作用域，不受影响。

**回归矩阵**：`tests/storage/existCorrelationScope.spec.ts` —— {正向, NOT} × 中段基数
{全 x:1, 1:n, n:n, 双 x:n} × 终段基数 {x:1, x:n} × {find, update 选择, delete 选择} ×
{PGLite, SQLite}，20 格。**登记边界**：对称段/`&` 段路径维持 legacy 父关联编译；
x:n **值原子**的 NOT 维持 SQL 三值逐行语义（见 §三.1 契约决策）。

**收口自查抓获的邻格回归（当场修复）**：中段是 **filtered relation** 时，rebased link 谓词
AND 在外层、与路径原子共享 JOIN 别名才有「同一条边」语义（r25 F-2 的中段同族）——root
折叠会把 EXISTS 的量化域扩大到全部 base 边、谓词落在独立扇出行上（探针：orgA 的 admin 在
cold 组、hot 组只有 user，root 折叠形态幻影命中 orgA）。该形态在既有测试中**零覆盖**
（初版修复下全量 2367 依然全绿，只有邻域探针现形）。收口：`convertFilteredRelation` 对
产生外层 rebased 谓词的 exist 原子打 `hasRebasedPathPredicate` 内部标记，
`existAtomCorrelation` 对其维持 'parent'；矩阵补 filtered 中段格（正向 + NOT）。

### F-3｜同步契约回调面对 async 函数零告警强转（core 声明面，静默数据损坏）

**症状**：`Count.create({record, callback: async (item) => item.flag})` 把**所有**记录计入
（复现：2 条记录 flag 一真一假，count = 2）。同族：Every/Any 恒 true、WeightedSummation
贡献恒 0（`Number(promise)` = NaN → 0）、`Property.computed`/`Property.defaultValue`/
`Dictionary.defaultValue` 把 Promise 序列化成 `"{}"` 落库（字符串列全静默；数值列在 PG 上
裸驱动报错）、`RealTime.nextRecomputeTime`（`now + promise` = NaN）、`Custom.createState`/
`planIncremental`（state/计划变成 Promise）。

**机制**：这些消费点不 await 返回值（`!!v` / `Number(v)` / 直接落库），类型声明（`Function`）
与生态直觉（框架里到处是合法的 async 回调——Transform/Custom compute/Condition 都支持）
都不拦。**仓库自己的测试夹具就是活体样本**：`tests/runtime/data/leaveRequestSimple.ts` 的
`computed: async function(){ return 'pending' }` 三十余轮一直在静默落 `"{}"`，无断言读它所以
从未暴露。

**修复**（两层收敛）：
1. 声明期：`PublicFieldDef.synchronous` 元数据 + `validateCreateArgs` 统一执行（r26 声明期
   校验汇合点的自然扩展）；Property/Dictionary 的手写 create() 走同一 helper
   `assertSynchronousFunctionArg`。七个同步契约面全部拒绝 async 函数，错误信息说明强转后果。
2. 消费期：聚合模板 `assertSyncCallbackResult` thenable 守卫，兜底声明期构造器名检测覆盖不到
   的残余形态（transpile 到 ES5 的 async、同步函数返回 Promise）——聚合贡献经 increment
   不可逆累积，必须 fail-fast。

异步合法面（Transform.callback / Custom.compute / RealTime.callback / StateNode.computeValue /
StateTransfer.computeTarget / Condition.content——均有 await）在回归里正面钉住防过度收紧。
taboo 套件新增声明格。

### F-4｜迁移 Transform 重建的合成事件流缺派生事件（迁移引擎，静默错值 + 成功报告）

**症状**：Product → Transform(Discount) → filtered(BigDiscount, value>15) → Summation。
迁移把 Transform 改为 `value = price*0.5`（全部成员退出视图）后，sum **残留 20**（应为 0），
迁移状态 succeeded。

**机制**：r32 已把迁移 patch 轨 / property 轨收敛到「storage 事件为真相源」，但
`recomputeTransformOutput`（entity/relation 全量重建轨）仍手工合成裸 create/update/delete
事件——filtered 视图的成员资格派生 delete 不在流里；链式依赖走增量轨时
`resolveFilteredUpdateEvent` 对已退出成员返回 null，退出面被静默丢弃。r32 收口时的读者枚举
漏掉了这第三条合成轨（修类不修例的又一实证）。

**修复**：三个写分支（takeover 清空重建 / diff update/create / stale 删除）全部把 storage
事件数组传入 create/update/delete，转发完整产出（完整前态 + 派生事件）。
回归：退出格 + 「留存更新 + 退出」混合格（进入面在旧实现下恰好工作，单向断言失明）。

### F-5｜迁移删除审计的 recordName 过滤只存在于注释（迁移引擎，审批面污染 + fail-closed 死路）

**症状**：硬删除宿主带 n:n 关系时，`generateMigrationDiff({includeDestructiveScope:true})`
的 scope ids 为 `['1','1']`（宿主 id + link 级联 id，SQLite 整型发号两者同号）——审批人看到
的 id 集合是错的。当级联感知模拟不可用（MySQL / 缺 handler / 模拟异常）回退分析性 scope
（仅宿主 id）时，执行侧收集的污染集合与批准集合**永不相等**——无法批准的失败循环。

**机制**：`collectAuditedDeletions` 的注释明确写着「只有 recordName 与计算输出一致的 delete
计入」，但循环体从未检查 `event.recordName`。模拟与执行共用收集器时两侧同源污染互相抵消
（对账通过但呈现错误 id），fuzz 因此失明。

**修复**：补上注释声明的过滤（一行）+ F-4 的事件流变化协同（派生事件进流后由本过滤正确排除）。
回归：host-only scope 断言 + 按 host-only 批准端到端单轮收敛。

---

## 二、显著缺陷（已修复）

| # | 缺陷 | 机制 | 修复 |
|---|------|------|------|
| S-1 | `atomic.compareAndSet` 跳过 timestamp/json 写参归一化（r26 契约的兄弟读者，r24-r26 归一化家族的漏格） | expected/next/defaultValue 裸绑定：SQLite 上 Date 直接抛绑定错误、ISO 字符串与 INT 毫秒列恒不相等——**静默 false**，调用方误判为并发竞争失败；PGLite 靠 PG 文本强转偶然通过（方言掩蔽） | 三个参数全部走 `normalizeRecordFieldParam`（与 replace 同一契约）；回归 Date/ms/ISO × SQLite/PGLite × 含反例 |
| S-2 | activity 头交互的 postCommit 拿不到 activityId | dispatch 每次尝试克隆 args，guard 只回填克隆（attemptArgs）；`runPostCommitHook` 收到的是原始 args——头交互创建的 activityId 对 postCommit 不可见 | postCommit 接收**已提交尝试**的 args；回归断言 postCommit 的 args.activityId === result.context.activityId |
| S-3 | 两段式分页 × forUpdate 的潜在锁语义漂移（防御性） | 第一段选页查询不加锁；「无锁读选页 → 第二段锁成员」≠「锁全部命中行再切片」。当前 lock API 不携带分页（无现行 bug），守卫防未来调用方静默漂移 | `usePagedRootIds` 增加 `!forUpdate` 条件（回退单语句旧路径） |

---

## 三、契约决策与登记边界（本轮定谳，不改码）

1. **NOT × x:n 值原子维持 SQL 三值逐行语义**：`atom({key:'groups.name', value:['=','G1']}).not()`
   返回「存在名字≠G1 的组」的根（且无组的根因 NULL 行三值逻辑**不在补集**）。与 exist 原子
   （量化子显式，¬∃ 语义已修复）不同，值原子的量化语义从未显式声明，改动是契约决策而非修复；
   与 r28#5 NOT(combined) 的二值决策同族登记。已入登记册「隐式量化算子的否定语义」轴。
   **建议**（下轮设计评审）：文档化「x:n 路径值原子 = 存在量化，否定不对易；需要集合语义
   请用 exist」，或长线上把 x:n 值原子统一改写为 exist 原子（正向语义等价、副产扇出消除，
   但牵动 B4 两段式的适用面，需按 quality-plan 纪律单独立项）。
2. **两段式分页的跨语句读边界**：READ COMMITTED 下并发写者可以在两段之间让页成员不再满足
   业务谓词（返回行内容与谓词可能不自洽）。select-ids-then-fetch 的行业标准语义；
   SERIALIZABLE 事务内两段共享快照无此漂移。已文档化于分页分支。
3. **对称段/`&` 段 exist 路径维持 legacy 父关联编译**：对称方向变体与反向路径折叠的交互
   未定谳；NOT 语义在该形态仍按扇出行（登记边界，existCorrelationScope 头注声明）。
4. **聚合 update 分支的多 link 循环**：复核 relatedAttribute 形态约束（≤3 段、[1]='&'）与
   「两实体间至多一条 link」不变量后，多命中集合在现行形态下不可构造——find+循环是比 findOne
   更强的防御性写法，维持。
5. **A2 keyset 分批的内存半场**：分批只约束单条 SQL 的物化规模，dirtyRecordsAndEvents 数组
   仍持有全部宿主（事件协议使然）。登记为 A2 终局设计（集合式重算计划）的待办组成部分，
   见 performance-debt-plan §四 1.2。

---

## 四、复盘：为什么这五个致命缺陷能存活 34 轮

1. **正向用例对否定量化失明**（F-1/F-2）：exist 的全部历史用例都是正向（正向的逐行量化与
   链式存在量化恰好等价）；B1 剪枝轮新增的 `existJoinPruning.spec.ts` 七格也全部正向。
   「对合法声明组合的**否定形式**逐一铺格」此前不在任何维度轴上——登记册新增
   「隐式量化算子的否定语义」轴。
2. **类型系统的静默强转是声明面缺口的放大器**（F-3）：`Function` 类型接受 async 函数，
   `!!`/`Number()` 强转 Promise 不抛错。r31 已修「非函数 defaultValue 静默忽略」同族缺口，
   但当时的读者枚举只覆盖了「非函数」取值，没有枚举「async 函数」取值——同一声明面的
   相邻格。夹具活体样本（leaveRequestSimple）说明该错误在真实用户代码中必然高频。
3. **收敛点收口后的读者枚举不完备**（F-4）：r32 把「storage 事件为真相源」落到 patch 轨与
   property 轨，但 entity/relation 全量重建轨（`recomputeTransformOutput`）是同一契约的
   第三个读者——修类不修例清单第 1 条的又一实证。
4. **注释声明的守卫没有代码**（F-5）：与修类清单第 3 条「把已知规则提升为受检不变量」正对：
   注释写了过滤规则、代码没有执行它，且模拟/执行两侧同源污染互相抵消让对账测试失明。
   「注释里的『只有…才…』必须有对应代码行」——review 时对审计/守卫类函数逐条核对注释与实现。
5. **方言掩蔽 + 兄弟 API 漏测**（S-1）：r26 修 replace 时 CAS 是同一契约的未测兄弟；
   PGLite 的文本强转让 PGLite-only 测试永远绿（r27 I-3 方言匹配探针教训的重现）。

---

## 五、验证证据链

- ✅ `npm run check`
- ✅ `npm test` 全量 2367 passed / 49 skipped（基线 2336/49，净增 31 个 r35 回归）
- ✅ 真实 PostgreSQL 16：`npm run test:postgres` 七套件 33 passed
- ✅ storage 结构 fuzz：base 扩池 seed 100–199 × 40 ops（108 passed）+ extended 池 seed 1–60（68 passed）
- ✅ 驱动差分 fuzz：60 种子（PGLite 恒开 + 真实 PG 次驱动）
- ✅ 计算生成 fuzz：60 种子；迁移生成 fuzz：30 种子（含 kill-resume）；迁移破坏性 fuzz：30 种子
- ✅ 声明 taboo：51 用例（含新增 async-callback 格 × 3 环绕种子）
- 红-绿（修复前基线复现 → 修复后转绿）：
  - F-1：`[orgA,orgB,orgC]` → `[orgB,orgC]`；F-2：嵌套 exist `[]` → `[orgA]`
  - F-3：async Count 计数 2 → 声明期拒绝；async computed 落 `"{}"` → 声明期拒绝
  - F-4：退出后 sum 20 → 0；F-5：scope `['1','1']` → `['1']` + 端到端批准收敛
  - S-1：SQLite CAS(Date) 抛绑定错误 / CAS(ISO) 静默 false → 三形态全过 + 反例仍 false
  - S-2：postCommit args.activityId undefined → 与 result.context.activityId 一致

## 六、致谢边界（诚实声明）

- MySQL env-gated 套件本轮未跑（环境无 MySQL；本轮改动不含 MySQL 方言分支，风险面为
  exist SQL 在 MySQL 上的语法兼容——EXISTS/别名引用均为标准 SQL，且驱动差分的 MySQL 轨
  留给 nightly）。
- `existAtomCorrelation` 的 'root' 模式对**对称段**路径刻意不启用（登记边界 §三.3）。
- 深嵌 exist 的别名前缀链在极深嵌套（>4 层）下可能逼近 PG 63 字节标识符上限——前缀机制
  与既有实现同源（本轮只是让链条完整），超限形态此前也不工作；登记待 aliasManager 统一治理。
