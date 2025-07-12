# 实现 DataBasedComputation 指南

本文档提供了如何实现自定义的 DataBasedComputation 的详细指南，基于已有的 WeightedSummation、Every、Any 等实现经验。

## 什么是 DataBasedComputation

DataBasedComputation 是一个接口，用于定义基于数据的计算逻辑。它是增量计算的基础，允许系统根据数据变化高效地更新计算结果，而不是每次都重新计算全部数据。

## 核心组件

实现一个 DataBasedComputation 通常需要以下核心组件：

1. **处理类** - 例如 `GlobalXXXHandle` 和 `PropertyXXXHandle`
2. **状态管理** - 使用 `GlobalBoundState` 或 `RecordBoundState`
3. **计算逻辑** - 包括初始计算 (`compute`) 和增量计算 (`incrementalCompute`)
4. **数据依赖** - 通过 `dataDeps` 定义计算所需的数据源

## 实现步骤

### 1. 定义处理类

通常需要为全局计算和属性计算分别实现处理类：

```typescript
// 全局计算处理类
export class GlobalXXXHandle implements DataBasedComputation {
    // 实现...
}

// 实体属性计算处理类
export class PropertyXXXHandle implements DataBasedComputation {
    // 实现...
}
```

### 2. 实现 DataBasedComputation 接口

每个处理类需要实现 DataBasedComputation 接口的必要方法和属性：

```typescript
export class GlobalXXXHandle implements DataBasedComputation {
    // 上下文和回调函数
    callback: (this: Controller, item: any) => any
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    
    // 构造函数
    constructor(public controller: Controller, args: KlassInstance<typeof XXX>, public dataContext: DataContext) {
        // 初始化...
    }
    
    // 状态管理
    createState() {
        // 返回状态对象...
    }
    
    // 默认值
    getDefaultValue() {
        // 返回默认值...
    }
    
    // 全量计算
    async compute(data: any): Promise<any> {
        // 实现计算逻辑...
    }
    
    // 增量计算
    async incrementalCompute(lastValue: any, mutationEvent: ERRecordMutationEvent): Promise<any> {
        // 实现增量计算逻辑...
    }
}
```

### 3. 定义数据依赖

在构造函数中，需要定义计算所需的数据依赖：

```typescript
constructor(public controller: Controller, args: KlassInstance<typeof XXX>, public dataContext: DataContext) {
    this.callback = args.callback.bind(this)
    
    this.dataDeps = {
        main: {
            type: 'records',
            source: args.record,
            attributeQuery: args.attributeQuery || []
        }
    }
}
```

### 4. 实现状态管理

根据计算类型，使用 GlobalBoundState 或 RecordBoundState 来管理状态：

```typescript
// 全局状态
createState() {
    return {
        result: new GlobalBoundState<number>(0) // 初始值
    }
}

// 记录绑定状态
createState() {
    return {
        result: new RecordBoundState<number>(0) // 初始值
    }
}
```

### 5. 实现全量计算

`compute` 方法用于执行初始的全量计算：

```typescript
async compute({main: records}: {main: any[]}): Promise<number> {
    // 对记录执行计算
    let result = 0;
    for (const record of records) {
        // 应用计算逻辑
        result += this.calculateValue(record);
    }
    
    // 保存状态
    await this.state.result.set(result);
    return result;
}
```

### 6. 实现增量计算

`incrementalCompute` 方法是优化的关键，它只处理变化的部分：

```typescript
async incrementalCompute(lastValue: number, mutationEvent: ERRecordMutationEvent): Promise<number> {
    let result = lastValue;
    
    if (mutationEvent.type === 'create') {
        // 处理新建记录
        const newValue = this.calculateValue(mutationEvent.record);
        result = result + newValue;
    } else if (mutationEvent.type === 'delete') {
        // 处理删除记录
        const oldValue = this.calculateValue(mutationEvent.oldRecord);
        result = result - oldValue;
    } else if (mutationEvent.type === 'update') {
        // 处理更新记录
        const oldValue = this.calculateValue(mutationEvent.oldRecord);
        const newValue = this.calculateValue(mutationEvent.record);
        result = result - oldValue + newValue;
    }
    
    // 更新状态
    await this.state.result.set(result);
    return result;
}
```

### 7. 声明支持的计算类型

每个处理类需要声明它所支持的计算类型和数据上下文类型：

```typescript
export class GlobalXXXHandle implements DataBasedComputation {
    static computationType = XXX
    static contextType = 'global' as const
    // ... 其他实现
}

export class PropertyXXXHandle implements DataBasedComputation {
    static computationType = XXX  
    static contextType = 'property' as const
    // ... 其他实现
}

// 如果一个处理类支持多种上下文类型
export class MultiContextHandle implements DataBasedComputation {
    static computationType = XXX
    static contextType = ['entity', 'relation'] as const
    // ... 其他实现
}

// 导出计算处理器数组
export const XXXHandles = [GlobalXXXHandle, PropertyXXXHandle];
```

