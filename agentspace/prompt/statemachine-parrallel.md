# 并发问题

**注意：文档产出默认放到 agentspace/output 下**


## Task 1 
当前框架的响应式数据设计中的各种 computation，在多进程并发的情况下，是可能产生 bug 的。
你深入理解框架并分析具体的 bug 原因，给出一个终局解决方案。
注意：
1. 不要写多个方案，只写最好的、一次性实现的、完全杜绝问题的方案。
2. 方案要尽量简单。我们始终只有一个数据库。
3. 方案中不要考虑 pglite/sqlite，我们只要保证 postgres 没有问题即可。

### 追加任务1
我们把 Task 1 的解决方案 `agentspace/output/reactive-computation-concurrency-fix-design.md` 拆成了两个阶段，第一个阶段先通过原子操作和 computation 改造，尽量减少出问题的场景。
你深度理解并 review 第一阶段的设计 `agentspace/output/atomic-state-computation-refactor-design.md`，看有没有致命错误。注意，如果是明确能留到第二阶段再解决的问题，就不算致命问题。
把 review 结果写成一个单独的新文档。


### 追加任务2
深度理解原计划`agentspace/output/atomic-state-computation-refactor-design.md`，然后逐条 review `agentspace/output/atomic-state-computation-refactor-design-current-review.md` 中的意见，如果：
1. 意见正确，就直接修复原文档。
2. 意见不正确，要指出为什么。
注意：
1. 对每条意见都辩证的深度思考，到源码中核实，不能盲目相信。
2. 修改文档时，直接替换掉错误的内容，不要做新旧内容对比，尽量保持文档简洁。

### 追加任务3
深度理解并完成`agentspace/output/atomic-state-computation-refactor-design.md`
注意：
1. 完成后要经过完整的测试。补充必要的测试用例。

## Task 2 第二阶段计划制定
我们把 Task 1 的解决方案 `agentspace/output/reactive-computation-concurrency-fix-design.md` 拆成了两个阶段，第一个阶段的计划 `agentspace/output/atomic-state-computation-refactor-design.md` 已经完全完成了。
你根据完整的解决方案和现状，开始编写第二阶段的计划文档。


### 追加任务1
我们把 Task 1 的解决方案 `agentspace/output/reactive-computation-concurrency-fix-design.md` 拆成了两个阶段，第一个阶段已经完成。你深度理解并 review 第二阶段的设计 `agentspace/output/reactive-computation-concurrency-fix-stage2-design.md`，看有没有致命错误。注意，如果是明确能留到第二阶段再解决的问题，就不算致命问题。
把 review 结果写成一个单独的新文档。


### 追加任务2
深度理解原计划`agentspace/output/reactive-computation-concurrency-fix-stage2-design.md`，然后逐条 review `agentspace/output/reactive-computation-concurrency-fix-stage2-review.md` 中的意见，如果：
1. 意见正确，就直接修复原文档。
2. 意见不正确，要指出为什么。
注意：
1. 对每条意见都辩证的深度思考，到源码中核实，不能盲目相信。
2. 修改文档时，直接替换掉错误的内容，不要做新旧内容对比，尽量保持文档简洁。

### 追加任务3
深度理解并完成`agentspace/output/reactive-computation-concurrency-fix-stage2-design.md`
注意：
1. 完成后要经过完整的测试。补充必要的测试用例。

## Task 3 深度回顾
我们已经完成了 Task 1 和 Task 2，深度回顾 `agentspace/output/reactive-computation-concurrency-fix-design.md`，真实地评价我们是否已经完全杜绝了文档中指出的 bug。
把 review 结论写成一个独立的新文档

### 追加任务1
我们已经完成了 `agentspace/output/reactive-computation-concurrency-fix-design.md`，现在在收尾验收。你逐条 review `agentspace/output/reactive-computation-concurrency-fix-final-review.md` 中的意见，对每条意见都辩证的深度思考，到源码中核实。制定一个继续完善收尾的计划，写成独立的新文档。

### 追加任务2
我们已经完成了 `agentspace/output/reactive-computation-concurrency-fix-design.md`，现在在收尾验收。
你按照 `agentspace/output/reactive-computation-concurrency-fix-closing-plan.md` 完成最后的收尾。确保一切正常。