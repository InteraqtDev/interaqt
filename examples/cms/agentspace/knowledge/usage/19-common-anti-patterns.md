# Common Anti-Patterns and Mistakes

This document consolidates common mistakes and anti-patterns to help developers avoid pitfalls when using the interaqt framework.

## 1. Import-Related Mistakes

### ❌ Importing Non-Existent Entities

```javascript
// ❌ WRONG: User is not exported from interaqt
import { User, Entity, Property } from 'interaqt';

// ✅ CORRECT: Define your own User entity
import { Entity, Property } from 'interaqt';

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});
```

### ❌ Using Non-Existent Computation Types

```javascript
// ❌ WRONG: RelationBasedEvery doesn't exist
import { RelationBasedEvery } from 'interaqt';

// ✅ CORRECT: Use Every with relations
import { Every } from 'interaqt';

const allCompleted = Every.create({
  record: UserTaskRelation,
  callback: (relation) => relation.status === 'completed'
});
```

### ❌ Wrong Entity Name

```javascript
// ❌ WRONG: It's not InteractionEvent
import { InteractionEvent } from 'interaqt';

// ✅ CORRECT: The correct name is InteractionEventEntity
import { InteractionEventEntity } from 'interaqt';
```

## 2. Property Definition Mistakes

### ❌ Using Non-Existent Property Options

```javascript
// ❌ WRONG: identifier property doesn't exist
Property.create({ 
  name: 'id', 
  type: 'string',
  identifier: true  // This doesn't exist!
});

// ✅ CORRECT: ID uniqueness is handled by storage layer
Property.create({ 
  name: 'id', 
  type: 'string'
});
```

### ❌ Using Non-Function defaultValue

```javascript
// ❌ WRONG: defaultValue should always be a function
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: 'active'  // Should be a function!
});

// ✅ CORRECT: Use function form
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: () => 'active'
});
```

## 3. Relation Definition Mistakes

### ❌ Specifying Relation Name

```javascript
// ❌ WRONG: Don't specify name for relations
const UserPostRelation = Relation.create({
  name: 'UserPost',  // Don't do this!
  source: User,
  target: Post,
  type: '1:n'
});

// ✅ CORRECT: Name is auto-generated
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  type: '1:n'
});
```

### ❌ Using Wrong Property Names

```javascript
// ❌ WRONG: It's not relationType
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  relationType: '1:n'  // Wrong property name!
});

// ✅ CORRECT: Use 'type'
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  type: '1:n'
});
```

### ❌ Wrong Relation Type Format

```javascript
// ❌ WRONG: Wrong format
Relation.create({
  type: 'one:many'  // Wrong!
});

// ✅ CORRECT: Use proper format
Relation.create({
  type: '1:n'  // or '1:1', 'n:1', 'n:n'
});
```

## 4. Interaction Definition Mistakes

### ❌ Adding User Property to Interaction

```javascript
// ❌ WRONG: user is not a property of Interaction
const SomeInteraction = Interaction.create({
  name: 'SomeInteraction',
  user: User,  // This doesn't exist!
  action: Action.create({ name: 'someAction' })
});

// ✅ CORRECT: User is passed at execution time
const SomeInteraction = Interaction.create({
  name: 'SomeInteraction',
  action: Action.create({ name: 'someAction' })
});

// User context provided when calling
await controller.callInteraction('SomeInteraction', {
  user: { id: 'user123', name: 'John' },  // Passed here
  payload: { /* ... */ }
});
```

### ❌ Thinking Action Contains Logic

```javascript
// ❌ WRONG: Action is just an identifier
const CreatePost = Action.create({
  name: 'createPost',
  execute: async () => { /* ... */ },  // No execute method!
  handler: () => { /* ... */ }          // No handler either!
});

// ✅ CORRECT: Action is just a name/identifier
const CreatePost = Action.create({
  name: 'createPost'  // That's it!
});
```

## 5. Computation Mistakes

### ❌ Using Transform for Property Computation

