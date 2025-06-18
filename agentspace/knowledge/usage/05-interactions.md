# 如何定义和执行交互

交互（Interaction）是 @interaqt/runtime 中用户与系统交互的唯一方式，也是系统中所有数据变化的来源。通过定义交互，你可以描述用户可以执行的操作以及这些操作如何影响系统中的数据。

## 交互的基本概念

### 什么是交互

交互代表用户可以执行的一个操作，例如：
- 创建一篇博客文章
- 点赞一个帖子
- 提交一个订单
- 审批一个请求

每个交互都包含：
- **名称**：交互的标识符
- **动作（Action）**：具体的操作逻辑
- **载荷（Payload）**：交互需要的参数
- **权限控制**：谁可以执行这个交互

### 交互 vs 传统 API

```javascript
// 传统 API 方式
app.post('/api/posts', async (req, res) => {
  const { title, content, authorId } = req.body;
  
  // 手动数据验证
  if (!title || !content || !authorId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // 手动权限检查
  if (!await checkPermission(req.user, 'create_post')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // 手动数据操作
  const post = await db.posts.create({ title, content, authorId });
  
  // 手动更新相关数据
  await db.users.update(authorId, { 
    postCount: { $inc: 1 } 
  });
  
  res.json(post);
});

// @interaqt/runtime 交互方式
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({
    name: 'createPost',
    // 声明式数据操作
    operation: [
      {
        type: 'create',
        entity: 'Post',
        payload: {
          title: '$.title',
          content: '$.content',
          author: '$.authorId'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User' })
    ]
  })
  // 权限和计算更新都是自动的
});
```

## 创建基本交互

### 最简单的交互

```javascript
import { Interaction, Action, Payload, PayloadItem } from '@interaqt/runtime';

const SayHello = Interaction.create({
  name: 'SayHello',
  action: Action.create({
    name: 'sayHello',
    operation: []  // 无操作，只是一个示例
  })
});
```

### 创建实体的交互

```javascript
const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({
    name: 'createUser',
    operation: [
      {
        type: 'create',
        entity: 'User',
        payload: {
          name: '$.name',
          email: '$.email',
          status: 'active'  // 固定值
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'email', 
        type: 'string', 
        required: true 
      })
    ]
  })
});
```

### 更新实体的交互

```javascript
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({
    name: 'updateProfile',
    operation: [
      {
        type: 'update',
        entity: 'User',
        where: { id: '$.userId' },
        payload: {
          name: '$.name',
          bio: '$.bio',
          avatar: '$.avatar'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ name: 'name', type: 'string' }),
      PayloadItem.create({ name: 'bio', type: 'string' }),
      PayloadItem.create({ name: 'avatar', type: 'string' })
    ]
  })
});
```

## 定义交互参数（Payload）

### 基本参数类型

```javascript
const CreatePost = Interaction.create({
  name: 'CreatePost',
  payload: Payload.create({
    items: [
      // 字符串参数
      PayloadItem.create({ 
        name: 'title', 
        type: 'string', 
        required: true 
      }),
      
      // 数字参数
      PayloadItem.create({ 
        name: 'priority', 
        type: 'number', 
        defaultValue: 1 
      }),
      
      // 布尔参数
      PayloadItem.create({ 
        name: 'isDraft', 
        type: 'boolean', 
        defaultValue: false 
      }),
      
      // 对象参数
      PayloadItem.create({ 
        name: 'metadata', 
        type: 'object',
        required: false
      }),
      
      // 数组参数
      PayloadItem.create({ 
        name: 'tags', 
        type: 'string',
        collection: true,
        defaultValue: []
      })
    ]
  })
  // ... action 定义
});
```

### 引用其他实体（isRef）

