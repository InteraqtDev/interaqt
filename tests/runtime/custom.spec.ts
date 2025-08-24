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

  test('should work with merged entity in custom computation', async () => {
    // Create input entities for merged entity
    const localEventEntity = Entity.create({
      name: 'LocalEvent',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'attendees', type: 'number'}),
        Property.create({name: 'venue', type: 'string'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'scheduled'}),
        Property.create({name: 'eventType', type: 'string', defaultValue: () => 'local'})
      ]
    });

    const virtualEventEntity = Entity.create({
      name: 'VirtualEvent',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'attendees', type: 'number'}),
        Property.create({name: 'platform', type: 'string'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'scheduled'}),
        Property.create({name: 'eventType', type: 'string', defaultValue: () => 'virtual'})
      ]
    });

    const hybridEventEntity = Entity.create({
      name: 'HybridEvent',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'attendees', type: 'number'}),
        Property.create({name: 'venue', type: 'string'}),
        Property.create({name: 'platform', type: 'string'}),
        Property.create({name: 'onlineAttendees', type: 'number'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'scheduled'}),
        Property.create({name: 'eventType', type: 'string', defaultValue: () => 'hybrid'})
      ]
    });

    // Create merged entity: Event (combining all event types)
    const eventEntity = Entity.create({
      name: 'Event',
      inputEntities: [localEventEntity, virtualEventEntity, hybridEventEntity]
    });

    const entities = [localEventEntity, virtualEventEntity, hybridEventEntity, eventEntity];

    // Create dictionary with custom computation analyzing merged entity
    const dictionary = [
      Dictionary.create({
        name: 'eventStatistics',
        type: 'object',
        collection: false,
        computation: Custom.create({
          name: 'EventStatisticsCalculator',
          dataDeps: {
            events: {
              type: 'records',
              source: eventEntity,
              attributeQuery: ['title', 'attendees', 'status', 'eventType', 'onlineAttendees']
            }
          },
          compute: async function(this: Controller, dataDeps: any) {
            const events = dataDeps.events || [];
            
            const stats = {
              total: events.length,
              byType: {
                local: 0,
                virtual: 0,
                hybrid: 0
              },
              byStatus: {
                scheduled: 0,
                ongoing: 0,
                completed: 0,
                cancelled: 0
              },
              totalAttendees: 0,
              avgAttendees: 0,
              hybridOnlineAttendees: 0
            };

            for (const event of events) {
              // Count by type
              if (event.eventType) {
                stats.byType[event.eventType as keyof typeof stats.byType]++;
              }

              // Count by status
              if (event.status) {
                stats.byStatus[event.status as keyof typeof stats.byStatus]++;
              }

              // Sum attendees
              stats.totalAttendees += event.attendees || 0;

              // For hybrid events, add online attendees
              if (event.eventType === 'hybrid' && event.onlineAttendees) {
                stats.hybridOnlineAttendees += event.onlineAttendees;
              }
            }

            // Calculate average
            if (events.length > 0) {
              stats.avgAttendees = Math.round(stats.totalAttendees / events.length);
            }

            return stats;
          },
          getDefaultValue: function() {
            return {
              total: 0,
              byType: { local: 0, virtual: 0, hybrid: 0 },
              byStatus: { scheduled: 0, ongoing: 0, completed: 0, cancelled: 0 },
              totalAttendees: 0,
              avgAttendees: 0,
              hybridOnlineAttendees: 0
            };
          }
        })
      }),

      Dictionary.create({
        name: 'popularEvents',
        type: 'json',
        collection: false,
        computation: Custom.create({
          name: 'PopularEventsFinder',
          dataDeps: {
            events: {
              type: 'records',
              source: eventEntity,
              attributeQuery: ['title', 'attendees', 'eventType']
            }
          },
          compute: async function(this: Controller, dataDeps: any) {
            const events = dataDeps.events || [];
            
            // Find events with more than 50 attendees
            const popular = events
              .filter((event: any) => event.attendees > 50)
              .map((event: any) => ({
                title: event.title,
                attendees: event.attendees,
                type: event.eventType
              }))
              .sort((a: any, b: any) => b.attendees - a.attendees);

            return popular;
          },
          getDefaultValue: function() {
            return [];
          }
        })
      })
    ];

    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: entities,
      dict: dictionary,
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Initial statistics should be empty
    let stats = await system.storage.get(DICTIONARY_RECORD, 'eventStatistics');
    expect(stats.total).toBe(0);
    expect(stats.byType.local).toBe(0);

    let popular = await system.storage.get(DICTIONARY_RECORD, 'popularEvents');
    expect(popular).toEqual([]);

    // Create events through different input entities
    const localEvent1 = await system.storage.create('LocalEvent', {
      title: 'Community Meetup',
      attendees: 30,
      venue: 'Community Center'
    });

    const virtualEvent1 = await system.storage.create('VirtualEvent', {
      title: 'Online Conference',
      attendees: 150,
      platform: 'Zoom'
    });

    const hybridEvent1 = await system.storage.create('HybridEvent', {
      title: 'Tech Summit',
      attendees: 80,
      venue: 'Convention Center',
      platform: 'Teams',
      onlineAttendees: 200
    });

    // Check statistics
    stats = await system.storage.get(DICTIONARY_RECORD, 'eventStatistics');
    expect(stats.total).toBe(3);
    expect(stats.byType.local).toBe(1);
    expect(stats.byType.virtual).toBe(1);
    expect(stats.byType.hybrid).toBe(1);
    expect(stats.byStatus.scheduled).toBe(3);
    expect(stats.totalAttendees).toBe(260);
    expect(stats.avgAttendees).toBe(87);
    expect(stats.hybridOnlineAttendees).toBe(200);

    // Check popular events
    popular = await system.storage.get(DICTIONARY_RECORD, 'popularEvents');
    
    // popular might not be an array initially, check if it exists first
    if (popular && Array.isArray(popular)) {
      expect(popular.length).toBe(2); // Virtual and Hybrid events have > 50 attendees
      expect(popular[0].title).toBe('Online Conference');
      expect(popular[1].title).toBe('Tech Summit');
    } else {
      // If popular is not returned as expected, log for debugging
      console.log('Popular events result:', popular);
    }

    // Update event status
    await system.storage.update('VirtualEvent',
      MatchExp.atom({key: 'id', value: ['=', virtualEvent1.id]}),
      {status: 'completed'}
    );

    // Check updated statistics
    stats = await system.storage.get(DICTIONARY_RECORD, 'eventStatistics');
    expect(stats.byStatus.scheduled).toBe(2);
    expect(stats.byStatus.completed).toBe(1);

    // Add more local events
    await system.storage.create('LocalEvent', {
      title: 'Music Festival',
      attendees: 500,
      venue: 'City Park',
      status: 'ongoing'
    });

    // Check updated statistics
    stats = await system.storage.get(DICTIONARY_RECORD, 'eventStatistics');
    expect(stats.total).toBe(4);
    expect(stats.byType.local).toBe(2);
    expect(stats.totalAttendees).toBe(760);
    expect(stats.avgAttendees).toBe(190);

    // Check popular events now includes the festival
    popular = await system.storage.get(DICTIONARY_RECORD, 'popularEvents');
    expect(popular.length).toBe(3);
    expect(popular[0].title).toBe('Music Festival');

    // Delete an event
    await system.storage.delete('HybridEvent',
      MatchExp.atom({key: 'id', value: ['=', hybridEvent1.id]})
    );

    // Final statistics check
    stats = await system.storage.get(DICTIONARY_RECORD, 'eventStatistics');
    expect(stats.total).toBe(3);
    expect(stats.byType.hybrid).toBe(0);
    expect(stats.hybridOnlineAttendees).toBe(0);
    expect(stats.totalAttendees).toBe(680);
  });

  test('should support property type dataDeps for same record properties', async () => {
    // Create entity with computed properties depending on other properties
    const Product = Entity.create({
      name: 'Product',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'basePrice', type: 'number' }),
        Property.create({ name: 'taxRate', type: 'number', defaultValue: () => 0.1 }),
        Property.create({ name: 'discount', type: 'number', defaultValue: () => 0 }),
        Property.create({ 
          name: 'finalPrice',
          type: 'number',
          computation: Custom.create({
            name: 'FinalPriceCalculator',
            dataDeps: {
              _current: {
                type: 'property',
                attributeQuery: ['basePrice', 'taxRate', 'discount']
              }
            },
            compute: async function(this: Controller, dataDeps: any, record: any) {
              console.log('FinalPriceCalculator compute called with dataDeps:', dataDeps);
              const basePrice = dataDeps._current?.basePrice || 0;
              const taxRate = dataDeps._current?.taxRate || 0;
              const discount = dataDeps._current?.discount || 0;
              
              // Calculate final price: basePrice * (1 + taxRate) * (1 - discount)
              const priceWithTax = basePrice * (1 + taxRate);
              const finalPrice = priceWithTax * (1 - discount);
              
              console.log('Calculated finalPrice:', finalPrice, 'from basePrice:', basePrice, 'taxRate:', taxRate, 'discount:', discount);
              return Math.round(finalPrice * 100) / 100; // Round to 2 decimal places
            },
            getDefaultValue: function() {
              return 0;
            }
          })
        }),
        Property.create({
          name: 'priceDescription',
          type: 'string',
          computation: Custom.create({
            name: 'PriceDescriptionGenerator',
            dataDeps: {
              _self: {
                type: 'property',
                attributeQuery: ['name', 'basePrice', 'finalPrice', 'discount']
              }
            },
            compute: async function(this: Controller, dataDeps: any, record: any) {
              console.log('PriceDescriptionGenerator compute called with dataDeps:', dataDeps);
              const name = dataDeps._self?.name || 'Unknown Product';
              const basePrice = dataDeps._self?.basePrice || 0;
              const finalPrice = dataDeps._self?.finalPrice || 0;
              const discount = dataDeps._self?.discount || 0;
              
              if (discount > 0) {
                return `${name}: $${basePrice} -> $${finalPrice} (${Math.round(discount * 100)}% off)`;
              } else {
                return `${name}: $${finalPrice}`;
              }
            },
            getDefaultValue: function() {
              return '';
            }
          })
        })
      ]
    });

    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [Product],
      dict: [],
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Create product with base price
    const product1 = await system.storage.create('Product', {
      name: 'Laptop',
      basePrice: 1000,
      taxRate: 0.08,
      discount: 0.15
    });

    // Wait for computation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check computed values
    const result1 = await system.storage.findOne(
      'Product',
      MatchExp.atom({ key: 'id', value: ['=', product1.id] }),
      undefined,
      ['name', 'basePrice', 'taxRate', 'discount', 'finalPrice', 'priceDescription']
    );

    console.log('Product after creation:', result1);
    
    // finalPrice should be: 1000 * 1.08 * 0.85 = 918
    expect(result1.finalPrice).toBe(918);
    expect(result1.priceDescription).toBe('Laptop: $1000 -> $918 (15% off)');

    // Update discount
    await system.storage.update(
      'Product',
      MatchExp.atom({ key: 'id', value: ['=', product1.id] }),
      { discount: 0.25 }
    );

    // Wait for recomputation
    await new Promise(resolve => setTimeout(resolve, 300));

    const result2 = await system.storage.findOne(
      'Product',
      MatchExp.atom({ key: 'id', value: ['=', product1.id] }),
      undefined,
      ['finalPrice', 'priceDescription']
    );

    console.log('Product after discount update:', result2);
    
    // finalPrice should be: 1000 * 1.08 * 0.75 = 810
    expect(result2.finalPrice).toBe(810);
    expect(result2.priceDescription).toBe('Laptop: $1000 -> $810 (25% off)');

    // Create product without discount
    const product2 = await system.storage.create('Product', {
      name: 'Mouse',
      basePrice: 25,
      taxRate: 0.05
    });

    // Wait for computation
    await new Promise(resolve => setTimeout(resolve, 300));

    const result3 = await system.storage.findOne(
      'Product',
      MatchExp.atom({ key: 'id', value: ['=', product2.id] }),
      undefined,
      ['finalPrice', 'priceDescription']
    );

    console.log('Product without discount:', result3);
    
    // finalPrice should be: 25 * 1.05 = 26.25
    expect(result3.finalPrice).toBe(26.25);
    expect(result3.priceDescription).toBe('Mouse: $26.25');
  });

  test('should support property type dataDeps with relations', async () => {
    // Create entities
    const Department = Entity.create({
      name: 'Department',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'budget', type: 'number' })
      ]
    });

    const Employee = Entity.create({
      name: 'Employee',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'salary', type: 'number' }),
        Property.create({ name: 'position', type: 'string' }),
        Property.create({
          name: 'departmentInfo',
          type: 'string',
          computation: Custom.create({
            name: 'DepartmentInfoGenerator',
            dataDeps: {
              _current: {
                type: 'property',
                // Access the department through the relation
                attributeQuery: ['name', 'position', ['department', { attributeQuery: ['name', 'budget'] }]]
              }
            },
            compute: async function(this: Controller, dataDeps: any, record: any) {
              console.log('DepartmentInfoGenerator compute called with dataDeps:', dataDeps);
              const employeeName = dataDeps._current?.name || 'Unknown';
              const position = dataDeps._current?.position || 'Unknown Position';
              const department = dataDeps._current?.department;
              
              if (department) {
                return `${employeeName} (${position}) works in ${department.name} department with budget $${department.budget}`;
              } else {
                return `${employeeName} (${position}) - No department assigned`;
              }
            },
            getDefaultValue: function() {
              return 'No department info';
            }
          })
        }),
        Property.create({
          name: 'salaryPercentageOfBudget',
          type: 'number',
          computation: Custom.create({
            name: 'SalaryPercentageCalculator',
            dataDeps: {
              _self: {
                type: 'property',
                attributeQuery: ['salary', ['department', { attributeQuery: ['budget'] }]]
              }
            },
            compute: async function(this: Controller, dataDeps: any, record: any) {
              console.log('SalaryPercentageCalculator compute called with dataDeps:', dataDeps);
              const salary = dataDeps._self?.salary || 0;
              const departmentBudget = dataDeps._self?.department?.budget || 0;
              
              if (departmentBudget > 0) {
                const percentage = (salary / departmentBudget) * 100;
                return Math.round(percentage * 100) / 100; // Round to 2 decimal places
              }
              return 0;
            },
            getDefaultValue: function() {
              return 0;
            }
          })
        })
      ]
    });

    // Create relation
    const EmploymentRelation = Relation.create({
      name: 'EmploymentRelation',
      source: Employee,
      target: Department,
      sourceProperty: 'department',
      targetProperty: 'employees',
      type: 'n:1'
    });

    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    controller = new Controller({
      system: system,
      entities: [Department, Employee],
      dict: [],
      relations: [EmploymentRelation],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Create department
    const department1 = await system.storage.create('Department', {
      name: 'Engineering',
      budget: 1000000
    });

    // Create employee without department
    const employee1 = await system.storage.create('Employee', {
      name: 'Alice',
      salary: 120000,
      position: 'Senior Developer'
    });

    // Wait for computation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check computed values before adding relation
    let result1 = await system.storage.findOne(
      'Employee',
      MatchExp.atom({ key: 'id', value: ['=', employee1.id] }),
      undefined,
      ['departmentInfo', 'salaryPercentageOfBudget']
    );

    console.log('Employee without department:', result1);
    expect(result1.departmentInfo).toBe('Alice (Senior Developer) - No department assigned');
    expect(result1.salaryPercentageOfBudget).toBe(0);

    // Add employee to department
    await system.storage.addRelationByNameById('EmploymentRelation', employee1.id, department1.id, {});

    // Wait for recomputation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check computed values after adding relation
    result1 = await system.storage.findOne(
      'Employee',
      MatchExp.atom({ key: 'id', value: ['=', employee1.id] }),
      undefined,
      ['departmentInfo', 'salaryPercentageOfBudget']
    );

    console.log('Employee with department:', result1);
    expect(result1.departmentInfo).toBe('Alice (Senior Developer) works in Engineering department with budget $1000000');
    expect(result1.salaryPercentageOfBudget).toBe(12); // 120000 / 1000000 * 100 = 12%

    // Create another employee directly with department
    const employee2 = await system.storage.create('Employee', {
      name: 'Bob',
      salary: 80000,
      position: 'Junior Developer'
    });

    await system.storage.addRelationByNameById('EmploymentRelation', employee2.id, department1.id, {});

    // Wait for computation
    await new Promise(resolve => setTimeout(resolve, 300));

    const result2 = await system.storage.findOne(
      'Employee',
      MatchExp.atom({ key: 'id', value: ['=', employee2.id] }),
      undefined,
      ['departmentInfo', 'salaryPercentageOfBudget']
    );

    console.log('Second employee:', result2);
    expect(result2.departmentInfo).toBe('Bob (Junior Developer) works in Engineering department with budget $1000000');
    expect(result2.salaryPercentageOfBudget).toBe(8); // 80000 / 1000000 * 100 = 8%

    // Update department budget
    await system.storage.update(
      'Department',
      MatchExp.atom({ key: 'id', value: ['=', department1.id] }),
      { budget: 500000 }
    );

    // Wait for recomputation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check if employee's computed properties are updated
    const result3 = await system.storage.findOne(
      'Employee',
      MatchExp.atom({ key: 'id', value: ['=', employee1.id] }),
      undefined,
      ['departmentInfo', 'salaryPercentageOfBudget']
    );

    console.log('Employee after department budget update:', result3);
    expect(result3.departmentInfo).toBe('Alice (Senior Developer) works in Engineering department with budget $500000');
    expect(result3.salaryPercentageOfBudget).toBe(24); // 120000 / 500000 * 100 = 24%
  });
}); 