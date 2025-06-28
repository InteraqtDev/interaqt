# How to Define and Execute Interactions

Interactions are the only way users interact with the system in InterAQT, and the source of all data changes in the system. By defining interactions, you can describe what operations users can perform and how these operations affect data in the system.

## Important Note: About User Identity

**InterAQT focuses on reactive processing of business logic and does not include user authentication functionality.**

When using this framework, please note:
- The system assumes user identity has already been authenticated through other means (such as JWT, Session, etc.)
- All interactions start from a state where "user identity already exists"
- You don't need to define authentication-related interactions like user registration, login, logout
- User context should be provided to the framework by external systems

For example, when executing interactions, user information is passed as a parameter:
```javascript
// User identity provided by external system
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user123', name: 'John', role: 'author' },  // Already authenticated user
  payload: { /* ... */ }
});
```

## Basic Concepts of Interactions

### What is an Interaction

An interaction represents an operation that a user can perform, such as:
- Creating a blog post
- Liking a post
- Submitting an order
- Approving a request

Each interaction contains:
- **Name**: Identifier for the interaction
- **Action**: Identifier for the interaction type (⚠️ Note: Action is just an identifier and contains no operational logic)
- **Payload**: Parameters needed for the interaction
- **Permission control**: Who can execute this interaction

## ⚠️ Important Concept Clarification: Action is not "Operation"

Many developers misunderstand the concept of Action. **Action is just a name given to the interaction type, like an event type tag, and it contains no operational logic.**

```javascript
// ❌ Wrong understanding: Thinking Action contains operational logic
const CreatePost = Action.create({
  name: 'createPost',
  execute: async (payload) => {  // ❌ Action has no execute method!
    // Trying to write operational logic here...
  }
});

// ✅ Correct understanding: Action is just an identifier
const CreatePost = Action.create({
  name: 'createPost'  // That's it! Just like naming an event
});
```

**All data change logic is implemented through reactive computations (Transform, Count, Every, Any, etc.), not in Actions.**

### Interactions vs Traditional APIs

```javascript
// Traditional API approach
app.post('/api/posts', async (req, res) => {
  const { title, content, authorId } = req.body;
  
  // Manual data validation
  if (!title || !content || !authorId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Manual permission checking
  if (!await checkPermission(req.user, 'create_post')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Manual data operations
  const post = await db.posts.create({ title, content, authorId });
  
  // Manual related data updates
  await db.users.update(authorId, { 
    postCount: { $inc: 1 } 
  });
  
  res.json(post);
});

// InterAQT interaction approach
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({
    name: 'createPost'
    // Action only contains name, no operational logic
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
  // Data changes are declaratively defined through Relation or Property computedData
});
```

## Creating Basic Interactions

### Simplest Interaction

```javascript
import { Interaction, Action, Payload, PayloadItem } from 'interaqt';

const SayHello = Interaction.create({
  name: 'SayHello',
  action: Action.create({
    name: 'sayHello'
    // Action is just an identifier, contains no specific operations
  })
});
```

### Interaction for Creating Entities

In InterAQT, interactions don't directly operate on data. Data creation, updating, and deletion are all implemented through reactive computations.

```javascript
// 1. Define interaction
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  action: Action.create({
    name: 'createArticle'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'title', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'content', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'categoryId', 
        base: Category,
        isRef: true
      })
    ]
  })
});

// 2. Use Transform to listen to interaction events and create entities
import { Transform, InteractionEventEntity } from 'interaqt';

// When defining Article entity relations, you can add reactive creation logic
const ArticleCreation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateArticle') {
      // Return Article data to be created
      return {
        title: event.payload.title,
        content: event.payload.content,
        categoryId: event.payload.categoryId,
        status: 'draft',
        createdAt: new Date().toISOString()
      };
    }
    return null;
  }
});

// Attach this Transform to a property or relation of the Article entity
```

### Interaction for Updating Entities

