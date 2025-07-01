# 如何使用响应式计算

⚠️ **前提：请先阅读 [00-mindset-shift.md](./00-mindset-shift.md) 理解声明式思维**

响应式计算是 interaqt 框架的核心特性。它的本质是**声明数据是什么**，而不是指定如何计算数据。

## 核心思维：数据"是"什么，而不是"如何计算"

### ❌ 错误思维：试图计算数据
```javascript
// 错误：试图写"如何计算"的逻辑
function updateLikeCount(postId) {
  const likes = db.query('SELECT COUNT(*) FROM likes WHERE postId = ?', postId);
  db.update('posts', { likeCount: likes }, { id: postId });
}
```

### ✅ 正确思维：声明数据是什么
```javascript
// 正确：声明点赞数"就是"点赞关系的数量
Property.create({
  name: 'likeCount',
  computedData: Count.create({
    record: LikeRelation  // 点赞数就是点赞关系的Count
  })
})
```

## 响应式计算的基本概念

### 什么是响应式计算

响应式计算是一种**声明式的数据定义方式**：
- **声明性**：你声明数据"是什么"，而不是"如何计算"
- **自动维护**：当依赖的数据变化时，计算结果自动更新
- **增量计算**：框架使用高效的增量算法，避免不必要的重新计算
- **持久化**：计算结果会存储在数据库中，提供快速查询

### 核心原则：数据的存在性

在 interaqt 中，所有数据都有其"存在的理由"：
- 用户帖子数**存在**，因为它是用户帖子关系的Count
- 订单总金额**存在**，因为它是订单项的加权求和
- 产品库存**存在**，因为它是初始库存减去销售数量
- 通知记录**存在**，因为它是对特定交互事件的Transform

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

### ⚠️ 重要：Transform vs getValue 的使用场景

**Transform** 用于从其他实体或关系创建**派生实体**：
- ✅ 当基于其他实体的数据创建新的实体类型时使用 Transform
- ✅ 当将关系数据转换为实体数据时使用 Transform
- ✅ 当源数据来自 InteractionEventEntity 时使用 Transform

**getValue** 用于同一实体内的计算属性：
- ✅ 对于简单的计算属性（如从 firstName + lastName 生成 fullName）使用 getValue
- ✅ 当计算只需要当前记录的数据时使用 getValue

❌ **绝对不要**在 Transform 的 `record` 参数中引用正在定义的实体 - 这会造成循环引用！

### 基本用法

```javascript
// 对于同一实体内的简单属性转换，应使用 getValue 而不是 Transform
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    // ✅ 正确：使用 getValue 计算同一实体内的属性
    Property.create({
      name: 'fullName',
      type: 'string',
      getValue: (record) => `${record.firstName} ${record.lastName}`
    })
  ]
});

// ⚠️ 重要：Transform 不应该引用正在定义的实体
// Transform 是用于从其他实体或关系创建派生实体的
```

### Transform 的正确使用示例

```javascript
// ✅ 正确：基于其他实体创建派生实体
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'isAvailable', type: 'boolean' })
  ]
});

// Transform 从现有的 Product 数据创建新的实体类型
const DiscountedProduct = Entity.create({
  name: 'DiscountedProduct',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'originalPrice', type: 'number' }),
    Property.create({ name: 'discountedPrice', type: 'number' }),
    Property.create({ name: 'discount', type: 'string' })
  ],
  computedData: Transform.create({
    record: Product,  // 引用一个不同的、已经定义好的实体
    callback: (product) => {
      return {
        name: product.name,
        originalPrice: product.price,
        discountedPrice: product.price * 0.9,
        discount: '10%'
      };
    }
  })
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
    // ✅ 正确：使用 getValue 进行简单的属性格式化
    Property.create({
      name: 'formattedPrice',
      type: 'string',
      getValue: (record) => {
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
  ]
});
```

### 从交互数据 Transform：声明式数据转换的核心

Transform 最重要的应用场景之一是**从用户交互数据中 Transform 出其他业务数据**。这体现了 interaqt 框架的核心思想：**一切皆数据，数据从数据中转换而来**。

#### 核心理念：交互是数据，数据从数据转换而来

在 interaqt 中，用户交互（Interaction）本身就是一种数据，存储在 InteractionEventEntity 中。Transform 不是传统的"事件驱动+回调"模式，而是**声明式的数据转换关系**：

