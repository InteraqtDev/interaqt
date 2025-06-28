# How to Use Reactive Computations

⚠️ **Prerequisite: Please read [00-mindset-shift.md](./00-mindset-shift.md) first to understand declarative thinking**

Reactive computation is the core feature of the InterAQT framework. Its essence is **declaring what data is**, rather than specifying how to compute data.

## Core Mindset: What Data "Is", Not "How to Compute"

### ❌ Wrong Mindset: Trying to Compute Data
```javascript
// Wrong: Trying to write "how to compute" logic
function updateLikeCount(postId) {
  const likes = db.query('SELECT COUNT(*) FROM likes WHERE postId = ?', postId);
  db.update('posts', { likeCount: likes }, { id: postId });
}
```

### ✅ Correct Mindset: Declare What Data Is
```javascript
// Correct: Declare that like count "is" the count of like relations
Property.create({
  name: 'likeCount',
  computedData: Count.create({
    record: LikeRelation  // Like count is the Count of like relations
  })
})
```

## Basic Concepts of Reactive Computation

### What is Reactive Computation

Reactive computation is a **declarative way of defining data**:
- **Declarative**: You declare what data "is", not "how to compute"
- **Automatically maintained**: When dependent data changes, computed results update automatically
- **Incremental computation**: Framework uses efficient incremental algorithms to avoid unnecessary recomputation
- **Persistent**: Computation results are stored in the database for fast queries

### Core Principle: Data Existence

In InterAQT, all data has its "reason for existence":
- User post count **exists** because it is the Count of user-post relations
- Order total amount **exists** because it is the weighted sum of order items
- Product inventory **exists** because it is initial inventory minus sales quantity
- Notification records **exist** because they are Transform results of specific interaction events

### Reactive Computation vs Regular Computed Properties

```javascript
// Regular computed property: Recalculates every time it's queried
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      type: 'number',
      getValue: async (record) => {
        // Database query executed every time accessed
        return await controller.count('Like', { post: record.id });
      }
    })
  ]
});

// Reactive computation: Results are cached, only updated when data changes
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: likeRelation  // Pass relation instance, not entity
      })  // Automatically maintained, high performance
    })
  ]
});
```

## Using Count for Counting

Count is the most commonly used reactive computation type for counting relations or entities.

### Basic Usage

```javascript
import { Entity, Property, Relation, Count } from 'interaqt';

// Define entities and relations
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' })
  ]
});

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    // Use Count to calculate like count
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: Like
      })
    })
  ]
});

const Like = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likers',
  type: 'n:n'
});
```

### Count with Filter Conditions

Count supports using callback functions to filter records:

```javascript
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })
  ]
});

// Count published posts for a user
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['status']}]],
        callback: function(relation) {
          return relation.target.status === 'published'
        }
      })
    })
  ]
});

const UserPostRelation = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
});
```

### Dynamic Filtering Based on Data Dependencies

Count supports dataDeps parameter for dynamic filtering based on global data or other data sources:

```javascript
// Count high-score posts based on global score threshold
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'highScorePostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['score']}]],
        dataDeps: {
          scoreThreshold: {
            type: 'global',
            source: Dictionary.create({
              name: 'highScoreThreshold',
              type: 'number',
              collection: false
            })
          }
        },
        callback: function(relation, dataDeps) {
          return relation.target.score >= dataDeps.scoreThreshold
        }
      })
    })
  ]
});

// Global active user count based on global active days setting
const activeUsersCount = Dictionary.create({
  name: 'activeUsersCount',
  type: 'number',
  collection: false,
  computedData: Count.create({
    record: User,
    attributeQuery: ['lastLoginDate'],
    dataDeps: {
      activeDays: {
        type: 'global',
        source: Dictionary.create({
          name: 'userActiveDays',
          type: 'number',
          collection: false
        })
      }
    },
    callback: function(user, dataDeps) {
      const daysSinceLogin = (Date.now() - new Date(user.lastLoginDate).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceLogin <= dataDeps.activeDays
    }
  })
});
```

### Relation Direction Control

For relation counting, use the direction parameter to specify counting direction:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Count posts authored by user
    Property.create({
      name: 'authoredPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPostRelation,
        direction: 'target'  // From user perspective to posts
      })
    }),
    // Count following relationships as follower
    Property.create({
      name: 'followingCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: FollowRelation,
        direction: 'target'  // From user perspective to followed users
      })
    })
  ]
});
```

### Attribute Query Optimization

Use attributeQuery parameter to optimize data fetching, only querying attributes needed for computation:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'completedTaskCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserTaskRelation,
        attributeQuery: [['target', {attributeQuery: ['status', 'completedAt']}]],
        callback: function(relation) {
          const task = relation.target
          return task.status === 'completed' && task.completedAt !== null
        }
      })
    })
  ]
});
```

### Real-time Update Mechanism

