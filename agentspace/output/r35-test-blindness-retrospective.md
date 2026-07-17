# 深度反思：为什么已有的测试体系此前没有抓到 r35 的这些致命 bug

- 日期：2026-07-17
- 关联：`deep-review-2026-07-16-r35.md`、历轮复盘（r17/r18/r30/r31 建立的盲区分类学）
- 证据纪律：每条归因附可核查证据（生成器源码锚点 / 基线红-绿实验 / 夹具法医检视）。
  三个新防线机制全部做了**敏感性实验**（在未修复基线上运行必须变红）——
  不能在基线上变红的"防线"只是仪式（r30 规则 6）。

---

## 〇、先给结论：七个缺陷的一句话逃逸机理

| 编号 | 缺陷 | 逃逸机理（一句话） | 盲区类型 |
|------|------|------------------|---------|
| F-1 | NOT × 多段 exist 按扇出行量化 | 正向存在量化下「逐行」≡「按根」**数学上重合**，全部历史用例都是正向——测试宇宙在两种语义的重合区里铺满了格 | 语义重合区遮蔽 + 查询语言无独立预言机 |
| F-2 | 嵌套 exist 关联绑错作用域 | r25 登记为「别名碰撞**风险**、未构造红例」——登记的机制假设是**错的**（真相是关联作用域解析），错误假设让后续轮次以为它是深嵌自连接才触发的奇异格 | 登记项无可执行 pin + 机制假设未经验证 |
| F-3 | async 回调静默强转 | 手写测试的作者知道契约、生成器产出的回调天然同步——**没有任何设施枚举"类型系统放行的似真错误声明"**；taboo 套件只验证已存在的守卫，不发现缺失的守卫 | 声明空间的似真错误维度缺失 |
| F-4 | 迁移 Transform 重建缺派生事件 | r32 收敛「storage 事件为真相源」时豁免了 entity/relation 轨——豁免理由（"依赖走全量重算"）只对 eventRebuildHandler 子路径成立，对同轨的 recomputeTransformOutput 子路径**前提不成立**；且 r32 自己立的「进入+退出双向铺格」规则没有回灌到既有的 enter-only 测试 | 豁免前提未逐子路径验证 + 登记册新轴无回灌机制 |
| F-5 | 删除审计 recordName 过滤只在注释里 | 唯一的 scope 检查是「批准集合 == 执行集合」，而两侧共用同一收集器——**共享实现的污染在两侧同源出现并相互抵消**，相对对账对它结构性失明 | 相对预言机自指 |
| S-1 | compareAndSet 跳过 timestamp 归一化 | r26 修 replace 时 CAS 是同一接口的未测兄弟方法；PGLite 文本强转让 PGLite-only 探针恒绿 | 接口方法 × 值类型矩阵无枚举审计（r27 I-3 家族重现） |
| S-2 | postCommit 拿不到 activityId | args 逐尝试克隆与 postCommit 消费分属两次改动，无人拥有「提交后消费者看到已提交尝试状态」这条横切不变量 | 横切不变量无属主 |

**跨案例的新结论**（相对历轮复盘的增量）：34 轮建成的预言机群——写路径快照对账、
计算朴素重算、事件完备性、驱动差分、迁移 kill-resume——**全部把读路径当测量仪器**。
仪器本身（match 语言的编译语义）从未被校准：驱动差分两侧跑的是同一份编译产物，
编译器级语义缺陷在两侧产出**相同的错误结果**，差分恒绿。r35 的 F-1/F-2 就住在
仪器的刻度误差里。

---

## 一、F-1/F-2：查询语义空间是 34 轮防线共同的结构性盲区

### 1.1 证据：三层设施对 match 语义各自失明的方式

