# 社交+内容网络系统详细需求

## 1. 实体设计

### 1.1 用户实体 (User)
```typescript
User {
  id: string                    // 主键
  username: string              // 用户名，唯一
  email: string                 // 邮箱，唯一
  displayName: string           // 显示名称
  bio?: string                  // 个人简介
  avatar?: string               // 头像URL
  createdAt: string            // 注册时间
  lastActiveAt: string         // 最后活跃时间
  isActive: boolean            // 账户状态
  
  // 响应式计算属性
  friendCount: number          // 好友数量
  postCount: number            // 发帖数量
  likeGivenCount: number       // 给出的点赞数
  likeReceivedCount: number    // 收到的点赞数
  activityScore: number        // 活跃度分数
}
```

### 1.2 内容实体 (Post)
```typescript
Post {
  id: string                   // 主键
  title: string                // 标题
  content: string              // 内容
  summary?: string             // 摘要，自动生成
  status: 'draft' | 'published' | 'archived'  // 状态
  createdAt: string           // 创建时间
  publishedAt?: string        // 发布时间
  updatedAt: string           // 更新时间
  authorId: string            // 作者ID，关联User
  
  // 响应式计算属性
  likeCount: number           // 点赞数
  viewCount: number           // 浏览数
  shareCount: number          // 分享数
  engagementScore: number     // 互动分数
  isPopular: boolean          // 是否热门（基于互动数据）
}
```

### 1.3 标签实体 (Tag)
```typescript
Tag {
  id: string                  // 主键
  name: string                // 标签名，唯一
  description?: string        // 标签描述
  color: string              // 显示颜色
  createdAt: string          // 创建时间
  
  // 响应式计算属性
  postCount: number          // 使用该标签的帖子数
  popularityScore: number    // 受欢迎程度
}
```

### 1.4 分类实体 (Category)
```typescript
Category {
  id: string                 // 主键
  name: string               // 分类名
  description?: string       // 分类描述
  parentId?: string          // 父分类ID，支持层级
  order: number              // 排序
  isActive: boolean          // 是否启用
  
  // 响应式计算属性
  postCount: number          // 该分类下的帖子数
  activePostCount: number    // 已发布的帖子数
}
```

## 2. 关系设计

### 2.1 好友关系 (Friendship)
```typescript
Friendship: User ←→ User {
  // 对称关系
  type: 'n:n'
  symmetric: true
  
  // 关系属性
  status: 'pending' | 'accepted' | 'blocked'
  requesterId: string        // 发起请求的用户ID
  createdAt: string         // 关系创建时间
  acceptedAt?: string       // 接受时间
  
  // 关系方法
  sourceProperty: 'friends'
  targetProperty: 'friends'
}
```

### 2.2 关注关系 (Follow)
```typescript
Follow: User → User {
  // 非对称关系，支持单向关注
  type: 'n:n'
  symmetric: false
  
  // 关系属性
  followedAt: string        // 关注时间
  notificationEnabled: boolean  // 是否接收通知
  
  // 关系方法
  sourceProperty: 'following'   // 我关注的人
  targetProperty: 'followers'   // 关注我的人
}
```

### 2.3 内容作者关系 (UserPosts)
```typescript
UserPosts: User → Post {
  type: '1:n'
  
  sourceProperty: 'posts'
  targetProperty: 'author'
}
```

### 2.4 点赞关系 (Like)
```typescript
Like: User × Post {
  type: 'n:n'
  
  // 关系属性
  likedAt: string           // 点赞时间
  type: 'like' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry'  // 点赞类型
  
  sourceProperty: 'likedPosts'
  targetProperty: 'likers'
}
```

### 2.5 内容标签关系 (PostTags)
```typescript
PostTags: Post × Tag {
  type: 'n:n'
  
  // 关系属性
  addedAt: string           // 添加时间
  addedBy: string           // 添加者ID
  
  sourceProperty: 'tags'
  targetProperty: 'posts'
}
```

### 2.6 内容分类关系 (PostCategory)
```typescript
PostCategory: Post → Category {
  type: 'n:1'
  
  sourceProperty: 'category'
  targetProperty: 'posts'
}
```

### 2.7 浏览记录关系 (View)
```typescript
View: User × Post {
  type: 'n:n'
  
  // 关系属性
  viewedAt: string          // 浏览时间
  duration?: number         // 浏览时长（秒）
  source: 'timeline' | 'search' | 'direct' | 'recommendation'  // 浏览来源
  
  sourceProperty: 'viewedPosts'
  targetProperty: 'viewers'
}
```

## 3. 响应式计算

### 3.1 用户统计计算
```typescript
// 好友数量
User.friendCount = Count.create({
  record: Friendship,
  where: { status: 'accepted' }
})

// 发帖数量  
User.postCount = Count.create({
  record: UserPosts,
  attributeQuery: [['target', { attributeQuery: ['status'] }]],
  callback: (relation) => relation.target.status === 'published'
})

// 收到的点赞数
User.likeReceivedCount = Count.create({
  record: Like,
  attributeQuery: [['target', { attributeQuery: ['author'] }]],
  callback: (like) => like.target.author.id === 'current_user_id'
})

// 活跃度分数
User.activityScore = Transform.create({
  record: User,
  transform: (user) => {
    const postScore = user.postCount * 10
    const likeScore = user.likeGivenCount * 2
    const friendScore = user.friendCount * 5
    return postScore + likeScore + friendScore
  }
})
```

