# 社交内容网络使用指南

## 快速开始

### 1. 安装和设置

```bash
# 安装依赖
npm install

# 运行测试
npm run test:social-network

# 启动示例演示
npm run start:social-network
```

### 2. 基本概念理解

社交内容网络示例展示了如何使用 @interaqt/runtime 构建一个具有以下特性的系统：

- **响应式数据更新**: 当用户点赞时，帖子的点赞数自动更新
- **复杂关系管理**: 好友关系、关注关系、内容关系等
- **自动化统计**: 用户活跃度、内容受欢迎程度等自动计算
- **权限控制**: 基于用户角色和所有权的访问控制

## 核心功能使用

### 用户管理

#### 创建和管理用户档案

```javascript
import { createSocialNetworkSystem } from './src/index.js'
import { MonoSystem, Controller } from '@interaqt/runtime'

// 初始化系统
const { entities, relations, interactions, dicts, activities } = createSocialNetworkSystem()
const system = new MonoSystem()
const controller = new Controller(system, entities, relations, activities, interactions, dicts, [])
await controller.setup(true)

// 创建用户（通常由注册系统处理，这里直接创建）
const alice = await system.storage.create('User', {
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Cooper',
  bio: 'I love sharing tech insights!'
})

// 更新用户档案
const updateProfileInteraction = interactions.find(i => i.name === 'UpdateUserProfile')
await controller.callInteraction(updateProfileInteraction.uuid, {
  user: { ...alice, roles: ['user'] },
  payload: {
    userId: alice.id,
    displayName: 'Alice the Developer',
    bio: 'Full-stack developer passionate about JavaScript',
    avatar: 'https://example.com/alice.jpg'
  }
})
```

### 社交关系管理

#### 好友系统

```javascript
// 发送好友请求
const sendFriendRequestInteraction = interactions.find(i => i.name === 'SendFriendRequest')
await controller.callInteraction(sendFriendRequestInteraction.uuid, {
  user: { ...alice, roles: ['user'] },
  payload: {
    fromUserId: alice.id,
    toUserId: bob.id
  }
})

// 接受好友请求
const acceptFriendRequestInteraction = interactions.find(i => i.name === 'AcceptFriendRequest')
await controller.callInteraction(acceptFriendRequestInteraction.uuid, {
  user: { ...bob, roles: ['user'] },
  payload: {
    userId: bob.id,
    friendId: alice.id
  }
})

// 查询好友列表
const friendships = await system.storage.findRelationByName(
  'User_friends_friends_User',
  BoolExp.and([
    BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
    BoolExp.atom({ key: 'relationData.status', value: ['=', 'accepted'] })
  ]),
  undefined,
  ['*', ['target', { attributeQuery: ['*'] }]]
)

const friends = friendships.map(f => f.target)
console.log('Alice的好友:', friends)
```

#### 关注系统

```javascript
// 关注用户
const followUserInteraction = interactions.find(i => i.name === 'FollowUser')
await controller.callInteraction(followUserInteraction.uuid, {
  user: { ...alice, roles: ['user'] },
  payload: {
    followerId: alice.id,
    followeeId: carol.id,
    notificationEnabled: true
  }
})

// 查询关注和粉丝
const following = await system.storage.findRelationByName(
  'User_following_followers_User',
  BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
  undefined,
  ['*', ['target', { attributeQuery: ['*'] }]]
)

const followers = await system.storage.findRelationByName(
  'User_following_followers_User',
  BoolExp.atom({ key: 'target.id', value: ['=', alice.id] }),
  undefined,
  ['*', ['source', { attributeQuery: ['*'] }]]
)

console.log('Alice关注的人:', following.map(f => f.target))
console.log('Alice的粉丝:', followers.map(f => f.source))
```

### 内容创作和管理

#### 创建内容

