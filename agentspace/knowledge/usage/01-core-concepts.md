# 核心概念与响应式机制概览

## 框架的核心理念

interaqt 是一个响应式的后端框架，其核心理念是：**用户只需要描述系统中数据的定义，数据的具体变化过程是响应式的**。

### 基本范式：data = computation(events)

在传统的后端开发中，开发者需要手动处理数据的变更逻辑：
```javascript
// 传统方式：手动更新点赞数
async function likePost(userId, postId) {
  await createLike(userId, postId);
  const likeCount = await countLikes(postId);
  await updatePost(postId, { likeCount });
}
```

而在 interaqt 中，你只需要声明数据的定义：
```javascript
// 响应式方式：声明点赞数的计算方式
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: Like
      })  // 自动计算点赞数
    })
  ]
});
```

当用户点赞时，系统会自动更新点赞数，无需手动编写更新逻辑。

## 核心概念

### Entity（实体）
数据的基本单位，如 User、Post、Comment 等。

### Property（属性）
实体的字段，可以是普通值或基于其他数据自动计算的值。

### Relation（关系）
实体之间的连接，如用户与帖子的点赞关系。

### Interaction（交互）
用户触发的事件，是系统中数据变化的唯一来源。

### Computation（计算）
基于其他数据自动计算的值，是响应式的核心。

### Activity（活动）
多个相关 Interaction 的有序组合，实现复杂业务流程。

## 响应式计算的工作原理

1. **事件源**：所有数据变化都源于用户的 Interaction
2. **变更追踪**：系统自动生成变更事件
3. **依赖图**：Computation 声明了对哪些数据的依赖
4. **自动传播**：当依赖的数据变化时，相关计算自动重新执行
5. **增量计算**：使用增量算法避免全量重算，保证性能

## 典型使用场景

- **内容系统**：文章、评论、点赞统计
- **社交网络**：好友关系、动态更新
- **审批流程**：多步骤、多角色协作
- **电商系统**：订单状态、库存计算 