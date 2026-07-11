# 深度反思：为什么 19 轮审查、1900+ 用例没测出 `BoolExp` 的 NOT 组合 fail-open（r19 F-1）

- 日期：2026-07-11
- 关联：`deep-review-2026-07-11-r19.md`（问题发现与修复）、`r17-/r18-test-blindness-retrospective.md`（前两轮复盘）
- 性质：测试体系的结构性复盘 + 本轮已落地的机制改造记录。所有关键论断均有代码原文/测试原文考证。

---

## 〇、先给结论

这个 bug 最刺眼的地方不是它藏得深，而是它藏得**浅**——它在整个框架最基础的布尔求值原语里，`NOT(A OR B)` 这种小学逻辑，一个单元测试就能抓。它能穿过 18 轮审查、1900+ 用例，暴露的是三个此前复盘都没点破的盲区：

1. **测试把「当前实现行为」而非「正确语义」编码成了断言**——`boolexp.spec.ts` 有两处测试的注释白纸黑字写着「Current implementation doesn't propagate inverse through AND/OR」，然后 `expect(result).not.toBe(true)` 把这个**错误行为固化成了绿灯**。测试不是漏写了，是**写反了**：它在保护 bug。
2. **审查的坐标系全部长在「响应式数据流」上，核心原语的纯逻辑正确性不在任何轴上**——r6–r18 建的预言机（事件完备性、增量==全量、引用完整性、死监听不变量）全都服务于「数据变更 → 事件 → 计算」这条链。`BoolExp.evaluate` 是守卫链的求值器，不产生 mutation、不进事件流、不碰 storage——它落在所有预言机的观测面之外。
3. **安全面（权限 fail-open）没有独立的红队式断言**——框架对「守卫应拒绝时是否真的拒绝」有正向测试（返回 false → 拒绝），但没有「用组合逻辑构造一个**应该拒绝**的守卫，断言它确实拒绝」的对抗性覆盖。fail-open 是否定形命题，正向用例天然测不到。

---

## 一、显微镜：这个 bug 恰好穿过了哪些防线

### 防线一：单元测试把 bug 写进了断言

`tests/core/boolexp.spec.ts` 修复前的两处（L758、L893）：

```ts
test("should evaluate complex expression with NOT", () => {
  // NOT(10 > 5 AND 3 > 5)
  // Note: Current implementation doesn't propagate inverse through AND/OR
  // So this will return error because the AND fails (3 > 5 = false)
  const expr = BoolExp.atom(10).and(BoolExp.atom(3)).not();
  const result = expr.evaluate((data) => data > 5);
  expect(result).not.toBe(true);        // ← NOT(T AND F) 正确应为 true，这里断言 not true
  expect((result as EvaluateError).data).toBe(3);
});
```

作者**知道**实现不传播 inverse（注释写明了），却把它当成「既定行为」记录下来，而不是当成 bug 报告。这是最危险的一种测试：它不只是没覆盖，它**主动为错误行为背书**——任何后来者想修 `evaluate`，这两个测试会立刻变红，制造「你的修改破坏了测试」的假信号，把正确修复推回去。

**根因**：测试作者站在「实现现在怎么跑」的视角写断言，而不是站在「语义应该是什么」的视角。`NOT(A AND B)` 的正确值是数学事实（De Morgan），不该由「当前实现」定义。**实现者知识诅咒的极端形态：不是写了 happy path，是把 bug path 封成了契约。**

### 防线二：核心原语的纯逻辑不在任何审查轴上

r17/r18 复盘把测试盲区归纳为「缺维度轴」（物理拓扑、事件完备性、计算轨道、监听名形态……）。但这些轴无一例外都是**响应式数据流**的轴。`BoolExp.evaluate` 是一个纯函数式的布尔求值器：输入表达式树 + atom handler，输出 true/error。它：

- 不产生 mutation event → 事件完备性预言机看不到；
- 不做增量计算 → 增量==全量预言机看不到；
- 不碰 link/端点 → 引用完整性不变量看不到；
- 不注册监听 → 死监听不变量看不到。

**所有结构性防线都建在「数据流下游」，而这个 bug 在「逻辑原语上游」。** 维度登记册（`WritingComputationTests.md`）整篇是为 computation 测试服务的，`BoolExp` 作为 computation 的**依赖**（守卫、match 编译）从不在它的视野里。

### 防线三：安全面没有对抗性（红队）断言