> 声明：DirectorMemo **是** InteractionEventEntity 经过某种转换规则得到的结果

这与传统事件驱动的区别：
- **传统事件驱动**：当事件发生时，执行回调函数处理
- **interaqt Transform**：声明一种数据是如何从另一种数据转换而来

```typescript
// ❌ 错误思维：命令式地在交互处理中手动创建数据
async function handleUserLogin(userId) {
  await createLoginRecord(userId);
  
  // 手动检查和创建 - 这是命令式的"如何做"
  const loginCount = await getLoginCountThisMonth(userId);
  if (loginCount >= 10) {
    await createActivityReward(userId, 'frequent_user');
  }
}

// ✅ 正确思维：声明式地定义数据转换关系
// ActivityReward "是什么"：是满足条件的 InteractionEventEntity 的转换结果
const ActivityReward = Entity.create({
  name: 'ActivityReward',
  properties: [
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user', 'createdAt'],
    dataDeps: {
      users: {
        type: 'records',
        source: User,
        attributeQuery: ['username', 'monthlyLoginCount']
      }
    },
    callback: (interactionEvents, dataDeps) => {
      // Transform 的本质：定义数据转换规则
      // 输入：InteractionEventEntity 数据 + 依赖数据
      // 输出：ActivityReward 数据（或 null）
      
      return interactionEvents
        .filter(event => event.interactionName === 'userLogin')
        .map(event => {
          const user = dataDeps.users.find(u => u.id === event.user.id);
          
          // 声明转换条件：当用户月登录次数>=10时，此交互数据转换为奖励数据
          if (user && user.monthlyLoginCount >= 10) {
            return {
              type: 'frequent_user',
              description: `${user.username} 获得活跃用户奖励`,
              createdAt: event.createdAt,
              userId: user.id
            };
          }
          
          // 不满足转换条件时返回 null（表示此交互不产生奖励数据）
          return null;
        })
        .filter(reward => reward !== null);
    }
  })
});
```

#### Transform 的条件转换：null 返回机制

Transform 支持返回 `null` 来表示"某些输入数据不参与转换"，这是实现条件转换的核心机制：

```typescript
// 请假系统示例：备忘录从请假交互中产生
const DirectorMemo = Entity.create({
  name: 'DirectorMemo',
  properties: [
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'priority', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user', 'payload', 'createdAt'],
    dataDeps: {
      users: {
        type: 'records',
        source: User,
        attributeQuery: ['username', 'currentMonthLeaveCount']
      }
    },
    callback: (interactionEvents, dataDeps) => {
      // 声明数据转换关系：
      // 输入：submitLeaveRequest 交互数据 + 用户数据
      // 输出：满足条件的 DirectorMemo 数据
      
      return interactionEvents
        .filter(event => event.interactionName === 'submitLeaveRequest')
        .map(event => {
          const user = dataDeps.users.find(u => u.id === event.user.id);
          
          // 转换规则：当用户本月请假次数 >= 3 时，此交互数据转换为备忘录数据
          if (user && user.currentMonthLeaveCount >= 3) {
            return {
              content: `${user.username} 本月第 ${user.currentMonthLeaveCount} 次请假，需要关注`,
              priority: user.currentMonthLeaveCount >= 5 ? 'urgent' : 'high',
              createdAt: event.createdAt
            };
          }
          
          // 关键：不满足转换条件时返回 null，表示此交互数据不转换为备忘录
          return null;
        })
        .filter(memo => memo !== null); // 过滤掉不参与转换的数据
    }
  })
});
```

#### 一对多 Transform：一个交互数据转换为多种数据

真实业务中，一个交互数据往往可以转换为多种不同的业务数据，这体现了 Transform 声明式转换的强大能力：