When related data changes, Count automatically updates:

```javascript
// When user likes a post
const likePost = async (userId, postId) => {
  // Create like relation
  await controller.createRelation('Like', {
    source: userId,
    target: postId
  });
  
  // likeCount will automatically +1, no manual update needed
};

// When user unlikes a post
const unlikePost = async (userId, postId) => {
  // Remove like relation
  await controller.removeRelation('Like', {
    source: userId,
    target: postId
  });
  
  // likeCount will automatically -1
};
```

## Using WeightedSummation for Weighted Sums

WeightedSummation is used to calculate weighted totals, commonly used for calculating total scores, total prices, etc.

### Basic Usage

```javascript
// Order item entity
const OrderItem = Entity.create({
  name: 'OrderItem',
  properties: [
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({
      name: 'subtotal',
      type: 'number',
      getValue: (record) => record.quantity * record.price
    })
  ]
});

// Order entity
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'orderNumber', type: 'string' }),
    // Calculate order total amount
    Property.create({
      name: 'totalAmount',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: OrderItems,
        attributeQuery: [['target', { attributeQuery: ['quantity', 'price'] }]],
        callback: (relation) => ({
          weight: 1,
          value: relation.target.quantity * relation.target.price
        })
      })
    })
  ]
});

const OrderItems = Relation.create({
  source: Order,
  sourceProperty: 'items',
  target: OrderItem,
  targetProperty: 'order',
  relType: 'one:many'
});
```

### Defining Weight Functions

Use functions to define more complex weight calculations:

```javascript
// Student grade entity
const Grade = Entity.create({
  name: 'Grade',
  properties: [
    Property.create({ name: 'subject', type: 'string' }),
    Property.create({ name: 'score', type: 'number' }),
    Property.create({ name: 'credit', type: 'number' })  // Credits
  ]
});

// Student entity
const Student = Entity.create({
  name: 'Student',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Calculate weighted average score (GPA)
    Property.create({
      name: 'gpa',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: StudentGrades,
        callback: (relation) => ({
          weight: relation.target.credit,
          value: relation.target.score
        })
      })
    }),
    // Calculate total credits
    Property.create({
      name: 'totalCredits',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: StudentGrades,
        callback: (relation) => ({
          weight: 1,
          value: relation.target.credit
        })
      })
    })
  ]
});
```

### Conditional Summation

Add conditions to only sum records that meet specific criteria:

```javascript
const Student = Entity.create({
  name: 'Student',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Only count credits for passed subjects
    Property.create({
      name: 'passedCredits',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: StudentGrades,
        callback: (relation) => {
          // Only count subjects with score >= 60
          if (relation.target.score >= 60) {
            return { weight: 1, value: relation.target.credit }
          }
          return { weight: 0, value: 0 }
        }
      })
    })
  ]
});
```

## Using Every and Any for Conditional Checks

Every and Any are used to check whether elements in a collection meet specific conditions.

### Every: Check All Elements Meet Condition

```javascript
const Task = Entity.create({
  name: 'Task',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'status', type: 'string' })  // pending, completed
  ]
});

const Project = Entity.create({
  name: 'Project',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Check if all tasks are completed
    Property.create({
      name: 'isCompleted',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: ProjectTasks,
        callback: (relation) => relation.target.status === 'completed'
      })
    })
  ]
});

const ProjectTasks = Relation.create({
  source: Project,
  sourceProperty: 'tasks',
  target: Task,
  targetProperty: 'project',
  relType: 'one:many'
});
```

### Any: Check Any Element Meets Condition

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'role', type: 'string' })
  ]
});

const Project = Entity.create({
  name: 'Project',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Check if project has admin
    Property.create({
      name: 'hasAdmin',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Any.create({
        record: ProjectMember,
        callback: (relation) => relation.role === 'admin'
      })
    })
  ]
});

const ProjectMember = Relation.create({
  source: Project,
  sourceProperty: 'members',
  target: User,
  targetProperty: 'projects',
  relType: 'many:many',
  properties: [
    Property.create({ name: 'role', type: 'string', defaultValue: 'member' })
  ]
});
```

### Complex Conditional Checks

Use more complex conditional expressions:

```javascript
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'status', type: 'string' }),
    // Check if all order items are in stock
    Property.create({
      name: 'allItemsInStock',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: OrderItems,
        callback: (relation) => {
          const item = relation.target;
          return item.quantity > 0 && item.stockQuantity >= item.quantity;
        }
      })
    }),
    // Check if any high-value items exist
    Property.create({
      name: 'hasHighValueItem',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Any.create({
        record: OrderItems,
        callback: (relation) => {
          const item = relation.target;
          return (item.quantity * item.price) > 1000;
        }
      })
    })
  ]
});
```

## Using Transform for Data Transformation

Transform is the most flexible reactive computation type, allowing you to define custom transformation logic.

### Basic Usage

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    // Use Transform to generate full name
    Property.create({
      name: 'fullName',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: User,
        callback: (record) => `${record.firstName} ${record.lastName}`
      })
    })
  ]
});
```

