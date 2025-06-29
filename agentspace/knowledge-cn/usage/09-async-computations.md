# 9. 如何使用异步计算

异步计算是 interaqt 框架的高级特性，允许在响应式计算过程中调用外部 API、执行耗时操作或进行复杂的数据处理。本章将详细介绍如何在不同层次上实现和使用异步计算。

## 9.1 理解异步计算场景

### 9.1.1 何时需要异步计算

异步计算适用于以下场景：

- **外部 API 调用**：需要从第三方服务获取数据
- **复杂算法处理**：需要大量计算时间的操作
- **机器学习推理**：调用 AI 模型进行预测
- **数据聚合分析**：需要处理大量数据的统计计算
- **文件处理**：图片处理、文档转换等耗时操作

### 9.1.2 异步计算的优势

```typescript
// 传统同步计算的限制
class SyncComputation {
  compute(deps: any) {
    // 这里不能调用异步操作
    // const result = await fetchFromAPI(); // ❌ 不支持
    return simpleCalculation(deps);
  }
}

// 异步计算的优势
class AsyncComputation {
  async compute(deps: any) {
    // ✅ 支持异步操作
    const externalData = await fetchFromAPI();
    const result = await complexAnalysis(deps, externalData);
    return ComputationResult.async(result);
  }
  
  async asyncReturn(result: any, args: any) {
    // ✅ 处理异步返回结果
    return processAsyncResult(result, args);
  }
}
```

### 9.1.3 支持的计算类型

框架支持三种类型的异步计算：

1. **Global 异步计算**：全局级别的计算，结果存储在 Dictionary 中
2. **Entity 异步计算**：实体级别的计算，为实体生成数据
3. **Relation 异步计算**：关系级别的计算，为关系生成数据

## 9.2 实现全局异步计算

### 9.2.1 基本概念

全局异步计算用于处理系统级别的数据，如全局统计、配置更新、外部数据同步等。

### 9.2.2 创建全局异步计算类

```typescript
import { createClass, ComputationResult } from 'interaqt';

// 定义全局天气计算类
const GlobalWeatherComputed = createClass({
  name: 'GlobalWeatherComputed',
  public: {
    city: {
      type: 'string',
      required: true
    },
    apiKey: {
      type: 'string',
      required: false
    }
  }
});

// 实现全局天气计算
class GlobalWeatherComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof GlobalWeatherComputed>, 
    public dataContext: GlobalDataContext
  ) {
    // 全局计算可以依赖实体数据
    this.dataDeps = {
      // 可以依赖其他实体的数据
      locations: {
        type: 'records',
        source: locationEntity,
        attributeQuery: ['*']
      }
    }
  }
  
  async compute(deps: {locations: any[]}) {
    // 返回异步任务，包含调用外部 API 所需的参数
    return ComputationResult.async({
      city: this.args.city,
      locationCount: deps.locations.length,
      timestamp: Date.now(),
      apiKey: this.args.apiKey
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // 处理外部 API 返回的天气数据
    return {
      city: args.city,
      temperature: result.temperature || 25,
      weather: result.weather || 'sunny',
      humidity: result.humidity || 60,
      lastUpdate: args.timestamp,
      locationCount: args.locationCount
    };
  }
}
```

### 9.2.3 注册计算处理器

```typescript
import { ComputedDataHandle } from 'interaqt';

// 注册全局计算处理器
ComputedDataHandle.Handles.set(GlobalWeatherComputed, {
  global: GlobalWeatherComputation
});
```

### 9.2.4 在 Dictionary 中使用

```typescript
// 创建全局天气字典项
const weatherDictionary = Dictionary.create({
  name: 'currentWeather',
  type: 'object',
  collection: false,
  computedData: GlobalWeatherComputed.create({
    city: 'Beijing',
    apiKey: process.env.WEATHER_API_KEY
  })
});

// 在系统中注册
const controller = new Controller(
  system, 
  entities, 
  relations, 
  [], 
  [], 
  [weatherDictionary], // 字典数组
  []
);
```

### 9.2.5 处理异步任务

