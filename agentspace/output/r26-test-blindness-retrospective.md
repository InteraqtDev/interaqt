# 深度反思：为什么已有的测试系统没有检测出 r26 的这些问题

- 日期：2026-07-13
- 关联：`deep-review-2026-07-13-r26.md`
- 性质：测试与修复体系的结构性复盘 + 机制改造记录。覆盖本轮全部五个问题（F-1 / I-1 / I-2 / I-3 / I-4），重点解剖致命项 F-1。

---

## 〇、先给结论

**不是测试写少了，而是测试系统的置信度来源本身是虚假的。**

本轮五个问题归成三类结构性失明：

| 类 | 结构性失明 | 本轮案例 |
|----|-----------|---------|
| A | **同函数内兄弟分支漏网**：正确实现就在旁边，审查/修复只覆盖「当前注视的」分支 | F-1 |
| B | **断言存在性而非形状**：绿灯证明「有事件」，不证明「事件说了什么」 | F-1（手写测试 + 预言机） |
| C | **声明的约束未被执行** / **对称面未扫** | I-2、I-3、I-4；I-1 是产品决策拖延 |

F-1 与 r25 F-1 几乎同构——都是「契约的第二消费方」——但这次第二消费方不是另一条轨（base vs 视图），而是**同一函数内另一条 if 分支**。

一句话：**写进注释和登记册的契约，如果没有机器逐实例检查形状，对兄弟分支提供的是「已覆盖」的假签证。**

---

## 一、致命项 F-1 的显微镜：四道防线如何各自失守

### 1.1 事实：正确代码在同一函数约 30 行外

| 同函数内路径 | 端点？ | 何时修的 |
|-------------|--------|---------|
| flashOut **create** 事件 | ✓ | r17（注释明确写了契约） |
| flashOut **merged-replace delete** | ✓ | 更早 |
| DeletionExecutor 规范形 | ✓ | 基线 |
| `oneToOne.spec.ts` update-steal delete | ✓ | 覆盖了 **update** 路径 |
| **flashOut create-steal delete** | ✗ | **本轮才修** |

审查者（含自动化矩阵）看到同文件的正确模式，就盖了「delete 端点契约已处理」的章。章的覆盖范围被系统性高估——**instance 被当成了 class**。

### 1.2 四道防线逐一检视

1. **事件完备性预言机（r17，r25 加了 create payload 第 5 条）**  
   规则 1–4 检查「有没有 create/delete」、规则 5 检查 create payload 字段。  
   **delete 事件的端点形状不在规则内**。一个「存在但缺 `source`/`target`」的 delete，对预言机是绿的。  
   拓扑矩阵 `writePathTopologyMatrix` **确实跑过 create-steal 格**，且包了预言机——恰恰说明：矩阵铺到了，预言机对这个失败模式天生失明。

2. **`combinedRecordEvents.spec.ts`**  
   断言 `linkDeletes.length === 1`。存在性绿灯；形状零断言。

3. **`oneToOne.spec.ts`「delete event should have both source and target」**  
   测的是 `DeletionExecutor` / **update**-steal，不是 create-steal。  
   夹具偏置到了「正确的兄弟路径」——与 r25 F-1「测试总带显式 `&`、回避 default-only」同族：人手写测试自然走自己熟悉且已绿的路径。

4. **登记册「视图 × 写形态」**  
   详细枚举了抢夺入口与 create payload 双轨（r25），但 delete 端点契约从未被写成多产生点声明面。  
   **create 契约升格没有触发「delete 是否同构」的交叉扫描**——对称面规则（r25 复盘 #5）在「事件 type 轴」上未被执行。

### 1.3 与 r25 F-1 的精确对照

| | r25 F-1（create defaults） | r26 F-1（delete endpoints） |
|--|---------------------------|----------------------------|
| 契约 | create payload = defaults + payload | delete payload = link 属性 + source/target |
| 漏网形态 | 同产生点的 **另一条轨**（base vs 视图） | 同函数的 **另一条分支**（create-steal vs merged-replace） |
| 下游失明 | records-match 少计 / trigger 不触发 | computeTarget 返回 undefined / transfer 不触发 |
| 预言机缺口 | 当时无 payload 内容规则 | r25 补了 create，**仍无 delete 端点规则** |
| 手写测试 | 总带显式匹配字段 | 总测存在或测已正确的路径 |