### Transform Based on Related Data

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Generate user tag summary
    Property.create({
      name: 'tagSummary',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: UserTag,
        callback: (tags) => {
          if (tags.length === 0) return 'No tags';
          if (tags.length <= 3) return tags.map(t => t.name).join(', ');
          return `${tags.slice(0, 3).map(t => t.name).join(', ')} and ${tags.length - 3} more`;
        }
      })
    })
  ]
});
```

### Aggregation Computation

Transform can be used for complex aggregation calculations:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    // Calculate user activity statistics
    Property.create({
      name: 'activityStats',
      type: 'object',
      defaultValue: () => ({}),
      computedData: Transform.create({
        record: UserPosts,
        callback: (posts) => {
          const now = new Date();
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          
          const recentPosts = posts.filter(p => new Date(p.createdAt) > oneWeekAgo);
          const monthlyPosts = posts.filter(p => new Date(p.createdAt) > oneMonthAgo);
          
          return {
            totalPosts: posts.length,
            recentPosts: recentPosts.length,
            monthlyPosts: monthlyPosts.length,
            averageLikes: posts.reduce((sum, p) => sum + (p.likeCount || 0), 0) / posts.length || 0
          };
        }
      })
    })
  ]
});
```

### Data Format Transformation

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'currency', type: 'string', defaultValue: 'USD' }),
    // Format price display
    Property.create({
      name: 'formattedPrice',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: Product,
        callback: (record) => {
          const currencySymbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'CNY': '¥'
          };
          const symbol = currencySymbols[record.currency] || record.currency;
          return `${symbol}${record.price.toFixed(2)}`;
        }
      })
    })
  ]
});
```

### Transform from Interaction Data: Core of Declarative Data Transformation

One of the most important use cases for Transform is **transforming from user interaction data to other business data**. This embodies the core philosophy of InterAQT framework: **everything is data, data transforms from data**.

#### Core Concept: Interactions Are Data, Data Transforms from Data

In InterAQT, user interactions (Interaction) are themselves data, stored in InteractionEventEntity. Transform is not the traditional "event-driven + callback" pattern, but **declarative data transformation relationships**:

> Declaration: DirectorMemo **is** the result of transforming InteractionEventEntity through certain transformation rules

This differs from traditional event-driven approaches:
- **Traditional event-driven**: When event occurs → Execute callback function → Manually create data
- **InterAQT Transform**: Declare how one type of data transforms from another type of data

```typescript
// ❌ Wrong mindset: Imperatively create data manually in interaction handling
async function handleUserLogin(userId) {
  await createLoginRecord(userId);
  
  // Manual checking and creation - this is imperative "how to do"
  const loginCount = await getLoginCountThisMonth(userId);
  if (loginCount >= 10) {
    await createActivityReward(userId, 'frequent_user');
  }
}

// ✅ Correct mindset: Declaratively define data transformation relationships
// ActivityReward "is what": transformation result of qualifying InteractionEventEntity
const ActivityReward = Entity.create({
  name: 'ActivityReward',
  properties: [
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user', 'createdAt'],
    dataDeps: {
      users: {
        type: 'records',
        source: User,
        attributeQuery: ['username', 'monthlyLoginCount']
      }
    },
    callback: (interactionEvents, dataDeps) => {
      // Transform essence: define data transformation rules
      // Input: InteractionEventEntity data + dependency data
      // Output: ActivityReward data (or null)
      
      return interactionEvents
        .filter(event => event.interactionName === 'userLogin')
        .map(event => {
          const user = dataDeps.users.find(u => u.id === event.user.id);
          
          // Declare transformation condition: when user monthly login count >= 10, this interaction data transforms to reward data
          if (user && user.monthlyLoginCount >= 10) {
            return {
              type: 'frequent_user',
              description: `${user.username} received active user reward`,
              createdAt: event.createdAt,
              userId: user.id
            };
          }
          
          // Return null when transformation condition not met (this interaction doesn't produce reward data)
          return null;
        })
        .filter(reward => reward !== null);
    }
  })
});
```

#### Transform's Conditional Transformation: null Return Mechanism

Transform supports returning `null` to indicate "some input data doesn't participate in transformation", which is the core mechanism for implementing conditional transformation:

```typescript
// Leave system example: memos generated from leave interactions
const DirectorMemo = Entity.create({
  name: 'DirectorMemo',
  properties: [
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'priority', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' })
  ],
  computedData: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user', 'payload', 'createdAt'],
    dataDeps: {
      users: {
        type: 'records',
        source: User,
        attributeQuery: ['username', 'currentMonthLeaveCount']
      }
    },
    callback: (interactionEvents, dataDeps) => {
      // Declare data transformation relationship:
      // Input: submitLeaveRequest interaction data + user data
      // Output: qualifying DirectorMemo data
      
      return interactionEvents
        .filter(event => event.interactionName === 'submitLeaveRequest')
        .map(event => {
          const user = dataDeps.users.find(u => u.id === event.user.id);
          
          // Transformation rule: when user's current month leave count >= 3, this interaction data transforms to memo data
          if (user && user.currentMonthLeaveCount >= 3) {
            return {
              content: `${user.username} taking leave for the ${user.currentMonthLeaveCount}th time this month, needs attention`,
              priority: user.currentMonthLeaveCount >= 5 ? 'urgent' : 'high',
              createdAt: event.createdAt
            };
          }
          
          // Key: return null when transformation condition not met, indicating this interaction data doesn't transform to memo
          return null;
        })
        .filter(memo => memo !== null); // Filter out data that doesn't participate in transformation
    }
  })
});
```

#### One-to-Many Transform: One Interaction Data Transforms to Multiple Data Types

In real business scenarios, one interaction data can often transform into multiple different business data types, demonstrating the powerful capability of Transform's declarative transformation:

```typescript
// Declare how user order interaction data transforms into multiple business data types:
// InteractionEventEntity (createOrder) → Order, InventoryChange, PointsReward

