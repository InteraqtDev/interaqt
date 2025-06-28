# Chapter 13: API Reference

This chapter provides detailed reference documentation for all core APIs in the InterAQT framework, including complete parameter descriptions, type definitions, and usage examples.

## 13.1 Entity-Related APIs

### Entity.create()

Create entity definition. Entities are the basic units of data in the system.

**Syntax**
```typescript
Entity.create(config: EntityConfig): KlassInstance<typeof Entity>
```

**Parameters**
- `config.name` (string, required): Entity name, must match `/^[a-zA-Z0-9_]+$/` format
- `config.properties` (Property[], required): Entity property list, defaults to empty array
- `config.computedData` (ComputedData[], optional): Entity-level computed data
- `config.sourceEntity` (Entity|Relation, optional): Source entity for filtered entity (used to create filtered entities)
- `config.filterCondition` (MatchExp, optional): Filter condition (used to create filtered entities)

**Examples**
```typescript
// Create basic entity
const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' })
    ]
})

// Create filtered entity
const ActiveUser = Entity.create({
    name: 'ActiveUser',
    sourceEntity: User,
    filterCondition: MatchExp.atom({
        key: 'status',
        value: ['=', 'active']
    })
})
```

### Property.create()

Create entity property definition.

**Syntax**
```typescript
Property.create(config: PropertyConfig): KlassInstance<typeof Property>
```

**Parameters**
- `config.name` (string, required): Property name, must be 1-5 characters long
- `config.type` (string, required): Property type, options: 'string' | 'number' | 'boolean'
- `config.collection` (boolean, optional): Whether it's a collection type
- `config.defaultValue` (function, optional): Default value function
- `config.computed` (function, optional): Computed property function
- `config.computedData` (ComputedData[], optional): Property computed data

**Examples**
```typescript
// Basic property
const username = Property.create({
    name: 'username',
    type: 'string'
})

// Property with default value
const createdAt = Property.create({
    name: 'createdAt',
    type: 'string',
    defaultValue: () => new Date().toISOString()
})

// Computed property
const fullName = Property.create({
    name: 'fullName',
    type: 'string',
    computed: function(user) {
        return `${user.firstName} ${user.lastName}`
    }
})

// Property with reactive computation
const postCount = Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,  // Must provide default value
    computedData: Count.create({
        record: UserPostRelation
    })
})
```

### Relation.create()

Create relationship definition between entities.

**Syntax**
```typescript
Relation.create(config: RelationConfig): KlassInstance<typeof Relation>
```

**Parameters**
- `config.source` (Entity|Relation, required): Source entity of the relationship
- `config.sourceProperty` (string, required): Relationship property name in source entity
- `config.target` (Entity|Relation, required): Target entity of the relationship
- `config.targetProperty` (string, required): Relationship property name in target entity
- `config.type` (string, required): Relationship type, options: '1:1' | '1:n' | 'n:1' | 'n:n'
- `config.properties` (Property[], optional): Properties of the relationship itself
- `config.symmetric` (boolean, optional): Whether it's a symmetric relationship (only for n:n relationships)
- `config.computedData` (ComputedData[], optional): Relationship-level computed data

**Examples**
```typescript
// One-to-many relationship
const UserPostRelation = Relation.create({
    source: User,
    sourceProperty: 'posts',
    target: Post,
    targetProperty: 'author',
    type: '1:n'
})

// Many-to-many relationship
const UserTagRelation = Relation.create({
    source: User,
    sourceProperty: 'tags',
    target: Tag,
    targetProperty: 'users',
    type: 'n:n'
})

// Symmetric relationship (friendship)
const FriendRelation = Relation.create({
    source: User,
    sourceProperty: 'friends',
    target: User,
    targetProperty: 'friends',
    type: 'n:n',
    symmetric: true
})

// Relationship with properties
const UserRoleRelation = Relation.create({
    source: User,
    sourceProperty: 'roles',
    target: Role,
    targetProperty: 'users',
    type: 'n:n',
    properties: [
        Property.create({ name: 'assignedAt', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean' })
    ]
})
```

## 13.2 Computation-Related APIs

### Count.create()

Create count computation for counting records.