```javascript
// 创建标签和分类
const jsTag = await system.storage.create('Tag', {
  name: 'javascript',
  description: 'JavaScript programming',
  color: '#f7df1e'
})

const techCategory = await system.storage.create('Category', {
  name: 'Technology',
  description: 'Tech-related posts'
})

// 创建帖子
const createPostInteraction = interactions.find(i => i.name === 'CreatePost')
const postResult = await controller.callInteraction(createPostInteraction.uuid, {
  user: { ...alice, roles: ['user'] },
  payload: {
    title: 'JavaScript异步编程详解',
    content: '本文将深入探讨JavaScript中的异步编程模式...',
    authorId: alice.id,
    status: 'published',
    categoryId: techCategory.id,
    tags: [jsTag.id]
  }
})

const post = postResult.data
console.log('创建的帖子:', post)
```

#### 编辑和管理内容

```javascript
// 编辑帖子
const editPostInteraction = interactions.find(i => i.name === 'EditPost')
await controller.callInteraction(editPostInteraction.uuid, {
  user: { ...alice, roles: ['user'] },
  payload: {
    postId: post.id,
    userId: alice.id,
    title: 'JavaScript异步编程深度解析 - 更新版',
    content: '本文将深入探讨JavaScript中的异步编程模式...[更新内容]',
    categoryId: techCategory.id,
    tags: [jsTag.id]
  }
})

// 发布草稿
const publishPostInteraction = interactions.find(i => i.name === 'PublishPost')
await controller.callInteraction(publishPostInteraction.uuid, {
  user: { ...alice, roles: ['user'] },
  payload: {
    postId: draftPost.id,
    userId: alice.id
  }
})
```

### 内容互动

#### 点赞系统

```javascript
// 点赞帖子
const likePostInteraction = interactions.find(i => i.name === 'LikePost')
await controller.callInteraction(likePostInteraction.uuid, {
  user: { ...bob, roles: ['user'] },
  payload: {
    userId: bob.id,
    postId: post.id,
    type: 'love'  // 'like', 'love', 'laugh', 'wow', 'sad', 'angry'
  }
})

// 取消点赞
const unlikePostInteraction = interactions.find(i => i.name === 'UnlikePost')
await controller.callInteraction(unlikePostInteraction.uuid, {
  user: { ...bob, roles: ['user'] },
  payload: {
    userId: bob.id,
    postId: post.id
  }
})

// 查询帖子的点赞者
const likes = await system.storage.findRelationByName(
  'User_likedPosts_likers_Post',
  BoolExp.atom({ key: 'target.id', value: ['=', post.id] }),
  undefined,
  ['*', ['source', { attributeQuery: ['*'] }]]
)

console.log('点赞用户:', likes.map(l => ({
  user: l.source,
  type: l.relationData.type,
  likedAt: l.relationData.likedAt
})))
```

#### 浏览记录

```javascript
// 记录浏览
const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')
await controller.callInteraction(viewPostInteraction.uuid, {
  user: { ...bob, roles: ['user'] },
  payload: {
    userId: bob.id,
    postId: post.id,
    duration: 120,  // 浏览时长(秒)
    source: 'timeline'  // 'timeline', 'search', 'direct', 'recommendation'
  }
})
```

## 响应式计算的使用

### 查询实时统计数据

```javascript
// 查询用户的实时统计
const userData = await system.storage.findOne(
  'User',
  BoolExp.atom({ key: 'id', value: ['=', alice.id] }),
  undefined,
  ['*']  // 获取所有字段，包括计算属性
)

console.log('用户统计:', {
  好友数量: userData.friendCount,
  粉丝数量: userData.followerCount,
  关注数量: userData.followingCount,
  发帖数量: userData.postCount,
  活跃度分数: userData.activityScore
})

// 查询帖子的实时统计
const postData = await system.storage.findOne(
  'Post',
  BoolExp.atom({ key: 'id', value: ['=', post.id] }),
  undefined,
  ['*']
)

console.log('帖子统计:', {
  标题: postData.title,
  摘要: postData.summary,
  点赞数: postData.likeCount,
  浏览数: postData.viewCount,
  互动分数: postData.engagementScore,
  是否热门: postData.isPopular
})

// 查询标签的受欢迎程度
const tagData = await system.storage.findOne(
  'Tag',
  BoolExp.atom({ key: 'id', value: ['=', jsTag.id] }),
  undefined,
  ['*']
)

console.log('标签统计:', {
  名称: tagData.name,
  使用次数: tagData.postCount,
  受欢迎程度: tagData.popularityScore
})
```