```javascript
// 1. Define update interaction
// Note: This is for logged-in users updating their own profile, user identity passed through context
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({
    name: 'updateProfile'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'bio' }),
      PayloadItem.create({ name: 'avatar' })
    ]
  })
});

// 2. Use Transform or StateMachine to respond to interactions and update data
// This is usually defined in Property's computedData
```

## Defining Interaction Parameters (Payload)

### Basic Parameter Types

```javascript
const CreatePost = Interaction.create({
  name: 'CreatePost',
  payload: Payload.create({
    items: [
      // String parameter
      PayloadItem.create({ 
        name: 'title', 
        required: true 
      }),
      
      // Number parameter
      PayloadItem.create({ 
        name: 'priority'
      }),
      
      // Boolean parameter
      PayloadItem.create({ 
        name: 'isDraft'
      }),
      
      // Object parameter
      PayloadItem.create({ 
        name: 'metadata',
        required: false
      }),
      
      // Array parameter
      PayloadItem.create({ 
        name: 'tags', 
        isCollection: true
      })
    ]
  })
  // ... action definition
});
```

### Referencing Other Entities (isRef)

```javascript
const CreateComment = Interaction.create({
  name: 'CreateComment',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'content', 
        required: true 
      }),
      // Reference to post entity
      PayloadItem.create({ 
        name: 'postId', 
        base: Post,
        isRef: true,
        required: true 
      }),
      // Reference to user entity
      PayloadItem.create({ 
        name: 'authorId', 
        base: User,
        isRef: true,
        required: true 
      })
    ]
  }),
  action: Action.create({
    name: 'createComment'
  })
});

// Comment creation is implemented through Relation's computedData
const CommentRelation = Relation.create({
  source: Comment,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'comments',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateComment') {
        return {
          source: {
            content: event.payload.content,
            createdAt: new Date().toISOString()
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});
```

### Parameter Validation

The framework's PayloadItem supports basic required field validation, but doesn't support complex validation rules like length limits, regular expressions, etc. These validations should be implemented in business logic:

```javascript
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  action: Action.create({ name: 'createProduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        type: 'string', 
        required: true
        // Complex validation logic should be implemented in interaction handling
      }),
      PayloadItem.create({ 
        name: 'price', 
        type: 'number', 
        required: true
        // Price range validation should be handled in business logic
      }),
      PayloadItem.create({ 
        name: 'email'
        // Email format validation should be handled in business logic
      }),
      PayloadItem.create({ 
        name: 'category'
        // Enum validation should be handled in business logic
      })
    ]
  })
});
```

### Conditional Parameters

The framework itself doesn't support dynamic required conditions and complex validation functions. These logics should be implemented in interaction handling:

```javascript
const CreateOrder = Interaction.create({
  name: 'CreateOrder',
  action: Action.create({ name: 'createOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'items', 
        isCollection: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'shippingAddress'
        // Conditional required logic should be checked in interaction handling
      }),
      PayloadItem.create({ 
        name: 'couponCode'
        // Coupon validation should be implemented in business logic
      })
    ]
  })
});

// Validation logic should be implemented in Transform or Attributive
const orderValidation = Transform.create({
  record: InteractionEvent,
  callback: function(event) {
    if (event.interactionName === 'CreateOrder') {
      // Implement complex validation logic here
      const { payload } = event;
      if (payload.totalAmount < 100 && !payload.shippingAddress) {
        throw new Error('Shipping address is required for orders under $100');
      }
      // Coupon validation etc.
    }
  }
});
```

## Implementing Data Change Logic

⚠️ **Important: In InterAQT, never try to "operate" data in interactions!**

Interactions only declare "what users can do" and contain no data operation logic. All data changes are **inherent properties** of data, automatically maintained through reactive computations.

### Mindset Shift: From "Operating Data" to "Declaring Data Essence"

