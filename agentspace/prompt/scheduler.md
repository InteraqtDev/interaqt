# Scheduler
## Prompt

Scheduler 是负责调度本项目中响应式计算的。项目中的 Computation 就是定义好的响应式计算。对常见的，如 Count/Any/Every 都有定义。
计算方法有两种：
- 全量计算。描述完整的计算方法。
- 增量计算。描述当依赖的数据源发生变化时，应该如何在当前的结果上也做增量计算。

增量计算对于依赖源中有"集合"的场景非常重要，因为在后端最常见的性能问题就是"访问数据库读全表"。当我们的计算依赖于"集合"时，全量计算就是会要读全标。我们的已经内置好的计算都已经自动提供了增量方法。Scheduler 会自动识别有没有增量方法，有就调用。

另外还有一类计算天然只有增量计算方法，就是状态机。因为我们业务中有的逻辑就是基于"事件+基于上一次状态的推演"来表述的，这个含义就是"增量"计算。我们的系统中也默认支持了状态机表达。

现在你的任务：
- [x] 深入阅读 src/runtime 下的 Scheduler 相关的代码，包括相关的 Controller 等。对设计理念、具体实现都写到下面的章节中。
- [ ] 修复双向关系的循环计算问题
- [ ] 实现 Global 和 Entity 类型的异步计算支持
- [ ] 完成 Entity 和 Relation 级别的计算结果应用逻辑
- [ ] 实现事件恢复模式，支持从 event stack 恢复数据
- [ ] 添加 Action 和 Activity 的事件监听支持
- [ ] 实现 Global 数据依赖的变化监听机制
- [ ] 支持属性查询中的通配符展开
- [ ] 添加 MutationEvent 的对外暴露接口

## Document

### 设计理念

Scheduler 是整个响应式系统的核心调度器，负责：
1. **管理计算（Computation）**：收集系统中所有的响应式计算定义，包括实体、属性、关系上的计算数据
2. **监听数据变化**：通过 ComputationSourceMap 建立数据变化到计算的映射关系
3. **触发计算执行**：当数据发生变化时，找到受影响的计算并执行
4. **处理计算结果**：将计算结果应用到系统中

### 核心概念

#### 1. Computation（计算）
计算分为两大类：
- **DataBasedComputation**：基于数据的计算，有明确的数据依赖（dataDeps）
- **EventBasedComputation**：基于事件的计算，响应系统事件（如 Interaction 创建）

计算支持三种执行模式：
- **compute**：全量计算，读取所有依赖数据进行计算
- **incrementalCompute**：增量计算，基于上次结果和变化事件计算新结果
- **incrementalPatchCompute**：增量补丁计算，返回对上次结果的修改操作

#### 2. DataContext（数据上下文）
表示计算结果存储的位置：
- **global**：全局状态，存储在 state 表中
- **entity**：实体级别的计算
- **relation**：关系级别的计算  
- **property**：属性级别的计算，最常见的场景

#### 3. ComputationSourceMap（计算源映射）
建立从数据变化事件到受影响计算的映射关系：
- 将 DataDep（数据依赖）转换为 EntityEventSourceMap（实体事件源映射）
- 构建两层索引树：recordName -> eventType -> computations
- 支持复杂的依赖路径，如通过关系访问关联实体的属性

### 具体实现

#### 1. 初始化流程
```
1. 构造函数：收集所有带 computedData 的实体、属性、关系
2. createStates()：为计算创建持久化状态存储
3. setupDefaultValues()：设置计算的默认值
4. setupStateDefaultValues()：设置状态的默认值
5. setupMutationListeners()：建立数据变化监听
```

#### 2. 数据变化处理流程
```
1. storage.listen() 监听到数据变化事件
2. findSourceMapsForMutation() 查找受影响的计算
3. shouldTriggerUpdateComputation() 判断是否需要触发（对 update 事件检查属性是否真的变化）
4. computeDirtyRecords() 计算受影响的记录
5. runComputation() 执行计算
6. applyResult() 或 applyResultPatch() 应用计算结果
```

#### 3. 异步计算支持
系统支持异步计算，通过创建任务记录来跟踪异步计算状态：
- 为每个异步计算创建独立的任务表
- 任务记录包含：status（状态）、args（参数）、result（结果）
- 异步计算返回后通过 handleAsyncReturn 处理结果

### 未实现和有问题的部分

#### 未实现功能：
1. **Global 类型的异步计算支持**（第99、324行）
   - 目前只实现了 property 类型的异步计算
   - Global 和 Entity 类型的异步计算任务表创建未实现

2. **Entity 和 Relation 级别的计算结果应用**（Controller 96-101行）
   - applyResult() 方法中 entity 和 relation 类型的处理逻辑为空
   - 需要实现如何将计算结果应用到实体或关系级别

3. **Global 类型的增量补丁计算**（Controller 129行）
   - applyResultPatch() 方法中 global 类型的处理逻辑未完成

4. **事件恢复模式**（Controller 90行）
   - 从 event stack 恢复数据的功能未实现
   - 这是实现事件溯源的关键功能

5. **Activity 的事件监听**（ComputationSourceMap 84-85行）
   - 目前只监听了 Interaction 的创建事件
   - Activity 的事件监听未实现

6. **Global 数据依赖的监听**（ComputationSourceMap 190行）
   - Global 类型的 DataDep 如何转换为事件监听未实现

7. **通配符属性查询**（ComputationSourceMap 207行）
   - attributeQuery 中的 '*' 需要读取实体定义来展开

8. **MutationEvent 对外暴露**（Scheduler 187行）
   - 让开发者能观测系统变化的功能未实现

#### 已知问题：
2. **双向关系的循环问题**（Scheduler 205行）
   - 没有考虑 bidirectional 关系的情况
   - 可能导致双向关系的计算陷入死循环

