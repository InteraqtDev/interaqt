# 如何定义和执行交互

交互（Interaction）是 interaqt 中用户与系统交互的唯一方式，也是系统中所有数据变化的来源。通过定义交互，你可以描述用户可以执行的操作以及这些操作如何影响系统中的数据。

## 重要说明：关于用户身份

**interaqt 专注于业务逻辑的响应式处理，不包含用户认证相关功能。**

在使用本框架时，请注意：
- 系统假定用户身份已经通过其他方式（如 JWT、Session 等）完成认证
- 所有交互都从"已有用户身份"的状态开始
- 不需要定义用户注册、登录、注销等认证相关的交互
- 用户上下文（user context）应该由外部系统提供给框架

例如，在执行交互时，用户信息是作为参数传入的：
```javascript
// 用户身份由外部系统提供
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user123', name: 'John', role: 'author' },  // 已认证的用户
  payload: { /* ... */ }
});
```

## 交互的基本概念

### 什么是交互

交互代表用户可以执行的一个操作，例如：
- 创建一篇博客文章
- 点赞一个帖子
- 提交一个订单
- 审批一个请求

每个交互都包含：
- **名称**：交互的标识符
- **动作（Action）**：交互类型的标识符（⚠️ 注意：Action 只是标识符，不包含任何操作逻辑）
- **载荷（Payload）**：交互需要的参数
- **权限控制**：谁可以执行这个交互

## ⚠️ 重要概念澄清：Action 不是"操作"

很多开发者会误解 Action 的概念。**Action 只是给交互类型起的一个名字，就像事件的类型标签，它不包含任何操作逻辑。**

```javascript
// ❌ 错误理解：以为 Action 包含操作逻辑
const CreatePost = Action.create({
  name: 'createPost',
  execute: async (payload) => {  // ❌ Action 没有 execute 方法！
    // 试图在这里写操作逻辑...
  }
});

// ✅ 正确理解：Action 只是一个标识符
const CreatePost = Action.create({
  name: 'createPost'  // 仅此而已！就像给事件起个名字
});
```

**所有的数据变化逻辑都通过响应式计算（Transform、Count、Every、Any 等）来实现，而不是在 Action 中。**

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

// interaqt 交互方式
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({
    name: 'createPost'
    // Action 只包含名称，不包含操作逻辑
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
  // 数据变化通过 Relation 或 Property 的 computedData 来声明式定义
});
```

## 创建基本交互

### 最简单的交互

```javascript
import { Interaction, Action, Payload, PayloadItem } from 'interaqt';

const SayHello = Interaction.create({
  name: 'SayHello',
  action: Action.create({
    name: 'sayHello'
    // Action 只是标识，不包含具体操作
  })
});
```

### 创建实体的交互

在 interaqt 中，交互本身不直接操作数据。数据的创建、更新、删除都是通过响应式计算来实现的。

```javascript
// 1. 定义交互
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({
    name: 'createArticle'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'title', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'content', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'categoryId', 
        base: Category,
        isRef: true
      })
    ]
  })
});

// 2. 使用 Transform 监听交互事件并创建实体
import { Transform, InteractionEventEntity } from 'interaqt';

// 在定义 Article 实体的关系时，可以添加响应式的创建逻辑
const ArticleCreation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateArticle') {
      // 返回要创建的 Article 数据
      return {
        title: event.payload.title,
        content: event.payload.content,
        categoryId: event.payload.categoryId,
        status: 'draft',
        createdAt: new Date().toISOString()
      };
    }
    return null;
  }
});

// 将这个 Transform 附加到 Article 实体的某个属性或关系上
```

### 更新实体的交互

```javascript
// 1. 定义更新交互
// 注意：这是已登录用户更新自己资料的交互，用户身份通过 context 传入
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({
    name: 'updateProfile'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'bio' }),
      PayloadItem.create({ name: 'avatar' })
    ]
  })
});

