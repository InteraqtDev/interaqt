import { describe, expect, test, beforeAll } from "vitest";
import { Controller, MonoSystem, Property, Entity, RealTime, Dictionary, BoolExp, DICTIONARY_RECORD, GlobalDataContext } from 'interaqt';
import { Expression } from 'interaqt';

import { PGLiteDB, SQLiteDB } from '@dbclients';
describe('RealTime computed handle', () => {
  
  test('should calculate global real-time value with Expression', async () => {
    // Create a trigger entity and dictionary to cause dataDeps changes
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'factor', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'currentTimestamp',
        type: 'number',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['factor']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const factor = dataDeps.config?.[0]?.factor || 1000;
            // Return current timestamp divided by factor
            return now.divide(factor);
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a config record to trigger the computation
    await system.storage.create('Config', {factor: 1000});
    
    // Get computed value
    const computedValue = await system.storage.dict.get('currentTimestamp');
    expect(typeof computedValue).toBe('number');
    expect(computedValue).toBeGreaterThan(1000000); // Should be a large timestamp divided by 1000
    
    // Verify RealTime state management
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'currentTimestamp'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for global computation
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(typeof nextRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    expect(nextRecomputeTime).toBeGreaterThan(lastRecomputeTime); // next should be after last
    expect(nextRecomputeTime - lastRecomputeTime).toBe(1000); // Expression type: should be lastTime + 1000
  });

  test('should calculate global real-time value with Inequality', async () => {
    // Create a trigger entity to cause dataDeps changes  
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'thresholdOffset', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'isTimeExpired',
        type: 'boolean',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['thresholdOffset']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const offset = dataDeps.config?.[0]?.thresholdOffset || 5000;
            const timeThreshold = Date.now() + offset; // Future time
            // Check if current time is greater than threshold
            return now.gt(timeThreshold);
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a config record to trigger the computation
    await system.storage.create('Config', {thresholdOffset: 5000}); // 5 seconds in future
    
    // Get value - should be false since we're still before the threshold
    const isExpired = await system.storage.dict.get('isTimeExpired');
    expect(isExpired).toBeFalsy();
    
    // Verify RealTime state management for Inequality type
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'isTimeExpired'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for global computation with Inequality
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(typeof nextRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    // For Inequality/Equation type: nextRecomputeTime is the solve() result (critical threshold)
    expect(nextRecomputeTime).toBeGreaterThan(Date.now()); // Should be in the future (threshold time)
  });

  test('should calculate global real-time value with Equation', async () => {
    // Create a trigger entity to cause dataDeps changes
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'timeUnit', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'isExactMinute',
        type: 'boolean',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['timeUnit']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const timeUnit = dataDeps.config?.[0]?.timeUnit || 60000;
            // Check if current time modulo timeUnit equals 0 (exact minute/unit)
            return now.divide(timeUnit).subtract(Math.floor(now.evaluate({now: Date.now()}) / timeUnit)).eq(0);
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a config record to trigger the computation
    await system.storage.create('Config', {timeUnit: 60000}); // Check for exact minutes
    
    // Get value
    const isExactMinute = await system.storage.dict.get('isExactMinute');
    expect(typeof isExactMinute).toBe('boolean');
    
    // Verify RealTime state management for Equation type
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'isExactMinute'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for global computation with Equation
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    expect(typeof nextRecomputeTime).toBe('number');
  });

  test('should calculate property-level real-time value', async () => {
    // Create a user entity with a time-based property
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'})
      ]
    });
    
    // Add a trigger property and real-time computed property
    userEntity.properties.push(
      Property.create({name: 'triggerField', type: 'number'})
    );
    
    userEntity.properties.push(
      Property.create({
        name: 'currentTimeSeconds',
        type: 'number',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          attributeQuery: ['triggerField'], // Depend on triggerField to trigger computation
          callback: async (now: Expression, dataDeps: any) => {
            // Return current timestamp in seconds
            return now.divide(1000);
          }
        })
      })
    );
    
    const entities = [userEntity];
    const system = new MonoSystem(new SQLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a user with triggerField to trigger the computation
    const user = await system.storage.create('User', {
      username: 'testuser',
      triggerField: 1
    });
    
    // Get user with computed property
    const userWithTime = await system.storage.findOne('User', 
      BoolExp.atom({key: 'id', value: ['=', user.id]}), 
      undefined, 
      ['*']
    );
    
    // Should have a timestamp value in seconds (large number)
    expect(typeof userWithTime.currentTimeSeconds).toBe('number');
    expect(userWithTime.currentTimeSeconds).toBeGreaterThan(1000000); // Should be a large timestamp in seconds
    
    // Verify RealTime state management for property-level computation
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'property' && 
                   computation.dataContext.host.name === 'User' &&
                   computation.dataContext.id.name === 'currentTimeSeconds'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for property-level computation (stored on record)
    expect(typeof userWithTime[lastRecomputeTimeKey]).toBe('number');
    expect(typeof userWithTime[nextRecomputeTimeKey]).toBe('number');
    expect(userWithTime[lastRecomputeTimeKey]).toBeGreaterThan(0);
    expect(userWithTime[nextRecomputeTimeKey]).toBeGreaterThan(userWithTime[lastRecomputeTimeKey]);
    // Expression type: should be lastTime + 1000
    expect(userWithTime[nextRecomputeTimeKey] - userWithTime[lastRecomputeTimeKey]).toBe(1000);
  });

  test('should handle complex mathematical expressions', async () => {
    // Create a trigger entity to cause dataDeps changes
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'coefficient', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'complexTimeValue',
        type: 'number',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['coefficient']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const coefficient = dataDeps.config?.[0]?.coefficient || 0.001;
            // Calculate complex mathematical expressions
            const timeInSeconds = now.divide(1000);
            const timeInTenSeconds = now.divide(10000);
            
            // For simplicity, we'll use a polynomial approximation
            // result = (now/1000) * coefficient + (now/10000)^0.5
            return timeInSeconds.multiply(coefficient).add(timeInTenSeconds.power(0.5));
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new SQLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a config record to trigger the computation
    await system.storage.create('Config', {coefficient: 0.001});
    
    const complexValue = await system.storage.dict.get('complexTimeValue');
    expect(typeof complexValue).toBe('number');
    expect(complexValue).toBeGreaterThan(0);
    
    // Verify RealTime state management for complex mathematical expressions
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'complexTimeValue'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for complex Expression computation
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(typeof nextRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    expect(nextRecomputeTime).toBeGreaterThan(lastRecomputeTime);
    // Expression type with complex math: should be lastTime + 1000
    expect(nextRecomputeTime - lastRecomputeTime).toBe(1000);
  });

  test('should handle dataDeps in callback', async () => {
    // Create an entity to store a multiplier value
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'multiplier', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'scaledTimestamp',
        type: 'number',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['multiplier']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const configs = dataDeps.config || [];
            const multiplier = configs.length > 0 ? configs[0].multiplier : 1;
            
            // Return current timestamp multiplied by the config value
            return now.multiply(multiplier);
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a config with multiplier to trigger the computation
    await system.storage.create('Config', {multiplier: 2});
    
    // Get scaled timestamp  
    const scaledValue = await system.storage.dict.get('scaledTimestamp');
    expect(typeof scaledValue).toBe('number');
    expect(scaledValue).toBeGreaterThan(Date.now()); // Should be larger due to multiplier
    
    // Verify RealTime state management for dataDeps computation
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'scaledTimestamp'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for dataDeps Expression computation
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(typeof nextRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    expect(nextRecomputeTime).toBeGreaterThan(lastRecomputeTime);
    // Expression type with dataDeps: should be lastTime + 1000
    expect(nextRecomputeTime - lastRecomputeTime).toBe(1000);
  });

  test('should handle time-based conditions with business logic', async () => {
    // Create a trigger entity to cause dataDeps changes
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'businessHourStart', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'isBusinessHours',
        type: 'boolean',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 60000, // Check every minute
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['businessHourStart']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const businessHourStart = dataDeps.config?.[0]?.businessHourStart || 9; // 9 AM
            // Get current hour (simplified - assumes UTC)
            // Hour = (now % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
            const msPerDay = 24 * 60 * 60 * 1000;
            const msPerHour = 60 * 60 * 1000;
            
            const timeOfDay = now.subtract(now.divide(msPerDay).multiply(msPerDay));
            const currentHour = timeOfDay.divide(msPerHour);
            
            // Check if between business hours
            return currentHour.gt(businessHourStart);
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a config record to trigger the computation
    await system.storage.create('Config', {businessHourStart: 9}); // 9 AM start
    
    const isBusinessHours = await system.storage.dict.get('isBusinessHours');
    expect(typeof isBusinessHours).toBe('boolean');
    
    // Verify RealTime state management for business logic computation
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'isBusinessHours'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for business logic Inequality computation
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    // For Inequality type: nextRecomputeTime is solve() result (critical change point)
    if (nextRecomputeTime !== null) {
      expect(typeof nextRecomputeTime).toBe('number');
    }
  });

  test('should work with user-specific time calculations', async () => {
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'}),
        Property.create({name: 'lastLoginAt', type: 'number'}),
        Property.create({name: 'timezone', type: 'number'}) // UTC offset in hours
      ]
    });
    
    // Add property to check if user was active recently (within last hour)
    userEntity.properties.push(
      Property.create({
        name: 'isRecentlyActive',
        type: 'boolean',
        computation: RealTime.create({
          dataDeps: {
            _current: {
              type: 'property',
              attributeQuery: ['lastLoginAt']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const lastLogin = dataDeps._current?.lastLoginAt || 0;
            const oneHourAgo = now.subtract(3600000); // 1 hour in ms
            
            // Check if last login was within the last hour
            return Expression.number(lastLogin).gt(oneHourAgo);
          }
        })
      })
    );
    
    const entities = [userEntity];
    const system = new MonoSystem(new SQLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create users with different login times to trigger the computation
    const recentUser = await system.storage.create('User', {
      username: 'recentuser',
      lastLoginAt: Date.now() - 1800000, // 30 minutes ago
      timezone: -8 // PST
    });
    
    const oldUser = await system.storage.create('User', {
      username: 'olduser', 
      lastLoginAt: Date.now() - 7200000, // 2 hours ago
      timezone: 0 // UTC
    });
    
    // Get user data with computed properties - computation is triggered automatically by dataDeps
    const recentUserData = await system.storage.findOne('User',
      BoolExp.atom({key: 'id', value: ['=', recentUser.id]}),
      undefined,
      ['*']
    );
    
    const oldUserData = await system.storage.findOne('User',
      BoolExp.atom({key: 'id', value: ['=', oldUser.id]}),
      undefined,
      ['*']
    );
    
    expect(recentUserData.isRecentlyActive).toBeTruthy();
    expect(oldUserData.isRecentlyActive).toBeFalsy();
    
    // Verify RealTime state management for user-specific computation
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'property' && 
                   computation.dataContext.host.name === 'User' &&
                   computation.dataContext.id.name === 'isRecentlyActive'
    );
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    
    // Get state keys using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for user-specific property computation (both users)
    expect(typeof recentUserData[lastRecomputeTimeKey]).toBe('number');
    expect(typeof oldUserData[lastRecomputeTimeKey]).toBe('number');
    expect(recentUserData[lastRecomputeTimeKey]).toBeGreaterThan(0);
    expect(oldUserData[lastRecomputeTimeKey]).toBeGreaterThan(0);
    
    // For Inequality type: nextRecomputeTime is solve() result (when inequality changes)
    if (recentUserData[nextRecomputeTimeKey] !== null) {
      expect(typeof recentUserData[nextRecomputeTimeKey]).toBe('number');
    }
    if (oldUserData[nextRecomputeTimeKey] !== null) {
      expect(typeof oldUserData[nextRecomputeTimeKey]).toBe('number');
    }
  });

  test('should handle state management for time-based computations', async () => {
    // Create a trigger entity to cause dataDeps changes
    const configEntity = Entity.create({
      name: 'Config',
      properties: [
        Property.create({name: 'divisor', type: 'number'})
      ]
    });
    
    const dictionary = [
      Dictionary.create({
        name: 'timeBasedCounter',
        type: 'number',
        computation: RealTime.create({
          nextRecomputeTime: (now: number, dataDeps: any) => 1000, // 1 second interval
          dataDeps: {
            config: {
              type: 'records',
              source: configEntity,
              attributeQuery: ['divisor']
            }
          },
          callback: async (now: Expression, dataDeps: any) => {
            const divisor = dataDeps.config?.[0]?.divisor || 1000;
            // Simple counter based on seconds since epoch
            return now.divide(divisor);
          }
        })
      })
    ];
    
    const entities = [configEntity];
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Get the computation instance to verify state is being managed
    const realTimeComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
      computation => computation.dataContext.type === 'global' && 
                   (computation.dataContext as GlobalDataContext).id.name === 'timeBasedCounter'
    );
    
    expect(realTimeComputation).toBeDefined();
    expect(realTimeComputation?.state).toBeDefined();
    expect(realTimeComputation?.state.lastRecomputeTime).toBeDefined();
    expect(realTimeComputation?.state.nextRecomputeTime).toBeDefined();
    
    // Create a config record to trigger the computation
    await system.storage.create('Config', {divisor: 1000});
    
    // Verify initial computation result
    const counterValue = await system.storage.dict.get('timeBasedCounter');
    expect(typeof counterValue).toBe('number');
    expect(counterValue).toBeGreaterThan(0);
    
    // Enhanced state verification using getBoundStateName
    const lastRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'lastRecomputeTime', realTimeComputation!.state.lastRecomputeTime
    );
    const nextRecomputeTimeKey = controller.scheduler.getBoundStateName(
      realTimeComputation!.dataContext, 'nextRecomputeTime', realTimeComputation!.state.nextRecomputeTime
    );
    
    // Verify state values for time-based counter Expression computation
    const lastRecomputeTime = await system.storage.dict.get(lastRecomputeTimeKey);
    const nextRecomputeTime = await system.storage.dict.get(nextRecomputeTimeKey);
    
    expect(typeof lastRecomputeTime).toBe('number');
    expect(typeof nextRecomputeTime).toBe('number');
    expect(lastRecomputeTime).toBeGreaterThan(0);
    expect(nextRecomputeTime).toBeGreaterThan(lastRecomputeTime);
    // Expression type: nextRecomputeTime should be lastTime + 1000 (from nextRecomputeTime function)
    expect(nextRecomputeTime - lastRecomputeTime).toBe(1000);
    
  });
});