**Syntax**
```typescript
Count.create(config: CountConfig): KlassInstance<typeof Count>
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to count
- `config.direction` (string, optional): Relationship direction, options: 'source' | 'target', only for relation counting
- `config.callback` (function, optional): Filter callback function, returns boolean to decide if included in count
- `config.attributeQuery` (AttributeQueryData, optional): Attribute query configuration to optimize data fetching
- `config.dataDeps` (object, optional): Data dependency configuration, format: `{[key: string]: DataDep}`

**Examples**
```typescript
// Basic global count
const totalUsers = Count.create({
    record: User
})

// Basic property count (user's post count)
const userPostCount = Property.create({
    name: 'postCount',
    type: 'number',
    defaultValue: () => 0,  // Must provide default value
    computedData: Count.create({
        record: UserPostRelation
    })
})

// Count with filter condition (only count published posts)
const publishedPostCount = Property.create({
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

// Count with data dependencies (filter based on global minimum score setting)
const highScorePostCount = Property.create({
    name: 'highScorePostCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['score']}]],
        dataDeps: {
            minScore: {
                type: 'global',
                source: Dictionary.create({
                    name: 'minScoreThreshold',
                    type: 'number',
                    collection: false
                })
            }
        },
        callback: function(relation, dataDeps) {
            return relation.target.score >= dataDeps.minScore
        }
    })
})

// Global count with filter and data dependencies
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
})

// Relation count with direction parameter
const authorPostCount = Property.create({
    name: 'authoredPostCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
        record: UserPostRelation,
        direction: 'target'  // Count related posts from user perspective
    })
})
```

### WeightedSummation.create()

Create weighted summation computation.

**Syntax**
```typescript
WeightedSummation.create(config: WeightedSummationConfig): KlassInstance<typeof WeightedSummation>
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to compute
- `config.callback` (function, required): Callback function to calculate weight and value, returns `{weight: number, value: number}`
- `config.attributeQuery` (AttributeQueryData, required): Attribute query configuration

**Examples**
```typescript
// Calculate user total score
const userTotalScore = Property.create({
    name: 'totalScore',
    type: 'number',
    defaultValue: () => 0,  // Must provide default value
    computedData: WeightedSummation.create({
        record: UserScoreRelation,
        callback: function(scoreRecord) {
            return {
                weight: scoreRecord.multiplier || 1,
                value: scoreRecord.points
            }
        }
    })
})

// Global weighted summation
const globalWeightedScore = WeightedSummation.create({
    record: ScoreRecord,
    callback: function(record) {
        return {
            weight: record.difficulty,
            value: record.score
        }
    }
})
```

### Summation.create()

Create summation computation for summing specified fields.

**Syntax**
```typescript
Summation.create(config: SummationConfig): KlassInstance<typeof Summation>
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to compute
- `config.attributeQuery` (AttributeQueryData, required): Attribute query configuration, specifies field path to sum
- `config.direction` (string, optional): Relationship direction, options: 'source' | 'target', only for relation summation

**How it works**

Summation sums the field pointed to by the leftmost path in `attributeQuery`. If any value in the path is `undefined`, `null`, `NaN`, or `Infinity`, that value will be treated as 0.

**Examples**
```typescript
// Basic global summation (sum all transaction amounts)
const totalRevenue = Dictionary.create({
    name: 'totalRevenue',
    type: 'number',
    collection: false,
    computedData: Summation.create({
        record: Transaction,
        attributeQuery: ['amount']
    })
})

// Property-level summation (calculate user's total order amount)
const userTotalSpent = Property.create({
    name: 'totalSpent',
    type: 'number',
    defaultValue: () => 0,  // Must provide default value
    computedData: Summation.create({
        record: UserOrderRelation,
        attributeQuery: [['target', {attributeQuery: ['totalAmount']}]]
    })
})

// Nested path summation (sum nested fields of related entities)
const departmentBudget = Property.create({
    name: 'totalBudget',
    type: 'number',
    defaultValue: () => 0,
    computedData: Summation.create({
        record: DepartmentProjectRelation,
        attributeQuery: [['target', {
            attributeQuery: [['budget', {
                attributeQuery: ['allocatedAmount']
            }]]
        }]]
    })
})

