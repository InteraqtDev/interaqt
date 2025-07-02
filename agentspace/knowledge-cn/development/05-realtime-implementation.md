# 第5章：RealTime 实时计算实现详解（RealTime Implementation）

本章深入分析 RealTime 实时计算的内部实现机制，包括状态管理、调度算法、数学表达式处理和性能优化等核心技术细节。

## 5.1 RealTime 计算架构

### 5.1.1 整体架构设计

RealTime 计算模块在 interaqt 框架中扮演着时间感知计算引擎的角色，其架构设计包含以下核心组件：

```
┌─────────────────────────────────────────────────────────────┐
│                    RealTime Computation                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Callback  │  │   State     │  │    Expression       │  │
│  │  Executor   │  │  Manager    │  │    Processor        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Scheduler   │  │ DataDeps    │  │    Math Resolver    │  │
│  │ Integration │  │ Resolver    │  │    (Equation)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.1.2 核心流程

RealTime 计算的执行流程分为以下步骤：

1. **初始化阶段**: 创建状态字段和调度器注册
2. **触发阶段**: 时间或数据变更触发重新计算
3. **执行阶段**: 回调函数执行和结果处理
4. **调度阶段**: 根据结果类型计算下次执行时间
5. **状态更新**: 更新 lastRecomputeTime 和 nextRecomputeTime

## 5.2 状态管理机制

### 5.2.1 状态字段设计

RealTime 计算维护两个核心状态字段：

```typescript
interface RealTimeState {
  lastRecomputeTime: PropertyDataDep;    // 上次计算时间
  nextRecomputeTime: PropertyDataDep;    // 下次计算时间
}
```

状态字段的命名遵循以下规则：

```typescript
// 全局计算状态键名
`_global_boundState_${computationName}_${stateFieldName}`

// 属性计算状态键名  
`_record_boundState_${entityName}_${propertyName}_${stateFieldName}`
```

### 5.2.2 状态持久化实现

状态持久化基于 interaqt 的响应式存储系统：

```typescript
// src/runtime/computationHandles/RealTime.ts (核心逻辑)
export class RealTimeComputation implements DataBasedComputation {
  state: {
    lastRecomputeTime: PropertyDataDep;
    nextRecomputeTime: PropertyDataDep;
  };
  
  constructor(controller: Controller, args: KlassInstance<typeof RealTime>, dataContext: DataContext) {
    // 创建状态字段
    this.state = {
      lastRecomputeTime: PropertyDataDep.create({
        name: 'lastRecomputeTime',
        type: 'number',
        defaultValue: () => Date.now()
      }),
      nextRecomputeTime: PropertyDataDep.create({
        name: 'nextRecomputeTime', 
        type: 'number',
        defaultValue: () => Date.now()
      })
    };
    
    // 注册到 controller 的计算图中
    controller.scheduler.registerComputation(this);
  }
}
```

### 5.2.3 状态访问接口

框架提供了标准化的状态访问接口：

```typescript
// 通过 scheduler 获取状态键名
getBoundStateName(dataContext: DataContext, stateName: string, stateDep: PropertyDataDep): string {
  const contextType = dataContext.type;
  
  if (contextType === 'global') {
    return `_global_boundState_${dataContext.id}_${stateName}`;
  } else if (contextType === 'property') {
    const entityName = dataContext.host.name;
    const propertyName = dataContext.id.name;
    return `_record_boundState_${entityName}_${propertyName}_${stateName}`;
  }
  
  throw new Error(`Unsupported context type: ${contextType}`);
}

