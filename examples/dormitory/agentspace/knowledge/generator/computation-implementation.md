# Computation Implementation Guide

## Overview
Computations are the reactive core of interaqt, connecting interactions to entities and enabling automatic data flow.

## 🔴 CRITICAL: Where Computations Go

### MUST Place in computation Field
```typescript
// ❌ WRONG: Declaring computations separately
const UserCreationTransform = Transform.create({...})
const controller = new Controller({

  system: system,

  entities: entities,

  relations: relations,

  activities: [],

  interactions: interactions,

  dict: computations

});

// ✅ CORRECT: Using in computation field
Property.create({
  name: 'userCount',
  type: 'number',
  defaultValue: () => 0,
  computation: Count.create({ record: User })
})
```

### Transform Restrictions
```typescript
// ❌ WRONG: Transform in Property computation
Property.create({
  name: 'status',
  computation: Transform.create({...})  // ERROR! Transform can't be used in Property
})

// ✅ CORRECT: Transform ONLY in Entity/Relation computation
Entity.create({
  name: 'Article',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      // Transform logic here
    }
  })
})
```

## Core Mindset: Declare "What Data Is"

### ❌ Wrong: Imperative "How to Compute"
```typescript
function updateLikeCount(postId) {
  const likes = db.query('SELECT COUNT(*) FROM likes WHERE postId = ?', postId);
  db.update('posts', { likeCount: likes }, { id: postId });
}
```

### ✅ Correct: Declarative "What It Is"
```typescript
Property.create({
  name: 'likeCount',
  type: 'number',
  defaultValue: () => 0,
  computation: Count.create({
    record: LikeRelation  // Like count IS the count of relations
  })
})
```

## Types of Computations

### 1. Transform - Creates Entities/Relations

**ONLY use in Entity/Relation computation, NEVER in Property!**

#### 🔴 CRITICAL: Transform Collection Conversion Concept

Transform converts one collection (source) into another collection (target). Understanding this is crucial:

1. **Collection to Collection**: Transform maps items from source collection to target collection
   - Source: InteractionEventEntity collection (all interaction events)
   - Target: Entity/Relation collection being created

2. **Callback Can Return One or Multiple Items**: The callback can return:
   - A single object → creates one record
   - An array of objects → creates multiple records from one source
   - `null`/`undefined` → creates no records
   
   ```typescript
   callback: function(event) {
     // event is ONE item from InteractionEventEntity collection
     
     // Option 1: Return single item
     return { /* single entity data */ };
     
     // Option 2: Return multiple items
     return [
       { /* first entity data */ },
       { /* second entity data */ },
       { /* third entity data */ }
     ];
     
     // Option 3: Return nothing (filter out)
     return null;
   }
   ```

3. **System Auto-generates IDs**: NEVER include `id` in callback return value
   ```typescript
   // ❌ WRONG: Including id in new entity
   callback: function(event) {
     return {
       id: uuid(),  // NEVER DO THIS!
       label: event.payload.label,
       slug: event.payload.slug
     };
   }
   
   // ✅ CORRECT: Let system generate id
   callback: function(event) {
     return {
       label: event.payload.label,
       slug: event.payload.slug
     };
   }
   ```

4. **Entity References Use ID**: When referencing existing entities in relations, use `{ id: ... }`
   ```typescript
   // ✅ CORRECT: Reference existing entity
   callback: function(event) {
     return {
       title: event.payload.title,
       author: event.user,  // event.user already has id
       category: { id: event.payload.categoryId }  // Reference by id
     };
   }
   ```

Remember: Transform is a **mapping function** that converts each matching source item into one or more target items (or none). The framework handles ID generation, storage, and relationship management.

#### 🔴 CRITICAL: InteractionEventEntity Transform Limitations

When using `InteractionEventEntity` as the Transform input source, understand these fundamental limitations:

1. **ONLY Creates, Never Updates or Deletes**
   - Transform with InteractionEventEntity can ONLY create new entities
   - It CANNOT update existing entities
   - It CANNOT delete entities

2. **Why This Limitation Exists**
   - InteractionEventEntity represents system interaction events
   - Events are **immutable** - once occurred, they never change
   - Events are **append-only** - the collection only grows, never shrinks
   - Each interaction creates a NEW event, it doesn't modify old events

