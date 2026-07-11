# 深度反思:为什么复杂的测试体系没有覆盖住「事件驱动计算的 filtered update 死监听」(r18 F-1)

- 日期:2026-07-11
- 关联:`deep-review-2026-07-11-r18.md`(问题发现与修复)、`r17-test-blindness-retrospective.md`(上一轮复盘)
- 性质:测试体系的结构性复盘 + 本轮已落地的结构层改造记录。所有关键论断均有提交历史/代码原文考证。

---

## 〇、先给结论

这个 bug 能穿过 1871 个用例和 r17 建立的结构层,不是因为测试"写少了",而是因为**测试体系的全部坐标系都建立在"数据形态"上,而这个 bug 生活在"机制形态"里**——同一个声明面(`recordName + type`)背后有两套消费机制(数据驱动轨 / 事件驱动轨),整个体系没有任何一根轴、任何一个预言机、任何一条断言是沿着"机制"这个维度铺设的。

更尖锐的是:**通用规则早在 2026-07-09(r5 修复轮)就被完整写进了注释,修复却只落在了一条轨道上**——知识是全称的,执行是存在的,而没有任何机制检查两者的差距。

---

## 一、直接层面:那个格子恰好是空的

| 格子 | 覆盖情况 |
|------|----------|
| filtered × **数据驱动** × update | ✅ r5-F-1 修复 + `aggregationConsistencyMatrix`(25 格) |
| **base 名** × 事件驱动 × update | ✅ 大量 StateMachine/Transform 测试 |
| filtered × 事件驱动 × **create** | ✅(碰巧健康:成员资格事件本就以 filtered 名发出) |
| **filtered × 事件驱动 × update** | ❌ 零用例,零告警死监听 |

最扎心的证据:`tests/runtime/stateMachineInitialValue.spec.ts` 的 filtered 用例中,**同一个夹具里同时出现了全部三种原料**(StateMachine、filtered entity、对 filtered entity 的 Count),但 trigger 写的是 base 名 `SMFilteredItem`——filtered 名只被数据驱动的 Count 消费。**离死格只差一个字符串**。

为什么作者会写 base 名?因为该测试的目的是回归另一个 bug(初始值回填),作者是知道事件系统内幕的人,下意识写了"能工作"的形态。**实现者写的测试编码的是实现的 happy path,而不是文档读者的心智模型**——一个读了"filtered entity 用起来和普通 entity 一样"的用户会自然把 trigger 写在视图名上。这是测试作者的知识诅咒。

## 二、修复考古:通用规则与局部修复的裂缝在同一天形成

提交 `0f3dfb3e`(2026-07-09,r5-F-1 修复)当时的代码原文:

```ts
// 注释(全称命题):"…注册在 filtered 名上的 update 监听是死监听——…"
private normalizeFilteredUpdateSourceMap(source) {
    if (source.type !== 'update' || !('dataDep' in source)) return source   // ← 修复(存在命题)
```

三个机制叠加造成裂缝:

1. **复现宇宙决定修复范围,修复范围决定验证范围——闭环自洽**。触发 r5-F-1 的是聚合 bug,复现矩阵全部是数据驱动计算;修复让矩阵变绿,验证闭环完成。没有任何流程要求问:「**这个事件命名空间还有谁在订阅?**」——答案在 `initialize()` 里肉眼可见(恰好两个生产者)。
2. **类型边界塑造了修复边界**。`!('dataDep' in source)` 本质是 TS 类型收窄便利;修窄的路径在类型系统里顺滑,修全的要处理两个类型。类型边界不是语义边界,但它给修复范围导了流。事后类型定义留下铁证:`EntityUpdateEventsSourceMap` 有 `filteredRecordName` 字段和整段注释,`EventBasedEntityEventsSourceMap` 什么都没有——不对称写在类型里,没人做过双轨类型对称性审计。
3. **同一天、相邻代码、相反假设**。同日提交 `28366353` 的 `validateTriggerKeys` 专门沿 baseEntity/baseRelation 链遍历收集合法属性名——说明"trigger.recordName 可以是 filtered 名"在校验层是被承认的用户模式;而路由层修复同日把事件驱动轨排除。两处代码对同一声明面持相反假设,无机制强迫对齐。

## 三、为什么 r17 刚建的结构层也没接住

F-1 完全符合 r17 已诊断的模式(盲区 3 交叉格空白 + 盲区 4 注释化假设),但每件设施都差半步:

1. **维度登记册的坐标系继承了 storage 的本体论**。七根轴(关系类型/物理拓扑/逐项状态/载荷形态/操作/路径跳数/观察面)全部是**数据声明形态**;「计算轨道」「监听名形态」是**机制维度**,不在任何轴上。登记册从 storage 写路径 bug 归纳而来,每一份登记册都在为上一场战争建防线——"新维度必须回灌"条款是反应式的,维度积从未被先验枚举。
2. **事件完备性预言机守的是"发射面",不是"路由面"**。F-1 场景下事件存在且正确(以 base 名发出),预言机绿灯;失效发生在订阅匹配——声明的监听器永远不可达。这是第四个观察面(**订阅面**),与 r17 论证事件面同构:「死监听」是否定形命题,逐点正向断言列不完,只能结构性检查。
3. **假设审计的网眼是词法的**。r17 审计用 `rg "只可能|不可能"` 扫描;那条关键注释写的是「是死监听」——事实陈述,不含模态词,词法网捞不到。它最危险的地方恰恰是:不是"假设",是**已知事实 + 未完成的执行**。若当时升格为初始化后的不变量断言,哪怕零测试,第一个用户也会在 setup 期拿到受控错误。