const OrderInteraction = Interaction.create({
  name: 'createOrder',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderData', base: Order }),
      PayloadItem.create({ name: 'items', base: OrderItem, isCollection: true })
    ]
  })
});

// 1. Order records (primary transformation)
// Declaration: Order data is direct transformation of createOrder interaction data
Order.computedData = Transform.create({
  record: InteractionEventEntity,
  callback: (interactionEvents) => {
    return interactionEvents
      .filter(event => event.interactionName === 'createOrder')
      .map(event => ({
        ...event.payload.orderData,
        createdAt: event.createdAt,
        userId: event.user.id
      }));
  }
});

// 2. Inventory change records (derivative transformation)
// Declaration: InventoryChange data is transformed from product information extracted from createOrder interaction data
const InventoryChange = Entity.create({
  name: 'InventoryChange',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: (interactionEvents) => {
      const changes = [];
      
      interactionEvents
        .filter(event => event.interactionName === 'createOrder')
        .forEach(event => {
          // Extract order items from interaction data, transform to inventory change data
          event.payload.items.forEach(item => {
            changes.push({
              productId: item.productId,
              changeAmount: -item.quantity,
              reason: 'order_created',
              orderId: event.id,
              createdAt: event.createdAt
            });
          });
        });
      
      return changes;
    }
  })
});

// 3. Points reward (conditional transformation)
// Declaration: PointsReward data is transformation result of createOrder interaction data meeting amount condition
const PointsReward = Entity.create({
  name: 'PointsReward',
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: (interactionEvents) => {
      return interactionEvents
        .filter(event => event.interactionName === 'createOrder')
        .map(event => {
          const orderTotal = event.payload.orderData.totalAmount;
          
          // Transformation condition: only order interaction data with amount > 100 transforms to points reward
          if (orderTotal > 100) {
            return {
              userId: event.user.id,
              points: Math.floor(orderTotal / 10),
              reason: 'order_reward',
              orderId: event.id,
              createdAt: event.createdAt
            };
          }
          
          return null; // Small order interaction data doesn't transform to points
        })
        .filter(reward => reward !== null);
    }
  })
});
```

#### Interaction-Driven vs State-Driven Choice

Choose transformation from interaction data or state data based on business semantics:

```typescript
// Interaction-driven: suitable for "each X interaction may transform to Y data"
// Emphasizes: specific interaction behavior itself produces specific business data
const LoginBonusPoints = Entity.create({
  name: 'LoginBonusPoints',
  computedData: Transform.create({
    record: InteractionEventEntity, // Transform from interaction data
    callback: (interactionEvents) => {
      return interactionEvents
        .filter(event => event.interactionName === 'userLogin')
        .map(event => {
          // Each login interaction may transform to login reward data
          return isFirstLoginToday(event) ? createLoginBonus(event) : null;
        })
        .filter(bonus => bonus !== null);
    }
  })
});

// State-driven: suitable for "when entity state is X, Y data should exist"
// Emphasizes: derive data based on entity's current state
const VIPStatus = Entity.create({
  name: 'VIPStatus',
  computedData: Transform.create({
    record: User, // Transform from user state data
    callback: (users) => {
      return users
        .filter(user => user.totalSpent > 10000) // State transformation condition
        .map(user => ({
          userId: user.id,
          level: calculateVIPLevel(user.totalSpent),
          activatedAt: new Date().toISOString()
        }));
    }
  })
});
```

#### Best Practices

1. **Prioritize interaction-driven**: When business data is directly related to user behavior
2. **Clear data lineage**: Every Transform-generated data can trace back to specific source data
3. **Good use of null returns**: Make conditional transformation logic concise and clear
4. **One data source, multiple Transforms**: Don't handle all transformation logic in one Transform

```typescript
// ✅ Good practice: separation of transformation responsibilities
Order.computedData = Transform.create({ /* Only responsible for transforming to order data */ });
InventoryChange.computedData = Transform.create({ /* Only responsible for transforming to inventory change data */ });
PointsReward.computedData = Transform.create({ /* Only responsible for transforming to points reward data */ });

