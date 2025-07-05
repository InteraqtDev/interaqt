# Testing

In the interaqt framework, testing is part of the design philosophy. The reactive programming model makes testing more intuitive and reliable. This chapter will detail testing strategies, patterns, and best practices.

## Testing API Quick Reference

### ⚠️ Common API Mistakes to Avoid

Many LLMs generate incorrect API usage. Here's the correct way to use interaqt testing APIs:

```typescript
// ❌ WRONG: These APIs do NOT exist
controller.run()                           // ❌ No such method
storage.findByProperty('Entity', 'prop')   // ❌ No such method
controller.execute()                       // ❌ No such method
controller.dispatch()                      // ❌ No such method

// ✅ CORRECT: Use these APIs instead
controller.callInteraction('InteractionName', args)  // ✅ Call interactions
storage.findOne('Entity', MatchExp)                  // ✅ Find single record
storage.find('Entity', MatchExp)                     // ✅ Find multiple records
storage.create('Entity', data)                       // ✅ Create record
```

### Complete Test Template

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'
// If you need UUID, install and import it:
// npm install uuid @types/uuid
// import { v4 as uuid } from 'uuid'

describe('Feature Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // ✅ Correct setup
    system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName

    // Note: When creating relations, DO NOT specify name property
    // The framework automatically generates relation names:
    // - User + Post → UserPost
    // - Post + Comment → PostComment
    
    controller = new Controller(
      system,
      entities,
      relations,       // Relations with auto-generated names
      activities,      // 4th parameter
      interactions,    // 5th parameter
      [],             // 6th parameter: global dictionaries (NOT computations)
      []              // 7th parameter: side effects
    )

    await controller.setup(true)
  })

  test('interaction test example', async () => {
    // ✅ CORRECT: Use callInteraction
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'system', role: 'admin' },  // Must include user object
      payload: {
        username: 'testuser',
        email: 'test@example.com',
        role: 'user'
      }
    })

    // Check for errors
    expect(result.error).toBeUndefined()

    // ✅ CORRECT: Use storage.findOne with MatchExp
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'testuser'] }),
      undefined,
      ['id', 'username', 'email', 'role', 'status']
    )

    expect(user).toBeTruthy()
    expect(user.email).toBe('test@example.com')
  })

  test('finding records examples', async () => {
    // ✅ Find by single field
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'username', 'email', 'status', 'role']
    )

    // ✅ Find with multiple conditions
    const activeUsers = await system.storage.find(
      'User',
      MatchExp.atom({ key: 'status', value: ['=', 'active'] })
        .and({ key: 'role', value: ['=', 'user'] }),
      undefined,
      ['id', 'username', 'email', 'lastLoginDate']
    )

    // ✅ Find with complex conditions
    const posts = await system.storage.find(
      'Post',
      MatchExp.atom({ key: 'author.id', value: ['=', userId] })
        .and({ key: 'status', value: ['in', ['published', 'draft']] }),
      undefined,
      ['id', 'title', 'content', 'status', 'createdAt', 'author']
    )
  })

  test('creating and updating records', async () => {
    // ✅ Create record directly (ONLY for test setup)
    // ⚠️ WARNING: storage.create bypasses ALL validation!
    // NEVER use it to test business logic or validation
    const user = await system.storage.create('User', {
      username: 'testuser',
      email: 'test@example.com',
      role: 'user'
    })

    // ✅ Update record (also bypasses validation - use only for test setup)
    await system.storage.update(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      { status: 'active' }
    )

    // ✅ Delete record
    await system.storage.delete(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] })
    )
  })
})
```

### Key API Methods

#### 1. Controller APIs

```typescript
// Call an interaction (the ONLY way to execute business logic)
const result = await controller.callInteraction(interactionName: string, args: {
  user: { id: string, [key: string]: any },  // Required user object
  payload?: { [key: string]: any }           // Optional payload
})

