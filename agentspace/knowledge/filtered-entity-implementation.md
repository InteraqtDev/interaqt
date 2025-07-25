# Filtered Entity 实现详解

## 概述

Filtered Entity 是 interaqt 框架中的一个高级特性，它允许从已有的实体（Entity）或关系（Relation）中定义出符合特定条件的子集，而无需创建新的数据表。这是一个虚拟实体概念，通过响应式系统自动维护数据的一致性。

## 架构设计

### 核心思想

1. **虚拟化**：Filtered Entity 不创建独立的数据表，而是作为源实体的一个视图存在
2. **标记机制**：在源实体表中添加 `__filtered_entities` JSON 字段，记录每条记录属于哪些 filtered entities
3. **查询重定向**：对 filtered entity 的查询会被重定向到源实体，并自动添加过滤条件
4. **事件驱动**：通过事件系统保证 filtered entity 与源实体的同步

### 数据结构

```typescript
// Entity 定义扩展
export interface EntityInstance extends IInstance {
  name: string;
  properties: PropertyInstance[];
  computation?: ComputationInstance;
  sourceEntity?: EntityInstance | RelationInstance;  // 源实体引用
  filterCondition?: object;                          // 过滤条件（MatchExp格式）
}

// 源实体表中的标记字段
__filtered_entities: {
  "FilteredEntityName1": true,
  "FilteredEntityName2": false,
  // ...
}
```

## 核心组件

### 1. Entity 定义扩展 (`src/shared/refactored/Entity.ts`)

为 Entity 类型添加了两个可选字段：
- `sourceEntity`: 指定源实体的引用
- `filterCondition`: 存储 MatchExp 格式的过滤条件

当这两个字段都存在时，该 Entity 被视为 filtered entity。

### 2. EntityQueryHandle (`src/storage/erstorage/EntityQueryHandle.ts`)

提供了 filtered entity 的核心查询和操作接口：

```typescript
class EntityQueryHandle {
  // 检查是否为 filtered entity
  isFilteredEntity(entityName: string): boolean

  // 获取 filtered entity 配置
  getFilteredEntityConfig(entityName: string): {
    sourceRecordName: string,
    filterCondition: any
  } | null

  // 获取基于某个源实体的所有 filtered entities
  getFilteredEntitiesForSource(sourceEntityName: string): Array<{
    name: string,
    filterCondition: any
  }>

  // CRUD 操作的重定向处理
  async find(...) // 重定向到源实体查询
  async create(...) // 在源实体创建记录
  async update(...) // 更新源实体记录
  async delete(...) // 删除源实体记录
}
```

### 3. RecordQueryAgent (`src/storage/erstorage/RecordQueryAgent.ts`)

负责维护 filtered entity 的标记和事件生成：

```typescript
class RecordQueryAgent {
  // 更新记录的 filtered entity 标记
  async updateFilteredEntityFlags(
    entityName: string,
    recordId: string,
    events?: RecordMutationEvent[],
    originalRecord?: Record,
    isCreation?: boolean
  )
}
```

### 4. DBSetup (`src/storage/erstorage/Setup.ts`)

处理数据库表结构的创建：
- 为有 filtered entities 的源实体自动添加 `__filtered_entities` JSON 字段
- 建立源实体与 filtered entities 之间的映射关系

## 工作流程

### 1. 创建记录流程

```
1. 用户创建源实体记录
2. RecordQueryAgent 创建记录
3. 调用 updateFilteredEntityFlags：
   - 获取所有基于该源实体的 filtered entities
   - 检查新记录是否满足各个 filtered entity 的过滤条件
   - 更新 __filtered_entities 字段
   - 为满足条件的 filtered entities 生成 create 事件
4. 返回创建的记录
```

### 2. 更新记录流程

