import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  MonoSystem,
  Property, MatchExp,
  DataDep,
  EntityDataContext,
  PGLiteDB,
  DataBasedComputation, ComputationResultAsync
} from "interaqt";

// EntityRecommendationComputed as a standard ES6 class
interface EntityRecommendationComputedInstance {
  _type: string;
  _options?: { uuid?: string };
  uuid: string;
  category: string;
}

interface EntityRecommendationComputedCreateArgs {
  category: string;
}

class EntityRecommendationComputed implements EntityRecommendationComputedInstance {
  public uuid: string;
  public _type = 'EntityRecommendationComputed';
  public _options?: { uuid?: string };
  public category: string;
  
  constructor(args: EntityRecommendationComputedCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9);
    this.category = args.category;
  }
  
  static isKlass = true as const;
  static displayName = 'EntityRecommendationComputed';
  static instances: EntityRecommendationComputedInstance[] = [];
  
  static public = {
    category: {
      type: 'string' as const,
      required: true as const
    }
  };
  
  static create(args: EntityRecommendationComputedCreateArgs, options?: { uuid?: string }): EntityRecommendationComputedInstance {
    const instance = new EntityRecommendationComputed(args, options);
    
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, EntityRecommendationComputed`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: EntityRecommendationComputedInstance): string {
    return JSON.stringify({
      type: 'EntityRecommendationComputed',
      options: instance._options,
      uuid: instance.uuid,
      public: { category: instance.category }
    });
  }
  
  static parse(json: string): EntityRecommendationComputedInstance {
    const data = JSON.parse(json);
    return this.create(data.public, data.options);
  }
  
  static clone(instance: EntityRecommendationComputedInstance, deep: boolean): EntityRecommendationComputedInstance {
    return this.create({ category: instance.category });
  }
  
  static is(obj: unknown): obj is EntityRecommendationComputedInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as any)._type === 'EntityRecommendationComputed';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string';
  }
}

// 实现实体级别异步计算
class EntityRecommendationComputation implements DataBasedComputation {
  static computationType = EntityRecommendationComputed
  static contextType = 'entity' as const
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: EntityRecommendationComputedInstance, 
    public dataContext: EntityDataContext
  ) {
    // Entity 计算可以依赖其他实体的数据
    this.dataDeps = {
      products: {
        type: 'records',
        source: Entity.create({name: 'Product'}),
        attributeQuery: ['*']
      }
    }
  }
  
  async compute(deps: {products: any[]}) {
    // 返回异步任务
    const filteredProducts = deps.products.filter(p => p.category === this.args.category)
    return new ComputationResultAsync({
      category: this.args.category,
      productCount: filteredProducts.length,
      productIds: filteredProducts.map(p => p.id)
    })
  }
  
  async asyncReturn(result: any, args: any) {
    // 模拟异步推荐算法
    const recommendations = args.productIds.map((id: string, index: number) => ({
      productId: id,
      score: `${0.9 - index * 0.1}`,
      reason: `Recommended based on ${args.category} category`
    }))
    
    // 返回推荐结果作为实体数据
    return recommendations
  }
}

// Export custom computation handle
const EntityRecommendationHandles = [EntityRecommendationComputation];

describe('Entity async computed', () => {
  test('should handle entity async computation correctly', async () => {
    // 创建产品实体
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'category', type: 'string'}),
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    // 创建推荐实体，使用异步计算
    const recommendationEntity = Entity.create({
      name: 'Recommendation',
      properties: [
        Property.create({name: 'productId', type: 'string'}),
        Property.create({name: 'score', type: 'string'}),
        Property.create({name: 'reason', type: 'string'})
      ],
      computation: EntityRecommendationComputed.create({
        category: 'electronics'
      }) as any
    });
    
    const entities = [productEntity, recommendationEntity];
    const relations: any[] = [];
    
    // 设置系统和控制器
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: [],
        computations: EntityRecommendationHandles
    });
    await controller.setup(true);
    
    // 获取实体计算实例
    const recommendationComputation = Array.from(controller.scheduler.computations.values()).find(
      computation => computation.dataContext.type === 'entity' && 
                    (computation.dataContext as EntityDataContext).id.name === 'Recommendation'
    )! as DataBasedComputation;
    
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(recommendationComputation);
    
    // 初始时不应该有任务
    let tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);
    expect(tasks.length).toBe(0);
    
    // 创建一些产品
    const product1 = await system.storage.create('Product', {
      name: 'Laptop',
      category: 'electronics',
      price: 1000
    });
    
    const product2 = await system.storage.create('Product', {
      name: 'Phone',
      category: 'electronics',
      price: 800
    });
    
    const product3 = await system.storage.create('Product', {
      name: 'Book',
      category: 'books',
      price: 20
    });
    
    // 应该触发异步计算任务（每个产品创建都会触发一次）
    tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);
    expect(tasks.length).toBe(3); // 3个产品创建，3个任务
    // 找到最后一个任务，它应该包含所有产品
    const task = tasks[tasks.length - 1];
    expect(task.args.category).toBe('electronics');
    expect(task.args.productCount).toBe(2);
    expect(task.args.productIds).toContain(product1.id);
    expect(task.args.productIds).toContain(product2.id);
    expect(task.args.productIds).not.toContain(product3.id);
    
    // 模拟异步服务返回推荐结果
    const recommendationData = [
      { productId: product1.id, score: '0.9', reason: 'Top electronics product' },
      { productId: product2.id, score: '0.8', reason: 'Popular electronics product' }
    ];
    
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        result: recommendationData,
        status: 'success'
      }
    );
    
    // 处理异步返回
    await controller.scheduler.handleAsyncReturn(recommendationComputation, {id: task.id});
    
    // 检查推荐结果是否被正确创建
    const recommendations = await system.storage.find('Recommendation', undefined, undefined, ['*']);
    console.log('Recommendations created:', recommendations);
    expect(recommendations.length).toBe(2);
    
    const rec1 = recommendations.find(r => r.productId === String(product1.id));
    expect(rec1).toBeDefined();
    expect(rec1.score).toBe('0.9');
    expect(rec1.reason).toBe('Recommended based on electronics category');
    
    const rec2 = recommendations.find(r => r.productId === String(product2.id));
    expect(rec2).toBeDefined();
    expect(rec2.score).toBe('0.8');
    expect(rec2.reason).toBe('Recommended based on electronics category');
    
    // 添加新的电子产品应该触发新的计算
    const product4 = await system.storage.create('Product', {
      name: 'Tablet',
      category: 'electronics',
      price: 600
    });
    
    // 应该有新的任务
    tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);
    expect(tasks.length).toBe(4); // 又创建了一个产品，总共4个任务
    const newTask = tasks[tasks.length - 1];
    expect(newTask.args.productCount).toBe(3);
    expect(newTask.args.productIds).toContain(product4.id);
    
    await system.destroy();
  });
}); 