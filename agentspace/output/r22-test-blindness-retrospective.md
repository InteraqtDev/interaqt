# 深度反思:为什么「第二个寄生位置」在 22 轮审查后才被发现(r22 F-1 / F-2)

- 日期:2026-07-12
- 关联:`deep-review-2026-07-12-r22.md`(问题发现与修复)、`r17-–r21-test-blindness-retrospective.md`(前五轮复盘)
- 性质:测试与修复体系的结构性复盘 + 本轮已落地的机制改造记录。

---

## 〇、先给结论

r22 的两个致命项都不是新机制的 bug,而是**已知概念出现在未被登记的位置**:

1. **F-1(filtered 端点 relation 事件缺失)**:filtered entity 此前以三个身份被修过——被查询名(r5,查询编译 rebase)、被监听名(r18,死监听不变量)、视图(r16–r21,成员资格事件家族)。但它还有第四个身份:**relation 端点声明**。r8 修过这个身份的**查询面**(属性注册双名),从此这个身份被标记为"已处理"——没有人问过它的**事件面**。名字空间的二元性(声明名 vs 物理名)在每个消费点都要重新决策,而 `collectLinkMembershipChecks` 这个 r19 才出现、r21 刚扩展的**新代码**,把 `link.sourceRecord` 当物理名用了——**r21 修复自己引入的调用点没有对名字空间做决策**(r20 复盘"修复代码自己就是声明面的又一个读者"的又一次字面兑现,这次是名字空间维度)。
2. **F-2(事务重试幻影事件)**:重试机制(`runWithTransactionRetry`)有两个消费方——`Controller.dispatch` 与 `MonoStorage.callWithEvents`。dispatch 在设计时显式处理了 attempt 间状态隔离(每 attempt fresh `effectsContext`、fresh `cloneDispatchArgs`);storage 直调路径**复用同一个调用方数组**,没有任何隔离。「attempt 间哪些状态必须 fresh」这个问题只在 dispatch 一个消费方上被回答过。

---

## 一、显微镜:防线为什么没拦住

### 1.1 F-1:「名字空间归一化」没有唯一收口点,每个新调用点都在重新掷骰子

代码里存在**两套名字解析纪律**:`RecordQuery.create` / `NewRecordData` 构造时统一 resolve(下游拿到的恒为物理名);`Setup` 的 link 元数据保存声明名(`relation.source.name`)。于是「拿到一个实体名」的代码有两种可能的输入,而正确行为取决于**这个名字从哪条链路流过来**——这是隐式契约,靠每个作者记住。r8 之后 filtered 端点 relation 的属性注册被双写(base + filtered),掩盖了名字二元性的存在感:查询面双名可用,让"这个形态已经支持"的印象扩散到了事件面。

**教训的一般形**:当一个标识符有多个合法书写形态(声明名/物理名、大小写、别名)时,「每个消费点自己 resolve」必然漏——必须有唯一归一化点,且新消费点**默认经过它**(本轮把 `FilteredEntityManager` 的全部名字入口收口到 `resolveBaseRecordName`)。这与 r20 F-1(引用形态唯一登记点)是同一个修法在不同维度上的实例。

### 1.2 F-1:「组合声明」的测试矩阵只在单侧铺格

`filteredEntityRelation*.spec.ts` 测了「filtered entity 作为端点」的查询面;`filteredMembershipMatrix` 测了「filtered entity 视图」的事件面。两张测试面各自绿灯,但「端点是 filtered ∧ 谓词依赖该关系」的**组合**恰好落在两者的交叉之外——r20 复盘"交叉格空白应按『这里有 bug』处置"再次兑现。视图 × 写形态矩阵的「写形态」轴此前只枚举了**操作**(create/update/addRelation/...),没有枚举**关系声明形态**(端点是 base / 端点是 filtered)。

### 1.3 F-2:重试机制的消费方从未被当作「声明面的读者」枚举

r20 复盘确立了「修某个声明面时必须枚举全部读者」。但 `runWithTransactionRetry` 不是声明面,是**机制**——机制的消费方枚举从未成为清单项。dispatch 的 fresh-per-attempt 设计说明作者清楚知道重试会重放副作用;`callWithEvents` 的作者(或许是同一人、不同时刻)没有把这条纪律带过去。**机制的每个消费方都要回答同一组问题**(哪些状态必须 attempt 隔离?哪些副作用会重放?),这组问题应该写在机制旁边,而不是散落在第一个消费方的实现细节里。

---

## 二、这两个 bug 的公共形状

> **概念的每一个寄生位置都是一根轴**。filtered entity 不只是"一种实体",它出现在查询名、监听名、视图、**relation 端点**四个位置——每个位置的每个消费面(查询/事件/迁移)都是独立的格。重试不只是"dispatch 的容错",它是有两个消费方的机制——每个消费方的 attempt 隔离都要独立决策。r20 说"修复代码是声明面的又一个读者",r22 补充:**声明面本身会寄生在新位置上**(端点声明、机制消费方),修复时的读者枚举要沿着"这个概念还能出现在哪里"再走一步。

---

## 三、本轮已落地的机制改造

1. **名字空间唯一归一化点**:`FilteredEntityManager.resolveBaseRecordName` 收口全部「实体名 → 依赖/视图」入口。注释明确写入「不允许第二套解析」——与 `LinkInfo.resolveRecordName`、`RecordQuery.create` 的既有 resolve 形成三处独立实现的现状,后续轮次建议进一步合并(见报告第六节)。
2. **监听声明面的第二根轴入不变量**:`assertListenerReachable` 从只验 recordName 扩展到验 type——死监听不变量现在覆盖 (recordName, type) 二维,任何生产者(含未来的 addSourceMap 扩展)自动受保护。
3. **登记册回灌**:「视图 × 写形态」行新增**关系端点声明形态**(base / filtered entity)子维度;新增「机制消费方」轴说明(重试/事务包装机制的每个消费方必须显式回答 attempt 隔离问题)。
4. **StateMachine 图完整性前移到声明期**:同名节点、脱离 states 的引用不再等运行期歧义才暴露(createClass 统一校验积压项的又一手写实例,收口机制仍待独立轮次)。

---

## 四、有意不做(含理由)

- **不把 `Setup` 的 link.sourceRecord/targetRecord 改存物理名**:声明名是序列化/迁移签名的一部分(端点为 filtered entity 是有语义的声明——影响属性注册位置),改存物理名是行为变更且丢信息。归一化放在消费侧(读者统一 resolve)而不是生产侧。
- **不给 `runWithTransactionRetry` 加运行期"attempt 隔离断言"**:无法机械判定"哪些外部状态被闭包捕获"。以登记册轴 + 机制旁注释(consumer checklist)作为防线。
- **不为 listener 副作用重放做框架级去重**(第三节 #4):listener 的幂等性是消费方契约,框架无法在不引入事务 id 语义的前提下代为去重;文档化。

---

## 五、一句话总结

**r20 说「类」的边界由声明面的正交轴笛卡尔积定义,r21 说隐式原语(本地重算)也是轴——r22 的教训是:概念的寄生位置本身就是一根被系统性遗漏的轴。filtered entity 寄生在 relation 端点上、重试机制寄生在第二个消费方上,都在"已修完"的印象下存活了二十二轮。修复时的读者枚举必须多走一步:这个概念还写在哪里?这个机制还有谁在用?**
