# How to Use Attributives for Permission Control

Attributives are the core mechanism for permission control in InterAQT. They allow you to define who can perform specific operations in a declarative way, controlling access permissions based on user roles, relationships, or other dynamic conditions.

## Understanding the Attributive Concept

### What is an Attributive

An attributive is a descriptive constraint condition used to limit who can perform a specific operation. In natural language, attributives are used to modify nouns; in InterAQT, attributives are used to modify interactions and entities, defining access rules.

For example:
- "**Authors** can edit posts" - "Authors" is an attributive
- "**Administrators** can delete any comments" - "Administrators" is an attributive
- "**Friends** can view private profiles" - "Friends" is an attributive

### Core Structure of Attributives

```javascript
const MyAttributive = Attributive.create({
  name: 'MyAttributive',  // Name of the attributive
  content: function(targetUser, eventArgs) {
    // targetUser: First parameter, usually the current user in userAttributives
    //            In payload attributives, it's the value of the payload item
    // eventArgs: Contains interaction event information like user, payload, query, etc.
    // this: Bound to Controller instance, can access system, globals, etc.
    
    // Return true for permission granted, false for denied
    return true;
  }
});
```

### Functions of Attributives

The attributive system provides the following functionality:
- **Fine-grained permission control**: Access control based on complex conditions
- **Dynamic permission evaluation**: Permissions can be calculated based on real-time data
- **Declarative permission definition**: No need to write complex permission checking code
- **Automatic permission verification**: Framework automatically executes permission checks

### Attributives vs Traditional Permission Control

```javascript
// Traditional permission control approach
app.put('/api/posts/:id', async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  
  // Manual permission checking
  const post = await db.posts.findById(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  if (post.authorId !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Execute update operation
  const updatedPost = await db.posts.update(postId, req.body);
  res.json(updatedPost);
});

// InterAQT attributive approach
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
  // Declarative permission control - authors or administrators can update
  userAttributives: BoolExp.atom(PostAuthorAttributive)
    .or(BoolExp.atom(AdminAttributive))
});
```

## Adding User Attributives to Interactions

### Role-based Permissions

```javascript
import { Attributive, BoolExp } from 'interaqt';

// Define role attributives
const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: function Admin(targetUser, eventArgs) {
    // this is bound to controller, can access system and other tools
    return eventArgs.user.role === 'admin';
  }
});

const ModeratorAttributive = Attributive.create({
  name: 'Moderator',
  content: function Moderator(targetUser, eventArgs) {
    return ['admin', 'moderator'].includes(eventArgs.user.role);
  }
});

// Only administrators can delete users
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

// Moderators and administrators can delete comments
const DeleteComment = Interaction.create({
  name: 'DeleteComment',
  userAttributives: ModeratorAttributive,
  // ... other configuration
});
```

### Relationship-based Permissions

```javascript
// Define relationship attributives
const PostAuthorAttributive = Attributive.create({
  name: 'PostAuthor',
  content: async function PostAuthor(targetUser, eventArgs) {
    // this is the controller instance
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

// Only post authors can edit posts
const EditPost = Interaction.create({
  name: 'EditPost',
  userAttributives: PostAuthorAttributive,
  // ... other configuration
});

// Comment authors can edit their own comments
const EditComment = Interaction.create({
  name: 'EditComment',
  userAttributives: CommentAuthorAttributive,
  // ... other configuration
});
```

### Complex Relationship-based Permissions

