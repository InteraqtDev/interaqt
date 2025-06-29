# interaqt 框架学习指南

⚠️ **重要：请按照以下顺序学习，跳过任何一步都可能导致误解**

## 📚 必读顺序

### 1. 🧠 [思维模式转换](./00-mindset-shift.md) **← 最重要！**
在学习任何其他内容之前，**必须**先理解从命令式到声明式的思维转换。这是理解 interaqt 的关键。

### 2. 🎯 [核心概念](./01-core-concepts.md)
了解框架的基本概念和响应式机制。

### 3. 🏗️ [定义实体和属性](./02-define-entities-properties.md)
学习如何定义数据结构。

### 4. 🔗 [实体关系](./03-entity-relations.md)
理解实体之间的关系。

### 5. ⚡ [响应式计算](./04-reactive-computations.md)
掌握声明式数据计算。

### 6. 🎮 [交互定义](./05-interactions.md)
学习如何定义用户交互（记住：Action 只是标识符！）。

### 7. 🔐 [权限控制](./06-attributive-permissions.md)
了解如何控制访问权限。

### 8. 📋 [活动流程](./07-activities.md)
设计复杂的业务流程。

### 9. 🎪 [其他高级功能](./08-filtered-entities.md)
过滤实体、异步计算等。

### 10. 📖 [API 参考](./13-api-reference.md)
详细的 API 文档。

## ⚠️ 常见误区

### 误区1：把 Action 当作操作函数
```javascript
// ❌ 错误：以为 Action 包含操作逻辑
const CreatePost = Action.create({
  name: 'createPost',
  handler: () => { /* 操作逻辑 */ }  // Action 没有 handler！
});

// ✅ 正确：Action 只是标识符
const CreatePost = Action.create({
  name: 'createPost'  // 仅此而已
});
```

### 误区2：试图在交互中操作数据
```javascript
// ❌ 错误：试图在某个地方写数据操作逻辑
const CreatePost = Interaction.create({
  name: 'CreatePost',
  onExecute: async (payload) => {  // Interaction 没有 onExecute！
    // 试图在这里写创建逻辑...
  }
});

// ✅ 正确：通过响应式计算声明数据存在
const UserPostRelation = Relation.create({
  computedData: Transform.create({
    record: InteractionEvent,
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        return { /* 帖子数据 */ };
      }
    }
  })
});
```

### 误区3：问错误的问题
```javascript
// ❌ 错误的问题：
// "当用户创建帖子时，我应该如何更新用户的帖子数量？"

// ✅ 正确的问题：
// "用户的帖子数量本质上是什么？"
// 答案：用户帖子关系的Count

Property.create({
  name: 'postCount',
  computedData: Count.create({
    record: UserPostRelation
  })
});
```

## 🔥 核心要点

1. **只有 Interaction 产生数据**：所有其他数据都是 Interaction 的计算结果
2. **Action 是标识符**：不包含任何操作逻辑
3. **声明数据的本质**：不要想"如何计算"，要想"数据是什么"
4. **单向数据流**：Interaction → Event → Transform/Count → Data
5. **绝不操作数据**：只声明数据的存在条件

## 🎯 学习目标

学完这些文档后，你应该能够：

- ✅ 理解声明式 vs 命令式的差异
- ✅ 正确使用 Interaction 和 Action
- ✅ 用响应式计算声明数据关系
- ✅ 避免在错误的地方写操作逻辑
- ✅ 建立正确的数据流向心智模型

记住：**停止思考"如何做"，开始思考"是什么"**！

## 📞 需要帮助？

如果你发现自己仍在思考"如何操作数据"，请重新阅读 [思维模式转换](./00-mindset-shift.md)。这个思维转换是使用 interaqt 的前提条件。