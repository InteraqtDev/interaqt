# 核心概念与响应式机制概览

## ⚠️ 首先阅读：思维模式转换

**在学习 interaqt 之前，请先阅读 [00-mindset-shift.md](./00-mindset-shift.md)，这对理解框架至关重要。**

如果你仍然用传统的命令式思维（"如何操作数据"）来使用 interaqt，你将无法发挥其真正价值。interaqt 要求一个根本性的思维转换：从"操作数据"到"声明数据的本质"。

## 框架的核心理念

interaqt 是一个**声明式响应式**后端框架，其核心理念是：

> **停止思考"如何操作数据"，开始思考"数据本质上是什么"**

### 核心原则：只有 Interaction 产生数据，其他一切都是数据的"影子"

在 interaqt 中：
- **只有用户交互（Interaction）能产生新数据**
- **所有其他数据都是交互数据的计算结果**
- **绝对不要试图"操作"数据，只要"声明"数据是什么**

### 基本范式：data = computation(events)

#### ❌ 传统命令式思维（错误）
```javascript
// 错误：试图操作数据
async function likePost(userId, postId) {
  // 1. 创建点赞记录
  await createLike(userId, postId);
  // 2. 手动更新点赞数
  const likeCount = await countLikes(postId);
  await updatePost(postId, { likeCount });
  // 3. 通知相关用户
  await notifyPostAuthor(postId);
}
```

这种思维在问："当用户点赞时，我需要执行哪些操作？"

#### ✅ interaqt 声明式思维（正确）
```javascript
// 正确：声明数据是什么
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title' }),
    Property.create({
      name: 'likeCount',
      // 点赞数"就是"点赞关系的数量
      computedData: Count.create({
        record: LikeRelation
      })
    })
  ]
});

// 点赞交互只是声明用户可以点赞，不包含任何操作逻辑
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),  // 只是标识符！
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// 点赞关系的存在"是"对点赞交互的响应
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

这种思维在问："点赞数本质上是什么？点赞关系什么时候应该存在？"

当用户点赞时，系统会自动：
1. 创建点赞关系（因为 Transform 声明了应该存在）
2. 更新点赞数（因为 Count 声明了它是点赞关系的数量）
3. 触发任何依赖点赞数的其他计算

**你不需要写任何"更新"逻辑！**

## 核心概念

### Entity（实体）
数据的基本单位，如 User、Post、Comment 等。

### Property（属性）
实体的字段，可以是普通值或基于其他数据自动计算的值。

### Relation（关系）
实体之间的连接，如用户与帖子的点赞关系。

### Interaction（交互）
用户触发的事件，是系统中数据变化的**唯一来源**。交互只是声明"用户可以做什么"，不包含任何操作逻辑。

### Action（动作）
⚠️ **重要澄清**：Action 不是"操作"，而是给交互类型起的**标识符**，就像事件的名字。它不包含任何执行逻辑。

### Computation（计算）
基于其他数据自动计算的值，是响应式的核心。包括 Count、Transform、Every、Any、StateMachine 等。

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