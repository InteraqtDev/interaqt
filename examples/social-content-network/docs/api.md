# API 文档

## 实体 (Entities)

### User 用户实体

用户系统的核心实体，包含用户基本信息和社交统计数据。

#### 属性

**基本属性:**
- `username: string` - 用户名（必需，唯一标识）
- `displayName: string` - 显示名称（必需）
- `email: string` - 邮箱地址（可选）
- `avatar: string` - 头像URL（可选）
- `bio: string` - 个人简介（可选）
- `createdAt: string` - 创建时间
- `lastActiveAt: string` - 最后活跃时间

**计算属性:**
- `friendCount: number` - 好友数量
- `followerCount: number` - 粉丝数量
- `followingCount: number` - 关注数量
- `postCount: number` - 发布内容数量
- `commentCount: number` - 评论数量
- `totalLikesReceived: number` - 获得的总点赞数
- `activityScore: number` - 活跃度分数
- `pendingFriendRequestCount: number` - 待处理好友请求数量
- `hasPendingFriendRequests: boolean` - 是否有待处理请求

### Post 内容实体

社交网络中的内容/帖子实体。

#### 属性

**基本属性:**
- `title: string` - 标题（必需）
- `content: string` - 内容文本（必需）
- `tags: string[]` - 标签列表
- `mediaUrls: string[]` - 媒体附件URL列表
- `createdAt: string` - 创建时间
- `updatedAt: string` - 更新时间
- `publishedAt: string` - 发布时间（可选）
- `status: string` - 状态：'draft' | 'published' | 'deleted'
- `visibility: string` - 可见性：'public' | 'friends' | 'private'
- `viewCount: number` - 浏览量

**计算属性:**
- `likeCount: number` - 点赞数量
- `commentCount: number` - 评论数量
- `hotScore: number` - 热度分数
- `isPublished: boolean` - 是否已发布
- `isDeleted: boolean` - 是否已删除
- `isEditable: boolean` - 是否可编辑

### Comment 评论实体

内容评论和回复系统。

#### 属性

**基本属性:**
- `content: string` - 评论内容（必需）
- `createdAt: string` - 创建时间
- `updatedAt: string` - 更新时间
- `isDeleted: boolean` - 是否已删除

**计算属性:**
- `replyCount: number` - 回复数量
- `likeCount: number` - 点赞数量
- `hasReplies: boolean` - 是否有回复

### FriendRequest 好友请求实体

好友关系建立的中间实体。

#### 属性

- `message: string` - 请求消息（可选）
- `status: string` - 状态：'pending' | 'accepted' | 'rejected'
- `createdAt: string` - 创建时间
- `respondedAt: string` - 响应时间（可选）

### Tag 标签实体

内容标签系统。

#### 属性

**基本属性:**
- `name: string` - 标签名称（必需）
- `createdAt: string` - 创建时间

**计算属性:**
- `postCount: number` - 使用该标签的内容数量
- `popularity: number` - 热门程度

## 关系 (Relations)

### 用户关系

- `Friendship` - 好友关系（n:n，对称）
- `Follow` - 关注关系（n:n，非对称）
- `UserFriendRequest` - 用户发送的好友请求（1:n）
- `UserFriendRequestReceived` - 用户接收的好友请求（1:n）

### 内容关系

- `UserPost` - 用户发布内容关系（1:n）
- `PostComment` - 内容评论关系（1:n）
- `UserComment` - 用户评论关系（1:n）
- `CommentReply` - 评论回复关系（1:n，自引用）

### 互动关系

- `Like` - 用户点赞内容关系（n:n）
- `CommentLike` - 用户点赞评论关系（n:n）
- `PostTag` - 内容标签关系（n:n）

## 交互 (Interactions)

### 用户管理交互

#### CreateUser 创建用户

```javascript
await controller.execute({
  interaction: 'CreateUser',
  payload: {
    username: string,        // 必需
    displayName: string,     // 必需
    email?: string,          // 可选
    avatar?: string,         // 可选
    bio?: string            // 可选
  }
});
```

#### UpdateUserProfile 更新用户资料

