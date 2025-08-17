# 依赖分析脚本修复说明

## 问题描述
原始的 `plan.ts` 脚本存在以下问题：
1. 只有当 entity/relation 有 computation 且类型不是 'None' 时才创建节点
2. property 没有自动依赖于其所在的 entity/relation
3. 当 property 依赖于 `Entity.property` 时，没有自动添加对 `Entity` 的依赖

## 修复内容

### 1. 实体和关系节点创建逻辑
**修复前**：只有当 `type !== 'None'` 时才创建节点
**修复后**：满足以下任一条件即创建节点：
- 有 dependencies
- 有 interactionDependencies  
- 有 computation（type !== 'None'）
- 有需要计算的属性

### 2. 属性依赖处理
**修复前**：直接使用原始 dependencies
**修复后**：
- 自动添加对所在实体的依赖
- 解析 `Entity.property` 格式的依赖，自动添加对 `Entity` 的依赖
- 去重处理，避免重复依赖

### 3. 完整的依赖链
现在的依赖链更加完整和合理：
```
User.totalDeductions 
  → User (自身所在实体)
  → UserPointDeductionRelation (直接依赖)
  → PointDeduction.points (属性依赖)
  → PointDeduction (属性所在实体，自动添加)
```

## 验证结果
修复后的脚本成功生成了26个计算节点，分为4个实现阶段：
- **Phase 1**: 4个实体计算（User, Dormitory, PointDeduction, EvictionRequest）
- **Phase 2**: 1个实体 + 8个属性 + 7个关系
- **Phase 3**: 3个属性 + 2个关系  
- **Phase 4**: 1个属性

依赖关系正确体现了：
- User 实体虽然没有 Transform，但因为有计算属性而被包含
- Bed 正确依赖于 Dormitory
- 所有属性都正确依赖于其所在的实体
- 跨实体的属性引用被正确展开
