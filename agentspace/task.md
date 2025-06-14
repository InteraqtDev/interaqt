这是一个后端的响应式框架项目，目前分为了 runtime/shared/storage 三个部分，它们的功能分别是：
- runtime: 驱动响应式的计算
- shared: 通用的数据结构等
- storage: 类似于 orm，完成数据库的操作

这个项目后端的响应式具体指的是：用户只要描述系统中数据的定义，数据的具体变化过程是响应式的。
例如：有一个内容系统，其中一个实体概念是帖子，帖子有一个点赞总数。用户将"点赞总数"描述成"用户和帖子间的点赞关系的总和"，框架会根据这个定义自动知道但出现新的点赞关系时，总数应该加一，这是由"总和"这个概念的定义决定的。总和这个数据在数据库中的变化是由框架自动操作完成的。
这个项目中提供了很多常用的类似于"总和"的概念，可以帮助用户用来表达业务逻辑。
另外项目还提供了一个称为"活动"的状态机，来表达系统中复杂的、可能会有多种角色、多步交互的流程。

接下来，你来辅助完成它的重构。你的任务如下所示，你从没有其中还没有完成的任务中按顺序开始完成，完成之后就更新此文档标记任务为完成：
- [x] 完全理解这个项目，将重要的概念和用法写到 `agentspace/prompt/overview.md` 中。
- [x] 重新来设计响应式系统的设计实现，根据 `agentspace/prompt/reactive_system_design.md` 中的提示继续完成重设计。
- [x] 理解其中是如何通过一个类似 sourcemap 的数据结构来从 data mutation event 中找到对应要触发的 computation 的，将 computation sourcemap 相关的代码和类型定义都从 Scheduler 中抽出来重构到一个新的独立文件中，并保证`npm test`能成功通过。
- [x] 继续重构 Scheduler 和 ComputationSourceMap，让 ComputationSourceMap 来持有数据，并提供查询的接口，而不只是工厂方法。
- [x] 继续遵照 `agentspace/prompt/activity.md` 中的指示完成任务。
- [x] 遵照 `agentspace/prompt/filtered_entity.md` 实现 Filtered Entity。
  - [x] 统一 find 接口，在接口中判断是否为 filtered entity，移除单独的 findForFilteredEntity 方法
  - [x] 支持直接在 filtered entity 上执行 update 和 delete 操作
  - [x] 添加了 filtered entity 事件抛出的测试用例
- [x] 遵照 `agentspace/prompt/scheduler.md` 中的指示梳理 scheduler 并修复 bug。