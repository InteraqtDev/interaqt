# Stage 1 测试错误分析 - 第二轮

## 错误现象

尽管已经进行了以下修复，错误仍然存在：
```
SchedulerError: Failed to setup computation default values
```

## 已尝试的修复

1. ✅ 移除了User.status StateMachine中的异步computeTarget
2. ✅ 移除了Bed.status StateMachine中的异步computeTarget  
3. ✅ 将UserDormitoryRelation从StateMachine改为Transform
4. ✅ 简化了UserBedRelation，移除了复杂的computation
5. ✅ 注释掉了violationScore、violationCount、occupiedBeds的计算
6. ✅ 移除了computed函数（canBeEvicted、isAssigned、availableBeds、occupancyRate）

## 深入分析

### 当前仍存在的潜在问题

1. **evictionApprovedState和evictionRejectedState的computeValue**
   - 这些StateNode使用了复杂的computeValue函数
   - 可能在setup阶段无法正确处理

2. **StateMachine的空transfers数组**
   - User.status和Bed.status的StateMachine现在有空的transfers数组
   - 这可能导致setup问题

3. **Transform的callback复杂度**
   - Bed.computation中的Transform回调创建多个床位
   - 可能在setup阶段有问题

## 进一步的修复方案

### 方案A：完全移除StateMachine（最激进）
移除所有StateMachine，使用简单的defaultValue，在测试中手动更新状态。

### 方案B：简化StateNode的computeValue
确保所有StateNode的computeValue都是简单的同步函数，不依赖event参数。

### 方案C：创建最小可行版本
创建一个新的极简backend实现，只包含必要的实体和关系，逐步添加功能。

## 立即采取的行动

选择方案B，简化所有StateNode的computeValue函数。

## 问题根源猜测

setup阶段可能在尝试初始化所有计算的默认值时，遇到了某些依赖未满足或执行上下文不正确的情况。
