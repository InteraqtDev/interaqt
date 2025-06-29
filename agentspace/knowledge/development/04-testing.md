# 第四章：测试指南

本章介绍如何为 interaqt 框架编写全面的测试用例，包括单元测试、集成测试和端到端测试的最佳实践。

## 4.1 测试环境设置

### 4.1.1 测试框架配置

框架使用 Vitest 作为测试运行器.

### 4.1.2 测试环境初始化

`scripts/vitest.setup.js` 文件设置全局环境：

```javascript
import crypto from 'node:crypto';
if (globalThis && !globalThis.crypto) {
    globalThis.crypto = crypto;
}
```

### 4.1.3 测试脚本

在 `package.json` 中定义了不同层次的测试脚本：

```json
{
  "scripts": {
    "test": "vitest run",
    "test-runtime": "vitest run tests/runtime",
    "test-storage": "vitest run tests/storage", 
    "test-shared": "vitest run tests/shared"
  }
}
```

## 4.2 测试目录结构

测试文件按照源码结构组织：

```
tests/
├── runtime/           # 运行时层测试
│   ├── data/         # 测试数据
│   ├── *.spec.ts     # 各种计算和活动测试
│   └── WritingComputationTests.md
├── storage/          # 存储层测试
│   ├── data/         # 测试数据
│   └── *.spec.ts     # 数据库操作测试
└── shared/           # 共享模块测试
    └── *.spec.ts     # 类型和工具测试
```

## 4.3 基础测试模式

### 4.3.1 标准测试结构

每个测试文件遵循标准结构：

```typescript
import { describe, expect, test, beforeEach } from "vitest";
import { 
    Controller, 
    Entity, 
    MonoSystem, 
    Property, 
    // ... 其他必要的导入
} from '@';

describe('Feature Name', () => {
    let system: MonoSystem;
    let controller: Controller;
    
    beforeEach(async () => {
        // 设置测试环境
        system = new MonoSystem();
        // 配置实体、关系等
        controller = new Controller(system, entities, relations, [], [], [], []);
        await controller.setup(true);
    });
    
    test('should perform expected behavior', async () => {
        // 测试实现
    });
});
```

### 4.3.2 测试数据管理

使用专门的数据文件组织测试数据：

```typescript
// tests/runtime/data/common.ts
export function createCommonData() {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({name: 'username', type: 'string'}),
            Property.create({name: 'email', type: 'string'})
        ]
    });
    
    const entities = [userEntity];
    const relations = [];
    
    return { entities, relations };
}
```

## 4.4 运行时层测试

### 4.4.1 响应式计算测试

#### Count 计算测试示例

```typescript
import { describe, expect, test } from "vitest";
import { MatchExp, Controller, Dictionary, Entity, MonoSystem, Property, Count } from '@';

describe('Count computed handle', () => {
    test('should calculate global count correctly', async () => {
        // 1. 创建实体
        const productEntity = Entity.create({
            name: 'Product',
            properties: [
                Property.create({name: 'name', type: 'string'}),
                Property.create({name: 'price', type: 'number'})
            ]
        });
        
        // 2. 创建全局计算
        const dictionary = [
            Dictionary.create({
                name: 'productCount',
                type: 'number',
                collection: false,
                computedData: Count.create({
                    record: productEntity
                })
            })
        ];
        
        // 3. 初始化系统
        const system = new MonoSystem();
        const controller = new Controller(system, [productEntity], [], [], [], dictionary, []);
        await controller.setup(true);
        
        // 4. 验证初始状态
        const initialCount = await system.storage.get('state', 'productCount');
        expect(initialCount).toBe(0);
        
        // 5. 创建数据并验证计算
        await system.storage.create('Product', {name: 'Product 1', price: 10});
        await system.storage.create('Product', {name: 'Product 2', price: 20});
        
        const count1 = await system.storage.get('state', 'productCount');
        expect(count1).toBe(2);
        
        // 6. 删除数据并验证增量计算
        const products = await system.storage.find('Product', MatchExp.atom({key: 'name', value: ['=', 'Product 2']}));
        await system.storage.delete('Product', MatchExp.atom({key: 'id', value: ['=', products[0].id]}));
        
        const count2 = await system.storage.get('state', 'productCount');
        expect(count2).toBe(1);
    });
});
```

