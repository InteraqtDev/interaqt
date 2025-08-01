import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Property, Entity, Every, Dictionary, BoolExp, Any, Relation, MatchExp, DICTIONARY_RECORD, KlassByName } from 'interaqt';

// 创建简单测试环境，直接测试 EveryHandle 的具体方法
describe('Every and Any computed handle', () => {
  
  test('should be true when match count equals total count', async () => {
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [requestEntity]
    const dictionary = [
        Dictionary.create({
            name: 'everyRequestHandled',
            type: 'boolean',
            collection: false,
            computation: Every.create({
                record: requestEntity,
                attributeQuery: ['handled'],
                callback: (request:any) => {
                    return request.handled
                },
                notEmpty: true
            }),
        })
    ]
    const system = new MonoSystem()
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
    })
    await controller.setup(true)


    // 获取 dictionary 的值
    const everyRequestHandled0 = await system.storage.get(DICTIONARY_RECORD,'everyRequestHandled')
    expect(everyRequestHandled0).toBeFalsy()
    // 创建两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled = await system.storage.get(DICTIONARY_RECORD,'everyRequestHandled')
    expect(everyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    const idMatch1 = BoolExp.atom({
        key: 'id',
        value: ['=', request1.id]
    })
    const idMatch2 = BoolExp.atom({
        key: 'id',
        value: ['=', request2.id]
    })
    await system.storage.update('Request', idMatch1, {handled: true})
    await system.storage.update('Request', idMatch2, {handled: true})

    // 获取 dictionary 的值
    const everyRequestHandled2 = await system.storage.get(DICTIONARY_RECORD,'everyRequestHandled')
    expect(everyRequestHandled2).toBeTruthy()

    // 再次更新 request 的 handled 属性
    await system.storage.update('Request', idMatch1, {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled3 = await system.storage.get(DICTIONARY_RECORD,'everyRequestHandled')
    expect(everyRequestHandled3).toBeFalsy()
  });

  test('should be true when any request is handled', async () => {
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [requestEntity]
    const dictionary = [
        Dictionary.create({
            name: 'anyRequestHandled',
            type: 'boolean',
            collection: false,
            computation: Any.create({
                record: requestEntity,
                attributeQuery: ['handled'],
                callback: (request:any) => {
                    return request.handled
                },
            }),
        })
    ]
    const system = new MonoSystem()
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
    })
    await controller.setup(true)
    // 获取 dictionary 的值
    const anyRequestHandled0 = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled0).toBeFalsy()
    
    // 创建两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const anyRequestHandled = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    const idMatch1 = BoolExp.atom({
        key: 'id',
        value: ['=', request1.id]
    })  
    await system.storage.update('Request', idMatch1, {handled: true})

    // 获取 dictionary 的值
    const anyRequestHandled2 = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled2).toBeTruthy()   

    // 更新 request 的 handled 属性
    await system.storage.update('Request', idMatch1, {handled: false})

    // 获取 dictionary 的值
    const anyRequestHandled3 = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled3).toBeFalsy()
  });


  test('should be true when any request of a user is handled', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({
                name:'name',
                type:'string',
                defaultValue: () => 'user1'
            })
        ]
    })
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [userEntity, requestEntity]
    // 创建一个 user 和 request 的关系
    const requestRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'requests',
        target: requestEntity,
        targetProperty: 'owner',
        name: 'requests',
        type: 'n:n'
    })
    const relations = [requestRelation]

    userEntity.properties.push(Property.create({
        name: 'anyRequestHandled', 
        type: 'boolean',
        computation: Any.create({
            record: requestRelation,
            attributeQuery: [['target', {attributeQuery: ['handled']}]],
            callback: (relation:any) => {
                return relation.target.handled
            },
        })
    }))

    const system = new MonoSystem()
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    })
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {anyRequestHandled: false})
    const request1 = await system.storage.create('Request', {handled: false, owner: user})
    const request2 = await system.storage.create('Request', {handled: false, owner: user})

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.anyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user3.anyRequestHandled).toBeTruthy()

    // 更新 request 的 handled 属性
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: false})

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user4 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.anyRequestHandled).toBeFalsy()


    // 更新 request 为 true
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})
    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user5 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.anyRequestHandled).toBeTruthy()

    // 删除 request
    await system.storage.delete('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}))

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user6 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user6.anyRequestHandled).toBeFalsy()

    
  });

  test('should be true when every request of a user is handled', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({
                name:'name',
                type:'string',
                defaultValue: () => 'user1'
            })
        ]
    })
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [userEntity, requestEntity]
    // 创建一个 user 和 request 的关系
    const requestRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'requests',
        target: requestEntity,
        targetProperty: 'owner',
        name: 'requests',
        type: 'n:n'
    })
    const relations = [requestRelation]

    userEntity.properties.push(Property.create({
        name: 'everyRequestHandled',
        type: 'boolean',
        computation: Every.create({
            record: requestRelation,
            attributeQuery: [['target', {attributeQuery: ['handled']}]],
            notEmpty: true,
            callback: (relation:any) => {
                return !!relation.target.handled
            },
        })
    }))

    const system = new MonoSystem() 
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    })
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {everyRequestHandled: false})
    const request1 = await system.storage.create('Request', {handled: false, owner: user})
    const request2 = await system.storage.create('Request', {handled: false, owner: user})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user2 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.everyRequestHandled).toBeFalsy()       

    // 更新 request 的 handled 属性
    await system.storage.update('Request', MatchExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user3 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user3.everyRequestHandled).toBeFalsy()       

    // 更新 request2 的 handled 属性
    await system.storage.update('Request', MatchExp.atom({key: 'id', value: ['=', request2.id]}), {handled: true})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user4 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.everyRequestHandled).toBeTruthy()   

    // 更新 request2 的 handled 属性为 false
    await system.storage.update('Request', MatchExp.atom({key: 'id', value: ['=', request2.id]}), {handled: false})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user5 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.everyRequestHandled).toBeFalsy()

    // 删除 request2
    await system.storage.delete('Request', MatchExp.atom({key: 'id', value: ['=', request2.id]}))

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user6 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user6.everyRequestHandled).toBeTruthy()
    
  });

  test('should be true when every request with n:n items of a user is handled', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({
                name:'name',
                type:'string',
            })
        ]
    })
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const itemsEntity = Entity.create({
        name: 'Items',
        properties: [
            Property.create({name: 'name', type: 'string'})
        ]
    })


    const entities = [userEntity, requestEntity, itemsEntity]
    // 创建一个 user 和 request 的关系
    const requestRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'requests',
        target: requestEntity,
        targetProperty: 'owner',
        name: 'requests',
        type: 'n:n'
    })
    const itemsRelation = Relation.create({
        source: requestEntity,
        sourceProperty: 'items',
        target: itemsEntity,
        targetProperty: 'request',
        name: 'requestItems',
        type: 'n:n'
    })  
    const relations = [requestRelation, itemsRelation]

    userEntity.properties.push(Property.create({
        name: 'everyRequestHasTwoItems',
        type: 'boolean',
        computation: Every.create({
            record: requestRelation,
            attributeQuery: [['target', {attributeQuery: [['items', {attributeQuery: ['name']}]]}]],
            notEmpty: true,
            callback: (relation:any) => {
                if (!relation.target) debugger
                return relation.target.items?.length === 2
            },
        })
    }))

    const system = new MonoSystem() 
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    })
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {everyRequestHandled: false})  
    const request1 = await system.storage.create('Request', {handled: false, owner: user})      

    const user2 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.everyRequestHasTwoItems).toBeFalsy()

    const item1 = await system.storage.create('Items', {name: 'item1', request: request1})

    const item2 = await system.storage.create('Items', {name: 'item2', request: request1})

    const user3 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*', ['requests', {attributeQuery: [['items', {attributeQuery: ['name']}]]}]])
    expect(user3.everyRequestHasTwoItems).toBeTruthy()

    const item3 = await system.storage.create('Items', {name: 'item3', request: request1})
    const user4 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.everyRequestHasTwoItems).toBeFalsy()

    await system.storage.delete('Items', MatchExp.atom({key: 'id', value: ['=', item1.id]}))
    const user5 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.everyRequestHasTwoItems).toBeTruthy()

    
  });

  test('check entities should work with extra data deps', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({name: 'name', type: 'string'}),
            Property.create({name: 'age', type: 'number'})
        ]
    })

    const ageLimit = Dictionary.create({
        name: 'ageLimit',
        type: 'number',
        collection: false,
    })

    const ageLimitComputed = Dictionary.create({
        name: 'isEveryUserAgeGreaterThanAgeLimit',
        type: 'boolean',
        collection: false,
        computation: Every.create({
            record: userEntity,
            attributeQuery: ['age'],
            dataDeps: {
                ageLimit: {
                    type: 'global',
                    source: ageLimit,
                }
            },
            callback: (user:any, dataDeps:any) => {
                return user.age > dataDeps.ageLimit
            },
        })
    })


    const entities = [userEntity]
    const system = new MonoSystem()
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: [ageLimit, ageLimitComputed]
    })
    await controller.setup(true)

    // set ageLimit to 19
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 19)

    const user1 = await system.storage.create('User', {name: 'user1', age: 18})
    const user2 = await system.storage.create('User', {name: 'user2', age: 20})

    const isEveryUserAgeGreaterThanAgeLimit = await system.storage.get(DICTIONARY_RECORD, 'isEveryUserAgeGreaterThanAgeLimit')
    expect(isEveryUserAgeGreaterThanAgeLimit).toBeFalsy()

    // 把 user1 的 age 改为 20
    await system.storage.update('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), {age: 20})

    const isEveryUserAgeGreaterThanAgeLimit2 = await system.storage.get(DICTIONARY_RECORD, 'isEveryUserAgeGreaterThanAgeLimit')
    expect(isEveryUserAgeGreaterThanAgeLimit2).toBeTruthy()

    // 把 ageLimit 改为 21
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 21)

    const isEveryUserAgeGreaterThanAgeLimit3 = await system.storage.get(DICTIONARY_RECORD, 'isEveryUserAgeGreaterThanAgeLimit')
    expect(isEveryUserAgeGreaterThanAgeLimit3).toBeFalsy()
  })


  test('check entities should work with extra data deps for Any', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({name: 'name', type: 'string'}),
            Property.create({name: 'age', type: 'number'})
        ]
    })

    const ageLimit = Dictionary.create({
        name: 'ageLimit',
        type: 'number',
        collection: false,
    })

    const ageLimitComputed = Dictionary.create({
        name: 'isAnyUserAgeGreaterThanAgeLimit',
        type: 'boolean',
        collection: false,
        computation: Any.create({
            record: userEntity,
            attributeQuery: ['age'],
            dataDeps: {
                ageLimit: {
                    type: 'global',
                    source: ageLimit,
                }
            },
            callback: (user:any, dataDeps:any) => {
                return user.age > dataDeps.ageLimit
            },
        })
    })

    const entities = [userEntity]
    const system = new MonoSystem()
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: [ageLimit, ageLimitComputed]
    })
    await controller.setup(true)

    // set ageLimit to 19   
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 19)

    const user1 = await system.storage.create('User', {name: 'user1', age: 18})
    const user2 = await system.storage.create('User', {name: 'user2', age: 20})

    const isAnyUserAgeGreaterThanAgeLimit = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit).toBeTruthy()

    // set ageLimit to 21
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 21)

    const isAnyUserAgeGreaterThanAgeLimit2 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit2).toBeFalsy()

    // set ageLimit to 19
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 19)

    const isAnyUserAgeGreaterThanAgeLimit3 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit3).toBeTruthy()

    // delete user1 
    await system.storage.delete('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}))

    const isAnyUserAgeGreaterThanAgeLimit4 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit4).toBeTruthy()
    
    // delete user2
    await system.storage.delete('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}))

    const isAnyUserAgeGreaterThanAgeLimit5 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit5).toBeFalsy()

  })

  test('should handle property level Every with filtered relations', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const teamEntity = Entity.create({
      name: 'Team',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const playerEntity = Entity.create({
      name: 'Player',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'isEligible', type: 'boolean'}),
        Property.create({name: 'age', type: 'number'})
      ]
    });
    
    // Create base relation with player role property
    const teamPlayerRelation = Relation.create({
      source: teamEntity,
      sourceProperty: 'players',
      target: playerEntity,
      targetProperty: 'team',
      name: 'TeamPlayer',
      type: '1:n',
      properties: [
        Property.create({name: 'role', type: 'string'}), // starter, substitute, reserve
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => true}),
        Property.create({name: 'jerseyNumber', type: 'number'})
      ]
    });
    
    // Create filtered relation for active starters only
    const activeStarterRelation = Relation.create({
      name: 'ActiveStarterRelation',
      sourceRelation: teamPlayerRelation,
      sourceProperty: 'activeStarters',
      targetProperty: 'activeStarterTeams',
      matchExpression: MatchExp.atom({
        key: 'role',
        value: ['=', 'starter']
      }).and({
        key: 'isActive',
        value: ['=', true]
      })
    });
    
    // Add computed properties to team entity
    teamEntity.properties.push(
      Property.create({
        name: 'allPlayersEligible',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: teamPlayerRelation,
          attributeQuery: [['target', {attributeQuery: ['isEligible']}]],
          callback: function(relation: any) {
            return relation.target.isEligible;
          },
          notEmpty: true
        })
      }),
      Property.create({
        name: 'allStartersEligible',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: activeStarterRelation,
          attributeQuery: [['target', {attributeQuery: ['isEligible']}]],
          callback: function(relation: any) {
            return relation.target.isEligible;
          },
          notEmpty: true
        })
      })
    );
    
    const entities = [teamEntity, playerEntity];
    const relations = [teamPlayerRelation, activeStarterRelation];
    
    // Setup system and controller
    const system = new MonoSystem();
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const team1 = await system.storage.create('Team', { name: 'Team Alpha' });
    
    const player1 = await system.storage.create('Player', { 
      name: 'John',
      isEligible: true,
      age: 25
    });
    const player2 = await system.storage.create('Player', { 
      name: 'Mike',
      isEligible: true,
      age: 23
    });
    const player3 = await system.storage.create('Player', { 
      name: 'Tom',
      isEligible: false,
      age: 22
    });
    
    // Create relations
    await system.storage.create('TeamPlayer', {
      source: team1,
      target: player1,
      role: 'starter',
      isActive: true,
      jerseyNumber: 10
    });
    
    const mikeRelation = await system.storage.create('TeamPlayer', {
      source: team1,
      target: player2,
      role: 'starter',
      isActive: true,
      jerseyNumber: 7
    });
    
    await system.storage.create('TeamPlayer', {
      source: team1,
      target: player3,
      role: 'substitute',
      isActive: true,
      jerseyNumber: 15
    });
    
    // Check initial state
    const team1Data = await system.storage.findOne('Team', 
      BoolExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 0 when false, 1 when true
    expect(team1Data.allPlayersEligible).toBe(0); // Tom is not eligible
    // Active starters: John and Mike, both eligible
    expect(team1Data.allStartersEligible).toBe(1); // All active starters are eligible
    
    // Make Tom a starter
    const tomRelation = await system.storage.findOne('TeamPlayer',
      BoolExp.and([
        MatchExp.atom({key: 'source.id', value: ['=', team1.id]}),
        MatchExp.atom({key: 'target.id', value: ['=', player3.id]})
      ]),
      undefined,
      ['id']
    );
    
    await system.storage.update('TeamPlayer',
      BoolExp.atom({key: 'id', value: ['=', tomRelation.id]}),
      { role: 'starter' }
    );
    
    // Check after role change
    const team1Data2 = await system.storage.findOne('Team', 
      BoolExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 0 when false
    expect(team1Data2.allPlayersEligible).toBe(0); // Tom is still not eligible
    // Active starters now: John, Mike, and Tom - but Tom is not eligible
    expect(team1Data2.allStartersEligible).toBe(0); // Not all active starters are eligible
    
    // Make Tom eligible
    await system.storage.update('Player',
      BoolExp.atom({key: 'id', value: ['=', player3.id]}),
      { isEligible: true }
    );
    
    // Check after eligibility change
    const team1Data3 = await system.storage.findOne('Team', 
      BoolExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 1 when true
    expect(team1Data3.allPlayersEligible).toBe(1); // All players are now eligible
    // All active starters (John, Mike, Tom) are now eligible
    expect(team1Data3.allStartersEligible).toBe(1); // All active starters are eligible
    
    // Deactivate Mike
    await system.storage.update('TeamPlayer',
      BoolExp.atom({key: 'id', value: ['=', mikeRelation.id]}),
      { isActive: false }
    );
    
    // Check after deactivation
    const team1Data4 = await system.storage.findOne('Team', 
      BoolExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 1 when true
    expect(team1Data4.allPlayersEligible).toBe(1); // Still all players eligible
    // Active starters are now John and Tom (Mike is inactive), both eligible
    expect(team1Data4.allStartersEligible).toBe(1); // All remaining active starters are eligible
  });

  test('should handle property level Any with filtered relations', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const projectEntity = Entity.create({
      name: 'Project',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const taskEntity = Entity.create({
      name: 'Task',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'status', type: 'string'}), // pending, in-progress, completed, blocked
        Property.create({name: 'isOverdue', type: 'boolean'})
      ]
    });
    
    // Create base relation with task priority
    const projectTaskRelation = Relation.create({
      source: projectEntity,
      sourceProperty: 'tasks',
      target: taskEntity,
      targetProperty: 'project',
      name: 'ProjectTask',
      type: '1:n',
      properties: [
        Property.create({name: 'priority', type: 'string'}), // high, medium, low
        Property.create({name: 'assignedDate', type: 'string'}),
        Property.create({name: 'isArchived', type: 'boolean', defaultValue: () => false})
      ]
    });
    
    // Create filtered relation for active high-priority tasks
    const activeHighPriorityRelation = Relation.create({
      name: 'ActiveHighPriorityRelation',
      sourceRelation: projectTaskRelation,
      sourceProperty: 'activeHighPriorityTasks',
      targetProperty: 'activeHighPriorityProjects',
      matchExpression: MatchExp.atom({
        key: 'priority',
        value: ['=', 'high']
      }).and({
        key: 'isArchived',
        value: ['=', false]
      })
    });
    
    // Add computed properties to project entity
    projectEntity.properties.push(
      Property.create({
        name: 'hasAnyBlockedTask',
        type: 'boolean',
        collection: false,
        computation: Any.create({
          record: projectTaskRelation,
          attributeQuery: [['target', {attributeQuery: ['status']}]],
          callback: function(relation: any) {
            return relation.target.status === 'blocked';
          }
        })
      }),
      Property.create({
        name: 'hasHighPriorityOverdue',
        type: 'boolean',
        collection: false,
        computation: Any.create({
          record: activeHighPriorityRelation,
          attributeQuery: [['target', {attributeQuery: ['isOverdue']}]],
          callback: function(relation: any) {
            return relation.target.isOverdue;
          }
        })
      })
    );
    
    const entities = [projectEntity, taskEntity];
    const relations = [projectTaskRelation, activeHighPriorityRelation];
    
    // Setup system and controller
    const system = new MonoSystem();
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const project1 = await system.storage.create('Project', { name: 'Project X' });
    
    const task1 = await system.storage.create('Task', { 
      title: 'Critical Task',
      status: 'in-progress',
      isOverdue: false
    });
    const task2 = await system.storage.create('Task', { 
      title: 'Important Task',
      status: 'pending',
      isOverdue: true
    });
    const task3 = await system.storage.create('Task', { 
      title: 'Regular Task',
      status: 'blocked',
      isOverdue: false
    });
    
    // Create relations
    await system.storage.create('ProjectTask', {
      source: project1,
      target: task1,
      priority: 'high',
      assignedDate: '2024-01-01',
      isArchived: false
    });
    
    const task2Relation = await system.storage.create('ProjectTask', {
      source: project1,
      target: task2,
      priority: 'high',
      assignedDate: '2024-01-02',
      isArchived: false
    });
    
    await system.storage.create('ProjectTask', {
      source: project1,
      target: task3,
      priority: 'medium',
      assignedDate: '2024-01-03',
      isArchived: false
    });
    
    // Check initial state
    const project1Data = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 1 when there's a match, 0 when no match
    expect(project1Data.hasAnyBlockedTask).toBe(1); // task3 is blocked
    // task2 is high priority, active (not archived), and overdue
    expect(project1Data.hasHighPriorityOverdue).toBe(1); // task2 matches
    
    // Archive the overdue high-priority task
    await system.storage.update('ProjectTask',
      BoolExp.atom({key: 'id', value: ['=', task2Relation.id]}),
      { isArchived: true }
    );
    
    // Check after archiving
    const project1Data2 = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 1 when there's a match
    expect(project1Data2.hasAnyBlockedTask).toBe(1); // task3 is still blocked
    // task2 is now archived, no active high priority overdue tasks
    expect(project1Data2.hasHighPriorityOverdue).toBe(0); // No matches after archiving
    
    // Unblock task3
    await system.storage.update('Task',
      BoolExp.atom({key: 'id', value: ['=', task3.id]}),
      { status: 'completed' }
    );
    
    // Check after unblocking
    const project1Data3 = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 0 when there's no match
    expect(project1Data3.hasAnyBlockedTask).toBe(0); // No blocked tasks
    // Still no active high priority overdue tasks
    expect(project1Data3.hasHighPriorityOverdue).toBe(0); // No matches
    
    // Make task1 overdue
    await system.storage.update('Task',
      BoolExp.atom({key: 'id', value: ['=', task1.id]}),
      { isOverdue: true }
    );
    
    // Check after making task1 overdue
    const project1Data4 = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 0 when there's no match, 1 when there's a match
    expect(project1Data4.hasAnyBlockedTask).toBe(0); // Still no blocked tasks
    // task1 is now overdue, high priority, and active
    expect(project1Data4.hasHighPriorityOverdue).toBe(1); // task1 now matches
  });
}); 

  test('should handle property level every with filtered relations - Quality Control Example', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const factoryEntity = Entity.create({
      name: 'Factory',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'location', type: 'string'})
      ]
    });
    
    const productBatchEntity = Entity.create({
      name: 'ProductBatch',
      properties: [
        Property.create({name: 'batchNumber', type: 'string'}),
        Property.create({name: 'productType', type: 'string'}),
        Property.create({name: 'manufactureDate', type: 'string'})
      ]
    });
    
    // Create base relation with quality check properties
    const factoryBatchRelation = Relation.create({
      source: factoryEntity,
      sourceProperty: 'batches',
      target: productBatchEntity,
      targetProperty: 'factory',
      name: 'FactoryBatch',
      type: '1:n',
      properties: [
        Property.create({name: 'qualityScore', type: 'number'}), // 0-100
        Property.create({name: 'passedQC', type: 'boolean'}),
        Property.create({name: 'inspectionLevel', type: 'string'}), // basic, standard, comprehensive
        Property.create({name: 'shift', type: 'string'}), // morning, afternoon, night
        Property.create({name: 'inspector', type: 'string'})
      ]
    });
    
    // Create filtered relations for different shifts and inspection levels
    const morningShiftRelation = Relation.create({
      name: 'MorningShiftRelation',
      sourceRelation: factoryBatchRelation,
      sourceProperty: 'morningShiftBatches',
      targetProperty: 'morningShiftFactories',
      matchExpression: MatchExp.atom({
        key: 'shift',
        value: ['=', 'morning']
      })
    });
    
    const comprehensiveInspectionRelation = Relation.create({
      name: 'ComprehensiveInspectionRelation',
      sourceRelation: factoryBatchRelation,
      sourceProperty: 'comprehensiveInspectionBatches',
      targetProperty: 'comprehensiveInspectionFactories',
      matchExpression: MatchExp.atom({
        key: 'inspectionLevel',
        value: ['=', 'comprehensive']
      })
    });
    
    const highScoreRelation = Relation.create({
      name: 'HighScoreRelation',
      sourceRelation: factoryBatchRelation,
      sourceProperty: 'highScoreBatches',
      targetProperty: 'highScoreFactories',
      matchExpression: MatchExp.atom({
        key: 'qualityScore',
        value: ['>=', 90]
      })
    });
    
    const morningComprehensiveRelation = Relation.create({
      name: 'MorningComprehensiveRelation',
      sourceRelation: factoryBatchRelation,
      sourceProperty: 'morningComprehensiveBatches',
      targetProperty: 'morningComprehensiveFactories',
      matchExpression: MatchExp.atom({
        key: 'shift',
        value: ['=', 'morning']
      }).and({
        key: 'inspectionLevel',
        value: ['=', 'comprehensive']
      })
    });
    
    // Add computed properties to factory entity
    factoryEntity.properties.push(
      Property.create({
        name: 'allBatchesPassedQC',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: factoryBatchRelation,
          attributeQuery: ['passedQC'],
          callback: (relation: any) => relation.passedQC === true
        })
      }),
      Property.create({
        name: 'allMorningShiftPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: morningShiftRelation,
          attributeQuery: ['passedQC'],
          callback: (relation: any) => relation.passedQC === true
        })
      }),
      Property.create({
        name: 'allComprehensiveInspectionsPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: comprehensiveInspectionRelation,
          attributeQuery: ['passedQC'],
          callback: (relation: any) => relation.passedQC === true
        })
      }),
      Property.create({
        name: 'allHighScoreBatchesPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: highScoreRelation,
          attributeQuery: ['passedQC'],
          callback: (relation: any) => relation.passedQC === true
        })
      }),
      Property.create({
        name: 'morningComprehensiveAllPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: morningComprehensiveRelation,
          attributeQuery: ['passedQC'],
          callback: (relation: any) => relation.passedQC === true
        })
      })
    );
    
    const entities = [factoryEntity, productBatchEntity];
    const relations = [factoryBatchRelation, morningShiftRelation, comprehensiveInspectionRelation, 
                      highScoreRelation, morningComprehensiveRelation];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const factory1 = await system.storage.create('Factory', { 
      name: 'Plant A',
      location: 'Chicago'
    });
    
    const batch1 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B001',
      productType: 'Widget',
      manufactureDate: '2024-01-15'
    });
    
    const batch2 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B002',
      productType: 'Gadget',
      manufactureDate: '2024-01-15'
    });
    
    const batch3 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B003',
      productType: 'Widget',
      manufactureDate: '2024-01-16'
    });
    
    const batch4 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B004',
      productType: 'Gadget',
      manufactureDate: '2024-01-16'
    });
    
    // Create quality checks with different combinations
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch1,
      qualityScore: 95,
      passedQC: true,
      inspectionLevel: 'comprehensive',
      shift: 'morning',
      inspector: 'John'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch2,
      qualityScore: 88,
      passedQC: true,
      inspectionLevel: 'standard',
      shift: 'morning',
      inspector: 'Jane'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch3,
      qualityScore: 92,
      passedQC: true,
      inspectionLevel: 'comprehensive',
      shift: 'afternoon',
      inspector: 'Bob'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch4,
      qualityScore: 75,
      passedQC: false,
      inspectionLevel: 'basic',
      shift: 'night',
      inspector: 'Alice'
    });
    
    // Check computed every results
    const factoryData = await system.storage.findOne('Factory', 
      BoolExp.atom({key: 'id', value: ['=', factory1.id]}), 
      undefined, 
      ['id', 'name', 'allBatchesPassedQC', 'allMorningShiftPassed', 
       'allComprehensiveInspectionsPassed', 'allHighScoreBatchesPassed', 'morningComprehensiveAllPassed']
    );
    
    // Every returns 0 when false, 1 when true
    expect(factoryData.allBatchesPassedQC).toBe(0); // batch4 failed
    // Now filtered relations work correctly
    expect(factoryData.allMorningShiftPassed).toBe(1); // batch1 and batch2 both passed
    expect(factoryData.allComprehensiveInspectionsPassed).toBe(1); // batch1 and batch3 both passed
    expect(factoryData.allHighScoreBatchesPassed).toBe(1); // batch1(95) and batch3(92) both passed
    expect(factoryData.morningComprehensiveAllPassed).toBe(1); // only batch1, and it passed
    
    // Test dynamic updates: Fix the failed batch
    await system.storage.update('FactoryBatch',
      MatchExp.atom({key: 'source.id', value: ['=', factory1.id]})
        .and({key: 'target.id', value: ['=', batch4.id]}),
      { passedQC: true, qualityScore: 85 }
    );
    
    // Check updated results
    const factoryDataUpdated = await system.storage.findOne('Factory', 
      BoolExp.atom({key: 'id', value: ['=', factory1.id]}), 
      undefined, 
      ['id', 'allBatchesPassedQC']
    );
    
    // Every returns 1 when true due to computation implementation
    expect(factoryDataUpdated.allBatchesPassedQC).toBe(1); // Now all pass
    
    // Add a new failing morning shift batch
    const batch5 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B005',
      productType: 'Widget',
      manufactureDate: '2024-01-17'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch5,
      qualityScore: 60,
      passedQC: false,
      inspectionLevel: 'standard',
      shift: 'morning',
      inspector: 'John'
    });
    
    // Check that morning shift no longer all pass
    const factoryDataFinal = await system.storage.findOne('Factory', 
      BoolExp.atom({key: 'id', value: ['=', factory1.id]}), 
      undefined, 
      ['id', 'allBatchesPassedQC', 'allMorningShiftPassed']
    );
    
    // Every returns 0 when false
    expect(factoryDataFinal.allBatchesPassedQC).toBe(0); // batch5 failed
    // Morning shift now includes batch5 which failed
    expect(factoryDataFinal.allMorningShiftPassed).toBe(0); // batch5 failed
  }); 