// 2. 使用 Transform 或 StateMachine 来响应交互并更新数据
// 这通常会在 Property 的 computedData 中定义
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
        required: true 
      }),
      
      // 数字参数
      PayloadItem.create({ 
        name: 'priority'
      }),
      
      // 布尔参数
      PayloadItem.create({ 
        name: 'isDraft'
      }),
      
      // 对象参数
      PayloadItem.create({ 
        name: 'metadata',
        required: false
      }),
      
      // 数组参数
      PayloadItem.create({ 
        name: 'tags', 
        isCollection: true
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
        required: true 
      }),
      // 引用帖子实体
      PayloadItem.create({ 
        name: 'postId', 
        base: Post,
        isRef: true,
        required: true 
      }),
      // 引用用户实体
      PayloadItem.create({ 
        name: 'authorId', 
        base: User,
        isRef: true,
        required: true 
      })
    ]
  }),
  action: Action.create({
    name: 'createComment'
  })
});

// 评论的创建通过 Relation 的 computedData 来实现
const CommentRelation = Relation.create({
  source: Comment,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'comments',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateComment') {
        return {
          source: {
            content: event.payload.content,
            createdAt: new Date().toISOString()
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});
```

### 参数验证

框架的 PayloadItem 支持基本的 required 字段验证，但不支持复杂的验证规则如长度限制、正则表达式等。这些验证应该在业务逻辑中实现：

```javascript
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  action: Action.create({ name: 'createProduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true
        // 复杂验证逻辑应该在交互处理中实现
      }),
      PayloadItem.create({ 
        name: 'price', 
        , 
        required: true
        // 价格范围验证应该在业务逻辑中处理
      }),
      PayloadItem.create({ 
        name: 'email'
                // 邮箱格式验证应该在业务逻辑中处理
      }),
      PayloadItem.create({ 
        name: 'category'
                // 枚举验证应该在业务逻辑中处理
      })
    ]
  })
});
```

### 条件参数

框架本身不支持动态的 required 条件和复杂的验证函数。这些逻辑应该在交互处理中实现：

```javascript
const CreateOrder = Interaction.create({
  name: 'CreateOrder',
  action: Action.create({ name: 'createOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'items', 
        isCollection: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'shippingAddress', 
                // 条件必填逻辑应该在交互处理中检查
      }),
      PayloadItem.create({ 
        name: 'couponCode', 
                // 优惠券验证应该在业务逻辑中实现
      })
    ]
  })
});

// 验证逻辑应该在 Transform 或 Attributive 中实现
const orderValidation = Transform.create({
  record: InteractionEvent,
  callback: function(event) {
    if (event.interactionName === 'CreateOrder') {
      // 在这里实现复杂的验证逻辑
      const { payload } = event;
      if (payload.totalAmount < 100 && !payload.shippingAddress) {
        throw new Error('Shipping address is required for orders under $100');
      }
      // 优惠券验证等
    }
  }
});
```

## 实现数据变更逻辑

⚠️ **重要：在 interaqt 中，绝对不要试图在交互中"操作"数据！**

交互（Interaction）只是声明"用户可以做什么"，它不包含任何数据操作逻辑。所有的数据变化都是数据的**固有属性**，通过响应式计算自动维护。

### 思维转换：从"操作数据"到"声明数据的本质"

❌ **错误思维：试图在交互中操作数据**
```javascript
// 错误：以为要在某个地方写"创建帖子"的逻辑
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({
    name: 'createPost',
    // ❌ 错误：试图在这里写创建逻辑
    handler: async (payload) => {
      const post = await db.create('Post', payload);
      await updateUserPostCount(payload.authorId);
      return post;
    }
  })
});
```

✅ **正确思维：声明数据是什么**
```javascript
// 1. 交互只是声明用户可以创建帖子
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),  // 只是标识符
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true })
    ]
  })
});

