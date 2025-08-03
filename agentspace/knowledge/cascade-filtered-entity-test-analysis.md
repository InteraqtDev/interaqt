# Cascade Filtered Entity 测试分析

## 测试失败原因分析

### 1. 属性访问错误

错误信息：`ActiveUsers has no attribute: name`

**原因分析**：
- 当前系统在处理 filtered entity 时，会验证属性是否属于该实体
- 但 filtered entity 应该继承其 sourceEntity 的所有属性
- 看起来系统没有正确处理级联 filtered entity 的属性继承

**相关代码位置**：
- `AttributeInfo` 构造函数检查属性是否存在
- `EntityToTableMap.getInfoByPath` 获取属性信息时失败

### 2. 事件生成不完整

错误信息：期望 4 个事件，但只有 2 个

**原因分析**：
- 系统只生成了 User create 和第一层 filtered entity (ActiveUsers) 的事件
- 没有生成第二层 (TechActiveUsers) 和第三层 (SeniorTechActiveUsers) 的事件
- 这说明系统没有递归处理级联 filtered entity

### 3. 核心问题

当前系统的假设：
1. filtered entity 的 sourceEntity 必须是普通 Entity，不能是另一个 filtered entity
2. 事件生成只考虑了一层 filtered entity

## 需要的修改

### 1. Setup.ts 中的 createRecord
- 需要递归查找最底层的源实体来获取属性定义
- 修改 filteredBy 的逻辑来支持多层级

### 2. RecordQuery 构造函数
- 需要递归解析 filtered entity 链
- 合并所有层级的 matchExpression

### 3. FilteredEntityManager
- `getFilteredEntitiesForSource` 需要递归查找所有依赖的 filtered entities
- 事件生成需要考虑级联关系

### 4. EntityToTableMap
- 需要修改属性查找逻辑，让 filtered entity 能够访问其源实体的属性

## 测试用例设计说明

我设计的测试用例覆盖了：

1. **多层级查询**：User -> ActiveUsers -> TechActiveUsers -> SeniorTechActiveUsers
2. **分支查询**：ActiveUsers 可以派生出 TechActiveUsers 和 YoungActiveUsers
3. **增删改查操作**：测试所有 CRUD 操作在级联 filtered entity 上的表现
4. **事件生成**：验证每层都生成正确的事件
5. **条件组合**：测试在已有 matchExpression 基础上添加额外条件

这些测试用例能够全面验证级联 filtered entity 功能的正确性。 