// 状态值读写
async getStateValue(stateKey: string): Promise<number> {
  if (this.dataContext.type === 'global') {
    return await this.controller.system.storage.get(DICTIONARY_RECORD, stateKey);
  } else {
    // 属性级状态存储在记录上
    return await this.controller.system.storage.get(this.dataContext.host.name, stateKey);
  }
}
```

## 5.3 调度算法实现

### 5.3.1 双调度策略

RealTime 计算根据返回类型采用不同的调度策略：

#### Expression 类型调度

```typescript
// Expression 类型：使用用户定义的间隔
computeNextRecomputeTime(lastTime: number, result: Expression): number {
  if (this.args.nextRecomputeTime) {
    const interval = this.args.nextRecomputeTime(lastTime, this.dataDeps);
    return lastTime + interval;
  }
  return lastTime + 60000; // 默认1分钟
}
```

#### Inequality/Equation 类型调度

```typescript
// Inequality/Equation 类型：使用 solve() 计算临界时间点
computeNextRecomputeTime(lastTime: number, result: Inequality | Equation): number {
  try {
    const criticalTime = result.solve();
    return criticalTime !== null ? criticalTime : lastTime + 60000;
  } catch (error) {
    console.warn('Failed to solve equation/inequality:', error);
    return lastTime + 60000; // 降级到固定间隔
  }
}
```

### 5.3.2 调度器集成

RealTime 计算通过 Scheduler 与框架的时间管理系统集成：

```typescript
export class Scheduler {
  private timeBasedComputations: Map<string, RealTimeComputation> = new Map();
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();
  
  registerRealTimeComputation(computation: RealTimeComputation) {
    const computationId = this.getComputationId(computation);
    this.timeBasedComputations.set(computationId, computation);
    this.scheduleNextExecution(computation);
  }
  
  private scheduleNextExecution(computation: RealTimeComputation) {
    const nextTime = computation.getNextRecomputeTime();
    const delay = Math.max(0, nextTime - Date.now());
    
    const handle = setTimeout(() => {
      this.executeRealTimeComputation(computation);
    }, delay);
    
    this.timeoutHandles.set(this.getComputationId(computation), handle);
  }
  
  private async executeRealTimeComputation(computation: RealTimeComputation) {
    try {
      const result = await computation.compute();
      await this.updateComputationState(computation, result);
      this.scheduleNextExecution(computation); // 调度下次执行
    } catch (error) {
      console.error('RealTime computation failed:', error);
      // 错误恢复策略
      this.scheduleRetry(computation);
    }
  }
}
```

## 5.4 数学表达式处理

### 5.4.1 Expression 系统集成

RealTime 计算与 MathResolver 的 Expression 系统深度集成：

```typescript
// Expression 对象在 RealTime callback 中的使用
callback: async (now: Expression, dataDeps: any) => {
  // now 是一个 Expression 实例，支持链式计算
  const timeInSeconds = now.divide(1000);
  const timeInMinutes = now.divide(60000);
  
  // 支持复杂数学运算
  return timeInSeconds.multiply(factor).add(timeInMinutes.sqrt());
}
```

### 5.4.2 时间表达式优化

为了优化时间相关的计算，框架提供了专门的时间表达式处理：

```typescript
class TimeExpression extends Expression {
  // 专门优化的时间运算
  toSeconds(): Expression {
    return this.divide(1000);
  }
  
  toMinutes(): Expression {
    return this.divide(60000);
  }
  
  toHours(): Expression {
    return this.divide(3600000);
  }
  
  toDays(): Expression {
    return this.divide(86400000);
  }
  
  // 时区处理
  adjustTimezone(offsetHours: number): Expression {
    return this.add(offsetHours * 3600000);
  }
  
  // 时间模运算（用于周期性检查）
  modDay(): Expression {
    return this.modulo(86400000);
  }
  
  modHour(): Expression {
    return this.modulo(3600000);
  }
}
```

### 5.4.3 Inequality/Equation 求解

对于返回 Inequality 或 Equation 的计算，系统使用代数求解器：

```typescript
// 不等式求解示例
now.gt(deadline) // 求解: now > deadline 的临界点

// 系统内部处理
class InequalityTimeResolver {
  solve(inequality: Inequality): number | null {
    // 提取线性形式: ax + b > c
    const linearForm = inequality.getLinearForm('now');
    
    if (linearForm.coefficient !== 0) {
      // 求解: now = (c - b) / a
      const criticalTime = (linearForm.constant - linearForm.bias) / linearForm.coefficient;
      return Math.ceil(criticalTime); // 向上取整确保触发
    }
    
    return null; // 无法求解
  }
}
```

## 5.5 数据依赖处理

### 5.5.1 DataDeps 解析

RealTime 计算支持复杂的数据依赖配置：

```typescript
interface RealTimeDataDeps {
  [key: string]: {
    type: 'records' | 'property' | 'global';
    source?: Entity | Relation | Dictionary;
    attributeQuery?: AttributeQueryData;
  }
}

