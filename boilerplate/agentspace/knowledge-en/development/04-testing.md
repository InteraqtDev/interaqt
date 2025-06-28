# Chapter 4: Testing Guide

This chapter introduces how to write comprehensive test cases for the @interaqt/runtime framework, including best practices for unit testing, integration testing, and end-to-end testing.

## 4.1 Test Environment Setup

### 4.1.1 Test Framework Configuration

The framework uses Vitest as the test runner, with configuration in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
    test: {
        setupFiles: './scripts/vitest.setup.js'
    },
    plugins: [
        tsconfigPaths({
            root: path.resolve(__dirname, './')
        })
    ],
    resolve: {
        alias: {
            '@/SQLite.js': path.resolve(__dirname, './src/runtime/SQLite.ts'),
            '@runtime': path.resolve(__dirname, './src/runtime/index.ts'),
            '@shared': path.resolve(__dirname, './src/shared/index.ts'),
            '@storage': path.resolve(__dirname, './src/storage/index.ts'),
            '@': path.resolve(__dirname, './src'),
        }
    }
})
```

### 4.1.2 Test Environment Initialization

The `scripts/vitest.setup.js` file sets up the global environment:

```javascript
import crypto from 'node:crypto';
if (globalThis && !globalThis.crypto) {
    globalThis.crypto = crypto;
}
```

### 4.1.3 Test Scripts

Different levels of test scripts are defined in `package.json`:

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

## 4.2 Test Directory Structure

Test files are organized according to the source code structure:

```
tests/
├── runtime/           # Runtime layer tests
│   ├── data/         # Test data
│   ├── *.spec.ts     # Various computation and activity tests
│   └── WritingComputationTests.md
├── storage/          # Storage layer tests
│   ├── data/         # Test data
│   └── *.spec.ts     # Database operation tests
└── shared/           # Shared module tests
    └── *.spec.ts     # Type and utility tests
```

## 4.3 Basic Test Patterns

### 4.3.1 Standard Test Structure

Each test file follows a standard structure:

```typescript
import { describe, expect, test, beforeEach } from "vitest";
import { 
    Controller, 
    Entity, 
    MonoSystem, 
    Property, 
    // ... other necessary imports
} from '@';

describe('Feature Name', () => {
    let system: MonoSystem;
    let controller: Controller;
    
    beforeEach(async () => {
        // Setup test environment
        system = new MonoSystem();
        // Configure entities, relations, etc.
        controller = new Controller(system, entities, relations, [], [], [], []);
        await controller.setup(true);
    });
    
    test('should perform expected behavior', async () => {
        // Test implementation
    });
});
```

### 4.3.2 Test Data Management

Use dedicated data files to organize test data:

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

## 4.4 Runtime Layer Testing

### 4.4.1 Reactive Computation Testing

#### Count Computation Test Example

```typescript
import { describe, expect, test } from "vitest";
import { MatchExp, Controller, Dictionary, Entity, MonoSystem, Property, Count } from '@';

describe('Count computed handle', () => {
    test('should calculate global count correctly', async () => {
        // 1. Create entity
        const productEntity = Entity.create({
            name: 'Product',
            properties: [
                Property.create({name: 'name', type: 'string'}),
                Property.create({name: 'price', type: 'number'})
            ]
        });
        
        // 2. Create global computation
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
        
        // 3. Initialize system
        const system = new MonoSystem();
        const controller = new Controller(system, [productEntity], [], [], [], dictionary, []);
        await controller.setup(true);
        
        // 4. Verify initial state
        const initialCount = await system.storage.get('state', 'productCount');
        expect(initialCount).toBe(0);
        
        // 5. Create data and verify computation
        await system.storage.create('Product', {name: 'Product 1', price: 10});
        await system.storage.create('Product', {name: 'Product 2', price: 20});
        
        const count1 = await system.storage.get('state', 'productCount');
        expect(count1).toBe(2);
        
        // 6. Delete data and verify incremental computation
        const products = await system.storage.find('Product', MatchExp.atom({key: 'name', value: ['=', 'Product 2']}));
        await system.storage.delete('Product', MatchExp.atom({key: 'id', value: ['=', products[0].id]}));
        
        const count2 = await system.storage.get('state', 'productCount');
        expect(count2).toBe(1);
    });
});
```

#### Property Computation Testing

```typescript
test('should calculate property count correctly', async () => {
    // 1. Create entities and relations
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
    
    // 2. Add computed property
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
    
    // 3. Initialize system
    const system = new MonoSystem();
    const controller = new Controller(system, [userEntity, taskEntity], [ownsTaskRelation], [], [], [], []);
    await controller.setup(true);
    
    // 4. Test computation logic
    const user = await system.storage.create('User', {username: 'testuser'});
    
    // Initial task count is 0
    const user1 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), {}, ['*']);
    expect(user1.taskCount).toBe(0);
    
    // Count increases after creating tasks
    await system.storage.create('Task', {title: 'Task 1', owner: user});
    await system.storage.create('Task', {title: 'Task 2', owner: user});
    
    const user2 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), {}, ['*']);
    expect(user2.taskCount).toBe(2);
});
```

### 4.4.2 Asynchronous Computation Testing

```typescript
import { ComputedDataHandle, DataBasedComputation, ComputationResult } from '@';

