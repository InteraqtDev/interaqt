# Statemachine Refactor
statemachine 目前的 trigger 是使用的 interaction 对象。需要改成使用 mutationEvent 对象，这样能够支持更多的变化来源。因为 interaction 的变化也是一种 mutationEvent，所以这样的重构也能满足之前的需求。你来执行重构任务，步骤：
1. 阅读 `src/runtime` 下的所有原文件。
  1.1. 理解框架的响应式数据原理。
  1.2. 理解框架是如何处理 Event Based Computation 的。
  1.2. 理解 statemachine computation 的实现。
2. 阅读 `tests/runtime` 下 statemachine 相关的测试用例。完全掌握 property-level 和 global-level 的 statemachine 的用法。
3. 将 `src/shared` 中的 StateMachine 的 Transfer trigger 改成 partial RecordMutationEvent 类型。用户只需要指定一部分匹配 RecordMutationEvent 类型的字段即可。注意，RecordMutationEvent 是一个复合对象类型，我们允许用户深度指定匹配的字段。
4. 因为在上一步中，trigger 已经改成了局部匹配 RecordMutationEvent 的类型，所以 `src/runtime/computations/StateMachinie.ts` 中的 statemachine 也要做相应的修改：不再需要根据 mutationEvent 计算 trigger，直接拿 mutationEvent 去 TransitionFinder 中做深度的局部匹配，就能找到正确的 transfer。
5. 修改 `tests` 下所有使用 statemachine 的测试用例，trigger 改成新的形式，并使用 `npm run test:runtime` 运行测试用例，一定确保所有测试用例仍然全部通过，才说明重构成功。