```typescript
// 声明用户下单交互数据如何转换为多种业务数据：
// InteractionEventEntity (createOrder) → Order, InventoryChange, PointsReward

const OrderInteraction = Interaction.create({
  name: 'createOrder',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderData', base: Order }),
      PayloadItem.create({ name: 'items', base: OrderItem, isCollection: true })
    ]
  })
});

// 1. 订单记录（主要转换）
// 声明：Order 数据是 createOrder 交互数据的直接转换
Order.computedData = Transform.create({
  record: InteractionEventEntity,
  callback: (interactionEvents) => {
    return interactionEvents
      .filter(event => event.interactionName === 'createOrder')
      .map(event => ({
        ...event.payload.orderData,
        createdAt: event.createdAt,
        userId: event.user.id
      }));
  }
});

// 2. 库存变更记录（衍生转换）
// 声明：InventoryChange 数据是从 createOrder 交互数据中提取商品信息转换而来
const InventoryChange = Entity.create({
  name: 'InventoryChange',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: (interactionEvents) => {
      const changes = [];
      
      interactionEvents
        .filter(event => event.interactionName === 'createOrder')
        .forEach(event => {
          // 从交互数据中提取订单商品，转换为库存变更数据
          event.payload.items.forEach(item => {
            changes.push({
              productId: item.productId,
              changeAmount: -item.quantity,
              reason: 'order_created',
              orderId: event.id,
              createdAt: event.createdAt
            });
          });
        });
      
      return changes;
    }
  })
});

// 3. 积分奖励（条件转换）
// 声明：PointsReward 数据是满足金额条件的 createOrder 交互数据的转换结果
const PointsReward = Entity.create({
  name: 'PointsReward',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: (interactionEvents) => {
      return interactionEvents
        .filter(event => event.interactionName === 'createOrder')
        .map(event => {
          const orderTotal = event.payload.orderData.totalAmount;
          
          // 转换条件：只有订单金额 > 100 的交互数据才转换为积分奖励
          if (orderTotal > 100) {
            return {
              userId: event.user.id,
              points: Math.floor(orderTotal / 10),
              reason: 'order_reward',
              orderId: event.id,
              createdAt: event.createdAt
            };
          }
          
          return null; // 小额订单的交互数据不转换为积分
        })
        .filter(reward => reward !== null);
    }
  })
});
```

#### 交互驱动 vs 状态驱动的选择

选择从交互数据转换还是从状态数据转换取决于业务语义：

```typescript
// 交互驱动：适合"每个X交互可能转换为Y数据"
// 强调的是：特定交互行为本身就产生了特定的业务数据
const LoginBonusPoints = Entity.create({
  name: 'LoginBonusPoints',
  computedData: Transform.create({
    record: InteractionEventEntity, // 从交互数据转换
    callback: (interactionEvents) => {
      return interactionEvents
        .filter(event => event.interactionName === 'userLogin')
        .map(event => {
          // 每个登录交互都可能转换为登录奖励数据
          return isFirstLoginToday(event) ? createLoginBonus(event) : null;
        })
        .filter(bonus => bonus !== null);
    }
  })
});

// 状态驱动：适合"当实体状态为X时，Y数据应该存在"
// 强调的是：基于实体的当前状态计算出衍生数据
const VIPStatus = Entity.create({
  name: 'VIPStatus',
  computedData: Transform.create({
    record: User, // 从用户状态数据转换
    callback: (users) => {
      return users
        .filter(user => user.totalSpent > 10000) // 状态转换条件
        .map(user => ({
          userId: user.id,
          level: calculateVIPLevel(user.totalSpent),
          activatedAt: new Date().toISOString()
        }));
    }
  })
});
```

#### 最佳实践

1. **优先考虑交互驱动**：当业务数据与用户行为直接相关时
2. **数据血缘清晰**：每个 Transform 出来的数据都能追溯到具体的源数据
3. **善用 null 返回**：让条件转换逻辑变得简洁明确
4. **一个数据源多个 Transform**：不要在一个 Transform 里处理所有转换逻辑

```typescript
// ✅ 好的实践：转换职责分离
Order.computedData = Transform.create({ /* 只负责转换为订单数据 */ });
InventoryChange.computedData = Transform.create({ /* 只负责转换为库存变更数据 */ });
PointsReward.computedData = Transform.create({ /* 只负责转换为积分奖励数据 */ });

// ❌ 不好的实践：混合转换职责
Order.computedData = Transform.create({
  callback: (interactionEvents) => {
    // 在这里既转换为订单，又转换为库存变更，又转换为积分...
  }
});
```

**核心理解**：Transform 的本质是**声明式数据转换关系**，而不是传统的事件回调。每个用户交互数据都可能转换为多种业务数据，这种**数据→数据**的转换映射让业务逻辑变得清晰、可维护且自动响应。

