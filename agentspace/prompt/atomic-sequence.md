# Atomic Sequence

## 背景
项目背景：`agentspace/prompt/context.md`
**文档默认写到 `agentspace/output` 下**

## 原则
1. 任何 feature实现、bug修复都要遵守框架的响应式表达范式
2. 做任何设计或者方案时，都做一次性、最完善的设计，不要做分阶段多个版本的设计

## Task 1 制定计划
理解 `agentspace/prompt/interaqt-scoped-atomic-sequence-requirement-from-medeo-lite-2026-05-15.md` 中的问题，然后开始制定一个新的 feature 来解决这个问题。
注意：
1. 一定要先理解当前框架的响应式表达方式，不能违背这个范式
2. 优先考虑设计成 property computation 来表达
3. 做一次性、最完善的设计，不要做分阶段多个版本的设计

### 追加任务1
深度理解，然后 review `agentspace/output/scoped-atomic-sequence-feature-plan.md` 方案，看有没有：
1. 致命问题
2. 违背上面原则的地方
把你的 review 结果写成一个独立的新文档

### 追加任务2
深度理解 Task 1 和原计划 `agentspace/output/scoped-atomic-sequence-feature-plan.md`，然后追条 review `agentspace/output/scoped-atomic-sequence-feature-plan-review.md` 中的意见，如果：
1. 意见正确，就修改原文档
2. 意见不正确，要指出为什么
注意：
1. 修复的时候也要遵守上面的原则
2. 对任何意见都要辩证思考、到代码中真实求证，不能盲目相信。

### 追加任务3
深度理解并执行 `agentspace/output/scoped-atomic-sequence-feature-plan.md`。
注意：
1. 一定要遵守上面的原则
2. 完成后一定要做矩阵式的完整的测试，我们这是一个框架项目，要求极为严格。

### 追加任务4
深度理解 `agentspace/output/scoped-atomic-sequence-feature-plan.md`，然后 reivew `agentspace/output/scoped-atomic-sequence-task5-current-code-review.md` 中指出的所有未完成项：
1. 如果指出的问题正确，就进行修复
2. 如果不正确，要指出为什么

注意：
1. 按照优先级一个一个修复。必须完全完成一个之后再进行下一个。
2. 不要做妥协和简化，要勇于攻克难题。
3. 修复的时候也要遵守上面的原则

### 追加任务5
深度理解  `agentspace/output/scoped-atomic-sequence-feature-plan.md`，然后 review 当前代码，看看有没有：
1. 实现错误
2. 未完成的工作
把你的 review 结果写成一个独立的新文档

### 追加任务6
我们已经完成  `agentspace/output/scoped-atomic-sequence-feature-plan.md` 实现。你来深度检查当前的代码状态是否已经达到可发布新版本的状态。

## Task 2 功能增强

深入理解 `agentspace/output/scoped-sequence-match-implementation-plan.md` 中的问题和方案。看有没有：
1. 致命错误。
2. 违背上面原则的地方
把你的 review 结果写成一个独立的新文档

### 追加任务1
深度理解 Task 2 和原计划 `agentspace/output/scoped-sequence-match-implementation-plan.md`，然后逐条 review `agentspace/output/scoped-sequence-match-implementation-plan-review.md` 中的意见，如果：
1. 意见正确，就修改原文档
2. 意见不正确，要指出为什么
注意：
1. 修复的时候也要遵守上面的原则
2. 对任何意见都要辩证思考、到代码中真实求证，不能盲目相信。

### 追加任务2
深度理解 Task 2 并执行 `agentspace/output/scoped-sequence-match-implementation-plan.md`。注意：
1. 一定要遵守上面的原则
2. 完成后一定要做矩阵式的完整的测试，我们这是一个框架项目，要求极为严格。

### 追加任务3
我们已经完成了一轮  `agentspace/output/scoped-sequence-match-implementation-plan.md`。你深度 review `agentspace/output/scoped-sequence-match-task2-additional-task4-review.md` 中指出的问题，如果：
1. 意见正确，就修复代码
2. 意见不正确，要指出为什么

注意：
1. 一定要遵守上面的原则
2. 完成后一定要做矩阵式的完整的测试，我们这是一个框架项目，要求极为严格。

### 追加任务4
我们已经完成了一轮  `agentspace/output/scoped-sequence-match-implementation-plan.md`。你深度 review 代码，看看有没有：
1. 致命错误
2. 未完成的工作
把你的结论写成一个独立文档
