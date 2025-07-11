# ExternalSynchronizer
## Prompt
ExternalSynchronizer 是用来将外部有状态的服务和当前系统连接起来的。或者换个角度来看，我们任务整个应用都应该是一个整体，但是为了一些并发性能/研发成本需求，我们不得不把一部分服务和状态分离处理。

ExternalSynchronizer 可能需要做三件事：
- 将本地的状态/事件(Interaction 实例)同步出去。因为外部可能有状态依赖于我们的状态。
- 将外部系统中的状态/事件(Interaction 实例)同步过来。因为我们可能有状态依赖于外部的状态。
- 将外部的 MutationEvent 同步过来。因为我们可能有状态的增量计算依赖于 MutataionEvent，而不是依赖于完整的状态。

将外部状态同步到内部的方法：
- 基于事件主动使用 api 获取状态。
- 通过 webhook 被动接受状态。
- 基于轮询来获取状态变化。

将内部状态同步到外部的方法：
- 指定要同步的数据，当放生变化时使用 api 同步出去。


需要特别在实现上关注的：
- 轮询很消耗性能，所以需要标注哪些数据同步出去时，外部状态可能发生变化，只对可能发生变化的状态（且无webhook通知）采取主动获取/定时轮询的方式。
- 有的外部状态变化是基于我们的变化的，为了调试等需求，如果可能的话，要将内部状态变化或者事件和接受到的外部状态变化标记一下，这样就能在发现这类状态不一致时，知道到底时内部同步出去出错，还是外部计算出错了。


需要提供 Doctor 的概念来负责检测内部和外部状态的不一致性。
需要提供 Fixer 的概念来消费 Doctor 的产物修复不一致。

你的任务：
- []



## Document