```javascript
// ❌ WRONG: Transform is for collection-to-collection transformation
Property.create({
  name: 'displayName',
  computation: Transform.create({
    record: User,  // Wrong usage!
    callback: (user) => `${user.firstName} ${user.lastName}`
  })
});

// ✅ CORRECT: Use getValue for same-entity property computation
Property.create({
  name: 'displayName',
  type: 'string',
  getValue: (record) => `${record.firstName} ${record.lastName}`
});
```

### ❌ Circular References in Transform

```javascript
// ❌ WRONG: Entity referencing itself in Transform
const User = Entity.create({
  name: 'User',
  computation: Transform.create({
    record: User,  // Circular reference!
    callback: (user) => { /* ... */ }
  })
});

// ✅ CORRECT: Transform should reference different entities
const DerivedEntity = Entity.create({
  name: 'DerivedEntity',
  computation: Transform.create({
    record: SourceEntity,  // Different entity
    callback: (source) => { /* ... */ }
  })
});
```

### ❌ Using String References in StateMachine

```javascript
// ❌ WRONG: Using strings for state references
StateMachine.create({
  states: [activeState, inactiveState],
  transfers: [
    StateTransfer.create({
      current: 'active',  // Should be object reference!
      next: 'inactive',   // Should be object reference!
      trigger: SomeInteraction
    })
  ],
  defaultState: 'active'  // Should be object reference!
});

// ✅ CORRECT: Use object references
const activeState = StateNode.create({ name: 'active' });
const inactiveState = StateNode.create({ name: 'inactive' });

StateMachine.create({
  states: [activeState, inactiveState],
  transfers: [
    StateTransfer.create({
      current: activeState,     // Object reference
      next: inactiveState,      // Object reference
      trigger: SomeInteraction
    })
  ],
  defaultState: activeState     // Object reference
});
```

## 6. Testing Mistakes

### ❌ Using try-catch for Error Testing

```javascript
// ❌ WRONG: interaqt doesn't throw exceptions
test('should fail validation', async () => {
  try {
    await controller.callInteraction('SomeInteraction', {...});
    fail('Should have thrown error');
  } catch (e) {
    // This code will never execute!
  }
});

// ✅ CORRECT: Check error field in result
test('should fail validation', async () => {
  const result = await controller.callInteraction('SomeInteraction', {...});
  expect(result.error).toBeTruthy();
  expect(result.error.message).toContain('validation failed');
});
```

## 7. Payload Entity Reference Issues

### ❌ Entity Resolution Problems

```javascript
// ❌ PROBLEMATIC: Can cause "entity undefined not found"
PayloadItem.create({ 
  name: 'version',
  base: Version,  // Can cause resolution issues with circular deps
  isRef: false
});

// ✅ WORKAROUND: Use generic object type when needed
PayloadItem.create({ 
  name: 'version',
  base: 'object',  // Generic type avoids resolution issues
  isRef: false
});
```

## 8. Authentication Misunderstandings

### ❌ Creating Authentication Interactions

```javascript
// ❌ WRONG: interaqt doesn't handle authentication
const UserLogin = Interaction.create({
  name: 'UserLogin',
  action: Action.create({ name: 'login' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'username' }),
      PayloadItem.create({ name: 'password' })
    ]
  })
});

// ✅ CORRECT: Authentication is external
// User identity should be provided by external system (JWT, Session, etc.)
// When calling interactions, user is already authenticated:
await controller.callInteraction('CreatePost', {
  user: authenticatedUser,  // Pre-authenticated by external system
  payload: { /* ... */ }
});
```

## Key Takeaways

1. **interaqt provides tools, not pre-built business entities**
2. **All entities must be defined by you**
3. **User authentication is external to the framework**
4. **Action is just an identifier, not an operation**
5. **Transform is for collection transformations, not property computations**
6. **Always use object references in StateMachine, not strings**
7. **Check result.error for errors, don't use try-catch**
8. **When in doubt, check the [API Exports Reference](./18-api-exports-reference.md)**

Remember: The framework is about **declaring what data is**, not **how to manipulate it**. 