我们的项目所使用的框架是一个叫做 Interaqt 的后端响应式数据框架，它会自动根据应用中的数据变化及响应式数据的定义执行相应的数据变化。它只负责处理一般的业务逻辑中表达的数据逻辑，例如一般业务逻辑中会用到 平均/综合 等计算，还有常见的基于状态机等业务逻辑表达等。对于一些非一般的能力需求，例如 大模型生图、大模型生视频、tts、发送邮件、发送信息、完整支付系统等。它需要借助外部系统/api 来完成。
我们设计了一个叫做 integration 的概念，专门用来对接当前系统和外部的api/系统。它通过 interaqt 框架提供的数据观察机制，来观察数据变化，根据数据变化来决定如何调用外部的 api。同时通过 webhook 等机制来接受外部的事件，将外部事件同步回系统中，触发响应式的业务逻辑。

我们将 integration 需要集成的功能分成了三种类别：
1. 调用外部的 api，为了获得一个具体的返回。例如 tts，大模型生图等。
2. 执行某种副作用，例如发送邮件、发送 im 消息等。
3. 对接其他有状态的系统，例如支付系统等。

现在我们需要指导 claude code 的 sub agent 合理地识别需要的外部服务以及如何自己实现 integration。
1. 指导 `.claude/agents/requirements-analysis-handler.md` 在需求分析阶段，正确分析出 integration 的类型。并在相应的输出的文档中，设计一个字段来表达 integration 的类型。
2. 指导 `.claude/agents/implement-design-handler.md` 在设计数据的时候，根据如下原则进行设计：
  2.1. 不管是哪种类型，都会涉及到对外部 api 的调用，例如执行副作用，也会有副作用 api 的调用。所以我们应该对每一个 api 的调用都设计一个 `{xxx}APICall` 的 entity，它负责记录这次 api 调用的参数、状态、返回值、调用时间等。
  2.2. 同时设计一个相应的 integraion event entity，当我们通过 webhook 或者自己通过接口查询到 api 调用状态的变化时，在系统内创建相应的 api call result event 事件。并且将上一步创建的 `{xxx}APICall` entity 的 status 和 data 字段写成基于 integration event entity 的 computation，这样就完整符合了框架的响应式范式。也记录了所有应该记录的数据，增强了系统的健壮性。
  2.3. 如果当前场景是希望基于这个 integration 获得具体的返回值，那么意味着我们系统内的业务数据对这个 `{xxx}APICall` 的 entity 是有依赖的，应该写成基于 `{xxx}APICall` 的 computation。例如我们的有一个 `Greeting` entity，其中有个 `voiceUrl` property 是需要利用外部 tts 能力将文本转化为语音。那么 `Greeting.voiceUrl` 就应该表达为基于 `{ttsAPICall}` entity 的 computation。如果是纯副作用类型等的调用，就不需要了。注意，这种情况下，还需要建立相应的 entity 和 api call entity 之间的关系，才能查找到正确的数据。
  2.4. `.claude/agents/implement-design-handler.md` 在做 data-design 的时候，应该明确表达出来：1. 设计的哪些实体是 api call 类型的 entity，哪些实体是 api call result event 实体。2. 系统内的业务数据如果需要 api 的返回结果，那么应该依赖正确的 api call entity。
3. 指导 `.claude/agents/code-generation-handler.md` 在实现阶段，在写测试用例时，完全可以通过创建正确的 api call result event 来模拟 api 的调用，完整验证系统的内部逻辑的正确性。不需要等到 integration 的真实实现。
4. 指导 `.claude/agents/error-check-handler.md` 在合适的阶段对 integration 相关的设计做错误检查。

你充分理解上面的所有思路，并且修改相应的 sub agent 文件来达成目标。