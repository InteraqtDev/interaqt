Transform 现在只支持从一种 entity/relation transform 出新的 entity/relation。需要支持从 RecordMutationEvent transform 出新的 entity/relation。
步骤：
1. 完全阅读 `src/runtime` 下的所有文件，掌握框架的响应式数据实现。
  1.1. 完全掌握 computation 的实现和用法
  1.2. 完全掌握 Transform 的实现
2. 完全阅读 `tests/runtime` 下面 transform 相关的测试用例，掌握测试用例的写法。
3. 我已经实现了 Transform 支持从 MutationEvent transform 出来新的 entity/relation。现在你在 `tests/runtime/transform.spec.ts` 中添加新的测试用例，验证是否成功支持使用 MutationEvent 来生成 entity/relation。使用 `npm run test:runtime` 确保所有测试用例通过才说明重构成功，没有破坏其他功能。


## 文档任务
我们已经完成了 Transform 支持 eventDeps 的特性。现在你来在 `agent/agentspace/knowledge/generator/api-reference.md` 中更新 Transform 的文档，增加使用 eventDeps 的例子。步骤：
1. 完全阅读 `src/runtime` 下的所有文件，掌握框架的响应式数据实现。
  1.1. 完全掌握 computation 的实现和用法
  1.2. 完全掌握 Transform 的实现
2. 完全阅读 `tests/runtime` 下面 transform 相关的测试用例，掌握 eventDeps 的正确用法。
3. 在 `agent/agentspace/knowledge/generator/api-reference.md` 中更新 Transform 的文档，去掉使用增加使用 eventDeps 的例子。
4. 为了让 agent 实现起来始终遵循统一的模式，将 `agent/agentspace/knowledge/generator` 下所有使用 Transform 参数 `record` 并且 record 为`InteractionEventEntity` 的例子全部改成使用 eventDeps 的方式。只有当 entity/relation 是从其他 entity/relation 中派生处理的时，才使用 record 参数的形式。
