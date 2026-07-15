# 深度反思：为什么已有的测试体系此前没有抓到 r31 的这些致命 bug

- 日期：2026-07-15
- 关联：`deep-review-2026-07-15-r31.md`、`r30-test-blindness-retrospective.md`、`quality-foundation-plan-r27.md`
- 性质：测试与修复体系的结构性复盘。本轮特殊性：四个致命项中有**两个**（A、S1）不是"新 bug"，
  而是**既有契约/既有修复的未铺满面**——契约在 r20/r30 建立时是对的，铺设范围在建立当刻就不完整，
  且此后没有任何机制重新审计"这个契约现在有几个读者/实现点"。

---

## 〇、先给结论：四个 bug 的一句话逃逸机理

| 编号 | 逃逸机理（一句话） | 防线失明的类型 |
|------|------------------|--------------|
| A（事件视图消费侧） | r20 契约只统一了**匹配阶段**的读者，消费阶段的读者不在当时的问题框里；回归只断言"触发了"不断言"回调看到了什么" | 契约读者枚举缺时间维度 + 断言深度停在触发面 |
| S1（filtered 挂载深度） | 「按 alias 挂载」约定有 8 个实现点，r30 只修复现走过的 3 个；7b 预言机只在顶层深度读 filtered 面 | 约定的实现点无清单 + 预言机读取面缺深度子维度 |
| B1（required fail-open） | required 输入空间三态（缺键/键值在/键在值 undefined），测试只铺线协议可表达的两态 | 守卫矩阵缺宿主语言退化形态 |
| C1（merged 同名异型） | fuzzer schema 的属性名同型不冲突；手写 merged 测试用不相交属性集 | 生成域刻意回避声明冲突形态（夹具偏置的声明面投影） |

**共同结构**：r30 复盘确立「每道防线都有隐式辖区」。r31 的 A/S1 把它推进一步：
**契约与约定本身也有辖区**——契约建立时铺设的读者/实现点集合，会随代码演化静默失配，
而没有任何机制在"新增一个消费点/实现点"时强制它声明自己继承了哪个契约。

---

## 一、A 的法医检视：匹配与消费是同一声明面的两个阶段

### 1.1 r20 修复的问题框

r20 发现 TransitionFinder 按 partial record 匹配、与 eventDep 匹配器分裂，于是把两个**匹配器**
统一到 `mergedMutationEventView`。当时的问题框是「谁在做模式匹配」——`computeTarget` 不做匹配，
不在框里。但 computeTarget 的用户代码与 trigger 的 record 模式表达**同一个业务判定**
（"当 status 是 published 时"）：一个写在声明里、一个写在回调里。匹配器升级到合并视图后，
两者的判定基础分裂了——trigger 看合并态、回调看 partial 态，**同一个判定在同一次触发里得出相反结论**。

### 1.2 为什么 r20 的回归没抓到

`review-fixes-2026-07-11-r20.spec.ts` 的 Transform 回归断言 `logs.length === 1`——"触发了"。
它没有断言 log 记录的**字段值**。如果当时断言了 `logs[0].someField === expectedValue`（回调读
非变更字段的场景），r20 当场就会发现消费侧缺口。**断言的观察深度**是手写回归的固有变量：
触发面（有没有跑）< 结果面（写了什么值）< 结构面（挂在哪、事件流完整性）。
r30-A 的教训（预言机读取面）在手写回归上的投影就是断言深度——两者是同一根轴在
机器化/人工两套防线上的表现。

### 1.3 机制化落点

- 修复收敛在 `computeEventBasedDirtyRecordsAndEvents`（事件驱动轨的唯一事件入口），
  keys/oldRecord 保留——契约面最小化。
- 登记册「事件模式匹配语义」轴扩展：**匹配器与消费者是同一事件的两个读者阶段**，
  数据驱动轨刻意不合并（hasOwnProperty 语义）也一并写入——两轨差异从隐式变显式。
- 回归 A2 断言消费侧可见性的**双向**：合并视图可读未变更字段 + keys 仍只含变更字段。