```javascript
await controller.execute({
  interaction: 'UpdateUserProfile',
  payload: {
    userId: User,           // 必需，只能更新自己的资料
    displayName?: string,   // 可选
    avatar?: string,        // 可选
    bio?: string           // 可选
  },
  user: currentUser
});
```

#### GetUserProfile 获取用户资料

```javascript
const user = await controller.execute({
  interaction: 'GetUserProfile',
  data: { id: userId }
});
```

### 好友关系交互

#### SendFriendRequest 发送好友请求

```javascript
await controller.execute({
  interaction: 'SendFriendRequest',
  payload: {
    targetUserId: User,     // 必需，不能是自己且不能已是好友
    message?: string        // 可选
  },
  user: currentUser
});
```

#### AcceptFriendRequest 接受好友请求

```javascript
await controller.execute({
  interaction: 'AcceptFriendRequest',
  payload: {
    requestId: FriendRequest  // 必需，只能接受发给自己的请求
  },
  user: currentUser
});
```

#### RejectFriendRequest 拒绝好友请求

```javascript
await controller.execute({
  interaction: 'RejectFriendRequest',
  payload: {
    requestId: FriendRequest  // 必需，只能拒绝发给自己的请求
  },
  user: currentUser
});
```

#### RemoveFriend 删除好友

```javascript
await controller.execute({
  interaction: 'RemoveFriend',
  payload: {
    friendId: User          // 必需，必须是当前好友且不能是自己
  },
  user: currentUser
});
```

#### FollowUser 关注用户

```javascript
await controller.execute({
  interaction: 'FollowUser',
  payload: {
    targetUserId: User      // 必需，不能是自己
  },
  user: currentUser
});
```

#### UnfollowUser 取消关注

```javascript
await controller.execute({
  interaction: 'UnfollowUser',
  payload: {
    targetUserId: User      // 必需，不能是自己
  },
  user: currentUser
});
```

### 内容管理交互

#### CreatePost 创建内容

```javascript
await controller.execute({
  interaction: 'CreatePost',
  payload: {
    title: string,           // 必需
    content: string,         // 必需
    tags?: string[],         // 可选
    mediaUrls?: string[],    // 可选
    visibility?: string      // 可选，默认 'public'
  },
  user: currentUser
});
```

#### UpdatePost 更新内容

```javascript
await controller.execute({
  interaction: 'UpdatePost',
  payload: {
    postId: Post,           // 必需，只能更新自己的内容
    title?: string,         // 可选
    content?: string,       // 可选
    tags?: string[],        // 可选
    visibility?: string     // 可选
  },
  user: currentUser
});
```

#### PublishPost 发布内容

```javascript
await controller.execute({
  interaction: 'PublishPost',
  payload: {
    postId: Post            // 必需，只能发布自己的草稿
  },
  user: currentUser
});
```

#### UnpublishPost 撤回内容

```javascript
await controller.execute({
  interaction: 'UnpublishPost',
  payload: {
    postId: Post            // 必需，只能撤回自己已发布的内容
  },
  user: currentUser
});
```

#### DeletePost 删除内容

```javascript
await controller.execute({
  interaction: 'DeletePost',
  payload: {
    postId: Post            // 必需，只能删除自己的内容
  },
  user: currentUser
});
```

#### ViewPost 查看内容

```javascript
await controller.execute({
  interaction: 'ViewPost',
  payload: {
    postId: Post            // 必需，必须有查看权限
  },
  user: currentUser
});
```

#### GetPosts 获取内容列表

```javascript
const posts = await controller.execute({
  interaction: 'GetPosts',
  query?: {
    status?: string,        // 过滤状态
    visibility?: string,    // 过滤可见性
    authorId?: string      // 过滤作者
  }
});
```

#### GetUserPosts 获取用户内容

```javascript
const posts = await controller.execute({
  interaction: 'GetUserPosts',
  query: {
    userId: string          // 必需
  }
});
```

### 社交互动交互

#### LikePost 点赞内容