```typescript
// 获取异步任务
const weatherComputation = Array.from(controller.scheduler.computations.values())
  .find(comp => comp.dataContext.type === 'global' && 
               comp.dataContext.id === 'currentWeather') as DataBasedComputation;

const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(weatherComputation);

// 查询待处理的任务
const pendingTasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);

for (const task of pendingTasks) {
  try {
    // 调用外部天气 API
    const weatherData = await fetchWeatherAPI(task.args.city, task.args.apiKey);
    
    // 更新任务状态为成功
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        result: weatherData,
        status: 'success'
      }
    );
    
    // 触发异步返回处理
    await controller.scheduler.handleAsyncReturn(weatherComputation, {id: task.id});
    
  } catch (error) {
    // 处理错误情况
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        error: error.message,
        status: 'failed'
      }
    );
  }
}

// 获取计算结果
const currentWeather = await system.storage.get('state', 'currentWeather');
console.log('Current weather:', currentWeather);
```

## 9.3 实现实体异步计算

### 9.3.1 使用场景

实体异步计算用于为实体生成基于外部数据的属性，如：
- 产品推荐
- 用户画像分析
- 内容个性化
- 风险评估

### 9.3.2 创建实体异步计算

```typescript
// 定义产品推荐计算类
const ProductRecommendationComputed = createClass({
  name: 'ProductRecommendationComputed',
  public: {
    algorithm: {
      type: 'string',
      required: true
    },
    maxResults: {
      type: 'number',
      required: false
    }
  }
});

// 实现产品推荐计算
class ProductRecommendationComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof ProductRecommendationComputed>, 
    public dataContext: EntityDataContext
  ) {
    // 依赖用户的购买历史和产品数据
    this.dataDeps = {
      purchases: {
        type: 'records',
        source: purchaseRelation,
        attributeQuery: ['*']
      },
      products: {
        type: 'records',
        source: productEntity,
        attributeQuery: ['*']
      }
    }
  }
  
  async compute(deps: {purchases: any[], products: any[]}) {
    const maxResults = this.args.maxResults || 10;
    
    // 返回异步任务参数
    return ComputationResult.async({
      algorithm: this.args.algorithm,
      purchaseHistory: deps.purchases.map(p => ({
        productId: p.productId,
        rating: p.rating,
        timestamp: p.createdAt
      })),
      availableProducts: deps.products.map(p => ({
        id: p.id,
        category: p.category,
        price: p.price,
        tags: p.tags
      })),
      maxResults: maxResults,
      userId: this.dataContext.recordId
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // 处理推荐算法返回的结果
    return result.recommendations.map((rec: any) => ({
      productId: rec.productId,
      score: rec.score,
      reason: rec.reason,
      algorithm: args.algorithm,
      generatedAt: Date.now()
    }));
  }
}

// 注册实体计算处理器
ComputedDataHandle.Handles.set(ProductRecommendationComputed, {
  entity: ProductRecommendationComputation
});
```

### 9.3.3 在实体中使用

```typescript
// 创建用户实体，包含推荐计算
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'email', type: 'string'})
  ]
});

// 创建推荐实体
const recommendationEntity = Entity.create({
  name: 'Recommendation',
  properties: [
    Property.create({name: 'productId', type: 'string'}),
    Property.create({name: 'score', type: 'string'}),
    Property.create({name: 'reason', type: 'string'}),
    Property.create({name: 'algorithm', type: 'string'}),
    Property.create({name: 'generatedAt', type: 'number'})
  ],
  computedData: ProductRecommendationComputed.create({
    algorithm: 'collaborative_filtering',
    maxResults: 5
  })
});
```

### 9.3.4 处理实体异步任务

```typescript
// 获取推荐计算实例
const recommendationComputation = Array.from(controller.scheduler.computations.values())
  .find(comp => comp.dataContext.type === 'entity' && 
               comp.dataContext.id.name === 'Recommendation') as DataBasedComputation;

const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(recommendationComputation);

// 处理推荐任务
const recommendationTasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);

for (const task of recommendationTasks) {
  try {
    // 调用推荐算法服务
    const recommendations = await callRecommendationAPI({
      algorithm: task.args.algorithm,
      userId: task.args.userId,
      purchaseHistory: task.args.purchaseHistory,
      availableProducts: task.args.availableProducts,
      maxResults: task.args.maxResults
    });
    
    // 更新任务状态
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        result: { recommendations },
        status: 'success'
      }
    );
    
    // 处理异步返回
    await controller.scheduler.handleAsyncReturn(recommendationComputation, {id: task.id});
    
  } catch (error) {
    console.error('Recommendation failed:', error);
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        error: error.message,
        status: 'failed'
      }
    );
  }
}
```

