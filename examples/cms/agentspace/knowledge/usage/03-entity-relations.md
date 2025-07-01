# How to Establish Entity Relations

Relations are bridges that connect different entities, defining how entities are associated with each other. interaqt supports various types of relations, including one-to-one, one-to-many, many-to-many, and symmetric relations.

## Important: Relation Names are Auto-Generated

When creating relations, you **DO NOT** need to specify a `name` property. The framework automatically generates the relation name based on the source and target entities. For example:
- A relation between `User` and `Post` will automatically be named `UserPost`
- A relation between `Post` and `Comment` will automatically be named `PostComment`

```javascript
// ✅ Correct: No name specified
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});

// ❌ Wrong: Do not specify name
const UserPosts = Relation.create({
  name: 'UserPost',  // DON'T do this - name is auto-generated
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});
```

## Creating One-to-One Relations

One-to-one relations represent unique correspondences between two entities, such as the relationship between a user and their profile.

### Basic One-to-One Relation

```javascript
import { Entity, Property, Relation } from 'interaqt';

// Define user entity
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'email', type: 'string', unique: true }),
    Property.create({ name: 'name', type: 'string' })
  ]
});

// Define profile entity
const Profile = Entity.create({
  name: 'Profile',
  properties: [
    Property.create({ name: 'bio', type: 'string' }),
    Property.create({ name: 'avatar', type: 'string' }),
    Property.create({ name: 'website', type: 'string' })
  ]
});

// Create one-to-one relation
const UserProfile = Relation.create({
  source: User,
  sourceProperty: 'profile',
  target: Profile,
  targetProperty: 'user',
  type: '1:1'
});
```

### Bidirectional Access

In one-to-one relations, you can access either end from the other:

```javascript
// Access profile from user
const user = await controller.findOne('User', { email: 'john@example.com' });
const profile = user.profile;  // Get associated profile

// Access user from profile
const profile = await controller.findOne('Profile', { id: profileId });
const user = profile.user;  // Get associated user
```

### Creating and Managing One-to-One Relations

```javascript
// Create user and profile, establishing the relation
const createUserWithProfile = async (userData, profileData) => {
  // First create the user
  const user = await controller.create('User', userData);
  
  // Create profile and link to user
  const profile = await controller.create('Profile', {
    ...profileData,
    user: user.id  // Establish relation
  });
  
  return { user, profile };
};

// Usage example
const { user, profile } = await createUserWithProfile(
  { email: 'john@example.com', name: 'John Doe' },
  { bio: 'Software developer', website: 'https://johndoe.dev' }
);
```

## Creating One-to-Many Relations

One-to-many relations represent that one entity can be associated with multiple instances of another entity, such as the relationship between users and posts.

### Basic One-to-Many Relation

```javascript
// User entity (already defined)
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'email', type: 'string', unique: true }),
    Property.create({ name: 'name', type: 'string' })
  ]
});

// Post entity
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
});

// Create one-to-many relation
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
});
```

### Accessing "Many" from "One"

```javascript
// Get all posts for a user
const user = await controller.findOne('User', { email: 'john@example.com' });
const posts = user.posts;  // Get all user's posts

// Also accessible through queries
const userPosts = await controller.find('Post', { 
  author: user.id 
});
```

### Accessing "One" from "Many"

```javascript
// Get post's author
const post = await controller.findOne('Post', { id: postId });
const author = post.author;  // Get post's author
```

### Creating and Managing One-to-Many Relations

```javascript
// Create new post for user
const createPost = async (userId, postData) => {
  return await controller.create('Post', {
    ...postData,
    author: userId  // Establish relation with user
  });
};

// Usage example
const user = await controller.findOne('User', { email: 'john@example.com' });
const post = await createPost(user.id, {
  title: 'My First Post',
  content: 'This is the content of my first post.'
});

// Get all user's posts (including newly created)
const allUserPosts = await controller.find('Post', { author: user.id });
```

## Creating Many-to-Many Relations

Many-to-many relations represent multiple associations between two entities, such as the relationship between users and tags.

### Basic Many-to-Many Relation

```javascript
// Tag entity
const Tag = Entity.create({
  name: 'Tag',
  properties: [
    Property.create({ name: 'name', type: 'string', unique: true }),
    Property.create({ name: 'color', type: 'string', defaultValue: '#666666' })
  ]
});

// Create many-to-many relation
const UserTags = Relation.create({
  source: User,
  sourceProperty: 'tags',
  target: Tag,
  targetProperty: 'users',
  type: 'n:n'
});
```

### Bidirectional Access

```javascript
// Access tags from user
const user = await controller.findOne('User', { email: 'john@example.com' });
const userTags = user.tags;  // Get all user's tags

// Access users from tag
const tag = await controller.findOne('Tag', { name: 'javascript' });
const tagUsers = tag.users;  // Get all users with this tag
```

### Managing Many-to-Many Relations

