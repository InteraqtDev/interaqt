# 深度反思：为什么「本地判定器」在 21 轮审查后才被发现与 SQL 分裂（r21 F-1 / F-2）

- 日期：2026-07-12
- 关联：`deep-review-2026-07-12-r21.md`（问题发现与修复）、`r17-/r18-/r19-/r20-test-blindness-retrospective.md`（前四轮复盘）
- 性质：测试与修复体系的结构性复盘 + 本轮已落地的机制改造记录。

---

## 〇、先给结论

r21 的两个致命项各自暴露一个此前复盘**已经命名过但没有机械执行**的盲区：

1. **F-1（match 本地求值与 SQL 分裂）住在 r19 就登记过的「底层原语正确性」轴上**——r19 复盘说「同一语义有多实现（SQL NOT / 内存 not）时须做一致性对账」，登记册也写了。但登记时心里想的是 `BoolExp` 这类**纯逻辑原语**；`Scheduler.evaluateRecordsMatch` 是一个藏在增量调度深处的**第二套 SQL 谓词求值器**，从未被当成「原语」看待。它的独特危险在于：它对着**事件快照**（不完整投影）求值，而 SQL 对着**完整行**求值——即使操作符语义完全对齐，「键缺席 ≠ 值为 null」这一快照维度也会让两边分裂。r19 的轴只登记了「实现要对账」，没有登记「**求值的输入面（快照 vs 行）也是轴**」。
2. **F-2（addRelation 抢夺漏旧 owner）是 r19 F-3 的第三个入口形态**——r19 修 create 抢夺、其回归顺带覆盖了 update 抢夺，但「抢夺」这个语义有**三个 API 入口**（create-with-ref / update-with-ref / addRelation），第三个入口在 flashOut 里走的是 `newRecordIsLink` 分支、ref 是虚拟端点，被守卫排除。登记册的操作轴里「抢夺」和「addRelation」**各自都在**，但没有人把它们乘起来。这是 r20 复盘「交叉格空白应按『这里有 bug』处置」的又一次字面兑现。

---

## 一、显微镜：防线为什么没拦住

### 1.1 F-1：skip 优化的测试只测了「该 skip 的」，没测「不该 skip 的」

`incrementalPlanFullScan.spec.ts` 有一条测试标题就叫 "records match skips non-matching create events and full recomputes membership boundary updates"——它精确覆盖了 skip 机制的**正向意图**（不匹配的 create 确实被 skip、边界更新确实全量重算）。但 skip 是一个**否定形优化**：它的正确性命题是「被 skip 的事件对计算结果确定性无影响」。这个命题的反例空间由 match key 的**字段来源**张成：payload 直接字段（测试用的就是它，恰好是本地可判定的唯一取值）/ computed 列 / 嵌套关联路径 / 缺席字段——四个取值里三个会分裂，测试恰好选了唯一健康的那个。

**教训的一般形**：任何「跳过计算」类优化（skip / 短路 / 去重）的测试矩阵必须同时铺「该跳的跳了」与「**不该跳的没被跳**」两个方向，且第二个方向的维度是**判定器的输入形态**（快照里键的来源），不是业务场景。

### 1.2 F-1：局部求值器从未与它模拟的对象（MatchExp 编译器）做过逐操作符对账

`compareMatchValue` 支持的操作符集合、每个操作符对 null 的处理，与 `MatchExp.getFinalFieldValue` 的编译语义**从未有过一张对照表**。r20 修 in/not in 的 null 拆分时，改的是 MatchExp（SQL 侧）——同一语义的内存侧（`compareMatchValue` 的 `in`/`not in` 分支）没有出现在那次修复的读者清单里，因为**没有人知道它是读者**。「同一声明面的全部读者」清单再次漏掉了一类读者：不消费声明本身、而是**重新实现声明语义**的代码。

### 1.3 F-2：入口形态是操作轴上没有展开的子维度

r17 建立的 `writePathTopologyMatrix` 把「抢夺」作为操作维度的取值铺过 create/update/addRelation 三个入口（addRelation 抢夺格是 r17 亲自修过崩溃的）。但那张矩阵断言的是**数据面 + link 事件面 + 不变量面**；r19 给「抢夺 × filtered entity 视图」补格时，复现选了 create 入口、回归也只固化了 create/update——**矩阵的断言面（filtered 视图事件）没有随 r19 的新观察面回灌到已有的三入口格上**。矩阵存在、格也存在，新的观察面没有乘进去。

---

## 二、这两个 bug 的公共形状

> **判定逻辑的每一次「本地重算」都是一个新读者，判定输入的每一种「投影形态」都是一根新轴。** F-1 的病灶不是操作符写错，而是「事件快照」这个输入面从未被承认为维度；F-2 的病灶不是守卫写错，而是「操作入口」这个子维度从未与新观察面相乘。两者的公共修法都是把「隐式存在的轴」显式登记，并在汇合点收口（F-1：唯一的本地求值器逐操作符镜像编译语义 + 不可判定即保守；F-2：手工 push 的旧 link delete 统一伴随端点成员资格快照）。

---

## 三、本轮已落地的机制改造

1. **本地谓词求值 × 快照完备性轴入册**：登记册新增该轴，明确 match key 字段来源的四个取值（payload 直接 / computed / 嵌套路径 / 缺席）× 操作符极性，并规定 skip 类优化必须双向铺格。
2. **null/undefined × 操作符载荷轴入册**：每个接受值载荷的操作符对 null 的处置（翻译 / 拆分 / fail-fast）必须显式决策——between 是该家族最后一个未决策成员（本轮 fail-fast），新操作符落地时按此轴过一遍。
3. **抢夺入口形态并入「视图 × 写形态」行**：create-with-ref / update-with-ref / addRelation 三个入口显式列为独立格，并写明「手工 push 的旧 link delete 必须伴随 `collectLinkMembershipChecks`」的汇合点契约。
4. **原语层 fail-closed**：BoolExp atom handler 的 boolean 契约从消费方（checkCondition）提升到原语本身（evaluate/evaluateAsync），协议违规在任何极性下判失败——「explicit control 应用于内部契约」（r17 盲区 4）的又一次落实。

---

## 四、有意不做（含理由）

- **不为 `compareMatchValue` 补 between/exist/like 的本地判定**：like 的大小写敏感性因驱动而异（PG 敏感 / SQLite ASCII 不敏感）、`_` 通配未实现——本地判定**不可能**忠实模拟「当前驱动」，返回不可判定（保守全量重算）是唯一正确解，性能损失限定在罕见声明形态内。
- **不做「本地求值器与 MatchExp 的自动一致性 fuzz」**：两侧输入形态差异（快照 vs 行）使得纯随机对拍需要先解决快照生成的代表性问题，成本高于本轮的逐操作符人工对账 + 登记册轴；留作后续轮次评估。
- **不改 `scopedSequenceMatch` 的「缺键=null」语义**：它对着**创建 payload**（own-fields 完整快照）求值，且声明期已把 match key 限制为 top-level/`x.id`——缺键=null 在该输入面上是忠实的，真值表测试已把它固化为刻意契约。两个本地求值器的语义差异由**输入面差异**正当化，不强行统一。

---

## 五、一句话总结

**r19 说「底层原语的正确性契约是数学事实」，r21 的教训是：原语不止 BoolExp 这种看得见的——任何对声明语义的本地重算（skip 判定器、内存谓词求值器）都是隐式原语，它的输入投影形态（快照的键集合）本身就是正交轴；而已修 bug 的家族边界由「语义入口 × 观察面」的乘积定义，矩阵每新增一个观察面，必须回灌到既有格上重乘一遍。**
