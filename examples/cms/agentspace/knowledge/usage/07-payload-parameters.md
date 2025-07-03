# How to Use Payload for Interaction Parameters

Payload is the core mechanism for defining and validating interaction parameters in interaqt. It allows you to declare what data an interaction accepts, enforce validation rules, and ensure type safety through the framework's reactive system.

## Understanding Payload and PayloadItem

### What is Payload

Payload defines the structure and validation rules for data that users pass to interactions. It consists of one or more PayloadItems, each representing a specific parameter.

```javascript
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'tags', isCollection: true })
    ]
  })
});
```

### PayloadItem Structure

```javascript
PayloadItem.create({
  name: 'itemName',           // Parameter name (required)
  base: Entity,               // Reference to Entity/Relation (optional)
  isRef: true,                // Whether it's a reference with id (default: false)
  required: true,             // Whether this parameter is required (default: false)
  isCollection: true,         // Whether it's an array (default: false)
  attributives: Attributive,  // Validation rules (optional)
  itemRef: Entity             // Reference to other concepts (optional)
})
```

## Basic Payload Usage

### Simple Parameters Without Entity Reference

When PayloadItem doesn't have a `base` property, the framework treats it as simple data without concept validation:

```javascript
const SendMessage = Interaction.create({
  name: 'SendMessage',
  action: Action.create({ name: 'send' }),
  payload: Payload.create({
    items: [
      // Simple string parameter
      PayloadItem.create({ 
        name: 'message', 
        required: true 
      }),
      // Simple number parameter
      PayloadItem.create({ 
        name: 'priority',
        required: false
      }),
      // Array of strings
      PayloadItem.create({ 
        name: 'recipients',
        isCollection: true,
        required: true
      })
    ]
  })
});

// Usage:
await controller.callInteraction('SendMessage', {
  user: currentUser,
  payload: {
    message: 'Hello World',
    priority: 1,
    recipients: ['user1@example.com', 'user2@example.com']
  }
});
```

**Important**: When `base` is not specified, the framework only checks:
- Whether required parameters are present
- Whether collection parameters are arrays
- No concept validation or attributive checks are performed

### Parameters with Entity Reference

When PayloadItem has a `base` property pointing to an Entity, the framework provides additional validation:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })
  ]
});

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })
  ]
});

const UpdatePost = Interaction.create({
  name: 'UpdatePost',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      // Reference to existing post
      PayloadItem.create({ 
        name: 'post',
        base: Post,
        isRef: true,    // Must have an id
        required: true
      }),
      // New data (not a reference)
      PayloadItem.create({ 
        name: 'updates',
        base: Post,
        isRef: false,   // New data without id
        required: true
      })
    ]
  })
});
```

## Using isRef for Entity References

### isRef: true - Reference to Existing Entity

When `isRef` is true, the payload item must contain an `id` pointing to an existing entity:

```javascript
const DeleteComment = Interaction.create({
  name: 'DeleteComment',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'comment',
        base: Comment,
        isRef: true,    // Must reference existing comment
        required: true
      })
    ]
  })
});

// Usage:
await controller.callInteraction('DeleteComment', {
  user: currentUser,
  payload: {
    comment: { id: 'comment-123' }  // Only id is required
  }
});
```

### isRef: false - Creating New Entity Data

When `isRef` is false and `base` is specified, the payload contains new entity data:

```javascript
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'product',
        base: Product,
        isRef: false,   // New product data
        required: true
      })
    ]
  })
});

// Usage:
await controller.callInteraction('CreateProduct', {
  user: currentUser,
  payload: {
    product: {
      name: 'New Product',
      price: 99.99,
      category: 'Electronics'
      // No id - this is new data
    }
  }
});
```

## Collection Parameters

Use `isCollection: true` for array parameters:

```javascript
const TagPosts = Interaction.create({
  name: 'TagPosts',
  action: Action.create({ name: 'tag' }),
  payload: Payload.create({
    items: [
      // Array of post references
      PayloadItem.create({ 
        name: 'posts',
        base: Post,
        isRef: true,
        isCollection: true,
        required: true
      }),
      // Array of tag references
      PayloadItem.create({ 
        name: 'tags',
        base: Tag,
        isRef: true,
        isCollection: true,
        required: true
      })
    ]
  })
});