```javascript
// Friend relationship attributive
const FriendAttributive = Attributive.create({
  name: 'Friend',
  content: async function Friend(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const targetUserId = eventArgs.payload.targetUserId;
    
    // Check if they are friends
    const friendship = await this.system.storage.findOne('Friendship', 
      MatchExp.atom({ key: 'source', value: ['=', eventArgs.user.id] })
        .and({ key: 'target', value: ['=', targetUserId] })
        .and({ key: 'status', value: ['=', 'accepted'] })
    );
    
    return !!friendship;
  }
});

// Project member attributive
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

// Only friends can view private profiles
const ViewPrivateProfile = Interaction.create({
  name: 'ViewPrivateProfile',
  userAttributives: FriendAttributive,
  // ... other configuration
});

// Only project members can create tasks
const CreateTask = Interaction.create({
  name: 'CreateTask',
  userAttributives: ProjectMemberAttributive,
  // ... other configuration
});
```

### Dynamic Permission Evaluation

```javascript
// Time-based permissions
const BusinessHoursAttributive = Attributive.create({
  name: 'BusinessHours',
  content: function BusinessHours(targetUser, eventArgs) {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Monday to Friday, 9:00-18:00
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  }
});

// Data state-based permissions
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

// User status-based permissions
const VerifiedUserAttributive = Attributive.create({
  name: 'VerifiedUser',
  content: function VerifiedUser(targetUser, eventArgs) {
    return eventArgs.user.isVerified === true;
  }
});

// Only during business hours can leave requests be submitted
const SubmitLeaveRequest = Interaction.create({
  name: 'SubmitLeaveRequest',
  userAttributives: BusinessHoursAttributive,
  // ... other configuration
});

// Only verified users can publish posts
const PublishPost = Interaction.create({
  name: 'PublishPost',
  userAttributives: VerifiedUserAttributive,
  // ... other configuration
});
```

## Adding Attributive Constraints to Payload

In addition to limiting who can execute interactions, you can also limit the specific parameters that interactions must satisfy:

```javascript
// Define a constraint: can only edit content created by oneself
const OwnContentAttributive = Attributive.create({
  name: 'OwnContent',
  content: async function OwnContent(content, eventArgs) {
    // content is the value of the payload item
    return content.author === eventArgs.user.id;
  }
});

// Define a constraint: content must be in draft status
const DraftContentAttributive = Attributive.create({
  name: 'DraftContent',
  content: async function DraftContent(content, eventArgs) {
    return content.status === 'draft';
  }
});

// Use payload attributives in interactions
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
        // Restrict to editing only one's own draft content
        attributives: BoolExp.atom(OwnContentAttributive)
          .and(BoolExp.atom(DraftContentAttributive))
      }),
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'body', type: 'string' })
    ]
  })
});
```

## Controlling Entity Operation Permissions Through Interactions

In InterAQT, entity-level permission control is implemented through Interactions, not directly on entity definitions. Here's how to restrict entity creation, querying, and updating:

### Restricting Entity Creation

```javascript
// Define that only verified users can create posts
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
  // Only verified users can execute
  userAttributives: VerifiedUserAttributive
});

// Create entities through Relation's computedData
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

### Restricting Entity Queries

```javascript
// Define message participant permissions
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

// Query private messages interaction
const ViewPrivateMessages = Interaction.create({
  name: 'ViewPrivateMessages',
  action: GetAction, // Use built-in query Action
  data: PrivateMessage,
  // Only message participants can view
  userAttributives: MessageParticipantAttributive
});
```

### Restricting Entity Updates

```javascript
// Define profile owner permissions
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

// Update user profile interaction
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
  // Only profile owners can update
  userAttributives: ProfileOwnerAttributive
});
```

## Combining Multiple Attributives

A powerful feature of InterAQT is the ability to directly use BoolExp in Interaction definitions to combine multiple atomic Attributives. The Controller automatically recognizes and processes these combinations, executing permission checks according to boolean logic.

### AND Logic Combination

```javascript
// Need to satisfy multiple conditions simultaneously
const AdminAndBusinessHours = Interaction.create({
  name: 'SystemMaintenance',
  userAttributives: BoolExp.atom(AdminAttributive)
    .and(BoolExp.atom(BusinessHoursAttributive))
});
```

### OR Logic Combination

```javascript
// Can satisfy any one condition
const EditPostAttributive = Attributive.create({
  name: 'CanEditPost',
  content: async function CanEditPost(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const post = await this.system.storage.findOne('Post',
      MatchExp.atom({ key: 'id', value: ['=', eventArgs.payload.postId] })
    );
    
    // Is author OR is administrator
    return post && (post.author === eventArgs.user.id || eventArgs.user.role === 'admin');
  }
});

