# Chapter 2: Core Implementation

## 2.1 Reactive Computation Engine

### 2.1.1 ComputationSourceMap Dependency Mapping Mechanism

`ComputationSourceMap` is the core of the entire reactive system, responsible for establishing mapping relationships between data change events and computation tasks.

#### Core Data Structures

```typescript
// Basic structure of event source mapping
export type EntityEventSourceMap = {
    dataDep: DataDep,              // Data dependency description
    type: 'create'|'delete'|'update', // Event type
    recordName: string,            // Entity name that triggers the event
    sourceRecordName: string,      // Source entity name for dependency
    targetPath?: string[],         // Dependency path
    attributes?: string[],         // Related attributes
    computation: Computation       // Computation to be executed
}

// Double-layer tree structure index
export type DataSourceMapTree = {
    [recordName: string]: {
        [eventType: string]: EntityEventSourceMap[]
    }
}
```

#### Dependency Resolution Process

During initialization, the system traverses all computations and converts their data dependencies into event source mappings:

1. **Records Dependencies**: Monitor create/delete/update events on specified entity collections
2. **Property Dependencies**: Monitor attribute update events on individual records
3. **Global Dependencies**: Monitor creation and update events on global dictionaries

```typescript
// Core logic of dependency conversion
convertDataDepToERMutationEventsSourceMap(
    dataDepName: string, 
    dataDep: DataDep, 
    computation: Computation
): EntityEventSourceMap[] {
    if (dataDep.type === 'records') {
        // Monitor collection create/delete/update
        return this.handleRecordsDependency(dataDep, computation)
    } else if (dataDep.type === 'property') {
        // Monitor attribute updates and record creation
        return this.handlePropertyDependency(dataDep, computation)
    } else if (dataDep.type === 'global') {
        // Monitor global state changes
        return this.handleGlobalDependency(dataDep, computation)
    }
}
```

#### Association Path Processing

For complex association queries, the system recursively processes dependency paths:

```typescript
// Handle dependencies for associated attributes
convertRelationAttrToERMutationEventsSourceMap(
    dataDep: DataDep, 
    baseRecordName: string, 
    subAttrs: AttributeQueryData, 
    context: string[], 
    computation: Computation
) {
    // 1. Monitor creation/deletion of associations
    const relationRecordName = this.controller.system.storage
        .getRelationName(baseRecordName, context.join('.'))
    
    // 2. Monitor attribute updates on associated entities
    return this.convertAttrsToERMutationEventsSourceMap(
        dataDep, baseRecordName, subAttrs, context, computation
    )
}
```

### 2.1.2 Incremental Computation Principles

Each computation type implements an incremental computation interface to avoid full recomputation:

#### Computation Interface Design

```typescript
export interface DataBasedComputation {
    // Full computation
    compute: (dataDeps: any, record?: any) => Promise<any>
    
    // Incremental computation (returns new complete result)
    incrementalCompute?: (
        lastValue: any, 
        mutationEvent: RecordMutationEvent, 
        record?: any, 
        dataDeps?: any
    ) => Promise<ComputationResult|any>
    
    // Incremental computation (returns result patches)
    incrementalPatchCompute?: (
        lastValue: any, 
        mutationEvent: RecordMutationEvent, 
        record?: any, 
        dataDeps?: any
    ) => Promise<ComputationResultPatch|ComputationResultPatch[]>
    
    // Whether last computation result is needed
    useLastValue?: boolean
}
```

#### Incremental Computation Example

Using `Count` computation as an example:

```typescript
// Count's incremental computation implementation
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
            // Update operations don't affect count
            return lastValue
    }
}
```

#### Computation Result Types

The system defines multiple computation result types to control execution flow:

```typescript
export class ComputationResult {
    static skip = () => new ComputationResultSkip()           // Skip this computation
    static resolved = (result: any) => new ComputationResultResolved(result) // Synchronous result
    static async = (args: any) => new ComputationResultAsync(args)  // Async computation
    static fullRecompute = () => new ComputationResultFullRecompute() // Need full recomputation
}
```

