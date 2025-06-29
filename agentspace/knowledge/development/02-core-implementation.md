# 第2章 核心实现（Core Implementation）

## 2.1 响应式计算引擎

### 2.1.1 ComputationSourceMap 依赖映射机制

`ComputationSourceMap` 是整个响应式系统的核心，负责建立数据变更事件与计算任务之间的映射关系。

#### 核心数据结构

```typescript
// 事件源映射的基本结构
export type EntityEventSourceMap = {
    dataDep: DataDep,              // 数据依赖描述
    type: 'create'|'delete'|'update', // 事件类型
    recordName: string,            // 触发事件的实体名
    sourceRecordName: string,      // 依赖源实体名
    targetPath?: string[],         // 依赖路径
    attributes?: string[],         // 相关属性
    computation: Computation       // 需要执行的计算
}

// 双层树结构索引
export type DataSourceMapTree = {
    [recordName: string]: {
        [eventType: string]: EntityEventSourceMap[]
    }
}
```

#### 依赖解析过程

系统在初始化时会遍历所有计算，将其数据依赖转换为事件源映射：

1. **Records 依赖**：监听指定实体集合的增删改事件
2. **Property 依赖**：监听单个记录的属性更新事件
3. **Global 依赖**：监听全局字典的创建和更新事件

```typescript
// 依赖转换的核心逻辑
convertDataDepToERMutationEventsSourceMap(
    dataDepName: string, 
    dataDep: DataDep, 
    computation: Computation
): EntityEventSourceMap[] {
    if (dataDep.type === 'records') {
        // 监听集合的增删改
        return this.handleRecordsDependency(dataDep, computation)
    } else if (dataDep.type === 'property') {
        // 监听属性的更新和记录的创建
        return this.handlePropertyDependency(dataDep, computation)
    } else if (dataDep.type === 'global') {
        // 监听全局状态的变化
        return this.handleGlobalDependency(dataDep, computation)
    }
}
```

#### 关联路径处理

对于复杂的关联查询，系统会递归处理依赖路径：

```typescript
// 处理关联属性的依赖
convertRelationAttrToERMutationEventsSourceMap(
    dataDep: DataDep, 
    baseRecordName: string, 
    subAttrs: AttributeQueryData, 
    context: string[], 
    computation: Computation
) {
    // 1. 监听关联关系的创建/删除
    const relationRecordName = this.controller.system.storage
        .getRelationName(baseRecordName, context.join('.'))
    
    // 2. 监听关联实体的属性更新
    return this.convertAttrsToERMutationEventsSourceMap(
        dataDep, baseRecordName, subAttrs, context, computation
    )
}
```

### 2.1.2 增量计算原理

每个计算类型都实现了增量计算接口，避免全量重新计算：

#### 计算接口设计

```typescript
export interface DataBasedComputation {
    // 全量计算
    compute: (dataDeps: any, record?: any) => Promise<any>
    
    // 增量计算（返回新的完整结果）
    incrementalCompute?: (
        lastValue: any, 
        mutationEvent: RecordMutationEvent, 
        record?: any, 
        dataDeps?: any
    ) => Promise<ComputationResult|any>
    
    // 增量计算（返回结果补丁）
    incrementalPatchCompute?: (
        lastValue: any, 
        mutationEvent: RecordMutationEvent, 
        record?: any, 
        dataDeps?: any
    ) => Promise<ComputationResultPatch|ComputationResultPatch[]>
    
    // 是否需要上次的计算结果
    useLastValue?: boolean
}
```

#### 增量计算示例

以 `Count` 计算为例：

```typescript
// Count 的增量计算实现
async incrementalCompute(
    lastValue: number, 
    mutationEvent: RecordMutationEvent
): Promise<number> {
    switch (mutationEvent.type) {
        case 'create':
            return lastValue + 1
        case 'delete':
            return lastValue - 1
        case 'update':
            // 更新操作不影响计数
            return lastValue
    }
}
```

#### 计算结果类型

系统定义了多种计算结果类型来控制执行流程：

```typescript
export class ComputationResult {
    static skip = () => new ComputationResultSkip()           // 跳过此次计算
    static resolved = (result: any) => new ComputationResultResolved(result) // 同步结果
    static async = (args: any) => new ComputationResultAsync(args)  // 异步计算
    static fullRecompute = () => new ComputationResultFullRecompute() // 需要全量重算
}
```

