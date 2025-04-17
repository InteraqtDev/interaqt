
import {beforeEach, describe, expect, test} from "vitest";
import {Controller, MonoSystem, Property, Entity, Every,Dictionary,BoolExp, Interaction, KlassByName, removeAllInstance} from '../index.js';

// 创建简单测试环境，直接测试 EveryHandle 的具体方法
describe('Every computed handle', () => {
    let system: MonoSystem
    let createRequestUUID: string
    let approveRequestUUID: string
    let getMyPendingRequestsUUID: string
    let controller: Controller

    let userAId: string
    let userBId: string
    let userCId: string
    beforeEach(async () => {
        removeAllInstance()
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
                    match: (request:any) => {
                        return request.handled
                    }
                })
            })
        ]
        system = new MonoSystem()
        system.conceptClass = KlassByName
        controller = new Controller(
            system,
            entities,
            [],
            [],
            [],
            dictionary,
            []
        )
        await controller.setup(true)
        
    })
  
  test('should be true when match count equals total count', async () => {
    // 敞亮两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled = await system.storage.get('state','everyRequestHandled')
    expect(everyRequestHandled).toBe(false)

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
    expect(everyRequestHandled2).toBe(true)
  });
}); 