import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Property, Entity, Every, Dictionary, BoolExp, Any, Relation, MatchExp, DICTIONARY_RECORD } from 'interaqt';

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
}); 