## 四、更深一层:这类 bug 的公共形状

> **一个统一的声明面,多个分叉的消费机制,不变量只在其中一条分支上被执行。**

用户看到的是一个语言:`{ recordName, type }`。框架内部有两条轨道读它(dataDeps 编译管线 / eventDeps 直通管线),外加 migration 的第三个读者(manifest 签名——r18-F-2「普通值参数零感知」是同一形状:运行时读 trigger 全部字段,签名器只读两个字段)。凡是"同一声明在不同读者那里语义分叉"的地方都是持续生产 bug 的机器:

- 测试按**特性**组织,而 bug 住在**读者之间的差集**里;
- 行覆盖率完全失明——两条轨道各自行覆盖都高,缺的是交互,交互不是行;
- 修复的最小化美德(只动复现走过的路径)在这里成为缺陷:天然只修一个读者。

最有杠杆的防线不是更多格子,而是**消灭分叉或在汇合点断言**。

---

## 五、本轮已落地的结构层改造

### 5.1 事件命名空间统一(消灭分叉的事实源)

`ComputationSourceMapManager.buildEventNamespace`:视图名→物理名的解析改以 **storage 编译结果**(`storage.schema.records` 的 `resolvedBaseRecordName`)为唯一事实源,替换原先"沿 controller 实例图行走 baseEntity/baseRelation 链"的手工重建。

**立即收益(改造首跑抓出的同族亲缘 bug)**:merged input 视图(`inputEntities`/`inputRelations` 声明)是在 storage 编译期才转换成 filtered 形态的——controller 侧实例图看不到这层关系,手工行走把 input 视图当成物理记录,其 update 监听(**数据驱动与事件驱动两轨都**)全部是死监听:`Summation over input view` 对成员字段更新永久陈旧、input 名上的 StateMachine update trigger 永不触发(复现实测后由本改造直接消灭,回归见 `review-fixes-2026-07-11-r18.spec.ts` structural 组)。

### 5.2 死监听不变量(订阅面守卫,setup 期结构性检查)

`assertListenerReachable`,对**归一化后**的每一个监听:

1. `recordName` 必须 ∈ storage 已知记录名——typo、把 global dict 名当 recordName、引用未注册进 Controller 的实体,全部从"永久静默陈旧"变为 setup 期受控错误(dict 场景的错误信息给出 `_Dictionary_` + `record: {key}` 的正确写法);
2. 归一化后不允许任何 update 监听仍以视图名为键——normalize 是唯一合法入口,违反即框架内部缺陷,同样 fail-fast。

`addSourceMap`/`addSourceMaps`(公开生产者 API)并入同一条归一化+校验管线,未来任何第三条轨道自动被覆盖。**这条不变量就是"订阅面预言机"——在 setup 期执行,比测试期更早、覆盖面是全部用户而不只是测试作者写到的格子。**

**不变量首跑的精确性修正**:虚拟 link(relation 记录自身的 source/target 端点,`${relationName}_source/_target`)只存在于 map.links、storage 从不以其名发事件(实测确认)——历史代码给 relation 嵌套端点注册的 create/delete 监听一直是**静默注册的死监听**(端点变更实际由 relation 记录整体的 create/delete 表达,那两个监听由上层注册)。不变量把这处沉睡的死注册暴露出来,已改为只对可发射事件的真实 record 注册。

**行为收紧**:指向未知记录名的 dataDep/eventDep 从静默死监听变为 setup 期报错(`schedulerEdgeCases.spec.ts` 的 NonExistentEntity 用例已从"容忍"翻转为"断言 fail-fast")。

### 5.3 维度登记册本体升级

`WritingComputationTests.md` 登记册新增两根**机制轴**(计算轨道、监听名形态)与「路由类修复必须枚举同一声明面的全部读者」的修复清单义务(见该文件)。

## 六、有意不做(含理由)

- **文档示例即测试(doc-tests)基建**:对冲实现者知识诅咒的正确方向,但属独立工程(示例抽取、执行环境、断言约定),不在本轮范围;先以"用户视角声明形态"补入回归(trigger 挂视图名、input 视图名)。
- **对 create-only 记录上的 update 监听 fail-fast**:无法确凿证明所有此类记录永不 update(activity 记录就会 update),过度断言会误伤,不做。
- **`validateTriggerKeys` 与订阅面守卫合并**:两者关注点不同(keys 语义 vs 可达性),保留分工;守卫在 source map 层对两轨统一执行,天然覆盖 Transform eventDeps(validateTriggerKeys 只覆盖 StateMachine)。

## 七、一句话总结

**r17 的结论是"坐标系里缺轴";r18 的补充是:轴不仅有数据形态的,还有机制形态的——同一声明面的每一个读者都是一根轴。而比补轴更强的防线,是把"全称命题的注释"升格为"汇合点的不变量":注释没有执行力,不变量有。**
