# Filtered Entity 测试指南

## 概述

测试 Filtered Entity 功能需要验证多个方面：查询重定向、标记维护、事件生成、边界情况等。本指南提供完整的测试策略和示例。

## 测试环境设置

### 基本设置

```typescript
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property } from '@shared';
import { PGLiteDB } from '@runtime';

describe('filtered entity test', () => {
  let db: PGLiteDB;
  let setup: DBSetup;
  let entityQueryHandle: EntityQueryHandle;

  beforeEach(async () => {
    // 创建源实体
    const User = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'age', type: 'number' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'department', type: 'string' })
      ]
    });

    // 创建 filtered entities
    const ActiveUser = Entity.create({
      name: 'ActiveUser',
      sourceEntity: User,
      filterCondition: MatchExp.atom({
        key: 'status',
        value: ['=', 'active']
      })
    });

    // 初始化数据库
    db = new PGLiteDB();
    await db.open();
    
    const entities = [User, ActiveUser];
    setup = new DBSetup(entities, [], db);
    await setup.createTables();
    
    entityQueryHandle = new EntityQueryHandle(
      new EntityToTableMap(setup.map), 
      db
    );
  });

  afterEach(async () => {
    await db.close();
  });
});
```

## 测试场景

### 1. 基础功能测试

#### 识别 Filtered Entity

```typescript
test('should identify filtered entities correctly', () => {
  expect(entityQueryHandle.isFilteredEntity('User')).toBe(false);
  expect(entityQueryHandle.isFilteredEntity('ActiveUser')).toBe(true);
});
```

#### 获取配置信息

```typescript
test('should get filtered entity config', () => {
  const config = entityQueryHandle.getFilteredEntityConfig('ActiveUser');
  expect(config?.sourceRecordName).toBe('User');
  expect(config?.filterCondition).toBeDefined();
  expect(config?.filterCondition.key).toBe('status');
});
```

### 2. CRUD 操作测试

#### 创建和查询

```typescript
test('create and query filtered entity', async () => {
  // 创建满足条件的记录
  const activeUser = await entityQueryHandle.create('User', {
    name: 'Alice',
    age: 25,
    status: 'active',
    department: 'Tech'
  });

  // 创建不满足条件的记录
  const inactiveUser = await entityQueryHandle.create('User', {
    name: 'Bob',
    age: 30,
    status: 'inactive',
    department: 'HR'
  });

  // 查询 filtered entity
  const activeUsers = await entityQueryHandle.find('ActiveUser', 
    undefined, 
    undefined, 
    ['name', 'status']
  );

  expect(activeUsers).toHaveLength(1);
  expect(activeUsers[0].name).toBe('Alice');
});
```

#### 更新操作

```typescript
test('update affecting filtered entity membership', async () => {
  const user = await entityQueryHandle.create('User', {
    name: 'Charlie',
    status: 'inactive'
  });

  // 更新使其满足 filtered entity 条件
  await entityQueryHandle.update('User',
    MatchExp.atom({ key: 'id', value: ['=', user.id] }),
    { status: 'active' }
  );

  const activeUsers = await entityQueryHandle.find('ActiveUser');
  expect(activeUsers).toHaveLength(1);
  expect(activeUsers[0].id).toBe(user.id);
});
```

### 3. 事件测试

#### 创建事件

```typescript
test('filtered entity create events', async () => {
  const events: any[] = [];

  await entityQueryHandle.create('User', {
    name: 'David',
    status: 'active'
  }, events);

  // 验证事件
  expect(events).toHaveLength(2); // User + ActiveUser
  
  const userEvent = events.find(e => e.recordName === 'User');
  expect(userEvent?.type).toBe('create');
  
  const activeUserEvent = events.find(e => e.recordName === 'ActiveUser');
  expect(activeUserEvent?.type).toBe('create');
  expect(activeUserEvent?.record.name).toBe('David');
});
```

#### 更新事件

