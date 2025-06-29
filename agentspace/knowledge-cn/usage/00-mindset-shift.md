# 思维模式转换：从命令式到声明式

## ⚠️ 重要：在学习 interaqt 之前，请先理解这个核心概念

interaqt 框架要求一个根本性的**思维模式转换**。如果你仍然用传统的命令式思维来使用本框架，你将无法发挥其真正的价值。

## 核心原则：只有 Interaction 创造数据，其他一切都是数据的"影子"

### 传统思维 vs interaqt 思维

#### ❌ 传统命令式思维（错误）
```javascript
// 错误的思维：我要"做"什么
function createPost(title, content, authorId) {
  // 1. 创建帖子
  const post = db.posts.create({ title, content, authorId });
  // 2. 更新用户的帖子数量
  db.users.update(authorId, { postCount: postCount + 1 });
  // 3. 如果是热门标签，更新热门度
  if (isHotTag(post.tags)) {
    db.tags.update(post.tags, { hotness: hotness + 1 });
  }
  // 4. 通知关注者
  notifyFollowers(authorId, post);
}
```

这种思维在想："当用户创建帖子时，我需要执行一系列操作"

#### ✅ interaqt 声明式思维（正确）
```javascript
// 正确的思维：我要"声明"数据是什么

// 1. 用户帖子数量"是"用户创建的帖子的Count
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

// 2. 标签热门度"是"包含该标签的帖子的Count
const Tag = Entity.create({
  properties: [
    Property.create({
      name: 'hotness',
      computedData: Count.create({
        record: PostTagRelation
      })
    })
  ]
});

// 3. 关注者通知"是"关注关系的Transform
const Notification = Entity.create({
  computedData: Transform.create({
    record: InteractionEvent,  // 监听所有交互事件
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        // 这里返回应该创建的通知数据
        return generateNotifications(event);
      }
    }
  })
});

// 4. 交互只是"声明"用户可以做什么，不包含任何操作逻辑
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }), // 只是标识符！
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true })
    ]
  })
});
```

这种思维在想："帖子数量就是帖子的计数，标签热门度就是包含该标签的帖子数量"

## 关键概念澄清

### Action 不是"动作"，是"标识符"

**❌ 错误理解：**
```javascript
// 大模型经常会这样想：Action 包含操作逻辑
const Action = Action.create({
  name: 'createPost',
  execute: async (payload) => {  // ❌ 根本没有 execute 方法！
    // 这里写操作逻辑...
  }
});
```

**✅ 正确理解：**
```javascript
// Action 只是一个标识符，就像给这个交互起个名字
const Action = Action.create({
  name: 'createPost'  // 仅此而已！没有任何逻辑！
});
```

Action 就像是给一个事件类型起的名字，比如 "UserClicked"、"OrderSubmitted"。它不包含任何执行逻辑。

### 数据的"存在"vs"操作"

#### ❌ 命令式思维：我要操作数据
```javascript
// 错误：试图在某个地方"更新"数据
function likePost(userId, postId) {
  // 1. 创建点赞记录
  createLike(userId, postId);
  // 2. 更新帖子点赞数  ❌ 不要这样做！
  const likeCount = countLikes(postId);
  updatePost(postId, { likeCount });
}
```

#### ✅ 声明式思维：数据"就是"某种计算结果
```javascript
// 正确：声明点赞数就是点赞关系的计数
const Post = Entity.create({
  properties: [
    Property.create({
      name: 'likeCount',
      computedData: Count.create({
        record: LikeRelation  // 点赞数"就是"点赞关系的数量
      })
    })
  ]
});

// 点赞交互只是声明用户可以执行的动作
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// 点赞关系的存在本身就是响应点赞交互
const LikeRelation = Relation.create({
  source: User,
  target: Post,
  computedData: Transform.create({
    record: InteractionEvent,
    callback: (event) => {
      if (event.interactionName === 'LikePost') {
        return {
          source: event.user.id,
          target: event.payload.postId
        };
      }
    }
  })
});
```