#### 属性计算测试

```typescript
test('should calculate property count correctly', async () => {
    // 1. 创建实体和关系
    const userEntity = Entity.create({
        name: 'User',
        properties: [Property.create({name: 'username', type: 'string'})]
    });
    
    const taskEntity = Entity.create({
        name: 'Task',
        properties: [Property.create({name: 'title', type: 'string'})]
    });
    
    const ownsTaskRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'tasks',
        target: taskEntity,
        targetProperty: 'owner',
        type: 'n:1'
    });
    
    // 2. 添加计算属性
    userEntity.properties.push(
        Property.create({
            name: 'taskCount',
            type: 'number',
            defaultValue: () => 0,
            computedData: Count.create({
                record: ownsTaskRelation
            })
        })
    );
    
    // 3. 初始化系统
    const system = new MonoSystem();
    const controller = new Controller(system, [userEntity, taskEntity], [ownsTaskRelation], [], [], [], []);
    await controller.setup(true);
    
    // 4. 测试计算逻辑
    const user = await system.storage.create('User', {username: 'testuser'});
    
    // 初始任务数为0
    const user1 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), {}, ['*']);
    expect(user1.taskCount).toBe(0);
    
    // 创建任务后计数增加
    await system.storage.create('Task', {title: 'Task 1', owner: user});
    await system.storage.create('Task', {title: 'Task 2', owner: user});
    
    const user2 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), {}, ['*']);
    expect(user2.taskCount).toBe(2);
});
```

### 4.4.2 异步计算测试

```typescript
import { ComputedDataHandle, DataBasedComputation, ComputationResult } from '@';

// 1. 定义异步计算类
const TestCrawlerComputed = createClass({
    name: 'TestCrawlerComputed',
    public: {
        source: {
            type: 'string',
            required: true
        }
    }
});

// 2. 实现异步计算逻辑
class TestCrawlerComputation implements DataBasedComputation {
    state = {}
    dataDeps: {[key: string]: DataDep} = {}
    
    constructor(public controller: Controller, public args: KlassInstance<typeof TestCrawlerComputed>, public dataContext: PropertyDataContext) {
        this.dataDeps = {
            _current: {
                type: 'property'
            }
        }
    }
    
    async compute({_current}: {_current:any}) {
        if (_current.url === 'https://www.interaqt.dev') {
            return ComputationResult.resolved('reactive backend framework', {type: 'preset'})
        }
        return ComputationResult.async({type: 'random'})
    }
    
    async asyncReturn(result: any, args: any) {
        return `${result}_crawled_by_${args.type}`
    }
}

// 3. 注册计算处理器
ComputedDataHandle.Handles.set(TestCrawlerComputed, {
    property: TestCrawlerComputation
});

// 4. 测试异步计算
describe('async computed', () => {
    test('test basic async computed', async () => {
        const URLEntity = Entity.create({
            name: 'URL',
            properties: [
                Property.create({name: 'url', type: 'string'}),
                Property.create({
                    name: 'content', 
                    type: 'string',
                    computedData: TestCrawlerComputed.create({ source: 'url'})
                }),
            ]
        });

        const system = new MonoSystem();
        const controller = new Controller(system, [URLEntity], [], [], [], [], []);
        await controller.setup(true);
        
        // 获取异步计算任务
        const crawlerComputation = Array.from(controller.scheduler.computations.values()).find(
            computation => computation.dataContext.type === 'property' && computation.dataContext.host === URLEntity && computation.dataContext.id === 'content'
        )! as DataBasedComputation;
        const crawlerTaskRecordName = controller.scheduler.getAsyncTaskRecordKey(crawlerComputation);

        // 创建数据触发异步任务
        const url = await system.storage.create('URL', {url: 'https://not.exist.com'});
        
        // 验证异步任务被创建
        const crawlerTaskRecords = await system.storage.find(crawlerTaskRecordName);
        expect(crawlerTaskRecords.length).toBe(1);
        
        // 模拟异步任务完成
        const randomResult = Math.random().toString();
        await system.storage.update(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {result: randomResult, status: 'success'});

        // 处理异步返回
        const updatedCrawlerTaskRecord = await system.storage.findOne(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*']);
        await controller.scheduler.handleAsyncReturn(crawlerComputation, updatedCrawlerTaskRecord);
        
        // 验证计算结果
        const entity = await system.storage.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*']);
        expect(entity.content).toBe(`${randomResult}_crawled_by_random`);
    });
});
```