// 1. Define async computation class
const TestCrawlerComputed = createClass({
    name: 'TestCrawlerComputed',
    public: {
        source: {
            type: 'string',
            required: true
        }
    }
});

// 2. Implement async computation logic
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

// 3. Register computation handler
ComputedDataHandle.Handles.set(TestCrawlerComputed, {
    property: TestCrawlerComputation
});

// 4. Test async computation
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
        
        // Get async computation task
        const crawlerComputation = Array.from(controller.scheduler.computations.values()).find(
            computation => computation.dataContext.type === 'property' && computation.dataContext.host === URLEntity && computation.dataContext.id === 'content'
        )! as DataBasedComputation;
        const crawlerTaskRecordName = controller.scheduler.getAsyncTaskRecordKey(crawlerComputation);

        // Create data to trigger async task
        const url = await system.storage.create('URL', {url: 'https://not.exist.com'});
        
        // Verify async task was created
        const crawlerTaskRecords = await system.storage.find(crawlerTaskRecordName);
        expect(crawlerTaskRecords.length).toBe(1);
        
        // Simulate async task completion
        const randomResult = Math.random().toString();
        await system.storage.update(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {result: randomResult, status: 'success'});

        // Handle async return
        const updatedCrawlerTaskRecord = await system.storage.findOne(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*']);
        await controller.scheduler.handleAsyncReturn(crawlerComputation, updatedCrawlerTaskRecord);
        
        // Verify computation result
        const entity = await system.storage.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*']);
        expect(entity.content).toBe(`${randomResult}_crawled_by_random`);
    });
});
```

### 4.4.3 Activity Flow Testing

```typescript
import { ActivityCall, Controller } from '@';