3. **How to Handle Updates and Deletes**

   ```typescript
   // ❌ WRONG: Trying to update with Transform
   Entity.create({
     name: 'Style',
     computation: Transform.create({
       record: InteractionEventEntity,
       callback: function(event) {
         if (event.interactionName === 'UpdateStyle') {
           // This will CREATE a new Style, not update existing!
           return { id: event.payload.id, ... }  // WRONG!
         }
       }
     })
   })
   
   // ✅ CORRECT: Use StateMachine for updates
   Property.create({
     name: 'updatedAt',
     type: 'number',
     computation: StateMachine.create({
       states: [updatedState],
       transfers: [
         StateTransfer.create({
           trigger: UpdateStyleInteraction,
           current: updatedState,
           next: updatedState,
           computeTarget: (event) => ({ id: event.payload.id })
         })
       ]
     })
   })
   
   // ✅ CORRECT: Use soft delete with status
   Property.create({
     name: 'status',
     type: 'string',
     defaultValue: () => 'active',
     computation: StateMachine.create({
       states: [activeState, deletedState],
       transfers: [
         StateTransfer.create({
           trigger: DeleteStyleInteraction,
           current: activeState,
           next: deletedState,
           computeTarget: (event) => ({ id: event.payload.id })
         })
       ]
     })
   })
   ```

**Summary**: Think of InteractionEventEntity Transform as a "factory" that produces new entities from events. For any modifications to existing entities, use StateMachine. For deletions, use soft delete patterns with status fields.

#### Entity Creation via Transform
```typescript
import { Transform, InteractionEventEntity, Entity, Property, Interaction, Action, Payload, PayloadItem } from 'interaqt';

// Define creation interaction
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
});

// Entity with Transform
export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'thumbKey', type: 'string' }),
    Property.create({ name: 'priority', type: 'number', defaultValue: () => 0 }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'bigint', defaultValue: () => Date.now() })
  ],
  // Transform in Entity's computation property
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          description: event.payload.description || '',
          type: event.payload.type || 'default',
          thumbKey: event.payload.thumbKey || '',
          priority: event.payload.priority || 0,
          status: 'draft',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: event.user  // Creates relation automatically
        };
      }
      return null;
    }
  })
});
```

#### Relation Creation via Transform

**🔴 CRITICAL: When to Use Transform for Relations**

**Most relations are created automatically when entities are created!** You only need Transform in Relation's computation for specific scenarios:

1. **Automatic Relation Creation (MOST COMMON)**
   - When creating an entity that references another entity, the relation is created automatically
   - No Transform needed in the Relation definition
   - This covers 90% of relation creation cases

   ```typescript
   // Entity creation with automatic relation
   const Article = Entity.create({
     name: 'Article',
     computation: Transform.create({
       record: InteractionEventEntity,
       callback: function(event) {
         if (event.interactionName === 'CreateArticle') {
           return {
             title: event.payload.title,
             content: event.payload.content,
             author: event.user  // ← Relation created automatically!
           };
         }
       }
     })
   });
   
   // Relation definition - NO computation needed
   const UserArticleRelation = Relation.create({
     source: User,
     target: Article,
     type: 'n:1'
     // No computation - relation is created when Article is created
   });
   ```

2. **Transform for Relations Between Existing Entities (LESS COMMON)**
   - Only use Transform when creating relations between already existing entities
   - Examples: favorites, follows, likes, tags added later

   ```typescript
   // Only for connecting existing entities
   export const AddToFavorites = Interaction.create({
     name: 'AddToFavorites',
     action: Action.create({ name: 'addToFavorites' }),
     payload: Payload.create({
       items: [
         PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true })
       ]
     })
   });
   
   export const UserFavoriteRelation = Relation.create({
     source: User,
     sourceProperty: 'favorites',
     target: Style,
     targetProperty: 'favoritedBy',
     type: 'n:n',
     properties: [
       Property.create({ name: 'addedAt', type: 'bigint', defaultValue: () => Date.now() })
     ],
     // Transform ONLY for connecting existing entities
     computation: Transform.create({
       record: InteractionEventEntity,
       callback: function(event) {
         if (event.interactionName === 'AddToFavorites') {
           return {
             source: event.user,
             target: { id: event.payload.styleId },
             addedAt: Date.now()
           };
         }
         return null;
       }
     })
   });
   ```

