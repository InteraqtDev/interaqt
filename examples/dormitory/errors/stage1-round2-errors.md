# Stage 1 第二轮测试错误分析

## 错误概述
修复 recordId 问题后，测试仍然失败。主要问题集中在实体创建和关系名称上。

## 主要错误

### 1. 创建宿舍后找不到记录
**测试结果**：TC001 失败，`dormitory` 为 undefined

**可能原因**：
1. Dormitory 的 Transform 没有正确执行
2. Transform 返回的数据格式不正确
3. 嵌套创建床位的方式可能有问题

**当前代码**：
```typescript
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['payload', 'user'],
  callback: (event) => {
    if (event.interactionName === 'CreateDormitory') {
      const beds = []
      for (let i = 1; i <= event.payload.capacity; i++) {
        beds.push({ bedNumber: i })
      }
      return {
        name: event.payload.name,
        capacity: event.payload.capacity,
        beds: beds // 嵌套创建可能不支持
      }
    }
    return null
  }
})
```

### 2. 关系名称错误
**错误信息**：`entity UserDeductionRecordRelation not found`

**分析**：
- 框架自动生成的关系名称可能不是 `UserDeductionRecordRelation`
- 需要使用正确的关系名称

### 3. 其他失败的测试
- TC002-TC008 都因为依赖于 TC001 创建的宿舍而失败
- 只有 TC009 和 TC010（View 类交互）成功，因为它们不创建数据

## 修复方案

### 1. 修复宿舍创建
- 不使用嵌套创建方式
- 分别创建宿舍和床位
- 确保 Transform 正确返回数据

### 2. 修复关系名称
- 使用 `storage.getRelationName()` 获取正确的关系名称
- 或者根据框架的命名规则推断正确的名称

### 3. 调试建议
- 添加日志输出查看 Transform 是否执行
- 检查数据库中是否有记录创建
- 验证关系名称的正确性

## 具体修改

### 修改宿舍创建逻辑
```typescript
// 简化 Dormitory 的 Transform，只创建宿舍本身
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['payload'],
  callback: (event) => {
    if (event.interactionName === 'CreateDormitory') {
      return {
        name: event.payload.name,
        capacity: event.payload.capacity
      }
    }
    return null
  }
})

// 单独创建床位
Bed.computation = Transform.create({
  record: Dormitory,
  attributeQuery: ['id', 'capacity'],
  callback: (dormitory) => {
    const beds = []
    for (let i = 1; i <= dormitory.capacity; i++) {
      beds.push({
        bedNumber: i,
        dormitory: { id: dormitory.id }
      })
    }
    return beds
  }
})
```

### 修复关系引用
需要确认框架自动生成的关系名称格式，可能是：
- `User_deductionRecords_user_DeductionRecord`
- 或其他格式

## 下一步行动
1. 简化 Transform 逻辑，确保基本功能能工作
2. 添加调试日志
3. 逐个修复失败的测试
4. 确认关系名称的正确格式 