```javascript
// Add tag to user
const addTagToUser = async (userId, tagName) => {
  // Find or create tag
  let tag = await controller.findOne('Tag', { name: tagName });
  if (!tag) {
    tag = await controller.create('Tag', { name: tagName });
  }
  
  // Establish relation (specific implementation depends on framework's relation management)
  await controller.createRelation('UserTags', {
    source: userId,
    target: tag.id
  });
};

// Remove tag from user
const removeTagFromUser = async (userId, tagId) => {
  await controller.removeRelation('UserTags', {
    source: userId,
    target: tagId
  });
};

// Usage example
const user = await controller.findOne('User', { email: 'john@example.com' });
await addTagToUser(user.id, 'javascript');
await addTagToUser(user.id, 'react');
await addTagToUser(user.id, 'nodejs');
```

### Adding Relation Properties

Many-to-many relations can include additional properties:

```javascript
// User-Post like relation (including like timestamp)
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
      defaultValue: () => 'like'  // Can be 'like', 'love', 'laugh', etc.
    })
  ]
});

// Create relation with properties
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

## Using Symmetric Relations

Symmetric relations are a special type of many-to-many relation where both ends are the same entity type, such as friend relationships.

### Creating Symmetric Relations

```javascript
// Friend relation
const Friendship = Relation.create({
  source: User,
  sourceProperty: 'friends',
  target: User,
  targetProperty: 'friends',
  type: 'n:n',
  symmetric: true,  // Mark as symmetric relation
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

### Special Properties of Symmetric Relations

Symmetric relations have the following characteristics:

1. **Automatic bidirectional sync**: When A adds B as a friend, A is automatically included in B's friend list
2. **Single relation record**: The system stores only one relation record, but both ends can access it
3. **Status consistency**: The relation status is consistent for both parties

```javascript
// Send friend request
const sendFriendRequest = async (fromUserId, toUserId) => {
  await controller.createRelation('Friendship', {
    source: fromUserId,
    target: toUserId,
    properties: {
      status: 'pending'
    }
  });
};

// Accept friend request
const acceptFriendRequest = async (userId, friendId) => {
  await controller.updateRelation('Friendship', {
    source: userId,
    target: friendId
  }, {
    status: 'accepted'
  });
};

// Get user's friend list
const getUserFriends = async (userId) => {
  const user = await controller.findOne('User', { id: userId });
  return user.friends.filter(friend => friend.status === 'accepted');
};
```

### Automatic Bidirectional Sync Example

```javascript
// User A adds User B as friend
const userA = await controller.findOne('User', { email: 'alice@example.com' });
const userB = await controller.findOne('User', { email: 'bob@example.com' });

await sendFriendRequest(userA.id, userB.id);

// Now both users can see this relation
const aliceFriends = await getUserFriends(userA.id);  // Contains Bob (status: pending)
const bobFriends = await getUserFriends(userB.id);    // Contains Alice (status: pending)

// Bob accepts friend request
await acceptFriendRequest(userB.id, userA.id);

// Now both users have accepted friend status
const aliceFriendsAccepted = await getUserFriends(userA.id);  // Bob (status: accepted)
const bobFriendsAccepted = await getUserFriends(userB.id);    // Alice (status: accepted)
```

## Relation Queries and Optimization

### Preloading Related Data

To avoid N+1 query problems, you can preload related data:

```javascript
// Query users with their posts loaded
const usersWithPosts = await controller.find('User', {}, {
  include: ['posts']
});

// Query posts with author and tags loaded
const postsWithDetails = await controller.find('Post', {}, {
  include: ['author', 'tags']
});
```

### Deep Queries

You can perform multi-level relational queries:

```javascript
// Query users, including their posts and post comments
const usersWithPostsAndComments = await controller.find('User', {}, {
  include: [
    {
      relation: 'posts',
      include: ['comments']
    }
  ]
});
```

### Conditional Queries on Relations

You can query based on related data:

```javascript
// Find users with more than 10 posts
const activeUsers = await controller.find('User', {
  'posts.count': { $gt: 10 }
});

// Find posts liked by a specific user
const likedPosts = await controller.find('Post', {
  'likers.id': userId
});
```

## Relation Management Best Practices

### 1. Design Relations with Clear Direction

```javascript
// ✅ Good design: From owner to owned
const UserPosts = Relation.create({
  source: User,        // User owns posts
  target: Post,
  type: '1:n'
});

// ❌ Avoid: Unclear direction
const PostUser = Relation.create({
  source: Post,        // Post belongs to user (less intuitive direction)
  target: User,
  type: 'n:1'
});
```

### 2. Use Meaningful Property Names

```javascript
// ✅ Clear property names
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',      // User's posts
  target: Post,
  targetProperty: 'author',     // Post's author
  type: '1:n'
});
```

### 3. Use Relation Properties Appropriately

```javascript
// ✅ Add useful metadata to relations
const Membership = Relation.create({
  source: User,
  target: Organization,
  type: 'n:n',
  properties: [
    Property.create({ name: 'role', type: 'string' }),           // Role
    Property.create({ name: 'joinedAt', type: 'string' }),       // Join time
    Property.create({ name: 'isActive', type: 'boolean' })       // Active status
  ]
});
```

### 4. Consider Performance Impact

```javascript
// Relation definition example (indexing should be configured at database level)
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
  // Index configuration should be done at database level
});
```

## Complete Example: Blog System Relation Design

```javascript
import { Entity, Property, Relation } from 'interaqt';

// Entity definitions
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

// Relation definitions
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