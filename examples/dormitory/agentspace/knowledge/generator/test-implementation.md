# Test Implementation Guide

## Overview
Testing in interaqt focuses on interactions as the primary way to verify business logic. Since all data creation, updates, and deletions flow through interactions, comprehensive interaction testing provides complete coverage.

## 🔴 CRITICAL: Testing Philosophy

### Core Principles
1. **Test Through Interactions Only**: All business logic testing must use `callInteraction()`
2. **Storage APIs Bypass Validation**: `storage.create/update/delete` are ONLY for test setup
3. **No Entity/Relation Unit Tests**: These are implementation details tested through interactions
4. **Error Handling**: interaqt returns errors in result.error, never throws exceptions

### Common Mistakes
```typescript
// ❌ WRONG: These APIs don't exist
controller.run()
controller.execute()
storage.findByProperty()

// ❌ WRONG: Direct storage manipulation for business logic
await storage.create('Style', { ... })  // Bypasses ALL validation!

// ❌ WRONG: Try-catch for errors
try {
  await controller.callInteraction(...)
} catch (e) {
  // interaqt doesn't throw exceptions
}

// ✅ CORRECT: Test through interactions
const result = await controller.callInteraction('CreateStyle', { ... })
expect(result.error).toBeUndefined()
```

## Test Setup Pattern

### Basic Test Structure
```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend'

describe('Feature Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // Create fresh system for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      activities: [],           // activities
      interactions,             // interactions
      dict: [],                 // global dictionaries
      recordMutationSideEffects: []  // side effects
    })

    await controller.setup(true)
  })
  
  test('should create style through interaction', async () => {
    // Create test user
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Call interaction - this is the ONLY way to test business logic
    const result = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'Modern Style',
        slug: 'modern-style',
        description: 'A contemporary design',
        type: 'premium',
        priority: 10
      }
    })
    
    // Check if interaction succeeded
    expect(result.error).toBeUndefined()
    
    // Verify the style was created
    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'modern-style'] }),
      undefined,
      ['id', 'label', 'slug', 'status', 'createdAt']
    )
    
    expect(style).toBeTruthy()
    expect(style.label).toBe('Modern Style')
    expect(style.status).toBe('draft')
    expect(style.createdAt).toBeGreaterThan(0)
  })
})
```

## callInteraction Return Value

The `controller.callInteraction()` method returns a `InteractionCallResponse` object with the following structure:

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

### Common Usage Patterns

#### 🔴 IMPORTANT: Use Storage APIs for Verification
When testing interactions, **directly use storage.find/findOne to verify results**. DO NOT create query interactions just for testing purposes:

```typescript
// ✅ CORRECT: Use storage APIs to verify interaction results
test('should create and update style', async () => {
  // Execute business logic through interaction
  const createResult = await controller.callInteraction('CreateStyle', {
    user: adminUser,
    payload: { label: 'Test Style', slug: 'test-style' }
  })
  expect(createResult.error).toBeUndefined()
  
  // Directly verify data with storage API
  const style = await system.storage.findOne('Style',
    MatchExp.atom({ key: 'slug', value: ['=', 'test-style'] }),
    undefined,
    ['id', 'label', 'status', 'createdAt']
  )
  expect(style.label).toBe('Test Style')
  expect(style.status).toBe('draft')
})

// ❌ WRONG: Creating query interactions just for testing
const GetStyleBySlug = Interaction.create({  // Don't create this just for tests!
  name: 'GetStyleBySlug',
  action: Action.create({ name: 'get' }),
  // ...
})
```

**Why?**
- Storage APIs provide direct, efficient access to verify test outcomes
- Creating query interactions adds unnecessary complexity
- Tests should verify business logic, not test helper interactions
- Only create query interactions if they're actual business requirements

```typescript
// 1. Basic success check
const result = await controller.callInteraction('CreateStyle', {...})
if (result.error) {
  console.error('Interaction failed:', result.error)
  return
}

// 2. Getting data from query interactions
const queryResult = await controller.callInteraction('GetStyles', {
  user: currentUser,
  query: {
    match: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
    modifier: { limit: 10 }
  }
})
expect(queryResult.error).toBeUndefined()
expect(queryResult.data).toHaveLength(10)

// 3. Checking side effects
const publishResult = await controller.callInteraction('PublishStyle', {...})
expect(publishResult.error).toBeUndefined()
expect(publishResult.sideEffects?.emailNotification?.result).toBe('sent')

// 4. Activity interactions return activityId
const activityResult = await controller.callActivityInteraction(
  'ApprovalWorkflow', 
  'StartApproval', 
  undefined, 
  {...}
)
const activityId = activityResult.context?.activityId
```

## 🔴 CRITICAL: Passing Reference Parameters (isRef)

When an interaction's PayloadItem has `isRef: true`, you must pass an object with `id` property, NOT just the id string:

```typescript
// Interaction definition example
const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,  // This means we're referencing an existing Style
        required: true 
      })
    ]
  })
})

// ❌ WRONG: Passing just the id string
const result = await controller.callInteraction('UpdateStyle', {
  user: adminUser,
  payload: {
    style: styleId  // WRONG! Don't pass plain id
  }
})

// ✅ CORRECT: Pass object with id property
const result = await controller.callInteraction('UpdateStyle', {
  user: adminUser,
  payload: {
    style: { id: styleId }  // CORRECT! Pass as object
  }
})

// ✅ ALSO CORRECT: Pass the entire entity object
const style = await system.storage.findOne('Style', ...)
const result = await controller.callInteraction('UpdateStyle', {
  user: adminUser,
  payload: {
    style: style  // Works because style object has id property
  }
})
```

### Multiple References Example
```typescript
// For arrays when isCollection: true
const AssignStyles = Interaction.create({
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styles',
        base: Style,
        isRef: true,
        isCollection: true
      })
    ]
  })
})

// ✅ CORRECT: Array of objects with id
await controller.callInteraction('AssignStyles', {
  user: adminUser,
  payload: {
    styles: [
      { id: style1Id },
      { id: style2Id },
      { id: style3Id }
    ]
  }
})
```

**Why this matters**: The framework uses the `isRef` flag to determine whether to create a new entity or reference an existing one. When `isRef: true`, it expects an entity reference format.

### Common Usage Patterns

## Error Checking

The interaqt framework wraps all exceptions in the return value, so you NEVER need try-catch blocks:

### Error Types

```typescript
// 1. Permission errors
const result = await controller.callInteraction('DeleteStyle', {
  user: viewerUser,  // viewer role cannot delete
  payload: { id: style.id }
})
expect(result.error).toBeDefined()
expect((result.error as any).type).toBe('check user failed')

// 2. Validation errors (payload attributive checks)
const result = await controller.callInteraction('PublishStyle', {
  user: adminUser,
  payload: { 
    id: offlineStyle.id  // Cannot publish offline styles
  }
})
expect(result.error).toBeDefined()
expect((result.error as any).type).toBe('id not match attributive')

// 3. Missing required fields
const result = await controller.callInteraction('CreateStyle', {
  user: adminUser,
  payload: {
    // Missing required 'label' field
    slug: 'test-style'
  }
})
expect(result.error).toBeDefined()
expect((result.error as any).type).toBe('payload label missing')

// 4. Business rule violations (condition checks)
const result = await controller.callInteraction('CreateStyle', {
  user: adminUser,
  payload: {
    label: 'Duplicate',
    slug: existingSlug  // Slug must be unique
  }
})
expect(result.error).toBeDefined()
expect((result.error as any).type).toBe('condition check failed')
```

### Error Handling Best Practices

```typescript
test('should handle all error cases', async () => {
  const result = await controller.callInteraction('UpdateStyle', {...})
  
  // Always check error first
  if (result.error) {
    // For tests, use expect to verify expected errors
    expect(result.error).toBeDefined()
    expect((result.error as any).type).toBe('expected error type')
    return
  }
  
  // Only access other properties after confirming no error
  expect(result.effects).toHaveLength(1)
  expect(result.sideEffects?.audit?.result).toBeTruthy()
})
```

### Debugging Tips

When an interaction fails unexpectedly, use `console.log` to inspect the full error object:

```typescript
const result = await controller.callInteraction('CreateStyle', {...})
if (result.error) {
  // Print full error details for debugging
  console.log('Interaction error:', result.error)
  
  // The error object often contains helpful details:
  // - type: Error type (e.g., 'check user failed', 'payload validation failed')
  // - message: Detailed error message
  // - context: Additional context about what failed
}
```

This is especially useful when:
- Writing new tests and encountering unexpected failures
- Debugging permission/condition check failures  
- Understanding payload validation errors


## 🔴 CRITICAL: User Authentication Handling
**interaqt does NOT handle user authentication**. This is a fundamental principle:
- The framework assumes user identity has already been authenticated through external means (JWT, Session, OAuth, etc.)
- **DO NOT** create user registration, login, logout interactions
- **DO NOT** implement authentication logic within the interaqt system
- In tests, directly create user objects with required properties (id, role, etc.)
- When calling interactions, pass pre-authenticated user objects

**⚠️ IMPORTANT: You MUST Still Define User Entity**
Even though interaqt doesn't handle authentication, you still need to:
1. **Define a User entity** in your application with necessary properties
2. **Create test users directly in storage** for testing purposes
3. **Pass these user objects** when calling interactions

Example of User entity definition and test usage:
```typescript
// ✅ CORRECT: Define User entity (in entities/User.ts)
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }),
    // Add other properties your application needs
    // But NO password or authentication-related fields
  ]
})

// ✅ CORRECT: Create test users directly in test setup
const adminUser = await system.storage.create('User', {
  id: 'admin-123',
  name: 'Admin User',
  role: 'admin',
  email: 'admin@test.com'
})

// ✅ CORRECT: Use pre-authenticated user in interactions
await controller.callInteraction('CreatePost', {
  user: adminUser,  // Already authenticated user
  payload: { ... }
})

// ❌ WRONG: Don't create authentication interactions
const LoginInteraction = Interaction.create({  // DON'T DO THIS
  name: 'Login',
  // ...
})
```

