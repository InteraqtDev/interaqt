# 任务一
现在系统增加了使用  `HardDeletionProperty` 来控制 entity  record 是否真的需要删除的功能，并且正常是搭配 statemachine 使用。现在你来帮我补充测试用例。步骤：
1. 完整阅读 `src` 下的所有源码。
  1.1. 理解框架原理
  1.2. 理解 computation 概念
  1.3. 理解 property-level 的 statemachine 的使用。
  1.4. 理解如何使用 `HardDeletionProperty` 和 `DELETED_STATE` 和 `NON_DELETED_STATE`
2. 阅读 `tests/runtime` 下的所有测试用例.
  2.1. 理解框架用法。
  2.2. 理解 statemachine 测试用例写法。理解如何使用 statemachine 实现 property-level 正常的增删改。
3. 在 tests/runtime/ 的 statemachine.spec.ts中补充通过HardDeletionProperty 和 statemachine DELETED_STATE/NON_DELETED_STATE  实现 entity 数据 删除的测试用例。注意补充的测试用例应该尽量简短易读。

# 任务二
将 tests/runtime 下面原本使用 entity/relation level 的 statemachine 全部改成：
1. 使用 Transform 来创建 entity/relation。
2. 使用 HardDeletionProperty 和 statemachine DELETED_STATE/NON_DELETED_STATE 实现 entity/relation 数据删除
3. property 如果需要更新使用自己独立的 statemachine。

# 任务三
更新文档。
1. 更新 `agent/agentspace/knowledge/generator/api-reference.md`，删除 entity/relation level 的 statemachine 用法。增加使用 HardDeletionProperty 和 statemachine DELETED_STATE/NON_DELETED_STATE 来实现 entity/relation 删除的例子，注意一定要简洁。
2. 更新 `agent/agentspace/knowledge/generator/computation-analysis.md` 相关的部分，当时 hard-delete 时，entity/relation level computation 应该仍然使用 Transform，同时使用 HardDeletionProperty 和 statemachine DELETED_STATE/NON_DELETED_STATE 来实现 record 的删除。
3. 查看 `agent/.claude/agents` 下的其他文档。看是否有需要更新的地方。