// ❌ Bad practice: mixed transformation responsibilities
Order.computedData = Transform.create({
  callback: (interactionEvents) => {
    // Here both transforming to orders, inventory changes, and points...
  }
});
```

**Core Understanding**: Transform's essence is **declarative data transformation relationships**, not traditional event callbacks. Each user interaction data can transform into multiple business data types, this **data→data** transformation mapping makes business logic clear, maintainable, and automatically responsive.

**Key Difference**:
- **Traditional event-driven**: When event occurs → Execute callback function → Manually create data
- **InterAQT Transform**: Declare data transformation relationships → Framework automatically maintains → Target data automatically updates when source data changes

## Using StateMachine for State Management

StateMachine is used for state transition-based computations, particularly suitable for workflow and state management scenarios.

### Basic State Machine

```javascript
import { StateMachine } from 'interaqt';

const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'orderNumber', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      computation: new StateMachine({
        states: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
        initialState: 'pending',
        transitions: [
          { from: 'pending', to: 'paid', condition: 'payment_received' },
          { from: 'paid', to: 'shipped', condition: 'order_shipped' },
          { from: 'shipped', to: 'delivered', condition: 'delivery_confirmed' },
          { from: 'pending', to: 'cancelled', condition: 'order_cancelled' },
          { from: 'paid', to: 'cancelled', condition: 'order_cancelled' }
        ]
      })
    })
  ]
});
```

### Event-Based State Transitions

```javascript
// Define state transition events
const PaymentReceived = Interaction.create({
  name: 'PaymentReceived',
  action: Action.create({
    name: 'recordPayment',
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'orderId', base: Order, isRef: true }),
        PayloadItem.create({ name: 'amount' }),
        PayloadItem.create({ name: 'paymentMethod' })
      ]
    })
  })
});

// State machine listens to these events and automatically transitions states
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({
      name: 'status',
      type: 'string',
      computation: new StateMachine({
        states: ['pending', 'paid', 'shipped', 'delivered'],
        initialState: 'pending',
        transitions: [
          { 
            from: 'pending', 
            to: 'paid', 
            on: 'PaymentReceived'  // Listen to interaction events
          },
          { 
            from: 'paid', 
            to: 'shipped', 
            on: 'OrderShipped' 
          }
        ]
      })
    })
  ]
});
```

### Conditional State Transitions

```javascript
const LeaveRequest = Entity.create({
  name: 'LeaveRequest',
  properties: [
    Property.create({ name: 'employeeId', type: 'string' }),
    Property.create({ name: 'startDate', type: 'string' }),
    Property.create({ name: 'endDate', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      computation: new StateMachine({
        states: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
        initialState: 'draft',
        transitions: [
          {
            from: 'draft',
            to: 'submitted',
            on: 'SubmitRequest',
            condition: (record) => record.reason && record.startDate && record.endDate
          },
          {
            from: 'submitted',
            to: 'approved',
            on: 'ApproveRequest',
            condition: (record, context) => context.user.role === 'manager'
          },
          {
            from: 'submitted',
            to: 'rejected',
            on: 'RejectRequest',
            condition: (record, context) => context.user.role === 'manager'
          }
        ]
      })
    })
  ]
});
```

## Using RealTime for Real-time Computations

RealTime computation is a core feature in the InterAQT framework for handling time-sensitive data and business logic. It allows you to declare time-based computations and automatically manages computation state and recomputation timing.

### Understanding Real-time Computation

#### What is Real-time Computation

Real-time computation is a **time-aware reactive computation**:
- **Time-driven**: Computation based on current time
- **Automatic scheduling**: System automatically manages when to recompute
- **State persistence**: Computation state is persistently stored
- **Critical point awareness**: Can calculate critical time points for state changes

```typescript
// Traditional time-related logic problems
function checkBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  return hour >= 9 && hour <= 17;
}

// Problems:
// 1. Need manual polling to check
// 2. Cannot predict state change time points
// 3. State is not persistent

// Using RealTime declarative solution
const isBusinessHours = Dictionary.create({
  name: 'isBusinessHours',
  type: 'boolean',
  computedData: RealTime.create({
    callback: async (now: Expression, dataDeps) => {
      const hour = now.divide(3600000).modulo(24); // Hour number
      return hour.gt(9).and(hour.lt(17));
    }
  })
});

