# 如何使用定语（Attributive）控制权限

定语（Attributive）是 interaqt 中用于权限控制的核心机制。它允许你以声明式的方式定义谁可以执行特定的操作，基于用户的角色、关系或其他动态条件来控制访问权限。

## 理解 Attributive 概念

### 什么是定语

定语是一种描述性的约束条件，用于限制谁可以执行某个操作。在自然语言中，定语用来修饰名词；在 interaqt 中，定语用来修饰交互和实体，定义访问规则。

例如：
- "**作者**可以编辑帖子" - "作者" 就是一个定语
- "**管理员**可以删除任何评论" - "管理员" 是一个定语
- "**好友**可以查看私人资料" - "好友" 是一个定语

### Attributive 的核心结构

```javascript
const MyAttributive = Attributive.create({
  name: 'MyAttributive',  // 定语的名称
  content: function(targetUser, eventArgs) {
    // targetUser: 第一个参数，在 userAttributives 中通常是当前用户
    //            在 payload attributives 中是 payload item 的值
    // eventArgs: 包含 user、payload、query 等交互事件信息
    // this: 绑定到 Controller 实例，可以访问 system、globals 等
    
    // 返回 true 表示权限通过，false 表示拒绝
    return true;
  }
});
```

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

// interaqt 定语方式
const UpdatePost = Interaction.create({
  name: 'UpdatePost',
  action: Action.create({
    name: 'updatePost'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, base: Post }),
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'content', type: 'string' })
    ]
  }),
  // 声明式权限控制 - 作者或管理员可以更新
  userAttributives: BoolExp.atom(PostAuthorAttributive)
    .or(BoolExp.atom(AdminAttributive))
});
```

## 为交互添加用户定语

### 基于角色的权限

```javascript
import { Attributive, BoolExp } from 'interaqt';

// 定义角色定语
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: function Admin(targetUser, eventArgs) {
    // this 绑定到 controller，可以访问 system 和其他工具
    return eventArgs.user.role === 'admin';
  }
});

const ModeratorAttributive = Attributive.create({
  name: 'Moderator',
  content: function Moderator(targetUser, eventArgs) {
    return ['admin', 'moderator'].includes(eventArgs.user.role);
  }
});

// 只有管理员可以删除用户
const DeleteUser = Interaction.create({
  name: 'DeleteUser',
  action: Action.create({
    name: 'deleteUser'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', type: 'string', isRef: true, base: User })
    ]
  }),
  userAttributives: AdminAttributive
});

// 版主和管理员可以删除评论
const DeleteComment = Interaction.create({
  name: 'DeleteComment',
  userAttributives: ModeratorAttributive,
  // ... 其他配置
});
```

### 基于关系的权限

```javascript
// 定义关系定语
const PostAuthorAttributive = Attributive.create({
  name: 'PostAuthor',
  content: async function PostAuthor(targetUser, eventArgs) {
    // this 是 controller 实例
    const { MatchExp } = this.globals;
    const postId = eventArgs.payload.postId;
    
    const match = MatchExp.atom({
      key: 'id',
      value: ['=', postId]
    });
    
    const postData = await this.system.storage.findOne('Post', match, undefined, [['author', { attributeQuery: ['id'] }]]);
    return postData && postData.author.id === eventArgs.user.id;
  }
});

const CommentAuthorAttributive = Attributive.create({
  name: 'CommentAuthor',
  content: async function CommentAuthor(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const commentId = eventArgs.payload.commentId;
    
    const match = MatchExp.atom({
      key: 'id',
      value: ['=', commentId]
    });
    
    const commentData = await this.system.storage.findOne('Comment', match, undefined, [['author', { attributeQuery: ['id'] }]]);
    return commentData && commentData.author.id === eventArgs.user.id;
  }
});

// 只有帖子作者可以编辑帖子
const EditPost = Interaction.create({
  name: 'EditPost',
  userAttributives: PostAuthorAttributive,
  // ... 其他配置
});

// 评论作者可以编辑自己的评论
const EditComment = Interaction.create({
  name: 'EditComment',
  userAttributives: CommentAuthorAttributive,
  // ... 其他配置
});
```

### 基于复杂关系的权限

```javascript
// 好友关系定语
const FriendAttributive = Attributive.create({
  name: 'Friend',
  content: async function Friend(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const targetUserId = eventArgs.payload.targetUserId;
    
    // 检查是否为好友关系
    const friendship = await this.system.storage.findOne('Friendship', 
      MatchExp.atom({ key: 'source', value: ['=', eventArgs.user.id] })
        .and({ key: 'target', value: ['=', targetUserId] })
        .and({ key: 'status', value: ['=', 'accepted'] })
    );
    
    return !!friendship;
  }
});

