# 使用说明

## 快速开始

### 安装依赖

```bash
npm install
```

### 运行简单测试

```bash
node test-simple.js
```

### 运行完整测试套件

```bash
npm test
```

## 基本使用方法

### 1. 初始化系统

```javascript
import { startSystem, stopSystem } from './src/index.js';

const { system, controller } = await startSystem();
```

### 2. 创建用户

```javascript
const userResult = await controller.execute({
  interaction: 'CreateUser',
  payload: {
    username: 'alice',
    displayName: 'Alice Smith',
    email: 'alice@example.com',
    bio: 'Love connecting with friends!'
  }
});
const user = userResult.records?.User?.[0];
```

### 3. 建立好友关系

```javascript
// 发送好友请求
const requestResult = await controller.execute({
  interaction: 'SendFriendRequest',
  payload: {
    targetUserId: bob,
    message: 'Hi, let\'s be friends!'
  },
  user: alice
});

// 接受好友请求
await controller.execute({
  interaction: 'AcceptFriendRequest',
  payload: { requestId: requestResult.records?.FriendRequest?.[0] },
  user: bob
});
```

### 4. 发布内容

```javascript
// 创建内容草稿
const postResult = await controller.execute({
  interaction: 'CreatePost',
  payload: {
    title: 'My First Post',
    content: 'Hello everyone!',
    tags: ['introduction'],
    visibility: 'public'
  },
  user: alice
});

// 发布内容
await controller.execute({
  interaction: 'PublishPost',
  payload: { postId: postResult.records?.Post?.[0] },
  user: alice
});
```

### 5. 社交互动

```javascript
// 查看内容
await controller.execute({
  interaction: 'ViewPost',
  payload: { postId: post },
  user: bob
});

// 点赞内容
await controller.execute({
  interaction: 'LikePost',
  payload: { postId: post },
  user: bob
});

// 评论内容
await controller.execute({
  interaction: 'CreateComment',
  payload: {
    postId: post,
    content: 'Great post!'
  },
  user: bob
});
```

### 6. 查询数据

```javascript
// 获取用户信息
const user = await controller.execute({
  interaction: 'GetUserProfile',
  data: { id: userId }
});

// 获取内容列表
const posts = await controller.execute({
  interaction: 'GetPosts',
  query: { status: 'published' }
});

// 获取用户的内容
const userPosts = await controller.execute({
  interaction: 'GetUserPosts',
  query: { userId: userId }
});

// 获取评论列表
const comments = await controller.execute({
  interaction: 'GetComments',
  query: { postId: postId }
});
```

## 权限系统

### 内容可见性

- **public**: 所有用户可见
- **friends**: 仅好友可见
- **private**: 仅作者可见

### 操作权限

- 用户只能编辑自己的资料
- 作者可以编辑、发布、删除自己的内容
- 用户只能删除自己的评论
- 好友请求只能由接收者处理

## 响应式计算

系统会自动计算和更新以下统计数据：

### 用户统计
- `friendCount`: 好友数量
- `followerCount`: 粉丝数量
- `followingCount`: 关注数量
- `postCount`: 发布内容数量
- `commentCount`: 评论数量
- `totalLikesReceived`: 获得的总点赞数
- `activityScore`: 活跃度分数
- `pendingFriendRequestCount`: 待处理好友请求数量
- `hasPendingFriendRequests`: 是否有待处理请求

### 内容统计
- `likeCount`: 点赞数量
- `commentCount`: 评论数量
- `hotScore`: 热度分数（基于点赞、评论、浏览量和时间衰减）
- `isPublished`: 是否已发布
- `isDeleted`: 是否已删除
- `isEditable`: 是否可编辑

### 评论统计
- `replyCount`: 回复数量
- `likeCount`: 点赞数量
- `hasReplies`: 是否有回复

## 过滤实体

系统提供了预定义的过滤实体：

```javascript
import { 
  PublishedPost,    // 已发布的内容
  PublicPost,       // 公开的内容
  HotPost,          // 热门内容（热度分数 >= 10）
  ActiveUser,       // 活跃用户（活跃度分数 > 5）
  PendingFriendRequest  // 待处理的好友请求
} from './src/entities.js';
```

## 错误处理

所有交互都会进行权限验证，以下情况会抛出错误：

- 向自己发送好友请求
- 修改他人的内容或资料
- 访问无权限查看的内容
- 对草稿状态的内容进行社交互动
- 重复发送好友请求

## 最佳实践

1. **权限检查**: 在执行操作前检查用户权限
2. **状态管理**: 合理利用内容状态（草稿->已发布->已删除）
3. **响应式数据**: 依赖系统自动计算的统计数据，避免手动维护
4. **错误处理**: 妥善处理权限错误和业务逻辑错误
5. **性能优化**: 使用过滤实体减少不必要的数据查询

## 扩展开发

要扩展系统功能，可以：

1. **添加新实体**: 在 `entities-base.ts` 中定义
2. **建立新关系**: 在 `relations.ts` 中定义
3. **添加新交互**: 在 `interactions.ts` 中定义
4. **创建过滤实体**: 在 `entities.ts` 中定义
5. **编写测试**: 确保新功能正确工作

详细的 API 文档请参考 `docs/api.md`。