```javascript
const CreateComment = Interaction.create({
  name: 'CreateComment',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'content', 
        type: 'string', 
        required: true 
      }),
      // 引用帖子实体
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true,
        refEntity: 'Post',
        required: true 
      }),
      // 引用用户实体
      PayloadItem.create({ 
        name: 'authorId', 
        type: 'string', 
        isRef: true,
        refEntity: 'User',
        required: true 
      })
    ]
  }),
  action: Action.create({
    name: 'createComment',
    operation: [
      {
        type: 'create',
        entity: 'Comment',
        payload: {
          content: '$.content',
          post: '$.postId',
          author: '$.authorId'
        }
      }
    ]
  })
});
```

### 参数验证

```javascript
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true,
        minLength: 3,
        maxLength: 100
      }),
      PayloadItem.create({ 
        name: 'price', 
        type: 'number', 
        required: true,
        min: 0,
        max: 999999
      }),
      PayloadItem.create({ 
        name: 'email', 
        type: 'string',
        pattern: '^[^@]+@[^@]+\.[^@]+$'  // 邮箱格式验证
      }),
      PayloadItem.create({ 
        name: 'category', 
        type: 'string',
        enum: ['electronics', 'clothing', 'books', 'home']
      })
    ]
  })
  // ... action 定义
});
```

### 条件参数

```javascript
const CreateOrder = Interaction.create({
  name: 'CreateOrder',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'items', 
        type: 'object',
        collection: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'shippingAddress', 
        type: 'object',
        // 当订单金额小于免邮门槛时必填
        required: (payload) => payload.totalAmount < 100
      }),
      PayloadItem.create({ 
        name: 'couponCode', 
        type: 'string',
        // 优惠券代码的验证逻辑
        validate: async (value) => {
          if (!value) return true;
          const coupon = await controller.findOne('Coupon', { code: value });
          return coupon && coupon.isValid && new Date(coupon.expiresAt) > new Date();
        }
      })
    ]
  })
  // ... action 定义
});
```

## 实现数据变更逻辑

### 创建实体

```javascript
const CreateBlogPost = Interaction.create({
  name: 'CreateBlogPost',
  action: Action.create({
    name: 'createBlogPost',
    operation: [
      {
        type: 'create',
        entity: 'Post',
        payload: {
          title: '$.title',
          content: '$.content',
          author: '$.authorId',
          status: 'draft',
          createdAt: () => new Date().toISOString(),
          slug: (payload) => payload.title.toLowerCase().replace(/\s+/g, '-')
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User' })
    ]
  })
});
```

### 更新实体

```javascript
const PublishPost = Interaction.create({
  name: 'PublishPost',
  action: Action.create({
    name: 'publishPost',
    operation: [
      {
        type: 'update',
        entity: 'Post',
        where: { id: '$.postId' },
        payload: {
          status: 'published',
          publishedAt: () => new Date().toISOString()
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      })
    ]
  })
});
```

### 删除实体

```javascript
const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({
    name: 'deletePost',
    operation: [
      // 先删除相关的评论
      {
        type: 'delete',
        entity: 'Comment',
        where: { post: '$.postId' }
      },
      // 再删除帖子本身
      {
        type: 'delete',
        entity: 'Post',
        where: { id: '$.postId' }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'Post',
        required: true 
      })
    ]
  })
});
```

### 建立关系

```javascript
const FollowUser = Interaction.create({
  name: 'FollowUser',
  action: Action.create({
    name: 'followUser',
    operation: [
      {
        type: 'createRelation',
        relation: 'Follow',
        source: '$.followerId',
        target: '$.followeeId',
        properties: {
          followedAt: () => new Date().toISOString()
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'followerId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      }),
      PayloadItem.create({ 
        name: 'followeeId', 
        type: 'string', 
        isRef: true, 
        refEntity: 'User',
        required: true 
      })
    ]
  })
});
```

### 复杂的多步操作