// 2. 帖子的存在"是"对创建帖子交互的响应
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  computedData: Transform.create({
    record: InteractionEvent,  // 监听所有交互事件
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        // 返回应该存在的帖子数据
        return {
          source: event.user.id,
          target: {
            title: event.payload.title,
            content: event.payload.content,
            createdAt: new Date().toISOString()
          }
        };
      }
    }
  })
});

// 3. 用户帖子数"是"用户帖子关系的数量
const User = Entity.create({
  properties: [
    Property.create({
      name: 'postCount',
      computedData: Count.create({
        record: UserPostRelation
      })
    })
  ]
});
```

### 数据变化的正确方式

数据变化通过以下方式**声明**（不是操作）：

1. **Transform**：声明"当某个事件发生时，某个数据应该存在"
2. **Count/Every/Any**：声明"某个数据是其他数据的计算结果"
3. **StateMachine**：声明"状态根据事件如何转换"

### 创建实体 - 响应式方式

```javascript
// 1. 定义创建博客的交互
const CreateBlogPost = Interaction.create({
  name: 'CreateBlogPost',
  action: Action.create({
    name: 'createBlogPost'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
});

// 2. 通过 Relation 的 computedData 来创建博客文章
const UserPostRelation = Relation.create({
  source: Post,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'posts',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateBlogPost') {
        // 返回要创建的关系，同时会创建 Post 实体
        return {
          source: {
            title: event.payload.title,
            content: event.payload.content,
            status: 'draft',
            createdAt: new Date().toISOString(),
            slug: event.payload.title.toLowerCase().replace(/\s+/g, '-')
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});

// 3. User 的 postCount 属性会自动更新
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'postCount',
      ,
      computedData: Count.create({
        relation: UserPostRelation,
        relationDirection: 'target'
      })
    })
  ]
});
```

### 更新实体状态 - 使用 StateMachine

```javascript
// 1. 定义发布文章的交互
const PublishPost = Interaction.create({
  name: 'PublishPost',
  action: Action.create({
    name: 'publishPost'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        base: Post,
        required: true 
      })
    ]
  })
});

// 2. 使用 StateMachine 管理文章状态
import { StateMachine, StateNode } from 'interaqt';

const DraftState = StateNode.create({ name: 'draft' });
const PublishedState = StateNode.create({ name: 'published' });

const PostStateMachine = StateMachine.create({
  name: 'PostStatus',
  states: [DraftState, PublishedState],
  defaultState: DraftState,
  transitions: [
    {
      from: DraftState,
      to: PublishedState,
      on: PublishPost
    }
  ]
});

// 3. 在 Post 实体中使用状态机
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computedData: PostStateMachine
    }),
    Property.create({
      name: 'publishedAt',
      type: 'string',
      computed: function(post) {
        // 当状态变为 published 时，记录发布时间
        return post.status === 'published' ? new Date().toISOString() : null;
      }
    })
  ]
});
```

### 删除实体 - 通过条件计算

在响应式系统中，"删除"通常是通过标记或过滤来实现的：

```javascript
// 1. 定义删除交互
const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({
    name: 'deletePost'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'postId', 
        type: 'string', 
        isRef: true, 
        base: Post,
        required: true 
      })
    ]
  })
});

// 2. 使用 Transform 记录删除事件
const PostDeletionRelation = Relation.create({
  source: Post,
  sourceProperty: 'deletedBy',
  target: User,
  targetProperty: 'deletedPosts',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'DeletePost') {
        return {
          source: event.payload.postId,
          target: event.user.id,
          deletedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});

// 3. 在 Post 实体中添加删除标记
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      computedData: Any.create({
        record: PostDeletionRelation,
        relationDirection: 'source'
      })
    })
  ]
});

// 4. 创建过滤后的实体视图
const ActivePost = Post.filter(post => !post.isDeleted);
```

### 建立关系

```javascript
// 1. 定义关注用户的交互
const FollowUser = Interaction.create({
  name: 'FollowUser',
  action: Action.create({
    name: 'followUser'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'followerId', 
        type: 'string', 
        isRef: true, 
        base: User,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'followeeId', 
        type: 'string', 
        isRef: true, 
        base: User,
        required: true 
      })
    ]
  })
});

