
import {beforeEach, describe, expect, test} from "vitest";
import {Controller, MonoSystem, Property, Entity, Every,Dictionary,BoolExp, Interaction, KlassByName, removeAllInstance, Any} from '../index.js';

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
                attributes: ['handled'],
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
                attributes: ['handled'],
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
    debugger
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
}); 