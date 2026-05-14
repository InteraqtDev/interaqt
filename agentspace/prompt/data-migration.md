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

## Task 3 bug fix
现在在项目中使用 data migration 发现了一些问题，你深度 review `agentspace/prompt/medeo-lite-data-migration-framework-bugs.md` 中的每一个问题，通过测试用例求证：
1. 如果 bug 真实存在，就进行修复，并确保测试覆盖通过。
2. 如果 bug 不存在，要支持文档为什么错了。
注意：本机安装了 postgres，如果需要 postgres，找一个闲置端口启动即可。


## Task 3 支持"手写转为受控"
我当前项立刻支持一个新场景：
允许将原本没有 computation 的字段/实体/关系转为 computation 控制的。如果已有数据，那么就清理掉完全重建。暂时不支持旧数据迁移策略，留一个口子未来支持。
我现在觉得 `agentspace/output/migration-eventsource-computation-takeover.md` 中的方案太复杂了，不是这个阶段来做的。你来写一个新的方案文档。注意：不要引用任何旧方案的内容，旧方案只是帮助你理解这个问题场景的。

### 追加任务1
你深度理解 Task 3 ，然后 review `agentspace/output/data-migration-handwritten-to-controlled-plan.md` 中的方案，看看有没有：
1. 致命错误
2. 违反上面注意事项的地方
3. 和原本目标、设计冲突的地方
把 review 结果写成一个独立的新的文档。

### 追加任务2
你深度理解 Task 3 和原计划 `agentspace/output/data-migration-handwritten-to-controlled-plan.md` ，然后逐条 review `agentspace/output/data-migration-handwritten-to-controlled-plan-review.md` 中指出的问题。如果：
1. 意见正确，就修正原文档。
2. 意见不正确，要支持为什么

注意：
1. 对任何意见都要辩证思考、到代码中深度求证，不能盲目相信
2. 修改过程也要遵守上面的注意事项。

### 追加任务3
你深度理解 Task 3 并开始实施 `agentspace/output/data-migration-handwritten-to-controlled-plan.md`

注意：
1. 一定要遵守上面的注意事项
2. 新增的代码一定要进行 100% 的测试覆盖。我们这是框架能力，要非常严谨。

### 追加任务4
你深度理解 Task 3 和 `agentspace/output/data-migration-handwritten-to-controlled-plan.md`，然后 review 测试用例，看是否覆盖了足够的 “已有数据的实体/关系/属性转为 computation 控制”的场景。如果不够，立刻进行补充并验证通过。这个功能会非常常用，一定要进行非常完整的测试。

### 追加任务5
已经完成了 Task 3，但在完成时出现了 bug 记录在了 `agentspace/prompt/interaqt-1.5.6-migration-blockers.md` 中，你来先深入分析文档中每一个阻塞点。指出：
1. 是否和当前框架有关。
  1.1. 如果无关，为什么无关，如何解决。
  1.2. 如果和框架有关应该如何修复，你为什么没有在本地测试中覆盖到这个场景。

把你的分析写成一个独立文档。

### 追加任务6
理解`agentspace/prompt/interaqt-1.5.6-migration-blockers.md`，然后按照 `agentspace/output/interaqt-1.5.6-migration-blockers-analysis.md` 的结论开始执行修复。

注意：
1. 一定要遵守上面的注意事项
2. 新增的代码一定要进行 100% 的测试覆盖。我们这是框架能力，要非常严谨。