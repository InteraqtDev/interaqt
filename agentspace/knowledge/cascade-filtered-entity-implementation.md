# Cascade Filtered Entity Implementation Knowledge

## 当前 Filtered Entity 机制理解

### 1. 核心概念

- **Filtered Entity**: 通过 `sourceEntity` 和 `matchExpression` 定义的虚拟实体
- **原理**: 在查询时自动将 filtered entity 的 `matchExpression` 与查询条件合并

### 2. 关键组件

#### FilteredEntityManager
- 管理 filtered entity 的依赖关系
- 处理级联事件
- 更新 `__filtered_entities` 标记

#### RecordQuery
- 在构造时自动处理 filtered entity
- 将 filtered entity 转换为普通 entity 查询 + matchExpression

#### MatchExp
- 处理匹配表达式
- 支持 `convertFilteredRelation` 等方法
- 支持跨实体的路径查询（如 `team.type`）

### 3. 存储机制

- **`__filtered_entities` 字段**: JSON 格式，记录每个记录属于哪些 filtered entities
  ```json
  {
    "ActiveUsers": true,
    "YoungUsers": false
  }
  ```
- 在 CUD 操作时自动维护这个字段

### 4. 事件机制

- **创建记录时**: 生成 source entity create 事件 + 符合条件的 filtered entity create 事件
- **更新记录时**: 
  - 如果记录新满足条件：生成 filtered entity create 事件
  - 如果记录不再满足条件：生成 filtered entity delete 事件
- **删除记录时**: 生成所有相关 filtered entity delete 事件 + source entity delete 事件

### 5. 当前实现限制

- 只支持从普通 Entity 创建 Filtered Entity
- 不支持从 Filtered Entity 再创建 Filtered Entity（级联）

## 级联 Filtered Entity 需求分析

### 目标
1. 支持基于 filtered entity 创建新的 filtered entity
2. 正确处理级联查询
3. 正确生成级联事件

### 实现思路

1. **查询处理**：
   - 需要递归解析 sourceEntity，直到找到最底层的普通 entity
   - 合并所有层级的 matchExpression

2. **事件处理**：
   - 需要生成所有层级的事件
   - 例如：User -> ActiveUsers -> TechActiveUsers 的创建应该生成 3 个事件

3. **存储处理**：
   - `__filtered_entities` 需要记录所有层级的 filtered entity 标记

### 需要修改的位置

1. **Entity.create**: 允许 sourceEntity 是 filtered entity
2. **RecordQuery 构造函数**: 递归处理多层 filtered entity
3. **FilteredEntityManager**: 处理多层依赖关系
4. **事件生成逻辑**: 生成所有层级的事件 