**关键区别**：
- **传统事件驱动**：当事件发生时 → 执行回调函数 → 手动创建数据
- **interaqt Transform**：声明数据转换关系 → 框架自动维护 → 源数据变化时目标数据自动更新

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

## 使用 RealTime 实时计算

RealTime 实时计算是 interaqt 框架中处理时间敏感数据和业务逻辑的核心特性。它允许你声明基于时间的计算，并自动管理计算状态和重新计算时机。

### 理解实时计算

#### 什么是实时计算

实时计算是一种**时间感知的响应式计算**：
- **时间驱动**：基于当前时间进行计算
- **自动调度**：系统自动管理何时重新计算
- **状态持久化**：计算状态被持久化存储
- **临界感知**：能够计算出状态变化的临界时间点

```typescript
// 传统时间相关逻辑的问题
function checkBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  return hour >= 9 && hour <= 17;
}

// 问题：
// 1. 需要手动轮询检查
// 2. 无法预知状态变化时间点
// 3. 状态不持久化

// 使用 RealTime 的声明式方案
const isBusinessHours = Dictionary.create({
  name: 'isBusinessHours',
  type: 'boolean',
  computedData: RealTime.create({
    callback: async (now: Expression, dataDeps) => {
      const hour = now.divide(3600000).modulo(24); // 小时数
      return hour.gt(9).and(hour.lt(17));
    }
  })
});

// ✅ 系统自动管理何时重新计算
// ✅ 自动计算出临界变化时间点（9点和17点）
// ✅ 状态持久化存储
```

#### RealTime vs 普通计算

| 特性 | RealTime 计算 | 普通响应式计算 |
|------|---------------|----------------|
| **触发方式** | 时间驱动 + 数据驱动 | 仅数据驱动 |
| **计算输入** | 当前时间 + 数据依赖 | 仅数据依赖 |
| **调度管理** | 自动时间调度 | 仅数据变更触发 |
| **状态管理** | 双状态跟踪 | 无特殊状态 |
| **临界预测** | 支持临界时间点计算 | 不适用 |

### RealTime 基本用法

#### 创建实时计算

```typescript
import { RealTime, Expression, Dictionary } from 'interaqt';

// 基本实时计算：当前时间戳（秒）
const currentTimestamp = Dictionary.create({
  name: 'currentTimestamp',
  type: 'number',
  computedData: RealTime.create({
    nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 每秒更新
    callback: async (now: Expression, dataDeps: any) => {
      return now.divide(1000); // 转换为秒
    }
  })
});
```

#### Expression 类型计算

Expression 类型的计算返回数值结果，适用于各种数学运算：

```typescript
// 复杂时间计算
const timeBasedMetric = Dictionary.create({
  name: 'timeBasedMetric',
  type: 'number',
  computedData: RealTime.create({
    nextRecomputeTime: (now: number, dataDeps: any) => 5000, // 每5秒更新
    dataDeps: {
      config: {
        type: 'records',
        source: configEntity,
        attributeQuery: ['multiplier']
      }
    },
    callback: async (now: Expression, dataDeps: any) => {
      const multiplier = dataDeps.config?.[0]?.multiplier || 1;
      const timeInSeconds = now.divide(1000);
      const timeInMinutes = now.divide(60000);
      
      // 复合计算：(时间秒数 * 系数) + √(时间分钟数)
      return timeInSeconds.multiply(multiplier).add(timeInMinutes.sqrt());
    }
  })
});
```

#### Inequality 类型计算

Inequality 类型的计算返回布尔结果，系统会自动计算出状态变化的临界时间点：

```typescript
// 时间阈值检查
const isAfterDeadline = Dictionary.create({
  name: 'isAfterDeadline',
  type: 'boolean',
  computedData: RealTime.create({
    dataDeps: {
      project: {
        type: 'records',
        source: projectEntity,
        attributeQuery: ['deadline']
      }
    },
    callback: async (now: Expression, dataDeps: any) => {
      const deadline = dataDeps.project?.[0]?.deadline || Date.now() + 86400000;
      
      // 检查当前时间是否超过截止时间
      return now.gt(deadline);
      // 系统会自动计算出在 deadline 时间点重新计算
    }
  })
});
```

#### Equation 类型计算

