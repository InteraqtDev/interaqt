import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  MonoSystem,
  Property,
  ComputationHandle,
  createClass,
  MatchExp,
  DataDep,
  EntityDataContext,
  KlassInstance,
  PGLiteDB,
  DataBasedComputation,
  ComputationResult,
  ComputationResultAsync,
  ComputationResultResolved,
  Relation
} from "@";

// 创建一个实体级别异步计算的类
const EntityRecommendationComputed = createClass({
  name: 'EntityRecommendationComputed',
  public: {
    category: {
      type: 'string',
      required: true
    }
  }
})

// 实现实体级别异步计算
class EntityRecommendationComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof EntityRecommendationComputed>, 
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

// 注册计算处理器
ComputationHandle.Handles.set(EntityRecommendationComputed, {
  entity: EntityRecommendationComputation
})

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
      })
    });
    
    const entities = [productEntity, recommendationEntity];
    const relations: any[] = [];
    
    // 设置系统和控制器
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller(system, entities, relations, [], [], [], []);
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