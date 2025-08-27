# Computation Implementation Guide

## Overview
Computations are the reactive core of interaqt, connecting interactions to entities and enabling automatic data flow.

## Types of Computations

### 1. Transform - Creates Entities/Relations

**ONLY use in Entity/Relation computation, NEVER in Property!**

#### 🔴 CRITICAL: Transform Collection Conversion Concept

Transform converts one collection (source) into another collection (target). Understanding this is crucial:

1. **Collection to Collection**: Transform maps items from source collection to target collection
   - Source: InteractionEventEntity collection (all interaction events)
   - Target: Entity/Relation collection being created

2. **Callback Can Return One or Multiple Items**: The callback can return:
   - A single object → creates one record of target type
   - An array of objects → creates multiple records of target type from one source
   - `null`/`undefined` → creates no records
   
   ```typescript
   callback: function(event) {
     // event is ONE item from InteractionEventEntity collection
     
     // Option 1: Return single item
     return { /* single entity data */ };
     
     // Option 2: Return multiple entities
     return [];
     
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
   const Style = Entity.create({
     name: 'Style'
   });
   Style.computation = Transform.create({
     record: InteractionEventEntity,
     callback: function(event) {
       if (event.interactionName === 'UpdateStyle') {
         // This will CREATE a new Style, not update existing!
         return { id: event.payload.id, ... }  // WRONG!
       }
     }
   });
   
   // ✅ CORRECT: Use StateMachine for updates
   const updatedAtProperty = Property.create({
     name: 'updatedAt',
     type: 'number'
   });
   updatedAtProperty.computation = StateMachine.create({
     states: [updatedState],
     transfers: [
       StateTransfer.create({
         trigger: UpdateStyleInteraction,
         current: updatedState,
         next: updatedState,
         computeTarget: (event) => ({ id: event.payload.id })
       })
     ]
   });
   
   // ✅ CORRECT: Use soft delete with status
   const statusProperty = Property.create({
     name: 'status',
     type: 'string'
   });
   statusProperty.computation = StateMachine.create({
     states: [activeState, deletedState],
     defaultState: activeState,  // StateMachine controls initial value
     transfers: [
       StateTransfer.create({
         trigger: DeleteStyleInteraction,
         current: activeState,
         next: deletedState,
         computeTarget: (event) => ({ id: event.payload.id })
       })
     ]
   });
   ```

**Summary**: Think of InteractionEventEntity Transform as a "factory" that produces new entities from events. For any modifications to existing entities, use StateMachine. For deletions, use soft delete patterns with status fields.

#### Entity Creation from InteractionEventEntity via Transform
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
    // 🔴 CRITICAL: Always use seconds for timestamps, not milliseconds!
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'updatedAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) })
  ]
});
// Transform in Entity's computation property
Style.computation = Transform.create({
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
        createdAt: Math.floor(Date.now()/1000),  // Always use seconds!
        updatedAt: Math.floor(Date.now()/1000),  // Always use seconds!
        lastModifiedBy: event.user  // Creates relation automatically
      };
    }
    return null;
  }
});
```

#### Created With Parent - Child Entities in Parent Transform

**When to Use**: 
- When child entities' lifecycle is completely dependent on parent entity
- **When computationDecision is expressed as `_parent:[Parent]`** - this indicates the child entity should be created through the parent's Transform computation

**Example**: Order with OrderItems

```typescript
// Order creates OrderItems atomically
export const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'orderNumber', type: 'string' }),
    Property.create({ name: 'customerName', type: 'string' })
  ]
});

export const OrderItem = Entity.create({
  name: 'OrderItem',
  properties: [
    Property.create({ name: 'productName', type: 'string' }),
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'price', type: 'number' })
  ]
});

// Define relation
export const OrderItemRelation = Relation.create({
  source: Order,
  sourceProperty: 'items',
  target: OrderItem,
  targetProperty: 'order',
  type: '1:n'
});


Order.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateOrder') {
      return {
        orderNumber: event.payload.orderNumber,
        customerName: event.payload.customerName
        items: event.payload.items // OrderItem and OrderItemRelation created with parent
      };
    }
    return null;
  }
});
```


#### Derived from Other Entities/Relations (Non-InteractionEventEntity)

Transform can also use other entities as source, not just InteractionEventEntity. This is useful for creating derived entities based on existing data.

**🔴 IMPORTANT: Establishing Relations**
When transforming from one entity to another, if you want to establish a relation between the transformed entity and the source entity, you MUST explicitly include the source entity reference in the callback return value.

```typescript
import { Transform, Entity, Property, Relation } from 'interaqt';