// Direct summation of relation properties
const totalShippingCost = Property.create({
    name: 'totalShippingCost',
    type: 'number',
    defaultValue: () => 0,
    computedData: Summation.create({
        record: OrderShipmentRelation,
        attributeQuery: ['shippingFee']  // Relation's own property
    })
})

// Global summation handling missing values
const totalBalance = Dictionary.create({
    name: 'totalBalance',
    type: 'number',
    collection: false,
    computedData: Summation.create({
        record: Account,
        attributeQuery: ['balance']  // null or undefined values treated as 0
    })
})
```

**Working with Other Computations**

If you need complex summation logic (like conditional filtering, data transformation etc.), you can first use other computations (like Transform) to calculate the needed values on records, then use Summation for simple summing:

```typescript
// First use Transform to calculate discounted price
const OrderItem = Entity.create({
    name: 'OrderItem',
    properties: [
        Property.create({ name: 'price', type: 'number' }),
        Property.create({ name: 'quantity', type: 'number' }),
        Property.create({ name: 'discountRate', type: 'number' }),
        Property.create({
            name: 'finalPrice',
            type: 'number',
            computed: function(item) {
                const subtotal = (item.price || 0) * (item.quantity || 0);
                const discount = subtotal * (item.discountRate || 0);
                return subtotal - discount;
            }
        })
    ]
});

// Then use Summation to sum computed values
const orderTotal = Property.create({
    name: 'total',
    type: 'number',
    defaultValue: () => 0,
    computedData: Summation.create({
        record: OrderItemRelation,
        attributeQuery: [['target', {attributeQuery: ['finalPrice']}]]
    })
});
```

### Every.create()

Create boolean computation that checks if all records meet a condition.

**Syntax**
```typescript
Every.create(config: EveryConfig): KlassInstance<typeof Every>
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to check
- `config.callback` (function, required): Condition check function, returns boolean
- `config.attributeQuery` (AttributeQueryData, required): Attribute query configuration
- `config.notEmpty` (boolean, optional): Return value when collection is empty

**Examples**
```typescript
// Check if user completed all required courses
const completedAllRequired = Property.create({
    name: 'completedAllRequired',
    type: 'boolean',
    defaultValue: () => false,  // Must provide default value
    computedData: Every.create({
        record: UserCourseRelation,
        callback: function(courseRelation) {
            return courseRelation.status === 'completed'
        },
        notEmpty: false
    })
})
```

### Any.create()

Create boolean computation that checks if any record meets a condition.

**Syntax**
```typescript
Any.create(config: AnyConfig): KlassInstance<typeof Any>
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to check
- `config.callback` (function, required): Condition check function, returns boolean
- `config.attributeQuery` (AttributeQueryData, required): Attribute query configuration

**Examples**
```typescript
// Check if user has any pending tasks
const hasPendingTasks = Property.create({
    name: 'hasPendingTasks',
    type: 'boolean',
    defaultValue: () => false,  // Must provide default value
    computedData: Any.create({
        record: UserTaskRelation,
        callback: function(taskRelation) {
            return taskRelation.status === 'pending'
        }
    })
})
```

### Transform.create()

Create custom transformation computation.

**Syntax**
```typescript
Transform.create(config: TransformConfig): KlassInstance<typeof Transform>
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to transform
- `config.callback` (function, required): Transformation function
- `config.attributeQuery` (AttributeQueryData, required): Attribute query configuration

**Examples**
```typescript
// Generate user summary information
const userSummary = Property.create({
    name: 'summary',
    type: 'string',
    defaultValue: () => '',  // Must provide default value
    computedData: Transform.create({
        record: User,
        callback: function(user) {
            return `${user.username} (${user.email}) - ${user.posts?.length || 0} posts`
        }
    })
})
```

### StateMachine.create()

Create state machine computation.

**Syntax**
```typescript
StateMachine.create(config: StateMachineConfig): KlassInstance<typeof StateMachine>
```

**Parameters**
- `config.states` (StateNode[], required): List of state nodes
- `config.transfers` (StateTransfer[], required): List of state transfers
- `config.defaultState` (StateNode, required): Default state

