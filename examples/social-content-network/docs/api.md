# 社交内容网络 API 文档

## 概述

本文档描述了社交内容网络示例的所有API接口，包括实体、关系、交互和响应式计算。

## 实体 API

### User 用户实体

#### 属性

| 字段名 | 类型 | 必填 | 描述 | 索引 |
|--------|------|------|------|------|
| id | string | 是 | 主键，自动生成 | 主键 |
| username | string | 是 | 用户名，唯一 | 唯一索引 |
| email | string | 是 | 邮箱，唯一 | 唯一索引 |
| displayName | string | 是 | 显示名称 | - |
| bio | string | 否 | 个人简介 | - |
| avatar | string | 否 | 头像URL | - |
| createdAt | string | 否 | 创建时间，自动生成 | 索引 |
| lastActiveAt | string | 否 | 最后活跃时间，自动生成 | 索引 |
| isActive | boolean | 否 | 账户状态，默认true | 索引 |

#### 响应式计算属性

| 字段名 | 类型 | 描述 | 计算方式 |
|--------|------|------|----------|
| friendCount | number | 好友数量 | Count(已接受的好友关系) |
| followerCount | number | 粉丝数量 | Count(关注者) |
| followingCount | number | 关注数量 | Count(正在关注的用户) |
| postCount | number | 发帖数量 | Count(已发布的帖子) |
| activityScore | number | 活跃度分数 | postCount×10 + friendCount×5 + followerCount×3 |

### Post 帖子实体

#### 属性

| 字段名 | 类型 | 必填 | 描述 | 索引 |
|--------|------|------|------|------|
| id | string | 是 | 主键，自动生成 | 主键 |
| title | string | 是 | 标题 | - |
| content | string | 是 | 内容 | - |
| status | string | 否 | 状态(draft/published)，默认draft | 索引 |
| createdAt | string | 否 | 创建时间，自动生成 | 索引 |
| publishedAt | string | 否 | 发布时间 | 索引 |
| updatedAt | string | 否 | 更新时间，自动生成 | - |

#### 响应式计算属性

| 字段名 | 类型 | 描述 | 计算方式 |
|--------|------|------|----------|
| summary | string | 内容摘要 | 自动截取前200字符 |
| likeCount | number | 点赞数量 | Count(点赞关系) |
| viewCount | number | 浏览数量 | Count(浏览关系) |
| engagementScore | number | 互动分数 | 根据点赞类型加权求和 |
| isPopular | boolean | 是否热门 | likeCount≥10 且 viewCount≥100 |

### Tag 标签实体

#### 属性

| 字段名 | 类型 | 必填 | 描述 | 索引 |
|--------|------|------|------|------|
| id | string | 是 | 主键，自动生成 | 主键 |
| name | string | 是 | 标签名，唯一 | 唯一索引 |
| description | string | 否 | 标签描述 | - |
| color | string | 否 | 显示颜色，默认#666666 | - |
| createdAt | string | 否 | 创建时间，自动生成 | - |

#### 响应式计算属性

| 字段名 | 类型 | 描述 | 计算方式 |
|--------|------|------|----------|
| postCount | number | 使用该标签的帖子数 | Count(标签关系) |
| popularityScore | number | 受欢迎程度 | 基于使用该标签的帖子互动数据 |

### Category 分类实体

#### 属性

| 字段名 | 类型 | 必填 | 描述 | 索引 |
|--------|------|------|------|------|
| id | string | 是 | 主键，自动生成 | 主键 |
| name | string | 是 | 分类名，唯一 | 唯一索引 |
| description | string | 否 | 分类描述 | - |
| parentId | string | 否 | 父分类ID | - |
| order | number | 否 | 排序，默认0 | 索引 |
| isActive | boolean | 否 | 是否启用，默认true | 索引 |

#### 响应式计算属性

| 字段名 | 类型 | 描述 | 计算方式 |
|--------|------|------|----------|
| postCount | number | 该分类下的帖子数 | Count(分类关系) |
| activePostCount | number | 已发布的帖子数 | Count(已发布状态的帖子) |

## 关系 API

### Friendship 好友关系

**类型**: 对称的多对多关系 (User ←→ User)

#### 关系属性

