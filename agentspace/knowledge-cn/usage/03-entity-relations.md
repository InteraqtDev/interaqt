# 如何建立实体关系

关系（Relation）是连接不同实体的桥梁，它定义了实体之间的关联方式。interaqt 支持多种类型的关系，包括一对一、一对多、多对多和对称关系。

## 重要提示：关系名称自动生成

创建关系时，**不需要指定 `name` 属性**。框架会根据源实体和目标实体自动生成关系名称。例如：
- `User` 和 `Post` 之间的关系会自动命名为 `UserPost`
- `Post` 和 `Comment` 之间的关系会自动命名为 `PostComment`

```javascript
// ✅ 正确：不指定 name
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});

// ❌ 错误：不要指定 name
const UserPosts = Relation.create({
  name: 'UserPost',  // 不要这样做 - name 是自动生成的
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});
```

## 创建一对一关系

一对一关系表示两个实体之间的唯一对应关系，如用户与个人资料的关系。

### 基本一对一关系

```javascript
import { Entity, Property, Relation } from 'interaqt';

// 定义用户实体
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'email', type: 'string', unique: true }),
    Property.create({ name: 'name', type: 'string' })
  ]
});

// 定义个人资料实体
const Profile = Entity.create({
  name: 'Profile',
  properties: [
    Property.create({ name: 'bio', type: 'string' }),
    Property.create({ name: 'avatar', type: 'string' }),
    Property.create({ name: 'website', type: 'string' })
  ]
});

// 创建一对一关系
const UserProfile = Relation.create({
  source: User,
  sourceProperty: 'profile',
  target: Profile,
  targetProperty: 'user',
  type: '1:1'
});
```

### 关系的方向性

在一对一关系中，你可以从任一端访问另一端：

```javascript
// 从用户访问个人资料
const user = await controller.findOne('User', { email: 'john@example.com' });
const profile = user.profile;  // 获取关联的个人资料

// 从个人资料访问用户
const profile = await controller.findOne('Profile', { id: profileId });
const user = profile.user;  // 获取关联的用户
```

### 创建和管理一对一关系

```javascript
// 创建用户和个人资料，并建立关系
const createUserWithProfile = async (userData, profileData) => {
  // 首先创建用户
  const user = await controller.create('User', userData);
  
  // 创建个人资料并关联到用户
  const profile = await controller.create('Profile', {
    ...profileData,
    user: user.id  // 建立关系
  });
  
  return { user, profile };
};

// 使用示例
const { user, profile } = await createUserWithProfile(
  { email: 'john@example.com', name: 'John Doe' },
  { bio: 'Software developer', website: 'https://johndoe.dev' }
);
```

## 创建一对多关系

一对多关系表示一个实体可以关联多个另一个实体的实例，如用户与帖子的关系。

### 基本一对多关系

```javascript
// 用户实体（已定义）
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'email', type: 'string', unique: true }),
    Property.create({ name: 'name', type: 'string' })
  ]
});

// 帖子实体
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

// 创建一对多关系
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});
```

### 在"一"端访问"多"端

```javascript
// 获取用户的所有帖子
const user = await controller.findOne('User', { email: 'john@example.com' });
const posts = user.posts;  // 获取用户的所有帖子

// 也可以使用查询方式
const userPosts = await controller.find('Post', { 
  author: user.id 
});
```

### 在"多"端访问"一"端

```javascript
// 获取帖子的作者
const post = await controller.findOne('Post', { id: postId });
const author = post.author;  // 获取帖子的作者
```

### 创建和管理一对多关系

```javascript
// 为用户创建新帖子
const createPost = async (userId, postData) => {
  return await controller.create('Post', {
    ...postData,
    author: userId  // 建立与用户的关系
  });
};

// 使用示例
const user = await controller.findOne('User', { email: 'john@example.com' });
const post = await createPost(user.id, {
  title: 'My First Post',
  content: 'This is the content of my first post.'
});

// 获取用户的所有帖子（包括刚创建的）
const allUserPosts = await controller.find('Post', { author: user.id });
```

## 创建多对多关系

多对多关系表示两个实体之间的多重关联，如用户与标签的关系。

### 基本多对多关系