### 实时更新观察

响应式计算的一个关键特性是自动更新。当底层数据发生变化时，相关的计算属性会自动重新计算：

```javascript
// 初始状态
let postData = await system.storage.findOne('Post', 
  BoolExp.atom({ key: 'id', value: ['=', post.id] }), undefined, ['*'])
console.log('初始点赞数:', postData.likeCount)  // 0

// 添加点赞
await controller.callInteraction(likePostInteraction.uuid, {
  user: { ...bob, roles: ['user'] },
  payload: { userId: bob.id, postId: post.id, type: 'like' }
})

// 重新查询，点赞数已自动更新
postData = await system.storage.findOne('Post', 
  BoolExp.atom({ key: 'id', value: ['=', post.id] }), undefined, ['*'])
console.log('更新后点赞数:', postData.likeCount)  // 1

// 用户活跃度也会自动更新
let userData = await system.storage.findOne('User',
  BoolExp.atom({ key: 'id', value: ['=', alice.id] }), undefined, ['*'])
console.log('Alice的活跃度分数:', userData.activityScore)
```

## 高级查询和分析

### 内容发现

```javascript
// 查找热门内容
const popularPosts = await system.storage.find('Post', {
  isPopular: { $eq: true },
  status: { $eq: 'published' }
}, {
  orderBy: [['engagementScore', 'desc']],
  limit: 10
})

console.log('热门帖子:', popularPosts)

// 基于标签查找相关内容
const techPosts = await system.storage.findRelationByName(
  'Post_tags_posts_Tag',
  BoolExp.atom({ key: 'target.name', value: ['=', 'javascript'] }),
  undefined,
  ['*', ['source', { attributeQuery: ['*'] }]]
)

console.log('JavaScript相关帖子:', techPosts.map(r => r.source))
```

### 用户行为分析

```javascript
// 分析用户的互动偏好
const userLikes = await system.storage.findRelationByName(
  'User_likedPosts_likers_Post',
  BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
  undefined,
  ['*', ['target', { 
    attributeQuery: ['*'],
    include: [['tags', { attributeQuery: ['*'] }]]
  }]]
)

const likedTags = userLikes.flatMap(like => like.target.tags || [])
const tagFrequency = {}
likedTags.forEach(tag => {
  tagFrequency[tag.name] = (tagFrequency[tag.name] || 0) + 1
})

console.log('用户兴趣偏好:', tagFrequency)

// 分析内容创作者的影响力
const influentialUsers = await system.storage.find('User', {
  activityScore: { $gt: 50 },
  followerCount: { $gt: 10 }
}, {
  orderBy: [['activityScore', 'desc']],
  limit: 5
})

console.log('影响力用户:', influentialUsers)
```

### 社交网络分析

```javascript
// 分析用户的社交圈
const userNetwork = async (userId) => {
  // 直接好友
  const friends = await system.storage.findRelationByName(
    'User_friends_friends_User',
    BoolExp.and([
      BoolExp.atom({ key: 'source.id', value: ['=', userId] }),
      BoolExp.atom({ key: 'relationData.status', value: ['=', 'accepted'] })
    ]),
    undefined,
    ['*', ['target', { attributeQuery: ['*'] }]]
  )

  // 关注的人
  const following = await system.storage.findRelationByName(
    'User_following_followers_User',
    BoolExp.atom({ key: 'source.id', value: ['=', userId] }),
    undefined,
    ['*', ['target', { attributeQuery: ['*'] }]]
  )

  // 粉丝
  const followers = await system.storage.findRelationByName(
    'User_following_followers_User',
    BoolExp.atom({ key: 'target.id', value: ['=', userId] }),
    undefined,
    ['*', ['source', { attributeQuery: ['*'] }]]
  )

  return {
    friends: friends.map(f => f.target),
    following: following.map(f => f.target),
    followers: followers.map(f => f.source)
  }
}

const aliceNetwork = await userNetwork(alice.id)
console.log('Alice的社交网络:', aliceNetwork)
```

## 推荐算法实现

