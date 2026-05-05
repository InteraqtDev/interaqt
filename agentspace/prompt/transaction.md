# 数据库事务

**文档默认输出位置：agentspace/output**

`agentspace/prompt/medeo-lite-interaqt-transaction-requirements.md` 是应用开发中需要当前框架增加的数据约束能力。你来详细评估：
1. 需求是否合理
2. 如果需求合理，我们应该如何支持

把你的评估和支持计划写成一个独立的文档。

注意：
1. 做计划时，不要做多种方案、多个阶段。始终只做一次性完成的、最完善的方案。
2. 始终优先支持 postgres，其他数据库允许降级，并且不作为阻塞性问题。


## Task 1 深度 review
深度理解当前任务并 review `agentspace/output/database-transaction-evaluation-and-support-plan.md`，看是否有：
1. 致命错误
把你的 review 结论写成一个独立的新文档。


### 追加任务1
深度理解当前任务和原本的设计 `agentspace/output/database-transaction-evaluation-and-support-plan.md`，然后逐条 review `agentspace/output/database-transaction-task1-review.md` 中的意见：
1. 如果意见是正确的，就直接修复原计划
2. 如果意见不正确，要指出为什么。

注意：
1. 对任意一条意见都要辩证思考，深度求证，不能盲目相信意见

### 追加任务2
深度理解并开始实施 `agentspace/output/database-transaction-evaluation-and-support-plan.md`。
注意：
1. 执行完一定要进行完整的、100%覆盖的验证，确保一切功能正常。这是个框架性的项目，要求非常严谨。