**Examples**
```typescript
// Order state machine
const OrderStateMachine = StateMachine.create({
    states: [
        StateNode.create({ name: 'pending' }),
        StateNode.create({ name: 'confirmed' }),
        StateNode.create({ name: 'shipped' }),
        StateNode.create({ name: 'delivered' })
    ],
    transfers: [
        StateTransfer.create({
            current: StateNode.create({ name: 'pending' }),
            next: StateNode.create({ name: 'confirmed' }),
            trigger: ConfirmOrderInteraction
        })
    ],
    defaultState: StateNode.create({ name: 'pending' })
})
```

### RealTime.create()

Create real-time computation for handling time-based reactive computations. Real-time computations automatically manage state (lastRecomputeTime and nextRecomputeTime) and adopt different scheduling strategies based on return type.

**Syntax**
```typescript
RealTime.create(config: RealTimeConfig): KlassInstance<typeof RealTime>
```

**Parameters**
- `config.callback` (function, required): Real-time computation callback function, accepts `(now: Expression, dataDeps: any) => Expression | Inequality | Equation`
- `config.nextRecomputeTime` (function, optional): Recomputation interval function, accepts `(now: number, dataDeps: any) => number`, only valid for Expression type
- `config.dataDeps` (object, optional): Data dependency configuration, format: `{[key: string]: DataDep}`
- `config.attributeQuery` (AttributeQueryData, optional): Attribute query configuration

**Return Types and Scheduling Behavior**
- **Expression**: Returns numeric computation result, nextRecomputeTime = lastRecomputeTime + nextRecomputeTime function return value
- **Inequality**: Returns boolean comparison result, nextRecomputeTime = solve() result (critical time point for state change)
- **Equation**: Returns boolean equation result, nextRecomputeTime = solve() result (critical time point for state change)

**State Management**

RealTime computations automatically create and manage two state fields:
- `lastRecomputeTime`: Timestamp of last computation
- `nextRecomputeTime`: Timestamp of next computation

State field naming convention:
- Global computations: `_global_boundState_{computationName}_{stateName}`
- Property computations: `_record_boundState_{entityName}_{propertyName}_{stateName}`

**Examples**

```typescript
// Expression type: manually specify recomputation interval
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

// Inequality type: system automatically calculates critical time points
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
            // System will automatically recompute at deadline time
            return now.gt(deadline);
        }
    })
});

// Equation type: check time equations
const isExactHour = Dictionary.create({
    name: 'isExactHour',
    type: 'boolean',
    computedData: RealTime.create({
        callback: async (now: Expression, dataDeps: any) => {
            const millisecondsInHour = 3600000;
            // System will automatically recompute at next exact hour
            return now.modulo(millisecondsInHour).eq(0);
        }
    })
});

// Property-level real-time computation
const userEntity = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'lastLoginAt', type: 'number' }),
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
                    return Expression.number(lastLogin).gt(oneHourAgo);
                }
            })
        })
    ]
});

// Complex data dependencies real-time computation
const businessMetrics = Dictionary.create({
    name: 'businessMetrics',
    type: 'object',
    computedData: RealTime.create({
        nextRecomputeTime: (now: number, dataDeps: any) => 300000, // Update every 5 minutes
        dataDeps: {
            config: {
                type: 'records',
                source: configEntity,
                attributeQuery: ['businessHourStart', 'businessHourEnd']
            },
            metrics: {
                type: 'records',
                source: metricsEntity,
                attributeQuery: ['dailyTarget', 'currentValue']
            }
        },
        callback: async (now: Expression, dataDeps: any) => {
            const config = dataDeps.config?.[0] || {};
            const metrics = dataDeps.metrics?.[0] || {};
            
            const startHour = config.businessHourStart || 9;
            const endHour = config.businessHourEnd || 17;
            const currentHour = now.divide(3600000).modulo(24);
            
            const isBusinessTime = currentHour.gt(startHour).and(currentHour.lt(endHour));
            const progressRate = Expression.number(metrics.currentValue || 0).divide(metrics.dailyTarget || 1);
            
            return {
                isBusinessTime: isBusinessTime.evaluate({now: Date.now()}),
                progressRate: progressRate.evaluate({now: Date.now()}),
                timestamp: now.evaluate({now: Date.now()})
            };
        }
    })
});
```

