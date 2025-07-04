import { Controller, Entity, MonoSystem, Property, ComputationHandle, createClass, MatchExp, DataDep, PropertyDataContext, KlassInstance, PGLiteDB, DataBasedComputation, ComputationResult } from "@";
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

class TestCrawlerComputation implements DataBasedComputation {
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
    async compute({_current}: {_current:any}) {
        if (_current.url === 'https://www.interaqt.dev') {
            return ComputationResult.resolved('reactive backend framwork', {type: 'preset'})
        }
        return ComputationResult.async({type: 'random'})
    }
    async asyncReturn(result:any, args:any) {
        return `${result}_crawled_by_${args.type}`
    }
}

// 全局注册可用了
ComputationHandle.Handles.set(TestCrawlerComputed, {
    // global: TestCrawlerComputation,
    property: TestCrawlerComputation
})


describe('async computed', () => {
    test('test basic async computed', async () => {
        
        const URLEntity = Entity.create({
            name: 'URL',
            properties: [
                Property.create({name: 'url', type: 'string'}),
                Property.create({
                    name: 'content', 
                    type: 'string',
                    computation: TestCrawlerComputed.create({ source: 'url'})
                }),
            ]
        })

        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller(system, [URLEntity], [], [], [], [], [])
        await controller.setup(true)
        const crawlerComputation = Array.from(controller.scheduler.computations.values()).find(
            computation => computation.dataContext.type === 'property' && computation.dataContext.host === URLEntity && computation.dataContext.id.name === 'content'
        )! as DataBasedComputation
        const crawlerTaskRecordName = controller.scheduler.getAsyncTaskRecordKey(crawlerComputation)


        // 1. 创建了异步任务 
<<<<<<< Updated upstream
        const urlEntity = await system.storage.create('URL', {url: 'https://not.exist.com'})

        const crawlerTaskRecords = await system.storage.find(crawlerTaskRecordName, undefined, undefined, ['*'])
=======
        const url = await system.entities.create('URL', {url: 'https://not.exist.com'})

        const crawlerTaskRecords = await system.entities.find(crawlerTaskRecordName)
>>>>>>> Stashed changes
        expect(crawlerTaskRecords.length).toBe(1)
        
        // 2. 模拟外部执行了异步任务
        const randomResult = Math.random().toString()
        await system.entities.update(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {result: randomResult, status: 'success'})


        // 3. 模拟 asyncComputation demon 来处理异步任务
        const updatedCrawlerTaskRecord = await system.entities.findOne(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*'])
        await controller.scheduler.handleAsyncReturn(crawlerComputation, updatedCrawlerTaskRecord)
        
        // 4. 检查 content 属性是否被更新
<<<<<<< Updated upstream
        const entity = await system.storage.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', urlEntity.id]}), {}, ['*'])
        // const entities= await system.storage.findOne(URLEntity.name, undefined, {}, ['*'])
=======
        const entity = await system.entities.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*'])
>>>>>>> Stashed changes
        expect(entity.content).toBe(`${randomResult}_crawled_by_random`)


        // test async computed with resolved return
        const url2 = await system.entities.create('URL', {url: 'https://www.interaqt.dev'})
        const entity2 = await system.entities.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', url2.id]}), {}, ['*'])
        expect(entity2.content).toBe('reactive backend framwork_crawled_by_preset')

        await system.destroy()
    })
})