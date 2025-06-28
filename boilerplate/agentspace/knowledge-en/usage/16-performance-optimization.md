# Performance Optimization Guide

## Overview

This chapter introduces key performance optimization strategies in the InterAQT framework, particularly incremental computation optimization for reactive computations. Proper data modeling and dependency design can greatly improve system performance and avoid unnecessary full table scans.

## Core Principle: Incremental vs Full Computation

### Advantages of Incremental Computation

The core advantage of the InterAQT framework lies in its **incremental computation** capability. When data changes occur, the framework can:

1. **Precise Targeting**: Only recompute affected portions
2. **Incremental Updates**: Directly calculate new results using change deltas
3. **Avoid Full Table Scans**: No need to re-read all related data

```typescript
// Example: Incremental computation for Count
class CountComputation {
  async incrementalCompute(lastValue: number, mutationEvent: RecordMutationEvent): Promise<number> {
    switch (mutationEvent.type) {
      case 'create': return lastValue + 1;  // O(1) operation
      case 'delete': return lastValue - 1;  // O(1) operation
      case 'update': return lastValue;      // Usually doesn't affect count
    }
  }
}
```

### Performance Issues with Full Computation

When the framework cannot perform incremental computation, it degrades to **full recomputation**:

```typescript
// Full recomputation: needs to read all related records
async compute(dataDeps: any): Promise<number> {
  const allRecords = await this.storage.find(entityName);  // Full table scan!
  return allRecords.length;
}
```

## Key Performance Trap: x:n Relationship Dependency Paths

### Problem Description

When reactive computations access dependency paths containing **x:n relationships** through `attributeQuery`, without proper modeling, it can lead to performance issues:

```typescript
// ⚠️ Potential performance issue: dependency path contains 1:n relationship
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'totalPostLikes',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: userPostRelation,  // User 1:n Post
        // Issue: accessing Post's likes through relationship path
        attributeQuery: [['target', { attributeQuery: ['likes'] }]]  // Post 1:n Like
      })
    })
  ]
});
```

### Problem Analysis

**Difficulty of incremental computation in x:n relationships**:

1. **Complex dependency paths**: `User → Posts → Likes` contains two levels of x:n relationships
2. **Incremental computation complexity**: When a Post's Like changes, the framework struggles to efficiently:
   - Determine which Users are affected
   - Calculate incremental changes
   - Avoid rescanning all Posts and Likes

3. **Degradation to full computation**: The framework may:
   - Re-read all of the user's Posts
   - Recount all Posts' Likes
   - Result in O(n) or even O(n²) performance overhead

## Solution: Express n-side Computation Through Properties

### Core Strategy

**Define computed properties directly on n-side entities**, allowing reactive computations to utilize incremental updates:

```typescript
// ✅ Optimization solution: Define likeCount property on Post entity
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    // Define computed property directly on n-side
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: postLikeRelation  // Post 1:n Like, simple one-level relationship
      })
    })
  ]
});

// ✅ Then use simplified dependency path on User side
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'totalPostLikes',
      type: 'number',
      defaultValue: () => 0,
      computedData: Summation.create({
        record: userPostRelation,  // User 1:n Post
        // Now only need to access Post's likeCount property (already pre-computed)
        attributeQuery: [['target', { attributeQuery: ['likeCount'] }]]
      })
    })
  ]
});
```

### Optimization Results

With this approach:

1. **Incremental computation for Post.likeCount**:
   - When Like is created/deleted: `likeCount += 1` or `likeCount -= 1`
   - Time complexity: O(1)

2. **Incremental computation for User.totalPostLikes**:
   - When Post.likeCount changes: `totalPostLikes += delta`
   - Time complexity: O(1)

3. **Avoid full table scans**:
   - No need to re-read all Likes
   - No need to recompute statistics for all Posts

## Performance Optimization Patterns

### Pattern 1: Hierarchical Computed Properties

**Principle**: Define aggregate computations on the n-side of relationships, reference pre-computed results on the 1-side.

```typescript
// 1. Calculate subtotal on order items
const OrderItem = Entity.create({
  name: 'OrderItem',
  properties: [
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'unitPrice', type: 'number' }),
    // Compute on n-side
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

// 2. Aggregate pre-computed subtotals on order
const Order = Entity.create({
  name: 'Order',
  properties: [
    // Use pre-computed subtotal instead of recalculating quantity * unitPrice
    Property.create({
      name: 'totalAmount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Summation.create({
        record: orderItemRelation,
        attributeQuery: [['target', { attributeQuery: ['subtotal'] }]]  // Reference pre-computed result
      })
    })
  ]
});
```

### Pattern 2: Avoid Deep Dependency Paths

**Principle**: Limit the nesting depth of attributeQuery, especially when crossing multiple x:n relationships.

```typescript
// ❌ Avoid: Deep dependency paths
Property.create({
  name: 'badMetric',
  computedData: Count.create({
    record: userRelation,
    // Issue: User → Posts → Comments → Likes (3 levels of x:n relationships)
    attributeQuery: [['target', { 
      attributeQuery: ['posts', { 
        attributeQuery: ['comments', { 
          attributeQuery: ['likes'] 
        }] 
      }] 
    }]]
  })
});

// ✅ Recommended: Layered pre-computation
// Layer 1: Comment.likeCount
// Layer 2: Post.commentLikeCount = Summation(Comment.likeCount)
// Layer 3: User.totalCommentLikes = Summation(Post.commentLikeCount)
```

### Pattern 3: Proper Use of Every/Any Computations

**Principle**: When using Every/Any, ensure judgment conditions are based on pre-computed properties of the n-side.

```typescript
// ✅ Optimized Every computation
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'allPostsPopular',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: userPostRelation,
        // Use Post's pre-computed property
        attributeQuery: [['target', { attributeQuery: ['likeCount'] }]],
        callback: (posts) => {
          return posts.every(post => post.target.likeCount >= 10);
        }
      })
    })
  ]
});
```

## Best Practices Summary

### Design Principles

1. **Compute Locally**: Perform computations where data is generated
2. **Layered Aggregation**: Use multi-layer pre-computation to avoid deep dependencies
3. **Incremental-Friendly**: Consider incremental computation feasibility during design

### Checklist

When designing reactive computations, check the following points:

- [ ] **Dependency Path Depth**: Does it exceed 2 levels of x:n relationships?
- [ ] **N-side Pre-computation**: Do n-side entities have necessary aggregate properties?
- [ ] **Computation Complexity**: Are callback functions simple enough?
- [ ] **Incremental Possibility**: Can incremental computation be performed when changes occur?

### Refactoring Guidelines

Refactor existing performance-problematic code to high-performance versions:

```typescript
// Before refactoring: performance issue
const problematicComputation = Count.create({
  record: complexRelation,
  attributeQuery: [['deep', { attributeQuery: ['nested', { attributeQuery: ['path'] }] }]]
});

// After refactoring: performance optimized
// 1. Add pre-computed property to intermediate entity
MiddleEntity.properties.push(
  Property.create({
    name: 'nestedCount',
    computedData: Count.create({
      record: simpleRelation,
      attributeQuery: [['target', { attributeQuery: ['path'] }]]
    })
  })
);

// 2. Use pre-computed result
const optimizedComputation = Summation.create({
  record: topLevelRelation,
  attributeQuery: [['target', { attributeQuery: ['nestedCount'] }]]
});
```

By following these performance optimization principles, you can ensure that InterAQT applications maintain high-performance reactive computation capabilities even with large-scale data.