// 数据依赖解析器
class DataDepsResolver {
  async resolve(dataDeps: RealTimeDataDeps, context: DataContext): Promise<any> {
    const resolved = {};
    
    for (const [key, dep] of Object.entries(dataDeps)) {
      switch (dep.type) {
        case 'records':
          resolved[key] = await this.resolveRecords(dep, context);
          break;
        case 'property':
          resolved[key] = await this.resolveProperty(dep, context);
          break;
        case 'global':
          resolved[key] = await this.resolveGlobal(dep);
          break;
      }
    }
    
    return resolved;
  }
  
  private async resolveRecords(dep: DataDep, context: DataContext): Promise<any[]> {
    const storage = this.controller.system.storage;
    const entityName = dep.source.name;
    
    // 使用 attributeQuery 优化查询
    const attributeQuery = dep.attributeQuery || ['*'];
    
    return await storage.find(entityName, null, undefined, attributeQuery);
  }
}
```

### 5.5.2 依赖变更监听

RealTime 计算会监听数据依赖的变更：

```typescript
class RealTimeComputation {
  setupDependencyListeners() {
    Object.values(this.dataDeps).forEach(dep => {
      if (dep.type === 'records') {
        // 监听实体记录变更
        this.controller.eventBus.on(`${dep.source.name}:change`, () => {
          this.markForRecompute();
        });
      }
    });
  }
  
  markForRecompute() {
    // 立即调度重新计算
    clearTimeout(this.scheduledHandle);
    this.scheduleImmediate();
  }
}
```

## 5.6 性能优化

### 5.6.1 计算缓存

RealTime 计算实现了多层缓存机制：

```typescript
class ComputationCache {
  private expressionCache = new Map<string, any>();
  private dependencyCache = new Map<string, any>();
  
  // Expression 结果缓存
  cacheExpressionResult(key: string, result: any, ttl: number) {
    this.expressionCache.set(key, {
      result,
      expiry: Date.now() + ttl
    });
  }
  
  getCachedExpression(key: string): any | null {
    const cached = this.expressionCache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.result;
    }
    this.expressionCache.delete(key);
    return null;
  }
  
  // 数据依赖缓存
  cacheDependencies(depsHash: string, data: any) {
    this.dependencyCache.set(depsHash, {
      data,
      timestamp: Date.now()
    });
  }
}
```

### 5.6.2 批量计算优化

对于大量相似的 RealTime 计算，系统支持批量处理：

```typescript
class BatchRealTimeProcessor {
  private pendingComputations: RealTimeComputation[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  
  scheduleComputation(computation: RealTimeComputation) {
    this.pendingComputations.push(computation);
    
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, 10); // 10ms 批量窗口
    }
  }
  
  private async processBatch() {
    const batch = this.pendingComputations.splice(0);
    this.batchTimeout = null;
    
    // 按照数据依赖分组
    const groups = this.groupByDataDeps(batch);
    
    // 并行处理每个组
    await Promise.all(groups.map(group => this.processGroup(group)));
  }
  
  private groupByDataDeps(computations: RealTimeComputation[]): RealTimeComputation[][] {
    const groups = new Map<string, RealTimeComputation[]>();
    
    computations.forEach(comp => {
      const depsHash = this.hashDataDeps(comp.dataDeps);
      if (!groups.has(depsHash)) {
        groups.set(depsHash, []);
      }
      groups.get(depsHash)!.push(comp);
    });
    
    return Array.from(groups.values());
  }
}
```

### 5.6.3 内存管理

RealTime 计算包含智能的内存管理机制：

```typescript
class RealTimeMemoryManager {
  private static readonly MAX_CACHE_SIZE = 1000;
  private static readonly CLEANUP_INTERVAL = 300000; // 5分钟
  
  private computationRegistry = new WeakMap<RealTimeComputation, ComputationMetrics>();
  
  constructor() {
    // 定期清理内存
    setInterval(() => {
      this.performMemoryCleanup();
    }, RealTimeMemoryManager.CLEANUP_INTERVAL);
  }
  
  private performMemoryCleanup() {
    // 清理过期的表达式缓存
    this.cleanupExpressionCache();
    
    // 清理不活跃的计算
    this.cleanupInactiveComputations();
    
    // 强制垃圾回收（在支持的环境中）
    if (global.gc) {
      global.gc();
    }
  }
  