```javascript
// 标签实体
const Tag = Entity.create({
  name: 'Tag',
  properties: [
    Property.create({ name: 'name', type: 'string', unique: true }),
    Property.create({ name: 'color', type: 'string', defaultValue: '#666666' })
  ]
});

// 创建多对多关系
const UserTags = Relation.create({
  source: User,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'users',
  type: 'n:n'
});
```

### 关系的双向访问

```javascript
// 从用户访问标签
const user = await controller.findOne('User', { email: 'john@example.com' });
const userTags = user.tags;  // 获取用户的所有标签

// 从标签访问用户
const tag = await controller.findOne('Tag', { name: 'javascript' });
const tagUsers = tag.users;  // 获取使用该标签的所有用户
```

### 管理多对多关系

```javascript
// 为用户添加标签
const addTagToUser = async (userId, tagName) => {
  // 查找或创建标签
  let tag = await controller.findOne('Tag', { name: tagName });
  if (!tag) {
    tag = await controller.create('Tag', { name: tagName });
  }
  
  // 建立关系（具体实现取决于框架的关系管理方式）
  await controller.createRelation('UserTags', {
    source: userId,
    target: tag.id
  });
};

// 移除用户的标签
const removeTagFromUser = async (userId, tagId) => {
  await controller.removeRelation('UserTags', {
    source: userId,
    target: tagId
  });
};

// 使用示例
const user = await controller.findOne('User', { email: 'john@example.com' });
await addTagToUser(user.id, 'javascript');
await addTagToUser(user.id, 'react');
await addTagToUser(user.id, 'nodejs');
```

### 关系属性的添加

多对多关系可以包含额外的属性：

```javascript
// 用户与帖子的点赞关系（包含点赞时间）
const Like = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likers',
  type: 'n:n',
  properties: [
    Property.create({ 
      name: 'likedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString() 
    }),
    Property.create({ 
      name: 'type', 
      type: 'string', 
      defaultValue: () => 'like'  // 可以是 'like', 'love', 'laugh' 等
    })
  ]
});

// 创建带属性的关系
const likePost = async (userId, postId, likeType = 'like') => {
  await controller.createRelation('Like', {
    source: userId,
    target: postId,
    properties: {
      type: likeType,
      likedAt: new Date().toISOString()
    }
  });
};
```

## 使用对称关系

对称关系是一种特殊的多对多关系，其中关系的两端是相同的实体类型，如好友关系。

### 创建对称关系

```javascript
// 好友关系
const Friendship = Relation.create({
  source: User,
  sourceProperty: 'friends',
  target: User,
  targetProperty: 'friends',
  type: 'n:n',
  symmetric: true,  // 标记为对称关系
  properties: [
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: 'pending'  // pending, accepted, blocked
    })
  ]
});
```

### 对称关系的特殊性

对称关系具有以下特点：

1. **自动双向同步**：当 A 添加 B 为好友时，B 的好友列表中也会自动包含 A
2. **单一关系记录**：系统只存储一条关系记录，但两端都可以访问
3. **状态一致性**：关系状态对双方都是一致的

```javascript
// 发送好友请求
const sendFriendRequest = async (fromUserId, toUserId) => {
  await controller.createRelation('Friendship', {
    source: fromUserId,
    target: toUserId,
    properties: {
      status: 'pending'
    }
  });
};

// 接受好友请求
const acceptFriendRequest = async (userId, friendId) => {
  await controller.updateRelation('Friendship', {
    source: userId,
    target: friendId
  }, {
    status: 'accepted'
  });
};

// 获取用户的好友列表
const getUserFriends = async (userId) => {
  const user = await controller.findOne('User', { id: userId });
  return user.friends.filter(friend => friend.status === 'accepted');
};
```

### 自动双向同步示例