❌ **Wrong mindset: Trying to operate data in interactions**
```javascript
// Wrong: Thinking you need to write "create post" logic somewhere
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({
    name: 'createPost',
    // ❌ Wrong: Trying to write creation logic here
    handler: async (payload) => {
      const post = await db.create('Post', payload);
      await updateUserPostCount(payload.authorId);
      return post;
    }
  })
});
```

✅ **Correct mindset: Declare what data is**
```javascript
// 1. Interaction only declares that users can create posts
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),  // Just an identifier
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true })
    ]
  })
});

// 2. Post existence "is" a response to the create post interaction
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  computedData: Transform.create({
    record: InteractionEvent,  // Listen to all interaction events
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        // Return post data that should exist
        return {
          source: event.user.id,
          target: {
            title: event.payload.title,
            content: event.payload.content,
            createdAt: new Date().toISOString()
          }
        };
      }
    }
  })
});

// 3. User post count "is" the count of user-post relations
const User = Entity.create({
  properties: [
    Property.create({
      name: 'postCount',
      computedData: Count.create({
        record: UserPostRelation
      })
    })
  ]
});
```

### Correct Ways of Data Changes

Data changes are **declared** (not operated) through the following methods:

1. **Transform**: Declare "when a certain event occurs, certain data should exist"
2. **Count/Every/Any**: Declare "certain data is the computed result of other data"
3. **StateMachine**: Declare "how states transition based on events"

### Creating Entities - Reactive Way

```javascript
// 1. Define blog creation interaction
const CreateBlogPost = Interaction.create({
  name: 'CreateBlogPost',
  action: Action.create({
    name: 'createBlogPost'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
});

// 2. Create blog posts through Relation's computedData
const UserPostRelation = Relation.create({
  source: Post,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'posts',
  type: 'n:1',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateBlogPost') {
        // Return relation to be created, which will also create Post entity
        return {
          source: {
            title: event.payload.title,
            content: event.payload.content,
            status: 'draft',
            createdAt: new Date().toISOString(),
            slug: event.payload.title.toLowerCase().replace(/\s+/g, '-')
          },
          target: event.payload.authorId
        };
      }
      return null;
    }
  })
});

// 3. User's postCount property will automatically update
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'postCount',
      type: 'number',
      computedData: Count.create({
        relation: UserPostRelation,
        relationDirection: 'target'
      })
    })
  ]
});
```

### Updating Entities - Reactive Way

```javascript
// 1. Define profile update interaction
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({ name: 'updateProfile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'bio' }),
      PayloadItem.create({ name: 'avatar' })
    ]
  })
});

// 2. User properties respond to update interactions
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'name',
      type: 'string',
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateUserProfile' && 
              event.payload.userId === this.id && 
              event.payload.name) {
            return event.payload.name;
          }
          return this.name; // Keep existing value
        }
      })
    }),
    Property.create({
      name: 'bio',
      type: 'string',
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateUserProfile' && 
              event.payload.userId === this.id && 
              event.payload.bio) {
            return event.payload.bio;
          }
          return this.bio; // Keep existing value
        }
      })
    })
  ]
});
```

### Deleting Entities - Through State Management

```javascript
// 1. Define soft delete interaction
const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({ name: 'deletePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// 2. Use StateMachine to manage post status
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'draft',
      computedData: StateMachine.create({
        states: ['draft', 'published', 'deleted'],
        initialState: 'draft',
        transitions: [
          {
            from: 'draft',
            to: 'published',
            on: 'PublishPost'
          },
          {
            from: 'published',
            to: 'deleted',
            on: 'DeletePost'
          },
          {
            from: 'draft',
            to: 'deleted',
            on: 'DeletePost'
          }
        ]
      })
    })
  ]
});

// 3. Filter active posts (exclude deleted ones)
const ActivePosts = FilteredEntity.create({
  name: 'ActivePosts',
  baseEntity: Post,
  filter: function(record) {
    return record.status !== 'deleted';
  }
});
```

