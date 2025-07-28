# 宿舍管理系统交互矩阵

## 交互矩阵概述

本文档确保：
- 每个用户角色都有对应的Interactions完成所有操作
- 每个Interaction都有清晰的权限控制或业务规则约束
- 每个Interaction都有对应的测试用例
- 记录访问控制要求和业务逻辑验证

## 用户角色定义

### 1. 系统管理员 (admin)
- 系统最高权限用户
- 负责系统配置和用户管理
- 可以执行所有管理操作

### 2. 宿舍长 (dormHead)
- 管理特定宿舍的用户
- 负责本宿舍的日常管理
- 有权对本宿舍成员进行管理操作

### 3. 普通学生 (student)
- 系统的基础用户
- 主要进行查看和自我管理操作
- 权限最为受限

## 核心业务交互矩阵

| 交互名称 | admin | dormHead | student | 权限控制要求 | 业务规则验证 | 对应测试用例 |
|---------|--------|----------|---------|-------------|-------------|-------------|
| **宿舍管理** |
| CreateDormitory | ✅ | ❌ | ❌ | 仅管理员 | 容量4-6，名称唯一 | TC001, TC002, TC101, TC201 |
| UpdateDormitory | ✅ | ❌ | ❌ | 仅管理员 | 容量限制，不能减少已占用床位 | - |
| DeleteDormitory | ✅ | ❌ | ❌ | 仅管理员 | 必须为空宿舍 | - |
| ViewDormitory | ✅ | ✅* | ✅* | 管理员看全部，其他看相关 | - | - |
| **用户管理** |
| AssignDormHead | ✅ | ❌ | ❌ | 仅管理员 | 目标用户必须为student角色 | TC003 |
| RemoveDormHead | ✅ | ❌ | ❌ | 仅管理员 | 处理已有管理关系 | - |
| AssignUserToDormitory | ✅ | ❌ | ❌ | 仅管理员 | 宿舍有空床位，用户未分配 | TC004, TC202, TC204 |
| RemoveUserFromDormitory | ✅ | ❌ | ❌ | 仅管理员 | 处理相关关系和床位 | - |
| **扣分管理** |
| CreateScoreRecord | ✅ | ✅* | ❌ | 管理员全部，宿舍长限本宿舍 | 不能给自己扣分，扣分必须>0 | TC005, TC102, TC205 |
| RevokeScoreRecord | ✅ | ✅* | ❌ | 原操作者或管理员 | 记录必须为active状态 | TC008 |
| ViewScoreRecord | ✅ | ✅* | ✅* | 管理员全部，其他限相关 | - | - |
| **踢出管理** |
| CreateKickRequest | ❌ | ✅* | ❌ | 仅宿舍长 | 目标用户扣分≥10，在本宿舍 | TC006, TC103, TC203 |
| ProcessKickRequest | ✅ | ❌ | ❌ | 仅管理员 | 申请状态为pending | TC007 |
| ViewKickRequest | ✅ | ✅* | ✅* | 管理员全部，其他限相关 | - | - |
| **规则管理** |
| CreateScoreRule | ✅ | ❌ | ❌ | 仅管理员 | 扣分值>0，规则名称唯一 | - |
| UpdateScoreRule | ✅ | ❌ | ❌ | 仅管理员 | 不影响已有记录 | - |
| ViewScoreRule | ✅ | ✅ | ✅ | 所有用户 | - | - |

**注释**：
- ✅ = 完全访问权限
- ✅* = 有条件访问权限
- ❌ = 无访问权限

## 详细权限控制规则

### 1. 宿舍管理权限
```markdown
CreateDormitory:
- 权限检查: user.role === 'admin'
- 业务规则: 
  - payload.capacity >= 4 && payload.capacity <= 6
  - 宿舍名称在系统中唯一
  - payload.name.trim().length > 0
```

### 2. 用户分配权限
```markdown
AssignDormHead:
- 权限检查: user.role === 'admin'
- 业务规则:
  - 目标用户当前role === 'student'
  - 目标宿舍当前没有宿舍长
  - 目标用户未管理其他宿舍

AssignUserToDormitory:
- 权限检查: user.role === 'admin'
- 业务规则:
  - 目标宿舍有可用床位
  - 用户当前未分配到任何宿舍
  - 指定床位未被占用
```