### 8. 使用自定义计算

在创建 Controller 时，将自定义计算处理器传入：

```typescript
const controller = new Controller({
    system: system,
    entities: entities,
    relations: relations,
    activities: [],
    interactions: [],
    computations: [...XXXHandles] // 传入自定义计算处理器
});
```

## 实现示例：WeightedSummation

下面是 WeightedSummation 的实现示例，展示了如何创建加权求和计算：

### 全局加权求和

```typescript
export class GlobalWeightedSummationHandle implements DataBasedComputation {
    matchRecordToWeight: (this: Controller, item: any) => { weight: number; value: number }
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}

    constructor(public controller: Controller, args: KlassInstance<typeof WeightedSummation>, public dataContext: DataContext) {
        this.matchRecordToWeight = args.callback.bind(this)
        this.dataDeps = {
            main: {
                type: 'records',
                source: args.record,
                attributeQuery: args.attributeQuery || []
            }
        }
    }

    createState() {
        return {
            summation: new GlobalBoundState<number>(0)
        }
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({main: records}: {main: any[]}): Promise<number> {
        let summation = 0;
        
        for (const record of records) {
            const result = this.matchRecordToWeight.call(this.controller, record);
            summation += result.weight * result.value;
        }

        await this.state.summation.set(summation);
        return summation;
    }

    async incrementalCompute(lastValue: number, mutationEvent: ERRecordMutationEvent): Promise<number> {
        let summation = await this.state!.summation.get();
        
        if (mutationEvent.type === 'create') {
            const newItem = mutationEvent.record;
            const result = this.matchRecordToWeight.call(this.controller, newItem);
            summation = await this.state!.summation.set(summation + (result.weight * result.value));
        } else if (mutationEvent.type === 'delete') {
            const oldItem = mutationEvent.oldRecord;
            const result = this.matchRecordToWeight.call(this.controller, oldItem);
            summation = await this.state!.summation.set(summation - (result.weight * result.value));
        } else if (mutationEvent.type === 'update') {
            const oldItem = mutationEvent.oldRecord;
            const newItem = mutationEvent.record;
            
            const oldResult = this.matchRecordToWeight.call(this.controller, oldItem);
            const newResult = this.matchRecordToWeight.call(this.controller, newItem);
            
            const oldValue = oldResult.weight * oldResult.value;
            const newValue = newResult.weight * newResult.value;
            
            summation = await this.state!.summation.set(summation - oldValue + newValue);
        }

        return summation;
    }
}
```

## 实现示例：属性计算

特别地，属性计算需要处理关系数据：

```typescript
export class PropertyXXXHandle implements DataBasedComputation {
    callback: (this: Controller, item: any) => any
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean

    constructor(public controller: Controller, public args: KlassInstance<typeof XXX>, public dataContext: PropertyDataContext) {
        this.callback = args.callback.bind(this)

        const relation = args.record as KlassInstance<typeof Relation>
        this.relationAttr = relation.source.name === dataContext.host.name ? relation.sourceProperty : relation.targetProperty
        this.isSource = relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource ? relation.target.name : relation.source.name
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: args.attributeQuery || []}]]
            }
        }
    }

    createState() {
        return {
            result: new RecordBoundState<any>(this.getDefaultValue())
        }   
    }
    
    getDefaultValue() {
        return 0 // 或其他默认值
    }

    async compute({_current}: {_current: any}): Promise<any> {
        // 实现具体的计算逻辑...
    }

    async incrementalCompute(lastValue: any, mutationEvent: ERRecordMutationEvent): Promise<any> {
        // 特别处理关联变更...
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;
        
        if (relatedMutationEvent.type === 'create') {
            // 处理关联创建...
        } else if (relatedMutationEvent.type === 'delete') {
            // 处理关联删除...
        } else if (relatedMutationEvent.type === 'update') {
            // 处理关联更新...
        }

        return result;
    }
}
```

## 性能考虑

1. **状态缓存** - 使用 RecordBoundState 和 GlobalBoundState 来缓存中间计算结果
2. **增量计算** - 只处理发生变化的数据部分
3. **数据依赖** - 精确定义计算所需的数据，避免不必要的数据获取
4. **事件处理** - 根据事件类型（创建/更新/删除）采取不同的处理策略

## 调试技巧

1. 确保 callback 函数正确绑定了 this
2. 验证状态是否正确保存和读取
3. 检查增量计算是否正确处理所有场景
4. 使用日志跟踪计算过程中的值变化
5. 确保在处理关系数据时正确识别源和目标

## 最佳实践

1. **分离关注点** - 将全局计算和属性计算的逻辑分开
2. **保持简洁** - 每个计算只负责一种明确的计算任务
3. **处理边界情况** - 考虑零值、负值、空集合等特殊情况
4. **添加类型注解** - 确保类型安全和代码可读性
5. **全面测试** - 针对不同场景编写测试用例
6. **命名一致** - 遵循项目的命名约定
7. **文档注释** - 为复杂的计算逻辑添加注释 