## Complex Interaction Examples

### Multi-Step Business Process

```javascript
// Order submission process with multiple steps
const SubmitOrder = Interaction.create({
  name: 'SubmitOrder',
  action: Action.create({ name: 'submitOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'items', isCollection: true, required: true }),
      PayloadItem.create({ name: 'shippingAddress', required: true }),
      PayloadItem.create({ name: 'paymentMethod', required: true }),
      PayloadItem.create({ name: 'couponCode' })
    ]
  })
});

// Order entity with computed properties responding to submission
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computedData: StateMachine.create({
        states: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
        initialState: 'pending',
        transitions: [
          { from: 'pending', to: 'confirmed', on: 'ConfirmPayment' },
          { from: 'confirmed', to: 'shipped', on: 'ShipOrder' },
          { from: 'shipped', to: 'delivered', on: 'ConfirmDelivery' },
          { from: 'pending', to: 'cancelled', on: 'CancelOrder' }
        ]
      })
    }),
    Property.create({
      name: 'totalAmount',
      type: 'number',
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'SubmitOrder') {
            const items = event.payload.items;
            return items.reduce((total, item) => total + (item.price * item.quantity), 0);
          }
          return this.totalAmount;
        }
      })
    })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'SubmitOrder') {
        return {
          items: event.payload.items,
          shippingAddress: event.payload.shippingAddress,
          paymentMethod: event.payload.paymentMethod,
          couponCode: event.payload.couponCode,
          userId: event.user.id,
          createdAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});
```

### Conditional Business Logic

```javascript
// Product review with approval workflow
const SubmitReview = Interaction.create({
  name: 'SubmitReview',
  action: Action.create({ name: 'submitReview' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'productId', base: Product, isRef: true }),
      PayloadItem.create({ name: 'rating', required: true }),
      PayloadItem.create({ name: 'content', required: true })
    ]
  })
});

const Review = Entity.create({
  name: 'Review',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computedData: Transform.create({
        record: InteractionEventEntity,
        dataDeps: {
          user: {
            type: 'property',
            attributeQuery: ['trustLevel']
          }
        },
        callback: function(event, dataDeps) {
          if (event.interactionName === 'SubmitReview') {
            const userTrustLevel = dataDeps.user?.trustLevel || 0;
            
            // Auto-approve reviews from trusted users
            if (userTrustLevel >= 80) {
              return 'approved';
            }
            
            // Reviews with low ratings require manual approval
            if (event.payload.rating <= 2) {
              return 'pending_review';
            }
            
            return 'pending';
          }
          return this.status;
        }
      })
    })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'SubmitReview') {
        return {
          productId: event.payload.productId,
          rating: event.payload.rating,
          content: event.payload.content,
          userId: event.user.id,
          createdAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});
```

## Permission Control and Security

### Basic Permission Checks

```javascript
// Interaction with permission requirements
const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({ name: 'deletePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  }),
  // Permission logic should be implemented through Attributive
});

// Use Attributive for permission control
const DeletePostPermission = Attributive.create({
  name: 'canDeletePost',
  type: 'boolean',
  record: InteractionEventEntity,
  computation: function(interactionEvent) {
    if (interactionEvent.interactionName === 'DeletePost') {
      const user = interactionEvent.user;
      const postId = interactionEvent.payload.postId;
      
      // Admin can delete any post
      if (user.role === 'admin') {
        return true;
      }
      
      // Author can delete their own post
      // This would need to be checked against the actual post data
      return false; // Simplified for example
    }
    return true;
  }
});
```

### Role-Based Permission Control

