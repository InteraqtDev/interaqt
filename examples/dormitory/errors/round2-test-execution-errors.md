# Round 2: Test Execution Errors

## 错误描述
运行Stage 1测试时遇到以下错误：

1. **integer out of range**: 数据库整数类型无法存储Date.now()的值
2. **column.defaultValue is not a function**: 某些defaultValue属性不是函数

## 问题分析

### 错误1: Integer Out of Range
**原因**: Date.now()返回的时间戳值太大，无法存储在数据库的INTEGER类型中。例如：1753580946002 超出了32位整数范围。

**影响范围**: 所有使用`defaultValue: () => Date.now()`的属性：
- User.createdAt
- Dormitory.createdAt  
- Bed.createdAt
- ScoreRecord.createdAt
- KickoutRequest.requestedAt
- 以及各种关系的时间戳属性

### 错误2: column.defaultValue is not a function
**原因**: 在设置数据库表结构时，系统期望defaultValue是函数，但某些地方可能存储了非函数值或有类型问题。

**可能原因**:
- 重复的状态节点定义导致状态混乱
- StateMachine中的computeValue函数设置有误
- 属性定义中的defaultValue类型错误

## 修复方案

### 方案1: 修改时间戳类型
将时间戳相关的属性类型从'number'改为'string'，使用ISO字符串格式，或者改为'bigint'类型来存储大整数。

### 方案2: 简化StateMachine定义
- 移除重复的状态节点定义
- 确保所有computeValue都是正确的函数
- 简化复杂的状态机逻辑

### 方案3: 使用更简单的默认值
对于测试阶段，可以使用更小的数值或字符串格式的时间戳。

## 修复计划

1. 将所有时间戳属性的type改为'string'，使用ISO格式
2. 修复defaultValue函数定义问题
3. 简化StateMachine中重复的状态节点引用
4. 重新运行测试验证修复

## 当前状态
- [ ] 修复时间戳类型问题
- [ ] 修复defaultValue函数问题
- [ ] 简化状态机定义
- [ ] 重新测试验证