### 2.1.3 Dependency Tracking Mechanism

The system implements precise dependency tracking through the `Scheduler` class:

#### Dirty Data Detection

```typescript
// Compute affected records
async computeDataBasedDirtyRecordsAndEvents(
    source: EntityEventSourceMap, 
    mutationEvent: RecordMutationEvent
) {
    const computation = source.computation as DataBasedComputation
    
    // Get affected record set
    const dirtyRecords = await this.computeDirtyDataDepRecords(source, mutationEvent)
    
    // Create computation tasks for each affected record
    return dirtyRecords.map(record => [record, {
        dataDep: source.dataDep,
        ...mutationEvent
    }])
}
```

#### Computation Scheduling

The scheduler is responsible for executing computation tasks in the correct order:

```typescript
async runDirtyRecordsComputation(
    source: EntityEventSourceMap, 
    mutationEvent: RecordMutationEvent
) {
    // Get all records that need recomputation
    const dirtyRecordsAndEvents = await this.computeDataBasedDirtyRecordsAndEvents(
        source, mutationEvent
    )
    
    // Execute computations one by one
    for (const [record, erRecordMutationEvent] of dirtyRecordsAndEvents) {
        await this.runComputation(source.computation, erRecordMutationEvent, record)
    }
}
```

## 2.2 Data Change Tracking

### 2.2.1 Mutation Event Model

All data changes in the system generate standardized change events:

```typescript
export type RecordMutationEvent = {
    type: 'create' | 'update' | 'delete'
    recordName: string      // Entity name where change occurred
    record: any            // Changed record data
    oldRecord?: any        // Old data before update
    diff?: any             // Change diff
}

export type EtityMutationEvent = RecordMutationEvent & {
    dataDep: DataDep       // Associated data dependency
    attributes?: string[]   // Changed attributes
    relatedAttribute?: string[]
    relatedMutationEvent?: RecordMutationEvent
    isRelation?: boolean   // Whether it's a relation change
}
```

### 2.2.2 Event Propagation Mechanism

When data changes occur, the system will:

1. **Generate Change Events**: Record detailed information about changes
2. **Find Related Computations**: Use `ComputationSourceMap` to find computations that need to be triggered
3. **Filter Matching Conditions**: Check if changes meet computation trigger conditions
4. **Execute Computation Tasks**: Execute related computations according to dependency relationships

```typescript
// Core logic of event propagation
async handleMutationEvent(mutationEvent: RecordMutationEvent) {
    // 1. Find related computation tasks
    const sourceMaps = this.sourceMapManager.findSourceMapsForMutation(mutationEvent)
    
    // 2. Filter qualifying tasks
    const validSourceMaps = sourceMaps.filter(source => 
        this.sourceMapManager.shouldTriggerUpdateComputation(source, mutationEvent)
    )
    
    // 3. Execute computation tasks
    for (const source of validSourceMaps) {
        await this.runDirtyRecordsComputation(source, mutationEvent)
    }
}
```

### 2.2.3 Side Effect Processing

Computation execution may produce side effects, and the system provides a unified side effect processing mechanism:

```typescript
// Apply computation results
async applyResult(dataContext: DataContext, result: any, record?: any) {
    if (dataContext.type === 'property') {
        // Update entity property
        await this.updateEntityProperty(dataContext, result, record)
    } else if (dataContext.type === 'global') {
        // Update global dictionary
        await this.updateGlobalState(dataContext, result)
    }
    
    // Side effects may trigger new change events, forming computation chains
}

// Apply incremental result patches
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

## 2.3 Activity State Machine

### 2.3.1 State Management

Activities use state machine models to manage complex business processes:

```typescript
// Activity state data structure
export type ActivitySeqStateData = {
    current?: InteractionStateData  // Currently executing interaction
}

