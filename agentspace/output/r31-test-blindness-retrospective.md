# 深度反思：为什么已有的测试体系此前没有抓到 r31 的这些致命 bug

- 日期：2026-07-15（初版）；同日以法医取证 + 归因实验深化（v2，本版）
- 关联：`deep-review-2026-07-15-r31.md`、`r30-test-blindness-retrospective.md`、`quality-foundation-plan-r27.md`
- 证据纪律：按 r30 规则 6，每条归因都做了敏感性/取证实验——包括在**基线（未修复）代码**上
  复刻既有夹具形状并断言其未断言的字段（A）、回退修复跑新预言机（S1）、对既有测试的
  断言集/夹具集做机械化盘点（A/B1/C1/S1）、以 git 考古确定缺陷与防线的相对年代（A）。
  其中 A 的初版归因（"r20 回归断言深度不足"）被证据**大幅深化**：缺陷比 r20 早十个月，
  与 eventDeps 特性同龄，且特性的奠基夹具从第一天起就带着 workaround。

---

## 〇、先给结论：四个 bug 的一句话逃逸机理

| 编号 | 逃逸机理（一句话） | 防线失明的类型 |
|------|------------------|--------------|
| A（事件视图消费侧） | 匹配器从特性诞生日起就合并视图、消费者从诞生日起就拿 partial record；**奠基夹具用 `\|\| oldRecord` 兜底吸收了分裂**，断言集恰好只覆盖 partial 视图下幸存的字段——绿灯下夹具自己的数据里一直躺着 undefined | 夹具级 workaround + 断言集与损坏面的错开 |
| S1（filtered 挂载深度） | 手写套件**有**深度 2 的嵌套 filtered 查询且断言正确——但父级是 x:n；x:1 父级走完全不同的执行计划（JOIN + 补全枝干），声明面看不出差别 | 执行计划按父级基数分叉，测试宇宙只铺了正确的那条 |
| B1（required fail-open） | required 输入空间三态（缺键/键值在/键在值 undefined），唯一的否定测试只铺缺键——JSON 线协议表达不出 undefined 值态 | 守卫矩阵缺宿主语言退化形态 |
| C1（merged 同名异型） | 套件里**存在**一模一样的冲突夹具（Student.score number vs Teacher.score string）——但只在 commonProperties 变体里；测试矩阵继承了校验器的辖区（commonProperties 清单）而不是不变量的辖区（任意同名属性） | 测试对着校验器写，不是对着不变量写 |

**共同结构**：r30 复盘确立「每道防线都有隐式辖区，bug 住在辖区与可达空间的差集里」。
r31 的四个案例把它再推进一步：**差集里不仅住着 bug，还住着测试自己**——
A 的夹具在差集里用 workaround 活了十个月，C1 的夹具站在差集边缘一步之遥（删一个参数就是 bug），
S1 的夹具铺满了差集的补集。防线不响不是因为没有测试路过 bug 附近，
而是因为路过的测试都以各自的方式**绕开了**它。

---

## 一、A 的法医检视：一个与特性同龄、被奠基夹具供养了十个月的读者分裂

### 1.1 git 考古：分裂的三代史

| 时间 | 提交 | 事件 |
|------|------|------|
| 2025-09-15 | `d16a7999`（feat: eventDeps support deep partial match） | eventDeps 特性诞生。**匹配器从第一行代码起就合并视图**——当时的注释原文：「对于 update 操作，mutationEvent.record 可能只包含更新的字段，所以我们需要将 oldRecord 和 record 合并来获得完整的当前状态」。同一提交里，update 事件的 record 已是 partial（`{...newEntityData.getData(), id}`）。**消费者（callback）拿 partial record，从诞生日起。** |
| 同一提交 | 同上 | 奠基夹具（transform.spec.ts「high priority order audit」）随特性一起写入，其中 StatusChange callback 第 1275 行：`orderNumber: mutationEvent.record.orderNumber \|\| mutationEvent.oldRecord.orderNumber`——**特性作者自己撞上了 partial record，在第一份夹具里就地 workaround**，而不是让框架把完整视图交给回调。 |
| 2026-07-11 | `abb91434`（r20 F-5） | 第二个匹配器（StateMachine TransitionFinder）与 eventDep 匹配器统一到 `mergedMutationEventView`。修复枚举了「同一声明面的全部**匹配**读者」——消费阶段不在当时的问题框里。 |
| 2026-07-15 | r31 | 消费者统一到合并视图。分裂存活时长：**十个月，三代防线**。 |