Equation 类型用于时间等式计算，同样会自动计算临界时间点：

```typescript
// 检查是否为整点时间
const isExactHour = Dictionary.create({
  name: 'isExactHour',
  type: 'boolean',
  computedData: RealTime.create({
    callback: async (now: Expression, dataDeps: any) => {
      const millisecondsInHour = 3600000;
      
      // 检查当前时间是否为整点
      return now.modulo(millisecondsInHour).eq(0);
      // 系统会自动计算出下一个整点时间进行重新计算
    }
  })
});
```

### 属性级实时计算

#### 定义属性级实时计算

```typescript
// 在实体属性上定义实时计算
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'lastLoginAt', type: 'number'}),
    
    // 实时计算：用户是否最近活跃
    Property.create({
      name: 'isRecentlyActive',
      type: 'boolean',
      computedData: RealTime.create({
        dataDeps: {
          _current: {
            type: 'property',
            attributeQuery: ['lastLoginAt']
          }
        },
        callback: async (now: Expression, dataDeps: any) => {
          const lastLogin = dataDeps._current?.lastLoginAt || 0;
          const oneHourAgo = now.subtract(3600000);
          
          // 检查用户是否在最近一小时内登录过
          return Expression.number(lastLogin).gt(oneHourAgo);
        }
      })
    }),
    
    // 实时计算：用户在线时长（分钟）
    Property.create({
      name: 'onlineMinutes',
      type: 'number',
      computedData: RealTime.create({
        nextRecomputeTime: (now: number, dataDeps: any) => 60000, // 每分钟更新
        dataDeps: {
          _current: {
            type: 'property',
            attributeQuery: ['lastLoginAt']
          }
        },
        callback: async (now: Expression, dataDeps: any) => {
          const lastLogin = dataDeps._current?.lastLoginAt || now.evaluate({now: Date.now()});
          
          // 计算在线时长（分钟）
          return now.subtract(lastLogin).divide(60000);
        }
      })
    })
  ]
});
```

#### 属性级状态管理

属性级实时计算的状态存储在每个记录上：

```typescript
// 查询用户数据时，状态字段会自动包含
const user = await system.storage.findOne('User', 
  BoolExp.atom({key: 'id', value: ['=', userId]}),
  undefined,
  ['*'] // 包含所有字段，包括状态字段
);

// user 对象将包含：
// {
//   id: 1,
//   username: 'john',
//   lastLoginAt: 1234567890000,
//   isRecentlyActive: true,
//   onlineMinutes: 45.2,
//   // 状态字段（自动生成的字段名）：
//   _record_boundState_User_isRecentlyActive_lastRecomputeTime: 1234567890123,
//   _record_boundState_User_isRecentlyActive_nextRecomputeTime: 1234567891000,
//   _record_boundState_User_onlineMinutes_lastRecomputeTime: 1234567890456,
//   _record_boundState_User_onlineMinutes_nextRecomputeTime: 1234567950456
// }
```

### RealTime 状态管理

#### 状态字段

每个 RealTime 计算都有两个状态字段：

- **lastRecomputeTime**: 上次计算的时间戳
- **nextRecomputeTime**: 下次计算的时间戳

```typescript
// 状态字段命名规则
// 全局计算：_global_boundState_{计算名称}_{状态名称}
// 属性计算：_record_boundState_{实体名称}_{属性名称}_{状态名称}

// 示例状态字段名：
// _global_boundState_currentTimestamp_lastRecomputeTime
// _global_boundState_currentTimestamp_nextRecomputeTime
// _record_boundState_User_isRecentlyActive_lastRecomputeTime
// _record_boundState_User_isRecentlyActive_nextRecomputeTime
```

#### 状态计算逻辑

状态的计算方式取决于返回值类型：

```typescript
// Expression 类型：nextRecomputeTime = lastRecomputeTime + nextRecomputeTime函数返回值
RealTime.create({
  nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1秒后重新计算
  callback: async (now: Expression, dataDeps: any) => {
    return now.divide(1000); // 返回 Expression
  }
  // nextRecomputeTime 将是 lastRecomputeTime + 1000
});

// Inequality/Equation 类型：nextRecomputeTime = solve() 的结果
RealTime.create({
  callback: async (now: Expression, dataDeps: any) => {
    const deadline = 1640995200000; // 2022-01-01 00:00:00
    return now.gt(deadline); // 返回 Inequality
  }
  // nextRecomputeTime 将是 1640995200000（临界时间点）
});
```