| 设施 | 查询生成域（源码锚点） | 失明方式 |
|------|----------------------|---------|
| 写路径结构 fuzz（`writePathStructuralFuzz`） | `fuzzOps.ts` 的全部 match 只有 `{key:'id', value:['=',…]}`（L170/172/176） | 查询面 = id 点查。exist / NOT / 路径原子完全不在生成域 |
| 驱动差分 fuzz（`driverDifferentialFuzz`） | 读取面 = `find(entity, undefined)` 全表 + 快照对账（L353–357） | 即使加入 match 也无济于事：两侧执行**同一份编译语义**，编译器缺陷两侧同错、对账恒绿 |
| 手写 exist 用例（`existJoinPruning` 等） | 七格全部正向；L199–201 的注释原文：「嵌套 EXIST 在基线实现上就不工作（记录为既有缺口）……此处不断言」 | 正向格在语义重合区内（见 1.2）；已知不工作的形态**主动放弃断言** |

### 1.2 数学结构：为什么正向用例永远发现不了 F-1

对隐式存在量化的路径原子，「按扇出行量化」与「按根记录量化」在**正极性下重合**：
任一满足行保根 ⟺ ∃ 链满足（dedupe 折叠重复）。两种语义只在**否定**下分离：
¬(∃ 中间 ∃ 终端) ≠ ∃ 中间 ¬∃ 终端。所以只铺正向格的测试宇宙对这两种实现**不可区分**——
不是「测试少了一格」，而是**现有全部格都落在两个语义的交集里**。极性是让语义类
分离的必要维度，这一点此前不在任何轴上（登记册 r19 的「否定形命题」轴讲的是
权限 fail-open 的对抗性断言，没有推广到查询语言的量化算子）。

### 1.3 F-2 的教训比 F-1 更尖锐：错误的机制假设让登记项失效十轮

r25#7 登记原文是「深嵌 EXIST × 多 self-join 的**别名碰撞风险**……未构造出红例」。
真机制（r35 定谳）是关联引用按 `contextRootEntity` 解析、嵌套时绑到最外层根——
**任意**嵌套 exist 100% 返回空集，根本不需要 self-join 或深嵌。错误的机制假设产生了
两个后果：(a) 后续轮次把它当成奇异角落格而非「特性整体不工作」；(b) B1 性能轮触碰
同一函数、甚至在注释里承认「嵌套 EXIST 不工作」，仍然没有触发定谳——因为登记项
没有携带任何**可执行物**（红例 / `test.fails` pin），机制假设无从被证伪。

### 1.4 机制落地：查询语义的独立预言机（本复盘的主产物）

`tests/storage/matchSemanticsFuzz.spec.ts`：与 SQL 编译**零共享**的内存求值器
（Kleene 三值逻辑 + 链式存在量化），对随机数据 × 随机布尔表达式树逐条对拍
`find()` 的 id 集合。生成域 = 契约干净子集：x:1 路径值原子（含 NULL 三值、
IS NULL 翻译、in/not in）、exist 原子（单段 1:n / n:n、多段、x:1 前缀、n:n 中段→
x:1 终段、嵌套载荷）、AND/OR/NOT 任意嵌套。刻意排除并登记：x:n 值原子（量化
契约未声明）、对称/filtered 中段（legacy 编译边界）、引用值、like。

**敏感性实验**：同一套件在未修复基线（`main` @ c01f0808）上 **10 种子 7 红**
（全部命中 `NOT`/嵌套 exist 分歧），修复后默认池 25 种子 × 12 表达式全绿。
即：这个预言机若早存在一轮，F-1/F-2 活不过当轮的默认池。

---

## 二、F-3：声明空间缺「似真错误」维度，且夹具自己就是活体样本

### 2.1 taboo 套件的辖区错觉

`declarationTabooFuzz` 是**守卫一致性**套件：每个格对应一个**已存在**的声明期守卫，
断言它在任意环绕 schema 下都响。它天然无法发现**缺失的守卫**——r35 前不存在
async 拒绝守卫，所以不存在对应的 taboo 格，所以套件恒绿。「守卫清单即测试」的
纪律保证了守卫不退化，但守卫清单的**完备性**没有任何机器压力。

### 2.2 同一声明面的相邻格：r31 修了「非函数」，没枚举「async 函数」

r31-H6 修复「`defaultValue: 'user'` 字面量被静默忽略」时，读者枚举覆盖了
**值的类型维度**里的「非函数」取值，但没有继续枚举「函数的子类」——async 函数
是 `typeof === 'function'` 放行、消费点强转损坏的相邻格。「修类不修例」清单
第 1 条的枚举对象此前默认是「消费方」，r35 补充：**声明值空间的取值也要枚举**
（类型系统放行 ≠ 契约允许）。

