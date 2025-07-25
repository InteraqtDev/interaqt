# Filtered Entity 支持关联实体字段过滤的实现方案

## 概述

当前 filtered entity 只支持基于源实体自身字段的过滤条件。本文档提出一个完整的方案，使 filtered entity 能够支持基于关联实体字段的过滤，例如"所有属于技术部门的活跃用户"（其中部门信息存储在关联的 Department 实体中）。

## 需求场景

### 示例用例

```typescript
// 基础实体定义
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'isActive', type: 'boolean' })
  ]
});

const Department = Entity.create({
  name: 'Department',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'type', type: 'string' })
  ]
});

// 关系定义
const UserDepartmentRelation = Relation.create({
  name: 'UserDepartment',
  source: User,
  sourceProperty: 'department',
  target: Department,
  targetProperty: 'users',
  type: 'n:1'
});

// 期望支持的 filtered entity 定义
const TechActiveUsers = Entity.create({
  name: 'TechActiveUsers',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'isActive',
    value: ['=', true]
  }).and({
    key: 'department.type',  // 关联实体的字段
    value: ['=', 'tech']
  })
});
```

## 技术挑战

1. **查询重写**：需要将包含关联字段的查询转换为 JOIN 查询
2. **标记维护**：关联实体变化时需要更新相关记录的 `__filtered_entities` 标记
3. **事件传播**：关联实体的更新需要触发 filtered entity 的事件
4. **性能优化**：避免不必要的 JOIN 和重复计算

## 实现方案

### 1. 扩展 MatchExp 支持关联字段

#### 修改 MatchExp 以识别关联路径

```typescript
// src/storage/erstorage/MatchExp.ts
export class MatchExp {
  // 新增方法：检测是否包含关联字段
  hasRelationFields(): boolean {
    return this.extractRelationPaths().length > 0;
  }
  
  // 新增方法：提取所有关联路径
  extractRelationPaths(): string[][] {
    const paths: string[][] = [];
    this.data?.traverse((atom: MatchAtom) => {
      const parts = atom.key.split('.');
      if (parts.length > 1) {
        paths.push(parts);
      }
    });
    return paths;
  }
}
```

### 2. 扩展 EntityQueryHandle 查询逻辑

#### 修改 find 方法支持关联查询

```typescript
// src/storage/erstorage/EntityQueryHandle.ts
async find(entityName: string, matchExpressionData?: MatchExpressionData, modifierData?: ModifierData, attributeQueryData: AttributeQueryData = []): Promise<Record[]> {
  if (this.isFilteredEntity(entityName)) {
    const config = this.getFilteredEntityConfig(entityName);
    if (!config) {
      throw new Error(`${entityName} is not a filtered entity`);
    }

    // 检查过滤条件是否包含关联字段
    const matchExp = new MatchExp(config.sourceRecordName, this.map, config.filterCondition);
    if (matchExp.hasRelationFields()) {
      // 使用新的支持 JOIN 的查询方法
      return this.findWithRelations(config.sourceRecordName, config.filterCondition, matchExpressionData, modifierData, attributeQueryData);
    }

    // 原有逻辑...
  }
  // 原有逻辑...
}

// 新增方法：支持关联查询
private async findWithRelations(
  entityName: string, 
  filterCondition: MatchExpressionData,
  additionalMatch?: MatchExpressionData,
  modifier?: ModifierData,
  attributeQuery?: AttributeQueryData
): Promise<Record[]> {
  // 构建包含 JOIN 的查询
  const queryTree = new RecordQueryTree(entityName, this.map);
  const matchExp = new MatchExp(entityName, this.map, filterCondition);
  
  // 让 MatchExp 构建必要的 JOIN
  matchExp.buildQueryTree(filterCondition, queryTree);
  
  // 合并额外的查询条件
  if (additionalMatch) {
    const additionalExp = new MatchExp(entityName, this.map, additionalMatch);
    additionalExp.buildQueryTree(additionalMatch, queryTree);
  }
  
  // 执行查询
  const query = RecordQuery.create(entityName, this.map, {
    matchExpression: filterCondition.and(additionalMatch || BoolExp.atom(null)),
    attributeQuery: attributeQuery,
    modifier: modifier,
    queryTree: queryTree
  });
  
  return this.agent.findRecords(query, `finding ${entityName} with relations`);
}
```