**Key Principle**: Ask yourself - "Am I creating a new entity with relations, or connecting two existing entities?"
- Creating new entity → Relations created automatically through entity references
- Connecting existing entities → Use Transform in Relation's computation

### 2. StateMachine - Updates Entities

Used for status changes and field updates.

#### Basic StateMachine
```typescript
import { StateMachine, StateNode, StateTransfer } from 'interaqt';

// Define states first (must be declared before use)
const draftState = StateNode.create({ name: 'draft' });
const activeState = StateNode.create({ name: 'active' });
const offlineState = StateNode.create({ name: 'offline' });

// Define interactions
const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: Style, isRef: true, required: true })
    ]
  })
});

const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: Style, isRef: true, required: true })
    ]
  })
});

// Apply state machine to property
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: () => 'draft',
  computation: StateMachine.create({
    name: 'StyleStatus',
    states: [draftState, activeState, offlineState],
    defaultState: draftState,
    transfers: [
      StateTransfer.create({
        current: draftState,
        next: activeState,
        trigger: PublishStyle,
        computeTarget: (event) => ({ id: event.payload.id })
      }),
      StateTransfer.create({
        current: activeState,
        next: offlineState,
        trigger: DeleteStyle,
        computeTarget: (event) => ({ id: event.payload.id })
      })
    ]
  })
})
```

#### StateMachine with Value Updates
```typescript
// Track timestamps using single-state machine with computeValue
const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: Style, isRef: true, required: true }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'description' })
    ]
  })
});

// Define state node with computeValue
const updatedState = StateNode.create({
  name: 'updated',
  computeValue: () => Date.now()  // Returns timestamp when state is entered
});

Property.create({
  name: 'updatedAt',
  type: 'bigint',
  defaultValue: () => Date.now(),
  computation: StateMachine.create({
    name: 'UpdatedAt',
    states: [updatedState],
    defaultState: updatedState,
    transfers: [
      StateTransfer.create({
        current: updatedState,
        next: updatedState,  // Self-loop to same state
        trigger: UpdateStyle,
        computeTarget: (event) => ({ id: event.payload.id })
      })
    ]
  })
})
```

### 3. Count - Counts Relations/Entities

```typescript
// Count styles per user
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'styleCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: UserStyleRelation,
        direction: 'target'  // Count from user to styles
      })
    }),
    // Count with conditions
    Property.create({
      name: 'activeStyleCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: UserStyleRelation,
        direction: 'target',
        attributeQuery: [['target', { attributeQuery: ['status'] }]],
        callback: function(relation) {
          return relation.target.status === 'active';
        }
      })
    })
  ]
});

const UserStyleRelation = Relation.create({
  source: User,
  sourceProperty: 'styles',
  target: Style,
  targetProperty: 'author',
  type: '1:n'
});
```

### 4. Summation - Sums Values

```typescript
// Sum order items
const OrderItem = Entity.create({
  name: 'OrderItem',
  properties: [
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'price', type: 'number' })
  ]
});

const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'orderNumber', type: 'string' }),
    Property.create({
      name: 'totalAmount',
      type: 'number',
      defaultValue: () => 0,
      computation: WeightedSummation.create({
        record: OrderItemRelation,
        attributeQuery: [['target', { attributeQuery: ['quantity', 'price'] }]],
        callback: (relation) => ({
          weight: 1,
          value: relation.target.quantity * relation.target.price
        })
      })
    })
  ]
});

const OrderItemRelation = Relation.create({
  source: Order,
  sourceProperty: 'items',
  target: OrderItem,
  targetProperty: 'order',
  type: '1:n'
});
```

### 5. Every/Any - Boolean Checks

```typescript
// Check if all tasks completed
const Task = Entity.create({
  name: 'Task',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'isCompleted', type: 'boolean', defaultValue: () => false })
  ]
});

const Project = Entity.create({
  name: 'Project',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'isCompleted',
      type: 'boolean',
      defaultValue: () => false,
      computation: Every.create({
        record: ProjectTaskRelation,
        callback: (relation) => relation.target.isCompleted === true
      })
    }),
    Property.create({
      name: 'hasCompletedTasks',
      type: 'boolean',
      defaultValue: () => false,
      computation: Any.create({
        record: ProjectTaskRelation,
        callback: (relation) => relation.target.isCompleted === true
      })
    })
  ]
});

const ProjectTaskRelation = Relation.create({
  source: Project,
  sourceProperty: 'tasks',
  target: Task,
  targetProperty: 'project',
  type: '1:n'
});
```