### 1.2 归因实验：绿灯夹具的数据里一直躺着 undefined

在**基线（r31 修复前）代码**上复刻 transform.spec.ts 1223–1240 的夹具形状
（eventDep `record: {priority: 'high'}`，callback 读 orderNumber/status/totalAmount），
执行与原测试完全相同的写序列（create 全字段 → update 只写 status），读回 update audit 行：

```
FORENSIC update audit row: {"action":"update", "details":{"oldStatus":"pending","status":"completed"}, ...}
// orderNumber: 整个键缺失（callback 读到 undefined）
// details.totalAmount: 整个键缺失
```

**原测试为什么绿**——三个机制各挡一路：

1. **断言集与幸存字段精确重合**：原测试对 update audit 只断言 `details.status`（本次写入的字段，
   在 partial record 里）与 `details.oldStatus`（在 oldRecord 里）——恰好是 partial 视图下
   仅有的两个可读字段。`orderNumber`/`totalAmount` 从未被断言（transform.spec.ts:1347–1350）。
2. **夹具级 workaround**：StatusChange audit 的 `orderNumber` **被**断言了（:1340）——
   但该 callback 用 `record.orderNumber \|\| oldRecord.orderNumber` 兜底，靠 oldRecord
   拿到正确值。断言通过靠的是夹具的兜底，不是框架的正确性。
3. **truthiness 守卫吸收语义**：revision 夹具（:770–771）用
   `record?.title && oldRecord?.title !== record?.title` 判"变更"——把「partial 视图里缺席」
   与「没有变更」混为一谈，恰好在这个用途下是对的，于是缺陷面永远不被触碰。

### 1.3 夹具形状的全量盘点：29/29 结构性失明

对全部测试里的 `computeTarget` 做机械化分类（`rg "computeTarget:" tests/ -A 1`）：

| computeTarget 读取形态 | 数量 | 对 partial/merged 分裂敏感？ |
|------------------------|------|------------------------------|
| `event.record.id` / `oldRecord?.id ?? record?.id` | ~29 | 否——id 恒在 partial record 里 |
| `event.record.payload.*`（InteractionEventEntity **create** 事件） | 6 | 否——create 事件 record 完整 |
| `event.record.source/target.id`（relation 事件端点） | 3 | 否——端点恒携带 |
| **读宿主非变更字段的 update 事件** | **0** | ——r31 之前一个都没有 |

r20 自己的回归（review-fixes-2026-07-11-r20.spec.ts:25–134）断言的是**值面**
（`updated.phase === 'archived'`，并非只断言触发）——但其 computeTarget 也是
`({ id: event.oldRecord?.id ?? event.record?.id })`：夹具形状本身对分裂不敏感，
断言再深也照不到。**观察深度 = 断言深度 × 夹具敏感度，两者相乘**——r30 说
「覆盖 = 生成域 × 预言机读取面」，本案是它在手写测试上的精确投影。

### 1.4 结构教训

「奠基夹具的 workaround 是特性契约的化石」：特性作者在第一份夹具里绕过的不便，
就是特性 API 的第一份 bug 报告——它以绿色测试的形态存在，主动制造「已覆盖」假象
（r30-E「四步舞」的夹具代码版）。r20 修匹配器时若有人问一句
「奠基夹具里那个 `\|\| oldRecord` 是在兜什么的底？」，分裂当场现形。

