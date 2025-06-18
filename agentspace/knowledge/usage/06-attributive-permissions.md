# 如何使用定语（Attributive）控制权限

定语（Attributive）是 @interaqt/runtime 中用于权限控制的核心机制。它允许你以声明式的方式定义谁可以执行特定的操作，基于用户的角色、关系或其他动态条件来控制访问权限。

## 理解 Attributive 概念

### 什么是定语

定语是一种描述性的约束条件，用于限制谁可以执行某个操作。在自然语言中，定语用来修饰名词；在 @interaqt/runtime 中，定语用来修饰交互和实体，定义访问规则。

例如：
- "**作者**可以编辑帖子" - "作者" 就是一个定语
- "**管理员**可以删除任何评论" - "管理员" 是一个定语
- "**好友**可以查看私人资料" - "好友" 是一个定语

### 定语的作用

定语系统提供了以下功能：
- **细粒度权限控制**：基于复杂条件的访问控制
- **动态权限判断**：权限可以基于实时数据计算
- **声明式权限定义**：无需编写复杂的权限检查代码
- **自动权限验证**：框架自动执行权限检查

### 定语与传统权限控制的对比

```javascript
// 传统权限控制方式
app.put('/api/posts/:id', async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  
  // 手动权限检查
  const post = await db.posts.findById(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  if (post.authorId !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // 执行更新操作
  const updatedPost = await db.posts.update(postId, req.body);
  res.json(updatedPost);
});

// @interaqt/runtime 定语方式
const UpdatePost = Interaction.create({
  name: 'UpdatePost',
  action: Action.create({
    name: 'updatePost',
    operation: [
      {
        type: 'update',
        entity: 'Post',
        where: { id: '$.postId' },
        payload: {
          title: '$.title',
          content: '$.content'
        }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' }),
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'content', type: 'string' })
    ]
  }),
  // 声明式权限控制
  attributives: [
    Attributive.create({
      name: 'PostAuthor',
      description: '帖子作者',
      condition: (context) => {
        const post = context.getEntity('Post', context.payload.postId);
        return post.author === context.user.id;
      }
    }),
    Attributive.create({
      name: 'Admin',
      description: '管理员',
      condition: (context) => context.user.role === 'admin'
    })
  ]
});
```

## 为交互添加用户定语

### 基于角色的权限

```javascript
import { Attributive } from '@interaqt/runtime';

// 定义角色定语
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: function Admin(target, { user }) {
    return user.role === 'admin';
  }
});

const ModeratorAttributive = Attributive.create({
  name: 'Moderator',
  content: function Moderator(target, { user }) {
    return ['admin', 'moderator'].includes(user.role);
  }
});

// 只有管理员可以删除用户
const DeleteUser = Interaction.create({
  name: 'DeleteUser',
  action: Action.create({
    name: 'deleteUser',
    operation: [
      {
        type: 'delete',
        entity: 'User',
        where: { id: '$.userId' }
      }
    ]
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', type: 'string', isRef: true, refEntity: 'User' })
    ]
  }),
  attributives: [AdminAttributive]
});

// 版主和管理员可以删除评论
const DeleteComment = Interaction.create({
  name: 'DeleteComment',
  attributives: [ModeratorAttributive]
  // ... 其他配置
});
```

### 基于关系的权限

```javascript
// 定义关系定语
const PostAuthorAttributive = Attributive.create({
  name: 'PostAuthor',
  content: async function PostAuthor(this: Controller, post, { user }) {
    const { BoolExp } = this.globals;
    const match = BoolExp.atom({
      key: 'id',
      value: ['=', post.id]
    });
    const postData = await this.system.storage.findOne('Post', match, undefined, [['author', { attributeQuery: ['id'] }]]);
    return postData && postData.author.id === user.id;
  }
});

const CommentAuthorAttributive = Attributive.create({
  name: 'CommentAuthor',
  content: async function CommentAuthor(this: Controller, comment, { user }) {
    const { BoolExp } = this.globals;
    const match = BoolExp.atom({
      key: 'id',
      value: ['=', comment.id]
    });
    const commentData = await this.system.storage.findOne('Comment', match, undefined, [['author', { attributeQuery: ['id'] }]]);
    return commentData && commentData.author.id === user.id;
  }
});

// 只有帖子作者可以编辑帖子
const EditPost = Interaction.create({
  name: 'EditPost',
  attributives: [PostAuthorAttributive],
  // ... 其他配置
});

// 评论作者可以编辑自己的评论
const EditComment = Interaction.create({
  name: 'EditComment',
  attributives: [CommentAuthorAttributive],
  // ... 其他配置
});
```