// 2. 使用 Transform 创建关注关系
const FollowRelation = Relation.create({
  source: User,
  sourceProperty: 'following',
  target: User,
  targetProperty: 'followers',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'followedAt',
          })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'FollowUser') {
        return {
          source: event.payload.followerId,
          target: event.payload.followeeId,
          followedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});

// 3. 用户的关注者数量会自动计算
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'followerCount',
      ,
      computedData: Count.create({
        relation: FollowRelation,
        relationDirection: 'target'
      })
    }),
    Property.create({
      name: 'followingCount',
      ,
      computedData: Count.create({
        relation: FollowRelation,
        relationDirection: 'source'
      })
    })
  ]
});
```

### 复杂的业务逻辑 - 订单处理示例

```javascript
// 1. 定义下单交互
const PlaceOrder = Interaction.create({
  name: 'PlaceOrder',
  action: Action.create({
    name: 'placeOrder'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'items', isCollection: true }),
      PayloadItem.create({ name: 'totalAmount' }),
      PayloadItem.create({ name: 'shippingAddress' })
    ]
  })
});

// 2. 创建订单关系
const UserOrderRelation = Relation.create({
  source: Order,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'orders',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'PlaceOrder') {
        return {
          source: {
            status: 'pending',
            totalAmount: event.payload.totalAmount,
            shippingAddress: event.payload.shippingAddress,
            items: event.payload.items,
            createdAt: new Date().toISOString()
          },
          target: event.payload.userId
        };
      }
      return null;
    }
  })
});

// 3. 库存自动扣减
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({
      name: 'stock',
      ,
      // 使用 WeightedSummation 计算剩余库存
      computedData: WeightedSummation.create({
        record: OrderItemRelation,
        relationDirection: 'target',
        callback: function(orderItem) {
          return {
            weight: -orderItem.quantity,  // 负数表示扣减
            value: 1
          };
        }
      })
    })
  ]
});
```

## 使用 Transform 来监听交互并创建数据

Transform 是 interaqt 中的核心概念，用于监听系统中的事件（如交互事件）并响应式地创建或更新数据。

### 监听交互事件创建关系

```javascript
// 1. 定义点赞交互
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// 2. 定义点赞关系，使用 Transform 监听交互事件
const LikeRelation = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likedBy',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'likedAt',
          })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'LikePost') {
        return {
          source: event.payload.userId,
          target: event.payload.postId,
          likedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});

// 3. Post 的点赞数会自动计算
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      ,
      computedData: Count.create({
        relation: LikeRelation,
        relationDirection: 'target'
      })
    })
  ]
});
```

### 条件创建关系

```javascript
// 1. 定义投票交互
const VotePost = Interaction.create({
  name: 'VotePost',
  action: Action.create({ name: 'votePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true }),
      PayloadItem.create({ name: 'voteType' })
    ]
  })
});