| 字段名 | 类型 | 描述 | 默认值 |
|--------|------|------|-------|
| status | string | 关系状态 | 'pending' |
| requesterId | string | 发起请求的用户ID | 必填 |
| createdAt | string | 创建时间 | 自动生成 |
| acceptedAt | string | 接受时间 | - |

#### 状态说明

- `pending`: 待处理的好友请求
- `accepted`: 已接受的好友关系
- `blocked`: 已屏蔽

### Follow 关注关系

**类型**: 非对称的多对多关系 (User → User)

#### 关系属性

| 字段名 | 类型 | 描述 | 默认值 |
|--------|------|------|-------|
| followedAt | string | 关注时间 | 自动生成 |
| notificationEnabled | boolean | 是否接收通知 | true |

### Like 点赞关系

**类型**: 多对多关系 (User × Post)

#### 关系属性

| 字段名 | 类型 | 描述 | 默认值 |
|--------|------|------|-------|
| likedAt | string | 点赞时间 | 自动生成 |
| type | string | 点赞类型 | 'like' |

#### 点赞类型和权重

| 类型 | 权重 | 描述 |
|------|------|------|
| like | 1.0 | 点赞 |
| love | 2.0 | 喜欢 |
| laugh | 1.5 | 哈哈 |
| wow | 1.5 | 哇 |
| sad | 1.0 | 难过 |
| angry | 0.5 | 愤怒 |

### View 浏览关系

**类型**: 多对多关系 (User × Post)

#### 关系属性

| 字段名 | 类型 | 描述 | 默认值 |
|--------|------|------|-------|
| viewedAt | string | 浏览时间 | 自动生成 |
| duration | number | 浏览时长(秒) | 0 |
| source | string | 浏览来源 | 'direct' |

#### 浏览来源

- `timeline`: 时间线
- `search`: 搜索
- `direct`: 直接访问
- `recommendation`: 推荐

### PostTag 帖子标签关系

**类型**: 多对多关系 (Post × Tag)

#### 关系属性

| 字段名 | 类型 | 描述 | 默认值 |
|--------|------|------|-------|
| addedAt | string | 添加时间 | 自动生成 |
| addedBy | string | 添加者用户ID | 必填 |

### PostCategory 帖子分类关系

**类型**: 多对一关系 (Post → Category)

无额外关系属性。

## 交互 API

### 用户管理交互

#### UpdateUserProfile 更新用户档案

```typescript
{
  userId: string          // 必填，要更新的用户ID
  displayName?: string    // 可选，显示名称
  bio?: string           // 可选，个人简介
  avatar?: string        // 可选，头像URL
}
```

### 好友关系交互

#### SendFriendRequest 发送好友请求

```typescript
{
  fromUserId: string     // 必填，发送者用户ID
  toUserId: string       // 必填，接收者用户ID
}
```

#### AcceptFriendRequest 接受好友请求

```typescript
{
  userId: string         // 必填，当前用户ID
  friendId: string       // 必填，好友用户ID
}
```

#### RejectFriendRequest 拒绝好友请求

```typescript
{
  userId: string         // 必填，当前用户ID
  friendId: string       // 必填，好友用户ID
}
```

#### RemoveFriend 删除好友

```typescript
{
  userId: string         // 必填，当前用户ID
  friendId: string       // 必填，要删除的好友ID
}
```

### 关注交互

#### FollowUser 关注用户

```typescript
{
  followerId: string           // 必填，关注者用户ID
  followeeId: string           // 必填，被关注者用户ID
  notificationEnabled?: boolean // 可选，是否接收通知，默认true
}
```

#### UnfollowUser 取消关注

```typescript
{
  followerId: string     // 必填，关注者用户ID
  followeeId: string     // 必填，被关注者用户ID
}
```

### 内容管理交互

#### CreatePost 创建帖子

```typescript
{
  title: string          // 必填，标题
  content: string        // 必填，内容
  authorId: string       // 必填，作者用户ID
  status?: string        // 可选，状态(draft/published)，默认draft
  categoryId?: string    // 可选，分类ID
  tags?: string[]        // 可选，标签ID数组
}
```

#### EditPost 编辑帖子

```typescript
{
  postId: string         // 必填，帖子ID
  userId: string         // 必填，当前用户ID
  title?: string         // 可选，标题
  content?: string       // 可选，内容
  categoryId?: string    // 可选，分类ID
  tags?: string[]        // 可选，标签ID数组
}
```

