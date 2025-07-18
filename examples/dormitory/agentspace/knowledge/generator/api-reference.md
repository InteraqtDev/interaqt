# Chapter 13: API Reference

This chapter provides detailed reference documentation for all core APIs in the interaqt framework, including complete parameter descriptions, type definitions, and usage examples.

## 13.1 Entity-Related APIs

### Entity.create()

Create entity definition. Entities are the basic units of data in the system.

**Syntax**
```typescript
Entity.create(config: EntityConfig): EntityInstance
```

**Parameters**
- `config.name` (string, required): Entity name, must match `/^[a-zA-Z0-9_]+$/` format
- `config.properties` (Property[], required): Entity property list, defaults to empty array
- `config.computation` (Computation[], optional): Entity-level computed data
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
Property.create(config: PropertyConfig): PropertyInstance
```

**Parameters**
- `config.name` (string, required): Property name, must be 1-5 characters long
- `config.type` (string, required): Property type, options: 'string' | 'number' | 'boolean'
- `config.collection` (boolean, optional): Whether it's a collection type
- `config.defaultValue` (function, optional): Default value function
- `config.computed` (function, optional): Computed property function
- `config.computation` (Computation, optional): Property computed data

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
    computation: Count.create({
        record: UserPostRelation
    })
})
```

### Relation.create()

Create relationship definition between entities.

**Syntax**
```typescript
Relation.create(config: RelationConfig): RelationInstance
```

**Important: Auto-Generated Relation Names**

⚠️ **DO NOT specify a `name` property when creating relations.** The framework automatically generates the relation name based on the source and target entities. For example:
- A relation between `User` and `Post` → automatically named `UserPost`
- A relation between `Post` and `Comment` → automatically named `PostComment`

**Parameters**
- `config.source` (Entity|Relation, required): Source entity of the relationship
- `config.sourceProperty` (string, required): Relationship property name in source entity
- `config.target` (Entity|Relation, required): Target entity of the relationship
- `config.targetProperty` (string, required): Relationship property name in target entity
- `config.type` (string, required): Relationship type, options: '1:1' | '1:n' | 'n:1' | 'n:n'
- `config.properties` (Property[], optional): Properties of the relationship itself
- `config.computation` (Computation, optional): Relationship-level computed data

**Note on Symmetric Relations**: The system automatically detects symmetric relations when `source === target` AND `sourceProperty === targetProperty`. There is no need to specify a `symmetric` parameter.

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
// Note: System detects symmetric relations automatically when source === target AND sourceProperty === targetProperty
const FriendRelation = Relation.create({
    source: User,
    sourceProperty: 'friends',
    target: User,
    targetProperty: 'friends',  // Same as sourceProperty - automatically symmetric
    type: 'n:n'
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
Count.create(config: CountConfig): CountInstance
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
    computation: Count.create({
        record: UserPostRelation
    })
})

// Count with filter condition (only count published posts)
const publishedPostCount = Property.create({
    name: 'publishedPostCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['status']}]],
        callback: function(relation) {
            return relation.target.status === 'published'
        }
    })
})

// Count with data dependencies (filter based on global minimum score setting)
const minScoreThreshold = Dictionary.create({
    name: 'minScoreThreshold',
    type: 'number',
    collection: false
})
const highScorePostCount = Property.create({
    name: 'highScorePostCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
        record: UserPostRelation,
        attributeQuery: [['target', {attributeQuery: ['score']}]],
        dataDeps: {
            minScore: {
                type: 'global',
                source: minScoreThreshold
            }
        },
        callback: function(relation, dataDeps) {
            return relation.target.score >= dataDeps.minScore
        }
    })
})