```javascript
// 用户 A 添加用户 B 为好友
const userA = await controller.findOne('User', { email: 'alice@example.com' });
const userB = await controller.findOne('User', { email: 'bob@example.com' });

await sendFriendRequest(userA.id, userB.id);

// 现在两个用户都可以看到这个关系
const aliceFriends = await getUserFriends(userA.id);  // 包含 Bob（状态为 pending）
const bobFriends = await getUserFriends(userB.id);    // 包含 Alice（状态为 pending）

// Bob 接受好友请求
await acceptFriendRequest(userB.id, userA.id);

// 现在两个用户都是已接受的好友状态
const aliceFriendsAccepted = await getUserFriends(userA.id);  // Bob（状态为 accepted）
const bobFriendsAccepted = await getUserFriends(userB.id);    // Alice（状态为 accepted）
```

## 关系查询和优化

### 预加载关联数据

为了避免 N+1 查询问题，可以预加载关联数据：

```javascript
// 查询用户时同时加载帖子
const usersWithPosts = await controller.find('User', {}, {
  include: ['posts']
});

// 查询帖子时同时加载作者和标签
const postsWithDetails = await controller.find('Post', {}, {
  include: ['author', 'tags']
});
```

### 深度查询

可以进行多层级的关联查询：

```javascript
// 查询用户，包含其帖子和帖子的评论
const usersWithPostsAndComments = await controller.find('User', {}, {
  include: [
    {
      relation: 'posts',
      include: ['comments']
    }
  ]
});
```

### 关系条件查询

可以基于关联数据进行查询：

```javascript
// 查找有超过 10 篇帖子的用户
const activeUsers = await controller.find('User', {
  'posts.count': { $gt: 10 }
});

// 查找被特定用户点赞的帖子
const likedPosts = await controller.find('Post', {
  'likers.id': userId
});
```

## 关系管理最佳实践

### 1. 合理设计关系方向

```javascript
// ✅ 好的设计：从拥有者指向被拥有者
const UserPosts = Relation.create({
  source: User,        // 用户拥有帖子
  target: Post,
  type: '1:n'
});

// ❌ 避免的设计：方向不明确
const PostUser = Relation.create({
  source: Post,        // 帖子属于用户（方向不够直观）
  target: User,
  type: 'n:1'
});
```

### 2. 使用有意义的属性名

```javascript
// ✅ 清晰的属性名
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',      // 用户的帖子
  target: Post,
  targetProperty: 'author',     // 帖子的作者
  type: '1:n'
});
```

### 3. 适当使用关系属性

```javascript
// ✅ 为关系添加有用的元数据
const Membership = Relation.create({
  source: User,
  target: Organization,
  type: 'n:n',
  properties: [
    Property.create({ name: 'role', type: 'string' }),           // 角色
    Property.create({ name: 'joinedAt', type: 'string' }),       // 加入时间
    Property.create({ name: 'isActive', type: 'boolean' })       // 是否活跃
  ]
});
```

### 4. 考虑性能影响

```javascript
// 关系定义示例（索引应该在数据库层面配置）
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
  // 索引配置应该在数据库层面进行
});
```

## 完整示例：博客系统的关系设计

```javascript
import { Entity, Property, Relation } from 'interaqt';

// 实体定义
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'email', type: 'string', unique: true }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'avatar', type: 'string' })
  ]
});

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: 'draft' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

const Comment = Entity.create({
  name: 'Comment',
  properties: [
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

const Tag = Entity.create({
  name: 'Tag',
  properties: [
    Property.create({ name: 'name', type: 'string', unique: true }),
    Property.create({ name: 'color', type: 'string', defaultValue: '#666666' })
  ]
});

// 关系定义
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});

const PostComments = Relation.create({
  source: Post,
  sourceProperty: 'comments',
  target: Comment,
  targetProperty: 'post',
  type: 'n:1'
});

const UserComments = Relation.create({
  source: User,
  sourceProperty: 'comments',
  target: Comment,
  targetProperty: 'author',
  type: 'n:1'
});

const PostTags = Relation.create({
  source: Post,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'posts',
  type: 'n:n'
});

const Like = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likers',
  type: 'n:n',
  properties: [
    Property.create({ name: 'likedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

const Follow = Relation.create({
  source: User,
  sourceProperty: 'following',
  target: User,
  targetProperty: 'followers',
  type: 'n:n',
  properties: [
    Property.create({ name: 'followedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

export {
  User, Post, Comment, Tag,
  UserPosts, PostComments, UserComments, PostTags, Like, Follow
};
``` 