// 2. 根据投票类型创建不同的关系
const UpvoteRelation = Relation.create({
  source: User,
  sourceProperty: 'upvotedPosts',
  target: Post,
  targetProperty: 'upvotedBy',
  type: 'n:n',
  properties: [
    Property.create({ name: 'votedAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'VotePost' && event.payload.voteType === 'up') {
        return {
          source: event.payload.userId,
          target: event.payload.postId,
          votedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});

const DownvoteRelation = Relation.create({
  source: User,
  sourceProperty: 'downvotedPosts',
  target: Post,
  targetProperty: 'downvotedBy',
  type: 'n:n',
  properties: [
    Property.create({ name: 'votedAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'VotePost' && event.payload.voteType === 'down') {
        return {
          source: event.payload.userId,
          target: event.payload.postId,
          votedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});
```

### 创建多个关系的例子

```javascript
// 1. 定义创建帖子并添加标签的交互
const CreatePostWithTags = Interaction.create({
  name: 'CreatePostWithTags',
  action: Action.create({ name: 'createPostWithTags' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true }),
      PayloadItem.create({ name: 'tagIds', isCollection: true, isRef: true, base: Tag })
    ]
  })
});

// 2. 创建帖子关系
const UserPostRelation = Relation.create({
  source: Post,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'posts',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreatePostWithTags') {
        return {
          source: {
            title: event.payload.title,
            content: event.payload.content,
            createdAt: new Date().toISOString()
          },
          target: event.payload.authorId,
          _postId: event.id // 保存帖子ID供标签关系使用
        };
      }
      return null;
    }
  })
});

// 3. 创建帖子-标签关系
const PostTagRelation = Relation.create({
  source: Post,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'posts',
  type: 'n:n',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreatePostWithTags' && event.payload.tagIds) {
        // 为每个标签创建一个关系
        return event.payload.tagIds.map(tagId => ({
          source: event._postId, // 使用之前保存的帖子ID
          target: tagId,
          addedAt: new Date().toISOString()
        }));
      }
      return null;
    }
  })
});
```

## 使用 StateMachine 管理状态

StateMachine 用于管理实体的状态变化，可以根据交互事件自动转换状态。

### 基本状态机示例

```javascript
import { StateMachine, StateNode } from 'interaqt';

// 1. 定义状态相关的交互
const PayOrder = Interaction.create({
  name: 'PayOrder',
  action: Action.create({ name: 'payOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', isRef: true, base: Order }),
      PayloadItem.create({ name: 'paymentMethod', type: 'string' }),
      PayloadItem.create({ name: 'amount',  })
    ]
  })
});

const ShipOrder = Interaction.create({
  name: 'ShipOrder',
  action: Action.create({ name: 'shipOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', isRef: true, base: Order }),
      PayloadItem.create({ name: 'trackingNumber', type: 'string' })
    ]
  })
});

// 2. 定义状态节点
const PendingState = StateNode.create({ name: 'pending' });
const PaidState = StateNode.create({ name: 'paid' });
const ShippedState = StateNode.create({ name: 'shipped' });
const DeliveredState = StateNode.create({ name: 'delivered' });

// 3. 创建订单状态机
const OrderStateMachine = StateMachine.create({
  name: 'OrderStatus',
  states: [PendingState, PaidState, ShippedState, DeliveredState],
  defaultState: PendingState,
  transitions: [
    {
      from: PendingState,
      to: PaidState,
      on: PayOrder
    },
    {
      from: PaidState,
      to: ShippedState,
      on: ShipOrder
    }
  ]
});

// 4. 在订单实体中使用状态机
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computedData: OrderStateMachine
    }),
    // 根据状态计算其他属性
    Property.create({
      name: 'canCancel',
      type: 'boolean',
      computed: function(order) {
        return order.status === 'pending' || order.status === 'paid';
      }
    }),
    Property.create({
      name: 'paymentInfo',
      type: 'object',
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'PayOrder' && event.payload.orderId === this.id) {
            return {
              method: event.payload.paymentMethod,
              amount: event.payload.amount,
              paidAt: new Date().toISOString()
            };
          }
          return null;
        }
      })
    })
  ]
});
```

### 复杂的工作流状态机

```javascript
// 请假申请的状态机示例
const SubmitLeaveRequest = Interaction.create({
  name: 'SubmitLeaveRequest',
  action: Action.create({ name: 'submitLeaveRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'reason', type: 'string' }),
      PayloadItem.create({ name: 'startDate', type: 'string' }),
      PayloadItem.create({ name: 'endDate', type: 'string' })
    ]
  })
});

const ApproveLeaveRequest = Interaction.create({
  name: 'ApproveLeaveRequest',
  action: Action.create({ name: 'approveLeaveRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', type: 'string', isRef: true, base: LeaveRequest }),
      PayloadItem.create({ name: 'approverId', type: 'string', isRef: true, base: User }),
      PayloadItem.create({ name: 'comments', type: 'string' })
    ]
  })
});