**State Access Example**

```typescript
// Get computation instance
const realTimeComputation = Array.from(controller.scheduler.computations.values()).find(
    computation => computation.dataContext.type === 'global' && 
                 computation.dataContext.id === 'currentTimestamp'
);

// Get state key names
const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
    realTimeComputation.dataContext, 
    'lastRecomputeTime', 
    realTimeComputation.state.lastRecomputeTime
);

const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
    realTimeComputation.dataContext, 
    'nextRecomputeTime', 
    realTimeComputation.state.nextRecomputeTime
);

// Read state values
const lastRecomputeTime = await system.storage.get(DICTIONARY_RECORD, lastRecomputeTimeKey);
const nextRecomputeTime = await system.storage.get(DICTIONARY_RECORD, nextRecomputeTimeKey);
```

## 13.3 Interaction-Related APIs

### Interaction.create()

Create user interaction definition.

**Syntax**
```typescript
Interaction.create(config: InteractionConfig): KlassInstance<typeof Interaction>
```

**Parameters**
- `config.name` (string, required): Interaction name
- `config.action` (Action, required): Interaction action
- `config.payload` (Payload, optional): Interaction parameters
- `config.userAttributives` (Attributive|Attributives, optional): User permission attributives
- `config.conditions` (Condition|Conditions, optional): Execution conditions
- `config.sideEffects` (SideEffect[], optional): Side effect handlers
- `config.data` (Entity|Relation, optional): Associated data entity
- `config.dataAttributives` (DataAttributive|DataAttributives, optional): Data permission attributives

**Examples**
```typescript
// Create post interaction
const CreatePostInteraction = Interaction.create({
    name: 'createPost',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'postData',
                base: Post,
                required: true
            })
        ]
    }),
    userAttributives: Attributive.create({
        name: 'AuthenticatedUser',
        content: function(target, { user }) {
            return user.id !== undefined
        }
    })
})
```

### Action.create()

Create interaction action identifier.

⚠️ **Important: Action is not an "operation" but an identifier**

Action is just a name for interaction types, like event type labels. It contains no operation logic or execution code.

**Syntax**
```typescript
Action.create(config: ActionConfig): KlassInstance<typeof Action>
```

**Parameters**
- `config.name` (string, required): Action type identifier name

**Examples**
```typescript
// These are just identifiers, containing no operation logic
const CreateAction = Action.create({ name: 'create' })
const UpdateAction = Action.create({ name: 'update' })
const DeleteAction = Action.create({ name: 'delete' })
const LikeAction = Action.create({ name: 'like' })

// ❌ Wrong understanding: thinking Action contains operation logic
const WrongAction = Action.create({ 
  name: 'create',
  execute: () => { /* ... */ }  // ❌ Action has no execute method!
})

// ✅ Correct understanding: Action is just an identifier
const CorrectAction = Action.create({ 
  name: 'create'  // That's it!
})
```

**Where is the operation logic?**

All operation logic is implemented through reactive computations (Transform, Count, etc.):

```typescript
// Interaction just declares that users can create posts
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'create' }),  // Just an identifier
  payload: Payload.create({ /* ... */ })
});

// The actual "create" logic is in Transform
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  computedData: Transform.create({
    record: InteractionEvent,
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        // This is where the actual creation logic is
        return {
          source: event.user.id,
          target: {
            title: event.payload.title,
            content: event.payload.content
          }
        };
      }
    }
  })
});
```

### Payload.create()

Create interaction parameter definition.

**Syntax**
```typescript
Payload.create(config: PayloadConfig): KlassInstance<typeof Payload>
```

**Parameters**
- `config.items` (PayloadItem[], required): Parameter item list, defaults to empty array

**Examples**
```typescript
const CreateUserPayload = Payload.create({
    items: [
        PayloadItem.create({
            name: 'userData',
            base: User,
            required: true
        }),
        PayloadItem.create({
            name: 'profileData',
            base: Profile,
            required: false
        })
    ]
})
```

### PayloadItem.create()

Create interaction parameter item.

**Syntax**
```typescript
PayloadItem.create(config: PayloadItemConfig): KlassInstance<typeof PayloadItem>
```

