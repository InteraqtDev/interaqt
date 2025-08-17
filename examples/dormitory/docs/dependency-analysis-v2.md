# 依赖分析脚本 v2 - Dependencies 分离设计

## 设计原则

### 1. 双依赖字段设计
- **`dependencies`**: 保持原始的直接计算依赖，这些是 computation 实际使用的依赖
- **`expandedDependencies`**: 包含所有展开的依赖，用于构建依赖图和确定实现顺序

### 2. 各类型节点的依赖处理

#### Entity 节点
```json
{
  "id": "Dormitory",
  "dependencies": ["InteractionEventEntity"],  // 原始依赖
  "expandedDependencies": ["InteractionEventEntity"]  // 相同
}
```

#### Property 节点
```json
{
  "id": "User.role",
  "dependencies": [],  // 原始：无直接计算依赖
  "expandedDependencies": ["User"]  // 展开：添加所在实体
}
```

```json
{
  "id": "User.totalDeductions",
  "dependencies": [
    "UserPointDeductionRelation",
    "PointDeduction.points"
  ],  // 原始：计算所需的关系和属性
  "expandedDependencies": [
    "User",  // 添加：所在实体
    "UserPointDeductionRelation",
    "PointDeduction.points",
    "PointDeduction"  // 添加：属性依赖的实体
  ]
}
```

#### Relation 节点
```json
{
  "id": "UserDormitoryRelation",
  "dependencies": ["User", "Dormitory"],  // 原始依赖
  "expandedDependencies": ["User", "Dormitory"]  // 相同
}
```

### 3. 展开规则

对于 Property 节点的 `expandedDependencies`：
1. **必须包含**所在实体（如 `User.role` → 包含 `User`）
2. **包含**所有原始依赖
3. **如果依赖** `Entity.property` 格式，则自动包含 `Entity`
   - 例如：依赖 `PointDeduction.points` → 自动包含 `PointDeduction`

### 4. 依赖图构建

依赖图的边使用 `expandedDependencies` 而不是 `dependencies`：
```typescript
// 使用 expandedDependencies 构建完整的依赖图
for (const dep of node.expandedDependencies) {
  // 创建边：dep → node
}
```

## 优势

1. **保持语义清晰**
   - `dependencies` 反映实际的计算依赖
   - `expandedDependencies` 反映实现顺序依赖

2. **调试友好**
   - 可以清楚看到原始设计意图（dependencies）
   - 也能看到完整的依赖链（expandedDependencies）

3. **正确的实现顺序**
   - 确保实体先于其属性创建
   - 确保被引用的实体先于引用者创建

## 示例输出

Phase 2 中的 `User.role`：
- 依赖于 Phase 1 中的 `User` 实体（通过 expandedDependencies）
- 原始 dependencies 为空，表明它不需要其他计算输入

Phase 3 中的 `User.totalDeductions`：
- 依赖于 Phase 1 中的 `User` 和 `PointDeduction` 实体
- 依赖于 Phase 2 中的 `UserPointDeductionRelation` 关系
- 原始 dependencies 准确反映了 Summation 计算所需的输入