---

## 二、S1 的法医检视：套件铺满了差集的补集

### 2.1 近失（near-miss）：深度 2 嵌套查询其实一直在测

对 filteredRelation.spec.ts（2000+ 行、31 个 filtered 属性名）做机械化盘点：
嵌套在其他属性之下的 filtered 属性查询**存在**——`filteredRelation.spec.ts:2177–2202`：

```ts
findOne('Company', ..., ['id', 'name',
  ['departments', { attributeQuery: ['id', 'name',
    ['activeEmployees', { attributeQuery: ['id', 'name', 'salary'] }]] }]])
expect(engineering!.activeEmployees.length).toBe(1)   // 断言了！且基线上是绿的！
```

它为什么没抓到 S1：`departments` 是 **x:n**（Company 1:n Department）。
x:n 子查询经 `findXToManyRelatedRecords` 对每个父记录发起**独立的完整 findRecords**，
其内部的 filtered x:n 走顶层挂载循环（findRecords 步骤 3，`alias || attributeName`，一直正确）。
S1 的损坏面在 **x:1 父级**：x:1 子查询被编译进父查询的 JOIN，其 x:n 枝干由
`completeXToOneLeftoverRecords` 补全——挂载 key 在这条路径上用的是 base 名。

**声明面完全看不出这两条路径的差别**（`['departments', {...}]` 与 `['dept', {...}]`
形状相同），执行计划却按父级基数分叉，一条正确一条损坏。测试宇宙把嵌套形状
铺在了正确的那条上——不是没铺，是铺错了格。

### 2.2 敏感性实验（初版已做，此处存档）

新预言机 7b-deep（经 parent--x:1-->host 读 filtered 属性、与 link 面对账）：
回退 QueryExecutor 修复后 extended seed 9/26/31 当场红
（`pairing 1->2 visible on the link face but MISSING from the FzS9_D.in2.fr_out2 nested read (x:1-trunk mount face)`）；
恢复修复后 base 200×40 / extended 120×30 / filtered 60 全绿。
形状自 r29 起就在 fuzzer 生成域里——**又一次**，缺的是观察面（r30-A 的同款结论，
新的子维度：挂载深度 × 父级基数）。

### 2.3 结构教训

「按 alias 挂载」约定在 QueryExecutor 有 8 个实现点（清单见 r31 报告 S1 节），
r30 修了复现走过的 3 个。**约定的实现点没有清单，修复的覆盖率就由复现的行走路径决定**——
这是 r28 sameRecordId（8 处）、r29 MRG 发号（4 处）之后同一形态第三次出现。
且本案的实现点分布在「执行计划分叉」的两侧：分叉条件（父级基数）在声明面不可见，
人工枚举天然漏掉——只有 grep 式的机械枚举 + 预言机按面铺点能收口。

---

## 三、B1 的法医检视：守卫矩阵缺宿主语言的退化形态

required 的输入空间是三态：**缺键** / **键在值在** / **键在值 undefined**。
全套件唯一的 required 否定测试（interactionEdgePaths.spec.ts:111–131）传 `payload: {}`——缺键态。
键在值 undefined 态从未被测过。

为什么恰好缺这一态：**JSON 反序列化产生不出 undefined 值**——HTTP 面的任何输入
（含模糊测试）都到不了这个形态；它只在进程内调用（测试、agent 工具、BFF 直连 dispatch）可达。
守卫实现里三个存在性判定各自为政（`Object.keys` own 键扫描 / `in` 含原型链的 required 检查 /
`=== undefined` 的跳过判定），fail-open 窗口就住在三者的差集里——
`{title: undefined}` 通过 `in`、落进 undefined 跳过，**连同类型/isRef/base 校验一起跳过**。