// Usage:
await controller.callInteraction('TagPosts', {
  user: currentUser,
  payload: {
    posts: [
      { id: 'post-1' },
      { id: 'post-2' }
    ],
    tags: [
      { id: 'tag-javascript' },
      { id: 'tag-react' }
    ]
  }
});
```

## Payload Validation with Attributives

### Basic Attributive Validation

When PayloadItem has both `base` and `attributives`, the framework validates the payload data:

```javascript
// Define validation attributive
const PublishedPost = Attributive.create({
  name: 'PublishedPost',
  content: function(post, eventArgs) {
    return post.status === 'published';
  }
});

const SharePost = Interaction.create({
  name: 'SharePost',
  action: Action.create({ name: 'share' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'post',
        base: Post,
        isRef: true,
        required: true,
        attributives: PublishedPost  // Only published posts can be shared
      })
    ]
  })
});

// This will succeed:
await controller.callInteraction('SharePost', {
  user: currentUser,
  payload: {
    post: { id: 'published-post-id' }
  }
});

// This will fail validation:
await controller.callInteraction('SharePost', {
  user: currentUser,
  payload: {
    post: { id: 'draft-post-id' }  // Assuming this post has status: 'draft'
  }
});
```

### Complex Validation with BoolExp

You can combine multiple attributives using BoolExp:

```javascript
const ActiveTag = Attributive.create({
  name: 'ActiveTag',
  content: function(tag, eventArgs) {
    return tag.isActive === true;
  }
});

const PopularTag = Attributive.create({
  name: 'PopularTag',
  content: function(tag, eventArgs) {
    return tag.usageCount > 100;
  }
});

const AddTags = Interaction.create({
  name: 'AddTags',
  action: Action.create({ name: 'addTags' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'tags',
        base: Tag,
        isRef: true,
        isCollection: true,
        // Tags must be both active AND popular
        attributives: Attributives.create({
          content: BoolExp.atom(ActiveTag).and(BoolExp.atom(PopularTag))
        })
      })
    ]
  })
});
```

### Validation for Collections

When `isCollection` is true, attributives are checked for **every item** in the array:

```javascript
const VerifiedUser = Attributive.create({
  name: 'VerifiedUser',
  content: function(user, eventArgs) {
    return user.isVerified === true;
  }
});

const InviteUsers = Interaction.create({
  name: 'InviteUsers',
  action: Action.create({ name: 'invite' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'users',
        base: User,
        isRef: true,
        isCollection: true,
        attributives: VerifiedUser  // ALL users must be verified
      })
    ]
  })
});

// This will fail if ANY user in the array is not verified
await controller.callInteraction('InviteUsers', {
  user: currentUser,
  payload: {
    users: [
      { id: 'verified-user-1' },
      { id: 'unverified-user' },  // This will cause validation to fail
      { id: 'verified-user-2' }
    ]
  }
});
```

## Important Framework Behaviors

### When base is NOT specified

```javascript
PayloadItem.create({ 
  name: 'customData',
  required: true
  // No base property
})
```

Framework behavior:
- ✅ Checks if required parameter is present
- ✅ Checks if collection parameter is an array (when isCollection: true)
- ❌ Does NOT perform concept validation
- ❌ Does NOT check attributives
- ❌ Does NOT validate data structure
- **You must handle validation in your own logic**

### When base IS specified

```javascript
PayloadItem.create({ 
  name: 'post',
  base: Post,      // Entity reference
  isRef: true,
  attributives: PublishedPost
})
```

Framework behavior:
- ✅ Checks if required parameter is present
- ✅ Validates the data matches the concept (Entity/Relation)
- ✅ If isRef: true, verifies id exists and fetches full record
- ✅ If attributives exist, validates the data against them
- ✅ For collections, validates every item

### Payload Storage Behavior

When `isRef: false` and `base` is specified, the framework automatically stores the payload data:

```javascript
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'article',
        base: Article,
        isRef: false  // New data will be stored
      })
    ]
  })
});

