# Interaction Context

由于 agent 的兴起，用户的 interaction 可能不是通过前端的 api 调用的，而是 agent 通过 tool 调用的。也可能是其他定时任务之类的效果用。我们之前只考虑了用户交互动作的情况。需要重构实现。
你来帮我一个一个完成下面的任务。注意，你的文档产出默认放到 agentspace/output 下。

## Task 1 重构方案设计
当前的项目有个比较大的缺陷：
当前的框架是个响应式数据的框架，但是目前只考虑用户的交互事件作为响应式数据源类型的情况，只设计了 controller.callInteraction 这样一个入口以及对应的实体。当外部系统使用时，根据具体情况还可能需要自定义“定时触发”，“外部系统回调”等等事件源类型。我们应该允许用户扩展事件源。你来深入阅读 src 下的源码，理解当前项目和缺陷，然后结合业界的最佳实践设计一个完善的重构方案。
要求：
1. 要先深入理解当前设计中的所有概念。
2. 我们的重构目标以最优雅的设计为唯一目标，允许大规模重构，所以不要被历史负担困扰。允许破坏性重构。先以最优雅的架构进行重新设计，再考虑如何迁移旧代码。
3. 重构方案中，所有事件源类型应该共享同样的机制。Interaction 相当于我们内置好的一个事件源类型。controller 不再需要 Interaction & Activity 参数，并且新增 EventSource 参数。
  3.1. Activity 其实是附属于 Interaction 的高级概念，在重构 EventSource 时，不需要创建对应的概念。
  3.2. controller 的触发 api 使用 dispatch 这个 api 名称。dispatch 的参数应该设计成：1. 具体的事件源（使用对象引用），例如某一个具体的 Interaction 2. event source 的具体事件参数。
  3.3. 事务等应该是 controller 负责。而创建具体的事件源时要进行哪些检查等，应该是事件源类型来负责表达，每种类型都可以自己来定义。你只要设计好 controller 中的调用接口。
4. 本项目的 api 和实现始终遵循着“显式控制”的原则，不要做任何隐式补充之类的设计，容易出问题。


## Task 2 执行修改
按照 `agentspace/prompt/output/interaction-context-design.md` 中的设计执行修改。
注意：
1. 在 `tests/runtime` 下补充必要的单元测试，确保新增功能正常。
2. 最终确保 `npm run test:runtime` 全部通过，才说明没有破坏之前的功能。

### 追加任务1 
我们初步完成了 Task 2 的重构。但经过检查发现，对于已有的 Interaction 的迁移不够彻底，并没有完全迁移到新的 Event Source 上。
你来继续完成重构。要求：
1. 先完整理解当前项目。理解重构目标。
2. 完全理解 `agentspace/prompt/output/interaction-context-design.md` 中的重构目标。
3. 完整理解当前的代码，以及未完成的重构。
4. Controller 中的应该删除、重构的参数也要完成。Interaction & Activity 参数应该完全删除，callInteraction 方法可以保留，但实现应该完全使用 dispatch 才说明重构正确。我们的目标是完全重构干净。
5. 修改所有受影响的测试用例。最终确保 `npm run test:runtime` 全部通过才说明重构没有破坏功能。

### 追加任务2
我们已经完成了上面的任务。但经过检查发现，Interaction & Activity 的迁移还不够彻底。在 Controller 的 callInteraction 还是使用了两套逻辑。我们的目标是：callInteraction 应该只是转化了一下参数，全部使用 `this.despatch` 来处理，这样才说明完全转化成了 Event Source 的形式。
你来继续完成重构。要求：
1. 先完整整理解当前项目。特别是已经基于 Event Source 的实现。
2. 完整理解当前的代码，以及未完成的重构。
3. Controller 参数中的 Interaction & Activity 参数应该完全删除。
4. Controller callInteraction 只转化一下参数，全部使用 `this.despatch` 来处理，这样才说明完全转化成了 Event Source 的形式。
5. 修改所有受影响的测试用例。最终确保 `npm run test:runtime` 全部通过才说明重构没有破坏功能。

## Task 3 改名
EventSource.create 中的 `record` 参数改成 entity 更合适。record 指的是一条数据记录。
你来执行改名，注意最后所有 `npm test:runtime` 的测试用例都通过才说明功能正确。

## Task 4 剥离 Interction
经过重构后，Interaction & Activity 是整个包的内置 Event Source 的一种实现，但不应该是 runtime 这个包的实现了。你来进行重构将它剥离处理。注意：
1. 你重构的代码结构一定要优雅。要考虑到，未来可能还有其他的内置的概念。
2. 要同时重构 tests 下的测试用例。重构完之后，确保 `npm test` 所有的测试用例都通过，才说明没有破坏之前的功能。

## Task 5 shared 包名重构
你深入理解当前的项目结构和各个包的功能。判断各个包的命名是否有更准确的命名？目前发现至少 shared 这个包的命名是不准确的。你来完成包名的重构。注意：
1. 参考业界的最佳经验，来做最合适、最准确的命名。不要迁就当前的先转，觉得也差不多，一定选最合适的。
2. 重构完确保 `npm test` 所有测试仍然都通过。
取好名字后先告诉我，等我确认之后再进行重构任务。

## Task 6 更新文档
我们已经完全完成了重构任务，接下来你来根据更新的内容，更新 `agent/agentspace/knowledge/generator/api-reference.md`。