// Call activity interaction
const result = await controller.callActivityInteraction(
  activityName: string,
  interactionName: string,
  activityId: string,
  args: InteractionEventArgs
)
```

#### 2. Storage APIs

⚠️ **WARNING: Storage APIs bypass ALL validation and business logic!**
- Use `storage.create/update/delete` ONLY for test data setup
- NEVER use them to test validation or business logic
- ALL business logic tests must use `callInteraction`

🔴 **CRITICAL: Always specify attributeQuery when using find/findOne!**
- Without `attributeQuery`, only the `id` field is returned
- This is the most common cause of test failures
- Always explicitly list all fields you need to verify

```typescript
// Create a record (ONLY for test setup - bypasses ALL validation!)
const record = await system.storage.create(entityName: string, data: object)

// Find one record (safe for reading data)
const record = await system.storage.findOne(
  entityName: string,
  matchExp: MatchExp,
  modifier?: Modifier,
  attributeQuery?: AttributeQuery
)

// Find multiple records (safe for reading data)
const records = await system.storage.find(
  entityName: string,
  matchExp: MatchExp,
  modifier?: Modifier,
  attributeQuery?: AttributeQuery
)

// Update records (ONLY for test setup - bypasses ALL validation!)
await system.storage.update(
  entityName: string,
  matchExp: MatchExp,
  data: object
)

// Delete records (ONLY for test cleanup - bypasses ALL business logic!)
await system.storage.delete(
  entityName: string,
  matchExp: MatchExp
)
```

#### 3. MatchExp Usage

```typescript
// Simple equality
MatchExp.atom({ key: 'field', value: ['=', value] })

// Multiple conditions (AND)
MatchExp.atom({ key: 'status', value: ['=', 'active'] })
  .and({ key: 'role', value: ['=', 'admin'] })

// OR conditions
MatchExp.atom({ key: 'role', value: ['=', 'admin'] })
  .or({ key: 'role', value: ['=', 'moderator'] })

// Complex operators
MatchExp.atom({ key: 'age', value: ['>', 18] })
MatchExp.atom({ key: 'name', value: ['like', '%john%'] })
MatchExp.atom({ key: 'status', value: ['in', ['active', 'pending']] })
MatchExp.atom({ key: 'score', value: ['between', [60, 100]] })

