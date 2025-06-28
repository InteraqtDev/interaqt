# Chapter 5: RealTime Implementation Details

This chapter provides an in-depth analysis of the internal implementation mechanisms of RealTime computations, including state management, scheduling algorithms, mathematical expression processing, and performance optimization.

## 5.1 RealTime Computation Architecture

### 5.1.1 Overall Architecture Design

The RealTime computation module plays the role of a time-aware computation engine in the interaqt framework, with an architecture design that includes the following core components:

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

### 5.1.2 Core Process Flow

The execution flow of RealTime computations consists of the following steps:

1. **Initialization Phase**: Create state fields and scheduler registration
2. **Trigger Phase**: Time or data changes trigger recomputation
3. **Execution Phase**: Callback function execution and result processing
4. **Scheduling Phase**: Calculate next execution time based on result type
5. **State Update**: Update lastRecomputeTime and nextRecomputeTime

## 5.2 State Management Mechanism

### 5.2.1 State Field Design

RealTime computations maintain two core state fields:

```typescript
interface RealTimeState {
  lastRecomputeTime: PropertyDataDep;    // Last computation time
  nextRecomputeTime: PropertyDataDep;    // Next computation time
}
```

State field naming follows these rules:

```typescript
// Global computation state key name
`_global_boundState_${computationName}_${stateFieldName}`

// Property computation state key name  
`_record_boundState_${entityName}_${propertyName}_${stateFieldName}`
```

### 5.2.2 State Persistence Implementation

State persistence is based on interaqt's reactive storage system:

```typescript
// src/runtime/computedDataHandles/RealTime.ts (core logic)
export class RealTimeComputation implements DataBasedComputation {
  state: {
    lastRecomputeTime: PropertyDataDep;
    nextRecomputeTime: PropertyDataDep;
  };
  
  constructor(controller: Controller, args: KlassInstance<typeof RealTime>, dataContext: DataContext) {
    // Create state fields
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
    
    // Register in controller's computation graph
    controller.scheduler.registerComputation(this);
  }
}
```

### 5.2.3 State Access Interface

The framework provides standardized state access interfaces:

```typescript
// Get state key name through scheduler
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

// State value read/write
async getStateValue(stateKey: string): Promise<number> {
  if (this.dataContext.type === 'global') {
    return await this.controller.system.storage.get(DICTIONARY_RECORD, stateKey);
  } else {
    // Property-level state stored on records
    return await this.controller.system.storage.get(this.dataContext.host.name, stateKey);
  }
}
```

## 5.3 Scheduling Algorithm Implementation

### 5.3.1 Dual Scheduling Strategy

RealTime computations use different scheduling strategies based on return type:

#### Expression Type Scheduling

```typescript
// Expression type: Uses user-defined intervals
computeNextRecomputeTime(lastTime: number, result: Expression): number {
  if (this.args.nextRecomputeTime) {
    const interval = this.args.nextRecomputeTime(lastTime, this.dataDeps);
    return lastTime + interval;
  }
  return lastTime + 60000; // Default 1 minute
}
```

#### Inequality/Equation Type Scheduling

```typescript
// Inequality/Equation type: Uses solve() to calculate critical time points
computeNextRecomputeTime(lastTime: number, result: Inequality | Equation): number {
  try {
    const criticalTime = result.solve();
    return criticalTime !== null ? criticalTime : lastTime + 60000;
  } catch (error) {
    console.warn('Failed to solve equation/inequality:', error);
    return lastTime + 60000; // Fallback to fixed interval
  }
}
```

### 5.3.2 Scheduler Integration