---

## 二、S1 的法医检视：约定的实现点必须有清单

### 2.1 「按 alias 挂载」约定的实现点考古

QueryExecutor 里子查询结果的挂载/读取点共 8 处：

| 实现点 | r30 前 | r30 后 | r31 后 |
|--------|--------|--------|--------|
| findRecords goto | alias ✅ | alias ✅ | alias ✅ |
| findRecords 步骤 2（x:1 读取） | base ❌ | alias ✅（r30 修） | alias ✅ |
| findRecords 步骤 2（link x:n 挂载） | base ❌ | base ❌ | alias ✅（r31 修） |
| findRecords 步骤 3（顶层 x:n） | alias ✅ | alias ✅ | alias ✅ |
| batched resultKey | alias ✅ | alias ✅ | alias ✅ |
| batched link x:n 挂载 | base ❌ | base ❌ | alias ✅（r31 修） |
| completeXToOneLeftoverRecords 步骤 1 | base ❌ | base ❌ | alias ✅（r31 修） |
| completeXToOneLeftoverRecords 步骤 2/3 | base ❌ | 读取 alias ✅ / 挂载 base ❌（r30 修一半） | alias ✅（r31 修） |

r30 修复了复现（真实配对被 prune 误删）走过的点。**同一约定的第 N 个实现点**是本仓库
反复出现的形态（r28 sameRecordId 8 处、r29 MRG 发号 4 处、r31 挂载 8 处）——
每次都是"约定正确、铺设不全"。操作性规则：约定落地时 grep 全部实现点并逐一核对，
修复 PR 里留存实现点清单（本轮报告 S1 节的枚举表就是样板）。

### 2.2 7b 预言机的深度盲区与敏感性实验

r30 的 7b 预言机断言「link 面可见的配对必须出现在 filtered 属性嵌套读取里」——但它构造的
读取是 `find(source, [frProp])`，**顶层深度**。S1 的损坏面在「经 x:1 主干进入的 filtered 属性」，
7b 根本不走 completeXToOneLeftoverRecords。本轮新增 7b-deep（经 parent--x:1-->host 读 filtered 面），
敏感性实验：回退修复后 extended seed 9/26/31 当场红——**形状自 r29 起就在生成域里**
（又一次），缺的仍是观察面。「读取面 × 名字形态」矩阵新增**挂载深度**子维度（登记册已回填）。

---

## 三、B1 的法医检视：守卫矩阵缺宿主语言退化形态

required 的实现用了两个不同的存在性判定：`Object.keys`（own 键，undeclared 扫描）与
`in`（含原型链，required 检查）与 `payload[name] === undefined`（值存在性，跳过判定）。
三个判定的差集就是 fail-open 窗口：`{title: undefined}` 通过 `in`、落入 undefined 跳过。

为什么没测到：JSON 反序列化**不可能产出** undefined 值——HTTP 面的模糊测试永远生成不了
这个形态。它只在进程内调用（测试、agent 工具、BFF 直连 dispatch）可达。守卫边界的输入
生成必须显式包含宿主语言的退化形态：undefined 值、原型链键、数组/字符串代替对象。
本轮顺带发现 `cloneDispatchArgs` 把数组 payload 展开成普通对象（`{...[1,2]}`）——
克隆改变形状让守卫的"非对象拒绝"失明，同一族形态。

---

## 四、C1 的法医检视：生成域刻意回避冲突形态

fuzzer schema 生成器给全部实体同一组属性（label: string, score: number）——merged 输入间
同名**必然同型**，冲突形态在生成域之外。手写 merged 测试（`mergedEntity.spec.ts` 全部用例）
要么属性集不相交、要么经 commonProperties 显式声明。「两个 input 恰好同名但异型」在
人的心智模型里是"写错了的 schema"——taboo 形状，恰恰是声明期守卫唯一的存在性验证输入。

