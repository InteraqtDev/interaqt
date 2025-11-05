# CreationExecutor - 创建操作执行器

## 概述

`CreationExecutor` 是从 `RecordQueryAgent` 中分离出来的独立创建操作执行器，专门负责处理所有与记录创建相关的逻辑。

## 职责范围

### 核心职责

1. **记录创建** - 创建 entity 和 relation 记录
2. **依赖处理** - 处理记录之间的依赖关系
3. **关系建立** - 创建和管理实体间的关系
4. **同行数据管理** - 处理合并到同一表行的数据
5. **合并记录处理** - 处理 combined records 的特殊逻辑
6. **创建事件生成** - 生成所有创建相关的变更事件

### 主要方法

#### 1. `createRecord(newEntityData, queryName?, events?)`
创建记录的主入口方法。

**流程**：
1. 调用 `createRecordDependency` 处理依赖
2. 调用 `insertSameRowData` 插入数据
3. 调用 `handleCreationReliance` 处理关联关系
4. 更新 filtered entity 标记
5. 返回完整的记录引用

#### 2. `createRecordDependency(newRecordData, events?)`
处理记录的依赖关系。

**处理内容**：
- Merged link target 的新记录和引用
- Combined records 的 link dependency
- 递归处理所有 link 的依赖

#### 3. `insertSameRowData(newEntityData, queryName?, events?)`
插入同行数据到数据库。

**流程**：
1. 调用 `preprocessSameRowData` 预处理
2. 构建 INSERT SQL
3. 执行插入操作
4. 返回包含 ID 的记录引用

#### 4. `preprocessSameRowData(newEntityData, isUpdate, events?, oldRecord?)`
预处理同行数据，分配 ID 并记录事件。

**职责**：
- 分配记录 ID（新建场景）
- 为三表合一的记录分配 ID
- 为关系记录分配 ID
- 记录所有创建事件
- 处理 flashOut 逻辑

#### 5. `handleCreationReliance(newEntityData, events?)`
处理创建时的关联关系。

**处理四种场景**：
1. 关系往 attribute 方向合并的新数据
2. 关系往 attribute 方向合并的老数据（需要更新）
3. 完全独立的新数据和关系
4. 完全独立的老数据和新关系

#### 6. `flashOutCombinedRecordsAndMergedLinks(newEntityData, events?, reason?)`
处理合并记录的闪出操作。

**场景**：当创建的记录需要"抢夺"别的记录的 combined record 时。

**操作**：
1. 查找所有包含 combined record 的记录
2. 删除原记录的同行数据
3. 记录 unlink 事件
4. 返回抢夺到的数据

#### 7. `relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource?, events?)`
重定位合并记录数据。

**用途**：当需要将 combined record 从一行移动到另一行时。

#### 8. `addLink(linkName, sourceId, targetId, attributes?, moveSource?, events?)`
添加两个记录之间的链接。

**检查**：
- 检查链接是否已存在
- 对于 n:1 关系，先 unlink 旧链接
- 创建新的 link 记录

#### 9. `addLinkFromRecord(entity, attribute, entityId, relatedEntityId, attributes?, events?)`
从记录的角度添加链接（便捷方法）。

## 依赖关系

### CreationExecutor 依赖

- `EntityToTableMap` - 获取实体和关系的元数据
- `Database` - 数据库操作（insert, getAutoId 等）
- `SQLBuilder` - 构建 SQL 语句
- `QueryExecutor` - 查询能力（检查记录是否存在等）
- `FilteredEntityManager` - 管理 filtered entity 标记

### 反向依赖（通过委托）

CreationExecutor 需要调用 RecordQueryAgent 的以下方法：
- `updateRecord` - 更新记录（用于处理关系往 attribute 方向合并的老数据）
- `unlink` - 删除链接（用于 x:1 关系的旧链接删除）
- `deleteRecordSameRowData` - 删除同行数据（用于 flashOut 操作）

这些依赖通过 `setupCreationExecutorDelegates()` 方法在 RecordQueryAgent 中设置。

## 使用方式

### 在 RecordQueryAgent 中使用

```typescript
class RecordQueryAgent {
    private creationExecutor: CreationExecutor
    
    constructor(map: EntityToTableMap, database: Database) {
        // ... 初始化其他组件
        this.creationExecutor = new CreationExecutor(
            map, 
            database, 
            this.queryExecutor, 
            this.filteredEntityManager, 
            this.sqlBuilder
        )
        this.setupCreationExecutorDelegates()
    }
    
    // 委托创建方法
    async createRecord(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.creationExecutor.createRecord(newEntityData, queryName, events)
    }
}
```