RealTime computations integrate with the framework's time management system through the Scheduler:

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
      this.scheduleNextExecution(computation); // Schedule next execution
    } catch (error) {
      console.error('RealTime computation failed:', error);
      // Error recovery strategy
      this.scheduleRetry(computation);
    }
  }
}
```

## 5.4 Mathematical Expression Processing

### 5.4.1 Expression System Integration

RealTime computations are deeply integrated with MathResolver's Expression system:

```typescript
// Using Expression objects in RealTime callbacks
callback: async (now: Expression, dataDeps: any) => {
  // now is an Expression instance supporting chained calculations
  const timeInSeconds = now.divide(1000);
  const timeInMinutes = now.divide(60000);
  
  // Support complex mathematical operations
  return timeInSeconds.multiply(factor).add(timeInMinutes.sqrt());
}
```

### 5.4.2 Time Expression Optimization

To optimize time-related calculations, the framework provides specialized time expression processing:

```typescript
class TimeExpression extends Expression {
  // Specially optimized time operations
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
  
  // Timezone handling
  adjustTimezone(offsetHours: number): Expression {
    return this.add(offsetHours * 3600000);
  }
  
  // Time modulo operations (for periodic checks)
  modDay(): Expression {
    return this.modulo(86400000);
  }
  
  modHour(): Expression {
    return this.modulo(3600000);
  }
}
```

### 5.4.3 Inequality/Equation Solving

For computations returning Inequality or Equation, the system uses algebraic solvers:

```typescript
// Inequality solving example
now.gt(deadline) // Solve: now > deadline critical point

// Internal system processing
class InequalityTimeResolver {
  solve(inequality: Inequality): number | null {
    // Extract linear form: ax + b > c
    const linearForm = inequality.getLinearForm('now');
    
    if (linearForm.coefficient !== 0) {
      // Solve: now = (c - b) / a
      const criticalTime = (linearForm.constant - linearForm.bias) / linearForm.coefficient;
      return Math.ceil(criticalTime); // Round up to ensure trigger
    }
    
    return null; // Cannot solve
  }
}
```

## 5.5 Data Dependency Processing

### 5.5.1 DataDeps Resolution

RealTime computations support complex data dependency configurations:

```typescript
interface RealTimeDataDeps {
  [key: string]: {
    type: 'records' | 'property' | 'global';
    source?: Entity | Relation | Dictionary;
    attributeQuery?: AttributeQueryData;
  }
}

// Data dependency resolver
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
    
    // Use attributeQuery to optimize queries
    const attributeQuery = dep.attributeQuery || ['*'];
    
    return await storage.find(entityName, null, undefined, attributeQuery);
  }
}
```

### 5.5.2 Dependency Change Monitoring

RealTime computations monitor changes in data dependencies:

```typescript
class RealTimeComputation {
  setupDependencyListeners() {
    Object.values(this.dataDeps).forEach(dep => {
      if (dep.type === 'records') {
        // Listen for entity record changes
        this.controller.eventBus.on(`${dep.source.name}:change`, () => {
          this.markForRecompute();
        });
      }
    });
  }
  
  markForRecompute() {
    // Immediately schedule recomputation
    clearTimeout(this.scheduledHandle);
    this.scheduleImmediate();
  }
}
```

## 5.6 Performance Optimization

### 5.6.1 Computation Caching

RealTime computations implement multi-layer caching mechanisms:

```typescript
class ComputationCache {
  private expressionCache = new Map<string, any>();
  private dependencyCache = new Map<string, any>();
  
  // Expression result caching
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
  