```javascript
// Content moderation interaction
const ModerateContent = Interaction.create({
  name: 'ModerateContent',
  action: Action.create({ name: 'moderateContent' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'contentId', required: true }),
      PayloadItem.create({ name: 'action', required: true }), // approve, reject, flag
      PayloadItem.create({ name: 'reason' })
    ]
  })
});

// Permission check through Attributive
const ModerationPermission = Attributive.create({
  name: 'canModerateContent',
  type: 'boolean',
  record: InteractionEventEntity,
  computation: function(interactionEvent) {
    if (interactionEvent.interactionName === 'ModerateContent') {
      const user = interactionEvent.user;
      
      // Only moderators and admins can moderate content
      return ['moderator', 'admin'].includes(user.role);
    }
    return true;
  }
});
```

## Using Transform to Listen to Interactions and Create Data

Transform is a core concept in InterAQT, used to listen to events in the system (such as interaction events) and reactively create or update data.

### Listening to Interaction Events to Create Relations

```javascript
// 1. Define like post interaction
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// 2. Define like relation, using Transform to listen to interaction events
const LikeRelation = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likedBy',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'likedAt',
      type: 'string'
    })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'LikePost') {
        return {
          source: event.payload.userId,
          target: event.payload.postId,
          likedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});

// 3. Post's like count will be automatically calculated
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      type: 'number',
      computedData: Count.create({
        relation: LikeRelation,
        relationDirection: 'target'
      })
    })
  ]
});
```

## Using StateMachine for State Management

StateMachine is used to manage entity state changes and can automatically transition states based on interaction events.

### Basic State Machine Example

```javascript
import { StateMachine, StateNode } from 'interaqt';

// 1. Define state-related interactions
const PayOrder = Interaction.create({
  name: 'PayOrder',
  action: Action.create({ name: 'payOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', isRef: true, base: Order }),
      PayloadItem.create({ name: 'paymentMethod', type: 'string' }),
      PayloadItem.create({ name: 'amount', type: 'number' })
    ]
  })
});

const ShipOrder = Interaction.create({
  name: 'ShipOrder',
  action: Action.create({ name: 'shipOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', isRef: true, base: Order }),
      PayloadItem.create({ name: 'trackingNumber', type: 'string' })
    ]
  })
});

// 2. Define state nodes
const PendingState = StateNode.create({ name: 'pending' });
const PaidState = StateNode.create({ name: 'paid' });
const ShippedState = StateNode.create({ name: 'shipped' });
const DeliveredState = StateNode.create({ name: 'delivered' });

// 3. Create order state machine
const OrderStateMachine = StateMachine.create({
  name: 'OrderStatus',
  states: [PendingState, PaidState, ShippedState, DeliveredState],
  defaultState: PendingState,
  transitions: [
    {
      from: PendingState,
      to: PaidState,
      on: PayOrder
    },
    {
      from: PaidState,
      to: ShippedState,
      on: ShipOrder
    }
  ]
});

// 4. Use state machine in order entity
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computedData: OrderStateMachine
    }),
    // Calculate other properties based on state
    Property.create({
      name: 'canCancel',
      type: 'boolean',
      computed: function(order) {
        return order.status === 'pending' || order.status === 'paid';
      }
    }),
    Property.create({
      name: 'paymentInfo',
      type: 'object',
      computedData: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'PayOrder' && event.payload.orderId === this.id) {
            return {
              method: event.payload.paymentMethod,
              amount: event.payload.amount,
              paidAt: new Date().toISOString()
            };
          }
          return null;
        }
      })
    })
  ]
});
```

## Executing Interactions

### Basic Execution

```javascript
// Use controller.callInteraction to execute interactions
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user123', name: 'John' },  // User context
  payload: {
    title: 'My First Post',
    content: 'This is the content of my first post.',
    authorId: 'user123'
  }
});

console.log('Interaction result:', result);
```

### Finding and Executing Interactions

```javascript
// Find interaction by name
const createPostInteraction = Interaction.instances.find(i => i.name === 'CreatePost');

if (createPostInteraction) {
  const result = await controller.callInteraction(createPostInteraction.name, {
    user: { id: 'user123' },
    payload: {
      title: 'Another Post',
      content: 'More content',
      authorId: 'user123'
    }
  });
}
```

