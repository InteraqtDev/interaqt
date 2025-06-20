# 社交+内容网络示例

本示例展示了如何使用 @interaqt/runtime 构建一个社交内容网络，包含好友关系、内容发布、草稿管理、点赞功能等核心特性。

## 功能特性

### 1. 用户管理
- 用户基本信息管理
- 用户个人资料
- 用户统计信息（粉丝数、关注数、发布内容数等）

### 2. 好友关系系统
- 发送好友请求
- 接受/拒绝好友请求
- 查看好友列表
- 取消好友关系
- 关注/取消关注功能

### 3. 内容发布系统
- 创建内容草稿
- 发布内容（从草稿到公开）
- 编辑已发布内容
- 删除内容
- 内容状态管理（草稿、已发布、已删除）
- 内容统计（阅读量、点赞数、评论数）

### 4. 点赞系统
- 对内容点赞/取消点赞
- 实时更新点赞计数
- 查看点赞用户列表
- 防止重复点赞

### 5. 评论系统
- 发表评论
- 回复评论（嵌套评论）
- 删除评论
- 评论点赞
- 评论计数

### 6. 动态时间线
- 个人动态（自己发布的内容）
- 好友动态（好友发布的内容）
- 推荐内容

## 技术实现亮点

### 响应式计算
- **好友计数**：使用 Count 计算好友数量，自动响应好友关系的增删
- **内容统计**：使用 Count 计算点赞数、评论数，实时更新
- **用户活跃度**：使用 WeightedSummation 计算用户活跃度分数
- **内容推荐**：使用 Transform 生成个性化推荐列表

### 权限控制
- **内容编辑权限**：只有作者可以编辑自己的内容
- **好友请求权限**：不能向已经是好友的用户发送请求
- **评论权限**：只有好友可以评论内容（可配置）

### 状态管理
- **内容状态机**：草稿 → 已发布 → 已删除
- **好友请求状态机**：待处理 → 已接受/已拒绝

### 过滤实体
- **公开内容**：过滤出已发布且未删除的内容
- **好友内容**：过滤出好友发布的内容
- **热门内容**：过滤出点赞数和评论数较高的内容

## 目录结构

```
social-content-network/
├── README.md                 # 本文档
├── requirements.md           # 详细需求说明
├── src/
│   ├── index.ts             # 主入口文件
│   ├── entities-base.ts     # 基础实体定义
│   ├── entities.ts          # 完整实体和关系定义
│   ├── interactions.ts      # 交互定义
│   └── relations.ts         # 关系定义
├── tests/
│   ├── setup.ts            # 测试环境设置
│   ├── entities.test.ts    # 实体测试
│   ├── interactions.test.ts # 交互测试
│   ├── computations.test.ts # 响应式计算测试
│   ├── integration.test.ts # 集成测试
│   └── minimal.test.ts     # 最小功能测试
└── docs/
    ├── usage.md            # 使用说明
    └── api.md              # API 文档
```

## 快速开始

```bash
# 安装依赖
npm install

# 运行测试
npm run test:social-network

# 运行示例
npm run example:social-network
```

## 示例用法

```typescript
import { createSocialNetwork } from './src/index.js';

const { controller, entities, relations } = await createSocialNetwork();

// 创建用户
const user1 = await controller.callInteraction('CreateUser', {
  payload: { username: 'alice', displayName: 'Alice Wang' }
});

const user2 = await controller.callInteraction('CreateUser', {
  payload: { username: 'bob', displayName: 'Bob Li' }
});

// 发送好友请求
await controller.callInteraction('SendFriendRequest', {
  user: user1.data,
  payload: { targetUserId: user2.data.id }
});

// 接受好友请求
await controller.callInteraction('AcceptFriendRequest', {
  user: user2.data,
  payload: { requesterId: user1.data.id }
});

// 创建内容
await controller.callInteraction('CreatePost', {
  user: user1.data,
  payload: { 
    title: 'Hello World', 
    content: 'This is my first post!',
    tags: ['hello', 'world']
  }
});

// 发布内容
await controller.callInteraction('PublishPost', {
  user: user1.data,
  payload: { postId: post.data.id }
});

// 点赞内容
await controller.callInteraction('LikePost', {
  user: user2.data,
  payload: { postId: post.data.id }
});
```

## 核心概念演示

本示例重点演示了以下 @interaqt/runtime 的核心概念：

1. **响应式计算**：自动维护统计数据，无需手动更新
2. **权限控制**：基于 Attributive 的细粒度权限管理
3. **状态机**：内容和请求的状态转换
4. **过滤实体**：动态数据视图
5. **复杂关系**：多对多、一对多关系的组合使用
6. **事件驱动**：基于交互的数据变更

## 学习建议

1. 先阅读 `requirements.md` 了解详细需求
2. 查看 `src/entities.ts` 了解实体和关系设计
3. 学习 `src/interactions.ts` 了解业务逻辑实现
4. 运行测试用例理解各功能的使用方法
5. 尝试修改和扩展功能