### 基于复杂关系的权限

```javascript
// 好友关系定语
const FriendAttributive = Attributive.create({
  name: 'Friend',
  content: async function Friend(this: Controller, targetUser, { user }) {
    const { BoolExp } = this.globals;
    
    // 检查是否为好友关系
    const friendship = await this.system.storage.findOne('Friendship', 
      BoolExp.atom({ key: 'source', value: ['=', user.id] })
        .and({ key: 'target', value: ['=', targetUser.id] })
        .and({ key: 'status', value: ['=', 'accepted'] })
    );
    
    return !!friendship;
  }
});

// 项目成员定语
const ProjectMemberAttributive = Attributive.create({
  name: 'ProjectMember',
  description: '项目成员',
  condition: async (context) => {
    const projectId = context.payload.projectId;
    const userId = context.user.id;
    
    const membership = await context.findOne('ProjectMembership', {
      project: projectId,
      user: userId,
      status: 'active'
    });
    
    return !!membership;
  }
});

// 只有好友可以查看私人资料
const ViewPrivateProfile = Interaction.create({
  name: 'ViewPrivateProfile',
  attributives: [FriendAttributive],
  // ... 其他配置
});

// 只有项目成员可以创建任务
const CreateTask = Interaction.create({
  name: 'CreateTask',
  attributives: [ProjectMemberAttributive],
  // ... 其他配置
});
```

### 动态权限判断

```javascript
// 基于时间的权限
const BusinessHoursAttributive = Attributive.create({
  name: 'BusinessHours',
  description: '工作时间',
  condition: (context) => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // 周一到周五，9:00-18:00
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  }
});

// 基于数据状态的权限
const DraftPostAttributive = Attributive.create({
  name: 'DraftPost',
  description: '草稿状态的帖子',
  condition: async (context) => {
    const post = await context.findOne('Post', { id: context.payload.postId });
    return post && post.status === 'draft';
  }
});

// 基于用户状态的权限
const VerifiedUserAttributive = Attributive.create({
  name: 'VerifiedUser',
  description: '已验证用户',
  condition: (context) => {
    return context.user.isVerified === true;
  }
});

// 只有在工作时间内才能提交请假申请
const SubmitLeaveRequest = Interaction.create({
  name: 'SubmitLeaveRequest',
  attributives: [BusinessHoursAttributive],
  // ... 其他配置
});

// 只有已验证用户可以发布帖子
const PublishPost = Interaction.create({
  name: 'PublishPost',
  attributives: [VerifiedUserAttributive],
  // ... 其他配置
});
```

## 为实体添加定语

### 限制实体的创建

```javascript
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: 'draft' })
  ],
  // 只有已验证用户可以创建帖子
  createAttributives: [VerifiedUserAttributive]
});
```

### 限制实体的查询

```javascript
const PrivateMessage = Entity.create({
  name: 'PrivateMessage',
  properties: [
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'sender', type: 'string', isRef: true, refEntity: 'User' }),
    Property.create({ name: 'receiver', type: 'string', isRef: true, refEntity: 'User' })
  ],
  // 只有消息的发送者或接收者可以查看
  readAttributives: [
    Attributive.create({
      name: 'MessageParticipant',
      description: '消息参与者',
      condition: async (context, record) => {
        const userId = context.user.id;
        return record.sender === userId || record.receiver === userId;
      }
    })
  ]
});
```

### 限制实体的更新

```javascript
const UserProfile = Entity.create({
  name: 'UserProfile',
  properties: [
    Property.create({ name: 'bio', type: 'string' }),
    Property.create({ name: 'avatar', type: 'string' }),
    Property.create({ name: 'isPublic', type: 'boolean', defaultValue: true })
  ],
  // 只有用户本人可以更新自己的资料
  updateAttributives: [
    Attributive.create({
      name: 'ProfileOwner',
      description: '资料拥有者',
      condition: async (context, record) => {
        return record.user === context.user.id;
      }
    })
  ]
});
```