**Parameters**
- `config.name` (string, required): Parameter name
- `config.base` (Entity, optional): Parameter entity type, only needed when isRef is true
- `config.isRef` (boolean, optional): Whether it's a reference type, defaults to false
- `config.required` (boolean, optional): Whether it's required, defaults to false
- `config.isCollection` (boolean, optional): Whether it's a collection type, defaults to false
- `config.attributives` (Attributive|Attributives, optional): Parameter permission attributives
- `config.itemRef` (Attributive|Entity, optional): Used to reference entities defined in other interactions within Activity

**Examples**
```typescript
// Reference existing user
const userRef = PayloadItem.create({
    name: 'user',
    base: User,
    isRef: true,
    required: true
})

// Create new post data
const postData = PayloadItem.create({
    name: 'postData',
    base: Post,
    required: true,
    attributives: Attributive.create({
        name: 'ValidPost',
        content: function(post) {
            return post.title && post.content
        }
    })
})

// Collection type reference
const reviewersItem = PayloadItem.create({
    name: 'reviewers',
    base: User,
    isRef: true,
    isCollection: true,
    attributives: Attributives.create({
        content: BoolAtomData.create({data: ReviewerAttr, type: 'atom'})
    })
})

// Activity item reference
const activityItem = PayloadItem.create({
    name: 'to',
    base: User,
    isRef: true,
    attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
    itemRef: userRefB
})
```

## 13.4 Activity-Related APIs

### Activity.create()

Create business activity definition.

**Syntax**
```typescript
Activity.create(config: ActivityConfig): KlassInstance<typeof Activity>
```

**Parameters**
- `config.name` (string, required): Activity name
- `config.interactions` (Interaction[], optional): List of interactions in the activity
- `config.transfers` (Transfer[], optional): List of state transfers
- `config.groups` (ActivityGroup[], optional): List of activity groups
- `config.gateways` (Gateway[], optional): List of gateways
- `config.events` (Event[], optional): List of events

**Examples**
```typescript
const OrderProcessActivity = Activity.create({
    name: 'OrderProcess',
    interactions: [
        CreateOrderInteraction,
        ConfirmOrderInteraction,
        PayOrderInteraction,
        ShipOrderInteraction
    ],
    transfers: [
        Transfer.create({
            name: 'createToConfirm',
            source: CreateOrderInteraction,
            target: ConfirmOrderInteraction
        }),
        Transfer.create({
            name: 'confirmToPay',
            source: ConfirmOrderInteraction,
            target: PayOrderInteraction
        })
    ]
})
```

### Transfer.create()

Create activity state transfer.

**Syntax**
```typescript
Transfer.create(config: TransferConfig): KlassInstance<typeof Transfer>
```

**Parameters**
- `config.name` (string, required): Transfer name
- `config.source` (Interaction|ActivityGroup|Gateway, required): Source node
- `config.target` (Interaction|ActivityGroup|Gateway, required): Target node

**Examples**
```typescript
const ApprovalTransfer = Transfer.create({
    name: 'submitToApprove',
    source: SubmitApplicationInteraction,
    target: ApproveApplicationInteraction
})
```

### Condition.create()

Create activity execution condition.

**Syntax**
```typescript
Condition.create(config: ConditionConfig): KlassInstance<typeof Condition>
```

**Parameters**
- `config.name` (string, required): Condition name
- `config.content` (function, required): Condition judgment function

**Examples**
```typescript
const OrderValueCondition = Condition.create({
    name: 'highValueOrder',
    content: function(order) {
        return order.totalAmount > 1000
    }
})
```

## 13.5 System-Related APIs

### Controller

System controller that coordinates the work of various components.

**Constructor**
```typescript
new Controller(
    system: System,
    entities: KlassInstance<typeof Entity>[],
    relations: KlassInstance<typeof Relation>[],
    activities: KlassInstance<typeof Activity>[],
    interactions: KlassInstance<typeof Interaction>[],
    dict?: KlassInstance<typeof Property>[],
    recordMutationSideEffects?: RecordMutationSideEffect[]
)
```

**Main Methods**

#### setup(install?: boolean)
Initialize system.
```typescript
await controller.setup(true) // Create database tables
```