  // Data dependency caching
  cacheDependencies(depsHash: string, data: any) {
    this.dependencyCache.set(depsHash, {
      data,
      timestamp: Date.now()
    });
  }
}
```

### 5.6.2 Batch Computation Optimization

For large numbers of similar RealTime computations, the system supports batch processing:

```typescript
class BatchRealTimeProcessor {
  private pendingComputations: RealTimeComputation[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  
  scheduleComputation(computation: RealTimeComputation) {
    this.pendingComputations.push(computation);
    
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, 10); // 10ms batch window
    }
  }
  
  private async processBatch() {
    const batch = this.pendingComputations.splice(0);
    this.batchTimeout = null;
    
    // Group by data dependencies
    const groups = this.groupByDataDeps(batch);
    
    // Process each group in parallel
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

### 5.6.3 Memory Management

RealTime computations include intelligent memory management mechanisms:

```typescript
class RealTimeMemoryManager {
  private static readonly MAX_CACHE_SIZE = 1000;
  private static readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  
  private computationRegistry = new WeakMap<RealTimeComputation, ComputationMetrics>();
  
  constructor() {
    // Periodic memory cleanup
    setInterval(() => {
      this.performMemoryCleanup();
    }, RealTimeMemoryManager.CLEANUP_INTERVAL);
  }
  
  private performMemoryCleanup() {
    // Clean expired expression cache
    this.cleanupExpressionCache();
    
    // Clean inactive computations
    this.cleanupInactiveComputations();
    
    // Force garbage collection (in supported environments)
    if (global.gc) {
      global.gc();
    }
  }
  
  private cleanupInactiveComputations() {
    const now = Date.now();
    const inactiveThreshold = 3600000; // 1 hour
    
    this.controller.scheduler.computations.forEach((comp, id) => {
      if (comp.lastExecutionTime < now - inactiveThreshold) {
        this.controller.scheduler.unregisterComputation(id);
      }
    });
  }
}
```

## 5.7 Error Handling and Recovery

### 5.7.1 Error Classification

The RealTime computation system defines the following error types:

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

### 5.7.2 Error Recovery Strategies

The system implements multi-level error recovery mechanisms:

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
    
    // Try using default value
    if (computation.args.defaultValue) {
      await this.setComputationResult(computation, computation.args.defaultValue());
    }
    
    // Extend retry interval
    const retryDelay = Math.min(600000, computation.retryCount * 60000); // Max 10 minutes
    this.scheduler.scheduleRetry(computation, retryDelay);
    
    computation.retryCount++;
  }
  
  private async handleExpressionError(error: RealTimeError) {
    // Expression errors usually mean mathematical calculation problems
    // Log error and use safe default scheduling
    this.logger.warn('Expression evaluation failed, using fallback scheduling', error);
    
    const computation = error.computation;
    const fallbackTime = Date.now() + 60000; // Retry in 1 minute
    await this.updateComputationState(computation, { nextRecomputeTime: fallbackTime });
  }
}
```

### 5.7.3 Health Checks

The system includes real-time computation health check mechanisms:

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
        if (metrics.lastExecution > Date.now() - 300000) { // Executed within 5 minutes
          report.activeComputations++;
        }
        
        report.errorRate += metrics.errorRate;
        report.averageExecutionTime += metrics.averageExecutionTime;
        
        // Check for anomalies
        if (metrics.errorRate > 0.1) { // Error rate exceeds 10%
          report.issues.push(`Computation ${id} has high error rate: ${metrics.errorRate}`);
        }
        
        if (metrics.averageExecutionTime > 5000) { // Execution time exceeds 5 seconds
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

## 5.8 Testing and Debugging

### 5.8.1 Unit Testing Support

RealTime computations provide specialized testing tools:

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

### 5.8.2 Debugging Tools

The framework provides rich debugging tools:

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

## 5.9 Extension Interfaces

### 5.9.1 Custom Computation Types

Developers can extend RealTime computation support for new result types:

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
    // Custom processing logic
    return result.nextExecutionTime || Date.now() + 60000;
  }
}

// Usage example
CustomRealTimeProcessor.register('aggregation', {
  computeNextTime: (result: AggregationResult) => {
    return result.nextAggregationTime;
  },
  validateResult: (result: AggregationResult) => {
    return result.value !== undefined;
  }
});
```

### 5.9.2 Middleware Support

RealTime computations support middleware patterns:

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

// Register middleware
RealTimeComputation.use(new LoggingMiddleware());
RealTimeComputation.use(new MetricsMiddleware());
RealTimeComputation.use(new CachingMiddleware());
```

This implementation guide provides a deep dive into all core technical details of RealTime computations, offering complete implementation reference for framework developers and advanced users. By understanding these internal mechanisms, developers can better use, debug, and extend RealTime computation functionality. 