顺带取证发现的同族形态：`cloneDispatchArgs` 把数组 payload 展开成普通对象
（`{...[1,2]}` → `{0:1,1:2}`），守卫的"非对象拒绝"因此对数组失明——
**克隆/规范化步骤改变输入形状，等于替攻击者洗白了非法形态**。

结构教训：守卫边界的输入生成必须显式包含宿主语言的退化形态
（undefined 值、原型链键、数组/字符串冒充对象），不只是线协议可表达的形态；
守卫前的任何变换必须保形。

---

## 四、C1 的法医检视：测试对着校验器写，不是对着不变量写

对 mergedEntity.spec.ts 做同名属性跨实体盘点，**同名异型夹具是存在的**——
Student.score(number) vs Teacher.score(string)（mergedEntity.spec.ts:744–790），
而且该测试就是在测"类型冲突要拒绝"。但它声明了 `commonProperties`——
走的是既有校验器的辖区，断言的是既有校验器的错误消息。
**同样的两个实体、去掉 commonProperties 参数，就是 C1**——静默 last-wins、
先处理 input 的列被重定型。夹具距离 bug 一个参数，测试矩阵却继承了
校验器的辖区（commonProperties 清单内）而不是不变量的辖区（任意同名属性共列 ⇒ 必须同型）。

这是 r30-D2「校验器键空间比不变量键空间窄」的测试面对偶：
**当测试以"校验器会拒绝什么"为蓝本时，校验器的辖区缺口会精确复制成测试的辖区缺口。**
写声明期守卫的测试必须从不变量出发枚举违例形态，再看每个形态落在哪个校验器辖区里——
落空的格要么是缺守卫（C1），要么是缺豁免理由。

fuzzer 侧：schema 生成器给全部实体同一组同型属性（label: string / score: number，
fuzzSchema.ts:82–95），merged 输入间同名必然同型——冲突形态在生成域之外
（且刻意如此：属性同型是决策流稳定性的一部分）。声明冲突形态入生成域
需要种子池版本升级，已列入待办。

---

## 五、共同结构：差集里住着测试

r30 的结论是「bug 住在防线隐式辖区与可达空间的差集里」。r31 的取证补充了差集的生态：

| 案例 | 差集里除了 bug 还有什么 | 它如何延长了 bug 的寿命 |
|------|------------------------|------------------------|
| A | 奠基夹具的 `\|\| oldRecord` workaround + 恰好错开的断言集 | 以绿灯形态供养分裂十个月；三代修复（诞生/r20/r31）前两代都没人审计夹具在兜什么底 |
| S1 | 铺在执行计划正确一侧的深度 2 嵌套测试 | 制造「嵌套 filtered 已覆盖」的合理印象；r30 修复时的兄弟面扫描止步于此 |
| B1 | 覆盖三态之二的否定测试 | 「required 有否定测试」在覆盖率意义上为真，在输入空间意义上为假 |
| C1 | 一个参数之外的同型冲突夹具 | 「类型冲突有拒绝测试」为真——但测的是校验器的辖区，不是不变量的辖区 |

四个案例里，「看起来像覆盖」的测试都真实存在。**测试体系的失明不是空白，是错位**——
这比空白更危险，因为空白会被覆盖率工具和审查者看见，错位不会。

---

## 六、对防御体系本身的结论（本轮成绩单）