const RejectLeaveRequest = Interaction.create({
  name: 'RejectLeaveRequest',
  action: Action.create({ name: 'rejectLeaveRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', type: 'string', isRef: true, base: LeaveRequest }),
      PayloadItem.create({ name: 'rejectedBy', type: 'string', isRef: true, base: User }),
      PayloadItem.create({ name: 'reason', type: 'string' })
    ]
  })
});

// 定义请假申请的状态
const DraftState = StateNode.create({ name: 'draft' });
const SubmittedState = StateNode.create({ name: 'submitted' });
const ApprovedState = StateNode.create({ name: 'approved' });
const RejectedState = StateNode.create({ name: 'rejected' });

const LeaveRequestStateMachine = StateMachine.create({
  name: 'LeaveRequestStatus',
  states: [DraftState, SubmittedState, ApprovedState, RejectedState],
  defaultState: DraftState,
  transitions: [
    {
      from: DraftState,
      to: SubmittedState,
      on: SubmitLeaveRequest
    },
    {
      from: SubmittedState,
      to: ApprovedState,
      on: ApproveLeaveRequest
    },
    {
      from: SubmittedState,
      to: RejectedState,
      on: RejectLeaveRequest
    }
  ]
});

// 在请假申请实体中使用
const LeaveRequest = Entity.create({
  name: 'LeaveRequest',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computedData: LeaveRequestStateMachine
    }),
    Property.create({
      name: 'approvalHistory',
      type: 'object',
      isCollection: true,
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if ((event.interactionName === 'ApproveLeaveRequest' || 
               event.interactionName === 'RejectLeaveRequest') &&
              event.payload.requestId === this.id) {
            return {
              action: event.interactionName,
              userId: event.payload.approverId || event.payload.rejectedBy,
              comments: event.payload.comments || event.payload.reason,
              timestamp: new Date().toISOString()
            };
          }
          return null;
        }
      })
    })
  ]
});
```

## 执行交互

### 基本执行

```javascript
// 使用 controller.callInteraction 执行交互
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user123', name: 'John' },  // 用户上下文
  payload: {
    title: 'My First Post',
    content: 'This is the content of my first post.',
    authorId: 'user123'
  }
});

console.log('Interaction result:', result);
```

### 查找交互并执行

```javascript
// 通过名称查找交互
const createPostInteraction = Interaction.instances.find(i => i.name === 'CreatePost');

if (createPostInteraction) {
  const result = await controller.callInteraction(createPostInteraction.name, {
    user: { id: 'user123' },
    payload: {
      title: 'Another Post',
      content: 'More content',
      authorId: 'user123'
    }
  });
}
```

### 在活动中执行交互

```javascript
// 作为活动的一部分执行交互
const result = await controller.callActivityInteraction(
  'OrderProcess',        // 活动名称
  'processPayment',      // 交互名称
  'activity-instance-id',// 活动实例ID
  {
    user: { id: 'user123' },
    payload: { /* ... */ }
  }
);
```

### 权限控制

```javascript
// 使用 Attributive 进行权限控制
const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({ name: 'deletePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'postId',
        type: 'string',
        isRef: true,
        base: Post,
        required: true,
        // 权限验证应该通过 userAttributives 实现
        // 详见 attributive-permissions.md 文档
      })
    ]
  })
});
```

## 错误处理

### 参数验证错误

```javascript
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user123' },
  payload: {
    title: '',  // 空标题会触发验证错误
    // content 缺失
    authorId: 'invalid-user-id'
  }
});

if (result.error) {
  console.log('Error type:', result.error.type);
  console.log('Error message:', result.error.message);
}
```

### 权限错误

```javascript
const result = await controller.callInteraction('DeletePost', {
  user: { id: 'user456' },  // 非作者
  payload: {
    postId: 'post123'
  }
});