### 2.3 夹具法医：`leaveRequestSimple.ts` 的 async computed 落了三十余轮 `"{}"`

该夹具 2025 年起就声明 `computed: async function(){ return 'pending' }`——
r35 声明守卫落地当天它立即被拒绝（红），证明这不是理论风险而是**真实用户必然
高频犯**的错误（框架作者自己都犯了）。它能活这么久是因为没有断言读取 `result`
列——r31 复盘已命名这个形态（「绿灯下夹具自己的数据里躺着 undefined」），
r35 是同型再现：**夹具里未被断言消费的声明是缺陷的天然栖息地**。

### 2.4 机制落地：回调同步性契约的机器化盘点

`tests/core/callbackSynchronyContract.spec.ts`：遍历 `KlassByName` 全部注册类的
`static.public`，收集 `type:'function'` 字段，与两份显式决策清单（SYNC_CONSUMED /
ASYNC_LEGAL，每项注明消费点锚）做**集合相等**断言——新增任何 function 声明字段
而不做决策，测试即红。同时断言 SYNC_CONSUMED 项全部携带 `synchronous: true`
元数据（守卫接线的台账）。

**该 meta-test 首跑就抓到两处真实台账缺口**：Property/Dictionary 的元数据没标
`synchronous`（r35 修复时只接了手写守卫、没有回填元数据）、RealTime 的注册名
实为 `RealTimeValue`。枚举型防线的价值在首跑即兑现。

---

## 三、F-4：收敛契约的豁免粒度与登记册新轴的回灌缺失

r32 把「storage 事件为真相源」收敛到迁移的 patch 轨与 property 轨时，对
entity/relation 轨写下豁免："eventRebuildHandler 的全量替换刻意不流事件——
授权模型是人工批准的 handler、依赖计算经 rebuildPlan 走全量重算"。豁免理由的
两个前提对同轨的 `recomputeTransformOutput` 子路径都不成立：它不是 handler 授权
（是 compute 重算），它的依赖也**不必然**走全量（`pendingEvents.length && !isSeed`
时走增量）。**豁免按轨道粒度书写、子路径按不同前提运行**——豁免必须逐子路径
验证前提，否则豁免区就是下一个缺陷的合法住所。

第二个失守点：r32 的登记册行明文写着「迁移轨的链式依赖回归必须铺『成员资格
进入 + 退出』双向」，但既有的 enter-only 测试（`migration.spec.ts` L814，factor
1→2 只走进入/留存面）从未按新轴回灌升级。**登记册新增轴时没有任何机制强制
审计既有格**——「修 bug 时扫邻格」的清单不覆盖「立轴时扫旧格」。

第三个证据：迁移两个生成式 fuzz 的 schema 域都是 `filteredEntities: []`
（`migrationGenerativeFuzz` L176、`migrationDestructiveFuzz` L200）——
Transform → filtered 视图 → 聚合的链形不在任何生成域内。登记为生成域扩张跟进项。

---

## 四、F-5：相对预言机的自指盲区（判据方法论的新分类）

迁移 scope 的唯一检查是 `assertExecutedDeletionsApproved`：「批准 ids == 执行 ids」。
批准侧（模拟）与执行侧共用 `collectAuditedDeletions`——**同一实现的两个输出互相
对账，证明的是一致性不是正确性**。共享收集器里的污染（link 级联 id 记入宿主
scope）两侧同源出现、精确抵消，对账永远绿；破坏性 fuzz 的 hardDeletion × 关系格
因此十足地跑了两轮而不响。污染只在两侧**不共享**实现时（分析性回退）才变成
可见的失败——而回退路径在 fuzz 里永远不触发（PGLite 支持事务性 DDL，模拟恒可用）。

叠加一层 id 形态掩蔽：SQLite 整型发号下宿主 id == link id，污染呈现为「重复的
同一 id」；PGLite uuid 下污染是显眼的外来 id——但**没有任何断言看过 scope 的
内容**（相对对账不看内容，opt-in 测试只断言 approve→migrate 往返成功）。