## 9.4 实现关系异步计算

### 9.4.1 使用场景

关系异步计算用于基于关系数据生成新的关系属性，如：
- 用户相似度计算
- 关系强度评分
- 社交网络分析
- 协同过滤

### 9.4.2 创建关系异步计算

```typescript
// 定义关系相似度计算类
const RelationSimilarityComputed = createClass({
  name: 'RelationSimilarityComputed',
  public: {
    algorithm: {
      type: 'string',
      required: true
    },
    threshold: {
      type: 'number',
      required: false
    }
  }
});

// 实现关系相似度计算
class RelationSimilarityComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof RelationSimilarityComputed>, 
    public dataContext: RelationDataContext
  ) {
    // 依赖关系数据和相关实体数据
    this.dataDeps = {
      relations: {
        type: 'records',
        source: dataContext.id,
        attributeQuery: ['*']
      },
      users: {
        type: 'records',
        source: userEntity,
        attributeQuery: ['*']
      }
    }
  }
  
  async compute(deps: {relations: any[], users: any[]}) {
    const threshold = this.args.threshold || 0.5;
    
    // 返回异步任务参数
    return ComputationResult.async({
      algorithm: this.args.algorithm,
      threshold: threshold,
      relationCount: deps.relations.length,
      userCount: deps.users.length,
      timestamp: Date.now()
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // 处理相似度计算结果
    return result.similarities.map((sim: any) => ({
      userId1: sim.userId1,
      userId2: sim.userId2,
      similarity: sim.score,
      algorithm: args.algorithm,
      computedAt: args.timestamp,
      confidence: sim.confidence
    }));
  }
}

// 注册关系计算处理器
ComputedDataHandle.Handles.set(RelationSimilarityComputed, {
  relation: RelationSimilarityComputation
});
```

### 9.4.3 在关系中使用

```typescript
// 创建用户相似度关系
const userSimilarityRelation = Relation.create({
  name: 'UserSimilarity',
  source: userEntity,
  sourceProperty: 'similarUsers',
  target: userEntity,
  targetProperty: 'similarToMe',
  type: 'n:n',
  properties: [
    Property.create({name: 'userId1', type: 'string'}),
    Property.create({name: 'userId2', type: 'string'}),
    Property.create({name: 'similarity', type: 'string'}),
    Property.create({name: 'algorithm', type: 'string'}),
    Property.create({name: 'computedAt', type: 'number'}),
    Property.create({name: 'confidence', type: 'string'})
  ],
  computedData: RelationSimilarityComputed.create({
    algorithm: 'cosine_similarity',
    threshold: 0.7
  })
});
```

### 9.4.4 处理关系异步任务

```typescript
// 获取相似度计算实例
const similarityComputation = Array.from(controller.scheduler.computations.values())
  .find(comp => comp.dataContext.type === 'relation' && 
               comp.dataContext.id.name === 'User_similarUsers_similarToMe_User') as DataBasedComputation;

const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(similarityComputation);

// 处理相似度任务
const similarityTasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);

for (const task of similarityTasks) {
  try {
    // 调用相似度计算服务
    const similarities = await calculateUserSimilarity({
      algorithm: task.args.algorithm,
      threshold: task.args.threshold,
      relationCount: task.args.relationCount,
      userCount: task.args.userCount
    });
    
    // 更新任务状态
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        result: { similarities },
        status: 'success'
      }
    );
    
    // 处理异步返回
    await controller.scheduler.handleAsyncReturn(similarityComputation, {id: task.id});
    
  } catch (error) {
    console.error('Similarity calculation failed:', error);
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        error: error.message,
        status: 'failed'
      }
    );
  }
}
```

## 9.5 异步计算的最佳实践

### 9.5.1 错误处理

```typescript
class RobustAsyncComputation implements DataBasedComputation {
  async compute(deps: any) {
    try {
      // 验证输入参数
      if (!this.validateInput(deps)) {
        throw new Error('Invalid input parameters');
      }
      
      return ComputationResult.async({
        ...deps,
        retryCount: 0,
        timeout: 30000
      });
    } catch (error) {
      // 记录错误日志
      console.error('Computation failed:', error);
      throw error;
    }
  }
  
  async asyncReturn(result: any, args: any) {
    try {
      // 验证返回结果
      if (!this.validateResult(result)) {
        throw new Error('Invalid async result');
      }
      
      return this.processResult(result, args);
    } catch (error) {
      // 错误恢复机制
      return this.getDefaultResult(args);
    }
  }
  
  private validateInput(deps: any): boolean {
    // 输入验证逻辑
    return deps && typeof deps === 'object';
  }
  
  private validateResult(result: any): boolean {
    // 结果验证逻辑
    return result && result.status === 'success';
  }
  
  private getDefaultResult(args: any): any {
    // 返回默认结果
    return { error: 'Computation failed, using default values' };
  }
}
```