### 4.4.3 活动流程测试

```typescript
import { ActivityCall, Controller } from '@';

describe("activity state", () => {
    let createFriendRelationActivityCall: ActivityCall;
    let system: MonoSystem;
    let controller: Controller;
    let userA: EntityIdRef;
    let userB: EntityIdRef;

    beforeEach(async () => {
        // 从测试数据创建活动定义
        const { entities, relations, interactions, activities } = createData();
        
        system = new MonoSystem();
        controller = new Controller(system, entities, relations, activities, interactions, [], []);
        await controller.setup(true);

        // 创建活动调用实例
        const mainActivity = activities.find(a => a.name === 'createFriendRelation')!;
        createFriendRelationActivityCall = new ActivityCall(mainActivity, controller);

        // 创建测试用户
        userA = await controller.system.storage.create('User', { id: "a", roles: ['user']});
        userB = await controller.system.storage.create('User', { id: "b", roles: ['user']});
    });

    test("call friend request activity with approve response", async () => {
        let activityId;
        
        // 1. 测试交互顺序错误
        const res1 = await controller.callActivityInteraction('createFriendRelation', 'approve', activityId, {user: userA});
        expect(res1.error).toBeDefined();

        // 2. 正确发起请求
        const res2 = await controller.callActivityInteraction('createFriendRelation', 'sendRequest', activityId, {user: userA, payload: {to: userB}});
        expect(res2.error).toBeUndefined();
        activityId = res2.context!.activityId;

        // 3. 测试重复操作错误
        const res3 = await controller.callActivityInteraction('createFriendRelation', 'sendRequest', activityId, {user: userA});
        expect(res3.error).toBeDefined();

        // 4. 测试角色权限错误
        const res4 = await controller.callActivityInteraction('createFriendRelation', 'approve', activityId, {user: userA});
        expect(res4.error).toBeDefined();

        // 5. 正确批准请求
        const res5 = await controller.callActivityInteraction('createFriendRelation', 'approve', activityId, {user: userB});
        expect(res5.error).toBeUndefined();
        
        // 6. 验证关系创建
        const relations = await controller.system.storage.findRelationByName(friendRelation.name, undefined, undefined, ['*', ['source', {attributeQuery: ['*']}], ['target', {attributeQuery: ['*']}]]);
        expect(relations.length).toBe(1);
        expect(relations[0].source.id).toBe(userA.id);
        expect(relations[0].target.id).toBe(userB.id);

        // 7. 验证活动完成状态
        const currentState = await createFriendRelationActivityCall.getState(activityId);
        expect(currentState.current).toBeUndefined();
    });
});
```

## 4.5 存储层测试

### 4.5.1 数据库设置测试

