# 如何使用响应式计算

响应式计算是 interaqt 框架的核心特性，它允许你定义基于其他数据自动计算的值。当依赖的数据发生变化时，计算结果会自动更新，无需手动编写更新逻辑。

## 响应式计算的基本概念

### 什么是响应式计算

响应式计算是一种声明式的数据处理方式：
- **声明性**：你只需要描述计算的逻辑，而不需要关心何时执行
- **自动更新**：当依赖的数据变化时，计算会自动重新执行
- **增量计算**：框架使用高效的增量算法，避免不必要的重新计算
- **持久化**：计算结果会存储在数据库中，提供快速查询

### 响应式计算 vs 普通计算属性

```javascript
// 普通计算属性：每次查询时都会重新计算
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      type: 'number',
      getValue: async (record) => {
        // 每次访问都会执行数据库查询
        return await controller.count('Like', { post: record.id });
      }
    })
  ]
});

// 响应式计算：结果被缓存，只在数据变化时更新
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: likeRelation  // 传入关系实例，而不是实体
      })  // 自动维护，高性能
    })
  ]
});
```

## 使用 Count 计算数量

Count 是最常用的响应式计算类型，用于统计关系或实体的数量。

### 基本用法

```javascript
import { Entity, Property, Relation, Count } from 'interaqt';

// 定义实体和关系
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' })
  ]
});

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    // 使用 Count 计算点赞数
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: Like
      })
    })
  ]
});

const Like = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likers',
  type: 'n:n'
});
```

### 带过滤条件的计数

Count 支持使用 callback 回调函数对记录进行过滤：

```javascript
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })
  ]
});

// 用户实体中统计该用户的已发布帖子数
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['status']}]],
        callback: function(relation) {
          return relation.target.status === 'published'
        }
      })
    })
  ]
});

const UserPostRelation = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
});
```

### 基于数据依赖的动态过滤

Count 支持 dataDeps 参数，允许基于全局数据或其他数据源进行动态过滤：

```javascript
// 基于全局评分阈值统计高分帖子数量
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'highScorePostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['score']}]],
        dataDeps: {
          scoreThreshold: {
            type: 'global',
            source: Dictionary.create({
              name: 'highScoreThreshold',
              type: 'number',
              collection: false
            })
          }
        },
        callback: function(relation, dataDeps) {
          return relation.target.score >= dataDeps.scoreThreshold
        }
      })
    })
  ]
});

// 全局活跃用户计数，基于全局活跃天数设置
const activeUsersCount = Dictionary.create({
  name: 'activeUsersCount',
  type: 'number',
  collection: false,
  computedData: Count.create({
    record: User,
    attributeQuery: ['lastLoginDate'],
    dataDeps: {
      activeDays: {
        type: 'global',
        source: Dictionary.create({
          name: 'userActiveDays',
          type: 'number',
          collection: false
        })
      }
    },
    callback: function(user, dataDeps) {
      const daysSinceLogin = (Date.now() - new Date(user.lastLoginDate).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceLogin <= dataDeps.activeDays
    }
  })
});
```

### 关系方向控制

对于关系计数，可以使用 direction 参数指定计数方向：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 统计作为作者的帖子数量
    Property.create({
      name: 'authoredPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPostRelation,
        direction: 'target'  // 从用户角度看向帖子
      })
    }),
    // 统计作为关注者的关系数量
    Property.create({
      name: 'followingCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: FollowRelation,
        direction: 'target'  // 从用户角度看向被关注者
      })
    })
  ]
});
```

### 属性查询优化

使用 attributeQuery 参数可以优化数据获取，只查询计算所需的属性：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'completedTaskCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserTaskRelation,
        attributeQuery: [['target', {attributeQuery: ['status', 'completedAt']}]],
        callback: function(relation) {
          const task = relation.target
          return task.status === 'completed' && task.completedAt !== null
        }
      })
    })
  ]
});
```

### 实时更新机制

当相关数据发生变化时，Count 会自动更新：

```javascript
// 当用户点赞帖子时
const likePost = async (userId, postId) => {
  // 创建点赞关系
  await controller.createRelation('Like', {
    source: userId,
    target: postId
  });
  
  // likeCount 会自动 +1，无需手动更新
};

// 当用户取消点赞时
const unlikePost = async (userId, postId) => {
  // 删除点赞关系
  await controller.removeRelation('Like', {
    source: userId,
    target: postId
  });
  
  // likeCount 会自动 -1
};
```