  private cleanupInactiveComputations() {
    const now = Date.now();
    const inactiveThreshold = 3600000; // 1小时
    
    this.controller.scheduler.computations.forEach((comp, id) => {
      if (comp.lastExecutionTime < now - inactiveThreshold) {
        this.controller.scheduler.unregisterComputation(id);
      }
    });
  }
}
```

## 5.7 错误处理与恢复

### 5.7.1 错误分类

RealTime 计算系统定义了以下错误类型：

```typescript
enum RealTimeErrorType {
  CALLBACK_EXECUTION_ERROR = 'callback_execution_error',
  EXPRESSION_EVALUATION_ERROR = 'expression_evaluation_error', 
  SCHEDULING_ERROR = 'scheduling_error',
  STATE_PERSISTENCE_ERROR = 'state_persistence_error',
  DEPENDENCY_RESOLUTION_ERROR = 'dependency_resolution_error'
}

class RealTimeError extends Error {
  constructor(
    public type: RealTimeErrorType,
    message: string,
    public computation: RealTimeComputation,
    public originalError?: Error
  ) {
    super(message);
  }
}
```

### 5.7.2 错误恢复策略

系统实现了多层次的错误恢复机制：

```typescript
class RealTimeErrorHandler {
  async handleError(error: RealTimeError): Promise<void> {
    switch (error.type) {
      case RealTimeErrorType.CALLBACK_EXECUTION_ERROR:
        await this.handleCallbackError(error);
        break;
        
      case RealTimeErrorType.EXPRESSION_EVALUATION_ERROR:
        await this.handleExpressionError(error);
        break;
        
      case RealTimeErrorType.SCHEDULING_ERROR:
        await this.handleSchedulingError(error);
        break;
        
      default:
        await this.handleGenericError(error);
    }
  }
  
  private async handleCallbackError(error: RealTimeError) {
    const computation = error.computation;
    
    // 尝试使用默认值
    if (computation.args.defaultValue) {
      await this.setComputationResult(computation, computation.args.defaultValue());
    }
    
    // 延长重试间隔
    const retryDelay = Math.min(600000, computation.retryCount * 60000); // 最大10分钟
    this.scheduler.scheduleRetry(computation, retryDelay);
    
    computation.retryCount++;
  }
  
  private async handleExpressionError(error: RealTimeError) {
    // Expression 错误通常意味着数学计算问题
    // 记录错误并使用安全的默认调度
    this.logger.warn('Expression evaluation failed, using fallback scheduling', error);
    
    const computation = error.computation;
    const fallbackTime = Date.now() + 60000; // 1分钟后重试
    await this.updateComputationState(computation, { nextRecomputeTime: fallbackTime });
  }
}
```

### 5.7.3 健康检查

系统包含实时计算健康检查机制：

```typescript
class RealTimeHealthChecker {
  private healthMetrics = new Map<string, HealthMetric>();
  
  async performHealthCheck(): Promise<HealthReport> {
    const report: HealthReport = {
      totalComputations: 0,
      activeComputations: 0,
      errorRate: 0,
      averageExecutionTime: 0,
      memoryUsage: process.memoryUsage().heapUsed,
      issues: []
    };
    
    for (const [id, computation] of this.scheduler.realTimeComputations) {
      report.totalComputations++;
      
      const metrics = this.healthMetrics.get(id);
      if (metrics) {
        if (metrics.lastExecution > Date.now() - 300000) { // 5分钟内执行过
          report.activeComputations++;
        }
        
        report.errorRate += metrics.errorRate;
        report.averageExecutionTime += metrics.averageExecutionTime;
        
        // 检查异常情况
        if (metrics.errorRate > 0.1) { // 错误率超过10%
          report.issues.push(`Computation ${id} has high error rate: ${metrics.errorRate}`);
        }
        
        if (metrics.averageExecutionTime > 5000) { // 执行时间超过5秒
          report.issues.push(`Computation ${id} has slow execution: ${metrics.averageExecutionTime}ms`);
        }
      }
    }
    
    report.errorRate /= report.totalComputations;
    report.averageExecutionTime /= report.totalComputations;
    
    return report;
  }
}
```

## 5.8 测试与调试

### 5.8.1 单元测试支持

RealTime 计算提供了专门的测试工具：

```typescript
class RealTimeTestHelper {
  static createMockTime(timestamp: number): Expression {
    return new Expression(new NumberNode(timestamp));
  }
  
