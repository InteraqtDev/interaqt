我们需求要设计一下给 agent 的 prompt，来处理用户需求中有版本控制的实体的情况。

用户对版本控制的需求可能是这样：
有一个 entity 类型 Product，Product 支持正常的增删改查。当用户执行 `createProductSnapshot` 交互时，保存 Product 的所有的数据，当指定 `rollbackProduct` 交互时，所有数据回到 payload 指定的版本。

在我们的响应式数据框架中，要求描述的是数据是什么，而不是如何操作数据。所以我们会这样实现：
- Product 所有版本的数据都存在一起，叫做 VersionedProduct。
- 每一次发布时，并不是把所有数据把保存成一个快照，而是继续增加新的记录，但 version 变成新的。
- 不管是 rollback 还是正常创建，永远都是新增数据。
- 有一个全局的数据记录着当前的 version。如果是 rollback 就还要记录 rollback 指向的 id。
- 用户获取的 Product ，实际上是从 VersionedProduct 中筛选出的当前 version 的 product 数据。


我们的实现和用户的表达之间，存在一个很大的范式不同。如何找到一种比较确定的指导思路，让 agent 碰到类似的场景时，能自动相处上述实现方法？把你的回答写到 agentspace/output 下