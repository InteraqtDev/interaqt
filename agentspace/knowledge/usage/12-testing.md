# 12. 如何进行测试

测试是确保 @interaqt/runtime 应用质量的重要环节。框架提供了完整的测试支持，包括单元测试、集成测试和端到端测试。本章将详细介绍如何为响应式应用编写有效的测试。

## 12.1 搭建测试环境

### 12.1.1 测试框架配置

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
import { MonoSystem, PGLiteDB } from '@interaqt/runtime';

let testSystem: MonoSystem;

beforeEach(async () => {
  // 为每个测试创建独立的数据库实例
  testSystem = new MonoSystem(new PGLiteDB());
});

afterEach(async () => {
  // 清理测试数据
  if (testSystem) {
    await testSystem.storage.clear();
  }
});

export { testSystem };
```

### 12.1.2 测试数据库配置

```typescript
// tests/testDatabase.ts
import { MonoSystem, PGLiteDB, MemoryDB } from '@interaqt/runtime';

export function createTestSystem() {
  // 使用内存数据库进行快速测试
  return new MonoSystem(new MemoryDB());
}

export function createPersistentTestSystem() {
  // 使用持久化数据库进行集成测试
  return new MonoSystem(new PGLiteDB({
    database: ':memory:' // 内存模式，测试结束后自动清理
  }));
}

// 测试数据工厂
export class TestDataFactory {
  constructor(private system: MonoSystem) {}
  
  async createUser(overrides: any = {}) {
    return await this.system.storage.create('User', {
      username: 'testuser',
      email: 'test@example.com',
      isActive: true,
      ...overrides
    });
  }
  
  async createPost(userId: string, overrides: any = {}) {
    return await this.system.storage.create('Post', {
      title: 'Test Post',
      content: 'Test content',
      authorId: userId,
      status: 'published',
      ...overrides
    });
  }
}
```

## 12.2 测试实体和关系

### 12.2.1 基本实体测试

```typescript
// tests/entities/user.spec.ts
import { describe, test, expect } from 'vitest';
import { Entity, Property, Controller } from '@interaqt/runtime';
import { createTestSystem, TestDataFactory } from '../testDatabase';