  static async simulateTimeProgression(
    computation: RealTimeComputation,
    timeSteps: number[],
    expectedResults: any[]
  ): Promise<void> {
    for (let i = 0; i < timeSteps.length; i++) {
      const mockNow = this.createMockTime(timeSteps[i]);
      const result = await computation.executeCallback(mockNow, {});
      
      expect(result).toEqual(expectedResults[i]);
    }
  }
  
  static async verifyStateManagement(
    computation: RealTimeComputation,
    expectedLastTime: number,
    expectedNextTime: number
  ): Promise<void> {
    const state = await computation.getState();
    
    expect(state.lastRecomputeTime).toBe(expectedLastTime);
    expect(state.nextRecomputeTime).toBe(expectedNextTime);
  }
}
```

### 5.8.2 调试工具

框架提供了丰富的调试工具：

```typescript
class RealTimeDebugger {
  private static instance: RealTimeDebugger;
  private logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug' = 'warn';
  
  static getInstance(): RealTimeDebugger {
    if (!this.instance) {
      this.instance = new RealTimeDebugger();
    }
    return this.instance;
  }
  
  logComputation(computation: RealTimeComputation, phase: string, data?: any) {
    if (this.logLevel === 'debug') {
      console.log(`[RealTime] ${computation.id} - ${phase}:`, data);
    }
  }
  
  traceExecution(computation: RealTimeComputation): ExecutionTrace {
    const trace: ExecutionTrace = {
      computationId: computation.id,
      startTime: Date.now(),
      phases: []
    };
    
    // Hook into computation execution
    computation.on('phase:start', (phase) => {
      trace.phases.push({
        phase,
        startTime: Date.now(),
        endTime: null,
        data: null
      });
    });
    
    computation.on('phase:end', (phase, data) => {
      const currentPhase = trace.phases.find(p => p.phase === phase && !p.endTime);
      if (currentPhase) {
        currentPhase.endTime = Date.now();
        currentPhase.data = data;
      }
    });
    
    return trace;
  }
}
```

## 5.9 扩展接口

### 5.9.1 自定义计算类型

开发者可以扩展 RealTime 计算支持新的结果类型：

```typescript
interface CustomRealTimeResult {
  type: 'custom';
  value: any;
  nextExecutionTime?: number;
}

class CustomRealTimeProcessor {
  static register(type: string, processor: RealTimeResultProcessor) {
    RealTimeComputation.resultProcessors.set(type, processor);
  }
  
  static process(result: CustomRealTimeResult): number {
    // 自定义处理逻辑
    return result.nextExecutionTime || Date.now() + 60000;
  }
}

// 使用示例
CustomRealTimeProcessor.register('aggregation', {
  computeNextTime: (result: AggregationResult) => {
    return result.nextAggregationTime;
  },
  validateResult: (result: AggregationResult) => {
    return result.value !== undefined;
  }
});
```

### 5.9.2 中间件支持

RealTime 计算支持中间件模式：

```typescript
interface RealTimeMiddleware {
  beforeExecution?(computation: RealTimeComputation): Promise<void>;
  afterExecution?(computation: RealTimeComputation, result: any): Promise<void>;
  onError?(computation: RealTimeComputation, error: Error): Promise<void>;
}

class LoggingMiddleware implements RealTimeMiddleware {
  async beforeExecution(computation: RealTimeComputation): Promise<void> {
    console.log(`Executing RealTime computation: ${computation.id}`);
  }
  
  async afterExecution(computation: RealTimeComputation, result: any): Promise<void> {
    console.log(`Completed RealTime computation: ${computation.id}`, result);
  }
  
  async onError(computation: RealTimeComputation, error: Error): Promise<void> {
    console.error(`Error in RealTime computation: ${computation.id}`, error);
  }
}

// 注册中间件
RealTimeComputation.use(new LoggingMiddleware());
RealTimeComputation.use(new MetricsMiddleware());
RealTimeComputation.use(new CachingMiddleware());
```

这个实现详解文档深入解析了 RealTime 实时计算的所有核心技术细节，为框架开发者和高级用户提供了完整的实现参考。通过理解这些内部机制，开发者可以更好地使用、调试和扩展 RealTime 计算功能。