### 6. Custom - Complete User Control (USE WITH CAUTION!)

```typescript
import { Custom, Controller, GlobalBoundState } from 'interaqt';
```

**🔴 WARNING: Custom should be your LAST RESORT!**

Before using Custom computation, ask yourself:
1. Can I use Transform for entity/relation creation? → Use Transform
2. Can I use StateMachine for updates? → Use StateMachine
3. Can I use Count/Summation/Every/Any for aggregations? → Use those
4. Can I use computed/getValue for simple calculations? → Use those
5. Can I combine existing computations? → Combine them

**Only use Custom when:**
- You need complex business logic that doesn't fit ANY existing computation type
- You need external API integration (but consider if this belongs in the interaction layer)
- You need complex async operations that can't be handled by other computations
- You need stateful calculations with custom persistence logic
- You need advanced data transformations that require full control

**Examples of MISUSE (DON'T do this):**
```typescript
// ❌ WRONG: Using Custom for simple count
Property.create({
  name: 'postCount',
  type: 'number',
  defaultValue: () => 0,
  computation: Custom.create({
    name: 'SimplePostCount',
    dataDeps: {
      posts: { type: 'relations', source: UserPostRelation }
    },
    compute: async function(dataDeps) {
      return dataDeps.posts.length;  // Just use Count!
    }
  })
})

// ❌ WRONG: Using Custom for entity creation
Entity.create({
  name: 'Post',
  computation: Custom.create({
    name: 'PostCreator',
    dataDeps: {
      events: { type: 'records', source: InteractionEventEntity }
    },
    compute: async function(dataDeps) {
      // This won't even work! Just use Transform!
      if (dataDeps.events.some(e => e.interactionName === 'CreatePost')) {
        // Custom can't create entities like this
      }
    }
  })
})

// ❌ WRONG: Using Custom for status updates  
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: () => 'active',
  computation: Custom.create({
    name: 'StatusUpdater',
    dataDeps: {
      deleteEvents: { type: 'records', source: InteractionEventEntity }
    },
    compute: async function(dataDeps, record) {
      // This approach doesn't work! Just use StateMachine!
      const hasDelete = dataDeps.deleteEvents.some(e => 
        e.interactionName === 'DeleteItem' && e.payload.id === record?.id
      );
      return hasDelete ? 'deleted' : 'active';
    }
  })
})
```

**Examples of PROPER use:**
```typescript
// ✅ CORRECT: Complex scoring algorithm with state
const complexScoring = Dictionary.create({
  name: 'userEngagementScore',
  type: 'object',
  defaultValue: () => ({}),
  computation: Custom.create({
    name: 'EngagementScorer',
    dataDeps: {
      users: { type: 'records', source: User, attributeQuery: ['id', 'name'] },
      userPosts: { type: 'relations', source: UserPostRelation, attributeQuery: [
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'createdAt', 'content'] }]
      ]},
      postComments: { type: 'relations', source: PostCommentRelation, attributeQuery: [
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'content', 'author'] }]
      ]},
      userLikes: { type: 'relations', source: UserPostLikeRelation, attributeQuery: [
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]}
    },
    createState: function() {
      return { scoreCache: new GlobalBoundState({}) };
    },
    compute: async function(dataDeps) {
      // Complex multi-factor scoring that doesn't fit other computations
      const scores = {};
      
      for (const user of dataDeps.users) {
        // Get user's posts through relations
        const userPostRelations = dataDeps.userPosts.filter(rel => rel.source.id === user.id);
        
        // Calculate post score with time decay
        const postScore = userPostRelations.reduce((acc, rel) => {
          const post = rel.target;
          const age = Date.now() - post.createdAt;
          const decay = Math.exp(-age / (30 * 24 * 60 * 60 * 1000)); // 30-day half-life
          
          // Count comments on this post
          const commentCount = dataDeps.postComments.filter(c => c.source.id === post.id).length;
          
          // Use content length as a proxy for quality
          const qualityFactor = post.content ? Math.min(post.content.length / 500, 2) : 1;
          
          return acc + (1 + commentCount * 0.5) * qualityFactor * decay;
        }, 0);
        
        // Count user's likes given
        const likeCount = dataDeps.userLikes.filter(rel => rel.source.id === user.id).length;
        
        // Calculate engagement score with logarithmic scaling
        const engagementScore = Math.log(1 + postScore * 2 + likeCount * 0.3);
        
        scores[user.id] = {
          userId: user.id,
          userName: user.name,
          score: engagementScore,
          breakdown: { 
            postCount: userPostRelations.length, 
            postScore: Math.round(postScore * 100) / 100, 
            likeCount 
          }
        };
      }
      
      // Cache results for future use
      if (this.state && this.state.scoreCache) {
        await this.state.scoreCache.set(scores);
      }
      
      return scores;
    },
    getDefaultValue: function() {
      return {};
    }
  })
});

// ✅ CORRECT: Complex calculation requiring multiple data sources and custom logic
const riskScoreCalculation = Dictionary.create({
  name: 'entityRiskScores',
  type: 'object',
  defaultValue: () => ({}),
  computation: Custom.create({
    name: 'RiskScoreCalculator',
    dataDeps: {
      entities: { type: 'records', source: BusinessEntity, attributeQuery: ['id', 'name', 'type', 'createdAt'] },
      transactions: { type: 'relations', source: EntityTransactionRelation, attributeQuery: [
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'amount', 'status', 'createdAt'] }]
      ]},
      compliance: { type: 'records', source: ComplianceCheck, attributeQuery: ['entityId', 'checkType', 'result', 'severity'] }
    },
    createState: function() {
      return {
        riskThresholds: new GlobalBoundState({
          low: 0,
          medium: 30,
          high: 70,
          critical: 90
        })
      };
    },
    compute: async function(dataDeps) {
      // Complex risk calculation that combines multiple factors
      const riskScores = {};
      const thresholds = this.state ? await this.state.riskThresholds.get() : {
        low: 0,
        medium: 30,
        high: 70,
        critical: 90
      };
      
      for (const entity of dataDeps.entities) {
        // Factor 1: Transaction patterns
        const entityTransactions = dataDeps.transactions.filter(rel => rel.source.id === entity.id);
        const failedTransactions = entityTransactions.filter(rel => rel.target.status === 'failed');
        const transactionRisk = (failedTransactions.length / Math.max(entityTransactions.length, 1)) * 40;
        
        // Factor 2: Compliance issues
        const entityCompliance = dataDeps.compliance.filter(c => c.entityId === entity.id);
        const criticalIssues = entityCompliance.filter(c => c.severity === 'critical').length;
        const majorIssues = entityCompliance.filter(c => c.severity === 'major').length;
        const complianceRisk = (criticalIssues * 10 + majorIssues * 5);
        
        // Factor 3: Entity age (newer entities are riskier)
        const ageInDays = (Date.now() - entity.createdAt) / (24 * 60 * 60 * 1000);
        const ageRisk = ageInDays < 30 ? 20 : (ageInDays < 90 ? 10 : 0);
        
        // Calculate final risk score with weighted factors
        const totalRisk = Math.min(100, transactionRisk + complianceRisk + ageRisk);
        
        // Determine risk level
        let riskLevel = 'low';
        if (totalRisk >= thresholds.critical) riskLevel = 'critical';
        else if (totalRisk >= thresholds.high) riskLevel = 'high';
        else if (totalRisk >= thresholds.medium) riskLevel = 'medium';
        
        riskScores[entity.id] = {
          entityId: entity.id,
          entityName: entity.name,
          score: totalRisk,
          level: riskLevel,
          factors: {
            transactionRisk,
            complianceRisk,
            ageRisk
          },
          calculatedAt: Date.now()
        };
      }
      
      return riskScores;
    },
    getDefaultValue: function() {
      return {};
    }
  })
});
```

**Custom Computation Best Practices:**
1. **Document WHY** you need Custom instead of other computations
2. **Minimize dependencies** - only include data you absolutely need
3. **Handle errors gracefully** - Custom computations can fail
4. **Consider performance** - Custom computations can be expensive
5. **Test thoroughly** - Custom logic is more prone to bugs
6. **Cache strategically** - Use state management to avoid redundant calculations

**Remember:** The power of interaqt comes from its declarative computations. Custom computation breaks this paradigm and should only be used when absolutely necessary. Always try to express your logic using the standard computation types first!

## Implementation Steps

### Step 1: Entity Creation Pattern
```typescript
// 1. Define interaction
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true })
    ]
  })
});

// 2. Entity with Transform
export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'draft'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          status: 'draft',
          createdAt: Date.now()
        };
      }
      return null;
    }
  })
});
```

### Step 2: Update Pattern with StateMachine
```typescript
// Update interaction
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: Style, isRef: true, required: true }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'description' })
    ]
  })
});

// Property with update tracking
const updatedState = StateNode.create({
  name: 'updated',
  computeValue: () => Date.now()
});

Property.create({
  name: 'updatedAt',
  type: 'bigint',
  defaultValue: () => Date.now(),
  computation: StateMachine.create({
    states: [updatedState],
    defaultState: updatedState,
    transfers: [
      StateTransfer.create({
        current: updatedState,
        next: updatedState,
        trigger: UpdateStyle,
        computeTarget: (event) => ({ id: event.payload.id })
      })
    ]
  })
})
```

### Step 3: Soft Delete Pattern
```typescript
// Delete as state transition
const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: Style, isRef: true, required: true })
    ]
  })
});

// Declare states first
const activeState = StateNode.create({ name: 'active' });
const offlineState = StateNode.create({ name: 'offline' });

// Status property handles soft delete
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: () => 'active',
  computation: StateMachine.create({
    states: [activeState, offlineState],
    defaultState: activeState,
    transfers: [
      StateTransfer.create({
        current: activeState,
        next: offlineState,
        trigger: DeleteStyle,
        computeTarget: (event) => ({ id: event.payload.id })
      })
    ]
  })
})
```

## Critical Rules

### ✅ DO
- Use Transform ONLY in Entity/Relation computation property
- Use StateMachine for updates and state management
- Use computed/getValue for simple property calculations
- Keep computations pure and side-effect free
- Declare StateNode variables before using them in StateMachine

### ❌ DON'T
- Never use Transform in Property computation
- Don't create circular dependencies
- Don't perform side effects in computations
- Don't access external services in computations
- Don't manually update computed values
- Don't create StateNode inside StateTransfer

## What to Use Where

| Computation | Where to Use | Purpose |
|------------|--------------|---------|
| Transform | Entity/Relation computation | Create new instances |
| StateMachine | Property computation | State transitions, updates |
| Count | Property computation | Count relations/entities |
| Summation/WeightedSummation | Property computation | Sum values |
| Every/Any | Property computation | Boolean checks |
| computed/getValue | Property definition | Simple derived values |
| Custom (⚠️ Last Resort) | Dictionary/Property computation | Complex logic that doesn't fit other types |

## Common Patterns

### Timestamp Tracking
```typescript
// Created at - set once
Property.create({
  name: 'createdAt',
  type: 'bigint',
  defaultValue: () => Date.now()
})

// Updated at - updates on changes
const updatedState = StateNode.create({
  name: 'updated',
  computeValue: () => Date.now()
});

Property.create({
  name: 'updatedAt',
  type: 'bigint',
  defaultValue: () => Date.now(),
  computation: StateMachine.create({
    states: [updatedState],
    defaultState: updatedState,
    transfers: [
      StateTransfer.create({
        current: updatedState,
        next: updatedState,
        trigger: UpdateInteraction,
        computeTarget: (event) => ({ id: event.payload.id })
      })
    ]
  })
})
```

### Version Management
```typescript
// Create version from style
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true })
    ]
  })
});

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'version', type: 'number' }),
    Property.create({ name: 'publishedAt', type: 'bigint' }),
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user', 'createdAt'],
    dataDeps: {
      styles: {
        type: 'records',
        source: Style,
        attributeQuery: ['*']
      }
    },
    callback: function(event, dataDeps) {
      if (event.interactionName === 'PublishStyle') {
        const style = dataDeps.styles.find(s => s.id === event.payload.styleId);
        if (style) {
          return {
            version: Date.now(), // Or use a version counter
            publishedAt: Date.now(),
            isActive: true,
            publishedBy: event.user,
            style: { id: style.id }
          };
        }
      }
      return null;
    }
  })
});
```

## Validation Checklist
- [ ] Transform only in Entity/Relation computation property
- [ ] StateMachine for all property updates
- [ ] StateNode variables declared before use in StateMachine/StateTransfer
- [ ] All entities created via Transform from interactions
- [ ] No circular dependencies
- [ ] Computations are pure functions
- [ ] Correct computation type for each use case
- [ ] TypeScript compilation passes