// 项目成员定语
const ProjectMemberAttributive = Attributive.create({
  name: 'ProjectMember',
  content: async function ProjectMember(targetUser, eventArgs) {
    const projectId = eventArgs.payload.projectId;
    const userId = eventArgs.user.id;
    const { MatchExp } = this.globals;
    
    const membership = await this.system.storage.findOne('ProjectMembership',
      MatchExp.atom({ key: 'project', value: ['=', projectId] })
        .and({ key: 'user', value: ['=', userId] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    
    return !!membership;
  }
});

// 只有好友可以查看私人资料
const ViewPrivateProfile = Interaction.create({
  name: 'ViewPrivateProfile',
  userAttributives: FriendAttributive,
  // ... 其他配置
});

// 只有项目成员可以创建任务
const CreateTask = Interaction.create({
  name: 'CreateTask',
  userAttributives: ProjectMemberAttributive,
  // ... 其他配置
});
```

### 动态权限判断

```javascript
// 基于时间的权限
const BusinessHoursAttributive = Attributive.create({
  name: 'BusinessHours',
  content: function BusinessHours(targetUser, eventArgs) {
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
  content: async function DraftPost(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const post = await this.system.storage.findOne('Post', 
      MatchExp.atom({ key: 'id', value: ['=', eventArgs.payload.postId] })
    );
    return post && post.status === 'draft';
  }
});

// 基于用户状态的权限
const VerifiedUserAttributive = Attributive.create({
  name: 'VerifiedUser',
  content: function VerifiedUser(targetUser, eventArgs) {
    return eventArgs.user.isVerified === true;
  }
});

// 只有在工作时间内才能提交请假申请
const SubmitLeaveRequest = Interaction.create({
  name: 'SubmitLeaveRequest',
  userAttributives: BusinessHoursAttributive,
  // ... 其他配置
});

// 只有已验证用户可以发布帖子
const PublishPost = Interaction.create({
  name: 'PublishPost',
  userAttributives: VerifiedUserAttributive,
  // ... 其他配置
});
```

## 为 Payload 添加定语限制

除了限制谁可以执行交互，你还可以限制交互的具体参数必须满足的条件：

```javascript
// 定义一个限制：只能编辑自己创建的内容
const OwnContentAttributive = Attributive.create({
  name: 'OwnContent',
  content: async function OwnContent(content, eventArgs) {
    // content 是 payload item 的值
    return content.author === eventArgs.user.id;
  }
});

// 定义一个限制：内容必须是草稿状态
const DraftContentAttributive = Attributive.create({
  name: 'DraftContent',
  content: async function DraftContent(content, eventArgs) {
    return content.status === 'draft';
  }
});

// 在交互中使用 payload 定语
const EditDraft = Interaction.create({
  name: 'EditDraft',
  action: Action.create({ name: 'editDraft' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'content',
        type: 'string',
        isRef: true,
        base: Post,
        // 限制只能编辑自己的草稿内容
        attributives: BoolExp.atom(OwnContentAttributive)
          .and(BoolExp.atom(DraftContentAttributive))
      }),
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'body', type: 'string' })
    ]
  })
});
```

## 通过交互控制实体操作权限

在 interaqt 中，实体级别的权限控制是通过交互（Interaction）来实现的，而不是直接在实体定义上。以下是如何限制实体的创建、查询和更新：

### 限制实体的创建

```javascript
// 定义只有已验证用户可以创建帖子
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true }),
      PayloadItem.create({ name: 'authorId', type: 'string', isRef: true, base: User })
    ]
  }),
  // 只有已验证用户可以执行
  userAttributives: VerifiedUserAttributive
});

// 通过 Relation 的 computedData 创建实体
const UserPostRelation = Relation.create({
  source: Post,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'posts',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreatePost') {
        return {
          source: {
            title: event.payload.title,
            content: event.payload.content,
            status: 'draft'
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});
```

### 限制实体的查询

```javascript
// 定义消息参与者权限
const MessageParticipantAttributive = Attributive.create({
  name: 'MessageParticipant',
  content: async function MessageParticipant(targetUser, eventArgs) {
    const messageId = eventArgs.query?.match?.id || eventArgs.payload?.messageId;
    const { MatchExp } = this.globals;
    
    const message = await this.system.storage.findOne('PrivateMessage',
      MatchExp.atom({ key: 'id', value: ['=', messageId] })
    );
    
    const userId = eventArgs.user.id;
    return message && (message.sender === userId || message.receiver === userId);
  }
});

// 查询私人消息的交互
const ViewPrivateMessages = Interaction.create({
  name: 'ViewPrivateMessages',
  action: GetAction, // 使用内置的查询 Action
  data: PrivateMessage,
  // 只有消息参与者可以查看
  userAttributives: MessageParticipantAttributive
});
```

### 限制实体的更新

```javascript
// 定义资料拥有者权限
const ProfileOwnerAttributive = Attributive.create({
  name: 'ProfileOwner',
  content: async function ProfileOwner(targetUser, eventArgs) {
    const profileId = eventArgs.payload.profileId;
    const { MatchExp } = this.globals;
    
    const profile = await this.system.storage.findOne('UserProfile',
      MatchExp.atom({ key: 'id', value: ['=', profileId] })
    );
    
    return profile && profile.userId === eventArgs.user.id;
  }
});

// 更新用户资料的交互
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({ name: 'updateProfile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'profileId', 
        type: 'string', 
        isRef: true, 
        base: UserProfile,
        required: true
      }),
      PayloadItem.create({ name: 'bio', type: 'string' }),
      PayloadItem.create({ name: 'avatar', type: 'string' })
    ]
  }),
  // 只有资料拥有者可以更新
  userAttributives: ProfileOwnerAttributive
});
```

## 组合多个定语

interaqt 的一个强大特性是能够在 Interaction 定义中直接使用 BoolExp 来组合多个原子 Attributive。Controller 会自动识别和处理这些组合，按照布尔逻辑执行权限检查。

### AND 逻辑组合

```javascript
// 需要同时满足多个条件
const AdminAndBusinessHours = Interaction.create({
  name: 'SystemMaintenance',
  userAttributives: BoolExp.atom(AdminAttributive)
    .and(BoolExp.atom(BusinessHoursAttributive))
});
```

### OR 逻辑组合

```javascript
// 满足任一条件即可
const EditPostAttributive = Attributive.create({
  name: 'CanEditPost',
  content: async function CanEditPost(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const post = await this.system.storage.findOne('Post',
      MatchExp.atom({ key: 'id', value: ['=', eventArgs.payload.postId] })
    );
    
    // 是作者 OR 是管理员
    return post && (post.author === eventArgs.user.id || eventArgs.user.role === 'admin');
  }
});

