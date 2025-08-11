# Fix Record Bound State Computations

## 任务
在 `src/runtime/computatons` 中，有一些 global 级别的 computation 没有使用 record bound state 来存储 old record 是否满足条件的状态。而是在 incremental compute 阶段使用 callback 重新计算 old record 是否匹配。这种方法有显著的 bug：从 mutation event 中获取到的 old record 信息可能不完整，使得就算 old record 是否匹配的结果出错。现在，你来修复所有 global level computation 中的 state 问题。

## 步骤
1. 阅读 `src/runtime` 下所有源码，完全理解框架。理解什么是增量计算。
2. 阅读 `src/computations` 下所有的 computation，理解各种增量计算的具体实现。
  2.1. 理解什么是 global level computation。
  2.2. 理解如何使用各种类型的 state。
3. `WeightedSummation.ts` 中的 global level computation 中的 state 问题已经修复，正确使用了 RecordBoundState 来记录每个 record 的计算结构，当发生新增量计算时，从 state 中获取旧值而不是使用 callback 再次计算。参考它来修复所有其他有问题的 global level computation。
3. 使用 `npm run test:runtime` 运行所有测试用例，确保全部通过，没有破坏任何已有功能。