```
1. 用户更新源实体记录
2. RecordQueryAgent 更新记录
3. 调用 updateFilteredEntityFlags：
   - 获取原始记录的 __filtered_entities 状态
   - 重新检查更新后的记录是否满足各个过滤条件
   - 对比前后状态：
     - 新满足条件：生成 filtered entity 的 create 事件
     - 不再满足条件：生成 filtered entity 的 delete 事件
   - 更新 __filtered_entities 字段
4. 返回更新结果
```

### 3. 查询流程

```
1. 用户查询 filtered entity
2. EntityQueryHandle 检测到是 filtered entity
3. 构造组合查询条件：
   - filtered entity 的过滤条件
   - 用户提供的额外查询条件
   - __filtered_entities 标记条件
4. 重定向到源实体执行查询
5. 返回满足条件的记录
```

### 4. 删除流程

```
1. 用户删除记录（可以是源实体或 filtered entity）
2. 如果是 filtered entity，添加过滤条件确保只删除满足条件的记录
3. 执行删除操作
4. 为所有相关的 filtered entities 生成 delete 事件
```

## 技术要点

### 1. 过滤条件检查机制

```typescript
// 检查记录是否满足 filtered entity 条件
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
```

### 2. 事件生成规则

- **创建记录**：为所有满足条件的 filtered entities 生成 create 事件
- **更新记录**：
  - 从不满足到满足：生成 create 事件
  - 从满足到不满足：生成 delete 事件
- **删除记录**：为所有相关的 filtered entities 生成 delete 事件
- **内部标记更新**：不生成事件（避免循环）

### 3. 复杂过滤条件支持

支持使用 MatchExp 的所有功能：
- 基本比较：`=`, `!=`, `>`, `<`, `>=`, `<=`
- 逻辑组合：`and`, `or`, `not`
- 复杂条件：多字段组合、嵌套条件等

### 4. Relation 作为源实体

Filtered Entity 的源实体可以是 Relation，这允许创建关系的子集视图：
```typescript
const ActiveFriendship = Entity.create({
  name: 'ActiveFriendship',
  sourceEntity: Friendship,  // Friendship 是一个 Relation
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});
```

## 性能优化

1. **索引优化**：建议为 `__filtered_entities` 字段创建 GIN 索引（PostgreSQL）
2. **批量操作**：在批量创建/更新时，updateFilteredEntityFlags 会被批量调用
3. **查询优化**：filtered entity 查询直接转换为源实体查询，避免额外开销
4. **事件合并**：相同类型的连续事件可以被合并处理

## 使用限制

1. **单层过滤**：当前不支持 filtered entity 的 filtered entity（嵌套过滤）
2. **同步更新**：__filtered_entities 字段的更新是同步的，可能影响写入性能
3. **过滤条件静态**：过滤条件在定义时确定，不支持动态修改
4. **跨实体过滤**：不支持基于关联实体字段的过滤条件

## 最佳实践

1. **合理使用过滤条件**：避免过于复杂的过滤条件，影响性能
2. **索引优化**：为经常用于过滤的字段创建数据库索引
3. **事件处理**：合理处理 filtered entity 事件，避免重复处理
4. **命名规范**：filtered entity 命名应该体现其过滤特征，如 `ActiveUsers`、`PublishedPosts`

## 测试覆盖

测试用例 (`tests/storage/filteredEntity.spec.ts`) 覆盖了以下场景：

1. **基础功能**：创建、查询、识别 filtered entities
2. **CRUD 操作**：通过 filtered entity 进行增删改查
3. **事件系统**：验证各种操作产生的事件正确性
4. **复杂条件**：多条件组合的 filtered entity
5. **边界情况**：空结果集、全部满足等特殊情况
6. **Relation 支持**：以 Relation 作为源实体的 filtered entity

## 与响应式系统的集成

Filtered Entity 完全集成到 interaqt 的响应式系统中：

1. **Computation 支持**：可以在 Computation 中使用 filtered entity
2. **事件驱动**：通过事件系统触发相关的响应式计算
3. **实时更新**：数据变化自动反映到所有依赖的计算中
4. **一致性保证**：通过事务和事件机制保证数据一致性 