// Nested field access
MatchExp.atom({ key: 'user.profile.city', value: ['=', 'Beijing'] })
```

### Error Handling in Tests

```typescript
test('should handle errors correctly', async () => {
  // ✅ CORRECT: Check error field in result
  const result = await controller.callInteraction('SomeInteraction', {
    user: { id: 'user1' },
    payload: { invalid: 'data' }
  })

  expect(result.error).toBeDefined()
  expect(result.error.message).toContain('expected error message')

  // ❌ WRONG: interaqt doesn't throw exceptions
  // try {
  //   await controller.callInteraction(...)
  // } catch (e) {
  //   // This won't work
  // }
})
```

# 12. How to Perform Testing

Testing is a crucial component for ensuring the quality of interaqt applications. The framework provides comprehensive testing support, including unit testing, integration testing, and end-to-end testing. This chapter will detail how to write effective tests for reactive applications.

## ⚠️ CRITICAL: interaqt Testing Philosophy

**In the interaqt framework, ALL data is derived from interaction events.** This fundamental principle changes how we approach testing:

1. **Focus on Interaction Testing**: Since all Entity and Relation data are created, modified, and deleted through Interactions, comprehensive Interaction testing naturally covers all data operations.

2. **No Separate Entity/Relation Tests**: You should NOT write separate unit tests for Entity CRUD operations or Relation creation/deletion. These are implementation details that are automatically tested when you test the Interactions that use them.

3. **Coverage Through Interactions**: If your test coverage is below 100% after testing all Interactions, it indicates:
   - Missing Interaction definitions in your design
   - Insufficient edge case testing for existing Interactions
   - Unused code that should be removed

4. **Test What Matters**: Test the business logic and user scenarios through Interactions, not the framework mechanics.

5. **Storage APIs are LOW-LEVEL**: 
   - `storage.create()`, `storage.update()`, `storage.delete()` bypass ALL validation and business logic
   - Use them ONLY for test data setup (creating prerequisite records)
   - NEVER use them to test validation failures - they will always succeed!
   - ALL business logic testing must go through `callInteraction()`

## 12.1 Testing Reactive Computations

### 12.1.1 Count Computation Testing

```typescript
// tests/computations/count.spec.ts
describe('Count Computation', () => {
  test('should update user count automatically', async () => {
    const system = new MonoSystem(new PGLiteDB());
    
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean' })
      ]
    });
    
    const totalUsersDict = Dictionary.create({
      name: 'totalUsers',
      type: 'number',
      collection: false,
      defaultValue: () => 0,
      computation: Count.create({
        record: userEntity
      })
    });
    
    const activeUsersDict = Dictionary.create({
      name: 'activeUsers',
      type: 'number',
      collection: false,
      defaultValue: () => 0,
      computation: Count.create({
        record: userEntity
      })
    });
    
    const controller = new Controller(
      system,
      [userEntity],
      [],
      [],
      [],
      [totalUsersDict, activeUsersDict],
      []
    );
    await controller.setup(true);
    
    // Check initial state
    let totalUsers = await system.storage.get('state', 'totalUsers');
    let activeUsers = await system.storage.get('state', 'activeUsers');
    expect(totalUsers).toBe(0);
    expect(activeUsers).toBe(0);
    
    // Create active user
    await system.storage.create('User', {
      username: 'alice',
      isActive: true
    });
    
    // Verify count update
    totalUsers = await system.storage.get('state', 'totalUsers');
    activeUsers = await system.storage.get('state', 'activeUsers');
    expect(totalUsers).toBe(1);
    expect(activeUsers).toBe(1);
    
    // Create inactive user
    await system.storage.create('User', {
      username: 'bob',
      isActive: false
    });
    
    // Verify count update
    totalUsers = await system.storage.get('state', 'totalUsers');
    activeUsers = await system.storage.get('state', 'activeUsers');
    expect(totalUsers).toBe(2);
    expect(activeUsers).toBe(1);
  });
});
```

### 12.1.2 Complex Computation Testing

```typescript
// tests/computations/transform.spec.ts
describe('Transform Computation', () => {
  test('should calculate user statistics correctly', async () => {
    const system = new MonoSystem(new PGLiteDB());
    
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'age', type: 'number' }),
        Property.create({ name: 'score', type: 'number' })
      ]
    });
    
    const userStatsDict = Dictionary.create({
      name: 'userStats',
      type: 'object',
      collection: false,
      defaultValue: () => ({}),
      computation: Transform.create({
        record: userEntity,
        attributeQuery: ['age', 'score'],
        callback: (users: any[]) => {
          if (users.length === 0) {
            return {
              totalUsers: 0,
              averageAge: 0,
              averageScore: 0,
              maxScore: 0,
              minScore: 0
            };
          }
          
          const totalAge = users.reduce((sum, user) => sum + user.age, 0);
          const totalScore = users.reduce((sum, user) => sum + user.score, 0);
          const scores = users.map(user => user.score);
          
          return {
            totalUsers: users.length,
            averageAge: totalAge / users.length,
            averageScore: totalScore / users.length,
            maxScore: Math.max(...scores),
            minScore: Math.min(...scores)
          };
        }
      })
    });
    
    const controller = new Controller(
      system,
      [userEntity],
      [],
      [],
      [],
      [userStatsDict],
      []
    );
    await controller.setup(true);
    
    // Create test users
    await system.storage.create('User', {
      username: 'alice',
      age: 25,
      score: 85
    });
    
    await system.storage.create('User', {
      username: 'bob',
      age: 30,
      score: 92
    });
    
    await system.storage.create('User', {
      username: 'charlie',
      age: 35,
      score: 78
    });
    
    // Verify statistical calculation
    const stats = await system.storage.get('state', 'userStats');
    expect(stats.totalUsers).toBe(3);
    expect(stats.averageAge).toBe(30);
    expect(stats.averageScore).toBeCloseTo(85);
    expect(stats.maxScore).toBe(92);
    expect(stats.minScore).toBe(78);
  });
});
```

## 12.2 Testing Interactions and Activities

### 12.2.1 Interaction Testing

```typescript
// tests/interactions/userActions.spec.ts
describe('User Interactions', () => {
  test('should handle user registration interaction', async () => {
    const system = new MonoSystem(new PGLiteDB());
    
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
      ]
    });
    
    const registerInteraction = Interaction.create({
      name: 'register',
      action: Action.create({ name: 'register' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            name: 'userData',
            base: userEntity
          })
        ]
      })
    });
    
    const controller = new Controller(
      system,
      [userEntity],
      [],
      [],  // activities (第四个参数)
      [registerInteraction],  // interactions (第五个参数)
      [],
      []
    );
    await controller.setup(true);
    
    // Execute registration interaction
    const result = await controller.callInteraction(registerInteraction.name, {
      user: { id: 'test-user' },  // Add user object
      payload: {
        userData: {
          username: 'newuser',
          email: 'newuser@example.com'
        }
      }
    });
    
    // Verify interaction result
    expect(result).toBeTruthy();
    
    // Verify user creation
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'newuser'] }),
      undefined,
      ['id', 'username', 'email', 'isActive']  // Specify fields to verify
    );
    
    expect(user).toBeTruthy();
    expect(user.username).toBe('newuser');
    expect(user.email).toBe('newuser@example.com');
    expect(user.isActive).toBe(true);
  });
});
```

### 12.2.2 Activity Testing

```typescript
// tests/activities/approvalProcess.spec.ts
describe('Approval Process Activity', () => {
  test('should handle complete approval workflow', async () => {
    const system = new MonoSystem(new PGLiteDB());
    
    // Create request entity
    const requestEntity = Entity.create({
      name: 'Request',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'submitterId', type: 'string' })
      ]
    });
    
    // Create activity states
    const submittedState = StateNode.create({ name: 'submitted' });
    const reviewingState = StateNode.create({ name: 'reviewing' });
    const approvedState = StateNode.create({ name: 'approved' });
    const rejectedState = StateNode.create({ name: 'rejected' });
    
    // Create interactions
    const submitInteraction = Interaction.create({
      name: 'submit',
      action: Action.create({ name: 'submit' })
    });
    
    const approveInteraction = Interaction.create({
      name: 'approve',
      action: Action.create({ name: 'approve' })
    });
    
    const rejectInteraction = Interaction.create({
      name: 'reject',
      action: Action.create({ name: 'reject' })
    });
    
    // Create state transfers
    const submitTransfer = StateTransfer.create({
      trigger: submitInteraction,
      current: submittedState,
      next: reviewingState
    });
    
    const approveTransfer = StateTransfer.create({
      trigger: approveInteraction,
      current: reviewingState,
      next: approvedState
    });
    
    const rejectTransfer = StateTransfer.create({
      trigger: rejectInteraction,
      current: reviewingState,
      next: rejectedState
    });
    
    // Create activity
    const approvalActivity = Activity.create({
      name: 'ApprovalProcess',
      states: [submittedState, reviewingState, approvedState, rejectedState],
      transfers: [submitTransfer, approveTransfer, rejectTransfer],
      defaultState: submittedState
    });
    
    const controller = new Controller(
      system,
      [requestEntity],
      [],
      [approvalActivity],  // activities (第四个参数)
      [submitInteraction, approveInteraction, rejectInteraction],  // interactions (第五个参数)
      [],
      []
    );
    await controller.setup(true);
    
    // Create request
    const request = await system.storage.create('Request', {
      title: 'Test Request',
      status: 'submitted',
      submitterId: 'user123'
    });
    
    // Execute submit interaction
    await controller.callInteraction(submitInteraction.name, {
      user: { id: 'user123' },  // Add user object
      payload: {
        requestId: request.id
      }
    });
    
    // Verify state transition
    let updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'title', 'status', 'submitterId']  // Specify fields
    );
    expect(updatedRequest.status).toBe('reviewing');
    
    // Execute approve interaction
    await controller.callInteraction(approveInteraction.name, {
      user: { id: 'admin-user' },  // Add user object
      payload: {
        requestId: request.id
      }
    });
    
    // Verify final state
    updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'title', 'status', 'submitterId']  // Specify fields
    );
    expect(updatedRequest.status).toBe('approved');
  });
});
```

## 12.3 Testing Permissions and Attributives

> **Important: Correct Error Handling Approach**
> 
> The interaqt framework automatically catches all errors (including Attributive validation failures, insufficient permissions, etc.) and returns error information through the `error` field in the return value. The framework **does not throw uncaught exceptions**.
> 
> Therefore, when writing tests:
> - ✅ **Correct approach**: Check the `error` field in the return value
> - ❌ **Wrong approach**: Use try-catch to catch exceptions
> 
> ```javascript
> // ✅ Correct testing approach
> const result = await controller.callInteraction('SomeInteraction', {...});
> expect(result.error).toBeTruthy();
> expect(result.error.message).toContain('permission denied');
> 
> // ❌ Wrong testing approach
> try {
>   await controller.callInteraction('SomeInteraction', {...});
>   fail('Should have thrown error');
> } catch (e) {
>   // This code will never execute as the framework doesn't throw exceptions
> }
> ```

### 12.3.1 Permission Testing Basics

Permission testing is an important component of interaqt application testing, requiring verification of access permissions for different users in different scenarios:

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt';

describe('Permission Testing', () => {
  let system: MonoSystem;
  let controller: Controller;
  
  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    );
    
    await controller.setup(true);
  });
  

});
```