**机制落地**：`migrationDestructiveFuzz` 新增**绝对下界预言机**——每个
destructive-scope 决策的 ids 必须是该 recordName 迁移前存量行 id 的**无重复子集**
（地面真值独立查询，不经过收集器）。敏感性实验：基线代码上 24 种子 **3 红**
（hardDeletion × 关系格的外来 link uuid 被当场点名），修复后全绿。

**方法论升华**：判据分两级——相对判据（两个实现/两侧输出对拍）对**共享面**的
缺陷失明；每个相对判据群里至少要有一条**绝对判据**（与被测机制零共享的地面真值）。
计算层的朴素重算对拍之所以强，正因为朴素实现与增量实现零共享；迁移 scope 此前
只有相对判据。

---

## 五、S-1/S-2：已命名模式的重现（简记）

- S-1（CAS timestamp）是 r27 I-3「兄弟读者漏测」+ r24 起「方言掩蔽」两个已命名
  模式的合取重现。系统性缺口：**接口方法 × 值类型**的完备性枚举（atomic 面有
  get/increment/replace/compareAndSet/lockGlobal/updateGlobalFields × number/boolean/
  string/json/timestamp）至今靠人工。§二.4 的枚举式 meta-test 思路可平移到 atomic
  面（登记跟进，本轮不落）。
- S-2（postCommit args）：横切不变量（「提交后消费者拿已提交尝试的状态」）在两次
  独立改动之间失去属主。无普适机制可立，归档为 review 检查项：新增「尝试隔离」
  类机制时枚举全部提交后消费者。

---

## 六、机制落地清单与敏感性证据

| 机制 | 载体 | 敏感性（基线红 / 修复绿） |
|------|------|--------------------------|
| 查询语义独立预言机（三值 + 链式量化 vs SQL 编译对拍） | `tests/storage/matchSemanticsFuzz.spec.ts`（默认 25 种子 × 12 表达式；`FUZZ_MATCH_SEED_START/COUNT/EXPRS`） | 基线 10 种子 7 红（NOT/嵌套 exist 分歧）→ 修复后全绿 |
| 回调同步性契约盘点（KlassByName 枚举 × 双清单集合相等 + synchronous 台账） | `tests/core/callbackSynchronyContract.spec.ts` | 首跑抓到 Property/Dictionary 元数据缺标（真实台账缺口）→ 补标后绿 |
| destructive-scope 绝对下界预言机（ids ⊆ 迁移前存量 × 无重复） | `migrationDestructiveFuzz.spec.ts` 预言机 0 | 基线 24 种子 3 红（外来 link uuid 点名）→ 修复后全绿 |
| 极性轴 / 同步性轴 / 量化否定轴 | 登记册三行（r35/r35b，上一轮已落） | — |
| taboo 格：async callback 声明拒绝 | `declarationTabooFuzz` 新格（上一轮已落） | — |

## 七、同类邻格清扫（复盘后追加执行的第二遍扫描）

按 §一 的七个盲区类，对「同类还有哪些格没被机器化检验」做了系统清点并当场处置：