## 使用 WeightedSummation 加权求和

WeightedSummation 用于计算加权总和，常用于计算总分、总价等场景。

### 基本用法

```javascript
// 订单项实体
const OrderItem = Entity.create({
  name: 'OrderItem',
  properties: [
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({
      name: 'subtotal',
      type: 'number',
      getValue: (record) => record.quantity * record.price
    })
  ]
});

// 订单实体
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'orderNumber', type: 'string' }),
    // 计算订单总金额
    Property.create({
      name: 'totalAmount',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: OrderItems,
        attributeQuery: [['target', { attributeQuery: ['quantity', 'price'] }]],
        callback: (relation) => ({
          weight: 1,
          value: relation.target.quantity * relation.target.price
        })
      })
    })
  ]
});

const OrderItems = Relation.create({
  source: Order,
  sourceProperty: 'items',
  target: OrderItem,
  targetProperty: 'order',
  relType: 'one:many'
});
```

### 定义权重函数

可以使用函数来定义更复杂的权重计算：

```javascript
// 学生成绩实体
const Grade = Entity.create({
  name: 'Grade',
  properties: [
    Property.create({ name: 'subject', type: 'string' }),
    Property.create({ name: 'score', type: 'number' }),
    Property.create({ name: 'credit', type: 'number' })  // 学分
  ]
});

// 学生实体
const Student = Entity.create({
  name: 'Student',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 计算加权平均分（GPA）
    Property.create({
      name: 'gpa',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: StudentGrades,
        callback: (relation) => ({
          weight: relation.target.credit,
          value: relation.target.score
        })
      })
    }),
    // 计算总学分
    Property.create({
      name: 'totalCredits',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: StudentGrades,
        callback: (relation) => ({
          weight: 1,
          value: relation.target.credit
        })
      })
    })
  ]
});
```

### 条件求和

可以添加条件来只对满足特定条件的记录求和：

```javascript
const Student = Entity.create({
  name: 'Student',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 只计算及格科目的学分
    Property.create({
      name: 'passedCredits',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: StudentGrades,
        callback: (relation) => {
          // 只统计分数 >= 60 的科目
          if (relation.target.score >= 60) {
            return { weight: 1, value: relation.target.credit }
          }
          return { weight: 0, value: 0 }
        }
      })
    })
  ]
});
```

## 使用 Every 和 Any 进行条件判断

Every 和 Any 用于检查集合中的元素是否满足特定条件。

### Every：检查所有元素都满足条件

```javascript
const Task = Entity.create({
  name: 'Task',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })  // pending, completed
  ]
});

const Project = Entity.create({
  name: 'Project',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 检查是否所有任务都已完成
    Property.create({
      name: 'isCompleted',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: ProjectTasks,
        callback: (relation) => relation.target.status === 'completed'
      })
    })
  ]
});

const ProjectTasks = Relation.create({
  source: Project,
  sourceProperty: 'tasks',
  target: Task,
  targetProperty: 'project',
  relType: 'one:many'
});
```

### Any：检查任一元素满足条件

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'role', type: 'string' })
  ]
});

const Project = Entity.create({
  name: 'Project',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 检查项目中是否有管理员
    Property.create({
      name: 'hasAdmin',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Any.create({
        record: ProjectMember,
        callback: (relation) => relation.role === 'admin'
      })
    })
  ]
});

const ProjectMember = Relation.create({
  source: Project,
  sourceProperty: 'members',
  target: User,
  targetProperty: 'projects',
  relType: 'many:many',
  properties: [
    Property.create({ name: 'role', type: 'string', defaultValue: 'member' })
  ]
});
```

### 复杂条件判断

可以使用更复杂的条件表达式：

```javascript
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'status', type: 'string' }),
    // 检查是否所有订单项都有库存
    Property.create({
      name: 'allItemsInStock',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: OrderItems,
        callback: (relation) => {
          const item = relation.target;
          return item.quantity > 0 && item.stockQuantity >= item.quantity;
        }
      })
    }),
    // 检查是否有高价值商品
    Property.create({
      name: 'hasHighValueItem',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Any.create({
        record: OrderItems,
        callback: (relation) => {
          const item = relation.target;
          return (item.quantity * item.price) > 1000;
        }
      })
    })
  ]
});
```

## 使用 Transform 转换数据

Transform 是最灵活的响应式计算类型，允许你定义自定义的转换逻辑。

### 基本用法

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    // 使用 Transform 生成全名
    Property.create({
      name: 'fullName',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: User,
        callback: (record) => `${record.firstName} ${record.lastName}`
      })
    })
  ]
});
```