```typescript
import { DBSetup, RecordQueryAgent, EntityToTableMap } from "@storage";
import { SQLiteDB } from '@/SQLite.js';

describe("db setup", () => {    
    test('validate 1:1 relation map', async () => {
        const db = new SQLiteDB();
        await db.open();
        
        const { entities, relations } = createCommonData();
        const clues = ['Profile.owner'];
        const setup = new DBSetup(entities, relations, db, clues);
        
        // 验证表映射关系
        expect(setup.map.records.User).toBeDefined();
        expect(setup.map.records.Profile).toBeDefined();
        expect(setup.map.records.User.table).toBe(setup.map.records.Profile.table);
        
        // 验证属性映射
        expect(setup.map.records.User.attributes.profile).toMatchObject({
            type: 'id',
            isRecord: true,
            relType: ['1', '1'],
            recordName: 'Profile',
            linkName: 'Profile_owner_profile_User',
            isSource: false,
        });
    });
});
```

### 4.5.2 查询测试

```typescript
describe('entity query', () => {
    test('should handle complex queries correctly', async () => {
        const system = new MonoSystem();
        await system.setup();
        
        // 创建测试数据
        const user1 = await system.storage.create('User', {name: 'Alice', age: 25});
        const user2 = await system.storage.create('User', {name: 'Bob', age: 30});
        
        // 测试简单查询
        const users = await system.storage.find('User', MatchExp.atom({key: 'age', value: ['>', 20]}));
        expect(users.length).toBe(2);
        
        // 测试复合查询
        const complexQuery = MatchExp.atom({key: 'age', value: ['>', 20]})
            .and(MatchExp.atom({key: 'name', value: ['=', 'Alice']}));
        const filteredUsers = await system.storage.find('User', complexQuery);
        expect(filteredUsers.length).toBe(1);
        expect(filteredUsers[0].name).toBe('Alice');
    });
});
```

### 4.5.3 关系操作测试

```typescript
describe('relation operations', () => {
    test('should handle 1:n relations correctly', async () => {
        const system = new MonoSystem();
        await system.setup();
        
        // 创建实体
        const user = await system.storage.create('User', {name: 'Alice'});
        const post1 = await system.storage.create('Post', {title: 'Post 1', author: user});
        const post2 = await system.storage.create('Post', {title: 'Post 2', author: user});
        
        // 验证关系查询
        const userWithPosts = await system.storage.findOne('User', 
            MatchExp.atom({key: 'id', value: ['=', user.id]}), 
            {}, 
            ['*', ['posts', {attributeQuery: ['*']}]]
        );
        
        expect(userWithPosts.posts.length).toBe(2);
        expect(userWithPosts.posts.map(p => p.title)).toContain('Post 1');
        expect(userWithPosts.posts.map(p => p.title)).toContain('Post 2');
    });
});
```

## 4.6 共享模块测试

### 4.6.1 类型系统测试

```typescript
import { assertType, describe, test } from "vitest";
import { createClass, Klass, KlassInstance, Entity, Property } from "@shared";

describe("createClass types", () => {
    test('should validate type correctness', () => {
        const TestClass = createClass({
            name: 'TestClass',
            public: {
                name: {type: 'string', required: true},
                count: {type: 'number', required: false}
            }
        });
        
        const instance = TestClass.create({name: 'test'});
        
        // TypeScript 类型验证
        assertType<string>(instance.name);
        assertType<number | undefined>(instance.count);
        assertType<string>(instance.uuid);
    });
    
    test('should handle complex type relationships', () => {
        const WeightedSummation = createClass({
            name: 'WeightedSummation',
            public: {
                records: {
                    type: [Entity, Relation],
                    collection: true,
                    required: true,
                },
            }
        });

        assertType<KlassInstance<any>[]>({} as unknown as KlassInstance<typeof WeightedSummation>["records"]);
    });
});
```

### 4.6.2 工具函数测试

```typescript
describe('utility functions', () => {
    test('should stringify and parse instances correctly', () => {
        const TestClass = createClass({
            name: 'TestClass',
            public: {
                name: {type: 'string', required: true}
            }
        });
        
        const instance = TestClass.create({name: 'test'});
        const stringified = TestClass.stringify(instance);
        const parsed = JSON.parse(stringified);
        
        expect(parsed.type).toBe('TestClass');
        expect(parsed.public.name).toBe('test');
        expect(parsed.uuid).toBe(instance.uuid);
    });
});
```

