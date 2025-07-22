# 宿舍管理系统交互矩阵

## 用户角色定义
- **admin**: 系统管理员
- **dormHead**: 宿舍长
- **student**: 普通学生

## 交互权限矩阵

| 交互 | 描述 | admin | dormHead | student | 权限检查 | 业务规则 |
|------|------|-------|----------|---------|----------|----------|
| CreateDormitory | 创建宿舍 | ✅ | ❌ | ❌ | 仅管理员 | 容量4-6人 |
| AssignDormHead | 指定宿舍长 | ✅ | ❌ | ❌ | 仅管理员 | 目标用户必须在该宿舍 |
| AssignUserToDormitory | 分配用户到宿舍 | ✅ | ❌ | ❌ | 仅管理员 | 用户未分配；宿舍未满 |
| CreateDeductionRule | 创建扣分规则 | ✅ | ❌ | ❌ | 仅管理员 | 扣分值>0 |
| DeductPoints | 扣分 | ❌ | ✅ | ❌ | 宿舍长权限 | 只能扣本宿舍成员；积分不能为负 |
| RequestUserRemoval | 申请踢出用户 | ❌ | ✅ | ❌ | 宿舍长权限 | 目标用户积分<60；同宿舍 |
| ProcessRemovalRequest | 处理踢出申请 | ✅ | ❌ | ❌ | 仅管理员 | 申请状态为pending |
| ViewDormitoryInfo | 查看宿舍信息 | ✅ | ✅ | ✅ | 学生只能看自己宿舍 | - |
| ViewMyScore | 查看个人积分 | ❌ | ❌ | ✅ | 只能看自己 | - |

## 权限控制实现策略

### Stage 1: 核心业务逻辑
- 所有交互先实现基本功能，不加权限控制
- 确保数据关系正确建立
- 确保计算属性正确更新

### Stage 2: 权限和业务规则
- 为每个交互添加 `condition` 检查
- 权限检查：基于用户角色
- 业务规则：基于数据状态和约束

## 详细权限说明

### 1. CreateDormitory
- **权限**: `user.role === 'admin'`
- **业务规则**: `payload.capacity >= 4 && payload.capacity <= 6`

### 2. AssignDormHead
- **权限**: `user.role === 'admin'`
- **业务规则**: 
  - 目标用户存在
  - 目标用户已分配到指定宿舍
  - 该宿舍当前无宿舍长

### 3. AssignUserToDormitory
- **权限**: `user.role === 'admin'`
- **业务规则**:
  - 用户未分配到任何宿舍
  - 目标宿舍存在
  - 宿舍未满（currentOccupancy < capacity）

### 4. CreateDeductionRule
- **权限**: `user.role === 'admin'`
- **业务规则**: `payload.points > 0`

### 5. DeductPoints
- **权限**: `user.role === 'dormHead'`
- **业务规则**:
  - 宿舍长和目标用户在同一宿舍
  - 扣分规则存在且有效
  - 扣分后用户积分 >= 0

### 6. RequestUserRemoval
- **权限**: `user.role === 'dormHead'`
- **业务规则**:
  - 宿舍长和目标用户在同一宿舍
  - 目标用户积分 < 60
  - 目标用户状态为active

### 7. ProcessRemovalRequest
- **权限**: `user.role === 'admin'`
- **业务规则**:
  - 申请存在
  - 申请状态为pending

### 8. ViewDormitoryInfo
- **权限**: 
  - admin: 可查看任意宿舍
  - dormHead: 可查看任意宿舍
  - student: 只能查看自己的宿舍
- **业务规则**: 无

### 9. ViewMyScore
- **权限**: `user.role === 'student'`
- **业务规则**: 只能查看自己的积分信息

## 测试用例覆盖

每个交互都有对应的测试用例：
1. **正常流程测试**（Stage 1）：验证功能正确性
2. **权限测试**（Stage 2）：验证权限控制
3. **业务规则测试**（Stage 2）：验证业务约束

## 错误处理

当权限或业务规则验证失败时：
- 返回统一的错误格式
- 包含错误类型和描述信息
- 不执行任何数据修改操作 