```javascript
const PlaceOrder = Interaction.create({
  name: 'PlaceOrder',
  action: Action.create({
    name: 'placeOrder',
    operation: [
      // 1. 创建订单
      {
        type: 'create',
        entity: 'Order',
        payload: {
          userId: '$.userId',
          status: 'pending',
          totalAmount: '$.totalAmount',
          shippingAddress: '$.shippingAddress'
        },
        resultKey: 'order'  // 保存结果以供后续操作使用
      },
      // 2. 创建订单项
      {
        type: 'createMultiple',
        entity: 'OrderItem',
        payload: (payload, results) => {
          return payload.items.map(item => ({
            orderId: results.order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price
          }));
        }
      },
      // 3. 更新库存
      {
        type: 'updateMultiple',
        entity: 'Product',
        operations: (payload) => {
          return payload.items.map(item => ({
            where: { id: item.productId },
            payload: {
              stock: { $inc: -item.quantity }
            }
          }));
        }
      },
      // 4. 清空购物车
      {
        type: 'delete',
        entity: 'CartItem',
        where: { userId: '$.userId' }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', type: 'string', isRef: true, refEntity: 'User' }),
      PayloadItem.create({ name: 'items', type: 'object', collection: true }),
      PayloadItem.create({ name: 'totalAmount', type: 'number' }),
      PayloadItem.create({ name: 'shippingAddress', type: 'object' })
    ]
  })
});
```

## 使用 Transform 来创建关系

Transform 计算不仅可以用于属性计算，还可以用于自动创建关系。

### 将交互映射为关系

```javascript
import { MapInteractionToRecord } from '@interaqt/runtime';

// 定义点赞交互
const LikePost = Interaction.create({
  name: 'LikePost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', type: 'string', isRef: true, refEntity: 'User' }),
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' })
    ]
  })
});

// 使用 MapInteractionToRecord 自动创建点赞关系
const LikeMapping = MapInteractionToRecord.create({
  interaction: LikePost,
  map: {
    source: '$.userId',
    target: '$.postId',
    entity: 'Like',
    properties: {
      likedAt: () => new Date().toISOString()
    }
  }
});
```

### 条件映射

```javascript
const VotePost = Interaction.create({
  name: 'VotePost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', type: 'string', isRef: true, refEntity: 'User' }),
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' }),
      PayloadItem.create({ name: 'voteType', type: 'string', enum: ['up', 'down'] })
    ]
  })
});

// 根据投票类型创建不同的关系
const VoteMapping = MapInteractionToRecord.create({
  interaction: VotePost,
  map: [
    {
      condition: (payload) => payload.voteType === 'up',
      source: '$.userId',
      target: '$.postId',
      entity: 'Upvote',
      properties: {
        votedAt: () => new Date().toISOString()
      }
    },
    {
      condition: (payload) => payload.voteType === 'down',
      source: '$.userId',
      target: '$.postId',
      entity: 'Downvote',
      properties: {
        votedAt: () => new Date().toISOString()
      }
    }
  ]
});
```

### 自动创建关联

```javascript
const CreatePostWithTags = Interaction.create({
  name: 'CreatePostWithTags',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User' }),
      PayloadItem.create({ name: 'tagNames', type: 'string', collection: true })
    ]
  })
});

// 自动创建帖子和标签的关系
const PostTagMapping = MapInteractionToRecord.create({
  interaction: CreatePostWithTags,
  map: async (payload, context) => {
    // 首先创建帖子
    const post = await context.create('Post', {
      title: payload.title,
      content: payload.content,
      author: payload.authorId
    });
    
    // 为每个标签创建关系
    const relations = [];
    for (const tagName of payload.tagNames) {
      // 查找或创建标签
      let tag = await context.findOne('Tag', { name: tagName });
      if (!tag) {
        tag = await context.create('Tag', { name: tagName });
      }
      
      // 创建帖子-标签关系
      relations.push({
        source: post.id,
        target: tag.id,
        entity: 'PostTag'
      });
    }
    
    return relations;
  }
});
```

## 使用 StateMachine

StateMachine 不仅可以用于属性计算，还可以用于将交互映射为属性值的变化。

### 将交互映射为属性值

