# Data Migration

## 背景
**文档默认写到 `agentspace/output` 下**

我们当前的框架没有考虑业务逻辑修改后的数据迁移问题。现在的 setup 流程会完全重建数据库。
interaqt 是响应式的数据描述，理论上只要数据有声明 computation，它就可以从已有的数据中重建出来。这对于 migration 的时候也适用。

## Task 1 实现计划制定
你来制定基于 Interaqt 的数据 migration 实现。要求：
1. 符合 interaqt 的范式。
2. 因为 js 的计算速度显著慢于 sql 直接执行，所以要为一些特殊情况创建一些原语，后期通过框架识别出来直接加速。例如某些字段/实体/关系是从其他的数据改名得到的，其实不是新增，那么数据不应该完全走重算，直接使用 rename 就行了。特别注意，原语也是以新增的修改的数据为中心来表达，例如`Staff: from(Worker) `，不是以过程为中心来表达。

你来把计划写成一个独立的文档。
注意：
1. 一定要先深刻理解 interaqt 这个框架。理解它的响应式表达。
2. 要考虑新增或者修改的数据有依赖其他新增或修改数据的情况，计算数据的过程是有顺序的。
3. 一定要先深刻理解 storage 的实现，它的实现中考虑了合表、拆表等逻辑。逻辑实体和物理表等不是简单的对应关系。
4. 框架不要做任何优化的猜测，默认走计算路线。留出一个选项可以让用户传入用于加速迁移的线索，在这些线索中用户可以使用原语来表达具体情况。分成两个阶段，第一个阶段只考虑计算路线如何实现，只给二阶段加速提供口子。第二阶段才考虑如何利用线索加速。现在只设计第一阶段的实现计划。确保基于计算的方法完全可行。
5. 计算路线应该也只计算新增和变更的，完全没变的不应该重新计算，因为会极大地耗时。

### 追加任务1
深度理解 Task 1 并 review `agentspace/output/data-migration-phase1-recompute-plan.md`，看有没有：
1. 致命错误
2. 违反上面注意事项的地方。
把 review 结果写成一个独立的文档。

### 追加任务2
深度理解 Task 1 并实施 `agentspace/output/data-migration-phase1-recompute-plan.md`。注意：
1. 完成之后一定要进行完整的验证。保证所有修改 100% 有测试覆盖。

### 追加任务3
深度理解 Task 1 以及原计划 `agentspace/output/data-migration-phase1-recompute-plan.md`，我们已经实施了一轮，还有一些剩余项`agentspace/output/data-migration-phase1-remaining-gaps-review.md` 你继续完成。
注意：
1. 要先深度求证其中的工作是正确的才开始实施。
2. 完成一项就要立刻检验正确再继续。

## Task 2 phase 1.5 两步式审阅
我们已经完成了 Task 1，phase 1 阶段已经完成。现在为了提升开发者体验，我们要去掉要求写 version、versionKey 等和业务逻辑无关的要求，改为增加人工审阅的步骤，你深入理解  `agentspace/output/data-migration-two-step-diff-review-design.md` 和当前代码现状，制定一个修改计划。注意：
1. 先不要考虑任何 phase 2 的内容。
2. 不要做任何兼容，直接做一个完全修改原来代码的方案。

### 追加任务1
深度理解`agentspace/output/data-migration-two-step-diff-review-design.md`，然后 review `agentspace/output/data-migration-phase15-two-step-review-implementation-plan.md` 看有没有：
1. 致命错误
2. 违反上面注意事项的地方。
把 review 结果写成一个独立的文档。

### 追加任务2
深度理解并执行 `agentspace/output/data-migration-phase15-two-step-review-implementation-plan.md`。注意：
1. 完成后要进行完整的测试。确保所有 data-migration 代码 100% 测试覆盖，一切正常。