## 组合多个定语

### AND 逻辑组合

```javascript
// 需要同时满足多个条件
const AdminAndBusinessHours = Interaction.create({
  name: 'SystemMaintenance',
  attributives: [
    AdminAttributive,
    BusinessHoursAttributive
  ],  // 默认是 AND 逻辑：必须既是管理员又在工作时间
  // ... 其他配置
});
```

### OR 逻辑组合

```javascript
// 满足任一条件即可
const EditPostAttributive = Attributive.create({
  name: 'CanEditPost',
  description: '可以编辑帖子',
  condition: async (context) => {
    const post = await context.findOne('Post', { id: context.payload.postId });
    
    // 是作者 OR 是管理员
    return post.author === context.user.id || context.user.role === 'admin';
  }
});

const EditPost = Interaction.create({
  name: 'EditPost',
  attributives: [EditPostAttributive],
  // ... 其他配置
});
```

### 复杂权限规则

```javascript
// 复杂的权限组合
const ComplexPermissionAttributive = Attributive.create({
  name: 'ComplexPermission',
  description: '复杂权限',
  condition: async (context) => {
    const user = context.user;
    const payload = context.payload;
    
    // 管理员可以执行任何操作
    if (user.role === 'admin') {
      return true;
    }
    
    // 版主可以在工作时间执行操作
    if (user.role === 'moderator') {
      const now = new Date();
      const hour = now.getHours();
      return hour >= 9 && hour < 18;
    }
    
    // 普通用户只能操作自己的数据
    if (user.role === 'user') {
      const resource = await context.findOne('Resource', { id: payload.resourceId });
      return resource && resource.owner === user.id;
    }
    
    return false;
  }
});
```

## 条件表达式和高级用法

### 使用条件表达式

```javascript
const ConditionalAttributive = Attributive.create({
  name: 'ConditionalAccess',
  description: '条件访问',
  condition: async (context) => {
    const user = context.user;
    const payload = context.payload;
    
    // 基于用户等级的权限
    if (user.level >= 5) {
      return true;
    }
    
    // 基于用户积分的权限
    if (user.points >= 1000) {
      return true;
    }
    
    // 基于用户注册时间的权限
    const registrationDate = new Date(user.createdAt);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (registrationDate < thirtyDaysAgo) {
      return true;
    }
    
    return false;
  }
});
```

### 基于实体状态的权限

```javascript
const EntityStateAttributive = Attributive.create({
  name: 'EntityState',
  description: '基于实体状态的权限',
  condition: async (context) => {
    const entityId = context.payload.entityId;
    const entity = await context.findOne('SomeEntity', { id: entityId });
    
    if (!entity) {
      return false;
    }
    
    // 基于实体的状态和用户的关系
    switch (entity.status) {
      case 'draft':
        return entity.author === context.user.id;
      case 'published':
        return true;  // 所有人都可以访问已发布的内容
      case 'archived':
        return context.user.role === 'admin';
      default:
        return false;
    }
  }
});
```

### 基于时间窗口的权限

```javascript
const TimeWindowAttributive = Attributive.create({
  name: 'TimeWindow',
  description: '时间窗口权限',
  condition: async (context) => {
    const user = context.user;
    const now = new Date();
    
    // 检查用户的访问时间窗口
    if (user.accessSchedule) {
      const schedule = user.accessSchedule;
      const currentHour = now.getHours();
      const currentDay = now.getDay();
      
      return schedule.days.includes(currentDay) &&
             currentHour >= schedule.startHour &&
             currentHour < schedule.endHour;
    }
    
    return false;
  }
});
```

## 权限缓存和性能优化

### 权限结果缓存

```javascript
const CachedAttributive = Attributive.create({
  name: 'CachedPermission',
  description: '缓存权限',
  condition: async (context) => {
    const cacheKey = `permission:${context.user.id}:${context.interaction.name}`;
    
    // 检查缓存
    const cached = await context.cache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    // 执行权限检查
    const hasPermission = await performExpensivePermissionCheck(context);
    
    // 缓存结果（5分钟）
    await context.cache.set(cacheKey, hasPermission, 300);
    
    return hasPermission;
  }
});
```