`tests/runtime/condition.spec.ts` 覆盖了守卫：单条件返回 false → 拒绝、抛异常 → 拒绝、非 boolean → 拒绝（r13）。这些都是**正向**断言：「已知此处应拒绝，断言它拒绝」。但它们全部是 `atom` 或 `atom.and(atom)` 形态——**没有一个用 `.not()` 包住组合表达式**。

`.not()` 在测试里出现的地方（`review-fixes-r13` L48/L58）是 `BoolExp.atom(returnsNull).not()`——`NOT(atom)`，恰好走的是正确分支（inverse 直接作用于 atom）。**离 bug 只差一层：把 atom 换成 `.or()`/`.and()` 组合就中招，但没有任何测试跨过这一步。**

fail-open 的本质是否定形命题：「不该放行处放行了」。正向测试范式（构造应通过的场景，断言通过）天生写不出它——必须主动构造「应该被拒绝的组合守卫」并断言其被拒绝。这类**对抗性断言**在整个 suite 里是缺失的。

---

## 二、更深一层：这个 bug 的公共形状

> **一个被广泛复用的底层原语，它的正确性契约（真值表 / 代数律）从未被独立断言；上层只测「原语恰好被怎么用」，没测「原语本身对不对」。**

`BoolExp` 被三个上层复用：Interaction 守卫（`evaluate`）、storage match 编译（`.map()` → SQL）、scopedSequence match（另有独立正确实现）。storage 走 SQL 的 `NOT(...)`（数据库原生，正确），scopedSequence 自己实现了正确的 not 传播——**只有守卫走 `evaluate`，而 evaluate 的 not 是坏的**。三个读者里两个绕开了坏路径，坏路径的唯一读者（守卫）又只被正向测试覆盖。

这与 r18 的「同一声明面多个读者」形状相通，但更基础：这里是**同一原语的多个实现**（SQL not / scopedSequence not / evaluate not）中，只有一个是错的，而它恰好服务于最不该出错的面（权限）。没有任何机制要求「`not` 的语义在所有实现里一致」。

---

## 三、本轮已落地的机制改造

### 3.1 真值表即契约（对冲盲区 1）

`boolexp.spec.ts` 新增 De Morgan 真值表回归组：`NOT(A OR B)`、`NOT(A AND B)`、双重否定、嵌套组合，sync 与 async **逐格断言正确语义**，并显式断言 sync/async 一致。两处「为 bug 背书」的旧断言改写为正确的 De Morgan 断言。**契约从「实现现在怎么跑」改为「代数律要求怎么跑」。**

### 3.2 守卫的对抗性断言（对冲盲区 3）

`review-fixes-2026-07-11-r19.spec.ts` 端到端构造「**应该拒绝**的组合守卫」并断言 dispatch 被拒绝：`NOT(A OR B)`（A 真 → 必拒）、`NOT(A AND B)`（两者皆真 → 必拒）。这是守卫面第一组 fail-open 对抗性用例——不是「构造应通过的场景」，而是「构造应拒绝的场景，断言真的拒绝」。

### 3.3 登记册补一根轴：原语正确性

`WritingComputationTests.md` 的维度登记册此前只有数据形态轴 + 机制轴（r18）。本轮教训要求补一类**正交于数据流的轴**：被复用的底层原语（`BoolExp` 求值、match 求值、算术求值），其正确性契约（真值表/代数律）必须有独立于「上层怎么用」的断言，且当同一语义有多个实现（SQL not / 内存 not）时，必须有一致性对账。（见本文件被登记册引用。）

---

## 四、有意不做（含理由）

- **把 `evaluate` 与 storage SQL not / scopedSequence not 做统一实现**：三者输入/输出模型不同（表达式树求值 vs SQL 文本生成 vs 内存谓词），强行统一收益低、耦合高；正确的收口是「一致性对账测试」（同一逻辑表达式在 evaluate 与 scopedSequence 求值下结果一致），而非合并实现。已在登记册记录为轴，本轮先补 evaluate 自身的真值表。
- **doc-tests 基建**：与 r18 结论一致，属独立工程，先以真值表 + 对抗性守卫用例补入回归。

---

## 五、一句话总结

**r17 说「坐标系缺数据形态轴」，r18 补「还缺机制形态轴」，r19 再补一刀：轴不只在数据流下游，还在逻辑原语上游——被复用的底层原语的正确性契约必须独立于「它恰好被怎么用」来断言；而最致命的测试不是没写，是把 bug 当契约写进了断言，替 bug 挡住了所有想修它的人。**