// ✅ System automatically manages when to recompute
// ✅ Automatically calculates critical change time points (9am and 5pm)
// ✅ State persistently stored
```

#### RealTime vs Regular Computation

| Feature | RealTime Computation | Regular Reactive Computation |
|---------|---------------------|------------------------------|
| **Trigger Method** | Time-driven + Data-driven | Data-driven only |
| **Computation Input** | Current time + Data dependencies | Data dependencies only |
| **Schedule Management** | Automatic time scheduling | Data change triggered only |
| **State Management** | Dual state tracking | No special state |
| **Critical Prediction** | Supports critical time point calculation | Not applicable |

### RealTime Basic Usage

#### Creating Real-time Computation

```typescript
import { RealTime, Expression, Dictionary } from 'interaqt';

// Basic real-time computation: current timestamp (seconds)
const currentTimestamp = Dictionary.create({
  name: 'currentTimestamp',
  type: 'number',
  computedData: RealTime.create({
    nextRecomputeTime: (now: number, dataDeps: any) => 1000, // Update every second
    callback: async (now: Expression, dataDeps: any) => {
      return now.divide(1000); // Convert to seconds
    }
  })
});
```

#### Expression Type Computation

Expression type computations return numerical results, suitable for various mathematical operations:

```typescript
// Complex time computation
const timeBasedMetric = Dictionary.create({
  name: 'timeBasedMetric',
  type: 'number',
  computedData: RealTime.create({
    nextRecomputeTime: (now: number, dataDeps: any) => 5000, // Update every 5 seconds
    dataDeps: {
      config: {
        type: 'records',
        source: configEntity,
        attributeQuery: ['multiplier']
      }
    },
    callback: async (now: Expression, dataDeps: any) => {
      const multiplier = dataDeps.config?.[0]?.multiplier || 1;
      const timeInSeconds = now.divide(1000);
      const timeInMinutes = now.divide(60000);
      
      // Composite calculation: (time seconds * coefficient) + √(time minutes)
      return timeInSeconds.multiply(multiplier).add(timeInMinutes.sqrt());
    }
  })
});
```

#### Inequality Type Computation

Inequality type computations return boolean results, and the system automatically calculates critical time points for state changes:

```typescript
// Time threshold check
const isAfterDeadline = Dictionary.create({
  name: 'isAfterDeadline',
  type: 'boolean',
  computedData: RealTime.create({
    dataDeps: {
      project: {
        type: 'records',
        source: projectEntity,
        attributeQuery: ['deadline']
      }
    },
    callback: async (now: Expression, dataDeps: any) => {
      const deadline = dataDeps.project?.[0]?.deadline || Date.now() + 86400000;
      
      // Check if current time exceeds deadline
      return now.gt(deadline);
      // System will automatically recompute at deadline time point
    }
  })
});
```

#### Equation Type Computation

Equation type is used for time equation calculations, also automatically calculates critical time points:

```typescript
// Check if it's exact hour time
const isExactHour = Dictionary.create({
  name: 'isExactHour',
  type: 'boolean',
  computedData: RealTime.create({
    callback: async (now: Expression, dataDeps: any) => {
      const millisecondsInHour = 3600000;
      
      // Check if current time is exact hour
      return now.modulo(millisecondsInHour).eq(0);
      // System will automatically calculate next exact hour time for recomputation
    }
  })
});
```

### Property-level Real-time Computation

#### Defining Property-level Real-time Computation

```typescript
// Define real-time computation on entity properties
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'lastLoginAt', type: 'number'}),
    
    // Real-time computation: whether user is recently active
    Property.create({
      name: 'isRecentlyActive',
      type: 'boolean',
      computedData: RealTime.create({
        dataDeps: {
          _current: {
            type: 'property',
            attributeQuery: ['lastLoginAt']
          }
        },
        callback: async (now: Expression, dataDeps: any) => {
          const lastLogin = dataDeps._current?.lastLoginAt || 0;
          const oneHourAgo = now.subtract(3600000);
          
          // Check if user logged in within the last hour
          return Expression.number(lastLogin).gt(oneHourAgo);
        }
      })
    }),
    
    // Real-time computation: user online duration (minutes)
    Property.create({
      name: 'onlineMinutes',
      type: 'number',
      computedData: RealTime.create({
        nextRecomputeTime: (now: number, dataDeps: any) => 60000, // Update every minute
        dataDeps: {
          _current: {
            type: 'property',
            attributeQuery: ['lastLoginAt']
          }
        },
        callback: async (now: Expression, dataDeps: any) => {
          const lastLogin = dataDeps._current?.lastLoginAt || now.evaluate({now: Date.now()});
          
          // Calculate online duration (minutes)
          return now.subtract(lastLogin).divide(60000);
        }
      })
    })
  ]
});
```

#### Property-level State Management

Property-level real-time computation state is stored on each record:

```typescript
// When querying user data, state fields are automatically included
const user = await system.storage.findOne('User', 
  BoolExp.atom({key: 'id', value: ['=', userId]}),
  undefined,
  ['*'] // Include all fields, including state fields
);