#### 访问状态信息

```typescript
// 在测试或调试中访问状态信息
const system = new MonoSystem();
const controller = new Controller(system, entities, [], [], [], dictionary, []);
await controller.setup(true);

// 获取计算实例
const realTimeComputation = Array.from(controller.scheduler.computations.values()).find(
  computation => computation.dataContext.type === 'global' && 
               computation.dataContext.id === 'currentTimestamp'
);

// 获取状态键名
const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
  realTimeComputation.dataContext, 
  'lastRecomputeTime', 
  realTimeComputation.state.lastRecomputeTime
);

const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
  realTimeComputation.dataContext, 
  'nextRecomputeTime', 
  realTimeComputation.state.nextRecomputeTime
);

// 读取状态值
const lastRecomputeTime = await system.storage.get(DICTIONARY_RECORD, lastRecomputeTimeKey);
const nextRecomputeTime = await system.storage.get(DICTIONARY_RECORD, nextRecomputeTimeKey);

console.log('上次计算时间:', new Date(lastRecomputeTime));
console.log('下次计算时间:', new Date(nextRecomputeTime));
```

### RealTime 实际应用场景

#### 业务时间检查

```typescript
// 工作时间检查
const isWorkingHours = Dictionary.create({
  name: 'isWorkingHours',
  type: 'boolean',
  computedData: RealTime.create({
    dataDeps: {
      schedule: {
        type: 'records',
        source: scheduleEntity,
        attributeQuery: ['startTime', 'endTime', 'timezone']
      }
    },
    callback: async (now: Expression, dataDeps: any) => {
      const schedule = dataDeps.schedule?.[0] || {};
      const startTime = schedule.startTime || 9;  // 9 AM
      const endTime = schedule.endTime || 17;     // 5 PM
      
      // 计算当前小时（考虑时区）
      const currentHour = now.divide(3600000).modulo(24);
      
      return currentHour.gt(startTime).and(currentHour.lt(endTime));
    }
  })
});
```

#### 用户会话管理

```typescript
// 用户会话过期检查
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'lastActivityAt', type: 'number'}),
    
    Property.create({
      name: 'sessionExpired',
      type: 'boolean',
      computedData: RealTime.create({
        dataDeps: {
          _current: {
            type: 'property',
            attributeQuery: ['lastActivityAt']
          },
          settings: {
            type: 'records',
            source: settingsEntity,
            attributeQuery: ['sessionTimeout']
          }
        },
        callback: async (now: Expression, dataDeps: any) => {
          const lastActivity = dataDeps._current?.lastActivityAt || 0;
          const timeout = dataDeps.settings?.[0]?.sessionTimeout || 3600000; // 1小时
          const expireTime = lastActivity + timeout;
          
          return now.gt(expireTime);
        }
      })
    })
  ]
});
```

### RealTime 性能优化与最佳实践

#### 合理设置重新计算间隔

```typescript
// ✅ 根据业务需求设置合适的间隔
const highFrequency = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 1000,    // 高频：每秒
  callback: async (now, dataDeps) => {
    // 用于需要实时更新的关键指标
    return now.divide(1000);
  }
});

const mediumFrequency = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 60000,   // 中频：每分钟
  callback: async (now, dataDeps) => {
    // 用于一般业务状态检查
    return now.modulo(3600000).eq(0);
  }
});

const lowFrequency = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 3600000, // 低频：每小时
  callback: async (now, dataDeps) => {
    // 用于报表统计等非关键数据
    return now.divide(86400000);
  }
});

// ❌ 避免过于频繁的更新
const tooFrequent = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 100,     // 每100ms更新一次，可能影响性能
  callback: async (now, dataDeps) => now.divide(1000)
});
```

#### 合理使用 Inequality/Equation 类型

