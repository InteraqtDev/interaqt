# Filtered Entity 技术细节

## 内部实现机制

### 1. 实体映射结构

Filtered Entity 的核心在于 `EntityToTableMap` 中的映射关系：

```typescript
// RecordMapItem 结构
interface RecordMapItem {
  table: string;                    // 表名
  attributes: AttributeMap;         // 属性映射
  isRelation?: boolean;            // 是否是关系
  sourceRecordName?: string;       // 源实体名（对于 filtered entity）
  filterCondition?: object;        // 过滤条件（MatchExp 格式）
  filteredBy?: string[];           // 被哪些 filtered entities 引用
}
```

### 2. 标记字段机制

#### 自动添加 __filtered_entities 字段

在 `DBSetup.createRecord` 中：

```typescript
// 检查是否有 filtered entities 引用此实体
const filteredBy = this.entities.filter(e => 
  (e as any).sourceEntity === entityWithProps
);

if (filteredBy.length) {
  attributes['__filtered_entities'] = {
    type: 'json',
    fieldType: this.database!.mapToDBFieldType('json') || 'JSON'
  };
}
```

#### 标记字段的数据结构

```json
{
  "__filtered_entities": {
    "ActiveUser": true,      // 属于 ActiveUser
    "InactiveUser": false,   // 不属于 InactiveUser
    "AdminUser": true        // 属于 AdminUser
  }
}
```

### 3. 查询重定向机制

#### 查询转换流程

```typescript
// EntityQueryHandle.find 中的重定向逻辑
if (this.isFilteredEntity(entityName)) {
  const config = this.getFilteredEntityConfig(entityName);
  
  // 构造组合查询条件
  let combinedMatch = config.filterCondition;
  
  if (matchExpressionData) {
    combinedMatch = new MatchExp(config.sourceRecordName, this.map, combinedMatch)
      .and(new MatchExp(config.sourceRecordName, this.map, matchExpressionData))
      .data;
  }
  
  // 重定向到源实体查询
  return this.find(config.sourceRecordName, combinedMatch, modifierData, attributeQueryData);
}
```

#### MatchExp 组合机制

MatchExp 支持灵活的条件组合：

```typescript
// 基本条件
const condition1 = MatchExp.atom({
  key: 'status',
  value: ['=', 'active']
});

// AND 组合
const combined = condition1.and({
  key: 'age',
  value: ['>', 18]
});

// OR 组合
const orCondition = condition1.or({
  key: 'role',
  value: ['=', 'admin']
});

// 复杂嵌套
const complex = condition1
  .and(condition2)
  .or(condition3.and(condition4));
```

### 4. 事件生成机制

#### updateFilteredEntityFlags 的核心逻辑

```typescript
async updateFilteredEntityFlags(entityName: string, recordId: string, events?: RecordMutationEvent[], originalRecord?: Record, isCreation?: boolean) {
  const filteredEntities = this.getFilteredEntitiesForSource(entityName);
  
  // 获取原始标记状态
  const originalFlags = originalRecord?.__filtered_entities || {};
  const newFlags = { ...originalFlags };
  
  for (const filteredEntity of filteredEntities) {
    // 检查是否满足条件
    const matchingRecords = await this.findRecords(
      RecordQuery.create(entityName, this.map, {
        matchExpression: filteredEntity.filterCondition.and({
          key: 'id',
          value: ['=', recordId]
        }),
        modifier: { limit: 1 }
      })
    );
    
    const belongsToFilteredEntity = matchingRecords.length > 0;
    const previouslyBelonged = originalFlags[filteredEntity.name] === true;
    
    // 生成相应事件
    if (belongsToFilteredEntity && (isCreation || !previouslyBelonged)) {
      events?.push({
        type: 'create',
        recordName: filteredEntity.name,
        record: { ...updatedRecord }
      });
    } else if (!belongsToFilteredEntity && previouslyBelonged && !isCreation) {
      events?.push({
        type: 'delete',
        recordName: filteredEntity.name,
        record: { ...updatedRecord }
      });
    }
    
    newFlags[filteredEntity.name] = belongsToFilteredEntity;
  }
  
  // 更新标记字段（内部操作，不生成事件）
  if (JSON.stringify(originalFlags) !== JSON.stringify(newFlags)) {
    await this.updateRecordDataById(entityName, { id: recordId }, [
      { field: '__filtered_entities', value: newFlags }
    ]);
  }
}
```

### 5. 事务一致性保证

#### 写操作的原子性

所有涉及 filtered entity 的操作都在同一个数据库事务中完成：

1. 主记录的创建/更新/删除
2. __filtered_entities 字段的更新
3. 事件的收集和发送