这与 r27（夹具偏置）/r30-D2（活动 taboo 图）同族，但投影在**声明空间**而非操作空间。
机制化方向：schema 生成器以低概率产出冲突声明（同名异型、异 collection），
断言"要么 fail-fast 要么行为一致"——声明期守卫的存在性从此可被机器验证。
（本轮未实施——决策流契约变更会作废全部种子池，留待下次种子池版本升级时一并做。）

---

## 五、对防御体系本身的结论（本轮成绩单）

| 侦测机制 | 本轮交付 | 失手处与修正 |
|----------|---------|------------|
| fuzzer（storage 结构化） | 7b-deep 落地后敏感性实验一击命中 S1（seed 9/26/31） | 7b 只铺顶层深度——「挂载深度」子维度补入登记册与预言机 |
| 手写特性测试（2138） | 防倒退全绿 | A：r20 回归断言深度停在触发面；B1：守卫矩阵缺 undefined 值态；C1：merged 夹具属性集互斥 |
| fix-the-class 清单 | r31 四个修复的读者/实现点枚举 | A/S1 揭示第 1 条缺时间维度：契约建立时的读者枚举 ≠ 契约的完整读者集合 |
| 声明期校验（validateCreateArgs 家族） | — | H6：`type:'function'` 元数据刻意不做形状校验（r26 契约），非函数 defaultValue 静默失效 11 轮——补 Property/Dictionary 点状守卫 |
| 主动探查（子代理五路并行） | A/B1/C1/S1 全部由定向探查候选 + 最小复现定谳产出 | 候选证伪率 ~50%（PG timestamp、Conditions OR、软删除 ref、setInternal 吞错、原型链——复现实验是唯一可靠的定谳手段） |

---

## 六、已落地的机制改造清单（本轮）

1. **预言机 7b-deep：filtered 嵌套读取完备性 × 挂载深度**（`writePathStructuralFuzz.spec.ts`）——
   经 parent--x:1-->host 的 filtered 属性读取与 link 面对账。敏感性自检：buggy 代码 seed 9/26/31 红、
   修复后 base 200 + extended 120 + filtered 60 全绿。纯断言新增、零 rng 调用，种子池全部有效。
2. **登记册两处回填**（`WritingComputationTests.md`）：「事件模式匹配语义」轴扩展
   （匹配器/消费者两阶段读者 + 数据驱动轨的刻意不合并）；「预言机读取面 × 名字形态」轴新增
   挂载深度子维度（顶层 vs x:1 主干下）与实现点清单要求。
3. **真实 PG timestamp Date 绑定探针**（`postgresqlDataConstraints.spec.ts`）——
   方言匹配探针（清单第 7 条），PGLite 面另固化于 storage 回归。
4. **声明期守卫**：merged 同名异型 fail-fast（收敛 helper）、Property/Dictionary 非函数
   defaultValue/computed 拒绝、payload 非对象拒绝 + 克隆保形。
5. **usage 文档修正**：三份知识库文档 13 处字面量 defaultValue 示例（生成 agent 的教材在教
   被静默忽略的 API——文档也是声明-实现一致性的检查对象，支柱 III 的实证）。

## 七、给后续轮次的操作性规则（增补）

1. **契约读者枚举的时间维度**：建立/修复契约时，除了枚举当前读者，还要把契约本身
   落为收敛点代码 + CAUTION（让后来的消费点物理上无法绕过），并在回归里断言**消费侧可见性**。
2. **约定实现点清单**：跨函数约定落地的 PR 必须附实现点枚举表（grep 证据），
   逐点标注 ✅/❌/N.A.——"修复覆盖了几个实现点"从叙述变成表格。
3. **守卫矩阵的宿主语言形态轴**：undefined 值 / 原型链键 / 数组冒充对象 / 字符串冒充对象，
   每个守卫边界（payload/condition/user/attributeQuery）逐一铺点；克隆/规范化步骤不得改变形状。
4. **声明冲突形态入生成域**（待种子池版本升级时实施）：同名异型属性、循环 filtered 链、
   自引用 merged——声明期守卫的存在性验证需要 taboo 声明。
