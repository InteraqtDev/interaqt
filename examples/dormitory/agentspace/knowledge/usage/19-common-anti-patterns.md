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

### ❌ Using storage.create() to Test Validation

```javascript
// ❌ WRONG: storage.create bypasses ALL validation
test('should fail with invalid data', async () => {
  const result = await system.storage.create('Style', {
    label: '',    // Empty label
    slug: ''      // Empty slug
  });
  // This will ALWAYS succeed! storage.create bypasses validation
  expect(result).toBeTruthy();  // Wrong expectation!
});

// ✅ CORRECT: Test validation through Interactions
test('should fail with invalid data', async () => {
  const result = await controller.callInteraction('CreateStyle', {
    user: testUser,
    payload: {
      label: '',    // Empty label
      slug: ''      // Empty slug
    }
  });
  
  expect(result.error).toBeDefined();
  expect(result.error.type).toBe('validation failed');
});

// ✅ CORRECT: Use storage.create ONLY for test setup
beforeEach(async () => {
  // Create test data that should already exist
  testUser = await system.storage.create('User', {
    name: 'Test User',
    role: 'admin'
  });
  
  existingStyle = await system.storage.create('Style', {
    label: 'Existing Style',
    slug: 'existing-style'
  });
});
```

### ❌ Testing Entity/Relation Directly

```javascript
// ❌ WRONG: Don't test entities separately
test('should create User entity', async () => {
  const user = await system.storage.create('User', {
    name: 'John',
    email: 'john@example.com'
  });
  expect(user.name).toBe('John');
  // This is testing storage, not business logic!
});

// ✅ CORRECT: Test through Interactions
test('should create user through interaction', async () => {
  const result = await controller.callInteraction('CreateUser', {
    user: adminUser,
    payload: {
      name: 'John',
      email: 'john@example.com'
    }
  });
  
  expect(result.error).toBeUndefined();
  
  // Verify side effects
  const user = await system.storage.findOne('User',
    MatchExp.atom({ key: 'email', value: ['=', 'john@example.com'] })
  );
  expect(user.name).toBe('John');
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

## 9. ID Generation Mistakes

### ❌ Manually Specifying IDs

```javascript
// ❌ WRONG: Never manually specify ID when creating entities
const result = await controller.callInteraction('CreateArticle', {
  user: currentUser,
  payload: {
    id: uuid(),  // ❌ Don't do this!
    title: 'My Article',
    content: 'Content...'
  }
});

// ❌ WRONG: Don't specify ID in Transform computation
const Article = Entity.create({
  name: 'Article',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        return {
          id: uuid(),  // ❌ Never specify ID!
          title: event.payload.title,
          content: event.payload.content
        };
      }
    }
  })
});

// ❌ WRONG: Don't specify ID in test data setup
beforeEach(async () => {
  const user = await system.storage.create('User', {
    id: 'user-123',  // ❌ Don't specify ID!
    name: 'Test User'
  });
});
```

### ✅ Correct Approaches for Tracking Created Data

#### Option 1: Use Return Value from storage.create

```javascript
// ✅ CORRECT: Use the returned entity which includes auto-generated ID
beforeEach(async () => {
  // storage.create returns the created entity with auto-generated ID
  testUser = await system.storage.create('User', {
    name: 'Test User',
    email: 'test@example.com'
  });
  
  // Use the returned entity's ID
  testArticle = await system.storage.create('Article', {
    title: 'Test Article',
    author: { id: testUser.id }  // Reference using auto-generated ID
  });
});

// Use in tests
test('should update article', async () => {
  const result = await controller.callInteraction('UpdateArticle', {
    user: testUser,
    payload: {
      articleId: testArticle.id,  // Use the auto-generated ID
      title: 'Updated Title'
    }
  });
});
```

#### Option 2: Use clientId Property for Tracking

```javascript
// ✅ CORRECT: Define a clientId property for tracking
const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    // Add clientId for tracking purposes
    Property.create({ 
      name: 'clientId', 
      type: 'string',
      description: 'Client-provided ID for tracking created entities'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateArticle') {
        return {
          // ID is auto-generated, not specified
          title: event.payload.title,
          content: event.payload.content,
          clientId: event.payload.clientId  // Use clientId for tracking
        };
      }
    }
  })
});

// Use in interaction
const result = await controller.callInteraction('CreateArticle', {
  user: currentUser,
  payload: {
    title: 'My Article',
    content: 'Content...',
    clientId: 'my-tracking-id-123'  // Provide clientId for tracking
  }
});

// Find the created article using clientId
const createdArticle = await system.storage.findOne('Article',
  MatchExp.atom({ key: 'clientId', value: ['=', 'my-tracking-id-123'] })
);
```

#### Option 3: Query by Unique Properties

```javascript
// ✅ CORRECT: Find created entity by unique properties
const result = await controller.callInteraction('CreateUser', {
  user: adminUser,
  payload: {
    email: 'unique@example.com',  // Use unique email
    name: 'John Doe'
  }
});

// Find the created user by unique email
const createdUser = await system.storage.findOne('User',
  MatchExp.atom({ key: 'email', value: ['=', 'unique@example.com'] })
);
```

### Why IDs Must Be Auto-Generated

1. **Framework Design**: InterAQT manages ID generation internally to ensure uniqueness and consistency
2. **Storage Layer Responsibility**: Different storage backends may have different ID generation strategies
3. **Data Integrity**: Manual IDs can cause conflicts and break relationships
4. **Reactive System**: The framework needs control over IDs for proper change tracking

## Key Takeaways

1. **interaqt provides tools, not pre-built business entities**
2. **All entities must be defined by you**
3. **User authentication is external to the framework**
4. **Action is just an identifier, not an operation**
5. **Transform is for collection transformations, not property computations**
6. **Always use object references in StateMachine, not strings**
7. **Check result.error for errors, don't use try-catch**
8. **storage.create() bypasses ALL validation - use only for test setup**
9. **ALL business logic testing must use callInteraction()**
10. **Never test Entity/Relation directly - test through Interactions**
11. **NEVER manually specify IDs - they are always auto-generated by the framework**
12. **Use storage.create return value or clientId property to track created entities**
13. **When in doubt, check the [API Exports Reference](./18-api-exports-reference.md)**

Remember: The framework is about **declaring what data is**, not **how to manipulate it**. 