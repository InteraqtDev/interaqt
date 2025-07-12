import { Controller, Entity, MonoSystem, Property, ComputationHandle, MatchExp, DataDep, PropertyDataContext, PGLiteDB, DataBasedComputation, ComputationResult } from "interaqt";
import { expect, test, describe } from "vitest";

// TestCrawlerComputed as a standard ES6 class
interface TestCrawlerComputedInstance {
  _type: string;
  _options?: { uuid?: string };
  uuid: string;
  source: string;
}

interface TestCrawlerComputedCreateArgs {
  source: string;
}

class TestCrawlerComputed implements TestCrawlerComputedInstance {
  public uuid: string;
  public _type = 'TestCrawlerComputed';
  public _options?: { uuid?: string };
  public source: string;
  
  constructor(args: TestCrawlerComputedCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9);
    this.source = args.source;
  }
  
  static isKlass = true as const;
  static displayName = 'TestCrawlerComputed';
  static instances: TestCrawlerComputedInstance[] = [];
  
  static public = {
    source: {
      type: 'string' as const,
      required: true as const
    }
  };
  
  static create(args: TestCrawlerComputedCreateArgs, options?: { uuid?: string }): TestCrawlerComputedInstance {
    const instance = new TestCrawlerComputed(args, options);
    
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, TestCrawlerComputed`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: TestCrawlerComputedInstance): string {
    return JSON.stringify({
      type: 'TestCrawlerComputed',
      options: instance._options,
      uuid: instance.uuid,
      public: { source: instance.source }
    });
  }
  
  static parse(json: string): TestCrawlerComputedInstance {
    const data = JSON.parse(json);
    return this.create(data.public, data.options);
  }
  
  static clone(instance: TestCrawlerComputedInstance, deep: boolean): TestCrawlerComputedInstance {
    return this.create({ source: instance.source });
  }
  
  static is(obj: unknown): obj is TestCrawlerComputedInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as any)._type === 'TestCrawlerComputed';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string';
  }
}

class TestCrawlerComputation implements DataBasedComputation {
    state = {}
    dataDeps: {[key: string]: DataDep} = {}
    constructor(public controller: Controller, public args: TestCrawlerComputedInstance, public dataContext: PropertyDataContext) {
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
ComputationHandle.Handles.set(TestCrawlerComputed as any, {
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
                    computation: TestCrawlerComputed.create({ source: 'url'}) as any
                }),
            ]
        })

        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({
            system: system,
            entities: [URLEntity],
            relations: [],
            activities: [],
            interactions: []
        })
        await controller.setup(true)
        const crawlerComputation = Array.from(controller.scheduler.computations.values()).find(
            computation => computation.dataContext.type === 'property' && computation.dataContext.host === URLEntity && computation.dataContext.id.name === 'content'
        )! as DataBasedComputation
        const crawlerTaskRecordName = controller.scheduler.getAsyncTaskRecordKey(crawlerComputation)


        // 1. 创建了异步任务
        const urlEntity = await system.storage.create('URL', {url: 'https://not.exist.com'})

        const crawlerTaskRecords = await system.storage.find(crawlerTaskRecordName, undefined, undefined, ['*'])
        expect(crawlerTaskRecords.length).toBe(1)
        
        // 2. 模拟外部执行了异步任务
        const randomResult = Math.random().toString()
        await system.storage.update(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {result: randomResult, status: 'success'})


        // 3. 模拟 asyncComputation demon 来处理异步任务
        const updatedCrawlerTaskRecord = await system.storage.findOne(crawlerTaskRecordName, MatchExp.atom({key: 'id', value: ['=', crawlerTaskRecords[0].id]}), {}, ['*'])
        await controller.scheduler.handleAsyncReturn(crawlerComputation, updatedCrawlerTaskRecord)
        
        // 4. 检查 content 属性是否被更新
        const entity = await system.storage.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', urlEntity.id]}), {}, ['*'])
        // const entities= await system.storage.findOne(URLEntity.name, undefined, {}, ['*'])
        expect(entity.content).toBe(`${randomResult}_crawled_by_random`)


        // test async computed with resolved return
        const url2 = await system.storage.create('URL', {url: 'https://www.interaqt.dev'})
        const entity2 = await system.storage.findOne(URLEntity.name, MatchExp.atom({key: 'id', value: ['=', url2.id]}), {}, ['*'])
        expect(entity2.content).toBe('reactive backend framwork_crawled_by_preset')

        await system.destroy()
    })
})