### 独立使用

```typescript
const creationExecutor = new CreationExecutor(
    entityToTableMap,
    database,
    queryExecutor,
    filteredEntityManager,
    sqlBuilder
)

// 设置反向依赖
(creationExecutor as any).updateRecord = recordQueryAgent.updateRecord.bind(recordQueryAgent)
(creationExecutor as any).unlink = recordQueryAgent.unlink.bind(recordQueryAgent)
(creationExecutor as any).deleteRecordSameRowData = recordQueryAgent.deleteRecordSameRowData.bind(recordQueryAgent)

// 使用
const newUser = await creationExecutor.createRecord(
    new NewRecordData(map, 'User', { name: 'Alice', age: 30 }),
    'create user',
    events
)
```

## 事件处理

CreationExecutor 负责生成所有创建相关的事件：

### 事件类型

1. **create** - 创建记录事件
   ```typescript
   {
       type: 'create',
       recordName: 'User',
       record: { id: 1, name: 'Alice', age: 30 }
   }
   ```

2. **create (relation)** - 创建关系事件
   ```typescript
   {
       type: 'create',
       recordName: 'User_posts_author_Post',
       record: {
           id: 1,
           source: { id: 1 },
           target: { id: 1 }
       }
   }
   ```

3. **delete (unlink)** - 删除旧关系事件（在 flashOut 或 addLink 时）
   ```typescript
   {
       type: 'delete',
       recordName: 'User_posts_author_Post',
       record: { id: 1, source: {...}, target: {...} }
   }
   ```

### 事件顺序保证

CreationExecutor 确保事件按正确顺序生成：

1. dependency records 的创建事件
2. 主记录的创建事件
3. reliance records 的创建事件
4. filtered entity 的创建事件

## 最佳实践

### 1. 使用委托模式

不要直接在 CreationExecutor 中实现 update、delete 逻辑，而是通过委托调用 RecordQueryAgent 的方法。

### 2. 事件数组传递

始终传递 events 数组，即使不需要事件通知，这样可以保证事件顺序的正确性。

### 3. queryName 使用

提供有意义的 queryName，方便调试和日志追踪。

```typescript
await creationExecutor.createRecord(
    newRecordData,
    `create user post for user ${userId}`,  // 有意义的名称
    events
)
```

### 4. 错误处理

CreationExecutor 内部使用 assert 进行断言检查，调用方应该捕获这些错误。

```typescript
try {
    await creationExecutor.addLink(linkName, sourceId, targetId)
} catch (error) {
    if (error.message.includes('already exist')) {
        // 处理链接已存在的情况
    }
}
```

## 性能考虑

### 1. 批量创建

对于批量创建操作，events 数组会在内存中累积，注意内存使用。

### 2. 递归深度

`createRecord` 会递归创建依赖记录，注意避免过深的依赖层级。

### 3. flashOut 查询

`flashOutCombinedRecordsAndMergedLinks` 会执行额外的查询，对于不涉及 combined records 的场景，这个开销很小。

## 测试

所有创建相关的测试都应该通过 CreationExecutor：

```typescript
test('should create user with post', async () => {
    const events: RecordMutationEvent[] = []
    
    const user = await creationExecutor.createRecord(
        new NewRecordData(map, 'User', {
            name: 'Alice',
            posts: [{ title: 'First Post' }]
        }),
        'test create',
        events
    )
    
    expect(user.id).toBeDefined()
    expect(events).toHaveLength(3) // user, post, link
})
```

## 未来优化

1. **批量插入优化** - 对于批量创建，可以优化为单个 INSERT 语句
2. **事件批处理** - 可以考虑批量处理事件通知
3. **依赖图优化** - 可以预先分析依赖图，优化执行顺序
4. **缓存优化** - 对于频繁创建的场景，可以缓存 SQL 语句

## 相关文档

- [CreationExecutor-refactor-plan.md](./CreationExecutor-refactor-plan.md) - 重构计划和总结
- [QueryExecutor-README.md](./QueryExecutor-README.md) - 查询执行器文档
- [RecordQueryAgent-进一步重构分析.md](./RecordQueryAgent-进一步重构分析.md) - 整体架构分析

