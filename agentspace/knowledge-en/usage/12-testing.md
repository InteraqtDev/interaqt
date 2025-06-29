# 12. How to Perform Testing

Testing is a crucial component for ensuring the quality of InterAQT applications. The framework provides comprehensive testing support, including unit testing, integration testing, and end-to-end testing. This chapter will detail how to write effective tests for reactive applications.

## 12.1 Setting Up Test Environment

### 12.1.1 Test Framework Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000
  }
});

// tests/setup.ts
import { beforeEach, afterEach } from 'vitest';
import { MonoSystem, PGLiteDB } from 'interaqt';

let testSystem: MonoSystem;

beforeEach(async () => {
  // Create independent database instance for each test
  testSystem = new MonoSystem(new PGLiteDB());
});

afterEach(async () => {
  // Clean up test data
  if (testSystem) {
    await testSystem.storage.clear();
  }
});

export { testSystem };
```

### 12.1.2 Test Database Configuration

```typescript
// Use interaqt API directly in tests
import { MonoSystem, PGLiteDB } from 'interaqt';

// Use in-memory database for fast testing
const testSystem = new MonoSystem(new PGLiteDB());
```

## 12.2 Testing Entities and Relations

### 12.2.1 Basic Entity Testing

```typescript
// tests/entities/user.spec.ts
import { describe, test, expect } from 'vitest';
import { Entity, Property, Controller } from 'interaqt';
import { MonoSystem } from 'interaqt'; //import from '../testDatabase';

describe('User Entity', () => {
  test('should create user with basic properties', async () => {
    const system = new MonoSystem();
    
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean' })
      ]
    });
    
    const controller = new Controller(system, [userEntity], [], [], [], [], []);
    await controller.setup(true);
    
    const user = await system.storage.create('User',({
      username: 'alice',
      email: 'alice@example.com'
    });
    
    expect(user.username).toBe('alice');
    expect(user.email).toBe('alice@example.com');
    expect(user.isActive).toBe(true);
  });
  
  test('should validate required properties', async () => {
    const system = new MonoSystem();
    
    // Try to create user missing required properties
    await expect(
      system.storage.create('User', { email: 'test@example.com' })
    ).rejects.toThrow('username is required');
  });
});
```

### 12.2.2 Relationship Testing

```typescript
// tests/relations/friendship.spec.ts
describe('Friendship Relation', () => {
  test('should create bidirectional friendship', async () => {
    const system = new MonoSystem();
    
    // Create user entity and friendship relation
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' })
      ]
    });
    
    const friendshipRelation = Relation.create({
      name: 'Friendship',
      source: userEntity,
      sourceProperty: 'friends',
      target: userEntity,
      targetProperty: 'friendOf',
      type: 'n:n',
      symmetric: true,
      properties: [
        Property.create({ name: 'since', type: 'string' }),
        Property.create({ name: 'closeness', type: 'number' })
      ]
    });
    
    const controller = new Controller(
      system, 
      [userEntity], 
      [friendshipRelation], 
      [], [], [], []
    );
    await controller.setup(true);
    
    // Create two users
    const alice = await system.storage.create('User',({ username: 'alice' });
    const bob = await system.storage.create('User',({ username: 'bob' });
    
    // Establish friendship
    const friendship = await system.storage.create('User_friends_friendOf_User', {
      source: alice.id,
      target: bob.id,
      since: '2023-01-01',
      closeness: 8
    });
    
    // Verify relation creation
    expect(friendship.source).toBe(alice.id);
    expect(friendship.target).toBe(bob.id);
    expect(friendship.since).toBe('2023-01-01');
    expect(friendship.closeness).toBe(8);
    
    // Verify bidirectional relation (symmetric relation should auto-create reverse)
    const reverseRelation = await system.storage.findOne(
      'User_friends_friendOf_User',
      MatchExp.atom({ key: 'source', value: ['=', bob.id] })
        .and({ key: 'target', value: ['=', alice.id] })
    );
    
    expect(reverseRelation).toBeTruthy();
  });
});
```

## 12.3 Testing Reactive Computations

### 12.3.1 Count Computation Testing

```typescript
// tests/computations/count.spec.ts
describe('Count Computation', () => {
  test('should update user count automatically', async () => {
    const system = new MonoSystem();
    
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
      computedData: Count.create({
        record: userEntity
      })
    });
    
    const activeUsersDict = Dictionary.create({
      name: 'activeUsers',
      type: 'number',
      collection: false,
      defaultValue: () => 0,
      computedData: Count.create({
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

### 12.3.2 Complex Computation Testing

```typescript
// tests/computations/transform.spec.ts
describe('Transform Computation', () => {
  test('should calculate user statistics correctly', async () => {
    const system = new MonoSystem();
    
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
      computedData: Transform.create({
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

## 12.4 Testing Interactions and Activities

### 12.4.1 Interaction Testing

```typescript
// tests/interactions/userActions.spec.ts
describe('User Interactions', () => {
  test('should handle user registration interaction', async () => {
    const system = new MonoSystem();
    
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
      [registerInteraction],
      [],
      [],
      []
    );
    await controller.setup(true);
    
    // Execute registration interaction
    const result = await controller.callInteraction(registerInteraction.name, {
      userData: {
        username: 'newuser',
        email: 'newuser@example.com'
      }
    });
    
    // Verify interaction result
    expect(result).toBeTruthy();
    
    // Verify user creation
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'newuser'] })
    );
    
    expect(user).toBeTruthy();
    expect(user.username).toBe('newuser');
    expect(user.email).toBe('newuser@example.com');
    expect(user.isActive).toBe(true);
  });
});
```

### 12.4.2 Activity Testing

```typescript
// tests/activities/approvalProcess.spec.ts
describe('Approval Process Activity', () => {
  test('should handle complete approval workflow', async () => {
    const system = new MonoSystem();
    
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
      [submitInteraction, approveInteraction, rejectInteraction],
      [approvalActivity],
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
      requestId: request.id
    });
    
    // Verify state transition
    let updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] })
    );
    expect(updatedRequest.status).toBe('reviewing');
    
    // Execute approve interaction
    await controller.callInteraction(approveInteraction.name, {
      requestId: request.id
    });
    
    // Verify final state
    updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] })
    );
    expect(updatedRequest.status).toBe('approved');
  });
});
```

## 12.5 Testing Permissions and Attributives

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

### 12.5.1 Permission Testing Basics

Permission testing is an important component of InterAQT application testing, requiring verification of access permissions for different users in different scenarios:

```typescript
// tests/permissions/setup.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from '@';