const EditPost = Interaction.create({
  name: 'EditPost',
  userAttributives: EditPostAttributive,
  // ... 其他配置
});

// 或者使用 BoolExp 组合多个 Attributive
const EditPostV2 = Interaction.create({
  name: 'EditPostV2',
  userAttributives: BoolExp.atom(PostAuthorAttributive)
    .or(BoolExp.atom(AdminAttributive)),
  // ... 其他配置
});
```

### 复杂权限规则

```javascript
// 复杂的权限组合
const ComplexPermissionAttributive = Attributive.create({
  name: 'ComplexPermission',
  content: async function ComplexPermission(targetUser, eventArgs) {
    const user = eventArgs.user;
    const payload = eventArgs.payload;
    
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
      const resource = await this.system.storage.findOne('Resource',
        MatchExp.atom({ key: 'id', value: ['=', payload.resourceId] })
      );
      return resource && resource.owner === user.id;
    }
    
    return false;
  }
});
```

## 使用 BoolExp 构建复杂权限条件

在 interaqt 中，`userAttributives` 和 PayloadItem 的 `attributives` 都支持直接使用 BoolExp 来组合多个原子 Attributive。Controller 会自动识别并处理这些 BoolExp 表达式，让你能够灵活地构建复杂的权限规则。

### BoolExp 组合 Attributive 的核心概念

```javascript
import { BoolExp, Attributive, Attributives } from 'interaqt';

// 1. 定义原子 Attributive（每个只负责一个简单的权限检查）
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: function(targetUser, eventArgs) {
    return eventArgs.user.role === 'admin';
  }
});

const OwnerAttributive = Attributive.create({
  name: 'Owner',
  content: async function(targetUser, eventArgs) {
    const resourceId = eventArgs.payload.resourceId;
    const resource = await this.system.storage.findOne('Resource', 
      MatchExp.atom({ key: 'id', value: ['=', resourceId] })
    );
    return resource && resource.ownerId === eventArgs.user.id;
  }
});

const ActiveUserAttributive = Attributive.create({
  name: 'ActiveUser',
  content: function(targetUser, eventArgs) {
    return eventArgs.user.status === 'active';
  }
});

// 2. 在 Interaction 中使用 BoolExp 组合这些原子 Attributive
const UpdateResource = Interaction.create({
  name: 'UpdateResource',
  action: Action.create({ name: 'updateResource' }),
  // 必须是活跃用户 AND (管理员 OR 资源拥有者)
  userAttributives: BoolExp.atom(ActiveUserAttributive)
    .and(
      BoolExp.atom(AdminAttributive)
        .or(BoolExp.atom(OwnerAttributive))
    ),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'resourceId', 
        type: 'string', 
        isRef: true, 
        base: Resource 
      })
    ]
  })
});
```

### 在 userAttributives 中使用 BoolExp

Controller 会自动解析 userAttributives 中的 BoolExp 表达式，按照布尔逻辑执行每个原子 Attributive 的检查：

```javascript
// 示例1：简单的 OR 逻辑
const DeleteComment = Interaction.create({
  name: 'DeleteComment',
  // 管理员或评论作者可以删除
  userAttributives: BoolExp.atom(AdminAttributive)
    .or(BoolExp.atom(CommentAuthorAttributive)),
  // ... 其他配置
});

// 示例2：复杂的嵌套逻辑
// (管理员) OR (版主 AND 工作时间) AND (不是黑名单用户)
const ModerateContent = Interaction.create({
  name: 'ModerateContent',
  userAttributives: BoolExp.atom(AdminAttributive)
    .or(
      BoolExp.atom(ModeratorAttributive)
        .and(BoolExp.atom(BusinessHoursAttributive))
    )
    .and(BoolExp.atom(NotBlacklistedAttributive)),
  // ... 其他配置
});

// 各个原子 Attributive 的定义
const NotBlacklistedAttributive = Attributive.create({
  name: 'NotBlacklisted',
  content: async function NotBlacklisted(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const blacklistEntry = await this.system.storage.findOne('Blacklist',
      MatchExp.atom({ key: 'userId', value: ['=', eventArgs.user.id] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !blacklistEntry;
  }
});

const BusinessHoursAttributive = Attributive.create({
  name: 'BusinessHours',
  content: function(targetUser, eventArgs) {
    const hour = new Date().getHours();
    return hour >= 9 && hour < 18;
  }
});
```

### 在 PayloadItem 的 attributives 中使用 BoolExp

同样的，PayloadItem 的 attributives 也支持 BoolExp 组合：

```javascript
const PublishArticle = Interaction.create({
  name: 'PublishArticle',
  action: Action.create({ name: 'publishArticle' }),
  userAttributives: EditorAttributive, // 只有编辑可以发布
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'article',
        type: 'object',
        isRef: true,
        base: Article,
        // 文章必须满足：(自己创建的 OR 被授权编辑的) AND 处于草稿状态
        attributives: BoolExp.atom(OwnArticleAttributive)
          .or(BoolExp.atom(AuthorizedToEditAttributive))
          .and(BoolExp.atom(DraftStatusAttributive))
      })
    ]
  })
});

