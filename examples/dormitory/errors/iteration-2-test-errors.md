# 错误记录 - 第2轮修复

## 问题总结

### 错误类型
测试执行中的多个错误：
1. Storage API 错误：`system.storage.findMany is not a function`
2. DefaultValue 函数错误：`column.defaultValue is not a function`

### 根本原因
1. 测试代码使用了错误的存储 API 访问方式
2. Entity 定义中的 defaultValue 函数可能有问题

### 具体错误
- `system.storage.findMany is not a function` - 使用了不存在的 API 方法
- `column.defaultValue is not a function` - defaultValue 不是函数类型

### 修复方向
1. 研究正确的存储 API 使用方式
2. 检查并修复 Entity 定义中的 defaultValue 问题
3. 参考 crud.example.test.ts 中的正确用法

### 状态
需要修复

### 已知工作的部分
- 系统初始化成功
- CreateDormitory 交互基本工作 (创建了宿舍记录)
- 数据库表创建成功