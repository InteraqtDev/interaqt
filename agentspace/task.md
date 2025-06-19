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
- [x] 修复对称关系(symmetric relation)的循环计算问题
  - [x] 构造了能重现问题的测试用例 `tests/runtime/symmetricRelation.spec.ts`
  - [x] 确认了问题：删除对称关系时，只有 source 端的计数被更新，target 端的计数没有被更新
  - [x] 分析问题根源并实现修复方案
- [x] 实现 Global 类型的异步计算支持
  - [x] 修改 Scheduler 支持创建 Global 类型的异步任务表
  - [x] 实现 createAsyncTask 和 handleAsyncReturn 对 Global 类型的支持
  - [x] 修改 getAsyncTaskRecordKey 方法支持不同类型的计算
  - [x] 创建测试用例 `tests/runtime/globalAsyncComputed.spec.ts`
  - [x] 测试通过，功能正常工作
- [x] 实现 Entity 和 Relation 类型的异步计算支持
  - [x] 修改 Scheduler 支持创建 Entity 和 Relation 类型的异步任务表
  - [x] 实现 createAsyncTask 对 Entity 和 Relation 类型的支持
  - [x] 实现 handleAsyncReturn 对 Entity 和 Relation 类型的支持
  - [x] 修改 Controller 的 applyResult 方法支持 Entity 和 Relation 类型
  - [x] 创建测试用例 `tests/runtime/entityAsyncComputed.spec.ts`
  - [x] 创建测试用例 `tests/runtime/relationAsyncComputed.spec.ts`
  - [x] 所有测试通过，功能正常工作
- [x] 按照 `agentspace/prompt/document.md` 中的要求完成文档工作。
  - [x] 阅读 `src` 下所有目录和子目录中已有的文档，了解基本情况
  - [x] 阅读 `agentspace` 下目录和子目录中的所有文档，了解之前的任务需要的知识和做了的具体工作
  - [x] 制定写使用文档和开发文档的计划和大纲，写到 `agentspace/knowledge/outline.md` 中
- [x] 按照 `agentspace/prompt/examples.md` 中的要求实现 example.
  - [x] 实现 Example 1: 社交+内容网络 (Social Content Network)
  - [x] 包含用户系统、好友关系、关注关系、内容发布、点赞、浏览等功能
  - [x] 实现完整的实体定义 (User, Post, Tag, Category)
  - [x] 实现完整的关系定义 (Friendship, Follow, Like, View, etc.)
  - [x] 实现响应式计算属性 (friendCount, likeCount, engagementScore, etc.)
  - [x] 实现所有交互定义 (RegisterUser, CreatePost, LikePost, etc.)
  - [x] 创建完整的测试套件覆盖所有功能
  - [x] 修复所有核心功能问题，实体和关系正常工作
- [] 实现 ExternalSynchronizer