// 原子 Attributive 定义
const OwnArticleAttributive = Attributive.create({
  name: 'OwnArticle',
  content: function(article, eventArgs) {
    return article.authorId === eventArgs.user.id;
  }
});

const AuthorizedToEditAttributive = Attributive.create({
  name: 'AuthorizedToEdit',
  content: async function(article, eventArgs) {
    const { MatchExp } = this.globals;
    const permission = await this.system.storage.findOne('ArticleEditPermission',
      MatchExp.atom({ key: 'articleId', value: ['=', article.id] })
        .and({ key: 'userId', value: ['=', eventArgs.user.id] })
        .and({ key: 'expiresAt', value: ['>', new Date().toISOString()] })
    );
    return !!permission;
  }
});

const DraftStatusAttributive = Attributive.create({
  name: 'DraftStatus',
  content: function(article, eventArgs) {
    return article.status === 'draft';
  }
});
```

### 原子性设计的重要性

使用 BoolExp 组合 Attributive 的关键是保持每个 Attributive 的原子性——每个 Attributive 只负责一个具体的权限检查：

```javascript
// ✅ 好的设计：原子性 Attributive
const IsManagerAttributive = Attributive.create({
  name: 'IsManager',
  content: function(targetUser, eventArgs) {
    return eventArgs.user.role === 'manager';
  }
});

const InDepartmentAttributive = Attributive.create({
  name: 'InDepartment',
  content: function(targetUser, eventArgs) {
    const departmentId = eventArgs.payload.departmentId;
    return eventArgs.user.departmentId === departmentId;
  }
});

const HasBudgetApprovalAttributive = Attributive.create({
  name: 'HasBudgetApproval',
  content: async function(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const approval = await this.system.storage.findOne('BudgetApproval',
      MatchExp.atom({ key: 'userId', value: ['=', eventArgs.user.id] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !!approval;
  }
});

// 然后在 Interaction 中组合使用
const ApproveDepartmentBudget = Interaction.create({
  name: 'ApproveDepartmentBudget',
  // 必须是经理 AND 在对应部门 AND 有预算审批权限
  userAttributives: BoolExp.atom(IsManagerAttributive)
    .and(BoolExp.atom(InDepartmentAttributive))
    .and(BoolExp.atom(HasBudgetApprovalAttributive)),
  // ... 其他配置
});

// ❌ 不好的设计：在单个 Attributive 中混合多个逻辑
const ComplexManagerAttributive = Attributive.create({
  name: 'ComplexManager',
  content: async function(targetUser, eventArgs) {
    // 不要这样做！应该拆分成多个原子 Attributive
    if (eventArgs.user.role !== 'manager') return false;
    if (eventArgs.user.departmentId !== eventArgs.payload.departmentId) return false;
    const approval = await this.system.storage.findOne('BudgetApproval', /*...*/);
    return !!approval;
  }
});
```

### 复杂权限表达式的最佳实践

对于复杂的权限逻辑，可以预先定义好组合，提高可读性和复用性：

```javascript
// 1. 定义基础的原子 Attributive
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: (targetUser, eventArgs) => eventArgs.user.role === 'admin'
});

const ModeratorAttributive = Attributive.create({
  name: 'Moderator',
  content: (targetUser, eventArgs) => eventArgs.user.role === 'moderator'
});

const VerifiedUserAttributive = Attributive.create({
  name: 'VerifiedUser',
  content: (targetUser, eventArgs) => eventArgs.user.isVerified === true
});

const AccountActiveAttributive = Attributive.create({
  name: 'AccountActive',
  content: (targetUser, eventArgs) => eventArgs.user.status === 'active'
});

// 2. 创建可复用的权限组合
const contentModeratorPermission = BoolExp.atom(ModeratorAttributive)
  .and(BoolExp.atom(VerifiedUserAttributive))
  .and(BoolExp.atom(AccountActiveAttributive));

const adminOrModeratorPermission = BoolExp.atom(AdminAttributive)
  .or(contentModeratorPermission);

// 3. 在多个 Interaction 中复用
const DeleteContent = Interaction.create({
  name: 'DeleteContent',
  userAttributives: adminOrModeratorPermission,
  // ... 其他配置
});

const BanUser = Interaction.create({
  name: 'BanUser',
  userAttributives: adminOrModeratorPermission,
  // ... 其他配置
});

// 4. 使用 Attributives 包装（当需要时）
const ComplexPermissionSet = Attributives.create({
  content: adminOrModeratorPermission
    .or(
      BoolExp.atom(ResourceOwnerAttributive)
        .and(BoolExp.atom(VerifiedUserAttributive))
    )
});
```

### 动态构建权限组合

有时需要根据配置或运行时条件动态构建权限组合：

```javascript
// 动态构建权限表达式的工厂函数
function buildResourcePermission(resourceType) {
  // 基础权限：必须是已认证用户
  let basePermission = BoolExp.atom(AuthenticatedAttributive);
  
  switch (resourceType) {
    case 'public':
      // 公开资源：只需要认证
      return basePermission;
      
    case 'protected':
      // 受保护资源：成员或管理员
      return basePermission
        .and(
          BoolExp.atom(MemberAttributive)
            .or(BoolExp.atom(AdminAttributive))
        );
        
    case 'restricted':
      // 限制资源：管理员且在工作时间
      return basePermission
        .and(BoolExp.atom(AdminAttributive))
        .and(BoolExp.atom(BusinessHoursAttributive));
        
    default:
      // 默认拒绝访问
      return BoolExp.atom(Attributive.create({
        name: 'AlwaysDeny',
        content: () => false
      }));
  }
}

// 使用动态权限
const AccessResource = Interaction.create({
  name: 'AccessResource',
  action: Action.create({ name: 'accessResource' }),
  // 根据资源类型动态设置权限
  userAttributives: buildResourcePermission('protected'),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'resourceId', 
        type: 'string',
        isRef: true,
        base: Resource
      })
    ]
  })
});
```

### 权限继承和组合

通过 BoolExp 可以轻松实现权限的继承和组合关系：

```javascript
// 定义基础权限原子
const BaseEmployeeAttributive = Attributive.create({
  name: 'BaseEmployee',
  content: function(targetUser, eventArgs) {
    return eventArgs.user.employeeId && eventArgs.user.status === 'active';
  }
});