export type InteractionStateData = {
    uuid: string                    // Unique identifier of interaction
    children?: ActivitySeqStateData[] // Child activity sequences (for parallel/choice)
}
```

#### State Node Types

The system supports multiple types of state nodes:

1. **Interaction Nodes** (InteractionNode): Execute specific business operations
2. **Activity Group Nodes** (ActivityGroupNode): Manage child activity execution
3. **Gateway Nodes** (GatewayNode): Control process branching and merging

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
    childSeqs?: Seq[]  // Child sequences
    uuid: string
    next: GraphNode|null
    prev?: GraphNode
    parentSeq: Seq
}
```

### 2.3.2 Transition Logic

State transitions are the core mechanism of activity execution:

```typescript
class ActivitySeqState {
    // Transition to next state
    transferToNext(uuid: string) {
        const node = this.graph.getNodeByUUID(uuid) as InteractionLikeNodeBase
        delete this.current
        
        // If there's a next node, create new state
        if (node.next) {
            const nextState = InteractionState.createInitialState(
                node.next as InteractionLikeNodeBase
            )
            this.current = InteractionState.create(nextState, this.graph, this)
        }
        
        // Notify parent of state change
        this.parent?.onChange(uuid, node.next?.uuid)
    }
    
    // Check if interaction is available
    isInteractionAvailable(uuid: string): boolean {
        if (!this.current) return false
        
        if (this.current?.children) {
            // Check child states
            return Object.values(this.current.children)
                .some(child => child.isInteractionAvailable(uuid))
        } else {
            // Check current state
            return this.current.node!.uuid === uuid
        }
    }
}
```

### 2.3.3 Concurrency Control

The system supports multiple concurrency control modes:

#### Any Mode (Any completion)

```typescript
class AnyActivityStateNode extends InteractionState {
    onChange(childPrevUUID: string, childNextUUID?: string) {
        if (!childNextUUID) {
            // Any child activity completes, entire group completes
            this.complete()
        }
    }
}
```

#### Every Mode (All completion)

```typescript
class EveryActivityStateNode extends InteractionState {
    onChange(childPrevUUID: string, childNextUUID?: string) {
        if (!childNextUUID && this.isGroupCompleted()) {
            // All child activities complete, entire group completes
            this.complete()
        }
    }
    
    isGroupCompleted() {
        return this.children?.every(childSeq => !childSeq.current)
    }
}
```

#### Race Mode (Competitive completion)

```typescript
class RaceActivityStateNode extends InteractionState {
    onChange(childPrevUUID: string, childNextUUID?: string) {
        if (!childNextUUID) {
            // First completed child activity wins, terminate other child activities
            this.terminateOtherChildren(childPrevUUID)
            this.complete()
        }
    }
}
```

## 2.4 Storage Layer Implementation

### 2.4.1 Entity Table Mapping

The storage layer implements entity-to-database table mapping through `EntityToTableMap`:

```typescript
export type RecordMapItem = {
    table: string                    // Corresponding database table
    attributes: {                    // Attribute mapping
        [k: string]: ValueAttribute|RecordAttribute
    }
    isRelation?: boolean            // Whether it's a relation entity
    sourceRecordName?: string       // Source entity name (for filtered entities)
    filterCondition?: MatchExp      // Filter condition
}

export type ValueAttribute = {
    type: string                    // Attribute type
    collection?: boolean            // Whether it's a collection
    table?: string                  // Storage table
    field: string                   // Field name
    fieldType?: string             // Database field type
    computed?: (record: any) => any // Computation function
    defaultValue?: () => any       // Default value
}

export type RecordAttribute = {
    type: 'id'                     // Relation attribute identifier
    isRecord: true                 // Mark as record reference
    linkName: string               // Association name
    isSource?: boolean             // Whether it's source side
    relType: ['1'|'n', '1'|'n']   // Relation type
    recordName: string             // Target entity name
    table?: string                 // Storage table
    field?: string                 // Field name
    isReliance?: boolean           // Whether it's dependency relation
}
```

