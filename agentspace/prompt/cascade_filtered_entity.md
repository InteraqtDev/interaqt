# Cascade Filtered Entity

## 背景

我们的框架中已经支持 filtered entity 特性：
1. 可以通过 matchExpression 从 entity 中得到新的 filtered entity。
2. 使用 filtered entity 进行正常增删改查，框架会自动处理其中的 matchExpression。
3. 框架是在 RecordQuery 和 MatchExp 构造阶段完成的将 filtered entity 转换为普通的 entity 查询，这样在处理增删改查的过程中就不用再区分了。



## 任务

现在开始，你来帮我在 filtered entity 特性的基础上，让 filtered entity 能支持级联 filtered。要求：
1. 能将 filtered entity 作为 sourceEntity，派生出新的 filtered entity。
2. 新派生出的 filtered entity 要能同样正常地支持增删改查。
3. 新派生出的 filtered entity 在增删改查时应该抛出正确的事件。事件中应该同时有新派生出的 filtered entity 和 sourceEntity 的事件。

严格按照以下步骤完成任务。完成一项就更新记录，并在 `agentspace/knowledge` 新建文档记录关键信息。

## 步骤

1. [x] 阅读 `src/storage` 下的源码，深入理解所有 filtered entity 相关的实现。
2. [x] 阅读 `tests/storage` 下所有 filtered entity 相关的测试用例。学会如何为 filtered entity 编写增删改查的测试用例。学会如何测试增删改查时抛出的事件。
3. [x] 使用测试驱动开发的方式，开始在 `tests/storage` 中编写测试用例代码：
  3.1. [x] 测试基于 filtered entity 再派生出 filtered entity 的增删改查结果是否正确。
  3.2. [x] 测试基于 filtered entity 再派生出 filtered entity 的增删改查的事件是否正确。
  3.3. 注意！完成此上述步骤后停下来，等待我的检查。
4. [x] 开始编写代码支持新特性，确保所有测试用例通过。