```typescript
// 在 RecordQueryAgent 中
async createRecord(newRecordData: NewRecordData, reason: string, events?: RecordMutationEvent[]) {
  // 开始事务
  const transaction = await this.database.beginTransaction();
  
  try {
    // 1. 创建主记录
    const record = await this.insertRecord(...);
    
    // 2. 更新 filtered entity 标记
    await this.updateFilteredEntityFlags(
      entityName, 
      record.id, 
      events, 
      null, 
      true
    );
    
    // 3. 提交事务
    await transaction.commit();
    
    return record;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

### 6. 性能优化技术

#### 批量标记检查

当批量操作时，可以优化标记检查：

```typescript
// 批量检查多个记录
const recordIds = ['id1', 'id2', 'id3'];
const batchCheck = await this.findRecords(
  RecordQuery.create(entityName, this.map, {
    matchExpression: filteredEntity.filterCondition.and({
      key: 'id',
      value: ['in', recordIds]
    })
  })
);
```

#### 索引策略

```sql
-- 为 __filtered_entities 创建 GIN 索引（PostgreSQL）
CREATE INDEX idx_filtered_entities ON "User" 
USING GIN (__filtered_entities);

-- 为常用过滤字段创建索引
CREATE INDEX idx_user_status ON "User" (status);
CREATE INDEX idx_user_age ON "User" (age);
```

### 7. 边界情况处理

#### 循环引用检测

```typescript
resolveBaseSourceEntityAndFilter(entity: EntityInstance) {
  let sourceEntity = (entity as any).sourceEntity;
  let filterCondition = (entity as any).filterCondition;
  
  // 防止循环引用
  const visited = new Set<string>();
  
  while(sourceEntity?.sourceEntity) {
    if (visited.has(sourceEntity.name)) {
      throw new Error(`Circular reference detected in filtered entity: ${entity.name}`);
    }
    visited.add(sourceEntity.name);
    
    sourceEntity = sourceEntity.sourceEntity;
    filterCondition = filterCondition.and(sourceEntity.filterCondition);
  }
  
  return { sourceEntity, filterCondition };
}
```

#### NULL 值处理

```typescript
// 处理 NULL 值的比较
const nullSafeCondition = MatchExp.atom({
  key: 'status',
  value: ['is', null]  // 使用 'is' 操作符处理 NULL
}).or({
  key: 'status',
  value: ['=', 'active']
});
```

### 8. 扩展性设计

#### 支持自定义过滤函数（未来扩展）

```typescript
// 可能的未来扩展
const ComplexFilteredEntity = Entity.create({
  name: 'ComplexFilteredEntity',
  sourceEntity: User,
  filterCondition: {
    type: 'custom',
    function: (record) => {
      // 自定义过滤逻辑
      return record.age > 18 && 
             record.score > 80 && 
             customComplexCheck(record);
    }
  }
});
```

#### 动态过滤条件（设计考虑）

虽然当前版本不支持动态过滤条件，但架构设计已考虑未来扩展：

```typescript
// 可能的实现方式
interface DynamicFilterCondition {
  type: 'dynamic';
  resolver: () => MatchExpressionData;
  dependencies?: string[];  // 依赖的外部变量
}
```

### 9. 调试和监控

#### 调试信息

```typescript
// EntityQueryHandle 中的调试支持
if (this.debug) {
  console.log(`Filtered entity ${entityName} redirected to ${config.sourceRecordName}`);
  console.log('Original condition:', matchExpressionData);
  console.log('Combined condition:', combinedMatch);
}
```

#### 性能监控点

```typescript
// 关键性能指标
interface FilteredEntityMetrics {
  filterCheckDuration: number;      // 过滤条件检查耗时
  flagUpdateDuration: number;       // 标记更新耗时
  eventGenerationCount: number;     // 生成的事件数量
  affectedRecordCount: number;      // 影响的记录数
}
```

### 10. 与其他系统的集成

#### 与 Computation 系统集成

Filtered Entity 可以作为 Computation 的数据源：

```typescript
// Count 计算集成
const activeUserCount = Count.create({
  record: ActiveUser,  // filtered entity
  match: () => true
});

// 内部实现会转换为
const activeUserCount = Count.create({
  record: User,
  match: (record) => record.__filtered_entities?.ActiveUser === true
});
```

#### 与权限系统集成

```typescript
// 基于用户权限的 filtered entity
const MyVisibleData = Entity.create({
  name: 'MyVisibleData',
  sourceEntity: Data,
  filterCondition: await buildPermissionFilter(currentUser)
});
```

## 设计决策和权衡

### 1. 为什么使用标记字段而不是动态查询？

- **性能考虑**：避免每次查询都重新计算过滤条件
- **事件系统**：便于跟踪记录的 filtered entity 成员资格变化
- **一致性**：确保事件和查询看到相同的数据

### 2. 为什么不支持嵌套 filtered entity？

- **复杂度控制**：避免过度复杂的依赖关系
- **性能考虑**：多层过滤会影响查询性能
- **可维护性**：简化系统设计，提高可理解性

### 3. 为什么过滤条件是静态的？

- **可预测性**：系统行为更容易理解和调试
- **性能优化**：可以预先优化查询计划
- **一致性保证**：避免运行时条件变化导致的不一致

## 总结

Filtered Entity 的技术实现体现了 interaqt 框架的设计理念：

- **响应式**：通过事件系统实现数据的响应式更新
- **高性能**：通过查询重定向和标记机制优化性能
- **可扩展**：架构设计考虑了未来的扩展需求
- **一致性**：通过事务和严格的状态管理保证数据一致性

理解这些技术细节有助于更好地使用 Filtered Entity 功能，并在必要时进行性能优化或功能扩展。 