### 2.1.3 依赖追踪机制

系统通过 `Scheduler` 类实现精确的依赖追踪：

#### 脏数据检测

```typescript
// 计算受影响的记录
async computeDataBasedDirtyRecordsAndEvents(
    source: EntityEventSourceMap, 
    mutationEvent: RecordMutationEvent
) {
    const computation = source.computation as DataBasedComputation
    
    // 获取受影响的记录集合
    const dirtyRecords = await this.computeDirtyDataDepRecords(source, mutationEvent)
    
    // 为每个受影响的记录创建计算任务
    return dirtyRecords.map(record => [record, {
        dataDep: source.dataDep,
        ...mutationEvent
    }])
}
```

#### 计算调度

调度器负责按正确的顺序执行计算任务：

```typescript
async runDirtyRecordsComputation(
    source: EntityEventSourceMap, 
    mutationEvent: RecordMutationEvent
) {
    // 获取所有需要重新计算的记录
    const dirtyRecordsAndEvents = await this.computeDataBasedDirtyRecordsAndEvents(
        source, mutationEvent
    )
    
    // 逐个执行计算
    for (const [record, erRecordMutationEvent] of dirtyRecordsAndEvents) {
        await this.runComputation(source.computation, erRecordMutationEvent, record)
    }
}
```

## 2.2 数据变更追踪

### 2.2.1 Mutation Event 事件模型

系统中所有的数据变更都会产生标准化的变更事件：

```typescript
export type RecordMutationEvent = {
    type: 'create' | 'update' | 'delete'
    recordName: string      // 发生变更的实体名
    record: any            // 变更的记录数据
    oldRecord?: any        // 更新前的旧数据
    diff?: any             // 变更的差异
}

export type EtityMutationEvent = RecordMutationEvent & {
    dataDep: DataDep       // 关联的数据依赖
    attributes?: string[]   // 变更的属性
    relatedAttribute?: string[]
    relatedMutationEvent?: RecordMutationEvent
    isRelation?: boolean   // 是否为关系变更
}
```

### 2.2.2 事件传播机制

当数据发生变更时，系统会：

1. **生成变更事件**：记录变更的详细信息
2. **查找相关计算**：通过 `ComputationSourceMap` 找到需要触发的计算
3. **过滤匹配条件**：检查变更是否满足计算的触发条件
4. **执行计算任务**：按依赖关系执行相关计算

```typescript
// 事件传播的核心逻辑
async handleMutationEvent(mutationEvent: RecordMutationEvent) {
    // 1. 查找相关的计算任务
    const sourceMaps = this.sourceMapManager.findSourceMapsForMutation(mutationEvent)
    
    // 2. 过滤符合条件的任务
    const validSourceMaps = sourceMaps.filter(source => 
        this.sourceMapManager.shouldTriggerUpdateComputation(source, mutationEvent)
    )
    
    // 3. 执行计算任务
    for (const source of validSourceMaps) {
        await this.runDirtyRecordsComputation(source, mutationEvent)
    }
}
```

### 2.2.3 副作用处理

计算执行后可能产生副作用，系统提供了统一的副作用处理机制：

```typescript
// 应用计算结果
async applyResult(dataContext: DataContext, result: any, record?: any) {
    if (dataContext.type === 'property') {
        // 更新实体属性
        await this.updateEntityProperty(dataContext, result, record)
    } else if (dataContext.type === 'global') {
        // 更新全局字典
        await this.updateGlobalState(dataContext, result)
    }
    
    // 副作用可能触发新的变更事件，形成计算链
}

// 应用增量结果补丁
async applyResultPatch(dataContext: DataContext, patches: ComputationResultPatch[], record?: any) {
    for (const patch of patches) {
        switch (patch.type) {
            case 'insert':
                await this.insertData(dataContext, patch.data, record)
                break
            case 'update':
                await this.updateData(dataContext, patch.data, record)
                break
            case 'delete':
                await this.deleteData(dataContext, patch.affectedId, record)
                break
        }
    }
}
```

## 2.3 活动状态机

### 2.3.1 状态管理

活动（Activity）使用状态机模型来管理复杂的业务流程：

```typescript
// 活动状态的数据结构
export type ActivitySeqStateData = {
    current?: InteractionStateData  // 当前执行的交互
}

export type InteractionStateData = {
    uuid: string                    // 交互的唯一标识
    children?: ActivitySeqStateData[] // 子活动序列（用于并行/选择）
}
```