describe('Permission Testing', () => {
  let system: MonoSystem;
  let controller: Controller;
  
  beforeEach(async () => {
    system = new MonoSystem();
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

### 12.5.2 Basic Role Permission Testing

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
    });

    expect(result.error).toBeUndefined();
    
    // Verify dormitory was actually created
    const { MatchExp } = controller.globals;
    const dormitory = await system.storage.findOne('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', 'Admin Created Dormitory'] })
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
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('Admin'); // Permission error should mention requirement
  });
});
```

### 12.5.3 Complex Permission Logic Testing

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
    });
    expect(memberResult.error).toBeTruthy();
  });
});
```

### 12.5.4 Payload-level Permission Testing

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
    });
    expect(invalidResult.error).toBeTruthy();
  });
});
```

### 12.5.5 Permission Edge Case Testing

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
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('NoActiveDormitory');
  });
});
```

### 12.5.6 State Machine Permission Testing

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

### 12.5.7 Permission Debugging and Error Handling Testing

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
    });

    expect(result.error).toBeTruthy();
  });
});
```

## 12.6 Testing Best Practices

### 12.6.1 Test Organization

```typescript
// Use test suites to organize related tests
describe('User Management', () => {
  describe('User Creation', () => {
    test('should create user with valid data', () => {});
    test('should reject invalid email format', () => {});
    test('should enforce unique username', () => {});
  });
  
  describe('User Relationships', () => {
    test('should create friendship relation', () => {});
    test('should handle symmetric relationships', () => {});
  });
  
  describe('User Computations', () => {
    test('should update friend count', () => {});
    test('should calculate user score', () => {});
  });
  
  describe('User Permissions', () => {
    test('should enforce role-based access', () => {});
    test('should handle complex attributive logic', () => {});
    test('should test permission edge cases', () => {});
  });
});
```

Testing is a crucial aspect of building reliable InterAQT applications. Through comprehensive testing of entities, relations, computations, interactions, activities, and permissions, developers can ensure their reactive applications work correctly and maintain quality as they evolve. Proper test organization, data management, and assertion patterns make tests maintainable and effective for long-term development.