```typescript
test('filtered entity update events', async () => {
  // 创建初始记录
  const user = await entityQueryHandle.create('User', {
    name: 'Eve',
    status: 'inactive'
  });

  const updateEvents: any[] = [];
  
  // 更新状态，触发 filtered entity 事件
  await entityQueryHandle.update('User',
    MatchExp.atom({ key: 'id', value: ['=', user.id] }),
    { status: 'active' },
    updateEvents
  );

  // 验证生成了 ActiveUser create 事件
  const activeUserCreateEvent = updateEvents.find(
    e => e.recordName === 'ActiveUser' && e.type === 'create'
  );
  expect(activeUserCreateEvent).toBeDefined();

  // 再次更新，移出 filtered entity
  const removeEvents: any[] = [];
  await entityQueryHandle.update('User',
    MatchExp.atom({ key: 'id', value: ['=', user.id] }),
    { status: 'inactive' },
    removeEvents
  );

  // 验证生成了 ActiveUser delete 事件
  const activeUserDeleteEvent = removeEvents.find(
    e => e.recordName === 'ActiveUser' && e.type === 'delete'
  );
  expect(activeUserDeleteEvent).toBeDefined();
});
```

### 4. 复杂条件测试

#### 多条件组合

```typescript
test('complex filter conditions', async () => {
  // 创建复杂条件的 filtered entity
  const YoungActiveTechUser = Entity.create({
    name: 'YoungActiveTechUser',
    sourceEntity: User,
    filterCondition: MatchExp.atom({
      key: 'status',
      value: ['=', 'active']
    }).and({
      key: 'age',
      value: ['<', 30]
    }).and({
      key: 'department',
      value: ['=', 'Tech']
    })
  });

  // 测试各种组合
  const testCases = [
    { name: 'Alice', age: 25, status: 'active', department: 'Tech', expected: true },
    { name: 'Bob', age: 35, status: 'active', department: 'Tech', expected: false }, // 年龄不符
    { name: 'Charlie', age: 25, status: 'inactive', department: 'Tech', expected: false }, // 状态不符
    { name: 'David', age: 25, status: 'active', department: 'HR', expected: false }, // 部门不符
  ];

  for (const testCase of testCases) {
    await entityQueryHandle.create('User', testCase);
  }

  const results = await entityQueryHandle.find('YoungActiveTechUser', 
    undefined, 
    undefined, 
    ['name']
  );

  const matchedNames = results.map(r => r.name);
  expect(matchedNames).toEqual(['Alice']);
});
```

### 5. 边界情况测试

#### 空结果集

```typescript
test('empty filtered entity', async () => {
  // 创建一个不可能满足的条件
  const ImpossibleUser = Entity.create({
    name: 'ImpossibleUser',
    sourceEntity: User,
    filterCondition: MatchExp.atom({
      key: 'age',
      value: ['<', 0]  // 不可能的条件
    })
  });

  // 创建一些用户
  await entityQueryHandle.create('User', { name: 'Test', age: 25 });
  
  const results = await entityQueryHandle.find('ImpossibleUser');
  expect(results).toHaveLength(0);
});
```

#### 全部满足

```typescript
test('all records match filtered entity', async () => {
  // 创建总是满足的条件
  const AllUser = Entity.create({
    name: 'AllUser',
    sourceEntity: User,
    filterCondition: MatchExp.atom({
      key: 'id',
      value: ['!=', null]  // 所有记录都满足
    })
  });

  // 创建多个用户
  for (let i = 0; i < 5; i++) {
    await entityQueryHandle.create('User', { 
      name: `User${i}`, 
      age: 20 + i 
    });
  }

  const allUsers = await entityQueryHandle.find('User');
  const filteredUsers = await entityQueryHandle.find('AllUser');
  
  expect(filteredUsers).toHaveLength(allUsers.length);
});
```

### 6. 性能测试

```typescript
test('performance with many filtered entities', async () => {
  // 创建多个 filtered entities
  const filteredEntities = [];
  for (let i = 0; i < 10; i++) {
    filteredEntities.push(Entity.create({
      name: `FilteredUser${i}`,
      sourceEntity: User,
      filterCondition: MatchExp.atom({
        key: 'age',
        value: ['=', 20 + i]
      })
    }));
  }

  const startTime = Date.now();
  
  // 创建大量用户
  for (let i = 0; i < 100; i++) {
    await entityQueryHandle.create('User', {
      name: `User${i}`,
      age: 20 + (i % 10),
      status: i % 2 === 0 ? 'active' : 'inactive'
    });
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // 验证性能在可接受范围内
  expect(duration).toBeLessThan(5000); // 5秒内完成
  
  // 验证数据正确性
  for (let i = 0; i < 10; i++) {
    const users = await entityQueryHandle.find(`FilteredUser${i}`);
    expect(users).toHaveLength(10); // 每个年龄有10个用户
  }
});
```