### 12.3.2 Basic Role Permission Testing

```typescript
describe('Basic Role Permission Testing', () => {
  test('admin permission test', async () => {
    // Create admin user
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      role: 'admin',
      email: 'admin@example.com'
    });

    // Test that admin can perform privileged operations
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'Admin Created Dormitory',
        building: 'Admin Building',
        roomNumber: '001',
        capacity: 4,
        description: 'Test dormitory'
      }
    });

    expect(result.error).toBeUndefined();
    
    // Verify dormitory was actually created
    const { MatchExp } = controller.globals;
    const dormitory = await system.storage.findOne('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', 'Admin Created Dormitory'] }),
      undefined,
      ['id', 'name', 'building', 'roomNumber', 'capacity', 'description']  // Specify fields
    );
    expect(dormitory).toBeTruthy();
  });

  test('regular user permission restriction test', async () => {
    const student = await system.storage.create('User', {
      name: 'Regular Student',
      role: 'student',
      email: 'student@example.com'
    });

    // Regular student should not be able to create dormitory
    const result = await controller.callInteraction('CreateDormitory', {
      user: student,
      payload: {
        name: 'Student Attempted Dormitory',
        building: 'Student Building',
        roomNumber: '002',
        capacity: 4,
        description: 'Unauthorized test'
      }
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('Admin'); // Permission error should mention requirement
  });
});
```