### 3. 扩展 RecordQueryAgent 维护逻辑

#### 监听关联实体变化

```typescript
// src/storage/erstorage/RecordQueryAgent.ts
export class RecordQueryAgent {
  // 新增：注册关联实体监听器
  private relationListeners: Map<string, Set<{
    filteredEntityName: string;
    relationPath: string[];
    filterCondition: MatchExpressionData;
  }>> = new Map();
  
  // 在初始化时分析所有 filtered entity 的关联依赖
  initializeRelationListeners() {
    const allRecords = this.map.getAllRecords();
    
    for (const [entityName, recordInfo] of allRecords) {
      if (recordInfo.sourceRecordName && recordInfo.filterCondition) {
        const matchExp = new MatchExp(recordInfo.sourceRecordName, this.map, recordInfo.filterCondition);
        const relationPaths = matchExp.extractRelationPaths();
        
        for (const path of relationPaths) {
          // 找到关联的目标实体
          const targetEntity = this.resolveRelationPath(recordInfo.sourceRecordName, path);
          
          if (!this.relationListeners.has(targetEntity)) {
            this.relationListeners.set(targetEntity, new Set());
          }
          
          this.relationListeners.get(targetEntity)!.add({
            filteredEntityName: entityName,
            relationPath: path,
            filterCondition: recordInfo.filterCondition
          });
        }
      }
    }
  }
  
  // 修改 updateRecord 方法
  async updateRecord(entityName: string, matchExpression: MatchExpressionData, newRecordData: NewRecordData, events?: RecordMutationEvent[]) {
    // 原有更新逻辑...
    const result = await super.updateRecord(entityName, matchExpression, newRecordData, events);
    
    // 检查是否有 filtered entity 依赖此实体
    if (this.relationListeners.has(entityName)) {
      await this.updateRelatedFilteredEntities(entityName, matchExpression, events);
    }
    
    return result;
  }
  
  // 新增：更新相关的 filtered entity 标记
  private async updateRelatedFilteredEntities(
    updatedEntityName: string,
    matchExpression: MatchExpressionData,
    events?: RecordMutationEvent[]
  ) {
    const listeners = this.relationListeners.get(updatedEntityName);
    if (!listeners) return;
    
    // 找到所有受影响的记录
    const affectedRecords = await this.findRecords(
      RecordQuery.create(updatedEntityName, this.map, { matchExpression })
    );
    
    for (const listener of listeners) {
      // 找到通过关系连接的源实体记录
      const relatedSourceRecords = await this.findRelatedSourceRecords(
        updatedEntityName,
        affectedRecords.map(r => r.id),
        listener.relationPath
      );
      
      // 更新每个相关源记录的 filtered entity 标记
      for (const sourceRecord of relatedSourceRecords) {
        await this.updateFilteredEntityFlags(
          listener.filteredEntityName,
          sourceRecord.id,
          events,
          sourceRecord,
          false
        );
      }
    }
  }
}
```

### 4. 修改 updateFilteredEntityFlags 支持关联条件

```typescript
// src/storage/erstorage/RecordQueryAgent.ts
async updateFilteredEntityFlags(
  entityName: string, 
  recordId: string, 
  events?: RecordMutationEvent[], 
  originalRecord?: Record, 
  isCreation?: boolean
) {
  const filteredEntities = this.getFilteredEntitiesForSource(entityName);
  const originalFlags = originalRecord?.__filtered_entities || {};
  const newFlags = { ...originalFlags };
  
  for (const filteredEntity of filteredEntities) {
    const matchExp = new MatchExp(entityName, this.map, filteredEntity.filterCondition);
    let belongsToFilteredEntity = false;
    
    if (matchExp.hasRelationFields()) {
      // 使用支持关联的查询
      const matchingRecords = await this.findWithRelations(
        entityName,
        filteredEntity.filterCondition.and({
          key: 'id',
          value: ['=', recordId]
        }),
        { limit: 1 }
      );
      belongsToFilteredEntity = matchingRecords.length > 0;
    } else {
      // 原有逻辑
      const matchingRecords = await this.findRecords(
        RecordQuery.create(entityName, this.map, {
          matchExpression: filteredEntity.filterCondition.and({
            key: 'id',
            value: ['=', recordId]
          }),
          modifier: { limit: 1 }
        })
      );
      belongsToFilteredEntity = matchingRecords.length > 0;
    }
    
    // 生成事件的逻辑保持不变...
  }
  
  // 更新标记的逻辑保持不变...
}
```