const EditPost = Interaction.create({
  name: 'EditPost',
  userAttributives: EditPostAttributive,
  // ... other configuration
});

// Or use BoolExp to combine multiple Attributives
const EditPostV2 = Interaction.create({
  name: 'EditPostV2',
  userAttributives: BoolExp.atom(PostAuthorAttributive)
    .or(BoolExp.atom(AdminAttributive)),
  // ... other configuration
});
```

## Using BoolExp to Build Complex Permission Conditions

In InterAQT, both `userAttributives` and PayloadItem's `attributives` support directly using BoolExp to combine multiple atomic Attributives. The Controller automatically recognizes and processes these BoolExp expressions, allowing you to flexibly build complex permission rules.

### Core Concepts of BoolExp Combining Attributives

```javascript
import { BoolExp, Attributive, Attributives } from 'interaqt';

// 1. Define atomic Attributives (each responsible for one simple permission check)
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

// 2. Use BoolExp in Interaction to combine these atomic Attributives
const UpdateResource = Interaction.create({
  name: 'UpdateResource',
  action: Action.create({ name: 'updateResource' }),
  // Must be active user AND (administrator OR resource owner)
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

### Complex Permission Rules

```javascript
// Complex permission combinations
const ComplexPermissionAttributive = Attributive.create({
  name: 'ComplexPermission',
  content: async function ComplexPermission(targetUser, eventArgs) {
    const user = eventArgs.user;
    const payload = eventArgs.payload;
    
    // Administrators can perform any operation
    if (user.role === 'admin') {
      return true;
    }
    
    // Moderators can perform operations during business hours
    if (user.role === 'moderator') {
      const now = new Date();
      const hour = now.getHours();
      return hour >= 9 && hour < 18;
    }
    
    // Regular users can only operate their own data
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

## MatchExp Applications in Query Conditions

**Important Reminder: When performing database queries in Attributive content functions, you should use MatchExp instead of BoolExp. BoolExp is only used for combining Attributives, while MatchExp is used for building database query conditions.**

### Basic Query Condition Construction

```javascript
// Build simple query conditions
const { MatchExp } = this.globals;

// 1. Single condition
const byId = MatchExp.atom({ key: 'id', value: ['=', userId] });

// 2. AND condition combination
const activeUsers = MatchExp.atom({ key: 'status', value: ['=', 'active'] })
  .and({ key: 'verified', value: ['=', true] });

// 3. OR condition combination
const adminOrModerator = MatchExp.atom({ key: 'role', value: ['=', 'admin'] })
  .or({ key: 'role', value: ['=', 'moderator'] });

// 4. Complex nested conditions
const complexQuery = MatchExp.atom({ key: 'age', value: ['>', 18] })
  .and(
    MatchExp.atom({ key: 'status', value: ['=', 'active'] })
      .or({ key: 'role', value: ['=', 'premium'] })
  );
```

### Using Queries in Permission Checks

```javascript
const ResourceAccessAttributive = Attributive.create({
  name: 'ResourceAccess',
  content: async function ResourceAccess(targetUser, eventArgs) {
    const { MatchExp } = this.globals;
    const resourceId = eventArgs.payload.resourceId;
    
    // Build complex query conditions
    const accessQuery = MatchExp.atom({ key: 'resourceId', value: ['=', resourceId] })
      .and(
        MatchExp.atom({ key: 'userId', value: ['=', eventArgs.user.id] })
          .or({ key: 'groupId', value: ['in', eventArgs.user.groups || []] })
      )
      .and({ key: 'expiresAt', value: ['>', new Date().toISOString()] })
      .and({ key: 'status', value: ['=', 'active'] });
    
    // Execute query
    const accessRecord = await this.system.storage.findOne('ResourceAccess', accessQuery);
    
    return !!accessRecord;
  }
});
```

### Query Operator Reference

```javascript
// Query operators supported by MatchExp
const queryExamples = {
  // Equality
  equals: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
  
  // Inequality
  notEquals: MatchExp.atom({ key: 'status', value: ['!=', 'deleted'] }),
  
  // Greater than/Less than
  greaterThan: MatchExp.atom({ key: 'age', value: ['>', 18] }),
  lessThan: MatchExp.atom({ key: 'price', value: ['<', 100] }),
  greaterOrEqual: MatchExp.atom({ key: 'score', value: ['>=', 60] }),
  lessOrEqual: MatchExp.atom({ key: 'quantity', value: ['<=', 10] }),
  
  // Contains (for array fields)
  contains: MatchExp.atom({ key: 'tags', value: ['contains', 'javascript'] }),
  
  // IN operation (check if value is in given array)
  inArray: MatchExp.atom({ key: 'role', value: ['in', ['admin', 'moderator']] }),
  
  // NULL check
  isNull: MatchExp.atom({ key: 'deletedAt', value: ['=', null] }),
  isNotNull: MatchExp.atom({ key: 'userId', value: ['!=', null] }),
  
  // Fuzzy matching (if database supports)
  like: MatchExp.atom({ key: 'name', value: ['like', '%john%'] })
};
```

## Testing Attributive Permission System

### Test Environment Setup

Testing Attributives requires simulating a complete user interaction environment, including users, permission context, and database state:

```javascript
// tests/attributive/setup.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from '@';
import { entities, relations, interactions, activities } from '../src/index.js';

describe('Attributive Permission Tests', () => {
  let system: MonoSystem;
  let controller: Controller;
  
  beforeEach(async () => {
    // Create independent system instance for each test
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
  
  // Test helper function: create test user

});
```

### Testing Basic Role Permissions

```javascript
describe('Basic Role Permission Tests', () => {
  test('Administrators should be able to create dormitories', async () => {
    // Create administrator user
    const admin = await system.storage.create('User', {
      name: 'Admin Zhang',
      role: 'admin',
      email: 'admin@example.com'
    });

    // Execute CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
      name: 'Test Dormitory',
      building: 'Test Building',
      roomNumber: '101',
      capacity: 4,
      description: 'Test dormitory'
    });

    // Verify permission passed and interaction executed successfully
    expect(result.error).toBeUndefined();
    
    // Verify dormitory was actually created
    const { MatchExp } = controller.globals;
    const dormitory = await system.storage.findOne('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] })
    );
    expect(dormitory).toBeTruthy();
  });

  test('Regular students should not be able to create dormitories', async () => {
    // Create regular student user
    const student = await system.storage.create('User', {
      name: 'Student Li',
      role: 'student',
      email: 'student@example.com'
    });

    // Attempt to execute CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: student,
      payload: {
      name: 'Test Dormitory',
      building: 'Test Building',
      roomNumber: '101',
      capacity: 4,
      description: 'Test dormitory'
    });

    // Verify permission was denied
    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('permission'); // Permission error message
  });
});
```

### Testing Complex Permission Conditions

```javascript
describe('Complex Permission Condition Tests', () => {
  test('Only dormitory leaders can record points in their own dormitory', async () => {
    // 1. Create test data
    const leader = await system.storage.create('User', {
      name: 'Dormitory Leader',
      role: 'student',
      email: 'leader@example.com'
    });

    const member = await system.storage.create('User', {
      name: 'Regular Member',
      role: 'student', 
      email: 'member@example.com'
    });

    const admin = await system.storage.create('User', {
      name: 'Administrator',
      role: 'admin',
      email: 'admin@example.com'
    });

    // 2. Create dormitory
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Permission Test Dormitory',
      building: 'Permission Test Building',
      roomNumber: '999',
      capacity: 4
    });

    // 3. Create dormitory member relationship (leader)
    const leaderMember = await system.storage.create('DormitoryMember', {
      user: leader,
      dormitory: dormitory,
      role: 'leader', // Dormitory leader
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // 4. Create regular member relationship
    const normalMember = await system.storage.create('DormitoryMember', {
      user: member,
      dormitory: dormitory, 
      role: 'member', // Regular member
      status: 'active',
      bedNumber: 2,
      joinedAt: new Date().toISOString()
    });

    // 5. Test dormitory leader can record points
    const leaderResult = await controller.callInteraction('RecordScore', {
      user: leader,
      payload: {
      memberId: normalMember,
      points: 10,
      reason: 'Cleaning',
      category: 'hygiene'
    });
    expect(leaderResult.error).toBeUndefined();

    // 6. Test regular member cannot record points
    const memberResult = await controller.callInteraction('RecordScore', {
      user: member,
      payload: {
      memberId: leaderMember,
      points: 10,
      reason: 'Attempt to record points',
      category: 'hygiene'
    });
    expect(memberResult.error).toBeTruthy();

    // 7. Test administrator is not restricted by dormitory leader limitation (if admin also has permission)
    const adminResult = await controller.callInteraction('AdminAssignScore', {
      user: admin,
      payload: {
      memberId: normalMember,
      points: 5,
      reason: 'Admin bonus points',
      category: 'other'
    });
    expect(adminResult.error).toBeUndefined();
  });
});
```

## Best Practices

### 1. Permission Granularity Design

```javascript
// ✅ Appropriate permission granularity - based on roles and relationships
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

// ❌ Overly fine-grained permissions
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

### 2. Permission Naming Conventions

```javascript
// ✅ Clear naming - describes specific permissions
const AdminAttributive = Attributive.create({ name: 'Admin' });
const DormitoryLeaderAttributive = Attributive.create({ name: 'DormitoryLeader' });
const NoActiveDormitoryAttributive = Attributive.create({ name: 'NoActiveDormitory' });
const DormitoryNotFullAttributive = Attributive.create({ name: 'DormitoryNotFull' });

// ❌ Vague naming
const CheckAttributive = Attributive.create({ name: 'Check' });
const ValidAttributive = Attributive.create({ name: 'Valid' });
const OkAttributive = Attributive.create({ name: 'Ok' });
```

### 3. Performance Considerations

```javascript
// ✅ Efficient permission checking - check simple conditions first
const EfficientLeaderAttributive = Attributive.create({
  name: 'EfficientLeader',
  content: async function(targetUser, eventArgs) {
    // Check user role first (simple condition)
    if (eventArgs.user.role === 'admin') {
      return true; // Administrators pass directly
    }
    
    // Then check complex database queries
    const { MatchExp } = this.globals;
    const member = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user', value: ['=', eventArgs.user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] })
    );
    return !!member;
  }
});

// ❌ Inefficient permission checking - always executes complex queries
const InefficientLeaderAttributive = Attributive.create({
  name: 'InefficientLeader',
  content: async function(targetUser, eventArgs) {
    // Always executes database query, even if user is administrator
    const { MatchExp } = this.globals;
    const member = await this.system.storage.findOne('DormitoryMember',
      MatchExp.atom({ key: 'user', value: ['=', eventArgs.user.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
    );
    return !!member || eventArgs.user.role === 'admin';
  }
});
```

The attributive system provides InterAQT with a powerful and flexible permission control mechanism. Through proper design, systematic testing, and continuous optimization, you can implement complex permission control logic while maintaining code clarity and maintainability. The right testing strategy not only verifies the correctness of permission logic but also improves system security and user experience.