### 批量权限检查

```javascript
const BatchPermissionAttributive = Attributive.create({
  name: 'BatchPermission',
  description: '批量权限检查',
  condition: async (context) => {
    const userId = context.user.id;
    const resourceIds = context.payload.resourceIds;
    
    // 批量查询用户对这些资源的权限
    const permissions = await context.find('Permission', {
      user: userId,
      resource: { $in: resourceIds },
      status: 'active'
    });
    
    // 检查是否对所有资源都有权限
    return permissions.length === resourceIds.length;
  }
});
```

## 错误处理和调试

### 权限错误处理

```javascript
const SafeAttributive = Attributive.create({
  name: 'SafePermission',
  description: '安全权限检查',
  condition: async (context) => {
    try {
      // 执行权限检查逻辑
      const hasPermission = await checkComplexPermission(context);
      return hasPermission;
    } catch (error) {
      // 记录错误但不阻止执行
      console.error('Permission check error:', error);
      
      // 在权限检查出错时，可以选择默认拒绝或允许
      return false;  // 默认拒绝
    }
  }
});
```

### 权限调试

```javascript
const DebuggableAttributive = Attributive.create({
  name: 'DebuggablePermission',
  description: '可调试权限',
  condition: async (context) => {
    const user = context.user;
    const payload = context.payload;
    
    console.log('权限检查开始:', {
      user: user.id,
      role: user.role,
      interaction: context.interaction.name,
      payload: payload
    });
    
    const hasPermission = await performPermissionCheck(context);
    
    console.log('权限检查结果:', {
      userId: user.id,
      hasPermission: hasPermission,
      reason: hasPermission ? '权限通过' : '权限拒绝'
    });
    
    return hasPermission;
  }
});
```

## 最佳实践

### 1. 权限粒度设计

```javascript
// ✅ 合适的权限粒度
const PostAuthorAttributive = Attributive.create({
  name: 'PostAuthor',
  condition: async (context) => {
    const post = await context.findOne('Post', { id: context.payload.postId });
    return post.author === context.user.id;
  }
});

// ❌ 过于细粒度的权限
const PostAuthorOnMondayAttributive = Attributive.create({
  name: 'PostAuthorOnMonday',
  condition: async (context) => {
    const post = await context.findOne('Post', { id: context.payload.postId });
    const isMonday = new Date().getDay() === 1;
    return post.author === context.user.id && isMonday;
  }
});
```

### 2. 权限命名规范

```javascript
// ✅ 清晰的命名
const ResourceOwnerAttributive = Attributive.create({ name: 'ResourceOwner' });
const AdminAttributive = Attributive.create({ name: 'Admin' });
const ProjectMemberAttributive = Attributive.create({ name: 'ProjectMember' });

// ❌ 模糊的命名
const CheckAttributive = Attributive.create({ name: 'Check' });
const ValidAttributive = Attributive.create({ name: 'Valid' });
const OkAttributive = Attributive.create({ name: 'Ok' });
```

### 3. 性能考虑

```javascript
// ✅ 高效的权限检查
const EfficientAttributive = Attributive.create({
  name: 'Efficient',
  condition: async (context) => {
    // 先检查简单条件
    if (context.user.role === 'admin') {
      return true;
    }
    
    // 再检查复杂条件
    return await checkComplexCondition(context);
  }
});

// ❌ 低效的权限检查
const InefficientAttributive = Attributive.create({
  name: 'Inefficient',
  condition: async (context) => {
    // 总是执行复杂查询
    const complexResult = await performExpensiveQuery(context);
    return complexResult || context.user.role === 'admin';
  }
});
```

### 4. 错误处理

```javascript
// ✅ 适当的错误处理
const RobustAttributive = Attributive.create({
  name: 'Robust',
  condition: async (context) => {
    try {
      return await checkPermission(context);
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;  // 默认拒绝
    }
  }
});
```

定语系统为 @interaqt/runtime 提供了强大而灵活的权限控制机制。通过合理设计和使用定语，可以实现复杂的权限控制逻辑，同时保持代码的清晰和可维护性。 