### 3. 扣分管理权限
```markdown
CreateScoreRecord:
- 权限检查: 
  - user.role === 'admin' OR 
  - (user.role === 'dormHead' AND targetUser.dormitory === user.managedDormitory)
- 业务规则:
  - targetUser !== user (不能给自己扣分)
  - payload.score > 0
  - 扣分规则存在且启用
  - 目标用户状态为active
```

### 4. 踢出申请权限
```markdown
CreateKickRequest:
- 权限检查: 
  - user.role === 'dormHead' AND 
  - targetUser.dormitory === user.managedDormitory
- 业务规则:
  - targetUser.totalScore >= 10
  - targetUser.status === 'active'
  - 目标用户没有pending状态的踢出申请

ProcessKickRequest:
- 权限检查: user.role === 'admin'
- 业务规则:
  - kickRequest.status === 'pending'
  - 申请未超过30天有效期
```

## 条件访问权限详细说明

### 1. 查看权限的条件访问
```markdown
ViewDormitory:
- admin: 查看所有宿舍
- dormHead: 仅查看自己管理的宿舍
- student: 仅查看自己所在的宿舍

ViewScoreRecord:
- admin: 查看所有扣分记录
- dormHead: 查看本宿舍成员的扣分记录
- student: 仅查看自己的扣分记录

ViewKickRequest:
- admin: 查看所有踢出申请
- dormHead: 查看自己发起的申请
- student: 查看针对自己的申请
```

## 业务逻辑验证规则

### 1. 数据完整性验证
- 所有必填字段检查
- 数据类型和格式验证
- 引用完整性检查
- 唯一性约束验证

### 2. 业务状态验证
- 用户状态一致性检查
- 宿舍容量限制检查
- 关系状态有效性检查
- 时间序列逻辑检查

### 3. 权限边界验证
- 跨宿舍操作限制
- 角色权限边界检查
- 自我操作限制检查
- 状态转换权限检查

## 交互依赖关系图

```
CreateDormitory → AssignDormHead → AssignUserToDormitory
     ↓               ↓                    ↓
 自动创建床位    建立管理关系         建立入住关系
     ↓               ↓                    ↓
 床位可分配      可进行管理操作      可进行扣分记录
                     ↓                    ↓
              CreateScoreRecord → CreateKickRequest
                     ↓                    ↓
              累积扣分计算         触发踢出条件
                                         ↓
                               ProcessKickRequest
                                         ↓
                               解除宿舍关系
```

## 错误处理矩阵

| 错误类型 | 错误代码 | 触发条件 | 返回信息 |
|---------|---------|---------|---------|
| 权限错误 | PERMISSION_DENIED | 用户角色不匹配 | "权限不足，无法执行此操作" |
| 业务规则错误 | BUSINESS_RULE_VIOLATION | 违反业务约束 | 具体规则说明 |
| 数据验证错误 | VALIDATION_FAILED | 输入数据无效 | 字段验证失败详情 |
| 资源冲突错误 | RESOURCE_CONFLICT | 资源状态冲突 | 冲突资源状态说明 |
| 资源不存在错误 | RESOURCE_NOT_FOUND | 引用资源不存在 | 资源标识和类型 |

## Stage实现策略

### Stage 1: 核心业务逻辑
- 实现所有Interaction的基本功能
- 不加入权限检查和业务规则验证
- 使用有效数据和正确角色进行测试
- 确保所有基础操作正常工作

### Stage 2: 权限和业务规则
- 在Interaction中添加condition检查
- 实现权限控制逻辑
- 实现业务规则验证
- 添加错误处理和返回

### 测试覆盖策略
- 每个交互至少有1个正常流程测试
- 每个权限规则至少有1个拒绝测试
- 每个业务规则至少有1个违反测试
- 边界条件和异常情况覆盖

## 后续扩展考虑

### 1. 通知系统交互
- SendKickNotification: 踢出申请通知
- SendScoreNotification: 扣分通知
- SendAssignmentNotification: 分配通知

### 2. 统计报表交互
- GenerateDormitoryReport: 宿舍统计报表
- GenerateScoreReport: 扣分统计报表
- GenerateOccupancyReport: 入住率报表

### 3. 审计日志交互
- LogUserAction: 用户操作日志
- ViewAuditLog: 审计日志查看
- ExportAuditLog: 审计日志导出