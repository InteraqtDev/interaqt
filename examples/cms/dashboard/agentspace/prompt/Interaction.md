接下来完善 Interaction 的显示，
你的任务：
## 1. [x] Interaction 完善
1. 先通过 `examples/cms/agentspace/knowledge` 下的文档了解 Interaction 的结构。
2. 在你的设计中已经明确左边显示 Interaction 列表，右边是选中的 Interaction 详细信息。接下来去掉 Interaction 的模拟数据，参考 Entity 和 Relation 使用真实的 Interaciton 数据。
3. 右边详细信息中要把单个 Interaction 中详细的信息都显示出来。

## 2. [x] Interaction 详情问题修复
1. 在 axii 中，只有 null 数据是不显示的，false/undefined 都会被 stringify 然后显示出来，这使得 InteractionDetail 这个组件在界面上显示了很多不必要的 false 等文字。把这些部分都改好。
2. Payload 也可能有 attributive 进行限制，至少要展示 payload 的名字。

## 3. [x] 在 Interaction panel 内部也使用 router0 管理起来
接下来，在 InteractionList 这个组件中使用 router0，来实现把当前选中的 interaction 也管理起来。
你需要做的：
1. 先深入理解 router0 派生子路由的方法。
2. 修改 InteractionList 组件，使用 router0 来管理选中的 interaction。