### 基于关联数据的转换

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 生成用户的标签摘要
    Property.create({
      name: 'tagSummary',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: UserTag,
        callback: (tags) => {
          if (tags.length === 0) return 'No tags';
          if (tags.length <= 3) return tags.map(t => t.name).join(', ');
          return `${tags.slice(0, 3).map(t => t.name).join(', ')} and ${tags.length - 3} more`;
        }
      })
    })
  ]
});
```

### 聚合计算

Transform 可以用于复杂的聚合计算：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // 计算用户活跃度统计
    Property.create({
      name: 'activityStats',
      type: 'object',
      defaultValue: () => ({}),
      computedData: Transform.create({
        record: UserPosts,
        callback: (posts) => {
          const now = new Date();
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          
          const recentPosts = posts.filter(p => new Date(p.createdAt) > oneWeekAgo);
          const monthlyPosts = posts.filter(p => new Date(p.createdAt) > oneMonthAgo);
          
          return {
            totalPosts: posts.length,
            recentPosts: recentPosts.length,
            monthlyPosts: monthlyPosts.length,
            averageLikes: posts.reduce((sum, p) => sum + (p.likeCount || 0), 0) / posts.length || 0
          };
        }
      })
    })
  ]
});
```

### 数据格式转换

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'currency', type: 'string', defaultValue: 'USD' }),
    // 格式化价格显示
    Property.create({
      name: 'formattedPrice',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: Product,
        callback: (record) => {
          const currencySymbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'CNY': '¥'
          };
          const symbol = currencySymbols[record.currency] || record.currency;
          return `${symbol}${record.price.toFixed(2)}`;
        }
      })
    })
  ]
});
```

## 使用 StateMachine 管理状态

StateMachine 用于基于状态转换的计算，特别适用于工作流和状态管理场景。

### 基本状态机

```javascript
import { StateMachine } from 'interaqt';

const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'orderNumber', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      computation: new StateMachine({
        states: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
        initialState: 'pending',
        transitions: [
          { from: 'pending', to: 'paid', condition: 'payment_received' },
          { from: 'paid', to: 'shipped', condition: 'order_shipped' },
          { from: 'shipped', to: 'delivered', condition: 'delivery_confirmed' },
          { from: 'pending', to: 'cancelled', condition: 'order_cancelled' },
          { from: 'paid', to: 'cancelled', condition: 'order_cancelled' }
        ]
      })
    })
  ]
});
```

### 基于事件的状态转换

```javascript
// 定义状态转换事件
const PaymentReceived = Interaction.create({
  name: 'PaymentReceived',
  action: Action.create({
    name: 'recordPayment',
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'orderId', base: Order, isRef: true }),
        PayloadItem.create({ name: 'amount' }),
        PayloadItem.create({ name: 'paymentMethod' })
      ]
    })
  })
});

