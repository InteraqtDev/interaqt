# Cascade Filtered Relation

## 背景

我们的框架中已经支持 filtered relation 特性：
1. 可以通过 matchExpression 从 relation 中得到新的 filtered relation
2. 使用 filtered relation 进行正常增删改查，框架会自动处理其中的 matchExpression。
3. 框架是在 RecordQuery 和 MatchExp 构造阶段完成的将 filtered relation 转换为普通的 relation 查询，这样在处理增删改查的过程中就不用再区分了。



## 任务

现在开始，你来帮我在 filtered relation 特性的基础上，让 filtered relation 能支持级联 filtered。要求：
1. 能将 filtered relation 作为 sourceRelation，派生出新的 filtered relation
2. 新派生出的 filtered relation 要能同样正常地支持增删改查。
3. 新派生出的 filtered relation 在增删改查时应该抛出正确的事件。事件中应该同时有新派生出的 filtered relation 和 sourceRelation 的事件。

严格按照以下步骤完成任务。完成一项就更新记录，并在 `agentspace/knowledge` 新建文档记录关键信息。

## 步骤

1. [x]] 阅读 `src/storage` 下的源码，深入理解所有 filtered relation 相关的实现。
2. [x] 阅读 `tests/storage` 下所有 filtered relation 相关的测试用例。学会如何为 filtered entity 编写增删改查的测试用例。学会如何测试增删改查时抛出的事件。
3. [x] 使用测试驱动开发的方式，开始在 `tests/storage` 中编写测试用例代码：
  3.1. [x] 测试基于 filtered relation 再派生出 filtered relation 的增删改查结果是否正确。
  3.2. [x] 测试基于 filtered relation 再派生出 filtered relation 的增删改查的事件是否正确。
  3.3. 注意！完成此上述步骤后停下来，等待我的检查。
4. [x] 开始编写代码支持新特性，确保所有测试用例通过。注意，你应该在 `src/storage/erstorage/Setup.ts` 中 createRecord 阶段新建两个字段来一次性存储根 relation 和 合并后的 matchExpression，防止在增删改查运行时每次都动态计算。