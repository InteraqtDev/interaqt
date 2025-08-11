# Stage 1 测试错误分析 - 第一轮

## 错误现象

所有测试用例都失败，错误信息：
```
SchedulerError: Failed to setup computation default values
```

## 问题分析

### 1. 直接原因
Controller在setup阶段失败，无法正确初始化计算的默认值。

### 2. 可能的根本原因

#### 2.1 StateTransfer中的异步函数问题
在backend/index.ts中，多个StateTransfer使用了async function作为computeTarget，这可能导致setup阶段的问题。

例如：
```typescript
computeTarget: async function(this: Controller, event) {
  const request = await this.system.storage.findOne(
    'EvictionRequest',
    MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
    undefined,
    ['targetUser']
  )
  return request?.targetUser ? { id: request.targetUser.id } : null
}
```

在setup阶段，这些异步函数可能无法正确执行，因为：
- storage可能还未完全初始化
- 没有实际的event数据
- this上下文可能不正确

#### 2.2 计算属性的前向引用
虽然已经将计算属性配置移到关系定义之后，但可能还有其他循环依赖问题。

#### 2.3 Bed.status的床位状态转换
bedAvailableState → bedReleasedState的转换可能有问题，因为bedReleasedState的computeValue返回'available'，但应该保持状态节点名称。

## 修复方案

### 方案1：简化StateTransfer的computeTarget（推荐）
在Stage 1阶段，先使用简化的同步computeTarget函数，避免在setup阶段查询数据库。

### 方案2：修正StateNode的computeValue
确保StateNode的computeValue返回正确的值类型。

### 方案3：移除复杂的关系StateMachine
UserDormitoryRelation和UserBedRelation使用了复杂的StateMachine，可以考虑在Stage 1先使用Transform。

## 立即采取的行动

1. 先简化backend/index.ts中的StateTransfer实现
2. 修正bedReleasedState的问题
3. 重新运行测试

## 预期结果

修复后，Controller.setup()应该能成功完成，测试用例能够正常运行。
