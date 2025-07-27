# Filtered Entity 跨实体查询限制分析

## 概述

Filtered Entity 是 interaqt 框架中的一个重要特性，它允许创建实体的虚拟子集。然而，当前实现存在一个重要限制：`filterCondition` 只能基于源实体自身的字段进行过滤，不支持基于关联实体字段的过滤（跨实体查询）。

## 限制示例

```typescript
// 当前支持的过滤方式
const ActiveUsers = Entity.create({
  name: 'ActiveUsers',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'isActive',         // User 实体自身的字段
    value: ['=', true]
  })
});

// 不支持的过滤方式
const TechDepartmentUsers = Entity.create({
  name: 'TechDepartmentUsers',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'department.name',   // ❌ 关联实体 Department 的字段
    value: ['=', 'Technology']
  })
});
```

## 技术原因分析

### 1. 查询系统架构限制

#### 单表查询设计
当前的 `MatchExp` 和 `RecordQuery` 系统设计为单表查询：

```typescript
// RecordQuery 的结构
interface RecordQuery {
  recordName: string;        // 单个实体名
  matchExpression: object;   // 只能匹配该实体的字段
  attributeQuery: string[];  // 只能查询该实体的属性
}
```

查询执行时直接转换为单表 SQL，没有 JOIN 机制：
```sql
-- 当前生成的查询
SELECT * FROM "User" WHERE isActive = true;

-- 跨实体查询需要的 SQL（不支持）
SELECT u.* FROM "User" u 
JOIN "UserDepartment" ud ON u.id = ud.source
JOIN "Department" d ON ud.target = d.id
WHERE d.name = 'Technology';
```

### 2. 标记维护机制限制

#### 当前标记更新流程
`updateFilteredEntityFlags` 方法只在源实体记录变化时触发：

```typescript
async updateFilteredEntityFlags(entityName: string, recordId: string, ...) {
  // 只检查当前实体的记录是否满足条件
  const matchingRecords = await this.findRecords(
    RecordQuery.create(entityName, this.map, {
      matchExpression: filteredEntity.filterCondition.and({
        key: 'id',
        value: ['=', recordId]
      })
    })
  );
}
```

这意味着：
- 当 User 记录更新时，会检查并更新 `__filtered_entities` 标记
- 但当关联的 Department 记录更新时，不会触发 User 记录的标记更新

### 3. 事件传播机制缺失

#### 单向事件流
当前事件系统是单向的，只在直接操作的实体上生成事件：

```typescript
// Department 更新时
await update('Department', { id: 'dept1' }, { name: 'NewName' });
// 只生成 Department 的 update 事件

// 不会传播到关联的 User 记录
// 不会更新 User 的 __filtered_entities 标记
// 不会生成 filtered entity 的事件
```

### 4. 性能和复杂度考虑

#### 级联更新的复杂性
如果支持跨实体过滤，需要处理：

1. **反向关系追踪**：当 Department 更新时，找到所有关联的 User
2. **批量标记更新**：可能需要更新大量 User 记录的标记
3. **事务一致性**：确保跨表更新的原子性
4. **循环依赖**：处理复杂的实体关系图

```typescript
// 潜在的性能问题示例
Department.update({ type: 'tech' }) 
  → 需要找到所有关联的 User（可能数千条）
  → 每个 User 需要重新计算所有 filtered entity 标记
  → 生成大量事件
```

### 5. 查询优化困难

#### JOIN 查询的优化挑战
跨实体查询需要动态生成 JOIN：

```typescript
// 简单情况
user.department.name = 'Tech'

// 复杂情况
user.department.manager.role.permissions.includes('admin')
// 需要多层 JOIN，性能难以预测
```

## 设计决策的合理性

### 1. 简化实现
- 避免复杂的查询重写逻辑
- 减少系统的认知负担
- 提高代码可维护性

### 2. 性能可预测
- 查询性能与源实体记录数直接相关
- 避免意外的 N+1 查询问题
- 标记更新的开销可控

### 3. 一致性保证
- 事件和查询结果始终一致
- 避免跨实体更新的事务复杂性
- 简化并发控制

## 现有解决方案

### 1. 使用 Computation
对于需要跨实体过滤的场景，可以使用 Computation：

```typescript
// 使用 StateMachine 维护跨实体状态
const UserDepartmentType = Property.create({
  name: 'departmentType',
  type: 'string',
  computation: StateMachine.create({
    states: [techState, nonTechState],
    defaultState: nonTechState,
    transfers: [
      StateTransfer.create({
        current: nonTechState,
        next: techState,
        trigger: DepartmentUpdated,
        computeTarget: (event) => /* 计算逻辑 */
      })
    ]
  })
});
```

### 2. 数据冗余
在必要时，可以将关联实体的关键字段冗余到源实体：

```typescript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'departmentName', type: 'string' }), // 冗余字段
    Property.create({ name: 'departmentType', type: 'string' })  // 冗余字段
  ]
});
```

### 3. 使用视图或物化视图
在数据库层面创建包含 JOIN 结果的视图，然后基于视图创建 Entity。

## 总结

FilterCondition 不支持跨实体查询是一个深思熟虑的设计决策，主要考虑了：

1. **实现复杂度**：避免查询重写、事件传播、标记维护的复杂性
2. **性能可控**：确保查询和更新性能的可预测性
3. **一致性保证**：简化事务管理和并发控制
4. **系统可维护性**：降低代码复杂度，提高可理解性

虽然这带来了一些使用上的限制，但通过 Computation、数据冗余等替代方案，仍然可以实现大部分跨实体过滤的需求。这种权衡使得 interaqt 框架在保持功能强大的同时，也保持了系统的简洁和高效。 