// 状态机会监听这些事件并自动转换状态
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computation: new StateMachine({
        states: ['pending', 'paid', 'shipped', 'delivered'],
        initialState: 'pending',
        transitions: [
          { 
            from: 'pending', 
            to: 'paid', 
            on: 'PaymentReceived'  // 监听交互事件
          },
          { 
            from: 'paid', 
            to: 'shipped', 
            on: 'OrderShipped' 
          }
        ]
      })
    })
  ]
});
```

### 条件状态转换

```javascript
const LeaveRequest = Entity.create({
  name: 'LeaveRequest',
  properties: [
    Property.create({ name: 'employeeId', type: 'string' }),
    Property.create({ name: 'startDate', type: 'string' }),
    Property.create({ name: 'endDate', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      computation: new StateMachine({
        states: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
        initialState: 'draft',
        transitions: [
          {
            from: 'draft',
            to: 'submitted',
            on: 'SubmitRequest',
            condition: (record) => record.reason && record.startDate && record.endDate
          },
          {
            from: 'submitted',
            to: 'approved',
            on: 'ApproveRequest',
            condition: (record, context) => context.user.role === 'manager'
          },
          {
            from: 'submitted',
            to: 'rejected',
            on: 'RejectRequest',
            condition: (record, context) => context.user.role === 'manager'
          }
        ]
      })
    })
  ]
});
```

## 组合多种计算类型

在实际应用中，通常需要组合使用多种计算类型：

```javascript
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    
    // Count：统计点赞数
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PostLikes
      })
    }),
    
    // Count：统计评论数
    Property.create({
      name: 'commentCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PostComments
      })
    }),
    
    // WeightedSummation：计算总互动分数
    Property.create({
      name: 'engagementScore',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: PostInteractions,
        callback: (relation) => {
          const interaction = relation.target;
          switch (interaction.type) {
            case 'like': return { weight: 1, value: 1 };
            case 'comment': return { weight: 1, value: 3 };
            case 'share': return { weight: 1, value: 5 };
            default: return { weight: 0, value: 0 };
          }
        }
      })
    }),
    
    // Transform：生成内容摘要
    Property.create({
      name: 'summary',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: Post,
        callback: (record) => {
          const content = record.content || '';
          return content.length > 100 
            ? content.substring(0, 100) + '...'
            : content;
        }
      })
    }),
    
    // Every：检查是否所有评论都已审核
    Property.create({
      name: 'allCommentsModerated',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: PostComments,
        callback: (relation) => relation.target.status === 'approved'
      })
    })
  ]
});
```

## 性能优化和最佳实践

### 1. 选择合适的计算类型

```javascript
// ✅ 对于简单计数，使用 Count
Property.create({
  name: 'followerCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Count.create({
    record: Follow
  })
});

// ❌ 避免使用 Transform 做简单计数
Property.create({
  name: 'followerCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Transform.create({
    record: Follow,
    callback: (followers) => followers.length  // 效率低
  })
});
```

### 2. 合理使用条件过滤

```javascript
// ✅ 在计算中使用条件过滤
Property.create({
  name: 'activeUserCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Count.create({
    record: User
  })
});

// ❌ 在 Transform 中过滤
Property.create({
  name: 'activeUserCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Transform.create({
    record: User,
    callback: (users) => users.filter(u => u.status === 'active').length  // 内存中过滤
  })
});
```

### 3. 避免循环依赖

```javascript
// ❌ 避免循环依赖
const User = Entity.create({
  properties: [
    Property.create({
      name: 'score',
      type: 'number',
      defaultValue: () => 0,
      computedData: Transform.create({
        record: UserPosts,
        callback: (posts) => posts.reduce((sum, p) => sum + p.userScore, 0)
      })
    })
  ]
});

const Post = Entity.create({
  properties: [
    Property.create({
      name: 'userScore',
      type: 'number',
      defaultValue: () => 0,
      computedData: Transform.create({
        record: Post,
        callback: (record) => record.baseScore * 0.1  // 避免循环依赖
      })
    })
  ]
});
```

### 4. 使用索引优化查询

```javascript
// 为计算中经常使用的字段添加索引
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      index: true  // 添加索引
    }),
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPosts
      })
    })
  ]
});
```

## 调试和监控

### 1. 启用计算日志

```javascript
// 在开发环境中启用详细日志
const system = new System({
  logging: {
    computation: true,
    level: 'debug'
  }
});
```

### 2. 监控计算性能

```javascript
// 监控计算执行时间
const Post = Entity.create({
  properties: [
    Property.create({
      name: 'complexScore',
      type: 'number',
      computation: new Transform(
        Post,
        null,
        (record) => {
          console.time(`complexScore-${record.id}`);
          const result = /* 复杂计算 */;
          console.timeEnd(`complexScore-${record.id}`);
          return result;
        }
      )
    })
  ]
});
```

响应式计算是 interaqt 的核心优势，通过合理使用各种计算类型，可以大大简化业务逻辑的实现，同时保证数据的一致性和系统的性能。 