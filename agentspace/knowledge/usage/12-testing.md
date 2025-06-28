# 12. 如何进行测试

测试是确保 interaqt 应用质量的重要环节。框架提供了完整的测试支持，包括单元测试、集成测试和端到端测试。本章将详细介绍如何为响应式应用编写有效的测试。

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
import { MonoSystem, PGLiteDB } from 'interaqt';

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
import { MonoSystem, PGLiteDB, MemoryDB } from 'interaqt';

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
import { Entity, Property, Controller } from 'interaqt';
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
    const result = await controller.callInteraction(registerInteraction.name, {
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
    await controller.callInteraction(submitInteraction.name, {
      requestId: request.id
    });
    
    // 验证状态转换
    let updatedRequest = await system.storage.findOne(
      'Request',
      MatchExp.atom({ key: 'id', value: ['=', request.id] })
    );
    expect(updatedRequest.status).toBe('reviewing');
    
    // 执行批准交互
    await controller.callInteraction(approveInteraction.name, {
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

## 12.6 测试权限和定语 (Attributive)

> **重要提示：错误处理的正确方式**
> 
> interaqt 框架会自动捕获所有错误（包括 Attributive 验证失败、权限不足等），并通过返回值中的 `error` 字段返回错误信息。框架**不会抛出未捕获的异常**。
> 
> 因此，在编写测试时：
> - ✅ **正确做法**：检查返回值的 `error` 字段
> - ❌ **错误做法**：使用 try-catch 捕获异常
> 
> ```javascript
> // ✅ 正确的测试方式
> const result = await controller.callInteraction('SomeInteraction', {...});
> expect(result.error).toBeTruthy();
> expect(result.error.message).toContain('permission denied');
> 
> // ❌ 错误的测试方式
> try {
>   await controller.callInteraction('SomeInteraction', {...});
>   fail('Should have thrown error');
> } catch (e) {
>   // 这段代码永远不会执行，因为框架不会抛出异常
> }
> ```

### 12.6.1 权限测试基础

权限测试是 interaqt 应用测试的重要组成部分，需要验证不同用户在不同场景下的访问权限：

```typescript
// tests/permissions/setup.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from '@';

describe('权限测试', () => {
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
  
  // 创建测试用户的辅助函数
  async function createTestUser(userData: any) {
    return await system.storage.create('User', {
      name: '测试用户',
      role: 'student',
      email: 'test@example.com',
      ...userData
    });
  }
  
  // 执行交互的辅助函数
  async function executeInteractionWithUser(
    interactionName: string,
    user: any,
    payload: any
  ) {
    const interactionCall = controller.activityManager?.interactionCallsByName.get(interactionName);
    if (!interactionCall) {
      throw new Error(`找不到交互: ${interactionName}`);
    }
    
    return await controller.callInteraction(interactionCall.interaction.name, {
      user,
      payload
    });
  }
});
```

### 12.6.2 基本角色权限测试

```typescript
describe('基本角色权限测试', () => {
  test('管理员权限测试', async () => {
    // 创建管理员用户
    const admin = await createTestUser({
      name: '张管理员',
      role: 'admin',
      email: 'admin@example.com'
    });

    // 测试管理员可以执行特权操作
    const result = await executeInteractionWithUser('CreateDormitory', admin, {
      name: '管理员创建的宿舍',
      building: '管理楼',
      roomNumber: '001',
      capacity: 4,
      description: '测试宿舍'
    });

    expect(result.error).toBeUndefined();
    
    // 验证宿舍确实被创建
    const { MatchExp } = controller.globals;
    const dormitory = await system.storage.findOne('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', '管理员创建的宿舍'] })
    );
    expect(dormitory).toBeTruthy();
  });

  test('普通用户权限限制测试', async () => {
    const student = await createTestUser({
      name: '普通学生',
      role: 'student',
      email: 'student@example.com'
    });

    // 普通学生不应该能创建宿舍
    const result = await executeInteractionWithUser('CreateDormitory', student, {
      name: '学生尝试创建的宿舍',
      building: '学生楼',
      roomNumber: '002',
      capacity: 4,
      description: '无权限测试'
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('Admin'); // 权限错误应该提到具体要求
  });
});
```

### 12.6.3 复杂权限逻辑测试

```typescript
describe('复杂权限逻辑测试', () => {
  test('宿舍长权限测试', async () => {
    // 设置测试场景
    const leader = await createTestUser({
      name: '宿舍长',
      role: 'student',
      email: 'leader@example.com'
    });

    const member = await createTestUser({
      name: '普通成员',
      role: 'student',
      email: 'member@example.com'
    });

    // 创建宿舍和成员关系
    const dormitory = await system.storage.create('Dormitory', {
      name: '权限测试宿舍',
      building: '权限测试楼',
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

    // 测试宿舍长可以记录积分
    const leaderResult = await executeInteractionWithUser('RecordScore', leader, {
      memberId: normalMember,
      points: 10,
      reason: '打扫卫生',
      category: 'hygiene'
    });
    expect(leaderResult.error).toBeUndefined();

    // 测试普通成员不能记录积分
    const memberResult = await executeInteractionWithUser('RecordScore', member, {
      memberId: leaderMember,
      points: 10,
      reason: '尝试记录积分',
      category: 'hygiene'
    });
    expect(memberResult.error).toBeTruthy();
  });
});
```

### 12.6.4 Payload 级别权限测试

```typescript
describe('Payload级别权限测试', () => {
  test('只能操作自己宿舍的数据', async () => {
    // 创建两个宿舍的宿舍长
    const leader1 = await createTestUser({
      name: '宿舍长1',
      role: 'student',
      email: 'leader1@example.com'
    });

    const leader2 = await createTestUser({
      name: '宿舍长2',
      role: 'student',
      email: 'leader2@example.com'
    });

    // 创建两个宿舍
    const dormitory1 = await system.storage.create('Dormitory', {
      name: '宿舍1',
      building: '测试楼',
      roomNumber: '201',
      capacity: 4
    });

    const dormitory2 = await system.storage.create('Dormitory', {
      name: '宿舍2',
      building: '测试楼',
      roomNumber: '202',
      capacity: 4
    });

    // 建立成员关系
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

    // 宿舍长1应该能操作自己宿舍的成员
    const validResult = await executeInteractionWithUser('RecordScore', leader1, {
      memberId: member1,
      points: 10,
      reason: '清洁卫生',
      category: 'hygiene'
    });
    expect(validResult.error).toBeUndefined();

    // 宿舍长1不应该能操作其他宿舍的成员
    const invalidResult = await executeInteractionWithUser('RecordScore', leader1, {
      memberId: member2,
      points: 10,
      reason: '尝试跨宿舍操作',
      category: 'hygiene'
    });
    expect(invalidResult.error).toBeTruthy();
  });
});
```

### 12.6.5 权限边界情况测试

```typescript
describe('权限边界情况测试', () => {
  test('宿舍满员时的申请限制', async () => {
    const student = await createTestUser({
      name: '申请学生',
      role: 'student',
      email: 'applicant@example.com'
    });

    // 创建已满的宿舍
    const fullDormitory = await system.storage.create('Dormitory', {
      name: '已满宿舍',
      building: '测试楼',
      roomNumber: '301',
      capacity: 2
    });

    // 添加成员直到满员
    for (let i = 0; i < 2; i++) {
      const user = await createTestUser({
        name: `成员${i + 1}`,
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

    // 尝试申请加入已满的宿舍
    const result = await executeInteractionWithUser('ApplyForDormitory', student, {
      dormitoryId: fullDormitory,
      message: '希望加入这个宿舍'
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('DormitoryNotFull');
  });

  test('重复申请的限制', async () => {
    const student = await createTestUser({
      name: '有宿舍学生',
      role: 'student',
      email: 'hasdorm@example.com'
    });

    // 创建宿舍
    const dormitory1 = await system.storage.create('Dormitory', {
      name: '当前宿舍',
      building: '测试楼',
      roomNumber: '401',
      capacity: 4
    });

    const dormitory2 = await system.storage.create('Dormitory', {
      name: '目标宿舍',
      building: '测试楼',
      roomNumber: '402',
      capacity: 4
    });

    // 学生已在宿舍1
    await system.storage.create('DormitoryMember', {
      user: student,
      dormitory: dormitory1,
      role: 'member',
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    // 尝试申请宿舍2
    const result = await executeInteractionWithUser('ApplyForDormitory', student, {
      dormitoryId: dormitory2,
      message: '想换宿舍'
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('NoActiveDormitory');
  });
});
```

### 12.6.6 状态机权限测试

```typescript
describe('状态机权限测试', () => {
  test('状态机computeTarget函数覆盖测试', async () => {
    // 创建管理员和目标用户
    const admin = await createTestUser({
      name: '状态机测试管理员',
      role: 'admin',
      email: 'statemachine@test.com'
    });

    const targetUser = await createTestUser({
      name: '被踢出的学生',
      role: 'student',
      email: 'target@test.com',
      studentId: 'TARGET001'
    });

    // 创建宿舍和成员
    const dormitory = await system.storage.create('Dormitory', {
      name: '状态机测试宿舍',
      building: '状态机测试楼',
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

    // 创建踢出请求
    const kickRequest = await system.storage.create('KickRequest', {
      targetMember: targetMember,
      requester: admin,
      reason: '违反宿舍规定，积分过低',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // 执行ApproveKickRequest交互，触发状态机
    const result = await executeInteractionWithUser('ApproveKickRequest', admin, {
      kickRequestId: kickRequest,
      adminComment: '管理员批准踢出请求'
    });

    expect(result.error).toBeUndefined();

    // 验证状态机成功执行了状态转换
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

### 12.6.7 权限调试和错误处理测试

```typescript
describe('权限调试和错误处理', () => {
  test('应该提供清晰的权限错误信息', async () => {
    const student = await createTestUser({
      name: '普通学生',
      role: 'student',
      email: 'student@example.com'
    });

    const result = await executeInteractionWithUser('CreateDormitory', student, {
      name: '测试宿舍',
      building: '测试楼',
      roomNumber: '101',
      capacity: 4,
      description: '测试用宿舍'
    });

    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain('Admin');
  });

  test('权限检查应该处理数据库查询错误', async () => {
    const student = await createTestUser({
      name: '测试学生',
      role: 'student',
      email: 'test@example.com'
    });

    // 传递无效ID触发查询错误
    const result = await executeInteractionWithUser('RecordScore', student, {
      memberId: { id: 'invalid-member-id' },
      points: 10,
      reason: '测试错误处理',
      category: 'hygiene'
    });

    expect(result.error).toBeTruthy();
  });
});
```

## 12.7 测试最佳实践

### 12.7.1 测试组织

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
  
  describe('User Permissions', () => {
    test('should enforce role-based access', () => {});
    test('should handle complex attributive logic', () => {});
    test('should test permission edge cases', () => {});
  });
});
```
