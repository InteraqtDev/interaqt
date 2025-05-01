import {beforeEach, describe, expect, test} from "vitest";
import {Controller, MonoSystem, Property, Entity, Every,Dictionary,BoolExp, Interaction, KlassByName, removeAllInstance, Any, Relation} from '../index.js';

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
            computedData: Every.create({
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
    system.conceptClass = KlassByName
    const controller = new Controller(system,entities,[],[],[],dictionary,[])
    await controller.setup(true)


    // 获取 dictionary 的值
    const everyRequestHandled0 = await system.storage.get('state','everyRequestHandled')
    expect(everyRequestHandled0).toBeFalsy()
    // 创建两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled = await system.storage.get('state','everyRequestHandled')
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
    const everyRequestHandled2 = await system.storage.get('state','everyRequestHandled')
    expect(everyRequestHandled2).toBeTruthy()

    // 再次更新 request 的 handled 属性
    await system.storage.update('Request', idMatch1, {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled3 = await system.storage.get('state','everyRequestHandled')
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
            computedData: Any.create({
                record: requestEntity,
                attributeQuery: ['handled'],
                callback: (request:any) => {
                    return request.handled
                },
            }),
        })
    ]
    const system = new MonoSystem()
    system.conceptClass = KlassByName
    const controller = new Controller(system,entities,[],[],[],dictionary,[])
    await controller.setup(true)
    // 获取 dictionary 的值
    const anyRequestHandled0 = await system.storage.get('state','anyRequestHandled')
    expect(anyRequestHandled0).toBeFalsy()
    
    // 创建两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const anyRequestHandled = await system.storage.get('state','anyRequestHandled')
    expect(anyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    const idMatch1 = BoolExp.atom({
        key: 'id',
        value: ['=', request1.id]
    })  
    await system.storage.update('Request', idMatch1, {handled: true})

    // 获取 dictionary 的值
    const anyRequestHandled2 = await system.storage.get('state','anyRequestHandled')
    expect(anyRequestHandled2).toBeTruthy()   

    // 更新 request 的 handled 属性
    await system.storage.update('Request', idMatch1, {handled: false})

    // 获取 dictionary 的值
    const anyRequestHandled3 = await system.storage.get('state','anyRequestHandled')
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
        computedData: Any.create({
            record: requestRelation,
            attributeQuery: [['target', {attributeQuery: ['handled']}]],
            callback: (relation:any) => {
                return relation.target.handled
            },
        })
    }))

    const system = new MonoSystem()
    system.conceptClass = KlassByName
    const controller = new Controller(system,entities,relations,[],[],[],[])
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
        computedData: Every.create({
            record: requestRelation,
            attributeQuery: [['target', {attributeQuery: ['handled']}]],
            notEmpty: true,
            callback: (relation:any) => {
                return !!relation.target.handled
            },
        })
    }))

    const system = new MonoSystem() 
    system.conceptClass = KlassByName
    const controller = new Controller(system,entities,relations,[],[],[],[])
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {everyRequestHandled: false})  
    const request1 = await system.storage.create('Request', {handled: false, owner: user})      
    const request2 = await system.storage.create('Request', {handled: false, owner: user})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.everyRequestHandled).toBeFalsy()       

    // 更新 request 的 handled 属性
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user3.everyRequestHandled).toBeFalsy()       

    // 更新 request2 的 handled 属性
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request2.id]}), {handled: true})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user4 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.everyRequestHandled).toBeTruthy()   

    // 更新 request2 的 handled 属性为 false
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request2.id]}), {handled: false})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user5 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.everyRequestHandled).toBeFalsy()

    // 删除 request2
    await system.storage.delete('Request', BoolExp.atom({key: 'id', value: ['=', request2.id]}))

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user6 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user6.everyRequestHandled).toBeTruthy()
    
  });
}); 