// Create snapshot entity from Style entity
export const StyleSnapshot = Entity.create({
  name: 'StyleSnapshot',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'snapshotTakenAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'version', type: 'number' })
  ]
});
// Transform from Style entity (not InteractionEventEntity)
StyleSnapshot.computation = Transform.create({
  record: Style,  // ← Source is Style entity, not InteractionEventEntity
  attributeQuery: ['id', 'label', 'slug', 'description', 'status'],
  callback: function(style) {
    // Only create snapshots for active styles
    if (style.status === 'active') {
      return {
        label: style.label,
        slug: style.slug,
        description: style.description || '',
        snapshotTakenAt: Math.floor(Date.now()/1000),  // In seconds
        version: Math.floor(Date.now()/1000),  // Version number in seconds
        // 🔴 CRITICAL: Must explicitly reference source entity to create relation
        originalStyle: style  // ← This creates the relation to source Style
      };
    }
    return null;  // Don't create snapshot for non-active styles
  }
});

// Define the relation between Style and StyleSnapshot
export const StyleSnapshotRelation = Relation.create({
  source: Style,
  sourceProperty: 'snapshots',
  target: StyleSnapshot,
  targetProperty: 'originalStyle',
  type: '1:n'  // One style can have many snapshots
});
```


### 2. StateMachine - Updates Entities

Used for status changes and field updates.

**🔴 IMPORTANT: StateTransfer Trigger Parameter**

The `trigger` parameter in `StateTransfer.create()` must ALWAYS be an Interaction instance reference, NOT a string!

```typescript
// ❌ WRONG: Using string as trigger
StateTransfer.create({
  trigger: 'PublishStyle',  // ERROR! Don't use string!
  current: draftState,
  next: activeState
})

// ✅ CORRECT: Using Interaction instance reference
StateTransfer.create({
  trigger: PublishStyle,  // Correct! Reference to Interaction instance
  current: draftState,
  next: activeState
})
```

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
const statusProperty = Property.create({
  name: 'status',
  type: 'string'
});
statusProperty.computation = StateMachine.create({
  name: 'StyleStatus',
  states: [draftState, activeState, offlineState],
  defaultState: draftState,  // defaultState determines initial value
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
});
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
  computeValue: () => Math.floor(Date.now()/1000)  // Returns timestamp in seconds when state is entered
});

const updatedAtProperty = Property.create({
  name: 'updatedAt',
  type: 'number'
});
updatedAtProperty.computation = StateMachine.create({
  name: 'UpdatedAt',
  states: [updatedState],
  defaultState: updatedState,  // computeValue in updatedState provides initial value
  transfers: [
    StateTransfer.create({
      current: updatedState,
      next: updatedState,  // Self-loop to same state
      trigger: UpdateStyle,
      computeTarget: (event) => ({ id: event.payload.id })
    })
  ]
});
```

#### StateMachine with Event Context in computeValue

The `computeValue` function can access the interaction event as a second parameter, allowing you to use interaction context (user, payload) in value computation:

```typescript
// Track who made changes and what was changed
const UpdateArticle = Interaction.create({
  name: 'UpdateArticle',
  action: Action.create({ name: 'updateArticle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: Article, isRef: true, required: true }),
      PayloadItem.create({ name: 'title' }),
      PayloadItem.create({ name: 'content' }),
      PayloadItem.create({ name: 'updateReason' })
    ]
  })
});

// State node that captures user and payload information
const modifiedState = StateNode.create({
  name: 'modified',
  // computeValue receives (lastValue, event) parameters
  computeValue: (lastValue, event) => {
    // Access user who triggered the update
    const modifier = event?.user?.name || event?.user?.id || 'anonymous';
    
    // Access payload to see what was changed
    const changes = [];
    if (event?.payload?.title) changes.push('title');
    if (event?.payload?.content) changes.push('content');
    
    return {
      modifiedAt: Math.floor(Date.now()/1000),
      modifiedBy: modifier,
      changedFields: changes,
      updateReason: event?.payload?.updateReason || 'No reason provided',
      // Preserve previous modification history
      previousModifications: lastValue?.previousModifications || []
    };
  }
});

// Apply to property
const modificationInfoProperty = Property.create({
  name: 'modificationInfo',
  type: 'object'
});
modificationInfoProperty.computation = StateMachine.create({
  name: 'ModificationTracker',
  states: [modifiedState],
  defaultState: modifiedState,  // computeValue in modifiedState handles initial value
  transfers: [
    StateTransfer.create({
      current: modifiedState,
      next: modifiedState,
      trigger: UpdateArticle,
      computeTarget: (event) => ({ id: event.payload.id })
    })
  ]
});

// Another example: Approval workflow with approver tracking
const ApproveRequest = Interaction.create({
  name: 'ApproveRequest',
  action: Action.create({ name: 'approveRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', base: Request, isRef: true, required: true }),
      PayloadItem.create({ name: 'comments' })
    ]
  })
});

const approvedState = StateNode.create({
  name: 'approved',
  computeValue: (lastValue, event) => {
    // Capture complete approval context from event
    return {
      status: 'approved',
      approvedAt: Math.floor(Date.now()/1000),
      approvedBy: {
        id: event?.user?.id,
        name: event?.user?.name,
        role: event?.user?.role
      },
      approvalComments: event?.payload?.comments,
      // Keep approval history
      approvalHistory: [
        ...(lastValue?.approvalHistory || []),
        {
          action: 'approved',
          timestamp: Math.floor(Date.now()/1000),
          user: event?.user?.name || 'unknown',
          comments: event?.payload?.comments
        }
      ]
    };
  }
});
```

