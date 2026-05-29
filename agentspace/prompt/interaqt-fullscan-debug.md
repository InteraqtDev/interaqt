# Interaqt Debug
## 背景
当前项目是一个后端响应式数据框架。它的核心组成：
- `src/shared` 定义各种基础的数据结构，例如 Entity/Relation/Property。
- `src/storage` 核心的 ORM 工具。提供一些高级特性：merged entity/filtered entity。超长表名/字段名自动缩短。提供操作中的所数据变化作为事件抛出等。
- `src/runtime` 框架的响应式核心。提供了常见的 Entity/Relation/Property computation，例如 Count/Transform/Statemachin 等。框架根据 computation 的定义和数据变化的事件来决定如何进行响应式计算。

项目包含完整的测试。所有报的测试都在 `tests` 目录下。
**所有文档产出默认放到 `agentspace/output` 下。**

## 原则
1. 修复任何问题时，应该总是以最完善的、最优雅的方式来进行计划、分析、修复。不要做任何临时性的、妥协性的行为。不要做多个方案。
2. 不要在范式上违背框架本身项提供的响应式范式。
3. 这是个框架项目，一定要站在泛化、根因的角度解决问题。

## Task 1 Interaqt Debug
现在发现 Transform computation 会有全表扫描的问题，详细记录在了 `agentspace/prompt/interaqt-interaction-transform-fullscan.md`，你先深入理解，然后做一个修复方案写成文档。注意：
1. 一定要考虑其他也有同样问题的 computation，做一次性解决所有问题的修复方案。
2. 这是个框架性项目，一定要完善地解决问题，不要怕麻烦或者改动太大。


### additional task 1
你深度理解 Task 1 然后 review `agentspace/output/interaqt-fullscan-debug-task1-fix-plan.md` 中的设计。看看有没有：
1. 致命错误
2. 违背上面原则的地方

清空 `agentspace/output/interaqt-fullscan-debug-task1-fix-plan-review.md` 然后把你的 review 结果写到里面。使用 `Please execute agentspace/prompt/interaqt-fullscan-debug.md Task 1 additional task 2.` 启动 codex 一个新的 chat，你自己可以结束了，不需要等待。

注意：使用 `agentspace/prompt/codex-desktop-ui-new-chat-experience-2026-05-26.md` 中的方法来启动新的 chat。**一定不能使用 cli 来启动**。

### additional task 2
你深度理解 Task 1 和原设计 `agentspace/output/interaqt-fullscan-debug-task1-fix-plan.md`，然后逐条 review `agentspace/output/interaqt-fullscan-debug-task1-fix-plan-review.md` 中的意见，如果：
1. 意见正确，就直接修正原文档
2. 意见不正确，要指出为什么
注意：
1. 一定要遵守上面的原则
2. 对任何意见都要辩证地思考，到代码中求证

当处理完原文档之后，如果 review 文档里有 p0/p1/p2 意见，说明文档可能问题还比较严重，使用 `Please execute agentspace/prompt/interaqt-fullscan-debug.md Task 1 additional task 1.` 作为 prompt 启动 codex 一个新的 chat，只要启动你自己就可以结束了，不需要等待。如果 review 文档里没有 p0/p1/p2 意见了，你可以结束，等待我 review。

注意：使用 `agentspace/prompt/codex-desktop-ui-new-chat-experience-2026-05-26.md` 中的方法来启动新的 chat。**一定不能使用 cli 来启动**。


### additional task 3
深度理解并开始实施 `agentspace/output/interaqt-fullscan-debug-task1-fix-plan.md`。注意：
1. 一定要遵守上面的代码职责和写代码原则
2. 完成之后一定要进行完整的测试验证，确保测试覆盖了新增的代码，确保一切没有问题。
3. 把完成工作的信息总是更新到 `agentspace/output/interaqt-fullscan-debug-task1-fix-plan.md` 头部，如果已经有进度信息，那么用覆盖的方式，而不是追加的方式，防止信息爆炸。
4. 尽量一次性完成所有工作。