| 类 | 邻格 | 探测结果 | 处置 |
|----|------|---------|------|
| F-1 类（查询语义） | x:n **值原子**族（P3 家族，含 NOT 三值逐行契约） | — | **预言机扩域**：matchSemanticsFuzz 增加「赋值枚举」模型（LEFT JOIN 树每个 x:n 节点选行、空集选 NULL 行、整树三值求值、∃ 赋值为 TRUE），把登记的契约决策从文字变成机器 pin。敏感性实验：把模型换成「先 ∃ 后 NOT」的集合语义，25 种子**全红**——预言机能区分两种量化语义，正是 F-1 所在的轴 |
| F-1 类 | r25#6「dedupe 扇出少去重风险」（登记两轮未定谳） | — | **机器化定谳**：预言机新增恒定不变量「find 结果无重复根 id」（SELECT 列全部来自根/x:1 路径 ⇒ 扇出行整行相同 ⇒ dedupe 必然完全），每条对拍表达式都检查 |
| F-1 类（兄弟读者） | 内存 match 求值器对 exist 原子的处理 | `Scheduler.evaluateRecordsMatch`：exist 落 `compareMatchValue` 的 default → undefined → 保守 full recompute ✓；`scopedSequenceMatch`：声明期操作符白名单（`validateScopedSequenceMatchExpression` 只放行 =/!=/is null/is not null/in/not in），exist 无法到达求值器 ✓ | 判定健全，无需改动（`evaluateAtom` 缺 default 分支的不可达性由声明白名单保证，已核对） |
| F-1 类（登记边界） | 对称段 exist 的行为（此前只有文字边界） | 单段对称：正向 + NOT 都按根量化 ✓（parent 锚即根）；对称**中段** × NOT：扇出行量化（b 的好友 a[有 hot-post]+c[无]，¬∃ 应排除 b、当前放行 b） | **可执行 pin 落地**（existCorrelationScope 新格，双驱动）：正向语义正面钉住，NOT 的扇出行量化按登记边界 pin 死——行为变化即红，改动按契约决策处理 |
| F-3 类（残余消费面） | 声明期构造器名检测覆盖不到的 thenable 落库（用户 payload 忘 await：`create('X', {note: someAsync()})`） | 复现：**静默落库 `"{}"`** | **收敛点守卫**：`SQLBuilder.prepareFieldValue` + 兄弟归一化器 `MonoSystem.normalizeRecordFieldParam` 拒绝 thenable 字段值（报错带逻辑属性名）。一个守卫同时覆盖 payload 忘 await 与 async defaultValue/computed 的 transpile 残余 |
| F-4 类（合成事件点） | 机械枚举 runtime 全部 `events.push({...})` 手工合成点 | 仅剩 `recomputeFilteredMemberships`（L3793/3816/3825）与已豁免点 | 健全：filtered 成员资格本身**就是**派生事件、无 storage 写可捕获，合成是唯一形态（豁免理由前提逐点核对过） |
| S-1 类（兄弟值类型格） | CAS × boolean × SQLite/PGLite | `cas(false→true)=true / 重复=false / (true→false)=true` 两驱动全对 | 健全（驱动 query() 统一转换 boolean 参数），无需改动 |

## 八、登记跟进台账（r36 收口轮回填）

1. match 语义 fuzz 生成域扩张——**r36 已落**：between / 引用值（`NULL=NULL` 按 UNKNOWN
   建模；跨关联引用路径入生成域）/ filtered 视图作为查询根（双根对拍）/ 对称单段 exist。
   仍登记：like（方言大小写分裂）、对称/filtered **中段**（legacy 编译边界，
   existCorrelationScope 已 pin，随未来定谳一并解锁）。
2. 迁移 fuzz 的 filtered 链——**r36 已落（破坏性轨）**：全部变异共享 Derived→Big→Summation
   链 + `transformValueChange` 变异（update 派生事件的成员资格退出面），绝对朴素重算
   预言机对账；基线敏感性 seed 43 红（F-4 签名）。仍登记：加法轨（migrationGenerativeFuzz）
   同构扩域。
3. atomic「方法 × 值类型」矩阵——**r36 点探两格出货一修**：global json CAS 缺规范化比较
   （r25 record 修复的兄弟格，PG 系裸报错 / SQLite 键序敏感静默 false，已修 + 回归）；
   CAS×boolean 双驱动健全。仍登记：枚举式全矩阵 meta-test（与 callbackSynchronyContract
   同构）。
4. 登记册流程补丁：**新增轴时必须对既有同族格做一次回灌审计**（§三第二失守点）；
   已在登记册头注补一句。
5. 登记项纪律：「不工作/风险」类登记必须携带可执行 pin（失败断言或 `test.fails`），
   机制假设写进 pin 的断言里——错误假设才有机会被证伪（§一.3）。已补进 AGENTS.md
   测试节；对称段 exist 边界已按此纪律补 pin（§七）。**r36 实证**：r35 报告 §六以此
   纪律登记的「深嵌前缀链逼近 63 字节」边界，本轮探针即定谳为真实缺陷并收口
   （registerSubqueryPrefix）——登记项带着明确机制假设时，下一轮的定谳成本极低。
