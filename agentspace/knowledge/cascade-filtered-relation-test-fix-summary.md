# Cascade Filtered Relation Test Fix Summary

## 问题
在 `tests/storage/cascadeFilteredRelation.spec.ts` 中，有多处使用了错误的 attributeQuery 格式来查询关系的 source 和 target 属性。这导致查询结果中 source/target 只返回 ID，而不是完整的实体数据。

## 解决方案
使用正确的嵌套 attributeQuery 格式来指定需要查询的 source/target 字段。

### 错误的格式
```typescript
['source', 'target', 'role', 'isActive']
```

### 正确的格式
```typescript
[
    ['source', {attributeQuery: ['name', 'department']}],
    ['target', {attributeQuery: ['name', 'priority']}],
    'role', 
    'isActive'
]
```

## 修复的位置

1. **基础二级级联测试** - Line 153-166
   - 修复了 LeadUserProjectRelation 的查询
   - 添加了对 source.name 的验证

2. **复杂匹配表达式测试** - Line 285-298
   - 修复了 SeniorHighPriorityRelation 的查询
   - 启用了 source.name 和 target.title 的断言

3. **CRUD 操作测试** - Line 382-457
   - 修复了所有 SeniorManagerRelation 查询（4处）
   - 启用了 target.name 的验证

4. **三级级联测试** - Line 588-600
   - 修复了 TechHighValueUSRelation 的查询
   - 启用了 source.name 和 target.title 的断言

## 关键要点

1. **关系查询需要嵌套格式**：当查询关系的 source/target 时，必须使用嵌套的 attributeQuery 格式，而不是简单的字段名。

2. **格式参考**：可以参考 `tests/storage/relationAttributes.spec.ts` 中的示例：
   ```typescript
   ['source', {attributeQuery: ['name', 'age']}],
   ['target', {attributeQuery: ['name']}]
   ```

3. **测试验证**：修复后所有 8 个测试都通过，证明 cascade filtered relation 功能完全正常工作。

## 结论
通过正确使用 attributeQuery 的嵌套格式，我们成功地让测试能够获取并验证 source/target 的详细字段，而不仅仅是 ID。这使得测试更加完整和准确。 