#### 状态节点类型

系统支持多种类型的状态节点：

1. **交互节点**（InteractionNode）：执行具体的业务操作
2. **活动组节点**（ActivityGroupNode）：管理子活动的执行
3. **网关节点**（GatewayNode）：控制流程分支和合并

```typescript
export type InteractionNode = {
    content: InteractionInstanceType
    parentGroup?: ActivityGroupNode
    uuid: string
    next: GraphNode|null
    prev?: GraphNode
    parentSeq: Seq
}

export type ActivityGroupNode = {
    content: ActivityGroupInstanceType
    parentGroup?: ActivityGroupNode
    childSeqs?: Seq[]  // 子序列
    uuid: string
    next: GraphNode|null
    prev?: GraphNode
    parentSeq: Seq
}
```

### 2.3.2 转移逻辑

状态转移是活动执行的核心机制：

```typescript
class ActivitySeqState {
    // 转移到下一个状态
    transferToNext(uuid: string) {
        const node = this.graph.getNodeByUUID(uuid) as InteractionLikeNodeBase
        delete this.current
        
        // 如果有下一个节点，创建新的状态
        if (node.next) {
            const nextState = InteractionState.createInitialState(
                node.next as InteractionLikeNodeBase
            )
            this.current = InteractionState.create(nextState, this.graph, this)
        }
        
        // 通知父级状态变更
        this.parent?.onChange(uuid, node.next?.uuid)
    }
    
    // 检查交互是否可用
    isInteractionAvailable(uuid: string): boolean {
        if (!this.current) return false
        
        if (this.current?.children) {
            // 检查子状态
            return Object.values(this.current.children)
                .some(child => child.isInteractionAvailable(uuid))
        } else {
            // 检查当前状态
            return this.current.node!.uuid === uuid
        }
    }
}
```

### 2.3.3 并发控制

系统支持多种并发控制模式：

#### Any 模式（任一完成）

```typescript
class AnyActivityStateNode extends InteractionState {
    onChange(childPrevUUID: string, childNextUUID?: string) {
        if (!childNextUUID) {
            // 任一子活动完成，整个组完成
            this.complete()
        }
    }
}
```

#### Every 模式（全部完成）

```typescript
class EveryActivityStateNode extends InteractionState {
    onChange(childPrevUUID: string, childNextUUID?: string) {
        if (!childNextUUID && this.isGroupCompleted()) {
            // 所有子活动完成，整个组完成
            this.complete()
        }
    }
    
    isGroupCompleted() {
        return this.children?.every(childSeq => !childSeq.current)
    }
}
```

#### Race 模式（竞争完成）

```typescript
class RaceActivityStateNode extends InteractionState {
    onChange(childPrevUUID: string, childNextUUID?: string) {
        if (!childNextUUID) {
            // 第一个完成的子活动胜出，终止其他子活动
            this.terminateOtherChildren(childPrevUUID)
            this.complete()
        }
    }
}
```

## 2.4 存储层实现

### 2.4.1 实体表映射

存储层通过 `EntityToTableMap` 实现实体到数据库表的映射：

```typescript
export type RecordMapItem = {
    table: string                    // 对应的数据库表
    attributes: {                    // 属性映射
        [k: string]: ValueAttribute|RecordAttribute
    }
    isRelation?: boolean            // 是否为关系实体
    sourceRecordName?: string       // 源实体名（用于过滤实体）
    filterCondition?: MatchExp      // 过滤条件
}

export type ValueAttribute = {
    type: string                    // 属性类型
    collection?: boolean            // 是否为集合
    table?: string                  // 存储表
    field: string                   // 字段名
    fieldType?: string             // 数据库字段类型
    computed?: (record: any) => any // 计算函数
    defaultValue?: () => any       // 默认值
}

export type RecordAttribute = {
    type: 'id'                     // 关系属性标识
    isRecord: true                 // 标记为记录引用
    linkName: string               // 关联名称
    isSource?: boolean             // 是否为源端
    relType: ['1'|'n', '1'|'n']   // 关系类型
    recordName: string             // 目标实体名
    table?: string                 // 存储表
    field?: string                 // 字段名
    isReliance?: boolean           // 是否为依赖关系
}
```

### 2.4.2 关系表设计

系统支持多种关系存储策略：

#### 关系映射结构