### 7. Relation 作为源实体

```typescript
test('filtered entity based on relation', async () => {
  // 创建关系
  const Friendship = Relation.create({
    name: 'Friendship',
    source: User,
    target: User,
    properties: [
      Property.create({ name: 'status', type: 'string' }),
      Property.create({ name: 'since', type: 'date' })
    ]
  });

  // 创建 filtered relation
  const ActiveFriendship = Entity.create({
    name: 'ActiveFriendship',
    sourceEntity: Friendship,
    filterCondition: MatchExp.atom({
      key: 'status',
      value: ['=', 'active']
    })
  });

  // 创建用户和关系
  const user1 = await entityQueryHandle.create('User', { name: 'User1' });
  const user2 = await entityQueryHandle.create('User', { name: 'User2' });
  
  await entityQueryHandle.addRelationByNameById(
    'Friendship',
    user1.id,
    user2.id,
    { status: 'active', since: new Date().toISOString() }
  );

  const activeFriendships = await entityQueryHandle.find('ActiveFriendship');
  expect(activeFriendships).toHaveLength(1);
});
```

## 测试最佳实践

### 1. 使用有意义的测试数据

```typescript
// ❌ 不好
await create('User', { name: 'a', age: 1, status: 'x' });

// ✅ 好
await create('User', { 
  name: 'Alice Johnson', 
  age: 28, 
  status: 'active',
  department: 'Engineering'
});
```

### 2. 验证完整的状态变化

```typescript
test('complete state transition', async () => {
  // 1. 初始状态
  const user = await create('User', { status: 'pending' });
  let activeUsers = await find('ActiveUser');
  expect(activeUsers).toHaveLength(0);
  
  // 2. 激活用户
  await update('User', { id: user.id }, { status: 'active' });
  activeUsers = await find('ActiveUser');
  expect(activeUsers).toHaveLength(1);
  
  // 3. 停用用户
  await update('User', { id: user.id }, { status: 'inactive' });
  activeUsers = await find('ActiveUser');
  expect(activeUsers).toHaveLength(0);
});
```

### 3. 测试事件的完整性

```typescript
test('event completeness', async () => {
  const events: any[] = [];
  
  await create('User', { 
    status: 'active',
    age: 25,
    department: 'Tech'
  }, events);
  
  // 验证所有相关的 filtered entities 都生成了事件
  const eventTypes = events.map(e => `${e.recordName}:${e.type}`);
  expect(eventTypes).toContain('User:create');
  expect(eventTypes).toContain('ActiveUser:create');
  expect(eventTypes).toContain('YoungUser:create');
  expect(eventTypes).toContain('TechUser:create');
});
```

### 4. 隔离测试

```typescript
describe('filtered entity isolation', () => {
  test('each test should be independent', async () => {
    // 每个测试都应该创建自己的数据
    // 不依赖其他测试的副作用
  });
});
```

## 调试技巧

### 1. 检查标记字段

```typescript
// 直接查看 __filtered_entities 字段
const users = await entityQueryHandle.find('User', 
  undefined, 
  undefined, 
  ['id', 'name', '__filtered_entities']
);
console.log('Filtered entity flags:', users[0].__filtered_entities);
```

### 2. 跟踪事件流

```typescript
const events: any[] = [];
// ... 执行操作 ...
console.log('Generated events:', events.map(e => ({
  type: e.type,
  entity: e.recordName,
  record: e.record.id
})));
```

### 3. 验证查询转换

```typescript
// 使用日志或调试器查看查询是否正确转换
// 在 EntityQueryHandle.find 中添加日志
```

## 总结

测试 Filtered Entity 需要全面考虑：

1. **基础功能**：识别、配置、查询重定向
2. **CRUD 操作**：创建、更新、删除的正确性
3. **事件系统**：事件的生成和传播
4. **边界情况**：空集、全集、复杂条件
5. **性能影响**：大量数据和多个 filtered entities
6. **集成测试**：与其他系统组件的协作

通过完善的测试，可以确保 Filtered Entity 功能的正确性和可靠性。 