### 12.3.3 Complex Permission Logic Testing

```typescript
describe('Complex Permission Logic Testing', () => {
  test('dormitory leader permission test', async () => {
    // Setup test scenario
    const leader = await system.storage.create('User', {
      name: 'Dormitory Leader',
      role: 'student',
      email: 'leader@example.com'
    });

    const member = await system.storage.create('User', {
      name: 'Regular Member',
      role: 'student',
      email: 'member@example.com'
    });

    // Create dormitory and member relations
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Permission Test Dormitory',
      building: 'Permission Test Building',
      roomNumber: '999',
      capacity: 4
    });

    const leaderMember = await system.storage.create('DormitoryMember', {
      user: leader,
      dormitory: dormitory,
      role: 'leader',
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    const normalMember = await system.storage.create('DormitoryMember', {
      user: member,
      dormitory: dormitory,
      role: 'member',
      status: 'active',
      bedNumber: 2,
      joinedAt: new Date().toISOString()
    });

    // Test that leader can record scores
    const leaderResult = await controller.callInteraction('RecordScore', {
      user: leader,
      payload: {
        memberId: normalMember,
        points: 10,
        reason: 'Cleaning duties',
        category: 'hygiene'
      }
    });
    expect(leaderResult.error).toBeUndefined();

    // Test that regular member cannot record scores
    const memberResult = await controller.callInteraction('RecordScore', {
      user: member,
      payload: {
        memberId: leaderMember,
        points: 10,
        reason: 'Attempted score recording',
        category: 'hygiene'
      }
    });
    expect(memberResult.error).toBeTruthy();
  });
});
```

### 12.3.4 Payload-level Permission Testing

