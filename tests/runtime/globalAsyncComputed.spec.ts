import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  MonoSystem,
  Property, MatchExp,
  DataDep,
  GlobalDataContext,
  PGLiteDB,
  DataBasedComputation,
  ComputationResult,
  Dictionary,
} from "interaqt";

// GlobalWeatherComputed as a standard ES6 class
interface GlobalWeatherComputedInstance {
  _type: string;
  _options?: { uuid?: string };
  uuid: string;
  city: string;
}

interface GlobalWeatherComputedCreateArgs {
  city: string;
}

class GlobalWeatherComputed implements GlobalWeatherComputedInstance {
  public uuid: string;
  public _type = 'GlobalWeatherComputed';
  public _options?: { uuid?: string };
  public city: string;
  
  constructor(args: GlobalWeatherComputedCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9);
    this.city = args.city;
  }
  
  static isKlass = true as const;
  static displayName = 'GlobalWeatherComputed';
  static instances: GlobalWeatherComputedInstance[] = [];
  
  static public = {
    city: {
      type: 'string' as const,
      required: true as const
    }
  };
  
  static create(args: GlobalWeatherComputedCreateArgs, options?: { uuid?: string }): GlobalWeatherComputedInstance {
    const instance = new GlobalWeatherComputed(args, options);
    
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, GlobalWeatherComputed`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: GlobalWeatherComputedInstance): string {
    return JSON.stringify({
      type: 'GlobalWeatherComputed',
      options: instance._options,
      uuid: instance.uuid,
      public: { city: instance.city }
    });
  }
  
  static parse(json: string): GlobalWeatherComputedInstance {
    const data = JSON.parse(json);
    return this.create(data.public, data.options);
  }
  
  static clone(instance: GlobalWeatherComputedInstance, deep: boolean): GlobalWeatherComputedInstance {
    return this.create({ city: instance.city });
  }
  
  static is(obj: unknown): obj is GlobalWeatherComputedInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as any)._type === 'GlobalWeatherComputed';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string';
  }
}

// 实现全局异步计算
class GlobalWeatherComputation implements DataBasedComputation {
  static computationType = GlobalWeatherComputed
  static contextType = 'global' as const
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: GlobalWeatherComputedInstance, 
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

// Export custom computation handle
const GlobalWeatherHandles = [GlobalWeatherComputation];

describe('Global async computed', () => {
  test('should handle global async computation with entity dependencies', async () => {
    // GlobalStatsComputed as a standard ES6 class
    interface GlobalStatsComputedInstance {
      _type: string;
      _options?: { uuid?: string };
      uuid: string;
      entityName: string;
    }
    
    interface GlobalStatsComputedCreateArgs {
      entityName: string;
    }
    
    class GlobalStatsComputed implements GlobalStatsComputedInstance {
      public uuid: string;
      public _type = 'GlobalStatsComputed';
      public _options?: { uuid?: string };
      public entityName: string;
      
      constructor(args: GlobalStatsComputedCreateArgs, options?: { uuid?: string }) {
        this._options = options;
        this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9);
        this.entityName = args.entityName;
      }
      
      static isKlass = true as const;
      static displayName = 'GlobalStatsComputed';
      static instances: GlobalStatsComputedInstance[] = [];
      
      static public = {
        entityName: {
          type: 'string' as const,
          required: true as const
        }
      };
      
      static create(args: GlobalStatsComputedCreateArgs, options?: { uuid?: string }): GlobalStatsComputedInstance {
        const instance = new GlobalStatsComputed(args, options);
        
        const existing = this.instances.find(i => i.uuid === instance.uuid);
        if (existing) {
          throw new Error(`duplicate uuid in options ${instance.uuid}, GlobalStatsComputed`);
        }
        
        this.instances.push(instance);
        return instance;
      }
      
      static stringify(instance: GlobalStatsComputedInstance): string {
        return JSON.stringify({
          type: 'GlobalStatsComputed',
          options: instance._options,
          uuid: instance.uuid,
          public: { entityName: instance.entityName }
        });
      }
      
      static parse(json: string): GlobalStatsComputedInstance {
        const data = JSON.parse(json);
        return this.create(data.public, data.options);
      }
      
      static clone(instance: GlobalStatsComputedInstance, deep: boolean): GlobalStatsComputedInstance {
        return this.create({ entityName: instance.entityName });
      }
      
      static is(obj: unknown): obj is GlobalStatsComputedInstance {
        return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as any)._type === 'GlobalStatsComputed';
      }
      
      static check(data: unknown): boolean {
        return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string';
      }
    }
    
    // 创建产品实体 - 必须在 GlobalStatsComputation 之前定义
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    class GlobalStatsComputation implements DataBasedComputation {
      static computationType = GlobalStatsComputed
      static contextType = 'global' as const
      state = {}
      dataDeps: {[key: string]: DataDep} = {}
      
      constructor(
        public controller: Controller, 
        public args: GlobalStatsComputedInstance, 
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
    
    // Export custom computation handle
    const GlobalStatsHandles = [GlobalStatsComputation];
    
    const entities = [productEntity];
    
    // 创建全局统计字典项
    const dictionary = [
      Dictionary.create({
        name: 'productStats',
        type: 'object',
        collection: false,
        computation: GlobalStatsComputed.create({
          entityName: 'Product'
        }) as any
      })
    ];
    
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: [],
        computations: GlobalStatsHandles
    });
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
    let productStats = await system.storage.dict.get('productStats');
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
    productStats = await system.storage.dict.get('productStats');
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