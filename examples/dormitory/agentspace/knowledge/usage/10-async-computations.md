# How to Use Async Computations

Async computations are an advanced feature of the interaqt framework that allow calling external APIs, performing time-consuming operations, or executing complex data processing during reactive computation processes. This chapter will detail how to implement and use async computations at different levels.

## Understanding Async Computation Scenarios

### When You Need Async Computations

Async computations are suitable for the following scenarios:

- **External API calls**: Need to fetch data from third-party services
- **Complex algorithm processing**: Operations requiring significant computation time
- **Machine learning inference**: Calling AI models for predictions
- **Data aggregation analysis**: Statistical computations requiring processing of large amounts of data
- **File processing**: Time-consuming operations like image processing, document conversion

### Advantages of Async Computations

```typescript
// Limitations of traditional sync computations
class SyncComputation {
  compute(deps: any) {
    // Cannot call async operations here
    // const result = await fetchFromAPI(); // ❌ Not supported
    return simpleCalculation(deps);
  }
}

// Advantages of async computations
class AsyncComputation {
  async compute(deps: any) {
    // ✅ Supports async operations
    const externalData = await fetchFromAPI();
    const result = await complexAnalysis(deps, externalData);
    return ComputationResult.async(result);
  }
  
  async asyncReturn(result: any, args: any) {
    // ✅ Handle async return results
    return processAsyncResult(result, args);
  }
}
```

### Supported Computation Types

The framework supports three types of async computations:

1. **Global async computations**: Global-level computations with results stored in Dictionary
2. **Entity async computations**: Entity-level computations that generate data for entities
3. **Relation async computations**: Relation-level computations that generate data for relations

## Implementing Global Async Computations

### Basic Concepts

Global async computations are used to handle system-level data such as global statistics, configuration updates, and external data synchronization.

### Creating Global Async Computation Classes

```typescript
import { createClass, ComputationResult } from 'interaqt';

// Define global weather computation class
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

// Implement global weather computation
class GlobalWeatherComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof GlobalWeatherComputed>, 
    public dataContext: GlobalDataContext
  ) {
    // Global computations can depend on entity data
    this.dataDeps = {
      // Can depend on data from other entities
      locations: {
        type: 'records',
        source: locationEntity,
        attributeQuery: ['*']
      }
    }
  }
  
  async compute(deps: {locations: any[]}) {
    // Return async task with parameters needed for external API call
    return ComputationResult.async({
      city: this.args.city,
      locationCount: deps.locations.length,
      timestamp: Date.now(),
      apiKey: this.args.apiKey
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // Process weather data returned from external API
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

### Registering Computation Handlers

```typescript
import { ComputationHandle } from 'interaqt';

// Register global computation handler
ComputationHandle.Handles.set(GlobalWeatherComputed, {
  global: GlobalWeatherComputation
});
```

### Using in Dictionary

```typescript
// Create global weather dictionary item
const weatherDictionary = Dictionary.create({
  name: 'currentWeather',
  type: 'object',
  collection: false,
  computation: GlobalWeatherComputed.create({
    city: 'Beijing',
    apiKey: process.env.WEATHER_API_KEY
  })
});

// Register in system
const controller = new Controller({
  system: system,
  entities: entities,
  relations: relations,
  activities: [],
  interactions: [],
  dict: [weatherDictionary],, // Dictionary array
  recordMutationSideEffects: []
});
```

### Handling Async Tasks

```typescript
// Get async tasks
const weatherComputation = Array.from(controller.scheduler.computations.values())
  .find(comp => comp.dataContext.type === 'global' && 
               comp.dataContext.id === 'currentWeather') as DataBasedComputation;

const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(weatherComputation);

// Query pending tasks
const pendingTasks = await system.storage.find(taskRecordName, undefined, undefined, ['*']);

for (const task of pendingTasks) {
  try {
    // Call external weather API
    const weatherData = await fetchWeatherAPI(task.args.city, task.args.apiKey);
    
    // Update task status to success
    await system.storage.update(
      taskRecordName,
      MatchExp.atom({key: 'id', value: ['=', task.id]}),
      {
        result: weatherData,
        status: 'success'
      }
    );
    
    // Trigger async return processing
    await controller.scheduler.handleAsyncReturn(weatherComputation, {id: task.id});
    
  } catch (error) {
    // Handle error cases
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

// Get computation results
const currentWeather = await system.storage.get('state', 'currentWeather');
console.log('Current weather:', currentWeather);
```

## Implementing Entity Async Computations

### Use Cases

Entity async computations are used to generate properties based on external data for entities, such as:
- Product recommendations
- User profile analysis
- Content personalization
- Risk assessment

### Creating Entity Async Computations

```typescript
// Define product recommendation computation class
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

// Implement product recommendation computation
class ProductRecommendationComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof ProductRecommendationComputed>, 
    public dataContext: EntityDataContext
  ) {
    // Depend on user's purchase history and product data
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
    
    // Return async task parameters
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
    // Process recommendation algorithm results
    return result.recommendations.map((rec: any) => ({
      productId: rec.productId,
      score: rec.score,
      reason: rec.reason,
      algorithm: args.algorithm,
      generatedAt: Date.now()
    }));
  }
}

// Register entity computation handler
ComputationHandle.Handles.set(ProductRecommendationComputed, {
  entity: ProductRecommendationComputation
});
```

### Using in Entities

```typescript
// Create user entity with recommendation computation
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'email', type: 'string'})
  ]
});