### 3.2 内容统计计算
```typescript
// 点赞数
Post.likeCount = Count.create({
  record: Like
})

// 浏览数
Post.viewCount = Count.create({
  record: View
})

// 互动分数
Post.engagementScore = WeightedSummation.create({
  record: Like,
  callback: (like) => {
    const weights = {
      'like': 1,
      'love': 2,
      'laugh': 1.5,
      'wow': 1.5,
      'sad': 1,
      'angry': 0.5
    }
    return weights[like.type] || 1
  }
})

// 是否热门
Post.isPopular = Transform.create({
  record: Post,
  transform: (post) => {
    return post.likeCount >= 10 && post.viewCount >= 100
  }
})

// 内容摘要
Post.summary = Transform.create({
  record: Post,
  transform: (post) => {
    const content = post.content || ''
    return content.length > 200 
      ? content.substring(0, 200) + '...'
      : content
  }
})
```

### 3.3 标签统计计算
```typescript
// 标签使用数量
Tag.postCount = Count.create({
  record: PostTags
})

// 受欢迎程度
Tag.popularityScore = WeightedSummation.create({
  record: PostTags,
  attributeQuery: [['source', { attributeQuery: ['likeCount', 'viewCount'] }]],
  callback: (relation) => {
    const post = relation.source
    return post.likeCount * 2 + post.viewCount * 0.1
  }
})
```

## 4. 交互设计

### 4.1 用户管理交互
```typescript
// 用户注册
RegisterUser: {
  payload: {
    username: string
    email: string
    password: string
    displayName: string
  }
  action: 创建User实体
}

// 更新用户档案
UpdateUserProfile: {
  payload: {
    userId: string
    displayName?: string
    bio?: string
    avatar?: string
  }
  action: 更新User实体
}
```

### 4.2 好友关系交互
```typescript
// 发送好友请求
SendFriendRequest: {
  payload: {
    fromUserId: string
    toUserId: string
  }
  action: 创建Friendship关系（status: 'pending'）
}

// 接受好友请求
AcceptFriendRequest: {
  payload: {
    friendshipId: string
    userId: string
  }
  action: 更新Friendship状态为'accepted'
}

// 拒绝好友请求
RejectFriendRequest: {
  payload: {
    friendshipId: string
    userId: string
  }
  action: 删除Friendship关系
}

// 删除好友
RemoveFriend: {
  payload: {
    userId: string
    friendId: string
  }
  action: 删除Friendship关系
}
```

### 4.3 关注交互
```typescript
// 关注用户
FollowUser: {
  payload: {
    followerId: string
    followeeId: string
  }
  action: 创建Follow关系
}

// 取消关注
UnfollowUser: {
  payload: {
    followerId: string
    followeeId: string
  }
  action: 删除Follow关系
}
```

### 4.4 内容管理交互
```typescript
// 创建帖子
CreatePost: {
  payload: {
    authorId: string
    title: string
    content: string
    categoryId?: string
    tags?: string[]
    status: 'draft' | 'published'
  }
  action: [
    创建Post实体,
    创建PostTags关系（如果有标签）,
    创建PostCategory关系（如果有分类）
  ]
}

// 编辑帖子
EditPost: {
  payload: {
    postId: string
    userId: string
    title?: string
    content?: string
    categoryId?: string
    tags?: string[]
  }
  action: 更新Post实体和相关关系
}

// 发布帖子
PublishPost: {
  payload: {
    postId: string
    userId: string
  }
  action: 更新Post状态为'published'，设置publishedAt
}

// 删除帖子
DeletePost: {
  payload: {
    postId: string
    userId: string
  }
  action: [
    删除相关Like关系,
    删除相关View关系,
    删除相关PostTags关系,
    删除Post实体
  ]
}
```

### 4.5 互动交互
```typescript
// 点赞帖子
LikePost: {
  payload: {
    userId: string
    postId: string
    type: 'like' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry'
  }
  action: 创建或更新Like关系
}

// 取消点赞
UnlikePost: {
  payload: {
    userId: string
    postId: string
  }
  action: 删除Like关系
}

// 浏览帖子
ViewPost: {
  payload: {
    userId: string
    postId: string
    source: 'timeline' | 'search' | 'direct' | 'recommendation'
    duration?: number
  }
  action: 创建或更新View关系
}
```

### 4.6 标签和分类交互
```typescript
// 创建标签
CreateTag: {
  payload: {
    name: string
    description?: string
    color: string
  }
  action: 创建Tag实体
}

// 创建分类
CreateCategory: {
  payload: {
    name: string
    description?: string
    parentId?: string
  }
  action: 创建Category实体
}
```

## 5. 权限控制

### 5.1 基本权限规则
- 用户只能编辑自己的帖子
- 用户只能删除自己的帖子
- 任何用户都可以浏览已发布的帖子
- 只有作者可以查看草稿帖子
- 用户可以管理自己的好友关系

### 5.2 管理员权限
- 可以删除任何用户的帖子
- 可以管理所有标签和分类
- 可以查看系统统计信息

## 6. 性能优化

### 6.1 索引设计
- User.username, User.email 唯一索引
- Post.authorId, Post.status, Post.createdAt 复合索引
- Like.userId, Like.postId 复合索引
- Tag.name 唯一索引

### 6.2 计算优化
- 使用 Count 而不是 Transform 进行简单计数
- 为频繁查询的计算属性添加缓存
- 合理设计计算依赖，避免循环计算

## 7. 扩展功能（可选）

### 7.1 评论系统
- Comment 实体
- User-Comment、Post-Comment 关系
- 嵌套评论支持

### 7.2 消息通知
- Notification 实体
- 好友请求、点赞、评论通知
- 实时推送机制

### 7.3 内容推荐
- 基于用户关系的推荐
- 基于互动历史的推荐
- 热门内容推荐

### 7.4 搜索功能
- 全文搜索
- 标签搜索
- 用户搜索
- 高级筛选

这个需求规格为社交内容网络提供了完整的功能框架，充分展示了 @interaqt/runtime 框架的响应式特性和强大功能。