### 9.5.2 性能优化

```typescript
class OptimizedAsyncComputation implements DataBasedComputation {
  private cache = new Map<string, any>();
  
  async compute(deps: any) {
    // 生成缓存键
    const cacheKey = this.generateCacheKey(deps);
    
    // 检查缓存
    if (this.cache.has(cacheKey)) {
      const cachedResult = this.cache.get(cacheKey);
      if (this.isCacheValid(cachedResult)) {
        return cachedResult;
      }
    }
    
    // 批量处理多个任务
    const batchSize = 10;
    const batches = this.createBatches(deps, batchSize);
    
    return ComputationResult.async({
      batches,
      cacheKey,
      timestamp: Date.now()
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // 处理批量结果
    const processedResults = [];
    
    for (const batch of result.batches) {
      const batchResult = await this.processBatch(batch);
      processedResults.push(...batchResult);
    }
    
    // 更新缓存
    this.cache.set(args.cacheKey, {
      data: processedResults,
      timestamp: args.timestamp,
      ttl: 3600000 // 1小时
    });
    
    return processedResults;
  }
  
  private generateCacheKey(deps: any): string {
    return JSON.stringify(deps);
  }
  
  private isCacheValid(cachedResult: any): boolean {
    const now = Date.now();
    return (now - cachedResult.timestamp) < cachedResult.ttl;
  }
  
  private createBatches(deps: any, batchSize: number): any[] {
    // 创建批次逻辑
    const items = deps.items || [];
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }
  
  private async processBatch(batch: any[]): Promise<any[]> {
    // 批量处理逻辑
    return Promise.all(batch.map(item => this.processItem(item)));
  }
  
  private async processItem(item: any): Promise<any> {
    // 单项处理逻辑
    return { ...item, processed: true };
  }
}
```

### 9.5.3 监控和调试

```typescript
class MonitoredAsyncComputation implements DataBasedComputation {
  private metrics = {
    computeCount: 0,
    asyncReturnCount: 0,
    errorCount: 0,
    totalDuration: 0
  };
  
  async compute(deps: any) {
    const startTime = Date.now();
    this.metrics.computeCount++;
    
    try {
      const result = await this.performCompute(deps);
      
      // 记录性能指标
      const duration = Date.now() - startTime;
      this.metrics.totalDuration += duration;
      
      console.log(`Compute completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('Compute error:', error);
      throw error;
    }
  }
  
  async asyncReturn(result: any, args: any) {
    const startTime = Date.now();
    this.metrics.asyncReturnCount++;
    
    try {
      const processedResult = await this.performAsyncReturn(result, args);
      
      const duration = Date.now() - startTime;
      console.log(`AsyncReturn completed in ${duration}ms`);
      
      return processedResult;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('AsyncReturn error:', error);
      throw error;
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      averageDuration: this.metrics.totalDuration / this.metrics.computeCount,
      errorRate: this.metrics.errorCount / (this.metrics.computeCount + this.metrics.asyncReturnCount)
    };
  }
  
  private async performCompute(deps: any) {
    // 实际计算逻辑
    return ComputationResult.async(deps);
  }
  
  private async performAsyncReturn(result: any, args: any) {
    // 实际异步返回处理逻辑
    return result;
  }
}
```

## 9.6 完整示例：智能推荐系统

以下是一个完整的智能推荐系统示例，展示了如何综合使用全局、实体和关系异步计算：

```typescript
// 1. 定义实体
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'preferences', type: 'object'})
  ]
});

const productEntity = Entity.create({
  name: 'Product',
  properties: [
    Property.create({name: 'name', type: 'string'}),
    Property.create({name: 'category', type: 'string'}),
    Property.create({name: 'price', type: 'number'}),
    Property.create({name: 'features', type: 'object'})
  ]
});

