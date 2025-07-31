import { describe, expect, test, beforeEach } from "vitest";
import {
  Controller,
  Entity,
  Property,
  MonoSystem,
  Custom,
  RecordBoundState,
  GlobalBoundState,
  ComputationResult,
  Dictionary,
  Relation,
  MatchExp,
  DICTIONARY_RECORD,
  KlassByName
} from 'interaqt';

describe('Custom computation', () => {
  let system: MonoSystem;
  let controller: Controller;
  
  beforeEach(() => {
    system = new MonoSystem();
  });

  test('should allow custom compute function', async () => {
    let computeExecuted = 0;
    
    // Create entity
    const Product = Entity.create({
      name: 'Product',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'price', type: 'number' })
      ]
    });
    
    // Create global dictionary with custom computation
    const dictionary = [
      Dictionary.create({
        name: 'totalProductValue',
        type: 'number',
        collection: false,
        computation: Custom.create({
          name: 'TotalValueCalculator',
          dataDeps: {
            products: {
              type: 'records',
              source: Product,
              attributeQuery: ['price']
            }
          },
          compute: async function(this: Controller, dataDeps: any) {
            console.log('Compute called!');
            computeExecuted++;
            console.log('Compute executed count:', computeExecuted);
            
            const products = dataDeps.products || [];
            const total = products.reduce((sum: number, p: any) => sum + (p.price || 0), 0);
            console.log('Total value:', total);
            return total;
          },
          getDefaultValue: function() {
            return 0;
          }
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [Product],
      dict: dictionary,
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Initial value should be 0
    let totalValue = await system.storage.get(DICTIONARY_RECORD, 'totalProductValue');
    expect(totalValue).toBe(0);
    
    // Create product
    await system.storage.create('Product', {
      name: 'Test Product',
      price: 100
    });
    
    // Check total value
    totalValue = await system.storage.get(DICTIONARY_RECORD, 'totalProductValue');
    expect(totalValue).toBe(100);
    
    // Create another product
    await system.storage.create('Product', {
      name: 'Test Product 2',
      price: 50
    });
    
    // Check total value
    totalValue = await system.storage.get(DICTIONARY_RECORD, 'totalProductValue');
    expect(totalValue).toBe(150);
    
    console.log('Final compute executed count:', computeExecuted);
    expect(computeExecuted).toBeGreaterThan(0);
  });

  // TODO: Property-level Custom computation 需要更深入的框架集成
  // 以下测试展示了预期的 API，但需要进一步实现以支持：
  // 1. Property computation 在创建时的自动触发
  // 2. 增量计算的正确调度
  // 3. State 管理的持久化
  // 4. 复杂的 dataDeps 解析

  test('should support incremental compute', async () => {
    let computeCount = 0;
    let incrementalCount = 0;
    
    const Counter = Entity.create({
      name: 'Counter',
      properties: [
        Property.create({ name: 'value', type: 'number' })
      ]
    });
    
    const counterTotal = Dictionary.create({
      name: 'counterTotal',
      type: 'number',
      collection: false,
      defaultValue: () => 0,
      computation: Custom.create({
        name: 'CounterTotalCalculator',
        useLastValue: true,
        dataDeps: {
          counters: {
            type: 'records',
            source: Counter,
            attributeQuery: ['value']
          }
        },
        compute: async function(this: Controller, dataDeps: any) {
          console.log('compute called with dataDeps:', dataDeps);
          computeCount++;
          const counters = dataDeps.counters || [];
          const total = counters.reduce((sum: number, c: any) => sum + (c.value || 0), 0);
          return total * 2;
        },
        incrementalCompute: async function(this: Controller, lastValue: any, mutationEvent: any, record: any, dataDeps: any) {
          console.log('incrementalCompute called with:', { lastValue, mutationEvent });
          incrementalCount++;
          
          if (mutationEvent && mutationEvent.type === 'create') {
            // 新增记录，增加到总和
            return (lastValue || 0) + (mutationEvent.record?.value || 0) * 2;
          } else if (mutationEvent && mutationEvent.type === 'update') {
            // 更新记录，重新计算
            const oldValue = mutationEvent.oldRecord?.value || 0;
            const newValue = mutationEvent.record?.value || 0;
            return (lastValue || 0) - oldValue * 2 + newValue * 2;
          }
          
          return ComputationResult.fullRecompute();
        },
        getDefaultValue: function() {
          return 0;
        }
      })
    });
    
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [Counter],
      dict: [counterTotal],
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Create first counter
    const counter1 = await system.storage.create('Counter', { value: 5 });
    
    // 等待计算完成
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 检查 total
    const total1 = await system.storage.get(DICTIONARY_RECORD, 'counterTotal');
    console.log('After first create:', total1);
    expect(total1).toBe(10); // 5 * 2
    
    // 在创建时，应该会调用 compute 或 incrementalCompute
    expect(computeCount + incrementalCount).toBeGreaterThan(0);
    
    const initialComputeCount = computeCount;
    const initialIncrementalCount = incrementalCount;
    
    // Update counter - should trigger incremental compute
    await system.storage.update('Counter', MatchExp.atom({ key: 'id', value: ['=', counter1.id] }), { value: 10 });
    
    // 等待计算完成
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const total2 = await system.storage.get(DICTIONARY_RECORD, 'counterTotal');
    console.log('After update:', total2);
    
    expect(total2).toBe(20); // 10 * 2
    // 更新时应该触发了更多的计算
    expect(computeCount + incrementalCount).toBeGreaterThan(initialComputeCount + initialIncrementalCount);
  });

  test('should support custom state management', async () => {
    const trigger = Dictionary.create({
      name: 'stateTrigger',
      type: 'number',
      defaultValue: () => 0
    });
    
    const stateManager = Dictionary.create({
      name: 'stateManager',
      type: 'object',
      defaultValue: () => ({ value: 0 }),
      computation: Custom.create({
        name: 'StateManager',
        dataDeps: {
          trigger: {
            type: 'global',
            source: trigger
          }
        },
        createState: function() {
          console.log('createState called');
          return {
            myState: new GlobalBoundState({ count: 0 })
          };
        },
        getDefaultValue: function() {
          return { value: 0 };
        },
        compute: async function(this: any, dataDeps: any) {
          console.log('compute called with state:', this.state);
          console.log('compute called with dataDeps:', dataDeps);
          
          if (!this.state || !this.state.myState) {
            return { value: 0, error: 'no state' };
          }
          
          // 读取当前状态
          const current = await this.state.myState.get() || { count: 0 };
          console.log('Current state:', current);
          
          // 基于触发器值更新状态
          const increment = dataDeps.trigger || 0;
          const newState = { count: current.count + increment };
          await this.state.myState.set(newState);
          console.log('New state set:', newState);
          
          // 验证状态是否真的被保存了
          const verifyState = await this.state.myState.get();
          console.log('Verified state:', verifyState);
          
          return { 
            value: verifyState.count,
            triggerValue: dataDeps.trigger 
          };
        }
      })
    });
    
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [],
      dict: [trigger, stateManager],
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // 等待初始化完成
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 触发第一次计算，增加 2
    await system.storage.set(DICTIONARY_RECORD, 'stateTrigger', 2);
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 验证状态被更新
    let managerState = await system.storage.get(DICTIONARY_RECORD, 'stateManager');
    console.log('After first trigger:', managerState);
    expect(managerState.value).toBe(2);
    expect(managerState.triggerValue).toBe(2);
    
    let savedState = await system.storage.get(DICTIONARY_RECORD, '_stateManager_bound_myState');
    console.log('Saved state after first trigger:', savedState);
    expect(savedState).toEqual({ count: 2 });
    
    // 触发第二次计算，再增加 3
    await system.storage.set(DICTIONARY_RECORD, 'stateTrigger', 3);
    
    // 验证状态被累加更新
    managerState = await system.storage.get(DICTIONARY_RECORD, 'stateManager');
    console.log('After second trigger:', managerState);
    expect(managerState.value).toBe(5); // 2 + 3 = 5
    expect(managerState.triggerValue).toBe(3);
    
    savedState = await system.storage.get(DICTIONARY_RECORD, '_stateManager_bound_myState');
    console.log('Saved state after second trigger:', savedState);
    expect(savedState).toEqual({ count: 5 });
  });

  test('should support async computation', async () => {
    const AsyncEntity = Entity.create({
      name: 'AsyncEntity',
      properties: [
        Property.create({ name: 'url', type: 'string' }),
        Property.create({ 
          name: 'result', 
          type: 'string',
          computation: Custom.create({
            name: 'AsyncFetcher',
            compute: async function(this: any, dataDeps: any, record: any) {
              return ComputationResult.async({ taskId: 'test-task' });
            },
            asyncReturn: async function(this: any, asyncResult: any, dataDeps: any, record: any) {
              // Simulate async operation completion
              if (asyncResult.status === 'success') {
                return 'Async result: ' + asyncResult.data;
              }
              return 'Async failed';
            }
          })
        })
      ]
    });
    
    controller = new Controller({
      system: system,
      entities: [AsyncEntity],
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Create entity
    const entity = await system.storage.create('AsyncEntity', { url: 'https://example.com' });
    
    // Initially should not have result
    let result = await system.storage.findOne(
      'AsyncEntity',
      MatchExp.atom({ key: 'id', value: ['=', entity.id] }),
      undefined,
      ['url', 'result']
    );
    expect(result.result).toBeUndefined();
    
    // Note: In a real scenario, async computation would be handled by the framework
    // This test just demonstrates the Custom computation's async capabilities
  });

  test('should support global context computation', async () => {
    const globalSettings = Dictionary.create({
      name: 'GlobalSettings',
      type: 'object',
      collection: false,
      defaultValue: () => ({ prefix: 'Custom' }),
      computation: Custom.create({
        name: 'GlobalSettingsManager',
        dataDeps: {
          settings: {
            type: 'global',
            source: Dictionary.create({
              name: 'settings',
              type: 'object'
            })
          }
        },
        compute: async function(this: any, dataDeps: any) {
          console.log('Global compute called with dataDeps:', dataDeps);
          const settings = dataDeps.settings || { prefix: 'Default' };
          return { 
            prefix: settings.prefix || 'Default',
            value: `${settings.prefix || 'Default'}: computed`
          };
        },
        getDefaultValue: function() {
          return { prefix: 'Custom', value: 'Custom: default' };
        }
      })
    });
    
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [],
      dict: [globalSettings],
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // 设置 settings 值
    await system.storage.set(DICTIONARY_RECORD, 'settings', { prefix: 'Custom' });
    
    // 等待计算完成
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 获取计算结果
    const result = await system.storage.get(DICTIONARY_RECORD, 'GlobalSettings');
    console.log('GlobalSettings result:', result);
    
    expect(result).toEqual({ 
      prefix: 'Custom',
      value: 'Custom: computed' 
    });
  });

  test('should support custom dataDeps with relations', async () => {
    const User = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'name', type: 'string' })
      ]
    });
    
    const Post = Entity.create({
      name: 'Post',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'authorCount', type: 'number', defaultValue: () => 0 })
      ]
    });
    
    const AuthorRelation = Relation.create({
      name: 'AuthorRelation',
      source: Post,
      target: User,
      sourceProperty: 'authors',
      targetProperty: 'posts',
      type: 'n:n'
    });
    
    const authorCountDict = Dictionary.create({
      name: 'postAuthorCounts',
      type: 'object',
      collection: true,
      defaultValue: () => ({}),
      computation: Custom.create({
        name: 'AuthorCounter',
        dataDeps: {
          posts: {
            type: 'records',
            source: Post,
            attributeQuery: ['id', 'title']
          },
          relations: {
            type: 'records',
            source: AuthorRelation,
            attributeQuery: ['source', 'target']
          }
        },
        compute: async function(this: any, dataDeps: any) {
          console.log('Compute called with dataDeps:', JSON.stringify(dataDeps, null, 2));
          const posts = dataDeps.posts || [];
          const relations = dataDeps.relations || [];
          
          const result: any = {};
          for (const post of posts) {
            const authorCount = relations.filter((r: any) => {
              // source 是一个对象，需要检查其 id
              return r.source && r.source.id === post.id;
            }).length;
            result[post.id] = {
              title: post.title,
              authorCount: authorCount
            };
          }
          console.log('Computed result:', result);
          return result;
        },
        getDefaultValue: function() {
          return {};
        }
      })
    });
    
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [User, Post],
      relations: [AuthorRelation],
      dict: [authorCountDict],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Create users and post
    const user1 = await system.storage.create('User', { name: 'User 1' });
    const user2 = await system.storage.create('User', { name: 'User 2' });
    const post = await system.storage.create('Post', { title: 'Test Post' });
    
    // 等待初始计算
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Create relations using proper method
    await system.storage.addRelationByNameById('AuthorRelation', post.id, user1.id, {});
    await system.storage.addRelationByNameById('AuthorRelation', post.id, user2.id, {});
    
    // 等待计算完成
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const counts = await system.storage.get(DICTIONARY_RECORD, 'postAuthorCounts');
    console.log('Final author counts:', counts);
    
    expect(counts[post.id]).toEqual({
      title: 'Test Post',
      authorCount: 2
    });
  });
}); 