### Executing Interactions in Activities

```javascript
// Execute interaction as part of an activity
const result = await controller.callActivityInteraction(
  'activity-id',
  'interaction-id', 
  'activity-instance-id',
  {
    user: { id: 'user123' },
    payload: { /* ... */ }
  }
);
```

## Error Handling

### Parameter Validation Errors

```javascript
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user123' },
  payload: {
    title: '',  // Empty title will trigger validation error
    // content missing
    authorId: 'invalid-user-id'
  }
});

if (result.error) {
  console.log('Error type:', result.error.type);
  console.log('Error message:', result.error.message);
}
```

### Permission Errors

```javascript
const result = await controller.callInteraction('DeletePost', {
  user: { id: 'user456' },  // Not the author
  payload: {
    postId: 'post123'
  }
});

if (result.error) {
  console.log('Permission denied:', result.error);
}
```

### Business Logic Errors

In reactive systems, business logic errors are usually prevented through computed properties and conditions:

```javascript
// Use Every to ensure sufficient inventory
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'isValid',
      type: 'boolean',
      computedData: Every.create({
        record: OrderItemRelation,
        relationDirection: 'source',
        callback: function(orderItem) {
          // Check if each order item has sufficient product inventory
          return orderItem.product.stock >= orderItem.quantity;
        }
      })
    })
  ]
});
```

## Best Practices for Interactions

### 1. Design Appropriate Interaction Granularity

```javascript
// ✅ Good design: Atomic operations
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

const UnlikePost = Interaction.create({
  name: 'UnlikePost',
  action: Action.create({ name: 'unlikePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// ❌ Avoid: Overly complex interactions
const ManagePostLike = Interaction.create({
  name: 'ManagePostLike',
  action: Action.create({ name: 'managePostLike' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'action' }),
      // One interaction handling multiple operations increases complexity
      PayloadItem.create({ name: 'userId', base: User, isRef: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});
```

### 2. Use Meaningful Naming

```javascript
// ✅ Clear naming
const SubmitLeaveRequest = Interaction.create({ 
  name: 'SubmitLeaveRequest',
  action: Action.create({ name: 'submitLeaveRequest' })
});
const ApproveLeaveRequest = Interaction.create({ 
  name: 'ApproveLeaveRequest',
  action: Action.create({ name: 'approveLeaveRequest' })
});
const PublishBlogPost = Interaction.create({ 
  name: 'PublishBlogPost',
  action: Action.create({ name: 'publishBlogPost' })
});

// ❌ Vague naming
const DoAction = Interaction.create({ 
  name: 'DoAction',
  action: Action.create({ name: 'doAction' })
});
const ProcessData = Interaction.create({ 
  name: 'ProcessData',
  action: Action.create({ name: 'processData' })
});
const HandleRequest = Interaction.create({ 
  name: 'HandleRequest',
  action: Action.create({ name: 'handleRequest' })
});
```

### 3. Leverage Reactive Features

```javascript
// ✅ Fully leverage reactive computations
// Define simple interactions
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'authorId', base: User, isRef: true })
    ]
  })
});

// Data changes automatically handled through reactive definitions
const UserPostRelation = Relation.create({
  // ... relation definition
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreatePost') {
        // Automatically create relations and entities
        return { /* ... */ };
      }
    }
  })
});

// User's postCount automatically updates
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'postCount',
      type: 'number',
      computedData: Count.create({
        relation: UserPostRelation,
        relationDirection: 'target'
      })
    })
  ]
});
```

Interactions are the bridge connecting user operations and data changes in InterAQT. By properly designing interactions and combining them with the framework's reactive features, you can create business logic systems that are both easy to understand and efficiently executed. Remember: interactions only define "what to do", while the specific "how to do it" is implemented through reactive computations. 