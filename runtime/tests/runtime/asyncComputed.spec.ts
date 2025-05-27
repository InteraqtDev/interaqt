import { Controller, Entity, MonoSystem, Property, ComputedDataHandle, createClass, AsyncDataBasedComputation, MatchExp, DataDep, PropertyDataContext, KlassInstance , PGLiteDB} from "@";
import { expect, test, describe } from "vitest";

const TestCrawlerComputed = createClass({
    name: 'TestCrawlerComputed',
    public: {
        source: {
            type: 'string',
            required: true
        }
    }
})

class TestCrawlerComputation implements AsyncDataBasedComputation {
    state = {}
    dataDeps: {[key: string]: DataDep} = {}
    constructor(public controller: Controller, public args: KlassInstance<typeof TestCrawlerComputed>, public dataContext: PropertyDataContext) {
        // 声明数据依赖
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [this.args.source]
            }
        }
    }
    compute(...args: any[]) {
        return Promise.resolve({name:'John'})
    }
    asyncReturnResult(result:any, args:any) {
        return Promise.resolve(`${result}_crawled_by_${args.name}`)
    }
}

// 全局注册可用了
ComputedDataHandle.Handles.set(TestCrawlerComputed, {
    // global: TestCrawlerComputation,
    property: TestCrawlerComputation
})


describe('async computed', () => {
    test('test', async () => {
        
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
        })

        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller(system, [URLEntity], [], [], [], [], [])
        await controller.setup(true)
        const crawlerComputation = Array.from(controller.scheduler.computations.values()).find(
            computation => computation.dataContext.type === 'property' && computation.dataContext.host === URLEntity && computation.dataContext.id === 'content'
        )! as AsyncDataBasedComputation
        const crawlerTaskRecordName = controller.scheduler.getAsyncTaskRecordKey(crawlerComputation)


        // 1. 创建了异步任务 
        const url = await system.storage.create('URL', {url: 'https://www.interaqt.dev'})

        const crawlerTaskRecords = await system.storage.find(crawlerTaskRecordName)
        expect(crawlerTaskRecords.length).toBe(1)
        
        // 2. 模拟外部执行了异步任务
        const randomResult = Math.random().toString()
        await system.storage.update(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {result: randomResult, status: 'success'})


        // 3. 模拟 asyncComputation demon 来处理异步任务
        const updatedCrawlerTaskRecord = await system.storage.findOne(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*'])
        await controller.scheduler.handleAsyncReturn(crawlerComputation, updatedCrawlerTaskRecord)
        
        // 4. 检查 content 属性是否被更新
        const entity = await system.storage.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*'])
        expect(entity.content).toBe(`${randomResult}_crawled_by_John`)

        await system.destroy()
    })
})