#### PublishPost 发布帖子

```typescript
{
  postId: string         // 必填，帖子ID
  userId: string         // 必填，当前用户ID
}
```

#### DeletePost 删除帖子

```typescript
{
  postId: string         // 必填，帖子ID
  userId: string         // 必填，当前用户ID
}
```

### 互动交互

#### LikePost 点赞帖子

```typescript
{
  userId: string         // 必填，用户ID
  postId: string         // 必填，帖子ID
  type?: string          // 可选，点赞类型，默认'like'
}
```

#### UnlikePost 取消点赞

```typescript
{
  userId: string         // 必填，用户ID
  postId: string         // 必填，帖子ID
}
```

#### ViewPost 浏览帖子

```typescript
{
  userId: string         // 必填，用户ID
  postId: string         // 必填，帖子ID
  duration?: number      // 可选，浏览时长(秒)，默认0
  source?: string        // 可选，浏览来源，默认'direct'
}
```

### 标签和分类交互

#### CreateTag 创建标签

```typescript
{
  name: string           // 必填，标签名
  description?: string   // 可选，标签描述
  color?: string         // 可选，显示颜色，默认'#666666'
}
```

#### CreateCategory 创建分类

```typescript
{
  name: string           // 必填，分类名
  description?: string   // 可选，分类描述
  parentId?: string      // 可选，父分类ID
  order?: number         // 可选，排序，默认0
}
```

## 权限控制

### 基本原则

1. **用户只能修改自己的数据**: 用户只能编辑/删除自己创建的帖子
2. **公开内容**: 所有用户都可以浏览已发布的帖子
3. **私有内容**: 只有作者可以查看草稿状态的帖子
4. **关系管理**: 用户可以管理自己的好友和关注关系

### 角色权限

#### 普通用户 (user)
- 创建、编辑、删除自己的帖子
- 管理自己的好友和关注关系
- 点赞、浏览、分享其他用户的帖子
- 查看公开内容

#### 管理员 (admin)
- 普通用户的所有权限
- 创建、编辑标签和分类
- 删除任何用户的帖子
- 查看系统统计信息

## 错误码

| 错误码 | 描述 |
|--------|------|
| 400 | 参数验证失败 |
| 401 | 未认证 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名/邮箱已存在） |
| 500 | 服务器内部错误 |

## 使用示例

### 创建完整的社交互动流程

```javascript
// 1. 创建用户之间的关系
await controller.callInteraction('SendFriendRequest', {
  user: alice,
  payload: { fromUserId: alice.id, toUserId: bob.id }
})

await controller.callInteraction('AcceptFriendRequest', {
  user: bob,
  payload: { userId: bob.id, friendId: alice.id }
})

// 2. 创建内容
const post = await controller.callInteraction('CreatePost', {
  user: alice,
  payload: {
    title: 'JavaScript最佳实践',
    content: '分享一些JavaScript开发经验...',
    authorId: alice.id,
    status: 'published',
    tags: [jsTagId, reactTagId]
  }
})

// 3. 内容互动
await controller.callInteraction('LikePost', {
  user: bob,
  payload: { userId: bob.id, postId: post.data.id, type: 'love' }
})

await controller.callInteraction('ViewPost', {
  user: bob,
  payload: { 
    userId: bob.id, 
    postId: post.data.id, 
    duration: 120, 
    source: 'timeline' 
  }
})
```

### 查询响应式计算结果

```javascript
// 查询用户的活跃度数据
const user = await system.storage.findOne('User', 
  BoolExp.atom({ key: 'id', value: ['=', userId] }),
  undefined,
  ['*'] // 包含所有计算属性
)

console.log({
  friendCount: user.friendCount,
  followerCount: user.followerCount,
  postCount: user.postCount,
  activityScore: user.activityScore
})

// 查询帖子的互动数据
const post = await system.storage.findOne('Post',
  BoolExp.atom({ key: 'id', value: ['=', postId] }),
  undefined,
  ['*']
)

console.log({
  likeCount: post.likeCount,
  viewCount: post.viewCount,
  engagementScore: post.engagementScore,
  isPopular: post.isPopular
})
```