// user object will contain:
// {
//   id: 1,
//   username: 'john',
//   lastLoginAt: 1234567890000,
//   isRecentlyActive: true,
//   onlineMinutes: 45.2,
//   // State fields (automatically generated field names):
//   _record_boundState_User_isRecentlyActive_lastRecomputeTime: 1234567890123,
//   _record_boundState_User_isRecentlyActive_nextRecomputeTime: 1234567891000,
//   _record_boundState_User_onlineMinutes_lastRecomputeTime: 1234567890456,
//   _record_boundState_User_onlineMinutes_nextRecomputeTime: 1234567950456
// }
```

### RealTime State Management

#### State Fields

Each RealTime computation has two state fields:

- **lastRecomputeTime**: Timestamp of last computation
- **nextRecomputeTime**: Timestamp of next computation

```typescript
// State field naming rules
// Global computation: _global_boundState_{computationName}_{stateName}
// Property computation: _record_boundState_{entityName}_{propertyName}_{stateName}

// Example state field names:
// _global_boundState_currentTimestamp_lastRecomputeTime
// _global_boundState_currentTimestamp_nextRecomputeTime
// _record_boundState_User_isRecentlyActive_lastRecomputeTime
// _record_boundState_User_isRecentlyActive_nextRecomputeTime
```

#### State Computation Logic

State calculation depends on return value type:

```typescript
// Expression type: nextRecomputeTime = lastRecomputeTime + nextRecomputeTime function return value
RealTime.create({
  nextRecomputeTime: (now: number, dataDeps: any) => 1000, // Recompute in 1 second
  callback: async (now: Expression, dataDeps: any) => {
    return now.divide(1000); // Return Expression
  }
  // nextRecomputeTime will be lastRecomputeTime + 1000
});

// Inequality/Equation type: nextRecomputeTime = solve() result
RealTime.create({
  callback: async (now: Expression, dataDeps: any) => {
    const deadline = 1640995200000; // 2022-01-01 00:00:00
    return now.gt(deadline); // Return Inequality
  }
  // nextRecomputeTime will be 1640995200000 (critical time point)
});
```

### RealTime Practical Application Scenarios

#### Business Hours Check

```typescript
// Working hours check
const isWorkingHours = Dictionary.create({
  name: 'isWorkingHours',
  type: 'boolean',
  computedData: RealTime.create({
    dataDeps: {
      schedule: {
        type: 'records',
        source: scheduleEntity,
        attributeQuery: ['startTime', 'endTime', 'timezone']
      }
    },
    callback: async (now: Expression, dataDeps: any) => {
      const schedule = dataDeps.schedule?.[0] || {};
      const startTime = schedule.startTime || 9;  // 9 AM
      const endTime = schedule.endTime || 17;     // 5 PM
      
      // Calculate current hour (considering timezone)
      const currentHour = now.divide(3600000).modulo(24);
      
      return currentHour.gt(startTime).and(currentHour.lt(endTime));
    }
  })
});
```

#### User Session Management

```typescript
// User session expiration check
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'lastActivityAt', type: 'number'}),
    
    Property.create({
      name: 'sessionExpired',
      type: 'boolean',
      computedData: RealTime.create({
        dataDeps: {
          _current: {
            type: 'property',
            attributeQuery: ['lastActivityAt']
          },
          settings: {
            type: 'records',
            source: settingsEntity,
            attributeQuery: ['sessionTimeout']
          }
        },
        callback: async (now: Expression, dataDeps: any) => {
          const lastActivity = dataDeps._current?.lastActivityAt || 0;
          const timeout = dataDeps.settings?.[0]?.sessionTimeout || 3600000; // 1 hour
          const expireTime = lastActivity + timeout;
          
          return now.gt(expireTime);
        }
      })
    })
  ]
});
```

### RealTime Performance Optimization and Best Practices

#### Set Appropriate Recomputation Intervals

```typescript
// ✅ Set appropriate intervals based on business needs
const highFrequency = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 1000,    // High frequency: every second
  callback: async (now, dataDeps) => {
    // For critical metrics requiring real-time updates
    return now.divide(1000);
  }
});

const mediumFrequency = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 60000,   // Medium frequency: every minute
  callback: async (now, dataDeps) => {
    // For general business status checks
    return now.modulo(3600000).eq(0);
  }
});

const lowFrequency = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 3600000, // Low frequency: every hour
  callback: async (now, dataDeps) => {
    // For report statistics and other non-critical data
    return now.divide(86400000);
  }
});