describe("activity state", () => {
    let createFriendRelationActivityCall: ActivityCall;
    let system: MonoSystem;
    let controller: Controller;
    let userA: EntityIdRef;
    let userB: EntityIdRef;

    beforeEach(async () => {
        // Create activity definition from test data
        const { entities, relations, interactions, activities } = createData();
        
        system = new MonoSystem();
        controller = new Controller(system, entities, relations, activities, interactions, [], []);
        await controller.setup(true);

        // Create activity call instance
        const mainActivity = activities.find(a => a.name === 'createFriendRelation')!;
        createFriendRelationActivityCall = new ActivityCall(mainActivity, controller);

        // Create test users
        userA = await controller.system.storage.create('User', { id: "a", roles: ['user']});
        userB = await controller.system.storage.create('User', { id: "b", roles: ['user']});
    });

    test("call friend request activity with approve response", async () => {
        let activityId;
        
        // 1. Test interaction order error
        const res1 = await controller.callActivityInteraction(activityUUID, approveUUID, activityId, {user: userA});
        expect(res1.error).toBeDefined();

        // 2. Correctly initiate request
        const res2 = await controller.callActivityInteraction(activityUUID, sendRequestUUID, activityId, {user: userA, payload: {to: userB}});
        expect(res2.error).toBeUndefined();
        activityId = res2.context!.activityId;

        // 3. Test duplicate operation error
        const res3 = await controller.callActivityInteraction(activityUUID, sendRequestUUID, activityId, {user: userA});
        expect(res3.error).toBeDefined();

        // 4. Test role permission error
        const res4 = await controller.callActivityInteraction(activityUUID, approveUUID, activityId, {user: userA});
        expect(res4.error).toBeDefined();

        // 5. Correctly approve request
        const res5 = await controller.callActivityInteraction(activityUUID, approveUUID, activityId, {user: userB});
        expect(res5.error).toBeUndefined();
        
        // 6. Verify relation creation
        const relations = await controller.system.storage.findRelationByName(friendRelation.name, undefined, undefined, ['*', ['source', {attributeQuery: ['*']}], ['target', {attributeQuery: ['*']}]]);
        expect(relations.length).toBe(1);
        expect(relations[0].source.id).toBe(userA.id);
        expect(relations[0].target.id).toBe(userB.id);

        // 7. Verify activity completion state
        const currentState = await createFriendRelationActivityCall.getState(activityId);
        expect(currentState.current).toBeUndefined();
    });
});
```

## 4.5 Storage Layer Testing

### 4.5.1 Database Setup Testing

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
        
        // Verify table mapping relationships
        expect(setup.map.records.User).toBeDefined();
        expect(setup.map.records.Profile).toBeDefined();
        expect(setup.map.records.User.table).toBe(setup.map.records.Profile.table);
        
        // Verify attribute mapping
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

### 4.5.2 Query Testing

```typescript
describe('entity query', () => {
    test('should handle complex queries correctly', async () => {
        const system = new MonoSystem();
        await system.setup();
        
        // Create test data
        const user1 = await system.storage.create('User', {name: 'Alice', age: 25});
        const user2 = await system.storage.create('User', {name: 'Bob', age: 30});
        
        // Test simple query
        const users = await system.storage.find('User', MatchExp.atom({key: 'age', value: ['>', 20]}));
        expect(users.length).toBe(2);
        
        // Test complex query
        const complexQuery = MatchExp.atom({key: 'age', value: ['>', 20]})
            .and(MatchExp.atom({key: 'name', value: ['=', 'Alice']}));
        const filteredUsers = await system.storage.find('User', complexQuery);
        expect(filteredUsers.length).toBe(1);
        expect(filteredUsers[0].name).toBe('Alice');
    });
});
```

### 4.5.3 Relation Operation Testing

```typescript
describe('relation operations', () => {
    test('should handle 1:n relations correctly', async () => {
        const system = new MonoSystem();
        await system.setup();
        
        // Create entities
        const user = await system.storage.create('User', {name: 'Alice'});
        const post1 = await system.storage.create('Post', {title: 'Post 1', author: user});
        const post2 = await system.storage.create('Post', {title: 'Post 2', author: user});
        
        // Verify relation query
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

## 4.6 Shared Module Testing

### 4.6.1 Type System Testing

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
        
        // TypeScript type validation
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

### 4.6.2 Utility Function Testing

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

## 4.7 Testing Best Practices

### 4.7.1 Test Isolation

```typescript
describe('isolated tests', () => {
    let system: MonoSystem;
    
    beforeEach(async () => {
        // Each test uses a fresh system instance
        system = new MonoSystem();
        await system.setup(true);
    });
    
    afterEach(async () => {
        // Clean up resources
        if (system) {
            await system.destroy();
        }
    });
});
```

### 4.7.2 Boundary Condition Testing

```typescript
describe('boundary conditions', () => {
    test('should handle zero values correctly', async () => {
        // Test zero value scenarios
        await system.storage.create('Product', {price: 0, quantity: 5});
        const value = await system.storage.get('state', 'totalValue');
        expect(value).toBe(0);
    });
    
    test('should handle negative values correctly', async () => {
        // Test negative value scenarios
        await system.storage.create('Account', {amount: 100, factor: 1});
        await system.storage.create('Account', {amount: 50, factor: -1});
        
        const netBalance = await system.storage.get('state', 'netBalance');
        expect(netBalance).toBe(50);
    });
    
    test('should handle empty collections', async () => {
        // Test empty collection scenarios
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

### 4.7.3 Error Handling Testing

```typescript
describe('error handling', () => {
    test('should handle invalid data gracefully', async () => {
        // Test invalid data handling
        await expect(
            system.storage.create('User', {age: 'invalid'})
        ).rejects.toThrow();
    });
    
    test('should handle permission errors', async () => {
        // Test permission errors
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

### 4.7.4 Performance Testing

```typescript
describe('performance tests', () => {
    test('should handle large datasets efficiently', async () => {
        const startTime = Date.now();
        
        // Create large amount of data
        const promises = Array.from({length: 1000}, (_, i) => 
            system.storage.create('Product', {name: `Product ${i}`, price: i * 10})
        );
        await Promise.all(promises);
        
        // Verify computation performance
        const count = await system.storage.get('state', 'productCount');
        expect(count).toBe(1000);
        
        const endTime = Date.now();
        expect(endTime - startTime).toBeLessThan(5000); // Complete within 5 seconds
    });
});
```

## 4.8 Continuous Integration

### 4.8.1 Test Coverage

Use Vitest's coverage feature:

```bash
# Run tests with coverage
vitest run --coverage

# Generate coverage report
vitest run --coverage --reporter=html
```

### 4.8.2 Test Classification

Classify by test type and execution time:

```bash
# Quick unit tests
npm run test-shared

# Medium-speed storage tests
npm run test-storage

# Slower runtime integration tests
npm run test-runtime

# Complete test suite
npm run test
```

### 4.8.3 Test Data Management

Create dedicated test data for different test scenarios:

```typescript
// tests/fixtures/entities.ts
export const createTestEntities = () => ({
    userEntity: Entity.create({...}),
    productEntity: Entity.create({...}),
    // ... other entities
});

// tests/fixtures/scenarios.ts
export const createECommerceScenario = () => ({
    entities: [...],
    relations: [...],
    interactions: [...],
    activities: [...]
});
```

By following these testing guidelines and best practices, you can ensure code quality and stability of the @interaqt/runtime framework while providing a reliable testing foundation for new feature development. 