```javascript
import { MapInteractionToProperty } from '@interaqt/runtime';

// 定义订单状态相关的交互
const PayOrder = Interaction.create({
  name: 'PayOrder',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', isRef: true, refEntity: 'Order' }),
      PayloadItem.create({ name: 'paymentMethod', type: 'string' }),
      PayloadItem.create({ name: 'amount', type: 'number' })
    ]
  })
});

const ShipOrder = Interaction.create({
  name: 'ShipOrder',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', isRef: true, refEntity: 'Order' }),
      PayloadItem.create({ name: 'trackingNumber', type: 'string' })
    ]
  })
});

// 使用 MapInteractionToProperty 更新订单状态
const OrderStatusMapping = MapInteractionToProperty.create([
  {
    interaction: PayOrder,
    map: {
      entity: 'Order',
      where: { id: '$.orderId' },
      property: 'status',
      value: 'paid'
    }
  },
  {
    interaction: ShipOrder,
    map: {
      entity: 'Order',
      where: { id: '$.orderId' },
      property: 'status',
      value: 'shipped'
    }
  }
]);
```

### 状态更新

```javascript
const ApproveLeaveRequest = Interaction.create({
  name: 'ApproveLeaveRequest',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', type: 'string', isRef: true, refEntity: 'LeaveRequest' }),
      PayloadItem.create({ name: 'approverId', type: 'string', isRef: true, refEntity: 'User' }),
      PayloadItem.create({ name: 'comments', type: 'string' })
    ]
  })
});

const LeaveRequestStatusMapping = MapInteractionToProperty.create({
  interaction: ApproveLeaveRequest,
  map: [
    {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'status',
      value: 'approved'
    },
    {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'approvedBy',
      value: '$.approverId'
    },
    {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'approvedAt',
      value: () => new Date().toISOString()
    },
    {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'approvalComments',
      value: '$.comments'
    }
  ]
});
```

### 多交互映射

```javascript
// 定义多个相关交互
const SubmitLeaveRequest = Interaction.create({
  name: 'SubmitLeaveRequest',
  // ... payload 定义
});

const RejectLeaveRequest = Interaction.create({
  name: 'RejectLeaveRequest',
  // ... payload 定义
});

const CancelLeaveRequest = Interaction.create({
  name: 'CancelLeaveRequest',
  // ... payload 定义
});

// 统一的状态映射
const LeaveRequestWorkflow = MapInteractionToProperty.create([
  {
    interaction: SubmitLeaveRequest,
    map: {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'status',
      value: 'submitted'
    }
  },
  {
    interaction: ApproveLeaveRequest,
    map: {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'status',
      value: 'approved'
    }
  },
  {
    interaction: RejectLeaveRequest,
    map: {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'status',
      value: 'rejected'
    }
  },
  {
    interaction: CancelLeaveRequest,
    map: {
      entity: 'LeaveRequest',
      where: { id: '$.requestId' },
      property: 'status',
      value: 'cancelled'
    }
  }
]);
```

## 执行交互

### 基本执行

```javascript
// 在控制器中执行交互
const result = await controller.executeInteraction('CreatePost', {
  title: 'My First Post',
  content: 'This is the content of my first post.',
  authorId: 'user123'
});

console.log('Created post:', result);
```

### 带上下文执行

```javascript
// 传递用户上下文
const result = await controller.executeInteraction('CreatePost', {
  title: 'My First Post',
  content: 'This is the content of my first post.',
  authorId: 'user123'
}, {
  user: { id: 'user123', role: 'author' },
  timestamp: new Date().toISOString()
});
```

### 批量执行

```javascript
// 批量执行多个交互
const results = await controller.executeInteractions([
  {
    name: 'CreatePost',
    payload: { title: 'Post 1', content: 'Content 1', authorId: 'user123' }
  },
  {
    name: 'CreatePost',
    payload: { title: 'Post 2', content: 'Content 2', authorId: 'user123' }
  }
]);
```

### 事务执行

```javascript
// 在事务中执行交互
await controller.transaction(async (trx) => {
  const post = await trx.executeInteraction('CreatePost', {
    title: 'My Post',
    content: 'Content',
    authorId: 'user123'
  });
  
  await trx.executeInteraction('AddTagToPost', {
    postId: post.id,
    tagName: 'javascript'
  });
  
  await trx.executeInteraction('NotifyFollowers', {
    userId: 'user123',
    postId: post.id
  });
});
```

