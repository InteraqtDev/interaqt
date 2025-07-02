# 第3章 扩展开发（Extension Development）

## 3.1 自定义计算类型

### 3.1.1 DataBasedComputation 接口

`DataBasedComputation` 是所有基于数据的计算类型的核心接口。要创建自定义计算类型，需要实现此接口：

```typescript
export interface DataBasedComputation {
    dataContext: DataContext                    // 计算上下文
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}
    
    // 必需方法
    compute: (...args: any[]) => Promise<ComputationResult|any>  // 全量计算
    
    // 可选方法
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>  // 增量计算
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>  // 增量补丁计算
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}  // 状态创建
    
    // 配置属性
    dataDeps: {[key: string]: any}              // 数据依赖定义
    getDefaultValue?: (...args: any[]) => any   // 默认值获取
    useLastValue?: boolean                      // 是否使用上次计算结果
    asyncReturn?: (...args: any[]) => Promise<ComputationResultSkip|any>  // 异步计算结果处理
}
```

### 3.1.2 实现步骤

#### 步骤1：定义数据依赖

首先需要明确计算所依赖的数据类型：

```typescript
// 数据依赖类型
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

#### 步骤2：实现计算逻辑

以 `Count` 计算为例，展示完整的实现过程：

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
        
        // 定义数据依赖
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record
            }
        }
    }
    
    // 创建状态（可选）
    createState() {
        return {}   
    }
    
    // 设置默认值
    getDefaultValue() {
        return 0
    }

    // 全量计算实现
    async compute({main: records}: {main: any[]}): Promise<number> {
        return records.length;
    }

    // 增量计算实现
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

#### 步骤3：实现不同上下文的处理器

对于不同的数据上下文（global、entity、relation、property），需要实现不同的处理器：

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
        // 解析关系信息
        this.relation = args.record as KlassInstance<typeof Relation>
        this.relationAttr = this.relation.source.name === dataContext.host.name 
            ? this.relation.sourceProperty 
            : this.relation.targetProperty
        this.isSource = this.relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource 
            ? this.relation.target.name 
            : this.relation.source.name
        
        // 定义属性依赖
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

### 3.1.3 注册机制

实现完成后，需要将计算类型注册到系统中：

```typescript
// 注册计算处理器
ComputationHandle.Handles.set(Count, {
    global: GlobalCountHandle,
    property: PropertyCountHandle
});
```

注册机制的核心结构：

```typescript
type HandlesForType = {
    global?: { new(...args: any[]): Computation },
    entity?: { new(...args: any[]): Computation },
    relation?: { new(...args: any[]): Computation },
    property?: { new(...args: any[]): Computation },
}

export class ComputationHandle {
    public static Handles: Map<Klass<any>, HandlesForType> = new Map()
}
```

### 3.1.4 示例代码：自定义平均值计算

```typescript
// 定义平均值计算的共享类
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

// 全局平均值计算处理器
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
        
        // 更新状态
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
        
        // 更新状态
        await this.state.sum.set(newSum)
        await this.state.count.set(newCount)
        
        return newCount > 0 ? newSum / newCount : 0
    }
}

// 注册计算处理器
ComputationHandle.Handles.set(Average, {
    global: GlobalAverageHandle
});
```

## 3.2 数据库适配器

### 3.2.1 适配器接口

要支持新的数据库，需要实现 `Database` 接口：

```typescript
export type Database = {
    // 连接管理
    open: () => Promise<any>
    close: () => Promise<any>
    logger: DatabaseLogger
    
    // 基本操作
    scheme: (sql: string, name?: string) => Promise<any>
    query: <T extends any>(sql: string, values: any[], name?: string) => Promise<T[]>
    insert: (sql: string, values: any[], name?: string) => Promise<EntityIdRef>
    update: (sql: string, values: any[], idField?: string, name?: string) => Promise<EntityIdRef[]>
    delete: <T extends any>(sql: string, where: any[], name?: string) => Promise<T[]>
    
    // ID 管理
    getAutoId: (recordName: string) => Promise<string>
    
    // 类型映射
    mapToDBFieldType: (type: string, collection?: boolean) => string
    
    // 查询优化（可选）
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

### 3.2.2 实现新的数据库支持

#### 步骤1：基础结构实现

```typescript
export class CustomDB implements Database {
    logger: DatabaseLogger
    connection: any  // 数据库连接对象
    idSystem: IDSystem
    
    constructor(public config: CustomDBConfig) {
        this.logger = config.logger || pino()
        this.idSystem = new IDSystem(this)
    }
    
    async open() {
        // 建立数据库连接
        this.connection = await this.createConnection(this.config)
        
        // 初始化ID系统
        await this.idSystem.setup()
    }
    
    async close() {
        // 关闭数据库连接
        if (this.connection) {
            await this.connection.close()
        }
    }
}
```

#### 步骤2：ID管理系统

每个数据库适配器都需要实现ID管理：

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

#### 步骤3：基本操作实现

```typescript
export class CustomDB implements Database {
    // ... 其他方法

    async query<T extends any>(sql: string, values: any[] = [], name = '') {
        const context = asyncInteractionContext.getStore() as InteractionContext
        const logger = this.logger.child(context?.logContext || {})
        
        // 参数处理
        const params = this.processParameters(values)
        
        // 记录日志
        logger.info({
            type: 'query',
            name,
            sql,
            params
        })
        
        // 执行查询
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
        
        // 添加RETURNING子句以获取插入的ID
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

### 3.2.3 测试要求

#### 基础功能测试

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
        // 验证表创建成功
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

## 小结

本章详细介绍了 interaqt 的扩展开发机制：

1. **自定义计算类型**：
   - 通过实现 `DataBasedComputation` 接口创建新的计算类型
   - 支持全量计算、增量计算和增量补丁计算
   - 提供状态管理和异步计算支持
   - 通过注册机制集成到框架中

2. **数据库适配器**：
   - 实现 `Database` 接口支持新的数据库
   - 包含连接管理、基本操作、ID管理和类型映射
   - 可选的查询优化功能
   - 完整的测试要求和示例

这些扩展机制使得框架具有很强的可扩展性，开发者可以根据具体需求添加新的计算类型和数据库支持，同时保持与核心框架的良好集成。理解这些扩展开发的原理和实践对于构建复杂的业务应用具有重要意义。 