## 数据流向的单向性

### interaqt 中的数据流向是严格单向的：

```
Interaction (用户交互)
    ↓
InteractionEvent (交互事件)
    ↓
Transform/Count/Every/Any (响应式计算)
    ↓
Entity/Relation 的数据
    ↓
更多的响应式计算
    ↓
最终的业务数据
```

**永远不要试图反向操作！**

## 实际示例：电商订单系统

### ❌ 传统命令式思维
```javascript
function placeOrder(userId, items) {
  // 1. 创建订单
  const order = createOrder(userId, items);
  // 2. 扣减库存
  items.forEach(item => {
    reduceStock(item.productId, item.quantity);
  });
  // 3. 更新用户订单数
  incrementUserOrderCount(userId);
  // 4. 更新产品销量
  items.forEach(item => {
    incrementProductSales(item.productId, item.quantity);
  });
}
```

### ✅ interaqt 声明式思维
```javascript
// 1. 产品库存"是"初始库存减去所有订单中的数量
const Product = Entity.create({
  properties: [
    Property.create({ name: 'initialStock', type: 'number' }),
    Property.create({
      name: 'currentStock',
      computedData: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (orderItem) => ({
          weight: -1,  // 减库存
          value: orderItem.quantity
        })
      })
    }),
    Property.create({
      name: 'totalSales',
      computedData: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (orderItem) => ({
          weight: 1,
          value: orderItem.quantity
        })
      })
    })
  ]
});

// 2. 用户订单数"是"用户的订单Count
const User = Entity.create({
  properties: [
    Property.create({
      name: 'orderCount',
      computedData: Count.create({
        record: UserOrderRelation
      })
    })
  ]
});

// 3. 下单交互只是声明用户可以下单
const PlaceOrder = Interaction.create({
  name: 'PlaceOrder',
  action: Action.create({ name: 'placeOrder' }),  // 只是标识符！
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'items', isCollection: true }),
      PayloadItem.create({ name: 'address' })
    ]
  })
});

// 4. 订单的存在响应下单交互
const UserOrderRelation = Relation.create({
  source: User,
  target: Order,
  computedData: Transform.create({
    record: InteractionEvent,
    callback: (event) => {
      if (event.interactionName === 'PlaceOrder') {
        return {
          source: event.user.id,
          target: {
            items: event.payload.items,
            address: event.payload.address,
            status: 'pending'
          }
        };
      }
    }
  })
});
```

## 关键心智模型

### 1. Interaction 是数据的"种子"
- 只有 Interaction 能产生新数据
- 其他所有数据都是 Interaction 数据的"衍生品"

### 2. Action 是"事件类型标签"
- Action 就像事件的名字，不包含任何逻辑
- 它只是告诉系统"发生了什么类型的事件"

### 3. 数据"存在"而不是"被操作"
- 不要想"如何修改数据"
- 要想"这个数据本质上是什么"

### 4. 一切都是"函数"
- 用户帖子数 = Count(用户的帖子关系)
- 产品库存 = 初始库存 - Count(订单中的该产品数量)
- 通知 = Transform(交互事件)

## 练习：转换思维

当你想要实现一个功能时，问自己：

### ❌ 不要问：
- "当用户做X时，我需要更新哪些数据？"
- "我应该在哪里写更新逻辑？"
- "如何确保数据一致性？"

### ✅ 应该问：
- "这个数据本质上是什么的计算结果？"
- "这个数据依赖于哪些其他数据？"
- "用户的这个操作应该产生什么样的交互事件？"

一旦你建立了这种思维模式，interaqt 框架的威力就会显现：
- 数据永远一致
- 业务逻辑清晰可维护
- 自动处理复杂的依赖关系
- 天然支持实时更新

记住：**停止思考"如何做"，开始思考"是什么"**。