```typescript
describe('Payload-level Permission Testing', () => {
  test('can only operate on own dormitory data', async () => {
    // Create two dormitory leaders
    const leader1 = await system.storage.create('User', {
      name: 'Leader 1',
      role: 'student',
      email: 'leader1@example.com'
    });

    const leader2 = await system.storage.create('User', {
      name: 'Leader 2',
      role: 'student',
      email: 'leader2@example.com'
    });

    // Create two dormitories
    const dormitory1 = await system.storage.create('Dormitory', {
      name: 'Dormitory 1',
      building: 'Test Building',
      roomNumber: '201',
      capacity: 4
    });

    const dormitory2 = await system.storage.create('Dormitory', {
      name: 'Dormitory 2',
      building: 'Test Building',
      roomNumber: '202',
      capacity: 4
    });

    // Establish member relations
    const member1 = await system.storage.create('DormitoryMember', {
      user: leader1,
      dormitory: dormitory1,
      role: 'leader',
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    const member2 = await system.storage.create('DormitoryMember', {
      user: leader2,
      dormitory: dormitory2,
      role: 'leader',
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // Leader 1 should be able to operate on own dormitory members
    const validResult = await controller.callInteraction('RecordScore', {
      user: leader1,
      payload: {
        memberId: member1,
        points: 10,
        reason: 'Cleanliness',
        category: 'hygiene'
      }
    });
    expect(validResult.error).toBeUndefined();

    // Leader 1 should not be able to operate on other dormitory members
    const invalidResult = await controller.callInteraction('RecordScore', {
      user: leader1,
      payload: {
        memberId: member2,
        points: 10,
        reason: 'Cross-dormitory operation attempt',
        category: 'hygiene'
      }
    });
    expect(invalidResult.error).toBeTruthy();
  });
});
```

### 12.3.5 Permission Edge Case Testing

```typescript
describe('Permission Edge Case Testing', () => {
  test('application restriction when dormitory is full', async () => {
    const student = await system.storage.create('User', {
      name: 'Applicant Student',
      role: 'student',
      email: 'applicant@example.com'
    });

    // Create full dormitory
    const fullDormitory = await system.storage.create('Dormitory', {
      name: 'Full Dormitory',
      building: 'Test Building',
      roomNumber: '301',
      capacity: 2
    });

    // Add members until full
    for (let i = 0; i < 2; i++) {
      const user = await system.storage.create('User', {
        name: `Member ${i + 1}`,
        role: 'student',
        email: `member${i + 1}@example.com`
      });

      await system.storage.create('DormitoryMember', {
        user: user,
        dormitory: fullDormitory,
        role: 'member',
        status: 'active',
        bedNumber: i + 1,
        joinedAt: new Date().toISOString()
      });
    }

    // Try to apply to full dormitory
    const result = await controller.callInteraction('ApplyForDormitory', {
      user: student,
      payload: {
        dormitoryId: fullDormitory,
        message: 'Hope to join this dormitory'
      }
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('DormitoryNotFull');
  });

  test('duplicate application restriction', async () => {
    const student = await system.storage.create('User', {
      name: 'Student with Dormitory',
      role: 'student',
      email: 'hasdorm@example.com'
    });

    // Create dormitories
    const dormitory1 = await system.storage.create('Dormitory', {
      name: 'Current Dormitory',
      building: 'Test Building',
      roomNumber: '401',
      capacity: 4
    });

    const dormitory2 = await system.storage.create('Dormitory', {
      name: 'Target Dormitory',
      building: 'Test Building',
      roomNumber: '402',
      capacity: 4
    });

    // Student already in dormitory1
    await system.storage.create('DormitoryMember', {
      user: student,
      dormitory: dormitory1,
      role: 'member',
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // Try to apply to dormitory2
    const result = await controller.callInteraction('ApplyForDormitory', {
      user: student,
      payload: {
        dormitoryId: dormitory2,
        message: 'Want to change dormitory'
      }
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('NoActiveDormitory');
  });
});
```

### 12.3.6 State Machine Permission Testing