const IsDepartmentManagerAttributive = Attributive.create({
  name: 'IsDepartmentManager',
  content: async function(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const dept = await this.system.storage.findOne('Department',
      MatchExp.atom({ key: 'managerId', value: ['=', eventArgs.user.id] })
    );
    return !!dept;
  }
});

const IsFinanceTeamAttributive = Attributive.create({
  name: 'IsFinanceTeam',
  content: function(targetUser, eventArgs) {
    return eventArgs.user.department === 'finance';
  }
});

const IsExecutiveAttributive = Attributive.create({
  name: 'IsExecutive',
  content: function(targetUser, eventArgs) {
    return ['ceo', 'cfo', 'cto'].includes(eventArgs.user.role);
  }
});

// 使用 BoolExp 组合实现权限继承
// 部门经理权限 = 基础员工权限 + 是部门经理
const departmentManagerPermission = BoolExp.atom(BaseEmployeeAttributive)
  .and(BoolExp.atom(IsDepartmentManagerAttributive));

// 审批预算的交互
const ApproveBudget = Interaction.create({
  name: 'ApproveBudget',
  // 部门经理 OR 财务团队 OR 高管 都可以审批
  userAttributives: departmentManagerPermission
    .or(
      BoolExp.atom(BaseEmployeeAttributive)
        .and(BoolExp.atom(IsFinanceTeamAttributive))
    )
    .or(BoolExp.atom(IsExecutiveAttributive)),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'budget',
        type: 'object',
        base: Budget,
        // 预算金额限制
        attributives: BoolExp.atom(BudgetAmountLimitAttributive)
      })
    ]
  })
});

