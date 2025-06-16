import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  MonoSystem,
  Property,
  ComputedDataHandle,
  createClass,
  MatchExp,
  DataDep,
  GlobalDataContext,
  KlassInstance,
  PGLiteDB,
  DataBasedComputation,
  ComputationResult,
  Dictionary
} from "@";

// 创建一个全局异步计算的类
const GlobalWeatherComputed = createClass({
  name: 'GlobalWeatherComputed',
  public: {
    city: {
      type: 'string',
      required: true
    }
  }
})

// 实现全局异步计算
class GlobalWeatherComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof GlobalWeatherComputed>, 
    public dataContext: GlobalDataContext
  ) {
    // Global 计算可以依赖实体数据
    this.dataDeps = {}
  }
  
  async compute() {
    // 模拟需要异步获取天气数据
    return ComputationResult.async({
      city: this.args.city,
      timestamp: Date.now()
    })
  }
  
  async asyncReturn(result: any, args: any) {
    // 模拟处理异步返回的天气数据
    return {
      city: args.city,
      temperature: result.temperature || 25,
      weather: result.weather || 'sunny',
      lastUpdate: args.timestamp
    }
  }
}

// 注册全局计算处理器
ComputedDataHandle.Handles.set(GlobalWeatherComputed, {
  global: GlobalWeatherComputation
})

describe('Global async computed', () => {
  test('should handle global async computation with entity dependencies', async () => {
    // 创建一个依赖实体数据的全局异步计算
    const GlobalStatsComputed = createClass({
      name: 'GlobalStatsComputed',
      public: {
        entityName: {
          type: 'string',
          required: true
        }
      }
    });
    
    // 创建产品实体 - 必须在 GlobalStatsComputation 之前定义
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    class GlobalStatsComputation implements DataBasedComputation {
      state = {}
      dataDeps: {[key: string]: DataDep} = {}
      
      constructor(
        public controller: Controller, 
        public args: KlassInstance<typeof GlobalStatsComputed>, 
        public dataContext: GlobalDataContext
      ) {
        // 依赖产品实体的数据 - 使用外部定义的 productEntity
        this.dataDeps = {
          products: {
            type: 'records',
            source: productEntity,
            attributeQuery: ['*']
          }
        }
      }
      
      async compute(deps: {products: any[]}) {
        // 计算需要异步处理
        const totalPrice = deps.products.reduce((sum, p) => sum + (p.price || 0), 0);
        const avgPrice = deps.products.length > 0 ? totalPrice / deps.products.length : 0;
        
        return ComputationResult.async({
          count: deps.products.length,
          totalPrice: totalPrice,
          avgPrice: avgPrice,
          requestTime: Date.now()
        })
      }
      
      async asyncReturn(result: any, args: any) {
        // 模拟复杂的统计计算
        return {
          totalCount: args.count,
          totalPrice: args.totalPrice,
          averagePrice: result.processedAvgPrice || args.avgPrice,
          lastCalculated: args.requestTime
        }
      }
    }
    
    ComputedDataHandle.Handles.set(GlobalStatsComputed, {
      global: GlobalStatsComputation
    });
    
    const entities = [productEntity];
    
    // 创建全局统计字典项
    const dictionary = [
      Dictionary.create({
        name: 'productStats',
        type: 'object',
        collection: false,
        computedData: GlobalStatsComputed.create({
          entityName: 'Product'
        })
      })
    ];
    
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // 获取统计计算的异步任务
    const statsComputation = Array.from(controller.scheduler.computations.values()).find(
      computation => computation.dataContext.type === 'global' && computation.dataContext.id === 'productStats'
    )! as DataBasedComputation;
    
    const statsTaskRecordName = controller.scheduler.getAsyncTaskRecordKey(statsComputation);
    
    // 初始化时应该有一个任务（因为没有产品）
    let statsTasks = await system.storage.find(statsTaskRecordName, undefined, undefined, ['*']);
    expect(statsTasks.length).toBe(0);
    
    
    // 创建第一个产品
    await system.storage.create('Product', {name: 'Product A', price: 100});
    
    // 应该触发新的计算任务
    statsTasks = await system.storage.find(statsTaskRecordName, undefined, undefined, ['*']);
    expect(statsTasks.length).toBe(1);
    const task1 = statsTasks[0];
    expect(task1.args.count).toBe(1);
    expect(task1.args.totalPrice).toBe(100);
    
    // 处理第一个产品的任务
    await system.storage.update(
      statsTaskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task1.id]}),
      {
        result: { processedAvgPrice: 100 },
        status: 'success'
      }
    );
    await controller.scheduler.handleAsyncReturn(statsComputation, {id: task1.id});
    
    // 检查全局统计状态
    let productStats = await system.storage.get('state', 'productStats');
    expect(productStats).toMatchObject({
      totalCount: 1,
      totalPrice: 100,
      averagePrice: 100
    });
    
    // 创建第二个产品
    await system.storage.create('Product', {name: 'Product B', price: 200});
    
    // 应该触发新的计算任务
    statsTasks = await system.storage.find(statsTaskRecordName, undefined, undefined, ['*']);
    expect(statsTasks.length).toBe(2);
    const task2 = statsTasks[1];
    expect(task2.args.count).toBe(2);
    expect(task2.args.totalPrice).toBe(300);
    expect(task2.args.avgPrice).toBe(150);
    
    // 处理第二个产品的任务
    await system.storage.update(
      statsTaskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task2.id]}),
      {
        result: { processedAvgPrice: 150 },
        status: 'success'
      }
    );
    await controller.scheduler.handleAsyncReturn(statsComputation, {id: task2.id});
    
    // 检查更新后的全局统计状态
    productStats = await system.storage.get('state', 'productStats');
    expect(productStats).toMatchObject({
      totalCount: 2,
      totalPrice: 300,
      averagePrice: 150,
      lastCalculated: expect.any(Number)
    });
    
    // 创建第三个产品，测试是否继续响应
    await system.storage.create('Product', {name: 'Product C', price: 300});
    
    // 应该触发新的计算任务
    statsTasks = await system.storage.find(statsTaskRecordName, undefined, undefined, ['*']);
    expect(statsTasks.length).toBe(3);
    const task3 = statsTasks[2];
    expect(task3.args.count).toBe(3);
    expect(task3.args.totalPrice).toBe(600);
    expect(task3.args.avgPrice).toBe(200);
    
    await system.destroy();
  });
}); 