**同一家族的复发**：契约被升格成「已修复」后，对称面（create↔delete、轨↔轨、分支↔分支）没有机械求积。

---

## 二、其余四项（简述）

- **I-1**：r25 记为「下轮决策」——「已记录」在心理账本上变成「已处理」，权限面空转一轮。
- **I-2 / I-3**：`static.public` 约束未接线——测谓词函数 ≠ 测 `create()` 执行（r25 I-4 同族；createClass 债按轮产出）。
- **I-4**：open 幂等扫了三轮，close 从未进同一张矩阵——对称面规则再次未被执行。

---

## 三、公共形状：为什么命名了「第二消费方」仍复发

r22–r25 反复命名该形状，防御却仍是**修复时刻的人肉清单**：枚举集合由修复者当前注视目标锚定。清单无法命令人看见没想到的兄弟分支。

真正挡住过复发的只有三种**机械形态**：

1. **汇合点**（一份实现，无从分叉）——本轮让 create-steal delete 与视图 settle 共用完整端点快照；
2. **预言机**（对全体实例的性质断言）——本轮落地第 6 条：relation delete 必须带 `source.id`/`target.id` 且与消失前快照一致；
3. **带运行时证据的逐格 sweep**（目视不算数）。

散文形态的知识（登记册措辞、报告结论、同文件正确注释）**发放假签证**：看到「delete 要有端点」的注释/测试标题，就把 create-steal 从怀疑名单划掉。

---

## 四、本轮已落地的机制改造

1. **预言机第 6 条**（`tests/storage/helpers/eventCompleteness.ts`）：relation 的 delete 事件必须携带 `source.id` / `target.id`，且与 pre-delete 快照**值一致**。
2. **同函数汇合**：create-steal delete 与 filtered-view settle 共用完整端点快照；残缺端点（`{id: undefined}`）不再推送。
3. **预言机首跑附带抓获**（与 r25 第 5 条首跑抓端点 id 同构）：
   - `oldBusinessLinkRecord` 用 `source?.id` 推入 `{id: undefined}`（addRelation 抢夺形态）；
   - `stolenIsSource = !isRelationSource(...)` **端点左右弄反**——1:n merged-to-target 的 addRelation 抢夺把 Item 标成 source、User 标成 target，delete 事件与快照分裂。存在性断言与手写测试对此完全失明，**只有值比对**能抓到。
4. **登记册升格**：delete 端点 = 多产生点声明面；驱动差异轴补 close 幂等。
5. **回归双轨**：storage 形状断言 + runtime 事件轨消费（StateMachine）。

---

## 五、仍然开放的结构性缺口

1. **createClass 统一声明期校验**（十一轮）——I-2/I-3 类缺口的工厂。
2. **「同函数兄弟分支」强制清单**尚未流程化——修/审任何 `events.push` 时必须枚举同文件同 type 的全部 push。
3. **create 契约升格 → delete/update 同构扫描**尚未成为工作流门禁。
4. 迁移 `operationKey` 去 index、timestamp 归一化等（见 r26 报告 §三）。

---

## 六、给后续轮次的操作性规则（增补）

1. **修/审任何手工 `events.push` 时，枚举同文件全部同 type 的 push 并逐一对照契约**（F-1）。
2. **任一事件契约升格（create payload / delete 端点 / update keys）后，强制问另两个 type 是否同构**（对称面）。
3. **预言机优先查形状，手写 partial matcher 只补充语义**——「有事件」不是置信度来源。
4. **权限面「记录待决策」不得超过一轮空转**——修或标 by-design 关闭（I-1）。
5. **open/close、读/写、编码/解码——修一侧必把另一侧写进同一矩阵**（I-4；复申 r25 #5）。
