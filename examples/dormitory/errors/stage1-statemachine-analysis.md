# Stage 1: StateMachine Analysis

## 当前问题

StateMachine处理时出现错误：`Cannot read properties of undefined (reading 'currentStatus')`

## 分析

1. **KickoutRequest实体**有两个状态属性：
   - `status` - 基础属性，defaultValue: 'pending'
   - `currentStatus` - StateMachine计算属性

2. **问题根源**：
   - StateMachine试图读取`currentStatus`属性
   - 但记录可能还没有这个计算属性的值

## 可能的解决方案

### 方案1: 简化StateMachine，去除多余的状态属性
只保留一个状态属性，要么是基础的`status`，要么是计算的`currentStatus`

### 方案2: 确保StateMachine正确初始化
确保StateMachine能正确处理初始状态

### 方案3: 使用更简单的状态更新方式
使用Transform而不是StateMachine来更新状态

## 建议采用方案1
去除重复的状态属性，只保留StateMachine管理的`status`属性。