**Key Points about Event Parameter:**
- The `event` parameter is optional and may be `undefined` during initial state setup
- Contains the full interaction context: `user`, `payload`, `interactionName`, etc.
- Useful for audit trails, tracking who made changes, and capturing interaction-specific data
- Always use optional chaining (`?.`) when accessing event properties as it may be undefined


### 3. Custom - Complete User Control (USE WITH CAUTION!)

```typescript
import { Custom, Dictionary, GlobalBoundState, Entity, Property, Relation } from 'interaqt';
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
- You need stateful calculations with custom persistence logic
- You need advanced data transformations that require full control

**Example of PROPER use:**
```typescript
// ✅ CORRECT: Complex calculation using Custom computation
const totalProductValue = Dictionary.create({
  name: 'totalProductValue',
  type: 'number',
  collection: false
});
totalProductValue.computation = Custom.create({
  name: 'TotalValueCalculator',
  dataDeps: {
    products: {
      type: 'records',
      source: Product,
      attributeQuery: ['price', 'quantity']
    }
  },
  compute: async function(dataDeps) {
    const products = dataDeps.products || [];
    const total = products.reduce((sum, p) => {
      return sum + (p.price || 0) * (p.quantity || 0);
    }, 0);
    return total;
  },
  getDefaultValue: function() {
    return 0;
  }
});

// ✅ CORRECT: Property-level Custom for computed field
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'basePrice', type: 'number' }),
    Property.create({ name: 'taxRate', type: 'number', defaultValue: () => 0.1 }),
    Property.create({ name: 'discount', type: 'number', defaultValue: () => 0 })
  ]
});

// Computed property based on other properties of same record
const finalPriceProperty = Property.create({
  name: 'finalPrice',
  type: 'number'
});
finalPriceProperty.computation = Custom.create({
  name: 'FinalPriceCalculator',
  dataDeps: {
    _current: {  // Special key for current record's properties
      type: 'property',
      attributeQuery: ['basePrice', 'taxRate', 'discount']
    }
  },
  compute: async function(dataDeps, record) {
    const basePrice = dataDeps._current?.basePrice || 0;
    const taxRate = dataDeps._current?.taxRate || 0;
    const discount = dataDeps._current?.discount || 0;
    
    // Calculate: basePrice * (1 + taxRate) * (1 - discount)
    const priceWithTax = basePrice * (1 + taxRate);
    const finalPrice = priceWithTax * (1 - discount);
    
    return Math.round(finalPrice * 100) / 100; // Round to 2 decimals
  },
  getDefaultValue: function() {
    return 0;
  }
});
Product.properties.push(finalPriceProperty);

// ✅ CORRECT: Accessing related entity properties through relations
const Department = Entity.create({
  name: 'Department',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'budget', type: 'number' })
  ]
});

const Employee = Entity.create({
  name: 'Employee',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'salary', type: 'number' })
  ]
});

// Define the relation between Employee and Department
const EmployeeDepartmentRelation = Relation.create({
  source: Employee,
  sourceProperty: 'department',
  target: Department,
  targetProperty: 'employees',
  type: 'n:1'  // Many employees to one department
});

// Property that accesses related department data
const EmployeeDepartmentInfoProperty = Property.create({
  name: 'departmentInfo',
  type: 'string'
});

Employee.properties.push(EmployeeDepartmentInfoProperty);

