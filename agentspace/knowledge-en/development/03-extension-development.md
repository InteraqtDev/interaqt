# Chapter 3: Extension Development

## 3.1 Custom Computation Types

### 3.1.1 DataBasedComputation Interface

`DataBasedComputation` is the core interface for all data-based computation types. To create custom computation types, you need to implement this interface:

```typescript
export interface DataBasedComputation {
    dataContext: DataContext                    // Computation context
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}
    
    // Required methods
    compute: (...args: any[]) => Promise<ComputationResult|any>  // Full computation
    
    // Optional methods
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>  // Incremental computation
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>  // Incremental patch computation
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}  // State creation
    
    // Configuration properties
    dataDeps: {[key: string]: any}              // Data dependency definitions
    getDefaultValue?: (...args: any[]) => any   // Default value getter
    useLastValue?: boolean                      // Whether to use last computation result
    asyncReturn?: (...args: any[]) => Promise<ComputationResultSkip|any>  // Async computation result handling
}
```

### 3.1.2 Implementation Steps

#### Step 1: Define Data Dependencies

First, clarify what types of data the computation depends on:

```typescript
// Data dependency types
export type RecordsDataDep = {
    type: 'records',
    source: KlassInstance<typeof Entity>|KlassInstance<typeof Relation>|KlassInstance<typeof Activity>|KlassInstance<typeof Interaction>,
    match?: MatchExpressionData,
    modifier?: ModifierData,
    attributeQuery?: AttributeQueryData
}

export type PropertyDataDep = {
    type: 'property',
    attributeQuery?: AttributeQueryData
}

export type GlobalDataDep = {
    type: 'global',
    source: KlassInstance<typeof Dictionary>
}
```

#### Step 2: Implement Computation Logic

Using `Count` computation as an example, showing the complete implementation process:

```typescript
export class GlobalCountHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: KlassInstance<typeof Entity|typeof Relation>

    constructor(
        public controller: Controller, 
        args: KlassInstance<typeof Count>, 
        public dataContext: DataContext
    ) {
        this.record = args.record
        
        // Define data dependencies
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record
            }
        }
    }
    
    // Create state (optional)
    createState() {
        return {}   
    }
    
    // Set default value
    getDefaultValue() {
        return 0
    }

    // Full computation implementation
    async compute({main: records}: {main: any[]}): Promise<number> {
        return records.length;
    }

    // Incremental computation implementation
    async incrementalCompute(
        lastValue: number, 
        mutationEvent: EtityMutationEvent
    ): Promise<number> {
        let count = lastValue || 0;
        
        if (mutationEvent.type === 'create') {
            count = lastValue + 1;
        } else if (mutationEvent.type === 'delete') {
            count = lastValue - 1;
        }
        
        return count;
    }
}
```

#### Step 3: Implement Handlers for Different Contexts

For different data contexts (global, entity, relation, property), you need to implement different handlers:

```typescript
export class PropertyCountHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: KlassInstance<typeof Relation>

    constructor(
        public controller: Controller, 
        public args: KlassInstance<typeof Count>, 
        public dataContext: PropertyDataContext
    ) {
        // Parse relation information
        this.relation = args.record as KlassInstance<typeof Relation>
        this.relationAttr = this.relation.source.name === dataContext.host.name 
            ? this.relation.sourceProperty 
            : this.relation.targetProperty
        this.isSource = this.relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource 
            ? this.relation.target.name 
            : this.relation.source.name
        
        // Define property dependencies
        this.dataDeps = {
            _current: {
                type: 'property'
            }
        }
    }

    createState() {
        return {}   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current}: {_current: any}): Promise<number> {
        const count = _current[this.relationAttr]?.length || 0;
        return count;
    }

    async incrementalCompute(
        lastValue: number, 
        mutationEvent: EtityMutationEvent, 
        record: any
    ): Promise<number> {
        let count = lastValue || 0;
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;

        if (relatedMutationEvent.type === 'create') {
            count = lastValue + 1;
        } else if (relatedMutationEvent.type === 'delete') {
            count = lastValue - 1;
        }

        return count;
    }
}
```

### 3.1.3 Registration Mechanism

After implementation, you need to register the computation type in the system:

```typescript
// Register computation handlers
ComputedDataHandle.Handles.set(Count, {
    global: GlobalCountHandle,
    property: PropertyCountHandle
});
```

Core structure of the registration mechanism:

```typescript
type HandlesForType = {
    global?: { new(...args: any[]): Computation },
    entity?: { new(...args: any[]): Computation },
    relation?: { new(...args: any[]): Computation },
    property?: { new(...args: any[]): Computation },
}

export class ComputedDataHandle {
    public static Handles: Map<Klass<any>, HandlesForType> = new Map()
}
```

### 3.1.4 Example Code: Custom Average Computation

```typescript
// Define the shared class for average computation
export const Average = createClass({
    name: 'Average',
    public: {
        record: {
            type: [Entity, Relation],
            collection: false,
            required: true
        },
        field: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

// Global average computation handler
export class GlobalAverageHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    field: string
    
    constructor(
        public controller: Controller, 
        args: KlassInstance<typeof Average>, 
        public dataContext: DataContext
    ) {
        this.field = args.field
        this.dataDeps = {
            main: {
                type: 'records',
                source: args.record
            }
        }
    }
    
    createState() {
        return {
            sum: new GlobalBoundState<number>(0),
            count: new GlobalBoundState<number>(0)
        }
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({main: records}: {main: any[]}): Promise<number> {
        const sum = records.reduce((acc, record) => acc + (record[this.field] || 0), 0)
        const count = records.length
        
        // Update state
        await this.state.sum.set(sum)
        await this.state.count.set(count)
        
        return count > 0 ? sum / count : 0
    }

    async incrementalCompute(
        lastValue: number, 
        mutationEvent: EtityMutationEvent
    ): Promise<number> {
        const currentSum = await this.state.sum.get()
        const currentCount = await this.state.count.get()
        
        let newSum = currentSum
        let newCount = currentCount
        
        if (mutationEvent.type === 'create') {
            newSum += mutationEvent.record[this.field] || 0
            newCount += 1
        } else if (mutationEvent.type === 'delete') {
            newSum -= mutationEvent.oldRecord?.[this.field] || 0
            newCount -= 1
        } else if (mutationEvent.type === 'update') {
            const oldValue = mutationEvent.oldRecord?.[this.field] || 0
            const newValue = mutationEvent.record[this.field] || 0
            newSum = newSum - oldValue + newValue
        }
        
        // Update state
        await this.state.sum.set(newSum)
        await this.state.count.set(newCount)
        
        return newCount > 0 ? newSum / newCount : 0
    }
}

// Register computation handler
ComputedDataHandle.Handles.set(Average, {
    global: GlobalAverageHandle
});
```

## 3.2 Database Adapters

### 3.2.1 Adapter Interface

To support a new database, you need to implement the `Database` interface:

```typescript
export type Database = {
    // Connection management
    open: () => Promise<any>
    close: () => Promise<any>
    logger: DatabaseLogger
    
    // Basic operations
    scheme: (sql: string, name?: string) => Promise<any>
    query: <T extends any>(sql: string, values: any[], name?: string) => Promise<T[]>
    insert: (sql: string, values: any[], name?: string) => Promise<EntityIdRef>
    update: (sql: string, values: any[], idField?: string, name?: string) => Promise<EntityIdRef[]>
    delete: <T extends any>(sql: string, where: any[], name?: string) => Promise<T[]>
    
    // ID management
    getAutoId: (recordName: string) => Promise<string>
    
    // Type mapping
    mapToDBFieldType: (type: string, collection?: boolean) => string
    
    // Query optimization (optional)
    parseMatchExpression?: (
        key: string, 
        value: [string, any], 
        fieldName: string, 
        fieldType: string, 
        isReferenceValue: boolean, 
        getReferenceFieldValue: (v: string) => string, 
        genPlaceholder: (name?: string) => string
    ) => any
    getPlaceholder?: () => (name?: string) => string
}
```

### 3.2.2 Implementing New Database Support

#### Step 1: Basic Structure Implementation

```typescript
export class CustomDB implements Database {
    logger: DatabaseLogger
    connection: any  // Database connection object
    idSystem: IDSystem
    
    constructor(public config: CustomDBConfig) {
        this.logger = config.logger || pino()
        this.idSystem = new IDSystem(this)
    }
    
    async open() {
        // Establish database connection
        this.connection = await this.createConnection(this.config)
        
        // Initialize ID system
        await this.idSystem.setup()
    }
    
    async close() {
        // Close database connection
        if (this.connection) {
            await this.connection.close()
        }
    }
}
```

#### Step 2: ID Management System

Each database adapter needs to implement ID management:

```typescript
class IDSystem {
    constructor(public db: Database) {}
    
    setup() {
        return this.db.scheme(`CREATE Table IF NOT EXISTS _IDS_ (last INTEGER, name TEXT)`)
    }
    
    async getAutoId(recordName: string) {
        const lastId = (await this.db.query<{last: number}>(
            `SELECT last FROM _IDS_ WHERE name = ?`, 
            [recordName], 
            `finding last id of ${recordName}`
        ))[0]?.last
        
        const newId = (lastId || 0) + 1
        const name = `set last id for ${recordName}: ${newId}`
        
        if (lastId === undefined) {
            await this.db.scheme(
                `INSERT INTO _IDS_ (name, last) VALUES (?, ?)`, 
                [recordName, newId],
                name
            )
        } else {
            await this.db.update(
                `UPDATE _IDS_ SET last = ? WHERE name = ?`, 
                [newId, recordName], 
                undefined, 
                name
            )
        }
        
        return newId as unknown as string
    }
}
```

#### Step 3: Basic Operations Implementation

```typescript
export class CustomDB implements Database {
    // ... other methods

    async query<T extends any>(sql: string, values: any[] = [], name = '') {
        const context = asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        
        // Parameter processing
        const params = this.processParameters(values)
        
        // Log
        logger.info({
            type: 'query',
            name,
            sql,
            params
        })
        
        // Execute query
        const result = await this.connection.query(sql, params)
        return this.processQueryResult(result)
    }
    
    async insert(sql: string, values: any[], name = '') {
        const context = asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        
        const params = this.processParameters(values)
        
        logger.info({
            type: 'insert',
            name,
            sql,
            params
        })
        
        // Add RETURNING clause to get inserted ID
        const finalSQL = `${sql} RETURNING ${ROW_ID_ATTR}`
        const result = await this.connection.query(finalSQL, params)
        
        return this.processInsertResult(result)
    }
    
    mapToDBFieldType(type: string, collection?: boolean) {
        if (type === 'pk') {
            return 'INTEGER PRIMARY KEY AUTO_INCREMENT'
        } else if (type === 'id') {
            return 'INT'
        } else if (collection || type === 'object' || type === 'json') {
            return 'JSON'
        } else if (type === 'string') {
            return 'VARCHAR(255)'
        } else if (type === 'boolean') {
            return 'BOOLEAN'
        } else if (type === 'number') {
            return 'INT'
        } else if (type === 'timestamp') {
            return 'TIMESTAMP'
        } else {
            return type
        }
    }
}
```

### 3.2.3 Testing Requirements

#### Basic Functionality Tests

```typescript
describe('CustomDB Adapter', () => {
    let db: CustomDB
    
    beforeEach(async () => {
        db = new CustomDB(testConfig)
        await db.open()
    })
    
    afterEach(async () => {
        await db.close()
    })
    
    test('should create tables', async () => {
        await db.scheme('CREATE TABLE test_table (id INT PRIMARY KEY, name VARCHAR(255))')
        // Verify table creation success
    })
    
    test('should insert and query data', async () => {
        const insertResult = await db.insert(
            'INSERT INTO test_table (name) VALUES (?)', 
            ['test_name']
        )
        expect(insertResult.id).toBeDefined()
        
        const queryResult = await db.query(
            'SELECT * FROM test_table WHERE id = ?', 
            [insertResult.id]
        )
        expect(queryResult[0].name).toBe('test_name')
    })
    
    test('should manage auto IDs', async () => {
        const id1 = await db.getAutoId('test_entity')
        const id2 = await db.getAutoId('test_entity')
        
        expect(parseInt(id2)).toBe(parseInt(id1) + 1)
    })
})
```

## Summary

This chapter provides detailed introduction to the extension development mechanisms of @interaqt/runtime:

1. **Custom Computation Types**:
   - Create new computation types by implementing the `DataBasedComputation` interface
   - Support full computation, incremental computation, and incremental patch computation
   - Provide state management and async computation support
   - Integrate into the framework through registration mechanisms

2. **Database Adapters**:
   - Support new databases by implementing the `Database` interface
   - Include connection management, basic operations, ID management, and type mapping
   - Optional query optimization features
   - Complete testing requirements and examples

These extension mechanisms make the framework highly extensible. Developers can add new computation types and database support according to specific needs while maintaining good integration with the core framework. Understanding these extension development principles and practices is crucial for building complex business applications.