```typescript
// ✅ 使用 Inequality 让系统自动计算最优重新计算时间
const smartScheduling = RealTime.create({
  // 不需要 nextRecomputeTime 函数
  callback: async (now, dataDeps) => {
    const deadline = 1640995200000;
    return now.gt(deadline); // 系统会在 deadline 时间点自动重新计算
  }
});

// ❌ 不必要的手动调度
const manualScheduling = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => {
    const deadline = 1640995200000;
    return deadline - now; // 手动计算间隔，不如让系统自动处理
  },
  callback: async (now, dataDeps) => {
    const deadline = 1640995200000;
    return now.evaluate({now: Date.now()}) > deadline;
  }
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

## 模块组织和前向引用的最佳实践

### 前向引用问题

在定义引用尚未定义的关系的计算属性时，可能会遇到前向引用问题：

```javascript
// ❌ 错误：使用函数形式来"解决"前向引用
const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'styleCount',
      type: 'number',
      computedData: Count.create({
        record: () => StyleVersionRelation  // ❌ 函数形式不是解决方案
      })
    })
  ]
});

// StyleVersionRelation 在后面定义或在文件底部导入
import { StyleVersionRelation } from '../relations/StyleVersionRelation'
```

### 正确的解决方案

#### 方案1：正确组织文件结构

组织文件结构以避免前向引用：

```javascript
// relations/StyleVersionRelation.ts
import { Relation } from 'interaqt'
import { Style } from '../entities/Style'
import { Version } from '../entities/Version'

export const StyleVersionRelation = Relation.create({
  source: Style,
  target: Version,
  type: 'n:n'
})

// entities/Version.ts
import { Entity, Property, Count } from 'interaqt'
import { StyleVersionRelation } from '../relations/StyleVersionRelation'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'styleCount',
      type: 'number',
      computedData: Count.create({
        record: StyleVersionRelation  // ✅ 直接引用，正确导入
      })
    })
  ]
})
```

#### 方案2：先定义基本结构，后添加计算属性

如果实体和关系之间存在循环依赖：

```javascript
// entities/Version.ts - 第1步：定义基本实体
export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'versionNumber', type: 'number' }),
    Property.create({ name: 'name', type: 'string' })
    // 暂时不添加依赖关系的计算属性
  ]
})

// relations/StyleVersionRelation.ts - 第2步：定义关系
import { Version } from '../entities/Version'
import { Style } from '../entities/Style'

export const StyleVersionRelation = Relation.create({
  source: Style,
  target: Version,
  type: 'n:n'
})

// setup/computedProperties.ts - 第3步：添加计算属性
import { Property, Count } from 'interaqt'
import { Version } from '../entities/Version'
import { StyleVersionRelation } from '../relations/StyleVersionRelation'

// 在所有实体和关系定义后添加计算属性
Version.properties.push(
  Property.create({
    name: 'styleCount',
    type: 'number',
    computedData: Count.create({
      record: StyleVersionRelation  // ✅ 现在可以安全引用关系
    })
  })
)
```

### 关键原则

1. **永远不要对 record 参数使用函数形式**：Count、Transform 等中的 `record` 参数应该始终是对实体或关系的直接引用，而不是函数。

2. **避免循环引用**：永远不要在实体自己的 Transform 计算中引用正在定义的实体。

3. **正确的导入顺序**：确保依赖项在使用之前已经导入。

4. **文件组织很重要**：组织模块结构以最小化前向引用：
   ```
   entities/
   ├── base/           # 不含计算属性的基本实体
   ├── index.ts        # 导出所有实体
   relations/
   ├── index.ts        # 导出所有关系
   computed/
   └── setup.ts        # 添加依赖关系的计算属性
   ```

5. **对同实体计算使用 getValue**：对于只依赖同一实体数据的计算属性，使用 `getValue` 而不是 Transform：
   ```javascript
   Property.create({
     name: 'displayName',
     type: 'string',
     getValue: (record) => `${record.firstName} ${record.lastName}`  // ✅ 简单的同实体计算
   })
   ```

### 常见错误

```javascript
// ❌ 不要：对 record 参数使用箭头函数
computedData: Count.create({
  record: () => SomeRelation  // 这不是处理前向引用的方法
})

// ❌ 不要：在 Transform 中引用正在定义的实体
const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'nextVersionNumber',
      computedData: Transform.create({
        record: Version  // 循环引用！
      })
    })
  ]
})

// ✅ 正确：使用正确的导入和直接引用
import { StyleVersionRelation } from '../relations/StyleVersionRelation'

computedData: Count.create({
  record: StyleVersionRelation  // 直接引用
})
``` 