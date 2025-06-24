# 性能优化指南

## 概述

本章介绍 interaqt 框架中的关键性能优化策略，特别是响应式计算的增量计算优化。正确的数据建模和依赖设计能够极大提升系统性能，避免不必要的全表扫描。

## 核心原理：增量计算 vs 全量计算

### 增量计算的优势

interaqt 框架的核心优势在于**增量计算**能力。当数据发生变更时，框架能够：

1. **精确定位**：只重新计算受影响的部分
2. **增量更新**：利用变更增量直接计算新结果
3. **避免全表扫描**：不需要重新读取所有相关数据

```typescript
// 示例：Count 的增量计算
class CountComputation {
  async incrementalCompute(lastValue: number, mutationEvent: RecordMutationEvent): Promise<number> {
    switch (mutationEvent.type) {
      case 'create': return lastValue + 1;  // O(1) 操作
      case 'delete': return lastValue - 1;  // O(1) 操作
      case 'update': return lastValue;      // 通常不影响计数
    }
  }
}
```

### 全量计算的性能问题

当框架无法进行增量计算时，会退化为**全量重算**：

```typescript
// 全量重算：需要读取所有相关记录
async compute(dataDeps: any): Promise<number> {
  const allRecords = await this.storage.find(entityName);  // 全表扫描！
  return allRecords.length;
}
```

## 关键性能陷阱：x:n 关系的依赖路径

### 问题描述

当响应式计算通过 `attributeQuery` 访问包含 **x:n 关系** 的依赖路径时，如果没有正确建模，会导致性能问题：

```typescript
// ⚠️ 潜在性能问题：依赖路径包含 1:n 关系
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'totalPostLikes',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: userPostRelation,  // User 1:n Post
        // 问题：通过关系路径访问 Post 的 likes
        attributeQuery: [['target', { attributeQuery: ['likes'] }]]  // Post 1:n Like
      })
    })
  ]
});
```

### 问题原理

**x:n 关系中的增量计算困难**：

1. **依赖路径复杂**：`User → Posts → Likes` 包含两层 x:n 关系
2. **增量计算复杂性**：当某个 Post 的 Like 发生变化时，框架难以高效地：
   - 确定哪些 User 受影响
   - 计算增量变化
   - 避免重新扫描所有 Posts 和 Likes

3. **退化为全量计算**：框架可能会：
   - 重新读取用户的所有 Posts
   - 重新统计所有 Posts 的 Likes
   - 导致 O(n) 甚至 O(n²) 的性能开销

## 解决方案：通过 Property 表达 n 端计算

### 核心策略

**在 n 端实体上直接定义计算属性**，让响应式计算能够利用增量更新：

```typescript
// ✅ 优化方案：在 Post 实体上定义 likeCount 属性
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    // 在 n 端直接定义计算属性
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: postLikeRelation  // Post 1:n Like，简单的一层关系
      })
    })
  ]
});

// ✅ 然后在 User 端使用简化的依赖路径
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'totalPostLikes',
      type: 'number',
      defaultValue: () => 0,
      computedData: Sum.create({
        record: userPostRelation,  // User 1:n Post
        // 现在只需要访问 Post 的 likeCount 属性（已经预计算好的）
        attributeQuery: [['target', { attributeQuery: ['likeCount'] }]]
      })
    })
  ]
});
```

### 优化效果

采用这种方案后：

1. **Post.likeCount 的增量计算**：
   - 当 Like 创建/删除时：`likeCount += 1` 或 `likeCount -= 1`
   - 时间复杂度：O(1)

2. **User.totalPostLikes 的增量计算**：
   - 当 Post.likeCount 变化时：`totalPostLikes += delta`
   - 时间复杂度：O(1)

3. **避免全表扫描**：
   - 不需要重新读取所有 Likes
   - 不需要重新计算所有 Posts 的统计信息

## 性能优化模式

### 模式 1：层次化计算属性

**原则**：在关系的 n 端定义聚合计算，在 1 端引用预计算结果。

```typescript
// 1. 在订单项上计算小计
const OrderItem = Entity.create({
  name: 'OrderItem',
  properties: [
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'unitPrice', type: 'number' }),
    // 在 n 端计算
    Property.create({
      name: 'subtotal',
      type: 'number',
      computedData: Transform.create({
        record: OrderItem,
        callback: (record) => record.quantity * record.unitPrice
      })
    })
  ]
});

// 2. 在订单上汇总预计算的小计
const Order = Entity.create({
  name: 'Order',
  properties: [
    // 使用预计算的 subtotal，而不是重新计算 quantity * unitPrice
    Property.create({
      name: 'totalAmount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Sum.create({
        record: orderItemRelation,
        attributeQuery: [['target', { attributeQuery: ['subtotal'] }]]  // 引用预计算结果
      })
    })
  ]
});
```

### 模式 2：避免深层依赖路径

**原则**：限制 attributeQuery 的嵌套深度，特别是跨越多个 x:n 关系时。

```typescript
// ❌ 避免：深层依赖路径
Property.create({
  name: 'badMetric',
  computedData: Count.create({
    record: userRelation,
    // 问题：User → Posts → Comments → Likes (3层x:n关系)
    attributeQuery: [['target', { 
      attributeQuery: ['posts', { 
        attributeQuery: ['comments', { 
          attributeQuery: ['likes'] 
        }] 
      }] 
    }]]
  })
});

// ✅ 推荐：分层预计算
// 第1层：Comment.likeCount
// 第2层：Post.commentLikeCount = Sum(Comment.likeCount)
// 第3层：User.totalCommentLikes = Sum(Post.commentLikeCount)
```

### 模式 3：合理使用 Every/Any 计算

**原则**：在使用 Every/Any 时，确保判断条件基于 n 端的预计算属性。

```typescript
// ✅ 优化的 Every 计算
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'allPostsPopular',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: userPostRelation,
        // 使用 Post 的预计算属性
        attributeQuery: [['target', { attributeQuery: ['likeCount'] }]],
        callback: (posts) => {
          return posts.every(post => post.target.likeCount >= 10);
        }
      })
    })
  ]
});
```

## 最佳实践总结

### 设计原则

1. **就近计算**：在数据产生的地方就进行计算
2. **分层聚合**：通过多层预计算避免深层依赖
3. **增量友好**：设计时考虑增量计算的可行性

### 检查清单

在设计响应式计算时，检查以下要点：

- [ ] **依赖路径深度**：是否超过 2 层 x:n 关系？
- [ ] **n 端预计算**：n 端实体是否有必要的聚合属性？
- [ ] **计算复杂度**：callback 函数是否足够简单？
- [ ] **增量可能性**：变更时是否可以进行增量计算？

### 重构指导

将现有的性能问题代码重构为高性能版本：

```typescript
// 重构前：性能问题
const problematicComputation = Count.create({
  record: complexRelation,
  attributeQuery: [['deep', { attributeQuery: ['nested', { attributeQuery: ['path'] }] }]]
});

// 重构后：性能优化
// 1. 在中间实体添加预计算属性
MiddleEntity.properties.push(
  Property.create({
    name: 'nestedCount',
    computedData: Count.create({
      record: simpleRelation,
      attributeQuery: [['target', { attributeQuery: ['path'] }]]
    })
  })
);

// 2. 使用预计算结果
const optimizedComputation = Sum.create({
  record: topLevelRelation,
  attributeQuery: [['target', { attributeQuery: ['nestedCount'] }]]
});
```

通过遵循这些性能优化原则，可以确保 interaqt 应用在大规模数据下仍然保持高性能的响应式计算能力。