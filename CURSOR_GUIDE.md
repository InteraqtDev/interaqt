# Cursor IDE 项目指南 - interaqt 框架

## 项目概述

interaqt 是一个**声明式响应式后端框架**，其核心理念是通过声明数据的本质而非操作数据来构建应用。

### 核心理念
> **停止思考"如何操作数据"，开始思考"数据本质上是什么"**

### 技术栈
- **后端框架**：interaqt（响应式后端框架）
- **前端框架**：Axii（响应式前端框架）
- **开发语言**：TypeScript
- **编程范式**：声明式 + 响应式编程
- **数据库支持**：SQLite、PostgreSQL、MySQL、PGLite

## 快速理解

### 1. 思维模式转换（最重要）

#### ❌ 传统命令式思维
```typescript
// 错误：思考"如何操作数据"
async function likePost(userId, postId) {
  await createLike(userId, postId);
  const count = await countLikes(postId);
  await updatePost(postId, { likeCount: count });
}
```

#### ✅ interaqt 声明式思维
```typescript
// 正确：声明"数据是什么"
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      // 声明：点赞数"就是"点赞关系的数量
      computedData: Count.create({ record: LikeRelation })
    })
  ]
});
```

### 2. 核心概念关系图

```
用户执行 Interaction（如点赞）
    ↓
系统自动创建/修改 Relation（Like 关系）
    ↓
触发相关 Computation（如 Count）
    ↓
自动更新 Property（likeCount 自动 +1）
    ↓
数据持久化到数据库
```

## 项目结构

```
interaqt-old/
├── src/                        # 框架源代码
│   ├── runtime/               # 响应式引擎
│   ├── storage/               # ORM 和数据持久化
│   └── shared/                # 核心概念定义
├── examples/                   # 示例项目
│   ├── dormitory-management/  # 宿舍管理系统示例
│   └── social-content-network/# 社交内容网络示例
├── tests/                     # 测试用例
├── agentspace/               # 知识库和文档
│   └── knowledge/            # 框架使用指南
└── dashboard/                # 可视化工具
```

## 核心概念速查

### Entity（实体）
数据的基本单位，如 User、Post、Comment。

```typescript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});
```

### Relation（关系）
实体之间的连接，本质上也是特殊的 Entity。

```typescript
const Friendship = Relation.create({
  source: User,
  target: User,
  symmetric: true  // 对称关系
});
```

### Interaction（交互）
用户触发的事件，是系统中数据变化的**唯一来源**。

```typescript
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'content', type: 'string' })
    ]
  })
});
```

### Computation（计算）
基于其他数据自动计算的值，包括：
- **Count**：计算数量
- **WeightedSummation**：加权求和
- **Every/Any**：条件判断
- **Transform**：自定义转换
- **StateMachine**：状态机

### Activity（活动）
多个相关 Interaction 的有序组合，用于复杂业务流程。

## 开发规范

### 1. 文件组织
```
项目目录/
├── src/
│   ├── entities.ts         # 实体定义
│   ├── relations.ts        # 关系定义
│   ├── interactions.ts     # 交互定义
│   ├── activities.ts       # 活动定义
│   └── index.ts           # 导出入口
├── tests/                  # 测试文件
└── frontend/              # 前端代码（使用 Axii）
```

### 2. 命名规范
- **Entity**：PascalCase，单数形式（如 `User`, `Post`）
- **Relation**：描述性名称（如 `UserFollowUser`, `UserLikePost`）
- **Interaction**：动词+名词（如 `CreatePost`, `LikePost`）
- **Property**：camelCase（如 `userName`, `postCount`）

### 3. 测试要求
- 所有 Interaction 必须有测试
- 所有带 computedData 的属性必须有测试
- 使用 vitest 编写测试

## 常见模式

### 1. 统计模式（Count）
```typescript
Property.create({
  name: 'followerCount',
  computedData: Count.create({
    record: Relation.create({ source: '*', target: User })
  })
})
```

### 2. 状态机模式
```typescript
Property.create({
  name: 'status',
  computedData: StateMachine.create({
    states: ['pending', 'approved', 'rejected'],
    default: 'pending',
    transitions: [
      { from: 'pending', to: 'approved', on: 'ApproveRequest' },
      { from: 'pending', to: 'rejected', on: 'RejectRequest' }
    ]
  })
})
```

### 3. 权限控制模式
```typescript
const DeletePost = Interaction.create({
  name: 'DeletePost',
  attributives: { // 只有作者可以删除
    target: (user, { payload }) => 
      user.id === payload.post.author.id
  }
});
```

## 调试技巧

### 1. 查看响应式计算流程
```typescript
// 在 Controller 中启用日志
const controller = new Controller(system, entities, relations, activities, interactions);
controller.system.logger.level = 'debug';
```

### 2. 检查数据变更事件
```typescript
system.storage.listen((events) => {
  console.log('Mutation events:', events);
});
```

### 3. 验证计算结果
```typescript
// 在测试中验证计算属性
const user = await system.storage.findOne('User', { id: userId });
expect(user.followerCount).toBe(expectedCount);
```

## 注意事项

### 1. 避免命令式思维
- ❌ 不要思考"更新数据的步骤"
- ✅ 思考"数据的本质定义"

### 2. 正确使用 Interaction
- Interaction 只是声明用户可以做什么
- 不要在 Interaction 中写业务逻辑
- 使用 Computation 来响应 Interaction

### 3. 性能优化
- 使用 FilteredEntity 优化查询
- 合理使用异步计算
- 避免循环依赖的计算

### 4. 数据库兼容性
- PGLite 不支持 `GENERATED ALWAYS AS IDENTITY`
- PGLite 要求字符串默认值使用单引号
- 避免在 defaultValue 中使用动态函数

## 学习资源

### 必读文档
1. `agentspace/knowledge/usage/00-mindset-shift.md` - 思维模式转换
2. `agentspace/knowledge/usage/01-core-concepts.md` - 核心概念
3. `agentspace/knowledge/llm_generator_guide.md` - 代码生成指南

### 示例项目
1. `examples/dormitory-management/` - 宿舍管理系统
2. `examples/social-content-network/` - 社交内容网络

### 测试用例
1. `tests/runtime/` - 运行时测试
2. `tests/storage/` - 存储层测试

## 快速命令

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 在示例项目中安装
cd examples/dormitory-management
npm run install

# 启动示例项目
npm start

# 创建前端项目（在示例目录下）
npx create-axii-app frontend
```

## 开发流程

1. **理解需求**：分析业务需求，识别实体、关系和交互
2. **定义数据模型**：创建 Entity 和 Relation
3. **声明计算逻辑**：使用 Computation 定义派生数据
4. **定义交互**：创建 Interaction 和 Activity
5. **编写测试**：为所有功能编写测试用例
6. **创建前端**：使用 Axii 构建响应式界面

## 常见问题

### Q: 如何更新数据？
A: 不要思考"更新"，而是声明数据"是什么"。系统会自动处理更新。

### Q: 如何处理复杂业务逻辑？
A: 使用 Activity 组合多个 Interaction，使用 StateMachine 管理状态。

### Q: 如何优化性能？
A: 使用 FilteredEntity、合理设计 Computation、避免不必要的计算。

### Q: 如何调试响应式计算？
A: 启用日志、监听变更事件、编写详细的测试用例。

---

**记住核心原则**：在 interaqt 中，你只需要声明数据的本质，框架会自动处理所有的数据流转和更新。停止思考"如何操作"，开始思考"是什么"。 