### User-related Interaction Guidelines
- **DO NOT generate** CreateUser/DeleteUser interactions - user creation/deletion is handled by external user systems
- **DO generate** UpdateUserProfile, UpdateUserSettings etc. if explicitly required by business requirements
- User entity exists for reference and relation purposes, not for authentication management

## 🔴 CRITICAL: Always Specify attributeQuery

When using `findOne` or `find`, you MUST specify which fields to retrieve:

```typescript
// ❌ WRONG: Only returns { id: '...' }
const user = await system.storage.findOne('User',
  MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] })
)
console.log(user.name)  // undefined!

// ❌ WRONG: Don't use '*' - it's not supported
const user = await system.storage.findOne('User',
  MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] }),
  undefined,
  ['*']  // WRONG! Should not use star selector in tests.
)

// ✅ CORRECT: Explicitly list all needed fields
const user = await system.storage.findOne('User',
  MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] }),
  undefined,  // modifier
  ['id', 'name', 'email', 'role', 'status']  // attributeQuery
)
console.log(user.name)  // 'Test User' ✓
```

### Querying Relations with attributeQuery

When querying entities with relations, you can specify related entity fields using nested arrays:

```typescript
// ✅ CORRECT: Query style with author information
const style = await system.storage.findOne('Style',
  MatchExp.atom({ key: 'slug', value: ['=', 'modern-style'] }),
  undefined,
  [
    'id', 
    'label', 
    'status',
    ['author', { 
      attributeQuery: ['id', 'name', 'email', 'role'] 
    }]
  ]
)
console.log(style.author.name)  // 'John Doe' ✓

// ✅ CORRECT: Query with multiple relations
const post = await system.storage.findOne('Post',
  MatchExp.atom({ key: 'id', value: ['=', postId] }),
  undefined,
  [
    'id',
    'title',
    'content',
    'publishedAt',
    ['author', { 
      attributeQuery: ['id', 'name', 'avatar'] 
    }],
    ['category', { 
      attributeQuery: ['id', 'name', 'slug'] 
    }]
  ]
)

// ❌ WRONG: Don't use '*' for relations either
const style = await system.storage.findOne('Style',
  MatchExp.atom({ key: 'id', value: ['=', styleId] }),
  undefined,
  [
    '*',  // WRONG!
    ['author', { attributeQuery: ['*'] }]  // WRONG!
  ]
)
```

### Important Notes
- **Always explicitly list fields**: This ensures predictable results.
- **Only requested fields are returned**: Any field not in attributeQuery will be undefined

## 🔴 CRITICAL: Accessing Relation Names

When you need to query relations in tests, **always use the relation instance's `.name` property** to get the automatically generated name:

```typescript
// ❌ WRONG: Don't assume or hardcode relation names
const relation = await system.storage.findOneRelationByName(
  'User_styles_Style',  // WRONG! Don't guess the name format
  MatchExp.atom({ key: 'source.id', value: ['=', user.id] })
)

// ❌ WRONG: Don't construct relation names manually
const relationName = `${Style.name}_author_${User.name}`  // WRONG!

// ✅ CORRECT: Use the relation instance's name property
import { UserStyleRelation } from '../backend/relations'

const relation = await system.storage.findOneRelationByName(
  UserStyleRelation.name,  // CORRECT! Use the actual relation's name
  MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
  undefined,
  ['id', 'source', 'target']
)

// ✅ CORRECT: For multiple relations, use their respective names
const styleAuthorRelation = await system.storage.findRelationByName(
  StyleAuthorRelation.name,
  MatchExp.atom({ key: 'target.id', value: ['=', userId] })
)

const userFavoriteRelation = await system.storage.findRelationByName(
  UserFavoriteStyleRelation.name,
  MatchExp.atom({ key: 'source.id', value: ['=', userId] })
)
```

**Why this matters**: 
- Relation names are automatically generated by the framework based on entity names and properties
- The format may change or vary based on relation configuration
- Using the `.name` property ensures your tests remain correct even if the naming convention changes
- It makes tests more maintainable and less brittle

## Best Practices

### DO
- Test all business scenarios through interactions
- Use descriptive test names following test case IDs
- Verify both success and error paths
- Check computed values update correctly
- Test edge cases and boundary conditions

### DON'T
- Don't use storage APIs for business logic testing
- Don't test framework mechanics (entity/relation creation)
- Don't use try-catch for error handling
- Don't forget attributeQuery in find operations
- Don't test implementation details

## Validation Checklist
- [ ] All tests use callInteraction for business logic
- [ ] Storage APIs only used for test setup
- [ ] All findOne/find calls include attributeQuery
- [ ] Error checking uses result.error pattern
- [ ] Test covers success and failure scenarios
- [ ] Computed values verified after interactions
- [ ] No try-catch blocks for error handling
