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
  RelationDataContext,
  KlassInstance,
  PGLiteDB,
  DataBasedComputation,
  ComputationResult,
  ComputationResultAsync,
  ComputationResultResolved,
  Relation
} from "@";

// 创建一个关系级别异步计算的类
const RelationScoreComputed = createClass({
  name: 'RelationScoreComputed',
  public: {
    algorithm: {
      type: 'string',
      required: true
    }
  }
})

// 实现关系级别异步计算
class RelationScoreComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof RelationScoreComputed>, 
    public dataContext: RelationDataContext
  ) {
    // Relation 计算需要依赖关系本身的数据
    this.dataDeps = {
      relations: {
        type: 'records',
        source: dataContext.id,
        attributeQuery: ['*']
      }
    }
  }
  
  async compute(deps: {}) {
    // 返回异步任务，计算关系的分数
    return new ComputationResultAsync({
      algorithm: this.args.algorithm,
      timestamp: Math.floor(Date.now() / 1000) // 使用秒级时间戳
    })
  }
  
  async asyncReturn(result: any, args: any) {
    // 模拟异步算法计算关系分数
    // 这里可以是复杂的推荐算法、相似度计算等
    const scores = [];
    
    // 模拟计算10个关系的分数
    for (let i = 0; i < 10; i++) {
      scores.push({
        userId: `user${i}`,
        itemId: `item${i}`,
        score: String(Math.random()),
        algorithm: args.algorithm,
        computedAt: String(args.timestamp)
      });
    }
    
    // 返回关系数据
    return scores;
  }
}

// 注册计算处理器
ComputationHandle.Handles.set(RelationScoreComputed, {
  relation: RelationScoreComputation
})

describe('Relation async computed', () => {
  test('should handle relation async computation correctly', async () => {
    // 创建用户实体
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'}),
        Property.create({name: 'age', type: 'number'})
      ]
    });
    
    // 创建物品实体
    const itemEntity = Entity.create({
      name: 'Item',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'category', type: 'string'})
      ]
    });
    
    // 创建用户-物品关系，使用异步计算
    const userItemRelation = Relation.create({
      name: 'UserItem',
      source: userEntity,
      sourceProperty: 'items',
      target: itemEntity,
      targetProperty: 'users',
      type: 'n:n',
      properties: [
        Property.create({name: 'userId', type: 'string'}),
        Property.create({name: 'itemId', type: 'string'}),
        Property.create({name: 'score', type: 'string'}),
        Property.create({name: 'algorithm', type: 'string'}),
        Property.create({name: 'computedAt', type: 'string'})
      ],
      computation: RelationScoreComputed.create({
        algorithm: 'collaborative_filtering'
      })
    });
    
    const entities = [userEntity, itemEntity];
    const relations = [userItemRelation];
    
    // 设置系统和控制器
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // 获取关系计算实例
    console.log('All computations:', Array.from(controller.scheduler.computations).map(c => ({
      type: c.dataContext.type,
      id: c.dataContext.type === 'relation' ? (c.dataContext as RelationDataContext).id.name : c.dataContext.id
    })));
    
    const relationComputation = Array.from(controller.scheduler.computations).find(
      computation => computation.dataContext.type === 'relation' && 
                    (computation.dataContext as RelationDataContext).id.name === 'User_items_users_Item'
    ) as DataBasedComputation;
    
    if (!relationComputation) {
      throw new Error('Relation computation not found');
    }
    
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(relationComputation);
    
    // 初始时不应该有任务
    let tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);
    expect(tasks.length).toBe(0);
    
    // 创建一些用户和物品
    const user1 = await system.storage.create('User', {
      username: 'alice',
      age: 25
    });
    
    const item1 = await system.storage.create('Item', {
      name: 'Book A',
      category: 'books'
    });
    
    // 创建一个关系来触发计算
    const userItem1 = await system.storage.create('User_items_users_Item', {
      source: user1.id,
      target: item1.id,
      userId: user1.id,
      itemId: item1.id
    });
    
    // 创建关系应该触发关系计算
    tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);
    expect(tasks.length).toBeGreaterThan(0);
    const task = tasks[tasks.length - 1];
    expect(task.args.algorithm).toBe('collaborative_filtering');
    
    // 模拟异步服务返回关系分数
    const relationScores = [
      { userId: 'user1', itemId: 'item1', score: '0.95', algorithm: 'collaborative_filtering', computedAt: '1234567890' },
      { userId: 'user2', itemId: 'item2', score: '0.87', algorithm: 'collaborative_filtering', computedAt: '1234567890' }
    ];
    
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        result: relationScores,
        status: 'success'
      }
    );
    
    // 处理异步返回
    await controller.scheduler.handleAsyncReturn(relationComputation, {id: task.id});
    
    // 检查关系是否被正确更新
    const userItemRelations = await system.storage.find('User_items_users_Item', undefined, undefined, ['*']);
    console.log('UserItem relations after computation:', userItemRelations);
    
    // 应该有 10 个关系：完全替换，只有计算生成的关系
    expect(userItemRelations.length).toBe(10);
    
    // 检查计算生成的关系
    const computedRels = userItemRelations.filter(r => r.algorithm === 'collaborative_filtering');
    expect(computedRels.length).toBe(10);
    expect(computedRels[0].score).toBeDefined();
    expect(computedRels[0].computedAt).toBeDefined();
    
    await system.destroy();
  });
}); 