```typescript
describe('State Machine Permission Testing', () => {
  test('state machine computeTarget function coverage test', async () => {
    // Create admin and target user
    const admin = await system.storage.create('User', {
      name: 'State Machine Test Admin',
      role: 'admin',
      email: 'statemachine@test.com'
    });

    const targetUser = await system.storage.create('User', {
      name: 'Student to be Kicked',
      role: 'student',
      email: 'target@test.com',
      studentId: 'TARGET001'
    });

    // Create dormitory and member
    const dormitory = await system.storage.create('Dormitory', {
      name: 'State Machine Test Dormitory',
      building: 'State Machine Test Building',
      roomNumber: '999',
      capacity: 4
    });

    const targetMember = await system.storage.create('DormitoryMember', {
      user: targetUser,
      dormitory: dormitory,
      role: 'member',
      status: 'active',
      score: -60,
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // Create kick request
    const kickRequest = await system.storage.create('KickRequest', {
      targetMember: targetMember,
      requester: admin,
      reason: 'Violated dormitory rules, score too low',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // Execute ApproveKickRequest interaction, trigger state machine
    const result = await controller.callInteraction('ApproveKickRequest', {
      user: admin,
      payload: {
        kickRequestId: kickRequest,
        adminComment: 'Admin approved kick request'
      }
    });

    expect(result.error).toBeUndefined();

    // Verify state machine successfully executed state transition
    const { MatchExp } = controller.globals;
    const updatedMember = await system.storage.findOne('DormitoryMember', 
      MatchExp.atom({ key: 'id', value: ['=', targetMember.id] }),
      undefined,
      ['status']
    );

    expect(updatedMember.status).toBe('kicked');
  });
});
```

### 12.3.7 Permission Debugging and Error Handling Testing

```typescript
describe('Permission Debugging and Error Handling', () => {
  test('should provide clear permission error messages', async () => {
    const student = await system.storage.create('User', {
      name: 'Regular Student',
      role: 'student',
      email: 'student@example.com'
    });

    const result = await controller.callInteraction('CreateDormitory', {
      user: student,
      payload: {
        name: 'Test Dormitory',
        building: 'Test Building',
        roomNumber: '101',
        capacity: 4,
        description: 'Test dormitory'
      }
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('Admin');
  });

  test('permission checks should handle database query errors', async () => {
    const student = await system.storage.create('User', {
      name: 'Test Student',
      role: 'student',
      email: 'test@example.com'
    });

    // Pass invalid ID to trigger query error
    const result = await controller.callInteraction('RecordScore', {
      user: student,
      payload: {
        memberId: { id: 'invalid-member-id' },
        points: 10,
        reason: 'Test error handling',
        category: 'hygiene'
      }
    });

    expect(result.error).toBeTruthy();
  });
});
```

## 12.4 Testing Best Practices

### 12.4.1 Test Organization (Interaction-Focused)

```typescript
// Organize tests by Interactions, not by data structures
describe('User Management Interactions', () => {
  describe('CreateUser Interaction', () => {
    test('should create user with valid data', () => {});
    test('should reject invalid email format', () => {});
    test('should enforce unique username constraint', () => {});
    test('should update userCount computation', () => {});
    test('should require admin permission', () => {});
  });
  
  describe('CreateFriendship Interaction', () => {
    test('should establish friendship between users', () => {});
    test('should update both users friend count', () => {});
    test('should handle symmetric relationship correctly', () => {});
    test('should prevent duplicate friendships', () => {});
    test('should require both users consent', () => {});
  });
  
  describe('UpdateUserScore Interaction', () => {
    test('should update user score correctly', () => {});
    test('should trigger score-based computations', () => {});
    test('should validate score range', () => {});
    test('should require moderator permission', () => {});
    test('should create audit log entry', () => {});
  });
  
  describe('Edge Cases and Error Scenarios', () => {
    test('should handle concurrent friend requests', () => {});
    test('should handle database connection failures gracefully', () => {});
    test('should provide meaningful error messages', () => {});
  });
});
```

Testing is a crucial aspect of building reliable interaqt applications. By focusing on comprehensive Interaction testing, developers can ensure their reactive applications work correctly and maintain quality as they evolve. Remember: in interaqt, all data flows from Interactions, so testing Interactions thoroughly is sufficient to achieve complete test coverage. Skip entity and relation unit tests - they're automatically covered when you test the Interactions that use them. Proper test organization, edge case coverage, and permission testing make tests maintainable and effective for long-term development.