#### callInteraction(interactionId: string, args: InteractionEventArgs)
Call interaction.
```typescript
const result = await controller.callInteraction('createPost', {
    user: { id: 'user1' },
    payload: { postData: { title: 'Hello', content: 'World' } }
})
```

#### callActivityInteraction(activityCallId: string, interactionCallId: string, activityId: string, args: InteractionEventArgs)
Call interaction within activity.
```typescript
const result = await controller.callActivityInteraction(
    'activity-call-1',
    'interaction-call-1',
    'OrderProcess',
    { user: { id: 'user1' }, payload: { orderData: {...} } }
)
```

### System

System abstract interface that defines basic services like storage and logging.

**Interface Definition**
```typescript
interface System {
    conceptClass: Map<string, ReturnType<typeof createClass>>
    storage: Storage
    logger: SystemLogger
    setup: (entities: Entity[], relations: Relation[], states: ComputationState[], install?: boolean) => Promise<any>
}
```

### Storage

Storage layer interface providing data persistence functionality.

**Main Methods**

#### Entity/Relation Operations
```typescript
// Create record
await storage.create('User', { username: 'john', email: 'john@example.com' })

// Find single record
const user = await storage.findOne('User', MatchExp.atom({
    key: 'username',
    value: ['=', 'john']
}))

// Find multiple records
const users = await storage.find('User', MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
}))

// Update record
await storage.update('User', MatchExp.atom({
    key: 'id',
    value: ['=', 'user1']
}), { status: 'inactive' })

// Delete record
await storage.delete('User', MatchExp.atom({
    key: 'id',
    value: ['=', 'user1']
}))
```

#### KV Storage Operations
```typescript
// Set value
await storage.set('config', 'maxUsers', 1000)

// Get value
const maxUsers = await storage.get('config', 'maxUsers', 100) // Default value 100
```

## 13.6 Utility Function APIs

### MatchExp

Query expression builder for constructing complex query conditions.

#### MatchExp.atom(condition: MatchAtom)
Create atomic query condition.

**Parameters**
- `condition.key` (string): Field name, supports dot notation like 'user.profile.name'
- `condition.value` ([string, any]): Array of operator and value
- `condition.isReferenceValue` (boolean, optional): Whether it's a reference value

**Supported Operators**
- `['=', value]`: Equals
- `['!=', value]`: Not equals
- `['>', value]`: Greater than
- `['<', value]`: Less than
- `['>=', value]`: Greater than or equal
- `['<=', value]`: Less than or equal
- `['like', pattern]`: Pattern matching
- `['in', array]`: In array
- `['between', [min, max]]`: In range
- `['not', null]`: Not null

**Examples**
```typescript
// Basic condition
const condition1 = MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
})

// Range query
const condition2 = MatchExp.atom({
    key: 'age',
    value: ['between', [18, 65]]
})

// Relational query
const condition3 = MatchExp.atom({
    key: 'user.profile.city',
    value: ['=', 'Beijing']
})

// Combined conditions
const complexCondition = MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
}).and({
    key: 'age',
    value: ['>', 18]
}).or({
    key: 'vip',
    value: ['=', true]
})
```

#### MatchExp.fromObject(condition: Object)
Create query condition from object (all conditions connected with AND).

```typescript
const condition = MatchExp.fromObject({
    status: 'active',
    age: 25,
    city: 'Beijing'
})
// Equivalent to: status='active' AND age=25 AND city='Beijing'
```

### Attributive.create()

Create permission attributive for access control.

**Syntax**
```typescript
Attributive.create(config: AttributiveConfig): KlassInstance<typeof Attributive>
```

**Parameters**
- `config.name` (string, optional): Attributive name
- `config.content` (function, required): Permission judgment function
- `config.isRef` (boolean, optional): Whether it's a reference

**Examples**
```typescript
// Admin permission
const AdminAttributive = Attributive.create({
    name: 'Admin',
    content: function(target, { user }) {
        return user.role === 'admin'
    }
})

// Resource owner permission
const OwnerAttributive = Attributive.create({
    name: 'Owner',
    content: function(target, { user }) {
        return target.userId === user.id
    }
})

// Combined permissions (using BoolExp)
const AdminOrOwnerAttributives = boolExpToAttributives(
    BoolExp.atom(AdminAttributive).or(OwnerAttributive)
)
```