EmployeeDepartmentInfoProperty.computation = Custom.create({
  name: 'DepartmentInfoGenerator',
  dataDeps: {
    _current: {
      type: 'property',
      // Access properties and related entities through nested attributeQuery
      attributeQuery: [
        'name',
        'salary',
        ['department', {  // Access related entity through relation
          attributeQuery: ['name', 'budget']  // Specify which properties of related entity
        }]
      ]
    }
  },
  compute: async function(dataDeps, record) {
    const employeeName = dataDeps._current?.name || 'Unknown';
    const salary = dataDeps._current?.salary || 0;
    const department = dataDeps._current?.department;
    
    if (department) {
      return `${employeeName} ($${salary}) works in ${department.name} with budget $${department.budget}`;
    }
    return `${employeeName} ($${salary}) - No department assigned`;
  },
  getDefaultValue: function() {
    return 'No info available';
  }
});
```

**Custom Computation dataDeps Types:**
- `type: 'records'` - Access entity/relation records from storage
- `type: 'global'` - Access global dictionary values  
- `type: 'property'` - Access current record's properties and related entities

**🔴 IMPORTANT: Property Type Custom Computation**

When using `type: 'property'` with Custom computation:
- Access same record properties: `attributeQuery: ['propertyName1', 'propertyName2']`
- Access related entities through relations: Use nested attributeQuery
  ```typescript
  attributeQuery: [
    'ownProperty',  // Current record's property
    ['relationName', {  // Access related entity
      attributeQuery: ['relatedProp1', 'relatedProp2']  // Properties of related entity
    }]
  ]
  ```
- The framework automatically tracks dependencies and recomputes when related data changes

**Custom Computation Best Practices:**
1. **Document WHY** you need Custom instead of other computations
2. **Minimize dependencies** - only include data you absolutely need
3. **Handle errors gracefully** - Custom computations can fail

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
  ]
});
Style.computation = Transform.create({
  record: InteractionEventEntity,
  callback: (event) => {
    if (event.interactionName === 'CreateStyle') {
      return {
        label: event.payload.label,
        slug: event.payload.slug,
        status: 'draft',
        createdAt: Math.floor(Date.now()/1000)
      };
    }
    return null;
  }
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
  computeValue: () => Math.floor(Date.now()/1000)
});

const updatedAtProperty = Property.create({
  name: 'updatedAt',
  type: 'number'
});
updatedAtProperty.computation = StateMachine.create({
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
});
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
const statusProperty = Property.create({
  name: 'status',
  type: 'string'
});
statusProperty.computation = StateMachine.create({
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
});
```

## Critical Rules

### ✅ DO
- Use Transform ONLY in Entity/Relation computation property
- Use StateMachine for updates and state management
- Use computed/getValue for simple property calculations
- Keep computations pure and side-effect free
- Declare StateNode variables before using them in StateMachine
- Use Interaction instance references (not strings) as trigger in StateTransfer

### ❌ DON'T
- Never use Transform in Property computation
- **Don't use both defaultValue and computation on the same property** - they are mutually exclusive!
- Don't create circular dependencies
- Don't perform side effects in computations
- Don't access external services in computations
- Don't manually update computed values
- Don't create StateNode inside StateTransfer
- **Don't use strings as trigger in StateTransfer** - always use Interaction instance references

## Common Patterns

### 🔴 CRITICAL: Timestamp Tracking - Always Use Seconds!

**The database does NOT support millisecond precision. You MUST use `Math.floor(Date.now()/1000)` to convert milliseconds to seconds.**

```typescript
// ❌ WRONG: Using milliseconds directly
Property.create({
  name: 'createdAt',
  type: 'number',
  defaultValue: () => Date.now()  // ERROR! Returns milliseconds, but database only supports seconds!
})

// ✅ CORRECT: Convert to seconds
Property.create({
  name: 'createdAt',
  type: 'number',
  defaultValue: () => Math.floor(Date.now()/1000)  // Correct! Unix timestamp in seconds
})

// ✅ CORRECT: Created at - set once (in seconds)
Property.create({
  name: 'createdAt',
  type: 'number',
  defaultValue: () => Math.floor(Date.now()/1000)
})

// ✅ CORRECT: Updated at - updates on changes (in seconds)
const updatedState = StateNode.create({
  name: 'updated',
  computeValue: () => Math.floor(Date.now()/1000)  // Always convert to seconds!
});

const updatedAtProperty = Property.create({
  name: 'updatedAt',
  type: 'number'
});
updatedAtProperty.computation = StateMachine.create({
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
});
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
  ]
});
Version.computation = Transform.create({
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
          version: Math.floor(Date.now()/1000),  // Version number in seconds
          publishedAt: Math.floor(Date.now()/1000),  // In seconds
          isActive: true,
          publishedBy: event.user,
          style: { id: style.id }
        };
      }
    }
    return null;
  }
});
```
