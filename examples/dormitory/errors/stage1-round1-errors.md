# Stage 1 第一轮测试错误分析

## 错误概述
在运行 Stage 1 核心业务逻辑测试时，遇到了多个错误，主要集中在 Transform 计算和属性访问上。

## 主要错误

### 1. InteractionEventEntity 没有 recordId 属性
**错误信息**：
```
attribute recordId not found in _Interaction_. namePath: _Interaction_.recordId
```

**问题分析**：
- 在多个 Transform 的 attributeQuery 中使用了 `['payload', 'recordId']`
- 但 InteractionEventEntity 实际上没有 recordId 属性
- recordId 是在 Interaction 执行后由框架生成的，不能在 attributeQuery 中直接访问

**影响的 Transform**：
- Bed.computation (创建床位)
- DeductionRecord 相关的 Transform
- RemovalRequest 相关的 Transform

### 2. 扣分记录的分数为 0
**问题描述**：
- 在 DeductPoints 交互中，创建的 DeductionRecord 的 points 字段为 0
- 应该从 DeductionRule 中获取分数值

**原因**：
- Transform 的 callback 中使用了 `event.payload.points || 0`
- 但 payload 中没有 points 字段，应该从规则中获取

### 3. Transform 设计问题
**问题**：
- 部分 Transform 依赖于尚未创建的记录的 ID
- 关系创建的时机不正确
- 某些 Transform 的触发条件不明确

## 修复方案

### 1. 修复 recordId 问题
- 移除 attributeQuery 中的 'recordId'
- 改用其他方式来建立实体之间的关系
- 考虑在 Transform 返回值中直接建立关系

### 2. 修复扣分逻辑
- DeductionRecord 应该存储实际的扣分值
- 需要在创建时从 DeductionRule 获取 points
- 可能需要重新设计数据流

### 3. 重新设计 Transform 逻辑
- 确保 Transform 只依赖于已存在的数据
- 使用正确的触发时机
- 考虑使用多步骤的 Transform 来处理复杂的创建流程

### 4. 具体修改建议

#### 4.1 床位创建
- 在创建宿舍时直接创建床位
- 使用宿舍的信息而不是 recordId

#### 4.2 扣分记录创建
```typescript
// 修改 DeductionRecord 的 Transform
DeductionRecord.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['payload'],
  callback: (event) => {
    if (event.interactionName === 'DeductPoints') {
      // 需要从 payload 中获取规则信息来确定扣分值
      return {
        reason: event.payload.reason,
        points: 5 // 临时硬编码，需要改进
      }
    }
    return null
  }
})
```

#### 4.3 关系创建的时机
- 考虑在实体创建成功后再创建关系
- 或者使用 Transform 的返回值直接指定关系

## 下一步行动
1. 修复所有 Transform 中的 attributeQuery 问题
2. 重新设计扣分逻辑
3. 确保所有 Transform 的执行顺序正确
4. 重新运行测试验证修复效果 