### 2.4.2 Relation Table Design

The system supports multiple relation storage strategies:

#### Relation Mapping Structure

```typescript
export type LinkMapItem = {
    relType: [string, string]       // Relation type (e.g. ['1', 'n'])
    sourceRecord: string            // Source entity
    sourceProperty: string          // Source property
    targetRecord: string            // Target entity
    targetProperty: string|undefined // Target property
    isSourceRelation?: boolean      // Whether it's source relation
    recordName?: string             // Relation record name
    mergedTo?: 'source'|'target'|'combined' // Merge strategy
    table?: string                  // Storage table
    sourceField?: string            // Source field
    targetField?: string            // Target field
    isTargetReliance?: boolean      // Whether it's target dependency
}
```

#### Table Merge Optimization

The system automatically selects optimal storage strategies based on relation types:

1. **One-to-One Relations**: Usually merged into source or target table
2. **One-to-Many Relations**: Store foreign key on "many" side
3. **Many-to-Many Relations**: Create independent association table
4. **Dependency Relations**: Ensure correct lifecycle management

```typescript
// Get table and field mapping
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

### 2.4.3 Query Optimization

The storage layer implements multiple query optimization strategies:

#### Path Resolution Optimization

```typescript
// Build table join stack
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
    
    // Traverse relation path, build join stack
    for (const relationName of relationPath) {
        const linkInfo = this.getLinkInfo(lastEntityData.name, relationName)
        // Add join information to stack
        result.push(this.buildJoinInfo(linkInfo, lastTableAlias))
        lastEntityData = this.getRecord(linkInfo.getTargetRecord())
        lastTable = lastEntityData.table
        lastTableAlias = this.generateAlias(relationName)
    }
    
    return result
}
```

#### Symmetric Relation Processing

```typescript
// Handle special logic for symmetric relations
spawnManyToManySymmetricPath(namePath: string[]): [string[], string[]] | undefined {
    const symmetricPath = this.findManyToManySymmetricPath(namePath)
    if (symmetricPath) {
        // Decompose into forward and reverse paths
        const forwardPath = [...namePath]
        const reversePath = [...symmetricPath]
        return [forwardPath, reversePath]
    }
    return undefined
}
```

### 2.4.4 Transaction Processing

The storage layer provides complete transaction support:

```typescript
// Transaction management interface
interface TransactionManager {
    begin(): Promise<Transaction>
    commit(transaction: Transaction): Promise<void>
    rollback(transaction: Transaction): Promise<void>
}

// Use transactions in computation execution
async runComputationWithTransaction(computation: Computation, mutationEvent: RecordMutationEvent) {
    const transaction = await this.storage.begin()
    
    try {
        // Execute computation
        const result = await this.runComputation(computation, mutationEvent)
        
        // Apply result
        await this.applyResult(computation.dataContext, result)
        
        // Commit transaction
        await this.storage.commit(transaction)
    } catch (error) {
        // Rollback transaction
        await this.storage.rollback(transaction)
        throw error
    }
}
```

## Summary

This chapter provides detailed introduction to the four core implementation modules of interaqt:

1. **Reactive Computation Engine**: Establishes data dependency mapping through ComputationSourceMap, implements precise incremental computation and dependency tracking
2. **Data Change Tracking**: Standardized event model and propagation mechanism ensure data changes correctly trigger related computations
3. **Activity State Machine**: Supports state management and concurrency control for complex business processes
4. **Storage Layer Implementation**: Flexible entity table mapping, relation storage optimization, and transaction management

These core mechanisms together form an efficient and reliable reactive backend framework, providing powerful data processing capabilities for upper-layer applications. Understanding these implementation details is crucial for framework extension development and performance optimization.