if (result.error) {
  console.log('Permission denied:', result.error);
}
```

### 业务逻辑错误

在响应式系统中，业务逻辑错误通常通过计算属性和条件来预防：

```javascript
// 使用 Every 确保库存充足
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'isValid',
      type: 'boolean',
      computedData: Every.create({
        record: OrderItemRelation,
        relationDirection: 'source',
        callback: function(orderItem) {
          // 检查每个订单项的产品库存是否充足
          return orderItem.product.stock >= orderItem.quantity;
        }
      })
    })
  ]
});
```

## 交互的最佳实践

### 1. 合理设计交互粒度

```javascript
// ✅ 好的设计：原子性操作
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

const UnlikePost = Interaction.create({
  name: 'UnlikePost',
  action: Action.create({ name: 'unlikePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// ❌ 避免的设计：过于复杂的交互
const ManagePostLike = Interaction.create({
  name: 'ManagePostLike',
  action: Action.create({ name: 'managePostLike' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'action' }),
      // 一个交互处理多种操作，增加复杂性
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});
```

### 2. 使用有意义的命名

```javascript
// ✅ 清晰的命名
const SubmitLeaveRequest = Interaction.create({ 
  name: 'SubmitLeaveRequest',
  action: Action.create({ name: 'submitLeaveRequest' })
});
const ApproveLeaveRequest = Interaction.create({ 
  name: 'ApproveLeaveRequest',
  action: Action.create({ name: 'approveLeaveRequest' })
});
const PublishBlogPost = Interaction.create({ 
  name: 'PublishBlogPost',
  action: Action.create({ name: 'publishBlogPost' })
});

// ❌ 模糊的命名
const DoAction = Interaction.create({ 
  name: 'DoAction',
  action: Action.create({ name: 'doAction' })
});
const ProcessData = Interaction.create({ 
  name: 'ProcessData',
  action: Action.create({ name: 'processData' })
});
const HandleRequest = Interaction.create({ 
  name: 'HandleRequest',
  action: Action.create({ name: 'handleRequest' })
});
```

### 3. 合理使用参数验证

```javascript
// ✅ 适当的验证
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  action: Action.create({ name: 'createProduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true
      }),
      PayloadItem.create({ 
        name: 'price', 
        required: true
      }),
      PayloadItem.create({ 
        name: 'categoryId', 
        base: Category,
        isRef: true,
        required: true
      })
    ]
  })
});

// ❌ 过度验证（应该在其他层面处理）
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  action: Action.create({ name: 'createProduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name',
        type: 'string',
        required: true
        // 复杂验证如长度限制、正则表达式、异步验证等
        // 应该通过 Attributive 系统或业务逻辑层处理
      })
    ]
  })
});
```

### 4. 利用响应式特性

```javascript
// ✅ 充分利用响应式计算
// 定义简单的交互
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
});

// 数据变化通过响应式定义自动处理
const UserPostRelation = Relation.create({
  // ... 关系定义
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreatePost') {
        // 自动创建关系和实体
        return { /* ... */ };
      }
    }
  })
});

// User 的 postCount 自动更新
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'postCount',
      ,
      computedData: Count.create({
        relation: UserPostRelation,
        relationDirection: 'target'
      })
    })
  ]
});
```

### 5. 适当使用活动（Activity）

对于复杂的多步骤流程，使用 Activity 来组织相关的交互：

```javascript
// 订单处理活动
const OrderProcessActivity = Activity.create({
  name: 'OrderProcess',
  interactions: [
    CreateOrderInteraction,
    ValidateInventoryInteraction,
    ProcessPaymentInteraction,
    UpdateInventoryInteraction,
    SendConfirmationInteraction
  ],
  transfers: [
    // 定义交互之间的流转逻辑
  ]
});
```

交互是 interaqt 中连接用户操作和数据变化的桥梁。通过合理设计交互，结合框架的响应式特性，可以创建出既易于理解又高效执行的业务逻辑系统。记住：交互只定义"做什么"，而具体的"怎么做"通过响应式计算来实现。 