## 4.7 测试最佳实践

### 4.7.1 测试隔离

```typescript
describe('isolated tests', () => {
    let system: MonoSystem;
    
    beforeEach(async () => {
        // 每个测试都使用全新的系统实例
        system = new MonoSystem();
        await system.setup(true);
    });
    
    afterEach(async () => {
        // 清理资源
        if (system) {
            await system.destroy();
        }
    });
});
```

### 4.7.2 边界条件测试

```typescript
describe('boundary conditions', () => {
    test('should handle zero values correctly', async () => {
        // 测试零值情况
        await system.storage.create('Product', {price: 0, quantity: 5});
        const value = await system.storage.get('state', 'totalValue');
        expect(value).toBe(0);
    });
    
    test('should handle negative values correctly', async () => {
        // 测试负值情况
        await system.storage.create('Account', {amount: 100, factor: 1});
        await system.storage.create('Account', {amount: 50, factor: -1});
        
        const netBalance = await system.storage.get('state', 'netBalance');
        expect(netBalance).toBe(50);
    });
    
    test('should handle empty collections', async () => {
        // 测试空集合情况
        const user = await system.storage.create('User', {name: 'test'});
        const userWithTasks = await system.storage.findOne('User', 
            MatchExp.atom({key: 'id', value: ['=', user.id]}), 
            {}, 
            ['*']
        );
        expect(userWithTasks.taskCount).toBe(0);
    });
});
```

### 4.7.3 错误处理测试

```typescript
describe('error handling', () => {
    test('should handle invalid data gracefully', async () => {
        // 测试无效数据处理
        await expect(
            system.storage.create('User', {age: 'invalid'})
        ).rejects.toThrow();
    });
    
    test('should handle permission errors', async () => {
        // 测试权限错误
        const result = await controller.callActivityInteraction(
            activityUUID, 
            approveUUID, 
            activityId, 
            {user: unauthorizedUser}
        );
        expect(result.error).toBeDefined();
    });
});
```

### 4.7.4 性能测试

```typescript
describe('performance tests', () => {
    test('should handle large datasets efficiently', async () => {
        const startTime = Date.now();
        
        // 创建大量数据
        const promises = Array.from({length: 1000}, (_, i) => 
            system.storage.create('Product', {name: `Product ${i}`, price: i * 10})
        );
        await Promise.all(promises);
        
        // 验证计算性能
        const count = await system.storage.get('state', 'productCount');
        expect(count).toBe(1000);
        
        const endTime = Date.now();
        expect(endTime - startTime).toBeLessThan(5000); // 5秒内完成
    });
});
```

## 4.8 持续集成

### 4.8.1 测试覆盖率

使用 Vitest 的覆盖率功能：

```bash
# 运行带覆盖率的测试
vitest run --coverage

# 生成覆盖率报告
vitest run --coverage --reporter=html
```

### 4.8.2 测试分类

根据测试类型和执行时间分类：

```bash
# 快速单元测试
npm run test-shared

# 中等速度的存储测试
npm run test-storage

# 较慢的运行时集成测试
npm run test-runtime

# 完整测试套件
npm run test
```

### 4.8.3 测试数据管理

为不同测试场景创建专门的测试数据：

```typescript
// tests/fixtures/entities.ts
export const createTestEntities = () => ({
    userEntity: Entity.create({...}),
    productEntity: Entity.create({...}),
    // ... 其他实体
});

// tests/fixtures/scenarios.ts
export const createECommerceScenario = () => ({
    entities: [...],
    relations: [...],
    interactions: [...],
    activities: [...]
});
```

通过遵循这些测试指南和最佳实践，可以确保 interaqt 框架的代码质量和稳定性，同时为新功能的开发提供可靠的测试基础。 