```javascript
await controller.execute({
  interaction: 'LikePost',
  payload: {
    postId: Post            // 必需，必须是已发布且可见的内容
  },
  user: currentUser
});
```

#### UnlikePost 取消点赞内容

```javascript
await controller.execute({
  interaction: 'UnlikePost',
  payload: {
    postId: Post            // 必需
  },
  user: currentUser
});
```

### 评论系统交互

#### CreateComment 创建评论

```javascript
await controller.execute({
  interaction: 'CreateComment',
  payload: {
    postId: Post,                   // 必需，必须是已发布且可见的内容
    content: string,                // 必需
    parentCommentId?: Comment       // 可选，用于回复评论
  },
  user: currentUser
});
```

#### UpdateComment 更新评论

```javascript
await controller.execute({
  interaction: 'UpdateComment',
  payload: {
    commentId: Comment,     // 必需，只能更新自己的评论
    content: string         // 必需
  },
  user: currentUser
});
```

#### DeleteComment 删除评论

```javascript
await controller.execute({
  interaction: 'DeleteComment',
  payload: {
    commentId: Comment      // 必需，只能删除自己的评论
  },
  user: currentUser
});
```

#### LikeComment 点赞评论

```javascript
await controller.execute({
  interaction: 'LikeComment',
  payload: {
    commentId: Comment      // 必需
  },
  user: currentUser
});
```

#### UnlikeComment 取消点赞评论

```javascript
await controller.execute({
  interaction: 'UnlikeComment',
  payload: {
    commentId: Comment      // 必需
  },
  user: currentUser
});
```

#### GetComments 获取评论列表

```javascript
const comments = await controller.execute({
  interaction: 'GetComments',
  query: {
    postId: string          // 可选，过滤特定内容的评论
  }
});
```

## 过滤实体 (Filtered Entities)

### PublishedPost 已发布内容

只包含状态为 'published' 的内容。

### PublicPost 公开内容

只包含可见性为 'public' 的内容。

### HotPost 热门内容

只包含热度分数 >= 10 的已发布内容。

### ActiveUser 活跃用户

只包含活跃度分数 > 5 的用户。

### PendingFriendRequest 待处理好友请求

只包含状态为 'pending' 的好友请求。

## 权限系统

### Attributive 权限定义

- `PostAuthor` - 内容作者权限
- `CommentAuthor` - 评论作者权限
- `Friend` - 好友关系权限
- `NotSelf` - 非自己权限
- `NotFriend` - 非好友权限
- `PublishedPost` - 已发布内容权限
- `VisiblePost` - 可见内容权限

### 权限检查逻辑

1. **身份验证**: 用户必须已登录
2. **所有者权限**: 只能操作自己拥有的资源
3. **关系权限**: 基于用户间关系进行权限判断
4. **状态权限**: 基于资源状态进行权限判断
5. **可见性权限**: 基于内容可见性设置进行权限判断

## 响应式计算

### Count 计数器

用于计算关联记录的数量：
- 好友数量
- 关注者/关注数量
- 内容数量
- 评论数量
- 点赞数量

### WeightedSummation 加权求和

用于计算复杂的统计数据：
- 用户获得的总点赞数
- 活跃度分数计算

### Transform 转换

用于计算复杂的业务逻辑：
- 内容热度分数（包含时间衰减）
- 用户活跃度分数

### Any/Every 逻辑判断

用于布尔值计算：
- 是否有待处理请求
- 是否有回复
- 状态判断

## 错误处理

### 常见错误类型

1. **权限错误**: 无权限执行操作
2. **业务逻辑错误**: 违反业务规则
3. **数据验证错误**: 输入数据不符合要求
4. **关系错误**: 违反关系约束

### 错误处理建议

```javascript
try {
  const result = await controller.execute({
    interaction: 'SomeInteraction',
    payload: { /* ... */ },
    user: currentUser
  });
  // 处理成功结果
} catch (error) {
  if (error.type === 'PERMISSION_DENIED') {
    // 处理权限错误
  } else if (error.type === 'BUSINESS_RULE_VIOLATION') {
    // 处理业务规则错误
  } else {
    // 处理其他错误
  }
}
```