// The article data will be automatically saved to storage
// and the saved record (with id) will be available in the interaction event
```

## Best Practices

### 1. Use Appropriate Validation Level

```javascript
// ✅ Good: Use base for entity-related data
PayloadItem.create({ 
  name: 'targetUser',
  base: User,
  isRef: true,
  attributives: ActiveUser
})

// ✅ Good: Simple parameters without base
PayloadItem.create({ 
  name: 'searchQuery',
  required: true
  // No base needed for simple strings
})

// ❌ Bad: Over-engineering simple parameters
PayloadItem.create({ 
  name: 'pageNumber',
  base: SomeNumberEntity,  // Unnecessary
  isRef: false
})
```

### 2. Clear Naming and Documentation

```javascript
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',         // Clear: which user
        base: User,
        isRef: true,
        required: true
      }),
      PayloadItem.create({ 
        name: 'profileData',  // Clear: what data
        base: UserProfile,
        isRef: false,
        required: true
      }),
      PayloadItem.create({ 
        name: 'notifyFollowers',  // Clear: simple flag
        required: false
        // Boolean flag, no base needed
      })
    ]
  })
});
```

### 3. Consistent Validation Patterns

```javascript
// Define reusable attributives
const CanBeEdited = Attributive.create({
  name: 'CanBeEdited',
  content: function(item, eventArgs) {
    return item.status !== 'locked' && 
           item.createdBy === eventArgs.user.id;
  }
});

// Use consistently across interactions
const EditPost = Interaction.create({
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'post',
        base: Post,
        isRef: true,
        attributives: CanBeEdited
      })
    ]
  })
});

const EditComment = Interaction.create({
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'comment',
        base: Comment,
        isRef: true,
        attributives: CanBeEdited
      })
    ]
  })
});
```

### 4. Handle Validation Errors Gracefully

```javascript
// In your application code
try {
  const result = await controller.callInteraction('SharePost', {
    user: currentUser,
    payload: { post: { id: postId } }
  });
} catch (error) {
  if (error instanceof AttributeError) {
    if (error.type === 'post not match attributive') {
      // Handle validation failure
      console.error('Cannot share: Post is not published');
    }
  }
}
```

## Known Issues and Workarounds

### Entity Resolution with Circular Dependencies

In some cases, using entity references in PayloadItem can cause resolution issues, particularly when entities have circular dependencies:

```javascript
// May cause "entity undefined not found" error
PayloadItem.create({ 
  name: 'version',
  base: Version,  // Entity with circular dependencies
  isRef: false
})

// Workaround: Use generic object type
// do not set base property to avoids resolution issues
PayloadItem.create({ 
  name: 'version',
  isRef: false
})
```

This issue typically occurs when:
- Entities reference each other in complex ways
- The entity being referenced has forward references
- The interaction is defined before all entities are fully initialized

NOT setting base property maintains the same functionality but avoids the resolution problem, though you lose framework-level validation.

## Summary

The Payload system in interaqt provides a powerful way to:
- Define structured interaction parameters
- Enforce validation rules through attributives
- Ensure type safety with entity references
- Handle both simple data and complex entity relationships

Key points to remember:
- **With base**: Framework handles validation and attributive checks
- **Without base**: You handle validation in your own logic
- **isRef**: Distinguishes between references and new data
- **attributives**: Only work when base is specified
- **isCollection**: Validates every item in arrays

By properly using Payload and PayloadItem, you can build robust, type-safe interactions that validate data at the framework level, reducing the need for manual validation code and improving system reliability. 