// Global count with filter and data dependencies
const userActiveDays = Dictionary.create({
    name: 'userActiveDays',
    type: 'number',
    collection: false
})
const activeUsersCount = Dictionary.create({
    name: 'activeUsersCount',
    type: 'number',
    collection: false,
    computation: Count.create({
        record: User,
        attributeQuery: ['lastLoginDate'],
        dataDeps: {
            activeDays: {
                type: 'global',
                source: userActiveDays
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
    computation: Count.create({
        record: UserPostRelation,
        direction: 'target'  // Count related posts from user perspective
    })
})
```

### WeightedSummation.create()

Create weighted summation computation.

**Syntax**
```typescript
WeightedSummation.create(config: WeightedSummationConfig): WeightedSummationInstance
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
    computation: WeightedSummation.create({
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
Summation.create(config: SummationConfig): SummationInstance
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
    computation: Summation.create({
        record: Transaction,
        attributeQuery: ['amount']
    })
})

// Property-level summation (calculate user's total order amount)
const userTotalSpent = Property.create({
    name: 'totalSpent',
    type: 'number',
    defaultValue: () => 0,  // Must provide default value
    computation: Summation.create({
        record: UserOrderRelation,
        attributeQuery: [['target', {attributeQuery: ['totalAmount']}]]
    })
})

// Nested path summation (sum nested fields of related entities)
const departmentBudget = Property.create({
    name: 'totalBudget',
    type: 'number',
    defaultValue: () => 0,
    computation: Summation.create({
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
    computation: Summation.create({
        record: OrderShipmentRelation,
        attributeQuery: ['shippingFee']  // Relation's own property
    })
})

// Global summation handling missing values
const totalBalance = Dictionary.create({
    name: 'totalBalance',
    type: 'number',
    collection: false,
    computation: Summation.create({
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
    computation: Summation.create({
        record: OrderItemRelation,
        attributeQuery: [['target', {attributeQuery: ['finalPrice']}]]
    })
});
```

### Every.create()

Create boolean computation that checks if all records meet a condition.

**Syntax**
```typescript
Every.create(config: EveryConfig): EveryInstance
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
    computation: Every.create({
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
Any.create(config: AnyConfig): AnyInstance
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
    computation: Any.create({
        record: UserTaskRelation,
        callback: function(taskRelation) {
            return taskRelation.status === 'pending'
        }
    })
})
```

### Transform.create()

Create custom transformation computation.

Transform is fundamentally about **transforming data from one collection to another collection**. It transforms sets of data (e.g., InteractionEventEntity → Entity/Relation, Entity → different Entity). Transform **cannot** be used for property computations within the same entity - use `getValue` for that purpose.

**Syntax**
```typescript
Transform.create(config: TransformConfig): TransformInstance
```

**Parameters**
- `config.record` (Entity|Relation, required): Entity or relation to transform from (source collection)
- `config.callback` (function, required): Transformation function that converts source data to target data
- `config.attributeQuery` (AttributeQueryData, required): Attribute query configuration


### StateMachine.create()

Create state machine computation.

**Syntax**
```typescript
StateMachine.create(config: StateMachineConfig): StateMachineInstance
```

**Parameters**
- `config.states` (StateNode[], required): List of state nodes
- `config.transfers` (StateTransfer[], required): List of state transfers
- `config.defaultState` (StateNode, required): Default state

**Examples**
```typescript
// First declare state nodes
const pendingState = StateNode.create({ name: 'pending' });
const confirmedState = StateNode.create({ name: 'confirmed' });
const shippedState = StateNode.create({ name: 'shipped' });
const deliveredState = StateNode.create({ name: 'delivered' });

// Order state machine
const OrderStateMachine = StateMachine.create({
    states: [pendingState, confirmedState, shippedState, deliveredState],
    transfers: [
        StateTransfer.create({
            current: pendingState,
            next: confirmedState,
            trigger: ConfirmOrderInteraction
        })
    ],
    defaultState: pendingState
})
```

### RealTime.create()

Create real-time computation for handling time-based reactive computations. Real-time computations automatically manage state (lastRecomputeTime and nextRecomputeTime) and adopt different scheduling strategies based on return type.

**Syntax**
```typescript
RealTime.create(config: RealTimeConfig): RealTimeInstance
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
    computation: RealTime.create({
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
    computation: RealTime.create({
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
    computation: RealTime.create({
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
            computation: RealTime.create({
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
    computation: RealTime.create({
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

### Dictionary.create()

Create global dictionary for storing system-wide state and values.

**Syntax**
```typescript
Dictionary.create(config: DictionaryConfig): DictionaryInstance
```

**Parameters**
- `config.name` (string, required): Dictionary name
- `config.type` (string, required): Value type, must be one of PropertyTypes (e.g., 'string', 'number', 'boolean', 'object', etc.)
- `config.collection` (boolean, required): Whether it's a collection type, defaults to false
- `config.args` (object, optional): Type-specific arguments (e.g., string length, number range)
- `config.defaultValue` (function, optional): Default value generator function
- `config.computation` (Computation, optional): Reactive computation for the dictionary value

**Examples**
```typescript
// Simple global counter
const userCountDict = Dictionary.create({
    name: 'userCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computation: Count.create({
        record: User
    })
})

// System configuration
const systemConfig = Dictionary.create({
    name: 'config',
    type: 'object',
    collection: false,
    defaultValue: () => ({
        maxUsers: 1000,
        maintenanceMode: false
    })
})

// Real-time values
const currentTime = Dictionary.create({
    name: 'currentTime',
    type: 'number',
    collection: false,
    computation: RealTime.create({
        nextRecomputeTime: () => 1000, // Update every second
        callback: async (now) => {
            return now.divide(1000);
        }
    })
})

// Collection type dictionary
const activeUsers = Dictionary.create({
    name: 'activeUsers',
    type: 'string',
    collection: true,
    defaultValue: () => [],
    computation: Transform.create({
        record: User,
        attributeQuery: ['id', 'lastLoginTime'],
        callback: (users) => {
            const oneHourAgo = Date.now() - 3600000;
            return users
                .filter(u => u.lastLoginTime > oneHourAgo)
                .map(u => u.id);
        }
    })
})
```

**Usage in Controller**

Dictionaries are passed as the 6th parameter to Controller:

```typescript
const controller = new Controller({
  system: system,
  entities: entities,
  relations: relations,
  activities: activities,
  interactions: interactions,
  dict: [userCountDict, systemConfig, currentTime, activeUsers],, // Dictionaries
  recordMutationSideEffects: []
});
```

### StateNode.create()

Create state node for state machine computation.

**Syntax**
```typescript
StateNode.create(config: StateNodeConfig): StateNodeInstance
```

**Parameters**
- `config.name` (string, required): State name identifier
- `config.computeValue` (function, optional): Function to compute value for this state

**Examples**
```typescript
// Simple state node
const pendingState = StateNode.create({ name: 'pending' });

// State node with computed value
const activeState = StateNode.create({
    name: 'active',
    computeValue: (context) => {
        // Compute state-specific value
        return {
            activatedAt: Date.now(),
            priority: context.priority || 'normal'
        };
    }
});
```

### StateTransfer.create()

Create state transfer for state machine computation.

**Syntax**
```typescript
StateTransfer.create(config: StateTransferConfig): StateTransferInstance
```

**Parameters**
- `config.trigger` (any, required): Trigger for the state transfer (usually an Interaction)
- `config.current` (StateNode, required): Current state node
- `config.next` (StateNode, required): Next state node
- `config.computeTarget` (function, optional): Function to dynamically compute the target state

**Examples**
```typescript
// Simple state transfer
const approveTransfer = StateTransfer.create({
    trigger: ApproveInteraction,
    current: pendingState,
    next: approvedState
});

// State transfer with dynamic target computation
const conditionalTransfer = StateTransfer.create({
    trigger: ProcessInteraction,
    current: pendingState,
    next: approvedState, // Default next state
    computeTarget: (context) => {
        // Dynamically determine next state based on context
        if (context.autoApprove) {
            return approvedState;
        } else if (context.requiresReview) {
            return reviewState;
        }
        return rejectedState;
    }
});
```

## 13.3 Interaction-Related APIs

### Interaction.create()

Create user interaction definition.

**Syntax**
```typescript
Interaction.create(config: InteractionConfig): InteractionInstance
```

**Parameters**
- `config.name` (string, required): Interaction name
- `config.action` (Action, required): Interaction action
- `config.payload` (Payload, optional): Interaction parameters
- `config.conditions` (Condition|Conditions, optional): Execution conditions
- `config.sideEffects` (SideEffect[], optional): Side effect handlers
- `config.data` (Entity|Relation, optional): Associated data entity
- `config.query` (Query, optional): Query definition for data fetching

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
    conditions: Condition.create({
        name: 'AuthenticatedUser',
        content: async function(event) {
            return event.user.id !== undefined
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
Action.create(config: ActionConfig): ActionInstance
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
  computation: Transform.create({
    record: InteractionEventEntity,
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
Payload.create(config: PayloadConfig): PayloadInstance
```

**Parameters**
- `config.items` (PayloadItem[], required): Parameter item list, defaults to empty array

**Examples**
```typescript
const CreateUserPayload = Payload.create({
    items: [
        PayloadItem.create({
            name: 'userData',
            required: true
        }),
        PayloadItem.create({
            name: 'profileData',
            required: false
        })
    ]
})
```

### PayloadItem.create()

Create interaction parameter item.

**Syntax**
```typescript
PayloadItem.create(config: PayloadItemConfig): PayloadItemInstance
```

**Parameters**
- `config.name` (string, required): Parameter name
- `config.required` (boolean, optional): Whether it's required, defaults to false
- `config.isCollection` (boolean, optional): Whether it's a collection type, defaults to false
- `config.itemRef` (Attributive|Entity, optional): Used to reference entities defined in other interactions within Activity

**Examples**
```typescript
// Reference existing user
const userRef = PayloadItem.create({
    name: 'user',
    required: true
})

// Create new post data
const postData = PayloadItem.create({
    name: 'postData',
    required: true
})

// Collection type reference
const reviewersItem = PayloadItem.create({
    name: 'reviewers',
    isCollection: true
})

// Activity item reference
const activityItem = PayloadItem.create({
    name: 'to',
    itemRef: userRefB
})
```

## 13.4 Activity-Related APIs

### Activity.create()

Create business activity definition.

**Syntax**
```typescript
Activity.create(config: ActivityConfig): ActivityInstance
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
Transfer.create(config: TransferConfig): TransferInstance
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

Create interaction execution condition. Conditions are used to determine whether an interaction can be executed based on dynamic runtime checks.

**Syntax**
```typescript
Condition.create(config: ConditionConfig): ConditionInstance
```

**Parameters**
- `config.name` (string, optional): Condition name for debugging and error messages
- `config.content` (function, required): Async condition check function with signature:
  ```typescript
  async function(this: Controller, event: InteractionEventArgs): Promise<boolean>
  ```

**Function Context**
The `content` function is called with:
- `this`: The Controller instance, providing access to system storage and other services
- `event`: The interaction event containing:
  - `event.user`: The user executing the interaction
  - `event.payload`: The interaction payload data
  - Other event properties based on the interaction context

**Return Values**
- `true`: Condition passes, interaction can proceed
- `false`: Condition fails, interaction is rejected with "condition check failed" error
- `undefined`: Treated as `true` with a warning (condition might not be implemented)
- Thrown error: Caught and treated as `false`

**Examples**

```typescript
// Basic condition - check user has enough credits
const hasEnoughCredits = Condition.create({
    name: 'hasEnoughCredits',
    content: async function(this: Controller, event: any) {
        const user = await this.system.storage.findOne('User', 
            MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
            undefined,
            ['id', 'credits']
        )
        return user.credits >= 10
    }
})

// Complex condition - check based on payload data
const canAccessPremiumContent = Condition.create({
    name: 'canAccessPremiumContent',
    content: async function(this: Controller, event: any) {
        const user = await this.system.storage.findOne('User', 
            MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
            undefined,
            ['id', 'credits', 'subscriptionLevel']
        )
        const content = event.payload?.content
        
        // Regular content is always accessible
        if (!content?.isPremium) return true
        
        // Premium content requires subscription or credits
        return user.subscriptionLevel === 'premium' || user.credits >= content.creditCost
    }
})

// System state condition
const systemNotInMaintenance = Condition.create({
    name: 'systemNotInMaintenance',
    content: async function(this: Controller, event: any) {
        const system = await this.system.storage.findOne('System', 
            undefined, 
            undefined, 
            ['maintenanceMode']
        )
        return !system?.maintenanceMode
    }
})

// Using condition in interaction
const ViewContent = Interaction.create({
    name: 'viewContent',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'content', base: Content })
        ]
    }),
    conditions: canAccessPremiumContent  // Single condition
})
```

**Combining Multiple Conditions**

Use `boolExpToConditions()` to combine multiple conditions with AND/OR logic:

```typescript
import { boolExpToConditions, BoolExp } from 'interaqt'

// Define individual conditions
const userIsVerified = Condition.create({
    name: 'userIsVerified',
    content: async function(this: Controller, event: any) {
        const user = await this.system.storage.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
            undefined,
            ['isVerified']
        )
        return user?.isVerified === true
    }
})

const hasPublishPermission = Condition.create({
    name: 'hasPublishPermission',
    content: async function(this: Controller, event: any) {
        const user = await this.system.storage.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
            undefined,
            ['role', 'permissions']
        )
        return user.role === 'admin' || user.permissions?.includes('publish')
    }
})

// AND combination - all conditions must pass
const PublishArticle = Interaction.create({
    name: 'publishArticle',
    action: Action.create({ name: 'publish' }),
    conditions: boolExpToConditions(
        BoolExp.atom(systemNotInMaintenance)
            .and(BoolExp.atom(userIsVerified))
            .and(BoolExp.atom(hasPublishPermission))
    )
})

// OR combination - at least one condition must pass
const ModerateContent = Interaction.create({
    name: 'moderateContent',
    action: Action.create({ name: 'moderate' }),
    conditions: boolExpToConditions(
        BoolExp.atom(isAdmin).or(BoolExp.atom(isModerator))
    )
})

// Complex combination - (A AND B) OR C
const SpecialAccess = Interaction.create({
    name: 'specialAccess',
    action: Action.create({ name: 'access' }),
    conditions: boolExpToConditions(
        BoolExp.atom(userIsVerified)
            .and(BoolExp.atom(hasSubscription))
            .or(BoolExp.atom(isAdmin))
    )
})
```

**Best Practices**

1. **Always handle async operations properly**: Use await for all storage queries
2. **Return explicit boolean values**: Avoid implicit conversions
3. **Provide meaningful condition names**: Helps with debugging when conditions fail
4. **Handle missing data gracefully**: Check for null/undefined before accessing properties
5. **Keep conditions focused**: Each condition should check one specific rule
6. **Use storage attributeQuery**: Only fetch the fields you need for performance

**Error Handling**

When a condition fails or throws an error, the interaction call returns:
```typescript
{
    error: {
        type: 'condition check failed',
        message: 'condition check failed'
    }
}
```

## 13.5 System-Related APIs

### Controller

System controller that coordinates the work of various components.

**Constructor**
```typescript
new Controller({
    system: System,
    entities: EntityInstance[],
    relations: RelationInstance[],
    activities: ActivityInstance[],
    interactions: InteractionInstance[],
    dict?: DictionaryInstance[],  // Note: This is for global dictionaries, NOT computations
    recordMutationSideEffects?: RecordMutationSideEffect[]
})
```

⚠️ **IMPORTANT**: Controller does NOT accept a computations parameter. All computations should be defined within the `computation` field of Entity/Relation/Property definitions. The 6th parameter `dict` is for global dictionary definitions (Dictionary.create), not for computation definitions.

**Main Methods**

#### setup(install?: boolean)
Initialize system.
```typescript
await controller.setup(true) // Create database tables
```

#### callInteraction(interactionName: string, args: InteractionEventArgs)
Call interaction.

**Return Type**
```typescript
type InteractionCallResponse = {
  // Contains error information if the interaction failed
  error?: unknown
  
  // For GET interactions: contains the retrieved data
  data?: unknown
  
  // The interaction event that was processed
  event?: InteractionEvent
  
  // Record mutations (create/update/delete) that occurred
  effects?: RecordMutationEvent[]
  
  // Results from side effects defined in the interaction
  sideEffects?: {
    [effectName: string]: {
      result?: unknown
      error?: unknown
    }
  }
  
  // Additional context (e.g., activityId for activity interactions)
  context?: {
    [key: string]: unknown
  }
}
```

**Example**
```typescript
const result = await controller.callInteraction('createPost', {
    user: { id: 'user1' },
    payload: { postData: { title: 'Hello', content: 'World' } }
})

// Check for errors
if (result.error) {
    console.error('Interaction failed:', result.error)
    return
}

// Access created record ID from effects
const createdPostId = result.effects?.[0]?.record?.id

// Check side effects
if (result.sideEffects?.emailNotification?.error) {
    console.warn('Email notification failed')
}
```

#### callActivityInteraction(activityName: string, interactionName: string, activityId: string, args: InteractionEventArgs)
Call interaction within activity.
```typescript
const result = await controller.callActivityInteraction(
    'OrderProcess',
    'confirmOrder',
    'activity-instance-1',
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

#### Transaction Operations

**beginTransaction(transactionName?: string)**
Begin a database transaction.
```typescript
await storage.beginTransaction('updateOrder')
```

**commitTransaction(transactionName?: string)**
Commit a database transaction.
```typescript
await storage.commitTransaction('updateOrder')
```

**rollbackTransaction(transactionName?: string)**
Rollback a database transaction.
```typescript
await storage.rollbackTransaction('updateOrder')
```

#### Entity/Relation Operations

🔴 **CRITICAL: Always specify attributeQuery parameter!**
- Without `attributeQuery`, only the `id` field is returned
- This is a common source of bugs in tests and applications
- Always explicitly list all fields you need

**find(entityName: string, matchExpression?: MatchExpressionData, modifier?: ModifierData, attributeQuery?: AttributeQueryData)**
Find multiple records matching the criteria.

**Parameters**
- `entityName` (string): Name of the entity to query
- `matchExpression` (MatchExpressionData, optional): Query conditions
- `modifier` (ModifierData, optional): Query modifiers (limit, offset, orderBy, etc.)
- `attributeQuery` (AttributeQueryData, optional but critical): Fields to retrieve

```typescript
// ✅ CORRECT: Returns all specified fields
const users = await storage.find('User', 
  MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
  { limit: 10, orderBy: { createdAt: 'desc' } },
  ['id', 'username', 'email', 'lastLoginDate']
)
```

**findOne(entityName: string, matchExpression?: MatchExpressionData, modifier?: ModifierData, attributeQuery?: AttributeQueryData)**
Find a single record matching the criteria.

**Parameters**
- Same as `find()` but returns only the first result

```typescript
// ✅ CORRECT: Returns all specified fields
const user = await storage.findOne('User', 
  MatchExp.atom({ key: 'email', value: ['=', 'user@example.com'] }),
  undefined,
  ['id', 'name', 'email', 'role', 'createdAt']
)
```

**create(entityName: string, data: any, events?: RecordMutationEvent[])**
Create a new record.

**Parameters**
- `entityName` (string): Name of the entity
- `data` (any): Entity data (do NOT include id field)
- `events` (RecordMutationEvent[], optional): Mutation events array

```typescript
const user = await storage.create('User', { 
  username: 'john', 
  email: 'john@example.com',
  role: 'user'
})
// Returns created record with generated id
```

**update(entityName: string, matchExpression: MatchExpressionData, data: any, events?: RecordMutationEvent[])**
Update existing records.

**Parameters**
- `entityName` (string): Name of the entity
- `matchExpression` (MatchExpressionData): Which records to update
- `data` (any): Fields to update
- `events` (RecordMutationEvent[], optional): Mutation events array

```typescript
await storage.update('User', 
  MatchExp.atom({ key: 'id', value: ['=', userId] }), 
  { status: 'inactive', lastModified: Date.now() }
)
```

**delete(entityName: string, matchExpression: MatchExpressionData, events?: RecordMutationEvent[])**
Delete records.

**Parameters**
- `entityName` (string): Name of the entity
- `matchExpression` (MatchExpressionData): Which records to delete
- `events` (RecordMutationEvent[], optional): Mutation events array

```typescript
await storage.delete('User', 
  MatchExp.atom({ key: 'id', value: ['=', userId] })
)
```

#### Relation-Specific Operations

**findRelationByName(relationName: string, matchExpression?: MatchExpressionData, modifier?: ModifierData, attributeQuery?: AttributeQueryData)**
Find relation records by relation name.

```typescript
const userPosts = await storage.findRelationByName('UserPostRelation',
  MatchExp.atom({ key: 'source.id', value: ['=', userId] }),
  { limit: 10 },
  ['id', 'createdAt', ['target', { attributeQuery: ['title', 'status'] }]]
)
```

**findOneRelationByName(relationName: string, matchExpression: MatchExpressionData, modifier?: ModifierData, attributeQuery?: AttributeQueryData)**
Find a single relation record by relation name.

```typescript
const relation = await storage.findOneRelationByName('UserPostRelation',
  MatchExp.atom({ key: 'id', value: ['=', relationId] }),
  undefined,
  ['*']
)
```

**addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, data?: any, events?: RecordMutationEvent[])**
Create a relation between two entities by their IDs.

```typescript
// Create relation between user and post
await storage.addRelationByNameById('UserPostRelation', 
  userId, 
  postId,
  { createdAt: Date.now() }  // Optional relation properties
)
```

**updateRelationByName(relationName: string, matchExpression: MatchExpressionData, data: any, events?: RecordMutationEvent[])**
Update relation properties (cannot update source/target).

```typescript
await storage.updateRelationByName('UserPostRelation',
  MatchExp.atom({ key: 'id', value: ['=', relationId] }),
  { priority: 'high' }  // Only update relation properties
)
```

**removeRelationByName(relationName: string, matchExpression: MatchExpressionData, events?: RecordMutationEvent[])**
Remove relations.

```typescript
await storage.removeRelationByName('UserPostRelation',
  MatchExp.atom({ key: 'id', value: ['=', relationId] })
)
```

#### KV Storage Operations

**get(itemName: string, id: string, initialValue?: any)**
Get value from key-value storage.

```typescript
// Get value with default
const maxUsers = await storage.get('config', 'maxUsers', 100)
```

**set(itemName: string, id: string, value: any, events?: RecordMutationEvent[])**
Set value in key-value storage.

```typescript
// Set configuration value
await storage.set('config', 'maxUsers', 1000)

// Store complex objects
await storage.set('cache', 'userPreferences', {
  theme: 'dark',
  language: 'en',
  notifications: true
})
```

#### Utility Methods

**getRelationName(entityName: string, attributeName: string)**
Get the internal relation name for an entity's relation property.

```typescript
const relationName = storage.getRelationName('User', 'posts')
// Returns something like 'User_posts_author_Post'
```

**getEntityName(entityName: string, attributeName: string)**
Get the target entity name for a relation property.

```typescript
const targetEntity = storage.getEntityName('User', 'posts')
// Returns 'Post'
```

**listen(callback: RecordMutationCallback)**
Register a callback to listen for record mutations.

```typescript
storage.listen(async (events) => {
  for (const event of events) {
    console.log(`${event.type} on ${event.recordName}`, event.record)
  }
})
```

#### AttributeQueryData Format

AttributeQuery specifies which fields to retrieve and supports nested queries for relations:

```typescript
type AttributeQueryData = (string | [string, { attributeQuery?: AttributeQueryData }])[]

// Examples:
// Simple fields
['id', 'name', 'email']

// All fields
['*']

// Nested relation query
[
  'id', 
  'name',
  ['posts', { 
    attributeQuery: ['title', 'status', 'createdAt'] 
  }]
]

// Multi-level nesting
[
  'id',
  ['posts', { 
    attributeQuery: [
      'title',
      ['comments', { 
        attributeQuery: ['content', 'author'] 
      }]
    ] 
  }]
]
```

#### ModifierData Format

Modifiers control query behavior:

```typescript
type ModifierData = {
  limit?: number
  offset?: number
  orderBy?: {
    [field: string]: 'asc' | 'desc'
  }
}

// Example
{
  limit: 20,
  offset: 40,
  orderBy: {
    createdAt: 'desc',
    priority: 'asc'
  }
}
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

### boolExpToConditions()

Convert BoolExp expression of Conditions to Conditions instance for use in Interaction conditions.

**Syntax**
```typescript
boolExpToConditions(expression: BoolExp<ConditionInstance>): ConditionsInstance
```

**Parameters**
- `expression`: A BoolExp expression containing Condition instances combined with AND/OR logic

**Examples**
```typescript
import { boolExpToConditions, BoolExp, Condition } from 'interaqt'

const condition1 = Condition.create({
    name: 'hasCredits',
    content: async function(this: Controller, event) {
        return event.user.credits > 0
    }
})

const condition2 = Condition.create({
    name: 'isVerified',
    content: async function(this: Controller, event) {
        return event.user.isVerified === true
    }
})

// Convert to Conditions for Interaction
const combinedConditions = boolExpToConditions(
    BoolExp.atom(condition1).and(BoolExp.atom(condition2))
)

const MyInteraction = Interaction.create({
    name: 'myInteraction',
    action: Action.create({ name: 'execute' }),
    conditions: combinedConditions
})
```

## Type Definitions

### Core Types

```typescript
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
            computation: Count.create({ record: UserPostRelation })
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
            computation: Count.create({ record: PostLikeRelation })
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
    conditions: Condition.create({
        name: 'AuthenticatedUser',
        content: async function(event) {
            return event.user.id !== undefined
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
                required: true
            })
        ]
    })
})

// 4. Create controller and initialize system
const controller = new Controller({
    system, // System implementation
    entities: [User, Post], // Entities
    relations: [UserPostRelation, PostLikeRelation], // Relations
    activities: [], // Activities
    interactions: [CreatePostInteraction, LikePostInteraction] // Interactions
})

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

This API reference documentation covers all core APIs of the interaqt framework, providing complete parameter descriptions and practical usage examples. Developers can quickly get started and deeply use various framework features based on this documentation.