// Create recommendation entity
const recommendationEntity = Entity.create({
  name: 'Recommendation',
  properties: [
    Property.create({name: 'productId', type: 'string'}),
    Property.create({name: 'score', type: 'string'}),
    Property.create({name: 'reason', type: 'string'}),
    Property.create({name: 'algorithm', type: 'string'}),
    Property.create({name: 'generatedAt', type: 'number'})
  ],
  computation: ProductRecommendationComputed.create({
    algorithm: 'collaborative_filtering',
    maxResults: 5
  })
});
```

## Implementing Relation Async Computations

### Use Cases

Relation async computations are used to generate new relation properties based on relation data, such as:
- User similarity calculations
- Relationship strength scoring
- Social network analysis
- Collaborative filtering

### Creating Relation Async Computations

```typescript
// Define relation similarity computation class
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

// Implement relation similarity computation
class RelationSimilarityComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof RelationSimilarityComputed>, 
    public dataContext: RelationDataContext
  ) {
    // Depend on relation data and related entity data
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
    
    // Return async task parameters
    return ComputationResult.async({
      algorithm: this.args.algorithm,
      threshold: threshold,
      relationCount: deps.relations.length,
      userCount: deps.users.length,
      timestamp: Date.now()
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // Process similarity calculation results
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

// Register relation computation handler
ComputationHandle.Handles.set(RelationSimilarityComputed, {
  relation: RelationSimilarityComputation
});
```

## Best Practices for Async Computations

### Error Handling

```typescript
class RobustAsyncComputation implements DataBasedComputation {
  async compute(deps: any) {
    try {
      // Validate input parameters
      if (!this.validateInput(deps)) {
        throw new Error('Invalid input parameters');
      }
      
      return ComputationResult.async({
        ...deps,
        retryCount: 0,
        timeout: 30000
      });
    } catch (error) {
      // Log errors
      console.error('Computation failed:', error);
      throw error;
    }
  }
  
  async asyncReturn(result: any, args: any) {
    try {
      // Validate return results
      if (!this.validateResult(result)) {
        throw new Error('Invalid async result');
      }
      
      return this.processResult(result, args);
    } catch (error) {
      // Error recovery mechanism
      return this.getDefaultResult(args);
    }
  }
  
  private validateInput(deps: any): boolean {
    // Input validation logic
    return deps && typeof deps === 'object';
  }
  
  private validateResult(result: any): boolean {
    // Result validation logic
    return result && result.status === 'success';
  }
  
  private getDefaultResult(args: any): any {
    // Return default result
    return { error: 'Computation failed, using default values' };
  }
}
```

### Performance Optimization

```typescript
class OptimizedAsyncComputation implements DataBasedComputation {
  private cache = new Map<string, any>();
  
  async compute(deps: any) {
    // Generate cache key
    const cacheKey = this.generateCacheKey(deps);
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cachedResult = this.cache.get(cacheKey);
      if (this.isCacheValid(cachedResult)) {
        return cachedResult;
      }
    }
    
    // Batch process multiple tasks
    const batchSize = 10;
    const batches = this.createBatches(deps, batchSize);
    
    return ComputationResult.async({
      batches,
      cacheKey,
      timestamp: Date.now()
    });
  }
  
  async asyncReturn(result: any, args: any) {
    // Process batch results
    const processedResults = [];
    
    for (const batch of result.batches) {
      const batchResult = await this.processBatch(batch);
      processedResults.push(...batchResult);
    }
    
    // Update cache
    this.cache.set(args.cacheKey, {
      data: processedResults,
      timestamp: args.timestamp,
      ttl: 3600000 // 1 hour
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
    // Create batch logic
    const items = deps.items || [];
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }
  
  private async processBatch(batch: any[]): Promise<any[]> {
    // Batch processing logic
    return Promise.all(batch.map(item => this.processItem(item)));
  }
  
  private async processItem(item: any): Promise<any> {
    // Single item processing logic
    return { ...item, processed: true };
  }
}
```

### Monitoring and Debugging

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
      
      // Record performance metrics
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
    // Actual computation logic
    return ComputationResult.async(deps);
  }
  
  private async performAsyncReturn(result: any, args: any) {
    // Actual async return processing logic
    return result;
  }
}
```

## Complete Example: Intelligent Recommendation System

Here's a complete intelligent recommendation system example showing how to comprehensively use global, entity, and relation async computations:

```typescript
// 1. Define entities
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

// 2. Define relations
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

// 3. Async task scheduler
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
        
        // Call different processing services based on computation type
        if (computation.dataContext.type === 'global') {
          result = await this.processGlobalTask(task);
        } else if (computation.dataContext.type === 'entity') {
          result = await this.processEntityTask(task);
        } else if (computation.dataContext.type === 'relation') {
          result = await this.processRelationTask(task);
        }
        
        // Update task status
        await this.system.storage.update(
          taskRecordName,
          MatchExp.atom({key: 'id', value: ['=', task.id]}),
          { result, status: 'success' }
        );
        
        // Process async return
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
    // Process global tasks
    return await callTrendAnalysisAPI(task.args);
  }
  
  private async processEntityTask(task: any) {
    // Process entity tasks
    return await callRecommendationAPI(task.args);
  }
  
  private async processRelationTask(task: any) {
    // Process relation tasks
    return await callSimilarityAPI(task.args);
  }
}

// 4. Start async task processing
const scheduler = new AsyncTaskScheduler(controller, system);
setInterval(() => {
  scheduler.processAllAsyncTasks().catch(console.error);
}, 5000); // Process async tasks every 5 seconds
```

Async computations provide the interaqt framework with powerful extension capabilities, enabling the system to handle complex business logic and external integration requirements. Through proper use of async computations, you can build feature-rich, high-performance reactive application systems.