```typescript
export type LinkMapItem = {
    relType: [string, string]       // 关系类型（如 ['1', 'n']）
    sourceRecord: string            // 源实体
    sourceProperty: string          // 源属性
    targetRecord: string            // 目标实体
    targetProperty: string|undefined // 目标属性
    isSourceRelation?: boolean      // 是否为源关系
    recordName?: string             // 关系记录名
    mergedTo?: 'source'|'target'|'combined' // 合并策略
    table?: string                  // 存储表
    sourceField?: string            // 源字段
    targetField?: string            // 目标字段
    isTargetReliance?: boolean      // 是否为目标依赖
}
```

#### 表合并优化

系统会根据关系类型自动选择最优的存储策略：

1. **一对一关系**：通常合并到源表或目标表
2. **一对多关系**：在"多"端存储外键
3. **多对多关系**：创建独立的关联表
4. **依赖关系**：确保生命周期的正确管理

```typescript
// 获取表和字段映射
getTableAliasAndFieldName(
    namePath: string[], 
    attributeName: string
): [string, string, string] {
    const info = this.getInfoByPath([...namePath, attributeName])
    const tableAlias = this.getTableAndAliasStack(namePath).slice(-1)[0].alias
    const fieldName = info.getFieldName()
    const tableName = info.getTableName()
    
    return [tableAlias, fieldName, tableName]
}
```

### 2.4.3 查询优化

存储层实现了多种查询优化策略：

#### 路径解析优化

```typescript
// 构建表连接栈
getTableAndAliasStack(namePath: string[]): TableAndAliasStack {
    const [rootEntityName, ...relationPath] = namePath
    let lastEntityData = this.data.records[rootEntityName]
    let lastTable = lastEntityData.table
    let lastTableAlias = rootEntityName
    
    const result: TableAndAliasStack = [{
        table: lastTable,
        alias: lastTableAlias,
        record: lastEntityData,
        isLinkRecord: false,
        path: [rootEntityName]
    }]
    
    // 遍历关系路径，构建连接栈
    for (const relationName of relationPath) {
        const linkInfo = this.getLinkInfo(lastEntityData.name, relationName)
        // 添加连接信息到栈中
        result.push(this.buildJoinInfo(linkInfo, lastTableAlias))
        lastEntityData = this.getRecord(linkInfo.getTargetRecord())
        lastTable = lastEntityData.table
        lastTableAlias = this.generateAlias(relationName)
    }
    
    return result
}
```

#### 对称关系处理

```typescript
// 处理对称关系的特殊逻辑
spawnManyToManySymmetricPath(namePath: string[]): [string[], string[]] | undefined {
    const symmetricPath = this.findManyToManySymmetricPath(namePath)
    if (symmetricPath) {
        // 分解为正向和反向路径
        const forwardPath = [...namePath]
        const reversePath = [...symmetricPath]
        return [forwardPath, reversePath]
    }
    return undefined
}
```

### 2.4.4 事务处理

存储层提供了完整的事务支持：

```typescript
// 事务管理接口
interface TransactionManager {
    begin(): Promise<Transaction>
    commit(transaction: Transaction): Promise<void>
    rollback(transaction: Transaction): Promise<void>
}

// 在计算执行中使用事务
async runComputationWithTransaction(computation: Computation, mutationEvent: RecordMutationEvent) {
    const transaction = await this.storage.begin()
    
    try {
        // 执行计算
        const result = await this.runComputation(computation, mutationEvent)
        
        // 应用结果
        await this.applyResult(computation.dataContext, result)
        
        // 提交事务
        await this.storage.commit(transaction)
    } catch (error) {
        // 回滚事务
        await this.storage.rollback(transaction)
        throw error
    }
}
```

## 小结

本章详细介绍了 interaqt 的四个核心实现模块：

1. **响应式计算引擎**：通过 ComputationSourceMap 建立数据依赖映射，实现精确的增量计算和依赖追踪
2. **数据变更追踪**：标准化的事件模型和传播机制，确保数据变更能够正确触发相关计算
3. **活动状态机**：支持复杂业务流程的状态管理和并发控制
4. **存储层实现**：灵活的实体表映射、关系存储优化和事务管理

这些核心机制共同构成了一个高效、可靠的响应式后端框架，为上层应用提供了强大的数据处理能力。理解这些实现细节对于框架的扩展开发和性能优化具有重要意义。 