// 为 payload 定义独立的 Attributive
const BudgetAmountLimitAttributive = Attributive.create({
  name: 'BudgetAmountLimit',
  content: function(budget, eventArgs) {
    // 不同角色有不同的审批额度
    if (eventArgs.user.role === 'ceo') return true;
    if (eventArgs.user.role === 'cfo') return budget.amount <= 1000000;
    if (eventArgs.user.role === 'manager') return budget.amount <= 50000;
    if (eventArgs.user.department === 'finance') return budget.amount <= 100000;
    return false;
  }
});
```

### BoolExp 与 Attributive 的设计原则

1. **保持 Attributive 的原子性**
   - 每个 Attributive 只负责一个具体的权限检查
   - 避免在单个 Attributive 中混合多个权限逻辑
   - 使用 BoolExp 在 Interaction 层面组合这些原子检查

2. **在正确的层面使用 BoolExp**
   - 在 `userAttributives` 和 `attributives` 中使用 BoolExp 组合
   - 不要在 Attributive 的 content 函数内部构建复杂的条件逻辑
   - Controller 会自动处理 BoolExp 表达式的解析和执行

3. **提高可读性和可维护性**
   - 为常用的权限组合创建变量，便于复用
   - 使用描述性的 Attributive 名称
   - 添加注释说明复杂的权限逻辑

4. **性能优化考虑**
   - 将简单检查（如角色判断）放在前面，复杂查询放在后面
   - 利用 BoolExp 的短路求值特性（AND 遇到 false 即停止，OR 遇到 true 即停止）
   - 对于频繁使用的权限检查，考虑缓存结果

示例：优化的权限检查顺序
```javascript
// 先检查简单条件，再检查需要数据库查询的条件
const OptimizedPermission = Interaction.create({
  name: 'OptimizedPermission',
  userAttributives: BoolExp.atom(AdminAttributive) // 简单的角色检查
    .or(
      BoolExp.atom(ActiveUserAttributive) // 简单的状态检查
        .and(BoolExp.atom(HasPermissionAttributive)) // 需要数据库查询
        .and(BoolExp.atom(InTimeWindowAttributive)) // 需要计算
    ),
  // ... 其他配置
});
```

## 条件表达式和高级用法

### 使用条件表达式

```javascript
const ConditionalAttributive = Attributive.create({
  name: 'ConditionalAccess',
  content: async function ConditionalAccess(targetUser, eventArgs) {
    const user = eventArgs.user;
    const payload = eventArgs.payload;
    
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
  content: async function EntityState(targetUser, eventArgs) {
    const entityId = eventArgs.payload.entityId;
    const { MatchExp } = this.globals;
    
    const entity = await this.system.storage.findOne('SomeEntity',
      MatchExp.atom({ key: 'id', value: ['=', entityId] })
    );
    
    if (!entity) {
      return false;
    }
    
    // 基于实体的状态和用户的关系
    switch (entity.status) {
      case 'draft':
        return entity.author === eventArgs.user.id;
      case 'published':
        return true;  // 所有人都可以访问已发布的内容
      case 'archived':
        return eventArgs.user.role === 'admin';
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
  content: async function TimeWindow(targetUser, eventArgs) {
    const user = eventArgs.user;
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

## MatchExp 在查询条件中的应用

**重要提醒：在 Attributive 的 content 函数中进行数据库查询时，应该使用 MatchExp 而不是 BoolExp。BoolExp 仅用于组合 Attributive，而 MatchExp 用于构建数据库查询条件。**

### 查询条件的基本构建

```javascript
// 构建简单查询条件
const { MatchExp } = this.globals;

// 1. 单个条件
const byId = MatchExp.atom({ key: 'id', value: ['=', userId] });

// 2. AND 条件组合
const activeUsers = MatchExp.atom({ key: 'status', value: ['=', 'active'] })
  .and({ key: 'verified', value: ['=', true] });

// 3. OR 条件组合
const adminOrModerator = MatchExp.atom({ key: 'role', value: ['=', 'admin'] })
  .or({ key: 'role', value: ['=', 'moderator'] });

// 4. 复杂嵌套条件
const complexQuery = MatchExp.atom({ key: 'age', value: ['>', 18] })
  .and(
    MatchExp.atom({ key: 'status', value: ['=', 'active'] })
      .or({ key: 'role', value: ['=', 'premium'] })
  );
```

### 在权限检查中使用查询

```javascript
const ResourceAccessAttributive = Attributive.create({
  name: 'ResourceAccess',
  content: async function ResourceAccess(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const resourceId = eventArgs.payload.resourceId;
    
    // 构建复杂查询条件
    const accessQuery = MatchExp.atom({ key: 'resourceId', value: ['=', resourceId] })
      .and(
        MatchExp.atom({ key: 'userId', value: ['=', eventArgs.user.id] })
          .or({ key: 'groupId', value: ['in', eventArgs.user.groups || []] })
      )
      .and({ key: 'expiresAt', value: ['>', new Date().toISOString()] })
      .and({ key: 'status', value: ['=', 'active'] });
    
    // 执行查询
    const accessRecord = await this.system.storage.findOne('ResourceAccess', accessQuery);
    
    return !!accessRecord;
  }
});
```

### 查询操作符参考

```javascript
// MatchExp 支持的查询操作符
const queryExamples = {
  // 相等
  equals: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
  
  // 不等
  notEquals: MatchExp.atom({ key: 'status', value: ['!=', 'deleted'] }),
  
  // 大于/小于
  greaterThan: MatchExp.atom({ key: 'age', value: ['>', 18] }),
  lessThan: MatchExp.atom({ key: 'price', value: ['<', 100] }),
  greaterOrEqual: MatchExp.atom({ key: 'score', value: ['>=', 60] }),
  lessOrEqual: MatchExp.atom({ key: 'quantity', value: ['<=', 10] }),
  
  // 包含（用于数组字段）
  contains: MatchExp.atom({ key: 'tags', value: ['contains', 'javascript'] }),
  
  // IN 操作（检查值是否在给定数组中）
  inArray: MatchExp.atom({ key: 'role', value: ['in', ['admin', 'moderator']] }),
  
  // NULL 检查
  isNull: MatchExp.atom({ key: 'deletedAt', value: ['=', null] }),
  isNotNull: MatchExp.atom({ key: 'userId', value: ['!=', null] }),
  
  // 模糊匹配（如果数据库支持）
  like: MatchExp.atom({ key: 'name', value: ['like', '%john%'] })
};
```

### 权限与查询的结合示例

```javascript
// 创建一个根据用户权限动态调整查询条件的交互
const ListResourcesWithPermission = Interaction.create({
  name: 'ListResources',
  action: GetAction,
  data: Resource,
  // 确保用户已认证
  userAttributives: AuthenticatedAttributive,
  // 使用 dataAttributives 来动态调整查询条件
  dataAttributives: DataAttributive.create({
    name: 'ResourceQueryFilter',
    content: function(eventArgs) {
      const { MatchExp } = this.globals;
      let baseQuery = MatchExp.atom({ key: 'status', value: ['!=', 'deleted'] });
      
      // 根据用户角色添加不同的过滤条件
      if (eventArgs.user.role === 'admin') {
        // 管理员可以看到所有资源
        return baseQuery;
      } else if (eventArgs.user.role === 'manager') {
        // 经理只能看到自己部门的资源
        return baseQuery.and({ key: 'departmentId', value: ['=', eventArgs.user.departmentId] });
      } else {
        // 普通用户只能看到自己的资源或公开资源
        return baseQuery.and(
          MatchExp.atom({ key: 'ownerId', value: ['=', eventArgs.user.id] })
            .or({ key: 'isPublic', value: ['=', true] })
        );
      }
    }
  })
});
```

## 权限缓存和性能优化

### 权限结果缓存

如果需要缓存权限检查结果，你需要自己实现缓存机制：

```javascript
// 使用外部缓存系统（如 Redis）
const cache = new Map(); // 实际应用中使用 Redis 等

const CachedAttributive = Attributive.create({
  name: 'CachedPermission',
  content: async function CachedPermission(targetUser, eventArgs) {
    const cacheKey = `permission:${eventArgs.user.id}:${this.interaction.name}`;
    
    // 检查缓存
    const cached = cache.get(cacheKey);
    if (cached !== undefined && cached.expiry > Date.now()) {
      return cached.value;
    }
    
    // 执行权限检查（这里调用实际的权限检查逻辑）
    const hasPermission = await this.performExpensivePermissionCheck(eventArgs);
    
    // 缓存结果（5分钟）
    cache.set(cacheKey, {
      value: hasPermission,
      expiry: Date.now() + 5 * 60 * 1000
    });
    
    return hasPermission;
  }
});

// 在 Controller 上扩展权限检查方法
Controller.prototype.performExpensivePermissionCheck = async function(eventArgs) {
  // 执行复杂的权限检查逻辑
  const { MatchExp } = this.globals;
  // ... 复杂查询
  return true;
};
```

### 批量权限检查

```javascript
const BatchPermissionAttributive = Attributive.create({
  name: 'BatchPermission',
  content: async function BatchPermission(targetUser, eventArgs) {
    const userId = eventArgs.user.id;
    const resourceIds = eventArgs.payload.resourceIds;
    const { MatchExp } = this.globals;
    
    // 批量查询用户对这些资源的权限
    const permissions = await this.system.storage.find('Permission',
      MatchExp.atom({ key: 'user', value: ['=', userId] })
        .and({ key: 'resource', value: ['in', resourceIds] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    
    // 检查是否对所有资源都有权限
    return permissions.length === resourceIds.length;
  }
});
```

## 测试 Attributive 权限系统

### 测试环境搭建

测试 Attributive 时需要模拟完整的用户交互环境，包括用户、权限上下文和数据库状态：

```javascript
// tests/attributive/setup.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from '@';
import { entities, relations, interactions, activities } from '../src/index.js';

describe('Attributive 权限测试', () => {
  let system: MonoSystem;
  let controller: Controller;
  
  beforeEach(async () => {
    // 为每个测试创建独立的系统实例
    system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    );
    
    await controller.setup(true);
  });
  
  // 测试辅助函数：创建测试用户

});
```

### 测试基本角色权限

```javascript
describe('基本角色权限测试', () => {
  test('管理员应该能够创建宿舍', async () => {
    // 创建管理员用户
    const admin = await system.storage.create('User', {
      name: '张管理员',
      role: 'admin',
      email: 'admin@example.com'
    });

    // 执行CreateDormitory交互
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
      name: '测试宿舍',
      building: '测试楼',
      roomNumber: '101',
      capacity: 4,
      description: '测试用宿舍'
    });

    // 验证权限通过，交互执行成功
    expect(result.error).toBeUndefined();
    
    // 验证宿舍确实被创建
    const { MatchExp } = controller.globals;
    const dormitory = await system.storage.findOne('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', '测试宿舍'] })
    );
    expect(dormitory).toBeTruthy();
  });

  test('普通学生不应该能够创建宿舍', async () => {
    // 创建普通学生用户
    const student = await system.storage.create('User', {
      name: '李学生',
      role: 'student',
      email: 'student@example.com'
    });

    // 尝试执行CreateDormitory交互
    const result = await controller.callInteraction('CreateDormitory', {
      user: student,
      payload: {
      name: '测试宿舍',
      building: '测试楼',
      roomNumber: '101',
      capacity: 4,
      description: '测试用宿舍'
    });

    // 验证权限被拒绝
    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('permission'); // 权限错误信息
  });
});
```

### 测试复杂权限条件

```javascript
describe('复杂权限条件测试', () => {
  test('只有宿舍长能在自己宿舍记录积分', async () => {
    // 1. 创建测试数据
    const leader = await system.storage.create('User', {
      name: '宿舍长',
      role: 'student',
      email: 'leader@example.com'
    });

    const member = await system.storage.create('User', {
      name: '普通成员',
      role: 'student', 
      email: 'member@example.com'
    });

    const admin = await system.storage.create('User', {
      name: '管理员',
      role: 'admin',
      email: 'admin@example.com'
    });

    // 2. 创建宿舍
    const dormitory = await system.storage.create('Dormitory', {
      name: '权限测试宿舍',
      building: '权限测试楼',
      roomNumber: '999',
      capacity: 4
    });

    // 3. 创建宿舍成员关系（宿舍长）
    const leaderMember = await system.storage.create('DormitoryMember', {
      user: leader,
      dormitory: dormitory,
      role: 'leader', // 宿舍长
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // 4. 创建普通成员关系
    const normalMember = await system.storage.create('DormitoryMember', {
      user: member,
      dormitory: dormitory, 
      role: 'member', // 普通成员
      status: 'active',
      bedNumber: 2,
      joinedAt: new Date().toISOString()
    });

    // 5. 测试宿舍长可以记录积分
    const leaderResult = await controller.callInteraction('RecordScore', {
      user: leader,
      payload: {
      memberId: normalMember,
      points: 10,
      reason: '打扫卫生',
      category: 'hygiene'
    });
    expect(leaderResult.error).toBeUndefined();

    // 6. 测试普通成员不能记录积分
    const memberResult = await controller.callInteraction('RecordScore', {
      user: member,
      payload: {
      memberId: leaderMember,
      points: 10,
      reason: '尝试记录积分',
      category: 'hygiene'
    });
    expect(memberResult.error).toBeTruthy();

    // 7. 测试管理员不受宿舍长限制（如果管理员也有权限）
    const adminResult = await controller.callInteraction('AdminAssignScore', {
      user: admin,
      payload: {
      memberId: normalMember,
      points: 5,
      reason: '管理员加分',
      category: 'other'
    });
    expect(adminResult.error).toBeUndefined();
  });
});
```

### 测试 Payload 级别的 Attributive

```javascript
describe('Payload级别权限测试', () => {
  test('只能编辑自己宿舍的成员信息', async () => {
    // 创建两个不同宿舍的宿舍长
    const leader1 = await system.storage.create('User', {
      name: '宿舍长1',
      role: 'student',
      email: 'leader1@example.com'
    });

    const leader2 = await system.storage.create('User', {
      name: '宿舍长2', 
      role: 'student',
      email: 'leader2@example.com'
    });

    // 创建两个宿舍
    const dormitory1 = await system.storage.create('Dormitory', {
      name: '宿舍1',
      building: '测试楼',
      roomNumber: '201',
      capacity: 4
    });

    const dormitory2 = await system.storage.create('Dormitory', {
      name: '宿舍2',
      building: '测试楼', 
      roomNumber: '202',
      capacity: 4
    });

    // 创建成员关系
    const member1 = await system.storage.create('DormitoryMember', {
      user: leader1,
      dormitory: dormitory1,
      role: 'leader',
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    const member2 = await system.storage.create('DormitoryMember', {
      user: leader2,
      dormitory: dormitory2,
      role: 'leader', 
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // 宿舍长1应该能记录自己宿舍成员的积分
    const validResult = await controller.callInteraction('RecordScore', {
      user: leader1,
      payload: {
      memberId: member1, // 自己宿舍的成员
      points: 10,
      reason: '清洁卫生',
      category: 'hygiene'
    });
    expect(validResult.error).toBeUndefined();

    // 宿舍长1不应该能记录其他宿舍成员的积分
    const invalidResult = await controller.callInteraction('RecordScore', {
      user: leader1,
      payload: {
      memberId: member2, // 其他宿舍的成员
      points: 10,
      reason: '尝试跨宿舍记录',
      category: 'hygiene'
    });
    expect(invalidResult.error).toBeTruthy();
  });
});
```

## 最佳实践

### 1. 权限粒度设计

```javascript
// ✅ 合适的权限粒度 - 基于角色和关系
const DormitoryLeaderAttributive = Attributive.create({
  name: 'DormitoryLeader',
  content: async function(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const member = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user', value: ['=', eventArgs.user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !!member;
  }
});

// ❌ 过于细粒度的权限
const DormitoryLeaderOnWeekdaysAttributive = Attributive.create({
  name: 'DormitoryLeaderOnWeekdays',
  content: async function(targetUser, eventArgs) {
    const isWeekday = [1, 2, 3, 4, 5].includes(new Date().getDay());
    if (!isWeekday) return false;
    
    const { MatchExp } = this.globals;
    const member = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user', value: ['=', eventArgs.user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
    );
    return !!member;
  }
});
```

### 2. 权限命名规范

```javascript
// ✅ 清晰的命名 - 描述具体权限
const AdminAttributive = Attributive.create({ name: 'Admin' });
const DormitoryLeaderAttributive = Attributive.create({ name: 'DormitoryLeader' });
const NoActiveDormitoryAttributive = Attributive.create({ name: 'NoActiveDormitory' });
const DormitoryNotFullAttributive = Attributive.create({ name: 'DormitoryNotFull' });

// ❌ 模糊的命名
const CheckAttributive = Attributive.create({ name: 'Check' });
const ValidAttributive = Attributive.create({ name: 'Valid' });
const OkAttributive = Attributive.create({ name: 'Ok' });
```

### 3. 性能考虑

```javascript
// ✅ 高效的权限检查 - 先检查简单条件
const EfficientLeaderAttributive = Attributive.create({
  name: 'EfficientLeader',
  content: async function(targetUser, eventArgs) {
    // 先检查用户角色（简单条件）
    if (eventArgs.user.role === 'admin') {
      return true; // 管理员直接通过
    }
    
    // 再检查复杂的数据库查询
    const { MatchExp } = this.globals;
    const member = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user', value: ['=', eventArgs.user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !!member;
  }
});

// ❌ 低效的权限检查 - 总是执行复杂查询
const InefficientLeaderAttributive = Attributive.create({
  name: 'InefficientLeader',
  content: async function(targetUser, eventArgs) {
    // 总是执行数据库查询，即使用户是管理员
    const { MatchExp } = this.globals;
    const member = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user', value: ['=', eventArgs.user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
    );
    return !!member || eventArgs.user.role === 'admin';
  }
});
```

定语系统为 interaqt 提供了强大而灵活的权限控制机制。通过合理设计、系统测试和持续优化，可以实现复杂的权限控制逻辑，同时保持代码的清晰性和可维护性。正确的测试策略不仅能验证权限逻辑的正确性，还能提高系统的安全性和用户体验。 