### 5. 优化性能

#### 添加缓存机制

```typescript
// src/storage/erstorage/FilteredEntityCache.ts
export class FilteredEntityCache {
  // 缓存关联路径的解析结果
  private pathCache: Map<string, ResolvedPath> = new Map();
  
  // 缓存最近的查询结果
  private queryCache: LRUCache<string, boolean> = new LRUCache(1000);
  
  // 批量更新时的去重
  private pendingUpdates: Map<string, Set<string>> = new Map();
  
  // 批量处理更新
  async flushPendingUpdates(agent: RecordQueryAgent, events: RecordMutationEvent[]) {
    for (const [entityName, recordIds] of this.pendingUpdates) {
      for (const recordId of recordIds) {
        await agent.updateFilteredEntityFlags(entityName, recordId, events);
      }
    }
    this.pendingUpdates.clear();
  }
}
```

### 6. 数据库层优化

#### 为关联查询创建索引

```sql
-- 在 Setup.ts 中自动创建索引
CREATE INDEX idx_filtered_entities_gin ON ${tableName} USING GIN (__filtered_entities);

-- 为常用的关联字段创建索引
CREATE INDEX idx_user_department ON users (department_id);
```

## 使用示例

### 基本使用

```typescript
// 定义基于关联字段的 filtered entity
const ActiveTechUsers = Entity.create({
  name: 'ActiveTechUsers',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'isActive',
    value: ['=', true]
  }).and({
    key: 'department.type',
    value: ['=', 'tech']
  })
});

// 查询会自动进行 JOIN
const techUsers = await controller.find('ActiveTechUsers', 
  undefined, 
  undefined, 
  ['id', 'name', 'department.name', 'department.type']
);
```

### 复杂关联条件

```typescript
// 多级关联
const HighPerformanceTeamUsers = Entity.create({
  name: 'HighPerformanceTeamUsers',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'team.project.status',
    value: ['=', 'active']
  }).and({
    key: 'team.performance.score',
    value: ['>', 90]
  })
});
```

## 实现步骤

1. **第一阶段**：扩展 MatchExp 支持关联路径解析
2. **第二阶段**：实现基本的关联查询功能
3. **第三阶段**：添加关联实体变化的监听和更新
4. **第四阶段**：性能优化和缓存机制
5. **第五阶段**：完善测试用例和文档

## 测试计划

### 单元测试

```typescript
describe('filtered entity with relation fields', () => {
  test('should filter by direct relation field', async () => {
    // 测试单级关联
  });
  
  test('should filter by nested relation fields', async () => {
    // 测试多级关联
  });
  
  test('should update flags when related entity changes', async () => {
    // 测试关联实体更新时的标记维护
  });
  
  test('should handle complex relation conditions', async () => {
    // 测试复杂关联条件
  });
});
```

### 性能测试

- 测试大数据量下的查询性能
- 测试批量更新时的性能
- 测试缓存命中率

## 注意事项

1. **循环依赖**：避免 filtered entity 之间的循环依赖
2. **性能影响**：关联查询可能影响性能，需要合理使用索引
3. **事务一致性**：确保关联更新在同一事务中完成
4. **向后兼容**：保持与现有 API 的兼容性

## 总结

通过以上方案，filtered entity 将能够支持基于关联实体字段的过滤条件，极大地扩展了其使用场景。实现的关键在于：

1. 扩展查询引擎支持 JOIN 查询
2. 建立关联实体变化的监听机制
3. 优化性能避免不必要的计算
4. 保持 API 的简洁和一致性

这个功能将使 filtered entity 成为更加强大和灵活的数据组织工具。 