| 侦测机制 | 本轮交付 | 失手处与修正 |
|----------|---------|------------|
| fuzzer（storage 结构化） | 7b-deep 敏感性实验一击命中 S1（seed 9/26/31） | 7b 只铺顶层深度——「挂载深度 × 父级基数」子维度补入登记册与预言机 |
| 手写特性测试（2138） | 防倒退全绿 | A：奠基夹具 workaround + 断言集错开；S1：嵌套测试铺在正确执行计划侧；B1：三态缺一；C1：对着校验器写 |
| fix-the-class 清单 | r31 四个修复的读者/实现点枚举（S1 附 8 点清单表） | A/S1 揭示清单第 1 条缺时间维度：契约建立时的读者枚举 ≠ 契约的完整读者集合；实现点无清单时修复覆盖率由复现路径决定 |
| 声明期校验（validateCreateArgs 家族） | Property/Dictionary 非函数 defaultValue/computed 守卫 | `type:'function'` 元数据刻意不做形状校验（r26 契约边界），字面量默认值静默失效——usage 文档同步教错 13 处，一并修正 |
| 主动探查（五路子代理并行 + 最小复现定谳） | A/B1/C1/S1 全部由定向探查产出 | 候选证伪率 ~50%（PG timestamp、Conditions OR、软删除 ref、setInternal 吞错、原型链注入均被复现实验证伪）——**复现实验是唯一可靠的定谳手段**，本轮无一例外 |

---

## 七、已落地的机制改造清单（本轮）

1. **预言机 7b-deep**（writePathStructuralFuzz.spec.ts）：filtered 嵌套读取完备性 × 挂载深度，
   敏感性自检（buggy 红 / fixed 全池绿），零 rng 调用、种子池全部有效。
2. **登记册回填**（WritingComputationTests.md）：「事件模式匹配语义」轴扩展为匹配器/消费者
   两阶段读者规则（数据驱动轨的刻意不合并一并显式化）；「预言机读取面」轴新增挂载深度
   子维度与实现点清单规则。
3. **真实 PG timestamp Date 绑定探针**（postgresqlDataConstraints.spec.ts，清单第 7 条）。
4. **声明期守卫**：merged 同名异型 fail-fast（收敛 helper，两个合并点共用）、
   Property/Dictionary 非函数 defaultValue/computed 拒绝、payload 非对象拒绝 + 克隆保形。
5. **usage 文档修正**：三份知识库文档 13 处字面量 defaultValue 示例——
   面向生成 agent 的教材在教被静默忽略的 API（支柱 III「文档也是声明-实现一致性检查对象」的实证）。
6. **消费侧可见性回归**（review-fixes-2026-07-15-r31.spec.ts）：A2 双向断言
   （合并视图可读未变更字段 + keys 仍只含变更字段）——为「匹配器/消费者同投影」契约
   留下第一个消费面敏感的夹具。

## 八、给后续轮次的操作性规则（增补）

1. **奠基夹具审计**：修改任何声明面的语义（匹配规则、视图形态、事件契约）时，
   回读该特性的**奠基提交**里的夹具——夹具中的兜底表达式（`\|\| fallback`、truthiness 守卫、
   try/catch）是特性诞生时未解决问题的化石清单，逐一问"这在兜什么的底、新语义下还需要吗"。
2. **断言深度 × 夹具敏感度**：回归的观察能力是两者的乘积。断言"转移发生了"之前，
   先确认夹具的回调/computeTarget **读了会暴露缺陷的字段**——夹具形状对缺陷不敏感时，
   断言深度是零的乘数。
3. **实现点清单强制化**：跨函数约定（挂载 key、id 归一、事件名归一）的修复 PR 必须附
   grep 产出的实现点枚举表，逐点标注 ✅/❌/N.A.；分叉条件在声明面不可见的（执行计划、
   物理拓扑），预言机按面铺点而不是按声明铺点。
4. **守卫测试从不变量出发**：先从不变量枚举违例形态、再映射到校验器辖区——
   而不是从校验器的错误消息反推测试用例。落空的格要么补守卫要么写豁免理由。
5. **宿主语言退化形态入守卫矩阵**：undefined 值 / 原型链键 / 数组、字符串冒充对象，
   每个守卫边界逐一铺点；守卫前的克隆/规范化不得改变输入形状。
6. **声明冲突形态入生成域**（待种子池版本升级窗口实施）：同名异型属性、循环 filtered 链、
   自引用 merged——声明期守卫的存在性只有 taboo 声明能验证。