### BoolExp

Boolean expression builder for constructing complex logical expressions.

#### BoolExp.atom(data: T)
Create atomic expression.

```typescript
const expr1 = BoolExp.atom({ condition: 'isActive' })
const expr2 = BoolExp.atom({ condition: 'isAdmin' })

// Combined expression
const combined = expr1.and(expr2).or({ condition: 'isOwner' })
```

## Type Definitions

### Core Types

```typescript
// Entity instance types
type EntityInstance = KlassInstance<typeof Entity>
type RelationInstance = KlassInstance<typeof Relation>
type InteractionInstance = KlassInstance<typeof Interaction>
type ActivityInstance = KlassInstance<typeof Activity>

// Interaction event arguments
type InteractionEventArgs = {
    user: { id: string, [key: string]: any }
    payload?: { [key: string]: any }
    [key: string]: any
}

// Record mutation event
type RecordMutationEvent = {
    recordName: string
    type: 'create' | 'update' | 'delete'
    record?: EntityIdRef & { [key: string]: any }
    oldRecord?: EntityIdRef & { [key: string]: any }
}

// Entity reference
type EntityIdRef = {
    id: string
    _rowId?: string
    [key: string]: any
}

// Attribute query data
type AttributeQueryData = (string | [string, { attributeQuery?: AttributeQueryData }])[]
```

### Computation-Related Types

```typescript
// Computation context
type DataContext = {
    type: 'global' | 'entity' | 'relation' | 'property'
    id: string | Entity | Relation
    host?: Entity | Relation
}

// Computation dependency
type DataDep = {
    type: 'records' | 'property'
    source?: Entity | Relation
    attributeQuery?: AttributeQueryData
}

// Computation result
type ComputationResult = any
type ComputationResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data?: any
    affectedId?: string
}
```

## Usage Examples

### Complete Blog System Example

```typescript
import { Entity, Property, Relation, Interaction, Activity, Controller } from 'interaqt'

// 1. Define entities
const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({
            name: 'postCount',
            type: 'number',
            computedData: Count.create({ record: UserPostRelation })
        })
    ]
})

const Post = Entity.create({
    name: 'Post',
    properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'content', type: 'string' }),
        Property.create({
            name: 'likeCount',
            type: 'number',
            computedData: Count.create({ record: PostLikeRelation })
        })
    ]
})

// 2. Define relations
const UserPostRelation = Relation.create({
    source: User,
    sourceProperty: 'posts',
    target: Post,
    targetProperty: 'author',
    type: '1:n'
})

const PostLikeRelation = Relation.create({
    source: Post,
    sourceProperty: 'likes',
    target: User,
    targetProperty: 'likedPosts',
    type: 'n:n'
})

// 3. Define interactions
const CreatePostInteraction = Interaction.create({
    name: 'createPost',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'postData',
                base: Post,
                required: true
            })
        ]
    }),
    userAttributives: Attributive.create({
        name: 'AuthenticatedUser',
        content: function(target, { user }) {
            return user.id !== undefined
        }
    })
})

const LikePostInteraction = Interaction.create({
    name: 'likePost',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: Post,
                isRef: true,
                required: true
            })
        ]
    })
})

// 4. Create controller and initialize system
const controller = new Controller(
    system, // System implementation
    [User, Post], // Entities
    [UserPostRelation, PostLikeRelation], // Relations
    [], // Activities
    [CreatePostInteraction, LikePostInteraction] // Interactions
)

await controller.setup(true)

// 5. Use APIs
// Create post
const result = await controller.callInteraction('createPost', {
    user: { id: 'user1' },
    payload: {
        postData: {
            title: 'Hello World',
            content: 'This is my first post!'
        }
    }
})

// Like post
await controller.callInteraction('likePost', {
    user: { id: 'user2' },
    payload: {
        post: { id: result.recordId }
    }
})
```

This API reference documentation covers all core APIs of the InterAQT framework, providing complete parameter descriptions and practical usage examples. Developers can quickly get started and deeply use various framework features based on this documentation.
