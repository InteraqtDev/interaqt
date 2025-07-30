# 错误记录 - 第1轮修复

## 问题总结

### 错误类型
TypeScript 编译错误：在 StateTransfer 的 trigger 中使用字符串而不是 Interaction 实例

### 根本原因
1. StateTransfer.trigger 需要引用实际的 Interaction 实例，而不是字符串名称
2. Transform.record 在某些地方使用了字符串而不是实体引用
3. 循环依赖问题：在定义实体时引用还未定义的交互

### 具体错误
- `backend/index.ts(101,13): error TS2322: Type 'string' is not assignable to type 'InteractionInstance'.`
- 多个类似错误，都涉及到 trigger 属性使用字符串

### 修复方法
1. 将 StateTransfer 中的字符串 trigger 改为引用实际的 Interaction 实例
2. 需要重新组织代码结构，确保 Interactions 在 StateMachine 使用前已定义
3. 使用正确的实体引用而不是字符串

### 状态
需要修复