### 基于内容的推荐

```javascript
// 基于用户的点赞历史推荐相关内容
const getContentRecommendations = async (userId) => {
  // 获取用户点赞的帖子的标签
  const userLikes = await system.storage.findRelationByName(
    'User_likedPosts_likers_Post',
    BoolExp.atom({ key: 'source.id', value: ['=', userId] }),
    undefined,
    ['*', ['target', { 
      attributeQuery: ['*'],
      include: [['tags', { attributeQuery: ['*'] }]]
    }]]
  )

  // 统计标签偏好
  const tagPreferences = {}
  userLikes.forEach(like => {
    const likeWeight = getEngagementWeight(like.relationData.type)
    like.target.tags?.forEach(tag => {
      tagPreferences[tag.id] = (tagPreferences[tag.id] || 0) + likeWeight
    })
  })

  // 查找具有相似标签的其他帖子
  const recommendedPosts = []
  for (const [tagId, weight] of Object.entries(tagPreferences)) {
    const tagPosts = await system.storage.findRelationByName(
      'Post_tags_posts_Tag',
      BoolExp.atom({ key: 'target.id', value: ['=', tagId] }),
      undefined,
      ['*', ['source', { attributeQuery: ['*'] }]]
    )

    tagPosts.forEach(relation => {
      const post = relation.source
      // 排除用户已经点赞过的帖子
      if (!userLikes.some(like => like.target.id === post.id)) {
        recommendedPosts.push({
          post,
          score: weight * post.engagementScore,
          reason: `基于对 ${relation.target.name} 标签的兴趣`
        })
      }
    })
  }

  // 按推荐分数排序
  return recommendedPosts
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

const recommendations = await getContentRecommendations(alice.id)
console.log('为Alice推荐的内容:', recommendations)
```

### 基于社交关系的推荐

```javascript
// 基于好友行为推荐内容
const getSocialRecommendations = async (userId) => {
  // 获取用户的好友
  const friends = await system.storage.findRelationByName(
    'User_friends_friends_User',
    BoolExp.and([
      BoolExp.atom({ key: 'source.id', value: ['=', userId] }),
      BoolExp.atom({ key: 'relationData.status', value: ['=', 'accepted'] })
    ]),
    undefined,
    ['*', ['target', { attributeQuery: ['*'] }]]
  )

  // 获取好友最近点赞的帖子
  const friendRecommendations = []
  for (const friend of friends) {
    const friendLikes = await system.storage.findRelationByName(
      'User_likedPosts_likers_Post',
      BoolExp.atom({ key: 'source.id', value: ['=', friend.target.id] }),
      undefined,
      ['*', ['target', { attributeQuery: ['*'] }]]
    )

    friendLikes.forEach(like => {
      friendRecommendations.push({
        post: like.target,
        score: getEngagementWeight(like.relationData.type),
        reason: `好友 ${friend.target.displayName} 点赞了这篇帖子`,
        friend: friend.target
      })
    })
  }

  return friendRecommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

// 辅助函数：获取互动权重
const getEngagementWeight = (type) => {
  const weights = {
    'like': 1,
    'love': 2,
    'laugh': 1.5,
    'wow': 1.5,
    'sad': 1,
    'angry': 0.5
  }
  return weights[type] || 1
}
```

## 性能优化建议

### 1. 查询优化

```javascript
// ✅ 好的查询方式 - 只获取需要的字段
const userBasicInfo = await system.storage.findOne(
  'User',
  BoolExp.atom({ key: 'id', value: ['=', userId] }),
  undefined,
  ['id', 'username', 'displayName', 'avatar']  // 只获取需要的字段
)

// ❌ 避免的查询方式 - 获取所有字段（包括计算属性）
const userAllInfo = await system.storage.findOne(
  'User',
  BoolExp.atom({ key: 'id', value: ['=', userId] }),
  undefined,
  ['*']  // 会触发所有计算属性的计算
)
```

### 2. 批量操作