## 错误处理

### 参数验证错误

```javascript
try {
  await controller.executeInteraction('CreatePost', {
    title: '',  // 空标题
    // content 缺失
    authorId: 'invalid-user-id'
  });
} catch (error) {
  if (error.type === 'ValidationError') {
    console.log('Validation errors:', error.details);
    // {
    //   title: 'Title is required',
    //   content: 'Content is required',
    //   authorId: 'Referenced user does not exist'
    // }
  }
}
```

### 权限错误

```javascript
try {
  await controller.executeInteraction('DeletePost', {
    postId: 'post123'
  }, {
    user: { id: 'user456', role: 'user' }  // 非作者尝试删除
  });
} catch (error) {
  if (error.type === 'PermissionError') {
    console.log('Permission denied:', error.message);
  }
}
```

### 业务逻辑错误

```javascript
try {
  await controller.executeInteraction('PlaceOrder', {
    userId: 'user123',
    items: [
      { productId: 'product1', quantity: 100 }  // 库存不足
    ]
  });
} catch (error) {
  if (error.type === 'BusinessLogicError') {
    console.log('Business logic error:', error.message);
    console.log('Error details:', error.details);
  }
}
```

## 交互的最佳实践

### 1. 合理设计交互粒度

```javascript
// ✅ 好的设计：原子性操作
const LikePost = Interaction.create({
  name: 'LikePost',
  // 单一职责：只处理点赞
});

const UnlikePost = Interaction.create({
  name: 'UnlikePost',
  // 单一职责：只处理取消点赞
});

// ❌ 避免的设计：过于复杂的交互
const ManagePostLike = Interaction.create({
  name: 'ManagePostLike',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'action', type: 'string', enum: ['like', 'unlike', 'toggle'] })
      // 一个交互处理多种操作，增加复杂性
    ]
  })
});
```

### 2. 使用有意义的命名

```javascript
// ✅ 清晰的命名
const SubmitLeaveRequest = Interaction.create({ name: 'SubmitLeaveRequest' });
const ApproveLeaveRequest = Interaction.create({ name: 'ApproveLeaveRequest' });
const PublishBlogPost = Interaction.create({ name: 'PublishBlogPost' });

// ❌ 模糊的命名
const DoAction = Interaction.create({ name: 'DoAction' });
const ProcessData = Interaction.create({ name: 'ProcessData' });
const HandleRequest = Interaction.create({ name: 'HandleRequest' });
```

### 3. 合理使用参数验证

```javascript
// ✅ 适当的验证
const CreateProduct = Interaction.create({
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true,
        minLength: 1,
        maxLength: 200
      }),
      PayloadItem.create({ 
        name: 'price', 
        type: 'number', 
        required: true,
        min: 0
      })
    ]
  })
});

// ❌ 过度验证
const CreateProduct = Interaction.create({
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name',
        type: 'string',
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: '^[A-Za-z0-9\\s\\-]+$',
        validate: async (value) => {
          // 过于复杂的自定义验证
          const exists = await checkNameExists(value);
          const isValid = await validateWithExternalAPI(value);
          return !exists && isValid;
        }
      })
    ]
  })
});
```

### 4. 考虑性能影响

```javascript
// ✅ 高效的操作
const BatchCreatePosts = Interaction.create({
  action: Action.create({
    operation: [
      {
        type: 'createMultiple',  // 批量创建
        entity: 'Post',
        payload: '$.posts'
      }
    ]
  })
});

// ❌ 低效的操作
const CreateManyPosts = Interaction.create({
  action: Action.create({
    operation: (payload) => {
      // 为每个帖子创建单独的操作
      return payload.posts.map(post => ({
        type: 'create',
        entity: 'Post',
        payload: post
      }));
    }
  })
});
```

交互是 @interaqt/runtime 中连接用户操作和数据变化的桥梁。通过合理设计交互，可以创建出既易于理解又高效执行的业务逻辑系统。 