# Round 1: TypeScript Compilation Errors

## 错误描述
运行`npm run check`时发现以下TypeScript编译错误：

1. **Line 214**: Type 'string' is not assignable to type 'RelationInstance | EntityInstance'
2. **Line 244**: Type 'string' is not assignable to type 'RelationInstance | EntityInstance' 
3. **Line 432**: Object literal may only specify known properties, and 'condition' does not exist in type 'StateTransferCreateArgs'
4. **Line 439**: Object literal may only specify known properties, and 'condition' does not exist in type 'StateTransferCreateArgs'
5. **Line 479**: Type '(this: any, event: any) => any' is not assignable to type '() => unknown'

## 问题分析

### 错误1和2 - 'string' is not assignable to type 'RelationInstance | EntityInstance'
**位置**: Line 214 (User.totalScore Summation) 和 Line 244 (Dormitory.occupiedBeds Count)

**原因**: 在Summation和Count中使用字符串'UserScoreRelation'和'DormitoryBedRelation'来引用关系，但应该使用实际的关系实例。

**解决方法**: 将字符串引用改为实际的关系实例引用。

### 错误3和4 - 'condition' does not exist in type 'StateTransferCreateArgs'
**位置**: Line 432 和 439 (KickoutRequest status StateMachine)

**原因**: StateTransfer.create不支持'condition'属性，但我尝试使用它来条件性地选择状态转换。

**解决方法**: 移除condition属性，创建两个独立的StateTransfer，或者在computeTarget中处理条件逻辑。

### 错误5 - computeValue function signature mismatch
**位置**: Line 479 (KickoutRequest processNote)

**原因**: computeValue期望无参数函数`() => unknown`，但我提供了带参数的函数`(this: any, event: any) => any`。

**解决方法**: 修改computeValue函数签名或使用其他方式获取event数据。

## 修复计划

1. 修复Summation和Count中的关系引用
2. 移除StateTransfer中的condition属性，使用多个StateTransfer代替
3. 修复computeValue函数签名问题
4. 重新检查所有计算的API使用是否正确

## 修复状态
- [ ] 修复关系引用问题
- [ ] 修复StateTransfer condition问题  
- [ ] 修复computeValue函数签名
- [ ] 重新编译验证