# Round 2: 测试API错误和StateMachine结构问题

## 错误概述

第二轮测试运行时发现多个问题：

### 1. 系统初始化API错误
**错误信息**: `system.register is not a function`
**原因**: 使用了错误的API，应该使用Controller构造函数和setup方法
**正确方式**:
```typescript
system = new MonoSystem(new PGLiteDB())
controller = new Controller({
  system,
  entities,
  relations,
  interactions,
})
await controller.setup(true)
```

### 2. StateMachine结构问题
**潜在问题**: 当前代码中很多StateMachine的transfers数组为空，这可能导致状态转换无法正常工作

### 3. 床位创建逻辑问题
**问题**: 在CreateDormitory交互中，床位的创建和与宿舍的关系建立可能存在问题，因为需要床位创建后才能建立DormitoryBedRelation

## 修复策略

### 1. 修正测试初始化
- 使用正确的Controller API
- 确保entities、relations、interactions正确导出

### 2. 简化StateMachine实现
- 暂时移除所有StateTransfer，专注于基础CRUD功能
- 在后续阶段再添加状态转换

### 3. 修正床位创建逻辑
- 确保CreateDormitory时床位正确创建
- 修正DormitoryBedRelation的建立逻辑

## 实施计划

1. 修正测试文件的系统初始化
2. 简化backend/index.ts中的StateMachine，移除transfers
3. 修正床位创建和关系建立逻辑
4. 重新运行测试验证基础功能

这些问题表明需要更深入理解interaqt框架的API使用模式和StateMachine的工作机制。