```javascript
// ✅ 批量处理点赞
const batchLike = async (userId, postIds) => {
  const promises = postIds.map(postId => 
    controller.callInteraction(likePostInteraction.uuid, {
      user: { id: userId, roles: ['user'] },
      payload: { userId, postId, type: 'like' }
    })
  )
  
  await Promise.all(promises)
}

// 使用事务确保一致性
await controller.transaction(async (trx) => {
  await batchLike(userId, [post1.id, post2.id, post3.id])
})
```

### 3. 缓存策略

```javascript
// 缓存热门内容
const cachedPopularPosts = new Map()

const getPopularPosts = async () => {
  const cacheKey = 'popular_posts'
  const cacheExpiry = 5 * 60 * 1000  // 5分钟

  if (cachedPopularPosts.has(cacheKey)) {
    const cached = cachedPopularPosts.get(cacheKey)
    if (Date.now() - cached.timestamp < cacheExpiry) {
      return cached.data
    }
  }

  const posts = await system.storage.find('Post', {
    isPopular: { $eq: true }
  }, {
    orderBy: [['engagementScore', 'desc']],
    limit: 20
  })

  cachedPopularPosts.set(cacheKey, {
    data: posts,
    timestamp: Date.now()
  })

  return posts
}
```

## 错误处理

### 常见错误处理

```javascript
// 处理交互调用错误
const safeLikePost = async (userId, postId) => {
  try {
    const result = await controller.callInteraction(likePostInteraction.uuid, {
      user: { id: userId, roles: ['user'] },
      payload: { userId, postId, type: 'like' }
    })

    if (result.error) {
      console.error('点赞失败:', result.error)
      return { success: false, error: result.error }
    }

    return { success: true, data: result.data }
  } catch (error) {
    console.error('系统错误:', error)
    return { success: false, error: '系统异常，请稍后重试' }
  }
}

// 处理权限错误
const safeEditPost = async (userId, postId, updates) => {
  try {
    // 先检查权限
    const post = await system.storage.findOne('Post',
      BoolExp.atom({ key: 'id', value: ['=', postId] }))
    
    if (!post) {
      return { success: false, error: '帖子不存在' }
    }

    if (post.author !== userId) {
      return { success: false, error: '没有权限编辑这篇帖子' }
    }

    const result = await controller.callInteraction(editPostInteraction.uuid, {
      user: { id: userId, roles: ['user'] },
      payload: { postId, userId, ...updates }
    })

    return { success: true, data: result.data }
  } catch (error) {
    console.error('编辑帖子失败:', error)
    return { success: false, error: '编辑失败，请稍后重试' }
  }
}
```

## 扩展开发

### 添加新的内容类型

```javascript
// 扩展：添加评论功能
const Comment = Entity.create({
  name: 'Comment',
  properties: [
    Property.create({ name: 'content', type: 'string', required: true }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({
      name: 'likeCount',
      type: 'number',
      computedData: Count.create({ record: 'CommentLike' })
    })
  ]
})

// 评论关系
const PostComments = Relation.create({
  source: Post,
  sourceProperty: 'comments',
  target: Comment,
  targetProperty: 'post',
  relType: '1:n'
})

// 评论交互
const CreateComment = Interaction.create({
  name: 'CreateComment',
  action: Action.create({
    name: 'createComment',
    operation: [{
      type: 'create',
      entity: 'Comment',
      payload: {
        content: '$.content',
        post: '$.postId',
        author: '$.authorId'
      }
    }]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, refEntity: 'User' })
    ]
  })
})
```

### 添加自定义计算

```javascript
// 扩展：添加用户影响力计算
const UserInfluence = Property.create({
  name: 'influenceScore',
  type: 'number',
  computedData: Transform.create({
    source: 'User',
    attributeQuery: ['followerCount', 'postCount', 'friendCount'],
    transform: (user) => {
      // 自定义影响力算法
      const followerWeight = user.followerCount * 2
      const contentWeight = user.postCount * 1.5
      const socialWeight = user.friendCount * 1
      
      return Math.sqrt(followerWeight + contentWeight + socialWeight)
    }
  })
})

// 将新计算添加到User实体
User.properties.push(UserInfluence)
```

通过这个使用指南，你可以快速理解和使用社交内容网络示例的各种功能，并基于此构建更复杂的社交应用。