// ❌ Avoid overly frequent updates
const tooFrequent = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => 100,     // Every 100ms update, may affect performance
  callback: async (now, dataDeps) => now.divide(1000)
});
```

#### Proper Use of Inequality/Equation Types

```typescript
// ✅ Use Inequality to let system automatically calculate optimal recomputation time
const smartScheduling = RealTime.create({
  // No need for nextRecomputeTime function
  callback: async (now, dataDeps) => {
    const deadline = 1640995200000;
    return now.gt(deadline); // System will automatically recompute at deadline time point
  }
});

// ❌ Unnecessary manual scheduling
const manualScheduling = RealTime.create({
  nextRecomputeTime: (now, dataDeps) => {
    const deadline = 1640995200000;
    return deadline - now; // Manual interval calculation, not as good as letting system handle automatically
  },
  callback: async (now, dataDeps) => {
    const deadline = 1640995200000;
    return now.evaluate({now: Date.now()}) > deadline;
  }
});
```

## Combining Multiple Computation Types

In real applications, you typically need to combine multiple computation types:

```javascript
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    
    // Count: Count likes
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PostLikes
      })
    }),
    
    // Count: Count comments
    Property.create({
      name: 'commentCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: PostComments
      })
    }),
    
    // WeightedSummation: Calculate total engagement score
    Property.create({
      name: 'engagementScore',
      type: 'number',
      defaultValue: () => 0,
      computedData: WeightedSummation.create({
        record: PostInteractions,
        callback: (relation) => {
          const interaction = relation.target;
          switch (interaction.type) {
            case 'like': return { weight: 1, value: 1 };
            case 'comment': return { weight: 1, value: 3 };
            case 'share': return { weight: 1, value: 5 };
            default: return { weight: 0, value: 0 };
          }
        }
      })
    }),
    
    // Transform: Generate content summary
    Property.create({
      name: 'summary',
      type: 'string',
      defaultValue: () => '',
      computedData: Transform.create({
        record: Post,
        callback: (record) => {
          const content = record.content || '';
          return content.length > 100 
            ? content.substring(0, 100) + '...'
            : content;
        }
      })
    }),
    
    // Every: Check if all comments are moderated
    Property.create({
      name: 'allCommentsModerated',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Every.create({
        record: PostComments,
        callback: (relation) => relation.target.status === 'approved'
      })
    })
  ]
});
```

## Performance Optimization and Best Practices

### 1. Choose Appropriate Computation Types

```javascript
// ✅ For simple counting, use Count
Property.create({
  name: 'followerCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Count.create({
    record: Follow
  })
});

// ❌ Avoid using Transform for simple counting
Property.create({
  name: 'followerCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Transform.create({
    record: Follow,
    callback: (followers) => followers.length  // Inefficient
  })
});
```

### 2. Use Conditional Filtering Appropriately

```javascript
// ✅ Use conditional filtering in computations
Property.create({
  name: 'activeUserCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Count.create({
    record: User,
    callback: (user) => user.status === 'active'
  })
});

// ❌ Avoid filtering in Transform
Property.create({
  name: 'activeUserCount',
  type: 'number',
  defaultValue: () => 0,
  computedData: Transform.create({
    record: User,
    callback: (users) => users.filter(u => u.status === 'active').length  // Memory filtering
  })
});
```

### 3. Avoid Circular Dependencies

```javascript
// ❌ Avoid circular dependencies
const User = Entity.create({
  properties: [
    Property.create({
      name: 'score',
      type: 'number',
      defaultValue: () => 0,
      computedData: Transform.create({
        record: UserPosts,
        callback: (posts) => posts.reduce((sum, p) => sum + p.userScore, 0)
      })
    })
  ]
});

const Post = Entity.create({
  properties: [
    Property.create({
      name: 'userScore',
      type: 'number',
      defaultValue: () => 0,
      computedData: Transform.create({
        record: Post,
        callback: (record) => record.baseScore * 0.1  // Avoid circular dependency
      })
    })
  ]
});
```

### 4. Use Indexes to Optimize Queries

```javascript
// Add indexes for frequently used fields in computations
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      index: true  // Add index
    }),
    Property.create({
      name: 'publishedPostCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: UserPosts
      })
    })
  ]
});
```

## Debugging and Monitoring

### 1. Enable Computation Logging

```javascript
// Enable detailed logging in development environment
const system = new System({
  logging: {
    computation: true,
    level: 'debug'
  }
});
```

### 2. Monitor Computation Performance

```javascript
// Monitor computation execution time
const Post = Entity.create({
  properties: [
    Property.create({
      name: 'complexScore',
      type: 'number',
      computation: new Transform(
        Post,
        null,
        (record) => {
          console.time(`complexScore-${record.id}`);
          const result = /* complex computation */;
          console.timeEnd(`complexScore-${record.id}`);
          return result;
        }
      )
    })
  ]
});
```

Reactive computation is the core advantage of InterAQT. By appropriately using various computation types, you can greatly simplify business logic implementation while ensuring data consistency and system performance. 