describe('User Entity', () => {
  test('should create user with basic properties', async () => {
    const system = createTestSystem();
    const factory = new TestDataFactory(system);
    
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
    
    const user = await factory.createUser({
      username: 'alice',
      email: 'alice@example.com'
    });
    
    expect(user.username).toBe('alice');
    expect(user.email).toBe('alice@example.com');
    expect(user.isActive).toBe(true);
  });
  
  test('should validate required properties', async () => {
    const system = createTestSystem();
    
    // 尝试创建缺少必需属性的用户
    await expect(
      system.storage.create('User', { email: 'test@example.com' })
    ).rejects.toThrow('username is required');
  });
});
```

### 12.2.2 关系测试

```typescript
// tests/relations/friendship.spec.ts
describe('Friendship Relation', () => {
  test('should create bidirectional friendship', async () => {
    const system = createTestSystem();
    const factory = new TestDataFactory(system);
    
    // 创建用户实体和好友关系
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
    
    // 创建两个用户
    const alice = await factory.createUser({ username: 'alice' });
    const bob = await factory.createUser({ username: 'bob' });
    
    // 建立好友关系
    const friendship = await system.storage.create('User_friends_friendOf_User', {
      source: alice.id,
      target: bob.id,
      since: '2023-01-01',
      closeness: 8
    });
    
    // 验证关系创建成功
    expect(friendship.source).toBe(alice.id);
    expect(friendship.target).toBe(bob.id);
    expect(friendship.since).toBe('2023-01-01');
    expect(friendship.closeness).toBe(8);
    
    // 验证双向关系（对称关系应该自动创建反向关系）
    const reverseRelation = await system.storage.findOne(
      'User_friends_friendOf_User',
      MatchExp.atom({ key: 'source', value: ['=', bob.id] })
        .and({ key: 'target', value: ['=', alice.id] })
    );
    
    expect(reverseRelation).toBeTruthy();
  });
});
```

## 12.3 测试响应式计算

### 12.3.1 计数计算测试

```typescript
// tests/computations/count.spec.ts
describe('Count Computation', () => {
  test('should update user count automatically', async () => {
    const system = createTestSystem();
    
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
    
    // 初始状态检查
    let totalUsers = await system.storage.get('state', 'totalUsers');
    let activeUsers = await system.storage.get('state', 'activeUsers');
    expect(totalUsers).toBe(0);
    expect(activeUsers).toBe(0);
    
    // 创建活跃用户
    await system.storage.create('User', {
      username: 'alice',
      isActive: true
    });
    
    // 验证计数更新
    totalUsers = await system.storage.get('state', 'totalUsers');
    activeUsers = await system.storage.get('state', 'activeUsers');
    expect(totalUsers).toBe(1);
    expect(activeUsers).toBe(1);
    
    // 创建非活跃用户
    await system.storage.create('User', {
      username: 'bob',
      isActive: false
    });
    
    // 验证计数更新
    totalUsers = await system.storage.get('state', 'totalUsers');
    activeUsers = await system.storage.get('state', 'activeUsers');
    expect(totalUsers).toBe(2);
    expect(activeUsers).toBe(1);
  });
});
```

### 12.3.2 复杂计算测试

```typescript
// tests/computations/transform.spec.ts
describe('Transform Computation', () => {
  test('should calculate user statistics correctly', async () => {
    const system = createTestSystem();
    
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
    
    // 创建测试用户
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
    
    // 验证统计计算
    const stats = await system.storage.get('state', 'userStats');
    expect(stats.totalUsers).toBe(3);
    expect(stats.averageAge).toBe(30);
    expect(stats.averageScore).toBeCloseTo(85);
    expect(stats.maxScore).toBe(92);
    expect(stats.minScore).toBe(78);
  });
});
```

## 12.4 测试交互和活动

### 12.4.1 交互测试

```typescript
// tests/interactions/userActions.spec.ts
describe('User Interactions', () => {
  test('should handle user registration interaction', async () => {
    const system = createTestSystem();
    
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
    
    // 执行注册交互
    const result = await controller.callInteraction(registerInteraction.uuid, {
      userData: {
        username: 'newuser',
        email: 'newuser@example.com'
      }
    });
    
    // 验证交互结果
    expect(result).toBeTruthy();
    
    // 验证用户创建
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

### 12.4.2 活动测试

```typescript
// tests/activities/approvalProcess.spec.ts
describe('Approval Process Activity', () => {
  test('should handle complete approval workflow', async () => {
    const system = createTestSystem();
    
    // 创建请求实体
    const requestEntity = Entity.create({
      name: 'Request',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'submitterId', type: 'string' })
      ]
    });
    
    // 创建活动状态
    const submittedState = StateNode.create({ name: 'submitted' });
    const reviewingState = StateNode.create({ name: 'reviewing' });
    const approvedState = StateNode.create({ name: 'approved' });
    const rejectedState = StateNode.create({ name: 'rejected' });
    
    // 创建交互
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
    
    // 创建状态转移
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
    
    // 创建活动
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
    
    // 创建请求
    const request = await system.storage.create('Request', {
      title: 'Test Request',
      status: 'submitted',
      submitterId: 'user123'
    });
    
    // 执行提交交互
    await controller.callInteraction(submitInteraction.uuid, {
      requestId: request.id
    });
    
    // 验证状态转换
    let updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] })
    );
    expect(updatedRequest.status).toBe('reviewing');
    
    // 执行批准交互
    await controller.callInteraction(approveInteraction.uuid, {
      requestId: request.id
    });
    
    // 验证最终状态
    updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] })
    );
    expect(updatedRequest.status).toBe('approved');
  });
});
```

## 12.5 性能和集成测试

### 12.5.1 性能测试

```typescript
// tests/performance/computation.spec.ts
describe('Performance Tests', () => {
  test('should handle large dataset efficiently', async () => {
    const system = createTestSystem();
    const factory = new TestDataFactory(system);
    
    // 设置实体和计算
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'score', type: 'number' })
      ]
    });
    
    const avgScoreDict = Dictionary.create({
      name: 'avgScore',
      type: 'number',
      collection: false,
      computedData: WeightedSummation.create({
        record: userEntity,
        attributeQuery: ['score'],
        callback: (user: any) => ({
          weight: 1,
          value: user.score || 0
        })
      })
    });
    
    const controller = new Controller(
      system,
      [userEntity],
      [],
      [],
      [],
      [avgScoreDict],
      []
    );
    await controller.setup(true);
    
    // 性能测试：创建大量用户
    const startTime = Date.now();
    const userCount = 1000;
    
    for (let i = 0; i < userCount; i++) {
      await factory.createUser({
        username: `user${i}`,
        score: Math.floor(Math.random() * 100)
      });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Created ${userCount} users in ${duration}ms`);
    expect(duration).toBeLessThan(5000); // 应该在5秒内完成
    
    // 验证计算结果
    const avgScore = await system.storage.get('state', 'avgScore');
    expect(typeof avgScore).toBe('number');
    expect(avgScore).toBeGreaterThan(0);
  });
});
```

### 12.5.2 集成测试

```typescript
// tests/integration/fullWorkflow.spec.ts
describe('Full Workflow Integration', () => {
  test('should handle complete user lifecycle', async () => {
    const system = createTestSystem();
    
    // 设置完整的系统
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'username', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
      ]
    });
    
    const postEntity = Entity.create({
      name: 'Post',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'content', type: 'string' }),
        Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' })
      ]
    });
    
    const userPostRelation = Relation.create({
      name: 'UserPost',
      source: userEntity,
      sourceProperty: 'posts',
      target: postEntity,
      targetProperty: 'author',
      type: '1:n'
    });
    
    // 添加计算属性
    userEntity.properties.push(
      Property.create({
        name: 'postCount',
        type: 'number',
        computedData: Count.create({
          record: userPostRelation,
          attributeQuery: [['target', { attributeQuery: ['status'] }]],
          callback: (relation: any) => relation.target.status === 'published'
        })
      })
    );
    
    const controller = new Controller(
      system,
      [userEntity, postEntity],
      [userPostRelation],
      [],
      [],
      [],
      []
    );
    await controller.setup(true);
    
    // 1. 创建用户
    const user = await system.storage.create('User', {
      username: 'blogger',
      email: 'blogger@example.com'
    });
    
    // 2. 创建文章
    const post1 = await system.storage.create('Post', {
      title: 'First Post',
      content: 'This is my first post',
      status: 'published'
    });
    
    const post2 = await system.storage.create('Post', {
      title: 'Draft Post',
      content: 'This is a draft',
      status: 'draft'
    });
    
    // 3. 建立关系
    await system.storage.create('User_posts_author_Post', {
      source: user.id,
      target: post1.id
    });
    
    await system.storage.create('User_posts_author_Post', {
      source: user.id,
      target: post2.id
    });
    
    // 4. 验证计算属性
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      {},
      ['id', 'username', 'postCount']
    );
    
    expect(updatedUser.postCount).toBe(1); // 只计算已发布的文章
    
    // 5. 发布草稿文章
    await system.storage.update(
      'Post',
      MatchExp.atom({ key: 'id', value: ['=', post2.id] }),
      { status: 'published' }
    );
    
    // 6. 验证计算更新
    const finalUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      {},
      ['id', 'username', 'postCount']
    );
    
    expect(finalUser.postCount).toBe(2); // 现在应该计算两篇已发布的文章
  });
});
```

## 12.6 测试最佳实践

### 12.6.1 测试组织

```typescript
// 使用测试套件组织相关测试
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
});
```

### 12.6.2 测试数据管理

```typescript
// 使用工厂模式创建测试数据
class TestScenarios {
  constructor(private system: MonoSystem) {}
  
  async createBlogScenario() {
    // 创建博客相关的测试数据
    const author = await this.system.storage.create('User', {
      username: 'author',
      email: 'author@example.com'
    });
    
    const posts = await Promise.all([
      this.system.storage.create('Post', {
        title: 'Post 1',
        content: 'Content 1',
        authorId: author.id
      }),
      this.system.storage.create('Post', {
        title: 'Post 2',
        content: 'Content 2',
        authorId: author.id
      })
    ]);
    
    return { author, posts };
  }
  
  async createSocialScenario() {
    // 创建社交网络相关的测试数据
    const users = await Promise.all([
      this.system.storage.create('User', { username: 'alice' }),
      this.system.storage.create('User', { username: 'bob' }),
      this.system.storage.create('User', { username: 'charlie' })
    ]);
    
    // 建立好友关系
    await this.system.storage.create('User_friends_friends_User', {
      source: users[0].id,
      target: users[1].id
    });
    
    return { users };
  }
}
```

通过系统化的测试方法，可以确保 @interaqt/runtime 应用的稳定性和可靠性。测试不仅能够验证功能的正确性，还能帮助发现性能问题和边界情况，为应用的长期维护提供保障。 