// 2. 定义关系
const purchaseRelation = Relation.create({
  name: 'Purchase',
  source: userEntity,
  sourceProperty: 'purchases',
  target: productEntity,
  targetProperty: 'buyers',
  type: 'n:n',
  properties: [
    Property.create({name: 'rating', type: 'number'}),
    Property.create({name: 'review', type: 'string'}),
    Property.create({name: 'purchaseDate', type: 'string'})
  ]
});

// 3. 全局趋势分析异步计算
const GlobalTrendAnalysisComputed = createClass({
  name: 'GlobalTrendAnalysisComputed',
  public: {
    period: { type: 'string', required: true },
    categories: { type: 'object', required: false }
  }
});

class GlobalTrendAnalysisComputation implements DataBasedComputation {
  // ... 实现全局趋势分析
}

// 4. 用户个性化推荐异步计算
const UserRecommendationComputed = createClass({
  name: 'UserRecommendationComputed',
  public: {
    algorithm: { type: 'string', required: true },
    maxResults: { type: 'number', required: false }
  }
});

class UserRecommendationComputation implements DataBasedComputation {
  // ... 实现用户个性化推荐
}

// 5. 产品相似度关系异步计算
const ProductSimilarityComputed = createClass({
  name: 'ProductSimilarityComputed',
  public: {
    method: { type: 'string', required: true },
    threshold: { type: 'number', required: false }
  }
});

class ProductSimilarityComputation implements DataBasedComputation {
  // ... 实现产品相似度计算
}

// 6. 系统配置
const entities = [userEntity, productEntity];
const relations = [purchaseRelation];
const dictionary = [
  Dictionary.create({
    name: 'globalTrends',
    type: 'object',
    computedData: GlobalTrendAnalysisComputed.create({
      period: 'monthly',
      categories: ['electronics', 'books', 'clothing']
    })
  })
];

// 7. 启动系统
const controller = new Controller(system, entities, relations, [], [], dictionary, []);
await controller.setup(true);

// 8. 处理异步任务的调度器
class AsyncTaskScheduler {
  constructor(private controller: Controller, private system: MonoSystem) {}
  
  async processAllAsyncTasks() {
    const computations = Array.from(this.controller.scheduler.computations.values());
    
    for (const computation of computations) {
      await this.processComputationTasks(computation as DataBasedComputation);
    }
  }
  
  private async processComputationTasks(computation: DataBasedComputation) {
    const taskRecordName = this.controller.scheduler.getAsyncTaskRecordKey(computation);
    const tasks = await this.system.storage.find(taskRecordName, undefined, undefined, ['*']);
    
    for (const task of tasks) {
      try {
        let result;
        
        // 根据计算类型调用不同的处理服务
        if (computation.dataContext.type === 'global') {
          result = await this.processGlobalTask(task);
        } else if (computation.dataContext.type === 'entity') {
          result = await this.processEntityTask(task);
        } else if (computation.dataContext.type === 'relation') {
          result = await this.processRelationTask(task);
        }
        
        // 更新任务状态
        await this.system.storage.update(
          taskRecordName,
          MatchExp.atom({key: 'id', value: ['=', task.id]}),
          { result, status: 'success' }
        );
        
        // 处理异步返回
        await this.controller.scheduler.handleAsyncReturn(computation, {id: task.id});
        
      } catch (error) {
        console.error(`Task processing failed:`, error);
        await this.system.storage.update(
          taskRecordName,
          MatchExp.atom({key: 'id', value: ['=', task.id]}),
          { error: error.message, status: 'failed' }
        );
      }
    }
  }
  
  private async processGlobalTask(task: any) {
    // 处理全局任务
    return await callTrendAnalysisAPI(task.args);
  }
  
  private async processEntityTask(task: any) {
    // 处理实体任务
    return await callRecommendationAPI(task.args);
  }
  
  private async processRelationTask(task: any) {
    // 处理关系任务
    return await callSimilarityAPI(task.args);
  }
}

// 9. 启动异步任务处理
const scheduler = new AsyncTaskScheduler(controller, system);
setInterval(() => {
  scheduler.processAllAsyncTasks().catch(console.error);
}, 5000); // 每5秒处理一次异步任务
```

异步计算为 interaqt 框架提供了强大的扩展能力，使得系统能够处理复杂的业务逻辑和外部集成需求。通过合理使用异步计算，可以构建出功能丰富、性能优异的响应式应用系统。